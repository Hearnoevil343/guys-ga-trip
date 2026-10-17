// One-off patch, 2026-10-17 (owner, in the field): day 1 is walked from Vogel
// over Burnett Gap instead of driven to WOLF-X. Rewrites
// map/data/_build_backcountry.mjs in place. Kept in the repo as the record of
// the edit; it is not part of the build chain and is safe to delete.
import fs from 'node:fs';

const f = 'map/data/_build_backcountry.mjs';
let t = fs.readFileSync(f, 'utf8');
const n0 = t.length;
// The file is CRLF on disk; patch against LF and restore CRLF on write.
const WAS_CRLF = t.includes('\r\n');
if (WAS_CRLF) t = t.replace(/\r\n/g, '\n');
function rep(a, b) {
  if (!t.includes(a)) throw new Error('NOT FOUND: ' + a.slice(0, 80));
  t = t.replace(a, b);
}

// A. header
rep(
  '// Oct 20 is a free day with no fixed route.\n//',
  `// Oct 20 is a free day with no fixed route.
// CHANGED 2026-10-17 (owner, in the field on the morning of hike day 1): Sat
// Oct 17 is walked, not driven — site P to the Vogel Coosa Backcountry
// Trailhead, then the trail counter-clockwise over Burnett Gap (survey mile
// 1.02) down to WOLF-X (mile 3.37). Truck 1 stays in the Vogel lot, so Monday
// truck 2 drives straight from BOWERS-FS to Vogel instead of collecting truck
// 1 at WOLF-X. The WOLF-X pan drops 120 -> 60 min to protect the Calf Stomp
// climb before dark.
//`);

// B. POINTS — the trailhead is now a route point
rep(
  '  owltown_gap: {',
  `  // Mile 0 of the Coosa Backcountry Trail loop, about 250 m from site P
  // (same point as the vogel_trailhead node in map/data/playground-area.json).
  vogel_trailhead: { lat: 34.7638, lng: -83.9263, label: 'Vogel Coosa Backcountry Trailhead (CBT mile 0)' },
  owltown_gap: {`);

// C. split the Saturday trail segment at Burnett Gap
rep(
  'const trailSatSeg = trailSlice(0, wolfXCut.index, { index: -1, point: trail[0] }, wolfXCut); // trailhead -> WOLF-X',
  `const trailheadToBurnett = trailSlice(0, burnettGapCut.index, { index: -1, point: trail[0] }, burnettGapCut); // trailhead -> Burnett Gap
const burnettToWolfX = trailSlice(burnettGapCut.index, wolfXCut.index, burnettGapCut, wolfXCut); // Burnett Gap -> WOLF-X`);

// D. Saturday no longer drives in: the truck point and helper go
rep("const WOLF_X_PT = { lat: WOLF_X[0], lng: WOLF_X[1], label: 'West Fork Wolf Creek / FS 107 crossing (WOLF-X) — truck' };\n", '');
rep(`
// Vogel -> WOLF-X by truck. OSRM may stop short of the crossing if it will not
// route the FS 107 track; a short approximate stitch covers the rest.
async function driveToWolfX(label, cacheKey) {
  const d = await driveLeg(label, POINTS.vogel_basecamp, WOLF_X_PT, cacheKey, { access_note: FS107_NOTE });
  const last = d.coords[d.coords.length - 1];
  const gapM = dist(last, WOLF_X);
  console.log(\`    drive end -> WOLF-X gap: \${gapM.toFixed(0)} m\`);
  return { leg: d, gapM, last };
}
`, '');

// FS107_NOTE was only ever a parking note; the new day-1 notes replace it.
rep(
  "const FS107_NOTE = 'FS 107 (West Wolf Creek Road) is open to vehicles — owner, first-hand, 2026-10-05. Park clear of the roadway at the trail crossing; USFS allows roadside parking up to 14 days.';",
  `const CBT_SAT_SOURCE = 'Real OSM way geometry, merged Coosa Backcountry Trail chain, cut at the 1.02mi (Burnett Gap) and 3.37mi (WOLF-X) survey mile-markers (research/coosa-geometry-survey.md Task 6).';
const SITE_P_NOTE = 'No OSM way joins site P to the backcountry trailhead (the survey found the same ~0.35 mi of park connector path unmapped): straight line, about 250 m on park paths. Green blazes from the trailhead board.';
const BURNETT_BAILOUT_NOTE = 'Bail-out at Burnett Gap: the Burnett Creek Trail drops north 1.86 mi to Burnett Creek Road (FS 261), a forest road a truck can reach — mapped path only, condition UNCONFIRMED. Quickest way off the ridge on the Vogel side.';
const WOLF_X_WATER_NOTE = 'First water since the park: nothing on the ridge from the trailhead over Burnett Gap. Fill 2 L each here before the Calf Stomp climb.';
const VOGEL_PERMIT_NOTE = 'Backcountry camping on the Coosa Trail is BY PERMIT, first come-first served (gastateparks.org/Vogel/Trails, fetched 2026-09-21). Get it at the Visitor Center before walking out. Truck 1 sits in the Vogel trailhead lot on a ParkPass; whether multi-day overnight parking there is allowed is UNCONFIRMED (same desk, same question).';`);

