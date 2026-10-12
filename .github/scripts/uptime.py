#!/usr/bin/env python3
"""uptime: is the recognizer's public api answering? reads api_base from gmx-config.json, asks for / with a
short timeout, and treats any http answer below 500 as up (a 404 from a live server still means the server is
there). a connection failure, a timeout or a 5xx fails the run, and github mails the owner about a red
scheduled run. the laptop's containers have sat dead for a day before with nothing noticing. stdlib only."""
import json, sys, urllib.request, urllib.error

base = json.load(open("gmx-config.json", encoding="utf-8")).get("api_base", "").rstrip("/")
if not base:
    print("no api_base in gmx-config.json"); sys.exit(1)
req = urllib.request.Request(base + "/", headers={"User-Agent": "groovesmaxxing-uptime"})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print("up: %s answered %d" % (base, r.status)); sys.exit(0)
except urllib.error.HTTPError as e:
    if e.code < 500:
        print("up: %s answered %d" % (base, e.code)); sys.exit(0)
    print("DOWN: %s answered %d" % (base, e.code)); sys.exit(1)
except Exception as e:
    print("DOWN: %s did not answer (%s)" % (base, str(e)[:120])); sys.exit(1)
