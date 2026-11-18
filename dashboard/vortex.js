/* AidGap background, two layers.
   1) PHOTO (left): a black-and-white public-domain photograph that changes with the section you are in. The new picture wipes in
      from the left while it settles from a slight zoom. Pictures are illustrations of the TOPIC, not of the specific country in view.
   2) DOTS: a calm drifting cloud on the first screen, which gathers into a 100-square waffle (of every $100 asked for, $43 arrived) on the second, then flies into the real dot field on the third.
   Cheap by design: one small canvas, a handful of images, nothing runs once the rings have faded. */
(function () {
  "use strict";
  var IMG = {"s-scale": ["Food distribution at a refugee settlement, Uganda", "USAID", "https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(39910884580).jpg"], "s-map": ["Za'atri refugee camp, Jordan, from the air", "US Dept of State", "https://commons.wikimedia.org/wiki/File:Aerial_View_of_the_Za%27atri_Refugee_Camp.jpg"], "s-rank": ["Health screening at a UNHCR site", "USAID", "https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(40818914905).jpg"], "s-donors": ["A US Air Force C-130 being loaded with cargo", "US Air Force", "https://commons.wikimedia.org/wiki/File:C130-loading.jpg"], "s-media": ["A journalist with camera and radio phone", "Donn Dughi", "https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg"], "s-gaps": ["Mothers waiting at a child clinic, Lagos, Nigeria (historic photo)", "Vernon McKay", "https://commons.wikimedia.org/wiki/File:Mothers_wait_in_line_at_Child_Clinic_Centre_in_Lagos,_Nigeria.png"], "s-cuts": ["A US Air Force C-130 being loaded with cargo", "US Air Force", "https://commons.wikimedia.org/wiki/File:C130-loading.jpg"], "s-news": ["A journalist with camera and radio phone", "Donn Dughi", "https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg"]};
  var photo = document.getElementById("photo"), credit = document.getElementById("photoCredit");
  var layers = {}, cur = "", ids = ["s-what", "s-intro", "s-scale", "s-map", "s-rank", "s-donors", "s-cuts", "s-media", "s-news", "s-gaps", "s-method"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function layerFor(file) {
    if (layers[file]) return layers[file];
    var d = document.createElement("div"); d.className = "ph"; d.style.backgroundImage = 'url("img/' + file + '.jpg?v=14")';
    photo.appendChild(d); layers[file] = d; return d;
  }
  var prevEl = null, prevT = 0;
  function show(id) {
    if (id === cur) return; cur = id; photo.setAttribute("data-sec", id);
    var info = IMG[id], next = info ? layerFor(id === "s-news" ? "s-media" : id === "s-cuts" ? "s-donors" : id) : null;
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

  /* ---------- the dots: a calm drifting cloud (first screen) -> a 100-dot waffle "of every $100 asked, $43 arrived" (second) -> the real dot field (third) ----------
     One set of ~500 dots changes job as you move down. Each change is a timed animation (about 1.2 s) that starts when the next screen has slid up. */
  var cv = document.getElementById("spiral");
  if (!cv) return;
  window.__aidgapMerge = true;
  var ctx = cv.getContext("2d"), W = 0, H = 0, forceQ = null, raf = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TAU = Math.PI * 2, t0 = performance.now(), cols = null, dotsA = null, mapped = null, waffle = null;
  var E1 = 0, E2 = 0, landedAt = 0, lastT = performance.now(), gone = false, FLY = 1.2, DISSOLVE = 0.8, COUNT = 500;
  function readColours() {
    var s = getComputedStyle(document.documentElement);
    cols = { red: s.getPropertyValue("--unmet").trim() || "#a3202a", blue: s.getPropertyValue("--funded").trim() || "#4a86b8", ink: s.getPropertyValue("--ink2").trim() || "#bdb7ab", theme: document.documentElement.getAttribute("data-theme") };
  }
  function funded() { return typeof window.__aidgapFundedShare === "number" ? window.__aidgapFundedShare : 0.43; }
  function rnd(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  function buildDots() {                          // each dot: where it floats in the cloud (a fixed random place at the left or right edge) and its colour
    var r = rnd(7), f0 = funded(); dotsA = [];
    for (var i = 0; i < COUNT; i++) dotsA.push({ side: r() < 0.5 ? 0 : 1, fx: r(), fy: r(), ph: r() * TAU, ph2: r() * TAU, sp: 0.25 + r() * 0.3, rad: 1.5 + r() * 1.3, blue: r() < f0 });
    mapped = null; waffle = null;
  }
  // The waffle: 100 squares = 100 dollars asked for; the funded share (the blue ones) fills from the bottom left.
  function buildWaffle() {
    var cell = Math.min(W * 0.03, H * 0.045, 26), size = cell * 10, bx = W * 0.95 - size, by = H * 0.93 - size;
    var nBlue = Math.round(funded() * 100), cells = [];
    for (var c = 0; c < 100; c++) cells.push({ x: bx + (c % 10) * cell + cell / 2, y: by + (9 - Math.floor(c / 10)) * cell + cell / 2, blue: c < nBlue });
    var blueC = cells.filter(function (q) { return q.blue; }), redC = cells.filter(function (q) { return !q.blue; }), bi = 0, ri = 0;
    var seen = {}, assign = new Array(dotsA.length);
    dotsA.forEach(function (d, i) { var list = d.blue ? blueC : redC, k = (d.blue ? bi++ : ri++) % list.length; assign[i] = { cell: list[k], first: !seen[(d.blue ? "b" : "r") + k] }; seen[(d.blue ? "b" : "r") + k] = 1; });
    waffle = { assign: assign, rad: Math.max(2.4, cell * 0.36), bx: bx, by: by, size: size, cell: cell };
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); waffle = null; draw();
  }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function topOf(id) { var e = document.getElementById(id); return e ? e.getBoundingClientRect().top : 1e9; }
  function approach(E, g, dt) { return reduce ? g : E + (g > E ? 1 : -1) * Math.min(Math.abs(g - E), dt / FLY); }
  function draw() {
    var now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    ctx.clearRect(0, 0, W, H);
    var F = window.__aidgapField, fieldOK = !!(F && F.ready()), alpha = 1;
    if (!dotsA) buildDots();
    if (!waffle) buildWaffle();
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
    var lists = fieldOK ? F.lists() : null, tr = fieldOK ? F.radius() : 2.4;
    if (fieldOK && !mapped) {
      var nb = dotsA.filter(function (d) { return d.blue; }).length, nr = dotsA.length - nb, ib = 0, ir = 0;
      mapped = dotsA.map(function (d) { return d.blue ? lists.blue[Math.floor(ib++ * lists.blue.length / Math.max(1, nb))] : lists.red[Math.floor(ir++ * lists.red.length / Math.max(1, nr))]; });
    }
    for (var i = 0; i < dotsA.length; i++) {
      var d = dotsA[i], a = waffle.assign[i];
      var x = (d.side ? W * (0.8 + 0.18 * d.fx) : W * (0.02 + 0.16 * d.fx)) + Math.sin(t * d.sp + d.ph) * 14;
      var y = H * (0.08 + 0.84 * d.fy) + Math.cos(t * d.sp * 0.8 + d.ph2) * 14, rad = d.rad, al = 0.7;
      if (e1 > 0) {                                     // cloud -> waffle: one dot per square stays, the others tuck into it and fade out
        x += (a.cell.x - x) * e1; y += (a.cell.y - y) * e1;
        rad += ((a.first ? waffle.rad : waffle.rad * 0.6) - rad) * e1;
        al = a.first ? 0.7 + 0.25 * e1 : 0.7 * (1 - e1);
      }
      if (e2 > 0 && mapped && mapped[i] != null) {      // waffle -> the real dot field: everyone comes back and flies into place
        var p = F.at(mapped[i]); x += (p.x - x) * e2; y += (p.y - y) * e2; rad += (tr - rad) * e2;
        al = (a.first ? 0.95 : 0) * (1 - e2) + 0.85 * e2;
      }
      if (al <= 0.01) continue;
      ctx.globalAlpha = Math.min(1, al * alpha);
      ctx.fillStyle = d.blue ? cols.blue : cols.red;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    if (e1 > 0.5 && e2 < 0.5) {                           // caption under the waffle
      ctx.globalAlpha = Math.min(1, (e1 - 0.5) * 2) * (1 - e2 * 2) * alpha; ctx.fillStyle = cols.ink; ctx.textAlign = "right";
      ctx.font = "600 11px ui-monospace, Consolas, monospace";
      ctx.fillText("OF EVERY $100 ASKED FOR,", waffle.bx + waffle.size, waffle.by - 24);
      ctx.fillText("ABOUT $" + Math.round(funded() * 100) + " ARRIVED. ONE SQUARE = $1.", waffle.bx + waffle.size, waffle.by - 8);
    }
    ctx.globalAlpha = 1;
    // the waffle is formed and we are still on it: nothing moves, so stop redrawing until you scroll
    if (!reduce && forceQ == null && E1 >= 1 && E2 <= 0) running = false;
  }
  function loop() { draw(); raf = (running && !reduce) ? requestAnimationFrame(loop) : 0; }
  function start() { if (!running) { running = true; if (!raf) loop(); } }
  function onScroll() { gone = false; if (E2 < 1) landedAt = 0; if (reduce) draw(); else start(); }
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.__vortexSetP = function (q) { forceQ = q; draw(); };   // testing: 0 = drifting cloud, 1 = the waffle, 2 = landed on the dot field
  window.addEventListener("load", function () { buildDots(); onScroll(); });
  resize(); onScroll(); if (!reduce) start();
})();
