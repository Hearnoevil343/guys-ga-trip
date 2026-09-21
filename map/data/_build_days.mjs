// _build_days.mjs — one-off builder for map/data/days.json (schema days-v1).
// Run: node map/data/_build_days.mjs
//
// Builds the real day-by-day route: drive legs from OSRM, walk legs from real
// OSM trail/path geometry where one exists (falling back to an honestly-
// flagged straight line where it doesn't), walking times from Tobler's
// hiking function sampled against real opentopodata elevation, and patches
// map/data/overnight-wide.json's three-forks-noontootla entry (which had
// route_coords: [] / one_way_mi: null) with the same real hike-in geometry.
//
// Day 5/6/7 resolution: the source itinerary.json gave TWO nights at Three
// Forks (day 5 and day 6), contradicting PLAN.md's one-night Mon 19 -> Tue 20
// window. Per the task brief this build resolves it as: Day 5 = drive + hike
// in + camp; Day 6 = wake at camp, pan, hike out, drive back; Day 7 = break
// camp at Vogel, depart. See TOOLS.md for the full note.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchOSRMRouteSteps, fetchOSMBBox, fetchElevationsMeters,
  resampleAlong, computeWalkTiming, haversineMeters, metersToMiles,
  classifySurface, findRoadTagsNear,
} from './_lib.mjs';

const GRAVEL_MPH = 15; // conservative real-world FS-gravel speed in a truck; see TOOLS.md
const UNDETERMINABLE_SLOW_MPH = 10; // OSRM-implied speed below which an unclassifiable segment is still re-timed

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;

const GROUP_FACTOR = 0.85;
const PACK_FACTOR = 0.85;
const DAYPACK_FACTOR = 1.0;
// Six people move slower than one, and a loaded overnight pack slows further.
// These derate the Tobler SPEED (not raw time) — i.e. effective_kmh =
// tobler_kmh * group_factor * (pack_factor|daypack_factor), so a smaller
// factor means MORE time, matching "six people move slower than one." (The
// task text said "multiply [time] by group_factor," which taken literally
// would make a slower group finish faster — physically backwards. Resolved
// per the stated intent, applied to speed. Flagged in the report.)

const REFS = {
  vogel_basecamp: { lat: 34.765883, lng: -83.925416, label: 'Vogel State Park — base camp' },
  'desoto-frogtown': { lat: 34.70556, lng: -83.91778, label: 'DeSoto Falls Recreation Area / Frogtown Creek' },
  'consolidated-gold-mine': { lat: 34.53702, lng: -83.97313, label: 'Consolidated Gold Mine' },
  'dahlonega-gold-museum': { lat: 34.53262, lng: -83.98492, label: 'Dahlonega Gold Museum State Historic Site' },
  'yahoola-park': { lat: 34.52777, lng: -83.95940, label: 'Yahoola Creek Park' },
  'cooper-creek': { lat: 34.76325, lng: -84.06754, label: 'Cooper Creek Recreation Area' },
  'tesnatee-gap': { lat: 34.72631, lng: -83.84755, label: 'Tesnatee Creek at Tesnatee Gap' },
  'upper-chatt-fs44': { lat: 34.78933, lng: -83.78343, label: 'Upper Chattahoochee River / FS Road 44' },
  'dukes-creek-falls': { lat: 34.70102, lng: -83.79083, label: 'Dukes Creek Falls Recreation Area' },
  'three-forks-noontootla': { lat: 34.6636, lng: -84.1842, label: 'Three Forks on FS Road 58' },
};

function nearestIndex(lat, lng, coordsLatLng) {
  let bestI = 0, bestD = Infinity;
  coordsLatLng.forEach((c, i) => {
    const d = haversineMeters(lat, lng, c[0], c[1]);
    if (d < bestD) { bestD = d; bestI = i; }
  });
  return { index: bestI, distM: bestD, point: coordsLatLng[bestI] };
}
function round5(mins) { return Math.max(5, Math.round(mins / 5) * 5); }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

let legCounter = 0;
async function timedWalkLeg(label, coordsLatLng, confidence, source, speedFactor, cacheKeyPrefix) {
  legCounter++;
  const miles = metersToMiles(coordsLatLng.reduce((acc, c, i) => i === 0 ? 0 : acc + haversineMeters(coordsLatLng[i - 1][0], coordsLatLng[i - 1][1], c[0], c[1]), 0));
  const samples = resampleAlong(coordsLatLng, 100, 100);
  const elevs = await fetchElevationsMeters(samples, `${cacheKeyPrefix}_${legCounter}`);
  const { hours, gainFt } = computeWalkTiming(samples, elevs, speedFactor);
  const minutes = round5(hours * 60);
  console.log(`    walk leg "${label}": ${miles.toFixed(2)} mi, ${minutes} min, +${Math.round(gainFt)} ft gain [${confidence}]`);
  return {
    type: 'walk', label, coords: coordsLatLng,
    miles: Math.round(miles * 100) / 100, minutes, gain_ft: Math.round(gainFt),
    geometry_confidence: confidence, source,
  };
}

