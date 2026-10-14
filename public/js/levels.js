/*
 * levels.js — 声压级叠加计算内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Levels，Node 下 module.exports。
 *
 * 涵盖内容：
 *   1) 能量叠加：L = 10·lg Σ10^(Li/10)（不相干声源，声压平方相加）
 *   2) 增量法：两声级差 → 增加值，常见「两两叠加」速算与参考表
 *   3) 相干叠加：L = 10·lg[10^(L1/10)+10^(L2/10)+2·10^((L1+L2)/20)·cos φ]
 *      （同频同相两等声级叠加为 +6 dB，正交即退化为能量叠加，反相可抵消）
 *   4) 背景噪声修正：L源 = 10·lg(10^(L总/10) − 10^(L背景/10))，含标准取整修正表
 *   5) 多声源（可带数量）：总级、平均级、各声源能量占比与「撤除后总级下降量」
 *   6) 达标反算：要让总级降到目标值，各声源分别需降低多少 dB
 *   7) 频带谱叠加：两条倍频程式频谱逐带能量叠加
 *   8) 换算：声压级 ↔ 声压；距离衰减（点声源 6 dB/倍距、线声源 3 dB/倍距）；
 *      声功率级 ↔ 声压级（点声源，自由场/半自由场）
 *
 * 单位约定：声压级、声功率级均为 dB（未计权），声压为 Pa（参考声压 2×10⁻⁵ Pa），
 *           距离为 m，角度为（°）。
 */
