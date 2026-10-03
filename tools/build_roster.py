"""
Builds ROSTER.md (and roster/roster.json) from the per-person buy-list exports
saved in roster/person-<n>-<name>.txt.

Each of those files is the raw text produced by the "Copy list" / "Download"
button on the Buy tab of index.html (see build_hub.py buildExportText()), so
the parser here only has to understand that one format:

    <label>: <chosen product> - $<price> [ (your share $<share>, /<split>) ] [STATUS]
    <extras item>: $<line total> [ (your share $<share>, /<split>) ] [STATUS]

STATUS is one of OWN, SKIP, GOT IT, to buy.

What the build produces:
  * group coverage  -- for every shared / base-camp / group item, who already
    has one, how many units the plan needs, and how many are still missing;
  * per-person gaps -- the personal items each person has not got yet, with
    the cost of closing the gap;
  * a remaining group buy list -- only the group items nobody has, costed and
    re-split at the REAL headcount instead of the /6 baked into the picker.

Run: python tools/build_roster.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER_DIR = ROOT / "roster"
OUT_MD = ROOT / "ROSTER.md"
OUT_JSON = ROSTER_DIR / "roster.json"

# Person number -> display name. Person 1 is Jordan. Numbers are the
# ordering Jordan gave; the file for person N must be named
# roster/person-N-<name>.txt.
PEOPLE = {
    1: "Jordan",
    2: "Nik",
    3: "Nathan",
    4: "Hilton",
    5: "Jarred",
}

# Headcount the picker's shared-cost splits were built against (every "/6" in
# the export). The real trip headcount is len(PEOPLE); where the two differ
# the report says so and re-splits the remaining group cost at the real count.
PLAN_SPLIT_BASIS = 6

SECTION_ORDER = [
    "Base camp (Vogel car camp)",
    "Overnight / backcountry: personal",
    "Overnight / backcountry: shared",
    "Panning gear",
    "Consumables",
    "Food",
]
# Sections whose items are shared by default even when a person's line has no
# "(your share ...)" suffix (an Own/Skip pick drops that suffix).
ALWAYS_SHARED_SECTIONS = {"Overnight / backcountry: shared"}

STATUS_RE = re.compile(r"\s*\[(OWN|SKIP|GOT IT|to buy)\]\s*$")
SHARE_RE = re.compile(r"\s*\(your share \$([\d,]+\.\d\d), /(\d+)\)\s*$")
PICK_RE = re.compile(r"^(?P<label>.+): (?P<name>.+) - \$(?P<price>[\d,]+\.\d\d)$")
EXTRA_RE = re.compile(r"^(?P<label>.+): \$(?P<price>[\d,]+\.\d\d)$")
HEADER_RE = re.compile(r"^== (?P<title>.+) ==$")

HAVE = {"OWN", "GOT IT"}

# One owned product that covers more than one unit of a shared item, keyed
# (person number, label): Jordan's 4-pack of compasses covers both /3 units.
UNIT_COUNTS = {(1, "Suunto A-10 baseplate compass"): 2}

# The sleep bag/pad rows carry the chosen tier in their label ("Sleep bag (30F,
# budget)" vs "Sleep bag (30F, solid)"), which would otherwise make two people
# who picked different tiers look like they are shopping for different items.
SLEEP_LABEL_RE = re.compile(r"^(Sleep (?:bag|pad)) \((\d+F), (?:budget|solid)\)$")


# Rows renamed in the picker since some exports were taken: old label -> new.
RENAMED = {"Cathole trowel (shared, split 6)": "Cathole trowel (shared)"}


def normalise_label(label):
    label = RENAMED.get(label, label)
    m = SLEEP_LABEL_RE.match(label)
    if m:
        return "{} ({})".format(m.group(1), m.group(2))
    return label


def money(x):
    return "${:,.2f}".format(x)


def parse_export(path):
    """One export file -> {'sections': {title: [row, ...]}, 'totals': {...}}."""
    sections = {}
    totals = {}
    section = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        h = HEADER_RE.match(line)
        if h:
            section = h.group("title")
            if section != "Totals":
                sections.setdefault(section, [])
            continue
        if section is None:
            continue  # the "GA Gold Trip -- My Buy List" banner
        if section == "Totals":
            if ":" in line:
                k, v = line.split(":", 1)
                totals[k.strip()] = float(v.strip().lstrip("$").replace(",", ""))
            continue
        m = STATUS_RE.search(line)
        if not m:
            continue  # the per-section total line has no [STATUS]
        status = m.group(1)
        body = STATUS_RE.sub("", line)

        split = 1
        share = None
        s = SHARE_RE.search(body)
        if s:
            share = float(s.group(1).replace(",", ""))
            split = int(s.group(2))
            body = SHARE_RE.sub("", body)

        pm = PICK_RE.match(body)
        if pm:
            label = normalise_label(pm.group("label").strip())
            name = pm.group("name").strip()
            price = float(pm.group("price").replace(",", ""))
        else:
            em = EXTRA_RE.match(body)
            if not em:
                raise ValueError("unparsed line in {}: {!r}".format(path.name, line))
            label = normalise_label(em.group("label").strip())
            name = ""
            price = float(em.group("price").replace(",", ""))

        sections[section].append({
            "label": label,
            "product": name,
            "price": price,
            "split": split,
            "share": share if share is not None else price,
            "status": status,
        })
    return {"sections": sections, "totals": totals}


def load_people():
    """Returns {n: {'name':..., 'file':..., 'data': parsed or None}}."""
    out = {}
    for n, name in sorted(PEOPLE.items()):
        matches = sorted(ROSTER_DIR.glob("person-{}-*.txt".format(n)))
        data = parse_export(matches[0]) if matches else None
        out[n] = {
            "name": name,
            "file": matches[0].name if matches else None,
            "data": data,
        }
    return out


def build_catalog(people):
    """Union of every item seen across the submitted exports, keyed
    (section, label), with whether it is shared and at what split."""
    catalog = {}
    for n, p in people.items():
        if not p["data"]:
            continue
        for section, rows in p["data"]["sections"].items():
            for row in rows:
                key = (section, row["label"])
                entry = catalog.setdefault(key, {
                    "section": section,
                    "label": row["label"],
                    "shared": section in ALWAYS_SHARED_SECTIONS,
                    "split": 1,
                    "price": 0.0,
                    "products": {},
                })
                if row["split"] > 1:
                    entry["shared"] = True
                    entry["split"] = max(entry["split"], row["split"])
                # Best known full price: ignore the $0 an Own/Skip pick shows.
                if row["price"] > entry["price"]:
                    entry["price"] = row["price"]
                if row["product"] and row["product"] not in ("(own it)", "(skipped)"):
                    entry["products"][n] = row["product"]
    return catalog


def units_needed(entry):
    """How many of a shared item the plan wants. A /6 split means one unit for
    the whole group; a /3 split means the cost of one unit is carried by three
    people, i.e. two units for a six-person group."""
    if not entry["shared"]:
        return None
    if entry["split"] <= 1:
        # Shared by section, but no export ever showed a "/N" for it (everyone
        # who has one picked Own, which drops the share suffix). One unit.
        return 1
    return max(1, round(PLAN_SPLIT_BASIS / entry["split"]))


def status_of(people, n, section, label):
    p = people[n]
    if not p["data"]:
        return None
    for row in p["data"]["sections"].get(section, []):
        if row["label"] == label:
            return row
    return None


def main():
    people = load_people()
    submitted = [n for n in sorted(people) if people[n]["data"]]
    missing_exports = [n for n in sorted(people) if not people[n]["data"]]
    headcount = len(PEOPLE)
    catalog = build_catalog(people)

    L = []
    A = L.append
    A("# GA Gold Trip -- Who has what")
    A("")
    A("Built by `tools/build_roster.py` from the per-person exports in `roster/`.")
    A("Re-run it after dropping in a new `roster/person-N-name.txt`:")
    A("")
    A("```")
    A("python tools/build_roster.py")
    A("```")
    A("")

    # ---- roster -------------------------------------------------------
    A("## The five")
    A("")
    A("| # | Person | Gear list in? | Their own trip total |")
    A("|---|---|---|---|")
    for n in sorted(people):
        p = people[n]
        if p["data"]:
            tot = p["data"]["totals"].get("Trip total, everything, per person", 0.0)
            A("| {} | {} | yes (`roster/{}`) | {} |".format(n, p["name"], p["file"], money(tot)))
        else:
            A("| {} | {} | **not yet** | -- |".format(n, p["name"]))
    A("")
    if missing_exports:
        A("**Still need a list from:** "
          + ", ".join("person {} ({})".format(n, people[n]["name"]) for n in missing_exports)
          + ". Every count below is only over the {} list(s) actually received, so an item "
            "that reads \"nobody has one\" may already be covered by someone who has not "
            "sent theirs in.".format(len(submitted)))
        A("")

    # ---- group coverage ----------------------------------------------
    A("## Group gear -- what is already covered")
    A("")
    A("One person owning a group item covers the whole group, so nobody else buys it.")
    A("\"Need\" is how many units the plan wants (a `/5` item, `/6` on older lists, is one")
    A("unit for everyone; a `/3` item is two units).")
    A("")
    covered, short, freebies = [], [], []
    for key in sorted(catalog, key=lambda k: (SECTION_ORDER.index(k[0]), k[1])):
        entry = catalog[key]
        if not entry["shared"]:
            continue
        section, label = key
        holders = []
        for n in submitted:
            row = status_of(people, n, section, label)
            if row and row["status"] in HAVE:
                holders.append(n)
        need = units_needed(entry)
        rec = {
            "section": section, "label": label, "need": need,
            "have": sum(UNIT_COUNTS.get((n, label), 1) for n in holders),
            "holders": holders,
            "price": entry["price"], "split": entry["split"],
            "products": entry["products"],
        }
        if rec["have"] >= need:
            covered.append(rec)
        elif entry["price"] == 0.0:
            # A $0 shared line is a note on the page ("tents, already owned",
            # "free CalTopo account"), not something anybody has to buy.
            freebies.append(rec)
        else:
            short.append(rec)

    A("### Covered -- do not buy again")
    A("")
    if covered:
        A("| Section | Item | Who is bringing it | What they have |")
        A("|---|---|---|---|")
        for r in covered:
            who = ", ".join("{} ({})".format(people[n]["name"], n) for n in r["holders"])
            prod = "; ".join(sorted({r["products"].get(n, "own gear") for n in r["holders"]}))
            A("| {} | {} | {} | {} |".format(r["section"], r["label"], who, prod))
    else:
        A("Nothing yet.")
    A("")

    A("### Still short")
    A("")
    if short:
        A("| Section | Item | Have | Need | Full price | Share at {} people |".format(headcount))
        A("|---|---|---|---|---|---|")
        for r in short:
            missing_units = r["need"] - r["have"]
            cost = r["price"] * missing_units
            A("| {} | {} | {} | {} | {} | {} |".format(
                r["section"], r["label"], r["have"], r["need"],
                money(cost), money(cost / headcount)))
        remaining = sum(r["price"] * (r["need"] - r["have"]) for r in short)
        A("")
        A("**Group gear still to buy: {} total, {} each at {} people.**".format(
            money(remaining), money(remaining / headcount), headcount))
    else:
        A("Nothing -- every group item is covered.")
    A("")
    if freebies:
        A("Free/already-owned group lines that still read \"to buy\" on the page, so nobody")
        A("needs to shop for them: " + ", ".join(r["label"] for r in freebies) + ".")
        A("")

    # ---- per-person personal gaps -------------------------------------
    A("## What each person is missing")
    A("")
    A("Personal items only -- one per person, nobody can cover these for anyone else.")
    A("`SKIP` means they deliberately declined it, so it is listed separately.")
    A("")
    person_gap = {}
    person_count = {}
    for n in sorted(people):
        p = people[n]
        A("### Person {} -- {}".format(n, p["name"]))
        A("")
        if not p["data"]:
            A("No gear list yet. Send them the Buy tab of `index.html`, have them set")
            A("every row, then hit **Copy list** and paste it back.")
            A("")
            continue
        need_rows, skipped, nil_rows = [], [], []
        for section in SECTION_ORDER:
            for row in p["data"]["sections"].get(section, []):
                entry = catalog[(section, row["label"])]
                if entry["shared"]:
                    continue
                if row["status"] == "to buy":
                    # A $0 personal pick ("no waders", "already owned") costs
                    # nothing and buys nothing -- it is a tick-box, not a gap.
                    (nil_rows if row["price"] == 0.0 else need_rows).append((section, row))
                elif row["status"] == "SKIP":
                    skipped.append((section, row))
        gap_cost = sum(r["price"] for _, r in need_rows)
        person_gap[n] = gap_cost
        person_count[n] = len(need_rows)
        if need_rows:
            A("| Section | Item | Pick | Cost |")
            A("|---|---|---|---|")
            for section, row in need_rows:
                A("| {} | {} | {} | {} |".format(
                    section, row["label"], row["product"] or "--", money(row["price"])))
            A("")
            A("**{} items, {} to finish.**".format(len(need_rows), money(gap_cost)))
        else:
            A("Nothing missing -- personal kit is complete.")
        if skipped:
            A("")
            A("Skipped on purpose: " + ", ".join(r["label"] for _, r in skipped) + ".")
        if nil_rows:
            A("")
            A("Costs nothing, just untick it: "
              + ", ".join(r["label"] for _, r in nil_rows) + ".")
        A("")

    # ---- bottom line ---------------------------------------------------
    remaining_group = sum(r["price"] * (r["need"] - r["have"]) for r in short)
    group_each = remaining_group / headcount
    A("## Bottom line -- what is left to spend")
    A("")
    A("Personal = the items only that person can buy. Group share = an even {}-way split of".format(headcount))
    A("the {} of group gear nobody has yet.".format(money(remaining_group)))
    A("")
    A("| # | Person | Personal items left | Personal cost | Group share | Still to spend |")
    A("|---|---|---|---|---|---|")
    for n in sorted(people):
        p = people[n]
        if not p["data"]:
            A("| {} | {} | ? | ? | {} | at least {} |".format(
                n, p["name"], money(group_each), money(group_each)))
            continue
        gap = person_gap.get(n, 0.0)
        A("| {} | {} | {} | {} | {} | **{}** |".format(
            n, p["name"], person_count.get(n, 0), money(gap),
            money(group_each), money(gap + group_each)))
    A("")

    # ---- warnings ------------------------------------------------------
    A("## Things to sort out")
    A("")
    notes = []
    if PLAN_SPLIT_BASIS != headcount:
        notes.append(
            "Every shared price in the picker splits **/{}** but the trip is **{} people**. "
            "Each share is understated by about {:.0f}%; the \"share at {} people\" column "
            "above uses the real headcount.".format(
                PLAN_SPLIT_BASIS, headcount,
                (PLAN_SPLIT_BASIS / headcount - 1) * 100, headcount))
    notes.append(
        "The \"their own trip total\" column is whatever their picker page added up, which "
        "counts gear they already own at full retail. It is what their kit is worth, not "
        "what they still owe -- use the bottom-line table for that.")
    # Anyone whose gear list disagrees on an item's existence.
    label_sets = {n: {(s, r["label"])
                      for s, rows in people[n]["data"]["sections"].items()
                      for r in rows}
                  for n in submitted}
    if len(label_sets) > 1:
        all_labels = set().union(*label_sets.values())
        for n, s in label_sets.items():
            diff = all_labels - s
            if diff:
                notes.append(
                    "{}'s list is missing {} row(s) the others have ({}) -- their copy of "
                    "the Buy tab is out of date.".format(
                        people[n]["name"], len(diff),
                        ", ".join(sorted(lbl for _, lbl in diff))[:200]))
    if notes:
        for note in notes:
            A("- " + note)
    else:
        A("Nothing flagged.")
    A("")

    OUT_MD.write_text("\n".join(L) + "\n", encoding="utf-8")

    # ---- full matrix for the hub's "Who has what" tab -----------------
    # Every row anyone's list has, with each person's status on it.
    group_by_key = {(r["section"], r["label"]): r for r in covered + short + freebies}
    items = []
    for key in sorted(catalog, key=lambda k: (SECTION_ORDER.index(k[0]), k[1])):
        entry = catalog[key]
        section, label = key
        cells = {}
        for n in sorted(people):
            if not people[n]["data"]:
                cells[str(n)] = {"s": "nolist"}
                continue
            row = status_of(people, n, section, label)
            if row is None:
                cells[str(n)] = {"s": "absent"}
            elif row["status"] in HAVE:
                cells[str(n)] = {"s": "has", "p": entry["products"].get(n, "")}
            elif row["status"] == "SKIP":
                cells[str(n)] = {"s": "skip"}
            elif row["price"] == 0.0:
                cells[str(n)] = {"s": "free"}
            else:
                cells[str(n)] = {"s": "buy", "p": row["product"], "price": row["price"]}
        rec = {"section": section, "label": label, "shared": entry["shared"],
               "price": entry["price"], "cells": cells}
        g = group_by_key.get(key)
        if g:
            rec.update(need=g["need"], have=g["have"],
                       state="covered" if g in covered else ("free" if g in freebies else "short"))
        items.append(rec)

    OUT_JSON.write_text(json.dumps({
        "sections": SECTION_ORDER,
        "items": items,
        "headcount": headcount,
        "plan_split_basis": PLAN_SPLIT_BASIS,
        "people": {str(n): {"name": p["name"], "file": p["file"],
                            "submitted": bool(p["data"]),
                            "personal_gap_usd": round(person_gap.get(n, 0.0), 2)}
                   for n, p in people.items()},
        "group_covered": covered,
        "group_short": short,
    }, indent=2), encoding="utf-8")

    print("wrote {} and {}".format(OUT_MD.name, OUT_JSON.relative_to(ROOT)))
    print("submitted: {}  missing: {}".format(
        [people[n]["name"] for n in submitted],
        [people[n]["name"] for n in missing_exports]))


if __name__ == "__main__":
    main()
