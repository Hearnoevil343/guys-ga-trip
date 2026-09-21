"""
Build Gear_Picker.xlsx for the GA Gold Trip (Oct 15-21 2026, Vogel SP base camp +
one backcountry overnight). Re-runnable: reads the research/*.json tier files,
adds the 30F sleep-system group (web-researched), and writes a full interactive
workbook (Start Here / Picker / Dashboard / Compare / Options / Base Camp (Group)
/ Friends' List / Packing Checklist).

Usage:  python tools/build_gear_picker.py
Output: E:\\dev\\ga-gold-trip\\Gear_Picker.xlsx  (and a copy to Downloads)
"""
import json
import csv
import io
import shutil
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment

ROOT = Path(r"E:\dev\ga-gold-trip")
RESEARCH = ROOT / "research"
OUT_XLSX = ROOT / "Gear_Picker.xlsx"
DOWNLOADS = Path.home() / "Downloads" / "Gear_Picker.xlsx"

# ----------------------------------------------------------------------------
# STYLES
# ----------------------------------------------------------------------------
FONT_NAME = "Calibri"
HEADER_FILL = PatternFill("solid", fgColor="2F5233")
HEADER_FONT = Font(name=FONT_NAME, size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name=FONT_NAME, size=18, bold=True, color="2F5233")
SUBTITLE_FONT = Font(name=FONT_NAME, size=11, italic=True, color="555555")
KIT_FILL = PatternFill("solid", fgColor="E4EEE0")
KIT_FONT = Font(name=FONT_NAME, size=11, bold=True, color="2F5233")
TOTAL_FILL = PatternFill("solid", fgColor="D9D2E9")
TOTAL_FONT = Font(name=FONT_NAME, size=11, bold=True)
WARN_FILL = PatternFill("solid", fgColor="F4CCCC")
OK_FILL = PatternFill("solid", fgColor="D9EAD3")
CARD_FILL = PatternFill("solid", fgColor="F3F3F3")
THIN = Side(style="thin", color="BBBBBB")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
WRAP_C = Alignment(wrap_text=True, vertical="center", horizontal="center")

TIER_COLORS = {
    "Budget": ("C6EFCE", "006100"),   # green
    "Value": ("BDD7EE", "1F4E78"),    # blue
    "Premium": ("D9C2EC", "5B2D8E"),  # purple
    "Own": ("F3F3F3", "666666"),
    "Skip": ("F4CCCC", "990000"),
}


def style_header_row(ws, row, ncols, height=32):
    ws.row_dimensions[row].height = height
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = WRAP_C
        cell.border = BORDER


def set_print(ws):
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5


