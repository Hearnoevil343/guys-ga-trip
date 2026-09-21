// build-map.mjs — GA Gold Trip interactive map builder.
// Reads every map/data/*.json and *.geojson, inlines it into one self-contained
// map/trip-map.html (Leaflet via CDN, no bundler, no npm deps), and writes
// map/trip.gpx for offline use. Re-run any time source data changes:
//   node map/build-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const UA = 'ga-gold-trip-map/1.0 (https://github.com/Hearnoevil343/guys-ga-trip)';
const VOGEL = { lat: 34.7660, lng: -83.9240 }; // per task spec, for directions links

// ---------------------------------------------------------------------------
// 1. Load every data file, sorting by shape.
// ---------------------------------------------------------------------------
const files = fs.existsSync(DATA_DIR)
  ? fs.readdirSync(DATA_DIR).filter(f => (f.endsWith('.json') || f.endsWith('.geojson')))
  : [];

let points = [];        // flat array of point-schema objects (core.json, spots.json, ...)
let overnights = [];    // array of overnight-schema objects (overnight-*.json)
let geoLayers = [];     // [{name, data(FeatureCollection)}]
let photoCache = {};    // id -> [{thumb,page,credit}]
let itinerary = null;   // itinerary-v1 schema object (itinerary.json) — superseded by days-v1, kept loaded but unrendered
let daysData = null;    // days-v1 schema object (days.json) — the real day-by-day route

function isPointArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && typeof arr[0].lat === 'number' && typeof arr[0].lng === 'number' && !arr[0].trailhead;
}
function isOvernightArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && !!arr[0].trailhead;
}

for (const f of files) {
  const full = path.join(DATA_DIR, f);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { console.warn('skip (bad json):', f, e.message); continue; }

  if (f === 'photo-cache.json') { photoCache = raw; continue; }
  if (raw && raw.schema === 'itinerary-v1') { itinerary = raw; continue; }
  if (raw && raw.schema === 'days-v1') { daysData = raw; continue; }

  if (f.endsWith('.geojson') || (raw && raw.type === 'FeatureCollection')) {
    geoLayers.push({ name: path.basename(f, path.extname(f)), data: raw });
    continue;
  }
  if (isOvernightArray(raw)) { overnights = overnights.concat(raw); continue; }
  if (isPointArray(raw)) { points = points.concat(raw.map(p => ({ ...p, __src: f }))); continue; }
  console.warn('skip (unrecognized shape):', f);
}

// ---------------------------------------------------------------------------
// 1b. Chain-consistency assertion for days.json: the end of day N must be the
//     same place as the start of day N+1. _build_days.mjs already checks this
//     at generation time, but the BUILD re-asserts it against whatever
//     days.json actually is on disk right now, in case it was hand-edited.
// ---------------------------------------------------------------------------
function haversineMetersBuild(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
if (daysData && Array.isArray(daysData.days)) {
  const days = daysData.days.slice().sort((a, b) => a.day - b.day);
  let chainOk = true;
  for (let i = 0; i < days.length - 1; i++) {
    const end = days[i].end, start = days[i + 1].start;
    if (!end || !start || typeof end.lat !== 'number' || typeof start.lat !== 'number') continue;
    const d = haversineMetersBuild(end.lat, end.lng, start.lat, start.lng);
    if (end.ref !== start.ref || d > 5) {
      chainOk = false;
      console.warn(`WARNING: days.json chain break — day ${days[i].day} end (${end.ref}) is ${d.toFixed(0)} m from day ${days[i + 1].day} start (${start.ref}).`);
    }
  }
  console.log(chainOk ? `days.json chain check OK across ${days.length} day(s).` : 'days.json chain check FAILED — see warnings above.');
} else {
  console.warn('No days.json (schema days-v1) loaded — the day-chaining map layer will be empty.');
}

// Drop entries with unresolved/null coordinates (some source files are still
// mid-research and mark an unverified location with lat/lng: null rather than
// omitting the field) rather than crashing the page at runtime.
const numOK = v => typeof v === 'number' && Number.isFinite(v);
const droppedPoints = points.filter(p => !numOK(p.lat) || !numOK(p.lng));
points = points.filter(p => numOK(p.lat) && numOK(p.lng));
for (const o of overnights) {
  if (o.trailhead && !(numOK(o.trailhead.lat) && numOK(o.trailhead.lng))) o.trailhead = null;
  o.camps = (o.camps || []).filter(c => numOK(c.lat) && numOK(c.lng));
  o.pan_reaches = (o.pan_reaches || []).filter(r => numOK(r.lat) && numOK(r.lng));
  o.route_coords = (o.route_coords || []).filter(c => Array.isArray(c) && numOK(c[0]) && numOK(c[1]));
}
const droppedOvernights = overnights.filter(o => !o.trailhead && o.camps.length === 0 && o.pan_reaches.length === 0);
overnights = overnights.filter(o => o.trailhead || o.camps.length || o.pan_reaches.length);

console.log(`Loaded ${points.length} points, ${overnights.length} overnight routes, ${geoLayers.length} geo layers from ${files.length} files.`);
if (droppedPoints.length) console.log(`  Skipped ${droppedPoints.length} point(s) with unresolved (null) coordinates: ${droppedPoints.map(p => p.id).join(', ')}`);
if (droppedOvernights.length) console.log(`  Skipped ${droppedOvernights.length} overnight route(s) with no resolved coordinates: ${droppedOvernights.map(o => o.id).join(', ')}`);

// ---------------------------------------------------------------------------
// 2. Fill in missing photos from Wikimedia Commons geosearch (build-time),
//    caching results in map/data/photo-cache.json so re-runs are fast/free.
// ---------------------------------------------------------------------------
async function geosearchPhotos(lat, lng) {
  try {
    const gsUrl = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', list: 'geosearch', gscoord: `${lat}|${lng}`, gsradius: '1500',
      gsnamespace: '6', gslimit: '3', format: 'json',
    });
    const gsRes = await fetch(gsUrl, { headers: { 'User-Agent': UA } });
    const gsJson = await gsRes.json();
    const results = (gsJson.query && gsJson.query.geosearch) || [];
    if (!results.length) return [];
    const iiUrl = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', titles: results.map(r => r.title).join('|'), prop: 'imageinfo',
      iiprop: 'url|extmetadata', iiurlwidth: '480', format: 'json',
    });
    const iiRes = await fetch(iiUrl, { headers: { 'User-Agent': UA } });
    const iiJson = await iiRes.json();
    const pages = (iiJson.query && iiJson.query.pages) || {};
    const out = [];
    for (const pid in pages) {
      const p = pages[pid];
      if (p.imageinfo && p.imageinfo[0]) {
        const ii = p.imageinfo[0];
        const artist = ii.extmetadata && ii.extmetadata.Artist ? String(ii.extmetadata.Artist.value).replace(/<[^>]+>/g, '') : '';
        const lic = ii.extmetadata && ii.extmetadata.LicenseShortName ? ii.extmetadata.LicenseShortName.value : 'Wikimedia Commons';
        out.push({ thumb: ii.thumburl || ii.url, page: ii.descriptionurl, credit: (artist ? artist + ' — ' : '') + lic });
      }
    }
    return out;
  } catch (e) {
    console.warn('  photo geosearch failed for', lat, lng, e.message);
    return [];
  }
}

