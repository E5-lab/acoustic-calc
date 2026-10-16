/*
 * sim-bubble.js — 水下气泡共鸣（Minnaert 公式）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimBubble，Node 下 module.exports。
 *
 * 物理模型：液体中自由气泡在声压激励下的单极子共鸣（M. Minnaert, 1933）。
 *   气泡内气体按多方过程 p·V^γ = const 变化，体积弹性提供回复力、周围液体惯性提供
 *   质量，构成质量-弹簧系统；当半径 r 远小于声波波长时，其共鸣频率为
 *     f0 = (1 / (2π·r)) · √(3γ·P0 / ρ)
 *   即 f0 ∝ 1/r：半径减半、频率加倍（小气泡高频、大气泡低频）。
 *   水中波长 λ = c / f0（c 为水中声速，默认 1481 m/s）。
 *
 *   归一化共振响应采用 Lorentz（半功率）形式：
 *     H(f) = 1 / √(1 + [2Q·(f − f0)/f0]²)
 *   峰值 1 @ f0；半功率点（H = 1/√2 ≈ 0.7071）位于 f0(1 ± 1/(2Q))；
 *   半功率带宽 Δf = f2 − f1 = f0 / Q。
 *
 * 单位约定（SI）：半径 m（minnaertFreq / sizeForFreq 的 r 均为米；simulate 入口
 *   接受 UI 层的 mm，内部换算），频率 Hz，压力 Pa，密度 kg/m³，声速 m/s。
 *   注意：Minnaert 公式忽略表面张力与液体粘性，适用于 r ≳ 0.1 mm 量级的气泡；
 *   更小尺度（微/纳米气泡）需改用包含表面张力的修正模型。本内核为解析公式演示，
 *   不含气泡群相互作用与阻尼的精细物理。
 */
