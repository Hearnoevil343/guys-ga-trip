# GA Gold Trip — Oct 2026

## Facts
- 6 people (2 experienced campers, 1 Eagle Scout). Primary occupant books the site.
- Base camp: Vogel State Park, walk-in tent site P. Arrive Thu Oct 15 (1 PM), depart Wed Oct 21 (noon). Night of Oct 20 optional.
- Site P limits (Jordan, 2026-09-21): 2 vehicles at site + overflow parking; 2 tents max (so base camp = two 3-4 person tents; backcountry night has no tent limit). Occupancy max 6.
- Jordan wants breadth (many options, not narrowed) and a visual map: where each spot/camp is, how to get there, what it looks like.
- 3 vehicles total, 2 of them Ford F-150s (off-road capable) — two F-150s can shuttle all six people in one run at any trailhead exit, and can handle the FS roads themselves; gate/road status is still pending ranger calls (CALLS.md #1), not a vehicle-capability question. Goals: panning (drive-up + low-pressure backcountry spots), Consolidated Gold Mine tour (the older guide), prospector outfits, one backcountry trip (hike in + pan, pan + hike out), light packs. Decided 2026-09-21: East Fork Coosa Creek. Decided 2026-10-02: ONE route, 3 days / 2 nights Sat Oct 17 – Mon Oct 19 (below); the other days are fun-first (waterfalls) with panning where the creek allows.
- Defaults (Jordan didn't specify): owns no gear yet, modest budget, 5 mi/day with pack, day 1 is arrival day.
- Day plans (2026-09-21, meals/camp-time pass) include breakfast, lunch, and dinner, plus camp
  setup on arrival at a new camp and breakdown the morning a camp is left (`type: "camp"`/`"meal"`
  legs in `map/data/days.json` — non-moving time, no new map marker; see day panel leg list and the
  Compare view's "camp & meals" row). Oct 16 (Dahlonega) gets a sit-down lunch downtown, right after
  the Consolidated Gold Mine tour and before the Gold Museum (walkable from the museum on the
  square) — pick a spot when you're there, nothing pre-booked.

## The week (decided 2026-10-02; geometry: map\data\days.json, built by map\data\_build_days.mjs then _build_backcountry.mjs)
| Day | Plan | Pan? |
|---|---|---|
| Thu Oct 15 | Arrive 1 PM, set camp. DeSoto Falls trail + Frogtown Creek (first lesson). Evening walk to Trahlyta Falls inside Vogel. | Frogtown Creek |
| Fri Oct 16 | Dahlonega: Consolidated Gold Mine tour, lunch on the square, Gold Museum, Yahoola Creek Park. Evening: stage truck 2 at Owltown Gap. | Yahoola Creek |
| Sat Oct 17 | **Hike day 1.** Site P → Coosa Backcountry Trail → West Fork Wolf Creek, 3.53 mi. Camp at the FS 107 crossing. Deer season opens: blaze orange. | WOLF-X, 3 h |
| Sun Oct 18 | **Hike day 2.** Over Calf Stomp Gap, down Big Grassy Knob Rd to East Fork Coosa Creek, 5.24 mi, +1,668 ft. Camp at Jones Branch confluence. | Roaring Fork 1.5 h, camp 1.5 h |
| Mon Oct 19 | **Hike day 3.** Out Bowers Road to Owltown Gap, 2.29 mi. Truck 2 → Vogel, 18 min. Hot dinner, showers. | Boundary stop 1.5 h |
| Tue Oct 20 | **Waterfall day**, daypacks. Helton Creek Falls, then Tesnatee Gap, Upper Chattahoochee FS-44, Dukes Creek Falls. Alternatives: Brasstown Bald, Helen Oktoberfest, Raven Cliff Falls (RUNDOWN §1). | Tesnatee, Upper Chatt, Dukes Creek, 1.5 h each |
| Wed Oct 21 | Break camp, out by noon. | — |

## Backcountry (decided 2026-09-21; source: research\backcountry-route-design.md)
Centerpiece: East Fork Coosa Creek (Union Co.). Gold record: Georgia Geological Survey Bulletin 19 (1909) pp. 237-239 and USGS MRDS Coosa Creek Placer Mine (past producer). Pan only on National Forest reaches, upstream of 34.80637, -83.95980. Nothing is ranger-confirmed — every creek stop is amber; calls in CALLS.md #1.
- The route is the old "long" option without its layover. The old "short" option (Owltown Gap in and back out, 1 night) and Cooper Creek are dropped from the plan; "short" stays the bad-weather fallback (design doc). The map's variant selector/Compare view is gone — days.json has one route.
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
- Calls still outstanding (Vogel, Blue Ridge RD re: East Fork Coosa Creek / West Fork Wolf Creek panning + road access, GA DNR,
  Consolidated, Lumpkin Co, LDMA) — see CALLS.md. Overnight route not yet ranger-confirmed legal.


