/*
 * calc-b3.js — 声明式计算器 · 心理与音乐声学（待实现块，交协作 AI 填充）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 必须为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块需实现的工具（route / 名称 / nav.group = "心理与音乐声学"）：
 *   cents          音分↔频率换算（半音数/音分数 → 频率比；根音频率 → 目标频率）
 *   bark-erb       临界带 Bark / ERB（频率 f → 临界带号 z、ERB 带宽 Hz）
 *   chord          和弦/音程频率（根音频率、音程类型 → 各音频率）
 *   masking        临界带掩蔽阈值（掩蔽声频率/声压级 → 掩蔽阈值曲线关键点）
 *   loudness-zwicker  Zwicker 响度（倍频带声压级 → 响度 sone 近似值）
 *
 * 实现后请在 tests/ 下新增 calc-b3.test.js（纯函数断言，参照 calc-b7.test.js），
 * 并在 index.html 的模块计数 hint 中把总数 +5（最终由汇总步骤统一核对）。
 */
(function () {
  'use strict';
  // TODO: 参照 calc-b7.js 实现上述 5 个计算器。
})();
