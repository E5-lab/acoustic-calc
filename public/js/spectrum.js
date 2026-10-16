/*
 * spectrum.js — 频谱分析与计权内核（#/spectrum）
 *
 * 把测得的窄带 / 倍频程数据整理成可判定的结果：
 *   1) 频带：1/1 与 1/3 倍频程标称频率、上下限与带宽（ISO 266）
 *   2) 归并：窄带 → 倍频程的能量归并；1/1 ↔ 1/3 双向拆分与合并
 *   3) 计权：A / C / Z 计权网络（IEC 61672-1 解析式）与计权总级
 *   4) 评价：NR（ISO 1996 解析式）、NC（Beranek 表）曲线与评级
 *   5) 指标：总级、L_C − L_A 低频含量、PSIL / SIL 语言干扰级、频谱重心、分段 L_Aeq
 *
 * UMD：浏览器 window.Spectrum，Node require('./spectrum.js')。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Spectrum = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* ==================================================================
   * 标称频率（ISO 266）
   * ================================================================== */

  /** 1/1 倍频程标称中心频率，索引 6 对应 1000 Hz */
  var N1_1 = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  var I0_1 = 6;
  /** 1/3 倍频程标称中心频率，索引 17 对应 1000 Hz */
  var N1_3 = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
  ];
  var I0_3 = 17;

  function table(frac) { return frac === 1 ? N1_1 : N1_3; }
  function i0(frac) { return frac === 1 ? I0_1 : I0_3; }

  /** 由频率求频带序号（负幂方向） */
  function bandIndex(f, frac) {
    frac = frac === 1 ? 1 : 3;
    var x = parseFloat(f);
    if (!isFinite(x) || x <= 0) return null;
    return Math.round(frac * Math.log2(x / 1000));
  }

  /** 由频率求标称中心频率；超出表范围返回 null */
  function nominal(f, frac) {
    var i = bandIndex(f, frac);
    if (i == null) return null;
    var t = table(frac), j = i + i0(frac);
    return (j >= 0 && j < t.length) ? t[j] : null;
  }

  /** 有效带宽与上下限频率：f₂/f₁ = 2^(1/frac)，f_c = √(f₁f₂) */
  function bandEdges(fc, frac) {
    frac = frac === 1 ? 1 : 3;
    var c = parseFloat(fc);
    if (!isFinite(c) || c <= 0) return null;
    var r = Math.pow(2, 1 / (2 * frac));
    var f1 = c / r, f2 = c * r;
    return { fc: c, f1: f1, f2: f2, bw: f2 - f1, ratio: Math.pow(2, 1 / frac), frac: frac };
  }

  /** 相对带宽 (f₂−f₁)/f_c，百分比：1/1 为 70.71 %，1/3 为 23.16 % */
  function relBw(frac) {
    var r = Math.pow(2, 1 / (2 * (frac === 1 ? 1 : 3)));
    return (r - 1 / r) * 100;
  }

  /* ==================================================================
   * A / C / Z 计权（IEC 61672-1）
   * ================================================================== */

  var F_A1 = 20.6, F_A2 = 107.7, F_A3 = 737.9, F_A4 = 12194;

  /**
   * 计权衰减量（dB），加到线性（未计权）声压级上。
   *   A(f) = 20 lg [ f⁴·f₄² / ((f²+f₁²)·√((f²+f₂²)(f²+f₃²))·(f²+f₄²)) ] + 2.00
   *   C(f) = 20 lg [ f²·f₄² / ((f²+f₁²)(f²+f₄²)) ] + 0.062
   *   Z(f) = 0
   */
  function weighting(f, type) {
    var x = parseFloat(f);
    if (!isFinite(x) || x <= 0) return null;
    var t = String(type || 'a').toLowerCase();
    if (t === 'z') return 0;
    var f2 = x * x;
    var a1 = F_A1 * F_A1, a2 = F_A2 * F_A2, a3 = F_A3 * F_A3, a4 = F_A4 * F_A4;
    if (t === 'c') {
      var rc = (a4 * f2) / ((f2 + a1) * (f2 + a4));
      return 20 * Math.log10(rc) + 0.062;
    }
    var ra = (a4 * f2 * f2) /
      ((f2 + a1) * Math.sqrt((f2 + a2) * (f2 + a3)) * (f2 + a4));
    return 20 * Math.log10(ra) + 2.0;
  }

  /** 对一组频带求计权表 [{f, w}] */
  function weightTable(freqs, type) {
    return (freqs || []).map(function (f) {
      return { f: f, w: weighting(f, type) };
    });
  }

  /** 对 [{f, L}] 施加计权，返回 [{f, L, w, Lw}] */
  function applyWeighting(rows, type) {
    return (rows || []).map(function (r) {
      var w = weighting(r.f, type);
      return { f: r.f, L: r.L, w: w, Lw: (w == null || r.L == null) ? null : r.L + w };
    });
  }

  /* ==================================================================
   * 能量运算
   * ================================================================== */

  /** 能量求和：10 lg Σ 10^(L/10)；空数组返回 null */
  function totalLevel(levels) {
    var s = 0, n = 0;
    (levels || []).forEach(function (L) {
      var x = parseFloat(L);
      if (x == null || !isFinite(x)) return;
      s += Math.pow(10, x / 10); n++;
    });
    return n ? 10 * Math.log10(s) : null;
  }

  /** 能量平均（按个数平均后再取对数），用于频带均分 */
  function energyDivide(L, k) {
    var x = parseFloat(L);
    if (!isFinite(x)) return null;
    return x - 10 * Math.log10(Math.max(1, k));
  }

  /**
   * 窄带 / 任意频率点归并到倍频程：能量求和。
   * @param {Array} rows [{f, L}]
   * @param {number} frac 1 或 3
   * @returns {Array} [{fc, L, n, f1, f2}]
   */
  function mergeBands(rows, frac) {
    frac = frac === 1 ? 1 : 3;
    var map = {};
    (rows || []).forEach(function (r) {
      var f = parseFloat(r.f), L = parseFloat(r.L);
      if (!isFinite(f) || f <= 0 || !isFinite(L)) return;
      var i = bandIndex(f, frac);
      if (i == null) return;
      if (!map[i]) map[i] = { i: i, s: 0, n: 0 };
      map[i].s += Math.pow(10, L / 10);
      map[i].n++;
    });
    var t = table(frac), off = i0(frac);
    return Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (i) {
      var j = i + off;
      var fc = (j >= 0 && j < t.length) ? t[j] : 1000 * Math.pow(2, i / frac);
      var e = bandEdges(fc, frac);
      return {
        fc: fc, L: 10 * Math.log10(map[i].s), n: map[i].n,
        f1: e ? e.f1 : null, f2: e ? e.f2 : null
      };
    });
  }

  /** 1/1 拆分到 1/3：每三个 1/3 频带平分能量（各减 10 lg 3 = 4.77 dB） */
  function splitToThird(octRows) {
    var out = [];
    (octRows || []).forEach(function (r) {
      var i = bandIndex(r.fc != null ? r.fc : r.f, 1);
      if (i == null) return;
      for (var k = -1; k <= 1; k++) {
        var i3 = i * 3 + (k === -1 ? -1 : k === 0 ? 0 : 1);
        var j = i3 + I0_3;
        if (j < 0 || j >= N1_3.length) continue;
        out.push({
          fc: N1_3[j],
          L: energyDivide(r.L != null ? r.L : r.level, 3),
          parent: r.fc != null ? r.fc : r.f
        });
      }
    });
    return out;
  }

  /** 1/3 合并到 1/1：每三个一组能量求和 */
  function mergeToOctave(thirdRows) {
    var rows = (thirdRows || []).map(function (r) {
      return { f: r.fc != null ? r.fc : r.f, L: r.L != null ? r.L : r.level };
    });
    return mergeBands(rows, 1);
  }

  /**
   * 按时间分段求等效连续声级：L_eq = 10 lg [ Σ tᵢ·10^(Lᵢ/10) / Σ tᵢ ]
   * @param {Array} segs [{L, t}]
   */
  function leqFromSegments(segs) {
    var s = 0, T = 0;
    (segs || []).forEach(function (g) {
      var L = parseFloat(g.L), t = parseFloat(g.t);
      if (!isFinite(L)) return;
      var w = isFinite(t) && t > 0 ? t : 1;
      s += w * Math.pow(10, L / 10);
      T += w;
    });
    return T > 0 ? 10 * Math.log10(s / T) : null;
  }

  /* ==================================================================
   * NR 曲线（ISO 1996，解析式 L = a + b·N）
   * ================================================================== */

  /** NR 曲线的频带（1/1，31.5 ~ 8000 Hz） */
  var NR_BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var NR_A = [55.4, 35.5, 22.0, 12.0, 4.8, 0.0, -3.5, -6.1, -8.0];
  var NR_B = [0.681, 0.790, 0.870, 0.930, 0.974, 1.000, 1.015, 1.025, 1.030];

  /** NR-N 曲线在各频带的声压级数组 */
  function nrCurve(n) {
    var N = parseFloat(n);
    if (!isFinite(N)) return null;
    return NR_BANDS.map(function (f, i) {
      return { f: f, L: NR_A[i] + NR_B[i] * N };
    });
  }

  /**
   * 由 1/1 倍频程谱定 NR 评级：取各频带所需 N 的最大值，向上取整。
   * @param {object|Array} spectrum {31.5: L, 63: L, ...} 或 [{f, L}]
   */
  function nrRating(spectrum) {
    var rows = normalizeSpectrum(spectrum, NR_BANDS);
    var worst = -Infinity, govF = null, per = [];
    rows.forEach(function (r) {
      var i = NR_BANDS.indexOf(r.f);
      if (i < 0 || r.L == null) { per.push({ f: r.f, L: r.L, need: null, margin: null }); return; }
      var need = (r.L - NR_A[i]) / NR_B[i];
      var nUp = Math.ceil(need - 1e-9);
      var margin = (NR_A[i] + NR_B[i] * nUp) - r.L;
      per.push({ f: r.f, L: r.L, need: need, nUp: nUp, margin: margin });
      if (need > worst) { worst = need; govF = r.f; }
    });
    if (worst === -Infinity) return null;
    var n = Math.ceil(worst - 1e-9);
    return {
      n: n,
      exact: worst,
      governing: govF,
      curve: nrCurve(n),
      perBand: per,
      label: 'NR-' + n
    };
  }

  /* ==================================================================
   * NC 曲线（Beranek 表，63 ~ 8000 Hz）
   * ================================================================== */

  var NC_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var NC_N = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
  var NC_TABLE = [
    [47, 36, 29, 22, 17, 14, 12, 11], // NC-15
    [51, 40, 33, 26, 22, 19, 17, 16], // NC-20
    [54, 44, 37, 31, 27, 24, 22, 21], // NC-25
    [57, 48, 41, 35, 31, 29, 28, 27], // NC-30
    [60, 52, 45, 40, 36, 34, 33, 32], // NC-35
    [64, 56, 50, 45, 41, 39, 38, 37], // NC-40
    [67, 60, 54, 49, 46, 44, 43, 42], // NC-45
    [71, 64, 58, 54, 51, 49, 48, 47], // NC-50
    [74, 67, 62, 58, 56, 54, 53, 52], // NC-55
    [77, 71, 67, 63, 61, 59, 58, 57], // NC-60
    [80, 75, 71, 68, 66, 64, 63, 62], // NC-65
    [83, 79, 75, 72, 71, 70, 69, 68]  // NC-70
  ];

  /** NC-N 曲线（表内按 5 递增；非整 5 时线性插值） */
  function ncCurve(n) {
    var N = parseFloat(n);
    if (!isFinite(N)) return null;
    var lo = null, hi = null;
    for (var k = 0; k < NC_N.length; k++) {
      if (NC_N[k] <= N) lo = k;
      if (NC_N[k] >= N) { hi = k; break; }
    }
    if (lo == null) lo = hi;
    if (hi == null) hi = lo;
    return NC_BANDS.map(function (f, i) {
      var v;
      if (lo === hi) v = NC_TABLE[lo][i];
      else {
        var t = (N - NC_N[lo]) / (NC_N[hi] - NC_N[lo]);
        v = NC_TABLE[lo][i] + t * (NC_TABLE[hi][i] - NC_TABLE[lo][i]);
      }
      return { f: f, L: v };
    });
  }

  /**
   * 由 1/1 倍频程谱定 NC 评级：取各频带所需 N 的最大值，向上取整到 5 的倍数。
   */
  function ncRating(spectrum) {
    var rows = normalizeSpectrum(spectrum, NC_BANDS);
    var worst = -Infinity, govF = null, per = [];
    rows.forEach(function (r) {
      var i = NC_BANDS.indexOf(r.f);
      if (i < 0 || r.L == null) { per.push({ f: r.f, L: r.L, need: null, margin: null }); return; }
      var need = 70;
      for (var k = 0; k < NC_TABLE.length; k++) {
        if (NC_TABLE[k][i] >= r.L) { need = NC_N[k]; break; }
      }
      // 低于 NC-15 表首行时用首行外推（曲线随 N 单调上升）
      if (r.L < NC_TABLE[0][i]) need = 15 - (NC_TABLE[0][i] - r.L);
      per.push({ f: r.f, L: r.L, need: need, margin: ncCurve(need)[i].L - r.L });
      if (need > worst) { worst = need; govF = r.f; }
    });
    if (worst === -Infinity) return null;
    var n = Math.ceil(worst / 5) * 5;
    if (n < 15) n = 15;
    return {
      n: n,
      exact: worst,
      governing: govF,
      curve: ncCurve(n),
      perBand: per,
      label: 'NC-' + n
    };
  }

  /* ==================================================================
   * 派生指标
   * ================================================================== */

  /** L_C − L_A：差值大说明低频（或极低频）能量占比高 */
  function lcMinusLa(rows) {
    var lin = totalLevel(applyWeighting(rows, 'z').map(function (r) { return r.Lw; }));
    var la = totalLevel(applyWeighting(rows, 'a').map(function (r) { return r.Lw; }));
    var lc = totalLevel(applyWeighting(rows, 'c').map(function (r) { return r.Lw; }));
    if (lin == null || la == null || lc == null) return null;
    return { Lz: lin, LA: la, LC: lc, diff: lc - la };
  }

  /**
   * 语言干扰级：
   *   PSIL = (L₅₀₀ + L₁₀₀₀ + L₂₀₀₀) / 3（优先语言干扰级）
   *   SIL  = (L₁₀₀₀ + L₂₀₀₀ + L₄₀₀₀) / 3（经典语言干扰级）
   * @param {object} map {500: L, 1000: L, ...}
   */
  function sil(map) {
    function avg(fs) {
      var s = 0, n = 0;
      fs.forEach(function (f) {
        var v = parseFloat(map[f]);
        if (isFinite(v)) { s += v; n++; }
      });
      return n === fs.length && n ? s / n : null;
    }
    var p = avg([500, 1000, 2000]);
    var c = avg([1000, 2000, 4000]);
    return {
      psil: p, sil: c,
      /** PSIL 与正常会话距离的经验关系（dB → 可靠交谈距离 m） */
      note: p == null ? null : (p <= 35 ? '正常会话轻松，电话良好' :
        p <= 45 ? '1~2 m 正常会话尚可' :
          p <= 55 ? '需提高嗓门，1 m 内勉强' :
            p <= 65 ? '1 m 内需大声喊' : '几乎无法交谈')
    };
  }

  /** 频谱重心（能量加权平均频率，Hz）与几何重心 */
  function centroid(rows) {
    var sw = 0, sf = 0, slog = 0, ok = false;
    (rows || []).forEach(function (r) {
      var f = parseFloat(r.f), L = parseFloat(r.L != null ? r.L : r.level);
      if (!isFinite(f) || f <= 0 || !isFinite(L)) return;
      var w = Math.pow(10, L / 10);
      sw += w; sf += w * f; slog += w * Math.log(f); ok = true;
    });
    if (!ok || sw <= 0) return null;
    return { linear: sf / sw, geometric: Math.exp(slog / sw) };
  }

  /** 归一化输入：{freq: L} 对象或 [{f, L}] 数组 → 按给定频带顺序输出 [{f, L}] */
  function normalizeSpectrum(spectrum, bands) {
    var out = [];
    if (Array.isArray(spectrum)) {
      spectrum.forEach(function (r) {
        out.push({ f: parseFloat(r.f != null ? r.f : r.fc), L: parseFloat(r.L != null ? r.L : r.level) });
      });
      return out;
    }
    var src = spectrum || {};
    (bands || []).forEach(function (f) {
      out.push({ f: f, L: isFinite(parseFloat(src[f])) ? parseFloat(src[f]) : null });
    });
    return out;
  }

  return {
    N1_1: N1_1,
    N1_3: N1_3,
    NR_BANDS: NR_BANDS,
    NC_BANDS: NC_BANDS,
    NC_N: NC_N,
    NC_TABLE: NC_TABLE,

    bandIndex: bandIndex,
    nominal: nominal,
    bandEdges: bandEdges,
    relBw: relBw,

    weighting: weighting,
    weightTable: weightTable,
    applyWeighting: applyWeighting,

    totalLevel: totalLevel,
    energyDivide: energyDivide,
    mergeBands: mergeBands,
    splitToThird: splitToThird,
    mergeToOctave: mergeToOctave,
    leqFromSegments: leqFromSegments,

    nrCurve: nrCurve,
    nrRating: nrRating,
    ncCurve: ncCurve,
    ncRating: ncRating,

    lcMinusLa: lcMinusLa,
    sil: sil,
    centroid: centroid,
    normalizeSpectrum: normalizeSpectrum
  };
});
