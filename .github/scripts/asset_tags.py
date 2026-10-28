#!/usr/bin/env python3
"""asset_tags.py: a shared script or stylesheet that changes must change its ?v= tag in the same commit.

GitHub Pages serves .js and .css with a four-hour cache and HTML with none, so a page that ships new markup
against an unchanged asset tag meets a stale copy in every returning browser (2026-10-27: the new back row
rendered glued together, the search button stayed over content, the halloween toggle kept its old size).

For every gmx-*.js / gmx-*.css that differs between two revisions, this collects the tags the site uses to
reference it (in every page, in the other scripts, in sw.js and the generators under .github/scripts) on
both sides. It fails when a tag survives from the old side, or when the new side still references the file
bare. precache.json is skipped: the site-data bot rebuilds it from build_precache.py after the push.

  python3 .github/scripts/asset_tags.py                      # working tree (staged + unstaged) against HEAD
  python3 .github/scripts/asset_tags.py --range A..B         # two commits, what the site-check workflow runs

exit 0 when every changed asset moved to a fresh tag, 1 otherwise. stdlib only."""
import re, subprocess, sys

ASSET = re.compile(r'^gmx-[a-z0-9-]+\.(?:js|css)$')
# a reference is the quoted path in a src/href or a script string. an attribute-prefix selector such as
# script[src^="/gmx-nav.js"] (the loaders use those to see whether the shell is already on the page) is not one.
REF = re.compile(r'(?<![\^*$]=["\'])/(gmx-[a-z0-9-]+\.(?:js|css))(\?v=\d+)?["\']')
SCAN = ['*.html', 'gmx-*.js', 'sw.js', '.github/scripts/*.py']   # where a reference can live


def git(*a):
    return subprocess.run(['git'] + list(a), capture_output=True, text=True, encoding='utf-8', errors='replace').stdout


def exists(rev):
    return subprocess.run(['git', 'rev-parse', '--verify', '-q', rev + '^{commit}'], capture_output=True).returncode == 0


def changed(old, new):
    out = git('diff', '--name-only', old, new) if new else git('diff', '--name-only', old)
    return sorted(f for f in out.split('\n') if ASSET.match(f))


def refs(rev):
    """{asset: {tag, ...}} at a revision ('' for the working tree); a bare reference counts as tag ''."""
    args = ['grep', '-h', '-E', r'/gmx-[a-z0-9-]+\.(js|css)(\?v=[0-9]+)?["' + "']"]   # whole lines, so the selector lookbehind can see its context
    if rev: args.append(rev)
    args += ['--'] + SCAN
    found = {}
    for line in git(*args).split('\n'):
        for m in REF.finditer(line):
            found.setdefault(m.group(1), set()).add(m.group(2) or '')
    return found


def main():
    old, new = 'HEAD', ''
    if '--range' in sys.argv:
        rng = sys.argv[sys.argv.index('--range') + 1]
        old, new = rng.split('..', 1)
        if not exists(old):                       # a new branch or a force push: compare with the parent instead
            old = new + '~1'
    files = changed(old, new)
    if not files:
        print('asset tags: no shared script or stylesheet changed'); return 0
    before, after = refs(old), refs(new)
    bad = 0
    for f in files:
        o, n = before.get(f, set()), after.get(f, set())
        shown = lambda s: ', '.join(sorted(t or '(bare)' for t in s)) or '(unreferenced)'
        if not n:
            print('  ok    %-22s changed, referenced nowhere' % f); continue
        stale = o & n
        bare = '' in n
        if stale or bare:
            bad += 1
            why = ('still referenced as %s' % shown(stale)) if stale else 'referenced bare, so it can never be refreshed'
            print('  FAIL  %-22s %s -> %s: %s' % (f, shown(o), shown(n), why))
        else:
            print('  ok    %-22s %s -> %s' % (f, shown(o), shown(n)))
    if bad:
        print('asset tags: %d changed file(s) keep a tag a returning browser already holds. bump the tag everywhere it is '
              'referenced (pages, gmx-nav.js / gmx-quick.js loaders, sw.js SHELL, ensure_tags.py, build_precache.py).' % bad)
        return 1
    print('asset tags: every changed shared file moved to a fresh tag')
    return 0


if __name__ == '__main__':
    sys.exit(main())
