#!/usr/bin/env python3
"""Write precache.json: the pages and files the installed app keeps on the phone so they open with no
signal. every tracklist, the hubs, the shared scripts and the data files. stdlib only. rebuilt by the
site-data workflow on every push to main.

sw.js keeps these in its own stable cache (gmx-precache) and asks again only for what is missing or
stale, so a longer list here costs a phone the download once, not on every cache-name bump.

--check: write nothing. map every url in this list and in the sw.js SHELL to a file in the repo, and read
every listed page for the local scripts and stylesheets it loads; print each url with no file and each
asset a listed page loads that neither list holds (a moved ?v= tag shows up here), exit 1 if any."""
import glob, json, os, re, sys
from datetime import date

urls = ['/', '/scan', '/more', '/search', '/sets', '/artists', '/events', '/radio', '/crate', '/upcoming', '/open-ids', '/tracklists/',
        '/gmx-nav.js?v=37', '/gmx-lang.js?v=12', '/gmx-nav.css?v=21', '/gmx-sheet.js?v=4', '/gmx-sheet.css?v=4','/gmx-player.js?v=1', '/gmx-player.css?v=3', '/gmx-motion.js?v=2', '/gmx-motion.css?v=2',
        '/gmx-refresh.js?v=1', '/gmx-scan.js?v=8', '/gmx-clips.js', '/gmx-sets.js', '/gmx-follow.js?v=1', '/gmx-crate.js?v=1', '/gmx-upcoming.js?v=5','/gmx-profile.css?v=4', '/gmx-label.css?v=3',
        '/gmx-capture-worklet.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg',
        '/sets-index.json', '/set-tags.json', '/search-index.json', '/artists-index.json', '/radar-denver.json', '/names-index.json', '/related-index.json', '/gmx-related.js?v=1', '/tracks-index.json', '/open-ids.json']
urls += ['/upcoming.json', '/gmx-nextup.js?v=1']   # the home page's next up band (ui build 3)
urls += ['/gmx-read.css?v=10']   # the readability layer on every page (2026-10-13)
urls += ['/gmx-more.js?v=3', '/gmx-reel.js?v=1']   # the "more" expander on every page (2026-10-14)
urls += ['/moods', '/moods-index.json', '/gmx-moods.js?v=5']   # the mood picker (2026-11-04), its catalog is written on the laptop by moodindex.py
urls += ['/' + f.replace(os.sep, '/') for f in sorted(glob.glob('media/covers/moods/*.jpg'))]   # the mood cards' art
# the font css only: the 5 latin files the site draws are in the sw.js SHELL, other subsets are saved when a page first uses one
urls += ['/gmx-fonts.css?v=2']
# what the precached pages load that was missing (web review 2026-11-09): the events radar's tour list, the
# october overlay on the home page, the spanish words for a visitor who picked es
urls += ['/radar-events.json', '/gmx-spooky.js?v=6', '/gmx-lang-es.js?v=12']
# the hubs the tracklist footer links, the friday list, the newsletter and its two newest issues
urls += ['/labels', '/interviews', '/picks', '/friday', '/calendar', '/badges', '/newsletter', '/gmx-hubs.js?v=1']
urls += ['/' + f.replace(os.sep, '/')[:-5] for f in sorted(glob.glob('newsletter/fgf-*.html'))[-2:]]
for f in sorted(glob.glob('tracklists/*.html')):
    f = f.replace(os.sep, '/')
    if f.endswith('/index.html'): continue
    urls.append('/' + f[:-5])


def file_for(u):
    """the repo file a site url is served from (clean urls, as cloudflare pages serves them), or None"""
    p = u.split('?', 1)[0].split('#', 1)[0].lstrip('/')
    if p == '' or p.endswith('/'):
        cands = [p + 'index.html']
    elif '.' in p.rsplit('/', 1)[-1]:
        cands = [p]
    else:
        cands = [p + '.html', p + '/index.html']
    for c in cands:
        if os.path.isfile(c):
            return c
    return None


def shell_urls():
    m = re.search(r"var SHELL = \[(.*?)\];", open('sw.js', encoding='utf-8').read(), re.S)
    return re.findall(r"'([^']+)'", m.group(1)) if m else []


def check():
    have = set(urls) | set(shell_urls())
    missing, unlisted = [], {}
    for u in sorted(have):
        f = file_for(u)
        if not f:
            missing.append(u)
            continue
        if not f.endswith('.html'):
            continue
        html = open(f, encoding='utf-8', errors='replace').read()
        refs = re.findall(r'<script\b[^>]*\bsrc="(/[^"/][^"]*)"', html)
        refs += [h for tag in re.findall(r'<link\b[^>]*>', html) if re.search(r'rel="(stylesheet|manifest)"', tag)
                 for h in re.findall(r'href="(/[^"/][^"]*)"', tag)]
        for r in refs:
            if r not in have:
                unlisted.setdefault(r, u)
    for u in missing:
        print('precache: no file for', u)
    for r, page in sorted(unlisted.items()):
        print('precache: %s loads %s, which neither precache.json nor the sw.js SHELL holds' % (page, r))
    return len(missing) + len(unlisted)


if '--check' in sys.argv[1:]:
    n = check()
    print('precache check:', n, 'problem(s)' if n != 1 else 'problem')
    sys.exit(1 if n else 0)

json.dump({'generated': date.today().isoformat(), 'urls': urls}, open('precache.json', 'w'), separators=(',', ':'))
print('precache.json:', len(urls), 'urls')
