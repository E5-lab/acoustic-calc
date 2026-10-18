/*
 * calc-b2.js — 声明式计算器 · 电声与系统（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "电声与系统"）：
 *   directivity     指向性因数 Q / DI（辐射半角或阵列口径 → Q、DI=10log10Q）
 *   nearfar         近场远场分界（口径 D、频率 f → 过渡距离 r≈D²/(4λ)）
 *   roomgain        边界增益 / SBIR（距墙/地面距离 d、频率 f → 镜像叠加增益 dB）
 *   spl-vs-dist     点声源距离衰减（声功率 Lw、指向性 Q、距离 r → 声压级 Lp，含半球/自由场）
 *   damping-factor  功放阻尼系数影响（阻尼系数 DF、负载阻抗 Z → 低频阻尼误差 %）
 *   delay-align     扬声器延时/相位对齐（路径差 Δd → 延时 ms、相位差 °）
 *
 * 实现后请在 tests/ 下新增 calc-b2.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +6（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 6 个计算器。
})();
