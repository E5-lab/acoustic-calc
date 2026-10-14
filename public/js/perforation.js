/*
 * perforation.js — 穿孔率计算内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Perforation，Node 下 module.exports。
 *
 * 参考实现：E5-lab/AC_Calc 中的「金属微穿孔率计算」
 *   正方形对称阵列  σ = πd² / (4P²)
 *   45° 菱形错排    σ = πd² / (2P²)
 *   矩形非等边错排  σ = πd² / (2·P1·P2)
 * 本内核在此基础上：
 *   1) 统一以「单元面积」推导，便于解释与扩展；
 *   2) 增加「等边三角形错排（六方阵列）」σ = πd² / (2√3·P²)，此为几何精确解；
 *   3) 增加反算（给定目标穿孔率求中心距）、加工校核、微穿孔板共振频率估算。
 *
 * 单位约定：长度均为 mm，穿孔率以百分数返回（σ = 12.5 表示 12.5%）。
 */
(function (global) {
  'use strict';

  var C_AIR = 343000;              // 声速 mm/s（20 ℃）

  // 阵列形制定义。cell 为单元面积表达式，用于界面展示与公式自检。
  var PATTERNS = [
    {
      id: 'square',
      name: '正方形对称阵列',
      en: 'Square Matrix',
      cell: 'P²',
      desc: '孔眼行列垂直正交对齐排布，加工最简单',
      fields: ['d', 'P'],
      pitchLabel: 'P（中心距）'
    },
    {
      id: 'diamond-square',
      name: '45° 菱形错排',
      en: 'Staggered 45°',
      cell: 'P² / 2',
      desc: '隔行错开半个孔距，空间利用率高于正方形阵列',
      fields: ['d', 'P'],
      pitchLabel: 'P（相邻孔心距）'
    },
    {
      id: 'hex',
      name: '等边三角形错排（六方）',
      en: 'Equilateral Hexagonal',
      cell: '(√3 / 2) P²',
      desc: '等边三角形阵列，同孔径下穿孔率最高、板面最均匀',
      fields: ['d', 'P'],
      pitchLabel: 'P（相邻孔心距）'
    },
    {
      id: 'diamond-rect',
      name: '矩形非等边错排',
      en: 'Staggered Rectangular',
      cell: 'P1 · P2 / 2',
      desc: '横向与纵向中心距不同，用于各向异性吸声设计',
      fields: ['d', 'P1', 'P2'],
      pitchLabel: 'P1 / P2'
    }
  ];

  function findPattern(id) {
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].id === id) return PATTERNS[i];
    }
    return null;
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function holeArea(d) { return Math.PI * d * d / 4; }

  // 单元面积 mm²
  function unitCellArea(pattern, o) {
    o = o || {};
    var d = num(o.d), P = num(o.P), P1 = num(o.P1), P2 = num(o.P2);
    switch (pattern) {
      case 'square':
        return (P > 0) ? P * P : null;
      case 'diamond-square':
        return (P > 0) ? P * P / 2 : null;
      case 'hex':
        return (P > 0) ? Math.sqrt(3) / 2 * P * P : null;
      case 'diamond-rect':
        return (P1 > 0 && P2 > 0) ? P1 * P2 / 2 : null;
      default:
        return null;
    }
  }

  // 主轴中心距（用于 d/P 与加工校核）
  function pitchOf(pattern, o) {
    if (pattern === 'diamond-rect') {
      var P1 = num(o.P1), P2 = num(o.P2);
      if (P1 == null || P2 == null) return null;
      // 取实际相邻孔心距 = sqrt((P1/2)² + (P2/2)²) 的等效值更贴近几何，
      // 但加工校核按较小中心距（最窄处）作为控制量。
      return Math.min(P1, P2);
    }
    return num(o.P);
  }

  // 穿孔率主计算
  function perforationRate(o) {
    o = o || {};
    var pattern = o.pattern || 'square';
    if (!findPattern(pattern)) return { ok: false, error: '未知的阵列形制' };

    var d = num(o.d);
    if (d == null || d <= 0) return { ok: false, error: '请输入有效的微孔直径 d（> 0）' };

    var cell = unitCellArea(pattern, o);
    if (cell == null || !(cell > 0)) return { ok: false, error: '请输入有效的中心距（> 0）' };

    var pitch = pitchOf(pattern, o);
    if (pattern === 'diamond-rect') {
      var P1 = num(o.P1), P2 = num(o.P2);
      if (P1 == null || P1 <= 0 || P2 == null || P2 <= 0) {
        return { ok: false, error: '矩形错排需同时给出 P1、P2（均 > 0）' };
      }
      if (d >= Math.min(P1, P2)) {
        return { ok: false, error: '孔径 d 不小于中心距，孔眼已相交（d ≥ min(P1, P2)）' };
      }
    } else {
      var P = num(o.P);
      if (P == null || P <= 0) return { ok: false, error: '请输入有效的中心距 P（> 0）' };
      if (d >= P) return { ok: false, error: '孔径 d 不小于中心距 P，孔眼已相交（d ≥ P）' };
    }

    var hole = holeArea(d);
    var rate = hole / cell * 100;
    var holes = 1e6 / cell;                    // 孔数 个 / m²
    var dOverP = d / pitch;
    var metal = 1 - rate / 100;                // 剩余板面比例

    var warnings = [];
    if (pitch - d < 0.8) {
      warnings.push({ level: 'warn', text: '剩余孔间壁仅 ' + (pitch - d).toFixed(2) + ' mm，冲孔/钻孔易变形，建议激光加工或加大中心距。' });
    }
    if (rate > 30) {
      warnings.push({ level: 'warn', text: '穿孔率超过 30%，板面强度与刚度显著下降，需做结构校核。' });
    }
    if (rate < 0.3) {
      warnings.push({ level: 'info', text: '穿孔率低于 0.3%，已进入微穿孔板（MPP）典型下限区间，需精密加工。' });
    }
    if (d > 15) {
      warnings.push({ level: 'info', text: '孔径 ' + d + ' mm 偏大，孔内声质量与端部修正影响明显，低频吸声会减弱。' });
    }

    return {
      ok: true,
      pattern: pattern,
      patternName: findPattern(pattern).name,
      rate: rate,
      fraction: rate / 100,
      cell: cell,
      hole: hole,
      holes: holes,
      pitch: pitch,
      dOverP: dOverP,
      solidRatio: metal,
      warnings: warnings,
      klass: classify(rate)
    };
  }

  // 穿孔率区间分类
  function classify(rate) {
    if (rate == null || isNaN(rate)) return { id: 'na', label: '—', note: '' };
    if (rate < 0.3) return { id: 'mpp-low', label: '极低穿孔率', note: '微穿孔板（MPP）下限附近，通常靠共振腔实现低频吸收。' };
    if (rate < 3) return { id: 'mpp', label: '微穿孔板区间', note: '微穿孔板常见穿孔率 0.5%–3%，孔径宜 0.5–2 mm，配合 50–200 mm 空腔。' };
    if (rate <= 15) return { id: 'normal', label: '常规穿孔板区间', note: '常规穿孔吸声板常见 3%–15%，多为穿孔板 + 后置空腔/多孔材料复合结构。' };
    if (rate <= 30) return { id: 'high', label: '高穿孔率', note: '孔阵较密，板面强度与刚度需另行校核；透声性已较高，吸声效果主要取决于后置材料。' };
    return { id: 'very-high', label: '超高穿孔率', note: '超出常规吸声板范围，请确认是否为通风/声屏障等用途。' };
  }

  // 反算：给定目标穿孔率，求所需中心距（矩形错排需固定 P2，返回 P1）
  function solvePitch(o) {
    o = o || {};
    var pattern = o.pattern || 'square';
    var d = num(o.d);
    var target = num(o.targetRate);
    if (d == null || d <= 0) return { ok: false, error: '请输入有效的微孔直径 d（> 0）' };
    if (target == null || target <= 0 || target >= 100) return { ok: false, error: '目标穿孔率需在 0–100% 之间' };

    var s = target / 100;
    var out = { ok: true, pattern: pattern, rate: target };

    if (pattern === 'square') {
      out.P = Math.sqrt(Math.PI * d * d / (4 * s));
      out.label = '中心距 P';
    } else if (pattern === 'diamond-square') {
      out.P = Math.sqrt(Math.PI * d * d / (2 * s));
      out.label = '相邻孔心距 P';
    } else if (pattern === 'hex') {
      out.P = Math.sqrt(Math.PI * d * d / (2 * Math.sqrt(3) * s));
      out.label = '相邻孔心距 P';
    } else if (pattern === 'diamond-rect') {
      var P2 = num(o.P2);
      if (P2 == null || P2 <= 0) return { ok: false, error: '矩形错排反算需先给出固定的 P2（> 0）' };
      out.P1 = Math.PI * d * d / (2 * s * P2);
      out.P2 = P2;
      out.label = '横向中心距 P1';
    } else {
      return { ok: false, error: '未知的阵列形制' };
    }

    var control = out.P1 != null ? Math.min(out.P1, out.P2) : out.P;
    if (control <= d) return { ok: false, error: '目标穿孔率过大，所需中心距小于孔径，无法实现' };
    return out;
  }

  // 微穿孔板（MPP）共振频率估算：f0 = c/(2π)·√(σ / (t' · D))
  // t' = t + 0.85d（Maa 端部修正），σ 为穿孔率分数，t'、D 单位 mm
  function mppResonance(o) {
    o = o || {};
    var d = num(o.d), t = num(o.t), D = num(o.cavity), rate = num(o.rate);
    if (d == null || t == null || D == null || rate == null) return null;
    if (d <= 0 || t <= 0 || D <= 0 || rate <= 0) return null;
    var tEff = t + 0.85 * d;
    var f0 = C_AIR / (2 * Math.PI) * Math.sqrt((rate / 100) / (tEff * D));
    return {
      f0: f0,
      tEff: tEff,
      quarterWave: C_AIR / (4 * f0),      // 对应 1/4 波长（mm）
      valid: (rate <= 5 && d <= 3),
      note: (rate <= 5 && d <= 3)
        ? '孔径与穿孔率满足微穿孔板适用范围（d ≤ 3 mm，σ ≤ 5%），公式适用。'
        : '孔径或穿孔率超出微穿孔板适用范围，本估算仅作数量级参考。'
    };
  }

  var API = {
    PATTERNS: PATTERNS,
    findPattern: findPattern,
    holeArea: holeArea,
    unitCellArea: unitCellArea,
    perforationRate: perforationRate,
    classify: classify,
    solvePitch: solvePitch,
    mppResonance: mppResonance
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Perforation = API;
  }
})(typeof window !== 'undefined' ? window : this);
