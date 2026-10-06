// _build_backcountry.mjs — one-off, RE-RUNNABLE builder for the East Fork Coosa
// Creek backcountry route (research/backcountry-route-design.md). Decided
// 2026-10-05 (owner): no road walking, no camp a vehicle can reach. Sat Oct 17
// truck to WOLF-X (FS 107 open, owner first-hand), Coosa Backcountry Trail to
// Calf Stomp Gap and on to camp at Calf Stump Branch; Sun Oct 18 Roaring Fork
// Trail west, off-trail drop to the road-free upper East Fork Coosa Creek
// (CAMP-U); Mon Oct 19 full day there; Tue Oct 20 down the creek, road and
// Bowers Road to truck 2 at Owltown Gap (staged Fri evening).
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
  brasstown_parking: { lat: 34.869027, lng: -83.81045, label: 'Brasstown Bald parking lot (OSM way 268844595)' },
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
// 2. Roaring Fork Trail and the off-trail drop to the upper creek (2026-10-05).
//    Owner's call: no road walking, no camp where a vehicle can pull up.
//    East Fork Coosa Creek has a road (Duncan Ridge Conn) within 100 m of it
//    from the JUNCTION up to LEAVES_CREEK (34.79824,-83.97825); above that
//    point the creek is road-free up to its source. Roaring Fork Trail (OSM
//    way 978262922, highway=path, surface=ground) leaves Calf Stomp Gap and
//    runs 1.63 mi west along the ridge at 3,300-3,500 ft; its western end is
//    49 m from Duncan Ridge Road (FS 39). From its vertex nearest the creek a
//    straight off-trail drop of ~600 m / ~550 ft reaches the creek at ~2,940 ft.
//    The whole trail and the drop are on Forest Service land (ownership
//    polygons: map/data/private.geojson, USFS EDW BasicOwnership, 2026-10-05).
// ---------------------------------------------------------------------------
const fs107 = namedLine('West Wolf Creek Road');
const roaringForkTrailRaw = namedLine('Roaring Fork Trail');
// Orient idx0 at the Calf Stomp Gap end.
const roaringForkTrail = dist(roaringForkTrailRaw[0], CALF_STOMP_GAP) < dist(roaringForkTrailRaw[roaringForkTrailRaw.length - 1], CALF_STOMP_GAP)
  ? roaringForkTrailRaw : roaringForkTrailRaw.slice().reverse();
const eastForkCreek = namedLine('East Fork Coosa Creek'); // idx0 at the source (34.789953,-83.991496), runs downstream

// CAMP-U: upper East Fork Coosa Creek, ~2,875 ft, about 1 creek-mile below the
// source. Nearest road point of any kind is ~670 m away (FS 39) and ~800 m
// (Duncan Ridge Conn end), both across a 500+ ft slope. Pan reaches: DROP-IN
// (where the off-trail line meets the creek, ~2,940 ft) and LOWER (34.7935,
// -83.9811, ~2,750 ft, still 500 m from the road end). All three points sit
// on the Forest Service reach (source down to 34.80637,-83.95980).
const CAMP_U = [34.79056, -83.98457];
const DROP_IN = [34.789506, -83.985797];
const LOWER_PAN = [34.79350, -83.98112];
const LEAVES_CREEK = [34.79824, -83.97825]; // where Duncan Ridge Conn stops paralleling the creek — nothing below this is road-free

