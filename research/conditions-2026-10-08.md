# Early-October re-check: fire, water, roads, forecast, fees (2026-10-08)

PLAN step 4. Everything below was fetched on **2026-10-08** and is quoted from the page named.
Re-run this file one more time in the two days before Oct 15 — a week-old road or fire line is
not good enough to drive on. Issues this closes: ISSUES #35 (forecast + re-check record) and
ISSUES #36 (fees).

---

## 1. Fire

**Chattahoochee-Oconee National Forest alerts page**
(`fs.usda.gov/r08/chattahoochee-oconee/alerts`, fetched 2026-10-08):

- "Campfire restriction lifted on the Chattahoochee-Oconee National Forest," May 4, 2026 —
  campfires are allowed in designated areas.
- "Spring 2026 Forest-wide Fire Restrictions," April 23, 2026 (Forest Order #08-03-00-26-04) —
  still listed, but superseded for campfires by the May 4 lift.
- "14 Day Camping Limit," May 27, 2026 (Forest Order #08-03-00-25-02) — camping beyond 14 days
  in any 30-day period is prohibited. Our 2 nights are far inside that.
- Fire Danger Status on the page: **Low**.

**Georgia Forestry Commission** (`gatrees.org/burn-permits-and-notifications/`, fetched
2026-10-08): the EPD summer burn ban runs **May 1 to September 30** in 54 northern counties, so
it is **not** in force during the trip. "No permit is required for hand-piled natural
vegetation/yard debris meaning leaf and limbs only." Local ordinances still apply, and the page
says to avoid burning on class 4 or 5 fire-danger days. 1-800-GA-TREES (428-7337).

**Reading:** campfires are legal at Vogel and in the National Forest as of 2026-10-08, with no
ban covering Union County. **Unconfirmed:** whether a new order lands between now and Oct 15 —
that is what the pre-trip re-check is for.

## 2. Roads

From the same alerts page (fetched 2026-10-08), every closure listed and whether it touches us:

| Alert | Road | Touches the plan? |
|---|---|---|
| Tooni Gap Road Closure (Sep 25, 2026) | FS 816 | No |
| Windy Gap Trail System and Muskrat Road (Sep 24, 2026) | FS 218 | No |
| Ruff Creek Intermittent Closures (Sep 16, 2026) | FS 252 | No |
| FS Road 76 (Piney Ridge) (Aug 30, 2026) | FS 76 | No |
| Peavine Sheeds Road (Jul 16, 2026) | FS 221 | No |
| Old CCC Camp Road / FS 18 (Jul 14, 2026) | FS 18 | No |
| Duncan Ridge Road **reopens** following culvert replacement (May 27, 2026) | FSR 39 | Nearby, and it is **open** |
| Grassy Gap - Horseshoe Ridge FSR 55 (Jun 18, 2025) | FSR 55 | No |

**Nothing on the page names FS 107, FS 108, FS 298 (Bowers Road), Duncan Ridge Connector or
Wolf Pen Gap Road.** Absence from an alerts page is not the same as confirmed open: FS 107 is
open first-hand (Jordan, 2026-10-05); FS 108, FS 298 and the Duncan Ridge Connector are still
**unconfirmed** and sit in CALLS.md for the Blue Ridge Ranger District,
**706-745-6928** (the page's own notice "New phone number for Blue Ridge Ranger District,"
March 12, 2026, confirms this number).

## 3. Water

Not re-fetched this pass — October flow in the headwaters is a field question, not a web one.
What stands: the East Fork Coosa Creek headwater flow at CAMP-U and the Calf Stump Branch flow
are both **unconfirmed**, with the written fallback to move down the creek toward
34.7958, -83.9792. See the Trip card's water plan (ISSUES #39) for the carry plan per camp.
No "drinking water unavailable" alert on the forest page touches our area (the two that exist
are Upper Chattahoochee and Andrews Cove campgrounds).

## 4. Forecast

**National Weather Service**, grid **FFC 64,134** (the hike area, 34.7908 -83.9190; the NWS
calls it 9.3 km north of Blairsville GA). Forecast URL for the hub:
`https://forecast.weather.gov/MapClick.php?lat=34.7908&lon=-83.9190`
API: `https://api.weather.gov/gridpoints/FFC/64,134/forecast`

Fetched 2026-10-08 (product updateTime 2026-10-08T21:36:45+00:00):

| Period | Temp | Forecast |
|---|---|---|
| Tonight | 58 F | Mostly Cloudy |
| Friday | 74 F | Mostly Cloudy |
| Friday Night | 54 F | Mostly Cloudy then Chance Rain Showers |
| Saturday | 64 F | Rain Showers |
| Saturday Night | 56 F | Showers And Thunderstorms |
| Sunday | 70 F | Showers And Thunderstorms |
| Sunday Night | 56 F | Chance Rain Showers |
| Columbus Day (Mon Oct 12) | 75 F | Mostly Sunny |

**The forecast does not reach the trip yet.** On 2026-10-08 the NWS 7-day product ends around
Oct 15, and none of the trip days (Oct 15-21) have a usable forecast. This is the honest state:
the first real look at trip weather is about **Oct 11-12**, and the one that matters is
**Oct 14**. The hub carries the link, not a number.

## 5. Sunrise and sunset, Oct 15-21

Source: `api.sunrise-sunset.org` for 34.7659, -83.9254 (Vogel), tz America/New_York, fetched
2026-10-08. Stored machine-readable in `research/sun-times.json`.

Times are truncated to the minute, exactly as `research/sun-times.json` stores them.

| Date | First light (civil) | Sunrise | Sunset | Dark (civil end) |
|---|---|---|---|---|
| Thu Oct 15 | 7:16 AM | 7:40 AM | 7:02 PM | 7:26 PM |
| Fri Oct 16 | 7:17 AM | 7:41 AM | 7:01 PM | 7:25 PM |
| Sat Oct 17 | 7:17 AM | 7:42 AM | 6:59 PM | 7:24 PM |
| Sun Oct 18 | 7:18 AM | 7:42 AM | 6:58 PM | 7:22 PM |
| Mon Oct 19 | 7:19 AM | 7:43 AM | 6:57 PM | 7:21 PM |
| Tue Oct 20 | 7:20 AM | 7:44 AM | 6:56 PM | 7:20 PM |
| Wed Oct 21 | 7:21 AM | 7:45 AM | 6:55 PM | 7:19 PM |

Note: RUNDOWN said "Sunset is about 7:05 PM" for Thursday. It is **7:02 PM**, and it moves
7 minutes earlier across the week. Walking after about 7:20 PM on any trip day is walking in
the dark.

## 6. Fees and permits (ISSUES #36)

| Where | Fee | Source, fetched 2026-10-08 |
|---|---|---|
| Georgia State Parks ParkPass (Vogel) | **$10 daily per vehicle**, $70 annual | gastateparks.org/ParkPass — "just $10 per vehicle", "$70 Annual ParkPass" |
| Vogel walk-in tent site P | **not published**; paid by the primary occupant at booking | gastateparks.org/Vogel lists 18 walk-in sites and no rate. Reservations 1-800-864-7275. **Unconfirmed** |
| Brasstown Bald day use | **$10 per person (16+)**, children 15 and under free, shuttle included | fs.usda.gov Brasstown Bald page — "$10/person (16+) Includes Shuttle and Visitor Center Access" |
| Brasstown Bald after hours | **$6.00 per person (16+)** | same page — "After Hours: $6.00 per person (16+)"; the page does not define the after-hours window |
| Consolidated Gold Mine, underground tour | **Adult $24.95, child (3-12) $15.95**, 2 and under free | consolidatedgoldmine.com |
| Consolidated Gold Mine, gold panning | **"Starting at: $60"** — no adult/child split published | consolidatedgoldmine.com |
| Dahlonega Gold Museum | **Adult $10.00, senior $7.50, youth 6-17 $7.00, 6 and under $3.50** | gastateparks.org/DahlonegaGoldMuseum |
| Coosa Backcountry Trail overnight permit | **unconfirmed** — still a CALLS.md item for Vogel, 706-745-2628 | — |

**The old $5 ParkPass number in RUNDOWN is wrong.** It is $10 per vehicle per day. Overnight
guests pay it once per vehicle for the whole stay (gastateparks.org/Vogel), so with 2 vehicles
at the site that is **$20 for the week**, not per night — still **unconfirmed** for a walk-in
site, worth asking at check-in.

## 7. Hours that constrain the plan

- **Vogel park office:** 8 AM - 5 PM; the park itself is open 7 AM - 10 PM (gastateparks.org/Vogel).
- **Brasstown Bald:** open 7 days, 10 AM - 5 PM. Last shuttle up **4:30 PM**, last return
  **5:00 PM**. After-hours access is a paid $6/person. **The Thursday stargazing plan arrives
  after dark, well outside those hours** — the gate question on Spur 180 (CALLS.md) is still
  open, and the after-hours fee quoted above is the only published thing covering it.
- **Consolidated Gold Mine:** 10 AM - 5 PM, 7 days. Last tour time **not published** — call.
- **Dahlonega Gold Museum:** Mon-Sat 9 AM - 4:45 PM, Sun 10 AM - 4:45 PM.
- **Vogel:** Lake Trahlyta is drained for dam repairs; the Lake Trahlyta Loop Trail and the
  waterfall are closed. "All cabins, campsites, and other park facilities remain fully open."

## What is still unconfirmed after this pass

1. FS 108, FS 298 (Bowers Road), Duncan Ridge Connector: open to vehicles and to public foot use.
2. Bowers Road crossing private land near 34.8064.
3. Coosa Backcountry Trail overnight permit.
4. Vogel walk-in site nightly rate and whether ParkPass is per stay or per night for a walk-in.
5. Brasstown Bald after-hours window and whether the Spur 180 gate is open for late stargazing.
6. Consolidated's last tour time.
7. October flow at Calf Stump Branch and CAMP-U.
8. Trip-week weather — no forecast reaches Oct 15 yet.