let cacheDirty = false;
for (const p of points) {
  const hasOwnPhotos = Array.isArray(p.photos) && p.photos.length > 0;
  if (hasOwnPhotos) continue;
  if (photoCache[p.id]) { p.photos = photoCache[p.id]; continue; }
  console.log('  fetching Commons photos for', p.id);
  const photos = await geosearchPhotos(p.lat, p.lng);
  photoCache[p.id] = photos;
  p.photos = photos;
  cacheDirty = true;
  await new Promise(r => setTimeout(r, 350));
}
if (cacheDirty) {
  fs.writeFileSync(path.join(DATA_DIR, 'photo-cache.json'), JSON.stringify(photoCache, null, 2));
  console.log('Updated photo-cache.json');
}

// ---------------------------------------------------------------------------
// 3. Normalize points: tier as string, type as a lower/hyphen key.
// ---------------------------------------------------------------------------
function normType(t) {
  return String(t || 'other').toLowerCase().replace(/_/g, '-');
}
for (const p of points) {
  p._type = normType(p.type);
  p._tier = p.tier == null ? '' : String(p.tier);
}

// ---------------------------------------------------------------------------
// 3b. Legality guard — point-in-polygon every pan spot, pan reach, camp and
//     trailhead against wilderness.geojson (Wilderness areas + state parks).
//     Attaches `_insideWilderness` (containing polygon name, or null) so the
//     HTML can show a red "INSIDE WILDERNESS/STATE PARK — NO PANNING" banner,
//     and prints every hit to the build log.
// ---------------------------------------------------------------------------
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygonGeom(lng, lat, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    if (!pointInRing(lng, lat, geom.coordinates[0])) return false;
    // holes: if inside any interior ring, treat as outside
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInRing(lng, lat, geom.coordinates[i])) return false;
    }
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => pointInPolygonGeom(lng, lat, { type: 'Polygon', coordinates: poly }));
  }
  return false;
}
const wildernessLayers = geoLayers.filter(g => /wilderness/i.test(g.name));
const wildernessFeatures = wildernessLayers.flatMap(g => (g.data && g.data.features) || []);
function insideWilderness(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  for (const f of wildernessFeatures) {
    if (pointInPolygonGeom(lng, lat, f.geometry)) return (f.properties && f.properties.name) || 'wilderness/park boundary';
  }
  return null;
}
const wildernessHits = [];
function checkAndTag(obj, label) {
  if (!obj || typeof obj.lat !== 'number' || typeof obj.lng !== 'number') return;
  const hit = insideWilderness(obj.lat, obj.lng);
  obj._insideWilderness = hit;
  if (hit) wildernessHits.push(`${label} -> ${hit} (${obj.lat}, ${obj.lng})`);
}
for (const p of points) checkAndTag(p, p.name || p.id);
for (const o of overnights) {
  checkAndTag(o.trailhead, `${o.name} — Trailhead`);
  for (const c of (o.camps || [])) checkAndTag(c, `${o.name} — Camp: ${c.name}`);
  for (const r of (o.pan_reaches || [])) checkAndTag(r, `${o.name} — Pan reach: ${r.name}`);
}
console.log(`Legality guard: checked ${points.length} points + ${overnights.reduce((n, o) => n + 1 + (o.camps || []).length + (o.pan_reaches || []).length, 0)} overnight trailhead/camp/pan-reach points against ${wildernessFeatures.length} wilderness/state-park polygon(s).`);
if (wildernessHits.length) {
  console.log(`  INSIDE a no-panning boundary (${wildernessHits.length}):`);
  for (const h of wildernessHits) console.log('   - ' + h);
} else {
  console.log('  No points fell inside a mapped Wilderness/state-park polygon.');
}
// Explicit report requested for the Dockery Lake ~3.0 mi campsite and every
// overnight pan reach, specifically against Blood Mountain Wilderness.
const dockery = overnights.find(o => o.id === 'dockery-lake-trail');
if (dockery) {
  const camp = (dockery.camps || [])[0];
  console.log(`Dockery Lake Trail ~3.0 mi campsite: ${camp ? (camp._insideWilderness ? 'INSIDE ' + camp._insideWilderness : 'outside all mapped Wilderness/state-park polygons') : 'no camp coordinate loaded'}.`);
  for (const r of (dockery.pan_reaches || [])) {
    console.log(`  Dockery pan reach "${r.name}": ${r._insideWilderness ? 'INSIDE ' + r._insideWilderness : 'outside all mapped Wilderness/state-park polygons'}.`);
  }
}
for (const o of overnights) {
  for (const r of (o.pan_reaches || [])) {
    console.log(`Overnight pan reach — ${o.name} / "${r.name}": ${r._insideWilderness ? 'INSIDE ' + r._insideWilderness : 'outside all mapped Wilderness/state-park polygons'}.`);
  }
}

// Run the same point-in-polygon legality guard against water.geojson: for
// each creek/river feature, tag it with the name of any wilderness/state-park
// polygon that contains AT LEAST ONE vertex of its line geometry (a creek can
// cross a boundary; a partial hit still means part of that reach is inside a
// no-panning area, which matters just as much as a fully-enclosed point).
const waterLayers = geoLayers.filter(g => /^water$/i.test(g.name));
let waterHitCount = 0;
for (const layer of waterLayers) {
  for (const f of (layer.data && layer.data.features) || []) {
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
      : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : [];
    let hitName = null, hitVerts = 0, totalVerts = 0;
    for (const line of lines) {
      for (const [lng, lat] of line) {
        totalVerts++;
        const hit = insideWilderness(lat, lng);
        if (hit) { hitVerts++; if (!hitName) hitName = hit; }
      }
    }
    f.properties._insideWilderness = hitName;
    f.properties._insideWildernessFraction = totalVerts ? hitVerts / totalVerts : 0;
    if (hitName) {
      waterHitCount++;
      const frac = totalVerts ? Math.round(100 * hitVerts / totalVerts) : 0;
      console.log(`  Water feature "${f.properties.name}": ${frac}% of its mapped length falls INSIDE ${hitName}.`);
    }
  }
}
console.log(`Legality guard (water): checked ${waterLayers.reduce((n, g) => n + ((g.data && g.data.features) || []).length, 0)} creek/river feature(s), ${waterHitCount} with at least one vertex inside a no-panning boundary.`);

