/*
 * absdesign.js — 吸声结构设计内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.AbsDesign，Node 下 module.exports。
 *
 * 依据：《实用建筑声学》第 2 章「吸声材料（结构）及其在建筑中的应用」、
 *      《建筑隔声与吸音材料》、《声学基础》（杜功焕）第 9 章「声波的吸收」。
 *
 * 1) 传递矩阵法（TMM）：把「穿孔板 / 薄膜 / 薄板 / 多孔材料层 / 空气腔」串联，
 *    各层用 2×2 声传递矩阵描述，末端刚性壁（Z_load = ∞）取 Z_in = T11/T21，
 *    法向吸声系数 α = 1 − |(Z_in − ρ₀c)/(Z_in + ρ₀c)|²。
 *      · 空气腔 / 多孔层（厚度 d，特性阻抗 Zc，传播常数 γ=jk）：
 *          [ cosh(γd)        Zc·sinh(γd) ]
 *          [ sinh(γd)/Zc     cosh(γd)    ]
 *      · 串联声阻抗层（微穿孔板、薄板/薄膜）：[1 Z; 0 1]
 * 2) 多孔材料特性：Delany–Bazley 经验模型与 Miki 修正模型
 *      DB : Zc/ρ₀c = 1 + 0.0571X^−0.754 − j0.087X^−0.732
 *           k/(ω/c) = 1 + 0.0978X^−0.700 − j0.189X^−0.595      (0.01 ≤ X ≤ 1)
 *      Miki: Zc/ρ₀c = 1 + 0.0699X^−0.632 − j0.107X^−0.632
 *           k/(ω/c) = 1 + 0.109X^−0.618 − j0.160X^−0.618       (X ≥ 0.01)
 *      X = ρ₀ f / σ（σ 为流阻率 Pa·s/m²）
 * 3) 微穿孔板（马大猷理论）：
 *      x = (d/2)·√(ωρ₀/η)
 *      R = 32ηt/(p d²)·[ √(1 + x²/32) + (√2/32)·x·d/t ]   （声阻）
 *      M = ρ₀t/p·[ 1 + (9 + x²/2)^(−1/2) + 0.85 d/t ]      （声质量）
 *      Z_mpp = R + jωM，背后空腔 D 时 Z_in = Z_mpp − jρ₀c·cot(ωD/c)
 * 4) 薄板 / 薄膜共振吸声结构共振频率：f₀ = (c/2π)·√(ρ₀/(m·d))
 *    （m 面密度 kg/m²，d 空腔深度 m；即教材 f₀ = 60/√(m·d)，d 以 m 计）
 * 5) 吸声降噪量：ΔL = 10·lg(A₂/A₁)（A 为室内总吸声量，按频带计算）。
 */
