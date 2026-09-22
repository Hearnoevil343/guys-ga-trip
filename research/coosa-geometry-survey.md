# Coosa Creek / Coosa Bald Geometry Survey

Union County, GA — bbox lat 34.735–34.835, lng -84.03–-83.91 (NW of Vogel State Park).
Base camp (Vogel walk-in site): 34.765883,-83.925416.

All facts below are computed from live-fetched data, cached under `map/data/_cache/`
and this folder's `_cache_nominatim/`. Nothing is estimated/invented beyond
explicitly-labeled straight-line/derived values. Scripts: `research/_coosa_*.mjs`
(run with `node research/_coosa_<name>.mjs`, re-run order: fetch_osm, streams,
proximity, trail_merge (-> _coosa_bhg_check for the trailhead check),
ownership_elev, trail_distances, trail_elev, confluences, task7, build_report).

## Data sources used

- OSM way/node geometry: `api.openstreetmap.org/api/0.6/map`, 6 tiles of
  0.05°×0.05° (or less) tiling the bbox, fetched 2026-09-21.
- Elevation: `api.opentopodata.org/v1/aster30m` (ASTER 30m DEM), batched
  100 pts/call.
- USFS ownership: `apps.fs.usda.gov/arcx/.../EDW_BasicOwnership_01/MapServer/0/query`,
  one point query per 250m sample.
- Wilderness/state-park polygons: `map/data/wilderness.geojson` (point-in-polygon,
  ray-casting, done locally).
- Named gaps/peaks: `nominatim.openstreetmap.org/search` first; where that came up
  empty, hometownlocator.com's Union County GA gap gazetteer (which explicitly cites
  a GNIS Feature Detail Report per entry) and Wikipedia's "List of mountain passes in
  Georgia" (GNIS-sourced) were used and, where possible, cross-confirmed against a
  second source. See task 5 for exact citations per feature.
- Dead ends respected per task brief: no Overpass mirror, no api.open-elevation.com.

---

## Task 1 — OSM way pull

Wrote `research/_coosa_osm.geojson`: 449 features from 1290 unique
OSM ways across the 6 tiles (145 named+unnamed stream features, 304 named+unnamed
trail/road features after merging ways that share a name into ordered lines).
Fields kept: name, waterway OR (highway, ref, surface, tracktype, access).

---

## Task 2 — Named features

### Coosa Creek system

OSM tags this drainage as three separate named ways that meet at one confluence:

| reach | length (mi) | start (source) | end |
|---|---|---|---|
| West Fork Coosa Creek | 3.109 | 34.803760,-84.011785 | 34.828629,-83.991678 (confluence) |
| East Fork Coosa Creek | 6.289 | 34.789953,-83.991496 | 34.828629,-83.991678 (confluence) |
| Coosa Creek (mainstem) | 0.868 | 34.828629,-83.991678 (confluence) | 34.837183,-83.989589 (exits bbox N) |
| **combined total** | **10.266** | | |

Flow direction (via opentopodata elevation at each endpoint):

| point | elev (ft) |
|---|---|
| WFCC source (34.803760,-84.011785) | 2175 |
| WFCC/confluence (34.828629,-83.991678) | 1864 |
| EFCC source (34.789953,-83.991496) | 3087 |
| EFCC/confluence (34.828629,-83.991678) | 1864 |
| mainstem start(confluence) (34.828629,-83.991678) | 1864 |
| mainstem end(bbox exit) (34.837183,-83.989589) | 1834 |

Both forks drop steadily toward the confluence (EFCC source 3087ft -> confluence
1864ft; WFCC source 2175ft -> confluence 1864ft), and the mainstem keeps dropping
(1864ft -> 1834ft) as it exits the north edge of the bbox — i.e. **Coosa Creek flows
generally south-to-north** out of the Coosa Bald massif, exiting the study area to
the north (toward the Nottely River drainage beyond the bbox).

Points every ~0.25mi:

