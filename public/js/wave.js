/*
 * wave.js — 波动与乐音计算（#/wave）
 * 内核（UMD）：浏览器挂 window.Wave，Node 可 require。
 *
 * 覆盖：
 *   1) 声速：空气（含温湿度的一阶混合气体模型）、纯水（UNESCO/Marczak 多项式）、介质库
 *   2) 波长 ↔ 频率 ↔ 周期 ↔ 波数 ↔ 角频率
 *   3) 自由场声强 I = Q·P/(4πr²)、声强级、声压级与距离衰减（−6 dB/倍距）
 *   4) 特性声阻抗 Z = ρc 与平面界面反射 / 透射（垂直与斜入射、Snell、临界角）
 *   5) 比值 ↔ 分贝：功率比 10lg、场量比 20lg 及反算
 *   6) 乐音：十二平均律（A4 = 440 Hz）频率 ↔ 音名 ↔ 音分、音程与拍频
 *   7) 管共振：开管 fₙ = n·c/(2L)（含全部谐波）、闭管 fₙ = (2n−1)·c/(4L)（仅奇次）
 *   8) 弦共振：fₙ = n/(2L)·√(T/μ)，μ 可由直径与材料密度换算
 *   9) 多普勒效应：f′ = f·(c ± v_o)/(c ∓ v_s)
 *
 * 参考基准：p₀ = 20 µPa、I₀ = 10⁻¹² W/m²、W₀ = 10⁻¹² W
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Wave = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R_GAS = 8.314462618;      // J/(mol·K)
  var P0 = 20e-6;               // Pa
  var I0 = 1e-12;               // W/m²
  var W0 = 1e-12;               // W
  var M_DRY = 0.028964;         // kg/mol 干空气
  var M_H2O = 0.018015;         // kg/mol 水蒸气
  var CP_DRY = 29.07;           // J/(mol·K) 干空气定压摩尔热容
  var CP_H2O = 33.60;           // J/(mol·K) 水蒸气定压摩尔热容

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ================= 1) 声速 ================= */

  /** Magnus 公式：水的饱和蒸气压 (Pa)，T 为 ℃ */
  function satVaporPressure(T) {
    return 610.94 * Math.exp(17.625 * T / (T + 243.04));
  }

  /**
   * 空气中声速。
   * 简化式：c = 331.4 + 0.6·T
   * 开方式：c = 331.3·√(1 + T/273.15)（= 20.05·√T_K）
   * 含湿式：按干空气/水蒸气混合物的 γ_mix 与 M_mix 计算
   *   M_mix = M_dry(1−x) + M_w·x，Cp_mix = Cp_dry(1−x) + Cp_w·x，γ = Cp/(Cp−R)
   *   c = √(γ·R·T_K / M_mix)，x 为水蒸气摩尔分数
   */
  function soundSpeedAir(o) {
    o = o || {};
    var T = num(o.temp, 20);
    var rh = clamp(num(o.rh, 0), 0, 100) / 100;
    var p = num(o.pressure, 101325);
    var TK = T + 273.15;
    var psat = satVaporPressure(T);
    var x = clamp(rh * psat / p, 0, 1);
    var M = M_DRY * (1 - x) + M_H2O * x;
    var Cp = CP_DRY * (1 - x) + CP_H2O * x;
    var gamma = Cp / (Cp - R_GAS);
    var cMix = Math.sqrt(gamma * R_GAS * TK / M);
    return {
      temp: T, rh: rh * 100, pressure: p,
      moleFraction: x, gamma: gamma, molarMass: M,
      simple: 331.4 + 0.6 * T,
      sqrt: 331.3 * Math.sqrt(TK / 273.15),
      c: cMix,
      density: p * M / (R_GAS * TK)     // 理想气体密度 kg/m³
    };
  }

  /** 纯水中声速（UNESCO / Marczak 多项式，0~40 ℃） */
  function soundSpeedWater(T) {
    var t = num(T, 20);
    return 1402.388 + 5.03830 * t - 5.8112e-2 * t * t +
      3.3436e-4 * Math.pow(t, 3) - 1.47797e-6 * Math.pow(t, 4) + 3.1419e-9 * Math.pow(t, 5);
  }

  /** 常用介质（密度 kg/m³、纵波声速 m/s） */
  var MEDIA = [
    { id: 'air20', name: '空气（20 ℃，1 atm）', rho: 1.204, c: 343 },
    { id: 'air0', name: '空气（0 ℃，1 atm）', rho: 1.293, c: 331.5 },
    { id: 'helium', name: '氦气（0 ℃）', rho: 0.1785, c: 972 },
    { id: 'hydrogen', name: '氢气（0 ℃）', rho: 0.0899, c: 1284 },
    { id: 'co2', name: '二氧化碳（0 ℃）', rho: 1.977, c: 258 },
    { id: 'water', name: '纯水（20 ℃）', rho: 998, c: 1482 },
    { id: 'seawater', name: '海水（20 ℃）', rho: 1025, c: 1520 },
    { id: 'ice', name: '冰', rho: 917, c: 3200 },
    { id: 'soft', name: '人体软组织（超声用）', rho: 1060, c: 1540 },
    { id: 'fat', name: '脂肪（超声用）', rho: 950, c: 1450 },
    { id: 'oil', name: '变压器油', rho: 880, c: 1400 },
    { id: 'wood', name: '木材（顺纹，松）', rho: 600, c: 3500 },
    { id: 'concrete', name: '混凝土', rho: 2300, c: 3400 },
    { id: 'glass', name: '玻璃（普通）', rho: 2500, c: 5300 },
    { id: 'aluminum', name: '铝', rho: 2700, c: 6320 },
    { id: 'copper', name: '铜', rho: 8960, c: 4760 },
    { id: 'steel', name: '钢', rho: 7850, c: 5940 },
    { id: 'lead', name: '铅', rho: 11340, c: 2160 }
  ];
  function media(id) {
    for (var i = 0; i < MEDIA.length; i++) if (MEDIA[i].id === id) return MEDIA[i];
    return null;
  }

  /* ================= 2) 波长 / 频率 / 周期 / 波数 ================= */
  function wavelength(o) {
    var f = num(o.f, 0), c = num(o.c, 343);
    if (f <= 0 || c <= 0) return null;
    var lam = c / f;
    return {
      f: f, c: c, lambda: lam,
      period: 1 / f,
      wavenumber: 2 * Math.PI / lam,
      omega: 2 * Math.PI * f,
      // 工程速查：λ/2、λ/4（房间模态与吸声结构常用）
      half: lam / 2, quarter: lam / 4
    };
  }
  function freqFromWavelength(o) {
    var lam = num(o.lambda, 0), c = num(o.c, 343);
    if (lam <= 0 || c <= 0) return null;
    return { lambda: lam, c: c, f: c / lam, period: lam / c, wavenumber: 2 * Math.PI / lam };
  }

  /* ================= 3) 自由场声强与平方反比 ================= */
  /**
   * I = Q·P/(4πr²)；LI = 10lg(I/I₀)；Lp ≈ LI（平面行波近似）
   * 由声功率级反算：Lp = Lw + 10lg(Q/(4πr²))
   */
  function freeField(o) {
    var P = num(o.power, 0), r = num(o.r, 0), Q = num(o.Q, 1);
    if (P <= 0 || r <= 0 || Q <= 0) return null;
    var I = Q * P / (4 * Math.PI * r * r);
    var LI = 10 * Math.log10(I / I0);
    var LW = 10 * Math.log10(P / W0);
    var Lp = LW + 10 * Math.log10(Q / (4 * Math.PI * r * r));
    return {
      power: P, r: r, Q: Q,
      intensity: I,
      intensityLevel: LI,
      powerLevel: LW,
      spl: Lp,
      rhoC: num(o.rhoC, 410),
      // 平面行波近似下的声压：p = √(I·ρc)
      pressure: Math.sqrt(I * num(o.rhoC, 410))
    };
  }
  /** 距离序列：验证每倍距离 −6 dB */
  function decayCurve(o) {
    var P = num(o.power, 1e-6), r0 = num(o.rFrom, 1), r1 = num(o.rTo, 100);
    var Q = num(o.Q, 1), n = Math.max(2, Math.round(num(o.n, 50)));
    if (r0 <= 0) r0 = 1;
    if (r1 <= r0) r1 = r0 * 10;
    var xs = [], dbs = [], ints = [];
    for (var i = 0; i <= n; i++) {
      var r = r0 * Math.pow(r1 / r0, i / n);
      var f = freeField({ power: P, r: r, Q: Q });
      xs.push(r); dbs.push(f ? f.spl : null); ints.push(f ? f.intensity : null);
    }
    return { r: xs, spl: dbs, intensity: ints };
  }

  /* ================= 4) 特性声阻抗与界面 ================= */
  function characteristicImpedance(o) {
    var rho = num(o.rho, 0), c = num(o.c, 0);
    if (rho <= 0 || c <= 0) return null;
    return { rho: rho, c: c, Z: rho * c };
  }
  /**
   * 平面波由介质 1 入射到介质 2（法向声阻抗率）。
   * 垂直入射：Rp = (Z₂ − Z₁)/(Z₂ + Z₁)，R_I = |Rp|²，τ = 1 − R_I
   * 斜入射：Z_n = Z/cosθ，θ₂ 由 Snell 定律 sinθ₂ = (c₂/c₁)·sinθ₁
   */
  function interface_(o) {
    var Z1 = num(o.Z1, 0), Z2 = num(o.Z2, 0);
    var c1 = num(o.c1, 0), c2 = num(o.c2, 0);
    var th1 = num(o.theta, 0);                     // deg，相对法线
    if (Z1 <= 0 || Z2 <= 0) return null;
    var oblique = !!(c1 > 0 && c2 > 0 && Math.abs(th1) > 1e-9);
    var theta2 = null, critical = null, total = false;
    var Zn1 = Z1, Zn2 = Z2;
    if (oblique) {
      var s2 = (c2 / c1) * Math.sin(th1 * Math.PI / 180);
      if (s2 > 1) {                                 // 全反射
        total = true;
        critical = Math.asin(Math.min(1, c1 / c2)) * 180 / Math.PI;
        theta2 = 90;
      } else {
        theta2 = Math.asin(s2) * 180 / Math.PI;
        critical = (c2 > c1) ? Math.asin(c1 / c2) * 180 / Math.PI : null;
      }
      Zn1 = Z1 / Math.cos(th1 * Math.PI / 180);
      Zn2 = total ? Infinity : Z2 / Math.cos(theta2 * Math.PI / 180);
    }
    var Rp, Tp, RI, tau;
    if (total) { Rp = 1; Tp = 0; RI = 1; tau = 0; }
    else {
      Rp = (Zn2 - Zn1) / (Zn2 + Zn1);
      Tp = 2 * Zn2 / (Zn1 + Zn2);
      RI = Rp * Rp;
      tau = 1 - RI;                                 // 声强透射系数
    }
    return {
      Z1: Z1, Z2: Z2, c1: c1, c2: c2, theta: th1, theta2: theta2,
      oblique: oblique, total: total, critical: critical,
      Rp: Rp, Tp: Tp,
      reflection: RI,
      transmission: tau,
      reflectionLoss: RI > 0 ? -10 * Math.log10(RI) : Infinity,
      transmissionLoss: tau > 0 ? -10 * Math.log10(tau) : Infinity,
      mismatch: Math.abs(Z2 / Z1)                   // 阻抗失配比
    };
  }

  /* ================= 5) 比值 ↔ 分贝 ================= */
  /** mode: 'power' 10lg | 'field' 20lg；正向 ratio → dB */
  function ratioToDb(o) {
    var r = num(o.ratio, 0), mode = String(o.mode || 'power').toLowerCase();
    if (r <= 0) return null;
    var k = mode === 'field' ? 20 : 10;
    return { ratio: r, mode: mode, db: k * Math.log10(r) };
  }
  /** 反算 dB → 比值 */
  function dbToRatio(o) {
    var db = num(o.db, 0), mode = String(o.mode || 'power').toLowerCase();
    var k = mode === 'field' ? 20 : 10;
    return { db: db, mode: mode, ratio: Math.pow(10, db / k) };
  }
  /** 常用对照表 */
  function ratioTable(mode) {
    var k = String(mode || 'power').toLowerCase() === 'field' ? 20 : 10;
    var rs = [1, 1.25, 1.6, 2, 2.5, 3.16, 4, 5, 10, 20, 100, 1000];
    return rs.map(function (r) { return { ratio: r, db: k * Math.log10(r) }; });
  }

  /* ================= 6) 乐音：十二平均律 ================= */
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var A4 = 440;

  /** 频率 → 最近音名、MIDI 号、音分偏差 */
  function freqToNote(f, ref) {
    var a = num(ref, A4);
    f = num(f, 0);
    if (!(f > 0) || !(a > 0)) return null;
    var m = 69 + 12 * Math.log2(f / a);            // 相对 A4 的连续 MIDI 值
    var midi = Math.round(m);
    var cents = (m - midi) * 100;
    return {
      freq: f, ref: a,
      midi: midi,
      name: NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1),
      cents: cents,
      octave: Math.floor(midi / 12) - 1,
      exactFreq: a * Math.pow(2, (midi - 69) / 12)
    };
  }
  /** 音名 → 频率（如 "A4"、"C#4"、"Bb3"） */
  function noteToFreq(name, ref) {
    var a = num(ref, A4);
    var s = String(name || '').trim();
    var m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s);
    if (!m) return null;
    var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    if (base == null) return null;
    var acc = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
    var oct = parseInt(m[3], 10);
    var midi = (oct + 1) * 12 + base + acc;
    return {
      name: NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1),
      midi: midi, ref: a,
      freq: a * Math.pow(2, (midi - 69) / 12)
    };
  }
  /** 两音关系：音程（半音）、音分差、拍频与粗糙/融合感判定 */
  function interval(f1, f2) {
    f1 = num(f1, 0); f2 = num(f2, 0);
    if (!(f1 > 0) || !(f2 > 0)) return null;
    var semis = 12 * Math.log2(f2 / f1);
    var beat = Math.abs(f2 - f1);
    var cents = 1200 * Math.log2(f2 / f1);
    var rough;
    if (beat < 0.5) rough = '几乎同音，缓慢起伏（<0.5 Hz）';
    else if (beat < 20) rough = '拍音区（0.5~20 Hz）：可听到明显抖动/粗糙感';
    else if (beat < 300) rough = '粗糙—融合过渡区（20~300 Hz）';
    else rough = '已分离为两个音高（>300 Hz）';
    return {
      f1: f1, f2: f2, semitones: semis, cents: cents, beat: beat,
      nearest: Math.round(semis),
      note: rough
    };
  }

  /* ================= 7) 管与弦共振 ================= */
  /**
   * 管共振：开管（两端开口）fₙ = n·c/(2L_eff)，L_eff = L + 2·0.6r；
   *         闭管（一端闭）  fₙ = (2n−1)·c/(4L_eff)，L_eff = L + 0.6r，仅奇次谐波
   */
  function pipeResonance(o) {
    var c = num(o.c, 343), L = num(o.L, 0), d = num(o.diameter, 0);
    var kind = String(o.kind || 'open').toLowerCase();
    var n = Math.max(1, Math.round(num(o.n, 8)));
    if (c <= 0 || L <= 0) return null;
    var r = Math.max(0, d) / 2;
    var ends = kind === 'closed' ? 1 : 2;
    var Leff = L + ends * 0.6 * r;
    var f1 = kind === 'closed' ? c / (4 * Leff) : c / (2 * Leff);
    var harmonics = [];
    for (var i = 1; i <= n; i++) {
      var mult = kind === 'closed' ? (2 * i - 1) : i;
      harmonics.push({ n: i, order: mult, freq: mult * f1 });
    }
    return {
      kind: kind === 'closed' ? '闭管（一端闭口）' : '开管（两端开口）',
      c: c, L: L, diameter: d, radius: r,
      endCorrection: ends * 0.6 * r,
      Leff: Leff,
      f1: f1,
      onlyOdd: kind === 'closed',
      harmonics: harmonics
    };
  }
  /** 弦共振：fₙ = n/(2L)·√(T/μ)；μ 可由直径与材料密度求 μ = ρ·π(d/2)² */
  function stringResonance(o) {
    var L = num(o.L, 0), T = num(o.tension, 0);
    var mu = num(o.mu, 0);
    var rho = num(o.rho, 0), d = num(o.diameter, 0);
    var n = Math.max(1, Math.round(num(o.n, 8)));
    if (L <= 0 || T <= 0) return null;
    if (!(mu > 0) && rho > 0 && d > 0) mu = rho * Math.PI * Math.pow(d / 2, 2);
    if (!(mu > 0)) return null;
    var f1 = Math.sqrt(T / mu) / (2 * L);
    var harmonics = [];
    for (var i = 1; i <= n; i++) harmonics.push({ n: i, freq: i * f1 });
    return {
      L: L, tension: T, mu: mu, rho: rho, diameter: d,
      waveSpeed: Math.sqrt(T / mu),
      f1: f1,
      harmonics: harmonics
    };
  }

  /* ================= 8) 多普勒效应 ================= */
  /**
   * f′ = f·(c + v_o)/(c − v_s)
   *   v_o：观察者速度，向声源运动取正
   *   v_s：声源速度，向观察者运动取正
   */
  function doppler(o) {
    var c = num(o.c, 343), f = num(o.f, 0);
    var vs = num(o.vs, 0), vo = num(o.vo, 0);
    if (!(c > 0) || !(f > 0)) return null;
    var den = c - vs;
    if (den <= 0) {
      return { shock: true, mach: vs / c, f: f, c: c, vs: vs, vo: vo,
        note: '声源速度达到或超过声速（Ma ≥ 1），形成激波 / 音爆，多普勒公式不再适用' };
    }
    var fo = f * (c + vo) / den;
    return {
      f: f, c: c, vs: vs, vo: vo,
      observed: fo,
      shift: fo - f,
      percent: (fo / f - 1) * 100,
      mach: vs / c,
      wavelengthFront: (c - vs) / f,     // 声源前方波长被压缩
      wavelengthBack: (c + vs) / f,
      shock: false,
      note: (vs / c) >= 0.8 ? '声源接近声速（Ma ≥ 0.8），非线性效应明显，结果仅作定性参考' : ''
    };
  }

  return {
    R_GAS: R_GAS, P0: P0, I0: I0, W0: W0, A4: A4,
    NOTE_NAMES: NOTE_NAMES, MEDIA: MEDIA, media: media,
    num: num, clamp: clamp,
    satVaporPressure: satVaporPressure,
    soundSpeedAir: soundSpeedAir,
    soundSpeedWater: soundSpeedWater,
    wavelength: wavelength,
    freqFromWavelength: freqFromWavelength,
    freeField: freeField,
    decayCurve: decayCurve,
    characteristicImpedance: characteristicImpedance,
    interface: interface_,
    ratioToDb: ratioToDb,
    dbToRatio: dbToRatio,
    ratioTable: ratioTable,
    freqToNote: freqToNote,
    noteToFreq: noteToFreq,
    interval: interval,
    pipeResonance: pipeResonance,
    stringResonance: stringResonance,
    doppler: doppler
  };
});