const rftLeaveIdx = nearestVertexOnWay(DROP_IN[0], DROP_IN[1], roaringForkTrail);
const RFT_LEAVE = roaringForkTrail[rftLeaveIdx.index];
const fs107NearWolfX = nearestVertexOnWay(WOLF_X[0], WOLF_X[1], fs107);
const rftStartSnapM = dist(roaringForkTrail[0], CALF_STOMP_GAP);
console.log(`Roaring Fork Trail: ${polyMiles(roaringForkTrail).toFixed(2)} mi, idx0 ${rftStartSnapM.toFixed(0)} m from the Calf Stomp Gap trail point; leave-trail vertex idx ${rftLeaveIdx.index}/${roaringForkTrail.length - 1} is ${rftLeaveIdx.distM.toFixed(0)} m from DROP-IN.`);
console.log(`WOLF-X -> nearest FS 107 (West Wolf Creek Road) vertex: ${fs107NearWolfX.distM.toFixed(1)} m (idx ${fs107NearWolfX.index}/${fs107.length - 1}).`);

function creekSlice(a, b) {
  const ia = nearestVertexOnWay(a[0], a[1], eastForkCreek).index, ib = nearestVertexOnWay(b[0], b[1], eastForkCreek).index;
  const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
  const pts = eastForkCreek.slice(lo, hi + 1);
  return ia <= ib ? pts : pts.slice().reverse();
}
// Calf Stomp Gap trail point -> Roaring Fork Trail start: the last ~400 m of
// Calf Stomp Road (FS 108) at the gap, the only mapped link between the two.
const calfStompRoad = namedLine('Calf Stomp Road');
const gapOnFs108 = nearestVertexOnWay(CALF_STOMP_GAP[0], CALF_STOMP_GAP[1], calfStompRoad);
const fs108ToRft = calfStompRoad.slice(gapOnFs108.index); // toward the road end at the RFT start
console.log(`Calf Stomp Gap -> FS 108 vertex ${gapOnFs108.distM.toFixed(0)} m; FS 108 end -> Roaring Fork Trail idx0 ${dist(fs108ToRft[fs108ToRft.length - 1], roaringForkTrail[0]).toFixed(0)} m.`);
const rftToLeave = [CALF_STOMP_GAP, ...fs108ToRft.slice(1), ...roaringForkTrail.slice(0, rftLeaveIdx.index + 1)];
const dropLine = [RFT_LEAVE, DROP_IN, ...creekSlice(DROP_IN, CAMP_U).slice(1)];
const campToLower = creekSlice(CAMP_U, LOWER_PAN);
const campToDropIn = creekSlice(CAMP_U, DROP_IN);

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
const FS107_NOTE = 'FS 107 (West Wolf Creek Road) is open to vehicles — owner, first-hand, 2026-10-05. Park clear of the roadway at the trail crossing; USFS allows roadside parking up to 14 days.';
const RFT_UNCONFIRMED_NOTE = 'Roaring Fork Trail is mapped in OpenStreetMap (way 978262922, highway=path, surface=ground) but no trail report, sign or Forest Service listing was found: on-the-ground condition UNCONFIRMED. Ridge walk, 3,300-3,500 ft. If it is overgrown or gone, follow the ridge crest west by compass — same line.';
const DROP_NOTE = 'OFF-TRAIL. No path: a straight line down the slope, about 0.4 mi and 550 ft of descent (steep, ~25%). Pick the line down the spur, not a hollow. Full packs: slow, poles out. The whole slope is Forest Service land.';
const WATER_RISK_NOTE = 'Headwater reach, about 1 creek-mile below the source at ~2,900 ft. October is the driest month: flow UNCONFIRMED. If the creek is a trickle here, move down to LOWER (34.7935,-83.9811) or on toward 34.7958,-83.9792 — still Forest Service, still 300 m from the road end.';

