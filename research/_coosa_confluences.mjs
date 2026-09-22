// Detect tributary confluences: endpoints of OTHER named streams landing near
// (Coosa Creek system) or (West Fork Wolf Creek), for task 4's "confluences
// with tributaries" ask.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));
const streamsData = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_streams_data.json'), 'utf8'));

const targets = {
  'West Fork Coosa Creek': streamsData.coosaCreek.westForkCoosaCreek.coords,
  'East Fork Coosa Creek': streamsData.coosaCreek.eastForkCoosaCreek.coords,
  'Coosa Creek mainstem': streamsData.coosaCreek.mainstem.coords,
  'West Fork Wolf Creek': streamsData.westForkWolfCreek.coords,
};

const excludeNames = new Set(Object.keys(targets));
const otherStreams = fc.features.filter(f => f.properties.waterway && f.properties.name && !excludeNames.has(f.properties.name));

for (const [tname, tcoords] of Object.entries(targets)) {
  console.log(`\n=== Confluences onto ${tname} ===`);
  for (const f of otherStreams) {
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    for (const line of lines) {
      const latlng = line.map(([lng, lat]) => [lat, lng]);
      const ends = [latlng[0], latlng[latlng.length - 1]];
      for (const [elat, elng] of ends) {
        let best = Infinity, bestPt = null;
        for (const [tlat, tlng] of tcoords) {
          const d = haversineMeters(elat, elng, tlat, tlng);
          if (d < best) { best = d; bestPt = [tlat, tlng]; }
        }
        if (best <= 60) {
          console.log(`  ${f.properties.name}: end ${elat.toFixed(6)},${elng.toFixed(6)} -> confluence @ ${bestPt[0].toFixed(6)},${bestPt[1].toFixed(6)} (${best.toFixed(0)}m)`);
        }
      }
    }
  }
}
