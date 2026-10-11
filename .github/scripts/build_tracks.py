#!/usr/bin/env python3
"""Build tracks-index.json from every tracklist: one row per played track, with the set, the timestamp,
the deep link that opens the set at that second, and the store links the row carries. The scan card
reads it to say "hear it in" and to find a verified store link. Stdlib only. Rebuilt on every push."""
import glob, html, json, re, unicodedata
from datetime import date

def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()
def fold(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\((?:extended|original|radio|club|edit|mix|remix|version|feat\.?|ft\.?)[^)]*\)', ' ', s)
    s = re.sub(r'\b(extended mix|original mix|radio edit|club mix)\b', ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

rows = []
for f in sorted(glob.glob('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    s = open(f, encoding='utf-8').read(); url = '/' + f[:-5]
    h1 = text((re.search(r'<h1>(.*?)</h1>', s, re.S) or [None, ''])[1])
    sub = text((re.search(r'<div class="sub">(.*?)</div>', s, re.S) or [None, ''])[1]).split(' · ')[0]
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', s, re.S):
        t = re.search(r'<td class="t">(?:<a href="([^"]+)"[^>]*>)?([^<]*)', tr)
        x = re.search(r'<td class="x">(.*?)</td>', tr, re.S)
        n = re.search(r'<td class="n">([^<]*)', tr)
        if not t or not x: continue
        body = x.group(1)
        links = {}
        for a in re.findall(r'<div class="get">(.*?)</div>', body, re.S):
            for href, label in re.findall(r'<a class="g[^"]*" href="([^"]+)"[^>]*>(.*?)</a>', a, re.S):
                if 'open.spotify.com/track' in href: links['sp'] = href
                elif 'music.apple.com' in href and 'search' not in href: links['ap'] = href
                elif 'soundcloud.com' in href and 'search' not in href: links['sc'] = href
                elif 'beatport.com' in href and 'search' not in href: links['bp'] = href
        body = re.sub(r'<div class="get">.*?</div>', '', body, flags=re.S)
        body = re.sub(r'<span class="(?:thx|gnote|soft)">.*?</span>', '', body, flags=re.S)
        lab = text((re.search(r'<span class="lab">(.*?)</span>', body) or [None, ''])[1])
        body = re.sub(r'<span class="lab">.*?</span>', '', body, flags=re.S)
        name = text(body)
        if not name or re.match(r'^id\b', name.lower()) and len(name) < 8: continue
        row = {'q': fold(name), 'n': name, 'set': h1 + (' · ' + sub if sub else ''), 'u': url, 'at': t.group(2).strip(), 'tn': (n.group(1).strip() if n else '')}
        if t.group(1): row['l'] = t.group(1)
        if lab: row['lab'] = lab
        if links: row['links'] = links
        rows.append(row)
json.dump({'generated': date.today().isoformat(), 'count': len(rows), 'rows': rows}, open('tracks-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('tracks-index.json: %d rows, %d with a spotify link, %d sets' % (len(rows), sum(1 for r in rows if r.get('links', {}).get('sp')), len(set(r['u'] for r in rows))))
