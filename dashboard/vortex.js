/* AidGap background, two layers.
   1) PHOTO (left): a black-and-white public-domain photograph that changes with the section you are in. The new picture wipes in
      from the left while it settles from a slight zoom. Pictures are illustrations of the TOPIC, not of the specific country in view.
   2) RINGS (right): concentric rings of dots; on each ring the blue arc is the funded share, the red arc is unfunded. As "The scale" rises into view the ring dots fly into the real dots of the dot field and dissolve into them.
   Cheap by design: one small canvas, a handful of images, nothing runs once the rings have faded. */
(function () {
  "use strict";
  var IMG = {"s-intro": ["WFP food distribution, Bannu, Pakistan", "WFP", "https://commons.wikimedia.org/wiki/File:Food_Distribution_at_a_Camp_in_Bannu_-_Photo_Credit_WFP_(14502236274).jpg"], "s-scale": ["Food distribution at a refugee settlement, Uganda", "USAID", "https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(39910884580).jpg"], "s-map": ["Za'atri refugee camp, Jordan, from the air", "US Dept of State", "https://commons.wikimedia.org/wiki/File:Aerial_View_of_the_Za%27atri_Refugee_Camp.jpg"], "s-rank": ["Health screening at a UNHCR site", "USAID", "https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(40818914905).jpg"], "s-donors": ["A US Air Force C-130 being loaded with cargo", "US Air Force", "https://commons.wikimedia.org/wiki/File:C130-loading.jpg"], "s-media": ["A journalist with camera and radio phone", "Donn Dughi", "https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg"], "s-gaps": ["Mothers waiting at a child clinic, Lagos, Nigeria (historic photo)", "Vernon McKay", "https://commons.wikimedia.org/wiki/File:Mothers_wait_in_line_at_Child_Clinic_Centre_in_Lagos,_Nigeria.png"], "s-news": ["A journalist with camera and radio phone", "Donn Dughi", "https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg"]};
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

  /* ---------- rings: they turn on the first screens, then fly into the dots of "The scale" ---------- */
  var cv = document.getElementById("spiral");
  if (!cv) return;
  window.__aidgapMerge = true;
  var ctx = cv.getContext("2d"), W = 0, H = 0, forceQ = null, raf = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RINGS = 9, TAU = Math.PI * 2, t0 = performance.now(), cols = null, ring = null, mapped = null;
  function readColours() {
    var s = getComputedStyle(document.documentElement);
    cols = { red: s.getPropertyValue("--unmet").trim() || "#a3202a", blue: s.getPropertyValue("--funded").trim() || "#4a86b8", theme: document.documentElement.getAttribute("data-theme") };
  }
  function funded() { return typeof window.__aidgapFundedShare === "number" ? window.__aidgapFundedShare : 0.43; }
  function buildRing() {                         // every dot of every ring, with its colour and its place in the ring
    var f0 = funded(); ring = [];
    for (var k = 0; k < RINGS; k++) {
      var f = (k + 1) / RINGS, n = Math.round(18 + 70 * f);
      for (var j = 0; j < n; j++) ring.push({ k: k, f: f, n: n, j: j, blue: j / n < f0 });
    }
    mapped = null;
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  // The merge is timed, not tied to scroll speed: once "The scale" has slid up the screen the ring dots fly for ~1.2 s, land on the real dots, then dissolve.
  var E = 0, landedAt = 0, lastT = performance.now(), gone = false, FLY = 1.2, DISSOLVE = 0.8;
  function goal() {
    var sc = document.getElementById("s-scale"); if (!sc) return 0;
    return sc.getBoundingClientRect().top < window.innerHeight * 0.7 ? 1 : 0;
  }
  function draw() {
    var now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    ctx.clearRect(0, 0, W, H);
    var fieldOK = window.__aidgapField && window.__aidgapField.ready(), g = goal(), alpha = 1, q;
    if (forceQ != null) { q = forceQ; alpha = q <= 1 ? 1 : 1 - (q - 1) / 0.3; E = Math.min(1, q); }
    else {
      if (!fieldOK) g = 0;
      E = reduce ? g : E + (g > E ? 1 : -1) * Math.min(Math.abs(g - E), dt / FLY);
      if (E >= 1) { if (!landedAt) landedAt = now; alpha = 1 - Math.min(1, (now - landedAt) / (DISSOLVE * 1000)); } else landedAt = 0;
      q = E;
    }
    cv.classList.toggle("front", E > 0.02);
    if (alpha <= 0.01) { running = false; gone = true; return; }
    gone = false;
    if (!ring) buildRing();
    if (!cols || cols.theme !== document.documentElement.getAttribute("data-theme")) readColours();
    if (q >= 0.85 && fieldOK && !draw.started) { draw.started = true; window.__aidgapField.start(); }
    var t = reduce ? 0 : (now - t0) / 1000, e = ease(q), fund = funded();
    var cx = W * 0.91, cy = H * 0.52, R = Math.min(W * 0.475, H * 0.46);
    var F = fieldOK ? window.__aidgapField : null, lists = F ? F.lists() : null, tr = F ? F.radius() : 2.4;
    // ring dot -> real dot (blue to blue, red to red, spread evenly)
    if (F && !mapped) {
      var nb = ring.filter(function (d) { return d.blue; }).length, nr = ring.length - nb, ib = 0, ir = 0;
      mapped = ring.map(function (d) { return d.blue ? lists.blue[Math.floor(ib++ * lists.blue.length / Math.max(1, nb))] : lists.red[Math.floor(ir++ * lists.red.length / Math.max(1, nr))]; });
    }
    ctx.globalAlpha = Math.min(1, alpha * 0.85);
    for (var i = 0; i < ring.length; i++) {
      var d = ring[i], r = R * d.f, dir = d.k % 2 ? -1 : 1;
      var ang = dir * (t * (0.28 - 0.18 * d.f)) + d.k * 0.7 + (d.j / d.n) * TAU;
      var x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang), rad = 1.2 + 1.3 * d.f;
      if (e > 0 && F && mapped && mapped[i] != null) {
        var p = F.at(mapped[i]); x += (p.x - x) * e; y += (p.y - y) * e; rad += (tr - rad) * e;
      }
      ctx.fillStyle = d.blue ? cols.blue : cols.red;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function loop() { draw(); raf = (running && !reduce) ? requestAnimationFrame(loop) : 0; }
  function start() { if (!running) { running = true; if (!raf) loop(); } }
  function onScroll() {
    if (goal() === 0) { gone = false; landedAt = 0; }
    if (!gone) { if (reduce) draw(); else start(); }
  }
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.__vortexSetP = function (q) { forceQ = q; draw(); };   // testing: __vortexSetQ via __vortexSetP(0.5): 0 = rings, 1 = landed on the dots
  window.addEventListener("load", function () { buildRing(); onScroll(); draw(); });
  resize(); onScroll(); if (!reduce) start();
})();
