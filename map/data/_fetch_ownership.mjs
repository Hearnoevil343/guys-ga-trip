// _fetch_ownership.mjs — fetch USFS EDW BasicOwnership polygons for the trip
// box, clip them to it, and write map/data/ownership.geojson (FS-owned pieces)
// and map/data/private.geojson (ONE evenodd polygon: box ring + FS rings, so
// "private" = box minus Forest Service). build-map.mjs draws both and fails the
// build if any route point lands on private ground.
//
// Run: node map/data/_fetch_ownership.mjs   (one call, ~7 MB response)
// Grow the box here if the route ever leaves it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const B = [-84.02, 34.74, -83.90, 34.84]; // minLng, minLat, maxLng, maxLat
const URL = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query?' + new URLSearchParams({
  geometry: B.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
  outFields: 'ownerclassification,forestname', outSR: '4326', f: 'geojson',
});
const raw = await (await fetch(URL)).json();
if (!raw.features) throw new Error('EDW query failed: ' + JSON.stringify(raw).slice(0, 300));
const today = new Date().toISOString().slice(0, 10);
console.log(`EDW returned ${raw.features.length} feature(s):`, raw.features.map(f => JSON.stringify(f.properties)).join(' | '));

// Sutherland-Hodgman clip of one ring against the axis-aligned box.
function clip(ring) {
  let out = ring;
  for (const [ax, keepGE, v] of [[0, true, B[0]], [1, true, B[1]], [0, false, B[2]], [1, false, B[3]]]) {
    const inp = out; out = [];
    if (!inp.length) break;
    const inside = p => keepGE ? p[ax] >= v : p[ax] <= v;
    const inter = (a, b) => { const t = (v - a[ax]) / (b[ax] - a[ax]); return ax === 0 ? [v, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), v]; };
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(inter(prev, cur)); out.push(cur); } else if (pi) out.push(inter(prev, cur));
    }
  }
  return out.length >= 3 ? out : null;
}

// The layer carries two classes: "USDA FOREST SERVICE" and "NON-FS" (inside
// the proclamation boundary; private land, state park, county roads, ...).
// NON-FS is written out directly as the private layer — no box arithmetic.
const fsFeats = [], nonFsFeats = [];
for (const f of raw.features) {
  const cls = f.properties.ownerclassification || f.properties.OWNERCLASSIFICATION || '';
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const cr = poly.map(clip).filter(Boolean);
    if (!cr.length) continue;
    const feat = { type: 'Feature', properties: { owner: cls, forest: f.properties.forestname || null, kind: /FOREST SERVICE/i.test(cls) ? 'fs' : 'private' }, geometry: { type: 'Polygon', coordinates: cr } };
    (/FOREST SERVICE/i.test(cls) ? fsFeats : nonFsFeats).push(feat);
  }
}
const src = `USFS EDW BasicOwnership_01 layer 0 (ownerclassification), envelope query ${B.join(',')}, fetched ${today}, clipped to that box`;
fs.writeFileSync(path.join(__dirname, 'ownership.geojson'), JSON.stringify({ type: 'FeatureCollection', source: src, features: fsFeats }));
fs.writeFileSync(path.join(__dirname, 'private.geojson'), JSON.stringify({ type: 'FeatureCollection', source: src + '; NON-FS class = private, state park or other non-federal ground', features: nonFsFeats }));
console.log(`wrote ownership.geojson (${fsFeats.length} FS polygon piece(s)) and private.geojson (${nonFsFeats.length} NON-FS piece(s))`);
