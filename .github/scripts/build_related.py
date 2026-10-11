#!/usr/bin/env python3
"""Build the two files that let every page point at everything about the same artist. Stdlib only.
Rebuilt by the site-data workflow on every push to main.

names-index.json   exact names to slugs, for linking a name wherever it sits as a whole token:
                   {"a": {"vintage culture": "vintage-culture", ...}, "l": {"affairs": "affairs", ...}}
related-index.json per artist, everything the site holds on them, so a profile can show what its own
                   rails miss and a tracklist can show more from the same people:
                   {"<slug>": {"n": name, "tl": [[url, title]], "in": [[url, title, tracks]],
                               "sets": [[yt, title]], "talks": [[yt, title]], "lab": [[url, name]]}}
"""
import glob, html, json, re, unicodedata
from datetime import date

def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()
def fold(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower().replace('&', 'and')).strip()
def read(p): return open(p, encoding='utf-8').read()

names_a, names_l, rel = {}, {}, {}
def artist(slug, name):
    rel.setdefault(slug, {'n': name, 'tl': [], 'in': [], 'sets': [], 'talks': [], 'lab': []})
for m in re.finditer(r'<a class="drow" href="/artists/([^"]+)"[^>]*>.*?<span class="dn">(.*?)</span>', read('artists.html'), re.S):
    slug, name = m.group(1), text(m.group(2)); names_a[fold(name)] = slug; artist(slug, name)
for m in re.finditer(r'<a class="drow" href="/labels/([^"]+)">.*?<span class="dn">(.*?)</span>', read('labels.html'), re.S):
    names_l[fold(text(m.group(2)))] = m.group(1)

SPLIT = re.compile(r'\s+(?:b2b|b3b|vs\.?|x|and|with|feat\.?|ft\.?|\+|&|,)\s+', re.I)
def slugs_in(name):
    out = []
    for tok in SPLIT.split(name):
        s = names_a.get(fold(tok.strip()))
        if s and s not in out: out.append(s)
    return out

# tracklists: the headliners, and the artists heard in the rows
for f in sorted(glob.glob('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    s = read(f); url = '/' + f[:-5]
    h1 = text((re.search(r'<h1>(.*?)</h1>', s, re.S) or [None, ''])[1])
    sub = text((re.search(r'<div class="sub">(.*?)</div>', s, re.S) or [None, ''])[1]).split(' · ')[0]
    title = h1 + (' · ' + sub if sub else '')
    heads = slugs_in(h1)
    for a in heads: rel[a]['tl'].append([url, title])
    heard = {}
    for row in re.findall(r'<td class="x">(.*?)</td>', s, re.S):
        for a in re.findall(r'href="\.\./artists/([^"]+)"', row):
            if a in rel: heard[a] = heard.get(a, 0) + 1
        lead = re.split(r'\s+-\s+', text(re.sub(r'<div class="get">.*?</div>', '', row, flags=re.S)), maxsplit=1)[0]
        for a in slugs_in(lead):
            if a not in heads: heard[a] = heard.get(a, 0) + (0 if a in heard else 1)
    for a, n in heard.items():
        if a not in heads: rel[a]['in'].append([url, title, n])

# sets and talks
try:
    for slug, a in json.load(open('sets-index.json', encoding='utf-8'))['artists'].items():
        if slug in rel: rel[slug]['sets'] = [[c['yt'], html.unescape(c['title'])] for c in a['cards']]
except FileNotFoundError:
    pass
for m in re.finditer(r'<details class="a" id="([^"]+)">(.*?)</details>', read('interviews.html'), re.S):
    if m.group(1) in rel:
        rel[m.group(1)]['talks'] = [[c.group(1), html.unescape(c.group(2))] for c in re.finditer(r'data-yt="([^"]+)" data-title="([^"]*)"', m.group(2))]

# labels: a label page that links an artist is a label the artist is on
for f in sorted(glob.glob('labels/*.html')):
    s = read(f)
    if 'http-equiv="refresh"' in s: continue
    lslug = f[7:-5]; name = text((re.search(r'<h1 class="aname">(.*?)</h1>', s, re.S) or [None, lslug])[1])
    for a in sorted(set(re.findall(r'href="/artists/([^"#]+)"', s))):
        if a in rel and not any(x[0] == '/labels/' + lslug for x in rel[a]['lab']): rel[a]['lab'].append(['/labels/' + lslug, name])

json.dump({'generated': date.today().isoformat(), 'a': names_a, 'l': names_l}, open('names-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(rel, open('related-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
have = sum(1 for v in rel.values() if v['tl'] or v['in'] or v['sets'] or v['talks'] or v['lab'])
print('names-index.json: %d artists, %d labels. related-index.json: %d artists with something, %d tracklist headliners, %d heard-in rows, %d label ties' % (
    len(names_a), len(names_l), have, sum(len(v['tl']) for v in rel.values()), sum(len(v['in']) for v in rel.values()), sum(len(v['lab']) for v in rel.values())))
