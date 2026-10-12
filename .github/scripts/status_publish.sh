#!/usr/bin/env bash
# publish files to the status branch (2026-10-11): an orphan branch that holds only the feeds the Desk
# page reads (site-watch.json, link-watch.json and its cache). nothing on it triggers the site workflows,
# which listen to main. usage: status_publish.sh "<commit message>" file...
set -euo pipefail
MSG="$1"; shift
BR=status
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
rm -rf ../status-wt
if git ls-remote --exit-code --heads origin "$BR" >/dev/null 2>&1; then
  git fetch -q origin "$BR"
  git worktree add -q ../status-wt "origin/$BR"
  (cd ../status-wt && git checkout -q -B "$BR" "origin/$BR")
else
  git worktree add -q --detach ../status-wt
  (cd ../status-wt && git checkout -q --orphan "$BR" && git rm -rfq . && printf '# status\n\nfeeds written by the site watch and the link watch workflows. read by the groovesMAXXING Desk page.\n' > README.md)
fi
cp "$@" ../status-wt/
cd ../status-wt
git add -A
if git diff --staged --quiet; then echo "status: nothing changed"; exit 0; fi
git commit -qm "$MSG"
git push -q origin "HEAD:$BR"
echo "status: pushed $(git rev-parse --short HEAD) to $BR"