**West Fork Coosa Creek**
| mi | lat,lng |
|---|---|
| 0.00 | 34.803760,-84.011785 |
| 0.25 | 34.806656,-84.009780 |
| 0.50 | 34.809442,-84.007531 |
| 0.75 | 34.812156,-84.005616 |
| 1.00 | 34.815338,-84.005454 |
| 1.25 | 34.818397,-84.004474 |
| 1.50 | 34.820665,-84.007164 |
| 1.75 | 34.822451,-84.004621 |
| 2.00 | 34.824035,-84.001113 |
| 2.25 | 34.825027,-83.998009 |
| 2.50 | 34.823505,-83.994648 |
| 2.75 | 34.824279,-83.992363 |
| 3.00 | 34.826043,-83.991206 |
| 3.25 | 34.828629,-83.991678 |

**East Fork Coosa Creek**
| mi | lat,lng |
|---|---|
| 0.00 | 34.789953,-83.991496 |
| 0.25 | 34.789709,-83.987366 |
| 0.50 | 34.790933,-83.984031 |
| 0.75 | 34.793325,-83.981217 |
| 1.00 | 34.796066,-83.978941 |
| 1.25 | 34.798258,-83.976460 |
| 1.50 | 34.799608,-83.973016 |
| 1.75 | 34.800987,-83.969537 |
| 2.00 | 34.802708,-83.966232 |
| 2.25 | 34.802893,-83.962416 |
| 2.50 | 34.804763,-83.960397 |
| 2.75 | 34.807910,-83.958731 |
| 3.00 | 34.807251,-83.955098 |
| 3.25 | 34.809985,-83.953541 |
| 3.50 | 34.812793,-83.954186 |
| 3.75 | 34.814933,-83.957236 |
| 4.00 | 34.817182,-83.959583 |
| 4.25 | 34.819555,-83.962352 |
| 4.50 | 34.819546,-83.966304 |
| 4.75 | 34.819491,-83.970427 |
| 5.00 | 34.820154,-83.974386 |
| 5.25 | 34.820992,-83.977777 |
| 5.50 | 34.822297,-83.980192 |
| 5.75 | 34.823856,-83.982791 |
| 6.00 | 34.824121,-83.986485 |
| 6.25 | 34.826733,-83.988659 |
| 6.50 | 34.828629,-83.991678 |

**Coosa Creek (mainstem)**
| mi | lat,lng |
|---|---|
| 0.00 | 34.828629,-83.991678 |
| 0.25 | 34.831080,-83.989564 |
| 0.50 | 34.832167,-83.987362 |
| 0.75 | 34.834945,-83.988854 |
| 1.00 | 34.837183,-83.989589 |


### West Fork Wolf Creek

Length 3.475 mi, start 34.762578,-83.948095 (elev 3271ft) -> end 34.793086,-83.911764 (elev 1959ft). Flows south-to-north/northeast, dropping 1312ft, joining Wolf Creek.

| mi | lat,lng |
|---|---|
| 0.00 | 34.762578,-83.948095 |
| 0.25 | 34.765906,-83.946729 |
| 0.50 | 34.769372,-83.945878 |
| 0.75 | 34.771903,-83.943085 |
| 1.00 | 34.774979,-83.941209 |
| 1.25 | 34.778448,-83.940536 |
| 1.50 | 34.781134,-83.938041 |
| 1.75 | 34.783344,-83.934623 |
| 2.00 | 34.785258,-83.931094 |
| 2.25 | 34.786007,-83.927356 |
| 2.50 | 34.786727,-83.923482 |
| 2.75 | 34.788978,-83.920699 |
| 3.00 | 34.791467,-83.917825 |
| 3.25 | 34.791071,-83.914160 |
| 3.50 | 34.793086,-83.911764 |


### Wolf Creek

Length 5.467 mi, start 34.751150,-83.944722 (elev 3524ft) -> end 34.801853,-83.907654 (elev 1896ft). Flows generally NE, dropping 1627ft across the bbox.

