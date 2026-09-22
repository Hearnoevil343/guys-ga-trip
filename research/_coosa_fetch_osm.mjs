// _coosa_fetch_osm.mjs — Task 1: pull all OSM ways in the Coosa Bald / Wolf
// Creek bbox (Union Co. GA, NW of Vogel SP) and emit research/_coosa_osm.geojson.
//
// Bbox: lat 34.735-34.835, lng -84.03 to -83.91 (from task spec).
// Tiled into <=0.05 deg/side chunks per api.openstreetmap.org/api/0.6/map
// limits, 1 req/sec (fetchOSMBBox already inserts politeMs=1000 via _lib.mjs).
//
// Keeps: waterway=stream|river (name), highway=path|footway|track|
// unclassified|service|tertiary|secondary (name, ref, surface, highway,
// tracktype, access). Ways sharing a name are merged into ordered lines
// where their endpoints connect (chain-merge), else kept as separate
// MultiLineString parts under one feature.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOSMBBox, haversineMeters } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BBOX = { minLat: 34.735, maxLat: 34.835, minLng: -84.03, maxLng: -83.91 };
const TILE = 0.05; // deg per side, matches task spec ceiling

function buildTiles(bbox, tile) {
  const tiles = [];
  for (let lat = bbox.minLat; lat < bbox.maxLat - 1e-9; lat += tile) {
    const latMax = Math.min(lat + tile, bbox.maxLat);
    for (let lng = bbox.minLng; lng < bbox.maxLng - 1e-9; lng += tile) {
      const lngMax = Math.min(lng + tile, bbox.maxLng);
      tiles.push({ minLat: lat, maxLat: latMax, minLng: lng, maxLng: lngMax });
    }
  }
  return tiles;
}

const tiles = buildTiles(BBOX, TILE);
console.log(`Fetching ${tiles.length} tiles...`);

const waysById = new Map();
const nodesById = {};

for (let i = 0; i < tiles.length; i++) {
  const t = tiles[i];
  const cacheKey = `coosa_tile_${i}.xml`;
  console.log(`  tile ${i}: lat ${t.minLat.toFixed(4)}-${t.maxLat.toFixed(4)} lng ${t.minLng.toFixed(4)}-${t.maxLng.toFixed(4)}`);
  const parsed = await fetchOSMBBox(t.minLng.toFixed(6), t.minLat.toFixed(6), t.maxLng.toFixed(6), t.maxLat.toFixed(6), cacheKey);
  Object.assign(nodesById, parsed.nodes);
  for (const w of parsed.ways) {
    if (!waysById.has(w.id)) waysById.set(w.id, w);
  }
}

console.log(`Total unique ways: ${waysById.size}`);

const STREAM_VALS = new Set(['stream', 'river']);
const TRAIL_ROAD_HIGHWAYS = new Set(['path', 'footway', 'track', 'unclassified', 'service', 'tertiary', 'secondary']);

const streamWays = [];
const trailRoadWays = [];

for (const w of waysById.values()) {
  const tags = w.tags;
  if (tags.waterway && STREAM_VALS.has(tags.waterway)) {
    streamWays.push(w);
  } else if (tags.highway && TRAIL_ROAD_HIGHWAYS.has(tags.highway)) {
    trailRoadWays.push(w);
  }
}

console.log(`Stream ways: ${streamWays.length}, trail/road ways: ${trailRoadWays.length}`);

// ---------------------------------------------------------------------------
// Chain-merge ways sharing the same name into ordered lines by connecting
// matching endpoints (within 1m tolerance for float coord match).
// ---------------------------------------------------------------------------
function coordKey([lat, lng]) { return `${lat.toFixed(6)},${lng.toFixed(6)}`; }