(function (global) {
  'use strict';

  var C_WATER = 1481;    // 水中声速默认值 m/s（20 ℃ 淡水约 1481）
  var RHO_WATER = 1000;  // 淡水密度默认值 kg/m³
  var F_MIN = 20;        // 扫频下限 Hz
  var F_MAX = 100000;    // 扫频上限 Hz

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /* ----------------------- 核心公式 ----------------------- */

  // Minnaert 共鸣频率：f0 = (1/(2πr))·√(3γP0/ρ)，r 单位 m，返回 Hz；无效输入返回 null
  function minnaertFreq(r, gamma, P0, rho) {
    if (!(r > 0) || !(gamma > 0) || !(P0 > 0) || !(rho > 0)) return null;
    return (1 / (2 * Math.PI * r)) * Math.sqrt((3 * gamma * P0) / rho);
  }

  // 由目标共鸣频率反求气泡半径（m）：minnaertFreq 的解析逆函数，r = (1/(2πf))·√(3γP0/ρ)
  function sizeForFreq(f, gamma, P0, rho) {
    if (!(f > 0) || !(gamma > 0) || !(P0 > 0) || !(rho > 0)) return null;
    return (1 / (2 * Math.PI * f)) * Math.sqrt((3 * gamma * P0) / rho);
  }

  // 共振响应（Lorentz 半功率形式）：H = 1/√(1 + [2Q(f−f0)/f0]²)，峰值 1 @ f0
  function resonanceResponse(f, f0, Q) {
    if (!(f0 > 0) || !(Q > 0)) return null;
    var d = (2 * Q * (f - f0)) / f0;
    return 1 / Math.sqrt(1 + d * d);
  }

  // 半功率带宽：[f1, f2] = [f0(1−1/2Q), f0(1+1/2Q)]，Δf = f2−f1 = f0/Q；无效返回 null
  function halfPowerBand(f0, Q) {
    if (!(f0 > 0) || !(Q > 0)) return null;
    return [f0 * (1 - 1 / (2 * Q)), f0 * (1 + 1 / (2 * Q))];
  }

  /* ----------------------- 主入口 ----------------------- */
  // opts: { rMm, gamma, P0(Pa), rho, c, Q } —— rMm 为 UI 层毫米输入，内部换算为米
  function simulate(opts) {
    opts = opts || {};

    var rMm = num(opts.rMm);
    var gamma = num(opts.gamma);
    var P0 = num(opts.P0);
    var rho = num(opts.rho);
    var c = num(opts.c);
    var Q = num(opts.Q);

    // 缺省值
    if (rMm == null) rMm = 1;            // 气泡半径 mm
    if (gamma == null) gamma = 1.4;      // 空气多方指数
    if (P0 == null) P0 = 101325;         // 环境压力 Pa（1 标准大气压）
    if (rho == null) rho = RHO_WATER;    // 液体密度 kg/m³
    if (c == null) c = C_WATER;          // 水中声速 m/s
    if (Q == null) Q = 10;               // 品质因数

    // 输入校验（区间与视图控件范围一致）
    if (!(rMm > 0)) return { ok: false, error: '气泡半径必须为正数（mm）' };
    if (rMm < 0.1 || rMm > 10) return { ok: false, error: '气泡半径需在 0.1–10 mm 之间' };
    if (!(gamma >= 1 && gamma <= 1.66)) return { ok: false, error: '多方指数 γ 需在 1.0–1.66 之间' };
    if (!(P0 >= 50000 && P0 <= 200000)) return { ok: false, error: '环境压力 P₀ 需在 50–200 kPa 之间' };
    if (!(rho > 0)) return { ok: false, error: '液体密度 ρ 必须为正数（kg/m³）' };
    if (!(c >= 1400 && c <= 1560)) return { ok: false, error: '水中声速 c 需在 1400–1560 m/s 之间' };
    if (!(Q >= 2 && Q <= 50)) return { ok: false, error: '品质因数 Q 需在 2–50 之间' };

    var r = rMm / 1000; // mm → m
    var f0 = minnaertFreq(r, gamma, P0, rho);
    var band = halfPowerBand(f0, Q);
    var lambda = c / f0;

    // 扫频曲线（对数间隔 20 Hz–100 kHz，供视图绘制 H(f)；插入精确 f₀ 点使曲线准确达峰）
    var curve = [];
    var N = 400;
    for (var i = 0; i <= N; i++) {
      var f = F_MIN * Math.pow(F_MAX / F_MIN, i / N);
      curve.push({ f: f, H: resonanceResponse(f, f0, Q) });
    }
    curve.push({ f: f0, H: 1 });
    curve.sort(function (a, b) { return a.f - b.f; });

    var notes = [
      '小气泡频率高：f₀ ∝ 1/r，半径减半则共鸣频率加倍（例如 r = 0.5 mm 时 f₀ ≈ 6.6 kHz）。',
      'γ = 1.4 为空气的多方（近似绝热）指数；实际气泡内气体行为介于等温与绝热之间，γ 约取 1.0–1.66。',
      'Minnaert 公式忽略表面张力与液体粘性，适用于 r ≳ 0.1 mm 量级的气泡；更小尺度需改用含表面张力的修正模型。',
      '典型应用：水下噪声谱中的气泡线谱、气泡幕降噪、医学超声造影剂微泡的共振频率设计。'
    ];

    return {
      ok: true,
      rMm: rMm,
      r: r,
      gamma: gamma,
      P0: P0,
      rho: rho,
      c: c,
      Q: Q,
      f0: f0,
      lambda: lambda,
      df: f0 / Q,
      f1: band[0],
      f2: band[1],
      diameterMm: rMm * 2,
      curve: curve,
      notes: notes
    };
  }

  var API = {
    C_WATER: C_WATER,
    RHO_WATER: RHO_WATER,
    F_MIN: F_MIN,
    F_MAX: F_MAX,
    minnaertFreq: minnaertFreq,
    sizeForFreq: sizeForFreq,
    resonanceResponse: resonanceResponse,
    halfPowerBand: halfPowerBand,
    simulate: simulate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimBubble = API;
  }
})(typeof window !== 'undefined' ? window : this);
