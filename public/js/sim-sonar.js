/*
 * sim-sonar.js — 声呐方程（SONAR equation）与水声探测距离计算内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimSonar，Node 下 module.exports。
 *
 * 物理模型：水声传播损失由两部分组成
 *   1) 球面几何扩展：     20·log₁₀(r)                 （参考距离 1 m，与 SL re 1 μPa @ 1 m 配套）
 *   2) 海水介质吸收：     α(f)·r/1000                 （α 单位 dB/km，r 单位 m，故除以 1000）
 *   TL(r) = 20·log₁₀(r) + α(f)·r/1000        [dB，单程]
 *
 *   吸收系数采用 Thorp 经验式（f 单位 kHz，α 单位 dB/km）：
 *   α(f) = 0.11·f²/(1+f²) + 44·f²/(4100+f²) + 2.75e-4·f² + 0.003
 *   四项依次为：MgSO₄ 弛豫、硼酸（B(OH)₃）弛豫、纯水粘滞、低频常数地板。
 *
 * 噪声限制的声呐方程（均以 dB 计，全部 re 1 μPa）：
 *   主动（双程）：SL − 2·TL(r) + TS      ≥ NL − DI + DT
 *   被动（单程）：SL −      TL(r)         ≥ NL − DI + DT
 *   取等号解得最大作用距离 r_max（二分法，r ∈ [1, 1e6] m）。
 *
 * 单位约定：距离 m，频率 kHz，声速 m/s，吸收 dB/km，其余声学量均为 dB。
 *   注意：① Thorp 式适用约 0.1–100 kHz 量级，实际低频吸收还受温度/盐度/pH/深度影响，
 *   精密计算应改用 François–Garrison 等模型；② 本内核只做噪声限制（noise-limited），
 *   未建模混响限制（RL）、多途、声影区与深海声道会聚区；③ TL 中不含声速 c，
 *   c 仅用于波长与往返时间换算。
 */
