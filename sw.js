/* groovesmaxxing service worker (phase 5, pwa shell).
   network first, cache fallback, offline page in the voice.
   only same-origin GET requests are ever cached. the api host is never touched. */
var CACHE = 'gmx-v1';
var SHELL = ['/scan', '/more.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

var OFFLINE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' +
  '<title>offline · groovesMAXXING</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B0D;color:#F2F2EF;font-family:Poppins,sans-serif;text-align:center;padding:24px}' +
  'h1{font-weight:900;font-size:2rem;margin:0 0 10px}h1 span{color:#FF1C02}p{font-family:"Space Mono",monospace;color:#8A8A93;font-size:.9rem;line-height:1.7;max-width:320px;margin:0 auto}' +
  'a{color:#FF1C02;text-decoration:none}</style></head><body><div>' +
  '<h1>no signal, <span>no scan.</span></h1>' +
  '<p>the recognizer needs the internet. the pages you already opened still work. <a href="/scan">try again</a> when you are back on.</p>' +
  '</div></body></html>';

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
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
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
