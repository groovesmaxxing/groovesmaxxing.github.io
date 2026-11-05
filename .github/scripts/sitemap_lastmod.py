#!/usr/bin/env python3
"""sitemap_lastmod: one owner for every <lastmod> in sitemap.xml that the laptop renderers miss (2026-11-05, P1-1).

the laptop renderers bump lastmod for the pages they write through GMX_tools/sitelinks.bump_lastmod. every
other page (a hand edit, the nightly events graph, a derived block a workflow rewrote) kept a frozen date,
and git cannot date them here: actions/checkout is depth 1, and a shared tag bump touches all 900+ pages at
once, which would make every lastmod the same day and meaningless. so this dates from content.

for each <url> in sitemap.xml the loc maps to its file (the site root is index.html, a loc ending in / is
<path>/index.html, otherwise <path>.html, the same rule as preflight's local_target). the page's body is
hashed with the shared and security tags removed: every <script> except the inline application/ld+json
blocks (those are content, the events MusicEvent graph moves nightly), every <link> and <meta> tag, and the
?v=N version queries, then whitespace collapsed, sha256. the thumbnail onerror handlers the laptop renderers
write are read as the data-fallback attributes harden_pages.py turns them into, since harden runs after this
script and the hash must not move when it rewrites them. the baseline lives in .github/sitemap-hashes.json
as {loc: sha}.

on a run: a loc with no baseline gets its hash recorded and its lastmod left alone, so the first run changes
no dates. a hash that differs from the baseline sets that lastmod to today's utc date (the runner's clock is
utc) and updates the baseline. baseline entries whose loc left the sitemap are dropped. sitemap.xml is
written back with its own line ends kept and both entry shapes (one line per tag, or one line per url)
untouched apart from the date. prints "sitemap lastmod: N bumped, M new baselines, K dropped". exits 0
always, a failure here must not block the site. stdlib only.

runs at the end of the derived files step in site-data.yml (after sync_counts.py, before crosslink_audit.py)
and after build_event_schema.py in events-radar.yml, both from the repo root.

the <footer> block and the <span class="gmx-flinks"> link run are left out of the hash too (2026-11-05, seo
P1-6a): they are the same links on hundreds of pages, so a change there would date every page at once.

usage: python3 .github/scripts/sitemap_lastmod.py                (write)
       python3 .github/scripts/sitemap_lastmod.py --check        (print what would change, write nothing)
       python3 .github/scripts/sitemap_lastmod.py --rebaseline   (rehash every page into the baseline and move
                                                                  no dates, after a change to what the hash reads)
"""
import hashlib, json, os, re, sys
from datetime import date

SITE = "https://groovesmaxxing.com"
SITEMAP = "sitemap.xml"
BASELINE = os.path.join(".github", "sitemap-hashes.json")
SHOW_MAX = 40   # per-page lines printed before the rest folds into a count


def page_for(loc):
    """the file a sitemap loc points at, or None when no file is there"""
    p = re.sub(r"^https?://[^/]+", "", loc.strip())
    p = p.split("#")[0].split("?")[0].lstrip("/")
    if p == "":
        return "index.html"
    if p.endswith("/"):
        cand = p + "index.html"
        return cand if os.path.isfile(cand) else None
    if os.path.isfile(p + ".html"):
        return p + ".html"
    if os.path.isfile(p):
        return p
    if os.path.isdir(p) and os.path.isfile(p + "/index.html"):
        return p + "/index.html"
    return None


def _keep_or_drop_script(m):
    # inline ld+json blocks are content, everything else a script tag carries is shared or security plumbing
    return m.group(0) if re.search(r'type\s*=\s*["\']application/ld\+json["\']', m.group(1), re.I) else ""


# the same handler harden_pages.py rewrites, so both read the thumbnail fallback the same way
THUMB_RE = re.compile(r'\sonerror="this\.onerror=null;this\.src=\'([^\'"]+)\'"')


