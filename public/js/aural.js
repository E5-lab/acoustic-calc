/*
 * aural.js — 声学可听化内核（Auralization）
 * 浏览器挂到 window.Aural，Node 下 module.exports。
 *
 * 能力：
 *   1) 由房间几何声学回波（sim.js 的 receiverBands）合成脉冲响应 IR；
 *      或由直接给定的各倍频带混响时间合成 IR。
 *   2) FFT 快速卷积：干信号 ⊛ IR → 可试听的房间声。
 *   3) 倍频带频谱整形（OLA + FFT）：按隔声量 R 衰减声音，用于"隔声前后"试听。
 *   4) 合成干信号（拍手脉冲 / 音节序列 / 粉噪）与 16 bit WAV 编码。
 *
 * 定位：可听化演示与方案比选（相对比较），不做绝对声级校准。
 */
(function (global) {
  'use strict';

  var BANDS = [125, 250, 500, 1000, 2000, 4000];
  var NB = BANDS.length;
  /* A 计权修正量（dB），IEC 61672 */
  var A_WEIGHT = [-16.1, -8.6, -3.2, 0.0, 1.2, 1.0];

  /* 常用构造的倍频带隔声量 R（dB，125–4000 Hz）——典型资料量级，供可听化演示与比选 */
  var INSULATION_PRESETS = [
    { id: 'curtain', name: '隔声帘 / 软隔断', R: [3, 5, 7, 9, 11, 13] },
    { id: 'wood-door', name: '普通木门（无密封）', R: [10, 13, 16, 18, 20, 22] },
    { id: 'door-steel', name: '钢板门（无密封）', R: [12, 15, 18, 20, 22, 24] },
    { id: 'gypsum-12', name: '12 mm 石膏板隔墙（轻钢龙骨）', R: [15, 18, 22, 26, 30, 32] },
    { id: 'glass-double', name: '双层中空玻璃 6+12A+6', R: [20, 24, 28, 32, 36, 38] },
    { id: 'aac-100', name: '100 mm 加气混凝土砌块', R: [30, 34, 38, 42, 45, 46] },
    { id: 'brick-240', name: '240 mm 砖墙（双面抹灰）', R: [36, 40, 45, 50, 53, 55] },
    { id: 'slab-150', name: '150 mm 混凝土楼板', R: [40, 44, 48, 52, 55, 58] }
  ];

  /* 典型噪声源的倍频带声级（dB，相对值；白噪按每倍频程 +3 dB） */
  var NOISE_SOURCES = [
    { id: 'white', name: '白噪声', levels: [0, 3, 6, 9, 12, 15] },
    { id: 'pink', name: '粉红噪声', levels: [0, 0, 0, 0, 0, 0] },
    { id: 'traffic', name: '道路交通噪声', levels: [-4, -1, 2, 0, -4, -10] },
    { id: 'hvac', name: '空调机组 / 风机', levels: [0, -3, -7, -12, -18, -25] },
    { id: 'speech', name: '语言 / 人声', levels: [-14, -8, -1, 0, -6, -15] },
    { id: 'machine', name: '机械设备（低频为主）', levels: [0, -2, -8, -16, -25, -32] }
  ];

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function nextPow2(n) { var p = 1; while (p < n) p <<= 1; return p; }

  /* 确定性伪随机（同一 seed 结果可复现） */
  function rngFactory(seed) {
    var s = (Math.round(num(seed)) || 1) | 0;
    if (s === 0) s = 1;
    s = s & 0x7fffffff;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /* ============ 基 2 迭代 FFT（原地，re/im 长度须为 2 的幂） ============ */
  function fft(re, im, inverse) {
    var n = re.length, i, j, bit;
    if (n <= 1) return;
    for (i = 1, j = 0; i < n; i++) {
      for (bit = n >> 1; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = 2 * Math.PI / len * (inverse ? 1 : -1);
      var wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (var k = 0; k < len / 2; k++) {
          var ur = re[i + k], ui = im[i + k];
          var vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          var vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          var ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inverse) {
      for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
  }

  /* 倍频带取值 → 频率 f 处的取值（dB）
   * 带内基本恒定、只在带边（相邻中心频率的几何均值处）做平滑过渡；
   * 若按中心频率做线性插值，衰减会变成"中心尖谷"，整带平均衰减远小于设定值。
   * edgeT：过渡带占相邻中心频率间隔的比例（默认 0.25）。
   */
  function logInterpDb(f, freqs, vals, edgeT) {
    var n = freqs.length;
    edgeT = (edgeT == null) ? 0.25 : clamp(edgeT, 0.02, 1);
    if (!(f > 0)) return vals[0];
    if (f <= freqs[0]) return vals[0];
    if (f >= freqs[n - 1]) return vals[n - 1];
    for (var i = 0; i < n - 1; i++) {
      if (f <= freqs[i + 1]) {
        var mid = Math.sqrt(freqs[i] * freqs[i + 1]);
        var half = Math.log(freqs[i + 1] / freqs[i]) / 2;
        var span = half * edgeT;
        var t01 = clamp((Math.log(f) - Math.log(mid) + span) / (2 * span), 0, 1);
        var s = t01 * t01 * (3 - 2 * t01);
        return vals[i] + (vals[i + 1] - vals[i]) * s;
      }
    }
    return vals[n - 1];
  }

  /* 倍频带"带级"(dB) → 频谱密度(dB/Hz)：减去带宽 10lg(BW)，BW = f·(√2 − 1/√2) */
  function bandLevelsToPsd(L) {
    var out = [];
    for (var i = 0; i < NB; i++) {
      out.push(L[i] - (10 * Math.log10(BANDS[i] * (Math.SQRT2 - 1 / Math.SQRT2))));
    }
    return out;
  }

  /* 倍频带取值 → 每个 FFT bin 的线性增益 */
  function binGains(dbVals, n, sr) {
    var g = new Float64Array(n / 2 + 1), k;
    for (k = 0; k <= n / 2; k++) {
      var f = k * sr / n;
      g[k] = Math.pow(10, logInterpDb(f, BANDS, dbVals) / 20);
    }
    return g;
  }

  /* ============ 频谱整形白噪声（用于声源噪声 / IR 的带噪声） ============ */
  function shapedNoise(o) {
    o = o || {};
    var sr = Math.round(num(o.sr) || 44100);
    var dur = clamp(num(o.durSec) || 1, 0.02, 30);
    var N = nextPow2(Math.max(64, Math.round(dur * sr)));
    var spec = o.spectrumDb || [0, 0, 0, 0, 0, 0];
    var rnd = rngFactory(o.seed == null ? 12345 : o.seed);
    var re = new Float64Array(N), im = new Float64Array(N), i;
    /* 白噪声（时域） */
    for (i = 0; i < N; i++) re[i] = rnd() * 2 - 1;
    fft(re, im, false);
    var g = binGains(spec, N, sr);
    for (i = 0; i <= N / 2; i++) { re[i] *= g[i]; im[i] *= g[i]; }
    /* 负频率分量须同步乘同一实增益（保持共轭对称），此前误乘 -1 会破坏实信号性 */
    for (i = 1; i < N / 2; i++) { re[N - i] *= g[i]; im[N - i] *= g[i]; }
    fft(re, im, true);
    var out = new Float32Array(N);
    for (i = 0; i < N; i++) out[i] = re[i];
    normalizePeak(out, num(o.peak) || 0.9);
    return out;
  }

  function normalizePeak(x, peak) {
    var mx = 0, i;
    for (i = 0; i < x.length; i++) { var a = Math.abs(x[i]); if (a > mx) mx = a; }
    if (mx > 0) { var k = peak / mx; for (i = 0; i < x.length; i++) x[i] *= k; }
    return x;
  }

  /* 取一条频带的带限噪声（由同一白噪声经频域掩膜得到，保证各带互不相关） */
  function bandNoise(rnd, N, sr, bandIdx, edgeDb) {
    var re = new Float64Array(N), im = new Float64Array(N), i;
    for (i = 0; i < N; i++) re[i] = rnd() * 2 - 1;
    fft(re, im, false);
    var lo = BANDS[bandIdx] / Math.SQRT2, hi = BANDS[bandIdx] * Math.SQRT2;
    var edge = Math.pow(10, (edgeDb == null ? -18 : edgeDb) / 20);
    function mask(f) {
      if (f >= lo && f <= hi) return 1;
      var r = f < lo ? lo / f : f / hi;
      return Math.max(0, 1 - (1 - edge) * Math.min(1, (r - 1) / 0.6));
    }
    for (i = 0; i <= N / 2; i++) {
      var m = mask(i * sr / N);
      re[i] *= m; im[i] *= m;
    }
    for (i = 1; i < N / 2; i++) { re[N - i] *= mask(i * sr / N); im[N - i] *= mask(i * sr / N); }
    fft(re, im, true);
    var out = new Float32Array(N), mx = 0;
    for (i = 0; i < N; i++) { out[i] = re[i]; var a = Math.abs(out[i]); if (a > mx) mx = a; }
    if (mx > 0) for (i = 0; i < N; i++) out[i] /= mx;
    return out;
  }

  /* ============ 由回波合成脉冲响应 ============
   * ec: sim.js 的 receiverBands 结果 {bins(Float32Array NB*nb), nb, binMs}
   * 每个频带用带限噪声 × sqrt(该带能量时程) 叠加，直达声与早期反射的位置由回波本身决定。
   */
  function irFromEchogram(ec, o) {
    o = o || {};
    if (!ec || !ec.bins || !ec.nb) return null;
    var sr = Math.round(num(o.sr) || 44100);
    var nb = ec.nb, binMs = ec.binMs || 10;
    var dur = clamp(num(o.durSec) || (nb * binMs / 1000 + 0.05), 0.05, 12);
    var N = nextPow2(Math.max(256, Math.round(dur * sr)));
    var rnd = rngFactory(o.seed == null ? 777 : o.seed);

    /* 各带能量时程 → 振幅包络（线性插值 + 轻微平滑） */
    var env = [];
    for (var k = 0; k < NB; k++) {
      var e = new Float32Array(N), j;
      var raw = new Float64Array(nb);
      for (j = 0; j < nb; j++) raw[j] = ec.bins[k * nb + j] || 0;
      for (j = 1; j < nb; j++) raw[j] = (raw[j] + raw[j - 1] * 2) / 3;   // 轻平滑，去毛刺
      var mx = 0;
      for (j = 0; j < nb; j++) if (raw[j] > mx) mx = raw[j];
      if (!(mx > 0)) { env.push(null); continue; }
      for (j = 0; j < N; j++) {
        var tMs = j / sr * 1000;
        var bi = tMs / binMs;
        if (bi >= nb - 1) { e[j] = 0; continue; }
        var i0 = Math.floor(bi), fr = bi - i0;
        var v = raw[i0] * (1 - fr) + raw[i0 + 1] * fr;
        e[j] = Math.sqrt(Math.max(0, v / mx));
      }
      env.push(e);
    }

    var ir = new Float32Array(N), any = false;
    for (k = 0; k < NB; k++) {
      if (!env[k]) continue;
      any = true;
      var nz = bandNoise(rnd, N, sr, k, -24);
      for (var i = 0; i < N; i++) ir[i] += nz[i] * env[k][i];
    }
    if (!any) return null;                       // 回波全零（声源未照到接收点）→ 无法合成
    normalizePeak(ir, num(o.peak) || 1);
    return { sr: sr, data: ir, durSec: N / sr };
  }

  /* ============ 由指定倍频带混响时间合成脉冲响应 ============
   * RT 指 60 dB 衰减用时：能量 E(t)=exp(-13.8155·t/RT)，故振幅包络 exp(-6.9078·t/RT)。
   * （注意不是 3.45/RT——那只会给出 30 dB/RT，T30 会恰好差一倍。）
   * 另叠一个直达脉冲，使干湿比可控。
   */
  function irFromRT(rtBands, o) {
    o = o || {};
    var sr = Math.round(num(o.sr) || 44100);
    var rt = [];
    for (var k = 0; k < NB; k++) {
      var v = num(Array.isArray(rtBands) ? rtBands[k] : rtBands);
      rt.push(v != null && v > 0.01 ? v : 0.3);
    }
    var maxRt = 0;
    rt.forEach(function (v) { if (v > maxRt) maxRt = v; });
    var dur = clamp(num(o.durSec) || (maxRt * 1.15 + 0.15), 0.1, 15);
    var N = nextPow2(Math.max(256, Math.round(dur * sr)));
    var rnd = rngFactory(o.seed == null ? 4242 : o.seed);
    var ir = new Float32Array(N), i;
    for (k = 0; k < NB; k++) {
      var nz = bandNoise(rnd, N, sr, k, -24);
      var lam = 6.9078 / rt[k];                   // 振幅衰减率 (1/s) → 能量 13.8155/RT
      var pre = clamp(num(o.preDelayMs) || 0, 0, 200) / 1000;
      var p0 = Math.round(pre * sr);
      for (i = 0; i < N; i++) {
        var t = (i - p0) / sr;
        ir[i] += nz[i] * (t < 0 ? 0 : Math.exp(-lam * t));
      }
    }
    /* 直达声（含 S/N 可调） */
    var dg = num(o.directGain);
    if (dg == null) dg = 0.6;
    if (dg > 0) {
      var d0 = Math.round(clamp(num(o.directMs) || 0, 0, 300) / 1000 * sr);
      var w = Math.max(1, Math.round(sr * 0.0006));       // 0.6 ms 窄脉冲
      for (i = 0; i < w && d0 + i < N; i++) {
        ir[d0 + i] += dg * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / w));
      }
    }
    normalizePeak(ir, num(o.peak) || 1);
    return { sr: sr, data: ir, durSec: N / sr, rt: rt };
  }

  /* ============ FFT 快速卷积 ============ */
  function convolve(dry, ir) {
    if (!dry || !ir || !dry.length || !ir.length) return null;
    var n = nextPow2(dry.length + ir.length - 1);
    var re = new Float64Array(n), im = new Float64Array(n), i;
    for (i = 0; i < dry.length; i++) re[i] = dry[i];
    var re2 = new Float64Array(n), im2 = new Float64Array(n);
    for (i = 0; i < ir.length; i++) re2[i] = ir[i];
    fft(re, im, false); fft(re2, im2, false);
    for (i = 0; i < n; i++) {
      var a = re[i], b = im[i], c = re2[i], d = im2[i];
      re[i] = a * c - b * d; im[i] = a * d + b * c;
    }
    fft(re, im, true);
    var outLen = dry.length + ir.length - 1;
    var out = new Float32Array(outLen), mx = 0;
    for (i = 0; i < outLen; i++) { out[i] = re[i]; var ab = Math.abs(out[i]); if (ab > mx) mx = ab; }
    if (mx > 0) { var kk = 0.95 / mx; for (i = 0; i < outLen; i++) out[i] *= kk; }
    return out;
  }

  /* ============ 倍频带频谱整形（OLA + FFT）：按隔声量衰减 ============
   * gainsDb 为各带的增益（dB）；隔声量 R 传 -R 即可。
   */
  function applyOctaveGains(x, gainsDb, sr) {
    if (!x || !x.length) return null;
    var B = 8192, H = B / 2, i, k;
    var win = new Float64Array(B);
    for (i = 0; i < B; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / B);
    var g = binGains(gainsDb, B, sr);
    var pad = H, n = x.length + 2 * pad;
    var buf = new Float64Array(n);
    for (i = 0; i < x.length; i++) buf[i + pad] = x[i];
    var out = new Float64Array(n), acc = new Float64Array(n);
    var re = new Float64Array(B), im = new Float64Array(B);
    var frames = Math.floor((n - B) / H) + 1;
    for (var fi = 0; fi < frames; fi++) {
      var start = fi * H;
      for (i = 0; i < B; i++) { re[i] = buf[start + i] * win[i]; im[i] = 0; }
      fft(re, im, false);
      for (k = 0; k <= B / 2; k++) { re[k] *= g[k]; im[k] *= g[k]; }
      for (k = 1; k < B / 2; k++) { re[B - k] *= g[k]; im[B - k] *= g[k]; }
      fft(re, im, true);
      for (i = 0; i < B; i++) {
        out[start + i] += re[i] * win[i];
        acc[start + i] += win[i] * win[i];
      }
    }
    var res = new Float32Array(x.length);
    for (i = 0; i < x.length; i++) {
      var a = acc[i + pad];
      res[i] = a > 1e-6 ? out[i + pad] / a : 0;
    }
    return res;
  }

  /* ============ 干信号合成 ============ */
  /* 拍手 / 电火花：极短宽带脉冲（略带包络，避免纯单样本过尖） */
  function clap(sr, durSec, seed) {
    sr = Math.round(sr || 44100);
    var n = Math.max(64, Math.round((durSec || 0.25) * sr));
    var out = new Float32Array(n);
    var rnd = rngFactory(seed == null ? 31337 : seed);
    var decay = Math.round(sr * 0.006);
    for (var i = 0; i < n && i < decay * 6; i++) {
      out[i] = (rnd() * 2 - 1) * Math.exp(-i / decay);
    }
    normalizePeak(out, 0.95);
    return out;
  }

  /* 合成音节序列（元音 + 摩擦音），用于语言清晰度试听；非真人语音 */
  var VOWELS = [
    { f: [730, 1090, 2440] },  // a
    { f: [270, 2290, 3010] },  // i
    { f: [530, 1840, 2480] },  // e
    { f: [570, 840, 2410] },   // o
    { f: [300, 870, 2240] },   // u
    { f: [660, 1720, 2410] }   // æ
  ];
  function syllables(sr, seed) {
    sr = Math.round(sr || 44100);
    var rnd = rngFactory(seed == null ? 99 : seed);
    var sylDur = 0.30, gap = 0.14, f0 = 118;
    var n = Math.round((VOWELS.length * (sylDur + gap)) * sr);
    var out = new Float32Array(n);
    for (var s = 0; s < VOWELS.length; s++) {
      var v = VOWELS[s];
      var t0 = s * (sylDur + gap);
      var i0 = Math.round(t0 * sr), len = Math.round(sylDur * sr);
      var f0s = f0 * (1 - 0.02 * s) * (1 + (rnd() - 0.5) * 0.01);
      var nh = Math.min(48, Math.floor(4000 / f0s));
      /* 摩擦音：音节前 25 ms 的带限噪声（≈ 2 kHz 以上） */
      var fric = Math.round(sr * 0.03);
      for (var q = 0; q < fric && i0 - fric + q >= 0 && i0 - fric + q < n; q++) {
        out[i0 - fric + q] += 0.35 * (rnd() * 2 - 1) * (q / fric) * Math.exp(-q / (fric * 0.5));
      }
      for (var i = 0; i < len && i0 + i < n; i++) {
        var t = i / sr, ph = 2 * Math.PI * f0s * t;
        var env = Math.min(1, t / 0.04) * Math.min(1, (sylDur - t) / 0.06);
        var smp = 0;
        for (var h = 1; h <= nh; h++) {
          var f = f0s * h;
          var base = 1 / Math.pow(h, 1.1);
          var fg = 1;
          for (var r = 0; r < v.f.length; r++) {
            var bw = 70 + 40 * r;
            fg += [9, 5, 1.6][r] / (1 + Math.pow((f - v.f[r]) / bw, 2));
          }
          smp += base * Math.sqrt(fg) * Math.sin(ph * h);
        }
        out[i0 + i] += 0.09 * env * smp;
      }
    }
    normalizePeak(out, 0.95);
    return out;
  }

  /* ============ 电平 / 频谱统计 ============ */
  function rmsDb(x) {
    if (!x || !x.length) return -Infinity;
    var s = 0;
    for (var i = 0; i < x.length; i++) s += x[i] * x[i];
    return 10 * Math.log10(Math.max(1e-20, s / x.length));
  }

  /* 各倍频带相对声级（dB，以最强带为 0 dB；Welch 分段周期图平均） */
  function bandLevels(x, sr) {
    if (!x || !x.length) return null;
    var N = 8192, i, k, b;
    while (N > x.length && N > 512) N >>= 1;
    if (N < 512) return null;
    var hop = N / 2;
    var p = new Float64Array(NB), cnt = 0;
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var start = 0; start + N <= x.length; start += hop) {
      for (i = 0; i < N; i++) {
        re[i] = x[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        im[i] = 0;
      }
      fft(re, im, false);
      for (k = 1; k <= N / 2; k++) {
        var f = k * sr / N;
        var pw = re[k] * re[k] + im[k] * im[k];
        for (b = 0; b < NB; b++) {
          if (f >= BANDS[b] / Math.SQRT2 && f < BANDS[b] * Math.SQRT2) { p[b] += pw; break; }
        }
      }
      cnt++;
    }
    if (!cnt) return null;
    var out = [], mx = 0;
    for (b = 0; b < NB; b++) if (p[b] > mx) mx = p[b];
    for (b = 0; b < NB; b++) out.push(mx > 0 && p[b] > 0 ? 10 * Math.log10(p[b] / mx) : -60);
    return out;
  }

  /* 隔声量 R 带来的 A 计权降低量（正数，dB） */
  function awReduction(bandLp, R) {
    var s0 = 0, s1 = 0, k;
    for (k = 0; k < NB; k++) {
      var L = bandLp[k], r = R[k] == null ? 0 : R[k];
      s0 += Math.pow(10, (L + A_WEIGHT[k]) / 10);
      s1 += Math.pow(10, (L + A_WEIGHT[k] - r) / 10);
    }
    if (!(s0 > 0) || !(s1 > 0)) return null;
    return 10 * Math.log10(s0 / s1);
  }
  /* 不计权的线性声级降低量 */
  function linReduction(bandLp, R) {
    var s0 = 0, s1 = 0, k;
    for (k = 0; k < NB; k++) {
      var L = bandLp[k], r = R[k] == null ? 0 : R[k];
      s0 += Math.pow(10, L / 10); s1 += Math.pow(10, (L - r) / 10);
    }
    if (!(s0 > 0) || !(s1 > 0)) return null;
    return 10 * Math.log10(s0 / s1);
  }

  /* ============ 16 bit 单声道 WAV 编码（浏览器/Node 通用） ============ */
  function wavEncode(x, sr) {
    var n = x.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf), i;
    function str(off, s) { for (var q = 0; q < s.length; q++) dv.setUint8(off + q, s.charCodeAt(q)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) {
      var v = clamp(x[i], -1, 1);
      dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
    }
    return new Uint8Array(buf);
  }

  var API = {
    BANDS: BANDS, NB: NB, A_WEIGHT: A_WEIGHT,
    INSULATION_PRESETS: INSULATION_PRESETS, NOISE_SOURCES: NOISE_SOURCES,
    nextPow2: nextPow2, fft: fft, logInterpDb: logInterpDb, binGains: binGains,
    bandLevelsToPsd: bandLevelsToPsd,
    rngFactory: rngFactory, normalizePeak: normalizePeak,
    shapedNoise: shapedNoise, bandNoise: bandNoise,
    irFromEchogram: irFromEchogram, irFromRT: irFromRT, convolve: convolve,
    applyOctaveGains: applyOctaveGains,
    clap: clap, syllables: syllables,
    rmsDb: rmsDb, bandLevels: bandLevels,
    awReduction: awReduction, linReduction: linReduction,
    wavEncode: wavEncode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Aural = API;
})(typeof window !== 'undefined' ? window : this);
