/*
 * vibration.js — 弹簧减振器（隔振器）隔振效率计算内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Vibration，Node 下 module.exports。
 *
 * 两种方法（工程上并行使用、互为校核）：
 *   方法一「静变形法 / 静态压缩量法」——从设备荷载与弹簧刚度出发：
 *     W = (G₁ + G₂)·K           运行重量（含安全系数）
 *     P = W / N                 每只减振器承载
 *     δ = P / k                 静态压缩量（mm）
 *     K_D = d·k                 动刚度（kg/cm）
 *     f₀ = 4.9823·√(K_D / P)   固有频率（Hz）≈ 15.756/√δ × √d
 *     z  = f / f₀               频率比（f = n/60 为扰动频率）
 *     T  = |1/(1−z²)|           力传递率（无阻尼简化式）
 *     η  = (1 − T)×100%         隔振效率
 *   方法二「频率比法（含阻尼传递率法）」——直接由 f、f₀ 与阻尼比 D 计算：
 *     T = √{[1 + (2Dz)²] / [(1 − z²)² + (2Dz)²]}
 *     阻尼比 D = 1/(2Q_m)，阻性元件 D 越大，共振区放大被抑制、但高频段效率略降。
 *
 * 另有：目标效率反算（→ 所需频率比 / 固有频率 / 静态压缩量 / 最大允许刚度）、
 *       效率–频率比–静变形对照表、传递率曲线数据、频率比与效率等级的判定。
 *
 * 判定依据：《噪声与振动控制工程技术导则》——不考虑阻尼时 T = |1/(1−(f/f₀)²)|；
 *   频率比宜取 2.5 ~ 4，禁止小于 1.4；回转设备系统阻尼比宜 0.05 ~ 0.12；
 *   固有频率 f₀ = 4.98·√(K_D/W)（K_D 动刚度 kg/cm，W 参振质量 kg），
 *   动、静刚度比（动态系数）d：钢弹簧取 1.0，橡胶取 1.5 ~ 2.3。
 *
 * 单位约定：重量 kg，刚度 kg/mm（可用 kg/cm、N/mm、kN/mm 输入，内部统一换为 kg/mm），
 *           压缩量 mm，频率 Hz，转速 r/min，效率 %。
 */
