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

# ----------------------------------------------------------------------------
# Site/BUY_LIST layout sections -- grouped by WHERE the gear is used, per the
# 2026-09-23 layout request. Sections 1-4 are "gear" and are counted in the
# top totals card (with a subtotal per section). Consumables and Food are
# each their own section with their own tally box, NOT counted in the gear
# top total -- see "Trip total, everything" for the sum of all of it.
# ----------------------------------------------------------------------------
SECTION_BASE_CAMP = "base_camp"
SECTION_OVERNIGHT_PERSONAL = "overnight_personal"
SECTION_OVERNIGHT_SHARED = "overnight_shared"
SECTION_PANNING = "panning"
SECTION_CONSUMABLES = "consumables"
SECTION_FOOD = "food"

GEAR_SECTIONS = [SECTION_BASE_CAMP, SECTION_OVERNIGHT_PERSONAL, SECTION_OVERNIGHT_SHARED, SECTION_PANNING]

SECTION_TITLES = {
    SECTION_BASE_CAMP: "Base camp (Vogel car camp)",
    SECTION_OVERNIGHT_PERSONAL: "Overnight / backcountry: personal",
    SECTION_OVERNIGHT_SHARED: "Overnight / backcountry: shared",
    SECTION_PANNING: "Panning gear",
    SECTION_CONSUMABLES: "Consumables",
    SECTION_FOOD: "Food",
}

# ----------------------------------------------------------------------------
# Personal vs shared vs base-camp rule (2026-09-23 user correction pass).
# Applied to every item in the data -- both the tiered Picker items keyed
# here and the flat gear-tiers-extras-food.json rows (see extras_section()
# and each row's own personal_or_shared/split fields).
#
# PERSONAL (each person buys their own, full price, split=1/"no"): anything a
# person wears, sleeps in, carries for themselves, or uses alone -- the tent
# (1-person, one per hiker), sleeping bag, pad, pillow, pack, pack liner,
# clothing, rain gear, boots, socks, gloves, hat, blaze vest, headlamp,
# personal water bottles, mug/spoon/bowl (eating utensil/cup), trekking
# poles, sit pad, camp shoes, toiletries/sunscreen/lip balm/bug spray,
# personal first-aid (blister care), camp chair, and personal snacks.
#
# SHARED ON THE HIKE (split by the number of people actually sharing --
# stated per item, usually /6): backpacking stove, cook pot, fuel, water
# filter (+ backup Aquatabs), bear bag/Ursack/food storage, the group first
# aid kit, the satellite messenger, the repair kit, the (cathole) trowel,
# map + compass, and ALL panning/digging gear (pans, classifiers, shovels,
# crevice tools, snuffer bottles, vials, magnet, buckets, sluice).
#
# BASE CAMP (Vogel, shared /6): the big two-burner stove + propane, cooler,
# lantern, table cover, tarp, dish kit, cutting board, and base-camp
# groceries. The group ALREADY OWNS two big base-camp tents -- these are
# never a buy-list line item; if listed at all it's "already owned, $0"
# (see the info-only row added to the extras "B" data).
#
# No personal item may be split; no shared item may appear in a personal
# section. 2026-09-23: the old bundled "toiletries/trowel" line was split
# into a personal toiletries line (full price, "toiletries" key) and a
# shared cathole trowel line (split 6, "cathole_trowel" key).
# ----------------------------------------------------------------------------

