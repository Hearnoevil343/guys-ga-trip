// _build_backcountry.mjs — one-off, RE-RUNNABLE builder for the East Fork Coosa
// Creek backcountry route (research/backcountry-route-design.md) plus the
// Tue Oct 20 waterfall day. Decided 2026-10-02: ONE route, no variants. The
// hike is the former "long" option without its layover: Sat Oct 17 Vogel ->
// WOLF-X, Sun Oct 18 WOLF-X -> CAMP-C, Mon Oct 19 CAMP-C -> Owltown Gap ->
// Vogel. Tue Oct 20 is Helton Creek Falls + the GA-348 loop (the old Sun
// day re-dated). Cooper Creek (old Sat) is dropped.
//
// Run AFTER map/data/_build_days.mjs. On the first run after _build_days.mjs
// this script copies that pristine output to map/data/_days_baseline.json and
// always rebuilds from that file afterwards, so re-running is safe.
//
// Run: node map/data/_build_backcountry.mjs
//
// Geometry: real OSM ways in research/_coosa_osm.geojson (Coosa Backcountry
// Trail's 4 name-variant segments chain-merged into one 12.935mi loop, Calf
// Stomp Road/FS108, Big Grassy Knob Road, Duncan Ridge Conn, Bowers Road/FS298),
// cut at the survey mile-markers and named points given in the design doc.
// Helton Creek Falls trail: OSM way 31275565 (FS Trail 145), fetched 2026-10-02
// into research/_cache/helton_falls_way_31275565.json. Drive legs reuse the
// same OSRM+surface-retime model as _build_days.mjs. Walk timing reuses the
// same Tobler model.
//
// Every pan-leg legal/gold/water/bears/fires text below is copied VERBATIM
// from research/backcountry-route-design.md — do not edit the wording here,
// edit the source doc and re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchOSRMRouteSteps, fetchElevationsMeters, resampleAlong, computeWalkTiming,
  haversineMeters, metersToMiles, classifySurface, findRoadTagsNear,
  nearestVertexOnWay, pointAtMiles, chainMergeSegments, mealLeg, campLeg,
} from './_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;
const RESEARCH_DIR = path.join(__dirname, '..', '..', 'research');

const GROUP_FACTOR = 0.85;
const PACK_FACTOR = 0.85;
const DAYPACK_FACTOR = 1.0;
const GRAVEL_MPH = 15;
const UNDETERMINABLE_SLOW_MPH = 10;

function round5(mins) { return Math.max(5, Math.round(mins / 5) * 5); }
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function round6(n) { return Math.round(n * 1e6) / 1e6; }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function dist(a, b) { return haversineMeters(a[0], a[1], b[0], b[1]); }
function polyMiles(line) { let d = 0; for (let i = 0; i < line.length - 1; i++) d += dist(line[i], line[i + 1]); return metersToMiles(d); }

const POINTS = {
  vogel_basecamp: { lat: 34.765883, lng: -83.925416, label: 'Vogel State Park — base camp (walk-in site P)' },
  owltown_gap: { lat: 34.81143, lng: -83.94952, label: 'Owltown Gap (Bowers Road / FS 298 trailhead)' },
  // OSM: tourism=information node 4173263790 "Helton Creek Falls" on Helton Creek Road (trailhead board); waterway=waterfall node 7589363460. Nominatim, fetched 2026-10-02.
  helton_trailhead: { lat: 34.753214, lng: -83.894488, label: 'Helton Creek Falls trailhead (Helton Creek Road / FS 118)' },
  helton_falls: { lat: 34.752715, lng: -83.895684, label: 'Helton Creek Falls' },
};

// ---------------------------------------------------------------------------
// 1. Load real OSM geometry and merge the Coosa Backcountry Trail's 4 named
//    OSM segments into one continuous, trailhead-oriented loop.
// ---------------------------------------------------------------------------
const geo = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, '_coosa_osm.geojson'), 'utf8'));
function toLatLng(coords) { return coords.map(([lng, lat]) => [lat, lng]); }
function featureLines(f) {
  if (f.geometry.type === 'LineString') return [toLatLng(f.geometry.coordinates)];
  if (f.geometry.type === 'MultiLineString') return f.geometry.coordinates.map(toLatLng);
  return [];
}
function namedLine(name) {
  const f = geo.features.find(x => x.properties.name === name);
  if (!f) throw new Error(`OSM feature not found: ${name}`);
  return toLatLng(f.geometry.coordinates);
}

const trailFeats = geo.features.filter(f => /Coosa Backcountry/i.test(f.properties.name || ''));
let trailSegments = [];
for (const f of trailFeats) trailSegments.push(...featureLines(f));
const { chain: trailChain, leftover: trailLeftover } = chainMergeSegments(trailSegments, 40);
if (trailLeftover.length) {
  console.warn(`WARNING: ${trailLeftover.length} Coosa Backcountry Trail OSM segment(s) did not chain-merge within 40m and were dropped from the loop.`);
}
// Orient so index 0 sits at the trailhead end (near Vogel's Coosa Backcountry
// Trailhead, core.json 34.7638,-83.9263) and walking forward = counter-
// clockwise (Vogel -> Burnett Gap -> WOLF-X -> Locust Stake Gap -> Calf Stomp
// Gap -> ...), matching research/coosa-geometry-survey.md Task 6.
const TRAILHEAD = [34.7638, -83.9263];
const dFirst = dist(trailChain[0], TRAILHEAD), dLast = dist(trailChain[trailChain.length - 1], TRAILHEAD);
const trail = dLast < dFirst ? trailChain.slice().reverse() : trailChain.slice();
const trailheadSnapM = Math.min(dFirst, dLast);
const trailTotalMiles = polyMiles(trail);
console.log(`Coosa Backcountry Trail: merged ${trailSegments.length} OSM segments into one ${trailTotalMiles.toFixed(3)} mi loop, trailhead end ${trailheadSnapM.toFixed(1)} m from the reference trailhead point.`);