def body_hash(text):
    """sha256 of the page with the shared and security tags removed and whitespace collapsed"""
    # harden_pages.py runs after this script and turns these handlers into data-fallback attributes, so the
    # hash reads them the hardened way and a page the laptop wrote hashes the same before and after harden
    text = THUMB_RE.sub(lambda m: ' data-fallback="' + m.group(1) + '"', text)
    # the footer is boilerplate, a link run shared by hundreds of pages, so a change to it is not a change to
    # the page. set pages carry the same run in a span inside their foot div, so that goes too, with the
    # line break ensure_tags.py puts in front of it, or adding the span would still move the hash
    text = re.sub(r"<footer\b[^>]*>.*?</footer>", "", text, flags=re.S | re.I)
    text = re.sub(r'(?:<br\s*/?>\s*)?<span class="gmx-flinks">.*?</span>', "", text, flags=re.S | re.I)
    text = re.sub(r"(<script\b[^>]*>)(.*?)</script>", _keep_or_drop_script, text, flags=re.S | re.I)
    text = re.sub(r"<link\b[^>]*>", "", text, flags=re.I)
    text = re.sub(r"<meta\b[^>]*>", "", text, flags=re.I)
    text = re.sub(r"\?v=\d+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    # a stripped tag leaves its line break behind, so the space between tags is not part of the hash either
    text = re.sub(r">\s+<", "><", text)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def set_lastmod(sm, loc, day):
    """the entry's date set to day, matched by its exact loc in either entry shape. returns (text, hits)"""
    rx = re.compile(r"(<loc>" + re.escape(loc) + r"</loc>\s*<lastmod>)[^<]*(</lastmod>)")
    return rx.subn(lambda m: m.group(1) + day + m.group(2), sm)


def load_baseline():
    try:
        with open(BASELINE, encoding="utf-8") as fh:
            d = json.load(fh)
        if not isinstance(d, dict):
            raise ValueError("not an object")
        return d
    except OSError:
        return {}
    except ValueError as e:
        # a broken baseline starts over under the first-run rule, say so instead of hiding it
        print("sitemap lastmod: baseline unreadable (%s), starting a new one, no dates move this run" % e)
        return {}


def save_baseline(d):
    with open(BASELINE, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(dict(sorted(d.items())), indent=1, ensure_ascii=False) + "\n")


def run(check):
    today = date.today().isoformat()
    # newline="" keeps the file's own line ends (the sitemap is crlf throughout), so the regex sees them and
    # the write puts back exactly what was read apart from the dates
    with open(SITEMAP, encoding="utf-8", newline="") as fh:
        sm = fh.read()
    locs = [l.strip() for l in re.findall(r"<loc>(.*?)</loc>", sm, re.S)]
    baseline = load_baseline()
    had_baseline = os.path.isfile(BASELINE)
    new_hashes = {}
    bumped, fresh, no_file, no_date, shown = 0, 0, 0, 0, 0
    for loc in locs:
        f = page_for(loc)
        if not f:
            no_file += 1
            if loc in baseline:
                new_hashes[loc] = baseline[loc]   # keep the record, preflight already fails on a loc with no file
            print("sitemap lastmod: no file for %s" % loc)
            continue
        with open(f, encoding="utf-8", errors="replace") as fh:
            h = body_hash(fh.read())
        new_hashes[loc] = h
        old = baseline.get(loc)
        if old is None:
            fresh += 1
            continue
        if old == h:
            continue
        sm, hits = set_lastmod(sm, loc, today)
        if hits == 0:
            no_date += 1
            print("sitemap lastmod: %s changed but its entry has no <lastmod>" % loc)
            continue
        bumped += 1
        if shown < SHOW_MAX:
            print("sitemap lastmod: %s%s -> %s" % ("would bump " if check else "", loc, today))
            shown += 1
    if bumped > shown:
        print("sitemap lastmod: and %d more" % (bumped - shown))
    dropped = sorted(k for k in baseline if k not in new_hashes)
    for k in dropped[:SHOW_MAX]:
        print("sitemap lastmod: %s%s left the sitemap" % ("would drop " if check else "dropped ", k))
    if len(dropped) > SHOW_MAX:
        print("sitemap lastmod: and %d more dropped" % (len(dropped) - SHOW_MAX))
    print("sitemap lastmod: %d bumped, %d new baselines, %d dropped" % (bumped, fresh, len(dropped)))
    if no_file or no_date:
        print("sitemap lastmod: %d loc(s) without a file, %d changed page(s) without a lastmod" % (no_file, no_date))
    if check:
        print("sitemap lastmod: --check, nothing written" + ("" if had_baseline else " (no baseline yet, the first write run records one and bumps nothing)"))
        return
    if bumped:
        with open(SITEMAP, "w", encoding="utf-8", newline="") as fh:
            fh.write(sm)
    if new_hashes != baseline or not had_baseline:
        save_baseline(new_hashes)


def rebaseline():
    """every hash recomputed with the current body_hash and written, no lastmod moves. for the run after a
    change to body_hash itself, so the new rule does not read as an edit to every page"""
    with open(SITEMAP, encoding="utf-8", newline="") as fh:
        sm = fh.read()
    locs = [l.strip() for l in re.findall(r"<loc>(.*?)</loc>", sm, re.S)]
    baseline = load_baseline()
    new_hashes = {}
    changed, fresh, no_file = 0, 0, 0
    for loc in locs:
        f = page_for(loc)
        if not f:
            no_file += 1
            if loc in baseline:
                new_hashes[loc] = baseline[loc]   # kept for the same reason run() keeps it
            continue
        with open(f, encoding="utf-8", errors="replace") as fh:
            h = body_hash(fh.read())
        new_hashes[loc] = h
        if loc not in baseline:
            fresh += 1
        elif baseline[loc] != h:
            changed += 1
    dropped = sum(1 for k in baseline if k not in new_hashes)
    save_baseline(new_hashes)
    print("sitemap lastmod: --rebaseline, %d hashes changed, %d new, %d dropped, %d loc(s) without a file, no dates moved"
          % (changed, fresh, dropped, no_file))


def main(argv):
    check = "--check" in argv
    try:
        # --check wins when both are passed, so a dry run never writes the baseline
        if "--rebaseline" in argv and not check:
            rebaseline()
            return 0
        run(check)
    except Exception as e:   # noqa: BLE001, a failure here must not block the site
        print("sitemap lastmod: failed, nothing changed: %s: %s" % (type(e).__name__, e))
        if not check and not os.path.isfile(BASELINE):
            # an empty baseline keeps the workflow's git add happy, the next run records the real one
            try:
                save_baseline({})
            except OSError:
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
