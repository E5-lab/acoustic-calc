/*
 * calc-b3.js — 声明式计算器 · 心理与音乐声学（5 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 已实现的 route（nav.group = "心理与音乐声学"）：
 *   cents             音分↔频率（半音/音分数 → 频率比 2^(n/1200)；根音频率 → 目标频率）
 *   bark-erb          临界带 Bark / ERB（频率 f → 临界带号 z、临界带带宽、ERB 与 ERB 序号）
 *   chord             和弦/音程频率（根音频率 + 纯律音程/三和弦 → 各音频率）
 *   masking           临界带掩蔽阈值（掩蔽声频率/声压级 → 掩蔽阈值曲线关键点，近似模型）
 *   loudness-zwicker  Zwicker 响度（倍频带声压级 → 响度 sone 近似，简化 ISO 532B 思路）
 */
(function () {
  'use strict';

  // ---- 公共小工具（纯函数）----
  function barkOf(f) {
    // Zwicker & Terhardt 1980 解析式：临界带号 z (Bark)
    return 13 * Math.atan(0.00076 * f) + 3.5 * Math.atan((f / 7500) * (f / 7500));
  }
  function freqFromBark(z) {
    // barkOf 的数值反演（单调，二分法）
    var lo = 20, hi = 20000, mid, k;
    if (z <= 0) return 20;
    if (z >= 24.74) return 20000;
    for (k = 0; k < 60; k++) {
      mid = 0.5 * (lo + hi);
      if (barkOf(mid) < z) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }
  function criticalBandHz(f) {
    // Zwicker 1961：临界带带宽 (Hz)
    var x = f / 1000;
    return 25 + 75 * Math.pow(1 + 1.4 * x * x, 0.69);
  }
  function thresholdQuiet(f) {
    // Terhardt 1979 安静听阈 (dB SPL)
    var x = f / 1000;
    return 3.64 * Math.pow(x, -0.8) - 6.5 * Math.exp(-0.6 * (x - 3.3) * (x - 3.3)) + 0.001 * Math.pow(x, 4);
  }

  // ============================ 1) 音分 ↔ 频率 ============================
  CalcRegistry.register('cents', {
    title: '音分↔频率换算 · 声学计算工具箱',
    nav: {
      group: '心理与音乐声学',
      label: '音分↔频率',
      desc: '音分数 → 频率比；根音 → 目标频率',
      sub: ['r = 2^(n/1200)', 'f = f₀·r']
    },
    intro: '音分（cent）把八度（频率加倍）等分为 1200 份，是描述音程的对数标尺；十二平均律中一个半音 = 100 音分。',
    inputs: [
      { key: 'n', label: '音分数 n', unit: 'cent', def: 100, step: 10, min: -4800, max: 4800 },
      { key: 'f0', label: '参考（根音）频率 f₀', unit: 'Hz', def: 440, step: 1, min: 1 }
    ],
    outputs: [
      { key: 'ratio', label: '频率比 r', unit: '', digits: 6 },
      { key: 'f', label: '目标频率 f', unit: 'Hz', digits: 2 },
      { key: 'semi', label: '折合半音数', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var r = Math.pow(2, s.n / 1200);
      var f = s.f0 * r;
      return {
        ok: s.f0 > 0,
        values: { ratio: r, f: f, semi: s.n / 100 },
        formula: 'r = 2^(n/1200) = 2^(' + s.n + '/1200) = <span class="fx">' + r.toFixed(6) + '</span>\n' +
          'f = f₀·r = ' + s.f0 + ' × ' + r.toFixed(6) + ' = <span class="fx">' + f.toFixed(2) + ' Hz</span>',
        notes: [
          { level: 'info', text: '十二平均律：半音 = 100 音分（r = 2^(1/12) ≈ 1.059463），八度 = 1200 音分（频率加倍）。' },
          { level: 'info', text: '纯律参考：纯五度 ≈ 701.96 音分（3/2）、大三度 ≈ 386.31 音分（5/4）、小三度 ≈ 315.64 音分（6/5）；与平均律的 700/400/300 音分有可闻偏差。' },
          { level: 'warn', text: '音分是频率比的对数标尺，与声压级的分贝（20lg 或 10lg）概念不同，不可混用。' }
        ]
      };
    }
  });

  // ============================ 2) 临界带 Bark / ERB ============================
  CalcRegistry.register('bark-erb', {
    title: '临界带 Bark/ERB · 声学计算工具箱',
    nav: {
      group: '心理与音乐声学',
      label: '临界带 Bark/ERB',
      desc: '频率 → 临界带号与带宽',
      sub: ['z(Bark)', 'Δf (Hz)', 'ERB (Hz)']
    },
    intro: '人耳基底膜按临界带（Bark / ERB）分析频率；临界带号是非线性频率标尺，等响、掩蔽与响度模型都以其为横轴。',
    inputs: [
      { key: 'f', label: '频率 f', unit: 'Hz', def: 1000, step: 10, min: 20, max: 20000 }
    ],
    outputs: [
      { key: 'z', label: '临界带号 z', unit: 'Bark', digits: 3 },
      { key: 'cb', label: '临界带带宽 Δf', unit: 'Hz', digits: 1 },
      { key: 'erb', label: 'ERB 带宽', unit: 'Hz', digits: 1 },
      { key: 'erbn', label: 'ERB 序号', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var z = barkOf(s.f);
      var cb = criticalBandHz(s.f);
      var erb = 24.7 * (4.37 * s.f / 1000 + 1);
      var erbn = 21.4 * Math.log10(1 + 0.00437 * s.f);
      return {
        ok: s.f > 0,
        values: { z: z, cb: cb, erb: erb, erbn: erbn },
        formula: 'z = 13·atan(0.00076f) + 3.5·atan((f/7500)²) = <span class="fx">' + z.toFixed(3) + ' Bark</span>\n' +
          'Δf = 25 + 75·(1+1.4(f/1000)²)^0.69 = <span class="fx">' + cb.toFixed(1) + ' Hz</span>\n' +
          'ERB = 24.7·(4.37f/1000+1) = <span class="fx">' + erb.toFixed(1) + ' Hz</span>；' +
          'ERB 序号 = 21.4·lg(1+0.00437f) = <span class="fx">' + erbn.toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: 'z 用 Zwicker & Terhardt (1980) 解析式；临界带带宽用 Zwicker (1961) 经验式；ERB（等效矩形带宽）用 Glasberg & Moore (1990)。' },
          { level: 'info', text: '参考点：1 kHz ≈ 8.5 Bark、带宽约 160 Hz、ERB ≈ 133 Hz、ERB 序号 ≈ 15.6；20 Hz ≈ 1 Bark，15.5 kHz ≈ 24 Bark。' },
          { level: 'info', text: '临界带随频率升高而变宽（低频约 100 Hz、高频超过 3 kHz），但等宽 1 Bark 对应等长的基底膜行程。' }
        ]
      };
    }
  });

  // ============================ 3) 和弦 / 音程频率 ============================
  CalcRegistry.register('chord', {
    title: '和弦/音程频率 · 声学计算工具箱',
    nav: {
      group: '心理与音乐声学',
      label: '和弦/音程频率',
      desc: '根音 + 音程 → 各音频率',
      sub: ['纯律频率比', '三和弦 4:5:6 / 10:12:15']
    },
    intro: '按纯律（just intonation）频率比由根音推导音程或三和弦各音的频率，并可对照平均律音分差。',
    inputs: [
      { key: 'f0', label: '根音频率 f₀', unit: 'Hz', def: 261.63, step: 1, min: 1 },
      { key: 'kind', label: '音程 / 和弦', type: 'select', def: 'P5',
        options: [
          { value: 'P8', label: '纯八度（2/1）' },
          { value: 'P5', label: '纯五度（3/2）' },
          { value: 'P4', label: '纯四度（4/3）' },
          { value: 'M3', label: '大三度（5/4）' },
          { value: 'm3', label: '小三度（6/5）' },
          { value: 'M6', label: '大六度（5/3）' },
          { value: 'm2', label: '小二度（16/15）' },
          { value: 'triad-M', label: '大三和弦（4:5:6）' },
          { value: 'triad-m', label: '小三和弦（10:12:15）' }
        ] }
    ],
    outputs: [
      { key: 'f1', label: '第 1 音（根）', unit: 'Hz', digits: 2 },
      { key: 'f2', label: '第 2 音', unit: 'Hz', digits: 2 },
      { key: 'f3', label: '第 3 音', unit: 'Hz', digits: 2 },
      { key: 'ratio', label: '频率比（2/1 音）', unit: '', digits: 4 },
      { key: 'cents', label: '音分（2/1 音）', unit: 'cent', digits: 2 }
    ],
    compute: function (s) {
      var k = s.kind, r2, r3, label;
      if (k === 'triad-M') { r2 = 5 / 4; r3 = 3 / 2; label = '大三和弦 4:5:6'; }
      else if (k === 'triad-m') { r2 = 6 / 5; r3 = 3 / 2; label = '小三和弦 10:12:15'; }
      else {
        r3 = NaN;
        var T = { P8: 2, P5: 1.5, P4: 4 / 3, M3: 1.25, m3: 1.2, M6: 5 / 3, m2: 16 / 15 };
        r2 = T[k] || 1.5;
        label = '音程 ' + k;
      }
      var f1 = s.f0, f2 = s.f0 * r2, f3 = isNaN(r3) ? NaN : s.f0 * r3;
      var cents = 1200 * Math.log(r2) / Math.LN2;
      return {
        ok: s.f0 > 0,
        values: { f1: f1, f2: f2, f3: f3, ratio: r2, cents: cents },
        formula: label + '：r = <span class="fx">' + r2.toFixed(4) + '</span>' +
          (isNaN(r3) ? '' : '，第三音 r₃ = ' + r3.toFixed(4)) + '\n' +
          'f₂ = f₀·r = ' + s.f0.toFixed(2) + ' × ' + r2.toFixed(4) + ' = <span class="fx">' + f2.toFixed(2) + ' Hz</span>' +
          (isNaN(f3) ? '' : '；f₃ = <span class="fx">' + f3.toFixed(2) + ' Hz</span>') + '\n' +
          '音分 = 1200·log₂(r) = <span class="fx">' + cents.toFixed(2) + ' cent</span>',
        notes: [
          { level: 'info', text: '纯律音程由小整数比定义（五度 3:2、大三度 5:4、小三度 6:5），和弦整体谐波最吻合，但转调后音分关系改变。' },
          { level: 'info', text: '平均律对照：纯五度 701.96 vs 700 cent（差 +1.96）、大三度 386.31 vs 400 cent（差 −13.69）、小三度 315.64 vs 300 cent（差 +15.64）。' },
          { level: 'info', text: '大三和弦 4:5:6 与 10:12:15（小三）中根音—五度恒为 3:2；三和弦整体频率比保持简单整数，谐波重叠少、融合度好。' }
        ]
      };
    }
  });

  // ============================ 4) 临界带掩蔽阈值 ============================
  CalcRegistry.register('masking', {
    title: '临界带掩蔽阈值 · 声学计算工具箱',
    nav: {
      group: '心理与音乐声学',
      label: '临界带掩蔽阈值',
      desc: '掩蔽声 → 阈值曲线关键点',
      sub: ['上/下扩散', 'Bark 距离', '可闻性判定']
    },
    intro: '一个较强的掩蔽声会把邻近频率的听阈抬高（同时掩蔽）；在 Bark 标尺上用三角扩散函数近似阈值曲线，并判断探测声是否可闻。',
    inputs: [
      { key: 'fm', label: '掩蔽声频率 f_m', unit: 'Hz', def: 1000, step: 10, min: 20, max: 20000 },
      { key: 'Lm', label: '掩蔽声声压级 L_m', unit: 'dB', def: 70, step: 1, min: 0, max: 120 },
      { key: 'fp', label: '探测声频率 f_p', unit: 'Hz', def: 2000, step: 10, min: 20, max: 20000 },
      { key: 'Lp', label: '探测声声压级 L_p', unit: 'dB', def: 50, step: 1, min: 0, max: 120 }
    ],
    outputs: [
      { key: 'zm', label: '掩蔽声临界带号 z_m', unit: 'Bark', digits: 2 },
      { key: 'cbm', label: '掩蔽声临界带带宽', unit: 'Hz', digits: 1 },
      { key: 'Tm', label: '探测频率处掩蔽阈值 T_m', unit: 'dB', digits: 1 },
      { key: 'margin', label: '探测声可闻余量', unit: 'dB', digits: 1 },
      { key: 'fLo', label: '有效掩蔽频率下限', unit: 'Hz', digits: 0 },
      { key: 'fHi', label: '有效掩蔽频率上限', unit: 'Hz', digits: 0 }
    ],
    compute: function (s) {
      if (!(s.fm > 0) || !(s.fp > 0) || s.Lm < 0 || s.Lp < 0) {
        return { ok: false, error: '请输入有效的频率与声压级（频率 > 0，声压级 ≥ 0）', values: {} };
      }
      var zm = barkOf(s.fm);
      var cb = criticalBandHz(s.fm);
      // 扩散函数（Maiwald 1967 / MPEG 心理声学模型，dB 衰减；x = z_p − z_m 单位 Bark）
      function sf(x, L) {
        if (x < -1) { return 17 * x - 0.4 * L + 11; }          // 掩蔽声以下：陡降
        if (x < 0) { return (0.4 * L + 6) * x; }
        if (x < 1) { return -17 * x; }
        return (0.15 * L - 17) * x - 0.15 * L;                 // 掩蔽声以上：随级增大而变缓（上扩散）
      }
      function maskedThreshold(f) {
        var x = barkOf(f) - zm;
        return Math.max(thresholdQuiet(f), s.Lm + sf(x, s.Lm));
      }
      var Tm = maskedThreshold(s.fp);
      var margin = s.Lp - Tm;
      // 有效掩蔽频带：掩蔽阈高出安静听阈 3 dB 以上的频率范围（对数网格扫描）
      var fLo = NaN, fHi = NaN, k, f, d;
      for (k = 0; k <= 500; k++) {
        f = 20 * Math.pow(15500 / 20, k / 500);
        d = maskedThreshold(f) - thresholdQuiet(f);
        if (d >= 3) { if (isNaN(fLo)) fLo = f; fHi = f; }
      }
      return {
        ok: true,
        values: { zm: zm, cbm: cb, Tm: Tm, margin: margin, fLo: fLo, fHi: fHi },
        formula: 'z_m = <span class="fx">' + zm.toFixed(2) + ' Bark</span>，临界带带宽 <span class="fx">' + cb.toFixed(1) + ' Hz</span>\n' +
          'T_m(f_p) = max(安静听阈, L_m + S(Δz))，Δz = z(f_p) − z_m = ' + (barkOf(s.fp) - zm).toFixed(2) + ' Bark\n' +
          'T_m = <span class="fx">' + Tm.toFixed(1) + ' dB</span>；探测余量 L_p − T_m = <span class="fx">' + margin.toFixed(1) + ' dB</span>' +
          (margin > 0 ? '（可闻）' : '（被掩蔽）'),
        notes: [
          { level: 'info', text: '近似模型：Bark 标尺上的三角扩散函数（Maiwald 1967，MPEG 心理声学模型同源）+ Terhardt 1979 安静听阈。低频侧约 17~34 dB/Bark 陡降，高频侧随掩蔽级增大而变缓（上扩散掩蔽）。' },
          { level: 'info', text: '掩蔽不对称：低频掩蔽声对高频的影响远大于反向——1 kHz/70 dB 掩蔽声可影响 4 kHz 以上，而 4 kHz 掩蔽声几乎不影响 1 kHz。' },
          { level: 'warn', text: '仅为同时（频域）掩蔽近似，未含前/后掩蔽（时域，前掩蔽约 5~20 ms、后掩蔽约 50~200 ms）；窄带噪声掩蔽比纯音宽，实测离散度可达 ±10 dB。' },
          { level: 'info', text: '「有效掩蔽频率范围」定义为掩蔽阈高出安静听阈 3 dB 以上的频段；余量 > 0 表示探测声预测可闻。' }
        ]
      };
    }
  });

  // ============================ 5) Zwicker 响度（简化 ISO 532B） ============================
  CalcRegistry.register('loudness-zwicker', {
    title: 'Zwicker 响度 · 声学计算工具箱',
    nav: {
      group: '心理与音乐声学',
      label: 'Zwicker 响度',
      desc: '倍频带声压级 → 响度 sone',
      sub: ['ISO 532B 核心式', '比响度积分', 'sone / phon']
    },
    intro: '按简化 ISO 532B（Zwicker）思路：把各倍频带声压级映射到 Bark 轴，经扩散函数形成激励图样，用核心响度式积分得总响度（sone）。',
    inputs: [
      { key: 'L125', label: '125 Hz 倍频带声压级', unit: 'dB', def: 62, step: 1, min: 0, max: 120 },
      { key: 'L250', label: '250 Hz 倍频带声压级', unit: 'dB', def: 66, step: 1, min: 0, max: 120 },
      { key: 'L500', label: '500 Hz 倍频带声压级', unit: 'dB', def: 68, step: 1, min: 0, max: 120 },
      { key: 'L1000', label: '1 kHz 倍频带声压级', unit: 'dB', def: 70, step: 1, min: 0, max: 120 },
      { key: 'L2000', label: '2 kHz 倍频带声压级', unit: 'dB', def: 69, step: 1, min: 0, max: 120 },
      { key: 'L4000', label: '4 kHz 倍频带声压级', unit: 'dB', def: 64, step: 1, min: 0, max: 120 },
      { key: 'L8000', label: '8 kHz 倍频带声压级', unit: 'dB', def: 58, step: 1, min: 0, max: 120 }
    ],
    outputs: [
      { key: 'N', label: '总响度 N', unit: 'sone', digits: 2 },
      { key: 'LN', label: '响度级 L_N', unit: 'phon', digits: 1 },
      { key: 'Nmax', label: '峰值比响度 N′', unit: 'sone/Bark', digits: 3 },
      { key: 'zpeak', label: '峰值位置', unit: 'Bark', digits: 2 }
    ],
    compute: function (s) {
      var freqs = [125, 250, 500, 1000, 2000, 4000, 8000];
      var keys = ['L125', 'L250', 'L500', 'L1000', 'L2000', 'L4000', 'L8000'];
      var i, j, L, f, zc, x, att, E, eTQ, Np;
      // 1) Bark 网格上的激励图样（线性，参考 E₀）
      var step = 0.25, zmax = 24, n = Math.round(zmax / step);
      var exc = new Array(n);
      for (j = 0; j < n; j++) exc[j] = 0;
      for (i = 0; i < freqs.length; i++) {
        L = Number(s[keys[i]]);
        if (!isFinite(L) || L < 0) continue;
        f = freqs[i];
        zc = barkOf(f);
        var e0 = Math.pow(10, L / 10);
        // 扩散函数：掩蔽声以下 27 dB/Bark；以上随级变缓（上扩散，Johnston 式）
        var slopeUp = 24 + 0.23 / (f / 1000) - 0.2 * L;
        for (j = 0; j < n; j++) {
          x = (j + 0.5) * step - zc;
          if (x > 0) { att = -slopeUp * x; } else { att = 27 * x; }
          if (att < -80) att = -80;
          exc[j] += e0 * Math.pow(10, att / 10);
        }
      }
      // 2) 核心响度式逐点求比响度并积分（ISO 532B：N′ = 0.08·(E_TQ/E₀)^0.23·[(0.5+0.5E/E_TQ)^0.23 − 1]）
      var N = 0, Nmax = 0, zpeak = 0;
      for (j = 0; j < n; j++) {
        var zj = (j + 0.5) * step;
        var fj = freqFromBark(zj);
        eTQ = Math.pow(10, thresholdQuiet(fj) / 10);
        E = exc[j];
        var inner = 0.5 + 0.5 * E / eTQ;
        Np = 0.08 * Math.pow(eTQ, 0.23) * (Math.pow(inner, 0.23) - 1);
        if (Np < 0) Np = 0;               // 低于该频点听阈不计响度
        N += Np * step;
        if (Np > Nmax) { Nmax = Np; zpeak = zj; }
      }
      // 3) 响度级（sone → phon，ISO 532 分段式）
      var LN = N >= 1 ? 40 + 33.22 * Math.log10(N) : 40 * Math.pow(N + 0.0005, 0.35);
      return {
        ok: true,
        values: { N: N, LN: LN, Nmax: Nmax, zpeak: zpeak },
        formula: 'N = ∫₀²⁴ N′(z) dz，N′ = 0.08·(E_TQ/E₀)^0.23·[(0.5+0.5E/E_TQ)^0.23 − 1]\n' +
          '总响度 N = <span class="fx">' + N.toFixed(2) + ' sone</span>；' +
          '响度级 L_N = <span class="fx">' + LN.toFixed(1) + ' phon</span>\n' +
          '峰值比响度 <span class="fx">' + Nmax.toFixed(3) + ' sone/Bark</span> @ ' + zpeak.toFixed(2) + ' Bark',
        notes: [
          { level: 'info', text: '简化 ISO 532B：1/1 倍频程输入 + 简化扩散函数（低频侧 27 dB/Bark、高频侧随级变缓的上扩散）+ ISO 532B 核心响度式 + Terhardt 安静听阈；sone→phon 用 ISO 532 分段式（N≥1：40+33.22lgN；N<1：40·(N+0.0005)^0.35）。' },
          { level: 'info', text: '校验锚点：1 kHz 纯音 70 dB → ISO 532 全模型 N ≈ 8 sone / 70 phon，本简化模型给出约 6~8 sone（偏差 <15%，源于扩散函数简化）。' },
          { level: 'warn', text: '未做 ISO 532 的掩蔽扣除细节、低频（<250 Hz）精细处理与时变声音修正；时变信号请用 N5（5 百分位）另行评估。' },
          { level: 'info', text: '1 sone 定义为 1 kHz/40 dB 纯音的响度；响度每翻倍约对应 +10 phon。' }
        ]
      };
    }
  });
})();
