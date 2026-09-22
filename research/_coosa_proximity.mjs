// Task 2 continued: which roads/trails/tracks touch or come within 200m of
// Coosa Creek (and where); where the Coosa Backcountry Trail crosses any
// stream (lat,lng + stream name or "unnamed").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToFeet } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));
const streamsData = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_streams_data.json'), 'utf8'));
const chains = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_trail_chains.json'), 'utf8'));

// Combined Coosa Creek point set (WFCC + EFCC + mainstem), each point tagged
// with which reach it's from (for locating "where").
const coosaPts = [
  ...streamsData.coosaCreek.westForkCoosaCreek.coords.map(p => ({ p, reach: 'West Fork Coosa Creek' })),
  ...streamsData.coosaCreek.eastForkCoosaCreek.coords.map(p => ({ p, reach: 'East Fork Coosa Creek' })),
  ...streamsData.coosaCreek.mainstem.coords.map(p => ({ p, reach: 'Coosa Creek mainstem' })),
];

function minDistToCoosa(lat, lng) {
  let best = Infinity, bestReach = null, bestPt = null;
  for (const cp of coosaPts) {
    const d = haversineMeters(lat, lng, cp.p[0], cp.p[1]);
    if (d < best) { best = d; bestReach = cp.reach; bestPt = cp.p; }
  }
  return { dist: best, reach: bestReach, pt: bestPt };
}

// For every trail/road way, find the closest approach to Coosa Creek.
const roadFeats = fc.features.filter(f => f.properties.highway);
console.log('=== Roads/trails/tracks within 200m of Coosa Creek (any reach) ===');
const hits = [];
for (const f of roadFeats) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  let best = Infinity, bestLatLng = null, bestReach = null;
  for (const line of lines) {
    for (const [lng, lat] of line) {
      const r = minDistToCoosa(lat, lng);
      if (r.dist < best) { best = r.dist; bestLatLng = [lat, lng]; bestReach = r.reach; }
    }
  }
  if (best <= 200) {
    hits.push({ name: f.properties.name, ref: f.properties.ref, highway: f.properties.highway, distM: best, at: bestLatLng, nearReach: bestReach });
  }
}
hits.sort((a, b) => a.distM - b.distM);
for (const h of hits) {
  console.log(`  ${(h.name || '(unnamed)')} [${h.highway}${h.ref ? ' ' + h.ref : ''}]: ${h.distM.toFixed(0)}m from ${h.nearReach} at ${h.at[0].toFixed(6)},${h.at[1].toFixed(6)}`);
}
if (!hits.length) console.log('  none found within 200m');

// ---------------------------------------------------------------------------
// Coosa Backcountry Trail stream crossings: walk the merged 12.9mi chain and
// flag points where distance to ANY named or unnamed stream way drops below
// a small threshold (crossing proxy), using vertex-to-vertex proximity.
// ---------------------------------------------------------------------------
const streamFeats = fc.features.filter(f => f.properties.waterway);
const streamLines = [];
for (const f of streamFeats) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  for (const l of lines) streamLines.push({ name: f.properties.name || 'unnamed', coords: l.map(([lng, lat]) => [lat, lng]) });
}

function minDistToAnyStream(lat, lng) {
  let best = Infinity, bestName = null;
  for (const sl of streamLines) {
    for (const [slat, slng] of sl.coords) {
      const d = haversineMeters(lat, lng, slat, slng);
      if (d < best) { best = d; bestName = sl.name; }
    }
  }
  return { dist: best, name: bestName };
}

const CROSS_THRESHOLD_M = 25; // vertex-to-vertex proxy for "crosses"
console.log('\n=== Coosa Backcountry Trail (merged 12.9mi chain) stream crossings (<=25m) ===');
const chain = chains[0]; // single merged chain confirmed earlier
const crossings = [];
let lastFlag = -10;
for (let i = 0; i < chain.length; i++) {
  const [lat, lng] = chain[i];
  const r = minDistToAnyStream(lat, lng);
  if (r.dist <= CROSS_THRESHOLD_M) {
    if (i - lastFlag > 3) { // dedupe consecutive close vertices into one crossing event
      crossings.push({ idx: i, lat, lng, streamName: r.name, distM: r.dist });
    }
    lastFlag = i;
  }
}
for (const c of crossings) console.log(`  idx ${c.idx}: ${c.lat.toFixed(6)},${c.lng.toFixed(6)} — ${c.streamName} (${c.distM.toFixed(0)}m to nearest stream vertex)`);
console.log(`Total crossing events: ${crossings.length}`);

fs.writeFileSync(path.join(__dirname, '_coosa_proximity_data.json'), JSON.stringify({ hits, crossings }));
console.log('\nWrote _coosa_proximity_data.json');
