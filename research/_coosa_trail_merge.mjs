// Inspect how the 4 "Coosa Backcountry*" named OSM features connect, and
// whether they chain-merge with Bear Hair Gap Trail / Duncan Ridge Trail
// into one continuous route from the Vogel walk-in trailhead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToMiles } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));

const NAMES = ['Coosa Backcountry', 'Coosa Backcountry Trail', 'Bear Hair Gap Trail / Coosa Backcountry Trail', 'Coosa Backcountry / Duncan Ridge Trail'];
function linesFor(names) {
  const out = [];
  for (const f of fc.features) {
    if (!names.includes(f.properties.name)) continue;
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    for (const l of lines) out.push({ coords: l.map(([lng, lat]) => [lat, lng]), way_ids: f.properties.way_ids, name: f.properties.name });
  }
  return out;
}
const segs = linesFor(NAMES);
console.log(`Found ${segs.length} raw segment(s) across ${NAMES.length} name variants.`);
for (const s of segs) {
  const lenMi = metersToMiles(s.coords.reduce((a, c, i) => i === 0 ? 0 : a + haversineMeters(...s.coords[i-1], ...c), 0));
  console.log(`  [${s.name}] way_ids=${s.way_ids.join(',')} pts=${s.coords.length} len=${lenMi.toFixed(3)}mi start=${s.coords[0]} end=${s.coords[s.coords.length-1]}`);
}

// chain-merge tolerant to ~15m gaps (trail junctions sometimes don't share exact node)
function near(a, b, tolM) { return haversineMeters(a[0], a[1], b[0], b[1]) <= tolM; }
function chainMerge(segments, tolM = 20) {
  let segs = segments.map(s => s.coords.slice());
  const chains = [];
  while (segs.length) {
    let chain = segs.shift();
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const cs = chain[0], ce = chain[chain.length - 1];
        const ss = seg[0], se = seg[seg.length - 1];
        if (near(ce, ss, tolM)) { chain = chain.concat(seg.slice(1)); segs.splice(i,1); extended=true; break; }
        if (near(ce, se, tolM)) { chain = chain.concat(seg.slice().reverse().slice(1)); segs.splice(i,1); extended=true; break; }
        if (near(cs, se, tolM)) { chain = seg.slice(0,-1).concat(chain); segs.splice(i,1); extended=true; break; }
        if (near(cs, ss, tolM)) { chain = seg.slice().reverse().slice(0,-1).concat(chain); segs.splice(i,1); extended=true; break; }
      }
    }
    chains.push(chain);
  }
  return chains;
}
const chains = chainMerge(segs, 20);
console.log(`\nAfter chain-merge (tol 20m): ${chains.length} chain(s)`);
for (const c of chains) {
  const lenMi = metersToMiles(c.reduce((a, cc, i) => i === 0 ? 0 : a + haversineMeters(...c[i-1], ...cc), 0));
  console.log(`  chain: pts=${c.length} len=${lenMi.toFixed(3)}mi start=${c[0]} end=${c[c.length-1]}`);
}

// distance from Vogel walk-in site to nearest point on each chain
const VOGEL = [34.765883, -83.925416];
for (let i = 0; i < chains.length; i++) {
  let best = Infinity, bestIdx = -1;
  chains[i].forEach((p, idx) => { const d = haversineMeters(VOGEL[0], VOGEL[1], p[0], p[1]); if (d < best) { best = d; bestIdx = idx; } });
  console.log(`chain ${i}: nearest pt to Vogel walk-in = ${best.toFixed(0)}m at idx ${bestIdx} (${chains[i][bestIdx]})`);
}

fs.writeFileSync(path.join(__dirname, '_coosa_trail_chains.json'), JSON.stringify(chains, null, 0));
console.log('\nWrote _coosa_trail_chains.json');
