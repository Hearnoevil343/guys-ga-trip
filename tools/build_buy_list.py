"""
Build a final buy list from the current Gear_Picker.xlsx CHOICE picks, sorted
by lead time (longest lead first, so cottage-made gear gets ordered now).

Re-runnable: reads the live Picker/Options sheets directly, so it always
matches whatever CHOICE values are currently saved in the workbook -- no
separate data source to keep in sync.

Usage:  python tools/build_buy_list.py
Output: E:\\dev\\ga-gold-trip\\BUY_LIST.md
"""
import json
import openpyxl
from pathlib import Path

import buy_data as bd

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "Gear_Picker.xlsx"
OUT = ROOT / "BUY_LIST.md"

# ----------------------------------------------------------------------------
# Sleep system is now a mutually-exclusive TEMPERATURE choice (40F+ / 30F /
# 20F), each with its own Budget and Solid bag+pad pair, instead of a plain
# tier pick. Only the DEFAULT_TEMP band counts toward totals -- the other two
# are shown as alternatives with their own prices, not summed in.
# The old sleep_system (20F alt) / sleep_system_30f / sleeping_pad Picker rows
# are superseded by this and excluded from both the Solid and Budget loops
# below so nothing double-counts.
# Constants/loaders shared with tools/build_hub.py live in tools/buy_data.py
# so the site's Buy tab and this file can never disagree.
# ----------------------------------------------------------------------------
DEFAULT_TEMP = bd.DEFAULT_TEMP
TEMP_ORDER = bd.TEMP_ORDER
SLEEP_KEYS_EXCLUDED = bd.SLEEP_KEYS_EXCLUDED
sleep_by_key = bd.load_sleep_temp()
lead_time = bd.lead_time
sleep_row = bd.sleep_row

wb = openpyxl.load_workbook(XLSX, data_only=False)
picker = wb["Picker"]
options = wb["Options"]

# Build lookup: (category_key, tier) -> option row dict
opt_by_key = {}
for r in range(2, options.max_row + 1):
    cat = options.cell(r, 1).value
    if cat is None:
        continue
    tier = options.cell(r, 3).value
    opt_by_key[(cat, tier)] = {
        "brand": options.cell(r, 4).value or "",
        "model": options.cell(r, 5).value or "",
        "weight_oz": options.cell(r, 6).value or 0,
        "price": options.cell(r, 8).value or 0,
        "price_url": options.cell(r, 9).value or "",
        "where_to_buy": options.cell(r, 11).value or "",
        "split": options.cell(r, 18).value or 1,
    }

rows = []
for r in range(2, picker.max_row + 1):
    kit = picker.cell(r, 1).value
    label = picker.cell(r, 2).value
    key = picker.cell(r, 3).value
    required = picker.cell(r, 4).value
    choice = picker.cell(r, 5).value
    if not key or not choice:
        continue
    if key in SLEEP_KEYS_EXCLUDED:
        continue  # superseded by the temperature-choice sleep system below
    if choice in ("Skip", "Own"):
        continue
    opt = opt_by_key.get((key, choice))
    if not opt:
        continue
    if not opt["price"] or opt["model"] == "None":
        # Free/no-buy item ($0 or the "None" waders/pillow-alt option) -- nothing to order.
        continue
    days, lead_label = lead_time(opt["brand"], opt["price_url"], opt["where_to_buy"])
    try:
        split = max(1, int(opt["split"]))
    except (TypeError, ValueError):
        split = 1
    per_person_price = bd.round_share(opt["price"] or 0, split)
    rows.append({
        "kit": kit, "label": label, "required": required, "tier": choice,
        "brand": opt["brand"], "model": opt["model"], "price": opt["price"],
        "per_person_price": per_person_price, "split": split, "price_url": opt["price_url"],
        "where_to_buy": opt["where_to_buy"], "lead_days": days, "lead_label": lead_label,
        "section": bd.KEY_SECTION.get(key, bd.SECTION_OVERNIGHT_SHARED),
    })


# Inject the DEFAULT_TEMP (30F) Solid bag+pad into the Solid list.
for kind, label in (("bag", "Sleeping bag/quilt"), ("pad", "Sleeping pad, insulated")):
    item = sleep_by_key[(DEFAULT_TEMP, kind, "solid")]
    rows.append(sleep_row("Overnight Pack", f"{label} -- {DEFAULT_TEMP} rating (SELECTED)", item))

rows.sort(key=lambda x: (-x["lead_days"], x["kit"], x["label"]))

