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

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "Gear_Picker.xlsx"
EXTRAS_JSON = ROOT / "research" / "gear-tiers-extras-food.json"
SLEEP_TEMP_JSON = ROOT / "research" / "gear-tiers-sleep-temp.json"
OUT = ROOT / "BUY_LIST.md"

# ----------------------------------------------------------------------------
# Sleep system is now a mutually-exclusive TEMPERATURE choice (40F+ / 30F /
# 20F), each with its own Budget and Solid bag+pad pair, instead of a plain
# tier pick. Only the DEFAULT_TEMP band counts toward totals -- the other two
# are shown as alternatives with their own prices, not summed in.
# The old sleep_system (20F alt) / sleep_system_30f / sleeping_pad Picker rows
# are superseded by this and excluded from both the Solid and Budget loops
# below so nothing double-counts.
# ----------------------------------------------------------------------------
DEFAULT_TEMP = "30F"
TEMP_ORDER = ["40F", "30F", "20F"]
SLEEP_KEYS_EXCLUDED = {"sleep_system", "sleep_system_30f", "sleeping_pad"}
sleep_temp = json.loads(SLEEP_TEMP_JSON.read_text(encoding="utf-8"))
sleep_by_key = {(d["temp"], d["type"], d["tier"]): d for d in sleep_temp}

# Cottage/small-batch makers: made-to-order or frequently backordered.
COTTAGE_BRANDS = {
    "enlightened equipment", "durston gear", "zpacks", "katabatic gear",
    "hyperlite mountain gear", "litesmith",
}

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

def lead_time(brand, price_url, where_to_buy):
    b = (brand or "").strip().lower()
    if b in COTTAGE_BRANDS:
        return (21, "2-4 weeks -- cottage-made, order first")
    if b == "diy":
        return (1, "1-2 days -- DIY, buy material locally (hardware/craft store)")
    if "generic" in b or "asr" in b or "se " in b or "se/" in b.replace(" ", ""):
        return (5, "3-7 days -- Amazon/generic")
    return (3, "1-5 days -- in-stock retail (REI/Amazon/brand site)")

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
    per_person_price = round((opt["price"] or 0) / split, 2)
    rows.append({
        "kit": kit, "label": label, "required": required, "tier": choice,
        "brand": opt["brand"], "model": opt["model"], "price": opt["price"],
        "per_person_price": per_person_price, "split": split, "price_url": opt["price_url"],
        "where_to_buy": opt["where_to_buy"], "lead_days": days, "lead_label": lead_label,
    })


