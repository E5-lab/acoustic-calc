/*
 * siggen.js — 测量信号生成内核（纯函数，无 DOM）
 * UMD 包装：浏览器挂到 window.SigGen，Node 下 module.exports。
 * 依赖 aural.js（fft / rngFactory / nextPow2）。
 *
 * 为「现场实测」分组生成标准测量信号：
 *   1) 白噪声 / 粉红噪声（Paul Kellet 滤波法，-3 dB/oct）
 *   2) 正弦（任意频率/幅度/相位）
 *   3) 对数扫频（指数扫频 ESS，两端 5 ms 淡入淡出防爆音）
 *   4) 倍频带限噪声（FFT 频域开窗，用于 STIPA 载波）
 *
 * 所有信号峰值归一化到 <= peak（默认 0.89），防止播放端削波。
 */
(function (global) {
  'use strict';

  var Aural = (typeof module !== 'undefined' && module.exports) ? require('./aural.js') : global.Aural;
  var fft = Aural.fft, rngFactory = Aural.rngFactory, nextPow2 = Aural.nextPow2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* 峰值归一化：把 |x| 最大值缩放到 peak */
  function normalizePeak(x, peak) {
    var p = (peak == null) ? 0.89 : peak;
    var mx = 0;
    for (var i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i]));
    if (mx <= 0) return x;
    var g = p / mx;
    for (i = 0; i < x.length; i++) x[i] *= g;
    return x;
  }

  /* 白噪声（确定性伪随机，seed 可复现） */
  function white(n, seed) {
    var rnd = rngFactory(seed == null ? 20261017 : seed);
    var x = new Float64Array(n);
    for (var i = 0; i < n; i++) x[i] = rnd() * 2 - 1;
    return x;
  }

  /* 粉红噪声（Paul Kellet  refined 方法，谱密度 -3 dB/oct） */
  function pink(n, seed) {
    var rnd = rngFactory(seed == null ? 20261017 : seed);
    var x = new Float64Array(n);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < n; i++) {
      var w = rnd() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return normalizePeak(x, 0.89);
  }

  /* 正弦：sin(2π·f·t + φ) */
  function sine(n, sr, f, amp, phase) {
    var x = new Float64Array(n);
    var a = (amp == null) ? 0.8 : amp;
    var ph = (phase == null) ? 0 : phase;
    for (var i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / sr + ph);
    return x;
  }

  /* 对数（指数）扫频：f(t) = f1·(f2/f1)^(t/T)
   * 相位解析积分：φ(t) = 2π·f1·T/ln(f2/f1)·[(f2/f1)^(t/T) − 1]
   * fadeSec：两端淡入淡出时长（默认 5 ms），避免起止点瞬态。
   */
  function logSweep(n, sr, f1, f2, fadeSec) {
    if (!(n > 0) || !(sr > 0) || !(f1 > 0) || !(f2 > 0) || f2 <= f1) return null;
    var T = n / sr;
    var r = f2 / f1;
    var k = 2 * Math.PI * f1 * T / Math.log(r);
    var x = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var ph = k * (Math.pow(r, t / T) - 1);
      x[i] = Math.sin(ph);
    }
    var nf = Math.max(1, Math.round((fadeSec == null ? 0.005 : fadeSec) * sr));
    for (i = 0; i < nf; i++) {
      var g = i / nf;
      x[i] *= g;
      x[n - 1 - i] *= g;
    }
    return normalizePeak(x, 0.89);
  }

  /* 倍频带限噪声：FFT 频域开窗
   * fc：中心频率；edgeDb：过渡带外缘衰减（dB，默认 -24）；
   * opts.shrink：平坦区收缩系数（默认 1）；opts.edgeRatio：过渡带宽度
   * （外缘频率 / 平坦区边界，默认 1.7）。过渡带内 raised-cosine 滚降至
   * edgeDb，过渡带外硬置零（不留底噪地板，防止带外能量泄漏）。
   * STIPA 载波用 shrink=1.06 + edgeRatio=1.06 + edgeDb=-40：载波能量在
   * 分析滤波器带边沿（fc±1/6 倍频程）处已衰减 40 dB，避免相邻倍频带
   * 载波泄入分析通带稀释 MTF（详见 stipa.js 频带规划说明）。
   */
  function bandNoise(n, sr, fc, edgeDb, seed, opts) {
    opts = opts || {};
    var shrink = opts.shrink || 1;
    var edgeRatio = opts.edgeRatio || 1.7;
    var N = nextPow2(Math.max(64, n));
    var rnd = rngFactory(seed == null ? 20261017 : seed);
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var i = 0; i < N; i++) re[i] = rnd() * 2 - 1;
    fft(re, im, false);
    var lo = fc / Math.SQRT2 * shrink, hi = fc * Math.SQRT2 / shrink;
    var edge = Math.pow(10, (edgeDb == null ? -24 : edgeDb) / 20);
    var width = Math.max(1e-6, edgeRatio - 1);
    for (var k = 0; k <= N / 2; k++) {
      var f = k * sr / N;
      var m;
      if (f >= lo && f <= hi) m = 1;
      else {
        var ratio = f < lo ? lo / Math.max(f, 1e-9) : f / hi;
        var t = (ratio - 1) / width;
        /* 过渡带内 raised-cosine 滚降；过渡带外硬置零——
         * 若沿用 edge 作地板，-40 dB 底噪会泄入相邻分析带（实测
         * 7 个载波合计约 0.5% 能量 ≈ 7% 振幅，足以把 STIPA 高段
         * MTF 稀释到 0.93）。 */
        m = t >= 1 ? 0 : Math.max(0, 1 - (1 - edge) * t);
      }
      re[k] *= m; im[k] *= m;
    }
    /* 补共轭对称（im=0 的实信号谱） */
    for (k = N / 2 + 1; k < N; k++) { re[k] = re[N - k]; im[k] = -im[N - k]; }
    fft(re, im, true);
    var x = new Float64Array(n);
    for (i = 0; i < n; i++) x[i] = re[i];
    return normalizePeak(x, 0.5);
  }

  var API = {
    white: white, pink: pink, sine: sine, logSweep: logSweep, bandNoise: bandNoise,
    normalizePeak: normalizePeak
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.SigGen = API;
})(typeof window !== 'undefined' ? window : this);
