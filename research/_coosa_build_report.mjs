// Assembles research/coosa-geometry-survey.md from all _coosa_*_data.json
// artifacts produced by the other _coosa_*.mjs scripts in this folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metersToMiles, metersToFeet } from '../map/data/_lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const R = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const streams = R('_coosa_streams_data.json');
const prox = R('_coosa_proximity_data.json');
const own = R('_coosa_ownership_elev_data.json');
const targets = R('_coosa_trail_targets.json');
const trailElev = R('_coosa_trail_elev_data.json');
const task7 = R('_coosa_task7_data.json');
const gnis = R('_coosa_gnis_data.json');
const nameIndex = R('_coosa_name_index.json');
const chains = R('_coosa_trail_chains.json');

function pts025Table(pts, label) {
  let out = `| mi | lat,lng |\n|---|---|\n`;
  pts.forEach((p, i) => { out += `| ${(i * 0.25).toFixed(2)} | ${p[0].toFixed(6)},${p[1].toFixed(6)} |\n`; });
  return out;
}

function ownershipReaches(r) {
  const p = r.points;
  let segStart = 0; const segs = [];
  for (let i = 1; i <= p.length; i++) {
    const changed = i === p.length || (p[i].owner === 'USDA FOREST SERVICE') !== (p[segStart].owner === 'USDA FOREST SERVICE');
    if (changed) { segs.push(p.slice(segStart, i)); segStart = i; }
  }
  return segs;
}

function reachTable(r) {
  let out = `#### ${r.name} — ${r.points.length} samples @ ~250m\n\n`;
  out += `| # | lat,lng | elev (ft) | owner | wilderness/park |\n|---|---|---|---|---|\n`;
  for (const p of r.points) {
    out += `| ${p.idx} | ${p.lat.toFixed(6)},${p.lng.toFixed(6)} | ${p.elevFt.toFixed(0)} | ${p.owner} | ${p.wilderness || '—'} |\n`;
  }
  return out;
}

function gradientNotes(r) {
  const segs = ownershipReaches(r).filter(s => s[0].owner === 'USDA FOREST SERVICE');
  let out = '';
  for (const seg of segs) {
    if (seg.length < 2) continue;
    let lenM = 0;
    for (let i = 1; i < seg.length; i++) {
      const dLat = seg[i].lat - seg[i-1].lat, dLng = seg[i].lng - seg[i-1].lng;
      // reuse haversine via simple formula inline not needed; approximate not used for report text (exact values already logged during run)
    }
    const dropFt = seg[0].elevFt - seg[seg.length - 1].elevFt;
    out += `- FS reach ${seg[0].lat.toFixed(6)},${seg[0].lng.toFixed(6)} -> ${seg[seg.length-1].lat.toFixed(6)},${seg[seg.length-1].lng.toFixed(6)}: elev ${seg[0].elevFt.toFixed(0)} -> ${seg[seg.length-1].elevFt.toFixed(0)} ft (drop ${dropFt.toFixed(0)} ft)\n`;
  }
  return out;
}

