/*
 * acoustics.js — 声学计算器计算内核
 * 纯函数，无依赖。UMD 包装：浏览器挂到 window.Acoustics，Node 下 module.exports。
 *
 * 指标：
 *   - A 计权声级 (A-weighted sound level)
 *   - NC 噪声标准曲线 (Noise Criterion, ANSI/ASA S12.2 切线插值法)
 *   - NR 噪声评价曲线 (Noise Rating, ISO/R 1996)
 *   - RC 房间标准曲线 Mark II (Room Criterion, ANSI/ASA S12.2 Annex D)
 */
(function (global) {
  'use strict';

  // 全指标共用的 9 个倍频带中心频率 (Hz)
  var BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];

  // IEC 61672 A 计权修正值 (dB)，相对 1000 Hz = 0
  var A_WEIGHTING = {
    31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6,
    500: -3.2, 1000: 0.0, 2000: 1.2, 4000: 1.0, 8000: -1.1
  };

  // NC 曲线表：63–8000 Hz 8 个倍频带，NC 指数 15..70（步长 5）
  // 来源：Beranek / ASHRAE (acousplan)，55–70 由相邻曲线线性外推
  var NC_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var NC_TABLE = [
    { n: 15, vals: [47, 36, 29, 22, 17, 14, 12, 11] },
    { n: 20, vals: [51, 40, 33, 26, 22, 19, 17, 16] },
    { n: 25, vals: [54, 44, 37, 31, 27, 24, 22, 21] },
    { n: 30, vals: [57, 48, 41, 35, 31, 29, 28, 27] },
    { n: 35, vals: [60, 52, 45, 40, 36, 34, 33, 32] },
    { n: 40, vals: [64, 56, 50, 45, 41, 39, 38, 37] },
    { n: 45, vals: [67, 60, 54, 49, 46, 44, 43, 42] },
    { n: 50, vals: [71, 64, 58, 54, 51, 49, 48, 47] },
    { n: 55, vals: [75, 68, 62, 58, 56, 54, 53, 52] },
    { n: 60, vals: [79, 74, 69, 65, 64, 62, 61, 60] },
    { n: 65, vals: [81, 77, 72, 69, 68, 66, 65, 64] },
    { n: 70, vals: [83, 79, 75, 72, 71, 70, 69, 68] }
  ];

  // NR 曲线表：31.5–8000 Hz 9 个倍频带，NR 指数 0..130（步长 10）
  // 63 Hz 列对应 ISO 经典 62.5 Hz 列（差值可忽略）。
  // 来源：ISO/R 1996 / BS EN（engineeringtoolbox、planning.org.uk）
  var NR_BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var NR_TABLE = [
    { n: 0,   vals: [55, 36, 22, 12, 5, 0, -4, -6, -8] },
    { n: 10,  vals: [62, 43, 31, 21, 15, 10, 7, 4, 2] },
    { n: 20,  vals: [69, 51, 39, 31, 24, 20, 17, 14, 13] },
    { n: 30,  vals: [76, 59, 48, 40, 34, 30, 27, 25, 23] },
    { n: 40,  vals: [83, 67, 57, 49, 44, 40, 37, 35, 33] },
    { n: 50,  vals: [89, 75, 66, 59, 54, 50, 47, 45, 44] },
    { n: 60,  vals: [96, 83, 74, 68, 63, 60, 57, 55, 54] },
    { n: 70,  vals: [103, 91, 83, 77, 73, 70, 68, 66, 64] },
    { n: 80,  vals: [110, 99, 92, 86, 83, 80, 78, 76, 74] },
    { n: 90,  vals: [117, 107, 100, 96, 93, 90, 88, 86, 85] },
    { n: 100, vals: [124, 115, 109, 105, 102, 100, 98, 96, 95] },
    { n: 110, vals: [130, 122, 118, 114, 112, 110, 108, 107, 105] },
    { n: 120, vals: [137, 130, 126, 124, 122, 120, 118, 117, 116] },
    { n: 130, vals: [144, 138, 135, 133, 131, 130, 128, 127, 126] }
  ];

  function toArray(levels) {
    if (Array.isArray(levels)) return levels;
    return BANDS.map(function (f) { return levels[f]; });
  }

  // 单频带插值求曲线指数 n（曲线值随 n 单调上升）
  function bandRating(table, bandIndex, L) {
    var pts = table.map(function (t) { return { n: t.n, v: t.vals[bandIndex] }; })
                   .sort(function (a, b) { return a.n - b.n; });
    if (L <= pts[0].v) {
      var p0 = pts[0], p1 = pts[1];
      var slope = (p1.n - p0.n) / (p1.v - p0.v);
      return p0.n + (L - p0.v) * slope;
    }
    var last = pts.length - 1;
    if (L >= pts[last].v) {
      var q0 = pts[last - 1], q1 = pts[last];
      var slope2 = (q1.n - q0.n) / (q1.v - q0.v);
      return q0.n + (L - q0.v) * slope2;
    }
    for (var j = 0; j < pts.length - 1; j++) {
      var a = pts[j], b = pts[j + 1];
      var lo = Math.min(a.v, b.v), hi = Math.max(a.v, b.v);
      if (L >= lo && L <= hi) {
        var s = (b.n - a.n) / (b.v - a.v);
        return a.n + (L - a.v) * s;
      }
    }
    return pts[last].n;
  }

  // ---- A 计权声级 ----
  function aWeighted(levels) {
    var arr = toArray(levels);
    var sum = 0;
    var linSum = 0;
    var contributions = BANDS.map(function (f, i) {
      var L = arr[i];
      var la = (L == null || isNaN(L)) ? null : L + A_WEIGHTING[f];
      if (la != null) sum += Math.pow(10, la / 10);
      if (L != null && !isNaN(L)) linSum += Math.pow(10, L / 10);
      return la;
    });
    var LA = (sum > 0) ? 10 * Math.log10(sum) : null;
    var Llin = (linSum > 0) ? 10 * Math.log10(linSum) : null;
    var silBands = [500, 1000, 2000, 4000];
    var sil = silBands.reduce(function (acc, f) {
      return acc + arr[BANDS.indexOf(f)];
    }, 0) / silBands.length;
    return { LA: LA, Llin: Llin, contributions: contributions, sil: sil };
  }

  // ---- NC 评价（切线插值法）----
  function ncRating(levels) {
    var arr = toArray(levels);
    var maxN = -Infinity, controlling = null;
    NC_BANDS.forEach(function (f, bi) {
      var i = BANDS.indexOf(f);
      var L = arr[i];
      if (L == null || isNaN(L)) return;
      var n = bandRating(NC_TABLE, bi, L);
      if (n > maxN) { maxN = n; controlling = f; }
    });
    if (maxN === -Infinity) return { value: null, designation: null, controllingBand: null };
    return {
      value: maxN,
      designation: Math.round(maxN / 5) * 5,
      controllingBand: controlling
    };
  }

  // ---- NR 评价（切线插值法）----
  function nrRating(levels) {
    var arr = toArray(levels);
    var maxN = -Infinity, controlling = null;
    NR_BANDS.forEach(function (f, bi) {
      var i = BANDS.indexOf(f);
      var L = arr[i];
      if (L == null || isNaN(L)) return;
      var n = bandRating(NR_TABLE, bi, L);
      if (n > maxN) { maxN = n; controlling = f; }
    });
    if (maxN === -Infinity) return { value: null, designation: null, controllingBand: null };
    return {
      value: maxN,
      designation: Math.round(maxN / 5) * 5,
      controllingBand: controlling
    };
  }

  // ---- RC 房间标准曲线 Mark II ----
  // RC 参考曲线：1000 Hz 处 = C，斜率 -5 dB/倍频程；16/31.5 Hz 设下限 max(C+25, 55)
  function rcCurve(C, f) {
    var raw = C + 5 * Math.log2(1000 / f);
    if (f <= 31.5) return Math.max(raw, C + 25, 55);
    return raw;
  }
  function rcRating(levels) {
    var arr = toArray(levels);
    var L500 = arr[BANDS.indexOf(500)];
    var L1000 = arr[BANDS.indexOf(1000)];
    var L2000 = arr[BANDS.indexOf(2000)];
    var LMF = (L500 + L1000 + L2000) / 3;
    var C = Math.round(LMF);
    var ref = BANDS.map(function (f) { return rcCurve(C, f); });

    var rumbleBands = [31.5, 63, 125, 250, 500];
    var hissBands = [2000, 4000, 8000];
    var rumble = false, hiss = false;
    var details = [];
    rumbleBands.forEach(function (f) {
      var i = BANDS.indexOf(f);
      var excess = arr[i] - ref[i];
      details.push({ band: f, excess: excess });
      if (excess > 5) rumble = true;
    });
    hissBands.forEach(function (f) {
      var i = BANDS.indexOf(f);
      var excess = arr[i] - ref[i];
      details.push({ band: f, excess: excess });
      if (excess > 3) hiss = true;
    });
    var cls = 'N';
    if (rumble && hiss) cls = 'RH';
    else if (rumble) cls = 'R';
    else if (hiss) cls = 'H';
    var rv = arr[BANDS.indexOf(31.5)] > 75;
    return {
      rc: C, lmf: LMF, classification: cls, ref: ref, rv: rv, details: details
    };
  }

  var Acoustics = {
    BANDS: BANDS,
    A_WEIGHTING: A_WEIGHTING,
    NC_BANDS: NC_BANDS,
    NC_TABLE: NC_TABLE,
    NR_BANDS: NR_BANDS,
    NR_TABLE: NR_TABLE,
    aWeighted: aWeighted,
    ncRating: ncRating,
    nrRating: nrRating,
    rcRating: rcRating,
    rcCurve: rcCurve,
    bandRating: bandRating
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Acoustics;
  } else {
    global.Acoustics = Acoustics;
  }
})(typeof window !== 'undefined' ? window : this);
