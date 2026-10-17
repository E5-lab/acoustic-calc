/*
 * sim-ut.js — 超声脉冲回波法测厚与探伤（A 扫描）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimUt，Node 下 module.exports。
 *
 * ---------------------------------------------------------------------------
 * 物理模型
 *
 * 1) 基本量
 *    波长            λ = c / f
 *    测厚（脉冲回波）  d = c·t / 2         （t 为往返时间）
 *    轴向分辨率        d_min = c·τ / 2     （τ 为脉冲持续时间，默认 τ = 2/f，故 d_min = λ）
 *    近场长度（圆晶片）N = D² / (4λ) = D²f / (4c)
 *    半扩散角（−6 dB） θ = arcsin(1.22λ / D)；1.22λ/D > 1 时无解（声束全扩散）
 *
 * 2) 回波幅度（简化模型，只含材料衰减与球面扩展两项）
 *      A_echo(dB) = −2·α·d − 20·log10(2d / 1 mm)
 *    第一项为往返声程 2d 上的材料衰减（α 单位 dB/mm，声程单位 mm）；
 *    第二项为往返声程 2d（mm）相对 1 mm 的球面扩展损失（声压 ∝ 1/r，故 20log10）。
 *    缺陷波在此基础上再乘当量反射体系数 refl（0~1，1 表示大平面缺陷）：
 *      A_defect = refl · 10^(A_echo(d_f)/20)
 *    缺陷定位：d_f = c·t_f / 2（t_f 为缺陷回波往返时间）。
 *
 * 3) −6 dB 法测缺陷当量尺寸（简化）
 *    探头沿缺陷横移，回波幅度按高斯型包络变化：
 *      A(x) = A_max · exp(−4·ln2·(x/w)²)          w = FWHM（半高全宽）= 当量尺寸
 *    A(±w/2) = 0.5 → 即 −6 dB 边界；两侧 −6 dB 点间距 |x₂ − x₁| = w 即当量尺寸。
 *
 * 4) A 扫描波形
 *    波形 = 始波(t=0) + 缺陷波(t_f = 2d_f/c) + 底波(t_b = 2d/c)，每个回波为
 *    带高斯包络的余弦脉冲：
 *      pulse(t) = A · exp(−((t−t₀)/σ)²) · cos(2πf(t−t₀))，σ = 1/f
 *    可选叠加电噪声（按 SNR dB 给定，噪声 RMS = 10^(−SNR/20)，相对始波幅度 1）。
 *
 * ⚠ 简化说明：本内核为纯几何 + 衰减的教学演示模型，**未含** 界面透射损失、波形转换、
 *   缺陷指向性、仪器增益与 DAC/TCG 标定、声束截面声压分布等因素，仅供教学演示，
 *   不可用于实际探伤工艺评定。
 *
 * ---------------------------------------------------------------------------
 * 单位约定（重要）
 *
 *   低层函数（wavelength / thickness / axialRes）：SI —— 频率 Hz、声速 m/s、返回 m
 *   中 层 函数（nearField / beamSpread / echoDb / defectEnvelope）：
 *        入参长度 mm（nearField 返回 mm）、beamSpread 返回弧度、echoDb 返回 dB
 *   simulate / ascan 入口：UI 单位 —— 频率 MHz、长度 mm、时间 µs
 *        （fMHz 优先；也接受 f：≥1e5 视为 Hz，否则视为 MHz）
 */
