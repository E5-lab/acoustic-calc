/*
 * sim-fourier.js — 傅里叶波形合成与频谱泄漏（含窗函数）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimFourier，Node 下 module.exports。
 *
 * 物理/数学模型：
 *
 * A. 谐波叠加（部分和）—— 基频 f₀，谐波数 N，θ = 2πf₀t
 *    方波   x(t) = (4/π) · Σ_{k odd, k≤N} sin(kθ)/k
 *    锯齿波 x(t) = (2/π) · Σ_{k=1..N} (−1)^(k+1) · sin(kθ)/k
 *    三角波 x(t) = (8/π²) · Σ_{k odd, k≤N} (−1)^((k−1)/2) · sin(kθ)/k²
 *    全波整流正弦 x(t) = 2/π − (4/π) · Σ_{k=1..N} cos(2kθ)/(4k²−1)
 *    系数已按「稳态理想波形幅值 ±1」归一化（整流正弦为单极性，理想值域 [0,1]）。
 *    Gibbs 过冲：方波部分和在跳变处的峰值随 N 增大单调下降趋近 1.17898…
 *    （= (2/π)·Si(π)，相对跳变幅度 2 的过冲量 8.95%），增大 N 只是把过冲压缩到
 *    更窄的区间而不会消除它。
 *
 * B. 窗函数（长度 M，采用对称定义，分母为 M−1）
 *    rect    w = 1
 *    hann    w = 0.50 − 0.50·cos(2πn/(M−1))
 *    hamming w = 0.54 − 0.46·cos(2πn/(M−1))
 *    blackman w = 0.42 − 0.50·cos(2πn/(M−1)) + 0.08·cos(4πn/(M−1))
 *    相干增益 CG = mean(w)（矩形=1，Hann/Hamming=0.5，Blackman=0.42）。
 *
 * C. DFT（直接 O(M²) 实现，非 FFT；M 建议 256 或 512）
 *    X[k] = Σ_{n=0}^{M−1} x[n]·w[n]·exp(−2πi·k·n/M)
 *    幅度谱 |X|、dB 谱 20·log10(|X|/max)（峰值归一 0 dB，下限 −120 dB）、
 *    频率轴 f_k = k·fs/M。Parseval：Σ|x|²·M = Σ|X|²。
 *
 * D. 频谱泄漏与主瓣
 *    主瓣宽度按**第一零点（null-to-null）**口径给出：矩形窗第一零点距峰值 1 个 bin
 *    （主瓣宽 2·fs/M），Hann/Hamming 为 2 个 bin（4·fs/M），Blackman 为 3 个 bin
 *    （6·fs/M）。WIN_MAINLOBE 给出该理论值；当被分析频率正好落在 bin 上时，
 *    leakage() 还会从实际谱中**测量**第一零点位置（nullOffsetBins）。
 *    最高旁瓣电平 = 主瓣之外（含镜像排除）的最大 dB 值。
 *
 * E. 混叠：f_in > fs/2 时告警，折叠频率 f_alias = |f_in − round(f_in/fs)·fs|。
 *
 * 备注：
 *   1) DFT 为直接 O(M²) 实现（教学用途、可逐点手工验算），非 FFT；M ≤ 2048。
 *   2) 加窗引入相干增益 CG = mean(w)；整 bin 单频的幅度校正为
 *      A = 2·|X_peak| / (M·CG)（本内核的 spectrum/leakage 直接给出 peakAmp）。
 *   3) 频谱泄漏：f_in 非整 bin 时能量扩散到全部 bin。矩形窗旁瓣仅 −13.3 dB
 *      且衰减慢（6 dB/oct），Hann 旁瓣 −31.5 dB 但主瓣宽一倍，Blackman −58 dB。
 *   4) 混叠条件：f_in > fs/2（奈奎斯特）；采样前需抗混叠滤波。
 *   5) 时域数组默认在 cycles 个周期内均匀取 samples 个点（与 fs 解耦，
 *      由 overshoot 的局部细化保证 Gibbs 峰值精度）。
 */
