/*
 * barrier.js — 声屏障绕射衰减内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Barrier，Node 下 module.exports。
 *
 * 方法：菲涅尔数法（无限长屏障、仅计绕射）
 *   几何：D = 声源到接收点直线距离
 *         A = 声源到屏障顶距离，B = 屏障顶到接收点距离
 *         程差 δ = A + B − D，菲涅尔数 N = 2δ/λ = 2 f δ / c
 *   衰减：Kurze–Anderson   ΔL = 10 lg(3 + 20N)          （N 较小时使用）
 *         Maekawa          ΔL = 5 + 20 lg( √(2πN) / tanh√(2πN) )
 *   实际工程中插入损失还受屏障隔声量、侧向绕射、透射漏声与地面效应限制，
 *   经验上限取 24 dB（可通过 maxLimit 调整）。
 */
(function (global) {
  'use strict';

  var C0 = 343;
  var BANDS = [63, 125, 250, 500, 1000, 2000, 4000];

  // 声源谱预设（各倍频带声压级 dB：63–4000 Hz）
  var SOURCES = [
    { id: 'road', name: '道路交通噪声（稳定车流）', levels: [70, 68, 65, 62, 59, 55, 50] },
    { id: 'road-fast', name: '高速公路（高速车流/轮胎噪声）', levels: [72, 71, 69, 67, 66, 63, 58] },
    { id: 'rail', name: '轨道交通（轮轨噪声）', levels: [74, 76, 74, 70, 66, 61, 55] },
    { id: 'construction', name: '施工噪声（土方/打桩）', levels: [85, 88, 86, 82, 78, 74, 68] },
    { id: 'fan', name: '风机 / 冷却塔', levels: [72, 76, 78, 75, 71, 66, 60] },
    { id: 'pump', name: '水泵 / 机组设备', levels: [78, 80, 80, 77, 73, 68, 62] },
    { id: 'transformer', name: '变压器（低频为主）', levels: [82, 84, 82, 76, 70, 64, 58] },
    { id: 'crowd', name: '人群活动 / 广场', levels: [60, 65, 68, 66, 63, 58, 52] },
    { id: 'flat', name: '平直谱（不做计权修正）', levels: [80, 80, 80, 80, 80, 80, 80] }
  ];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // A 计权（IEC 61672 解析式）
  function aWeight(f) {
    var f1 = 20.598997, f2 = 107.65265, f3 = 737.86223, f4 = 12194.217;
    var x = (12194.217 * 12194.217 * Math.pow(f, 4)) /
      ((Math.pow(f, 2) + Math.pow(f1, 2)) *
        Math.sqrt((Math.pow(f, 2) + Math.pow(f2, 2)) * (Math.pow(f, 2) + Math.pow(f3, 2))) *
        (Math.pow(f, 2) + Math.pow(f4, 2)));
    return 20 * Math.log10(x) + 1.9997;
  }

  // 几何：hs 声源高、hb 屏障顶高、hr 接收点高、d1 声源到屏障水平距、d2 屏障到接收点水平距（m）
  function geometry(o) {
    o = o || {};
    var hs = num(o.hs), hb = num(o.hb), hr = num(o.hr);
    var d1 = num(o.d1), d2 = num(o.d2);
    if (hs == null || hb == null || hr == null) return { ok: false, error: '请填写声源、屏障顶与接收点高度' };
    if (d1 == null || d1 <= 0 || d2 == null || d2 <= 0) return { ok: false, error: '水平距离 d1、d2 需大于 0' };

    var d = d1 + d2;
    var D = Math.sqrt(d * d + Math.pow(hr - hs, 2));
    var A = Math.sqrt(d1 * d1 + Math.pow(hb - hs, 2));
    var B = Math.sqrt(d2 * d2 + Math.pow(hr - hb, 2));
    var delta = A + B - D;
    var hLOS = hs + (hr - hs) * d1 / d;         // 视线在屏障处的高度
    var blocked = hb > hLOS;

    return {
      ok: true,
      D: D, A: A, B: B,
      delta: delta,
      hLOS: hLOS,
      hEffective: hb - hLOS,                     // 屏障顶超出视线的高度
      blocked: blocked,
      shadowAngle: Math.asin((hb - hLOS) / Math.sqrt(d1 * d1 + Math.pow(hb - hs, 2))) * 180 / Math.PI,
      distances: { d1: d1, d2: d2 }
    };
  }

  function fresnel(delta, f) { return 2 * f * delta / C0; }

  function attenuation(N) {
    if (N == null || !isFinite(N)) return null;
    if (N <= 0) return { N: N, kurzeAnderson: 0, maekawa: 0, none: true };   // 未遮挡视线
    var ka = 10 * Math.log10(3 + 20 * N);                     // Kurze–Anderson
    var s = Math.sqrt(2 * Math.PI * N);
    var mk = 5 + 20 * Math.log10(s / Math.tanh(s));            // Maekawa
    return { N: N, kurzeAnderson: Math.max(0, ka), maekawa: Math.max(0, mk) };
  }

  // 单频点
  function point(o, f) {
    var g = geometry(o);
    if (!g.ok) return g;
    var N = fresnel(g.delta, f);
    var a = attenuation(N);
    var choice = o.formula === 'maekawa' ? a.maekawa : a.kurzeAnderson;
    var limit = num(o.maxLimit) != null ? num(o.maxLimit) : 24;
    return {
      ok: true,
      f: f,
      N: N,
      delta: g.delta,
      kurzeAnderson: a.kurzeAnderson,
      maekawa: a.maekawa,
      deltaL: Math.min(choice, limit),
      limited: choice > limit,
      geometric: g
    };
  }

  // 倍频带插入损失 + 声源谱叠加的 A 计权插入损失
  function spectrum(o) {
    o = o || {};
    var g = geometry(o);
    if (!g.ok) return g;
    if (!g.blocked) {
      return {
        ok: false,
        error: '屏障顶低于声源—接收点视线（屏障高度不足，视线未被遮挡），绕射衰减可忽略。可提高屏障高度或移动位置。'
      };
    }
    var src = null;
    if (o.sourceId) {
      for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === o.sourceId) src = SOURCES[i];
    }
    var levels = src ? src.levels.slice() : BANDS.map(function () { return num(o.sourceLevel) != null ? num(o.sourceLevel) : 80; });
    var useA = src ? src.id !== 'flat' : true;

    var rows = [], energyBefore = 0, energyAfter = 0;
    for (var b = 0; b < BANDS.length; b++) {
      var p = point(o, BANDS[b]);
      if (!p.ok) return p;
      var w = useA ? aWeight(BANDS[b]) : 0;
      var before = levels[b] + w;
      var after = before - p.deltaL;
      energyBefore += Math.pow(10, before / 10);
      energyAfter += Math.pow(10, after / 10);
      rows.push({
        f: BANDS[b],
        source: levels[b],
        N: p.N,
        kurzeAnderson: p.kurzeAnderson,
        maekawa: p.maekawa,
        deltaL: p.deltaL,
        limited: p.limited
      });
    }
    var overallBefore = 10 * Math.log10(energyBefore);
    var overallAfter = 10 * Math.log10(energyAfter);

    return {
      ok: true,
      geometric: g,
      source: src,
      sourceName: src ? src.name : '自定义平直谱',
      weighted: useA,
      bands: BANDS,
      rows: rows,
      overallBefore: overallBefore,
      overallAfter: overallAfter,
      insertionLoss: overallBefore - overallAfter,     // A 计权插入损失
      singleNumber: Math.round((overallBefore - overallAfter) * 10) / 10
    };
  }

  // 反向建议：达标所需的屏障高度（在给定距离下逐 0.05 m 试算）
  function requiredHeight(o) {
    o = o || {};
    var target = num(o.targetIL);
    var hs = num(o.hs), hr = num(o.hr), d1 = num(o.d1), d2 = num(o.d2);
    if (target == null || target <= 0) return { ok: false, error: '请输入目标插入损失（> 0 dB）' };
    if (hs == null || hr == null || d1 == null || d2 == null) return { ok: false, error: '请先填写几何参数' };
    var start = Math.max(hs, hr) + 0.1;
    for (var h = start; h <= start + 20; h += 0.05) {
      var r = spectrum({
        hs: hs, hr: hr, d1: d1, d2: d2, hb: h,
        sourceId: o.sourceId || 'road',
        formula: o.formula,
        maxLimit: o.maxLimit
      });
      if (r.ok && r.insertionLoss >= target) {
        return { ok: true, height: Math.round(h * 100) / 100, achieved: r.insertionLoss, target: target };
      }
    }
    return { ok: false, error: '在 20 m 额外高度范围内无法达到目标插入损失，请调整布局（缩短 d1/d2 或提高屏障位置）。' };
  }

  var API = {
    C0: C0,
    BANDS: BANDS,
    SOURCES: SOURCES,
    aWeight: aWeight,
    geometry: geometry,
    fresnel: fresnel,
    attenuation: attenuation,
    point: point,
    spectrum: spectrum,
    requiredHeight: requiredHeight
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Barrier = API;
  }
})(typeof window !== 'undefined' ? window : this);
