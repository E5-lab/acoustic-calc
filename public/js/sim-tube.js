/*
 * sim-tube.js — 声阻抗管（两传声器法）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimTube，Node 下 module.exports。
 *
 * 物理模型：法向入射平面波在样品面（x=0）处反射。
 *   入射波自 +x 方向朝样品传播（沿 -x），故 p(x) = exp(-j k x) + R·exp(+j k x)。
 *   声压反射系数 R = (Zs - Z0)/(Zs + Z0)，Z0 = ρc 为空气特性阻抗。
 *   本内核接受实数 Zs（演示用，近似匹配时 R≈0）；真实测量中 Zs 为复数，
 *   需用两传声器传递函数 H12 = p(x2)/p(x1) 的相位重建复数反射系数。
 *
 * 单位约定（SI）：长度 m，频率 Hz，声速 m/s，密度 kg/m³，
 *   声阻抗 rayl = Pa·s/m，管径 m。
 */
(function (global) {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // 复数工具：以 {re, im} 表示
  function cmul(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  }
  function cdiv(a, b) {
    var d = b.re * b.re + b.im * b.im;
    if (d === 0) return { re: NaN, im: NaN };
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  }
  function cabs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }

  // 沿管复声压 p(x) = exp(-j k x) + R·exp(+j k x)
  // exp(-j k x) = cos(kx) - j sin(kx)
  // R·exp(+j k x) = R·[cos(kx) + j sin(kx)]
  // => re = (1+R)cos(kx); im = (R-1) sin(kx)
  function pAt(x, k, R) {
    var c = Math.cos(k * x), s = Math.sin(k * x);
    return { re: (1 + R) * c, im: (R - 1) * s };
  }

  /* ----------------------- 主入口 ----------------------- */
  function measure(opts) {
    opts = opts || {};

    var Zs = num(opts.Zs);
    var rho = num(opts.rho);
    var c = num(opts.c);
    var d = num(opts.d);
    var f = num(opts.f);
    var x1 = num(opts.x1);
    var x2 = num(opts.x2);

    // 缺省值
    if (Zs == null) Zs = 412;     // 近似空气（近乎匹配），rayl
    if (rho == null) rho = 1.2;   // 空气密度 kg/m³
    if (c == null) c = 343;       // 声速 m/s
    if (d == null) d = 0.05;      // 管径 m
    if (f == null) f = 500;       // 频率 Hz
    if (x1 == null) x1 = 0.05;    // 传声器 1 距样品面 m
    if (x2 == null) x2 = 0.10;    // 传声器 2 距样品面 m

    // 输入校验
    if (!(Zs > 0)) return { ok: false, error: '样品声阻抗 Zs 必须为正数（rayl）' };
    if (!(rho > 0)) return { ok: false, error: '空气密度 ρ 必须为正数（kg/m³）' };
    if (!(c > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };
    if (!(d > 0)) return { ok: false, error: '管径 d 必须为正数（m）' };
    if (!(f > 0)) return { ok: false, error: '频率 f 必须为正数（Hz）' };
    if (!(x1 >= 0)) return { ok: false, error: '传声器 1 位置 x1 不能为负（m）' };
    if (!(x2 > x1)) return { ok: false, error: '传声器 2 位置 x2 必须大于 x1（m）' };

    var Z0 = rho * c;                       // 空气特性阻抗
    var R = (Zs - Z0) / (Zs + Z0);          // 压力反射系数（Zs 为实数 → 实数 R）
    var absR = Math.abs(R);
    var alpha = 1 - R * R;                  // 法向入射吸声系数
    var SWR = absR < 1 ? (1 + absR) / (1 - absR) : Infinity; // 驻波比，守卫 |R|<1
    var k = (2 * Math.PI * f) / c;          // 波数
    var lambda = c / f;

    // 沿管声压包络采样（用于绘制驻波包络）
    var xmax = Math.max(x2 * 1.2, 1.4 * lambda); // 取足够显示约 1–2 个波长
    var N = 400;
    var pProfile = [];
    for (var i = 0; i <= N; i++) {
      var x = (xmax * i) / N;
      pProfile.push({ x: x, mag: cabs(pAt(x, k, R)) });
    }

    // 两个传声器处的复声压及传递函数
    var micP1 = pAt(x1, k, R);
    var micP2 = pAt(x2, k, R);
    var H12 = cdiv(micP2, micP1); // 两传声器传递函数（复数重建演示）

    var notes = [
      '本模型为法向入射「两传声器法」阻抗管：样品位于 x=0，沿 +x 为管内空间。',
      '入射波 pᵢ = exp(-j k x)（朝 -x 方向传播），反射波 pᵣ = R·exp(+j k x)。',
      '反射系数 R = (Zs−Z₀)/(Zs+Z₀)；此处 Zs 取实数（演示）。真实测量需用 H₁₂ 的相位重建复数 R，',
      '并通过移动/双传声器布置消除管口与传声器相位误差。R≈0 ⇒ 包络平坦（全吸收）；|R|→1 ⇒ 深节点（强反射）。'
    ];

    return {
      ok: true,
      Z0: Z0,
      Zs: Zs,
      rho: rho,
      c: c,
      d: d,
      f: f,
      x1: x1,
      x2: x2,
      k: k,
      lambda: lambda,
      xmax: xmax,
      R: R,
      absR: absR,
      alpha: alpha,
      SWR: SWR,
      pProfile: pProfile,
      micP1: { re: micP1.re, im: micP1.im, mag: cabs(micP1) },
      micP2: { re: micP2.re, im: micP2.im, mag: cabs(micP2) },
      H12: { re: H12.re, im: H12.im, mag: cabs(H12) },
      notes: notes
    };
  }

  var API = {
    measure: measure,
    cmul: cmul,
    cdiv: cdiv,
    cabs: cabs,
    pAt: pAt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimTube = API;
  }
})(typeof window !== 'undefined' ? window : this);