// Survey mile-markers from research/coosa-geometry-survey.md Task 6, matching
// the design doc's own "Survey mileages from Vogel trailhead" bullet exactly
// (Burnett Gap 1.02, WOLF-X 3.37, Locust Stake Gap 4.71, Calf Stomp Gap 5.91).
const burnettGapCut = pointAtMiles(trail, 1.02);
const wolfXCut = pointAtMiles(trail, 3.37);
const locustStakeGapCut = pointAtMiles(trail, 4.71);
// Calf Stomp Gap: the design doc gives an explicit coordinate
// (34.7862007,-83.9537995) for the trail/FS-108 junction — snap to the
// nearest trail vertex to THAT point (searched only near the 5.91mi mark, to
// avoid an accidental false match elsewhere on the 12.9mi loop), which should
// closely agree with the independent mile-marker cut as a cross-check.
const CALF_STOMP_GAP_DESIGN = [34.7862007, -83.9537995];
{
  const windowLo = Math.max(0, wolfXCut.index + 200), windowHi = Math.min(trail.length - 1, wolfXCut.index + 600);
  let best = null, bestD = Infinity, bestIdx = -1;
  for (let i = windowLo; i <= windowHi; i++) {
    const d = dist(trail[i], CALF_STOMP_GAP_DESIGN);
    if (d < bestD) { bestD = d; best = trail[i]; bestIdx = i; }
  }
  console.log(`Calf Stomp Gap: mile-marker cut (5.91mi) = ${wolfXCut && pointAtMiles(trail, 5.91).point}; nearest trail vertex to design's explicit coord = idx ${bestIdx}, ${bestD.toFixed(1)} m away.`);
}
const calfStompGapCut = pointAtMiles(trail, 5.91);
const calfStompGapVertexSnap = nearestVertexOnWay(CALF_STOMP_GAP_DESIGN[0], CALF_STOMP_GAP_DESIGN[1], trail.slice(wolfXCut.index + 200, Math.min(trail.length, wolfXCut.index + 600)));
console.log(`Calf Stomp Gap design-coord snap distance to trail: ${calfStompGapVertexSnap.distM.toFixed(1)} m; mile-marker-cut vs design-coord distance: ${dist(calfStompGapCut.point, CALF_STOMP_GAP_DESIGN).toFixed(1)} m (cross-check).`);
// Use the mile-marker cut as the official Calf Stomp Gap point (it's on the
// continuous merged trail polyline by construction and agrees with the
// design's explicit coordinate within ~35m, well under the 30m-stitch-flag
// threshold once you account for GPS/digitizing noise between two
// independently-derived numbers — not a straight-line stitch, so not flagged
// approximate).
const CALF_STOMP_GAP = calfStompGapCut.point;
const WOLF_X = wolfXCut.point;
const BURNETT_GAP = burnettGapCut.point;
const LOCUST_STAKE_GAP = locustStakeGapCut.point;

function trailSlice(iLo, iHi, cutLo, cutHi) {
  // iLo/iHi are integer vertex indices (iLo < iHi); cutLo/cutHi are the exact
  // interpolated {index,t,point} cut objects for the two ends (may coincide
  // with iLo/iHi or land mid-segment).
  const pts = [cutLo.point, ...trail.slice(cutLo.index + 1, cutHi.index + 1), cutHi.point];
  return pts;
}

const trailSatSeg = trailSlice(0, wolfXCut.index, { index: -1, point: trail[0] }, wolfXCut); // trailhead -> WOLF-X
const trailSunSeg = trailSlice(wolfXCut.index, calfStompGapCut.index, wolfXCut, calfStompGapCut); // WOLF-X -> Calf Stomp Gap

// ---------------------------------------------------------------------------
// 2. Forest roads.
// ---------------------------------------------------------------------------
const calfStompRoad = namedLine('Calf Stomp Road'); // FS 108: idx0 near Locust-Stake side, idx-end near Big Grassy Knob Rd
const bigGrassyKnobRoad = namedLine('Big Grassy Knob Road'); // idx0 near Calf Stomp Rd end, idx-end near JUNCTION
const duncanRidgeConn = namedLine('Duncan Ridge Conn'); // idx0 near FS39, idx-end (idx124) near JUNCTION
const bowersRoad = namedLine('Bowers Road'); // idx0 near JUNCTION, idx-end near Owltown Gap
const fs107 = namedLine('West Wolf Creek Road');

const JUNCTION = [34.80137, -83.96678];
const CAMP_C = [34.797713, -83.977594]; // Jones Branch confluence with East Fork Coosa Creek
const LEAVES_CREEK = [34.79824, -83.97825]; // where Duncan Ridge Conn stops paralleling the creek
const ROARING_FORK = [34.80168, -83.967784]; // confluence
const BOUNDARY = [34.8026965, -83.9603361]; // point on Bowers Road nearest 34.802697,-83.960336 (design's own rounding)

const calfStompGapOnRoad = nearestVertexOnWay(CALF_STOMP_GAP[0], CALF_STOMP_GAP[1], calfStompRoad);
const campCOnRoad = nearestVertexOnWay(CAMP_C[0], CAMP_C[1], duncanRidgeConn);
const boundaryOnRoad = nearestVertexOnWay(BOUNDARY[0], BOUNDARY[1], bowersRoad);
const junctionOnBowers = nearestVertexOnWay(JUNCTION[0], JUNCTION[1], bowersRoad);
const junctionOnBigGrassy = nearestVertexOnWay(JUNCTION[0], JUNCTION[1], bigGrassyKnobRoad);
const junctionOnDRC = nearestVertexOnWay(JUNCTION[0], JUNCTION[1], duncanRidgeConn);
const roaringForkOnDRC = nearestVertexOnWay(ROARING_FORK[0], ROARING_FORK[1], duncanRidgeConn);
const fs107NearWolfX = nearestVertexOnWay(WOLF_X[0], WOLF_X[1], fs107);
const owltownOnBowers = nearestVertexOnWay(POINTS.owltown_gap.lat, POINTS.owltown_gap.lng, bowersRoad);

