// Generic endpoint-matching stitcher over the tiles_ways/tiles_nodes DB,
// used for AT, BMT, and FS 58 geometry.
import fs from 'node:fs';

const nodes = JSON.parse(fs.readFileSync('_cache_gis/tiles_nodes.json', 'utf8'));
const ways = JSON.parse(fs.readFileSync('_cache_gis/tiles_ways.json', 'utf8'));

function wayCoords(w) {
  return w.nodeRefs.map(r => nodes[r]).filter(Boolean).map(n => [n.lat, n.lng]);
}
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Build a set of candidate ways (id -> {coords, tags, first, last}) matching predicate.
function candidateWays(pred) {
  const out = {};
  for (const [id, w] of Object.entries(ways)) {
    if (!pred(w.tags)) continue;
    const coords = wayCoords(w);
    if (coords.length < 2) continue;
    out[id] = { coords, tags: w.tags, first: coords[0], last: coords[coords.length - 1] };
  }
  return out;
}

// Greedy walk: start at startLatLng, repeatedly pick the unused candidate way
// whose first or last endpoint is within snapM of the current cursor, extend,
// stop when no candidate connects or maxSteps reached.
function stitch(cands, startLatLng, snapM = 5, maxSteps = 200) {
  const used = new Set();
  let cursor = startLatLng;
  let full = [cursor];
  const log = [];
  for (let step = 0; step < maxSteps; step++) {
    let bestId = null, bestCoords = null, bestDist = Infinity;
    for (const [id, w] of Object.entries(cands)) {
      if (used.has(id)) continue;
      const dFirst = haversineMeters(cursor[0], cursor[1], w.first[0], w.first[1]);
      const dLast = haversineMeters(cursor[0], cursor[1], w.last[0], w.last[1]);
      if (dFirst < snapM && dFirst < bestDist) { bestId = id; bestCoords = w.coords; bestDist = dFirst; }
      if (dLast < snapM && dLast < bestDist) { bestId = id; bestCoords = w.coords.slice().reverse(); bestDist = dLast; }
    }
    if (!bestId) break;
    used.add(bestId);
    log.push(bestId);
    full = full.concat(bestCoords.slice(1));
    cursor = full[full.length - 1];
  }
  return { coords: full, usedIds: log, endCursor: cursor };
}

export { candidateWays, stitch, wayCoords, haversineMeters, nodes, ways };
