// map3d.js — 3D trip map (MapLibre). Data: window.TRIP from map3d-data.js (build-map3d.mjs).
// Tiles: if tiles/manifest.json exists (the Android app bundles it), everything loads from
// the local tiles/ folder and the map works with no signal; otherwise USGS / AWS online.
// No text labels on the map itself: MapLibre text needs font files from the web.
const T = window.TRIP;
const DAY_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#009999', '#f032e6'];
const DRIVE = '#4a4a4a', WALK = '#e6550d';
const TIER_COLORS = { A: '#2ca02c', B: '#f2b600', C: '#9a9a9a' };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const abs = p => new URL(p, location.href).href.replace(/%7B/g, '{').replace(/%7D/g, '}');

async function loadManifest() {
  try { const r = await fetch('tiles/manifest.json', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}

function sources(man) {
  if (!man) return {
    topo: { type: 'raster', tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'USGS The National Map' },
    sat: { type: 'raster', tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'USGS The National Map' },
    dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: 'Mapzen Terrain Tiles (AWS)' },
  };
  const b = r => [r.w, r.s, r.e, r.n];
  const L = man.layers, src = {};
  for (const id of ['topo', 'sat']) {
    const url = abs(`tiles/${id}/{z}/{x}/{y}.${L[id].ext}`);
    src[id] = { type: 'raster', tiles: [url], tileSize: 256, minzoom: L[id].minzoom, maxzoom: L[id].maxzoom - 1, bounds: b(man.wide), attribution: 'USGS The National Map' };
    src[id + 'Hi'] = { type: 'raster', tiles: [url], tileSize: 256, minzoom: L[id].maxzoom, maxzoom: L[id].maxzoom, bounds: b(man.near) };
  }
  src.dem = { type: 'raster-dem', tiles: [abs('tiles/dem/{z}/{x}/{y}.png')], tileSize: 256, minzoom: L.dem.minzoom, maxzoom: L.dem.maxzoom - 1, encoding: 'terrarium', bounds: b(man.wide), attribution: 'Mapzen Terrain Tiles (AWS)' };
  return src;
}

function legFeatures() {
  const fs = [];
  T.days.forEach(d => d.legs.forEach((l, i) => {
    if (!l.coords || l.coords.length < 2) return;
    fs.push({ type: 'Feature', properties: { day: d.day, i, type: l.type, approx: l.approx ? 1 : 0, color: l.type === 'drive' ? DRIVE : WALK, daycolor: DAY_COLORS[(d.day - 1) % 7] }, geometry: { type: 'LineString', coordinates: l.coords } });
  }));
  return { type: 'FeatureCollection', features: fs };
}
const pointFC = arr => ({ type: 'FeatureCollection', features: arr.map((p, i) => ({ type: 'Feature', properties: { i, tier: p.tier || '' }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) });

function allBounds(day) {
  const b = new maplibregl.LngLatBounds();
  for (const d of T.days) if (!day || d.day === day) {
    b.extend([d.start.lng, d.start.lat]); b.extend([d.end.lng, d.end.lat]);
    for (const l of d.legs) { if (l.coords) l.coords.forEach(c => b.extend(c)); if (l.at) b.extend([l.at.lng, l.at.lat]); }
  }
  return b;
}

// ---- panel (details live under the map, not floating over it)
function showPanel(title, html) {
  $('panel').innerHTML = `<h3><span>${title}</span><button aria-label="Close" onclick="document.getElementById('panel').classList.remove('open')">×</button></h3>${html}`;
  $('panel').classList.add('open');
  $('panel').scrollTop = 0;
}
const row = (k, v) => v ? `<div class="row"><span class="lbl">${esc(k)}:</span> ${esc(v)}</div>` : '';
function legText(l) {
  const bits = [l.minutes ? l.minutes + ' min' : '', l.miles ? l.miles + ' mi' : '', l.gain_ft ? '+' + l.gain_ft + ' ft' : ''].filter(Boolean).join(', ');
  return `${esc(l.label)}${bits ? ` <span class="t">(${bits})</span>` : ''}`;
}
function showDay(d) {
  showPanel(`Day ${d.day} · ${esc(d.date)} — ${esc(d.title)}`,
    row('Start', d.start.label + (d.start.time ? ' at ' + d.start.time : '')) + row('Night', d.end.label) +
    `<ol>${d.legs.map(l => `<li>${legText(l)}${l.note ? `<div class="t">${esc(l.note)}</div>` : ''}</li>`).join('')}</ol>`);
}
function showLeg(day, i) {
  const d = T.days.find(x => x.day === day), l = d.legs[i];
  showPanel(`Day ${day}: ${esc(l.type)}`, `<div class="row">${legText(l)}</div>` + (l.approx ? '<div class="warn">Approximate line: not an exact trail trace.</div>' : '') + `<div class="row"><a href="#" onclick="pickDay(${day});return false">Show all of day ${day}</a></div>`);
}
function showSpot(s) {
  showPanel(esc(s.name) + ` <span class="t">tier ${esc(s.tier)}</span>`,
    row('Stream', s.stream) + row('Access', s.access) + row('Legal', s.legality) + row('Gold record', s.gold_record) + row('Crowds', s.pressure) + row('Tips', s.target_tips) + row('Fees', s.fees));
}

// ---- markers (HTML, so no web fonts needed)
let stopMarkers = [];
function el(html, css) { const e = document.createElement('div'); e.innerHTML = html; e.style.cssText = css; return e; }
function drawStops(day) {
  stopMarkers.forEach(m => m.remove()); stopMarkers = [];
  const camps = new Map();
  for (const d of T.days) if (!day || d.day === day) camps.set(d.end.label, d.end);
  const pin = 'font:600 12px system-ui;border-radius:12px;padding:2px 6px;border:2px solid #fff;box-shadow:0 1px 3px #0006;cursor:pointer;';
  for (const c of camps.values()) {
    const m = new maplibregl.Marker({ element: el('⛺', pin + 'background:#fff;font-size:15px;') }).setLngLat([c.lng, c.lat]).addTo(map);
    m.getElement().addEventListener('click', ev => { ev.stopPropagation(); showPanel('Camp', row('Where', c.label) + row('Nights', T.days.filter(d => d.end.label === c.label).map(d => 'Day ' + d.day).join(', '))); });
    stopMarkers.push(m);
  }
  if (!day) return;
  const d = T.days.find(x => x.day === day);
  let n = 0;
  d.legs.forEach(l => {
    if (!l.at) return;
    const m = new maplibregl.Marker({ element: el(String(++n), pin + `background:${DAY_COLORS[(day - 1) % 7]};color:#fff;`) }).setLngLat([l.at.lng, l.at.lat]).addTo(map);
    m.getElement().addEventListener('click', ev => { ev.stopPropagation(); showPanel(esc(l.at.name), `<div class="row">${legText(l)}</div>`); });
    stopMarkers.push(m);
  });
}

let map, selDay = 0;
window.pickDay = function (day) {
  selDay = +day; $('day').value = String(selDay);
  const f = selDay ? ['==', ['get', 'day'], selDay] : null;
  map.setFilter('legs-casing', f); map.setFilter('legs', f);
  map.setPaintProperty('legs', 'line-color', selDay ? ['get', 'color'] : ['get', 'daycolor']);
  drawStops(selDay);
  map.fitBounds(allBounds(selDay), { padding: 40, maxZoom: map.getTerrain() ? 13.5 : 15, pitch: map.getPitch(), duration: 600 });
  if (selDay) showDay(T.days.find(d => d.day === selDay)); else $('panel').classList.remove('open');
};

// ---- GPS: the phone's own GPS chip, works with no cell signal
let watchId = null, firstFix = true;
function circle(lng, lat, m) {
  const pts = [], k = m / 111320;
  for (let a = 0; a <= 64; a++) { const t = a / 64 * 2 * Math.PI; pts.push([lng + k * Math.cos(t) / Math.cos(lat * Math.PI / 180), lat + k * Math.sin(t)]); }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
}
function toggleGps() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; $('me').classList.remove('on'); setMe(null); return; }
  if (!navigator.geolocation) { $('status').textContent = 'No GPS on this device'; return; }
  $('me').classList.add('on'); firstFix = true; $('status').textContent = 'Finding GPS…';
  watchId = navigator.geolocation.watchPosition(p => {
    const { longitude: lng, latitude: lat, accuracy } = p.coords;
    setMe([lng, lat], accuracy);
    $('status').textContent = `You: ±${Math.round(accuracy)} m`;
    if (firstFix) { firstFix = false; map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14) }); }
  }, e => { $('status').textContent = 'GPS: ' + e.message; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 60000 });
}
function setMe(ll, acc) {
  map.getSource('me').setData({ type: 'FeatureCollection', features: ll ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: ll }, properties: {} }] : [] });
  map.getSource('me-acc').setData({ type: 'FeatureCollection', features: ll ? [circle(ll[0], ll[1], acc)] : [] });
}

