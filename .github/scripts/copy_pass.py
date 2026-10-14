#!/usr/bin/env python3
"""copy_pass: the shorter intros and explainers (owner's ok, 2026-10-14), re-applied after every render.

several of these pages are written by scripts on the laptop (the roster, setslib.py, ivlib.py,
upcomingpage.py), so a hand edit would come back on the next render. each rule matches the old line, with
its numbers left loose (counts and issue numbers move), and writes the new one. what was cut but still
worth reading sits right under it in a data-more="fold" block, so gmx-more.js shows a "more" button.
a rule whose old line is gone does nothing, so the pass is safe to run any number of times. stdlib only.
runs in site-data after ensure_tags.py and before sync_counts.py."""
import re

N = r'(\d[\d,]*)'   # a number that moves


def more(tag_open, inner):
    """the fold block that sits under a shortened line, in the same tag so it reads the same"""
    tag = re.match(r'<(\w+)', tag_open).group(1)
    return '\n<div data-more="fold" data-more-label="more">' + tag_open + inner + '</' + tag + '></div>'


# (file, old pattern, new text). in the new text {1}, {2} are the numbers the old line had.
RULES = [
    ('artists.html',
     r'<p class="lede">every fact on this page is publicly on the record and sourced\. where someone told their own story, we use their words instead of ours\. no filler, no press-release copy\.</p>',
     '<p class="lede">every fact here is on the record and sourced. where an artist told their own story, we use their words.</p>'),
    ('artists.html',
     r'<p>this page is a work in progress\. ' + N + r' full profiles are written, and every one of the ' + N + r' names now has at least a starter page, and every fact on them was checked against a source before it went up\. even so, sources contradict each other more often than you would think, and some of what we hold is simply out of date\. <b>if we got something wrong about you or your music, tell us and we will fix it fast\.</b> (<a href="mailto:[^"]+">[^<]+</a>) or (<a href="https://www\.instagram\.com/groovesmaxxing/?"[^>]*>@groovesmaxxing</a>)\.</p>',
     '<p>a work in progress: {1} full profiles, and a starter page for all {2} names. <b>got something wrong about you? tell us and we fix it fast.</b> {3} or {4}.</p>'
     + more('<p>', 'every fact was checked against a source before it went up. even so, sources contradict each other more often than you would think, and some of what we hold is out of date.')),
    ('artists.html',
     r'<p class="note">tap any badge on a profile to see who else wears it, or browse them all on (<a href="/badges">)the badge map</a>\. the roster now lives here\. the ' + N + r' labels have (<a href="/labels">their own index</a>)\.</p>',
     '<p class="note">tap any badge on a profile to see who else wears it, or browse {1}the badge map</a>. the {2} labels have {3}.</p>'),
    ('artists.html',
     r"<p class=\"note\">quotes are verbatim from the artists' own public posts and interviews, spelling and all\. every artist has a page now, " + N + r' starters left to grow into full profiles\.</p>',
     "<p class=\"note\">quotes are verbatim from the artists' own posts and interviews, spelling and all. {1} starter pages left to grow.</p>"),

    ('badges.html',
     r'<p class="lede">tap a badge on any artist page and it lands here\. rotation and the collection emoji come from our playlists\. power-ups we hand out ourselves\. every trophy is checked against a source before it goes up\.</p>',
     '<p class="lede">tap a badge on any artist page and it lands here. every trophy is checked against a source.</p>'
     + more('<p class="lede">', 'rotation and the collection emoji come from our playlists. power-ups we hand out ourselves.')),

    # the span is painted by gmx-account.js (phone only, or synced to the account), so it stays as written
    ('crate.html',
     r'<p class="lede">every set and track you tapped the heart on, and every artist and label you follow\. (<span id="gmx-crate-sync">.*?</span>) open the store links, copy the list to paste wherever your playlists live, or see what\'s dropping from the names in here\.</p>',
     '<p class="lede">every set and track you hearted, and every artist and label you follow. {1}</p>'
     + more('<p class="lede">', "open the store links, copy the list to paste wherever your playlists live, or see what's dropping from the names in here.")),
    ('crate.html',
     r'(<p class="cempty" id="c-empty" hidden>)nothing in the crate yet\. tap the heart under any set on the <a href="/">home page</a>, on an artist page, on <a href="/sets">the sets</a> or on <a href="/radio">radio</a>, tap follow on any (<a href="/artists">artist</a>) or (<a href="/labels">label</a>) page, and heart any track on a (<a href="/tracklists/">tracklist</a>)\.</p>',
     '{1}nothing in the crate yet. tap the heart on any set or {4} row, or follow an {2} or {3}.</p>'),

    ('events.html',
     r'<p class="sub">The US house / techno / indie dance calendar from now through December 2026\. The big ones worth traveling for, and the underground worth staying out late for\.</p>',
     '<p class="sub">the us house, techno and indie dance calendar through december 2026. the big ones worth the trip, and the underground worth staying out for.</p>'),
    ('events.html',
     r'<p class="legend"><b>🔴 canon alert</b> = artists from the groovesmaxxing roster are on the bill · lineups shift, so always confirm on the official link</p>',
     '<p class="legend"><b>🔴 canon alert</b> = a roster artist is on the bill. lineups shift, so confirm on the official link.</p>'),

    ('friday.html',
     r'(<p class="mono" style="[^"]*">)this is the full weekly drop\. the archive of issues, with the picks and the stories, lives on (<a href="/newsletter"[^>]*>the newsletter →</a>)</p>',
     '{1}the full weekly drop. the picks and the stories live in {2}</p>'),
    ('friday.html',
     r'<p class="lede">the letter is the highlight reel\. this page is everything, every release that cleared verification this week, dated, labeled, unfiltered\. it refreshes every friday\.</p>',
     '<p class="lede">every release that cleared verification this week, dated, labeled, unfiltered. refreshes every friday.</p>'
     + more('<p class="lede">', 'the letter is the highlight reel. this page is everything.')),
    ('friday.html',
     r'(<p class="lede" style="[^"]*">)want the picks and the story\? (<a href="/newsletter">)read the letter archive →</a> the newest is (<a href="/newsletter/fgf-\d+">)issue (\d+), [^<]*</a>\. want it by email\? (<a href="/#letter">subscribe on the front page →</a>)</p>',
     '{1}want the picks and the story? {2}the letter archive →</a>, newest is {3}issue {4}</a>. by email? {5}</p>'),

    ('index.html',
     r'<p class="about-foot">' + N + r' artists followed\. ' + N + r'\+ tracks curated\. zero skips\. no ads, no sponsors, no corporate playlist politics\. just taste, maxxed\.</p>',
     '<p class="about-foot">{1} artists followed. {2}+ tracks curated. no ads, no sponsors, no corporate playlist politics. just taste, maxxed.</p>'),
    ('index.html',
     r'<p class="manifesto"[^>]*>the week\'s best house, techno and indie dance, in your inbox every friday morning\. the releases that survived the week, one artist worth knowing, and where they\'re playing next\. <em>zero skips\.</em></p>',
     "<p class=\"manifesto\">the week's best house, techno and indie dance, in your inbox every friday morning.</p>"
     + more('<p class="manifesto">', "the releases that survived the week, one artist worth knowing, and where they're playing next. <em>zero skips.</em>")),
    ('index.html',
     r'<p class="note">every friday: the releases that survived the week, an artist worth knowing, and where they\'re playing next\. free, no spam, leave whenever\. zero skips 🧃</p>',
     "<p class=\"note\">every friday: the releases that survived the week, an artist worth knowing, where they're playing next. free, leave whenever 🧃</p>"),
    ('index.html',
     r'<p class="note">the long reads and the deep cuts, folded so the phone scroll stays short\. open any one\.</p>',
     '<p class="note">the long reads and the deep cuts. open any one.</p>'),

    ('interviews.html',
     r'<p class="sub">the artists we follow, talking\. sit-down interviews and talk podcasts, no mixes\. the newest (\d+) up top, then every artist a to z\. tap a name to open their talks\. nothing plays until you tap play\. the mixes live at (<a href="/sets">sets worth your hour</a>)\.</p>',
     '<p class="sub">the artists we follow, talking. sit-down interviews and talk podcasts, no mixes. newest {1} up top, then a to z.</p>'
     + more('<p class="sub">', 'tap a name to open their talks. nothing plays until you tap play. the mixes live at {2}.')),
    ('interviews.html',
     r'<p class="sub">interview shows only, no mix series dressed up as podcasts\. every episode below was checked, and every bolded name is someone on the roster\.</p>',
     '<p class="sub">interview shows only, no mix series dressed up as podcasts. every bolded name is on the roster.</p>'
     + more('<p class="sub">', 'every episode below was checked.')),

    ('more.html',
     r'<p class="lede">your account and the settings, then everything on the site that is not a scan, a set, an artist or a tracklist\.</p>',
     '<p class="lede">your account and settings, then everything else on the site.</p>'),
    ('more.html',
     r'<p class="note">fresh grooves friday in your inbox\. the releases that survived the week, an artist worth knowing, where they\'re playing next\. free, no spam, leave whenever\.</p>',
     "<p class=\"note\">fresh grooves friday in your inbox: the releases that survived the week, an artist worth knowing, where they're playing next. free, leave whenever.</p>"),
    ('more.html',
     r'<p class="note">we listen to everything\. you get the good stuff\. house, techno and indie dance, curated like a friend texting you bangers\. no label pays for a spot, no promo pool, no pay-to-play\. if it\'s here, it goes\.</p>',
     '<p class="note">we listen to everything. you get the good stuff. house, techno and indie dance, curated like a friend texting you bangers.</p>'
     + more('<p class="note">', "no label pays for a spot, no promo pool, no pay-to-play. if it's here, it goes.")),

    ('newsletter.html',
     r'<p class="lede">every friday: house, techno and indie dance\. the releases that survived the week, an artist worth knowing, where they\'re playing next, and whatever else i\'m deep in\. every issue is readable here, in full, for free\.</p>',
     "<p class=\"lede\">every friday: the releases that survived the week, an artist worth knowing, where they're playing next, and whatever else i'm deep in. every issue is here in full, free.</p>"),
    ('newsletter.html',
     r'<p>every pick carries a (&#9989;|✅), which means two independent stores agree or the label said it themselves\. release dates in dance music are wrong often enough that somebody should be checking\. (<b>want it in your inbox first\?</b> <a href="[^"]+"[^>]*>subscribe here</a>)\.</p>',
     '<p>every pick carries a {1}: two independent stores agree, or the label said it themselves. {2}.</p>'
     + more('<p>', 'release dates in dance music are wrong often enough that somebody should be checking.')),

    ('open-ids.html',
     r'<p class="lede">every row in our tracklists that still says ID\. the timestamp is measured, the link opens the set right there, and nothing is guessed at\. know one\? tell us and it goes up with your name on it\.</p>',
     '<p class="lede">every tracklist row that still says ID. the link opens the set at that second. know one? tell us and it goes up with your name on it.</p>'
     + more('<p class="lede">', 'the timestamp is measured and nothing is guessed at.')),

    ('radio.html',
     r'<p class="lede">every set on the site, newest first, one after the other\. tap play once and let it run\. the arrows skip, the dots jump\. nothing plays until you tap\.</p>',
     '<p class="lede">every set on the site, newest first, back to back. tap play once and let it run.</p>'
     + more('<p class="lede">', 'the arrows skip, the dots jump. nothing plays until you tap.')),
    ('radio.html',
     r'<p class="radio-note">the order is newest first by the month on each card\. a set with no month on its card plays last\. the same sets live on (<a href="/sets">the sets page</a>), where you can pick an artist\.</p>',
     '<p class="radio-note">newest first by the month on each card. sets with no month play last.</p>'
     + more('<p class="radio-note">', 'the same sets live on {1}, where you can pick an artist.')),

    ('search.html',
     r'<p class="lede">every artist, label, set, talk, tracklist and newsletter issue on the site, from one box\. type a name, a city, a venue, a sound\.</p>',
     '<p class="lede">every artist, label, set, talk, tracklist and issue, from one box. try a name, a city, a venue, a sound.</p>'),
    # the #n span is filled with the live entry count by the page script, so it stays
    ('search.html',
     r'(<p class="hint" id="hint">)hearing something right now\? (<a href="/scan">scan it</a>)\. the index covers (<span id="n">[^<]*</span>) and rebuilds itself on every update\.</p>',
     '{1}hearing something right now? {2}. the index covers {3}, rebuilt on every update.</p>'),

    ('sets.html',
     r'<p class="sub">the newest (\d+) up top, then every artist a to z\. tap a name to open their sets\. nothing plays until you tap play\. the same sets, one playlist, (<a href="https://www\.youtube\.com/playlist[^"]*"[^>]*>)on youtube ↗</a>\. or let (<a href="/radio">)radio</a> play the whole library back to back\.</p>',
     '<p class="sub">the newest {1} up top, then every artist a to z. the same sets as one {2}youtube playlist ↗</a>, or back to back on {3}radio</a>.</p>'
     + more('<p class="sub">', 'tap a name to open their sets. nothing plays until you tap play.')),

    ('upcoming.html',
     r'<p class="sub">the releases the artist or the label announced themselves, dated as they said it\. every link goes to their own page to pre-save, pre-order or listen\.</p>',
     '<p class="sub">the releases the artist or label announced themselves, dated as they said it.</p>'
     + more('<p class="sub">', 'every link goes to their own page to pre-save, pre-order or listen.')),
    ('upcoming.html',
     r'<p class="legend"><b>🔴</b> = heavy rotation artist · dates move, the artist\'s own post is always the truth · ' + N + r' on the list</p>',
     "<p class=\"legend\"><b>🔴</b> = heavy rotation artist. dates move, the artist's own post is the truth. {1} on the list.</p>"),
]

