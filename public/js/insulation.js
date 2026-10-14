/*
 * insulation.js — 墙体/构件隔声量内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Insulation，Node 下 module.exports。
 *
 * 1) 质量定律（扩散场、单层密实构件）：
 *      R = 20 lg(m · f) − 48     （m 面密度 kg/m²，f 频率 Hz）
 * 2) 计权隔声量 Rw（GB/T 50121-2005《建筑隔声评价标准》，等效 ISO 717-1）：
 *      在 100–3150 Hz 共 16 个 1/3 倍频带（或 125–2000 Hz 共 5 个倍频带）上，
 *      将基准曲线 K_i（表 3.1.2，500 Hz 处为 0 dB）逐 dB 平移，取满足
 *      「不利偏差之和 ≤ 32.0 dB（1/3 倍频程）／≤ 10.0 dB（倍频程）」的最大值；
 *      再按表 3.1.3 的 A 计权频谱（总级归一化到 0 dB）计算频谱修正量
 *      C（粉红噪声，频谱 1）与 Ctr（交通噪声，频谱 2）：
 *        C_j = −10 lg Σ 10^((L_ij − X_i)/10) − X_w
 *      注：GB/T 50121-2005 采用 ISO 717-1:1996 的方法，不设 8 dB 单带限值；
 *      ASTM E413（STC）另有「单带缺量 ≤ 8 dB」的要求，两者结果常有 1–2 dB 差异。
 * 3) 隔声等级 STC（ASTM E413）：125–4000 Hz 共 16 个 1/3 倍频带轮廓拟合。
 * 4) 吻合频率：f_c = c₀² / (1.8 · c_L · t)，用于提示质量定律失效区。
 */