(function (global) {
  'use strict';

  /* 材料声速表（纵波 m/s）+ 5 MHz 量级典型衰减系数 α（dB/mm） */
  var MATERIALS = [
    { id: 'steel',    name: '钢',       c: 5920, alpha: 0.01  },
    { id: 'aluminum', name: '铝',       c: 6320, alpha: 0.005 },
    { id: 'copper',   name: '铜',       c: 4700, alpha: 0.01  },
    { id: 'castiron', name: '铸铁',     c: 4600, alpha: 0.06  },
    { id: 'pmma',     name: '有机玻璃', c: 2730, alpha: 0.10  },
    { id: 'water',    name: '水',       c: 1480, alpha: 0.002 },
    { id: 'concrete', name: '混凝土',   c: 4000, alpha: 0.10  },
    { id: 'titanium', name: '钛',       c: 6070, alpha: 0.01  }
  ];

  var SHEAR_RATIO = 0.55;   // 横波声速 ≈ 0.55 × 纵波声速（仅作提示，不参与计算）
  var M_DEFAULT = 1024;     // A 扫描默认采样点数
  var WIN_PAD = 1.2;        // 时间窗 = 1.2 × 底波到达时间（覆盖底波后再留 20%）
  var NOISE_SEED = 20240917;// 噪声种子（固定 → 同参数结果可复现）

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function log10(x) { return Math.log(x) / Math.LN10; }

  /* ------------------------- 材料表 ------------------------- */

  // 按 id 取材料（无匹配返回 null）
  function material(id) {
    for (var i = 0; i < MATERIALS.length; i++) {
      if (MATERIALS[i].id === id) return MATERIALS[i];
    }
    return null;
  }

  // 横波声速提示值：c_s ≈ 0.55·c_l
  function shearSpeed(c) {
    if (!(c > 0)) return null;
    return SHEAR_RATIO * c;
  }

  /* ------------------------- 核心公式 ------------------------- */

  // 波长 λ = c/f（f Hz、c m/s），返回 m；无效输入返回 null
  function wavelength(f, c) {
    if (!(f > 0) || !(c > 0)) return null;
    return c / f;
  }

  // 脉冲回波测厚 d = c·t/2（t s、c m/s），返回 m；无效输入返回 null
  function thickness(t, c) {
    if (!(t > 0) || !(c > 0)) return null;
    return c * t / 2;
  }

  // 轴向分辨率 d_min = c·τ/2（τ 为脉冲持续时间 s，默认 τ = 2/f → d_min = λ），返回 m
  function axialRes(f, c, tau) {
    if (!(f > 0) || !(c > 0)) return null;
    if (!(tau > 0)) tau = 2 / f;
    return c * tau / 2;
  }

  // 近场长度 N = D²/(4λ) = D²f/(4c)（D 单位 mm），返回 mm；无效输入返回 null
  function nearField(D, f, c) {
    if (!(D > 0) || !(f > 0) || !(c > 0)) return null;
    var lambdaMm = (c / f) * 1000;   // λ：m → mm
    return (D * D) / (4 * lambdaMm);
  }

  // 半扩散角 θ = arcsin(1.22λ/D)（D 单位 mm），返回弧度；1.22λ/D > 1 时无解返回 null
  function beamSpread(D, f, c) {
    if (!(D > 0) || !(f > 0) || !(c > 0)) return null;
    var lambdaMm = (c / f) * 1000;
    var s = 1.22 * lambdaMm / D;
    if (s > 1) return null;   // 全扩散，−6 dB 边界不存在
    return Math.asin(s);
  }

  // 回波幅度（相对始波，dB）= −2αd − 20log10(2d/1mm)；d 单位 mm，α 单位 dB/mm
  function echoDb(dMm, alpha) {
    if (!(dMm > 0)) return null;
    if (alpha == null) alpha = 0;
    if (alpha < 0) alpha = 0;
    return -(2 * alpha * dMm) - 20 * log10(2 * dMm);
  }

  // 缺陷横移回波包络 A(x) = exp(−4ln2·(x/w)²)（x、w 单位 mm），x=0 峰值 1
  function defectEnvelope(xMm, wMm) {
    if (!(wMm > 0)) return null;
    var u = xMm / wMm;
    return Math.exp(-4 * Math.LN2 * u * u);
  }

  // −6 dB 半宽：自峰值移动到幅度降为一半（−6 dB）处的距离 = w/2（mm）
  function halfWidth6db(wMm) {
    if (!(wMm > 0)) return null;
    return wMm / 2;
  }

  // −6 dB 法当量尺寸：两侧 −6 dB 点间距 |x₂ − x₁|（mm）
  function equivalentSize(x1Mm, x2Mm) {
    var x1 = num(x1Mm), x2 = num(x2Mm);
    if (x1 == null || x2 == null) return null;
    return Math.abs(x2 - x1);
  }

  /* --------------------- A 扫描波形生成 --------------------- */

  // 确定性 LCG（保证同参数波形可复现）
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Box–Muller 标准正态
  function gauss(next) {
    var u1 = next(), u2 = next();
    if (u1 < 1e-12) u1 = 1e-12;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // 带高斯包络的余弦脉冲：A·exp(−((t−t₀)/σ)²)·cos(2πf(t−t₀))
  // t、t₀、σ 单位 µs，f 单位 Hz
  function pulse(t, t0, amp, fHz, sigmaUs) {
    var x = (t - t0) / sigmaUs;
    return amp * Math.exp(-x * x) * Math.cos(2 * Math.PI * fHz * (t - t0) * 1e-6);
  }

  /*
   * A 扫描波形生成
   * 入参：{ c, fMHz|f, dMm, defectMm, alpha, snr, refl, M, TWinUs }
   * 返回：{ ok, M, TWinUs, dtUs, sigmaUs, tUs[], depthMm[], y[], yNorm[], yDb[],
   *         maxAbs, initial{tUs,depthMm,amp,db}, defect{...}|null, back{...} }
   */
  function ascan(o) {
    o = o || {};
    var c = num(o.c);
    var fMHz = num(o.fMHz);
    if (fMHz == null) {
      var fRaw = num(o.f);
      fMHz = fRaw == null ? null : (fRaw >= 1e5 ? fRaw / 1e6 : fRaw);
    }
    var dMm = num(o.dMm);
    var alpha = num(o.alpha);
    var refl = num(o.refl);
    var snr = num(o.snr);
    var M = num(o.M);
    var TWinUs = num(o.TWinUs);
    var defectMm = num(o.defectMm);
    var sigmaFix = num(o.sigmaUs);

    if (!(c > 0) || !(fMHz > 0) || !(dMm > 0)) {
      return { ok: false, error: '声速 c、频率 f、工件厚度 d 均须为正数' };
    }
    if (alpha == null) alpha = 0;
    if (refl == null) refl = 1;
    if (!(M > 8)) M = M_DEFAULT;
    M = Math.round(M);

    var fHz = fMHz * 1e6;
    var sigmaUs = sigmaFix != null && sigmaFix > 0 ? sigmaFix : 1e6 / fHz; // σ = 1/f（秒）→ µs
    var tb = (2 * dMm / 1000) / c * 1e6;   // 底波到达时间 µs
    if (!(TWinUs > tb * WIN_PAD * 0.999)) TWinUs = tb * WIN_PAD;
    var dt = TWinUs / (M - 1);

    // 底波与缺陷波幅度（线性，相对始波幅度 1）
    var Ab = Math.pow(10, echoDb(dMm, alpha) / 20);
    var tf = null, Af = 0;
    var hasDefect = defectMm != null && defectMm > 0 && defectMm < dMm;
    if (hasDefect) {
      tf = (2 * defectMm / 1000) / c * 1e6;
      Af = refl * Math.pow(10, echoDb(defectMm, alpha) / 20);
    }

    var next = (snr != null && snr > 0) ? rng(NOISE_SEED) : null;
    var nSigma = next ? Math.pow(10, -snr / 20) : 0;

    var tUs = new Array(M), depthMm = new Array(M), y = new Array(M);
    var yNorm = new Array(M), yDb = new Array(M);
    var maxAbs = 0, i, v, a;
    for (i = 0; i < M; i++) {
      var t = i * dt;
      v = pulse(t, 0, 1, fHz, sigmaUs);
      if (hasDefect) v += pulse(t, tf, Af, fHz, sigmaUs);
      v += pulse(t, tb, Ab, fHz, sigmaUs);
      if (next) v += nSigma * gauss(next);
      a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
      tUs[i] = t;
      depthMm[i] = (t * 1e-6 * c / 2) * 1000;   // 深度 mm = c·t/2
      y[i] = v;
    }
    for (i = 0; i < M; i++) {
      yNorm[i] = maxAbs > 0 ? y[i] / maxAbs : 0;
      a = Math.abs(y[i]);
      yDb[i] = a > 0 ? Math.max(-120, 20 * log10(a)) : -120;
    }

    return {
      ok: true,
      c: c, fMHz: fMHz, f: fHz, dMm: dMm, alpha: alpha, refl: refl, snr: snr,
      M: M, TWinUs: TWinUs, dtUs: dt, sigmaUs: sigmaUs, maxAbs: maxAbs,
      tUs: tUs, depthMm: depthMm, y: y, yNorm: yNorm, yDb: yDb,
      initial: { tUs: 0, depthMm: 0, amp: 1, db: 0 },
      defect: hasDefect
        ? { tUs: tf, depthMm: defectMm, amp: Af, db: 20 * log10(Af) }
        : null,
      back: { tUs: tb, depthMm: dMm, amp: Ab, db: echoDb(dMm, alpha) }
    };
  }

  /* ------------------------- 主入口 ------------------------- */
  /*
   * simulate(opts)
   * 入参：{ material|materialId, c, fMHz|f, DMm, dMm, defectMm, alpha, snr, refl, wMm, M }
   *       material 缺省取材料表首项（钢）；fMHz 缺省 5 MHz；D 缺省 10 mm；d 缺省 50 mm；
   *       α 缺省取材料表值；snr 缺省 null（无噪声）；refl 缺省 1；wMm 缺省 6 mm。
   * 返回：{ ok, ...几何量/幅度/时间..., ascan{...}, warnings[], notes[] }
   */
  function simulate(o) {
    o = o || {};
    var matId = o.material != null ? o.material : (o.materialId != null ? o.materialId : null);
    var mat = matId ? material(matId) : null;
    if (matId && !mat) return { ok: false, error: '未知材料 id：' + matId };

    var c = num(o.c);
    if (c == null) c = mat ? mat.c : MATERIALS[0].c;
    var fMHz = num(o.fMHz);
    if (fMHz == null) {
      var fRaw = num(o.f);
      fMHz = fRaw == null ? 5 : (fRaw >= 1e5 ? fRaw / 1e6 : fRaw);
    }
    var DMm = num(o.DMm);   if (DMm == null) DMm = 10;
    var dMm = num(o.dMm);   if (dMm == null) dMm = 50;
    var alpha = num(o.alpha);
    if (alpha == null) alpha = mat ? mat.alpha : MATERIALS[0].alpha;
    var snr = num(o.snr);
    var refl = num(o.refl); if (refl == null) refl = 1;
    var wMm = num(o.wMm);   if (wMm == null) wMm = 6;
    var M = num(o.M);
    var defectMm = num(o.defectMm);

    // 输入校验（区间与视图控件范围一致）
    if (!(c >= 1000 && c <= 12000)) return { ok: false, error: '声速 c 需在 1000–12000 m/s 之间' };
    if (!(fMHz >= 0.2 && fMHz <= 25)) return { ok: false, error: '频率 f 需在 0.2–25 MHz 之间' };
    if (!(DMm >= 1 && DMm <= 40)) return { ok: false, error: '晶片直径 D 需在 1–40 mm 之间' };
    if (!(dMm >= 0.5 && dMm <= 500)) return { ok: false, error: '工件厚度 d 需在 0.5–500 mm 之间' };
    if (!(alpha >= 0 && alpha <= 2)) return { ok: false, error: '衰减系数 α 需在 0–2 dB/mm 之间' };
    if (snr != null && !(snr >= 10 && snr <= 120)) return { ok: false, error: 'SNR 需在 10–120 dB 之间' };
    if (!(refl > 0 && refl <= 1)) return { ok: false, error: '反射系数 refl 需在 0–1 之间' };
    if (!(wMm >= 0.2 && wMm <= 50)) return { ok: false, error: '缺陷 FWHM w 需在 0.2–50 mm 之间' };

    var hasDefect = defectMm != null && defectMm > 0 && defectMm < dMm;

    // 几何量
    var lambda = wavelength(fMHz * 1e6, c);       // m
    var lambdaMm = lambda * 1000;
    var NMm = nearField(DMm, fMHz * 1e6, c);      // mm
    var theta = beamSpread(DMm, fMHz * 1e6, c);   // rad | null
    var axialMm = axialRes(fMHz * 1e6, c) * 1000; // mm
    var tb = (2 * dMm / 1000) / c * 1e6;          // 底波到达时间 µs
    var tf = hasDefect ? (2 * defectMm / 1000) / c * 1e6 : null;

    // 幅度（dB，相对始波）
    var backDb = echoDb(dMm, alpha);
    var defectDb = hasDefect ? echoDb(defectMm, alpha) + 20 * log10(refl) : null;

    var sc = ascan({
      c: c, fMHz: fMHz, dMm: dMm, defectMm: hasDefect ? defectMm : null,
      alpha: alpha, snr: snr, refl: refl, M: M
    });

    // 告警
    var warnings = [];
    if (defectMm != null && !hasDefect) {
      warnings.push('缺陷深度需在 0 与工件厚度之间（当前按「无缺陷」处理）');
    }
    if (theta == null) {
      warnings.push('半扩散角无解：1.22λ/D = ' + (1.22 * lambdaMm / DMm).toFixed(2) +
        ' > 1（λ = ' + lambdaMm.toFixed(3) + ' mm，D = ' + DMm + ' mm），声束近似全扩散，需加大晶片或降低频率');
    }
    if (dMm < NMm) {
      warnings.push('工件厚度 ' + dMm + ' mm < 近场长度 N = ' + NMm.toFixed(2) +
        ' mm：缺陷位于近场区内，声压起伏剧烈，−6 dB 法定量不可靠');
    }
    if (dMm < axialMm) {
      warnings.push('工件厚度 ' + dMm + ' mm < 轴向分辨率 ' + axialMm.toFixed(3) +
        ' mm：始波与底波重叠，无法分辨（需提高频率或缩短脉冲）');
    }
    if (backDb < -80) {
      warnings.push('底波幅度仅 ' + backDb.toFixed(1) + ' dB（低于 −80 dB）：材料衰减过大，需降低频率或提高仪器增益');
    }

    var notes = [
      '脉冲回波法：探头发射超声脉冲，在工件中往返，由往返时间 t 反算厚度 d = c·t/2（同一声速下声程为 2d）。',
      '轴向分辨率 d_min = c·τ/2（τ = 2/f 时 d_min = λ = ' + axialMm.toFixed(3) + ' mm）：厚度小于该值则始波与底波重叠、无法分辨。',
      '近场长度 N = D²/(4λ) = ' + NMm.toFixed(2) + ' mm：近场内声压起伏剧烈，缺陷定量困难，实际探伤尽量把缺陷区置于远场。',
      '回波幅度模型 A = −2αd − 20log10(2d)：仅含材料衰减与球面扩展两项，未含界面透射损失、缺陷指向性、仪器增益与 DAC/TCG 标定。',
      '横波声速约为纵波的 0.50–0.55 倍（本材料纵波 ' + c + ' m/s → 横波约 ' + shearSpeed(c).toFixed(0) +
      ' m/s）；本内核只算纵波直探头，未含波形转换（斜探头）效果。',
      '实际探伤还需：耦合补偿、表面粗糙度补偿、DAC/TCG 距离幅度校正、缺陷指向性与性质判定，本模型均为简化。'
    ];

    return {
      ok: true,
      material: mat ? mat.id : null,
      materialName: mat ? mat.name : '自定义',
      c: c, fMHz: fMHz, f: fMHz * 1e6,
      DMm: DMm, dMm: dMm,
      defectMm: hasDefect ? defectMm : null,
      wMm: hasDefect ? wMm : null,
      alpha: alpha, snr: snr, refl: refl,
      lambda: lambda, lambdaMm: lambdaMm,
      nearField: NMm / 1000, nearFieldMm: NMm,
      theta: theta, thetaDeg: theta == null ? null : theta * 180 / Math.PI,
      axialRes: axialMm / 1000, axialResMm: axialMm,
      tBackUs: tb, tDefectUs: tf,
      backDb: backDb, defectDb: defectDb,
      size6dbMm: hasDefect ? wMm : null,
      halfWidth6dbMm: hasDefect ? wMm / 2 : null,
      ascan: sc.ok ? sc : null,
      warnings: warnings,
      notes: notes
    };
  }

  var API = {
    MATERIALS: MATERIALS,
    SHEAR_RATIO: SHEAR_RATIO,
    M_DEFAULT: M_DEFAULT,
    WIN_PAD: WIN_PAD,
    material: material,
    shearSpeed: shearSpeed,
    wavelength: wavelength,
    thickness: thickness,
    axialRes: axialRes,
    nearField: nearField,
    beamSpread: beamSpread,
    echoDb: echoDb,
    defectEnvelope: defectEnvelope,
    halfWidth6db: halfWidth6db,
    equivalentSize: equivalentSize,
    ascan: ascan,
    simulate: simulate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimUt = API;
  }
})(typeof window !== 'undefined' ? window : this);
