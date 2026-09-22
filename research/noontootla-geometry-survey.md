# Noontootla Creek / Three Forks / Springer Mountain — GIS geometry survey

Compiled 2026-09-21. Mechanical GIS data gathering only — no route design, no opinions.
All coordinates are lat,lng (WGS84 / EPSG:4326) unless noted. "Not found" means a
targeted search was made and returned nothing; no coordinate below was invented.

Scripts: `research/_noon_ownership.mjs`, `research/_noon_stitch_creek.mjs`,
`research/_noon_sample_creek.mjs`, `research/_noon_stitch2.mjs`,
`research/_noon_parse_tiles.mjs`. Raw cached API responses:
`research/_cache_gis/` (OSM way/tile XML, land-lot GeoJSON, ownership JSON,
elevation JSON). Merged output geometry: `research/_noontootla_osm.geojson`.

---

## 1. Land lots

**Source (all 4 lots):** GA Geospatial Info Office "Georgia_Landlots_and_Militia_Districts"
ArcGIS Feature Service, layer 1 (`Landlots`):
`https://services7.arcgis.com/Za9Nk6CPIPbvR1t7/arcgis/rest/services/Georgia_Landlots_and_Militia_Districts/FeatureServer/1/query`
— queried with `where=Current_County='Fannin' AND Land_Lot='<n>' AND Land_District='<d>'`,
`outSR=4326`, `f=geojson`. This is the statewide GA land-lot polygon layer (not
Fannin County's own qPublic/GIS site — qpublic.schneidercorp.com returned HTTP 403
to a scripted request with a browser User-Agent, and no separate Fannin County
GIS site could be found by direct URL guess; not pursued further since the
statewide layer answered directly with exact-match polygons for all four lots).
Mindat.org (`mindat.org/loc-66731.html`, Rantze Hill mine) was not queried since
the land-lot layer already gave authoritative polygons; can be added if a named
mine-entrance coordinate is separately wanted.

All 4 lots matched exactly (1 feature each, `Land_Section=1`, `Original_County=
"Gilmer, Union"`, `Lottery_Drawing=1832`, `Lottery_Acreage=160`, `Lottery_Cost=18`).

| Lot | District | Centroid (avg of ring vertices) | Calculated acreage | Vertices |
|---|---|---|---|---|
| 285 | 7 | 34.745082, -84.222555 | 133.9 | 5 (4 corners + close) |
| 294 | 7 | 34.740042, -84.204836 | 154.4 | 5 |
| 321 | 7 | 34.731841, -84.221832 | 149.6 | 6 |
| 106 | 6 | 34.712238, -84.206610 | 146.5 | 8 |

Corner (bounding-box) coordinates, NW/NE/SW/SE:

| Lot | NW | NE | SW | SE |
|---|---|---|---|---|
| 285 | 34.748688, -84.226205 | 34.748688, -84.216880 | 34.742612, -84.226205 | 34.742612, -84.216880 |
| 294 | 34.742855, -84.208591 | 34.742855, -84.199315 | 34.735889, -84.208591 | 34.735889, -84.199315 |
| 321 | 34.736114, -84.226446 | 34.736114, -84.216942 | 34.729634, -84.226446 | 34.729634, -84.216942 |
| 106 | 34.715629, -84.210458 | 34.715629, -84.201896 | 34.708533, -84.210458 | 34.708533, -84.201896 |

Full ring vertices (raw, [lat,lng]) are in `_cache_gis/lot285.geojson`,
`lot294.geojson`, `lot321.geojson`, `lot106b.geojson` (raw Esri JSON responses
also saved). Note these are simple 5–8-vertex generalized polygons from a
statewide dataset described by its own metadata as "accurate for reference
purposes... does not constitute a legal survey" — treat as approximate lot
boundaries, not a deed-accurate survey.

### 1a. Ownership (USFS EDW_BasicOwnership_01, centroid + 4 corners)