personal_rows = [r for r in rows if r["split"] <= 1]
group_rows = [r for r in rows if r["split"] > 1]

personal_total = sum(r["price"] for r in personal_rows)
group_total = sum(r["price"] for r in group_rows)
group_per_person_total = round(sum(r["per_person_price"] for r in group_rows), 2)
grand_total_per_person = round(personal_total + group_per_person_total, 2)

# ----------------------------------------------------------------------------
# BUDGET preset -- cheapest tier per item, EXCEPT where the cheapest tier is
# flagged unsafe/non-functional for this trip's conditions (sanity review
# 2026-09-23): beginner-caution/low beginner_score picks are overridden to
# the next tier up so "Budget" never means "unsafe."
#   - hiking_footwear budget tier ($0 thrifted mesh trail runner) is the
#     source data's own BEGINNER CAUTION pick for cold creek wading --
#     override to Value (Merrell Moab 3, $75) for real wet-rock traction/support.
#   - food storage budget tier (DIY bear-hang, beginner_score 2) is flagged
#     "riskiest tier for a first-time group" in its own verdict -- override to
#     Value (Ursack Major XL, IGBC-listed) so bear storage is actually reliable.
#   - first aid kit budget tier (DIY-assembled, beginner_score 2) is flagged
#     "riskiest tier for a first-time group unless someone has real first-aid
#     knowledge" -- override to Value (AMK Ultralight/Watertight .7).
#   - blaze_orange_hat_vest: source data's "Value" tier ($8.50) is actually
#     CHEAPER than its own "Budget" tier ($16.96) for equal compliance/safety
#     (visibility is the only requirement) -- use Value since it's strictly
#     the cheaper-and-safe option.
# ----------------------------------------------------------------------------
BUDGET_TIER_OVERRIDE = bd.BUDGET_TIER_OVERRIDE

budget_rows = []
for r in range(2, picker.max_row + 1):
    kit = picker.cell(r, 1).value
    label = picker.cell(r, 2).value
    key = picker.cell(r, 3).value
    required = picker.cell(r, 4).value
    choice = picker.cell(r, 5).value
    if not key or not choice:
        continue
    if key in SLEEP_KEYS_EXCLUDED:
        continue  # superseded by the temperature-choice sleep system below
    if choice in ("Skip", "Own"):
        continue  # same rows skipped/owned in both presets
    tier = BUDGET_TIER_OVERRIDE.get(key, "Budget")
    opt = opt_by_key.get((key, tier))
    if not opt:
        continue
    if not opt["price"] or opt["model"] == "None":
        continue
    days, lead_label = lead_time(opt["brand"], opt["price_url"], opt["where_to_buy"])
    try:
        split = max(1, int(opt["split"]))
    except (TypeError, ValueError):
        split = 1
    per_person_price = bd.round_share(opt["price"] or 0, split)
    budget_rows.append({
        "kit": kit, "label": label, "required": required, "tier": tier,
        "brand": opt["brand"], "model": opt["model"], "price": opt["price"],
        "per_person_price": per_person_price, "split": split, "price_url": opt["price_url"],
        "where_to_buy": opt["where_to_buy"], "lead_days": days, "lead_label": lead_label,
        "section": bd.KEY_SECTION.get(key, bd.SECTION_OVERNIGHT_SHARED),
    })

# Inject the DEFAULT_TEMP (30F) Budget bag+pad into the Budget list. Budget
# preset never picks a bag/pad too cold for the selected rating -- each
# temp band's own "budget" tier in gear-tiers-sleep-temp.json is already the
# cheapest option that still clears that band's R-value/temp-rating floor.
for kind, label in (("bag", "Sleeping bag/quilt"), ("pad", "Sleeping pad, insulated")):
    item = sleep_by_key[(DEFAULT_TEMP, kind, "budget")]
    budget_rows.append(sleep_row("Overnight Pack", f"{label} -- {DEFAULT_TEMP} rating (SELECTED)", item))

budget_rows.sort(key=lambda x: (-x["lead_days"], x["kit"], x["label"]))
budget_personal_rows = [r for r in budget_rows if r["split"] <= 1]
budget_group_rows = [r for r in budget_rows if r["split"] > 1]
budget_personal_total = sum(r["price"] for r in budget_personal_rows)
budget_group_total = sum(r["price"] for r in budget_group_rows)
budget_group_per_person_total = round(sum(r["per_person_price"] for r in budget_group_rows), 2)
budget_grand_total_per_person = round(budget_personal_total + budget_group_per_person_total, 2)


