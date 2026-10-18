// One-off patch, 2026-10-18: PLAN.md and RUNDOWN.md Monday rows, after Mon Oct
// 19 became a second free day. Not part of the build chain; safe to delete.
import fs from 'node:fs';

function patch(file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  if (crlf) t = t.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`NOT FOUND in ${file}: ${a.slice(0, 70)}`);
    t = t.split(a).join(b);
  }
  if (crlf) t = t.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, t);
  console.log(`patched ${file} (${pairs.length} replacements)`);
}

const MON_ROW = '| Mon Oct 19 | **Free day. Changed 2026-10-18 (Jordan, back at Vogel): the hike ended early — no gold worth staying for near Calf Stomp Gap — so there is no CAMP-U night and no walk-out.** Leave camp 8:00 AM (10:00 also works; it only costs the last stop of whichever plan you pick). Nothing booked: the hub\'s Playground tab has the waterfall loop, Blairsville / Helen / Hiawassee, markets and festivals and a rain plan. **If truck 2 is still at BOWERS-FS, collect it first** — Vogel to BOWERS-FS is 21 min each way, both trucks home by 9 AM from an 8 AM start. | optional |';

patch('PLAN.md', [
  [`| Mon Oct 19 | **Hike day 3, out.** Morning pan at CAMP-U (2 h). Break camp, down the creek 0.3 mi to LOWER, last pan (1.5 h), lunch, on down the creek 0.4 mi to where the road starts (34.79824, -83.97825), the road (Duncan Ridge Conn) 0.7 mi to Bowers Road, Bowers Road (FS 298) 0.8 mi to truck 2 at BOWERS-FS (all Forest Service ground). 2.3 mi walking. Drive truck 2 up Bowers Road over Owltown Gap straight to Vogel (truck 1 is already there — changed 2026-10-17; the 27 min WOLF-X retrieval leg is gone). Hot dinner at Vogel. Bowers Road crosses private land for its first 0.68 mi below Owltown Gap, above the truck; driving that stretch is unconfirmed (CALLS). | CAMP-U 2 h, LOWER 1.5 h |`,
   MON_ROW],
  ['- **Playground (Jordan, 2026-10-08):**',
   `- **Changed 2026-10-18 (Jordan, back at Vogel): the hike ended early and Mon Oct 19 is now a second free day.** No gold worth staying for near Calf Stomp Gap, so the CAMP-U night and the Monday walk-out are off. Days 5 and 6 in \`days.json\` are both free days now; the Sunday card (day 4) still reads as the plan that was, and the build's chain check warns that day 4 ends at CAMP-U while day 5 starts at Vogel — left that way deliberately rather than invent what Sunday actually looked like.\n\n- **Playground (Jordan, 2026-10-08):**`],
]);

patch('RUNDOWN.md', [
  ['### Tue Oct 20 — Free day', '### Mon Oct 19 and Tue Oct 20 — Free days\nChanged 2026-10-18 (Jordan, back at Vogel): the hike ended early — no gold worth staying for near Calf Stomp Gap — so Monday is a free day too. Leave camp 8:00 AM (10:00 also works, it only costs the last stop of whichever plan you pick). If truck 2 is still at BOWERS-FS, collect it first: 21 min each way, both trucks home by 9 AM from an 8 AM start.\n\n### Tue Oct 20 — Free day'],
]);
