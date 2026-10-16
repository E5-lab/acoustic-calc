/*
 * sim-interference.js — 双源声波干涉声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimInterference，Node 下 module.exports。
 *
 * 物理模型：两个同频（f）、同幅、相干点声源，相距 d，相位差 φ（deg）。
 *   远场（夫琅禾费 / 平行射线近似）中，观测角 θ 自两源连线的中垂线起算：
 *     波长 λ = c/f
 *     波程差 Δr(θ) = d·sinθ
 *     两波相位差 ΔΦ = 2π·Δr/λ + φ
 *     归一化振幅 A(θ) = |cos(ΔΦ/2)| = |cos(π·d·sinθ/λ + φ/2)| ∈ [0,1]
 *   相长干涉（主极大）：Δr = m·λ（m = 0, ±1, ±2 …）
 *   相消干涉（极小）  ：Δr = (m+½)·λ
 *   极值方向仅统计 |sinθ| ≤ 1（即 |θ| ≤ 90°）的范围，角度单位 deg，按从小到大。
 *
 * 单位约定（SI）：长度 m，频率 Hz，声速 m/s，角度 deg，相位差 deg。
 */
(function (global) {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // 弧度转 deg（保留 2 位小数）
  function degOf(rad) {
    return Math.round(((rad * 180) / Math.PI) * 100) / 100;
  }

  // 波长 λ = c/f
  function wavelength(f, c) {
    var fv = num(f), cv = num(c);
    if (!(fv > 0)) return { ok: false, error: '频率 f 必须为正数（Hz）' };
    if (!(cv > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };
    return { ok: true, lambda: cv / fv, f: fv, c: cv };
  }

  // 波程差 Δr(θ) = d·sinθ（θ 自中垂线起算，deg）
  function pathDiff(d, thetaDeg) {
    var dv = num(d), tv = num(thetaDeg);
    if (!(dv > 0)) return { ok: false, error: '源间距 d 必须为正数（m）' };
    if (tv == null) return { ok: false, error: '探测角 θ 必须为数值（deg）' };
    return { ok: true, deltaR: dv * Math.sin((tv * Math.PI) / 180), d: dv, thetaDeg: tv };
  }

  // 远场归一化振幅 A(θ) = |cos(π·d·sinθ/λ + φ/2)|，归一到 [0,1]（最大值为 1）
  function amplitude(thetaDeg, d, f, c, phaseDeg) {
    var tv = num(thetaDeg), dv = num(d), fv = num(f), cv = num(c);
    var pv = num(phaseDeg);
    if (tv == null) return { ok: false, error: '探测角 θ 必须为数值（deg）' };
    if (!(dv > 0)) return { ok: false, error: '源间距 d 必须为正数（m）' };
    if (!(fv > 0)) return { ok: false, error: '频率 f 必须为正数（Hz）' };
    if (!(cv > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };
    if (pv == null) pv = 0; // 相位差默认 0
    var lambda = cv / fv;
    var sinT = Math.sin((tv * Math.PI) / 180);
    var phiRad = (pv * Math.PI) / 180;
    var deltaR = dv * sinT;
    var a = Math.abs(Math.cos((Math.PI * deltaR) / lambda + phiRad / 2));
    if (a > 1) a = 1; // 数值守卫，保证 ∈ [0,1]
    return {
      ok: true,
      amplitude: a,
      thetaDeg: tv,
      d: dv,
      f: fv,
      c: cv,
      phaseDeg: pv,
      lambda: lambda,
      deltaR: deltaR,
      phaseRad: (2 * Math.PI * deltaR) / lambda + phiRad // 两波总相位差 ΔΦ
    };
  }

  // 主极大 / 极小角度表（deg，仅 |sinθ| ≤ 1，升序；相位差 φ 不参与，取 φ=0 条件）
  function orders(d, f, c) {
    var dv = num(d), fv = num(f), cv = num(c);
    if (!(dv > 0)) return { ok: false, error: '源间距 d 必须为正数（m）' };
    if (!(fv > 0)) return { ok: false, error: '频率 f 必须为正数（Hz）' };
    if (!(cv > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };
    var lambda = cv / fv;
    var maxima = [], minima = [];
    var m, n;
    // 相长：sinθ = m·λ/d，|m·λ/d| ≤ 1
    var mmax = Math.floor(dv / lambda + 1e-9);
    for (m = -mmax; m <= mmax; m++) {
      maxima.push(degOf(Math.asin((m * lambda) / dv)));
    }
    // 相消：sinθ = (m+½)·λ/d，即半整数 n = ±0.5, ±1.5, ±2.5 …
    for (n = 0.5; n <= dv / lambda + 1e-9; n += 1) {
      minima.push(degOf(Math.asin((n * lambda) / dv)));
      minima.push(degOf(Math.asin((-n * lambda) / dv)));
    }
    maxima.sort(function (a, b) { return a - b; });
    minima.sort(function (a, b) { return a - b; });
    return { ok: true, maxima: maxima, minima: minima, lambda: lambda, d: dv, f: fv, c: cv };
  }

  var API = {
    wavelength: wavelength,
    amplitude: amplitude,
    pathDiff: pathDiff,
    orders: orders
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimInterference = API;
  }
})(typeof window !== 'undefined' ? window : this);
