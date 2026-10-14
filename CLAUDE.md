# CLAUDE.md

Guide to the groovesmaxxing.com website repo. Everything here was read from the files in this repo. Lines starting with UNKNOWN mark things the repo does not answer.

## What this is

A static website. Every page is a `.html` file in this repo, written by hand or by scripts on the owner's laptop. There is no framework, no committed `package.json` and no bundler. Pages are served as committed, except that the `site-data` workflow rebuilds derived files on every push to `main` (see Automation).

- Live domain: `groovesmaxxing.com` (set by the `CNAME` file)
- GitHub repo: `groovesmaxxing/groovesmaxxing.github.io`
- Default branch: `main`
- Other long-lived branch: `status`, an orphan branch holding only the feeds the Desk page reads (`site-watch.json`, `link-watch.json` and its cache). Written by `.github/scripts/status_publish.sh`. Never merge it into `main`.

## Layout

### Folders

| Folder | What it holds |
|---|---|
| `artists/` | One page per artist (708 profiles plus 4 redirect pages), for example `artists/adam-ten.html` |
| `labels/` | One page per record label (71 pages) |
| `tracklists/` | One page per DJ set tracklist, plus `tracklists/index.html` |
| `newsletter/` | Archived Fresh Grooves Friday issues, `fgf-001.html` and so on |
| `media/covers/` | Playlist cover images used by `index.html` |
| `og/` | Per-page social share images, written by `share_cards.js` |
| `docs/` | `recognizer-streaming.md`, the contract between `scan.html` and the recognizer backend |
| `.github/workflows/` | Seven workflows, see Automation |
| `.github/scripts/` | The scripts those workflows run |

### Top-level pages

