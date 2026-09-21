# Tools — GA Gold Trip

## map/build-map.mjs
Node script (no npm deps to run; ESM, uses only built-in `fetch`/`fs`/`path`). Reads every
`map/data/*.json` and `*.geojson` file, auto-detecting shape (point array with `lat`/`lng`,
overnight-route array with `trailhead`, or a GeoJSON `FeatureCollection`), and builds one
self-contained `map/trip-map.html` (Leaflet + esri-leaflet from CDN, all trip data inlined so it
opens straight from `file://` with no server) plus `map/trip.gpx` (all waypoints/routes for
offline use in Gaia GPS / CalTopo / OnX). For any point missing `photos`, it queries the
Wikimedia Commons geosearch API at build time and caches results in `map/data/photo-cache.json`
so re-runs don't re-fetch. Points/overnight entries with unresolved (`null`) coordinates are
skipped with a console warning rather than crashing the page — safe to re-run as other research
agents fill in `map/data/*.json` with more spots.

**Run:** `node map/build-map.mjs`

**Status:** active, working as of 2026-09-21 (second pass). Verified with a headless
Chromium/Playwright pass (no console errors, 66 marker icons, 18 SVG line/polygon overlays,
layer toggle confirms `trails`, `wilderness (NO PANNING)`, `USFS land ownership` and `Itinerary`
overlays all present) — see `map/screenshot.png`. Overpass API (all public mirrors: overpass-api.de,
kumi.systems, openstreetmap.ru, maps.mail.ru) was still unreachable/timing out on retry this pass,
so `map/data/wilderness.geojson` remains built from Nominatim's `polygon_geojson=1` boundary lookup
(Raven Cliffs, Mark Trail, Blood Mountain, Brasstown, Tray Mountain Wilderness + Vogel/Smithgall
state park polygons). **`map/data/trails.geojson` was added this pass** using real OSM way geometry
pulled from `api.openstreetmap.org/api/0.6/map` (small-bbox fetches, not Overpass) for: Dockery Lake
Trail, the AT/Benton MacKaye Trail + Noontootla Creek near Three Forks, Rock Creek Road + Rock Creek
near the Fannin Co. dispersed area, and the Coosa Backcountry Trail loop from Vogel. The one-off
extraction script is `research/_build_trails.mjs` (depends on cached `research/_osm_*.xml` dumps
that were deleted after use — re-fetch the same bboxes to rerun it).

`build-map.mjs` now also: (1) loads `map/data/itinerary.json` (schema `itinerary-v1`) as a
toggleable "Itinerary" layer — numbered day markers + a dashed connecting line per day, resolving
each stop's `ref` against an existing point/overnight id; (2) runs a build-time point-in-polygon
legality guard (ray-casting, handles Polygon/MultiPolygon) for every point and every overnight
trailhead/camp/pan_reach against `wilderness.geojson`, logging every hit to the build console and
tagging matched entries with `_insideWilderness` so their popup shows a red "INSIDE
WILDERNESS/STATE PARK — NO PANNING" banner. **Finding from this guard:** the Dockery Lake Trail
~3.0-mi campsite, and its pan reaches at ~2.0 mi and ~2.55-2.65 mi, fall INSIDE Blood Mountain
Wilderness per the OSM-derived boundary (the ~0.5-mi crossing does not) — this contradicts
`research/overnight-route-v2.md`'s guess that the campsite sits below the boundary; treat Dockery
Lake as backup-only for camping/panning until confirmed against a survey-grade boundary. Three
Forks/Noontootla and Rock Creek overnight pan reaches are both outside all mapped polygons.

## tools/build_gear_picker.py
Re-runnable Python (openpyxl; `pip install openpyxl`) builder for `Gear_Picker.xlsx`, the
Captain's personal interactive gear-selection workbook. Reads all three
`research/gear-tiers-*.json` files, adds a hardcoded "30F sleep system" tier group (Marmot
Trestles 30 / EE Revelation 30 / Katabatic Flex 30 — web-verified 2026-09-21, marked
RECOMMENDED default given the warm/wet Oct 2026 outlook vs. the existing 20F group, kept as an
"alt" row not deleted), flags tier-price oddities (e.g. Value costing more than Premium) into a
Notes column instead of silently re-tiering, and writes 8 sheets: Start Here, Picker (CHOICE
dropdown per row, live INDEX/MATCH formulas into Options — no XLOOKUP/dynamic arrays/macros, so
it recalculates in Google Sheets too), Dashboard (live totals + 2 bar charts + Budget/Value/Premium
preset comparison), Compare (full budget/value/premium detail side by side), Options (raw sourced
data, hyperlinked), Base Camp (Group), Friends' List, Packing Checklist. Also copies the output to
`C:\Users\jorda\Downloads\Gear_Picker.xlsx`. Prints Python-computed default/all-budget/all-value/
all-premium totals at the end for a sanity cross-check against Excel.

**Run:** `python tools/build_gear_picker.py`

**Status:** built 2026-09-21, runs clean. LibreOffice is not installed on this machine, so
formulas could not be headlessly recalculated to scan for `#REF!`/`#N/A` — only structurally
verified by re-opening with openpyxl and cross-checked against a parallel Python computation of
the same totals (see the session log for the numbers).

**Playwright:** not a project dependency — installed ad hoc into a throwaway `package.json` for the
verification pass, then `node_modules`/`package.json`/`package-lock.json` were moved to
`E:\to-delete\ga-gold-trip\` afterward (never delete directly per GOTCHAS; the Captain empties
`to-delete` periodically). Reinstall the same way (`npm init -y && npm install playwright && npx
playwright install chromium`) for the next browser check, then move it back out when done.

**Bug fixed 2026-09-21 (2nd pass):** `norm_item()`'s `where_to_buy`/`verdict_sources`/`pros`/`cons`
fields assumed list input and did `", ".join(...)` — the hardcoded `SLEEP_30F` block (his
RECOMMENDED default sleeping bag) passed plain strings there, so those 4 columns rendered as
comma-separated single characters for all 3 sleep_system_30f rows. Fixed with a `join_field()`
helper that passes strings through unchanged. Re-run the script if you add another hardcoded
item block with string (not list) source fields.

## tools/build_buy_list.py
Re-runnable Python (openpyxl) builder for `BUY_LIST.md`. Reads the live CHOICE picks straight out
of `Gear_Picker.xlsx`'s Picker sheet (skips Skip/Own rows and $0/DIY-"None" items), matches each to
its Options row, computes his per-person share price by the item's split factor, and sorts by lead
time (cottage-made gear like Durston/Enlightened Equipment first, then Amazon/generic, then
in-stock retail, then quick DIY buys) so the Captain orders slow items first. Prints his-share total
for a cross-check against `build_gear_picker.py`'s printed DEFAULT total (should match to the
penny, modulo per-row rounding).

**Run:** `python tools/build_buy_list.py` (run `build_gear_picker.py` first if CHOICE picks changed)

**Status:** built 2026-09-21 (2nd pass), matches Gear_Picker.xlsx's default total ($2,490.25 vs.
$2,490.26 — 1-cent rounding from summing already-rounded per-item shares).
