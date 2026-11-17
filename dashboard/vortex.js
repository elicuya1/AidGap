/* AidGap: the black-and-white photograph, cut into tiles that swirl into different vortex shapes as you scroll.
   intro: the photo whole -> tornado -> spiral galaxy -> upside-down funnel -> tornado -> whirlpool.
   Plain canvas, no libraries. Reduced-motion: no continuous spin, the shape still follows your scroll. */
(function () {
  "use strict";
  var cv = document.getElementById("vortex");
  if (!cv) return;
  var ctx = cv.getContext("2d"), img = new Image(), ready = false;
  var COLS = 48, ROWS = 32, N = COLS * ROWS, TAU = Math.PI * 2;
  var W = 0, H = 0, ox = 0, oy = 0, sc = 1, tw = 0, th = 0;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var P = 0, forceP = null, t0 = performance.now(), raf = 0;
  // scroll position -> which shape to blend to (a stop is [scroll progress, shape])
  var STOPS = [[0, 0], [0.09, 1], [0.3, 2], [0.5, 3], [0.7, 1], [0.9, 4], [1, 4]];

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!ready) return;
    sc = Math.max(W / img.width, H / img.height);
    ox = (W - img.width * sc) / 2; oy = (H - img.height * 0.9 * sc) / 2;
    tw = img.width / COLS; th = img.height / ROWS;
    draw();
  }

  // position of tile i in shape k: returns x, y, size, alpha, depth
  var out = [0, 0, 0, 0, 0];
  function place(k, i, spin, o) {
    var c = i % COLS, r = (i / COLS) | 0, u = c / COLS, v = r / ROWS, base = tw * sc, cx = W * 0.62, rad, a, s;
    var R = Math.min(W, H) * 0.62;
    if (k === 0) {                                   // the photo itself
      o[0] = ox + (c + 0.5) * tw * sc; o[1] = oy + (r + 0.5) * th * sc; o[2] = base * 1.04; o[3] = 1; o[4] = 0; return;
    }
    if (k === 1 || k === 3) {                        // tornado (3 = upside down)
      var w = k === 1 ? v : 1 - v;
      rad = R * (0.07 + 0.93 * Math.pow(1 - w, 1.35)) * 0.9;
      a = u * TAU + w * 3.4 + spin;
      o[0] = cx + rad * Math.cos(a);
      o[1] = H * 0.08 + w * H * 0.84 + rad * 0.26 * Math.sin(a);
      s = base * (0.55 + 0.9 * rad / R);
    } else if (k === 2) {                            // spiral galaxy
      var q = i / N;
      rad = R * 0.95 * Math.sqrt(q);
      a = Math.sqrt(q) * TAU * 4.6 + spin * 0.8 + (i % 3) * 0.12;
      o[0] = cx * 0.95 + rad * Math.cos(a);
      o[1] = H * 0.52 + rad * 0.5 * Math.sin(a);
      s = base * (0.5 + 0.9 * (1 - q) + 0.2);
    } else {                                         // whirlpool: flat concentric rings
      rad = R * (0.12 + 0.95 * v);
      a = u * TAU + spin * (0.6 + 1.4 * (1 - v));
      o[0] = cx * 0.9 + rad * Math.cos(a);
      o[1] = H * 0.55 + rad * 0.36 * Math.sin(a);
      s = base * (0.6 + 0.9 * v);
    }
    var z = Math.sin(a);
    o[2] = s; o[3] = 0.28 + 0.72 * (z + 1) / 2; o[4] = z;
  }

  var A = [0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0];
  function shapes(p) {                               // the two shapes to blend, and how far between them
    for (var j = 0; j < STOPS.length - 1; j++) {
      if (p <= STOPS[j + 1][0]) {
        var f = (p - STOPS[j][0]) / Math.max(1e-6, STOPS[j + 1][0] - STOPS[j][0]);
        return [STOPS[j][1], STOPS[j + 1][1], smooth(f)];
      }
    }
    return [4, 4, 0];
  }

  function draw() {
    if (!ready) return;
    var p = forceP != null ? forceP : P, sh = shapes(p), t = reduce ? 0 : (performance.now() - t0) / 1000;
    var spin = t * 0.32 + p * 14, m = sh[2], k1 = sh[0], k2 = sh[1];
    ctx.clearRect(0, 0, W, H);
    for (var pass = 0; pass < 2; pass++) {           // back tiles first, then front tiles
      for (var i = 0; i < N; i++) {
        place(k1, i, spin, A);
        if (m > 0 && k2 !== k1) { place(k2, i, spin, B); for (var q = 0; q < 5; q++) A[q] += (B[q] - A[q]) * m; }
        var front = A[4] >= 0 ? 1 : 0;
        if (front !== pass) continue;
        var s = A[2];
        if (A[0] < -s || A[0] > W + s || A[1] < -s || A[1] > H + s || A[3] < 0.02) continue;
        ctx.globalAlpha = A[3];
        ctx.drawImage(img, (i % COLS) * tw, ((i / COLS) | 0) * th, tw, th, A[0] - s / 2, A[1] - s / 2, s, s * th / tw);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame() { draw(); raf = reduce ? 0 : requestAnimationFrame(frame); }
  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    P = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    if (reduce) draw();
  }

  img.onload = function () { ready = true; resize(); onScroll(); frame(); };
  img.src = "img/hero.jpg?v=10";
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.__vortexSetP = function (p) { forceP = p; draw(); };   // for testing: open index.html and call __vortexSetP(0.2)
  resize();
})();
