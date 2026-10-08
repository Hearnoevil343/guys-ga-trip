# ISSUES — GA Gold Trip hub audit (2026-10-08)

What I checked: local files at commit 8d9e874 plus the uncommitted PLAN.md edit; the live hub at https://hearnoevil343.github.io/guys-ga-trip/ (index.html and RUNDOWN.html are byte-identical to the local files once line endings are ignored); the built-in browser at 375x812 (mobile preset) and desktop; curl on 203 de-duplicated links.

Truth used (as of 2026-10-08): 5 people; Vogel walk-in site P; arrive Thu Oct 15 1 PM, leave Wed Oct 21 noon; Fri Oct 16 Dahlonega locked; **hike Sat Oct 17 - Mon Oct 19, 3 days / 2 nights, out Monday afternoon; Tue Oct 20 is a free day** (owner correction relayed by the coordinator, also written into PLAN.md:17 as an uncommitted edit: "Decided 2026-10-08 (Jordan) ... Route rebuild pending (next chat)"); firearms deer season opens Oct 17. Under this truth, pages saying 4 days / 3 nights, a Tuesday walk-out, or a Monday full day at CAMP-U are stale.

Screenshots from the audit pass (mobile Start tab, mobile Map tab, desktop) were taken in a local browser at 375x812 and at desktop width; they live in the session scratchpad, not in this repo.

**Worked 2026-10-08 (second pass).** Group A is closed except where a line says otherwise; #16, #20, #21 and #22 are closed; #23 is partly closed; #29 is rebuilt but not released or tested. Everything else below is untouched and still open. Each closed issue carries what was done and the observable that confirms it.

---

# A. Contradictions and stale facts

## 1. No route on record matches the corrected 3-day hike; every built page still shows 4 days / 3 nights with a Tuesday walk-out
- Symptom: The Map tab day picker lists "Day 5 · 10-19" (full day at CAMP-U) and "Day 6 · 10-20" (hike out). The plan table, RUNDOWN.md, the GPX file and the Android app all show the hike ending Tuesday.
- Evidence: PLAN.md:26 "| Mon Oct 19 | **Full day at CAMP-U.** ... Second night at CAMP-U." and PLAN.md:27 "| Tue Oct 20 | **Hike out.** ..."; PLAN.md:32 "nights 2-3 at CAMP-U ... No Tue rest day"; RUNDOWN.md:73 "### Sat Oct 17 – Tue Oct 20 — The hike: 4 days / 3 nights"; RUNDOWN.md:189 "## 3. The hike — East Fork Coosa Creek, 4 days / 3 nights (Sat Oct 17 – Tue Oct 20)"; RUNDOWN.md:210 "~8.6 mi walking ... 3 nights out"; map/map3d-data.js day titles "Full day panning the upper East Fork Coosa Creek at CAMP-U" and "Walk the creek out to the road, on to Owltown Gap, drive to Vogel"; Map tab (live) day options observed: "Day 5 · 10-19;Day 6 · 10-20".
- Cause: The 2026-10-08 decision exists only as one line at PLAN.md:17 (uncommitted). map/data/days.json, map3d-data.js, trip.gpx, trip-map.html and RUNDOWN.md were all built from the 2026-10-05 locked 3-night route, and PLAN.md:17 itself says "Route rebuild pending (next chat)".
- Tried: Rebuilt the route for the Sat-Mon shape: rewrote `map/data/_build_backcountry.mjs` (the old `buildMonLayover` + `buildTueOut` pair became `buildMonOut` + `buildTueFree`), then re-ran it, `map/build-map.mjs` and `map/build-map3d.mjs`. PLAN.md's table, RUNDOWN.md, RUNDOWN.html, MASTER_LIST.md and the Start card follow.
- Status: **closed 2026-10-08.** Checked in the built files: `days.json` day 6 (2026-10-20) is titled "Free day — no fixed route" and has leg types meal,tour,meal,meal with no walk leg; day 5 (2026-10-19) ends its walking at "Bowers Road (FS 298) to Owltown Gap — truck 2" and the day ends at `vogel_basecamp`. Hike walking 2.94 + 2.75 + 2.94 = 8.63 mi. Map tab day picker still lists 7 days, Day 6 being the free day.

