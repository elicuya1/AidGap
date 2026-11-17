/* AidGap: one clean spiral on the left of the page. It turns slowly and dissolves as you scroll away from the intro.
   Blue dot = the share of need that is funded, red dot = not funded (same colours as the rest of the page).
   About 260 dots, one small canvas, and it stops drawing completely once it has faded: very cheap. */
(function () {
  "use strict";
  var cv = document.getElementById("spiral");
  if (!cv) return;
  var ctx = cv.getContext("2d"), W = 0, H = 0, P = 0, forceP = null, raf = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RINGS = 9, TAU = Math.PI * 2, t0 = performance.now(), cols = null;
  var FADE = 0.22;                                  // fully gone by this share of the page

  function readColours() {
    var s = getComputedStyle(document.documentElement);
    cols = { red: s.getPropertyValue("--unmet").trim() || "#a3202a", blue: s.getPropertyValue("--funded").trim() || "#4a86b8", theme: document.documentElement.getAttribute("data-theme") };
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.round(window.innerWidth * 0.5); H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
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
    // concentric rings, each turning at its own speed; on every ring the blue arc is the funded share, the rest red
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
  window.__vortexSetP = function (p) { forceP = p; draw(); };   // testing: __vortexSetP(0.1)
  resize(); onScroll(); if (!reduce) start();
})();
