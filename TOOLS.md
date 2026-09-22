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

`build-map.mjs` also: runs a build-time point-in-polygon legality guard (ray-casting, handles
Polygon/MultiPolygon) for every point and every overnight trailhead/camp/pan_reach against
`wilderness.geojson`, logging every hit to the build console and tagging matched entries with
`_insideWilderness` so their popup shows a red "INSIDE WILDERNESS/STATE PARK — NO PANNING"
banner (as of the map-rework pass, this guard also runs against every `water.geojson` line
feature — see below). **Finding from this guard:** the Dockery Lake Trail ~3.0-mi campsite, and
its pan reaches at ~2.0 mi and ~2.55-2.65 mi, fall INSIDE Blood Mountain Wilderness per the
OSM-derived boundary (the ~0.5-mi crossing does not) — this contradicts
`research/overnight-route-v2.md`'s guess that the campsite sits below the boundary; treat Dockery
Lake as backup-only for camping/panning until confirmed against a survey-grade boundary.

### Map rework pass (2026-09-21, 3rd pass) — real day-by-day route + water layer

The old "Itinerary" layer (numbered markers + straight dashed lines between day stops) is
**removed**. It drew the wrong overnight (the only route with geometry was the Dockery Lake
*backup*, whose campsite the legality guard flags as inside Blood Mountain Wilderness) and every
day-to-day line was crow-flies, not a real road or trail. Replaced with a day-chaining route built
from real routing/trail data — see below. `map/data/itinerary.json` is still read (harmless) but
no longer rendered; it remains the source of truth for which stops belong to which day.

**Day 5/6/7 contradiction resolved:** `itinerary.json` gave two full nights at Three Forks (day 5
*and* day 6); the trip's plan is one overnight, Mon Oct 19 → Tue Oct 20. Resolved as: Day 5 = Vogel
→ drive → hike in → camp. Day 6 = wake at camp → pan → hike out → drive back to Vogel. Day 7 =
Vogel, break camp, depart. Encoded directly in `map/data/days.json`'s day 5/6/7 entries.

**New data files:**
- `map/data/days.json` (schema `days-v1`) — the real day-by-day route: each day is an ordered
  chain of `drive`/`walk`/`pan`/`tour` legs. `drive` and `walk` legs carry real `coords`
  ([lat,lng] pairs), `miles`, `minutes`, and `geometry_confidence` (`"exact"` for real
  OSRM/OSM-way geometry, `"approximate"` for any straight-line stitch — see honesty notes below).
  `start`/`end` on each day carry an explicit `lat`/`lng` taken directly from the first/last leg's
  real coordinate (not a separate ref lookup), so the map's start/end markers always sit exactly
  on the drawn line, and so the day-chain assertion (day N `end` must equal day N+1 `start`) can
  compare real coordinates, not just id strings. Built by `map/data/_build_days.mjs`.
- `map/data/water.geojson` — creek/river line geometry, split out of `trails.geojson` (which
  had crept into holding both). Noontootla Creek and Rock Creek were moved over as-is (same OSM
  geometry as before); Frogtown, Cooper, Yahoola, and the Upper Chattahoochee (near FS-44) were
  newly fetched from OSM and added. **Tesnatee Creek could not be found** — no OSM way tagged
  `waterway=stream|river` with a name matching "Tesnatee" turned up in bboxes up to ±0.03° around
  Tesnatee Gap (checked both up- and down-slope of the gap); an unnamed stream is nearby and used
  as a proxy target for the day-4 walk leg only, clearly caveated — no geometry was invented for
  the water layer itself. Built by `map/data/_build_water.mjs`; `trails.geojson` now holds only
  trail/road features.
- `map/data/_lib.mjs` — shared helpers for both one-off builders above: cached fetch, OSM XML
  parsing, haversine/resampling, Tobler's function, OSRM/opentopodata/OSM wrappers.

**Network dependencies, added this pass (verified working 2026-09-21):**
- **OSRM public demo** (`router.project-osrm.org/route/v1/driving/...`) — real driving routes
  for every `drive` leg (geometry, distance, duration).
