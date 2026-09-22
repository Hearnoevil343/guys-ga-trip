import fs from 'node:fs';
import path from 'node:path';

const dir = '_cache_gis/tiles';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));

const allNodes = {}; // id -> {lat,lng,tags}
const allWays = {};  // id -> {coords, tags}

for (const f of files) {
  const xml = fs.readFileSync(path.join(dir, f), 'utf8');
  const nodeBlocks = xml.match(/<node\b[^>]*(?:\/>|>[\s\S]*?<\/node>)/g) || [];
  for (const nb of nodeBlocks) {
    const idM = nb.match(/id="(\d+)"/);
    const latM = nb.match(/lat="([-\d.]+)"/);
    const lonM = nb.match(/lon="([-\d.]+)"/);
    if (!idM || !latM || !lonM) continue;
    const tags = {};
    for (const tm of nb.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)) tags[tm[1]] = tm[2];
    allNodes[idM[1]] = { lat: parseFloat(latM[1]), lng: parseFloat(lonM[1]), tags };
  }
  const wayBlocks = xml.match(/<way\b[^>]*>[\s\S]*?<\/way>/g) || [];
  for (const wb of wayBlocks) {
    const id = wb.match(/<way id="(\d+)"/)[1];
    if (allWays[id]) continue;
    const tags = {};
    for (const tm of wb.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)) tags[tm[1]] = tm[2];
    const refs = [...wb.matchAll(/<nd ref="(\d+)"/g)].map(x => x[1]);
    allWays[id] = { tags, nodeRefs: refs };
  }
}

console.error('nodes:', Object.keys(allNodes).length, 'ways:', Object.keys(allWays).length);

function wayCoords(id) {
  const w = allWays[id];
  return w.nodeRefs.map(r => allNodes[r]).filter(Boolean).map(n => [n.lat, n.lng]);
}

fs.writeFileSync('_cache_gis/tiles_index.json', JSON.stringify({ nodeCount: Object.keys(allNodes).length }));
fs.writeFileSync('_cache_gis/tiles_nodes.json', JSON.stringify(allNodes));
fs.writeFileSync('_cache_gis/tiles_ways.json', JSON.stringify(allWays));

// Search for POI nodes with interesting names
const wanted = /shelter|falls|gap|bridge|trailhead|parking|springer|hightower|hawk|stover|three forks|swinging/i;
console.error('\n--- POI nodes matching interest pattern ---');
for (const [id, n] of Object.entries(allNodes)) {
  const name = n.tags && (n.tags.name || n.tags.ele || '');
  if (n.tags && n.tags.name && wanted.test(n.tags.name)) {
    console.error(id, JSON.stringify(n.tags), n.lat, n.lng);
  }
}
