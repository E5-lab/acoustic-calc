/*
 * sim-helmholtz.js — 亥姆霍兹共鸣器（Helmholtz resonator）内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimHelmholtz，Node 下 module.exports。
 *
 * 公式来源（公开经典声学理论，不含任何第三方商业实现）：
 *   亥姆霍兹共鸣器共振频率：
 *     A    = π·(d/2)²              颈口截面积（m²）
 *     Leff = t + δ·d               有效颈长；δ 为端部修正系数（单端法兰 ≈ 0.85·d）
 *     f0   = (c / 2π)·sqrt( A / (V·Leff) )   共振频率（Hz）
 *     λ0   = c / f0
 *   其中 c 为声速（默认 343 m/s，20 ℃ 空气），d 颈直径（m），t 颈长/板厚（m），V 腔体体积（m³）。
 *   本内核只做参数化频点估算，不含 CFD/BEM 物理仿真；最终性能应以实测为准。
 */
(function (global) {
  'use strict';

  var C_DEFAULT = 343;        // 声速 m/s（20 ℃ 空气）
  var ENDCORR_DEFAULT = 0.85; // 单端法兰端部修正系数（≈0.85·d）

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /*
   * helmholtz(opts) -> 结果对象
   * opts: { c, d, t, V, endCorr }（SI 单位）
   * 返回：{ ok, f0, neckArea, Leff, lambda0, c, d, t, V, endCorr, notes } 或 { ok:false, error }
   */
  function helmholtz(opts) {
    opts = opts || {};
    var c = num(opts.c);
    var d = num(opts.d);
    var t = num(opts.t);
    var V = num(opts.V);
    var endCorr = num(opts.endCorr);

    if (c == null) c = C_DEFAULT;
    if (endCorr == null) endCorr = ENDCORR_DEFAULT;

    // 校验：颈直径必须为正，颈长非负，腔体体积必须为正
    if (!(d > 0)) return { ok: false, error: '颈直径 d 必须为正数（m）' };
    if (!(t >= 0)) return { ok: false, error: '颈长 t（板厚）必须 ≥ 0（m）' };
    if (!(V > 0)) return { ok: false, error: '腔体体积 V 必须为正数（m³）' };
    if (!(c > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };

    var A = Math.PI * Math.pow(d / 2, 2);     // 颈口截面积，m²
    var Leff = t + endCorr * d;               // 有效颈长，m
    // 避免除零（Leff 理论上 >0，因 d>0 且 endCorr≥0；但 endCorr 若为负且 t 很小需保护）
    if (!(Leff > 0)) return { ok: false, error: '有效颈长 Leff 必须大于 0' };

    var f0 = (c / (2 * Math.PI)) * Math.sqrt(A / (V * Leff));
    var lambda0 = c / f0;                     // 共振波长，m

    var notes = [
      'f0 随腔体体积 V 减小、颈口面积 A 减小、颈长 t 变短而升高；',
      '端部修正 δ·d 对短颈（t 很小）影响显著，不可忽略。'
    ];

    return {
      ok: true,
      f0: f0,
      neckArea: A,
      Leff: Leff,
      lambda0: lambda0,
      c: c,
      d: d,
      t: t,
      V: V,
      endCorr: endCorr,
      notes: notes
    };
  }

  var API = {
    C_DEFAULT: C_DEFAULT,
    ENDCORR_DEFAULT: ENDCORR_DEFAULT,
    helmholtz: helmholtz
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimHelmholtz = API;
  }
})(typeof window !== 'undefined' ? window : this);
