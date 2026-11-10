/* gmx-offline: the installed app's offline page (2026-11-09).
   sw.js serves /offline under the address that failed, so "try again" and coming back online reload that
   same address. it also lists what this phone already has: the saved hubs, how many tracklists, and the
   pages opened most recently (read from the worker's caches, titles from the saved copies).
   no inline handlers (csp), no storage of its own, nothing sent anywhere. */
(function () {
  var direct = /^\/offline(\.html)?$/.test(location.pathname);   // opened at its own address
  var target = direct ? '/' : location.href;
  var left = false;
  function retry() { if (left) return; left = true; if (direct) location.href = '/'; else location.reload(); }

  var btn = document.getElementById('off-retry');
  if (btn) btn.addEventListener('click', function () { left = false; retry(); });
  /* opened at its own address there is nothing to come back to, so only the button acts */
  if (!direct) window.addEventListener('online', function () { setTimeout(retry, 400); });
  /* one bar or a captive portal never fires "online", so ask the network quietly while the page is in view.
     HEAD is not GET, so the worker lets it through to the network. */
  function probe() {
    if (direct || left || document.visibilityState !== 'visible' || navigator.onLine === false) return;
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 5000);
    fetch(target, { method: 'HEAD', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (r.ok) retry(); }, function () { clearTimeout(t); });
  }
  setInterval(probe, 15000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(probe, 300); });

  if (!('caches' in window)) return none();
  var box = document.getElementById('off-saved'), hubsEl = document.getElementById('off-hubs'), recentEl = document.getElementById('off-recent');
  if (!box || !hubsEl || !recentEl) return;
  var HUBS = [['/', 'home'], ['/tracklists/', 'every tracklist'], ['/sets', 'sets'], ['/crate', 'your crate'], ['/artists', 'artists'],
    ['/labels', 'labels'], ['/upcoming', 'dropping soon'], ['/radio', 'radio'], ['/search', 'search']];
  var hubPaths = {};
  HUBS.forEach(function (h) { hubPaths[h[0]] = 1; });
  var here = location.pathname;

  function none() { var n = document.getElementById('off-none'); if (n) n.hidden = false; }
  function has(u) { return caches.match(u).then(function (r) { return !!r; }, function () { return false; }); }
  function keysOf(name) {
    return caches.has(name).then(function (ok) { return ok ? caches.open(name).then(function (c) { return c.keys(); }) : []; }).catch(function () { return []; });
  }
  function isPage(p) { return p.slice(-1) === '/' || p.split('/').pop().indexOf('.') < 0; }
  function decode(s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }
  /* the title from the first few kilobytes of the saved copy, without reading a 300 kb page whole */
  function titleOf(req) {
    return caches.match(req).then(function (r) {
      if (!r || !r.body || !r.body.getReader) return r ? r.text().then(pick) : '';
      var rd = r.body.getReader(), dec = new TextDecoder(), s = '';
      function step() {
        return rd.read().then(function (x) {
          if (!x.done) s += dec.decode(x.value, { stream: true });
          if (x.done || s.length > 24000 || s.indexOf('</title>') > -1) { try { rd.cancel(); } catch (e) {} return pick(s); }
          return step();
        });
      }
      return step();
    }).catch(function () { return ''; });
  }
  function pick(s) {
    var m = /<title>([^<]*)<\/title>/i.exec(s || '');
    return m ? decode(m[1]).replace(/\s*[·|–-]\s*groovesmaxxing\s*$/i, '').trim() : '';
  }
  function pill(href, label, count) {
    var a = document.createElement('a');
    a.className = 'r'; a.href = href;
    var s = document.createElement('span'); s.textContent = label; a.appendChild(s);
    if (count) { var c = document.createElement('span'); c.setAttribute('translate', 'no'); c.textContent = ' · ' + count; a.appendChild(c); }
    return a;
  }

  Promise.all([
    Promise.all(HUBS.map(function (h) { return has(h[0]); })),
    keysOf('gmx-precache'), keysOf('gmx-pages')
  ]).then(function (got) {
    var hubHas = got[0], pre = got[1], pages = got[2];
    // only the installed app tops up gmx-precache (every tracklist and /sets), so promise them only when it holds something
    if (pre.length) { var fa = document.getElementById('off-foot-all'), fo = document.getElementById('off-foot'); if (fa && fo) { fa.hidden = false; fo.hidden = true; } }
    var tl = {};
    pre.concat(pages).forEach(function (k) { var p = new URL(k.url).pathname; if (/^\/tracklists\/[^/]+$/.test(p)) tl[p] = 1; });
    var tlCount = Object.keys(tl).length;
    var shown = 0;
    HUBS.forEach(function (h, i) {
      if (!hubHas[i] || h[0] === here) return;
      hubsEl.appendChild(pill(h[0], h[1], h[0] === '/tracklists/' && tlCount ? tlCount : 0));
      shown++;
    });
    var seen = {}, recent = [];
    for (var i = pages.length - 1; i >= 0 && recent.length < 10; i--) {   // newest last in a cache, so walk back
      var u = new URL(pages[i].url), p = u.pathname;
      if (u.origin !== location.origin || !isPage(p) || p === here || hubPaths[p] || seen[p] || /^\/offline/.test(p)) continue;
      seen[p] = 1; recent.push(pages[i]);
    }
    return Promise.all(recent.map(function (k) { return titleOf(k); })).then(function (titles) {
      recent.forEach(function (k, j) {
        var p = new URL(k.url).pathname;
        var li = document.createElement('li'), a = document.createElement('a'), sm = document.createElement('small');
        a.href = p;
        a.appendChild(document.createTextNode(titles[j] || p));
        a.setAttribute('translate', 'no');
        sm.textContent = p;
        a.appendChild(sm);
        li.appendChild(a); recentEl.appendChild(li);
        shown++;
      });
      if (!recent.length) recentEl.hidden = true;
      if (shown) box.hidden = false; else none();
    });
  }).catch(none);
})();
