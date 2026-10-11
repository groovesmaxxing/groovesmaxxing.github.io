#!/usr/bin/env python3
"""The security tags every page carries. Stdlib only. Idempotent.

Runs last in the site-data workflow, after every script that edits a page, and in --check mode on every
push and pull request (the site check), where it fails when a page is out of date.

what it does to every page (the root pages, artists, labels, tracklists, newsletter issues):
  1. the fonts: swaps the google fonts tags for /gmx-fonts.css, the same poppins and space mono files
     served from this origin, so no visitor's ip goes to google and the page skips two handshakes.
  2. a referrer policy meta, strict-origin-when-cross-origin: other sites learn which origin a visitor came
     from, never which page.
  3. a content security policy meta. scripts run only from this origin, the youtube and soundcloud player
     apis (and deezer, on the scan page), plus this page's own inline scripts and inline handlers, each
     allowed by its sha256 hash. a script that gets injected into the page does not run. frames, images,
     media, fonts, forms and connections are each limited to the hosts the site actually uses.

the hashes are per page and change whenever an inline script changes, so after editing a page run
    python3 .github/scripts/harden_pages.py
a page pushed to main with a stale hash has its inline scripts blocked until the workflow rewrites the
tag (a few minutes), which is why the site check fails a pull request whose tags are stale.

skipped: the redirect stubs (roster, tours, venues) and the google verification file.
"""
import base64, glob, hashlib, html, json, re, sys

CHECK = '--check' in sys.argv

FONT_CSS = '<link rel="stylesheet" href="/gmx-fonts.css">'
FONT_PRELOAD = ['<link rel="preload" as="font" type="font/woff2" href="/fonts/poppins-400-latin.woff2" crossorigin>',
                '<link rel="preload" as="font" type="font/woff2" href="/fonts/spacemono-400-latin.woff2" crossorigin>']
REFERRER = '<meta name="referrer" content="strict-origin-when-cross-origin">'

# the player apis gmx-player.js and gmx-follow.js load as scripts
SCRIPT_HOSTS = ['https://www.youtube.com', 'https://w.soundcloud.com']
# the embeds the pages frame
FRAME_HOSTS = ['https://open.spotify.com', 'https://w.soundcloud.com', 'https://www.youtube-nocookie.com',
               'https://www.youtube.com', 'https://www.instagram.com']
# the newsletter signup form posts here (both buttondown domains: the post and the thank-you redirect)
FORM_HOSTS = ['https://buttondown.com', 'https://buttondown.email']
# the scan page only: the cover and store-link lookups, and deezer's jsonp (its api has no cors)
SCAN_CONNECT = ['https://open.spotify.com', 'https://itunes.apple.com']
SCAN_SCRIPT = ['https://api.deezer.com']

SCRIPT_RE = re.compile(r'<script\b([^>]*)>(.*?)</script>', re.S | re.I)
HANDLER_RE = re.compile(r'\son[a-z]+\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', re.I)
META_RE = re.compile(r'[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?', re.I)
GOOGLE_FONT_RE = re.compile(r'[ \t]*<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\n?', re.I)
GOOGLE_SHEET_RE = re.compile(r'[ \t]*<link(?=[^>]*fonts\.googleapis\.com/css)(?=[^>]*rel="stylesheet")[^>]*>', re.I)
CHARSET_RE = re.compile(r'<meta charset=[^>]*>', re.I)


def api_hosts():
    """the recognizer host from gmx-config.json, http and websocket, so the scan page may call it"""
    try:
        cfg = json.load(open('gmx-config.json', encoding='utf-8'))
    except Exception:
        return []
    out = set()
    for k in ('api_base', 'stream_url'):
        m = re.match(r'^(?:https?|wss?)://([^/]+)', str(cfg.get(k) or ''))
        if m:
            out.add('https://' + m.group(1)); out.add('wss://' + m.group(1))
    return sorted(out)