def autofit(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


# ----------------------------------------------------------------------------
# LOAD RESEARCH DATA
# ----------------------------------------------------------------------------
def load(name):
    with open(RESEARCH / name, encoding="utf-8") as f:
        return json.load(f)


def norm_split(v):
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 1


def join_field(v, sep):
    """Join a list field with sep; pass a plain string through unchanged
    (avoids silently exploding a string into comma-joined characters)."""
    if not v:
        return ""
    if isinstance(v, str):
        return v
    return sep.join(v)


def norm_item(d):
    return {
        "category": d["category"],
        "role": d.get("role", ""),
        "tier": d["tier"].capitalize(),
        "brand": d.get("brand", ""),
        "model": d.get("model", ""),
        "weight_oz": float(d.get("weight_oz") or 0),
        "weight_note": d.get("weight_note", ""),
        "price_usd": float(d.get("price_usd") or 0),
        "price_url": d.get("price_url", ""),
        "used_price_range": d.get("used_price_range", ""),
        "where_to_buy": join_field(d.get("where_to_buy"), ", "),
        "community_verdict": d.get("community_verdict", ""),
        "verdict_sources": join_field(d.get("verdict_sources"), ", "),
        "pros": join_field(d.get("pros"), "; "),
        "cons": join_field(d.get("cons"), "; "),
        "oct_ga_fit": d.get("oct_ga_fit", ""),
        "beginner_score": d.get("beginner_score", ""),
        "shared_split": norm_split(d.get("shared_split")),
        "notes": d.get("notes", "") or "",
    }


OPTIONS = []
for fname in [
    "gear-tiers-shelter-sleep.json",
    "gear-tiers-kitchen-water-elec.json",
    "gear-tiers-clothing-panning.json",
]:
    for d in load(fname):
        OPTIONS.append(norm_item(d))

# --- NEW: 30F sleep system group (web-researched 2026-09-21) ----------------
SLEEP_30F = [
    {
        "category": "sleep_system_30f", "role": "30F-rated sleeping bag/quilt (RECOMMENDED default)",
        "tier": "Budget", "brand": "Marmot", "model": "Trestles 30",
        "weight_oz": 52.0, "weight_note": "Men's Reg listed 1450-1560g (~51-55oz) synthetic fill per REI spec",
        "price_usd": 99.95, "price_url": "https://www.rei.com/product/107474/marmot-trestles-30-sleeping-bag-mens",
        "used_price_range": "$45-65 on REI Re/Gear", "where_to_buy": "REI, Marmot.com",
        "community_verdict": "The standard budget synthetic 30F bag REI/CleverHiker point beginners to; synthetic fill keeps insulating if it gets damp, which matters given the wetter-than-normal Oct 2026 outlook.",
        "verdict_sources": "https://www.rei.com/product/107474/marmot-trestles-30-sleeping-bag-mens",
        "pros": "Synthetic — forgiving of damp tent/rain; full rectangular room; cheap enough for a first trip",
        "cons": "Bulkier/heavier than a 30F quilt; real-world warmth runs a few degrees warmer-rated",
        "oct_ga_fit": "Verified fit: Vogel Oct lows 2020-25 averaged 39-48F, coldest night 29F (2022); a 30F bag + puffy + base layer covers this with the El Nino warm/wet outlook",
        "beginner_score": 5, "shared_split": 1,
        "notes": "NEW group added 2026-09-21 alongside the existing 20F group per updated weather research; recommended DEFAULT pick for this trip",
    },
    {
        "category": "sleep_system_30f", "role": "30F-rated sleeping bag/quilt (RECOMMENDED default)",
        "tier": "Value", "brand": "Enlightened Equipment", "model": "Revelation 30 (stock, 850fp)",
        "weight_oz": 19.8, "weight_note": "Reg/Reg stock 850fp ~19.8oz per EE/retailer specs; all 30F+ quilts now include a draft collar",
        "price_usd": 365.0, "price_url": "https://enlightenedequipment.com/revelation-sleeping-quilt/",
        "used_price_range": "$180-240 on r/ULgeartrade", "where_to_buy": "Enlightened Equipment (direct)",
        "community_verdict": "The most-recommended value 30F quilt on r/Ultralight — roughly half the weight of a synthetic 30F bag; needs a good pad seal and a dry bag inside the pack liner given the wetter outlook.",
        "verdict_sources": "https://www.garagegrowngear.com/products/revelation-850fp-by-enlightened-equipment; https://thetrek.co/enlightened-equipment-revelation-review/",
        "pros": "About half the weight/bulk of the budget synthetic 30F bag; draft collar now standard on 30F+; adjustable footbox",
        "cons": "Down needs to stay dry — non-negotiable dry-sack discipline given rain in the forecast; no zipper/hood, small learning curve",
        "oct_ga_fit": "30F with draft collar plus a puffy/base layer comfortably covers the verified 39-48F average lows and the one-off 29F cold night",
        "beginner_score": 3, "shared_split": 1,
        "notes": "NEW group added 2026-09-21; recommended DEFAULT pick — best weight/cost balance for this trip's actual verified temps",
    },
    {
        "category": "sleep_system_30f", "role": "30F-rated sleeping bag/quilt (RECOMMENDED default)",
        "tier": "Premium", "brand": "Katabatic Gear", "model": "Flex 30",
        "weight_oz": 20.3, "weight_note": "~575g (20.3oz) regular, 900fp water-resistant down, per Katabatic/retailer specs",
        "price_usd": 365.0, "price_url": "https://katabaticgear.com/products/flex-30-ultralight-quilt",
        "used_price_range": "$230-290 on r/ULgeartrade", "where_to_buy": "Katabatic Gear (direct)",
        "community_verdict": "Katabatic's pad-attachment system is repeatedly cited (Backpacking Light, The Trek) as best-in-class for sealing drafts; hikers report comfort noticeably below the stated rating, giving real margin on a genuinely cold outlier night.",
        "verdict_sources": "https://thetrek.co/katabatic-gear-flex-30-ultralight-quilt-review/",
        "pros": "Best-in-class draft sealing; 900fp water-resistant down shrugs off tent-wall condensation better than standard down; real margin below 30F",
        "cons": "Same price as the value EE pick for a modest weight/performance gain — the value tier is the better dollar-for-dollar buy for a single trip",
        "oct_ga_fit": "Comfort margin below the 30F rating covers an unusually cold, damp night with room to spare",
        "beginner_score": 2, "shared_split": 1,
        "notes": "NEW group added 2026-09-21. TIER ODDITY: priced the same as the Value pick ($365 vs $365) — kept as sourced (current MSRP), not adjusted",
    },
]
OPTIONS.extend([norm_item(d) for d in SLEEP_30F])

# --- Tier-oddity detection: flag when Value costs more than Premium, or
#     Budget costs more than Value, within the same category. Never silently
#     re-tier -- just annotate the Notes column. -------------------------
by_cat = {}
for o in OPTIONS:
    by_cat.setdefault(o["category"], {})[o["tier"]] = o

for cat, tiers in by_cat.items():
    b, v, p = tiers.get("Budget"), tiers.get("Value"), tiers.get("Premium")
    msgs = []
    if b and v and b["price_usd"] > v["price_usd"]:
        msgs.append(("Budget", f"TIER ODDITY: Budget (${b['price_usd']:.2f}) costs more than Value (${v['price_usd']:.2f}) in this category -- kept as sourced."))
        msgs.append(("Value", f"TIER ODDITY: Value (${v['price_usd']:.2f}) is cheaper than Budget (${b['price_usd']:.2f}) in this category -- kept as sourced."))
    if v and p and v["price_usd"] > p["price_usd"]:
        msgs.append(("Value", f"TIER ODDITY: Value (${v['price_usd']:.2f}) costs more than Premium (${p['price_usd']:.2f}) in this category -- kept as sourced, not auto-corrected."))
        msgs.append(("Premium", f"TIER ODDITY: Premium (${p['price_usd']:.2f}) is cheaper than Value (${v['price_usd']:.2f}) in this category -- kept as sourced."))
    for tier, msg in msgs:
        item = tiers[tier]
        item["notes"] = (item["notes"] + " | " if item["notes"] else "") + msg

# Sort for readability: category (first-seen order), then Budget/Value/Premium
TIER_ORDER = {"Budget": 0, "Value": 1, "Premium": 2}
cat_order = []
for o in OPTIONS:
    if o["category"] not in cat_order:
        cat_order.append(o["category"])
OPTIONS.sort(key=lambda o: (cat_order.index(o["category"]), TIER_ORDER[o["tier"]]))

N_OPT = len(OPTIONS)
OPT_LAST = N_OPT + 1  # last data row on Options sheet (row1 = header)
OPT_RANGE_END = OPT_LAST + 20  # buffer for formula ranges

print(f"Loaded {N_OPT} option rows across {len(cat_order)} categories.")

# ----------------------------------------------------------------------------
# PICKER ROW DEFINITIONS: (kit, category_key, display label, required, default)
# ----------------------------------------------------------------------------
PICKER_ROWS = [
    # Worn on the trail
    ("Worn", "hiking_footwear", "Hiking footwear (worn)", "must", "Value"),
    ("Worn", "hiking_socks", "Hiking socks, per pair (bring 3)", "must", "Value"),
    ("Worn", "hiking_pants", "Hiking pants (worn, no cotton)", "must", "Value"),
    ("Worn", "sun_warm_hat_beanie", "Warm hat / beanie", "must", "Value"),
    ("Worn", "blaze_orange_hat_vest", "Blaze orange hat/vest (required, deer season)", "must", "Value"),
    ("Worn", "light_gloves", "Light liner gloves (cold mornings)", "nice", "Value"),
    # Overnight pack
    ("Overnight Pack", "backpack", "Backpack, 40-60L", "must", "Value"),
    ("Overnight Pack", "tent_shelter", "Tent/shelter (his share, split w/ tentmate)", "must", "Value"),
    ("Overnight Pack", "sleep_system", "Sleeping bag/quilt (20F) -- backup/colder-margin option", "alt", "Skip"),
    ("Overnight Pack", "sleep_system_30f", "Sleeping bag/quilt (30F) -- RECOMMENDED default", "must", "Value"),
    ("Overnight Pack", "sleeping_pad", "Sleeping pad, insulated R>=4", "must", "Value"),
    ("Overnight Pack", "pillow", "Pillow", "nice", "Value"),
    ("Overnight Pack", "groundsheet", "Tent footprint / groundsheet", "nice", "Value"),
    ("Overnight Pack", "stuff_dry_sacks", "Dry sack (sleep system)", "must", "Value"),
    ("Overnight Pack", "pack_liner", "Pack liner (waterproof)", "must", "Value"),
    ("Overnight Pack", "rain_jacket", "Rain jacket", "must", "Value"),
    ("Overnight Pack", "insulated_puffy_jacket", "Insulated puffy jacket", "must", "Value"),
    ("Overnight Pack", "fleece_midlayer", "Fleece / active midlayer", "must", "Value"),
    ("Overnight Pack", "base_layer", "Base layer top+bottom (doubles as sleep layer)", "must", "Value"),
    ("Overnight Pack", "stove", "Stove (his share of group stove)", "must", "Value"),
    ("Overnight Pack", "cook pot", "Cook pot (his share)", "must", "Value"),
    ("Overnight Pack", "fuel", "Fuel canister (his share)", "must", "Value"),
    ("Overnight Pack", "eating utensil/cup", "Spork / utensil", "must", "Value"),
    ("Overnight Pack", "water filter", "Water filter (his share)", "must", "Value"),
    ("Overnight Pack", "water bottles/bladders", "Water bottle", "must", "Value"),
    ("Overnight Pack", "food storage", "Bear-proof food storage (his share)", "must", "Value"),
    ("Overnight Pack", "first aid kit", "First aid kit (his share, overnight-size)", "must", "Value"),
    ("Overnight Pack", "satellite messenger", "Satellite messenger (his share)", "must", "Value"),
    ("Overnight Pack", "phone navigation app", "Offline navigation / maps", "must", "Budget"),
    ("Overnight Pack", "headlamp", "Headlamp", "must", "Value"),
    ("Overnight Pack", "power bank", "Power bank", "nice", "Value"),
    ("Overnight Pack", "knife/multitool", "Knife / multitool", "must", "Value"),
    ("Overnight Pack", "toiletries/trowel", "Trowel + hygiene kit", "must", "Value"),
    # Trail creek kit
    ("Trail Creek Kit", "gold_pan", "Gold pan", "must", "Value"),
    ("Trail Creek Kit", "insulated_waterproof_gloves", "Insulated waterproof panning gloves", "must", "Value"),
    ("Trail Creek Kit", "neoprene_socks_wading", "Neoprene wading socks", "must", "Value"),
    ("Trail Creek Kit", "snuffer_bottle", "Snuffer bottle", "must", "Value"),
    ("Trail Creek Kit", "vials", "Gold vials", "must", "Value"),
    ("Trail Creek Kit", "crevice_tools", "Crevice tools", "nice", "Value"),
    ("Trail Creek Kit", "magnifier_loupe", "Magnifier / loupe", "nice", "Value"),
    ("Trail Creek Kit", "small_trowel", "Small trowel (CNF-legal: hand pan + trowel only)", "must", "Value"),
    # Base camp personal (not carried on the overnight: classifier and waders stay at camp)
    ("Base Camp Personal", "classifier", "Classifier (base camp; share one on the trail)", "must", "Value"),
    ("Base Camp Personal", "knee_pads", "Knee pad", "nice", "Budget"),
    ("Base Camp Personal", "waders_vs_none", "Waders (Captain wants them; plan only needs shin-deep, but his call)", "nice", "Value"),
    ("Base Camp Personal", "camp_shoes", "Camp/creek shoes (evening, base camp)", "nice", "Value"),
    ("Base Camp Personal", "sit pad", "Sit pad", "nice", "Value"),
    ("Base Camp Personal", "trekking poles", "Trekking poles", "nice", "Value"),
]
KITS = ["Worn", "Overnight Pack", "Trail Creek Kit", "Base Camp Personal"]

# sanity check every category_key used in Picker exists in Options
missing = sorted({c for _, c, *_ in PICKER_ROWS} - set(cat_order))
if missing:
    raise SystemExit(f"Picker references categories missing from Options: {missing}")

# ----------------------------------------------------------------------------
# BASE CAMP GROUP LIST (Section A of research/gear.md, transcribed)
# ----------------------------------------------------------------------------
BASE_CAMP_GROUP = [
    ("Kitchen", "2-burner propane stove (Coleman Classic 2-Burner)", 1, 79.99),
    ("Kitchen", "Propane canisters, 16oz", 6, 36.00),
    ("Kitchen", "Cookware set (pots/pan/utensils)", 1, 40.00),
    ("Kitchen", "Coolers (food + drinks)", 2, 130.00),
    ("Kitchen", "Water jugs, 7-gal (Reliance Aqua-Tainer)", 2, 34.00),
    ("Kitchen", "Dish tub + biodegradable soap + scrubber", 1, 15.00),
    ("Kitchen", "Folding camp table", 1, 40.00),
    ("Shelter extras", "10x10 pop-up canopy", 1, 80.00),
    ("Shelter extras", "Extra tarp + paracord/stakes", 1, 40.00),
    ("Lighting", "Battery/rechargeable lanterns", 2, 47.00),
    ("Chairs", "Folding camp chairs (Ozark Trail)", 6, 54.00),
    ("Fire", "Firewood, lighters, matches (for the week)", 1, 50.00),
    ("Food storage", "Bear-aware truck storage: cargo net/bungee", 1, 15.00),
    ("First aid", "Group first aid kit, big (AMK Mountain Series Explorer)", 1, 76.00),
    ("Tools", "Hatchet, multi-tool, duct tape, spare paracord", 1, 55.00),
    ("Pan-out station", "Plastic tub/bus tray for concentrates", 1, 10.00),
    ("Pan-out station", "Classifiers (ASR Outdoor 1/4in)", 2, 58.00),
    ("Pan-out station", "Headlamp/clip lamp for the table", 1, 15.00),
    ("Pan-out station", "Snuffer bottles", 6, 24.00),
    ("Pan-out station", "Gold vials", 12, 18.00),
    ("Pan-out station", "Loupe/magnifier", 1, 8.00),
    ("Pan-out station", "Black-sand magnet wand", 1, 12.00),
    ("Vehicle", "Jump starter / tire inflator", 1, 65.00),
    ("Vehicle", "Tow strap", 1, 20.00),
]

# ----------------------------------------------------------------------------
# FRIENDS' LIST -- Section E CSV of research/gear.md (Captain's list; the
# budget_pick column is used as the friends'-list default pick/price)
# ----------------------------------------------------------------------------
FRIENDS_CSV = """kit,item,budget_pick,upgrade_pick,weight_oz,price_usd,priority,shared_split,notes
Worn,Hiking shoes,Budget trail shoe ~$35 EST,Merrell Moab 3 $60-85,0,35,must,no,Break in before trip
Worn,Hiking pants,Synthetic/nylon pants ~$25 EST,Quick-dry convertible ~$45 EST,0,25,must,no,No cotton
Worn,Wicking shirt,Synthetic tee ~$15 EST,Merino tee ~$35 EST,0,15,must,no,No cotton
Worn,Wool socks (3-pack),Budget wool-blend 3-pack ~$22 EST,3x Darn Tough Hiker $25.95 ea,0,22,must,no,1 worn/1 spare/1 sleep-only
Worn,Warm hat / blaze orange beanie,Mossy Oak Blaze Orange Beanie $4.97,Merino beanie ~$20 EST,0,4.97,must,no,Doubles as hunting-season orange
Overnight,Backpack 45-55L,Loowoko-style 50L ~$40 EST,Osprey Exos used ~$120 EST,32,40,must,no,
Overnight,Tent,Ozark Trail 2P Backpacking Tent ~$80 half share,REI Passage 2 $159 half share,60.8,40,must,split2,Confirm w/ tentmate
Overnight,Sleeping bag,30F synthetic (Marmot Trestles 30) ~$100,30F down quilt (EE Revelation 30) ~$365,52,100,must,no,Recommended default given warm/wet Oct outlook
Overnight,Sleeping pad insulated,Klymit Static V $49.95,Insulated Static V Peak $99.95,18.7,50,must,no,
Overnight,Pillow,Stuff-sack pillow ~$10 EST,Sea to Summit Aeros ~$35 EST,3,10,nice,no,
Overnight,Rain jacket,Frogg Toggs Ultra-Lite2 <$20,Frogg Toggs Xtreme Lite $60,5.5,20,must,no,
Overnight,Insulation layer,Ozark Trail fleece $12,Light synthetic puffy ~$60 EST,14,12,must,no,
Overnight,Base layer set,Budget synthetic/merino set ~$22 EST,Full merino set ~$70 EST,10,22,must,no,Doubles as sleep layer
Overnight,Stove,BRS-3000T $16 share,Soto WindMaster ~$65 EST share,0.15,2.67,must,split6,
Overnight,Pot,TOAKS 750ml Ti $33.95 share,Same,0.6,5.66,must,split6,
Overnight,Water filter,Sawyer Squeeze ~$30 share,Katadyn BeFree ~$45 EST share,0.5,5,must,split6,Reuse Smartwater bottles free
Overnight,Food/odor storage,Ursack Major ~$90 share,Ursack + OPSak ~$110 share,1.2,15,must,split6,
Overnight,First aid,AMK Ultralight .5 ~$25 EST share,AMK Mountain Series Explorer $70 share,0.67,4.17,must,split6,
Overnight,Satellite messenger,Rent inReach Mini 2 $100/week share,Buy inReach Mini 2 $299.99 share,0.6,16.67,must,split6,No cell signal in backcountry
Overnight,Offline maps,CalTopo free printed topo,Gaia GPS Premium ~$40/yr EST,1,0,must,no,
Overnight,Headlamp,Budget 300-lumen ~$15 EST,Petzl Actik Core ~$50 EST,3,15,must,no,
Overnight,Power bank,Small 5-10k mAh ~$20 EST,Nitecore NB10000 ~$45 EST,5,20,nice,no,
Overnight,Knife/multitool,Budget folding knife ~$20 EST,Leatherman Skeletool ~$90 EST,3,20,must,no,
Overnight,Emergency bundle (whistle/compass/blanket/repair),Bundle ~$15 EST,,6,15,must,no,
Overnight,Trowel,Off-brand trowel ~$8 EST,Deuce of Spades ~$20 EST,0.6,8,must,no,
Overnight,Hygiene (TP/wipes/sanitizer),Budget bundle ~$5 EST,,5,5,must,no,
Overnight,Blaze orange vest,Allen Company vest $8.50,,3,8.5,must,no,Required - deer season
Creek,Gold pan,ASR Outdoor 14in plastic $9.99,Garrett/Minelab pan ~$25 EST,14,9.99,must,no,
Creek,Classifier,ASR Outdoor 1/2in classifier ~$25-29 EST,Stackable classifier set ~$45 EST,16,28.99,must,no,
Creek,Insulated waterproof panning gloves,Insulated rubber-coated work glove ~$15 EST,NRS Maverick/Guide neoprene $65.99,6,15,must,no,50F water
Creek,Neoprene socks 3mm,3mm knee-high neoprene sock $30.59,Korkers/Simms 3.5mm $44.99,6,30.59,must,no,
Creek,Snuffer bottle,Generic snuffer bottle ~$4 EST,,1.5,4,must,no,
Creek,Gold vials x2,Plastic vials ~$1 ea $2 EST,,0.5,2,must,no,
Creek,Crevice tool,Hand crevice tool ~$10 EST,,4,10,must,no,
Creek,Foam knee pad,Foam kneeling pad ~$8 EST,,5,8,nice,no,
Creek,Wet-gear mesh bag,Mesh duffel ~$8 EST share,,1.3,1.33,nice,split6,
"""

# ============================================================================
# BUILD WORKBOOK
# ============================================================================
wb = Workbook()
wb.remove(wb.active)

# ----------------------------------------------------------------------------
# SHEET 1: Start Here
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Start Here")
set_print(ws)
ws.sheet_view.showGridLines = False
autofit(ws, {"A": 3, "B": 100})
ws["B2"] = "GA Gold Trip -- Gear Picker"
ws["B2"].font = TITLE_FONT
ws["B3"] = "Captain's personal gear plan -- Oct 15-21 2026, base camp at Vogel State Park + one backcountry overnight (hike 3-5 mi)"
ws["B3"].font = SUBTITLE_FONT

lines = [
    ("What this is", None),
    (None, "An interactive gear-selection spreadsheet built from tiered research (budget / value / premium) across "
           "three gear-research files, plus the base-camp group list and friends' one-page list from research\\gear.md. "
           "Every price, weight and community verdict traces back to a sourced pick in the Options sheet."),
    ("How to use it", None),
    (None, "1. Open the Picker sheet. For each row, set CHOICE to Budget / Value / Premium / Own / Skip."),
    (None, "2. 'Own' lets you type your own gear's weight in the 'Own it? weight oz' column (price counts as $0)."),
    (None, "3. The Selected item, weight, price, link and verdict columns recalculate live from your CHOICE."),
    (None, "4. Check the Dashboard for live totals, a red warning if any must-have is still set to Skip, and "
           "a preset table showing what the whole kit would weigh/cost if every row were the same tier."),
    (None, "5. Compare sheet has full budget/value/premium detail side by side per category if you want to dig in."),
    (None, "6. Base Camp (Group), Friends' List and Packing Checklist are separate, printable helper sheets."),
    ("Tier legend", None),
    (None, "BUDGET = cheap but decent. VALUE = 'wow, this bops for the price' -- the default pick for most rows. "
           "PREMIUM = what serious hikers aspire to, not luxury pricing."),
    ("Weight targets", None),
    (None, "Base weight (Overnight Pack + Trail Creek Kit, no food/water): target 15-18 lb. "
           "Total pack weight leaving the trailhead = base weight + food (3.0 lb) + water (2.2 lb)."),
    ("Sleep system note (added 2026-09-21)", None),
    (None, "Vogel SP Oct 15-21 lows, 2020-2025, averaged 39-48F; the coldest single night was 29F (Oct 2022). "
           "NOAA's Oct-Dec 2026 outlook favors a warmer, wetter season (strong El Nino). A 30F-rated bag/quilt "
           "plus a puffy and base layer covers this comfortably for most people, and rain protection matters more "
           "than an extra 10F of bag rating this year. The 30F group is the RECOMMENDED DEFAULT on the Picker; "
           "the existing 20F group is kept as an 'alt' row (backup / more cold margin) rather than deleted."),
    ("Tier oddities", None),
    (None, "Where a Value pick is priced above its Premium counterpart (or Budget above Value) in the source research, "
           "it is kept exactly as sourced and flagged with a 'TIER ODDITY' note in that item's Notes column on "
           "Options/Picker/Compare -- never silently re-tiered."),
    ("Sources & date", None),
    (None, "Built 2026-09-21 from research\\gear-tiers-*.json, research\\gear.md, and a short web check for the "
           "new 30F sleep-system picks (REI, Enlightened Equipment, Katabatic Gear). Prices/weights are as sourced "
           "on that date -- re-verify before buying, especially anything cottage-made (lead times) or on sale."),
]
r = 5
for head, body in lines:
    if head:
        ws.cell(row=r, column=2, value=head).font = Font(name=FONT_NAME, size=13, bold=True, color="2F5233")
        r += 1
    if body:
        c = ws.cell(row=r, column=2, value=body)
        c.font = Font(name=FONT_NAME, size=10.5)
        c.alignment = WRAP
        ws.row_dimensions[r].height = 30
        r += 1
r += 1
ws.cell(row=r, column=2, value="Tier color key:").font = Font(bold=True)
r += 1
for tier, (bg, fg) in list(TIER_COLORS.items())[:3]:
    cell = ws.cell(row=r, column=2, value=tier)
    cell.fill = PatternFill("solid", fgColor=bg)
    cell.font = Font(bold=True, color=fg)
    cell.border = BORDER
    r += 1

# ----------------------------------------------------------------------------
# SHEET 5: Options (build before Picker so Picker formulas can reference it)
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Options")
headers = ["Category", "Role", "Tier", "Brand", "Model", "Weight oz", "Weight note",
           "Price $", "Price URL", "Used price range", "Where to buy", "Community verdict",
           "Verdict sources", "Pros", "Cons", "Oct GA fit", "Beginner score (1-5)",
           "Shared split (ways)", "Notes", "_key"]
for i, h in enumerate(headers, start=1):
    ws.cell(row=1, column=i, value=h)
style_header_row(ws, 1, len(headers))

for i, o in enumerate(OPTIONS, start=2):
    ws.cell(row=i, column=1, value=o["category"])
    ws.cell(row=i, column=2, value=o["role"])
    tcell = ws.cell(row=i, column=3, value=o["tier"])
    ws.cell(row=i, column=4, value=o["brand"])
    ws.cell(row=i, column=5, value=o["model"])
    ws.cell(row=i, column=6, value=o["weight_oz"]).number_format = '0.0" oz"'
    ws.cell(row=i, column=7, value=o["weight_note"])
    ws.cell(row=i, column=8, value=o["price_usd"]).number_format = '"$"#,##0.00'
    lcell = ws.cell(row=i, column=9, value=o["price_url"])
    if o["price_url"]:
        lcell.hyperlink = o["price_url"]
        lcell.font = Font(color="1155CC", underline="single")
    ws.cell(row=i, column=10, value=o["used_price_range"])
    ws.cell(row=i, column=11, value=o["where_to_buy"])
    ws.cell(row=i, column=12, value=o["community_verdict"])
    ws.cell(row=i, column=13, value=o["verdict_sources"])
    ws.cell(row=i, column=14, value=o["pros"])
    ws.cell(row=i, column=15, value=o["cons"])
    ws.cell(row=i, column=16, value=o["oct_ga_fit"])
    ws.cell(row=i, column=17, value=o["beginner_score"])
    ws.cell(row=i, column=18, value=o["shared_split"])
    ws.cell(row=i, column=19, value=o["notes"])
    ws.cell(row=i, column=20, value=f'={get_column_letter(1)}{i}&"|"&{get_column_letter(3)}{i}')
    for c in range(1, 20):
        ws.cell(row=i, column=c).alignment = WRAP if c in (2, 7, 10, 11, 12, 13, 14, 15, 16, 19) else Alignment(vertical="top")

for tier, (bg, fg) in TIER_COLORS.items():
    if tier in ("Budget", "Value", "Premium"):
        ws.conditional_formatting.add(
            f"C2:C{OPT_LAST}",
            FormulaRule(formula=[f'$C2="{tier}"'], fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)),
        )