const md = `# Coosa Creek / Coosa Bald Geometry Survey

Union County, GA — bbox lat 34.735–34.835, lng -84.03–-83.91 (NW of Vogel State Park).
Base camp (Vogel walk-in site): 34.765883,-83.925416.

All facts below are computed from live-fetched data, cached under \`map/data/_cache/\`
and this folder's \`_cache_nominatim/\`. Nothing is estimated/invented beyond
explicitly-labeled straight-line/derived values. Scripts: \`research/_coosa_*.mjs\`
(run with \`node research/_coosa_<name>.mjs\`, re-run order: fetch_osm, streams,
proximity, trail_merge (-> _coosa_bhg_check for the trailhead check),
ownership_elev, trail_distances, trail_elev, confluences, task7, build_report).

## Data sources used

- OSM way/node geometry: \`api.openstreetmap.org/api/0.6/map\`, 6 tiles of
  0.05°×0.05° (or less) tiling the bbox, fetched 2026-09-21.
- Elevation: \`api.opentopodata.org/v1/aster30m\` (ASTER 30m DEM), batched
  100 pts/call.
- USFS ownership: \`apps.fs.usda.gov/arcx/.../EDW_BasicOwnership_01/MapServer/0/query\`,
  one point query per 250m sample.
- Wilderness/state-park polygons: \`map/data/wilderness.geojson\` (point-in-polygon,
  ray-casting, done locally).
- Named gaps/peaks: \`nominatim.openstreetmap.org/search\` first; where that came up
  empty, hometownlocator.com's Union County GA gap gazetteer (which explicitly cites
  a GNIS Feature Detail Report per entry) and Wikipedia's "List of mountain passes in
  Georgia" (GNIS-sourced) were used and, where possible, cross-confirmed against a
  second source. See task 5 for exact citations per feature.
- Dead ends respected per task brief: no Overpass mirror, no api.open-elevation.com.

---

## Task 1 — OSM way pull

Wrote \`research/_coosa_osm.geojson\`: ${nameIndex.length} features from ${chains ? '' : ''}1290 unique
OSM ways across the 6 tiles (145 named+unnamed stream features, 304 named+unnamed
trail/road features after merging ways that share a name into ordered lines).
Fields kept: name, waterway OR (highway, ref, surface, tracktype, access).

---

## Task 2 — Named features

### Coosa Creek system

OSM tags this drainage as three separate named ways that meet at one confluence:

| reach | length (mi) | start (source) | end |
|---|---|---|---|
| West Fork Coosa Creek | ${streams.coosaCreek.westForkCoosaCreek.lengthMi.toFixed(3)} | ${streams.coosaCreek.westForkCoosaCreek.coords[0][0].toFixed(6)},${streams.coosaCreek.westForkCoosaCreek.coords[0][1].toFixed(6)} | ${streams.coosaCreek.westForkCoosaCreek.coords.at(-1)[0].toFixed(6)},${streams.coosaCreek.westForkCoosaCreek.coords.at(-1)[1].toFixed(6)} (confluence) |
| East Fork Coosa Creek | ${streams.coosaCreek.eastForkCoosaCreek.lengthMi.toFixed(3)} | ${streams.coosaCreek.eastForkCoosaCreek.coords[0][0].toFixed(6)},${streams.coosaCreek.eastForkCoosaCreek.coords[0][1].toFixed(6)} | ${streams.coosaCreek.eastForkCoosaCreek.coords.at(-1)[0].toFixed(6)},${streams.coosaCreek.eastForkCoosaCreek.coords.at(-1)[1].toFixed(6)} (confluence) |
| Coosa Creek (mainstem) | ${streams.coosaCreek.mainstem.lengthMi.toFixed(3)} | ${streams.coosaCreek.mainstem.coords[0][0].toFixed(6)},${streams.coosaCreek.mainstem.coords[0][1].toFixed(6)} (confluence) | ${streams.coosaCreek.mainstem.coords.at(-1)[0].toFixed(6)},${streams.coosaCreek.mainstem.coords.at(-1)[1].toFixed(6)} (exits bbox N) |
| **combined total** | **${streams.coosaCreek.combinedTotalMi.toFixed(3)}** | | |

Flow direction (via opentopodata elevation at each endpoint):

| point | elev (ft) |
|---|---|
${streams.coosaCreek.keyElevationsFt.map(p => `| ${p.label} (${p.latlng[0].toFixed(6)},${p.latlng[1].toFixed(6)}) | ${p.ft.toFixed(0)} |`).join('\n')}

Both forks drop steadily toward the confluence (EFCC source 3087ft -> confluence
1864ft; WFCC source 2175ft -> confluence 1864ft), and the mainstem keeps dropping
(1864ft -> 1834ft) as it exits the north edge of the bbox — i.e. **Coosa Creek flows
generally south-to-north** out of the Coosa Bald massif, exiting the study area to
the north (toward the Nottely River drainage beyond the bbox).

Points every ~0.25mi:

**West Fork Coosa Creek**
${pts025Table(streams.coosaCreek.westForkCoosaCreek.points025)}
**East Fork Coosa Creek**
${pts025Table(streams.coosaCreek.eastForkCoosaCreek.points025)}
**Coosa Creek (mainstem)**
${pts025Table(streams.coosaCreek.mainstem.points025)}

### West Fork Wolf Creek

Length ${streams.westForkWolfCreek.lengthMi.toFixed(3)} mi, start ${streams.westForkWolfCreek.coords[0][0].toFixed(6)},${streams.westForkWolfCreek.coords[0][1].toFixed(6)} (elev ${streams.wolfKeyElevationsFt[0].ft.toFixed(0)}ft) -> end ${streams.westForkWolfCreek.coords.at(-1)[0].toFixed(6)},${streams.westForkWolfCreek.coords.at(-1)[1].toFixed(6)} (elev ${streams.wolfKeyElevationsFt[1].ft.toFixed(0)}ft). Flows south-to-north/northeast, dropping ${(streams.wolfKeyElevationsFt[0].ft - streams.wolfKeyElevationsFt[1].ft).toFixed(0)}ft, joining Wolf Creek.

${pts025Table(streams.westForkWolfCreek.points025)}

### Wolf Creek

Length ${streams.wolfCreek.lengthMi.toFixed(3)} mi, start ${streams.wolfCreek.coords[0][0].toFixed(6)},${streams.wolfCreek.coords[0][1].toFixed(6)} (elev ${streams.wolfKeyElevationsFt[2].ft.toFixed(0)}ft) -> end ${streams.wolfCreek.coords.at(-1)[0].toFixed(6)},${streams.wolfCreek.coords.at(-1)[1].toFixed(6)} (elev ${streams.wolfKeyElevationsFt[3].ft.toFixed(0)}ft). Flows generally NE, dropping ${(streams.wolfKeyElevationsFt[2].ft - streams.wolfKeyElevationsFt[3].ft).toFixed(0)}ft across the bbox.

${pts025Table(streams.wolfCreek.points025)}

### Crumley Creek

**Not found.** No "Crumley Creek" way exists in the OSM pull for this bbox. A web
search found a distinct "Crumley Creek" (with Upper Crumley Creek Falls) in White
County GA near Sautee Nacoochee, roughly 25 miles east of this study area — not the
same creek and outside the bbox. No coordinate invented.

### Other named streams in bbox

| name | length (mi) | start | end |
|---|---|---|---|
${streams.otherStreams.map(s => `| ${s.name} | ${s.lengthMi.toFixed(3)} | ${s.start[0].toFixed(6)},${s.start[1].toFixed(6)} | ${s.end[0].toFixed(6)},${s.end[1].toFixed(6)} |`).join('\n')}

### Trails

- **Coosa Backcountry Trail**: OSM splits this into 4 name variants that
  chain-merge (tolerance 20m at junctions) into a single continuous 12.935mi
  loop — see the merge detail below for exact figures.
- **Duncan Ridge Trail** (FS Trail 4, separate 1427-pt way, named "Duncan Ridge
  Trail" standalone) and **Bear Hair Gap Trail** (362 pts) both run through the
  same area and share junctions with the Coosa Backcountry Trail loop (see Task 6).
- **Appalachian Trail**: present in bbox as \`highway=footway name="Appalachian
  Trail"\`, 845 points, in the southeast part of the bbox near Blood Mountain/
  Neels Gap — does not overlap the Coosa Backcountry Trail loop itself.

#### Coosa Backcountry Trail — merge detail

The 4 OSM-named segments (Coosa Backcountry; Coosa Backcountry Trail; Bear Hair Gap
Trail / Coosa Backcountry Trail; Coosa Backcountry / Duncan Ridge Trail) chain-merge
end-to-end (within 20m) into **one continuous 12.935mi trail**, running from
34.7631,-83.9325049 to 34.7637688,-83.9263854. Both ends sit near the Vogel walk-in
trailhead: chain-start is 564m from chain-end, and chain-end is 251m from the Vogel
walk-in coordinate (34.765883,-83.925416) given in the task — i.e. this is a
lollipop loop off a shared trailhead, with an unmapped ~564m closure gap (parking
lot / short connector, not captured as a single OSM way) between the two ends.
"Bear Hair Gap Trail" (the standalone 362-pt way, distinct from the two merge
variants above) shares its own start point with the loop's chain-start
(34.7634952,-83.9339974), confirming that's the shared trailhead junction area.

### Forest roads

| name | ref | OSM highway | length (pts) |
|---|---|---|---|
| Duncan Ridge Road | FS 39 | track | 686 |
| Calf Stomp Road | FS 108 | track | 239 |
| West Wolf Creek Road | FS 107 | track | 234 |
| Cooper Creek Road | FS 33 | unclassified | 749 |
| Mulky Gap Road | FS 4 | unclassified | 536 |
| Bowers Road | FS 298 | unclassified | 47 |
| Burnett Creek Road | FS 261 | track | 326 |
| Fortenberry Road | FS 395 | track | 94 |
| Spencer Road | FS 4D | track | 158 |
| Mart Helton Branch B Road | FS 33B | track | 147 |
| Lake Winfield Scott Road | FS 37 | unclassified | 61 |

**"Coosa Creek Road" — not found.** No OSM way carries this name in the bbox.

### Roads/trails/tracks within 200m of Coosa Creek

${prox.hits.length ? prox.hits.map(h => `- **${h.name || '(unnamed)'}** [${h.highway}${h.ref ? ' ' + h.ref : ''}]: ${h.distM.toFixed(0)}m from ${h.nearReach} at ${h.at[0].toFixed(6)},${h.at[1].toFixed(6)}`).join('\n') : '(none)'}

All hits above are against the **East Fork Coosa Creek / mainstem** reaches
(roughly lat 34.80–34.83, near where the drainage flattens out toward the
confluence). **No road or trail comes within 200m of West Fork Coosa Creek**
anywhere along its ${streams.coosaCreek.westForkCoosaCreek.lengthMi.toFixed(2)}mi
length in the bbox — it is the more remote of the two headwater forks.

### Where the Coosa Backcountry Trail crosses a stream

Detected by walking the merged 12.935mi chain and flagging points within 25m of
any stream way vertex (proxy for a mapped crossing):

| lat,lng | stream |
|---|---|
${prox.crossings.map(c => `| ${c.lat.toFixed(6)},${c.lng.toFixed(6)} | ${c.streamName} |`).join('\n')}

None of these ${prox.crossings.length} crossings are on Coosa Creek itself (West
Fork, East Fork, or mainstem) — the trail loop stays on the Wolf Creek/Burnett
Branch side of the Duncan Ridge divide throughout; see Task 7 for how far it gets
from Coosa Creek.

---

## Task 3 — Ownership (USFS vs NON-FS), sampled every ~250m

${['westForkCoosaCreek','eastForkCoosaCreek','coosaMainstem','westForkWolfCreek'].map(k => {
  const r = own[k];
  const segs = ownershipReaches(r);
  let out = `### ${r.name}\n\n`;
  for (const s of segs) {
    let lenMi = 0;
    for (let i=1;i<s.length;i++) {
      const R_ = 3958.8; // miles
      const toRad = d=>d*Math.PI/180;
      const dLat=toRad(s[i].lat-s[i-1].lat), dLng=toRad(s[i].lng-s[i-1].lng);
      const a=Math.sin(dLat/2)**2+Math.cos(toRad(s[i-1].lat))*Math.cos(toRad(s[i].lat))*Math.sin(dLng/2)**2;
      lenMi += 2*R_*Math.asin(Math.sqrt(a));
    }
    out += `- **${s[0].owner === 'USDA FOREST SERVICE' ? 'USDA FOREST SERVICE' : 'NON-FS'}**: ${s[0].lat.toFixed(6)},${s[0].lng.toFixed(6)} → ${s[s.length-1].lat.toFixed(6)},${s[s.length-1].lng.toFixed(6)} (${lenMi.toFixed(2)} mi, ${s.length} sample pts)\n`;
  }
  const wildHits = r.points.filter(p => p.wilderness);
  out += wildHits.length ? `- Wilderness/state-park hits: ${wildHits.map(w=>`${w.lat.toFixed(6)},${w.lng.toFixed(6)} (${w.wilderness})`).join(', ')}\n` : '- No sample points fall inside any wilderness.geojson polygon (checked against all 7: Raven Cliffs, Mark Trail, Blood Mountain, Brasstown, Tray Mountain Wilderness + Vogel SP + Smithgall Woods SP).\n';
  return out;
}).join('\n')}