- **`api.opentopodata.org/v1/aster30m`** — elevation (ASTER 30m dataset, i.e. ~30m horizontal
  resolution — coarse but real) sampled every ~100m along each `walk` leg, used for the Tobler
  walking-time model below. 100 locations/call, 1 call/sec; batched and capped accordingly.
- `api.openstreetmap.org/api/0.6/map` was already in use (see `research/_build_trails.mjs` from
  the prior pass); this pass adds a generic small-bbox path/waterway finder in `_lib.mjs` used by
  both new builders.
- **Dead — do not use:** all Overpass API mirrors (overpass-api.de, kumi.systems,
  openstreetmap.ru, maps.mail.ru) and `api.open-elevation.com`. Tested 2026-09-21, unreachable.
  Retrying them wastes turns; use the endpoints above instead.
- All network responses are cached to `map/data/_cache/` (gitignored) so re-runs of either builder
  are instant and free after the first fetch. Delete that folder to force a refetch.

**Walking-time model (`map/data/days.json`'s `assumptions` block):** Tobler's hiking function,
`W = 6 * exp(-3.5 * abs(slope + 0.05))` km/h, applied per ~100m elevation-sampled segment along
each walk leg's real geometry, then derated by `group_factor` (0.85, six people move slower than
one) and by `pack_factor` (0.85, loaded pack — day 5/6 hike-in/out only) or `daypack_factor` (1.0,
everything else). **Implementation note / ambiguity resolved:** the task brief said to "multiply
[time] by group_factor," which taken literally would make a slower group finish faster — physically
backwards. Implemented instead as `kmh_effective = kmh_tobler * group_factor * pack_or_daypack`
(i.e. the factor derates speed, so time increases), matching the brief's own stated intent ("six
people move slower than one"). Minutes are rounded to the nearest 5.

**Honesty rule applied throughout:** every `drive`/`walk` leg's `geometry_confidence` is `"exact"`
only when its `coords` are real routed/mapped geometry end-to-end; any leg with so much as a
straight-line stitch at one end is `"approximate"`, and the map draws it dashed with a "~ approx"
tag in the leg panel. The Three Forks/Noontootla overnight (day 5/6 hike) uses real AT/Benton
MacKaye Trail geometry already in `trails.geojson`, cut at a ~0.3-mi mark chosen to move away from
the road/AT-thru-hiker corridor per that route's own pressure notes — the trail *shape* is real,
but the exact backcountry tent pad was never independently surveyed in the source data (it
originally just repeated the trailhead coordinate for trailhead/camp/pan_reach alike — **a
separate research pass is finding a real replacement coordinate**; when it lands, re-run
`_build_days.mjs` after updating the cut/target). `map/data/overnight-wide.json`'s
`three-forks-noontootla` entry was patched with the same real `route_coords`/`one_way_mi`/
`gain_ft` (was `[]`/`null`/`null`), with a dated note explaining the fix.

