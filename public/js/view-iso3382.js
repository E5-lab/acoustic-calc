/*
 * view-iso3382.js — 厅堂音质参数视图（#/iso3382）
 * 依赖 window.Iso3382（内核）、window.MiniChart（曲线）。
 *
 * 六个子计算器：
 *   1) 衰减曲线指标：粘贴 Schroeder 曲线 → EDT / T20 / T30 / C50 / C80 / D50 / Ts + 拟合图
 *   2) 强度与侧向：G（L_W 与自由场参考两条路线）、LF、LJ，附 Table A.1 比对
 *   3) 双耳互相关 IACC：粘贴双耳 IR → IACC、峰值时延、互相关曲线图
 *   4) 初始时延差 ITDG：粘贴单耳 IR → ITDG + Beranek 亲切判据 + 包络图
 *   5) 低音比 BR：四频带混响时间 → BR
 *   6) 推荐值对照：ISO 3382-1 Table A.1、文献按厅种目标、T30 按用途
 */
(function () {
  'use strict';

  var I = window.Iso3382;
  var Chart = window.MiniChart;

  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function cssVar(n, f) {
    var v = window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue(n) : '';
    return (v || '').trim() || f;
  }

  function show(id, html, cls) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }

  function table(headers, rows) {
    if (!rows.length) return '<p class="inline-note">暂无数据</p>';
    return '<table class="data-table"><thead><tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  /** Table A.1 判定徽标：inRange true → 绿色「在区间」，false → 琥珀色「超出区间」 */
  function verdict(chk) {
    if (!chk) return '<span class="muted">—</span>';
    if (chk.inRange) return '<span class="mc-tag live">在区间</span>';
    return '<span class="mc-tag" style="color:var(--warn);background:var(--warn-soft);border-color:color-mix(in srgb, var(--warn) 35%, transparent)">超出区间</span>';
  }

  function rangeText(chk) {
    if (!chk) return '—';
    return chk.min + ' ~ ' + chk.max + ' ' + chk.unit;
  }

  /* ================= 1) 衰减曲线指标 ================= */

  function runDecay() {
    var raw = $('isoDecay').value;
    var parsed = I.parseDecay(raw);
    if (!parsed.count) { show('isoDecayOut', '未解析到有效数据行。每行一条「时间(ms) 声压级(dB)」，可用空格 / 逗号 / 分号 / 制表符分隔，# 开头为注释。', 'warn'); return; }
    var rep = I.decayReport(parsed.points);
    if (!rep.ok) { show('isoDecayOut', '数据点太少（至少需要 3 个点）。', 'warn'); return; }
    var badNote = parsed.bad.length ? '<br><span class="muted">已跳过 ' + parsed.bad.length + ' 条无法解析的行（如「' + esc(parsed.bad[0].text.slice(0, 24)) + '」）。</span>' : '';

    function fitNote(f, unit) {
      if (!f || f.error) return '<span class="muted">拟合窗内点数不足</span>';
      var w = f.window[0] + ' ~ ' + f.window[1] + ' dB';
      return esc(w) + '，n = ' + f.n + '，R² = ' + num(f.r2, 3) + '，覆盖 ' + num(f.coveredDb, 1) + ' dB';
    }

    var c80 = rep.c80, d5 = rep.d50;
    var rows = [
      ['EDT 早期衰减时间', '<b>' + num(rep.edt.rt, 2) + ' s</b>', fitNote(rep.edt),
        rangeText(I.checkTarget('EDT', rep.edt.rt)), verdict(I.checkTarget('EDT', rep.edt.rt))],
      ['T20（−5 ~ −25 dB）', num(rep.t20.rt, 2) + ' s', fitNote(rep.t20),
        '<span class="muted">—（ISO 3382-2 采用）</span>', '<span class="muted">—</span>'],
      ['T30（−5 ~ −35 dB）', '<b>' + num(rep.t30.rt, 2) + ' s</b>', fitNote(rep.t30),
        '<span class="muted">—（按曲目/用途见文末表）</span>', '<span class="muted">—</span>'],
      ['C50（50 ms 早/晚能量比）', num(rep.c50 ? rep.c50.c : null, 2) + ' dB', '语言清晰度口径',
        '<span class="muted">—</span>', '<span class="muted">—</span>'],
      ['C80 清晰度', '<b>' + num(c80 ? c80.c : null, 2) + ' dB</b>', '80 ms 早/晚能量比（音乐）',
        rangeText(I.checkTarget('C80', c80 ? c80.c : null)), verdict(I.checkTarget('C80', c80 ? c80.c : null))],
      ['D50 语言清晰度', '<b>' + num(d5 ? d5.d50pct : null, 1) + ' %</b>', '0 ~ 50 ms 能量占总能量比例',
        rangeText(I.checkTarget('D50', d5 ? d5.d50pct : null)), verdict(I.checkTarget('D50', d5 ? d5.d50pct : null))],
      ['Ts 中心时间', '<b>' + num(rep.tsMs, 1) + ' ms</b>', '归一化 Schroeder 曲线下面积',
        rangeText(I.checkTarget('Ts', rep.tsMs)), verdict(I.checkTarget('Ts', rep.tsMs))],
      ['EDT / T30', num(rep.edtOverT30, 2), '双折线指标：< 1 表示早期衰减更快',
        '<span class="muted">文献 0.85 ~ 1.0</span>',
        rep.edtOverT30 == null ? '<span class="muted">—</span>'
          : (rep.edtOverT30 >= 0.85 && rep.edtOverT30 <= 1.0 ? '<span class="mc-tag live">常见</span>' : '<span class="mc-tag">偏离</span>')]
    ];
    var warnHtml = rep.warn.length ? '<br>' + rep.warn.map(function (w) { return '<span style="color:var(--warn)">⚠ ' + esc(w) + '</span>'; }).join('<br>') : '';
    var allIn = ['EDT', 'C80', 'D50', 'Ts'].every(function (k) {
      var c = I.checkTarget(k, k === 'EDT' ? rep.edt.rt : k === 'C80' ? (c80 ? c80.c : null) : k === 'D50' ? (d5 ? d5.d50pct : null) : rep.tsMs);
      return c && c.inRange;
    });
    show('isoDecayOut',
      '<b>曲线起点 ' + num(rep.l0, 1) + ' dB，跨度 ' + num(rep.spanDb, 1) + ' dB，时长 ' + num(rep.durationMs, 0) + ' ms。</b>' +
      (allIn ? ' EDT / C80 / D50 / Ts 均落在 ISO 3382-1 Table A.1 推荐区间。' : ' 有指标超出 Table A.1 区间（见下表判定）。') +
      badNote + warnHtml +
      table(['参数', '数值', '拟合窗 / 说明', 'Table A.1 区间', '判定'], rows),
      allIn ? 'ok' : 'warn');
    drawDecayChart(parsed.points, rep);
  }

  function drawDecayChart(points, rep) {
    if (!Chart) return;
    var pre = I.prepare(points);
    if (!pre) return;
    var xs = pre.points.map(function (q) { return q.t; });
    var vals = pre.points.map(function (q) { return q.levelRel; });
    var series = [{ values: vals, color: cssVar('--primary', '#2563eb'), width: 2, points: false }];
    function fitLine(f, color) {
      if (!f || f.error) return null;
      return {
        values: xs.map(function (t) { return t <= f.t2 + 1 ? f.intercept + f.slope * (t / 1000) : null; }),
        color: color, width: 1.5, dash: [6, 4], points: false
      };
    }
    var lEdt = fitLine(rep.edt, '#f59e0b');
    var lT30 = fitLine(rep.t30, '#ef4444');
    if (lEdt) series.push(lEdt);
    if (lT30) series.push(lT30);
    Chart.draw($('isoDecayChart'), {
      x: xs, yMin: -60, yMax: 2, yDigits: 0,
      xLabelFmt: function (v) { return String(Math.round(v)); },
      hBands: [{ from: -35, to: -5, color: 'rgba(37,99,235,0.06)' }],
      series: series
    });
  }

  /* ================= 2) 强度与侧向 ================= */

  function runLateral() {
    var lpE = pf($('isoLpE').value);
    var lw = pf($('isoLW').value);
    var lpE10 = pf($('isoLpE10').value);
    var lOmni = pf($('isoLOmni').value);
    var lFig8 = pf($('isoLFig8').value);
    var lLate = pf($('isoLLate').value);
    if (lpE == null && lOmni == null && lLate == null) {
      show('isoLatOut', '请至少填写声压暴露级 L_pE（dB）或早期声级。', 'warn');
      return;
    }
    var rows = [];
    var gFromLW = (lpE != null && lw != null) ? I.strengthFromLW(lpE, lw) : null;
    var gFromRef = (lpE != null && lpE10 != null) ? I.strengthFromRef(lpE, lpE10) : null;
    var gVal = gFromLW ? gFromLW.g : (gFromRef ? gFromRef.g : null);
    if (gFromLW) {
      rows.push(['强度 G（L_W 路线）', 'L_pE − L_W + 31 = ' + num(lpE, 1) + ' − ' + num(lw, 1) + ' + 31',
        '<b>+' + num(gFromLW.g, 1) + ' dB</b>',
        rangeText(I.checkTarget('G', gFromLW.g)), verdict(I.checkTarget('G', gFromLW.g))]);
    }
    if (gFromRef) {
      rows.push(['强度 G（自由场参考路线）', 'L_pE − L_pE,10 = ' + num(lpE, 1) + ' − ' + num(lpE10, 1),
        '<b>+' + num(gFromRef.g, 1) + ' dB</b>',
        rangeText(I.checkTarget('G', gFromRef.g)), verdict(I.checkTarget('G', gFromRef.g))]);
    }
    if (!gFromLW && !gFromRef) rows.push(['强度 G', '需 L_pE 与 L_W（或自由场参考 L_pE,10）', '—', '—', '<span class="muted">—</span>']);
    if (gVal != null) {
      var fd = I.freeFieldDistance(gVal);
      rows.push(['等效自由场距离', 'd_eq = 10·10^(−G/20)', num(fd.dEq, 1) + ' m',
        '<span class="muted">G = 0 ↔ 10 m；G = +20 ↔ 1 m</span>', '<span class="muted">—</span>']);
    }
    var lf = (lOmni != null && lFig8 != null) ? I.lateralFraction(lOmni, lFig8) : null;
    rows.push(['侧向能量分数 LF', lf ? '10^((' + num(lFig8, 1) + ' − ' + num(lOmni, 1) + ')/10)' : '需 0~80 ms 全向与 8 字麦声级',
      lf ? '<b>' + num(lf.lfPct, 1) + ' %</b>' : '—',
      rangeText(I.checkTarget('LF', lf ? lf.lfPct : null)), verdict(I.checkTarget('LF', lf ? lf.lfPct : null))]);
    var lj = (lLate != null && lw != null) ? I.lateLateralLevel(lLate, lw) : null;
    rows.push(['晚侧向声级 LJ', lj ? 'L_晚侧向 − L_W + 31 = ' + num(lLate, 1) + ' − ' + num(lw, 1) + ' + 31' : '需晚侧向声级与 L_W',
      lj ? '<b>' + num(lj.lj, 1) + ' dB</b>' : '—',
      rangeText(I.checkTarget('LJ', lj ? lj.lj : null)), verdict(I.checkTarget('LJ', lj ? lj.lj : null))]);
    var note = 'G 与 LJ 以 10 m 自由场为参考，需要校准声源（实测自由场参考能量或已知声功率级 L_W）；' +
      'LF 只需同一次测量中 0~80 ms 的两路早期声级，无需校准。';
    if (gVal != null) note += ' 本组数据的 G ≈ ' + num(gVal, 1) + ' dB，相当于自由场中 ' + num(I.freeFieldDistance(gVal).dEq, 1) + ' m 处的听闻声级。';
    show('isoLatOut', note + '<br>' +
      table(['参数', '算式', '结果', 'Table A.1 区间', '判定'], rows), 'ok');
  }

  /* ================= 3) 双耳互相关 IACC ================= */

  function runIacc() {
    var parsed = I.parseIR($('isoBin').value);
    if (!parsed.count) { show('isoBinOut', '未解析到有效数据行。每行一条「时间(ms) 左耳 右耳」。', 'warn'); return; }
    if (!parsed.hasRight) { show('isoBinOut', '只解析到两列（单通道）。IACC 需要双耳数据：「时间(ms) 左耳 右耳」。', 'warn'); return; }
    var r = I.iacc(parsed.points);
    if (r.error) {
      var msg = { 'non-uniform': '采样间隔不均匀（' + num(r.dt, 3) + ' ms 中位数），请提供等间隔采样的双耳 IR。',
        'missing-channel': '右耳数据缺失。', 'too-few-points': '数据点太少。',
        'window-too-few-points': '早期窗（0~80 ms）内点数不足。', 'zero-energy': '信号能量为 0。' }[r.error] || ('计算失败：' + r.error);
      show('isoBinOut', msg, 'warn');
      return;
    }
    var lo = 0.25, hi = 0.55;
    var inLit = r.iacc >= lo && r.iacc <= hi;
    show('isoBinOut',
      '<b>IACC = ' + num(r.iacc, 3) + '</b>（早期窗 0~' + r.windowMs + ' ms 内、|τ| ≤ ' + r.maxLagMs + ' ms 的归一化互相关最大值）' +
      '<br>峰值时延 τ = <b>' + num(r.tauMs, 2) + ' ms</b>；1 − IACC = ' + num(r.oneMinusIacc, 3) + '（报告惯例：越大越开阔）' +
      '<br><span class="muted">窗内 ' + r.n + ' 点，采样间隔 ' + num(r.dt, 2) + ' ms。文献常见 IACC_E（500 / 1k / 2k 三频带平均）约 ' +
      lo + ' ~ ' + hi + '，本值' + (inLit ? '在' : '略偏离') + '常见区间。</span>' +
      '<br><span class="muted">IACC 需要双耳（假头）接收器；1 − IACC 越大表示两耳信号差异越大、空间感越强。</span>',
      'ok');
    drawIaccChart(r);
  }

  function drawIaccChart(r) {
    if (!Chart || !r.curve) return;
    var xs = r.curve.map(function (p) { return p.tauMs; });
    var series = [
      { values: xs.map(function () { return 0; }), color: '#94a3b8', width: 1, dash: [5, 4], points: false },
      { values: r.curve.map(function (p) { return p.ncc; }), color: cssVar('--primary', '#2563eb'), width: 2, points: false },
      {
        values: xs.map(function (t) { return Math.abs(t - r.tauMs) < 1e-6 ? r.iacc : null; }),
        color: '#16a34a', width: 0, points: true, radius: 4.5
      }
    ];
    Chart.draw($('isoBinChart'), {
      x: xs, yMin: -1, yMax: 1, yDigits: 2,
      xLabelFmt: function (v) { return v.toFixed(1); },
      series: series
    });
  }

  /* ================= 4) 初始时延差 ITDG ================= */

  function runItdg() {
    var thr = pf($('isoItdgThr').value);
    if (thr == null) thr = -20;
    var parsed = I.parseMono($('isoMono').value);
    if (!parsed.count) { show('isoMonoOut', '未解析到有效数据行。每行一条「时间(ms) 幅值」。', 'warn'); return; }
    var r = I.itdg(parsed.points, thr);
    if (r.error) {
      show('isoMonoOut', '计算失败：' + (r.error === 'no-direct' ? '未找到超过阈值的直达声（阈值 ' + thr + ' dB）。' : r.error), 'warn');
      return;
    }
    var verdictText = { 'beranek-intimate': 'Beranek 亲切判据：&lt; 20 ms 有亲切感 —— 本值属「亲切」',
      'beranek-moderate': 'Beranek 判据：20 ~ 40 ms 属中等规模感',
      'beranek-large': 'Beranek 判据：&gt; 40 ms 显空旷、声源偏远' }[r.beranek] || '';
    if (r.itdg == null) {
      show('isoMonoOut',
        '直达声 ' + num(r.directT, 1) + ' ms（相对峰值 ' + num(r.directLevel, 1) + ' dB）。' + esc(r.note || ''),
        'warn');
      drawItdgChart(parsed.points, r, thr);
      return;
    }
    show('isoMonoOut',
      '<b>ITDG = ' + num(r.itdg, 1) + ' ms</b>（直达 ' + num(r.directT, 1) + ' ms → 第一显著反射 ' + num(r.reflT, 1) + ' ms）' +
      '<br>第一反射比直达低 ' + num(r.reflLevel, 1) + ' dB；判定阈值 ' + thr + ' dB（相对直达峰值）。' +
      '<br>' + verdictText + '。音乐厅一般希望 &lt; 20 ms；ITDG 大时需靠顶棚 / 舞台反射板补足早期反射。',
      'ok');
    drawItdgChart(parsed.points, r, thr);
  }

  function drawItdgChart(points, r, thr) {
    if (!Chart) return;
    var pMax = 0;
    points.forEach(function (q) { pMax = Math.max(pMax, Math.abs(q.p)); });
    var xs = points.map(function (q) { return q.t; });
    var vals = points.map(function (q) { return pMax > 0 ? 20 * Math.log(Math.abs(q.p) / pMax) / Math.LN10 : null; });
    var series = [
      { values: xs.map(function () { return thr; }), color: '#94a3b8', width: 1, dash: [5, 4], points: false },
      { values: vals, color: cssVar('--primary', '#2563eb'), width: 1.5, points: false }
    ];
    if (r.directT != null) {
      series.push({ values: xs.map(function (t) { return Math.abs(t - r.directT) < 1e-6 ? 0 : null; }), color: '#16a34a', width: 0, points: true, radius: 4.5 });
    }
    if (r.reflT != null) {
      series.push({ values: xs.map(function (t) { return Math.abs(t - r.reflT) < 1e-6 ? r.reflLevel : null; }), color: '#f59e0b', width: 0, points: true, radius: 4.5 });
    }
    Chart.draw($('isoMonoChart'), {
      x: xs, yMin: -40, yMax: 3, yDigits: 0,
      xLabelFmt: function (v) { return String(Math.round(v)); },
      series: series
    });
  }

  /* ================= 5) 低音比 BR ================= */

  function runBR() {
    var a = pf($('isoBR125').value), b = pf($('isoBR250').value), c = pf($('isoBR500').value), d = pf($('isoBR1k').value);
    var r = I.bassRatio(a, b, c, d);
    if (!r) { show('isoBrOut', '请填写四个频带的混响时间（s），且 500 Hz 与 1 kHz 之和 > 0。', 'warn'); return; }
    var verdictText = { warm: '低音混响长于中频，声音温暖（音乐厅一般希望 ≥ 1.0；浪漫派曲目约 1.1 ~ 1.2）',
      balanced: '低音与中频混响基本均衡', lean: '低音混响短于中频，声音偏「薄」' }[r.verdict];
    show('isoBrOut',
      '<b>BR = (' + num(a, 2) + ' + ' + num(b, 2) + ') / (' + num(c, 2) + ' + ' + num(d, 2) + ') = <span style="font-size:1.15em">' + num(r.br, 2) + '</span></b>' +
      '<br>' + esc(verdictText) + '。<span class="muted">BR 取 125 / 250 / 500 / 1 kHz 四个倍频程的混响时间；低音偏短常见于吸声偏多或房间体积过小的厅堂。</span>',
      'ok');
  }

  /* ================= 6) 推荐值对照表 ================= */

  function fillTargetTables() {
    var box = $('isoTargets');
    if (!box) return;
    var t1 = table(['参数', '单位', '适用频带', '期望区间', '最小可觉差 JND', '关联主观量'],
      I.TARGETS.map(function (t) {
        return [t.name, t.unit, t.band, t.min + ' ~ ' + t.max, t.jnd, t.sense];
      }));
    var t2 = table(['厅种（文献目标）', 'T30 s', 'EDT s', 'EDT/T30', 'C80 dB', 'D50 %', 'Ts ms', 'G dB', 'LF %', 'IACC_E'],
      I.VENUE_TARGETS.map(function (v) {
        var m = {};
        v.rows.forEach(function (r) { m[r.key] = r; });
        function cell(k, d) {
          var r = m[k];
          return r ? (d == null ? r.min + ' ~ ' + r.max : r.min.toFixed(d) + ' ~ ' + r.max.toFixed(d)) : '—';
        }
        return [v.venue, cell('T30', 1), cell('EDT', 1), cell('EDT/T30', 2), cell('C80', 0), cell('D50', 0), cell('Ts', 0), cell('G', 0), cell('LF', 0), cell('IACC_E', 2)];
      }));
    var t3 = table(['曲目 / 用途', 'T30 推荐（中频）'], I.T30_BY_USE.map(function (r) { return [r.use, r.t30]; }));
    box.innerHTML =
      '<p class="hint"><b>表 1 · ISO 3382-1:2009 Table A.1</b>：音乐厅及 ≤ 25000 m³ 空场多用途厅的期望区间（G / EDT / C80 / D50 / Ts 取 500–1000 Hz 中频；LF / LJ 取 125–1000 Hz）。</p>' + t1 +
      '<p class="hint" style="margin-top:14px"><b>表 2 · 文献按厅种目标值</b>（Beranek 2004 / Barron 2009，经 AcousPlan 整理；ISO 本身只规定测法、不强制指标）：</p>' + t2 +
      '<p class="hint" style="margin-top:14px"><b>表 3 · T30 按曲目 / 用途的文献推荐</b>（中频）：</p>' + t3;
  }

  /* ================= 骨架与初始化 ================= */

  function buildSkeleton() {
    var root = $('view-iso3382');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>厅堂音质参数</h2>' +
      '<p class="hint">把测得的衰减曲线与脉冲响应算成能下结论的指标：EDT / T20 / T30 最小二乘拟合、C50 / C80 / D50 / Ts、强度 G、侧向 LF 与晚侧向 LJ、双耳 IACC、初始时延差 ITDG 与低音比 BR，并对照 ISO 3382-1:2009 Table A.1 推荐区间。与「厅堂与扩声音质」模块互补——那边按几何与吸声预测，这边按测量数据处理。</p></div>' +

      '<section class="card"><h3>衰减曲线指标</h3>' +
      '<p class="hint">粘贴 Schroeder 后向积分衰减曲线（每行「时间(ms) 声压级(dB)」，起点取 0 dB 或绝对峰值均可，比值类指标与偏移量无关）。曲线应延伸至噪声准线或至少 −35 dB。</p>' +
      '<textarea id="isoDecay" class="text-input" rows="8" spellcheck="false"></textarea>' +
      '<div class="field-row">' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnDecay" class="btn primary" type="button">计算指标</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnDecayEx" class="btn" type="button">恢复示例数据</button></div>' +
      '</div>' +
      '<div id="isoDecayOut" class="result-line" hidden></div>' +
      '<canvas id="isoDecayChart" height="280"></canvas>' +
      '<p class="hint">蓝线为衰减曲线（相对起点），橙虚线为 EDT 拟合（0~−10 dB），红虚线为 T30 拟合（−5~−35 dB）；浅蓝带为 T30 拟合窗。</p>' +
      '</section>' +

      '<section class="card"><h3>强度 G 与侧向参数 LF / LJ</h3>' +
      '<p class="hint">G = L_pE − L_pE,10（与 10 m 自由场参考能量之比）；已知声功率级时用 G = L_pE − L_W + 31 dB。LF 取 0~80 ms 内 8 字麦与全向麦的声级差；LJ 为 80 ms 之后的晚侧向声级（同样以 10 m 自由场为参考）。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="isoLpE">声压暴露级 L_pE (dB)</label><input id="isoLpE" class="text-input" type="number" value="78" step="0.1"></div>' +
      '<div class="field"><label for="isoLW">声功率级 L_W (dB)</label><input id="isoLW" class="text-input" type="number" value="105" step="0.1"></div>' +
      '<div class="field"><label for="isoLpE10">自由场参考 L_pE,10 (dB，可空)</label><input id="isoLpE10" class="text-input" type="number" value="73" step="0.1"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="isoLOmni">全向麦早期声级 0~80 ms (dB)</label><input id="isoLOmni" class="text-input" type="number" value="72" step="0.1"></div>' +
      '<div class="field"><label for="isoLFig8">8 字麦早期声级 0~80 ms (dB)</label><input id="isoLFig8" class="text-input" type="number" value="65" step="0.1"></div>' +
      '<div class="field"><label for="isoLLate">晚侧向声级 80 ms~∞ (dB)</label><input id="isoLLate" class="text-input" type="number" value="60" step="0.1"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnLat" class="btn primary" type="button">计算</button></div>' +
      '</div>' +
      '<div id="isoLatOut" class="result-line" hidden></div>' +
      '</section>' +

      '<section class="card"><h3>双耳互相关 IACC</h3>' +
      '<p class="hint">粘贴双耳脉冲响应（每行「时间(ms) 左耳 右耳」，线性幅值、等间隔采样）。IACC = 早期窗 0~80 ms 内、|τ| ≤ 1 ms 的归一化互相关最大值。</p>' +
      '<textarea id="isoBin" class="text-input" rows="6" spellcheck="false"></textarea>' +
      '<div class="field-row">' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnBin" class="btn primary" type="button">计算 IACC</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnBinEx" class="btn" type="button">恢复示例数据</button></div>' +
      '</div>' +
      '<div id="isoBinOut" class="result-line" hidden></div>' +
      '<canvas id="isoBinChart" height="240"></canvas>' +
      '<p class="hint">蓝线为归一化互相关函数（时延 τ），绿点为峰值（即 IACC）。</p>' +
      '</section>' +

      '<section class="card"><h3>初始时延差 ITDG</h3>' +
      '<p class="hint">粘贴单耳脉冲响应（每行「时间(ms) 幅值」）。ITDG 为直达声与第一显著反射（超过阈值的局部极大）的时间差；Beranek 以 &lt; 20 ms 作为亲切判据。</p>' +
      '<textarea id="isoMono" class="text-input" rows="6" spellcheck="false"></textarea>' +
      '<div class="field-row">' +
      '<div class="field"><label for="isoItdgThr">显著反射阈值 (dB，相对直达)</label><input id="isoItdgThr" class="text-input" type="number" value="-20" step="1"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnMono" class="btn primary" type="button">计算 ITDG</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnMonoEx" class="btn" type="button">恢复示例数据</button></div>' +
      '</div>' +
      '<div id="isoMonoOut" class="result-line" hidden></div>' +
      '<canvas id="isoMonoChart" height="240"></canvas>' +
      '<p class="hint">蓝线为脉冲响应包络（相对峰值 dB），灰虚线为显著反射阈值，绿点为直达声、橙点为第一显著反射。</p>' +
      '</section>' +

      '<section class="card"><h3>低音比 BR</h3>' +
      '<p class="hint">BR = (RT125 + RT250) / (RT500 + RT1000)，取四个倍频程实测混响时间（s）。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="isoBR125">RT 125 Hz (s)</label><input id="isoBR125" class="text-input" type="number" value="2.4" step="0.05"></div>' +
      '<div class="field"><label for="isoBR250">RT 250 Hz (s)</label><input id="isoBR250" class="text-input" type="number" value="2.0" step="0.05"></div>' +
      '<div class="field"><label for="isoBR500">RT 500 Hz (s)</label><input id="isoBR500" class="text-input" type="number" value="1.9" step="0.05"></div>' +
      '<div class="field"><label for="isoBR1k">RT 1 kHz (s)</label><input id="isoBR1k" class="text-input" type="number" value="1.8" step="0.05"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="isoBtnBr" class="btn primary" type="button">计算 BR</button></div>' +
      '</div>' +
      '<div id="isoBrOut" class="result-line" hidden></div>' +
      '</section>' +

      '<section class="card notes"><h3>推荐值对照</h3><div id="isoTargets"></div></section>' +

      '<section class="card notes"><h3>标准依据与边界</h3><ul>' +
      '<li><strong>ISO 3382-1:2009</strong>：EDT 拟合 0~−10 dB，T20 拟合 −5~−25 dB，T30 拟合 −5~−35 dB，均以最小二乘斜率外推至 60 dB（T = 60/|斜率|）；中频单值取 500 / 1k / 2k 三频带算术平均。</li>' +
      '<li><strong>C80 / C50 / D50 / Ts</strong>：C80 = 10lg(E[0,80ms]/E[80ms,∞])，C50 同理取 50 ms；D50 = E[0,50ms]/E[0,∞]（C50 = 10lg(D50/(1−D50))）；Ts 为平方脉冲响应的重心时间，等价于归一化 Schroeder 曲线下面积。</li>' +
      '<li><strong>强度 G</strong>：G = 10lg(∫p²dt / ∫p₁₀²dt)，参考为同一全向声源 10 m 自由场；由声功率级换算时 G = L_pE − L_W + 31 dB（10lg(4π·10²)，ρc = 400 约定）。G 与 LJ 需要校准声源。</li>' +
      '<li><strong>LF / LJ</strong>：LF 需 8 字麦克风（零轴指向声源），取 0~80 ms；LJ 取 80 ms 以后的晚侧向能量，同样以 10 m 自由场为参考。LFC 为 LF 的双 8 字麦相干改进版，本工具未实现。</li>' +
      '<li><strong>IACC</strong>：IACC = max_{|τ|≤1ms}|IACF(τ)|，早期窗 0~80 ms，需双耳（假头）接收器；常报告 1−IACC，IACC_E3 为 500/1k/2k 平均。</li>' +
      '<li><strong>ITDG</strong>（Beranek 1962）：直达声与第一显著反射的时间差，显著反射一般取超过直达 −20 dB 的局部极大；&lt; 20 ms 亲切、20~40 ms 中等、&gt; 40 ms 空旷。</li>' +
      '<li><strong>BR</strong>：低音比 = (RT125+RT250)/(RT500+RT1000)，衡量低音相对中频的混响长度。</li>' +
      '<li><strong>边界</strong>：Table A.1 是期望区间而非达标线；衰减曲线应延伸到噪声准线或至少 30 dB 衰减，否则 T30 为外推等效值；双折线衰减时 EDT 与 T30 差异本身即是信息（EDT/T30）。</li>' +
      '</ul></section>';
  }

  function bind() {
    var b;
    b = $('isoBtnDecay'); if (b) b.addEventListener('click', runDecay);
    b = $('isoBtnDecayEx'); if (b) b.addEventListener('click', function () { $('isoDecay').value = I.exampleDecay(); runDecay(); });
    b = $('isoBtnLat'); if (b) b.addEventListener('click', runLateral);
    b = $('isoBtnBin'); if (b) b.addEventListener('click', runIacc);
    b = $('isoBtnBinEx'); if (b) b.addEventListener('click', function () { $('isoBin').value = I.exampleBinaural(); runIacc(); });
    b = $('isoBtnMono'); if (b) b.addEventListener('click', runItdg);
    b = $('isoBtnMonoEx'); if (b) b.addEventListener('click', function () { $('isoMono').value = I.exampleMono(); runItdg(); });
    b = $('isoBtnBr'); if (b) b.addEventListener('click', runBR);
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    $('isoDecay').value = I.exampleDecay();
    $('isoBin').value = I.exampleBinaural();
    $('isoMono').value = I.exampleMono();
    fillTargetTables();
    runDecay();
    runLateral();
    runIacc();
    runItdg();
    runBR();
    inited = true;
  }

  function onShow() {
    if (inited) { runDecay(); runLateral(); runIacc(); runItdg(); runBR(); }
  }

  window.Iso3382View = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
