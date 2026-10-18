# Which forest roads on this trip are legal to drive — the official MVUM, read 2026-10-17

Asked from the field: is Big Grassy Knob Road drivable and legal to drive on?

Source: the Forest Service's own Motor Vehicle Use Map data, queried live
2026-10-17 — `apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/4`
(layer "Motor Vehicle Use Map: Roads"), plus the printed 2025 Blue Ridge MVUM
atlas (`mvum_e_size_atlas--Blue Ridge--2025.pdf`, map dated 10/01/2024) for the
seasonal date table. **A route that is not on the MVUM is not designated for
motor vehicle use**; 36 CFR 261.13 prohibits operating a motor vehicle on
National Forest System land other than as designated on that map.

## The answer

| road (our name) | on the MVUM? | designation | drive it? |
|---|---|---|---|
| **Big Grassy Knob Road** | **NO** | nearest designated road is 700 m away | **No. Walk it, do not drive it.** |
| **Calf Stomp Road (FS 108)** | **NO** | nearest designated road is 467 m away | **No.** |
| Bowers Road | YES — **FS 298 "Bowers Cove"** | open to highway-legal vehicles, **seasonal 3/15–1/15**, maint. level 2 (high clearance), crushed aggregate/gravel, "Road, Not Maintained for Passenger Car" | Yes, and Oct 17–19 is inside the open season. |
| Duncan Ridge Conn | partly — it meets **FS 39 "Duncan Ridge"** (13 m at the closest) | FS 39: open to highway-legal vehicles, **yearlong**, maint. level 2, improved native material | FS 39 yes; the Conn itself is not separately designated. |
| FS 107 (West Wolf Creek Rd) | YES — **FS 107 "West Wolf Creek"** | open to highway-legal vehicles, **yearlong**, **maint. level 3 — SUITABLE FOR PASSENGER CARS**, gravel | Yes. Confirms the owner's first-hand read of 2026-10-05, now from the official map. |

Only three MVUM roads exist inside the box -83.975/-83.945 × 34.780/34.810 that
contains Big Grassy Knob Road end to end: FS 395 Fortenberry, FS 39 Duncan
Ridge, FS 298 Bowers Cove. Big Grassy Knob Road is none of them — matched by
geometry, not by name (nearest designated centreline 700 m away).

## Ownership, separately

Checked 2026-10-17 against `map/data/private.geojson` (USFS EDW BasicOwnership,
the same polygons `build-map.mjs` guards the route with), ray-cast per vertex:

- Big Grassy Knob Road: 63 of 63 vertices on Forest Service ground. **Walking it
  is fine** — it is the old route, dropped for being a road walk, not for access.
- Calf Stomp Road: 239 of 239 on FS ground. Duncan Ridge Conn: 125 of 125.
- Bowers Road: **34 of 47 vertices on NON-FS ground**, first at 34.804394,
  -83.952654 — the known private stretch below Owltown Gap (ISSUES #48). The
  MVUM's FS 298 is 1.08 mi long against 1.52 mi of mapped road, which fits: the
  private 0.68 mi below the gap is not part of the National Forest road system
  at all, so the MVUM says nothing about the public's right to drive it. **That
  question is still open** — the MVUM answers the Forest Service half only.

## Why Google will not navigate Big Grassy Knob Road

OpenStreetMap tags it `highway=track`, `surface=gravel` (read from
`research/_coosa_osm.geojson`). Google does not route tracks. Bowers Road and
Duncan Ridge Conn are `highway=unclassified`, which is why they draw and route
differently. The OSM tagging is consistent with the MVUM: it is a track, not a
designated forest road.

## Still unknown

- Whether Big Grassy Knob Road is physically passable or gated: nobody has seen
  it. It does not matter much — it is not legal to drive either way.
- The public's right to drive the private 0.68 mi of Bowers Road below Owltown
  Gap (ISSUES #48, CALLS.md #1). Unchanged by this check.
