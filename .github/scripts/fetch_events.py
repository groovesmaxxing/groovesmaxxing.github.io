#!/usr/bin/env python3
"""Nightly Ticketmaster Discovery sweep for the groovesmaxxing events radar.

Reads radar-artists.json, resolves each artist to a Ticketmaster attraction id
(cached in radar-attractions.json), pulls upcoming events per attraction, and
writes radar-events.json for tours.html to read. Stdlib only, no dependencies.

Design rules, decided 2026-08-01:
- runs in GitHub Actions, key comes from the TM_API_KEY repo secret
- never client side, visitors only ever read the committed static JSON
- stays under the free tier: 5 requests/second, 5000/day
- an outage never clobbers good data: on a failed sweep the old file stays
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://app.ticketmaster.com/discovery/v2"
KEY = os.environ.get("TM_API_KEY", "").strip()
ARTISTS_FILE = "radar-artists.json"
CACHE_FILE = "radar-attractions.json"
OUT_FILE = "radar-events.json"
CALL_BUDGET = 4500
SLEEP = 0.25  # 4/sec, under the 5/sec cap

# short or generic stage names collide with unrelated acts on ticketmaster, so a
# keyword search confidently returns the wrong band. these names are decided by
# hand instead of by search. None means never match this name to anything.
# rewritten every run, so fixing an entry here repairs a bad cache automatically.
OVERRIDES = {
    "Void": None,  # ticketmaster's Void is a louisiana thrash band, not the tech house one
}

calls = 0


def get(path, **params):
    global calls
    if calls >= CALL_BUDGET:
        raise RuntimeError("call budget reached")
    params["apikey"] = KEY
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    calls += 1
    time.sleep(SLEEP)
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(2)


def resolve_attraction(name):
    """Return a Ticketmaster attraction id for an exact-ish name match, else None."""
    try:
        data = get("attractions.json", keyword=name, size=5, classificationName="music")
    except Exception:
        return None
    items = (data.get("_embedded") or {}).get("attractions") or []
    low = name.lower()
    for a in items:
        if a.get("name", "").lower() == low:
            return a.get("id")
    # accept a near match only when it starts with the artist name
    for a in items:
        if a.get("name", "").lower().startswith(low) and len(a.get("name", "")) <= len(name) + 8:
            return a.get("id")
    return None


def events_for(attraction_id):
    try:
        data = get("events.json", attractionId=attraction_id, size=50, sort="date,asc")
    except Exception:
        return []
    items = (data.get("_embedded") or {}).get("events") or []
    out = []
    for e in items:
        venues = ((e.get("_embedded") or {}).get("venues")) or [{}]
        v = venues[0]
        city = (v.get("city") or {}).get("name", "")
        state = (v.get("state") or {}).get("stateCode") or (v.get("country") or {}).get("countryCode", "")
        start = (e.get("dates") or {}).get("start") or {}
        out.append({
            "date": start.get("localDate", ""),
            "event": e.get("name", ""),
            "venue": v.get("name", ""),
            "city": city,
            "region": state,
            "url": e.get("url", ""),
        })
    return out


def main():
    if not KEY:
        print("TM_API_KEY is not set. Add it as a repository secret.", file=sys.stderr)
        return 1

    artists = json.load(open(ARTISTS_FILE, encoding="utf-8"))
    try:
        cache = json.load(open(CACHE_FILE, encoding="utf-8"))
    except Exception:
        cache = {}

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # phase 1: resolve attraction ids for artists not yet cached.
    # a null id is re-checked after 30 days, a found id is permanent.
    for name in artists:
        if name in OVERRIDES:
            cache[name] = {"id": OVERRIDES[name], "checked": today}
            continue
        entry = cache.get(name)
        if entry and entry.get("id"):
            continue
        if entry and entry.get("id") is None:
            checked = entry.get("checked", "1970-01-01")
            age = (datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(checked, "%Y-%m-%d")).days
            if age < 30:
                continue
        if calls >= CALL_BUDGET - len(artists):
            break  # leave room for phase 2
        cache[name] = {"id": resolve_attraction(name), "checked": today}

    # phase 2: events for every resolved artist
    events = []
    for name in artists:
        aid = (cache.get(name) or {}).get("id")
        if not aid:
            continue
        found = events_for(aid)
        for e in found:
            e["artist"] = name
        events.extend(found)

    # ticketmaster returns a separate record per ticket type, so one festival night
    # can land four identical rows. collapse on artist + date + venue + city, and
    # drop anything that has already happened.
    seen = set()
    kept = []
    for e in events:
        if (e.get("date") or "") < today:
            continue
        key = (
            e.get("artist", ""),
            e.get("date", ""),
            (e.get("venue") or "").strip().lower(),
            (e.get("city") or "").strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        kept.append(e)
    events = kept
    with_events = len({e.get("artist", "") for e in events})

    events.sort(key=lambda e: (e.get("date") or "9999", e.get("artist", "")))

    # outage guard: never replace real data with an empty sweep
    if not events:
        try:
            prev = json.load(open(OUT_FILE, encoding="utf-8"))
            if prev.get("events"):
                print("sweep returned zero events, keeping previous data", file=sys.stderr)
                json.dump(cache, open(CACHE_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
                return 0
        except Exception:
            pass

    json.dump(cache, open(CACHE_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "artist_count": len(artists),
        "artists_with_events": with_events,
        "events": events,
    }, open(OUT_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"done: {calls} api calls, {with_events} artists with events, {len(events)} events")
    return 0


if __name__ == "__main__":
    sys.exit(main())
