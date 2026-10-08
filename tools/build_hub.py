"""
Build index.html: one navigable hub for the whole trip plan.
Tabs: Start / Rundown (iframe RUNDOWN.html) / Map (iframe map/map3d.html) /
Buy list (rendered from BUY_LIST.md) / Files. Works from file:// (no server).

Usage:  python tools/build_hub.py     (run build_buy_list.py first if picks changed)
Output: E:\\dev\\ga-gold-trip\\index.html
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "index.html"

# The Rundown tab is an iframe on RUNDOWN.html. If RUNDOWN.md is newer, that
# tab would ship a stale story (ISSUES #3) — stop, do not build around it.
_md, _html = ROOT / "RUNDOWN.md", ROOT / "RUNDOWN.html"
if not _html.exists() or _md.stat().st_mtime > _html.stat().st_mtime + 1:
    raise SystemExit(
        "RUNDOWN.html is older than RUNDOWN.md (or missing).\n"
        "The Rundown tab would ship a stale build. Run:  python tools/build_rundown.py"
    )

# --- buy list table from BUY_LIST.md ---------------------------------------
# The Start card's "Gear:" number. BUY_LIST.md has no "**Total ..." line any
# more -- the totals moved into two tables, which left the card blank
# (ISSUES #5). Both tables have a "| **Solid** |" row with five cells, so read
# them by which heading they sit under, and fail loudly if neither is found.
rows, total = [], ""
_gear_total = _trip_total = ""
_heading = ""
for line in (ROOT / "BUY_LIST.md").read_text(encoding="utf-8").splitlines():
    if line.startswith("## "):
        _heading = line[3:].strip().lower()
    if line.startswith("| **Solid**"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[-1].startswith("$"):
            if _heading.startswith("at a glance"):
                _gear_total = cells[-1]
            elif _heading.startswith("trip total"):
                _trip_total = cells[-1]
    if line.startswith("**Total"):
        total = line.strip("*")
    if line.startswith("|") and not line.startswith("|---") and "Order first?" not in line:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 9:
            rows.append(cells)

import json
import openpyxl

import sys
sys.path.insert(0, str(ROOT / "tools"))
import buy_data as bd

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
    if key in bd.SLEEP_KEYS_EXCLUDED:
        continue  # superseded by the dedicated sleep-temperature section below
    # Solid set = whatever CHOICE is currently saved in Gear_Picker.xlsx (the
    # same "choice" build_buy_list.py's Solid loop reads). Budget set = the
    # cheapest tier, unless build_buy_list.py's safety override bumps it up --
    # both read bd.BUDGET_TIER_OVERRIDE so they can never disagree.
    ITEMS.append({"kit": p.cell(r, 1).value, "label": p.cell(r, 2).value, "key": key,
                  "req": p.cell(r, 4).value, "dflt": dflt, "opts": _opt[key],
                  "solidTier": dflt, "budgetTier": bd.BUDGET_TIER_OVERRIDE.get(key, "Budget"),
                  "section": bd.KEY_SECTION.get(key, bd.SECTION_OVERNIGHT_SHARED)})
items_json = json.dumps(ITEMS).replace("</", "<" + chr(92) + "/")

# --- sleep-temperature section (40F / 30F / 20F, bag + pad, budget/solid) --
sleep_by_key = bd.load_sleep_temp()
SLEEP = {}
for temp in bd.TEMP_ORDER:
    SLEEP[temp] = {}
    for kind in ("bag", "pad"):
        SLEEP[temp][kind] = {}
        for tier in ("budget", "solid"):
            it = sleep_by_key[(temp, kind, tier)]
            SLEEP[temp][kind][tier] = {
                "name": f"{it['brand']} {it['model']}", "note": it["rating_note"],
                "price": it["price_usd"], "url": it["price_url"], "where": it["where_to_buy"],
            }
sleep_json = json.dumps(SLEEP).replace("</", "<" + chr(92) + "/")
temp_order_json = json.dumps(bd.TEMP_ORDER)
default_temp_json = json.dumps(bd.DEFAULT_TEMP)

# --- Extras (small items/consumables, car-camp group gear, food) -----------
# Each row is tagged with its layout section (base_camp/overnight_personal/
# overnight_shared/panning/consumables/food) using the same bd.extras_section()
# logic BUY_LIST.md uses, so the two can never disagree.
EXTRAS = bd.load_extras()
for _e in EXTRAS:
    _e["layoutSection"] = bd.extras_section(_e)
extras_json = json.dumps(EXTRAS).replace("</", "<" + chr(92) + "/")
GEAR_SECTIONS_JSON = json.dumps(bd.GEAR_SECTIONS)
SECTION_TITLES_JSON = json.dumps(bd.SECTION_TITLES)


PICKER_JS = """
const ITEMS = __ITEMS__;
const SLEEP = __SLEEP__;
const TEMP_ORDER = __TEMP_ORDER__;
const DEFAULT_TEMP = __DEFAULT_TEMP__;
const EXTRAS = __EXTRAS__;
const GEAR_SECTIONS = __GEAR_SECTIONS__;
const SECTION_TITLES = __SECTION_TITLES__;
// v2: adds Budget-set/Solid-set buttons, the sleep-temperature section and
// the extras (small items/car-camp/food) sections. Bumped from v1 so an old
// saved shape (flat item picks only) never gets misread by the new code.
const KEY = 'gagold-picks-v2';
let st = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => localStorage.setItem(KEY, JSON.stringify(st));
let LAST = {};
const money = n => '$' + n.toFixed(2);
// Round amountDollars/split to the nearest cent, round-half-up, using
// integer-cent arithmetic -- mirrors tools/buy_data.py's round_share() so
// this page's totals can never drift a cent from BUY_LIST.md on an
// exact-half-cent split (plain float round(x/split,2) gives inconsistent
// answers depending on binary-float noise, e.g. $10.95/6 vs $12.99/6).
function roundShare(amountDollars, split){
  split = Math.max(1, Math.round(split) || 1);
  const totalCents = Math.round(amountDollars * 100);
  const q = Math.floor(totalCents / split);
  const r = totalCents - q * split;
  return (2 * r >= split ? q + 1 : q) / 100;
}
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
function setF(k, f, v){ st[k] = st[k] || {}; st[k][f] = v; save(); }
// Clicking Own ticks "Got it" automatically; clicking Own again (to leave it)
// restores whatever tier + Got-it state was active before Own was picked.
function toggleOwn(k){
  st[k] = st[k] || {};
  if (st[k].ch === 'Own'){
    const prev = st[k].ownPrev || {};
    st[k].ch = prev.ch || 'Value';
    st[k].bought = !!prev.bought;
    delete st[k].ownPrev;
  } else {
    st[k].ownPrev = {ch: st[k].ch || 'Value', bought: !!st[k].bought};
    st[k].ch = 'Own';
    st[k].bought = true;
  }
  save(); render();
}

// --- sleep temperature/tier state ------------------------------------------
function sleepCur(){
  const s = st.__sleep || {};
  return {rating: s.rating || DEFAULT_TEMP, tier: s.tier || 'solid', boughtBag: !!s.boughtBag, boughtPad: !!s.boughtPad};
}
function setSleep(f, v){ st.__sleep = Object.assign(sleepCur(), {[f]: v}); save(); render(); }
function sleepItem(rating, kind){ const c = sleepCur(); return SLEEP[rating][kind][c.tier]; }

// --- extras (small items / car-camp / food) state --------------------------
function extraCur(idx){ const s = (st.__extras || {})[idx] || {}; return {skip: !!s.skip, bought: !!s.bought}; }
function setExtra(idx, f, v){ st.__extras = st.__extras || {}; st.__extras[idx] = Object.assign(extraCur(idx), {[f]: v}); save(); render(); }

// --- Budget set / Solid set buttons -----------------------------------------
function applyPreset(which){
  ITEMS.forEach(it => { st[it.key] = st[it.key] || {}; st[it.key].ch = which === 'budget' ? it.budgetTier : it.solidTier; });
  st.__sleep = Object.assign(sleepCur(), {tier: which === 'budget' ? 'budget' : 'solid'});
  save(); render();
}

// Section running-totals: personal (full price, split=1 items), groupWhole
// (full shared-item price) and groupPerPerson (each person's rounded share).
function newSectionTotal(){ return {personal:0, groupWhole:0, groupPerPerson:0, oz:0, left:0}; }
function addToSection(sec, cost, oz, left, split, fullPrice){
  sec.oz += oz; sec.left += left;
  if (split > 1){ sec.groupWhole += fullPrice; sec.groupPerPerson += roundShare(fullPrice, split); }
  else { sec.personal += cost; }
}
function sectionLine(title, sec){
  return `<b>${esc(title)}:</b> personal ${money(sec.personal)} + group share ${money(sec.groupPerPerson)}`
    + ` (group total ${money(sec.groupWhole)}) = <b>${money(sec.personal+sec.groupPerPerson)}/person</b>`;
}