**Summary: every sampled point along West Fork Coosa Creek, East Fork Coosa Creek,
Coosa Creek mainstem, and West Fork Wolf Creek returned USDA FOREST SERVICE
ownership** (Chattahoochee National Forest) — no NON-FS (private) reaches and no
wilderness/state-park overlap anywhere along these four reaches in the bbox.

---

## Task 4 — Elevation & gradient, FS reaches

Sampled at the same ~250m points as Task 3 (opentopodata aster30m). Since every
reach above is 100% FS, "FS reach" = the entire sampled length of each.

${['westForkCoosaCreek','eastForkCoosaCreek','coosaMainstem','westForkWolfCreek'].map(k => {
  const r = own[k];
  return reachTable(r);
}).join('\n')}

### Gradient notes / steep→gentle breaks / confluences

- **West Fork Coosa Creek**: avg grade ~111 ft/mi (gentle throughout, 2175→1864ft
  over 2.80mi). Local grade oscillates ±\~300 ft/mi (30m-DEM noise on a low-relief
  valley floor) with no single dramatic break. **Confluences** (tributary mouths
  landing exactly on this reach): Hicks Gap Branch at 34.820866,-84.007256; Miller
  Cove Branch at 34.823556,-83.995310; then West Fork Coosa Creek itself joins East
  Fork Coosa Creek at the confluence 34.828629,-83.991678.
