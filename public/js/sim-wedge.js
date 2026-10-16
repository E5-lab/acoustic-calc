/*
 * sim-wedge.js — 消声室吸声楔（anechoic wedge）截止频率设计内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimWedge，Node 下 module.exports。
 *
 * 公式来源：消声室吸声楔的"四分之一波长 / 半波长"经验准则（公开经典声学经验法则，
 *   不含任何第三方商业实现）。吸声楔通过让表面阻抗从空气逐渐过渡到材料，
 *   将入射波"渐变匹配"进楔谷而被吸收；楔越长，越低的频率也能被有效吸收。
 *
 * 单位约定：长度 m；声速 c 默认 343 m/s（20 ℃ 空气）。所有输出均为 SI 单位。
 *
 * 截止频率约定（在 notes 中向用户明确说明）：
 *   - 保守估计（本工具采用）：fCut = c / (2·L)。物理含义：当波长 λ ≈ 2L 时，
 *     楔长已约为半个波长，可视为"楔有效"的保守上限。
 *   - 常见四分之一波长准则：许多文献取楔长 L ≈ λ/4 作为有效条件，
 *     即 f ≈ c/(4L)。两种方法给出不同的设计余量，本工具以 c/(2L) 为准并标注 c/(4L)。
 */
(function (global) {
  'use strict';

  var C_AIR = 343;       // 声速 m/s（20 ℃ 空气），可由 opts.c 覆盖
  var SPACING = 0.3;     // 假定楔间距 s（m），用于数量/体积估算，可在 notes 中说明

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /*
   * design(opts) → { ok, L, fCut, Lneeded, ratio, countForRoom, volEach, notes }
   *   opts.L        : 楔长 L（m，向室内凸出的长度），默认 1.0
   *   opts.fTarget  : 目标低频限 fTarget（Hz），默认 100
   *   opts.roomW/H/D: 房间尺寸（m，可选），用于估算楔数量
   *   opts.c        : 声速（m/s），默认 343
   * 返回 ok:false 时附带 error 字段。
   */
  function design(opts) {
    opts = opts || {};
    var L = num(opts.L);
    var fTarget = num(opts.fTarget);
    var c = num(opts.c);
    var roomW = num(opts.roomW);
    var roomH = num(opts.roomH);
    var roomD = num(opts.roomD);

    if (L == null) L = 1.0;
    if (fTarget == null) fTarget = 100;
    if (c == null) c = C_AIR;

    // 校验
    if (!(L > 0)) return { ok: false, error: '楔长 L 必须为正数（m）' };
    if (!(fTarget > 0)) return { ok: false, error: '目标频率 fTarget 必须为正数（Hz）' };
    if (!(c > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };

    // 核心公式
    var fCut = c / (2 * L);                 // 保守截止：λ ≈ 2L
    var fCutQuarter = c / (4 * L);         // 四分之一波长准则参考值
    var Lneeded = c / (2 * fTarget);       // 为达到 fTarget 所需的楔长
    var ratio = L / Lneeded;               // ≥1 表示满足目标

    // 房间楔数量估算（6 个面）：总表面积 / 单楔占用面积
    // 单楔占用面积近似为 s·L（s 为间距，L 为楔在墙面上的投影长度），
    // 这是一个简化的几何占位估算，仅供预算参考。
    var countForRoom = null;
    var totalArea = null;
    if (roomW > 0 && roomH > 0 && roomD > 0) {
      totalArea = 2 * (roomW * roomH + roomW * roomD + roomH * roomD);
      countForRoom = totalArea / (SPACING * L); // 简化为总面积 / (s·L)
    }

    // 单个楔体积（三角棱柱）：V = (1/2)·底·高 · 深
    // 底 = L/2，高（凸出长度）= L，深（沿墙面挤出，取间距 s）
    var volEach = 0.5 * (L / 2) * L * SPACING; // = 0.25·L²·s  (m³)

    var notes = [
      '吸声楔原理：楔形使表面声阻抗从空气沿楔长逐渐过渡到材料，将入射波"渐变匹配"进楔谷、转化为粘滞/多孔损耗而被吸收，而非硬反射。',
      '楔越长 → 越低频率也被有效吸收（截止频率越低）。本工具采用保守估算 fCut = c/(2·L)（即 λ ≈ 2L）。',
      '四分之一波长准则（文献常见）：取 L ≈ λ/4 即 f ≈ c/(4·L) = ' + fCutQuarter.toFixed(2) + ' Hz 也可作为更宽松的有效条件；本结果不涵盖该准则。',
      'ratio = L/Lneeded：≥1 表示当前楔长满足目标低频限 fTarget；<1 表示需要在 fTarget 以下加长楔。',
      '数量与体积仅为简化几何占位估算（假定间距 s = ' + SPACING.toFixed(2) + ' m，单楔占位 ≈ s·L）；实际消声室还需预留楔体积带来的可用空间预算与结构荷载。',
      '本工具为经验准则估算，不含 BEM/FEM 物理仿真；最终性能以现场混响/本底噪声测量为准。'
    ];

    return {
      ok: true,
      L: L,
      fTarget: fTarget,
      c: c,
      fCut: fCut,
      fCutQuarter: fCutQuarter,
      Lneeded: Lneeded,
      ratio: ratio,
      countForRoom: countForRoom == null ? null : Math.round(countForRoom),
      roomArea: totalArea == null ? null : totalArea,
      volEach: volEach,
      notes: notes
    };
  }

  var API = { design: design, C_AIR: C_AIR, SPACING: SPACING };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimWedge = API;
  }
})(typeof window !== 'undefined' ? window : this);
