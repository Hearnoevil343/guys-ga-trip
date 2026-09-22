// Task 6: distances along the merged Coosa Backcountry Trail chain from the
// Vogel trailhead to named gaps/features, with cumulative elevation gain/loss.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToMiles, resampleAlong, fetchElevationsMeters, metersToFeet } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chains = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_trail_chains.json'), 'utf8'));
const chain = chains[0]; // 1948 pts, 12.935mi, confirmed single merged loop-with-gap

// cumulative distance array along the chain (meters), from chain[0]
const cum = [0];
for (let i = 1; i < chain.length; i++) cum.push(cum[i-1] + haversineMeters(chain[i-1][0], chain[i-1][1], chain[i][0], chain[i][1]));
const totalM = cum[cum.length - 1];
console.log('Chain total length:', metersToMiles(totalM).toFixed(3), 'mi,', chain.length, 'pts');

const VOGEL = [34.765883, -83.925416];
// trailhead = nearest chain vertex to Vogel walk-in site (found earlier: idx 1946, ~248m away)
let trailheadIdx = -1, best = Infinity;
chain.forEach((p, i) => { const d = haversineMeters(VOGEL[0], VOGEL[1], p[0], p[1]); if (d < best) { best = d; trailheadIdx = i; } });
console.log('Trailhead (nearest chain pt to Vogel walk-in site, 251m away):', trailheadIdx, chain[trailheadIdx]);

const TARGETS = [
  { name: 'Burnett Gap', latlng: [34.7681459, -83.9393548] },
  { name: 'Locust Stake Gap', latlng: [34.7925898, -83.9399096] },
  { name: 'Calf Stomp Gap (FS 108)', latlng: [34.7862007, -83.9537995] },
  { name: 'Coosa Bald', latlng: [34.7789785, -83.9635224] },
  { name: 'Wildcat Knob (proxy for "Wildcat Gap" — no distinct gap found)', latlng: [34.7687010, -83.9571335] },
  { name: 'Wolfpen Gap (GA 180) — GNIS/Wikipedia point', latlng: [34.764, -83.9521] },
];

// nearest chain vertex + along-chain distance from trailhead (both directions)
function nearestIdx(latlng) {
  let bi = -1, bd = Infinity;
  chain.forEach((p, i) => { const d = haversineMeters(latlng[0], latlng[1], p[0], p[1]); if (d < bd) { bd = d; bi = i; } });
  return { idx: bi, distM: bd };
}
function alongChainDist(fromIdx, toIdx) {
  // chain is NOT a closed loop (start/end don't connect); simple |cum diff|
  return Math.abs(cum[toIdx] - cum[fromIdx]);
}

console.log('\n=== Target proximity to chain ===');
const targetHits = [];
for (const t of TARGETS) {
  const r = nearestIdx(t.latlng);
  const distFromTrailheadM = alongChainDist(trailheadIdx, r.idx);
  targetHits.push({ ...t, chainIdx: r.idx, offTrailM: r.distM, alongChainMiFromTrailhead: metersToMiles(distFromTrailheadM), chainPt: chain[r.idx] });
  console.log(`${t.name}: nearest chain vertex idx ${r.idx} (${r.distM.toFixed(0)}m off-trail) at ${chain[r.idx][0].toFixed(6)},${chain[r.idx][1].toFixed(6)}; along-chain dist from trailhead = ${metersToMiles(distFromTrailheadM).toFixed(2)} mi`);
}

// West Fork Wolf Creek / FS 107 crossing: find where the CHAIN crosses West
// Wolf Creek Road (FS 107) AND is near West Fork Wolf Creek.
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));
const fs107 = fc.features.find(f => f.properties.name === 'West Wolf Creek Road');
const fs107coords = fs107.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
let bestCross = { idx: -1, dist: Infinity };
chain.forEach((p, i) => {
  let d = Infinity;
  for (const rp of fs107coords) { const dd = haversineMeters(p[0], p[1], rp[0], rp[1]); if (dd < d) d = dd; }
  if (d < bestCross.dist) bestCross = { idx: i, dist: d };
});
console.log(`\nWest Fork Wolf Creek / FS 107 (West Wolf Creek Road) crossing: chain idx ${bestCross.idx} at ${chain[bestCross.idx][0].toFixed(6)},${chain[bestCross.idx][1].toFixed(6)}, ${bestCross.dist.toFixed(0)}m from FS107 centerline, along-chain from trailhead = ${metersToMiles(alongChainDist(trailheadIdx, bestCross.idx)).toFixed(2)} mi`);
targetHits.push({ name: 'West Fork Wolf Creek / FS 107 crossing', chainIdx: bestCross.idx, offTrailM: bestCross.dist, alongChainMiFromTrailhead: metersToMiles(alongChainDist(trailheadIdx, bestCross.idx)), chainPt: chain[bestCross.idx] });

fs.writeFileSync(path.join(__dirname, '_coosa_trail_targets.json'), JSON.stringify({ trailheadIdx, totalM, cum, targetHits }));
console.log('\nWrote _coosa_trail_targets.json');
