#!/usr/bin/env python3
"""preflight: the structural and brand checks the laptop runs before a commit, here as ci on every
push and pull request, so a broken tag cannot go live. stdlib only. read only.

FAIL blocks the push. WARN prints and passes. the checks:
  tags       every page parses with balanced tags (void tags and the ones browsers close themselves excepted)
  protected  index.html keeps the two load-bearing legacy strings
  links      every local href and src points at a file that exists (the site has no server side)
  anchors    every same-page #anchor has its id; cross-page anchors warn when the id is not in the file
  embeds     every iframe is lazy loaded and titled
  external   every target=_blank link carries rel=noopener
  fonts      only Poppins and Space Mono are loaded from Google Fonts
  jsonld     every ld+json block parses, and sameAs entries are profiles, not searches, videos or releases
  mobile     a page with its own inline style and no @media block is flagged
  json       every json file at the root parses
  sitemap    every sitemap url resolves to a file, and every indexable root page is in the sitemap
  banned     BANNED_STRINGS (env, comma separated, set as a repo secret) never appear in any tracked text
             file. the string itself is never printed, only the file and line.
  export     tracklists/_export/index.json, when the recognizer's export is there (2026-10-28, packet 10 of the
             ecosystem architecture, decision 12: the sidecar cycle): warns when the export is older than a week,
             when a sidecar it lists is missing, and for every set whose rows differ from the page, name one of
             its ID rows or are not on it. never fails: the pages are still written by hand this cycle.

usage: python3 .github/scripts/preflight.py            (the whole tree)
       python3 .github/scripts/preflight.py --diff-head (files changed since HEAD, for a local run)
"""
import glob, html, json, os, re, subprocess, sys
from datetime import date
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
AUTO = {"p", "li", "td", "th", "tr", "option", "dd", "dt"}
FONTS_OK = ("Poppins", "Space+Mono", "Space Mono")
BAD_SAMEAS = ("/explore", "?q=", "/search", "youtube.com/watch", "open.spotify.com/track", "/release/", "/track/")
fails, warns = [], []


def fail(f, msg): fails.append("%s: %s" % (f, msg))
def warn(f, msg): warns.append("%s: %s" % (f, msg))


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        if tag in AUTO and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        names = [t for t, _ in self.stack]
        if tag not in names:
            self.errors.append("line %d: </%s> closes nothing" % (self.getpos()[0], tag))
            return
        while self.stack:
            t, line = self.stack.pop()
            if t == tag:
                break
            if t not in AUTO:
                self.errors.append("line %d: <%s> opened at line %d is still open when </%s> arrives" % (self.getpos()[0], t, line, tag))

    def close(self):
        super().close()
        for t, line in self.stack:
            if t not in AUTO:
                self.errors.append("<%s> opened at line %d is never closed" % (t, line))


def pages():
    out = []
    for f in glob.glob("**/*.html", recursive=True):
        # forward slashes on every system. on windows glob returns artists\x.html, so the sitemap check saw
        # every page in a folder as unlisted and printed one warning each
        f = f.replace("\\", "/")
        if f.startswith(("node_modules/", ".github/")) or f.startswith("google"):
            continue
        out.append(f)
    return sorted(out)


def local_target(href, frm):
    """the file a local href points at, or None when it is not local. '/scan' -> scan.html, '/tracklists/' -> index."""
    h = href.split("#")[0].split("?")[0]
    if not h or h.startswith(("http://", "https://", "mailto:", "tel:", "data:", "javascript:", "//")):
        return None
    if h.startswith("/"):
        p = h.lstrip("/")
    else:
        p = os.path.normpath(os.path.join(os.path.dirname(frm), h))
    if p in ("", "."):
        return "index.html"
    if p.endswith("/"):
        return p + "index.html"
    if os.path.isfile(p):
        return p
    if os.path.exists(p + ".html"):      # pages serves /artists as artists.html even when artists/ exists
        return p + ".html"
    if os.path.isdir(p):
        return p + "/index.html"
    return p


