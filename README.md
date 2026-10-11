# groovesmaxxing.github.io
## working on the pages

every page carries a content security policy that allows its own inline scripts by hash. after editing
a page's inline script, run `python3 .github/scripts/harden_pages.py` and commit what it changes, or the
site check fails the pull request. the site-data workflow runs the same script after every push to main.
