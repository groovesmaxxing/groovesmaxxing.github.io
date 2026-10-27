#!/usr/bin/env python3
"""sync_counts: the published artist count, written from one source instead of bumped by hand.

the number of artist profiles (artists/*.html that are not redirects) is the count. every spot that states it
is rewritten to match: the "N artists" lines on index.html (ten of them today) and the "N names" line on
artists.html. nothing else on those pages is touched. artists-index.json (the slug list scan.html reads to
link a recognized artist) is rewritten from the same pages, and its generated date only moves when the list
does. prints what changed, or that nothing did. runs in the site-data workflow on every push, so a new
profile page bumps the count on its own. stdlib only."""
import datetime, glob, json, os, re

slugs = sorted(os.path.basename(f)[:-5] for f in glob.glob("artists/*.html") if 'http-equiv="refresh"' not in open(f, encoding="utf-8").read())
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
try:
    idx = json.load(open("artists-index.json", encoding="utf-8"))
except (OSError, ValueError):
    idx = {}
if idx.get("slugs") != slugs or idx.get("count") != count:
    was = idx.get("count")
    idx = {"generated": datetime.date.today().isoformat(), "count": count, "slugs": slugs}
    open("artists-index.json", "w", encoding="utf-8").write(json.dumps(idx, separators=(",", ":")))
    changed += 1
    print("artists-index.json: now %d slugs (was %s)" % (count, was))
else:
    print("artists-index.json: already %d slugs" % count)
print("sync_counts: %d profiles, %d file(s) changed" % (count, changed))
