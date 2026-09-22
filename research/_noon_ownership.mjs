// _noon_ownership.mjs — query USFS EDW_BasicOwnership_01 for centroid + 4 corners
// of each land lot, plus assorted creek/trail sample points. Caches to
// research/_cache_gis/own_<lat>_<lng>.json (rounded to 6dp) to be polite (1 req/sec).
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.join(process.cwd(), '_cache_gis');
if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
const UA = 'ga-gold-trip-research/1.0';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function ownershipAt(lat, lng) {
  const key = `own_${lat.toFixed(6)}_${lng.toFixed(6)}.json`;
  const cf = path.join(CACHE, key);
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const url = `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNERCLASSIFICATION&returnGeometry=false&f=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${lat},${lng}`);
  const json = await res.json();
  const owner = (json.features && json.features[0] && json.features[0].attributes.ownerclassification) || 'NON-FS (no feature returned)';
  const result = { lat, lng, owner, raw: json };
  fs.writeFileSync(cf, JSON.stringify(result));
  await sleep(1000);
  return result;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const lots = JSON.parse(fs.readFileSync('_lots_points.json', 'utf8'));
  const out = {};
  for (const [lotName, pts] of Object.entries(lots)) {
    out[lotName] = {};
    for (const [ptName, [lat, lng]] of Object.entries(pts)) {
      const r = await ownershipAt(lat, lng);
      out[lotName][ptName] = r.owner;
      console.error(lotName, ptName, lat, lng, '->', r.owner);
    }
  }
  fs.writeFileSync('_lots_ownership.json', JSON.stringify(out, null, 2));
}
