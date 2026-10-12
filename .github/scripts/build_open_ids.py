#!/usr/bin/env python3
"""Build open-ids.json from every tracklist: the rows we could not name, set by set, in the hub's order
(newest first). /open-ids reads it to show the board, and a tracklist's "n open" tag links to its own
section there. A row counts as open when the tracklist marks it <tr class="open"> or its name is the bare
ID - ID. Stdlib only. Rebuilt on every push by the site-data workflow."""
import glob, html, json, re
from datetime import date

def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()

hub = open('tracklists/index.html', encoding='utf-8').read()
order, when = [], {}
for m in re.finditer(r'<a class="hrow" href="([^"]+)">.*?<td class="ct">(.*?)</td>', hub, re.S):
    slug = m.group(1).strip('/'); dt = re.search(r'<span class="dt">(.*?)</span>', m.group(2))
    order.append(slug); when[slug] = text(dt.group(1) if dt else '')
rank = {s: i for i, s in enumerate(order)}

sets = []
for f in sorted(glob.glob('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    s = open(f, encoding='utf-8').read()
    if 'http-equiv="refresh"' in s: continue
    slug = f[len('tracklists/'):-5]
    h1 = text((re.search(r'<h1>(.*?)</h1>', s, re.S) or [None, ''])[1])
    sub = text((re.search(r'<div class="sub">(.*?)</div>', s, re.S) or [None, ''])[1])
    where = sub.split(' · ')[0]
    yt = re.search(r'youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]+)', s)
    src = 'youtube' if yt else ('soundcloud' if 'w.soundcloud.com/player' in s else 'other')
    total, open_rows = 0, []
    for tr in re.finditer(r'<tr([^>]*)>(.*?)</tr>', s, re.S):
        attrs, body = tr.group(1), tr.group(2)
        t = re.search(r'<td class="t">(?:<a href="([^"]+)"[^>]*>)?([^<]*)', body)
        x = re.search(r'<td class="x">(.*?)</td>', body, re.S)
        if not t or not x: continue
        total += 1
        name = text(re.sub(r'<(?:div|span) class="(?:get|thx|gnote|soft|sig[^"]*|lab)">.*?</(?:div|span)>', '', x.group(1), flags=re.S))
        is_open = 'class="open"' in attrs or re.match(r'^id\s*-\s*id\b', name, re.I) is not None
        if not is_open: continue
        n = re.search(r'<td class="n">([^<]*)', body)
        row = {'tn': (n.group(1).strip() if n else ''), 'at': t.group(2).strip(), 'note': re.sub(r'^id\s*-\s*id\s*', '', name, flags=re.I).strip()}
        if t.group(1): row['l'] = t.group(1)
        open_rows.append(row)
    if not open_rows: continue
    entry = {'slug': slug, 'u': '/tracklists/' + slug, 'h1': h1, 'where': where, 'when': when.get(slug, ''), 'src': src, 'total': total, 'open': open_rows}
    if yt: entry['yt'] = yt.group(1)
    sets.append(entry)
sets.sort(key=lambda e: (rank.get(e['slug'], 10**6), e['slug']))
count = sum(len(e['open']) for e in sets)
json.dump({'generated': date.today().isoformat(), 'count': count, 'sets': len(sets), 'tracklists': len([f for f in glob.glob('tracklists/*.html') if not f.endswith('/index.html')]), 'list': sets},
          open('open-ids.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('open-ids.json: %d open rows across %d sets' % (count, len(sets)))

# the same board, written into /open-ids itself between its markers, so a crawler (and a phone with
# scripts off) reads every open row without fetching the json. the page script redraws the board
# from the json on load with the same markup, plus the "i know this one" button, so nothing jumps.
def esc(s): return html.escape(str(s or ''), quote=True)

def block(e):
    rows = ''.join('<div class="orow"><span class="at">%s</span><span class="tn">%s</span><span class="id">ID%s</span></div>' % (
        ('<a href="%s" target="_blank" rel="noopener" aria-label="play %s from %s">%s ↗</a>' % (esc(r['l']), esc(e['h1']), esc(r['at']), esc(r['at']))) if r.get('l') else esc(r['at']),
        esc(r['tn']), ('<i>%s</i>' % esc(r['note'])) if r['note'] else '') for r in e['open'])
    return '<section class="oset" id="%s"><div class="oh"><a class="nm" href="%s">%s</a><span class="wh">%s%s</span><span class="ct">%d open <small>of %d</small></span></div>%s</section>' % (
        esc(e['slug']), esc(e['u']), esc(e['h1']), esc(e['where']), (' · ' + esc(e['when'])) if e['when'] else '', len(e['open']), e['total'], rows)

def between(page, start, end, body):
    a, b = page.find(start), page.find(end)
    if a < 0 or b < a: raise SystemExit('open-ids.html: marker %s missing' % start)
    return page[:a + len(start)] + body + page[b:]

page = open('open-ids.html', encoding='utf-8').read()
page = between(page, '<!-- open-ids stat start -->', '<!-- open-ids stat end -->',
               '<b>%d</b> open across <b>%d</b> of %d tracklists · rebuilt on every update, last %s' % (count, len(sets), len(glob.glob('tracklists/*.html')) - 1, date.today().isoformat()))
page = between(page, '<!-- open-ids board start -->', '<!-- open-ids board end -->', '\n' + '\n'.join(block(e) for e in sets) + '\n')
open('open-ids.html', 'w', encoding='utf-8').write(page)
print('open-ids.html: board written in place')