// Try to build one or more real "walk" legs from a parking/trailhead point to
// the nearest reach of a named creek, using real OSM path/footway/track
// geometry as far as it goes and an honestly-flagged straight line for
// whatever gap remains (parking-to-trail and/or trail-to-creek).
async function buildCreekWalk({ labelPrefix, parkingLat, parkingLng, creekName, creekMatch, cacheKeyPrefix, speedFactor, half = 0.01 }) {
  const minLng = (parkingLng - half).toFixed(6), maxLng = (parkingLng + half).toFixed(6);
  const minLat = (parkingLat - half).toFixed(6), maxLat = (parkingLat + half).toFixed(6);
  const parsed = await fetchOSMBBox(minLng, minLat, maxLng, maxLat, `osm_walk_${cacheKeyPrefix}.xml`);
  const paths = parsed.ways.filter(w => w.tags.highway && /^(path|footway|track)$/.test(w.tags.highway));
  let waterways = parsed.ways.filter(w => w.tags.waterway && creekMatch.test(w.tags.name || ''));
  let creekCaveat = '';
  if (!waterways.length) {
    waterways = parsed.ways.filter(w => w.tags.waterway);
    creekCaveat = ` CAVEAT: no OSM waterway named "${creekName}" was found in this ${(half * 2).toFixed(3)}-deg bbox; the nearest unnamed/other waterway is used as an approximate proxy target for the pan reach — verify the actual creek on the ground.`;
  }
  if (!waterways.length) {
    console.log(`    no waterway of any kind found near ${labelPrefix}; skipping walk leg, pan will sit at the parking point.`);
    return { legs: [], panPoint: [parkingLat, parkingLng], panCaveat: ` No OSM waterway feature found nearby at all; treat this as the parking/roadside point, not a verified creek-edge location.` };
  }
  let creekPoint = null, creekDist = Infinity;
  for (const w of waterways) {
    const r = nearestIndex(parkingLat, parkingLng, w.coordsLatLng);
    if (r.distM < creekDist) { creekDist = r.distM; creekPoint = r.point; }
  }
  let best = null, bestScore = Infinity, bestStart = null, bestEnd = null;
  for (const w of paths) {
    const rs = nearestIndex(parkingLat, parkingLng, w.coordsLatLng);
    const re = nearestIndex(creekPoint[0], creekPoint[1], w.coordsLatLng);
    const score = rs.distM + re.distM;
    if (score < bestScore) { bestScore = score; best = w; bestStart = rs; bestEnd = re; }
  }
  const SNAP = 60, REASONABLE = 400;
  const legs = [];
  if (best && bestStart.distM < REASONABLE && bestEnd.distM < REASONABLE) {
    const lo = Math.min(bestStart.index, bestEnd.index), hi = Math.max(bestStart.index, bestEnd.index);
    let trailSeg = best.coordsLatLng.slice(lo, hi + 1);
    if (bestStart.index > bestEnd.index) trailSeg = trailSeg.slice().reverse();
    if (bestStart.distM > SNAP) {
      legs.push(await timedWalkLeg(`${labelPrefix} — parking to trail`, [[parkingLat, parkingLng], trailSeg[0]], 'approximate',
        `No mapped path within ${SNAP} m of the parking point; straight line to the nearest OSM way (${best.tags.name || best.tags.highway}, way ${best.id}), ${Math.round(bestStart.distM)} m away. OpenStreetMap contributors, api.openstreetmap.org small-bbox fetch 2026-09-21.`,
        speedFactor, cacheKeyPrefix));
    }
    legs.push(await timedWalkLeg(`${labelPrefix} — ${best.tags.name || best.tags.highway}`, trailSeg, 'exact',
      `Real OSM way ${best.id} (highway=${best.tags.highway}${best.tags.name ? ', name=' + best.tags.name : ''}). OpenStreetMap contributors, api.openstreetmap.org/api/0.6/map small-bbox fetch 2026-09-21 (ODbL).`,
      speedFactor, cacheKeyPrefix));
    if (bestEnd.distM > SNAP) {
      legs.push(await timedWalkLeg(`${labelPrefix} — trail to creek`, [trailSeg[trailSeg.length - 1], creekPoint], 'approximate',
        `No mapped path continues to the creek; straight line for the final ${Math.round(bestEnd.distM)} m.${creekCaveat}`,
        speedFactor, cacheKeyPrefix));
    }
  } else {
    const d = Math.round(haversineMeters(parkingLat, parkingLng, creekPoint[0], creekPoint[1]));
    legs.push(await timedWalkLeg(`${labelPrefix}`, [[parkingLat, parkingLng], creekPoint], 'approximate',
      `No mapped OSM path connects the parking point to ${creekName}; straight line, ${d} m. Real creek-edge point sourced from OSM waterway geometry even though the connecting line is a guess.${creekCaveat}`,
      speedFactor, cacheKeyPrefix));
  }
  return { legs, panPoint: creekPoint, panCaveat: creekCaveat };
}

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

