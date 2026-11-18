#!/usr/bin/env python3
"""Make sets.html light. Stdlib only. Rebuilt by the site-data workflow on every push to main.

The sets page the laptop writes carries every card for every artist, about 500 KB of html. This
script moves the per-artist cards into sets-index.json and leaves an empty grid per artist that
/gmx-sets.js fills the moment a fold opens or a search runs. The "just added" row stays inline.
The laptop keeps writing the full page, this script keeps lightening it, and the two never fight
because the full page is the input.

Set titles stay in the html (seo P2-8, 2026-11-18): every fold carries <ul class="st">, one <li> per
set with the title as plain text and, where a tracklist page carries that set's video id, a
"tracklist" link to it. The id match is setslib.py's tracklist_map rule (data-yt, youtu.be, v=,
/embed/ in tracklists/*.html), exact ids only, never a title. No thumbnails, no players, no youtube
links: those still come from the json. gmx-sets.js takes the list out once the cards are in. The
list's few css rules sit in the page's own <style> on one line starting /* sets:st.

Two entry states, one output:
  a full page (cards inline): the cards move to sets-index.json, the folds get their lists.
  a light page (<!-- sets:light -->): the lists are rebuilt from sets-index.json and the tracklist
    pages, nothing else is touched, and the page is only written when something differs
    ("unchanged" otherwise). sets-index.json is never written in this state.
Idempotent in both: a second run prints unchanged.

title and name are plain text (decoded from the page's attributes); html is markup.
JSON shape, for the day setslib.py emits it directly and this script becomes a no-op:
  {"generated": "YYYY-MM-DD", "artists": {"<slug>": {"name": "...", "page": "/artists/<slug>",
    "cards": [{"yt": "<id>", "title": "...", "html": "<div class=\\"t\\">...</div><div class=\\"m\\">...</div>"}]}}}
"""
import glob, html, json, os, re, sys
from datetime import date

p = 'sets.html'
LIGHT = '<!-- sets:light -->'
FOLD = re.compile(r'<details class="a" id="([^"]+)">(<summary>.*?</summary>)<div class="in">(.*)</div></details>$')
# a fold that is already light: the artist page link, the title list (when there is one), the empty grid
LIGHT_IN = re.compile(r'(?:<a class="pg" href="([^"]+)">artist page →</a>)?(?:<ul class="st">.*?</ul>)?<div class="grid" data-slug="([^"]+)" data-n="\d+"></div>$')
ST_CSS = ('/* sets:st, the set titles kept in the html (seo p2-8) */'
          '.st{list-style:none;margin:0 0 14px;padding:0;font-family:\'Space Mono\',monospace;font-size:12.5px;line-height:1.5;color:var(--steel)}'
          '.st li{padding:3px 0}'
          '.st a{color:var(--racing);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}'
          '.st a:hover{text-decoration-thickness:2px}')
ST_CSS_LINE = re.compile(r'^/\* sets:st[^\n]*\n', re.M)


def tracklists():
    """{video id: /tracklists/<page>}, the same exact-id rule as setslib.py tracklist_map."""
    out = {}
    for f in sorted(glob.glob(os.path.join('tracklists', '*.html'))):
        if os.path.basename(f) == 'index.html':
            continue
        h = open(f, encoding='utf-8').read()
        ids = set(re.findall(r'data-yt="([A-Za-z0-9_-]{11})"', h))
        ids |= set(re.findall(r'(?:youtu\.be/|[?&]v=|/embed/)([A-Za-z0-9_-]{11})', h))
        for vid in ids:
            out.setdefault(vid, '/tracklists/' + os.path.basename(f)[:-len('.html')])
    return out


def fold(slug, head, page, cards, tl):
    items = []
    for c in cards:
        t = html.escape(html.unescape(c['title']), False)     # the stored title can carry entities, the pages decode it once
        u = tl.get(c['yt'])
        items.append('<li>%s · <a href="%s">tracklist</a></li>' % (t, u) if u else '<li>%s</li>' % t)
    return '<details class="a" id="%s">%s<div class="in">%s<ul class="st">%s</ul><div class="grid" data-slug="%s" data-n="%d"></div></div></details>' % (
        slug, head, ('<a class="pg" href="%s">artist page →</a>' % page) if page else '', ''.join(items), slug, len(cards))


def with_css(s):
    s = ST_CSS_LINE.sub('', s)
    i = s.find('\n</style>')
    return s if i < 0 else s[:i + 1] + ST_CSS + s[i:]


src = open(p, encoding='utf-8').read()
tl = tracklists()

if LIGHT in src:
    try:
        index = json.load(open('sets-index.json', encoding='utf-8'))['artists']
    except (OSError, ValueError, KeyError) as e:
        print('sets.html is already light, sets-index.json unreadable (%s), lists left as they are' % e); sys.exit(0)
    lines = src.split('\n')
    folds = titles = links = missing = 0
    for i, line in enumerate(lines):
        m = FOLD.match(line)
        if not m: continue
        slug, head, inner = m.group(1), m.group(2), m.group(3)
        lm = LIGHT_IN.match(inner)
        if not lm or lm.group(2) != slug: continue
        a = index.get(slug)
        if not a or not a.get('cards'):
            missing += 1; continue
        lines[i] = fold(slug, head, lm.group(1) or '', a['cards'], tl)
        folds += 1; titles += len(a['cards']); links += sum(1 for c in a['cards'] if c['yt'] in tl)
    out = with_css('\n'.join(lines))
    note = '%d folds, %d titles, %d tracklist links%s' % (folds, titles, links, (', %d folds not in sets-index.json' % missing) if missing else '')
    if out == src:
        print('sets.html is already light, title lists unchanged (%s)' % note); sys.exit(0)
    open(p, 'w', encoding='utf-8').write(out)
    print('sets.html is already light, title lists refreshed (%s), page %d -> %d KB' % (note, len(src) // 1024, len(out) // 1024))
    sys.exit(0)

artists = {}
lines = src.split('\n')
for i, line in enumerate(lines):
    m = FOLD.match(line)
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
        cards.append({'yt': cm.group(1), 'title': html.unescape(cm.group(2)), 'html': cm.group(3)})   # plain text: the pages escape on output (C5, 2026-11-09)
    if len(cards) != len(chunks) or not cards: continue
    artists[slug] = {'name': html.unescape(name.group(1)) if name else slug, 'page': page.group(1) if page else '', 'cards': cards}
    lines[i] = fold(slug, head, page.group(1) if page else '', cards, tl)
out = '\n'.join(lines)
if not artists:
    print('no artist folds found, nothing done'); sys.exit(0)

# the inline search script goes, the shared one comes in
m = re.search(r'<script>\n\(function\(\)\{\nfunction play\(b\)\{.*?\n</script>\n', out, re.S)
if not m:
    print('the sets script did not match, nothing done'); sys.exit(1)
out = with_css(out[:m.start()] + LIGHT + '\n<script src="/gmx-sets.js?v=2" defer></script>\n' + out[m.end():])
json.dump({'generated': date.today().isoformat(), 'artists': artists}, open('sets-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
open(p, 'w', encoding='utf-8').write(out)
print('sets.html: %d artists moved to sets-index.json (%d cards, %d tracklist links kept as titles), page %d -> %d KB' % (
    len(artists), sum(len(a['cards']) for a in artists.values()), sum(1 for a in artists.values() for c in a['cards'] if c['yt'] in tl), len(src) // 1024, len(out) // 1024))
