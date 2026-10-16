/*
 * smallroom.js — 小房间与室内声场内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SmallRoom，Node 下 module.exports。
 *
 * 依据：《建筑声环境》（车世光/王炳麟/秦佑国）第 2 章「室内声学原理」、
 *      《声学基础》（杜功焕）第 8 章「室内声场」、《实用建筑声学》第 1 章。
 *
 * 1) 简正频率（矩形房间，三向刚性壁）：
 *      f = (c/2)·√[ (nx/L)² + (ny/W)² + (nz/H)² ]
 *      nx,ny,nz 为非负整数且不全为 0；非零下标个数 1/2/3 分别对应
 *      轴向（1 维）/ 切向（2 维）/ 斜向（3 维）简正波。
 * 2) 简正频率密度（Weyl 渐近式）：
 *      dN/df = 4πV f²/c³ + πS f/(2c²) + L/(8c)
 *    Schroeder 频率 f_s = 2000·√(RT60/V)，是「统计声学成立」的下限。
 * 3) Bonello 准则（小房间低频模态分布是否均匀）：把模态按 1/3 倍频程
 *    计数，要求「计数随频率单调不减」且「空带不连续出现」。
 * 4) 房间常数 R = S·ᾱ/(1−ᾱ)，临界距离（混响半径）r_c = 0.141·√(Q·R)。
 * 5) 室内稳态声压级（直达 + 混响，含声源指向性因子 Q）：
 *      Lp = Lw + 10·lg[ Q/(4πr²) + 4/R ]
 *    多声源按能量（10^(Lp/10)）叠加。
 * 6) 空气吸收衰减系数（ISO 9613-1，含温度/相对湿度/大气压修正）。
 */
