// ISSUES #46: fail if the APK's bundled pages differ from the repo's.
//
// The hub, the maps and the APK are built from the same sources but released
// separately, so the APK on GitHub can silently lag the published hub (it did
// once: ISSUES #29). This reads the APK itself (it is a zip) and compares the
// files it carries under assets/public/ with the repo copies.
//
//   node app/check-apk-sync.mjs [path-to.apk]
//
// Exit 0: every checked file matches. Exit 1: a mismatch, a missing file, or no
// APK. Run it after `npx cap sync android` + `gradlew assembleDebug`, before the
// release.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DEFAULT_APK = path.join(here, 'android/app/build/outputs/apk/debug/app-debug.apk');

// Repo path -> path inside the APK. index.html is the one ISSUES #46 names; the
// others ride along because the same release carries them.
const CHECK = [
  ['index.html', 'assets/public/index.html'],
  ['RUNDOWN.html', 'assets/public/RUNDOWN.html'],
  ['gear-checkin.html', 'assets/public/gear-checkin.html'],
  ['map/map3d-data.js', 'assets/public/map/map3d-data.js'],
  ['map/map3d.js', 'assets/public/map/map3d.js'],
  ['map/trip.gpx', 'assets/public/map/trip.gpx'],
];

// --- minimal zip reader (no dependencies) ---------------------------------
function readCentralDirectory(buf) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65557; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, e) {
  if (buf.readUInt32LE(e.localOff) !== 0x04034b50) throw new Error('bad local file header');
  const nameLen = buf.readUInt16LE(e.localOff + 26);
  const extraLen = buf.readUInt16LE(e.localOff + 28);
  const start = e.localOff + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`unsupported compression method ${e.method}`);
}

// Line endings differ between a git checkout and a copy, and tell us nothing
// about whether the content is current.
const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '\n');

// --- run -----------------------------------------------------------------
const apkPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_APK;
if (!fs.existsSync(apkPath)) {
  console.error(`FAIL: no APK at ${apkPath}`);
  console.error('Build one first: cd app/android && JAVA_HOME=E:/dev-tools/jdk21 ./gradlew.bat assembleDebug');
  process.exit(1);
}
const apk = fs.readFileSync(apkPath);
const entries = readCentralDirectory(apk);
console.log(`APK: ${apkPath} (${apk.length.toLocaleString()} bytes, ${entries.size} entries)`);

let bad = 0;
for (const [repoRel, apkRel] of CHECK) {
  const repoAbs = path.join(root, repoRel);
  if (!fs.existsSync(repoAbs)) { console.log(`  MISSING in repo: ${repoRel}`); bad++; continue; }
  const e = entries.get(apkRel);
  if (!e) { console.log(`  MISSING in APK: ${apkRel}`); bad++; continue; }
  const a = norm(readEntry(apk, e));
  const b = norm(fs.readFileSync(repoAbs));
  if (a === b) { console.log(`  same: ${repoRel}`); continue; }
  bad++;
  const al = a.split('\n'), bl = b.split('\n');
  let i = 0;
  while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
  console.log(`  DIFFERS: ${repoRel} (APK ${al.length} lines, repo ${bl.length} lines; first difference at line ${i + 1})`);
  console.log(`    APK : ${(al[i] ?? '<end of file>').trim().slice(0, 120)}`);
  console.log(`    repo: ${(bl[i] ?? '<end of file>').trim().slice(0, 120)}`);
}

if (bad) {
  console.error(`\nFAIL: ${bad} of ${CHECK.length} files do not match. Rebuild before releasing:`);
  console.error('  node app/build-www.mjs && cd app && npx cap sync android');
  console.error('  cd app/android && JAVA_HOME=E:/dev-tools/jdk21 ./gradlew.bat assembleDebug');
  process.exit(1);
}
console.log(`\nOK: all ${CHECK.length} checked files in the APK match the repo.`);