// ---------------------------------------------------------------------------
// 4. GPX export — every point + every overnight trailhead/camp/pan_reach as a
//    waypoint, plus route_coords as a track, for Gaia GPS / CalTopo / OnX.
// ---------------------------------------------------------------------------
function gpxEscape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wpt(lat, lng, name, desc) {
  return `  <wpt lat="${lat}" lon="${lng}"><name>${gpxEscape(name)}</name>${desc ? `<desc>${gpxEscape(desc)}</desc>` : ''}</wpt>`;
}
let gpxParts = [];
for (const p of points) {
  gpxParts.push(wpt(p.lat, p.lng, p.name, p.access || p.legality || ''));
}
for (const o of overnights) {
  if (o.trailhead) gpxParts.push(wpt(o.trailhead.lat, o.trailhead.lng, `${o.name} — Trailhead`, o.land_status || ''));
  for (const c of (o.camps || [])) gpxParts.push(wpt(c.lat, c.lng, `${o.name} — Camp: ${c.name}`, ''));
  for (const r of (o.pan_reaches || [])) gpxParts.push(wpt(r.lat, r.lng, `${o.name} — Pan: ${r.name}`, o.gold_evidence || ''));
}
let gpxTracks = [];
for (const o of overnights) {
  if (Array.isArray(o.route_coords) && o.route_coords.length > 1) {
    const pts = o.route_coords.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join('\n');
    gpxTracks.push(`  <trk><name>${gpxEscape(o.name)}</name><trkseg>\n${pts}\n    </trkseg></trk>`);
  }
}
// Day routes: one GPX track per day, one trkseg per drive/walk leg (in order),
// so the real day-by-day chain is usable offline in Gaia GPS / CalTopo / OnX.
if (daysData && Array.isArray(daysData.days)) {
  let dayTracksAdded = 0, dayTracksSkipped = [];
  for (const day of daysData.days.slice().sort((a, b) => a.day - b.day)) {
    const segs = [];
    for (const leg of day.legs || []) {
      if ((leg.type !== 'drive' && leg.type !== 'walk') || !Array.isArray(leg.coords) || leg.coords.length < 2) continue;
      const pts = leg.coords.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join('\n');
      segs.push(`    <trkseg>\n${pts}\n    </trkseg>`);
    }
    if (segs.length) {
      const name = `Day ${day.day}`;
      const desc = `${day.date} — ${day.title}`;
      gpxTracks.push(`  <trk><name>${gpxEscape(name)}</name><desc>${gpxEscape(desc)}</desc>\n${segs.join('\n')}\n  </trk>`);
      dayTracksAdded++;
    } else {
      dayTracksSkipped.push(day.day);
    }
  }
  console.log(`Added ${dayTracksAdded} day track(s) to trip.gpx (of ${daysData.days.length} days).` + (dayTracksSkipped.length ? ` Day(s) with no drive/walk legs, so no track: ${dayTracksSkipped.join(', ')}.` : ''));
}
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ga-gold-trip build-map.mjs" xmlns="http://www.topografix.com/GPX/1/1">
${gpxParts.join('\n')}
${gpxTracks.join('\n')}
</gpx>
`;
fs.writeFileSync(path.join(__dirname, 'trip.gpx'), gpx);
console.log(`Wrote trip.gpx with ${gpxParts.length} waypoints, ${gpxTracks.length} tracks.`);

// ---------------------------------------------------------------------------
// 5. Build the self-contained HTML.
// ---------------------------------------------------------------------------
const TYPE_STYLE = {
  'base-camp':          { color: '#d62728', icon: '⛺', label: 'Base camp' },
  'visitor-center':     { color: '#7f7f7f', icon: 'ℹ️', label: 'Visitor center' },
  'parking':            { color: '#7f7f7f', icon: 'P',  label: 'Parking' },
  'overnight-trailhead':{ color: '#8c564b', icon: '🥾', label: 'Overnight trailhead' },
  'town-supplies':      { color: '#1f77b4', icon: '🏪', label: 'Town / supplies' },
  'hospital':           { color: '#e377c2', icon: '➕', label: 'Hospital / ER' },
  'ranger-station':     { color: '#2ca02c', icon: '🌲', label: 'Ranger station' },
  'drive-up':           { color: '#2ca02c', icon: '🚗', label: 'Drive-up pan spot' },
  'drive-up-pan':       { color: '#2ca02c', icon: '🚗', label: 'Drive-up pan spot' },
  'walk-in':            { color: '#ff7f0e', icon: '🥾', label: 'Walk-in pan spot' },
  'walk-in-pan':        { color: '#ff7f0e', icon: '🥾', label: 'Walk-in pan spot' },
  'club-claim':         { color: '#9467bd', icon: '🔒', label: 'Club claim' },
  'pay-to-pan':         { color: '#bcbd22', icon: '💰', label: 'Pay-to-pan' },
  'history-site':       { color: '#17becf', icon: '🏛️', label: 'History site' },
  'public-park':        { color: '#1f77b4', icon: '🏞️', label: 'Public park' },
  'excluded':           { color: '#000000', icon: '🚫', label: 'No panning / excluded' },
  'other':              { color: '#555555', icon: '📍', label: 'Other' },
};
const OVERNIGHT_STYLE = { color: '#8c564b', icon: '🎒', label: 'Overnight route' };

const dataBlock = {
  points, overnights,
  geoLayers: geoLayers.map(g => ({ name: g.name, data: g.data })),
  typeStyle: TYPE_STYLE, overnightStyle: OVERNIGHT_STYLE, vogel: VOGEL,
  itinerary, days: daysData,
};
const DATA_JSON = JSON.stringify(dataBlock);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GA Gold Trip Map — Vogel State Park, Oct 15-21 2026</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body { margin:0; padding:0; height:100%; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  #app { display:flex; height:100vh; width:100vw; }
  #map { flex: 1 1 auto; height: 100%; }
  #panel { width: 340px; min-width: 300px; max-width: 40vw; height: 100%; overflow-y: auto; background:#fafafa; border-left:1px solid #ccc; box-sizing:border-box; }
  #panel h1 { font-size: 16px; margin: 10px 12px 4px; }
  #panel .sub { font-size: 12px; color:#555; margin: 0 12px 8px; }
  #filters { margin: 0 12px 8px; }
  #filters label { display:block; font-size:12px; margin:2px 0; cursor:pointer; }
  #searchbox { width: calc(100% - 24px); margin: 0 12px 8px; padding:5px; box-sizing:border-box; }
  #list { list-style:none; margin:0; padding:0; }
  #list li { padding:8px 12px; border-bottom:1px solid #e5e5e5; cursor:pointer; font-size:13px; }
  #list li:hover { background:#eef4ff; }
  #list li .name { font-weight:600; }
  #list li .meta { color:#666; font-size:11px; }
  .legend-sw { display:inline-block; width:12px; height:12px; border-radius:50%; margin-right:5px; vertical-align:middle; }
  .popup-photos img { width: 90px; height: 68px; object-fit: cover; margin: 2px 3px 2px 0; border-radius:3px; }
  .popup-links a { display:inline-block; margin-right:8px; font-size:12px; }
  .leaflet-popup-content { font-size: 13px; max-width: 260px; }
  .leaflet-popup-content h3 { margin: 2px 0 4px; font-size: 14px; }
  .leaflet-popup-content .row { margin: 3px 0; }
  .leaflet-popup-content .lbl { font-weight:600; }
  #legend { position:absolute; bottom:16px; left:16px; z-index:1000; background:#fff; padding:8px 10px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.4); font-size:12px; max-height: 40vh; overflow-y:auto; }
  #legend h4 { margin:0 0 4px; font-size:12px; }
  #legend div { margin: 1px 0; }

  /* ---- day strip control (on the map) ---- */
  .day-strip { background:#fff; padding:6px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.4); display:flex; gap:4px; }
  .day-strip button { border:1px solid #999; background:#f4f4f4; border-radius:4px; padding:5px 9px; font-size:12px; cursor:pointer; font-weight:600; color:#333; }
  .day-strip button:hover { background:#e2ecff; }
  .day-strip button.active { background:#2255aa; color:#fff; border-color:#2255aa; }
  .day-strip .hint { font-size:10px; color:#777; align-self:center; margin-left:4px; display:none; }
  @media (min-width: 700px) { .day-strip .hint { display:inline; } }

  /* ---- day / leg panel (top of the sidebar) ---- */
  #daySection { border-bottom: 2px solid #ccc; padding-bottom: 8px; margin-bottom: 6px; }
  #daySection h2 { font-size: 14px; margin: 8px 12px 2px; }
  #daySection .day-sub { font-size: 11px; color:#555; margin: 0 12px 6px; }
  #dayHint { font-size: 12px; color: #777; margin: 6px 12px; font-style: italic; }
  .leg-list { list-style:none; margin:0; padding: 0 12px; }
  .leg-row { display:flex; align-items:flex-start; gap:7px; padding:6px 0; border-bottom:1px dashed #ddd; font-size:12px; }
  .leg-row .ic { flex: 0 0 20px; font-size:15px; text-align:center; }
  .leg-row .body { flex: 1 1 auto; }
  .leg-row .lbl { font-weight:600; }
  .leg-row .meta { color:#666; font-size:11px; margin-top:1px; }
  .approx-tag { display:inline-block; background:#fff3cd; color:#7a5b00; border:1px solid #e6c260; border-radius:3px; padding:0 4px; font-size:10px; font-weight:700; margin-left:5px; }
  .gravel-tag { display:inline-block; background:#e3edff; color:#1a4a8a; border:1px solid #9fc2ff; border-radius:3px; padding:0 4px; font-size:10px; font-weight:700; margin-left:5px; }
  .day-nav-row { display:flex; align-items:center; gap:6px; margin:8px 12px 2px; }
  .day-nav-row h3 { margin:0; flex:1 1 auto; font-size:14px; }
  .panel-nav-btn { flex:0 0 auto; border:1px solid #999; background:#f4f4f4; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer; color:#333; white-space:nowrap; }
  .panel-nav-btn:hover { background:#e2ecff; }
  .cross-check-note { margin:6px 12px; padding:6px 8px; background:#fff3cd; border:1px solid #e6c260; border-radius:5px; font-size:11px; color:#7a5b00; }
  .day-totals { margin: 8px 12px 4px; padding: 7px 8px; background:#eef4ff; border-radius:5px; font-size:12px; line-height:1.5; }
  .day-totals b { display:block; font-size:12px; margin-bottom:2px; }
  .chain-btn { display:block; width:100%; margin-top:6px; padding:7px 8px; background:#2255aa; color:#fff; border:none; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; }
  .chain-btn:hover { background:#173d7a; }
  .chain-btn.back { background:#555; }
  .chain-btn.back:hover { background:#333; }
</style>
</head>
<body>
<div id="app">
  <div id="map"></div>
  <div id="panel">
    <h1>GA Gold Trip — Oct 15&ndash;21 2026</h1>
    <div class="sub">Vogel State Park base camp, Blairsville GA. Click a marker or list item for details.</div>
    <div id="daySection">
      <h2>Day plan</h2>
      <div class="day-sub">Pick a day on the map (top-left) or below to see its real route, distances and times.</div>
      <div id="dayHint">No day selected — showing every day's route at once. Pick a day for turn-by-turn legs and totals.</div>
      <div id="dayBody"></div>
    </div>
    <input id="searchbox" placeholder="Search by name...">
    <div id="filters"></div>
    <ul id="list"></ul>
  </div>
</div>
<div id="legend"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/esri-leaflet@3.0.12/dist/esri-leaflet.js"></script>
<script>
const DATA = ${DATA_JSON};

// ---- map & base layers ----
const map = L.map('map', { zoomControl: true }).setView([34.78, -83.95], 10);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
});
const opentopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)', maxZoom: 17,
});
const usgsTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'USGS National Map', maxZoom: 16,
});
const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Esri World Imagery', maxZoom: 19,
});

opentopo.addTo(map);

const baseLayers = {
  'OpenTopoMap': opentopo,
  'USGS Topo': usgsTopo,
  'Esri World Imagery (satellite)': esriImagery,
  'OpenStreetMap': osm,
};

// ---- overlay: USFS land ownership (EDW dynamic map service) ----
let usfsOwnership = null;
try {
  usfsOwnership = L.esri.dynamicMapLayer({
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer',
    opacity: 0.45,
  });
} catch (e) { console.warn('USFS ownership layer failed to init', e); }

// ---- overlay: wilderness / no-panning polygons, and trail/route lines, from GeoJSON files ----
const overlayLayers = {};
const TRAIL_COLORS = { trail: '#8c564b', waterway: '#1f77b4', road: '#555555' };
let waterOverlay = null;
for (const layer of DATA.geoLayers) {
  if (!layer.data || !layer.data.features) continue;
  const isWilderness = /wilderness/i.test(layer.name);
  const isWater = /^water$/i.test(layer.name);
  const isTrails = /trail/i.test(layer.name) && !isWilderness;
  let gj;
  if (isWater) {
    gj = L.geoJSON(layer.data, {
      style: f => {
        const inside = f.properties && f.properties._insideWilderness;
        return { color: inside ? '#b30000' : '#1f77b4', weight: 3.5, opacity: 0.9, dashArray: null };
      },
      onEachFeature: (f, lyr) => {
        const name = (f.properties && (f.properties.label || f.properties.name)) || layer.name;
        lyr.bindTooltip(name, { sticky: true });
        let h = '';
        if (f.properties && f.properties._insideWilderness) {
          const pct = Math.round((f.properties._insideWildernessFraction || 0) * 100);
          h += wildernessBanner(f.properties._insideWilderness) + '<div style="font-size:11px;color:#900;margin-bottom:4px;">~' + pct + '% of this mapped reach falls inside the boundary.</div>';
        }
        h += '<b>' + escHtml(name) + '</b>' + (f.properties && f.properties.coord_source ? '<div style="font-size:11px;color:#555;margin-top:4px;">' + escHtml(f.properties.coord_source) + '</div>' : '');
        lyr.bindPopup(h);
      },
    });
  } else if (isTrails) {
    gj = L.geoJSON(layer.data, {
      style: f => {
        const cat = (f.properties && f.properties.category) || 'trail';
        return { color: TRAIL_COLORS[cat] || '#8c564b', weight: cat === 'waterway' ? 3 : 4, dashArray: cat === 'waterway' ? '2,5' : null, opacity: 0.85 };
      },
      onEachFeature: (f, lyr) => {
        const name = (f.properties && (f.properties.label || f.properties.name)) || layer.name;
        lyr.bindTooltip(name, { sticky: true });
        lyr.bindPopup('<b>' + escHtml(name) + '</b>' + (f.properties && f.properties.coord_source ? '<div style="font-size:11px;color:#555;margin-top:4px;">' + escHtml(f.properties.coord_source) + '</div>' : ''));
      },
    });
  } else {
    gj = L.geoJSON(layer.data, {
      style: f => ({
        color: '#b30000', weight: 2, fillColor: '#ff0000', fillOpacity: 0.25,
      }),
      onEachFeature: (f, lyr) => {
        const name = (f.properties && f.properties.name) || layer.name;
        lyr.bindPopup('<b>' + name + '</b><br>NO PANNING' + (f.properties && f.properties.kind ? ' (' + f.properties.kind + ')' : ''));
      },
    });
  }
  const label = layer.name + (isWilderness ? ' (NO PANNING)' : (isWater ? ' (Creeks & rivers)' : (isTrails ? ' (trails)' : '')));
  overlayLayers[label] = gj;
  if (isWater) waterOverlay = gj;
}

for (const k in overlayLayers) {
  // default on: wilderness boundaries, trail lines and creeks are all useful context immediately
  if (/NO PANNING|trails|Creeks & rivers/i.test(k)) overlayLayers[k].addTo(map);
}
if (usfsOwnership) overlayLayers['USFS land ownership'] = usfsOwnership;

const layersControl = L.control.layers(baseLayers, overlayLayers, { collapsed: true }).addTo(map);

// ---- markers ----
function dirLink(lat, lng) {
  return 'https://www.google.com/maps/dir/?api=1&origin=' + DATA.vogel.lat + ',' + DATA.vogel.lng + '&destination=' + lat + ',' + lng;
}
function svLink(lat, lng) {
  return 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng;
}
function gmLink(lat, lng) {
  return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng;
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function row(label, val) {
  if (val == null || val === '') return '';
  return '<div class="row"><span class="lbl">' + label + ':</span> ' + escHtml(val) + '</div>';
}
function photosHtml(photos) {
  if (!photos || !photos.length) return '';
  let out = '<div class="popup-photos">';
  for (const p of photos.slice(0,3)) {
    out += '<a href="' + p.page + '" target="_blank" title="' + escHtml(p.credit||'') + '"><img src="' + p.thumb + '"></a>';
  }
  out += '</div>';
  return out;
}
function wildernessBanner(insideName) {
  if (!insideName) return '';
  return '<div style="background:#b30000;color:#fff;font-weight:700;padding:5px 7px;border-radius:4px;margin-bottom:6px;">INSIDE WILDERNESS/STATE PARK — NO PANNING<div style="font-weight:400;font-size:11px;">(' + escHtml(insideName) + ')</div></div>';
}
function popupHtml(p) {
  let h = wildernessBanner(p._insideWilderness);
  h += '<h3>' + escHtml(p.name) + '</h3>';
  h += row('Type', (DATA.typeStyle[p._type] ? DATA.typeStyle[p._type].label : p._type) + (p._tier ? ' — tier ' + p._tier : ''));
  h += row('Access', p.access);
  h += row('Legality', p.legality);
  h += row('Gold record', p.gold_record);
  h += row('Pressure', p.pressure);
  h += row('Tips', p.target_tips);
  h += row('Fees', p.fees);
  h += row('Drive from Vogel', p.drive_min_from_vogel != null ? p.drive_min_from_vogel + ' min' : null);
  h += row('Coord confidence', p.coord_confidence);
  h += row('Notes', p.notes);
  h += photosHtml(p.photos);
  h += '<div class="popup-links">' +
    '<a href="' + dirLink(p.lat, p.lng) + '" target="_blank">Directions from Vogel</a>' +
    '<a href="' + svLink(p.lat, p.lng) + '" target="_blank">Street View</a>' +
    '<a href="' + gmLink(p.lat, p.lng) + '" target="_blank">Open in Google Maps</a>' +
    '</div>';
  return h;
}

const markerLayer = L.layerGroup().addTo(map);
const markersById = {};
const allTypes = new Set();

function iconFor(styleKey) {
  const s = DATA.typeStyle[styleKey] || DATA.typeStyle.other;
  return L.divIcon({
    html: '<div style="background:' + s.color + ';color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);">' + s.icon + '</div>',
    className: '', iconSize: [26,26], iconAnchor: [13,13], popupAnchor: [0,-13],
  });
}

for (const p of DATA.points) {
  allTypes.add(p._type);
  const m = L.marker([p.lat, p.lng], { icon: iconFor(p._type) }).bindPopup(popupHtml(p));
  m.__type = p._type;
  m.__point = p;
  m.addTo(markerLayer);
  markersById[p.id] = m;
}

// overnight routes: trailhead / camps / pan reaches as markers + polyline
const overnightIcon = L.divIcon({
  html: '<div style="background:' + DATA.overnightStyle.color + ';color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);">' + DATA.overnightStyle.icon + '</div>',
  className: '', iconSize: [26,26], iconAnchor: [13,13], popupAnchor: [0,-13],
});
for (const o of DATA.overnights) {
  allTypes.add('overnight-route');
  if (o.trailhead) {
    const m = L.marker([o.trailhead.lat, o.trailhead.lng], { icon: overnightIcon });
    let h = wildernessBanner(o.trailhead._insideWilderness);
    h += '<h3>' + escHtml(o.name) + ' — Trailhead</h3>';
    h += row('Rank', o.rank);
    h += row('Creek', o.creek);
    h += row('One-way mi', o.one_way_mi);
    h += row('Elevation gain', o.gain_ft ? o.gain_ft + ' ft' : null);
    h += row('Drive from Vogel', o.drive_min_from_vogel != null ? o.drive_min_from_vogel + ' min' : null);
    h += row('Land status', o.land_status);
    h += row('Gold evidence', o.gold_evidence);
    h += row('Hazards', o.hazards);
    h += row('Pressure', o.pressure);
    h += row('Notes', o.notes);
    h += photosHtml(o.photos);
    h += '<div class="popup-links"><a href="' + dirLink(o.trailhead.lat, o.trailhead.lng) + '" target="_blank">Directions from Vogel</a>' +
      '<a href="' + svLink(o.trailhead.lat, o.trailhead.lng) + '" target="_blank">Street View</a>' +
      '<a href="' + gmLink(o.trailhead.lat, o.trailhead.lng) + '" target="_blank">Open in Google Maps</a></div>';
    m.bindPopup(h);
    m.__type = 'overnight-route';
    m.__point = { id: o.id + '-trailhead', name: o.name + ' (Trailhead)', lat: o.trailhead.lat, lng: o.trailhead.lng, _type: 'overnight-route' };
    m.addTo(markerLayer);
    markersById[o.id + '-trailhead'] = m;
  }
  for (const c of (o.camps || [])) {
    const m = L.marker([c.lat, c.lng], { icon: overnightIcon }).bindPopup(wildernessBanner(c._insideWilderness) + '<h3>' + escHtml(o.name) + ' — Camp</h3>' + row('Site', c.name) + '<div class="popup-links"><a href="' + dirLink(c.lat,c.lng) + '" target="_blank">Directions from Vogel</a></div>');
    m.__type = 'overnight-route';
    m.addTo(markerLayer);
  }
  for (const r of (o.pan_reaches || [])) {
    const m = L.marker([r.lat, r.lng], { icon: overnightIcon }).bindPopup(wildernessBanner(r._insideWilderness) + '<h3>' + escHtml(o.name) + ' — Pan reach</h3>' + row('Reach', r.name) + row('Gold evidence', o.gold_evidence) + '<div class="popup-links"><a href="' + dirLink(r.lat,r.lng) + '" target="_blank">Directions from Vogel</a></div>');
    m.__type = 'overnight-route';
    m.addTo(markerLayer);
  }
  if (Array.isArray(o.route_coords) && o.route_coords.length > 1) {
    L.polyline(o.route_coords, { color: DATA.overnightStyle.color, weight: 3, dashArray: '6,4' }).addTo(markerLayer);
  }
}

// ---- day-by-day route: real drive/walk legs + click-through day chaining ----
// Replaces the old crow-flies "Itinerary" layer. Each day is built as two
// parallel Leaflet layers: an "overview" line (always on the map, dims with
// everything else) and a "highlight" version (styled by leg type, with
// direction arrows and start/end chain markers) that's only shown for the
// currently selected day.
const DAY_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#009999', '#f032e6'];
const DRIVE_COLOR = '#4a4a4a';
const WALK_COLOR = '#e6550d';
const LEG_ICONS = { drive: '🚗', walk: '🥾', pan: '⛏️', tour: '🏛️' };
const DAYS = (DATA.days && Array.isArray(DATA.days.days)) ? DATA.days.days.slice().sort((a, b) => a.day - b.day) : [];

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function pointAtFraction(coords, frac) {
  if (coords.length < 2) return null;
  const segLen = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) { const d = map.distance(coords[i], coords[i + 1]); segLen.push(d); total += d; }
  if (total === 0) return { latlng: coords[0], bearing: 0 };
  const target = frac * total;
  let acc = 0;
  for (let i = 0; i < segLen.length; i++) {
    if (acc + segLen[i] >= target || i === segLen.length - 1) {
      const t = segLen[i] > 0 ? Math.min(1, Math.max(0, (target - acc) / segLen[i])) : 0;
      const a = coords[i], b = coords[i + 1];
      return { latlng: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearingDeg(a[0], a[1], b[0], b[1]) };
    }
    acc += segLen[i];
  }
  return { latlng: coords[coords.length - 1], bearing: 0 };
}
function arrowMarker(latlng, bearing, color) {
  const icon = L.divIcon({
    html: '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:13px solid ' + color + ';transform:rotate(' + bearing.toFixed(1) + 'deg);filter:drop-shadow(0 0 1px #fff);"></div>',
    className: '', iconSize: [14, 14], iconAnchor: [7, 7],
  });
  return L.marker(latlng, { icon, interactive: false, keyboard: false });
}
// className carries a real CSS class (day-start-marker / day-end-marker) so
// both the app and tests can find these reliably, instead of matching on the
// glyph text — that broke down for the "hub" marker below, which has to
// answer to both.
const startIcon = L.divIcon({
  html: '<div style="background:#2ca02c;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);">&#9654;</div>',
  className: 'day-start-marker', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
});
const endIcon = L.divIcon({
  html: '<div style="background:#b30000;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);">&#127937;</div>',
  className: 'day-end-marker', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
});
// Bug fix: when a day's start and end are the SAME physical point (every
// day that loops back to Vogel — days 1-4 and 7), separate start/end
// markers land exactly on top of each other. Whichever was added to the
// DOM last (end) permanently covered the other, so the start marker/back
// button was never clickable by a real mouse click even though it existed
// and its popup logic worked. Fixed by merging them into one "hub" marker
// carrying BOTH classes and BOTH chain buttons whenever they coincide.
const hubIcon = L.divIcon({
  html: '<div style="background:linear-gradient(135deg,#2ca02c 50%,#b30000 50%);color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);letter-spacing:-1px;">&#9654;&#127937;</div>',
  className: 'day-start-marker day-end-marker', iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
});
const SAME_SPOT_M = 15; // meters — Vogel's own coordinate is stable to well under this across days

function buildDayLayers(day) {
  const color = DAY_COLORS[(day.day - 1) % DAY_COLORS.length];
  const overview = L.layerGroup();
  const highlight = L.layerGroup();
  const bounds = L.latLngBounds([[day.start.lat, day.start.lng], [day.end.lat, day.end.lng]]);
  for (const leg of (day.legs || [])) {
    if ((leg.type === 'drive' || leg.type === 'walk') && Array.isArray(leg.coords) && leg.coords.length > 1) {
      leg.coords.forEach(c => bounds.extend(c));
      L.polyline(leg.coords, { color, weight: 3, opacity: 0.75 }).addTo(overview);
      const isApprox = leg.geometry_confidence === 'approximate';
      const baseColor = leg.type === 'drive' ? DRIVE_COLOR : WALK_COLOR;
      const isRetimed = leg.type === 'drive' && leg.timing_confidence === 'estimated';
      const pl = L.polyline(leg.coords, {
        color: baseColor, weight: leg.type === 'drive' ? 4 : 6, opacity: 0.95, dashArray: isApprox ? '3,8' : null,
      }).addTo(highlight);
      let popupHtml = '<b>' + escHtml(leg.label) + '</b>' + row('Type', leg.type) + row('Distance', leg.miles + ' mi');
      if (isRetimed) {
        popupHtml += row('Time (gravel est.)', leg.minutes + ' min') + row('OSRM raw time', leg.minutes_osrm_raw + ' min');
      } else {
        popupHtml += row('Time', leg.minutes + ' min');
      }
      popupHtml += (leg.gain_ft ? row('Gain', leg.gain_ft + ' ft') : '');
      if (isApprox) popupHtml += '<div style="font-size:11px;color:#7a5b00;margin-top:4px;"><b>~ approximate geometry.</b> ' + escHtml(leg.source || '') + '</div>';
      else if (isRetimed) popupHtml += '<div style="font-size:11px;color:#1a4a8a;margin-top:4px;"><b>~ gravel-speed estimate.</b> ' + escHtml(leg.timing_model || '') + '</div>';
      else popupHtml += '<div style="font-size:11px;color:#555;margin-top:4px;">' + escHtml(leg.source || '') + '</div>';
      pl.bindPopup(popupHtml);
      [0.33, 0.66].forEach(f => { const r = pointAtFraction(leg.coords, f); if (r) arrowMarker(r.latlng, r.bearing, baseColor).addTo(highlight); });
    }
  }
  const sameSpot = map.distance([day.start.lat, day.start.lng], [day.end.lat, day.end.lng]) < SAME_SPOT_M;
  const backBtn = day.day > 1 ? '<button class="chain-btn back" onclick="selectDay(' + (day.day - 1) + ')">&larr; Day ' + (day.day - 1) + ' ended here</button>' : '';
  const fwdBtn = day.day < DAYS.length ? '<button class="chain-btn" onclick="selectDay(' + (day.day + 1) + ')">Day ' + (day.day + 1) + ' starts here &rarr;</button>' : '';
  if (sameSpot) {
    const hubM = L.marker([day.start.lat, day.start.lng], { icon: hubIcon });
    let hh = '<h3>Day ' + day.day + ' starts &amp; ends here</h3>' + row('Where', day.start.label) + row('Start time', day.start.time) +
      '<div style="font-size:11px;color:#555;margin:3px 0;">Same spot both ends of the day.</div>' + backBtn + fwdBtn;
    hubM.bindPopup(hh);
    hubM.addTo(highlight);
  } else {
    const startM = L.marker([day.start.lat, day.start.lng], { icon: startIcon });
    startM.bindPopup('<h3>Day ' + day.day + ' starts here</h3>' + row('Where', day.start.label) + row('Time', day.start.time) + backBtn);
    startM.addTo(highlight);
    const endM = L.marker([day.end.lat, day.end.lng], { icon: endIcon });
    endM.bindPopup('<h3>Day ' + day.day + ' ends here</h3>' + row('Where', day.end.label) + fwdBtn);
    endM.addTo(highlight);
  }
  return { overview, highlight, bounds };
}

const dayOverviewLayers = {}, dayHighlightLayers = {}, dayBoundsById = {};
for (const day of DAYS) {
  const built = buildDayLayers(day);
  dayOverviewLayers[day.day] = built.overview;
  dayHighlightLayers[day.day] = built.highlight;
  dayBoundsById[day.day] = built.bounds;
  built.overview.addTo(map); // default "All" view: every day's real route visible at once
}

const DIM = 0.25;
function setLayerOpacity(l, dimmed) {
  try {
    if (typeof l.eachLayer === 'function') { l.eachLayer(x => setLayerOpacity(x, dimmed)); return; }
    if (l._origOpacity === undefined) l._origOpacity = (l.options && l.options.opacity != null) ? l.options.opacity : 1;
    if (l._origFillOpacity === undefined) l._origFillOpacity = (l.options && l.options.fillOpacity != null) ? l.options.fillOpacity : 0.2;
    if (typeof l.setStyle === 'function') l.setStyle({ opacity: dimmed ? DIM * l._origOpacity : l._origOpacity, fillOpacity: dimmed ? DIM * l._origFillOpacity : l._origFillOpacity });
    else if (typeof l.setOpacity === 'function') l.setOpacity(dimmed ? DIM * l._origOpacity : l._origOpacity);
  } catch (e) { /* some layer types may not support live opacity — non-fatal */ }
}
function dimBackground(dimmed) {
  setLayerOpacity(markerLayer, dimmed);
  for (const k in overlayLayers) setLayerOpacity(overlayLayers[k], dimmed);
  if (usfsOwnership) setLayerOpacity(usfsOwnership, dimmed);
  for (const d in dayOverviewLayers) setLayerOpacity(dayOverviewLayers[d], dimmed);
}
function addMinutesClock(hhmm, mins) {
  if (!hhmm) return null;
  const parts = hhmm.split(':').map(Number);
  let total = ((parts[0] * 60 + parts[1] + mins) % 1440 + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
function renderDayPanel(n) {
  const body = document.getElementById('dayBody');
  const hint = document.getElementById('dayHint');
  if (n == null) { hint.style.display = ''; body.innerHTML = ''; return; }
  hint.style.display = 'none';
  const day = DAYS.find(d => d.day === n);
  if (!day) { body.innerHTML = ''; return; }
  let driveMi = 0, walkMi = 0, gainFt = 0, totalMin = 0, approxCount = 0, retimedCount = 0, rows = '';
  for (const leg of (day.legs || [])) {
    totalMin += leg.minutes || 0;
    const ic = LEG_ICONS[leg.type] || '•';
    const meta = [];
    const isRetimed = leg.type === 'drive' && leg.timing_confidence === 'estimated';
    if (leg.type === 'drive') {
      driveMi += leg.miles;
      meta.push(leg.miles + ' mi', leg.minutes + ' min' + (isRetimed ? ' (OSRM said ' + leg.minutes_osrm_raw + ')' : ''));
    } else if (leg.type === 'walk') {
      walkMi += leg.miles; gainFt += (leg.gain_ft || 0);
      meta.push(leg.miles + ' mi', leg.minutes + ' min'); if (leg.gain_ft) meta.push('+' + leg.gain_ft + ' ft');
    } else meta.push(leg.minutes + ' min');
    const isApprox = leg.geometry_confidence === 'approximate';
    if (isApprox) approxCount++;
    if (isRetimed) retimedCount++;
    rows += '<li class="leg-row"><span class="ic">' + ic + '</span><span class="body"><span class="lbl">' + escHtml(leg.label) + '</span>' +
      (isApprox ? '<span class="approx-tag">~ approx</span>' : '') + (isRetimed ? '<span class="gravel-tag">gravel &mdash; est.</span>' : '') +
      '<div class="meta">' + meta.join(' &middot; ') + '</div></span></li>';
  }
  const endClock = addMinutesClock(day.start.time, totalMin);
  const prevBtn = n > 1 ? '<button class="panel-nav-btn" onclick="selectDay(' + (n - 1) + ')">&larr; Day ' + (n - 1) + '</button>' : '';
  const nextBtn = n < DAYS.length ? '<button class="panel-nav-btn" onclick="selectDay(' + (n + 1) + ')">Day ' + (n + 1) + ' &rarr;</button>' : '';
  let html = '<div class="day-nav-row">' + prevBtn + '<h3>Day ' + day.day + ' &mdash; ' + escHtml(day.title) + '</h3>' + nextBtn + '</div>';
  html += '<div class="day-sub">' + escHtml(day.date) + (day.start.time ? ' &middot; starts ' + day.start.time : '') + '</div>';
  html += '<ul class="leg-list">' + rows + '</ul>';
  html += '<div class="day-totals"><b>Day totals</b>Drive: ' + driveMi.toFixed(1) + ' mi &nbsp;|&nbsp; Walk: ' + walkMi.toFixed(2) + ' mi &nbsp;|&nbsp; Ascent: ' + Math.round(gainFt) + ' ft<br>Elapsed: ' + totalMin + ' min (' + (totalMin / 60).toFixed(1) + ' hr)' +
    (day.start.time ? ' from ' + day.start.time + (endClock ? ' to ~' + endClock : '') : '') +
    (approxCount ? '<br><span style="color:#7a5b00;">' + approxCount + ' leg(s) use approximate geometry — dashed on the map.</span>' : '') + '</div>';
  if (retimedCount) {
    let note = retimedCount + ' drive leg(s) on this day include a gravel-speed estimate (15 mph assumed on unpaved/track roads) rather than OSRM’s routed time — see "gravel — est." above.';
    if (day.day === 4) note += ' Recommend a Google Maps cross-check for this GA-348 loop before relying on the schedule.';
    if (day.day === 5 || day.day === 6) note += ' Recommend a Google Maps cross-check for the Vogel ↔ Three Forks drive before relying on the schedule.';
    html += '<div class="cross-check-note">' + note + '</div>';
  }
  body.innerHTML = html;
}
function updateDayStripActive(n) {
  document.querySelectorAll('.day-strip button').forEach(btn => {
    const d = btn.getAttribute('data-day');
    btn.classList.toggle('active', (n == null && d === 'all') || (n != null && d === String(n)));
  });
}
// Measure the actual on-screen rectangles of the map overlays that can sit
// on top of markers (day strip + zoom control top-left, layers control
// top-right, legend bottom-left) and turn them into fitBounds padding, so a
// day's start/end markers never land underneath one of them. Bug: a fixed
// padding guess left the Day 5 end marker (bottom-left, under the legend)
// unclickable by a real mouse click even though the popup/chain logic was
// fine — computeFitPadding() re-measures every time in case the legend's
// height changed (it grows with the layer count) or the viewport was resized.
function computeFitPadding() {
  const mapRect = document.getElementById('map').getBoundingClientRect();
  const MARGIN = 24;
  let left = 30, top = 30, right = 30, bottom = 30;
  function rectOf(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.width > 0 || r.height > 0) ? r : null;
  }
  const zoom = rectOf('.leaflet-control-zoom');
  const strip = rectOf('.day-strip');
  const legend = rectOf('#legend');
  const layers = rectOf('.leaflet-control-layers');
  [zoom, strip].forEach(r => {
    if (!r) return;
    left = Math.max(left, r.right - mapRect.left + MARGIN);
    top = Math.max(top, r.bottom - mapRect.top + MARGIN);
  });
  if (legend) {
    left = Math.max(left, legend.right - mapRect.left + MARGIN);
    bottom = Math.max(bottom, mapRect.bottom - legend.top + MARGIN);
  }
  if (layers) {
    right = Math.max(right, mapRect.right - layers.left + MARGIN);
    top = Math.max(top, layers.bottom - mapRect.top + MARGIN);
  }
  // Never let padding eat the whole viewport on a small window.
  const capX = mapRect.width * 0.4, capY = mapRect.height * 0.4;
  return {
    paddingTopLeft: [Math.min(left, capX), Math.min(top, capY)],
    paddingBottomRight: [Math.min(right, capX), Math.min(bottom, capY)],
  };
}

let selectedDay = null;
function selectDay(n) {
  if (selectedDay === n) return;
  if (selectedDay != null && dayHighlightLayers[selectedDay]) {
    map.removeLayer(dayHighlightLayers[selectedDay]);
    if (dayOverviewLayers[selectedDay]) dayOverviewLayers[selectedDay].addTo(map);
  }
  selectedDay = n;
  dimBackground(true);
  if (dayOverviewLayers[n]) map.removeLayer(dayOverviewLayers[n]);
  if (dayHighlightLayers[n]) {
    dayHighlightLayers[n].addTo(map);
    // Bring this day's start/end/arrow markers above any pre-existing marker
    // that happens to sit at the same real-world point (e.g. the overnight
    // route's own trailhead/camp marker at Three Forks) so the chain button
    // is always the one on top and clickable.
    dayHighlightLayers[n].eachLayer(l => { if (typeof l.setZIndexOffset === 'function') l.setZIndexOffset(2000); });
  }
  const b = dayBoundsById[n];
  if (b && b.isValid()) {
    const pad = computeFitPadding();
    map.fitBounds(b, { paddingTopLeft: pad.paddingTopLeft, paddingBottomRight: pad.paddingBottomRight, maxZoom: 15 });
  }
  renderDayPanel(n);
  updateDayStripActive(n);
}
function selectAllDays() {
  if (selectedDay != null) {
    if (dayHighlightLayers[selectedDay]) map.removeLayer(dayHighlightLayers[selectedDay]);
    if (dayOverviewLayers[selectedDay]) dayOverviewLayers[selectedDay].addTo(map);
  }
  selectedDay = null;
  dimBackground(false);
  renderDayPanel(null);
  updateDayStripActive(null);
}

const DayStrip = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const div = L.DomUtil.create('div', 'day-strip');
    L.DomEvent.disableClickPropagation(div);
    let html = '<button data-day="all" class="active">All</button>';
    for (const day of DAYS) html += '<button data-day="' + day.day + '">' + day.day + '</button>';
    html += '<span class="hint">&larr;&rarr; keys step days</span>';
    div.innerHTML = html;
    div.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.getAttribute('data-day');
        if (d === 'all') selectAllDays(); else selectDay(parseInt(d, 10));
      });
    });
    return div;
  },
});
if (DAYS.length) new DayStrip().addTo(map);

document.addEventListener('keydown', e => {
  if (!DAYS.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const cur = selectedDay == null ? 0 : selectedDay;
  if (e.key === 'ArrowRight') { const nxt = Math.min(DAYS.length, cur + 1); selectDay(nxt); }
  else { const prv = cur - 1; if (prv >= 1) selectDay(prv); else selectAllDays(); }
});

// ---- legend ----
const legendEl = document.getElementById('legend');
let legendHtml = '<h4>Legend</h4>';
for (const t of Array.from(allTypes).sort()) {
  const s = t === 'overnight-route' ? DATA.overnightStyle : (DATA.typeStyle[t] || DATA.typeStyle.other);
  legendHtml += '<div><span class="legend-sw" style="background:' + s.color + '"></span>' + s.label + '</div>';
}
legendHtml += '<div style="margin-top:4px;"><span class="legend-sw" style="background:#ff0000;opacity:.5;border-radius:2px;"></span>Wilderness / no-panning area</div>';
legendHtml += '<div><span class="legend-sw" style="background:#1f77b4;border-radius:2px;"></span>Creeks &amp; rivers</div>';
if (DAYS.length) {
  legendHtml += '<div style="margin-top:4px;font-weight:600;">Selected-day route:</div>';
  legendHtml += '<div><span class="legend-sw" style="background:' + DRIVE_COLOR + ';border-radius:2px;"></span>Drive leg</div>';
  legendHtml += '<div><span class="legend-sw" style="background:' + WALK_COLOR + ';border-radius:2px;"></span>Walk leg</div>';
  legendHtml += '<div><span class="legend-sw" style="background:repeating-linear-gradient(90deg,#7a5b00 0 3px,transparent 3px 7px);border-radius:2px;"></span>~ approximate geometry (dashed)</div>';
}
legendEl.innerHTML = legendHtml;

// ---- side panel: filters + search + list ----
const filtersEl = document.getElementById('filters');
const activeTypes = new Set(allTypes);
for (const t of Array.from(allTypes).sort()) {
  const s = t === 'overnight-route' ? DATA.overnightStyle : (DATA.typeStyle[t] || DATA.typeStyle.other);
  const id = 'flt-' + t;
  const wrap = document.createElement('label');
  wrap.innerHTML = '<input type="checkbox" checked id="' + id + '"> <span class="legend-sw" style="background:' + s.color + '"></span>' + s.label;
  filtersEl.appendChild(wrap);
  wrap.querySelector('input').addEventListener('change', e => {
    if (e.target.checked) activeTypes.add(t); else activeTypes.delete(t);
    renderList();
    applyMarkerFilter();
  });
}

function applyMarkerFilter() {
  markerLayer.eachLayer(m => {
    if (!m.__type) return;
    const show = activeTypes.has(m.__type);
    const el = m.getElement && m.getElement();
    if (el) el.style.display = show ? '' : 'none';
  });
}

const listEl = document.getElementById('list');
const searchEl = document.getElementById('searchbox');
const allEntries = DATA.points.map(p => ({ id: p.id, name: p.name, type: p._type, lat: p.lat, lng: p.lng, tier: p._tier }))
  .concat(DATA.overnights.filter(o => o.trailhead).map(o => ({ id: o.id + '-trailhead', name: o.name + ' (overnight)', type: 'overnight-route', lat: o.trailhead.lat, lng: o.trailhead.lng, tier: o.rank })));

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  listEl.innerHTML = '';
  for (const e of allEntries) {
    if (!activeTypes.has(e.type)) continue;
    if (q && !e.name.toLowerCase().includes(q)) continue;
    const li = document.createElement('li');
    const s = e.type === 'overnight-route' ? DATA.overnightStyle : (DATA.typeStyle[e.type] || DATA.typeStyle.other);
    li.innerHTML = '<span class="legend-sw" style="background:' + s.color + '"></span><span class="name">' + escHtml(e.name) + '</span><div class="meta">' + (s.label) + (e.tier ? ' · tier ' + e.tier : '') + '</div>';
    li.addEventListener('click', () => {
      map.flyTo([e.lat, e.lng], 14, { duration: 0.6 });
      const mk = markersById[e.id];
      if (mk) setTimeout(() => mk.openPopup(), 650);
    });
    listEl.appendChild(li);
  }
}
searchEl.addEventListener('input', renderList);
renderList();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'trip-map.html'), html);
console.log('Wrote trip-map.html (' + (html.length/1024).toFixed(0) + ' KB).');
