/* gmx-install: the "put grooves on your home screen" nudge (phase 5, 2026-09-28).
   android chrome gets a real install button (beforeinstallprompt).
   iphone gets the two taps spelled out, because safari lets no page install itself.
   inside instagram, tiktok and friends it says to open the page in a real browser first.
   hidden once installed, and for 30 days after "not now". no tracking, one localStorage key. */
(function () {
  var KEY = 'gmx_install_hide_until';
  var DAYS = 30;
  var d = document, w = window, ua = navigator.userAgent || '';

  function standalone() {
    return (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function hidden() {
    try { return Number(localStorage.getItem(KEY) || 0) > Date.now(); } catch (e) { return false; }
  }
  function hide(days) {
    try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch (e) {}
    var el = d.getElementById('gmx-install');
    if (el) el.remove();
  }
  if (standalone() || hidden()) return;

  var touch = w.matchMedia && w.matchMedia('(pointer:coarse)').matches;
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Bytedance|Snapchat|Line\//i.test(ua);

  /* a card that floats just above the tab bar, so it shows without scrolling past the hero */
  var css = '#gmx-install{position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom));z-index:61;margin:0 auto;max-width:440px;' +
    'background:rgba(11,11,13,.97);border:2px solid rgba(242,242,239,.16);border-radius:18px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.6);' +
    '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);' +
    'font-family:"Space Mono",monospace;font-size:.8rem;line-height:1.6;color:#F2F2EF;text-align:left}' +
    '@media (min-width:1025px){#gmx-install{bottom:24px}}' +
    '#gmx-install b{color:#FF1C02;font-weight:400}' +
    '#gmx-install .gi-row{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}' +
    '#gmx-install button{font-family:"Space Mono",monospace;font-size:.78rem;letter-spacing:.08em;border-radius:999px;padding:10px 16px;cursor:pointer;min-height:44px}' +
    '#gmx-install .gi-go{border:2px solid #FF1C02;background:#FF1C02;color:#0B0B0D}' +
    '#gmx-install .gi-go:hover{background:#CC1400;border-color:#CC1400;color:#F2F2EF}' +
    '#gmx-install .gi-no{border:2px solid rgba(242,242,239,.12);background:transparent;color:#8A8A93}' +
    '#gmx-install .gi-no:hover{color:#F2F2EF}' +
    '#gmx-install svg{width:18px;height:18px;vertical-align:-3px;fill:none;stroke:#F2F2EF;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}';
  var SHARE = '<svg viewBox="0 0 24 24" aria-label="the share icon" role="img"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 11H5v10h14V11h-2"/></svg>';

  function mount(html, withInstall) {
    if (d.getElementById('gmx-install')) return null;
    var st = d.createElement('style'); st.textContent = css; d.head.appendChild(st);
    var box = d.createElement('div'); box.id = 'gmx-install'; box.setAttribute('role', 'note');
    box.innerHTML = html + '<div class="gi-row">' + (withInstall ? '<button type="button" class="gi-go">install</button>' : '') +
      '<button type="button" class="gi-no">not now</button></div>';
    d.body.appendChild(box);
    box.querySelector('.gi-no').addEventListener('click', function () { hide(DAYS); });
    return box;
  }

  function start() {
    if (inApp && touch) {
      mount('this page lives better on your home screen. open it in ' + (ios ? 'safari' : 'your browser') +
        ' first (tap <b>···</b> then <b>open in browser</b>), then add it from there.', false);
      return;
    }
    if (ios && touch) {
      mount('put <b>grooves</b> on your home screen, it opens straight to scan. tap ' + SHARE +
        ' share (on newer iphones it sits under <b>···</b>), then <b>add to home screen</b>.', false);
      return;
    }
    var deferred = null;
    w.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      var box = mount('put <b>grooves</b> on your home screen, it opens straight to scan. no app store, one tap.', true);
      if (!box) return;
      box.querySelector('.gi-go').addEventListener('click', function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.then(function (c) { if (c && c.outcome === 'accepted') hide(3650); }).catch(function () {});
        deferred = null;
      });
    });
    w.addEventListener('appinstalled', function () { hide(3650); });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
