/*
 * audiolevel.js — 音频电平与阻抗内核（#/audiolevel）
 *
 * 覆盖电声工程里最常用、也最容易记混的一组换算：
 *   1) 电平：V / dBV / dBu / dBm / dBW / dBFS（含满刻度基准选择）
 *   2) 灵敏度：1 W/1 m ↔ 2.83 V/1 m ↔ 1 V/1 m
 *   3) 多只音箱：串/并/串并联阻抗与 SPL 增减（恒压功放模型）
 *   4) 功放—音箱：电压↔功率、最大 SPL、峰值余量与功放选型
 *   5) 线材与阻尼：铜/铝线阻、回路损耗、阻尼系数与允许线长
 *
 * UMD：浏览器 window.AudioLevel，Node require('./audiolevel.js')。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AudioLevel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var SQRT2 = Math.SQRT2;

  /* ==================================================================
   * 常量与基准
   * ================================================================== */

  /** dBV 参考电压：1 Vrms */
  var V0_DBV = 1.0;
  /** dBu 参考电压：√(0.6 W × 600 Ω) = 0.7745966692 Vrms */
  var V0_DBU = Math.sqrt(0.6);
  /** dBm 参考功率：1 mW */
  var P0_DBM = 0.001;

  /** 常见满刻度（0 dBFS）基准，单位 dBu */
  var FULL_SCALE = [
    { name: '+15 dBu（民用/半专业）', dbu: 15 },
    { name: '+18 dBu（常见专业接口）', dbu: 18 },
    { name: '+20 dBu', dbu: 20 },
    { name: '+22 dBu', dbu: 22 },
    { name: '+24 dBu（高端转换器）', dbu: 24 }
  ];

  /** 常用电平锚点，便于对照 */
  var LEVEL_PRESETS = [
    { name: '消费级线路 −10 dBV', dbv: -10, dbu: -7.78, v: 0.3162 },
    { name: '专业线路 +4 dBu', dbv: 1.78, dbu: 4, v: 1.2278 },
    { name: '麦克风典型 −40 dBV', dbv: -40, dbu: -37.78, v: 0.01 },
    { name: '麦克风典型 −50 dBV', dbv: -50, dbu: -47.78, v: 0.00316 },
    { name: '耳机 1 Vrms', dbv: 0, dbu: 2.22, v: 1 },
    { name: '功放 100 W / 8 Ω', dbv: 29.03, dbu: 31.25, v: 28.284 },
    { name: '功放 400 W / 8 Ω', dbv: 35.05, dbu: 37.27, v: 56.569 }
  ];

  /** 材料电阻率（Ω·m，20 ℃）与温度系数（1/℃） */
  var CONDUCTOR = {
    copper: { name: '铜', rho: 1.7241e-8, alpha: 0.00393 },
    aluminium: { name: '铝', rho: 2.82e-8, alpha: 0.00403 },
    silver: { name: '银', rho: 1.59e-8, alpha: 0.0038 },
    cca: { name: '铜包铝 (CCA)', rho: 2.65e-8, alpha: 0.00393 }
  };

  /** 公制截面积（mm²） */
  var AREA_MM2 = [0.5, 0.75, 1.0, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];

  /** AWG 线规（截面积 mm²），常用音箱线区间 */
  var AWG = [
    { awg: '20', a: 0.518 }, { awg: '18', a: 0.823 }, { awg: '16', a: 1.309 },
    { awg: '14', a: 2.081 }, { awg: '13', a: 2.624 }, { awg: '12', a: 3.309 },
    { awg: '10', a: 5.261 }, { awg: '8', a: 8.366 }, { awg: '6', a: 13.30 },
    { awg: '4', a: 21.15 }, { awg: '2', a: 33.62 }, { awg: '1/0', a: 42.41 },
    { awg: '2/0', a: 53.49 }, { awg: '4/0', a: 85.01 }
  ];

  /** 节目信号波峰因数典型值（dB，峰值 / 有效值） */
  var CREST = [
    { name: '正弦（测试信号）', db: 3.01 },
    { name: '粉红噪声', db: 8.0 },
    { name: '流行 / 摇滚（重压缩）', db: 10 },
    { name: '爵士 / 人声', db: 12 },
    { name: '古典 / 未压缩现场', db: 16 },
    { name: '打击乐瞬态峰值', db: 20 }
  ];

  /* ==================================================================
   * 基础工具
   * ================================================================== */

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function db20(r) { return 20 * Math.log10(Math.abs(r) < 1e-12 ? 1e-12 : Math.abs(r)); }
  function db10(r) { return 10 * Math.log10(Math.abs(r) < 1e-12 ? 1e-12 : Math.abs(r)); }
  function fromDb(db) { return Math.pow(10, db / 20); }
  function fromDb10(db) { return Math.pow(10, db / 10); }

  /* ==================================================================
   * 1) 电平换算
   * ================================================================== */

  /** 电压 → dBV */
  function dbv(v) { return db20(num(v) / V0_DBV); }
  /** 电压 → dBu */
  function dbu(v) { return db20(num(v) / V0_DBU); }
  /** dBV → 电压 */
  function vFromDbv(d) { return V0_DBV * fromDb(num(d)); }
  /** dBu → 电压 */
  function vFromDbu(d) { return V0_DBU * fromDb(num(d)); }
  /** 电压 → dBFS（需满刻度电压 vfs） */
  function dbfs(v, vfs) { return db20(num(v) / num(vfs, 1)); }
  /** dBFS → 电压 */
  function vFromDbfs(d, vfs) { return num(vfs, 1) * fromDb(num(d)); }
  /** 满刻度电压（由 dBu 值给出） */
  function fullScaleVolts(dbuVal) { return vFromDbu(num(dbuVal, 24)); }
  /** 电压与负载 → 功率 */
  function watts(v, z) { var u = num(v), r = num(z, 8); return r > 0 ? (u * u) / r : 0; }
  /** 功率与负载 → 电压 */
  function vFromWatts(p, z) { var r = num(z, 8); return Math.sqrt(Math.max(0, num(p)) * Math.max(1e-9, r)); }
  /** 电压 → dBm（默认 600 Ω 负载，0 dBm = 1 mW） */
  function dbm(v, z) { return db10(watts(v, num(z, 600)) / P0_DBM); }
  /** 功率 → dBW（1 W 基准） */
  function dbw(p) { return db10(num(p)); }
  /** 峰值 ↔ 有效值（正弦 √2；或按给定波峰因数 dB） */
  function crestConvert(v, crestDb, toPeak) {
    var k = num(crestDb, 3.0103);
    return toPeak ? num(v) * fromDb(k) : num(v) / fromDb(k);
  }

  /**
   * 由电压出发，一次给出全部常用电平表示。
   * @param {object} o { volts, impedance, vfs }
   */
  function levels(o) {
    o = o || {};
    var v = num(o.volts);
    var z = num(o.impedance, 8);
    var vfs = num(o.vfs, fullScaleVolts(24));
    var p = watts(v, z);
    return {
      volts: v,
      peak: v * SQRT2,
      pp: 2 * SQRT2 * v,
      impedance: z,
      watts: p,
      vfs: vfs,
      dBV: dbv(v),
      dBu: dbu(v),
      dBm600: dbm(v, 600),
      dBmZ: dbm(v, z),
      dBW: dbw(p),
      dBFS: dbfs(v, vfs),
      /** 距满刻度的余量（正数表示还有多少 dB 到 0 dBFS） */
      headroomToFs: -dbfs(v, vfs)
    };
  }

  /**
   * 由某个单位的数值反解电压，再展开全部表示。
   * @param {object} o { value, unit: 'v'|'dbv'|'dbu'|'dbm'|'dbw'|'dbfs', impedance, vfs }
   */
  function fromUnit(o) {
    o = o || {};
    var z = num(o.impedance, 8);
    var vfs = num(o.vfs, fullScaleVolts(24));
    var u = String(o.unit || 'v').toLowerCase();
    var x = num(o.value);
    var v;
    switch (u) {
      case 'v': case 'volt': case 'volts': v = x; break;
      case 'dbv': v = vFromDbv(x); break;
      case 'dbu': v = vFromDbu(x); break;
      case 'dbm': v = Math.sqrt(Math.max(0, P0_DBM * fromDb10(x)) * Math.max(1e-9, z)); break;
      case 'dbw': v = vFromWatts(fromDb10(x), z); break;
      case 'dbfs': v = vFromDbfs(x, vfs); break;
      default: v = x;
    }
    return levels({ volts: v, impedance: z, vfs: vfs });
  }

  /* ==================================================================
   * 2) 灵敏度换算
   * ================================================================== */

  /**
   * 音箱灵敏度三套标注互转。
   *   · 1 W/1 m：按标称阻抗 Z 施加 √(Z) 伏
   *   · 2.83 V/1 m：固定 2.83 V（≈ 8 Ω 上的 1 W）
   *   · 1 V/1 m：固定 1 V
   * 换算：SPL(2.83V) = SPL(1W) + 10·lg(8/Z)
   *       SPL(1V)    = SPL(1W) − 10·lg(Z)
   * @param {object} o { mode:'1w'|'2.83v'|'1v', spl, z }
   */
  function sensitivity(o) {
    o = o || {};
    var z = num(o.z, 8);
    var mode = String(o.mode || '1w');
    var spl = num(o.spl, 90);
    var s1w, s283, s1v;
    if (mode === '2.83v') {
      s283 = spl; s1w = spl - db10(8 / z); s1v = spl - db20(2.83);
    } else if (mode === '1v') {
      s1v = spl; s1w = spl + db10(z); s283 = spl + db20(2.83);
    } else {
      s1w = spl; s283 = spl + db10(8 / z); s1v = spl - db10(z);
    }
    return {
      z: z,
      spl1w1m: s1w,
      spl283v1m: s283,
      spl1v1m: s1v,
      /** 1 W 对应的电压 */
      v1w: vFromWatts(1, z),
      /** 2.83 V 实际注入的功率 */
      p283: watts(2.83, z),
      /** 三套标注之间的差值 */
      delta283: db10(8 / z),
      delta1v: -db10(z)
    };
  }

  /* ==================================================================
   * 3) 多只音箱：阻抗与 SPL 增减
   * ================================================================== */

  /**
   * 串/并/串并联总阻抗。
   * @param {object} o { z, n, wiring:'parallel'|'series'|'sp', perGroup }
   */
  function arrayImpedance(o) {
    o = o || {};
    var z = num(o.z, 8);
    var n = Math.max(1, Math.round(num(o.n, 1)));
    var w = String(o.wiring || 'parallel');
    if (w === 'series') return { z: z * n, n: n, wiring: 'series', groups: 1, perGroup: n };
    if (w === 'sp') {
      var s = Math.max(1, Math.round(num(o.perGroup, 2)));
      var p = Math.max(1, Math.round(n / s));
      return { z: (s * z) / p, n: s * p, wiring: 'sp', groups: p, perGroup: s };
    }
    return { z: z / n, n: n, wiring: 'parallel', groups: n, perGroup: 1 };
  }

  /**
   * 恒压功放下，N 只同型号音箱的 SPL 相对单只的变化。
   * 模型：功放输出固定电压 U（不随负载变化，理想恒压源）。
   *   并联：每只得到 U，总功率 N·U²/Z      → +10 lg N
   *   串联：每只得到 U/N，总功率 U²/(N·Z)  → −10 lg N
   *   串并联（每串 s 只、共 p 串）：总功率 p·U²/(s·Z) → +10 lg(p/s)
   * @param {object} o { z, n, wiring, perGroup, ampVolts }
   */
  function arrayGain(o) {
    o = o || {};
    var z = num(o.z, 8);
    var u = num(o.ampVolts, 28.28);
    var ai = arrayImpedance(o);
    var n = ai.n;
    var perBoxV, perBoxP, totalP, relDb;
    if (ai.wiring === 'series') {
      perBoxV = u / n;
    } else if (ai.wiring === 'sp') {
      perBoxV = u / ai.perGroup;
    } else {
      perBoxV = u;
    }
    perBoxP = watts(perBoxV, z);
    totalP = perBoxP * n;
    var singleP = watts(u, z);
    relDb = singleP > 0 ? db10(totalP / singleP) : 0;
    return {
      impedance: ai,
      totalZ: ai.z,
      perBoxVolts: perBoxV,
      perBoxWatts: perBoxP,
      totalWatts: totalP,
      ampVolts: u,
      /** 相对「单只接同一功放」的 SPL 变化 */
      relDb: relDb,
      /** 功放需要提供的电流（恒压模型下的实际值） */
      ampCurrent: ai.z > 0 ? u / ai.z : 0
    };
  }

  /* ==================================================================
   * 4) 功放—音箱：功率、声压、余量
   * ================================================================== */

  /**
   * 由功放功率与灵敏度推算最大声压级。
   *   SPL(r) = SPL_1W1m + 10·lg(P) − 20·lg(r)   （半空间参考）
   *   全空间（4π）再减 3 dB；多只非相干叠加 +10·lg N，理想相干 +20·lg N。
   * @param {object} o { spl1w1m, power, distance, n, space:'half'|'full', coherence:'inc'|'coh' }
   */
  function ampSpl(o) {
    o = o || {};
    var s = num(o.spl1w1m, 90);
    var p = Math.max(1e-9, num(o.power, 100));
    var r = Math.max(1e-6, num(o.distance, 1));
    var n = Math.max(1, num(o.n, 1));
    var space = String(o.space || 'half');
    var coh = String(o.coherence || 'inc');
    var splAt1 = s + db10(p) + (space === 'full' ? -3 : 0) + db10(n) * (coh === 'coh' ? 2 : 1);
    var spl = splAt1 - db20(r);
    return {
      spl1w1m: s,
      power: p,
      distance: r,
      boxes: n,
      space: space,
      /** 1 m 处声压级 */
      spl1m: splAt1,
      /** 目标距离处连续（RMS）声压级 */
      spl: spl,
      /** 每只承担的功率 */
      perBoxWatts: p / n,
      /** 功放输出电压（按总阻抗反推时另算，此处按标称 Z 单只） */
      distAtten: db20(r),
      arrayGainDb: db10(n) * (coh === 'coh' ? 2 : 1),
      spaceCorrDb: space === 'full' ? -3 : 0
    };
  }

  /**
   * 峰值余量与功放选型：给定目标 SPL 与波峰因数，反算所需 RMS 功率与推荐功放功率。
   * @param {object} o { spl1w1m, targetSpl, distance, n, crestDb, headroomDb, space }
   */
  function ampSizing(o) {
    o = o || {};
    var s = num(o.spl1w1m, 90);
    var target = num(o.targetSpl, 100);
    var r = Math.max(1e-6, num(o.distance, 10));
    var n = Math.max(1, num(o.n, 1));
    var crest = num(o.crestDb, 10);
    var head = num(o.headroomDb, 3);
    var space = String(o.space || 'half');
    var needAt1 = target + db20(r) - db10(n) - (space === 'full' ? -3 : 0);
    var pRms = Math.pow(10, (needAt1 - s) / 10);
    var pPeak = pRms * fromDb10(crest);
    var pAmp = pRms * fromDb10(head);
    return {
      targetSpl: target,
      /** 1 m 处所需连续声压级 */
      needSpl1m: needAt1,
      /** 所需连续（RMS）功率，每只 */
      rmsWattsPerBox: pRms,
      /** 峰值功率需求（波峰因数造成的瞬时值） */
      peakWattsPerBox: pPeak,
      /** 建议功放功率：连续功率 × 余量系数 */
      recommendedWattsPerBox: pAmp,
      /** 建议功放功率（含峰值不削波） */
      noClipWattsPerBox: Math.max(pAmp, pPeak),
      crestDb: crest,
      headroomDb: head,
      /** 功放长期功率与峰值功率之比 */
      crestFactorLinear: fromDb10(crest)
    };
  }

  /* ==================================================================
   * 5) 线材与阻尼
   * ================================================================== */

  /**
   * 单根导线电阻（Ω）。
   * @param {object} o { length, area(mm²), material, temp(℃) }
   */
  function wire(o) {
    o = o || {};
    var mat = CONDUCTOR[String(o.material || 'copper')] || CONDUCTOR.copper;
    var L = Math.max(0, num(o.length, 10));
    var aMm2 = Math.max(1e-6, num(o.area, 2.5));
    var t = num(o.temp, 20);
    var rhoT = mat.rho * (1 + mat.alpha * (t - 20));
    var aM2 = aMm2 * 1e-6;
    var rOne = rhoT * L / aM2;
    return {
      material: mat.name,
      length: L,
      area: aMm2,
      temp: t,
      resistivity: rhoT,
      /** 单程电阻 */
      rOneWay: rOne,
      /** 回路电阻（往返两根） */
      rLoop: 2 * rOne,
      /** 每米单程电阻，mΩ/m */
      mohmPerM: rOne / Math.max(1e-9, L) * 1000,
      /** 每千米回路电阻 */
      ohmPerKm: 2 * rOne / Math.max(1e-9, L) * 1000
    };
  }

  /** 常用截面积 / AWG 的每米电阻速查（铜，20 ℃） */
  function wireTable(material) {
    var mk = function (label, a) {
      var w = wire({ length: 1, area: a, material: material || 'copper' });
      return { label: label, area: a, mohmPerM: w.mohmPerM, ohmPerKm: w.ohmPerKm };
    };
    var out = AREA_MM2.map(function (a) { return mk(a + ' mm²', a); });
    AWG.forEach(function (g) { out.push(mk('AWG ' + g.awg, g.a)); });
    return out;
  }

  /**
   * 阻尼系数与线损。
   * @param {object} o { zLoad, zAmp, rLoop }
   *   zLoad 负载（音箱）标称阻抗；zAmp 功放输出内阻；rLoop 线材回路电阻。
   */
  function damping(o) {
    o = o || {};
    var z = Math.max(1e-6, num(o.zLoad, 8));
    var za = Math.max(0, num(o.zAmp, 0.02));
    var rw = Math.max(0, num(o.rLoop, 0));
    var rs = za + rw;
    var df = z / rs;
    var ratio = z / (z + rs);
    return {
      zLoad: z,
      zAmp: za,
      rLoop: rw,
      zSource: rs,
      /** 阻尼系数 DF = Z_load / Z_source */
      dampingFactor: df,
      /** 线材+功放内阻造成的电压损失（负值，dB） */
      lossDb: db20(ratio),
      /** 实际送达负载的功率 / 无损时的功率 */
      powerRatio: ratio * ratio,
      /** 线材上耗散的功率占比 */
      wireWaste: 1 - ratio * ratio,
      /** 分级评价 */
      grade: df >= 50 ? '优秀' : df >= 20 ? '良好' : df >= 10 ? '可接受' : '偏低（低频控制力下降）',
      /** 线材主导还是功放内阻主导 */
      wireDominant: rw > za
    };
  }

  /**
   * 按约束反算允许线长。
   * @param {object} o { zLoad, zAmp, area, material, maxLossDb, minDamping }
   *   两个约束取更严格者。
   */
  function maxLength(o) {
    o = o || {};
    var z = Math.max(1e-6, num(o.zLoad, 8));
    var za = Math.max(0, num(o.zAmp, 0.02));
    var loss = num(o.maxLossDb, 0.5);
    var minDf = num(o.minDamping, 20);
    var w = wire({ length: 1, area: num(o.area, 2.5), material: o.material || 'copper' });
    var rPerM = w.rLoop; // 每米回路电阻
    // 约束一：线损 ≤ loss → R_source ≤ Z(10^(loss/20) − 1)
    var RsLoss = z * (Math.pow(10, loss / 20) - 1) - za;
    // 约束二：DF ≥ minDf → R_source ≤ Z / minDf
    var RsDf = z / minDf - za;
    var Rs = Math.max(0, Math.min(RsLoss, RsDf));
    return {
      zLoad: z,
      area: w.area,
      material: w.material,
      rLoopPerM: rPerM,
      /** 允许回路电阻 */
      maxRSource: Rs,
      /** 允许线长（单程，m） */
      maxLen: rPerM > 0 ? Rs / rPerM : Infinity,
      limitBy: RsLoss <= RsDf ? 'loss' : 'damping',
      maxLossDb: loss,
      minDamping: minDf
    };
  }

  /* ==================================================================
   * 附加：IEC 60268-5 阻抗下限与分频/频率无关小工具
   * ================================================================== */

  /**
   * IEC 60268-5：扬声器阻抗模的最小值不得低于标称阻抗的 80 %。
   * 同时给出按标称阻抗估算的功放电流与推荐功放功率区间。
   */
  function impedanceCheck(o) {
    o = o || {};
    var zn = Math.max(1e-6, num(o.zNominal, 8));
    var zmin = num(o.zMin, zn * 0.8);
    var ratio = zmin / zn;
    return {
      zNominal: zn,
      zMin: zmin,
      ratio: ratio,
      pass: ratio >= 0.8,
      limit: zn * 0.8,
      /** 以最小阻抗计算功放需提供的峰值电流（给定输出电压） */
      peakCurrent: function (v) { return num(v) / Math.max(1e-6, zmin); },
      /** 常见建议：功放额定功率取音箱连续功率的 1.5~2 倍 */
      ampRange: function (pCont) { return { low: 1.5 * num(pCont), high: 2 * num(pCont) }; }
    };
  }

  return {
    V0_DBV: V0_DBV,
    V0_DBU: V0_DBU,
    P0_DBM: P0_DBM,
    FULL_SCALE: FULL_SCALE,
    LEVEL_PRESETS: LEVEL_PRESETS,
    CONDUCTOR: CONDUCTOR,
    AREA_MM2: AREA_MM2,
    AWG: AWG,
    CREST: CREST,

    dbv: dbv,
    dbu: dbu,
    vFromDbv: vFromDbv,
    vFromDbu: vFromDbu,
    dbfs: dbfs,
    vFromDbfs: vFromDbfs,
    fullScaleVolts: fullScaleVolts,
    watts: watts,
    vFromWatts: vFromWatts,
    dbm: dbm,
    dbw: dbw,
    crestConvert: crestConvert,
    levels: levels,
    fromUnit: fromUnit,

    sensitivity: sensitivity,
    arrayImpedance: arrayImpedance,
    arrayGain: arrayGain,
    ampSpl: ampSpl,
    ampSizing: ampSizing,

    wire: wire,
    wireTable: wireTable,
    damping: damping,
    maxLength: maxLength,
    impedanceCheck: impedanceCheck
  };
});