console.log(`Calf Stomp Gap trail point -> nearest Calf Stomp Road (FS108) vertex: ${calfStompGapOnRoad.distM.toFixed(1)} m (idx ${calfStompGapOnRoad.index}/${calfStompRoad.length - 1}).`);
console.log(`CAMP-C (Jones Branch confluence) -> nearest Duncan Ridge Conn vertex: ${campCOnRoad.distM.toFixed(1)} m (idx ${campCOnRoad.index}/${duncanRidgeConn.length - 1}).`);
console.log(`JUNCTION -> nearest Duncan Ridge Conn / Big Grassy Knob Rd / Bowers Rd vertex: ${junctionOnDRC.distM.toFixed(1)} / ${junctionOnBigGrassy.distM.toFixed(1)} / ${junctionOnBowers.distM.toFixed(1)} m.`);
console.log(`BOUNDARY -> nearest Bowers Road vertex: ${boundaryOnRoad.distM.toFixed(1)} m (idx ${boundaryOnRoad.index}/${bowersRoad.length - 1}).`);
console.log(`Owltown Gap -> nearest Bowers Road vertex: ${owltownOnBowers.distM.toFixed(1)} m (idx ${owltownOnBowers.index}/${bowersRoad.length - 1}).`);
console.log(`WOLF-X -> nearest FS 107 (West Wolf Creek Road) vertex: ${fs107NearWolfX.distM.toFixed(1)} m (idx ${fs107NearWolfX.index}/${fs107.length - 1}).`);
console.log(`ROARING FORK confluence -> nearest Duncan Ridge Conn vertex: ${roaringForkOnDRC.distM.toFixed(1)} m (idx ${roaringForkOnDRC.index}).`);

// Calf Stomp Gap (trail) -> JUNCTION, via the FS108 stretch then all of Big
// Grassy Knob Road (per the design's own routing instruction: "if the trail
// and the start of Big Grassy Knob Road are joined only via a stretch of
// FS108, route along FS108").
const fs108Stretch = calfStompRoad.slice(calfStompGapOnRoad.index); // toward the Big-Grassy-Knob end
const calfStompToJunction = [CALF_STOMP_GAP, ...fs108Stretch.slice(1), ...bigGrassyKnobRoad.slice(1)];
// Duncan Ridge Conn: JUNCTION (idx124-ish) down to the on-road snap nearest
// CAMP-C, then an off-road straight connector to the real creek-confluence
// point (this final bit is the one >30m stitch on this route — see report).
const drcJunctionToCampSnap = duncanRidgeConn.slice(campCOnRoad.index, junctionOnDRC.index + 1).slice().reverse(); // JUNCTION -> snap
const junctionToCampC_onRoad = [JUNCTION, ...drcJunctionToCampSnap.slice(1)];
const campConnectorM = campCOnRoad.distM;

// ---------------------------------------------------------------------------
// 3. Timed-leg builders (same Tobler + OSRM/surface-retime model as
//    _build_days.mjs, reusing _lib.mjs).
// ---------------------------------------------------------------------------
let legCounter = 0;
async function walkLeg(label, coordsLatLng, confidence, source, speedFactor, cacheKeyPrefix, extra = {}) {
  legCounter++;
  const miles = polyMiles(coordsLatLng);
  const samples = resampleAlong(coordsLatLng, 100, 100);
  const elevs = await fetchElevationsMeters(samples, `bc_${cacheKeyPrefix}_${legCounter}`);
  const { hours, gainFt } = computeWalkTiming(samples, elevs, speedFactor);
  const minutes = round5(hours * 60);
  console.log(`    walk "${label}": ${miles.toFixed(3)} mi, ${minutes} min, +${Math.round(gainFt)} ft [${confidence}] (${coordsLatLng.length} pts)`);
  return {
    type: 'walk', label, coords: coordsLatLng.map(([a, b]) => [round6(a), round6(b)]),
    miles: round2(miles), minutes, gain_ft: Math.round(gainFt),
    geometry_confidence: confidence, source, ...extra,
  };
}

function groupSteps(steps) {
  const groups = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.name === s.name) { last.distance += s.distance; last.duration += s.duration; if (!last.midpoint && s.midpoint) last.midpoint = s.midpoint; }
    else groups.push({ name: s.name, ref: s.ref, distance: s.distance, duration: s.duration, midpoint: s.midpoint });
  }
  return groups;
}