autofit(ws, {"A": 20, "B": 26, "C": 10, "D": 16, "E": 26, "F": 11, "G": 30, "H": 10,
              "I": 24, "J": 20, "K": 20, "L": 40, "M": 24, "N": 30, "O": 30, "P": 30,
              "Q": 10, "R": 10, "S": 30, "T": 12})
ws.freeze_panes = "B2"
ws.auto_filter.ref = f"A1:S{OPT_LAST}"
set_print(ws)
OPT = "Options"  # sheet name shortcut

# ----------------------------------------------------------------------------
# SHEET 2: Picker
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Picker")
headers = ["Kit", "Category", "_key", "Required?", "CHOICE", "_match", "Selected item",
           "My share weight (oz)", "My share price ($)", "Own it? weight (oz)", "Link",
           "Quick verdict", "Notes",
           "_bw", "_bp", "_vw", "_vp", "_pw", "_pp"]
for i, h in enumerate(headers, start=1):
    ws.cell(row=1, column=i, value=h)
style_header_row(ws, 1, len(headers))

dv_choice = DataValidation(type="list", formula1='"Budget,Value,Premium,Own,Skip"', allow_blank=True)
ws.add_data_validation(dv_choice)

first_row = 2
row = first_row
kit_ranges = {}  # kit -> (start,end)
for kit, catkey, label, req, default in PICKER_ROWS:
    kit_ranges.setdefault(kit, [row, row])[1] = row
    ws.cell(row=row, column=1, value=kit)
    ws.cell(row=row, column=2, value=label)
    ws.cell(row=row, column=3, value=catkey)
    ws.cell(row=row, column=4, value=req)
    ch = ws.cell(row=row, column=5, value=default)
    dv_choice.add(ch.coordinate)

    m = get_column_letter(6) + str(row)
    ws.cell(row=row, column=6,
            value=f'=IFERROR(MATCH($C{row}&"|"&$E{row},{OPT}!$T$2:$T${OPT_RANGE_END},0),"")')

    ws.cell(row=row, column=7,
            value=(f'=IF(OR($E{row}="Skip",$E{row}=""),"(skipped)",'
                    f'IF($E{row}="Own","(own gear)",'
                    f'IFERROR(INDEX({OPT}!$D$2:$D${OPT_RANGE_END},$F{row})&" -- "&INDEX({OPT}!$E$2:$E${OPT_RANGE_END},$F{row}),"?")))'))

    ws.cell(row=row, column=8,
            value=(f'=IF($E{row}="Own",N($J{row}),IF(OR($E{row}="Skip",$E{row}=""),0,'
                    f'IFERROR(INDEX({OPT}!$F$2:$F${OPT_RANGE_END},$F{row})/INDEX({OPT}!$R$2:$R${OPT_RANGE_END},$F{row}),0)))')
            ).number_format = '0.00'

    ws.cell(row=row, column=9,
            value=(f'=IF($E{row}="Own",0,IF(OR($E{row}="Skip",$E{row}=""),0,'
                    f'IFERROR(INDEX({OPT}!$H$2:$H${OPT_RANGE_END},$F{row})/INDEX({OPT}!$R$2:$R${OPT_RANGE_END},$F{row}),0)))')
            ).number_format = '"$"#,##0.00'

    ws.cell(row=row, column=10, value=None).number_format = '0.00'

    ws.cell(row=row, column=11,
            value=(f'=IF(OR($E{row}="Skip",$E{row}="Own",$E{row}=""),"",'
                    f'IFERROR(HYPERLINK(INDEX({OPT}!$I$2:$I${OPT_RANGE_END},$F{row}),"buy link"),""))'))

    ws.cell(row=row, column=12,
            value=(f'=IF(OR($E{row}="Skip",$E{row}="Own",$E{row}=""),"",'
                    f'IFERROR(LEFT(INDEX({OPT}!$L$2:$L${OPT_RANGE_END},$F{row}),140),""))'))

    ws.cell(row=row, column=13,
            value=(f'=IF(OR($E{row}="Skip",$E{row}="Own",$E{row}=""),"",'
                    f'IFERROR(INDEX({OPT}!$S$2:$S${OPT_RANGE_END},$F{row}),""))'))

    # hidden preset-comparison helper columns: skip the 20F alt row so the
    # "every item at tier X" preset reflects the recommended 30F default,
    # not both sleeping bags at once.
    if catkey == "sleep_system":
        for col in (14, 15, 16, 17, 18, 19):
            ws.cell(row=row, column=col, value=0)
    else:
        for col, tier, field in ((14, "Budget", "F"), (15, "Budget", "H"),
                                   (16, "Value", "F"), (17, "Value", "H"),
                                   (18, "Premium", "F"), (19, "Premium", "H")):
            ws.cell(row=row, column=col,
                    value=(f'=IFERROR(INDEX({OPT}!${field}$2:${field}${OPT_RANGE_END},'
                            f'MATCH($C{row}&"|{tier}",{OPT}!$T$2:$T${OPT_RANGE_END},0))/'
                            f'INDEX({OPT}!$R$2:$R${OPT_RANGE_END},'
                            f'MATCH($C{row}&"|{tier}",{OPT}!$T$2:$T${OPT_RANGE_END},0)),0)'))

    for c in range(1, 14):
        ws.cell(row=row, column=c).border = BORDER
        if c in (7, 12, 13):
            ws.cell(row=row, column=c).alignment = WRAP
    row += 1

