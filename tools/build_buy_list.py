"""
Build a final buy list from the current Gear_Picker.xlsx CHOICE picks, sorted
by lead time (longest lead first, so cottage-made gear gets ordered now).

Re-runnable: reads the live Picker/Options sheets directly, so it always
matches whatever CHOICE values are currently saved in the workbook -- no
separate data source to keep in sync.

Usage:  python tools/build_buy_list.py
Output: E:\\dev\\ga-gold-trip\\BUY_LIST.md
"""
import openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "Gear_Picker.xlsx"
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
    his_price = round((opt["price"] or 0) / split, 2)
    rows.append({
        "kit": kit, "label": label, "required": required, "tier": choice,
        "brand": opt["brand"], "model": opt["model"], "price": opt["price"],
        "his_price": his_price, "split": split, "price_url": opt["price_url"],
        "where_to_buy": opt["where_to_buy"], "lead_days": days, "lead_label": lead_label,
    })

rows.sort(key=lambda x: (-x["lead_days"], x["kit"], x["label"]))

total_his_price = sum(r["his_price"] for r in rows)

lines = []
lines.append("# GA Gold Trip -- Final Buy List")
lines.append("")
lines.append(f"Generated from Gear_Picker.xlsx CHOICE picks by tools\\build_buy_list.py.")
lines.append(f"Sorted by lead time (longest first) -- order the top rows now.")
lines.append("")
lines.append(f"**Total (his share, all items below): ${total_his_price:,.2f}**")
lines.append("")
lines.append("| Order first? | Item | Required? | Tier | Pick | His price | Full price (if split) | Where | Link |")
lines.append("|---|---|---|---|---|---|---|---|---|")
for r in rows:
    split_note = f"${r['price']:.2f} / {r['split']}-way split" if r["split"] > 1 else "--"
    link = f"[buy]({r['price_url']})" if r["price_url"] else "--"
    lines.append(
        f"| {r['lead_label']} | {r['label']} | {r['required']} | {r['tier']} | "
        f"{r['brand']} {r['model']} | ${r['his_price']:.2f} | {split_note} | "
        f"{r['where_to_buy']} | {link} |"
    )

OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {OUT} -- {len(rows)} items to buy, his-share total ${total_his_price:,.2f}")