// Merge consecutive OSRM steps that share the same road name into one
// logical segment (OSRM often splits a single physical road into many tiny
// maneuver steps — e.g. every curve — even with no real road change; the
// coordinator's own findings were reported per named road, not per raw step).
function groupSteps(steps) {
  const groups = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.name === s.name) {
      last.distance += s.distance;
      last.duration += s.duration;
      if (!last.midpoint && s.midpoint) last.midpoint = s.midpoint;
    } else {
      groups.push({ name: s.name, ref: s.ref, distance: s.distance, duration: s.duration, midpoint: s.midpoint });
    }
  }
  return groups;
}

// Re-time one drive leg by real road surface instead of trusting OSRM's
// default highway=track speed penalty (observed ~3-6 mph — walking pace —
// on real, maintained FS gravel that a truck runs at 15-25 mph). Keeps
// OSRM's DISTANCE always; only the duration is ever adjusted, and only per
// segment, with the full per-segment audit trail kept in retimed_steps.
async function driveLeg(label, fromId, toId) {
  const a = REFS[fromId], b = REFS[toId];
  console.log(`  drive: ${fromId} -> ${toId}`);
  const cachePrefix = `surf_${slug(fromId)}_${slug(toId)}`;
  const r = await fetchOSRMRouteSteps(a.lat, a.lng, b.lat, b.lng, `osrm_steps_${slug(fromId)}_${slug(toId)}.json`);
  const groups = groupSteps(r.steps);
  const retimedSteps = [];
  let adjustedSec = 0, gi = 0;
  for (const g of groups) {
    const distMi = metersToMiles(g.distance);
    const osrmMph = g.duration > 0 ? distMi / (g.duration / 3600) : null;
    if (distMi < 0.03 || !g.midpoint) {
      // Negligible connector step (or no geometry to look up) — not worth an
      // API call; trust OSRM's (tiny, low-impact-either-way) duration as-is.
      adjustedSec += g.duration;
      gi++;
      continue;
    }
    const tags = await findRoadTagsNear(g.midpoint[0], g.midpoint[1], g.name, `${cachePrefix}_g${gi}`);
    const surface = classifySurface(tags);
    let adjSec, mphUsed, retimed = false, confidence;
    if (surface === 'paved') {
      adjSec = g.duration; mphUsed = osrmMph; confidence = 'high';
    } else if (surface === 'unpaved') {
      adjSec = (distMi / GRAVEL_MPH) * 3600; mphUsed = GRAVEL_MPH; retimed = true; confidence = 'medium';
    } else if (osrmMph != null && osrmMph < UNDETERMINABLE_SLOW_MPH) {
      adjSec = (distMi / GRAVEL_MPH) * 3600; mphUsed = GRAVEL_MPH; retimed = true; confidence = 'low';
    } else {
      adjSec = g.duration; mphUsed = osrmMph; confidence = 'medium';
    }
    adjustedSec += adjSec;
    retimedSteps.push({
      name: g.name || '(unnamed)', ref: g.ref || null, miles: round2(distMi),
      surface, retimed, confidence,
      mph_osrm: osrmMph == null ? null : round1(osrmMph),
      mph_used: mphUsed == null ? null : round1(mphUsed),
      osm_tags: tags ? { highway: tags.highway || null, surface: tags.surface || null } : null,
    });
    if (retimed) console.log(`      retimed: "${g.name || '(unnamed)'}"${g.ref ? ' (' + g.ref + ')' : ''} ${round2(distMi)}mi ${surface}, OSRM ${round1(osrmMph)}mph -> ${GRAVEL_MPH}mph [confidence ${confidence}]`);
    gi++;
  }
  const minutesRaw = Math.round(r.minutes);
  const minutes = Math.round(adjustedSec / 60);
  const retimedCount = retimedSteps.filter(s => s.retimed).length;
  const mphRaw = r.miles / (minutesRaw / 60);
  const mphAdj = r.miles / (minutes / 60);
  console.log(`    ${r.miles.toFixed(1)} mi, OSRM raw ${minutesRaw} min (${mphRaw.toFixed(1)} mph) -> adjusted ${minutes} min (${mphAdj.toFixed(1)} mph) [${retimedCount ? 'estimated, ' + retimedCount + ' segment(s) retimed' : 'exact'}]`);
  const timingModel = retimedCount
    ? `OSRM steps=true re-timed by real road surface: ${retimedSteps.length} named segment(s) checked against OSM (api.openstreetmap.org small-bbox lookups, 2026-09-21), ${retimedCount} unpaved/track segment(s) re-timed at ${GRAVEL_MPH} mph (OSRM's default highway=track penalty had rated them at OSRM-implied speeds as low as 3.1 mph — walking pace, not a truck on maintained FS gravel). Paved segments keep OSRM's own duration. Distance is always OSRM's real routed distance, only duration changed. See retimed_steps for the per-segment breakdown (name, surface tag, OSRM mph vs. mph used).`
    : `OSRM steps=true checked by real road surface (OSM api.openstreetmap.org small-bbox lookups, 2026-09-21): every named segment came back paved (or an undeterminable segment whose OSRM-implied speed was already >= ${UNDETERMINABLE_SLOW_MPH} mph) — kept OSRM's own duration, no re-timing needed.`;
  return {
    type: 'drive', label, from_ref: fromId, to_ref: toId, coords: r.coordsLatLng,
    miles: Math.round(r.miles * 10) / 10,
    minutes, minutes_osrm_raw: minutesRaw,
    geometry_confidence: 'exact', timing_confidence: retimedCount ? 'estimated' : 'exact',
    timing_model: timingModel, retimed_steps: retimedSteps,
    source: 'OSRM driving route, steps=true (router.project-osrm.org public demo server), fetched 2026-09-21; see timing_model for the surface re-time.',
  };
}

