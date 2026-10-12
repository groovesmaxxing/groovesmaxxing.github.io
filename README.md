# groovesmaxxing.github.io

The source for [groovesmaxxing.com](https://groovesmaxxing.com), house, techno and indie dance curated by your friend with permanent aux privileges.

It is a plain static site with no build step. Every page is an HTML file in this repo, and GitHub Pages publishes whatever is on `main`.

- `artists/`, `labels/`, `tracklists/` and `newsletter/` hold one page per artist, label, set tracklist and newsletter issue.
- A nightly GitHub Actions job (`.github/workflows/events-radar.yml`) pulls upcoming tour dates from Ticketmaster into `radar-events.json`, which `events.html` reads (`tours.html` now redirects there).
- On every push to `main`, `.github/workflows/site-data.yml` rebuilds the derived files (search index, feed, offline precache, share cards and more) and commits them.
- Many pages contain sections between marker comments such as `<!-- sets:start -->`. Those are filled in by scripts kept outside this repo, so edit inside them with care.
