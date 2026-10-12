#!/usr/bin/env python3
"""site watch (2026-10-11): is everything up, and does the Desk have a feed to read it from?

every half hour, from github's side of the internet: the live site's key pages answer and still carry what
they must, the derived files parse and are fresh, the recognizer's public api answers, and every workflow in
this repo's last run is known. the result is one json file, site-watch.json, pushed to the status branch,
where the groovesMAXXING Desk page reads it through the github connector. the uptime workflow stays the
alarm that mails the owner; this one never turns red for a down service, it records it.

a run commits only when the state changed or the last commit is older than SIX_HOURS, so the status branch
does not grow by 48 commits a day while nothing happens.

notifications (2026-10-11, G-MO: "something around notifications"). every change of state is one line in
events.json on the status branch, newest first, which the Desk shows as its notifications log. when the
state turns down or wrong, one github issue labelled site-watch opens (github mails the owner and pushes
to the github app), is rewritten while the trouble lasts, and closes itself with a comment on recovery.
a warn state (freshness warning, recognizer unknown) is logged, never an issue. stdlib only.
"""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request
from datetime import datetime, timezone

SITE = "https://groovesmaxxing.com"
UA = "groovesmaxxing-sitewatch/1 (+https://groovesmaxxing.com/more)"
TIMEOUT = 20
SIX_HOURS = 6 * 3600
OUT = os.environ.get("SITEWATCH_OUT", "status-out")
PROBES = [
    # path, must_contain (all), must_parse_json
    ("/", ["lane-nonspoty", "contratbandgrooves", "groovesMAXXING"], False),
    ("/scan", ["gmx-config.json"], False),
    ("/sets", ["set-facade"], False),
    ("/artists", ["drow"], False),
    ("/tracklists/", ["tracklist"], False),
    ("/search-index.json", [], True),
    ("/upcoming.json", ["generated"], True),
    ("/radar-events.json", ["generated"], True),
    ("/sitemap.xml", ["<urlset"], False),
    ("/sw.js", [], False),
]
NOW = datetime.now(timezone.utc)


