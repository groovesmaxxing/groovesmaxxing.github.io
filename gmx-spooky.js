/* gmx-spooky.js — temporary halloween skin for groovesmaxxing.com (spooky szn 2026).
   self-switching: runs only until END, then does nothing, so it can ship early and never needs a revert to go dark.
   level 1 "crawl": orange accents, corner cobwebs, a few spiders walking the page, the original mark carved and lit from inside (logo C2a) in the hero, the featured sets swapped for ones recorded on halloween.
   level 2 "drop": + spiders lowering on silk from the top, bats crossing the hero now and then.
   level 3 "haunt": + low fog along the bottom, headings flicker like a dying bulb once in a while.
   respects prefers-reduced-motion (webs and colors only). visitors can turn it off: the 🕸 toggle in the header row beside the
   sign-in chip (it used to float bottom-left, where a resting thumb switched it off: site review 2026-10-27), kept in localStorage.
   preview a level with ?spooky=1|2|3, force off with ?spooky=0. */
(function () {
  var END = new Date('2026-11-02T06:00:00Z');                       // the morning after halloween, US time
  var q = (location.search.match(/[?&]spooky=(\d)/) || [])[1];
  var LEVEL = q != null ? +q : (window.GMX_SPOOKY_LEVEL || 2);
  if (q == null && new Date() > END) return;
  try { if (q == null && localStorage.getItem('gmx-spooky-off') === '1') LEVEL = 0; } catch (e) {}
  var ORANGE = '#FF6A00', DEEP = '#E05500', NIGHT = '#0B0B0D', DAY = '#F2F2EF';
  var BODY = (location.search.match(/[?&]spookybody=(\w+)/) || [])[1] || window.GMX_SPOOKY_BODY || 'keep';
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function css(t) { var s = document.createElement('style'); s.id = 'gmx-spooky-css'; s.textContent = t; document.head.appendChild(s); }
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; }

  function toggle() {
    /* the glyph is a drawn web, not the 🕸 emoji: that one is dark grey in the system emoji font and vanished on the
       dark header. orange while the skin is on, dim while it is off, so the button also shows the state. */
    var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1"/>' +
      '<path d="M12 6.5q3.9 1.6 5.5 5.5-1.6 3.9-5.5 5.5-3.9-1.6-5.5-5.5 1.6-3.9 5.5-5.5z"/>' +
      '<path d="M12 9.5q2.2.9 2.5 2.5-.3 1.6-2.5 2.5-2.2-.9-2.5-2.5.3-1.6 2.5-2.5z"/></svg>';
    var b = el('button', { id: 'gmx-spooky-toggle', type: 'button', 'aria-label': LEVEL ? 'turn off halloween mode' : 'turn on halloween mode', title: LEVEL ? 'halloween mode: on' : 'halloween mode: off' }, ICON);
    b.onclick = function () { try { localStorage.setItem('gmx-spooky-off', LEVEL ? '1' : '0'); } catch (e) {} location.reload(); };
    /* styled here, not in base(), so the button looks the same when the skin is off and it is the way back on */
    var s = document.createElement('style'); s.id = 'gmx-spooky-toggle-css';
    s.textContent = '#gmx-spooky-toggle{flex:none;position:relative;z-index:3;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;margin:0;border-radius:50%;border:1px solid rgba(255,106,0,.5);background:rgba(11,11,13,.8);color:' + (LEVEL ? ORANGE : '#8A8A93') + ';line-height:1;cursor:pointer}' +
      '#gmx-spooky-toggle:hover,#gmx-spooky-toggle:focus-visible{border-color:' + ORANGE + ';color:' + ORANGE + ';outline:none}' +
      '#gmx-spooky-toggle.fixed{position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:60}';
    document.head.appendChild(s);
    /* into the header row (.gmx-hdr, painted by gmx-account.js once the shell has loaded it), before the chip.
       a page without one after six seconds gets the button fixed at the top right, still out of the thumb zone. */
    function place() { var row = document.querySelector('.gmx-hdr'); if (!row) return false; row.insertBefore(b, row.querySelector('.gmx-chip')); return true; }
    if (place()) return;
    var mo = window.MutationObserver ? new MutationObserver(function () { if (place()) { mo.disconnect(); clearTimeout(t); } }) : null;
    if (mo) mo.observe(document.body, { childList: true, subtree: true });
    var t = setTimeout(function () { if (mo) mo.disconnect(); if (!b.parentNode) { b.className = 'fixed'; document.body.appendChild(b); } }, 6000);
  }

  var WEB = '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">' +
    [0, 15, 30, 45, 60, 75, 90].map(function (a) { var r = a * Math.PI / 180; return '<line x1="0" y1="0" x2="' + (200 * Math.cos(r)).toFixed(1) + '" y2="' + (200 * Math.sin(r)).toFixed(1) + '"/>'; }).join('') +
    [40, 75, 110, 145, 180].map(function (R) {
      var d = '', pts = [0, 15, 30, 45, 60, 75, 90].map(function (a) { var r = a * Math.PI / 180; return [R * Math.cos(r), R * Math.sin(r)]; });
      pts.forEach(function (p, i) { if (!i) { d += 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); return; } var o = pts[i - 1], mx = (o[0] + p[0]) / 2 * 0.86, my = (o[1] + p[1]) / 2 * 0.86; d += ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
      return '<path d="' + d + '"/>';
    }).join('') + '</svg>';

  // the hero mark, carved (logo C2a, G-MO 2026-10-27): the original rings, center and waveform, lit from inside,
  // the candle showing under the waveform teeth. no eyes. black, white, orange only.
  var JACK = '<svg class="mark gmx-jack" viewBox="0 0 240 240" role="img" aria-label="groovesmaxxing logo, carved for halloween">' +
    '<defs><radialGradient id="gmxfire" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#FFF4E6"/><stop offset=".3" stop-color="#FFC27A"/><stop offset=".65" stop-color="' + ORANGE + '"/><stop offset="1" stop-color="#7A2A00"/></radialGradient>' +
    '<radialGradient id="gmxinner" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="' + ORANGE + '" stop-opacity=".55"/><stop offset="1" stop-color="' + ORANGE + '" stop-opacity="0"/></radialGradient>' +
    '<filter id="gmxglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<circle cx="120" cy="120" r="102" fill="url(#gmxinner)"/>' +
    '<path fill="url(#gmxfire)" filter="url(#gmxglow)" d="M30 120 L48 84 L68 150 L88 96 L108 138 L120 114 L132 138 L152 96 L172 150 L192 84 L210 120 Q120 214 30 120 Z"/>' +
    '<g fill="none" stroke="' + ORANGE + '" stroke-width="5"><circle cx="120" cy="120" r="104"/><circle cx="120" cy="120" r="76"/><circle cx="120" cy="120" r="48"/></g>' +
    '<polyline points="6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120" fill="none" stroke="' + DAY + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

  // the site hard-codes racing red in svg attributes (marks, zigzags, the scan disc) and in a few stylesheet rules, where
  // the --racing swap can't reach. G-MO 2026-10-27: "still a lot of red". rewrite those to the halloween orange, and keep
  // watching, since gmx-motion.js and the carousels add marks after load.
  // the red also hides url-encoded (%23ff1c02): the zigzag under every section heading is a data: svg in the stylesheet,
  // and the soundcloud players take their colour from a color= query on the iframe src. both are matched here too.
  var REDS = /(#|%23)ff1c02|(#|%23)cc1400|rgba?\(\s*255\s*,\s*28\s*,\s*2\b|rgba?\(\s*204\s*,\s*20\s*,\s*0\b/gi;
  function swapRed(v) {
    return v.replace(REDS, function (m) {
      var deep = /cc1400|204/i.test(m), hex = deep ? DEEP : ORANGE;
      if (m[0] === '#') return hex;
      if (m[0] === '%') return '%23' + hex.slice(1);
      return deep ? m.replace(/204\s*,\s*20\s*,\s*0/, '224,85,0') : m.replace(/255\s*,\s*28\s*,\s*2/, '255,106,0');
    });
  }
  function recolorNode(n) {
    if (n.nodeType !== 1) return;
    var all = [n].concat([].slice.call(n.querySelectorAll('[fill],[stroke],[stop-color],[style],[color],iframe[src*="%23"]')));
    all.forEach(function (e) {
      ['fill', 'stroke', 'stop-color', 'style', 'color', 'src'].forEach(function (a) {
        if (a === 'src' && e.tagName !== 'IFRAME') return;                          // only the embeds carry a colour in src
        var v = e.getAttribute && e.getAttribute(a); if (v && REDS.test(v)) { REDS.lastIndex = 0; e.setAttribute(a, swapRed(v)); } REDS.lastIndex = 0;
      });
    });
  }
  function recolorSheets() {
    [].forEach.call(document.styleSheets, function (sh) {
      var rules; try { rules = sh.cssRules; } catch (e) { return; }                // cross-origin sheets are skipped
      [].forEach.call(rules || [], function walk(r) {
        if (r.cssRules && r.cssRules.length) [].forEach.call(r.cssRules, walk);   // every rule has a cssRules list now (css nesting), often empty
        if (!r.style || !REDS.test(r.style.cssText)) { REDS.lastIndex = 0; return; } REDS.lastIndex = 0;
        for (var i = 0; i < r.style.length; i++) { var k = r.style[i], v = r.style.getPropertyValue(k); if (REDS.test(v)) { REDS.lastIndex = 0; r.style.setProperty(k, swapRed(v), r.style.getPropertyPriority(k)); } REDS.lastIndex = 0; }
      });
    });
  }
  function recolor() {
    recolorSheets(); recolorNode(document.body);
    new MutationObserver(function (ms) { ms.forEach(function (m) {
      if (m.type === 'attributes') { var v = m.target.getAttribute(m.attributeName); if (v && REDS.test(v)) { REDS.lastIndex = 0; m.target.setAttribute(m.attributeName, swapRed(v)); } REDS.lastIndex = 0; }
      else [].forEach.call(m.addedNodes, recolorNode);
    }); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'fill', 'stroke', 'stop-color'] });
    addEventListener('load', recolorSheets);                                       // late stylesheets
  }

  var FAVICON = "data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 240\"%3E%3Cdefs%3E%3CradialGradient id=\"f\" cx=\"50%25\" cy=\"40%25\" r=\"70%25\"%3E%3Cstop offset=\"0\" stop-color=\"%23FFF4E6\"/%3E%3Cstop offset=\".35\" stop-color=\"%23FFC27A\"/%3E%3Cstop offset=\".7\" stop-color=\"%23FF6A00\"/%3E%3Cstop offset=\"1\" stop-color=\"%239A3600\"/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx=\"120\" cy=\"120\" r=\"118\" fill=\"%230B0B0D\"/%3E%3Cpath fill=\"url%28%23f%29\" d=\"M30 120 L48 84 L68 150 L88 96 L108 138 L120 114 L132 138 L152 96 L172 150 L192 84 L210 120 Q120 214 30 120 Z\"/%3E%3Ccircle cx=\"120\" cy=\"120\" r=\"100\" fill=\"none\" stroke=\"%23FF6A00\" stroke-width=\"16\"/%3E%3Cpolyline points=\"6%2C120 30%2C120 48%2C84 68%2C150 88%2C96 108%2C138 120%2C114 132%2C138 152%2C96 172%2C150 192%2C84 210%2C120 234%2C120\" fill=\"none\" stroke=\"%23F2F2EF\" stroke-width=\"16\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/%3E%3Cg transform=\"translate%28150%2C2%29 scale%28.36%29\"%3E%3Cpath fill=\"%230B0B0D\" d=\"M28 236 L28 106 A92 92 0 0 1 212 106 L212 236 Z\"/%3E%3Cpath fill=\"%23F2F2EF\" d=\"M40 230 L40 110 A80 80 0 0 1 200 110 L200 230 L180 210 L160 230 L140 210 L120 230 L100 210 L80 230 L60 210 Z\"/%3E%3Cellipse cx=\"92\" cy=\"118\" rx=\"16\" ry=\"24\" fill=\"%230B0B0D\"/%3E%3Cellipse cx=\"148\" cy=\"118\" rx=\"16\" ry=\"24\" fill=\"%230B0B0D\"/%3E%3Cellipse cx=\"120\" cy=\"170\" rx=\"12\" ry=\"16\" fill=\"%23FF6A00\"/%3E%3C/g%3E%3C/svg%3E";
  function favicon() {
    [].forEach.call(document.querySelectorAll('link[rel~="icon"]'), function (l) { if (!/apple/.test(l.rel)) l.remove(); });
    var l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = FAVICON; document.head.appendChild(l);
  }

  function base() {
    var r = document.documentElement.style; r.setProperty('--racing', ORANGE); r.setProperty('--deep', DEEP);
    r.setProperty('--steel', DAY); r.setProperty('--paper', DAY);                 // black, white, orange only (G-MO 2026-10-27)
    css(
      '.gmx-web{position:fixed;top:0;width:min(26vw,190px);height:min(26vw,190px);color:rgba(242,242,239,.22);pointer-events:none;z-index:40}' +
      '.gmx-web.l{left:0}.gmx-web.r{right:0;transform:scaleX(-1)}' +
      '#gmx-spooky-canvas{position:fixed;inset:0;pointer-events:none;z-index:39}' +
      '.gmx-jack{animation:gmxcandle 3.2s infinite}@keyframes gmxcandle{0%,100%{filter:brightness(1)}8%{filter:brightness(.8)}10%{filter:brightness(1.08)}43%{filter:brightness(.9)}45%{filter:brightness(1.05)}71%{filter:brightness(.76)}73%{filter:brightness(1)}}' +
      // the ripple shader, the corner marks, the header mark and the scan disc hard-code racing red, this turns them pumpkin
      '.hero .hero-fx,.gmx-cfx,canvas.gmx-cfx{filter:hue-rotate(20deg) saturate(1.15)!important}' +
      '.gmx-fog{position:fixed;left:-10%;right:-10%;bottom:-40px;height:180px;pointer-events:none;z-index:38;background:radial-gradient(60% 70% at 30% 100%,rgba(242,242,239,.10),transparent 70%),radial-gradient(50% 60% at 75% 100%,rgba(242,242,239,.08),transparent 70%);animation:gmxfog 18s ease-in-out infinite alternate}' +
      '@keyframes gmxfog{to{transform:translateX(6%)}}' +
      '.gmx-flicker{animation:gmxflick 7s infinite}@keyframes gmxflick{0%,91%,100%{opacity:1}92%{opacity:.25}93%{opacity:1}95%{opacity:.4}96%{opacity:1}}'
    );
    // spooky type everywhere: the drippy display face (same as the carousels) on headings, the wordmark and buttons,
    // an eerie typewriter on every mono label. body copy follows BODY: 'typewriter' or 'keep' (poppins, easiest to read).
    css(
      "@font-face{font-family:'GMX Spooky';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/rubikwetpaint-latin.woff2) format('woff2')}" +
      "@font-face{font-family:'GMX Typewriter';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/specialelite-latin.woff2) format('woff2')}" +
      "h1,h2,h3,h4,h5,.wordmark,.gmx-hdr,.gmx-hdr *,.pill,button:not(.set-facade),.set-meta .t,.gmx-tabs,.gmx-tabs *,.lane h3,.canon h3{font-family:'GMX Spooky','Poppins',sans-serif!important;font-weight:400!important;letter-spacing:.01em}" +
      ".mono,.eyebrow,code,kbd,time,.set-meta .mono,[class*='mono']{font-family:'GMX Typewriter','Space Mono',monospace!important}" +
      (BODY === 'typewriter' ? "body,p,li,td,input,textarea,select{font-family:'GMX Typewriter','Poppins',sans-serif!important}" : '')
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
    // ghosts (G-MO 2026-10-27): every 5 to 8 s one fades in near an edge, sways and drifts up for ~7 s, then fades.
    // pale and see-through so text stays readable, and it fades faster when the cursor gets close.
    var ghosts = [], nextGhost = /[?&]ghostnow/.test(location.search) ? 10 : 120;   // ?ghostnow spawns one at once, for previews
    function ghost(o) {
      var t = o.t, life = o.life, k = t < 60 ? t / 60 : t > life - 80 ? (life - t) / 80 : 1, a = Math.max(0, k) * o.alpha;
      if (a <= 0) return;
      x.save(); x.translate(o.x + Math.sin(t * .03) * 10, o.y); x.rotate(Math.sin(t * .025) * .08); var s = o.s;
      x.globalAlpha = a; x.fillStyle = '#F2F2EF'; x.shadowColor = 'rgba(242,242,239,.6)'; x.shadowBlur = 14;
      x.beginPath(); x.moveTo(-s, s * .2); x.arc(0, s * .2 - s * .1, s, Math.PI, 0);          // the dome
      x.lineTo(s, s * 1.3);
      for (var i = 0; i < 4; i++) {                                                          // the wavy hem
        var x0 = s - i * s / 2, w = Math.sin(t * .12 + i) * s * .12;
        x.quadraticCurveTo(x0 - s / 4, s * 1.55 + w, x0 - s / 2, s * 1.3);
      }
      x.closePath(); x.fill(); x.shadowBlur = 0;
      x.fillStyle = '#0B0B0D'; x.globalAlpha = Math.min(1, a * 1.6);
      x.beginPath(); x.ellipse(-s * .35, -s * .05, s * .13, s * .2, 0, 0, 7); x.ellipse(s * .35, -s * .05, s * .13, s * .2, 0, 0, 7); x.fill();
      x.beginPath(); x.ellipse(0, s * .45, s * .1, s * .14, 0, 0, 7); x.fill();
      x.restore();
    }
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
      if (--nextGhost <= 0) {
        var side = Math.random() < .5, gs = (W < 700 ? 16 : 22) + Math.random() * 10;
        ghosts.push({ x: side ? 40 + Math.random() * W * .22 : W - 40 - Math.random() * W * .22, y: H * (.3 + Math.random() * .5), s: gs, t: 0, life: 420, vy: -.25 - Math.random() * .2, alpha: .5 + Math.random() * .2 });
        nextGhost = 300 + Math.random() * 180;                                     // every 5 to 8 s at 60 fps
      }
      ghosts = ghosts.filter(function (o) {
        o.t++; o.y += o.vy;
        if (Math.hypot(o.x - mouse.x, o.y - mouse.y) < 110 && o.t < o.life - 80) o.t = o.life - 80;   // shy: it fades when you get close
        ghost(o); return o.t < o.life;
      });
      bats = bats.filter(function (b) { b.x += b.vx; b.t += 1; b.y += Math.sin(b.t * .05 + b.wob) * .8; bat(b); return b.x < W + 60; });
      requestAnimationFrame(tick);
    })();
  }

  function haunt() {
    document.body.appendChild(el('div', { class: 'gmx-fog', 'aria-hidden': 'true' }));
    var hs = document.querySelectorAll('h1, h2'); for (var i = 0; i < hs.length; i += 3) { hs[i].classList.add('gmx-flicker'); hs[i].style.animationDelay = (i * 1.7 % 7) + 's'; }
  }

  function go() {
    if (LEVEL) { base(); recolor(); favicon(); if (!still) { critters(); if (LEVEL >= 3) haunt(); } }
    toggle();
  }
  if (LEVEL) { if (document.readyState === 'loading') document.addEventListener('readystatechange', function () { if (document.readyState === 'interactive') halloweenSets(); }); else halloweenSets(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
