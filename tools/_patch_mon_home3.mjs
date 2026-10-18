// One-off fix, 2026-10-18: the previous inline edit lost its backslash escapes
// and left unescaped apostrophes ("o'clock") inside a single-quoted JS string,
// breaking _build_backcountry.mjs. Reword without apostrophes.
import fs from 'node:fs';

function fix(file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  const crlf = t.includes('\r\n');
  if (crlf) t = t.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) { console.log(`  (already clean in ${file}) ${a.slice(0, 40)}`); continue; }
    t = t.split(a).join(b);
  }
  if (crlf) t = t.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, t);
  console.log(`fixed ${file}`);
}

const BAD = "rolling about 10:10 — that is the 10 o'clock option. For the 8 o'clock option start breakfast at 6:00.";
const GOOD = 'rolling about 10:10 — that is the 10 AM option. For the 8 AM option, start breakfast at 6:00.';

const BAD2 = "that is the 10 o'clock option; for the 8 o'clock option start breakfast at 6:00.";
const GOOD2 = 'that is the 10 AM option; for the 8 AM option, start breakfast at 6:00.';

fix('map/data/_build_backcountry.mjs', [[BAD, GOOD]]);
fix('PLAN.md', [[BAD2, GOOD2]]);
fix('RUNDOWN.md', [[BAD2, GOOD2]]);
