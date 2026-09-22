// _noon_stitch_creek.mjs — stitch Noontootla Creek (+ Chester Creek reach above
// the name change, + tributary stubs) into one ordered LineString from Three
// Forks to the Toccoa River confluence, using OSM way endpoint matching.
import fs from 'node:fs';

const allWays = JSON.parse(fs.readFileSync('_cache_gis/all_ways.json', 'utf8'));

// Ordered by hand-verified endpoint matching (see session notes). Each entry:
// [wayId, reverse?] — reverse=true means the way's coords must be flipped to
// continue downstream.
const CHAIN = [
  '43861997', // Chester Creek (Three Forks -> )  -- OSM tags this reach "Chester Creek" even below Three Forks
  '43862966', // Chester Creek (-> node where "Noontootla Creek" name begins)
  '43862544', // Noontootla Creek begins here
  '43863664',
  '43864190',
  '43863964',
  '43862782',
  '43865649',
  '43865724',
  '1243060476',
  '1243060475',
  '43863585',
  '43864235',
  '43862528',
  '43864937',
  '43864372',
  '43864080',
  '43863960',
  '43863321',
  '43859567',
  '43863001', // ends at node shared with Toccoa River way 43865647 -> the mouth
];

function key(pt) { return pt[0].toFixed(6) + ',' + pt[1].toFixed(6); }

let full = [];
let cursor = null;
for (const id of CHAIN) {
  const w = allWays[id];
  if (!w) throw new Error('missing way ' + id);
  let coords = w.coords;
  if (cursor) {
    const firstKey = key(coords[0]);
    const lastKey = key(coords[coords.length - 1]);
    if (firstKey === cursor) {
      // forward, ok
    } else if (lastKey === cursor) {
      coords = coords.slice().reverse();
    } else {
      throw new Error(`way ${id} does not connect to cursor ${cursor}; first=${firstKey} last=${lastKey}`);
    }
  }
  const toAppend = full.length ? coords.slice(1) : coords;
  full = full.concat(toAppend);
  cursor = key(coords[coords.length - 1]);
}

console.log('Total stitched points:', full.length);
console.log('Start (Three Forks):', full[0]);
console.log('End (Toccoa confluence):', full[full.length - 1]);

fs.writeFileSync('_cache_gis/noontootla_full.json', JSON.stringify(full));

// length
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
let total = 0;
for (let i = 0; i < full.length - 1; i++) total += haversineMeters(full[i][0], full[i][1], full[i + 1][0], full[i + 1][1]);
console.log('Total length (Three Forks -> Toccoa mouth), miles:', (total / 1609.344).toFixed(2));
