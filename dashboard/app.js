/* AidGap dashboard. Plain JavaScript, no libraries.
   Data comes from data.js (funding + need), map.js (country shapes), media.js (GDELT coverage). */
(function () {
  "use strict";
  var D = window.AIDGAP, MAP = window.AIDGAP_MAP;
  var MEDIA = window.AIDGAP_MEDIA || null;
  var MED = (MEDIA && MEDIA.byCode) || {};
  var HAS_MEDIA = Object.keys(MED).length > 0;
  var PER_DOT = 100000;
  var WEIGHTS = { cov: 40, per: 40, scl: 20 };               // fixed on purpose
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- helpers ---------- */
  function fmtPeople(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1e3) + "K"; }
  function fmtUSD(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(n >= 1e10 ? 0 : 2) + "B";
    if (n >= 1e6) return "$" + Math.round(n / 1e6) + "M";
    return "$" + Math.round(n / 1e3) + "K";
  }
  function fmtPerDay(usdYear) {
    var c = usdYear / 365 * 100;
    return c < 1 ? c.toFixed(2) + "¢" : c < 10 ? c.toFixed(1) + "¢" : "$" + (c / 100).toFixed(2);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function shortName(n) {
    return String(n).replace(" (Bolivarian Republic of)", "").replace("Democratic Republic of the Congo", "DR Congo").replace("Syrian Arab Republic", "Syria");
  }

  /* ---------- data ---------- */
  var crises = D.crises.slice().sort(function (a, b) { return a.rank - b.rank || b.people_in_need - a.people_in_need; });
  var N = crises.length;
  var pts = computeScores(crises, WEIGHTS);                   // points per measure, for the drawer
  var byCode = {};
  crises.forEach(function (c, i) { byCode[c.location_code] = { kind: "ranked", c: c, i: i }; });
  D.unranked.forEach(function (u) { if (u.location_code) byCode[u.location_code] = { kind: "unranked", u: u }; });
  var totals = crises.reduce(function (a, c) { a.pin += c.people_in_need; a.req += c.requirements_usd; a.fund += c.funding_usd; a.unmet += c.unmet_usd; return a; }, { pin: 0, req: 0, fund: 0, unmet: 0 });
  var fundedPct = totals.fund / totals.req * 100;
  var medianPer = (function () {
    var v = crises.map(function (c) { return c.funding_per_person_usd; }).sort(function (a, b) { return a - b; });
    return N % 2 ? v[(N - 1) / 2] : (v[N / 2 - 1] + v[N / 2]) / 2;
  })();

  /* ---------- theme ---------- */
  var COL = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["--funded", "--unmet", "--ink", "--ink2", "--raise"].forEach(function (k) { COL[k] = cs.getPropertyValue(k).trim(); });
    COL.fundedRGB = hexToRgb(COL["--funded"]); COL.unmetRGB = hexToRgb(COL["--unmet"]);
  }
  function hexToRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) { return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")"; }
  try { var saved = localStorage.getItem("aidgap-theme"); if (saved === "light") document.documentElement.setAttribute("data-theme", "light"); } catch (e) {}
  $("themeBtn").addEventListener("click", function () {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    if (light) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem("aidgap-theme", light ? "dark" : "light"); } catch (e) {}
    readColors(); tick(); if (drawerCode) drawMini();
  });

  /* ---------- hero ---------- */
  $("eyebrow").textContent = D.year + " humanitarian appeals: need vs. funding";
  $("heroNum").innerHTML = '<span class="mask in"><span><span id="heroVal">0.0</span><small>million people</small></span></span>';
  $("heroLead").innerHTML = "need humanitarian help across <b>" + N + " crises</b>. Their appeals are only <b>" + fundedPct.toFixed(0) +
    "% funded</b>, leaving <span class=\"unmet\">" + fmtUSD(totals.unmet) + "</span> unpaid.";
  $("foot").innerHTML = "AidGap · data refreshed " + esc(D.generated) + " · Sources: OCHA Financial Tracking Service, HDX HAPI" +
    (HAS_MEDIA ? ", GDELT" : "") + " · A portfolio project by Eli.";
  function countUp() {
    var t0 = performance.now(), DUR = reduceMotion ? 1 : 2200;
    (function f(t) { var p = clamp01((t - t0) / DUR); $("heroVal").textContent = (totals.pin / 1e6 * (1 - Math.pow(1 - p, 3))).toFixed(1); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  $("cue").addEventListener("click", function () { $("s-scale").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); });

  /* ---------- reveal on scroll + side rail ---------- */
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
    var firstScale = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { firstScale.disconnect(); startField(); }
    }, { threshold: 0.2 });
    slides.forEach(function (s) { railIO.observe(s); });
    firstScale.observe($("s-scale"));
  } else {
    setTimeout(function () { startField(); }, 0);
  }
  // Called AFTER the page is built, so rows created by JavaScript get revealed too.
  function observeReveals() {
    document.querySelectorAll(".rv, .mask, .bar-t").forEach(function (n) {
      if (n.classList.contains("in")) return;
      if (typeof revealIO !== "undefined" && revealIO) revealIO.observe(n); else n.classList.add("in");
    });
  }

  /* =====================================================================
     DOT FIELD
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
    layouts.all = { pos: allPos, h: allH };
    layouts.country = { pos: cPos, h: y + rowH + pad, rects: rects };
  }
  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth || 600;
    step = Math.max(7, Math.min(14, Math.floor(W / 82)));
    computeLayouts();
    var maxH = Math.max(layouts.all.h, layouts.country.h);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(maxH * dpr);
    canvas.style.width = W + "px"; canvas.style.height = maxH + "px";
    wrap.style.height = layouts[mode].h + "px";
    clusters = layouts.country.rects;
  }
  function retarget(animate) {
    var L = layouts[mode], now = performance.now(), n = dots.length, an = animate && !reduceMotion;
    dots.forEach(function (d, i) {
      var p = L.pos[i];
      d.sx = d.x; d.sy = d.y; d.tx = p.x; d.ty = p.y; d.t0 = now; d.dur = an ? 750 : 0;
      d.delay = an ? Math.min(380, (p.order / (mode === "all" ? n : N * 3)) * 380) : 0;
    });
    wrap.style.height = L.h + "px"; tick();
  }
  function setMode(m, animate) {
    mode = m;
    $("modeAll").setAttribute("aria-pressed", String(m === "all")); $("modeCountry").setAttribute("aria-pressed", String(m === "country"));
    labelFrom = labelAlpha; labelT0 = performance.now(); hover = -1; hideTip(); canvas.classList.remove("pointer");
    retarget(animate); updateCaption();
  }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!started) return false;
    var busy = false, R = Math.max(2.2, step * 0.33);
    var lp = reduceMotion ? 1 : clamp01((now - labelT0) / 500), target = mode === "country" ? 1 : 0;
    labelAlpha = labelFrom + (target - labelFrom) * lp; if (lp < 1) busy = true;
    if (mode === "country" && hover >= 0) {
      var hr = clusters.filter(function (r) { return r.ci === hover; })[0];
      if (hr) { ctx.fillStyle = COL["--raise"]; roundRect(hr.x, hr.y, hr.w, hr.h, 10); ctx.fill(); }
    }
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
    if (labelAlpha > 0.01) {
      ctx.font = "600 12px system-ui, sans-serif";
      clusters.forEach(function (r) { ctx.globalAlpha = labelAlpha * (hover >= 0 && r.ci !== hover ? 0.4 : 1); ctx.fillStyle = COL["--ink"]; ctx.fillText(r.label, r.lx, r.ly); });
      ctx.globalAlpha = 1;
    }
    return busy;
  }
  function tick() {
    if (rafOn) return; rafOn = true;
    (function loop(now) { var busy = draw(now || performance.now()); if (busy) requestAnimationFrame(loop); else rafOn = false; })(performance.now());
  }
  function startField() {          // runs once, when the slide first scrolls into view
    if (started) return; started = true;
    var now = performance.now(), n = dots.length, L = layouts.all;
    dots.forEach(function (d, i) {
      var o = L.pos[i].order;
      d.appear = reduceMotion ? -1e9 : now + (o / n) * 900;
      d.lightAt = reduceMotion ? -1e9 : now + 1500 + (o / n) * 1200;
    });
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
    var b = canvas.getBoundingClientRect(), tx = ev.clientX - b.left + 14, ty = ev.clientY - b.top + 14;
    if (tx + 200 > W) tx = ev.clientX - b.left - 210;
    tip.style.left = tx + "px"; tip.style.top = ty + "px"; tip.classList.add("on");
  });
  canvas.addEventListener("mouseleave", function () { hover = -1; hideTip(); tick(); });
  canvas.addEventListener("click", function (ev) { if (mode !== "country") return; var r = hitCluster(ev); if (r) openCountry(crises[r.ci].location_code); });
  function updateCaption() {
    var fd = dots.filter(function (d) { return d.funded; }).length;
    $("caption").innerHTML = mode === "all"
      ? "<b>" + Math.round(fd / dots.length * 100) + "% of the dots</b> sit inside funded appeals. The orange mass is need nobody has paid for. <b>Switch to “By country”</b> to see where."
      : "Crises run from most to least neglected. <b>Hover</b> for the numbers, <b>click</b> a cluster for the full story. Compare Sudan's field with Honduras': size and neglect are different things.";
  }
  $("modeAll").addEventListener("click", function () { if (mode !== "all") setMode("all", true); });
  $("modeCountry").addEventListener("click", function () { if (mode !== "country") setMode("country", true); });

  /* =====================================================================
     MAP
     ===================================================================== */
  var svg = $("map"), SVGNS = "http://www.w3.org/2000/svg", MW = MAP.width, MH = MAP.height;
  var vb = { x: 0, y: 0, w: MW, h: MH }, vbAnim = 0, selectedPath = null, dragged = false;
  function sv(tag, attrs) { var n = document.createElementNS(SVGNS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function setVB(v) {
    v.w = clamp(v.w, MW / 14, MW); v.h = v.w * MH / MW; v.x = clamp(v.x, 0, MW - v.w); v.y = clamp(v.y, 0, MH - v.h);
    vb = v; svg.setAttribute("viewBox", v.x.toFixed(2) + " " + v.y.toFixed(2) + " " + v.w.toFixed(2) + " " + v.h.toFixed(2));
  }
  function animateVB(t, ms) {
    cancelAnimationFrame(vbAnim);
    t.w = clamp(t.w, MW / 14, MW); t.h = t.w * MH / MW; t.x = clamp(t.x, 0, MW - t.w); t.y = clamp(t.y, 0, MH - t.h);
    if (reduceMotion) { setVB({ x: t.x, y: t.y, w: t.w, h: t.h }); return; }
    var from = { x: vb.x, y: vb.y, w: vb.w }, t0 = performance.now();
    (function f(now) {
      var p = ease(clamp01((now - t0) / ms));
      setVB({ x: from.x + (t.x - from.x) * p, y: from.y + (t.y - from.y) * p, w: from.w + (t.w - from.w) * p });
      if (p < 1) vbAnim = requestAnimationFrame(f);
    })(t0);
  }
  function zoomBy(f) { var cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2, w = vb.w * f; animateVB({ x: cx - w / 2, y: cy - w * MH / MW / 2, w: w }, 350); }
  function focusCountry(code) {
    var m = MAP.marks[code]; if (!m) return;
    var w = clamp(Math.sqrt(m[2]) * 5, 150, 640), pxW = svg.getBoundingClientRect().width || MW;
    var shift = window.innerWidth > 900 ? (Math.min(500, window.innerWidth) / 2) / pxW * w : 0;   // keep the country clear of the open panel
    animateVB({ x: m[0] + shift - w / 2, y: m[1] - w * MH / MW / 2, w: w }, 800);
  }
  function resetMap() { animateVB({ x: 0, y: 0, w: MW }, 700); if (selectedPath) { selectedPath.classList.remove("sel"); selectedPath = null; } }

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
        if (ent.kind === "ranked") {
          p.setAttribute("class", "c ranked"); p.style.setProperty("--t", (0.22 + 0.78 * ent.c.neglect_score / 100).toFixed(3));
          label = ent.c.location_name + ", rank " + ent.c.rank + ", neglect score " + ent.c.neglect_score.toFixed(1);
        } else { p.setAttribute("class", "c unr"); label = ent.u.location_name + ", appeal without needs data, not scored"; }
        p.setAttribute("data-code", iso); p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); p.setAttribute("aria-label", label);
        later.push(p);
        if (area < 170) rings.appendChild(sv("circle", { cx: MAP.marks[iso][0], cy: MAP.marks[iso][1], r: 6 }));
      } else g.appendChild(p);
    });
    later.sort(function (a, b) { return a.getAttribute("class").length - b.getAttribute("class").length; }).forEach(function (p) { g.appendChild(p); });
    Array.prototype.forEach.call(rings.children, function (c) { c.setAttribute("class", "ring"); });
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
      var dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (!down.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!down.moved) { down.moved = true; svg.classList.add("dragging"); try { svg.setPointerCapture(ev.pointerId); } catch (e) {} cancelAnimationFrame(vbAnim); }
      var k = vb.w / (svg.getBoundingClientRect().width || MW);
      setVB({ x: down.vx - dx * k, y: down.vy - dy * k, w: vb.w });
    });
    function end() { if (down && down.moved) { dragged = true; setTimeout(function () { dragged = false; }, 0); } down = null; svg.classList.remove("dragging"); }
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  })();
  $("zIn").addEventListener("click", function () { zoomBy(0.6); });
  $("zOut").addEventListener("click", function () { zoomBy(1 / 0.6); });
  $("zReset").addEventListener("click", resetMap);

  var chips = $("chips"); chips.appendChild(el("span", "h", "Start with:"));
  crises.slice(0, 5).forEach(function (c) {
    var b = el("button", "chip", esc(shortName(c.location_name)) + "<b>" + c.neglect_score.toFixed(0) + "</b>"); b.type = "button";
    b.addEventListener("click", function () { openCountry(c.location_code); }); chips.appendChild(b);
  });

  /* =====================================================================
     RANKING
     ===================================================================== */
  function buildRanking() {
    var list = $("rankList");
    crises.forEach(function (c, i) {
      var li = el("li", "rv"); li.style.setProperty("--i", Math.min(i, 8)); li.style.setProperty("--w", c.neglect_score + "%");
      var b = el("button");
      b.type = "button"; b.setAttribute("aria-label", "Rank " + c.rank + ", " + c.location_name + ", neglect score " + c.neglect_score.toFixed(1));
      b.innerHTML = '<span class="rk' + (c.rank <= 3 ? " top3" : "") + '">' + c.rank + '</span>' +
        '<span class="who"><span class="nm">' + esc(c.location_name) + (c.low_confidence ? '<span class="lowc" title="Needs figure from ' + (c.pin_year | 0) + ", funding from " + c.year + '">older needs data</span>' : "") + '</span>' +
        '<span class="meta">' + c.funding_pct.toFixed(0) + '% funded · $' + c.funding_per_person_usd.toFixed(c.funding_per_person_usd < 10 ? 2 : 0) + '/person<span class="hide-s"> · ' + fmtPeople(c.people_in_need) + ' in need</span></span></span>' +
        '<span class="sc"><b>' + c.neglect_score.toFixed(1) + '</b><span class="bar-t"><i></i></span></span>';
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
  }

  /* =====================================================================
     UNRANKED
     ===================================================================== */
  function buildUnranked() {
    var maxRanked = Math.max.apply(null, crises.map(function (c) { return c.requirements_usd; }));
    var sorted = D.unranked.slice().sort(function (a, b) { return b.requirements_usd - a.requirements_usd; });
    var biggest = sorted[0], box = $("cards");
    $("exclNote").innerHTML = D.unranked.length + " other appeals" + (biggest && biggest.requirements_usd > maxRanked ? ", including the largest (" + esc(biggest.location_name) + "),": "") + " have no needs data and are listed <a href=\"#s-gaps\">separately</a>.";
    sorted.forEach(function (u) {
      var big = u.requirements_usd > maxRanked, c = el("button", "gcard" + (big ? " largest" : ""));
      c.type = "button";
      c.innerHTML = (big ? '<div class="flag">Largest appeal in the data</div>' : "") + "<b>" + esc(u.location_name) + '</b><div class="t">' + esc(u.appeal_types) + '</div>' +
        '<div class="big">' + fmtUSD(u.requirements_usd) + ' <small>requested</small></div>' +
        '<div class="t" style="margin:4px 0 0">' + u.funding_pct.toFixed(0) + '% funded · no people-in-need figure</div>';
      if (u.location_code) c.addEventListener("click", function () { openCountry(u.location_code); });
      box.appendChild(c);
    });
  }

  /* =====================================================================
     MEDIA SLIDE
     ===================================================================== */
  function pctTxt(x) { return Math.round(x * 100) + "%"; }
  function srcText(a) { return a.sources.slice(0, 3).map(function (s, i) { return (i === 0 ? "<b>" + esc(s.country) + "</b> " : esc(s.country) + " ") + pctTxt(s.share); }).join(" · "); }
  function spearman(xs, ys) {
    function ranks(v) { var o = v.map(function (_, i) { return i; }).sort(function (a, b) { return v[a] - v[b]; }), r = [], i = 0; while (i < o.length) { var j = i; while (j + 1 < o.length && v[o[j + 1]] === v[o[i]]) j++; for (var k = i; k <= j; k++) r[o[k]] = (i + j) / 2 + 1; i = j + 1; } return r; }
    var a = ranks(xs), b = ranks(ys), n = a.length, ma = a.reduce(function (s, v) { return s + v; }, 0) / n, mb = b.reduce(function (s, v) { return s + v; }, 0) / n, num = 0, da = 0, db = 0;
    for (var i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += Math.pow(a[i] - ma, 2); db += Math.pow(b[i] - mb, 2); }
    return num / Math.sqrt(da * db);
  }
  function buildMedia() {
    var body = $("mediaBody");
    var rows = [];
    crises.forEach(function (c) { var m = MED[c.location_code]; if (m && m.articles) rows.push({ code: c.location_code, name: c.location_name, rank: c.rank, a: m.articles }); });
    D.unranked.forEach(function (u) { var m = u.location_code && MED[u.location_code]; if (m && m.articles) rows.push({ code: u.location_code, name: u.location_name, rank: null, a: m.articles }); });
    if (!rows.length) {
      body.innerHTML = '<div class="card empty rv" style="margin-top:30px">Media coverage data has not been loaded yet. Run <b>src/fetch_media.py</b> then <b>src/build_media_summary.py</b>, and refresh this page.</div>' + mediaInfo();
      return;
    }
    var big = rows.filter(function (r) { return r.a.n >= 20; });
    var topState = big.slice().sort(function (a, b) { return b.a.state_share - a.a.state_share; })[0];
    var tot = 0, byC = {}; rows.forEach(function (r) { tot += r.a.n; r.a.sources.forEach(function (s) { byC[s.country] = (byC[s.country] || 0) + s.share * r.a.n; }); });
    var topCountry = Object.keys(byC).sort(function (a, b) { return byC[b] - byC[a]; })[0];
    var html = '<div class="media-top">' +
      (topState ? '<div class="card tile rv"><div class="big-n">' + pctTxt(topState.a.state_share) + '</div><p><b>of sampled coverage of ' + esc(shortName(topState.name)) + '</b> comes from state-linked outlets' +
        (topState.a.state_by_gov.length ? " (" + topState.a.state_by_gov.map(function (g) { return esc(g.gov); }).join(", ") + ")" : "") + ", the highest of any crisis.</p></div>" : "") +
      '<div class="card tile rv" style="--i:1"><div class="big-n">' + Math.round(byC[topCountry] / tot * 100) + '%</div><p>of all sampled articles were published by outlets based in <b>' + esc(topCountry) + '</b>. Where a story is told from shapes how it is told.</p></div>' +
      '<div class="card tile rv" style="--i:2"><div class="big-n">' + tot.toLocaleString() + '</div><p>articles sampled across <b>' + rows.length + ' crises</b> (' + esc(MEDIA.window) + '). A sample, not a total.</p></div></div>';
    html += '<div class="mrows"><div class="mhead"><span>#</span><span>Crisis</span><span>Where the coverage comes from</span><span style="text-align:right">State-linked outlets</span></div>';
    rows.forEach(function (r, i) {
      html += '<button class="mrow rv" type="button" data-code="' + esc(r.code) + '" style="--i:' + Math.min(i, 6) + '"><span class="rn">' + (r.rank || "–") + '</span><span class="nm">' + esc(shortName(r.name)) + '</span>' +
        '<span class="src">' + srcText(r.a) + '</span><span class="stbar"><span class="bar-t" style="--w:' + Math.round(r.a.state_share * 100) + '%"><i></i></span><b>' + pctTxt(r.a.state_share) + '</b></span></button>';
    });
    html += "</div>" + scatterHTML() + mediaInfo();
    body.innerHTML = html;
    Array.prototype.forEach.call(body.querySelectorAll(".mrow"), function (b) { b.addEventListener("click", function () { openCountry(b.dataset.code); }); });
    Array.prototype.forEach.call(body.querySelectorAll("#scatter circle"), function (c) { c.addEventListener("click", function () { openCountry(c.getAttribute("data-code")); }); });
  }
  function scatterHTML() {      // only when GDELT's volume numbers are available
    var pts2 = crises.filter(function (c) { var m = MED[c.location_code]; return m && m.volume && m.volume.share_pct > 0; });
    if (pts2.length < 8) return "";
    var xs = pts2.map(function (c) { return Math.log10(MED[c.location_code].volume.share_pct); }), ys = pts2.map(function (c) { return Math.log10(c.funding_per_person_usd); });
    var rho = spearman(xs, ys), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var Wd = 720, Hd = 340, L = 56, R = 16, T = 12, B = 44;
    function px(v) { return L + (v - x0) / (x1 - x0 || 1) * (Wd - L - R); } function py(v) { return Hd - B - (v - y0) / (y1 - y0 || 1) * (Hd - T - B); }
    var s = '<svg id="scatter" viewBox="0 0 ' + Wd + " " + Hd + '" role="img" aria-label="Scatter plot of media coverage against dollars per person">' +
      '<line class="gl" x1="' + L + '" y1="' + (Hd - B) + '" x2="' + (Wd - R) + '" y2="' + (Hd - B) + '"/><line class="gl" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (Hd - B) + '"/>' +
      '<text x="' + (Wd / 2) + '" y="' + (Hd - 8) + '" text-anchor="middle">Share of all monitored news coverage (log scale) →  more attention</text>' +
      '<text transform="rotate(-90)" x="' + (-(Hd - B + T) / 2) + '" y="14" text-anchor="middle">$ funding per person in need (log) →</text>';
    pts2.forEach(function (c, i) {
      s += '<circle data-code="' + esc(c.location_code) + '" cx="' + px(xs[i]).toFixed(1) + '" cy="' + py(ys[i]).toFixed(1) + '" r="' + clamp(Math.sqrt(c.people_in_need / 1e6) * 2.4 + 4, 5, 15).toFixed(1) + '"><title>' + esc(c.location_name) + "</title></circle>";
      if (c.rank <= 6) s += '<text x="' + (px(xs[i]) + 10).toFixed(1) + '" y="' + (py(ys[i]) + 4).toFixed(1) + '">' + esc(shortName(c.location_name)) + "</text>";
    });
    return '<div class="card" id="scatterBox"><h3 class="rv">Does more attention mean more money?</h3><p class="note rv" style="margin:0">Each dot is a crisis; bigger dots have more people in need. Rank correlation across ' + pts2.length + ' crises: <b>ρ = ' + rho.toFixed(2) + '</b>. ' +
      'This is a pattern, not proof that coverage causes funding.</p>' + s + "</svg></div>";
  }
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
     DRAWER
     ===================================================================== */
  var drawer = $("drawer"), backdrop = $("backdrop"), drawerCode = null, lastFocus = null;
  function openCountry(code) {
    var ent = byCode[code]; if (!ent) return;
    lastFocus = document.activeElement; drawerCode = code; renderDrawer(); focusCountry(code);
    if (selectedPath) selectedPath.classList.remove("sel");
    selectedPath = svg.querySelector('path[data-code="' + code + '"]'); if (selectedPath) selectedPath.classList.add("sel");
    drawer.classList.add("on"); backdrop.classList.add("on"); drawer.setAttribute("aria-hidden", "false"); drawer.scrollTop = 0;
    $("dClose").focus();
  }
  function closeDrawer() {
    drawer.classList.remove("on"); backdrop.classList.remove("on"); drawer.setAttribute("aria-hidden", "true"); drawerCode = null;
    resetMap(); if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : "#"; }
  function mediaBlock(code) {
    var m = MED[code], a = m && m.articles;
    if (!a) return '<h4>In the news</h4><p class="small">No media coverage loaded for this country yet.</p>';
    var f = "<p class=\"mfacts\">Sample of <b>" + a.n + "</b> English-language articles (" + esc(MEDIA.window) + "). Most come from: " + srcText(a) + ".</p>";
    f += a.state_share > 0
      ? '<p class="mfacts"><span class="st">' + pctTxt(a.state_share) + "</span> come from state-linked outlets" + (a.state_by_gov.length ? " (" + a.state_by_gov.map(function (g) { return esc(g.gov); }).join(", ") + ")" : "") + ". That describes ownership, not accuracy.</p>"
      : '<p class="mfacts">No state-linked outlets in this sample (our list covers ' + MEDIA.state_list_size + " outlets).</p>";
    if (m.volume) f += '<p class="mfacts">Coverage: <b>' + m.volume.total.toLocaleString() + "</b> articles in 3 months" + (m.volume.trend_pct != null ? ", " + (m.volume.trend_pct >= 0 ? "up " : "down ") + Math.abs(m.volume.trend_pct) + "% in the last month vs. before" : "") + ".</p>";
    if (m.tone) f += '<p class="mfacts">Average tone: <b>' + m.tone.avg + "</b> (more negative = bleaker wording).</p>";
    var items = a.articles.slice(0, 12).map(function (x) {
      return '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title || x.url) + '</a><div class="am">' + esc(x.domain) + (x.country ? " · " + esc(x.country) : "") + (x.date ? " · " + esc(x.date) : "") +
        (x.state ? '<span class="tagst" title="Owned, funded or controlled by a government">state-linked · ' + esc(x.state) + "</span>" : "") + "</div></li>";
    }).join("");
    return "<h4>In the news</h4>" + f + '<ul class="arts">' + items + '</ul><p class="fine">Headlines come from GDELT and link to the publishers. Listing an article is not an endorsement.</p>';
  }
  function renderDrawer() {
    var ent = byCode[drawerCode], h;
    if (ent.kind === "unranked") {
      var u = ent.u;
      h = '<div class="d-rank">Not ranked</div><h3 id="dName">' + esc(u.location_name) + '</h3>' +
        '<p class="notice plain">This country has its own appeal, but there is no people-in-need figure for it in the data source, so it cannot be scored fairly.</p>' +
        '<div class="stats"><div class="stat"><span>Appeal</span><b>' + fmtUSD(u.requirements_usd) + '</b><small>' + esc(u.appeal_types) + '</small></div>' +
        '<div class="stat"><span>Funded</span><b>' + u.funding_pct.toFixed(1) + '%</b><small>' + fmtUSD(u.funding_usd) + ' received</small></div></div>' +
        (drawerCode === "PSE" ? '<p class="small">The map outline for this appeal shows the West Bank only.</p>' : "") + mediaBlock(drawerCode);
      $("dBody").innerHTML = h; return;
    }
    var c = ent.c, p = pts[ent.i], swing = c.worst_rank - c.best_rank;
    var robust = swing <= 2 ? "Rank <b>#" + c.best_rank + (swing ? "–#" + c.worst_rank : "") + "</b> across all " + D.scenarios.length + " weightings: <b>a robust result</b>."
      : "Rank swings from <b>#" + c.best_rank + " to #" + c.worst_rank + "</b> depending on the weights: <b>treat the exact position with care</b>.";
    var ratio = c.funding_per_person_usd / medianPer;
    var compare = ratio < 1 ? "Receives <b>" + (1 / ratio).toFixed(1) + "× less</b> per person than the median of these " + N + " crises ($" + medianPer.toFixed(0) + ")."
      : "Receives <b>" + ratio.toFixed(1) + "× more</b> per person than the median of these " + N + " crises ($" + medianPer.toFixed(0) + ").";
    function drv(label, v, w) { return '<div class="driver" style="--w:' + v.toFixed(0) + '%"><div class="lbl"><span>' + label + '</span><span>weight ' + w + '%</span></div><div class="bar-t"><i></i></div><div class="pts">' + Math.round(v) + '</div></div>'; }
    h = '<div class="d-rank">Rank ' + c.rank + " of " + N + '</div><h3 id="dName">' + esc(c.location_name) + '</h3>' +
      '<div class="d-score"><b>' + c.neglect_score.toFixed(1) + '</b><span>neglect score (100 = most neglected)</span></div>' +
      (c.low_confidence ? '<p class="notice"><b>Older needs data.</b> The people-in-need figure is from ' + (c.pin_year | 0) + " but funding is from " + c.year + ", so dollars per person mixes two years. Treat this rank as indicative.</p>" : "") +
      '<div class="stats">' +
        '<div class="stat"><span>People in need</span><b>' + fmtPeople(c.people_in_need) + '</b><small>' + (c.pin_year | 0) + ' figure</small></div>' +
        '<div class="stat"><span>Appeal funded</span><b>' + c.funding_pct.toFixed(1) + '%</b><small>' + fmtUSD(c.funding_usd) + " of " + fmtUSD(c.requirements_usd) + '</small></div>' +
        '<div class="stat"><span>Per person, per year</span><b>$' + c.funding_per_person_usd.toFixed(2) + '</b><small>about ' + fmtPerDay(c.funding_per_person_usd) + ' a day</small></div>' +
        '<div class="stat"><span>Still unpaid</span><b>' + fmtUSD(c.unmet_usd) + '</b><small>of the appeal</small></div></div>' +
      '<h4>The people</h4><p class="small">Each dot is 100,000 people. Blue is the funded share, orange is not.</p><canvas id="miniField"></canvas>' +
      '<h4>What drives the score</h4><p class="small">Points 0–100: higher means worse off than the other crises on that measure.</p>' +
      drv("Low share of appeal funded", p.cov, WEIGHTS.cov) + drv("Low dollars per person", p.per, WEIGHTS.per) + drv("Large number of people", p.scl, WEIGHTS.scl) +
      '<h4>How solid is this rank?</h4><p class="compare">' + robust + '</p><h4>In proportion</h4><p class="compare">' + compare + "</p>" + mediaBlock(drawerCode);
    $("dBody").innerHTML = h; drawMini();
  }
  function drawMini() {
    var ent = byCode[drawerCode], cv = $("miniField"); if (!cv || !ent || ent.kind !== "ranked") return;
    var c = ent.c, w = cv.clientWidth || 400, st = 11, n = Math.max(1, Math.round(c.people_in_need / PER_DOT)), f = Math.round(n * Math.min(c.funding_pct, 100) / 100);
    var cols = Math.max(1, Math.floor(w / st)), rws = Math.ceil(n / cols), hh = rws * st + 4, r = dpr || 1;
    cv.width = w * r; cv.height = hh * r; cv.style.height = hh + "px";
    var g = cv.getContext("2d"); g.setTransform(r, 0, 0, r, 0, 0);
    for (var i = 0; i < n; i++) { g.fillStyle = i < f ? COL["--funded"] : COL["--unmet"]; g.beginPath(); g.arc((i % cols) * st + st / 2, Math.floor(i / cols) * st + st / 2 + 2, 3.6, 0, 6.2832); g.fill(); }
  }
  $("dClose").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawerCode) closeDrawer();
    if (e.key === "Tab" && drawerCode) {
      var f = drawer.querySelectorAll("button, a[href]"); if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- start ---------- */
  readColors();
  buildDots(); buildMap(); buildRanking(); buildUnranked(); buildMedia();
  sizeCanvas();
  dots.forEach(function (d, i) { var p = layouts.all.pos[i]; d.x = d.sx = d.tx = p.x; d.y = d.sy = d.ty = p.y; });
  updateCaption(); countUp(); observeReveals();
  var rzT;
  window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(function () { sizeCanvas(); retarget(false); if (drawerCode) drawMini(); }, 120); });
})();