Query: `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query?geometry=<lng>,<lat>&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNERCLASSIFICATION&returnGeometry=false&f=json`

| Lot | Centroid | NW | NE | SW | SE |
|---|---|---|---|---|---|
| 285 (d7) | **USDA FOREST SERVICE** | NON-FS | NON-FS | NON-FS | **USDA FOREST SERVICE** |
| 294 (d7) | **USDA FOREST SERVICE** | **USDA FOREST SERVICE** | **USDA FOREST SERVICE** | **USDA FOREST SERVICE** | **USDA FOREST SERVICE** |
| 321 (d7) | NON-FS | NON-FS | **USDA FOREST SERVICE** | NON-FS | NON-FS |
| 106 (d6) | **USDA FOREST SERVICE** | NON-FS | **USDA FOREST SERVICE** | **USDA FOREST SERVICE** | **USDA FOREST SERVICE** |

Lot 294 is entirely (5/5 sample points) USFS. Lots 285, 321, 106 are mixed
FS/non-FS — a checkerboard/partial-boundary pattern, consistent with historic
land-lot-based private inholdings inside the Chattahoochee National Forest.
Raw responses cached in `_cache_gis/own_<lat>_<lng>.json`.

### 1b. Streams, distances (per lot centroid)

| Lot | Named stream in OSM within lot bbox | Dist. to Noontootla Creek | Dist. to FS 58 (traced extent only) | Dist. to Three Forks |
|---|---|---|---|---|
| 285 (d7) | **Noontootla Creek itself** (7 creek vertices fall inside the lot bbox) | 44 m | ~4.09 km (FS58 trace ends ~2.9 km south of this lot; see note) | 6.04 mi |
| 294 (d7) | none found in OSM within lot bbox | 1,605 m | ~3.80 km (same caveat) | 5.42 mi |
| 321 (d7) | **Noontootla Creek itself** (11 creek vertices fall inside the lot bbox) | 467 m | ~2.62 km (same caveat) | 5.18 mi |
| 106 (d6) | none found in OSM within lot bbox | 1,630 m | ~1.33 km (same caveat) | 3.60 mi |

Distances computed as nearest-vertex haversine distance from lot centroid to
the stitched Noontootla Creek polyline / stitched FS 58 polyline / Three Forks
point (34.663407, -84.18463). **Caveat on FS 58 distances:** the FS 58 geometry
I could trace continuously from Three Forks running north (see §4d) ends at
34.7083551, -84.2203413, about 0.7–3 mi short of lots 285/294 (which sit
further north/east, 34.74 lat). Distances above are to that nearest traced
point, i.e. an **upper bound**, not the true distance to wherever FS 58 (or a
connecting spur) actually runs near those lots — not verified further; flagged
rather than estimated.

Lots 294 and 106 showing "no named stream in OSM within bbox" most likely
reflects incomplete OSM headwater-stream mapping in those specific lots (small
drainages are the least-completely-mapped OSM feature class), not necessarily
an absence of any stream on the ground — not verified by any non-OSM source.

---

## 2. Noontootla Creek — full geometry, ownership, elevation, gradient

### Geometry source

Nominatim (`nominatim.openstreetmap.org/search?q=Noontootla Creek, Georgia`,
`dedupe=0`) was used to enumerate the individual OSM ways carrying the name
"Noontootla Creek" (18 ways found, lat 34.67–34.76). Each was fetched in full
via `https://api.openstreetmap.org/api/0.6/way/<id>/full` (no bbox-size limit,
unlike `/map`) to guarantee complete node resolution, then stitched into one
ordered LineString by matching shared OSM node IDs at way endpoints
(`_noon_stitch_creek.mjs`).