(function (global) {
  'use strict';

  var G_CM = 980.665;                              // 重力加速度 cm/s²
  var K_FREQ = Math.sqrt(G_CM) / (2 * Math.PI);    // ≈ 4.9823，f₀ = K_FREQ·√(K_D/W)
  var DEFLECT_COEF = K_FREQ * Math.sqrt(10);       // ≈ 15.7556，d = 1 时 f₀ = 15.756/√δ(mm)

  var SAFE_RATIO_MIN = 1.4;                        // 频率比下限（标准禁止小于该值）
  var REC_RATIO_MIN = 2.5;                         // 宜用区间下限
  var REC_RATIO_MAX = 4.0;                         // 宜用区间上限
  var MAX_DEFLECTION = 200;                        // 工程上可接受的静态压缩量上限（mm）
  var COMMON_DEFLECTION_MAX = 50;                  // 常见弹簧减振器的静态压缩量上限（mm）
  var MIN_DEFLECTION = 2;                          // 低于该值弹簧过刚，几乎无法隔振（mm）

  var STIFFNESS_UNITS = {
    'kg/mm': { factor: 1, label: 'kg/mm' },
    'kg/cm': { factor: 0.1, label: 'kg/cm' },
    'N/mm': { factor: 1 / 9.80665, label: 'N/mm' },
    'kN/mm': { factor: 1000 / 9.80665, label: 'kN/mm' }
  };

  var DYNAMIC_FACTORS = [
    { key: 'spring', label: '钢弹簧减振器（含阻尼弹簧）', value: 1.0, range: '1.0' },
    { key: 'rubber', label: '橡胶减振器 / 橡胶垫', value: 2.0, range: '1.5 ~ 2.3' },
    { key: 'cork', label: '软木、玻璃棉板等', value: 1.5, range: '1.3 ~ 1.8' }
  ];

  // 频率比判定（按导则 7.4.2.4 整理）
  var RATIO_GUIDE = [
    {
      from: 0, to: 1, level: 'danger', title: 'z < 1：共振放大区',
      note: '传递率大于 1，振动被放大，减振器不但无效反而有害，严禁采用。'
    },
    {
      from: 1, to: 1.4, level: 'danger', title: '1 ≤ z < 1.4：仍有放大',
      note: '标准禁止采用频率比小于 1.4 的方案，此区间部分频段传递率仍大于 1。'
    },
    {
      from: 1.4, to: 2.5, level: 'warn', title: '1.4 ≤ z < 2.5：有效果但不推荐',
      note: '已有隔振效果，但设备启停跨越共振区时振幅大、对冲击与扰动敏感，宜加大静态压缩量。'
    },
    {
      from: 2.5, to: 4, level: 'ok', title: '2.5 ≤ z ≤ 4：宜用区间',
      note: '导则推荐的频率比区间，隔振效率与设备稳定性综合最佳。'
    },
    {
      from: 4, to: Infinity, level: 'good', title: 'z > 4：效率很高',
      note: '效率通常在 93% 以上；注意静态压缩量过大带来的弹簧稳定性、设备晃动与管线连接问题。'
    }
  ];

  // 隔振效率等级
  var EFFICIENCY_GRADES = [
    { min: 95, level: 'good', label: '优', note: '高要求场所（录音室、精密仪器、住宅楼上设备、医院手术室）' },
    { min: 90, level: 'ok', label: '良', note: '一般建筑内设备隔振的常见验收要求（效率 ≥ 90%）' },
    { min: 80, level: 'warn', label: '合格', note: '基本要求：导则规定隔振效率宜大于 80%' },
    { min: -Infinity, level: 'danger', label: '不足', note: '效率偏低，应减小减振器刚度（加大静态压缩量）或改换型号' }
  ];

  // ------------------------------ 基础工具 ------------------------------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var x = parseFloat(v);
    return isFinite(x) ? x : null;
  }
  function round(v, d) {
    if (v == null || !isFinite(v)) return null;
    var p = Math.pow(10, d == null ? 2 : d);
    return Math.round(v * p) / p;
  }
  function unitFactor(unit) {
    var u = STIFFNESS_UNITS[unit];
    return u ? u.factor : 1;
  }
  function toKgPerMm(value, unit) {
    var v = num(value);
    return v == null ? null : v * unitFactor(unit);
  }
  function fromKgPerMm(k, unit) {
    var v = num(k);
    return v == null ? null : v / unitFactor(unit);
  }

  // ------------------------------ 基本物理量 ------------------------------
  // 扰动频率：回转设备 f = n/60
  function disturbFrequency(rpm) {
    var n = num(rpm);
    if (n == null || n <= 0) return null;
    return n / 60;
  }

  // 静态压缩量 δ = P / k（mm）
  function staticDeflection(loadKg, kKgPerMm) {
    var p = num(loadKg), k = num(kKgPerMm);
    if (p == null || p <= 0 || k == null || k <= 0) return null;
    return p / k;
  }

  // 固有频率：f₀ = 4.9823·√(10·d/δ)  （等价于 f₀ = 4.98·√(K_D/W)）
  function naturalFrequency(deflectionMM, dynamicFactor) {
    var def = num(deflectionMM);
    if (def == null || def <= 0) return null;
    var d = num(dynamicFactor);
    if (d == null || d <= 0) d = 1;
    return K_FREQ * Math.sqrt(10 * d / def);
  }

  // 由固有频率反求所需静态压缩量：δ = 10·d·K_FREQ²/f₀²（mm）
  function deflectionForFrequency(f0, dynamicFactor) {
    var f = num(f0);
    if (f == null || f <= 0) return null;
    var d = num(dynamicFactor);
    if (d == null || d <= 0) d = 1;
    return 10 * d * K_FREQ * K_FREQ / (f * f);
  }

  function frequencyRatio(f, f0) {
    var a = num(f), b = num(f0);
    if (a == null || a <= 0 || b == null || b <= 0) return null;
    return a / b;
  }

  // 动刚度（kg/cm）：K_D = d · k[kg/mm] × 10
  function dynamicStiffness(kKgPerMm, dynamicFactor) {
    var k = num(kKgPerMm);
    if (k == null || k <= 0) return null;
    var d = num(dynamicFactor);
    if (d == null || d <= 0) d = 1;
    return d * k * 10;
  }

  // ------------------------------ 传递率 ------------------------------
  // 力传递率（含阻尼）：T = √{[1+(2Dz)²] / [(1−z²)²+(2Dz)²]}
  // D = 0 时退化为无阻尼简化式 1/|1−z²|
  function transmissibility(z, damping) {
    var zz = num(z);
    if (zz == null || zz <= 0) return null;
    var d = num(damping);
    if (d == null || d < 0) d = 0;
    var z2 = zz * zz;
    var damp = Math.pow(2 * d * zz, 2);
    var den = Math.pow(1 - z2, 2) + damp;
    if (den <= 0) return Infinity;
    return Math.sqrt((1 + damp) / den);
  }

  // 无阻尼简化式：T = |1/(1−z²)|
  function transmissibilityUndamped(z) {
    var zz = num(z);
    if (zz == null || zz <= 0) return null;
    var den = Math.abs(1 - zz * zz);
    if (den < 1e-12) return Infinity;
    return 1 / den;
  }

  // 峰值传递率（z = 1）：T = √(1+4D²)/(2D)
  function peakTransmissibility(damping) {
    var d = num(damping);
    if (d == null || d < 0) d = 0;
    if (d <= 1e-9) return Infinity;
    return Math.sqrt(1 + 4 * d * d) / (2 * d);
  }

  // 隔振效率 η = (1 − T)×100%
  function efficiency(T) {
    if (T == null) return null;
    var t = Number(T);
    if (isNaN(t)) return null;
    return (1 - t) * 100;
  }

  // 振动级降低量 ΔL = 20·lg(1/T)（dB）
  function insertionLoss(T) {
    if (T == null) return null;
    var t = Number(T);
    if (isNaN(t) || t <= 0) return null;
    return 20 * Math.log10(1 / t);
  }

  // ------------------------------ 判定 ------------------------------
  // 频率比判定（按导则 7.4.2.4 整理）；交界值归入较宽松的一侧：
  // z = 1.4 判为「有效果但不推荐」，z = 2.5 与 z = 4 均归入宜用区间
  function ratioGuide(z) {
    var zz = num(z);
    if (zz == null || zz <= 0) return null;
    if (zz < 1) return RATIO_GUIDE[0];
    if (zz < SAFE_RATIO_MIN) return RATIO_GUIDE[1];
    if (zz < REC_RATIO_MIN) return RATIO_GUIDE[2];
    if (zz <= REC_RATIO_MAX) return RATIO_GUIDE[3];
    return RATIO_GUIDE[4];
  }

  function efficiencyGrade(eta) {
    var e = num(eta);
    if (e == null) return null;
    for (var i = 0; i < EFFICIENCY_GRADES.length; i++) {
      if (e >= EFFICIENCY_GRADES[i].min) return EFFICIENCY_GRADES[i];
    }
    return EFFICIENCY_GRADES[EFFICIENCY_GRADES.length - 1];
  }

  // ------------------------------ 方法一：静变形法（计算书） ------------------------------
  function analyze(o) {
    o = o || {};
    var device = num(o.deviceWeight);
    var baseW = num(o.baseWeight);
    if (baseW == null || baseW < 0) baseW = 0;
    var safety = num(o.safety);
    if (safety == null || safety <= 0) safety = 1;
    var count = num(o.count);
    count = (count == null || count < 1) ? 1 : Math.round(count);
    var rpm = num(o.rpm);
    var fIn = num(o.freq);
    var kIn = num(o.stiffness);
    var unit = STIFFNESS_UNITS[o.stiffnessUnit] ? o.stiffnessUnit : 'kg/mm';
    var d = num(o.dynamicFactor);
    if (d == null || d <= 0) d = 1;
    var damping = num(o.damping);
    if (damping == null || damping < 0) damping = 0;
    var ratedLoad = num(o.ratedLoad);

    if (device == null || device <= 0) return { ok: false, error: '请输入设备（含电机）自重，单位 kg' };
    if (kIn == null || kIn <= 0) return { ok: false, error: '请输入单只减振器的竖向刚度' };

    var f;
    if (fIn != null && fIn > 0) f = fIn;
    else if (rpm != null && rpm > 0) f = rpm / 60;
    else return { ok: false, error: '请输入设备转速（r/min）或扰动频率（Hz）' };

    // 逐项计算
    var rawTotal = device + baseW;
    var totalWeight = rawTotal * safety;
    var unitLoad = totalWeight / count;
    var k = toKgPerMm(kIn, unit);
    var deflection = staticDeflection(unitLoad, k);
    var Kd = dynamicStiffness(k, d);
    var f0 = naturalFrequency(deflection, d);
    if (f0 == null || !isFinite(f0) || f0 <= 0) return { ok: false, error: '参数不合理，无法得到有效的固有频率，请检查刚度与荷载' };
    var z = frequencyRatio(f, f0);
    var Tu = transmissibilityUndamped(z);
    var Td = transmissibility(z, damping);
    var etaU = efficiency(Tu);
    var eta = efficiency(Td);
    var lossDb = insertionLoss(Td);
    var guide = ratioGuide(z);
    var grade = efficiencyGrade(eta);
    var amplified = Td > 1;

    // 计算书步骤（含公式、代入、结果）
    var steps = [
      {
        no: 1, title: '隔振系统运行重量',
        formula: 'W = (G₁ + G₂) × K',
        subst: '= (' + round(device, 1) + ' + ' + round(baseW, 1) + ') × ' + round(safety, 2),
        value: round(totalWeight, 1), unit: 'kg',
        note: 'G₁ 设备（含电机）自重，G₂ 台座/配重，K 为安全系数（一般取 1.3，兼顾各支点受力不均与运行时附加荷载）。'
      },
      {
        no: 2, title: '每只减振器承载',
        formula: 'P = W / N',
        subst: '= ' + round(totalWeight, 1) + ' / ' + count,
        value: round(unitLoad, 2), unit: 'kg',
        note: 'N = ' + count + ' 只；设备重心与减振器刚度中心宜在同一铅垂线上，重量分布不均时应按实际支点反力分配。'
      },
      {
        no: 3, title: '单只竖向刚度换算',
        formula: 'k = k₀ × 单位换算系数',
        subst: '= ' + round(kIn, 4) + ' ' + unit + ' → ' + round(k, 4) + ' kg/mm',
        value: round(k, 4), unit: 'kg/mm',
        note: '内部计算统一采用 kg/mm；1 kg/mm = 9.80665 N/mm。刚度取减振器样本给出的竖向静刚度。'
      },
      {
        no: 4, title: '静态压缩量',
        formula: 'δ = P / k',
        subst: '= ' + round(unitLoad, 2) + ' / ' + round(k, 4),
        value: round(deflection, 2), unit: 'mm',
        note: '即设备安装就位后弹簧的静压缩量，是选择减振器型号时最关键的参数（样本上通常给出最佳荷载与对应压缩量）。'
      },
      {
        no: 5, title: '动刚度',
        formula: 'K_D = d × k × 10',
        subst: '= ' + round(d, 2) + ' × ' + round(k, 4) + ' × 10',
        value: round(Kd, 2), unit: 'kg/cm',
        note: 'd 为动、静刚度比（动态系数）：钢弹簧取 1.0，橡胶取 1.5 ~ 2.3。动刚度大于静刚度，橡胶类减振器的固有频率高于按静变形估算值。'
      },
      {
        no: 6, title: '系统固有频率',
        formula: 'f₀ = 4.9823 × √(K_D / P)  ≈  15.76 / √δ × √d',
        subst: '= 4.9823 × √(' + round(Kd, 2) + ' / ' + round(unitLoad, 2) + ')',
        value: round(f0, 2), unit: 'Hz',
        note: '按单只减振器支承质量计算（K_D 单位 kg/cm、P 单位 kg）；亦可用简化式 f₀ ≈ 5/√δ(cm)，此处取精确系数 4.9823。'
      },
      {
        no: 7, title: '扰动频率',
        formula: 'f = n / 60',
        subst: rpm != null && rpm > 0 ? '= ' + round(rpm, 0) + ' / 60' : '= ' + round(f, 2) + '（直接输入）',
        value: round(f, 2), unit: 'Hz',
        note: '回转型设备取最低工作转速换算。设备还可能在 2f（不平衡、对中不良）等谐波处激励，必要时按最高谐波校核。'
      },
      {
        no: 8, title: '频率比',
        formula: 'z = f / f₀',
        subst: '= ' + round(f, 2) + ' / ' + round(f0, 2),
        value: round(z, 2), unit: '',
        note: '导则要求 z 宜取 ' + REC_RATIO_MIN + ' ~ ' + REC_RATIO_MAX + '，且不得小于 ' + SAFE_RATIO_MIN + '。'
      },
      {
        no: 9, title: '力传递率（无阻尼简化式 / 含阻尼式）',
        formula: 'T₀ = |1 / (1 − z²)|　　T = √{[1+(2Dz)²] / [(1−z²)²+(2Dz)²]}',
        subst: 'z = ' + round(z, 2) + '，D = ' + round(damping, 3),
        value: round(Td, 4), unit: '',
        note: '无阻尼 T₀ = ' + round(Tu, 4) + '；D = 0 时两式等价。阻尼抑制共振放大，但在 z > √2 的高频段会使传递率略高于无阻尼值，故实际效率略低于简化式计算值。'
      },
      {
        no: 10, title: '隔振效率',
        formula: 'η = (1 − T) × 100%',
        subst: '= (1 − ' + round(Td, 4) + ') × 100%',
        value: round(eta, 2), unit: '%',
        note: '按无阻尼简化式则为 ' + round(etaU, 2) + '%。效率越高表示传到基础的动荷载越小。'
      },
      {
        no: 11, title: '振动级降低量',
        formula: 'ΔL = 20 × lg(1 / T)',
        subst: '= 20 × lg(1 / ' + round(Td, 4) + ')',
        value: round(lossDb, 1), unit: 'dB',
        note: '与效率互为换算：η = 98% 相当于降低约 17 dB，η = 99% 相当于 20 dB。传递率每降低一个数量级，振动级降低 20 dB。'
      },
      {
        no: 12, title: '校核与结论',
        formula: 'z ≥ 2.5 且 η ≥ 80%（一般要求 ≥ 90%）',
        subst: 'z = ' + round(z, 2) + '，η = ' + round(eta, 2) + '%',
        value: round(eta, 2), unit: '%',
        note: (guide ? guide.title + '：' + guide.note : '') + ' 效率等级：' + (grade ? grade.label + '（' + grade.note + '）' : '—') + '。'
      }
    ];

    // 提示与警告
    var warnings = [];
    if (z < SAFE_RATIO_MIN) {
      warnings.push({
        level: 'danger',
        text: '频率比 z = ' + round(z, 2) + ' 小于 ' + SAFE_RATIO_MIN +
          '，处于共振放大区或其边缘，振动会被放大。应减小减振器刚度（增大静态压缩量）、改选更软的型号，或增加配重降低固有频率。'
      });
    } else if (z < REC_RATIO_MIN) {
      warnings.push({
        level: 'warn',
        text: '频率比 z = ' + round(z, 2) + ' 虽已超过 1.4 的禁用下限，但低于推荐的 ' + REC_RATIO_MIN +
          '，隔振效率偏低且启停跨越共振区时振幅较大，建议加大静态压缩量。'
      });
    }
    if (amplified) {
      warnings.push({ level: 'danger', text: '传递率 T = ' + round(Td, 4) + ' > 1，减振器目前起放大作用，方案不可用。' });
    }
    if (deflection != null && deflection > MAX_DEFLECTION) {
      warnings.push({
        level: 'danger',
        text: '静态压缩量 δ = ' + round(deflection, 1) + ' mm 已超出工程可接受范围（> ' + MAX_DEFLECTION +
          ' mm）。弹簧自由高度过大、稳定性无法保证，应考虑增加支承点、改用低刚度大直径弹簧，或重新确定隔振方案。'
      });
    } else if (deflection != null && deflection > COMMON_DEFLECTION_MAX) {
      warnings.push({
        level: 'warn',
        text: '静态压缩量 δ = ' + round(deflection, 1) + ' mm 偏大（常用弹簧减振器多为 10 ~ ' +
          COMMON_DEFLECTION_MAX + ' mm），弹簧自由高度大、稳定性与设备水平度不易保证，必要时应增加支承点。'
      });
    }
    if (deflection != null && deflection < MIN_DEFLECTION) {
      warnings.push({
        level: 'warn',
        text: '静态压缩量 δ = ' + round(deflection, 1) + ' mm 过小，弹簧刚度过大，固有频率偏高，很难达到隔振要求。'
      });
    }
    if (ratedLoad != null && ratedLoad > 0) {
      var ratio = unitLoad / ratedLoad;
      if (ratio > 1) {
        warnings.push({
          level: 'danger',
          text: '每只承载 ' + round(unitLoad, 1) + ' kg 已超过所选型号额定荷载 ' + round(ratedLoad, 1) +
            ' kg（' + round(ratio * 100, 0) + '%），存在过载与疲劳破坏风险，须改选更大型号或增加数量。'
        });
      } else if (ratio < 0.5) {
        warnings.push({
          level: 'warn',
          text: '每只承载仅为额定荷载的 ' + round(ratio * 100, 0) + '%，选型偏大：样本刚度对应的实际压缩量会小于额定值，' +
            '固有频率随之偏高，且弹簧长期处于低荷载状态易疲劳。宜选最佳荷载略大于实际承载的型号。'
        });
      } else {
        warnings.push({
          level: 'ok',
          text: '荷载利用率 ' + round(ratio * 100, 0) + '%，处于合理区间（建议 50% ~ 100%）。'
        });
      }
    }
    if (damping === 0) {
      warnings.push({
        level: 'info',
        text: '当前按无阻尼计算（D = 0）。实际阻尼弹簧减振器的阻尼比一般在 0.02 ~ 0.05，回转设备按导则宜取 0.05 ~ 0.12；填入阻尼比可得到更接近实际的效率。'
      });
    }

    return {
      ok: true,
      // 输入回显
      device: device, baseWeight: baseW, safety: safety, count: count,
      rpm: rpm, freq: f, stiffnessInput: kIn, stiffnessUnit: unit,
      stiffnessKgPerMm: k, dynamicFactor: d, damping: damping, ratedLoad: ratedLoad,
      // 结果
      totalWeight: totalWeight, unitLoad: unitLoad, deflection: deflection,
      dynamicStiffness: Kd, f0: f0, z: z,
      TUndamped: Tu, T: Td, efficiencyUndamped: etaU, efficiency: eta, lossDb: lossDb,
      amplified: amplified, guide: guide, grade: grade, warnings: warnings, steps: steps
    };
  }

  // ------------------------------ 方法二：频率比法（直接验算） ------------------------------
  function byRatio(o) {
    o = o || {};
    var f = num(o.freq);
    var f0 = num(o.f0);
    var defl = num(o.deflection);
    var d = num(o.dynamicFactor);
    if (d == null || d <= 0) d = 1;
    var damping = num(o.damping);
    if (damping == null || damping < 0) damping = 0;

    if ((f0 == null || f0 <= 0) && defl != null && defl > 0) f0 = naturalFrequency(defl, d);
    if (f == null || f <= 0) return { ok: false, error: '请输入扰动频率 f（Hz）' };
    if (f0 == null || f0 <= 0) return { ok: false, error: '请输入减振器固有频率 f₀（Hz）或静态压缩量 δ（mm）' };

    var z = frequencyRatio(f, f0);
    var Tu = transmissibilityUndamped(z);
    var Td = transmissibility(z, damping);
    var etaU = efficiency(Tu);
    var eta = efficiency(Td);
    return {
      ok: true, freq: f, f0: f0, deflection: (defl != null && defl > 0) ? defl : deflectionForFrequency(f0, d),
      dynamicFactor: d, damping: damping, z: z,
      TUndamped: Tu, T: Td, efficiencyUndamped: etaU, efficiency: eta,
      lossDb: insertionLoss(Td), lossDbUndamped: insertionLoss(Tu),
      peakT: peakTransmissibility(damping), amplified: Td > 1,
      guide: ratioGuide(z), grade: efficiencyGrade(eta)
    };
  }

  // ------------------------------ 目标效率反算 ------------------------------
  // 由目标隔振效率反求所需频率比（无阻尼有解析解，含阻尼用二分法数值解）
  function requiredRatio(targetEfficiency, damping) {
    var eta = num(targetEfficiency);
    if (eta == null) return { ok: false, error: '请输入目标隔振效率（%）' };
    if (eta <= 0) return { ok: false, error: '目标效率应大于 0%，否则无需隔振' };
    if (eta >= 100) return { ok: false, error: '目标效率应小于 100%：弹簧隔振系统无法完全隔绝振动' };
    var T = 1 - eta / 100;
    var d = num(damping);
    if (d == null || d < 0) d = 0;
    if (d <= 1e-9) {
      return { ok: true, target: eta, T: T, z: Math.sqrt(1 + 1 / T), exact: true, damping: 0 };
    }
    var lo = Math.SQRT2 + 1e-9, hi = 500;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (transmissibility(mid, d) > T) lo = mid; else hi = mid;
    }
    return { ok: true, target: eta, T: T, z: (lo + hi) / 2, exact: false, damping: d };
  }

  // 反算：目标效率 → 所需 f₀ / 静变形 / 单只最大允许刚度
  function reverse(o) {
    o = o || {};
    var rr = requiredRatio(o.targetEfficiency, o.damping);
    if (!rr.ok) return rr;
    var f = num(o.freq);
    if (f == null || f <= 0) return { ok: false, error: '请输入扰动频率 f（Hz）' };
    var d = num(o.dynamicFactor);
    if (d == null || d <= 0) d = 1;
    var f0 = f / rr.z;
    var defl = deflectionForFrequency(f0, d);
    var loadKg = num(o.loadKg);
    var kMax = (loadKg != null && loadKg > 0 && defl > 0) ? loadKg / defl : null;
    var unit = STIFFNESS_UNITS[o.stiffnessUnit] ? o.stiffnessUnit : 'kg/mm';
    var feasible = defl <= MAX_DEFLECTION;
    return {
      ok: true,
      target: rr.target, T: rr.T, z: rr.z, exact: rr.exact, damping: rr.damping,
      freq: f, f0: f0, deflection: defl, dynamicFactor: d,
      loadKg: loadKg, maxStiffnessKgPerMm: kMax, maxStiffness: fromKgPerMm(kMax, unit), unit: unit,
      feasible: feasible,
      guide: ratioGuide(rr.z),
      note: '所需频率比 z = ' + round(rr.z, 2) + '，对应固有频率 f₀ ≤ ' + round(f0, 2) + ' Hz、静态压缩量 δ ≥ ' +
        round(defl, 1) + ' mm' + (kMax == null ? '' : '、单只刚度 ≤ ' + round(fromKgPerMm(kMax, unit), 3) + ' ' + unit) +
        (feasible ? '。' : '；静态压缩量已超出工程常用范围（> ' + MAX_DEFLECTION + ' mm），该目标效率在空中楼阁上难以实现，建议放宽目标或降低扰动频率。')
    };
  }

  // 效率–频率比–静变形对照表
  function efficiencyTable(o) {
    o = o || {};
    var targets = (o.targets && o.targets.length) ? o.targets : [80, 85, 90, 95, 97, 98, 99];
    var out = [];
    targets.forEach(function (t) {
      var r = reverse({
        targetEfficiency: t, damping: o.damping, freq: o.freq,
        loadKg: o.loadKg, dynamicFactor: o.dynamicFactor, stiffnessUnit: o.stiffnessUnit
      });
      if (r.ok) out.push(r);
    });
    return out;
  }

  // ------------------------------ 厂家计算书复核 ------------------------------
  // 独立按厂家常用的标准公式（图片方法）从 inputs 重算 δ / fn / η，
  // 再与厂家声称（claimed）的输出逐项比对，给出一致 / 偏差判定。
  // 用于复核减振器厂商提供的计算书是否自洽、与标准公式是否吻合。
  //   复核判定容差（超过容差即判为偏差）：
  //     δ：±0.5 mm 或 ±3%；fn：±1 cpm 或 ±1%；η：±0.5%
  function verifySheet(o) {
    o = o || {};
    var Wa = num(o.deviceWeight);
    var safety = num(o.safety);
    if (safety == null || safety <= 0) safety = 1;
    var n = num(o.count);
    if (n == null || n < 1) n = 1;
    var rpm = num(o.rpm);
    var K = num(o.stiffness);
    var unit = STIFFNESS_UNITS[o.stiffnessUnit] ? o.stiffnessUnit : 'kg/mm';

    if (Wa == null || Wa <= 0) return { ok: false, error: '请输入设备（含电机）自重 Wa，单位 kg' };
    if (K == null || K <= 0) return { ok: false, error: '请输入单只减振器的竖向刚度 K' };

    var k = toKgPerMm(K, unit);

    // ——— 厂家标准公式（图片方法，钢弹簧 d = 1、无阻尼）———
    var Wd = Wa * safety;                 // 运行重量
    var W = Wd / n;                       // 每只承载
    var delta = W / k;                    // 静态压缩量 mm
    var fnCpm = 947 * Math.sqrt(1 / delta); // 固有频率 cpm
    var fdCpm = (rpm != null && rpm > 0) ? rpm : null; // 扰动频率 = 转速 cpm
    var z = (fdCpm != null && fdCpm > 0) ? fdCpm / fnCpm : null;
    var T = (z != null) ? 1 / Math.abs(1 - z * z) : null; // 无阻尼传递率
    var eff = (T != null) ? (1 - T) * 100 : null;          // 隔振效率 %

    // 本工具精算（analyze, d=1, D=0）交叉印证：应与标准公式重算一致
    var internal = (z != null) ? analyze({
      deviceWeight: Wa, baseWeight: 0, safety: safety, count: n, rpm: rpm,
      stiffness: K, stiffnessUnit: unit, dynamicFactor: 1, damping: 0
    }) : null;

    var tol = { deltaAbs: 0.5, deltaRel: 0.03, fnAbs: 1, fnRel: 0.01, effAbs: 0.5 };

    function check(recomputed, claimed, absTol, relTol) {
      if (claimed == null) return { provided: false, recomputed: recomputed, claimed: null, diff: null, rel: null, status: 'na' };
      var diff = recomputed - claimed;
      var rel = claimed !== 0 ? diff / claimed : 0;
      var ok = Math.abs(diff) <= absTol || (relTol != null && Math.abs(rel) <= relTol);
      var status = ok ? 'ok' : (Math.abs(diff) <= absTol * 3 ? 'warn' : 'danger');
      return { provided: true, recomputed: recomputed, claimed: claimed, diff: diff, rel: rel, status: status };
    }

    var rows = [
      { key: 'delta', label: '静态压缩量 δ', unit: 'mm', check: check(delta, num(o.claimedDeflection), tol.deltaAbs, tol.deltaRel) },
      { key: 'fn', label: '系统固有频率 fn', unit: 'cpm', check: check(fnCpm, num(o.claimedFnCpm), tol.fnAbs, tol.fnRel) },
      { key: 'eff', label: '隔振效率 η', unit: '%', check: check(eff, num(o.claimedEfficiency), tol.effAbs, null) }
    ];

    var providedRows = rows.filter(function (r) { return r.check.provided; });
    var mismatch = providedRows.filter(function (r) { return r.check.status !== 'ok'; });
    var allConsistent = providedRows.length > 0 && mismatch.length === 0;

    return {
      ok: true,
      inputs: { Wa: Wa, safety: safety, n: n, rpm: rpm, K: K, unit: unit, kKgPerMm: k },
      Wd: Wd, W: W, delta: delta, fnCpm: fnCpm, fdCpm: fdCpm, z: z, T: T, efficiency: eff,
      internalDelta: internal ? internal.deflection : null,
      internalFnHz: internal ? internal.f0 : null,
      internalEff: internal ? internal.efficiencyUndamped : null,
      rows: rows,
      tolerances: tol,
      providedCount: providedRows.length,
      mismatchCount: mismatch.length,
      allConsistent: allConsistent
    };
  }

  // ------------------------------ 曲线 ------------------------------
  // 传递率曲线（含无阻尼与含阻尼两条，供绘图）
  function curve(zMax, damping, samples) {
    var zm = num(zMax);
    if (zm == null || zm <= 0) zm = 8;
    var n = num(samples);
    if (n == null || n < 10) n = 180;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var z = 0.05 + (zm - 0.05) * i / n;
      var Tu = transmissibilityUndamped(z);
      var Td = transmissibility(z, damping);
      out.push({ z: z, TUndamped: Tu, T: Td, efficiencyUndamped: efficiency(Tu), efficiency: efficiency(Td) });
    }
    return out;
  }

  var API = {
    G_CM: G_CM,
    K_FREQ: K_FREQ,
    DEFLECT_COEF: DEFLECT_COEF,
    SAFE_RATIO_MIN: SAFE_RATIO_MIN,
    REC_RATIO_MIN: REC_RATIO_MIN,
    REC_RATIO_MAX: REC_RATIO_MAX,
    MAX_DEFLECTION: MAX_DEFLECTION,
    STIFFNESS_UNITS: STIFFNESS_UNITS,
    DYNAMIC_FACTORS: DYNAMIC_FACTORS,
    RATIO_GUIDE: RATIO_GUIDE,
    EFFICIENCY_GRADES: EFFICIENCY_GRADES,
    toKgPerMm: toKgPerMm,
    fromKgPerMm: fromKgPerMm,
    disturbFrequency: disturbFrequency,
    staticDeflection: staticDeflection,
    naturalFrequency: naturalFrequency,
    deflectionForFrequency: deflectionForFrequency,
    frequencyRatio: frequencyRatio,
    dynamicStiffness: dynamicStiffness,
    transmissibility: transmissibility,
    transmissibilityUndamped: transmissibilityUndamped,
    peakTransmissibility: peakTransmissibility,
    efficiency: efficiency,
    insertionLoss: insertionLoss,
    ratioGuide: ratioGuide,
    efficiencyGrade: efficiencyGrade,
    analyze: analyze,
    byRatio: byRatio,
    requiredRatio: requiredRatio,
    reverse: reverse,
    efficiencyTable: efficiencyTable,
    verifySheet: verifySheet,
    curve: curve,
    round: round
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Vibration = API;
  }
})(typeof window !== 'undefined' ? window : this);
