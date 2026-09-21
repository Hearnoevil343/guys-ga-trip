# GA Gold Trip — Spots v2 (breadth pass)
Compiled 2026-09-21, extending `spots-geology.md` and `verification.md` (read those first for legality baseline, geology primer, and campfire history — not repeated here). This pass adds ~25 new candidates for breadth, corrects the Frogtown Creek question, and adds a full excluded/X list so the group can see exactly what's off-limits and why. Full structured data (coords, sources, coord_source, confidence) is in `map/data/spots.json` — this file is the readable companion.

**Drive times are EST (estimated from road geometry), not live-routed** — verify day-of. **Coordinates are sourced per-entry** from OSM Nominatim, USFS/recreation.gov pages, Wikimedia Commons geotags, or thediggings.com/mindat — never invented; where no source was found, coordinates are left null and flagged.

---

## KEY CORRECTION FROM PRIOR RESEARCH

**Frogtown Creek is confirmed.** It's the Lumpkin Co. creek along US-129 south of Neel Gap, and the USFS **DeSoto Falls Recreation Area** sits directly on it (18 mi north of Dahlonega, 19 mi west of Helen). The recreation.gov/USFS listing explicitly names **"Gold Panning"** as a permitted activity there. This is now Tier A — closest well-documented option to Vogel (~15 min EST). [recreation.gov](https://www.recreation.gov/camping/campgrounds/240242), [USFS](https://www.fs.usda.gov/news/conf/recreation/?recid=10524), [Wikipedia](https://en.wikipedia.org/wiki/DeSoto_Falls_(Georgia))

**Note:** exact GPS pin for the DeSoto Falls turn-in was not returned by OSM in this pass — get the recreation.gov pin or a ranger-confirmed coordinate before the trip (see spots.json note on `desoto-frogtown`).

---

## TIER A — Best (7)

| Name | Stream | County | Drive EST | Access | Key note |
|---|---|---|---|---|---|
| DeSoto Falls Rec Area / Frogtown Creek | Frogtown Creek | Lumpkin | 15 min | US-129 S of Neel Gap, paved pull-in | USFS explicitly lists gold panning as an activity |
| Cooper Creek Recreation Area | Cooper Creek | Union | 40 min | GA-60/FS-236 | Popular campground, thin panning pressure |
| Upper Chattahoochee / FS-44 | Chattahoochee R. (headwaters) | White | 38 min | GA-75 to FS-44 gravel rd | Stop at campground gate — Mark Trail Wilderness starts above it |
| Yahoola Creek Park | Yahoola Creek | Lumpkin | 38 min | 1166 Captain McDonald Rd, county park | "4,000 miners" creek of the 1830 rush; call county parks to confirm current rule |
| Tesnatee Creek at Tesnatee Gap | Tesnatee Creek | Union/White | 22 min | Richard Russell Scenic Hwy (GA-348) pull-off | Closest option to Vogel besides Frogtown |
| Dukes Creek Falls (NF trail) | Dukes Creek | White | 38 min | $4/vehicle USFS trailhead, 2.5 mi RT trail | NF side only — do not cross into Smithgall Woods (banned) |
| Coosa Creek near Blairsville | Coosa Creek | Union | 25 min | Local rds NW of Blairsville | Historic Coosa Mine reportedly produced $2M+ in gold — **needs ranger call** on exact legal reach |

## TIER B — Good (14, includes pay-to-pan/club-claim/history sites)

