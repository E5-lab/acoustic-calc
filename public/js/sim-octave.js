/*
 * sim-octave.js — 倍频程频谱模拟内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimOctave，Node 下 module.exports。
 *
 * 功能：输入 1/1 倍频程 9 个频带的声压级（dB），
 *   计算总声级（不加权）与 A/C/Z 计权总声级、主频等信息。
 *
 * 公式来源（公开经典声学标准，IEC 61672 / GB 3785 计权曲线，
 *   取 1/1 倍频程中心频率处的标称修正值，不含任何第三方商业实现）：
 *   - 总声级 L = 10·log10( Σ 10^(Li/10) )
 *   - 计权总声级 L_W = 10·log10( Σ 10^((Li + Wi)/10) )，W ∈ {A, C, Z}
 *   - 各频带修正值（dB）：A 计权明显压低低频、对中高频略作提升。
 *
 * 中心频率（Hz）：31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000
 */
(function (global) {
  'use strict';

  // 1/1 倍频程中心频率
  var FREQS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];

  // 各频带计权修正值（dB）
  var Aweight = [-39.4, -26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];
  var Cweight = [-3.0, -0.8, -0.2, 0, 0, 0, -0.2, -0.8, -3.0];
  var Zweight = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  function toDb(sumPower) {
    // sumPower = Σ 10^(x/10)，避免单点 +∞/NaN
    if (!(sumPower > 0) || !isFinite(sumPower)) return null;
    return 10 * Math.log10(sumPower);
  }

  function sumWeighted(levels, weights) {
    var s = 0;
    for (var i = 0; i < levels.length; i++) {
      s += Math.pow(10, (levels[i] + weights[i]) / 10);
    }
    return toDb(s);
  }

  /*
   * analyze(levels)
   *   levels: 长度为 9 的数组，各元素为对应频带的声压级 Li（dB，有限实数）
   * 返回：
   *   { ok:true, bands, total, totalA, totalC, totalZ, dominantFreq, notes }
   *   bands[i] = { freq, level:L_i, aW, cW, zW, weightedLevel(=L_i+Wi，Z 即原值) }
   *   dominantFreq: Li 最大所在频带的频率
   *   校验失败返回 { ok:false, error }
   */
  function analyze(levels) {
    if (!Array.isArray(levels) || levels.length !== 9) {
      return { ok: false, error: 'levels 必须为长度 9 的数组（对应 9 个倍频程）' };
    }
    for (var i = 0; i < 9; i++) {
      if (typeof levels[i] !== 'number' || !isFinite(levels[i])) {
        return { ok: false, error: '第 ' + (i + 1) + ' 个频带（' + FREQS[i] + ' Hz）的值不是有限实数' };
      }
    }

    var bands = [];
    var sumTotal = 0; // Σ 10^(Li/10)
    var maxLevel = -Infinity;
    var domIndex = 0;

    for (var j = 0; j < 9; j++) {
      var Li = levels[j];
      sumTotal += Math.pow(10, Li / 10);
      if (Li > maxLevel) { maxLevel = Li; domIndex = j; }
      bands.push({
        freq: FREQS[j],
        level: Li,
        aW: Aweight[j],
        cW: Cweight[j],
        zW: Zweight[j],
        // 计权后的等效声级（用于绘图叠加），Z 计权即原值
        weightedLevel: Li + Zweight[j]
      });
    }

    var total = toDb(sumTotal);
    var totalA = sumWeighted(levels, Aweight);
    var totalC = sumWeighted(levels, Cweight);
    var totalZ = sumWeighted(levels, Zweight);

    var notes = [
      'A 计权在人耳低频段施加较大负修正（31.5 Hz 约 −39.4 dB），显著压低低频贡献，更接近主观响度感受。',
      'Z 计权（零计权）即线性总声级；C 计权低频衰减很小，常用于峰值/脉冲声评价。'
    ];

    return {
      ok: true,
      bands: bands,
      total: total,
      totalA: totalA,
      totalC: totalC,
      totalZ: totalZ,
      dominantFreq: FREQS[domIndex],
      notes: notes
    };
  }

  var API = {
    FREQS: FREQS,
    Aweight: Aweight,
    Cweight: Cweight,
    Zweight: Zweight,
    analyze: analyze
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimOctave = API;
  }
})(typeof window !== 'undefined' ? window : this);