def ids_in(text):
    return set(re.findall(r'\sid="([^"]+)"', text)) | set(re.findall(r"\sid='([^']+)'", text))


def check_page(f, text):
    b = Balance()
    try:
        b.feed(text); b.close()
    except Exception as e:
        b.errors.append("parser: %s" % e)
    for e in b.errors[:5]:
        fail(f, "tags: " + e)
    redirect = 'http-equiv="refresh"' in text
    ld = re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
    # seo basics on every page a search engine may list: a title, a description, a canonical and an
    # og:title. redirect stubs and noindex pages (crate, scan, more, legal, 404) are not listed.
    if not redirect and 'content="noindex"' not in text and not f.startswith("google"):
        for what, rx in (("title", r"<title>[^<]+</title>"), ("meta description", r'<meta name="description" content="[^"]{20,}"'),
                         ("canonical", r'<link rel="canonical" href="https://groovesmaxxing\.com/'), ("og:title", r'<meta property="og:title" content="[^"]+"')):
            if not re.search(rx, text):
                fail(f, "indexable page without a %s" % what)
    # the markup checks look at markup, not at the strings inside inline scripts that build markup later
    text = re.sub(r"<script\b[^>]*>.*?</script>", "", text, flags=re.S)
    for m in re.finditer(r'<(?:a|link|script|img|iframe|source)\b[^>]*?\s(?:href|src)="([^"]+)"', text):
        href = m.group(1)
        t = local_target(html.unescape(href), f)
        if t and not os.path.exists(t):
            fail(f, "dead local link %s" % href)
    page_ids = ids_in(text)
    for m in re.finditer(r'href="([^"]*#[^"]+)"', text):
        href = html.unescape(m.group(1)); path, frag = href.split("#", 1)
        if not path:
            if frag not in page_ids and not re.search(r'id="%s"' % re.escape(frag), text):
                fail(f, "dead anchor #%s" % frag)
            continue
        t = local_target(href, f)
        if t and os.path.exists(t) and frag not in ids_in(open(t, encoding="utf-8").read()):
            warn(f, "anchor %s not found in %s (fine when the page renders it from data)" % (href, t))
    for m in re.finditer(r"<iframe\b[^>]*>", text):
        tag = m.group(0)
        if 'loading="lazy"' not in tag:
            fail(f, "iframe without loading=\"lazy\": %s" % tag[:80])
        if "title=" not in tag:
            fail(f, "iframe without a title: %s" % tag[:80])
    for m in re.finditer(r"<a\b[^>]*>", text):
        tag = m.group(0)
        if 'target="_blank"' in tag and "noopener" not in tag:
            fail(f, "target=_blank without rel=noopener: %s" % tag[:90])
    for m in re.finditer(r'fonts\.googleapis\.com/css2\?([^"]+)', text):
        for fam in re.findall(r"family=([^&:]+)", m.group(1)):
            if fam not in FONTS_OK:
                fail(f, "font family outside the brand: %s" % fam)
    for block in ld:
        try:
            d = json.loads(block)
        except ValueError as e:
            fail(f, "ld+json does not parse: %s" % e); continue
        same = d.get("sameAs") if isinstance(d, dict) else None
        for u in (same or []):
            if any(b in u for b in BAD_SAMEAS):
                fail(f, "sameAs is not a profile: %s" % u)
    if not redirect and "<style" in text and "@media" not in text and "gmx-" not in text:
        warn(f, "inline style but no @media block, measure it at 390px")
    if f == "index.html":
        if text.count("lane-nonspoty") < 3:
            fail(f, "protected string lane-nonspoty appears %d times, 3 expected" % text.count("lane-nonspoty"))
        if "contratbandgrooves" not in text:
            fail(f, "protected string contratbandgrooves is missing")
    return redirect


