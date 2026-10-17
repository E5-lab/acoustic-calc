/*
 * stipa.js — STIPA 语言传输指数实测内核（纯函数，无 DOM）
 * UMD 包装：浏览器挂到 window.Stipa，Node 下 module.exports。
 * 依赖 aural.js（fft / nextPow2）、siggen.js（bandNoise）。
 *
 * 依据 IEC 60268-16（STIPA，Annex F）：
 *   - 7 个倍频带噪声载波（125 Hz – 8 kHz），每带被 2 个低频正弦调制
 *     （调制频率集合 0.63–12.5 Hz 共 14 个，每频率恰好出现一次）；
 *   - 调制分配表（Table F.1，3M Verifier 手册 / IEC 60268-16 一致口径）：
 *       125 Hz: 1.00 / 5.00    250 Hz: 0.63 / 3.15    500 Hz: 2.00 / 10.0
 *       1 kHz : 1.25 / 6.30    2 kHz : 0.80 / 4.00    4 kHz : 2.50 / 12.5
 *       8 kHz : 1.60 / 8.00
 *   - MTF 提取：倍频带带通 → Hilbert 包络 → 去均值 → FFT → 调制频率处幅度；
 *     视在信噪比 SNR = 10·lg(m/(1−m))（限幅 ±15 dB），每带取 2 个频率平均；
 *   - STI = Σ W_k·(SNR_k+15)/30 / Σ W_k，W 取 IEC 60268-16:2011 Table 4 男声权重；
 *   - 发射端调制深度 m_tx = 0.5（MTF 为收/发深度比，深度取值不影响结果）。
 *
 * 定位：工程估算与教学演示。浏览器麦克风/扬声器频响有限（尤其 8 kHz 带），
 * 结果与专业 STIPA 仪（经校准测量传声器）可能有偏差，正式验收以专业仪器为准。
 */
