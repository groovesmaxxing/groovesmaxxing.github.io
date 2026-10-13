#!/usr/bin/env python3
"""link watch (2026-10-11): do the site's links still go where they say?

preflight already proves every local href points at a file. this watches the rest, the links that rot on
someone else's server: a video pulled from youtube, a spotify page gone, a soundcloud account renamed, a
beatport or ra page that 404s. and it checks the one thing a status code cannot: that a link still points
at the right thing, by asking youtube, spotify and soundcloud for the title behind the link (their oembed
endpoints, no key needed) and comparing it with what the page says it is.

how it works
  inventory   every <a href>, <iframe src> and data-yt on every page, with the pages that carry it
  anchors     every #fragment link, same page or another, must name an id on the target page (offline, exact)
  external    checked with a rolling cache so a run touches at most LINKWATCH_BUDGET links, the ones not
              checked for RECHECK_DAYS first, so the whole site cycles through in about a week
  verdicts    broken = 404 or 410 (the thing is gone). moved = the link lands on another site. differs = the
              title behind the link does not read like the page's name for it. unknown = a wall answered
              (403, 429, 5xx, a timeout): logged, never called broken, rechecked sooner
  report      link-watch.json and link-watch-cache.json, written to the status branch by the workflow, and
              one github issue (label link-watch) opened or updated when anything is broken, closed when not

hosts whose answers say nothing are skipped: instagram and tiktok answer 200 behind a login wall, x needs a
browser, the font hosts never break. soundcloud search links always resolve. stdlib only.
"""
import concurrent.futures, glob, html, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

SITE = "https://groovesmaxxing.com"
UA = "groovesmaxxing-linkwatch/1 (+https://groovesmaxxing.com/more)"
RECHECK_DAYS = int(os.environ.get("LINKWATCH_RECHECK_DAYS", "10"))
UNKNOWN_RECHECK_DAYS = 2
BUDGET = int(os.environ.get("LINKWATCH_BUDGET", "700"))
WORKERS = 8
TIMEOUT = 20
SKIP_HOSTS = {"fonts.googleapis.com", "fonts.gstatic.com", "www.instagram.com", "instagram.com", "www.tiktok.com",
              "tiktok.com", "x.com", "twitter.com", "www.facebook.com", "facebook.com", "www.youtube-nocookie.com",
              "w.soundcloud.com", "groovesmaxxing.com", "www.groovesmaxxing.com"}
# answers checked by hand and decided fine. each one is accepted only while it reads exactly as decided,
# so a new rename or a new destination gets flagged again.
# moved: the artist's own domain forwarding to their link in bio page. url -> the host it lands on.
ACCEPTED_MOVES = {
    "https://alokmusic.com/": "alok.komi.io",
    "https://bakermatmusic.com": "bakermat.hq.fan",
    "https://fancyinc.com.br/": "fancyinc.komi.io",
    "https://genesimusic.com": "genesi.komi.io",
    "https://www.dontblink.io": "dontblink.komi.io",
    "https://noshamusica.com": "noshamusica.wordpress.com",
}
# reads differently: url -> the title behind it that the page keeps its own name against.
ACCEPTED_TITLES = {
    "https://open.spotify.com/artist/4sITB0d3Uz43DKFElXk6xo": "Gabrl",  # spotify reads gabrl, the site keeps gabe cline, owner's call 2026-10-13
    # max styler's ep, linked on its first and last track names ("Body Shake" to "Templo Disko"), checked 2026-10-13
    "https://open.spotify.com/album/0620dMBIpjeI61scHdp9w2": "I Don't Think I Can Stop",
}

PAGES = sorted(glob.glob("*.html") + glob.glob("artists/*.html") + glob.glob("labels/*.html") + glob.glob("tracklists/*.html"))
OUT = os.environ.get("LINKWATCH_OUT", "status-out")
NOW = datetime.now(timezone.utc)


def iso(d=None):
    return (d or NOW).strftime("%Y-%m-%dT%H:%M:%SZ")


