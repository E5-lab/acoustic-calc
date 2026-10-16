/*
 * hearing.js — 听觉与听阈内核（#/hearing）
 *
 * 与 #/psycho（响度 sone / Bark / 粗糙度 / 抖动 / STIPA）互补，本内核聚焦
 * 「听力计量」侧：听阈与等响、年龄退化、听力图分级、临界带与掩蔽。
 *
 *   1) ISO 226:2003 正常等响曲线：phon ↔ dB SPL 双向换算（解析式 + 参数表）
 *   2) ISO 7029:2017 年龄相关听阈统计：中位数阈移 ΔH_md,Y = α·(Y−18)^β
 *   3) WHO 2021 听力损失分级：较好耳 PTA4（500/1k/2k/4k）→ 等级
 *   4) 听力零级：ISO 389 / GB/T 4854.1 的 RETSPL（TDH-39，dB HL ↔ dB SPL）
 *   5) 临界带：Zwicker Bark 刻度与临界带宽，ERB（Moore）对照
 *   6) 掩蔽：带内平顶 + 上/下扩散斜率（可调）的简化模型
 *
 * UMD：浏览器 window.Hearing，Node require('./hearing.js')。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Hearing = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function lg(x) { return Math.log(x) / Math.LN10; }
  function r1(v) { return v == null ? null : Math.round(v * 10) / 10; }
  function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }

  /* ==================================================================
   * 1) ISO 226:2003 正常等响级曲线
   * ------------------------------------------------------------------
   * 参数表（Table 1，ISO 266 三分之一倍频程频点）：
   *   f (Hz): α_f, L_U (dB), T_f (dB)
   * 正向（声压级 → 响度级）：
   *   A_f = 10^( α_f·(L_p + L_U − 94)/10 )
   *   L_N = 40·lg( 1.15 + (A_f − B_f)/4.47e-3 )          [phon]
   * 反向（响度级 → 声压级）：
   *   A_f = 4.47e-3·(10^(0.025·L_N) − 1.15) + B_f
   *   L_p = (10/α_f)·lg(A_f) − L_U + 94                  [dB]
   * 其中 B_f = [0.4·10^((T_f+L_U)/10 − 9)]^α_f
   * （T_f 即自由场听阈，与 ISO 389-7 表列值一致）
   *
   * 适用范围：20 Hz~12.5 kHz；20~90 phon（20 Hz~4 kHz）、20~80 phon（5~12.5 kHz）；
   * 20 phon 以下仅具参考性（该区间缺乏实验数据）。
   * ================================================================== */

  var ISO226 = [
    [20, 0.532, -31.6, 78.5], [25, 0.506, -27.2, 68.7], [31.5, 0.480, -23.0, 59.5],
    [40, 0.455, -19.1, 51.1], [50, 0.432, -15.9, 44.0], [63, 0.409, -13.0, 37.5],
    [80, 0.387, -10.3, 31.5], [100, 0.367, -8.1, 26.5], [125, 0.349, -6.2, 22.1],
    [160, 0.330, -4.5, 17.9], [200, 0.315, -3.1, 14.4], [250, 0.301, -2.0, 11.4],
    [315, 0.288, -1.1, 8.6], [400, 0.276, -0.4, 6.2], [500, 0.267, 0.0, 4.4],
    [630, 0.259, 0.3, 3.0], [800, 0.253, 0.5, 2.2], [1000, 0.250, 0.0, 2.4],
    [1250, 0.246, -2.7, 3.5], [1600, 0.244, -4.1, 1.7], [2000, 0.243, -1.0, -1.3],
    [2500, 0.243, 1.7, -4.2], [3150, 0.243, 2.5, -6.0], [4000, 0.242, 1.2, -5.4],
    [5000, 0.242, -2.1, -1.5], [6300, 0.245, -7.1, 6.0], [8000, 0.254, -11.2, 12.6],
    [10000, 0.271, -10.7, 13.9], [12500, 0.301, -3.1, 12.3]
  ];

  /** 取参数；非表列频率在相邻两点间按对数频率线性插值（isExact 标记是否落在表列点上） */
  function iso226Params(f) {
    var x = num(f);
    if (x == null || x <= 0) return null;
    if (x < ISO226[0][0] || x > ISO226[ISO226.length - 1][0]) return null;
    var i = 0;
    while (i < ISO226.length - 1 && ISO226[i + 1][0] < x) i++;
    var lo = ISO226[i], hi = ISO226[Math.min(i + 1, ISO226.length - 1)];
    if (Math.abs(hi[0] - lo[0]) < 1e-9 || Math.abs(x - lo[0]) < 1e-9) {
      return { f: x, alpha: lo[1], lu: lo[2], tf: lo[3], isExact: Math.abs(x - lo[0]) < 1e-9 };
    }
    var t = (lg(x) - lg(lo[0])) / (lg(hi[0]) - lg(lo[0]));
    return {
      f: x,
      alpha: lo[1] + t * (hi[1] - lo[1]),
      lu: lo[2] + t * (hi[2] - lo[2]),
      tf: lo[3] + t * (hi[3] - lo[3]),
      isExact: false
    };
  }

  /** B_f = [0.4·10^((T_f+L_U)/10 − 9)]^α_f */
  function bTerm(p) { return Math.pow(0.4 * Math.pow(10, (p.tf + p.lu) / 10 - 9), p.alpha); }

  /** phon 适用范围：[20, 90]（≤4 kHz）/ [20, 80]（>4 kHz）；20 phon 以下仅参考 */
  function phonRange(p) {
    var hi = p.f <= 4000 ? 90 : 80;
    return { min: 20, max: hi };
  }

  /** 声压级 L_p (dB) → 响度级 L_N (phon)；超出适用范围给出 warn */
  function splToPhon(f, spl) {
    var p = iso226Params(f), lp = num(spl);
    if (!p || lp == null) return null;
    var A = Math.pow(10, p.alpha * (lp + p.lu - 94) / 10);
    var B = bTerm(p);
    var inner = 1.15 + (A - B) / 4.47e-3;
    var phon = 40 * lg(Math.max(inner, 1e-12));
    var rg = phonRange(p);
    return {
      f: p.f, spl: r1(lp), phon: r2(phon),
      valid: phon >= rg.min - 1e-9 && phon <= rg.max + 1e-9,
      range: rg, exact: p.isExact
    };
  }

  /** 响度级 L_N (phon) → 声压级 L_p (dB) */
  function phonToSpl(f, phon) {
    var p = iso226Params(f), ln = num(phon);
    if (!p || ln == null) return null;
    var A = 4.47e-3 * (Math.pow(10, 0.025 * ln) - 1.15) + bTerm(p);
    if (!(A > 0)) return null;
    var spl = (10 / p.alpha) * lg(A) - p.lu + 94;
    var rg = phonRange(p);
    return {
      f: p.f, phon: r1(ln), spl: r2(spl),
      valid: ln >= rg.min - 1e-9 && ln <= rg.max + 1e-9,
      range: rg, exact: p.isExact
    };
  }

  /** 整条等响曲线（ISO 226 表列频点）：phon → [{f, spl}] */
  function contour(phon) {
    var ln = num(phon);
    if (ln == null) return null;
    return ISO226.map(function (row) {
      var r = phonToSpl(row[0], ln);
      return { f: row[0], spl: r ? r.spl : null };
    });
  }

  /** 自由场听阈 T_f（ISO 389-7 表列，与 ISO 226 T_f 列一致），dB SPL */
  function freeThreshold(f) {
    var p = iso226Params(f);
    return p ? r1(p.tf) : null;
  }

  /* ==================================================================
   * 2) ISO 7029:2017 年龄相关听阈（中位数）
   * ------------------------------------------------------------------
   * ΔH_md,Y = α_md·(Y − 18)^β_md   [dB]
   * 适用：Y = 18~80 岁，125 Hz~8 kHz；
   * 3 kHz 以上且 Y > 70 岁的数值仅具参考性（受试者「出表」截断）。
   * 人群：耳科检查正常的筛选人群（无过度噪声暴露 / 耳毒性药物 / 家族史）。
   * ================================================================== */

  var ISO7029 = [
    { f: 125, am: 2.50e-6, bm: 3.841, af: 6.16e-4, bf: 2.451 },
    { f: 250, am: 1.39e-4, bm: 2.832, af: 3.98e-4, bf: 2.568 },
    { f: 500, am: 4.59e-4, bm: 2.537, af: 2.61e-4, bf: 2.708 },
    { f: 750, am: 5.70e-4, bm: 2.512, af: 2.25e-4, bf: 2.775 },
    { f: 1000, am: 7.02e-4, bm: 2.494, af: 2.21e-4, bf: 2.805 },
    { f: 1500, am: 1.09e-3, bm: 2.446, af: 2.53e-4, bf: 2.813 },
    { f: 2000, am: 1.56e-3, bm: 2.404, af: 7.32e-4, bf: 2.792 },
    { f: 3000, am: 2.54e-3, bm: 2.350, af: 4.88e-4, bf: 2.728 },
    { f: 4000, am: 3.40e-3, bm: 2.325, af: 7.37e-4, bf: 2.660 },
    { f: 6000, am: 4.53e-3, bm: 2.315, af: 1.47e-3, bf: 2.539 },
    { f: 8000, am: 5.06e-3, bm: 2.328, af: 2.53e-3, bf: 2.439 }
  ];

  /** 中位数阈移表：ageShift(age, sex) → [{f, shift, informative}] */
  function ageShift(age, sex) {
    var y = num(age), s = String(sex || 'male').toLowerCase();
    var female = s.charAt(0) === 'f';
    if (y == null) return null;
    if (y < 18) return { error: 'age-below-18', age: y };
    var d = y - 18;
    var rows = ISO7029.map(function (row) {
      var a = female ? row.af : row.am, b = female ? row.bf : row.bm;
      return {
        f: row.f,
        shift: r2(a * Math.pow(d, b)),
        informative: !(row.f >= 3000 && y > 70)
      };
    });
    return {
      age: y, sex: female ? 'female' : 'male',
      inRange: y <= 80,
      rows: rows
    };
  }

  /** 单点中位数阈移 */
  function ageShiftAt(age, f, sex) {
    var t = ageShift(age, sex);
    if (!t || t.error) return null;
    var row = t.rows.filter(function (r) { return r.f === num(f); })[0];
    return row ? row.shift : null;
  }

  /* ==================================================================
   * 3) WHO 2021 听力损失分级（World Report on Hearing）
   * ------------------------------------------------------------------
   * 取较好耳 500/1k/2k/4k 四频平均（PTA4，dB HL）：
   *   <20 正常 | 20~<35 轻度 | 35~<50 中度 | 50~<65 中重度
   *   65~<80 重度 | 80~<95 极重度 | ≥95 全聋
   * ================================================================== */

  var WHO_GRADES = [
    { max: 20, grade: 0, name: '正常', en: 'Normal hearing', quiet: '对各类声音均无困难', noisy: '安静与嘈杂环境均无明显困难' },
    { max: 35, grade: 1, name: '轻度', en: 'Mild', quiet: '听轻声谈话无困难', noisy: '嘈杂环境中听谈话可能有困难' },
    { max: 50, grade: 2, name: '中度', en: 'Moderate', quiet: '听日常谈话可能有困难', noisy: '听清并参与交谈有困难' },
    { max: 65, grade: 3, name: '中重度', en: 'Moderately severe', quiet: '听日常谈话困难，可听清大声呼喊', noisy: '大部分谈话难以听清并参与' },
    { max: 80, grade: 4, name: '重度', en: 'Severe', quiet: '大部分谈话声听不到，提高音量也可能困难', noisy: '极难听清语音并参与交谈' },
    { max: 95, grade: 5, name: '极重度', en: 'Profound', quiet: '仅能听到喊声或极强的环境声', noisy: '谈话声无法听见' },
    { max: Infinity, grade: 6, name: '全聋', en: 'Complete / total', quiet: '听不到语音与多数环境声', noisy: '听不到语音与多数环境声' }
  ];

  /** PTA4 = 500/1000/2000/4000 Hz 四个听阈的算术平均（缺失频率按有效项平均） */
  function pta4(thresholds) {
    var keys = [500, 1000, 2000, 4000], vals = [], used = [];
    keys.forEach(function (k) {
      var v = num(thresholds[k]);
      if (v != null) { vals.push(v); used.push(k); }
    });
    if (!vals.length) return null;
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    return { pta: r2(sum / vals.length), used: used, complete: used.length === 4 };
  }

  /** 单耳分级 */
  function gradeOf(pta) {
    var p = num(pta);
    if (p == null) return null;
    var g = WHO_GRADES.filter(function (x) { return p < x.max; })[0];
    return { pta: r2(p), grade: g.grade, name: g.name, en: g.en, quiet: g.quiet, noisy: g.noisy };
  }

  /**
   * 双耳分级：{left, right, better, worse, unilateral}
   * thresholds: { 500: dB, 1000: …, 2000: …, 4000: … }（dB HL）
   */
  function gradeBoth(earL, earR) {
    var l = pta4(earL), r = pta4(earR);
    if (!l && !r) return null;
    var gl = l ? gradeOf(l.pta) : null, gr = r ? gradeOf(r.pta) : null;
    var better = gl && gr ? (gl.pta <= gr.pta ? { ear: '左', g: gl } : { ear: '右', g: gr })
      : gl ? { ear: '左', g: gl } : { ear: '右', g: gr };
    var worse = gl && gr ? (gl.pta <= gr.pta ? { ear: '右', g: gr } : { ear: '左', g: gl }) : null;
    var uni = gl && gr && better.g.pta < 20 && worse.g.pta >= 35;
    return {
      left: gl, right: gr, better: better, worse: worse,
      unilateral: uni,
      unilateralNote: uni ? '较好耳正常而较差耳 ≥35 dB，属单侧听力损失：声源定位与嘈杂环境言语识别会受影响。' : null
    };
  }

  /* ==================================================================
   * 4) 听力零级 RETSPL（ISO 389-1 / GB/T 4854.1，TDH-39 + IEC 303 耦合腔）
   * ------------------------------------------------------------------
   * dB HL → dB SPL：L_SPL = L_HL + RETSPL(f)
   * ================================================================== */

  var RETSPL_TDH39 = {
    125: 45.0, 250: 25.5, 500: 11.5, 750: 8.0, 1000: 7.0, 1500: 6.5,
    2000: 9.0, 3000: 10.0, 4000: 9.5, 6000: 15.5, 8000: 13.0
  };

  function retspl(f) {
    var x = num(f);
    if (x == null) return null;
    var keys = Object.keys(RETSPL_TDH39).map(Number).sort(function (a, b) { return a - b; });
    if (x < keys[0] || x > keys[keys.length - 1]) return null;
    for (var i = 0; i < keys.length; i++) {
      if (Math.abs(x - keys[i]) < 1e-9) return { f: keys[i], spl: RETSPL_TDH39[keys[i]], exact: true };
    }
    // 对数频率线性插值
    var j = 0;
    while (j < keys.length - 1 && keys[j + 1] < x) j++;
    var lo = keys[j], hi = keys[j + 1];
    var t = (lg(x) - lg(lo)) / (lg(hi) - lg(lo));
    return { f: x, spl: r1(RETSPL_TDH39[lo] + t * (RETSPL_TDH39[hi] - RETSPL_TDH39[lo])), exact: false };
  }

  function hlToSpl(f, hl) {
    var r = retspl(f), v = num(hl);
    if (!r || v == null) return null;
    return { f: r.f, hl: v, spl: r2(v + r.spl), exact: r.exact };
  }

  /* ==================================================================
   * 5) 临界带（Zwicker）与 ERB（Moore & Glasberg）
   * ------------------------------------------------------------------
   *   z(f)   = 13·atan(0.00076·f) + 3.5·atan((f/7500)²)     [Bark]
   *   Δf(f)  = 25 + 75·(1 + 1.4·(f/1000)²)^0.69              [Hz]
   *   ERB(f) = 24.7·(0.00437·f + 1)                          [Hz]
   * ================================================================== */

  function bark(f) {
    var x = num(f);
    if (x == null || x <= 0) return null;
    return 13 * Math.atan(0.00076 * x) + 3.5 * Math.atan(Math.pow(x / 7500, 2));
  }

  function criticalBand(f) {
    var x = num(f);
    if (x == null || x <= 0) return null;
    var z = bark(x);
    var bw = 25 + 75 * Math.pow(1 + 1.4 * Math.pow(x / 1000, 2), 0.69);
    return { f: x, z: r2(z), bw: r1(bw), f1: r1(x - bw / 2), f2: r1(x + bw / 2), bark: z };
  }

  function erb(f) {
    var x = num(f);
    if (x == null || x <= 0) return null;
    return { f: x, erb: r1(24.7 * (0.00437 * x + 1)), erbs: r2(21.4 * lg(4.37 * x / 1000 + 1)) };
  }

  /* ==================================================================
   * 6) 掩蔽（简化扩散模型）
   * ------------------------------------------------------------------
   * 假设：掩蔽声为中心频率 f_m、声级 L_m 的窄带噪声；
   *   带内（|f_t − f_m| ≤ Δf/2）平顶，掩蔽阈 = L_m；
   *   低于掩蔽声：−27 dB/Bark（Zwicker 经典下扩散斜率）；
   *   高于掩蔽声：可调，默认 −20 dB/Bark（中声级典型值，高声级时更缓）。
   * 该模型用于教学与量级判断，不替代 GB/T 或响度模型的精细计算。
   * ================================================================== */

  function masking(maskerF, maskerL, testF, opts) {
    var o = opts || {};
    var mf = num(maskerF), ml = num(maskerL), tf = num(testF);
    if (mf == null || ml == null || tf == null || mf <= 0 || tf <= 0) return null;
    var lower = o.lowerSlope == null ? -27 : o.lowerSlope;   // dB/Bark
    var upper = o.upperSlope == null ? -20 : o.upperSlope;   // dB/Bark
    var cb = criticalBand(mf);
    var zM = cb.bark, zT = bark(tf);
    var df = tf - mf, dz = zT - zM;
    var flat = Math.abs(df) <= cb.bw / 2 + 1e-9;
    var thr;
    if (flat) thr = ml;
    else if (df < 0) thr = ml + lower * (-dz);   // dz<0 → −27·|dz|
    else thr = ml + upper * dz;
    thr = Math.max(0, Math.min(ml, thr));
    return {
      maskerF: mf, maskerL: r1(ml), testF: tf,
      dz: r2(dz), dfHz: r1(df),
      criticalBw: cb.bw, zMasker: r2(zM), zTest: r2(zT),
      flat: flat,
      threshold: r1(thr),
      margin: r1(thr - 0), // 相对 0 dB 的掩蔽阈余量
      slopes: { lower: lower, upper: upper }
    };
  }

  /** 掩蔽阈随频率的扩散曲线（绘图用）：freqs 为 Hz 数组 */
  function maskingSpread(maskerF, maskerL, freqs, opts) {
    var mf = num(maskerF), ml = num(maskerL);
    if (mf == null || ml == null || mf <= 0 || !freqs || !freqs.length) return null;
    return freqs.map(function (f) {
      var m = masking(mf, ml, f, opts);
      return { f: f, threshold: m ? m.threshold : null, flat: m ? m.flat : false };
    });
  }

  return {
    // ISO 226
    ISO226_TABLE: ISO226,
    iso226Params: iso226Params,
    splToPhon: splToPhon,
    phonToSpl: phonToSpl,
    contour: contour,
    freeThreshold: freeThreshold,
    // ISO 7029
    ISO7029_TABLE: ISO7029,
    ageShift: ageShift,
    ageShiftAt: ageShiftAt,
    // WHO 分级
    WHO_GRADES: WHO_GRADES,
    pta4: pta4,
    gradeOf: gradeOf,
    gradeBoth: gradeBoth,
    // 听力零级
    RETSPL_TDH39: RETSPL_TDH39,
    retspl: retspl,
    hlToSpl: hlToSpl,
    // 临界带与掩蔽
    bark: bark,
    criticalBand: criticalBand,
    erb: erb,
    masking: masking,
    maskingSpread: maskingSpread
  };
});
