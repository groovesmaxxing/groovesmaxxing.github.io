#!/usr/bin/env python3
"""Build upcoming.json from the dropping soon page: one row per release with its tier, date, title,
artists, label, kind and link, so the home page can show what is next from a phone's crate without
loading the whole page. upcoming.html is the laptop's render and is never edited here. A dated row
gets an iso date (the page prints "fri 17 oct" with no year: this year, or next when that lands more
than sixty days back). Stdlib only. Rebuilt on every push by the site-data workflow."""
import html, json, re
from datetime import date, timedelta

MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
SPLIT = re.compile(r'\s*(?:\bb2b\b|\bvs\.?\s|\bx\s|\band\b|\bwith\b|\bfeat\.?|\bft\.?|\+|&|,)\s*', re.I)

def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()

def iso_for(label, today):
    m = re.search(r'(\d{1,2})\s+([a-z]{3})', label.lower())
    if not m or m.group(2) not in MONTHS:
        return None
    day, mon = int(m.group(1)), MONTHS[m.group(2)]
    for year in (today.year, today.year + 1, today.year - 1):
        try:
            d = date(year, mon, day)
        except ValueError:
            continue
        if today - timedelta(days=60) <= d <= today + timedelta(days=400):
            return d.isoformat()
    return None

src = open('upcoming.html', encoding='utf-8').read()
today = date.today()
rows, tier = [], ''
# the page is a run of tier headings and rows: cut it at every tierline and every row start, so a row is
# the text up to the next one whatever closes it (the last child of a row is its link, not a div)
for part in re.split(r'(?=<div class="tierline">)|(?=<div class="ev">)', src):
    if part.startswith('<div class="tierline">'):
        tier = text(re.match(r'<div class="tierline">(.*?)</div>', part, re.S).group(1)); continue
    if not part.startswith('<div class="ev">'):
        continue
    ev = part
    date_label = text((re.search(r'<div class="date">(.*?)</div>', ev, re.S) or [None, ''])[1])
    h3 = re.search(r'<h3>(.*?)</h3>', ev, re.S)
    small = re.search(r'<small>(.*?)</small>', h3.group(1), re.S) if h3 else None
    title = text(re.sub(r'<small>.*?</small>', '', h3.group(1), flags=re.S)) if h3 else ''
    artists = [a.strip() for a in SPLIT.split(text(small.group(1)) if small else '') if a.strip()]
    where = text((re.search(r'<div class="where">(.*?)</div>', ev, re.S) or [None, ''])[1]).split(' · ')
    link = re.search(r'<a class="go" href="([^"]+)"', ev)
    if not title:
        continue
    rows.append({'tier': tier, 'date': date_label, 'iso': iso_for(date_label, today), 'title': title, 'artists': artists,
                 'label': where[0] if where and where[0] else '', 'kind': where[1] if len(where) > 1 else '',
                 'link': link.group(1) if link else None})
json.dump({'generated': today.isoformat(), 'count': len(rows), 'rows': rows}, open('upcoming.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('upcoming.json: %d rows (%d dated)' % (len(rows), sum(1 for r in rows if r['iso'])))
