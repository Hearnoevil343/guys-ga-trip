// One-off patch 2 of 2, 2026-10-17: the stale "truck 1 sits at WOLF-X" text in
// the playground builder and the hub builder, after day 1 became a walk-in from
// Vogel over Burnett Gap. Not part of the build chain; safe to delete.
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

patch('map/data/_build_playground.mjs', [
  [`note: 'Not used on this trip — Saturday starts by truck at WOLF-X. Here for anyone who wants to walk the whole loop from the park.',`,
   `note: 'This is day 1 as of 2026-10-17 (owner): Saturday walks out of camp over Burnett Gap instead of driving to WOLF-X.',`],
  [`note: 'FS 107 is open to vehicles (owner, first-hand, 2026-10-05), so truck 1 sits here all weekend — this is a walk only if the truck is gone.',`,
   `note: 'FS 107 is open to vehicles (owner, first-hand, 2026-10-05), but no truck is left here any more (changed 2026-10-17): this is the quickest way to a drivable road if someone has to get out.',`],
  [`type: 'trailhead', note: 'Where truck 1 parks. FS 107 (West Wolf Creek Road) is open to vehicles — owner, first-hand, 2026-10-05. Last water before the climb: fill 2 L each.' },`,
   `type: 'trailhead', note: 'Day 1 walks in to here from the Vogel trailhead over Burnett Gap, 3.37 mi (changed 2026-10-17) — no truck is left here. FS 107 (West Wolf Creek Road) is open to vehicles — owner, first-hand, 2026-10-05. Last water before the climb: fill 2 L each.' },`],
  [`note: 'Last water a truck can reach. Fill 2 L each here — there is none on the 1,375 ft climb to Calf Stomp Gap.' },`,
   `note: 'First water on the walk in from Vogel (nothing on the ridge over Burnett Gap) and the last before the climb. Fill 2 L each here — there is none on the 1,375 ft climb to Calf Stomp Gap.' },`],
]);

patch('tools/build_hub.py', [
  [`<li><b>Where:</b> at and just below the FS 107 crossing (WOLF-X), where truck 1 parks.`,
   `<li><b>Where:</b> at and just below the FS 107 crossing (WOLF-X), 3.37 mi in on foot from the Vogel trailhead over Burnett Gap (changed 2026-10-17; no truck is left here).`],
  [`     "Truck 1 parks here all weekend. Last point a vehicle reaches on the way in."),`,
   `     "Walked in from the Vogel trailhead over Burnett Gap, 3.37 mi (changed 2026-10-17). Last point a vehicle could reach on the way in, but no truck is left here."),`],
  [`        "Check both trucks' fuel: Blairsville is the last gas before FS 107",`,
   `        "Check both trucks' fuel: Blairsville is the last gas before the forest roads",`],
  [`        '<p><b>Carry:</b> 2 L each leaving WOLF-X and leaving Calf Stump Branch; 1 L each walking out '`,
   `        '<p><b>Carry:</b> 2 L each leaving camp Saturday morning (nothing on the ridge over Burnett '
        'Gap), 2 L each leaving WOLF-X and leaving Calf Stump Branch; 1 L each walking out '`],
  [`        'vehicles and to public foot use. If the answer to Bowers Road is no, the walk-out changes: '
        'back the way you came to WOLF-X, and truck 2 does not need staging at all.</p>')`,
   `        'vehicles and to public foot use. If the answer to Bowers Road is no, the walk-out changes: '
        'back the way you came, over Calf Stomp Gap and down the Coosa Backcountry Trail to Vogel on '
        'foot, and truck 2 does not need staging at all.</p>')`],
]);
