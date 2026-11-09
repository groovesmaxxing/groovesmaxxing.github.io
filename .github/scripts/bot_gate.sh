#!/usr/bin/env bash
# compares preflight after a bot rewrite with the baseline taken before it (bot_gate.sh before | after | radar).
# only a FAIL line the rewrite added stops the run: a failure the human push brought in is not the bot's to
# block, and stopping on it would keep the derived files and fresh script hashes off the live site.
#   after  (site-data): harden_pages.py just ran, so every page's security tags must be current.
#   radar  (events-radar): the radar does not run harden_pages.py, so only a page the rewrite made stale
#          stops it. tags a human push left stale are site-data's to fix, not a reason to drop the events refresh.
set -uo pipefail
mode=${1:-after}
if [ "$mode" = before ]; then
  python3 .github/scripts/harden_pages.py --check --all 2>&1 | grep '^  [^ ]' | sort -u > /tmp/tags_before.txt || true
  python3 .github/scripts/preflight.py > /tmp/pre_before.txt 2>&1 || true
  tail -n 1 /tmp/pre_before.txt
  exit 0
fi
if [ "$mode" = radar ]; then
  touch /tmp/tags_before.txt
  python3 .github/scripts/harden_pages.py --check --all 2>&1 | grep '^  [^ ]' | sort -u > /tmp/tags_after.txt || true
  stale=$(comm -23 /tmp/tags_after.txt /tmp/tags_before.txt)
  if [ -n "$stale" ]; then
    echo "::error::the rewrite left pages with stale security tags (run harden_pages.py)"
    printf '%s\n' "$stale"
    exit 1
  fi
else
  python3 .github/scripts/harden_pages.py --check || exit 1
fi
python3 .github/scripts/preflight.py > /tmp/pre_after.txt 2>&1 || true
tail -n 1 /tmp/pre_after.txt
touch /tmp/pre_before.txt
grep '^FAIL' /tmp/pre_after.txt | sort -u > /tmp/pre_a.txt || true
grep '^FAIL' /tmp/pre_before.txt | sort -u > /tmp/pre_b.txt || true
added=$(comm -23 /tmp/pre_a.txt /tmp/pre_b.txt)
if [ -n "$added" ]; then
  echo "::error::the bot rewrite added preflight failures"
  printf '%s\n' "$added"
  exit 1
fi
echo "no preflight failure added by the rewrite"
