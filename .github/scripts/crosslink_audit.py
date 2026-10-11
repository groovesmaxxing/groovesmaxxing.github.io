#!/usr/bin/env python3
"""Count where the site's pieces do not point at each other yet. Stdlib only, read only, prints a report.
The browser layer (gmx-related.js) fills these gaps on the page. This report shows what the generated
pages themselves still miss, which is the laptop side's to close whenever it wants to."""
import glob, html, json, re, unicodedata
def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()
def fold(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower().replace('&', 'and')).strip()
names = {fold(text(m.group(2))): m.group(1) for m in re.finditer(r'<a class="drow" href="/artists/([^"]+)"[^>]*>.*?<span class="dn">(.*?)</span>', open('artists.html', encoding='utf-8').read(), re.S)}
profiles = {f[8:-5]: open(f, encoding='utf-8').read() for f in glob.glob('artists/*.html')}
profiles = {k: v for k, v in profiles.items() if 'http-equiv' not in v}
rel = json.load(open('related-index.json', encoding='utf-8'))
tl = sets = talks = labs = 0
for slug, me in rel.items():
    p = profiles.get(slug, '')
    tl += sum(1 for x in me['tl'] if x[0] not in p)
    sets += sum(1 for x in me['sets'] if 'data-yt="%s"' % x[0] not in p)
    talks += sum(1 for x in me['talks'] if 'data-yt="%s"' % x[0] not in p)
    labs += sum(1 for x in me['lab'] if 'href="%s"' % x[0] not in p)
ev = open('events.html', encoding='utf-8').read()
bold = [s for s in re.findall(r'<strong>(.*?)</strong>', ev) if names.get(fold(text(s)))]
print('cross-link audit (gaps in the generated pages, all covered in the browser by gmx-related.js)')
print('  tagged tracklists missing from the headliner profile: %d' % tl)
print('  sets on the sets page missing from the artist profile: %d' % sets)
print('  talks on the interviews page missing from the profile: %d' % talks)
print('  label pages that link an artist whose profile does not link back: %d' % labs)
print('  radar hub bold names with a profile and no link in the html: %d of %d' % (len(bold), len(re.findall(r'<strong>', ev))))