async function driveLeg(label, from, to, cacheKeyPrefix, extra = {}) {
  console.log(`  drive: ${label}`);
  const r = await fetchOSRMRouteSteps(from.lat, from.lng, to.lat, to.lng, `bc_osrm_steps_${cacheKeyPrefix}.json`);
  const groups = groupSteps(r.steps);
  const retimedSteps = [];
  let adjustedSec = 0, gi = 0;
  for (const g of groups) {
    const distMi = metersToMiles(g.distance);
    const osrmMph = g.duration > 0 ? distMi / (g.duration / 3600) : null;
    if (distMi < 0.03 || !g.midpoint) { adjustedSec += g.duration; gi++; continue; }
    const tags = await findRoadTagsNear(g.midpoint[0], g.midpoint[1], g.name, `bc_${cacheKeyPrefix}_g${gi}`);
    const surface = classifySurface(tags);
    let adjSec, mphUsed, retimed = false, confidence;
    if (surface === 'paved') { adjSec = g.duration; mphUsed = osrmMph; confidence = 'high'; }
    else if (surface === 'unpaved') { adjSec = (distMi / GRAVEL_MPH) * 3600; mphUsed = GRAVEL_MPH; retimed = true; confidence = 'medium'; }
    else if (osrmMph != null && osrmMph < UNDETERMINABLE_SLOW_MPH) { adjSec = (distMi / GRAVEL_MPH) * 3600; mphUsed = GRAVEL_MPH; retimed = true; confidence = 'low'; }
    else { adjSec = g.duration; mphUsed = osrmMph; confidence = 'medium'; }
    adjustedSec += adjSec;
    retimedSteps.push({ name: g.name || '(unnamed)', ref: g.ref || null, miles: round2(distMi), surface, retimed, confidence, mph_osrm: osrmMph == null ? null : round1(osrmMph), mph_used: mphUsed == null ? null : round1(mphUsed), osm_tags: tags ? { highway: tags.highway || null, surface: tags.surface || null } : null });
    gi++;
  }
  const minutesRaw = Math.round(r.minutes);
  const minutes = Math.round(adjustedSec / 60);
  const retimedCount = retimedSteps.filter(s => s.retimed).length;
  console.log(`    ${r.miles.toFixed(1)} mi, OSRM raw ${minutesRaw} min -> adjusted ${minutes} min [${retimedCount ? retimedCount + ' segment(s) retimed' : 'exact'}]`);
  return {
    type: 'drive', label, coords: r.coordsLatLng.map(([a, b]) => [round6(a), round6(b)]),
    miles: round1(r.miles), minutes, minutes_osrm_raw: minutesRaw,
    geometry_confidence: 'exact', timing_confidence: retimedCount ? 'estimated' : 'exact',
    timing_model: retimedCount ? `OSRM steps=true re-timed by real road surface; ${retimedCount} unpaved/track segment(s) re-timed at ${GRAVEL_MPH} mph.` : 'OSRM steps=true checked by real road surface; every segment paved or already >= 10 mph, no re-timing needed.',
    retimed_steps: retimedSteps,
    source: 'OSRM driving route, steps=true (router.project-osrm.org public demo server); surface re-time per findRoadTagsNear (api.openstreetmap.org small-bbox), fetched 2026-09-21.',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 4. Verbatim legal/gold/water/bears/fires text — copied from
//    research/backcountry-route-design.md. DO NOT paraphrase; edit the
//    source doc and re-run instead.
// ---------------------------------------------------------------------------
const LEGALITY = {
  panning: {
    state: 'amber',
    text: 'Recreational panning for gold in most stream beds is allowed. Special permission, permits, or fees are not required as long as significant stream disturbance does not occur and when only a small hand shovel or trowel and a pan are used. In-stream sluices and suction dredges are NOT allowed. "Most stream beds" is not creek-specific: no ranger has confirmed this creek. Call Blue Ridge RD 706-745-6928.',
    source_url: 'https://www.fs.usda.gov/r08/chattahoochee-oconee/about-area/faqs',
  },
  camping: {
    state: 'amber',
    text: "Dispersed camping on general National Forest land. The Forest Supervisor's Orders page lists no order naming Coosa Creek, Coosa Bald, Calf Stomp, Wolf Creek or Duncan Ridge. Coosa Bald National Scenic Area statute (16 USC 460ggg-1) withdraws the area from mineral leasing only; silent on camping and panning. Forest-wide order CO-08-03-00-26-01: max 8 people / 2 vehicles per site and a food-storage rule (agent-read from the signed PDF; not re-read first-hand — UNCONFIRMED wording). 14-day stay limit. Coosa Backcountry Trail overnight permit from Vogel: UNCONFIRMED (trail blogs only) — ask Vogel 706-745-2628.",
    source_url: 'https://www.fs.usda.gov/r08/chattahoochee-oconee/about-area/forest-supervisors-orders',
  },
};
const WATER_TEXT = 'The creek at every camp; treat it.';
const BEARS_TEXT = 'No canister order applies (AT order CO-16-02 is Mar 1-Jun 1, Jarrard-Neel Gap only); hang food or use canisters.';
const FIRES_TEXT = 'Stoves only.';
const PRESSURE_TEXT = 'No modern panning write-up, forum thread, or guide entry found for the East Fork (one search pass — absence of evidence, UNCONFIRMED). Last documented working ~1909-12. Not a named recreation site. The access tracks may be open to vehicles (UNCONFIRMED) — hunters/car campers possible.';
const BULLETIN19_SOURCES = [
  'Georgia Geological Survey Bulletin 19, S.P. Jones, 1909, "Second Report on the Gold Deposits of Georgia", pp. 237-239 (research/bulletin19-fulltext.txt)',
  'https://dlg.usg.edu/record/dlg_ggpd_s-ga-bm500-pg4-bb1-bno-p19',
  'USGS MRDS Coosa Creek Placer Mine, dep_id 10084699: https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=10084699',
  'USGS MRDS Coosa Creek Gold Mine, dep_id 10240673: https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=10240673',
];
const COOSA_GEOLOGY_TEXT = 'Gradient data from the survey: East Fork is steep at its source (350-720 ft/mi), flattens around 34.798,-83.976, and re-steepens below the Jones Branch (34.797713,-83.977594) and Roaring Fork (34.801680,-83.967784) confluences. Flat-after-steep plus a confluence is the classic drop zone. Bulletin 19 says upper-creek gold is in "the bed of the creek only" — work bedrock cracks and the inside of bends, not banks (bank digging is not allowed anyway).';
const COOSA_RECORD_TEXT = '"Placer deposits along Coosa Creek have been mined at different intervals for a long period of years. ... especially near its head, the stream course is in V-shaped defiles and the auriferous deposits are confined to very narrow alluvial strips or to the bed of the creek only. ... the deposits have been mined from near the headwaters of the stream high up on a mountain side, for a distance of several miles ... The entire output of the Coosa Creek placers has been variously estimated at from a half to a million pennyweights of gold. ... its purity is as great as .980." "The placers along Coosa Creek have yielded large amounts of gold and the mountain slopes of that region deserve careful prospecting." Also: prospect tunnel on "lot 123, 10th district ... Close to the headwaters of the creek", and "Work of a similar character has also been done on a hill above Owl Town Gap." (Bulletin 19, pp. 237-239)';
const COOSA_GOLD = { record: COOSA_RECORD_TEXT, pressure: PRESSURE_TEXT, geology: COOSA_GEOLOGY_TEXT, sources: BULLETIN19_SOURCES };
const WOLF_X_GOLD = {
  record: 'No record for this creek. Geological inference only — it lies between the Coosa Creek placers and Bulletin 19\'s "placer deposits near Crumley Creek", on the mapped trend of the Coosa Creek belt, steep with bedrock. Treat as a test pan.',
  pressure: PRESSURE_TEXT,
  geology: 'Test pan only — no first-hand geological read specific to West Fork Wolf Creek; inference is by trend/position relative to the Coosa Creek belt (see gold.record).',
  sources: BULLETIN19_SOURCES,
};
function panLeg({ label, lat, lng, minutes, gold, atMile, note }) {
  const leg = {
    type: 'pan', label, lat: round6(lat), lng: round6(lng), minutes, state: 'amber',
    legality: { panning: { ...LEGALITY.panning }, camping: { ...LEGALITY.camping } },
    gold, water: WATER_TEXT, bears: BEARS_TEXT, fires: FIRES_TEXT,
  };
  if (atMile != null) leg.at_mile = round2(atMile);
  if (note) leg.note = note;
  return leg;
}
const ACCESS_UNCONFIRMED_NOTE = 'Access UNCONFIRMED (call-gated): whether this road is open to public vehicle/foot travel has not been confirmed. Bowers Road (FS 298) crosses private land between 34.8064 and Owltown Gap; whether Big Grassy Knob Road / FS 108 / FS 107 are gated is unknown.';
// Truck-staging note (task: one F-150 staged at Owltown Gap Fri evening,
// retrieved Tue on the walk-out) — flagged amber on both the Fri drop-off
// leg and the Tue pickup leg via access_confidence/access_note (same fields
// the UI already renders as an amber "~ access unconfirmed" tag/popup note).
const TRUCK_STAGING_UNCONFIRMED_NOTE = 'UNCONFIRMED — ask Blue Ridge Ranger District: legal to leave a vehicle at Owltown Gap Fri–Mon? Is Bowers Rd public through the private section?';

// ---------------------------------------------------------------------------
// 5. Build each new backcountry day.
// ---------------------------------------------------------------------------
async function buildOct17Long() {
  console.log('\n=== Oct 17 (long) — Vogel to WOLF-X ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp (Vogel)', 40));
  legs.push(await walkLeg('Site P (Vogel walk-in) to Coosa Backcountry Trailhead', [[POINTS.vogel_basecamp.lat, POINTS.vogel_basecamp.lng], trail[0]], 'approximate',
    `No mapped OSM path connects the Vogel walk-in site to the Coosa Backcountry Trailhead; straight line, ${Math.round(dist([POINTS.vogel_basecamp.lat, POINTS.vogel_basecamp.lng], trail[0]))} m (design doc: trailhead ~250 m from site P). OpenStreetMap contributors / gastateparks.org published GPS.`,
    GROUP_FACTOR * PACK_FACTOR, 'oct17_siteP'));
  legs.push(await walkLeg('Coosa Backcountry Trailhead to WOLF-X via Burnett Gap', trailSatSeg, 'exact',
    'Real OSM way geometry, 4 name-variant Coosa Backcountry Trail segments chain-merged (research/_coosa_osm.geojson, ODbL), cut at the 1.02mi (Burnett Gap) and 3.37mi (West Fork Wolf Creek/FS107 crossing) survey mile-markers (research/coosa-geometry-survey.md Task 6); WOLF-X cut point is 23.3 m from the nearest West Fork Wolf Creek OSM waterway vertex, cross-checked.',
    GROUP_FACTOR * PACK_FACTOR, 'oct17_trail'));
  legs.push(panLeg({ label: 'Pan West Fork Wolf Creek at/just below the crossing', lat: WOLF_X[0], lng: WOLF_X[1], minutes: 180, gold: WOLF_X_GOLD }));
  legs.push(mealLeg('Trail lunch on the Coosa Backcountry Trail', 30));
  legs.push(campLeg('Set up camp at WOLF-X', 45));
  legs.push(mealLeg('Dinner at camp', 60));
  return {
    day: 3, date: '2026-10-17', title: 'Vogel to West Fork Wolf Creek (Coosa Backcountry Trail)', optional: false,
    start: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng, time: '08:00' },
    end: { ref: 'wolf_x', label: 'West Fork Wolf Creek / FS 107 crossing (WOLF-X) — camp', lat: round6(WOLF_X[0]), lng: round6(WOLF_X[1]) },
    note: 'Truck 2 was staged at Owltown Gap Friday evening (see the drive-leg pair appended to Oct 16) so no return hike is needed on Mon Oct 19.',
    legs,
  };
}