function render(){
  const tb = document.getElementById('picks'); let h = '';
  const sectionTotals = {}; GEAR_SECTIONS.forEach(s => sectionTotals[s] = newSectionTotal());

  GEAR_SECTIONS.forEach(sec => {
    h += `<tr class="grp"><td colspan="8">${esc(SECTION_TITLES[sec])}</td></tr>`;
    ITEMS.filter(it => it.section === sec).forEach(it => {
      const c = cur(it), r = calc(it);
      const cell = t => { const o = it.opts[t]; if (!o) return '<td class="opt none">-</td>';
        const on = c.ch === t;
        return `<td class="opt${on?' on':''}" onclick="pick('${it.key}','${t}')"><span class="ck">${on?'&#10003;':''}</span>`
          + `<b>${esc(o.name)}</b><br>${money(o.price)}${o.split>1?` <small>your share ${money(o.price/o.split)} (&divide;${o.split})</small>`:''}`
          + `<br><small>${esc(o.where)}</small>` + (o.url ? ` <a href="${esc(o.url)}" target="_blank" onclick="event.stopPropagation()">link</a>` : '') + `</td>`; };
      const mine = c.ch === 'Custom';
      const custom = `<td class="opt mine${mine?' on':''}" onclick="pick('${it.key}','Custom')"><span class="ck">${mine?'&#10003;':''}</span>`
        + `<input placeholder="my item" value="${esc(c.name)}" data-k="${it.key}" data-f="name" onclick="event.stopPropagation()" oninput="setF(this.dataset.k,this.dataset.f,this.value);setF(this.dataset.k,'ch','Custom')" onchange="render()"><br>`
        + `$<input size="6" placeholder="price" value="${esc(c.price)}" data-k="${it.key}" data-f="price" onclick="event.stopPropagation()" oninput="setF(this.dataset.k,this.dataset.f,this.value);setF(this.dataset.k,'ch','Custom')" onchange="render()"><br>`
        + `<input placeholder="link (optional)" value="${esc(c.url)}" data-k="${it.key}" data-f="url" onclick="event.stopPropagation()" oninput="setF(this.dataset.k,this.dataset.f,this.value);setF(this.dataset.k,'ch','Custom')" onchange="render()">`
        + (mine && c.url ? ` <a href="${esc(c.url)}" target="_blank" onclick="event.stopPropagation()">open</a>` : '') + `</td>`;
      const skipCell = `<td class="opt small${c.ch==='Skip'?' on':''}" onclick="pick('${it.key}','Skip')"><span class="ck">${c.ch==='Skip'?'&#10003;':''}</span>Skip</td>`;
      const ownCell = `<td class="opt small${c.ch==='Own'?' on':''}" onclick="toggleOwn('${it.key}')"><span class="ck">${c.ch==='Own'?'&#10003;':''}</span>Own</td>`;
      const cls = (it.req==='must'?'must':'nice') + (c.bought?' done':'');
      h += `<tr class="${cls}">`
        + `<td><input type="checkbox" ${c.bought?'checked':''} data-k="${it.key}" onchange="setF(this.dataset.k,'bought',this.checked);render()"></td>`
        + ownCell + skipCell
        + `<td class="lbl">${esc(it.label)}<br><small>${it.req==='must'?'must-have':it.req==='alt'?'alternate':'nice-to-have'}</small></td>`
        + cell('Budget') + cell('Value') + cell('Premium') + custom + `</tr>`;
      const o = it.opts[c.ch];
      const split = (c.ch !== 'Custom' && c.ch !== 'Skip' && c.ch !== 'Own' && o) ? o.split : 1;
      const left = (!c.bought && c.ch!=='Skip' && c.ch!=='Own') ? r.cost : 0;
      addToSection(sectionTotals[sec], r.cost, r.oz, left, split, o ? o.price : 0);
    });

    if (sec === 'overnight_personal'){
      const sc = sleepCur();
      const bagCost = sleepItem(sc.rating,'bag').price, padCost = sleepItem(sc.rating,'pad').price;
      sectionTotals[sec].personal += bagCost + padCost;
    }

    EXTRAS.forEach((e, idx) => {
      if (e.layoutSection !== sec) return;
      const ec = extraCur(idx);
      const qty = e.qty || 1, unit = e.unit_price || 0, split = Math.max(1, e.split || 1);
      const lineTotal = qty * unit;
      const shared = e.personal_or_shared === 'shared';
      const share = shared ? roundShare(lineTotal, split) : unit;
      const cost = ec.skip ? 0 : share;
      if (!ec.skip) addToSection(sectionTotals[sec], shared?0:cost, 0, 0, shared?split:1, lineTotal);
      const pick2 = `${e.brand||''} ${e.model||''}`.trim();
      const link = e.price_url ? `<a href="${esc(e.price_url)}" target="_blank">link</a>` : 'est.';
      const fullPrice2 = shared ? lineTotal : unit;
      h += `<tr class="${ec.skip?'done':''}">`
        + `<td><input type="checkbox" ${ec.bought?'checked':''} onchange="setExtra(${idx},'bought',this.checked)"></td>`
        + `<td></td><td><button onclick="setExtra(${idx},'skip',${!ec.skip})">${ec.skip?'Include':'Skip'}</button></td>`
        + `<td class="lbl">${esc(e.item)}<br><small>${esc(pick2)}</small></td>`
        + `<td colspan="3">${money(fullPrice2)}${shared&&qty>1?` (${qty} x ${money(unit)})`:''}${shared?` <small>your share ${money(share)} (&divide;${split})</small>`:` <small>(personal${qty>1?`, ${qty} people`:''})</small>`}<br><small>${esc(e.where_to_buy||'')}</small> ${link}</td>`
        + `<td></td></tr>`;
    });

    h += `<tr class="tally"><td colspan="8">${sectionLine(SECTION_TITLES[sec], sectionTotals[sec])}</td></tr>`;
  });
  tb.innerHTML = h;

  let personalTotal = 0, groupWholeTotal = 0, groupPerPerson = 0, oz = 0, left = 0;
  GEAR_SECTIONS.forEach(sec => { const s = sectionTotals[sec];
    personalTotal += s.personal; groupWholeTotal += s.groupWhole; groupPerPerson += s.groupPerPerson;
    if (sec !== 'base_camp') oz += s.oz; left += s.left; });

  // --- sleep section ---
  const sc = sleepCur();
  let sh = '';
  ['bag','pad'].forEach(kind => {
    sh += `<tr><td class="lbl">${kind==='bag'?'Sleeping bag/quilt':'Sleeping pad, insulated'}<br><small>${sc.tier==='budget'?'Budget':'Solid'} tier</small></td>`;
    TEMP_ORDER.forEach(temp => {
      const item = SLEEP[temp][kind][sc.tier];
      const on = temp === sc.rating;
      sh += `<td class="opt sleepcell${on?' on':' grey'}" onclick="setSleep('rating','${temp}')"><span class="ck">${on?'&#10003;':''}</span>`
        + `<b>${temp}</b> ${esc(item.name)}<br>${money(item.price)}<br><small>${esc(item.note)}</small>`
        + (item.url ? ` <a href="${esc(item.url)}" target="_blank" onclick="event.stopPropagation()">link</a>` : '') + `</td>`;
    });
    const boughtKey = kind === 'bag' ? 'boughtBag' : 'boughtPad';
    sh += `<td><input type="checkbox" ${sc[boughtKey]?'checked':''} onchange="setSleep('${boughtKey}',this.checked)"></td></tr>`;
  });
  document.getElementById('sleep-rows').innerHTML = sh;

  // --- Consumables / Food: each is its own section, own tally box, NOT
  // counted in the gear total above. ---
  function renderFlatSection(layoutSec, bodyId, tallyId){
    const body = document.getElementById(bodyId);
    const sect = newSectionTotal();
    let eh = '';
    EXTRAS.forEach((e, idx) => {
      if (e.layoutSection !== layoutSec) return;
      const ec = extraCur(idx);
      const qty = e.qty || 1, unit = e.unit_price || 0, split = Math.max(1, e.split || 1);
      const lineTotal = qty * unit;
      const shared = e.personal_or_shared === 'shared';
      const share = shared ? roundShare(lineTotal, split) : unit;
      const cost = ec.skip ? 0 : share;
      if (!ec.skip) addToSection(sect, shared?0:cost, 0, 0, shared?split:1, lineTotal);
      const pick = `${e.brand||''} ${e.model||''}`.trim();
      const link = e.price_url ? `<a href="${esc(e.price_url)}" target="_blank">link</a>` : 'est.';
      const fullPrice = shared ? lineTotal : unit;
      eh += `<tr class="${ec.skip?'done':''}">`
        + `<td><input type="checkbox" ${ec.bought?'checked':''} onchange="setExtra(${idx},'bought',this.checked)"></td>`
        + `<td class="lbl">${esc(e.item)}<br><small>${esc(pick)}</small></td>`
        + `<td>${shared?'Shared':'Personal'}${!shared&&qty>1?` <small>(${qty} people)</small>`:''}</td>`
        + `<td>${money(fullPrice)}${shared&&qty>1?` (${qty} x ${money(unit)})`:''}</td>`
        + `<td>${shared?`your share ${money(share)} (&divide;${split})`:money(share)}</td>`
        + `<td><small>${esc(e.where_to_buy||'')}</small> ${link}</td>`
        + `<td><button onclick="setExtra(${idx},'skip',${!ec.skip})">${ec.skip?'Include':'Skip'}</button></td>`
        + `</tr>`;
    });
    body.innerHTML = eh;
    document.getElementById(tallyId).innerHTML = sectionLine(SECTION_TITLES[layoutSec], sect);
    return sect;
  }
  const consumablesTotal = renderFlatSection('consumables', 'extras-consumables', 'tally-consumables');
  const foodTotal = renderFlatSection('food', 'extras-food', 'tally-food');

  // --- totals card (gear only: sections 1-4) ---
  const grand = personalTotal + groupPerPerson;
  const tripTotal = grand + consumablesTotal.personal + consumablesTotal.groupPerPerson
    + foodTotal.personal + foodTotal.groupPerPerson;
  document.getElementById('totals').innerHTML =
    `<b>Gear total (sections 1-4) &mdash; Personal ${money(personalTotal)}</b> &nbsp;|&nbsp; <b>Group share ${money(groupPerPerson)}</b>`
    + ` (group total ${money(groupWholeTotal)}) &nbsp;|&nbsp; <b>Gear grand total/person ${money(grand)}</b>`
    + ` &nbsp;|&nbsp; still to buy ${money(left)}`
    + ` &nbsp;|&nbsp; worn + pack ${(oz/16).toFixed(1)} lb (base camp gear excluded)`
    + `<br><small>Consumables and Food are tracked separately below (their own tally boxes) and are not part of the gear total above.</small>`
    + `<br><b>Trip total, everything, per person: ${money(tripTotal)}</b>`;

  LAST = {sectionTotals, personalTotal, groupWholeTotal, groupPerPerson, grand,
    consumablesTotal, foodTotal, tripTotal, sleep: sleepCur()};
}
function resetAll(){ if (confirm('Reset all your picks to the defaults?')){ st = {}; save(); render(); } }

