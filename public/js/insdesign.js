/*
 * insdesign.js — 隔声与撞击声进阶内核（纯函数，无构建依赖）
 * UMD 包装：浏览器挂到 window.InsDesign，Node 下 module.exports。
 *
 * 本模块在前端「墙体隔声量 Rw/STC」(insulation.js) 的基础上，提供进阶层级的
 * 隔声与撞击声计算，覆盖专业声学书籍（实用建筑声学 / 建筑隔声 / 建筑物理）中
 * 常见的工程估算：
 *   1) 单层密实构件：质量定律 R(f) + 吻合频率 fc（提示质量定律失效区）。
 *   2) 双层构造（质量-空气-质量共振）：f0、共振低谷、腔体增益与起伏。
 *   3) 隔声罩 / 围护结构插入损失 NR = TL + 10lg(S / A_inside)。
 *   4) 浮筑楼板 / 弹性垫层对撞击声的改进 ΔL(f) 与共振频率 f0。
 *   5) 组合与侧向传声：多路径能量叠加 R_total = -10lg(Σ10^(-R_i/10))。
 *
 * 说明：所有公式为工程估算方法，给出趋势与量级，供方案比选；精确评级仍应以
 * 实验室测量（GB/T 19889 / ISO 10140）为准。
 */
(function (global) {
  'use strict';

  var C0 = 343;          // 空气中声速 m/s
  var RHO0 = 1.21;       // 空气密度 kg/m³

  // 统一频带网格：100–4000 Hz 共 17 个 1/3 倍频带
  var GRID_HZ = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 质量定律（单频，扩散场）：R = 20 lg(m·f) − 48
  function massLaw(mass, f) {
    var m = num(mass), ff = num(f);
    if (m == null || m <= 0 || ff == null || ff <= 0) return null;
    return 20 * Math.log10(m * ff) - 48;
  }

  // 吻合频率 fc = c0² / (1.8 · cL · t)，t 以米计
  function coincidence(cL, thicknessMm) {
    var c = num(cL), t = num(thicknessMm);
    if (c == null || c <= 0 || t == null || t <= 0) return null;
    return C0 * C0 / (1.8 * c * (t / 1000));
  }

  // 能量求和（声压级叠加）
  function dbSum(list) {
    var s = 0;
    list.forEach(function (v) { var n = num(v); if (n != null) s += Math.pow(10, n / 10); });
    return s > 0 ? 10 * Math.log10(s) : null;
  }

  // ---------------------------------------------------------------------------
  // 1) 单层密实构件：质量定律谱 + 吻合频率
  // ---------------------------------------------------------------------------
  function singleLeaf(o) {
    o = o || {};
    var m = num(o.m);
    if (m == null || m <= 0) return { ok: false, error: '请输入有效的面密度 m (kg/m²) > 0' };
    var fc = (o.cL != null && o.thicknessMm != null) ? coincidence(o.cL, o.thicknessMm) : null;
    var spectrum = GRID_HZ.map(function (f) {
      return { f: f, R: massLaw(m, f) };
    });
    var Rs = spectrum.map(function (p) { return p.R; });
    return {
      ok: true,
      m: m,
      fc: fc,
      spectrum: spectrum,
      minR: Math.min.apply(null, Rs),
      maxR: Math.max.apply(null, Rs),
      // 吻合频率所在频带（若 fc 落在范围内）
      fcInBand: (fc != null && fc >= GRID_HZ[0] && fc <= GRID_HZ[GRID_HZ.length - 1])
    };
  }

  // ---------------------------------------------------------------------------
  // 2) 双层构造（质量-空气-质量共振）
  //    f0 = (c0/2π)·sqrt((m1+m2)/(m1·m2·d))，d 以米计
  //    高频腔体增益 Δhf = min(20lg(f/f0), Δcap)，在 f0 处因共振出现低谷（被腔体吸声阻尼削弱）
  // ---------------------------------------------------------------------------
  function doubleLeaf(o) {
    o = o || {};
    var m1 = num(o.m1), m2 = num(o.m2), dmm = num(o.d);
    if (m1 == null || m1 <= 0 || m2 == null || m2 <= 0) {
      return { ok: false, error: '请输入两层板的面密度 m1、m2 (kg/m²) > 0' };
    }
    if (dmm == null || dmm <= 0) return { ok: false, error: '请输入空气层厚度 d (mm) > 0' };
    var d = dmm / 1000;
    var al = clamp(o.alphaC == null ? 0.05 : num(o.alphaC), 0, 1);   // 腔体吸声系数
    var f0 = C0 / (2 * Math.PI) * Math.sqrt((m1 + m2) / (m1 * m2 * d));
    var dCap = 15;             // 高频腔体增益上限 dB
    var bw = f0 * 0.6;         // 共振低谷半宽
    var dipMax = 10 * (1 - al); // 无吸声时低谷更深，吸声削减低谷

    var spectrum = GRID_HZ.map(function (f) {
      var rM = massLaw(m1 + m2, f);                 // 两层作为整体时的单层质量定律
      var hf = f > f0 ? Math.min(20 * Math.log10(f / f0), dCap) : 0;
      var g = 1 / (1 + Math.pow((f - f0) / bw, 2)); // 共振峰包络
      var R = rM + hf - dipMax * g;
      return { f: f, R: R, hf: hf, dip: dipMax * g };
    });
    var minP = spectrum.reduce(function (a, p) { return p.R < a.R ? p : a; }, spectrum[0]);
    return {
      ok: true,
      m1: m1, m2: m2, d: dmm, alphaC: al, f0: f0,
      spectrum: spectrum,
      minR: minP.R, minRf: minP.f,
      maxR: Math.max.apply(null, spectrum.map(function (p) { return p.R; }))
    };
  }

  // ---------------------------------------------------------------------------
  // 3) 隔声罩 / 围护结构插入损失
  //    NR = TL + 10 lg(S_panel / A_inside)
  //    TL 可为单值或 1/3 倍频带谱（与 GRID_HZ 对齐）
  // ---------------------------------------------------------------------------
  function enclosureNR(o) {
    o = o || {};
    var S = num(o.S), A = num(o.Ainside);
    if (S == null || S <= 0 || A == null || A <= 0) {
      return { ok: false, error: '请输入隔声罩/围护面积 S (m²) 与内表面吸声量 A_inside (m²·sabin)' };
    }
    var term = 10 * Math.log10(S / A);
    var tl = o.TL;
    if (Array.isArray(tl)) {
      var spec = GRID_HZ.map(function (f, i) {
        return { f: f, TL: num(tl[i]), NR: num(tl[i]) + term };
      });
      return { ok: true, term: term, S: S, Ainside: A, spectrum: spec, NR: null };
    }
    var t = num(tl);
    if (t == null) return { ok: false, error: '请输入构件隔声量 TL (dB)' };
    return { ok: true, term: term, S: S, Ainside: A, TL: t, NR: t + term };
  }

  // ---------------------------------------------------------------------------
  // 4) 浮筑楼板 / 弹性垫层对撞击声的改进
  //    共振频率 f0 = (1/2π)·sqrt(s' / m)，s' 为动态刚度 (MN/m³)
  //    改进量 ΔL(f) = min(20lg(f/f0), ΔLmax)（f > f0），f < f0 时无改进
  // ---------------------------------------------------------------------------
  function floatingFloor(o) {
    o = o || {};
    var m = num(o.m), sp = num(o.sPrime);   // m: 浮筑层质量 kg/m²；sp: 动态刚度 MN/m³
    if (m == null || m <= 0 || sp == null || sp <= 0) {
      return { ok: false, error: '请输入浮筑层质量 m (kg/m²) > 0 与动态刚度 s\' (MN/m³) > 0' };
    }
    var s = sp * 1e6;                       // N/m³
    var f0 = (1 / (2 * Math.PI)) * Math.sqrt(s / m);
    var dMax = 35;                          // dB，改进量上限
    var spectrum = GRID_HZ.map(function (f) {
      var dl = f > f0 ? Math.min(20 * Math.log10(f / f0), dMax) : 0;
      return { f: f, dL: dl };
    });
    // ΔL_w 近似：取谱中频（500–2000 Hz）改进量的能量平均，仅作量级指示
    var mid = spectrum.filter(function (p) { return p.f >= 500 && p.f <= 2000; });
    var dlw = mid.length ? 10 * Math.log10(mid.reduce(function (s2, p) { return s2 + Math.pow(10, p.dL / 10); }, 0) / mid.length) : 0;
    return {
      ok: true, m: m, sPrime: sp, f0: f0, dLmax: dMax,
      spectrum: spectrum, dLwApprox: dlw
    };
  }

  // ---------------------------------------------------------------------------
  // 5) 组合与侧向传声：多路径能量叠加
  //    R_total = -10 lg( Σ 10^(-R_i/10) )
  //    paths: [{R: number}] 或 [{R: [..频谱..]}]（同 GRID_HZ 对齐）
  // ---------------------------------------------------------------------------
  function combinedTransmission(o) {
    var paths = Array.isArray(o) ? o : (o && o.paths);
    if (!paths || !paths.length) return { ok: false, error: '请至少给出一条传声路径的隔声量 R' };
    if (Array.isArray(paths[0].R)) {
      var n = paths[0].R.length, out = [];
      for (var f = 0; f < n; f++) {
        var s = 0;
        paths.forEach(function (p) { var v = num(p.R[f]); if (v != null) s += Math.pow(10, -v / 10); });
        out.push(s > 0 ? -10 * Math.log10(s) : null);
      }
      return { ok: true, spectrum: out, bands: GRID_HZ };
    }
    var s2 = 0;
    paths.forEach(function (p) { var v = num(p.R); if (v != null) s2 += Math.pow(10, -v / 10); });
    return { ok: true, R: s2 > 0 ? -10 * Math.log10(s2) : null };
  }

  var API = {
    C0: C0, RHO0: RHO0, GRID_HZ: GRID_HZ,
    num: num, clamp: clamp,
    massLaw: massLaw,
    coincidence: coincidence,
    dbSum: dbSum,
    singleLeaf: singleLeaf,
    doubleLeaf: doubleLeaf,
    enclosureNR: enclosureNR,
    floatingFloor: floatingFloor,
    combinedTransmission: combinedTransmission
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.InsDesign = API;
  }
})(typeof window !== 'undefined' ? window : this);
