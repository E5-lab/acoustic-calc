/*
 * iso3382.js — 厅堂音质参数量测内核（#/iso3382）
 *
 * 与 #/roomq（按几何与吸声预测 RT60 / C50 / G 等）互补，本内核处理「已测得
 * 衰减曲线 / 脉冲响应」之后的参数量测，遵循 ISO 3382-1:2009 的计算约定：
 *
 *   1) 数据解析：Schroeder 衰减曲线（t ms / dB）、双耳 IR（t / L / R）、单耳 IR（t / p）
 *   2) 衰减曲线指标：EDT（0~−10 dB）、T20（−5~−25 dB）、T30（−5~−35 dB）最小二乘拟合，
 *      C50 / C80（早/晚能量比）、D50（早期能量占比）、Ts（中心时间 = Schroeder 曲线下面积）
 *   3) 强度 G：G = L_pE − L_pE,10（与 10 m 自由场参考能量之比）；
 *      由声功率级换算时 G = L_pE − L_W + 31 dB（10lg(4π·10²)，ρc = 400 约定）
 *   4) 侧向：LF（0~80 ms 内 8 字麦 / 全向麦能量比）、LJ（晚侧向声级，同样以 10 m 自由场为参考）
 *   5) 双耳：IACC（±1 ms 时延窗内归一化互相关的最大值，早期窗 0~80 ms）
 *   6) ITDG：直达声与第一显著反射（阈值默认直达 −20 dB）的时间差（Beranek 1962）
 *   7) BR 低音比：(RT125 + RT250) / (RT500 + RT1000)
 *   8) 目标值：ISO 3382-1 Table A.1、文献按厅种目标值（Beranek / Barron）、T30 按用途推荐
 *
 * UMD：浏览器 window.Iso3382，Node require('./iso3382.js')。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Iso3382 = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
  function lg(x) { return Math.log(x) / Math.LN10; }
  function r1(v) { return v == null ? null : Math.round(v * 10) / 10; }
  function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
  function r3(v) { return v == null ? null : Math.round(v * 1000) / 1000; }

  /* ==================================================================
   * 1) 数据解析
   * ------------------------------------------------------------------
   * 每行一条记录，列间可用空格 / 制表符 / 逗号 / 分号分隔，# 开头为注释。
   *   parseDecay：两列「时间(ms) 衰减声压级(dB)」——Schroeder 后向积分衰减曲线；
   *              起点取 0 dB 或绝对峰值均可（比值类指标与偏移量无关）。
   *   parseIR   ：三列「时间(ms) 左耳 右耳」或两列「时间(ms) 左耳」——原始脉冲响应（线性幅值）。
   *   parseMono ：两列「时间(ms) 幅值」——单耳原始脉冲响应。
   * ================================================================== */

  function splitLine(line) {
    return line.replace(/[#,;]/g, ' ').trim().split(/[\s]+/).filter(function (s) { return s.length; });
  }

  function parseRows(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var rows = [], bad = [];
    lines.forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = splitLine(line);
      var vals = [];
      var ok = parts.length >= 2;
      if (ok) {
        for (var k = 0; k < parts.length; k++) {
          var v = num(parts[k]);
          if (v == null) { ok = false; break; }
          vals.push(v);
        }
      }
      if (ok) rows.push({ line: i + 1, vals: vals });
      else bad.push({ line: i + 1, text: line });
    });
    return { rows: rows, bad: bad };
  }

  /** 衰减曲线：{t(ms), level(dB)} */
  function parseDecay(text) {
    var p = parseRows(text);
    var points = [], bad = p.bad.slice();
    p.rows.forEach(function (r) {
      var t = r.vals[0], lv = r.vals[1];
      if (t < 0) { bad.push({ line: r.line, text: 't<0' }); return; }
      points.push({ t: t, level: lv });
    });
    points.sort(function (a, b) { return a.t - b.t; });
    return { points: points, bad: bad, count: points.length };
  }

  /** 双耳 IR：{t(ms), l, r}（r 为 null 表示仅单列） */
  function parseIR(text) {
    var p = parseRows(text);
    var points = [], bad = p.bad.slice();
    p.rows.forEach(function (r) {
      var t = r.vals[0];
      if (t < 0) { bad.push({ line: r.line, text: 't<0' }); return; }
      points.push({ t: t, l: r.vals[1], r: r.vals.length >= 3 ? r.vals[2] : null });
    });
    points.sort(function (a, b) { return a.t - b.t; });
    var hasRight = points.length > 0 && points.every(function (q) { return q.r != null; });
    return { points: points, bad: bad, count: points.length, hasRight: hasRight };
  }

  /** 单耳 IR：{t(ms), p} */
  function parseMono(text) {
    var p = parseRows(text);
    var points = [], bad = p.bad.slice();
    p.rows.forEach(function (r) {
      var t = r.vals[0];
      if (t < 0) { bad.push({ line: r.line, text: 't<0' }); return; }
      points.push({ t: t, p: r.vals[1] });
    });
    points.sort(function (a, b) { return a.t - b.t; });
    return { points: points, bad: bad, count: points.length };
  }

  /* ==================================================================
   * 2) 衰减曲线指标
   * ------------------------------------------------------------------
   * 输入点列统一先归一化：L0 = 首点（最小 t）声压级，rel = level − L0，
   * 拟合窗与能量窗均相对起点度量（ISO 3382 的 0 / −10 / −35 dB 即相对起点）。
   * ================================================================== */

  /** 归一化点列：追加 levelRel；返回 {points, l0, spanDb, durationMs} */
  function prepare(points) {
    if (!points || points.length < 2) return null;
    var pts = points.slice().sort(function (a, b) { return a.t - b.t; });
    var l0 = pts[0].level;
    pts.forEach(function (q) { q.levelRel = q.level - l0; });
    return {
      points: pts,
      l0: r1(l0),
      spanDb: r1(pts[pts.length - 1].levelRel),
      durationMs: r1(pts[pts.length - 1].t)
    };
  }

  /** 最小二乘拟合衰减曲线：[loDb, hiDb] 窗（相对起点，loDb > hiDb，如 −5 ~ −35） */
  function fitDecay(points, loDb, hiDb) {
    var pre = points && points.length && points[0].levelRel != null ? { points: points } : prepare(points);
    if (!pre || pre.points.length < 3) return { error: 'too-few-points' };
    var pts = pre.points.filter(function (q) {
      return q.levelRel <= loDb + 1e-9 && q.levelRel >= hiDb - 1e-9;
    });
    if (pts.length < 3) return { error: 'window-too-few-points', n: pts.length };
    var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    pts.forEach(function (q) {
      var x = q.t / 1000; // s
      var y = q.levelRel;  // dB
      sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y;
    });
    var den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return { error: 'degenerate-window' };
    var slope = (n * sxy - sx * sy) / den;      // dB/s
    var intercept = (sy - slope * sx) / n;
    var fitR2 = 1;
    var d2 = (n * sxx - sx * sx) * (n * syy - sy * sy);
    if (d2 > 1e-12) fitR2 = Math.pow(n * sxy - sx * sy, 2) / d2;
    if (!(slope < 0)) return { error: 'non-decaying', slope: r2(slope) };
    var rels = pts.map(function (q) { return q.levelRel; });
    var covered = Math.max.apply(null, rels) - Math.min.apply(null, rels);
    return {
      slope: r2(slope),            // dB/s（负值）
      rt: r2(60 / Math.abs(slope)),// s
      intercept: r2(intercept),
      r2: r3(fitR2),
      coveredDb: r1(covered),      // 拟合点实际覆盖的衰减跨度（窗未全覆盖时 < 窗宽）
      n: n,
      t1: r1(pts[0].t),
      t2: r1(pts[pts.length - 1].t),
      window: [loDb, hiDb]
    };
  }

  /** EDT：0 ~ −10 dB 窗 */
  function edt(points) { return fitDecay(points, 0, -10); }
  /** T20：−5 ~ −25 dB 窗 */
  function t20(points) { return fitDecay(points, -5, -25); }
  /** T30：−5 ~ −35 dB 窗 */
  function t30(points) { return fitDecay(points, -5, -35); }

  /** 相对平方声压权重 w(t) = 10^(rel/10)，即归一化 Schroeder 曲线（首点 = 1） */
  function weights(points) {
    var pre = points && points.length && points[0].levelRel != null ? { points: points } : prepare(points);
    return pre ? pre.points.map(function (q) { return { t: q.t, w: Math.pow(10, q.levelRel / 10) }; }) : null;
  }

  /** 梯形积分 ∫w dt（t 单位 ms），区间 [t1, t2] 裁剪到数据范围 */
  function integW(ws, t1, t2) {
    var s = 0;
    for (var i = 0; i < ws.length - 1; i++) {
      var a = ws[i], b = ws[i + 1];
      var lo = Math.max(a.t, t1), hi = Math.min(b.t, t2);
      if (hi <= lo) continue;
      var wa = a.w + (b.w - a.w) * (lo - a.t) / (b.t - a.t);
      var wb = a.w + (b.w - a.w) * (hi - a.t) / (b.t - a.t);
      s += 0.5 * (wa + wb) * (hi - lo);
    }
    return s;
  }

  /**
   * 清晰度 C_t = 10lg(E[0,t] / E[t,end])，t 单位 ms（t = 50 → C50，80 → C80）
   * 由 Schroeder 曲线：E[a,b] ∝ 10^(rel(a)/10) − 10^(rel(b)/10)，等价于 w 的积分差。
   */
  function clarity(points, tMs) {
    var ws = weights(points);
    var t = num(tMs);
    if (!ws || ws.length < 2 || t == null || t <= 0) return null;
    var tEnd = ws[ws.length - 1].t;
    var tt = Math.min(t, tEnd);
    var early = integW(ws, 0, tt);
    var late = integW(ws, tt, tEnd);
    if (!(late > 0)) return null;
    return { tMs: r1(tt), c: r2(10 * lg(early / late)), early: r4(early), late: r4(late) };
  }
  function r4(v) { return v == null ? null : Math.round(v * 10000) / 10000; }

  /** D50 = E[0,50]/E[0,end]；附 C50 = 10lg(D50/(1−D50)) 供交叉校验 */
  function d50(points) {
    var ws = weights(points);
    if (!ws || ws.length < 2) return null;
    var tEnd = ws[ws.length - 1].t;
    var tt = Math.min(50, tEnd);
    var early = integW(ws, 0, tt);
    var total = integW(ws, 0, tEnd);
    if (!(total > 0)) return null;
    var d = early / total;
    var c = d >= 1 ? null : 10 * lg(d / (1 - d));
    return { d50: r3(d), d50pct: r1(100 * d), c50: r2(c) };
  }

  /**
   * 中心时间 Ts = ∫₀^∞ t·p²(t)dt / ∫₀^∞ p²(t)dt。
   * 由 Schroeder 曲线 S(t) ∝ w(t) 分部积分得 Ts = ∫w dt / w(0)（w 首点归一为 1），
   * 即归一化 Schroeder 曲线下的面积。单位 ms。
   */
  function centerTime(points) {
    var ws = weights(points);
    if (!ws || ws.length < 2) return null;
    var area = integW(ws, ws[0].t, ws[ws.length - 1].t);
    return { tsMs: r1(area) };
  }

  /** 一次算全：衰减曲线的全部指标 + Table A.1 比对 */
  function decayReport(points) {
    var pre = prepare(points);
    if (!pre) return { ok: false, error: 'too-few-points' };
    var ws = weights(pre.points);
    var e = edt(pre.points), t2 = t20(pre.points), t3 = t30(pre.points);
    var c50 = clarity(pre.points, 50), c80 = clarity(pre.points, 80);
    var d = d50(pre.points), ts = centerTime(pre.points);
    if (!ws) return { ok: false, error: 'bad-data' };
    var warn = [];
    if (pre.spanDb > -30) warn.push('衰减跨度仅 ' + Math.abs(pre.spanDb).toFixed(0) + ' dB（< 30 dB），T30 与晚端能量积分可靠性下降；建议曲线延伸至噪声准线或至少 −35 dB。');
    if (e.error) warn.push('EDT 拟合窗（0~−10 dB）内点数不足。');
    else if (e.coveredDb < 8) warn.push('EDT 拟合窗仅覆盖 ' + e.coveredDb + ' dB（标准 0~−10 dB），结果为外推值。');
    if (t3.error) warn.push('T30 拟合窗（−5~−35 dB）内点数不足。');
    else if (t3.coveredDb < 25) warn.push('T30 拟合窗仅覆盖 ' + t3.coveredDb + ' dB（标准 −5~−35 dB 共 30 dB），外推误差增大。');
    if (e.r2 != null && e.r2 < 0.98) warn.push('EDT 拟合线性度 R² = ' + e.r2 + '（< 0.98），早期衰减呈双折线，EDT 仅供参考。');
    if (t3.r2 != null && t3.r2 < 0.98) warn.push('T30 拟合线性度 R² = ' + t3.r2 + '（< 0.98），衰减非线性，T30 为等效值。');
    var ratio = (e.rt && t3.rt) ? r2(e.rt / t3.rt) : null;
    return {
      ok: true,
      l0: pre.l0, spanDb: pre.spanDb, durationMs: pre.durationMs,
      edt: e, t20: t2, t30: t3,
      c50: c50, c80: c80, d50: d, tsMs: ts ? ts.tsMs : null,
      edtOverT30: ratio,
      warn: warn
    };
  }

  /* ==================================================================
   * 3) 强度 G 与侧向参数
   * ------------------------------------------------------------------
   * ISO 3382-1 Annex A：G = 10lg(∫p²dt / ∫p₁₀²dt) = L_pE − L_pE,10，
   * 参考为同一全向声源在 10 m 自由场的声压暴露级。
   * 由声功率级换算：L_pE,10 = L_W − 10lg(4π·10²) = L_W − 31 dB
   * （ρc = 400 kg/(m²·s) 约定，即 L_p = L_W − 10lg(4πr²) 的自由场关系），
   * 故 G = L_pE − L_W + 31 dB。
   * ================================================================== */

  var G_CONST = 31.0; // 10lg(4π·10²) = 30.99，取 31.0

  /** G = L_pE − L_pE,10（自由场参考直接相减） */
  function strengthFromRef(lpE, lpE10) {
    var a = num(lpE), b = num(lpE10);
    if (a == null || b == null) return null;
    return { g: r1(a - b), route: 'ref', lpE: a, lpE10: b };
  }

  /** G = L_pE − L_W + 31 dB */
  function strengthFromLW(lpE, lw) {
    var a = num(lpE), b = num(lw);
    if (a == null || b == null) return null;
    return { g: r1(a - b + G_CONST), route: 'lw', lpE: a, lw: b, const: G_CONST };
  }

  /** G 对应的等效自由场距离 d_eq = 10·10^(−G/20)（m）：G=0 → 10 m，G=20 → 1 m */
  function freeFieldDistance(g) {
    var v = num(g);
    if (v == null) return null;
    return { dEq: r2(10 * Math.pow(10, -v / 20)) };
  }

  /**
   * 侧向能量分数 LF = ∫₀^80ms |cos²θ|p²dt / ∫₀^80ms p²dt。
   * 实测用 8 字麦（主轴垂直、零轴指向声源）：分子即 8 字麦早期能量，
   * 故 LF = 10^((L_fig8 − L_omni)/10)，两级均为 0~80 ms 早期声级。
   */
  function lateralFraction(lOmni, lFig8) {
    var a = num(lOmni), b = num(lFig8);
    if (a == null || b == null) return null;
    var lf = Math.pow(10, (b - a) / 10);
    return { lf: r3(lf), lfPct: r1(100 * lf), lOmni: a, lFig8: b };
  }

  /** 晚侧向声级 LJ = L_ll − L_pE,10 = L_ll − L_W + 31 dB（t_e = 80 ms 之后） */
  function lateLateralLevel(lLateLat, lw) {
    var a = num(lLateLat), b = num(lw);
    if (a == null || b == null) return null;
    return { lj: r1(a - b + G_CONST), lLateLat: a, lw: b, const: G_CONST };
  }

  /* ==================================================================
   * 4) IACC（双耳互相关）
   * ------------------------------------------------------------------
   * IACC = max_{|τ|≤1ms} |IACF(τ)|，
   * IACF(τ) = ∫₀^80ms p_L(t)·p_R(t+τ)dt / √(∫p_L²·∫p_R²)（归一化，早期窗）。
   * 报告惯例：常以 1−IACC 表示（越大越开阔）；IACC_E3 = 500/1k/2k 三频带平均。
   * ================================================================== */

  function iacc(points, opts) {
    var o = opts || {};
    var windowMs = o.windowMs == null ? 80 : o.windowMs;
    var maxLagMs = o.maxLagMs == null ? 1 : o.maxLagMs;
    var lagStepMs = o.lagStepMs == null ? 0.05 : o.lagStepMs;
    if (!points || points.length < 4) return { error: 'too-few-points' };
    if (points.some(function (q) { return q.l == null || q.r == null; })) return { error: 'missing-channel' };
    var pts = points.slice().sort(function (a, b) { return a.t - b.t; });
    // 采样间隔（取相邻差的中位数）与均匀性检查
    var diffs = [];
    for (var i = 1; i < pts.length; i++) diffs.push(pts[i].t - pts[i - 1].t);
    diffs.sort(function (a, b) { return a - b; });
    var dt = diffs[Math.floor(diffs.length / 2)];
    if (!(dt > 0)) return { error: 'bad-sampling' };
    var uniform = diffs.every(function (d) { return Math.abs(d - dt) <= dt * 0.02 + 1e-6; });
    if (!uniform) return { error: 'non-uniform', dt: r3(dt) };
    var t0 = pts[0].t;
    var n = pts.length;
    var L = pts.map(function (q) { return q.l; });
    var R = pts.map(function (q) { return q.r; });
    // 早期窗 [0, windowMs]
    var iEnd = 0;
    while (iEnd < n && pts[iEnd].t - t0 <= windowMs + 1e-9) iEnd++;
    if (iEnd < 4) return { error: 'window-too-few-points', n: iEnd };
    var ls = [], rs = [];
    for (var k = 0; k < iEnd; k++) { ls.push(L[k]); rs.push(R[k]); }
    var denL = 0, denR = 0;
    for (var m = 0; m < iEnd; m++) { denL += ls[m] * ls[m]; denR += rs[m] * rs[m]; }
    var denom = Math.sqrt(denL * denR);
    if (!(denom > 0)) return { error: 'zero-energy' };
    // 线性插值取 R(t + τ)
    function rAt(tAbs) {
      var idx = (tAbs - t0) / dt;
      if (idx < 0 || idx > n - 1) return 0;
      var i0 = Math.floor(idx), fr = idx - i0;
      if (i0 >= n - 1) return R[n - 1];
      return R[i0] + (R[i0 + 1] - R[i0]) * fr;
    }
    var curve = [], best = null;
    for (var tau = -maxLagMs; tau <= maxLagMs + 1e-9; tau += lagStepMs) {
      var s = 0;
      for (var j = 0; j < iEnd; j++) s += ls[j] * rAt(pts[j].t + tau);
      var ncc = s / denom;
      curve.push({ tauMs: r3(tau), ncc: r3(ncc) });
      if (!best || Math.abs(ncc) > Math.abs(best.ncc)) best = { tauMs: r3(tau), ncc: r3(ncc) };
    }
    return {
      iacc: r3(Math.abs(best.ncc)),
      oneMinusIacc: r3(1 - Math.abs(best.ncc)),
      tauMs: best.tauMs,
      dt: r3(dt), n: iEnd, windowMs: windowMs, maxLagMs: maxLagMs,
      curve: curve
    };
  }

  /* ==================================================================
   * 5) ITDG（初始时延差）
   * ------------------------------------------------------------------
   * 直达声取首个超过阈值（默认直达峰值 −20 dB）的局部极大；
   * 第一显著反射取其后 ≥1 ms 的、再次超过阈值的局部极大。
   * Beranek：ITDG < 20 ms 有亲切感；20~40 ms 中等；> 40 ms 显空旷。
   * ================================================================== */

  function itdg(points, thresholdDb) {
    var thr = thresholdDb == null ? -20 : thresholdDb;
    if (!points || points.length < 3) return { error: 'too-few-points' };
    var pts = points.slice().sort(function (a, b) { return a.t - b.t; });
    var abs = pts.map(function (q) { return Math.abs(q.p); });
    var pMax = Math.max.apply(null, abs);
    if (!(pMax > 0)) return { error: 'zero-signal' };
    var thrAbs = pMax * Math.pow(10, thr / 20);
    function isLocalMax(i) {
      if (i <= 0 || i >= abs.length - 1) return false;
      return abs[i] >= abs[i - 1] && abs[i] >= abs[i + 1];
    }
    var iD = -1;
    for (var i = 1; i < abs.length - 1; i++) {
      if (isLocalMax(i) && abs[i] >= thrAbs) { iD = i; break; }
    }
    if (iD < 0) return { error: 'no-direct', thresholdDb: thr };
    var iR = -1;
    for (var j = iD + 1; j < abs.length - 1; j++) {
      if (pts[j].t - pts[iD].t >= 1 && isLocalMax(j) && abs[j] >= thrAbs) { iR = j; break; }
    }
    var out = {
      thresholdDb: thr,
      directT: r1(pts[iD].t),
      directLevel: r1(20 * lg(abs[iD] / pMax)),
      pMax: pMax
    };
    if (iR < 0) {
      out.itdg = null;
      out.note = '直达声之后未找到超过 ' + thr + ' dB 阈值的显著反射（ITDG 无法定义）。';
      return out;
    }
    out.reflT = r1(pts[iR].t);
    out.reflLevel = r1(20 * lg(abs[iR] / abs[iD]));
    out.itdg = r1(pts[iR].t - pts[iD].t);
    out.beranek = out.itdg < 20 ? 'beranek-intimate'
      : out.itdg <= 40 ? 'beranek-moderate' : 'beranek-large';
    return out;
  }

  /* ==================================================================
   * 6) BR 低音比
   * ------------------------------------------------------------------
   * BR = (RT125 + RT250) / (RT500 + RT1000)。BR > 1：低音混响长于中频，
   * 声音温暖；音乐厅一般希望 BR ≥ 1.0（浪漫派曲目 1.1~1.2，参见 Beranek）。
   * ================================================================== */

  function bassRatio(rt125, rt250, rt500, rt1000) {
    var a = num(rt125), b = num(rt250), c = num(rt500), d = num(rt1000);
    if (a == null || b == null || c == null || d == null) return null;
    var den = c + d;
    if (!(den > 0)) return null;
    var br = (a + b) / den;
    return {
      br: r2(br),
      verdict: br >= 1.1 ? 'warm' : br >= 1.0 ? 'balanced' : 'lean'
    };
  }

  /* ==================================================================
   * 8) 示例数据（教学用合成数据）
   * ------------------------------------------------------------------
   * 默认例题经过自校验：衰减曲线合成双折线（早期 1.68 s / 晚期 1.90 s，
   * 折点 200 ms），各指标落在 Table A.1 推荐区间；单耳示例直达 2 ms、
   * 第一显著反射 18 ms（ITDG = 16 ms，Beranek 亲切判据内）。
   * 尾段用确定性伪随机（Lehmer 发生器），保证每次生成完全一致。
   * ================================================================== */

  function lehmer(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () { s = (s * 48271) % 2147483647; return s / 2147483647; };
  }

  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function f3(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }

  /** Schroeder 衰减曲线示例：时间(ms) 声压级(dB)，0~1600 ms 每 25 ms */
  function exampleDecay() {
    var out = ['# 时间(ms)  声压级(dB) —— Schroeder 后向积分衰减曲线（合成双折线：早期 1.68 s / 晚期 1.90 s，折点 200 ms）'];
    for (var t = 0; t <= 1600; t += 25) {
      var lv = t <= 200
        ? -(60 / 1.68) * (t / 1000)
        : -(60 / 1.68) * 0.2 - (60 / 1.90) * (t / 1000 - 0.2);
      out.push(t + '  ' + f1(lv));
    }
    return out.join('\n');
  }

  /** 双耳 IR 示例：时间(ms) 左耳 右耳，0~160 ms 每 2 ms（三角脉冲，半宽 3 ms） */
  function exampleBinaural() {
    var L = [[2, 0.42], [8, 0.45], [16, 0.35], [25, 0.30], [33, 0.20], [38, 0.20], [52, 0.14], [68, 0.10]];
    var R = [[2, 0.40], [8, 0.32], [16, -0.38], [25, 0.28], [33, 0.22], [38, -0.18], [52, 0.12], [68, 0.09]];
    var rnd = lehmer(20260916);
    var out = ['# 时间(ms)  左耳  右耳 —— 双耳脉冲响应（左右耳到达时刻与幅度略有差异）'];
    for (var t = 0; t <= 160; t += 2) {
      var lv = 0, rv = 0;
      L.forEach(function (a) { lv += a[1] * Math.max(0, 1 - Math.abs(t - a[0]) / 3); });
      R.forEach(function (a) { rv += a[1] * Math.max(0, 1 - Math.abs(t - a[0]) / 3); });
      if (t > 80) {
        var tail = 0.10 * Math.exp(-(t - 80) / 45);
        lv += tail * (2 * rnd() - 1);
        rv += tail * (2 * rnd() - 1);
      }
      out.push(t + '  ' + f3(lv) + '  ' + f3(rv));
    }
    return out.join('\n');
  }

  /** 单耳 IR 示例：时间(ms) 幅值，0~120 ms 每 1 ms（直达 2 ms，第一显著反射 18 ms） */
  function exampleMono() {
    var A = [[2, 1.0], [18, 0.5], [30, 0.28], [45, 0.20], [62, 0.14], [85, 0.10]];
    var rnd = lehmer(33820338);
    var out = ['# 时间(ms)  幅值 —— 单耳脉冲响应（直达 2 ms，第一显著反射 18 ms，ITDG = 16 ms）'];
    for (var t = 0; t <= 120; t += 1) {
      var v = 0;
      A.forEach(function (a) { v += a[1] * Math.max(0, 1 - Math.abs(t - a[0]) / 2); });
      if (t > 90) v += 0.06 * Math.exp(-(t - 90) / 30) * (2 * rnd() - 1);
      out.push(t + '  ' + f3(v));
    }
    return out.join('\n');
  }

  /* ==================================================================
   * 7) 目标值表
   * ================================================================== */

  /** ISO 3382-1:2009 Table A.1（音乐厅及 ≤25000 m³ 空场多用途厅，中频 500–1000 Hz） */
  var TARGETS = [
    { key: 'G', name: '强度 G', unit: 'dB', min: -2, max: 10, band: '500–1000 Hz', jnd: '1 dB', sense: '听闻声级（相对 10 m 自由场）' },
    { key: 'EDT', name: '早期衰减时间 EDT', unit: 's', min: 1, max: 3, band: '500–1000 Hz', jnd: '相对 5%', sense: '感知混响' },
    { key: 'C80', name: '清晰度 C80', unit: 'dB', min: -5, max: 5, band: '500–1000 Hz', jnd: '1 dB', sense: '音乐清晰度' },
    { key: 'D50', name: '语言清晰度 D50', unit: '%', min: 30, max: 70, band: '500–1000 Hz', jnd: '0.05', sense: '语言清晰度' },
    { key: 'Ts', name: '中心时间 Ts', unit: 'ms', min: 60, max: 260, band: '500–1000 Hz', jnd: '10 ms', sense: '清晰度与混响的平衡' },
    { key: 'LF', name: '侧向能量分数 LF / LFC', unit: '%', min: 5, max: 35, band: '125–1000 Hz', jnd: '0.05', sense: '表观声源宽度 ASW' },
    { key: 'LJ', name: '晚侧向声级 LJ', unit: 'dB', min: -14, max: 1, band: '125–1000 Hz', jnd: '—', sense: '听者环绕感 LEV' }
  ];

  /** 文献按厅种目标值（Beranek 2004 / Barron 2009，经 AcousPlan 整理；非 ISO 强制） */
  var VENUE_TARGETS = [
    {
      venue: '交响音乐厅（1500–2500 座）',
      rows: [
        { key: 'T30', unit: 's', min: 1.8, max: 2.2 }, { key: 'EDT', unit: 's', min: 1.6, max: 2.0 },
        { key: 'EDT/T30', unit: '', min: 0.85, max: 0.95 }, { key: 'C80', unit: 'dB', min: -2, max: 1 },
        { key: 'D50', unit: '%', min: 30, max: 45 }, { key: 'Ts', unit: 'ms', min: 90, max: 130 },
        { key: 'G', unit: 'dB', min: 3, max: 5 }, { key: 'LF', unit: '%', min: 20, max: 35 },
        { key: 'IACC_E', unit: '', min: 0.25, max: 0.45 }
      ]
    },
    {
      venue: '室内乐厅（400–1000 座）',
      rows: [
        { key: 'T30', unit: 's', min: 1.4, max: 1.8 }, { key: 'EDT', unit: 's', min: 1.3, max: 1.7 },
        { key: 'EDT/T30', unit: '', min: 0.85, max: 1.0 }, { key: 'C80', unit: 'dB', min: 0, max: 3 },
        { key: 'D50', unit: '%', min: 40, max: 55 }, { key: 'Ts', unit: 'ms', min: 70, max: 100 },
        { key: 'G', unit: 'dB', min: 5, max: 8 }, { key: 'LF', unit: '%', min: 15, max: 28 },
        { key: 'IACC_E', unit: '', min: 0.30, max: 0.50 }
      ]
    },
    {
      venue: '歌剧院（1000–2000 座）',
      rows: [
        { key: 'T30', unit: 's', min: 1.2, max: 1.6 }, { key: 'EDT', unit: 's', min: 1.0, max: 1.4 },
        { key: 'EDT/T30', unit: '', min: 0.80, max: 0.90 }, { key: 'C80', unit: 'dB', min: 1, max: 4 },
        { key: 'D50', unit: '%', min: 45, max: 60 }, { key: 'Ts', unit: 'ms', min: 60, max: 90 },
        { key: 'G', unit: 'dB', min: 4, max: 7 }, { key: 'LF', unit: '%', min: 15, max: 25 },
        { key: 'IACC_E', unit: '', min: 0.35, max: 0.55 }
      ]
    }
  ];

  /** T30 按曲目/用途的文献推荐（中频） */
  var T30_BY_USE = [
    { use: '管风琴 / 大型合唱', t30: '> 2.5 s' },
    { use: '浪漫派交响乐', t30: '1.8 ~ 2.2 s' },
    { use: '早期古典 / 巴洛克', t30: '1.6 ~ 1.8 s' },
    { use: '歌剧', t30: '1.3 ~ 1.8 s' },
    { use: '室内乐', t30: '1.4 ~ 1.7 s' },
    { use: '戏剧 / 话剧', t30: '0.7 ~ 1.0 s' }
  ];

  /** 单项目标值比对：value 与 TARGETS 中该项比较 */
  function checkTarget(key, value) {
    var t = TARGETS.filter(function (x) { return x.key === key; })[0];
    var v = num(value);
    if (!t || v == null) return null;
    return {
      key: key, name: t.name, unit: t.unit, band: t.band,
      value: v, min: t.min, max: t.max,
      inRange: v >= t.min - 1e-9 && v <= t.max + 1e-9
    };
  }

  return {
    // 解析
    parseDecay: parseDecay,
    parseIR: parseIR,
    parseMono: parseMono,
    // 衰减曲线指标
    prepare: prepare,
    fitDecay: fitDecay,
    edt: edt, t20: t20, t30: t30,
    weights: weights,
    clarity: clarity, d50: d50, centerTime: centerTime,
    decayReport: decayReport,
    // 强度与侧向
    G_CONST: G_CONST,
    strengthFromRef: strengthFromRef, strengthFromLW: strengthFromLW,
    freeFieldDistance: freeFieldDistance,
    lateralFraction: lateralFraction, lateLateralLevel: lateLateralLevel,
    // 双耳与 ITDG
    iacc: iacc, itdg: itdg,
    // 低音比与目标值
    bassRatio: bassRatio,
    TARGETS: TARGETS, VENUE_TARGETS: VENUE_TARGETS, T30_BY_USE: T30_BY_USE,
    checkTarget: checkTarget,
    // 示例数据
    exampleDecay: exampleDecay, exampleBinaural: exampleBinaural, exampleMono: exampleMono
  };
});
