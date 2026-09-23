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
OUT = ROOT / "BUY_LIST.md"

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

rows.sort(key=lambda x: (-x["lead_days"], x["kit"], x["label"]))

personal_rows = [r for r in rows if r["split"] <= 1]
group_rows = [r for r in rows if r["split"] > 1]

personal_total = sum(r["price"] for r in personal_rows)
group_total = sum(r["price"] for r in group_rows)
group_per_person_total = round(sum(r["per_person_price"] for r in group_rows), 2)
grand_total_per_person = round(personal_total + group_per_person_total, 2)

lines = []
lines.append("# GA Gold Trip -- Final Buy List")
lines.append("")
lines.append(f"Generated from Gear_Picker.xlsx CHOICE picks by tools\\build_buy_list.py.")
lines.append(f"Sorted by lead time (longest first) -- order the top rows now.")
lines.append("")
lines.append(f"**Personal items total: ${personal_total:,.2f}**")
lines.append(f"**Group/shared gear total (whole group): ${group_total:,.2f} -- per-person share: ${group_per_person_total:,.2f}**")
lines.append(f"**Grand total per person (personal + group share): ${grand_total_per_person:,.2f}**")
lines.append("")
lines.append("## Personal items (full price -- each guy buys his own)")
lines.append("")
lines.append("| Order first? | Item | Required? | Tier | Pick | Price | Where | Link |")
lines.append("|---|---|---|---|---|---|---|---|")
for r in personal_rows:
    link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
    lines.append(
        f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
        f"{r['brand']} {r['model']} | ${r['price']:.2f} | "
        f"{r['where_to_buy']} | {link} |"
    )
lines.append("")
lines.append("## Group / shared gear (one purchase for the group -- split shown per item)")
lines.append("")
lines.append("| Order first? | Item | Required? | Tier | Pick | Group total | Split | Per-person share | Where | Link |")
lines.append("|---|---|---|---|---|---|---|---|---|---|")
for r in group_rows:
    link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
    lines.append(
        f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
        f"{r['brand']} {r['model']} | ${r['price']:.2f} | /{r['split']} | ${r['per_person_price']:.2f} | "
        f"{r['where_to_buy']} | {link} |"
    )

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
# Combined grand totals (gear + extras)
# ----------------------------------------------------------------------------
combined_personal_total = round(personal_total + extras_personal_total, 2)
combined_group_total = round(group_total + extras_group_total, 2)
combined_group_per_person = round(group_per_person_total + extras_group_per_person_total, 2)
combined_grand_per_person = round(combined_personal_total + combined_group_per_person, 2)

lines.append("")
lines.append("## Grand totals (gear + Sections A-C)")
lines.append("")
lines.append(f"- **Personal total (gear + A-C personal): ${combined_personal_total:,.2f}/person**")
lines.append(f"- **Group/shared total (gear + A-C group): ${combined_group_total:,.2f} whole group -- ${combined_group_per_person:,.2f}/person share**")
lines.append(f"- **Grand total per person (everything): ${combined_grand_per_person:,.2f}**")

OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {OUT} -- {len(rows)} gear items + {len(extras)} extras/food items; "
      f"gear personal ${personal_total:,.2f}, gear group ${group_total:,.2f} (${group_per_person_total:,.2f}/person); "
      f"A-C personal ${extras_personal_total:,.2f}, A-C group ${extras_group_total:,.2f} (${extras_group_per_person_total:,.2f}/person); "
      f"GRAND per person ${combined_grand_per_person:,.2f}")
