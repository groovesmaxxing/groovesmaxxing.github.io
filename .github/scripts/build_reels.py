#!/usr/bin/env python3
"""build_reels: the two drifting name reels on the home page (owner's call, 2026-10-14).

every artist we follow, sized by how many of their tracks sit on our playlists, and every label we follow,
sized by how many of its tracks survived the skip test. written between the artist-reel and label-reel
markers in index.html on every push, so a new profile or a new playlist add shows up on its own.

  artists: every non-redirect page in artists/, named from its h1. the count is the "N tracks" the badge
           page lists for it (most played, heavy rotation, in rotation, one to watch). no count = smallest.
  labels:  every name on the label wall in index.html, counted from its "N of its tracks" title.

sizes r4 (biggest) to r0. rows are dealt round robin by count, so every row gets its share of big names,
then each row runs a to z. gmx-reel.js loops and drifts them. stdlib only."""
import glob, html, re

def tier(n, cuts):
    for size, floor in cuts:
        if n >= floor: return size
    return 'r0'

ART_CUTS = [('r4', 13), ('r3', 8), ('r2', 3), ('r1', 1)]   # the badge tiers: most played, heavy, in rotation, one to watch
LAB_CUTS = [('r4', 15), ('r3', 6), ('r2', 3), ('r1', 1)]

def rows_of(items, n_rows):
    items = sorted(items, key=lambda x: (-x[2], x[1].lower()))
    rows = [[] for _ in range(n_rows)]
    for i, it in enumerate(items): rows[i % n_rows].append(it)
    return [sorted(r, key=lambda x: x[1].lower()) for r in rows]

def reel(rows, cuts, label):
    out = ['<div class="reel" role="group" aria-label="%s">' % label]
    for r in rows:
        out.append('<div class="reel-row"><div class="reel-track">' + ''.join(
            '<a class="%s" href="%s" tabindex="-1">%s</a>' % (tier(c, cuts), href, html.escape(name, quote=False)) for href, name, c in r) + '</div></div>')
    out.append('</div>')
    return '\n'.join(out)

# artists
counts = {}
try:
    b = open('badges.html', encoding='utf-8').read()
    for slug, n in re.findall(r'<a class="drow" href="/artists/([^"]+)">.*?<span class="dm">(\d+) tracks?</span>', b):
        counts[slug] = max(counts.get(slug, 0), int(n))
except OSError:
    pass
artists = []
for f in sorted(glob.glob('artists/*.html')):
    s = open(f, encoding='utf-8').read()
    if 'http-equiv="refresh"' in s: continue
    m = re.search(r'<h1 class="aname">(.*?)</h1>', s, re.S)
    if not m: continue
    slug = f.replace('\\', '/').split('/')[-1][:-5]
    name = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip()
    artists.append(('/artists/' + slug, name, counts.get(slug, 0)))

idx = open('index.html', encoding='utf-8').read()

# labels, from the wall
labels = []
L = idx.find('<section id="labels">')
if L > -1:
    sec = idx[L:idx.find('</section>', L)]
    for walls in re.findall(r'<div class="wall">(.*?)</div>', sec, re.S):
        for tag, attrs, name in re.findall(r'<(a|span)\b([^>]*)>([^<]+)</\1>', walls):
            href = re.search(r'href="([^"]+)"', attrs)
            n = re.search(r'title="(\d+) of its tracks', attrs)
            labels.append((href.group(1) if href else '/labels', html.unescape(name).strip(), int(n.group(1)) if n else 0))

def put(s, key, block):
    a, z = '<!-- %s:start -->' % key, '<!-- %s:end -->' % key
    if a not in s or z not in s: return s
    i, j = s.index(a) + len(a), s.index(z)
    return s[:i] + '\n' + block + '\n' + s[j:]

new = idx
if artists:
    new = put(new, 'artist-reel', reel(rows_of(artists, 4), ART_CUTS, 'every artist we follow, the bigger the name the more of their tracks on our playlists'))
if labels:
    new = put(new, 'label-reel', reel(rows_of(labels, 2), LAB_CUTS, 'every label we follow, the bigger the name the more of its tracks survived the skip test'))
if new != idx: open('index.html', 'w', encoding='utf-8').write(new)
print('build_reels: %d artists (%d with a count), %d labels%s' % (len(artists), sum(1 for a in artists if a[2]), len(labels), '' if new != idx else ', nothing changed'))
