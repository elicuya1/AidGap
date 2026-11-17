/* AidGap background, two layers.
   1) PHOTO (left): a black-and-white public-domain photograph that changes with the section you are in. The new picture wipes in
      from the left while it settles from a slight zoom. Pictures are illustrations of the TOPIC, not of the specific country in view.
   2) DOTS: concentric rings on the first screen, which reform into the word GAP (blue = funded share) on the second, then fly into the real dot field on the third.
   Cheap by design: one small canvas, a handful of images, nothing runs once the rings have faded. */
(function () {
  "use strict";
  var IMG = {"s-scale": ["Food distribution at a refugee settlement, Uganda", "USAID", "https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(39910884580).jpg"], "s-map": ["Za'atri refugee camp, Jordan, from the air", "US Dept of State", "https://commons.wikimedia.org/wiki/File:Aerial_View_of_the_Za%27atri_Refugee_Camp.jpg"], "s-rank": ["Health screening at a UNHCR site", "USAID", "https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(40818914905).jpg"], "s-donors": ["A US Air Force C-130 being loaded with cargo", "US Air Force", "https://commons.wikimedia.org/wiki/File:C130-loading.jpg"], "s-media": ["A journalist with camera and radio phone", "Donn Dughi", "https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg"], "s-gaps": ["Mothers waiting at a child clinic, Lagos, Nigeria (historic photo)", "Vernon McKay", "https://commons.wikimedia.org/wiki/File:Mothers_wait_in_line_at_Child_Clinic_Centre_in_Lagos,_Nigeria.png"], "s-news": ["A journalist with camera and radio phone", "Donn Dughi", "https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg"]};
  var photo = document.getElementById("photo"), credit = document.getElementById("photoCredit");
  var layers = {}, cur = "", ids = ["s-what", "s-intro", "s-scale", "s-map", "s-rank", "s-donors", "s-media", "s-news", "s-gaps", "s-method"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function layerFor(file) {
    if (layers[file]) return layers[file];
    var d = document.createElement("div"); d.className = "ph"; d.style.backgroundImage = 'url("img/' + file + '.jpg?v=14")';
    photo.appendChild(d); layers[file] = d; return d;
  }
  var prevEl = null, prevT = 0;
  function show(id) {
    if (id === cur) return; cur = id; photo.setAttribute("data-sec", id);
    var info = IMG[id], next = info ? layerFor(id === "s-news" ? "s-media" : id) : null;
    if (info) credit.innerHTML = "Photo: " + esc(info[0]) + " (" + esc(info[1]) + "). Public domain, via <a href=\"" + esc(info[2]) + "\" target=\"_blank\" rel=\"noopener\">Wikimedia Commons</a>.";
    else credit.innerHTML = "";
    var on = photo.querySelector(".ph.on");
    if (on === next) return;
    if (prevEl && prevEl !== on) prevEl.classList.remove("prev");
    if (on) { on.classList.remove("on"); on.classList.add("prev"); prevEl = on; clearTimeout(prevT); prevT = setTimeout(function () { if (prevEl) prevEl.classList.remove("prev"); }, 1400); }
    if (next) { next.classList.remove("prev"); void next.offsetWidth; next.classList.add("on"); }
  }
  function which() {
    var best = ids[0], mid = window.innerHeight * 0.45;
    ids.forEach(function (id) { var e = document.getElementById(id); if (e && e.getBoundingClientRect().top <= mid) best = id; });
    show(best);
  }
  var pend = false;
  window.addEventListener("scroll", function () { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; which(); }); }, { passive: true });
  window.addEventListener("load", which); which();
  window.__photoSec = show;   // testing: __photoSec("s-map")

  /* ---------- the dots: rings (first screen) -> the word GAP (second) -> the real dot field (third) ----------
     One set of ~500 dots changes shape as you move down. In the word GAP, the part filled blue is the funded share. Each change is a timed
     animation (about 1.2 s) that starts when the next screen has slid up, so it does not depend on scroll speed. */
  var cv = document.getElementById("spiral");
  if (!cv) return;
  window.__aidgapMerge = true;
  var ctx = cv.getContext("2d"), W = 0, H = 0, forceQ = null, raf = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RINGS = 9, TAU = Math.PI * 2, t0 = performance.now(), cols = null, ring = null, mapped = null, wordPts = null;
  var E1 = 0, E2 = 0, landedAt = 0, lastT = performance.now(), gone = false, FLY = 1.2, DISSOLVE = 0.8, WORD = "GAP";
  var FONT = "'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif";
  function readColours() {
    var s = getComputedStyle(document.documentElement);
    cols = { red: s.getPropertyValue("--unmet").trim() || "#a3202a", blue: s.getPropertyValue("--funded").trim() || "#4a86b8", theme: document.documentElement.getAttribute("data-theme") };
  }
  function funded() { return typeof window.__aidgapFundedShare === "number" ? window.__aidgapFundedShare : 0.43; }
  function buildRing() {
    var f0 = funded(); ring = [];
    for (var k = 0; k < RINGS; k++) {
      var f = (k + 1) / RINGS, n = Math.round(18 + 70 * f);
      for (var j = 0; j < n; j++) ring.push({ k: k, f: f, n: n, j: j, blue: j / n < f0 });
    }
    mapped = null; wordPts = null;
  }
  // The word GAP, drawn as dots in the free space at the bottom right of the second screen. The lowest part (the funded share) is blue.
  function buildWord() {
    var bw = Math.min(W * 0.4, 560), bh = Math.min(H * 0.34, 300), bx = W * 0.95 - bw, by = H * 0.97 - bh;
    var oc = document.createElement("canvas"); oc.width = Math.round(bw); oc.height = Math.round(bh);
    var o = oc.getContext("2d"), fs = bh;
    o.font = "900 " + fs + "px " + FONT;
    var tw = o.measureText(WORD).width; fs = fs * Math.min(1, bw / tw) * 0.98;
    o.font = "900 " + fs + "px " + FONT;
    o.textBaseline = "middle"; o.textAlign = "center"; o.fillStyle = "#000"; o.fillText(WORD, bw / 2, bh / 2 + fs * 0.04);
    var data = o.getImageData(0, 0, oc.width, oc.height).data, pts = [], step = 14;
    for (; step >= 3; step -= 0.5) {
      pts = [];
      for (var y = step / 2; y < oc.height; y += step) for (var x = step / 2; x < oc.width; x += step) if (data[((y | 0) * oc.width + (x | 0)) * 4 + 3] > 128) pts.push({ x: bx + x, y: by + y });
      if (pts.length >= ring.length) break;
    }
    var out = [], stride = pts.length / ring.length;
    for (var i = 0; i < ring.length; i++) out.push(pts[Math.min(pts.length - 1, Math.floor(i * stride))]);
    // lowest points = the funded share = blue; pair blue ring dots with blue points and red with red
    var order = out.map(function (p, i) { return i; }).sort(function (a, b) { return out[b].y - out[a].y || out[a].x - out[b].x; });
    var nb = ring.filter(function (d) { return d.blue; }).length;
    var blueP = order.slice(0, nb).sort(function (a, b) { return out[a].x - out[b].x; }), redP = order.slice(nb).sort(function (a, b) { return out[a].x - out[b].x; });
    var bi = 0, ri = 0; wordPts = new Array(ring.length);
    ring.forEach(function (d, i) { wordPts[i] = out[d.blue ? blueP[bi++] : redP[ri++]]; });
    wordPts.rad = Math.max(1.6, Math.min(3.2, step * 0.3));
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); wordPts = null; draw();
  }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function topOf(id) { var e = document.getElementById(id); return e ? e.getBoundingClientRect().top : 1e9; }
  function approach(E, g, dt) { return reduce ? g : E + (g > E ? 1 : -1) * Math.min(Math.abs(g - E), dt / FLY); }
  function draw() {
    var now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    ctx.clearRect(0, 0, W, H);
    var F = window.__aidgapField, fieldOK = !!(F && F.ready()), alpha = 1;
    if (!ring) buildRing();
    if (!wordPts) buildWord();
    if (forceQ != null) { E1 = Math.min(1, forceQ); E2 = Math.max(0, Math.min(1, forceQ - 1)); }
    else {
      var gw = topOf("s-intro") < H * 0.7 ? 1 : 0, gg = (fieldOK && E1 >= 0.6 && topOf("s-scale") < H * 0.7) ? 1 : 0;
      E1 = approach(E1, gw, dt); E2 = approach(E2, gg, dt);
      if (E2 >= 1) { if (!landedAt) landedAt = now; alpha = 1 - Math.min(1, (now - landedAt) / (DISSOLVE * 1000)); } else landedAt = 0;
    }
    cv.classList.toggle("front", (E1 > 0.02 && E1 < 0.98) || E2 > 0.02);
    if (alpha <= 0.01) { running = false; gone = true; return; }
    gone = false;
    if (!cols || cols.theme !== document.documentElement.getAttribute("data-theme")) readColours();
    if (E2 >= 0.85 && fieldOK && !draw.started) { draw.started = true; F.start(); }
    var t = reduce ? 0 : (now - t0) / 1000, e1 = ease(E1), e2 = ease(E2);
    var cx = W * 0.91, cy = H * 0.52, R = Math.min(W * 0.475, H * 0.46);
    var lists = fieldOK ? F.lists() : null, tr = fieldOK ? F.radius() : 2.4;
    if (fieldOK && !mapped) {
      var nb = ring.filter(function (d) { return d.blue; }).length, nr = ring.length - nb, ib = 0, ir = 0;
      mapped = ring.map(function (d) { return d.blue ? lists.blue[Math.floor(ib++ * lists.blue.length / Math.max(1, nb))] : lists.red[Math.floor(ir++ * lists.red.length / Math.max(1, nr))]; });
    }
    ctx.globalAlpha = Math.min(1, alpha * 0.85);
    for (var i = 0; i < ring.length; i++) {
      var d = ring[i], r = R * d.f, dir = d.k % 2 ? -1 : 1;
      var ang = dir * (t * (0.28 - 0.18 * d.f)) + d.k * 0.7 + (d.j / d.n) * TAU;
      var x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang), rad = 1.2 + 1.3 * d.f;
      if (e1 > 0) { var wp = wordPts[i]; x += (wp.x - x) * e1; y += (wp.y - y) * e1; rad += (wordPts.rad - rad) * e1; }
      if (e2 > 0 && mapped && mapped[i] != null) { var p = F.at(mapped[i]); x += (p.x - x) * e2; y += (p.y - y) * e2; rad += (tr - rad) * e2; }
      ctx.fillStyle = d.blue ? cols.blue : cols.red;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the word is formed and we are still on it: nothing moves, so stop redrawing until you scroll
    if (!reduce && forceQ == null && E1 >= 1 && E2 <= 0) running = false;
  }
  function loop() { draw(); raf = (running && !reduce) ? requestAnimationFrame(loop) : 0; }
  function start() { if (!running) { running = true; if (!raf) loop(); } }
  function onScroll() { gone = false; if (E2 < 1) landedAt = 0; if (reduce) draw(); else start(); }
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.__vortexSetP = function (q) { forceQ = q; draw(); };   // testing: 0 = rings, 1 = the word GAP, 2 = landed on the dot field
  window.addEventListener("load", function () { buildRing(); onScroll(); });
  resize(); onScroll(); if (!reduce) start();
})();
