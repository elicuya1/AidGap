/* AidGap: one clean spiral on the left of the page. It turns slowly and dissolves as you scroll away from the intro.
   Blue dot = the share of need that is funded, red dot = not funded (same colours as the rest of the page).
   About 260 dots, one small canvas, and it stops drawing completely once it has faded: very cheap. */
(function () {
  "use strict";
  var cv = document.getElementById("spiral");
  if (!cv) return;
  var ctx = cv.getContext("2d"), W = 0, H = 0, P = 0, forceP = null, raf = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ARMS = 2, PER = 130, TAU = Math.PI * 2, t0 = performance.now(), cols = null;
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
    var t = reduce ? 0 : (performance.now() - t0) / 1000, ease = a * a * (3 - 2 * a);
    var cx = W * 0.2, cy = H * 0.54, R = Math.min(W * 0.58, H * 0.44) * (1 + (1 - ease) * 0.7);
    var spin = t * 0.22 + p * 5, fund = funded();
    ctx.globalAlpha = Math.min(1, ease * 0.8);
    for (var arm = 0; arm < ARMS; arm++) {
      for (var j = 0; j < PER; j++) {
        var f = j / (PER - 1), r = R * (0.05 + 0.95 * Math.pow(f, 0.85));
        var ang = f * TAU * 2.2 + arm * (TAU / ARMS) + spin;
        var x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
        ctx.fillStyle = ((j * 37 + arm * 53) % 100) / 100 < fund ? cols.blue : cols.red;
        ctx.beginPath(); ctx.arc(x, y, 1.1 + 1.9 * f, 0, TAU); ctx.fill();
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
