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

def files(pattern):
    """glob with forward slashes on every system. on windows glob returns tracklists\\index.html, so every
    path.endswith('/index.html') and path.split('/') check below missed and the hub got the set page tags."""
    return [p.replace('\\', '/') for p in glob.glob(pattern)]

MOTION_CSS = '<link rel="stylesheet" href="/gmx-motion.css">'
MOTION_JS = '<script src="/gmx-motion.js" defer></script>'
T = {
    'player_css': '<link rel="stylesheet" href="/gmx-player.css">',
    'nav_css': '<link rel="stylesheet" href="/gmx-nav.css?v=18">',
    'player_js': '<script src="/gmx-player.js" defer></script>',
    'nav_js': '<script src="/gmx-nav.js?v=18" defer></script>',
    'follow_js': '<script src="/gmx-follow.js" defer></script>',
    'crate_js': '<script src="/gmx-crate.js" defer></script>',
    'related_js': '<script src="/gmx-related.js" defer></script>',
    'upcoming_js': '<script src="/gmx-upcoming.js" defer></script>',
    'quick_css': '<link rel="stylesheet" href="/gmx-quick.css">',
    'quick_js': '<script src="/gmx-quick.js" defer></script>',
    'sheet_css': '<link rel="stylesheet" href="/gmx-sheet.css">',
    'sheet_js': '<script src="/gmx-sheet.js" defer></script>',
    # the account layer (2026-10-12): "this is me" on every artist and label profile
    'account_css': '<link rel="stylesheet" href="/gmx-account.css">',
    'account_js': '<script src="/gmx-account.js?v=17" defer></script>',
    # the "more" expander (2026-10-14): any element with data-more collapses behind one button
    'more_js': '<script src="/gmx-more.js?v=2" defer></script>',
    # the name reels on the home page (2026-10-14)
    'reel_js': '<script src="/gmx-reel.js?v=1" defer></script>',
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

# the readability layer (2026-10-13): on every page, as the last tag in the head, so its rules win over the
# page's own <style> block at the same selector. a page the laptop rewrites gets it back here.
READ_CSS = '<link rel="stylesheet" href="/gmx-read.css?v=6">'
def ensure_read(path):
    s = open(path, encoding='utf-8').read(); o = s
    if 'http-equiv="refresh"' in s or path.startswith('google') or '</head>' not in s: return False
    s = re.sub(r'\n?<link rel="stylesheet" href="/gmx-read\.css[^"]*">', '', s)
    # harden_pages.py keeps its image fallback listener as the very last tag, so the link goes just above it
    m = re.search(r"<script>document\.addEventListener\('error'[^\n]*</script>\n</head>", s)
    at = m.start() if m else s.index('</head>')
    s = s[:at] + READ_CSS + '\n' + s[at:]
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o

n = 0
for f in sorted(files('artists/*.html') + files('labels/*.html')):
    n += ensure(f, ['player_css', 'nav_css', 'account_css'], ['player_js'], ['nav_js', 'crate_js', 'related_js', 'account_js'])
for f in sorted(files('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    n += ensure(f, ['nav_css', 'account_css'], [], ['nav_js', 'follow_js', 'crate_js', 'related_js', 'account_js'])
# the tracklists hub: the shared tab bar since the five tab shell (it has no bar of its own), and the hearts
# and "…" menus on every row (owner's call, 2026-10-12). tracklistpage.py writes the hub without them.
n += ensure('tracklists/index.html', ['nav_css'], [], ['nav_js', 'follow_js', 'crate_js', 'related_js'])
n += ensure('events.html', ['nav_css'], [], ['nav_js', 'related_js'])
n += ensure('upcoming.html', ['nav_css', 'account_css'], [], ['nav_js', 'crate_js', 'upcoming_js', 'account_js'])
# the sets and interviews pages carry the account layer too (added by hand with the accounts build, 2026-10-12).
# setslib.py and ivlib.py rewrite both pages from scratch, so the layer has to come back here after every render.
for f in ['sets.html', 'interviews.html']:
    n += ensure(f, ['account_css'], [], ['account_js'])
for f in sorted(files('newsletter/*.html')):
    n += ensure(f, ['nav_css'], [], ['nav_js'])
for f in sorted(files('*.html')):
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

for f in sorted(files('*.html') + files('artists/*.html') + files('labels/*.html') + files('tracklists/*.html') + files('newsletter/*.html')):
    n += ensure_read(f)

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

for f in sorted(files('*.html') + files('artists/*.html') + files('labels/*.html') + files('tracklists/*.html') + files('newsletter/*.html')):
    n += seo(f)
# seo (2026-10-11, video): a VideoObject on every tracklist page that embeds a youtube set, behind the
# <!-- gmx-video --> marker, re-applied after every laptop render. the set's name, the page description,
# the cover (the share card, then youtube's own still), the date from the page's sub line (the sitemap's
# lastmod when the sub carries none), the length, the embed and watch urls, and every named, timestamped
# row as a Clip (name, start, end, the timestamped link) so a search result can show the set's key moments.
VIDEO_MARK = '<!-- gmx-video -->'
_LASTMOD = {}
try:
    _sm = open('sitemap.xml', encoding='utf-8').read()
    for _loc, _mod in re.findall(r'<loc>https://groovesmaxxing\.com/([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>', _sm):
        _LASTMOD[_loc.strip('/')] = _mod.strip()
except OSError:
    pass

def _plain(s):
    return _html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<(?:div|span) class="(?:get|thx|gnote|soft|sig[^"]*|lab)">.*?</(?:div|span)>', '', s, flags=re.S))).replace('\u00a0', ' ')

def _secs(t):
    p = [int(x) for x in t.split(':')]
    return sum(v * 60 ** i for i, v in enumerate(reversed(p)))

def _iso_dur(t):
    s = _secs(t); h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return 'PT' + (f'{h}H' if h else '') + (f'{m}M' if m or h else '') + f'{sec}S'

def video(path, s):
    yt = re.search(r'<iframe src="https://www\.youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]+)[^"]*"([^>]*)>', s)
    if not yt: return None
    vid, slug = yt.group(1), path[len('tracklists/'):-5]
    title = re.search(r'\btitle="([^"]+)"', yt.group(2))
    name = _html.unescape(title.group(1)) if title else page_name(s)
    desc = re.search(r'<meta name="description" content="([^"]+)">', s)
    sub = re.search(r'<div class="sub">(.*?)</div>', s, re.S)
    subtext = _plain(sub.group(1)) if sub else ''
    date = re.search(r'\b(20\d\d-\d\d-\d\d)\b', subtext)
    upload = date.group(1) if date else _LASTMOD.get('tracklists/' + slug)
    if not upload: return None
    dur = re.search(r'\b(\d{1,2}:\d\d:\d\d|\d{1,3}:\d\d)\b', subtext)
    total = _secs(dur.group(1)) if dur else None
    rows = []
    for m in re.finditer(r'<tr[^>]*>\s*<td class="t"><a href="([^"]*[?&]t=(\d+)s)"[^>]*>[^<]*</a></td>\s*<td class="n">[^<]*</td>\s*<td class="x">(.*?)</td>\s*</tr>', s, re.S):
        nm = ' '.join(_plain(m.group(3)).split())
        if not nm or re.match(r'^ID\s*-\s*ID\b', nm, re.I): continue
        rows.append((int(m.group(2)), _html.unescape(m.group(1)), nm))
    clips = []
    for i, (start, url, nm) in enumerate(rows[:100]):
        end = rows[i + 1][0] if i + 1 < len(rows) else total
        c = {'@type': 'Clip', 'name': nm, 'startOffset': start, 'url': url}
        if end and end > start: c['endOffset'] = end
        clips.append(c)
    thumbs = ([f'{SITE}/og/tracklists/{slug}.jpg'] if glob.os.path.exists(f'og/tracklists/{slug}.jpg') else []) + [f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg']
    d = {'@context': 'https://schema.org', '@type': 'VideoObject', 'name': name, 'thumbnailUrl': thumbs, 'uploadDate': upload,
         'embedUrl': f'https://www.youtube-nocookie.com/embed/{vid}', 'contentUrl': f'https://www.youtube.com/watch?v={vid}',
         'url': f'{SITE}/tracklists/{slug}'}
    if desc: d['description'] = _html.unescape(desc.group(1))
    if total: d['duration'] = _iso_dur(dur.group(1))
    if clips: d['hasPart'] = clips
    return VIDEO_MARK + '\n<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False).replace('</', '<\\/') + '</script>'

for f in sorted(files('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    s = open(f, encoding='utf-8').read()
    if 'http-equiv="refresh"' in s or VIDEO_MARK in s: continue
    block = video(f, s)
    if not block: continue
    open(f, 'w', encoding='utf-8').write(s.replace('</head>', block + '\n</head>', 1)); n += 1

# quick search (ui build 1, 2026-10-11): the sheet that opens from any search link or the "/" key, on
# every page. the full search page keeps only its own script.
for f in sorted(files('*.html') + files('artists/*.html') + files('labels/*.html') + files('tracklists/*.html') + files('newsletter/*.html')):
    if f.startswith('google') or f == 'search.html': continue
    n += ensure(f, ['quick_css'], [], ['quick_js'])
# bottom sheet (ui build 2, 2026-10-11): the "…" beside every heart and follow pill, so it rides on every
# page that carries the crate, loaded right after it.
for f in sorted(files('*.html') + files('artists/*.html') + files('labels/*.html') + files('tracklists/*.html')):
    s = open(f, encoding='utf-8').read()
    if T['crate_js'] not in s or T['sheet_js'] in s or 'http-equiv="refresh"' in s: continue
    s = s.replace(T['crate_js'], T['crate_js'] + '\n' + T['sheet_js'], 1)
    if T['sheet_css'] not in s:
        s = s.replace(MOTION_CSS, MOTION_CSS + '\n' + T['sheet_css'], 1) if MOTION_CSS in s else s.replace('</head>', T['sheet_css'] + '\n</head>', 1)
    open(f, 'w', encoding='utf-8').write(s); n += 1
# the tracklists hub (2026-10-14): the tracklists tab opens here, so the list leads, newest first, and the
# rest of the tracklists area folds under it. tracklistpage.py writes the hub on the laptop, so both are
# re-applied after every render. rows sort by the tagged date in their .dt span (no year, so a date later
# in the year than today counts as last year). a row without one keeps the date of the row above it, and
# equal dates keep the laptop's order.
import datetime
HUB_MARK = '<!-- gmx-hub-more -->'
HUB_MORE = HUB_MARK + """
<div class="hub-more" data-more="fold" data-more-label="more in tracklists">
<nav class="hub-links" aria-label="more in tracklists">
<a href="/sets">every set, a to z</a>
<a href="/radio">radio: the library back to back</a>
<a href="/open-ids">the open IDs</a>
<a href="/interviews">interviews and talks</a>
</nav>
</div>"""
_MON = {m: i for i, m in enumerate('jan feb mar apr may jun jul aug sep oct nov dec'.split(), 1)}
def hub(path='tracklists/index.html'):
    try: s = open(path, encoding='utf-8').read()
    except OSError: return False
    o = s
    m = re.search(r'(<table class="tl">\n?)(.*?)(</table>)', s, re.S)
    if m:
        rows = re.findall(r'<tr\b.*?</tr>\n?', m.group(2), re.S)
        if rows and ''.join(rows).strip() == m.group(2).strip():
            today, last, keyed = datetime.date.today(), None, []
            for i, r in enumerate(rows):
                d = re.search(r'<span class="dt">([a-z]{3}) (\d{1,2})</span>', r)
                if d and d.group(1) in _MON:
                    mo, dy = _MON[d.group(1)], int(d.group(2))
                    yr = today.year - 1 if (mo, dy) > (today.month, today.day) else today.year
                    last = (yr, mo, dy)
                keyed.append(((last or (9999, 0, 0)), i, r if r.endswith('\n') else r + '\n'))
            keyed.sort(key=lambda k: (tuple(-x for x in k[0]), k[1]))
            s = s[:m.start(2)] + ''.join(k[2] for k in keyed) + s[m.end(2):]
    if HUB_MARK not in s and '</table>' in s:
        s = s.replace('</table>', '</table>\n' + HUB_MORE, 1)
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o
n += hub()
# the artists tab, layout a (owner's pick, 2026-10-14): names first. the a to z rail moves into the sticky
# search bar, the page intro moves under the list, and every row gets a small lettered disc (the site holds
# no artist photos). the roster script writes artists.html on the laptop, so this is re-applied after every
# render. the look lives in gmx-read.css.
def artists_dir(path='artists.html'):
    try: s = open(path, encoding='utf-8').read()
    except OSError: return False
    o = s
    rail = re.search(r'\n?<div class="rail">.*?</div>', s, re.S)
    chips = re.search(r'<div class="searchbar">.*?<div class="lanechips">.*?</div>', s, re.S)
    if rail and chips and rail.start() > chips.end():
        s = s.replace(rail.group(0), '', 1)
        s = s[:chips.end()] + '\n' + rail.group(0).strip() + s[chips.end():]
    # the intro (owner's call, 2026-10-14): "who we play", then two closed rows, the work in progress note
    # and how to search, all above the search bar. rebuilt from whatever the page holds, so the counts and
    # the contact links stay the roster script's own.
    mast = re.search(r'\n?<header class="mast"[^>]*>.*?</header>', s, re.S)
    if mast and 'data-gmx="artists-mast"' not in mast.group(0):
        t = mast.group(0)
        def num(pat, dflt=''):
            m = re.search(pat, t)
            return m.group(1) if m else dflt
        full = num(r'(\d[\d,]*) full profiles')
        names = num(r'(\d[\d,]*) names')
        labels = num(r'the (\d[\d,]*) labels')
        mail = re.search(r'<a href="mailto:[^"]+">[^<]+</a>', t)
        ig = re.search(r'<a href="https://www\.instagram\.com/groovesmaxxing/?"[^>]*>@groovesmaxxing</a>', t)
        reach = ' '.join(x for x in [mail.group(0) if mail else '', 'or' if mail and ig else '', ig.group(0) if ig else ''] if x)
        block = ('<header class="mast" data-gmx="artists-mast">\n<h1>who we play</h1>\n'
            '<details class="gmx-fold"><summary>this page is a work in progress</summary><div class="gmx-fold-body">\n'
            '<p>every fact here is on the record and sourced. where an artist told their own story, we use their words, not ours. no filler, no press-release copy.</p>\n'
            + ('<p>%s full profiles are written, and every one of the %s names has at least a starter page. ' % (full, names) if full and names else '<p>')
            + 'every fact was checked against a source before it went up. even so, sources contradict each other more often than you would think, and some of what we hold is out of date.</p>\n'
            '<p><b>got something wrong about you or your music? tell us and we fix it fast.</b>' + (' ' + reach + '.' if reach else '') + '</p>\n'
            '</div></details>\n'
            '<details class="gmx-fold"><summary>how to search</summary><div class="gmx-fold-body">\n'
            '<p>type a name, a city or a sound. bumpy and vibes filter by lane. tap a letter to jump to it.</p>\n'
            '<p>tap any badge on a profile to see who else wears it, or browse <a href="/badges">the badge map</a>.'
            + (' the %s labels have <a href="/labels">their own index</a>.' % labels if labels else '') + '</p>\n'
            '</div></details>\n</header>')
        s = s.replace(mast.group(0), '', 1)
        bar = s.index('<div class="searchbar">')
        s = s[:bar] + block + '\n\n' + s[bar:]
    def disc(m):
        name = _html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        ch = name[:1] or '#'
        return m.group(1) + '<span class="dav" aria-hidden="true">' + _html.escape(ch.upper()) + '</span>' + m.group(0)[len(m.group(1)):]
    s = re.sub(r'(<a class="drow"[^>]*>)(?!<span class="dav")(?:<span class="dlane">[^<]*</span>)?<span class="dn">(.*?)</span>', disc, s)
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o
n += artists_dir()
# the "more" expander (2026-10-14): on every page, so a data-more attribute works wherever it lands
for f in sorted(files('*.html') + files('artists/*.html') + files('labels/*.html') + files('tracklists/*.html') + files('newsletter/*.html')):
    # scan.html stays out: the recognizer page is its own build and carries no data-more blocks
    if f.startswith('google') or f == 'scan.html': continue
    n += ensure(f, [], [], ['more_js'])
n += ensure('index.html', [], [], ['reel_js'])
print('ensure_tags:', n, 'pages touched')