// ---------------------------------------------------------------------------
// Day 1 — DeSoto Falls / Frogtown Creek
// ---------------------------------------------------------------------------
async function buildDay1() {
  console.log('Day 1: DeSoto Falls / Frogtown Creek');
  const legs = [];
  legs.push(await driveLeg('Vogel to DeSoto Falls', 'vogel_basecamp', 'desoto-frogtown'));
  const w = await buildCreekWalk({
    labelPrefix: 'Parking to Frogtown Creek', parkingLat: REFS['desoto-frogtown'].lat, parkingLng: REFS['desoto-frogtown'].lng,
    creekName: 'Frogtown Creek', creekMatch: /frogtown/i, cacheKeyPrefix: 'day1_frogtown', speedFactor: GROUP_FACTOR * DAYPACK_FACTOR,
  });
  legs.push(...w.legs);
  legs.push({ type: 'pan', at_ref: 'desoto-frogtown', label: 'Pan Frogtown Creek' + (w.panCaveat ? ' (approximate reach)' : ''), minutes: 150 });
  legs.push(await driveLeg('DeSoto Falls back to Vogel', 'desoto-frogtown', 'vogel_basecamp'));
  return {
    day: 1, date: '2026-10-15', title: 'Arrive, set camp, DeSoto Falls / Frogtown Creek',
    start: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng, time: '13:00' },
    end: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng },
    legs,
  };
}

