/*
 * calc-b8.js — 声明式计算器 · 振动与结构（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "振动与结构"）：
 *   transmissibility  单自由度隔振传递率（频率比 r=f/fn、阻尼比 ζ → 传递率 T、隔振效率）
 *   natural-freq      梁/板/弹簧固有频率（质量 m、刚度 k 或几何参数 → 固有频率 fn）
 *   wave-vib          结构弯曲波速（材料参数、频率、板厚 → 弯曲波相速度）
 *   isolator-pick     隔振器选型（设备重量 W、干扰频率 f、目标隔离 → 所需静变形/刚度）
 *
 * 实现后请在 tests/ 下新增 calc-b8.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +4（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 4 个计算器。
})();
