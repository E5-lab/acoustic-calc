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
 *
 * 扩展（有限长 + 地面反射）：
 *   1) 有限长屏障：声可绕过两端（竖直端棱，平面视图几何）——三条绕射路径
 *      （顶部 / 左端 / 右端）按能量合成：IL = −10 lg Σ 10^(−IL_i/10)。
 *   2) 地面反射修正（镜像声源法）：地面反射声视为镜像声源 S′(−hs) 的射线；
 *      无屏障/有屏障两侧各计入直达 + 镜像两路能量（|ρ| 为地面能量反射系数，
 *      硬地面≈1、一般地面≈0.4、吸声/不计=0），净插入损失随之修正。
 *      注：仅作用于顶部绕射路径；屏障板面反射与多重反射未计入。
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

  // 有限长屏障的端部绕射程差（平面视图，端棱为竖直棱、与高度无关）
  //   屏障长 L，声源—接收点轴线在屏障上的交点距左端 c（默认 L/2）：
  //   δ_left  = √(c²+d1²) + √(c²+d2²) − (d1+d2)
  //   δ_right = √((L−c)²+d1²) + √((L−c)²+d2²) − (d1+d2)
  function planDelta(o) {
    o = o || {};
    var L = num(o.length), c = num(o.offset);
    var d1 = num(o.d1), d2 = num(o.d2);
    if (L == null || L <= 0) return { ok: false, error: '请输入屏障长度 L（> 0）' };
    if (d1 == null || d1 <= 0 || d2 == null || d2 <= 0) return { ok: false, error: '水平距离 d1、d2 需大于 0' };
    if (c == null) c = L / 2;
    if (c < 0 || c > L) return { ok: false, error: '轴线交点须落在屏障范围内（0 ≤ c ≤ L）' };
    function one(x) {
      return Math.sqrt(x * x + d1 * d1) + Math.sqrt(x * x + d2 * d2) - (d1 + d2);
    }
    return { ok: true, length: L, offset: c, deltaLeft: one(c), deltaRight: one(L - c) };
  }

  // 镜像声源路径（地面反射）：镜像源 S′(−hs) 过屏障顶的程差与相对扩展损失
  function imagePath(o) {
    o = o || {};
    var hs = num(o.hs), hb = num(o.hb), hr = num(o.hr);
    var d1 = num(o.d1), d2 = num(o.d2);
    if (hs == null || hb == null || hr == null || d1 == null || d2 == null) return null;
    var d = d1 + d2;
    var D = Math.sqrt(d * d + Math.pow(hr - hs, 2));
    var Di = Math.sqrt(d * d + Math.pow(hr + hs, 2));
    var Ai = Math.sqrt(d1 * d1 + Math.pow(hb + hs, 2));
    var Bi = Math.sqrt(d2 * d2 + Math.pow(hr - hb, 2));
    return {
      delta: Ai + Bi - Di,
      spread: 20 * Math.log10(Di / D)   // 镜像射线相对直达的扩展损失 dB
    };
  }

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
  // 可选扩展：o.length（屏障长，缺省 = 无限长，仅顶部绕射）、o.offset（轴线交点距左端）、
  //           o.ground（'hard'|'mixed'|数值 ρ，缺省不计地面反射）
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
    // 有限长端部绕射（可选）
    var finite = num(o.length) != null;
    var pd = null;
    if (finite) {
      pd = planDelta({ length: o.length, offset: o.offset, d1: o.d1, d2: o.d2 });
      if (!pd.ok) return pd;
    }
    // 地面反射能量系数 ρ：hard ≈ 1，mixed ≈ 0.4，缺省 0（不计）
    var rho = 0;
    if (o.ground === 'hard') rho = 1;
    else if (o.ground === 'mixed') rho = 0.4;
    else if (num(o.rho) != null) rho = Math.max(0, Math.min(1, num(o.rho)));
    else if (num(o.ground) != null) rho = Math.max(0, Math.min(1, num(o.ground)));
    var img = rho > 0 ? imagePath(o) : null;

    var src = null;
    if (o.sourceId) {
      for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === o.sourceId) src = SOURCES[i];
    }
    var levels = src ? src.levels.slice() : BANDS.map(function () { return num(o.sourceLevel) != null ? num(o.sourceLevel) : 80; });
    var useA = src ? src.id !== 'flat' : true;
    var limit = num(o.maxLimit) != null ? num(o.maxLimit) : 24;
    function pickAtt(a) {                       // 各路径取物理值（不截断），合成后再按上限截断
      if (!a || a.none) return 0;
      var v = o.formula === 'maekawa' ? a.maekawa : a.kurzeAnderson;
      return Math.max(0, v);
    }

    var rows = [], energyBefore = 0, energyAfter = 0;
    for (var b = 0; b < BANDS.length; b++) {
      var f = BANDS[b];
      var NTop = fresnel(g.delta, f);
      var aTop = attenuation(NTop);
      var ilTop = pickAtt(aTop);
      var ilLeft = null, ilRight = null;
      if (finite) {
        ilLeft = pickAtt(attenuation(fresnel(pd.deltaLeft, f)));
        ilRight = pickAtt(attenuation(fresnel(pd.deltaRight, f)));
      }
      var ilImg = null;
      if (img) ilImg = pickAtt(attenuation(fresnel(img.delta, f)));

      var w = useA ? aWeight(f) : 0;
      var before = levels[b] + w;
      // 无屏障：直达 + 地面反射（镜像）两路能量
      var unsh = before + (img ? 10 * Math.log10(1 + rho * rho * Math.pow(10, -img.spread / 10)) : 0);
      // 有屏障：顶部（+两端）绕射 + 镜像顶部绕射，能量合成
      var eAfter = Math.pow(10, (before - ilTop) / 10);
      if (finite) {
        eAfter += Math.pow(10, (before - ilLeft) / 10) + Math.pow(10, (before - ilRight) / 10);
      }
      if (img) eAfter += rho * rho * Math.pow(10, (before - img.spread - ilImg) / 10);
      var bandIL = unsh - 10 * Math.log10(eAfter);      // 合成插入损失（未截断）
      var limited = bandIL > limit;
      var deltaL = Math.min(bandIL, limit);
      var after = unsh - deltaL;

      energyBefore += Math.pow(10, unsh / 10);
      energyAfter += Math.pow(10, after / 10);
      rows.push({
        f: f,
        source: levels[b],
        N: NTop,
        kurzeAnderson: aTop.kurzeAnderson,
        maekawa: aTop.maekawa,
        ilTop: ilTop,
        ilLeft: ilLeft,
        ilRight: ilRight,
        ilImage: ilImg,
        deltaL: deltaL,               // 合成（含端部与地面修正）逐带插入损失，按上限截断
        limited: limited
      });
    }
    var overallBefore = 10 * Math.log10(energyBefore);
    var overallAfter = 10 * Math.log10(energyAfter);

    return {
      ok: true,
      geometric: g,
      plan: pd,                        // null = 无限长
      finite: finite,
      groundRho: rho,
      image: img,
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
        maxLimit: o.maxLimit,
        length: o.length, offset: o.offset, ground: o.ground
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
    planDelta: planDelta,
    imagePath: imagePath,
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
