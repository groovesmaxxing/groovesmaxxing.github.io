#!/usr/bin/env python3
"""sync_counts: the published artist count, written from one source instead of bumped by hand.

the number of artist profiles (artists/*.html that are not redirects) is the count. every spot that states it
is rewritten to match: the "N artists" lines on index.html (nine of them today). artists.html counts its names
in the browser since the 10-27 site review, so it has no spot. artists-index.json, the slug list the scan app
reads, is rebuilt from the same pages, and only when its count or its slugs differ, so its generated date means
the last time the list actually changed. its optional vb_tier map (slug -> listeners tier, written by GMX_tools
vibpage.py on a viberate ship, 2026-11-09) is carried over on a rebuild, minus slugs that no longer have a page,
because nothing in this repo can regenerate it. the label wall count works the same way (2026-11-09, pt-labels-5):
the names in the four walls of the home page's labels section (every <a> and <span> in them) are the count, and
the four sentences that state it (index.html wall note, labels.html twice, artists.html) are kept in step. nothing
else on those pages is touched. prints what changed, or that nothing did. runs in the site-data workflow on every push, so a new profile page bumps the count on its own.
stdlib only."""
import datetime, glob, json, os, re

slugs = sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob("artists/*.html")
               if 'http-equiv="refresh"' not in open(f, encoding="utf-8").read())
count = len(slugs)
SPOTS = [("index.html", r"(?<!\d)(\d{3,4})( artists\b)")]
changed = 0
for path, pat in SPOTS:
    s = open(path, encoding="utf-8").read()
    before = sorted(set(re.findall(pat, s)))
    new, n = re.subn(pat, lambda m: str(count) + m.group(2), s)
    if new != s:
        open(path, "w", encoding="utf-8").write(new)
        changed += 1
        print("%s: %d spot(s) now say %d (were %s)" % (path, n, count, ", ".join(sorted({b[0] for b in before}))))
    else:
        print("%s: %d spot(s) already say %d" % (path, n, count))

# the label wall: the children of the four .wall divs between id="labels" and the wall note on index.html
home = open("index.html", encoding="utf-8").read()
a, b = home.find('id="labels"'), home.find('class="wall-note"')
walls = re.findall(r'<div class="wall\b[^"]*"[^>]*>(.*?)</div>', home[a:b], re.S) if 0 <= a < b else []
labels = sum(len(re.findall(r"<(?:a|span)\b", w)) for w in walls)
LABEL_SPOTS = [("index.html", r"(the skip test\. )(\d+)( of them, ranked by)"),
               ("labels.html", r"(the wall on the home page names )(\d+)( labels\.)"),
               ("labels.html", r"(which is the full list, )(\d+)( names in four groups\.)"),
               ("artists.html", r'(the )(\d+)( labels have <a href="/labels">their own index</a>\.)')]
if len(walls) != 4 or not labels:
    print("label wall: found %d wall(s) and %d name(s) on index.html, left every label count alone" % (len(walls), labels))
else:
    for path in sorted({p for p, _ in LABEL_SPOTS}):
        s = open(path, encoding="utf-8").read()
        new, n = s, 0
        for p, pat in LABEL_SPOTS:
            if p == path:
                new, k = re.subn(pat, lambda m: m.group(1) + str(labels) + m.group(3), new)
                n += k
        if new != s:
            open(path, "w", encoding="utf-8").write(new)
            changed += 1
            print("%s: %d label spot(s) now say %d" % (path, n, labels))
        else:
            print("%s: %d label spot(s) already say %d" % (path, n, labels))

INDEX = "artists-index.json"
try:
    old = json.load(open(INDEX, encoding="utf-8"))
except (OSError, ValueError):
    old = {}
if old.get("count") != count or old.get("slugs") != slugs:
    out = {"generated": datetime.date.today().isoformat(), "count": count, "slugs": slugs}
    tiers = old.get("vb_tier")
    if isinstance(tiers, dict):
        kept = {k: v for k, v in tiers.items() if k in set(slugs)}
        if kept:
            out["vb_tier"] = kept
        if len(kept) != len(tiers):
            print("%s: vb_tier kept %d of %d (pages gone)" % (INDEX, len(kept), len(tiers)))
    open(INDEX, "w", encoding="utf-8", newline="").write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    changed += 1
    was = len(old.get("slugs") or [])
    print("%s: now %d slug(s) (was %d)" % (INDEX, count, was))
else:
    print("%s: already %d slug(s)" % (INDEX, count))
print("sync_counts: %d profiles, %d file(s) changed" % (count, changed))
