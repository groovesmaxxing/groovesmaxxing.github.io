#!/usr/bin/env python3
"""related_slots: the "also on the site" block written into every artist profile's html (2026-11-05, seo P1-6c).

gmx-related.js already shows a profile everything the site holds on that artist, but only in the browser, so
a crawler and a reader with scripts off never see those links, and the 28 profiles whose section has no id
get nothing at all. this pass writes the plain-link part of that box into the page itself, from the
related-index.json that build_related.py has just rebuilt: the tracklists where the artist headlines (tagged
by us), the sets the artist is heard in (heard in these sets), and the label pages that list them (on these
labels). sets and talks stay out, they are players and the browser layer keeps them.

each part leaves out what the rest of the page already links, so a hand-kept rail is never repeated. the
browser layer gmx-related.js dedupes on the same hrefs, it skips any url the page html already holds, so once
this block is on the page nothing shows twice.

the block sits between <!-- related:start --> and <!-- related:end --> on their own lines, inside the page's
<section class="artist">, right before its <div class="links"> when it has one, else right before that
section's own </section>. the older template has its icon row under the h1 with the badges and the bio
below it and its releases and sets as sibling sections after it, so that row is not the anchor: there the
block goes to the bottom of the page, right before the <nav class="pn"> prev/next row, as a sibling section
after the last one, and before </section> only when the page has no such nav. every
run strips the old block and writes it fresh from the data, so a page whose items all went away loses its
block. the data is keyed by the file slug (artists/<slug>.html), never by the
section id. redirect stubs and google files are left alone, a page with no artist section is skipped and
counted. each file is read and written with newline='' so it keeps its own line ends, and a page whose block
is already identical is not written.

sitemap_lastmod.py strips this block before it hashes a page, so a change here never dates the page.

runs in the derived files step of site-data.yml right after build_related.py, from the repo root. stdlib only.

usage: python3 .github/scripts/related_slots.py            (write)
       python3 .github/scripts/related_slots.py --check    (write nothing, exit 1 when any page would change)
"""
import glob, html, json, re, sys

INDEX = 'related-index.json'
START, END = '<!-- related:start -->', '<!-- related:end -->'
OLD_BLOCK = re.compile(r'[ \t]*' + re.escape(START) + r'.*?' + re.escape(END) + r'[ \t]*(?:\r\n|\n)?', re.S)
SECTION_TAG = re.compile(r'<section\b|</section>')
LINKS_RE = re.compile(r'<div class="links"[\s>]')
LATER_RE = re.compile(r'class="(?:bio|meta)"')

# the style attributes are built from lists of declarations, the separator is chr(59) so this file holds none
SEP = chr(59)
def css(*decls): return SEP.join(decls)

SEC_STYLE = css('border-top:1px solid var(--line)', 'margin-top:44px', 'padding-top:26px')
# the same visually hidden heading the tracklists slot uses, so the outline keeps a heading over the chips
H2_STYLE = css('position:absolute', 'width:1px', 'height:1px', 'margin:-1px', 'overflow:hidden',
               'clip:rect(0 0 0 0)', 'white-space:nowrap', 'border:0')
EYEBROW_STYLE = css("font-family:'Space Mono',monospace", 'font-size:.72rem', 'letter-spacing:.12em',
                    'color:var(--steel)', 'text-transform:uppercase', 'margin:0 0 8px')
ROW_STYLE = css('display:flex', 'flex-wrap:wrap', 'gap:8px', 'margin-bottom:18px')
CHIP_STYLE = css("font-family:'Space Mono',monospace", 'font-size:.78rem', 'letter-spacing:.03em',
                 'text-decoration:none', 'color:#c9c9c4', 'border:1px solid var(--line)', 'border-radius:6px',
                 'padding:8px 12px', 'max-width:100%')
# the count after a heard-in title, styled like the small gmx-related.js puts there
SMALL_STYLE = css('color:var(--steel)', 'margin-left:6px')

# the three eyebrows and the heading are in gmx-lang-es.js already, so the spanish switch covers them
TAGGED, HEARD, LABELS, HEADING = 'tagged by us', 'heard in these sets', 'on these labels', 'also on the site'


def esc(s): return html.escape(str(s if s is not None else ''), quote=True)


def has_url(page, url):
    """the page links this url already. a whole path match, so /tracklists/a-set does not count as
    /tracklists/a-set-2, and a .html or # or ? after it still counts"""
    return re.search(re.escape(url) + r'(?![A-Za-z0-9_-])', page) is not None


