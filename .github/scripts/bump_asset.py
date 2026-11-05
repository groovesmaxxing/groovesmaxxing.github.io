#!/usr/bin/env python3
"""bump_asset.py: move a shared asset to its next ?v= tag everywhere in one pass.

GitHub Pages serves .js and .css with a four-hour cache, so a changed gmx-*.js or gmx-*.css has to move to a
fresh ?v= tag in the same commit (asset_tags.py is the check that fails when it does not). This is the tool
that does the move, so the number is never hand-typed in 900 places.

  python3 .github/scripts/bump_asset.py gmx-nav.js              # v=30 -> v=31 in every tracked file
  python3 .github/scripts/bump_asset.py gmx-nav.js --dry-run    # print the plan, write nothing
  python3 .github/scripts/bump_asset.py gmx-nav.js --no-sw      # leave the sw.js cache name alone

What it does:
  1. refuses to run unless the git tree is clean (no staged, unstaged or untracked files), so the bump is
     the only change in the commit.
  2. reads the current N from the asset's own tag in index.html (src="/gmx-nav.js?v=N" or href="...").
  3. writes N+1 into every tracked text file that carries "<asset>?v=<digits>", whatever number it had, which
     also heals a page that fell behind. Files are read and written as bytes, so CRLF and LF files keep their
     own line endings and only the digits change.
  4. bumps the service worker cache name (var CACHE = 'gmx-vNN') by one, because sw.js precaches the shell
     and the installed app only refreshes when that name changes (CLAUDE.md, Versioned shared files).
     --no-sw skips this step.
  5. prints the file count and the new tag.

precache.json is rewritten too (it carries the tag); the site-data bot rebuilds it from build_precache.py on
the next push and lands on the same value. ensure_tags.py and build_precache.py are in the file count because
they hold the tag the bot writes into pages. stdlib only."""
import re
import subprocess
import sys

TEXT_EXT = ('.html', '.js', '.css', '.json', '.py', '.md', '.webmanifest', '.xml', '.txt')
ASSET = re.compile(r'^gmx-[a-z0-9-]+\.(?:js|css)$')


def git(*a):
    return subprocess.run(['git'] + list(a), capture_output=True, check=True).stdout


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    dry = '--dry-run' in argv
    no_sw = '--no-sw' in argv
    if len(args) != 1 or not ASSET.match(args[0]):
        print('usage: bump_asset.py gmx-<name>.js|css [--dry-run] [--no-sw]')
        return 2
    asset = args[0]

    dirty = git('status', '--porcelain').decode('utf-8', 'replace').strip()
    if dirty:
        print('refusing to run: the tree is not clean. commit or stash first:')
        print('\n'.join(dirty.splitlines()[:10]))
        return 1

    tag = re.compile(rb'(?P<head>/' + re.escape(asset.encode()) + rb'\?v=)(?P<n>\d+)')

    try:
        index = open('index.html', 'rb').read()
    except OSError:
        print('index.html not found: run from the repo root')
        return 1
    own = re.search(rb'(?:src|href)="' + tag.pattern + rb'"', index)
    if not own:
        print('no versioned tag for %s in index.html, so there is no current number to read' % asset)
        return 1
    old = int(own.group('n'))
    new = old + 1

    names = [n for n in git('ls-files', '-z').decode('utf-8').split('\0') if n.lower().endswith(TEXT_EXT)]
    changed = []
    for name in names:
        try:
            data = open(name, 'rb').read()
        except OSError:
            continue
        if asset.encode() + b'?v=' not in data:
            continue
        out = tag.sub(lambda m: m.group('head') + str(new).encode(), data)
        if out != data:
            changed.append((name, out))
        # a file already on N+1 is left alone and not counted

    sw_note = ''
    if not no_sw:
        try:
            sw = open('sw.js', 'rb').read()
        except OSError:
            sw = None
        if sw is not None:
            for i, (name, out) in enumerate(changed):
                if name == 'sw.js':
                    sw = out
                    del changed[i]
                    break
            m = re.search(rb"(var CACHE = 'gmx-v)(\d+)(')", sw)
            if m:
                sw = sw[:m.start(2)] + str(int(m.group(2)) + 1).encode() + sw[m.end(2):]
                sw_note = 'sw.js cache name gmx-v%s -> gmx-v%d' % (m.group(2).decode(), int(m.group(2)) + 1)
            changed.append(('sw.js', sw))

    print('%s?v=%d -> ?v=%d' % (asset, old, new))
    print('%d files %s' % (len(changed), 'would change' if dry else 'changed'))
    if sw_note:
        print(sw_note)
    if dry:
        for name, _ in changed[:5]:
            print('  ' + name)
        return 0
    for name, out in changed:
        with open(name, 'wb') as f:
            f.write(out)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
