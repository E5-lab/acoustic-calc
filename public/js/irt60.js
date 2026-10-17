/*
 * irt60.js — 脉冲响应测量与 RT60 分析内核（纯函数，无 DOM）
 * UMD 包装：浏览器挂到 window.IrT60，Node 下 module.exports。
 * 依赖 aural.js（fft / convolve / nextPow2）。
 *
 * 覆盖实测 RT60 全链路（ISO 3382 口径）：
 *   1) Farina 频域反卷积：录音 × conj(FFT(扫频)) / |FFT(扫频)|² → 脉冲响应 IR
 *      （配互相关峰值定位 IR 起始，抵消播放/录音启动延迟）；
 *   2) Schroeder 反向积分衰减曲线（自 IR 峰值起算，归一到 0 dB）；
 *   3) 简化 Lundeby 噪声补偿：末端 10% 估计噪声底，曲线跌入噪声+3 dB 处截断；
 *   4) T20 / T30 / EDT 最小二乘拟合（T = −60/斜率），EDT 取 0~−10 dB，
 *      T30 取 −5~−35 dB，T20 取 −5~−25 dB（区间不足时自动收缩并标记）。
 *
 * 定位：工程级估算与教学演示，非计量级；正式验收以 ISO 3382 实测方法为准。
 */
