/*
 * psycho.js — 心理声学 / 声品质 内核（UMD）
 * 浏览器挂到 window.Psy，Node 下 module.exports。
 *
 * 说明：phon↔sone、PNL/Noy、STIPA 为精确/标准实现；Sharpness、Roughness、Fluctuation
 * 采用经典模型（Zwicker / DIN 45692）的工程近似，已在注释与界面标注。
 */
(function (global) {
  'use strict';

  function toLin(l) { return Math.pow(10, l / 10); }
  function fromLin(x) { return 10 * Math.log10(x); }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }

  /* 1) 响度级(phon) ↔ 响度(sone) —— 精确 */
  // Stevens：N = 2^((L_N − 40)/10)；L_N = 40 + 10·log2(N)
  function phonToSone(phon) { var p = num(phon); if (p == null) return null; if (p <= 0) return 0; return Math.pow(2, (p - 40) / 10); }
  function soneToPhon(sone) { var s = num(sone); if (s == null || s <= 0) return null; return 40 + 10 * Math.log2(s); }

  /* 2) 倍频带 → Bark 临界带率 */
  function hzToBark(f) { return 13 * Math.atan(0.76 * f / 1000) + 3.5 * Math.pow(Math.atan(f / 7500), 2); }

  /* 3) 总响度估算（简化，各频带响度之和） —— 工程估算，仅供参考 */
  // 以各倍频带声压级视为该带中心频率的响度级，按 phon→sone 求和。
  function bandLoudnessEstimate(spectrum) {
    if (!spectrum) return null;
    var total = 0, n = 0;
    Object.keys(spectrum).forEach(function (k) {
      var L = num(spectrum[k]); if (L == null) return;
      total += phonToSone(L); n++;
    });
    if (!n) return null;
    return { sones: total, bands: n };
  }

  /* 4) 尖锐度 Sharpness（DIN 45692 近似） */
  // S = 0.11 · Σ g(z)·N'(z)·z / Σ N'(z)，g(z) 为 Aures 高频修正：z≤14 取 1，否则 0.15·e^(0.42(z−14))。
  // 以各带 sone 近似 N'(z)（未做精细临界带归一，作工程估算）。
  function sharpness(spectrum) {
    if (!spectrum) return null;
    var num_ = 0, den = 0;
    Object.keys(spectrum).forEach(function (k) {
      var L = num(spectrum[k]); if (L == null) return;
      var f = parseFloat(k); if (isNaN(f)) return;
      var z = hzToBark(f);
      var Np = phonToSone(L);
      var g = z <= 14 ? 1 : 0.15 * Math.exp(0.42 * (z - 14));
      num_ += g * Np * z; den += Np;
    });
    if (den <= 0) return null;
    return 0.11 * num_ / den; // acum
  }

  /* 5) 粗糙度 Roughness / 6) 抖动度 Fluctuation（Zwicker 经典模型，给定调制） */
  // 输入：调制频率 fmod(Hz)、调制深度 m(0~1)、整体响度 N(sones)。
  // Roughness 在 fmod≈70Hz 峰值；Fluctuation 在 fmod≈4Hz 峰值。
  function roughness(fmod, m, N) {
    var fm = num(fmod), dep = num(m), n = num(N);
    if (fm == null || dep == null || n == null) return null;
    if (fm <= 0 || dep < 0 || dep > 1 || n <= 0) return 0;
    // 调制权重（Zwicker）：以 70Hz 为中心的高斯型
    var w = Math.exp(-0.5 * Math.pow((Math.log10(fm / 70) / 0.3), 2));
    return 0.3 * dep * dep * Math.sqrt(dep) * n * w;
  }
  function fluctuation(fmod, m, N) {
    var fm = num(fmod), dep = num(m), n = num(N);
    if (fm == null || dep == null || n == null) return null;
    if (fm <= 0 || dep < 0 || dep > 1 || n <= 0) return 0;
    // 调制权重（Zwicker）：以 4Hz 为中心的窄带
    var w = Math.exp(-0.5 * Math.pow((Math.log10(fm / 4) / 0.2), 2));
    return 0.008 * dep * n * w;
  }

  /* 7) 感觉噪声级 PNL / Noy（基于 1/1 倍频带，简化） */
  // PNdB 对各带的修正（相对于 dB，1kHz≈0；低/高频为正）。PNdB_i = L_i + off_i（已为 dB 量级）。
  // Noy_i = 10^(PNdB_i/10)；PNL = 10·log10(Σ Noy_i)。参考：1kHz 单带 80dB → PNL=80。
  var PNL_OFFSET = {
    31.5: 20, 63: 11, 125: 5, 250: 1.5, 500: 0.5, 1000: 0, 2000: -0.5, 4000: 0, 8000: 4
  };
  function pnlt(spectrum) {
    if (!spectrum) return null;
    var sum = 0, any = false;
    Object.keys(PNL_OFFSET).forEach(function (f) {
      var L = num(spectrum[f]); if (L == null) return;
      any = true;
      var noy = Math.pow(10, (L + PNL_OFFSET[f]) / 10);
      sum += noy;
    });
    if (!any) return null;
    return fromLin(sum); // PNL(dB)
  }

  /* 8) STIPA / STI（精确，14 个调制带） */
  // STI = Σ w_i · log10(1 + MTF_i) / log10(2)，MTF_i∈[0,1] 为各带调制传输。权重和=1。
  var STIPA_W = 1 / 14; // 14 个调制带等权，权重和=1（简化 STIPA）
  var STIPA_BANDS = [ // 调制频率(Hz) 与 权重
    { f: 0.63, w: STIPA_W }, { f: 0.8, w: STIPA_W }, { f: 1.0, w: STIPA_W }, { f: 1.25, w: STIPA_W },
    { f: 1.6, w: STIPA_W }, { f: 2.0, w: STIPA_W }, { f: 2.5, w: STIPA_W }, { f: 3.15, w: STIPA_W },
    { f: 4.0, w: STIPA_W }, { f: 5.0, w: STIPA_W }, { f: 6.3, w: STIPA_W }, { f: 8.0, w: STIPA_W },
    { f: 10.0, w: STIPA_W }, { f: 12.5, w: STIPA_W }
  ];
  function stipa(mtfArray) {
    if (!mtfArray || !mtfArray.length) return null;
    var s = 0, wsum = 0;
    for (var i = 0; i < STIPA_BANDS.length; i++) {
      var m = num(mtfArray[i]); if (m == null) m = 0;
      if (m < 0) m = 0; if (m > 1) m = 1;
      s += STIPA_BANDS[i].w * Math.log10(1 + m) / Math.log10(2);
      wsum += STIPA_BANDS[i].w;
    }
    var sti = s / wsum; // ∈[0,1]
    var grade = sti < 0.3 ? '很差' : sti < 0.45 ? '差' : sti < 0.6 ? '一般' : sti < 0.75 ? '良好' : '优秀';
    return { sti: sti, grade: grade };
  }
  // 由各倍频带信噪比 SNR_i(dB) 推算 MTF_i = 1/(1+10^(−SNR_i/10))（简化），再求 STI
  function stipaFromSnr(snrArray) {
    if (!snrArray || !snrArray.length) return null;
    var mtf = snrArray.map(function (s) {
      var x = num(s); if (x == null) return 0;
      return 1 / (1 + Math.pow(10, -x / 10));
    });
    return stipa(mtf);
  }

  var API = {
    toLin: toLin, fromLin: fromLin, num: num,
    phonToSone: phonToSone, soneToPhon: soneToPhon,
    hzToBark: hzToBark,
    bandLoudnessEstimate: bandLoudnessEstimate,
    sharpness: sharpness, roughness: roughness, fluctuation: fluctuation,
    PNL_OFFSET: PNL_OFFSET, pnlt: pnlt,
    STIPA_BANDS: STIPA_BANDS, stipa: stipa, stipaFromSnr: stipaFromSnr
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Psy = API;
})(typeof window !== 'undefined' ? window : this);
