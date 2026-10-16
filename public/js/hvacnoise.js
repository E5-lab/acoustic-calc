/*
 * hvacnoise.js — 设备与管道声学内核（纯函数，无构建依赖）
 * UMD 包装：浏览器挂到 window.HvacNoise，Node 下 module.exports。
 *
 * 面向暖通空调 / 设备噪声控制的常见工程估算（参考 GB/T 50087、ISO 3744/3746）：
 *   1) 设备声功率 → 房间声压级：Lp = Lw + 10lg( Q/(4πr²) + 4/R )（R 为房间常数）。
 *   2) 风管元件传声损失：直管衰减、弯头、出口端反射损失，并沿路径叠加。
 *   3) 声功率测定（ISO 3744 工程法 / ISO 3746 简易法）：
 *        Lw = Lp + 10lg(S/S0) − K1(背景) − K2(环境)，S0 = 1 m²。
 *
 * 说明：风管元件 TL 为基于声学原理的估算公式，给出量级与趋势，详细设计应依据
 * 厂家实测消声量曲线与标准测量。
 */
(function (global) {
  'use strict';

  var C0 = 343;

  // 统一频带网格
  var GRID_HZ = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000];
  var OCT_HZ = [125, 250, 500, 1000, 2000, 4000];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // A 计权（IEC 61672 解析公式，单位 dB，1000 Hz 处为 0）
  function aWeight(f) {
    var f2 = f * f;
    var r = (12194 * 12194 * f2 * f2) /
      ((f2 + 20.6 * 20.6) *
        Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
        (f2 + 12194 * 12194));
    return 20 * Math.log10(r) + 2.0;
  }
  function overallA(spectrum) {
    var s = 0;
    spectrum.forEach(function (p) { s += Math.pow(10, (p.Lp != null ? p.Lp : p) / 10); });
    return 10 * Math.log10(s);
  }

  // ---------------------------------------------------------------------------
  // 1) 设备声功率 → 房间声压级
  // ---------------------------------------------------------------------------
  function equipmentSPL(o) {
    o = o || {};
    var Lw = o.Lw, bands = o.bands || GRID_HZ;
    var R = num(o.R), Q = o.Q != null ? num(o.Q) : 1, r = num(o.r);
    if (!Lw || R == null || R <= 0) return { ok: false, error: '请输入声功率谱 Lw 与房间常数 R (>0)' };
    if (r == null || r <= 0) r = 1;
    if (Lw.length !== bands.length) return { ok: false, error: 'Lw 与频带数量不一致' };
    var spec = bands.map(function (f, i) {
      var lw = num(Lw[i]);
      if (lw == null) return { f: f, Lw: null, Lp: null };
      var direct = Q / (4 * Math.PI * r * r);
      var rev = 4 / R;
      var lp = lw + 10 * Math.log10(direct + rev);
      return { f: f, Lw: lw, Lp: lp };
    });
    var sumA = 0;
    spec.forEach(function (p) { if (p.Lp != null) sumA += Math.pow(10, (p.Lp + aWeight(p.f)) / 10); });
    return { ok: true, spectrum: spec, overallA: 10 * Math.log10(sumA), R: R, Q: Q, r: r, bands: bands };
  }

  // 由房间表面积 S 与平均吸声系数 α 求房间常数 R = S·α/(1−α)
  function roomConstant(S, alphaBar) {
    var s = num(S), a = num(alphaBar);
    if (s == null || s <= 0 || a == null || a <= 0 || a >= 1) return null;
    return s * a / (1 - a);
  }

  // ---------------------------------------------------------------------------
  // 2) 风管元件传声损失
  // ---------------------------------------------------------------------------
  // 直管衰减：TL = 长度(m) × 衰减率(dB/m)
  function straightDuctTL(o) {
    var L = num(o.L), rate = num(o.ratePerM);
    if (L == null || L <= 0 || rate == null || rate < 0) return null;
    return L * rate;
  }
  // 弯头（无内衬 90°）：以管宽对应截止频率为界，其上每倍频约 +X dB
  function elbowTL(o) {
    var f = num(o.freq), w = num(o.width);
    if (f == null || w == null || w <= 0) return null;
    var fc = C0 / (2 * w);
    if (f <= fc) return 0;
    return Math.min(10 * Math.log10(f / fc), 10);
  }
  // 出口端反射损失：开口端反射近似，flanged=2 否则 1；高频增益趋于平稳（封顶 25 dB）
  function endReflectionTL(o) {
    var f = num(o.freq), d = num(o.diameter), fl = o.flanged ? 2 : 1;
    if (f == null || d == null || d <= 0) return null;
    var ka = 2 * Math.PI * f / C0 * (d / 2);
    return Math.min(10 * Math.log10(1 + Math.pow(fl * ka, 2)), 25);
  }

  // 沿风管路径叠加（segments 顺序：入口→出口）
  // segments: [{type:'straight',L,ratePerM} | {type:'elbow',width} | {type:'end',diameter,flanged}]
  function ductPath(o) {
    o = o || {};
    var Lw = o.Lw, bands = o.bands || GRID_HZ;
    if (!Lw || Lw.length !== bands.length) return { ok: false, error: '请输入入口声功率谱 Lw（与频带对齐）' };
    var segs = o.segments || [];
    var tlSpec = bands.map(function (f) {
      var tl = 0;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (s.type === 'straight') tl += straightDuctTL({ L: s.L, ratePerM: s.ratePerM }) || 0;
        else if (s.type === 'elbow') tl += elbowTL({ freq: f, width: s.width }) || 0;
        else if (s.type === 'end') tl += endReflectionTL({ freq: f, diameter: s.diameter, flanged: s.flanged }) || 0;
      }
      return tl;
    });
    var outletLw = bands.map(function (f, i) {
      var lw = num(Lw[i]);
      return lw == null ? null : lw - tlSpec[i];
    });
    var res = { ok: true, bands: bands, tlSpectrum: tlSpec, outletLw: outletLw };
    // 若给出接收房间参数，进一步算房间声压级
    if (o.R != null) {
      var sp = equipmentSPL({ Lw: outletLw, bands: bands, R: o.R, Q: o.Q, r: o.r });
      if (sp.ok) { res.room = sp; res.overallA = sp.overallA; }
    }
    return res;
  }

  // ---------------------------------------------------------------------------
  // 3) 声功率测定 ISO 3744 / 3746
  // ---------------------------------------------------------------------------
  function hemisphereSurface(r) { return 2 * Math.PI * r * r; }       // 反射面上半球
  function boxSurface(w, h, d, dist) {                                // 反射面上矩形包络
    w = num(w); h = num(h); d = num(d); dist = num(dist) || 0;
    if (w == null || h == null || d == null) return null;
    var W = w + 2 * dist, D = d + 2 * dist, H = h + dist;
    return W * D + 2 * W * H + 2 * D * H;   // 顶面 + 四侧（地面不计）
  }
  function soundPowerISO(o) {
    o = o || {};
    var Lp = o.LpMean, bands = o.bands || OCT_HZ;
    var S = num(o.S), K1 = num(o.K1) || 0, K2 = num(o.K2) || 0;
    if (!Lp || S == null || S <= 0) return { ok: false, error: '请输入平均声压级 Lp 与测量表面积 S (>0)' };
    if (Lp.length !== bands.length) return { ok: false, error: 'Lp 与频带数量不一致' };
    var spec = bands.map(function (f, i) {
      var lp = num(Lp[i]);
      var lw = (lp == null) ? null : lp + 10 * Math.log10(S / 1) - K1 - K2;  // S0 = 1 m²
      return { f: f, Lp: lp, Lw: lw };
    });
    var sumA = 0;
    spec.forEach(function (p) { if (p.Lw != null) sumA += Math.pow(10, (p.Lw + aWeight(p.f)) / 10); });
    return { ok: true, spectrum: spec, overallLw: 10 * Math.log10(sumA), S: S, K1: K1, K2: K2, method: o.method || 'ISO 3744/3746' };
  }

  var API = {
    C0: C0, GRID_HZ: GRID_HZ, OCT_HZ: OCT_HZ,
    num: num, aWeight: aWeight, overallA: overallA,
    equipmentSPL: equipmentSPL,
    roomConstant: roomConstant,
    straightDuctTL: straightDuctTL,
    elbowTL: elbowTL,
    endReflectionTL: endReflectionTL,
    ductPath: ductPath,
    hemisphereSurface: hemisphereSurface,
    boxSurface: boxSurface,
    soundPowerISO: soundPowerISO
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.HvacNoise = API;
  }
})(typeof window !== 'undefined' ? window : this);