def sha(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode() + "'"


def policy(path, s):
    inline, markup = set(), []
    pos = 0
    for m in SCRIPT_RE.finditer(s):
        markup.append(s[pos:m.start()]); pos = m.end()
        attrs, body = m.group(1), m.group(2)
        if re.search(r'\bsrc\s*=', attrs, re.I):
            continue
        t = re.search(r'\btype\s*=\s*["\']?([^"\'\s>]+)', attrs, re.I)
        if t and t.group(1).lower() not in ('text/javascript', 'application/javascript', 'module'):
            continue   # ld+json and other data blocks never run
        inline.add(sha(body))
    markup.append(s[pos:])
    # inline handlers (onerror="..." on the thumbnails) are hashed from the markup outside the scripts,
    # so an attribute spelled inside a javascript string is not mistaken for one
    handlers = set()
    for m in HANDLER_RE.finditer(''.join(markup)):
        handlers.add(sha(html.unescape(m.group(1) if m.group(1) is not None else m.group(2))))

    scan = path == 'scan.html'
    scripts = ["'self'"] + SCRIPT_HOSTS + (SCAN_SCRIPT if scan else [])
    if inline or handlers:
        # 'unsafe-inline' is read only by browsers too old to understand hashes; every other browser
        # ignores it the moment a hash is present and allows exactly the scripts listed
        scripts.append("'unsafe-inline'")
    scripts += sorted(inline)
    if handlers:
        scripts += ["'unsafe-hashes'"] + sorted(handlers)
    connect = ["'self'"] + (SCAN_CONNECT + api_hosts() if scan else [])
    return '; '.join([
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        'script-src ' + ' '.join(scripts),
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        'connect-src ' + ' '.join(connect),
        'frame-src ' + ' '.join(FRAME_HOSTS),
        "worker-src 'self'",
        "manifest-src 'self'",
        'form-action ' + ' '.join(["'self'"] + FORM_HOSTS),
        'upgrade-insecure-requests',
    ])


THUMB_RE = re.compile(r'\sonerror="this\.onerror=null;this\.src=\'([^\'"]+)\'"')
FALLBACK_JS = ("document.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&t.getAttribute('data-fallback'))"
               "{t.src=t.getAttribute('data-fallback');t.removeAttribute('data-fallback')}},true)")
FALLBACK_TAG = '<script>' + FALLBACK_JS + '</script>'
OLD_FALLBACK_RE = re.compile(r'[ \t]*<script>document\.addEventListener\(\'error\',function\(e\)\{var t=e\.target;if\(t&&t\.tagName===\'IMG\'&&t\.getAttribute\(\'data-fallback\'\)\).*?</script>\n?', re.S)


def thumbs(s):
    """the thumbnail fallbacks: a hundred onerror="this.src='...'" handlers on the home page would mean a
    hundred hashes in its policy, so they become data-fallback attributes and one listener, placed before
    the first image so no early failure is missed. the listener is hashed like any inline script."""
    s = OLD_FALLBACK_RE.sub('', s)
    s = THUMB_RE.sub(lambda m: ' data-fallback="' + m.group(1) + '"', s)
    if 'data-fallback="' not in s:
        return s
    return s.replace('</head>', FALLBACK_TAG + '\n</head>', 1)


def fonts(s):
    if FONT_CSS not in s:
        m = GOOGLE_SHEET_RE.search(s)
        if m:
            indent = re.match(r'[ \t]*', m.group(0)).group(0)
            local = '\n'.join(indent + t for t in FONT_PRELOAD + [FONT_CSS])
            s = s[:m.start()] + local + s[m.end():]
    return GOOGLE_FONT_RE.sub('', s)


def harden(path):
    s = open(path, encoding='utf-8').read()
    o = s
    if 'http-equiv="refresh"' in s or not CHARSET_RE.search(s):
        return False
    s = fonts(s)
    s = thumbs(s)
    s = META_RE.sub('', s)
    meta = '<meta http-equiv="Content-Security-Policy" content="' + policy(path, s) + '">'
    if REFERRER not in s:
        meta += '\n' + REFERRER
    s = CHARSET_RE.sub(lambda m: m.group(0) + '\n' + meta, s, count=1)
    if s != o and not CHECK:
        open(path, 'w', encoding='utf-8').write(s)
    return s != o


pages = [p for p in sorted(glob.glob('**/*.html', recursive=True))
         if not p.startswith(('.git', 'node_modules', 'Claude outputs')) and not p.startswith('google')]
changed = [p for p in pages if harden(p)]
if CHECK:
    if changed:
        print('%d page(s) carry stale security tags (fonts, referrer or the content security policy):' % len(changed))
        for p in changed[:40]:
            print('  ' + p)
        if len(changed) > 40:
            print('  ... and %d more' % (len(changed) - 40))
        print('run  python3 .github/scripts/harden_pages.py  and commit what it changes.')
        sys.exit(1)
    print('security tags: every page is current (%d checked)' % len(pages))
else:
    print('security tags: %d page(s) updated, %d checked' % (len(changed), len(pages)))
