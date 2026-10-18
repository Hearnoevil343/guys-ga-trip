// One-off patch, 2026-10-18 (owner: "For home"): Monday Oct 19 is not a free
// day at Vogel after all — they break camp and drive home, leaving 8:00 or
// 10:00. Tue Oct 20 and Wed Oct 21 become unused. Not part of the build chain.
import fs from 'node:fs';

const f = 'map/data/_build_backcountry.mjs';
let t = fs.readFileSync(f, 'utf8');
const crlf = t.includes('\r\n');
if (crlf) t = t.replace(/\r\n/g, '\n');

const start = t.indexOf('async function buildMonFree() {');
if (start < 0) throw new Error('buildMonFree not found');
const end = t.indexOf('async function buildTueFree() {');
if (end < 0) throw new Error('buildTueFree not found');

const replacement = `async function buildMonHome() {
  console.log('\\n=== Oct 19 — break camp and drive home (changed 2026-10-18) ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp (Vogel)', 40));
  legs.push(campLeg('Break camp, pack out, load both trucks', 90));
  legs.push({
    type: 'tour', at_ref: 'vogel_basecamp', label: 'Leave Vogel for home', minutes: 30,
    note: MON_HOME_NOTE,
  });
  return {
    day: 5, date: '2026-10-19', title: 'Break camp, leave Vogel for home', optional: false,
    start: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng, time: '08:00' },
    end: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng },
    note: 'Changed 2026-10-18 (owner): the hike ended early and the group goes home Monday instead of staying to Wednesday. Breakfast, break camp, roll at 8:00 AM — 10:00 also works, it just moves everything two hours later. The Tue Oct 20 and Wed Oct 21 cards below are no longer used; they are left in place rather than deleted. No drive-home route is drawn: the project never recorded where home is.',
    legs,
  };
}

`;

t = t.slice(0, start) + replacement + t.slice(end);
t = t.replace('const oct19 = await buildMonFree();', 'const oct19 = await buildMonHome();');

const old = "const MON_FREE_NOTE = ";
const i = t.indexOf(old);
if (i < 0) throw new Error('MON_FREE_NOTE not found');
const lineEnd = t.indexOf('\n', i);
const newNote = `const MON_HOME_NOTE = 'Roll at 8:00 AM (10:00 works, it just moves the day two hours). BEFORE YOU LEAVE: if truck 2 is still at BOWERS-FS on Bowers Road, collect it first — Vogel to BOWERS-FS is 21 min each way, so leaving at 8:00 means both trucks loaded and gone by about 9:00. Check site P for gear, the bear hang and the fire ring. Optional last pan on the way if the route goes through Dahlonega: Yahoola Creek Park, or the Chestatee River at the US-19 bridge — both already cleared as legal in RUNDOWN.md. Vogel checkout is noon; leaving Monday gives back the Tue and Wed nights.';`;
t = t.slice(0, i) + newNote + t.slice(lineEnd);

if (crlf) t = t.replace(/\n/g, '\r\n');
fs.writeFileSync(f, t);
console.log('Monday is now break camp + drive home');
