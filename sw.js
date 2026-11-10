/* groovesmaxxing service worker (phase 5, pwa shell; offline rework 2026-11-09).
   network first with a short wait: a page that has not answered in 3.5 s (a file in 4 s) comes from the
   phone when the phone has it, and a 5xx falls back to the phone copy too. a late answer still refreshes
   the copy. only same-origin GET requests are ever cached. the api host is never touched.
   four caches:
   - CACHE (gmx-vNN): the SHELL list below. bump_asset.py moves the number; only this one is replaced.
   - PRE (gmx-precache): the longer list in precache.json, kept in step with that list, never wiped.
   - PAGES (gmx-pages): pages opened while browsing, saved without their query, newest PAGES_MAX kept.
   - FILES (gmx-files): other files those pages pulled in (covers, data), newest FILES_MAX kept.
   so a cache-name bump refreshes the shell and keeps every saved page. urls carrying a one-time token
   (signin=, delete=, token=) go to the network only and are never written to the phone. */
var CACHE = 'gmx-v56';
var PRE = 'gmx-precache', PAGES = 'gmx-pages', FILES = 'gmx-files';
var PAGES_MAX = 150, FILES_MAX = 250;   // about 30 mb with the precache, inside what an iphone allows
var SHELL = ['/scan', '/more', '/gmx-clips.js', '/gmx-scan.js?v=9', '/gmx-refresh.js?v=1', '/gmx-nav.js?v=38', '/gmx-lang.js?v=12', '/gmx-nav.css?v=22', '/gmx-account.js?v=22', '/gmx-account.css?v=2', '/gmx-read.css?v=10', '/gmx-more.js?v=3','/gmx-player.js?v=1', '/gmx-player.css?v=3', '/gmx-artist.js?v=1', '/gmx-artist.css?v=1', '/gmx-sets.js?v=1', '/search', '/gmx-profile.css?v=4', '/gmx-label.css?v=3', '/gmx-capture-worklet.js', '/gmx-fonts.css?v=2', '/fonts/poppins-400-latin.woff2', '/fonts/poppins-600-latin.woff2', '/fonts/poppins-900-latin.woff2', '/fonts/jetbrainsmono-600-latin.woff2', '/fonts/jetbrainsmono-700-latin.woff2', '/artists-index.json', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/badge-96.png', '/favicon.svg', '/offline', '/gmx-offline.js?v=1', '/gmx-config.json', '/gmx-install.js'];
var ONCE = /[?&](signin|delete|token)=/i;
var WAIT_PAGE = 3500, WAIT_FILE = 4000;

/* last resort, only if the /offline page itself is missing from the phone. both languages, because the
   worker cannot read the visitor's pick. an empty href reloads the address that failed. */
var OFFLINE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' +
  '<meta name="robots" content="noindex"><title>offline · groovesMAXXING</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B0D;color:#F2F2EF;font-family:Poppins,sans-serif;text-align:center;padding:24px}' +
  'h1{font-weight:900;font-size:2rem;margin:0 0 10px}h1 span{color:#FF1C02}p{color:#c9c9c4;font-size:.95rem;line-height:1.7;max-width:330px;margin:0 auto 14px}' +
  'a{color:#FF1C02;text-decoration:none}</style></head><body><div>' +
  '<h1>no signal<span>.</span></h1>' +
  '<p>this page is not saved on your phone yet. the pages you already opened still work. <a href="">try again</a></p>' +
  '<p lang="es">sin señal. esta página todavía no está guardada en tu celular. las páginas que ya abriste siguen funcionando. <a href="">intenta de nuevo</a></p>' +
  '</div></body></html>';

function noop() {}
function later(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function abs(u) { return new URL(u, self.location.origin).href; }
function pathKey(url) { return url.origin + url.pathname; }
function isPage(url) { var p = url.pathname; return p.slice(-1) === '/' || p.split('/').pop().indexOf('.') < 0; }
var SHELL_SET = {};
SHELL.forEach(function (u) { SHELL_SET[abs(u)] = 1; });

/* run fn over list, n at a time, so a top-up never opens 150 requests at once */
function pool(list, n, fn) {
  var i = 0;
  function next() { if (i >= list.length) return Promise.resolve(); var x = list[i++]; return Promise.resolve().then(function () { return fn(x); }).then(next, next); }
  var w = [];
  for (var k = 0; k < n; k++) w.push(next());
  return Promise.all(w);
}
function trim(c, max) {
  return c.keys().then(function (ks) {
    if (ks.length <= max) return;
    return Promise.all(ks.slice(0, ks.length - max).map(function (k) { return c.delete(k); }));
  });
}
/* a response that came through a redirect cannot answer a navigation, so hand back a plain copy */
function plain(r) {
  if (!r || !r.redirected) return Promise.resolve(r);
  return r.blob().then(function (b) { return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); });
}
function lookup(key) {
  function inCache(name) { return function (hit) { return hit || caches.open(name).then(function (c) { return c.match(key); }); }; }
  return Promise.resolve(null).then(inCache(CACHE)).then(inCache(PRE)).then(inCache(PAGES)).then(inCache(FILES))
    .then(function (hit) { return hit || caches.match(key); })   // an old gmx-vNN cache, until the top-up folds it in
    .catch(function () { return null; });
}
/* a fresh copy replaces the one already on the phone wherever it lives; anything new goes to PAGES or FILES
   (trimmed to the newest every 10th write, so a page full of covers does not list the cache 30 times) */
var puts = 0;
function trimAll() {
  return Promise.all([caches.open(PAGES).then(function (c) { return trim(c, PAGES_MAX); }), caches.open(FILES).then(function (c) { return trim(c, FILES_MAX); })]);
}
function store(key, res, page) {
  function tryIn(name) { return caches.open(name).then(function (c) { return c.match(key).then(function (h) { return h ? c.put(key, res).then(function () { return true; }) : false; }); }); }
  return tryIn(CACHE).then(function (ok) { return ok || tryIn(PRE); }).then(function (ok) {
    if (ok) return;
    var name = page ? PAGES : FILES;
    return caches.open(name).then(function (c) { return c.put(key, res).then(function () { if (++puts % 10 === 0) return trimAll(); }); });
  }).catch(noop);
}
function offlinePage() {
  return caches.open(CACHE).then(function (c) { return c.match('/offline'); }).then(function (h) {
    return h ? plain(h) : new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }).catch(function () { return new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); });
}