(function (global) {
  'use strict';

  var Aural = (typeof module !== 'undefined' && module.exports) ? require('./aural.js') : global.Aural;
  var fft = Aural.fft, convolve = Aural.convolve, nextPow2 = Aural.nextPow2;

  /* ---------- 互相关峰值：在 rec 中找 ref 的出现位置（lag） ----------
   * 直接时域 O(n·m) 太慢，改用 FFT 相关：corr = IFFT(FFT(rec)·conj(FFT(ref)))
   * 返回使 |ref| 与 rec 对齐最佳的 lag（rec 中 ref 的起始样本索引）。
   */
  function correlationLag(rec, ref) {
    if (!rec || !ref || !rec.length || !ref.length) return 0;
    var n = nextPow2(rec.length + ref.length);
    var re = new Float64Array(n), im = new Float64Array(n);
    for (var i = 0; i < rec.length; i++) re[i] = rec[i];
    var re2 = new Float64Array(n), im2 = new Float64Array(n);
    for (i = 0; i < ref.length; i++) re2[i] = ref[i];
    fft(re, im, false);
    fft(re2, im2, false);
    for (i = 0; i < n; i++) {
      var a = re[i], b = im[i], c = re2[i], d = im2[i];
      re[i] = a * c + b * d; im[i] = b * c - a * d;   // × conj(ref)
    }
    fft(re, im, true);
    var best = 0, bestVal = -Infinity;
    for (i = 0; i < n; i++) {
      if (re[i] > bestVal) { bestVal = re[i]; best = i; }
    }
    return best;
  }

  /* ---------- Farina 反卷积 ----------
   * rec：录到的信号（= 扫频与房间 IR 的卷积）；sweep：播放的参考扫频（等长或更短）。
   * IR = IFFT( FFT(rec) · conj(FFT(sweep)) / |FFT(sweep)|² )
   * 返回与 rec 等长的 IR（起点附近即直达声）。
   */
  function farinaDeconvolve(rec, sweep) {
    if (!rec || !sweep || !rec.length || !sweep.length) return null;
    var n = nextPow2(rec.length + sweep.length);
    var re = new Float64Array(n), im = new Float64Array(n);
    for (var i = 0; i < rec.length; i++) re[i] = rec[i];
    var sre = new Float64Array(n), sim = new Float64Array(n);
    for (i = 0; i < sweep.length; i++) sre[i] = sweep[i];
    fft(re, im, false);
    fft(sre, sim, false);
    for (i = 0; i < n; i++) {
      var sr = sre[i], si = sim[i];
      var p = sr * sr + si * si;
      if (p < 1e-12) { re[i] = 0; im[i] = 0; continue; }
      var ar = re[i], ai = im[i];
      re[i] = (ar * sr + ai * si) / p;
      im[i] = (ai * sr - ar * si) / p;
    }
    fft(re, im, true);
    var out = new Float64Array(rec.length);
    for (i = 0; i < rec.length; i++) out[i] = re[i];
    return out;
  }

  /* IR 峰值定位（直达声起始样本索引）：短时能量最大值处 */
  function irStartIndex(ir, win) {
    if (!ir || !ir.length) return 0;
    var w = Math.max(8, win || 32);
    var best = 0, bestE = -Infinity;
    var acc = 0;
    for (var i = 0; i < ir.length; i++) {
      acc += ir[i] * ir[i];
      if (i >= w) acc -= ir[i - w] * ir[i - w];
      if (i >= w - 1 && acc > bestE) { bestE = acc; best = i - w + 1; }
    }
    return best;
  }

  /* ---------- Schroeder 反向积分 ---------- */
  function schroederDb(ir, startIdx) {
    if (!ir || !ir.length) return null;
    var s = Math.max(0, Math.min(ir.length - 1, startIdx == null ? irStartIndex(ir) : startIdx));
    var n = ir.length - s;
    var cum = new Float64Array(n + 1);
    for (var i = n - 1; i >= 0; i--) {
      var v = ir[s + i];
      cum[i] = cum[i + 1] + v * v;
    }
    var e0 = cum[0];
    if (!(e0 > 0)) return null;
    var db = new Float64Array(n);
    for (i = 0; i < n; i++) db[i] = 10 * Math.log10(Math.max(cum[i] / e0, 1e-12));
    db[0] = 0;
    return db;
  }

  /* ---------- 简化 Lundeby 噪声补偿 ----------
   * 末端 10% 平均为噪声底；从尾部向前找曲线最后一次高于「噪声底 + 3 dB」的位置作为截断点。
   * 返回 {noiseDb, truncIdx, dynDb}（dynDb = −noiseDb，可用动态范围）。
   */
  function lundeby(db) {
    if (!db || db.length < 16) return null;
    var n = db.length;
    var tailStart = Math.floor(n * 0.9);
    var noise = 0;
    for (var i = tailStart; i < n; i++) noise += db[i];
    noise /= (n - tailStart);
    var trunc = n - 1;
    while (trunc > 0 && db[trunc] <= noise + 3) trunc--;
    return { noiseDb: noise, truncIdx: trunc, dynDb: -noise };
  }

  /* ---------- 最小二乘拟合一段衰减曲线 → RT ----------
   * from/to：相对起始点的 dB 区间（如 T30 为 −5 ~ −35）。
   * 在截断点之前找区间的起止样本（线性插值越界），对段内做直线拟合，
   * T = −60 / slope（slope 单位 dB/s）。
   */
  function fitDecay(db, sr, from, to, truncIdx) {
    if (!db || db.length < 8) return null;
    var limit = Math.min(db.length - 1, truncIdx == null ? db.length - 1 : truncIdx);
    function cross(target) {
      /* 起点即低于目标（EDT 的 target = 0，而 db[0] 恒为 0）→ 交点取 t = 0 */
      if (db[0] <= target) return 0;
      for (var i = 1; i <= limit; i++) {
        if (db[i] <= target && db[i - 1] > target) {
          var d = db[i - 1] - db[i];
          var t = d > 1e-12 ? (db[i - 1] - target) / d : 0;
          return (i - 1 + t) / sr;
        }
      }
      return null;
    }
    var t1 = cross(from), t2 = cross(to);
    if (t1 == null || t2 == null || t2 <= t1) return null;
    var i1 = Math.floor(t1 * sr), i2 = Math.min(limit, Math.ceil(t2 * sr));
    if (i2 - i1 < 4) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
    for (var i = i1; i <= i2; i++) {
      var t = i / sr;
      sx += t; sy += db[i]; sxx += t * t; sxy += t * db[i]; cnt++;
    }
    var den = cnt * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return null;
    var slope = (cnt * sxy - sx * sy) / den;
    if (!(slope < 0)) return null;
    return { T: -60 / slope, slope: slope, range: [t1, t2] };
  }

  /* ---------- FFT 带限（视图用于反卷积后限带） ----------
   * 实测录音中的带外噪声会被 Farina 反卷积的 1/|S|² 放大，标准做法是把
   * 恢复的 IR 限回扫频信号频带。过渡带 1/6 倍频程 raised-cosine（抑振铃）；
   * fLow/fHigh 为 null 或越界时对应边不切。
   */
  function limitBand(ir, sr, fLow, fHigh) {
    if (!ir || !ir.length || !(sr > 0)) return null;
    var n = ir.length;
    var N = nextPow2(n);
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var i = 0; i < n; i++) re[i] = ir[i];
    fft(re, im, false);
    var r = Math.pow(2, 1 / 12);   // 过渡带半宽（1/12 倍频程 → 总宽 1/6）
    var lo0 = fLow > 0 ? fLow / r : 0, lo1 = fLow > 0 ? fLow * r : 0;
    var hi0 = fHigh > 0 && fHigh < sr / 2 ? fHigh / r : Infinity;
    var hi1 = fHigh > 0 && fHigh < sr / 2 ? fHigh * r : Infinity;
    for (var k = 0; k <= N / 2; k++) {
      var f = k * sr / N;
      var m = 1;
      if (f < lo0 || f > hi1) m = 0;
      else if (lo1 > 0 && f < lo1) m = 0.5 * (1 - Math.cos(Math.PI * (f - lo0) / (lo1 - lo0)));
      else if (hi0 < Infinity && f > hi0) m = 0.5 * (1 + Math.cos(Math.PI * (f - hi0) / (hi1 - hi0)));
      re[k] *= m; im[k] *= m;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    fft(re, im, true);
    var out = new Float64Array(n);
    for (i = 0; i < n; i++) out[i] = re[i];
    return out;
  }

  /* ---------- IR 全分析 ---------- */
  function analyzeIr(ir, sr, opts) {
    if (!ir || !ir.length || !(sr > 0)) return null;
    opts = opts || {};
    var start = opts.startIdx == null ? irStartIndex(ir) : opts.startIdx;
    var db = schroederDb(ir, start);
    if (!db) return null;
    var lu = lundeby(db);
    var trunc = lu ? lu.truncIdx : db.length - 1;
    var edt = fitDecay(db, sr, 0, -10, trunc);
    var t20 = fitDecay(db, sr, -5, -25, trunc);
    var t30 = fitDecay(db, sr, -5, -35, trunc);
    return {
      startIdx: start,
      curveDb: db,
      sampleRate: sr,
      noiseDb: lu ? lu.noiseDb : null,
      dynDb: lu ? lu.dynDb : null,
      truncIdx: trunc,
      edt: edt, t20: t20, t30: t30
    };
  }

  var API = {
    correlationLag: correlationLag,
    farinaDeconvolve: farinaDeconvolve,
    irStartIndex: irStartIndex,
    schroederDb: schroederDb,
    lundeby: lundeby,
    fitDecay: fitDecay,
    limitBand: limitBand,
    analyzeIr: analyzeIr
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.IrT60 = API;
})(typeof window !== 'undefined' ? window : this);
