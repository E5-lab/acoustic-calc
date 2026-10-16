/*
 * vibeval.js — 振动评价 内核（UMD）
 * 浏览器挂到 window.VibEval，Node 下 module.exports。
 * 区别于 vibration.js（弹簧隔振设计），本模块聚焦"振动评价"：
 *  振动级换算、ISO 2631 频率计权、计权 RMS 加速度 aw、VDV、暴露限值、GB 10070 环境振动标准。
 */
(function (global) {
  'use strict';

  function toLin(l) { return Math.pow(10, l / 10); }
  function fromLin(x) { return 10 * Math.log10(x); }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }

  // 振动级参考值
  var A0 = 1e-6;   // 加速度参考 (m/s²)
  var V0 = 1e-9;   // 速度参考 (m/s)
  var D0 = 1e-12;  // 位移参考 (m)

  /* 1) 振动级换算 */
  function accelLevel(a) { var x = num(a); return x == null ? null : 20 * Math.log10(Math.abs(x) / A0); }
  function levelAccel(L) { var x = num(L); return x == null ? null : A0 * Math.pow(10, x / 20); }
  function velLevel(v) { var x = num(v); return x == null ? null : 20 * Math.log10(Math.abs(x) / V0); }
  function levelVel(L) { var x = num(L); return x == null ? null : V0 * Math.pow(10, x / 20); }
  function dispLevel(d) { var x = num(d); return x == null ? null : 20 * Math.log10(Math.abs(x) / D0); }
  function levelDisp(L) { var x = num(L); return x == null ? null : D0 * Math.pow(10, x / 20); }

  /* 2) 加速度 ↔ 速度 ↔ 位移（给定频率） */
  // v = a / (2πf)；d = v / (2πf) = a / (2πf)²
  function velFromAccel(a, f) { var A = num(a), F = num(f); if (A == null || F == null || F <= 0) return null; return A / (2 * Math.PI * F); }
  function accelFromVel(v, f) { var V = num(v), F = num(f); if (V == null || F == null || F <= 0) return null; return V * (2 * Math.PI * F); }
  function dispFromVel(v, f) { var V = num(v), F = num(f); if (V == null || F == null || F <= 0) return null; return V / (2 * Math.PI * F); }

  /* 3) ISO 2631-1 频率计权（1/1 倍频带，近似，归一化峰值≈0） */
  // Wb：建筑物内（连续/间歇）人体全身振动；Wc：建筑物内冲击/瞬态（如爆破）；
  // Wd：车间/精密作业；We：水面船舶。数值为相对衰减值(dB)，仅供工程估算。
  var WB = { 1: -9, 2: -3, 4: 0, 8: 0, 16: -3, 31.5: -9, 63: -14, 125: -19, 250: -24, 500: -29, 1000: -34 };
  var WC = { 1: -3, 2: 0, 4: 0, 8: -2, 16: -5, 31.5: -10, 63: -15, 125: -20, 250: -25, 500: -30, 1000: -35 };
  var WD = { 1: -12, 2: -7, 4: -3, 8: 0, 16: 0, 31.5: -4, 63: -9, 125: -14, 250: -19, 500: -24, 1000: -29 };
  var WE = { 1: 0, 2: 0, 4: -3, 8: -6, 16: -10, 31.5: -15, 63: -20, 125: -25, 250: -30, 500: -35, 1000: -40 };
  var WEIGHTS = { Wb: WB, Wc: WC, Wd: WD, We: WE };
  function weighting(type) { return WEIGHTS[type] || WB; }
  // 给定倍频带加速度级谱与计权类型，求计权总振动级（dB）
  function weightedLevel(spectrum, type) {
    if (!spectrum) return null;
    var w = weighting(type);
    var sum = 0, any = false;
    Object.keys(spectrum).forEach(function (f) {
      var L = num(spectrum[f]); if (L == null) return;
      var wf = parseFloat(f); if (isNaN(wf) || w[wf] == null) return;
      any = true;
      sum += toLin(L + w[wf]);
    });
    if (!any) return null;
    return fromLin(sum);
  }
  // 由计权总振动级反算计权 RMS 加速度 aw (m/s²)
  function awFromLevel(weightedDb) { var L = num(weightedDb); return L == null ? null : A0 * Math.pow(10, L / 20); }

  /* 4) 振动剂量值 VDV = (∫ a_w⁴ dt)^(1/4)（稳态近似：VDV = a_rms · Cf · T^(1/4)，T 秒） */
  function vdv(accelRms, seconds, crestFactor) {
    var a = num(accelRms), t = num(seconds);
    if (a == null || t == null || t <= 0) return null;
    var cf = num(crestFactor); if (cf == null || cf <= 0) cf = 1.4;
    return a * cf * Math.pow(t, 0.25);
  }

  /* 5) ISO 2631-1 暴露评价（每日 8h 基准的限值与行动值，按 √(t) 缩放） */
  // 8h 暴露限值 ELV = 1.15 m/s²；行动值 AV = 0.5 m/s²。限值随暴露时间缩放：aw·√t = 常数(8h)。
  var ELV_8H = 1.15, AV_8H = 0.5;
  function exposure(aw, hours) {
    var a = num(aw); var t = num(hours); if (a == null) return null; if (t == null || t <= 0) t = 8;
    var k = a * Math.sqrt(t);          // 与 8h 限值比较的等效量
    var elv = ELV_8H * Math.sqrt(8);   // = 1.15·√8 ≈ 3.252
    var av = AV_8H * Math.sqrt(8);      // = 0.5·√8  ≈ 1.414
    var verdict = k <= av ? '低于行动值（可接受）' : (k <= elv ? '超过行动值，未超暴露限值' : '超过暴露限值（危险）');
    return { aw: a, hours: t, k: round1(k), av: round1(av), elv: round1(elv), verdict: verdict };
  }

  /* 6) GB 10070 城市区域环境振动标准（铅垂向 Z 计权振动级，dB，快档） */
  // 适用地带类型 → [昼间, 夜间]
  var GB10070 = {
    '特殊住宅区': [65, 65],
    '居民文教区': [70, 67],
    '混合区/商业中心区': [75, 72],
    '工业集中区': [75, 72],
    '交通干线道路两侧': [75, 72],
    '铁路干线两侧': [80, 80]
  };
  function gb10070Limit(zone, dayNight) {
    var row = GB10070[zone]; if (!row) return null;
    return dayNight === 'night' ? row[1] : row[0];
  }
  function evaluateGb10070(measuredVL, zone, dayNight) {
    var L = num(measuredVL); var lim = gb10070Limit(zone, dayNight);
    if (L == null || lim == null) return null;
    return { measured: L, limit: lim, zone: zone, dayNight: dayNight === 'night' ? '夜间' : '昼间', ok: L <= lim, margin: round1(L - lim) };
  }

  var API = {
    A0: A0, V0: V0, D0: D0,
    accelLevel: accelLevel, levelAccel: levelAccel, velLevel: velLevel, levelVel: levelVel, dispLevel: dispLevel, levelDisp: levelDisp,
    velFromAccel: velFromAccel, accelFromVel: accelFromVel, dispFromVel: dispFromVel,
    WEIGHTS: WEIGHTS, weighting: weighting, weightedLevel: weightedLevel, awFromLevel: awFromLevel,
    vdv: vdv, ELV_8H: ELV_8H, AV_8H: AV_8H, exposure: exposure,
    GB10070: GB10070, gb10070Limit: gb10070Limit, evaluateGb10070: evaluateGb10070
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.VibEval = API;
})(typeof window !== 'undefined' ? window : this);
