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
function checkChain(days, label) {
  let chainOk = true;
  for (let i = 0; i < days.length - 1; i++) {
    const end = days[i].end, start = days[i + 1].start;
    if (!end || !start || typeof end.lat !== 'number' || typeof start.lat !== 'number') continue;
    const d = haversineMetersBuild(end.lat, end.lng, start.lat, start.lng);
    if (end.ref !== start.ref || d > 5) {
      chainOk = false;
      console.warn(`WARNING: days.json [${label}] chain break — day ${days[i].day} end (${end.ref}) is ${d.toFixed(0)} m from day ${days[i + 1].day} start (${start.ref}).`);
    }
  }
  console.log(chainOk ? `days.json [${label}] chain check OK across ${days.length} day(s).` : `days.json [${label}] chain check FAILED — see warnings above.`);
  return chainOk;
}
if (daysData && Array.isArray(daysData.days)) {
  checkChain(daysData.days.slice().sort((a, b) => a.day - b.day), 'top-level');
  if (Array.isArray(daysData.variants)) {
    for (const variant of daysData.variants) checkChain((variant.days || []).slice().sort((a, b) => a.day - b.day), variant.id);
  }
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
// 2. Fill in missing photos from Wikimedia Commons — VERIFIED BY NAME, not
//    proximity. The old approach used geosearch ("any image within 1.5km"),
//    which attached whatever was physically nearest with zero subject check:
//    a Home Depot on the Ingles grocery marker, a Wendy's on the ranger
//    district office, identical photos duplicated across four separate Vogel
//    points. No photo beats a wrong photo, so: search Commons by the spot's
//    own name, keep a candidate only if its file title or categories share a
//    real (non-generic) token with the spot's name/creek, and dedupe so no
//    image is ever used by more than one spot on the whole site. The cache
//    is REBUILT FROM SCRATCH this pass (not patched) — the old cache's
//    entries were produced by the flawed method and its keys had drifted
//    from current point ids (e.g. 'crisson_gold_mine' vs the live
//    'crisson-gold-mine'), so trusting old entries would keep the bugs.
// ---------------------------------------------------------------------------
const PHOTO_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'at', 'in', 'on', 'near', 'and', 'or', 'to', 'from', 'into', 'area', 'areas',
  'creek', 'river', 'road', 'rd', 'trail', 'trailhead', 'park', 'georgia', 'ga', 'recreation',
  'falls', 'lake', 'mine', 'mines', 'gold', 'camp', 'campground', 'campsite', 'state', 'national',
  'forest', 'museum', 'historic', 'site', 'sites', 'mountain', 'mtn', 'gap', 'county', 'north', 'south',
  'east', 'west', 'upper', 'lower', 'access', 'scenic', 'highway', 'hwy', 'wma', 'nf', 'usfs', 'fs',
  'district', 'ranger', 'office', 'station', 'center', 'centre', 'visitor', 'overlook', 'wilderness',
  'branch', 'fork', 'crossing', 'bridge', 'loop', 'general', 'store', 'stores', 'parking', 'lot', 'club',
]);
function coreName(name) {
  return String(name || '').split(/[—(/]/)[0].trim();
}
function significantTokens(...texts) {
  const toks = new Set();
  for (const t of texts) {
    if (!t) continue;
    for (const w of String(t).toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/)) {
      if (w.length >= 4 && !PHOTO_STOPWORDS.has(w)) toks.add(w);
    }
  }
  return toks;
}
function tokensMatchText(text, tokens) {
  const t = String(text || '').toLowerCase();
  for (const tok of tokens) if (t.includes(tok)) return true;
  return false;
}

// Common north-GA place names are ambiguous nationally (there's a Wolf Creek
// in Colorado, a Wildcat Creek in Indiana, a "Union General Hospital" in
// Louisiana and a Civil War one in Maryland) — a title/category token match
// alone isn't enough to prove it's OUR Wolf Creek. Two extra guards: (1) bias
// the search query itself toward Georgia with the spot's own county (or
// Union County for the core.json/Blairsville-area points, which carry no
// county field), and (2) when a candidate has Commons {{Location}} geodata,
// require it to actually be near the spot — reject it outright if it's
// geotagged somewhere far away, rather than trusting the name alone.
const MAX_PHOTO_KM = 40; // generous — a river/creek photo may be taken miles from this exact access point
function haversineKmBuild(lat1, lng1, lat2, lng2) { return haversineMetersBuild(lat1, lng1, lat2, lng2) / 1000; }
// A subject-name match alone isn't proof of LOCATION — there's a Wolf Creek
// in Colorado, a Wildcat Creek in Indiana, a "Union General Hospital" in
// Louisiana. Require a Georgia signal too: either the candidate has Commons
// {{Location}} geodata and it's actually near the spot, or (no geodata is
// common for building/business photos) its title/categories mention this
// region by name. Rejects out-of-state namesakes without needing the search
// query itself to carry "County Georgia", which was tried first and starved
// out too many good in-state matches that don't happen to say "county."
// Deliberately region-specific, not just "georgia" — this trip is the north
// GA mountains specifically, and a bare "Georgia" category (near-universal on
// Commons for anything in the state) let through a Wildcat Creek near Atlanta
// that has nothing to do with Rabun County's Wildcat Creek 70+ miles away.
// "union"/"white" alone are excluded too — they false-matched Civil War
// "Union Army" hospital photos, not Union County.
const GA_SIGNAL = ['chattahoochee', 'lumpkin county', 'union county', 'white county', 'fannin county',
  'gilmer county', 'dawson county', 'towns county', 'rabun county', 'dahlonega', 'blairsville', 'helen, ga',
  'suches', 'cleveland, ga', 'vogel', 'blood mountain', 'blue ridge, ga', 'blue ridge mountains',
  'north georgia'];
function hasGaSignal(text) {
  const t = String(text || '').toLowerCase();
  return GA_SIGNAL.some(sig => t.includes(sig));
}
// Hard veto regardless of any token/GA-signal match: an explicit OTHER state
// name or a ", XX" state abbreviation that isn't GA is strong evidence this
// is a same-named place somewhere else entirely (caught a "GA Neel Gap"-
// style false match for an Ingles store that was actually in Hayesville, NC).
const OTHER_STATE_NAME = /\b(North Carolina|South Carolina|Tennessee|Alabama|Florida|Virginia|Louisiana|Colorado|Oregon|Indiana|Kentucky|Mississippi|Texas|Nevada|Utah|Arizona|New Mexico|Maryland|Pennsylvania|Ohio|New York|Washington|Illinois|Wisconsin|Michigan|Nebraska)\b/i;
const OTHER_STATE_ABBR = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
function mentionsOtherState(text) {
  if (!text) return false;
  if (OTHER_STATE_NAME.test(text)) return true;
  if (OTHER_STATE_ABBR.test(text) && !/,\s*GA\b/i.test(text)) return true;
  return false;
}

async function searchVerifiedPhotos(spot) {
  const cName = coreName(spot.name);
  const tokens = significantTokens(cName, spot.stream);
  if (!tokens.size) return [];
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: cName + ' filetype:bitmap', gsrnamespace: '6',
    gsrlimit: '8', prop: 'imageinfo|categories|coordinates', iiprop: 'url|extmetadata', iiurlwidth: '480',
    cllimit: '30', format: 'json',
  });
  let json;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    json = await res.json();
  } catch (e) {
    console.warn('  photo search failed for', spot.id, e.message);
    return [];
  }
  const pages = Object.values((json.query && json.query.pages) || {});
  const out = [];
  for (const p of pages) {
    if (!p.imageinfo || !p.imageinfo[0]) continue;
    const catText = (p.categories || []).map(c => c.title).join(' ');
    if (!tokensMatchText(p.title, tokens) && !tokensMatchText(catText, tokens)) continue; // subject check
    if (mentionsOtherState(p.title) || mentionsOtherState(catText)) { console.log(`    (rejected "${p.title}" — names a different US state)`); continue; }
    let geoOk = null; // null = no geodata to check
    if (Array.isArray(p.coordinates) && p.coordinates[0]) {
      const d = haversineKmBuild(spot.lat, spot.lng, p.coordinates[0].lat, p.coordinates[0].lon);
      geoOk = d <= MAX_PHOTO_KM;
      if (!geoOk) { console.log(`    (rejected "${p.title}" — geotagged ${d.toFixed(0)}km away, not this Georgia feature)`); continue; }
    }
    if (geoOk === null && !hasGaSignal(p.title) && !hasGaSignal(catText)) {
      console.log(`    (rejected "${p.title}" — name matched but no Georgia/region signal and no geodata to confirm location)`);
      continue;
    }
    const ii = p.imageinfo[0];
    const artist = ii.extmetadata && ii.extmetadata.Artist ? String(ii.extmetadata.Artist.value).replace(/<[^>]+>/g, '') : '';
    const lic = ii.extmetadata && ii.extmetadata.LicenseShortName ? ii.extmetadata.LicenseShortName.value : 'Wikimedia Commons';
    out.push({ thumb: ii.thumburl || ii.url, page: ii.descriptionurl, credit: (artist ? artist + ' — ' : '') + lic });
  }
  return out;
}