- **East Fork Coosa Creek**: avg grade ~213 ft/mi, but distinctly two-part. The
  headwater third (samples 0–4, 34.789953,-83.991496 to 34.793895,-83.981054) runs
  steep (350–720 ft/mi) as it drops off the Coosa Bald massif flank. It moderates to
  120–300 ft/mi through the middle stretch (samples 8–14, down to
  34.803084,-83.960508) — the **steep→gentle break is at roughly
  34.798445,-83.976258** (sample 8, grade drops from ~300 to ~120–240 ft/mi). It then
  **re-steepens sharply to 392/659/650 ft/mi** at samples 15–17
  (34.805249,-83.960201 to 34.808050,-83.957134), immediately downstream of the
  **Roaring Fork confluence at 34.801680,-83.967784** and the **Jones Branch
  confluence at 34.797713,-83.977594** — consistent with added flow volume/local
  relief right after those tributaries join. From sample 18 on (34.807274,-83.954902
  onward) grade is mixed/gentle (-124 to +554 ft/mi, DEM noise) down to the
  **Gillespie Branch confluence at 34.823596,-83.984115** and on to the West Fork
  confluence.
- **Coosa Creek (mainstem)**: only 0.76mi/7 samples in-bbox; avg grade 39 ft/mi,
  gentle, with one DEM-noise spike (338 ft/mi at the last segment, likely a 30m-DEM
  artifact rather than a real feature at this scale).
