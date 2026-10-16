/*
 * sim.js — 室内音质几何声学模拟内核（2D 平面光线追踪）
 * 浏览器挂到 window.RoomSim，Node 下 module.exports。
 *
 * 方法源自公开文献：镜像声源法（Allen & Berkley）、光线/锥束追踪（Kuttruff）、
 * ISO 3382 参量与 Schroeder 反向积分、Sabine/Eyring 混响公式。
 * 定位：几何声学估算与可视化，非验收级（不含波声学与边缘衍射）。
 */
(function (global) {
  'use strict';

  var C_AIR = 343; // 声速 m/s

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function sideAlpha(o, key, def) {
    var n = (o && o.sides) ? num(o.sides[key]) : null;
    return n == null ? def : clamp(n, 0, 0.999);
  }

  /* 构建房间模型：矩形 + 可选内隔墙。返回几何、吸声量、混响等。 */
  function buildRoom(o) {
    o = o || {};
    var w = num(o.width), d = num(o.depth);
    if (w == null || w <= 0 || d == null || d <= 0) return { ok: false, error: '房间长、宽须为 > 0 的数值' };
    var h = num(o.height); if (h == null || h <= 0) h = 3;
    var a = num(o.alpha); if (a == null || a < 0 || a >= 1) a = 0.2;
    var fa = num(o.floorAlpha); if (fa == null) fa = a;
    var ca = num(o.ceilAlpha); if (ca == null) ca = a;

    var wa = {
      top: sideAlpha(o, 'top', a), right: sideAlpha(o, 'right', a),
      bottom: sideAlpha(o, 'bottom', a), left: sideAlpha(o, 'left', a)
    };

    var walls = [
      { x1: 0, y1: 0, x2: w, y2: 0, alpha: wa.top, type: 'ext', side: 'top' },
      { x1: w, y1: 0, x2: w, y2: d, alpha: wa.right, type: 'ext', side: 'right' },
      { x1: w, y1: d, x2: 0, y2: d, alpha: wa.bottom, type: 'ext', side: 'bottom' },
      { x1: 0, y1: d, x2: 0, y2: 0, alpha: wa.left, type: 'ext', side: 'left' }
    ];

    var inner = [];
    (o.innerWalls || []).forEach(function (s) {
      var x1 = num(s.x1), y1 = num(s.y1), x2 = num(s.x2), y2 = num(s.y2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return;
      if (x1 === x2 && y1 === y2) return;
      var al = num(s.alpha); if (al == null) al = a;
      var seg = {
        x1: clamp(x1, 0, w), y1: clamp(y1, 0, d), x2: clamp(x2, 0, w), y2: clamp(y2, 0, d),
        alpha: clamp(al, 0, 0.999), type: 'inner'
      };
      inner.push(seg); walls.push(seg);
    });

    var A = 0, S = 0;
    A += w * h * wa.top; S += w * h;
    A += d * h * wa.right; S += d * h;
    A += w * h * wa.bottom; S += w * h;
    A += d * h * wa.left; S += d * h;
    A += w * d * fa; S += w * d;
    A += w * d * ca; S += w * d;
    inner.forEach(function (s) { var len = hypot(s.x2 - s.x1, s.y2 - s.y1); A += len * h * 2 * s.alpha; S += len * h * 2; });

    var V = w * d * h;
    var meanAlpha = S > 0 ? A / S : 0;
    return {
      ok: true, bounds: { w: w, d: d }, height: h,
      walls: walls, innerWalls: inner, wallAlpha: wa, floorAlpha: fa, ceilAlpha: ca,
      area: w * d, perimeter: 2 * (w + d), volume: V, surface: S,
      absorption: A, meanAlpha: meanAlpha,
      rt60: A > 0 ? 0.161 * V / A : null,
      rt60Eyring: (meanAlpha > 0 && meanAlpha < 1) ? 0.161 * V / (-S * Math.log(1 - meanAlpha)) : null,
      meanFreePath: S > 0 ? 4 * V / S : null
    };
  }

  /* 射线与线段求交，返回最近命中参数 t、单位法线、该墙吸声系数 */
  function raySeg(px, py, dx, dy, s) {
    var x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
    var ex = x2 - x1, ey = y2 - y1;
    var den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return null;
    var t = ((x1 - px) * ey - (y1 - py) * ex) / den;
    var u = ((x1 - px) * dy - (y1 - py) * dx) / den;
    if (t <= 1e-9 || u < 0 || u > 1) return null;
    var nx = -ey, ny = ex, L = hypot(nx, ny);
    if (L === 0) return null;
    return { t: t, nx: nx / L, ny: ny / L, alpha: (s.alpha == null ? 0 : s.alpha) };
  }

  /* 从声源发出 nRays 条光线，逐次反射并按 (1-α) 衰减能量 */
  function traceRoom(model, opt) {
    opt = opt || {};
    if (!model || !model.ok) return { ok: false, error: '缺少有效房间模型' };
    var nRays = Math.max(1, Math.min(4000, Math.round(num(opt.nRays) || 240)));
    var maxB = Math.max(1, Math.round(num(opt.maxBounces) || 40));
    var minE = opt.minEnergy == null ? 0.03 : num(opt.minEnergy);
    if (minE == null) minE = 0.03;
    var maxLen = num(opt.maxLength) || 2000;
    var src = opt.source || { x: model.bounds.w / 2, y: model.bounds.d / 2 };
    var walls = model.walls;

    var rays = [], totalHits = 0, totalAbs = 0, maxLength = 0;
    for (var i = 0; i < nRays; i++) {
      var ang = (i + 0.5) / nRays * Math.PI * 2;
      var px = src.x, py = src.y, dx = Math.cos(ang), dy = Math.sin(ang);
      var e = 1, pts = [{ x: px, y: py, t: 0, e: 1 }], dist = 0, b = 0;
      while (b < maxB && e > minE && dist < maxLen) {
        var best = null;
        for (var k = 0; k < walls.length; k++) {
          var hh = raySeg(px, py, dx, dy, walls[k]);
          if (hh && (!best || hh.t < best.t)) best = hh;
        }
        if (!best) break;
        px += dx * best.t; py += dy * best.t; dist += best.t;
        pts.push({ x: px, y: py, t: dist, e: e });
        var nx = best.nx, ny = best.ny;
        if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
        var dot = dx * nx + dy * ny;
        dx = dx - 2 * dot * nx; dy = dy - 2 * dot * ny;
        e *= (1 - best.alpha); b++; totalHits++;
      }
      totalAbs += (1 - e);
      if (dist > maxLength) maxLength = dist;
      rays.push({ pts: pts, length: dist });
    }
    return {
      ok: true, source: src, nRays: nRays, rays: rays, maxLength: maxLength,
      hits: totalHits / nRays, absorbed: totalAbs / nRays
    };
  }

  /* 把光线的能量按位置投射到平面网格，并按到达时间拆分早/晚期能量 */
  function sampleGrid(model, rays, opt) {
    opt = opt || {};
    var gx = Math.max(4, Math.round(num(opt.gx) || 48));
    var gy = Math.max(4, Math.round(num(opt.gy) || 32));
    var c = num(opt.c) || C_AIR;
    var tE = opt.earlyTime == null ? 0.05 : num(opt.earlyTime);
    var tM = opt.midTime == null ? 0.08 : num(opt.midTime);
    var cw = model.bounds.w / gx, ch = model.bounds.d / gy;
    var cells = new Array(gx * gy);
    for (var i = 0; i < cells.length; i++) cells[i] = { E: 0, E50: 0, E80: 0, Et: 0 };

    (rays || []).forEach(function (ray) {
      var p = ray.pts;
      for (var j = 0; j < p.length - 1; j++) {
        var A = p[j], B = p[j + 1];
        var ddx = B.x - A.x, ddy = B.y - A.y;
        var len = hypot(ddx, ddy);
        if (len <= 0) continue;
        var step = Math.max(cw, ch) * 0.5;
        var st = Math.max(1, Math.round(len / step));
        for (var s = 0; s <= st; s++) {
          var f = s / st, xx = A.x + ddx * f, yy = A.y + ddy * f;
          var tt = (A.t + len * f) / c;
          var ix = Math.floor(xx / cw), iy = Math.floor(yy / ch);
          if (ix < 0 || ix >= gx || iy < 0 || iy >= gy) continue;
          var cell = cells[iy * gx + ix], en = A.e;
          cell.E += en;
          if (tt <= tE) cell.E50 += en;
          if (tt <= tM) cell.E80 += en;
          cell.Et += en * tt;
        }
      }
    });
    return { gx: gx, gy: gy, cw: cw, ch: ch, cells: cells };
  }

  /* 单格指标 */
  function cellMetrics(cell) {
    if (!cell || cell.E <= 0) return null;
    var late50 = cell.E - cell.E50, late80 = cell.E - cell.E80;
    return {
      E: cell.E,
      C50: late50 > 0 ? 10 * Math.log10(cell.E50 / late50) : (cell.E50 > 0 ? 60 : null),
      C80: late80 > 0 ? 10 * Math.log10(cell.E80 / late80) : (cell.E80 > 0 ? 60 : null),
      D50: cell.E50 / cell.E,
      Ts: cell.Et / cell.E * 1000
    };
  }

  /* 网格指标：逐格求相对声压级 / C50 / C80 / D50 / Ts */
  function gridMetrics(grid) {
    var n = grid.gx * grid.gy, out = new Array(n), maxE = 0, i;
    for (i = 0; i < n; i++) { if (grid.cells[i].E > maxE) maxE = grid.cells[i].E; }
    for (i = 0; i < n; i++) {
      var m = cellMetrics(grid.cells[i]);
      if (!m) { out[i] = null; continue; }
      m.L = maxE > 0 ? 10 * Math.log10(m.E / maxE) : null;
      out[i] = m;
    }
    return { gx: grid.gx, gy: grid.gy, cw: grid.cw, ch: grid.ch, maxE: maxE, metrics: out };
  }

  /* 指标有效范围（按分位裁剪，剔除离群格） */
  function metricRange(gm, key, opt) {
    opt = opt || {};
    var thresh = opt.minE == null ? gm.maxE * 0.01 : opt.minE;
    var vals = [];
    gm.metrics.forEach(function (m) {
      if (m && m.E >= thresh && m[key] != null && isFinite(m[key])) vals.push(m[key]);
    });
    if (!vals.length) return null;
    vals.sort(function (a, b) { return a - b; });
    var loP = opt.lo == null ? 0.05 : opt.lo, hiP = opt.hi == null ? 0.95 : opt.hi;
    var lo = vals[Math.min(vals.length - 1, Math.floor(vals.length * loP))];
    var hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * hiP))];
    if (hi <= lo) { lo = vals[0]; hi = vals[vals.length - 1]; }
    if (hi <= lo) hi = lo + 1e-6;
    return [lo, hi];
  }

  /* 接收点能量时程（回波图）：统计光线经过接收点邻域的能量，按到达时刻分箱 */
  function receiverResponse(rays, receiver, opt) {
    opt = opt || {};
    var radius = num(opt.radius); if (radius == null || radius <= 0) radius = 0.6;
    var c = num(opt.c) || C_AIR;
    var binMs = num(opt.binMs) || 10;
    var maxMs = num(opt.maxMs) || 1000;
    var nb = Math.max(1, Math.ceil(maxMs / binMs)), bins = new Float64Array(nb);

    (rays || []).forEach(function (ray) {
      var p = ray.pts;
      for (var j = 0; j < p.length - 1; j++) {
        var A = p[j], B = p[j + 1];
        var ddx = B.x - A.x, ddy = B.y - A.y;
        var L2 = ddx * ddx + ddy * ddy;
        var tp = L2 > 0 ? ((receiver.x - A.x) * ddx + (receiver.y - A.y) * ddy) / L2 : 0;
        tp = tp < 0 ? 0 : (tp > 1 ? 1 : tp);
        var cx = A.x + ddx * tp, cy = A.y + ddy * tp;
        var dist = hypot(receiver.x - cx, receiver.y - cy);
        if (dist > radius) continue;
        var path = A.t + Math.sqrt(L2) * tp;
        var ms = path / c * 1000;
        var bi = Math.floor(ms / binMs);
        if (bi >= 0 && bi < nb) bins[bi] += A.e * (1 - dist / radius);
      }
    });
    return { binMs: binMs, maxMs: maxMs, bins: bins };
  }

  /* Schroeder 反向积分 → EDT / T20 / T30 */
  function rtFromSchroeder(bins, binMs) {
    var n = bins.length;
    if (!n) return { ok: false };
    binMs = binMs || 10;
    var s = new Float64Array(n), acc = 0, i;
    for (i = n - 1; i >= 0; i--) { acc += bins[i]; s[i] = acc; }
    if (s[0] <= 0) return { ok: false };
    var t = [], db = [];
    for (i = 0; i < n; i++) {
      if (s[i] <= 0) break;
      t.push((i + 0.5) * binMs / 1000);
      db.push(10 * Math.log10(s[i] / s[0]));
    }
    function slope(fromDb, toDb) {
      var xs = [], ys = [];
      for (var k = 0; k < db.length; k++) {
        if (db[k] <= fromDb && db[k] >= toDb) { xs.push(t[k]); ys.push(db[k]); }
      }
      if (xs.length < 2) return null;
      var N = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (var q = 0; q < N; q++) { sx += xs[q]; sy += ys[q]; sxx += xs[q] * xs[q]; sxy += xs[q] * ys[q]; }
      var den = N * sxx - sx * sx;
      if (Math.abs(den) < 1e-12) return null;
      return (N * sxy - sx * sy) / den;
    }
    function rt(a) { return a == null || a >= 0 ? null : (-60 / a); }
    return {
      ok: true,
      edt: rt(slope(-0.1, -10)),
      t20: rt(slope(-5, -25)),
      t30: rt(slope(-5, -35))
    };
  }

  /* 由回波图求接收点 ISO 3382 参量 */
  function isoFromEchogram(res) {
    if (!res || !res.bins || !res.bins.length) return { ok: false };
    var bins = res.bins, binMs = res.binMs || 10, n = bins.length;
    var Etot = 0, E50 = 0, E80 = 0, Et = 0;
    for (var i = 0; i < n; i++) {
      var tt = (i + 0.5) * binMs / 1000, en = bins[i];
      Etot += en;
      if (tt <= 0.05) E50 += en;
      if (tt <= 0.08) E80 += en;
      Et += en * tt;
    }
    if (Etot <= 0) return { ok: false };
    var rt = rtFromSchroeder(bins, binMs);
    return {
      ok: true, Etot: Etot,
      c50: (Etot - E50) > 0 ? 10 * Math.log10(E50 / (Etot - E50)) : (E50 > 0 ? 60 : null),
      c80: (Etot - E80) > 0 ? 10 * Math.log10(E80 / (Etot - E80)) : (E80 > 0 ? 60 : null),
      d50: E50 / Etot,
      ts: Et / Etot * 1000,
      edt: rt.edt, t20: rt.t20, t30: rt.t30
    };
  }

  var API = {
    C_AIR: C_AIR,
    buildRoom: buildRoom,
    raySeg: raySeg,
    traceRoom: traceRoom,
    sampleGrid: sampleGrid,
    cellMetrics: cellMetrics,
    gridMetrics: gridMetrics,
    metricRange: metricRange,
    receiverResponse: receiverResponse,
    rtFromSchroeder: rtFromSchroeder,
    isoFromEchogram: isoFromEchogram
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.RoomSim = API;
})(typeof window !== 'undefined' ? window : this);