# friday: every week's footnote keeps its first sentence, the rest folds
FRIDAY_FINE = re.compile(r'<p class="fine">(dates are true release dates, not when a feed noticed\.) (?!<)([^<]+)</p>')
# events: each take shows two lines, the rest behind "more"
EVENTS_TAKE = re.compile(r'<p class="take">')


def fill(tpl, m):
    return re.sub(r'\{(\d+)\}', lambda k: m.group(int(k.group(1))), tpl)


changed = {}
for path, pat, new in RULES:
    try: s = open(path, encoding='utf-8').read()
    except OSError: continue
    t, n = re.subn(pat, lambda m: fill(new, m), s, flags=re.S)
    if n:
        open(path, 'w', encoding='utf-8').write(t); changed[path] = changed.get(path, 0) + n

try:
    s = open('friday.html', encoding='utf-8').read()
    t, n = FRIDAY_FINE.subn(lambda m: '<p class="fine">' + m.group(1) + '</p>' + more('<p class="fine">', m.group(2)), s)
    if n: open('friday.html', 'w', encoding='utf-8').write(t); changed['friday.html'] = changed.get('friday.html', 0) + n
except OSError:
    pass
try:
    s = open('events.html', encoding='utf-8').read()
    t, n = EVENTS_TAKE.subn('<p class="take" data-more data-more-lines="2">', s)
    if n: open('events.html', 'w', encoding='utf-8').write(t); changed['events.html'] = changed.get('events.html', 0) + n
except OSError:
    pass

print('copy_pass:', ', '.join('%s %d' % kv for kv in sorted(changed.items())) or 'nothing to change')
