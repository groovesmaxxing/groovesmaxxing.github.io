/* gmx-spooky.js — temporary halloween skin for groovesmaxxing.com (spooky szn 2026).
   self-switching: runs only until END, then does nothing, so it can ship early and never needs a revert to go dark.
   level 1 "crawl": orange accents, corner cobwebs, a few spiders walking the page, the carved grin (logo A) in the hero, the featured sets swapped for ones recorded on halloween.
   level 2 "drop": + spiders lowering on silk from the top, bats crossing the hero now and then.
   level 3 "haunt": + low fog along the bottom, headings flicker like a dying bulb once in a while.
   respects prefers-reduced-motion (webs and colors only). visitors can turn it off: the 🕸 toggle, kept in localStorage.
   preview a level with ?spooky=1|2|3, force off with ?spooky=0. */
(function () {
  var END = new Date('2026-11-02T06:00:00Z');                       // the morning after halloween, US time
  var q = (location.search.match(/[?&]spooky=(\d)/) || [])[1];
  var LEVEL = q != null ? +q : (window.GMX_SPOOKY_LEVEL || 2);
  if (q == null && new Date() > END) return;
  try { if (q == null && localStorage.getItem('gmx-spooky-off') === '1') LEVEL = 0; } catch (e) {}
  var ORANGE = '#FF6A00', DEEP = '#E05500', NIGHT = '#0B0B0D', DAY = '#F2F2EF';
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function css(t) { var s = document.createElement('style'); s.id = 'gmx-spooky-css'; s.textContent = t; document.head.appendChild(s); }
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; }

  function toggle() {
    var b = el('button', { id: 'gmx-spooky-toggle', 'aria-label': LEVEL ? 'turn off halloween mode' : 'turn on halloween mode', title: 'halloween mode' }, '🕸');
    b.onclick = function () { try { localStorage.setItem('gmx-spooky-off', LEVEL ? '1' : '0'); } catch (e) {} location.reload(); };
    document.body.appendChild(b);
  }

  var WEB = '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">' +
    [0, 15, 30, 45, 60, 75, 90].map(function (a) { var r = a * Math.PI / 180; return '<line x1="0" y1="0" x2="' + (200 * Math.cos(r)).toFixed(1) + '" y2="' + (200 * Math.sin(r)).toFixed(1) + '"/>'; }).join('') +
    [40, 75, 110, 145, 180].map(function (R) {
      var d = '', pts = [0, 15, 30, 45, 60, 75, 90].map(function (a) { var r = a * Math.PI / 180; return [R * Math.cos(r), R * Math.sin(r)]; });
      pts.forEach(function (p, i) { if (!i) { d += 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); return; } var o = pts[i - 1], mx = (o[0] + p[0]) / 2 * 0.86, my = (o[1] + p[1]) / 2 * 0.86; d += ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
      return '<path d="' + d + '"/>';
    }).join('') + '</svg>';

  // the carved grin (logo option A): only the light through the cuts, our waveform as the teeth. black, white, orange only.
  var GRIN = '<path d="M38 92 L104 108 L96 72 Z"/><path d="M202 92 L136 108 L144 72 Z"/>' +
    '<path d="M6 130 L30 130 L48 98 L68 160 L88 106 L108 150 L120 128 L132 150 L152 106 L172 160 L192 98 L210 130 L234 130 C214 196 26 196 6 130 Z"/>';
  var JACK = '<svg class="mark gmx-jack" viewBox="0 0 240 240" role="img" aria-label="groovesMAXXING, carved">' +
    '<defs><radialGradient id="gmxfire" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#FFF4E6"/><stop offset=".25" stop-color="#FFC27A"/><stop offset=".6" stop-color="' + ORANGE + '"/><stop offset="1" stop-color="#7A2A00"/></radialGradient>' +
    '<filter id="gmxglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9" result="b"/><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="s"/><feMerge><feMergeNode in="b"/><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<filter id="gmxrough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter></defs>' +
    '<g filter="url(#gmxglow)"><g filter="url(#gmxrough)" fill="url(#gmxfire)">' + GRIN + '</g></g>' +
    '<g fill="#000"><path d="M86 174 L97 154 L107 175 Z"/><path d="M133 175 L143 154 L154 174 Z"/></g></svg>';

  // this week's featured sets: recorded on halloween, legit channels only (own channel or tier A), house and techno lane
  var SETS = [
    ['uGP3VX1Jfns', 'HUGEL b2b CID b2b Westend @ Escape Halloween', 'escape halloween · san bernardino · 2023'],
    ['F0hqU_IzxYA', 'BLOND:ISH @ Factory Town, Halloween', 'factory town · miami · 2025'],
    ['GKiP1R5hOtw', 'Maya Jane Coles @ Drumcode Halloween', 'tobacco dock · london · dj mag'],
    ['zkyFPse9ayQ', 'MEDUZA @ Escape Halloween', 'escape halloween · california · 2024'],
    ['257wOj5Eh5o', 'Justin Jay @ Boiler Room x Escape Halloween', 'boiler room · escape halloween'],
    ['odRsmrpFaz8', 'Joanna Kuchta @ Boiler Room x Escape Halloween', 'boiler room · escape halloween'],
    ['CnYSCQU9GJA', 'Dana Montana @ Boiler Room x Escape Halloween', 'boiler room · escape halloween'],
    ['U6Ckqc_2BWI', 'Mason Collective @ Club Space, Halloween', 'club space · miami · 2022'],
    ['mZvLdaGK-ls', 'Will Clarke @ Escape Halloween', 'escape halloween · 2021'],
    ['qaPxGzkn9YI', 'Duke Dumont @ Escape Halloween', 'insomniac · rave-a-thon']
  ];
  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function halloweenSets() {                                       // swap the "sets worth your hour" rail before its carousel script runs
    var rail = document.querySelector('.set-stage[data-label="set"] .set-rail'); if (!rail || rail.dataset.spooky) return;
    rail.dataset.spooky = '1';
    rail.innerHTML = SETS.map(function (x) {
      return '<div class="set-slide"><button class="set-facade" type="button" data-yt="' + x[0] + '" data-title="' + esc(x[1]) + '" aria-label="play ' + esc(x[1]) + '">' +
        '<img src="https://img.youtube.com/vi/' + x[0] + '/maxresdefault.jpg" data-fallback="https://img.youtube.com/vi/' + x[0] + '/hqdefault.jpg" alt="" loading="lazy">' +
        '<span class="set-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></button>' +
        '<div class="set-meta"><span class="t">' + esc(x[1]) + '</span><span class="mono" style="color:#F2F2EF;opacity:.7">' + esc(x[2]) + '</span></div></div>';
    }).join('');
    var h = rail.closest('section') && rail.closest('section').querySelector('h2'); if (h) h.textContent = 'recorded on halloween';
  }

  function base() {
    var r = document.documentElement.style; r.setProperty('--racing', ORANGE); r.setProperty('--deep', DEEP);
    r.setProperty('--steel', DAY); r.setProperty('--paper', DAY);                 // black, white, orange only (G-MO 2026-10-27)
    css(
      '.gmx-web{position:fixed;top:0;width:min(26vw,190px);height:min(26vw,190px);color:rgba(242,242,239,.22);pointer-events:none;z-index:40}' +
      '.gmx-web.l{left:0}.gmx-web.r{right:0;transform:scaleX(-1)}' +
      '#gmx-spooky-toggle{position:fixed;left:12px;bottom:84px;z-index:60;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,106,0,.5);background:rgba(11,11,13,.8);font-size:18px;cursor:pointer}' +
      '#gmx-spooky-canvas{position:fixed;inset:0;pointer-events:none;z-index:39}' +
      '.gmx-jack{animation:gmxcandle 3.2s infinite}@keyframes gmxcandle{0%,100%{filter:brightness(1)}8%{filter:brightness(.8)}10%{filter:brightness(1.08)}43%{filter:brightness(.9)}45%{filter:brightness(1.05)}71%{filter:brightness(.76)}73%{filter:brightness(1)}}' +
      // the ripple shader, the corner marks, the header mark and the scan disc hard-code racing red, this turns them pumpkin
      '.hero .hero-fx,.gmx-cfx,.gmx-cmark,.gmx-hmark,.lib-mark,.gmx-scan,.gmx-disc{filter:hue-rotate(20deg) saturate(1.15)}' +
      '.gmx-fog{position:fixed;left:-10%;right:-10%;bottom:-40px;height:180px;pointer-events:none;z-index:38;background:radial-gradient(60% 70% at 30% 100%,rgba(242,242,239,.10),transparent 70%),radial-gradient(50% 60% at 75% 100%,rgba(242,242,239,.08),transparent 70%);animation:gmxfog 18s ease-in-out infinite alternate}' +
      '@keyframes gmxfog{to{transform:translateX(6%)}}' +
      '.gmx-flicker{animation:gmxflick 7s infinite}@keyframes gmxflick{0%,91%,100%{opacity:1}92%{opacity:.25}93%{opacity:1}95%{opacity:.4}96%{opacity:1}}'
    );
    document.body.appendChild(el('div', { class: 'gmx-web l', 'aria-hidden': 'true' }, WEB));
    document.body.appendChild(el('div', { class: 'gmx-web r', 'aria-hidden': 'true' }, WEB));
    var m = document.querySelector('.hero .mark');
    if (m) { var w = document.createElement('div'); w.innerHTML = JACK; m.replaceWith(w.firstChild); }
  }

  // spiders and bats on one canvas above the page (pointer-events none), small and few so reading stays easy
  function critters() {
    var c = el('canvas', { id: 'gmx-spooky-canvas', 'aria-hidden': 'true' }); document.body.appendChild(c);
    var x = c.getContext('2d'), W, H, dpr = Math.min(2, window.devicePixelRatio || 1), mouse = { x: -999, y: -999 };
    function size() { W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); addEventListener('resize', size); addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
    var n = W < 700 ? 3 : 6, sp = [];
    function spawn(s) {
      s = s || {}; var edge = Math.random() * 4 | 0;
      s.x = edge === 1 ? W + 20 : edge === 3 ? -20 : Math.random() * W; s.y = edge === 0 ? -20 : edge === 2 ? H + 20 : Math.random() * H;
      s.a = Math.atan2(H / 2 - s.y + (Math.random() - .5) * H, W / 2 - s.x + (Math.random() - .5) * W);
      s.v = .35 + Math.random() * .6; s.r = 6 + Math.random() * 4; s.t = Math.random() * 100; s.pause = 0; s.silk = null; return s;
    }
    for (var i = 0; i < n; i++) sp.push(spawn());
    if (LEVEL >= 2) for (i = 0; i < (W < 700 ? 1 : 2); i++) sp.push({ silk: true, x: 80 + Math.random() * (W - 160), y: -10, top: 0, goal: 120 + Math.random() * H * .5, v: .5, r: 5, t: 0, dir: 1, wait: 200 + Math.random() * 400 });
    var bats = [], nextBat = 400;
    function spider(s) {
      x.save(); x.translate(s.x, s.y); x.rotate(s.silk ? Math.PI / 2 : s.a); var r = s.r, g = Math.sin(s.t * .35);
      // two passes, a pale rim then the black spider, so it reads on the night sections and the paper ones
      [[ 'rgba(242,242,239,.5)', r * .18 + 2.2, 1.6 ], [ '#0B0B0D', r * .18, 0 ]].forEach(function (p) {
        x.strokeStyle = p[0]; x.fillStyle = p[0]; x.lineWidth = Math.max(1, p[1]);
        for (var k = 0; k < 4; k++) for (var sd = -1; sd <= 1; sd += 2) {
          var ph = (k % 2 ? g : -g) * .35, bx = (k - 1.5) * r * .45, kx = bx + r * (k - 1.5) * .35, ky = sd * r * 1.3, fx = kx + (k - 1.5) * r * .4 + ph * r, fy = sd * r * 2.1;
          x.beginPath(); x.moveTo(bx, 0); x.quadraticCurveTo(kx, ky * 1.25, fx, fy); x.stroke();
        }
        x.beginPath(); x.ellipse(-r * .55, 0, r * .95 + p[2], r * .75 + p[2], 0, 0, 7); x.fill();
        x.beginPath(); x.arc(r * .55, 0, r * .45 + p[2], 0, 7); x.fill();
      });
      x.fillStyle = ORANGE; x.beginPath(); x.arc(r * .75, -r * .16, r * .09, 0, 7); x.arc(r * .75, r * .16, r * .09, 0, 7); x.fill();
      x.strokeStyle = 'rgba(242,242,239,.28)'; x.lineWidth = .6; x.beginPath(); x.moveTo(-r * .9, 0); x.lineTo(-r * .2, 0); x.stroke();
      x.restore();
    }
    function bat(b) {
      x.save(); x.translate(b.x, b.y); var f = Math.sin(b.t * .45) * .9, s = b.s;
      x.fillStyle = 'rgba(11,11,13,.9)'; x.beginPath(); x.moveTo(0, 0);
      x.quadraticCurveTo(-s * .6, -s * (.6 + f), -s * 1.4, -s * f * .8); x.quadraticCurveTo(-s, s * .1, -s * .7, s * .2); x.quadraticCurveTo(-s * .4, 0, 0, s * .3);
      x.quadraticCurveTo(s * .4, 0, s * .7, s * .2); x.quadraticCurveTo(s, s * .1, s * 1.4, -s * f * .8); x.quadraticCurveTo(s * .6, -s * (.6 + f), 0, 0); x.fill();
      x.restore();
    }
    (function tick() {
      x.clearRect(0, 0, W, H);
      sp.forEach(function (s) {
        if (s.silk) {
          if (s.wait > 0) { s.wait--; return; }
          s.y += s.v * s.dir; s.t += .2;
          if (s.dir > 0 && s.y >= s.goal) { s.dir = 0; s.hold = 160 + Math.random() * 200; }
          if (s.dir === 0 && --s.hold <= 0) s.dir = -1;
          if (s.dir < 0 && s.y < -12) { s.y = -10; s.dir = 1; s.x = 80 + Math.random() * (W - 160); s.goal = 120 + Math.random() * H * .5; s.wait = 300 + Math.random() * 600; return; }
          x.strokeStyle = 'rgba(242,242,239,.35)'; x.lineWidth = .7; x.beginPath(); x.moveTo(s.x, 0); x.lineTo(s.x, s.y - s.r); x.stroke(); spider(s); return;
        }
        var dx = s.x - mouse.x, dy = s.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 90) { s.a = Math.atan2(dy, dx); s.pause = 0; s.v = 2.4; } else if (s.v > 1.1) s.v *= .97;
        if (s.pause > 0) { s.pause--; } else {
          s.x += Math.cos(s.a) * s.v; s.y += Math.sin(s.a) * s.v; s.t += s.v;
          if (Math.random() < .006) s.pause = 40 + Math.random() * 90;                // stop, then
          if (Math.random() < .01) s.a += (Math.random() - .5) * 1.4;                 // scuttle off a new way
        }
        if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) spawn(s);
        spider(s);
      });
      if (LEVEL >= 2 && --nextBat <= 0) { var hero = document.querySelector('.hero'), hb = hero ? hero.getBoundingClientRect() : { top: 0, bottom: H * .5 };
        if (hb.bottom > 80) bats.push({ x: -40, y: Math.max(40, hb.top + 60 + Math.random() * Math.max(60, hb.bottom - hb.top - 160)), vx: 2.6 + Math.random() * 1.4, s: 10 + Math.random() * 8, t: 0, wob: Math.random() * 6 });
        nextBat = 500 + Math.random() * 700; }
      bats = bats.filter(function (b) { b.x += b.vx; b.t += 1; b.y += Math.sin(b.t * .05 + b.wob) * .8; bat(b); return b.x < W + 60; });
      requestAnimationFrame(tick);
    })();
  }

  function haunt() {
    document.body.appendChild(el('div', { class: 'gmx-fog', 'aria-hidden': 'true' }));
    var hs = document.querySelectorAll('h1, h2'); for (var i = 0; i < hs.length; i += 3) { hs[i].classList.add('gmx-flicker'); hs[i].style.animationDelay = (i * 1.7 % 7) + 's'; }
  }

  function go() {
    if (LEVEL) { base(); if (!still) { critters(); if (LEVEL >= 3) haunt(); } }
    toggle();
  }
  if (LEVEL) { if (document.readyState === 'loading') document.addEventListener('readystatechange', function () { if (document.readyState === 'interactive') halloweenSets(); }); else halloweenSets(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
