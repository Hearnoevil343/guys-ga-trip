// _build_playground.mjs — builds map/data/playground-area.json: the hike-area
// "playground" layer the hub's Playground tab renders (Jordan, 2026-10-08).
//
// What it is: everything in the Coosa Bald / Duncan Ridge / Wolf Creek / East
// Fork Coosa area the group could walk, drive, camp beside or pan, so the
// locked route can be branched or adapted on the fly without a phone signal.
//
//   - every named creek, trail, forest road and road with geometry in the area
//     box, with length, surface, access tag and how far it sits from the
//     planned route;
//   - the named points: trailheads, gaps, junctions, camps, pan reaches;
//   - at each camp and junction, the BRANCHES: bail-out to the nearest road, a
//     longer or shorter day, a side creek to pan — each with distance, climb,
//     walking time and water;
//   - the water sources along the route (named streams the route touches);
//   - the nearest store, gas and food to each trailhead, from
//     research/playground.json.
//
// Run: node map/data/_build_playground.mjs      (after _build_backcountry.mjs)
//
// Geometry is real OSM way geometry from research/_coosa_osm.geojson (ODbL).
// Distances are measured on that geometry; climb and time come from the same
// opentopodata elevation + Tobler model the day builder uses, so the numbers
// are comparable with days.json. ON-THE-GROUND CONDITION OF ANYTHING NOT ON
// THE PLANNED ROUTE IS UNCONFIRMED — these are mapped lines, not trail reports.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchElevationsMeters, resampleAlong, computeWalkTiming,
  haversineMeters, metersToMiles, nearestVertexOnWay, chainMergeSegments,
  pointAtMiles,
} from './_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;
const RESEARCH_DIR = path.join(__dirname, '..', '..', 'research');

const GROUP_FACTOR = 0.85;
const PACK_FACTOR = 0.85;
const DAYPACK_FACTOR = 1.0;

// Area box: the hike area plus Vogel, Owltown Gap and Lake Winfield Scott.
const BOX = { minLat: 34.72, maxLat: 34.86, minLng: -84.03, maxLng: -83.87 };
const inBox = ([lat, lng]) => lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng;

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function round5(m) { return Math.max(5, Math.round(m / 5) * 5); }
function dist(a, b) { return haversineMeters(a[0], a[1], b[0], b[1]); }
function polyMiles(line) { let d = 0; for (let i = 0; i < line.length - 1; i++) d += dist(line[i], line[i + 1]); return metersToMiles(d); }

// ---------------------------------------------------------------------------
// 1. Load geometry.
// ---------------------------------------------------------------------------
const geo = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, '_coosa_osm.geojson'), 'utf8'));
const days = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'days.json'), 'utf8'));
const places = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, 'playground.json'), 'utf8'));
const privateGeo = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'private.geojson'), 'utf8'));

function featureLines(f) {
  const g = f.geometry;
  if (g.type === 'LineString') return [g.coordinates.map(([lng, lat]) => [lat, lng])];
  if (g.type === 'MultiLineString') return g.coordinates.map(c => c.map(([lng, lat]) => [lat, lng]));
  return [];
}
// All lines for a given exact name, chain-merged into as few runs as possible.
function namedRuns(name) {
  const segs = [];
  for (const f of geo.features) {
    if ((f.properties.name || '') !== name) continue;
    for (const l of featureLines(f)) if (l.length > 1) segs.push(l);
  }
  if (!segs.length) return [];
  if (segs.length === 1) return segs;
  const { chain, leftover } = chainMergeSegments(segs, 60);
  return leftover && leftover.length ? [chain, ...leftover] : [chain];
}
function named(name) {
  const runs = namedRuns(name);
  if (!runs.length) throw new Error(`no OSM way named "${name}" in research/_coosa_osm.geojson`);
  return runs.slice().sort((a, b) => polyMiles(b) - polyMiles(a))[0];
}
function namedProps(name) {
  for (const f of geo.features) if ((f.properties.name || '') === name) return f.properties;
  return {};
}

