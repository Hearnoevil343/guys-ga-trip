// Task 6 continued: elevation gain/loss per leg along the Coosa Backcountry
// Trail from Vogel trailhead, sampled every ~100m via opentopodata.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToMiles, metersToFeet, resampleAlong, fetchElevationsMeters } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chains = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_trail_chains.json'), 'utf8'));
const chain = chains[0];
const targetData = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_trail_targets.json'), 'utf8'));
const trailheadIdx = targetData.trailheadIdx;

// Walking order: trailhead (idx 1946) down to chain start (idx 0).
const subchain = chain.slice(0, trailheadIdx + 1).slice().reverse();
console.log('Subchain (trailhead -> chain start), pts:', subchain.length);

const resampled = resampleAlong(subchain, 100, 250);
console.log('Resampled @100m:', resampled.length, 'pts');
// resampleAlong places points at even fractions of the ORIGINAL (full-res)
// subchain arc length, so the correct cumulative distance for sample i is
// (i/(n-1)) * subchainTotal — NOT the chord-sum of the (coarser) resampled
// points, which undercounts on switchbacks. Compute subchainTotal directly.
let subchainTotalM = 0;
for (let i = 1; i < subchain.length; i++) subchainTotalM += haversineMeters(subchain[i-1][0], subchain[i-1][1], subchain[i][0], subchain[i][1]);
const cumR = resampled.map((_, i) => (i / (resampled.length - 1)) * subchainTotalM);
console.log('Subchain true total length:', metersToMiles(subchainTotalM).toFixed(3), 'mi (used for leg binning)');

const elevsM = await fetchElevationsMeters(resampled, 'cbt_trail_elev');
console.log('Fetched', elevsM.length, 'elevations');

// Legs in walking order: trailhead -> Burnett Gap -> WFWC/FS107 -> Locust
// Stake Gap -> Calf Stomp Gap -> Coosa Bald -> Wildcat Knob -> Wolfpen Gap ->
// (gap) -> Vogel.
const order = ['Burnett Gap', 'West Fork Wolf Creek / FS 107 crossing', 'Locust Stake Gap', 'Calf Stomp Gap (FS 108)', 'Coosa Bald', 'Wildcat Knob (proxy for "Wildcat Gap" — no distinct gap found)', 'Wolfpen Gap (GA 180) — GNIS/Wikipedia point'];
const byName = Object.fromEntries(targetData.targetHits.map(t => [t.name, t]));

const legStops = [{ name: 'Vogel trailhead', distMi: 0 }];
for (const name of order) legStops.push({ name, distMi: byName[name].alongChainMiFromTrailhead });
legStops.push({ name: 'chain start (near Vogel, gap to trailhead ~0.35mi unmapped)', distMi: metersToMiles(cumR[cumR.length-1]) });

console.log('\n=== Leg-by-leg elevation gain/loss (100m samples) ===');
function elevStatsForRange(distMiFrom, distMiTo) {
  const mFrom = distMiFrom * 1609.344, mTo = distMiTo * 1609.344;
  let gainFt = 0, lossFt = 0, startElevFt = null, endElevFt = null;
  for (let i = 0; i < resampled.length; i++) {
    if (cumR[i] < mFrom - 1 || cumR[i] > mTo + 1) continue;
    if (startElevFt === null) startElevFt = metersToFeet(elevsM[i]);
    endElevFt = metersToFeet(elevsM[i]);
  }
  for (let i = 1; i < resampled.length; i++) {
    if (cumR[i] < mFrom || cumR[i] > mTo) continue;
    const dz = metersToFeet(elevsM[i]) - metersToFeet(elevsM[i-1]);
    if (dz > 0) gainFt += dz; else lossFt += -dz;
  }
  return { gainFt, lossFt, startElevFt, endElevFt };
}

let prevDist = 0;
for (let i = 1; i < legStops.length; i++) {
  const { gainFt, lossFt, startElevFt, endElevFt } = elevStatsForRange(prevDist, legStops[i].distMi);
  console.log(`${legStops[i-1].name} -> ${legStops[i].name}: ${(legStops[i].distMi - prevDist).toFixed(2)} mi, elev ${startElevFt?.toFixed(0)}->${endElevFt?.toFixed(0)} ft, gain +${gainFt.toFixed(0)} ft, loss -${lossFt.toFixed(0)} ft`);
  prevDist = legStops[i].distMi;
}

fs.writeFileSync(path.join(__dirname, '_coosa_trail_elev_data.json'), JSON.stringify({ resampled, cumR, elevsM, legStops }));
console.log('\nWrote _coosa_trail_elev_data.json');
