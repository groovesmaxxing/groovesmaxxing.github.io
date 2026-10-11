#!/usr/bin/env python3
"""Make sets.html light. Stdlib only. Rebuilt by the site-data workflow on every push to main.

The sets page the laptop writes carries every card for every artist, about 500 KB of html. This
script moves the per-artist cards into sets-index.json and leaves an empty grid per artist that
/gmx-sets.js fills the moment a fold opens or a search runs. The "just added" row stays inline.
Idempotent: a page that is already light is left alone. The laptop keeps writing the full page,
this script keeps lightening it, and the two never fight because the full page is the input.

JSON shape, for the day setslib.py emits it directly and this script becomes a no-op:
  {"generated": "YYYY-MM-DD", "artists": {"<slug>": {"name": "...", "page": "/artists/<slug>",
    "cards": [{"yt": "<id>", "title": "...", "html": "<div class=\\"t\\">...</div><div class=\\"m\\">...</div>"}]}}}
"""
import json, re, sys
from datetime import date

p = 'sets.html'
src = open(p, encoding='utf-8').read()
if '<!-- sets:light -->' in src:
    print('sets.html is already light'); sys.exit(0)

artists = {}
lines = src.split('\n')
for i, line in enumerate(lines):
    m = re.match(r'<details class="a" id="([^"]+)">(<summary>.*?</summary>)<div class="in">(.*)</div></details>$', line)
    if not m: continue
    slug, head, inner = m.group(1), m.group(2), m.group(3)
    name = re.search(r'<span class="nm">(.*?)</span>', head)
    page = re.search(r'<a class="pg" href="([^"]+)">', inner)
    g = inner.find('<div class="grid">')
    if g < 0 or not inner.endswith('</div>'): continue
    grid = inner[g + len('<div class="grid">'):-len('</div>')]          # the cards, without the grid's own closing tag
    chunks = [c for c in grid.split('<div class="card">') if c.strip()]
    cards = []
    for c in chunks:
        if not c.endswith('</div>'): break
        body = c[:-len('</div>')]                                        # drop the card's closing tag
        cm = re.match(r'<button class="set-facade" type="button" data-yt="([^"]+)" data-title="([^"]*)".*?</button>(.*)$', body, re.S)
        if not cm: break
        cards.append({'yt': cm.group(1), 'title': cm.group(2), 'html': cm.group(3)})
    if len(cards) != len(chunks) or not cards: continue
    artists[slug] = {'name': name.group(1) if name else slug, 'page': page.group(1) if page else '', 'cards': cards}
    lines[i] = '<details class="a" id="%s">%s<div class="in">%s<div class="grid" data-slug="%s" data-n="%d"></div></div></details>' % (
        slug, head, ('<a class="pg" href="%s">artist page →</a>' % page.group(1)) if page else '', slug, len(cards))
out = '\n'.join(lines)
if not artists:
    print('no artist folds found, nothing done'); sys.exit(0)

# the inline search script goes, the shared one comes in
m = re.search(r'<script>\n\(function\(\)\{\nfunction play\(b\)\{.*?\n</script>\n', out, re.S)
if not m:
    print('the sets script did not match, nothing done'); sys.exit(1)
out = out[:m.start()] + '<!-- sets:light -->\n<script src="/gmx-sets.js" defer></script>\n' + out[m.end():]
json.dump({'generated': date.today().isoformat(), 'artists': artists}, open('sets-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
open(p, 'w', encoding='utf-8').write(out)
print('sets.html: %d artists moved to sets-index.json (%d cards), page %d -> %d KB' % (len(artists), sum(len(a['cards']) for a in artists.values()), len(src) // 1024, len(out) // 1024))
