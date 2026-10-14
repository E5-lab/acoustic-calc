/*
 * room.js — 室内混响时间（RT60）内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Room，Node 下 module.exports。
 *
 * 计算式：
 *   Sabine   ：RT = 0.161 V / A          A = Σ αᵢ Sᵢ + 4 m V
 *   Eyring   ：RT = 0.161 V / (−S ln(1 − ᾱ) + 4 m V)
 *   其中 ᾱ = Σ αᵢ Sᵢ / S 为平均吸声系数，m 为空气吸收衰减系数（1/m）。
 * 空气吸收按 ISO 9613-1 在 20 ℃、50 % RH 的典型值折算（仅高频显著）。
 */
(function (global) {
  'use strict';

  var BANDS = [125, 250, 500, 1000, 2000, 4000];

  // 空气吸收衰减（dB/km，20 ℃、50 % RH，ISO 9613-1 量级）
  var AIR_DB_PER_KM = [0.38, 1.13, 2.36, 4.08, 8.75, 26.40];
  var AIR_M = AIR_DB_PER_KM.map(function (v) { return v / 1000 / 8.686; }); // → 1/m

  // 常用表面材料的吸声系数（125 / 250 / 500 / 1k / 2k / 4k）
  var MATERIALS = [
    { id: 'plaster', name: '抹灰墙面 / 涂料墙', alpha: [0.02, 0.02, 0.03, 0.04, 0.05, 0.05] },
    { id: 'concrete', name: '混凝土 / 砖墙（未处理）', alpha: [0.02, 0.02, 0.03, 0.03, 0.04, 0.05] },
    { id: 'tile', name: '瓷砖 / 大理石 / 水磨石', alpha: [0.01, 0.01, 0.01, 0.01, 0.02, 0.02] },
    { id: 'woodfloor', name: '硬木地板（架空）', alpha: [0.15, 0.11, 0.10, 0.07, 0.06, 0.07] },
    { id: 'woodfloor-glue', name: '木地板（粘贴于楼板）', alpha: [0.04, 0.04, 0.05, 0.06, 0.07, 0.07] },
    { id: 'carpet', name: '地毯（厚，铺于混凝土）', alpha: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73] },
    { id: 'carpet-thin', name: '地毯（薄，铺于混凝土）', alpha: [0.02, 0.06, 0.14, 0.37, 0.60, 0.65] },
    { id: 'glass', name: '玻璃窗（单层，大面积）', alpha: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02] },
    { id: 'glass-large', name: '玻璃幕墙（大面积）', alpha: [0.05, 0.03, 0.02, 0.02, 0.02, 0.02] },
    { id: 'gypsum-ceiling', name: '石膏板吊顶', alpha: [0.29, 0.10, 0.05, 0.04, 0.07, 0.09] },
    { id: 'perf-ceiling', name: '穿孔板吊顶 + 50 mm 空腔', alpha: [0.30, 0.45, 0.50, 0.55, 0.55, 0.50] },
    { id: 'mineral-panel', name: '矿棉吸声板（25 mm）', alpha: [0.30, 0.60, 0.85, 0.90, 0.90, 0.90] },
    { id: 'suspended-panel', name: '空间吸声体（悬吊板）', alpha: [0.35, 0.70, 0.90, 0.95, 0.95, 0.90] },
    { id: 'wooddoor', name: '木门 / 木饰面', alpha: [0.14, 0.10, 0.06, 0.08, 0.10, 0.10] },
    { id: 'seats-soft', name: '观众座椅（软包，无人）', alpha: [0.44, 0.60, 0.77, 0.89, 0.82, 0.70] },
    { id: 'audience', name: '观众（满场就座）', alpha: [0.55, 0.70, 0.85, 0.90, 0.90, 0.85] },
    { id: 'curtain-heavy', name: '厚重幕布（离墙褶皱）', alpha: [0.14, 0.35, 0.55, 0.72, 0.70, 0.65] },
    { id: 'curtain-thin', name: '薄窗帘（贴窗）', alpha: [0.05, 0.06, 0.39, 0.63, 0.70, 0.73] },
    { id: 'carpet-wall', name: '墙面软包 / 织物墙布', alpha: [0.10, 0.25, 0.45, 0.65, 0.70, 0.70] },
    { id: 'vent', name: '通风口 / 开口（计入吸声）', alpha: [0.30, 0.30, 0.30, 0.30, 0.30, 0.30] }
  ];

  // 房间用途与推荐中频（500 Hz–1 kHz）混响时间范围
  var ROOM_USES = [
    { id: 'studio-speech', name: '语言录音室 / 配音间', rt: [0.20, 0.35], note: '体积小、以语言清晰度为主' },
    { id: 'studio-music', name: '音乐录音室 / 控制室', rt: [0.25, 0.40], note: '含控制室与混音间' },
    { id: 'classroom', name: '教室 / 培训室', rt: [0.50, 0.80], note: 'GB/T 50121 教学用房常用范围' },
    { id: 'meeting', name: '会议室 / 报告厅（< 500 m³）', rt: [0.50, 0.80], note: '以语言清晰度为主' },
    { id: 'office-open', name: '开放式办公室', rt: [0.40, 0.60], note: '兼顾语音隐私与舒适度' },
    { id: 'office-closed', name: '独立办公室', rt: [0.30, 0.50], note: '小体积房间' },
    { id: 'cinema', name: '影院 / 多功能厅', rt: [0.40, 0.80], note: '环绕声还音要求短混响' },
    { id: 'auditorium', name: '礼堂 / 音乐厅（交响）', rt: [1.50, 2.20], note: '体积越大推荐值越高' },
    { id: 'auditorium-speech', name: '礼堂（以语言为主）', rt: [0.80, 1.20], note: '话剧、会议使用' },
    { id: 'gym', name: '体育馆 / 游泳馆', rt: [1.00, 1.80], note: '大空间、硬质表面' },
    { id: 'restaurant', name: '餐厅 / 咖啡厅', rt: [0.50, 0.90], note: '控制嘈杂度' },
    { id: 'residence', name: '住宅起居室 / 卧室', rt: [0.40, 0.70], note: '住宅室内环境' },
    { id: 'corridor', name: '走廊 / 门厅', rt: [0.60, 1.20], note: '公共通道' }
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
  function findUse(id) {
    for (var i = 0; i < ROOM_USES.length; i++) if (ROOM_USES[i].id === id) return ROOM_USES[i];
    return null;
  }
  function zeroBands() { return BANDS.map(function () { return 0; }); }

  // 几何信息：可直接给体积，或由长宽高推算（含总表面积）
  function geometry(o) {
    var V = num(o.volume);
    var l = num(o.length), w = num(o.width), h = num(o.height);
    if (V == null && l > 0 && w > 0 && h > 0) V = l * w * h;
    if (V == null || V <= 0) return { ok: false, error: '请给出房间体积，或完整的长、宽、高（均 > 0）' };
    var S = (l > 0 && w > 0 && h > 0) ? 2 * (l * w + w * h + l * h) : null;
    return { ok: true, volume: V, dims: { length: l, width: w, height: h }, geomArea: S };
  }

  /*
   * 主计算
   * o = {
   *   volume | length,width,height,
   *   surfaces: [{ name, area, materialId, alpha:[6] | alphaAvg }],
   *   fillerMaterialId,     // 未列出的表面按该材料计（默认抹灰墙面）
   *   airAbsorption: true
   * }
   */
  function compute(o) {
    o = o || {};
    var g = geometry(o);
    if (!g.ok) return g;

    var surfaces = (o.surfaces || []).filter(function (s) {
      return num(s.area) > 0;
    });
    var rows = [];
    var listedArea = 0;

    for (var i = 0; i < surfaces.length; i++) {
      var s = surfaces[i];
      var area = num(s.area);
      var alpha = null;
      if (s.materialId && findMaterial(s.materialId)) {
        alpha = findMaterial(s.materialId).alpha.slice();
      } else if (Array.isArray(s.alpha) && s.alpha.length === BANDS.length) {
        alpha = s.alpha.map(function (v) { return num(v) || 0; });
      } else if (num(s.alphaAvg) != null) {
        alpha = BANDS.map(function () { return num(s.alphaAvg); });
      } else {
        alpha = BANDS.map(function () { return 0.05; });
      }
      rows.push({ name: s.name || findMaterial(s.materialId) && findMaterial(s.materialId).name || '表面', area: area, alpha: alpha });
      listedArea += area;
    }

    // 剩余表面（墙体/顶棚/地面中未单独列出者）
    var totalArea = g.geomArea;
    var filler = findMaterial(o.fillerMaterialId || 'plaster') || MATERIALS[0];
    if (totalArea == null) {
      totalArea = listedArea;
    } else if (totalArea > listedArea + 1e-6) {
      rows.push({
        name: '其余表面（' + filler.name + '）',
        area: totalArea - listedArea,
        alpha: filler.alpha.slice(),
        filler: true
      });
    }

    var absorption = zeroBands();      // Σ αᵢ Sᵢ
    var airTerm = zeroBands();         // 4 m V
    var S = 0;
    rows.forEach(function (r) {
      for (var b = 0; b < BANDS.length; b++) absorption[b] += r.alpha[b] * r.area;
      S += r.area;
    });
    if (o.airAbsorption !== false) {
      for (var b2 = 0; b2 < BANDS.length; b2++) airTerm[b2] = 4 * AIR_M[b2] * g.volume;
    }

    var total = absorption.map(function (a, idx) { return a + airTerm[idx]; });
    var avgAlpha = absorption.map(function (a) { return S > 0 ? Math.min(a / S, 0.999) : 0; });

    var rtSabine = total.map(function (A) { return A > 0 ? 0.161 * g.volume / A : null; });
    var rtEyring = avgAlpha.map(function (am, idx) {
      var A = -S * Math.log(1 - am) + airTerm[idx];
      return A > 0 ? 0.161 * g.volume / A : null;
    });

    return {
      ok: true,
      volume: g.volume,
      dims: g.dims,
      geomArea: g.geomArea,
      totalArea: S,
      rows: rows,
      absorption: absorption,
      airTerm: airTerm,
      totalAbsorption: total,
      avgAlpha: avgAlpha,
      rtSabine: rtSabine,
      rtEyring: rtEyring,
      rtMidSabine: mid(rtSabine),
      rtMidEyring: mid(rtEyring)
    };
  }

  // 中频（500 Hz–1 kHz）混响时间平均
  function mid(rt) {
    var i5 = BANDS.indexOf(500), i1 = BANDS.indexOf(1000);
    var vals = [rt[i5], rt[i1]].filter(function (v) { return v != null && isFinite(v); });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  // 与推荐值比较
  function evaluate(useId, rtMid) {
    var use = findUse(useId) || ROOM_USES[0];
    var v = num(rtMid);
    if (v == null) return { use: use, status: 'na', target: use.rt, text: '数据不足，无法判定' };
    var lo = use.rt[0], hi = use.rt[1];
    if (v >= lo && v <= hi) {
      return { use: use, status: 'pass', target: use.rt, margin: 0, text: '在推荐范围内' };
    }
    var status = v < lo ? 'low' : 'high';
    var margin = v < lo ? lo - v : v - hi;
    return {
      use: use,
      status: status,
      target: use.rt,
      margin: margin,
      text: status === 'low' ? '混响偏短（吸声过量）' : '混响偏长（吸声不足）'
    };
  }

  // 为达标所需增加的吸声量（500 Hz–1 kHz 平均）与等效吸声面积建议
  function suggest(calc, useId, materialId) {
    if (!calc || !calc.ok) return null;
    var use = findUse(useId) || ROOM_USES[0];
    var target = use.rt[1];
    var need = 0.161 * calc.volume / target;         // 目标总吸声量
    var i5 = BANDS.indexOf(500), i1 = BANDS.indexOf(1000);
    var current = (calc.totalAbsorption[i5] + calc.totalAbsorption[i1]) / 2;
    if (current >= need) return { needed: 0, material: null, target: target, current: current };
    var mat = findMaterial(materialId || 'mineral-panel') || MATERIALS[0];
    var alpha = null;
    for (var b = 0; b < BANDS.length; b++) {
      if (BANDS[b] === 500 || BANDS[b] === 1000) alpha = mat.alpha[b];
    }
    alpha = alpha || 0.8;
    return {
      needed: need - current,
      current: current,
      target: target,
      material: mat,
      alpha: alpha,
      area: (need - current) / alpha
    };
  }

  var API = {
    BANDS: BANDS,
    AIR_M: AIR_M,
    MATERIALS: MATERIALS,
    ROOM_USES: ROOM_USES,
    findMaterial: findMaterial,
    findUse: findUse,
    geometry: geometry,
    compute: compute,
    evaluate: evaluate,
    suggest: suggest
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Room = API;
  }
})(typeof window !== 'undefined' ? window : this);