def age_days(stamp):
    try:
        return (NOW - datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 86400
    except Exception:
        return 1e9


def text_of(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def fold(s):
    """accents off, so Impératrice reads as Imperatrice and Bákayan as Bakayan (2026-10-13). without it an
    accented letter splits the word in two and a right link reads as a different title."""
    return "".join(c for c in unicodedata.normalize("NFKD", html.unescape(s or "")) if not unicodedata.combining(c))


def tokens(s):
    s = fold(s).lower()
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)
    return {t for t in re.findall(r"[a-z0-9]+", s) if len(t) > 1 and t not in {"the", "at", "and", "live", "set", "mix", "dj", "feat", "ft", "of", "in", "from", "official", "video", "audio"}}


def reads_like(a, b):
    """does title a read like name b? one contains the other, or they share a third of the rarer one's words."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return True
    la, lb = re.sub(r"[^a-z0-9]+", "", fold(a).lower()), re.sub(r"[^a-z0-9]+", "", fold(b).lower())
    if la and lb and (la in lb or lb in la):
        return True
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.34


# ---- inventory -------------------------------------------------------------------------------------------

YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_id(url):
    u = urllib.parse.urlparse(url)
    host = u.netloc.lower()
    if host in ("youtu.be",):
        vid = u.path.strip("/").split("/")[0]
    elif host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if u.path.startswith("/watch"):
            vid = urllib.parse.parse_qs(u.query).get("v", [""])[0]
        elif u.path.startswith(("/embed/", "/shorts/", "/live/", "/v/")):
            vid = u.path.split("/")[2] if len(u.path.split("/")) > 2 else ""
        else:
            return None
    else:
        return None
    return vid if YT_ID.match(vid or "") else None


def classify(url):
    """(kind, key): one key per thing we ask about, so forty timestamped links into one video are one ask."""
    u = urllib.parse.urlparse(url)
    host = u.netloc.lower()
    vid = youtube_id(url)
    if vid:
        return "youtube", vid
    if host == "open.spotify.com":
        m = re.match(r"^/(?:intl-[a-z]{2}/)?(artist|track|album|playlist|show|episode)/([A-Za-z0-9]{22})", u.path)
        if m:
            return "spotify", f"{m.group(1)}/{m.group(2)}"
        return "other", url
    if host in ("soundcloud.com", "www.soundcloud.com", "on.soundcloud.com", "m.soundcloud.com"):
        if u.path.startswith("/search"):
            return "skip", url
        return "soundcloud", "https://soundcloud.com" + u.path.rstrip("/")
    if host in SKIP_HOSTS or not host:
        return "skip", url
    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        return "other", url   # a channel or playlist link, checked by status only
    return "other", url.split("#")[0]


def inventory():
    """links[key] = {kind, url, pages:set, names:set}; anchors = [(page, href, target_file, fragment)]"""
    links, anchors, titles, ids = {}, [], {}, {}
    for page in PAGES:
        t = open(page, encoding="utf-8").read()
        if "http-equiv" in t[:600] and "refresh" in t[:600]:
            continue   # a redirect stub
        m = re.search(r"<title>(.*?)</title>", t, re.S)
        titles[page] = text_of(m.group(1)) if m else page
        ids[page] = set(re.findall(r'\sid="([^"]+)"', t)) | set(re.findall(r'\sname="([^"]+)"', t))
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
        h1 = text_of(h1.group(1)) if h1 else ""
        for m in re.finditer(r'<(a|iframe|button)\b([^>]*)>(.*?)</\1>', t, re.S | re.I):
            tag, attrs, inner = m.group(1).lower(), m.group(2), m.group(3)
            href = re.search(r'\s(?:href|src)="([^"]+)"', attrs)
            dyt = re.search(r'\sdata-yt="([^"]+)"', attrs)
            dtitle = re.search(r'\sdata-title="([^"]*)"', attrs)
            atitle = re.search(r'\s(?:title|aria-label)="([^"]*)"', attrs)
            url = html.unescape(href.group(1)) if href else None
            if dyt and YT_ID.match(dyt.group(1)):
                url = "https://www.youtube.com/watch?v=" + dyt.group(1)
            if not url:
                continue
            if url.startswith("#") or (not url.startswith(("http://", "https://")) and "#" in url):
                frag = url.split("#", 1)[1]
                target = page if url.startswith("#") else local_file(url.split("#")[0], page)
                if frag:
                    anchors.append((page, url, target, frag))
                continue
            if not url.startswith(("http://", "https://")):
                continue
            kind, key = classify(url)
            if kind == "skip":
                continue
            row = links.setdefault(key, {"kind": kind, "url": url if kind == "other" else None, "pages": set(), "names": set()})
            row["pages"].add(page)
            if kind == "other":
                row["url"] = url
            elif kind == "youtube":
                row["url"] = "https://www.youtube.com/watch?v=" + key
            elif kind == "spotify":
                row["url"] = "https://open.spotify.com/" + key
            elif kind == "soundcloud":
                row["url"] = key
            # the page's own name for the thing, for the title check
            name = (dtitle.group(1) if dtitle else None) or (text_of(inner) if tag == "a" and 3 < len(text_of(inner)) < 120 and not re.match(r"^\d+:\d\d", text_of(inner)) else None)
            if tag == "iframe" and kind == "youtube":
                name = titles[page].split(" · ")[0].split(" | ")[0]
            if kind == "spotify" and key.startswith("artist/") and page.startswith("artists/") and h1:
                name = h1
            if name and len(tokens(name)) >= 2:
                row["names"].add(html.unescape(name))
    return links, anchors, ids


def local_file(href, frm):
    h = href.split("?")[0]
    if not h:
        return frm
    path = h if h.startswith("/") else "/" + os.path.normpath(os.path.join(os.path.dirname(frm), h)).lstrip("./")
    path = path.lstrip("/")
    if path.endswith("/") or path == "":
        path += "index.html"
    if not path.endswith(".html") and not re.search(r"\.[a-z0-9]{2,5}$", path):
        path += ".html"
    return path


def check_anchors(anchors, ids):
    bad = []
    for page, href, target, frag in anchors:
        known = ids.get(target)
        if known is None:
            if os.path.isfile(target):
                t = open(target, encoding="utf-8").read()
                known = ids[target] = set(re.findall(r'\sid="([^"]+)"', t)) | set(re.findall(r'\sname="([^"]+)"', t))
            else:
                continue   # preflight owns missing files
        if frag not in known and not (frag.startswith("i-") and target == page and frag in open(page, encoding="utf-8").read()):
            bad.append({"page": "/" + page, "href": href})
    return bad


# ---- the asks --------------------------------------------------------------------------------------------

def fetch(url, method="GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "application/json,text/html;q=0.9,*/*;q=0.5", "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(200000) if method == "GET" else b""
            return r.status, r.geturl(), body
    except urllib.error.HTTPError as e:
        return e.code, e.geturl() or url, b""
    except Exception as e:
        return 0, url, str(e)[:120].encode()


def site_of(netloc):
    """the registrable site behind a host: bakermat.bandcamp.com and bandcamp.com are one site, so a
    subdomain folding into its apex is not a move. two labels, three under the usual second-level ccTLDs."""
    host = (netloc or "").lower().split(":")[0]
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("co", "com", "org", "net", "ac", "gov") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def oembed(endpoint, target):
    code, _final, body = fetch(endpoint + urllib.parse.quote(target, safe=""))
    title = None
    if code == 200:
        try:
            title = json.loads(body.decode("utf-8", "replace")).get("title")
        except Exception:
            title = None
    return code, title


def ask(key, row):
    kind, url = row["kind"], row["url"]
    rec = {"kind": kind, "url": url, "checked": iso(), "code": 0, "title": None, "final": None, "state": "unknown", "note": None}
    if kind == "youtube":
        code, title = oembed("https://www.youtube.com/oembed?format=json&url=", url)
        rec["code"], rec["title"] = code, title
        rec["state"] = "ok" if code == 200 else "broken" if code == 404 else "unknown"
        if code == 401:
            rec["note"] = "private, or embedding is off"
    elif kind == "spotify":
        code, title = oembed("https://open.spotify.com/oembed?url=", url)
        rec["code"], rec["title"] = code, title
        rec["state"] = "ok" if code == 200 else "broken" if code == 404 else "unknown"
    elif kind == "soundcloud":
        code, title = oembed("https://soundcloud.com/oembed?format=json&url=", url)
        rec["code"], rec["title"] = code, title
        rec["state"] = "ok" if code == 200 else "broken" if code == 404 else "unknown"
        if code == 403:
            rec["note"] = "private or geo-blocked, or a wall"
    else:
        code, final, body = fetch(url, "HEAD")
        if code in (0, 403, 405, 429, 501) or code >= 500:
            code, final, body = fetch(url, "GET")
        rec["code"], rec["final"] = code, final if final != url else None
        if code in (404, 410):
            rec["state"] = "broken"
        elif 200 <= code < 400:
            rec["state"] = "ok"
            h0, h1 = site_of(urllib.parse.urlparse(url).netloc), site_of(urllib.parse.urlparse(final).netloc)
            if h1 and h0 != h1:
                rec["state"], rec["note"] = "moved", f"lands on {urllib.parse.urlparse(final).netloc.lower()}"
            elif final and final != url and urllib.parse.urlparse(final).path in ("", "/") and urllib.parse.urlparse(url).path not in ("", "/"):
                rec["state"], rec["note"] = "moved", "lands on the home page"
        else:
            rec["state"] = "unknown"
            rec["note"] = {403: "a wall (403)", 429: "rate limited", 0: "no answer: " + body.decode("utf-8", "replace")[:80]}.get(code, f"answered {code}")
    return key, rec


def due(cache, keys):
    """the keys to ask this run: never checked first, then the oldest, within the budget."""
    def score(k):
        c = cache.get(k)
        if not c:
            return -1e9
        return -age_days(c.get("checked", ""))
    pending = []
    for k in keys:
        c = cache.get(k)
        if not c:
            pending.append(k); continue
        limit = UNKNOWN_RECHECK_DAYS if c.get("state") in ("unknown", "broken", "moved") else RECHECK_DAYS
        if age_days(c.get("checked", "")) >= limit:
            pending.append(k)
    pending.sort(key=score)
    return pending[:BUDGET]


# ---- the report --------------------------------------------------------------------------------------------

def load_json(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return default


def main(offline=False):
    os.makedirs(OUT, exist_ok=True)
    links, anchors, ids = inventory()
    anchors_bad = check_anchors(anchors, ids)
    prev = load_json(os.path.join(OUT, "link-watch.json"), {})
    cache = load_json(os.path.join(OUT, "link-watch-cache.json"), {})
    cache = {k: v for k, v in cache.items() if k in links}   # a link the pages dropped leaves the cache
    asked = []
    if not offline:
        todo = due(cache, list(links))
        t0 = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            for key, rec in ex.map(lambda k: ask(k, links[k]), todo):
                cache[key] = rec
                asked.append(key)
        print("asked %d of %d links in %.0fs" % (len(asked), len(links), time.time() - t0))
    first_seen = {r["url"]: r.get("first_seen") for r in prev.get("broken", []) + prev.get("moved", []) + prev.get("differs", [])}

    def entry(key, rec, note=None):
        row = links[key]
        pages = sorted("/" + p[:-5] if p.endswith(".html") else "/" + p for p in row["pages"])
        return {"url": rec["url"], "kind": rec["kind"], "code": rec["code"], "note": note or rec.get("note"), "title": rec.get("title"),
                "pages": pages[:8], "page_count": len(pages), "checked": rec["checked"], "first_seen": first_seen.get(rec["url"]) or iso()}

    broken, moved, differs, unknown = [], [], [], 0
    for key, rec in cache.items():
        if rec["state"] == "broken":
            broken.append(entry(key, rec))
        elif rec["state"] == "moved":
            if rec.get("note") != "lands on " + ACCEPTED_MOVES.get(rec["url"], ""):
                moved.append(entry(key, rec))
        elif rec["state"] == "unknown":
            unknown += 1
        elif rec["state"] == "ok" and rec.get("title") and links[key]["names"]:
            names = links[key]["names"]
            if not any(reads_like(rec["title"], n) for n in names) and ACCEPTED_TITLES.get(rec["url"]) != rec["title"]:
                differs.append(entry(key, rec, "page says: " + " | ".join(sorted(names))[:160]))
    broken.sort(key=lambda r: (-r["page_count"], r["url"]))
    moved.sort(key=lambda r: (-r["page_count"], r["url"]))
    differs.sort(key=lambda r: (-r["page_count"], r["url"]))
    fresh = sum(1 for r in cache.values() if age_days(r.get("checked", "")) < RECHECK_DAYS)
    by_kind = {}
    for r in links.values():
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
    report = {
        "generated": iso(), "pages": len(ids), "links": {"checkable": len(links), "by_kind": by_kind, "checked_within_recheck": fresh,
                                                        "asked_this_run": len(asked), "unknown": unknown, "budget": BUDGET, "recheck_days": RECHECK_DAYS},
        "broken": broken, "moved": moved, "differs": differs[:200], "anchors_broken": anchors_bad,
        "summary": "%d broken, %d moved, %d read differently, %d broken anchors, %d of %d links checked in the last %d days" % (
            len(broken), len(moved), len(differs), len(anchors_bad), fresh, len(links), RECHECK_DAYS),
    }
    json.dump(report, open(os.path.join(OUT, "link-watch.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    json.dump(cache, open(os.path.join(OUT, "link-watch-cache.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("link watch:", report["summary"])
    for r in broken[:40]:
        print("  BROKEN %s (%s) on %d page(s), first seen %s" % (r["url"], r["code"], r["page_count"], r["first_seen"][:10]))
    for r in moved[:20]:
        print("  MOVED  %s: %s" % (r["url"], r["note"]))
    for r in anchors_bad[:20]:
        print("  ANCHOR %s -> %s" % (r["page"], r["href"]))
    step = os.environ.get("GITHUB_STEP_SUMMARY")
    if step:
        with open(step, "a", encoding="utf-8") as f:
            f.write("## link watch\n\n%s\n\n" % report["summary"])
            for r in broken[:40]:
                f.write("- broken: %s (%s) on %d page(s), since %s\n" % (r["url"], r["code"], r["page_count"], r["first_seen"][:10]))
            for r in moved[:20]:
                f.write("- moved: %s, %s\n" % (r["url"], r["note"]))
            for r in differs[:20]:
                f.write("- reads differently: %s is \"%s\", %s\n" % (r["url"], r["title"], r["note"]))
            for r in anchors_bad[:20]:
                f.write("- anchor: %s -> %s\n" % (r["page"], r["href"]))
    issue(report)
    return 0


def issue(report):
    """one open issue, label link-watch, kept current: opened when something is broken, edited while it stays
    broken, closed when the list is empty. the owner gets github's mail on open, nothing else."""
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        return
    api = f"https://api.github.com/repos/{repo}"

    def call(path, method="GET", body=None):
        req = urllib.request.Request(api + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
                                              "User-Agent": UA, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, None

    code, open_issues = call("/issues?state=open&labels=link-watch&per_page=5")
    current = (open_issues or [None])[0] if code == 200 else None
    rows = report["broken"] + report["moved"] + report["anchors_broken"]
    if not rows:
        if current:
            call(f"/issues/{current['number']}", "PATCH", {"state": "closed", "state_reason": "completed"})
            call(f"/issues/{current['number']}/comments", "POST", {"body": "nothing broken on the %s run. closing." % report["generated"][:10]})
        return
    lines = ["%s. this issue is rewritten by the link watch on every run and closes itself when the list is empty." % report["summary"], ""]
    if report["broken"]:
        lines += ["### broken (the thing is gone)", ""] + ["- %s (%s), on %d page%s, since %s: %s" % (
            r["url"], r["code"], r["page_count"], "" if r["page_count"] == 1 else "s", r["first_seen"][:10], ", ".join(r["pages"][:4])) for r in report["broken"][:60]] + [""]
    if report["moved"]:
        lines += ["### moved (the link lands somewhere else)", ""] + ["- %s: %s, on %s" % (r["url"], r["note"], ", ".join(r["pages"][:3])) for r in report["moved"][:30]] + [""]
    if report["differs"]:
        lines += ["### reads differently (the title behind the link is not what the page calls it)", ""] + [
            "- %s is \"%s\", %s" % (r["url"], r["title"], r["note"]) for r in report["differs"][:30]] + [""]
    if report["anchors_broken"]:
        lines += ["### anchors that name nothing", ""] + ["- %s -> %s" % (r["page"], r["href"]) for r in report["anchors_broken"][:30]] + [""]
    lines += ["full report: `link-watch.json` on the `status` branch."]
    title = "link watch: %d broken, %d moved" % (len(report["broken"]), len(report["moved"]))
    body = "\n".join(lines)
    if current:
        call(f"/issues/{current['number']}", "PATCH", {"title": title, "body": body})
    else:
        call("/issues", "POST", {"title": title, "body": body, "labels": ["link-watch"]})


if __name__ == "__main__":
    sys.exit(main(offline="--offline" in sys.argv))
