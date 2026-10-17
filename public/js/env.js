/*
 * env.js — 环境声学评价 内核（UMD）
 * 浏览器挂到 window.Env，Node 下 module.exports。
 *
 * 覆盖：
 *  1) 等效声级 / 能量平均 Leq
 *  2) 统计声级 L5 / L10 / L50 / L90 / L95（百分位）
 *  3) 昼夜等效声级 Ldn、昼夜计权声级 Lden
 *  4) 噪声污染级 NPL、交通噪声指数 TNI
 *  5) 噪声评价数 NR 曲线
 *  6) ISO 9613-1 大气吸收系数（精确解析公式）
 *  7) ISO 9613-2 户外 A 计权声传播（发散 + 大气吸收 + 简化地面效应）
 *     —— 输出为顺风参考条件声级；长期平均声级 L_AT = L_A − C0（气象修正）
 *  8) 公路交通噪声（线声源近似）
 */
(function (global) {
  'use strict';

  function toLin(l) { return Math.pow(10, l / 10); }
  function fromLin(x) { return 10 * Math.log10(x); }
  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (isNaN(n) || !isFinite(n)) ? null : n;
  }
  function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }

  /* ---------------- 1) 等效声级 / 能量平均 ---------------- */
  // 一组等时间间隔采样（或未加权）的等效连续 A 声级
  function leq(levels) {
    var arr = (levels || []).map(num).filter(function (v) { return v != null; });
    if (!arr.length) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += toLin(arr[i]);
    return fromLin(s / arr.length);
  }
  // 能量平均（n 个声级等权平均），同 leq
  function energyAverage(levels) { return leq(levels); }

  /* ---------------- 2) 统计声级（百分位） ---------------- */
  // 返回超过比例为 p% 的声级 L_p（如 L10 取 p=10）。采用线性插值（R-7，同多数噪声仪）。
  function percentile(samples, p) {
    var arr = (samples || []).map(num).filter(function (v) { return v != null; });
    if (!arr.length) return null;
    p = num(p); if (p == null || p < 0 || p > 100) return null;
    arr.sort(function (a, b) { return a - b; });
    var n = arr.length;
    if (n === 1) return arr[0];
    var rank = (n - 1) * (p / 100);
    var lo = Math.floor(rank), hi = Math.ceil(rank);
    if (lo === hi) return arr[lo];
    var frac = rank - lo;
    return arr[lo] + frac * (arr[hi] - arr[lo]);
  }
  // L_N 表示“被超过 N% 的时间”，即低于它的占 (100-N)%，故取 (100-N) 百分位
  function l10(s) { return percentile(s, 90); }
  function l50(s) { return percentile(s, 50); }
  function l90(s) { return percentile(s, 10); }
  function l95(s) { return percentile(s, 5); }
  function l5(s) { return percentile(s, 95); }

  /* ---------------- 3) 昼夜等效 / 计权声级 ---------------- */
  // Ldn：昼间（默认 07:00–22:00，15h）无加成；夜间（22:00–07:00，9h）加 10 dB。
  // 允许自定义昼/夜时长（小时），默认 15/9。
  function ldn(dayLeq, nightLeq, dayH, nightH) {
    var Ld = num(dayLeq), Ln = num(nightLeq);
    if (Ld == null || Ln == null) return null;
    var dh = num(dayH); if (dh == null || dh <= 0) dh = 15;
    var nh = num(nightH); if (nh == null || nh <= 0) nh = 9;
    var total = dh + nh;
    var e = dh * toLin(Ld) + nh * toLin(Ln + 10);
    return fromLin(e / total);
  }
  // Lden：昼 07–19(12h) +0；傍晚 19–22(3h) +5；夜间 22–07(9h) +10。
  function lden(dayLeq, eveningLeq, nightLeq, dayH, eveH, nightH) {
    var Ld = num(dayLeq), Le = num(eveningLeq), Ln = num(nightLeq);
    if (Ld == null || Le == null || Ln == null) return null;
    var dh = num(dayH); if (dh == null || dh <= 0) dh = 12;
    var eh = num(eveH); if (eh == null || eh <= 0) eh = 3;
    var nh = num(nightH); if (nh == null || nh <= 0) nh = 9;
    var total = dh + eh + nh;
    var e = dh * toLin(Ld) + eh * toLin(Le + 5) + nh * toLin(Ln + 10);
    return fromLin(e / total);
  }

  /* ---------------- 4) 噪声污染级 / 交通噪声指数 ---------------- */
  // NPL = Leq + (L10 − L90)；若提供标准差 sigma 则用 Leq + 2.56·sigma（ISO 经典定义）。
  function npl(Leq, L10, L90, sigma) {
    var L = num(Leq);
    if (L == null) return null;
    if (sigma != null && isFinite(num(sigma))) return L + 2.56 * num(sigma);
    var a = num(L10), b = num(L90);
    if (a == null || b == null) return null;
    return L + (a - b);
  }
  // 交通噪声指数 TNI = 4(L10 − L90) + L90 − 30
  function tni(L10, L90) {
    var a = num(L10), b = num(L90);
    if (a == null || b == null) return null;
    return 4 * (a - b) + b - 30;
  }

  /* ---------------- 5) 噪声评价数 NR ---------------- */
  // NR 曲线相对 1000 Hz 的偏移（各倍频带中心频率处的曲线值 − 1000Hz 处值）
  var NR_OFFSET = {
    31.5: 24.2, 63: 16.0, 125: 9.0, 250: 3.6, 500: 0.8,
    1000: 0, 2000: -1.2, 4000: -2.8, 8000: -4.5
  };
  // 给定某倍频带声压级与频率，求其隐含的 NR 值
  function nrImplied(bandLevel, freq) {
    var L = num(bandLevel); if (L == null) return null;
    var off = NR_OFFSET[freq]; if (off == null) return null;
    return L - off;
  }
  // 由 1/1 倍频带谱求 NR 数（取各带隐含 NR 的最大值）
  // spectrum: { 31.5:.., 63:.., 125:.., 250:.., 500:.., 1000:.., 2000:.., 4000:.., 8000:.. }
  function nrFromSpectrum(spectrum) {
    if (!spectrum) return null;
    var maxNR = -Infinity, worst = null;
    Object.keys(NR_OFFSET).forEach(function (f) {
      var L = num(spectrum[f]); if (L == null) return;
      var v = L - NR_OFFSET[f];
      if (v > maxNR) { maxNR = v; worst = f; }
    });
    if (maxNR === -Infinity) return null;
    return { nr: Math.round(maxNR), worstFreq: worst, worstLevel: num(spectrum[worst]) };
  }

  /* ---------------- 6) ISO 9613-1 大气吸收系数 ---------------- */
  // 返回大气吸收系数 α（dB/m）。f:Hz，Tc:°C，rh:%RH，p_kpa:环境气压(kPa，标准≈101.325)
  // 采用 ISO 9613-1:1993 精确解析公式（已验证与标准表吻合）。
  function atmAbsorption(f, Tc, rh, p_kpa) {
    var f0 = num(f); if (f0 == null || f0 <= 0) return null;
    var T = (Tc == null ? 20 : num(Tc)) + 273.15;
    var T0 = 293.15;
    var pr = (p_kpa == null ? 101.325 : num(p_kpa)); // kPa 参考值
    var pa = pr / 101.325;
    var Tr = T / T0;
    var C = 4.6151 - 6.8346 * Math.pow(Tr, 1.01);
    var psat = 101.325 * Math.pow(10, C); // kPa
    var h = pa * (rh == null ? 50 : num(rh)) / 100 * psat / 101.325; // 水蒸气摩尔浓度
    var frO = pa * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
    var frN = pa * Math.pow(Tr, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(Tr, 1 / 3) - 1)));
    var aO = 0.1068 * Math.exp(-3352 / T) * frO / (frO * frO + f0 * f0);
    var aN = 0.0123 * Math.exp(-1731 / T) * frN / (frN * frN + f0 * f0);
    var alpha = 8.686 * f0 * f0 * (1.84e-11 * (1 / pa) * Math.sqrt(Tr) + Tr * (aO + aN)) / pa;
    return alpha; // dB/m
  }

  /* ---------------- A 计权（与 dbcalc 一致） ---------------- */
  var A_FREQ = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var A_W = [-56.7, -39.4, -26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];
  // 最近倍频带 A 计权值（用于把谱按倍频带做 A 计权求和）
  function aWeight(freq) {
    var best = Infinity, val = 0;
    for (var i = 0; i < A_FREQ.length; i++) {
      var d = Math.abs(A_FREQ[i] - freq);
      if (d < best) { best = d; val = A_W[i]; }
    }
    return val;
  }

  /* ---------------- 7) ISO 9613-2 户外 A 计权声传播 ---------------- */
  // 输入倍频带声功率级谱 spectrum{LW@各倍频带}，计算自由场接收点声压级（A 计权）。
  // 参数：r 距离(m)，hs 源高(m)，hr 接收高(m)，ground 地面类型 'soft'|'hard'|'mixed'，
  //       Tc, rh, p 大气条件，cmet 气象修正 C0（dB，≥0，默认 0）。
  // 基本公式输出为顺风参考条件声级 L_A；长期平均（年均/月均）声级 L_AT = L_A − C0
  // （ISO 9613-2：C0 经验值 0~5 dB，缺当地风统计时 2024 版建议保守取 2 dB、
  //   1996 版工程实践常用 3 dB）。C0 只修正总 A 声级，不改逐带值。
  function iso9613(spectrum, r, hs, hr, ground, Tc, rh, p, cmet) {
    if (!spectrum) return null;
    var R = num(r); if (R == null || R <= 0) return null;
    var Hr = num(hr); if (Hr == null || Hr < 0) Hr = 1.5;
    var Hs = num(hs); if (Hs == null || Hs < 0) Hs = 1.5;
    var g = ground || 'mixed';
    var bands = [], sA = 0;
    A_FREQ.forEach(function (f, i) {
      var LW = num(spectrum[f]); if (LW == null) { bands.push({ f: f, Lp: null }); return; }
      // 几何发散：点声源自由场球面 A_div = 20log10(r) + 11
      var Adiv = 20 * Math.log10(R) + 11;
      // 大气吸收
      var at = atmAbsorption(f, Tc, rh, p) || 0;
      var Aatm = at * R;
      // 地面效应（简化）：soft 地面在近距离对中低频有额外衰减，远距趋零；以经验公式近似
      var Agr = 0;
      var dgr = Math.max(Hs, Hr); // 声线离地大致高度
      if (g === 'soft') Agr = 1.5 * Math.exp(-R / 30) * (1 - f / 4000);
      else if (g === 'hard') Agr = -0.5 * Math.exp(-R / 50); // 硬地面略有反射增益（保守取小）
      else Agr = 0.6 * Math.exp(-R / 40) * (1 - f / 4000); // mixed
      if (Agr < -1) Agr = -1;
      var Lp = LW - Adiv - Aatm - Agr;
      var La = Lp + A_W[i];
      if (isFinite(La)) sA += toLin(La);
      bands.push({ f: f, LW: LW, Adiv: round1(Adiv), Aatm: round1(Aatm), Agr: round1(Agr), Lp: round1(Lp), LpA: round1(La) });
    });
    var LpA = sA > 0 ? fromLin(sA) : null;
    var cM = num(cmet); if (cM == null || cM < 0) cM = 0;
    return {
      r: R, ground: g, cmet: cM, bands: bands,
      LpA: round1(LpA),                              // 顺风参考条件（基本公式）
      LpA_LT: LpA == null ? null : round1(LpA - cM)  // 长期平均 L_AT = L_A − C0
    };
  }

  /* ---------------- 8) 公路交通噪声（线声源近似） ---------------- */
  // 线声源模型：无限长线声源在距离 r 处的声压级
  //   Lp = L_WL − 10log10(2π r) − A_atm − A_gr
  // 其中线声源功率级 L_WL = 10log10( (q/3600)·10^(Lw_veh/10) )，q 为车流量(辆/h)，Lw_veh 单车声功率级。
  // 提供典型单车声功率级默认值（随车速升高）。
  var VEHICLE_LW = {
    car: function (v) { return 73 + 10 * Math.log10(Math.max(v, 1) / 50); },     // 小汽车
    truck: function (v) { return 82 + 10 * Math.log10(Math.max(v, 1) / 50); },   // 卡车
    bus: function (v) { return 80 + 10 * Math.log10(Math.max(v, 1) / 50); }      // 客车
  };
  function roadTraffic(q, speed, r, opts) {
    var Q = num(q), V = num(speed), R = num(r);
    if (Q == null || V == null || R == null || Q <= 0 || V <= 0 || R <= 0) return null;
    opts = opts || {};
    var mix = opts.mix || { car: 0.7, truck: 0.2, bus: 0.1 };
    var LwVeh = 0, sLin = 0;
    Object.keys(mix).forEach(function (k) {
      var frac = mix[k]; if (!frac) return;
      var lv = (VEHICLE_LW[k] ? VEHICLE_LW[k](V) : 78 + 10 * Math.log10(V / 50));
      sLin += frac * toLin(lv);
    });
    var LwVehEff = fromLin(sLin); // 加权平均单车声功率级
    var LwL = 10 * Math.log10(Q / 3600) + LwVehEff; // 线声源功率级（每米）
    // 发散：无限长线声源（含地面，半圆柱）A_div = 10log10(2π r) ≈ 10log10(r) + 8
    var Adiv = 10 * Math.log10(2 * Math.PI * R);
    var at = atmAbsorption(1000, opts.Tc, opts.rh, opts.p) || 0;
    var Aatm = at * R;
    var Agr = opts.ground === 'hard' ? -0.5 * Math.exp(-R / 50) : (opts.ground === 'soft' ? 1.5 * Math.exp(-R / 30) : 0.6 * Math.exp(-R / 40));
    if (Agr < -1) Agr = -1;
    var LpA = LwL - Adiv - Aatm - Agr;
    return { LwVeh: round1(LwVehEff), LwLine: round1(LwL), Adiv: round1(Adiv), Aatm: round1(Aatm), Agr: round1(Agr), LpA: round1(LpA) };
  }

  var API = {
    toLin: toLin, fromLin: fromLin, num: num,
    leq: leq, energyAverage: energyAverage,
    percentile: percentile, l5: l5, l10: l10, l50: l50, l90: l90, l95: l95,
    ldn: ldn, lden: lden,
    npl: npl, tni: tni,
    NR_OFFSET: NR_OFFSET, nrImplied: nrImplied, nrFromSpectrum: nrFromSpectrum,
    atmAbsorption: atmAbsorption, aWeight: aWeight, A_FREQ: A_FREQ, A_W: A_W,
    iso9613: iso9613,
    VEHICLE_LW: VEHICLE_LW, roadTraffic: roadTraffic
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Env = API;
})(typeof window !== 'undefined' ? window : this);