(async function init() {
  const man = await loadManifest();
  const src = sources(man);
  const empty = { type: 'FeatureCollection', features: [] };
  const raster = (id, s, extra) => ({ id, type: 'raster', source: s, ...extra });
  const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9e6dc' } }];
  for (const base of ['topo', 'sat']) {
    const vis = { layout: { visibility: base === 'topo' ? 'visible' : 'none' } };
    layers.push(raster(base, base, vis));
    if (src[base + 'Hi']) layers.push(raster(base + 'Hi', base + 'Hi', { minzoom: src[base + 'Hi'].minzoom, ...vis }));
  }
  layers.push(
    { id: 'hillshade', type: 'hillshade', source: 'dem2', paint: { 'hillshade-exaggeration': 0.35 } },
    { id: 'private-fill', type: 'fill', source: 'private', paint: { 'fill-color': '#7b3fa0', 'fill-opacity': 0.18 } },
    { id: 'private-line', type: 'line', source: 'private', paint: { 'line-color': '#7b3fa0', 'line-width': 1, 'line-dasharray': [3, 2] } },
    { id: 'water', type: 'line', source: 'water', paint: { 'line-color': '#1f78d1', 'line-width': 2.5 } },
    { id: 'trails', type: 'line', source: 'trails', paint: { 'line-color': '#7a4a1d', 'line-width': 2, 'line-dasharray': [2, 1.5] } },
    { id: 'legs-casing', type: 'line', source: 'legs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 7 } },
    { id: 'legs', type: 'line', source: 'legs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'daycolor'], 'line-width': ['case', ['==', ['get', 'type'], 'drive'], 3.5, 4.5] } },
    { id: 'spots', type: 'circle', source: 'spots', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'tier'], 'A', TIER_COLORS.A, 'B', TIER_COLORS.B, TIER_COLORS.C], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
    { id: 'me-acc', type: 'fill', source: 'me-acc', paint: { 'fill-color': '#1a73e8', 'fill-opacity': 0.15 } },
    { id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 8, 'circle-color': '#1a73e8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
  );
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        ...src, dem2: { ...src.dem },
        private: { type: 'geojson', data: T.privateLand }, water: { type: 'geojson', data: T.water }, trails: { type: 'geojson', data: T.trails },
        legs: { type: 'geojson', data: legFeatures() }, spots: { type: 'geojson', data: pointFC(T.spots) },
        me: { type: 'geojson', data: empty }, 'me-acc': { type: 'geojson', data: empty },
      },
      layers,
    },
    bounds: allBounds(0), fitBoundsOptions: { padding: 30 },
    maxPitch: 75, attributionControl: { compact: true },
  });
  map.on('load', () => {
    map.setTerrain({ source: 'dem', exaggeration: 1.2 });
    map.easeTo({ pitch: 55, duration: 0 });
    drawStops(0);
  });
  map.on('click', 'legs', e => { const p = e.features[0].properties; showLeg(p.day, p.i); });
  map.on('click', 'spots', e => showSpot(T.spots[e.features[0].properties.i]));
  for (const id of ['legs', 'spots']) {
    map.on('mouseenter', id, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', id, () => map.getCanvas().style.cursor = '');
  }

  $('status').textContent = man ? 'Offline map saved in app' : 'Online map';
  for (const d of T.days) $('day').add(new Option(`Day ${d.day} · ${d.date.slice(5)}`, d.day));
  $('day').onchange = e => pickDay(e.target.value);
  $('base').onclick = () => {
    const sat = $('base').classList.toggle('on');
    for (const id of ['topo', 'topoHi']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sat ? 'none' : 'visible');
    for (const id of ['sat', 'satHi']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sat ? 'visible' : 'none');
  };
  $('tilt').onclick = () => {
    const on = $('tilt').classList.toggle('on');
    map.setTerrain(on ? { source: 'dem', exaggeration: 1.2 } : null);
    map.easeTo(on ? { pitch: 55 } : { pitch: 0, bearing: 0 });
  };
  $('me').onclick = toggleGps;
})();
