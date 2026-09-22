// Task 2 (streams) + flow-direction via elevation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineMeters, metersToMiles, resampleAlong, fetchElevationsMeters } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '_coosa_osm.geojson'), 'utf8'));

function featByName(name) { return fc.features.filter(f => f.properties.name === name); }
function toLatLng(geom) {
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  return lines.map(l => l.map(([lng, lat]) => [lat, lng]));
}
function lineLenMi(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineMeters(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
  return metersToMiles(d);
}
function pointsEvery025mi(coords) {
  return resampleAlong(coords, 402.336, 500); // 0.25mi = 402.336m; allow up to 500 pts
}

// Combined "Coosa Creek": West Fork Coosa Creek + East Fork Coosa Creek (both
// join at confluence 34.828629,-83.991678) + mainstem Coosa Creek onward.
const wfcc = toLatLng(featByName('West Fork Coosa Creek')[0].geometry)[0];
const efcc = toLatLng(featByName('East Fork Coosa Creek')[0].geometry)[0];
const cc = toLatLng(featByName('Coosa Creek')[0].geometry)[0];

console.log('=== Coosa Creek system ===');
console.log('West Fork Coosa Creek:', wfcc.length, 'pts,', lineLenMi(wfcc).toFixed(3), 'mi, start', wfcc[0], 'end', wfcc[wfcc.length-1]);
console.log('East Fork Coosa Creek:', efcc.length, 'pts,', lineLenMi(efcc).toFixed(3), 'mi, start', efcc[0], 'end', efcc[efcc.length-1]);
console.log('Coosa Creek (mainstem):', cc.length, 'pts,', lineLenMi(cc).toFixed(3), 'mi, start', cc[0], 'end', cc[cc.length-1]);

const totalCombinedMi = lineLenMi(wfcc) + lineLenMi(efcc) + lineLenMi(cc);
console.log('Combined (WF+EF+mainstem) total length:', totalCombinedMi.toFixed(3), 'mi');

// elevation at key endpoints to determine flow direction
const keyPts = [
  ['WFCC source', wfcc[0]], ['WFCC/confluence', wfcc[wfcc.length-1]],
  ['EFCC source', efcc[0]], ['EFCC/confluence', efcc[efcc.length-1]],
  ['mainstem start(confluence)', cc[0]], ['mainstem end(bbox exit)', cc[cc.length-1]],
];
const elevs = await fetchElevationsMeters(keyPts.map(p => p[1]), 'coosa_creek_keypts');
for (let i = 0; i < keyPts.length; i++) {
  console.log(`  elev ${keyPts[i][0]} @ ${keyPts[i][1]}: ${(elevs[i]*3.28084).toFixed(0)} ft`);
}

// West Fork Wolf Creek, Wolf Creek
const wfwc = toLatLng(featByName('West Fork Wolf Creek')[0].geometry)[0];
const wc = toLatLng(featByName('Wolf Creek')[0].geometry)[0];
console.log('\n=== Wolf Creek system ===');
console.log('West Fork Wolf Creek:', wfwc.length, 'pts,', lineLenMi(wfwc).toFixed(3), 'mi, start', wfwc[0], 'end', wfwc[wfwc.length-1]);
console.log('Wolf Creek:', wc.length, 'pts,', lineLenMi(wc).toFixed(3), 'mi, start', wc[0], 'end', wc[wc.length-1]);
const wolfKeyPts = [['WFWC start', wfwc[0]], ['WFWC end', wfwc[wfwc.length-1]], ['WC start', wc[0]], ['WC end', wc[wc.length-1]]];
const wolfElevs = await fetchElevationsMeters(wolfKeyPts.map(p => p[1]), 'wolf_creek_keypts');
for (let i = 0; i < wolfKeyPts.length; i++) console.log(`  elev ${wolfKeyPts[i][0]} @ ${wolfKeyPts[i][1]}: ${(wolfElevs[i]*3.28084).toFixed(0)} ft`);

// Crumley Creek
const crumley = featByName('Crumley Creek');
console.log('\nCrumley Creek: features found =', crumley.length, '(not found in OSM within bbox)');

// All other named streams
console.log('\n=== All other named streams in bbox ===');
const excludeNames = new Set(['West Fork Coosa Creek', 'East Fork Coosa Creek', 'Coosa Creek', 'West Fork Wolf Creek', 'Wolf Creek']);
const streamFeats = fc.features.filter(f => f.properties.waterway && f.properties.name && !excludeNames.has(f.properties.name));
const otherStreams = [];
for (const f of streamFeats) {
  const lls = toLatLng(f.geometry);
  const totalLen = lls.reduce((a, l) => a + lineLenMi(l), 0);
  const allStart = lls[0][0], allEnd = lls[lls.length-1][lls[lls.length-1].length-1];
  console.log(`${f.properties.name}: ${totalLen.toFixed(3)} mi, ${lls.length} seg(s), start ${allStart}, end ${allEnd}`);
  otherStreams.push({ name: f.properties.name, lengthMi: totalLen, start: allStart, end: allEnd, segments: lls.length });
}

// Save full data structure for report assembly + point lists at 0.25mi
const out = {
  coosaCreek: {
    westForkCoosaCreek: { coords: wfcc, lengthMi: lineLenMi(wfcc), points025: pointsEvery025mi(wfcc) },
    eastForkCoosaCreek: { coords: efcc, lengthMi: lineLenMi(efcc), points025: pointsEvery025mi(efcc) },
    mainstem: { coords: cc, lengthMi: lineLenMi(cc), points025: pointsEvery025mi(cc) },
    combinedTotalMi: totalCombinedMi,
    keyElevationsFt: keyPts.map((p, i) => ({ label: p[0], latlng: p[1], ft: elevs[i]*3.28084 })),
  },
  westForkWolfCreek: { coords: wfwc, lengthMi: lineLenMi(wfwc), points025: pointsEvery025mi(wfwc) },
  wolfCreek: { coords: wc, lengthMi: lineLenMi(wc), points025: pointsEvery025mi(wc) },
  wolfKeyElevationsFt: wolfKeyPts.map((p, i) => ({ label: p[0], latlng: p[1], ft: wolfElevs[i]*3.28084 })),
  crumleyCreekFound: crumley.length > 0,
  otherStreams,
};
fs.writeFileSync(path.join(__dirname, '_coosa_streams_data.json'), JSON.stringify(out));
console.log('\nWrote _coosa_streams_data.json');