// E. Saturday legs
rep(
  `  console.log('\\n=== Oct 17 — truck to WOLF-X, pan, trail over Calf Stomp Gap to Calf Stump Branch ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp (Vogel)', 40));
  const { leg: driveIn, gapM, last } = await driveToWolfX('Vogel to WOLF-X via FS 107 (truck 1)', 'vogel_wolfx');
  legs.push(driveIn);
  if (gapM > 100) legs.push(await walkLeg('Parking to the trail crossing', [last, WOLF_X], 'approximate', \`OSRM stopped \${gapM.toFixed(0)} m short of the crossing (FS 107 track); straight line.\`, GROUP_FACTOR, 'oct17_parkgap'));
  legs.push(panLeg({ label: 'Pan West Fork Wolf Creek at the crossing', lat: WOLF_X[0], lng: WOLF_X[1], minutes: 120, gold: WOLF_X_GOLD }));`,
  `  console.log('\\n=== Oct 17 — walk from Vogel over Burnett Gap, pan, trail over Calf Stomp Gap to Calf Stump Branch ===');
  const legs = [];
  legs.push(mealLeg('Breakfast at camp (Vogel)', 40));
  legs.push(await walkLeg('Site P to the Coosa Backcountry Trailhead', [[POINTS.vogel_basecamp.lat, POINTS.vogel_basecamp.lng], [POINTS.vogel_trailhead.lat, POINTS.vogel_trailhead.lng]], 'approximate', SITE_P_NOTE, GROUP_FACTOR * PACK_FACTOR, 'oct17_sitep', { note: VOGEL_PERMIT_NOTE }));
  legs.push(await walkLeg('Trailhead up to Burnett Gap (Coosa Backcountry Trail, green blaze)', trailheadToBurnett, 'exact', CBT_SAT_SOURCE, GROUP_FACTOR * PACK_FACTOR, 'oct17_burnett', { note: BURNETT_BAILOUT_NOTE }));
  legs.push(await walkLeg('Burnett Gap down to WOLF-X, the West Fork Wolf Creek / FS 107 crossing', burnettToWolfX, 'exact', CBT_SAT_SOURCE, GROUP_FACTOR * PACK_FACTOR, 'oct17_wolfx'));
  legs.push(panLeg({ label: 'Pan West Fork Wolf Creek at the crossing', lat: WOLF_X[0], lng: WOLF_X[1], minutes: 60, gold: WOLF_X_GOLD, note: WOLF_X_WATER_NOTE }));`);

rep(
  "    day: 3, date: '2026-10-17', title: 'Truck to WOLF-X, pan, hike over Calf Stomp Gap, camp at Calf Stump Branch', optional: false,",
  "    day: 3, date: '2026-10-17', title: 'Walk from Vogel over Burnett Gap, pan West Fork Wolf Creek, over Calf Stomp Gap, camp at Calf Stump Branch', optional: false,");

rep(
  "    note: 'Truck 1 stays at WOLF-X until Monday. Truck 2 is already at BOWERS-FS on Bowers Road (staged Friday evening). Deer season opens today: blaze orange on everyone.',",
  "    note: 'Changed 2026-10-17 (owner): the day is walked from camp, not driven to WOLF-X. Longest day of the trip with full packs. Backcountry permit at the Visitor Center before walking out. Truck 1 stays in the Vogel trailhead lot (ParkPass); truck 2 is already at BOWERS-FS on Bowers Road (staged Friday evening). No water between the park and WOLF-X: carry 2 L each. Deer season opens today: blaze orange on everyone.',");

// F. Monday shuttle: one drive, BOWERS-FS straight to Vogel
rep(
  `  legs.push(await driveLeg('BOWERS-FS up Bowers Road and over Owltown Gap to WOLF-X (truck 2) to collect truck 1', TRUCK2_PT, WOLF_X_PT, 'bowersfs_wolfx', { access_confidence: 'unconfirmed', access_note: BOWERS_NOTE + ' ' + FS107_NOTE }));
  legs.push(await driveLeg('WOLF-X to Vogel (both trucks)', WOLF_X_PT, POINTS.vogel_basecamp, 'wolfx_vogel', { access_note: FS107_NOTE }));`,
  `  legs.push(await driveLeg('BOWERS-FS up Bowers Road and over Owltown Gap straight to Vogel (truck 2)', TRUCK2_PT, POINTS.vogel_basecamp, 'bowersfs_vogel', { access_confidence: 'unconfirmed', access_note: BOWERS_NOTE }));`);

rep(
  "    note: 'Last day out: pan the morning at camp, then walk out. Down the creek to the road, the road to truck 2 at BOWERS-FS (Bowers Road, Forest Service ground, 0.68 mi below Owltown Gap), drive to WOLF-X for truck 1, both trucks to Vogel.",
  "    note: 'Last day out: pan the morning at camp, then walk out. Down the creek to the road, the road to truck 2 at BOWERS-FS (Bowers Road, Forest Service ground, 0.68 mi below Owltown Gap), then straight to Vogel — truck 1 is already in the Vogel lot (changed 2026-10-17; the day-1 drive to WOLF-X is gone).");

if (WAS_CRLF) t = t.replace(/\n/g, '\r\n');
fs.writeFileSync(f, t);
console.log(`patched ${f}: ${n0} -> ${t.length} bytes`);