last_data_row = row - 1

# kit subtotal + grand total rows
sub_rows = {}
for kit in KITS:
    s, e = kit_ranges[kit]
    ws.cell(row=row, column=1, value=f"{kit} subtotal").font = TOTAL_FONT
    ws.cell(row=row, column=1).fill = TOTAL_FILL
    ws.cell(row=row, column=8, value=f"=SUM(H{s}:H{e})").number_format = '0.0'
    ws.cell(row=row, column=9, value=f"=SUM(I{s}:I{e})").number_format = '"$"#,##0.00'
    for c in range(1, 14):
        ws.cell(row=row, column=c).fill = TOTAL_FILL
        ws.cell(row=row, column=c).font = TOTAL_FONT
    sub_rows[kit] = row
    row += 1

grand_row = row
ws.cell(row=row, column=1, value="GRAND TOTAL (his gear, all kits)").font = TOTAL_FONT
ws.cell(row=row, column=8, value=f"=SUM(H{first_row}:H{last_data_row})").number_format = '0.0'
ws.cell(row=row, column=9, value=f"=SUM(I{first_row}:I{last_data_row})").number_format = '"$"#,##0.00'
for c in range(1, 14):
    ws.cell(row=row, column=c).fill = HEADER_FILL
    ws.cell(row=row, column=c).font = HEADER_FONT

