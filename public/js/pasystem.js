/*
 * pasystem.js — 电声系统与语言清晰度 计算内核（UMD）
 * 浏览器挂到 window.PaSystem，Node 下 module.exports。
 *
 * 覆盖：临界距离与 D/R、指定距离声压级、所需声功率级反算、扬声器电功率
 *       （灵敏度法）、扩声可用增益（声反馈）、STIPA 预测。
 *
 * STIPA：7 倍频带 × 2 调制频率（IEC 60268-16 标准配对），
 *   MTF = MTF_SNR × MTF_rev，STI = Σ log2(1+MTF)/14（与 psycho.js 同口径）。
 *   MTF_SNR = 1/(1+10^(−SNR/10))（SNR 上限 25 dB）；
 *   MTF_rev = 1/(1+(2πF·RT/(6·ln10))²)（IEC 60268-16 以能量衰减 h²(t)
 *   定义 MTF，指数衰减能量衰减率 13.8/RT）。
 */
(function (global) {
  'use strict';

  // STIPA 标准配对表（倍频带 Hz → 两个调制频率 Hz）
  var STIPA_PAIRS = [
    { band: 125, mf: [0.63, 12.5] },
    { band: 250, mf: [0.8, 10] },
    { band: 500, mf: [1.0, 8] },
    { band: 1000, mf: [1.25, 6.3] },
    { band: 2000, mf: [1.6, 5] },
    { band: 4000, mf: [2.0, 4] },
    { band: 8000, mf: [2.5, 3.15] }
  ];
  var OCT6 = [125, 250, 500, 1000, 2000, 4000];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function toLin(l) { return Math.pow(10, l / 10); }
  function fromLin(x) { return 10 * Math.log10(x); }
  function grade(sti) {
    return sti < 0.3 ? '很差' : sti < 0.45 ? '差' : sti < 0.6 ? '一般' : sti < 0.75 ? '良好' : '优秀';
  }
  function bandAt(arr, f) {
    var i = OCT6.indexOf(f);
    if (i >= 0 && num(arr[i]) != null) return num(arr[i]);
    return num(arr[arr.length - 1]); // 6 频带输入时 8k 以 4k 延拓
  }

  // 临界距离 rc = 0.141·√(Q·R)
  function criticalDistance(Q, R) {
    var q = num(Q); if (q == null || q <= 0) q = 1;
    var r = num(R);
    if (r == null || r <= 0) return null;
    return 0.141 * Math.sqrt(q * r);
  }

  // 指定距离声压级 Lp = Lw + 10lg[Q/(4πr²) + 4/R]
  function splAt(o) {
    var lw = num(o.Lw), q = num(o.Q), R = num(o.R), r = num(o.r);
    if (q == null || q <= 0) q = 1;
    if (lw == null || R == null || R <= 0 || r == null || r <= 0) {
      return { ok: false, error: '请输入有效的 Lw、房间常数 R 与距离 r' };
    }
    var direct = q / (4 * Math.PI * r * r);
    var rev = 4 / R;
    return {
      ok: true, lp: lw + 10 * Math.log10(direct + rev),
      direct: lw + 10 * Math.log10(direct),
      reverb: lw + 10 * Math.log10(rev),
      dr: direct / rev, rc: criticalDistance(q, R), r: r
    };
  }

  // 由目标声压级反算所需声功率级
  function requiredLw(o) {
    var lp = num(o.Lp), q = num(o.Q), R = num(o.R), r = num(o.r);
    if (q == null || q <= 0) q = 1;
    if (lp == null || R == null || R <= 0 || r == null || r <= 0) return null;
    return lp - 10 * Math.log10(q / (4 * Math.PI * r * r) + 4 / R);
  }

  // 扬声器电功率：灵敏度为 1m/1W 声压级，Q=1 时 Lw = Ls + 11 + 10lg(P)
  function ampPower(o) {
    var sens = num(o.sensitivity), lwReq = num(o.LwReq);
    if (sens == null || lwReq == null) return null;
    var dbw = lwReq - sens - 11;
    return { dbw: dbw, watts: Math.pow(10, dbw / 10), sens: sens, lwReq: lwReq };
  }

  // 扩声可用增益（声反馈稳定性）：G ≈ 20lg(rc/r_mic) − 10lg(NOM) − 裕量
  function usableGain(o) {
    var rc = num(o.rc), rm = num(o.rMic), nom = num(o.nom), margin = num(o.margin);
    if (nom == null || nom < 1) nom = 1;
    if (margin == null) margin = 6;
    if (rc == null || rc <= 0 || rm == null || rm <= 0) return null;
    return {
      gain: 20 * Math.log10(rc / rm) - 10 * Math.log10(nom) - margin,
      margin: margin, nom: nom, rc: rc, rMic: rm
    };
  }

  // 所需电声增益 = 听众处所需声压级 − 讲话人在话筒处声压级
  function neededGain(o) {
    var a = num(o.LpListenerReq), b = num(o.LpTalker);
    if (a == null || b == null) return null;
    return a - b;
  }

  // 混响 MTF（IEC 60268-16：基于能量衰减 h²(t)，衰减率 13.8/RT）
  function reverbMtf(RT, mf) {
    var rt = num(RT), m = num(mf);
    if (rt == null || rt <= 0 || m == null || m <= 0) return 1;
    var k = 2 * Math.PI * m * rt / (6 * Math.LN10);
    return 1 / (1 + k * k);
  }

  // STIPA 预测
  function stipaPredict(o) {
    var lw = o.Lw, nz = o.noise;
    var q = num(o.Q), R = num(o.R), r = num(o.r), RT = num(o.RT);
    if (q == null || q <= 0) q = 1;
    if (!lw || lw.length < 6 || R == null || R <= 0 || r == null || r <= 0) {
      return { ok: false, error: '请输入 6 频带声功率谱、房间常数 R 与距离 r' };
    }
    if (RT == null || RT <= 0) RT = 1.0;
    var direct = q / (4 * Math.PI * r * r);
    var rev = 4 / R;
    var rows = [];
    STIPA_PAIRS.forEach(function (p) {
      var lwB = bandAt(lw, p.band);
      var nzB = nz && nz.length >= 6 ? bandAt(nz, p.band) : -Infinity;
      var sig = lwB + 10 * Math.log10(direct + rev);
      var snr = isFinite(nzB) ? sig - nzB : 25;
      var mtfSnr = 1 / (1 + Math.pow(10, -Math.min(snr, 25) / 10));
      p.mf.forEach(function (mf) {
        rows.push({ band: p.band, mf: mf, snr: snr, mtf: mtfSnr * reverbMtf(RT, mf) });
      });
    });
    var s = 0;
    rows.forEach(function (x) { s += Math.log(1 + x.mtf) / Math.LN2; });
    var sti = s / rows.length;
    return { ok: true, rows: rows, sti: sti, grade: grade(sti), RT: RT };
  }

  var API = {
    C0: 343, STIPA_PAIRS: STIPA_PAIRS, OCT6: OCT6,
    num: num, toLin: toLin, fromLin: fromLin, grade: grade,
    criticalDistance: criticalDistance, splAt: splAt, requiredLw: requiredLw,
    ampPower: ampPower, usableGain: usableGain, neededGain: neededGain,
    reverbMtf: reverbMtf, stipaPredict: stipaPredict
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.PaSystem = API;
})(typeof window !== 'undefined' ? window : this);
