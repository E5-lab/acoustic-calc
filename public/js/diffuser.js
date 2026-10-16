/*
 * diffuser.js — 声学扩散体设计内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Diffuser，Node 下 module.exports。
 *
 * 公式来源（均为公开经典声学理论，不含任何第三方商业实现）：
 *   - M. R. Schroeder, "Diffuse sound reflection by maximum-length sequences"
 *     (J. Acoust. Soc. Am., 1975) —— QRD / MLS 序列
 *   - T. J. Cox, P. D'Antonio, "Acoustic Absorbers and Diffusers" (3rd ed.) ——
 *     PRD（原根扩散体）、2D QRD、Skyline、Binary Amplitude、Wave、Fractal 等几何构造
 *
 * 单位约定：长度均为 mm；声速 C_AIR = 343000 mm/s（20 ℃ 空气）。
 *   设计波长 λ₀ = C_AIR / f₀；QRD 井深 d_n = (n² mod N)·λ₀/(2N)。
 *   最大井深 d_max = λ₀/2（QRD 实际 (N-1)λ₀/(2N)）；有效低频限 f_low = C_AIR/(2·d_max)，
 *   高频限 f_high = C_AIR/(2·a)（a 为井宽，对应井宽决定的空间混叠频率）。
 *   本内核只做「参数化几何 + 基于几何的频段估算 + 裁切清单」，不含 BEM/FEM 物理仿真；
 *   最终声学性能应以现场测量为准。
 */
