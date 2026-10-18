// One-off patch, 2026-10-18 (owner, back at Vogel): the group came off the hike
// early — no gold near Calf Stomp Gap — so Mon Oct 19 becomes a second free
// day at base camp instead of the CAMP-U pan and walk-out. Rewrites
// buildMonOut() in map/data/_build_backcountry.mjs. Not part of the build
// chain; safe to delete.
import fs from 'node:fs';

const f = 'map/data/_build_backcountry.mjs';
let t = fs.readFileSync(f, 'utf8');
const crlf = t.includes('\r\n');
if (crlf) t = t.replace(/\r\n/g, '\n');

const start = t.indexOf('async function buildMonOut() {');
if (start < 0) throw new Error('buildMonOut not found');
const end = t.indexOf('async function buildTueFree() {');
if (end < 0 || end < start) throw new Error('buildTueFree not found');

const replacement = `async function buildMonFree() {
  console.log('\\n=== Oct 19 — free day at Vogel (changed 2026-10-18: the hike ended early) ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp (Vogel)', 40));
  legs.push({
    type: 'tour', at_ref: 'vogel_basecamp', label: 'Free day — pick from the Playground tab', minutes: 480,
    note: MON_FREE_NOTE,
  });
  legs.push(mealLeg('Lunch — out or at camp', 45));
  legs.push(mealLeg('Dinner at camp (Vogel)', 60));
  return {
    day: 5, date: '2026-10-19', title: 'Free day — no fixed route (see the Playground tab)', optional: false,
    start: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng, time: '08:00' },
    end: { ref: 'vogel_basecamp', label: POINTS.vogel_basecamp.label, lat: POINTS.vogel_basecamp.lat, lng: POINTS.vogel_basecamp.lng },
    note: 'Free day at base camp. Changed 2026-10-18 (owner): the group came off the hike early — no gold worth staying for near Calf Stomp Gap — so Monday is the second free day, not the CAMP-U pan and walk-out. Leave camp 8:00 AM; 10:00 works too and only costs the last stop of whichever plan you pick. Nothing is booked.',
    legs,
  };
}

`;

t = t.slice(0, start) + replacement + t.slice(end);
t = t.replace('const oct19 = await buildMonOut();', 'const oct19 = await buildMonFree();');

// The note is long; keep it with the other day notes rather than inline.
const anchor = "const BOWERS_NOTE = ";
const noteDecl = `const MON_FREE_NOTE = 'Nothing booked. The hub\\'s Playground tab has the ready-made plans (waterfall loop, Blairsville/Helen/Hiawassee, markets and festivals, a rain plan) and the hike-area layer if anyone wants another creek. Changed 2026-10-18 (owner): the hike ended early, so this is a free day instead of the walk-out. IF TRUCK 2 IS STILL AT BOWERS-FS, collect it first: Vogel to BOWERS-FS and back is 21 min each way, both trucks home by 9 AM from an 8 AM start.';
`;
if (!t.includes(anchor)) throw new Error('BOWERS_NOTE anchor missing');
t = t.replace(anchor, noteDecl + anchor);

if (crlf) t = t.replace(/\n/g, '\r\n');
fs.writeFileSync(f, t);
console.log('buildMonOut -> buildMonFree; day 5 is now a free day');
