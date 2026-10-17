/*
 * impact.js — 撞击声隔声评价内核（纯函数，无依赖）UMD
 *
 * 依据：
 *   - ISO 717-2 / GB/T 50121-2005：计权标准化撞击声压级 Ln,w（平移参考曲线法）
 *   - 归一化撞击声压级 Ln = L_i + 10lg(A/A₀)，A₀ = 10 m²
 *   - 标准化撞击声压级 LnT = L_i − 10lg(T/T₀)，T₀ = 0.5 s
 *   - 评价频带：1/3 倍频程 100~3150 Hz（16 带）
 *   - 参考曲线（ISO 717-2 / GB/T 50121）：逐 1/3 带 +1 dB（100 Hz 起 0 dB）
 *   - 不利偏差累计 ≤ 32.0 dB 且单带不利偏差 ≤ 8.0 dB（0.1 dB 步进）
 *
 * 楼板构造参考数据为常见工程估算（用于方案比选，非实验室实测值）。
 */
(function (global) {
  'use strict';

  var BANDS = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150];

  // 参考曲线：100 Hz 起 0 dB，每 1/3 倍频带 +1 dB（3150 Hz = +14 dB）
  var REF = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // 归一化撞击声压级（实验室/接收室实测）：Ln = Li + 10lg(A/A0)
  function normalize(Li, A) {
    var l = num(Li), a = num(A);
    if (l == null || a == null || !(a > 0)) return null;
    return l + 10 * Math.log10(a / 10);
  }

  // 标准化撞击声压级（现场测量）：LnT = Li − 10lg(T/T0)
  function standardized(Li, T) {
    var l = num(Li), t = num(T);
    if (l == null || t == null || !(t > 0)) return null;
    return l - 10 * Math.log10(t / 0.5);
  }

  // 输入频谱 → 16 带数组（允许 31.5/50/63 带被忽略；缺失带按 null 处理）
  function parseSpectrum(spec) {
    if (!spec || !spec.length) return null;
    var out = [];
    for (var i = 0; i < BANDS.length; i++) {
      var v = num(spec[i]);
      out.push(v);
    }
    var any = out.some(function (v) { return v != null; });
    return any ? out : null;
  }

  /**
   * 撞击声单值评价（平移参考曲线法）
   * @param {Array} spec 16 带撞击声压级（1/3 倍频程 100~3150）
   * @return {Object} { ok, lnw, offset, deviations, sumDev, maxDev, singleBandFail, bands }
   */
  function rating(spec) {
    var bands = parseSpectrum(spec);
    if (!bands) return { ok: false, error: '请至少输入一个 100~3150 Hz 1/3 倍频带的撞击声压级' };

    var filled = bands.map(function (v) { return v == null ? null : v; });
    var present = [];
    for (var i = 0; i < filled.length; i++) if (filled[i] != null) present.push(i);

    // 平移参考曲线：offset 从 0 起 +0.1 dB，直到不利偏差和 ≤ 32 且单带 ≤ 8
    var offset = 0;
    var sumDev, maxDev;
    for (; offset <= 200; offset += 0.1) {
      sumDev = 0; maxDev = 0;
      present.forEach(function (i) {
        var d = filled[i] - (REF[i] + offset);
        if (d > 0) { sumDev += d; if (d > maxDev) maxDev = d; }
      });
      if (sumDev <= 32.0 && maxDev <= 8.0) break;
    }
    if (offset > 200) { return { ok: false, error: '无法收敛：频谱过低或过高，检查输入' }; }

    var dev = bands.map(function (v, i) {
      if (v == null) return null;
      return Math.max(0, v - (REF[i] + offset));
    });
    var singleBandOk = present.every(function (i) { return bands[i] - (REF[i] + offset) <= 8.0; });

    return {
      ok: true,
      lnw: round1(offset),
      offset: round1(offset),
      sumDev: round1(sumDev),
      maxDev: round1(maxDev),
      singleBandOk: singleBandOk,
      bands: BANDS.slice(),
      ref: REF.slice(),
      curve: REF.map(function (r) { return round1(r + offset); }),
      dev: dev
    };
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  /* ---------- 楼板构造参考库（估算值，用于方案比选） ---------- */
  // 每档给出 500 Hz 撞击声压级参考值与相对频率形状（估算谱）
  var CONSTRUCTIONS = [
    {
      id: 'rc120',
      name: '钢筋混凝土楼板 120 mm（裸板）',
      l500: 79, shape: [9, 7, 6, 5, 4, 3, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8]
    },
    {
      id: 'rc150',
      name: '钢筋混凝土楼板 150 mm（裸板）',
      l500: 75, shape: [9, 7, 6, 5, 4, 3, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8]
    },
    {
      id: 'rc180',
      name: '钢筋混凝土楼板 180 mm（裸板）',
      l500: 72, shape: [9, 7, 6, 5, 4, 3, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8]
    },
    {
      id: 'rc120-tile',
      name: 'RC120 + 瓷砖/水磨石刚性面层（+3 dB）',
      l500: 76, shape: [9, 8, 6, 5, 4, 3, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8]
    },
    {
      id: 'rc120-wood',
      name: 'RC120 + 悬浮木地板（软面层）',
      l500: 66, shape: [10, 8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6]
    },
    {
      id: 'rc120-floating-pe',
      name: 'RC120 + 弹性垫（PE 5 mm）+ 50 mm 细石砼（浮筑）',
      l500: 60, shape: [13, 11, 10, 9, 7, 5, 3, 1, 0, -1, -2, -3, -4, -5, -6, -7]
    },
    {
      id: 'rc120-floating-rubber',
      name: 'RC120 + 橡胶垫（10 mm）+ 60 mm 细石砼（浮筑）',
      l500: 56, shape: [13, 11, 10, 9, 7, 5, 3, 1, 0, -1, -2, -3, -4, -5, -6, -7]
    },
    {
      id: 'wood-joist',
      name: '木龙骨楼板（木梁+衬板+木地板）',
      l500: 60, shape: [8, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8]
    }
  ];

  function constructionSpectrum(id) {
    for (var i = 0; i < CONSTRUCTIONS.length; i++) {
      if (CONSTRUCTIONS[i].id === id) {
        var c = CONSTRUCTIONS[i];
        return {
          id: c.id, name: c.name, L500: c.l500,
          spectrum: c.shape.map(function (s) { return c.l500 + s; }),
          note: '估算频谱（仅供方案比选，实验室结果以实测为准）'
        };
      }
    }
    return null;
  }

  /* ---------- 限值判定 ---------- */
  // LimitData 数据外的静态判定：给出限值（dB）与实测 LnT,w 比较
  function verdict(lnw, limitDb) {
    var lim = num(limitDb);
    if (lim == null) return null;
    return {
      ok: lnw <= lim,
      exceed: round1(lnw - lim),
      limit: lim
    };
  }

  var API = {
    BANDS: BANDS, REF: REF, CONSTRUCTIONS: CONSTRUCTIONS,
    normalize: normalize, standardized: standardized,
    parseSpectrum: parseSpectrum, rating: rating,
    constructionSpectrum: constructionSpectrum, verdict: verdict
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Impact = API;
})(typeof window !== 'undefined' ? window : globalThis);