function mergeWaysByName(ways, tagPicker) {
  const byName = new Map(); // name -> [way,...]
  const unnamed = [];
  for (const w of ways) {
    const name = w.tags.name;
    if (!name) { unnamed.push(w); continue; }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(w);
  }
  const features = [];
  for (const [name, group] of byName.entries()) {
    // chain-merge: repeatedly find segments whose endpoints connect
    let segments = group.map(w => w.coordsLatLng.slice());
    let merged = [];
    while (segments.length) {
      let chain = segments.shift();
      let extended = true;
      while (extended) {
        extended = false;
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const chainStart = chain[0], chainEnd = chain[chain.length - 1];
          const segStart = seg[0], segEnd = seg[seg.length - 1];
          if (coordKey(chainEnd) === coordKey(segStart)) {
            chain = chain.concat(seg.slice(1));
            segments.splice(i, 1); extended = true; break;
          } else if (coordKey(chainEnd) === coordKey(segEnd)) {
            chain = chain.concat(seg.slice().reverse().slice(1));
            segments.splice(i, 1); extended = true; break;
          } else if (coordKey(chainStart) === coordKey(segEnd)) {
            chain = seg.slice(0, -1).concat(chain);
            segments.splice(i, 1); extended = true; break;
          } else if (coordKey(chainStart) === coordKey(segStart)) {
            chain = seg.slice().reverse().slice(0, -1).concat(chain);
            segments.splice(i, 1); extended = true; break;
          }
        }
      }
      merged.push(chain);
    }
    // representative tags: union of tag values seen (first way's tags as base)
    const repTags = tagPicker(group[0].tags);
    // collect distinct values for surface/highway/tracktype/access/ref across group
    for (const key of ['surface', 'highway', 'tracktype', 'access', 'ref']) {
      const vals = [...new Set(group.map(w => w.tags[key]).filter(Boolean))];
      if (vals.length) repTags[key] = vals.join(';');
    }
    features.push({
      type: 'Feature',
      properties: { name, ...repTags, way_ids: group.map(w => w.id), way_count: group.length, merged_segments: merged.length },
      geometry: merged.length === 1
        ? { type: 'LineString', coordinates: merged[0].map(([lat, lng]) => [lng, lat]) }
        : { type: 'MultiLineString', coordinates: merged.map(seg => seg.map(([lat, lng]) => [lng, lat])) },
    });
  }
  // unnamed ways: one feature each
  for (const w of unnamed) {
    const repTags = tagPicker(w.tags);
    features.push({
      type: 'Feature',
      properties: { name: null, ...repTags, way_ids: [w.id], way_count: 1, merged_segments: 1 },
      geometry: { type: 'LineString', coordinates: w.coordsLatLng.map(([lat, lng]) => [lng, lat]) },
    });
  }
  return features;
}

const streamFeatures = mergeWaysByName(streamWays, tags => ({ waterway: tags.waterway }));
const trailRoadFeatures = mergeWaysByName(trailRoadWays, tags => ({
  highway: tags.highway,
  ref: tags.ref || null,
  surface: tags.surface || null,
  tracktype: tags.tracktype || null,
  access: tags.access || null,
}));

const fc = {
  type: 'FeatureCollection',
  properties: {
    source: 'OpenStreetMap contributors, via api.openstreetmap.org/api/0.6/map, fetched 2026-09-21 (ODbL)',
    bbox: BBOX,
    tile_count: tiles.length,
  },
  features: [...streamFeatures, ...trailRoadFeatures],
};

const outPath = path.join(__dirname, '_coosa_osm.geojson');
fs.writeFileSync(outPath, JSON.stringify(fc, null, 1));
console.log(`Wrote ${outPath}: ${fc.features.length} features (${streamFeatures.length} streams, ${trailRoadFeatures.length} trail/road).`);

// Dump a quick name index for the report step
const nameIndex = fc.features.map(f => ({
  name: f.properties.name,
  category: f.properties.waterway ? 'waterway:' + f.properties.waterway : 'highway:' + f.properties.highway,
  ref: f.properties.ref || null,
  points: f.geometry.type === 'LineString' ? f.geometry.coordinates.length : f.geometry.coordinates.reduce((a, c) => a + c.length, 0),
  way_ids: f.properties.way_ids,
}));
fs.writeFileSync(path.join(__dirname, '_coosa_name_index.json'), JSON.stringify(nameIndex, null, 1));
console.log('Wrote _coosa_name_index.json');