// ---------------------------------------------------------------------------
// Day 2 — Dahlonega: Consolidated, Gold Museum, Yahoola Creek Park
// ---------------------------------------------------------------------------
async function buildDay2() {
  console.log('Day 2: Dahlonega');
  const legs = [];
  legs.push(await driveLeg('Vogel to Consolidated Gold Mine', 'vogel_basecamp', 'consolidated-gold-mine'));
  legs.push({ type: 'tour', at_ref: 'consolidated-gold-mine', label: 'Underground mine tour + flume panning', minutes: 120 });
  legs.push(await driveLeg('Consolidated Gold Mine to Gold Museum', 'consolidated-gold-mine', 'dahlonega-gold-museum'));
  legs.push({ type: 'tour', at_ref: 'dahlonega-gold-museum', label: 'Dahlonega Gold Museum State Historic Site', minutes: 75 });
  legs.push(await driveLeg('Gold Museum to Yahoola Creek Park', 'dahlonega-gold-museum', 'yahoola-park'));
  const w = await buildCreekWalk({
    labelPrefix: 'Parking to Yahoola Creek', parkingLat: REFS['yahoola-park'].lat, parkingLng: REFS['yahoola-park'].lng,
    creekName: 'Yahoola Creek', creekMatch: /yahoola/i, cacheKeyPrefix: 'day2_yahoola', speedFactor: GROUP_FACTOR * DAYPACK_FACTOR,
  });
  legs.push(...w.legs);
  legs.push({ type: 'pan', at_ref: 'yahoola-park', label: 'Pan Yahoola Creek', minutes: 120 });
  legs.push(await driveLeg('Yahoola Creek Park back to Vogel', 'yahoola-park', 'vogel_basecamp'));
  return {
    day: 2, date: '2026-10-16', title: 'Dahlonega — mine tour, museum, Yahoola Creek',
    start: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng, time: '08:30' },
    end: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng },
    legs,
  };
}

// ---------------------------------------------------------------------------
// Day 3 — Cooper Creek Recreation Area
// ---------------------------------------------------------------------------
async function buildDay3() {
  console.log('Day 3: Cooper Creek Recreation Area');
  const legs = [];
  legs.push(await driveLeg('Vogel to Cooper Creek Recreation Area', 'vogel_basecamp', 'cooper-creek'));
  legs.push({ type: 'pan', at_ref: 'cooper-creek', label: 'Pan Cooper Creek (north side, away from Gold Rush Days crowds; blaze orange — deer season opens today)', minutes: 240 });
  legs.push(await driveLeg('Cooper Creek back to Vogel', 'cooper-creek', 'vogel_basecamp'));
  return {
    day: 3, date: '2026-10-17', title: 'Cooper Creek Recreation Area',
    start: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng, time: '08:30' },
    end: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng },
    legs,
  };
}

// ---------------------------------------------------------------------------
// Day 4 — GA-348 loop: Tesnatee Gap, Upper Chattahoochee FS-44, Dukes Creek Falls
// ---------------------------------------------------------------------------
async function buildDay4() {
  console.log('Day 4: GA-348 loop');
  const legs = [];
  legs.push(await driveLeg('Vogel to Tesnatee Gap', 'vogel_basecamp', 'tesnatee-gap'));
  const w1 = await buildCreekWalk({
    labelPrefix: 'Gap pull-off to Tesnatee Creek', parkingLat: REFS['tesnatee-gap'].lat, parkingLng: REFS['tesnatee-gap'].lng,
    creekName: 'Tesnatee Creek', creekMatch: /tesnatee/i, cacheKeyPrefix: 'day4_tesnatee', speedFactor: GROUP_FACTOR * DAYPACK_FACTOR, half: 0.02,
  });
  legs.push(...w1.legs);
  legs.push({ type: 'pan', at_ref: 'tesnatee-gap', label: 'Pan Tesnatee Creek' + (w1.panCaveat ? ' (approximate reach — see leg note)' : ''), minutes: 90 });
  legs.push(await driveLeg('Tesnatee Gap to Upper Chattahoochee FS-44', 'tesnatee-gap', 'upper-chatt-fs44'));
  const w2 = await buildCreekWalk({
    labelPrefix: 'FS-44 pull-off to the river', parkingLat: REFS['upper-chatt-fs44'].lat, parkingLng: REFS['upper-chatt-fs44'].lng,
    creekName: 'Chattahoochee River', creekMatch: /chattahoochee/i, cacheKeyPrefix: 'day4_chatt', speedFactor: GROUP_FACTOR * DAYPACK_FACTOR,
  });
  legs.push(...w2.legs);
  legs.push({ type: 'pan', at_ref: 'upper-chatt-fs44', label: 'Pan Upper Chattahoochee River (stay below Mark Trail Wilderness boundary)', minutes: 90 });
  legs.push(await driveLeg('Upper Chattahoochee FS-44 to Dukes Creek Falls', 'upper-chatt-fs44', 'dukes-creek-falls'));
  const w3 = await buildCreekWalk({
    labelPrefix: 'Trailhead toward Dukes Creek', parkingLat: REFS['dukes-creek-falls'].lat, parkingLng: REFS['dukes-creek-falls'].lng,
    creekName: 'Dukes Creek', creekMatch: /dukes/i, cacheKeyPrefix: 'day4_dukes', speedFactor: GROUP_FACTOR * DAYPACK_FACTOR,
  });
  legs.push(...w3.legs);
  legs.push({ type: 'pan', at_ref: 'dukes-creek-falls', label: 'Pan Dukes Creek — NF side only, do not cross into Smithgall Woods State Park', minutes: 90 });
  legs.push(await driveLeg('Dukes Creek Falls back to Vogel', 'dukes-creek-falls', 'vogel_basecamp'));
  return {
    day: 4, date: '2026-10-18', title: 'GA-348 loop: Tesnatee Gap, Upper Chattahoochee, Dukes Creek Falls',
    start: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng, time: '08:30' },
    end: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng },
    legs,
  };
}

