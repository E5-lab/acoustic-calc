/*
 * insulation.js — 墙体/构件隔声量内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Insulation，Node 下 module.exports。
 *
 * 1) 质量定律（扩散场、单层密实构件）：
 *      R = 20 lg(m · f) − 48     （m 面密度 kg/m²，f 频率 Hz）
 *    该式在 1/3 倍频带逐带计算，用于快速估算。
 * 2) STC（ASTM E413）：对 125–4000 Hz 共 16 个 1/3 倍频带，用标准轮廓线
 *    （500 Hz 处为 0 dB，向低频每倍频程 −5 dB 阶梯）逐 dB 平移，取满足
 *    「各带缺量之和 ≤ 32 dB 且任一频带缺量 ≤ 8 dB」的最大值。
 * 3) 吻合频率：f_c = c₀² / (1.8 · c_L · t)，用于提示质量定律失效区。
 */
(function (global) {
  'use strict';

  var C0 = 343;

  // ASTM E413 标准轮廓（相对 500 Hz，dB）
  var CONTOUR_HZ = [125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000];
  var CONTOUR_REL = [-16, -13, -10, -7, -4, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  // 常用构件材料（密度 kg/m³、纵波声速 m/s），用于按厚度估算面密度
  var MATERIALS = [
    { id: 'gypsum', name: '石膏板 / 纸面石膏板', density: 800, cL: 2000 },
    { id: 'gypsum-fire', name: '防火石膏板（高密度）', density: 1000, cL: 2200 },
    { id: 'concrete', name: '钢筋混凝土', density: 2400, cL: 3500 },
    { id: 'brick', name: '烧结砖砌体', density: 1800, cL: 3000 },
    { id: 'aac', name: '加气混凝土砌块', density: 700, cL: 2000 },
    { id: 'glass', name: '普通玻璃', density: 2500, cL: 5000 },
    { id: 'glass-lam', name: '夹层玻璃（PVB）', density: 2500, cL: 5000 },
    { id: 'steel', name: '钢板', density: 7850, cL: 5100 },
    { id: 'plywood', name: '胶合板 / 木夹板', density: 600, cL: 2500 },
    { id: 'calcium', name: '硅酸钙板', density: 1200, cL: 2500 },
    { id: 'cement-board', name: '水泥压力板 / 纤维水泥板', density: 1600, cL: 2800 },
    { id: 'mgo', name: '玻镁板', density: 1100, cL: 2500 }
  ];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function findMaterial(id) {
    for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].id === id) return MATERIALS[i];
    return null;
  }

  // 面密度：材料 + 厚度 (mm)
  function faceMass(materialId, thicknessMm) {
    var m = findMaterial(materialId);
    var t = num(thicknessMm);
    if (!m || t == null || t <= 0) return null;
    return m.density / 1000 * t;      // kg/m²
  }

  // 质量定律（单频）
  function massLaw(mass, f) {
    var m = num(mass), ff = num(f);
    if (m == null || m <= 0 || ff == null || ff <= 0) return null;
    return 20 * Math.log10(m * ff) - 48;
  }

  // 吻合频率 fc = c0² / (1.8 · cL · t)
  function coincidence(materialId, thicknessMm) {
    var m = findMaterial(materialId);
    var t = num(thicknessMm);
    if (!m || t == null || t <= 0) return null;
    return C0 * C0 / (1.8 * m.cL * (t / 1000));
  }

  // STC 评级：levels 为 16 个 1/3 倍频带隔声量（dB）
  function stc(levels) {
    if (!levels || levels.length !== CONTOUR_HZ.length) {
      return { ok: false, error: 'STC 需要 125–4000 Hz 共 16 个 1/3 倍频带的隔声量' };
    }
    var vals = levels.map(function (v) { return num(v); });
    if (vals.some(function (v) { return v == null; })) {
      return { ok: false, error: '存在未填写的频带值' };
    }

    var best = null;
    for (var shift = 10; shift <= 80; shift++) {
      var contour = CONTOUR_REL.map(function (r) { return r + shift; });
      var sum = 0, max = 0;
      var defs = [];
      for (var i = 0; i < vals.length; i++) {
        var d = Math.max(0, contour[i] - vals[i]);   // 低于轮廓线 = 缺量
        defs.push(d);
        sum += d;
        if (d > max) max = d;
      }
      if (sum <= 32 && max <= 8) {
        best = { stcValue: shift, contour: contour, deficiencies: defs, sum: sum, max: max };
      } else if (best) {
        break;   // 连续性：一旦不满足即停止
      }
    }

    if (!best) return { ok: false, error: '数据异常，无法完成 STC 评级' };
    var rounded = Math.round(best.stcValue / 5) * 5;
    return {
      ok: true,
      value: best.stcValue,
      designation: 'STC-' + best.stcValue,
      rounded: rounded,
      contour: best.contour,
      deficiencies: best.deficiencies,
      sumDeficiency: best.sum,
      maxDeficiency: best.max,
      bands: CONTOUR_HZ,
      levels: vals
    };
  }

  // 由面密度生成 16 带质量定律谱 + STC
  function fromMass(o) {
    o = o || {};
    var m = num(o.mass);
    if (m == null || m <= 0) return { ok: false, error: '请输入有效的面密度（> 0 kg/m²）' };
    var levels = CONTOUR_HZ.map(function (f) { return massLaw(m, f); });
    var r = stc(levels);
    if (!r.ok) return r;
    return {
      ok: true,
      mass: m,
      bands: CONTOUR_HZ,
      levels: levels,
      stcValue: r.value,
      designation: r.designation,
      rounded: r.rounded,
      contour: r.contour,
      deficiencies: r.deficiencies,
      sumDeficiency: r.sumDeficiency,
      maxDeficiency: r.maxDeficiency,
      coincidence: o.materialId ? coincidence(o.materialId, o.thickness) : null
    };
  }

  // 双层构件简化估算：质量定律 + 空气层增量（经验增量，供方案比选）
  function doubleLeaf(o) {
    o = o || {};
    var m1 = num(o.mass1), m2 = num(o.mass2), d = num(o.cavity);
    if (m1 == null || m1 <= 0 || m2 == null || m2 <= 0) {
      return { ok: false, error: '请给出两层板的面密度（> 0 kg/m²）' };
    }
    var mTotal = m1 + m2;
    var base = CONTOUR_HZ.map(function (f) { return massLaw(mTotal, f) + 3; });
    var cavityBonus = (d != null && d > 0) ? 12 * Math.log10(1 + d / 50) : 0;
    var levels = base.map(function (v) { return v + cavityBonus; });
    var r = stc(levels);
    if (!r.ok) return r;
    return {
      ok: true,
      mass: mTotal,
      cavityBonus: cavityBonus,
      bands: CONTOUR_HZ,
      levels: levels,
      stcValue: r.value,
      designation: r.designation,
      contour: r.contour,
      deficiencies: r.deficiencies,
      sumDeficiency: r.sumDeficiency,
      maxDeficiency: r.maxDeficiency
    };
  }

  // 由实测/输入隔声量直接评级
  function fromLevels(levels) {
    var r = stc(levels);
    if (!r.ok) return r;
    return {
      ok: true,
      bands: CONTOUR_HZ,
      levels: r.levels,
      stcValue: r.value,
      designation: r.designation,
      rounded: r.rounded,
      contour: r.contour,
      deficiencies: r.deficiencies,
      sumDeficiency: r.sumDeficiency,
      maxDeficiency: r.maxDeficiency
    };
  }

  var API = {
    CONTOUR_HZ: CONTOUR_HZ,
    CONTOUR_REL: CONTOUR_REL,
    MATERIALS: MATERIALS,
    findMaterial: findMaterial,
    faceMass: faceMass,
    massLaw: massLaw,
    coincidence: coincidence,
    stc: stc,
    fromMass: fromMass,
    fromLevels: fromLevels,
    doubleLeaf: doubleLeaf
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Insulation = API;
  }
})(typeof window !== 'undefined' ? window : this);