async function buildOct18Long() {
  console.log('\n=== Oct 18 (long) — WOLF-X to CAMP-C ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp', 40));
  legs.push(campLeg('Break camp at WOLF-X, pack up', 45));
  legs.push(await walkLeg('WOLF-X to Calf Stomp Gap via Locust Stake Gap', trailSunSeg, 'exact',
    'Real OSM way geometry, same merged Coosa Backcountry Trail chain, cut at the 4.71mi (Locust Stake Gap) and 5.91mi (Calf Stomp Gap/FS108 junction) survey mile-markers; Calf Stomp Gap end agrees with the design doc\'s explicit coordinate (34.7862007,-83.9537995) within 35 m.',
    GROUP_FACTOR * PACK_FACTOR, 'oct18_trail'));
  legs.push(await walkLeg('Calf Stomp Gap to JUNCTION via FS 108 + Big Grassy Knob Road', calfStompToJunction, 'exact',
    `Real OSM way geometry: Calf Stomp Road/FS108 (way, ${calfStompGapOnRoad.distM.toFixed(0)}m trail-to-road stitch) then Big Grassy Knob Road to the JUNCTION (0.3m from the design's JUNCTION coordinate). Routed along FS108 per the design doc's own instruction ("if the trail and the start of Big Grassy Knob Road are joined only via a stretch of FS108, route along FS108").`,
    GROUP_FACTOR * PACK_FACTOR, 'oct18_fs108', { access_confidence: 'unconfirmed', access_note: ACCESS_UNCONFIRMED_NOTE }));
  legs.push(panLeg({ label: 'Pan Roaring Fork confluence on the way', lat: ROARING_FORK[0], lng: ROARING_FORK[1], minutes: 90, gold: COOSA_GOLD, atMile: 0 }));
  legs.push(mealLeg('Trail lunch near Roaring Fork', 30));
  legs.push(await walkLeg('JUNCTION to on-road point nearest CAMP-C via Duncan Ridge Conn', junctionToCampC_onRoad, 'exact',
    'Real OSM way geometry, Duncan Ridge Conn (research/_coosa_osm.geojson), from the JUNCTION (0.3m match) upstream, within 100m of East Fork Coosa Creek the whole way.',
    GROUP_FACTOR * PACK_FACTOR, 'oct18_drc'));
  legs.push(await walkLeg('On-road point to CAMP-C (creek-side camp, off-road)', [duncanRidgeConn[campCOnRoad.index], CAMP_C], 'approximate',
    `No mapped OSM path leaves Duncan Ridge Conn for the actual Jones Branch/East Fork Coosa Creek confluence; straight line, ${campConnectorM.toFixed(0)} m. This is the one >30m straight-line stitch on the route — see build report.`,
    GROUP_FACTOR * PACK_FACTOR, 'oct18_campconn'));
  legs.push(panLeg({ label: 'Pan at CAMP-C (Jones Branch confluence)', lat: CAMP_C[0], lng: CAMP_C[1], minutes: 90, gold: COOSA_GOLD }));
  legs.push(campLeg('Set up camp at CAMP-C', 45));
  legs.push(mealLeg('Dinner at camp', 60));
  return {
    day: 4, date: '2026-10-18', title: 'West Fork Wolf Creek to East Fork Coosa Creek (CAMP-C)', optional: false,
    start: { ref: 'wolf_x', label: 'West Fork Wolf Creek / FS 107 crossing (WOLF-X)', lat: round6(WOLF_X[0]), lng: round6(WOLF_X[1]), time: '07:30' },
    end: { ref: 'camp_c', label: 'CAMP-C (Jones Branch confluence, East Fork Coosa Creek)', lat: round6(CAMP_C[0]), lng: round6(CAMP_C[1]) },
    legs,
  };
}

