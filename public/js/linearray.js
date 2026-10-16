/*
 * linearray.js — 线阵列覆盖与垂直指向性（#/linearray）
 * 内核（UMD）：浏览器挂 window.LineArray，Node 可 require。
 *
 * 角度约定
 *   指向性角 θ：以阵列法线（水平正前方）为 0，**向上为正、向下为负**，单位 deg。
 *   俯角 φ：现场习惯的「向下为正」，与上式符号相反，φ = −θ。
 *
 * 主要公式
 *   阵列因子（等间距离散线阵，逐元相位 ψ = k·d·sinθ + ψ₀）
 *       |AF| = | Σ aₙ·e^{j n ψ} | / Σ|aₙ|      ψ₀ = −k·d·sin(θ_steer)
 *   栅瓣（在 ±θmax 内不出现栅瓣的频率上限）
 *       f_max = c / ( d·(1 + sin θmax) )      全空间 ±90° → c/(2d)（即 d < λ/2）
 *   近场 / 远场过渡（阵列末端与中心到观测点的路程差判据）
 *       路程差 = λ/4 → r₁ = L²/(2λ)（柱面波 −3 dB/倍程区的边界）
 *       路程差 = λ/8 → r₂ = L²/λ  （此后按球面波 −6 dB/倍程）
 *   声压随距离
 *       Lp(r) = Lp(r₀) − 10·n·lg(r/r₀) − α·(r−r₀)   n = 1 柱面 / 2 球面
 *   阵列叠加增益
 *       相干（低频，波长远大于间距）+20 lg N；非相干（高频）+10 lg N
 *   梳状滤波陷波（两源间距 d，偏角 θ，路程差 Δ = d·sin|θ|）
 *       f_m = (2m+1)·c / (2·d·sin|θ|)      m = 0,1,2…
 *       反解最大可用间距 d_max = c / (2·f_max·sin|θ|)
 *   覆盖几何（阵列中心高 h_c，近/远端水平距离 D₁/D₂）
 *       φ_近 = atan(h_c/D₁)、φ_远 = atan(h_c/D₂)、总张角 Σ = φ_近 − φ_远
 *       每节张角 = Σ/(N−1)；需要箱体数 N ≈ 1 + Σ/单节最大张角
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LineArray = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C0 = 343;              // m/s，20 ℃ 空气
  var DEG = Math.PI / 180;

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function db20(x) { return 20 * Math.log10(Math.max(x, 1e-12)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 1) 幅度锥化 ---------------- */
  /**
   * 生成 N 个单元的幅度加权。
   * kind: 'uniform' 均匀 | 'cosine' 升余弦（端部 -floorDb）| 'linear' 线性锥化
   */
  function taper(N, kind, floorDb) {
    N = Math.max(1, Math.round(num(N, 1)));
    var f = num(floorDb, -12);
    var k = clamp(Math.pow(10, f / 20), 1e-4, 1);
    var out = [];
    for (var i = 0; i < N; i++) {
      var u = N > 1 ? i / (N - 1) : 0;     // 0 → 阵列一端，1 → 另一端
      var w = 1;
      if (kind === 'cosine') w = k + (1 - k) * Math.sin(Math.PI * u);
      else if (kind === 'linear') w = k + (1 - k) * (1 - Math.abs(2 * u - 1));
      out.push(w);
    }
    return out;
  }

  /* ---------------- 2) 阵列因子 ---------------- */
  /**
   * @param o {N,d,f,c,steer,taper}
   *   N 单元数；d 单元间距 m；f 频率 Hz；steer 主瓣偏转（向上为正 deg）；taper 幅度数组
   * @return {at(thetaDeg)->0..1, db(thetaDeg)->dB, ...}
   */
  function arrayFactor(o) {
    o = o || {};
    var N = Math.max(1, Math.round(num(o.N, 1)));
    var d = num(o.d, 0);
    var f = num(o.f, 1000);
    var c = num(o.c, C0);
    var steer = num(o.steer, 0) * DEG;
    var amp = o.taper || null;

    var k = 2 * Math.PI * f / c;
    var psi0 = -k * d * Math.sin(steer);
    var a = [], norm = 0, i;
    for (i = 0; i < N; i++) {
      var w = (amp && amp[i] != null && isFinite(amp[i])) ? Math.abs(amp[i]) : 1;
      a.push(w); norm += w;
    }
    if (norm <= 0) { norm = 1; for (i = 0; i < N; i++) a[i] = 1; }

    function at(thetaDeg) {
      var psi = k * d * Math.sin(num(thetaDeg, 0) * DEG) + psi0;
      var re = 0, im = 0;
      for (var n = 0; n < N; n++) {
        var ph = n * psi;
        re += a[n] * Math.cos(ph);
        im += a[n] * Math.sin(ph);
      }
      return Math.sqrt(re * re + im * im) / norm;
    }
    return {
      N: N, d: d, f: f, c: c, steer: steer / DEG, taper: a.slice(), norm: norm,
      wavelength: f > 0 ? c / f : null,
      at: at,
      db: function (t) { return db20(at(t)); }
    };
  }

  /** 指向性扫描：返回 [{theta, db}] */
  function directivity(o, range) {
    var af = (o && typeof o.db === 'function') ? o : arrayFactor(o);
    var lo = num(range && range.from, -90), hi = num(range && range.to, 90);
    var step = num(range && range.step, 0.5);
    if (hi < lo) { var t = lo; lo = hi; hi = t; }
    step = Math.abs(step) || 0.5;
    var out = [];
    for (var t2 = lo; t2 <= hi + 1e-9; t2 += step) out.push({ theta: t2, db: af.db(t2) });
    return out;
  }

  /**
   * 波瓣统计：主瓣指向、−6 dB 波束宽、第一零点、第一旁瓣电平（相对主瓣 dB）。
   */
  function lobeStats(o) {
    var af = (o && typeof o.db === 'function') ? o : arrayFactor(o);
    var lo = num(o.from, -90), hi = num(o.to, 90);
    var pts = directivity(af, { from: lo, to: hi, step: 0.05 });
    if (!pts.length) return null;

    var mi = 0, i;
    for (i = 1; i < pts.length; i++) if (pts[i].db > pts[mi].db) mi = i;
    var peak = pts[mi].db, peakDeg = pts[mi].theta;

    function walk(dir, stop) {
      var j = mi;
      while (j + dir >= 0 && j + dir < pts.length) {
        var prev = pts[j], cur = pts[j + dir];
        if (stop(prev, cur)) {
          var den = (prev.db - cur.db) || 1e-9;
          var f2 = (prev.db - (stop.thr != null ? stop.thr : prev.db)) / den;
          if (stop.thr == null) return { theta: prev.theta, exact: false };
          return { theta: prev.theta + (cur.theta - prev.theta) * f2, exact: true };
        }
        j += dir;
      }
      var end = pts[dir < 0 ? 0 : pts.length - 1];
      return { theta: end.theta, exact: false };
    }
    var stop6 = function (p, c) { return c.db <= peak - 6; }; stop6.thr = peak - 6;
    var stopN = function (p, c) { return c.db > p.db; };   // 下降到谷底后回升 → 零点

    var eLo = walk(-1, stop6), eHi = walk(1, stop6);
    var nLo = walk(-1, stopN), nHi = walk(1, stopN);

    var side = null;
    for (i = 1; i < pts.length - 1; i++) {
      var th = pts[i].theta;
      if (th > nLo.theta && th < nHi.theta) continue;       // 主瓣内部跳过
      if (pts[i].db >= pts[i - 1].db && pts[i].db >= pts[i + 1].db) {
        if (!side || pts[i].db > side.db) side = { theta: th, db: pts[i].db };
      }
    }
    return {
      peakDeg: peakDeg,
      peakDb: peak,
      beamwidth6: Math.abs(eHi.theta - eLo.theta),
      edgeLow: Math.min(eLo.theta, eHi.theta),
      edgeHigh: Math.max(eLo.theta, eHi.theta),
      nullLow: Math.min(nLo.theta, nHi.theta),
      nullHigh: Math.max(nLo.theta, nHi.theta),
      sidelobe: side ? { theta: side.theta, db: side.db, rel: side.db - peak } : null,
      curve: directivity(af, { from: lo, to: hi, step: 1 })
    };
  }

  /* ---------------- 3) 栅瓣与间距 ---------------- */
  /** 在 ±thetaMax（deg）内不出现栅瓣的最高频率；θmax=90° → c/(2d) */
  function gratingLimit(o) {
    var d = num(o.d, 0), c = num(o.c, C0), tm = Math.abs(num(o.thetaMax, 90));
    if (d <= 0) return null;
    return c / (d * (1 + Math.sin(clamp(tm, 0, 90) * DEG)));
  }
  /** 给定最高工作频率与最大偏角，允许的最大单元间距 d = c/(f·(1+sinθ)) */
  function maxSpacing(o) {
    var f = num(o.f, 0), c = num(o.c, C0), tm = Math.abs(num(o.thetaMax, 90));
    if (f <= 0) return null;
    return c / (f * (1 + Math.sin(clamp(tm, 0, 90) * DEG)));
  }
  /** 相邻单元电子偏转所需延时（ms） */
  function steerDelay(o) {
    var d = num(o.d, 0), c = num(o.c, C0), st = num(o.steer, 0);
    return Math.abs(d * Math.sin(st * DEG) / c) * 1000;
  }

  /* ---------------- 4) 近场 / 远场与衰减 ---------------- */
  /**
   * 过渡距离：rCyl = L²/(2λ)（路程差 λ/4），rSph = L²/λ（路程差 λ/8）
   */
  function nearFar(o) {
    var L = num(o.L, 0), f = num(o.f, 0), c = num(o.c, C0);
    if (L <= 0 || f <= 0) return null;
    var lam = c / f;
    return {
      L: L, f: f, wavelength: lam,
      rCyl: L * L / (2 * lam),
      rSph: L * L / lam,
      note: 'r < rCyl 柱面波 −3 dB/倍程；rCyl~rSph 过渡；r > rSph 球面波 −6 dB/倍程'
    };
  }
  /** 单点声压：mode 'cyl' | 'sph'，alpha 为可选空气吸收 dB/m */
  function splAt(o) {
    var ref = num(o.splRef, 0), r0 = num(o.rRef, 1), r = num(o.r, 1);
    var mode = String(o.mode || 'sph').toLowerCase();
    var alpha = num(o.alpha, 0);
    if (r <= 0 || r0 <= 0) return null;
    var n = mode === 'cyl' ? 1 : 2;
    return ref - 10 * n * Math.log10(r / r0) - alpha * Math.max(0, r - r0);
  }
  /** 声压—距离曲线（对数横轴） */
  function splCurve(o) {
    var r0 = num(o.rFrom, 1), r1 = num(o.rTo, 100), n = Math.max(2, Math.round(num(o.n, 60)));
    if (r0 <= 0) r0 = 1;
    if (r1 <= r0) r1 = r0 * 10;
    var cyl = [], sph = [], xs = [];
    for (var i = 0; i <= n; i++) {
      var r = r0 * Math.pow(r1 / r0, i / n);
      xs.push(r);
      cyl.push(splAt({ splRef: o.splRef, rRef: o.rRef, r: r, mode: 'cyl', alpha: o.alpha }));
      sph.push(splAt({ splRef: o.splRef, rRef: o.rRef, r: r, mode: 'sph', alpha: o.alpha }));
    }
    return { r: xs, cyl: cyl, sph: sph };
  }
  /** 阵列叠加增益：相干 +20lgN / 非相干 +10lgN */
  function arrayGain(N) {
    N = Math.max(1, Math.round(num(N, 1)));
    return { N: N, coherent: 20 * Math.log10(N), incoherent: 10 * Math.log10(N) };
  }

  /* ---------------- 5) 覆盖几何 ---------------- */
  /**
   * 由吊挂高度与近/远端距离求需要的覆盖角与阵列规模。
   * @param o {hBottom, arrayLen, dNear, dFar, boxCoverage, splayMax}
   *   hBottom 阵列**最低点**相对听众耳高的高度 m
   */
  function coverageGeometry(o) {
    var hb = num(o.hBottom, 0);
    var L = num(o.arrayLen, 0);
    var dn = num(o.dNear, 0), df = num(o.dFar, 0);
    if (hb <= 0 || dn <= 0 || df <= 0) return null;
    var near = Math.min(dn, df), far = Math.max(dn, df);
    var hc = hb + L / 2;
    var phiNear = Math.atan(hc / near) / DEG;
    var phiFar = Math.atan(hc / far) / DEG;
    var spread = phiNear - phiFar;                 // 需要张开的俯角跨度（deg）
    var boxCov = Math.max(0, num(o.boxCoverage, 0));
    var N = Math.max(1, Math.round(num(o.N, 1)));
    var perJoint = N > 1 ? spread / (N - 1) : 0;
    var splayMax = num(o.splayMax, 0);
    var need = null;
    if (splayMax > 0) need = Math.max(1, Math.ceil(spread / splayMax) + 1);
    return {
      hBottom: hb, arrayLen: L, hCenter: hc,
      dNear: near, dFar: far,
      phiNear: phiNear, phiFar: phiFar,
      spread: spread,
      boxCoverage: boxCov,
      totalCoverage: spread + boxCov,   // 阵列整体垂直覆盖角
      splayTotal: spread,
      splayPerJoint: perJoint,
      boxesForMaxSplay: need,
      distanceRatio: far / near,
      spreadDbCyl: 10 * Math.log10(far / near),    // 柱面（近场）近远声压差
      spreadDbSph: 20 * Math.log10(far / near)     // 球面（远场）近远声压差
    };
  }

  /**
   * 逐箱张角与瞄准角（俯角，向下为正）。box 0 = 最上方箱体（打最远）。
   * q > 1 → 自下而上张角递减，即底部大张角、顶部小张角的 J 形曲率。
   */
  function splayPlan(o) {
    var N = Math.max(1, Math.round(num(o.N, 1)));
    var pN = num(o.phiNear, 0), pF = num(o.phiFar, 0);
    var q = num(o.q, 1); if (!(q > 0)) q = 1;
    var hb = num(o.hBottom, 0), bh = num(o.boxH, 0);
    var total = pN - pF;
    var w = [], sum = 0, i;
    for (i = 0; i < N; i++) { var v = Math.pow(q, i); w.push(v); sum += v; }
    var sec = w.map(function (v) { return total * v / sum; });

    var boxes = [], aim = pF + sec[0] / 2;
    for (i = 0; i < N; i++) {
      if (i > 0) aim = aim + (sec[i - 1] + sec[i]) / 2;
      var h = hb + (N - 0.5 - i) * bh;
      var dist = (aim > 0.01 && h > 0) ? h / Math.tan(aim * DEG) : null;
      boxes.push({
        index: i + 1,
        fromTop: i + 1,
        aim: aim,
        sector: sec[i],
        splay: i > 0 ? (sec[i - 1] + sec[i]) / 2 : null,   // 与上一箱之间的张角
        height: h,
        distance: dist
      });
    }
    return {
      N: N, phiFar: pF, phiNear: pN, q: q, total: total,
      splayMin: N > 1 ? Math.min.apply(null, boxes.slice(1).map(function (b) { return b.splay; })) : 0,
      splayMax: N > 1 ? Math.max.apply(null, boxes.slice(1).map(function (b) { return b.splay; })) : 0,
      boxes: boxes
    };
  }

  /* ---------------- 6) 梳状滤波 ---------------- */
  /** 陷波频率序列：f_m = (2m+1)·c/(2·d·sin|θ|) */
  function comb(o) {
    var d = num(o.d, 0), th = num(o.theta, 0), c = num(o.c, C0);
    var n = Math.max(1, Math.round(num(o.n, 3)));
    if (d <= 0) return null;
    var s = Math.abs(Math.sin(th * DEG));
    if (s < 1e-6) return null;                    // 正对时路程差为 0，不产生梳状
    var out = [];
    for (var m = 0; m < n; m++) out.push((2 * m + 1) * c / (2 * d * s));
    // spacing：相邻陷波之间的频率间隔 = c/(d·sinθ) = 2·f₀
    return { d: d, theta: th, pathDiff: d * s, freqs: out, spacing: c / (d * s) };
  }
  /** 不产生带内梳状的最大间距：d_max = c/(2·f_max·sin|θ|) */
  function combSpacing(o) {
    var f = num(o.f, 0), th = num(o.theta, 0), c = num(o.c, C0);
    if (f <= 0) return null;
    var s = Math.abs(Math.sin(th * DEG));
    if (s < 1e-6) return null;
    return { f: f, theta: th, dMax: c / (2 * f * s) };
  }

  return {
    C0: C0, DEG: DEG,
    num: num, db20: db20,
    taper: taper,
    arrayFactor: arrayFactor,
    directivity: directivity,
    lobeStats: lobeStats,
    gratingLimit: gratingLimit,
    maxSpacing: maxSpacing,
    steerDelay: steerDelay,
    nearFar: nearFar,
    splAt: splAt,
    splCurve: splCurve,
    arrayGain: arrayGain,
    coverageGeometry: coverageGeometry,
    splayPlan: splayPlan,
    comb: comb,
    combSpacing: combSpacing
  };
});
