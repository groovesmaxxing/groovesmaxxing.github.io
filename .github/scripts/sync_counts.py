#!/usr/bin/env python3
"""sync_counts: the published artist count, written from one source instead of bumped by hand.

the number of artist profiles (artists/*.html that are not redirects) is the count. every spot that states it
is rewritten to match: the "N artists" lines on index.html (ten of them today) and the "N names" line on
artists.html. artists-index.json, the slug list the scan app reads, is rebuilt from the same pages, and only when
its count or its slugs differ, so its generated date means the last time the list actually changed. nothing else
on those pages is touched. prints what changed, or that nothing did. runs in the site-data workflow on every
push, so a new profile page bumps the count on its own. stdlib only."""
import datetime, glob, json, os, re

slugs = sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob("artists/*.html")
               if 'http-equiv="refresh"' not in open(f, encoding="utf-8").read())
count = len(slugs)
SPOTS = [("index.html", r"(?<!\d)(\d{3,4})( artists\b)"), ("artists.html", r"(?<!\d)(\d{3,4})( names\b)")]
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

INDEX = "artists-index.json"
try:
    old = json.load(open(INDEX, encoding="utf-8"))
except (OSError, ValueError):
    old = {}
if old.get("count") != count or old.get("slugs") != slugs:
    out = {"generated": datetime.date.today().isoformat(), "count": count, "slugs": slugs}
    open(INDEX, "w", encoding="utf-8", newline="").write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    changed += 1
    was = len(old.get("slugs") or [])
    print("%s: now %d slug(s) (was %d)" % (INDEX, count, was))
else:
    print("%s: already %d slug(s)" % (INDEX, count))
print("sync_counts: %d profiles, %d file(s) changed" % (count, changed))
