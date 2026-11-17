/* AidGap dashboard. Plain JavaScript, no libraries.
   Data files: data.js (funding + need + sources + donation links), map.js (country shapes),
   media.js (GDELT coverage, optional), donors.js (FTS donor flows, optional). */
(function () {
  "use strict";
  var D = window.AIDGAP, MAP = window.AIDGAP_MAP;
  var MEDIA = window.AIDGAP_MEDIA || null, MED = (MEDIA && MEDIA.byCode) || {};
  var DONORS = window.AIDGAP_DONORS || null, DON = (DONORS && DONORS.byCode) || {};
  var HAS_MEDIA = Object.keys(MED).length > 0;
  var PER_DOT = 100000;
  var WEIGHTS = { cov: 40, per: 40, scl: 20 };               // fixed on purpose
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- helpers ---------- */
  function fmtPeople(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n)); }
  function fmtUSD(n) {
    if (n < 1) return "$0";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(n >= 1e10 ? 0 : 2) + "B";
    if (n >= 1e6) return "$" + Math.round(n / 1e6) + "M";
    return "$" + Math.round(n / 1e3) + "K";
  }
  function fmtPerDay(usdYear) { var c = usdYear / 365 * 100; return c < 1 ? c.toFixed(2) + "¢" : c < 10 ? c.toFixed(1) + "¢" : "$" + (c / 100).toFixed(2); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function shortName(n) { return String(n).replace(" (Bolivarian Republic of)", "").replace("Democratic Republic of the Congo", "DR Congo").replace("Syrian Arab Republic", "Syria").replace("State of Palestine", "Palestine"); }
  function pctTxt(x) { return Math.round(x * 100) + "%"; }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : "#"; }
  function ext(url, html, cls) { return '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + html + "</a>"; }

  /* ---------- data ---------- */
  var crises = D.crises.slice().sort(function (a, b) { return a.rank - b.rank || b.people_in_need - a.people_in_need; });
  var N = crises.length;
  var byCode = {};
  crises.forEach(function (c, i) { byCode[c.location_code] = { kind: "ranked", c: c, i: i }; });
  D.unranked.forEach(function (u) { if (u.location_code) byCode[u.location_code] = { kind: "unranked", u: u }; });
  function nameOf(code) { var e = byCode[code]; return e ? (e.kind === "ranked" ? e.c.location_name : e.u.location_name) : code; }
  var totals = crises.reduce(function (a, c) { a.pin += c.people_in_need; a.req += c.requirements_usd; a.fund += c.funding_usd; a.unmet += c.unmet_usd; return a; }, { pin: 0, req: 0, fund: 0, unmet: 0 });
  var fundedPct = totals.fund / totals.req * 100;
  var medianPer = (function () {
    var v = crises.map(function (c) { return c.funding_per_person_usd; }).sort(function (a, b) { return a - b; });
    return N % 2 ? v[(N - 1) / 2] : (v[N / 2 - 1] + v[N / 2]) / 2;
  })();

  /* ---------- colours (read from CSS so both themes work) ---------- */
  var COL = {};
  function hexToRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) { return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")"; }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["--funded", "--unmet", "--ink", "--ink2", "--raise", "--land", "--bg"].forEach(function (k) { COL[k] = cs.getPropertyValue(k).trim(); });
    COL.fundedRGB = hexToRgb(COL["--funded"]); COL.unmetRGB = hexToRgb(COL["--unmet"]); COL.landRGB = hexToRgb(COL["--land"]);
    COL.light = document.documentElement.getAttribute("data-theme") === "light";
  }
  try { var saved = localStorage.getItem("aidgap-theme"); if (saved === "light") document.documentElement.setAttribute("data-theme", "light"); } catch (e) {}
  $("themeBtn").addEventListener("click", function () {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    if (light) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem("aidgap-theme", light ? "dark" : "light"); } catch (e) {}
    readColors(); paintMap(); tick(); bgDraw(); if (mCode) drawMini();
  });

  /* ---------- hero ---------- */
  $("eyebrow").textContent = D.year + " humanitarian appeals: need vs. funding";
  $("heroNum").innerHTML = '<span class="mask in"><span><span id="heroVal">0.0</span><small>million people</small></span></span>';
  $("heroLead").innerHTML = "need humanitarian help across <b>" + N + " crises</b>. Their appeals are only <b>" + fundedPct.toFixed(0) +
    "% funded</b>, leaving <span class=\"unmet\">" + fmtUSD(totals.unmet) + "</span> unpaid.";
  $("foot").innerHTML = "AidGap · data refreshed " + esc(D.generated) + " · See the sources above · A portfolio project by Eli.";
  function countUp() {
    var t0 = performance.now(), DUR = reduceMotion ? 1 : 2200;
    (function f(t) { var p = clamp01((t - t0) / DUR); $("heroVal").textContent = (totals.pin / 1e6 * (1 - Math.pow(1 - p, 3))).toFixed(1); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  $("cue").addEventListener("click", function () { $("s-scale").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); });

  /* ---------- reveal on scroll, side rail, progress bar ---------- */
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var rail = $("rail");
  slides.forEach(function (s) {
    var b = el("button", null, '<span class="lbl">' + esc(s.dataset.label) + "</span><i></i>");
    b.type = "button"; b.setAttribute("aria-label", "Go to " + s.dataset.label);
    b.addEventListener("click", function () { s.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); });
    rail.appendChild(b); s._rail = b;
  });
  var revealIO = null;
  if ("IntersectionObserver" in window) {
    revealIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); } });
    }, { threshold: 0.12 });
    var railIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) slides.forEach(function (s) { s._rail.setAttribute("aria-current", String(s === e.target)); }); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    var firstScale = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { firstScale.disconnect(); startField(); } }, { threshold: 0.2 });
    slides.forEach(function (s) { railIO.observe(s); });
    firstScale.observe($("s-scale"));
  } else { setTimeout(function () { startField(); }, 0); }
  function observeReveals() {       // called AFTER the page is built, so JavaScript-made rows are included
    document.querySelectorAll(".rv, .mask, .bar-t").forEach(function (n) {
      if (n.classList.contains("in")) return;
      if (revealIO) revealIO.observe(n); else n.classList.add("in");
    });
  }
  function onScrollProgress() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    $("progress").style.transform = "scaleX(" + (max > 0 ? clamp01(window.scrollY / max) : 0) + ")";
  }

  /* =====================================================================
     SCROLL-REACTIVE BACKGROUND
     ~700 faint dots (1 dot = 300,000 people; blue = funded share, red = not funded).
     As you move down the page they re-form to echo each slide:
       intro: drifting cloud -> scale: ordered grid -> map: clusters over each crisis
       -> ranking: a skyline of need -> donors: streams of money -> story: a network
       -> not ranked: hollow rings (missing data) -> method: settled on the floor
     ===================================================================== */
  var bgc = $("bg"), bg = bgc.getContext("2d"), BW = 0, BH = 0, bdpr = 1;
  var bdots = [], BP = {}, bgP = 0, bgTarget = 0, bgForced = null, BG_PER = 300000;
  function rnd(seed) { var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function bgBuild() {
    bdots = [];
    crises.forEach(function (c, ci) {
      var n = Math.max(1, Math.round(c.people_in_need / BG_PER)), f = Math.round(n * Math.min(c.funding_pct, 100) / 100);
      for (var j = 0; j < n; j++) bdots.push({ ci: ci, j: j, n: n, funded: j < f, i: bdots.length });
    });
    bdots.forEach(function (d, i) { d.r1 = rnd(i + 1); d.r2 = rnd(i + 101); d.r3 = rnd(i + 211); d.r4 = rnd(i + 331); d.r5 = rnd(i + 457); d.depth = 0.04 + d.r3 * 0.22; });
  }
  function bgResize() {
    bdpr = Math.min(window.devicePixelRatio || 1, 2); BW = window.innerWidth; BH = window.innerHeight;
    bgc.width = Math.round(BW * bdpr); bgc.height = Math.round(BH * bdpr);
    var n = bdots.length, i;
    // grid: blue dots first, like a bar that fills from the top-left
    var order = bdots.map(function (d) { return d; }).sort(function (a, b) { return (b.funded ? 1 : 0) - (a.funded ? 1 : 0) || a.i - b.i; });
    var cols = Math.ceil(Math.sqrt(n * (BW * 0.9) / (BH * 0.7))), rows = Math.ceil(n / cols), sx = BW * 0.9 / cols, sy = Math.min(sx, BH * 0.72 / rows);
    BP.grid = []; order.forEach(function (d, k) { BP.grid[d.i] = [BW * 0.05 + (k % cols) * sx + sx / 2, BH * 0.14 + Math.floor(k / cols) * sy + sy / 2]; });
    // world: a sunflower of dots over each crisis's location on the map
    var s = BW * 0.94 / MAP.width, oy = (BH - MAP.height * s) / 2 + 24;
    BP.world = [];
    bdots.forEach(function (d) {
      var code = crises[d.ci].location_code, m = MAP.marks[code] || [MAP.width / 2, MAP.height / 2, 100];
      var r = Math.sqrt(d.j + 0.5) * 5.4, a = d.j * 2.39996;
      BP.world[d.i] = [BW * 0.03 + m[0] * s + r * Math.cos(a), oy + m[1] * s + r * Math.sin(a)];
    });
    // skyline: one column per crisis (most neglected first); bar height = people in need, blue at the bottom
    var slot = BW * 0.92 / N, ds = 7, base = BH * 0.86; BP.sky = [];
    crises.forEach(function (c, ci) {
      var list = bdots.filter(function (d) { return d.ci === ci; }), cols2 = Math.max(1, Math.floor(slot * 0.8 / ds));
      list.forEach(function (d, k) { BP.sky[d.i] = [BW * 0.04 + ci * slot + (slot - Math.min(cols2, list.length) * ds) / 2 + (k % cols2) * ds, base - Math.floor(k / cols2) * ds]; });
    });
    // static scatter (for rings) and floor (for the end)
    BP.ring = bdots.map(function (d) { return [BW * 0.04 + d.r4 * BW * 0.92, BH * 0.1 + d.r5 * BH * 0.8]; });
    BP.floor = bdots.map(function (d) { return [BW * 0.02 + d.r1 * BW * 0.96, BH - 12 - d.r2 * BH * 0.05]; });
    BP.cloud = bdots.map(function (d) { return [d.r1 * BW, d.r2 * BH * 1.25]; });
    BP.net = bdots.map(function (d) { return [BW * 0.03 + d.r2 * BW * 0.94, BH * 0.08 + d.r4 * BH * 0.84]; });
    bgScroll();
  }
  // where is dot d in formation k, at time t (ms) and scroll y
  function bgPos(k, d, t, y) {
    var i = d.i, p, tt = reduceMotion ? 0 : t;
    switch (k) {
      case 0: p = BP.cloud[i]; var cy = ((p[1] - y * d.depth) % (BH * 1.25) + BH * 1.25) % (BH * 1.25) - BH * 0.1;
        return [p[0] + Math.sin(tt * 0.00021 + d.r1 * 6.3) * 22, cy + Math.cos(tt * 0.00017 + d.r2 * 6.3) * 16];
      case 1: p = BP.grid[i]; return [p[0] + Math.sin(tt * 0.0007 + i) * 0.8, p[1] + Math.cos(tt * 0.0006 + i) * 0.8];
      case 2: p = BP.world[i]; return [p[0] + Math.sin(tt * 0.0005 + i) * 1.2, p[1] + Math.cos(tt * 0.00045 + i * 2) * 1.2];
      case 3: p = BP.sky[i]; return [p[0], p[1] + Math.sin(tt * 0.0008 + d.ci) * 0.6];
      case 4: // streams from donor lanes (left) to crisis bands (right)
        var lane = i % 9, ph = ((d.r1 + tt * 0.000028 * (0.6 + (lane % 3) * 0.25)) % 1 + 1) % 1, s2 = smooth(0.18, 0.9, ph);
        var y0 = BH * (0.12 + 0.76 * lane / 8), y1 = BH * (0.1 + 0.8 * d.ci / Math.max(1, N - 1));
        return [ph * BW, y0 + (y1 - y0) * s2 + Math.sin(ph * 12 + i) * 5];
      case 5: p = BP.net[i]; return [p[0] + Math.sin(tt * 0.00022 + d.r3 * 6.3) * 28, p[1] + Math.cos(tt * 0.0002 + d.r5 * 6.3) * 24];
      case 6: p = BP.ring[i]; return [p[0] + Math.sin(tt * 0.0003 + i) * 4, p[1] + Math.cos(tt * 0.00026 + i) * 4];
      default: p = BP.floor[i]; return [p[0], p[1] + Math.sin(tt * 0.001 + i) * 1.2];
    }
  }
  function bgScroll() {
    var vh = window.innerHeight, y = window.scrollY + vh * 0.55, tops = slides.map(function (s) { return s.offsetTop; }), k = 0;
    for (var i = 0; i < tops.length; i++) if (tops[i] <= y) k = i;
    var end = k + 1 < tops.length ? tops[k + 1] : document.documentElement.scrollHeight;
    bgTarget = k + clamp01((y - tops[k]) / Math.max(1, end - tops[k]));
    onScrollProgress();
    if (reduceMotion) { bgP = bgTarget; bgDraw(); }
  }
  function bgDraw(now) {
    if (!bdots.length || !BW) return;
    var P = bgForced != null ? bgForced : bgP, A = Math.min(Math.floor(P), 7), B = Math.min(A + 1, 7), frac = P - Math.floor(P);
    var e = smooth(0.5, 1.0, frac), t = now || performance.now(), y = window.scrollY;
    bg.setTransform(bdpr, 0, 0, bdpr, 0, 0); bg.clearRect(0, 0, BW, BH);
    var ringW = (A === 6 ? 1 - e : 0) + (B === 6 && A !== 6 ? e : 0), netW = (A === 5 ? 1 - e : 0) + (B === 5 && A !== 5 ? e : 0);
    var alpha = COL.light ? 0.34 : 0.3, R = 2.4, pos = new Array(bdots.length), k;
    for (k = 0; k < bdots.length; k++) {
      var d = bdots[k], a = bgPos(A, d, t, y), b = e > 0.001 ? bgPos(B, d, t, y) : a;
      var x = a[0] + (b[0] - a[0]) * e, yy = a[1] + (b[1] - a[1]) * e; pos[k] = [x, yy];
      var col = d.funded ? COL.fundedRGB : COL.unmetRGB;
      if (ringW > 0.02) {
        bg.globalAlpha = alpha * (1 - ringW * 0.6); bg.fillStyle = "rgb(" + col.join(",") + ")";
        bg.beginPath(); bg.arc(x, yy, R * (1 - ringW * 0.5), 0, 6.2832); bg.fill();
        bg.globalAlpha = alpha * ringW * 1.6; bg.strokeStyle = "rgb(" + col.join(",") + ")"; bg.lineWidth = 1.2;
        bg.beginPath(); bg.arc(x, yy, 4 + ringW * 3, 0, 6.2832); bg.stroke();
      } else {
        bg.globalAlpha = alpha; bg.fillStyle = "rgb(" + col.join(",") + ")";
        bg.beginPath(); bg.arc(x, yy, R, 0, 6.2832); bg.fill();
      }
    }
    if (netW > 0.02) {           // thin links between neighbours: a network of voices
      bg.lineWidth = 1; var lim = Math.min(170, bdots.length);
      for (var i = 0; i < lim; i++) for (var j = i + 1; j < lim; j++) {
        var dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], dd = dx * dx + dy * dy;
        if (dd < 12000) { bg.globalAlpha = (1 - dd / 12000) * 0.3 * netW; bg.strokeStyle = COL.light ? "#6250d6" : "#9085e9"; bg.beginPath(); bg.moveTo(pos[i][0], pos[i][1]); bg.lineTo(pos[j][0], pos[j][1]); bg.stroke(); }
      }
    }
    bg.globalAlpha = 1;
  }
  function bgLoop(now) { bgP += (bgTarget - bgP) * 0.1; if (Math.abs(bgTarget - bgP) < 0.0005) bgP = bgTarget; bgDraw(now); requestAnimationFrame(bgLoop); }
  window.addEventListener("scroll", bgScroll, { passive: true });
  if (/[?&]debug/.test(location.search)) window.__aidgapSetP = function (p) { bgForced = p; bgDraw(); };

  /* =====================================================================
     DOT FIELD (slide 2)
     ===================================================================== */
  var canvas = $("field"), ctx = canvas.getContext("2d"), wrap = $("fieldWrap"), tip = $("tip");
  var dots = [], mode = "all", W = 0, step = 12, dpr = 1, layouts = {}, clusters = [], hover = -1;
  var labelAlpha = 0, labelFrom = 0, labelT0 = 0, rafOn = false, started = false;
  function buildDots() {
    dots = [];
    crises.forEach(function (c, ci) {
      var n = Math.max(1, Math.round(c.people_in_need / PER_DOT)), f = Math.round(n * Math.min(c.funding_pct, 100) / 100);
      for (var k = 0; k < n; k++) dots.push({ ci: ci, funded: k < f, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t0: 0, delay: 0, dur: 0, appear: 0, lightAt: 0 });
    });
  }
  function measureLabel(t) { ctx.font = "600 12px system-ui, sans-serif"; return ctx.measureText(t).width; }
  function computeLayouts() {
    var pad = 6, cols = Math.max(10, Math.floor((W - pad * 2) / step));
    var idxs = dots.map(function (_, i) { return i; });
    var ff = idxs.filter(function (i) { return dots[i].funded; }).concat(idxs.filter(function (i) { return !dots[i].funded; }));
    var allPos = new Array(dots.length);
    ff.forEach(function (di, k) { allPos[di] = { x: pad + (k % cols) * step + step / 2, y: pad + Math.floor(k / cols) * step + step / 2, order: k }; });
    var allH = pad * 2 + Math.ceil(dots.length / cols) * step;
    var byC = {}; dots.forEach(function (d, i) { (byC[d.ci] = byC[d.ci] || []).push(i); });
    var cPos = new Array(dots.length), rects = [], gapX = 26, labelH = 20, gapY = 16, x = pad, y = pad, rowH = 0;
    crises.forEach(function (c, ci) {
      var list = byC[ci], n = list.length, cc = Math.max(4, Math.ceil(Math.sqrt(n * 1.7))), rows = Math.ceil(n / cc), label = shortName(c.location_name);
      var w = Math.max(cc * step, measureLabel(label) + 6), h = labelH + rows * step + gapY;
      if (x + w > W - pad && x > pad) { x = pad; y += rowH; rowH = 0; }
      list.sort(function (a, b) { return (dots[b].funded ? 1 : 0) - (dots[a].funded ? 1 : 0); });
      list.forEach(function (di, k) { cPos[di] = { x: x + (k % cc) * step + step / 2, y: y + labelH + Math.floor(k / cc) * step + step / 2, order: ci * 3 + k / n }; });
      rects.push({ ci: ci, x: x - 6, y: y - 4, w: w + 12, h: h - gapY + 10, label: label, lx: x, ly: y + 12 });
      x += w + gapX; rowH = Math.max(rowH, h);
    });
    layouts.all = { pos: allPos, h: allH }; layouts.country = { pos: cPos, h: y + rowH + pad, rects: rects };
  }
  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = wrap.clientWidth || 600; step = Math.max(7, Math.min(14, Math.floor(W / 82)));
    computeLayouts();
    var maxH = Math.max(layouts.all.h, layouts.country.h);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(maxH * dpr); canvas.style.width = W + "px"; canvas.style.height = maxH + "px";
    wrap.style.height = layouts[mode].h + "px"; clusters = layouts.country.rects;
  }
  function retarget(animate) {
    var L = layouts[mode], now = performance.now(), n = dots.length, an = animate && !reduceMotion;
    dots.forEach(function (d, i) { var p = L.pos[i]; d.sx = d.x; d.sy = d.y; d.tx = p.x; d.ty = p.y; d.t0 = now; d.dur = an ? 750 : 0; d.delay = an ? Math.min(380, (p.order / (mode === "all" ? n : N * 3)) * 380) : 0; });
    wrap.style.height = L.h + "px"; tick();
  }
  function setMode(m, animate) {
    mode = m; $("modeAll").setAttribute("aria-pressed", String(m === "all")); $("modeCountry").setAttribute("aria-pressed", String(m === "country"));
    labelFrom = labelAlpha; labelT0 = performance.now(); hover = -1; hideTip(); canvas.classList.remove("pointer"); retarget(animate); updateCaption();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!started) return false;
    var busy = false, R = Math.max(2.2, step * 0.33);
    var lp = reduceMotion ? 1 : clamp01((now - labelT0) / 500), target = mode === "country" ? 1 : 0;
    labelAlpha = labelFrom + (target - labelFrom) * lp; if (lp < 1) busy = true;
    if (mode === "country" && hover >= 0) { var hr = clusters.filter(function (r) { return r.ci === hover; })[0]; if (hr) { ctx.fillStyle = COL["--raise"]; roundRect(hr.x, hr.y, hr.w, hr.h, 10); ctx.fill(); } }
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i], p = d.dur === 0 ? 1 : clamp01((now - d.t0 - d.delay) / d.dur); if (p < 1) busy = true;
      var e = ease(p); d.x = d.sx + (d.tx - d.sx) * e; d.y = d.sy + (d.ty - d.sy) * e;
      var a = clamp01((now - d.appear) / 350); if (a < 1) busy = true;
      var l = d.funded ? clamp01((now - d.lightAt) / 500) : 0; if (d.funded && l < 1) busy = true;
      if (mode === "country" && hover >= 0 && d.ci !== hover) a *= 0.3;
      ctx.globalAlpha = a; ctx.fillStyle = mix(COL.unmetRGB, COL.fundedRGB, l);
      ctx.beginPath(); ctx.arc(d.x, d.y, R, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (labelAlpha > 0.01) { ctx.font = "600 12px system-ui, sans-serif"; clusters.forEach(function (r) { ctx.globalAlpha = labelAlpha * (hover >= 0 && r.ci !== hover ? 0.4 : 1); ctx.fillStyle = COL["--ink"]; ctx.fillText(r.label, r.lx, r.ly); }); ctx.globalAlpha = 1; }
    return busy;
  }
  function tick() { if (rafOn) return; rafOn = true; (function loop(now) { var busy = draw(now || performance.now()); if (busy) requestAnimationFrame(loop); else rafOn = false; })(performance.now()); }
  function startField() {
    if (started) return; started = true;
    var now = performance.now(), n = dots.length, L = layouts.all;
    dots.forEach(function (d, i) { var o = L.pos[i].order; d.appear = reduceMotion ? -1e9 : now + (o / n) * 900; d.lightAt = reduceMotion ? -1e9 : now + 1500 + (o / n) * 1200; });
    tick();
  }
  function hitCluster(ev) {
    var b = canvas.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
    for (var i = 0; i < clusters.length; i++) { var r = clusters[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r; }
    return null;
  }
  function hideTip() { tip.classList.remove("on"); }
  canvas.addEventListener("mousemove", function (ev) {
    if (mode !== "country") return;
    var r = hitCluster(ev), ci = r ? r.ci : -1; canvas.classList.toggle("pointer", !!r);
    if (ci !== hover) { hover = ci; tick(); }
    if (!r) { hideTip(); return; }
    var c = crises[ci];
    tip.innerHTML = "<b>" + esc(c.location_name) + "</b>#" + c.rank + " · " + fmtPeople(c.people_in_need) + " in need · " + c.funding_pct.toFixed(0) + "% funded";
    var b = canvas.getBoundingClientRect(), tx = ev.clientX - b.left + 14, ty = ev.clientY - b.top + 14; if (tx + 200 > W) tx = ev.clientX - b.left - 210;
    tip.style.left = tx + "px"; tip.style.top = ty + "px"; tip.classList.add("on");
  });
  canvas.addEventListener("mouseleave", function () { hover = -1; hideTip(); tick(); });
  canvas.addEventListener("click", function (ev) { if (mode !== "country") return; var r = hitCluster(ev); if (r) openCountry(crises[r.ci].location_code); });
  function updateCaption() {
    var fd = dots.filter(function (d) { return d.funded; }).length;
    $("caption").innerHTML = mode === "all"
      ? "<b>" + Math.round(fd / dots.length * 100) + "% of the dots</b> sit inside funded appeals. The red mass is need nobody has paid for. <b>Switch to “By country”</b> to see where."
      : "Crises run from most to least neglected. <b>Hover</b> for the numbers, <b>click</b> a cluster for the full story. Compare Sudan's field with Honduras': size and neglect are different things.";
  }
  $("modeAll").addEventListener("click", function () { if (mode !== "all") setMode("all", true); });
  $("modeCountry").addEventListener("click", function () { if (mode !== "country") setMode("country", true); });

  /* =====================================================================
     MAP (slide 3)
     ===================================================================== */
  var svg = $("map"), SVGNS = "http://www.w3.org/2000/svg", MW = MAP.width, MH = MAP.height;
  var vb = { x: 0, y: 0, w: MW, h: MH }, vbAnim = 0, selectedPath = null, dragged = false, pathByCode = {};
  function sv(tag, attrs) { var n = document.createElementNS(SVGNS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function setVB(v) { v.w = clamp(v.w, MW / 14, MW); v.h = v.w * MH / MW; v.x = clamp(v.x, 0, MW - v.w); v.y = clamp(v.y, 0, MH - v.h); vb = v; svg.setAttribute("viewBox", v.x.toFixed(2) + " " + v.y.toFixed(2) + " " + v.w.toFixed(2) + " " + v.h.toFixed(2)); }
  function animateVB(t, ms) {
    cancelAnimationFrame(vbAnim);
    t.w = clamp(t.w, MW / 14, MW); t.h = t.w * MH / MW; t.x = clamp(t.x, 0, MW - t.w); t.y = clamp(t.y, 0, MH - t.h);
    if (reduceMotion) { setVB({ x: t.x, y: t.y, w: t.w, h: t.h }); return; }
    var from = { x: vb.x, y: vb.y, w: vb.w }, t0 = performance.now();
    (function f(now) { var p = ease(clamp01((now - t0) / ms)); setVB({ x: from.x + (t.x - from.x) * p, y: from.y + (t.y - from.y) * p, w: from.w + (t.w - from.w) * p }); if (p < 1) vbAnim = requestAnimationFrame(f); })(t0);
  }
  function zoomBy(f) { var cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2, w = vb.w * f; animateVB({ x: cx - w / 2, y: cy - w * MH / MW / 2, w: w }, 350); }
  function focusCountry(code) { var m = MAP.marks[code]; if (!m) return; var w = clamp(Math.sqrt(m[2]) * 6, 200, 700); animateVB({ x: m[0] - w / 2, y: m[1] - w * MH / MW / 2, w: w }, 900); }
  function resetMap() { animateVB({ x: 0, y: 0, w: MW }, 700); if (selectedPath) { selectedPath.classList.remove("sel"); selectedPath = null; } }
  function paintMap() {       // colours are computed here (not in CSS) so every browser shows them
    Object.keys(pathByCode).forEach(function (code) {
      var e = byCode[code]; if (e && e.kind === "ranked") pathByCode[code].style.fill = mix(COL.landRGB, COL.unmetRGB, 0.22 + 0.78 * e.c.neglect_score / 100);
    });
  }
  function buildMap() {
    svg.setAttribute("viewBox", "0 0 " + MW + " " + MH);
    var defs = sv("defs", {}), pat = sv("pattern", { id: "hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    var bgR = sv("rect", { width: 5, height: 5 }); bgR.style.fill = "var(--land)";
    var ln = sv("line", { x1: 0, y1: 0, x2: 0, y2: 5, "stroke-width": 1.6 }); ln.style.stroke = "var(--muted)";
    pat.appendChild(bgR); pat.appendChild(ln); defs.appendChild(pat); svg.appendChild(defs);
    var g = sv("g", {}), rings = sv("g", {}), later = [];
    Object.keys(MAP.paths).forEach(function (iso) {
      var ent = byCode[iso], p = sv("path", { d: MAP.paths[iso], "class": "c" });
      if (ent) {
        var label, area = MAP.marks[iso][2];
        if (ent.kind === "ranked") { p.setAttribute("class", "c ranked"); label = ent.c.location_name + ", rank " + ent.c.rank + ", neglect score " + ent.c.neglect_score.toFixed(1); }
        else { p.setAttribute("class", "c unr"); label = ent.u.location_name + ", appeal without needs data, not scored"; }
        p.setAttribute("data-code", iso); p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); p.setAttribute("aria-label", label);
        pathByCode[iso] = p; later.push(p);
        if (area < 170) rings.appendChild(sv("circle", { cx: MAP.marks[iso][0], cy: MAP.marks[iso][1], r: 6, "class": "ring" }));
      } else g.appendChild(p);
    });
    later.sort(function (a, b) { return a.getAttribute("class").length - b.getAttribute("class").length; }).forEach(function (p) { g.appendChild(p); });
    svg.appendChild(g); svg.appendChild(rings);
  }
  var mapTip = $("mapTip");
  function codeAt(ev) { var t = ev.target.closest && ev.target.closest("path[data-code]"); return t ? t.getAttribute("data-code") : null; }
  svg.addEventListener("mousemove", function (ev) {
    var code = codeAt(ev), ent = code && byCode[code];
    if (!ent) { mapTip.classList.remove("on"); return; }
    var b = svg.getBoundingClientRect();
    mapTip.innerHTML = ent.kind === "ranked"
      ? "<b>" + esc(ent.c.location_name) + "</b>#" + ent.c.rank + " · score " + ent.c.neglect_score.toFixed(1) + " · " + ent.c.funding_pct.toFixed(0) + "% funded"
      : "<b>" + esc(ent.u.location_name) + "</b>Appeal " + ent.u.funding_pct.toFixed(0) + "% funded · not scored";
    var tx = ev.clientX - b.left + 14, ty = ev.clientY - b.top + 14; if (tx + 220 > b.width) tx = ev.clientX - b.left - 230;
    mapTip.style.left = tx + "px"; mapTip.style.top = ty + "px"; mapTip.classList.add("on");
  });
  svg.addEventListener("mouseleave", function () { mapTip.classList.remove("on"); });
  svg.addEventListener("click", function (ev) { if (dragged) return; var code = codeAt(ev); if (code) openCountry(code); });
  svg.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { var code = codeAt(ev); if (code) { ev.preventDefault(); openCountry(code); } } });
  (function enableDrag() {
    var down = null;
    svg.addEventListener("pointerdown", function (ev) { if (ev.button !== 0) return; down = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, moved: false }; });
    svg.addEventListener("pointermove", function (ev) {
      if (!down || vb.w >= MW - 1) return;
      var dx = ev.clientX - down.x, dy = ev.clientY - down.y; if (!down.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!down.moved) { down.moved = true; svg.classList.add("dragging"); try { svg.setPointerCapture(ev.pointerId); } catch (e) {} cancelAnimationFrame(vbAnim); }
      var k = vb.w / (svg.getBoundingClientRect().width || MW); setVB({ x: down.vx - dx * k, y: down.vy - dy * k, w: vb.w });
    });
    function end() { if (down && down.moved) { dragged = true; setTimeout(function () { dragged = false; }, 0); } down = null; svg.classList.remove("dragging"); }
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  })();
  $("zIn").addEventListener("click", function () { zoomBy(0.6); });
  $("zOut").addEventListener("click", function () { zoomBy(1 / 0.6); });
  $("zReset").addEventListener("click", resetMap);
  var chips = $("chips"); chips.appendChild(el("span", "h", "Start with:"));
  crises.slice(0, 5).forEach(function (c) { var b = el("button", "chip", esc(shortName(c.location_name)) + "<b>" + c.neglect_score.toFixed(0) + "</b>"); b.type = "button"; b.addEventListener("click", function () { openCountry(c.location_code); }); chips.appendChild(b); });

  /* =====================================================================
     RANKING, EXPLAINER, TANKS (slide 4)
     ===================================================================== */
  function contrib(c) { return [WEIGHTS.cov / 100 * c.coverage_pts, WEIGHTS.per / 100 * c.per_person_pts, WEIGHTS.scl / 100 * c.scale_pts]; }
  function buildRanking() {
    var list = $("rankList");
    crises.forEach(function (c, i) {
      var li = el("li", "rv"); li.style.setProperty("--i", Math.min(i, 8));
      var b = el("button"), k = contrib(c);
      b.type = "button"; b.setAttribute("aria-label", "Rank " + c.rank + ", " + c.location_name + ", neglect score " + c.neglect_score.toFixed(1));
      var badge = c.pin_source === "manual" ? '<span class="lowc" title="' + esc("Needs figure found by hand (" + c.pin_confidence + " confidence)") + '">hand-added figure</span>'
        : c.low_confidence ? '<span class="lowc" title="Needs figure from ' + (c.pin_year | 0) + ", funding from " + c.year + '">older needs data</span>' : "";
      b.innerHTML = '<span class="rk' + (c.rank <= 3 ? " top3" : "") + '">' + c.rank + '</span>' +
        '<span class="who"><span class="nm">' + esc(c.location_name) + badge + '</span>' +
        '<span class="meta">' + c.funding_pct.toFixed(0) + '% funded · $' + c.funding_per_person_usd.toFixed(c.funding_per_person_usd < 10 ? 2 : 0) + '/person<span class="hide-s"> · ' + fmtPeople(c.people_in_need) + ' in need</span></span></span>' +
        '<span class="sc"><b>' + c.neglect_score.toFixed(1) + '</b><span class="stack" title="' + esc("Funding gap " + k[0].toFixed(1) + " + dollars per person " + k[1].toFixed(1) + " + size " + k[2].toFixed(1)) + '">' +
        '<i class="s1" style="--w:' + k[0].toFixed(1) + '%"></i><i class="s2" style="--w:' + k[1].toFixed(1) + '%"></i><i class="s3" style="--w:' + k[2].toFixed(1) + '%"></i></span></span>';
      b.addEventListener("click", function () { openCountry(c.location_code); });
      li.appendChild(b); list.appendChild(li);
    });
    var h = "<thead><tr><th>Rank</th><th>Crisis</th><th>Score</th><th>People in need</th><th>Funded</th><th>Requested</th><th>Received</th><th>$ per person</th></tr></thead><tbody>";
    crises.forEach(function (c) {
      h += "<tr><td>" + c.rank + "</td><td>" + esc(c.location_name) + (c.low_confidence ? " *" : "") + "</td><td>" + c.neglect_score.toFixed(1) + "</td><td>" + Math.round(c.people_in_need).toLocaleString() +
        "</td><td>" + c.funding_pct.toFixed(1) + "%</td><td>" + fmtUSD(c.requirements_usd) + "</td><td>" + fmtUSD(c.funding_usd) + "</td><td>$" + c.funding_per_person_usd.toFixed(2) + "</td></tr>";
    });
    $("tbl").innerHTML = h + "</tbody>";
    var sure = crises.filter(function (c) { return c.times_in_top === D.scenarios.length; }).map(function (c) { return c.location_name; });
    $("stable").innerHTML = sure.length ? "<b>" + sure.join(" and ") + "</b> stay in the top 5 even when the weights are changed a lot." : "";
    var c0 = crises[0], k0 = contrib(c0);
    $("example").innerHTML = "<b>Worked example: " + esc(c0.location_name) + " (rank 1)</b><div class=\"eq\">" +
      '<span>Funding gap: ' + Math.round(c0.coverage_pts) + ' points × 40%</span><span>' + k0[0].toFixed(1) + "</span>" +
      '<span>Dollars per person: ' + Math.round(c0.per_person_pts) + ' points × 40%</span><span>' + k0[1].toFixed(1) + "</span>" +
      '<span>Size: ' + Math.round(c0.scale_pts) + ' points × 20%</span><span>' + k0[2].toFixed(1) + "</span></div>" +
      '<div class="tot"><span>Neglect Score</span><span>' + c0.neglect_score.toFixed(1) + "</span></div>";
  }
  /* ---- the fairness test: share the SAME total money so every appeal is funded to the same level ---- */
  function buildEqualizer() {
    var card = $("eqCard"), req = 0, fund = 0;
    crises.forEach(function (c) { req += c.requirements_usd; fund += c.funding_usd; });
    var avg = fund / req;                                           // the one funded share everyone would get
    var rows = crises.map(function (c) { return { c: c, delta: avg * c.requirements_usd - c.funding_usd }; });
    var moved = rows.reduce(function (s, r) { return s + Math.max(0, r.delta); }, 0);
    var topGain = rows.slice().sort(function (a, b) { return b.delta / b.c.funding_usd - a.delta / a.c.funding_usd; })[0];
    var topGive = rows.slice().sort(function (a, b) { return a.delta - b.delta; })[0];
    var h = '<div class="eq-ctl"><span class="end">Today</span><input type="range" id="eqRange" min="0" max="100" step="1" value="0" aria-label="Share the money evenly: 0 is today, 100 is fully even"><span class="end">Shared evenly</span>' +
      '<span><button type="button" class="eq-btn" id="eqPlay">Play</button> <button type="button" class="eq-btn" id="eqReset">Reset</button></span></div>' +
      '<div class="eq-sum"><div><b id="eqMoved">$0</b>moved between appeals (' + Math.round(moved / fund * 100) + '% of all funding if fully even)</div>' +
      '<div><b id="eqLow">0</b>appeals less than 20% funded</div><div><b id="eqGain" class="up">–</b><span id="eqGainTxt">biggest relative gain</span></div></div>' +
      '<div class="eq-key"><span><i style="background:var(--funded)"></i>paid</span><span><i style="background:color-mix(in srgb, var(--unmet) 34%, transparent)"></i>gap</span><span><i style="border-left:2px dashed var(--ink2);width:0;height:10px;border-radius:0"></i>even share (' + Math.round(avg * 100) + '%)</span></div><ol class="eq-rows">';
    rows.forEach(function (r, i) {
      h += '<li><button type="button" class="eq-row" data-i="' + i + '" aria-label="' + esc(r.c.location_name) + '"><span class="en"><small>#' + r.c.rank + '</small>' + esc(shortName(r.c.location_name)) + '</span>' +
        '<span class="eq-track"><span class="eq-fill"></span><span class="eq-mark" style="left:' + (avg * 100).toFixed(1) + '%"></span></span><span class="eq-delta"></span><span class="eq-pct"></span></button></li>';
    });
    h += '</ol><p class="eq-note">A thought experiment, not a recommendation. Real money is earmarked by donors, can’t always move between countries, and costs differ from place to place. The point is how uneven today’s funding is, measured against what each appeal says it needs.</p>';
    card.innerHTML = h;
    var els = Array.prototype.map.call(card.querySelectorAll(".eq-row"), function (b) { return { fill: b.querySelector(".eq-fill"), d: b.querySelector(".eq-delta"), p: b.querySelector(".eq-pct") }; });
    var range = $("eqRange");
    function setT(t) {
      var low = 0, best = { x: 0, i: 0 };
      rows.forEach(function (r, i) {
        var f = r.c.funding_usd + t * r.delta, pct = f / r.c.requirements_usd, d = t * r.delta;
        els[i].fill.style.width = Math.min(100, pct * 100).toFixed(2) + "%";
        els[i].p.textContent = Math.round(pct * 100) + "%";
        els[i].d.textContent = Math.abs(d) < 0.4e6 ? "" : (d > 0 ? "+" : "−") + fmtUSD(Math.abs(d));
        els[i].d.className = "eq-delta" + (d > 0.4e6 ? " up" : "");
        if (pct < 0.2) low++;
        var mult = f / Math.max(1, r.c.funding_usd); if (mult > best.x) best = { x: mult, i: i };
      });
      $("eqMoved").textContent = fmtUSD(t * moved); $("eqLow").textContent = low;
      $("eqGain").textContent = t < 0.02 ? "–" : (best.x >= 10 ? Math.round(best.x) : best.x.toFixed(1)) + "×";
      $("eqGainTxt").textContent = t < 0.02 ? "biggest relative gain (drag the slider)" : "more money for " + shortName(rows[best.i].c.location_name) + " than today";
    }
    var anim = 0;
    function play(from, to, ms, done) {
      cancelAnimationFrame(anim); var t0 = performance.now();
      (function f(now) {
        var p = clamp01((now - t0) / ms), t = from + (to - from) * ease(p); range.value = Math.round(t * 100); setT(t);
        if (p < 1) anim = requestAnimationFrame(f); else if (done) done();
      })(t0);
    }
    range.addEventListener("input", function () { cancelAnimationFrame(anim); demoOn = false; setT(+range.value / 100); });
    $("eqPlay").addEventListener("click", function () { demoOn = false; var t = +range.value / 100; play(t >= 0.99 ? 1 : t, t >= 0.99 ? 0 : 1, 3200); });
    $("eqReset").addEventListener("click", function () { demoOn = false; play(+range.value / 100, 0, 700); });
    card.querySelectorAll(".eq-row").forEach(function (b) { b.addEventListener("click", function () { openCountry(rows[+b.dataset.i].c.location_code); }); });
    var demoOn = true; setT(0);
    if (!reduceMotion && "IntersectionObserver" in window) {      // a short demo the first time it scrolls into view
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return; io.disconnect();
        setTimeout(function () { if (demoOn) play(0, 1, 3000, function () { setTimeout(function () { if (demoOn) play(1, 0, 1400); }, 900); }); }, 600);
      }, { threshold: 0.5 });
      io.observe(card);
    }
  }

  /* =====================================================================
     DONORS: who pays (slide 5)
     ===================================================================== */
  function buildDonors() {
    var body = $("donorBody");
    if (!DONORS || !DONORS.donors || !DONORS.donors.length) { body.innerHTML = '<div class="card empty rv" style="margin-top:30px">Donor data has not been loaded yet. Run <b>src/fetch_donors.py</b> and refresh this page.</div>'; return; }
    var rows = crises.map(function (c) { return { code: c.location_code, name: shortName(c.location_name), rank: c.rank }; });
    D.unranked.forEach(function (u) { if (u.location_code && DON[u.location_code]) rows.push({ code: u.location_code, name: shortName(u.location_name), rank: null }); });
    rows = rows.filter(function (r) { return DON[r.code]; });
    var donors = DONORS.donors.slice(0, 10), links = [], shown = 0;
    var dTot = {}, cTot = {};
    donors.forEach(function (d) { rows.forEach(function (r) { var a = d.to[r.code] || 0; if (a > 0) { links.push({ d: d.name, c: r.code, a: a }); shown += a; dTot[d.name] = (dTot[d.name] || 0) + a; cTot[r.code] = (cTot[r.code] || 0) + a; } }); });
    var allNamed = 0, allNot = 0, allTotal = 0;
    rows.forEach(function (r) { var x = DON[r.code]; allTotal += x.total; allNot += x.not_specified; x.top.forEach(function (t) { allNamed += t.usd; }); allNamed += x.other; });
    var topD = donors[0], top3 = donors.slice(0, 3).reduce(function (s, d) { return s + (dTot[d.name] || 0); }, 0);
    var html = '<div class="tiles">' +
      '<div class="card tile rv"><div class="big-n blue">' + Math.round((dTot[topD.name] || 0) / allNamed * 100) + '%</div><p><b>' + esc(topD.name) + '</b> gives the biggest share of the money that has a named donor country, ' + fmtUSD(dTot[topD.name] || 0) + ' across these crises in ' + DONORS.year + '.</p></div>' +
      '<div class="card tile rv" style="--i:1"><div class="big-n blue">' + Math.round(top3 / allNamed * 100) + '%</div><p>comes from just <b>3 donor countries</b>: ' + donors.slice(0, 3).map(function (d) { return esc(d.name); }).join(", ") + '. If one of them cuts back, the gap widens fast.</p></div>' +
      '<div class="card tile rv" style="--i:2"><div class="big-n blue">' + Math.round(allNot / allTotal * 100) + '%</div><p>of tracked money has <b>no donor country recorded</b> (pooled funds, private giving, or un-itemised). Follow-the-money has limits.</p></div></div>';
    // layout of the flow chart
    var VW = 1100, VH = 660, xL = 170, xR = 880, gapL = 8, gapR = 3;
    var k = (VH - Math.max((donors.length - 1) * gapL, (rows.length - 1) * gapR) - 20) / shown;
    var ly = 10, dPos = {}; donors.forEach(function (d) { var h = Math.max(2, (dTot[d.name] || 0) * k); dPos[d.name] = { y: ly, h: h, off: 0 }; ly += h + gapL; });
    var ry = 10, cPos = {}; rows.forEach(function (r) { var h = Math.max(2, (cTot[r.code] || 0) * k); cPos[r.code] = { y: ry, h: h, off: 0 }; ry += h + gapR; });
    var s = '<svg id="sankey" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Flow chart of donor countries funding each crisis">';
    var ribs = "";
    links.sort(function (a, b) { return rows.findIndex(function (r) { return r.code === a.c; }) - rows.findIndex(function (r) { return r.code === b.c; }); }).forEach(function (l, n) {
      var a = dPos[l.d], b = cPos[l.c], h = Math.max(0.6, l.a * k), y0 = a.y + a.off, y1 = b.y + b.off; a.off += h; b.off += h;
      var mx = (xL + xR) / 2;
      ribs += '<path class="rib" data-d="' + esc(l.d) + '" data-c="' + esc(l.c) + '" data-a="' + l.a + '" d="M' + xL + "," + y0.toFixed(1) + " C" + mx + "," + y0.toFixed(1) + " " + mx + "," + y1.toFixed(1) + " " + xR + "," + y1.toFixed(1) +
        " L" + xR + "," + (y1 + h).toFixed(1) + " C" + mx + "," + (y1 + h).toFixed(1) + " " + mx + "," + (y0 + h).toFixed(1) + " " + xL + "," + (y0 + h).toFixed(1) + ' Z"/>';
    });
    s += ribs;
    donors.forEach(function (d) { var p = dPos[d.name]; s += '<g class="dn" data-d="' + esc(d.name) + '"><rect class="dnode" x="' + (xL - 6) + '" y="' + p.y.toFixed(1) + '" width="6" height="' + p.h.toFixed(1) + '" rx="2"/><text x="' + (xL - 12) + '" y="' + (p.y + p.h / 2 + 4).toFixed(1) + '" text-anchor="end">' + esc(d.name.replace("United Arab Emirates", "UAE").replace("United States", "United States")) + " · " + fmtUSD(dTot[d.name] || 0) + "</text></g>"; });
    // labels on the right: keep at least 12px between them (tiny crises would overlap otherwise)
    var labY = rows.map(function (r) { return cPos[r.code].y + Math.max(2, cPos[r.code].h) / 2; });
    for (var q = 1; q < labY.length; q++) labY[q] = Math.max(labY[q], labY[q - 1] + 12);
    labY[labY.length - 1] = Math.min(labY[labY.length - 1], VH - 8);
    for (q = labY.length - 2; q >= 0; q--) labY[q] = Math.min(labY[q], labY[q + 1] - 12);
    rows.forEach(function (r, qi) {
      var p = cPos[r.code], mid = p.y + Math.max(2, p.h) / 2;
      s += '<g class="cn" data-c="' + esc(r.code) + '"><rect class="cnode" x="' + xR + '" y="' + p.y.toFixed(1) + '" width="6" height="' + Math.max(2, p.h).toFixed(1) + '" rx="2"/>' +
        (Math.abs(labY[qi] - mid) > 3 ? '<line x1="' + (xR + 6) + '" y1="' + mid.toFixed(1) + '" x2="' + (xR + 11) + '" y2="' + labY[qi].toFixed(1) + '" stroke="var(--base)" stroke-width="1"/>' : "") +
        '<text x="' + (xR + 14) + '" y="' + (labY[qi] + 4).toFixed(1) + '">' + esc(r.name) + "</text></g>";
    });
    s += "</svg>";
    html += '<div class="card sankey-card rv"><div class="tip" id="skTip" role="status"></div>' + s + '</div>' +
      '<p class="note rv">Ribbon width = US dollars given in ' + DONORS.year + ' by the ten biggest donor countries to each crisis, as tracked by OCHA FTS (money given to one country alone). Crises are in ranking order, top to bottom. Source: OCHA Financial Tracking Service.</p>';
    body.innerHTML = html;
    var sk = $("sankey"), skTip = $("skTip");
    function hi(sel, on) { sk.classList.toggle("has-hi", on); sk.querySelectorAll(".rib").forEach(function (r) { r.classList.toggle("hi", on && sel(r)); }); }
    sk.addEventListener("mouseover", function (ev) {
      var t = ev.target.closest("[data-d],[data-c]"); if (!t) return;
      var d = t.getAttribute("data-d"), c = t.getAttribute("data-c");
      if (t.classList.contains("rib")) { hi(function (r) { return r === t; }, true); skTip.innerHTML = "<b>" + esc(d) + " → " + esc(shortName(nameOf(c))) + "</b>" + fmtUSD(+t.getAttribute("data-a")); skTip.classList.add("on"); }
      else if (d) hi(function (r) { return r.getAttribute("data-d") === d; }, true);
      else if (c) hi(function (r) { return r.getAttribute("data-c") === c; }, true);
    });
    sk.addEventListener("mousemove", function (ev) { var b = sk.getBoundingClientRect(); skTip.style.left = Math.min(ev.clientX - b.left + 14, b.width - 220) + "px"; skTip.style.top = (ev.clientY - b.top + 14) + "px"; });
    sk.addEventListener("mouseleave", function () { hi(function () { return false; }, false); skTip.classList.remove("on"); });
    sk.addEventListener("mouseout", function (ev) { if (!ev.relatedTarget || !sk.contains(ev.relatedTarget)) { hi(function () { return false; }, false); skTip.classList.remove("on"); } });
    sk.addEventListener("click", function (ev) { var t = ev.target.closest("[data-c]"); if (t) openCountry(t.getAttribute("data-c"), "donors"); });
  }

  /* =====================================================================
     MEDIA (slide 6)
     ===================================================================== */
  function srcText(m) { return m.sources.slice(0, 3).map(function (s, i) { return (i === 0 ? "<b>" + esc(s.country) + "</b> " : esc(s.country) + " ") + pctTxt(s.share); }).join(" · "); }
  function spearman(xs, ys) {
    function ranks(v) { var o = v.map(function (_, i) { return i; }).sort(function (a, b) { return v[a] - v[b]; }), r = [], i = 0; while (i < o.length) { var j = i; while (j + 1 < o.length && v[o[j + 1]] === v[o[i]]) j++; for (var k = j; k >= i; k--) r[o[k]] = (i + j) / 2 + 1; i = j + 1; } return r; }
    var a = ranks(xs), b = ranks(ys), n = a.length, ma = a.reduce(function (s, v) { return s + v; }, 0) / n, mb = b.reduce(function (s, v) { return s + v; }, 0) / n, num = 0, da = 0, db = 0;
    for (var i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += Math.pow(a[i] - ma, 2); db += Math.pow(b[i] - mb, 2); }
    return num / Math.sqrt(da * db);
  }
  function buildMedia() {
    var body = $("mediaBody"), rows = [];
    crises.forEach(function (c) { var m = MED[c.location_code]; if (m && m.n) rows.push({ code: c.location_code, name: c.location_name, rank: c.rank, m: m }); });
    D.unranked.forEach(function (u) { var m = u.location_code && MED[u.location_code]; if (m && m.n) rows.push({ code: u.location_code, name: u.location_name, rank: null, m: m }); });
    if (!rows.length) {
      body.innerHTML = '<div class="card empty rv" style="margin-top:30px">Media coverage data has not been loaded yet. Run <b>src/fetch_media.py</b> then <b>src/build_media_summary.py</b>, and refresh this page.</div>' + mediaInfo() + scatterHTML();
      wireScatter(); return;
    }
    var big = rows.filter(function (r) { return r.m.n >= 20; });
    var topState = big.slice().sort(function (a, b) { return b.m.state_share - a.m.state_share; })[0];
    var tot = 0, byC = {}, nLocal = 0; rows.forEach(function (r) { tot += r.m.n; nLocal += r.m.n_local; r.m.sources.forEach(function (s) { byC[s.country] = (byC[s.country] || 0) + s.share * r.m.n; }); });
    var topCountry = Object.keys(byC).sort(function (a, b) { return byC[b] - byC[a]; })[0];
    var html = '<div class="tiles">' +
      (topState ? '<div class="card tile rv"><div class="big-n violet">' + pctTxt(topState.m.state_share) + '</div><p><b>of sampled coverage of ' + esc(shortName(topState.name)) + '</b> comes from state-linked outlets' + (topState.m.state_by_gov.length ? " (" + topState.m.state_by_gov.map(function (g) { return esc(g.gov); }).join(", ") + ")" : "") + ", the highest of any crisis.</p></div>" : "") +
      '<div class="card tile rv" style="--i:1"><div class="big-n violet">' + Math.round(byC[topCountry] / tot * 100) + '%</div><p>of all sampled articles were published by outlets based in <b>' + esc(topCountry) + '</b>. Where a story is told from shapes how it is told.</p></div>' +
      '<div class="card tile rv" style="--i:2"><div class="big-n violet">' + Math.round(nLocal / tot * 100) + '%</div><p>of ' + tot.toLocaleString() + ' sampled articles across <b>' + rows.length + ' crises</b> (' + esc(MEDIA.window) + ') came from outlets <b>inside the affected country</b> (in any language we searched). The people living it are rarely the ones telling it to the world.</p></div></div>';
    html += '<div class="mrows"><div class="mhead"><span>#</span><span>Crisis</span><span>Where the coverage comes from</span><span style="text-align:center">In-country</span><span style="text-align:right">State-linked outlets</span></div>';
    rows.forEach(function (r, i) {
      html += '<button class="mrow rv" type="button" data-code="' + esc(r.code) + '" style="--i:' + Math.min(i, 6) + '"><span class="rn">' + (r.rank || "–") + '</span><span class="nm">' + esc(shortName(r.name)) + '</span>' +
        '<span class="src">' + srcText(r.m) + '</span><span class="loc">' + r.m.n_local + ' of ' + r.m.n + '</span><span class="stbar"><span class="bar-t" style="--w:' + Math.round(r.m.state_share * 100) + '%"><i></i></span><b>' + pctTxt(r.m.state_share) + '</b></span></button>';
    });
    html += "</div>" + scatterHTML() + mediaInfo();
    body.innerHTML = html;
    Array.prototype.forEach.call(body.querySelectorAll(".mrow"), function (b) { b.addEventListener("click", function () { openCountry(b.dataset.code, "abroad"); }); });
    wireScatter();
  }
  function scatterHTML() {
    var pts2 = crises.filter(function (c) { var m = MED[c.location_code]; return m && m.volume && m.volume.share_pct > 0; });
    if (pts2.length < 8) return "";
    var xs = pts2.map(function (c) { return Math.log10(MED[c.location_code].volume.share_pct); }), ys = pts2.map(function (c) { return Math.log10(c.funding_per_person_usd); });
    var rho = spearman(xs, ys), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var Wd = 720, Hd = 340, L = 56, R = 16, T = 12, B = 44;
    function px(v) { return L + (v - x0) / (x1 - x0 || 1) * (Wd - L - R); } function py(v) { return Hd - B - (v - y0) / (y1 - y0 || 1) * (Hd - T - B); }
    var s = '<svg id="scatter" viewBox="0 0 ' + Wd + " " + Hd + '" role="img" aria-label="Scatter plot of media coverage against dollars per person"><line class="gl" x1="' + L + '" y1="' + (Hd - B) + '" x2="' + (Wd - R) + '" y2="' + (Hd - B) + '"/><line class="gl" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (Hd - B) + '"/>' +
      '<text x="' + (Wd / 2) + '" y="' + (Hd - 8) + '" text-anchor="middle">Share of all monitored news coverage (log scale) →  more attention</text><text transform="rotate(-90)" x="' + (-(Hd - B + T) / 2) + '" y="14" text-anchor="middle">$ funding per person in need (log) →</text>';
    pts2.forEach(function (c, i) {
      s += '<circle data-code="' + esc(c.location_code) + '" cx="' + px(xs[i]).toFixed(1) + '" cy="' + py(ys[i]).toFixed(1) + '" r="' + clamp(Math.sqrt(c.people_in_need / 1e6) * 2.4 + 4, 5, 15).toFixed(1) + '"><title>' + esc(c.location_name) + "</title></circle>";
      if (c.rank <= 6) s += '<text x="' + (px(xs[i]) + 10).toFixed(1) + '" y="' + (py(ys[i]) + 4).toFixed(1) + '">' + esc(shortName(c.location_name)) + "</text>";
    });
    return '<div class="card" id="scatterBox"><h3>Does more attention mean more money?</h3><p class="note" style="margin:0">Each dot is a crisis; bigger dots have more people in need. Rank correlation across ' + pts2.length + ' crises: <b>ρ = ' + rho.toFixed(2) + '</b>. This is a pattern over one week of coverage, not proof that coverage causes funding.</p>' + s + "</svg></div>";
  }
  function wireScatter() { Array.prototype.forEach.call(document.querySelectorAll("#scatter circle"), function (c) { c.addEventListener("click", function () { openCountry(c.getAttribute("data-code")); }); }); }
  function mediaInfo() {
    return '<div class="two"><div class="card info rv"><h3>Why coverage matters</h3><ul>' +
      '<li>Humanitarian funding is <b>voluntary</b>: donors respond to what they see and what their governments prioritise.</li>' +
      '<li>Research on disaster relief (for example Eisensee and Strömberg, 2007) found that <b>news coverage affects whether relief is given</b>, not only how bad the disaster is.</li>' +
      '<li>CARE publishes a yearly “Suffering in Silence” list of the most <b>under-reported crises</b>. Matching it to this ranking is a planned next step.</li></ul></div>' +
      '<div class="card info rv" style="--i:1"><h3>What this can’t show</h3><ul>' +
      '<li>It cannot tell whether an article is <b>propaganda</b>. That takes reading it, so this page shows who is speaking and stops there.</li>' +
      '<li>“State-linked” means <b>owned, funded or controlled by a government</b>. It says nothing about accuracy, and the list is short, so shares are a floor.</li>' +
      '<li>Samples are English-language and capped at 250 articles, so they miss local-language coverage.</li></ul></div></div>';
  }

  /* =====================================================================
     NOT RANKED + METHOD (slides 7-8)
     ===================================================================== */
  function buildUnranked() {
    var maxRanked = Math.max.apply(null, crises.map(function (c) { return c.requirements_usd; }));
    var sorted = D.unranked.slice().sort(function (a, b) { return b.requirements_usd - a.requirements_usd; });
    var biggest = sorted[0], box = $("cards"), hand = crises.filter(function (c) { return c.pin_source === "manual"; }), added = hand.length;
    if (!sorted.length) {                                   // every appeal could be scored: show how the hand-found ones were checked
      $("exclNote").innerHTML = "Refugee-hosting countries inside regional plans are left out because their per-country funding is unreliable.";
      $("gapsKicker").textContent = "By hand"; $("gapsTitle").textContent = "The gaps we filled by hand."; $("s-gaps").dataset.label = "By hand";
      if ($("s-gaps")._rail) $("s-gaps")._rail.querySelector(".lbl").textContent = "By hand";
      $("hatchLegend").style.display = "none";
      $("gapsSub").innerHTML = added + " countries had no people-in-need figure in the main data source. We <b>found theirs in official documents and checked each against the funding data</b>. Confidence differs, so every one is labelled and links to its source.";
      hand.forEach(function (c) {
        var b = el("button", "gcard"); b.type = "button";
        b.innerHTML = "<b>" + esc(c.location_name) + '</b><div class="t">Rank ' + c.rank + " · " + esc(c.pin_confidence) + ' confidence</div><div class="big">' + fmtPeople(c.people_in_need) + ' <small>in need</small></div>' +
          '<div class="why">' + esc(c.pin_verified || c.pin_note) + "</div>";
        b.addEventListener("click", function () { openCountry(c.location_code); }); box.appendChild(b);
      });
      return;
    }
    $("exclNote").innerHTML = D.unranked.length + " other appeals" + (biggest && biggest.requirements_usd > maxRanked ? ", including the largest (" + esc(biggest.location_name) + "),": "") + " could not be scored and are listed <a href=\"#s-gaps\">separately</a>.";
    $("gapsSub").innerHTML = "These have their own appeal, but <b>we could not match a trustworthy people-in-need figure to their funding total</b>, so a fair score isn't possible. " + (added ? added + " other countries were added to the ranking using figures found by hand (see the method section). " : "") + "They are listed, not hidden.";
    sorted.forEach(function (u) {
      var c = el("button", "gcard"); c.type = "button";
      c.innerHTML = "<b>" + esc(u.location_name) + '</b><div class="t">' + esc(u.appeal_types) + '</div><div class="big">' + fmtUSD(u.requirements_usd) + ' <small>requested</small></div>' +
        '<div class="t" style="margin:4px 0 0">' + u.funding_pct.toFixed(0) + '% funded</div><div class="why">' + esc(u.note || "No people-in-need figure.") + "</div>";
      if (u.location_code) c.addEventListener("click", function () { openCountry(u.location_code); });
      box.appendChild(c);
    });
  }
  function buildMethod() {
    var hand = crises.filter(function (c) { return c.pin_source === "manual"; });
    $("hand").innerHTML = hand.length ? '<p class="note" style="max-width:none;margin:0 0 10px">These figures fill gaps in the main data source. Each was checked against an official or plan-tracking document, and against the funding total it should match. Confidence is lower where sources disagree. The full record, including a figure we found but did not use (Honduras), is in <b>data/reference/manual_pin.csv</b>, and the checks are in <b>verification_report.csv</b>.</p><div class="tbl-scroll"><table><thead><tr><th>Country</th><th>People in need</th><th>Confidence</th><th>How it was checked</th><th>Source</th></tr></thead><tbody>' +
      hand.map(function (c) { return "<tr><td>" + esc(c.location_name) + "</td><td>" + Math.round(c.people_in_need).toLocaleString() + "</td><td>" + esc(c.pin_confidence) + '</td><td style="text-align:left;white-space:normal;min-width:260px">' + esc(c.pin_verified || c.pin_note) + "</td><td>" + ext(c.pin_url, "link") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="note">No hand-added figures.</p>';
    $("srcs").innerHTML = (D.sources || []).map(function (s) {
      return "<li>" + ext(s.url, esc(s.name)) + '<span class="st">' + esc(String(s.status).replace("_", " ")) + "</span><br>" + esc(s.publisher) + ". " + esc(s.used_for) + ". " + esc(s.notes || "") + "</li>";
    }).join("");
  }

  /* =====================================================================
     POPUP (modal) with tabs
     ===================================================================== */
  var modal = $("modal"), backdrop = $("backdrop"), mCode = null, mTab = null, lastFocus = null;
  function tabsFor(code) {
    var m = MED[code], name = shortName(nameOf(code)), g = (D.donate && D.donate[code]) || [];
    return [
      { id: "abroad", label: "Published abroad", count: m ? m.n_abroad : null },
      { id: "local", label: "Published in " + name, count: m ? m.n_local : null },
      { id: "donors", label: "Who funds it", count: null },
      { id: "give", label: "Where to give", count: g.length || null }
    ];
  }
  function openCountry(code, tab) {
    if (!byCode[code]) return;
    lastFocus = document.activeElement; mCode = code; artFilter = "all";
    renderLeft();
    var tabs = tabsFor(code);
    var pick = tab || (tabs[0].count ? "abroad" : tabs[1].count ? "local" : "donors");
    renderTabs(tabs, pick);
    focusCountry(code);
    if (selectedPath) selectedPath.classList.remove("sel");
    selectedPath = pathByCode[code] || null; if (selectedPath) selectedPath.classList.add("sel");
    modal.classList.add("on"); backdrop.classList.add("on"); modal.setAttribute("aria-hidden", "false");
    $("mLeft").scrollTop = 0; $("dClose").focus();
  }
  function closeModal() {
    modal.classList.remove("on"); backdrop.classList.remove("on"); modal.setAttribute("aria-hidden", "true"); mCode = null;
    resetMap(); if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderTabs(tabs, active) {
    mTab = active; var bar = $("mTabs"); bar.innerHTML = "";
    tabs.forEach(function (t) {
      var b = el("button", "tab", esc(t.label) + (t.count != null ? "<small>" + t.count + "</small>" : "")); b.type = "button"; b.id = "tab-" + t.id;
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(t.id === active)); b.setAttribute("tabindex", t.id === active ? "0" : "-1");
      b.addEventListener("click", function () { renderTabs(tabs, t.id); });
      b.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var i = tabs.findIndex(function (x) { return x.id === t.id; }), j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length; renderTabs(tabs, tabs[j].id); $("tab-" + tabs[j].id).focus(); } });
      bar.appendChild(b);
    });
    var panel = $("mPanel"); panel.setAttribute("aria-labelledby", "tab-" + active); panel.innerHTML = panelHTML(active); panel.scrollTop = 0;
    if (active === "abroad" || active === "local") wireArticles(active);
  }
  function panelHTML(id) {
    if (id === "abroad" || id === "local") return articlesHTML(id);
    if (id === "donors") return donorsHTML();
    return giveHTML();
  }
  /* ---- articles: original wording, language filter, and translation ----
     Headlines are shown in their ORIGINAL language (right-to-left scripts included). For a
     non-English headline you can (1) translate it on the spot if your browser has the
     built-in on-device Translator (recent Chrome/Edge), or (2) open the whole page through
     Google Translate. If a translation was stored at build time (title_en) it is shown first. */
  var LANGCODE = { Arabic: "ar", French: "fr", Spanish: "es", Portuguese: "pt", Ukrainian: "uk", Russian: "ru", Burmese: "my", Somali: "so", Vietnamese: "vi", Nepali: "ne", Urdu: "ur", Persian: "fa", Pashto: "ps", "Haitian Creole": "ht", Hausa: "ha" };
  var artFilter = "all", panelList = [];
  function isEnglish(x) { return !x.lang || x.lang === "English"; }
  function translateTitle(text, langName) {
    var code = LANGCODE[langName];
    if (!code || typeof self.Translator === "undefined") return Promise.resolve(null);
    return self.Translator.availability({ sourceLanguage: code, targetLanguage: "en" }).then(function (a) {
      if (a === "unavailable") return null;
      return self.Translator.create({ sourceLanguage: code, targetLanguage: "en" }).then(function (t) { return t.translate(text); });
    }).catch(function () { return null; });
  }
  function articlesHTML(which) {
    var m = MED[mCode], name = shortName(nameOf(mCode));
    var intro = which === "abroad"
      ? "Articles about <b>" + esc(name) + "</b> published by outlets based <b>in other countries</b>, in English and in " + esc(name) + "'s main language."
      : "Articles about <b>" + esc(name) + "</b> published by outlets based <b>inside " + esc(name) + "</b>, in any language.";
    if (!m || !m.n) return '<p class="pp">' + intro + '</p><p class="none">No articles are loaded for this country yet. The media download is slow because the free news data source limits how fast it can be asked. Run <b>src/fetch_media.py</b> and <b>src/build_media_summary.py</b>, then refresh.</p>';
    var all = (which === "abroad" ? m.abroad : m.local) || [], h = '<p class="pp">' + intro + " A sample from " + esc(MEDIA.window) + ", matched with humanitarian keywords (GDELT machine-translates other languages for matching).</p>";
    if (!all.length) return h + '<p class="none">' + (which === "local"
      ? "Nothing from outlets based in " + esc(name) + " turned up in this sample. That does not mean nothing is published there: some governments restrict local media, and the free search covers only about a week of coverage."
      : "No articles from abroad in this sample.") + "</p>";
    var nEn = all.filter(isEnglish).length, nOther = all.length - nEn;
    var list = all.filter(function (x) { return artFilter === "en" ? isEnglish(x) : artFilter === "other" ? !isEnglish(x) : true; });
    panelList = list;
    if (nOther > 0) h += '<div class="chipbar" role="group" aria-label="Filter by language"><button type="button" class="lchip" data-f="all" aria-pressed="' + (artFilter === "all") + '">All ' + all.length + '</button><button type="button" class="lchip" data-f="en" aria-pressed="' + (artFilter === "en") + '">English ' + nEn + '</button><button type="button" class="lchip" data-f="other" aria-pressed="' + (artFilter === "other") + '">Other languages ' + nOther + "</button></div>";
    if (which === "abroad") h += '<p class="pp">Outlets by country: ' + srcText(m) + (m.state_share > 0 ? ". <b>" + pctTxt(m.state_share) + "</b> of this country's sample comes from state-linked outlets (owned, funded or controlled by a government; that describes ownership, not accuracy)." : ".") + "</p>";
    h += '<ul class="arts">' + list.map(function (x, i) {
      var en = isEnglish(x), main = x.title_en || x.title;
      var tr = en ? "" : '<div class="tr"><button type="button" data-tr="' + i + '">Translate headline</button>' + ext("https://translate.google.com/translate?sl=auto&tl=en&u=" + encodeURIComponent(x.url), "Read translated page ↗") + '<span class="out" data-out="' + i + '"></span></div>';
      return "<li>" + '<a dir="auto" href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(main || x.url) + "</a>" +
        (x.title_en && x.title ? '<div class="am" dir="auto">Original: ' + esc(x.title) + "</div>" : "") +
        '<div class="am">' + esc(x.domain) + (x.country ? " · " + esc(x.country) : "") + (x.date ? " · " + esc(x.date) : "") + (en ? "" : '<span class="lang-tag">' + esc(x.lang) + "</span>") +
        (x.state ? '<span class="tagst" title="Owned, funded or controlled by a government">state-linked · ' + esc(x.state) + "</span>" : "") + "</div>" + tr + "</li>";
    }).join("") + '</ul><p class="fine">Headlines come from GDELT and link to the publishers. Machine translation can be wrong, so read the original when it matters. Listing an article is not an endorsement.</p>';
    return h;
  }
  function wireArticles(which) {
    var panel = $("mPanel");
    panel.querySelectorAll(".lchip").forEach(function (b) { b.addEventListener("click", function () { artFilter = b.dataset.f; panel.innerHTML = articlesHTML(which); wireArticles(which); }); });
    panel.querySelectorAll("button[data-tr]").forEach(function (b) {
      b.addEventListener("click", function () {
        var x = panelList[+b.dataset.tr], out = panel.querySelector('[data-out="' + b.dataset.tr + '"]');
        b.disabled = true; b.textContent = "Translating…";
        translateTitle(x.title, x.lang).then(function (t) {
          if (t) { out.textContent = t; b.remove(); }
          else { b.textContent = "Built-in translator not available here. Use “Read translated page”."; }
        });
      });
    });
  }
  function donorsHTML() {
    var x = DON[mCode], name = shortName(nameOf(mCode));
    if (!x) return '<p class="none">No donor data for ' + esc(name) + (DONORS ? "." : " yet. Run <b>src/fetch_donors.py</b> and refresh.") + "</p>";
    var h = '<p class="pp"><b>' + fmtUSD(x.total) + '</b> reached ' + esc(name) + " in " + DONORS.year + " from donors that FTS could attribute to a single country or to no country. These are the biggest:</p>";
    x.top.forEach(function (t) { h += '<div class="dbar"><span>' + esc(t.donor) + '</span><span class="bar-t" style="--w:' + Math.max(1, Math.round(t.share * 100)) + '%"><i></i></span><span>' + fmtUSD(t.usd) + "</span></div>"; });
    if (x.other > 0) h += '<div class="dbar"><span>Other donor countries</span><span class="bar-t" style="--w:' + Math.max(1, Math.round(x.other / x.total * 100)) + '%"><i></i></span><span>' + fmtUSD(x.other) + "</span></div>";
    if (x.not_specified > 0) h += '<div class="dbar"><span>No donor country recorded</span><span class="bar-t" style="--w:' + Math.max(1, Math.round(x.not_specified / x.total * 100)) + '%"><i></i></span><span>' + fmtUSD(x.not_specified) + "</span></div>";
    return h + '<p class="fine">Source: OCHA Financial Tracking Service. This counts all flows FTS tracks to ' + esc(name) + ", including money outside the formal appeal, so it is larger than the appeal funding shown at left." +
      (x.shared > 0 ? " A further " + fmtUSD(x.shared) + " was given jointly to several countries and is not split by donor here." : "") +
      (x.domestic > 0 ? " " + fmtUSD(x.domestic) + " came from " + esc(name) + "'s own government, which is not counted as a donor." : "") + "</p>";
  }
  function giveHTML() {
    var g = (D.donate && D.donate[mCode]) || [], gen = (D.donate && D.donate.ALL) || [], name = shortName(nameOf(mCode));
    var h = '<p class="pp">Places to start if you want to give toward the response in <b>' + esc(name) + "</b>. These are large, long-established relief organisations; each link was checked to load on " + esc((g[0] || gen[0] || {}).checked || "the date of the last check") + ". <b>This is a starting point, not an endorsement or a rating.</b></p>";
    h += g.length ? '<ul class="give">' + g.map(function (x) { return "<li>" + ext(x.url, "<b>" + esc(x.org) + "</b><span>" + esc(x.what) + "</span>") + "</li>"; }).join("") + "</ul>" : '<p class="none">No organisation pages could be verified for this country yet.</p>';
    if (gen.length) h += '<h4 style="margin:22px 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Before you give</h4><ul class="give">' + gen.map(function (x) { return "<li>" + ext(x.url, "<b>" + esc(x.org) + "</b><span>" + esc(x.what) + "</span>") + "</li>"; }).join("") + "</ul>";
    return h;
  }
  function renderLeft() {
    var ent = byCode[mCode], h;
    if (ent.kind === "unranked") {
      var u = ent.u;
      h = '<div class="d-rank">Not ranked</div><h3 class="nm2" id="dName">' + esc(u.location_name) + '</h3>' +
        '<p class="notice plain">This country has its own appeal, but we could not match a trustworthy people-in-need figure to its funding, so it is not scored. <br><b>Why:</b> ' + esc(u.note || "no figure found") + "</p>" +
        '<div class="stats"><div class="stat"><span>Appeal</span><b>' + fmtUSD(u.requirements_usd) + '</b><small>' + esc(u.appeal_types) + '</small></div>' +
        '<div class="stat"><span>Funded</span><b>' + u.funding_pct.toFixed(1) + '%</b><small>' + fmtUSD(u.funding_usd) + ' received</small></div></div>';
      $("mLeft").innerHTML = h; return;
    }
    var c = ent.c, swing = c.worst_rank - c.best_rank;
    var robust = swing <= 2 ? "Rank <b>#" + c.best_rank + (swing ? "–#" + c.worst_rank : "") + "</b> across all " + D.scenarios.length + " weightings: <b>a robust result</b>."
      : "Rank swings from <b>#" + c.best_rank + " to #" + c.worst_rank + "</b> depending on the weights: <b>treat the exact position with care</b>.";
    var ratio = c.funding_per_person_usd / medianPer;
    var compare = ratio < 1 ? "Receives <b>" + (1 / ratio).toFixed(1) + "× less</b> per person than the median of these " + N + " crises ($" + medianPer.toFixed(0) + ")." : "Receives <b>" + ratio.toFixed(1) + "× more</b> per person than the median of these " + N + " crises ($" + medianPer.toFixed(0) + ").";
    function drv(label, v, w, cls) { return '<div class="driver" style="--w:' + v.toFixed(0) + '%"><div class="lbl"><span>' + label + '</span><span>weight ' + w + '%</span></div><span class="stack"><i class="' + cls + '" style="width:' + v.toFixed(0) + '%"></i></span><div class="pts">' + Math.round(v) + '</div></div>'; }
    var notes = "";
    if (c.pin_source === "manual") notes += '<p class="notice"><b>Hand-added needs figure</b> (' + esc(c.pin_confidence) + ' confidence): ' + esc(c.pin_note) + ". " + ext(c.pin_url, "Source") + ". Please verify it before relying on this rank.</p>";
    if (c.pin_year < c.year) notes += '<p class="notice"><b>Older needs data.</b> The people-in-need figure is from ' + (c.pin_year | 0) + " but funding is from " + c.year + ", so dollars per person mixes two years. Treat this rank as indicative.</p>";
    h = '<div class="d-rank">Rank ' + c.rank + " of " + N + '</div><h3 class="nm2" id="dName">' + esc(c.location_name) + '</h3>' +
      '<div class="d-score"><b>' + c.neglect_score.toFixed(1) + '</b><span>neglect score<br>(100 = most neglected)</span></div>' + notes +
      '<div class="stats">' +
        '<div class="stat"><span>People in need</span><b>' + fmtPeople(c.people_in_need) + '</b><small>' + (c.pin_year | 0) + ' figure</small></div>' +
        '<div class="stat"><span>Appeal funded</span><b>' + c.funding_pct.toFixed(1) + '%</b><small>' + fmtUSD(c.funding_usd) + " of " + fmtUSD(c.requirements_usd) + '</small></div>' +
        '<div class="stat"><span>Per person, per year</span><b>$' + c.funding_per_person_usd.toFixed(2) + '</b><small>about ' + fmtPerDay(c.funding_per_person_usd) + ' a day</small></div>' +
        '<div class="stat"><span>Still unpaid</span><b>' + fmtUSD(c.unmet_usd) + '</b><small>of the appeal</small></div></div>' +
      '<h4>The people</h4><p class="small">Each dot is 100,000 people. Blue is the funded share, red is not.</p><canvas id="miniField"></canvas>' +
      '<h4>What drives the score</h4><p class="small">Points 0–100: higher means worse off than the other crises on that measure.</p>' +
      drv("Low share of appeal funded", c.coverage_pts, WEIGHTS.cov, "s1") + drv("Low dollars per person", c.per_person_pts, WEIGHTS.per, "s2") + drv("Large number of people", c.scale_pts, WEIGHTS.scl, "s3") +
      '<h4>How solid is this rank?</h4><p class="compare">' + robust + '</p><h4>In proportion</h4><p class="compare">' + compare + "</p>";
    $("mLeft").innerHTML = h; drawMini();
  }
  function drawMini() {
    var ent = byCode[mCode], cv = $("miniField"); if (!cv || !ent || ent.kind !== "ranked") return;
    var c = ent.c, w = cv.clientWidth || 280, st = 10, n = Math.max(1, Math.round(c.people_in_need / PER_DOT)), f = Math.round(n * Math.min(c.funding_pct, 100) / 100);
    var cols = Math.max(1, Math.floor(w / st)), rws = Math.ceil(n / cols), hh = rws * st + 4, r = dpr || 1;
    cv.width = w * r; cv.height = hh * r; cv.style.height = hh + "px";
    var g = cv.getContext("2d"); g.setTransform(r, 0, 0, r, 0, 0);
    for (var i = 0; i < n; i++) { g.fillStyle = i < f ? COL["--funded"] : COL["--unmet"]; g.beginPath(); g.arc((i % cols) * st + st / 2, Math.floor(i / cols) * st + st / 2 + 2, 3.3, 0, 6.2832); g.fill(); }
  }
  $("dClose").addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mCode) closeModal();
    if (e.key === "Tab" && mCode) {
      var f = modal.querySelectorAll("button, a[href], [tabindex='0']"); if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- start ---------- */
  readColors();
  buildDots(); buildMap(); paintMap(); buildRanking(); buildEqualizer(); buildDonors(); buildMedia(); buildUnranked(); buildMethod();
  sizeCanvas();
  dots.forEach(function (d, i) { var p = layouts.all.pos[i]; d.x = d.sx = d.tx = p.x; d.y = d.sy = d.ty = p.y; });
  updateCaption(); countUp(); observeReveals();
  bgBuild(); bgResize(); onScrollProgress();
  if (reduceMotion) bgDraw(); else requestAnimationFrame(bgLoop);
  var rzT;
  window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(function () { sizeCanvas(); retarget(false); bgResize(); if (mCode) drawMini(); }, 120); });
})();