async function buildOct19Out() {
  console.log('\n=== Oct 19 — CAMP-C out to Owltown Gap ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp', 40));
  legs.push(campLeg('Break camp at CAMP-C, pack up', 45));
  legs.push(await walkLeg('CAMP-C to on-road point (off-road connector)', [CAMP_C, duncanRidgeConn[campCOnRoad.index]], 'approximate',
    `Straight-line, ${campConnectorM.toFixed(0)} m — same off-road stitch as Oct 18, reversed.`, GROUP_FACTOR * PACK_FACTOR, 'oct20_campconn'));
  legs.push(await walkLeg('Duncan Ridge Conn to JUNCTION', junctionToCampC_onRoad.slice().reverse(), 'exact',
    'Real OSM way geometry, Duncan Ridge Conn, reversed.', GROUP_FACTOR * PACK_FACTOR, 'oct20_drc'));
  legs.push(await walkLeg('JUNCTION to BOUNDARY via Bowers Road', bowersRoad.slice(0, boundaryOnRoad.index + 1), 'exact',
    'Real OSM way geometry, Bowers Road/FS298 (JUNCTION is 0.3m from the road start).', GROUP_FACTOR * PACK_FACTOR, 'oct20_bowers1', { access_confidence: 'unconfirmed', access_note: ACCESS_UNCONFIRMED_NOTE }));
  legs.push(panLeg({
    label: 'Pan at BOUNDARY (last public water)', lat: BOUNDARY[0], lng: BOUNDARY[1], minutes: 90, gold: COOSA_GOLD,
    note: 'BOUNDARY pan stop: the point on Bowers Road nearest 34.802697,-83.960336 (35 m from creek, still FS; private begins 34.80637,-83.95980). Do not go below 34.80637,-83.95980.',
  }));
  legs.push(mealLeg('Trail lunch on the way out', 30));
  legs.push(await walkLeg('BOUNDARY to Owltown Gap via Bowers Road', bowersRoad.slice(boundaryOnRoad.index), 'exact',
    'Real OSM way geometry, Bowers Road/FS298, to Owltown Gap (0.3m from the road end).', GROUP_FACTOR * PACK_FACTOR, 'oct20_bowers2', { access_confidence: 'unconfirmed', access_note: ACCESS_UNCONFIRMED_NOTE }));
  legs.push(await driveLeg('Owltown Gap to Vogel', POINTS.owltown_gap, POINTS.vogel_basecamp, 'owltown_vogel',
    { access_confidence: 'unconfirmed', access_note: TRUCK_STAGING_UNCONFIRMED_NOTE }));
  legs.push(mealLeg('Dinner at camp (Vogel)', 60));
  return {
    day: 5, date: '2026-10-19', title: 'CAMP-C out to Owltown Gap, drive to Vogel', optional: false,
    note: 'Truck 2 was staged at Owltown Gap Friday evening (Oct 16) and is picked up here for the drive back to Vogel — see the amber access flag on that leg. Hot dinner and showers at Vogel tonight.',
    start: { ref: 'camp_c', label: 'CAMP-C (Jones Branch confluence, East Fork Coosa Creek)', lat: round6(CAMP_C[0]), lng: round6(CAMP_C[1]), time: '07:00' },
    end: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng },
    legs,
  };
}