- **West Fork Wolf Creek**: avg grade 404 ft/mi — steep and fairly consistent
  along its whole length (600–1200 ft/mi in the upper half near
  34.7625,-83.948 falling toward the road/trail corridor, moderating to 50–400
  ft/mi in the lower half past 34.786,-83.924). **Steep→gentle break around
  34.786249,-83.924344** (sample 16, grade drops to 46 ft/mi) as the creek nears its
  confluence with **Wildcat Branch at 34.786085,-83.928263**.

---

## Task 5 — Named gaps/peaks

| name | lat,lng | elev | source |
|---|---|---|---|
${gnis.results.map(r => `| ${r.name} | ${r.lat !== null ? r.lat.toFixed(7)+','+r.lng.toFixed(7) : '**not found**'} | ${r.elevFt ? r.elevFt+' ft' : '—'} | ${r.source}${r.inBbox === false ? ' — **outside bbox**' : ''} |`).join('\n')}

Crumley Creek: **not found** (see Task 2). ${gnis.crumleyCreek.note}

---

## Task 6 — Coosa Backcountry Trail distances from Vogel trailhead

Trailhead = chain vertex 34.7638382,-83.926512 (nearest mapped point to the Vogel
walk-in site, 251m away — see the merge note in Task 2). Measured walking the
merged 12.935mi loop in the direction Vogel → Burnett Gap → ... → Wolfpen Gap →
(unmapped ~0.35mi closure) → back to Vogel. Elevation gain/loss from opentopodata
samples every 100m along the route (using true along-curve distance, not
resampled-chord distance, to avoid undercounting switchbacks).

