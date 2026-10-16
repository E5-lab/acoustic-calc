/*
 * sim-impedance.js — 声阻抗 反射/透射 模拟内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimImpedance，Node 下 module.exports。
 *
 * 物理模型：平面波垂直入射到两种介质之间的平面界面（法向入射）。
 *   介质特性阻抗 Z = ρ·c（瑞利，rayl = Pa·s/m）。
 *   压力反射系数 R、压力透射系数 T、强度反射/透射系数与传声损失 TL。
 *   公式来源：经典法向入射声传播理论（声学教材标准结果），非第三方商业实现。
 *
 * 单位约定：ρ 为 kg/m³，c 为 m/s；Z 为 rayl；TL 为 dB。
 */
(function (global) {
  'use strict';

  // 介质预设（ρ kg/m³, c m/s）。c 为各介质自身声速，无需统一默认声速。
  var PRESETS = {
    air:      { name: '空气（20 ℃）', rho: 1.2,   c: 343 },
    water:    { name: '水',           rho: 1000,  c: 1480 },
    steel:    { name: '钢',           rho: 7800,  c: 5900 },
    concrete: { name: '混凝土',       rho: 2400,  c: 3500 },
    wood:     { name: '木材',         rho: 500,   c: 3800 },
    custom:   { name: '自定义',       rho: null,  c: null }
  };

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /*
   * interfaceZ(opts)
   *   opts.medium1 = { rho, c }
   *   opts.medium2 = { rho, c }
   * 返回 { ok, Z1, Z2, R, T, RI, TI, TL, notes } 或 { ok:false, error }
   */
  function interfaceZ(opts) {
    opts = opts || {};
    var m1 = opts.medium1 || {};
    var m2 = opts.medium2 || {};
    var r1 = num(m1.rho), c1 = num(m1.c);
    var r2 = num(m2.rho), c2 = num(m2.c);

    if (!(r1 > 0) || !(c1 > 0) || !(r2 > 0) || !(c2 > 0)) {
      return { ok: false, error: 'ρ 与 c 均须为有限正数（ρ>0, c>0）。' };
    }

    var Z1 = r1 * c1;          // 介质1 特性阻抗 (rayl)
    var Z2 = r2 * c2;          // 介质2 特性阻抗 (rayl)
    var sum = Z2 + Z1;

    var R = (Z2 - Z1) / sum;   // 压力反射系数（可正可负，±1 表示全反射）
    var T = 2 * Z2 / sum;      // 压力透射系数
    var RI = R * R;            // 强度反射系数（能量比，0~1）
    var TI = 1 - RI;           // 强度透射系数
    var TL = TI > 0 ? -10 * Math.log10(TI) : Infinity; // 传声损失 (dB)

    // 中文说明
    var ratio = Math.max(Z1, Z2) / Math.min(Z1, Z2);
    var notes;
    if (!isFinite(TL)) {
      notes = '阻抗完全匹配（Z1 = Z2）或一方为零，无法定义传声损失。';
    } else if (ratio > 1000) {
      notes = '阻抗严重失配：几乎全反射，透射能量极低（如空气→钢/水界面）。';
    } else if (ratio > 10) {
      notes = '阻抗失配明显：大部分声能反射，透射较弱。';
    } else if (ratio < 1.1) {
      notes = '阻抗接近匹配：绝大部分声能透射，反射很弱。';
    } else {
      notes = '中等阻抗差异：部分反射、部分透射。';
    }

    return {
      ok: true,
      Z1: Z1, Z2: Z2,
      R: R, T: T,
      RI: RI, TI: TI, TL: TL,
      notes: notes
    };
  }

  var API = {
    PRESETS: PRESETS,
    interfaceZ: interfaceZ
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimImpedance = API;
  }
})(typeof window !== 'undefined' ? window : this);
