// _lib.mjs — shared helpers for the one-off map/data/_build_water.mjs and
// map/data/_build_days.mjs scripts. Not used by build-map.mjs itself at
// runtime; these are build-time-only data generators.
//
// Network endpoints (verified working 2026-09-21 — see TOOLS.md):
//   - OSRM public demo (driving routes)
//   - api.openstreetmap.org/api/0.6/map (trail/creek way geometry, SMALL bboxes only)
//   - api.opentopodata.org/v1/aster30m (elevation, 100 locations/call, 1 call/sec)
// Dead, do not use: all Overpass mirrors, api.open-elevation.com.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.join(__dirname, '_cache');
export const UA = 'ga-gold-trip-map/1.0 (https://github.com/Hearnoevil343/guys-ga-trip)';

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cachePath(key) { return path.join(CACHE_DIR, key); }

export async function fetchCachedText(url, cacheKey, { politeMs = 0 } = {}) {
  const cf = cachePath(cacheKey);
  if (fs.existsSync(cf)) return fs.readFileSync(cf, 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(cf, text);
  if (politeMs) await sleep(politeMs);
  return text;
}

export async function fetchCachedJSON(url, cacheKey, opts) {
  const text = await fetchCachedText(url, cacheKey, opts);
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Geometry helpers. All "coordsLatLng" params/returns are [lat,lng] pairs,
// matching the convention already used by map/data/overnight-*.json's
// route_coords and by Leaflet's L.polyline().
// ---------------------------------------------------------------------------
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function polylineLengthMeters(coordsLatLng) {
  let d = 0;
  for (let i = 0; i < coordsLatLng.length - 1; i++) {
    d += haversineMeters(coordsLatLng[i][0], coordsLatLng[i][1], coordsLatLng[i + 1][0], coordsLatLng[i + 1][1]);
  }
  return d;
}
export const metersToMiles = m => m / 1609.344;
export const metersToFeet = m => m * 3.28084;

// Resample a polyline at ~spacingM intervals (inclusive of both endpoints),
// so we get evenly-spaced points to query elevation at. Capped so a single
// leg never needs more than one opentopodata batch call unless it's genuinely long.
export function resampleAlong(coordsLatLng, spacingM = 100, maxPoints = 100) {
  if (coordsLatLng.length < 2) return coordsLatLng.slice();
  const segLens = [];
  let total = 0;
  for (let i = 0; i < coordsLatLng.length - 1; i++) {
    const d = haversineMeters(coordsLatLng[i][0], coordsLatLng[i][1], coordsLatLng[i + 1][0], coordsLatLng[i + 1][1]);
    segLens.push(d);
    total += d;
  }
  if (total === 0) return [coordsLatLng[0], coordsLatLng[0]];
  let nSamples = Math.max(2, Math.ceil(total / spacingM) + 1);
  if (nSamples > maxPoints) nSamples = maxPoints;
  const out = [];
  let segIdx = 0, segAccum = 0;
  for (let s = 0; s < nSamples; s++) {
    const targetDist = (s / (nSamples - 1)) * total;
    while (segIdx < segLens.length - 1 && segAccum + segLens[segIdx] < targetDist) {
      segAccum += segLens[segIdx];
      segIdx++;
    }
    const segLen = segLens[segIdx] || 1e-9;
    const t = Math.min(1, Math.max(0, (targetDist - segAccum) / segLen));
    const a = coordsLatLng[segIdx], b = coordsLatLng[segIdx + 1] || a;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// opentopodata elevation, batched at <=100 locations/call, 1 call/sec.
// Returns an array of elevations in METRES aligned 1:1 with coordsLatLng.
// ---------------------------------------------------------------------------
export async function fetchElevationsMeters(coordsLatLng, cacheKeyPrefix) {
  const out = [];
  for (let i = 0; i < coordsLatLng.length; i += 100) {
    const batch = coordsLatLng.slice(i, i + 100);
    const locs = batch.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join('|');
    const url = `https://api.opentopodata.org/v1/aster30m?locations=${locs}`;
    const cacheKey = `elev_${cacheKeyPrefix}_${i}.json`;
    const json = await fetchCachedJSON(url, cacheKey, { politeMs: 1000 });
    if (json.status !== 'OK') throw new Error(`opentopodata status ${json.status} for ${cacheKeyPrefix}`);
    for (const r of json.results) out.push(r.elevation);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tobler's hiking function. slope is rise/run (dimensionless grade, e.g. 0.1
// = 10% grade uphill, -0.1 = 10% downhill). Returns speed in km/h.
// ---------------------------------------------------------------------------
export function toblerSpeedKmh(slope) {
  return 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
}

// Walk a leg's full-resolution path + matching elevation samples and return
// { miles, minutes, gainFt } using Tobler's function per elevation-sample
// segment, derated by speedFactor (group_factor * pack_factor|daypack_factor
// — see build-days' note on why this derates SPEED, not raw time).
export function computeWalkTiming(elevSampleCoordsLatLng, elevationsMeters, speedFactor) {
  let totalHours = 0;
  let gainM = 0;
  for (let i = 0; i < elevSampleCoordsLatLng.length - 1; i++) {
    const [lat1, lng1] = elevSampleCoordsLatLng[i];
    const [lat2, lng2] = elevSampleCoordsLatLng[i + 1];
    const distM = haversineMeters(lat1, lng1, lat2, lng2);
    const dz = elevationsMeters[i + 1] - elevationsMeters[i];
    if (dz > 0) gainM += dz;
    if (distM <= 0) continue;
    const slope = dz / distM;
    const speedKmh = toblerSpeedKmh(slope) * speedFactor;
    const distKm = distM / 1000;
    totalHours += distKm / speedKmh;
  }
  return { hours: totalHours, gainFt: metersToFeet(gainM) };
}

// ---------------------------------------------------------------------------
// OSRM driving route between two [lat,lng] points.
// ---------------------------------------------------------------------------
export async function fetchOSRMRoute(lat1, lng1, lat2, lng2, cacheKey) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
  const json = await fetchCachedJSON(url, cacheKey, { politeMs: 1000 });
  if (json.code !== 'Ok') throw new Error(`OSRM status ${json.code} for ${cacheKey}`);
  const route = json.routes[0];
  const coordsLatLng = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return {
    coordsLatLng,
    miles: metersToMiles(route.legs[0].distance),
    minutes: route.legs[0].duration / 60,
  };
}

// OSRM driving route WITH per-step (per-road-segment) breakdown, used to
// re-time gravel/track roads by real surface instead of trusting OSRM's
// default highway=track speed penalty (which is ~3-6 mph — walking pace).
// Each returned step carries its own name/ref/distance/duration/midpoint so
// the caller can look up that segment's real OSM surface tag.
export async function fetchOSRMRouteSteps(lat1, lng1, lat2, lng2, cacheKey) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson&steps=true`;
  const json = await fetchCachedJSON(url, cacheKey, { politeMs: 1000 });
  if (json.code !== 'Ok') throw new Error(`OSRM status ${json.code} for ${cacheKey}`);
  const route = json.routes[0];
  const coordsLatLng = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const steps = (route.legs[0].steps || []).map(s => {
    const coords = (s.geometry && s.geometry.coordinates) || [];
    const mid = coords.length ? coords[Math.floor(coords.length / 2)] : null;
    return {
      name: s.name || '', ref: s.ref || '', distance: s.distance, duration: s.duration,
      midpoint: mid ? [mid[1], mid[0]] : null, // -> [lat,lng]
    };
  });
  return {
    coordsLatLng,
    miles: metersToMiles(route.legs[0].distance),
    minutes: route.legs[0].duration / 60,
    steps,
  };
}

// Classify a road segment's surface from its OSM tags, per the fixed rule:
// paved (surface=asphalt|paved|concrete, or highway=primary|secondary|
// tertiary|residential) vs unpaved (surface=gravel|dirt|unpaved|compacted|
// ground, or highway=track|unclassified with no paved surface tag) vs
// undeterminable (no tags found / doesn't match either bucket).
export function classifySurface(tags) {
  if (!tags) return 'undeterminable';
  const surface = String(tags.surface || '').toLowerCase();
  const highway = String(tags.highway || '').toLowerCase();
  const PAVED_SURFACES = new Set(['asphalt', 'paved', 'concrete']);
  const UNPAVED_SURFACES = new Set(['gravel', 'dirt', 'unpaved', 'compacted', 'ground']);
  const PAVED_HIGHWAYS = new Set(['primary', 'secondary', 'tertiary', 'residential']);
  const UNPAVED_HIGHWAYS = new Set(['track', 'unclassified']);
  if (PAVED_SURFACES.has(surface)) return 'paved';
  if (UNPAVED_SURFACES.has(surface)) return 'unpaved';
  if (UNPAVED_HIGHWAYS.has(highway) && !PAVED_SURFACES.has(surface)) return 'unpaved';
  if (PAVED_HIGHWAYS.has(highway)) return 'paved';
  return 'undeterminable';
}

// Find the OSM way nearest a point (preferring one whose name matches, if
// given) and return its tags, trying a small bbox first and a slightly
// larger one if nothing turns up. Returns null if nothing road-like is
// within 150m at either size — the caller treats that as "undeterminable"
// rather than guessing.
export async function findRoadTagsNear(lat, lng, name, cacheKeyPrefix) {
  async function tryHalf(half) {
    const minLng = (lng - half).toFixed(6), maxLng = (lng + half).toFixed(6);
    const minLat = (lat - half).toFixed(6), maxLat = (lat + half).toFixed(6);
    const parsed = await fetchOSMBBox(minLng, minLat, maxLng, maxLat, `${cacheKeyPrefix}_${half}.xml`);
    const roads = parsed.ways.filter(w => w.tags.highway);
    if (!roads.length) return null;
    let best = null, bestDist = Infinity, bestIsNameMatch = false;
    for (const w of roads) {
      const { distM } = nearestVertexOnWay(lat, lng, w.coordsLatLng);
      if (distM > 150) continue;
      const nameMatch = !!(name && w.tags.name && w.tags.name.toLowerCase().includes(name.toLowerCase()));
      // A name match always wins over a closer-but-differently-named way;
      // otherwise take whichever is nearest.
      if (nameMatch && !bestIsNameMatch) { best = w; bestDist = distM; bestIsNameMatch = true; }
      else if (nameMatch === bestIsNameMatch && distM < bestDist) { best = w; bestDist = distM; }
    }
    return best ? best.tags : null;
  }
  return (await tryHalf(0.008)) || (await tryHalf(0.02)) || null;
}

// ---------------------------------------------------------------------------
// OSM /api/0.6/map XML parsing — small-bbox only (task spec: ~0.02 deg or
// less, or the API errors on too many nodes).
// ---------------------------------------------------------------------------
export async function fetchOSMBBox(minLng, minLat, maxLng, maxLat, cacheKey) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${minLng},${minLat},${maxLng},${maxLat}`;
  const xml = await fetchCachedText(url, cacheKey, { politeMs: 1000 });
  return parseOsmXml(xml);
}

export function parseOsmXml(xml) {
  const nodes = {}; // id -> [lat,lng]
  const nodeRe = /<node id="(\d+)"[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  let m;
  while ((m = nodeRe.exec(xml))) nodes[m[1]] = [parseFloat(m[2]), parseFloat(m[3])];
  const ways = [];
  const wayBlocks = xml.match(/<way\b[^>]*>[\s\S]*?<\/way>/g) || [];
  for (const w of wayBlocks) {
    const id = (w.match(/<way id="(\d+)"/) || [])[1];
    const tags = {};
    for (const tm of w.matchAll(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g)) {
      tags[decodeXml(tm[1])] = decodeXml(tm[2]);
    }
    const nodeIds = [...w.matchAll(/<nd ref="(\d+)"/g)].map(x => x[1]);
    const coordsLatLng = nodeIds.map(id2 => nodes[id2]).filter(Boolean);
    if (coordsLatLng.length > 1) ways.push({ id, tags, coordsLatLng });
  }
  return { nodes, ways };
}
function decodeXml(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Nearest distance (meters) from a point to any vertex of a way's polyline.
export function minDistToWayMeters(lat, lng, coordsLatLng) {
  let best = Infinity;
  for (const [wlat, wlng] of coordsLatLng) {
    const d = haversineMeters(lat, lng, wlat, wlng);
    if (d < best) best = d;
  }
  return best;
}
// Nearest vertex (its own [lat,lng]) on a way's polyline to a point.
export function nearestVertexOnWay(lat, lng, coordsLatLng) {
  let best = null, bestD = Infinity, bestIndex = -1;
  coordsLatLng.forEach((c, i) => {
    const d = haversineMeters(lat, lng, c[0], c[1]);
    if (d < bestD) { bestD = d; best = c; bestIndex = i; }
  });
  return { point: best, distM: bestD, index: bestIndex };
}

// ---------------------------------------------------------------------------
// Generic polyline-stitching helpers, added for map/data/_build_backcountry.mjs
// (real OSM trail/road ways that must be chained/cut at real points) but
// reusable by any future one-off builder.
// ---------------------------------------------------------------------------

// Interpolated point at targetMeters along a polyline (from index 0).
// Returns { index, t, point, cumM }; if targetMeters exceeds the polyline's
// length, clamps to the last point.
export function pointAtDistanceMeters(coordsLatLng, targetMeters) {
  let cum = 0;
  for (let i = 0; i < coordsLatLng.length - 1; i++) {
    const d = haversineMeters(coordsLatLng[i][0], coordsLatLng[i][1], coordsLatLng[i + 1][0], coordsLatLng[i + 1][1]);
    if (cum + d >= targetMeters) {
      const t = d > 0 ? (targetMeters - cum) / d : 0;
      const a = coordsLatLng[i], b = coordsLatLng[i + 1];
      return { index: i, t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], cumM: targetMeters };
    }
    cum += d;
  }
  return { index: coordsLatLng.length - 1, t: 0, point: coordsLatLng[coordsLatLng.length - 1], cumM: cum };
}
export function pointAtMiles(coordsLatLng, miles) { return pointAtDistanceMeters(coordsLatLng, miles * 1609.344); }

// Greedily chain-merge disjoint [lat,lng] polylines end-to-end (trying both
// orientations of each) into as few continuous chains as possible, within
// toleranceM of any endpoint match. Returns { chain, leftover } for the
// single-chain case (first segment's growth) — leftover holds any segments
// that never matched within tolerance (caller should treat that as a real
// gap, not silently drop it).
export function chainMergeSegments(segments, toleranceM = 40) {
  const segs = segments.map(s => s.slice());
  let chain = segs.shift();
  while (segs.length) {
    let bestI = -1, bestKind = null, bestD = Infinity;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const dStartStart = haversineMeters(chain[0][0], chain[0][1], s[0][0], s[0][1]);
      const dStartEnd = haversineMeters(chain[0][0], chain[0][1], s[s.length - 1][0], s[s.length - 1][1]);
      const dEndStart = haversineMeters(chain[chain.length - 1][0], chain[chain.length - 1][1], s[0][0], s[0][1]);
      const dEndEnd = haversineMeters(chain[chain.length - 1][0], chain[chain.length - 1][1], s[s.length - 1][0], s[s.length - 1][1]);
      const m = Math.min(dStartStart, dStartEnd, dEndStart, dEndEnd);
      if (m < bestD) {
        bestD = m; bestI = i;
        bestKind = m === dStartStart ? 'startstart' : m === dStartEnd ? 'startend' : m === dEndStart ? 'endstart' : 'endend';
      }
    }
    if (bestD > toleranceM) break;
    const s = segs.splice(bestI, 1)[0];
    if (bestKind === 'startstart') chain = s.slice().reverse().concat(chain);
    else if (bestKind === 'startend') chain = s.concat(chain);
    else if (bestKind === 'endstart') chain = chain.concat(s);
    else chain = chain.concat(s.slice().reverse());
  }
  return { chain, leftover: segs };
}

// ---------------------------------------------------------------------------
// Non-moving time legs (meals, camp setup/breakdown). No coords/lat/lng on
// purpose: build-map.mjs's buildDaySteps() only mints a new numbered map step
// for drive/walk (coords) or pan/tour (lat/lng) legs — anything else falls
// into its catch-all branch and just attaches to whichever step is already
// current, so these show up in the day panel leg list (icon + label + time)
// without creating a map marker or breaking the chain-position numbering.
export function mealLeg(label, minutes) {
  return { type: 'meal', label, minutes };
}
export function campLeg(label, minutes) {
  return { type: 'camp', label, minutes };
}