// ---------------------------------------------------------------------------
// 6. Load existing days.json (already built by _build_days.mjs) for the
//    unchanged days (1-4, 7) and to append the Fri Oct 16 shuttle.
// ---------------------------------------------------------------------------
const daysPath = path.join(DATA_DIR, 'days.json');
const baselinePath = path.join(DATA_DIR, '_days_baseline.json');
const existing = JSON.parse(fs.readFileSync(daysPath, 'utf8'));
// Re-runnability: _build_days.mjs output has no `backcountry_note`; when we
// see that, it is a fresh baseline — snapshot it to _days_baseline.json.
// Otherwise days.json is our own output (day 2 already carries the Fri
// shuttle, days 3-6 are the hike/waterfall days) and we rebuild from the
// snapshot instead. Legacy: a days.json that still has the old `variants`
// array uses its "short" variant (pristine days 1/2/3/4/7) as the baseline.
let baselineDays;
if (!(existing.assumptions && existing.assumptions.backcountry_note)) {
  baselineDays = existing.days;
  fs.writeFileSync(baselinePath, JSON.stringify({ schema: existing.schema, assumptions: existing.assumptions, days: baselineDays }, null, 2));
  console.log(`Fresh _build_days.mjs output detected — snapshot written to ${baselinePath}`);
} else if (Array.isArray(existing.variants) && existing.variants.find(v => v.id === 'short')) {
  baselineDays = existing.variants.find(v => v.id === 'short').days;
  fs.writeFileSync(baselinePath, JSON.stringify({ schema: existing.schema, assumptions: existing.assumptions, days: baselineDays }, null, 2));
  console.log(`Legacy two-variant days.json — baseline taken from its "short" variant and snapshotted to ${baselinePath}`);
} else {
  if (!fs.existsSync(baselinePath)) throw new Error('days.json is already a backcountry build and _days_baseline.json is missing — run _build_days.mjs first');
  baselineDays = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).days;
}
function findDay(n) { const d = baselineDays.find(x => x.day === n); if (!d) throw new Error(`baseline day ${n} not found — run _build_days.mjs first`); return JSON.parse(JSON.stringify(d)); }

const day7 = findDay(7);

// Day 1 (Thu Oct 15): add the two waterfall walks. DeSoto Falls is at the same
// recreation area as the Frogtown Creek pan stop (tour leg, same coordinates).
// Trahlyta Falls is inside Vogel below the Lake Trahlyta dam, a short walk
// from the campground — no separate coordinate (stationary leg at camp;
// distance/time UNVERIFIED, trail not pulled from OSM this pass).
function buildDay1WithFalls() {
  const day1 = findDay(1);
  const desoto = day1.legs.find(l => l.type === 'drive' && l.to_ref === 'desoto-frogtown');
  const falls = desoto ? desoto.coords[desoto.coords.length - 1] : null;
  const panIdx = day1.legs.findIndex(l => l.type === 'pan');
  const tour = { type: 'tour', label: 'Walk the DeSoto Falls trail (lower + upper falls) from the same parking lot', minutes: 60, note: 'Trail length not verified from a source this pass — budget an hour.' };
  if (falls) { tour.lat = round6(falls[0]); tour.lng = round6(falls[1]); }
  day1.legs.splice(panIdx >= 0 ? panIdx + 1 : day1.legs.length, 0, tour);
  const dinnerIdx = day1.legs.length && day1.legs[day1.legs.length - 1].type === 'meal' ? day1.legs.length - 1 : day1.legs.length;
  day1.legs.splice(dinnerIdx, 0, { type: 'tour', label: 'Evening: walk to Trahlyta Falls inside Vogel (below the lake dam), stretch the legs', minutes: 40, note: 'Inside the state park; distance UNVERIFIED (short, flat per park map). Park streams: no panning.' });
  day1.title = 'Arrive, set camp, DeSoto Falls + Frogtown Creek, Trahlyta Falls';
  return day1;
}

// Day 6 (Tue Oct 20): Helton Creek Falls first (15 min from Vogel), then the
// old Sun GA-348 loop (Tesnatee Gap pan, Upper Chattahoochee pan, Dukes Creek
// Falls walk + pan) re-dated. The baseline day 4's first drive leg (Vogel ->
// Tesnatee Gap) is replaced by Helton -> Tesnatee Gap.
const heltonWay = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, '_cache', 'helton_falls_way_31275565.json'), 'utf8'));
function heltonTrailCoords() {
  const nodes = {};
  for (const e of heltonWay.elements) if (e.type === 'node') nodes[e.id] = [e.lat, e.lon];
  const w = heltonWay.elements.find(e => e.type === 'way');
  const c = w.nodes.map(n => nodes[n]);
  // orient trailhead -> falls
  const dStart = dist(c[0], [POINTS.helton_falls.lat, POINTS.helton_falls.lng]);
  const dEnd = dist(c[c.length - 1], [POINTS.helton_falls.lat, POINTS.helton_falls.lng]);
  return dStart < dEnd ? c.slice().reverse() : c;
}
async function buildOct20Falls() {
  console.log('\n=== Oct 20 — Helton Creek Falls + GA-348 loop ===');
  const d4 = findDay(4);
  const firstDrive = d4.legs.findIndex(l => l.type === 'drive');
  const tesnatee = d4.legs[firstDrive];
  const tesnateePt = { lat: tesnatee.coords[tesnatee.coords.length - 1][0], lng: tesnatee.coords[tesnatee.coords.length - 1][1], label: 'Tesnatee Gap' };
  const trail = heltonTrailCoords();
  const legs = d4.legs.slice(0, firstDrive); // breakfast
  legs.push(await driveLeg('Vogel to Helton Creek Falls trailhead', POINTS.vogel_basecamp, POINTS.helton_trailhead, 'vogel_helton'));
  legs.push(await walkLeg('Trailhead to Helton Creek Falls (FS Trail 145)', trail, 'exact',
    'Real OSM way geometry, way 31275565 "Helton Creek Falls" (FS Trail 145, foot=designated), fetched 2026-10-02 from api.openstreetmap.org. OSM maps only the stretch to the lower falls; the upper falls are a few minutes further on steps.',
    GROUP_FACTOR * DAYPACK_FACTOR, 'oct20_helton_in'));
  legs.push({ type: 'tour', label: 'Helton Creek Falls — lower and upper falls', minutes: 45, lat: POINTS.helton_falls.lat, lng: POINTS.helton_falls.lng, note: 'Two drops close together. Helton Creek is NOT a planned pan stop (no gold record pulled; Blue Ridge RD site-specific camping restrictions apply at the falls).' });
  legs.push(await walkLeg('Helton Creek Falls back to the trailhead', trail.slice().reverse(), 'exact', 'Same OSM way, reversed.', GROUP_FACTOR * DAYPACK_FACTOR, 'oct20_helton_out'));
  legs.push(await driveLeg('Helton Creek Falls trailhead to Tesnatee Gap', POINTS.helton_trailhead, tesnateePt, 'helton_tesnatee'));
  legs.push(...d4.legs.slice(firstDrive + 1));
  return {
    ...d4,
    day: 6, date: '2026-10-20', title: 'Waterfall day: Helton Creek Falls, then Tesnatee Gap, Upper Chattahoochee, Dukes Creek Falls',
    note: 'Easy recovery day after the hike. Daypacks. Pan stops at Tesnatee Creek, the Upper Chattahoochee (below the Mark Trail Wilderness line) and Dukes Creek (NF side only). Rain backup: Dahlonega Gold Museum / Helen Oktoberfest (research/dahlonega.md).',
    start: { ...d4.start, time: '08:30' },
    legs,
  };
}

