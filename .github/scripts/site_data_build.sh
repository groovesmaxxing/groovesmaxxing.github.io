#!/usr/bin/env bash
# the site-data rebuild: derived files, share cards, then the security tags last. site-data.yml runs it once,
# and again from its push retry when another push landed first and the rebase could not be kept.
# a builder that refuses to write an emptied file exits 1, which stops the run before anything is committed.
set -euo pipefail
python3 .github/scripts/lighten_sets.py
python3 .github/scripts/build_search_index.py
python3 .github/scripts/build_feed.py
python3 .github/scripts/build_precache.py
python3 .github/scripts/build_related.py
python3 .github/scripts/related_slots.py
python3 .github/scripts/build_tracks.py
python3 .github/scripts/build_open_ids.py
python3 .github/scripts/build_upcoming.py
python3 .github/scripts/build_event_schema.py
python3 .github/scripts/build_reels.py
python3 .github/scripts/ensure_tags.py
python3 .github/scripts/copy_pass.py
python3 .github/scripts/sync_counts.py
python3 .github/scripts/sitemap_lastmod.py
python3 .github/scripts/crosslink_audit.py
# share cards (only the pages whose name or subtitle changed). playwright is installed by the workflow step before.
NODE_PATH=$PWD/node_modules node .github/scripts/share_cards.js
# the security tags (fonts, referrer, content security policy with this push's script hashes)
python3 .github/scripts/harden_pages.py