def sleep_row(kit, label, item):
    days, lead_label = lead_time(item["brand"], item["price_url"], item["where_to_buy"])
    return {
        "kit": kit, "label": label, "required": "must", "tier": f"{item['temp']} Solid" if item["tier"] == "solid" else f"{item['temp']} Budget",
        "brand": item["brand"], "model": f"{item['model']} ({item['rating_note']})", "price": item["price_usd"],
        "per_person_price": item["price_usd"], "split": 1, "price_url": item["price_url"],
        "where_to_buy": item["where_to_buy"], "lead_days": days, "lead_label": lead_label,
    }


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
BUDGET_TIER_OVERRIDE = {
    "hiking_footwear": "Value",
    "food storage": "Value",
    "first aid kit": "Value",
    "blaze_orange_hat_vest": "Value",
}

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
    per_person_price = round((opt["price"] or 0) / split, 2)
    budget_rows.append({
        "kit": kit, "label": label, "required": required, "tier": tier,
        "brand": opt["brand"], "model": opt["model"], "price": opt["price"],
        "per_person_price": per_person_price, "split": split, "price_url": opt["price_url"],
        "where_to_buy": opt["where_to_buy"], "lead_days": days, "lead_label": lead_label,
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
    out.append("### Personal items (full price -- each guy buys his own)")
    out.append("")
    out.append("| Order first? | Item | Required? | Tier | Pick | Price | Where | Link |")
    out.append("|---|---|---|---|---|---|---|---|")
    for r in personal_rows:
        link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
        out.append(
            f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
            f"{r['brand']} {r['model']} | ${r['price']:.2f} | "
            f"{r['where_to_buy']} | {link} |"
        )
    out.append("")
    out.append("### Group / shared gear (one purchase for the group -- split shown per item)")
    out.append("")
    out.append("| Order first? | Item | Required? | Tier | Pick | Group total | Split | Per-person share | Where | Link |")
    out.append("|---|---|---|---|---|---|---|---|---|---|")
    for r in group_rows:
        link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
        out.append(
            f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
            f"{r['brand']} {r['model']} | ${r['price']:.2f} | /{r['split']} | ${r['per_person_price']:.2f} | "
            f"{r['where_to_buy']} | {link} |"
        )
    return out

lines = []
lines.append("# GA Gold Trip -- Final Buy List")
lines.append("")
lines.append(f"Generated from Gear_Picker.xlsx CHOICE picks (Solid) plus a computed cheapest-safe")
lines.append(f"preset (Budget) by tools\\build_buy_list.py. Sorted by lead time (longest first)")
lines.append(f"within each set -- order the top rows in each table now.")
lines.append("")
lines.append("## At a glance -- Solid vs Budget")
lines.append("")
lines.append("| Set | Personal total | Group total (whole group) | Group per-person share | Grand total per person |")
lines.append("|---|---|---|---|---|")
lines.append(f"| **Solid** | ${personal_total:,.2f} | ${group_total:,.2f} | ${group_per_person_total:,.2f} | ${grand_total_per_person:,.2f} |")
lines.append(f"| **Budget** | ${budget_personal_total:,.2f} | ${budget_group_total:,.2f} | ${budget_group_per_person_total:,.2f} | ${budget_grand_total_per_person:,.2f} |")
lines.append("")
lines.append(
    "Budget preset picks the cheapest tier per item EXCEPT four safety overrides (kept at "
    "Value tier because the cheapest tier is flagged unsafe/unreliable in its own sourced verdict): "
    "hiking footwear (thrifted $0 mesh trail runner is a cold-water-wading beginner-caution pick -> "
    "Merrell Moab 3 $75), bear-proof food storage (DIY bear-hang, beginner_score 2 -> Ursack Major XL), "
    "first aid kit (DIY kit, beginner_score 2, 'riskiest tier for a first-time group' -> AMK Ultralight .7), "
    "and blaze-orange vest (its own Value tier at $8.50 is actually cheaper than its Budget tier at $16.96 "
    "for equal compliance -- picked the cheaper-and-safe option)."
)
lines.append("")
lines.append("## Sleep system -- temperature choice (mutually exclusive)")
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
lines.append("")
lines.append("## Solid picks")
lines.append("")
lines.extend(render_gear_table(personal_rows, group_rows))
lines.append("")
lines.append("## Budget picks")
lines.append("")
lines.extend(render_gear_table(budget_personal_rows, budget_group_rows))

# ----------------------------------------------------------------------------
# Sections A/B/C -- small items & consumables, car-camp group gear, food.
# Data-driven from research/gear-tiers-extras-food.json (same pattern as the
# tiered gear-tiers-*.json files, but flat -- one recommended pick per item,
# not budget/value/premium tiers).
# ----------------------------------------------------------------------------
extras = json.loads(EXTRAS_JSON.read_text(encoding="utf-8"))

SECTION_TITLES = {
    "A": "Small items & consumables",
    "B": "Car-camp / base-camp group gear",
    "C": "Food (backcountry rations + car-camp groceries)",
}

extras_personal_total = 0.0
extras_group_total = 0.0
extras_group_per_person_total = 0.0

for sec in ("A", "B", "C"):
    sec_items = [e for e in extras if e["section"] == sec]
    if not sec_items:
        continue
    lines.append("")
    lines.append(f"## {sec}. {SECTION_TITLES[sec]}")
    lines.append("")
    lines.append("| Item | Personal/Shared | Qty | Unit price | Line total | Split | Per-person share | Where | Link |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for e in sec_items:
        qty = e.get("qty", 1) or 1
        unit_price = e.get("unit_price", 0) or 0
        line_total = round(qty * unit_price, 2)
        split = max(1, int(e.get("split", 1) or 1))
        kind = e["personal_or_shared"]
        if kind == "personal":
            per_person = unit_price  # each person buys/owns one
            extras_personal_total += unit_price  # per-person cost, not qty*unit_price (qty=headcount)
        else:
            per_person = round(line_total / split, 2)
            extras_group_total += line_total
            extras_group_per_person_total += per_person
        link = f"[buy]({e['price_url']})" if e.get("price_url") else "est."
        pick = f"{e.get('brand','')} {e.get('model','')}".strip()
        lines.append(
            f"| {e['item']} -- {pick} | {kind} | {qty} | ${unit_price:,.2f} | ${line_total:,.2f} | "
            f"/{split if kind == 'shared' else 1} | ${per_person:,.2f} | {e.get('where_to_buy','')} | {link} |"
        )
        if e.get("note"):
            lines.append(f"| _{e['note']}_ | | | | | | | | |")

extras_group_per_person_total = round(extras_group_per_person_total, 2)
extras_grand_per_person = round(extras_personal_total + extras_group_per_person_total, 2)

lines.append("")
lines.append(
    f"**Sections A-C totals -- personal: ${extras_personal_total:,.2f}/person, "
    f"group: ${extras_group_total:,.2f} (${extras_group_per_person_total:,.2f}/person share), "
    f"combined A-C per person: ${extras_grand_per_person:,.2f}**"
)

# ----------------------------------------------------------------------------
# Combined grand totals (gear + extras) -- Sections A-C have one pick per item
# (not tiered), so they're identical in both the Solid and Budget sets.
# ----------------------------------------------------------------------------
combined_personal_total = round(personal_total + extras_personal_total, 2)
combined_group_total = round(group_total + extras_group_total, 2)
combined_group_per_person = round(group_per_person_total + extras_group_per_person_total, 2)
combined_grand_per_person = round(combined_personal_total + combined_group_per_person, 2)

budget_combined_personal_total = round(budget_personal_total + extras_personal_total, 2)
budget_combined_group_total = round(budget_group_total + extras_group_total, 2)
budget_combined_group_per_person = round(budget_group_per_person_total + extras_group_per_person_total, 2)
budget_combined_grand_per_person = round(budget_combined_personal_total + budget_combined_group_per_person, 2)

lines.append("")
lines.append("## Grand totals (gear + Sections A-C)")
lines.append("")
lines.append("| Set | Personal total/person | Group total (whole group) | Group per-person share | Grand total per person |")
lines.append("|---|---|---|---|---|")
lines.append(f"| **Solid** | ${combined_personal_total:,.2f} | ${combined_group_total:,.2f} | ${combined_group_per_person:,.2f} | ${combined_grand_per_person:,.2f} |")
lines.append(f"| **Budget** | ${budget_combined_personal_total:,.2f} | ${budget_combined_group_total:,.2f} | ${budget_combined_group_per_person:,.2f} | ${budget_combined_grand_per_person:,.2f} |")
lines.append("")
lines.append(
    "Sections A-C (small items/consumables, car-camp group gear, food) carry one recommended pick "
    "per item, not budget/value/premium tiers, so they are the same dollar amount in both sets above."
)

OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {OUT} -- {len(rows)} solid gear items + {len(budget_rows)} budget gear items + "
      f"{len(extras)} extras/food items; "
      f"SOLID grand/person ${combined_grand_per_person:,.2f}; "
      f"BUDGET grand/person ${budget_combined_grand_per_person:,.2f}")