(function (global) {
  'use strict';

  var Aural = (typeof module !== 'undefined' && module.exports) ? require('./aural.js') : global.Aural;
  var SigGen = (typeof module !== 'undefined' && module.exports) ? require('./siggen.js') : global.SigGen;
  var fft = Aural.fft, nextPow2 = Aural.nextPow2;

  var BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
  var MOD_FREQS = [0.63, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0, 6.3, 8.0, 10.0, 12.5];
  /* 每带 2 个调制频率（IEC 60268-16 Table F.1 口径） */
  var MOD_MATRIX = [
    [1.0, 5.0], [0.63, 3.15], [2.0, 10.0], [1.25, 6.3], [0.8, 4.0], [2.5, 12.5], [1.6, 8.0]
  ];
  /* IEC 60268-16:2011 Table 4 男声计权（按 ΣW 归一，等价于归一化权重） */
  var W_MALE = [0.085, 0.127, 0.230, 0.233, 0.309, 0.224, 0.173];
  var MOD_DEPTH = 0.5;

  /* ---------- STIPA 测试信号 ----------
   * 载波频带规划（与 bandpass 分析滤波器配套，抑制相邻倍频带泄漏）：
   *   分析通带 = [fc/√2, fc·√2]，过渡带 ±6%（raised-cosine）；
   *   载波平坦区收缩 6%（shrink=1.06），skirt 在 1% 内衰减 -40 dB
   *   （edgeRatio=1.01）——载波能量在分析过渡带内已低于 -40 dB，
   *   相邻带载波泄入分析通带的振幅 < 0.1%，MTF 不被稀释。
   */
  function signal(n, sr, seed) {
    if (!(n > 0) || !(sr > 0)) return null;
    var x = new Float64Array(n);
    for (var b = 0; b < BANDS.length; b++) {
      var carrier = SigGen.bandNoise(n, sr, BANDS[b], -40, (seed || 20261017) + b * 977,
        { shrink: 1.06, edgeRatio: 1.01 });
      var f1 = MOD_MATRIX[b][0], f2 = MOD_MATRIX[b][1];
      for (var i = 0; i < n; i++) {
        var t = i / sr;
        var env = 1 + MOD_DEPTH * Math.cos(2 * Math.PI * f1 * t) + MOD_DEPTH * Math.cos(2 * Math.PI * f2 * t);
        x[i] += carrier[i] * env;
      }
    }
    return SigGen.normalizePeak(x, 0.89);
  }

  /* ---------- 倍频带带通（FFT 开窗，带内平坦 / 带外 raised-cosine 过渡） ----------
   * 频带规划（与 signal() 的载波生成配套，抑制相邻倍频带泄漏）：
   *   分析通带 = [fc/√2, fc·√2]，过渡带 ±6%（edgeRatio 默认 1.06）；
   *   载波平坦区收缩 6%（shrink=1.06）、过渡带 ±6%、带边沿 -40 dB。
   * 两者过渡带占据同一频区，但载波在分析带边沿处已衰减 40 dB，
   * 相邻带载波泄入分析通带的能量 < 0.01%，MTF 不被稀释。
   */
  function bandpass(x, sr, fc, edgeRatio) {
    edgeRatio = edgeRatio || 1.06;
    var n = x.length;
    var N = nextPow2(n);
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var i = 0; i < n; i++) re[i] = x[i];
    fft(re, im, false);
    var lo = fc / Math.SQRT2, hi = fc * Math.SQRT2;
    var t0 = lo / edgeRatio, t1 = hi * edgeRatio;   // 过渡带外缘
    for (var k = 0; k <= N / 2; k++) {
      var f = k * sr / N;
      var m;
      if (f >= lo && f <= hi) m = 1;
      else if (f < t0 || f > t1) m = 0;
      else {
        var r, g;
        if (f < lo) { r = (f - t0) / (lo - t0); g = 0.5 * (1 - Math.cos(Math.PI * r)); }  // 0 → 1
        else { r = (f - hi) / (t1 - hi); g = 0.5 * (1 + Math.cos(Math.PI * r)); }        // 1 → 0
        m = g;
      }
      re[k] *= m; im[k] *= m;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    fft(re, im, true);
    var out = new Float64Array(n);
    for (i = 0; i < n; i++) out[i] = re[i];
    return out;
  }

  /* ---------- Hilbert 包络 ----------
   * 解析信号：正频率 ×2、负频率置零（不保持共轭对称——IFFT 输出为复
   * 信号 z，包络 = |z|）。
   * 历史坑：若只做共轭对称的 ±i 相移（缺 ×2），IFFT 输出退化为实信号
   * H(x)（纯 Hilbert 变换），|z| 变成 env·|sin(载波相位)|——均值被
   * 2/π 缩放且带高频整流纹波；深度 A/mean 尺度不变使 MTF 侥幸正确，
   * 但包络绝对值错误（低 3.9 dB）。
   */
  function envelope(x) {
    var n = x.length;
    var N = nextPow2(n);
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var i = 0; i < n; i++) re[i] = x[i];
    fft(re, im, false);
    for (var k = 1; k < N / 2; k++) { re[k] *= 2; im[k] *= 2; }   // 正频率 ×2
    for (k = N / 2 + 1; k < N; k++) { re[k] = 0; im[k] = 0; }     // 负频率置零
    /* k = 0 与 Nyquist 保持不变（实信号约束） */
    fft(re, im, true);
    var env = new Float64Array(n);
    for (i = 0; i < n; i++) env[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    return env;
  }

  /* ---------- 包络在指定调制频率处的深度 ----------
   * 精确频率投影（Goertzel 式 DTFT + Hann 窗）：直接在 fMod 处投影窗化包络，
   * 不用最近 bin FFT——0.63~12.5 Hz 低频调制在短记录上 bin 量化 + Hann 主瓣
   * 会造成最多 ~58% 的 scalloping 损失，精确频率投影无此损失。
   */
  function envelopeDepthAt(env, sr, fMod) {
    var n = env.length;
    if (n < 16 || !(fMod > 0)) return { depth: 0, snrLin: 0 };
    var mean = 0;
    for (var i = 0; i < n; i++) mean += env[i];
    mean /= n;
    if (!(mean > 0)) return { depth: 0, snrLin: 0 };
    /* Hann 窗数组（一次算好，多次投影复用） */
    var win = new Float64Array(n), sw = 0;
    for (i = 0; i < n; i++) {
      var w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      win[i] = w; sw += w;
    }
    /* 精确频率投影（Goertzel 式 DTFT）：A = 2·|Σ w·(env−mean)·e^(−i2πft)| / Σw */
    function project(f) {
      var wc = 2 * Math.PI * f / sr, c = 0, s = 0;
      for (var j = 0; j < n; j++) {
        var v = (env[j] - mean) * win[j];
        c += v * Math.cos(wc * j);
        s += v * Math.sin(wc * j);
      }
      return 2 * Math.sqrt(c * c + s * s) / sw;
    }
    var mag = project(fMod);
    /* 噪声底：±(3,5,8,12)·Δf 投影（Hann 主瓣零点在 2Δf，≥3Δf 避开信号泄漏） */
    var df = sr / nextPow2(n);
    var noiseSum = 0, noiseCnt = 0;
    var offs = [3, 5, 8, 12];
    for (var j = 0; j < offs.length; j++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var fo = fMod + sgn * offs[j] * df;
        if (!(fo > 0)) continue;
        noiseSum += project(fo); noiseCnt++;
      }
    }
    var noiseMag = noiseCnt ? noiseSum / noiseCnt : 0;
    var clean = Math.sqrt(Math.max(0, mag * mag - noiseMag * noiseMag));
    return { depth: clean / mean, snrLin: noiseMag > 0 ? clean / noiseMag : 1e9 };
  }

  /* ---------- 单带 MTF（2 个调制频率） ---------- */
  function bandMtf(rec, sr, bandIdx, mTx) {
    mTx = mTx || MOD_DEPTH;
    var bp = bandpass(rec, sr, BANDS[bandIdx]);
    var env = envelope(bp);
    var out = [];
    for (var j = 0; j < 2; j++) {
      var r = envelopeDepthAt(env, sr, MOD_MATRIX[bandIdx][j]);
      var mtf = Math.max(0, Math.min(0.999, r.depth / mTx));
      out.push(mtf);
    }
    return out;
  }

  /* 全部 7 带 × 2 调制频率的 MTF 表 */
  function mtfTable(rec, sr, mTx) {
    return BANDS.map(function (_, b) { return bandMtf(rec, sr, b, mTx); });
  }

  /* ---------- MTF → STI ---------- */
  function snrApparent(mtf) {
    var m = Math.max(1e-6, Math.min(0.999, mtf));
    var snr = 10 * Math.log10(m / (1 - m));
    return Math.max(-15, Math.min(15, snr));
  }

  function stiFromMtf(table) {
    if (!table || table.length !== BANDS.length) return null;
    var wSum = W_MALE.reduce(function (a, b) { return a + b; }, 0);
    var sti = 0;
    var bandSnr = [];
    for (var k = 0; k < BANDS.length; k++) {
      var snrs = table[k].map(snrApparent);
      var avg = (snrs[0] + snrs[1]) / 2;
      bandSnr.push(avg);
      sti += W_MALE[k] * (avg + 15) / 30;
    }
    sti /= wSum;
    return { sti: Math.max(0, Math.min(1, sti)), bandSnr: bandSnr, weights: W_MALE };
  }

  function analyze(rec, sr, mTx) {
    var table = mtfTable(rec, sr, mTx);
    var r = stiFromMtf(table);
    if (!r) return null;
    r.mtf = table;
    r.rating = rating(r.sti);
    return r;
  }

  function rating(sti) {
    if (sti == null || isNaN(sti)) return null;
    if (sti < 0.3) return { level: 'bad', label: '不合格', range: '< 0.30' };
    if (sti < 0.45) return { level: 'poor', label: '差', range: '0.30 – 0.45' };
    if (sti < 0.6) return { level: 'fair', label: '一般', range: '0.45 – 0.60' };
    if (sti < 0.75) return { level: 'good', label: '良好', range: '0.60 – 0.75' };
    return { level: 'excellent', label: '优秀', range: '≥ 0.75' };
  }

  var API = {
    BANDS: BANDS, MOD_FREQS: MOD_FREQS, MOD_MATRIX: MOD_MATRIX,
    W_MALE: W_MALE, MOD_DEPTH: MOD_DEPTH,
    signal: signal, bandpass: bandpass, envelope: envelope,
    envelopeDepthAt: envelopeDepthAt, bandMtf: bandMtf, mtfTable: mtfTable,
    snrApparent: snrApparent, stiFromMtf: stiFromMtf, analyze: analyze, rating: rating
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Stipa = API;
})(typeof window !== 'undefined' ? window : this);