(function (global) {
  'use strict';

  var RHO = 1.21;        // 空气密度 kg/m³
  var C0 = 343;          // 声速 m/s
  var ETA = 1.789e-5;    // 空气动力粘度 Pa·s
  var Z0 = RHO * C0;     // 空气特性阻抗 Pa·s/m

  // 吸声系数常用 1/3 倍频程（ISO 354 测量范围 100–5000 Hz）
  var TERZ = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
    1250, 1600, 2000, 2500, 3150, 4000, 5000];
  var OCT = [125, 250, 500, 1000, 2000, 4000];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) || !isFinite(n) ? null : n;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lg(x) { return Math.log(x) / Math.LN10; }

  /* 复数运算（用 {re, im} 表示） */
  function c(re, im) { return { re: re, im: im || 0 }; }
  function cAdd(a, b) { return c(a.re + b.re, a.im + b.im); }
  function cSub(a, b) { return c(a.re - b.re, a.im - b.im); }
  function cMul(a, b) { return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cDiv(a, b) {
    var d = b.re * b.re + b.im * b.im;
    if (d === 0) return c(0, 0);
    return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  }
  function cAbs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }
  function cCosh(a) { return c(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im)); }
  function cSinh(a) { return c(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im)); }
  function cCot(a) { var s = cSinh(a); return cDiv(cCosh(a), s); }

  /* ---------------------------------------------------------------- 多孔材料模型 */
  var POROUS_PRESETS = [
    { id: 'glass-24', name: '玻璃棉 24 kg/m³', sigma: 5000, note: '轻质玻璃棉，中高频吸声强' },
    { id: 'glass-40', name: '玻璃棉 40 kg/m³', sigma: 11000, note: '常用吊顶/墙面吸声棉' },
    { id: 'rock-60', name: '岩棉 60 kg/m³', sigma: 22000, note: '中低频兼顾' },
    { id: 'rock-100', name: '岩棉 100 kg/m³', sigma: 50000, note: '高流阻，低频更有效' },
    { id: 'polyester-30', name: '聚酯纤维棉 30 kg/m³', sigma: 9000, note: '无纤维飞散，装饰性好' },
    { id: 'melamine-10', name: '三聚氰胺棉 10 kg/m³', sigma: 8000, note: '轻质阻燃，开孔率高' }
  ];
  function findPorous(id) {
    for (var i = 0; i < POROUS_PRESETS.length; i++) if (POROUS_PRESETS[i].id === id) return POROUS_PRESETS[i];
    return null;
  }
  // 多孔材料特性阻抗与传播常数（相对值比）
  function porousProps(f, sigma, model) {
    var ff = num(f), sg = num(sigma);
    if (ff == null || ff <= 0 || sg == null || sg <= 0) return null;
    var X = RHO * ff / sg;
    var w = 2 * Math.PI * ff;
    var zr, zi, kr, ki;
    if (model === 'miki') {
      var x1 = Math.pow(X, -0.632), x2 = Math.pow(X, -0.618);
      zr = 1 + 0.0699 * x1; zi = -0.107 * x1;
      kr = 1 + 0.109 * x2; ki = -0.160 * x2;
    } else {
      var d1 = Math.pow(X, -0.754), d2 = Math.pow(X, -0.732),
        d3 = Math.pow(X, -0.700), d4 = Math.pow(X, -0.595);
      zr = 1 + 0.0571 * d1; zi = -0.087 * d2;
      kr = 1 + 0.0978 * d3; ki = -0.189 * d4;
    }
    var Zc = c(Z0 * zr, Z0 * zi);
    var k = c((w / C0) * kr, (w / C0) * ki);
    return {
      X: X,
      Zc: Zc,
      k: k,
      zcRatio: c(zr, zi),
      kRatio: c(kr, ki),
      valid: (model === 'miki') ? (X >= 0.01) : (X >= 0.01 && X <= 1),
      attenuation: -k.im
    };
  }

  /* ---------------------------------------------------------------- 微穿孔板 */
  // 微穿孔板声阻抗（每 m²），d、t 单位 mm，p 为穿孔率（百分数，1 = 1%）
  // 与 perforation.js 约定一致：站点统一以百分数输入穿孔率。
  function mppImpedance(f, o) {
    o = o || {};
    var ff = num(f), d = num(o.d), t = num(o.t), p = num(o.p);
    if (ff == null || ff <= 0 || d == null || d <= 0 || t == null || t <= 0 || p == null) return null;
    p = p / 100;                               // 百分数 → 分数
    if (p <= 0 || p >= 1) return null;
    var dM = d / 1000, tM = t / 1000;
    var w = 2 * Math.PI * ff;
    var x = (dM / 2) * Math.sqrt(w * RHO / ETA);          // 穿孔常数
    var R = (32 * ETA * tM) / (p * dM * dM) *
      (Math.sqrt(1 + x * x / 32) + (Math.SQRT2 / 32) * x * dM / tM);
    var M = (RHO * tM / p) * (1 + 1 / Math.sqrt(9 + x * x / 2) + 0.85 * dM / tM);
    return { R: R, M: M, Z: c(R, w * M), x: x, p: p };
  }
  // 微穿孔板 + 背后空腔 D（mm）的输入声阻抗（刚性壁）
  function mppInputImpedance(f, o) {
    o = o || {};
    var z = mppImpedance(f, o);
    var D = num(o.D);
    if (!z || D == null || D <= 0) return null;
    var w = 2 * Math.PI * f;
    var kd = w * (D / 1000) / C0;
    // −j ρ₀c·cot(kd)，kd = ωD/c 为实数
    var cotReal = Math.cos(kd) / Math.sin(kd);
    var cav = c(0, -Z0 * cotReal);
    return { Z: cAdd(z.Z, cav), Z_mpp: z.Z, Z_cav: cav, R: z.R, M: z.M, x: z.x, p: z.p };
  }
  function mppAlpha(f, o) {
    var r = mppInputImpedance(f, o);
    if (!r) return null;
    var refl = cDiv(cSub(r.Z, c(Z0)), cAdd(r.Z, c(Z0)));
    return clamp(1 - cAbs(refl) * cAbs(refl), 0, 1);
  }
  // 微穿孔板共振频率解析式 f₀ = (c/2π)·√(p/(D·t_eff))，t_eff = t + 0.85d
  // p 为穿孔率百分数（与 perforation.js 约定一致：1 = 1%）
  function mppResonance(o) {
    o = o || {};
    var d = num(o.d), t = num(o.t), D = num(o.D);
    var p = num(o.p);
    if (d == null || t == null || D == null || p == null || D <= 0) return null;
    p = p / 100;                              // 百分数 → 分数
    if (p <= 0 || p >= 1) return null;
    var tEff = (t + 0.85 * d) / 1000;
    var f0 = C0 / (2 * Math.PI) * Math.sqrt(p / ((D / 1000) * tEff));
    return { f0: f0, tEff: tEff * 1000, quarterWave: C0 / (4 * f0) * 1000 };
  }

  /* ---------------------------------------------------------------- 薄板 / 薄膜 */
  // 共振频率 f₀ = (c/2π)·√(ρ₀/(m·d))：m kg/m²，d 空腔深度 m
  function panelResonance(m, dMeter) {
    var mm = num(m), dd = num(dMeter);
    if (mm == null || dd == null || mm <= 0 || dd <= 0) return null;
    return C0 / (2 * Math.PI) * Math.sqrt(RHO / (mm * dd));
  }

  /* ---------------------------------------------------------------- 传递矩阵 */
  // 单层传递矩阵；layer: {type, thickness(mm), ...}
  function layerMatrix(layer, f, opt) {
    opt = opt || {};
    var c0 = num(opt.c) || C0;
    var w = 2 * Math.PI * f;
    var d, Zc, k;
    switch (layer.type) {
      case 'rigid':
        return null;                                  // 刚性末端，不参与矩阵相乘
      case 'cavity':
        d = (num(layer.depth) || 0) / 1000;
        Zc = c(Z0); k = c(w / c0, 0);   // 空气层：角波数 k=ω/c（实数），gd=j·k·d 为纯虚数
        break;
      case 'porous':
        var pp = porousProps(f, layer.sigma, layer.model || opt.model || 'db');
        if (!pp) return null;
        d = (num(layer.thickness) || 0) / 1000;
        Zc = pp.Zc; k = pp.k;
        break;
      case 'perf': {
        // 微穿孔板 / 普通穿孔板串联阻抗：Z = Z_mpp（含端修正）
        var zi = layer.resistance != null || layer.mass != null
          ? c(0, 0) : null;
        var zm = null;
        if (layer.d != null && layer.t != null && layer.p != null) {
          zm = mppImpedance(f, layer);
        }
        if (!zm) {
          // 退化：用给定声质量/声阻
          var Mm = num(layer.mass) || 1e-3;
          var Rr = num(layer.resistance) || 0;
          zm = { Z: c(Rr, w * Mm) };
        }
        return { T11: c(1), T12: zm.Z, T21: c(0), T22: c(1) };
      }
      case 'panel':
      case 'membrane': {
        // 薄板/薄膜：质量抗（可含损耗）
        var m = num(layer.mass);
        if (m == null) return null;
        var eta = num(layer.eta) == null ? 0.05 : num(layer.eta);
        var Zp = c(w * m * eta, w * m);
        return { T11: c(1), T12: Zp, T21: c(0), T22: c(1) };
      }
      default:
        return null;
    }
    var gd = cMul(k, c(0, d));
    var ch = cCosh(gd), sh = cSinh(gd);
    return {
      T11: ch,
      T12: cMul(Zc, sh),
      T21: cDiv(sh, Zc),
      T22: ch
    };
  }
  function matMul(a, b) {
    return {
      T11: cAdd(cMul(a.T11, b.T11), cMul(a.T12, b.T21)),
      T12: cAdd(cMul(a.T11, b.T12), cMul(a.T12, b.T22)),
      T21: cAdd(cMul(a.T21, b.T11), cMul(a.T22, b.T21)),
      T22: cAdd(cMul(a.T21, b.T12), cMul(a.T22, b.T22))
    };
  }
  // 组合结构的表面输入声阻抗（末端刚性壁）
  function inputImpedance(layers, f, opt) {
    if (!layers || !layers.length) return null;
    var T = null;
    for (var i = 0; i < layers.length; i++) {
      var Mi = layerMatrix(layers[i], f, opt);
      if (!Mi) continue;
      T = T ? matMul(T, Mi) : Mi;
    }
    if (!T) return null;
    // 刚性末端：Z_in = T11 / T21
    if (cAbs(T.T21) < 1e-12) return c(Infinity, 0);
    return cDiv(T.T11, T.T21);
  }
  function alphaAt(f, layers, opt) {
    var Zin = inputImpedance(layers, f, opt);
    if (!Zin) return null;
    if (!isFinite(Zin.re)) return 0;
    var refl = cDiv(cSub(Zin, c(Z0)), cAdd(Zin, c(Z0)));
    return clamp(1 - cAbs(refl) * cAbs(refl), 0, 1);
  }

  /* 由「层描述」生成 1/3 倍频程吸声系数谱 */
  function spectrum(cfg) {
    cfg = cfg || {};
    var layers = cfg.layers;
    if (!layers || !layers.length) return { ok: false, error: '请至少给出一个结构层' };
    var bands = cfg.bands || TERZ;
    var alphas = [], points = [], peak = { f: null, alpha: -1 }, invalid = 0;
    for (var i = 0; i < bands.length; i++) {
      var a = alphaAt(bands[i], layers, cfg);
      if (a == null) { alphas.push(null); continue; }
      alphas.push(a);
      points.push({ f: bands[i], alpha: a });
      if (a > peak.alpha) { peak.f = bands[i]; peak.alpha = a; }
      var l0 = layers[0];
      if (l0 && l0.type === 'porous') {
        var pp = porousProps(bands[i], l0.sigma, l0.model || cfg.model || 'db');
        if (pp && !pp.valid) invalid++;
      }
    }
    var good = alphas.filter(function (v) { return v != null; });
    var sum = good.reduce(function (a, b) { return a + b; }, 0);
    return {
      ok: true,
      bands: bands,
      alphas: alphas,
      points: points,
      nrc: nrc(alphas, bands),
      avg: good.length ? sum / good.length : null,
      alpha500: pick(alphas, bands, 500),
      peak: peak.f ? peak : null,
      invalidCount: invalid,
      resonance: peak.f ? peak.f : null
    };
  }
  function pick(alphas, bands, hz) {
    for (var i = 0; i < bands.length; i++) if (bands[i] === hz) return alphas[i];
    return null;
  }
  // 降噪系数 NRC = (α250+α500+α1000+α2000)/4，四舍五入到 0.05
  function nrc(alphas, bands) {
    bands = bands || TERZ;
    var use = [250, 500, 1000, 2000], s = 0, n = 0;
    for (var i = 0; i < use.length; i++) {
      var v = pick(alphas, bands, use[i]);
      if (v == null) continue;
      s += v; n++;
    }
    if (!n) return null;
    return Math.round((s / n) * 20) / 20;
  }

  /* ---------------------------------------------------------------- 吸声降噪量 */
  // ΔL = 10·lg(A₂/A₁)，A 可为总吸声量（m² 赛宾）或房间常数
  function bandReduction(A1, A2) {
    var a1 = num(A1), a2 = num(A2);
    if (a1 == null || a2 == null || a1 <= 0 || a2 <= 0) return null;
    return 10 * lg(a2 / a1);
  }
  // 逐频带吸声降噪量：A1/A2 为数组，返回各带 ΔL 与 A 计权总降噪量
  function reduction(o) {
    o = o || {};
    var A1 = o.A1, A2 = o.A2, bands = o.bands || TERZ;
    if (!A1 || !A2 || A1.length !== A2.length) return { ok: false, error: '处理前后的吸声量数组长度需一致' };
    var bands1 = [], dls = [], tot = 0, n = 0;
    for (var i = 0; i < A1.length; i++) {
      var d = bandReduction(A1[i], A2[i]);
      bands1.push({ f: bands[i], A1: num(A1[i]), A2: num(A2[i]), dL: d });
      if (d != null) { dls.push(d); tot += d; n++; }
    }
    var mean = n ? tot / n : null;
    // 若给出背景噪声谱，估算处理后总 A 声级
    var out = { ok: true, rows: bands1, dL: dls, meanDL: mean, maxDL: dls.length ? Math.max.apply(null, dls) : null };
    if (o.bgLevels && o.bgLevels.length === A1.length) {
      var before = [], after = [];
      for (i = 0; i < A1.length; i++) {
        if (o.bgLevels[i] == null || dls[i] == null) continue;
        before.push(o.bgLevels[i]);
        after.push(o.bgLevels[i] - dls[i]);
      }
      out.beforeTotal = sumDb(before);
      out.afterTotal = sumDb(after);
    }
    return out;
  }
  function sumDb(levels) {
    var s = 0, any = false;
    for (var i = 0; i < levels.length; i++) {
      var v = num(levels[i]);
      if (v == null) continue;
      s += Math.pow(10, v / 10); any = true;
    }
    return any ? 10 * lg(s) : null;
  }
  // 房间常数前后对比（S 总表面积不变）
  function roomConstant(S, alphaBar) {
    var s = num(S), a = num(alphaBar);
    if (s == null || a == null || s <= 0 || a < 0 || a >= 1) return null;
    return s * a / (1 - a);
  }

  var API = {
    RHO: RHO, C0: C0, Z0: Z0, ETA: ETA, TERZ: TERZ, OCT: OCT,
    POROUS_PRESETS: POROUS_PRESETS,
    findPorous: findPorous,
    porousProps: porousProps,
    mppImpedance: mppImpedance,
    mppInputImpedance: mppInputImpedance,
    mppAlpha: mppAlpha,
    mppResonance: mppResonance,
    panelResonance: panelResonance,
    layerMatrix: layerMatrix,
    inputImpedance: inputImpedance,
    alphaAt: alphaAt,
    spectrum: spectrum,
    nrc: nrc,
    bandReduction: bandReduction,
    reduction: reduction,
    roomConstant: roomConstant,
    sumDb: sumDb,
    pick: pick
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.AbsDesign = API;
})(typeof window !== 'undefined' ? window : this);