// Point-in-polygon (ray casting) against the non-Forest-Service polygons, the
// same test build-map.mjs uses for its private-land guard.
function ringsOf(f) {
  const g = f.geometry;
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
const NON_FS = [];
for (const f of privateGeo.features) for (const poly of ringsOf(f)) NON_FS.push(poly);
// Vogel and Smithgall Woods are state parks, not private inholdings: walking
// and driving there is fine (only panning is banned), so they are exempt from
// the private-land flag and carry their own flag instead. Same split as
// build-map.mjs's private-land guard.
const wildGeo = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'wilderness.geojson'), 'utf8'));
const STATE_PARKS = [];
for (const f of wildGeo.features) {
  if (f.properties?.kind !== 'state_park') continue;
  for (const poly of ringsOf(f)) STATE_PARKS.push({ name: f.properties.name, poly });
}
function inPolygon(lat, lng, poly) {
  let inside = false;
  for (const ring of poly) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c;
    }
    if (c) inside = !inside;   // outer ring on, hole off
  }
  return inside;
}
function inStatePark(lat, lng) {
  const hit = STATE_PARKS.find(sp => inPolygon(lat, lng, sp.poly));
  return hit ? hit.name : null;
}
// Private land proper: NON-FS ground that is not one of the state parks.
function onNonFS(lat, lng) {
  if (inStatePark(lat, lng)) return false;
  return NON_FS.some(p => inPolygon(lat, lng, p));
}