def check_sitemap(page_list, redirects):
    sm = open("sitemap.xml", encoding="utf-8").read()
    locs = re.findall(r"<loc>(.*?)</loc>", sm)
    listed = set()
    for u in locs:
        p = re.sub(r"^https?://[^/]+", "", u)
        t = local_target(p or "/", "sitemap.xml")
        listed.add(t)
        if not t or not os.path.exists(t):
            fail("sitemap.xml", "url has no file: %s" % u)
    for f in page_list:
        if "/" in f and not f.startswith(("artists/", "labels/", "tracklists/", "newsletter/")):
            continue
        if f in redirects or f == "404.html":
            continue
        text = open(f, encoding="utf-8").read()
        if "noindex" in text:
            continue
        if f not in listed and f.replace("/index.html", "/") not in listed:
            warn("sitemap.xml", "indexable page not listed: %s" % f)


EXPORT_INDEX = os.path.join("tracklists", "_export", "index.json")
EXPORT_MAX_DAYS = 7


def check_export():
    """the recognizer's export next to the tracklist pages: its age, its files, and what it would change"""
    if not os.path.exists(EXPORT_INDEX):
        return
    try:
        doc = json.load(open(EXPORT_INDEX, encoding="utf-8"))
    except ValueError as e:
        fail(EXPORT_INDEX, "does not parse: %s" % e)
        return
    gen = str(doc.get("generated_at") or "")[:10]
    try:
        age = (date.today() - date.fromisoformat(gen)).days
    except ValueError:
        age = None
    if age is None:
        warn(EXPORT_INDEX, "no generated_at date")
    elif age > EXPORT_MAX_DAYS:
        warn(EXPORT_INDEX, "the export is %d days old, over %d: run tools/site_export.py --write in the recognizer repo" % (age, EXPORT_MAX_DAYS))
    for s in doc.get("sets") or []:
        f = os.path.join(os.path.dirname(EXPORT_INDEX), s.get("file") or "")
        if not s.get("file") or not os.path.exists(f):
            warn(f or EXPORT_INDEX, "sidecar missing for %s" % s.get("set_key"))
            continue
        d = s.get("diff") or {}
        parts = []
        if d.get("differs"):
            parts.append("%d differ" % d["differs"])
        if d.get("names_an_id_row"):
            parts.append("%d name an ID row" % d["names_an_id_row"])
        if d.get("new"):
            parts.append("%d not on the page" % d["new"])
        if parts:
            warn(f, "the recognizer's rows: " + ", ".join(parts) + " (read the sidecar before the next page edit)")


def check_banned():
    raw = os.environ.get("BANNED_STRINGS", "")
    needles = [n.strip() for n in re.split(r"[,\n]", raw) if n.strip()]
    if not needles:
        print("banned strings: none configured (set the BANNED_STRINGS secret to turn this on)")
        return
    files = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split()
    hits = 0
    for f in files:
        if not f.endswith((".html", ".xml", ".json", ".js", ".css", ".md", ".yml", ".txt", ".webmanifest")):
            continue
        try:
            lines = open(f, encoding="utf-8", errors="replace").read().splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines, 1):
            low = line.lower()
            for k, n in enumerate(needles):
                if n.lower() in low:
                    fail(f, "line %d carries banned string #%d" % (i, k + 1)); hits += 1
    print("banned strings: %d configured, %d hits" % (len(needles), hits))


def main(argv):
    page_list = pages()
    if "--diff-head" in argv:
        changed = subprocess.run(["git", "diff", "--name-only", "HEAD"], capture_output=True, text=True).stdout.split()
        page_list = [f for f in page_list if f in changed]
    redirects = set()
    for f in page_list:
        if check_page(f, open(f, encoding="utf-8").read()):
            redirects.add(f)
    for f in glob.glob("*.json"):
        try:
            json.load(open(f, encoding="utf-8"))
        except ValueError as e:
            fail(f, "does not parse: %s" % e)
    if "--diff-head" not in argv:
        check_sitemap(pages(), redirects)
    check_banned()
    check_export()
    for w in warns:
        print("WARN", w)
    for x in fails:
        print("FAIL", x)
    print("preflight: %d pages, %d warn, %d fail" % (len(page_list), len(warns), len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
