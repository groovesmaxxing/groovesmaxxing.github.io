#!/usr/bin/env python3
"""uptime: is the recognizer's public api answering? reads api_base from gmx-config.json, asks for / with a
short timeout, and treats any http answer below 500 as up (a 404 from a live server still means the server is
there). a connection failure, a timeout or a 5xx is a miss. the laptop's containers have sat dead for a day
before with nothing noticing. stdlib only.

two misses in a row (2026-11-16): one miss alone no longer turns the run red, because the laptop asleep for an
afternoon mailed the owner four times in two days. a first miss writes uptime-miss.txt, the workflow uploads it
as an artifact named uptime-miss, and the run stays green with a warning. the next run that also misses looks
at the run before it, finds that artifact, and fails, and github mails the owner about a red scheduled run.
every miss after that fails too, until an answer clears it. so the alarm now means: no answer on two probes
four hours apart. if the run before cannot be read at all, a miss fails the run, the safe side."""
import json, os, sys, urllib.request, urllib.error

MARK = "uptime-miss"
API = "https://api.github.com"


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


def previous_run_missed():
    """True when the run of this workflow right before this one left the uptime-miss artifact.
    None when that cannot be read (no token, the api did not answer, no earlier run)."""
    try:
        repo, me = os.environ["GITHUB_REPOSITORY"], int(os.environ["GITHUB_RUN_ID"])
        this = gh("/repos/%s/actions/runs/%d" % (repo, me))
        runs = gh("/repos/%s/actions/workflows/%d/runs?per_page=5" % (repo, this["workflow_id"]))["workflow_runs"]
        before = [r for r in runs if r["id"] < me]
        if not before:
            return None
        prev = max(before, key=lambda r: r["id"])
        arts = gh("/repos/%s/actions/runs/%d/artifacts" % (repo, prev["id"]))["artifacts"]
        return any(a["name"] == MARK for a in arts)
    except Exception as e:
        print("could not read the run before this one (%s)" % str(e)[:120])
        return None


def main():
    base = json.load(open("gmx-config.json", encoding="utf-8")).get("api_base", "").rstrip("/")
    if not base:
        print("no api_base in gmx-config.json")
        return 1
    up, line = probe(base)
    print(line)
    if up:
        return 0
    with open(MARK + ".txt", "w", encoding="utf-8") as f:   # the workflow uploads this, the next run looks for it
        f.write(line + "\n")
    missed = previous_run_missed()
    if missed is False:
        print("::warning::first miss, the run stays green. the next probe fails if it misses too.")
        return 0
    print("second miss in a row, failing the run." if missed else "a miss, and the run before could not be read. failing the run.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
