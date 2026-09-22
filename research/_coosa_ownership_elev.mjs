// Tasks 3 & 4: USFS ownership sampling every ~250m along Coosa Creek (West
// Fork, East Fork, mainstem) and West Fork Wolf Creek; wilderness/state-park
// point-in-polygon check; elevation + gradient per contiguous FS reach.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToMiles, metersToFeet, resampleAlong, fetchElevationsMeters, fetchCachedJSON } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const streamsData = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_streams_data.json'), 'utf8'));
const wilderness = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'map', 'data', 'wilderness.geojson'), 'utf8'));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Point-in-polygon (ray casting), handles Polygon and MultiPolygon geojson
// geometries. coordsLatLng point as [lat,lng]; geojson rings are [lng,lat].
// ---------------------------------------------------------------------------
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygonFeature(lat, lng, geom) {
  if (geom.type === 'Polygon') {
    if (!pointInRing(lat, lng, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) if (pointInRing(lat, lng, geom.coordinates[i])) return false;
    return true;
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInRing(lat, lng, poly[0])) {
        let hole = false;
        for (let i = 1; i < poly.length; i++) if (pointInRing(lat, lng, poly[i])) hole = true;
        if (!hole) return true;
      }
    }
    return false;
  }
  return false;
}
function whichWilderness(lat, lng) {
  for (const f of wilderness.features) {
    if (pointInPolygonFeature(lat, lng, f.geometry)) return f.properties.name || JSON.stringify(f.properties);
  }
  return null;
}

// ---------------------------------------------------------------------------
// USFS ownership point query (cached).
// ---------------------------------------------------------------------------
async function ownershipAt(lat, lng, cacheKey) {
  const url = `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNERCLASSIFICATION&returnGeometry=false&f=json`;
  const json = await fetchCachedJSON(url, cacheKey, { politeMs: 900 });
  if (json.features && json.features.length && json.features[0].attributes) {
    return json.features[0].attributes.OWNERCLASSIFICATION || 'USDA FOREST SERVICE';
  }
  return 'NON-FS';
}

async function sampleReach(name, coordsLatLng, keyPrefix) {
  const pts = resampleAlong(coordsLatLng, 250, 300);
  console.log(`\n=== ${name}: ${pts.length} sample points @ ~250m ===`);
  const owners = [];
  for (let i = 0; i < pts.length; i++) {
    const [lat, lng] = pts[i];
    const cacheKey = `${keyPrefix}_own_${i}.json`;
    let owner;
    try {
      owner = await ownershipAt(lat, lng, cacheKey);
    } catch (e) {
      console.warn(`  ownership query failed at ${lat},${lng}: ${e.message}`);
      owner = 'ERROR';
    }
    const wild = whichWilderness(lat, lng);
    owners.push({ idx: i, lat, lng, owner, wilderness: wild });
  }
  // elevations, batched
  const elevsM = await fetchElevationsMeters(pts, `${keyPrefix}_elev`);
  for (let i = 0; i < owners.length; i++) owners[i].elevFt = metersToFeet(elevsM[i]);
  return { name, points: owners, spacingM: 250 };
}

const results = {};
results.westForkCoosaCreek = await sampleReach('West Fork Coosa Creek', streamsData.coosaCreek.westForkCoosaCreek.coords, 'wfcc');
results.eastForkCoosaCreek = await sampleReach('East Fork Coosa Creek', streamsData.coosaCreek.eastForkCoosaCreek.coords, 'efcc');
results.coosaMainstem = await sampleReach('Coosa Creek (mainstem)', streamsData.coosaCreek.mainstem.coords, 'ccms');
results.westForkWolfCreek = await sampleReach('West Fork Wolf Creek', streamsData.westForkWolfCreek.coords, 'wfwc');

fs.writeFileSync(path.join(__dirname, '_coosa_ownership_elev_data.json'), JSON.stringify(results));
console.log('\nWrote _coosa_ownership_elev_data.json');