def render_gear_table(personal_rows, group_rows):
    out = []
    if personal_rows:
        out.append("| Order first? | Item | Required? | Tier | Pick | Price | Where | Link |")
        out.append("|---|---|---|---|---|---|---|---|")
        for r in personal_rows:
            link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
            out.append(
                f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
                f"{r['brand']} {r['model']} | ${r['price']:.2f} | "
                f"{r['where_to_buy']} | {link} |"
            )
    if group_rows:
        out.append("")
        out.append("_Shared (group) items -- price shown is the full group price; your share is per-person._")
        out.append("")
        out.append("| Order first? | Item | Required? | Tier | Pick | Full price | Split | Your share | Where | Link |")
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for r in group_rows:
            link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
            out.append(
                f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
                f"{r['brand']} {r['model']} | ${r['price']:.2f} | (/{r['split']}) | "
                f"your share ${r['per_person_price']:.2f} | {r['where_to_buy']} | {link} |"
            )
    return out


def section_tally(rows):
    personal = sum(r["price"] for r in rows if r["split"] <= 1)
    group_whole = sum(r["price"] for r in rows if r["split"] > 1)
    group_share = round(sum(r["per_person_price"] for r in rows if r["split"] > 1), 2)
    return personal, group_whole, group_share


def tally_line(title, personal, group_whole, group_share):
    return (
        f"**{title} -- personal ${personal:,.2f} + group share ${group_share:,.2f} "
        f"(group total ${group_whole:,.2f}) = ${round(personal + group_share, 2):,.2f}/person**"
    )


extras = bd.load_extras()
for _e in extras:
    _e["layout_section"] = bd.extras_section(_e)

lines = []
lines.append("# GA Gold Trip -- Final Buy List")
lines.append("")
lines.append("Generated from Gear_Picker.xlsx CHOICE picks (Solid) plus a computed cheapest-safe")
lines.append("preset (Budget) by tools\\build_buy_list.py. Grouped by WHERE the gear is used.")
lines.append("Every price cell is the FULL price; shared items also show your per-person share.")
lines.append("")
lines.append(
    "**Sections 1-4 (gear) count toward the top totals below. Consumables and Food are tracked "
    "separately -- see their own tally boxes -- and are NOT part of the gear total.**"
)
lines.append("")
lines.append("__AT_A_GLANCE_PLACEHOLDER__")
lines.append("")
lines.append(
    "Budget preset picks the cheapest tier per item EXCEPT four safety overrides (kept at "
    "Value tier because the cheapest tier is flagged unsafe/unreliable in its own sourced verdict): "
    "hiking footwear (thrifted $0 mesh trail runner is a cold-water-wading beginner-caution pick -> "
    "Merrell Moab 3, verified live price $100.93 on sale), bear-proof food storage (DIY bear-hang, "
    "beginner_score 2 -> Ursack Major XL), first aid kit (DIY kit, beginner_score 2, 'riskiest tier "
    "for a first-time group' -> AMK Ultralight .7), and blaze-orange vest (its own Value tier, "
    "verified live price $13.51, is still cheaper than its Budget tier at $16.96 for equal "
    "compliance -- picked the cheaper-and-safe option; the vest's earlier $8.50 figure was simply a "
    "stale/wrong price, not a split calculation)."
)
lines.append("")
lines.append("## Sleep system -- temperature choice (mutually exclusive, counts in Overnight/backcountry: personal)")
lines.append("")
lines.append(
    f"Pick ONE temperature rating for the whole group's sleeping bag + pad combo. Default = **{DEFAULT_TEMP}** "
    "(the user expects lows around 30F) -- that row's bag+pad price is already counted in the Solid/Budget "
    "totals above. The 40F+ and 20F rows below are shown as priced alternatives only and are NOT added to any total. "
    "Pad R-value floor per band: 40F+ needs R2-3, 30F needs R3-4, 20F needs R4.5+. Budget never drops below its "
    "band's floor -- the cheapest bag/pad that still clears that band's rating is used, not the cheapest bag/pad overall."
)
lines.append("")
lines.append("| Temperature | Set | Bag | Bag price | Pad | Pad price | Combo total | Counted in totals? |")
lines.append("|---|---|---|---|---|---|---|---|")
for temp in TEMP_ORDER:
    for tier, tier_label in (("budget", "Budget"), ("solid", "Solid")):
        bag = sleep_by_key[(temp, "bag", tier)]
        pad = sleep_by_key[(temp, "pad", tier)]
        combo = round(bag["price_usd"] + pad["price_usd"], 2)
        counted = f"YES -- {tier_label}" if temp == DEFAULT_TEMP else "no (alternative)"
        lines.append(
            f"| {temp} | {tier_label} | [{bag['brand']} {bag['model']}]({bag['price_url']}) ({bag['rating_note']}) | "
            f"${bag['price_usd']:.2f} | [{pad['brand']} {pad['model']}]({pad['price_url']}) ({pad['rating_note']}) | "
            f"${pad['price_usd']:.2f} | ${combo:,.2f} | {counted} |"
        )