# Picker `key` (category) -> gear section.
KEY_SECTION = {
    # Worn kit
    "hiking_footwear": SECTION_OVERNIGHT_PERSONAL,
    "hiking_socks": SECTION_OVERNIGHT_PERSONAL,
    "hiking_pants": SECTION_OVERNIGHT_PERSONAL,
    "sun_warm_hat_beanie": SECTION_OVERNIGHT_PERSONAL,
    "blaze_orange_hat_vest": SECTION_OVERNIGHT_PERSONAL,
    "light_gloves": SECTION_OVERNIGHT_PERSONAL,
    # Overnight Pack kit -- personal
    "backpack": SECTION_OVERNIGHT_PERSONAL,
    "pillow": SECTION_OVERNIGHT_PERSONAL,
    "groundsheet": SECTION_OVERNIGHT_PERSONAL,
    "stuff_dry_sacks": SECTION_OVERNIGHT_PERSONAL,
    "pack_liner": SECTION_OVERNIGHT_PERSONAL,
    "rain_jacket": SECTION_OVERNIGHT_PERSONAL,
    "insulated_puffy_jacket": SECTION_OVERNIGHT_PERSONAL,
    "fleece_midlayer": SECTION_OVERNIGHT_PERSONAL,
    "base_layer": SECTION_OVERNIGHT_PERSONAL,
    "eating utensil/cup": SECTION_OVERNIGHT_PERSONAL,
    "water bottles/bladders": SECTION_OVERNIGHT_PERSONAL,
    "headlamp": SECTION_OVERNIGHT_PERSONAL,
    "power bank": SECTION_OVERNIGHT_PERSONAL,
    "knife/multitool": SECTION_OVERNIGHT_PERSONAL,
    # 2026-09-23: split the old bundled "toiletries/trowel" line into two --
    # personal toiletries (each hiker buys their own, full price) and the
    # shared cathole trowel (split 6, stated on the page).
    "toiletries": SECTION_OVERNIGHT_PERSONAL,
    "cathole_trowel": SECTION_OVERNIGHT_SHARED,
    # Overnight Pack kit -- shared
    "tent_shelter": SECTION_OVERNIGHT_PERSONAL,  # 2026-09-23: each hiker carries/buys his own tent, not split
    "stove": SECTION_OVERNIGHT_SHARED,
    "cook pot": SECTION_OVERNIGHT_SHARED,
    "fuel": SECTION_OVERNIGHT_SHARED,
    "water filter": SECTION_OVERNIGHT_SHARED,
    "food storage": SECTION_OVERNIGHT_SHARED,
    "first aid kit": SECTION_OVERNIGHT_SHARED,
    "satellite messenger": SECTION_OVERNIGHT_SHARED,
    "phone navigation app": SECTION_OVERNIGHT_SHARED,
    # Trail Creek Kit -- panning
    "gold_pan": SECTION_PANNING,
    "insulated_waterproof_gloves": SECTION_PANNING,
    "neoprene_socks_wading": SECTION_PANNING,
    "snuffer_bottle": SECTION_PANNING,
    "vials": SECTION_PANNING,
    "crevice_tools": SECTION_PANNING,
    "magnifier_loupe": SECTION_PANNING,
    "small_trowel": SECTION_PANNING,
    # Base Camp Personal kit -- split between panning and base camp
    "classifier": SECTION_PANNING,
    "knee_pads": SECTION_PANNING,
    "waders_vs_none": SECTION_PANNING,
    "camp_shoes": SECTION_BASE_CAMP,
    "sit pad": SECTION_BASE_CAMP,
    "trekking poles": SECTION_BASE_CAMP,
}

# Sleep system (temperature-choice bag+pad) is always personal, one per person.
SLEEP_SECTION = SECTION_OVERNIGHT_PERSONAL

# Extras (gear-tiers-extras-food.json) section A/B/C -> layout section.
# B (car-camp/base-camp group gear) is always base_camp; C (food) is always
# food. A (small items/consumables) is split: durable tools/safety/nav gear
# stay in the gear sections, and things that get used up on the trip
# (hygiene, skin care, bug spray, batteries, fire, water-treatment backup,
# ear plugs) are Consumables.
EXTRAS_SECTION_B = SECTION_BASE_CAMP
EXTRAS_SECTION_C = SECTION_FOOD
EXTRAS_SECTION_A_BY_CATEGORY = {
    "water_treatment_backup": SECTION_CONSUMABLES,
    "fire": SECTION_CONSUMABLES,
    "safety": SECTION_OVERNIGHT_PERSONAL,       # SOL emergency bivvy -- durable, personal
    "navigation": SECTION_OVERNIGHT_SHARED,      # paper map + compass -- durable, shared
    "power": SECTION_CONSUMABLES,               # spare batteries -- used up
    "repair": SECTION_OVERNIGHT_SHARED,          # repair kit -- durable tool, shared
    "hygiene": SECTION_CONSUMABLES,
    "skin_care": SECTION_CONSUMABLES,
    "bugs": SECTION_CONSUMABLES,
    "panning_tools": SECTION_PANNING,           # tweezers/magnet/spray bottle -- durable
}
# "misc" category items are split per-item, not per-category.
EXTRAS_MISC_SECTION_BY_ITEM_PREFIX = {
    "Pack towel": SECTION_OVERNIGHT_PERSONAL,   # durable, personal
    "Foam ear plugs": SECTION_CONSUMABLES,      # used up
    "Paracord": SECTION_OVERNIGHT_SHARED,       # durable rigging, shared
    "Clothesline": SECTION_BASE_CAMP,           # durable, base camp
}


def extras_section(item):
    """Return the layout section (base_camp/overnight_personal/overnight_shared/
    panning/consumables/food) for one gear-tiers-extras-food.json row."""
    sec = item["section"]
    if sec == "B":
        return EXTRAS_SECTION_B
    if sec == "C":
        return EXTRAS_SECTION_C
    cat = item.get("category", "")
    if cat == "misc":
        for prefix, layout_sec in EXTRAS_MISC_SECTION_BY_ITEM_PREFIX.items():
            if item["item"].startswith(prefix):
                return layout_sec
        return SECTION_CONSUMABLES
    return EXTRAS_SECTION_A_BY_CATEGORY.get(cat, SECTION_CONSUMABLES)


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
        "section": SLEEP_SECTION,
    }