for tier, (bg, fg) in TIER_COLORS.items():
    ws.conditional_formatting.add(
        f"E{first_row}:E{last_data_row}",
        FormulaRule(formula=[f'$E{first_row}="{tier}"'], fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)),
    )
# shade kit blocks
for kit in KITS:
    s, e = kit_ranges[kit]
    ws.conditional_formatting.add(f"A{s}:A{e}", FormulaRule(formula=[f'$A{s}=$A{s}'], fill=KIT_FILL, font=KIT_FONT))

autofit(ws, {"A": 16, "B": 42, "C": 1, "D": 9, "E": 10, "F": 1, "G": 38, "H": 11,
              "I": 11, "J": 12, "K": 9, "L": 46, "M": 40, "N": 1, "O": 1, "P": 1, "Q": 1, "R": 1, "S": 1})
ws.column_dimensions["C"].hidden = True
ws.column_dimensions["F"].hidden = True
for col in ("N", "O", "P", "Q", "R", "S"):
    ws.column_dimensions[col].hidden = True
ws.freeze_panes = "D2"
set_print(ws)
PICK = "Picker"

# ----------------------------------------------------------------------------
# SHEET 3: Dashboard
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Dashboard")
set_print(ws)
ws.sheet_view.showGridLines = False
ws["B2"] = "Dashboard -- live totals"
ws["B2"].font = TITLE_FONT
ws["B3"] = "Recalculates from the Picker sheet the moment you change a CHOICE."
ws["B3"].font = SUBTITLE_FONT

