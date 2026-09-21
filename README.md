# Guys GA Trip — October 15–21, 2026

**[→ Open the trip hub](https://hearnoevil343.github.io/guys-ga-trip/)**

Six of us, a week in the north Georgia mountains, panning for gold. Base camp is the
walk-in tent site at Vogel State Park; one night is a hike-in backcountry camp.

Everything below is also reachable from the hub link above — rundown, map, and buy
list as tabs, no download needed.

## What's here

| File | What it is |
|---|---|
| [index.html](https://hearnoevil343.github.io/guys-ga-trip/) | The hub — rundown, live map, and buy list in one page |
| [RUNDOWN.html](https://hearnoevil343.github.io/guys-ga-trip/RUNDOWN.html) | Day-by-day guide: where we go, when, what it costs |
| [map/trip-map.html](https://hearnoevil343.github.io/guys-ga-trip/map/trip-map.html) | Interactive map — every pan spot, trail, campsite, and the wilderness boundaries you may **not** pan inside |
| [BUY_LIST.md](BUY_LIST.md) | What to buy, sorted by lead time. Cottage-made gear first — order that now |
| `Gear_Picker.xlsx` | Pick your own gear tier (Budget / Value / Premium) and watch pack weight and cost update |
| `map/trip.gpx` | Waypoints and routes for Gaia GPS, CalTopo, or OnX — works offline in the field |
| `PLAN.md` | The working plan and what's still open |
| `research/` | Source research behind every call: panning legality, spots, geology, routes, gear tiers |

## The trip in one paragraph

Arrive Thursday Oct 15 at 1 PM, out Wednesday Oct 21 at noon. Base camp at Vogel
(2 vehicles, 2 tents, 6 people max). Days are a mix of drive-up panning, low-pressure
creeks, and the Consolidated Gold Mine tour in Dahlonega. One backcountry overnight:
hike in, pan, camp, pan, hike out — light packs, about 12.8 lb base weight.

## Read this before you pan anywhere

Gold panning is **illegal inside state parks and designated wilderness areas.** The map
flags those boundaries in red and puts a warning banner on any spot that falls inside
one. Some spots still need a ranger call to confirm — those are marked "NEEDS A RANGER
CALL" on the map. Don't freelance: if it isn't green on the map, check first.

## Rebuilding the map

The map is generated, not hand-edited. Edit the data files under `map/data/`, then:

```
node map/build-map.mjs
```

No npm install needed — it uses only Node built-ins and loads Leaflet from a CDN.
It rewrites `map/trip-map.html` and `map/trip.gpx`.

The gear sheet and buy list are generated the same way:

```
python tools/build_gear_picker.py
python tools/build_buy_list.py
```

See [TOOLS.md](TOOLS.md) for what each script does and its current status.
