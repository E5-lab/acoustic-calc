/*
 * calc-b6.js — 声明式计算器 · 超声/结构/材料声速（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "超声/结构/声速"）：
 *   wavespeed-solid  固体纵/横波声速（弹性模量 E、剪切模量 G、密度 ρ、泊松比 ν → cL、cS）
 *   snell            斯涅尔定律/临界角（两介质声速 c1、c2、入射角 θ1 → 折射角 θ2、临界角）
 *   attenuation      材料衰减系数（频率 f、材料衰减常数 → α dB/(cm 或 m)）
 *   lamb             兰姆波/板波相速度（板厚 h、频率 f、纵波速 cL、横波速 cS → 模式相速度）
 *   longi-trans      纵波透射/反射系数（两介质特性阻抗 Z1、Z2 → 反射 R、透射 T）
 *
 * 实现后请在 tests/ 下新增 calc-b6.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +5（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 5 个计算器。
})();