(function (global) {
  'use strict';

  var TWO_PI = Math.PI * 2;
  var DB_FLOOR = -120;      // dB 谱下限
  var N_MIN = 1, N_MAX = 64;
  var FS_DEFAULT = 16000;   // 默认采样率 Hz
  var M_DEFAULT = 512;      // 默认 DFT 长度
  var M_MAX = 2048;         // 直接 DFT 的长度上限
  var F0_DEFAULT = 100;     // 默认基频 Hz
  var F_IN_DEFAULT = 1000;  // 默认被分析单频 Hz（fs/M = 31.25 Hz 时正好落在 bin 32）
  var CYCLES_DEFAULT = 2;   // 时域显示周期数
  var SAMPLES_DEFAULT = 2048; // 时域采样点数

  var WAVEFORMS = ['square', 'saw', 'triangle', 'rectified'];
  var WINDOWS = ['rect', 'hann', 'hamming', 'blackman'];
  // 第一零点（null-to-null）主瓣宽度，单位：bin
  var WIN_MAINLOBE = { rect: 2, hann: 4, hamming: 4, blackman: 6 };

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function intOr(v, d) {
    var n = num(v);
    if (n == null) return d == null ? null : d;
    return Math.round(n);
  }

  function normKind(k) {
    if (typeof k !== 'string') return null;
    var s = k.toLowerCase();
    return WAVEFORMS.indexOf(s) >= 0 ? s : null;
  }

  function normWin(w) {
    if (typeof w !== 'string') return null;
    var s = w.toLowerCase();
    return WINDOWS.indexOf(s) >= 0 ? s : null;
  }

  /* ----------------------- A. 波形合成 ----------------------- */

  // N 项部分和在时刻 t 的值；kind 非法 / N<1 / f0≤0 返回 null
  function waveform(kind, N, f0, t) {
    var kd = normKind(kind);
    if (!kd || !(N >= 1) || !(f0 > 0)) return null;
    var th = TWO_PI * f0 * t;
    var s = 0, k, m;
    if (kd === 'square') {
      for (k = 1; k <= N; k += 2) s += Math.sin(k * th) / k;
      return (4 / Math.PI) * s;
    }
    if (kd === 'saw') {
      for (k = 1; k <= N; k++) s += ((k % 2) === 1 ? 1 : -1) * Math.sin(k * th) / k;
      return (2 / Math.PI) * s;
    }
    if (kd === 'triangle') {
      for (k = 1; k <= N; k += 2) {
        m = (k - 1) / 2;
        s += ((m % 2) === 0 ? 1 : -1) * Math.sin(k * th) / (k * k);
      }
      return (8 / (Math.PI * Math.PI)) * s;
    }
    // rectified：2/π − (4/π)·Σ cos(2kθ)/(4k²−1)
    for (k = 1; k <= N; k++) s += Math.cos(2 * k * th) / (4 * k * k - 1);
    return 2 / Math.PI - (4 / Math.PI) * s;
  }

  // 理想（稳态、无穷项）波形；值域 ±1（整流正弦为 [0,1]）
  function idealWaveform(kind, f0, t) {
    var kd = normKind(kind);
    if (!kd || !(f0 > 0)) return null;
    var th = TWO_PI * f0 * t;
    var w = th % TWO_PI;
    if (w > Math.PI) w -= TWO_PI;
    else if (w <= -Math.PI) w += TWO_PI; // 折到 (−π, π]
    if (kd === 'square') return w > 0 ? 1 : (w < 0 ? -1 : 0);
    if (kd === 'saw') return w / Math.PI;               // θ∈(−π,π] 上的 −1→+1 斜波
    if (kd === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(th));
    return Math.abs(Math.sin(th));                       // rectified
  }

  // 第 k 次谐波的系数（整流正弦含直流项，见 synth().harmonics）
  function harmonicAmp(kind, k) {
    var kd = normKind(kind);
    if (!kd || !(k >= 1)) return null;
    if (kd === 'square') return (k % 2) === 1 ? 4 / (Math.PI * k) : 0;
    if (kd === 'saw') return (2 / Math.PI) * (((k % 2) === 1 ? 1 : -1) / k);
    if (kd === 'triangle') {
      if ((k % 2) === 0) return 0;
      var m = (k - 1) / 2;
      return (8 / (Math.PI * Math.PI)) * (((m % 2) === 0 ? 1 : -1) / (k * k));
    }
    return -(4 / Math.PI) / (4 * k * k - 1); // rectified（余弦项，另含 2/π 直流）
  }

  // 在 [lo,hi] 上细扫求 |x(t)| 峰值（消除采样网格造成的 Gibbs 峰值低估）
  function refineAbsMax(kind, N, f0, lo, hi) {
    var best = 0, steps = 400, i, a, v;
    for (i = 0; i <= steps; i++) {
      v = waveform(kind, N, f0, lo + (hi - lo) * (i / steps));
      a = Math.abs(v);
      if (a > best) best = a;
    }
    return best;
  }

  /*
   * opts: { kind, N, f0, cycles, samples }
   * 返回：{ ok, kind, N, f0, cycles, samples, dt, period, t[], x[], ideal[],
   *         overshoot, overshootGrid, overshootPct, overshootJumpPct,
   *         rms, mse, rmsError, harmonics[] }
   *   overshoot       —— 部分和 |x(t)| 的峰值（网格细化解，→1.17898…）
   *   overshootGrid   —— 采样序列上的 |x| 最大值（≤ overshoot）
   *   overshootPct    —— (overshoot−1)·100，相对幅值 1
   *   overshootJumpPct—— (overshoot−1)/2·100，相对跳变幅度 2（Gibbs 8.95%）
   *   rmsError        —— 与理想波形的 RMS 误差 sqrt(mean((x−ideal)²))
   */
  function synth(opts) {
    opts = opts || {};
    var kind = normKind(opts.kind == null ? 'square' : opts.kind);
    if (!kind) return { ok: false, error: '波形类型需为 square / saw / triangle / rectified' };

    var N = intOr(opts.N, 9);
    var f0 = num(opts.f0); if (f0 == null) f0 = F0_DEFAULT;
    var cycles = num(opts.cycles); if (cycles == null) cycles = CYCLES_DEFAULT;
    var S = intOr(opts.samples, SAMPLES_DEFAULT);

    if (!(N >= N_MIN && N <= N_MAX)) return { ok: false, error: '谐波数 N 需在 ' + N_MIN + '–' + N_MAX + ' 之间' };
    if (!(f0 > 0)) return { ok: false, error: '基频 f₀ 必须为正数（Hz）' };
    if (!(cycles > 0)) return { ok: false, error: '显示周期数必须为正数' };
    if (!(S >= 16)) return { ok: false, error: '时域采样点数至少为 16' };

    var T = cycles / f0, dt = T / S;
    var t = new Array(S), x = new Array(S), id = new Array(S);
    var mx = 0, mi = 0, sq = 0, se = 0, n, tt, xv, iv, a, d;

    for (n = 0; n < S; n++) {
      tt = (n + 0.5) * dt; // 中点采样：避开 θ=0、π 等跳变点，保证 RMS 误差无偏
      xv = waveform(kind, N, f0, tt);
      iv = idealWaveform(kind, f0, tt);
      t[n] = tt; x[n] = xv; id[n] = iv;
      a = Math.abs(xv);
      if (a > mx) { mx = a; mi = n; }
      sq += xv * xv;
      d = xv - iv;
      se += d * d;
    }

    var lo = t[mi > 0 ? mi - 1 : 0];
    var hi = t[mi < S - 1 ? mi + 1 : S - 1];
    var ov = refineAbsMax(kind, N, f0, lo, hi);
    if (ov < mx) ov = mx; // 细化不应低于网格值

    var harmonics = [];
    if (kind === 'rectified') harmonics.push({ k: 0, amp: 2 / Math.PI });
    for (var k = 1; k <= N; k++) harmonics.push({ k: k, amp: harmonicAmp(kind, k) });

    var mse = se / S;
    return {
      ok: true,
      kind: kind, N: N, f0: f0, cycles: cycles, samples: S,
      period: 1 / f0, dt: dt, span: T,
      t: t, x: x, ideal: id,
      overshoot: ov,
      overshootGrid: mx,
      overshootPct: (ov - 1) * 100,
      overshootJumpPct: ((ov - 1) / 2) * 100,
      rms: Math.sqrt(sq / S),
      mse: mse,
      rmsError: Math.sqrt(mse),
      harmonics: harmonics
    };
  }

  /* ----------------------- B. 窗函数 ----------------------- */

  /*
   * windowFn(kind, M) —— 返回长度 M 的数组（对称定义，分母 M−1）；
   * 数组上另挂 kind / M / cg（相干增益 = mean(w)）三个属性，便于直接取用。
   * 非法输入返回 null。
   */
  function windowFn(kind, M) {
    var kd = normWin(kind);
    var m = intOr(M, null);
    if (!kd || !(m > 0)) return null;
    var d = m > 1 ? (m - 1) : 1;
    var w = new Array(m), n, sum = 0;
    for (n = 0; n < m; n++) {
      if (kd === 'rect') w[n] = 1;
      else if (kd === 'hann') w[n] = 0.5 - 0.5 * Math.cos(TWO_PI * n / d);
      else if (kd === 'hamming') w[n] = 0.54 - 0.46 * Math.cos(TWO_PI * n / d);
      else w[n] = 0.42 - 0.5 * Math.cos(TWO_PI * n / d) + 0.08 * Math.cos(4 * Math.PI * n / d);
      sum += w[n];
    }
    w.kind = kd;
    w.M = m;
    w.cg = sum / m;
    return w;
  }

  // windows 的面向对象版本：{ ok, kind, M, w[], cg, edge0, edge1, mainlobeBins }
  function windowInfo(kind, M) {
    var w = windowFn(kind, M);
    if (!w) return { ok: false, error: '窗类型需为 rect / hann / hamming / blackman，且 M 为正整数' };
    return {
      ok: true,
      kind: w.kind, M: w.M, w: w,
      cg: w.cg,
      edge0: w[0],
      edge1: w[w.M - 1],
      mainlobeBins: WIN_MAINLOBE[w.kind]
    };
  }

  // 该窗的第一零点（null-to-null）主瓣宽度，单位 bin
  function windowMainlobe(kind) {
    var kd = normWin(kind);
    return kd ? WIN_MAINLOBE[kd] : null;
  }

  /* ----------------------- C. DFT ----------------------- */

  /*
   * dft(real, imag, win) —— X[k] = Σ x[n]·w[n]·exp(−2πi·k·n/M)
   * win 可为窗类型字符串、窗数组或 null（等价矩形窗）。
   * 返回 { ok, M, re[], im[], mag[], db[], peakBin, peakMag }（db 峰值归一 0 dB，下限 −120）。
   */
  function dft(real, imag, win) {
    if (!real || !(real.length > 0)) return { ok: false, error: '输入序列不能为空' };
    var M = real.length;
    if (M > M_MAX) return { ok: false, error: '序列长度过大（直接 DFT 上限 ' + M_MAX + '）' };
    var w = null;
    if (win != null) {
      w = typeof win === 'string' ? windowFn(win, M) : win;
      if (!w || w.length !== M) return { ok: false, error: '窗长度需与序列长度一致' };
    }
    var imi = imag || null;
    var cosT = new Array(M), sinT = new Array(M), n, a;
    for (n = 0; n < M; n++) {
      a = TWO_PI * n / M;
      cosT[n] = Math.cos(a);
      sinT[n] = Math.sin(a);
    }
    var Xr = new Array(M), Xi = new Array(M), mag = new Array(M), db = new Array(M);
    var k, idx, cr, si, ar, ai, xr, xi;

    for (k = 0; k < M; k++) {
      xr = 0; xi = 0;
      for (n = 0; n < M; n++) {
        idx = (k * n) % M;
        cr = cosT[idx]; si = sinT[idx];
        ar = real[n] * (w ? w[n] : 1);
        ai = (imi ? imi[n] : 0) * (w ? w[n] : 1);
        xr += ar * cr + ai * si;
        xi += ai * cr - ar * si;
      }
      Xr[k] = xr; Xi[k] = xi;
      mag[k] = Math.sqrt(xr * xr + xi * xi);
    }

    var peakBin = 0, peakMag = mag[0];
    for (k = 1; k < M; k++) if (mag[k] > peakMag) { peakMag = mag[k]; peakBin = k; }
    for (k = 0; k < M; k++) {
      db[k] = mag[k] > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(mag[k] / (peakMag > 0 ? peakMag : 1))) : DB_FLOOR;
    }

    return { ok: true, M: M, re: Xr, im: Xi, mag: mag, db: db, peakBin: peakBin, peakMag: peakMag };
  }

  /*
   * spectrum(opts) —— opts: { fIn, fs, M, win, amp }
   * 生成单频 x[n] = amp·sin(2π·fIn·n/fs)，加窗后做 DFT。
   * 返回 { ok, fs, M, fIn, win, amp, x[], w[], cg, freq[], mag[], db[],
   *        peakBin, peakFreq, peakMag, peakAmp }
   *   peakAmp = 2·|X_peak|/(M·cg) —— 相干增益校正后的幅度估计（整 bin 时≈真实幅值）
   */
  function spectrum(opts) {
    opts = opts || {};
    var fs = num(opts.fs); if (fs == null) fs = FS_DEFAULT;
    var M = intOr(opts.M, M_DEFAULT);
    var fIn = num(opts.fIn); if (fIn == null) fIn = F_IN_DEFAULT;
    var win = normWin(opts.win == null ? 'rect' : opts.win);
    var amp = num(opts.amp); if (amp == null) amp = 1;

    if (!(fs > 0)) return { ok: false, error: '采样率 fs 必须为正数（Hz）' };
    if (!(M >= 8 && M <= M_MAX)) return { ok: false, error: 'DFT 长度 M 需在 8–' + M_MAX + ' 之间' };
    if (!win) return { ok: false, error: '窗类型需为 rect / hann / hamming / blackman' };
    if (!(fIn >= 0)) return { ok: false, error: '被分析频率 f_in 不能为负' };

    var w = windowFn(win, M);
    var x = new Array(M), n, k;
    for (n = 0; n < M; n++) x[n] = amp * Math.sin(TWO_PI * fIn * n / fs);

    var D = dft(x, null, w);
    if (!D.ok) return D;

    var freq = new Array(M);
    for (k = 0; k < M; k++) freq[k] = k * fs / M;

    // 峰值限定在正频率半区（0 .. M/2）
    var half = M >> 1;
    var pk = 0;
    for (k = 1; k <= half; k++) if (D.mag[k] > D.mag[pk]) pk = k;

    var cg = w.cg;
    var peakAmp = cg > 0 ? (2 * D.mag[pk]) / (M * cg) : null;

    return {
      ok: true,
      fs: fs, M: M, fIn: fIn, win: win, amp: amp,
      x: x, w: w, cg: cg,
      freq: freq, mag: D.mag, db: D.db, re: D.re, im: D.im,
      binIndex: fIn * M / fs,     // 真实频率对应的（可能非整数）bin 位置
      df: fs / M,                 // bin 间隔 Hz
      peakBin: pk,
      peakFreq: pk * fs / M,
      peakMag: D.mag[pk],
      peakAmp: peakAmp
    };
  }

  /* ----------------------- D. 泄漏与主瓣 ----------------------- */

  // 窗序列的 DTFT 幅度（δ 以 bin 为单位）：|Σ w[n]·exp(−2πi·δ·n/M)|
  function windowDTFTMag(w, delta) {
    var M = w.length, sr = 0, si = 0, n, a;
    for (n = 0; n < M; n++) {
      a = TWO_PI * delta * n / M;
      sr += w[n] * Math.cos(a);
      si -= w[n] * Math.sin(a);
    }
    return Math.sqrt(sr * sr + si * si);
  }

  /*
   * 第一零点（主瓣第一极小）距峰值的 bin 距离。
   * 说明：对称窗（分母 M−1）的精确零点并不落在整数 bin 上，直接查 DFT 采样值会漏掉
   * 零点，故这里在细网格（1/64 bin）上扫描窗的 DTFT，取其第一个局部极小位置。
   */
  function windowNullOffset(kind, M) {
    var w = windowFn(kind, M);
    if (!w) return null;
    var step = 1 / 64, lim = 8;
    var prev = windowDTFTMag(w, 0);
    var cur = windowDTFTMag(w, step);
    var d, next;
    for (d = step; d <= lim + 1e-9; d += step) {
      next = windowDTFTMag(w, d + step);
      if (cur <= prev && cur <= next) return d;
      prev = cur; cur = next;
    }
    return null;
  }

  /*
   * leakage(opts) —— opts: { fIn, fs, M, win, amp }
   * 在 spectrum() 基础上给出泄漏与主瓣口径：
   *   binOffset      —— binIndex 的小数部分（0 表示整 bin）
   *   onBin          —— 是否正好落在某个 bin 上
   *   nullOffsetBins —— 窗 DTFT 的第一零点距峰值的 bin 距离（细网格实测，≈1/2/2/3）
   *   mainlobeWidthBins / mainlobeWidthHz —— 理论第一零点主瓣宽度
   *   mainlobeMeasuredBins / mainlobeMeasuredHz —— 实测（可为 null）
   *   sidelobeDb / sidelobeBin / sidelobeFreq —— 主瓣之外的最高旁瓣电平
   */
  function leakage(opts) {
    var sp = spectrum(opts);
    if (!sp.ok) return sp;

    var M = sp.M, fs = sp.fs, mag = sp.mag, db = sp.db;
    var binIndex = sp.binIndex;
    var nearest = Math.round(binIndex);
    var binOffset = binIndex - nearest;
    var onBin = Math.abs(binOffset) < 1e-9;

    var nullOffset = windowNullOffset(sp.win, M);
    var mlBins = WIN_MAINLOBE[sp.win];
    var half = M >> 1;
    var excl = mlBins / 2;

    // 最高旁瓣：主瓣与镜像主瓣之外、正频率半区内的最大 dB
    var best = -Infinity, bestBin = -1, k, dm, dm2;
    for (k = 1; k < half; k++) {
      dm = Math.abs(k - binIndex);
      dm2 = Math.abs(k - (M - binIndex));
      if (dm <= excl || dm2 <= excl) continue;
      if (db[k] > best) { best = db[k]; bestBin = k; }
    }
    if (bestBin < 0) { best = null; bestBin = null; }

    return {
      ok: true,
      fs: fs, M: M, fIn: sp.fIn, win: sp.win, amp: sp.amp,
      x: sp.x, w: sp.w, cg: sp.cg,
      freq: sp.freq, mag: mag, db: db,
      df: sp.df,
      binIndex: binIndex, binOffset: binOffset, onBin: onBin,
      peakBin: sp.peakBin, peakFreq: sp.peakFreq, peakMag: sp.peakMag, peakAmp: sp.peakAmp,
      nullOffsetBins: nullOffset,
      mainlobeWidthBins: mlBins,
      mainlobeWidthHz: mlBins * fs / M,
      mainlobeMeasuredBins: nullOffset == null ? null : 2 * nullOffset,
      mainlobeMeasuredHz: nullOffset == null ? null : 2 * nullOffset * fs / M,
      sidelobeDb: best, sidelobeBin: bestBin,
      sidelobeFreq: bestBin == null ? null : bestBin * fs / M
    };
  }

  /* ----------------------- E. 混叠 ----------------------- */

  // 混叠判定与折叠频率 f_alias = |f_in − round(f_in/fs)·fs|
  function aliasInfo(fIn, fs) {
    var f = num(fIn), s = num(fs);
    var nyq = s > 0 ? s / 2 : null;
    if (f == null || !(s > 0)) return { alias: false, aliasFreq: null, nyquist: nyq, folds: null };
    var folds = Math.round(f / s);
    var fa = Math.abs(f - folds * s);
    return { alias: f > s / 2 + 1e-12, aliasFreq: fa, nyquist: s / 2, folds: folds };
  }

  /* ----------------------- 主入口 ----------------------- */
  /*
   * opts: { kind, N, f0, fs, M, win, fIn, cycles, samples }
   * 返回 { ok: true, ...时域合成结果..., ...加窗频谱与泄漏结果..., 混叠告警, notes[] }
   */
  function simulate(opts) {
    opts = opts || {};

    var kind = normKind(opts.kind == null ? 'square' : opts.kind);
    if (!kind) return { ok: false, error: '波形类型需为 square / saw / triangle / rectified' };
    var win = normWin(opts.win == null ? 'rect' : opts.win);
    if (!win) return { ok: false, error: '窗类型需为 rect / hann / hamming / blackman' };

    var N = intOr(opts.N, 9);
    var f0 = num(opts.f0); if (f0 == null) f0 = F0_DEFAULT;
    var fs = num(opts.fs); if (fs == null) fs = FS_DEFAULT;
    var M = intOr(opts.M, M_DEFAULT);
    var fIn = num(opts.fIn); if (fIn == null) fIn = F_IN_DEFAULT;
    var cycles = num(opts.cycles); if (cycles == null) cycles = CYCLES_DEFAULT;
    var samples = intOr(opts.samples, SAMPLES_DEFAULT);

    if (!(N >= N_MIN && N <= N_MAX)) return { ok: false, error: '谐波数 N 需在 ' + N_MIN + '–' + N_MAX + ' 之间' };
    if (!(f0 > 0)) return { ok: false, error: '基频 f₀ 必须为正数（Hz）' };
    if (!(fs >= 1000 && fs <= 192000)) return { ok: false, error: '采样率 fs 需在 1000–192000 Hz 之间' };
    if (!(M >= 8 && M <= M_MAX)) return { ok: false, error: 'DFT 长度 M 需在 8–' + M_MAX + ' 之间（建议 256/512）' };
    if (!(fIn >= 0)) return { ok: false, error: '被分析频率 f_in 不能为负' };
    if (!(cycles > 0 && cycles <= 8)) return { ok: false, error: '显示周期数需在 1–8 之间' };
    if (!(samples >= 16 && samples <= 16384)) return { ok: false, error: '时域采样点数需在 16–16384 之间' };

    var sy = synth({ kind: kind, N: N, f0: f0, cycles: cycles, samples: samples });
    if (!sy.ok) return sy;
    var lg = leakage({ fIn: fIn, fs: fs, M: M, win: win });
    if (!lg.ok) return lg;
    var al = aliasInfo(fIn, fs);

    var notes = [
      'DFT 为直接 O(M²) 实现（非 FFT），M = ' + M + '，便于逐点手工验算；更大长度请用 FFT。',
      '加窗引入相干增益 CG = mean(w) = ' + lg.cg.toFixed(4) + '；整 bin 单频幅度校正 A = 2|X_peak|/(M·CG) = ' +
        (lg.peakAmp == null ? '—' : lg.peakAmp.toFixed(4)) + '（真实幅值 1）。',
      '频谱泄漏：f_in 非整 bin（当前偏移 ' + lg.binOffset.toFixed(3) + ' bin）时能量扩散到全部 bin；' +
        '矩形窗旁瓣 −13.3 dB、Hann −31.5 dB、Blackman −58 dB，代价是主瓣变宽。',
      '主瓣宽度按第一零点（null-to-null）口径：矩形 2 bin、Hann/Hamming 4 bin、Blackman 6 bin；' +
        '当前窗 ' + win + ' = ' + lg.mainlobeWidthBins + ' bin（' + lg.mainlobeWidthHz.toFixed(2) + ' Hz）。',
      '混叠条件：f_in > fs/2（奈奎斯特 ' + (fs / 2) + ' Hz）；折叠频率 f_alias = |f_in − round(f_in/fs)·fs|，采样前需抗混叠滤波。',
      'Gibbs 现象：方波部分和在跳变处的过冲随 N 增大单调趋近 1.17898（相对跳变幅度 2 为 8.95%），增大 N 只压缩过冲区间而不消除它。'
    ];

    return {
      ok: true,
      kind: kind, N: N, f0: f0, fs: fs, M: M, win: win, fIn: fIn,
      cycles: cycles, samples: samples,
      period: sy.period, dt: sy.dt, span: sy.span,
      t: sy.t, x: sy.x, ideal: sy.ideal, harmonics: sy.harmonics,
      overshoot: sy.overshoot, overshootGrid: sy.overshootGrid,
      overshootPct: sy.overshootPct, overshootJumpPct: sy.overshootJumpPct,
      rms: sy.rms, mse: sy.mse, rmsError: sy.rmsError,
      w: lg.w, cg: lg.cg,
      freq: lg.freq, mag: lg.mag, db: lg.db, df: lg.df,
      binIndex: lg.binIndex, binOffset: lg.binOffset, onBin: lg.onBin,
      peakBin: lg.peakBin, peakFreq: lg.peakFreq, peakMag: lg.peakMag, peakAmp: lg.peakAmp,
      nullOffsetBins: lg.nullOffsetBins,
      mainlobeWidthBins: lg.mainlobeWidthBins, mainlobeWidthHz: lg.mainlobeWidthHz,
      mainlobeMeasuredBins: lg.mainlobeMeasuredBins, mainlobeMeasuredHz: lg.mainlobeMeasuredHz,
      sidelobeDb: lg.sidelobeDb, sidelobeBin: lg.sidelobeBin, sidelobeFreq: lg.sidelobeFreq,
      alias: al.alias, aliasFreq: al.aliasFreq, nyquist: al.nyquist, folds: al.folds,
      notes: notes
    };
  }

  var API = {
    DB_FLOOR: DB_FLOOR,
    N_MIN: N_MIN,
    N_MAX: N_MAX,
    M_MAX: M_MAX,
    FS_DEFAULT: FS_DEFAULT,
    M_DEFAULT: M_DEFAULT,
    F0_DEFAULT: F0_DEFAULT,
    F_IN_DEFAULT: F_IN_DEFAULT,
    CYCLES_DEFAULT: CYCLES_DEFAULT,
    SAMPLES_DEFAULT: SAMPLES_DEFAULT,
    WAVEFORMS: WAVEFORMS,
    WINDOWS: WINDOWS,
    WIN_MAINLOBE: WIN_MAINLOBE,
    waveform: waveform,
    idealWaveform: idealWaveform,
    harmonicAmp: harmonicAmp,
    synth: synth,
    windowFn: windowFn,
    windowInfo: windowInfo,
    windowMainlobe: windowMainlobe,
    windowNullOffset: windowNullOffset,
    dft: dft,
    spectrum: spectrum,
    leakage: leakage,
    aliasInfo: aliasInfo,
    simulate: simulate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimFourier = API;
  }
})(typeof window !== 'undefined' ? window : this);
