/*
 * leakage.js — 孔洞缝隙漏声与门窗隔声估算内核（UMD，Node 可直接 require）
 *
 * 覆盖五类问题：
 *   1) 孔洞 / 缝隙漏声：小孔声质量模型 + 面积加权组合隔声（含倍频带曲线）
 *   2) 缝隙影响速算：ΔR = 10lg[(1 + (S₀/S_c)·10^(0.1R₀)) / (1 + S₀/S_c)]
 *   3) 组合构件隔声：墙 + 门 + 窗 + 孔洞的面积加权能量平均与薄弱环节分析
 *   4) 门窗构件估算：单层板质量定律 / 中空玻璃 / 夹层玻璃 / 双层板（含 f₀ 共振）
 *   5) 常用门窗传声损失曲线数据表：单玻 / 中空 / 夹层 / 中空夹胶 / 整窗
 *      （合成模型生成逐倍频带曲线，Rw 锚点取自公开实测统计）
 *
 * 公式出处（均经多源交叉核对）：
 *   - 单孔透射（声质量模型，穿孔板声学理论）：
 *       τ = 4 / (4 + (k·L)²)，L = t + (8/3π)·d，k = 2πf/c
 *     其中 (8/3π)d = 0.849d 为孔口两端活塞端修正（总附加长度）。
 *     低频极限 τ→1（孔洞全透射），隔声量随频率上升——孔洞为组合隔声
 *     设天花板：R_cap ≈ 10lg(S_c/S_hole)。
 *   - 缝隙影响 ΔR 公式见 GB 50118 配套《建筑室内噪声级报告书》式 7.4.5
 *     （S₀/S_c 为缝隙面积比；τ_缝隙 ≈ 1 假设）。
 *   - 单层墙质量定律：R = 20lg(m·f) − 48 dB（本站 stc 模块同一约定，
 *     m 单位 kg/m²，f 单位 Hz；面密度或频率翻倍 +6 dB）。
 *   - 玻璃/轻质单板：R = 13.5·lg m + 13（《建筑隔声设计——空气声隔声技术》
 *     经验式，用于门窗玻璃与轻板）。
 *   - 中空玻璃：R = 13.5·lg(m₁+m₂) + 13 + ΔR_air，空气层 ≤100 mm 时
 *     ΔR_air ≈ 0.1·d(mm)（瑞典技术大学试验参数曲线近似）。
 *   - 夹层玻璃 PVB 膜附加：0.38/0.76/1.14/1.52 mm → +4/5.5/6/7 dB。
 *   - 双层板共振：f₀ = 60·√[(m₁+m₂)/(m₁·m₂·d)] Hz（m kg/m²，d m；
 *     等价 f₀ = (c/2π)√[(ρ/d)(1/m₁+1/m₂)]，ρ=1.2、c≈343）。
 *     低于 f₀ 两层耦合如单层（总面密度）；高于 f₀ 才谈得上附加隔声量。
 *   - 双层墙附加隔声量表（《建筑隔声设计》经验值，中频平均）：
 *     纸面石膏板双层墙：d=100/120/140/150/180/200/300 mm → 9/10/10.5/11/11.4/11.6/11.8 dB
 *     加气混凝土双层墙：d=100/120/140/150/180/200/300 mm → 10/11/11.8/12/13/13.8/16 dB
 *     空腔填吸声棉（75 mm 腔填 50 mm 棉）约再 +5 dB。
 *   - GB 50118-2010《民用建筑隔声设计规范》表 4.2.5/4.2.6 等；
 *     GB 55038-2025《住宅项目规范》隔声提升条款。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Leakage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C_AIR = 343;                 // 空气中声速（m/s，约 20 ℃）
  var RHO = 1.2;                   // 空气密度（kg/m³）
  var OCTAVE_HZ = [125, 250, 500, 1000, 2000, 4000];

  function num(v) { return (v == null || v === '' || isNaN(v)) ? null : Number(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  // ---------------------------------------------------------------- 孔洞 / 缝隙

  /*
   * 单个孔口（或单位面积缝隙）的透射损失 TL(dB)
   * dMm 孔径/缝宽（mm），tMm 板厚/缝深（mm），f 频率（Hz）
   * 推导：Z_mass = jωρL，负载两侧辐射阻 → τ = 4/(4+(kL)²)
   */
  function apertureTl(dMm, tMm, f) {
    var d = num(dMm), t = num(tMm);
    if (d == null || t == null || d <= 0 || t < 0 || !(f > 0)) return null;
    var L = (t + (8 / (3 * Math.PI)) * d) / 1000;      // 有效空气柱长（m）
    var k = 2 * Math.PI * f / C_AIR;
    return 10 * Math.log10(1 + (k * L) * (k * L) / 4);
  }

  /*
   * 孔口总面积（m²）
   * kind: 'circle'（圆孔，dMm 孔径 × n 个）
   *       'square'（方孔，边长 dMm × n 个）
   *       'slit'（通长缝，wMm 宽 × lengthM 长）
   */
  function apertureArea(o) {
    var d = num(o.dMm), n = num(o.n) || 1;
    if (o.kind === 'slit') {
      var w = num(o.wMm), len = num(o.lengthM);
      if (w == null || len == null || w <= 0 || len <= 0) return null;
      return w / 1000 * len;
    }
    if (d == null || d <= 0 || n <= 0) return null;
    var one = o.kind === 'square' ? (d / 1000) * (d / 1000) : Math.PI * Math.pow(d / 1000, 2) / 4;
    return one * n;
  }

  /*
   * 含孔洞构件的逐频带组合隔声
   * o: { areaTotal（m²）, wallR0（fn(f)→dB 或 null）, wallFlat（dB，wallR0 为 null 时各频带取此值）,
   *     holeTl（fn(f)→dB）, holeArea（m²） }
   * 返回 { bands, wallR[], holeTl[], combR[], capR }
   * capR = 10lg(S_c/S_h)：孔洞全透射时组合隔声的上限（天花板）
   */
  function apertureCombination(o) {
    var Sc = num(o.areaTotal);
    var Sh = num(o.holeArea);
    if (Sc == null || Sc <= 0 || Sh == null || Sh < 0) return { ok: false, error: '请给出构件总面积与孔洞面积' };
    if (Sh >= Sc) return { ok: false, error: '孔洞面积不能大于等于构件总面积' };
    var Sw = Sc - Sh;
    var wallR = [], holeTl = [], combR = [];
    for (var i = 0; i < OCTAVE_HZ.length; i++) {
      var f = OCTAVE_HZ[i];
      var r0 = o.wallR0 ? o.wallR0(f) : (o.wallFlat == null ? null : o.wallFlat);
      var th = o.holeTl ? o.holeTl(f) : null;
      if (r0 == null || th == null) return { ok: false, error: '第 ' + f + ' Hz 缺少输入' };
      var tauW = Math.pow(10, -r0 / 10), tauH = Math.pow(10, -th / 10);
      var tau = (Sw * tauW + Sh * tauH) / Sc;
      wallR.push(r0); holeTl.push(th); combR.push(-10 * Math.log10(tau));
    }
    return {
      ok: true, bands: OCTAVE_HZ.slice(),
      wallR: wallR, holeTl: holeTl, combR: combR,
      capR: 10 * Math.log10(Sc / Sh)
    };
  }

  /*
   * 缝隙影响速算（公式 7.4.5）
   * R0 原构件隔声量（dB），S0 缝隙面积（m²），Sc 组合墙面积（m²）
   * 返回 { deltaR, actualR, ratio }——actualR = R0 − deltaR
   */
  function gapDeltaR(R0, S0, Sc) {
    var r0 = num(R0), s0 = num(S0), sc = num(Sc);
    if (r0 == null || s0 == null || sc == null || sc <= 0) return { ok: false, error: '请给出完整的隔声量、缝隙面积与组合墙面积' };
    if (s0 < 0 || s0 >= sc) return { ok: false, error: '缝隙面积应在 0 与组合墙面积之间' };
    var e = s0 / sc;
    var delta = 10 * Math.log10((1 + e * Math.pow(10, 0.1 * r0)) / (1 + e));
    return { ok: true, deltaR: delta, actualR: r0 - delta, ratio: e };
  }

  /*
   * 孔洞面积比 → 隔声量天花板（孔洞全透射假设）
   * R_cap = 10lg(S_c/S_hole)
   */
  function leakCap(Sc, Sh) {
    var sc = num(Sc), sh = num(Sh);
    if (sc == null || sh == null || sc <= 0 || sh <= 0) return null;
    if (sh >= sc) return 0;
    return 10 * Math.log10(sc / sh);
  }

  // ---------------------------------------------------------------- 组合构件

  /*
   * 组合构件（面积加权能量平均）
   * parts: [{ name, area（m²）, R（dB） }]
   * τ_total = Σ(S_i·τ_i)/ΣS_i；R = −10lg τ_total
   * 返回 { ok, area, R, tau, parts（含透射能占比 share）, weakest }
   */
  function combine(parts) {
    if (!parts || !parts.length) return { ok: false, error: '请至少输入一个构件' };
    var S = 0, tauS = 0, rows = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = num(p.area), R = num(p.R);
      if (a == null || a <= 0) return { ok: false, error: '「' + p.name + '」面积应为正数' };
      if (R == null) return { ok: false, error: '「' + p.name + '」缺少隔声量' };
      var tau = Math.pow(10, -R / 10);
      S += a; tauS += a * tau;
      rows.push({ name: p.name, area: a, R: R, tau: tau });
    }
    var tau = tauS / S;
    rows.forEach(function (r) { r.share = r.area * r.tau / tauS; });
    rows.sort(function (x, y) { return y.share - x.share; });
    return {
      ok: true, area: S, tau: tau, R: -10 * Math.log10(tau),
      parts: rows, weakest: rows[0]
    };
  }

  // 解析「名称 面积 隔声量」多行文本（空格/逗号/制表符分隔，# 注释）
  function parseParts(text) {
    var parts = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      if (!s || s.charAt(0) === '#') return;
      var m = s.split(/[\s,;]+/);
      if (m.length < 3) return;
      var a = num(m[1]), R = num(m[2]);
      if (a == null || R == null) return;
      parts.push({ name: m[0], area: a, R: R });
    });
    return parts;
  }

  // ---------------------------------------------------------------- 构件估算

  /* 单层匀质墙质量定律：R = 20lg(m·f) − 48（站内 stc 模块同一约定） */
  function massLaw(m, f) {
    var mm = num(m);
    if (mm == null || mm <= 0 || !(f > 0)) return null;
    return 20 * Math.log10(mm * f) - 48;
  }

  /* 玻璃 / 轻质单板：R = 13.5lg m + 13 */
  function glassSingle(m) {
    var mm = num(m);
    if (mm == null || mm <= 0) return null;
    return 13.5 * Math.log10(mm) + 13;
  }

  /* 中空玻璃：R = 13.5lg(m₁+m₂) + 13 + ΔR_air，ΔR_air ≈ 0.1·d(mm)（d ≤ 100 mm） */
  function glassIgu(m1, m2, dMm) {
    var a = num(m1), b = num(m2), d = num(dMm);
    if (a == null || b == null || a <= 0 || b <= 0) return null;
    if (d == null || d < 0) d = 0;
    var bonus = d <= 100 ? 0.1 * d : 0.1 * 100 + 0.02 * (d - 100); // >100 mm 经验放缓
    return { R: 13.5 * Math.log10(a + b) + 13 + bonus, bonus: bonus };
  }

  /* 夹层玻璃：R = 13.5lg m + 13 + ΔR_pvb（膜厚 mm → dB，线性插值） */
  var PVB_T = [0.38, 0.76, 1.14, 1.52], PVB_D = [4, 5.5, 6, 7];
  function glassLaminated(m, pvbMm) {
    var mm = num(m), p = num(pvbMm);
    if (mm == null || mm <= 0) return null;
    var bonus = 0;
    if (p != null && p > 0) {
      if (p <= PVB_T[0]) bonus = PVB_D[0] * (p / PVB_T[0]);
      else if (p >= PVB_T[PVB_T.length - 1]) bonus = PVB_D[PVB_D.length - 1];
      else {
        for (var i = 1; i < PVB_T.length; i++) {
          if (p <= PVB_T[i]) {
            var k = (p - PVB_T[i - 1]) / (PVB_T[i] - PVB_T[i - 1]);
            bonus = PVB_D[i - 1] + k * (PVB_D[i] - PVB_D[i - 1]);
            break;
          }
        }
      }
    }
    return { R: 13.5 * Math.log10(mm) + 13 + bonus, bonus: bonus };
  }

  /*
   * 双层板（墙/门/窗）估算
   * kind: 'gypsum'（纸面石膏板类）｜'concrete'（加气混凝土类）｜'glass'（玻璃类，用 0.1·d）
   * fill: true = 空腔填吸声棉（约 +5 dB）
   * 返回 { ok, f0（Hz）, R, baseR, airBonus, fillBonus, note }
   * 低于 f₀ 两层耦合——按总面密度单层估算，无附加隔声量
   */
  var AIR_TABLE = {
    gypsum: { d: [100, 120, 140, 150, 180, 200, 300], R: [9, 10, 10.5, 11, 11.4, 11.6, 11.8] },
    concrete: { d: [100, 120, 140, 150, 180, 200, 300], R: [10, 11, 11.8, 12, 13, 13.8, 16] }
  };
  function airBonus(kind, dMm) {
    var d = num(dMm);
    if (d == null || d <= 0) return 0;
    if (kind === 'glass') return d <= 100 ? 0.1 * d : 10 + 0.02 * (d - 100);
    var t = AIR_TABLE[kind] || AIR_TABLE.gypsum;
    if (d <= t.d[0]) return t.R[0] * (d / t.d[0]);
    if (d >= t.d[t.d.length - 1]) return t.R[t.R.length - 1];
    for (var i = 1; i < t.d.length; i++) {
      if (d <= t.d[i]) {
        var k = (d - t.d[i - 1]) / (t.d[i] - t.d[i - 1]);
        return t.R[i - 1] + k * (t.R[i] - t.R[i - 1]);
      }
    }
    return t.R[t.R.length - 1];
  }

  function doubleLeaf(o) {
    o = o || {};
    var m1 = num(o.m1), m2 = num(o.m2), d = num(o.dMm);
    if (m1 == null || m2 == null || m1 <= 0 || m2 <= 0) return { ok: false, error: '请给出两层板面密度（> 0 kg/m²）' };
    if (d == null || d <= 0) return { ok: false, error: '请给出空气层厚度（> 0 mm）' };
    var mTotal = m1 + m2;
    var f0 = 60 * Math.sqrt(mTotal / (m1 * m2 * (d / 1000)));
    var kind = o.kind || 'gypsum';
    var bonus = airBonus(kind, d);
    var fill = o.fill ? 5 : 0;
    var base = 13.5 * Math.log10(mTotal) + 14;      // 轻质双层（m ≤ 200 kg/m² 经验式）
    if (mTotal > 200) base = 16 * Math.log10(mTotal) + 8;
    return {
      ok: true, f0: f0, baseR: base, airBonus: bonus, fillBonus: fill,
      R: base + bonus + fill,
      note: f0 > 125 ? 'f₀ 落在可闻频段，共振会吃掉附加隔声量，建议填棉或加大空腔' : ''
    };
  }

  /* 由 500/1k/2k 三带平均估算计权单值（工程简化；精确值按 GB/T 50121 基准曲线拟合） */
  function rwEstimate(bandR, bands) {
    if (!bandR || !bandR.length) return null;
    var b = bands || OCTAVE_HZ, pick = [];
    for (var i = 0; i < b.length; i++) {
      if (b[i] === 500 || b[i] === 1000 || b[i] === 2000) pick.push(bandR[i]);
    }
    if (!pick.length) {
      pick = bandR.filter(function (v) { return v != null; });
    }
    if (!pick.length) return null;
    var s = 0;
    pick.forEach(function (v) { s += v; });
    return s / pick.length;
  }

  // ---------------------------------------------------------------- 门窗 TL 曲线数据表

  /*
   * 常用门窗构件传声损失曲线合成模型（125–4000 Hz 倍频带，工程估算）
   *
   * 单片玻璃：场入射质量定律 R₀ = 20lg(m·f) − 50（m = 2.5·t mm，玻璃 2500 kg/m³），
   *   叠加吻合（临界）频率谷 f_c ≈ 12800/t(mm) Hz：
   *   R(f) = R₀ − depth·exp[−½·(log₂(f/f_c)/σ)²]，倍频带平均 depth≈10 dB、σ≈0.8 倍频程；
   *   PVB 夹层阻尼使谷深减半（吻合区实测曲线变浅变宽）。
   *
   * 中空（双片）：质量-空气-质量共振 f_r = 60√[(m₁+m₂)/(m₁m₂d)]（与双层板同式）；
   *   f < f_r：两片耦合，按总面密度质量定律并在 f_r 处叠加共振谷（depth≈5 dB）；
   *   f ≥ f_r：取两片各自质量定律（含各自吻合谷）的较高者 + 空气层附加 0.1·d(mm)
   *   （与 glassIgu 同源，封顶 10 dB）。
   *
   * 高频上限：实验室构件口径经验上限 R_HF_CAP = 44 dB（残余透射/试件安装侧向）。
   *
   * 整窗（含框/密封/安装）：按开启方式逐频带扣减——漏声与孔缝频率特性一致，
   * 高频损失更重：固定扇（连续打胶）< 平开（多点锁 + 胶条）< 推拉（搭接缝毛条）。
   *
   * Rw 为 500/1k/2k 平均估算（rwEstimate）；锚点取公开实测统计
   * （6+12A+6 ≈ 30、5+12A+8 ≈ 33、5+0.76PVB+5 ≈ 34、8+1.52PVB+8 ≈ 38、
   *   推拉整窗中位 ≈ 26、平开整窗 25~39、固定扇 36~44），
   * 实测离散 ±2~3 dB，正式设计以实验室检测报告为准。
   */
  var GLASS_RHO = 2.5;       // 玻璃面密度 kg/(m²·mm)
  var R_HF_CAP = 44;         // 高频经验上限（dB）
  var DIP_DEPTH = 9;         // 吻合谷深（dB，倍频带平均）
  var DIP_SIGMA = 0.8;       // 吻合谷宽（倍频程）
  var RES_DEPTH = 5;         // 质量-空气-质量共振谷深（dB）
  var RES_SIGMA = 0.5;       // 共振谷宽（倍频程）
  var MOUNT_PENALTY = {
    glazing: [0, 0, 0, 0, 0, 0],      // 构件/实验室口径（不扣减）
    fixed:   [0, 0, 1, 1, 1, 2],       // 固定扇：连续打胶密封
    casement:[0, 1, 1, 1, 2, 2],       // 平开：多点锁 + 胶条连续密封
    slider:  [2, 3, 3, 4, 4, 5]        // 推拉：窗扇搭接缝毛条密封
  };

  function paneMassLaw(tMm, f) {
    return 20 * Math.log10(GLASS_RHO * tMm * f) - 50;
  }
  function dipAt(f, fc, depth, sigma) {
    var z = Math.log(f / fc) / Math.LN2 / sigma;
    return depth * Math.exp(-z * z / 2);
  }
  function paneBands(pane) {
    var fc = 12800 / pane.t;
    var depth = pane.pvb > 0 ? DIP_DEPTH / 2 : DIP_DEPTH;
    return OCTAVE_HZ.map(function (f) {
      return paneMassLaw(pane.t, f) - dipAt(f, fc, depth, DIP_SIGMA);
    });
  }

  /*
   * 合成玻璃/整窗逐倍频带传声损失曲线
   * o: { panes: [{ t: 玻璃厚度mm, pvb: PVB膜厚mm（0 或缺省为无） } ×1~2 片],
   *      cavity: 空气层厚度 mm（双片时必填）,
   *      mount: 'glazing'|'fixed'|'casement'|'slider'（缺省 glazing 构件口径） }
   * 夹层玻璃按单片复合写：5+0.76PVB+5 → panes: [{ t: 10, pvb: 0.76 }]
   * 返回 { ok, bands, R[], rw, fr, fcs[], mount, penalty[] }
   */
  function glazingCurve(o) {
    o = o || {};
    var panes = o.panes || [];
    if (!panes.length) return { ok: false, error: '请给出玻璃片参数' };
    var mount = MOUNT_PENALTY[o.mount] ? o.mount : 'glazing';
    var R, fr = null, fcs = [];

    if (panes.length === 1) {
      R = paneBands(panes[0]);
      fcs.push(12800 / panes[0].t);
    } else {
      var p1 = panes[0], p2 = panes[1];
      var d = num(o.cavity);
      if (d == null || d <= 0) return { ok: false, error: '双片构件请给出空气层厚度（mm）' };
      var m1 = GLASS_RHO * p1.t, m2 = GLASS_RHO * p2.t;
      fr = 60 * Math.sqrt((m1 + m2) / (m1 * m2 * (d / 1000)));
      var bonus = Math.min(0.1 * d, 10);
      var b1 = paneBands(p1), b2 = paneBands(p2);
      fcs.push(12800 / p1.t, 12800 / p2.t);
      R = OCTAVE_HZ.map(function (f, i) {
        if (f < fr) {
          return paneMassLaw(p1.t + p2.t, f) - dipAt(f, fr, RES_DEPTH, RES_SIGMA);
        }
        return Math.max(b1[i], b2[i]) + bonus;
      });
    }

    var pen = MOUNT_PENALTY[mount];
    var Rf = R.map(function (v, i) { return Math.min(v - pen[i], R_HF_CAP); });
    return {
      ok: true, bands: OCTAVE_HZ.slice(), R: Rf, rw: rwEstimate(Rf, OCTAVE_HZ),
      fr: fr, fcs: fcs, mount: mount, penalty: pen.slice()
    };
  }

  /* 常用配置数据表（rwRef 为公开实测统计锚点，供选型比选） */
  var GLAZING = [
    { id: 'g4',  group: '玻璃构件 · 实验室口径', name: '4 mm 单玻', mount: 'glazing', rwRef: 29,
      panes: [{ t: 4 }], note: 'f_c ≈ 3.2 kHz，吻合谷落在 2~4 kHz' },
    { id: 'g6',  group: '玻璃构件 · 实验室口径', name: '6 mm 单玻', mount: 'glazing', rwRef: 31,
      panes: [{ t: 6 }], note: 'f_c ≈ 2.1 kHz，2 kHz 频带出现吻合谷' },
    { id: 'g8',  group: '玻璃构件 · 实验室口径', name: '8 mm 单玻', mount: 'glazing', rwRef: 32,
      panes: [{ t: 8 }], note: 'f_c ≈ 1.6 kHz，吻合谷向中频移动' },
    { id: 'g10', group: '玻璃构件 · 实验室口径', name: '10 mm 单玻', mount: 'glazing', rwRef: 34,
      panes: [{ t: 10 }], note: 'f_c ≈ 1.3 kHz，加厚不宜超过单层极限' },
    { id: 'igu-5-12-5', group: '玻璃构件 · 实验室口径', name: '中空 5+12A+5', mount: 'glazing', rwRef: 29,
      panes: [{ t: 5 }, { t: 5 }], cavity: 12, note: 'f_r ≈ 219 Hz，隔热为主、隔声提升有限' },
    { id: 'igu-6-12-6', group: '玻璃构件 · 实验室口径', name: '中空 6+12A+6', mount: 'glazing', rwRef: 30,
      panes: [{ t: 6 }, { t: 6 }], cavity: 12, note: 'f_r ≈ 200 Hz，最常用的隔声中空配置' },
    { id: 'igu-6-20-6', group: '玻璃构件 · 实验室口径', name: '中空 6+20A+6', mount: 'glazing', rwRef: 32,
      panes: [{ t: 6 }, { t: 6 }], cavity: 20, note: '大空腔使 f_r 下移、曲线更平整' },
    { id: 'igu-5-12-8', group: '玻璃构件 · 实验室口径', name: '中空 5+12A+8（不等厚）', mount: 'glazing', rwRef: 33,
      panes: [{ t: 5 }, { t: 8 }], cavity: 12, note: '两片吻合谷错开，共同薄弱点消失' },
    { id: 'lam-5-076-5', group: '玻璃构件 · 实验室口径', name: '夹层 5+0.76PVB+5', mount: 'glazing', rwRef: 34,
      panes: [{ t: 10, pvb: 0.76 }], note: 'PVB 阻尼填平吻合谷，低中频优于同厚中空' },
    { id: 'lam-8-152-8', group: '玻璃构件 · 实验室口径', name: '夹层 8+1.52PVB+8', mount: 'glazing', rwRef: 38,
      panes: [{ t: 16, pvb: 1.52 }], note: '1.52 mm 膜为夹层隔声甜点区' },
    { id: 'igu-lam-5-12-6', group: '玻璃构件 · 实验室口径', name: '中空夹胶 5PVB5+12A+6', mount: 'glazing', rwRef: 36,
      panes: [{ t: 10, pvb: 0.76 }, { t: 6 }], cavity: 12, note: '夹胶 + 不等厚组合，市场隔声主流方案' },
    { id: 'win-slide', group: '整窗 · 工程典型值', name: '铝合金推拉窗 · 6+12A+6', mount: 'slider', rwRef: 26,
      panes: [{ t: 6 }, { t: 6 }], cavity: 12, note: '搭接缝毛条密封是最薄弱环节，Rw 难破 29' },
    { id: 'win-alu', group: '整窗 · 工程典型值', name: '断桥铝平开 · 6+12A+6', mount: 'casement', rwRef: 30,
      panes: [{ t: 6 }, { t: 6 }], cavity: 12, note: '多点锁 + 胶条连续密封；优秀样本 31~35（型材腔体与密封状态贡献）' },
    { id: 'win-pvc', group: '整窗 · 工程典型值', name: '塑钢平开 · 5+12A+5', mount: 'casement', rwRef: 30,
      panes: [{ t: 5 }, { t: 5 }], cavity: 12, note: '多腔体型材对高频略优；胶条翻新后优秀样本可达 33' },
    { id: 'win-lam', group: '整窗 · 工程典型值', name: '断桥铝平开 · 中空夹胶 5PVB5+12A+6', mount: 'casement', rwRef: 36,
      panes: [{ t: 10, pvb: 0.76 }, { t: 6 }], cavity: 12, note: '临街降噪主流配置，实测 35~39' },
    { id: 'win-fixed', group: '整窗 · 工程典型值', name: '固定扇 · 8PVB8+12A+8PVB8', mount: 'fixed', rwRef: 40,
      panes: [{ t: 16, pvb: 1.52 }, { t: 16, pvb: 1.52 }], cavity: 12, note: '无开启缝、连续打胶，实测 36~44，需配新风' }
  ];

  function glazingById(id) {
    for (var i = 0; i < GLAZING.length; i++) if (GLAZING[i].id === id) return GLAZING[i];
    return null;
  }

  // ---------------------------------------------------------------- 标准限值

  /*
   * GB 50118-2010 表 4.2.5 / 4.2.6 等 + GB 55038-2025 隔声提升条款
   * corr: 'C'（粉红噪声频谱修正）或 'Ctr'（交通噪声频谱修正）
   */
  var LIMITS = [
    { id: 'dwell-partition', group: '住宅 · GB 50118-2010', name: '分户墙、分户楼板', corr: 'C', limit: 45, high: 50 },
    { id: 'dwell-entry-door', group: '住宅 · GB 50118-2010', name: '户（套）门', corr: 'C', limit: 25, high: 30 },
    { id: 'dwell-bedroom-wall', group: '住宅 · GB 50118-2010', name: '户内卧室墙', corr: 'C', limit: 35 },
    { id: 'dwell-inner-wall', group: '住宅 · GB 50118-2010', name: '户内其他分室墙', corr: 'C', limit: 30 },
    { id: 'dwell-window-traffic', group: '住宅 · GB 50118-2010', name: '交通干线两侧卧室、起居室外窗', corr: 'Ctr', limit: 30, high: 35 },
    { id: 'dwell-window-other', group: '住宅 · GB 50118-2010', name: '其他外窗', corr: 'Ctr', limit: 25, high: 30 },
    { id: 'dwell-wall-55038', group: '住宅 · GB 55038-2025（强制）', name: '卧室之间分户墙/楼板（空气声）', corr: 'C', limit: 50 },
    { id: 'dwell-other-55038', group: '住宅 · GB 55038-2025（强制）', name: '其他分户墙、分户楼板', corr: 'C', limit: 48 },
    { id: 'dwell-street-55038', group: '住宅 · GB 55038-2025（强制）', name: '临街朝交通干线侧卧室外门窗', corr: 'Ctr', limit: 35 },
    { id: 'school-voice', group: '学校 · GB 50118-2010', name: '语音教室、阅览室隔墙与楼板', corr: 'C', limit: 50 },
    { id: 'school-noisy', group: '学校 · GB 50118-2010', name: '普通教室与产生噪声房间隔墙', corr: 'C', limit: 50 },
    { id: 'school-normal', group: '学校 · GB 50118-2010', name: '普通教室之间隔墙与楼板', corr: 'C', limit: 45, high: 50 },
    { id: 'school-music', group: '学校 · GB 50118-2010', name: '音乐教室、琴房之间隔墙与楼板', corr: 'C', limit: 45 },
    { id: 'hospital-ward', group: '医院 · GB 50118-2010', name: '病房与产生噪声房间隔墙', corr: 'Ctr', limit: 50, high: 55 },
    { id: 'hospital-op', group: '医院 · GB 50118-2010', name: '手术室与产生噪声房间隔墙', corr: 'Ctr', limit: 45, high: 50 },
    { id: 'hospital-normal', group: '医院 · GB 50118-2010', name: '病房、手术室与普通房间隔墙', corr: 'C', limit: 45, high: 50 },
    { id: 'hospital-audio', group: '医院 · GB 50118-2010', name: '听力测听室隔墙', corr: 'C', limit: 50 },
    { id: 'office-noisy', group: '办公 · GB 50118-2010', name: '办公室、会议室与产生噪声房间隔墙', corr: 'C', limit: 50 },
    { id: 'office-normal', group: '办公 · GB 50118-2010', name: '办公室、会议室与普通房间隔墙', corr: 'C', limit: 45 },
    { id: 'office-wall', group: '办公 · GB 50118-2010', name: '外墙', corr: 'Ctr', limit: 45 },
    { id: 'hotel-room', group: '旅馆 · GB 50118-2010', name: '客房之间隔墙', corr: 'C', limit: 45, high: 50 },
    { id: 'hotel-corridor', group: '旅馆 · GB 50118-2010', name: '客房与走廊隔墙', corr: 'C', limit: 45, high: 50 },
    { id: 'retail-gym', group: '商业 · GB 50118-2010', name: '健身中心、娱乐场所与噪声敏感房间隔墙', corr: 'Ctr', limit: 55, high: 60 },
    { id: 'retail-mall', group: '商业 · GB 50118-2010', name: '购物中心、餐厅、展览馆与噪声敏感房间隔墙', corr: 'Ctr', limit: 45, high: 50 }
  ];

  function findLimit(id) {
    for (var i = 0; i < LIMITS.length; i++) if (LIMITS[i].id === id) return LIMITS[i];
    return null;
  }

  /* 达标判定：value 为 Rw 估算值，corr 为频谱修正量（C 或 Ctr，可 0） */
  function checkLimit(id, rw, corr, highStd) {
    var L = findLimit(id);
    if (!L) return { ok: false, error: '未知限值条目' };
    var c = num(corr) || 0;
    var v = num(rw);
    if (v == null) return { ok: false, error: '缺少隔声量' };
    var target = highStd && L.high != null ? L.high : L.limit;
    var total = v + c;
    return {
      ok: true, limit: L, corr: c, value: total, target: target,
      pass: total >= target, margin: total - target,
      corrLabel: L.corr
    };
  }

  // ---------------------------------------------------------------- 例题

  /*
   * 组合墙例题：住宅分户墙（240 砖墙抹灰 m=480）+ 户门 + 外窗 + 孔洞
   * 砖墙质量定律逐频带；门/窗取典型值；孔洞 1% 面积
   */
  function exampleParts() {
    return [
      { name: '砖墙', area: 15, R: null, mass: 480, kind: 'mass' },
      { name: '户门', area: 2, R: 25 },
      { name: '外窗', area: 3, R: 28 },
      { name: '穿墙孔洞', area: 0.2, R: 0 }
    ];
  }

  /* 组合例题的逐频带版本（供曲线图）：墙按质量定律，门/窗/孔洞取平直 */
  function exampleCombination() {
    var parts = [
      { name: '砖墙', area: 15, R: function (f) { return massLaw(480, f); } },
      { name: '户门', area: 2, R: 25 },
      { name: '外窗', area: 3, R: 28 },
      { name: '穿墙孔洞', area: 0.2, R: 0 }
    ];
    var rows = OCTAVE_HZ.map(function (f) {
      var tauS = 0, S = 0;
      parts.forEach(function (p) {
        var R = typeof p.R === 'function' ? p.R(f) : p.R;
        S += p.area; tauS += p.area * Math.pow(10, -R / 10);
      });
      return { f: f, R: -10 * Math.log10(tauS / S) };
    });
    return rows;
  }

  var API = {
    C_AIR: C_AIR, RHO: RHO, OCTAVE_HZ: OCTAVE_HZ,
    apertureTl: apertureTl,
    apertureArea: apertureArea,
    apertureCombination: apertureCombination,
    gapDeltaR: gapDeltaR,
    leakCap: leakCap,
    combine: combine,
    parseParts: parseParts,
    massLaw: massLaw,
    glassSingle: glassSingle,
    glassIgu: glassIgu,
    glassLaminated: glassLaminated,
    doubleLeaf: doubleLeaf,
    airBonus: airBonus,
    rwEstimate: rwEstimate,
    LIMITS: LIMITS,
    findLimit: findLimit,
    checkLimit: checkLimit,
    exampleParts: exampleParts,
    exampleCombination: exampleCombination,
    GLAZING: GLAZING, glazingCurve: glazingCurve, glazingById: glazingById,
    GLASS_RHO: GLASS_RHO, R_HF_CAP: R_HF_CAP,
    MOUNT_PENALTY: MOUNT_PENALTY
  };

  return API;
});