# ----------------------------------------------------------------------------
# Sections 1-4: gear, grouped by WHERE it's used. Extras rows whose
# layout_section lands in one of these (base camp gear, durable
# nav/repair/safety items, panning tools) are folded in alongside the tiered
# Picker rows so "where used" is the single organizing idea across both data
# sources.
# ----------------------------------------------------------------------------
SECTION_NUMS = {sec: i + 1 for i, sec in enumerate(bd.GEAR_SECTIONS)}


def render_extras_rows(sec_items):
    out = []
    if not sec_items:
        return out, 0.0, 0.0, 0.0
    personal_total_e = group_whole_e = group_share_e = 0.0
    out.append("| Item | Personal/Shared | Qty | Unit price | Full price | Your share | Where | Link |")
    out.append("|---|---|---|---|---|---|---|---|")
    for e in sec_items:
        qty = e.get("qty", 1) or 1
        unit_price = e.get("unit_price", 0) or 0
        line_total = round(qty * unit_price, 2)
        split = max(1, int(e.get("split", 1) or 1))
        kind = e["personal_or_shared"]
        if kind == "personal":
            per_person = unit_price
            personal_total_e += unit_price
            share_txt = f"${per_person:,.2f}"
            full_price = unit_price
        else:
            per_person = bd.round_share(line_total, split)
            group_whole_e += line_total
            group_share_e += per_person
            share_txt = f"your share ${per_person:,.2f} (/{split})"
            full_price = line_total
        link = f"[buy]({e['price_url']})" if e.get("price_url") else "est."
        pick = f"{e.get('brand','')} {e.get('model','')}".strip()
        qty_note = f" ({qty} people)" if kind == "personal" and qty > 1 else (f" ({qty} x ${unit_price:,.2f})" if qty > 1 else "")
        out.append(
            f"| {e['item']} -- {pick} | {kind}{qty_note if kind=='personal' else ''} | {qty} | ${unit_price:,.2f} | "
            f"${full_price:,.2f}{qty_note if kind=='shared' else ''} | "
            f"{share_txt} | {e.get('where_to_buy','')} | {link} |"
        )
        if e.get("note"):
            out.append(f"| _{e['note']}_ | | | | | | | |")
    return out, personal_total_e, round(group_whole_e, 2), round(group_share_e, 2)


def emit_gear_sections(picked_personal_rows, picked_group_rows, set_label):
    """Emit sections 1-4 for one preset (Solid or Budget); returns the gear
    personal/group totals so callers can build the top-of-file summary."""
    sec_lines = []
    tot_personal = tot_group_whole = tot_group_share = 0.0
    for sec in bd.GEAR_SECTIONS:
        p_rows = [r for r in picked_personal_rows if r["section"] == sec]
        g_rows = [r for r in picked_group_rows if r["section"] == sec]
        e_items = [e for e in extras if e["layout_section"] == sec]
        p, gw, gs = section_tally(p_rows + g_rows)
        e_lines, ep, egw, egs = render_extras_rows(e_items)
        p += ep; gw += egw; gs += egs
        tot_personal += p; tot_group_whole += gw; tot_group_share += gs
        sec_lines.append("")
        sec_lines.append(f"### {SECTION_NUMS[sec]}. {bd.SECTION_TITLES[sec]} ({set_label})")
        sec_lines.append("")
        sec_lines.append(tally_line(bd.SECTION_TITLES[sec], p, gw, gs))
        sec_lines.append("")
        sec_lines.extend(render_gear_table(p_rows, g_rows))
        if e_lines:
            sec_lines.append("")
            sec_lines.extend(e_lines)
    return sec_lines, round(tot_personal, 2), round(tot_group_whole, 2), round(tot_group_share, 2)