function respond(e, req, url) {
  var page = req.mode === 'navigate';
  var once = ONCE.test(url.search);
  var key = page ? pathKey(url) : req;   // a page is saved once, without ?ref= / utm / share-target queries
  var net = page && e.preloadResponse
    ? Promise.resolve(e.preloadResponse).then(function (p) { return p || fetch(req); }, function () { return fetch(req); })
    : fetch(req);
  function saved() { return lookup(key).then(function (h) { return h || (page ? lookup(req) : null); }); }
  return new Promise(function (resolve) {
    var done = false;
    function give(r) { if (!done && r) { done = true; resolve(r); } }
    var timer = setTimeout(function () { saved().then(function (h) { if (h) return plain(h).then(give); }).catch(noop); }, page ? WAIT_PAGE : WAIT_FILE);
    var work = net.then(function (res) {
      clearTimeout(timer);
      var keep = null;
      if (res && res.status === 200 && res.type === 'basic' && !once) keep = store(key, res.clone(), page);
      if (res && res.status >= 500) {
        return Promise.all([keep, saved().then(function (h) { return h ? plain(h).then(give) : give(res); })]);
      }
      give(res);
      return keep;
    }, function () {
      clearTimeout(timer);
      return saved().then(function (h) {
        if (h) return plain(h).then(give);
        if (page) return offlinePage().then(give);
        give(Response.error());
      });
    }).catch(function () { give(Response.error()); });
    e.waitUntil(work);
  });
}