// ---------------------------------------------------------------------------
// 2. The planned route's own geometry, so everything else can be measured
//    against it ("how far off-plan is this?").
// ---------------------------------------------------------------------------
const routePoints = [];
for (const d of days.days) {
  for (const leg of d.legs || []) {
    if (leg.type === 'walk' && Array.isArray(leg.coords)) {
      for (const c of leg.coords) routePoints.push([c[0], c[1]]);
    }
    if (typeof leg.lat === 'number' && typeof leg.lng === 'number') routePoints.push([leg.lat, leg.lng]);
  }
  for (const k of ['start', 'end']) if (d[k]) routePoints.push([d[k].lat, d[k].lng]);
}
function metersFromRoute(line) {
  let best = Infinity;
  const step = Math.max(1, Math.floor(line.length / 40));
  for (let i = 0; i < line.length; i += step) {
    for (const r of routePoints) {
      const m = dist(line[i], r);
      if (m < best) best = m;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 3. The Coosa Backcountry Trail, merged and oriented from the Vogel trailhead
//    (same construction as _build_backcountry.mjs, so the mile markers agree).
// ---------------------------------------------------------------------------
const trailSegs = [];
for (const f of geo.features) {
  if (!/Coosa Backcountry/i.test(f.properties.name || '')) continue;
  for (const l of featureLines(f)) if (l.length > 1) trailSegs.push(l);
}
const { chain: cbtChain } = chainMergeSegments(trailSegs, 40);
const TRAILHEAD = [34.7638, -83.9263];
const cbt = dist(cbtChain[cbtChain.length - 1], TRAILHEAD) < dist(cbtChain[0], TRAILHEAD)
  ? cbtChain.slice().reverse() : cbtChain.slice();
const CBT_MI = { burnett_gap: 1.02, wolf_x: 3.37, locust_stake_gap: 4.71, calf_stomp_gap: 5.91 };
const cbtTotalMi = polyMiles(cbt);
function cbtCut(mi) { return pointAtMiles(cbt, mi); }
function cbtSlice(miA, miB) {
  const a = cbtCut(Math.min(miA, miB)), b = cbtCut(Math.max(miA, miB));
  const mid = cbt.slice(a.index + 1, b.index + 1);
  const line = [a.point, ...mid, b.point];
  return miA <= miB ? line : line.slice().reverse();
}

// ---------------------------------------------------------------------------
// 4. Named points.
// ---------------------------------------------------------------------------
const WOLF_X = cbtCut(CBT_MI.wolf_x).point;
const BURNETT_GAP = cbtCut(CBT_MI.burnett_gap).point;
const LOCUST_STAKE_GAP = cbtCut(CBT_MI.locust_stake_gap).point;
const CALF_STOMP_GAP = cbtCut(CBT_MI.calf_stomp_gap).point;
const CALF_STUMP_XING = [34.78244, -83.95858];
const CAMP_U = [34.79056, -83.98457];
const DROP_IN = [34.789506, -83.985797];
const LOWER_PAN = [34.79350, -83.98112];
const LEAVES_CREEK = [34.79824, -83.97825];
const CONN_BOWERS_JCT = [34.80137, -83.96678];
const OWLTOWN_GAP = [34.81143, -83.94952];
const VOGEL = [34.765883, -83.925416];
const FS_BOUNDARY_EF = [34.80637, -83.95980];

// camp on the CBT where it crosses Calf Stump Branch
const csSnap = nearestVertexOnWay(CALF_STUMP_XING[0], CALF_STUMP_XING[1], cbt.slice(cbtCut(CBT_MI.calf_stomp_gap).index));
const CAMP_CS = cbt[cbtCut(CBT_MI.calf_stomp_gap).index + csSnap.index];
const CAMP_CS_MI = CBT_MI.calf_stomp_gap + polyMiles(cbtSlice(CBT_MI.calf_stomp_gap, cbtTotalMi).slice(0, csSnap.index + 1));

// ---------------------------------------------------------------------------
// 5. Way slicing helpers for the branches.
// ---------------------------------------------------------------------------
function sliceBetween(line, a, b) {
  const ia = nearestVertexOnWay(a[0], a[1], line).index;
  const ib = nearestVertexOnWay(b[0], b[1], line).index;
  const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
  const out = line.slice(lo, hi + 1);
  return ia <= ib ? out : out.slice().reverse();
}
// From a point on the line, out to whichever end is FARTHER away.
function sliceToFarEnd(line, a) {
  const i = nearestVertexOnWay(a[0], a[1], line).index;
  const toStart = polyMiles(line.slice(0, i + 1));
  const toEnd = polyMiles(line.slice(i));
  return toEnd >= toStart ? line.slice(i) : line.slice(0, i + 1).reverse();
}
// From a point on the line, out to whichever end is NEARER.
function sliceToNearEnd(line, a) {
  const i = nearestVertexOnWay(a[0], a[1], line).index;
  const toStart = polyMiles(line.slice(0, i + 1));
  const toEnd = polyMiles(line.slice(i));
  return toEnd < toStart ? line.slice(i) : line.slice(0, i + 1).reverse();
}

// ---------------------------------------------------------------------------
// 6. Branch builder: distance, climb and time on the real geometry.
// ---------------------------------------------------------------------------
const branchCache = new Map();
async function timeLine(line, speedFactor, cacheKey) {
  const miles = polyMiles(line);
  const samples = resampleAlong(line, 100, 100);
  const elevs = await fetchElevationsMeters(samples, cacheKey);
  const { hours, gainFt } = computeWalkTiming(samples, elevs, speedFactor);
  return { miles: round2(miles), minutes: round5(hours * 60), gain_ft: Math.round(gainFt) };
}

const branches = [];
async function branch({ node, kind, label, line, mode = 'pack', ends_at, water, note, source }) {
  const factor = GROUP_FACTOR * (mode === 'pack' ? PACK_FACTOR : DAYPACK_FACTOR);
  const key = `pg_${node}_${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 70);
  const t = await timeLine(line, factor, key);
  const nonFs = line.filter(([la, ln]) => onNonFS(la, ln)).length;
  const parks = [...new Set(line.map(([la, ln]) => inStatePark(la, ln)).filter(Boolean))];
  const b = {
    node, kind, label, mode,
    miles: t.miles, gain_ft: t.gain_ft, minutes: t.minutes,
    ends_at, water: water || null, note: note || null,
    non_fs_vertices: nonFs,
    state_parks: parks,
    geometry_source: source || 'Real OSM way geometry (research/_coosa_osm.geojson, ODbL).',
    coords: line.map(([la, ln]) => [Math.round(la * 1e5) / 1e5, Math.round(ln * 1e5) / 1e5]),
  };
  branches.push(b);
  console.log(`  ${node} / ${kind}: ${label} — ${b.miles} mi, +${b.gain_ft} ft, ${b.minutes} min${nonFs ? ` (WARN ${nonFs} vertices on non-FS ground)` : ''}`);
  return b;
}

// ---------------------------------------------------------------------------
// 7. Ways used by the branches.
// ---------------------------------------------------------------------------
const roaringFork = (() => {
  const l = named('Roaring Fork Trail');
  return dist(l[0], CALF_STOMP_GAP) < dist(l[l.length - 1], CALF_STOMP_GAP) ? l : l.slice().reverse();
})();
const calfStompRoad = named('Calf Stomp Road');
const bigGrassy = named('Big Grassy Knob Road');
const fs107 = named('West Wolf Creek Road');
const duncanConn = named('Duncan Ridge Conn');
const bowers = named('Bowers Road');
const eastFork = named('East Fork Coosa Creek');
const calfStumpBranch = named('Calf Stump Branch');
const wfWolf = named('West Fork Wolf Creek');
const jonesBranch = named('Jones Branch');
const burnettTrail = named('Burnett Creek Trail');
const burnettRoad = named('Burnett Creek Road');
const roaringForkCreek = named('Roaring Fork');

function creekSlice(line, a, b) { return sliceBetween(line, a, b); }

// ---------------------------------------------------------------------------
// 8. The branches, node by node.
// ---------------------------------------------------------------------------
console.log('\n=== Branches ===');

// --- Vogel trailhead ---
await branch({
  node: 'vogel_trailhead', kind: 'the plan', label: 'Coosa Backcountry Trail up to Burnett Gap',
  line: cbtSlice(0, CBT_MI.burnett_gap), mode: 'pack', ends_at: 'Burnett Gap',
  water: 'Wolf Creek at the park; nothing on the climb.',
  note: 'Not used on this trip — Saturday starts by truck at WOLF-X. Here for anyone who wants to walk the whole loop from the park.',
});

// --- Burnett Gap ---
await branch({
  node: 'burnett_gap', kind: 'bail-out', label: 'Burnett Creek Trail down to Burnett Creek Road',
  line: sliceToFarEnd(burnettTrail, nearestVertexOnWay(BURNETT_GAP[0], BURNETT_GAP[1], burnettTrail).distM < 400 ? BURNETT_GAP : burnettTrail[0]),
  mode: 'pack', ends_at: 'Burnett Creek Road (a forest road a truck can reach)',
  water: 'Burnett Creek, alongside most of the way down.',
  note: 'Mapped path only, condition UNCONFIRMED. The quickest way off the ridge on the Vogel side.',
});
await branch({
  node: 'burnett_gap', kind: 'the plan', label: 'Coosa Backcountry Trail on to WOLF-X',
  line: cbtSlice(CBT_MI.burnett_gap, CBT_MI.wolf_x), mode: 'pack',
  ends_at: 'WOLF-X (West Fork Wolf Creek / FS 107 crossing)',
  water: 'West Fork Wolf Creek at WOLF-X.',
});

// --- WOLF-X ---
await branch({
  node: 'wolf_x', kind: 'bail-out', label: 'FS 107 (West Wolf Creek Road) out to the paved road',
  line: sliceToFarEnd(fs107, WOLF_X), mode: 'pack',
  ends_at: 'Wolf Pen Gap Road (paved)',
  water: 'West Fork Wolf Creek beside the road for the first stretch.',
  note: 'FS 107 is open to vehicles (owner, first-hand, 2026-10-05), so truck 1 sits here all weekend — this is a walk only if the truck is gone.',
});
// National Forest from the source down to 34.79131, -83.91724 (design doc).
const WF_FS_LIMIT = [34.79131, -83.91724];
await branch({
  node: 'wolf_x', kind: 'side creek', label: 'West Fork Wolf Creek, the National Forest reach',
  line: sliceBetween(wfWolf, wfWolf[0], WF_FS_LIMIT), mode: 'daypack',
  ends_at: 'the Forest Service boundary at 34.79131, -83.91724 — do not pan below it',
  water: 'the creek itself.',
  note: 'National Forest from the source down to 34.79131, -83.91724. No gold record: this is a geological-inference test pan. Trout water (DNR stocks it April–Labor Day), so fishing rules apply.',
});
await branch({
  node: 'wolf_x', kind: 'the plan', label: 'Coosa Backcountry Trail up over Locust Stake Gap to Calf Stomp Gap',
  line: cbtSlice(CBT_MI.wolf_x, CBT_MI.calf_stomp_gap), mode: 'pack',
  ends_at: 'Calf Stomp Gap (CBT / FS 108 / Roaring Fork Trail junction)',
  water: 'none on the climb — fill 2 L each at WOLF-X.',
});
await branch({
  node: 'wolf_x', kind: 'shorter day', label: 'Coosa Backcountry Trail back down to the Vogel trailhead',
  line: cbtSlice(CBT_MI.wolf_x, 0), mode: 'pack', ends_at: 'Vogel State Park trailhead',
  water: 'Wolf Creek near the park.',
  note: 'Walk back to base camp instead of going up. Loses the hike.',
});

// --- Calf Stomp Gap ---
// Big Grassy Knob Road runs from the Calf Stomp Road end (34.786786,
// -83.957490) down to the Duncan Ridge Conn / Bowers Road junction
// (34.801371, -83.966777) — i.e. all the way to the Owltown Gap exit.
const bgStart = bigGrassy[0], bgEnd = bigGrassy[bigGrassy.length - 1];
const bgNearGap = dist(bgStart, CALF_STOMP_GAP) <= dist(bgEnd, CALF_STOMP_GAP) ? bgStart : bgEnd;
const bgFarEnd = bgNearGap === bgStart ? bgEnd : bgStart;
const gapToBg = sliceBetween(calfStompRoad, CALF_STOMP_GAP, bgNearGap);
const bgOut = sliceBetween(bigGrassy, bgNearGap, bgFarEnd);
await branch({
  node: 'calf_stomp_gap', kind: 'bail-out', label: 'Calf Stomp Road (FS 108) and Big Grassy Knob Road out to the Bowers Road junction',
  line: [...gapToBg, ...bgOut.slice(1)],
  mode: 'pack', ends_at: 'Duncan Ridge Conn / Bowers Road junction — then 1.5 mi of Bowers Road to truck 2 at Owltown Gap',
  water: 'none on the road — carry it.',
  note: 'The fastest way off the ridge to a road a truck can meet you on, and it lands on the same exit the hike already uses. Forest roads: whether the gates are open is a ranger call (CALLS.md #1). This was the 2026-10-05 route that got dropped for walking roads — fine as a bail-out, not as the plan.',
});
await branch({
  node: 'calf_stomp_gap', kind: 'the plan', label: 'Coosa Backcountry Trail on to the Calf Stump Branch camp',
  line: cbtSlice(CBT_MI.calf_stomp_gap, CAMP_CS_MI), mode: 'pack',
  ends_at: 'Calf Stump Branch camp (night 1)',
  water: 'Calf Stump Branch at the camp (headwater; October flow UNCONFIRMED).',
});
await branch({
  node: 'calf_stomp_gap', kind: 'the plan (day 2)', label: 'Roaring Fork Trail west along the ridge to the drop-in',
  line: sliceBetween(roaringFork, CALF_STOMP_GAP, roaringFork[nearestVertexOnWay(DROP_IN[0], DROP_IN[1], roaringFork).index]),
  mode: 'pack', ends_at: 'the leave-trail point above DROP-IN',
  water: 'none on the ridge (3,300–3,500 ft) — carry it from Calf Stump Branch.',
  note: 'OSM way 978262922, highway=path, surface=ground. No trail report, sign or Forest Service listing found: condition UNCONFIRMED. If it is gone, follow the ridge crest west by compass — same line.',
});
await branch({
  node: 'calf_stomp_gap', kind: 'longer day', label: 'Coosa Backcountry Trail on around the loop (toward Coosa Bald / Wolfpen Gap)',
  line: cbtSlice(CBT_MI.calf_stomp_gap, Math.min(cbtTotalMi, CBT_MI.calf_stomp_gap + 2.5)), mode: 'pack',
  ends_at: '2.5 mi further round the Coosa Backcountry Trail loop',
  water: 'creek crossings on the loop; none mapped on the first climb.',
  note: 'The loop keeps going. This is the way to more trail and more ridge, not to a pan spot.',
});

// --- Calf Stump Branch camp ---
await branch({
  node: 'camp_cs', kind: 'side creek', label: 'Calf Stump Branch itself, up and down from the trail crossing',
  line: calfStumpBranch, mode: 'daypack', ends_at: 'the branch (both ways from the crossing)',
  water: 'the branch itself.',
  note: 'No gold record for this branch and October flow is UNCONFIRMED. It is the camp water source — pan downstream of where you draw water.',
});
await branch({
  node: 'camp_cs', kind: 'bail-out', label: 'Back to Calf Stomp Gap, then FS 108 down to Big Grassy Knob Road',
  line: [...cbtSlice(CAMP_CS_MI, CBT_MI.calf_stomp_gap), ...sliceBetween(calfStompRoad, CALF_STOMP_GAP, bigGrassy[0]).slice(1)],
  mode: 'pack', ends_at: 'Big Grassy Knob Road (forest road; gate status UNCONFIRMED)',
  water: 'Calf Stump Branch at the start; nothing after.',
  note: 'Fastest way to a road a truck could meet you on, from night 1.',
});
await branch({
  node: 'camp_cs', kind: 'the plan (day 2)', label: 'Back up to Calf Stomp Gap for the Roaring Fork Trail',
  line: cbtSlice(CAMP_CS_MI, CBT_MI.calf_stomp_gap), mode: 'pack', ends_at: 'Calf Stomp Gap',
  water: 'fill at Calf Stump Branch before leaving — nothing again until the creek at CAMP-U.',
  note: 'The only retraced stretch on the whole hike.',
});

// --- CAMP-U ---
await branch({
  node: 'camp_u', kind: 'side creek', label: 'Up East Fork Coosa Creek past DROP-IN to the source',
  line: creekSlice(eastFork, CAMP_U, eastFork[0]), mode: 'daypack',
  ends_at: 'the mapped source of the East Fork (34.789953, -83.991496)',
  water: 'the creek.',
  note: 'The steep headwater reach, 350–720 ft/mi. Bulletin 19: up here the gold is in "the bed of the creek only" — bedrock cracks and the inside of bends, not banks.',
});
await branch({
  node: 'camp_u', kind: 'the plan (day 3)', label: 'Down the creek to the LOWER reach',
  line: creekSlice(eastFork, CAMP_U, LOWER_PAN), mode: 'pack', ends_at: 'LOWER (34.7935, -83.9811)',
  water: 'the creek.',
  note: 'Flatter, inside of bends. Still 500 m from the road end.',
});
await branch({
  node: 'camp_u', kind: 'bail-out', label: 'Down East Fork Coosa Creek to where the road starts',
  line: creekSlice(eastFork, CAMP_U, LEAVES_CREEK), mode: 'pack',
  ends_at: 'the road end at 34.79824, -83.97825 (Duncan Ridge Conn)',
  water: 'the creek, the whole way.',
  note: 'The nearest point any vehicle can reach from CAMP-U. No path: walk the bed and banks.',
});

// --- LOWER reach ---
await branch({
  node: 'lower', kind: 'the plan (day 3)', label: 'On down the creek to where the road starts',
  line: creekSlice(eastFork, LOWER_PAN, LEAVES_CREEK), mode: 'pack',
  ends_at: 'the road end at 34.79824, -83.97825',
  water: 'the creek.',
  note: 'Do not pan below 34.80637, -83.95980 — below that the East Fork is private.',
});

// --- road end ---
await branch({
  node: 'creek_road_end', kind: 'the plan (day 3)', label: 'Duncan Ridge Conn down to the Bowers Road junction',
  line: sliceBetween(duncanConn, LEAVES_CREEK, CONN_BOWERS_JCT), mode: 'pack',
  ends_at: 'the Duncan Ridge Conn / Bowers Road junction',
  water: 'the creek runs beside the road most of the way.',
});
await branch({
  node: 'creek_road_end', kind: 'side creek', label: 'Roaring Fork, the next creek downstream',
  line: roaringForkCreek, mode: 'daypack', ends_at: 'Roaring Fork',
  water: 'the creek.',
  note: 'Joins the East Fork at 34.801680, -83.967784. The survey calls a flat-after-steep reach plus a confluence the classic drop zone. Panning legality here is the same AMBER as the rest: no ranger has confirmed it.',
});

// --- Bowers junction ---
await branch({
  node: 'conn_bowers_jct', kind: 'the plan (day 3)', label: 'Bowers Road (FS 298) to Owltown Gap',
  line: sliceBetween(bowers, CONN_BOWERS_JCT, OWLTOWN_GAP), mode: 'pack',
  ends_at: 'Owltown Gap — truck 2',
  water: 'none on the road.',
  note: 'Bowers Road crosses private land between 34.8064 and Owltown Gap: public use of that stretch UNCONFIRMED, on the call list (CALLS.md #1).',
});
await branch({
  node: 'conn_bowers_jct', kind: 'side creek', label: 'Jones Branch, the confluence just upstream',
  line: jonesBranch, mode: 'daypack', ends_at: 'Jones Branch',
  water: 'the branch.',
  note: 'Joins the East Fork at 34.797713, -83.977594. Another flat-after-steep confluence. Check the private-land tint before you pan: the East Fork is private below 34.80637, -83.95980.',
});

// ---------------------------------------------------------------------------
// 9. Named features in the area box.
// ---------------------------------------------------------------------------
const KIND = {
  stream: 'creek', river: 'creek',
  path: 'trail', footway: 'trail',
  track: 'forest road', unclassified: 'road', service: 'road',
  secondary: 'road', residential: 'road',
};
const seen = new Map();
for (const f of geo.features) {
  const p = f.properties;
  const name = (p.name || '').trim();
  if (!name) continue;
  const osmKind = p.waterway || p.highway || '';
  const kind = KIND[osmKind];
  if (!kind) continue;
  if (kind === 'road' && osmKind === 'service') continue;   // driveways
  for (const line of featureLines(f)) {
    const pts = line.filter(inBox);
    if (pts.length < 2) continue;
    const key = `${kind}|${name}`;
    const prev = seen.get(key);
    const miles = polyMiles(pts);
    if (prev && prev.miles >= miles) continue;
    seen.set(key, { name, kind, osm_kind: osmKind, miles, line: pts, props: p });
  }
}
const features = [];
for (const v of [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))) {
  const mid = v.line[Math.floor(v.line.length / 2)];
  features.push({
    name: v.name,
    kind: v.kind,
    osm_kind: v.osm_kind,
    ref: v.props.ref || null,
    surface: v.props.surface || null,
    tracktype: v.props.tracktype || null,
    access: v.props.access || null,
    miles_in_area: round2(v.miles),
    mid: [Math.round(mid[0] * 1e5) / 1e5, Math.round(mid[1] * 1e5) / 1e5],
    meters_from_route: Math.round(metersFromRoute(v.line)),
    on_non_fs: v.line.some(([la, ln]) => onNonFS(la, ln)),
    state_parks: [...new Set(v.line.map(([la, ln]) => inStatePark(la, ln)).filter(Boolean))],
  });
}
console.log(`\nNamed features in the area box: ${features.length}`);

// ---------------------------------------------------------------------------
// 10. Named points, water sources, stores.
// ---------------------------------------------------------------------------
const nodes = [
  { id: 'vogel_trailhead', label: 'Coosa Backcountry Trailhead (Vogel State Park)', lat: TRAILHEAD[0], lng: TRAILHEAD[1], type: 'trailhead', note: 'Mile 0 of the 12.9 mi Coosa Backcountry Trail loop. Park inside Vogel (ParkPass).' },
  { id: 'burnett_gap', label: 'Burnett Gap (CBT mile 1.02)', lat: BURNETT_GAP[0], lng: BURNETT_GAP[1], type: 'gap', note: 'Burnett Creek Trail drops north from here to Burnett Creek Road.' },
  { id: 'wolf_x', label: 'WOLF-X — West Fork Wolf Creek / FS 107 crossing (CBT mile 3.37)', lat: WOLF_X[0], lng: WOLF_X[1], type: 'trailhead', note: 'Where truck 1 parks. FS 107 (West Wolf Creek Road) is open to vehicles — owner, first-hand, 2026-10-05. Last water before the climb: fill 2 L each.' },
  { id: 'locust_stake_gap', label: 'Locust Stake Gap (CBT mile 4.71)', lat: LOCUST_STAKE_GAP[0], lng: LOCUST_STAKE_GAP[1], type: 'gap', note: 'On the climb from WOLF-X to Calf Stomp Gap. No water, no junction.' },
  { id: 'calf_stomp_gap', label: 'Calf Stomp Gap (CBT mile 5.91)', lat: CALF_STOMP_GAP[0], lng: CALF_STOMP_GAP[1], type: 'junction', note: 'The hub of the area: Coosa Backcountry Trail, Calf Stomp Road (FS 108) and Roaring Fork Trail all meet here. The design-doc coordinate agrees with the mapped trail within 35 m.' },
  { id: 'camp_cs', label: 'Calf Stump Branch camp — night 1', lat: CAMP_CS[0], lng: CAMP_CS[1], type: 'camp', note: 'On the Coosa Backcountry Trail 0.4 mi past Calf Stomp Gap, where it crosses Calf Stump Branch. About 400 m from the nearest road. Water: the branch (headwater, October flow UNCONFIRMED).' },
  { id: 'rft_leave', label: 'Leave-trail point above DROP-IN (Roaring Fork Trail)', lat: DROP_IN[0], lng: DROP_IN[1], type: 'junction', note: 'Where the route leaves the ridge: OFF-TRAIL, about 0.4 mi and 550 ft of descent at roughly 25%. Pick the line down the spur, not a hollow. All Forest Service land.' },
  { id: 'camp_u', label: 'CAMP-U — night 2, upper East Fork Coosa Creek', lat: CAMP_U[0], lng: CAMP_U[1], type: 'camp', note: 'About 2,875 ft, on the only reach of the East Fork with no road beside it (above 34.79824, -83.97825). Nearest road point about 670 m away across a 500 ft slope. Water: the creek; headwater, October flow UNCONFIRMED — if it is a trickle move down toward 34.7958, -83.9792.' },
  { id: 'lower', label: 'LOWER reach — the last pan', lat: LOWER_PAN[0], lng: LOWER_PAN[1], type: 'pan', note: 'Flatter water, inside of bends. Still 500 m above the road end.' },
  { id: 'creek_road_end', label: 'Where the road starts (34.79824, -83.97825)', lat: LEAVES_CREEK[0], lng: LEAVES_CREEK[1], type: 'junction', note: 'Duncan Ridge Conn begins here and runs beside the creek. Nothing below this point is road-free. This is the nearest a vehicle can get to CAMP-U.' },
  { id: 'conn_bowers_jct', label: 'Duncan Ridge Conn / Bowers Road junction', lat: CONN_BOWERS_JCT[0], lng: CONN_BOWERS_JCT[1], type: 'junction', note: 'Jones Branch and Roaring Fork join the East Fork near here.' },
  { id: 'owltown_gap', label: 'Owltown Gap (Bowers Road / FS 298 trailhead)', lat: OWLTOWN_GAP[0], lng: OWLTOWN_GAP[1], type: 'trailhead', note: 'Where truck 2 is staged Friday evening and where the hike ends Monday.' },
  { id: 'ef_fs_boundary', label: 'East Fork Forest Service boundary (34.80637, -83.95980)', lat: FS_BOUNDARY_EF[0], lng: FS_BOUNDARY_EF[1], type: 'boundary', note: 'DO NOT PAN BELOW THIS POINT. Below it the East Fork is private for most of the way to the mouth.' },
];

// Water sources: named streams the planned route comes within 40 m of.
const waterSources = [];
for (const f of features) {
  if (f.kind !== 'creek') continue;
  if (f.meters_from_route > 40) continue;
  waterSources.push({ name: f.name, meters_from_route: f.meters_from_route, mid: f.mid });
}
// Always list the two camp waters first, even if the snap is looser.
const campWater = [
  { name: 'Calf Stump Branch', at: 'camp_cs', note: 'Night 1 water. Small headwater branch; October is the driest month and flow is UNCONFIRMED. Fill 2 L each at WOLF-X before the climb in case it is dry.' },
  { name: 'East Fork Coosa Creek', at: 'camp_u', note: 'Night 2 water, about one creek-mile below the source at ~2,900 ft. Flow UNCONFIRMED. Fallback: move down toward 34.7958, -83.9792.' },
  { name: 'West Fork Wolf Creek', at: 'wolf_x', note: 'Last water a truck can reach. Fill 2 L each here — there is none on the 1,375 ft climb to Calf Stomp Gap.' },
];

// Nearest store / gas / food to each trailhead, from research/playground.json.
const STORE_CATS = new Set(['grocery', 'gas', 'food', 'market', 'service']);
function nearestPlaces(lat, lng, n = 3) {
  return places
    .filter(p => STORE_CATS.has(p.category) && typeof p.lat === 'number')
    .map(p => ({
      name: p.name, category: p.category, hours: p.hours || null,
      miles_straight: round1(metersToMiles(haversineMeters(lat, lng, p.lat, p.lon))),
      drive_min_from_vogel: p.drive_min_from_vogel ?? null,
      gmaps: p.gmaps || null, website: p.website || null, phone: p.phone || null,
      confidence: p.confidence,
    }))
    .sort((a, b) => a.miles_straight - b.miles_straight)
    .slice(0, n);
}
const trailheadStores = nodes
  .filter(n => n.type === 'trailhead')
  .map(n => ({ node: n.id, label: n.label, nearest: nearestPlaces(n.lat, n.lng, 3) }));

// ---------------------------------------------------------------------------
// 11. Write.
// ---------------------------------------------------------------------------
const out = {
  schema: 'playground-area-v1',
  built: new Date().toISOString().slice(0, 10),
  area: BOX,
  about: 'The hike area as a playground: everything named within the area box, the points on and off the route, and the branch options at each camp and junction. Distances are measured on real OSM way geometry (research/_coosa_osm.geojson, ODbL); climb and walking time use the same opentopodata elevation + Tobler model as days.json, derated for a group with packs (0.85 x 0.85) or daypacks (0.85). CONDITION OF ANYTHING OFF THE PLANNED ROUTE IS UNCONFIRMED: these are mapped lines, not trail reports. Panning legality everywhere here is AMBER — no ranger has confirmed any creek (CALLS.md #1).',
  nodes,
  branches,
  features,
  water: { camps: campWater, route_crossings: waterSources },
  trailhead_stores: trailheadStores,
};
const outPath = path.join(DATA_DIR, 'playground-area.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(`  ${nodes.length} nodes, ${branches.length} branches, ${features.length} named features, ${waterSources.length} route water crossings`);
const warn = branches.filter(b => b.non_fs_vertices > 0);
if (warn.length) {
  console.log('  Non-FS ground on these branches (expected for Bowers Road and the CBT near Vogel):');
  for (const b of warn) console.log(`   - ${b.node} / ${b.label}: ${b.non_fs_vertices} vertices`);
}
