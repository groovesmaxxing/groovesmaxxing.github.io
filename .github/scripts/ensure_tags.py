#!/usr/bin/env python3
"""Make sure every page carries the shared tags it needs. Stdlib only. Idempotent.
Runs in the site-data workflow on every push, so a page the laptop writes fresh picks up the shared
player, the tab bar, the follow-along and the crate without the laptop template knowing about them.

artist and label profiles: player css/js, nav css/js, crate js, related js
tracklist pages:           nav css/js, follow js, crate js, related js
the radar hub:             related js
dropping soon:             crate js, upcoming js (the crate filter survives the laptop's next render)
newsletter issues:         nav css/js
root pages with no inline tab bar: nav css/js
"""
import glob, re

MOTION_CSS = '<link rel="stylesheet" href="/gmx-motion.css">'
MOTION_JS = '<script src="/gmx-motion.js" defer></script>'
T = {
    'player_css': '<link rel="stylesheet" href="/gmx-player.css">',
    'nav_css': '<link rel="stylesheet" href="/gmx-nav.css">',
    'player_js': '<script src="/gmx-player.js" defer></script>',
    'nav_js': '<script src="/gmx-nav.js" defer></script>',
    'follow_js': '<script src="/gmx-follow.js" defer></script>',
    'crate_js': '<script src="/gmx-crate.js" defer></script>',
    'related_js': '<script src="/gmx-related.js" defer></script>',
    'upcoming_js': '<script src="/gmx-upcoming.js" defer></script>',
    'quick_css': '<link rel="stylesheet" href="/gmx-quick.css">',
    'quick_js': '<script src="/gmx-quick.js" defer></script>',
}

def ensure(path, heads, before_motion, after_motion):
    s = open(path, encoding='utf-8').read(); o = s
    if 'http-equiv="refresh"' in s: return False
    add = [T[k] for k in heads if T[k] not in s]
    if add:
        if MOTION_CSS in s: s = s.replace(MOTION_CSS, MOTION_CSS + '\n' + '\n'.join(add), 1)
        else: s = s.replace('</head>', '\n'.join(add) + '\n</head>', 1)
    b = [T[k] for k in before_motion if T[k] not in s]
    a = [T[k] for k in after_motion if T[k] not in s]
    if b or a:
        if MOTION_JS in s: s = s.replace(MOTION_JS, '\n'.join(b + [MOTION_JS] + a), 1)
        else: s = s.replace('</body>', '\n'.join(b + a) + '\n</body>', 1)
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o

n = 0
for f in sorted(glob.glob('artists/*.html') + glob.glob('labels/*.html')):
    n += ensure(f, ['player_css', 'nav_css'], ['player_js'], ['nav_js', 'crate_js', 'related_js'])