o_s, o_e = kit_ranges["Overnight Pack"]
c_s, c_e = kit_ranges["Trail Creek Kit"]
w_s, w_e = kit_ranges["Worn"]
b_s, b_e = kit_ranges["Base Camp Personal"]


def card(ws, row, col, label, formula, numfmt=None, fill=CARD_FILL):
    cell_label = ws.cell(row=row, column=col, value=label)
    cell_label.font = Font(name=FONT_NAME, size=10, bold=True, color="555555")
    cell_val = ws.cell(row=row + 1, column=col, value=formula)
    cell_val.font = Font(name=FONT_NAME, size=18, bold=True, color="2F5233")
    if numfmt:
        cell_val.number_format = numfmt
    for rr in (row, row + 1):
        cc = ws.cell(row=rr, column=col)
        cc.fill = fill
        cc.border = BORDER
        cc.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[row].height = 16
    ws.row_dimensions[row + 1].height = 26


BASE_WEIGHT_OZ = f"(SUM({PICK}!H{o_s}:H{o_e})+SUM({PICK}!H{c_s}:H{c_e}))"
WORN_WEIGHT_OZ = f"SUM({PICK}!H{w_s}:H{w_e})"
TOTAL_COST = f"SUM({PICK}!I{first_row}:I{last_data_row})"
FOOD_OZ, WATER_OZ = 48, 35.2

card(ws, 5, 2, "Worn weight", f"={WORN_WEIGHT_OZ}/16", '0.00" lb"')
card(ws, 5, 3, "Base weight (pack+creek, no food/water)", f"={BASE_WEIGHT_OZ}/16", '0.00" lb"')
card(ws, 5, 4, "Total pack weight leaving trailhead", f"=({BASE_WEIGHT_OZ}+{FOOD_OZ}+{WATER_OZ})/16", '0.00" lb"')
card(ws, 5, 5, "Total cost (all his gear)", f"={TOTAL_COST}", '"$"#,##0.00')
ws.cell(row=8, column=2, value=(f"Total pack weight leaving trailhead, oz: "
                                  f'=(' + BASE_WEIGHT_OZ + f"+{FOOD_OZ}+{WATER_OZ})"))
ws.cell(row=8, column=2, value=f'=TEXT(INT(({BASE_WEIGHT_OZ}+{FOOD_OZ}+{WATER_OZ})/16),"0")&" lb "&TEXT(MOD({BASE_WEIGHT_OZ}+{FOOD_OZ}+{WATER_OZ},16),"0.0")&" oz  (includes food 3.0 lb + water 2.2 lb)"')
ws.cell(row=8, column=2).font = Font(italic=True, size=9, color="666666")
ws.merge_cells("B8:E8")

