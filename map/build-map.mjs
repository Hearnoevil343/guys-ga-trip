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
let itinerary = null;   // itinerary-v1 schema object (itinerary.json)

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

  if (f.endsWith('.geojson') || (raw && raw.type === 'FeatureCollection')) {
    geoLayers.push({ name: path.basename(f, path.extname(f)), data: raw });
    continue;
  }
  if (isOvernightArray(raw)) { overnights = overnights.concat(raw); continue; }
  if (isPointArray(raw)) { points = points.concat(raw.map(p => ({ ...p, __src: f }))); continue; }
  console.warn('skip (unrecognized shape):', f);
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
  itinerary,
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
</style>
</head>
<body>
<div id="app">
  <div id="map"></div>
  <div id="panel">
    <h1>GA Gold Trip — Oct 15&ndash;21 2026</h1>
    <div class="sub">Vogel State Park base camp, Blairsville GA. Click a marker or list item for details.</div>
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
for (const layer of DATA.geoLayers) {
  if (!layer.data || !layer.data.features) continue;
  const isWilderness = /wilderness/i.test(layer.name);
  const isTrails = /trail/i.test(layer.name) && !isWilderness;
  let gj;
  if (isTrails) {
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
  const label = layer.name + (isWilderness ? ' (NO PANNING)' : (isTrails ? ' (trails)' : ''));
  overlayLayers[label] = gj;
}

for (const k in overlayLayers) {
  // default on: wilderness boundaries and trail lines are both useful context immediately
  if (/NO PANNING|trails/i.test(k)) overlayLayers[k].addTo(map);
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

// ---- itinerary layer: toggleable, numbered day-by-day markers + connecting lines ----
const ITINERARY_COLORS = ['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6'];
if (DATA.itinerary && Array.isArray(DATA.itinerary.days)) {
  const itineraryLayer = L.layerGroup();
  const pointsById = {};
  for (const p of DATA.points) pointsById[p.id] = { lat: p.lat, lng: p.lng, name: p.name };
  for (const o of DATA.overnights) pointsById[o.id] = o.trailhead ? { lat: o.trailhead.lat, lng: o.trailhead.lng, name: o.name } : null;

  for (const day of DATA.itinerary.days) {
    const color = ITINERARY_COLORS[(day.day - 1) % ITINERARY_COLORS.length];
    const coords = [];
    let n = 0;
    for (const stop of day.stops) {
      const ref = stop.ref && pointsById[stop.ref];
      const lat = ref ? ref.lat : stop.lat;
      const lng = ref ? ref.lng : stop.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      n++;
      coords.push([lat, lng]);
      const label = (ref && ref.name) || stop.name || stop.ref || '?';
      const icon = L.divIcon({
        html: '<div style="background:' + color + ';color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);">' + n + '</div>',
        className: '', iconSize: [24,24], iconAnchor: [12,12], popupAnchor: [0,-12],
      });
      const m = L.marker([lat, lng], { icon });
      let h = '<h3>Day ' + day.day + ' — ' + escHtml(day.label) + '</h3>';
      h += row('Date', day.date);
      h += row('Stop', label);
      h += row('Note', stop.note);
      m.bindPopup(h);
      m.addTo(itineraryLayer);
    }
    if (coords.length > 1) {
      L.polyline(coords, { color, weight: 3, opacity: 0.7, dashArray: '4,6' }).addTo(itineraryLayer);
    }
  }
  itineraryLayer.addTo(map);
  layersControl.addOverlay(itineraryLayer, 'Itinerary (Oct 15-21 draft plan)');
}

// ---- legend ----
const legendEl = document.getElementById('legend');
let legendHtml = '<h4>Legend</h4>';
for (const t of Array.from(allTypes).sort()) {
  const s = t === 'overnight-route' ? DATA.overnightStyle : (DATA.typeStyle[t] || DATA.typeStyle.other);
  legendHtml += '<div><span class="legend-sw" style="background:' + s.color + '"></span>' + s.label + '</div>';
}
legendHtml += '<div style="margin-top:4px;"><span class="legend-sw" style="background:#ff0000;opacity:.5;border-radius:2px;"></span>Wilderness / no-panning area</div>';
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