/* the top-up: precache.json names every tracklist, the hubs, the data. it runs only when a page inside the
   installed app asks for it (gmx-nav.js posts {gmx:'topup'}; contract C4, cr-pwa-4: now that every page
   registers the worker, a drive-by browser visit must not pull the ~2 mb list), never inside activation (a
   page waiting on an activating worker waits for every fetch), 4 at a time, at most once an hour (the time
   is kept in the cache, because the browser stops an idle worker and memory resets), and not on data saver
   or a 2g link. it also folds the old gmx-vNN caches into the stable ones, then deletes them; activation
   does that fold on its own (no downloads), so token keys in an old cache go on every phone. */
var lastTopUp = 0, topping = null;
function due() {
  if (Date.now() - lastTopUp < 36e5) return Promise.resolve(false);
  return caches.open(CACHE).then(function (c) { return c.match('/__gmx_topup'); })
    .then(function (r) { return r ? r.text() : '0'; })
    .then(function (t) { lastTopUp = Number(t) || 0; return Date.now() - lastTopUp >= 36e5; })
    .catch(function () { return true; });
}
function maybeTopUp(wait) {
  if (topping) return topping;
  return due().then(function (go) {
    if (!go || topping) return topping;
    lastTopUp = Date.now();
    topping = later(wait).then(topUp).catch(noop).then(function () { topping = null; });
    return topping;
  });
}
function fold(want) {
  return caches.keys().then(function (names) {
    var old = names.filter(function (n) { return /^gmx-v\d+$/.test(n) && n !== CACHE; });
    if (!old.length) return;
    return Promise.all([caches.open(PRE), caches.open(PAGES), caches.open(FILES)]).then(function (cs) {
      return pool(old, 1, function (n) {
        return caches.open(n).then(function (o) {
          return o.keys().then(function (ks) {
            return pool(ks, 4, function (k) {
              var u = new URL(k.url);
              if (ONCE.test(u.search) || u.pathname === '/__gmx_topup' || SHELL_SET[k.url]) return;
              var to, key;
              if (want[k.url]) { to = cs[0]; key = k; }
              else if (isPage(u)) { to = cs[1]; key = pathKey(u); if (SHELL_SET[key]) return; }
              else { to = cs[2]; key = k; }
              return to.match(key).then(function (h) { return h ? null : o.match(k).then(function (r) { return r && to.put(key, r); }); });
            });
          });
        }).then(function () { return caches.delete(n); });
      }).then(trimAll);
    });
  }).catch(noop);
}
/* a file tagged ?v= never changes under its tag. an untagged one is asked again once a day with its etag
   (a 304 costs nothing), or fetched again after a week when the server sends no etag. now (the first top-up
   under a new cache name, when a ?v= bump just moved the tags the saved pages load) asks every untagged one
   again whatever its age, so the precached pages pick up the new tags in the same pass. */