const usedPhotoPages = new Set(); // global dedupe across the WHOLE site
for (const p of points) for (const ph of (p.photos || [])) if (ph.page) usedPhotoPages.add(ph.page);

photoCache = {}; // full rebuild — see comment above
let cacheDirty = false;
let photoStats = { kept: 0, droppedNoMatch: 0, droppedDupe: 0, skippedOwn: 0 };
for (const p of points) {
  const hasOwnPhotos = Array.isArray(p.photos) && p.photos.length > 0;
  if (hasOwnPhotos) { photoStats.skippedOwn++; continue; } // pre-curated in spots.json/core.json — out of this pass's scope, already verified by hand
  console.log('  searching verified Commons photo for', p.id, '(query: "' + coreName(p.name) + '")');
  const candidates = await searchVerifiedPhotos(p);
  const kept = [];
  let dupeSeen = 0, noMatchCount = candidates.length;
  for (const c of candidates) {
    if (usedPhotoPages.has(c.page)) { dupeSeen++; continue; }
    kept.push(c);
    usedPhotoPages.add(c.page);
    if (kept.length >= 3) break;
  }
  photoCache[p.id] = kept;
  p.photos = kept;
  cacheDirty = true;
  if (kept.length) { photoStats.kept += kept.length; console.log('    -> kept', kept.length, 'verified photo(s)'); }
  else if (dupeSeen) { photoStats.droppedDupe++; console.log('    -> all', dupeSeen, 'matching candidate(s) already used by another spot — left blank rather than duplicate'); }
  else { photoStats.droppedNoMatch++; console.log('    -> no candidate matched the name — left blank (no photo beats a wrong photo)'); }
  await new Promise(r => setTimeout(r, 500));
}
if (cacheDirty) {
  fs.writeFileSync(path.join(DATA_DIR, 'photo-cache.json'), JSON.stringify(photoCache, null, 2));
  console.log(`Rebuilt photo-cache.json: ${Object.keys(photoCache).length} live point id(s), ${photoStats.skippedOwn} pre-curated (untouched), ${photoStats.kept} verified photo(s) kept, ${photoStats.droppedNoMatch} spot(s) left blank (no name match), ${photoStats.droppedDupe} spot(s) left blank (only match(es) already used elsewhere).`);
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

// Same guard against every days.json pan leg + day start/end/camp point,
// across ALL variants (the backcountry route's WOLF-X/CAMP-C/etc. camps and
// pan stops included) — these sit near Coosa Bald National Scenic Area and
// Blood Mountain Wilderness, so this is exactly the case the guard exists for.
if (daysData) {
  const variantSets = Array.isArray(daysData.variants) && daysData.variants.length
    ? daysData.variants
    : [{ id: 'top-level', days: daysData.days || [] }];
  const seen = new Set();
  let dayPointsChecked = 0, dayPanChecked = 0;
  for (const variant of variantSets) {
    for (const day of (variant.days || [])) {
      for (const pt of [day.start, day.end]) {
        if (!pt || typeof pt.lat !== 'number') continue;
        const key = pt.ref + '@' + pt.lat.toFixed(6) + ',' + pt.lng.toFixed(6);
        if (seen.has(key)) continue;
        seen.add(key);
        dayPointsChecked++;
        checkAndTag(pt, `[${variant.id}] Day ${day.day} ${pt === day.start ? 'start' : 'end'} — ${pt.label}`);
      }
      for (const leg of (day.legs || [])) {
        if (leg.type !== 'pan' || typeof leg.lat !== 'number') continue;
        dayPanChecked++;
        checkAndTag(leg, `[${variant.id}] Day ${day.day} pan leg — ${leg.label}`);
      }
    }
  }
  const backcountryHits = wildernessHits.filter(h => h.startsWith('['));
  console.log(`Legality guard (days.json, all variants): checked ${dayPointsChecked} distinct day start/end point(s) + ${dayPanChecked} pan leg(s).`);
  if (backcountryHits.length) {
    console.log(`  INSIDE a no-panning boundary (${backcountryHits.length}):`);
    for (const h of backcountryHits) console.log('   - ' + h);
  } else {
    console.log('  No days.json start/end/pan point fell inside a mapped Wilderness/state-park polygon.');
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

  // Also emit any OTHER variant's days whose geometry differs from what's
  // already in the top-level `days` track above (top-level mirrors the
  // "long" variant — see _build_backcountry.mjs) — chiefly the "short"
  // variant's own day 2/19/20 (different legs than long's) and day 3/4
  // (Cooper Creek / GA-348 loop, which "long" drops entirely). Day 1/7 are
  // byte-identical between variants, so skipped here to avoid pure dupes.
  if (Array.isArray(daysData.variants)) {
    let variantTracksAdded = 0;
    for (const variant of daysData.variants) {
      if (variant.id === 'long') continue; // identical to the top-level loop above
      for (const day of (variant.days || []).slice().sort((a, b) => a.day - b.day)) {
        if (day.date === '2026-10-15' || day.date === '2026-10-21') continue; // day 1 / day 7, shared verbatim
        const segs = [];
        for (const leg of day.legs || []) {
          if ((leg.type !== 'drive' && leg.type !== 'walk') || !Array.isArray(leg.coords) || leg.coords.length < 2) continue;
          const pts = leg.coords.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join('\n');
          segs.push(`    <trkseg>\n${pts}\n    </trkseg>`);
        }
        if (segs.length) {
          const name = `Day ${day.day} (${variant.label})`;
          const desc = `${day.date} — ${day.title}`;
          gpxTracks.push(`  <trk><name>${gpxEscape(name)}</name><desc>${gpxEscape(desc)}</desc>\n${segs.join('\n')}\n  </trk>`);
          variantTracksAdded++;
        }
      }
    }
    if (variantTracksAdded) console.log(`Added ${variantTracksAdded} additional day track(s) from non-"long" variant(s) to trip.gpx.`);
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

// ---------------------------------------------------------------------------
// 4b. Marker-collision guard: two (or more) points at effectively the same
//     coordinate (e.g. a pan spot and its own no-panning exclusion note —
//     upper-chatt-fs44/upper-chatt-wilderness, boggs-creek/boggs-creek-
//     wilderness, both exact-duplicate coordinates) would render as stacked
//     markers where a click only ever reaches whichever was added to the DOM
//     last — the same class of bug fixed for the day start/end markers.
//     Cluster any points within COLLISION_M of each other (transitively, via
//     union-find) and tag them with a shared _mergeGroupId so the client
//     renders ONE marker per group with every member's info in one popup,
//     instead of stacking pins. Asserted below: every distinct group ends up
//     >= COLLISION_M from every other group's representative point.
// ---------------------------------------------------------------------------
const COLLISION_M = 15;
{
  const parent = points.map((_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (haversineMetersBuild(points[i].lat, points[i].lng, points[j].lat, points[j].lng) < COLLISION_M) union(i, j);
    }
  }
  const byRoot = {};
  points.forEach((p, i) => { const r = find(i); (byRoot[r] = byRoot[r] || []).push(p); });
  const groups = Object.values(byRoot);
  for (const g of groups) { const gid = g[0].id; for (const p of g) p._mergeGroupId = gid; }
  const collided = groups.filter(g => g.length > 1);
  if (collided.length) {
    console.log(`Marker-collision guard: merged ${collided.length} group(s) of points within ${COLLISION_M}m into single markers:`);
    for (const g of collided) console.log('  - ' + g.map(p => p.id).join(' + ') + ` (${g.length} points, same marker)`);
  } else {
    console.log(`Marker-collision guard: no two points within ${COLLISION_M}m of each other.`);
  }
  // Assert: no two DIFFERENT groups' representative points are themselves
  // within COLLISION_M (i.e. the clustering actually resolved everything).
  let assertFail = false;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const d = haversineMetersBuild(groups[i][0].lat, groups[i][0].lng, groups[j][0].lat, groups[j][0].lng);
      if (d < COLLISION_M) { assertFail = true; console.warn(`  ASSERTION FAILED: groups ${groups[i][0].id} and ${groups[j][0].id} still ${d.toFixed(1)}m apart after merge.`); }
    }
  }
  console.log(assertFail ? 'Marker-collision assertion FAILED — see warnings above.' : `Marker-collision assertion OK: ${groups.length} distinct rendered marker position(s) for ${points.length} point(s).`);
}

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
  @media (max-width: 700px) {
    #app { flex-direction:column; }
    #map { flex:none; width:100%; height:50vh; }
    #legend { bottom:calc(50vh + 8px) !important; left:8px !important; max-height:22vh !important; }
    #panel { width:100%; min-width:0; max-width:100%; height:50vh; border-left:0; border-top:1px solid #ccc; }
  }
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

  /* permanent centered label on every "Panning: no" polygon */
  .no-panning-label { background:#cc0000; color:#fff; font-weight:800; font-size:10px; letter-spacing:.3px; padding:1px 5px; border:1px solid #fff; border-radius:3px; box-shadow:0 1px 3px rgba(0,0,0,.5); white-space:nowrap; }
  .no-panning-label::before { display:none; }

  /* ---- day strip control (on the map) ---- */
  .day-strip { background:#fff; padding:6px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.4); display:flex; flex-direction:column; gap:5px; }
  .day-strip .day-row { display:flex; gap:4px; flex-wrap:wrap; }
  .day-strip button { border:1px solid #999; background:#f4f4f4; border-radius:4px; padding:5px 9px; font-size:12px; cursor:pointer; font-weight:600; color:#333; }
  .day-strip button:hover { background:#e2ecff; }
  .day-strip button.active { background:#2255aa; color:#fff; border-color:#2255aa; }
  .day-strip .hint { font-size:10px; color:#777; align-self:center; margin-left:4px; display:none; }
  @media (min-width: 700px) { .day-strip .hint { display:inline; } }
  /* Variant selector: same box as the day strip (not a separate floating
     control), a row above the day-number buttons. */
  .day-strip .variant-row { display:flex; gap:4px; border-bottom:1px solid #ddd; padding-bottom:5px; }
  .day-strip .variant-row button { flex:1 1 auto; background:#fff; border:1px solid #999; border-radius:4px; padding:5px 7px; font-size:11px; font-weight:700; cursor:pointer; color:#333; }
  .day-strip .variant-row button:hover { background:#e2ecff; }
  .day-strip .variant-row button.active { background:#2ca02c; color:#fff; border-color:#2ca02c; }
  .day-strip .variant-row button.cmp { flex:0 0 auto; background:#fff8e1; border-color:#c9a227; }
  .cmp-wrap { overflow-x:auto; }
  .cmp-tbl { border-collapse:collapse; width:100%; font-size:11px; }
  .cmp-tbl th, .cmp-tbl td { border:1px solid #ddd; padding:4px 5px; vertical-align:top; text-align:left; }
  .cmp-tbl th { background:#f3f3f3; }
  .cmp-tbl td.lbl { font-weight:700; background:#fafafa; white-space:nowrap; }
  .cmp-tbl tr.tot td { background:#eef5ff; font-weight:700; }
  .cmp-tbl details { margin-top:3px; }
  .cmp-tbl summary { cursor:pointer; color:#7a5b00; font-weight:700; }
  .cmp-note { font-size:11px; color:#555; margin:5px 0; }

  /* ---- overlays control panel (on the map, top-right, below the base-map switcher) ---- */
  /* Collapsed = a small square icon button only, so it never forces the map's
     own width wider on a narrow phone screen (the sidebar panel already claims
     most of the viewport there). Expanded = the full 230px panel; that's a
     deliberate user tap, same tradeoff the base-map switcher already makes. */
  .overlay-panel { margin-top:6px; }
  .overlay-toggle-icon { display:none; width:34px; height:34px; border:1px solid #999; border-radius:6px; background:#fff; font-size:15px; font-weight:700; cursor:pointer; color:#333; box-shadow:0 1px 4px rgba(0,0,0,.4); }
  .overlay-toggle-icon:hover { background:#e2ecff; }
  .overlay-panel.collapsed .overlay-toggle-icon { display:block; }
  .overlay-panel-inner { background:#fff; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.4); font-size:12px; width:230px; max-width:62vw; overflow:hidden; }
  .overlay-panel.collapsed .overlay-panel-inner { display:none; }
  .overlay-panel-hd { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; font-weight:700; background:#f4f4f4; border-bottom:1px solid #ddd; }
  .overlay-toggle { border:1px solid #999; background:#fff; border-radius:3px; width:20px; height:20px; line-height:1; font-size:14px; font-weight:700; cursor:pointer; color:#333; }
  .overlay-toggle:hover { background:#e2ecff; }
  .overlay-panel-body { max-height:52vh; overflow-y:auto; padding:2px 0; }
  .ov-row { padding:6px 10px; border-top:1px solid #eee; }
  .ov-row:first-child { border-top:none; }
  .ov-hd { display:flex; align-items:center; gap:6px; cursor:pointer; margin:0; }
  .ov-hd input { flex:0 0 auto; cursor:pointer; }
  .ov-swatch { width:12px; height:12px; border-radius:2px; flex:0 0 auto; border:1px solid rgba(0,0,0,.25); }
  .ov-name { flex:1 1 auto; font-size:12px; }
  .ov-slider { width:100%; margin:5px 0 1px; }

  /* ---- day / leg panel (top of the sidebar) ---- */
  #daySection { border-bottom: 2px solid #ccc; padding-bottom: 8px; margin-bottom: 6px; }
  #daySection h2 { font-size: 14px; margin: 8px 12px 2px; }
  #daySection .day-sub { font-size: 11px; color:#555; margin: 0 12px 6px; }
  #dayHint { font-size: 12px; color: #777; margin: 6px 12px; font-style: italic; }
  .leg-list { list-style:none; margin:0; padding: 0 12px; }
  .leg-row { display:flex; align-items:flex-start; gap:7px; padding:6px 0; border-bottom:1px dashed #ddd; font-size:12px; }
  .leg-row .ic { flex: 0 0 20px; font-size:15px; text-align:center; }
  .step-num { flex: 0 0 16px; height:16px; line-height:16px; text-align:center; border-radius:50%; background:#2255aa; color:#fff; font-size:10px; font-weight:800; margin-top:1px; }
  .leg-row .body { flex: 1 1 auto; }
  .leg-row .lbl { font-weight:600; }
  .leg-row .meta { color:#666; font-size:11px; margin-top:1px; }
  .approx-tag { display:inline-block; background:#fff3cd; color:#7a5b00; border:1px solid #e6c260; border-radius:3px; padding:0 4px; font-size:10px; font-weight:700; margin-left:5px; }
  .gravel-tag { display:inline-block; background:#e3edff; color:#1a4a8a; border:1px solid #9fc2ff; border-radius:3px; padding:0 4px; font-size:10px; font-weight:700; margin-left:5px; }
  .access-tag { display:inline-block; background:#fff3cd; color:#7a5b00; border:1px solid #e6c260; border-radius:3px; padding:0 4px; font-size:10px; font-weight:700; margin-left:5px; }
  .optional-tag { display:inline-block; background:#e3edff; color:#1a4a8a; border:1px solid #9fc2ff; border-radius:3px; padding:0 4px; font-size:10px; font-weight:700; margin-left:5px; text-transform:uppercase; }
  .unverified-chip { display:inline-block; background:#fff3cd; color:#7a5b00; border:1px solid #e6c260; border-radius:9px; padding:0 6px; font-size:10px; font-weight:700; margin-left:5px; cursor:pointer; }
  .unverified-chip:hover { background:#ffe9a8; }
  .leg-row.pan-row { cursor:pointer; }
  .leg-detail { display:none; margin:6px 0 2px; padding:7px 8px; background:#fffaf0; border:1px solid #e6c260; border-radius:5px; font-size:11px; line-height:1.45; }
  .leg-detail.open { display:block; }
  .leg-detail .ld-row { margin:0 0 6px; }
  .leg-detail .ld-row:last-child { margin-bottom:0; }
  .leg-detail .ld-lbl { font-weight:700; color:#7a5b00; display:block; margin-bottom:1px; }
  .leg-detail a { color:#1a4a8a; }
  .optional-note { margin:2px 12px 6px; padding:5px 8px; background:#e3edff; border:1px solid #9fc2ff; border-radius:5px; font-size:11px; color:#1a4a8a; }
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
// Its own pane, below the default overlayPane (zIndex 400) that every
// GeoJSON overlay uses, so the red no-panning zones always draw on top of
// it no matter what order layers get added/toggled in. A CSS filter on the
// pane boosts saturation/contrast because the raw EDW tiles render washed
// out over every base map (reported 2026-09-21).
map.createPane('usfsPane');
map.getPane('usfsPane').style.zIndex = 399;
map.getPane('usfsPane').style.filter = 'saturate(1.7) contrast(1.3) brightness(1.05)';
let usfsOwnership = null;
try {
  usfsOwnership = L.esri.dynamicMapLayer({
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer',
    opacity: 0.75,
    pane: 'usfsPane',
  });
} catch (e) { console.warn('USFS ownership layer failed to init', e); }

// ---- overlay: wilderness / no-panning polygons, and trail/route lines, from GeoJSON files ----
const overlayLayers = {};
const overlayColors = {};
const TRAIL_COLORS = { trail: '#8c564b', waterway: '#1f77b4', road: '#555555' };
let waterOverlay = null;
for (const layer of DATA.geoLayers) {
  if (!layer.data || !layer.data.features) continue;
  const isWilderness = /wilderness/i.test(layer.name);
  const isWater = /^water$/i.test(layer.name);
  const isTrails = /trail/i.test(layer.name) && !isWilderness;
  const isPanningStatus = /^panning-status$/i.test(layer.name);
  if (isPanningStatus) continue; // handled separately below, split into good/no/no-info overlays
  if (isWilderness) continue; // folded into the "Panning: no" overlay (panning-status.geojson was seeded from this same data) so the same zones aren't drawn twice
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
  overlayColors[label] = isWilderness ? '#ff0000' : (isWater ? '#1f77b4' : (isTrails ? '#8c564b' : '#888888'));
  if (isWater) waterOverlay = gj;
}
if (usfsOwnership) {
  overlayLayers['USFS land ownership'] = usfsOwnership;
  overlayColors['USFS land ownership'] = '#2f7d3c';
}

// ---- overlay: panning-status.geojson (research-fed; missing/empty file is fine) ----
// Split into three overlays by status. "Panning: no" also carries the seed
// data copied from wilderness.geojson (see the "continue" above), so the old
// standalone NO-PANNING layer isn't drawn a second time.
const PANNING_STATUS_META = {
  good: { label: 'Panning: good', color: '#2e8b3d' },
  no: { label: 'Panning: no', color: '#cc0000' },
  unknown: { label: 'Panning: no info', color: '#888888' },
};
const panningStatusSrc = DATA.geoLayers.find(l => /^panning-status$/i.test(l.name));
if (panningStatusSrc && panningStatusSrc.data && Array.isArray(panningStatusSrc.data.features)) {
  const byStatus = { good: [], no: [], unknown: [] };
  for (const f of panningStatusSrc.data.features) {
    const st = (f.properties && PANNING_STATUS_META[f.properties.status]) ? f.properties.status : 'unknown';
    byStatus[st].push(f);
  }
  for (const st of ['good', 'no', 'unknown']) {
    if (!byStatus[st].length) continue;
    const meta = PANNING_STATUS_META[st];
    const fc = { type: 'FeatureCollection', features: byStatus[st] };
    // "Panning: no" zones get a stronger, solid outline + fill (they were
    // getting lost against brown terrain basemaps at the old 0.28/weight-2
    // style) plus a permanent small centered "NO PANNING" label on every
    // polygon feature, on by default (see overlaySettings defaultOn below).
    const isNo = st === 'no';
    const gj = L.geoJSON(fc, {
      style: f => {
        const isLine = f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
        if (isLine) return { color: meta.color, weight: 5, opacity: 0.85 };
        return isNo
          ? { color: meta.color, weight: 3, opacity: 1, fillColor: meta.color, fillOpacity: 0.4 }
          : { color: meta.color, weight: 2, fillColor: meta.color, fillOpacity: 0.28 };
      },
      onEachFeature: (f, lyr) => {
        const p = f.properties || {};
        let h = '<b>' + escHtml(p.name || meta.label) + '</b>';
        if (p.reason) h += '<div style="font-size:12px;margin-top:3px;">' + escHtml(p.reason) + '</div>';
        if (p.source) {
          const isUrl = p.source.indexOf('http://') === 0 || p.source.indexOf('https://') === 0 || p.source.indexOf('HTTP://') === 0 || p.source.indexOf('HTTPS://') === 0;
          h += '<div style="font-size:11px;color:#555;margin-top:3px;">' + (isUrl
            ? '<a href="' + escHtml(p.source) + '" target="_blank" rel="noopener">source</a>'
            : escHtml(p.source)) + '</div>';
        }
        if (p.checked) h += '<div style="font-size:11px;color:#777;margin-top:2px;">Checked: ' + escHtml(p.checked) + '</div>';
        lyr.bindPopup(h);
        const isLineFeature = f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
        if (isNo && !isLineFeature) {
          lyr.bindTooltip('NO PANNING', {
            permanent: true, direction: 'center', className: 'no-panning-label', interactive: false,
          });
        }
      },
    });
    overlayLayers[meta.label] = gj;
    overlayColors[meta.label] = meta.color;
  }
}

// ---- overlay on/off + opacity settings, persisted in localStorage ----
const OVERLAY_LS_KEY = 'gaGoldTripOverlaySettings.v1';
let savedOverlaySettings = {};
try {
  const raw = localStorage.getItem(OVERLAY_LS_KEY);
  if (raw) savedOverlaySettings = JSON.parse(raw) || {};
} catch (e) { savedOverlaySettings = {}; }
const overlaySettings = {};
for (const key of Object.keys(overlayLayers)) {
  // default on: no-panning zones, trail lines and creeks are all useful context immediately
  const defaultOn = /NO PANNING|trails|Creeks & rivers|Panning: no$/i.test(key);
  const saved = savedOverlaySettings[key];
  overlaySettings[key] = {
    on: saved && typeof saved.on === 'boolean' ? saved.on : defaultOn,
    opacity: saved && typeof saved.opacity === 'number' ? Math.min(1, Math.max(0, saved.opacity)) : 1,
  };
}
function saveOverlaySettings() {
  try { localStorage.setItem(OVERLAY_LS_KEY, JSON.stringify(overlaySettings)); } catch (e) { /* non-fatal: private window / blocked storage */ }
}
for (const key of Object.keys(overlayLayers)) {
  if (overlaySettings[key].on) overlayLayers[key].addTo(map);
  applyLayerOpacity(overlayLayers[key], overlaySettings[key].opacity);
}

const layersControl = L.control.layers(baseLayers, null, { collapsed: true }).addTo(map);

// ---- Overlays control panel: on/off + opacity slider per overlay ----
const OverlayPanel = L.Control.extend({
  options: { position: 'topright' },
  onAdd: function () {
    const div = L.DomUtil.create('div', 'overlay-panel' + (window.innerWidth < 700 ? ' collapsed' : ''));
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    let rows = '';
    const keys = Object.keys(overlayLayers);
    keys.forEach((key, i) => {
      const s = overlaySettings[key];
      const color = overlayColors[key] || '#888888';
      rows += '<div class="ov-row">' +
        '<label class="ov-hd"><input type="checkbox" class="ov-toggle" data-i="' + i + '"' + (s.on ? ' checked' : '') + '>' +
        '<span class="ov-swatch" style="background:' + color + '"></span>' +
        '<span class="ov-name">' + escHtml(key) + '</span></label>' +
        '<input type="range" class="ov-slider" data-i="' + i + '" min="0" max="100" step="5" value="' + Math.round(s.opacity * 100) + '">' +
        '</div>';
    });
    div.innerHTML = '<button type="button" class="overlay-toggle-icon" aria-label="Show overlay controls">&#9776;</button>' +
      '<div class="overlay-panel-inner">' +
      '<div class="overlay-panel-hd"><span>Overlays</span><button type="button" class="overlay-toggle" aria-label="Collapse overlays panel">&minus;</button></div>' +
      '<div class="overlay-panel-body">' + rows + '</div>' +
      '</div>';
    div.querySelector('.overlay-toggle-icon').addEventListener('click', () => div.classList.remove('collapsed'));
    div.querySelector('.overlay-toggle').addEventListener('click', () => div.classList.add('collapsed'));
    div.querySelectorAll('.ov-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = keys[parseInt(cb.getAttribute('data-i'), 10)];
        overlaySettings[key].on = cb.checked;
        if (cb.checked) { overlayLayers[key].addTo(map); refreshOverlayStyle(key); }
        else map.removeLayer(overlayLayers[key]);
        saveOverlaySettings();
      });
    });
    div.querySelectorAll('.ov-slider').forEach(sl => {
      sl.addEventListener('input', () => {
        const key = keys[parseInt(sl.getAttribute('data-i'), 10)];
        overlaySettings[key].opacity = parseInt(sl.value, 10) / 100;
        refreshOverlayStyle(key);
        saveOverlaySettings();
      });
    });
    return div;
  },
});
if (Object.keys(overlayLayers).length) new OverlayPanel().addTo(map);

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

// Points within COLLISION_M of each other were pre-grouped at build time
// (_mergeGroupId) so a pan spot and its own no-panning exclusion note (e.g.
// upper-chatt-fs44 / upper-chatt-wilderness, boggs-creek / boggs-creek-
// wilderness — both exact-duplicate coordinates) render as ONE marker with
// every group member's popup stacked in it, instead of two stacked pins
// where only the top one is ever clickable.
function mergedIcon(members) {
  if (members.length === 2) {
    const s0 = DATA.typeStyle[members[0]._type] || DATA.typeStyle.other;
    const s1 = DATA.typeStyle[members[1]._type] || DATA.typeStyle.other;
    return L.divIcon({
      html: '<div style="background:linear-gradient(135deg,' + s0.color + ' 50%,' + s1.color + ' 50%);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);">' + s0.icon + '</div>',
      className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14],
    });
  }
  return L.divIcon({
    html: '<div style="background:#555;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);">' + members.length + '</div>',
    className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14],
  });
}
const pointsByGroup = {};
for (const p of DATA.points) { const gid = p._mergeGroupId || p.id; (pointsByGroup[gid] = pointsByGroup[gid] || []).push(p); }
for (const gid in pointsByGroup) {
  const members = pointsByGroup[gid];
  const first = members[0];
  let m;
  if (members.length > 1) {
    let h = '<div style="font-size:11px;color:#555;font-weight:700;margin-bottom:4px;">' + members.length + ' entries at this point:</div>';
    h += members.map(popupHtml).join('<hr style="margin:8px 0;border:none;border-top:1px solid #ccc;">');
    m = L.marker([first.lat, first.lng], { icon: mergedIcon(members) }).bindPopup(h);
    m.__type = first._type;
  } else {
    m = L.marker([first.lat, first.lng], { icon: iconFor(first._type) }).bindPopup(popupHtml(first));
    m.__type = first._type;
  }
  m.__point = first;
  m.__types = members.map(p => p._type); // full membership, for category filtering (Places tab)
  m.addTo(markerLayer);
  for (const p of members) { allTypes.add(p._type); markersById[p.id] = m; }
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
const LEG_ICONS = { drive: '🚗', walk: '🥾', pan: '⛏️', tour: '🏛️', camp: '⛺', meal: '🍽️' };
// ---- route variants ("long"/"short" backcountry options) ----
// DATA.days.variants is [{id,label,days:[...]}]; top-level DATA.days.days
// mirrors the "long" variant for anything (older code, GPX) that only knows
// the old single-route shape. Falls back to that top-level shape if no
// variants array exists at all (keeps this file working on an older days.json).
const VARIANTS = (DATA.days && Array.isArray(DATA.days.variants) && DATA.days.variants.length) ? DATA.days.variants : null;
const VARIANT_LS_KEY = 'gaGoldTripVariant.v1';
function loadVariantChoice() {
  if (!VARIANTS) return null;
  try {
    const saved = localStorage.getItem(VARIANT_LS_KEY);
    if (saved && VARIANTS.some(v => v.id === saved)) return saved;
  } catch (e) { /* private window / blocked storage */ }
  return VARIANTS[0].id;
}
let currentVariantId = loadVariantChoice();
function daysForCurrentVariant() {
  if (VARIANTS) {
    const v = VARIANTS.find(x => x.id === currentVariantId) || VARIANTS[0];
    return v.days.slice().sort((a, b) => a.day - b.day);
  }
  return (DATA.days && Array.isArray(DATA.days.days)) ? DATA.days.days.slice().sort((a, b) => a.day - b.day) : [];
}
let DAYS = daysForCurrentVariant();

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
// Numbered step markers: a day's ordered stops (start -> each pan/waypoint/
// camp -> end) each get one marker showing its step number, so marker "N"
// always equals step N in the day panel's leg list. Start/end keep their
// green/red (or split "hub" gradient when they're the same physical point)
// so the direction is still obvious at a glance; every marker built by
// stepIcon() keeps the real day-start-marker/day-end-marker CSS classes
// wherever it plays that role, for the existing click/occlusion tests.
function stepIcon(n, variant) {
  const size = variant === 'hub' ? 32 : (variant === 'mid' ? 27 : 30);
  const bg = variant === 'start' ? '#2ca02c'
    : variant === 'end' ? '#b30000'
    : variant === 'hub' ? 'linear-gradient(135deg,#2ca02c 50%,#b30000 50%)'
    : '#2255aa';
  const cls = 'day-step-marker' +
    (variant === 'start' || variant === 'hub' ? ' day-start-marker' : '') +
    (variant === 'end' || variant === 'hub' ? ' day-end-marker' : '');
  return L.divIcon({
    html: '<div style="background:' + bg + ';color:#fff;border-radius:50%;width:' + size + 'px;height:' + size + 'px;display:flex;align-items:center;justify-content:center;font-size:' + (size >= 30 ? 14 : 12) + 'px;font-weight:800;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);">' + n + '</div>',
    className: cls, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2],
  });
}
const SAME_SPOT_M = 15; // meters — Vogel's own coordinate is stable to well under this across days; also the step-merge threshold below

// ref (from_ref/to_ref/start.ref/end.ref) -> a friendly place name, so a
// numbered stop's label reads "Consolidated Gold Mine" rather than a raw
// leg-label fragment. Rebuilt on every variant switch (DAYS changes).
let REF_LABELS = {};
function buildRefLabels() {
  const labels = {};
  for (const p of DATA.points) labels[p.id] = p.name;
  for (const o of DATA.overnights) { labels[o.id] = o.name; labels[o.id + '-trailhead'] = o.name + ' (Trailhead)'; }
  for (const d of DAYS) {
    if (d.start && d.start.ref && !labels[d.start.ref]) labels[d.start.ref] = d.start.label;
    if (d.end && d.end.ref && !labels[d.end.ref]) labels[d.end.ref] = d.end.label;
  }
  return labels;
}
// Best-effort human label for where a drive/walk leg ends: prefer a known
// ref's real name, else fall back to the tail of the leg's own label text
// (e.g. "Vogel to Consolidated Gold Mine" -> "Consolidated Gold Mine").
function destLabelFor(leg) {
  if (leg.to_ref && REF_LABELS[leg.to_ref]) return REF_LABELS[leg.to_ref];
  const label = leg.label || '';
  const idx = label.lastIndexOf(' to ');
  return idx >= 0 ? (label.slice(idx + 4).trim() || label) : label;
}
// Walks a day's legs IN CHAIN ORDER (start -> each leg's own place -> end),
// merging any point within SAME_SPOT_M of the previous one into the same
// numbered step (so a leg's end == the next leg's start counts once, and a
// tour/pan leg with no coordinates of its own — it happened wherever the
// group already was — attaches to that same stop instead of minting a new
// number). Returns {steps, legStepNumber}: legStepNumber[i] is the step
// number leg i belongs to (its own stop for pan/tour, its arrival stop for
// drive/walk), so the day panel can show the same number as the map marker.
function buildDaySteps(day) {
  const steps = [];
  const legs = day.legs || [];
  const legStepNumber = new Array(legs.length).fill(null);
  function distM(aLat, aLng, bLat, bLng) { return map.distance([aLat, aLng], [bLat, bLng]); }
  function pushOrMerge(lat, lng, label, entry) {
    const last = steps[steps.length - 1];
    if (last && distM(last.lat, last.lng, lat, lng) < SAME_SPOT_M) { last.entries.push(entry); return steps.length - 1; }
    steps.push({ lat, lng, label, entries: [entry], flags: [] });
    return steps.length - 1;
  }
  let cur = { lat: day.start.lat, lng: day.start.lng };
  pushOrMerge(cur.lat, cur.lng, day.start.label, { kind: 'start' });
  legs.forEach((leg, legIdx) => {
    let idx;
    if ((leg.type === 'drive' || leg.type === 'walk') && Array.isArray(leg.coords) && leg.coords.length) {
      const endC = leg.coords[leg.coords.length - 1];
      cur = { lat: endC[0], lng: endC[1] };
      idx = pushOrMerge(cur.lat, cur.lng, destLabelFor(leg), { kind: leg.type, leg, legIdx });
    } else if (leg.type === 'pan' || leg.type === 'tour') {
      if (typeof leg.lat === 'number') cur = { lat: leg.lat, lng: leg.lng };
      idx = pushOrMerge(cur.lat, cur.lng, leg.label, { kind: leg.type, leg, legIdx });
    } else {
      idx = steps.length - 1;
      if (idx >= 0) steps[idx].entries.push({ kind: leg.type || 'other', leg, legIdx });
    }
    legStepNumber[legIdx] = idx != null && idx >= 0 ? idx + 1 : null;
    // An unconfirmed-access drive/walk leg also flags the stop it LEFT FROM
    // (not just its arrival's own polyline popup / leg-panel tag), so e.g.
    // the truck staged/retrieved at Owltown Gap shows the flag right on
    // that numbered marker, not just on the drive line elsewhere on the map.
    if ((leg.type === 'drive' || leg.type === 'walk') && leg.access_confidence === 'unconfirmed' && leg.access_note) {
      let departIdx = 0;
      for (let j = legIdx - 1; j >= 0; j--) { if (legStepNumber[j] != null) { departIdx = legStepNumber[j] - 1; break; } }
      if (idx != null && departIdx !== idx) {
        const flags = steps[departIdx].flags;
        if (!flags.some(f => f.text === leg.access_note)) flags.push({ text: leg.access_note });
      }
    }
  });
  // Merge the final "end" into the START step (not just whichever step a
  // route happened to end nearest to) whenever start/end are the canonical
  // same point — an OSRM-snapped drive arrival can sit ~10s of meters off
  // the exact basecamp pin, which would otherwise fail the normal adjacent-
  // step merge check and leave two markers stacked exactly on top of each
  // other at Vogel (same click-occlusion bug the start/end hub fix already
  // solved once for the old two-marker system).
  if (steps.length && distM(steps[0].lat, steps[0].lng, day.end.lat, day.end.lng) < SAME_SPOT_M) {
    steps[0].entries.push({ kind: 'end' });
  } else {
    pushOrMerge(day.end.lat, day.end.lng, day.end.label, { kind: 'end' });
  }
  steps.forEach((s, i) => { s.n = i + 1; });
  return { steps, legStepNumber };
}
// Popup body (no heading) for one numbered stop: pan legs keep their full
// existing detail (amber "unverified" chip + panLegDetailHtml — legality,
// gold, water, bears, fires), tour legs show what/how-long, and any
// departure-flagged access note renders as the same amber UNCONFIRMED banner
// used on the route-line popups.
function stepPopupBody(step) {
  let h = '';
  const flagTexts = (step.flags || []).map(f => f.text); // departure-side flags collected in buildDaySteps
  for (const e of step.entries) {
    if (e.kind === 'pan') {
      h += '<div style="margin:4px 0 2px;"><span class="unverified-chip">amber &middot; unverified</span></div>' + panLegDetailHtml(e.leg);
    } else if (e.kind === 'tour') {
      h += row('Activity', e.leg.label) + (e.leg.minutes ? row('Duration', e.leg.minutes + ' min') : '');
    } else if (e.kind === 'drive' || e.kind === 'walk') {
      h += '<div style="font-size:11px;color:#666;margin:2px 0;">Route in: ' + escHtml(e.leg.label) + '</div>';
      // This leg's OWN arrival is this stop — surface its access flag here
      // too, not just on its polyline popup elsewhere on the map.
      if (e.leg.access_confidence === 'unconfirmed' && e.leg.access_note && !flagTexts.includes(e.leg.access_note)) {
        flagTexts.push(e.leg.access_note);
      }
    }
  }
  for (const text of flagTexts) {
    h += '<div style="background:#fff3cd;color:#7a5b00;border:1px solid #e6c260;border-radius:4px;padding:5px 7px;margin-top:5px;font-size:11px;"><b>UNCONFIRMED:</b> ' + escHtml(text) + '</div>';
  }
  return h;
}

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
      if (leg.access_confidence === 'unconfirmed' && leg.access_note) {
        popupHtml += '<div style="background:#fff3cd;color:#7a5b00;border:1px solid #e6c260;border-radius:4px;padding:5px 7px;margin-top:5px;font-size:11px;"><b>UNCONFIRMED:</b> ' + escHtml(leg.access_note) + '</div>';
      }
      pl.bindPopup(popupHtml);
      [0.33, 0.66].forEach(f => { const r = pointAtFraction(leg.coords, f); if (r) arrowMarker(r.latlng, r.bearing, baseColor).addTo(highlight); });
    }
  }
  // Numbered steps: start (1) -> each pan stop/waypoint/camp -> end (N),
  // built from the day's own leg chain — replaces the old "start+end only"
  // markers, which is what made every actual stop the day visits look
  // dimmed/greyed-out along with the rest of the map.
  const { steps, legStepNumber } = buildDaySteps(day);
  steps.forEach(s => bounds.extend([s.lat, s.lng]));
  const backBtn = day.day > 1 ? '<button class="chain-btn back" onclick="selectDay(' + (day.day - 1) + ')">&larr; Day ' + (day.day - 1) + ' ended here</button>' : '';
  const fwdBtn = day.day < DAYS.length ? '<button class="chain-btn" onclick="selectDay(' + (day.day + 1) + ')">Day ' + (day.day + 1) + ' starts here &rarr;</button>' : '';
  const startStep = steps[0];
  // The "end" entry is merged directly into startStep.entries whenever
  // start/end coincide (see buildDaySteps) — check for that entry rather
  // than assuming the END of the steps array is the end (a loop day with
  // stops in between, e.g. the CAMP-C layover, would otherwise mislabel its
  // last real intermediate stop as the red "day ends here" marker).
  const isHub = startStep.entries.some(e => e.kind === 'end');
  const midFrom = 1;
  const midTo = isHub ? steps.length : steps.length - 1; // exclusive upper bound
  if (isHub) {
    const hubM = L.marker([startStep.lat, startStep.lng], { icon: stepIcon(startStep.n, 'hub') });
    let hh = '<h3>Step ' + startStep.n + ' &mdash; Day ' + day.day + ' starts &amp; ends here</h3>' + row('Where', startStep.label) + row('Start time', day.start.time) +
      stepPopupBody(startStep) +
      '<div style="font-size:11px;color:#555;margin:3px 0;">Same spot both ends of the day.</div>' + backBtn + fwdBtn;
    hubM.bindPopup(hh);
    hubM.addTo(highlight);
  } else {
    const endStep = steps[steps.length - 1];
    const startM = L.marker([startStep.lat, startStep.lng], { icon: stepIcon(startStep.n, 'start') });
    startM.bindPopup('<h3>Step ' + startStep.n + ' &mdash; Day ' + day.day + ' starts here</h3>' + row('Where', startStep.label) + row('Time', day.start.time) + stepPopupBody(startStep) + backBtn);
    startM.addTo(highlight);
    const endM = L.marker([endStep.lat, endStep.lng], { icon: stepIcon(endStep.n, 'end') });
    endM.bindPopup('<h3>Step ' + endStep.n + ' &mdash; Day ' + day.day + ' ends here</h3>' + row('Where', endStep.label) + stepPopupBody(endStep) + fwdBtn);
    endM.addTo(highlight);
  }
  // Intermediate numbered stops (everything between start and end/hub).
  for (let i = midFrom; i < midTo; i++) {
    const s = steps[i];
    const m = L.marker([s.lat, s.lng], { icon: stepIcon(s.n, 'mid') });
    m.bindPopup('<h3>Step ' + s.n + ' &mdash; ' + escHtml(s.label || '') + '</h3>' + stepPopupBody(s));
    m.addTo(highlight);
  }
  return { overview, highlight, bounds, steps, legStepNumber };
}

const dayOverviewLayers = {}, dayHighlightLayers = {}, dayBoundsById = {}, dayLegStepNumberById = {};
function clearDayLayers() {
  for (const k in dayOverviewLayers) { map.removeLayer(dayOverviewLayers[k]); delete dayOverviewLayers[k]; }
  for (const k in dayHighlightLayers) { map.removeLayer(dayHighlightLayers[k]); delete dayHighlightLayers[k]; }
  for (const k in dayBoundsById) delete dayBoundsById[k];
  for (const k in dayLegStepNumberById) delete dayLegStepNumberById[k];
}
function rebuildDayLayers() {
  clearDayLayers();
  REF_LABELS = buildRefLabels(); // depends on DAYS, which may have just changed (variant switch)
  for (const day of DAYS) {
    const built = buildDayLayers(day);
    dayOverviewLayers[day.day] = built.overview;
    dayHighlightLayers[day.day] = built.highlight;
    dayBoundsById[day.day] = built.bounds;
    dayLegStepNumberById[day.day] = built.legStepNumber;
    built.overview.addTo(map); // default "All" view: every day's real route visible at once
  }
}
rebuildDayLayers();

const DIM = 0.25;
// Sets a layer's live opacity to "factor" x its ORIGINAL design opacity/fillOpacity
// (captured once, lazily, the first time any layer is touched). Used both for the
// selection-dimming pass and for the overlay panel's per-layer opacity slider, so
// the two compose: effective = user-chosen slider factor x (DIM when dimmed else 1).
function applyLayerOpacity(l, factor) {
  try {
    if (typeof l.eachLayer === 'function') { l.eachLayer(x => applyLayerOpacity(x, factor)); return; }
    if (l._origOpacity === undefined) l._origOpacity = (l.options && l.options.opacity != null) ? l.options.opacity : 1;
    if (l._origFillOpacity === undefined) l._origFillOpacity = (l.options && l.options.fillOpacity != null) ? l.options.fillOpacity : 0.2;
    if (typeof l.setStyle === 'function') l.setStyle({ opacity: factor * l._origOpacity, fillOpacity: factor * l._origFillOpacity });
    else if (typeof l.setOpacity === 'function') l.setOpacity(factor * l._origOpacity);
  } catch (e) { /* some layer types may not support live opacity — non-fatal */ }
}
function setLayerOpacity(l, dimmed) {
  applyLayerOpacity(l, dimmed ? DIM : 1);
}
let backgroundDimmed = false;
// Re-applies one overlay's style using its current panel opacity setting
// combined with whatever the current selection-dimming state is.
function refreshOverlayStyle(key) {
  const l = overlayLayers[key];
  if (!l) return;
  const userOpacity = (overlaySettings[key] && overlaySettings[key].opacity != null) ? overlaySettings[key].opacity : 1;
  applyLayerOpacity(l, userOpacity * (backgroundDimmed ? DIM : 1));
}
function dimBackground(dimmed) {
  backgroundDimmed = dimmed;
  setLayerOpacity(markerLayer, dimmed);
  for (const k in overlayLayers) refreshOverlayStyle(k);
  for (const d in dayOverviewLayers) setLayerOpacity(dayOverviewLayers[d], dimmed);
}
function addMinutesClock(hhmm, mins) {
  if (!hhmm) return null;
  const parts = hhmm.split(':').map(Number);
  let total = ((parts[0] * 60 + parts[1] + mins) % 1440 + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
// Progressive-disclosure detail block for a pan leg: panning/camping
// legality (state + text + source link), gold record/pressure/geology,
// water, bears. Hidden by default; the "unverified" chip on the leg row
// (or the row itself) toggles it open — see toggleLegDetail().
function panLegDetailHtml(leg) {
  const legality = leg.legality || {};
  const rowsHtml = [];
  function block(lbl, inner) { if (inner) rowsHtml.push('<div class="ld-row"><span class="ld-lbl">' + escHtml(lbl) + '</span>' + inner + '</div>'); }
  if (legality.panning) {
    block('Panning legality (' + escHtml(legality.panning.state || 'unconfirmed') + ')',
      escHtml(legality.panning.text || '') + (legality.panning.source_url ? ' <a href="' + escHtml(legality.panning.source_url) + '" target="_blank" rel="noopener">source</a>' : ''));
  }
  if (legality.camping) {
    block('Camping legality (' + escHtml(legality.camping.state || 'unconfirmed') + ')',
      escHtml(legality.camping.text || '') + (legality.camping.source_url ? ' <a href="' + escHtml(legality.camping.source_url) + '" target="_blank" rel="noopener">source</a>' : ''));
  }
  if (leg.gold) {
    block('Gold record', escHtml(leg.gold.record || ''));
    block('Gold pressure', escHtml(leg.gold.pressure || ''));
    block('Geology', escHtml(leg.gold.geology || ''));
    if (Array.isArray(leg.gold.sources) && leg.gold.sources.length) {
      block('Sources', leg.gold.sources.map(s => (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) ? '<a href="' + escHtml(s) + '" target="_blank" rel="noopener">' + escHtml(s) + '</a>' : escHtml(s)).join('<br>'));
    }
  }
  block('Water', leg.water ? escHtml(leg.water) : '');
  block('Bears', leg.bears ? escHtml(leg.bears) : '');
  block('Fires', leg.fires ? escHtml(leg.fires) : '');
  if (leg.access_note) block('Access', escHtml(leg.access_note));
  if (leg.note) block('Note', escHtml(leg.note));
  return rowsHtml.join('');
}
function toggleLegDetail(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}
window.toggleLegDetail = toggleLegDetail;

function renderDayPanel(n) {
  const body = document.getElementById('dayBody');
  const hint = document.getElementById('dayHint');
  if (n == null) { hint.style.display = ''; body.innerHTML = ''; return; }
  hint.style.display = 'none';
  const day = DAYS.find(d => d.day === n);
  if (!day) { body.innerHTML = ''; return; }
  let driveMi = 0, walkMi = 0, gainFt = 0, totalMin = 0, approxCount = 0, retimedCount = 0, rows = '';
  day.legs.forEach((leg, legIdx) => {
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
    const isUnconfirmedAccess = leg.access_confidence === 'unconfirmed';
    if (isApprox) approxCount++;
    if (isRetimed) retimedCount++;
    const isPan = leg.type === 'pan';
    const detailId = 'legdetail-' + day.day + '-' + legIdx;
    const rowClass = 'leg-row' + (isPan ? ' pan-row' : '');
    const rowClick = isPan ? ' onclick="toggleLegDetail(&quot;' + detailId + '&quot;)"' : '';
    const stepNums = dayLegStepNumberById[day.day] || [];
    const stepN = stepNums[legIdx];
    const stepBadge = stepN != null ? '<span class="step-num" title="Marker ' + stepN + ' on the map">' + stepN + '</span>' : '';
    rows += '<li class="' + rowClass + '"' + rowClick + '>' + stepBadge + '<span class="ic">' + ic + '</span><span class="body"><span class="lbl">' + escHtml(leg.label) + '</span>' +
      (isApprox ? '<span class="approx-tag">~ approx</span>' : '') + (isRetimed ? '<span class="gravel-tag">gravel &mdash; est.</span>' : '') +
      (isUnconfirmedAccess ? '<span class="access-tag" title="' + escHtml(leg.access_note || '') + '">~ access unconfirmed</span>' : '') +
      (isPan ? '<span class="unverified-chip">amber &middot; unverified &#9662;</span>' : '') +
      '<div class="meta">' + meta.join(' &middot; ') + '</div>' +
      (isPan ? '<div class="leg-detail" id="' + detailId + '">' + panLegDetailHtml(leg) + '</div>' : '') +
      '</span></li>';
  });
  const endClock = addMinutesClock(day.start.time, totalMin);
  const prevBtn = n > 1 ? '<button class="panel-nav-btn" onclick="selectDay(' + (n - 1) + ')">&larr; Day ' + (n - 1) + '</button>' : '';
  const nextIdx = DAYS.findIndex(d => d.day === n) + 1;
  const nextBtn = nextIdx < DAYS.length ? '<button class="panel-nav-btn" onclick="selectDay(' + DAYS[nextIdx].day + ')">Day ' + DAYS[nextIdx].day + ' &rarr;</button>' : '';
  const optionalTag = day.optional ? '<span class="optional-tag">optional</span>' : '';
  let html = '<div class="day-nav-row">' + prevBtn + '<h3>Day ' + day.day + ' &mdash; ' + escHtml(day.title) + optionalTag + '</h3>' + nextBtn + '</div>';
  html += '<div class="day-sub">' + escHtml(day.date) + (day.start.time ? ' &middot; starts ' + day.start.time : '') + '</div>';
  if (day.optional && day.optional_note) html += '<div class="optional-note"><b>Optional:</b> ' + escHtml(day.optional_note) + '</div>';
  if (day.note) html += '<div class="optional-note">' + escHtml(day.note) + '</div>';
  if (day.fallback_note) html += '<div class="optional-note"><b>Fallback:</b> ' + escHtml(day.fallback_note) + '</div>';
  html += '<ul class="leg-list">' + rows + '</ul>';
  const activeHrs = totalMin / 60;
  const overLong = activeHrs > 11;
  html += '<div class="day-totals"><b>Day totals</b>Drive: ' + driveMi.toFixed(1) + ' mi &nbsp;|&nbsp; Walk: ' + walkMi.toFixed(2) + ' mi &nbsp;|&nbsp; Ascent: ' + Math.round(gainFt) + ' ft<br>' +
    'Active hours: <span' + (overLong ? ' style="color:#7a5b00;font-weight:700;"' : '') + '>' + activeHrs.toFixed(1) + ' hr</span> (' + totalMin + ' min)' +
    (day.start.time ? ' from ' + day.start.time + (endClock ? ' to ~' + endClock : '') : '') +
    (overLong ? '<br><span style="background:#fff3cd;color:#7a5b00;border:1px solid #e6c260;border-radius:4px;padding:3px 6px;display:inline-block;margin-top:3px;">&#9888; over 11h active — long day, check the schedule</span>' : '') +
    (approxCount ? '<br><span style="color:#7a5b00;">' + approxCount + ' leg(s) use approximate geometry — dashed on the map.</span>' : '') + '</div>';
  if (retimedCount) {
    let note = retimedCount + ' drive leg(s) on this day include a gravel-speed estimate (15 mph assumed on unpaved/track roads) rather than OSRM’s routed time — see "gravel — est." above.';
    if (day.day === 4) note += ' Recommend a Google Maps cross-check for this GA-348 loop before relying on the schedule.';
    if (day.day === 5 || day.day === 6) note += ' Recommend a Google Maps cross-check for the Vogel ↔ Three Forks drive before relying on the schedule.';
    html += '<div class="cross-check-note">' + note + '</div>';
  }
  body.innerHTML = html;
}
// updateDayStripActive() is defined further down, right after the DayStrip
// control (it needs to scope its selector to just the day-number row, not
// the variant-row buttons that live in the same control box).
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
  const overlayPanel = rectOf('.overlay-panel');
  [zoom, strip].forEach(r => {
    if (!r) return;
    left = Math.max(left, r.right - mapRect.left + MARGIN);
    top = Math.max(top, r.bottom - mapRect.top + MARGIN);
  });
  if (legend) {
    left = Math.max(left, legend.right - mapRect.left + MARGIN);
    bottom = Math.max(bottom, mapRect.bottom - legend.top + MARGIN);
  }
  [layers, overlayPanel].forEach(r => {
    if (!r) return;
    right = Math.max(right, mapRect.right - r.left + MARGIN);
    top = Math.max(top, r.bottom - mapRect.top + MARGIN);
  });
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

// Variant switch (task: "lives with the day strip/day panel, not floating
// over the map, remembers the choice in localStorage, re-renders days for
// the chosen variant"). Lives in the SAME control box as the day-number
// strip below it, as one more row — no new floating element, so
// computeFitPadding()'s existing .day-strip measurement already covers it.
function renderDayRow(container) {
  let html = '<button data-day="all" class="' + (selectedDay == null ? 'active' : '') + '">All</button>';
  for (const day of DAYS) html += '<button data-day="' + day.day + '" class="' + (selectedDay === day.day ? 'active' : '') + '">' + day.day + (day.optional ? '*' : '') + '</button>';
  html += '<span class="hint">&larr;&rarr; keys step days' + (DAYS.some(d => d.optional) ? ' &middot; * optional' : '') + '</span>';
  container.innerHTML = html;
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.getAttribute('data-day');
      if (d === 'all') selectAllDays(); else selectDay(parseInt(d, 10));
    });
  });
}
function renderVariantRow(container) {
  if (!VARIANTS) { container.style.display = 'none'; return; }
  let html = '';
  for (const v of VARIANTS) html += '<button data-variant="' + escHtml(v.id) + '" class="' + (v.id === currentVariantId ? 'active' : '') + '" title="' + escHtml(v.label) + '">' + escHtml(v.label) + '</button>';
  if (VARIANTS.length > 1) html += '<button class="cmp" data-compare="1" title="Compare the backcountry options side by side">Compare</button>';
  container.innerHTML = html;
  container.querySelectorAll('button[data-variant]').forEach(btn => {
    btn.addEventListener('click', () => applyVariant(btn.getAttribute('data-variant')));
  });
  container.querySelectorAll('button[data-compare]').forEach(btn => btn.addEventListener('click', showCompare));
}
// Side-by-side compare (one tap from the variant row). Every number is summed
// from DATA.days.variants at load time — nothing is typed in here. Rows are the
// calendar dates on which the variants' legs differ; identical days are omitted.
function cmpSummarize(day) {
  const r = { walkMi: 0, gain: 0, walkMin: 0, driveMi: 0, driveMin: 0, panMin: 0, panN: 0, campMealMin: 0, acc: [], notes: [], title: day.title };
  for (const l of day.legs) {
    if (l.type === 'walk') { r.walkMi += l.miles; r.gain += (l.gain_ft || 0); r.walkMin += l.minutes; }
    else if (l.type === 'drive') { r.driveMi += l.miles; r.driveMin += l.minutes; }
    else if (l.type === 'pan') { r.panMin += l.minutes; r.panN++; }
    else if (l.type === 'camp' || l.type === 'meal') { r.campMealMin += (l.minutes || 0); }
    if (l.access_confidence === 'unconfirmed' && l.access_note && !r.acc.includes(l.access_note)) r.acc.push(l.access_note);
  }
  r.accLegs = day.legs.filter(l => l.access_confidence === 'unconfirmed').length;
  if (day.optional_note) r.notes.push('Optional: ' + day.optional_note);
  if (day.note && day.optional) r.notes.push(day.note);
  if (day.fallback_note) r.notes.push('Fallback: ' + day.fallback_note);
  r.sig = day.title + '|' + day.legs.map(l => l.type + l.label + (l.miles || '') + l.minutes).join(';');
  return r;
}
function cmpCell(r) {
  if (!r) return '<td>&mdash; (no day)</td>';
  let h = '<td><b>' + escHtml(r.title) + '</b><br>Walk ' + r.walkMi.toFixed(2) + ' mi &middot; +' + Math.round(r.gain) + ' ft &middot; ' + r.walkMin + ' min' +
    '<br>Pan ' + (r.panMin / 60).toFixed(1) + ' h (' + r.panN + ' stop' + (r.panN === 1 ? '' : 's') + ')' +
    '<br>Drive ' + r.driveMi.toFixed(1) + ' mi &middot; ' + r.driveMin + ' min' +
    (r.campMealMin ? '<br>Camp &amp; meals ' + r.campMealMin + ' min' : '');
  const q = [];
  if (r.panN) q.push(r.panN + ' pan stop' + (r.panN === 1 ? '' : 's') + ' amber (no ranger confirmation)');
  if (r.accLegs) q.push(r.accLegs + ' leg' + (r.accLegs === 1 ? '' : 's') + ' access unconfirmed');
  if (q.length || r.notes.length) {
    h += '<details><summary>Open questions (' + (q.length + r.notes.length) + ')</summary>' +
      q.map(x => '<div>&bull; ' + escHtml(x) + '</div>').join('') +
      r.acc.map(x => '<div>&bull; ' + escHtml(x) + '</div>').join('') +
      r.notes.map(x => '<div>&bull; ' + escHtml(x) + '</div>').join('') + '</details>';
  }
  return h + '</td>';
}
function showCompare() {
  if (!VARIANTS || VARIANTS.length < 2) return;
  if (selectedDay != null && dayHighlightLayers[selectedDay]) map.removeLayer(dayHighlightLayers[selectedDay]);
  selectedDay = null; dimBackground(false); updateDayStripActive(null);
  const by = VARIANTS.map(v => { const m = {}; for (const d of v.days) m[d.date] = cmpSummarize(d); return m; });
  const dates = Array.from(new Set(by.flatMap(m => Object.keys(m)))).sort().filter(dt => new Set(by.map(m => m[dt] ? m[dt].sig : '')).size > 1);
  const tot = by.map(() => ({ walkMi: 0, gain: 0, walkMin: 0, panMin: 0, driveMi: 0, driveMin: 0, campMealMin: 0 }));
  let html = '<div class="day-nav-row"><h3>Compare &mdash; days that differ</h3></div><div class="cmp-note">Same on both: everything else (Oct 15, 16, 21 unless shown). Amber = nothing confirmed by a ranger.</div><div class="cmp-wrap"><table class="cmp-tbl"><tr><th></th>' + VARIANTS.map(v => '<th>' + escHtml(v.label) + '</th>').join('') + '</tr>';
  for (const dt of dates) {
    html += '<tr><td class="lbl">' + escHtml(dt.slice(5)) + '</td>';
    by.forEach((m, i) => { html += cmpCell(m[dt]); const r = m[dt]; if (r) for (const k in tot[i]) tot[i][k] += r[k]; });
    html += '</tr>';
  }
  html += '<tr class="tot"><td class="lbl">Total (these days)</td>' + tot.map(t => '<td>Walk ' + t.walkMi.toFixed(2) + ' mi &middot; +' + Math.round(t.gain) + ' ft &middot; ' + t.walkMin + ' min<br>Pan ' + (t.panMin / 60).toFixed(1) + ' h<br>Drive ' + t.driveMi.toFixed(1) + ' mi &middot; ' + t.driveMin + ' min<br>Camp &amp; meals ' + t.campMealMin + ' min</td>').join('') + '</tr></table></div>';
  document.getElementById('dayHint').style.display = 'none';
  document.getElementById('dayBody').innerHTML = html;
  document.getElementById('dayBody').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
let dayStripDayRowEl = null, dayStripVariantRowEl = null;
function applyVariant(id) {
  if (VARIANTS && !VARIANTS.some(v => v.id === id)) return;
  if (id === currentVariantId) return;
  currentVariantId = id;
  try { localStorage.setItem(VARIANT_LS_KEY, id); } catch (e) { /* private window / blocked storage */ }
  if (selectedDay != null && dayHighlightLayers[selectedDay]) map.removeLayer(dayHighlightLayers[selectedDay]);
  selectedDay = null;
  DAYS = daysForCurrentVariant();
  rebuildDayLayers();
  dimBackground(false);
  if (dayStripDayRowEl) renderDayRow(dayStripDayRowEl);
  if (dayStripVariantRowEl) renderVariantRow(dayStripVariantRowEl);
  renderDayPanel(null);
}
const DayStrip = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const div = L.DomUtil.create('div', 'day-strip');
    L.DomEvent.disableClickPropagation(div);
    dayStripVariantRowEl = L.DomUtil.create('div', 'variant-row', div);
    dayStripDayRowEl = L.DomUtil.create('div', 'day-row', div);
    renderVariantRow(dayStripVariantRowEl);
    renderDayRow(dayStripDayRowEl);
    return div;
  },
});
if (DAYS.length) new DayStrip().addTo(map);

function updateDayStripActive(n) {
  document.querySelectorAll('.day-strip .day-row button').forEach(btn => {
    const d = btn.getAttribute('data-day');
    btn.classList.toggle('active', (n == null && d === 'all') || (n != null && d === String(n)));
  });
}

document.addEventListener('keydown', e => {
  if (!DAYS.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const cur = selectedDay == null ? 0 : DAYS.findIndex(d => d.day === selectedDay) + 1;
  if (e.key === 'ArrowRight') {
    const nxtIdx = Math.min(DAYS.length, cur + 1) - 1;
    if (nxtIdx >= 0 && nxtIdx < DAYS.length) selectDay(DAYS[nxtIdx].day);
  } else {
    const prvIdx = cur - 2;
    if (prvIdx >= 0) selectDay(DAYS[prvIdx].day); else selectAllDays();
  }
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