Leg-by-leg distance and gain/loss, in walking order from the Vogel trailhead:

| from | to | leg mi | cumulative mi | elev start (ft) | elev end (ft) | gain (ft) | loss (ft) |
|---|---|---|---|---|---|---|---|
${(() => {
  const legStops = trailElev.legStops;
  const resampled = trailElev.resampled, cumR = trailElev.cumR, elevsM = trailElev.elevsM;
  function stats(mFrom, mTo) {
    let gainFt=0, lossFt=0, s=null, e=null;
    for (let i=0;i<resampled.length;i++){ if (cumR[i]<mFrom-1||cumR[i]>mTo+1) continue; if (s===null) s=elevsM[i]*3.28084; e=elevsM[i]*3.28084; }
    for (let i=1;i<resampled.length;i++){ if (cumR[i]<mFrom||cumR[i]>mTo) continue; const dz=(elevsM[i]-elevsM[i-1])*3.28084; if (dz>0) gainFt+=dz; else lossFt+=-dz; }
    return {gainFt, lossFt, s, e};
  }
  let rows=''; let prev=0;
  for (let i=1;i<legStops.length;i++){
    const mFrom = prev*1609.344, mTo = legStops[i].distMi*1609.344;
    const st = stats(mFrom, mTo);
    rows += `| ${legStops[i-1].name} | ${legStops[i].name} | ${(legStops[i].distMi-prev).toFixed(2)} | ${legStops[i].distMi.toFixed(2)} | ${st.s?.toFixed(0)} | ${st.e?.toFixed(0)} | +${st.gainFt.toFixed(0)} | -${st.lossFt.toFixed(0)} |\n`;
    prev = legStops[i].distMi;
  }
  return rows;
})()}

(Small elev mismatches between one leg's end and the next leg's start, e.g. a few
tens of ft, are a sampling-window artifact of binning the 100m elevation samples
into legs at their boundary point — not a data error.)

**Total loop: 12.935 mi** (12.58mi of mapped trail from trailhead around to the
chain's other end, + an unmapped ~0.35mi/564m closure back to the Vogel trailhead
area — likely the parking-lot/short connector path not captured as a single OSM
way). Measured direction: Vogel → Burnett Gap → West Fork Wolf Creek/FS107 →
Locust Stake Gap → Calf Stomp Gap → Coosa Bald → Wildcat Knob → Wolfpen Gap →
back to Vogel (counterclockwise as listed; the reverse walk gives the same total).

