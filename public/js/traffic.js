/*
 * traffic.js — 交通与航空噪声预测内核（纯函数，无依赖）UMD
 *
 * 公路 / 无限长线声源简化模型：
 *   Lp = LwA + 10·lg Q − 30 − 10·lg v − 10·lg(2π·r)
 *   其中 LwA = 单辆 A 声功率级 dB，Q = 车数 辆/h，v = 车速 km/h，r = 距离 m
 * 铁路（轮轨简化）：
 *   Lp(r,v) = L0(25 m, 100 km/h) + 30·lg(v/100) − 10·lg(r/25)（r ≥ 25 m，线声源）
 *   近场 r < 25 m 用 −20·lg(r/25)；列车等效 Leq = Lp + 10·lg(N·t/3600)
 * 航空（简化）：
 *   Ldn = 10·lg[(Nd·10^(SEL/10) + 10·Nn·10^(SEL/10)) / 86400]；NEF ≈ SEL + 10·lg(Nd+Nn) − 88
 *
 * 注：工程简化估算，用于方案比选；正式评价请按 HJ 2.4-2021 等现行导则与实测。
 */
(function (global) {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function r1(x) { return Math.round(x * 10) / 10; }

  /* ---------------- 公路 ---------------- */
  // 单辆 A 声功率级估算：小型/中型/大型车 @60 km/h 参考，速度修正
  function roadVehicleLw(kind, v) {
    var vv = num(v) || 60;
    var base = { small: 70, medium: 76, heavy: 82 }[kind || 'small'];
    var slope = kind === 'small' ? 10 : 8;
    return base + slope * Math.log10(vv / 60);
  }

  /**
   * 公路噪声预测（无限长线声源简化）
   * @param {Object} o { kind, speed(km/h), q(辆/h), r(m) }
   */
  function roadLeq(o) {
    var q = num(o && o.q), r = num(o && o.r), v = num(o && o.speed);
    if (q == null || r == null || !(q >= 0) || !(r > 0)) {
      return { ok: false, error: '请填写车流量（≥0 辆/h）与预测距离（>0 m）' };
    }
    if (v == null || v <= 0) v = 60;
    if (q === 0) return { ok: true, leq: 0, lw: null, note: '车流量为 0（无车时段）' };
    var lw = roadVehicleLw(o && o.kind, v);
    var leq = lw + 10 * Math.log10(q) - 30 - 10 * Math.log10(v) - 10 * Math.log10(2 * Math.PI * r);
    return { ok: true, leq: r1(leq), lw: r1(lw), q: q, v: v, r: r, kind: o && o.kind };
  }

  /* ---------------- 铁路 ---------------- */
  /**
   * 铁路噪声（简化轮轨模型）
   * @param {Object} o { speed(km/h), r(m), n(列/h), tPer(单列通过等效秒) }
   */
  function railLeq(o) {
    var v = num(o && o.speed), r = num(o && o.r), n = num(o && o.n);
    if (r == null || !(r > 0)) return { ok: false, error: '请填写预测距离（>0 m）' };
    if (n == null || n < 0) return { ok: false, error: '请填写每小时列车对数（≥0）' };
    if (v == null || v <= 0) v = 100;
    var L0 = 65; // 25 m、100 km/h 参考（含 15 s 通过等效，工程简化）
    var Lp = (r >= 25)
      ? L0 + 30 * Math.log10(v / 100) - 10 * Math.log10(r / 25)
      : L0 + 30 * Math.log10(v / 100) - 20 * Math.log10(r / 25);
    if (n === 0) return { ok: true, leq: 0, lmax: r1(Lp), note: '无列车时段' };
    var t = num(o && o.tPer) || 15;
    var leq = Lp + 10 * Math.log10((n * t) / 3600);
    return { ok: true, leq: r1(leq), lmax: r1(Lp), n: n, v: v, r: r, tPer: t };
  }

  /* ---------------- 航空 ---------------- */
  /**
   * 航空噪声（简化：SEL → Ldn / NEF）
   * @param {Object} o { sel(dB), nd(昼架次), nn(夜架次) }
   */
  function air(o) {
    var sel = num(o && o.sel), nd = num(o && o.nd), nn = num(o && o.nn);
    if (sel == null) return { ok: false, error: '请填写单次事件声级 SEL (dB)' };
    if (nd == null || nn == null || nd < 0 || nn < 0) return { ok: false, error: '请填写昼/夜架次（≥0）' };
    var ntot = nd + nn;
    if (ntot === 0) return { ok: true, ldn: 0, nef: null, note: '无飞行架次' };
    var en = nd * Math.pow(10, sel / 10) + 10 * nn * Math.pow(10, sel / 10);
    var ldn = 10 * Math.log10(en / 86400);
    var nef = sel + 10 * Math.log10(ntot) - 88;
    return { ok: true, ldn: r1(ldn), nef: r1(nef), sel: sel, nd: nd, nn: nn };
  }

  var API = {
    roadVehicleLw: roadVehicleLw,
    roadLeq: roadLeq,
    railLeq: railLeq,
    air: air
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Traffic = API;
})(typeof window !== 'undefined' ? window : globalThis);