| File | Purpose |
|---|---|
| `index.html` | Homepage |
| `artists.html` | Artist directory. `roster.html` now redirects here |
| `labels.html` | Label directory |
| `sets.html` | Every DJ set. The laptop writes the full page, then `lighten_sets.py` moves the cards into `sets-index.json`, which `gmx-sets.js` loads on demand |
| `search.html` | One search box for the whole site, reads `search-index.json` |
| `crate.html` | The sets and tracks a visitor liked. Kept on the phone, and synced to their account when signed in |
| `radio.html` | The set library played back to back |
| `open-ids.html` | Tracklist rows not identified yet, reads `open-ids.json` |
| `interviews.html` | Interviews and talk podcasts |
| `badges.html` | Badges shown on artist pages |
| `upcoming.html` | Releases dropping soon |
| `friday.html` | The weekly Fresh Grooves Friday release list |
| `newsletter.html` | Index of newsletter issues |
| `events.html` | The events radar: festivals and club rooms by city, plus the "on tour" section that reads `radar-events.json`. `tours.html` now redirects to `events.html#tours` |
| `venues.html` | Denver venues |
| `scan.html` | The music recognizer page and the installed app's start page. When the recognizer places a clip in a set with a tracklist, the named row leads the card, and a catalog guess that disagrees folds under "the catalog heard something else" (see `docs/recognizer-streaming.md`). The level strip under the button runs its own frame loop: live mic levels on a decibel scale with a slow auto gain while audio arrives (an iphone mic with gain control off is quiet, so a straight scale reads flat), an idle wave when it stops (the catalog check, an iphone audio interruption), still under reduced motion. Draw errors and audio gaps log to the console as `gmx scan:` instead of freezing it. Screen readers hear listening, finding it and the result through the hidden `#scanlive` region |
| `more.html` | The more tab: the account card (sign in, handle, badge, claims, team), the artist tools, notification switches, download and delete my data, and settings. The fresh grooves friday switch is email (the recognizer's `/me/newsletter`), not push. Push asks for permission first, inside the tap, because iphone and firefox only show the prompt from a direct tap. Every switch answers in `#gmx-notify-msg` right under the switches, and push sends a test notification once it is on |
| `privacy.html`, `terms.html` | Legal pages for the scan feature |
| `404.html` | Page shown for missing URLs |
| `google04d31c35e73795cf.html` | Google Search Console ownership check. Do not delete |

### Shared files

| File | Purpose |
|---|---|
| `gmx-nav.js`, `gmx-nav.css` | The only tab bar, on every page: home, tracklists, scan (the raised button: the homepage logo on a night disc, with the waveform swelling, the grooves lighting up from the centre and a slow red ripple), artists, more. Also the floating search button. Loaded with `?v=17`, see Versioned shared files |
| `gmx-read.css` | The readability layer: lighter secondary grey, tighter and bigger Space Mono labels, lowercase small labels, Poppins for long button and link text. `ensure_tags.py` puts it last in every page's head so it wins over the page's own `<style>`. Loaded with `?v=3`. Also holds the keyboard focus ring for the shared account, search and "…" buttons |
| `gmx-account.js`, `gmx-account.css` | The account layer: sign in by email link or code, the sign in or @handle chip in the header, /me, the synced crate, push, and the "this is me" claim sheet on artist and label pages. Calls the recognizer at `api_base`. `gmx-account.js` is loaded with `?v=17` |
| `gmx-player.js`, `gmx-player.css` | The shared youtube stage that plays sets across pages |
| `gmx-follow.js` | Follow-along tracklists, synced to the players |
| `gmx-crate.js`, `gmx-sheet.js`, `gmx-sheet.css` | Hearts on sets and tracklist rows, and the "…" bottom sheet |
| `gmx-quick.js`, `gmx-quick.css` | The search sheet behind the floating search button, over `search-index.json`, scoped to the current tab |
| `gmx-nextup.js` | The "next up" strip |
| `gmx-related.js` | Cross-links everything the site holds on an artist |
| `gmx-sets.js` | Fills the sets page from `sets-index.json` |
| `gmx-upcoming.js` | Dropping soon, filtered on the visitor's crate |
| `gmx-profile.css`, `gmx-label.css` | Shared artist and label profile styles |
| `gmx-motion.css`, `gmx-motion.js` | Page motion kit. The homepage keeps its own inline copy |
| `gmx-refresh.js` | Pull to refresh inside the installed app |
| `gmx-install.js` | "Add to home screen" nudge |
| `gmx-clips.js`, `gmx-capture-worklet.js` | Scan page clip storage and audio capture |
| `sw.js` | Service worker. Cache name is a versioned string (`gmx-v20` at the time of writing), bumped whenever the shell changes. Precaches the list in `precache.json` |
| `manifest.webmanifest` | Installed app settings: name `groovesMAXXING`, home screen name `groovesMAXX`, start page `/scan` |
| `gmx-config.json` | Recognizer backend address (`api_base`) and the app key `scan.html` sends. Public on the live site by design. Do not change it without the owner |
| `sitemap.xml`, `robots.txt`, `feed.xml` | Search engine files and the newsletter RSS feed |
| `radar-artists.json` | Artist names the nightly tour sweep looks up |
| `radar-attractions.json`, `radar-events.json`, `radar-denver.json` | Written by the nightly sweep. Do not hand-edit |
| `*-index.json`, `open-ids.json`, `upcoming.json`, `precache.json`, `set-tags.json` | Derived files written by the `site-data` workflow. Do not hand-edit |

## Build, deploy and automation

- Edit the HTML, commit, push to `main`. `site-data` then commits derived files on top, so pull before working.
- Every push and pull request runs `site check`: `preflight.py` (structure and brand checks over every page) and `sitecheck.js` (headless Chromium loads the main pages at phone and desktop width and fails on console errors, missing same-origin files, horizontal overflow or a missing tab bar). Outside hosts are blocked in that check.
- Run the same checks locally: `python3 .github/scripts/preflight.py`, then serve the repo with `python3 -m http.server 8787 --bind 127.0.0.1` and run `npm install --no-save playwright@1.56.1` and `node .github/scripts/sitecheck.js`.
- Every pull request also gets a Cloudflare Pages check.
- GitHub Pages builds and deploys `main` on every push (the "pages build and deployment" run in the Actions tab), using the `CNAME` file for the domain.
- UNKNOWN: whether groovesmaxxing.com's DNS points at GitHub Pages or at Cloudflare. Neither the DNS nor either service's settings are in the repo.

### Workflows

| Workflow | When | What |
|---|---|---|
| `site-check.yml` | every push and pull request | preflight, `harden_pages.py --check` and the headless page load check |
| `site-data.yml` | every push to `main` | runs the `build_*.py` scripts, `lighten_sets.py`, `ensure_tags.py`, `sync_counts.py`, `crosslink_audit.py` and `share_cards.js`, then `harden_pages.py` last, then commits as `site data: derived files, tags and share cards` |
| `events-radar.yml` | daily 09:23 UTC, or by hand | `fetch_events.py` with the `TM_API_KEY` secret, then `build_event_schema.py`. Commits as `radar: nightly events refresh` |
| `site-watch.yml` | every 30 minutes | checks the live site's key pages, publishes to the `status` branch |
| `link-watch.yml` | daily | checks outside links, publishes to the `status` branch |
| `uptime.yml` | every 4 hours | checks the recognizer at `api_base` from `gmx-config.json` answers |
| `freshness.yml` | daily | checks the rows in `.github/freshness.json` and fails when one is too old |

### Events radar

- To fix a wrong Ticketmaster match, add the name to `OVERRIDES` in `fetch_events.py` (`None` means never match). To hide a venue, edit `VENUE_BLOCK` in the same file.
- The matcher accepts an exact name or one that starts with the artist name and is at most 8 characters longer, so short or common names can pick up the wrong act. Check new names before adding them.

## Conventions seen in the code

### Page template

- Each page carries its own `<style>` block with the same color tokens: `--night #0B0B0D`, `--racing #FF1C02`, `--deep #CC1400`, `--day #F2F2EF`, `--steel #8A8A93`, `--card #141417`.
- Fonts are Poppins (400, 600, 900) and Space Mono (400, 700), served from this site (`/gmx-fonts.css` and `fonts/`), never from Google.
- Pages in folders use relative paths like `../favicon.svg`. Shared scripts use root paths like `/gmx-nav.js`.
- `<title>` ends in `· groovesMAXXING`. Pages carry a meta description, Open Graph tags and a canonical URL without `.html`.
- Copy on the site is written in lowercase.
- `ensure_tags.py` adds the shared tags (tab bar, player, follow-along, account layer and so on) to any page missing them, so a fresh laptop-written page still gets them.

### Versioned shared files

Scripts and styles are served with a four hour browser cache, so a returning visitor can get a fresh page with a stale script. `gmx-nav.js`, `gmx-nav.css` and `gmx-account.js` are loaded with a version query (`?v=17` today) on every page. When one of them changes, bump the number in `ensure_tags.py` and `build_precache.py` (and where `gmx-nav.js` and `gmx-quick.js` inject them), and bump the `sw.js` cache name. `gmx-read.css` has its own version (`?v=3`), set in `READ_CSS` in `ensure_tags.py`, `build_precache.py` and `sw.js`.

### Security tags (content security policy)

- Every page except the redirect stubs and the Google verification file carries a `Content-Security-Policy` meta and a referrer policy meta, written by `.github/scripts/harden_pages.py`.
- Inline scripts are allowed by their sha256 hash, so after editing any inline script run `python3 .github/scripts/harden_pages.py` and commit the result. A stale hash fails the site check and blocks that script in browsers.
- Do not add inline event handlers (`onclick="..."`, `onerror="..."`). Use `addEventListener`, or `data-fallback` on images.
- The allowed outside hosts are lists at the top of `harden_pages.py` (player scripts, embed frames, form targets, scan page lookups). The recognizer host is read from `gmx-config.json` and allowed on every page, because the account layer calls it everywhere. A new embed or API host has to be added there, or the browser blocks it.
- All GitHub Actions are pinned to commit SHAs, and Dependabot watches the pins.

### Generated sections (edit with care)

Blocks wrapped in marker comments are written by scripts:

- `<!-- gmx-seo start -->` / `<!-- gmx-seo end -->` (about 751 pages)
- `<!-- sets:start -->` / `<!-- sets:end -->` (about 522 pages)
- `<!-- upcoming:start -->`, `<!-- tracklists:start -->`, `<!-- interviews:start -->`
- On the homepage: `sets-pool`, `sets-dots`, `iv-pool`, `iv-dots`, `upcoming`

Hand edits inside them will be overwritten. Leave the markers in place.

- UNKNOWN: the scripts that fill these blocks live on the owner's laptop, not in this repo. `.gitignore` names `sitelink_tracklists.py` and `site_edit.py`.

### Redirect pages

A moved page stays as a tiny redirect with `<meta http-equiv="refresh">`, a canonical link to the new address and `noindex`. Examples: `roster.html`, `tours.html`, `artists/chris-stussy.html`, `artists/gabri.html`, `artists/greg-br.html`, `artists/nu-moda.html`. Keep them out of `sitemap.xml` and the directories. Do not delete them.

### Counts written into the copy

- The artist count on `index.html` ("N artists") and `artists.html` ("N names") is set by `sync_counts.py` from the number of non-redirect pages in `artists/`. Do not bump it by hand.
- Other counts are still typed by hand, for example "all N names" in the on tour section of `events.html`, which must match the length of `radar-artists.json`.

### Commit messages

Short and lowercase, often starting with an area and a colon: `radar:`, `upcoming:`, `badges:`, `newsletter:`, `artists:`, `scan:`.

### Ignored files

`*.bak` backups, `Claude outputs/`, `node_modules/`, `package.json`, `shots/`, `status-out/`.

## Checklists

### Adding a new artist

1. Copy the closest existing profile page.
2. Add it to `sitemap.xml` and link it from `artists.html`.
3. Add the name to `radar-artists.json`, update "all N names" in `events.html`, and check the Ticketmaster match. Use `OVERRIDES` when it is wrong.
4. Push. `site-data` updates the artist counts and derived files.
