#!/usr/bin/env python3
"""freshness: notices the rot nothing else notices. reads .github/freshness.json, checks every row against
the files in the repo, prints a line per row, exits 1 when any row is past its fail age. runs daily in the
freshness workflow, so a red run (and the mail github sends for it) is the alert. stdlib only, read only.

tests
  newest_date   a regex with named groups (day, month, year, or end_month_or_start_month for the friday
                week line) over the page, the newest match is the page's own date
  generated     an iso timestamp under a key in a json file
  counts_agree  every spot's number equals the expected count (artist_pages = artist profiles that are not
                redirects)
"""
import datetime, glob, json, re, sys

MONTHS = {m.lower(): i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
today = datetime.date.today()


def month_num(s):
    return MONTHS.get(s.strip().lower()[:3])


def newest_date(row, text):
    names = row["groups"].split(",")
    best = None
    for m in re.finditer(row["pattern"], text):
        g = dict(zip(names, m.groups()[-len(names):])) if "end_month_or_start_month" not in names else None
        if g is None:  # friday week line: "week of sep 26 to oct 2, 2026" or "week of sep 19 to 25, 2026"
            start_m, end_m, end_d, year = m.groups()
            mon = month_num(end_m or start_m)
            d = datetime.date(int(year), mon, int(end_d)) if mon else None
        else:
            mon = month_num(g["month"])
            d = datetime.date(int(g["year"]), mon, int(g["day"])) if mon else None
        if d and (best is None or d > best):
            best = d
    return best


def main():
    cfg = json.load(open(".github/freshness.json", encoding="utf-8"))
    bad = 0
    for row in cfg["rows"]:
        rid, what = row["id"], row["what"]
        if row["test"] == "counts_agree":
            expected = None
            if row["expected"] == "artist_pages":
                expected = sum(1 for f in glob.glob("artists/*.html") if 'http-equiv="refresh"' not in open(f, encoding="utf-8").read())
            seen = {}
            for spot in row["spots"]:
                nums = re.findall(spot["pattern"], open(spot["file"], encoding="utf-8").read())
                seen[spot["file"]] = sorted(set(int(n) for n in nums))
            off = {f: v for f, v in seen.items() if v != [expected]}
            if off:
                bad += 1
                print("FAIL %s %s: %d profiles, but %s" % (rid, what, expected, ", ".join("%s says %s" % (f, v) for f, v in off.items())))
            else:
                print("ok   %s %s: %d everywhere" % (rid, what, expected))
            continue
        try:
            text = open(row["file"], encoding="utf-8").read()
        except OSError:
            bad += 1; print("FAIL %s %s: %s is missing" % (rid, what, row["file"])); continue
        if row["test"] == "generated":
            stamp = json.loads(text).get(row["key"], "")
            d = datetime.date.fromisoformat(stamp[:10]) if stamp else None
        else:
            d = newest_date(row, text)
        if not d:
            bad += 1; print("FAIL %s %s: no date found in %s" % (rid, what, row["file"])); continue
        age = (today - d).days
        if age > row["fail_days"]:
            bad += 1; print("FAIL %s %s: %s, %d days old (limit %d)" % (rid, what, d, age, row["fail_days"]))
        elif age > row["warn_days"]:
            print("WARN %s %s: %s, %d days old" % (rid, what, d, age))
        else:
            print("ok   %s %s: %s, %d days old" % (rid, what, d, age))
    print("freshness: %d rows, %d failing" % (len(cfg["rows"]), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