(function (global) {
  'use strict';

  var C_AIR = 343000; // 声速 mm/s（20 ℃）

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function isPrime(n) {
    if (n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0) return false;
    for (var i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
    return true;
  }

  function primeFactors(n) {
    var f = {};
    var d = 2;
    while (d * d <= n) {
      while (n % d === 0) { f[d] = 1; n /= d; }
      d++;
    }
    if (n > 1) f[n] = 1;
    return Object.keys(f).map(Number);
  }

  function modpow(base, exp, mod) {
    var r = 1;
    base %= mod;
    while (exp > 0) {
      if (exp & 1) r = (r * base) % mod;
      exp = Math.floor(exp / 2);
      base = (base * base) % mod;
    }
    return r;
  }

  // 求素数 p 的原根（阶为 p-1）
  function primitiveRoot(p) {
    if (p === 2) return 1;
    var phi = p - 1;
    var fs = primeFactors(phi);
    for (var g = 2; g < p; g++) {
      var ok = true;
      for (var i = 0; i < fs.length; i++) {
        if (modpow(g, phi / fs[i], p) === 1) { ok = false; break; }
      }
      if (ok) return g;
    }
    return 1;
  }

  // QRD：s_n = n² mod N
  function qrdSeq(N) {
    var s = [];
    for (var n = 0; n < N; n++) s.push((n * n) % N);
    return s;
  }

  // PRD：t_n = gⁿ mod N（g 为 N 的原根）
  function prdSeq(N) {
    if (!isPrime(N)) return null;
    var g = primitiveRoot(N);
    var s = [];
    var cur = 1;
    for (var n = 0; n < N; n++) {
      s.push(cur);
      cur = (cur * g) % N;
    }
    return s;
  }

  // MLS：本原多项式驱动的 LFSR，返回长度 2^m-1 的 0/1 序列
  function mlsSeq(m) {
    var tables = { 2: 7, 3: 11, 4: 19, 5: 37, 6: 67, 7: 137, 8: 285, 9: 529, 10: 1033 };
    var poly = tables[m];
    if (!poly) return null;
    var reg = (1 << m) - 1;
    var len = (1 << m) - 1;
    var out = [];
    for (var i = 0; i < len; i++) {
      out.push(reg & 1);
      var fb = 0;
      for (var b = 0; b < m; b++) if ((poly >> b) & 1) fb ^= (reg >> b) & 1;
      reg = (reg >> 1) | (fb << (m - 1));
    }
    return out;
  }

  // 单轴序列转井深（mm）：d = s·λ₀/(2·weight)
  function depthsFromSeq(seq, lambda0, weight) {
    return seq.map(function (s) { return (s * lambda0) / (2 * weight); });
  }

  // 2D QRD：d_ij = (sx_i + sy_j)·(λ₀/2)/[(Nx-1)+(Ny-1)]
  function depths2D(seqX, seqY, lambda0) {
    var maxSum = seqX.length - 1 + seqY.length - 1;
    var out = [];
    for (var i = 0; i < seqX.length; i++) {
      var row = [];
      for (var j = 0; j < seqY.length; j++) {
        row.push(((seqX[i] + seqY[j]) * (lambda0 / 2)) / maxSum);
      }
      out.push(row);
    }
    return out;
  }

  // 频段分析（输入井深 mm、井宽 mm）
  function analyze(depthsMm, wellMm) {
    var dMax = 0, dMin = Infinity;
    depthsMm.forEach(function (d) {
      if (d > dMax) dMax = d;
      if (d < dMin) dMin = d;
    });
    if (dMin === Infinity) dMin = 0;
    var fLow = dMax > 0 ? C_AIR / (2 * dMax) : null;
    var fHigh = wellMm > 0 ? C_AIR / (2 * wellMm) : null;
    return { dMax: dMax, dMin: dMin, fLow: fLow, fHigh: fHigh };
  }

  // 频段契合度（基于几何的有效区间与目标区间重叠）
  function bandFit(fLow, fHigh, tLow, tHigh) {
    if (fLow == null || fHigh == null || !(tLow > 0) || !(tHigh > tLow)) return null;
    var overlap = Math.max(0, Math.min(fHigh, tHigh) - Math.max(fLow, tLow));
    var fit = (overlap / (tHigh - tLow)) * 100;
    var verdict;
    if (fit >= 95) verdict = '目标频段完全落入有效区间，几何覆盖优秀。';
    else if (fit >= 70) verdict = '目标频段大部分被覆盖，可适当增大井深或缩小井宽以补全覆盖缺口。';
    else if (fit >= 40) verdict = '覆盖不足，建议增大最大井深（降低设计频率）或缩小井宽以提升高频上限。';
    else verdict = '有效区间与目标频段严重错位，请重新选择设计频率或井宽。';
    return { fit: Math.round(fit * 10) / 10, verdict: verdict };
  }

  // 裁切清单（按井深聚合）；wellWidth mm，density kg/m³
  function cutList(depthsMm, wellMm, density) {
    var map = {};
    depthsMm.forEach(function (d) {
      var key = Math.round(d * 10) / 10;
      map[key] = (map[key] || 0) + 1;
    });
    var keys = Object.keys(map).map(Number).sort(function (a, b) { return b - a; });
    var rows = [];
    var totalVol = 0;
    var aM = wellMm / 1000;
    keys.forEach(function (d) {
      var count = map[d];
      var dM = d / 1000;
      var volM3 = aM * aM * dM;
      var volCm3 = volM3 * 1e6;
      rows.push({ depthMm: d, count: count, volCm3: volCm3, weightKg: volM3 * density });
      totalVol += volM3 * count;
    });
    return { rows: rows, totalVolCm3: totalVol * 1e6, totalWeightKg: totalVol * density };
  }

  /* ----------------------- 主入口 ----------------------- */
  function generate(opts) {
    opts = opts || {};
    var type = opts.type;
    var f0 = num(opts.f0);
    if (!type) return { ok: false, error: '请选择扩散体类型' };
    if (!(f0 > 0)) return { ok: false, error: '设计频率必须为正数（Hz）' };

    var unit = opts.unit || 'mm';
    var wIn = num(opts.wellWidth);
    if (!(wIn > 0)) return { ok: false, error: '井宽必须为正数' };
    var wellWidthMm = unit === 'cm' ? wIn * 10 : unit === 'in' ? wIn * 25.4 : wIn;
    var lambda0 = C_AIR / f0; // 设计波长 mm
    var density = num(opts.density) > 0 ? num(opts.density) : 600;

    var meta = TYPES.filter(function (t) { return t.id === type; })[0];
    if (!meta) return { ok: false, error: '未知扩散体类型：' + type };

    var seq, depthsMm, is2D = false, periodMm, N, m, Nx, Ny, notes = [], wellCount;

    if (type === 'qrd' || type === 'prd' || type === 'skyline' || type === 'binary' ||
        type === 'wave' || type === 'fractal') {
      N = num(opts.N);
      if (!meta.anyN && !isPrime(N)) {
        return { ok: false, error: meta.name + ' 要求周期数 N 为素数，请重新选择' };
      }
      if (!(N >= 2)) return { ok: false, error: 'N 至少为 2' };
    }

    if (type === 'qrd') {
      seq = qrdSeq(N);
      depthsMm = depthsFromSeq(seq, lambda0, N);
      notes.push('QRD 井深 d_n = (n² mod N)·λ₀/(2N)，n=0…N-1；最大井深≈λ₀/2。');
    } else if (type === 'prd') {
      seq = prdSeq(N);
      if (!seq) return { ok: false, error: 'PRD 要求 N 为素数' };
      depthsMm = depthsFromSeq(seq, lambda0, N);
      notes.push('PRD 井深 d_n = gⁿ mod N · λ₀/(2N)，g 为 N 的原根；散射图样与 QRD 不同，具方向性。');
    } else if (type === 'skyline') {
      seq = qrdSeq(N);
      depthsMm = depthsFromSeq(seq, lambda0, N);
      notes.push('Skyline（阶梯式）采用 QRD 井深序列的开口井形式，呈现"天际线"剖面，适合墙面/天花双向散射。');
    } else if (type === 'binary') {
      var mb = Math.max(2, Math.min(10, Math.round(Math.log2(N + 1)) || 5));
      seq = mlsSeq(mb);
      var dmaxBin = lambda0 / 4;
      depthsMm = seq.map(function (v) { return v ? dmaxBin : 0; });
      notes.push('Binary Amplitude 为二进制振幅光栅：反射井（深 λ₀/4）与吸声井（0）交替，兼具扩散与吸声。');
    } else if (type === 'wave') {
      depthsMm = [];
      var amp = lambda0 / 4;
      for (var k = 0; k < N; k++) depthsMm.push(amp * (1 - Math.cos((2 * Math.PI * k) / N)));
      notes.push('Wave（波纹）为光滑曲面：d(x) = (λ₀/4)·(1 − cos(2πx/Λ))，声学与建筑美学兼顾。');
    } else if (type === 'fractal') {
      var baseS = qrdSeq(N);
      depthsMm = [];
      for (var i2 = 0; i2 < N; i2++)
        for (var j2 = 0; j2 < N; j2++)
          depthsMm.push(((baseS[i2] + baseS[j2]) * (lambda0 / 2)) / (2 * (N - 1)));
      notes.push('Fractal 为自相似多尺度构造：将 QRD 序列在两尺度上嵌套叠加，扩展有效带宽。');
    } else if (type === 'mls') {
      m = num(opts.m) || 5;
      if (m < 2 || m > 10) return { ok: false, error: 'MLS 级数 m 取 2–10' };
      seq = mlsSeq(m);
      var dMaxMls = lambda0 / 2;
      depthsMm = seq.map(function (v) { return v ? dMaxMls : 0; });
      N = seq.length;
      notes.push('MLS 为最大长度序列二元深度扩散体，仅两种井深（0 / λ₀/2），功率谱平坦、制造最简单。');
    } else if (type === 'qrd2d') {
      Nx = num(opts.Nx);
      Ny = num(opts.Ny);
      if (!isPrime(Nx) || !isPrime(Ny)) return { ok: false, error: '2D QRD 要求 Nx、Ny 均为素数' };
      if (Nx < 2 || Ny < 2) return { ok: false, error: 'Nx、Ny 至少为 2' };
      var sX = qrdSeq(Nx);
      var sY = qrdSeq(Ny);
      depthsMm = depths2D(sX, sY, lambda0);
      is2D = true;
      wellCount = Nx * Ny;
      periodMm = [Nx * wellWidthMm, Ny * wellWidthMm];
      notes.push('2D QRD 在 X/Y 两轴独立取素数序列，d_ij = (sX_i + sY_j)·(λ₀/2)/[(Nx-1)+(Ny-1)]，实现半球散射。');
    } else {
      return { ok: false, error: '未支持的类型' };
    }

    if (!is2D) {
      wellCount = depthsMm.length;
      periodMm = wellCount * wellWidthMm;
    }

    var flatMm = is2D ? [].concat.apply([], depthsMm) : depthsMm;
    var an = analyze(flatMm, wellWidthMm);
    var cl = cutList(flatMm, wellWidthMm, density);
    var bf = bandFit(an.fLow, an.fHigh, num(opts.targetLow), num(opts.targetHigh));

    var completeness = null;
    if (an.fLow != null && an.fHigh != null) {
      var checks = 0, pass = 0;
      checks++; if (f0 >= an.fLow && f0 <= an.fHigh) pass++;
      checks++; if (an.fHigh / Math.max(an.fLow, 1) >= 2) pass++;
      completeness = Math.round((pass / checks) * 100);
    }

    return {
      ok: true,
      type: type,
      typeName: meta.name,
      is2D: is2D,
      f0: f0,
      lambda0Mm: lambda0,
      wellWidthMm: wellWidthMm,
      unit: unit,
      N: typeof N === 'number' ? N : undefined,
      m: typeof m === 'number' ? m : undefined,
      Nx: typeof Nx === 'number' ? Nx : undefined,
      Ny: typeof Ny === 'number' ? Ny : undefined,
      depthsMm: depthsMm,
      dMaxMm: an.dMax,
      dMinMm: an.dMin,
      periodMm: periodMm,
      wellCount: wellCount,
      fLow: an.fLow,
      fHigh: an.fHigh,
      bandFit: bf,
      completeness: completeness,
      cutList: cl.rows,
      totalVolCm3: cl.totalVolCm3,
      totalWeightKg: cl.totalWeightKg,
      notes: notes,
      seqInfo: (typeof seq === 'undefined' || !seq) ? null : { sample: seq.slice(0, 16), len: seq.length }
    };
  }

  /* ----------------------- 类型元信息 ----------------------- */
  var TYPES = [
    { id: 'qrd', name: 'QRD 二次余数', en: 'Quadratic Residue', desc: '宽频均匀散射，控制室/录音棚后墙首选', prime: true, needsN: true, anyN: false },
    { id: 'prd', name: 'PRD 原根', en: 'Primitive Root', desc: '非对称散射，具方向控制能力', prime: true, needsN: true, anyN: false },
    { id: 'mls', name: 'MLS 最大长度', en: 'Maximum Length', desc: '二元深度，功率谱平坦，制造最简单', needsM: true },
    { id: 'qrd2d', name: '2D QRD', en: 'Two-Dimensional QRD', desc: 'X/Y 独立素数序列，半球散射', needs2D: true },
    { id: 'skyline', name: 'Skyline 阶梯', en: 'Stepped / Skyline', desc: '开口井"天际线"剖面，双向散射', prime: true, needsN: true, anyN: false },
    { id: 'binary', name: 'Binary 振幅', en: 'Binary Amplitude', desc: '反射井 + 吸声井交替，扩散吸声一体', needsN: true, anyN: false },
    { id: 'wave', name: 'Wave 波纹', en: 'Ripple / Wave', desc: '光滑曲面，声学与美学兼顾', needsN: true, anyN: true },
    { id: 'fractal', name: 'Fractal 分形', en: 'Fractal / Self-similar', desc: '自相似多尺度，扩展有效带宽', prime: true, needsN: true, anyN: false }
  ];

  var PRIMES = [5, 7, 11, 13, 17, 19, 23, 29, 31];

  var API = {
    C: C_AIR,
    TYPES: TYPES,
    PRIMES: PRIMES,
    generate: generate,
    qrdSeq: qrdSeq,
    prdSeq: prdSeq,
    mlsSeq: mlsSeq,
    analyze: analyze,
    bandFit: bandFit,
    cutList: cutList
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Diffuser = API;
  }
})(typeof window !== 'undefined' ? window : this);
