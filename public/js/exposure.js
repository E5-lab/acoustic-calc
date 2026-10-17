/*
 * exposure.js — 职业噪声暴露量计算内核 (UMD，Node 可直接 require)
 *
 * 依据（公式与限值均经多源交叉核对）：
 *   - GBZ 2.2-2007《工作场所有害因素职业接触限值 第2部分：物理因素》
 *     稳态/非稳态噪声职业接触限值：L_EX,8h 或 L_EX,40h = 85 dB(A)；
 *     脉冲噪声峰值限值（表10）：n≤100 → 140 dB、100<n≤1000 → 130 dB、1000<n≤10000 → 120 dB。
 *   - GBZ/T 189.8-2007 测量方法；GBZ/T 229.4-2012《工作场所职业病危害作业分级 第4部分：噪声》
 *     连续噪声作业分级（表1）：I 85≤L_EX,8h<90 轻度、II 90≤<95 中度、III 95≤<100 重度、IV ≥100 极重；
 *     脉冲噪声分级（表2）按峰值与日脉冲次数 n 分四级；≥80 且 <85 dB 作业应健康监护。
 *   - NIOSH 98-126：REL = 85 dBA 8-h TWA，3 dB 交换率（等能量），脉冲峰值 140 dB 上限；
 *     延长班次 REL 调整 9/10/11/12 h → 84.5/84.0/83.6/83.2 dBA（= 85 − 10lg(T/8)）。
 *   - OSHA 29 CFR 1910.95：PEL = 90 dBA 8-h TWA、AL = 85 dBA，均 5 dB 交换率；
 *     Table G-16：90/95/100/105/110/115 dB → 8/4/2/1/0.5/0.25 h；峰值 140 dB；
 *     TWA = 90 + 16.61·lg10(D/100)；AL 延长班次调整 = 85 − 16.61·lg10(T/8)（84.1/83.4/82.7/82.1）。
 *   - ISO 9612 等能量：L_EX,8h = 10lg(Σ 10^(L_i/10)·t_i / 8h)。
 *   - ISO 4869-2:2018：SNR 法 L'_A = L_C − SNR_x；APV = m − κ·s（κ=0/1/2 ↔ 50%/84%/98%）。
 *   - 《用人单位劳动防护用品管理规范》：80≤L_EX,8h<85 按需配备；≥85 必须配备；
 *     85~95 dB 选 SNR 17~34 dB；≥95 dB 选 SNR≥34 dB 或双防护（较高值 +5 dB）。
 *   - NRR 折算：OSHA 附录B（A 计权 L−(NRR−7)）、OSHA 技术手册 50% 折减、
 *     NIOSH 98-126 按类型折减（耳罩 25%/慢回弹泡沫耳塞 50%/其他耳塞 70%，A 计权再扣 7 dB）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.Exposure = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LOG10 = Math.log10 || function (x) { return Math.log(x) / Math.LN10; };

  // null/undefined → null（避免 Number(null) === 0 的陷阱）
  function num(v) {
    if (v == null || v === '') { return null; }
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  var REF = { GBZ: 85, NIOSH: 85, OSHA_PEL: 90, OSHA_AL: 85, PEAK_CEILING: 140, HOURS_8: 8 };

  // ------------------------------ 分段暴露 ------------------------------

  // 段：{ L: dB(A), h: 小时 }；h 为接触时间（非工作时段不计）
  function sumEnergy(segs) {
    var s = 0;
    for (var i = 0; i < segs.length; i++) {
      var L = Number(segs[i].L), h = Number(segs[i].h);
      if (!isFinite(L) || !isFinite(h) || h <= 0 || L <= 0) { continue; }
      s += Math.pow(10, L / 10) * h;
    }
    return s;
  }

  function totalHours(segs) {
    var t = 0;
    for (var i = 0; i < segs.length; i++) {
      var h = Number(segs[i].h);
      if (isFinite(h) && h > 0) { t += h; }
    }
    return t;
  }

  // ISO 9612 等能量 8 h 等效连续 A 声级（GBZ 2.2 的 L_EX,8h 同此）
  function lex8h(segs) {
    var e = sumEnergy(segs);
    return e > 0 ? 10 * LOG10(e / 8) : null;
  }

  // 周 40 h 等效（每周工作不足 5 天时按 GBZ 2.2 折算 L_EX,40h）
  function lex40h(segs) {
    var e = sumEnergy(segs);
    return e > 0 ? 10 * LOG10(e / 40) : null;
  }

  // ------------------------------ 剂量与 TWA ------------------------------

  // 允许暴露时间（小时）：3 dB 等能量 / 5 dB 交换率
  function allowedTime(L, criterion) {
    L = Number(L);
    if (!isFinite(L) || L <= 0) { return null; }
    if (criterion === 'osha' || criterion === 'osha-pel') {
      return 8 * Math.pow(2, (REF.OSHA_PEL - L) / 5);
    }
    if (criterion === 'osha-al') {
      return 8 * Math.pow(2, (REF.OSHA_AL - L) / 5);
    }
    return 8 * Math.pow(2, (REF.NIOSH - L) / 3); // 'niosh' 默认
  }

  // 日剂量 % = 100·Σ(t_i/T_i)
  function dose(segs, criterion) {
    var d = 0;
    for (var i = 0; i < segs.length; i++) {
      var L = Number(segs[i].L), h = Number(segs[i].h);
      if (!isFinite(L) || !isFinite(h) || h <= 0) { continue; }
      var T = allowedTime(L, criterion);
      if (T != null && T > 0) { d += h / T; }
    }
    return 100 * d;
  }

  // 由剂量反算 TWA：NIOSH 85+10lg(D/100)（等能量）；OSHA 90/85+16.61·lg(D/100)
  function twaFromDose(d, criterion) {
    d = Number(d);
    if (!isFinite(d) || d <= 0) { return null; }
    if (criterion === 'osha' || criterion === 'osha-pel') { return 90 + 16.61 * LOG10(d / 100); }
    if (criterion === 'osha-al') { return 85 + 16.61 * LOG10(d / 100); }
    return 85 + 10 * LOG10(d / 100);
  }

  // 延长班次限值调整（小时 >8 才有意义）
  function extendedRel(hours, criterion) {
    hours = num(hours);
    if (hours == null || hours <= 8) {
      return criterion === 'osha' || criterion === 'osha-pel' ? 90 : 85;
    }
    if (criterion === 'osha-al') { return 85 - 16.61 * LOG10(hours / 8); }
    if (criterion === 'osha' || criterion === 'osha-pel') { return 90; } // OSHA PEL 不随班次调整
    return 85 - 10 * LOG10(hours / 8); // NIOSH
  }

  // ------------------------------ 判定与分级 ------------------------------

  // GBZ/T 229.4-2012 表1：连续噪声作业分级
  var GRADES = [
    { grade: 'I', lo: 85, hi: 90, label: '轻度危害' },
    { grade: 'II', lo: 90, hi: 95, label: '中度危害' },
    { grade: 'III', lo: 95, hi: 100, label: '重度危害' },
    { grade: 'IV', lo: 100, hi: Infinity, label: '极重危害' }
  ];
  function noiseGrade(lex) {
    lex = num(lex);
    if (lex == null) { return null; }
    if (lex < 80) { return { grade: '—', label: '非噪声作业', watch: false }; }
    if (lex < 85) { return { grade: '监护', label: '健康监护（≥80 且 <85 dB）', watch: true }; }
    for (var i = 0; i < GRADES.length; i++) {
      if (lex >= GRADES[i].lo && lex < GRADES[i].hi) { return GRADES[i]; }
    }
    return GRADES[GRADES.length - 1];
  }

  // GBZ 2.2-2007 表10：脉冲噪声峰值限值（按工作日脉冲次数）
  var PEAK_LIMITS = [
    { maxN: 100, peak: 140 },
    { maxN: 1000, peak: 130 },
    { maxN: 10000, peak: 120 }
  ];
  function peakLimit(count) {
    count = num(count);
    if (count == null || count < 0) { return null; }
    for (var i = 0; i < PEAK_LIMITS.length; i++) {
      if (count <= PEAK_LIMITS[i].maxN) { return PEAK_LIMITS[i].peak; }
    }
    return null; // 超过 10000 次/日超出表列范围
  }

  // GBZ/T 229.4-2012 表2：脉冲噪声作业分级（峰值 + 日脉冲次数）
  var PEAK_GRADE_RANGES = [
    { maxN: 100, rows: [[140.0, 142.5, 'I'], [142.5, 145.0, 'II'], [145.0, 147.5, 'III'], [147.5, Infinity, 'IV']] },
    { maxN: 1000, rows: [[130.0, 132.5, 'I'], [132.5, 135.0, 'II'], [135.0, 137.5, 'III'], [137.5, Infinity, 'IV']] },
    { maxN: 10000, rows: [[120.0, 122.5, 'I'], [122.5, 125.0, 'II'], [125.0, 127.5, 'III'], [127.5, Infinity, 'IV']] }
  ];
  var GRADE_LABELS = { I: '轻度危害', II: '中度危害', III: '重度危害', IV: '极重危害' };
  function peakGrade(peak, count) {
    peak = num(peak); count = num(count);
    if (peak == null || count == null || count < 0) { return null; }
    var band = null;
    for (var i = 0; i < PEAK_GRADE_RANGES.length; i++) {
      if (count <= PEAK_GRADE_RANGES[i].maxN) { band = PEAK_GRADE_RANGES[i]; break; }
    }
    if (!band) { return null; }
    for (var j = 0; j < band.rows.length; j++) {
      var r = band.rows[j];
      if (peak >= r[0] && peak < r[1]) {
        return { grade: r[2], label: GRADE_LABELS[r[2]] };
      }
    }
    return null;
  }

  // ------------------------------ 护听器 ------------------------------

  // 《用人单位劳动防护用品管理规范》三档配备要求
  var PPE_RULES = [
    { lo: 80, hi: 85, text: '按劳动者需求为其配备适用的护听器' },
    { lo: 85, hi: 95, text: '必须配备适用的护听器并指导正确佩戴；应选用 SNR 17~34 dB 的耳塞或耳罩' },
    { lo: 95, hi: Infinity, text: '应选用 SNR ≥34 dB 的耳塞、耳罩，或同时佩戴耳塞和耳罩（双防护）' }
  ];
  function ppeAdvice(lex) {
    lex = num(lex);
    if (lex == null) { return null; }
    if (lex < 80) {
      return { need: false, text: 'L_EX,8h < 80 dB：一般不要求配备护听器（无噪声作业分级）' };
    }
    for (var i = 0; i < PPE_RULES.length; i++) {
      if (lex >= PPE_RULES[i].lo && lex < PPE_RULES[i].hi) {
        return { need: true, text: PPE_RULES[i].text };
      }
    }
    return { need: true, text: PPE_RULES[PPE_RULES.length - 1].text };
  }

  // 双防护：按较高声衰减值 +5 dB 估算（管理规范）
  function dualAttenuation(a, b) {
    a = Number(a); b = Number(b);
    if (!isFinite(a)) { return isFinite(b) ? b : null; }
    if (!isFinite(b)) { return a; }
    return Math.max(a, b) + 5;
  }

  // NRR 折算后的有效 A 计权声级（佩戴后估计暴露级）
  var NRR_TYPES = [
    { id: 'muff', label: '耳罩', niosh: 0.25 },
    { id: 'foam', label: '慢回弹泡沫耳塞', niosh: 0.50 },
    { id: 'plug', label: '其他耳塞（预成型/硅胶/定制等）', niosh: 0.70 }
  ];
  function nrrType(id) {
    for (var i = 0; i < NRR_TYPES.length; i++) { if (NRR_TYPES[i].id === id) { return NRR_TYPES[i]; } }
    return null;
  }
  // method: 'osha'（1910.95 附录B）/ 'osha-otm'（技术手册 50% 折减）/ 'niosh'（98-126 按类型）
  // weighted: 'A' 或 'C'（输入声级的计权）
  // 依据（NIOSH 论文 Four Earplugs in Search of a Rating System 汇总）：
  //   OSHA OTM：ENL_C = L_C − 0.5·NRR；ENL_A = L_A − 0.5·(NRR − 7)（7 dB 也被折半）
  //   NIOSH：ENL_C = L_C − (1−d)·NRR；ENL_A = L_A − [(1−d)·NRR − 7]（7 dB 不折减）
  //   OSHA 附录B：ENL_A = L_A − (NRR − 7)（不折减）
  function protectedNrr(level, nrr, typeId, method, weighted) {
    if (level == null || nrr == null) { return null; }
    level = Number(level); nrr = Number(nrr);
    if (!isFinite(level) || !isFinite(nrr)) { return null; }
    var derate = 0;
    if (method === 'niosh') {
      var t = nrrType(typeId);
      derate = t ? t.niosh : 0.25;
    } else if (method === 'osha-otm') { derate = 0.5; }
    if (weighted === 'C') { return level - (1 - derate) * nrr; }
    // A 计权输入：C−A 补偿 7 dB（NIOSH/EPA）
    if (method === 'osha') { return level - (nrr - 7); }
    if (method === 'osha-otm') { return level - (1 - derate) * (nrr - 7); }
    return level - ((1 - derate) * nrr - 7);
  }

  // ISO 4869-2 SNR 法：L'_A = L_C − SNR_x（derate 为现场折减，HSE 惯例取 4 dB）
  function protectedSnr(levelC, snr, derate) {
    if (levelC == null || snr == null) { return null; }
    levelC = Number(levelC); snr = Number(snr); derate = Number(derate) || 0;
    if (!isFinite(levelC) || !isFinite(snr)) { return null; }
    return levelC - Math.max(0, snr - derate);
  }

  // 达标目标级所需 SNR：SNR ≥ L_C − target + derate
  function requiredSnr(levelC, target, derate) {
    if (levelC == null || target == null) { return null; }
    levelC = Number(levelC); target = Number(target); derate = Number(derate) || 0;
    if (!isFinite(levelC) || !isFinite(target)) { return null; }
    return Math.max(0, levelC - target + derate);
  }

  // ------------------------------ 解析与例题 ------------------------------

  // "90,4; 95,2" 或 "90 4\n95 2" → [{L,h}]
  function parseSegments(text) {
    var segs = [], bad = [];
    String(text == null ? '' : text).split(/[\n;；]+/).forEach(function (line) {
      var s = line.trim();
      if (!s) { return; }
      var m = s.match(/^(\d+(?:\.\d+)?)\s*[,，\s]\s*(\d+(?:\.\d+)?)$/);
      if (!m) { bad.push(s); return; }
      var L = parseFloat(m[1]), h = parseFloat(m[2]);
      if (L <= 0 || h <= 0) { bad.push(s); return; }
      segs.push({ L: L, h: h });
    });
    return { segments: segs, bad: bad };
  }

  function exampleSegments() {
    return [
      { L: 88, h: 4 },   // 机加工岗位
      { L: 95, h: 2 },   // 冲压岗位
      { L: 82, h: 2 }    // 辅助作业
    ];
  }

  return {
    REF: REF,
    GRADES: GRADES,
    GRADE_LABELS: GRADE_LABELS,
    PEAK_LIMITS: PEAK_LIMITS,
    PPE_RULES: PPE_RULES,
    NRR_TYPES: NRR_TYPES,
    sumEnergy: sumEnergy,
    totalHours: totalHours,
    lex8h: lex8h,
    lex40h: lex40h,
    allowedTime: allowedTime,
    dose: dose,
    twaFromDose: twaFromDose,
    extendedRel: extendedRel,
    noiseGrade: noiseGrade,
    peakLimit: peakLimit,
    peakGrade: peakGrade,
    ppeAdvice: ppeAdvice,
    dualAttenuation: dualAttenuation,
    nrrType: nrrType,
    protectedNrr: protectedNrr,
    protectedSnr: protectedSnr,
    requiredSnr: requiredSnr,
    parseSegments: parseSegments,
    exampleSegments: exampleSegments
  };
});
