"""
Shared data/logic for the Budget and Solid buy-list presets, used by both
build_buy_list.py (BUY_LIST.md) and build_hub.py (index.html Buy tab), so the
two can never disagree about what "Budget set" / "Solid set" means.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLEEP_TEMP_JSON = ROOT / "research" / "gear-tiers-sleep-temp.json"
EXTRAS_JSON = ROOT / "research" / "gear-tiers-extras-food.json"

# Sleep system is a mutually-exclusive TEMPERATURE choice (40F+ / 30F / 20F),
# each with its own Budget and Solid bag+pad pair. Only DEFAULT_TEMP counts
# toward totals. The old sleep_system / sleep_system_30f / sleeping_pad
# Picker rows are superseded by this and must be excluded everywhere so
# nothing double-counts.
DEFAULT_TEMP = "30F"
TEMP_ORDER = ["40F", "30F", "20F"]
SLEEP_KEYS_EXCLUDED = {"sleep_system", "sleep_system_30f", "sleeping_pad"}

# Cottage/small-batch makers: made-to-order or frequently backordered.
COTTAGE_BRANDS = {
    "enlightened equipment", "durston gear", "zpacks", "katabatic gear",
    "hyperlite mountain gear", "litesmith",
}

# BUDGET preset = cheapest tier per item, EXCEPT where the cheapest tier is
# flagged unsafe/non-functional for this trip's conditions (sanity review
# 2026-09-23) -- see build_buy_list.py header comment for the full rationale
# per key.
BUDGET_TIER_OVERRIDE = {
    "hiking_footwear": "Value",
    "food storage": "Value",
    "first aid kit": "Value",
    "blaze_orange_hat_vest": "Value",
}


def round_share(amount_dollars, split):
    """Round amount_dollars/split to the nearest cent, round-half-up, using
    integer-cent arithmetic so the result never depends on binary-float
    representation noise (plain round(x/split, 2) gave inconsistent results
    for different exact-half-cent splits -- e.g. $10.95/6 rounded down to
    $1.82 while $12.99/6 rounded up to $2.17, purely because of how each
    value happens to be stored as a float). Both build_buy_list.py and
    build_hub.py's JS use this same integer method so their totals can never
    drift apart on a tie.
    """
    total_cents = round(amount_dollars * 100)
    split = max(1, int(split))
    q, r = divmod(total_cents, split)
    if 2 * r >= split:
        q += 1
    return q / 100.0


def lead_time(brand, price_url, where_to_buy):
    b = (brand or "").strip().lower()
    if b in COTTAGE_BRANDS:
        return (21, "2-4 weeks -- cottage-made, order first")
    if b == "diy":
        return (1, "1-2 days -- DIY, buy material locally (hardware/craft store)")
    if "generic" in b or "asr" in b or "se " in b or "se/" in b.replace(" ", ""):
        return (5, "3-7 days -- Amazon/generic")
    return (3, "1-5 days -- in-stock retail (REI/Amazon/brand site)")


def load_sleep_temp():
    """Returns dict keyed (temp, type["bag"|"pad"], tier["budget"|"solid"]) -> item dict."""
    data = json.loads(SLEEP_TEMP_JSON.read_text(encoding="utf-8"))
    return {(d["temp"], d["type"], d["tier"]): d for d in data}


def load_extras():
    """Returns the flat list of section A/B/C items (small items, car-camp, food)."""
    return json.loads(EXTRAS_JSON.read_text(encoding="utf-8"))


def sleep_row(kit, label, item):
    days, lead_label = lead_time(item["brand"], item["price_url"], item["where_to_buy"])
    return {
        "kit": kit, "label": label,
        "required": "must",
        "tier": f"{item['temp']} Solid" if item["tier"] == "solid" else f"{item['temp']} Budget",
        "brand": item["brand"], "model": f"{item['model']} ({item['rating_note']})",
        "price": item["price_usd"], "per_person_price": item["price_usd"], "split": 1,
        "price_url": item["price_url"], "where_to_buy": item["where_to_buy"],
        "lead_days": days, "lead_label": lead_label,
    }
