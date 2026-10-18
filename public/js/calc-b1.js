/*
 * calc-b1.js — 声明式计算器 · 材料与建筑声学（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "材料与建筑声学"）：
 *   mpp            微穿孔板吸声设计器（孔径 d / 板厚 t / 空腔 D / 穿孔率 → α 峰值频率 f0、峰值 α）
 *   coincidence    临界吻合频率 fc（面密度 m′、板厚 h、杨氏模量 E、泊松比 ν → fc、纵波速 cL）
 *   sabine-alpha   由混响测吸声系数（T60、体积 V、表面积 S → α，Sabine / Eyring 两式）
 *   cavity-abs     薄板/膜共振吸声峰（质量面密度 m′、空腔深度 D、阻尼 → f0、半功率带宽）
 *   wall-tl        单层墙质量定律+吻合（面密度 m′、频率 f、入射角 θ → TL）
 *   floor-float    浮筑楼板改善量（基层 TL、弹性层固有频率 fn → 附加 ΔR）
 *
 * 实现后请在 tests/ 下新增 calc-b1.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +6（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 6 个计算器。
})();