(function (global) {
  'use strict';

  var C_SEA = 1500;     // 海水声速默认值 m/s
  var R_MIN = 1;        // 二分搜索下界 m（球面扩展的参考距离）
  var R_MAX = 1e6;      // 二分搜索上界 m
  var MAX_ITER = 200;   // 二分最大迭代次数
  var REL_TOL = 1e-9;   // 二分相对收敛容差
  var CURVE_N = 200;    // 检测余量曲线的采样点数（≥120）

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /* ----------------------- 核心公式 ----------------------- */

  // Thorp 吸收系数 α(f) [dB/km]，f 单位 kHz；非法输入返回 null
  function absorption(f) {
    f = num(f);
    if (f == null || f < 0) return null;
    var f2 = f * f;
    return (0.11 * f2) / (1 + f2) + (44 * f2) / (4100 + f2) + 2.75e-4 * f2 + 0.003;
  }

  // 单程传播损失 TL(r) = 20·log₁₀(r) + α·r/1000 [dB]，r 单位 m
  // 参数：r 距离 m，f 频率 kHz，c 声速 m/s（本模型中不参与计算，仅做校验），
  //       alpha 可直接传入吸收系数 dB/km（覆盖 Thorp 计算，便于做纯几何扩展的验算）
  function transmissionLoss(r, f, c, alpha) {
    r = num(r);
    if (r == null || !(r > 0)) return null;
    c = num(c);
    if (c == null) c = C_SEA;
    if (!(c > 0)) return null;
    if (alpha == null) {
      f = num(f);
      if (f == null) f = 1;
      if (!(f >= 0)) return null;
      alpha = absorption(f);
    } else {
      alpha = num(alpha);
      if (alpha == null || !(alpha >= 0)) return null;
    }
    if (alpha == null) return null;
    return 20 * Math.log10(r) + (alpha * r) / 1000;
  }

  /* ----------------------- 参数归一化 ----------------------- */
  // o: { mode, sl, ts, nl, di, dt, freq, c } → 补齐缺省值 + 区间校验
  function normalize(o, mode) {
    o = o || {};
    var p = { mode: mode };

    p.sl = num(o.sl); if (p.sl == null) p.sl = 220;   // 声源级 dB re 1 μPa @ 1 m
    p.ts = num(o.ts); if (p.ts == null) p.ts = 15;    // 目标强度 dB（仅主动模式使用）
    p.nl = num(o.nl); if (p.nl == null) p.nl = 65;    // 环境噪声级 dB
    p.di = num(o.di); if (p.di == null) p.di = 20;    // 接收指向性指数 dB
    p.dt = num(o.dt); if (p.dt == null) p.dt = 10;    // 检测阈 dB
    p.freq = num(o.freq); if (p.freq == null) p.freq = 5; // 频率 kHz
    p.c = num(o.c); if (p.c == null) p.c = C_SEA;     // 声速 m/s

    if (p.mode !== 'active' && p.mode !== 'passive') {
      return { ok: false, error: '模式 mode 必须是 "active"（主动）或 "passive"（被动）' };
    }
    if (!(p.sl >= 100 && p.sl <= 260)) {
      return { ok: false, error: '声源级 SL 需在 100–260 dB（re 1 μPa @ 1 m）之间' };
    }
    if (!(p.ts >= -40 && p.ts <= 40)) {
      return { ok: false, error: '目标强度 TS 需在 −40–40 dB 之间' };
    }
    if (!(p.nl >= 20 && p.nl <= 120)) {
      return { ok: false, error: '环境噪声级 NL 需在 20–120 dB 之间' };
    }
    if (!(p.di >= 0 && p.di <= 40)) {
      return { ok: false, error: '指向性指数 DI 需在 0–40 dB 之间' };
    }
    if (!(p.dt >= -10 && p.dt <= 30)) {
      return { ok: false, error: '检测阈 DT 需在 −10–30 dB 之间' };
    }
    if (!(p.freq >= 0.05 && p.freq <= 100)) {
      return { ok: false, error: '工作频率需在 0.05–100 kHz 之间（Thorp 经验式的适用量级）' };
    }
    if (!(p.c >= 1400 && p.c <= 1600)) {
      return { ok: false, error: '海水声速 c 需在 1400–1600 m/s 之间' };
    }

    p.alpha = absorption(p.freq);
    p.noiseFloor = p.nl - p.di;          // NL − DI：进入接收机的等效噪声背景 dB
    p.threshold = p.noiseFloor + p.dt;   // 接收信号必须超过此值才算检测到 dB
    p.figureOfMerit = (p.mode === 'active' ? p.sl + p.ts : p.sl) - p.noiseFloor - p.dt; // 允许的总传播损失 dB

    return { ok: true, p: p };
  }

  // 给定距离处的接收信号级（dB）：主动 SL−2TL+TS；被动 SL−TL
  function receivedLevel(r, p) {
    var tl = transmissionLoss(r, p.freq, p.c, p.alpha);
    if (tl == null) return null;
    if (p.mode === 'active') return { level: p.sl - 2 * tl + p.ts, tl: tl, loss: 2 * tl };
    return { level: p.sl - tl, tl: tl, loss: tl };
  }

  // 检测余量（detection excess）dB：>0 可检测，=0 即处于作用距离边缘
  // r 单位 m；o 为 { mode, sl, ts, nl, di, dt, freq, c }，mode 缺省 'active'
  function detectionMargin(r, o) {
    var n = normalize(o, (o && o.mode) || 'active');
    if (!n.ok) return null;
    var lr = receivedLevel(r, n.p);
    if (lr == null) return null;
    return lr.level - n.p.threshold;
  }

  /* ----------------------- 二分求解 r_max ----------------------- */
  // 余量函数单调递减，故可在 [R_MIN, R_MAX] 上二分
  function excessAt(r, p) {
    var lr = receivedLevel(r, p);
    return lr.level - p.threshold;
  }

  function solveRange(p) {
    if (excessAt(R_MIN, p) < 0) {
      return { ok: false, error: '参数无法构成可检测条件：即使在 ' + R_MIN + ' m 处，接收信号级也低于检测阈（请提高 SL、降低 NL 或 DT）' };
    }
    if (excessAt(R_MAX, p) > 0) {
      return { ok: true, rMax: R_MAX, iterations: 0, clamped: true };
    }
    var lo = R_MIN, hi = R_MAX, it = 0, mid;
    for (it = 0; it < MAX_ITER; it++) {
      mid = 0.5 * (lo + hi);
      if ((hi - lo) / mid < REL_TOL) { it++; break; }
      if (excessAt(mid, p) > 0) lo = mid; else hi = mid;
    }
    return { ok: true, rMax: 0.5 * (lo + hi), iterations: it, clamped: false };
  }

  // 组装工作距离结果（供 activeRange / passiveRange / simulate 共用）
  function rangeResult(mode, o) {
    var n = normalize(o, mode);
    if (!n.ok) return { ok: false, error: n.error };
    var p = n.p;

    var solved = solveRange(p);
    if (!solved.ok) return { ok: false, error: solved.error };

    var rMax = solved.rMax;
    var lr = receivedLevel(rMax, p);

    return {
      ok: true,
      mode: p.mode,
      sl: p.sl,
      ts: p.mode === 'active' ? p.ts : null,
      nl: p.nl,
      di: p.di,
      dt: p.dt,
      freq: p.freq,
      c: p.c,
      alpha: p.alpha,                       // 吸收系数 dB/km
      noiseFloor: p.noiseFloor,             // NL − DI                    [dB]
      threshold: p.threshold,               // NL − DI + DT（图上水平线） [dB]
      figureOfMerit: p.figureOfMerit,       // SL[+TS] − (NL−DI) − DT     [dB]
      allowedTL: p.figureOfMerit,           // 允许的总传播损失          [dB]（主动=双程，被动=单程）
      allowedOneWayTL: p.mode === 'active' ? p.figureOfMerit / 2 : p.figureOfMerit, // 折算单程 [dB]
      rMax: rMax,                           // 最大作用距离              [m]
      tlAtRMax: lr.tl,                      // r_max 处单程传播损失      [dB]
      twoWayTL: lr.loss,                    // 方程中出现的传播损失总量  [dB]（主动=2TL，被动=TL）
      receivedLevel: lr.level,              // r_max 处接收信号级        [dB]
      residual: lr.level - p.threshold,     // 方程残差，应 ≈ 0          [dB]
      clamped: solved.clamped,
      iterations: solved.iterations
    };
  }

  // 主动声呐作用距离（噪声限制）：SL − 2TL + TS ≥ NL − DI + DT
  function activeRange(o) {
    return rangeResult('active', o);
  }

  // 被动声呐作用距离（噪声限制）：SL − TL ≥ NL − DI + DT
  function passiveRange(o) {
    return rangeResult('passive', o);
  }

  /* ----------------------- 主入口 ----------------------- */
  // o: { mode, sl, ts, nl, di, dt, freq, c } —— mode 缺省 'active'
  function simulate(o) {
    var mode = (o && o.mode) || 'active';
    var res = rangeResult(mode, o);
    if (!res.ok) return res;

    var n = normalize(o, mode);
    var p = n.p;
    var rMax = res.rMax;

    // 检测余量曲线：对数距离轴 1 m → 3·r_max（上限 1e6 m），供视图画「信号级 vs 距离」
    var rEnd = Math.min(R_MAX, Math.max(1000, rMax * 3));
    if (rEnd <= R_MIN) rEnd = R_MIN * 10;
    var curve = [];
    for (var i = 0; i < CURVE_N; i++) {
      var r = R_MIN * Math.pow(rEnd / R_MIN, i / (CURVE_N - 1));
      var lr = receivedLevel(r, p);
      curve.push({ r: r, tl: lr.tl, loss: lr.loss, level: lr.level, excess: lr.level - p.threshold });
    }

    var lambda = p.c / (p.freq * 1000); // 水中波长 λ = c/f [m]
    var travelTime = (p.mode === 'active' ? 2 * rMax : rMax) / p.c; // 脉冲往返/单程传播时间 [s]

    var notes = [
      'Thorp 经验式适用约 0.1–100 kHz 量级：α(1 kHz) ≈ ' + absorption(1).toFixed(4) +
        ' dB/km、α(10 kHz) ≈ ' + absorption(10).toFixed(3) + ' dB/km；其四项依次为 MgSO₄ 弛豫、硼酸弛豫、纯水粘滞与低频常数地板 0.003 dB/km。' +
        '实际低频（<1 kHz）吸收还显著依赖温度、盐度、pH 与深度，精密计算应改用 François–Garrison 模型。',
      '主动方程为双程：SL − 2TL + TS ≥ NL − DI + DT，传播损失按 2 倍计入（脉冲往返）；' +
        '被动方程为单程：SL − TL ≥ NL − DI + DT，其中 SL 是目标自身的辐射噪声级，因此同一部设备被动听测距离通常远大于主动探测距离。',
      '本内核为噪声限制（noise-limited）模型，**未建模混响限制**：浅海/高混响环境下主动声呐实际受 RL 限制，' +
        '方程应改写为 SL − 2TL + TS ≥ RL + DT，作用距离会明显小于本模型结果。',
      'TL = 20log₁₀(r) + αr/1000 假定自由场球面扩展：未含海底/海面反射多途、声影区、深海声道（SOFAR）会聚区与表面声道波导效应，' +
        '也未计射线弯曲；声速 c 只用于波长 λ = c/f 与往返时间换算，不进入 TL。',
      'α 随频率快速上升（近似 ∝ f² 的中频段），故远程探测只能牺牲分辨率换取低频；' +
        '提高 SL 或 DI、降低 NL 与 DT 都能增大作用距离，其中最有效的是提高 DI（阵列增益）与降低 NL。'
    ];
    if (res.clamped) {
      notes.push('提示：当前参数在 ' + R_MAX + ' m（1000 km）处仍满足检测条件，结果已被搜索区间上界截断，实际 r_max 无物理意义（本模型在极远距离因缺少波导/会聚区建模而失真）。');
    }

    return {
      ok: true,
      mode: res.mode,
      sl: res.sl,
      ts: res.ts,
      nl: res.nl,
      di: res.di,
      dt: res.dt,
      freq: res.freq,
      c: res.c,
      alpha: res.alpha,
      noiseFloor: res.noiseFloor,
      threshold: res.threshold,
      figureOfMerit: res.figureOfMerit,
      allowedTL: res.allowedTL,
      allowedOneWayTL: res.allowedOneWayTL,
      rMax: res.rMax,
      tlAtRMax: res.tlAtRMax,
      twoWayTL: res.twoWayTL,
      receivedLevel: res.receivedLevel,
      residual: res.residual,
      clamped: res.clamped,
      iterations: res.iterations,
      lambda: lambda,
      travelTime: travelTime,
      curve: curve,
      notes: notes
    };
  }

  /* ----------------------- 预设工况 ----------------------- */
  var PRESETS = [
    {
      name: '典型舰壳声呐 f=5 kHz',
      desc: '中频舰壳主动声呐：SL 220 dB、潜艇 TS 15 dB、海况噪声 NL 65 dB、DI 20 dB、DT 10 dB',
      params: { mode: 'active', sl: 220, ts: 15, nl: 65, di: 20, dt: 10, freq: 5, c: C_SEA }
    },
    {
      name: '低频远程 f=1 kHz',
      desc: '低频大孔径主动拖曳阵：SL 225 dB、TS 10 dB、NL 60 dB、DI 15 dB、DT 8 dB，α 更小、距离更远',
      params: { mode: 'active', sl: 225, ts: 10, nl: 60, di: 15, dt: 8, freq: 1, c: C_SEA }
    },
    {
      name: '被动听测 f=0.5 kHz',
      desc: '被动声呐：目标辐射噪声 SL 150 dB、NL 55 dB、DI 25 dB、DT 6 dB，只算单程、距离最远',
      params: { mode: 'passive', sl: 150, ts: 0, nl: 55, di: 25, dt: 6, freq: 0.5, c: C_SEA }
    }
  ];

  var API = {
    C_SEA: C_SEA,
    R_MIN: R_MIN,
    R_MAX: R_MAX,
    MAX_ITER: MAX_ITER,
    REL_TOL: REL_TOL,
    CURVE_N: CURVE_N,
    PRESETS: PRESETS,
    absorption: absorption,
    transmissionLoss: transmissionLoss,
    detectionMargin: detectionMargin,
    activeRange: activeRange,
    passiveRange: passiveRange,
    simulate: simulate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimSonar = API;
  }
})(typeof window !== 'undefined' ? window : this);
