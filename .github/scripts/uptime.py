#!/usr/bin/env python3
"""uptime: is the recognizer's public api answering? reads api_base from gmx-config.json, asks for / with a
short timeout, and treats any http answer below 500 as up (a 404 from a live server still means the server is
there). a connection failure, a timeout or a 5xx is a miss. the laptop's containers have sat dead for a day
before with nothing noticing. stdlib only.

four hours down, counted by the clock (2026-11-25). the old rule was two misses in a row on a four hour cron,
but github ran that cron about twice a day, so a red run really needed about a day of outage, and the 11-25
docker stall was never probed at all. now the workflow runs every 20 minutes, and a miss carries the time of
the first miss forward: the artifact is named uptime-miss-<unix time of the first miss>. each miss reads the
run before it. if that run missed too, the first-miss time comes along. if not, this miss is the first. the
run turns red, and github mails the owner, once the first miss is four hours old. a nap shorter than that
stays green with a warning, as the owner asked on 2026-11-16 after a sleeping laptop mailed him four times.
if the run before cannot be read at all, a miss fails the run, the safe side.

hand runs can test the artifact path: SIMULATE=true probes a dead address, and THRESHOLD_MIN sets the alarm
age in minutes (240 when unset)."""
import json, os, sys, time, urllib.request, urllib.error

PREFIX = "uptime-miss-"
API = "https://api.github.com"
DEAD = "http://127.0.0.1:9"   # nothing listens here on a runner, so a simulated probe always misses


def probe(base):
    """(up, line). up is False on a connection failure, a timeout or a 5xx."""
    req = urllib.request.Request(base + "/", headers={"User-Agent": "groovesmaxxing-uptime"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return True, "up: %s answered %d" % (base, r.status)
    except urllib.error.HTTPError as e:
        if e.code < 500:
            return True, "up: %s answered %d" % (base, e.code)
        return False, "DOWN: %s answered %d" % (base, e.code)
    except Exception as e:
        return False, "DOWN: %s did not answer (%s)" % (base, str(e)[:120])


def gh(path):
    req = urllib.request.Request(API + path, headers={
        "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"], "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "groovesmaxxing-uptime"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def first_miss_before():
    """("miss", t) when the run right before this one missed, t = unix time of the first miss in that streak.
    ("clear", None) when it did not miss. ("unreadable", None) when that cannot be read."""
    try:
        repo, me = os.environ["GITHUB_REPOSITORY"], int(os.environ["GITHUB_RUN_ID"])
        this = gh("/repos/%s/actions/runs/%d" % (repo, me))
        runs = gh("/repos/%s/actions/workflows/%d/runs?per_page=5" % (repo, this["workflow_id"]))["workflow_runs"]
        before = [r for r in runs if r["id"] < me]
        if not before:
            return "unreadable", None
        prev = max(before, key=lambda r: r["id"])
        for a in gh("/repos/%s/actions/runs/%d/artifacts" % (repo, prev["id"]))["artifacts"]:
            tail = a["name"][len(PREFIX):]
            if a["name"].startswith(PREFIX) and tail.isdigit():
                return "miss", int(tail)
        return "clear", None
    except Exception as e:
        print("could not read the run before this one (%s)" % str(e)[:120])
        return "unreadable", None


def age(seconds):
    m = int(seconds // 60)
    return "%dh %02dm" % (m // 60, m % 60)


def main(now=None):
    now = int(now if now is not None else time.time())
    threshold = int(os.environ.get("THRESHOLD_MIN") or 240) * 60
    if os.environ.get("SIMULATE", "").lower() == "true":
        base = DEAD
        print("simulated miss (hand run)")
    else:
        base = json.load(open("gmx-config.json", encoding="utf-8")).get("api_base", "").rstrip("/")
        if not base:
            print("no api_base in gmx-config.json")
            return 1
    up, line = probe(base)
    print(line)
    if up:
        return 0
    state, first = first_miss_before()
    if state != "miss":
        first = now
    with open("uptime-miss.txt", "w", encoding="utf-8") as f:
        f.write("%s\nfirst miss %s UTC\n" % (line, time.strftime("%Y-%m-%d %H:%M", time.gmtime(first))))
    out = os.environ.get("GITHUB_OUTPUT")
    if out:   # the workflow uploads uptime-miss.txt under this name, and the next run reads the name back
        with open(out, "a", encoding="utf-8") as f:
            f.write("artifact=%s%d\n" % (PREFIX, first))
    down = now - first
    if state == "unreadable":
        print("a miss, and the run before could not be read. failing the run.")
        return 1
    if down >= threshold:
        print("down for %s, past the %s alarm. failing the run." % (age(down), age(threshold)))
        return 1
    print("::warning::down for %s so far. the run turns red once the first miss is %s old."
          % (age(down), age(threshold)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