ws.cell(row=10, column=2, value="Cost by kit").font = Font(bold=True, size=12)
row = 11
ws.cell(row=row, column=2, value="Kit").font = HEADER_FONT
ws.cell(row=row, column=3, value="Weight (lb)").font = HEADER_FONT
ws.cell(row=row, column=4, value="Cost ($)").font = HEADER_FONT
for cc in range(2, 5):
    ws.cell(row=row, column=cc).fill = HEADER_FILL
kit_table_row0 = row + 1
for i, kit in enumerate(KITS):
    r = kit_table_row0 + i
    ws.cell(row=r, column=2, value=kit)
    ws.cell(row=r, column=3, value=f"={PICK}!H{sub_rows[kit]}/16").number_format = "0.00"
    ws.cell(row=r, column=4, value=f"={PICK}!I{sub_rows[kit]}").number_format = '"$"#,##0.00'
kit_table_last = kit_table_row0 + len(KITS) - 1

ws.cell(row=kit_table_last + 2, column=2, value="Must-haves still set to Skip:").font = Font(bold=True)
warn_cell = ws.cell(row=kit_table_last + 2, column=4,
                     value=f'=COUNTIFS({PICK}!D{first_row}:D{last_data_row},"must",{PICK}!E{first_row}:E{last_data_row},"Skip")')
warn_cell.font = Font(bold=True, size=13)
ws.conditional_formatting.add(warn_cell.coordinate,
    FormulaRule(formula=[f'{warn_cell.coordinate}>0'], fill=WARN_FILL, font=Font(bold=True, color="990000")))
ws.conditional_formatting.add(warn_cell.coordinate,
    FormulaRule(formula=[f'{warn_cell.coordinate}=0'], fill=OK_FILL, font=Font(bold=True, color="006100")))

# preset comparison table: every item at Budget / Value / Premium
preset_row0 = kit_table_last + 5
ws.cell(row=preset_row0 - 1, column=2, value="Preset comparison -- if EVERY item were the same tier").font = Font(bold=True, size=12)
ws.cell(row=preset_row0, column=2, value="Tier").font = HEADER_FONT
ws.cell(row=preset_row0, column=3, value="Base weight (lb)").font = HEADER_FONT
ws.cell(row=preset_row0, column=4, value="Total cost ($, worn+overnight+creek+basecamp)").font = HEADER_FONT
for cc in range(2, 5):
    ws.cell(row=preset_row0, column=cc).fill = HEADER_FILL
presets = [("Budget", "N", "O"), ("Value", "P", "Q"), ("Premium", "R", "S")]
for i, (tier, wcol, pcol) in enumerate(presets):
    r = preset_row0 + 1 + i
    ws.cell(row=r, column=2, value=tier)
    ws.cell(row=r, column=3, value=f"=(SUM({PICK}!{wcol}{o_s}:{wcol}{o_e})+SUM({PICK}!{wcol}{c_s}:{wcol}{c_e}))/16").number_format = "0.00"
    ws.cell(row=r, column=4, value=f"=SUM({PICK}!{pcol}{first_row}:{pcol}{last_data_row})").number_format = '"$"#,##0.00'
    bg, fg = TIER_COLORS[tier]
    ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=bg)
    ws.cell(row=r, column=2).font = Font(bold=True, color=fg)
preset_last = preset_row0 + len(presets)
ws.cell(row=preset_last + 1, column=2,
        value="Note: the 20F 'alt' sleep-system row is excluded from this preset so it reflects the recommended 30F default, not both bags at once.").font = Font(italic=True, size=9, color="666666")
ws.merge_cells(f"B{preset_last+1}:E{preset_last+1}")

# ---- charts ----
chart1 = BarChart()
chart1.title = "Pack weight by kit (lb)"
chart1.y_axis.title = "lb"
chart1.style = 10
data = Reference(ws, min_col=3, min_row=kit_table_row0 - 1, max_row=kit_table_last)
cats = Reference(ws, min_col=2, min_row=kit_table_row0, max_row=kit_table_last)
chart1.add_data(data, titles_from_data=True)
chart1.set_categories(cats)
chart1.width, chart1.height = 14, 8
ws.add_chart(chart1, f"G5")

chart2 = BarChart()
chart2.title = "Cost by kit ($)"
chart2.y_axis.title = "$"
chart2.style = 11
data2 = Reference(ws, min_col=4, min_row=kit_table_row0 - 1, max_row=kit_table_last)
chart2.add_data(data2, titles_from_data=True)
chart2.set_categories(cats)
chart2.width, chart2.height = 14, 8
ws.add_chart(chart2, f"G22")

autofit(ws, {"A": 2, "B": 34, "C": 24, "D": 26, "E": 20})
set_print(ws)

# ----------------------------------------------------------------------------
# SHEET 4: Compare
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Compare")
fields = [("Model", "model"), ("Weight (oz)", "weight_oz"), ("Price ($)", "price_usd"),
          ("Used price", "used_price_range"), ("Beginner score", "beginner_score"),
          ("Oct GA fit", "oct_ga_fit"), ("Community verdict", "community_verdict"),
          ("Pros", "pros"), ("Cons", "cons")]
header1 = ["Category", "Role"]
header2 = ["", ""]
for tier in ("Budget", "Value", "Premium"):
    for label, _ in fields:
        header1.append(tier)
        header2.append(label)
for i, (h1, h2) in enumerate(zip(header1, header2), start=1):
    ws.cell(row=1, column=i, value=h1)
    ws.cell(row=2, column=i, value=h2)
style_header_row(ws, 1, len(header1), height=18)
style_header_row(ws, 2, len(header2), height=26)

row = 3
for cat in cat_order:
    tiers = by_cat[cat]
    role = next(iter(tiers.values()))["role"]
    ws.cell(row=row, column=1, value=cat).font = Font(bold=True)
    ws.cell(row=row, column=2, value=role)
    col = 3
    for tier in ("Budget", "Value", "Premium"):
        item = tiers.get(tier)
        for label, key in fields:
            val = item[key] if item else ""
            cc = ws.cell(row=row, column=col, value=val)
            if key == "price_usd" and item:
                cc.number_format = '"$"#,##0.00'
            if key == "weight_oz" and item:
                cc.number_format = '0.0'
            cc.alignment = WRAP
            if item:
                bg, fg = TIER_COLORS[tier]
                if key in ("model",):
                    cc.font = Font(bold=True, color=fg)
            col += 1
    ws.row_dimensions[row].height = 75
    for c in range(1, col):
        ws.cell(row=row, column=c).border = BORDER
    row += 1
last_compare_row = row - 1

widths = {"A": 18, "B": 24}
col = 3
for _ in range(3):
    for label, key in fields:
        letter = get_column_letter(col)
        widths[letter] = 30 if key in ("community_verdict", "pros", "cons", "oct_ga_fit") else (14 if key != "model" else 20)
        col += 1
autofit(ws, widths)
ws.freeze_panes = "C3"
ws.auto_filter.ref = f"A2:{get_column_letter(col-1)}2"
set_print(ws)

