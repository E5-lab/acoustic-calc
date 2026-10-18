/*
 * calc-b5.js — 声明式计算器 · 测量与校准（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "测量与校准"）：
 *   calib          校准器换算（标称 94/114 dB、参考频率 → 实际灵敏度修正）
 *   oct-band       倍频带中心频率与带宽（带宽类型 1/1 / 1/3 → 各中心频率与带宽）
 *   uncertainty    不确定度合成（重复性标准差、系统误差限 → 合成标准/扩展不确定度）
 *   mic-response   传声器入射角修正（入射角 θ、频率 f → 自由场/压力响应修正 dB）
 *   time-weight    F/S/I 时间计权读数差（脉冲/稳态信号长度 → 不同计权读数差估算）
 *
 * 实现后请在 tests/ 下新增 calc-b5.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +5（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 5 个计算器。
})();
