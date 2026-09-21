// _build_water.mjs — one-off builder for map/data/water.geojson.
// Run: node map/data/_build_water.mjs
//
// 1. Pulls the waterway-category features (Noontootla Creek, Rock Creek) OUT
//    of map/data/trails.geojson, where they were mixed in with actual trails,
//    and moves them into a new map/data/water.geojson. trails.geojson keeps
//    only trail/road features afterward.
// 2. Fetches real OSM waterway geometry (small-bbox api.openstreetmap.org
//    calls, cached under map/data/_cache/) for the creeks that matter but had
//    no line geometry at all: Frogtown, Cooper, Tesnatee, Upper Chattahoochee
//    (FS-44 reach), Dukes, Yahoola. If a creek can't be found in OSM at the
//    bbox sizes tried, it is SKIPPED and reported — never invented.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOSMBBox } from './_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;

const trailsPath = path.join(DATA_DIR, 'trails.geojson');
const waterPath = path.join(DATA_DIR, 'water.geojson');

const trails = JSON.parse(fs.readFileSync(trailsPath, 'utf8'));

// ---------------------------------------------------------------------------
// 1. Split existing trails.geojson by category.
// ---------------------------------------------------------------------------
const movedWaterFeatures = trails.features.filter(f => f.properties && f.properties.category === 'waterway');
const keptTrailFeatures = trails.features.filter(f => !(f.properties && f.properties.category === 'waterway'));

console.log(`Moving ${movedWaterFeatures.length} waterway feature(s) out of trails.geojson: ${movedWaterFeatures.map(f => f.properties.name).join(', ')}`);

// ---------------------------------------------------------------------------
// 2. Fetch new creek geometry from OSM for the creeks that matter but have
//    no line geometry yet. Center each bbox on the spot's published lat/lng.
// ---------------------------------------------------------------------------
const TARGETS = [
  { key: 'frogtown', name: 'Frogtown Creek', lat: 34.70556, lng: -83.91778, match: /frogtown/i },
  { key: 'cooper', name: 'Cooper Creek', lat: 34.76325, lng: -84.06754, match: /cooper/i },
  { key: 'tesnatee', name: 'Tesnatee Creek', lat: 34.72631, lng: -83.84755, match: /tesnatee/i },
  { key: 'upper-chatt', name: 'Upper Chattahoochee River (FS-44 reach)', lat: 34.78933, lng: -83.78343, match: /chattahoochee/i },
  { key: 'dukes', name: 'Dukes Creek', lat: 34.70102, lng: -83.79083, match: /dukes/i },
  { key: 'yahoola', name: 'Yahoola Creek', lat: 34.52777, lng: -83.95940, match: /yahoola/i },
];

const SRC_NOTE = 'OpenStreetMap contributors, via api.openstreetmap.org/api/0.6/map small-bbox fetch, 2026-09-21 (ODbL). Overpass API mirrors and api.open-elevation.com are unreachable this session (tested), so all geometry comes from the main OSM API instead.';

async function findCreek(target) {
  const bboxSizes = [0.01, 0.02]; // half-width in degrees tried in order
  for (const half of bboxSizes) {
    const minLng = (target.lng - half).toFixed(6), maxLng = (target.lng + half).toFixed(6);
    const minLat = (target.lat - half).toFixed(6), maxLat = (target.lat + half).toFixed(6);
    const cacheKey = `osm_water_${target.key}_${half}.xml`;
    console.log(`  fetching OSM bbox for ${target.name} (±${half} deg)...`);
    let parsed;
    try {
      parsed = await fetchOSMBBox(minLng, minLat, maxLng, maxLat, cacheKey);
    } catch (e) {
      console.warn(`    fetch failed: ${e.message}`);
      continue;
    }
    const matches = parsed.ways.filter(w => w.tags.waterway && /^(stream|river)$/.test(w.tags.waterway) && w.tags.name && target.match.test(w.tags.name));
    if (matches.length) {
      const lines = matches.map(w => w.coordsLatLng.map(([lat, lng]) => [lng, lat])); // -> [lng,lat] for GeoJSON
      const totalPts = lines.reduce((a, l) => a + l.length, 0);
      console.log(`    found ${matches.length} way(s), ${totalPts} total points, names: ${[...new Set(matches.map(w => w.tags.name))].join(' / ')}`);
      return {
        type: 'Feature',
        properties: {
          name: target.name,
          label: target.name,
          category: 'waterway',
          coord_source: `${SRC_NOTE} Matched way(s) tagged waterway=stream|river with name matching "${target.name}", bbox ±${half} deg around the spot's published coordinate (${target.lat},${target.lng}).`,
        },
        geometry: { type: 'MultiLineString', coordinates: lines },
      };
    }
  }
  return null;
}

const newFeatures = [];
const skipped = [];
for (const t of TARGETS) {
  const f = await findCreek(t);
  if (f) newFeatures.push(f);
  else { skipped.push(t.name); console.log(`  SKIPPED ${t.name} — no matching waterway found in OSM at the bbox sizes tried. Not invented.`); }
}

// ---------------------------------------------------------------------------
// 3. Write water.geojson (moved + newly fetched) and rewrite trails.geojson.
// ---------------------------------------------------------------------------
const waterFC = { type: 'FeatureCollection', features: [...movedWaterFeatures, ...newFeatures] };
fs.writeFileSync(waterPath, JSON.stringify(waterFC, null, 1));
console.log(`Wrote water.geojson: ${waterFC.features.length} features (${movedWaterFeatures.length} moved + ${newFeatures.length} newly fetched).`);
if (skipped.length) console.log(`Skipped (not found in OSM, not invented): ${skipped.join(', ')}`);

const trailsFC = { type: 'FeatureCollection', features: keptTrailFeatures };
fs.writeFileSync(trailsPath, JSON.stringify(trailsFC, null, 1));
console.log(`Rewrote trails.geojson: ${trailsFC.features.length} features (trails/roads only, no waterways).`);