function refresh(c, u, hit, now) {
  var req = new Request(u, { cache: 'no-cache' });
  if (!hit) return c.add(req).catch(noop);
  if (/[?&]v=\d/.test(u)) return null;
  var age = Date.now() - (Date.parse(hit.headers.get('date') || '') || Date.now());
  var tag = hit.headers.get('etag');
  if (tag && (now || age > 864e5)) {
    return fetch(new Request(u, { cache: 'no-store', headers: { 'If-None-Match': tag } })).then(function (r) {
      if (r.status === 304) {
        return hit.blob().then(function (b) {
          var h = new Headers(hit.headers); h.set('date', new Date().toUTCString());
          return c.put(u, new Response(b, { status: 200, statusText: 'OK', headers: h }));
        });
      }
      if (r.status === 200 && r.type === 'basic') return c.put(u, r);
    }).catch(noop);
  }
  if (!tag && (now || age > 7 * 864e5)) return c.add(req).catch(noop);
  return null;
}
function topUp() {
  var now = false;
  return caches.open(CACHE).then(function (s) { return s.match('/__gmx_topup'); }).then(function (m) { now = !m; }, noop).then(function () {
    return fetch('/precache.json', { cache: 'no-store' });
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.urls) return;
    var want = {}, list = [];
    j.urls.forEach(function (u) { var a = abs(u); if (!SHELL_SET[a] && !want[a]) { want[a] = 1; list.push(a); } });
    return fold(want).then(function () {
      var cn = self.navigator && self.navigator.connection;
      if (cn && (cn.saveData || /2g/.test(cn.effectiveType || ''))) return;   // try again on a better link
      return Promise.all([caches.open(PRE), caches.open(FILES)]).then(function (cs) {
        var c = cs[0], files = cs[1];
        /* what the list no longer names (an old ?v= tag, a removed page) moves to FILES instead of going: a page saved
           before the bump still loads the old tag offline, and the FILES limit retires it later */
        return c.keys().then(function (ks) {
          return pool(ks.filter(function (k) { return !want[k.url]; }), 4, function (k) {
            return c.match(k).then(function (r) { return r && files.put(k, r); }).then(function () { return c.delete(k); });
          });
        }).then(trimAll).then(function () {
          return pool(list, 4, function (u) { return c.match(u).then(function (hit) { return refresh(c, u, hit, now); }); });
        });
      }).then(function () {
        return caches.open(CACHE).then(function (s) { return s.put('/__gmx_topup', new Response(String(Date.now()))); });
      });
    });
  }).catch(noop);
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'no-cache' })).catch(noop);   // revalidate, never a 4 hour old copy
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  var np = self.registration.navigationPreload;
  /* the one step activation waits on, with no network: one-time token urls an old worker saved leave the phone now,
     even when the browser stops this worker before the fold below has run (safari stops idle workers early) */
  e.waitUntil(Promise.all([dropOnce(), Promise.resolve(np ? np.enable().catch(noop) : null)]).then(function () { return self.clients.claim(); }));
  foldOld();   // not waited on: see the top-up note above
});
function dropOnce() {
  return caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return /^gmx-v\d+$/.test(n) && n !== CACHE; }).map(function (n) {
      return caches.open(n).then(function (c) {
        return c.keys().then(function (ks) {
          return Promise.all(ks.filter(function (k) { return ONCE.test(new URL(k.url).search); }).map(function (k) { return c.delete(k); }));
        });
      });
    }));
  }).catch(noop);
}
/* fold the old gmx-vNN caches without topping up: one small json read, only when an old cache is there */
function foldOld() {
  return caches.keys().then(function (names) {
    if (!names.some(function (n) { return /^gmx-v\d+$/.test(n) && n !== CACHE; })) return;
    return fetch('/precache.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        var want = {};
        if (j && j.urls) j.urls.forEach(function (u) { var a = abs(u); if (!SHELL_SET[a]) want[a] = 1; });
        return fold(want);
      });
  }).catch(noop);
}
self.addEventListener('message', function (e) {
  if (e.data && e.data.gmx === 'topup') e.waitUntil(maybeTopUp(0));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) return;   // media ranges go straight to the network (a 206 cannot be cached)
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  e.respondWith(respond(e, req, url));
});

/* push (2026-10-11): the recognizer tells this phone when an ID it follows comes out or gets a
   name. the payload is a small json {title, body, url}; a tap opens the url, or the scan page. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'groovesMAXXING', {
    body: d.body || '', icon: '/icon-192.png', badge: '/badge-96.png', tag: d.alert_id || undefined,
    data: { url: d.url || '/scan' }
  }));
});
/* a tap: a same-origin url reuses the open app window (a new window when the browser refuses), any other
   https url opens in its own window and never replaces the app, anything else goes to the scan page. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var home = new URL('/scan', self.location.origin), u;
  try { u = new URL((e.notification.data && e.notification.data.url) || '/scan', self.location.origin); } catch (x) { u = home; }
  if (u.origin !== self.location.origin && u.protocol !== 'https:') u = home;
  var same = u.origin === self.location.origin;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    if (same) {
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        if (w.url.indexOf(self.location.origin) === 0 && 'focus' in w && 'navigate' in w) {
          return w.focus().then(function (f) { return (f || w).navigate(u.href); })
            .then(function (c) { if (!c) return self.clients.openWindow(u.href); })
            .catch(function () { return self.clients.openWindow(u.href); });
        }
      }
    }
    return self.clients.openWindow(u.href);
  }));
});
