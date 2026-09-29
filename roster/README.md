# roster/ -- who already owns what

One text file per person, holding exactly what their Buy tab produced.

## Getting a list from someone

1. Send them `index.html` (the trip hub) and tell them to open the **Buy** tab.
2. They set every row: pick Budget / Value / Premium, or hit **Own** for gear
   they already have, or **Skip** for gear they are not taking. They tick
   **Got it** on anything already bought.
3. They hit **Copy list** (or **Download**) and send the text back.
4. Save it here as `person-<number>-<name>.txt`, verbatim -- do not reformat
   it, the parser reads the exact export format.

Person numbers are fixed:

| # | Person |
|---|---|
| 1 | Jordan |
| 2 | Nik |
| 3 | Nathan |
| 4 | Hilton |
| 5 | Jarred |

## Rebuilding the report

```
python tools/build_roster.py
```

Writes `ROSTER.md` at the project root (group coverage, per-person gaps,
bottom-line spend) and `roster/roster.json` for anything else that wants the
numbers.

## Why the statuses matter

- `OWN` and `GOT IT` both mean the item exists and is coming on the trip. For
  a shared item, one person having it covers the group.
- `to buy` is a real gap.
- `SKIP` is a deliberate no -- reported separately so it is not mistaken for
  a gap.

Picks save in that person's browser only, so the file here is the only copy
this project keeps.