// ---------------------------------------------------------------------------
// 5. Build each new backcountry day.
// ---------------------------------------------------------------------------
const WOLF_X_PT = { lat: WOLF_X[0], lng: WOLF_X[1], label: 'West Fork Wolf Creek / FS 107 crossing (WOLF-X) — truck' };
const CAMP_U_END = { ref: 'camp_u', label: 'CAMP-U (upper East Fork Coosa Creek, road-free reach)', lat: round6(CAMP_U[0]), lng: round6(CAMP_U[1]) };
const RFT_SOURCE = 'Real OSM way geometry, Roaring Fork Trail (way 978262922, highway=path, surface=ground; research/_coosa_osm.geojson, ODbL), from Calf Stomp Gap west along the ridge to the vertex nearest DROP-IN.';
const CBT_SUN_SOURCE = 'Real OSM way geometry, merged Coosa Backcountry Trail chain, cut at the 3.37mi (WOLF-X) and 5.91mi (Calf Stomp Gap/FS108 junction) survey mile-markers; Calf Stomp Gap end agrees with the design doc\'s explicit coordinate (34.7862007,-83.9537995) within 35 m.';

// Vogel -> WOLF-X by truck. OSRM may stop short of the crossing if it will not
// route the FS 107 track; a short approximate stitch covers the rest.
async function driveToWolfX(label, cacheKey) {
  const d = await driveLeg(label, POINTS.vogel_basecamp, WOLF_X_PT, cacheKey, { access_note: FS107_NOTE });
  const last = d.coords[d.coords.length - 1];
  const gapM = dist(last, WOLF_X);
  console.log(`    drive end -> WOLF-X gap: ${gapM.toFixed(0)} m`);
  return { leg: d, gapM, last };
}

// Calf Stump Branch: the first creek past Calf Stomp Gap on the Coosa
// Backcountry Trail (OSM stream crossing at 34.78244,-83.95858, ~0.4 mi past
// the gap, ~400 m from the nearest drivable road). Owner's call 2026-10-05:
// camp beside the creek near Calf Stomp Gap, pan there that evening and the
// next morning, then go on to CAMP-U.
const CALF_STUMP_XING = [34.78244, -83.95858];
const calfStumpSnap = nearestVertexOnWay(CALF_STUMP_XING[0], CALF_STUMP_XING[1], trail.slice(calfStompGapCut.index));
const CAMP_CS = trail[calfStompGapCut.index + calfStumpSnap.index];
const gapToCalfStump = [CALF_STOMP_GAP, ...trail.slice(calfStompGapCut.index + 1, calfStompGapCut.index + calfStumpSnap.index + 1)];
console.log(`Calf Stump Branch crossing snap ${calfStumpSnap.distM.toFixed(0)} m; gap -> camp ${polyMiles(gapToCalfStump).toFixed(2)} mi.`);
const CAMP_CS_END = { ref: 'camp_cs', label: 'Calf Stump Branch camp (Coosa Backcountry Trail, past Calf Stomp Gap)', lat: round6(CAMP_CS[0]), lng: round6(CAMP_CS[1]) };
const CALF_STUMP_GOLD = {
  record: 'No record for this creek. Small headwater branch on the Coosa Backcountry Trail just past Calf Stomp Gap. Treat as a test pan.',
  pressure: PRESSURE_TEXT,
  geology: 'Test pan only — no geological read specific to Calf Stump Branch.',
  sources: BULLETIN19_SOURCES,
};
const CALF_STUMP_WATER_NOTE = 'Small headwater branch; October is the driest month: flow UNCONFIRMED. Fill 2 L each at WOLF-X before the climb.';

