/*
 * absorber.js — 多孔吸声材料声学特性内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Absorber，Node 下 module.exports。
 *
 * 模型：Delany–Bazley 经验模型（Bies & Hansen 形式）
 *   X = ρ0 f / σ                     （σ 为流阻率，单位 Pa·s/m² = rayl/m）
 *   Zc /(ρ0 c0) = 1 + 0.0571 X^-0.754 − j 0.087 X^-0.732
 *   k  / k0     = 1 + 0.0978 X^-0.700 − j 0.189 X^-0.595
 * 由此得到特征阻抗 Zc 与复波数 k，再按层状介质传递计算：
 *   - 刚性背衬（无空腔）：Zs = Zc · coth(γ d)
 *   - 空气层背衬（空腔 D + 刚性壁）：Z_gap = −j ρ0 c0 cot(k0 D)，
 *     Zs = Zc (Z_gap cosh(γd) + Zc sinh(γd)) / (Zc cosh(γd) + Z_gap sinh(γd))
 *   其中 γ = j k = α + jβ
 *  法向入射吸声系数：α = 1 − |(Zs − ρ0c0)/(Zs + ρ0c0)|²
 *  漫射（无规入射）吸声系数：局部反应假设下对入射角能量加权积分
 *      α(θ) = 1 − |(ζ·cosθ − 1)/(ζ·cosθ + 1)|²，ζ = Zs/ρ0c0
 *      α_diff = 2∫₀^{π/2} α(θ)·cosθ·sinθ dθ（Simpson 数值积分）
 *    —— 混响室（Sabine/RT60）口径即漫射值，与法向（阻抗管）值互为补充。
 *
 * 适用条件：0.01 ≤ X ≤ 1（超出范围结果仅供参考，模型自身不保证精度）。
 */
