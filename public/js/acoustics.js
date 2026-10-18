/*
 * acoustics.js — 声学计算器计算内核
 * 纯函数，无依赖。UMD 包装：浏览器挂到 window.Acoustics，Node 下 module.exports。
 *
 * 指标：
 *   - A 计权声级 (A-weighted sound level)     IEC 61672 解析式
 *   - NC 噪声标准曲线 (Noise Criterion)        ANSI/ASA S12.2-2019 切线法 + 低频一致性检查
 *   - NR 噪声评价曲线 (Noise Rating)           ISO/R 1996
 *   - RC 房间标准曲线 Mark II (Room Criterion) ANSI/ASA S12.2-2019 Annex D，含 QAI 与 RV
 *
 * 支持 1/1 倍频程（16–8000 Hz，10 带）与 1/3 倍频程（16–10000 Hz，29 带）两种输入；
 * 1/3 倍频程数据先按频带归属合成为倍频程，再参与 NC/NR/RC 评价（S12.2 各评价量均为倍频程量）。
 */
(function (global) {
  'use strict';

  // 1/1 倍频带中心频率 (Hz)，含 16 Hz 低频带
  var BANDS = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];

  // 1/3 倍频带中心频率 (Hz)，16 Hz – 10 kHz 共 29 带
  var THIRD_BANDS = [
    16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400,
    500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000
  ];

  // IEC 61672 A 计权解析式系数
  var AF1 = 20.598997, AF2 = 107.65265, AF3 = 737.86223, AF4 = 12194.217;

  // IEC 61672 A 计权修正值 (dB)，倍频带（仅作文档对照，计算统一走解析式）
  var A_WEIGHTING = {
    16: -56.7, 31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6,
    500: -3.2, 1000: 0.0, 2000: 1.2, 4000: 1.0, 8000: -1.1
  };

  // 任意频率的 A 计权修正 (dB)，IEC 61672 解析式（相对 1 kHz = 0）
  function aWeightAt(f) {
    var f2 = f * f;
    var num = AF4 * AF4 * f2 * f2;
    var den = (f2 + AF1 * AF1) *
              Math.sqrt((f2 + AF2 * AF2) * (f2 + AF3 * AF3)) *
              (f2 + AF4 * AF4);
    return 20 * Math.log10(num / den) + 2.0;
  }

  // 标准 8 倍频带（31.5–8000 Hz），NC 与 NR 评价共用
  var STD_8BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];

  // ---- NC 曲线表（切线法用），列对应 31.5–8000 Hz 共 9 个倍频带 ----
  // 63–8000 Hz 沿用经典 Beranek/ASHRAE NC 值（与 S12.2-2019 表相比多数一致，个别如 NC-30@1kHz 差 1 dB）；
  // 31.5 Hz 列取自 ANSI/ASA S12.2-2019 的低频扩展列，锚点已核对：NC-25=65、NC-30=68、NC-35=71、NC-40=74，
  // 其余按 +3 dB / 5 NC 线性延伸。
  var NC_BANDS = STD_8BANDS.slice();
  var NC_TABLE = [
    { n: 15, vals: [59, 47, 36, 29, 22, 17, 14, 12, 11] },
    { n: 20, vals: [62, 51, 40, 33, 26, 22, 19, 17, 16] },
    { n: 25, vals: [65, 54, 44, 37, 31, 27, 24, 22, 21] },
    { n: 30, vals: [68, 57, 48, 41, 35, 31, 29, 28, 27] },
    { n: 35, vals: [71, 60, 52, 45, 40, 36, 34, 33, 32] },
    { n: 40, vals: [74, 64, 56, 50, 45, 41, 39, 38, 37] },
    { n: 45, vals: [77, 67, 60, 54, 49, 46, 44, 43, 42] },
    { n: 50, vals: [80, 71, 64, 58, 54, 51, 49, 48, 47] },
    { n: 55, vals: [83, 75, 68, 62, 58, 56, 54, 53, 52] },
    { n: 60, vals: [86, 79, 74, 69, 65, 64, 62, 61, 60] },
    { n: 65, vals: [89, 81, 77, 72, 69, 68, 66, 65, 64] },
    { n: 70, vals: [92, 83, 79, 75, 72, 71, 70, 69, 68] }
  ];

  // NC 曲线 16 Hz 列（S12.2-2019 曲线族最低带）
  // 已核对锚点：NC-25=80、NC-30=81、NC-35=82、NC-40=84；其余为线性延伸（推算值，仅供参考）。
  var NC_TABLE_16 = [
    { n: 15, v: 78 }, { n: 20, v: 79 }, { n: 25, v: 80 }, { n: 30, v: 81 },
    { n: 35, v: 82 }, { n: 40, v: 84 }, { n: 45, v: 86 }, { n: 50, v: 88 },
    { n: 55, v: 90 }, { n: 60, v: 92 }, { n: 65, v: 94 }, { n: 70, v: 96 }
  ];

  // ---- NR 曲线表：31.5–8000 Hz 9 个倍频带，NR 0..130（步长 10）----
  // 63 Hz 列对应 ISO 经典 62.5 Hz 列（差值可忽略）。来源：ISO/R 1996 / BS EN。
  var NR_BANDS = STD_8BANDS.slice();
  var NR_TABLE = [
    { n: 0,   vals: [55, 36, 22, 12, 5, 0, -4, -6, -8] },
    { n: 10,  vals: [62, 43, 31, 21, 15, 10, 7, 4, 2] },
    { n: 20,  vals: [69, 51, 39, 31, 24, 20, 17, 14, 13] },
    { n: 30,  vals: [76, 59, 48, 40, 34, 30, 27, 25, 23] },
    { n: 40,  vals: [83, 67, 57, 49, 44, 40, 37, 35, 33] },
    { n: 50,  vals: [89, 75, 66, 59, 54, 50, 47, 45, 44] },
    { n: 60,  vals: [96, 83, 74, 68, 63, 60, 57, 55, 54] },
    { n: 70,  vals: [103, 91, 83, 77, 73, 70, 68, 66, 64] },
    { n: 80,  vals: [110, 99, 92, 86, 83, 80, 78, 76, 74] },
    { n: 90,  vals: [117, 107, 100, 96, 93, 90, 88, 86, 85] },
    { n: 100, vals: [124, 115, 109, 105, 102, 100, 98, 96, 95] },
    { n: 110, vals: [130, 122, 118, 114, 112, 110, 108, 107, 105] },
    { n: 120, vals: [137, 130, 126, 124, 122, 120, 118, 117, 116] },
    { n: 130, vals: [144, 138, 135, 133, 131, 130, 128, 127, 126] }
  ];

  function toArray(levels) {
    if (Array.isArray(levels)) return levels.slice();
    return BANDS.map(function (f) { return levels[f]; });
  }

  // 单频带插值求曲线指数 n（曲线值随 n 单调上升）
  function bandRating(table, bandIndex, L) {
    var pts = table.map(function (t) { return { n: t.n, v: t.vals[bandIndex] }; })
                   .sort(function (a, b) { return a.n - b.n; });
    if (L <= pts[0].v) {
      var p0 = pts[0], p1 = pts[1];
      var slope = (p1.n - p0.n) / (p1.v - p0.v);
      return p0.n + (L - p0.v) * slope;
    }
    var last = pts.length - 1;
    if (L >= pts[last].v) {
      var q0 = pts[last - 1], q1 = pts[last];
      var slope2 = (q1.n - q0.n) / (q1.v - q0.v);
      return q0.n + (L - q0.v) * slope2;
    }
    for (var j = 0; j < pts.length - 1; j++) {
      var a = pts[j], b = pts[j + 1];
      var lo = Math.min(a.v, b.v), hi = Math.max(a.v, b.v);
      if (L >= lo && L <= hi) {
        var s = (b.n - a.n) / (b.v - a.v);
        return a.n + (L - a.v) * s;
      }
    }
    return pts[last].n;
  }

  // 给定曲线指数 n，求某频带的曲线值（bandRating 的逆运算）
  function curveValue(table, bandIndex, n) {
    var pts = table.map(function (t) { return { n: t.n, v: t.vals[bandIndex] }; })
                   .sort(function (a, b) { return a.n - b.n; });
    if (n <= pts[0].n) {
      return pts[0].v + (n - pts[0].n) * (pts[1].v - pts[0].v) / (pts[1].n - pts[0].n);
    }
    var last = pts.length - 1;
    if (n >= pts[last].n) {
      return pts[last - 1].v +
        (n - pts[last - 1].n) * (pts[last].v - pts[last - 1].v) / (pts[last].n - pts[last - 1].n);
    }
    for (var j = 0; j < pts.length - 1; j++) {
      var a = pts[j], b = pts[j + 1];
      if (n >= a.n && n <= b.n) {
        return a.v + (n - a.n) * (b.v - a.v) / (b.n - a.n);
      }
    }
    return null;
  }

  // ---- 1/3 倍频程 → 1/1 倍频程合成（能量求和）----
  // 每个倍频带取其上下限（f/√2 ~ f·√2）内的 1/3 倍频带求和，通常为 3 条（16 Hz 带为 16/20 两条）。
  function thirdToOctave(thirdLevels) {
    var missing = 0;
    var octave = BANDS.map(function (fo) {
      var lo = fo / Math.SQRT2;
      var hi = fo * Math.SQRT2;
      var sum = 0, n = 0;
      THIRD_BANDS.forEach(function (f3, i) {
        if (f3 < lo || f3 > hi) return;
        var v = thirdLevels[i];
        if (v == null || isNaN(v)) return;
        sum += Math.pow(10, v / 10);
        n++;
      });
      if (!n) { missing++; return null; }
      return 10 * Math.log10(sum);
    });
    return { octave: octave, missingBands: missing };
  }

  // ---- A 计权声级 ----
  // levels 与 bands 一一对应；bands 缺省为倍频带
  function aWeighted(levels, bands) {
    var arr = Array.isArray(levels) ? levels.slice() : toArray(levels);
    var bs = bands || BANDS;
    var sum = 0, linSum = 0;
    var contributions = bs.map(function (f, i) {
      var L = arr[i];
      var la = (L == null || isNaN(L)) ? null : L + aWeightAt(f);
      if (la != null) sum += Math.pow(10, la / 10);
      if (L != null && !isNaN(L)) linSum += Math.pow(10, L / 10);
      return la;
    });
    var LA = (sum > 0) ? 10 * Math.log10(sum) : null;
    var Llin = (linSum > 0) ? 10 * Math.log10(linSum) : null;
    var silBands = [500, 1000, 2000, 4000];
    var silSum = 0, silN = 0;
    silBands.forEach(function (f) {
      var i = bs.indexOf(f);
      if (i < 0) return;
      var v = arr[i];
      if (v == null || isNaN(v)) return;
      silSum += v; silN++;
    });
    var sil = silN ? silSum / silN : null;
    return { LA: LA, Llin: Llin, contributions: contributions, sil: sil };
  }

  // ---- NC 评价（切线插值法，31.5–8000 Hz 9 带）----
  function ncRating(levels) {
    var arr = toArray(levels);
    var maxN = -Infinity, controlling = null;
    NC_BANDS.forEach(function (f, bi) {
      var i = BANDS.indexOf(f);
      var L = arr[i];
      if (L == null || isNaN(L)) return;
      var n = bandRating(NC_TABLE, bi, L);
      if (n > maxN) { maxN = n; controlling = f; }
    });
    if (maxN === -Infinity) return { value: null, designation: null, controllingBand: null };
    return {
      value: maxN,
      designation: Math.round(maxN / 5) * 5,
      controllingBand: controlling
    };
  }

  // ---- NC 低频一致性检查（ANSI/ASA S12.2 频谱不平衡法）----
  // 以 NC(SIL) 曲线为基准，比较 31.5/63/125/250 Hz 实测值：
  // 超出 6–9 dB → 可能引起严重不满；> 9 dB → 很可能引起严重不满。
  function ncLowFrequencyCheck(levels, sil, ncValue) {
    var arr = toArray(levels);
    var base = (sil != null && !isNaN(sil)) ? sil : ncValue;
    if (base == null || isNaN(base)) return { base: null, curveIndex: null, devs: [], worst: null, verdict: 'na' };
    var curveIndex = Math.round(base / 5) * 5;
    var devs = [];
    var worst = null;
    [31.5, 63, 125, 250].forEach(function (f) {
      var i = BANDS.indexOf(f);
      var L = arr[i];
      if (L == null || isNaN(L)) return;
      var ref = curveValue(NC_TABLE, NC_BANDS.indexOf(f), curveIndex);
      var d = L - ref;
      devs.push({ band: f, ref: ref, dev: d });
      if (worst == null || d > worst) worst = d;
    });
    var verdict = 'ok';
    if (worst != null && worst > 9) verdict = 'likely';
    else if (worst != null && worst >= 6) verdict = 'possible';
    return { base: base, curveIndex: curveIndex, devs: devs, worst: worst, verdict: verdict };
  }

  // 16 Hz 带相对 NC(SIL) 曲线的一致性（16 Hz 曲线列为推算值，仅供参考）
  function ncBand16Check(levels, sil, ncValue) {
    var arr = toArray(levels);
    var L = arr[BANDS.indexOf(16)];
    if (L == null || isNaN(L)) return null;
    var base = (sil != null && !isNaN(sil)) ? sil : ncValue;
    if (base == null || isNaN(base)) return null;
    var curveIndex = Math.round(base / 5) * 5;
    var table16 = NC_TABLE_16.map(function (t) { return { n: t.n, vals: [t.v] }; });
    var ref = curveValue(table16, 0, curveIndex);
    return { band: 16, ref: ref, dev: L - ref };
  }

  // ---- NR 评价（切线插值法）----
  function nrRating(levels) {
    var arr = toArray(levels);
    var maxN = -Infinity, controlling = null;
    NR_BANDS.forEach(function (f, bi) {
      var i = BANDS.indexOf(f);
      var L = arr[i];
      if (L == null || isNaN(L)) return;
      var n = bandRating(NR_TABLE, bi, L);
      if (n > maxN) { maxN = n; controlling = f; }
    });
    if (maxN === -Infinity) return { value: null, designation: null, controllingBand: null };
    return {
      value: maxN,
      designation: Math.round(maxN / 5) * 5,
      controllingBand: controlling
    };
  }

  // ---- 常用房间设计目标（工程参考）----
  // NC 目标范围引自 ASHRAE Handbook — HVAC Applications, Ch.48「Noise Criteria」常用推荐值；
  // RC 为对应的目标等价值（工程近似：这些单值指标在室内背景噪声设计中常取相近数值）。
  // 判定以 NC 为主，RC 供交叉参考。
  var ROOM_TARGETS = [
    { id: 'studio',     name: '录音棚 / 播音室', nc: [15, 20], rc: [15, 20], note: '对语言与音乐录制最严格' },
    { id: 'concert',    name: '音乐厅 / 剧院',   nc: [20, 25], rc: [20, 25], note: '混响前需低背景噪声' },
    { id: 'auditorium', name: '礼堂 / 教堂',     nc: [25, 30], rc: [25, 30], note: '' },
    { id: 'cinema',     name: '影院',            nc: [25, 30], rc: [25, 30], note: '' },
    { id: 'bedroom',    name: '卧室 / 住宅',     nc: [25, 30], rc: [25, 30], note: '夜间宜取低值' },
    { id: 'private',    name: '单人办公室',      nc: [30, 35], rc: [30, 35], note: '' },
    { id: 'meeting',    name: '会议室 / 教室',   nc: [30, 35], rc: [30, 35], note: '语言清晰度关键' },
    { id: 'ward',       name: '病房 / 诊室',     nc: [30, 35], rc: [30, 35], note: '' },
    { id: 'library',    name: '图书馆 / 阅览室', nc: [35, 40], rc: [35, 40], note: '' },
    { id: 'openoffice', name: '开放式办公室',    nc: [40, 45], rc: [40, 45], note: '需配合吸声与掩蔽声' },
    { id: 'restaurant', name: '餐厅 / 食堂',     nc: [40, 45], rc: [40, 45], note: '' },
    { id: 'mall',       name: '商场 / 超市',     nc: [45, 50], rc: [45, 50], note: '' },
    { id: 'gym',        name: '健身房 / 车间',   nc: [50, 60], rc: [50, 60], note: '仅作劳动保护参考' }
  ];

  function judge(value, range) {
    if (value == null || isNaN(value)) return { value: null, target: range, status: 'na', margin: null };
    var hi = range[1];
    var status = value <= hi ? 'pass' : 'fail';
    return { value: value, target: range, status: status, margin: value - hi };
  }

  function evaluateTarget(target, ratings) {
    var nc = judge(ratings.nc, target.nc);
    var rc = judge(ratings.rc, target.rc);
    var primary = (nc.status !== 'na') ? nc : rc;
    var overall = primary.status === 'na' ? 'na' : primary.status;
    return { nc: nc, rc: rc, overall: overall, basedOn: (nc.status !== 'na') ? 'NC' : 'RC' };
  }

  function findTarget(id) {
    for (var i = 0; i < ROOM_TARGETS.length; i++) {
      if (ROOM_TARGETS[i].id === id) return ROOM_TARGETS[i];
    }
    return null;
  }

  // ---- 多测点能量平均（power average）----
  function energyAverage(rows, nBands) {
    var n = nBands || BANDS.length;
    var valid = (rows || []).filter(function (r) { return Array.isArray(r) && r.length; });
    var out = [];
    for (var i = 0; i < n; i++) {
      var sum = 0, cnt = 0;
      valid.forEach(function (r) {
        var v = r[i];
        if (v != null && !isNaN(v)) { sum += Math.pow(10, v / 10); cnt++; }
      });
      out.push(cnt ? 10 * Math.log10(sum / cnt) : null);
    }
    return out;
  }

  // RC 频谱质量标签
  var RC_CLASS_LABEL = {
    N: '中性 Neutral',
    R: '低频隆隆 Rumble',
    H: '高频嘶声 Hiss',
    RH: '隆隆 + 嘶声'
  };

  // ---- RC 房间标准曲线 Mark II（ANSI/ASA S12.2-2019 Annex D）----
  // 参考曲线：1000 Hz 处 = RC，斜率 −5 dB/倍频程；16 / 31.5 Hz 取上限下限 max(RC+25, 55)。
  function rcCurve(C, f) {
    var raw = C + 5 * (Math.log(1000 / f) / Math.LN2);
    if (f <= 31.5) return Math.max(raw, C + 25, 55);
    return raw;
  }

  // RV 振动/颤振风险阈值 (dB)，ANSI/ASA S12.2-2019
  var RV_THRESHOLD = {
    clear: { 16: 75, 31.5: 75, 63: 80 },
    moderate: { 16: 65, 31.5: 65, 63: 70 }
  };

  function rcRating(levels) {
    var arr = toArray(levels);
    var LMF = (arr[BANDS.indexOf(500)] + arr[BANDS.indexOf(1000)] + arr[BANDS.indexOf(2000)]) / 3;
    var C = Math.round(LMF);
    var ref = BANDS.map(function (f) { return rcCurve(C, f); });

    function devAt(f) {
      var i = BANDS.indexOf(f);
      var v = arr[i];
      if (v == null || isNaN(v)) return null;
      return v - ref[i];
    }

    // 频谱分类：≤500 Hz 任一频带超出参考曲线 >5 dB → R；≥1000 Hz（1000/2000/4000）任一 >3 dB → H
    var lowBands = [16, 31.5, 63, 125, 250, 500];
    var highBands = [1000, 2000, 4000];
    var rumble = false, hiss = false;
    var details = [];
    lowBands.forEach(function (f) {
      var d = devAt(f);
      if (d == null) return;
      details.push({ band: f, excess: d, limit: 5 });
      if (d > 5) rumble = true;
    });
    highBands.forEach(function (f) {
      var d = devAt(f);
      if (d == null) return;
      details.push({ band: f, excess: d, limit: 3 });
      if (d > 3) hiss = true;
    });
    var cls = 'N';
    if (rumble && hiss) cls = 'RH';
    else if (rumble) cls = 'R';
    else if (hiss) cls = 'H';

    // QAI：三组频谱偏差 SD_L / SD_M / SD_H，QAI = max − min
    function spectralDeviation(bands) {
      var sum = 0, n = 0;
      bands.forEach(function (f) {
        var d = devAt(f);
        if (d == null) return;
        sum += Math.pow(10, d / 10);
        n++;
      });
      return n ? 10 * Math.log10(sum / n) : null;
    }
    var SDL = spectralDeviation([16, 31.5, 63]);
    var SDM = spectralDeviation([125, 250, 500]);
    var SDH = spectralDeviation([1000, 2000, 4000]);
    var vals = [SDL, SDM, SDH].filter(function (v) { return v != null; });
    var qai = vals.length ? (Math.max.apply(null, vals) - Math.min.apply(null, vals)) : null;
    // QAI 完整：标准公式涉及的 9 个频带（16–4000 Hz）全部有数据
    var qaiComplete = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000].every(function (f) {
      return devAt(f) != null;
    });

    // RV：16 / 31.5 / 63 Hz 超过阈值
    var rvLevel = 'none', rvBands = [];
    [16, 31.5, 63].forEach(function (f) {
      var v = arr[BANDS.indexOf(f)];
      if (v == null || isNaN(v)) return;
      if (v >= RV_THRESHOLD.clear[f]) {
        rvLevel = 'clear';
        if (rvBands.indexOf(f) < 0) rvBands.push(f);
      } else if (v >= RV_THRESHOLD.moderate[f] && rvLevel !== 'clear') {
        rvLevel = 'moderate';
        if (rvBands.indexOf(f) < 0) rvBands.push(f);
      }
    });

    return {
      rc: C,
      lmf: LMF,
      classification: cls,
      ref: ref,
      details: details,
      rv: rvLevel !== 'none',
      rvLevel: rvLevel,
      rvBands: rvBands,
      sdl: SDL, sdm: SDM, sdh: SDH,
      qai: qai,
      qaiComplete: qaiComplete
    };
  }

  var Acoustics = {
    BANDS: BANDS,
    THIRD_BANDS: THIRD_BANDS,
    A_WEIGHTING: A_WEIGHTING,
    NC_BANDS: NC_BANDS,
    NC_TABLE: NC_TABLE,
    NC_TABLE_16: NC_TABLE_16,
    NR_BANDS: NR_BANDS,
    NR_TABLE: NR_TABLE,
    ROOM_TARGETS: ROOM_TARGETS,
    RC_CLASS_LABEL: RC_CLASS_LABEL,
    RV_THRESHOLD: RV_THRESHOLD,
    aWeightAt: aWeightAt,
    aWeighted: aWeighted,
    ncRating: ncRating,
    ncLowFrequencyCheck: ncLowFrequencyCheck,
    ncBand16Check: ncBand16Check,
    nrRating: nrRating,
    rcRating: rcRating,
    rcCurve: rcCurve,
    bandRating: bandRating,
    curveValue: curveValue,
    thirdToOctave: thirdToOctave,
    evaluateTarget: evaluateTarget,
    findTarget: findTarget,
    energyAverage: energyAverage
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Acoustics;
  } else {
    global.Acoustics = Acoustics;
  }
})(typeof window !== 'undefined' ? window : this);