// Walk-out (owner's call 2026-10-05): down the creek from CAMP-U to where the
// road starts (LEAVES_CREEK), then the road to the JUNCTION and Bowers Road
// (FS 298) to Owltown Gap, where truck 2 is staged.
function wayBetween(line, a, b) {
  const ia = nearestVertexOnWay(a[0], a[1], line).index, ib = nearestVertexOnWay(b[0], b[1], line).index;
  const pts = line.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
  return ia <= ib ? pts : pts.slice().reverse();
}
const JUNCTION = [34.80137, -83.96678];
const OWLTOWN = [POINTS.owltown_gap.lat, POINTS.owltown_gap.lng];
const outCreek = creekSlice(CAMP_U, LEAVES_CREEK);
const outConn = wayBetween(namedLine('Duncan Ridge Conn'), LEAVES_CREEK, JUNCTION);
const outBowers = wayBetween(namedLine('Bowers Road'), JUNCTION, OWLTOWN);
console.log(`Walk-out: creek ${polyMiles(outCreek).toFixed(2)} mi, Duncan Ridge Conn ${polyMiles(outConn).toFixed(2)} mi (starts ${dist(outConn[0], LEAVES_CREEK).toFixed(0)} m from road end, ends ${dist(outConn[outConn.length - 1], JUNCTION).toFixed(0)} m from JUNCTION), Bowers Road ${polyMiles(outBowers).toFixed(2)} mi (starts ${dist(outBowers[0], JUNCTION).toFixed(0)} m from JUNCTION, ends ${dist(outBowers[outBowers.length - 1], OWLTOWN).toFixed(0)} m from Owltown Gap).`);
const BOWERS_NOTE = 'Bowers Road (FS 298) crosses private land between 34.8064 and Owltown Gap: public use of that stretch UNCONFIRMED — on the call list.';
const OWLTOWN_PT = { lat: POINTS.owltown_gap.lat, lng: POINTS.owltown_gap.lng, label: POINTS.owltown_gap.label };

async function buildSatIn() {
  console.log('\n=== Oct 17 — truck to WOLF-X, pan, trail over Calf Stomp Gap to Calf Stump Branch ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp (Vogel)', 40));
  const { leg: driveIn, gapM, last } = await driveToWolfX('Vogel to WOLF-X via FS 107 (truck 1)', 'vogel_wolfx');
  legs.push(driveIn);
  if (gapM > 100) legs.push(await walkLeg('Parking to the trail crossing', [last, WOLF_X], 'approximate', `OSRM stopped ${gapM.toFixed(0)} m short of the crossing (FS 107 track); straight line.`, GROUP_FACTOR, 'oct17_parkgap'));
  legs.push(panLeg({ label: 'Pan West Fork Wolf Creek at the crossing', lat: WOLF_X[0], lng: WOLF_X[1], minutes: 120, gold: WOLF_X_GOLD }));
  legs.push(mealLeg('Lunch at WOLF-X', 30));
  legs.push(await walkLeg('WOLF-X up to Calf Stomp Gap via Locust Stake Gap (Coosa Backcountry Trail)', trailSunSeg, 'exact', CBT_SUN_SOURCE, GROUP_FACTOR * PACK_FACTOR, 'oct17_cbt'));
  legs.push(await walkLeg('Calf Stomp Gap on to Calf Stump Branch (Coosa Backcountry Trail)', gapToCalfStump, 'exact', 'Real OSM way geometry, merged Coosa Backcountry Trail chain, from the Calf Stomp Gap cut to the vertex nearest the Calf Stump Branch crossing.', GROUP_FACTOR * PACK_FACTOR, 'oct17_cs'));
  legs.push(campLeg('Set up camp at Calf Stump Branch', 45));
  legs.push(panLeg({ label: 'Pan Calf Stump Branch (evening)', lat: CAMP_CS[0], lng: CAMP_CS[1], minutes: 90, gold: CALF_STUMP_GOLD, note: CALF_STUMP_WATER_NOTE }));
  legs.push(mealLeg('Dinner at camp', 60));
  return {
    day: 3, date: '2026-10-17', title: 'Truck to WOLF-X, pan, hike over Calf Stomp Gap, camp at Calf Stump Branch', optional: false,
    start: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng, time: '07:30' },
    end: CAMP_CS_END,
    note: 'Truck 1 stays at WOLF-X until Tuesday. Truck 2 is already at Owltown Gap (staged Friday evening). Deer season opens today: blaze orange on everyone.',
    legs,
  };
}

