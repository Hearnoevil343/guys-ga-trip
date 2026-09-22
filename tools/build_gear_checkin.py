"""
Build gear-checkin.html for the GA Gold Trip (Oct 15-21 2026) -- a static,
phone-first page each guy opens to tick the personal gear he's bringing and
which group items he's covering, then download or email his list to the
Captain. No server, no dependencies -- everything (data + JS) is inlined.

Personal-gear categories/items mirror the Picker rows in build_gear_picker.py
(research/gear-tiers-*.json), trimmed to plain checklist labels (no
tier/brand -- this page is "are you bringing it", not "which one to buy").

Usage:  python tools/build_gear_checkin.py
Output: E:\\dev\\ga-gold-trip\\gear-checkin.html
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "gear-checkin.html"

# ----------------------------------------------------------------------------
# Personal gear checklist -- mirrors PICKER_ROWS labels in build_gear_picker.py
# ----------------------------------------------------------------------------
PERSONAL_KITS = [
    ("Worn", [
        "Hiking footwear",
        "Hiking socks (bring 3 pair, no cotton)",
        "Hiking pants (no cotton)",
        "Warm hat / beanie",
        "Blaze orange hat or vest (required, deer season)",
        "Light liner gloves",
    ]),
    ("Overnight pack", [
        "Backpack, 40-60L",
        "Tent/shelter (your share, split w/ tentmate)",
        "Sleeping bag/quilt (30F recommended)",
        "Sleeping pad, insulated R>=4",
        "Pillow",
        "Tent footprint / groundsheet",
        "Dry sack (sleep system)",
        "Pack liner (waterproof)",
        "Rain jacket",
        "Insulated puffy jacket",
        "Fleece / active midlayer",
        "Base layer top + bottom (doubles as sleep layer)",
        "Spork / eating utensil",
        "Water bottle(s)",
        "Headlamp",
        "Power bank",
        "Knife / multitool",
        "Trowel + hygiene kit",
        "Offline navigation / maps",
    ]),
    ("Trail creek kit", [
        "Gold pan",
        "Insulated waterproof panning gloves",
        "Neoprene wading socks (3mm)",
        "Snuffer bottle",
        "Gold vials",
        "Crevice tool",
        "Magnifier / loupe",
        "Small trowel",
    ]),
    ("Base camp personal", [
        "Classifier (share one on the trail)",
        "Knee pad",
        "Waders (optional -- plan only needs shin-deep)",
        "Camp/creek shoes",
        "Sit pad",
        "Trekking poles",
    ]),
]

# ----------------------------------------------------------------------------
# Group items -- from the handoff brief; "count" items get a qty field
# ----------------------------------------------------------------------------
GROUP_ITEMS = [
    {"label": "First aid kit (group, base camp)", "count": False},
    {"label": "Backcountry stove(s)", "count": True},
    {"label": "Fuel canisters", "count": True},
    {"label": "Water filter", "count": False},
    {"label": "Backup purification tablets", "count": False},
    {"label": "Ursack (bear-resistant food storage)", "count": False},
    {"label": "Satellite messenger (rented)", "count": False},
    {"label": "Cook pot (backcountry)", "count": False},
    {"label": "Base-camp propane (2-burner stove)", "count": False},
    {"label": "Base-camp coolers", "count": True},
]

DATA = {"personal": PERSONAL_KITS, "group": GROUP_ITEMS}

HTML = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GA Gold Trip -- Gear Check-in</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font:16px/1.45 Calibri,Segoe UI,sans-serif;color:#222;background:#f6f7f4;padding-bottom:40px}
header{background:#2F5233;color:#fff;padding:14px 16px}
header h1{margin:0;font-size:19px}
header p{margin:4px 0 0;font-size:13px;color:#cfe0cf}
main{padding:14px 14px 0;max-width:640px;margin:0 auto}
.card{background:#fff;border:1px solid #ccc;border-radius:8px;padding:12px 14px;margin:12px 0}
.card h2{margin:0 0 8px;font-size:16px;color:#2F5233}
.card p.hint{margin:0 0 10px;font-size:13px;color:#666}
label.name{display:block;font-weight:bold;margin-bottom:4px}
input[type=text]#name{width:100%;font-size:16px;padding:8px;border:1px solid #999;border-radius:6px}
.kit{margin-bottom:14px}
.kit h3{margin:0 0 4px;font-size:14px;color:#2F5233;border-bottom:1px solid #e0e0e0;padding-bottom:3px}
.row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0}
.row:last-child{border-bottom:0}
.row input[type=checkbox]{width:20px;height:20px;flex:none}
.row label.item{flex:1;font-size:14.5px}
.row input.note{flex:none;width:38%;font-size:13px;padding:5px;border:1px solid #ccc;border-radius:5px}
.row input.qty{flex:none;width:56px;font-size:13px;padding:5px;border:1px solid #ccc;border-radius:5px;text-align:center}
textarea#extras{width:100%;min-height:70px;font-size:14.5px;padding:8px;border:1px solid #999;border-radius:6px;font-family:inherit}
.btnrow{position:sticky;bottom:0;background:#f6f7f4;padding:10px 14px 16px;display:flex;gap:10px;max-width:640px;margin:0 auto}
button{flex:1;font-size:15px;padding:13px 8px;border:0;border-radius:8px;cursor:pointer;font-weight:bold}
#dl{background:#2F5233;color:#fff}
#mail{background:#3d6a42;color:#fff}
#status{max-width:640px;margin:0 auto;padding:0 14px;font-size:12.5px;color:#666;min-height:18px}
.gaps{font-size:13px;color:#888;margin-top:8px}
</style></head><body>
<header>
<h1>GA Gold Trip &mdash; Gear Check-in</h1>
<p>Tick what you're bringing, then download or email your list to the Captain.</p>
</header>
<main>
<div class="card">
<label class="name" for="name">Your name</label>
<input type="text" id="name" placeholder="e.g. Mike">
</div>

<div class="card">
<h2>Your personal gear</h2>
<p class="hint">Tick each item you're bringing. Add a note (brand, size, "borrowing from X") if useful -- optional.</p>
<div id="personal"></div>
</div>

<div class="card">
<h2>Group items I'm covering</h2>
<p class="hint">Tick anything you'll personally bring/buy for the whole group. Add a count where it matters (fuel canisters, coolers).</p>
<div id="group"></div>
</div>

<div class="card">
<h2>Anything else</h2>
<textarea id="extras" placeholder="Extra gear, questions, anything the Captain should know..."></textarea>
</div>
</main>
<div id="status"></div>
<div class="btnrow">
<button id="dl">Download my list</button>
<button id="mail">Email to Captain</button>
</div>

<script>
const DATA = __DATA_JSON__;
const CAPTAIN_EMAIL = "jordanthomas208@gmail.com";
const MAILTO_LIMIT = 1800;

function el(tag, attrs, children){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs) e.setAttribute(k, attrs[k]);
  (children||[]).forEach(c => e.appendChild(c));
  return e;
}
function text(s){ return document.createTextNode(s); }

function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

function buildPersonal(){
  const root = document.getElementById('personal');
  DATA.personal.forEach(([kit, items]) => {
    const kitDiv = el('div', {class:'kit'});
    kitDiv.appendChild(el('h3', null, [text(kit)]));
    items.forEach(item => {
      const id = 'p-' + slug(kit) + '-' + slug(item);
      const cb = el('input', {type:'checkbox', id:id, 'data-kit':kit, 'data-item':item});
      const lbl = el('label', {class:'item', for:id}, [text(item)]);
      const note = el('input', {type:'text', class:'note', placeholder:'note (optional)', id:id+'-note'});
      const row = el('div', {class:'row'}, [cb, lbl, note]);
      kitDiv.appendChild(row);
    });
    root.appendChild(kitDiv);
  });
}

function buildGroup(){
  const root = document.getElementById('group');
  DATA.group.forEach((g, i) => {
    const id = 'g-' + i;
    const cb = el('input', {type:'checkbox', id:id, 'data-item':g.label});
    const lbl = el('label', {class:'item', for:id}, [text(g.label)]);
    const row = el('div', {class:'row'}, [cb, lbl]);
    if(g.count){
      const qty = el('input', {type:'text', inputmode:'numeric', class:'qty', placeholder:'qty', id:id+'-qty'});
      row.appendChild(qty);
    }
    root.appendChild(row);
  });
}

function collect(){
  const name = document.getElementById('name').value.trim() || '(no name entered)';
  const bringing = [], gaps = [];
  DATA.personal.forEach(([kit, items]) => {
    items.forEach(item => {
      const id = 'p-' + slug(kit) + '-' + slug(item);
      const cb = document.getElementById(id);
      const note = document.getElementById(id+'-note').value.trim();
      if(cb.checked){
        bringing.push('[' + kit + '] ' + item + (note ? ' -- ' + note : ''));
      } else {
        gaps.push('[' + kit + '] ' + item);
      }
    });
  });
  const covering = [], groupGaps = [];
  DATA.group.forEach((g, i) => {
    const id = 'g-' + i;
    const cb = document.getElementById(id);
    if(cb.checked){
      let line = g.label;
      if(g.count){
        const qty = document.getElementById(id+'-qty').value.trim();
        if(qty) line += ' (qty: ' + qty + ')';
      }
      covering.push(line);
    } else {
      groupGaps.push(g.label);
    }
  });
  const extras = document.getElementById('extras').value.trim();
  return {name, bringing, gaps, covering, groupGaps, extras};
}

function renderReport(d){
  const lines = [];
  lines.push('GA Gold Trip -- Gear Check-in');
  lines.push('Name: ' + d.name);
  lines.push('Date: ' + new Date().toLocaleDateString());
  lines.push('');
  lines.push('== Personal gear bringing ==');
  lines.push(d.bringing.length ? d.bringing.map(x => '- ' + x).join('\\n') : '(none ticked)');
  lines.push('');
  lines.push('== Personal gaps (recommended, not ticked) ==');
  lines.push(d.gaps.length ? d.gaps.map(x => '- ' + x).join('\\n') : '(none -- everything ticked)');
  lines.push('');
  lines.push('== Group items covering ==');
  lines.push(d.covering.length ? d.covering.map(x => '- ' + x).join('\\n') : '(none)');
  lines.push('');
  lines.push('== Group gaps (not covering) ==');
  lines.push(d.groupGaps.length ? d.groupGaps.map(x => '- ' + x).join('\\n') : '(none -- covering everything listed)');
  lines.push('');
  lines.push('== Extras ==');
  lines.push(d.extras || '(none)');
  return lines.join('\\n');
}

function setStatus(msg){ document.getElementById('status').textContent = msg; }

document.getElementById('dl').addEventListener('click', () => {
  const d = collect();
  const report = renderReport(d);
  const blob = new Blob([report], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = el('a', {href:url, download: 'gear-checkin-' + slug(d.name) + '.txt'});
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('Downloaded. Attach the .txt file if you email it separately.');
});

document.getElementById('mail').addEventListener('click', () => {
  const d = collect();
  const report = renderReport(d);
  const subject = encodeURIComponent('Gear check-in -- ' + d.name);
  const body = encodeURIComponent(report);
  if(body.length > MAILTO_LIMIT){
    setStatus('Your list is long -- some phone mail apps truncate it. Downloading the .txt instead; attach it to an email to ' + CAPTAIN_EMAIL + '.');
    document.getElementById('dl').click();
    return;
  }
  window.location.href = 'mailto:' + CAPTAIN_EMAIL + '?subject=' + subject + '&body=' + body;
  setStatus('Opening your mail app...');
});

buildPersonal();
buildGroup();
</script>
</body></html>
"""

html = HTML.replace("__DATA_JSON__", json.dumps(DATA))
OUT.write_text(html, encoding="utf-8")
print(f"Saved {OUT}")
