#!/usr/bin/env python3
"""Build search-index.json from the pages already in the repo. Stdlib only.

The index feeds /search: artists, labels, sets, talks, tracklists and newsletter issues in one list.
It is rebuilt by the site-data workflow on every push to main, so the laptop scripts never need to
know it exists. Run from the repo root: python3 .github/scripts/build_search_index.py
"""
import html, json, re, unicodedata
from datetime import date

def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)).replace('\xa0', ' ')).strip()

def fold(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s).strip()

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

items = []
def add(kind, name, sub, url, extra=''):
    items.append({'t': kind, 'n': name, 's': sub, 'u': url, 'k': fold(' '.join([name, sub, extra]))})

# artists: the index rows
for m in re.finditer(r'<a class="drow" href="(/artists/[^"]+)" data-s="([^"]*)" data-l="([^"]*)">.*?<span class="dn">(.*?)</span><span class="dm">(.*?)</span>', read('artists.html'), re.S):
    add('artist', text(m.group(4)), text(m.group(5)), m.group(1), text(m.group(2)) + ' ' + text(m.group(3)))

# labels: the index rows, then the wall names that have no page yet
seen = set()
for m in re.finditer(r'<a class="drow" href="(/labels/[^"]+)">.*?<span class="dn">(.*?)</span><span class="dm">(.*?)</span>', read('labels.html'), re.S):
    seen.add(m.group(1)); add('label', text(m.group(2)), text(m.group(3)), m.group(1))
wall = re.search(r'<section id="labels">.*?</section>', read('index.html'), re.S)
if wall:
    for m in re.finditer(r'<(a|span)([^>]*)>([^<]{2,60})</(?:a|span)>', wall.group(0)):
        attrs, name = m.group(2), text(m.group(3))
        href = re.search(r'href="([^"]+)"', attrs); title = re.search(r'title="([^"]*)"', attrs)
        if href and href.group(1) in seen: continue
        if 'class="' in attrs and 'eyebrow' in attrs: continue
        if href: seen.add(href.group(1)); add('label', name, text(title.group(1)) if title else '', href.group(1))
        elif title: add('label', name, text(title.group(1)), '/#labels')

# sets: from sets-index.json when the page is light (lighten_sets.py ran first), else from the full page
import os
if os.path.exists('sets-index.json'):
    for slug, a in json.load(open('sets-index.json', encoding='utf-8'))['artists'].items():
        who = text(a['name'])
        for c in a['cards']:
            mm = re.search(r'<div class="m">(.*?)</div>', c['html'], re.S); meta = text(mm.group(1)) if mm else ''
            add('set', html.unescape(c['title']), meta if meta.lower().startswith(who.lower()) else who + ' · ' + meta, '/sets#' + slug, c['yt'])
else:
    for m in re.finditer(r'<details class="a" id="([^"]+)"><summary><span class="nm">(.*?)</span>.*?</details>', read('sets.html'), re.S):
        slug, who = m.group(1), text(m.group(2))
        for c in re.finditer(r'data-yt="([^"]+)" data-title="([^"]*)".*?<div class="m">(.*?)</div>', m.group(0), re.S):
            meta = text(c.group(3))
            add('set', text(c.group(2)), meta if meta.lower().startswith(who.lower()) else who + ' · ' + meta, '/sets#' + slug, c.group(1))

# talks: the interviews page
for m in re.finditer(r'<details class="a" id="([^"]+)"><summary><span class="nm">(.*?)</span>.*?</details>', read('interviews.html'), re.S):
    slug, who = m.group(1), text(m.group(2))
    for c in re.finditer(r'data-yt="([^"]+)" data-title="([^"]*)".*?<div class="m">(.*?)</div>', m.group(0), re.S):
        add('talk', text(c.group(2)), who + ' · ' + text(c.group(3)), '/interviews#' + slug, c.group(1))

# tracklists: the hub rows
for m in re.finditer(r'<a class="hrow" href="([^"]+)">.*?<b>(.*?)</b><i>(.*?)</i>.*?<td class="ct">(.*?)</td>', read('tracklists/index.html'), re.S):
    add('tracklist', text(m.group(2)) + ' · ' + text(m.group(3)), text(m.group(4)), '/tracklists/' + m.group(1).strip('/'))

# newsletter issues
for m in re.finditer(r'<a class="issue" href="([^"]+)">\s*<div class="inum">(.*?)</div>\s*<div class="ititle">(.*?)</div>', read('newsletter.html'), re.S):
    add('issue', text(m.group(3)), text(m.group(2)), m.group(1))

out = {'generated': date.today().isoformat(), 'count': len(items), 'items': items}
with open('search-index.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print('search-index.json:', len(items), 'items', dict(Counter(i['t'] for i in items)))
