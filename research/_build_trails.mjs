// One-off script: parse cached OSM /api/0.6/map XML dumps (fetched 2026-09-21 from
// api.openstreetmap.org, small bboxes) and emit map/data/trails.geojson with real
// OSM way geometry for the four requested trail/creek routes. Not part of the
// regular build; run once, then delete the _osm_*.xml caches if desired.
import fs from 'node:fs';

function parse(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const nodeRe = /<node id="(\d+)"[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  const nodes = {};
  let m;
  while ((m = nodeRe.exec(xml))) nodes[m[1]] = [parseFloat(m[3]), parseFloat(m[2])]; // [lng,lat]
  const wayBlocks = xml.match(/<way[^>]*>[\s\S]*?<\/way>/g) || [];
  return { nodes, wayBlocks };
}
function waysByNames(parsed, names) {
  const out = [];
  for (const w of parsed.wayBlocks) {
    const n = (w.match(/k="name" v="([^"]*)"/) || [])[1];
    if (!names.includes(n)) continue;
    const id = w.match(/<way id="(\d+)"/)[1];
    const refs = [...w.matchAll(/<nd ref="(\d+)"/g)].map(x => x[1]);
    const coords = refs.map(r => parsed.nodes[r]).filter(Boolean);
    if (coords.length > 1) out.push(coords);
  }
  return out;
}

const dockery = parse('research/_osm_dockery.xml');
const threeforks = parse('research/_osm_threeforks.xml');
const rockcreek = parse('research/_osm_rockcreek.xml');
const coosa = parse('research/_osm_coosa.xml');

const dockeryLines = waysByNames(dockery, ['Dockery Lake']);
const threeForksLines = waysByNames(threeforks, ['Appalachian and Benton MacKaye Trail', 'Benton MacKaye Trail']);
const noontootlaLines = waysByNames(threeforks, ['Noontootla Creek']);
const rockCreekRoadLines = waysByNames(rockcreek, ['Rock Creek Road']);
const rockCreekLines = waysByNames(rockcreek, ['Rock Creek']);
const coosaLines = waysByNames(coosa, ['Coosa Backcountry Trail', 'Coosa Backcountry', 'Coosa Backcountry / Duncan Ridge Trail', 'Bear Hair Gap Trail / Coosa Backcountry Trail']);

function feature(name, label, category, lines, sourceNote) {
  return {
    type: 'Feature',
    properties: { name, label, category, coord_source: sourceNote },
    geometry: { type: 'MultiLineString', coordinates: lines },
  };
}

const SRC = 'OpenStreetMap contributors, via api.openstreetmap.org/api/0.6/map small-bbox fetch, 2026-09-21 (ODbL) — Overpass API mirrors were unreachable/timed out this session, so trail geometry was pulled from the main OSM API instead.';

const features = [
  feature('Dockery Lake Trail', 'Dockery Lake Trail (US-19 trailhead to AT junction near Miller Gap)', 'trail', dockeryLines, SRC + ' way 31275598, name=Dockery Lake.'),
  feature('Three Forks / Noontootla Creek Route (AT & BMT near FS 58)', 'AT/Benton MacKaye Trail at Three Forks, FS 58', 'trail', threeForksLines, SRC + ' ways named "Appalachian and Benton MacKaye Trail" / "Benton MacKaye Trail" near Three Forks.'),
  feature('Noontootla Creek', 'Noontootla Creek (waterway, Three Forks confluence area)', 'waterway', noontootlaLines, SRC + ' ways named "Noontootla Creek".'),
  feature('Rock Creek Road', 'Rock Creek Road (dispersed camping corridor, Fannin Co.)', 'road', rockCreekRoadLines, SRC + ' ways named "Rock Creek Road".'),
  feature('Rock Creek', 'Rock Creek (waterway)', 'waterway', rockCreekLines, SRC + ' ways named "Rock Creek".'),
  feature('Coosa Backcountry Trail', 'Coosa Backcountry Trail (Vogel State Park backcountry loop)', 'trail', coosaLines, SRC + ' ways named "Coosa Backcountry Trail" / "Coosa Backcountry" / "Coosa Backcountry / Duncan Ridge Trail" / "Bear Hair Gap Trail / Coosa Backcountry Trail".'),
];

for (const f of features) {
  console.log(f.properties.name, '-', f.geometry.coordinates.length, 'line segment(s),', f.geometry.coordinates.reduce((a, c) => a + c.length, 0), 'total points');
}

const fc = { type: 'FeatureCollection', features };
fs.writeFileSync('map/data/trails.geojson', JSON.stringify(fc, null, 1));
console.log('Wrote map/data/trails.geojson');