**Drive-timing bug and fix (2026-09-21, 4th pass):** the first map-rework pass only flagged slow
OSRM legs with a blanket caution; the coordinator chased it down and confirmed OSRM's *routes* are
correct but its **duration** on gravel/track roads defaults to walking pace (3.1 mph on Noontoola
Road and Blue Ridge Road near Three Forks; 4.4 mph on Poplar Stump Road; 3.1 mph on Chattahoochee
River Road near FS-44) — a truck on real maintained FS gravel runs 15-25 mph. Fixed properly, by
road surface, not a blanket floor: every `drive` leg is now fetched from OSRM with `steps=true`,
grouped into named road segments, and each segment's real OSM way is looked up
(`api.openstreetmap.org` small-bbox, nearest way within 150m, name match preferred) and classified
by its `highway`/`surface` tags — **paved** (`surface=asphalt|paved|concrete`, or
`highway=primary|secondary|tertiary|residential`) trusts OSRM's own duration; **unpaved/track**
(`surface=gravel|dirt|unpaved|compacted|ground`, or `highway=track|unclassified` with no paved
surface tag) is re-timed at a flat, deliberately conservative **15 mph**; **undeterminable** (no
OSM way found nearby) keeps OSRM's duration unless OSRM's own implied speed was already under 10
mph, in which case it's also re-timed at 15 mph but flagged confidence `'low'`. Distance is never
touched — only duration, and only per segment. Every drive leg keeps **both** numbers:
`minutes` (adjusted) and `minutes_osrm_raw` (OSRM's original), plus `timing_model` (a plain-English
explanation) and a full `retimed_steps` audit array (per-segment name/ref, surface tag, OSRM mph
vs. mph used, confidence) — anyone can audit exactly what changed and why. `timing_confidence` on
the leg is `'estimated'` if anything was re-timed, else `'exact'`. The assumption (15 mph, and the
whole classification rule) lives in `days.json`'s `assumptions.drive_timing_model` as well as here.
Full before/after: Vogel↔Three Forks 191→111 min each way; Day 4's Tesnatee→Upper-Chattahoochee
155→61 min and Upper-Chattahoochee→Dukes 141→42 min; Day 3's Cooper Creek legs actually ticked up a
touch (58→59, 57→59 — OSRM had already guessed close to 15 mph on Mulky Gap Road, and flat-15 is
marginally more conservative than OSRM's own 15.4-15.5 mph there). Day 4's elapsed time dropped
from 10.9 hr to 7.7 hr; Day 5/6 drive time dropped enough that the overnight is clearly feasible
instead of looking implausible. **Surfaced in the UI:** a re-timed drive leg gets a "gravel — est."
tag next to its time in the leg panel (plus the raw OSRM time in parentheses) and in its map popup
(which also shows `timing_model`); any day containing a re-timed leg gets a one-line panel note
recommending a Google Maps cross-check, calling out the Vogel↔Three Forks drive (days 5/6) and the
GA-348 loop (day 4) by name.

**Click-occlusion bug and fix (2026-09-21, 4th pass):** the coordinator's own click at the Day 5 end
marker's real screen position (bottom-left, under the legend, at a 1280×720 viewport) hit the
legend's "Hospital / ER" row instead of the marker — `fitBounds`'s fixed `padding:[40,40]` didn't
account for any of the map's own overlay chrome (zoom control + day strip top-left, layers control
top-right, legend bottom-left), so a day's start/end marker could land right under one of them.
Fixed two ways, both live: (1) `computeFitPadding()` measures the actual on-screen
`getBoundingClientRect()` of `.leaflet-control-zoom`, `.day-strip`, `.leaflet-control-layers` and
`#legend` every time a day is selected and turns that into Leaflet's `paddingTopLeft`/
`paddingBottomRight` `fitBounds` options, so it stays correct if the legend grows (it lists more
rows now) or the viewport resizes; (2) the day panel's title row now always has "← Day N-1" /
"Day N+1 →" buttons that call the same `selectDay()` the map popup buttons do — a chaining path
that can never be occluded by map chrome because it isn't on the map. **A second, related bug**
turned up while re-testing with real coordinate clicks instead of `element.click()`/dispatched
events (the very gap that let this slip through the first time): on every day that starts and ends
at the same point (days 1-4 and 7 — all Vogel-to-Vogel loops), the separate start and end markers
rendered exactly on top of each other, and the later-added end marker permanently covered the
start marker — its back-chain button was unreachable by any real click even though its popup logic
was fine. Fixed by detecting when `start`/`end` are within 15m and rendering ONE merged "hub"
marker (half-green/half-red, both chain buttons in one popup) instead of two stacked pins; the
start/end markers also now carry real CSS classes (`day-start-marker`/`day-end-marker`, the hub
carries both) instead of being found by matching glyph text, which is what let the hub case be
verified cleanly.

