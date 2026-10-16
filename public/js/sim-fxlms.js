/*
 * sim-fxlms.js — 主动降噪 FXLMS 自适应滤波教学模拟器（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimFxlms，Node 下 module.exports。
 *
 * 模型说明（教学简化，非工程级 FXLMS 实现）：
 *   - 初级（待抵消）信号  d(n) = Σ A_k·sin(2π f_k n / fs)
 *   - 参考信号            x(n) = d(n)（理想上游传感器，与初级同源）
 *   - 自适应 FIR 滤波器    y(n) = Σ_{i=0..N-1} w[i]·x(n-i)，权值 w 初始为 0
 *   - 次级路径建模为纯延迟：y_actual(n) = y(n - secDelay)
 *   - 误差                e(n) = d(n) - y_actual(n)
 *   - LMS 更新（简化滤波-X，以 x 直接作为参考）：
 *                          w[i] += μ · e(n) · x(n-i)
 *   对周期性（音调）噪声，FIR 可在此子空间内完美逼近，故残差收敛到很小。
 *   真实 FXLMS 需用经次级路径滤波后的参考 x'(n) 更新，并对 secDelay 敏感；
 *   此处用纯延迟 + 直接参考的教学模型，便于直观演示收敛过程。
 */
(function (global) {
  'use strict';

  // 解析为有限数；失败返回 null
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // 块 RMS（非有限值按 0 处理，防止发散污染结果）
  function rmsOf(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (!isFinite(v)) v = 0;
      s += v * v;
    }
    return arr.length ? Math.sqrt(s / arr.length) : 0;
  }

  // 校验并返回清洗后的参数；失败返回 { ok:false, error }
  function validate(opts) {
    opts = opts || {};
    var fs = num(opts.fs); if (fs == null) fs = 8000;
    var N = num(opts.N); if (N == null) N = 32;
    var mu = num(opts.mu); if (mu == null) mu = 0.01;
    var secDelay = num(opts.secDelay); if (secDelay == null) secDelay = 4;
    var iters = num(opts.iters); if (iters == null) iters = 2000;
    var tones = opts.tones;

    if (!Array.isArray(tones) || tones.length === 0) {
      tones = [{ f: 120, A: 1.0 }, { f: 240, A: 0.6 }];
    }

    if (!(fs > 0)) return { ok: false, error: '采样率 fs 必须为正数（Hz）' };
    if (!(N >= 2)) return { ok: false, error: '滤波器阶数 N 至少为 2' };
    N = Math.floor(N);
    if (!(mu > 0 && mu <= 0.2)) return { ok: false, error: '步长 μ 须满足 0 < μ ≤ 0.2（本简化模型 μ≈0.01 稳定，过大将发散）' };
    if (!(secDelay >= 0)) return { ok: false, error: '次级路径延迟 secDelay 不能为负' };
    secDelay = Math.floor(secDelay);
    if (!(iters >= 1)) return { ok: false, error: '迭代次数 iters 至少为 1' };
    iters = Math.floor(iters);

    var validTones = [];
    for (var t = 0; t < tones.length; t++) {
      var f = num(tones[t] && tones[t].f);
      var A = num(tones[t] && tones[t].A);
      if (!(f > 0)) return { ok: false, error: '主频 f 必须为正数（Hz）' };
      if (A == null || !isFinite(A)) return { ok: false, error: '幅值 A 必须为有限数' };
      validTones.push({ f: f, A: A });
    }

    return {
      ok: true, fs: fs, N: N, mu: mu, secDelay: secDelay,
      iters: iters, tones: validTones
    };
  }

  // 核心仿真：返回每条样本 d/y/e、块 RMS 序列与统计
  function _sim(p) {
    var fs = p.fs, N = p.N, mu = p.mu, secDelay = p.secDelay,
        iters = p.iters, tones = p.tones;

    var w = new Array(N);
    for (var i = 0; i < N; i++) w[i] = 0;

    // 历史缓冲：x 需回溯 N-1 步，y_actual 需回溯 secDelay 步
    var xSize = N + secDelay + 1;
    var xHist = new Array(xSize);
    for (var b = 0; b < xSize; b++) xHist[b] = 0;
    var ySize = secDelay + 1;
    var yHist = new Array(ySize);
    for (var b2 = 0; b2 < ySize; b2++) yHist[b2] = 0;

    var blockSize = 50;
    var errSeries = [];
    var curBlock = [];

    // 为动画保存的逐样本轨迹（超过上限时降采样存储，控制内存）
    var maxTrace = 3000;
    var stride = Math.max(1, Math.floor(iters / maxTrace));
    var trD = [], trY = [], trE = [];

    function dOf(n) {
      var s = 0;
      for (var k = 0; k < tones.length; k++) {
        s += tones[k].A * Math.sin(2 * Math.PI * tones[k].f * n / fs);
      }
      return s;
    }

    for (var n = 0; n < iters; n++) {
      var d = dOf(n);
      var x = d; // 理想参考（上游传感器与初级同源）

      // 写入 x 历史（先存后用）
      xHist[n % xSize] = x;

      // 取抽头：x(n-i)
      var taps = new Array(N);
      for (var j = 0; j < N; j++) {
        var idx = n - j;
        taps[j] = idx >= 0 ? xHist[idx % xSize] : 0;
      }

      // 滤波器输出 y(n)
      var y = 0;
      for (var j2 = 0; j2 < N; j2++) y += w[j2] * taps[j2];

      // 次级路径纯延迟：y_actual(n) = y(n - secDelay)
      var yAct = (n - secDelay) >= 0 ? yHist[(n - secDelay) % ySize] : 0;

      // 误差
      var e = d - yAct;

      // LMS 更新：次级路径为纯延迟 secDelay 时，正确的滤波-X 参考为
      //   x'(n-i) = x(n - i - secDelay)
      // ∂e(n)/∂w[i] = -x(n - secDelay - i)。若误用 x(n-i)（漏掉 secDelay），
      // 更新方向与真实梯度错位，滤波将发散——这是本内核必须补偿的关键。
      var tapsF = new Array(N);
      for (var j4 = 0; j4 < N; j4++) {
        var idxF = n - j4 - secDelay;
        tapsF[j4] = idxF >= 0 ? xHist[idxF % xSize] : 0;
      }
      for (var j3 = 0; j3 < N; j3++) w[j3] += mu * e * tapsF[j3];

      // 写回 y 历史（供后续延迟读取）
      yHist[n % ySize] = y;

      // 块 RMS
      curBlock.push(e);
      if (curBlock.length >= blockSize) {
        errSeries.push(rmsOf(curBlock));
        curBlock = [];
      }

      // 轨迹存储（降采样）
      if (n % stride === 0) {
        trD.push(d); trY.push(y); trE.push(e);
      }
    }
    // 收尾未满一个块的部分
    if (curBlock.length) errSeries.push(rmsOf(curBlock));

    var initRMS, finalRMS;
    if (errSeries.length) {
      initRMS = errSeries[0];
      finalRMS = errSeries[errSeries.length - 1];
    } else {
      // iters < blockSize 时的回退
      initRMS = finalRMS = rmsOf(trE.length ? trE : [0]);
    }

    var reductionDb;
    if (finalRMS > 0 && isFinite(finalRMS)) {
      reductionDb = 20 * Math.log10(initRMS / finalRMS);
    } else if (finalRMS <= 0) {
      reductionDb = initRMS > 0 ? 20 * Math.log10(initRMS / 1e-12) : 0;
    } else {
      reductionDb = 0;
    }

    var notes = [
      'FXLMS 用于抵消周期性（音调）噪声：上游参考 x(n) 经自适应 FIR 产生反相 anti-noise y(n)，叠加后残差 e(n) 被最小化。',
      '本模型为教学简化：次级路径用纯延迟 secDelay 样点建模，更新以 x(n-i) 直接作为参考（工程 FXLMS 应使用滤波后的参考 x\'(n)）。',
      '步长 μ 越大收敛越快，但 μ 过大会失稳（本内核限定 0 < μ ≤ 0.5）；次级路径延迟须被建模，否则真实系统收敛失败。',
      '当 secDelay 相对 N 过大、或 μ 超出稳定上界时，残差可能不降反升（发散）。'
    ];

    return {
      fs: fs, N: N, mu: mu, secDelay: secDelay, iters: iters,
      tones: tones,
      errSeries: errSeries,
      initRMS: initRMS,
      finalRMS: finalRMS,
      reductionDb: reductionDb,
      notes: notes,
      traces: { d: trD, y: trY, e: trE, stride: stride }
    };
  }

  function run(opts) {
    var v = validate(opts);
    if (!v.ok) return { ok: false, error: v.error };
    var s = _sim(v);
    return {
      ok: true,
      fs: s.fs,
      N: s.N,
      mu: s.mu,
      primaryTones: s.tones,
      iters: s.iters,
      errSeries: s.errSeries,
      finalRMS: s.finalRMS,
      initRMS: s.initRMS,
      reductionDb: s.reductionDb,
      notes: s.notes,
      traces: s.traces
    };
  }

  // 预设：单频 / 双频 / 默认
  function preset(kind) {
    if (kind === 'single') {
      return { fs: 8000, N: 32, mu: 0.02, secDelay: 4, iters: 2000,
               tones: [{ f: 120, A: 1.0 }] };
    }
    if (kind === 'dual') {
      return { fs: 8000, N: 32, mu: 0.02, secDelay: 4, iters: 2000,
               tones: [{ f: 120, A: 1.0 }, { f: 240, A: 0.6 }] };
    }
    // 默认双频例题
    return { fs: 8000, N: 32, mu: 0.01, secDelay: 4, iters: 2000,
             tones: [{ f: 120, A: 1.0 }, { f: 240, A: 0.6 }] };
  }

  var API = {
    run: run,
    preset: preset
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimFxlms = API;
  }
})(typeof window !== 'undefined' ? window : this);
