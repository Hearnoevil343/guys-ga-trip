"""Regenerate RUNDOWN.html from RUNDOWN.md (run from the project root: python tools/build_rundown.py).

Keeps the <style> block from the existing RUNDOWN.html, so styling edits go there.
Needs: pip install markdown. Callout boxes (.warn/.note) are not produced from the md;
the md's bold lead-ins render as plain paragraphs.
"""
import re, html, markdown

md = open("RUNDOWN.md", encoding="utf-8").read()
old = open("RUNDOWN.html", encoding="utf-8").read()
style = re.search(r"<style>.*?</style>", old, re.S).group(0)

m = re.search(r"^# (.+)$", md, re.M)
title = m.group(1)
body = md[m.end():]
# drop the md's own TOC (rebuilt below from the ## headings)
body = re.sub(r"^## Table of Contents\n.*?(?=^## )", "", body, flags=re.S | re.M)
body = re.sub(r"^---\s*$", "", body, flags=re.M)
parts = re.split(r"^## ", body, flags=re.M)
intro, secs = parts[0], parts[1:]

def render(t):
    return markdown.markdown(t, extensions=["tables", "sane_lists", "fenced_code"])

toc, out = [], []
for s in secs:
    head, _, rest = s.partition("\n")
    n = re.match(r"(\d+)\.", head)
    sid = "s" + n.group(1) if n else "x" + str(len(out))
    toc.append(f'  <li><a href="#{sid}">{html.escape(head)}</a></li>')
    out.append(f'<section class="numbered" id="{sid}">\n<h2>{html.escape(head)}</h2>\n{render(rest)}\n</section>')

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
{style}
</head>
<body>

<h1>{html.escape(title)}</h1>
{render(intro)}

<nav class="toc">
<strong>Table of Contents</strong>
<ol>
{chr(10).join(toc)}
</ol>
</nav>

{chr(10).join(out)}

<footer>Generated from RUNDOWN.md by tools/build_rundown.py.</footer>

</body>
</html>
"""
open("RUNDOWN.html", "w", encoding="utf-8").write(page)
print("wrote RUNDOWN.html", len(page))