def chip(url, title, small=''):
    tail = '<small style="%s">%s</small>' % (SMALL_STYLE, esc(small)) if small else ''
    return '<a href="%s" style="%s">%s%s</a>' % (esc(url), CHIP_STYLE, esc(title), tail)


def items_for(me, page):
    """the three parts for one artist, each without what the page outside the block already links"""
    tl = [x for x in me.get('tl', []) if x and not has_url(page, x[0])]
    heard = [x for x in me.get('in', []) if x and not has_url(page, x[0])]
    labs = [x for x in me.get('lab', []) if x and ('href="%s"' % x[0]) not in page]
    return tl, heard, labs


def block(tl, heard, labs, eol):
    lines = [START, '<section class="sec gmx-rel-static" style="%s">' % SEC_STYLE,
             '<h2 style="%s">%s</h2>' % (H2_STYLE, HEADING)]
    def part(eyebrow, chips):
        lines.append('<p style="%s">%s</p>' % (EYEBROW_STYLE, eyebrow))
        lines.append('<div style="%s">' % ROW_STYLE)
        lines.extend(chips)
        lines.append('</div>')
    if tl:
        part(TAGGED, [chip(x[0], x[1]) for x in tl])
    if heard:
        part(HEARD, [chip(x[0], x[1], '%d tracks' % x[2] if int(x[2]) > 1 else '1 track') for x in heard])
    if labs:
        part(LABELS, [chip(x[0], x[1]) for x in labs])
    lines += ['</section>', END]
    return eol.join(lines)


def artist_span(s):
    """(start, end) of the artist section, end being the index of its own </section>, nested sections counted"""
    i = s.find('<section class="artist"')
    if i < 0:
        return None
    depth = 0
    for m in SECTION_TAG.finditer(s, i):
        depth += -1 if m.group(0) == '</section>' else 1
        if depth == 0:
            return i, m.start()
    return None


def insert_at(s, at, text, eol):
    """text on its own lines right before position at. when only spaces sit before at on its line the block
    goes in at the line start, so the anchor keeps its indent"""
    line_start = max(s.rfind('\n', 0, at), s.rfind('\r', 0, at)) + 1
    if s[line_start:at].strip() == '':
        return s[:line_start] + text + eol + s[line_start:]
    return s[:at] + eol + text + eol + s[at:]


def main(argv):
    check = '--check' in argv
    try:
        with open(INDEX, encoding='utf-8') as fh:
            rel = json.load(fh)
    except (OSError, ValueError) as e:
        print('related slots: %s unreadable (%s), nothing written' % (INDEX, e))
        return 0
    written = unchanged = empty = skipped = before_end = 0
    n_lab = n_in = n_tl = 0
    for f in sorted(p.replace('\\', '/') for p in glob.glob('artists/*.html')):
        name = f.split('/')[-1]
        if name.startswith('google'):
            continue
        try:
            with open(f, encoding='utf-8', newline='') as fh:
                s = fh.read()
        except OSError:
            continue
        # only the refresh value marks a stub, the csp meta on every page also says http-equiv
        if 'http-equiv="refresh"' in s:
            continue
        eol = '\r\n' if '\r\n' in s else '\n'
        base = OLD_BLOCK.sub('', s)
        span = artist_span(base)
        if not span:
            skipped += 1
            continue
        tl, heard, labs = items_for(rel.get(name[:-5]) or {}, base)
        if not (tl or heard or labs):
            new = base
            if new == s:
                empty += 1
                continue
        else:
            i, j = span
            m = LINKS_RE.search(base, i, j)
            # the older template puts its icon row right under the h1, with the badges and the bio after it,
            # so a links row that still has a meta or bio row below it is not the bottom row and the block
            # goes before the section end instead, under the bio like on the newer template
            if m and LATER_RE.search(base, m.end(), j):
                m = None
            if m:
                at = m.start()
            else:
                k = base.find('<nav class="pn"', j)
                at = k if k >= 0 else j
                before_end += 1
            new = insert_at(base, at, block(tl, heard, labs, eol), eol)
            n_tl += len(tl)
            n_in += len(heard)
            n_lab += len(labs)
        if new == s:
            unchanged += 1
            continue
        written += 1
        if not check:
            with open(f, 'w', encoding='utf-8', newline='') as fh:
                fh.write(new)
    print('related slots: %d page(s) %s, %d unchanged, %d with no block, %d skipped (no artist section), '
          'items %d labels, %d heard-in, %d tagged, %d block(s) at the page bottom (no bottom links row)'
          % (written, 'would change' if check else 'written', unchanged, empty, skipped,
             n_lab, n_in, n_tl, before_end))
    if check:
        print('related slots: --check, nothing written')
        return 1 if written else 0
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
