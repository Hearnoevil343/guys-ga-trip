"""
Build index.html: one navigable hub for the whole trip plan.
Tabs: Start / Rundown (iframe RUNDOWN.html) / Map (iframe map/trip-map.html) /
Buy list (rendered from BUY_LIST.md) / Files. Works from file:// (no server).

Usage:  python tools/build_hub.py     (run build_buy_list.py first if picks changed)
Output: E:\\dev\\ga-gold-trip\\index.html
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "index.html"

# --- buy list table from BUY_LIST.md ---------------------------------------
rows, total = [], ""
for line in (ROOT / "BUY_LIST.md").read_text(encoding="utf-8").splitlines():
    if line.startswith("**Total"):
        total = line.strip("*")
    if line.startswith("|") and not line.startswith("|---") and "Order first?" not in line:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 9:
            rows.append(cells)

import json
import openpyxl

wb = openpyxl.load_workbook(ROOT / "Gear_Picker.xlsx")
_opt = {}
for r in range(2, wb["Options"].max_row + 1):
    o = wb["Options"]
    if o.cell(r, 1).value is None:
        continue
    try:
        split = max(1, int(o.cell(r, 18).value or 1))
    except (TypeError, ValueError):
        split = 1
    _opt.setdefault(o.cell(r, 1).value, {})[o.cell(r, 3).value] = {
        "name": f"{o.cell(r, 4).value or ''} {o.cell(r, 5).value or ''}".strip(),
        "oz": o.cell(r, 6).value or 0, "price": o.cell(r, 8).value or 0,
        "url": o.cell(r, 9).value or "", "where": o.cell(r, 11).value or "",
        "note": (o.cell(r, 12).value or "")[:160], "split": split}
ITEMS = []
p = wb["Picker"]
for r in range(2, p.max_row + 1):
    key, dflt = p.cell(r, 3).value, p.cell(r, 5).value
    if not key or key not in _opt:
        continue
    ITEMS.append({"kit": p.cell(r, 1).value, "label": p.cell(r, 2).value, "key": key,
                  "req": p.cell(r, 4).value, "dflt": dflt, "opts": _opt[key]})
items_json = json.dumps(ITEMS).replace("</", "<" + chr(92) + "/")


PICKER_JS = """
const ITEMS = __ITEMS__;
const KEY = 'gagold-picks-v1';
let st = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => localStorage.setItem(KEY, JSON.stringify(st));
const money = n => '$' + n.toFixed(2);
function cur(it){
  const s = st[it.key] || {};
  return {ch: s.ch || it.dflt || 'Value', name: s.name || '', price: s.price || '', url: s.url || '', bought: !!s.bought};
}
function calc(it){
  const c = cur(it);
  if (c.ch === 'Skip' || c.ch === 'Own') return {cost:0, oz:0, name:c.ch==='Own'?'(own it)':'(skipped)'};
  if (c.ch === 'Custom') return {cost: parseFloat(c.price)||0, oz:0, name: c.name || '(type your item)'};
  const o = it.opts[c.ch]; if (!o) return {cost:0, oz:0, name:'-'};
  return {cost:o.price/o.split, oz:o.oz/o.split, name:o.name, o};
}
function esc(v){ return String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function pick(k, ch){ setF(k,'ch',ch); render(); }
function render(){
  const tb = document.getElementById('picks'); let h = '', kit = '';
  const tot = {};
  ITEMS.forEach(it => {
    if (it.kit !== kit){ kit = it.kit; h += `<tr class="grp"><td colspan="8">${kit}</td></tr>`; }
    const c = cur(it), r = calc(it);
    const cell = t => { const o = it.opts[t]; if (!o) return '<td class="opt none">-</td>';
      const on = c.ch === t;
      return `<td class="opt${on?' on':''}" onclick="pick('${it.key}','${t}')"><span class="ck">${on?'&#10003;':''}</span>`
        + `<b>${esc(o.name)}</b><br>${money(o.price/o.split)}${o.split>1?` <small>(1/${o.split} of ${money(o.price)})</small>`:''}`
        + `<br><small>${esc(o.where)}</small>` + (o.url ? ` <a href="${esc(o.url)}" target="_blank" onclick="event.stopPropagation()">link</a>` : '') + `</td>`; };
    const mine = c.ch === 'Custom';
    const custom = `<td class="opt mine${mine?' on':''}" onclick="pick('${it.key}','Custom')"><span class="ck">${mine?'&#10003;':''}</span>`
      + `<input placeholder="my item" value="${esc(c.name)}" data-k="${it.key}" data-f="name" onclick="event.stopPropagation()" oninput="setF(this.dataset.k,this.dataset.f,this.value);setF(this.dataset.k,'ch','Custom')" onchange="render()"><br>`
      + `$<input size="6" placeholder="price" value="${esc(c.price)}" data-k="${it.key}" data-f="price" onclick="event.stopPropagation()" oninput="setF(this.dataset.k,this.dataset.f,this.value);setF(this.dataset.k,'ch','Custom')" onchange="render()"><br>`
      + `<input placeholder="link (optional)" value="${esc(c.url)}" data-k="${it.key}" data-f="url" onclick="event.stopPropagation()" oninput="setF(this.dataset.k,this.dataset.f,this.value);setF(this.dataset.k,'ch','Custom')" onchange="render()">`
      + (mine && c.url ? ` <a href="${esc(c.url)}" target="_blank" onclick="event.stopPropagation()">open</a>` : '') + `</td>`;
    const small = (t) => `<td class="opt small${c.ch===t?' on':''}" onclick="pick('${it.key}','${t}')"><span class="ck">${c.ch===t?'&#10003;':''}</span>${t}</td>`;
    const cls = (it.req==='must'?'must':'nice') + (c.bought?' done':'');
    h += `<tr class="${cls}">`
      + `<td><input type="checkbox" ${c.bought?'checked':''} data-k="${it.key}" onchange="setF(this.dataset.k,'bought',this.checked);render()"></td>`
      + `<td class="lbl">${esc(it.label)}<br><small>${it.req==='must'?'must-have':it.req==='alt'?'alternate':'nice-to-have'}</small></td>`
      + cell('Budget') + cell('Value') + cell('Premium') + custom + small('Own') + small('Skip') + `</tr>`;
    tot[it.kit] = tot[it.kit] || {cost:0, oz:0, left:0};
    tot[it.kit].cost += r.cost; tot[it.kit].oz += r.oz;
    if (!c.bought && c.ch!=='Skip' && c.ch!=='Own') tot[it.kit].left += r.cost;
  });
  tb.innerHTML = h;
  let g = 0, oz = 0, left = 0, lines = '';
  Object.keys(tot).forEach(k => { g += tot[k].cost; left += tot[k].left; if (k!=='Base Camp Personal') oz += tot[k].oz;
    lines += `${k}: ${money(tot[k].cost)} &nbsp; `; });
  document.getElementById('totals').innerHTML = `<b>Total ${money(g)}</b> &nbsp;|&nbsp; still to buy ${money(left)}`
    + ` &nbsp;|&nbsp; worn + pack ${(oz/16).toFixed(1)} lb (base camp gear excluded) &nbsp;|&nbsp; ${lines}`;
}
function setF(k, f, v){ st[k] = st[k] || {}; st[k][f] = v; save(); if (f==='name'||f==='price') totalsOnly(); }
function totalsOnly(){ /* typing in custom boxes: full render on blur/change */ }
function resetAll(){ if (confirm('Reset all your picks to the defaults?')){ st = {}; save(); render(); } }
function copyList(){
  const t = ITEMS.map(it => { const c = cur(it), r = calc(it);
    return (c.bought?'[x] ':'[ ] ')+it.label+' - '+r.name+' - '+money(r.cost); }).join(String.fromCharCode(10));
  navigator.clipboard.writeText(t).then(()=>alert('List copied'));
}
render();
"""

picker_js = PICKER_JS.replace("__ITEMS__", items_json)

files = [
    ("Gear_Picker.xlsx", "Pick Budget/Value/Premium per row; Dashboard totals update live (open in Excel)"),
    ("BUY_LIST.md", "Same list as the Buy tab, plain text"),
    ("RUNDOWN.html", "Full ~20-page guide (also RUNDOWN.md)"),
    ("map/trip-map.html", "Interactive map, layers, legality banners"),
    ("map/trip.gpx", "Waypoints for Gaia / CalTopo / OnX offline"),
    ("PLAN.md", "Facts, decisions, open items"),
]
file_rows = "".join(f'<tr><td><a href="{f}" target="_blank">{f}</a></td><td>{d}</td></tr>' for f, d in files)

page = f"""<!doctype html><html><head><meta charset="utf-8"><title>GA Gold Trip - Oct 15-21 2026</title>
<style>
body{{margin:0;font:15px/1.5 Calibri,Segoe UI,sans-serif;color:#222;background:#f6f7f4}}
header{{background:#2F5233;color:#fff;padding:12px 20px}} header h1{{margin:0;font-size:20px}}
nav{{display:flex;gap:4px;background:#2F5233;padding:0 16px}}
nav button{{background:#3d6a42;color:#fff;border:0;padding:10px 18px;cursor:pointer;font-size:15px;border-radius:6px 6px 0 0}}
nav button.on{{background:#f6f7f4;color:#2F5233;font-weight:bold}}
section{{display:none;padding:18px 24px}} section.on{{display:block}}
iframe{{width:100%;height:calc(100vh - 110px);border:0;background:#fff}}
table{{border-collapse:collapse;width:100%;background:#fff}} td,th{{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}}
th{{background:#2F5233;color:#fff}} tr.grp td{{background:#E4EEE0;font-weight:bold;color:#2F5233}} tr.nice td.lbl{{color:#555}} td.opt{{cursor:pointer;font-size:13px;min-width:130px;position:relative}} td.opt:hover{{background:#f0f5ee}} td.opt.on{{background:#d9ead3;outline:2px solid #2F5233;outline-offset:-2px}} td.small{{text-align:center;min-width:44px}} td.none{{color:#aaa;text-align:center;cursor:default}} .ck{{position:absolute;top:2px;right:6px;color:#2F5233;font-weight:bold;font-size:16px}} td.mine input{{width:95%;box-sizing:border-box;margin:1px 0}} td.mine input[size]{{width:60%}} tr.done td{{background:#eef6ea;text-decoration:line-through;color:#888}} td.tiers{{font-size:12px;color:#555}} small{{color:#666}}
.card{{background:#fff;border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin:10px 0}}
</style></head><body>
<header><h1>Georgia Gold Trip &mdash; Oct 15&ndash;21, 2026 &middot; Vogel State Park base camp</h1></header>
<nav id="tabs">
<button data-t="start" class="on">Start</button><button data-t="rundown">Rundown</button>
<button data-t="map">Map</button><button data-t="buy">Buy list</button><button data-t="files">Files</button></nav>

<section id="start" class="on">
<div class="card"><b>The trip:</b> 6 people, Site P walk-in (2 tents, 2 vehicles), arrive Thu Oct 15, leave Wed Oct 21.
Panning at drive-up creeks + Consolidated Gold Mine tour + Dahlonega, plus one backcountry night (Mon&ndash;Tue 19&ndash;20).</div>
<div class="card"><b>Overnight:</b> primary Three Forks / Noontootla Creek; backup Rock Creek (Fannin). Not yet ranger-confirmed legal.</div>
<div class="card"><b>Dates that matter:</b> firearms deer season opens Oct 17 (blaze orange). Gold Rush Days Oct 17&ndash;18 (visit Dahlonega Fri 16).
Panning banned in Wilderness, state parks, Smithgall Woods; National Forest = hand pan + trowel only.</div>
<div class="card"><b>Gear:</b> {html.escape(total)} &middot; base weight 12.8 lb, 18.0 lb loaded. Order the tent + quilt first (2&ndash;4 wk).</div>
<div class="card"><b>Still to do:</b> phone calls (Vogel, Blue Ridge Ranger District, GA DNR, Consolidated, Lumpkin Co, LDMA), then re-check fire bans/water/roads in early Oct.</div>
<p>Use the tabs above. Rundown = full guide, Map = where everything is, Buy list = what to order and when.</p>
</section>

<section id="rundown"><iframe src="RUNDOWN.html"></iframe></section>
<section id="map"><iframe src="map/trip-map.html"></iframe></section>
<section id="buy"><p>Click a box in a row to choose it (&#10003;): Budget, Value or Premium. Use the <b>Mine</b> box to type your own item, price and link, or click <b>Own</b> / <b>Skip</b>. Tick "Got it" when bought. Totals are your share (group gear is split). Your picks save in this browser only.</p>
<p><button onclick="resetAll()">Reset to defaults</button> <button onclick="copyList()">Copy my list</button></p>
<div id="totals" class="card"></div>
<table id="picker"><tr><th>Got it</th><th>Item</th><th>Budget</th><th>Value</th><th>Premium</th><th>Mine (type your own)</th><th>Own</th><th>Skip</th></tr><tbody id="picks"></tbody></table></section>

<section id="files"><table><tr><th>File</th><th>What it is</th></tr>{file_rows}</table></section>

<script>
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{{
 document.querySelectorAll('#tabs button,section').forEach(e=>e.classList.remove('on'));
 b.classList.add('on');document.getElementById(b.dataset.t).classList.add('on');
 location.hash=b.dataset.t;}});
const h=location.hash.slice(1);if(h){{const b=document.querySelector('[data-t='+h+']');if(b)b.click();}}
</script><script>{picker_js}</script></body></html>"""

OUT.write_text(page, encoding="utf-8")
print(f"Wrote {OUT} ({len(ITEMS)} picker rows)")