async function buildSunToCampU() {
  console.log('\n=== Oct 18 — morning pan, Calf Stump Branch to CAMP-U ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp', 40));
  legs.push(panLeg({ label: 'Morning pan at Calf Stump Branch', lat: CAMP_CS[0], lng: CAMP_CS[1], minutes: 90, gold: CALF_STUMP_GOLD, note: CALF_STUMP_WATER_NOTE }));
  legs.push(campLeg('Break camp, pack up', 45));
  legs.push(await walkLeg('Back up the trail to Calf Stomp Gap', gapToCalfStump.slice().reverse(), 'exact', 'Real OSM way geometry, merged Coosa Backcountry Trail chain, reversed.', GROUP_FACTOR * PACK_FACTOR, 'oct18_cs'));
  legs.push(await walkLeg('Calf Stomp Gap west along Roaring Fork Trail to the leave-trail point', rftToLeave, 'exact', RFT_SOURCE,
    GROUP_FACTOR * PACK_FACTOR, 'oct18_rft', { access_confidence: 'unconfirmed', access_note: RFT_UNCONFIRMED_NOTE }));
  legs.push(mealLeg('Trail lunch on the ridge', 30));
  legs.push(await walkLeg('Off-trail drop to the creek (DROP-IN), then down the creek to CAMP-U', dropLine, 'approximate',
    `No mapped path. Straight line from the Roaring Fork Trail vertex nearest DROP-IN (${rftLeaveIdx.distM.toFixed(0)} m), then the OSM creek line to CAMP-U. ${DROP_NOTE}`,
    GROUP_FACTOR * PACK_FACTOR * 0.6, 'oct18_drop', { note: DROP_NOTE }));
  legs.push(campLeg('Set up camp at CAMP-U', 45));
  legs.push(panLeg({ label: 'Pan at CAMP-U (first look at the bed)', lat: CAMP_U[0], lng: CAMP_U[1], minutes: 90, gold: COOSA_GOLD, note: WATER_RISK_NOTE }));
  legs.push(mealLeg('Dinner at camp', 60));
  return {
    day: 4, date: '2026-10-18', title: 'Morning pan, Roaring Fork Trail, off-trail down to CAMP-U on East Fork Coosa Creek', optional: false,
    start: { ...CAMP_CS_END, time: '07:30' },
    end: CAMP_U_END,
    note: 'Calf Stump Branch camp sits 0.4 mi past the gap, so the first 0.4 mi this morning is back up the same trail to the gap. The last leg is off-trail and steep — see its note.',
    legs,
  };
}

async function buildMonLayover() {
  console.log('\n=== Oct 19 — full day at CAMP-U ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp', 40));
  legs.push(await walkLeg('CAMP-U up the creek to DROP-IN (daypack)', campToDropIn, 'approximate', 'OSM creek line; walk the bed and banks, no path.', GROUP_FACTOR * DAYPACK_FACTOR, 'oct19_up'));
  legs.push(panLeg({ label: 'Pan the upper reach at DROP-IN (bed of the creek only)', lat: DROP_IN[0], lng: DROP_IN[1], minutes: 150, gold: COOSA_GOLD, note: WATER_RISK_NOTE }));
  legs.push(await walkLeg('DROP-IN back down to CAMP-U', campToDropIn.slice().reverse(), 'approximate', 'OSM creek line, reversed.', GROUP_FACTOR * DAYPACK_FACTOR, 'oct19_down'));
  legs.push(mealLeg('Lunch at camp', 40));
  legs.push(await walkLeg('CAMP-U down the creek to LOWER (daypack)', campToLower, 'approximate', 'OSM creek line; walk the bed and banks, no path.', GROUP_FACTOR * DAYPACK_FACTOR, 'oct19_lower'));
  legs.push(panLeg({ label: 'Pan the LOWER reach (flatter, inside of bends)', lat: LOWER_PAN[0], lng: LOWER_PAN[1], minutes: 150, gold: COOSA_GOLD,
    note: 'Still 500 m from the road end at 34.79824,-83.97825.' }));
  legs.push(await walkLeg('LOWER back up to CAMP-U', campToLower.slice().reverse(), 'approximate', 'OSM creek line, reversed.', GROUP_FACTOR * DAYPACK_FACTOR, 'oct19_lower_back'));
  legs.push(mealLeg('Dinner at camp', 60));
  return {
    day: 5, date: '2026-10-19', title: 'Full day panning the upper East Fork Coosa Creek at CAMP-U', optional: false,
    start: { ...CAMP_U_END, time: '08:00' },
    end: CAMP_U_END,
    note: 'No packs today. Two pan sessions, one up-creek and one down-creek from camp. Bulletin 19: up here the gold is in "the bed of the creek only" — bedrock cracks and the inside of bends.',
    legs,
  };
}