| mi | lat,lng |
|---|---|
| 0.00 | 34.751150,-83.944722 |
| 0.25 | 34.752072,-83.940847 |
| 0.50 | 34.751741,-83.936779 |
| 0.75 | 34.753800,-83.933609 |
| 1.00 | 34.755473,-83.930065 |
| 1.25 | 34.758394,-83.928610 |
| 1.50 | 34.761751,-83.927715 |
| 1.75 | 34.764046,-83.924614 |
| 2.00 | 34.766748,-83.921905 |
| 2.25 | 34.768942,-83.918436 |
| 2.50 | 34.771296,-83.916420 |
| 2.75 | 34.773408,-83.913591 |
| 3.00 | 34.774999,-83.910480 |
| 3.25 | 34.778066,-83.909108 |
| 3.50 | 34.781100,-83.910553 |
| 3.75 | 34.783350,-83.908343 |
| 4.00 | 34.785594,-83.907193 |
| 4.25 | 34.789025,-83.906826 |
| 4.50 | 34.791532,-83.908718 |
| 4.75 | 34.793521,-83.911758 |
| 5.00 | 34.796099,-83.911345 |
| 5.25 | 34.798400,-83.908576 |
| 5.50 | 34.801853,-83.907654 |


### Crumley Creek

**Not found.** No "Crumley Creek" way exists in the OSM pull for this bbox. A web
search found a distinct "Crumley Creek" (with Upper Crumley Creek Falls) in White
County GA near Sautee Nacoochee, roughly 25 miles east of this study area — not the
same creek and outside the bbox. No coordinate invented.

### Other named streams in bbox

| name | length (mi) | start | end |
|---|---|---|---|
| Logan Creek | 2.553 | 34.783462,-83.978124 | 34.757678,-83.996109 |
| Tigue Branch | 0.550 | 34.774231,-83.998151 | 34.768394,-83.992548 |
| West Seabolt Creek | 1.387 | 34.735634,-83.995776 | 34.748317,-83.981752 |
| Bryant Creek | 1.941 | 34.782237,-84.008813 | 34.769754,-84.032374 |
| Cooper Creek | 5.911 | 34.740667,-83.975731 | 34.758548,-84.030493 |
| Flat Creek | 1.509 | 34.739471,-84.004256 | 34.760567,-84.004271 |
| Burnett Creek | 4.130 | 34.780129,-83.998078 | 34.740667,-83.975731 |
| Board Camp Creek | 2.001 | 34.771763,-83.965417 | 34.765151,-83.993661 |
| Helton Creek | 2.784 | 34.734341,-84.028663 | 34.752355,-83.900401 |
| Turkey Creek | 2.236 | 34.734700,-84.008529 | 34.745579,-84.032875 |
| Jarrard Creek | 2.242 | 34.762913,-83.953458 | 34.748500,-83.980640 |
| Garrett Creek | 0.797 | 34.747238,-83.995119 | 34.757609,-83.997514 |
| Blood Mountain Creek | 2.535 | 34.737726,-83.941430 | 34.705058,-83.951035 |
| Burnett Branch | 1.391 | 34.756419,-83.944902 | 34.762913,-83.926258 |
| Calf Stump Branch | 1.557 | 34.782456,-83.958757 | 34.796681,-83.965781 |
| Slaughter Creek | 2.037 | 34.740778,-83.944089 | 34.737522,-83.973779 |
| East Seabolt Creek | 0.538 | 34.746633,-83.965638 | 34.740411,-83.970970 |
| Frady Branch | 0.561 | 34.781060,-83.916269 | 34.782527,-83.909448 |
| Shanty Branch | 0.993 | 34.738732,-83.924375 | 34.748911,-83.913712 |
| Lance Branch | 0.853 | 34.776085,-83.926695 | 34.772273,-83.914753 |
| Miller Cove Branch | 2.017 | 34.798442,-83.996327 | 34.823556,-83.995310 |
| Hicks Gap Branch | 1.566 | 34.822881,-84.033601 | 34.820866,-84.007256 |
| Mulky Gap Branch | 2.074 | 34.800894,-84.032086 | 34.820325,-84.012750 |
| Gillespie Branch | 1.305 | 34.805690,-83.986045 | 34.823596,-83.984115 |
| Stewart Creek | 1.082 | 34.834069,-84.014358 | 34.833796,-83.995813 |
| Jones Branch | 0.552 | 34.798389,-83.986344 | 34.797713,-83.977594 |
| Wildcat Branch | 1.486 | 34.785637,-83.952560 | 34.786085,-83.928263 |
| Fortenberry Creek | 3.297 | 34.788999,-83.950175 | 34.822313,-83.918831 |
| Nottely River | 2.590 | 34.818868,-83.903366 | 34.835123,-83.930764 |
| Roaring Fork | 1.367 | 34.786423,-83.973916 | 34.801680,-83.967784 |
| Wilson Branch | 1.031 | 34.807801,-83.924432 | 34.819689,-83.920681 |

