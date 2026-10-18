/*
 * view-spectrum.js — 频谱分析与计权 视图（#/spectrum）
 * 依赖 window.Spectrum（内核）、window.MiniChart（曲线）。
 *
 * 六个子计算器：
 *   1) 窄带 / 任意频率点 → 1/1 或 1/3 倍频程归并（能量求和）+ 频谱图
 *   2) A / C / Z 计权与总级、L_C − L_A 低频含量、频谱重心与语言干扰级
 *   3) NR 评级（ISO 1996 解析曲线）
 *   4) NC 评级（Beranek 表）
 *   5) 1/1 ↔ 1/3 双向拆分与合并
 *   6) 分段等效连续声级 L_eq
 *   7) 计权网络速查表
 */
(function () {
  'use strict';
  var S = window.Spectrum;
  var Chart = window.MiniChart;

  function $(id) { return window.Util.$(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) {
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }
  function cssVar(n, f) { return window.Util.cssVar(n, f); }

  /** 解析「频率 声压级」文本：支持空格 / 逗号 / 制表符 / 分号分隔，忽略空行与 # 注释 */
  function parsePairs(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var p = line.split(/[\s,;\t]+/);
      if (p.length < 2) return;
      var a = parseFloat(p[0]), b = parseFloat(p[1]);
      if (isFinite(a) && isFinite(b)) out.push({ f: a, L: b });
    });
    return out;
  }

  function table(headers, rows) {
    if (!rows.length) return '';
    return '<table><thead><tr>' + headers.map(function (h) {
      return '<th>' + h + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  /* ---------------- 频谱图 ---------------- */
  function drawSpectrum(bands) {
    if (!Chart || !bands || !bands.length) return;
    var xs = bands.map(function (b) { return b.fc; });
    var z = bands.map(function (b) { return b.L; });
    var a = bands.map(function (b) { return b.L + S.weighting(b.fc, 'a'); });
    var lo = Math.floor(Math.min.apply(null, a.concat(z)) / 5) * 5 - 5;
    var hi = Math.ceil(Math.max.apply(null, z) / 5) * 5 + 5;
    Chart.draw($('spChart'), {
      x: xs, xLog: true, yMin: lo, yMax: hi, yDigits: 0,
      xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)); },
      series: [
        { values: z, type: 'bar', color: cssVar('--primary', '#2563eb') },
        { values: a, color: '#f59e0b', width: 2, points: true, radius: 2.5 }
      ]
    });
  }

  /* ---------------- 1) 归并 ---------------- */
  function runMerge() {
    var rows = parsePairs($('spText').value);
    if (!rows.length) { show($('spOutMerge'), '没有解析到有效数据，请每行填「频率 声压级」。', 'warn'); return; }
    var frac = pf($('spFrac').value) || 3;
    var bands = S.mergeBands(rows, frac);
    var total = S.totalLevel(bands.map(function (b) { return b.L; }));
    var rawTotal = S.totalLevel(rows.map(function (r) { return r.L; }));
    var rowsHtml = bands.map(function (b) {
      var e = S.bandEdges(b.fc, frac);
      return [b.fc >= 1000 ? (b.fc / 1000) + 'k' : String(b.fc),
      fmt(e.f1, 1) + ' ~ ' + fmt(e.f2, 1), fmt(b.L, 1), b.n];
    });
    show($('spOutMerge'),
      '解析 <b>' + rows.length + '</b> 个数据点 → 归并为 <b>' + bands.length + '</b> 个 ' +
      (frac === 1 ? '1/1' : '1/3') + ' 倍频程频带' +
      '<br>归并前逐点能量总和 ' + fmt(rawTotal, 2) + ' dB　归并后频带能量总和 <b>' +
      fmt(total, 2) + ' dB</b>' +
      (Math.abs(rawTotal - total) < 0.01
        ? '<br><span class="muted">两者一致：能量归并守恒，没有因分带而丢失或重复计入能量。</span>'
        : '<br><span class="muted">两者相差 ' + fmt(rawTotal - total, 2) + ' dB：说明有数据点落在标称频带表之外未被计入。</span>') +
      table(['中心频率 Hz', '频带范围 Hz', '声压级 dB', '并入点数'], rowsHtml),
      'ok');
    drawSpectrum(bands);
  }

  /* ---------------- 2) 计权与指标 ---------------- */
  function runWeight() {
    var rows = parsePairs($('spText').value);
    if (!rows.length) { show($('spOutW'), '请先在上方填入频谱数据。', 'warn'); return; }
    var frac = pf($('spFrac').value) || 3;
    var bands = S.mergeBands(rows, frac);
    var rs = bands.map(function (b) { return { f: b.fc, L: b.L }; });
    var d = S.lcMinusLa(rs);
    if (!d) { show($('spOutW'), '数据不足。', 'warn'); return; }
    var ctd = S.centroid(rs);
    var map = {};
    rs.forEach(function (r) { map[r.f] = r.L; });
    var silv = S.sil(map);
    var wRows = rs.map(function (r) {
      return [r.f >= 1000 ? (r.f / 1000) + 'k' : String(r.f), fmt(r.L, 1),
      fmt(S.weighting(r.f, 'a'), 1), fmt(r.L + S.weighting(r.f, 'a'), 1),
      fmt(S.weighting(r.f, 'c'), 1), fmt(r.L + S.weighting(r.f, 'c'), 1)];
    });
    var verdict = d.diff < 10 ? '常规频谱，A 与 C 计权接近' :
      d.diff < 20 ? '低频含量偏高，注意 63~250 Hz' : '明显低频主导，A 计权会严重低估主观响度';
    show($('spOutW'),
      '总声压级 <b>' + fmt(d.Lz, 2) + ' dB(Z)</b>　' +
      '<b>' + fmt(d.LA, 2) + ' dB(A)</b>　<b>' + fmt(d.LC, 2) + ' dB(C)</b>' +
      '<br>L<sub>C</sub> − L<sub>A</sub> = <b>' + fmt(d.diff, 2) + ' dB</b>：' + verdict +
      '<br>频谱重心 ' + (ctd ? fmt(ctd.linear, 0) + ' Hz（几何重心 ' + fmt(ctd.geometric, 0) + ' Hz）' : '—') +
      '　PSIL ' + (silv.psil != null ? fmt(silv.psil, 1) + ' dB（' + silv.note + '）' : '缺少 500/1k/2k 频带') +
      '<br><span class="muted">L<sub>C</sub> − L<sub>A</sub> 是判断「A 计权是否够用」的常用指标：' +
      '差值超过 20 dB 说明能量集中在低频，单看 dB(A) 会低估实际烦恼度，应同时给出倍频程谱。</span>' +
      table(['中心频率', 'L<sub>Z</sub>', 'A 修正', 'L<sub>A</sub>', 'C 修正', 'L<sub>C</sub>'], wRows),
      'ok');
  }

  /* ---------------- 3) / 4) NR 与 NC ---------------- */
  function octaveMap() {
    var rows = parsePairs($('spOct').value);
    var map = {};
    rows.forEach(function (r) {
      var fc = S.nominal(r.f, 1);
      if (fc != null) map[fc] = r.L;
    });
    return map;
  }

  function runNR() {
    var r = S.nrRating(octaveMap());
    if (!r) { show($('spOutNR'), '需要 31.5 ~ 8000 Hz 的 1/1 倍频程数据。', 'warn'); return; }
    var rows = r.perBand.map(function (p) {
      return [p.f >= 1000 ? (p.f / 1000) + 'k' : String(p.f), fmt(p.L, 1),
      fmt(p.need, 1), fmt(p.margin, 1)];
    });
    var cur = r.curve.map(function (c) {
      return '<span class="mono">' + (c.f >= 1000 ? (c.f / 1000) + 'k' : c.f) + ':' + c.L.toFixed(1) + '</span>';
    }).join('　');
    show($('spOutNR'),
      '评级 <b>' + r.label + '</b>（精确值 ' + fmt(r.exact, 2) + '，向上取整），' +
      '由 <b>' + (r.governing >= 1000 ? (r.governing / 1000) + ' kHz' : r.governing + ' Hz') + '</b> 频带主导' +
      '<br>NR-' + r.n + ' 曲线：' + cur +
      '<br><span class="muted">NR 曲线由 ISO 1996 解析式 L = a + b·N 给出，N 即曲线在 1 kHz 处的声压级。' +
      '评级取「任一频带触碰的最高曲线」，不是各频带的平均值。</span>' +
      table(['频带 Hz', '实测 dB', '所需 NR', '对 NR-' + r.n + ' 余量 dB'], rows),
      'ok');
  }

  function runNC() {
    var r = S.ncRating(octaveMap());
    if (!r) { show($('spOutNC'), '需要 63 ~ 8000 Hz 的 1/1 倍频程数据。', 'warn'); return; }
    var rows = r.perBand.map(function (p) {
      return [p.f >= 1000 ? (p.f / 1000) + 'k' : String(p.f), fmt(p.L, 1),
      'NC-' + p.need, fmt(p.margin, 1)];
    });
    var cur = r.curve.map(function (c) {
      return '<span class="mono">' + (c.f >= 1000 ? (c.f / 1000) + 'k' : c.f) + ':' + c.L.toFixed(0) + '</span>';
    }).join('　');
    show($('spOutNC'),
      '评级 <b>' + r.label + '</b>，由 <b>' + (r.governing >= 1000 ? (r.governing / 1000) + ' kHz' : r.governing + ' Hz') +
      '</b> 频带主导' +
      '<br>' + r.label + ' 曲线：' + cur +
      '<br><span class="muted">NC 曲线来自 Beranek 表（63 Hz ~ 8 kHz，按 5 递增）。' +
      'NC 与 NR 数值接近但不可直接互换：NC-30 在 1 kHz 为 31 dB，而 NR-30 为 30 dB。' +
      'NC 不覆盖 63 Hz 以下，评估现代变频设备的低频嗡声需改用 RC / RNC。</span>' +
      table(['频带 Hz', '实测 dB', '所需 NC', '对 ' + r.label + ' 余量 dB'], rows),
      'ok');
  }

  /* ---------------- 5) 1/1 ↔ 1/3 互转 ---------------- */
  function runConv() {
    var rows = parsePairs($('spConvText').value);
    if (!rows.length) { show($('spOutConv'), '没有解析到有效数据。', 'warn'); return; }
    var mode = $('spConvMode').value;
    var out, head;
    if (mode === 'to3') {
      var oct = S.mergeBands(rows, 1);
      out = S.splitToThird(oct);
      head = '1/1 → 1/3：每个倍频程一分为三，各减 10·lg 3 = 4.77 dB';
    } else {
      out = S.mergeBands(rows, 1);
      head = '1/3 → 1/1：每三个 1/3 倍频程能量求和';
    }
    var before = S.totalLevel(rows.map(function (r) { return r.L; }));
    var after = S.totalLevel(out.map(function (r) { return r.L; }));
    var rowsHtml = out.map(function (b) {
      return [b.fc >= 1000 ? (b.fc / 1000) + 'k' : String(b.fc), fmt(b.L, 1),
      b.parent ? (b.parent >= 1000 ? (b.parent / 1000) + 'k' : String(b.parent)) : '—'];
    });
    show($('spOutConv'),
      head + '<br>共 <b>' + out.length + '</b> 个频带；转换前总级 ' + fmt(before, 2) +
      ' dB，转换后 <b>' + fmt(after, 2) + ' dB</b>' +
      (Math.abs(before - after) < 0.01 ? '（能量守恒）' : '（相差 ' + fmt(before - after, 2) + ' dB，检查是否有频带越界）') +
      table([mode === 'to3' ? '1/3 中心 Hz' : '1/1 中心 Hz', '声压级 dB', '来源倍频程'], rowsHtml),
      'ok');
  }

  /* ---------------- 6) 分段等效声级 ---------------- */
  function runSeg() {
    var rows = parsePairs($('spSegText').value);
    if (!rows.length) { show($('spOutSeg'), '没有解析到有效数据。', 'warn'); return; }
    var segs = rows.map(function (r) { return { L: r.f, t: r.L }; });
    var leq = S.leqFromSegments(segs);
    var T = 0;
    segs.forEach(function (g) { T += isFinite(g.t) && g.t > 0 ? g.t : 1; });
    var plain = S.totalLevel(segs.map(function (g) { return g.L; }));
    var rowsHtml = segs.map(function (g) {
      return [fmt(g.L, 1), fmt(g.t, 2), fmt(100 * (isFinite(g.t) && g.t > 0 ? g.t : 1) / T, 1) + ' %',
      fmt(g.L + 10 * Math.log10((isFinite(g.t) && g.t > 0 ? g.t : 1) / T), 2)];
    });
    show($('spOutSeg'),
      '等效连续声级 <b>L<sub>eq</sub> = ' + fmt(leq, 2) + ' dB</b>（总时长 ' + fmt(T, 2) + '）' +
      '<br>若忽略时长直接对各段做能量求和会得到 ' + fmt(plain, 2) + ' dB，两者相差 ' +
      fmt(plain - leq, 2) + ' dB' +
      '<br><span class="muted">L<sub>eq</sub> = 10·lg[ Σ tᵢ·10^(Lᵢ/10) / Σ tᵢ ]。' +
      '时长越长的段落权重越大；高声级短时间事件也可能主导结果。</span>' +
      table(['声压级 dB', '时长', '时间占比', '能量贡献 dB'], rowsHtml),
      'ok');
  }

  /* ---------------- 7) 计权速查 ---------------- */
  function runTable() {
    var frac = pf($('spWFrac').value) || 1;
    var freqs = frac === 1 ? S.N1_1 : S.N1_3;
    var rows = freqs.map(function (f) {
      return [f >= 1000 ? (f / 1000) + 'k' : String(f),
      fmt(S.weighting(f, 'a'), 1), fmt(S.weighting(f, 'c'), 1), '0.0'];
    });
    show($('spOutTable'),
      'IEC 61672-1 计权网络在 ' + (frac === 1 ? '1/1' : '1/3') + ' 倍频程标称频率上的修正量（dB）。' +
      '<br><span class="muted">A 计权模拟 40 phon 等响曲线反曲线，用于环境噪声与职业暴露；' +
      'C 计权在低频衰减很少，用于评估峰值与低频冲击；Z 计权为线性（0 dB 修正）。' +
      '数值由解析式求得，1 kHz 处 A 与 C 均为 0 dB。</span>' +
      table(['中心频率 Hz', 'A 修正 dB', 'C 修正 dB', 'Z 修正 dB'], rows),
      'ok');
  }

  function init() {
    if (init._d) return; init._d = true;
    $('spBtnMerge').addEventListener('click', runMerge);
    $('spBtnW').addEventListener('click', runWeight);
    $('spBtnNR').addEventListener('click', runNR);
    $('spBtnNC').addEventListener('click', runNC);
    $('spBtnConv').addEventListener('click', runConv);
    $('spBtnSeg').addEventListener('click', runSeg);
    $('spBtnTable').addEventListener('click', runTable);
    $('spWFrac').addEventListener('change', runTable);
    runTable();
  }

  function onShow() {
    var c = $('spChart');
    if (c && !c.hidden) {
      var rows = parsePairs($('spText').value);
      if (rows.length) drawSpectrum(S.mergeBands(rows, pf($('spFrac').value) || 3));
    }
  }

  window.SpectrumView = { init: init, onShow: onShow };
})();
