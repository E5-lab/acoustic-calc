/*
 * dbcalc.js — 声学单位与声级换算内核
 * 纯函数，无依赖。UMD 包装：浏览器挂到 window.DbCalc，Node 下 module.exports。
 *
 * 覆盖：
 *   - 声级能量相加 / 相减（背景修正）
 *   - 声压 ↔ 声压级、声强 ↔ 声强级、声功率 ↔ 声功率级
 *   - 点 / 线 / 面声源距离衰减与点声源自由场声压级
 *   - 1/3 倍频程合成倍频程
 *   - A / C / Z 计权网络衰减值速查表
 */
(function (global) {
  'use strict';

  var P0 = 20e-6;   // 参考声压 20 µPa
  var I0 = 1e-12;  // 参考声强 W/m²
  var W0 = 1e-12;  // 参考声功率 W

  function toLin(L) { return Math.pow(10, L / 10); }
  function fromLin(x) { return 10 * Math.log10(x); }

  // 多个声压级能量相加：L = 10·log₁₀ Σ 10^(Li/10)
  function energySum(levels) {
    var vals = (levels || []).filter(function (v) { return v != null && !isNaN(v); });
    if (!vals.length) return null;
    var s = 0;
    for (var i = 0; i < vals.length; i++) s += toLin(vals[i]);
    return fromLin(s);
  }

  // 两声级相加
  function addLevels(L1, L2) {
    if (L1 == null || isNaN(L1) || L2 == null || isNaN(L2)) return null;
    return fromLin(toLin(L1) + toLin(L2));
  }

  // 相减：从总量 Ltot 扣除部分 Lpart（背景修正）；背景不小于总量时返回 null
  function subtractLevels(Ltot, Lpart) {
    if (Ltot == null || isNaN(Ltot) || Lpart == null || isNaN(Lpart)) return null;
    var diff = toLin(Ltot) - toLin(Lpart);
    if (diff <= 0) return null;
    return fromLin(diff);
  }

  // 增量：两声级差 ΔL = L1 − L2 (≥0) 对应的增加值 Δ = 10·log₁₀(1 + 10^(−ΔL/10))
  function deltaAdd(dL) {
    if (dL == null || isNaN(dL)) return null;
    return fromLin(1 + toLin(-dL));
  }

  // 声压 ↔ 声压级：Lp = 20·log₁₀(p / p0)；p = p0·10^(Lp/20)
  function splToPressure(Lp) { return (Lp == null || isNaN(Lp)) ? null : P0 * Math.pow(10, Lp / 20); }
  function pressureToSpl(p) { return (p == null || isNaN(p) || p <= 0) ? null : 20 * Math.log10(p / P0); }

  // 声强 ↔ 声强级：LI = 10·log₁₀(I / I0)；I = I0·10^(LI/10)
  function intensityToLevel(I) { return (I == null || isNaN(I) || I <= 0) ? null : 10 * Math.log10(I / I0); }
  function levelToIntensity(LI) { return (LI == null || isNaN(LI)) ? null : I0 * Math.pow(10, LI / 10); }

  // 声功率 ↔ 声功率级：LW = 10·log₁₀(W / W0)；W = W0·10^(LW/10)
  function powerToLevel(W) { return (W == null || isNaN(W) || W <= 0) ? null : 10 * Math.log10(W / W0); }
  function levelToPower(LW) { return (LW == null || isNaN(LW)) ? null : W0 * Math.pow(10, LW / 10); }

  // 点声源自由场声压级：Lp = LW + 10·log₁₀(Q / 4π) − 20·log₁₀(r)
  //   Q：1 自由场 / 2 硬地面（反射面）/ 4 墙角 / 8 房间角落。r 为到声源距离(m)
  function pointSourceLp(LW, r, Q) {
    if (LW == null || isNaN(LW) || r == null || isNaN(r) || r <= 0) return null;
    Q = (Q == null || isNaN(Q) || Q <= 0) ? 1 : Q;
    return LW + 10 * Math.log10(Q / (4 * Math.PI)) - 20 * Math.log10(r);
  }

  // 点声源距离衰减（同声学环境，Q 抵消）：L2 = L1 − 20·log₁₀(r2 / r1)
  function distanceAttenPoint(L1, r1, r2) {
    if (L1 == null || isNaN(L1) || r1 == null || isNaN(r1) || r2 == null || isNaN(r2) || r1 <= 0 || r2 <= 0) return null;
    return L1 - 20 * Math.log10(r2 / r1);
  }

  // 线声源距离衰减：L2 = L1 − 10·log₁₀(r2 / r1)
  function distanceAttenLine(L1, r1, r2) {
    if (L1 == null || isNaN(L1) || r1 == null || isNaN(r1) || r2 == null || isNaN(r2) || r1 <= 0 || r2 <= 0) return null;
    return L1 - 10 * Math.log10(r2 / r1);
  }

  // 面声源距离衰减（方形面，边长 side m）：近场(r < side/π)几乎不衰减，远场退化为点源
  function distanceAttenPlane(L1, r1, r2, side) {
    if (L1 == null || isNaN(L1) || r1 == null || isNaN(r1) || r1 <= 0 ||
        r2 == null || isNaN(r2) || r2 <= 0 || side == null || isNaN(side) || side <= 0) return null;
    var rc = side / Math.PI;
    var regime = (Math.max(r1, r2) < rc) ? 'near' : 'far';
    var L2 = (regime === 'near') ? L1 : L1 - 20 * Math.log10(r2 / r1);
    return { regime: regime, critical: rc, L2: L2 };
  }

  // 1/3 倍频程合成倍频程：每倍频带取 f/√2 ~ f·√2 内的 1/3 带能量求和
  var THIRD = [16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400,
    500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
  var OCT = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
  function octaveFromThird(thirdLevels) {
    if (!thirdLevels) return null;
    return OCT.map(function (fo) {
      var s = 0, cnt = 0;
      for (var i = 0; i < THIRD.length; i++) {
        var f = THIRD[i], v = thirdLevels[i];
        if (f >= fo / Math.SQRT2 && f <= fo * Math.SQRT2 && v != null && !isNaN(v)) { s += toLin(v); cnt++; }
      }
      return cnt ? fromLin(s) : null;
    });
  }

  // 计权网络衰减值（dB，相对 1000 Hz 为 0）
  var WEIGHT = {
    freq: [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    A: [-56.7, -39.4, -26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1, -6.6],
    C: [-29.4, -19.8, -11.4, -5.3, -1.9, -0.4, 0, 0.3, -0.1, -0.1, -0.1],
    Z: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  var API = {
    P0: P0, I0: I0, W0: W0, THIRD: THIRD, OCT: OCT, WEIGHT: WEIGHT,
    toLin: toLin, fromLin: fromLin,
    energySum: energySum, addLevels: addLevels, subtractLevels: subtractLevels, deltaAdd: deltaAdd,
    splToPressure: splToPressure, pressureToSpl: pressureToSpl,
    intensityToLevel: intensityToLevel, levelToIntensity: levelToIntensity,
    powerToLevel: powerToLevel, levelToPower: levelToPower,
    pointSourceLp: pointSourceLp, distanceAttenPoint: distanceAttenPoint,
    distanceAttenLine: distanceAttenLine, distanceAttenPlane: distanceAttenPlane,
    octaveFromThird: octaveFromThird
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.DbCalc = API;
  }
})(typeof window !== 'undefined' ? window : this);
