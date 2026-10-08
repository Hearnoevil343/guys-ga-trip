# GA Gold Trip — Oct 2026

## Facts
- 5 people (confirmed 2026-10-02; earlier docs say 6) (2 experienced campers, 1 Eagle Scout). Primary occupant books the site.
- Base camp: Vogel State Park, walk-in tent site P. Arrive Thu Oct 15 (1 PM), depart Wed Oct 21 (noon). Night of Oct 20 optional.
- Site P limits (Jordan, 2026-09-21): 2 vehicles at site + overflow parking; 2 tents max (so base camp = two 3-4 person tents; backcountry night has no tent limit). Occupancy max 6.
- Jordan wants breadth (many options, not narrowed) and a visual map: where each spot/camp is, how to get there, what it looks like.
- 3 vehicles total, 2 of them Ford F-150s (off-road capable) — two F-150s can shuttle all five people in one run at any trailhead exit, and can handle the FS roads themselves; gate/road status is still pending ranger calls (CALLS.md #1), not a vehicle-capability question. Goals: panning (drive-up + low-pressure backcountry spots), Consolidated Gold Mine tour (the older guide), prospector outfits, one backcountry trip (hike in + pan, pan + hike out), light packs. Decided 2026-09-21: East Fork Coosa Creek. Decided 2026-10-02: ONE route, 3 days / 2 nights Sat Oct 17 – Mon Oct 19 (below); the other days are fun-first (waterfalls) with panning where the creek allows.
- Defaults (Jordan didn't specify): owns no gear yet, modest budget, 5 mi/day with pack, day 1 is arrival day.
- Day plans (2026-09-21, meals/camp-time pass) include breakfast, lunch, and dinner, plus camp
  setup on arrival at a new camp and breakdown the morning a camp is left (`type: "camp"`/`"meal"`
  legs in `map/data/days.json` — non-moving time, no new map marker; see day panel leg list and the
  Compare view's "camp & meals" row). Oct 16 (Dahlonega) gets a sit-down lunch downtown, right after
  the Consolidated Gold Mine tour (on the
  square) — pick a spot when you're there, nothing pre-booked.

- **Decided 2026-10-08 (Jordan): the hike is Sat Oct 17 – Mon Oct 19, 3 days / 2 nights, out Monday afternoon.** Tue Oct 20 is a free day. The table below is rebuilt to match (2026-10-08). Fri Oct 16 is locked as written. Route rebuilt 2026-10-08 (days.json, trip.gpx, map3d-data.js, the table below, RUNDOWN). Confirmed 2026-10-08 (Jordan): still one-way, start WOLF-X, out at Owltown Gap; Sat WOLF-X -> Calf Stump Branch, Sun -> CAMP-U, Mon pan the morning at CAMP-U then walk out to Owltown Gap.
- **Playground (Jordan, 2026-10-08):** two layers. (a) Towns: markets, food, gas, waterfalls, overlooks, festivals near Vogel with hours and Google Maps links, plus ready-made free-day plans (Thu 15 pm, Mon 19 evening, all Tue 20, Wed 21 am, rain). (b) The hike area itself (Coosa Bald / Duncan Ridge / Wolf Creek / East Fork Coosa): every named creek, trail, junction, gap, forest road, known campsite and water source, nearest store to each trailhead, so the group can go off-plan at will. The locked plan stays; the playground sits beside it. The 2-night WOLF-X -> Calf Stump -> CAMP-U -> Owltown Gap path is the one main path; the hike-area layer exists so it can be branched or adapted on the fly: at each camp and junction show the branches (bail-out to the nearest road, a longer or shorter day, a side creek to pan) with distance, climb, time and water, all readable offline.

## The week (decided 2026-10-02; geometry: map\data\days.json, built by map\data\_build_days.mjs then _build_backcountry.mjs)
| Day | Plan | Pan? |
|---|---|---|
| Thu Oct 15 | Arrive 1 PM, set camp. Afternoon: **pick one on the day** (Jordan, 2026-10-08 — "have it so i can go to any of them"): Helton Creek Falls (3.9 mi / 13 min, 0.13 mi walk to a lower and an upper falls) **or** DeSoto Falls (~10 min, open 24 h, two falls off one easy loop) **or** Sosebee Cove Scenic Area (~10 min, old-growth cove, short loop, free). Helton is the one drawn on the map because the map needs one line. All three replace the Vogel lake-loop walk to Trahlyta Falls, which is CLOSED (lake drained for dam repairs; gastateparks.org/Vogel, re-fetched 2026-10-08). After dinner: stargazing at Brasstown Bald (~27 min; after-hours fee $6/person 16+, gate hours still unconfirmed). | — |
| Fri Oct 16 | Dahlonega: Consolidated Gold Mine tour, lunch on the square, pan Yahoola Creek Park. Evening: both trucks stage truck 2 at Owltown Gap, back in truck 1. Pack the hike packs. | Yahoola Creek |
| Sat Oct 17 | **Hike day 1.** Truck 1 to WOLF-X (FS 107, 4.2 mi). Pan West Fork Wolf Creek (2 h). Coosa Backcountry Trail up over Calf Stomp Gap (2.5 mi, +1,375 ft) and 0.4 mi on to Calf Stump Branch (34.78244, -83.95858, ~400 m from the nearest road). Camp, pan in the evening. Creek has no gold record and October flow is unconfirmed. Deer season opens: blaze orange. | WOLF-X 2 h, Calf Stump 1.5 h |
| Sun Oct 18 | **Hike day 2.** Morning pan at Calf Stump Branch (1.5 h). Back 0.4 mi to Calf Stomp Gap (the only retraced stretch), Roaring Fork Trail west (1.9 mi), off-trail drop to the road-free upper East Fork Coosa Creek: CAMP-U. Camp, pan. 2.75 mi. | Calf Stump 1.5 h, CAMP-U 1.5 h |
| Mon Oct 19 | **Hike day 3, out.** Morning pan at CAMP-U (2 h). Break camp, down the creek 0.3 mi to LOWER, last pan (1.5 h), lunch, on down the creek 0.4 mi to where the road starts (34.79824, -83.97825), the road (Duncan Ridge Conn) 0.7 mi to Bowers Road, Bowers Road (FS 298) 1.5 mi to truck 2 at Owltown Gap. 2.9 mi walking. Drive truck 2 to WOLF-X for truck 1 (24 min), both to Vogel (11 min). Hot dinner at Vogel. Bowers Road crosses private land near 34.8064; public use unconfirmed (CALLS). | CAMP-U 2 h, LOWER 1.5 h |
| Tue Oct 20 | **Free day.** Nothing booked. Ready-made plans (waterfall loop, Blairsville / Helen / Hiawassee, markets and festivals, rain plan) and the hike-area layer are in the hub's Playground tab. Also the slack day if the hike runs long. | optional |
| Wed Oct 21 | Break camp, out by noon. | — |

## Backcountry (decided 2026-09-21; source: research\backcountry-route-design.md)
Centerpiece: East Fork Coosa Creek (Union Co.). Gold record: Georgia Geological Survey Bulletin 19 (1909) pp. 237-239 and USGS MRDS Coosa Creek Placer Mine (past producer). Pan only on National Forest reaches, upstream of 34.80637, -83.95980. Nothing is ranger-confirmed — every creek stop is amber; calls in CALLS.md #1.
- **Rerouted 2026-10-05 (Jordan):** no road walking, no camp a vehicle can reach. The old route (WOLF-X camp, FS 108 / Big Grassy Knob Rd / Duncan Ridge Conn / Bowers Road, CAMP-C at Jones Branch, truck 2 at Owltown Gap) is gone: every one of those camps and pan stops sat beside a drivable road. New: one truck at WOLF-X (FS 107 is open — Jordan, first-hand, 2026-10-05), trail to Calf Stomp Gap, **Roaring Fork Trail** (OSM way 978262922, path, ground; condition unconfirmed) west along the ridge, then a 0.4 mi off-trail drop to **CAMP-U** (34.79056, -83.98457, ~2,875 ft), on the only reach of the creek with no road beside it (above 34.79824, -83.97825). Nearest road point ~670 m away across a 500 ft slope. **Route locked 2026-10-05 (Jordan), reshaped 2026-10-08 (Jordan):** night 1 at Calf Stump Branch, night 2 at CAMP-U, out Monday down the creek and Bowers Road to truck 2 at Owltown Gap (staged Fri evening). 2 nights, not 3; Tue Oct 20 is a free day. Risks: the off-trail drop is steep (25%); the creek is a headwater and October flow is unconfirmed (fallback: move down toward 34.7958, -83.9792).
- **Private land is now on the map** (purple tint, on by default): real USFS ownership polygons (`map/data/private.geojson`, EDW BasicOwnership, 2026-10-05). `build-map.mjs` fails if any route point lands on it. The old "USFS land ownership" tile layer drew the proclamation boundary and hid private inholdings; it is gone.
- Cooper Creek and the old "short" option are dropped. The map's variant selector/Compare view is gone — days.json has one route.
- Hike food: Sat lunch through Mon lunch carried (2 breakfasts, 3 lunches, 2 dinners) — 3 days / 2 nights, reshaped 2026-10-08. Master gear + food list: MASTER_LIST.md.
- Noontootla / Three Forks was dropped 2026-09-21 (gold is downstream on mostly private land; FS-58 order gated; 111 min drive).

## Steps
| # | Step | Model / effort | Weight | Status |
|---|---|---|---|---|
| 1 | 5 research agents -> research\*.md (rules, spots+geology, overnight route, gear, Dahlonega) | Sonnet agents | medium-heavy | done 2026-09-21 |
| 2 | Cross-check, pick spots + route, write day-by-day PLAN | Opus | medium | done 2026-10-02 (single route, Fable) |
| 3 | Priced gear sheet (xlsx), pocket cards, GPX/offline maps | Sonnet | medium | |
| 4 | Early Oct re-check: fire bans, water, roads, forecast | Haiku | light | done 2026-10-08 (`research/conditions-2026-10-08.md`; re-run Oct 13-14) |
| 5 | Hub audit -> ISSUES.md; fishing/crawdad and playground research | agents | medium-heavy | done 2026-10-08 |
| 6 | Route rebuild to Sat-Mon; Fish & crawdads tab; Playground tab (towns + hike area); ISSUES group A, #16, #20-#23 | Opus | heavy | done 2026-10-08 |
| 7 | Phone test of the APK; the remaining ISSUES (#17-#19, #24-#28, #30-#46); re-check all links within a week of Oct 15 | Opus | heavy | part done 2026-10-08: #24, #25, #26, #32, #34, #35, #36, #39, #40, #43, #44, #46 closed and seen in a browser; #31, #33, #37, #38, #41, #42 stood down by Jordan; APK rebuilt (140,929,127 B) and in sync, **not released**. Blocked: #17-#19 need Jordan's Chrome (the extension is not connected), the emulator cannot start on DATA (new #47), so #28-#30 are untested. Not done: the link re-check pass. |

## Files
- reference\friend_gear_checklist_original.xlsx: friend's sheet (mixes base camp + overnight + creek kit; 5-day food carried; split=2).
- research\: agent findings.
- Gear_Picker.xlsx: Jordan's picks, all must-haves defaulted to Value tier except phone nav/knee
  pads (Budget) and waders (Value — Jordan wants them, though the plan only needs shin-deep
  panning). Owns none of knife/trekking poles/headlamp/camp shoes, so no "Own" rows.
- BUY_LIST.md: final buy list from current picks, sorted by lead time (cottage gear first). His
  share total: $2,490.25 (matches Gear_Picker.xlsx Dashboard default).

## Open (2026-09-21, 2nd pass)
- Amazon-knockoff options with real (non-Amazon-hosted) user reviews — Jordan floated this,
  said prices can be refined later; not done this pass.
- Calls still outstanding (Vogel, Blue Ridge RD re: East Fork Coosa Creek / West Fork Wolf Creek panning + Roaring Fork Trail condition, GA DNR,
  Consolidated, Lumpkin Co, LDMA) — see CALLS.md. Overnight route not yet ranger-confirmed legal.


