import fs from 'node:fs';
import { ownershipAt } from './_noon_ownership.mjs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const CACHE = '_cache_gis';
const UA = 'ga-gold-trip-research/1.0';

async function fetchElevBatch(pts, cacheKey) {
  const cf = `${CACHE}/${cacheKey}.json`;
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const locs = pts.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join('|');
  const url = `https://api.opentopodata.org/v1/aster30m?locations=${locs}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const json = await res.json();
  if (json.status !== 'OK') throw new Error('opentopodata ' + json.status);
  const elevs = json.results.map(r => r.elevation);
  fs.writeFileSync(cf, JSON.stringify(elevs));
  await sleep(1000);
  return elevs;
}

const samples = JSON.parse(fs.readFileSync(`${CACHE}/noontootla_samples250.json`, 'utf8'));

// elevations in batches of 100 (we only have 75, one batch)
const elevs = await fetchElevBatch(samples.map(s => [s[0], s[1]]), 'noon_creek_elev');

const out = [];
for (let i = 0; i < samples.length; i++) {
  const [lat, lng, distM] = samples[i];
  const own = await ownershipAt(lat, lng);
  out.push({ i, lat, lng, distM, elevM: elevs[i], owner: own.owner });
  console.error(i, lat.toFixed(5), lng.toFixed(5), 'elev', elevs[i], own.owner);
}
fs.writeFileSync(`${CACHE}/noontootla_samples_full.json`, JSON.stringify(out, null, 2));
console.error('DONE');
