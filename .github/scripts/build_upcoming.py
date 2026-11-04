#!/usr/bin/env python3
"""Build upcoming.json from the dropping soon page: one row per release with its tier, date, title,
artists, label, kind and link, so the home page can show what is next from a phone's crate without
loading the whole page. upcoming.html is the laptop's render and is never edited here. Stdlib only.
Rebuilt on every push by the site-data workflow.

Since 2026-11-04 the page has two tabs: dropping soon (a date, a month, or no date yet) and released
(three months back). Every row carries its own date in data-iso, so nothing is guessed from the
printed date. The released tab feeds the json for seven days only, so the next up band keeps to what
just landed. A page from before the tabs still parses the old way. Both ways read "ev hot" rows: the
old split only cut at a plain "ev" row, so every heavy rotation release was lost (fixed 2026-11-04)."""
import html, json, re
from datetime import date, timedelta

OUT_NOW_DAYS = 7
MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
SPLIT = re.compile(r'\s*(?:\bb2b\b|\bvs\.?\s|\bx\s|\band\b|\bwith\b|\bfeat\.?|\bft\.?|\+|&|,)\s*', re.I)
ROW = re.compile(r'<li class="ev(?: [^"]*)?"([^>]*)>(.*?)</li>', re.S)

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

def parts(ev, head):
    """title, artists, label, kind and link of one row. head is the tag that holds title and artists."""
    h = re.search(r'<%s>(.*?)</%s>' % (head, head), ev, re.S)
    small = re.search(r'<small>(.*?)</small>', h.group(1), re.S) if h else None
    title = text(re.sub(r'<small>.*?</small>|<span class="canon">.*?</span>', '', h.group(1), flags=re.S)) if h else ''
    artists = [a.strip() for a in SPLIT.split(text(small.group(1)) if small else '') if a.strip()]
    where = text((re.search(r'<div class="where">(.*?)</div>', ev, re.S) or [None, ''])[1]).split(' · ')
    link = re.search(r'<a class="go" href="([^"]+)"', ev)
    return {'title': title, 'artists': artists, 'label': where[0] if where and where[0] else '',
            'kind': where[1] if len(where) > 1 else '', 'link': html.unescape(link.group(1)) if link else None}

def date_label(iso):
    if not iso:
        return 'date tba'
    if len(iso) == 7:
        return date.fromisoformat(iso + '-01').strftime('%B').lower()
    return date.fromisoformat(iso).strftime('%a %d %b').lower().replace(' 0', ' ')

def tabs(src, today):
    """the page since 2026-11-04: one section per tab, data-iso on every dated row."""
    rows, week = [], (today - timedelta(days=OUT_NOW_DAYS)).isoformat()
    for tab in ('soon', 'released'):
        m = re.search(r'<section class="ur-panel" id="%s"[^>]*>(.*?)</section>' % tab, src, re.S)
        if not m:
            continue
        for attrs, ev in ROW.findall(m.group(1)):
            iso = (re.search(r'data-iso="([^"]+)"', attrs) or [None, ''])[1]
            row = parts(ev, 'h4')
            if not row['title']:
                continue
            if tab == 'released':
                if not iso or iso < week:
                    continue
                row.update(tier='this week', date='out now', iso=None)
            else:
                row.update(tier='on the way' if iso else 'named, not dated', date=date_label(iso),
                           iso=iso if len(iso) == 10 else None)
            rows.append(row)
    return rows

def legacy(src, today):
    """the page before the tabs: tierline headings and div rows, the date printed with no year."""
    rows, tier = [], ''
    for part in re.split(r'(?=<div class="tierline">)|(?=<div class="ev[ "])', src):
        if part.startswith('<div class="tierline">'):
            tier = text(re.match(r'<div class="tierline">(.*?)</div>', part, re.S).group(1)); continue
        if not part.startswith('<div class="ev'):
            continue
        label = text((re.search(r'<div class="date">(.*?)</div>', part, re.S) or [None, ''])[1])
        row = parts(part, 'h3')
        if row['title']:
            row.update(tier=tier, date=label, iso=iso_for(label, today))
            rows.append(row)
    return rows

src = open('upcoming.html', encoding='utf-8').read()
today = date.today()
rows = tabs(src, today) if 'class="ur-panel"' in src else legacy(src, today)
rows = [{k: r[k] for k in ('tier', 'date', 'iso', 'title', 'artists', 'label', 'kind', 'link')} for r in rows]
json.dump({'generated': today.isoformat(), 'count': len(rows), 'rows': rows}, open('upcoming.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('upcoming.json: %d rows (%d dated)' % (len(rows), sum(1 for r in rows if r['iso'])))