function itemStatus(c){ return c.ch==='Own' ? 'OWN' : c.ch==='Skip' ? 'SKIP' : (c.bought ? 'GOT IT' : 'to buy'); }

// Builds the full export text: every section (base camp, overnight
// personal/shared, panning, consumables, food), the sleep rating, each pick
// with its full price + your share for shared items + Own/Skip/Got-it
// status, and the section + grand totals -- everything on the page.
function buildExportText(){
  const NL = String.fromCharCode(10);
  const out = ['GA Gold Trip -- My Buy List', ''];
  GEAR_SECTIONS.forEach(sec => {
    out.push('== ' + SECTION_TITLES[sec] + ' ==');
    ITEMS.filter(it => it.section === sec).forEach(it => {
      const c = cur(it), r = calc(it), o = it.opts[c.ch];
      const split = (c.ch !== 'Custom' && c.ch !== 'Skip' && c.ch !== 'Own' && o) ? o.split : 1;
      let line = `${it.label}: ${r.name} - ${money(o ? o.price : r.cost)}`;
      if (split > 1) line += ` (your share ${money(r.cost)}, /${split})`;
      out.push(line + ` [${itemStatus(c)}]`);
    });
    if (sec === 'overnight_personal' && LAST.sleep){
      const sc = LAST.sleep;
      ['bag','pad'].forEach(kind => {
        const item = sleepItem(sc.rating, kind);
        out.push(`Sleep ${kind} (${sc.rating}, ${sc.tier}): ${item.name} - ${money(item.price)} `
          + `[${sc[kind==='bag'?'boughtBag':'boughtPad'] ? 'GOT IT' : 'to buy'}]`);
      });
    }
    EXTRAS.forEach((e, idx) => {
      if (e.layoutSection !== sec) return;
      const ec = extraCur(idx), qty = e.qty||1, unit = e.unit_price||0, split = Math.max(1, e.split||1);
      const lineTotal = qty*unit, shared = e.personal_or_shared === 'shared';
      const share = shared ? roundShare(lineTotal, split) : unit;
      let line = `${e.item}: ${money(lineTotal)}`;
      if (shared) line += ` (your share ${money(share)}, /${split})`;
      out.push(line + ` [${ec.skip ? 'SKIP' : (ec.bought ? 'GOT IT' : 'to buy')}]`);
    });
    const s = LAST.sectionTotals ? LAST.sectionTotals[sec] : null;
    if (s) out.push(sectionLine(SECTION_TITLES[sec], s).replace(/<[^>]+>/g, ''));
    out.push('');
  });
  [['consumables','Consumables'], ['food','Food']].forEach(([key, title]) => {
    out.push('== ' + title + ' ==');
    EXTRAS.forEach((e, idx) => {
      if (e.layoutSection !== key) return;
      const ec = extraCur(idx), qty = e.qty||1, unit = e.unit_price||0, split = Math.max(1, e.split||1);
      const lineTotal = qty*unit, shared = e.personal_or_shared === 'shared';
      const share = shared ? roundShare(lineTotal, split) : unit;
      let line = `${e.item}: ${money(lineTotal)}`;
      if (shared) line += ` (your share ${money(share)}, /${split})`;
      out.push(line + ` [${ec.skip ? 'SKIP' : (ec.bought ? 'GOT IT' : 'to buy')}]`);
    });
    const tot = key === 'consumables' ? LAST.consumablesTotal : LAST.foodTotal;
    if (tot) out.push(sectionLine(title, tot).replace(/<[^>]+>/g, ''));
    out.push('');
  });
  out.push('== Totals ==');
  out.push(`Gear total/person (sections 1-4): ${money(LAST.grand||0)}`);
  out.push(`Consumables/person: ${money((LAST.consumablesTotal?LAST.consumablesTotal.personal+LAST.consumablesTotal.groupPerPerson:0))}`);
  out.push(`Food/person: ${money((LAST.foodTotal?LAST.foodTotal.personal+LAST.foodTotal.groupPerPerson:0))}`);
  out.push(`Trip total, everything, per person: ${money(LAST.tripTotal||0)}`);
  return out.join(NL);
}
function copyList(){
  navigator.clipboard.writeText(buildExportText()).then(()=>alert('List copied')).catch(()=>alert('Copy failed -- try Download instead'));
}
function downloadList(){
  const blob = new Blob([buildExportText()], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ga-gold-trip-buy-list.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
render();
"""

picker_js = (PICKER_JS
    .replace("__ITEMS__", items_json)
    .replace("__SLEEP__", sleep_json)
    .replace("__TEMP_ORDER__", temp_order_json)
    .replace("__DEFAULT_TEMP__", default_temp_json)
    .replace("__EXTRAS__", extras_json)
    .replace("__GEAR_SECTIONS__", GEAR_SECTIONS_JSON)
    .replace("__SECTION_TITLES__", SECTION_TITLES_JSON))

files = [
    ("Gear_Picker.xlsx", "Pick Budget/Value/Premium per row; Dashboard totals update live (open in Excel)"),
    ("BUY_LIST.md", "Same list as the Buy tab, plain text"),
    ("RUNDOWN.html", "Full ~20-page guide (also RUNDOWN.md)"),
    ("map/map3d.html", "3D map (Map tab), GPS dot, works offline in the Android app"),
    ("map/trip-map.html", "2D detail map, layers, legality banners"),
    ("https://github.com/hearnoevil343/guys-ga-trip/releases/latest/download/ga-gold-trip.apk", "Android app (offline hub + 3D map + topo tiles, ~150 MB). Install: open on the phone, allow unknown apps"),
    ("map/trip.gpx", "Waypoints for Gaia / CalTopo / OnX offline"),
    ("PLAN.md", "Facts, decisions, open items"),
]
# --- "Who has what" tab, from roster/roster.json (python tools/build_roster.py) --
def roster_html():
    rp = ROOT / "roster" / "roster.json"
    if not rp.exists():
        return "<p>No roster yet: run <code>python tools/build_roster.py</code>.</p>"
    R = json.loads(rp.read_text(encoding="utf-8"))
    E = html.escape
    nums = sorted(R["people"], key=int)
    names = {n: R["people"][n]["name"] for n in nums}
    got = [n for n in nums if R["people"][n]["submitted"]]
    owe = [names[n] for n in nums if not R["people"][n]["submitted"]]
    hc = R["headcount"]
    out = []
    A = out.append
    A(f'<div class="card"><b>Lists in: {len(got)} of {len(nums)}</b> '
      f'({", ".join(names[n] for n in got)}).')
    if owe:
        A(f' <b>Still owed:</b> {", ".join(owe)}. Until theirs are in, a hole below may already be '
          f'covered by them.')
    A('<br><small>Built from each person\'s Copy-list export of the Buy tab. '
      '&#10003; has it &middot; <span class="rb">$</span> still buying &middot; '
      '&ndash; skipped &middot; ? no list yet &middot; blank = not on their list.</small></div>')

    # Holes summary
    short = [i for i in R["items"] if i.get("state") == "short"]
    gcost = sum(i["price"] * (i["need"] - i["have"]) for i in short)
    A('<div class="card"><b>Holes</b><br>')
    A(f'<b>Group gear nobody has:</b> {len(short)} items, ${gcost:,.2f} total, '
      f'about ${gcost / hc:,.2f} each at {hc}.<ul class="holes">')
    for sec in R["sections"]:
        rows = [i for i in short if i["section"] == sec]
        if rows:
            A(f'<li><b>{E(sec)}:</b> ' + ", ".join(
                E(i["label"]) + (f' (need {i["need"] - i["have"]} more)' if i["need"] - i["have"] > 1 else "")
                for i in rows) + '</li>')
    A('</ul><b>Personal gear each person still has to buy:</b><ul class="holes">')
    for n in nums:
        if not R["people"][n]["submitted"]:
            A(f'<li>{E(names[n])}: no list yet</li>')
            continue
        miss = [i for i in R["items"] if not i["shared"] and i["cells"][n]["s"] == "buy"]
        if miss:
            A(f'<li>{E(names[n])}: {len(miss)} items, ${R["people"][n]["personal_gap_usd"]:,.2f} '
              f'&mdash; ' + ", ".join(E(i["label"]) for i in miss) + '</li>')
        else:
            A(f'<li>{E(names[n])}: nothing missing</li>')
    A('</ul></div>')

    A('<p><label><input type="checkbox" id="holes-only"> Show holes only</label></p>')
    head = "".join(f"<th>{E(names[n])}</th>" for n in nums)
    sym = {"has": "&#10003;", "skip": "&ndash;", "nolist": "?", "absent": "", "free": "&#10003;"}
    for idx, sec in enumerate(R["sections"]):
        rows = [i for i in R["items"] if i["section"] == sec]
        if not rows:
            continue
        nshort = sum(1 for i in rows if i.get("state") == "short")
        nmiss = sum(1 for i in rows if not i["shared"] for n in got if i["cells"][n]["s"] == "buy")
        tag = []
        if nshort:
            tag.append(f"{nshort} group hole{'s' if nshort > 1 else ''}")
        if nmiss:
            tag.append(f"{nmiss} personal gap{'s' if nmiss > 1 else ''}")
        A(f'<details class="who"{" open" if idx == 0 else ""}><summary>{E(sec)} '
          f'<small>{len(rows)} items{" &middot; " + ", ".join(tag) if tag else " &middot; all set"}</small></summary>')
        A(f'<table class="who"><tr><th>Item</th>{head}<th>Group</th></tr>')
        for i in rows:
            hole = i.get("state") == "short" or (not i["shared"] and any(i["cells"][n]["s"] == "buy" for n in got))
            tds = []
            for n in nums:
                c = i["cells"][n]
                if c["s"] == "buy":
                    tip = E(f'{c.get("p") or ""} ${c.get("price", 0):,.2f}'.strip())
                    tds.append(f'<td class="c buy" title="{tip}">$</td>')
                else:
                    tip = E(c.get("p") or "")
                    tds.append(f'<td class="c {c["s"]}"{f" title={chr(34)}{tip}{chr(34)}" if tip else ""}>{sym[c["s"]]}</td>')
            st = i.get("state")
            if not i["shared"]:
                g = '<td class="g">each</td>'
            elif st == "covered":
                g = '<td class="g ok">covered</td>'
            elif st == "short":
                g = f'<td class="g hole">HOLE &middot; need {i["need"] - i["have"]}</td>'
            else:
                g = '<td class="g">no cost</td>'
            A(f'<tr class="{"hole" if hole else "fine"}"><td>{E(i["label"])}</td>{"".join(tds)}{g}</tr>')
        A('</table></details>')
    A('<p><small>Not in anyone\'s list yet (from MASTER_LIST.md): a third 8 oz fuel canister and a '
      'second bear-proof food bag for 2 nights of food.</small></p>')
    return "".join(out)


roster_section = roster_html()

PAN_NOTE = ('<p><small>Creek facts come from RUNDOWN.md and research/backcountry-route-design.md. '
            'No ranger or county office has confirmed panning on any of these creeks yet (CALLS.md). '
            'Unsourced general practice: 10-15 minutes per pan, snuffer bottle, garnet and rusty quartz rows, '
            'flood line, confluence and go-deep tips.</small></p>'
            '<details class="who"><summary>Sources</summary><ul>'
            '<li>ICMJ, <a href="https://www.icmj.com/resources/helpful-links/beginners-corner/gold-panning-instructions-3/">Gold Panning Instructions</a> (pan steps, magnet on black sand).</li>'
            '<li>USGS, <a href="https://www.usgs.gov/faqs/what-fools-gold">What is Fool\'s Gold?</a> (pin and streak tests).</li>'
            '<li>36 CFR 228.4(a)(1)(ii): no notice of intent for gold panning that causes no significant disturbance.</li>'
            '<li>USDA Forest Service, <a href="https://www.fs.usda.gov/media/229394">Rockhounding Guide, FS-1091</a> (2017): gold panning generally needs no Plan of Operations.</li>'
            '</ul></details>')

panning_section = """
<div class="card"><b>Rules everywhere:</b> pan + small hand trowel only. No sluice, no dredge, no digging into banks.
Work only gravel that is already in the stream bed. Fill your holes. No panning inside Vogel State Park or any Wilderness.
No permit needed for hand panning on National Forest land (36 CFR 228.4). A group of 5 needs no group permit (threshold is 75 people).</div>

<h3 class="sec-h">The three creeks</h3>

<details class="who" open><summary>Fri Oct 16 &mdash; Yahoola Creek Park (Dahlonega) &middot; warm-up</summary>
<ul>
<li><b>Where:</b> 1166 Captain McDonald Rd, paved lot, level walk of a few hundred feet to the creek. 38 min from Vogel.</li>
<li><b>Gold record:</b> the most storied creek in the district. About 4,000 miners worked it in 1830 and a big stamp mill sat on its bank.</li>
<li><b>Expect:</b> heavily worked for almost 200 years and panned by visitors. Fine flour gold and small flakes at best. This is the day to get your technique right.</li>
<li><b>Try first:</b> gravel bars away from the mowed lawn frontage. Inside of bends, the downstream side of big rocks, and the bottom layer of gravel where it sits on clay or bedrock.</li>
<li><b>Status:</b> county park. No written county rule either way: the county code and the park's posted rules do not mention panning. Not confirmed as allowed. Call Lumpkin Co. Parks &amp; Rec 706-864-3622.</li>
<li><b>Park rules:</b> park hours 7:30 AM-9:00 PM. No glass in the park: plastic vials only.</li>
</ul></details>

<details class="who"><summary>Sat Oct 17 &mdash; West Fork Wolf Creek &middot; test pan, 2 h</summary>
<ul>
<li><b>Where:</b> at and just below the FS 107 crossing (WOLF-X), where truck 1 parks. National Forest from the source down to 34.79131, -83.91724. Do not pan below that point. This is <b>not</b> a camp &mdash; night 1 is up the trail at Calf Stump Branch.</li>
<li><b>Also:</b> last water a vehicle can reach. Fill 2 L each here &mdash; there is nothing on the 1,375 ft climb to Calf Stomp Gap.</li>
<li><b>Gold record:</b> none. It is a guess from geology: the creek sits between the Coosa Creek placers and the old placers near Crumley Creek. Finding nothing here is a normal result.</li>
<li><b>Expect:</b> a steep creek with bedrock. Little gravel, so the gold (if any) is in cracks, not in bars.</li>
<li><b>Try first:</b> bedrock cracks that run across the current, the pocket at the foot of each small drop, and gravel packed behind boulders. Scrape cracks clean with the trowel tip and pan that.</li>
<li><b>Method:</b> sample, do not settle. Two pans per spot, then move 20&ndash;30 yards. Only stay where a pan shows black sand plus color.</li>
<li><b>Status:</b> allowed under the general National Forest rule; no creek-specific rule found. Ranger call still open (Blue Ridge RD 706-745-6928).</li>
</ul></details>

<details class="who"><summary>Sat&ndash;Mon Oct 17&ndash;19 &mdash; Calf Stump Branch &middot; night 1, 1.5 h evening + 1.5 h morning</summary>
<ul>
<li><b>Where:</b> where the Coosa Backcountry Trail crosses Calf Stump Branch, 0.4 mi past Calf Stomp Gap (34.78244, -83.95858). About 400 m from the nearest road.</li>
<li><b>Gold record:</b> none. Like West Fork Wolf Creek this is geology, not history. Finding nothing is a normal result.</li>
<li><b>Expect:</b> a small headwater branch. October is the driest month and the flow here is UNCONFIRMED &mdash; it may be a trickle.</li>
<li><b>Try first:</b> bedrock cracks across the current and the pocket at the foot of each small drop. Pan <i>downstream</i> of wherever the group draws drinking water.</li>
</ul></details>

<details class="who"><summary>Sun&ndash;Mon Oct 18&ndash;19 &mdash; East Fork Coosa Creek &middot; the main event</summary>
<ul>
<li><b>Gold record:</b> the best of the three. Georgia Geological Survey Bulletin 19 (1909, pp. 237&ndash;239) says the Coosa Creek placers were mined for several miles from near the headwaters, with output estimated at half a million to a million pennyweights and purity up to .980. USGS lists the Coosa Creek Placer Mine as a past producer.</li>
<li><b>Hard limit:</b> National Forest only from the source down to <b>34.80637, -83.95980</b>. Below that is private. Never pan downstream of it.</li>
<li><b>Where the gold sits:</b> Bulletin 19 says upper-creek gold is in "the bed of the creek only". Work the creek bed: bedrock cracks and the inside of bends. Skip the banks.</li>
<li><b>Why these stops:</b> the creek is steep at its source, flattens near 34.798, -83.976, then steepens again below the two confluences. Fast water that slows down drops its gold, and a side creek joining adds another drop zone.</li>
</ul>
<table><tr><th>Stop</th><th>When</th><th>Where</th><th>Try</th></tr>
<tr><td>CAMP-U (night 2)</td><td>Sun evening, 1.5 h</td><td>34.79056, -83.98457</td><td>First look at the bed. Bedrock cracks across the current; the tail of each pool, not its deep middle. Headwater reach &mdash; October flow UNCONFIRMED.</td></tr>
<tr><td>CAMP-U (the long session)</td><td>Mon morning, 2 h</td><td>34.79056, -83.98457</td><td>Work the same reach properly: clean the cracks to the bottom, and the tight layer where gravel sits on bedrock.</td></tr>
<tr><td>LOWER reach &mdash; the last pan</td><td>Mon, 1.5 h</td><td>34.79350, -83.98112</td><td>Flatter water: the inside of bends and the upstream end of each gravel bar. Still 500 m above the road end.</td></tr>
<tr><td>Up to DROP-IN and the source</td><td>optional side trip</td><td>34.789506, -83.985797</td><td>The steep headwater, 350&ndash;720 ft/mi. 0.44 mi and +210 ft from camp on a daypack. In the Playground tab as a branch.</td></tr>
</table>
<p><small>Rebuilt 2026-10-08 for the 3-day / 2-night hike. The old stops &mdash; the Jones Branch camp and the Bowers Road boundary stop &mdash; belonged to the road route dropped on 2026-10-05; both sat beside a drivable road.</small></p>
<p><b>Status:</b> allowed under the general National Forest rule; no creek-specific rule found. Ranger call still open (Coosa Bald National Scenic Area; Blue Ridge RD 706-745-6928).</p>
</details>

<h3 class="sec-h">Cheat sheet</h3>

<details class="who" open><summary>Reading a creek: where gold stops</summary>
<p>Gold is about 19 times heavier than water and 6&ndash;7 times heavier than ordinary rock. It drops wherever the current slows, and it works its way down to the bottom.</p>
<ul>
<li><b>Inside of bends.</b> The slow side. Dig at the upstream end of the gravel bar.</li>
<li><b>Behind boulders and logs.</b> The calm pocket on the downstream side.</li>
<li><b>Bedrock cracks.</b> Best when they run across the current like a riffle. Clean them to the bottom.</li>
<li><b>Foot of a drop.</b> Where a chute or small falls flattens into a pool, at the tail of the pool rather than the deep middle.</li>
<li><b>Below a confluence.</b> Where a side creek joins.</li>
<li><b>Moss and roots at the high-water line.</b> Moss on rocks traps fine gold in floods. Rinse it into the pan; do not strip the bank.</li>
<li><b>Go deep.</b> The top few inches of loose gravel are usually empty. The pay is in the tight layer on bedrock or clay.</li>
<li><b>Picture the creek in flood.</b> That is when gold moves. Draw the straightest line between inside bends: gold travels and drops along it.</li>
</ul></details>

<details class="who"><summary>How to pan, step by step</summary>
<ol>
<li><b>Fill</b> the pan about three-quarters with gravel from the bottom of your hole.</li>
<li><b>Sink it</b> in calm water a few inches deep. Break up clay and clumps with your fingers until the water runs through everything.</li>
<li><b>Pick out the big rocks.</b> Rinse each one over the pan first. Glance at them for quartz.</li>
<li><b>Shake hard,</b> flat and under water, side to side. This is the step that matters: it sends the gold to the bottom. Shake more than feels necessary.</li>
<li><b>Tilt and wash.</b> Tip the pan slightly away from you and let water sweep the top layer of light sand over the lip.</li>
<li><b>Level, re-shake, repeat.</b> Every few washes, go flat and shake again so the gold stays down.</li>
<li><b>Slow down at the black sand.</b> When only a cup or two of heavy material is left, keep an inch of clean water in the pan and swirl gently to check for nuggets and pieces you can pick out by hand.</li>
<li><b>Collect.</b> Snuffer bottle for flakes, into the vial. A dry fingertip also picks up a flake.</li>
</ol>
<p>A pan takes a beginner 10&ndash;15 minutes. When sampling, be quick and rough; when you find color, slow down and be careful.</p>
</details>

<details class="who"><summary>What is in the pan</summary>
<table><tr><th>You see</th><th>It is</th><th>How to tell</th></tr>
<tr><td>Buttery yellow that looks the same in sun and in shade, and stays put when you swirl</td><td><b>Gold</b></td><td>Does not glitter, it glows. A pin dents or flattens it. Last thing to move in the pan.</td></tr>
<tr><td>Brassy, sharp-edged cubes or grains</td><td>Pyrite</td><td>Flashes as you turn the pan, goes dull in shade. Crumbles or powders under a pin.</td></tr>
<tr><td>Thin gold or silver flakes that flutter and float</td><td>Mica</td><td>Washes out easily, crushes to powder. Very common in these mountains.</td></tr>
<tr><td>Heavy black sand</td><td>Magnetite and other iron minerals</td><td>A good sign: you are in the heavy layer where gold also settles. A magnet lifts most of it.</td></tr>
<tr><td>Small dark red grains</td><td>Garnet</td><td>Also heavy, another good sign.</td></tr>
<tr><td>White quartz, especially rusty or full of holes</td><td>The rock gold comes from here</td><td>Rusty quartz gravel in the creek is worth panning below.</td></tr>
</table>
<p>Pin test and streak test: <a href="https://www.usgs.gov/faqs/what-fools-gold">USGS, What is Fool's Gold?</a> Gold dents like soft lead and leaves a golden yellow streak on unglazed porcelain; pyrite and chalcopyrite leave a dark green to black streak, mica a white one.</p></details>

<details class="who"><summary>Working as a group of 5</summary>
<ul>
<li><b>Spread out to sample.</b> One person per spot type (bend, boulder, bedrock, confluence), two pans each, then compare.</li>
<li><b>Follow the color.</b> When a spot shows gold, everyone moves to that line and works it upstream.</li>
<li><b>Take the concentrates home.</b> Stop each pan at the black sand, dump it in one shared bucket or bag, and do the careful final panning in a tub at camp.</li>
<li><b>Cold water:</b> gloves on, take turns, and nobody pans alone out of sight on the hike days.</li>
</ul></details>
""" + PAN_NOTE

# ---------------------------------------------------------------------------
# --- "Fish & crawdads" tab, rendered from research/fishing-crawdads.md -----
# Cheat sheet first (one card per numbered line), every other section behind a
# drill-in. The .md is the source of truth: edit it and re-run, never edit the
# HTML here.
# ---------------------------------------------------------------------------
import markdown as _md_mod

def _md(t):
    return _md_mod.markdown(t, extensions=["tables", "sane_lists"])

def fishing_html():
    src = (ROOT / "research" / "fishing-crawdads.md").read_text(encoding="utf-8")
    # strip the H1 and keep the provenance paragraph under it
    body = src.split("\n", 1)[1]
    head, _, rest = body.partition("\n## ")
    provenance = head.strip()
    secs = ("## " + rest).split("\n## ")
    secs = [secs[0][3:]] + secs[1:] if secs[0].startswith("## ") else secs
    out = ['<div class="card"><b>Cheap-man\'s fishing and crawdad guide.</b> '
           + _md(provenance.replace("\n", " ").strip()).replace("<p>", "").replace("</p>", "") + "</div>"]
    detail = []
    for sec in secs:
        title, _, text = sec.partition("\n")
        title = title.strip()
        text = text.strip()
        if title.lower().startswith("cheat sheet"):
            out.append('<h3 class="sec-h">Cheat sheet &mdash; the ten lines that matter</h3>')
            out.append('<div class="cheat">')
            for line in text.splitlines():
                line = line.strip()
                if not line or not line[0].isdigit():
                    continue
                item = line.split(".", 1)[1].strip() if "." in line else line
                out.append('<div class="card cheatcard">' + _md(item).replace("<p>", "").replace("</p>", "") + "</div>")
            out.append("</div>")
        else:
            opened = " open" if title.lower().startswith("unconfirmed") else ""
            detail.append(f'<details class="who"{opened}><summary>{html.escape(title)}</summary>{_md(text)}</details>')
    out.append('<h3 class="sec-h">The detail &mdash; tap a line to open it</h3>')
    out.append('<p><small>Every fact below carries the URL it came from and a quote off that page as fetched on 2026-10-08. '
               'Anything not fetched and quoted says <b>UNCONFIRMED</b>. The one that matters most: whether a crawdad trap '
               'counts as a banned minnow trap in trout water &mdash; call GA DNR 706-557-3213 before setting one '
               '(<a href="CALLS.md" target="_blank">CALLS.md</a> #6).</small></p>')
    out += detail
    out.append('<div class="card"><b>What we are bringing:</b> two cheap mini rods, two crawdad traps, '
               'and two people holding Georgia licences (Jordan, 2026-10-08).</div>')
    return "\n".join(out)

fishing_section = fishing_html()

# ---------------------------------------------------------------------------
# --- "Playground" tab -------------------------------------------------------
# Two layers, as decided 2026-10-08: (a) the towns around Vogel with ready-made
# free-day plans; (b) the hike area itself, every creek/trail/road/junction with
# the branch options at each camp and junction. Both read their data from files
# and are embedded in the page, so the whole tab works offline in the APK.
# ---------------------------------------------------------------------------
PG_PLACES = json.loads((ROOT / "research" / "playground.json").read_text(encoding="utf-8"))
PG_PLANS = json.loads((ROOT / "research" / "playground-plans.json").read_text(encoding="utf-8"))
PG_AREA = json.loads((ROOT / "map" / "data" / "playground-area.json").read_text(encoding="utf-8"))
PG_BY_ID = {r["id"]: r for r in PG_PLACES}

CAT_LABEL = {
    "waterfall": "Waterfalls", "overlook": "Overlooks and high points", "history": "Gold mines and museums",
    "town": "Towns", "food": "Food", "grocery": "Groceries", "gas": "Gas", "market": "Markets and orchards",
    "festival": "Festivals", "park": "Parks and scenic areas", "swim": "Water and swimming",
    "brewery-winery": "Breweries and wineries", "outfitter": "Outfitters", "service": "Services, health, laundry",
}
CAT_ORDER = ["waterfall", "overlook", "history", "town", "festival", "park", "market", "food",
             "grocery", "gas", "swim", "brewery-winery", "outfitter", "service"]


def _conf(c):
    if c == "quoted":
        return '<span class="chip ok" title="Hours and details were quoted off the page on 2026-10-08">quoted</span>'
    return '<span class="chip warn" title="Not quoted off a page: check before you drive">unconfirmed</span>'


def _place_row(r):
    links = []
    if r.get("gmaps"):
        links.append(f'<a href="{html.escape(r["gmaps"])}" target="_blank">map</a>')
    if r.get("website"):
        links.append(f'<a href="{html.escape(r["website"])}" target="_blank">site</a>')
    if r.get("phone"):
        links.append(f'<a href="tel:{html.escape(r["phone"])}">{html.escape(r["phone"])}</a>')
    drive = r.get("drive_min_from_vogel")
    drive_s = "&mdash;" if drive is None else (f'{drive} min' if drive else "at camp")
    extra = ""
    if r.get("cost"):
        extra += f'<div><small><b>Cost:</b> {html.escape(r["cost"])}</small></div>'
    if r.get("notes"):
        extra += f'<div><small>{html.escape(r["notes"])}</small></div>'
    if r.get("source_quote"):
        extra += (f'<div><small><b>Quoted:</b> &ldquo;{html.escape(r["source_quote"])}&rdquo; '
                  f'&mdash; <a href="{html.escape(r.get("source_url") or "#")}" target="_blank">source</a></small></div>')
    return (f'<tr><td>{drive_s}</td><td><b>{html.escape(r["name"])}</b> {_conf(r.get("confidence"))}'
            f'<div><small>{html.escape(r.get("one_liner") or "")}</small></div>'
            f'<details class="mini"><summary>details</summary>'
            f'<div><small><b>Hours:</b> {html.escape(r.get("hours") or "unknown")}</small></div>'
            f'<div><small><b>Address:</b> {html.escape(r.get("address") or "&mdash;")}</small></div>'
            f'{extra}</details></td>'
            f'<td>{" &middot; ".join(links) or "&mdash;"}</td></tr>')


def _plan_html(pl):
    rec = ' <span class="chip ok">recommended</span>' if pl.get("recommended") else ""
    rows = []
    for st in pl.get("steps", []):
        place = PG_BY_ID.get(st.get("place") or "")
        link = ""
        if place and place.get("gmaps"):
            link = f' <a href="{html.escape(place["gmaps"])}" target="_blank">map</a>'
        rows.append(f'<tr><td>{html.escape(st.get("time") or "")}</td><td>{html.escape(st["what"])}{link}</td></tr>')
    sw = ""
    if pl.get("swaps"):
        items = []
        for st in pl["swaps"]:
            place = PG_BY_ID.get(st.get("place") or "")
            link = f' <a href="{html.escape(place["gmaps"])}" target="_blank">map</a>' if place and place.get("gmaps") else ""
            items.append(f'<li>{html.escape(st["what"])}{link}</li>')
        sw = "<p><b>Swap in:</b></p><ul>" + "".join(items) + "</ul>"
    cl = ""
    if pl.get("closed"):
        cl = ("<p><b>Closed &mdash; do not drive out:</b></p><ul>"
              + "".join(f'<li>{html.escape(st["what"])}</li>' for st in pl["closed"]) + "</ul>")
    wn = ""
    if pl.get("warnings"):
        wn = ("<p><b>Watch out:</b></p><ul>"
              + "".join(f'<li>{html.escape(w)}</li>' for w in pl["warnings"]) + "</ul>")
    return (f'<details class="who"><summary>{html.escape(pl["when"])} &mdash; {html.escape(pl["title"])}{rec}</summary>'
            f'<p>{html.escape(pl["summary"])}</p>'
            f'<table><tr><th>When</th><th>What</th></tr>{"".join(rows)}</table>{sw}{cl}{wn}</details>')


BRANCH_CHIP = {
    "bail-out": '<span class="chip warn">bail-out</span>',
    "side creek": '<span class="chip pan">side creek</span>',
    "longer day": '<span class="chip">longer</span>',
    "shorter day": '<span class="chip">shorter</span>',
}


def _branch_html(b):
    kind = b["kind"]
    chip = BRANCH_CHIP.get(kind, '<span class="chip ok">the plan</span>' if kind.startswith("the plan") else f'<span class="chip">{html.escape(kind)}</span>')
    flags = ""
    if b.get("non_fs_vertices"):
        flags += (f' <span class="chip warn" title="{b["non_fs_vertices"]} mapped points fall on non-Forest-Service ground">'
                  'crosses private</span>')
    if b.get("state_parks"):
        flags += f' <span class="chip">{html.escape(", ".join(b["state_parks"]))} &mdash; no panning</span>'
    return (f'<tr><td>{chip}{flags}</td><td><b>{html.escape(b["label"])}</b>'
            f'<div><small>Ends at: {html.escape(b.get("ends_at") or "&mdash;")}</small></div>'
            + (f'<div><small><b>Water:</b> {html.escape(b["water"])}</small></div>' if b.get("water") else "")
            + (f'<div><small>{html.escape(b["note"])}</small></div>' if b.get("note") else "")
            + f'</td><td class="num">{b["miles"]} mi</td><td class="num">+{b["gain_ft"]} ft</td>'
            f'<td class="num">{b["minutes"]} min</td><td class="num">{"packs" if b["mode"] == "pack" else "daypack"}</td></tr>')


NODE_TYPE_LABEL = {"camp": "Camp", "junction": "Junction", "trailhead": "Trailhead",
                   "gap": "Gap", "pan": "Pan spot", "boundary": "Boundary"}


def playground_html():
    places_by_cat = {}
    for r in PG_PLACES:
        places_by_cat.setdefault(r["category"], []).append(r)
    town_blocks = []
    for cat in CAT_ORDER + [c for c in places_by_cat if c not in CAT_ORDER]:
        rows = places_by_cat.get(cat) or []
        if not rows:
            continue
        rows = sorted(rows, key=lambda r: (r.get("drive_min_from_vogel") if r.get("drive_min_from_vogel") is not None else 999))
        town_blocks.append(
            f'<details class="who"><summary>{html.escape(CAT_LABEL.get(cat, cat))} '
            f'<small>({len(rows)})</small></summary>'
            f'<table><tr><th>From Vogel</th><th>Place</th><th>Links</th></tr>'
            + "".join(_place_row(r) for r in rows) + "</table></details>")

    plans = "".join(_plan_html(pl) for pl in PG_PLANS["plans"])

    # --- hike-area layer ---
    by_node = {}
    for b in PG_AREA["branches"]:
        by_node.setdefault(b["node"], []).append(b)
    node_blocks = []
    for n in PG_AREA["nodes"]:
        bs = by_node.get(n["id"]) or []
        count = f' <small>{len(bs)} way{"s" if len(bs) != 1 else ""} on</small>' if bs else ""
        tbl = ""
        if bs:
            order = {"the plan": 0}
            bs = sorted(bs, key=lambda b: (0 if b["kind"].startswith("the plan") else 1, b["kind"], b["miles"]))
            tbl = ('<table class="branches"><tr><th>Kind</th><th>Where it goes</th><th>Dist</th><th>Climb</th><th>Time</th><th>Pack</th></tr>'
                   + "".join(_branch_html(b) for b in bs) + "</table>")
        gm = f'https://www.google.com/maps/search/?api=1&query={n["lat"]}%2C{n["lng"]}'
        node_blocks.append(
            f'<details class="who"><summary><b>{html.escape(NODE_TYPE_LABEL.get(n["type"], n["type"]))}:</b> '
            f'{html.escape(n["label"])}{count}</summary>'
            f'<p><small>{n["lat"]}, {n["lng"]} &middot; <a href="{gm}" target="_blank">map</a></small></p>'
            f'<p>{html.escape(n.get("note") or "")}</p>{tbl}</details>')

    feat_by_kind = {}
    for f in PG_AREA["features"]:
        feat_by_kind.setdefault(f["kind"], []).append(f)
    feat_blocks = []
    for kind in ["creek", "trail", "forest road", "road"]:
        fs_ = feat_by_kind.get(kind) or []
        if not fs_:
            continue
        fs_ = sorted(fs_, key=lambda f: f["meters_from_route"])
        rows = []
        for f in fs_:
            tags = []
            if f.get("ref"):
                tags.append(html.escape(f["ref"]))
            if f.get("surface"):
                tags.append(html.escape(f["surface"]))
            if f.get("tracktype"):
                tags.append(html.escape(f["tracktype"]))
            if f.get("access"):
                tags.append("access: " + html.escape(f["access"]))
            flag = ""
            if f.get("on_non_fs"):
                flag = ' <span class="chip warn">crosses private</span>'
            if f.get("state_parks"):
                flag += f' <span class="chip">{html.escape(", ".join(f["state_parks"]))}</span>'
            d = f["meters_from_route"]
            near = "on the route" if d <= 40 else (f"{d} m off" if d < 1609 else f"{round(d/1609.344, 1)} mi off")
            gm = f'https://www.google.com/maps/search/?api=1&query={f["mid"][0]}%2C{f["mid"][1]}'
            rows.append(f'<tr><td><b>{html.escape(f["name"])}</b>{flag}'
                        + (f'<div><small>{" &middot; ".join(tags)}</small></div>' if tags else "")
                        + f'</td><td class="num">{f["miles_in_area"]} mi</td><td>{near}</td>'
                        f'<td><a href="{gm}" target="_blank">map</a></td></tr>')
        label = {"creek": "Creeks and branches", "trail": "Trails and paths",
                 "forest road": "Forest roads and tracks", "road": "Roads"}[kind]
        feat_blocks.append(f'<details class="who"><summary>{label} <small>({len(fs_)})</small></summary>'
                           f'<table><tr><th>Name</th><th>In the area</th><th>From the route</th><th></th></tr>'
                           + "".join(rows) + "</table></details>")

    water = PG_AREA["water"]
    water_rows = "".join(
        f'<tr><td><b>{html.escape(w["name"])}</b></td><td>{html.escape(w["at"])}</td><td>{html.escape(w["note"])}</td></tr>'
        for w in water["camps"])
    crossings = ", ".join(html.escape(w["name"]) for w in water["route_crossings"]) or "none mapped"

    store_blocks = []
    for t in PG_AREA["trailhead_stores"]:
        rows = "".join(
            f'<tr><td>{html.escape(n["name"])} {_conf(n.get("confidence"))}</td><td>{html.escape(n["category"])}</td>'
            f'<td class="num">{n["miles_straight"]} mi</td>'
            f'<td><small>{html.escape(n.get("hours") or "unknown")}</small></td>'
            f'<td>{(f"<a href=" + chr(34) + html.escape(n["gmaps"]) + chr(34) + " target=" + chr(34) + "_blank" + chr(34) + ">map</a>") if n.get("gmaps") else "&mdash;"}</td></tr>'
            for n in t["nearest"])
        store_blocks.append(f'<details class="who"><summary>{html.escape(t["label"])}</summary>'
                            f'<p><small>Straight-line distance, not drive time &mdash; these are mountain roads.</small></p>'
                            f'<table><tr><th>Nearest</th><th>What</th><th>Line of sight</th><th>Hours</th><th></th></tr>'
                            + rows + "</table></details>")

    return f"""
<div class="layers" id="pg-layers">
<button class="lyr on" data-l="pg-towns">Towns &amp; free days</button><button class="lyr" data-l="pg-area">The hike area</button>
</div>

<div class="layer on" id="pg-towns">
<div class="card"><b>Everything within reach of Vogel</b>, and a ready-made plan for each piece of free time.
Nothing here is booked. {len(PG_PLACES)} places, each with hours, cost, a phone number and a Google Maps link.
<b>quoted</b> means the hours were read off that page on 2026-10-08; <b>unconfirmed</b> means check before you drive.</div>

<h3 class="sec-h">Ready-made plans</h3>
{plans}

<h3 class="sec-h">Every place, by kind</h3>
{"".join(town_blocks)}
</div>

<div class="layer" id="pg-area">
<div class="card"><b>The hike area as a playground.</b> The locked route stays the route &mdash; this is here so it can be
branched on the fly. At each camp and junction: the bail-out to the nearest road, a longer or shorter day, and the side
creeks, each with distance, climb, walking time and water. Distances are measured on real OpenStreetMap geometry; climb
and time use the same elevation and Tobler model as the day plan, so they compare with it directly.
<b>Condition of anything off the planned route is UNCONFIRMED</b> &mdash; these are mapped lines, not trail reports. And
panning everywhere here is AMBER: no ranger has confirmed any creek (<a href="CALLS.md" target="_blank">CALLS.md</a> #1).</div>

<h3 class="sec-h">Camps, junctions and trailheads &mdash; and the ways on from each</h3>
{"".join(node_blocks)}

<h3 class="sec-h">Water</h3>
<table><tr><th>Source</th><th>At</th><th>Note</th></tr>{water_rows}</table>
<p><small>Named streams the planned route actually touches: {crossings}. Treat everything.</small></p>

<h3 class="sec-h">Nearest store, gas and food to each trailhead</h3>
{"".join(store_blocks)}

<h3 class="sec-h">Everything named in the area</h3>
<p><small>{len(PG_AREA["features"])} named creeks, trails, forest roads and roads with geometry inside the area box
({PG_AREA["area"]["minLat"]}&ndash;{PG_AREA["area"]["maxLat"]} N, {PG_AREA["area"]["minLng"]}&ndash;{PG_AREA["area"]["maxLng"]} W).
Sorted by how far each one sits from the planned route.</small></p>
{"".join(feat_blocks)}
</div>
"""

playground_section = playground_html()

if not total:
    if _gear_total:
        total = f"{_gear_total} per person for the gear (all-Value picks)"
        if _trip_total:
            total += f", {_trip_total} per person for the whole trip"
    else:
        raise SystemExit(
            "Could not read a gear total out of BUY_LIST.md.\n"
            "Expected a '| **Solid** | ... |' row under '## At a glance'. "
            "Re-run tools/build_buy_list.py, or fix this parser -- do not ship a blank 'Gear:' card (ISSUES #5)."
        )

file_rows = "".join(f'<tr><td><a href="{f}" target="_blank">{f.rsplit('/', 1)[-1]}</a></td><td>{d}</td></tr>' for f, d in files)

page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GA Gold Trip - Oct 15-21 2026</title>
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
.preset-btn{{background:#2F5233;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;margin-right:8px}}
.preset-btn:hover{{background:#3d6a42}}
td.opt.sleepcell.grey{{opacity:.45}} td.opt.sleepcell.on{{opacity:1}}
h3.sec-h{{color:#2F5233;margin:18px 0 4px}}
details.who{{background:#fff;border:1px solid #ccc;border-radius:8px;margin:8px 0;padding:0 12px}} details.who summary{{cursor:pointer;padding:10px 0;font-weight:bold;color:#2F5233}}
table.who{{margin-bottom:12px}} table.who td.c{{text-align:center;width:70px}} td.c.has,td.c.free{{color:#2F5233;font-weight:bold;background:#eef6ea}} td.c.buy,.rb{{color:#a04000;font-weight:bold;background:#fdebd9}} td.c.skip{{color:#999}} td.c.nolist{{color:#bbb}}
td.g{{font-size:13px;color:#555;width:110px}} td.g.ok{{color:#2F5233}} td.g.hole{{color:#fff;background:#b03a2e;font-weight:bold}} ul.holes{{margin:4px 0 8px}}
body.holes-only tr.fine{{display:none}}
/* Fish & crawdads + Playground */
.cheat{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}}
.card.cheatcard{{margin:0;border-left:4px solid #2F5233}}
.chip{{display:inline-block;font-size:11px;line-height:1.6;padding:0 7px;border-radius:9px;background:#e8eae4;color:#444;white-space:nowrap;vertical-align:1px}}
.chip.ok{{background:#d9ead3;color:#24521f}} .chip.warn{{background:#fdebd9;color:#8a3b00}} .chip.pan{{background:#dde8f5;color:#1d4572}}
.layers{{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}}
.layers button.lyr{{background:#fff;border:1px solid #2F5233;color:#2F5233;padding:7px 14px;border-radius:16px;cursor:pointer;font-size:14px}}
.layers button.lyr.on{{background:#2F5233;color:#fff;font-weight:bold}}
.layer{{display:none}} .layer.on{{display:block}}
details.mini{{margin:2px 0}} details.mini summary{{cursor:pointer;color:#2F5233;font-size:12px}}
td.num{{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}}
table.branches td:nth-child(1){{min-width:110px}} table.branches td:nth-child(2){{min-width:260px}}
/* Phone layout: the 9-button tab bar wraps instead of forcing a 650px page,
   and the wide tables scroll inside their own box rather than the page. */
@media (max-width:760px){{
 header h1{{font-size:16px}} header{{padding:10px 16px}}
 nav{{flex-wrap:wrap;padding:0 8px 6px;gap:3px}} nav button{{padding:8px 11px;font-size:13px;border-radius:6px;flex:1 1 auto}}
 section{{padding:14px 16px}}
 table{{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}}
 .cheat{{grid-template-columns:1fr}}
 iframe{{height:calc(100vh - 170px)}}
}}
</style></head><body>
<header><h1>Georgia Gold Trip &mdash; Oct 15&ndash;21, 2026 &middot; Vogel State Park base camp</h1></header>
<nav id="tabs">
<button data-t="start" class="on">Start</button><button data-t="rundown">Rundown</button>
<button data-t="map">Map</button><button data-t="pan">Panning</button><button data-t="play">Playground</button><button data-t="fish">Fish &amp; crawdads</button><button data-t="buy">Buy list</button><button data-t="gear">Who has what</button><button data-t="files">Files</button></nav>

<section id="start" class="on">
<div class="card"><b>The trip:</b> 5 people, Site P walk-in (2 tents, 2 vehicles), arrive Thu Oct 15, leave Wed Oct 21.
Panning at drive-up creeks + Consolidated Gold Mine tour + Dahlonega, plus one 3-day hike (Sat&ndash;Mon 17&ndash;19).</div>
<div class="card"><b>The hike:</b> 3 days / 2 nights, Sat Oct 17 &ndash; Mon Oct 19, Coosa Backcountry Trail to West Fork Wolf Creek, then East Fork Coosa Creek, out at Owltown Gap. Not yet ranger-confirmed legal.</div>
<div class="card"><b>Dates that matter:</b> firearms deer season opens Oct 17 (blaze orange). Gold Rush Days Oct 17&ndash;18 (visit Dahlonega Fri 16).
Panning banned in Wilderness, state parks, Smithgall Woods; National Forest = hand pan + trowel only.</div>
<div class="card"><b>Gear:</b> {html.escape(total)}. Your own picks re-compute weight and cost in the <b>Buy list</b> tab's totals card &mdash; that card is the number to trust. Order the tent + quilt first (2&ndash;4 wk).</div>
<div class="card"><b>Still to do:</b> phone calls (Vogel, Blue Ridge Ranger District, GA DNR, Consolidated, Lumpkin Co, LDMA), then re-check fire bans/water/roads in early Oct.</div>
<div class="card"><b>Free time:</b> Thu 15 afternoon, Mon 19 evening, all of Tue 20 and Wed 21 morning. Ready-made plans for each, plus a rain plan, are in the <b>Playground</b> tab.</div>
<p>Use the tabs above. Rundown = full guide, Map = where everything is, Panning = the creeks and how to read one, Playground = everywhere else you could go plus the hike area's branch options, Fish &amp; crawdads = rods, traps, licences and the law, Buy list = what to order and when, Who has what = everyone's gear and the holes.</p>
</section>

<section id="rundown"><iframe src="RUNDOWN.html"></iframe></section>
<section id="map"><iframe src="map/map3d.html"></iframe></section>
<section id="pan">{panning_section}</section>
<section id="buy"><p>Click a box in a row to choose it (&#10003;): Budget, Value or Premium. Use the <b>Mine</b> box to type your own item, price and link, or click <b>Own</b> / <b>Skip</b> (clicking Own also ticks "Got it"; click Own again to go back). Tick "Got it" when bought. Every price cell shows the full price; shared rows also show your per-person share. Sections are grouped by where the gear is used. Your picks save in this browser only.</p>
<p><button class="preset-btn" onclick="applyPreset('budget')">Budget set</button><button class="preset-btn" onclick="applyPreset('solid')">Solid set</button>
<button onclick="resetAll()">Reset to defaults</button>
<b>Export my list:</b> <button onclick="copyList()">Copy</button> <button onclick="downloadList()">Download</button></p>
<div id="totals" class="card"></div>
<table id="picker"><tr><th>Got it</th><th>Own</th><th>Skip</th><th>Item</th><th>Budget</th><th>Value</th><th>Premium</th><th>Mine (type your own)</th></tr><tbody id="picks"></tbody></table>

<h3 class="sec-h">Sleep system &mdash; pick a temperature rating (counts toward Overnight/backcountry: personal)</h3>
<p>Only the highlighted temperature counts toward totals; the other two are shown greyed out as priced alternatives. The Budget/Solid tier follows the buttons above.</p>
<table id="sleep-table"><tr><th>Item</th><th>40F</th><th>30F</th><th>20F</th><th>Got it</th></tr><tbody id="sleep-rows"></tbody></table>

<h3 class="sec-h">Consumables</h3>
<p>Used-up items (sunscreen, TP, batteries, wipes, lighters and similar) &mdash; not part of the gear total above.</p>
<div id="tally-consumables" class="card"></div>
<table><tr><th>Got it</th><th>Item</th><th>Personal/Shared</th><th>Price</th><th>Your share</th><th>Where</th><th></th></tr><tbody id="extras-consumables"></tbody></table>

<h3 class="sec-h">Food</h3>
<p>Backcountry rations (5 people x 2 nights) and the base-camp grocery list &mdash; not part of the gear total above.</p>
<div id="tally-food" class="card"></div>
<table><tr><th>Got it</th><th>Item</th><th>Personal/Shared</th><th>Price</th><th>Your share</th><th>Where</th><th></th></tr><tbody id="extras-food"></tbody></table>

<p><b>Export my list:</b> <button onclick="copyList()">Copy</button> <button onclick="downloadList()">Download</button></p>
</section>

<section id="play">{playground_section}</section>
<section id="fish">{fishing_section}</section>

<section id="gear">{roster_section}</section>

<section id="files"><table><tr><th>File</th><th>What it is</th></tr>{file_rows}</table></section>

<script>
const TABS=[...document.querySelectorAll('#tabs button')].map(b=>b.dataset.t);
function showTab(t){{
 if(!TABS.includes(t))return false;
 document.querySelectorAll('#tabs button,section').forEach(e=>e.classList.remove('on'));
 document.querySelector('[data-t='+t+']').classList.add('on');
 document.getElementById(t).classList.add('on');
 window.scrollTo(0,0);
 return true;}}
// Hash form is "#t/<tab>": not an element id, so the browser has nothing to
// scroll to and the header stays put. "#buy" still works for old links.
function tabFromHash(){{const h=location.hash.replace(/^#/,'');return h.startsWith('t/')?h.slice(2):h;}}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{{
 if(showTab(b.dataset.t))location.hash='t/'+b.dataset.t;}});
window.addEventListener('hashchange',()=>{{showTab(tabFromHash()||'start');}});
document.getElementById('holes-only')?.addEventListener('change',e=>document.body.classList.toggle('holes-only',e.target.checked));
showTab(tabFromHash()||'start');
// Playground's two layers: controls sit inside the tab, nothing floats.
document.querySelectorAll('#pg-layers .lyr').forEach(b=>b.onclick=()=>{{
 document.querySelectorAll('#pg-layers .lyr').forEach(e=>e.classList.remove('on'));
 document.querySelectorAll('#play .layer').forEach(e=>e.classList.remove('on'));
 b.classList.add('on');document.getElementById(b.dataset.l).classList.add('on');}});
</script><script>{picker_js}</script></body></html>"""

OUT.write_text(page, encoding="utf-8")
print(f"Wrote {OUT} ({len(ITEMS)} picker rows)")
