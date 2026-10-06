// fetch-tiles.mjs — downloads the offline map tiles packed into the Android app.
// Area = every route point in map/data/days.json plus a pad. Sources are public-domain /
// open-data only (bulk download allowed): USGS Topo, USGS Imagery, AWS Terrarium elevation.
// OSM / OpenTopoMap / Esri tiles are NOT fetched: their terms forbid bulk/offline copies.
// Output: map/tiles/<layer>/<z>/<x>/<y>.<ext> + map/tiles/manifest.json (gitignored; the
// app build copies it in). Re-running skips tiles already on disk.
//   node map/fetch-tiles.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'tiles');
const DRY = process.argv.includes('--dry');
const UA = 'ga-gold-trip-map/1.0 (https://github.com/Hearnoevil343/guys-ga-trip)';

const days = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'days.json'), 'utf8')).days;
const all = [], hike = [];
for (const d of days) for (const l of d.legs) if (l.coords) {
  all.push(...l.coords);
  if (l.type !== 'drive') hike.push(...l.coords);
}
function bbox(pts, padDeg) {
  const la = pts.map(p => p[0]), ln = pts.map(p => p[1]);
  return { s: Math.min(...la) - padDeg, n: Math.max(...la) + padDeg, w: Math.min(...ln) - padDeg, e: Math.max(...ln) + padDeg };
}
const WIDE = bbox(all, 0.03);   // whole trip incl. drives, ~3 km pad
const NEAR = bbox(hike, 0.01);  // walking/camp area, ~1 km pad, gets the sharpest zooms

const LAYERS = [
  { id: 'topo', ext: 'jpg', url: (z, x, y) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`, wide: [8, 15], near: [16, 16] },
  { id: 'sat', ext: 'jpg', url: (z, x, y) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`, wide: [8, 15], near: [16, 16] },
  { id: 'dem', ext: 'png', url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, wide: [8, 13], near: [14, 14] },
];

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
function tilesFor(b, z0, z1) {
  const out = [];
  for (let z = z0; z <= z1; z++)
    for (let x = lon2x(b.w, z); x <= lon2x(b.e, z); x++)
      for (let y = lat2y(b.n, z); y <= lat2y(b.s, z); y++) out.push([z, x, y]);
  return out;
}

const jobs = [];
for (const L of LAYERS) for (const [z, x, y] of [...tilesFor(WIDE, ...L.wide), ...tilesFor(NEAR, ...L.near)])
  jobs.push({ L, z, x, y, file: path.join(OUT, L.id, String(z), String(x), `${y}.${L.ext}`) });
for (const L of LAYERS) console.log(L.id, jobs.filter(j => j.L === L).length, 'tiles');
if (DRY) process.exit(0);

let done = 0, got = 0, missing = 0, failed = 0;
async function one(j) {
  if (fs.existsSync(j.file)) { done++; return; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(j.L.url(j.z, j.x, j.y), { headers: { 'User-Agent': UA } });
      if (res.status === 404) { missing++; break; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(j.file), { recursive: true });
      fs.writeFileSync(j.file, buf);
      got++; break;
    } catch (e) {
      if (attempt === 2) { failed++; console.error('fail', j.L.id, j.z, j.x, j.y, e.message); }
      else await new Promise(r => setTimeout(r, 1500));
    }
  }
  done++;
  if (done % 500 === 0) console.log(done, '/', jobs.length);
}
const queue = [...jobs];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await one(queue.shift()); }));

const zooms = {};
for (const L of LAYERS) zooms[L.id] = { ext: L.ext, minzoom: L.wide[0], maxzoom: L.near[1] };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ built: new Date().toISOString(), wide: WIDE, near: NEAR, layers: zooms }, null, 1));
console.log({ total: jobs.length, downloaded: got, missing404: missing, failed });
