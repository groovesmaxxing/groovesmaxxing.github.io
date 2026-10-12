#!/usr/bin/env python3
"""Build feed.xml, an RSS feed of the newsletter issues, from newsletter.html. Stdlib only.
Rebuilt by the site-data workflow on every push to main."""
import html, re
from datetime import datetime
from email.utils import format_datetime

MONTHS = {m: i for i, m in enumerate(['january','february','march','april','may','june','july','august','september','october','november','december'], 1)}
def text(s): return html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ').strip()
def esc(s): return html.escape(s, quote=False)

src = open('newsletter.html', encoding='utf-8').read()
items = []
for m in re.finditer(r'<a class="issue" href="([^"]+)">\s*<div class="inum">(.*?)</div>\s*<div class="ititle">(.*?)</div>\s*<p class="idek">(.*?)</p>', src, re.S):
    href, num, title, dek = m.group(1), text(m.group(2)), text(m.group(3)), text(m.group(4))
    d = re.search(r'(\d{1,2}) ([a-z]+) (\d{4})', num.lower())
    when = datetime(int(d.group(3)), MONTHS.get(d.group(2), 1), int(d.group(1)), 12, 0) if d else None
    items.append((href, num, title, dek, when))

body = ''.join(
    '  <item>\n    <title>%s</title>\n    <link>https://groovesmaxxing.com%s</link>\n    <guid isPermaLink="true">https://groovesmaxxing.com%s</guid>\n%s    <description>%s</description>\n  </item>\n'
    % (esc(num + ' · ' + title), href, href, ('    <pubDate>%s</pubDate>\n' % format_datetime(when)) if when else '', esc(dek))
    for href, num, title, dek, when in items)
feed = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n'
        '  <title>fresh grooves friday · groovesMAXXING</title>\n  <link>https://groovesmaxxing.com/newsletter</link>\n'
        '  <description>the releases that survived the week, an artist worth knowing, where they are playing next. every friday.</description>\n'
        '  <language>en</language>\n  <atom:link href="https://groovesmaxxing.com/feed.xml" rel="self" type="application/rss+xml"/>\n'
        + body + '</channel>\n</rss>\n')
open('feed.xml', 'w', encoding='utf-8').write(feed)
print('feed.xml:', len(items), 'issues')