**Important OSM-tagging note:** immediately downstream of Three Forks
(34.663407, -84.18463 — confirmed as the literal confluence point: this is
where ways named "Long Creek" and two "Chester Creek" segments meet, 30 m from
the task's given Three Forks coordinate), OSM tags the stream **"Chester
Creek"** for about 1.3 mi before the name changes to "Noontootla Creek" at
34.672587, -84.196837. In common usage (per the task's own framing and Bulletin
19) "Noontootla Creek" starts at Three Forks; I stitched the OSM-tagged Chester
Creek reach in as the top of the mainstem so the geometry is continuous from
Three Forks, but the name discrepancy is real and worth knowing if cross-
checking against another source. A short unnamed way (43863505) joins the
mainstem at the Chester→Noontootla name-change node from the southwest — likely
a minor tributary, not separately identified.

**Total length, Three Forks → Toccoa River mouth: 11.46 mi** (581-vertex full
OSM resolution).

**Mouth location:** the northernmost "Noontootla Creek"-named way (43863001,
only 2 nodes) ends at node 556935913 = **34.762146, -84.228361**, which is
shared with Toccoa River way 43865647 — i.e. this is the confluence node
itself, confirmed by shared-node-ID matching, not estimated.

### 2a. Sampling (every ~250 m, 75 samples)

Method: resample the 581-vertex mainstem at even ~250 m spacing
(`_noon_sample_creek.mjs`), then query ownership (USFS endpoint, per-point) and
elevation (`api.opentopodata.org/v1/aster30m`, ASTER 30 m DEM, batched) at each
sample. Full table: `_cache_gis/noontootla_samples_full.json` (75 rows: index,
lat, lng, cumulative distance m, elevation m, owner).

- Elevation at Three Forks (idx 0): 793 m (2,602 ft)
- Elevation at Toccoa River mouth (idx 74): 561 m (1,841 ft)
- Total drop: 232 m (761 ft) over 11.46 mi → **average gradient ≈ 66 ft/mi**

### 2b. Contiguous FS-ownership reaches

Four contiguous reaches where every 250 m sample returned `USDA FOREST SERVICE`:

| # | Start (lat,lng) | End (lat,lng) | Length (mi) | Elev start→end (m) | Gradient (ft/mi) |
|---|---|---|---|---|---|
| 1 | 34.663407, -84.184630 (Three Forks) | 34.695566, -84.214922 | 4.49 | 793 → 651 | 104 |
| 2 | 34.698741, -84.217357 | 34.700688, -84.218335 | 0.15 | 643 → 638 | 106 |
| 3 | 34.743267, -84.223693 | 34.746626, -84.224675 | 0.31 | 592 → 578 | 148 |
| 4 | 34.750202, -84.229442 | 34.755364, -84.228785 | 0.46 | 573 → 566 | 49 |

Between reaches 1–2 (idx 30, 34.696581,-84.217150) and 2–3 (idx 33–61) and 3–4
(idx 65–66) ownership is NON-FS at the 250 m sample resolution — i.e. these are
short private/non-FS gaps, not solid blocks; a finer sampling interval could
reveal narrower FS slivers within them that this 250 m grid missed. Everything
downstream of reach 4 (idx 71 onward, past 34.756,-84.226) is NON-FS to the
mouth in this sample set, with one isolated NON-FS point (idx 65-66) noted
between reaches 3 and 4.

### 2c. Major tributary confluences

Confirmed at Three Forks itself (34.663407, -84.18463): **Long Creek**, **Chester
Creek**, **Stover Creek** (named OSM ways converge here — see §4a). Searching
all named/unnamed `waterway=*` ways in the fetched OSM tiles for endpoints
within 150 m of the Noontootla Creek mainstem found only two further
tributaries, both **unnamed** in OSM:

- Unnamed stream (way 43862688) joins near 34.68563, -84.19587 (141 m from mainstem)
- Unnamed stream (way 43865693) joins near 34.71212, -84.22986 (26 m from mainstem)

No other named tributary (e.g. any stream matching a name pattern) was found
joining the mainstem in the fetched OSM data. This likely reflects incomplete
OSM small-stream tagging in this stretch rather than an actual absence of
tributaries — flagged, not assumed.

### 2d. Long Creek, Chester Creek, Stover Creek, Long Creek Falls

All located via OSM way names in the bbox fetch around Three Forks
(`_cache_gis/ways/bbox_threeforks_actual.xml`, bbox -84.195,34.655,-84.175,34.670)
plus Nominatim:

- **Long Creek**: OSM ways 43861711, 43861914, 43862071, 43863720 (waterway=stream), converging into Three Forks from the east/southeast (through roughly 34.6636–34.670, -84.167 to -84.184).
- **Chester Creek**: OSM ways 43861997, 43862018, 43862966, 43863383, 43865296 — the reach south of Three Forks (down to ~34.647,-84.176) plus the reach north of Three Forks that (per §2 above) carries the "Chester Creek" name up to the Noontootla-name-change point.
- **Stover Creek**: OSM way(s) tagged "Stover Creek" (gnis:feature_id 329866), running roughly 34.647–34.663, joining near Three Forks from the southwest; the AT runs beside it approaching Stover Creek Shelter (see §4a).
- **Long Creek Falls**: node 419230475, waterway=waterfall, **34.650280, -84.197241** (Nominatim confirms, `osm_id=419230475`). This sits right on/near the AT/BMT shared corridor about 2.7 mi north of Springer summit and roughly 0.9 mi south of Three Forks along the trail (see §4a) — i.e. it is passed on the AT approach to Three Forks, not on a BMT reach north of Three Forks (the task's phrasing "Long Creek Falls junction" for the BMT north-of-Three-Forks description does not match what OSM shows; flagged as a possible mismatch between the task's assumed geography and what's mapped — see §4c gap note).
- (Also found nearby but distinct: "Noontootla Falls" node 556852318 at 34.650988, -84.176445, on Long Creek's corridor, not Noontootla Creek itself despite the name.)

### 2e. FS 58 (Noontoola Road) proximity to the creek

Comparing the 75 creek samples against the stitched FS 58 polyline (§4d):
FS 58 runs within 100 m of Noontootla Creek continuously from Three Forks
(mi 0) to about **mi 5.11** (34.70224, -84.22010), with one brief gap where the
road pulls away to 100–140 m near mi 1.6–2.0 (34.674–34.679 lat). Beyond mi
5.11 my traced FS 58 geometry ends (see §4d caveat), so proximity beyond that
point is **not determined**.

---

## 3. Trail geometry, mileage, and elevation gain/loss

Method: named-way endpoint-matching stitch (`_noon_stitch2.mjs`) over ways
fetched via `/api/0.6/way/<id>/full` (avoids the `/map` bbox node-truncation
problem — several ways here have 60–300+ nodes spanning multiple 0.05°
tiles, and the tile-based `/map` fetch alone left most of those nodes
unresolved). Mileage = full-resolution OSM polyline length (haversine, not
resampled — resampling at 100 m measurably shortens a winding trail by cutting
switchback corners, confirmed directly: 100 m-resampled Springer→Three Forks
came out 3.89 mi vs. 4.23 mi at full OSM resolution). Elevation gain/loss =
`api.opentopodata.org/v1/aster30m` sampled at ~100 m spacing along each
segment, per the task's spec.

### 3a. AT: Springer Mountain → Three Forks

The task's given "FS 42 parking lot" coordinate (34.6376,-84.1953) sits at an
OSM guidepost ("Springer Mtn 0.9") — i.e. it is the trailhead/parking point on
the **Approach Trail**, 0.9 mi short of the true AT southern terminus at the
Springer Mountain summit (34.6266473, -84.1935269, OSM node 358771759, `natural=
peak`). The Approach Trail itself heads away from the study area toward
Amicalola Falls / the "Hike Inn," so it was not separately traced; mileage
below starts at the **summit** (AT terminus), not the parking lot — add ~0.9 mi
one-way if you need parking-lot mileage.

- **Length (Springer summit → Three Forks), full OSM resolution: 4.23 mi**
- **Elevation gain/loss (100 m samples): +197 ft gain, −1,381 ft loss** (net descent; Springer summit 1,153 m / 3,783 ft → Three Forks 792 m / 2,598 ft)
- **Stover Creek Shelter**: 2.68 mi from Springer summit (way `448058240`,
  centroid ≈34.650287, -84.197189, confirmed via Nominatim). The trail runs
  immediately beside it — Long Creek Falls (34.650280,-84.197241) is 56 m away
  at the same trail mile-mark, and OSM's "Stover Creek" waterway ways run
  through this same stretch (§2d), consistent with "trail runs beside Stover
  Creek" near the shelter.
- Three Forks reached at mile 4.23 (26 m snap distance from the stitched
  trail's nearest vertex to the given Three Forks coordinate).

### 3b. AT: Three Forks → Hawk Mountain Shelter → Hightower Gap

- **Hawk Mountain Shelter** (way/node 14027340663, amenity=shelter): 3.66 mi past Three Forks (7.89 mi cumulative from Springer summit).
- **Hightower Gap** (node 3412073357/3687284902, natural=gap, ≈34.6635, -84.1298): 4.12 mi past Three Forks (8.36 mi cumulative from Springer summit); 154 m/0.47 mi past Hawk Mountain Shelter.
- **Elevation gain/loss, Three Forks → Hightower Gap (100 m samples): +1,001 ft gain, −728 ft loss** (net climb; Three Forks 792 m → Hightower Gap area 875 m).

### 3c. Benton MacKaye Trail: Three Forks → Toccoa River swinging bridge → GA 60

**This could not be fully traced — reporting exactly what was and wasn't found:**

- No OSM way named "Benton MacKaye Trail" (or "…& Duncan Ridge Trail", or
  `ref=FS Trail 2`/`FS Trail 4`) connects to Three Forks (34.663407,-84.18463)
  within several hundred meters. A wide Nominatim search
  (`viewbox=-84.26,34.68,-84.20,34.77&bounded=1`) for "Benton MacKaye Trail"
  inside the Noontootla valley itself returned **zero results** — i.e. the
  valley-bottom BMT route implied by the task's phrasing ("Three Forks north
  to the... swinging bridge") does not appear to exist as tagged trail geometry
  in OSM. What IS tagged nearby: a short "Appalachian and Benton MacKaye Trail"
  combined-tag way immediately at Three Forks that actually heads **east**
  (shared tread with the AT toward Hawk Mountain, already counted in §3b), and
  a "Bryson-Benton Connector" way (979700641, 48 nodes) plus a "Benton MacKaye
  & Duncan Ridge Trail" way (979700642, 303 nodes) that together run from
  34.6973,-84.1855 to 34.7124,-84.1922 — the **nearest traceable BMT geometry
  to Three Forks is 34.6973,-84.1855, an airline gap of ≈3.4 km (≈2.1 mi) from
  Three Forks with no connecting OSM trail way found** in either direction.
- From that nearest point (34.7124,-84.1922), a connected chain of "Benton
  MacKaye & Duncan Ridge Trail" ways (IDs 40997030, 40997032, then crossing the
  **Toccoa River Swinging Bridge** way 501296762, then 501433710, 501296763,
  40997033, 192552493, then "Benton MacKaye Trail" 31275793) runs continuously
  to **34.806269, -84.140827**.
  - **Toccoa River Swinging Bridge**: way 501296762, description "Swinging
    bridge over the Toccoa River," 2 endpoint nodes at **34.736891,-84.167419**
    and **34.736751,-84.166853**.
  - **FS 816 trailhead near the bridge**: way 9211307, name "Tooni Gap Road",
    `ref=FS 816`, highway=service, surface=gravel, nearest node **34.739469,
    -84.170533** (≈400 m from the bridge).
  - **Bryson Gap Road** (FS 766A, way 439964513, highway=track): runs
    34.697622,-84.167902 to 34.718148,-84.167404 — in the general area implied
    by "Bryson Gap," but no OSM node/way is explicitly labeled "Bryson Gap"
    itself; treat the road's location as an approximate proxy, not a confirmed
    gap coordinate.
  - **"No Name Gap": not found.** No OSM node, way, or Nominatim result
    matches this name anywhere in the fetched data.
  - **GA 60**: the traced chain's northern end (34.806269,-84.140827) does
    **not** match the location of the "Morganton Highway" (`ref=GA 60`) way I
    found (≈34.769,-84.173, a different way entirely, ~5.5 km from the trace
    endpoint). Whether/where the BMT actually reaches GA 60 was **not
    confirmed** — the trace simply stops at the last connected "Benton MacKaye
    Trail"-tagged way found; the remaining OSM ways for the trail's continuation
    to GA 60 were not located.
  - Length of the traced chain (34.7124,-84.1922 → 34.806269,-84.140827,
    including the bridge crossing): full OSM-resolution ≈ see
    `_cache_gis/bmt_north_stitch2.json` (1,437-vertex polyline; not further
    mileage-annotated against named waypoints above, since the waypoint set
    itself is incomplete for this segment — would need re-verification against
    a current BMTA map before using for anything beyond "approximate shape").
- **Elevation gain/loss was not computed for this segment**, since the
  geometry itself is not confirmed connected to Three Forks — computing a
  gain/loss number over an unverified/gapped route would misrepresent it as
  more solid than it is.

**Bottom line on 3c:** treat the BMT Three-Forks-to-bridge mileage/elevation
as **not found** from OSM, not a computed value. This may reflect an actual
trail relocation since the OSM data was last edited, a real OSM tagging gap, or
(less likely, since Nominatim search was global, not tile-limited) a
genuinely different physical routing than assumed. Recommend field-checking
against a current Benton MacKaye Trail Association map before relying on this
for route planning.

### 3d. FS 58 (Noontoola Road): Three Forks → down-valley → near Doublehead Gap Rd

OSM tags: `name=Noontoola Road`, `alt_name=Three Forks Road`, `ref=FS 58`,
`highway=track`, `tracktype=grade2`, surface mixed **gravel/dirt/unpaved**
across the 7 constituent ways (`_cache_gis/ways2/way_9214189.xml` etc. — no
single uniform surface tag covers the whole road; see §4/way list above for
per-way surface).

Two directions run through Three Forks; the down-valley (north, following the
creek) direction is the one matching "Doublehead Gap Rd" per the coordinates
found:

- **FS 58 south/east branch** (Three Forks toward Nimblewill Gap/Cooper Gap
  corridor, away from the creek valley): 2.69 mi, ends 34.635899,-84.159261.
  This is **not** the Doublehead Gap Rd direction — included for completeness
  since "Three Forks Road" is FS 58's alt_name in both directions.
- **FS 58 down-valley (north) branch, Three Forks → near Doublehead Gap Rd:
  5.13 mi** (full OSM resolution), traced continuously (with some gaps up to
  ~2.9 km bridged by straight-line assumption between OSM way endpoints — see
  script notes; risk of a wrong branch is low since these are the only 7
  FS-58/Noontoola-Road-tagged ways found and the road has no OSM-mapped
  alternate branch in this candidate set) to **34.708355,-84.220341**.
  - **Doublehead Gap Road** (way 9217415, "Doublehead Gap Road") has an
    endpoint at 34.708195,-84.221733, **128 m** from where the FS 58 trace
    ends — i.e. this is very likely the actual FS58/Doublehead Gap Rd
    junction, just short of full node-level confirmation (no shared OSM node
    found within the fetched data, so the last ~128 m gap is not itself
    traced).
  - Doublehead Gap Road's own logged extent elsewhere in OSM spans roughly
    34.698–34.760 lat / -84.247 to -84.181 lng (from other constituent ways;
    a bridge=yes segment near 34.76 lat exists per the earlier "bridge" tag
    scan, unconnected to this particular endpoint in the fetched data).

---

## 4. Merged GeoJSON output

`research/_noontootla_osm.geojson` — 23 features:
- 1 LineString: Noontootla Creek mainstem (Three Forks → Toccoa River mouth)
- 2 LineStrings: AT (Springer summit→Three Forks; Three Forks→Hightower Gap)
- 1 LineString: BMT/Duncan Ridge partial chain (gap-flagged in properties.note)
- 2 LineStrings: FS 58 (south/east branch; down-valley/north branch)
- 4 Polygons: land lots 285, 294, 321, 106 (raw ArcGIS ring geometry)
- 13 Points: named waypoints (Springer summit, Springer trailhead, Long Creek
  Falls, Stover Creek Shelter, Three Forks, Hawk Mountain Shelter, Hightower
  Gap, swinging bridge both ends, FS 816/Tooni Gap Rd, Noontootla Creek mouth,
  Bryson Gap Road both ends)

Every feature carries a `coord_source` property citing the fetch method.
LineStrings are ordered in the travel direction stated in their `name`.

---

## 5. URLs used (complete list)

- `https://services7.arcgis.com/Za9Nk6CPIPbvR1t7/arcgis/rest/services/Georgia_Landlots_and_Militia_Districts/FeatureServer/1/query` (land lots)
- `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query` (ownership, 20 lot-corner queries + 75 creek-sample queries)
- `https://api.opentopodata.org/v1/aster30m` (elevation, creek 75-pt + AT 2×~70-pt batches)
- `https://api.openstreetmap.org/api/0.6/map?bbox=...` (12× 0.05° tiles covering lat 34.60–34.80, lng -84.26 to -84.11; plus earlier smaller bboxes around Three Forks)
- `https://api.openstreetmap.org/api/0.6/way/<id>/full` (~85 individual way fetches — creek, AT, BMT/Duncan Ridge, FS 58, GA 60, Doublehead Gap Rd, Bryson Gap Rd)
- `https://nominatim.openstreetmap.org/search` (way/POI discovery: Noontootla Creek segments, Stover Creek Shelter, Hightower Gap, Bryson MacKaye Trail valley search)
- `https://qpublic.schneidercorp.com/...` (Fannin County qPublic — **HTTP 403**, not usable from script; not pursued further)
- `https://www.arcgis.com/sharing/rest/search` (used to locate the statewide GA land-lots service by keyword search)

## 6. Failures / not found (complete list)

- Fannin County's own qPublic/GIS ArcGIS layer: 403 Forbidden, not accessed.
- Mindat.org "Rantze Hill mine" locality page: not attempted (statewide land-lot layer answered the actual need directly).
- No named stream found in OSM crossing lots 294 or 106 (bbox check).
- Only 2 unnamed (no named) tributary confluences found along the Noontootla mainstem beyond Three Forks itself.
- BMT/Duncan Ridge Trail geometry: not connected to Three Forks in OSM (≈3.4 km/2.1 mi gap); mileage and elevation gain/loss for that segment **not computed**.
- "No Name Gap": not found anywhere in OSM or Nominatim.
- "Bryson Gap" itself (as a named point, distinct from "Bryson Gap Road"): not found; road location used as an approximate proxy only.
- BMT's connection to GA 60: not confirmed; traced chain's endpoint does not match the located GA 60 road segment.
- FS 58 north of ≈34.708 lat (near the lot 285/294/321/106 area, lat 34.71–34.75): not traced; lot-to-FS58 distances above are lower-confidence upper bounds for that reason.
