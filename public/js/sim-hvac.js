/*
 * sim-hvac.js — HVAC 消声器（吸声衬里直管段）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimHvac，Node 下 module.exports。
 *
 * 公式来源（简化 Beranek / Sabine 衬里直管段估算，仅供数量级参考）：
 *   - L. L. Beranek, "Acoustics" (1954) —— 有效吸声系数 ae = a / (2 - a)
 *   - 衬里直管段衰减率 rate ≈ K · ae · (P / S) （dB/m），插入损失 dL = rate · L
 *   - 压力损失 dp = xi · ρ · (Q / S)² / 2 （Pa），按动压换算
 *
 * 单位约定：SI。长度 m；面积 m²；频率 Hz；衰减 dB/m 与 dB；压力损失 Pa。
 * 本内核只做「参数化的数量级估算」，真实设计须采用厂家实测曲线 / 相关标准
 * （如 ISO 7235 实验室测量方法）。K 为可调标定常数（默认 1.0）。
 */
(function (global) {
  'use strict';

  // 标准倍频程中心频率（1/1 倍频程，8 个频段）
  var BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // 返回每频段的有效吸声系数、衰减率与插入损失
  function attenuation(opts) {
    opts = opts || {};

    var w = num(opts.w);
    var h = num(opts.h);
    var L = num(opts.L);
    var K = num(opts.K);
    var Q = num(opts.Q);
    var rho = num(opts.rho);
    var xi = num(opts.xi);
    var alpha = opts.alpha;

    if (!(w > 0)) return { ok: false, error: '风管宽度 w 必须为正数（m）' };
    if (!(h > 0)) return { ok: false, error: '风管高度 h 必须为正数（m）' };
    if (!(L > 0)) return { ok: false, error: '消声器长度 L 必须为正数（m）' };

    if (K == null || isNaN(K)) K = 1.0;
    if (rho == null || isNaN(rho)) rho = 1.2;
    if (xi == null || isNaN(xi)) xi = 0.8;

    // 解析 alpha：单个数值 0..1 或长度为 8 的逐频段数组
    var perBand = false;
    if (Array.isArray(alpha)) {
      if (alpha.length !== 8) {
        return { ok: false, error: '逐频段吸声系数 alpha 必须为长度 8 的数组（对应 63…8000 Hz）' };
      }
      for (var i0 = 0; i0 < 8; i0++) {
        var a0 = num(alpha[i0]);
        if (a0 == null || a0 < 0 || a0 > 1) {
          return { ok: false, error: '吸声系数必须落在 [0,1]，第 ' + (i0 + 1) + ' 个频段越界' };
        }
      }
      perBand = true;
    } else {
      var aSingle = num(alpha);
      if (aSingle == null || aSingle < 0 || aSingle > 1) {
        return { ok: false, error: '吸声系数 alpha 必须落在 [0,1]' };
      }
    }

    // 几何量（假设四面均衬吸声材料）
    var S = w * h;            // 截面面积 m²
    var P = 2 * (w + h);      // 衬里面周长 m

    var bands = [];
    var rateDom = 0;          // 记录主导（最大）衰减率，用于动画包络
    for (var i = 0; i < 8; i++) {
      var a = perBand ? num(alpha[i]) : num(alpha);
      var ae = a / (2 - a);              // Beranek 有效吸声系数
      var rate = K * ae * (P / S);       // dB/m
      var dL = rate * L;                 // 该频段插入损失 dB
      if (rate > rateDom) rateDom = rate;
      bands.push({ freq: BANDS[i], alpha: a, rate: rate, dL: dL });
    }

    // 压力损失：仅在给出体积流量 Q 时计算
    var dp = null;
    if (Q != null && !isNaN(Q) && S > 0) {
      dp = xi * rho * Math.pow(Q / S, 2) / 2; // Pa
    }

    var notes = [
      '本计算为简化「衬里直管段」数量级估算：衰减率 rate ≈ K·ae·(P/S)，插入损失 dL = rate·L。',
      'ae = a/(2−a) 为 Beranek 有效吸声系数；P/S 为周长面积比（衬里越"瘦长"衰减越强）。',
      'K = ' + K + ' 为可调标定常数，用于按具体衬里构造/安装条件校准；出厂默认 1.0。',
      '真实消声器性能须以厂家实测插入损失曲线为准，并参照 ISO 7235 等标准实验室方法校核。'
    ];

    return {
      ok: true,
      S: S,
      P: P,
      bands: bands,
      rateDom: rateDom,
      dp: dp,
      notes: notes
    };
  }

  var API = {
    BANDS: BANDS,
    attenuation: attenuation
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimHvac = API;
  }
})(typeof window !== 'undefined' ? window : this);
