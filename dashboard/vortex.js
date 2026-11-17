/* AidGap background, two layers.
   1) PHOTO (left): a black-and-white public-domain photograph that changes with the section you are in. The new picture wipes in
      from the left while it settles from a slight zoom. Pictures are illustrations of the TOPIC, not of the specific country in view.
   2) RINGS (right): concentric rings of dots; on each ring the blue arc is the funded share, the red arc is unfunded. They fade out as you scroll.
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
    var rg = document.getElementById("spiral"); if (rg) rg.classList.toggle("off", id === "s-what");   // the first screen is words only
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

  /* ---------- rings ---------- */
  var cv = document.getElementById("spiral");
  if (!cv) return;
  var ctx = cv.getContext("2d"), W = 0, H = 0, P = 0, forceP = null, raf = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RINGS = 9, TAU = Math.PI * 2, t0 = performance.now(), cols = null, FADE = 0.22;
  function readColours() {
    var s = getComputedStyle(document.documentElement);
    cols = { red: s.getPropertyValue("--unmet").trim() || "#a3202a", blue: s.getPropertyValue("--funded").trim() || "#4a86b8", theme: document.documentElement.getAttribute("data-theme") };
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.round(window.innerWidth * 0.5); H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  function funded() { return typeof window.__aidgapFundedShare === "number" ? window.__aidgapFundedShare : 0.43; }
  function draw() {
    var p = forceP != null ? forceP : P, a = 1 - Math.min(1, p / FADE);
    ctx.clearRect(0, 0, W, H);
    if (a <= 0.01) { running = false; return; }
    if (!cols || cols.theme !== document.documentElement.getAttribute("data-theme")) readColours();
    var t = reduce ? 0 : (performance.now() - t0) / 1000, ease = a * a * (3 - 2 * a), fund = funded();
    var cx = W * 0.82, cy = H * 0.52, R = Math.min(W * 0.95, H * 0.46) * (1 + (1 - ease) * 0.5);
    ctx.globalAlpha = Math.min(1, ease * 0.85);
    for (var k = 0; k < RINGS; k++) {
      var f = (k + 1) / RINGS, r = R * f, n = Math.round(18 + 70 * f), dir = k % 2 ? -1 : 1;
      var rot = dir * (t * (0.28 - 0.18 * f) + p * 3) + k * 0.7, dr = 1.2 + 1.3 * f;
      for (var j = 0; j < n; j++) {
        var ang = rot + (j / n) * TAU;
        ctx.fillStyle = j / n < fund ? cols.blue : cols.red;
        ctx.beginPath(); ctx.arc(cx + r * Math.cos(ang), cy + r * Math.sin(ang), dr, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function loop() { draw(); raf = (running && !reduce) ? requestAnimationFrame(loop) : 0; }
  function start() { if (!running) { running = true; if (!raf) loop(); } }
  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    P = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
    if (P < FADE) { if (reduce) draw(); else start(); }
  }
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.__vortexSetP = function (p) { forceP = p; draw(); };
  resize(); onScroll(); if (!reduce) start();
})();