| Name | Type | County | Drive EST | Note |
|---|---|---|---|---|
| Nimblewill Creek | drive-up | Lumpkin | 55 min | Historic mining branch off Nimblewill Church Rd |
| Jones Creek | drive-up | Lumpkin | 58 min | Same forest-road system as Nimblewill |
| Boggs Creek (lower reach) | drive-up | White | 38 min | Stay below Raven Cliffs Wilderness boundary — unverified exact mileage |
| Wolf Creek / Auraria cluster | walk-in | Lumpkin | 55 min | Different creek from the Blood Mtn Wilderness "Wolf Creek" — least-verified access point on the list |
| Chestatee River @ US-19 bridge | drive-up | Lumpkin | 45 min | Easy, well-known, moderate-high pressure |
| Waters Creek / Dicks Creek | drive-up+walk | Lumpkin | 45 min | Stay outside Waters Creek trophy-water boundary |
| Town Creek near Blairsville | drive-up | Union | 22 min | Least documented Union Co. entry — scout only |
| Owltown Creek / Trackrock Gap | drive-up | Union | 28 min | Historic Summerour-brothers placer district; petroglyph site nearby (look, don't dig there) |
| Persimmon Creek | drive-up | Towns | 33 min | **Weakest-verified entry** — no coords, no gold record found |
| LDMA Loud Mine Camp | club-claim | White | 48 min | Public "Gold Diggin's Spooktacular" event Oct 13-17, 2026 overlaps trip start — call to confirm fee/access |
| Crisson Gold Mine | pay-to-pan | Lumpkin | 42 min | Guaranteed color, $15.95-$37.95 per person |
| Consolidated Gold Mine | pay-to-pan | Lumpkin | 42 min | Underground tour + panning, $24.95+ |
| Auraria Ghost Town | history-site | Lumpkin | 55 min | Roadside ruins, pairs with Wolf Creek stop |
| Dahlonega Gold Museum SHS | history-site | Lumpkin | 40 min | Museum only, no panning on-site |

## TIER C — Backup / distance-stretch (10)

| Name | County | Drive EST | Why C-tier |
|---|---|---|---|
| Cartecay River | Gilmer | 85 min | Outside core belt, thin gold record |
| Coleman River Scenic Area | Rabun | 90 min | Remote, Scenic-Area panning status needs ranger confirm |
| Warwoman Creek / Dell | Rabun | 95 min | Anecdotal-only forum source, near edge of drive window |
| Wildcat Creek | Rabun | 90 min | No specific record found |
| Amicalola Creek (below falls) | Dawson | 60 min | Stay clear of state-park boundary |
| Toccoa River / Deep Hole | Fannin | 65 min | Outside core belt, unverified gold record |
| Noontootla Creek | Fannin | 68 min | Fragile special-reg trout fishery — courtesy caution, not recommended target |
| Owl Creek (Helen) | White | 35 min | Single 2011 forum mention, no coordinates found |
| Sarah's Creek | Rabun | 100 min | At/past the practical drive limit |
| Calhoun Mine ruins | Lumpkin | 42 min | History stop; access unverified |

## TIER X — Excluded (7, with reason)

| Name | Reason |
|---|---|
| Upper Chattahoochee above FS-44 campground | Mark Trail Wilderness |
| Boggs Creek upper reach | Raven Cliffs Wilderness |
| Smithgall Woods / Dukes Creek (park section) | State park, mineral extraction banned |
| Vogel State Park (all streams) | State park rule — no panning anywhere in the park, including base camp itself |
| Wolf Creek/Wolf Branch fords, Coosa Backcountry Trail east end | Blood Mountain Wilderness (~1.25 mi of trail) |
| Dawson Forest WMA, City of Atlanta tract | Panning banned on Atlanta-owned land since 2011 ordinance; other Dawson Forest parcels unverified |
| Gold 'n Gem Grubbin' (Cleveland) | **RESOLVED**: confirmed closed to visitors 2026, online-only now |

---

## SPOTS NEEDING A RANGER/OFFICE CALL BEFORE THE TRIP

1. **Coosa Creek near Blairsville** — confirm Coosa Bald National Scenic Area panning legality and locate the actual historic Coosa Mine reach vs. the upper-creek OSM point. Blue Ridge RD (706) 745-6928.
2. **Boggs Creek** — exact trail mileage of the Raven Cliffs Wilderness boundary; coordinates in this pass are unverified/approximate.
3. **Waters Creek/Dicks Creek** — whether non-angler panning is restricted inside the Chestatee WMA trophy-water boundary. GA DNR Gainesville office.
4. **Dawson Forest/Etowah River** — map which river bars sit on the banned City-of-Atlanta tract vs. other ownership, if the group wants to detour there at all.
5. **Coleman River Scenic Area** — confirm panning is allowed in a designated Scenic Area (not Wilderness, but not explicitly addressed by the FAQ either). Chattooga River RD (706) 754-6221.
6. **LDMA Loud Mine** — confirm the Oct 13-17 public event fee/registration and whether it's still open for the Oct 15-17 overlap.
7. **Yahoola Creek Park** — confirm panning is still a tolerated park activity (evidence is reviews, not ordinance). Lumpkin Co. Parks & Rec (706) 864-3622.

## WEAKEST / LOWEST-CONFIDENCE ENTRIES (flagged, keep as bonus/backup only)

Persimmon Creek, Owl Creek (Helen), Wildcat Creek, Wolf Creek/Auraria access point, Calhoun Mine access, Town Creek near Blairsville — each has either no sourced coordinates, no documented gold record, or only a single anecdotal (forum) source. Full detail and exact gaps are in each entry's `notes` field in `spots.json`.

## PHOTOS

Wikimedia Commons file pages were located via the Commons geosearch API for: Upper Chattahoochee (2 photos), Dukes Creek Falls (1), Yahoola Creek Park (1), Consolidated Gold Mine (2), Tesnatee Gap (1), Calhoun Mine (1, NPS 1972). No on-site Commons photos were found for the remaining spots in this pass — the JSON's `photos` array is empty for those; a second pass could search Flickr/other sources if photos are wanted for the whole list. All linked as Commons **file pages** (not hotlinked) per the task's non-free-image caution; check each page for the specific author/license before reuse.