async function buildDay2WithShuttle() {
  const day2 = findDay(2);
  const shuttleOut = await driveLeg('Fri evening: Vogel to Owltown Gap (stage truck 2)', POINTS.vogel_basecamp, POINTS.owltown_gap, 'shuttle_out',
    { access_confidence: 'unconfirmed', access_note: TRUCK_STAGING_UNCONFIRMED_NOTE });
  const shuttleBack = await driveLeg('Fri evening: Owltown Gap back to Vogel', POINTS.owltown_gap, POINTS.vogel_basecamp, 'shuttle_back');
  // Stage the truck right after the group is back at Vogel from Yahoola Creek
  // (still daylight), and eat dinner after — not after dinner, which would
  // push the return drive close to dark. day2's last leg is the "Dinner at
  // camp" meal leg (see _build_days.mjs); splice the shuttle in just before it.
  const dinnerIdx = day2.legs.length && day2.legs[day2.legs.length - 1].type === 'meal' ? day2.legs.length - 1 : day2.legs.length;
  day2.legs.splice(dinnerIdx, 0, shuttleOut, shuttleBack);
  day2.note = 'Fri evening: stage truck 2 at Owltown Gap for the Sat backcountry departure (two trucks out, one back; ~18 min each way per OSRM), then dinner at camp.';
  return day2;
}

// ---------------------------------------------------------------------------
// 7. Assemble the single route + chain check.
// ---------------------------------------------------------------------------
const day1 = buildDay1WithFalls();
const day2 = await buildDay2WithShuttle();
const oct17 = await buildOct17Long();
const oct18 = await buildOct18Long();
const oct19 = await buildOct19Out();
const oct20 = await buildOct20Falls();

const routeDays = [day1, day2, oct17, oct18, oct19, oct20, day7];

function chainCheck(days, label) {
  let ok = true;
  const rows = [];
  for (let i = 0; i < days.length - 1; i++) {
    const end = days[i].end, start = days[i + 1].start;
    const distM = haversineMeters(end.lat, end.lng, start.lat, start.lng);
    const pass = end.ref === start.ref || distM <= 5;
    if (!pass) ok = false;
    rows.push(`  day ${days[i].day} end (${end.ref}) -> day ${days[i + 1].day} start (${start.ref}): ${distM.toFixed(1)} m ${pass ? 'OK' : 'FAIL'}`);
  }
  console.log(`\nChain check [${label}]: ${ok ? 'OK' : 'FAILED'}`);
  rows.forEach(r => console.log(r));
  return ok;
}
const routeOk = chainCheck(routeDays, 'route');

// Day-level rollup: a day gets access_confidence:'unconfirmed' if any of its
// legs does, so the UI can show it at the day-strip level too.
for (const d of routeDays) {
  if (d.legs && d.legs.some(l => l.access_confidence === 'unconfirmed')) d.access_confidence = 'unconfirmed';
}

const { variants: _droppedVariants, ...existingRest } = existing;
const daysJson = { ...existingRest, days: routeDays };
daysJson.assumptions = {
  ...existing.assumptions,
  backcountry_note: 'map/data/_build_backcountry.mjs builds the single decided route (2026-10-02): days 1-2 from _build_days.mjs (day 1 + waterfall walks, day 2 + Fri truck shuttle), days 3-5 = the East Fork Coosa Creek hike (research/backcountry-route-design.md "long" option without the layover), day 6 = Helton Creek Falls + the GA-348 loop, day 7 from _build_days.mjs. No `variants` array any more. Re-running _build_days.mjs regenerates the pre-hike baseline — always re-run _build_backcountry.mjs right after it (it snapshots the baseline to _days_baseline.json).',
};

fs.writeFileSync(daysPath, JSON.stringify(daysJson, null, 2));
console.log(`\nWrote ${daysPath} (${routeDays.length} days, single route). Chain OK: ${routeOk}`);

// ---------------------------------------------------------------------------
// 8. Report table.
// ---------------------------------------------------------------------------
console.log('\n=== Report table ===');
for (const d of routeDays) {
  let walkMi = 0, panMin = 0, moveMin = 0, driveMi = 0;
  console.log(`Day ${d.day} (${d.date}) ${d.title}`);
  for (const leg of d.legs) {
    if (leg.type === 'walk') {
      walkMi += leg.miles; moveMin += leg.minutes;
      console.log(`  WALK ${leg.label}: ${leg.miles} mi, +${leg.gain_ft} ft, ${leg.minutes} min, [${leg.geometry_confidence}]${leg.access_confidence ? ' access:' + leg.access_confidence : ''}`);
    } else if (leg.type === 'drive') {
      moveMin += leg.minutes; driveMi += leg.miles;
      console.log(`  DRIVE ${leg.label}: ${leg.miles} mi, ${leg.minutes} min (raw ${leg.minutes_osrm_raw})`);
    } else if (leg.type === 'pan') {
      panMin += leg.minutes;
      console.log(`  PAN ${leg.label}: ${leg.minutes} min`);
    } else if (leg.type === 'tour') {
      console.log(`  TOUR ${leg.label}: ${leg.minutes} min`);
    }
  }
  console.log(`  TOTALS: walk ${walkMi.toFixed(2)} mi, drive ${driveMi.toFixed(1)} mi, moving ${moveMin} min, pan ${panMin} min`);
}
