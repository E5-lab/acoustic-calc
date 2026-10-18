/*
 * calc-b4.js — 声明式计算器 · 噪声与法规（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "噪声与法规"）：
 *   lwp            声功率 Lw→声压 Lp（声功率级 Lw、指向性 Q、距离 r、空间类型 → Lp）
 *   facade         建筑立面/窗外衰减（距外墙距离、楼层高度 → ΔL 近似）
 *   fan-noise      风机噪声频谱（流量 Q、全压 Δp、转速 n → 倍频带声功率级估算）
 *   valve-noise    阀门噪声 IEC 60534（压差 Δp、孔径 d、下游密度 ρ → 声压级与修正）
 *   jet-noise      喷流/排气噪声（喷口速度 U、直径 D → 总声功率级与指向性指数）
 *   railway        铁路噪声简化（列车速度 v、车型/轴重 → 等效连续声级 Leq 近似）
 *
 * 实现后请在 tests/ 下新增 calc-b4.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +6（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 6 个计算器。
})();