### Trails

- **Coosa Backcountry Trail**: OSM splits this into 4 name variants that
  chain-merge (tolerance 20m at junctions) into a single continuous 12.935mi
  loop — see the merge detail below for exact figures.
- **Duncan Ridge Trail** (FS Trail 4, separate 1427-pt way, named "Duncan Ridge
  Trail" standalone) and **Bear Hair Gap Trail** (362 pts) both run through the
  same area and share junctions with the Coosa Backcountry Trail loop (see Task 6).
- **Appalachian Trail**: present in bbox as `highway=footway name="Appalachian
  Trail"`, 845 points, in the southeast part of the bbox near Blood Mountain/
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

- **Duncan Ridge Conn** [unclassified]: 4m from East Fork Coosa Creek at 34.799321,-83.975526
- **(unnamed)** [service]: 24m from East Fork Coosa Creek at 34.820936,-83.980324
- **Bowers Road** [unclassified FS 298]: 35m from East Fork Coosa Creek at 34.802697,-83.960336
- **Big Grassy Knob Road** [track]: 98m from East Fork Coosa Creek at 34.801371,-83.966777
- **(unnamed)** [service]: 99m from East Fork Coosa Creek at 34.819982,-83.979810
- **(unnamed)** [service]: 106m from East Fork Coosa Creek at 34.820563,-83.968366
- **(unnamed)** [service]: 109m from East Fork Coosa Creek at 34.819907,-83.979954
- **(unnamed)** [service]: 133m from East Fork Coosa Creek at 34.821107,-83.973171
- **(unnamed)** [service]: 136m from East Fork Coosa Creek at 34.821273,-83.973672
- **(unnamed)** [service]: 139m from Coosa Creek mainstem at 34.831957,-83.985487
- **(unnamed)** [service]: 146m from East Fork Coosa Creek at 34.821434,-83.975280
- **Coyote Ridge** [service]: 158m from East Fork Coosa Creek at 34.825253,-83.980409
- **(unnamed)** [service]: 160m from East Fork Coosa Creek at 34.820135,-83.981467
- **(unnamed)** [service]: 171m from East Fork Coosa Creek at 34.820498,-83.981888

All hits above are against the **East Fork Coosa Creek / mainstem** reaches
(roughly lat 34.80–34.83, near where the drainage flattens out toward the
confluence). **No road or trail comes within 200m of West Fork Coosa Creek**
anywhere along its 3.11mi
length in the bbox — it is the more remote of the two headwater forks.

### Where the Coosa Backcountry Trail crosses a stream

Detected by walking the merged 12.935mi chain and flagging points within 25m of
any stream way vertex (proxy for a mapped crossing):

| lat,lng | stream |
|---|---|
| 34.755998,-83.931865 | unnamed |
| 34.753140,-83.935274 | Wolf Creek |
| 34.751930,-83.936869 | Wolf Creek |
| 34.751230,-83.937568 | unnamed |
| 34.751923,-83.939464 | Wolf Creek |
| 34.749365,-83.940156 | unnamed |
| 34.782438,-83.958583 | Calf Stump Branch |
| 34.793712,-83.937566 | unnamed |
| 34.789791,-83.928342 | unnamed |
| 34.786254,-83.924842 | West Fork Wolf Creek |
| 34.778701,-83.932966 | unnamed |
| 34.763699,-83.934202 | Burnett Branch |
| 34.763147,-83.932247 | Burnett Branch |

None of these 13 crossings are on Coosa Creek itself (West
Fork, East Fork, or mainstem) — the trail loop stays on the Wolf Creek/Burnett
Branch side of the Duncan Ridge divide throughout; see Task 7 for how far it gets
from Coosa Creek.

---

## Task 3 — Ownership (USFS vs NON-FS), sampled every ~250m

### West Fork Coosa Creek

- **USDA FOREST SERVICE**: 34.803760,-84.011785 → 34.828629,-83.991678 (2.80 mi, 22 sample pts)
- No sample points fall inside any wilderness.geojson polygon (checked against all 7: Raven Cliffs, Mark Trail, Blood Mountain, Brasstown, Tray Mountain Wilderness + Vogel SP + Smithgall Woods SP).

### East Fork Coosa Creek

- **USDA FOREST SERVICE**: 34.789953,-83.991496 → 34.828629,-83.991678 (5.74 mi, 42 sample pts)
- No sample points fall inside any wilderness.geojson polygon (checked against all 7: Raven Cliffs, Mark Trail, Blood Mountain, Brasstown, Tray Mountain Wilderness + Vogel SP + Smithgall Woods SP).

### Coosa Creek (mainstem)

- **USDA FOREST SERVICE**: 34.828629,-83.991678 → 34.837183,-83.989589 (0.76 mi, 7 sample pts)
- No sample points fall inside any wilderness.geojson polygon (checked against all 7: Raven Cliffs, Mark Trail, Blood Mountain, Brasstown, Tray Mountain Wilderness + Vogel SP + Smithgall Woods SP).

### West Fork Wolf Creek

- **USDA FOREST SERVICE**: 34.762578,-83.948095 → 34.793086,-83.911764 (3.25 mi, 24 sample pts)
- No sample points fall inside any wilderness.geojson polygon (checked against all 7: Raven Cliffs, Mark Trail, Blood Mountain, Brasstown, Tray Mountain Wilderness + Vogel SP + Smithgall Woods SP).


**Summary: every sampled point along West Fork Coosa Creek, East Fork Coosa Creek,
Coosa Creek mainstem, and West Fork Wolf Creek returned USDA FOREST SERVICE
ownership** (Chattahoochee National Forest) — no NON-FS (private) reaches and no
wilderness/state-park overlap anywhere along these four reaches in the bbox.

---

## Task 4 — Elevation & gradient, FS reaches

Sampled at the same ~250m points as Task 3 (opentopodata aster30m). Since every
reach above is 100% FS, "FS reach" = the entire sampled length of each.

#### West Fork Coosa Creek — 22 samples @ ~250m

| # | lat,lng | elev (ft) | owner | wilderness/park |
|---|---|---|---|---|
| 0 | 34.803760,-84.011785 | 2175 | USDA FOREST SERVICE | — |
| 1 | 34.805442,-84.010174 | 2142 | USDA FOREST SERVICE | — |
| 2 | 34.807405,-84.009415 | 2057 | USDA FOREST SERVICE | — |
| 3 | 34.809053,-84.007888 | 2014 | USDA FOREST SERVICE | — |
| 4 | 34.810449,-84.006058 | 1988 | USDA FOREST SERVICE | — |
| 5 | 34.812484,-84.005635 | 2001 | USDA FOREST SERVICE | — |
| 6 | 34.814472,-84.006000 | 1969 | USDA FOREST SERVICE | — |
| 7 | 34.816461,-84.005417 | 1955 | USDA FOREST SERVICE | — |
| 8 | 34.818244,-84.004401 | 1952 | USDA FOREST SERVICE | — |
| 9 | 34.819877,-84.005773 | 1936 | USDA FOREST SERVICE | — |
| 10 | 34.821271,-84.007034 | 1942 | USDA FOREST SERVICE | — |
| 11 | 34.822001,-84.005178 | 1942 | USDA FOREST SERVICE | — |
| 12 | 34.822905,-84.002969 | 1952 | USDA FOREST SERVICE | — |
| 13 | 34.824048,-84.000914 | 1955 | USDA FOREST SERVICE | — |
| 14 | 34.825528,-83.999151 | 1926 | USDA FOREST SERVICE | — |
| 15 | 34.824228,-83.997412 | 1886 | USDA FOREST SERVICE | — |
| 16 | 34.823501,-83.995049 | 1906 | USDA FOREST SERVICE | — |
| 17 | 34.825073,-83.993987 | 1939 | USDA FOREST SERVICE | — |
| 18 | 34.824027,-83.991846 | 1890 | USDA FOREST SERVICE | — |
| 19 | 34.825250,-83.991406 | 1873 | USDA FOREST SERVICE | — |
| 20 | 34.826838,-83.991732 | 1857 | USDA FOREST SERVICE | — |
| 21 | 34.828629,-83.991678 | 1864 | USDA FOREST SERVICE | — |

#### East Fork Coosa Creek — 42 samples @ ~250m

| # | lat,lng | elev (ft) | owner | wilderness/park |
|---|---|---|---|---|
| 0 | 34.789953,-83.991496 | 3087 | USDA FOREST SERVICE | — |
| 1 | 34.789676,-83.988908 | 3005 | USDA FOREST SERVICE | — |
| 2 | 34.789653,-83.986286 | 2953 | USDA FOREST SERVICE | — |
| 3 | 34.790714,-83.984350 | 2858 | USDA FOREST SERVICE | — |
| 4 | 34.792409,-83.982751 | 2782 | USDA FOREST SERVICE | — |
| 5 | 34.793895,-83.981054 | 2726 | USDA FOREST SERVICE | — |
| 6 | 34.795579,-83.979524 | 2677 | USDA FOREST SERVICE | — |
| 7 | 34.797193,-83.977791 | 2621 | USDA FOREST SERVICE | — |
| 8 | 34.798445,-83.976258 | 2585 | USDA FOREST SERVICE | — |
| 9 | 34.799494,-83.974198 | 2552 | USDA FOREST SERVICE | — |
| 10 | 34.800206,-83.971817 | 2510 | USDA FOREST SERVICE | — |
| 11 | 34.800939,-83.969623 | 2493 | USDA FOREST SERVICE | — |
| 12 | 34.802069,-83.967587 | 2513 | USDA FOREST SERVICE | — |
| 13 | 34.802686,-83.965409 | 2513 | USDA FOREST SERVICE | — |
| 14 | 34.802829,-83.962915 | 2487 | USDA FOREST SERVICE | — |
| 15 | 34.803084,-83.960508 | 2480 | USDA FOREST SERVICE | — |
| 16 | 34.805249,-83.960201 | 2421 | USDA FOREST SERVICE | — |
| 17 | 34.807218,-83.959116 | 2323 | USDA FOREST SERVICE | — |
| 18 | 34.808050,-83.957134 | 2241 | USDA FOREST SERVICE | — |
| 19 | 34.807274,-83.954902 | 2224 | USDA FOREST SERVICE | — |
| 20 | 34.808907,-83.953662 | 2205 | USDA FOREST SERVICE | — |
| 21 | 34.810862,-83.952879 | 2126 | USDA FOREST SERVICE | — |
| 22 | 34.812623,-83.954176 | 2060 | USDA FOREST SERVICE | — |
| 23 | 34.813934,-83.956090 | 2054 | USDA FOREST SERVICE | — |
| 24 | 34.815218,-83.958039 | 2041 | USDA FOREST SERVICE | — |
| 25 | 34.816711,-83.959488 | 2057 | USDA FOREST SERVICE | — |
| 26 | 34.818547,-83.960667 | 2064 | USDA FOREST SERVICE | — |
| 27 | 34.819655,-83.962851 | 2021 | USDA FOREST SERVICE | — |
| 28 | 34.819900,-83.965372 | 2014 | USDA FOREST SERVICE | — |
| 29 | 34.819578,-83.967905 | 2021 | USDA FOREST SERVICE | — |
| 30 | 34.819460,-83.970524 | 1942 | USDA FOREST SERVICE | — |
| 31 | 34.819809,-83.973035 | 1926 | USDA FOREST SERVICE | — |
| 32 | 34.820034,-83.975510 | 1932 | USDA FOREST SERVICE | — |
| 33 | 34.820841,-83.977612 | 1942 | USDA FOREST SERVICE | — |
| 34 | 34.820933,-83.979949 | 1955 | USDA FOREST SERVICE | — |
| 35 | 34.822907,-83.980142 | 1939 | USDA FOREST SERVICE | — |
| 36 | 34.823879,-83.982116 | 1896 | USDA FOREST SERVICE | — |
| 37 | 34.823573,-83.984662 | 1900 | USDA FOREST SERVICE | — |
| 38 | 34.824233,-83.986877 | 1903 | USDA FOREST SERVICE | — |
| 39 | 34.826003,-83.987965 | 1857 | USDA FOREST SERVICE | — |
| 40 | 34.827741,-83.989617 | 1847 | USDA FOREST SERVICE | — |
| 41 | 34.828629,-83.991678 | 1864 | USDA FOREST SERVICE | — |

#### Coosa Creek (mainstem) — 7 samples @ ~250m

| # | lat,lng | elev (ft) | owner | wilderness/park |
|---|---|---|---|---|
| 0 | 34.828629,-83.991678 | 1864 | USDA FOREST SERVICE | — |
| 1 | 34.830210,-83.990244 | 1867 | USDA FOREST SERVICE | — |
| 2 | 34.831560,-83.988493 | 1870 | USDA FOREST SERVICE | — |
| 3 | 34.832167,-83.987362 | 1873 | USDA FOREST SERVICE | — |
| 4 | 34.834052,-83.988251 | 1847 | USDA FOREST SERVICE | — |
| 5 | 34.835253,-83.990055 | 1880 | USDA FOREST SERVICE | — |
| 6 | 34.837183,-83.989589 | 1834 | USDA FOREST SERVICE | — |

#### West Fork Wolf Creek — 24 samples @ ~250m

| # | lat,lng | elev (ft) | owner | wilderness/park |
|---|---|---|---|---|
| 0 | 34.762578,-83.948095 | 3271 | USDA FOREST SERVICE | — |
| 1 | 34.764600,-83.947340 | 3110 | USDA FOREST SERVICE | — |
| 2 | 34.766674,-83.946611 | 2930 | USDA FOREST SERVICE | — |
| 3 | 34.768776,-83.946106 | 2782 | USDA FOREST SERVICE | — |
| 4 | 34.770379,-83.944658 | 2638 | USDA FOREST SERVICE | — |
| 5 | 34.772024,-83.942967 | 2546 | USDA FOREST SERVICE | — |
| 6 | 34.774043,-83.942044 | 2480 | USDA FOREST SERVICE | — |
| 7 | 34.775910,-83.941109 | 2395 | USDA FOREST SERVICE | — |
| 8 | 34.778019,-83.940735 | 2382 | USDA FOREST SERVICE | — |
| 9 | 34.779604,-83.939219 | 2349 | USDA FOREST SERVICE | — |
| 10 | 34.781328,-83.937744 | 2264 | USDA FOREST SERVICE | — |
| 11 | 34.782632,-83.935632 | 2254 | USDA FOREST SERVICE | — |
| 12 | 34.783926,-83.933526 | 2182 | USDA FOREST SERVICE | — |
| 13 | 34.785060,-83.931381 | 2142 | USDA FOREST SERVICE | — |
| 14 | 34.785556,-83.929053 | 2090 | USDA FOREST SERVICE | — |
| 15 | 34.785926,-83.926834 | 2077 | USDA FOREST SERVICE | — |
| 16 | 34.786249,-83.924344 | 2070 | USDA FOREST SERVICE | — |
| 17 | 34.787448,-83.922457 | 2087 | USDA FOREST SERVICE | — |
| 18 | 34.788833,-83.920764 | 2106 | USDA FOREST SERVICE | — |
| 19 | 34.790445,-83.919210 | 2057 | USDA FOREST SERVICE | — |
| 20 | 34.791288,-83.917117 | 2005 | USDA FOREST SERVICE | — |
| 21 | 34.790601,-83.914852 | 2018 | USDA FOREST SERVICE | — |
| 22 | 34.791490,-83.912617 | 1982 | USDA FOREST SERVICE | — |
| 23 | 34.793086,-83.911764 | 1959 | USDA FOREST SERVICE | — |


### Gradient notes / steep→gentle breaks / confluences

- **West Fork Coosa Creek**: avg grade ~111 ft/mi (gentle throughout, 2175→1864ft
  over 2.80mi). Local grade oscillates ±~300 ft/mi (30m-DEM noise on a low-relief
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
| Wellborn Mountain | 34.8670324,-83.9551859 | — | Nominatim (nominatim.openstreetmap.org/search), OSM node 358718505, natural=peak, Union County GA — **outside bbox** |
| Owltown Gap | 34.8117559,-83.9493539 | 2228 ft | Wikipedia "List of mountain passes in Georgia (U.S. state)" (GNIS-derived coordinate/elevation) + hometownlocator.com GNIS Feature Detail Report (fid 329117), cross-confirmed — both give the identical coordinate. |
| Owl Town Gap | 34.8117559,-83.9493539 | 2228 ft | Same feature as "Owltown Gap" (alt spelling). |
| Calf Stomp Gap | 34.7862007,-83.9537995 | 3268 ft | hometownlocator.com GNIS Feature Detail Report (fid 327323) for lat/lng; Natural Atlas (naturalatlas.com/gaps/calf-stomp-1743566) gives elevation 3268 ft and the identical coordinate (34.7862007,-83.9537995) — cross-confirmed. |
| Locust Stake Gap | 34.7925898,-83.9399096 | — | hometownlocator.com GNIS Feature Detail Report (fid 328602) |
| Burnett Gap | 34.7681459,-83.9393548 | — | hometownlocator.com GNIS Feature Detail Report (fid 327293) |
| Coosa Bald | 34.7789785,-83.9635224 | — | Nominatim (nominatim.openstreetmap.org/search), OSM node 358711770, natural=peak, Union County GA |
| Wolfpen Gap | 34.7640000,-83.9521000 | 3260 ft | Wikipedia "List of mountain passes in Georgia (U.S. state)" (coordinate given as 34°45'50"N 83°57'08"W / 34.764,-83.9521); described there as "SR 180 / FR 39 west of Vogel State Park". |
| Wildcat Gap | **not found** | — | NOT FOUND. Checked: Nominatim (multiple query variants), OSM tagged nodes in all 6 fetched bbox tiles, and the full Union County GA gap gazetteer (108 GNIS-derived gap records on hometownlocator.com, checked in full) — no feature named "Wildcat Gap" appears. The nearby named features are "Wildcat Knob" (OSM node 358718561, natural=peak, gnis:feature_id=333424, 34.7687010,-83.9571335, ele 1197m/3927ft per OSM) and "Wildcat Branch" (creek). Reported as not found per task instructions; Wildcat Knob's coordinate is used only as an explicitly-labeled proxy in task 6 distance table. |

Crumley Creek: **not found** (see Task 2). No 'Crumley Creek' way exists in the OSM pull for this bbox (0 features). A general web search found a 'Crumley Creek' (with Upper Crumley Creek Falls) in White County GA, Sautee Nacoochee area, roughly 25 miles east of this study area — a different creek, outside the bbox. No Crumley Creek was found in or near Union County / the Coosa Bald study area. Reported as not found; no coordinate invented.

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
| Vogel trailhead | Burnett Gap | 1.02 | 1.02 | 2385 | 2828 | +443 | -0 |
| Burnett Gap | West Fork Wolf Creek / FS 107 crossing | 2.35 | 3.37 | 2871 | 2083 | +190 | -935 |
| West Fork Wolf Creek / FS 107 crossing | Locust Stake Gap | 1.35 | 4.71 | 2080 | 2598 | +581 | -66 |
| Locust Stake Gap | Calf Stomp Gap (FS 108) | 1.19 | 5.91 | 2608 | 3317 | +738 | -20 |
| Calf Stomp Gap (FS 108) | Coosa Bald | 1.13 | 7.04 | 3353 | 4170 | +853 | -0 |
| Coosa Bald | Wildcat Knob (proxy for "Wildcat Gap" — no distinct gap found) | 0.65 | 7.69 | 4173 | 3885 | +72 | -358 |
| Wildcat Knob (proxy for "Wildcat Gap" — no distinct gap found) | Wolfpen Gap (GA 180) — GNIS/Wikipedia point | 1.06 | 8.74 | 3852 | 3363 | +0 | -522 |
| Wolfpen Gap (GA 180) — GNIS/Wikipedia point | chain start (near Vogel, gap to trailhead ~0.35mi unmapped) | 4.18 | 12.93 | 3376 | 2559 | +1010 | -1814 |


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
Checked: every trail/road feature in `_coosa_osm.geojson` for one whose geometry
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
