#!/usr/bin/env python3
"""Make sure every page carries the shared tags it needs. Stdlib only. Idempotent.
Runs in the site-data workflow on every push, so a page the laptop writes fresh picks up the shared
player, the tab bar, the follow-along and the crate without the laptop template knowing about them.

artist and label profiles: player css/js, nav css/js, crate js
tracklist pages:           nav css/js, follow js, crate js
newsletter issues:         nav css/js
root pages with no inline tab bar: nav css/js
"""
import glob, re

MOTION_CSS = '<link rel="stylesheet" href="/gmx-motion.css">'
MOTION_JS = '<script src="/gmx-motion.js" defer></script>'
T = {
    'player_css': '<link rel="stylesheet" href="/gmx-player.css">',
    'nav_css': '<link rel="stylesheet" href="/gmx-nav.css">',
    'player_js': '<script src="/gmx-player.js" defer></script>',
    'nav_js': '<script src="/gmx-nav.js" defer></script>',
    'follow_js': '<script src="/gmx-follow.js" defer></script>',
    'crate_js': '<script src="/gmx-crate.js" defer></script>',
}

def ensure(path, heads, before_motion, after_motion):
    s = open(path, encoding='utf-8').read(); o = s
    if 'http-equiv="refresh"' in s: return False
    add = [T[k] for k in heads if T[k] not in s]
    if add:
        if MOTION_CSS in s: s = s.replace(MOTION_CSS, MOTION_CSS + '\n' + '\n'.join(add), 1)
        else: s = s.replace('</head>', '\n'.join(add) + '\n</head>', 1)
    b = [T[k] for k in before_motion if T[k] not in s]
    a = [T[k] for k in after_motion if T[k] not in s]
    if b or a:
        if MOTION_JS in s: s = s.replace(MOTION_JS, '\n'.join(b + [MOTION_JS] + a), 1)
        else: s = s.replace('</body>', '\n'.join(b + a) + '\n</body>', 1)
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o

n = 0
for f in sorted(glob.glob('artists/*.html') + glob.glob('labels/*.html')):
    n += ensure(f, ['player_css', 'nav_css'], ['player_js'], ['nav_js', 'crate_js'])
for f in sorted(glob.glob('tracklists/*.html')):
    if f.endswith('/index.html'): continue
    n += ensure(f, ['nav_css'], [], ['nav_js', 'follow_js', 'crate_js'])
for f in sorted(glob.glob('newsletter/*.html')):
    n += ensure(f, ['nav_css'], [], ['nav_js'])
for f in sorted(glob.glob('*.html')):
    s = open(f, encoding='utf-8').read()
    if 'class="gmx-tabs"' in s or 'http-equiv="refresh"' in s or f.startswith('google'): continue
    n += ensure(f, ['nav_css'], [], ['nav_js'])
# the pages that carry a stage inline also get the crate, after the player (the home page has no motion tag)
for f in ['index.html', 'sets.html', 'interviews.html']:
    s = open(f, encoding='utf-8').read()
    if T['crate_js'] in s: continue
    anchor = T['player_js'] if T['player_js'] in s else MOTION_JS
    if anchor not in s: continue
    s = s.replace(anchor, anchor + '\n' + T['crate_js'], 1); open(f, 'w', encoding='utf-8').write(s); n += 1
print('ensure_tags:', n, 'pages touched')