// ---------------------------------------------------------------------------
// Summarize contiguous FS / NON-FS reaches + gradient per FS reach.
// ---------------------------------------------------------------------------
function summarizeReach(r) {
  const pts = r.points;
  console.log(`\n--- ${r.name}: contiguous ownership reaches ---`);
  let segStart = 0;
  const segments = [];
  for (let i = 1; i <= pts.length; i++) {
    const changed = i === pts.length || (pts[i].owner === 'USDA FOREST SERVICE') !== (pts[segStart].owner === 'USDA FOREST SERVICE');
    if (changed) {
      const segPts = pts.slice(segStart, i);
      const isFS = segPts[0].owner === 'USDA FOREST SERVICE';
      const lenM = segPts.reduce((a, p, idx) => idx === 0 ? 0 : a + haversineMeters(segPts[idx-1].lat, segPts[idx-1].lng, p.lat, p.lng), 0);
      segments.push({ isFS, start: segPts[0], end: segPts[segPts.length-1], lengthMi: metersToMiles(lenM), count: segPts.length });
      segStart = i;
    }
  }
  for (const s of segments) {
    console.log(`  ${s.isFS ? 'USFS' : 'NON-FS'}: ${s.start.lat.toFixed(6)},${s.start.lng.toFixed(6)} -> ${s.end.lat.toFixed(6)},${s.end.lng.toFixed(6)} (${s.lengthMi.toFixed(2)} mi, ${s.count} pts)`);
  }
  const wildHits = pts.filter(p => p.wilderness);
  if (wildHits.length) {
    console.log(`  WILDERNESS/STATE PARK hits: ${wildHits.length} pts`);
    for (const w of wildHits) console.log(`    ${w.lat.toFixed(6)},${w.lng.toFixed(6)}: ${w.wilderness}`);
  } else {
    console.log('  No points inside wilderness.geojson polygons.');
  }
  return segments;
}
for (const key of Object.keys(results)) summarizeReach(results[key]);

console.log('\n=== Gradient per FS reach (ft/mi, contiguous FS-only stretches) ===');
for (const key of Object.keys(results)) {
  const r = results[key];
  const segs = summarizeReach0(r); // recompute silently
}
function summarizeReach0(r) {
  const pts = r.points;
  let segStart = 0;
  const segments = [];
  for (let i = 1; i <= pts.length; i++) {
    const changed = i === pts.length || (pts[i].owner === 'USDA FOREST SERVICE') !== (pts[segStart].owner === 'USDA FOREST SERVICE');
    if (changed) { segments.push(pts.slice(segStart, i)); segStart = i; }
  }
  return segments;
}
for (const key of Object.keys(results)) {
  const r = results[key];
  const segs = summarizeReach0(r);
  console.log(`\n${r.name}:`);
  for (const seg of segs) {
    const isFS = seg[0].owner === 'USDA FOREST SERVICE';
    if (!isFS) continue;
    if (seg.length < 2) { console.log('  (FS reach with <2 sample points, skipping gradient)'); continue; }
    let lenM = 0;
    for (let i = 1; i < seg.length; i++) lenM += haversineMeters(seg[i-1].lat, seg[i-1].lng, seg[i].lat, seg[i].lng);
    const lenMi = metersToMiles(lenM);
    const elevDropFt = seg[0].elevFt - seg[seg.length-1].elevFt;
    const gradFtPerMi = lenMi > 0 ? elevDropFt / lenMi : 0;
    console.log(`  FS reach ${seg[0].lat.toFixed(6)},${seg[0].lng.toFixed(6)} -> ${seg[seg.length-1].lat.toFixed(6)},${seg[seg.length-1].lng.toFixed(6)}: ${lenMi.toFixed(2)}mi, elev ${seg[0].elevFt.toFixed(0)}->${seg[seg.length-1].elevFt.toFixed(0)}ft, avg grade ${gradFtPerMi.toFixed(0)} ft/mi`);
    // per-sample gradient to flag steep->gentle breaks
    for (let i = 1; i < seg.length; i++) {
      const dM = haversineMeters(seg[i-1].lat, seg[i-1].lng, seg[i].lat, seg[i].lng);
      const dFt = seg[i-1].elevFt - seg[i].elevFt;
      const gradLocal = dM > 0 ? dFt / metersToMiles(dM) : 0;
      console.log(`    pt${seg[i-1].idx}->pt${seg[i].idx} (${seg[i].lat.toFixed(6)},${seg[i].lng.toFixed(6)}): ${gradLocal.toFixed(0)} ft/mi`);
    }
  }
}