def iso(d=None):
    return (d or NOW).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url, timeout=TIMEOUT, token=None, limit=600000):
    """status, body, milliseconds. a page body is cut at limit (the probes look for a few strings near the
    top); an api answer is read whole (limit=None), a cut json answer was the first run's crash."""
    headers = {"User-Agent": UA, "Accept": "application/json,text/html;q=0.9,*/*;q=0.5", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
        headers["Accept"] = "application/vnd.github+json"
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
            return r.status, r.read() if limit is None else r.read(limit), round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, b"", round((time.time() - t0) * 1000)
    except Exception as e:
        return 0, str(e)[:120].encode(), round((time.time() - t0) * 1000)


def probe_site():
    rows = []
    for path, needles, is_json in PROBES:
        code, body, ms = get(SITE + path)
        text = body.decode("utf-8", "replace")
        state, note = "ok", None
        if code != 200:
            state, note = "down", f"answered {code}" if code else "no answer: " + text[:80]
        else:
            missing = [n for n in needles if n not in text]
            if missing:
                state, note = "wrong", "missing " + ", ".join(missing)
            if is_json:
                try:
                    j = json.loads(text)
                    if isinstance(j, dict) and j.get("generated"):
                        note = "generated " + str(j["generated"])[:19]
                except Exception:
                    state, note = "wrong", "does not parse as json"
        rows.append({"path": path, "code": code, "ms": ms, "state": state, "note": note})
    return rows


def probe_recognizer():
    try:
        base = json.load(open("gmx-config.json", encoding="utf-8")).get("api_base", "").rstrip("/")
    except Exception:
        base = ""
    if not base:
        return {"state": "unknown", "note": "no api_base in gmx-config.json"}
    code, body, ms = get(base + "/health")
    if code == 200:
        detail = None
        try:
            detail = json.loads(body.decode("utf-8", "replace"))
        except Exception:
            pass
        return {"state": "up", "code": code, "ms": ms, "health": detail if isinstance(detail, dict) else None}
    code2, body2, ms2 = get(base + "/")
    if 0 < code2 < 500:
        return {"state": "up", "code": code2, "ms": ms2, "note": "/health answered %d, / answered %d" % (code, code2)}
    return {"state": "down", "code": code2, "ms": ms2, "note": ("answered %d" % code2) if code2 else "no answer: " + body2.decode("utf-8", "replace")[:80]}


def probe_workflows():
    """the last run of every workflow in this repo, from the actions api with the run's own token."""
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        return {"state": "unknown", "note": "no GITHUB_TOKEN", "runs": []}
    code, body, _ = get(f"https://api.github.com/repos/{repo}/actions/runs?per_page=60", token=token, limit=None)
    if code != 200:
        return {"state": "unknown", "note": "actions api answered %d" % code, "runs": []}
    try:
        runs_in = json.loads(body).get("workflow_runs", [])
    except Exception as e:
        return {"state": "unknown", "note": "actions api answer did not parse: %s" % str(e)[:80], "runs": []}
    latest = {}
    for r in runs_in:
        name = r.get("name") or r.get("path")
        if name == "site watch":
            continue   # this run, always in progress while it looks
        if name not in latest:
            latest[name] = {"name": name, "status": r.get("status"), "conclusion": r.get("conclusion"), "event": r.get("event"),
                            "branch": r.get("head_branch"), "at": r.get("updated_at"), "url": r.get("html_url"),
                            "state": "ok" if r.get("conclusion") == "success" else "running" if r.get("status") in ("queued", "in_progress", "waiting") else
                                     "skipped" if r.get("conclusion") in ("skipped", "cancelled") else "failed"}
    runs = sorted(latest.values(), key=lambda x: x["name"])
    failed = [x["name"] for x in runs if x["state"] == "failed"]
    return {"state": "failed" if failed else "ok", "failed": failed, "runs": runs}


def probe_freshness():
    """the freshness rows against this checkout (main is what the live site serves)."""
    try:
        p = subprocess.run([sys.executable, ".github/scripts/freshness.py"], capture_output=True, text=True, timeout=120)
        lines = [l for l in p.stdout.splitlines() if l.strip()]
        rows = []
        for l in lines:
            m = re.match(r"^(ok|WARN|FAIL)\s+(F-\d+)\s+(.*)$", l)
            if m:
                rows.append({"state": {"ok": "ok", "WARN": "warn", "FAIL": "fail"}[m.group(1)], "id": m.group(2), "text": m.group(3)})
        return {"state": "fail" if p.returncode else ("warn" if any(r["state"] == "warn" for r in rows) else "ok"), "rows": rows}
    except Exception as e:
        return {"state": "unknown", "note": str(e)[:120], "rows": []}


EVENTS_MAX = 300


def readings(r):
    """every named thing with a state, as {name: (state, detail)}, so two reports can be diffed."""
    out = {}
    for x in r.get("site", []):
        out["page " + x["path"]] = (x["state"], x.get("note") or "")
    rec = r.get("recognizer") or {}
    out["recognizer"] = (rec.get("state", "unknown"), rec.get("note") or (("%d ms" % rec["ms"]) if rec.get("ms") is not None else ""))
    for x in (r.get("workflows") or {}).get("runs", []):
        if x["state"] in ("ok", "failed"):
            out["workflow " + x["name"]] = (x["state"], x.get("url") or "")
    for x in (r.get("freshness") or {}).get("rows", []):
        out["freshness " + x["id"]] = (x["state"], x.get("text") or "")
    return out


def log_events(prev, report):
    """events.json: one line per reading that changed state since the last report, newest first,
    capped. the first report ever logs nothing but its own arrival."""
    try:
        log = json.load(open(os.path.join(OUT, "events.json"), encoding="utf-8"))
        rows = log.get("events", []) if isinstance(log, dict) else []
    except Exception:
        rows = []
    before, now_r = readings(prev) if prev else {}, readings(report)
    new = []
    if not prev:
        new.append({"at": iso(), "what": "site watch", "from": None, "to": report["state"], "detail": "first report"})
    else:
        for name, (state, detail) in now_r.items():
            was = before.get(name)
            if was is None or was[0] == state:
                continue
            new.append({"at": iso(), "what": name, "from": was[0], "to": state, "detail": detail[:200]})
        if prev.get("state") != report["state"]:
            new.append({"at": iso(), "what": "site watch", "from": prev.get("state"), "to": report["state"], "detail": report["summary"][:200]})
    rows = (new + rows)[:EVENTS_MAX]
    json.dump({"generated": iso(), "events": rows}, open(os.path.join(OUT, "events.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for e in new:
        print("  event: %s %s -> %s  %s" % (e["what"], e["from"], e["to"], e["detail"]))
    return {"changed": bool(new), "new": new, "all": rows}


def issue(report, events):
    """one open issue, label site-watch: opened when the state is down or wrong, rewritten while it
    stays so, closed with a comment when the state is ok or warn again. github's own mail and app
    push on an issue are the alert; nothing here sends anything itself."""
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

    code, open_issues = call("/issues?state=open&labels=site-watch&per_page=5")
    current = (open_issues or [None])[0] if code == 200 else None
    bad = report["state"] in ("down", "wrong")
    if not bad:
        if current:
            call(f"/issues/{current['number']}/comments", "POST", {"body": "back to %s at %s: %s. closing." % (report["state"], report["generated"], report["summary"])})
            call(f"/issues/{current['number']}", "PATCH", {"state": "closed", "state_reason": "completed"})
        return
    lines = ["**%s** at %s. this issue is rewritten by the site watch every half hour while it lasts and closes itself on recovery." % (report["summary"], report["generated"]), ""]
    for x in report.get("site", []):
        if x["state"] != "ok":
            lines.append("- page %s: %s (%s)" % (x["path"], x["state"], x.get("note") or x.get("code")))
    rec = report.get("recognizer") or {}
    if rec.get("state") == "down":
        lines.append("- recognizer: down, %s" % (rec.get("note") or ""))
    for x in (report.get("workflows") or {}).get("runs", []):
        if x["state"] == "failed":
            lines.append("- workflow %s failed: %s" % (x["name"], x.get("url") or ""))
    for x in (report.get("freshness") or {}).get("rows", []):
        if x["state"] == "fail":
            lines.append("- freshness %s: %s" % (x["id"], x.get("text") or ""))
    if events["new"]:
        lines += ["", "### what changed this run", ""] + ["- %s: %s -> %s %s" % (e["what"], e["from"], e["to"], e["detail"]) for e in events["new"]]
    lines += ["", "the feed: `site-watch.json` and `events.json` on the `status` branch. the Desk shows both."]
    title = "site watch: %s" % report["summary"][:80]
    body = "\n".join(lines)
    if current:
        if current.get("title") != title or (current.get("body") or "") != body:
            call(f"/issues/{current['number']}", "PATCH", {"title": title, "body": body})
    else:
        call("/issues", "POST", {"title": title, "body": body, "labels": ["site-watch"]})


def main():
    os.makedirs(OUT, exist_ok=True)
    offline = "--offline" in sys.argv
    def safely(name, fn, fallback):
        """one probe failing is a reading, not a crash: the others still land in the feed."""
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            print("probe %s failed: %s: %s" % (name, type(e).__name__, str(e)[:160]))
            return dict(fallback, note="probe failed: %s" % type(e).__name__) if isinstance(fallback, dict) else fallback
    report = {"generated": iso(),
              "site": [] if offline else safely("site", probe_site, []),
              "recognizer": {"state": "unknown"} if offline else safely("recognizer", probe_recognizer, {"state": "unknown"}),
              "workflows": safely("workflows", probe_workflows, {"state": "unknown", "runs": []}) if not offline else {"state": "unknown", "runs": []},
              "freshness": safely("freshness", probe_freshness, {"state": "unknown", "rows": []})}
    site_states = {r["state"] for r in report["site"]}
    worst = "down" if "down" in site_states or report["recognizer"]["state"] == "down" else \
            "wrong" if "wrong" in site_states or report["freshness"]["state"] == "fail" or report["workflows"]["state"] == "failed" else \
            "warn" if report["freshness"]["state"] == "warn" or report["recognizer"]["state"] == "unknown" else "ok"
    report["state"] = worst
    bits = []
    down = [r["path"] for r in report["site"] if r["state"] == "down"]
    wrong = [r["path"] for r in report["site"] if r["state"] == "wrong"]
    if down: bits.append("site pages down: " + ", ".join(down))
    if wrong: bits.append("site pages wrong: " + ", ".join(wrong))
    bits.append("recognizer " + report["recognizer"]["state"])
    if report["workflows"].get("failed"): bits.append("failed workflows: " + ", ".join(report["workflows"]["failed"]))
    if report["freshness"]["state"] != "ok": bits.append("freshness " + report["freshness"]["state"])
    report["summary"] = "; ".join(bits) if bits else "all up"
    prev = {}
    try:
        prev = json.load(open(os.path.join(OUT, "site-watch.json"), encoding="utf-8"))
    except Exception:
        pass

    def shape(r):
        return json.dumps({"state": r.get("state"), "summary": r.get("summary"),
                           "site": [(x["path"], x["state"]) for x in r.get("site", [])],
                           "rec": r.get("recognizer", {}).get("state"),
                           "wf": [(x["name"], x["state"]) for x in r.get("workflows", {}).get("runs", [])],
                           "fresh": [(x["id"], x["state"]) for x in r.get("freshness", {}).get("rows", [])]}, sort_keys=True)
    try:
        prev_age = (NOW - datetime.strptime(prev.get("generated", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds()
    except Exception:
        prev_age = 1e9
    publish = shape(prev) != shape(report) or prev_age >= SIX_HOURS
    events = log_events(prev, report)
    if events["changed"]:
        publish = True
    issue(report, events)
    json.dump(report, open(os.path.join(OUT, "site-watch.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    flag = os.path.join(OUT, ".publish")
    if publish:
        open(flag, "w").write("1")
    elif os.path.exists(flag):
        os.remove(flag)
    print("site watch: %s (%s)%s" % (report["state"], report["summary"], "" if publish else ", unchanged, not committing"))
    for r in report["site"]:
        print("  %-20s %s %4d ms  %s" % (r["path"], r["state"], r["ms"], r["note"] or ""))
    print("  recognizer:", report["recognizer"])
    for r in report["workflows"].get("runs", []):
        print("  workflow %-24s %s  %s" % (r["name"], r["state"], r["at"]))
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        open(out, "a").write("publish=%s\n" % ("true" if publish else "false"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