**Status:** active, working as of 2026-09-21 (4th pass — coordinator-reported bug fixes).
`node map/build-map.mjs` exits clean. Playwright via the same throwaway-install pattern (see below)
was used for a **real-coordinate-click** re-verification at 1280×720 (matching the coordinator's
repro): for every day 1-7, `document.elementFromPoint()` at each start/end (or hub) marker's own
bounding-box center returns that same marker — i.e. nothing occludes it — confirmed for all 7 days
including the 5 hub-marker days; `page.mouse.click()` (not a locator/dispatched-event click) at the
Day 1 end marker's real screen position opened its popup and a real click on its "Day 2 starts
here →" button advanced the day strip to day 2, the same for the Day 5 end marker (backcountry
camp) → day 6, and the Day 6 start marker's "← Day 5 ended here" button back to day 5; the Day 1
hub marker (start==end at Vogel) opened correctly and showed the forward chain button; both new
panel nav buttons (tested from Day 3/4) correctly stepped the day; "gravel — est." tags and the
cross-check note were confirmed present on days 4/5/6; zero console errors/pageerrors throughout.
`map/screenshot.png` was refreshed from this pass. (The prior pass's verification — day strip
button count, layer-control labels, per-day leg-row/totals rendering — was re-exercised
incidentally by clicking through all 7 days again here and stayed clean; not re-asserted line by
line since nothing in this pass touched that code path.)

### Overlays control panel + panning-status data (2026-09-21, 5th pass)

The map used to hide every overlay (no-panning zones, trails, creeks, USFS land ownership) behind
Leaflet's collapsed layers icon, with no way to adjust how strong any of them looked. Replaced with
a dedicated "Overlays" panel (top-right, below the base-map switcher): one row per overlay with an
on/off checkbox, a color swatch, and a 0-100% opacity slider. It's built generically from whatever
is in `overlayLayers` at that point in the script, so any new overlay added the same way (assigned
into `overlayLayers[label]` + `overlayColors[label]`) shows up in the panel automatically — no
panel code changes needed. On/off + opacity are saved to `localStorage`
(`gaGoldTripOverlaySettings.v1`, wrapped in try/catch) and restored on reload; defaults (no-panning
zones, trails, creeks on; USFS off) are unchanged from before. The slider composes with the existing
day-selection dimming: `refreshOverlayStyle(key)` in `build-map.mjs` applies
`userOpacity x (DIM if dimmed else 1)` against each layer's original design opacity, so a dimmed
overlay stays dimmed *relative to* whatever the user set the slider to, not reset to the design
default. At phone width (`window.innerWidth < 700` when the panel is created) it starts collapsed
to a small square icon button (`.overlay-toggle-icon`) instead of the full 230px panel, because the
sidebar already claims most of a narrow viewport and a full-width control would render off-screen —
tap it to expand. `computeFitPadding()` (the existing marker-collision-avoidance code, ~line 1055)
now also measures `.overlay-panel`'s rect alongside the layers control so a day's fitBounds still
keeps markers clear of it.

**USFS land ownership readability fix:** the EDW tile layer rendered washed-out over every base map
at its old default opacity (0.45). Fixed by (1) raising its default opacity to 0.75 (the panel
slider still runs 0-100% of that), (2) giving it its own Leaflet pane (`usfsPane`, zIndex 399, just
below the default `overlayPane` at 400) with a CSS `filter: saturate(1.7) contrast(1.3)
brightness(1.05)` for extra punch beyond what raw opacity alone can do, and (3) the custom pane's
lower zIndex means the red no-panning zones (which use the default `overlayPane`) always draw on
top of it, regardless of which order the two get toggled on in the panel.

**`map/data/panning-status.geojson`** — new, optional (a missing or empty file does not break the
build). A `FeatureCollection` of `Polygon`/`MultiPolygon`/`LineString`/`MultiLineString` features,
read by `build-map.mjs` and split into three panel overlays: "Panning: good" (green), "Panning: no"
(red), "Panning: no info" (grey). Lines draw as thick colored strokes, polygons as filled areas; each
feature's popup shows `name`, `reason`, `source` (rendered as a clickable link only when it starts
with `http://`/`https://`, otherwise as plain citation text) and `checked`.