# ----------------------------------------------------------------------------
# SHEET 6: Base Camp (Group)
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Base Camp (Group)")
headers = ["Category", "Item", "Qty", "Est. cost ($)", "Who brings", "Packed"]
for i, h in enumerate(headers, start=1):
    ws.cell(row=1, column=i, value=h)
style_header_row(ws, 1, len(headers))
dv_pack = DataValidation(type="list", formula1='"\u2610,\u2611"', allow_blank=True)
ws.add_data_validation(dv_pack)
row = 2
for cat, item, qty, cost in BASE_CAMP_GROUP:
    ws.cell(row=row, column=1, value=cat)
    ws.cell(row=row, column=2, value=item)
    ws.cell(row=row, column=3, value=qty)
    ws.cell(row=row, column=4, value=cost).number_format = '"$"#,##0.00'
    ws.cell(row=row, column=5, value="")
    p = ws.cell(row=row, column=6, value="\u2610")
    dv_pack.add(p.coordinate)
    for c in range(1, 7):
        ws.cell(row=row, column=c).border = BORDER
    row += 1
ws.cell(row=row, column=2, value="TOTAL").font = TOTAL_FONT
ws.cell(row=row, column=4, value=f"=SUM(D2:D{row-1})").number_format = '"$"#,##0.00'
ws.cell(row=row, column=4).font = TOTAL_FONT
for c in range(1, 7):
    ws.cell(row=row, column=c).fill = TOTAL_FILL
ws.cell(row=row + 2, column=2,
        value="Rough total ~$800-870, or ~$135-145/person split 6 ways. Personal-only rows (chairs, vials, snuffers) are cheap enough to just buy 6 outright.").font = Font(italic=True, size=9)
ws.merge_cells(f"B{row+2}:F{row+2}")
autofit(ws, {"A": 16, "B": 44, "C": 8, "D": 12, "E": 16, "F": 9})
ws.freeze_panes = "A2"
set_print(ws)

# ----------------------------------------------------------------------------
# SHEET 7: Friends' List
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Friends' List")
ws["A1"] = "GA Gold Trip -- Bring This (personal gear, one page per friend)"
ws["A1"].font = Font(name=FONT_NAME, size=14, bold=True, color="2F5233")
ws.merge_cells("A1:F1")
ws["A2"] = "Budget pick shown by default -- upgrade if you already own better. No cotton, anywhere, ever."
ws["A2"].font = Font(italic=True, size=10)
ws.merge_cells("A2:F2")

headers = ["Kit", "Item", "Budget pick & price", "Upgrade pick", "Priority", "Notes"]
hrow = 4
for i, h in enumerate(headers, start=1):
    ws.cell(row=hrow, column=i, value=h)
style_header_row(ws, hrow, len(headers))
reader = csv.DictReader(io.StringIO(FRIENDS_CSV))
row = hrow + 1
for rec in reader:
    ws.cell(row=row, column=1, value=rec["kit"])
    ws.cell(row=row, column=2, value=rec["item"])
    ws.cell(row=row, column=3, value=rec["budget_pick"])
    ws.cell(row=row, column=4, value=rec["upgrade_pick"])
    ws.cell(row=row, column=5, value=rec["priority"])
    ws.cell(row=row, column=6, value=rec["notes"])
    for c in range(1, 7):
        ws.cell(row=row, column=c).alignment = WRAP
        ws.cell(row=row, column=c).border = BORDER
    if rec["kit"] != reader.line_num and False:
        pass
    ws.row_dimensions[row].height = 26
    row += 1
autofit(ws, {"A": 12, "B": 34, "C": 34, "D": 30, "E": 9, "F": 32})
ws.freeze_panes = f"A{hrow+1}"
ws.auto_filter.ref = f"A{hrow}:F{row-1}"
set_print(ws)

# ----------------------------------------------------------------------------
# SHEET 8: Packing Checklist (formula-driven from Picker)
# ----------------------------------------------------------------------------
ws = wb.create_sheet("Packing Checklist")
headers = ["Kit", "Category", "Selected item (live from Picker)", "Packed"]
for i, h in enumerate(headers, start=1):
    ws.cell(row=1, column=i, value=h)
style_header_row(ws, 1, len(headers))
dv_pack2 = DataValidation(type="list", formula1='"\u2610,\u2611"', allow_blank=True)
ws.add_data_validation(dv_pack2)
for i, (kit, catkey, label, req, default) in enumerate(PICKER_ROWS, start=0):
    r = 2 + i
    picker_row = first_row + i
    ws.cell(row=r, column=1, value=f"={PICK}!A{picker_row}")
    ws.cell(row=r, column=2, value=f"={PICK}!B{picker_row}")
    ws.cell(row=r, column=3, value=f"={PICK}!G{picker_row}")
    p = ws.cell(row=r, column=4, value="\u2610")
    dv_pack2.add(p.coordinate)
    for c in range(1, 5):
        ws.cell(row=r, column=c).border = BORDER
        ws.cell(row=r, column=c).alignment = WRAP
autofit(ws, {"A": 16, "B": 42, "C": 42, "D": 9})
ws.freeze_panes = "A2"
set_print(ws)
for kit in KITS:
    s, e = kit_ranges[kit]
    off = 2 + (s - first_row)
    off_e = 2 + (e - first_row)
    ws.conditional_formatting.add(f"A{off}:A{off_e}", FormulaRule(formula=[f'$A{off}=$A{off}'], fill=KIT_FILL))

# order sheets
order = ["Start Here", "Picker", "Dashboard", "Compare", "Options",
         "Base Camp (Group)", "Friends' List", "Packing Checklist"]
wb._sheets = [wb[s] for s in order]
wb.active = 0

wb.save(OUT_XLSX)
print(f"Saved {OUT_XLSX}")
DOWNLOADS.parent.mkdir(parents=True, exist_ok=True)
shutil.copy(OUT_XLSX, DOWNLOADS)
print(f"Copied to {DOWNLOADS}")

# ============================================================================
# quick python-side numbers for cross-check (see verify_gear_picker step)
# ============================================================================
if __name__ == "__main__":
    def scenario_total(tier_override=None):
        w = p = 0.0
        for kit, catkey, label, req, default in PICKER_ROWS:
            choice = tier_override or default
            if catkey == "sleep_system" and tier_override:
                continue  # excluded from "every item" presets, same as the sheet
            if choice == "Skip":
                continue
            if choice == "Own":
                continue
            item = by_cat[catkey].get(choice)
            if not item:
                continue
            if kit in ("Overnight Pack", "Trail Creek Kit"):
                w += item["weight_oz"] / item["shared_split"]
            p += item["price_usd"] / item["shared_split"]
        return w, p

    for label, override in [("DEFAULT (as set per-row, mostly Value)", None),
                              ("ALL BUDGET", "Budget"), ("ALL VALUE", "Value"), ("ALL PREMIUM", "Premium")]:
        w, p = scenario_total(override)
        base_lb = w / 16
        total_lb = (w + 48 + 35.2) / 16
        print(f"{label}: base weight {base_lb:.2f} lb, total pack weight {total_lb:.2f} lb, cost ${p:,.2f}")