(function (global) {
  'use strict';

  var C0 = 343;

  // 统一频带网格：100–4000 Hz 共 17 个 1/3 倍频带
  // （GB/T 50121 取 100–3150 共 16 带，ASTM E413 取 125–4000 共 16 带，均为其子集）
  var GRID_HZ = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000];

  // ASTM E413 标准轮廓（相对 500 Hz，dB），125–4000 Hz
  var CONTOUR_HZ = GRID_HZ.slice(1);
  var CONTOUR_REL = [-16, -13, -10, -7, -4, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  // GB/T 50121-2005 表 3.1.2 空气声隔声基准值 K_i（相对 500 Hz = 0 dB）
  var GB_HZ = GRID_HZ.slice(0, 16);
  var GB_REF_REL = [-19, -16, -13, -10, -7, -4, -1, 0, 1, 2, 3, 4, 4, 4, 4, 4];
  var GB_OCT_HZ = [125, 250, 500, 1000, 2000];
  var GB_OCT_REF_REL = [-16, -7, 0, 3, 4];

  // GB/T 50121-2005 表 3.1.3 计算频谱修正量的声压级频谱（A 计权、总级归一化到 0 dB）
  var SPECTRUM_C_TERZ = [-29, -26, -23, -21, -19, -17, -15, -13, -12, -11, -10, -9, -9, -9, -9, -9];
  var SPECTRUM_C_OCT = [-21, -14, -8, -5, -4];
  var SPECTRUM_CTR_TERZ = [-20, -20, -18, -16, -15, -14, -13, -12, -11, -9, -8, -9, -10, -11, -13, -15];
  var SPECTRUM_CTR_OCT = [-14, -10, -7, -4, -6];

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

  // 国标限值（构件类，均以「计权隔声量 + 频谱修正量」表述）
  var GB_REQUIREMENTS = [
    { id: 'dwell-partition', group: '住宅 GB 50118-2010', name: '分户墙、分户楼板（低限）', metric: 'C', limit: 45 },
    { id: 'dwell-partition-high', group: '住宅 GB 50118-2010', name: '分户墙、分户楼板（高要求）', metric: 'C', limit: 50 },
    { id: 'dwell-nonres-floor', group: '住宅 GB 50118-2010', name: '分隔住宅与非居住空间的楼板', metric: 'Ctr', limit: 51 },
    { id: 'dwell-bedroom-wall', group: '住宅 GB 50118-2010', name: '户内卧室墙', metric: 'C', limit: 35 },
    { id: 'dwell-inner-wall', group: '住宅 GB 50118-2010', name: '户内其他分室墙', metric: 'C', limit: 30 },
    { id: 'dwell-entry-door', group: '住宅 GB 50118-2010', name: '户（套）门', metric: 'C', limit: 25 },
    { id: 'dwell-exterior-wall', group: '住宅 GB 50118-2010 / GB 55038-2025', name: '住宅外墙', metric: 'Ctr', limit: 45 },
    { id: 'dwell-window-traffic', group: '住宅 GB 50118-2010 / GB 55038-2025', name: '交通干线侧卧室、起居室外窗', metric: 'Ctr', limit: 30 },
    { id: 'dwell-window-street', group: '住宅 GB 55038-2025（强制性）', name: '临街住宅朝交通干线侧卧室外门窗', metric: 'Ctr', limit: 35 },
    { id: 'dwell-window-other', group: '住宅 GB 50118-2010', name: '其他外窗', metric: 'Ctr', limit: 25 },
    { id: 'school-speech', group: '学校 GB 50118-2010', name: '语音教室、阅览室隔墙与楼板', metric: 'C', limit: 50 },
    { id: 'school-noisy', group: '学校 GB 50118-2010', name: '普通教室与产生噪声房间之间的隔墙、楼板', metric: 'C', limit: 50 },
    { id: 'school-classroom', group: '学校 GB 50118-2010', name: '普通教室之间的隔墙与楼板（低限）', metric: 'C', limit: 45 },
    { id: 'school-classroom-high', group: '学校 GB 50118-2010', name: '普通教室之间的隔墙与楼板（高要求）', metric: 'C', limit: 50 }
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
  function findRequirement(id) {
    for (var i = 0; i < GB_REQUIREMENTS.length; i++) if (GB_REQUIREMENTS[i].id === id) return GB_REQUIREMENTS[i];
    return null;
  }
  // 四舍五入修约（标准要求频谱修正量由 0.1 dB 修约为整数）
  function roundHalf(v) {
    return v >= 0 ? Math.floor(v + 0.5) : -Math.floor(-v + 0.5);
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

  // 把 levels/bands 对齐到目标频带序列，缺失位置填 null
  function align(levels, bands, wantHz) {
    var map = {}, out = [];
    if (!bands || !levels) return [];
    for (var i = 0; i < bands.length; i++) map[String(bands[i])] = num(levels[i]);
    for (var j = 0; j < wantHz.length; j++) {
      var v = map[String(wantHz[j])];
      out.push(v === undefined ? null : v);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // STC 评级（ASTM E413，125–4000 Hz 共 16 个 1/3 倍频带）
  // ---------------------------------------------------------------------------
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
        best = { value: shift, contour: contour, deficiencies: defs, sum: sum, max: max };
      } else if (best) {
        break;   // 连续性：一旦不满足即停止
      }
    }

    if (!best) return { ok: false, error: '数据异常，无法完成 STC 评级' };
    return {
      ok: true,
      standard: 'ASTM E413',
      value: best.value,
      designation: 'STC-' + best.value,
      rounded: Math.round(best.value / 5) * 5,
      contour: best.contour,
      deficiencies: best.deficiencies,
      sumDeficiency: best.sum,
      maxDeficiency: best.max,
      limit: 32,
      maxLimit: 8,
      bands: CONTOUR_HZ,
      levels: vals
    };
  }

  // ---------------------------------------------------------------------------
  // 计权隔声量 Rw（GB/T 50121-2005）
  //   levels/bands：100–4000 Hz 共 17 带（取其中 100–3150 Hz）、
  //                 100–3150 Hz 共 16 个 1/3 倍频带，或 125–2000 Hz 共 5 个倍频带
  // ---------------------------------------------------------------------------
  function gbRw(levels, bands) {
    if (!levels || !levels.length) return { ok: false, error: '请填入隔声量数据' };
    if (!bands) {
      if (levels.length === GRID_HZ.length) bands = GRID_HZ;
      else if (levels.length === GB_HZ.length) bands = GB_HZ;
      else if (levels.length === GB_OCT_HZ.length) bands = GB_OCT_HZ;
      else return { ok: false, error: '计权隔声量需要 100–3150 Hz 共 16 个 1/3 倍频带（或倍频程 5 带）的隔声量' };
    }
    var octave = bands.length === GB_OCT_HZ.length;

    var refHz = octave ? GB_OCT_HZ : GB_HZ;
    var refRel = octave ? GB_OCT_REF_REL : GB_REF_REL;
    var limit = octave ? 10 : 32;
    var vals = align(levels, bands, refHz);
    if (vals.some(function (v) { return v == null; })) {
      return {
        ok: false,
        error: '计权隔声量 Rw 需要 ' + refHz[0] + '–' + refHz[refHz.length - 1] + ' Hz 共 ' +
          refHz.length + ' 个 ' + (octave ? '倍频带' : '1/3 倍频带') + '的完整隔声量'
      };
    }

    // 基准曲线逐 dB 平移，取「不利偏差之和不超过限值」的最大值
    var best = null;
    for (var shift = -20; shift <= 120; shift++) {
      var sum = 0, max = 0, defs = [];
      for (var i = 0; i < refHz.length; i++) {
        var d = Math.max(0, refRel[i] + shift - vals[i]);   // 不利偏差 Pi
        defs.push(d);
        sum += d;
        if (d > max) max = d;
      }
      if (sum <= limit + 1e-9) best = { shift: shift, defs: defs, sum: sum, max: max };
      else if (best) break;
    }
    if (!best) return { ok: false, error: '数据异常，无法完成 Rw 评级' };

    var Xw = best.shift;

    // 频谱修正量 C / Ctr（GB/T 50121-2005 式 3.4.1）
    function term(spec) {
      var s = 0;
      for (var k = 0; k < refHz.length; k++) s += Math.pow(10, (spec[k] - vals[k]) / 10);
      return -10 * Math.log10(s) - Xw;
    }
    var C = term(octave ? SPECTRUM_C_OCT : SPECTRUM_C_TERZ);
    var Ctr = term(octave ? SPECTRUM_CTR_OCT : SPECTRUM_CTR_TERZ);
    var ci = roundHalf(C), ctri = roundHalf(Ctr);

    return {
      ok: true,
      standard: 'GB/T 50121-2005',
      octave: octave,
      value: Xw,
      designation: 'Rw ' + Xw + ' dB',
      bands: refHz,
      levels: vals,
      contour: refRel.map(function (r) { return r + Xw; }),
      deficiencies: best.defs,
      sumDeficiency: best.sum,
      maxDeviation: best.max,
      limit: limit,
      C: C,
      Ctr: Ctr,
      c: ci,
      ctr: ctri,
      rwPlusC: Xw + ci,
      rwPlusCtr: Xw + ctri,
      notation: 'Rw(C; Ctr) = ' + Xw + '(' + ci + '; ' + ctri + ') dB'
    };
  }

  // 国标限值对照：返回实测指标与限值的差值
  function checkRequirement(rw, reqId) {
    var req = findRequirement(reqId);
    if (!req || !rw || !rw.ok) return null;
    var useCtr = req.metric === 'Ctr';
    var offset = useCtr ? rw.ctr : rw.c;
    var offsetExact = useCtr ? rw.Ctr : rw.C;
    var value = rw.value + offset;                     // 按修约后的修正量取值（工程惯例）
    return {
      req: req,
      metric: 'Rw + ' + req.metric,
      limit: req.limit,
      value: value,
      exact: rw.value + offsetExact,
      pass: value >= req.limit,
      margin: value - req.limit,
      needRw: req.limit - offset                        // 达限所需的计权隔声量
    };
  }

  // 组装完整结果：统一网格 + 两种评价量
  function build(o) {
    var s = stc(align(o.levels, o.bands, CONTOUR_HZ));
    var gb = gbRw(o.levels, o.bands);
    if (!s.ok && !gb.ok) return { ok: false, error: gb.error || s.error };
    return {
      ok: true,
      bands: o.bands,
      levels: o.levels,
      stc: s,
      rw: gb,
      stcValue: s.ok ? s.value : null,
      rwValue: gb.ok ? gb.value : null,
      mass: o.mass != null ? o.mass : null,
      cavityBonus: o.cavityBonus != null ? o.cavityBonus : null,
      coincidence: o.coincidence != null ? o.coincidence : null
    };
  }

  // 由面密度生成 100–4000 Hz 质量定律谱 + 双标准评级
  function fromMass(o) {
    o = o || {};
    var m = num(o.mass);
    if (m == null || m <= 0) return { ok: false, error: '请输入有效的面密度（> 0 kg/m²）' };
    var levels = GRID_HZ.map(function (f) { return massLaw(m, f); });
    return build({
      bands: GRID_HZ,
      levels: levels,
      mass: m,
      coincidence: o.materialId ? coincidence(o.materialId, o.thickness) : null
    });
  }

  // 双层构件简化估算：质量定律 + 空气层增量（经验增量，供方案比选）
  function doubleLeaf(o) {
    o = o || {};
    var m1 = num(o.mass1), m2 = num(o.mass2), d = num(o.cavity);
    if (m1 == null || m1 <= 0 || m2 == null || m2 <= 0) {
      return { ok: false, error: '请给出两层板的面密度（> 0 kg/m²）' };
    }
    var mTotal = m1 + m2;
    var base = GRID_HZ.map(function (f) { return massLaw(mTotal, f) + 3; });
    var cavityBonus = (d != null && d > 0) ? 12 * Math.log10(1 + d / 50) : 0;
    var levels = base.map(function (v) { return v + cavityBonus; });
    return build({ bands: GRID_HZ, levels: levels, mass: mTotal, cavityBonus: cavityBonus });
  }

  // 由实测/输入隔声量直接评级
  // 支持：17 带（100–4000 Hz）／16 带（125–4000 Hz，仅 STC）／5 带（倍频程，仅 Rw）
  function fromLevels(levels, bands) {
    if (!levels || !levels.length) return { ok: false, error: '请填入隔声量数据' };
    if (!bands) {
      if (levels.length === GRID_HZ.length) bands = GRID_HZ;
      else if (levels.length === CONTOUR_HZ.length) bands = CONTOUR_HZ;
      else if (levels.length === GB_OCT_HZ.length) bands = GB_OCT_HZ;
      else {
        return {
          ok: false,
          error: '频带数量不符合要求：应为 17 个 1/3 倍频带（100–4000 Hz）、16 个 1/3 倍频带（125–4000 Hz）或 5 个倍频带（125–2000 Hz）'
        };
      }
    }
    var vals = levels.map(function (v) { return num(v); });
    return build({ bands: bands, levels: vals });
  }

  var API = {
    GRID_HZ: GRID_HZ,
    CONTOUR_HZ: CONTOUR_HZ,
    CONTOUR_REL: CONTOUR_REL,
    GB_HZ: GB_HZ,
    GB_REF_REL: GB_REF_REL,
    GB_OCT_HZ: GB_OCT_HZ,
    GB_OCT_REF_REL: GB_OCT_REF_REL,
    SPECTRUM_C_TERZ: SPECTRUM_C_TERZ,
    SPECTRUM_CTR_TERZ: SPECTRUM_CTR_TERZ,
    GB_REQUIREMENTS: GB_REQUIREMENTS,
    MATERIALS: MATERIALS,
    findMaterial: findMaterial,
    findRequirement: findRequirement,
    faceMass: faceMass,
    massLaw: massLaw,
    coincidence: coincidence,
    align: align,
    stc: stc,
    gbRw: gbRw,
    checkRequirement: checkRequirement,
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
