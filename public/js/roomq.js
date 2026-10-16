/*
 * roomq.js — 厅堂与扩声音质 内核（UMD）
 * 浏览器挂到 window.RoomQ，Node 下 module.exports。
 * 区别于 room.js（混响时间/吸声材料），本模块聚焦"音质评价量"与"扩声系统预测"：
 *  混响/早期衰减(RT60/EDT)、清晰度(C50/C80)、定义度(D50)、中心时间(Ts)、强度因子(G)、
 *  房间常数/临界距离/直达+混响声场（扩声预测）。
 */
(function (global) {
  'use strict';

  function toLin(l) { return Math.pow(10, l / 10); }
  function fromLin(x) { return 10 * Math.log10(x); }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }

  /* 1) RT60 / EDT（由衰减时间外推） */
  // 给定 10/20/30 dB 衰减时间(s)，RT60 = 6·T10 = 3·T20 = 2·T30；EDT = 6·T10（仅前 10dB 斜率）。
  function rtFromDecay(t10, t20, t30) {
    var T10 = num(t10), T20 = num(t20), T30 = num(t30);
    var r = {};
    if (T10 != null && T10 > 0) { r.edt = 6 * T10; r.rt60_from10 = 6 * T10; }
    if (T20 != null && T20 > 0) r.rt60_from20 = 3 * T20;
    if (T30 != null && T30 > 0) r.rt60_from30 = 2 * T30;
    // 优选：优先 T30，其次 T20，其次 T10
    r.rt60 = r.rt60_from30 != null ? r.rt60_from30 : (r.rt60_from20 != null ? r.rt60_from20 : r.rt60_from10);
    return Object.keys(r).length ? r : null;
  }

  /* 2) 清晰度/定义度（由能量份额） */
  // 输入均为"线性能量"（如脉冲响应积分值，可带相对量纲）。
  // C50 = 10log10(E50 / (Etot − E50))，C80 = 10log10(E80 / (Etot − E80))，D50 = E50/Etot·100%
  function roomMetrics(E50, E80, Etot) {
    var e50 = num(E50), e80 = num(E80), et = num(Etot);
    if (e50 == null || e80 == null || et == null || et <= 0 || e80 > et || e50 > et) return null;
    var late50 = et - e50, late80 = et - e80;
    if (late50 <= 0 || late80 <= 0) return null;
    return { c50: 10 * Math.log10(e50 / late50), c80: 10 * Math.log10(e80 / late80), d50: 100 * e50 / et };
  }

  /* 3) 中心时间 Ts = Σ t·E(t) / Σ E(t)（t 秒，E 以 dB 给出） */
  function centerTime(times, levels) {
    if (!times || !levels || times.length !== levels.length || !times.length) return null;
    var num2 = 0, den = 0;
    for (var i = 0; i < times.length; i++) {
      var t = num(times[i]), l = num(levels[i]); if (t == null || l == null) continue;
      var e = toLin(l);
      num2 += t * e; den += e;
    }
    if (den <= 0) return null;
    return num2 / den; // 秒
  }

  /* 4) 强度因子 G = Lp − Lw + 10log10(4π r²)（点声源，r 米） */
  function strengthFactor(Lp, Lw, r) {
    var lp = num(Lp), lw = num(Lw), rr = num(r);
    if (lp == null || lw == null || rr == null || rr <= 0) return null;
    return lp - lw + 10 * Math.log10(4 * Math.PI * rr * rr);
  }

  /* 5) 房间常数 R = S·ᾱ / (1 − ᾱ) */
  function roomConstant(S, aBar) {
    var s = num(S), a = num(aBar);
    if (s == null || a == null || a < 0 || a >= 1) return null;
    return s * a / (1 - a);
  }
  /* 5b) 临界距离 r_c = 0.141·√(Q·R) */
  function criticalDistance(Q, R) {
    var q = num(Q), rr = num(R);
    if (q == null || rr == null || rr <= 0 || q <= 0) return null;
    return 0.141 * Math.sqrt(q * rr);
  }
  /* 5c) 扩声声场：Lp = Lw + 10log10( Q/(4πr²) + 4/R )（直达 + 混响） */
  function reinforcementLp(Lw, Q, r, R) {
    var lw = num(Lw), q = num(Q), rr = num(r), Rr = num(R);
    if (lw == null || q == null || rr == null || Rr == null || rr <= 0 || Rr <= 0) return null;
    var direct = q / (4 * Math.PI * rr * rr);
    var rev = 4 / Rr;
    return lw + 10 * Math.log10(direct + rev);
  }

  var API = {
    toLin: toLin, fromLin: fromLin, num: num,
    rtFromDecay: rtFromDecay, roomMetrics: roomMetrics, centerTime: centerTime,
    strengthFactor: strengthFactor, roomConstant: roomConstant, criticalDistance: criticalDistance, reinforcementLp: reinforcementLp
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.RoomQ = API;
})(typeof window !== 'undefined' ? window : this);
