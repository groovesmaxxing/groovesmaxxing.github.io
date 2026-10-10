# CLAUDE.md

Guide to the groovesmaxxing.com website repo. Everything here was read from the files in this repo. Lines starting with UNKNOWN mark things the repo does not answer.

## What this is

A plain static website. Every page is a hand-written or script-written `.html` file with its CSS inside a `<style>` tag in the page itself. There is no framework, no `package.json`, no build step and no bundler. What is committed is exactly what visitors get.

- Live domain: `groovesmaxxing.com` (set by the `CNAME` file)
- GitHub repo: `groovesmaxxing/groovesmaxxing.github.io`
- Default branch: `main`

## Layout

### Folders

| Folder | What it holds |
|---|---|
| `artists/` | One page per artist (708 profiles plus 4 redirect pages), for example `artists/adam-ten.html` |
| `labels/` | One page per record label (about 71 pages) |
| `tracklists/` | One page per DJ set tracklist, plus `tracklists/index.html` which lists them all with a youtube or soundcloud filter |
| `newsletter/` | Archived issues of the Fresh Grooves Friday newsletter, named `fgf-001.html`, `fgf-002.html` and so on |
| `media/covers/` | Playlist cover images used by `index.html` |
| `.github/workflows/` | One GitHub Actions workflow, `events-radar.yml` |
| `.github/scripts/` | `fetch_events.py`, the script that workflow runs |

### Top-level pages

| File | Purpose |
|---|---|
| `index.html` | Homepage |
| `artists.html` | Artist directory with profiles. Some artist pages are only linked from here through JavaScript, not plain links |
| `roster.html` | One-page list of every artist and label followed |
| `labels.html` | Label directory |
| `sets.html` | Every DJ set on the site in one page |
| `interviews.html` | Interviews and talk podcasts |
| `badges.html` | The badges shown on artist pages and who has each one |
| `upcoming.html` | Releases dropping soon |
| `friday.html` | The full weekly Fresh Grooves Friday release list |
| `newsletter.html` | Index of newsletter issues |
| `events.html` | Map of festivals and club rooms by city |
| `tours.html` | Upcoming tour dates, read from `radar-events.json` |
| `venues.html` | Denver venues |
| `scan.html` | The "scan" music recognizer page. It is also the installed app's start page |
| `more.html` | Menu page for the installed phone app |
| `privacy.html`, `terms.html` | Legal pages for the scan feature |
| `404.html` | Page shown for missing URLs |
| `google04d31c35e73795cf.html` | Google Search Console ownership check. Do not delete |

`scan`, `more`, `privacy`, `terms` and `404` are marked `noindex` so search engines skip them.

### Shared files

| File | Purpose |
|---|---|
| `gmx-motion.css`, `gmx-motion.js` | Page motion kit (progress bar, reveal on scroll, hover effects). Loaded by almost every page. `gmx-motion.css` says the homepage keeps its own inline copy instead |
| `gmx-refresh.js` | Pull down to refresh inside the installed app |
| `gmx-install.js` | "Add to home screen" prompt |
| `gmx-clips.js` | Optional "keep my clips" storage for the scan page, kept only on the visitor's phone |
| `sw.js` | Service worker for the installed app. Cache name is `gmx-v2`. Network first, cached copy when offline |
| `manifest.webmanifest` | Installed app settings (name, icons, colors, start page `/scan`) |
| `gmx-config.json` | Address of the recognizer backend and the app key that `scan.html` sends to it. Anyone can read this file on the live site |
| `sitemap.xml`, `robots.txt` | Search engine files. The sitemap lists about 843 URLs |
| `radar-artists.json` | Artist names the nightly tour sweep looks up |
| `radar-attractions.json` | Cache of Ticketmaster ids for those artists. Written by the workflow |
| `radar-events.json` | Upcoming events. Written by the workflow, read by `tours.html` |
| Favicons, `icon-*.png`, `apple-touch-icon.png`, `og-image.png` | Site icons and the social share image |

## Build and deploy

- There is no build. Edit the HTML, commit, push to `main`.
- Every pull request gets a Cloudflare Pages check, which builds a preview of the branch.
- UNKNOWN: which service actually serves groovesmaxxing.com. The repo name and `CNAME` suggest GitHub Pages, but pull requests also get a "Cloudflare Pages" check, so Cloudflare Pages is connected to this repo too. Neither service's settings are stored in the repo. Check the GitHub repo settings and the Cloudflare dashboard.
- UNKNOWN: there is no local preview script. Any simple static file server pointed at the repo root should work, but nothing in the repo says which one is used.

