/*
 * measure.js — 声学测量共享内核（纯函数，无 DOM）
 * UMD 包装：浏览器挂到 window.Measure，Node 下 module.exports。
 * 依赖 aural.js 的 fft（Node: require('./aural.js')）。
 *
 * 定位：为「现场实测」分组（声级计 / RTA / RT60 实测 / STIPA）提供公共测量数学：
 *   1) A / C / Z 计权：IEC 61672-1:2013 解析式（任意频率）+ 1/1 倍频带经典表
 *      （与 dbcalc.js 的 WEIGHT 一致，保证全站口径统一）；
 *   2) FFT 幅度谱 → 1/1 或 1/3 倍频带线性功率（各带内 bin 能量求和）；
 *   3) Leq 能量累积器（按带累积线性功率，输出时转 dB）；
 *   4) 校准偏移：浏览器麦克风无绝对标定，统一以 calib 偏移修正，
 *      所有输出均为「相对级 + 用户校准偏移」，与商用声级计比对后使用。
 *
 * 单位约定：功率为线性（∝ p²），声级为 dB；20 µPa 参考仅用于 rmsToSpl。
 */
(function (global) {
  'use strict';

  var Aural = (typeof module !== 'undefined' && module.exports) ? require('./aural.js') : global.Aural;
  var P0 = 20e-6;

  /* 1/1 倍频带中心频率（RTA 量程 31.5 Hz – 16 kHz） */
  var OCTAVE = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  /* 1/3 倍频带中心频率（20 Hz – 20 kHz，共 31 带，ISO 优先数） */
  var THIRD = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400,
    500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

  /* 1/1 倍频带 A/C/Z 计权衰减（dB，相对 1 kHz）——与 dbcalc.WEIGHT 同源（IEC 61672 表列值） */
  var OCT_WEIGHT = {
    freq: [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    A: [-56.7, -39.4, -26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1, -6.6],
    C: [-29.4, -19.8, -11.4, -5.3, -1.9, -0.4, 0, 0.3, -0.1, -0.1, -0.1],
    Z: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  /* ---------- 计权解析式（IEC 61672-1:2013） ----------
   * A(f) = 20·lg[ f₄²·f⁴ / ((f²+f₁²)·√(f²+f₂²)·√(f²+f₃²)·(f²+f₄²)) ] + 2.00
   * C(f) = 20·lg[ f₄²·f² / ((f²+f₁²)·(f²+f₄²)) ]
   * A 式与表列值一致（±0.1 dB）；C 式为标准近似式，与表列值差 ≤0.2 dB（标准允许的近似）。
   */
  var F1 = 20.6, F2 = 107.7, F3 = 737.9, F4 = 12194;

  function weightA(f) {
    if (!(f > 0)) return -Infinity;
    var f2 = f * f;
    var num = F4 * F4 * f2 * f2;
    var den = (f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4);
    return 20 * Math.log10(num / den) + 2.0;
  }

  function weightC(f) {
    if (!(f > 0)) return -Infinity;
    var f2 = f * f;
    var num = F4 * F4 * f2;
    var den = (f2 + F1 * F1) * (f2 + F4 * F4);
    return 20 * Math.log10(num / den);
  }

  function weightAt(f, kind) {
    if (kind === 'A') return weightA(f);
    if (kind === 'C') return weightC(f);
    return 0;
  }

  /* 1/3 倍频带计权表（解析式，31 带） */
  function thirdWeights(kind) {
    return THIRD.map(function (f) { return weightAt(f, kind); });
  }

  /* 1/1 倍频带计权表（经典表列值，11 带，按 OCTAVE 顺序取） */
  function octaveWeights(kind) {
    var src = OCT_WEIGHT[kind] || OCT_WEIGHT.Z;
    return OCTAVE.map(function (fc) {
      var i = OCT_WEIGHT.freq.indexOf(fc);
      return i >= 0 ? src[i] : weightAt(fc, kind);
    });
  }

  /* 频带边界 [f/r, f·r]，r = 2^(bw/2)；bwOct 为带宽（倍频程数）：
   * 1 = 1/1 倍频带（边界 f/√2 ~ f·√2），1/3 = 1/3 倍频带 */
  function bandEdges(fc, bwOct) {
    var r = Math.pow(2, (bwOct == null ? 1 : bwOct) / 2);
    return [fc / r, fc * r];
  }

  /* ---------- FFT 幅度谱 → 倍频带线性功率 ----------
   * mag：|X[k]|（k = 0..N/2），来自 aural.fft 或 AnalyserNode 幅值谱；
   * centers：中心频率数组（OCTAVE / THIRD…）；bwOct：带宽（倍频程数，
   * 传 1/3 时按 1/3 倍频带边界归属，默认 1/1 倍频带）；
   * 单侧谱归一：每 bin 对应时域幅值 A = 2·|X|/N，该 bin 平均功率 = A²/2。
   * 带内全部 bin 功率求和 → 带功率（∝ p²，未标定）。
   */
  function spectrumBandPowers(mag, sampleRate, fftSize, centers, bwOct) {
    if (!mag || !mag.length || !centers || !centers.length) return null;
    var binHz = sampleRate / fftSize;
    var nBins = Math.min(mag.length, Math.floor(fftSize / 2) + 1);
    var powers = centers.map(function () { return 0; });
    var edges = centers.map(function (fc) { return bandEdges(fc, bwOct); });
    for (var k = 1; k < nBins; k++) {
      var f = k * binHz;
      for (var b = 0; b < centers.length; b++) {
        if (f >= edges[b][0] && f < edges[b][1]) {
          var amp = 2 * mag[k] / fftSize;
          powers[b] += amp * amp / 2;
          break;
        }
      }
    }
    return powers;
  }

  /* 时域帧 → 线性功率（p²）与 rms */
  function framePower(frame) {
    if (!frame || !frame.length) return 0;
    var s = 0;
    for (var i = 0; i < frame.length; i++) s += frame[i] * frame[i];
    return s / frame.length;
  }

  /* rms（Pa 域数字幅值）→ 声压级；calib 为校准偏移（dB） */
  function rmsToSpl(rms, calib) {
    if (!(rms > 0)) return null;
    return 20 * Math.log10(rms / P0) + (calib || 0);
  }

  /* 线性功率 → 相对声级（dB，参考 1） */
  function powerToDb(p) { return (p > 0) ? 10 * Math.log10(p) : null; }
  function dbToPower(db) { return Math.pow(10, db / 10); }

  /* 按带功率 + 计权求总声级：L = 10·lg Σ 10^((L_i + w_i)/10) */
  function weightedBandLevel(powers, weights, calib) {
    if (!powers || !powers.length) return null;
    var s = 0;
    for (var i = 0; i < powers.length; i++) {
      var L = powerToDb(powers[i]);
      if (L == null) continue;
      var w = (weights && i < weights.length) ? weights[i] : 0;
      s += dbToPower(L + w);
    }
    return s > 0 ? 10 * Math.log10(s) + (calib || 0) : null;
  }

  /* ---------- Leq 能量累积器 ---------- */
  function createLeq() {
    return { energy: [], frames: 0, seconds: 0, peak: -Infinity, peakTime: 0 };
  }

  /* 推入一帧：bandPowers 为线性功率数组（长度须一致），dt 为帧时长（s） */
  function pushLeq(st, bandPowers, dt) {
    if (!st || !bandPowers || !bandPowers.length || !(dt > 0)) return;
    if (!st.energy.length) st.energy = bandPowers.map(function () { return 0; });
    for (var i = 0; i < st.energy.length; i++) st.energy[i] += (bandPowers[i] || 0) * dt;
    st.frames++;
    st.seconds += dt;
  }

  /* 推入宽带峰值（时域 rms → 声级，含 calib） */
  function pushPeak(st, rms, calib) {
    if (!st || !(rms > 0)) return;
    var L = 20 * Math.log10(rms / P0) + (calib || 0);
    if (L > st.peak) { st.peak = L; st.peakTime = st.seconds; }
  }

  /* 各带 Leq（dB，相对级 + calib） */
  function leqBands(st, calib) {
    if (!st || !st.seconds || !st.energy.length) return null;
    return st.energy.map(function (e) {
      return e > 0 ? 10 * Math.log10(e / st.seconds) + (calib || 0) : null;
    });
  }

  /* 计权总 Leq */
  function leqWeighted(st, weights, calib) {
    var bands = leqBands(st, 0);
    if (!bands) return null;
    return weightedBandLevel(bands.map(function (L) { return L == null ? 0 : dbToPower(L); }), weights, calib);
  }

  /* 汇总：{LZ, LA, LC, Lmax, seconds, frames} */
  function leqSummary(st, octW, calib) {
    if (!st || !st.seconds) return null;
    return {
      seconds: st.seconds,
      frames: st.frames,
      LZ: leqWeighted(st, octW ? octW.Z : null, calib),
      LA: leqWeighted(st, octW ? octW.A : null, calib),
      LC: leqWeighted(st, octW ? octW.C : null, calib),
      Lmax: st.peak > -Infinity ? st.peak : null
    };
  }

  var API = {
    P0: P0, OCTAVE: OCTAVE, THIRD: THIRD, OCT_WEIGHT: OCT_WEIGHT,
    weightA: weightA, weightC: weightC, weightAt: weightAt,
    thirdWeights: thirdWeights, octaveWeights: octaveWeights,
    bandEdges: bandEdges,
    spectrumBandPowers: spectrumBandPowers, framePower: framePower,
    rmsToSpl: rmsToSpl, powerToDb: powerToDb, dbToPower: dbToPower,
    weightedBandLevel: weightedBandLevel,
    createLeq: createLeq, pushLeq: pushLeq, pushPeak: pushPeak,
    leqBands: leqBands, leqWeighted: leqWeighted, leqSummary: leqSummary
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Measure = API;
})(typeof window !== 'undefined' ? window : this);
