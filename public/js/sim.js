/*
 * sim.js — 室内音质几何声学模拟内核
 * 浏览器挂到 window.RoomSim，Node 下 module.exports。
 *
 * 方法源自公开文献：镜像声源法（Allen & Berkley）、光线/锥束追踪（Kuttruff）、
 * ISO 3382 参量与 Schroeder 反向积分、Sabine/Eyring 混响公式、ISO 9613-1 空气吸收量级。
 * 定位：几何声学估算与可视化，非验收级（不含波声学与边缘衍射）。
 *
 * v3：三维盒式光线追踪（含地面/天花反射）+ 六个倍频带（含空气吸收）+ 逐格回波（可出混响分布）
 */
(function (global) {
  'use strict';

  var C_AIR = 343;                                   // 声速 m/s
  var BANDS = [125, 250, 500, 1000, 2000, 4000];     // 倍频带中心频率
  var NB = BANDS.length;
  /* 空气吸收系数 m (1/m)，20 ℃ / 50 %RH 典型量级（ISO 9613-1） */
  var AIR_ABS = [1e-4, 3e-4, 7e-4, 1.9e-3, 5.7e-3, 1.8e-2];

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  /* 把 number 或长度 6 的数组归一化为 6 段倍频带数组 */
  function b6(x) {
    var i, n;
    if (Array.isArray(x)) {
      var o = [], first = null;
      for (i = 0; i < NB; i++) {
        n = num(x[i]);
        if (n != null && n >= 0 && n < 1) { o[i] = clamp(n, 0, 0.999); if (first == null) first = o[i]; }
        else o[i] = null;
      }
      if (first == null) return null;
      for (i = 0; i < NB; i++) if (o[i] == null) o[i] = first;
      return o;
    }
    n = num(x);
    if (n == null || n < 0 || n >= 1) return null;
    var a = [];
    for (i = 0; i < NB; i++) a.push(n);
    return a;
  }
  function ones() { var a = []; for (var i = 0; i < NB; i++) a.push(1); return a; }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }

  /* ============ 房间模型：矩形盒 + 可选竖向内隔墙（倍频带吸声） ============ */
  function buildRoom(o) {
    o = o || {};
    var w = num(o.width), d = num(o.depth);
    if (w == null || w <= 0 || d == null || d <= 0) return { ok: false, error: '房间长、宽须为 > 0 的数值' };
    var h = num(o.height); if (h == null || h <= 0) h = 3;
    var ab = b6(o.alpha); if (!ab) ab = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
    var s = o.sides || {};
    var surf = {
      y0: b6(s.top) || ab,     // y = 0
      x1: b6(s.right) || ab,   // x = w
      y1: b6(s.bottom) || ab,  // y = d
      x0: b6(s.left) || ab,    // x = 0
      z0: b6(o.floorAlpha) || ab,
      z1: b6(o.ceilAlpha) || ab
    };
    /* 二维墙面（内隔墙求交用） */
    var walls = [
      { x1: 0, y1: 0, x2: w, y2: 0, alphaB: surf.y0, type: 'ext', side: 'top' },
      { x1: w, y1: 0, x2: w, y2: d, alphaB: surf.x1, type: 'ext', side: 'right' },
      { x1: w, y1: d, x2: 0, y2: d, alphaB: surf.y1, type: 'ext', side: 'bottom' },
      { x1: 0, y1: d, x2: 0, y2: 0, alphaB: surf.x0, type: 'ext', side: 'left' }
    ];
    var inner = [];
    (o.innerWalls || []).forEach(function (seg) {
      var x1 = num(seg.x1), y1 = num(seg.y1), x2 = num(seg.x2), y2 = num(seg.y2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return;
      if (x1 === x2 && y1 === y2) return;
      var aB = b6(seg.alpha) || ab;
      var g = {
        x1: clamp(x1, 0, w), y1: clamp(y1, 0, d), x2: clamp(x2, 0, w), y2: clamp(y2, 0, d),
        alphaB: aB, alpha: mean(aB), type: 'inner'
      };
      inner.push(g); walls.push(g);
    });

    var V = w * d * h;
    var S = 2 * (w * h) + 2 * (d * h) + 2 * (w * d);
    inner.forEach(function (g) { S += hypot(g.x2 - g.x1, g.y2 - g.y1) * h * 2; });

    var bands = [];
    for (var i = 0; i < NB; i++) {
      var A = d * h * (surf.x0[i] + surf.x1[i]) + w * h * (surf.y0[i] + surf.y1[i]) +
        w * d * (surf.z0[i] + surf.z1[i]);
      inner.forEach(function (g) { A += hypot(g.x2 - g.x1, g.y2 - g.y1) * h * 2 * g.alphaB[i]; });
      var aBar = S > 0 ? A / S : 0;
      var eyr = (aBar > 0 && aBar < 0.999) ? -S * Math.log(1 - aBar) : 0;
      var sabine = A > 0 ? 0.161 * V / A : null;
      var withAir = (eyr + 4 * AIR_ABS[i] * V) > 0 ? 0.161 * V / (eyr + 4 * AIR_ABS[i] * V) : null;
      bands.push({
        freq: BANDS[i], absorption: A, alpha: aBar,
        sabine: sabine, eyringAir: withAir,
        air: 4 * AIR_ABS[i] * V, meanFreePath: S > 0 ? 4 * V / S : null
      });
    }
    function mid(which) {
      var v = [bands[2][which], bands[3][which]];
      if (v[0] == null || v[1] == null) return null;
      return (v[0] + v[1]) / 2;
    }
    return {
      ok: true, bounds: { w: w, d: d }, height: h,
      walls: walls, innerWalls: inner, surf: surf,
      area: w * d, volume: V, surface: S,
      bands: bands,
      /* 兼容旧接口的标量（1 kHz / 中频均值） */
      absorption: bands[3].absorption, meanAlpha: bands[3].alpha,
      rt60: bands[3].sabine, rt60Eyring: bands[3].eyringAir,
      rt60Mid: mid('sabine'), rt60MidEyringAir: mid('eyringAir'),
      meanFreePath: bands[0].meanFreePath
    };
  }

  /* 余弦加权（Lambert）半球方向采样——表面散射用，ISO 17497-1 散射系数的实现方式 */
  function lambert(nx, ny, nz, rnd) {
    var ax, ay, az;
    if (Math.abs(nx) < 0.9) { ax = 1; ay = 0; az = 0; } else { ax = 0; ay = 1; az = 0; }
    var d = ax * nx + ay * ny + az * nz;
    var t1x = ax - d * nx, t1y = ay - d * ny, t1z = az - d * nz;
    var L1 = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z) || 1;
    t1x /= L1; t1y /= L1; t1z /= L1;
    var t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
    var u1 = rnd(), u2 = rnd();
    var ct = Math.sqrt(Math.max(0, 1 - u1)), st = Math.sqrt(u1), phi = 2 * Math.PI * u2;
    var cp = Math.cos(phi), sp = Math.sin(phi);
    return [
      ct * nx + st * (cp * t1x + sp * t2x),
      ct * ny + st * (cp * t1y + sp * t2y),
      ct * nz + st * (cp * t1z + sp * t2z)
    ];
  }

  /* 采样窗口自适应：至少覆盖 1.8 × 最长倍频带 Sabine 混响时间，否则混响尾巴被截掉 */
  function defaultWindowMs(model) {
    var rt = 0, i;
    if (model && model.bands) {
      for (i = 0; i < NB; i++) {
        var v = model.bands[i] && (model.bands[i].sabine || model.bands[i].eyringAir);
        if (v != null && v > rt) rt = v;
      }
    }
    if (!(rt > 0)) rt = 1;
    return clamp(rt * 1000 * 1.8, 400, 8000);
  }

  /* 射线与平面线段求交（内隔墙，竖直墙按平面 XY 处理） */
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
    return { t: t, nx: nx / L, ny: ny / L, alphaB: s.alphaB || null };
  }

  /* 确定性伪随机（保证同一 seed 结果可复现，便于回归测试） */
  function rngFactory(seed) {
    var s = (Math.round(num(seed)) || 1) | 0;
    if (s === 0) s = 1;
    s = s & 0x7fffffff;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /* ============ 三维盒式光线追踪 ============
   * 六个平面 + 可选竖向内隔墙；每点记录累计倍频带吸收乘积 cb 与路程 t，
   * 任意点的倍频带能量 = cb[k] · exp(-m_k · t)（含空气吸收）。
   *
   * 射线不做"能量低于阈值即丢弃"的硬截断——那会形成有偏抽样（被淘汰的恰是高反射
   * 次数、能量低的射线，存活集合衰减偏慢，T30 被系统性拉长近一倍）。
   * 这里改用蒙特卡洛标准的俄罗斯轮盘赌：低于 rrStart 后以 p 概率终止，
   * 存活者能量按 1/(1-p) 放大，期望守恒（无偏）且计算量可控。
   *
   * 另：纯镜面反射在矩形房内不遍历——近水平掠射的射线碰撞率远低于平均，
   * 长时间后慢衰减射线主导，衰减曲线越拖越平、T30 系统性偏长约一倍。
   * 故引入散射系数 scatter：以该概率按 Lambert 律漫反射，形成扩散场使衰减指数化。
   */
  function traceBox(model, opt) {
    opt = opt || {};
    if (!model || !model.ok) return { ok: false, error: '缺少有效房间模型' };
    var nRays = Math.max(1, Math.min(20000, Math.round(num(opt.nRays) || 1200)));
    var maxB = Math.max(1, Math.round(num(opt.maxBounces) || 800));
    var rrStart = num(opt.rrStart); if (rrStart == null) rrStart = 1e-3;   // -30 dB 之后进入轮盘赌
    var pKill = num(opt.pKill); if (pKill == null || pKill <= 0 || pKill >= 1) pKill = 0.5;
    var sc = num(opt.scatter); if (sc == null) sc = 0.35;
    sc = clamp(sc, 0, 1);
    var rnd = rngFactory(opt.seed == null ? 20240915 : opt.seed);
    var maxLen = num(opt.maxLength);
    if (maxLen == null) maxLen = (C_AIR * defaultWindowMs(model) / 1000) * 1.05;
    var w = model.bounds.w, d = model.bounds.d, h = model.height;
    var raw = opt.source || {};
    var sx = num(raw.x), sy = num(raw.y), sz = num(raw.z);
    if (sx == null) sx = w / 2;
    if (sy == null) sy = d / 2;
    if (sz == null) sz = Math.min(1.5, h * 0.5);
    var ex = w * 1e-4, ey = d * 1e-4, ez = h * 1e-4;
    var src = { x: clamp(sx, ex, w - ex), y: clamp(sy, ey, d - ey), z: clamp(sz, ez, h - ez) };
    var surf = model.surf, inner = model.innerWalls || [];
    var ga = Math.PI * (3 - Math.sqrt(5)), EPS = 1e-9;

    var rays = [], totalHits = 0, totalAbs = 0, maxLength = 0, aliveRays = 0;
    for (var i = 0; i < nRays; i++) {
      var zz = 1 - (2 * i + 1) / nRays;
      var rr = Math.sqrt(Math.max(0, 1 - zz * zz));
      var th = ga * i;
      var dx = Math.cos(th) * rr, dy = Math.sin(th) * rr, dz = zz;
      var px = src.x, py = src.y, pz = src.z;
      var cb = ones();
      var pts = [{ x: px, y: py, z: pz, t: 0, cb: cb.slice() }];
      var dist = 0, b = 0, alive = true;

      while (b < maxB && dist < maxLen) {
        var best = null, t;
        if (dx > EPS) { t = (w - px) / dx; if (t > EPS && (!best || t < best.t)) best = { t: t, axis: 'x', aB: surf.x1 }; }
        else if (dx < -EPS) { t = (0 - px) / dx; if (t > EPS && (!best || t < best.t)) best = { t: t, axis: 'x', aB: surf.x0 }; }
        if (dy > EPS) { t = (d - py) / dy; if (t > EPS && (!best || t < best.t)) best = { t: t, axis: 'y', aB: surf.y1 }; }
        else if (dy < -EPS) { t = (0 - py) / dy; if (t > EPS && (!best || t < best.t)) best = { t: t, axis: 'y', aB: surf.y0 }; }
        if (dz > EPS) { t = (h - pz) / dz; if (t > EPS && (!best || t < best.t)) best = { t: t, axis: 'z', aB: surf.z1 }; }
        else if (dz < -EPS) { t = (0 - pz) / dz; if (t > EPS && (!best || t < best.t)) best = { t: t, axis: 'z', aB: surf.z0 }; }
        for (var q = 0; q < inner.length; q++) {
          var hh = raySeg(px, py, dx, dy, inner[q]);
          if (hh && (!best || hh.t < best.t)) best = { t: hh.t, axis: 'i', aB: hh.alphaB, nx: hh.nx, ny: hh.ny };
        }
        if (!best) break;

        px += dx * best.t; py += dy * best.t; pz += dz * best.t; dist += best.t;
        /* 入射面内法线 */
        var nX = 0, nY = 0, nZ = 0, dot;
        if (best.axis === 'x') { nX = dx > 0 ? -1 : 1; }
        else if (best.axis === 'y') { nY = dy > 0 ? -1 : 1; }
        else if (best.axis === 'z') { nZ = dz > 0 ? -1 : 1; }
        else {
          nX = best.nx; nY = best.ny;
          if (nX * dx + nY * dy > 0) { nX = -nX; nY = -nY; }
        }
        if (sc > 0 && rnd() < sc) {
          var L = lambert(nX, nY, nZ, rnd);
          dx = L[0]; dy = L[1]; dz = L[2];
          /* 数值安全：确保方向仍在房间内有效 */
          if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(dz) < 1e-6) dz = nZ >= 0 ? 1 : -1;
        } else if (best.axis === 'x') dx = -dx;
        else if (best.axis === 'y') dy = -dy;
        else if (best.axis === 'z') dz = -dz;
        else {
          var nx = nX, ny = nY;
          dot = dx * nx + dy * ny;
          dx -= 2 * dot * nx; dy -= 2 * dot * ny;
        }
        for (var k = 0; k < NB; k++) cb[k] *= (1 - best.aB[k]);
        pts.push({ x: px, y: py, z: pz, t: dist, cb: cb.slice() });
        b++; totalHits++;
        /* 俄罗斯轮盘赌：期望守恒地淘汰低能射线 */
        if (mean(cb) < rrStart) {
          if (rnd() < pKill) { alive = false; break; }
          for (var k2 = 0; k2 < NB; k2++) cb[k2] /= (1 - pKill);
        }
      }
      totalAbs += (1 - mean(cb));
      if (alive) aliveRays++;
      if (dist > maxLength) maxLength = dist;
      rays.push({ pts: pts, length: dist });
    }
    return {
      ok: true, source: src, nRays: nRays, rays: rays, maxLength: maxLength,
      hits: totalHits / nRays, absorbed: totalAbs / nRays, aliveRatio: aliveRays / nRays
    };
  }

  /* ============ 网格采样：逐倍频带能量 + 逐格回波时程 ============
   * 每条射线携带固定能量；落入某格的量 ∝ 该射线在格内走过的长度（等步长采样即等价）。
   * 球面发散 1/r² 不显式加权——它由射线密度自然涌现（直射段射线随 r² 摊薄，
   * 扩散段射线在房间内近似均匀），显式再乘 1/r² 会把混响尾巴压掉使 T30 偏短。
   * 能量按到达时刻分箱，因此可由回波直接反算每格 EDT / T30（混响时间分布）。
   */
  function sampleGrid(model, rays, opt) {
    opt = opt || {};
    var gx = Math.max(4, Math.round(num(opt.gx) || 48));
    var gy = Math.max(4, Math.round(num(opt.gy) || 32));
    var c = num(opt.c) || C_AIR;
    var maxMs = num(opt.maxMs);
    if (maxMs == null) maxMs = defaultWindowMs(model);
    var binMs = num(opt.binMs) || (maxMs > 2500 ? 25 : 15);
    var nb = Math.max(4, Math.ceil(maxMs / binMs));
    var cw = model.bounds.w / gx, ch = model.bounds.d / gy;
    var n = gx * gy, cells = new Array(n), i;
    for (i = 0; i < n; i++) {
      cells[i] = {
        E: new Float32Array(NB), E50: new Float32Array(NB), E80: new Float32Array(NB),
        Et: new Float32Array(NB), H: new Float32Array(NB * nb)
      };
    }
    var step = Math.max(cw, ch) * 0.5;
    var fDecay = new Float64Array(NB), eStart = new Float64Array(NB);

    (rays || []).forEach(function (ray) {
      var p = ray.pts;
      for (var j = 0; j < p.length - 1; j++) {
        var A = p[j], B = p[j + 1];
        var ddx = B.x - A.x, ddy = B.y - A.y, ddz = B.z - A.z;
        var len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (len <= 0) continue;
        var st = Math.max(1, Math.round(len / step));
        var ds = len / st, k;
        for (k = 0; k < NB; k++) {
          eStart[k] = A.cb[k] * Math.exp(-AIR_ABS[k] * A.t);
          fDecay[k] = Math.exp(-AIR_ABS[k] * ds);
        }
        var e = new Float64Array(NB);
        for (k = 0; k < NB; k++) e[k] = eStart[k];
        for (var s = 0; s <= st; s++) {
          if (s > 0) for (k = 0; k < NB; k++) e[k] *= fDecay[k];
          var fr = s / st;
          var xx = A.x + ddx * fr, yy = A.y + ddy * fr;
          var r = A.t + len * fr;
          var tt = r / c;
          var ix = Math.floor(xx / cw), iy = Math.floor(yy / ch);
          if (ix < 0 || ix >= gx || iy < 0 || iy >= gy) continue;
          var cell = cells[iy * gx + ix];
          var bin = Math.floor(tt * 1000 / binMs);
          /* 超出窗口的样本直接丢弃——若钳进末箱会把长尾能量堆成末端尖峰，令反向积分严重偏长 */
          if (bin < 0 || bin >= nb) continue;
          for (k = 0; k < NB; k++) {
            var en = e[k];
            cell.E[k] += en;
            if (tt <= 0.05) cell.E50[k] += en;
            if (tt <= 0.08) cell.E80[k] += en;
            cell.Et[k] += en * tt;
            cell.H[k * nb + bin] += en;
          }
        }
      }
    });
    var grid = { gx: gx, gy: gy, cw: cw, ch: ch, binMs: binMs, maxMs: maxMs, nb: nb, cells: cells };
    var sp = Math.round(num(opt.smooth));
    if (isNaN(sp)) sp = 1;
    if (sp > 0) smoothGrid(grid, sp);
    return grid;
  }

  /* 3×3 空间平滑：抑制有限射线数带来的格子方差（等效于对相邻测点做空间平均） */
  function smoothGrid(grid, passes) {
    var gx = grid.gx, gy = grid.gy, nb = grid.nb, n = gx * gy, NBk = NB;
    for (var p = 0; p < passes; p++) {
      var src = [];
      var i, k;
      for (i = 0; i < n; i++) {
        src.push({
          E: grid.cells[i].E.slice(), E50: grid.cells[i].E50.slice(), E80: grid.cells[i].E80.slice(),
          Et: grid.cells[i].Et.slice(), H: grid.cells[i].H.slice()
        });
      }
      for (var iy = 0; iy < gy; iy++) {
        for (var ix = 0; ix < gx; ix++) {
          var idx = iy * gx + ix, dst = grid.cells[idx];
          for (k = 0; k < NBk; k++) {
            dst.E[k] = 0; dst.E50[k] = 0; dst.E80[k] = 0; dst.Et[k] = 0;
          }
          dst.H.fill(0);
          var cnt = 0;
          for (var dy = -1; dy <= 1; dy++) {
            var jy = iy + dy;
            if (jy < 0 || jy >= gy) continue;
            for (var dx = -1; dx <= 1; dx++) {
              var jx = ix + dx;
              if (jx < 0 || jx >= gx) continue;
              var s = src[jy * gx + jx];
              cnt++;
              for (k = 0; k < NBk; k++) {
                dst.E[k] += s.E[k]; dst.E50[k] += s.E50[k]; dst.E80[k] += s.E80[k]; dst.Et[k] += s.Et[k];
              }
              var b;
              for (k = 0; k < NBk; k++) {
                var o1 = k * nb, o2 = k * nb;
                for (b = 0; b < nb; b++) dst.H[o1 + b] += s.H[o2 + b];
              }
            }
          }
          if (cnt > 0) {
            for (k = 0; k < NBk; k++) { dst.E[k] /= cnt; dst.E50[k] /= cnt; dst.E80[k] /= cnt; dst.Et[k] /= cnt; }
            for (b = 0; b < dst.H.length; b++) dst.H[b] /= cnt;
          }
        }
      }
    }
    return grid;
  }

  /* ============ 逐格逐频段指标 ============ */
  function gridMetrics(grid) {
    var n = grid.gx * grid.gy, out = new Array(n), i, k;
    var maxE = new Float64Array(NB);
    for (i = 0; i < n; i++) {
      for (k = 0; k < NB; k++) if (grid.cells[i].E[k] > maxE[k]) maxE[k] = grid.cells[i].E[k];
    }
    for (i = 0; i < n; i++) {
      var c = grid.cells[i];
      if (!(c.E[3] > 0) && !(c.E[2] > 0)) { out[i] = null; continue; }
      var m = { E: [], L: [], C50: [], C80: [], D50: [], Ts: [], EDT: [], T30: [] };
      for (k = 0; k < NB; k++) {
        var E = c.E[k];
        if (!(E > 0)) {
          m.E.push(0); m.L.push(null); m.C50.push(null); m.C80.push(null); m.D50.push(null); m.Ts.push(null); m.EDT.push(null); m.T30.push(null);
          continue;
        }
        var late50 = E - c.E50[k], late80 = E - c.E80[k];
        m.E.push(E);
        m.L.push(maxE[k] > 0 ? 10 * Math.log10(E / maxE[k]) : null);
        m.C50.push(late50 > 0 ? 10 * Math.log10(c.E50[k] / late50) : (c.E50[k] > 0 ? 60 : null));
        m.C80.push(late80 > 0 ? 10 * Math.log10(c.E80[k] / late80) : (c.E80[k] > 0 ? 60 : null));
        m.D50.push(c.E50[k] / E);
        m.Ts.push(c.Et[k] / E * 1000);
        var rt = rtFromSchroeder(c.H.subarray(k * grid.nb, (k + 1) * grid.nb), grid.binMs);
        m.EDT.push(rt.edt); m.T30.push(rt.t30);
      }
      out[i] = m;
    }
    return { gx: grid.gx, gy: grid.gy, cw: grid.cw, ch: grid.ch, nb: grid.nb, binMs: grid.binMs, maxE: maxE, metrics: out };
  }

  /* 取倍频带数值：band >= 0 取该带；band < 0 取中频（500 Hz + 1 kHz）均值 */
  function bandValue(arr, band) {
    if (!arr) return null;
    if (band == null) band = 3;
    if (band >= 0) return arr[band];
    var a = arr[2], b = arr[3];
    if (a == null || b == null) return null;
    return (a + b) / 2;
  }
  function maxEAt(gm, band) { return bandValue(gm.maxE, band) || 0; }

  /* 指标有效范围（按分位裁剪，剔除离群格） */
  function metricRange(gm, key, opt) {
    opt = opt || {};
    var band = opt.band == null ? 3 : opt.band;
    var thresh = opt.minE == null ? maxEAt(gm, band) * 0.01 : opt.minE;
    var vals = [];
    gm.metrics.forEach(function (m) {
      if (!m || !m[key]) return;
      var v = bandValue(m[key], band);
      if (bandValue(m.E, band) >= thresh && v != null && isFinite(v)) vals.push(v);
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

  /* 取任意平面点所在网格格的指标值 */
  function metricAtCell(gm, model, pt, key, band) {
    if (!gm || !model || !pt || !model.bounds) return null;
    if (band == null) band = 3;
    var bw = model.bounds.w, bd = model.bounds.d;
    if (!(bw > 0) || !(bd > 0)) return null;
    var ix = clamp(Math.floor(pt.x / bw * gm.gx), 0, gm.gx - 1);
    var iy = clamp(Math.floor(pt.y / bd * gm.gy), 0, gm.gy - 1);
    var m = gm.metrics[iy * gm.gx + ix];
    if (!m || !m[key]) return null;
    var v = bandValue(m[key], band);
    return (v == null || !isFinite(v)) ? null : v;
  }

  /* 该指标在该频带上、全场的空间均值（用于与 Sabine/Eyring 对照） */
  function metricMean(gm, key, opt) {
    opt = opt || {};
    var band = opt.band == null ? 3 : opt.band;
    var thresh = opt.minE == null ? maxEAt(gm, band) * 0.01 : opt.minE;
    var sum = 0, n = 0;
    gm.metrics.forEach(function (m) {
      if (!m || !m[key]) return;
      var v = bandValue(m[key], band);
      if (bandValue(m.E, band) >= thresh && v != null && isFinite(v)) { sum += v; n++; }
    });
    return n ? sum / n : null;
  }

  /* ============ 接收点回波（逐倍频带） ============ */
  function receiverBands(rays, receiver, opt) {
    opt = opt || {};
    var radius = num(opt.radius); if (radius == null || radius <= 0) radius = 0.7;
    var c = num(opt.c) || C_AIR;
    var maxMs = num(opt.maxMs);
    if (maxMs == null) maxMs = defaultWindowMs(opt.model);
    var binMs = num(opt.binMs) || (maxMs > 2500 ? 20 : 10);
    var nb = Math.max(1, Math.ceil(maxMs / binMs));
    var rx = receiver.x, ry = receiver.y, rz = num(receiver.z); if (rz == null) rz = 1.2;
    var bins = new Float32Array(NB * nb);
    var r2 = radius * radius;

    (rays || []).forEach(function (ray) {
      var p = ray.pts;
      for (var j = 0; j < p.length - 1; j++) {
        var A = p[j], B = p[j + 1];
        var vx = B.x - A.x, vy = B.y - A.y, vz = B.z - A.z;
        var L2 = vx * vx + vy * vy + vz * vz;
        var tp = L2 > 0 ? ((rx - A.x) * vx + (ry - A.y) * vy + (rz - A.z) * vz) / L2 : 0;
        tp = tp < 0 ? 0 : (tp > 1 ? 1 : tp);
        var cx = A.x + vx * tp, cy = A.y + vy * tp, cz = A.z + vz * tp;
        var dist = Math.sqrt((rx - cx) * (rx - cx) + (ry - cy) * (ry - cy) + (rz - cz) * (rz - cz));
        if (dist >= radius) continue;
        var path = A.t + Math.sqrt(L2) * tp;
        var ms = path / c * 1000;
        var bi = Math.floor(ms / binMs);
        if (bi < 0 || bi >= nb) continue;
        /* 探测球内弦长作为接收权重（∝ 射线在球内走过的长度），不再显式除以 r² */
        var chord = 2 * Math.sqrt(Math.max(0, r2 - dist * dist));
        for (var k = 0; k < NB; k++) {
          bins[k * nb + bi] += A.cb[k] * Math.exp(-AIR_ABS[k] * path) * chord;
        }
      }
    });
    return { binMs: binMs, maxMs: maxMs, nb: nb, bins: bins };
  }

  /* Schroeder 反向积分 → EDT / T20 / T30
   * 含截断补偿：回波只记录到 maxMs，缺失的尾部能量会让衰减曲线末端被"拉陡"使 RT 偏短。
   * 这里按 Lundeby 思路估计截断之外的残余能量 C（尾部能量速率 ÷ 衰减率 Np/s），
   * 代回 s[i] + C 后重新归一化，迭代两次收敛。
   */
  function rtFromSchroeder(bins, binMs) {
    var n = bins && bins.length;
    if (!n) return { ok: false };
    binMs = binMs || 10;
    var binSec = binMs / 1000;
    var s = new Float64Array(n), acc = 0, i;
    for (i = n - 1; i >= 0; i--) { acc += bins[i]; s[i] = acc; }
    if (!(s[0] > 0)) return { ok: false };

    function curve(C) {
      var t = [], db = [], k;
      for (k = 0; k < n; k++) {
        var v = s[k] + C;
        if (!(v > 0)) break;
        t.push((k + 0.5) * binSec);
        db.push(10 * Math.log10(v / (s[0] + C)));
      }
      return { t: t, db: db };
    }
    function slope(cv, fromDb, toDb) {
      var xs = [], ys = [], k;
      for (k = 0; k < cv.db.length; k++) if (cv.db[k] <= fromDb && cv.db[k] >= toDb) { xs.push(cv.t[k]); ys.push(cv.db[k]); }
      if (xs.length < 2) return null;
      var N = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (var q = 0; q < N; q++) { sx += xs[q]; sy += ys[q]; sxx += xs[q] * xs[q]; sxy += xs[q] * ys[q]; }
      var den = N * sxx - sx * sx;
      if (Math.abs(den) < 1e-12) return null;
      return (N * sxy - sx * sy) / den;
    }
    function pick(cv) { return slope(cv, -5, -35) || slope(cv, -5, -25) || slope(cv, -1, -15) || slope(cv, -1, -10); }

    var C = 0;
    for (var pass = 0; pass < 2; pass++) {
      var a = pick(curve(C));
      if (a == null || !(a < 0)) break;
      var tailN = Math.max(1, Math.round(n * 0.1));
      var tailSum = 0;
      for (i = n - tailN; i < n; i++) tailSum += bins[i];
      var rate = (tailSum / tailN) / binSec;            // 尾部能量速率（每秒）
      var lambda = (-a / 10) * Math.LN10;               // 衰减率 Np/s
      var cn = (rate > 0 && lambda > 0) ? rate / lambda : 0;
      if (!(cn > 0) || !isFinite(cn)) break;
      cn = Math.min(cn, s[0]);                          // 残余不得大于总能量
      C = cn;
    }

    var cv = curve(C);
    function rt(a) { return a == null || a >= 0 ? null : (-60 / a); }
    return {
      ok: true, tail: C,
      edt: rt(slope(cv, -0.1, -10)), t20: rt(slope(cv, -5, -25)), t30: rt(slope(cv, -5, -35))
    };
  }

  /* 由逐倍频带回波求 ISO 3382 参量 */
  function isoFromEchogram(res, band) {
    if (!res || !res.bins || !res.nb) return { ok: false };
    if (band == null) band = 3;
    var nb = res.nb, binMs = res.binMs || 10, off = band * nb;
    var Etot = 0, E50 = 0, E80 = 0, Et = 0;
    for (var i = 0; i < nb; i++) {
      var tt = (i + 0.5) * binMs / 1000, en = res.bins[off + i];
      Etot += en;
      if (tt <= 0.05) E50 += en;
      if (tt <= 0.08) E80 += en;
      Et += en * tt;
    }
    if (!(Etot > 0)) return { ok: false };
    var rt = rtFromSchroeder(res.bins.subarray(off, off + nb), binMs);
    return {
      ok: true, Etot: Etot,
      c50: (Etot - E50) > 0 ? 10 * Math.log10(E50 / (Etot - E50)) : (E50 > 0 ? 60 : null),
      c80: (Etot - E80) > 0 ? 10 * Math.log10(E80 / (Etot - E80)) : (E80 > 0 ? 60 : null),
      d50: E50 / Etot,
      ts: Et / Etot * 1000,
      edt: rt.edt, t20: rt.t20, t30: rt.t30
    };
  }

  /* ============ 轴测投影（3D 视图 → 2D 画布） ============ */
  var CAM_DEFAULT = { yaw: 0.62, elev: 0.44 };

  function isoProject(x, y, z, cam) {
    var ca = cam.ca != null ? cam.ca : Math.cos(cam.yaw);
    var sa = cam.sa != null ? cam.sa : Math.sin(cam.yaw);
    var se = cam.se != null ? cam.se : Math.sin(cam.elev);
    var ce = cam.ce != null ? cam.ce : Math.cos(cam.elev);
    var X = x * ca - y * sa, Y = x * sa + y * ca;
    return { u: cam.ox + X * cam.scale, v: cam.oy + (Y * se - z * ce) * cam.scale, depth: Y * ce + z * se };
  }

  function isoFit(o) {
    o = o || {};
    var w = num(o.w) || 10, d = num(o.d) || 8, h = num(o.h) || 3;
    var view = o.view || { x: 0, y: 0, w: 800, h: 400 };
    var m = num(o.margin); if (m == null) m = 16;
    var cam = { yaw: num(o.yaw), elev: num(o.elev), scale: 1, ox: 0, oy: 0 };
    if (cam.yaw == null) cam.yaw = CAM_DEFAULT.yaw;
    if (cam.elev == null) cam.elev = CAM_DEFAULT.elev;
    cam.elev = clamp(cam.elev, 0.05, 1.45);
    cam.ca = Math.cos(cam.yaw); cam.sa = Math.sin(cam.yaw);
    cam.se = Math.sin(cam.elev); cam.ce = Math.cos(cam.elev);
    var minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    [0, w].forEach(function (x) {
      [0, d].forEach(function (y) {
        [0, h].forEach(function (z) {
          var p = isoProject(x, y, z, cam);
          if (p.u < minU) minU = p.u;
          if (p.u > maxU) maxU = p.u;
          if (p.v < minV) minV = p.v;
          if (p.v > maxV) maxV = p.v;
        });
      });
    });
    var sw = Math.max(1e-6, maxU - minU), sh = Math.max(1e-6, maxV - minV);
    cam.scale = Math.max(1e-6, Math.min((view.w - 2 * m) / sw, (view.h - 2 * m) / sh));
    cam.ox = view.x + (view.w - sw * cam.scale) / 2 - minU * cam.scale;
    cam.oy = view.y + (view.h - sh * cam.scale) / 2 - minV * cam.scale;
    return cam;
  }

  /* ============ 色标刻度 ============ */
  function niceStep(range, n) {
    var raw = Math.abs(num(range) || 0) / Math.max(1, Math.round(num(n) || 5));
    if (!(raw > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / mag, s;
    if (f <= 1) s = 1; else if (f <= 2) s = 2; else if (f <= 2.5) s = 2.5; else if (f <= 5) s = 5; else s = 10;
    return s * mag;
  }
  function niceRange(lo, hi, n) {
    lo = num(lo); hi = num(hi);
    if (lo == null || hi == null) return null;
    if (!(hi > lo)) { var mid = lo; lo = mid - 0.5; hi = mid + 0.5; }
    var step = niceStep(hi - lo, n);
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    if (!(b > a)) b = a + step;
    return [a, b, step];
  }
  function scaleTicks(lo, hi, n) {
    lo = num(lo); hi = num(hi);
    if (lo == null || hi == null || !(hi > lo)) return [];
    n = Math.max(1, Math.round(num(n) || 5));
    var out = [];
    for (var i = 0; i <= n; i++) {
      var f = 1 - i / n;
      out.push({ frac: f, value: lo + (hi - lo) * f, edge: (i === 0 ? 'hi' : (i === n ? 'lo' : null)) });
    }
    return out;
  }

  var API = {
    C_AIR: C_AIR, BANDS: BANDS, NB: NB, AIR_ABS: AIR_ABS, CAM_DEFAULT: CAM_DEFAULT,
    b6: b6, buildRoom: buildRoom, raySeg: raySeg, traceBox: traceBox, lambert: lambert,
    sampleGrid: sampleGrid, smoothGrid: smoothGrid, gridMetrics: gridMetrics, metricRange: metricRange,
    metricAtCell: metricAtCell, metricMean: metricMean, bandValue: bandValue,
    defaultWindowMs: defaultWindowMs, receiverBands: receiverBands,
    rtFromSchroeder: rtFromSchroeder, isoFromEchogram: isoFromEchogram,
    isoProject: isoProject, isoFit: isoFit,
    niceStep: niceStep, niceRange: niceRange, scaleTicks: scaleTicks
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.RoomSim = API;
})(typeof window !== 'undefined' ? window : this);
