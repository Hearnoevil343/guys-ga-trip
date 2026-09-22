// Task 7: from Calf Stomp Gap and from the DRT/Coosa Backcountry Trail near
// Coosa Bald, what mapped track/path (if any) leads down to upper Coosa
// Creek on FS land?
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToMiles, metersToFeet, fetchElevationsMeters } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));
const streamsData = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_streams_data.json'), 'utf8'));
const chains = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_trail_chains.json'), 'utf8'));
const chain = chains[0];

const CALF_STOMP_GAP = [34.7862007, -83.9537995];
const COOSA_BALD_TRAIL_PT = [34.777407, -83.960630]; // nearest chain vertex to Coosa Bald peak (idx884)

// Coosa Creek combined points (upper reach = East Fork Coosa Creek, closest
// to Coosa Bald/Calf Stomp Gap on the west side of the Duncan Ridge divide).
const efcc = streamsData.coosaCreek.eastForkCoosaCreek.coords;
const wfcc = streamsData.coosaCreek.westForkCoosaCreek.coords;
const allCoosa = [...efcc.map(p => ({ p, reach: 'East Fork Coosa Creek' })), ...wfcc.map(p => ({ p, reach: 'West Fork Coosa Creek' }))];

function nearestCoosaPt(latlng) {
  let best = Infinity, bestPt = null, bestReach = null;
  for (const c of allCoosa) {
    const d = haversineMeters(latlng[0], latlng[1], c.p[0], c.p[1]);
    if (d < best) { best = d; bestPt = c.p; bestReach = c.reach; }
  }
  return { dist: best, pt: bestPt, reach: bestReach };
}

console.log('=== Straight-line distance, Calf Stomp Gap -> nearest Coosa Creek point ===');
const r1 = nearestCoosaPt(CALF_STOMP_GAP);
console.log(`Calf Stomp Gap ${CALF_STOMP_GAP} -> ${r1.reach} @ ${r1.pt}: ${(r1.dist/1000).toFixed(2)} km (${metersToMiles(r1.dist).toFixed(2)} mi)`);

console.log('\n=== Straight-line distance, DRT/CBT near Coosa Bald -> nearest Coosa Creek point ===');
const r2 = nearestCoosaPt(COOSA_BALD_TRAIL_PT);
console.log(`Trail pt near Coosa Bald ${COOSA_BALD_TRAIL_PT} -> ${r2.reach} @ ${r2.pt}: ${(r2.dist/1000).toFixed(2)} km (${metersToMiles(r2.dist).toFixed(2)} mi)`);

// Also check EVERY vertex of the whole 12.9mi trail loop against Coosa Creek,
// to find the single closest approach anywhere on the trail (not just near
// Coosa Bald/Calf Stomp Gap specifically).
console.log('\n=== Closest approach of ANY point on the full 12.9mi CBT/DRT loop to Coosa Creek ===');
let bestAny = Infinity, bestAnyChainPt = null, bestAnyCoosaPt = null, bestAnyReach = null;
for (const p of chain) {
  const r = nearestCoosaPt(p);
  if (r.dist < bestAny) { bestAny = r.dist; bestAnyChainPt = p; bestAnyCoosaPt = r.pt; bestAnyReach = r.reach; }
}
console.log(`Closest: trail pt ${bestAnyChainPt} -> ${bestAnyReach} @ ${bestAnyCoosaPt}: ${(bestAny/1000).toFixed(2)} km (${metersToMiles(bestAny).toFixed(2)} mi)`);

// Elevation drop for the two named straight-line legs
const pts = [CALF_STOMP_GAP, r1.pt, COOSA_BALD_TRAIL_PT, r2.pt, bestAnyChainPt, bestAnyCoosaPt];
const elevs = await fetchElevationsMeters(pts, 'task7_elev');
console.log('\nElevations (ft):');
console.log('  Calf Stomp Gap:', metersToFeet(elevs[0]).toFixed(0));
console.log('  nearest Coosa Creek pt to Calf Stomp Gap:', metersToFeet(elevs[1]).toFixed(0), 'drop:', (metersToFeet(elevs[0])-metersToFeet(elevs[1])).toFixed(0));
console.log('  Trail pt near Coosa Bald:', metersToFeet(elevs[2]).toFixed(0));
console.log('  nearest Coosa Creek pt to that trail pt:', metersToFeet(elevs[3]).toFixed(0), 'drop:', (metersToFeet(elevs[2])-metersToFeet(elevs[3])).toFixed(0));
console.log('  Closest-approach trail pt (anywhere on loop):', metersToFeet(elevs[4]).toFixed(0));
console.log('  its nearest Coosa Creek pt:', metersToFeet(elevs[5]).toFixed(0), 'drop:', (metersToFeet(elevs[4])-metersToFeet(elevs[5])).toFixed(0));

// Now: is there ANY mapped track/path (of any name/no name) whose geometry
// bridges from the DRT/Duncan Ridge Road corridor (lng roughly -83.94 to
// -83.965, the ridge) over to the East/West Fork Coosa Creek corridor (lng
// roughly -83.99 to -84.03)? Check all trail/road features for any vertex
// west of -83.97 longitude (i.e., actually on the Coosa Creek side of the
// ridge) that ALSO has a vertex east of -83.96 (ridge side) in the same way —
// i.e. does any single mapped way actually cross the divide?
console.log('\n=== Do any mapped trail/road features cross the ridge (lng -83.97 to -83.96) between Coosa Bald/Calf Stomp corridor and Coosa Creek? ===');
const roadFeats = fc.features.filter(f => f.properties.highway);
let crossers = [];
for (const f of roadFeats) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  for (const line of lines) {
    const lngs = line.map(([lng]) => lng);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    if (minLng < -83.97 && maxLng > -83.955) {
      crossers.push({ name: f.properties.name, ref: f.properties.ref, highway: f.properties.highway, minLng, maxLng });
    }
  }
}
if (crossers.length) {
  for (const c of crossers) console.log(' ', c);
} else {
  console.log('  NONE — no single mapped way spans from the Coosa Bald/Calf Stomp ridge corridor (east of -83.96) across to the Coosa Creek side (west of -83.97). No mapped route down to upper Coosa Creek exists from this trail corridor in OSM.');
}

fs.writeFileSync(path.join(__dirname, '_coosa_task7_data.json'), JSON.stringify({ r1, r2, bestAny, bestAnyChainPt, bestAnyCoosaPt, bestAnyReach, elevs, crossers }));
console.log('\nWrote _coosa_task7_data.json');
