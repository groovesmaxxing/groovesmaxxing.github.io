#!/usr/bin/env python3
"""Write the events page's MusicEvent schema from the nightly radar (2026-10-11, seo).

radar-events.json is every ticketmaster date for the artists we follow, refreshed nightly by the
events radar workflow. The page renders them from that file in the browser, which a search engine
does not run, so this writes the next EVENTS_MAX dates from today as a JSON-LD @graph of MusicEvent
between the markers in events.html's head: name, the date, the room and city, the artist as
performer, and the ticket link as the offer. Nothing is invented: no times, no prices, no
availability. Runs after the sweep in events-radar.yml and in the site-data workflow. Stdlib only.
"""
import json, re
from datetime import date

EVENTS_MAX = 150
START, END = '<!-- gmx-events-ld start -->', '<!-- gmx-events-ld end -->'
SITE = 'https://groovesmaxxing.com'

def esc_json(d):
    return json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

def event(e):
    place = {'@type': 'Place', 'name': e.get('venue') or e.get('city') or 'tba'}
    addr = {k: v for k, v in (('addressLocality', e.get('city')), ('addressRegion', e.get('region'))) if v}
    if addr:
        place['address'] = dict({'@type': 'PostalAddress'}, **addr)
    out = {'@type': 'MusicEvent', 'name': e.get('event') or e.get('artist'), 'startDate': e['date'], 'location': place,
           'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
           'eventStatus': 'https://schema.org/EventScheduled'}
    if e.get('artist'):
        out['performer'] = {'@type': 'MusicGroup', 'name': e['artist']}
    if e.get('url'):
        out['url'] = e['url']
        out['offers'] = {'@type': 'Offer', 'url': e['url']}
    return out

radar = json.load(open('radar-events.json', encoding='utf-8'))
today = date.today().isoformat()
rows = sorted((e for e in radar.get('events', []) if e.get('date') and e['date'] >= today and (e.get('event') or e.get('artist'))),
              key=lambda e: (e['date'], e.get('artist') or ''))[:EVENTS_MAX]
graph = {'@context': 'https://schema.org', '@graph': [event(e) for e in rows]}
block = f'{START}\n<script type="application/ld+json">{esc_json(graph)}</script>\n{END}'

page = open('events.html', encoding='utf-8').read()
a, b = page.find(START), page.find(END)
if a < 0 or b < a:
    raise SystemExit('events.html: the gmx-events-ld markers are missing')
page = page[:a] + block + page[b + len(END):]
open('events.html', 'w', encoding='utf-8').write(page)
print('events.html: %d MusicEvent rows from %s (%d in the radar)' % (len(rows), today, len(radar.get('events', []))))