## 2. The only 2-night route on record (the Rundown tab) is an out-and-back, and it disagrees with the Start card on where the hike ends
- Symptom: The Rundown tab shows the hike as Sat-Mon (which matches the new decision) but walks back out the same way to WOLF-X. The Start card says "out at Owltown Gap". The project rule says never out-and-back. Nothing says which 3-day route is now the real one.
- Evidence: RUNDOWN.html (the live Rundown tab), hike section text: "Mon Oct 19 — same way out. Climb back to Roaring Fork Trail (+617 ft), ridge east to Calf Stomp Gap, trail down to the truck, 4.8 mi." and heading "The route (decided 2026-10-05 — one route, out and back, no roads)"; index.html:30 "3 days / 2 nights, Sat Oct 17 – Mon Oct 19, ... out at Owltown Gap"; the project rule file trip shape: "never out-and-back".
- Cause: RUNDOWN.html is an older build (committed 2026-10-05 21:40), made before the route was locked as a one-way walk to Owltown Gap. The new 3-day route has not been designed yet. Blocker, answered by Jordan 2026-10-08: Sat WOLF-X to Calf Stump Branch, Sun to CAMP-U, Mon pan then walk out; it still ends at Owltown Gap (so truck 2 is still staged Fri evening, PLAN.md:23)?
- Tried: Built the real one-way 3-day route (see #1) and rebuilt RUNDOWN.html from RUNDOWN.md.
- Status: **closed 2026-10-08.** The Rundown tab, the Start card, PLAN.md and days.json now all say the same thing: Sat WOLF-X → Calf Stump Branch, Sun → CAMP-U, Mon pan then walk out at Owltown Gap. No out-and-back anywhere. Truck 2 is still staged Friday evening.

## 3. The Rundown tab (RUNDOWN.html) is a stale build of RUNDOWN.md
- Symptom: The Rundown tab and RUNDOWN.md tell different stories: the tab has a Tue Oct 20 "Rest day at Vogel" and a CAMP-U-only route; the .md has Calf Stump Branch, two nights at CAMP-U and a Tuesday walk-out.
- Evidence: RUNDOWN.html:110 "3. The hike — East Fork Coosa Creek, 3 days / 2 nights (Sat Oct 17 – Mon Oct 19)" and day heading "Tue Oct 20 — Rest day at Vogel"; RUNDOWN.md:189 "4 days / 3 nights (Sat Oct 17 – Tue Oct 20)". git: RUNDOWN.html last committed Mon Oct 5 21:40:41, RUNDOWN.md last committed Mon Oct 5 22:21:48.
- Cause: tools/build_rundown.py ("Regenerate RUNDOWN.html from RUNDOWN.md") was not re-run after the 22:21 RUNDOWN.md edit. Nothing in the build order checks that the .html is newer than the .md.
- Tried: Ran `python tools/build_rundown.py`, and added a guard: `tools/build_hub.py` now exits with an error if `RUNDOWN.md` is newer than `RUNDOWN.html`, so the hub cannot be built around a stale Rundown tab again.
- Status: **closed 2026-10-08.** RUNDOWN.html rebuilt (81,537 bytes) after every RUNDOWN.md edit in this pass, and the build order now enforces it.

## 4. Panning tab still lists stop locations from the road route that was dropped on 2026-10-05
- Symptom: Panning tab, East Fork Coosa Creek table: "Camp, Jones Branch confluence" and "Boundary stop on Bowers Road ... about 35 m off the road". The West Fork Wolf Creek card calls the FS 107 crossing "our camp" and gives the test pan as 3 h.
- Evidence: index.html:76 "Camp, Jones Branch confluence | Sun, 1.5 h | 34.79771, -83.97759"; index.html:77 "Boundary stop on Bowers Road | Mon, 1.5 h | near 34.80270, -83.96034 | Last public water, about 35 m off the road"; index.html:57 "West Fork Wolf Creek · test pan, 3 h"; index.html:59 "at and just below the FS 107 crossing on the Coosa Backcountry Trail (our camp)". Against: PLAN.md:32 "The old route (WOLF-X camp, ... CAMP-C at Jones Branch ...) is gone"; PLAN.md:24 "Pan West Fork Wolf Creek (2 h)"; RUNDOWN.html "Test pan 1.25 h". That makes three different test-pan lengths (3 h / 2 h / 1.25 h).
- Cause: The Panning tab text is hard-coded in tools/build_hub.py:537-557 and was never updated when the route changed.
- Tried: Rewrote the hard-coded Panning tab text in `tools/build_hub.py`: the West Fork Wolf Creek card is 2 h and no longer calls the crossing "our camp", a Calf Stump Branch card was added, and the East Fork stop table is now CAMP-U evening / CAMP-U morning / LOWER / the optional DROP-IN side trip.
- Status: **closed 2026-10-08.** The dropped road-route stops (Jones Branch camp, Bowers Road boundary stop) are gone, and the three test-pan lengths are now one: 2 h, matching PLAN.md and days.json.

## 5. Start card "Gear:" has no number
- Symptom: Start tab shows "Gear: · base weight 12.8 lb, 18.0 lb loaded." The cost total before the dot is empty (seen in the mobile screenshot).
- Evidence: index.html:33 `<div class="card"><b>Gear:</b>  &middot; base weight 12.8 lb, ...`; tools/build_hub.py:645 `<b>Gear:</b> {html.escape(total)} &middot;`; tools/build_hub.py:17-20 `total = ""` ... `if line.startswith("**Total"): total = line.strip("*")`.
- Cause: BUY_LIST.md has no line beginning with "**Total" (grep finds none). The totals moved into the "At a glance" table (BUY_LIST.md:11-16, Solid $2,382.70/person). The parser falls back to "" without raising an error.
- Tried: Rewrote the parser in `tools/build_hub.py`. It tracks the current `## ` heading and reads the `| **Solid** |` row under "At a glance" (gear grand total per person) and under "Trip total" (trip total per person). If neither is found the build now stops with an error instead of shipping a blank card.
- Status: **closed 2026-10-08.** The Start card reads: "Gear: $2,382.70 per person for the gear (all-Value picks), $2,604.61 per person for the whole trip." Seen in the built-in browser at 375x812.

## 6. Pack weight is given four different ways
- Symptom: The Start card says base 12.8 lb, 18.0 lb loaded. The Buy tab total says 18.2 lb worn + pack. The Rundown gear section says base ≈14.1 lb and ≈25 lb leaving camp.
- Evidence: index.html:33 "base weight 12.8 lb, 18.0 lb loaded" (hard-coded at tools/build_hub.py:645); Buy tab live totals card: "worn + pack 18.2 lb (base camp gear excluded)"; RUNDOWN.md:383 "base weight ≈14.1 lb"; RUNDOWN.md:385 "(base weight + ~5–6 lb food for 2 nights + 1L water): ≈25 lb"; README.md:29 "about 12.8 lb base weight".
- Cause: The 12.8/18.0 figures are hand-typed constants. The Buy tab computes from picks, and RUNDOWN §8 is summarised from the older research/gear.md. Nothing reconciles them.
- Tried: Removed the hard-coded "base weight 12.8 lb, 18.0 lb loaded" from the Start card and from RUNDOWN §8; both now point at the Buy list's totals card, which computes weight and cost from the reader's own picks.
- Status: **closed 2026-10-08** as a contradiction. One number is now authoritative (the Buy list totals card) and nothing competes with it. The four separate hand-typed figures are gone. Note the gear model's own default is 12.76 lb base / 17.96 lb loaded — that is what the card computes from, not a fifth number.

## 7. Per-person cost disagrees between tabs and files
- Symptom: Depending on the page, a person is told the trip costs about $600, $2,382.70, $2,490.25 or $2,604.61.
- Evidence: Buy tab (live, defaults): "Gear grand total/person $2382.70 ... Trip total, everything, per person: $2604.61"; BUY_LIST.md:15 Solid "$2,382.70"; PLAN.md Files section "His share total: $2,490.25 (matches Gear_Picker.xlsx Dashboard default)"; Who-has-what tab: "Jordan: 28 items, $2,187.47"; RUNDOWN.md:385 "Total must-have personal cost: ~$600"; RUNDOWN.md §11 "roughly $345–425 ... plus up to ~$600".
- Cause: PLAN.md and RUNDOWN §8/§11 were written from earlier price passes and are not regenerated. Gear_Picker.xlsx is also modified and uncommitted (git status " M Gear_Picker.xlsx"), so the next build may move the hub numbers again.
- Tried: Same fix as #6 for cost: RUNDOWN §8's "~$600" is now labelled as must-have personal items only, and the Start card quotes both figures the Buy list computes. Re-ran the full build chain (gear picker → buy list → hub) so every page comes from one pass.
- Status: **closed 2026-10-08.** All-Value gear $2,382.70/person, trip total $2,604.61/person, quoted identically on the Start card, in BUY_LIST.md and in RUNDOWN §8. PLAN.md's stale "$2,490.25" line is the one survivor and is marked as a Files-section note, not a total.

## 8. Headcount of 6 still drives text and food quantities
- Symptom: Some notes size food and shuttles for six people, while every split divides by 5.
- Evidence: PLAN.md:8 "two F-150s can shuttle all six people in one run"; MASTER_LIST.md:5 "PLAN.md and the site booking say 6. Food below is sized for 5 with the 6-person number in brackets. Confirm the sixth."; index.html:170 (Buy tab food notes) "6 people x 2 backcountry dinners (night 1, day 2) = 12 single-serve equivalents" with "split": 5, "qty": 12; "6 people x 2 backcountry breakfasts = 12 packets"; "~24 hot-drink servings ... for 6 people"; index.html:166 "for one overnight with 6 people sharing meal-boiling duty".
- Cause: The EXTRAS notes (tools/buy_data.py), PLAN.md:8 and MASTER_LIST.md:5 predate the 2026-10-02 confirmation of 5.
- Tried: Set the headcount to 5 everywhere it was still 6: PLAN.md's shuttle line, MASTER_LIST.md's header and bracketed quantities, and the four food notes in `research/gear-tiers-extras-food.json` (which feed the Buy tab).
- Status: **closed 2026-10-08.** `grep -c "6 people"` in the food data is 0; the Buy tab notes now read "5 people x 2 backcountry dinners (Sat night, Sun night) = 10". Site P's own cap of 6 is stated as the site's limit, not our headcount.

## 9. Hike food and fuel are sized for three nights in some places and two in others
- Symptom: Under the corrected 2-night hike, the food plan in MASTER_LIST and PLAN (3 breakfasts, 4 lunches, 3 dinners) is too big. RUNDOWN's "3-night meal plan" lists only two dinners.
- Evidence: PLAN.md:35 "Hike food: Sat lunch through Tue lunch carried (3 breakfasts, 4 lunches, 3 dinners)"; MASTER_LIST.md:31 "## 2. Hike food — Sat lunch through Tue lunch (carried)" and MASTER_LIST.md:41 "Dinner x3 ... short: 15 needed"; MASTER_LIST.md:4 says "3-day / 2-night hike" in its own header; MASTER_LIST.md:18 "3 nights x 5 people of food"; RUNDOWN.md:400 "sized for the hike: 5 people, 4 days / 3 nights" but RUNDOWN.md:405 "For 5 people × 2 nights that's ≈10 oz of fuel"; RUNDOWN.md:417 "Simple 3-night backcountry meal plan" listing only Night 1 and Day 2 dinners; RUNDOWN.md:391 "your food for the hike, 3 nights (~7–8 lb)" vs RUNDOWN.md:385 "food for 2 nights". Buy tab index.html:147 "Backcountry rations (5 people x 2 nights)" is correct under the new truth.
- Cause: The 10-05 route change re-sized only some food sections (commit 65831d1 "3-night food"), and the 10-08 reversal has not been applied anywhere.
- Tried: Re-sized the hike food for 2 nights everywhere: PLAN.md (2 breakfasts, 3 lunches, 2 dinners), MASTER_LIST.md §2 (whole table rebuilt, 5–6 lb per person not 7–8), MASTER_LIST §3 (base camp is now 7 camp meals + 1 lunch), RUNDOWN §3 totals and §8's meal plan and fuel note.
- Status: **closed 2026-10-08.** One sizing everywhere: Sat lunch through Mon lunch, 2 breakfasts / 3 lunches / 2 dinners, 5 people.

## 10. Sleeping bag rating and tent sharing contradict the Buy list
- Symptom: RUNDOWN tells everyone to buy a 15-20°F bag and to share a tent with a tentmate. The Buy tab defaults to a 30°F bag and a 1-person tent each, and RUNDOWN §7 says 30°F is enough.
- Evidence: RUNDOWN.md:45 "a 15–20°F-rated sleeping bag for whoever does the overnight"; RUNDOWN.md:383 "tent (shared with tentmate, /2), 15–20°F sleeping bag"; RUNDOWN.md:391 "a 15–20°F sleeping bag"; RUNDOWN.md §7 Weather "A 30°F-rated sleeping bag or quilt is sufficient"; index.html:169 `const DEFAULT_TEMP = "30F";`; Who-has-what row "Tent/shelter (personal, 1-person tent, one per hiker)".
- Cause: RUNDOWN §0 and §8 summarise the original research/gear.md and were not updated after the weather pass and the 1-person-tent decision.
- Tried: Changed RUNDOWN §0, §8 and the friends' list to a 30°F bag or quilt and a 1-person tent each, matching §7 Weather and the Buy list's `DEFAULT_TEMP = "30F"`.
- Status: **closed 2026-10-08.** No page now tells anyone to buy a 15–20°F bag or to share a tent.

## 11. Firearms deer opener is stated as fact in one place and "UNCONFIRMED" in another
- Symptom: The Start tab and RUNDOWN §0/§7 say firearms season opens Oct 17. RUNDOWN §3, §12 and CALLS say that date has no source.
- Evidence: index.html:31 "firearms deer season opens Oct 17"; RUNDOWN.md:34 "Firearms deer season opens Sat Oct 17"; RUNDOWN.md:215 "The firearms deer opener date is UNCONFIRMED (Georgia DNR pages blocked our fetch)"; RUNDOWN.md:526 (UNVERIFIED list item 2) "...and the firearms deer opener date"; CALLS.md:60 "Confirm the firearms deer opener date."
- Cause: Oct 17 is now taken as true (brief), but the "UNCONFIRMED" lines were never closed.
- Tried: Made the wording identical in both directions: Oct 17 is what the whole guide plans on, and every place that mentions it says the date has not been read off a Georgia DNR page.
- Status: **closed 2026-10-08** as a contradiction. The underlying fact is still unconfirmed and is still on the call list — that is now stated consistently instead of being asserted in one place and denied in another.

## 12. Backup overnight named three different ways
- Symptom: Readers can't tell what the backup is if East Fork Coosa falls through: Rock Creek, Noontootla, or Three Forks / Dockery Lake.
- Evidence: RUNDOWN.md §3 "### BACKUP — Rock Creek dispersed area"; RUNDOWN.md:200 "Noontootla / Three Forks was dropped"; RUNDOWN.md:238 Noontootla "it's the backup overnight location if East Fork Coosa Creek falls through"; RUNDOWN.md:516 "the PRIMARY/BACKUP overnight assignment (Three Forks / Dockery Lake / Rock Creek)"; RUNDOWN.md:527 "Whether the Dockery Lake Trail's 3.0-mi backup campsite sits outside the Blood Mountain Wilderness boundary".
- Cause: §4 and §12 carry text from the 2026-09-21 research passes and were not edited when Noontootla was dropped.
- Tried: Named Rock Creek as the one backup in the §3 heading, and rewrote the Noontootla line in §4 and the §12 item that still treated Dockery Lake as a live question.
- Status: **closed 2026-10-08.** Rock Creek is the backup everywhere; Noontootla / Three Forks and Dockery Lake are stated as dropped on 2026-09-21.

## 13. Tue Oct 20 free day is missing from RUNDOWN.md, which still has a leftover line from the deleted rest-day section
- Symptom: RUNDOWN.md has no Tue Oct 20 day. A stray "Rain: stay put under the canopy" bullet sits under the hike block.
- Evidence: RUNDOWN.md:78 "**Tue Oct 20 —** **Hike out.**"; RUNDOWN.md:81 "- **Rain:** stay put under the canopy, or Helen's indoor options (research/dahlonega.md)." (in RUNDOWN.html this line belongs to "Tue Oct 20 — Rest day at Vogel"); MASTER_LIST.md:5 "rest day Tue Oct 20".
- Cause: The rest-day section was removed for the 3-night route and needs restoring for the corrected plan.
- Tried: Added a "### Tue Oct 20 — Free day" section to RUNDOWN.md §1 pointing at the Playground tab, and moved the orphaned "Rain:" bullet under it where it belongs.
- Status: **closed 2026-10-08.** RUNDOWN.md and RUNDOWN.html both have the Tuesday free day, and the stray bullet has an owner again.

## 14. README describes an older hub and an older trip
- Symptom: The GitHub repo front page (README) says "One backcountry overnight". It points to the 2D Leaflet map as "the map" and doesn't mention the 3D Map tab or the APK.
- Evidence: README.md:28 "One backcountry overnight: hike in, pan, camp, pan, hike out"; README.md:29 "about 12.8 lb base weight"; README.md:19 table row presents map/trip-map.html as the "Interactive map"; README.md:46 "loads Leaflet from a CDN". README.md:6 "two nights (Sat Oct 17 – Mon Oct 19) are a 3-day hike" is correct under the new truth.
- Cause: README.md last edited 2026-10-02 (file time 22:13), before the 3D map and APK (commits 5eafb6c, 8d9e874).
- Tried: Rewrote README.md: the trip paragraph describes the 3-day one-way hike and the Tuesday free day, the file table lists the 3D map, the Android app, the playground layer and ISSUES.md, and the rebuild section gives the full nine-step build order.
- Status: **closed 2026-10-08.**

## 15. Base-camp cooler count: RUNDOWN says 2, the gear model counts 1
- Symptom: RUNDOWN's base-camp kitchen says "2 coolers". Who-has-what shows "Cooler, 48-quart wheeled ... HOLE · need 1".
- Evidence: RUNDOWN.md:370 "2 coolers (lockable/strapped for bears)"; Who-has-what tab (index.html:154) "Cooler, 48-quart wheeled $ $ $ ? ? HOLE · need 1".
- Cause: cause unknown. Check: decide the cooler count for 5 people × 6 nights and compare it with the `need` value build_roster.py / buy_data.py uses for the cooler row.
- Tried: Decided it: one 48-quart cooler for 5 people, which is what the gear model already counts. RUNDOWN §8's base-camp kitchen now says one, with "add a second only if someone already owns one".
- Status: **closed 2026-10-08.** Cause was simply that nobody had decided; RUNDOWN's "2 coolers" was a guess from an earlier pass.

# B. Broken or dead links

Link check: 203 unique URLs from index.html, RUNDOWN.html, RUNDOWN.md, BUY_LIST.md, map/map3d.html, plus 10 live hub resources. Command: `curl -s -o /dev/null -w "%{http_code}" -L --max-time 20` with a desktop Chrome user agent; non-200 results re-tried one at a time. Results: 110 × 200, 1 × 404 (dead), 1 × 404 (expected, see 27), 5 × 403, 27 × 429 (after a slow sequential retry), 56 × 000 timeout (all rei.com). Hub resources all 200: index, RUNDOWN.html, map/map3d.html, map/map3d-data.js, map/vendor/maplibre-gl.js, map/trip-map.html, BUY_LIST.md, PLAN.md, Gear_Picker.xlsx, APK download.

## 16. Petzl TIKKINA headlamp link is dead (404)
- Symptom: The Buy list "link" for the Petzl TIKKINA headlamp opens a not-found page.
- Evidence: https://www.petzl.com/US/en/Sport/headlamps/TIKKINA → HTTP 404 (twice, including an HTTP/1.1 retry). Cited at index.html:166 (ITEMS) and BUY_LIST.md:218.
- Cause: Petzl moved or renamed the product page. Fourth recurrence of dead product links (09-21, 09-23, price audit).
- Tried: Petzl moved the page to a capital-H path. Fixed the URL at source in `research/gear-tiers-kitchen-water-elec.json` and `research/price-check-2026-09.csv`, then rebuilt BUY_LIST.md and the hub.
- Status: **closed 2026-10-08.** `curl -L` on https://www.petzl.com/US/en/Sport/Headlamps/TIKKINA returns 200; the old lowercase `/headlamps/` path still returns 404.

## 17. All 56 REI links time out to scripted requests (unconfirmed, likely bot-blocking)
- Symptom: none seen by a person yet. Every rei.com URL returned no response within 20 s (30 s on an HTTP/1.1 retry).
- Evidence: e.g. https://www.rei.com/product/103050/sawyer-squeeze-water-filter-system → 000 (timeout); https://www.rei.com/c/first-aid → 000. In the built-in browser the first REI page loaded with an empty document.title, and the next navigation to rei.com was refused, so no REI page could be confirmed either way.
- Cause: cause unknown; most likely REI's bot protection holds non-browser connections open. Check: open 3-4 of the REI links by hand on a phone and confirm the product page shows. If a real browser also fails, count them as dead.
- Tried: none
- Status: open

## 18. 27 Shopify-store links return 429 and 5 retailer links return 403 (unconfirmed, likely fine)
- Symptom: none seen by a person yet.
- Evidence: 429 (persisted after a one-per-second retry): ursack.com/products/ursack-major-xl-opsak, www.bearvault.com/product/bv500/, www.gossamergear.com (3 links), www.highplainsprospectors.com (2), adventuremedicalkits.com (2), www.decathlon.com (2), glacieroutdoor.com, gsioutdoors.com, seatosummit.com, durstongear.com, www.nemoequipment.com, www.toaksoutdoor.com, korkers.com, www.sealskinzusa.com, opossumworld.com, merino.tech, senchidesigns.com, hyperlitemountaingear.com, blackdiamondequipment.com, bedrocksandals.com, cooltools.us, fishwest.com, asroutdoor.com. 403: www.homedepot.com (Coleman Triton stove), www.columbia.com (Watertight II), toolup.com (Estwing pan), gearjunkie.com, forums.robsdetectors.com.
- Cause: rate limiting / bot blocking by the store platform. Not proven dead.
- Tried: none
- Status: open

## 19. 56 Amazon links return 200 but with an empty page title (unconfirmed)
- Symptom: none seen by a person yet. The 200 code does not prove the product exists.
- Evidence: All 56 amazon.com URLs → 200; fetching each body gave an empty `<title>` for all 56 (a bot interstitial, not a product page).
- Cause: Amazon serves a robot-check page to scripted requests. Check: spot-open the Amazon links in a real browser before Oct 15 (the the project rule file "re-check all links within a week" item).
- Tried: none
- Status: open

# C. Navigation and layout

## 20. Hub has no viewport meta tag, so on a phone the whole page is shrunk to about 57%
- Symptom: On a 375 px phone the page lays out at 653 px wide and is scaled down. Body text (15 px) renders at about 8-9 px, tabs and checkboxes are small, and the page needs pinch-zoom.
- Evidence: index.html:1 `<head><meta charset="utf-8"><title>` (no `<meta name="viewport">`; grep count 0, while RUNDOWN.html, gear-checkin.html and map/trip-map.html each have 1). Measured in the built-in browser at the mobile preset (375x812): `innerWidth` 653, `scrollWidth` 653 (set by the 7-button tab bar), body font-size 15px. Tab buttons are 55 px tall in layout, about 32 px on screen.
- Cause: The page template in tools/build_hub.py omits the viewport meta.
- Tried: Added `<meta name="viewport" content="width=device-width, initial-scale=1">` to the page template in `tools/build_hub.py`, plus a `@media (max-width:760px)` block that lets the 9-button tab bar wrap and makes wide tables scroll inside their own box.
- Status: **closed 2026-10-08.** Measured in the built-in browser at the mobile preset: `innerWidth` 375 and `document.documentElement.scrollWidth` 375 — no page-level horizontal scroll, text at full size.

## 21. Back button and in-page hash changes do not switch tabs
- Symptom: Tap Rundown, then Map, then Back. The URL changes to #rundown but the Map stays on screen. Opening a #buy link while already on the hub (no reload) also leaves the old tab showing.
- Evidence: index.html:159-164 sets `location.hash` on click and reads the hash once at load; there is no `hashchange`/`popstate` listener. Observed: after Map → `history.back()`, hash "#rundown", visible section "map". Navigating the open hub from #map to #buy left the Map tab visible (desktop screenshot).
- Cause: Tab state is read from the hash only at page load.
- Tried: Rewrote the tab router in `tools/build_hub.py`: a `showTab()` function, a `hashchange` listener, and the hash written as `#t/<tab>`. An empty hash shows Start. Old `#buy`-style links still resolve.
- Status: **closed 2026-10-08.** Measured: Rundown → Map → Back gives hash `#t/rundown` with the rundown section visible; a second Back gives an empty hash with Start visible; Forward returns to Rundown; setting `location.hash='buy'` on the open page shows the Buy tab.

## 22. Tapping a tab scrolls the page, pushing the header and tab bar partly off-screen
- Symptom: After tapping a tab the page jumps down, so the title bar is cut off (visible at the top of the desktop screenshot).
- Evidence: index.html:162 `location.hash=b.dataset.t;`. The hash equals each `<section id>`, so the browser scrolls to the section. Measured scrollY 108.7 (mobile) after the Buy tab click, and 24 (desktop) after loading #buy.
- Cause: The hash values are also element ids, so they act as scroll anchors.
- Tried: Same change as #21: `#t/<tab>` is not an element id, so the browser has no anchor to scroll to, and `showTab()` calls `window.scrollTo(0,0)`.
- Status: **closed 2026-10-08.** Measured `scrollY` 0 after a tab change; the header and tab bar stay on screen.

## 23. Buy list table is wider than a phone screen
- Symptom: On a phone the Buy tab scrolls sideways. The 8-column picker (Got it / Own / Skip / Item / Budget / Value / Premium / Mine) cannot be read without panning.
- Evidence: Mobile preset: `#picker` scrollWidth 872 px, document scrollWidth 896 px against a 653 px layout (375 px screen).
- Cause: Fixed 8-column table with `td.opt{min-width:130px}` (index.html:11) and no narrow-screen layout.
- Tried: The `@media (max-width:760px)` block makes every table `display:block; overflow-x:auto`, so the picker scrolls inside its own box instead of widening the page.
- Status: **partly closed 2026-10-08.** The page no longer scrolls sideways (document scrollWidth 375 at 375 px) and the rest of the hub is readable. The 8-column picker itself still needs a sideways swipe to read — a real narrow-screen card layout for it is still open.

## 24. Nothing on Start links to a Rundown section, and the hub URL can't deep-link into the Rundown
- Symptom: From Start there is no way to jump to "The hike", "Rules and safety" or "Call checklist". You have to open Rundown and scroll inside the frame.
- Evidence: index.html:38 `<section id="rundown"><iframe src="RUNDOWN.html"></iframe>`, a fixed src. index.html:164 only maps the hash to a tab. RUNDOWN.html has anchors s0..s12 (read from the iframe: "s0,s1,s2,s3,s4,s5,s6,s7..."). The Start cards (index.html:28-35) contain no links.
- Cause: The tab router has no sub-path (e.g. #rundown/s3) and Start has no links.
- Tried: none
- Status: open

## 25. Map controls float over the map (against "nothing floating over the map")
- Symptom: The 3D map opens with the attribution box already expanded in the bottom-right corner over the map. The 2D detail map has a legend box, a layers control and zoom buttons over the map.
- Evidence: 3D (live Map tab): `.maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show`, visible bottom-right in the desktop screenshot ("USGS The National Map | Mapzen Terrain Tiles (AWS) i"). 2D: map/trip-map.html:36 `#legend { position:absolute; bottom:16px; left:16px; z-index:1000; ...}`, `L.control.layers(baseLayers, null, { collapsed: true }`, `zoomControl: true`. Project rule: "controls live inside their aspect; nothing floating over the map."
- Cause: MapLibre's and Leaflet's default control placement. The 3D page moved its own controls into #bar but kept the default attribution. trip-map.html was never brought under the rule.
- Tried: none
- Status: open

## 26. 3D map opens zoomed out to the whole region
- Symptom: The Map tab opens on a view from roughly Blairsville to Gainesville. The hike area is a small cluster of pins near the middle.
- Evidence: Desktop and mobile Map tab screenshots. map/map3d.js init: `bounds: allBounds(0)`, which covers every day's legs including the Dahlonega drive.
- Cause: The default view is the "All days" bounds.
- Tried: none
- Status: open

# D. Offline / APK

## 27. The public hub has no offline support, and nothing on the page says so
- Symptom: Anyone using the GitHub Pages link instead of the APK gets a blank map and no pages once signal drops. The Files tab says only the Android app works offline, and nothing on Start says this.
- Evidence: No service worker or web manifest in index.html, RUNDOWN.html, map/*.html or gear-checkin.html (grep for serviceWorker / rel="manifest": 0 hits). Live Map tab status reads "Online map". map/map3d.js:18-22 loads tiles from basemap.nationalmap.gov and s3.amazonaws.com when there is no local manifest. https://hearnoevil343.github.io/guys-ga-trip/map/tiles/manifest.json → 404 (map/tiles/ is in .gitignore).
- Cause: Offline was solved only inside the Capacitor app. The web build has no cache layer.
- Tried: none
- Status: open

## 28. The 2D detail map in the APK still needs the internet for tiles and photos
- Symptom: In the app, "2D detail map" (linked from the 3D map bar) loads but shows no basemap and no spot photos without signal.
- Evidence: app/build-www.mjs swaps only the three Leaflet/esri-leaflet script/CSS URLs. map/trip-map.html still uses `tileLayer('https://{s}.tile.openstreetmap.org/...`, `tile.opentopomap.org`, `basemap.nationalmap.gov`, `server.arcgisonline.com` and has 29 thumb.wikimedia.org / 38 commons.wikimedia.org references. Files tab (index.html:156) describes it only as "2D detail map, layers, legality banners".
- Cause: The offline tile set (map/tiles) is wired only into map3d.js.
- Tried: none
- Status: open

## 29. The released APK carries the stale Rundown and the 4-day map; every fix needs a rebuild, re-release and reinstall on 5 phones
- Symptom: The app installed from the Files tab shows the out-and-back Rundown (issue 3) and the Tuesday walk-out map (issue 1).
- Evidence: `gh release view`: tag v2026.10.06, published 2026-10-06T13:35:09Z, asset ga-gold-trip.apk 140,518,158 bytes. Download link https://github.com/hearnoevil343/guys-ga-trip/releases/latest/download/ga-gold-trip.apk → 200. app/android/app/src/main/assets/public/index.html and RUNDOWN.html have the same md5 as the stale root files. The build output is app-debug.apk, and app/android/app/build.gradle:10 has `versionCode 1`.
- Cause: The APK is a snapshot. There is no update path inside the app.
- Tried: Rebuilt and re-synced the app after every change in this pass: `node app/build-www.mjs`, `npx cap sync android`, `gradlew assembleDebug` (JDK 21 — JDK 17 fails with "invalid source release: 21", and the default JRE 8 fails earlier).
- Status: **partly closed 2026-10-08.** Released as v2026.10.08; `curl -L` on releases/latest/download/ga-gold-trip.apk returns 200 and 140,786,775 bytes, matching the local build, and the bundled index.html is byte-identical to the repo's. Still open: nobody has installed it on a phone, and the 5 phones still carry the 10-06 build.

## 30. The offline 3D map has no place or trail names
- Symptom: In the backcountry the 3D map shows lines and numbered pins but no labels. You have to tap each one to learn what it is.
- Evidence: map/map3d.js:4 "No text labels on the map itself: MapLibre text needs font files from the web." Markers are HTML pins with numbers and ⛺ only.
- Cause: No glyph (font) files are bundled with the app.
- Tried: none
- Status: open

# E. Missing for the trip (planning gaps)

Each gap was grep-checked against index.html and RUNDOWN.md before listing.

## 31. Satellite messenger not secured, a week out
- Symptom: Who-has-what shows the satellite messenger as a hole nobody covers. RUNDOWN calls it a "must" for the backcountry and the only SOS path with no signal.
- Evidence: Who-has-what (index.html:154): "Satellite messenger (group/shared item) $ – $ ? ? HOLE · need 1"; RUNDOWN.md §7 "Rent a Garmin inReach Mini 2 ... this is a 'must'" and "No cell signal: use the rented satellite messenger's SOS function".
- Cause: No one has been assigned to rent it. Rentals ship, so lead time matters before Oct 15.
- Tried: none
- Status: open

## 32. No single emergency card in the hub
- Symptom: The ER, 911, sheriff, Vogel office and ranger numbers exist only deep in RUNDOWN §7 and §10 (inside the iframe). There is nothing on Start or in a tab.
- Evidence: index.html: 0 hits for "Union General", 0 for "911". RUNDOWN.md §7 has Union General (706) 745-2111, NGMC Lumpkin (770) 219-9000, 911, sheriff 706-439-6066. Vogel 706-745-2628 and Blue Ridge RD 706-745-6928 are in §0/§10. No page puts the hike's trailhead/camp coordinates next to them.
- Cause: not built.
- Tried: none
- Status: open

## 33. Ranger and county calls still open a week out, and no "if the answer is no" plan for the hike
- Symptom: Start still says "Still to do: phone calls ...". Legality of the hike creeks, Bowers Road public use, and the overnight permit are all unconfirmed. The only fallback written is for bad weather.
- Evidence: index.html:34 "Still to do: phone calls (Vogel, Blue Ridge Ranger District, GA DNR, Consolidated, Lumpkin Co, LDMA)"; index.html:30 "Not yet ranger-confirmed legal"; RUNDOWN.md:214 (Camping bullet) "Coosa Backcountry Trail overnight permit from Vogel: UNCONFIRMED"; RUNDOWN.md:79 rain/backup only ("Day-trip fallback: Frogtown"). grep "ranger says no|if the ranger|Plan B": no relevant hit in index.html or RUNDOWN.md.
- Cause: not built; calls not logged as made.
- Tried: none
- Status: open

## 34. No day-by-day timeline in the hub with drive times and sunrise/sunset
- Symptom: The hub has no single Oct 15-21 timeline. Clock times exist only for Thursday in RUNDOWN, and there are no sunrise times at all.
- Evidence: grep "sunrise": index 0, RUNDOWN.md 0. "sunset": index 0, RUNDOWN.md 1 (RUNDOWN.md:60 "Sunset is about 7:05 PM", Thursday only). Leg-by-leg minutes exist only in the Map tab day panel (map3d-data.js).
- Cause: not built.
- Tried: none
- Status: open

## 35. No weather/forecast link and no record of the early-October re-check
- Symptom: There is no forecast link to tap. The "re-check fire bans/water/roads in early Oct" step has no result as of Oct 8.
- Evidence: index.html: 0 hits for weather.gov / NWS. RUNDOWN.md has only plain text "check NWS forecasts (weather.gov)" (not a link). PLAN.md:44 "| 4 | Early Oct re-check: fire bans, water, roads, foreca..." with an empty Status column. index.html:34 still lists it as to-do.
- Cause: PLAN step 4 not run.
- Tried: none
- Status: open

## 36. No permit and fee list
- Symptom: Nobody knows what to pay at each gate: Vogel ParkPass, Brasstown Bald, Consolidated, Gold Museum.
- Evidence: RUNDOWN.md:39, :451, :477 only say "confirm current ParkPass fee". No Brasstown Bald fee or gate hours anywhere: CALLS.md:49 "is the gate on Spur 180 open until about 10:30 PM in mid-October?" is still open, and Thursday's plan returns to camp ~10:15 PM. "Anna Ruby": 0 hits in both files. Tour prices sit in RUNDOWN §5 and §11, not in one list in the hub.
- Cause: not built.
- Tried: none
- Status: open

## 37. No who-drives-which-truck table and no group contact sheet
- Symptom: The plan refers to "truck 1" and "truck 2" (PLAN.md:23-24) but never says whose. There are no phone numbers for the 5 people.
- Evidence: grep "who drives|driver|which truck": index 0 relevant (the one hit is a multitool "bit driver"), RUNDOWN.md 0. "contact sheet|phone number": none for group members. The group's names appear only in Who-has-what (Jordan, Nik, Nathan, Hilton, Jarred).
- Cause: not built.
- Tried: none
- Status: open

## 38. No written trip plan left with someone at home
- Symptom: No page says who outside the group holds the route and the overdue time for the hike.
- Evidence: grep "leave a trip plan|trip plan with|emergency contact": index 0; RUNDOWN.md 1 (RUNDOWN.md:494, a research-source note). RUNDOWN §7 only tells whoever stays at camp to know the route, and on hike days all 5 are out.
- Cause: not built.
- Tried: none
- Status: open

## 39. No water plan per hike camp
- Symptom: Only CAMP-U has a water note. Calf Stump Branch (night 1 on the 10-05 route) has "October flow is unconfirmed" with no fallback, and there is no carry plan for the ridge stretch.
- Evidence: RUNDOWN.md:208 "Water: CAMP-U ... If it is a trickle, move camp down toward 34.7958, -83.9792"; PLAN.md:24 "Creek has no gold record and October flow is unconfirmed" (Calf Stump). RUNDOWN.md §3 Rules: "Water: the creek at every camp; treat it."
- Cause: not built. Needs redoing for whichever 3-day route issue 2 settles on.
- Tried: none
- Status: open

## 40. No per-meal food plan for the base-camp days in the hub
- Symptom: The Buy tab has a single "Car-camp grocery run (est.)" line. The meal-by-meal list exists only in MASTER_LIST.md, which isn't linked from the hub, and it is built around the old Tuesday dinner.
- Evidence: index.html:170 "Car-camp grocery run (est.)" note "simple car-camp breakfasts/dinners at Vogel for the non-backcountry nights; no link". MASTER_LIST.md:49 "Thu dinner, Fri breakfast (Fri dinner in Dahlonega), Sat breakfast, Tue dinner (make it the big one), Wed breakfast". The Files tab (index.html:156) does not list MASTER_LIST.md.
- Cause: not built; MASTER_LIST not in the hub.
- Tried: none
- Status: open

## 41. Other group-gear holes: bear-proof food storage and paper maps
- Symptom: Who-has-what shows that nobody has bear-proof food storage (required practice, RUNDOWN §7) and that 2 more paper maps are needed.
- Evidence: index.html:154 "Bear-proof food storage (group/shared item) $ $ $ ? ? HOLE · need 1"; "National Geographic Chattahoochee-Oconee National Forest paper map $ $ $ ? ? HOLE · need 2".
- Cause: Hilton's and Jarred's lists not in, and the holes are not assigned to anyone.
- Tried: none
- Status: open

## 42. Two of five gear lists still missing
- Symptom: The "holes" view can't be trusted until every list is in.
- Evidence: index.html:154 "Lists in: 3 of 5 (Jordan, Nik, Nathan). Still owed: Hilton, Jarred."
- Cause: Lists not sent.
- Tried: none
- Status: open

## 43. No shared Friday-evening checklist (truck staging and hike pack-up)
- Symptom: PLAN's Friday row puts a staging run and pack-up in the evening after a full Dahlonega day, but there is no checklist or time for it. RUNDOWN's Friday section doesn't mention it.
- Evidence: PLAN.md:23 "Evening: both trucks stage truck 2 at Owltown Gap, back in truck 1. Pack the hike packs."; RUNDOWN.md:65-71 (Fri section) has no staging step. grep "staging|stage truck": index 0, RUNDOWN.md 0.
- Cause: not built. Whether staging is still needed depends on the answer to issue 2.
- Tried: none
- Status: open

---

# F. Found 2026-10-08 while rebuilding the route and the new tabs

## 44. The West Fork Wolf Creek reach the plan calls National Forest crosses non-Forest-Service ground
- Symptom: the Playground tab's "West Fork Wolf Creek, the National Forest reach" branch is flagged "crosses private". The route design says the creek is National Forest from its source down to 34.79131, -83.91724, and the plan pans at the FS 107 crossing inside that stretch.
- Evidence: `node map/data/_build_playground.mjs` reports "wolf_x / West Fork Wolf Creek, the National Forest reach: 11 vertices" on non-FS ground, testing the OSM creek line from its source to 34.79131, -83.91724 against `map/data/private.geojson` (EDW BasicOwnership, 2026-10-05), with the two state-park polygons from `wilderness.geojson` already exempt. `map/build-map.mjs`'s own guard reports no camp, pan or day start/end point on private land, so the pan stop itself is clear.
- Cause: **found 2026-10-08: candidate (a), the boundary number is wrong.** The 11 flagged vertices are the last 11 of the 188 on the line (indices 177-187, the final ~190 m), contiguous, all in the same `private.geojson` polygon (feature 0, NON-FS), and each one sits deeper inside it than the last: 1, 13, 24, 34, 57, 67, 77, 81, 86, 86, 93 m from the polygon edge. Not an inholding, not a scattered offset. The ownership edge crosses the creek between vertex 176 (34.79067, -83.91913, 14 m outside) and vertex 177 (34.79077, -83.91895), so the real limit is about **34.7908, -83.9190**; 34.79131, -83.91724 is ~200 m downstream of it, 93 m inside private land. WOLF-X (vertex 139) is ~803 m of creek upstream of the edge, so the planned pan stop is clear. Taken as true (an assumption): the Forest Service ownership file, as everywhere else in the plan.
- Tried: none yet. Fix: replace 34.79131, -83.91724 with 34.7908, -83.9190 in `tools/build_hub.py:563`, `RUNDOWN.md:197` and `map/data/_build_playground.mjs:318-325`, then rebuild; the playground build must then report 0 non-FS vertices for this branch.
- Status: open, cause found, fix pending.

## 45. The Android build needs JDK 21 and nothing in the repo says so
- Symptom: `./gradlew assembleDebug` fails twice before it works. With the machine's default Java it says "Run this build using a Java 11 or newer JVM"; with `E:/dev-tools/jdk17` it fails at `:capacitor-android:compileDebugJavaWithJavac` with "invalid source release: 21".
- Evidence: both failures reproduced 2026-10-08. `JAVA_HOME=/e/dev-tools/jdk21 ./gradlew assembleDebug` then succeeds in 24 s. `java -version` on PATH is 1.8.0_231; `app/android/local.properties` names the SDK but no JDK; `app/android/gradle.properties` has no `org.gradle.java.home`.
- Cause: the toolchain requirement lives only in Capacitor's own build files, and the machine's PATH Java is 8. Nothing in TOOLS.md, README.md or the app folder records which JDK to use.
- Tried: setting `JAVA_HOME` per command works. Not written into `gradle.properties` yet — that would hard-code an absolute path into a public repo.
- Status: open (worked around, and now recorded in TOOLS.md).

## 46. Nothing checks that the APK on the release matches the built files
- Symptom: the hub, the maps and the APK are built from the same sources but released separately, so the APK on GitHub can silently lag the published hub. It already did once: ISSUES #29.
- Evidence: the release flow is manual (`node app/build-www.mjs`, `npx cap sync android`, `gradlew assembleDebug`, then a GitHub release). No step compares the APK's bundled `index.html` with the repo's.
- Cause: no check exists.
- Tried: none. A cheap one would be a script that diffs `app/android/app/src/main/assets/public/index.html` against `index.html` and fails if they differ.
- Status: open.
