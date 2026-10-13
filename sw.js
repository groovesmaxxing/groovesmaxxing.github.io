/* groovesmaxxing service worker (phase 5, pwa shell).
   network first, cache fallback, offline page in the voice.
   only same-origin GET requests are ever cached. the api host is never touched. */
var CACHE = 'gmx-v18';
var SHELL = ['/scan', '/more', '/gmx-clips.js', '/gmx-refresh.js', '/gmx-nav.js?v=16', '/gmx-nav.css?v=16', '/gmx-account.js?v=16', '/gmx-account.css', '/gmx-read.css?v=2','/gmx-player.js', '/gmx-player.css', '/gmx-sets.js', '/search', '/gmx-profile.css', '/gmx-label.css', '/gmx-capture-worklet.js', '/gmx-fonts.css', '/fonts/poppins-400-latin.woff2', '/fonts/poppins-600-latin.woff2', '/fonts/poppins-900-latin.woff2', '/fonts/spacemono-400-latin.woff2', '/fonts/spacemono-700-latin.woff2', '/artists-index.json', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

var OFFLINE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' +
  '<title>offline · groovesMAXXING</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B0D;color:#F2F2EF;font-family:Poppins,sans-serif;text-align:center;padding:24px}' +
  'h1{font-weight:900;font-size:2rem;margin:0 0 10px}h1 span{color:#FF1C02}p{font-family:"Space Mono",monospace;color:#8A8A93;font-size:.9rem;line-height:1.7;max-width:320px;margin:0 auto}' +
  'a{color:#FF1C02;text-decoration:none}</style></head><body><div>' +
  '<h1>no signal, <span>no scan.</span></h1>' +
  '<p>the recognizer needs the internet. every <a href="/tracklists/">tracklist</a>, the radar and the pages you already opened still work. <a href="/scan">try again</a> when you are back on.</p>' +
  '</div></body></html>';

/* the shell installs at once. the longer list in precache.json (every tracklist, the hubs, the data) comes
   in behind it, and tops up once an hour while the app is open, so a tracklist opened in a basement with
   no signal still loads. */
function topUp() {
  return fetch('/precache.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.urls) return;
    return caches.open(CACHE).then(function (c) {
      return Promise.all(j.urls.map(function (u) {
        return c.match(u).then(function (hit) { return hit ? null : c.add(u).catch(function () {}); });
      }));
    });
  }).catch(function () {});
}
var lastTopUp = 0;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }).then(function () { lastTopUp = Date.now(); return topUp(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' && Date.now() - lastTopUp > 36e5) { lastTopUp = Date.now(); e.waitUntil(topUp()); }
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') {
          return new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return Response.error();
      });
    })
  );
});

/* push (2026-10-11): the recognizer tells this phone when an ID it follows comes out or gets a
   name. the payload is a small json {title, body, url}; a tap opens the url, or the scan page. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'groovesmaxxing', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.alert_id || undefined,
    data: { url: d.url || '/scan' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/scan';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(self.location.origin) === 0 && 'focus' in list[i]) { list[i].navigate(url); return list[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