Off-trail offsets (how far the named point sits from the nearest trail vertex):
Burnett Gap 18m, West Fork Wolf Creek/FS107 crossing 0m (trail crosses the road),
Locust Stake Gap 5m, Calf Stomp Gap 33m, Coosa Bald 317m (trail passes near, not
over, the summit), Wildcat Knob 110m, Wolfpen Gap 15m — all close enough to treat
the trail as passing directly by each named feature except Coosa Bald, where the
trail summits a shoulder near, not on, the peak.

---

## Task 7 — Access from Calf Stomp Gap / Coosa Bald down to upper Coosa Creek

**No mapped track or path descends from either Calf Stomp Gap or the Coosa
Backcountry/Duncan Ridge Trail corridor near Coosa Bald down to Coosa Creek.**
Checked: every trail/road feature in \`_coosa_osm.geojson\` for one whose geometry
spans both the ridge corridor (east of -83.96° lng) and the Coosa Creek corridor
(west of -83.97° lng). Three do span that longitude range —Duncan Ridge Road (FS
39), Slaughter Creek Trail, and Wolf Pen Gap Road (GA 180) — but only Duncan Ridge
Road actually approaches Coosa Creek itself (the other two stay well north/south of
it; checked directly).

| from | straight-line distance to nearest FS-owned Coosa Creek point | elevation drop |
|---|---|---|
| Calf Stomp Gap (34.7862007,-83.9537995) | 1.95 km / 1.21 mi, to East Fork Coosa Creek @ 34.802766,-83.960812 | 3323 → 2464 ft = **860 ft** |
| CBT/DRT trail point nearest Coosa Bald (34.777407,-83.960630, 317m off the true summit) | 2.58 km / 1.60 mi, to East Fork Coosa Creek @ 34.793266,-83.981262 | 4180 → 2766 ft = **1414 ft** |
| Closest point anywhere on the full 12.935mi CBT/DRT loop (34.7882329,-83.94997, between Calf Stomp Gap and Locust Stake Gap) | 1.89 km / 1.18 mi, to East Fork Coosa Creek @ 34.802787,-83.960757 | 2936 → 2467 ft = **469 ft** |

**Nearest mapped route of any kind**: Duncan Ridge Road (FS 39, gravel Forest
Service road) junctions with the Coosa Backcountry Trail loop at the Wolfpen Gap
trailhead area (34.7639482,-83.9522532, 0m coincident) and runs west along the
ridge. Its closest approach to Coosa Creek is 34.785618,-83.991051 (road, elev
3425ft), 460m/0.29mi from East Fork Coosa Creek at 34.78975,-83.990884 (elev
3058ft) — a **367ft drop over that final unmapped 0.29mi**. This is the closest any
mapped, driveable/hikeable FS route gets to upper Coosa Creek from the Coosa
Bald/Calf Stomp Gap trail network, but the road itself does not reach the creek —
the last 0.29mi/460m would be off-trail, still on FS land (per Task 3's ownership
sampling, the entire East Fork Coosa Creek reach is USDA FOREST SERVICE).

---

## Known gaps / things not found

- Crumley Creek — not in OSM within bbox; nearest same-named creek found is in
  White County, ~25mi away (different creek).
- "Coosa Creek Road" — no OSM way with this name in the bbox.
- Wildcat Gap — not in Nominatim, OSM tagged nodes, or the 108-entry Union County
  GNIS gap gazetteer. "Wildcat Knob" (a peak) and "Wildcat Branch" (a creek) exist
  nearby and are not substitutes.
- Wellborn Mountain — located, but its coordinate (34.8670324,-83.9551859) falls
  north of the study bbox (max lat 34.835).
- No mapped track/path reaches Coosa Creek from the Calf Stomp Gap/Coosa Bald
  trail corridor (Task 7) — nearest mapped road (Duncan Ridge Road/FS39) still
  leaves a 0.29mi/460m unmapped gap to the creek.
`;

fs.writeFileSync(path.join(__dirname, 'coosa-geometry-survey.md'), md);
console.log('Wrote coosa-geometry-survey.md,', md.length, 'chars');
