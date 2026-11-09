"""refuse to replace a derived file with an emptied or collapsed one (2026-11-09, cr-build-7).

every builder stamps a fresh `generated` date, and freshness reads only that date, so a template change that
breaks a builder's regex would ship an empty search, feed or index while every monitor reads fresh. the
builders call check() just before they write. it exits 1 without writing, which turns the site-data run red
before its commit step, and the live file stays as it was.
"""
import json
import sys


def old_count(path, xml=False):
    """rows in the file as committed: json 'count', or <item> elements for an rss file. None when unreadable"""
    try:
        text = open(path, encoding='utf-8').read()
    except OSError:
        return None
    if xml:
        return text.count('<item>')
    try:
        return int(json.loads(text).get('count') or 0)
    except Exception:
        return None


def check(path, new, zero_only=False, xml=False, ratio=0.5):
    """exit 1 when `new` rows would replace a file that had rows: on 0 always, below ratio of the old count
    unless zero_only (for files whose count can fall a lot from one week to the next)"""
    old = old_count(path, xml)
    if not old:
        return
    if new == 0 or (not zero_only and new < old * ratio):
        print('refusing to write %s: %d rows (was %d). a page template change probably broke this builder; '
              'the committed file is kept' % (path, new, old), file=sys.stderr)
        sys.exit(1)
