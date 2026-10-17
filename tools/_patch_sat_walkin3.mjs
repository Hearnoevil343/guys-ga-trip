// One-off patch 3, 2026-10-17: RUNDOWN.md and PLAN.md day-1 text and numbers,
// rewritten from the rebuilt days.json (walk-in from Vogel over Burnett Gap).
// Not part of the build chain; safe to delete.
import fs from 'node:fs';

function patch(file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  if (crlf) t = t.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`NOT FOUND in ${file}: ${a.slice(0, 70)}`);
    t = t.replace(a, b);
  }
  if (crlf) t = t.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, t);
  console.log(`patched ${file} (${pairs.length} replacements)`);
}

const SAT_SHORT = '**Hike day 1 — walked from camp, changed 2026-10-17 (Jordan, in the field): no drive to WOLF-X.** Site P to the Coosa Backcountry Trailhead (0.15 mi), green-blazed trail up to Burnett Gap (1.02 mi, +469 ft), down to WOLF-X, the West Fork Wolf Creek / FS 107 crossing (2.35 mi, +194 ft). No water from the park to the creek: 2 L each. Pan West Fork Wolf Creek (2 h) and lunch there. Coosa Backcountry Trail up over Locust Stake Gap to Calf Stomp Gap (2.54 mi, +1,375 ft) and 0.4 mi on to Calf Stump Branch (34.78244, -83.95858, ~400 m from the nearest road). Camp, pan in the evening. **6.46 mi, +2,432 ft — the longest day of the trip.** From a 7:30 start the model has camp set by 2 PM and dinner done by 5:35, sunset 7:05. Backcountry permit at the Visitor Center before walking out. Truck 1 stays in the Vogel lot. Creek has no gold record and October flow is unconfirmed. Deer season opens: blaze orange.';

const MON_TAIL_OLD = 'Drive truck 2 up over Owltown Gap to WOLF-X for truck 1 (27 min), both to Vogel (11 min).';
const MON_TAIL_NEW = 'Drive truck 2 up over Owltown Gap straight to Vogel (21 min) — truck 1 is already there (changed 2026-10-17; the WOLF-X retrieval leg is gone).';

patch('RUNDOWN.md', [
  ['- **Sat Oct 17 —** **Hike day 1.** Truck 1 to WOLF-X (FS 107, 4.2 mi). Pan West Fork Wolf Creek (2 h). Coosa Backcountry Trail up over Calf Stomp Gap (2.5 mi, +1,375 ft) and 0.4 mi on to Calf Stump Branch (34.78244, -83.95858, ~400 m from the nearest road). Camp, pan in the evening. Creek has no gold record and October flow is unconfirmed. Deer season opens: blaze orange.',
   `- **Sat Oct 17 —** ${SAT_SHORT}`],
  ['- **Sat Oct 17 — Vogel → WOLF-X → Calf Stump Branch.** **Hike day 1.** Truck 1 to WOLF-X (FS 107, 4.2 mi). Pan West Fork Wolf Creek (2 h). Coosa Backcountry Trail up over Calf Stomp Gap (2.5 mi, +1,375 ft) and 0.4 mi on to Calf Stump Branch (34.78244, -83.95858, ~400 m from the nearest road). Camp, pan in the evening. Creek has no gold record and October flow is unconfirmed. Deer season opens: blaze orange.',
   `- **Sat Oct 17 — Vogel → Burnett Gap → WOLF-X → Calf Stump Branch.** ${SAT_SHORT}`],
  [`Bowers Road crosses private land for 0.68 mi up to Owltown Gap; driving that stretch is unconfirmed (CALLS). ${MON_TAIL_OLD} Hot dinner and showers at Vogel.`,
   `Bowers Road crosses private land for 0.68 mi up to Owltown Gap; driving that stretch is unconfirmed (CALLS). ${MON_TAIL_NEW} Hot dinner and showers at Vogel.`],
  [`Above the truck, Bowers Road crosses private land for 0.68 mi up to Owltown Gap; driving that stretch is unconfirmed (CALLS). ${MON_TAIL_OLD}\n`,
   `Above the truck, Bowers Road crosses private land for 0.68 mi up to Owltown Gap; driving that stretch is unconfirmed (CALLS). ${MON_TAIL_NEW}\n`],
  ['    - **If the Bowers Road answer is still no:** skip the staging run entirely and plan to walk back the way you came to truck 1 at WOLF-X.',
   '    - **If the Bowers Road answer is still no:** skip the staging run entirely and plan to walk back the way you came — over Calf Stomp Gap and down the Coosa Backcountry Trail to Vogel on foot (changed 2026-10-17: there is no truck at WOLF-X any more).'],
  ['Route locked by Jordan 2026-10-05, reshaped to 3 days / 2 nights by Jordan 2026-10-08. Truck 2 is staged at Owltown Gap Friday evening.',
   'Route locked by Jordan 2026-10-05, reshaped to 3 days / 2 nights by Jordan 2026-10-08, day 1 changed to a walk-in from Vogel over Burnett Gap by Jordan 2026-10-17. Truck 2 is staged at BOWERS-FS on Bowers Road Friday evening.'],
  ['- **Rain/backup:** if the forecast turns genuinely unsafe (flash-flood risk in a narrow headwater), shorten to one night, or make Saturday a day at WOLF-X and come back to Vogel, rather than camp in a flooding drainage.',
   '- **Rain/backup:** if the forecast turns genuinely unsafe (flash-flood risk in a narrow headwater), shorten to one night, or make Saturday a there-and-back walk to WOLF-X and sleep at Vogel, rather than camp in a flooding drainage.'],
]);

// PLAN.md: replace the estimate written before the rebuild with the built numbers.
patch('PLAN.md', [
  ['Pan West Fork Wolf Creek (1 h, cut from 2 h to protect the climb).',
   'Pan West Fork Wolf Creek (2 h, as planned — the rebuilt day still has camp set by 2 PM and dinner done by 5:35 PM from a 7:30 start, against a 7:05 PM sunset).'],
  ['**Day total 6.4 mi, +1,950 / -960 ft** (was 2.9 mi, +1,375).',
   '**Day total 6.46 mi, +2,432 ft** (was 2.9 mi, +1,375) — from the rebuilt `days.json`, the longest day of the trip.'],
  ['counter-clockwise over Burnett Gap (1.02 mi, +443 ft) then down to WOLF-X, the West Fork Wolf Creek / FS 107 crossing (2.35 mi, +190/-935 ft): 3.5 mi to the creek.',
   'counter-clockwise over Burnett Gap (1.02 mi, +469 ft) then down to WOLF-X, the West Fork Wolf Creek / FS 107 crossing (2.35 mi, +194 ft): 3.5 mi to the creek.'],
  ['Not yet rebuilt in the data: `map/data/days.json`, `trip.gpx`, `map3d-data.js`, RUNDOWN, hub, APK (the hub on the phone still shows the truck start).',
   'Rebuilt 2026-10-17: `map/data/days.json`, `playground-area.json`, `trip.gpx`, `trip-map.html`, `map3d-data.js`, RUNDOWN.md/.html, the hub and the app bundle. Builder change in `map/data/_build_backcountry.mjs` (the two one-off patch scripts are in `tools/_patch_sat_walkin*.mjs`).'],
]);
