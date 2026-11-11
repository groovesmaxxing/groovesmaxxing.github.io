/* gmx exchange: the groove exchange (exchange.html). reads exchange-index.json, which gmxprice.py writes on
   the laptop from the releases db. vanilla, no libraries. shows only our own index points, percent moves,
   rounded tiers, a songstats credit link and the public spotify track id (cover + listen link). a null change
   is a new listing, drawn as a "new" pill, never 0%. the quote sheet keeps its ticker in the hash (#t=TICKER).
   the site ticker bar is its own pair, gmx-tape.js + gmx-tape.css. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var has = function (n) { return typeof n === "number" && isFinite(n); };
  var fmt = function (n) { return has(n) ? Number(n).toFixed(2) : "-"; };
  var dir = function (n) { if (!has(n)) return "flat"; var r = Math.round(n * 10); return r > 0 ? "up" : r < 0 ? "down" : "flat"; };
  // every change: sign + glyph + colour, one decimal; null is a new listing
  var chg = function (n) {
    if (!has(n)) return '<span class="ex-new">new</span>';
    var r = Math.round(n * 10) / 10, d = dir(n);
    return '<span class="ex-chg ' + d + '">' + (d === "up" ? "▲ +" + r.toFixed(1) : d === "down" ? "▼ " + r.toFixed(1) : "– 0.0") + "%</span>";
  };
  var ptsDiff = function (n) { var d = dir(n), r = Math.abs(Math.round(n * 10) / 10).toFixed(1); return '<span class="ex-chg ' + d + '">' + (d === "up" ? "+" : d === "down" ? "-" : "") + r + " pts</span>"; };
  var LANE = { vibes: "🧃 vibes", bumpy: "🚧 bumpy" };
  var HEAT = { "heating up": "heating up", cooling: "cooling off", steady: "steady" };
  var EVN = { c: "chart", e: "editorial", r: "release" };
  var PERIODS = { "1d": "chg1d", "7d": "chg7d", "30d": "chg30d" };
  var NEXT = "06:20";
  var PLAIN_KEY = "gmx-ex-plain-off";
  var reduced = function () { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };
  var DATA, byTk = {}, COMP = null, sortK = "price", sortDir = -1, lane = "all", view = "all", period = "1d";
  var lastFocus = null, range = 30, vsComp = false, current = null, pushed = false, cs = null;

  var stamp = function () { return "as of " + DATA.asof + " · next close " + NEXT; };
  function art(h, s) {
    var c = "ex-art ex-a" + s;
    if (!h || !/^[0-9a-f]{24}$/.test(h)) return '<span class="' + c + ' ex-art0" aria-hidden="true"></span>';
    var u = "https://i.scdn.co/image/ab67616d";
    return '<img class="' + c + '" src="' + u + "00004851" + esc(h) + '" srcset="' + u + "00004851" + esc(h) + " 1x, " + u + "00001e02" + esc(h) + ' 2x" alt="" width="' + s + '" height="' + s + '" loading="lazy" decoding="async">';
  }
  function pts(series) {
    var out = [];
    series.forEach(function (v, i) { if (has(v)) out.push([i, v]); });
    return out;
  }
  // a sparkline. dot=true draws at its real size (no stretch) with a dot on the last close
  function spark(series, w, h, d, dot) {
    var p = pts(series), n = series.length;
    var open = '<svg class="ex-sp" viewBox="0 0 ' + w + " " + h + '"' + (dot ? ' width="' + w + '" height="' + h + '"' : ' preserveAspectRatio="none"') + ' aria-hidden="true">';
    if (p.length < 2) return open + "</svg>";
    var vs = p.map(function (q) { return q[1]; });
    if (d == null) d = vs[0] > 0 ? dir((vs[vs.length - 1] / vs[0] - 1) * 100) : "flat";
    var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), sp = (mx - mn) || 1;
    var X = function (i) { return (2 + i / (n - 1) * (w - 5)).toFixed(1); }, Y = function (v) { return (h - 3 - (v - mn) / sp * (h - 6)).toFixed(1); };
    var c = d === "up" ? "var(--up)" : d === "down" ? "var(--down)" : "var(--steel)";
    var last = p[p.length - 1];
    return open + '<polyline fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="' +
      p.map(function (q) { return X(q[0]) + "," + Y(q[1]); }).join(" ") + '"/>' +
      (dot ? '<circle cx="' + X(last[0]) + '" cy="' + Y(last[1]) + '" r="2.2" fill="' + c + '"/>' : "") + "</svg>";
  }
  function artistHtml(t) {
    if (!t.artist) return "";
    if (t.artist_page && /^\/artists\/[a-z0-9-]+$/.test(t.artist_page)) return '<a class="ex-al" href="' + esc(t.artist_page) + '" translate="no">' + esc(t.artist) + "</a>";
    return '<span translate="no">' + esc(t.artist) + "</span>";
  }

  fetch("/exchange-index.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(init).catch(function () {
    $("#ex-closed").textContent = "the close did not load. try again in a minute.";
  });

  function init(d) {
    DATA = d;
    d.tracks.forEach(function (t) { byTk[t.ticker] = t; });
    (d.indices || []).forEach(function (ix) { if (ix.key === "gmx") COMP = ix; });
    if (!COMP && d.indices && d.indices.length) COMP = d.indices[0];
    $("#ex-closed").textContent = d.tracks.length + " listed";
    $("#ex-stamp").textContent = stamp();
    plain(d);
    method(d);
    tiles(d);
    rails(d);
    $$("#ex-board th[data-k] button").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.parentNode.getAttribute("data-k");
        if (sortK === k) sortDir = -sortDir; else { sortK = k; sortDir = k === "ticker" ? 1 : -1; }
        $$("#ex-board th").forEach(function (th) { th.removeAttribute("aria-sort"); });
        b.parentNode.setAttribute("aria-sort", sortDir > 0 ? "ascending" : "descending");
        board();
      });
    });
    $("#ex-q").addEventListener("input", board);
    $$(".ex-lanes .ex-chip").forEach(function (c) { c.addEventListener("click", function () { setLane(c.getAttribute("data-lane")); }); });
    $$(".ex-views .ex-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        view = c.getAttribute("data-view");
        $$(".ex-views .ex-chip").forEach(function (x) { x.setAttribute("aria-pressed", String(x === c)); });
        board();
      });
    });
    $$(".ex-seg button").forEach(function (c) {
      c.addEventListener("click", function () {
        period = c.getAttribute("data-p");
        $$(".ex-seg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === c)); });
        $("#ex-chg-h").textContent = period;
        board();
      });
    });
    board();
    book();
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }

  // one dismissible plain-words line, built from a real track in today's close
  function plain(d) {
    var el = $("#ex-plain"), off = false;
    try { off = localStorage.getItem(PLAIN_KEY) === "1"; } catch (e) { off = false; }
    if (off || !el) return;
    var up = (d.movers && d.movers.up || []).map(function (m) { return byTk[m.ticker]; }).filter(function (t) { return t && has(t.price); });
    var t = up[0] || d.tracks.filter(function (x) { return x.seasoned && has(x.price); }).sort(function (a, b) { return b.price - a.price; })[0];
    if (!t) return;
    var p = t.parts || {}, big = "dj support", bv = p.dj || 0;
    if ((p.charts || 0) > bv) { big = "its chart spots"; bv = p.charts; }
    if ((p.editorial || 0) > bv) { big = "editorial playlist adds"; }
    var move = has(t.chg1d) ? (dir(t.chg1d) === "flat" ? "flat on the day" : (t.chg1d > 0 ? "up " : "down ") + Math.abs(t.chg1d).toFixed(1) + "% on the day") : "its first close";
    $("#ex-plain-tx").innerHTML = "a point is our own score, not money. today <b translate=\"no\">" + esc(t.ticker) + "</b> (<span translate=\"no\">" + esc(t.title) +
      "</span>) closed at " + fmt(t.price) + " points, " + move + ", pushed mostly by " + big + ".";
    el.hidden = false;
    $("#ex-plain-x").addEventListener("click", function () {
      el.hidden = true;
      try { localStorage.setItem(PLAIN_KEY, "1"); } catch (e) { /* private window: gone for this visit only */ }
    });
  }
  function method(d) {
    if (d.formula) $("#ex-formula").textContent = d.formula;
    if (d.formula_version) $("#ex-fv").textContent = d.formula_version;
  }

  function tiles(d) {
    $("#ex-tiles").innerHTML = d.indices.map(function (ix) {
      return '<button class="ex-tile" type="button" data-ix="' + esc(ix.key) + '"><span class="nm">' + esc(ix.name) + " · " + esc(ix.members) + " listed" +
        (ix.thin ? ' <span class="ex-thin">thin</span>' : "") + '</span><span class="lv">' + fmt(ix.level) + '</span><span class="ch">' + chg(ix.chg1d) + " today · " + chg(ix.chg7d) + " 7d</span>" +
        spark(ix.series, 200, 38, null, false) + "</button>";
    }).join("");
    $$(".ex-tile").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-ix");
        setLane(k === "vibes" || k === "bumpy" ? k : "all");
        $("#ex-bd-h").scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
      });
    });
  }

  function rails(d) {
    var pick = function (rows) { return (rows || []).map(function (m) { return byTk[m.ticker]; }).filter(Boolean).slice(0, 10); };
    var up = d.movers && d.movers.up ? pick(d.movers.up) : d.tracks.filter(function (t) { return t.chg1d > 0; }).sort(function (a, b) { return b.chg1d - a.chg1d; }).slice(0, 10);
    var down = d.movers && d.movers.down ? pick(d.movers.down) : d.tracks.filter(function (t) { return t.chg1d < 0; }).sort(function (a, b) { return a.chg1d - b.chg1d; }).slice(0, 10);
    rail("#ex-r-up", up.filter(function (t) { return t.chg1d > 0; }));
    rail("#ex-r-down", down.filter(function (t) { return t.chg1d < 0; }));
    var cut = new Date(d.asof + "T00:00:00Z"); cut.setUTCDate(cut.getUTCDate() - 14);
    var cutS = cut.toISOString().slice(0, 10);
    rail("#ex-r-new", d.tracks.filter(function (t) { return t.listed && t.listed >= cutS && t.listed <= d.asof; })
      .sort(function (a, b) { return a.listed < b.listed ? 1 : a.listed > b.listed ? -1 : 0; }).slice(0, 12), true);
  }

  function rail(sel, list, isNew) {
    var el = $(sel);
    if (!list.length) { el.innerHTML = '<p class="ex-empty">nothing here today</p>'; return; }
    el.innerHTML = list.map(function (t) {
      return '<button class="ex-mcard" type="button" data-t="' + esc(t.ticker) + '"><span class="hd">' + art(t.art, 44) + '<span class="id"><span class="tk" translate="no">' + esc(t.ticker) +
        '</span><span class="tt" translate="no">' + esc(t.title) + '</span></span></span><span class="pr">' + fmt(t.price) + '</span><span class="ch">' +
        (isNew ? "listed " + esc(String(t.listed).slice(5)) + " · " : "") + chg(t.chg1d) + "</span>" +
        (t.driver ? '<span class="dv">' + esc(t.driver) + "</span>" : "") + spark(t.series.slice(-30), 146, 28, null, true) + "</button>";
    }).join("");
    $$("button", el).forEach(function (b) { b.addEventListener("click", function () { open(b.getAttribute("data-t")); }); });
  }

  function setLane(l) {
    lane = l;
    $$(".ex-lanes .ex-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-lane") === l)); });
    board();
  }

  function cmp(a, b) {
    var k = sortK === "chg" ? PERIODS[period] : sortK;
    var x = a[k], y = b[k];
    var xn = x == null, yn = y == null;
    if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1; // empty values sit last either way
    if (typeof x === "string") { x = x.toLowerCase(); y = String(y).toLowerCase(); }
    return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
  }
  function inView(t) {
    if (view === "heat") return t.heat === "heating up";
    if (view === "cool") return t.heat === "cooling";
    if (view === "new") return !t.seasoned;
    return true;
  }

  function board() {
    var q = ($("#ex-q").value || "").trim().toLowerCase(), key = PERIODS[period];
    var rows = DATA.tracks.filter(function (t) {
      if (lane !== "all" && (t.lanes || []).indexOf(lane) < 0) return false;
      if (!inView(t)) return false;
      return !q || (t.ticker + " " + t.title + " " + (t.artist || "")).toLowerCase().indexOf(q) >= 0;
    }).sort(cmp);
    $("#ex-board tbody").innerHTML = rows.map(function (t) {
      var ar = artistHtml(t), meta = [];
      if (has(t.peak)) meta.push("peak " + fmt(t.peak));
      if (has(t.days_listed)) meta.push(t.days_listed + "d listed");
      return '<tr tabindex="0" data-t="' + esc(t.ticker) + '" aria-label="' + esc(t.ticker + ", " + t.title) + ', open the quote">' +
        '<td class="cv">' + art(t.art, 44) + "</td>" +
        '<td class="tc"><span class="tk" translate="no">' + esc(t.ticker) + '</span><span class="tt"><span translate="no">' + esc(t.title) + "</span>" + (ar ? " · " + ar : "") + "</span>" +
        (meta.length ? '<span class="mt">' + esc(meta.join(" · ")) + "</span>" : "") + "</td>" +
        '<td class="sp">' + spark(t.series.slice(-30), 56, 20, null, true) + "</td>" +
        '<td class="pr">' + fmt(t.price) + "</td>" +
        '<td class="ch">' + chg(t[key]) + "</td></tr>";
    }).join("");
    $("#ex-count").textContent = rows.length + " of " + DATA.tracks.length + " listed";
    rowsOpen("#ex-board tbody tr");
  }

  function rowsOpen(sel) {
    $$(sel).forEach(function (tr) {
      tr.addEventListener("click", function (e) { if (e.target.closest("a")) return; open(tr.getAttribute("data-t")); });
      tr.addEventListener("keydown", function (e) {
        if (e.target !== tr) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(tr.getAttribute("data-t")); }
      });
    });
  }

  function book() {
    var b = DATA.book || {}, p = DATA.picks || [];
    if (!p.length) { $("#ex-bookvs").innerHTML = '<p class="ex-empty">no picks on the board yet</p>'; $("#ex-book").hidden = true; return; }
    if (has(b.avg_return) && has(b.composite_same_span)) {
      $("#ex-bookvs").innerHTML =
        '<div class="r"><span class="k">book <small>equal weight</small></span><span class="v">' + chg(b.avg_return) + "</span></div>" +
        '<div class="r"><span class="k">composite <small>same days</small></span><span class="v">' + chg(b.composite_same_span) + "</span></div>" +
        '<div class="r df"><span class="k">difference</span><span class="v">' + ptsDiff(b.avg_return - b.composite_same_span) + "</span></div>";
    } else {
      $("#ex-bookvs").innerHTML = '<p class="ex-empty">no pick is old enough to score yet</p>';
    }
    var note = [];
    if (has(b.counted) && b.counted) note.push((b.ahead || 0) + " of " + b.counted + " picks ahead");
    if (b.too_new) note.push(b.too_new + " too new to score");
    $("#ex-booknote").textContent = note.join(" · ");
    var rows = p.slice().sort(function (a, c) {
      if (a.too_new !== c.too_new) return a.too_new ? 1 : -1;
      if (has(a.ret) && has(c.ret)) return c.ret - a.ret;
      return a.picked_on < c.picked_on ? 1 : -1;
    });
    $("#ex-book tbody").innerHTML = rows.map(function (r) {
      var ok = !!byTk[r.ticker];
      return "<tr" + (ok ? ' tabindex="0" data-t="' + esc(r.ticker) + '"' : "") + (r.too_new ? ' class="ex-young"' : "") + '><td class="tk" data-l="ticker" translate="no">' + esc(r.ticker) +
        '</td><td class="tc" data-l="title"><span translate="no">' + esc(r.title) + '</span></td><td class="n" data-l="picked">' + esc(r.picked_on) +
        '</td><td class="n" data-l="price then">' + (has(r.price_at_pick) ? fmt(r.price_at_pick) : "no price yet") + '</td><td class="n" data-l="price now">' + fmt(r.price_now) +
        '</td><td class="n" data-l="return">' + (r.too_new ? '<span class="ex-pill ex-tn">too new</span>' : chg(r.ret)) + "</td></tr>";
    }).join("");
    rowsOpen("#ex-book tbody tr[data-t]");
  }

  // the quote sheet
  function fromHash() {
    var m = location.hash.match(/^#t=([A-Z0-9]{2,6})$/);
    if (m && byTk[m[1]]) show(byTk[m[1]]); else if (current) hide();
  }
  function open(tk) {
    lastFocus = document.activeElement;
    if (location.hash === "#t=" + tk) fromHash(); else { pushed = true; location.hash = "t=" + tk; }
  }
  function close() {
    if (/^#t=/.test(location.hash)) {
      if (pushed) history.back();
      else history.replaceState(null, document.title, location.pathname + location.search);
    }
    hide();
  }
  function hide(silent) {
    $("#ex-sheet").classList.remove("on"); $("#ex-scrim").classList.remove("on");
    $("#ex-sheet").setAttribute("aria-hidden", "true");
    current = null; pushed = false; cs = null;
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function show(t) {
    current = t;
    var sh = $("#ex-sheet"), p = t.parts || { dj: 0, charts: 0, editorial: 0 };
    var seg = function (v, c) { return '<span class="' + c + '" style="width:' + ((v || 0) * 100).toFixed(1) + '%"></span>'; };
    var ar = artistHtml(t);
    var lanes = (t.lanes || []).map(function (l) { return LANE[l] || esc(l); }).join(" ");
    var heat = t.seasoned ? (HEAT[t.heat] || "steady") : "new listing";
    var sid = t.songstats_id && /^[A-Za-z0-9]+$/.test(t.songstats_id) ? t.songstats_id : "";
    var spid = t.spotify_track_id && /^[A-Za-z0-9]{22}$/.test(t.spotify_track_id) ? t.spotify_track_id : "";
    var fact = function (k, v) { return "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>"; };
    sh.innerHTML =
      '<div class="sh-top">' + art(t.art, 96) + '<div class="sh-id"><div class="sh-tk"><span translate="no">' + esc(t.ticker) + "</span>" + (lanes ? " · " + lanes : "") +
      '</div><div class="sh-tt" id="ex-sh-tt" role="heading" aria-level="2" translate="no">' + esc(t.title) + "</div>" + (ar ? '<div class="sh-ar">' + ar + "</div>" : "") +
      '</div><button class="ex-x" type="button" aria-label="close">×</button></div>' +
      '<div class="sh-px"><div class="big" id="ex-big"></div><div class="bigch" id="ex-bigch" aria-live="polite"></div><div class="ex-stamp">' + esc(stamp()) + "</div></div>" +
      '<div class="rng" role="group" aria-label="chart range">' + [7, 30, 90].map(function (r) { return '<button class="ex-chip" type="button" data-r="' + r + '" aria-pressed="' + (range === r) + '">' + r + "d</button>"; }).join("") + "</div>" +
      '<div class="chartwrap"><div class="cbox" id="ex-cbox"><svg id="ex-qc" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="price chart"></svg><div class="ov" id="ex-ov"></div></div></div>' +
      (COMP ? '<div class="sh-vs"><button class="ex-chip" type="button" id="ex-vs" aria-pressed="' + vsComp + '">vs composite</button><span class="ex-hint">both lines start at 100</span></div>' : "") +
      '<div class="sh-sec sh-heat"><span class="ex-seck">heat</span><span class="hv ' + (t.heat === "heating up" ? "up" : t.heat === "cooling" ? "down" : "flat") + '">' + esc(heat) + "</span>" +
      (t.driver ? '<span class="dv">' + esc(t.driver) + "</span>" : "") +
      ((t.pills || []).length ? '<div class="pl">' + t.pills.map(function (x) { return '<span class="ex-pill">' + esc(x) + "</span>"; }).join("") + "</div>" : "") + "</div>" +
      '<div class="sh-sec"><div class="ex-seck">what moves it</div><div class="bar">' + seg(p.dj, "b-dj") + seg(p.charts, "b-ch") + seg(p.editorial, "b-ed") + "</div>" +
      '<div class="legend"><span><i class="b-dj"></i>dj support ' + Math.round((p.dj || 0) * 100) + '%</span><span><i class="b-ch"></i>charts ' +
      Math.round((p.charts || 0) * 100) + '%</span><span><i class="b-ed"></i>editorial ' + Math.round((p.editorial || 0) * 100) + "%</span></div></div>" +
      '<div class="sh-sec"><dl class="facts">' +
      fact("vs debut", chg(t.vs_debut)) +
      fact("peak", fmt(t.peak) + (t.peak_date ? ' <small>' + esc(t.peak_date) + "</small>" : "")) +
      fact("90d high / low", fmt(t.hi90) + " / " + fmt(t.lo90)) +
      fact("days listed", has(t.days_listed) ? esc(t.days_listed) : "-") + "</dl></div>" +
      '<div class="sh-sec"><div class="ex-seck">tape</div>' + ((t.tape || []).length ? '<ul class="tapelist" id="ex-tl">' + t.tape.map(function (x) {
        var m = String(x).match(/^(\d\d-\d\d)\b/);
        return "<li" + (m ? ' data-d="' + m[1] + '"' : "") + ">" + esc(x) + "</li>";
      }).join("") + "</ul>" : '<p class="ex-empty">no events in the last 90 days</p>') + "</div>" +
      (spid || sid ? '<div class="links">' +
        (spid ? '<a class="ex-btn" target="_blank" rel="noopener" href="https://open.spotify.com/track/' + spid + '">listen on spotify ↗</a>' : "") +
        (sid ? '<a class="ex-btn" target="_blank" rel="noopener" href="https://songstats.com/track/' + encodeURIComponent(sid) + '">via songstats ↗</a>' : "") + "</div>" : "");
    $(".ex-x", sh).addEventListener("click", close);
    $$(".rng .ex-chip", sh).forEach(function (b) {
      b.addEventListener("click", function () {
        range = +b.getAttribute("data-r");
        $$(".rng .ex-chip", sh).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        draw(t);
      });
    });
    var vs = $("#ex-vs", sh);
    if (vs) vs.addEventListener("click", function () { vsComp = !vsComp; vs.setAttribute("aria-pressed", String(vsComp)); draw(t); });
    $$("#ex-tl li[data-d]", sh).forEach(function (li) {
      var on = function () { hl(li.getAttribute("data-d"), true); }, off = function () { hl(li.getAttribute("data-d"), false); };
      li.addEventListener("mouseenter", on); li.addEventListener("mouseleave", off);
      li.addEventListener("focus", on); li.addEventListener("blur", off);
    });
    wire($("#ex-cbox", sh));
    draw(t);
    $("#ex-scrim").classList.add("on"); sh.classList.add("on");
    sh.removeAttribute("aria-hidden");
    if (!sh.contains(document.activeElement)) sh.focus();
  }

  function hl(dd, on) {
    $$('#ex-sheet [data-d="' + dd + '"]').forEach(function (el) { el.classList.toggle("hl", on); });
  }

  // the quote chart: range window, optional composite rebased to 100, pick line, lettered event markers
  function draw(t) {
    var svg = $("#ex-qc"), ov = $("#ex-ov"), W = 600, H = 180, PT = 16, PB = 12;
    var s = t.series.slice(-(range + 1)), dates = DATA.dates.slice(-(range + 1)), n = s.length;
    var i0 = -1, iL = -1, i;
    for (i = 0; i < n; i++) if (has(s[i])) { i0 = i; break; }
    for (i = n - 1; i >= 0; i--) if (has(s[i])) { iL = i; break; }
    cs = null;
    if (i0 < 0 || iL <= i0) {
      svg.innerHTML = ""; ov.innerHTML = '<p class="ex-empty ex-nochart">not enough closes to chart yet</p>';
      $("#ex-big").textContent = fmt(t.price);
      $("#ex-bigch").innerHTML = chg(null) + ' <span class="when">latest close ' + esc(DATA.asof) + "</span>";
      return;
    }
    // the % change counts from the first seasoned close (t.debut) in the window; under 2 seasoned closes it is "new"
    var b0 = -1;
    if (t.debut) for (i = i0; i <= iL; i++) if (has(s[i]) && dates[i] >= t.debut) { b0 = i; break; }
    var isNew = b0 < 0 || b0 >= iL, base = isNew ? s[i0] : s[b0], comp = null, cb = null;
    if (vsComp && COMP && COMP.series) {
      comp = COMP.series.slice(-(range + 1));
      for (i = isNew ? i0 : b0; i <= iL; i++) if (has(comp[i]) && comp[i] > 0) { cb = comp[i]; break; }
      if (!cb) comp = null;
    }
    var val = function (v) { return comp ? v / base * 100 : v; };
    var vals = [];
    for (i = i0; i <= iL; i++) {
      if (has(s[i])) vals.push(val(s[i]));
      if (comp && has(comp[i])) vals.push(comp[i] / cb * 100);
    }
    var pickOn = has(t.pick_price) && t.picked_on && t.picked_on <= dates[iL];
    if (pickOn) vals.push(val(t.pick_price));
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), sp = (mx - mn) || 1;
    mn -= sp * 0.04; mx += sp * 0.04; sp = mx - mn;
    var X = function (k) { return (k - i0) / (iL - i0) * W; }, Y = function (v) { return PT + (1 - (v - mn) / sp) * (H - PT - PB); };
    var pc = function (x, tot) { return (x / tot * 100).toFixed(2) + "%"; };
    var rc = isNew ? null : (s[iL] - base) / base * 100, d = isNew ? "flat" : dir(rc), col = d === "up" ? "var(--up)" : d === "down" ? "var(--down)" : "var(--steel)";
    var line = function (arr, f) { var o = []; for (var k = i0; k <= iL; k++) if (has(arr[k])) o.push(X(k).toFixed(1) + "," + Y(f(arr[k])).toFixed(1)); return o.join(" "); };
    var y0 = Y(val(base)).toFixed(1), out = "";
    out += '<line x1="0" x2="' + W + '" y1="' + y0 + '" y2="' + y0 + '" stroke="var(--line)" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>';
    if (pickOn) { var yp = Y(val(t.pick_price)).toFixed(1); out += '<line x1="0" x2="' + W + '" y1="' + yp + '" y2="' + yp + '" stroke="var(--day)" stroke-opacity=".7" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>'; }
    if (comp) out += '<polyline fill="none" stroke="var(--steel)" stroke-width="1.6" vector-effect="non-scaling-stroke" points="' + line(comp, function (v) { return v / cb * 100; }) + '"/>';
    out += '<polyline fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="' + line(s, val) + '"/>';
    out += '<line id="ex-qx" x1="0" x2="0" y1="0" y2="' + H + '" stroke="var(--steel)" vector-effect="non-scaling-stroke" visibility="hidden"/>';
    svg.innerHTML = out;
    svg.setAttribute("aria-label", "price chart, " + range + "d: " + fmt(base) + " on " + dates[isNew ? i0 : b0] + " to " + fmt(s[iL]) + " on " + dates[iL]);
    var o = '<span class="dot" id="ex-qd" hidden></span>';
    if (pickOn) o += '<span class="pk" style="top:' + pc(Y(val(t.pick_price)), H) + '">picked at ' + fmt(t.pick_price) + "</span>";
    if (comp) {
      var cl = -1; for (i = iL; i >= i0; i--) if (has(comp[i])) { cl = i; break; }
      var ya = Y(val(s[iL])), yb = cl >= 0 ? Y(comp[cl] / cb * 100) : ya + 30;
      if (Math.abs(ya - yb) < 16) { if (ya <= yb) { ya -= 8; yb += 8; } else { ya += 8; yb -= 8; } }
      o += '<span class="lab" style="top:' + pc(ya, H) + ';color:' + col + '" translate="no">' + esc(t.ticker) + "</span>";
      if (cl >= 0) o += '<span class="lab lab-c" style="top:' + pc(yb, H) + '">composite</span>';
    }
    // lettered event markers in this window; same-day markers stack upward
    var stack = {};
    (t.events || []).forEach(function (ev) {
      var k = dates.indexOf(ev.date);
      if (k < i0 || k > iL || !EVN[ev.type]) return;
      var j = k; while (j > i0 && !has(s[j])) j--;
      var lift = (stack[k] = (stack[k] || 0) + 1) - 1;
      var y = Math.max(8, Y(val(s[j])) - 14 - lift * 16), dd = ev.date.slice(5);
      o += '<button class="ev ev-' + ev.type + '" type="button" data-d="' + dd + '" style="left:' + pc(X(k), W) + ";top:" + pc(y, H) + '" aria-label="' + esc(EVN[ev.type] + ": " + ev.label + ", " + ev.date) + '" title="' + esc(ev.label + " · " + ev.date) + '">' + ev.type + "</button>";
    });
    ov.innerHTML = o;
    $$(".ev", ov).forEach(function (b) {
      var dd = b.getAttribute("data-d");
      var on = function () { hl(dd, true); }, off = function () { hl(dd, false); };
      b.addEventListener("mouseenter", on); b.addEventListener("mouseleave", off);
      b.addEventListener("focus", on); b.addEventListener("blur", off);
      b.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      b.addEventListener("click", function () { var li = $('#ex-tl li[data-d="' + dd + '"]'); if (li) li.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }); });
    });
    // tape rows with a marker in view become focusable, so the highlight works both ways from the keyboard
    $$("#ex-tl li[data-d]").forEach(function (li) {
      if ($('.ev[data-d="' + li.getAttribute("data-d") + '"]', ov)) li.setAttribute("tabindex", "0"); else li.removeAttribute("tabindex");
    });
    cs = { t: t, s: s, dates: dates, i0: i0, iL: iL, b0: isNew ? -1 : b0, base: base, X: X, Y: Y, val: val, W: W, H: H, d: d };
    latest();
  }
  function latest() {
    if (!cs) return;
    var qx = $("#ex-qx"), qd = $("#ex-qd");
    if (qx) qx.setAttribute("visibility", "hidden");
    if (qd) qd.hidden = true;
    $("#ex-big").textContent = fmt(cs.s[cs.iL]);
    $("#ex-bigch").innerHTML = chg(cs.b0 < 0 ? null : (cs.s[cs.iL] - cs.base) / cs.base * 100) + ' <span class="when">' + range + "d · latest close " + esc(cs.dates[cs.iL]) + "</span>";
  }
  function scrubTo(clientX) {
    if (!cs) return;
    var box = $("#ex-cbox"), r = box.getBoundingClientRect();
    var f = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
    var k = Math.round(cs.i0 + f * (cs.iL - cs.i0)), best = -1, j;
    for (j = 0; j <= cs.iL - cs.i0; j++) {
      if (k - j >= cs.i0 && has(cs.s[k - j])) { best = k - j; break; }
      if (k + j <= cs.iL && has(cs.s[k + j])) { best = k + j; break; }
    }
    if (best < 0) return;
    var x = cs.X(best), y = cs.Y(cs.val(cs.s[best])), qx = $("#ex-qx"), qd = $("#ex-qd");
    qx.setAttribute("x1", x); qx.setAttribute("x2", x); qx.setAttribute("visibility", "visible");
    qd.style.left = (x / cs.W * 100) + "%"; qd.style.top = (y / cs.H * 100) + "%"; qd.hidden = false;
    $("#ex-big").textContent = fmt(cs.s[best]);
    var since = cs.b0 >= 0 && best >= cs.b0;
    $("#ex-bigch").innerHTML = chg(since ? (cs.s[best] - cs.base) / cs.base * 100 : null) + ' <span class="when">' + esc(cs.dates[best]) + (since ? " · since " + esc(cs.dates[cs.b0]) : "") + "</span>";
  }
  function wire(box) {
    var down = false;
    box.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      down = true;
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* older safari */ }
      scrubTo(e.clientX);
    });
    box.addEventListener("pointermove", function (e) { if (down || e.pointerType === "mouse") scrubTo(e.clientX); });
    var up = function () { down = false; latest(); };
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("pointerleave", function () { if (!down) latest(); });
  }

  $("#ex-scrim").addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (!current) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Tab") {
      var f = $$('#ex-sheet button, #ex-sheet a[href], #ex-sheet [tabindex="0"]'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === $("#ex-sheet"))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();