solid_sec_lines, solid_gear_personal, solid_gear_group_whole, solid_gear_group_share = emit_gear_sections(
    personal_rows, group_rows, "Solid")
budget_sec_lines, budget_gear_personal, budget_gear_group_whole, budget_gear_group_share = emit_gear_sections(
    budget_personal_rows, budget_group_rows, "Budget")

_glance = []
_glance.append("## At a glance -- gear total, Solid vs Budget (sections 1-4 only)")
_glance.append("")
_glance.append("| Set | Personal total | Group total (whole group) | Group per-person share | Gear grand total per person |")
_glance.append("|---|---|---|---|---|")
_glance.append(f"| **Solid** | ${solid_gear_personal:,.2f} | ${solid_gear_group_whole:,.2f} | ${solid_gear_group_share:,.2f} | ${round(solid_gear_personal+solid_gear_group_share,2):,.2f} |")
_glance.append(f"| **Budget** | ${budget_gear_personal:,.2f} | ${budget_gear_group_whole:,.2f} | ${budget_gear_group_share:,.2f} | ${round(budget_gear_personal+budget_gear_group_share,2):,.2f} |")
_ph_idx = lines.index("__AT_A_GLANCE_PLACEHOLDER__")
lines[_ph_idx:_ph_idx + 1] = _glance

lines.append("")
lines.append("## Solid picks -- sections 1-4 (gear)")
lines.extend(solid_sec_lines)
lines.append("")
lines.append("## Budget picks -- sections 1-4 (gear)")
lines.extend(budget_sec_lines)

# ----------------------------------------------------------------------------
# Consumables and Food -- their own sections with their own tally box each,
# NOT part of the gear total. Same recommended pick in both Solid and Budget
# (not tiered), so one render covers both sets.
# ----------------------------------------------------------------------------
consumables_items = [e for e in extras if e["layout_section"] == bd.SECTION_CONSUMABLES]
food_items = [e for e in extras if e["layout_section"] == bd.SECTION_FOOD]

cons_lines, cons_personal, cons_group_whole, cons_group_share = render_extras_rows(consumables_items)
food_lines, food_personal, food_group_whole, food_group_share = render_extras_rows(food_items)

lines.append("")
lines.append("## Consumables")
lines.append("")
lines.append("Used-up items (sunscreen, TP, batteries, wipes, lighters and similar). Same list/price for Solid and Budget.")
lines.append("")
lines.append(tally_line("Consumables", cons_personal, cons_group_whole, cons_group_share))
lines.append("")
lines.extend(cons_lines)

lines.append("")
lines.append("## Food")
lines.append("")
lines.append("Backcountry rations (6 people x 3 nights) plus the base-camp grocery list. Same list/price for Solid and Budget.")
lines.append("")
lines.append(tally_line("Food", food_personal, food_group_whole, food_group_share))
lines.append("")
lines.extend(food_lines)

# ----------------------------------------------------------------------------
# Trip totals: gear (sections 1-4) + Consumables + Food.
# ----------------------------------------------------------------------------
solid_trip_total = round(solid_gear_personal + solid_gear_group_share + cons_personal + cons_group_share + food_personal + food_group_share, 2)
budget_trip_total = round(budget_gear_personal + budget_gear_group_share + cons_personal + cons_group_share + food_personal + food_group_share, 2)

lines.append("")
lines.append("## Trip total, everything (gear sections 1-4 + Consumables + Food)")
lines.append("")
lines.append("| Set | Gear grand total/person | Consumables/person | Food/person | Trip total/person |")
lines.append("|---|---|---|---|---|")
lines.append(
    f"| **Solid** | ${round(solid_gear_personal + solid_gear_group_share, 2):,.2f} | "
    f"${round(cons_personal + cons_group_share, 2):,.2f} | ${round(food_personal + food_group_share, 2):,.2f} | "
    f"${solid_trip_total:,.2f} |"
)
lines.append(
    f"| **Budget** | ${round(budget_gear_personal + budget_gear_group_share, 2):,.2f} | "
    f"${round(cons_personal + cons_group_share, 2):,.2f} | ${round(food_personal + food_group_share, 2):,.2f} | "
    f"${budget_trip_total:,.2f} |"
)

OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {OUT} -- {len(rows)} solid gear items + {len(budget_rows)} budget gear items + "
      f"{len(extras)} extras/food items; "
      f"SOLID trip total/person ${solid_trip_total:,.2f}; "
      f"BUDGET trip total/person ${budget_trip_total:,.2f}")