(function (global) {
  'use strict';

  var RHO = 1.2;          // 空气密度 kg/m³（20 ℃）
  var C0 = 343;           // 声速 m/s（20 ℃）
  var RC = RHO * C0;      // 空气特性阻抗 Pa·s/m
  var K0 = function (f) { return 2 * Math.PI * f / C0; };

  // 常用多孔材料流阻率参考值（Pa·s/m²）
  var PRESETS = [
    { id: 'polyester', name: '聚酯纤维棉（低密度）', sigma: 4000, note: '约 20–30 kg/m³，手感蓬松' },
    { id: 'glasswool-24', name: '玻璃棉 24 kg/m³', sigma: 9000, note: '常用建筑吸声填充' },
    { id: 'glasswool-48', name: '玻璃棉 48 kg/m³', sigma: 20000, note: '高密度，低频吸收更好' },
    { id: 'rockwool-40', name: '岩棉 40 kg/m³', sigma: 14000, note: '防火性能好' },
    { id: 'rockwool-100', name: '岩棉 100 kg/m³', sigma: 40000, note: '高密度板材' },
    { id: 'melamine', name: '三聚氰胺泡沫', sigma: 11000, note: '开孔泡沫，无纤维' },
    { id: 'pu-foam', name: '聚氨酯开孔泡沫', sigma: 8000, note: '常见海绵吸声棉' },
    { id: 'felt', name: '毛毡 / 针刺毡', sigma: 15000, note: '厚度通常 5–20 mm' },
    { id: 'woodwool', name: '木丝板', sigma: 30000, note: '密度高、表面粗糙' }
  ];

  var BANDS = [63, 125, 250, 500, 1000, 2000, 4000];

  // ------------------------------ 复数工具 ------------------------------
  function c(re, im) { return { re: re, im: im }; }
  function cadd(a, b) { return c(a.re + b.re, a.im + b.im); }
  function csub(a, b) { return c(a.re - b.re, a.im - b.im); }
  function cmul(a, b) { return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cdiv(a, b) {
    var d = b.re * b.re + b.im * b.im;
    return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  }
  function cabs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }
  function csinh(a) { return c(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im)); }
  function ccosh(a) { return c(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im)); }
  function ccoth(a) { return cdiv(ccosh(a), csinh(a)); }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // Delany–Bazley 归一化参数
  function dbProps(sigma, f) {
    var X = RHO * f / sigma;
    return {
      X: X,
      zr: 1 + 0.0571 * Math.pow(X, -0.754),
      zi: -0.087 * Math.pow(X, -0.732),
      kr: 1 + 0.0978 * Math.pow(X, -0.700),
      ki: -0.189 * Math.pow(X, -0.595),
      valid: X >= 0.01 && X <= 1
    };
  }

  // ---------------- 漫射（无规入射 / 统计）吸声系数 ----------------
  // 局部反应（locally reacting）假设：表面阻抗不随入射角变化。
  // α(θ) = 1 − |(ζ·cosθ − 1)/(ζ·cosθ + 1)|²，能量按 cosθ 分布加权：
  //   α_diff = 2∫₀^{π/2} α(θ)·cosθ·sinθ dθ（Simpson，N=180，步长 0.5°）
  // 解析锚点（纯阻 ζ=x 实数）：α_diff(x=1) = 8(3/2 − 2ln2) ≈ 0.9096。
  // 入参 zn：{re, im} 归一化阻抗，或直接传 point() 结果（自动取 zsRatio）。
  function randomIncidence(zn) {
    var z = (zn && typeof zn === 'object' && zn.zsRatio) ? zn.zsRatio : zn;
    var re = num(z && z.re), im = num(z && z.im);
    if (re == null || im == null) return null;
    var N = 180, h = Math.PI / 2 / N, sum = 0;
    for (var i = 0; i <= N; i++) {
      var ct = Math.cos(i * h);
      var ar = re * ct - 1, ai = im * ct;
      var br = re * ct + 1, bi = im * ct;
      var nr2 = (ar * ar + ai * ai) / (br * br + bi * bi);
      var a = 1 - nr2;
      if (a < 0) a = 0;
      var f = 2 * ct * Math.sin(i * h) * a;
      sum += (i === 0 || i === N ? 1 : (i % 2 ? 4 : 2)) * f;
    }
    var v = sum * h / 3;
    return Math.max(0, Math.min(1, v));
  }

  // 单频点：特征阻抗、复波数、表面阻抗、法向吸声系数
  function point(o) {
    var sigma = num(o.sigma), f = num(o.f);
    var d = (num(o.thickness) || 0) / 1000;   // mm → m
    var gap = (num(o.airGap) || 0) / 1000;    // mm → m
    if (sigma == null || sigma <= 0) return { ok: false, error: '请输入有效的流阻率 σ（> 0）' };
    if (f == null || f <= 0) return { ok: false, error: '频率无效' };
    if (d <= 0) return { ok: false, error: '材料厚度需大于 0' };
    if (gap < 0) return { ok: false, error: '空腔深度不能为负' };

    var p = dbProps(sigma, f);
    var k0 = K0(f);
    var Zc = c(RC * p.zr, RC * p.zi);                       // 特征阻抗
    var k = c(k0 * p.kr, k0 * p.ki);                        // 复波数
    var gamma = c(-k.im, k.re);                             // γ = jk

    var Zs;                                                 // 表面阻抗
    if (gap <= 0) {
      Zs = cmul(Zc, ccoth(cmul(gamma, c(d, 0))));
    } else {
      var kg = K0(f) * gap;
      var Zgap = c(0, -RC / Math.tan(kg));                  // −jρc·cot(k0 D)
      var gd = cmul(gamma, c(d, 0));
      var ch = ccosh(gd), sh = csinh(gd);
      var numerator = cadd(cmul(Zgap, ch), cmul(Zc, sh));
      var denominator = cadd(cmul(Zc, ch), cmul(Zgap, sh));
      Zs = cmul(Zc, cdiv(numerator, denominator));
    }

    var refl = cdiv(csub(Zs, c(RC, 0)), cadd(Zs, c(RC, 0)));
    var alpha = 1 - cabs(refl) * cabs(refl);
    var zsNorm = { re: Zs.re / RC, im: Zs.im / RC };

    return {
      ok: true,
      f: f,
      X: p.X,
      valid: p.valid,
      zcRatio: cabs(Zc) / RC,
      zcReal: Zc.re / RC,
      zcImag: Zc.im / RC,
      kRatio: cabs(k) / k0,
      attenuation: -k.im,                                   // Np/m
      Zs: Zs,
      zsRatio: zsNorm,
      zsAbs: cabs(Zs) / RC,
      alpha: Math.max(0, Math.min(1, alpha)),
      alphaDiff: randomIncidence(zsNorm)                     // 漫射（无规入射）
    };
  }

  // 倍频带吸声谱
  function spectrum(o) {
    var bands = o.bands || BANDS;
    var out = [], alphas = [], alphasDiff = [], invalid = 0;
    for (var i = 0; i < bands.length; i++) {
      var r = point({
        sigma: o.sigma, f: bands[i], thickness: o.thickness, airGap: o.airGap
      });
      if (!r.ok) return r;
      if (!r.valid) invalid++;
      out.push(r);
      alphas.push(r.alpha);
      alphasDiff.push(r.alphaDiff);
    }
    return {
      ok: true,
      bands: bands,
      points: out,
      alphas: alphas,
      alphasDiff: alphasDiff,
      nrc: nrc(bands, alphas),
      nrcDiff: nrc(bands, alphasDiff),
      invalidCount: invalid,
      avg: alphas.reduce(function (a, b) { return a + b; }, 0) / alphas.length,
      avgDiff: alphasDiff.reduce(function (a, b) { return a + b; }, 0) / alphasDiff.length,
      alpha500: pick(bands, alphas, 500),
      alphaDiff500: pick(bands, alphasDiff, 500)
    };
  }

  function pick(bands, alphas, f) {
    var i = bands.indexOf(f);
    return i >= 0 ? alphas[i] : null;
  }

  // NRC：250/500/1000/2000 Hz 吸声系数算术平均，四舍五入到 0.05
  function nrc(bands, alphas) {
    var want = [250, 500, 1000, 2000], vals = [];
    want.forEach(function (f) {
      var i = bands.indexOf(f);
      if (i >= 0) vals.push(alphas[i]);
    });
    if (vals.length < 2) return null;
    var m = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return Number((Math.round(m / 0.05) * 0.05).toFixed(2));
  }

  // 推荐厚度：使首个吸声峰落在目标频率所需的层厚（λ/4 估算 + DB 修正）
  function recommendThickness(sigma, targetFreq, airGap) {
    var f = num(targetFreq), s = num(sigma);
    if (f == null || f <= 0 || s == null || s <= 0) return null;
    var p = dbProps(s, f);
    var k0 = K0(f);
    var beta = k0 * p.kr;                  // 相位常数
    // 使 βd + 空腔相位 ≈ π/2（等效 1/4 波长条件）
    var dPhase = Math.PI / 2 - (num(airGap) || 0) / 1000 * k0;
    var d = dPhase / beta;
    return { thickness: Math.max(20, Math.round(d * 1000 / 5) * 5), X: p.X, valid: p.valid };
  }

  var API = {
    RHO: RHO,
    C0: C0,
    RC: RC,
    BANDS: BANDS,
    PRESETS: PRESETS,
    dbProps: dbProps,
    randomIncidence: randomIncidence,
    point: point,
    spectrum: spectrum,
    nrc: nrc,
    recommendThickness: recommendThickness
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Absorber = API;
  }
})(typeof window !== 'undefined' ? window : this);
