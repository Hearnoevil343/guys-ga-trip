// build-map3d.mjs — writes map/map3d-data.js (window.TRIP) for the 3D map (map3d.html +
// map3d.js, both hand-written, MapLibre vendored in map/vendor/). Run after _build_days.mjs:
//   node map/build-map3d.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));

const days = read('days.json').days;
const core = read('core.json');
const spots = read('spots.json').filter(s => s.tier !== 'X');
const byId = Object.fromEntries([...core, ...spots].map(p => [p.id, p]));

const SPOT_KEYS = ['stream', 'access', 'legality', 'gold_record', 'pressure', 'target_tips', 'fees'];
const pick = (p, keys) => Object.fromEntries(keys.filter(k => typeof p[k] === 'string' && p[k]).map(k => [k, p[k]]));

const out = {
  built: new Date().toISOString(),
  days: days.map(d => ({
    day: d.day, date: d.date, title: d.title,
    start: { label: d.start.label, lat: d.start.lat, lng: d.start.lng, time: d.start.time },
    end: { label: d.end.label, lat: d.end.lat, lng: d.end.lng },
    legs: d.legs.map(l => {
      const at = l.at_ref && byId[l.at_ref];
      return {
        type: l.type, label: l.label, minutes: l.minutes, miles: l.miles, gain_ft: l.gain_ft, note: l.note,
        approx: l.geometry_confidence === 'approximate',
        coords: l.coords ? l.coords.map(c => [+c[1].toFixed(6), +c[0].toFixed(6)]) : undefined, // [lng,lat]
        at: at ? { name: at.name, lat: at.lat, lng: at.lng } : undefined,
      };
    }),
  })),
  spots: spots.map(s => ({ id: s.id, name: s.name, tier: s.tier, type: s.type, lat: s.lat, lng: s.lng, ...pick(s, SPOT_KEYS) })),
  core: core.map(c => ({ name: c.name, type: c.type, lat: c.lat, lng: c.lng })),
  trails: read('trails.geojson'),
  water: read('water.geojson'),
  privateLand: read('private.geojson'),
};
for (const k of ['trails', 'water', 'privateLand']) for (const f of out[k].features) f.properties = { name: f.properties.name || f.properties.label || '' };

fs.writeFileSync(path.join(__dirname, 'map3d-data.js'), 'window.TRIP = ' + JSON.stringify(out) + ';\n');
console.log('map3d-data.js', fs.statSync(path.join(__dirname, 'map3d-data.js')).size, 'bytes,', out.days.length, 'days,', out.spots.length, 'spots');