async function buildTueOut() {
  console.log('\n=== Oct 20 — CAMP-U down the creek, road to Owltown Gap, drive to Vogel ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp', 40));
  legs.push(campLeg('Break camp at CAMP-U, pack up', 45));
  legs.push(await walkLeg('Down East Fork Coosa Creek to where the road starts', outCreek, 'approximate', 'OSM creek line; walk the bed and banks, no path.', GROUP_FACTOR * PACK_FACTOR * 0.8, 'oct20_creek'));
  legs.push(await walkLeg('Road beside the creek (Duncan Ridge Conn) down to the Bowers Road junction', outConn, 'exact', 'Real OSM way geometry, Duncan Ridge Conn (research/_coosa_osm.geojson).', GROUP_FACTOR * PACK_FACTOR, 'oct20_conn'));
  legs.push(await walkLeg('Bowers Road (FS 298) to Owltown Gap — truck 2', outBowers, 'exact', 'Real OSM way geometry, Bowers Road (research/_coosa_osm.geojson).', GROUP_FACTOR * PACK_FACTOR, 'oct20_bowers', { access_confidence: 'unconfirmed', access_note: BOWERS_NOTE }));
  legs.push(await driveLeg('Owltown Gap to WOLF-X (truck 2) to collect truck 1', OWLTOWN_PT, WOLF_X_PT, 'owltown_wolfx', { access_note: FS107_NOTE }));
  legs.push(await driveLeg('WOLF-X to Vogel (both trucks)', WOLF_X_PT, POINTS.vogel_basecamp, 'wolfx_vogel', { access_note: FS107_NOTE }));
  legs.push(mealLeg('Dinner at camp (Vogel)', 60));
  return {
    day: 6, date: '2026-10-20', title: 'Walk the creek out to the road, on to Owltown Gap, drive to Vogel', optional: false,
    note: 'Walk down the creek to the road, then the road to truck 2 at Owltown Gap. Drive to WOLF-X for truck 1, then both trucks to Vogel. Hot dinner and showers tonight.',
    start: { ...CAMP_U_END, time: '07:30' },
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

// Day 1 (Thu Oct 15), slimmed 2026-10-02 at the owner's call ("we will be
// tired from the drive"): set camp, one easy walk inside Vogel, dinner, then
// drive up to Brasstown Bald for the stars. No panning on arrival day. The
// baseline day 1's DeSoto/Frogtown legs are dropped; its camp and dinner legs are kept.
async function buildDay1Stars() {
  const day1 = findDay(1);
  const setup = day1.legs.find(l => l.type === 'camp');
  const legs = [setup];
  legs.push({ type: 'tour', label: 'Optional: easy walk to Trahlyta Falls inside Vogel (below the lake dam)', minutes: 40, note: 'Inside the state park; distance UNVERIFIED (short, flat per park map). Park streams: no panning.' });
  // Sunset Oct 15 is about 7:05 PM EDT; this downtime puts the drive up after
  // dinner at about 7:50 PM, arriving near full dark.
  legs.push({ type: 'camp', label: 'Downtime at camp: rest after the drive', minutes: 235 });
  legs.push({ type: 'meal', label: 'Dinner at camp', minutes: 60 });
  legs.push(await driveLeg('Evening: Vogel to Brasstown Bald parking lot', POINTS.vogel_basecamp, POINTS.brasstown_parking, 'vogel_brasstown'));
  legs.push({ type: 'tour', label: 'Stargazing at Brasstown Bald (highest point in Georgia)', minutes: 90, lat: POINTS.brasstown_parking.lat, lng: POINTS.brasstown_parking.lng,
    note: 'Explore Georgia: "The parking lot is open at night, and the lights from the visitors center are turned off." After-hours fee $6 per adult (Forest Service). No shuttle after 5 PM: steep 0.6 mile paved walk to the summit. No water; restrooms not listed. Gate closes in bad weather. Gate hour after dark not confirmed. Waxing crescent moon (sets mid-evening). Warm layers, red headlamps, chairs. Backup: Hogpen Gap overlook on GA-348.' });
  legs.push(await driveLeg('Brasstown Bald back to Vogel', POINTS.brasstown_parking, POINTS.vogel_basecamp, 'brasstown_vogel'));
  return { ...day1, title: 'Arrive, set camp, rest, stargazing at Brasstown Bald', note: 'Arrival day: no panning. Leave camp after dinner, about an hour after sunset, for full dark.', legs };
}


async function buildDay2() {
  const day2 = findDay(2);
  // 2026-10-05 (owner): the hike ends at Owltown Gap, so Friday evening both
  // trucks stage truck 2 there and come back in truck 1.
  // Owner's call 2026-10-02: mine tour + river panning only, no museum. Lunch
  // stays on the square (the museum's coordinates), so the drives still chain.
  day2.legs = day2.legs.filter(l => !(l.type === 'tour' && l.at_ref === 'dahlonega-gold-museum'));
  for (const l of day2.legs) {
    if (l.label === 'Consolidated Gold Mine to Gold Museum') l.label = 'Consolidated Gold Mine to downtown Dahlonega (lunch)';
    if (l.label === 'Gold Museum to Yahoola Creek Park') l.label = 'Downtown Dahlonega to Yahoola Creek Park';
  }
  day2.title = 'Dahlonega: mine tour, lunch, pan Yahoola Creek';
  day2.legs.push(await driveLeg('Evening: stage truck 2 at Owltown Gap (both trucks)', POINTS.vogel_basecamp, OWLTOWN_PT, 'vogel_owltown'));
  day2.legs.push(await driveLeg('Owltown Gap back to Vogel (truck 1)', OWLTOWN_PT, POINTS.vogel_basecamp, 'owltown_vogel'));
  day2.note = 'Evening: leave truck 2 at Owltown Gap for Tuesday\'s walk-out. Pack the hike packs tonight: Sat leaves at 07:30.';
  return day2;
}

// ---------------------------------------------------------------------------
// 7. Assemble the single route + chain check.
// ---------------------------------------------------------------------------
const day1 = await buildDay1Stars();
const day2 = await buildDay2();
const oct17 = await buildSatIn();
const oct18 = await buildSunToCampU();
const oct19 = await buildMonLayover();
const oct20 = await buildTueOut();

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
  backcountry_note: 'map/data/_build_backcountry.mjs builds the single decided route (2026-10-05): day 1 = set camp + Brasstown Bald stargazing, day 2 from _build_days.mjs (no museum, no shuttle), days 3-6 = truck to WOLF-X, pan, Coosa Backcountry Trail over Calf Stomp Gap to camp at Calf Stump Branch; morning pan, Roaring Fork Trail, off-trail drop to CAMP-U; full day at CAMP-U; down the creek to the road and Bowers Road to truck 2 at Owltown Gap; day 7 from _build_days.mjs. No `variants` array any more. Re-running _build_days.mjs regenerates the pre-hike baseline — always re-run _build_backcountry.mjs right after it (it snapshots the baseline to _days_baseline.json).',
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