(function (global) {
  'use strict';

  var C0 = 343;          // 参考声速 m/s（20 ℃）
  var RHO0 = 1.21;       // 空气密度 kg/m³
  var T0 = 293.15;       // 参考绝对温度 K
  var PR = 101.325;      // 参考大气压 kPa

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) || !isFinite(n) ? null : n;
  }
  function lg(x) { return Math.log(x) / Math.LN10; }

  /* ------------------------------------------------------------------ 1) 声速 / 波长 */
  // 声速随温度：c = 331.3·√(1 + t/273.15)  (t 为摄氏温度)
  function soundSpeed(tC) {
    var t = num(tC);
    if (t == null) return null;
    return 331.3 * Math.sqrt(1 + t / 273.15);
  }
  function wavelength(f, c) {
    var ff = num(f), cc = num(c) || C0;
    if (ff == null || ff <= 0) return null;
    return cc / ff;
  }

  /* ------------------------------------------------------------------ 2) 简正频率 */
  // 矩形房间简正频率表。返回按频率升序的列表 + 分类统计。
  function modes(o) {
    o = o || {};
    var L = num(o.length), W = num(o.width), H = num(o.height);
    var c = num(o.c) || C0;
    var fMax = num(o.fMax) || 300;
    if (L == null || W == null || H == null || L <= 0 || W <= 0 || H <= 0) {
      return { ok: false, error: '请输入有效的房间长、宽、高（> 0 m）' };
    }
    var nxMax = Math.max(0, Math.ceil(2 * fMax * L / c));
    var nyMax = Math.max(0, Math.ceil(2 * fMax * W / c));
    var nzMax = Math.max(0, Math.ceil(2 * fMax * H / c));
    var list = [], n = 0;
    for (var nx = 0; nx <= nxMax; nx++) {
      for (var ny = 0; ny <= nyMax; ny++) {
        for (var nz = 0; nz <= nzMax; nz++) {
          if (nx === 0 && ny === 0 && nz === 0) continue;
          var f = c / 2 * Math.sqrt(
            Math.pow(nx / L, 2) + Math.pow(ny / W, 2) + Math.pow(nz / H, 2)
          );
          if (f > fMax) continue;
          var dims = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
          list.push({
            nx: nx, ny: ny, nz: nz,
            f: f,
            dims: dims,
            type: dims === 1 ? 'axial' : (dims === 2 ? 'tangential' : 'oblique'),
            typeName: dims === 1 ? '轴向' : (dims === 2 ? '切向' : '斜向')
          });
          n++;
        }
      }
    }
    list.sort(function (a, b) { return a.f - b.f; });
    var stat = { axial: 0, tangential: 0, oblique: 0 };
    for (var i = 0; i < list.length; i++) stat[list[i].type]++;
    // 模态简并（重合）：频率差 < 容差即视为简并
    var tol = num(o.tol) || 0.5;
    var groups = [];
    for (i = 0; i < list.length; i++) {
      var g = groups[groups.length - 1];
      if (g && Math.abs(list[i].f - g.f) <= tol) { g.items.push(list[i]); g.f = (g.f + list[i].f) / 2; }
      else groups.push({ f: list[i].f, items: [list[i]] });
    }
    var degenerate = [];
    for (i = 0; i < groups.length; i++) if (groups[i].items.length > 1) degenerate.push(groups[i]);
    var V = L * W * H, S = 2 * (L * W + L * H + W * H);
    return {
      ok: true,
      count: n,
      list: list,
      stat: stat,
      volume: V,
      area: S,
      edgeLength: 4 * (L + W + H),
      fMax: fMax,
      c: c,
      degeneracy: { groups: degenerate.length, items: degenerate },
      fFirst: list.length ? list[0].f : null,
      axialFirst: (function () {
        for (var k = 0; k < list.length; k++) if (list[k].type === 'axial') return list[k];
        return null;
      })()
    };
  }

  // Weyl 简正频率密度 dN/df（个/Hz）
  function modeDensity(f, o) {
    o = o || {};
    var ff = num(f), V = num(o.volume);
    var L = num(o.length), W = num(o.width), H = num(o.height);
    var c = num(o.c) || C0;
    if (ff == null || ff <= 0 || V == null || V <= 0) return null;
    var S = null, Lp = null;
    if (L != null && W != null && H != null) {
      S = 2 * (L * W + L * H + W * H);
      Lp = 4 * (L + W + H);
    }
    var out = 4 * Math.PI * V * ff * ff / (c * c * c);
    if (S != null) out += Math.PI * S * ff / (2 * c * c);
    if (Lp != null) out += Lp / (8 * c);
    return out;
  }

  // Schroeder 频率 fs = 2000·√(RT/V)（Hz）
  function schroederFreq(RT, V) {
    var t = num(RT), v = num(V);
    if (t == null || v == null || t <= 0 || v <= 0) return null;
    return 2000 * Math.sqrt(t / v);
  }

  /* ------------------------------------------------------------------ 3) Bonello 准则 */
  var TERZ_HZ = [];
  (function () {
    // 25 Hz – 10 kHz 的 1/3 倍频程中心频率
    var f = 25;
    while (f <= 10000.5) { TERZ_HZ.push(Math.round(f * 100) / 100); f *= Math.pow(2, 1 / 3); }
  })();
  function terzIndex(f) {
    if (!(f > 0)) return -1;
    return Math.round(3 * Math.log2(f / 25));
  }
  // 各 1/3 倍频程带内的模态计数
  // 注意：末尾若存在「只有部分模态被计入」的残带（带宽上沿超过模态表最高频率），
  // 会人为造成计数下降，故直接截掉，保证 Bonello 单调性判断不被截断伪影污染。
  function terzCounts(list, fLow, fHigh) {
    var lo = num(fLow) == null ? 20 : num(fLow);
    var hi = num(fHigh) == null ? 300 : num(fHigh);
    var i0 = terzIndex(lo), i1 = terzIndex(hi);
    if (i0 < 0) i0 = 0;
    if (i1 >= TERZ_HZ.length) i1 = TERZ_HZ.length - 1;
    var fLast = 0;
    for (var k = 0; k < list.length; k++) if (list[k].f > fLast) fLast = list[k].f;
    var out = [];
    for (var i = i0; i <= i1; i++) {
      if (fLast > 0 && TERZ_HZ[i] * Math.pow(2, 1 / 6) > fLast * 1.000001) break;
      out.push({ f: TERZ_HZ[i], count: 0 });
    }
    for (k = 0; k < list.length; k++) {
      var idx = terzIndex(list[k].f) - i0;
      if (idx >= 0 && idx < out.length) out[idx].count++;
    }
    return out;
  }
  // Bonello 准则：计数单调不减；且空带（count=0）连续不出现
  function bonello(list, fLow, fHigh) {
    if (!list || !list.length) return { ok: false, error: '请先生成简正频率表' };
    var bands = terzCounts(list, fLow, fHigh);
    var mono = true, firstDown = null;
    for (var i = 1; i < bands.length; i++) {
      if (bands[i].count < bands[i - 1].count) { mono = false; if (firstDown == null) firstDown = bands[i]; }
    }
    var run = 0, maxRun = 0, zeroCount = 0;
    for (i = 0; i < bands.length; i++) {
      if (bands[i].count === 0) { run++; zeroCount++; if (run > maxRun) maxRun = run; }
      else run = 0;
    }
    return {
      ok: true,
      bands: bands,
      monotone: mono,
      firstDown: firstDown,
      emptyBands: zeroCount,
      maxEmptyRun: maxRun,
      // 工程判断：单调不减 + 空带不超过 1 个连续
      pass: mono && maxRun <= 1,
      hint: mono
        ? (maxRun <= 1 ? '模态分布基本均匀，符合 Bonello 准则' : '存在连续无模态的频带，低频易出现染色')
        : '模态计数在 ' + (firstDown ? firstDown.f.toFixed(0) + ' Hz' : '') + ' 出现下降，建议调整房间比例'
    };
  }

  /* ------------------------------------------------------------------ 4) 房间常数 / 临界距离 */
  function meanAlphaByArea(rows) {
    if (!rows || !rows.length) return null;
    var S = 0, A = 0;
    for (var i = 0; i < rows.length; i++) {
      var s = num(rows[i].area), a = num(rows[i].alpha);
      if (s == null || s <= 0 || a == null || a < 0 || a >= 1) continue;
      S += s; A += s * a;
    }
    if (S <= 0) return null;
    return { area: S, absorption: A, meanAlpha: A / S };
  }
  function roomConstant(S, alphaBar) {
    var s = num(S), a = num(alphaBar);
    if (s == null || a == null || s <= 0 || a < 0 || a >= 1) return null;
    return s * a / (1 - a);
  }
  // 临界距离 r_c = 0.141·√(Q·R)（m），Q 为声源指向性因子
  function criticalDistance(Q, R) {
    var q = num(Q), rv = num(R);
    if (q == null || rv == null || q <= 0 || rv <= 0) return null;
    return 0.141 * Math.sqrt(q * rv);
  }

  /* ------------------------------------------------------------------ 5) 稳态声压级 */
  // 直达 / 混响能量密度比（dB）：10·lg[ Q/(4πr²) ÷ (4/R) ]
  function directReverbRatio(Q, r, R) {
    var q = num(Q), rr = num(r), rv = num(R);
    if (q == null || rr == null || rv == null || q <= 0 || rr <= 0 || rv <= 0) return null;
    var direct = q / (4 * Math.PI * rr * rr);
    var rev = 4 / rv;
    return 10 * lg(direct / rev);
  }
  // 单声源稳态声压级：Lp = Lw + 10lg[Q/(4πr²) + 4/R]
  function steadyStateLp(o) {
    o = o || {};
    var Lw = num(o.Lw), Q = num(o.Q), r = num(o.r), R = num(o.R);
    if (Lw == null || Q == null || r == null || R == null || Q <= 0 || r <= 0 || R <= 0) return null;
    var direct = Q / (4 * Math.PI * r * r);
    var rev = 4 / R;
    return {
      lp: Lw + 10 * lg(direct + rev),
      direct: Lw + 10 * lg(direct),
      reverb: Lw + 10 * lg(rev),
      dOverR: 10 * lg(direct / rev),
      rc: criticalDistance(Q, R)
    };
  }
  // 多声源能量叠加：sources = [{Lw, Q, r, label}]
  function multiSourceLp(sources, R) {
    if (!sources || !sources.length) return null;
    var Rv = num(R), total = 0, parts = [];
    for (var i = 0; i < sources.length; i++) {
      var s = steadyStateLp({ Lw: sources[i].Lw, Q: sources[i].Q, r: sources[i].r, R: Rv });
      if (!s) continue;
      parts.push({ label: sources[i].label || ('声源 ' + (i + 1)), lp: s.lp, dOverR: s.dOverR });
      total += Math.pow(10, s.lp / 10);
    }
    if (!parts.length) return null;
    return { lp: 10 * lg(total), parts: parts, n: parts.length, R: Rv };
  }
  // 由房间常数反算室内平均吸声系数（已知总表面积）
  function alphaFromRoomConstant(S, R) {
    var s = num(S), rv = num(R);
    if (s == null || rv == null || s <= 0 || rv < 0) return null;
    return rv / (s + rv);
  }

  /* ------------------------------------------------------------------ 6) 空气吸收 */
  // ISO 9613-1 空气吸收衰减系数 α（dB/m）
  function airAbsorption(f, tC, hr, pKPa) {
    var ff = num(f), t = num(tC), h = num(hr), p = num(pKPa);
    if (ff == null || ff <= 0) return null;
    if (t == null) t = 20;
    if (h == null) h = 50;
    if (p == null) p = PR;
    if (p <= 0 || h < 0 || h > 100) return null;
    var T = t + 273.15;
    var fRo = p / PR * 293.15 / T;
    // 饱和蒸汽压（kPa）
    var psat = PR * Math.pow(10, -6.8346 * Math.pow(273.16 / T, 1.261) + 4.6151);
    var H = h * (psat / PR) * (p / PR);
    var frO = fRo * (24 + 4.04e4 * H * (0.02 + H) / (0.391 + H));
    var frN = fRo * Math.pow(T / T0, -0.5) *
      (9 + 280 * H * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));
    var alpha = 8.686 * ff * ff * (
      1.84e-11 * (PR / p) * Math.sqrt(T / T0) +
      Math.pow(T / T0, -2.5) * (
        0.01275 * Math.exp(-2239.1 / T) / (frO + ff * ff / frO) +
        0.1068 * Math.exp(-3352 / T) / (frN + ff * ff / frN)
      )
    );
    return { alpha: alpha, m: alpha / 8.686, frO: frO, frN: frN, H: H, T: T };
  }
  var OCT_HZ = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  function octaveAirAbsorption(tC, hr, pKPa) {
    var out = [];
    for (var i = 0; i < OCT_HZ.length; i++) {
      var r = airAbsorption(OCT_HZ[i], tC, hr, pKPa);
      out.push({ f: OCT_HZ[i], alpha: r ? r.alpha : null });
    }
    return out;
  }
  // 声速 + 波长 + 空气吸收 一览
  function medium(tC, hr, pKPa) {
    var c = soundSpeed(tC == null ? 20 : tC);
    return {
      c: c,
      rho: RHO0 * 273.15 / ((tC == null ? 20 : tC) + 273.15) * (PR / (num(pKPa) || PR)),
      bands: octaveAirAbsorption(tC, hr, pKPa),
      wavelength100: wavelength(100, c),
      wavelength1000: wavelength(1000, c),
      wavelength4000: wavelength(4000, c)
    };
  }

  var API = {
    C0: C0, RHO0: RHO0, PR: PR, OCT_HZ: OCT_HZ, TERZ_HZ: TERZ_HZ,
    soundSpeed: soundSpeed,
    wavelength: wavelength,
    modes: modes,
    modeDensity: modeDensity,
    schroederFreq: schroederFreq,
    terzCounts: terzCounts,
    terzIndex: terzIndex,
    bonello: bonello,
    meanAlphaByArea: meanAlphaByArea,
    roomConstant: roomConstant,
    criticalDistance: criticalDistance,
    alphaFromRoomConstant: alphaFromRoomConstant,
    directReverbRatio: directReverbRatio,
    steadyStateLp: steadyStateLp,
    multiSourceLp: multiSourceLp,
    airAbsorption: airAbsorption,
    octaveAirAbsorption: octaveAirAbsorption,
    medium: medium
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.SmallRoom = API;
})(typeof window !== 'undefined' ? window : this);