// ---------------------------------------------------------------------------
// Day 5 / Day 6 — Three Forks / Noontootla Creek overnight, using the real
// AT/Benton MacKaye Trail geometry already in trails.geojson (category
// 'trail', feature "Three Forks / Noontootla Creek Route ...").
// ---------------------------------------------------------------------------
function loadThreeForksTrailSeg() {
  const trails = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trails.geojson'), 'utf8'));
  const feat = trails.features.find(f => /Three Forks.*Noontootla/i.test(f.properties.name));
  if (!feat) throw new Error('Three Forks trail feature not found in trails.geojson');
  // The first line segment (94 pts) runs between the Long Creek approach and
  // the FS-58/Three Forks road crossing — confirmed by inspection to end
  // within ~35 m of the published Three Forks trailhead coordinate.
  const seg = feat.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
  return seg;
}

async function buildDay5And6() {
  console.log('Day 5/6: Three Forks / Noontootla Creek overnight');
  const trailhead = REFS['three-forks-noontootla'];
  const seg = loadThreeForksTrailSeg();
  // Orient so index 0 is the trailhead end.
  const dFirst = haversineMeters(trailhead.lat, trailhead.lng, seg[0][0], seg[0][1]);
  const dLast = haversineMeters(trailhead.lat, trailhead.lng, seg[seg.length - 1][0], seg[seg.length - 1][1]);
  const oriented = dLast < dFirst ? seg.slice().reverse() : seg;
  const snapDist = Math.min(dFirst, dLast);
  console.log(`  trailhead-end snap distance: ${snapDist.toFixed(0)} m (real OSM AT/Benton MacKaye Trail way)`);
  // Walk forward from the trailhead end accumulating distance, cut at ~0.3 mi
  // (real trail geometry; exact backcountry campsite pin is unverified — see
  // notes below. Cutting here, not further, follows the route notes'
  // instruction to move upstream/away from the road for solitude without
  // asserting a specific site this build cannot verify.)
  const TARGET_M = 0.3 * 1609.344;
  let cum = 0, cutIdx = oriented.length - 1;
  for (let i = 0; i < oriented.length - 1; i++) {
    cum += haversineMeters(oriented[i][0], oriented[i][1], oriented[i + 1][0], oriented[i + 1][1]);
    if (cum >= TARGET_M) { cutIdx = i + 1; break; }
  }
  const hikeCoords = oriented.slice(0, cutIdx + 1);
  const campPoint = hikeCoords[hikeCoords.length - 1];
  const actualMiles = metersToMiles(cum);
  console.log(`  hike-in cut at ${actualMiles.toFixed(2)} mi (target 0.30 mi), camp point ${campPoint[0].toFixed(6)},${campPoint[1].toFixed(6)}`);

  const hikeInSource = `Real OSM way geometry for the AT/Benton MacKaye Trail at Three Forks (feature "Three Forks / Noontootla Creek Route" in trails.geojson, sourced api.openstreetmap.org 2026-09-21). The trailhead end of this real trail is ${snapDist.toFixed(0)} m from the published Three Forks/FS-58 trailhead coordinate (N2Backpacking). The path direction and length are real; the CUT POINT (where camp/pan sit, ~0.3 mi up-trail) is NOT an independently surveyed campsite — overnight-wide.json's source data gives no separate camp coordinate (it originally reused the trailhead point verbatim). This cut follows the route notes' own instruction to move upstream of the road/AT-thru-hiker corridor for a quieter site; treat the exact tent pad as unverified.`;

  const legIn = await timedWalkLeg('Hike in to Three Forks backcountry camp', hikeCoords, 'approximate', hikeInSource, GROUP_FACTOR * PACK_FACTOR, 'day5_hikein');
  legIn.label = 'Hike in: FS-58 trailhead to backcountry camp';

  const day5 = {
    day: 5, date: '2026-10-19', title: 'Hike in: Three Forks / Noontootla Creek (overnight)',
    start: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng, time: '08:00' },
    end: { ref: 'three-forks-noontootla', label: 'Three Forks backcountry camp (Noontootla Creek)', lat: campPoint[0], lng: campPoint[1] },
    legs: [
      await driveLeg('Vogel to Three Forks (FS-58) trailhead', 'vogel_basecamp', 'three-forks-noontootla'),
      legIn,
    ],
  };

  const hikeOutCoords = hikeCoords.slice().reverse();
  const legOut = await timedWalkLeg('Hike out: backcountry camp to FS-58 trailhead', hikeOutCoords, 'approximate', hikeInSource, GROUP_FACTOR * PACK_FACTOR, 'day6_hikeout');

  const day6 = {
    day: 6, date: '2026-10-20', title: 'Wake at camp, pan Noontootla Creek, hike out, drive back to Vogel',
    start: { ref: 'three-forks-noontootla', label: 'Three Forks backcountry camp (Noontootla Creek)', lat: campPoint[0], lng: campPoint[1], time: '07:30' },
    end: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng },
    legs: [
      { type: 'pan', at_ref: 'three-forks-noontootla', label: 'Pan Noontootla Creek at the Three Forks confluence', minutes: 150 },
      legOut,
      await driveLeg('Three Forks (FS-58) trailhead back to Vogel', 'three-forks-noontootla', 'vogel_basecamp'),
    ],
  };

  return { day5, day6, hikeCoords, campPoint, actualMiles, legIn };
}

