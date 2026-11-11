/* gmx tape: the thin ticker bar at the top of a page. reads /exchange-tape.json, which gmxprice.py export
   writes on the laptop next to exchange-index.json. the composite goes first, every item links to its quote
   on /exchange (#t=TICKER). this file adds html.gmx-tape-on before the fetch, which reserves the bar's height
   (gmx-tape.css), and drops it again when the json is missing. a closed bar never reserves anything.
   fails silent. our own points and percent moves only. */
(function () {
  "use strict";
  var KEY = "gmx-tape-off", root = document.documentElement;
  var shut = function () { root.classList.remove("gmx-tape-on"); root.classList.add("gmx-tape-off"); };
  var closed = false;
  try { closed = localStorage.getItem(KEY) === "1"; } catch (e) { closed = false; }
  if (closed) { shut(); return; }
  if (!window.fetch) { shut(); return; }
  root.classList.add("gmx-tape-on");
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var has = function (n) { return typeof n === "number" && isFinite(n); };
  var chg = function (n) {
    if (!has(n)) return '<span class="gt-new">new</span>';
    var r = Math.round(n * 10) / 10, d = r > 0 ? "up" : r < 0 ? "down" : "flat";
    return '<span class="gt-' + d + '">' + (d === "up" ? "▲ +" + r.toFixed(1) : d === "down" ? "▼ " + r.toFixed(1) : "– 0.0") + "%</span>";
  };
  var item = function (tk, href, price, c) {
    return '<a class="gt-i" href="' + esc(href) + '"><b translate="no">' + esc(tk) + "</b> " + esc(Number(price).toFixed(2)) + " " + chg(c) + "</a>";
  };

  fetch("/exchange-tape.json", { credentials: "same-origin" }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(build).catch(shut);

  function build(d) {
    if (!d || !document.body) { shut(); return; }
    var html = "", n = 0;
    if (d.composite && has(d.composite.level)) { html += item("GMX", "/exchange", d.composite.level, d.composite.chg1d); n++; }
    (d.items || []).forEach(function (x) {
      if (!x || !/^[A-Z0-9]{2,6}$/.test(x.ticker || "") || !has(x.price)) return;
      html += item(x.ticker, "/exchange#t=" + x.ticker, x.price, x.chg1d); n++;
    });
    if (!n) { shut(); return; }
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var bar = document.createElement("div");
    bar.className = "gmx-tape";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "ticker tape");
    bar.innerHTML = '<div class="gt-vp"><div class="gt-run"><div class="gt-set">' + html + "</div>" +
      (reduced ? "" : '<div class="gt-set" aria-hidden="true">' + html.replace(/<a /g, '<a tabindex="-1" ') + "</div>") +
      '</div></div><button class="gt-x" type="button" aria-label="hide the ticker tape">×</button>';
    var run = bar.querySelector(".gt-run");
    run.style.animationDuration = Math.max(45, n * 5) + "s";
    var t = 0;
    bar.addEventListener("touchstart", function () { clearTimeout(t); bar.classList.add("gt-hold"); }, { passive: true });
    var let_go = function () { clearTimeout(t); t = setTimeout(function () { bar.classList.remove("gt-hold"); }, 2500); };
    bar.addEventListener("touchend", let_go, { passive: true });
    bar.addEventListener("touchcancel", let_go, { passive: true });
    bar.querySelector(".gt-x").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "1"); } catch (e) { /* private window: hidden for this visit only */ }
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      shut();
    });
    // last in the body so the tab order reaches the page first; css pins it to the top
    document.body.appendChild(bar);
  }
})();
