# GA Gold Trip — Oct 2026

## Facts
- 5 people (confirmed 2026-10-02; earlier docs say 6) (2 experienced campers, 1 Eagle Scout). Primary occupant books the site.
- Base camp: Vogel State Park, walk-in tent site P. Arrive Thu Oct 15 (1 PM), depart Wed Oct 21 (noon). Night of Oct 20 optional.
- Site P limits (Jordan, 2026-09-21): 2 vehicles at site + overflow parking; 2 tents max (so base camp = two 3-4 person tents; backcountry night has no tent limit). Occupancy max 6.
- Jordan wants breadth (many options, not narrowed) and a visual map: where each spot/camp is, how to get there, what it looks like.
- 3 vehicles total, 2 of them Ford F-150s (off-road capable) — two F-150s can shuttle all six people in one run at any trailhead exit, and can handle the FS roads themselves; gate/road status is still pending ranger calls (CALLS.md #1), not a vehicle-capability question. Goals: panning (drive-up + low-pressure backcountry spots), Consolidated Gold Mine tour (the older guide), prospector outfits, one backcountry trip (hike in + pan, pan + hike out), light packs. Decided 2026-09-21: East Fork Coosa Creek. Decided 2026-10-02: ONE route, 3 days / 2 nights Sat Oct 17 – Mon Oct 19 (below); the other days are fun-first (waterfalls) with panning where the creek allows.
- Defaults (Jordan didn't specify): owns no gear yet, modest budget, 5 mi/day with pack, day 1 is arrival day.
- Day plans (2026-09-21, meals/camp-time pass) include breakfast, lunch, and dinner, plus camp
  setup on arrival at a new camp and breakdown the morning a camp is left (`type: "camp"`/`"meal"`
  legs in `map/data/days.json` — non-moving time, no new map marker; see day panel leg list and the
  Compare view's "camp & meals" row). Oct 16 (Dahlonega) gets a sit-down lunch downtown, right after
  the Consolidated Gold Mine tour (on the
  square) — pick a spot when you're there, nothing pre-booked.

## The week (decided 2026-10-02; geometry: map\data\days.json, built by map\data\_build_days.mjs then _build_backcountry.mjs)
| Day | Plan | Pan? |
|---|---|---|
| Thu Oct 15 | Arrive 1 PM, set camp, rest. Optional short walk to Trahlyta Falls inside Vogel. After dinner: stargazing at Brasstown Bald (~27 min). | — |
| Fri Oct 16 | Dahlonega: Consolidated Gold Mine tour, lunch on the square, pan Yahoola Creek Park. Evening free; pack the hike packs. | Yahoola Creek |
| Sat Oct 17 | **Hike day 1.** Truck 1 to WOLF-X (FS 107, 4.2 mi). Short test pan. Coosa Backcountry Trail up over Calf Stomp Gap (2.5 mi, +1,375 ft), Roaring Fork Trail west along the ridge (1.8 mi), then off-trail down 550 ft to the road-free upper East Fork Coosa Creek: CAMP-U. 4.8 mi. Deer season opens: blaze orange. | WOLF-X 1.25 h, CAMP-U 1 h |
| Sun Oct 18 | **Layover at CAMP-U.** Daypacks. Pan the upper reach (DROP-IN) and the lower reach (LOWER), both still 500 m+ from any road. | 5 h |
| Mon Oct 19 | **Hike day 3.** Same way out: climb to Roaring Fork Trail (+617 ft), ridge east, trail down to WOLF-X, 4.8 mi. Truck 1 → Vogel, 11 min. Hot dinner, showers. | — |
| Tue Oct 20 | **Rest day** at Vogel. Optional: Helton Creek Falls (13 min, short trail). | — |
| Wed Oct 21 | Break camp, out by noon. | — |

## Backcountry (decided 2026-09-21; source: research\backcountry-route-design.md)
Centerpiece: East Fork Coosa Creek (Union Co.). Gold record: Georgia Geological Survey Bulletin 19 (1909) pp. 237-239 and USGS MRDS Coosa Creek Placer Mine (past producer). Pan only on National Forest reaches, upstream of 34.80637, -83.95980. Nothing is ranger-confirmed — every creek stop is amber; calls in CALLS.md #1.
- **Rerouted 2026-10-05 (Jordan):** no road walking, no camp a vehicle can reach. The old route (WOLF-X camp, FS 108 / Big Grassy Knob Rd / Duncan Ridge Conn / Bowers Road, CAMP-C at Jones Branch, truck 2 at Owltown Gap) is gone: every one of those camps and pan stops sat beside a drivable road. New: one truck at WOLF-X (FS 107 is open — Jordan, first-hand, 2026-10-05), trail to Calf Stomp Gap, **Roaring Fork Trail** (OSM way 978262922, path, ground; condition unconfirmed) west along the ridge, then a 0.4 mi off-trail drop to **CAMP-U** (34.79056, -83.98457, ~2,875 ft), on the only reach of the creek with no road beside it (above 34.79824, -83.97825). Nearest road point ~670 m away across a 500 ft slope. Out the same way. Risks: the off-trail drop is steep (25%); the creek is a headwater and October flow is unconfirmed (fallback: move down toward 34.7958, -83.9792).
- **Private land is now on the map** (purple tint, on by default): real USFS ownership polygons (`map/data/private.geojson`, EDW BasicOwnership, 2026-10-05). `build-map.mjs` fails if any route point lands on it. The old "USFS land ownership" tile layer drew the proclamation boundary and hid private inholdings; it is gone.
- Cooper Creek and the old "short" option are dropped. The map's variant selector/Compare view is gone — days.json has one route.
- Hike food: Sat lunch through Mon lunch carried (2 breakfasts, 3 lunches, 2 dinners). Master gear + food list: MASTER_LIST.md.
- Noontootla / Three Forks was dropped 2026-09-21 (gold is downstream on mostly private land; FS-58 order gated; 111 min drive).

## Steps
| # | Step | Model / effort | Weight | Status |
|---|---|---|---|---|
| 1 | 5 research agents -> research\*.md (rules, spots+geology, overnight route, gear, Dahlonega) | Sonnet agents | medium-heavy | done 2026-09-21 |
| 2 | Cross-check, pick spots + route, write day-by-day PLAN | Opus | medium | done 2026-10-02 (single route, Fable) |
| 3 | Priced gear sheet (xlsx), pocket cards, GPX/offline maps | Sonnet | medium | |
| 4 | Early Oct re-check: fire bans, water, roads, forecast | Haiku | light | |

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


