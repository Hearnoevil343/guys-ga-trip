# Guys GA Trip — October 15–21, 2026

**[→ Open the trip hub](https://hearnoevil343.github.io/guys-ga-trip/)**

Five of us, a week in the north Georgia mountains, panning for gold. Base camp is the
walk-in tent site at Vogel State Park; two nights (Sat Oct 17 – Mon Oct 19) are a 3-day hike with backcountry camps.

Everything below is also reachable from the hub link above. Tabs: Start, Rundown, Map
(3D, works offline in the Android app), Panning, Playground, Fish & crawdads, Buy list,
Who has what, Files. No download needed.

## What's here

| File | What it is |
|---|---|
| [index.html](https://hearnoevil343.github.io/guys-ga-trip/) | The hub — rundown, live map, and buy list in one page |
| [RUNDOWN.html](https://hearnoevil343.github.io/guys-ga-trip/RUNDOWN.html) | Day-by-day guide: where we go, when, what it costs |
| [map/map3d.html](https://hearnoevil343.github.io/guys-ga-trip/map/map3d.html) | The 3D map (the hub's Map tab): terrain, the route day by day, a GPS dot, and offline tiles inside the Android app |
| [map/trip-map.html](https://hearnoevil343.github.io/guys-ga-trip/map/trip-map.html) | The 2D detail map — every pan spot, trail, campsite, private-land tint, and the wilderness boundaries you may **not** pan in |
| `app/` | The Android app (Capacitor): the whole hub, both maps and the offline tiles in one install |
| `map/data/playground-area.json` | The hike area as a playground: every named creek, trail, forest road and junction, with the branch options at each camp |
| `ISSUES.md` | Numbered open issues with symptom, evidence, cause and status |side |
| [BUY_LIST.md](BUY_LIST.md) | What to buy, sorted by lead time. Cottage-made gear first — order that now |
| `Gear_Picker.xlsx` | Pick your own gear tier (Budget / Value / Premium) and watch pack weight and cost update |
| `map/trip.gpx` | Waypoints and routes for Gaia GPS, CalTopo, or OnX — works offline in the field |
| `PLAN.md` | The working plan and what's still open |
| `research/` | Source research behind every call: panning legality, spots, geology, routes, gear tiers |

## The trip in one paragraph

Arrive Thursday Oct 15 at 1 PM, out Wednesday Oct 21 at noon. Base camp at Vogel: five
of us, 2 vehicles and 2 tents on a site whose own cap is 6 people. Days are a mix of
drive-up panning, waterfalls and the Consolidated Gold Mine tour in Dahlonega. The
centrepiece is a one-way 3-day / 2-night hike, Sat Oct 17 – Mon Oct 19: truck to the
West Fork Wolf Creek crossing, pan, up over Calf Stomp Gap to camp on Calf Stump Branch,
then the ridge west and off-trail down to a road-free reach of the East Fork Coosa Creek,
and out on Monday to a second truck staged at Owltown Gap. 8.6 miles of walking, a new
camp every night, and a pan at each one. Tuesday Oct 20 is free — the hub's Playground
tab holds the ready-made plans. Pack weight and cost come from your own picks in the Buy
list tab; the all-Value default is about 18 lb worn and packed.

## Read this before you pan anywhere

Gold panning is **illegal inside state parks and designated wilderness areas.** The map
flags those boundaries in red and puts a warning banner on any spot that falls inside
one. Some spots still need a ranger call to confirm — those are marked "NEEDS A RANGER
CALL" on the map. Don't freelance: if it isn't green on the map, check first.

## Rebuilding

Nothing here is hand-edited — every page is generated from the data files. Run the
builders in this order; skipping one leaves a later page stale.

```
node map/data/_build_days.mjs          # the baseline day-by-day geometry
node map/data/_build_backcountry.mjs   # rewrites it into the decided route
node map/data/_build_playground.mjs    # the hike-area playground layer
node map/build-map.mjs                 # 2D detail map + trip.gpx
node map/build-map3d.mjs               # the 3D map's data
python tools/build_gear_picker.py      # Gear_Picker.xlsx
python tools/build_buy_list.py         # BUY_LIST.md
python tools/build_rundown.py          # RUNDOWN.html from RUNDOWN.md
python tools/build_hub.py              # index.html (refuses to build on a stale RUNDOWN.html)
```

No npm install needed — the Node scripts use only built-ins (MapLibre and Leaflet are
vendored or loaded from a CDN). The Python ones need `openpyxl` and `markdown`.

See [TOOLS.md](TOOLS.md) for what each script does and its current status, and
[ISSUES.md](ISSUES.md) for what is still open.