Feature `properties` schema:
| field | type | notes |
|---|---|---|
| `status` | `"good"` \| `"no"` \| `"unknown"` | Required. Anything else (including missing) is treated as `"unknown"` — **never guess "good" or "no"; use "unknown" whenever the answer isn't independently confirmed.** |
| `name` | string | Short place name, shown as the popup title. |
| `reason` | string | One short sentence — why this status (e.g. "Wilderness Area — panning banned by federal designation" or "Landowner confirmed panning OK by phone, Sept 2026"). |
| `source` | string | A URL (linked in the popup) or a plain citation (e.g. "Nominatim/OSM (relation 14582139)", "Phone call w/ ranger district, 2026-09-21"). A good source is something another person could actually check — an official agency page, a dated call/email log, a survey document — not a blog post, a forum comment, or "I think." |
| `checked` | string (date) | When this status was last verified. Omit rather than invent a date for data you didn't personally verify (the seed features below omit it for exactly this reason). |
| `seed` | boolean | `true` on features copied in from existing project data rather than freshly researched (see below); omit for freshly researched features. |

**Seeded 2026-09-21:** the file currently holds only the 7 polygons already in
`map/data/wilderness.geojson` (5 federal Wilderness areas + Vogel/Smithgall state parks), copied in
as `status: "no"`, `seed: true`, reusing their existing OSM/Nominatim `source` citations. No `"good"`
features exist yet and none were invented. **The old standalone "NO PANNING" GeoJSON overlay was
removed** (the loop in `build-map.mjs` now `continue`s past the wilderness layer) — its zones are
folded into "Panning: no" instead, so the same boundary isn't drawn twice; `wilderness.geojson`
itself is untouched and still feeds the separate build-time legality guard (the `_insideWilderness`
banner logic), which is unrelated to this rendering path. A research pass can now add real "good"
and additional "no"/"unknown" features to `panning-status.geojson` directly — the panel and popups
need no further changes to pick them up.

### East Fork Coosa Creek backcountry route + route variants (2026-09-21, 6th pass)

`research/backcountry-route-design.md` (the "long"/"short" backcountry design) is now built into
`map/data/days.json` by **`map/data/_build_backcountry.mjs`** (re-runnable: `node
map/data/_build_backcountry.mjs`). **Run order matters:** `_build_days.mjs` regenerates days.json
from scratch with NO variants; `_build_backcountry.mjs` must always run immediately after it (see
the loud warning comment at the top of `_build_days.mjs`) or the variants get silently wiped.
`_build_backcountry.mjs` is itself idempotent/re-runnable on its own — it reads its days-1/2/3/4/7
baseline from the "short" variant's array (always pristine) rather than top-level `days` (which
after the first run *is* the "long" variant and would double-append the Fri-shuttle legs / lose
days 3-4 if re-read as the baseline).

**Schema addition:** `days.json` gained a top-level `variants` array,
`[{id:"long"|"short", label, days:[...7 days]}]`; top-level `days` is set to the "long" variant's
days for back-compat with anything (older code, GPX) that only knows the single-route shape.
`build-map.mjs`'s chain-consistency assertion, the wilderness point-in-polygon legality guard, and
`trip.gpx` export were all extended to run across every variant, not just top-level `days`.

**Geometry:** the Coosa Backcountry Trail's 4 OSM name-variant segments (see
`research/_coosa_osm.geojson`) are chain-merged at build time into one continuous 12.935mi loop,
oriented to the Vogel trailhead, and cut at the survey mile-markers from
`research/coosa-geometry-survey.md` Task 6 (Burnett Gap 1.02mi, WOLF-X/FS107 crossing 3.37mi,
Locust Stake Gap 4.71mi, Calf Stomp Gap 5.91mi — Calf Stomp Gap's cut agrees with the design doc's
explicit coordinate within 35m). Calf Stomp Road (FS108), Big Grassy Knob Road, Duncan Ridge Conn
and Bowers Road (FS298) are real OSM ways, snapped at their real intersections (all within ~0.3m
of the design's named junction coordinates except CAMP-C, whose creek-confluence point sits ~76m
off Duncan Ridge Conn — the one >30m straight-line stitch on the route, flagged
`geometry_confidence:"approximate"` and reported). `_lib.mjs` gained two new reusable helpers for
this: `pointAtDistanceMeters`/`pointAtMiles` (interpolated cut point at a given distance along a
polyline) and `chainMergeSegments` (greedy endpoint-matching merge of disjoint OSM way segments).

