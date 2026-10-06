// Build app/www for the Android app: the hub pages plus the map with its
// offline tiles. Run from app/: node build-www.mjs, then npx cap sync android.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const www = path.join(here, 'www');

fs.rmSync(www, { recursive: true, force: true }); // generated output only
fs.mkdirSync(path.join(www, 'map'), { recursive: true });

for (const f of ['index.html', 'RUNDOWN.html', 'gear-checkin.html']) {
  fs.copyFileSync(path.join(root, f), path.join(www, f));
}
for (const f of ['map3d.html', 'map3d.js', 'map3d-data.js', 'trip.gpx']) {
  fs.copyFileSync(path.join(root, 'map', f), path.join(www, 'map', f));
}
for (const d of ['vendor', 'tiles']) {
  const src = path.join(root, 'map', d);
  if (!fs.existsSync(src)) throw new Error(`missing map/${d} (tiles: node map/fetch-tiles.mjs)`);
  fs.cpSync(src, path.join(www, 'map', d), { recursive: true });
}

// 2D map: swap the unpkg CDN for the bundled copies so it loads offline.
let t = fs.readFileSync(path.join(root, 'map', 'trip-map.html'), 'utf8');
const swaps = [
  ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'vendor/leaflet.css'],
  ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'vendor/leaflet.js'],
  ['https://unpkg.com/esri-leaflet@3.0.12/dist/esri-leaflet.js', 'vendor/esri-leaflet.js'],
];
for (const [a, b] of swaps) {
  if (!t.includes(a)) throw new Error(`trip-map.html no longer references ${a}`);
  t = t.split(a).join(b);
}
fs.writeFileSync(path.join(www, 'map', 'trip-map.html'), t);
console.log('www built:', www);
