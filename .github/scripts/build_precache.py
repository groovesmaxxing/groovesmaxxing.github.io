#!/usr/bin/env python3
"""Write precache.json: the pages and files the installed app keeps on the phone so they open with no
signal. every tracklist, the hubs, the shared scripts and the data files. stdlib only. rebuilt by the
site-data workflow on every push to main."""
import glob, json
from datetime import date

urls = ['/', '/scan', '/more', '/search', '/sets', '/artists', '/events', '/radio', '/crate', '/upcoming', '/open-ids', '/tracklists/',
        '/gmx-nav.js', '/gmx-nav.css', '/gmx-quick.js', '/gmx-quick.css', '/gmx-sheet.js', '/gmx-sheet.css','/gmx-player.js', '/gmx-player.css', '/gmx-motion.js', '/gmx-motion.css',
        '/gmx-refresh.js', '/gmx-clips.js', '/gmx-sets.js', '/gmx-follow.js', '/gmx-crate.js', '/gmx-upcoming.js', '/gmx-profile.css', '/gmx-label.css',
        '/gmx-capture-worklet.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg',
        '/sets-index.json', '/set-tags.json', '/search-index.json', '/artists-index.json', '/radar-denver.json', '/names-index.json', '/related-index.json', '/gmx-related.js', '/tracks-index.json', '/open-ids.json']
urls += ['/upcoming.json', '/gmx-nextup.js']   # the home page's next up band (ui build 3)
for f in sorted(glob.glob('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    urls.append('/' + f[:-5])
json.dump({'generated': date.today().isoformat(), 'urls': urls}, open('precache.json', 'w'), separators=(',', ':'))
print('precache.json:', len(urls), 'urls')