(function (global) {
  'use strict';

  var P_REF = 2e-5;                       // 参考声压 20 µPa
  var OCT_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var MAX_REDUCTION = 60;                 // 工程上单一声源可实现的降噪量上限（dB）

  // 两两叠加增量参考表（差值 → 增加值，dB）
  var INCREMENT_TABLE = [
    { diff: 0, increment: 3.01 },
    { diff: 1, increment: 2.54 },
    { diff: 2, increment: 2.12 },
    { diff: 3, increment: 1.76 },
    { diff: 4, increment: 1.46 },
    { diff: 5, increment: 1.19 },
    { diff: 6, increment: 0.97 },
    { diff: 7, increment: 0.79 },
    { diff: 8, increment: 0.64 },
    { diff: 9, increment: 0.51 },
    { diff: 10, increment: 0.41 },
    { diff: 15, increment: 0.14 },
    { diff: 20, increment: 0.04 }
  ];

  // 背景噪声修正参考表（实测总级 − 背景级 → 应从总级中扣减的量，dB）
  var BACKGROUND_TABLE = [
    { diff: 3, correction: 3 },
    { diff: 4, correction: 2 },
    { diff: 5, correction: 2 },
    { diff: 6, correction: 1 },
    { diff: 9, correction: 1 },
    { diff: 10, correction: 0 }
  ];

  function lin(l) { return Math.pow(10, l / 10); }
  function toDb(x) { return 10 * Math.log10(x); }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var x = parseFloat(v);
    return isFinite(x) ? x : null;
  }
  function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }

  // -------------------------------------------------------------------------
  // 1) 能量叠加与平均
  // -------------------------------------------------------------------------
  function energySum(levels) {
    var s = 0, n = 0;
    (levels || []).forEach(function (l) {
      var x = num(l);
      if (x == null) return;
      s += lin(x);
      n++;
    });
    if (!n) return { ok: false, error: '请至少输入一个声压级' };
    return { ok: true, count: n, energy: s, total: toDb(s) };
  }

  // 能量平均（等同于噪声评价中的「平均声压级」）
  function energyAverage(levels) {
    var r = energySum(levels);
    if (!r.ok) return r;
    return { ok: true, count: r.count, energy: r.energy / r.count, value: toDb(r.energy / r.count) };
  }

  // -------------------------------------------------------------------------
  // 2) 两两叠加（增量法）
  // -------------------------------------------------------------------------
  function increment(diff) {
    var d = Math.abs(num(diff));
    return toDb(1 + Math.pow(10, -d / 10));
  }

  function pair(l1, l2) {
    var a = num(l1), b = num(l2);
    if (a == null || b == null) return { ok: false, error: '请输入两个声压级' };
    var diff = Math.abs(a - b);
    var max = Math.max(a, b);
    var inc = increment(diff);
    var total = toDb(lin(a) + lin(b));
    var verdict = diff < 1 ? '两台设备等强，叠加增加约 3 dB'
      : (diff < 3 ? '强度接近，叠加增加约 2–3 dB'
        : (diff < 6 ? '有一定差距，叠加增加约 1–2 dB'
          : (diff < 10 ? '差距较大，叠加增加不足 1 dB'
            : '弱声源对总级几乎无贡献，可忽略')));
    return {
      ok: true, max: max, diff: diff, increment: inc, total: total, verdict: verdict,
      // 由低噪声源带来的增加量若按错误方式（直接相加）会偏大，此处便于界面提示
      naiveSum: a + b
    };
  }

  // 差值 0–maxDiff 的增量曲线（用于作图）
  function incrementCurve(maxDiff, step) {
    var m = num(maxDiff) == null ? 20 : num(maxDiff);
    var s = num(step) == null ? 0.5 : num(step);
    var out = [];
    for (var d = 0; d <= m + 1e-9; d += s) {
      var diff = Math.round(d * 100) / 100;
      out.push({ diff: diff, increment: increment(diff) });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // 3) 相干叠加（同频、给定相位差）
  // -------------------------------------------------------------------------
  function coherent(l1, l2, phaseDeg) {
    var a = num(l1), b = num(l2);
    if (a == null || b == null) return { ok: false, error: '请输入两个声压级' };
    var phase = num(phaseDeg) == null ? 0 : num(phaseDeg);
    var energySumDb = toDb(lin(a) + lin(b));
    var cross = 2 * Math.sqrt(lin(a) * lin(b)) * Math.cos(phase * Math.PI / 180);
    var e = lin(a) + lin(b) + cross;
    if (e <= 1e-12) {
      return {
        ok: true, phase: phase, canceled: true, value: null,
        energySum: energySumDb, crossTerm: cross,
        note: '相位差接近 180° 且两声级相等，理论上完全抵消（实际受频率、距离与房间反射限制很难完全抵消）'
      };
    }
    var value = toDb(e);
    return {
      ok: true, phase: phase, canceled: false, value: value,
      energySum: energySumDb, crossTerm: cross,
      vsEnergy: value - energySumDb,
      note: phase % 180 === 0
        ? (phase % 360 === 0 ? '同相叠加：等声级时为 +6 dB，高于能量叠加的 +3 dB'
          : '反相叠加：两声级越接近，抵消越明显')
        : '相位差介于同相与反相之间，合成级在「能量叠加」与「完全相消」之间'
    };
  }

  // -------------------------------------------------------------------------
  // 4) 背景噪声修正（声级相减）
  // -------------------------------------------------------------------------
  function subtract(total, background) {
    var t = num(total), b = num(background);
    if (t == null || b == null) return { ok: false, error: '请输入实测总声级与背景声级' };
    if (b > t) return { ok: false, error: '背景声级高于实测总声级，请检查输入（背景不可能高于实测总级）' };
    if (t - b < 1e-9) return { ok: false, error: '实测总声级与背景声级相同，无法分离出被测声源' };
    var diff = t - b;
    var value = toDb(lin(t) - lin(b));
    var correction = t - value;
    var standard = diff < 3 ? null
      : (diff < 4 ? 3 : (diff < 6 ? 2 : (diff < 10 ? 1 : 0)));
    var verdict, note;
    if (diff < 3) {
      verdict = 'unusable';
      note = '差值 < 3 dB，背景噪声已与被测声源相当，修正结果的偏差很大（通常要求 ≥ 3 dB，最好 ≥ 10 dB），建议降低背景或改用其他方法。';
    } else if (diff < 10) {
      verdict = 'corrected';
      note = '差值在 3–10 dB 之间，必须做背景修正；修正量越大，结果不确定度越大。';
    } else {
      verdict = 'negligible';
      note = '差值 ≥ 10 dB，背景噪声影响可忽略（修正量 ≤ 0.5 dB），可视为实测值即被测声源级。';
    }
    return {
      ok: true, diff: diff, value: value, correction: correction,
      standardCorrection: standard,
      rounded: standard == null ? null : t - standard,
      verdict: verdict, note: note
    };
  }

  // -------------------------------------------------------------------------
  // 5) 多声源叠加（可带数量）
  // -------------------------------------------------------------------------
  function sources(list) {
    var rows = [];
    (list || []).forEach(function (it) {
      var l = num(it && it.level);
      if (l == null) return;
      var c = num(it && it.count);
      c = c == null ? 1 : Math.max(1, Math.round(c));
      rows.push({ name: (it && it.name) || '', level: l, count: c, energy: lin(l) * c });
    });
    if (!rows.length) return { ok: false, error: '请至少输入一个声源声级' };

    var totalEnergy = rows.reduce(function (a, r) { return a + r.energy; }, 0);
    var total = toDb(totalEnergy);
    var totalCount = rows.reduce(function (a, r) { return a + r.count; }, 0);
    var maxEnergy = rows.reduce(function (a, r) { return Math.max(a, r.energy); }, 0);

    var out = rows.map(function (r) {
      var rest = totalEnergy - r.energy;
      return {
        name: r.name, level: r.level, count: r.count, energy: r.energy,
        partial: toDb(r.energy),                       // 该声源（含数量）单独作用时的声级
        share: r.energy / totalEnergy,                 // 能量占比
        removalDrop: rest > 0 ? total - toDb(rest) : null // 撤除该声源后总级的下降量
      };
    });

    var maxPartial = toDb(maxEnergy);
    var dominant = out.reduce(function (a, r) { return (!a || r.energy > a.energy) ? r : a; }, null);

    return {
      ok: true,
      rows: out,
      total: total,
      count: out.length,
      totalCount: totalCount,
      average: toDb(totalEnergy / totalCount),         // 按数量计的能量平均值
      maxPartial: maxPartial,
      incrementOverMax: total - maxPartial,            // 叠加后比最强单源高出的量
      incrementOverTotal: rows.length > 1 ? total - toDb(maxEnergy) : null,
      dominant: dominant
    };
  }

  // 6) 让总级降到目标值，各声源分别需降低多少 dB
  function requiredReduction(list, target) {
    var base = sources(list);
    if (!base.ok) return base;
    var tg = num(target);
    if (tg == null) return { ok: false, error: '请输入目标声级' };
    if (base.total <= tg) {
      return { ok: true, already: true, total: base.total, target: tg, needed: 0, rows: [], minimal: 0 };
    }
    var targetLin = lin(tg);
    var rows = base.rows.map(function (r) {
      var others = base.rows.reduce(function (a, x) { return x === r ? a : a + x.energy; }, 0);
      if (others >= targetLin) {
        return {
          name: r.name, level: r.level, count: r.count, others: toDb(others),
          need: null, feasible: false,
          reason: '其余声源合计（' + toDb(others).toFixed(1) + ' dB）已不低于目标值，仅降此声源无法达标'
        };
      }
      var need = Math.max(0, toDb(r.energy / (targetLin - others)));
      var feasible = need > 0 && need <= MAX_REDUCTION;
      return {
        name: r.name, level: r.level, count: r.count, others: toDb(others),
        need: need, feasible: feasible,
        resultLevel: feasible ? r.level - need : null,
        reason: feasible ? null : '所需降噪量超过 ' + MAX_REDUCTION +
          ' dB，实际不可实现，说明总级主要受其他声源限制'
      };
    });
    var feasible = rows.filter(function (r) { return r.feasible; });
    var minimal = feasible.length ? feasible.reduce(function (a, r) { return Math.min(a, r.need); }, Infinity) : null;
    return {
      ok: true, already: false, total: base.total, target: tg,
      needed: base.total - tg, rows: rows, minimal: minimal,
      feasible: feasible.length > 0
    };
  }

  // -------------------------------------------------------------------------
  // 7) 频带谱叠加
  // -------------------------------------------------------------------------
  function sumSpectra(a, b, bands) {
    var bs = bands && bands.length ? bands.slice() : OCT_BANDS.slice();
    var A = a || [], B = b || [];
    var rows = [], any = false;
    for (var i = 0; i < bs.length; i++) {
      var x = num(A[i]), y = num(B[i]);
      var sum = null, missing = null;
      if (x != null && y != null) { sum = toDb(lin(x) + lin(y)); }
      else if (x != null) { sum = x; missing = 'B'; }
      else if (y != null) { sum = y; missing = 'A'; }
      if (sum != null) any = true;
      rows.push({ f: bs[i], a: x, b: y, sum: sum, missing: missing });
    }
    if (!any) return { ok: false, error: '请至少填入一条频谱的数值' };
    return {
      ok: true, rows: rows, bands: bs,
      totalA: energySum(A).ok ? energySum(A).total : null,
      totalB: energySum(B).ok ? energySum(B).total : null,
      total: energySum(rows.map(function (r) { return r.sum; })).total,
      increment: (energySum(A).ok && energySum(B).ok)
        ? energySum(rows.map(function (r) { return r.sum; })).total - Math.max(energySum(A).total, energySum(B).total)
        : null
    };
  }

  // -------------------------------------------------------------------------
  // 8) 换算：声压、距离衰减、声功率级
  // -------------------------------------------------------------------------
  function levelToPressure(level) {
    var l = num(level);
    if (l == null) return { ok: false, error: '请输入声压级' };
    var pa = P_REF * Math.pow(10, l / 20);
    return { ok: true, pa: pa, mpa: pa * 1000, upa: pa * 1e6, ratio: Math.pow(10, l / 20) };
  }

  function pressureToLevel(p) {
    var x = num(p);
    if (x == null) return { ok: false, error: '请输入声压（Pa）' };
    if (x <= 0) return { ok: false, error: '声压必须大于 0' };
    return { ok: true, value: 20 * Math.log10(x / P_REF), ratio: x / P_REF };
  }

  // 距离衰减：点声源 20lg(r2/r1)，线声源（无限长）10lg(r2/r1)
  function distanceAttenuation(o) {
    o = o || {};
    var r1 = num(o.r1), r2 = num(o.r2);
    var type = o.type === 'line' ? 'line' : 'point';
    if (r1 == null || r2 == null) return { ok: false, error: '请输入两个距离' };
    if (r1 <= 0 || r2 <= 0) return { ok: false, error: '距离必须大于 0' };
    var k = type === 'line' ? 10 : 20;
    var delta = k * Math.log10(r2 / r1);
    return {
      ok: true, type: type, r1: r1, r2: r2, delta: delta,
      perDouble: k * Math.log10(2),           // 距离加倍时的衰减量
      ratio: r2 / r1,
      note: type === 'line'
        ? '线声源（无限长，如车流、长管道）：距离加倍衰减 3 dB'
        : '点声源（自由场）：距离加倍衰减 6 dB'
    };
  }

  // 点声源声功率级与声压级的换算：Lp = Lw + 10·lg(Q/4π) − 20·lg r
  //   Q = 1 自由场 → −11 dB；Q = 2 半自由场（地面上的设备）→ −8 dB；Q = 4 墙角 → −5 dB
  function directivityFactor(q) {
    var Q = num(q);
    if (Q == null) Q = 1;
    if (Q <= 0) Q = 1;
    return 10 * Math.log10(Q / (4 * Math.PI));
  }

  function powerToSpl(o) {
    o = o || {};
    var lw = num(o.lw), r = num(o.r);
    if (lw == null || r == null) return { ok: false, error: '请输入声功率级与距离' };
    if (r <= 0) return { ok: false, error: '距离必须大于 0' };
    var Q = num(o.q) == null ? 2 : num(o.q);
    var factor = directivityFactor(Q);
    var lp = lw + factor - 20 * Math.log10(r);
    return {
      ok: true, lw: lw, r: r, q: Q, lp: lp, factor: factor,
      note: '点声源扩散场：Lp = Lw + 10·lg(Q/4πr²)，Q = ' + Q +
        (Q === 1 ? '（自由场，四周无反射）' : (Q === 2 ? '（半自由场，如地面上的设备）' : (Q === 4 ? '（1/4 空间，如墙角）' : '')))
    };
  }

  function splToPower(o) {
    o = o || {};
    var lp = num(o.lp), r = num(o.r);
    if (lp == null || r == null) return { ok: false, error: '请输入声压级与距离' };
    if (r <= 0) return { ok: false, error: '距离必须大于 0' };
    var Q = num(o.q) == null ? 2 : num(o.q);
    var factor = directivityFactor(Q);
    return { ok: true, lp: lp, r: r, q: Q, lw: lp - factor + 20 * Math.log10(r), factor: factor };
  }

  var API = {
    P_REF: P_REF,
    OCT_BANDS: OCT_BANDS,
    INCREMENT_TABLE: INCREMENT_TABLE,
    BACKGROUND_TABLE: BACKGROUND_TABLE,
    energySum: energySum,
    energyAverage: energyAverage,
    increment: increment,
    incrementCurve: incrementCurve,
    pair: pair,
    coherent: coherent,
    subtract: subtract,
    sources: sources,
    requiredReduction: requiredReduction,
    sumSpectra: sumSpectra,
    levelToPressure: levelToPressure,
    pressureToLevel: pressureToLevel,
    distanceAttenuation: distanceAttenuation,
    directivityFactor: directivityFactor,
    powerToSpl: powerToSpl,
    splToPower: splToPower,
    round1: round1
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Levels = API;
  }
})(typeof window !== 'undefined' ? window : this);
