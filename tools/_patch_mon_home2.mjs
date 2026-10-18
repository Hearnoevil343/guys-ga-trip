// One-off patch, 2026-10-18: PLAN.md / RUNDOWN.md Monday rows — the group goes
// home Monday, not Wednesday. Not part of the build chain.
import fs from 'node:fs';

function patch(file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  if (crlf) t = t.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`NOT FOUND in ${file}: ${a.slice(0, 60)}`);
    t = t.split(a).join(b);
  }
  if (crlf) t = t.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, t);
  console.log(`patched ${file}`);
}

const OLD_MON_START = '| Mon Oct 19 | **Free day. Changed 2026-10-18';
let plan = fs.readFileSync('PLAN.md', 'utf8').replace(/\r\n/g, '\n');
const s = plan.indexOf(OLD_MON_START);
if (s < 0) throw new Error('Monday row not found');
const e = plan.indexOf('\n', s);
const oldRow = plan.slice(s, e);

const NEW_ROW = '| Mon Oct 19 | **Home. Changed 2026-10-18 (Jordan, back at Vogel): the hike ended early — no gold worth staying for near Calf Stomp Gap — and the group goes home Monday instead of Wednesday.** Breakfast, break camp, pack out, roll at **8:00 AM** (10:00 works, it just moves the day two hours). **If truck 2 is still at BOWERS-FS, collect it first** — 21 min each way, so an 8:00 start has both trucks loaded and gone by about 9:00. Optional last pan if the way home goes through Dahlonega: Yahoola Creek Park or the Chestatee River at the US-19 bridge (both already cleared legal). Tue Oct 20 and Wed Oct 21 below are not used; the Vogel nights are given back. | optional, on the way home |';

patch('PLAN.md', [
  [oldRow, NEW_ROW],
  ['- **Changed 2026-10-18 (Jordan, back at Vogel): the hike ended early and Mon Oct 19 is now a second free day.**',
   '- **Changed 2026-10-18 (Jordan, back at Vogel): the hike ended early and the trip ends Monday — they drive home Mon Oct 19 instead of staying to Wed Oct 21.**'],
  ['Days 5 and 6 in `days.json` are both free days now;',
   'Day 5 in `days.json` is now break-camp-and-go; days 6 and 7 are left in place but unused;'],
]);

patch('RUNDOWN.md', [
  ['### Mon Oct 19 and Tue Oct 20 — Free days\nChanged 2026-10-18 (Jordan, back at Vogel): the hike ended early — no gold worth staying for near Calf Stomp Gap — so Monday is a free day too. Leave camp 8:00 AM (10:00 also works, it only costs the last stop of whichever plan you pick). If truck 2 is still at BOWERS-FS, collect it first: 21 min each way, both trucks home by 9 AM from an 8 AM start.',
   '### Mon Oct 19 — Break camp, drive home\nChanged 2026-10-18 (Jordan, back at Vogel): the hike ended early — no gold worth staying for near Calf Stomp Gap — so the trip ends Monday, not Wednesday. Breakfast, break camp, roll at 8:00 AM (10:00 works, it just moves the day two hours). **If truck 2 is still at BOWERS-FS, collect it first:** 21 min each way, both trucks loaded and gone by about 9:00 from an 8:00 start. Check site P for gear, the bear hang and the fire ring on the way out. Optional last pan if the way home goes through Dahlonega: Yahoola Creek Park, or the Chestatee River at the US-19 bridge. The Tue Oct 20 and Wed Oct 21 sections below are no longer used.'],
]);
