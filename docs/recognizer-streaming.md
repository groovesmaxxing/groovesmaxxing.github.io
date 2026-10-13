# recognizer: the streaming contract

the phone side of the scan is built for this already. the server side lives on the laptop host and is the
half still to build. until it exists the phone falls back to the round-based flow (library rounds at 5, 9 and 12
seconds, catalogs at 15, four requests a scan against the thirty an hour per phone), which works against the server as it is today.

## why

shazam answers in three to five seconds because it matches while it listens. our flow records, uploads, then
waits, so the floor is the first round plus the upload plus the server's time. streaming removes the upload
wait and lets the server answer the moment it is sure.

## how the phone decides

`gmx-config.json` may carry a `stream_url`. when it is present and the browser has WebSocket, the scan opens
it at tap time. if the socket is not open within 1500 ms, or closes before the first server message, the
phone falls back to the rounds for that scan and tries the socket again next time.

## the socket

`wss://<host>/stream` (the exact path is whatever `stream_url` says).

### phone to server

1. first frame, text, json:
   `{"type":"hello","app_key":"...","device":"<32 hex>","rate":16000,"channels":1,"format":"pcm16le","source":"mic"}`
2. then binary frames: raw 16 kHz mono 16-bit little-endian pcm, one frame every 500 ms or so (8000 samples,
   16 KB). the phone has already low-passed and decimated, the same bytes it puts in the wav today.
3. optional text frames:
   `{"type":"end"}` when the phone stops sending (15 s reached, or the user tapped stop). the server answers
   with its final verdict and closes.
   `{"type":"hint","chip":"youtube_set","link":"https://...","handle":"@x"}` the same payload as `/set-hint`,
   sent only after a result, only on the user's tap.

### server to phone

text frames, json, any number of them, in this order of life:

- `{"type":"ready","session":"<id>"}` once, after hello. the phone starts sending audio on this.
- `{"type":"listening","seconds":4.0}` optional progress, any cadence.
- `{"type":"match","tier":"LIKELY","card":{...},"recognition_id":"...","seconds":4.5,"in_set":{...}}`
  a likely answer. the phone shows it with "still listening" and keeps sending.
- `{"type":"match","tier":"CONFIRMED","card":{...},"recognition_id":"...","seconds":6.0,"in_set":{...}}`
  the phone stops the mic, shows the card, closes the socket. `card` is the same shape `/jobs/<id>` returns
  in `result.card` today, so the card code does not change.
- `{"type":"done","card":{...},"recognition_id":"...","seconds":15.2}` the final verdict after `end` when
  nothing was sure: a `guess` or `none` card, exactly as the 15 s round returns today.
- `{"type":"error","code":"rate"|"key"|"server"|"bad_audio","message":"..."}` then close. the phone maps the
  codes to the same messages it shows today.

### what the server should do to earn the speed

- keep the library fingerprint index in memory between sessions, loaded once at start.
- run the library match on the audio so far every 1.5 s from 3 s in, on the same session's accumulated
  buffer, not on a fresh upload.
- start the catalog lookups at 6 s in parallel with the library passes instead of after the final clip.
- answer CONFIRMED as soon as the library score clears the bar, and LIKELY as soon as it clears the lower
  one. the bars are the ones the round flow uses now.
- keep one session per socket, drop the buffer on close, never write audio to disk unless the phone sends a
  `contribute` later (that path stays on http as it is).
- rate limit by device the same way `/identify` does. `rate` on the socket is the same 429.

### timing the phone reports

the card now prints `found in N s` plus per-round upload and match times. with the socket the phone prints
`found in N s · streamed`. that line is how we will know the server half paid off.

## what the card wants from the server, streaming or not

the phone now fills these in itself when they are missing, from public services and from our own
tracklists. the server can make that fallback redundant by sending them on every match, early rounds
included:

- `card.candidate.artwork_url`: the cover, at least 600 px square. the releases database on the laptop
  already holds the spotify id for most released tracks, and spotify's track endpoint carries the art.
- `card.candidate.store_links`: real urls, not searches: `spotify`, `apple`, `beatport`, `soundcloud`,
  `deezer`. the phone shows a search button only when a real link is missing.
- `card.candidate.heard_in`: for every library match, including an ID with no name, the set the
  fingerprint came from and the second it sits at: `[{set_title, page_url, deep_link, at}]`. the phone
  renders this as "hear it in" on the card. it is the one thing the phone cannot work out for an ID on
  its own, since there is no name to look up.
- `in_set`: unchanged, the set the clip itself was scanned from, when known.

## the row-named guess card (since 2026-10-13)

when the clip is placed inside a set we hold a tracklist for, `in_set.row` is the named row playing at
that second. since 2026-10-13 the server also makes that row the closest guess, so the "on the tracklist"
line and the guess under the confidence bar never name two different records:

- a `guess` or `none` card becomes `{"kind":"guess","candidate":{...}}` with `artist_claim` and
  `title_claim` taken from the row, `headline` the title, `subline` the artist, `word` `guess`,
  `shown_score` null, `tier` `NO MATCH`, and `confidence_line` `on the tracklist at this second`.
  `heard_in` carries the row's own page link `[{set_title, page_url, seconds, at, deep_link}]`.
- when the library's hash index also raised a clip whose own naming agrees with the row, the candidate
  keeps that entry's `fingerprint_id`, `store_links`, `artwork_url` and `account_href`, named as the
  page names it.
- a `match` card is never replaced. a match that disagrees with the row stays a match.
- an open `ID - ID` row names nothing, so the card is as it was and `in_set.row` is null.
- the recognition keeps a `set_row` entry (row, card kind and name, agrees, applied) so disagreements
  between the engines and the page can be counted. it is not sent to the phone.

the phone needs no change: `placedHead` already reads `in_set.row`, the guess block already reads
`card.candidate`, and `sureLine` already prefers `confidence_line` when it is present.