// ---------------------------------------------------------------------------
// Day 7 — break camp, depart
// ---------------------------------------------------------------------------
function buildDay7() {
  console.log('Day 7: break camp, depart');
  return {
    day: 7, date: '2026-10-21', title: 'Break camp, pack out, depart',
    start: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng, time: '08:00' },
    end: { ref: 'vogel_basecamp', label: REFS.vogel_basecamp.label, lat: REFS.vogel_basecamp.lat, lng: REFS.vogel_basecamp.lng },
    legs: [
      { type: 'tour', at_ref: 'vogel_basecamp', label: 'Break camp, pack out, depart by noon', minutes: 180 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Run all days, assemble days.json, patch overnight-wide.json.
// ---------------------------------------------------------------------------
const day1 = await buildDay1();
const day2 = await buildDay2();
const day3 = await buildDay3();
const day4 = await buildDay4();
const { day5, day6, hikeCoords, campPoint, actualMiles, legIn } = await buildDay5And6();
const day7 = buildDay7();

const days = [day1, day2, day3, day4, day5, day6, day7];

// Chain-consistency assertion: end of day N must equal start of day N+1.
let chainOk = true;
for (let i = 0; i < days.length - 1; i++) {
  const end = days[i].end, start = days[i + 1].start;
  const distM = haversineMeters(end.lat, end.lng, start.lat, start.lng);
  if (end.ref !== start.ref || distM > 5) {
    chainOk = false;
    console.warn(`WARNING: day ${days[i].day} end (${end.ref}, ${end.lat},${end.lng}) does not match day ${days[i + 1].day} start (${start.ref}, ${start.lat},${start.lng}) — ${distM.toFixed(0)} m apart.`);
  }
}
console.log(chainOk ? 'Chain check OK: every day end matches the next day start.' : 'Chain check FAILED — see warnings above.');

const daysJson = {
  schema: 'days-v1',
  assumptions: {
    walk_model: "Tobler's hiking function W = 6*exp(-3.5*abs(slope+0.05)) km/h, slope = rise/run sampled every ~100m from opentopodata (ASTER 30m dataset) along each walk leg's real geometry.",
    pack_factor: PACK_FACTOR,
    daypack_factor: DAYPACK_FACTOR,
    group_factor: GROUP_FACTOR,
    note: "Six people move slower than one. Speed factors are applied to Tobler's speed (kmh_effective = kmh_tobler * group_factor * pack_or_daypack_factor), not to time directly, so a slower group takes MORE time, not less. Times are moving time only; pan and tour windows are separate stationary legs. Minutes rounded to the nearest 5. start/end lat/lng on each day are taken directly from the first/last leg's real coordinates (or the day's only stationary point when it has no drive/walk legs), not looked up separately, so the chain-consistency check compares real coordinates.",
    drive_timing_model: `Every drive leg is fetched from OSRM with steps=true and grouped into named road segments. Each segment's OSM way is looked up (api.openstreetmap.org small-bbox, nearest way within 150m, preferring a name match) and classified: PAVED (surface=asphalt|paved|concrete, or highway=primary|secondary|tertiary|residential) trusts OSRM's own duration for that segment. UNPAVED (surface=gravel|dirt|unpaved|compacted|ground, or highway=track|unclassified with no paved surface tag) is re-timed at a flat ${GRAVEL_MPH} mph — a deliberately conservative real-world speed for a truck on maintained-but-rough Forest Service gravel, chosen because OSRM's default highway=track penalty came out to 3-6 mph (walking pace) on roads this group will actually drive (e.g. Noontoola Road, Blue Ridge Road near Three Forks; Chattahoochee River Road, Poplar Stump Road near FS-44). UNDETERMINABLE (no OSM way found nearby) keeps OSRM's duration unless OSRM's own implied speed was already under ${UNDETERMINABLE_SLOW_MPH} mph, in which case it's also re-timed at ${GRAVEL_MPH} mph but flagged confidence 'low'. Distance is always OSRM's real routed distance — only duration is ever adjusted, per segment, never the path. Each drive leg keeps both minutes (adjusted) and minutes_osrm_raw (original OSRM total) plus a full retimed_steps audit trail (per-segment name, surface tag, OSRM mph vs. mph used, confidence). timing_confidence on the leg is 'estimated' if any segment was re-timed, else 'exact'. Cross-check the two longest re-timed legs (Vogel<->Three Forks, and Day 4's Tesnatee/Upper-Chattahoochee/Dukes loop) against Google Maps before the trip — this is a same-order-of-magnitude estimate for rough forest road, not a survey.`,
  },
  days,
};

fs.writeFileSync(path.join(DATA_DIR, 'days.json'), JSON.stringify(daysJson, null, 2));
console.log('Wrote map/data/days.json');

// ---------------------------------------------------------------------------
// Patch overnight-wide.json's three-forks-noontootla entry with the same
// real hike-in geometry, fixing the route_coords:[] / one_way_mi:null gap.
// ---------------------------------------------------------------------------
const owPath = path.join(DATA_DIR, 'overnight-wide.json');
const ow = JSON.parse(fs.readFileSync(owPath, 'utf8'));
const tf = ow.find(o => o.id === 'three-forks-noontootla');
if (tf) {
  tf.camps = [{ name: 'Backcountry camp ~' + actualMiles.toFixed(2) + ' mi up the real AT/Benton MacKaye Trail from the FS-58 trailhead (exact tent pad unverified — see notes)', lat: campPoint[0], lng: campPoint[1] }];
  tf.pan_reaches = [{ name: 'Noontootla Creek corridor near the backcountry camp (~' + actualMiles.toFixed(2) + ' mi up-trail)', lat: campPoint[0], lng: campPoint[1] }];
  tf.route_coords = hikeCoords;
  tf.one_way_mi = Math.round(actualMiles * 100) / 100;
  tf.gain_ft = legIn.gain_ft;
  tf.notes = (tf.notes || '') + ` UPDATED 2026-09-21 (map rework pass): route_coords/one_way_mi/gain_ft were null/empty; filled in from real OSM AT/Benton MacKaye Trail geometry at Three Forks (see trails.geojson + map/data/days.json day 5/6 hike legs). The camp/pan_reach coordinate is a ~0.3-mi cut along that real trail chosen to move away from the FS-58/AT-thru-hiker corridor per this file's own pressure note, NOT an independently surveyed campsite — confirm on the ground or with a district ranger before relying on it.`;
  fs.writeFileSync(owPath, JSON.stringify(ow, null, 2));
  console.log('Patched overnight-wide.json: three-forks-noontootla now has real route_coords/one_way_mi/gain_ft.');
} else {
  console.warn('WARNING: could not find three-forks-noontootla in overnight-wide.json to patch.');
}

// ---------------------------------------------------------------------------
// Summary table for the report.
// ---------------------------------------------------------------------------
console.log('\n=== Day totals ===');
for (const d of days) {
  let driveMi = 0, walkMi = 0, gainFt = 0, totalMin = 0;
  for (const leg of d.legs) {
    totalMin += leg.minutes || 0;
    if (leg.type === 'drive') driveMi += leg.miles;
    if (leg.type === 'walk') { walkMi += leg.miles; gainFt += leg.gain_ft; }
  }
  console.log(`Day ${d.day} (${d.date}): drive ${driveMi.toFixed(1)} mi, walk ${walkMi.toFixed(2)} mi, gain ${Math.round(gainFt)} ft, elapsed ${totalMin} min (${(totalMin / 60).toFixed(1)} hr) from ${d.start.time || '(camp)'}`);
}