**New pan-leg fields** (per the design doc's "what done looks like" section, text copied verbatim
from `backcountry-route-design.md` — never paraphrased): `state:"amber"`,
`legality.panning`/`legality.camping` (`{state, text, source_url}`), `gold`
(`{record, pressure, geology, sources[]}`), `water`, `bears`, `fires`. Legs/days depending on an
UNCONFIRMED access item (Bowers Road/FS298, Big Grassy Knob Road, Calf Stomp Road/FS108, FS107) get
`access_confidence:"unconfirmed"`. The optional layover day (Oct 19, "long" only) gets
`optional:true` + `optional_note`.

**`map/build-map.mjs` UI additions:** a variant selector lives inside the existing day-strip control
(same box, a row above the day-number buttons — not a new floating element, so the existing
`computeFitPadding()` marker-collision-avoidance code already covers it) and persists the choice to
`localStorage` (`gaGoldTripVariant.v1`); switching variants rebuilds the day layers/day-strip/day
panel in place (`applyVariant()`). Pan legs show an amber "unverified" chip in the leg panel; tapping
it toggles a detail block (panning/camping legality + source link, gold record/pressure/geology,
water, bears, fires) — progressive disclosure, nothing new floating over the map. Unconfirmed-access
legs get an amber `.access-tag` next to the existing "~ approx"/"gravel — est." tags; optional days
get a blue "optional" tag plus their note rendered under the day title.

**Verified 2026-09-21:** `node map/build-map.mjs` exits clean (chain check OK for top-level + both
variants; wilderness point-in-polygon guard checked 3 distinct day start/end points + 10 pan legs
across both variants, zero hits other than Vogel basecamp itself trivially being inside Vogel State
Park). Playwright (same throwaway-install pattern as below — reused, then moved back to
`E:\to-delete\ga-gold-trip\`) confirmed: 0 console/page errors; both variants' day-strip buttons (1-7)
render; every day in both variants renders legs with distance/time metadata; amber unverified chips
present and their detail toggles open/close correctly with the real legality text; access-tags appear
only on Bowers/Big-Grassy/Calf-Stomp/FS107 legs; the optional tag appears only on "long" day 5; the
variant choice survives a full page reload via localStorage; Day 4 (long)'s start/end markers are not
occluded (`document.elementFromPoint()` at their real screen center hits the marker itself).
`map/screenshot_backcountry.png` holds a screenshot from this pass.

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

**Reused 2026-09-21 (map rework pass):** the throwaway install and cached Chromium binary from
this pass were both still sitting where they were left (`E:\to-delete\ga-gold-trip\node_modules`
+ `%LOCALAPPDATA%\ms-playwright\chromium-1243`) — moved back in, used for the map's headless
verification, moved back out. No reinstall/redownload needed; check there first before running
`npm install` again.

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

## tools/build_rundown.py
Regenerates `RUNDOWN.html` from `RUNDOWN.md` (keeps the old file's `<style>` block; TOC rebuilt from
`## N.` headings). **Run:** `python tools/build_rundown.py` from the project root; needs `pip install
markdown`. Written 2026-09-21 (no generator existed; the old html was hand-made). The `.warn`/`.note`
callout boxes are not produced — bold lead-ins render as plain paragraphs.

**Phone check 2026-09-21:** map at 390px was unusable (300px sidebar left a 90px map, Compare button
hidden). Added a `@media (max-width:700px)` block in `build-map.mjs` (map on top 50vh, panel below,
legend lifted above the panel). Playwright throwaway install used and moved back to
`E:\to-delete\ga-gold-trip\node_modules`.