for f in sorted(glob.glob('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    n += ensure(f, ['nav_css'], [], ['nav_js', 'follow_js', 'crate_js', 'related_js'])
n += ensure('events.html', ['nav_css'], [], ['nav_js', 'related_js'])
n += ensure('upcoming.html', ['nav_css'], [], ['nav_js', 'crate_js', 'upcoming_js'])
for f in sorted(glob.glob('newsletter/*.html')):
    n += ensure(f, ['nav_css'], [], ['nav_js'])
for f in sorted(glob.glob('*.html')):
    s = open(f, encoding='utf-8').read()
    if 'class="gmx-tabs"' in s or 'http-equiv="refresh"' in s or f.startswith('google'): continue
    n += ensure(f, ['nav_css'], [], ['nav_js'])
# the pages that carry a stage inline also get the crate, after the player (the home page has no motion tag)
for f in ['index.html', 'sets.html', 'interviews.html']:
    s = open(f, encoding='utf-8').read()
    if T['crate_js'] in s: continue
    anchor = T['player_js'] if T['player_js'] in s else MOTION_JS
    if anchor not in s: continue
    s = s.replace(anchor, anchor + '\n' + T['crate_js'], 1); open(f, 'w', encoding='utf-8').write(s); n += 1

# seo (2026-10-11): the head tags the laptop templates do not write, re-applied after every render.
#   twitter:card on every page that has an og:image, so a link pasted into x or slack unfurls large.
#   a BreadcrumbList (home › section › page) on every artist, label, tracklist and newsletter page, so
#   search results show the section path instead of the bare url. named from the page title, linked
#   from its canonical. the block sits behind a marker comment so the plain <script type=...> stays
#   exactly what preflight parses.
import html as _html, json
CRUMB_MARK = '<!-- gmx-crumbs -->'
SECTIONS = {'artists': ('artists', '/artists'), 'labels': ('labels', '/labels'),
            'tracklists': ('tracklists', '/tracklists/'), 'newsletter': ('newsletter', '/newsletter')}
SITE = 'https://groovesmaxxing.com'

def page_name(s):
    m = re.search(r'<title>(.*?)</title>', s, re.S)
    if not m: return ''
    t = _html.unescape(re.sub(r'\s+', ' ', m.group(1))).strip()
    for sep in (' · groovesMAXXING', ' · groovesmaxxing'):
        if t.lower().endswith(sep.lower()): t = t[:-len(sep)].rstrip()
    for pre in ('groovesMAXXING · ',):
        if t.lower().startswith(pre.lower()): t = t[len(pre):].lstrip()
    return t

def crumbs(path, s):
    folder = path.split('/')[0]
    if folder not in SECTIONS or path.endswith('/index.html'): return None
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', s)
    name = page_name(s)
    if not canon or not name: return None
    sec, sec_url = SECTIONS[folder]
    d = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'groovesmaxxing', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': sec, 'item': SITE + sec_url},
        {'@type': 'ListItem', 'position': 3, 'name': name, 'item': canon.group(1)}]}
    return CRUMB_MARK + '\n<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False).replace('</', '<\\/') + '</script>'

def seo(path):
    s = open(path, encoding='utf-8').read(); o = s
    if 'http-equiv="refresh"' in s or path.startswith('google'): return False
    desc = re.search(r'<meta name="description" content="([^"]+)">', s)
    if desc and 'property="og:title"' not in s and page_name(s):
        # a page with a title and a description but no open graph block (the friday drop) gets the
        # plain one: title, description, the site card, and its canonical as og:url when it has one
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', s)
        t = _html.escape(page_name(s) + ' · groovesMAXXING', quote=True)
        og_block = ['<meta property="og:title" content="%s">' % t, '<meta property="og:description" content="%s">' % desc.group(1)] \
            + ([] if 'property="og:image"' in s else ['<meta property="og:image" content="%s/og-image.png">' % SITE]) \
            + (['<meta property="og:url" content="%s">' % canon.group(1)] if canon and 'property="og:url"' not in s else [])
        s = s.replace(desc.group(0), desc.group(0) + '\n' + '\n'.join(og_block), 1)
    og = re.search(r'<meta property="og:image" content="[^"]+">', s)
    if og and 'name="twitter:card"' not in s:
        s = s.replace(og.group(0), og.group(0) + '\n<meta name="twitter:card" content="summary_large_image">', 1)
    if CRUMB_MARK not in s:
        c = crumbs(path, s)
        if c: s = s.replace('</head>', c + '\n</head>', 1)
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o

for f in sorted(glob.glob('*.html') + glob.glob('artists/*.html') + glob.glob('labels/*.html') + glob.glob('tracklists/*.html') + glob.glob('newsletter/*.html')):
    n += seo(f)
# quick search (ui build 1, 2026-10-11): the sheet that opens from any search link or the "/" key, on
# every page. the full search page keeps only its own script.
for f in sorted(glob.glob('*.html') + glob.glob('artists/*.html') + glob.glob('labels/*.html') + glob.glob('tracklists/*.html') + glob.glob('newsletter/*.html')):
    if f.startswith('google') or f == 'search.html': continue
    n += ensure(f, ['quick_css'], [], ['quick_js'])
print('ensure_tags:', n, 'pages touched')
