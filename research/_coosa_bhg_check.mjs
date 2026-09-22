import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters } from '../map/data/_lib.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));
const bhg = fc.features.filter(f => f.properties.name === 'Bear Hair Gap Trail');
for (const f of bhg) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  for (const l of lines) {
    const latlng = l.map(([lng, lat]) => [lat, lng]);
    console.log('seg pts', latlng.length, 'start', latlng[0], 'end', latlng[latlng.length - 1]);
  }
}
const VOGEL = [34.765883, -83.925416];
const chainStart = [34.7631, -83.9325049], chainEnd = [34.7637688, -83.9263854];
console.log('dist chainStart-chainEnd', haversineMeters(...chainStart, ...chainEnd).toFixed(0), 'm');
console.log('dist VOGEL-chainStart', haversineMeters(...VOGEL, ...chainStart).toFixed(0));
console.log('dist VOGEL-chainEnd', haversineMeters(...VOGEL, ...chainEnd).toFixed(0));