### Nightly events radar (the only automation)

- Workflow `.github/workflows/events-radar.yml` runs once a day at 09:23 UTC, and can also be started by hand from the Actions tab.
- It runs `.github/scripts/fetch_events.py` (Python standard library only, no installs) with the `TM_API_KEY` repository secret.
- It rewrites `radar-attractions.json` and `radar-events.json` and commits them as `github-actions[bot]` with the message `radar: nightly events refresh`.
- Because of this, `main` on GitHub gets a new commit most days. Always pull before working.
- Do not hand-edit `radar-attractions.json` or `radar-events.json`. To fix a wrong Ticketmaster match, edit `OVERRIDES` in `fetch_events.py`. To hide a venue, edit `VENUE_BLOCK` in the same file.

## Conventions seen in the code

### Page template

- Each page carries its own `<style>` block starting with the same color tokens: `--night #0B0B0D`, `--racing #FF1C02`, `--deep #CC1400`, `--day #F2F2EF`, `--steel #8A8A93`, `--line #26262b`, `--card #141417`.
- Fonts are Poppins (400, 600, 900) and Space Mono (400, 700) from Google Fonts.
- Pages inside `artists/`, `labels/` and the other folders use relative paths like `../favicon.svg`. Shared scripts are loaded with root paths like `/gmx-motion.js`.
- Each page sets a `<title>` ending in `· groovesMAXXING`, a meta description, Open Graph tags pointing at `https://groovesmaxxing.com/og-image.png`, and a canonical URL without `.html`.
- Copy on the site is written in lowercase.

### Generated sections (edit with care)

Many pages contain blocks wrapped in marker comments, for example:

- `<!-- gmx-seo start -->` / `<!-- gmx-seo end -->` (about 751 pages)
- `<!-- sets:start -->` / `<!-- sets:end -->` (about 522 pages)
- `<!-- upcoming:start -->`, `<!-- tracklists:start -->`, `<!-- interviews:start -->`
- On the homepage: `sets-pool`, `sets-dots`, `iv-pool`, `iv-dots`, `upcoming`

These blocks are filled in by scripts. Hand edits inside them will likely be overwritten the next time the script runs. Leave the markers in place.

- UNKNOWN: the scripts that fill these blocks are not in this repo. `.gitignore` names `sitelink_tracklists.py` and `site_edit.py`, and commit messages mention a release "tracker", `sets_library.json` and a "registry". Where these live and how to run them is not recorded here.

### Redirect pages

When a page moves, the old file is kept as a tiny redirect page with `<meta http-equiv="refresh">`, a canonical link to the new address and `noindex`. Examples are `artists/chris-stussy.html`, `artists/gabri.html`, `artists/greg-br.html` and `artists/nu-moda.html`. These are meant to stay out of `sitemap.xml` and out of the directory pages. Do not delete them, because old links still point at them.

### Ignored files

- `*.bak` and `*.bak_*` backups that the generator scripts write.
- `Claude outputs/`, a folder the Cowork app mirrors into local copies. Never part of the site.

### Commit messages

- Short, lowercase, describing what changed, for example `add hot since 82 profile with set and tracklist, roster and counts to 708`.
- Often start with an area name and a colon, such as `radar:`, `upcoming:`, `badges:`, `newsletter:`, `artists:`.

### Counts written into the copy

Totals are typed into page text by hand or by script, for example "708 artists, 103 labels" in `roster.html`, "700 of them across 521 artists" in `sets.html`, and "688 artists" in `tours.html`. When adding an artist, label or set, check the commit history for which counts usually change alongside it ("roster and counts to 708").

## Checklists

### Adding a new page

1. Copy the closest existing page as a starting point so the template, fonts and tokens match.
2. Add the page's URL to `sitemap.xml`. Leave redirect pages out.
3. Link to it from the right directory page (`artists.html`, `roster.html`, `labels.html`, `tracklists/index.html` or `newsletter.html`).
4. For a new artist, add their name to `radar-artists.json` so the nightly sweep looks up tour dates, and update the "all N names" count in `tours.html`. Short or common names can match the wrong act on Ticketmaster, so check them and use `OVERRIDES` in `fetch_events.py` when needed.

## Known gaps (as of 2026-10-10)

- `radar-artists.json` has 688 names while `roster.html` reports 708 artists, so about 20 newer artists get no tour dates.
- `README.md` is a single heading with no content.
- No broken internal links were found in a scan of all HTML files.
