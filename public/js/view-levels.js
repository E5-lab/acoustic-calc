/*
 * view-levels.js — 声压级叠加计算视图
 * 依赖：window.Levels（内核）、window.Acoustics（A 计权总级）、window.MiniChart（绘图）
 */
(function () {
  'use strict';

  var E = window.Levels;
  var A = window.Acoustics;

  var PRESETS = [
    {
      id: 'workshop', name: '车间：冲床 ×2 + 空压机 + 风机',
      rows: [{ name: '冲床', level: 88, count: 2 }, { name: '空压机', level: 85, count: 1 }, { name: '风机', level: 80, count: 1 }]
    },
    {
      id: 'road', name: '交通：快车道 + 辅道 + 背景',
      rows: [{ name: '快车道', level: 74, count: 1 }, { name: '辅道', level: 68, count: 1 }, { name: '背景', level: 60, count: 1 }]
    },
    {
      id: 'chiller', name: '屋面：冷却塔 ×3（等强 82）',
      rows: [{ name: '冷却塔', level: 82, count: 3 }]
    },
    {
      id: 'equal', name: '三个等强声源（各 70）',
      rows: [{ name: '声源 1', level: 70, count: 1 }, { name: '声源 2', level: 70, count: 1 }, { name: '声源 3', level: 70, count: 1 }]
    },
    {
      id: 'dominant', name: '一强一弱（85 + 68）',
      rows: [{ name: '主机', level: 85, count: 1 }, { name: '辅机', level: 68, count: 1 }]
    }
  ];

  var SPECTRUM_A = '72 75 78 80 82 79 74 68';
  var SPECTRUM_B = '68 70 73 76 78 76 72 66';

  var state = {
    panel: 'sum',
    rows: [{ name: '冲床', level: 88, count: 2 }, { name: '空压机', level: 85, count: 1 }, { name: '风机', level: 80, count: 1 }],
    eq: { level: 75, count: 4 },
    pair: { l1: 80, l2: 74 },
    coh: { l1: 80, l2: 80, phase: 0 },
    bg: { total: 75, level: 70 },
    target: 88,
    specA: [],
    specB: []
  };
  var last = null;
  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) {
    return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d);
  }
  function pf(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : null; }
  // 大数/小数的可读格式（用于声压比等派生量）
  function fmtSci(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    var d = digits == null ? 2 : digits;
    if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 0.01)) {
      var exp = Math.floor(Math.log10(Math.abs(v)));
      var mant = v / Math.pow(10, exp);
      return mant.toFixed(d) + '×10<sup>' + exp + '</sup>';
    }
    return v.toLocaleString('en-US', { maximumFractionDigits: d });
  }
  function fmtP(pa) {
    if (pa == null || !isFinite(pa)) return '—';
    if (pa >= 100) return pa.toFixed(1);
    if (pa >= 1) return pa.toFixed(3);
    if (pa >= 0.001) return pa.toFixed(5);
    return pa.toExponential(3);
  }

  function list() {
    return state.rows.map(function (r) {
      return { name: r.name, level: r.level, count: r.count };
    });
  }

  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub">' + sub + '</div>' : '') + '</div>';
  }
  function kv(k, v, unit, sub) {
    return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v +
      (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub mini">' + sub + '</div>' : '') + '</div>';
  }

  // ------------------------------ 声源列表 ------------------------------
  function renderRows() {
    var box = $('lvSrcList');
    box.innerHTML = '';
    state.rows.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'src-row';
      row.innerHTML =
        '<input class="src-name" type="text" placeholder="声源名称（可选）" />' +
        '<input class="src-level" type="number" step="0.1" placeholder="dB" />' +
        '<input class="src-count" type="number" step="1" min="1" placeholder="1" />' +
        '<button class="icon-btn" type="button" title="删除该声源" aria-label="删除该声源">×</button>';
      var nameEl = row.querySelector('.src-name');
      var lvEl = row.querySelector('.src-level');
      var ctEl = row.querySelector('.src-count');
      nameEl.value = r.name || '';
      lvEl.value = r.level == null ? '' : r.level;
      ctEl.value = r.count == null ? 1 : r.count;

      nameEl.addEventListener('input', function () { state.rows[i].name = this.value; recalcSum(); });
      lvEl.addEventListener('input', function () {
        var v = parseFloat(this.value);
        state.rows[i].level = isFinite(v) ? v : null;
        recalcSum();
      });
      ctEl.addEventListener('input', function () {
        var v = parseInt(this.value, 10);
        state.rows[i].count = isFinite(v) && v > 0 ? v : 1;
        recalcSum();
      });
      row.querySelector('.icon-btn').addEventListener('click', function () {
        state.rows.splice(i, 1);
        if (!state.rows.length) state.rows.push({ name: '', level: null, count: 1 });
        renderRows();
        recalcSum();
      });
      box.appendChild(row);
    });
  }

  function addRow() {
    state.rows.push({ name: '', level: null, count: 1 });
    renderRows();
    var rows = $('lvSrcList').querySelectorAll('.src-row');
    var lastRow = rows[rows.length - 1];
    if (lastRow) lastRow.querySelector('.src-level').focus();
    recalcSum();
  }

  // ------------------------------ 面板 1：多声源叠加 ------------------------------
  function recalcSum() {
    var res = E.sources(list());
    var msg = $('lvMsg');
    msg.innerHTML = '';

    if (!res.ok) {
      last = null;
      $('lvTotal').textContent = '—';
      $('lvVerdict').textContent = '';
      $('lvStats').innerHTML = '';
      $('lvContrib').innerHTML = '';
      $('lvTargetResult').innerHTML = '';
      msg.innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(res.error) + '</span></div>';
      return;
    }
    last = res;

    $('lvTotal').textContent = res.total.toFixed(1);
    var dom = res.dominant;
    var domLabel = (dom.name ? dom.name : '第 1 项') + (dom.count > 1 ? ' ×' + dom.count : '');
    $('lvVerdict').innerHTML = '比最强单源（' + esc(domLabel) + '，' + num(dom.partial, 1) + ' dB）高 ' +
      num(res.incrementOverMax, 1) + ' dB　·　共 ' + res.count + ' 项 / ' + res.totalCount + ' 台声源';

    $('lvStats').innerHTML =
      stat('能量平均级', num(res.average, 1), 'dB', '按 ' + res.totalCount + ' 台计') +
      stat('最强单源（含台数）', num(res.maxPartial, 1), 'dB', esc(domLabel)) +
      stat('主导声源占比', num(dom.share * 100, 1), '%', '能量占比') +
      stat('叠加增量', num(res.incrementOverMax, 1), 'dB', '相对最强单源');

    var rowsHtml = res.rows.map(function (r) {
      var drop = r.removalDrop;
      var negligible = drop != null && drop < 0.5;
      var pct = r.share * 100;
      return '<tr><td>' + (r.name ? esc(r.name) : '—') + '</td>' +
        '<td>' + num(r.level, 1) + '</td>' +
        '<td>' + r.count + '</td>' +
        '<td>' + num(r.partial, 1) + '</td>' +
        '<td>' + num(pct, 1) + '%<span class="share"><span class="share-fill" style="width:' +
          Math.max(0, Math.min(100, pct)).toFixed(1) + '%"></span></span></td>' +
        '<td class="' + (negligible ? 'muted-cell' : '') + '">' +
          (drop == null ? '—' : num(drop, 2) + (negligible ? '（可忽略）' : '')) + '</td></tr>';
    }).join('');
    $('lvContrib').innerHTML = '<table class="detail-table wide"><caption>「撤除后总级下降」表示单独去掉该声源时总级的降低量，可用于判断治理优先级</caption>' +
      '<thead><tr><th>声源</th><th>声级 (dB)</th><th>台数</th><th>单独作用级 (dB)</th><th>能量占比</th>' +
      '<th>撤除后总级下降 (dB)</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>';

    // 提示
    var top = res.rows.slice().sort(function (a, b) { return b.energy - a.energy; })[0];
    if (res.rows.length > 1 && top.removalDrop != null && top.removalDrop < 3) {
      msg.innerHTML += '<div class="callout info"><span class="dot"></span><span>各声源强度接近：撤除最强声源（' +
        esc(top.name || '第 1 项') + '）总级也仅下降 ' + num(top.removalDrop, 1) +
        ' dB，需要同时控制多个声源才能明显降噪。</span></div>';
    }
    if (res.incrementOverMax < 0.5 && res.rows.length > 1) {
      msg.innerHTML += '<div class="callout warn"><span class="dot"></span><span>存在明显的「主导声源」：其他声源对总级贡献很小（叠加增量不足 0.5 dB），优先治理最强声源收益最大。</span></div>';
    }

    renderSuggest();
  }

  function renderSuggest() {
    var res = E.requiredReduction(list(), state.target);
    var box = $('lvTargetResult');
    if (!res.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(res.error) + '</span></div>';
      return;
    }
    if (res.already) {
      box.innerHTML = kv('当前总级', num(res.total, 1), 'dB', '已满足目标 ' + num(res.target, 1) + ' dB，无需降噪');
      return;
    }
    var html = kv('当前总级', num(res.total, 1), 'dB', '目标 ' + num(res.target, 1) + ' dB，需降低 ' + num(res.needed, 2) + ' dB');
    var rows = res.rows.map(function (r) {
      return '<tr><td>' + (r.name ? esc(r.name) : '—') + '</td><td>' + num(r.level, 1) + '</td>' +
        '<td class="' + (r.feasible ? 'ok' : 'bad') + '">' +
        (r.need == null ? '不可行' : num(r.need, 2)) + '</td>' +
        '<td>' + (r.resultLevel == null ? '—' : num(r.resultLevel, 1)) + '</td>' +
        '<td>' + num(r.others, 1) + '</td></tr>';
    }).join('');
    html += '<div class="kv kv-wide"><div class="k">仅降某一个声源到目标</div><div class="v">' +
      (res.feasible ? '可行：最小需降低 ' + num(res.minimal, 2) + ' dB' : '不可行') + '</div></div>';
    html += '<div class="table-wrap"><table class="detail-table wide"><thead><tr><th>声源</th><th>当前声级</th>' +
      '<th>需降低 (dB)</th><th>降后声级</th><th>其余声源合计 (dB)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    box.innerHTML = html;
  }

  // ------------------------------ 等声级声源 ------------------------------
  function renderEqual() {
    var r = E.sources([{ level: state.eq.level, count: state.eq.count }]);
    var box = $('lvEqResult');
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      return;
    }
    var n = state.eq.count;
    box.innerHTML =
      kv('叠加总声级', num(r.total, 1), 'dB', n + ' 个 ' + num(state.eq.level, 1) + ' dB 声源') +
      kv('相对单台增加', num(r.total - state.eq.level, 2), 'dB', '理论值 10·lg n = ' + num(10 * Math.log10(n), 2) + ' dB') +
      kv('声级相同数量加倍', '3.01', 'dB', '2 台 +3.0、4 台 +6.0、8 台 +9.0');
  }

  // ------------------------------ 频带谱叠加 ------------------------------
  function parseSpec(text) {
    var parts = String(text || '').split(/[\s,，、;；]+/).filter(function (s) { return s !== ''; });
    return parts.map(function (s) { var v = parseFloat(s); return isFinite(v) ? v : null; });
  }

  function renderSpectrum() {
    var r = E.sumSpectra(state.specA, state.specB, E.OCT_BANDS);
    var box = $('lvSpecTable');
    if (!r.ok) {
      box.innerHTML = '';
      $('lvSpecMsg').textContent = r.error;
      return;
    }
    $('lvSpecMsg').textContent = '';
    var aw = function (levels) {
      if (!A || !levels) return null;
      var has = levels.some(function (v) { return v != null && !isNaN(v); });
      if (!has) return null;
      return A.aWeighted(levels, E.OCT_BANDS).LA;
    };
    var rows = r.rows.map(function (x) {
      return '<tr><td>' + x.f + ' Hz</td><td>' + num(x.a, 1) + '</td><td>' + num(x.b, 1) +
        '</td><td>' + num(x.sum, 1) + (x.missing ? '（仅 ' + x.missing + '）' : '') +
        '</td><td>' + (x.a != null && x.b != null ? num(x.sum - Math.max(x.a, x.b), 2) : '—') + '</td></tr>';
    }).join('');
    var tA = aw(state.specA), tB = aw(state.specB), tS = aw(r.rows.map(function (x) { return x.sum; }));
    box.innerHTML = '<table class="detail-table wide"><thead><tr><th>倍频带</th><th>A (dB)</th><th>B (dB)</th>' +
      '<th>叠加 (dB)</th><th>增量 (dB)</th></tr></thead><tbody>' + rows +
      '<tr><td><strong>合计</strong></td><td><strong>' + num(r.totalA, 1) + '</strong></td>' +
      '<td><strong>' + num(r.totalB, 1) + '</strong></td><td><strong>' + num(r.total, 1) +
      '</strong></td><td><strong>' + num(r.increment, 2) + '</strong></td></tr>' +
      '<tr><td>A 计权总级 (dBA)</td><td>' + num(tA, 1) + '</td><td>' + num(tB, 1) + '</td><td>' +
      num(tS, 1) + '</td><td>' + (tA != null && tB != null && tS != null ? num(tS - Math.max(tA, tB), 2) : '—') +
      '</td></tr></tbody></table>';
  }

  // ------------------------------ 面板 2：方法与相干 ------------------------------
  function renderPair() {
    var r = E.pair(state.pair.l1, state.pair.l2);
    var box = $('lvPairResult');
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      drawChart(null);
      return;
    }
    box.innerHTML =
      kv('叠加总声级', num(r.total, 2), 'dB', '能量叠加 10·lg(10^(L₁/10)+10^(L₂/10))') +
      kv('增加值 ΔL', num(r.increment, 2), 'dB', '两声级差 ' + num(r.diff, 2) + ' dB') +
      kv('强的一方', num(r.max, 1), 'dB', esc(r.verdict));
    drawChart(r);
  }

  function drawChart(r) {
    var canvas = $('lvChart');
    if (!canvas || !window.MiniChart) return;
    var curve = E.incrementCurve(20, 0.5);
    var xs = curve.map(function (p) { return p.diff; });
    var vals = curve.map(function (p) { return p.increment; });
    var mark = xs.map(function () { return null; });
    if (r && r.ok) {
      var idx = Math.round(Math.max(0, Math.min(20, r.diff)) / 0.5);
      if (idx < mark.length) mark[idx] = r.increment;
    }
    window.MiniChart.draw(canvas, {
      x: xs,
      yMin: 0,
      yMax: 3.2,
      yTicks: 4,
      yDigits: 1,
      xLabelFmt: function (v) { return String(Math.round(v)); },
      hBands: [{ from: 0, to: 0.5, color: 'rgba(148, 163, 184, 0.14)' }],
      series: [
        { name: 'ΔL', color: '#2563eb', values: vals, width: 2, radius: 2, points: false },
        { name: '当前', color: '#f97316', values: mark, points: true, radius: 4.5, width: 1 }
      ]
    });
  }

  function renderCoherent() {
    var r = E.coherent(state.coh.l1, state.coh.l2, state.coh.phase);
    var box = $('lvCohResult');
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      return;
    }
    if (r.canceled) {
      box.innerHTML =
        kv('相干合成级', '完全抵消', '', '相位差 ' + num(r.phase, 0) + '°、两声级相等') +
        kv('能量叠加（对照）', num(r.energySum, 2), 'dB', '按不相干处理时的总级');
      return;
    }
    var diff = r.value - r.energySum;
    box.innerHTML =
      kv('相干合成级', num(r.value, 2), 'dB', '相位差 ' + num(r.phase, 0) + '°') +
      kv('与能量叠加之差', (diff >= 0 ? '+' : '') + num(diff, 2), 'dB', '能量叠加为 ' + num(r.energySum, 2) + ' dB') +
      kv('相位关系', r.phase % 360 === 0 ? '同相' : (r.phase % 360 === 180 ? '反相' : '部分相干'),
        '', esc(r.note));
  }

  function renderIncTable() {
    var rows = E.INCREMENT_TABLE.map(function (t) {
      return '<tr><td>' + t.diff + '</td><td>' + num(t.increment, 2) + '</td></tr>';
    }).join('');
    $('lvIncTable').innerHTML = '<table class="detail-table wide"><caption>两声级差 Δ (dB) → 叠加后的增加值 (dB)</caption>' +
      '<thead><tr><th>声级差 Δ</th><th>增加值 ΔL</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderEqTable() {
    var rows = '';
    [1, 2, 3, 4, 5, 6, 8, 10, 20, 100].forEach(function (n) {
      rows += '<tr><td>' + n + '</td><td>' + num(10 * Math.log10(n), 2) + '</td></tr>';
    });
    $('lvEqTable').innerHTML = '<table class="detail-table wide"><caption>n 个等声级声源叠加 → 相对单台的增加值 10·lg n</caption>' +
      '<thead><tr><th>台数 n</th><th>增加值 (dB)</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ------------------------------ 面板 3：修正与换算 ------------------------------
  function renderBG() {
    var r = E.subtract(state.bg.total, state.bg.level);
    var box = $('lvBgResult');
    var msg = $('lvBgMsg');
    msg.innerHTML = '';
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      return;
    }
    box.innerHTML =
      kv('被测声源声级', num(r.value, 1), 'dB', '实测总级 ' + num(state.bg.total, 1) + ' − 背景 ' + num(state.bg.level, 1)) +
      kv('背景修正量', num(r.correction, 2), 'dB', '公式值：总级 − 被测源级') +
      kv('按标准取整修正', r.standardCorrection == null ? '不宜修正' : num(r.standardCorrection, 0) + ' dB',
        '', r.rounded == null ? '差值不足 3 dB' : '取整修正后声级 ' + num(r.rounded, 1) + ' dB');
    var cls = r.verdict === 'unusable' ? 'warn' : (r.verdict === 'negligible' ? 'ok' : 'info');
    msg.innerHTML = '<div class="callout ' + cls + '"><span class="dot"></span><span>实测总级与背景相差 ' +
      num(r.diff, 1) + ' dB：' + esc(r.note) + '</span></div>';
  }

  function renderSpl() {
    var r = E.levelToPressure(pf('lvSplIn'));
    var box = $('lvSplResult');
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      return;
    }
    box.innerHTML =
      kv('声压 p', fmtP(r.pa), 'Pa', '参考声压 20 µPa → ' + num(r.upa, 1) + ' µPa') +
      kv('声压比 p/p₀', fmtSci(r.ratio), '', '10^(L/20)');
  }

  function renderPa() {
    var r = E.pressureToLevel(pf('lvPaIn'));
    var box = $('lvPaResult');
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      return;
    }
    box.innerHTML =
      kv('声压级 L', num(r.value, 2), 'dB', '声压 ' + num(pf('lvPaIn'), 4) + ' Pa') +
      kv('声压比 p/p₀', fmtSci(r.ratio), '', '20·lg(p/p₀)');
  }

  function renderDist() {
    var r = E.distanceAttenuation({
      r1: pf('lvR1'), r2: pf('lvR2'), type: $('lvDistType').value
    });
    var box = $('lvDistResult');
    if (!r.ok) {
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      return;
    }
    box.innerHTML =
      kv('衰减量 ΔL', num(r.delta, 2), 'dB', 'r₁ = ' + num(r.r1, 2) + ' m → r₂ = ' + num(r.r2, 2) + ' m') +
      kv('距离加倍衰减', num(r.perDouble, 2), 'dB', r.type === 'line' ? '线声源' : '点声源') +
      kv('距离比 r₂/r₁', num(r.ratio, 2), '×', esc(r.note));
  }

  function renderPw() {
    var q = parseFloat($('lvQ').value) || 2;
    var r = parseFloat($('lvR3').value);
    var a = E.powerToSpl({ lw: pf('lvLw'), r: r, q: q });
    var b = E.splToPower({ lp: pf('lvLp'), r: r, q: q });
    var box = $('lvPwResult');
    if (!a.ok || !b.ok) {
      var err = !a.ok ? a.error : b.error;
      box.innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(err) + '</span></div>';
      return;
    }
    box.innerHTML =
      kv('由 Lw 求 Lp', num(a.lp, 2), 'dB', 'Lw ' + num(a.lw, 1) + ' dB，r = ' + num(a.r, 2) + ' m，Q = ' + q) +
      kv('由 Lp 求 Lw', num(b.lw, 2), 'dB', 'Lp ' + num(b.lp, 1) + ' dB，r = ' + num(b.r, 2) + ' m，Q = ' + q) +
      kv('方向性项 10·lg(Q/4π)', num(a.factor, 2), 'dB', '自由场 −11、半自由场 −8、墙角 −5');
  }

  // ------------------------------ 摘要与导出 ------------------------------
  function summaryText() {
    if (!last) return '';
    var out = ['声压级叠加计算 · 结果摘要'];
    out.push('声源：' + last.rows.map(function (r) {
      return (r.name || '未命名') + ' ' + num(r.level, 1) + ' dB' + (r.count > 1 ? ' ×' + r.count : '');
    }).join('，'));
    out.push('叠加后总声级 = ' + last.total.toFixed(1) + ' dB（比最强单源高 ' + num(last.incrementOverMax, 1) +
      ' dB；能量平均 ' + num(last.average, 1) + ' dB）');
    out.push('贡献占比：' + last.rows.map(function (r) {
      return (r.name || '未命名') + ' ' + num(r.share * 100, 1) + '%' +
        (r.removalDrop == null ? '' : '（撤除后 −' + num(r.removalDrop, 2) + ' dB）');
    }).join('，'));
    var sg = E.requiredReduction(list(), state.target);
    if (sg.ok && !sg.already && sg.feasible && sg.minimal != null) {
      out.push('达标反算：总级降到 ' + num(state.target, 1) + ' dB 需降低 ' + num(sg.needed, 2) +
        ' dB，仅降某一声源最少需 ' + num(sg.minimal, 2) + ' dB');
    }
    out.push('两两叠加示例：' + num(state.pair.l1, 1) + ' + ' + num(state.pair.l2, 1) + ' dB → ' +
      num(E.pair(state.pair.l1, state.pair.l2).total, 2) + ' dB');
    out.push('工具：声学计算工具箱 · 声压级叠加');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rows = [['声压级叠加计算结果', '', '', '', '']];
    rows.push(['声源', '声级 (dB)', '台数', '单独作用级 (dB)', '能量占比 (%)', '撤除后下降 (dB)']);
    last.rows.forEach(function (r) {
      rows.push([r.name || '未命名', num(r.level, 1), r.count, num(r.partial, 2),
        num(r.share * 100, 2), r.removalDrop == null ? '' : num(r.removalDrop, 2)]);
    });
    rows.push([]);
    rows.push(['叠加总声级 (dB)', last.total.toFixed(2)]);
    rows.push(['比最强单源高 (dB)', num(last.incrementOverMax, 2)]);
    rows.push(['能量平均级 (dB)', num(last.average, 2)]);
    rows.push(['声源数 / 总台数', last.count + ' / ' + last.totalCount]);
    var sg = E.requiredReduction(list(), state.target);
    if (sg.ok) {
      rows.push(['目标声级 (dB)', num(state.target, 1)]);
      rows.push(['需降低 (dB)', sg.already ? 0 : num(sg.needed, 2)]);
      sg.rows.forEach(function (r) {
        rows.push(['降噪需求 — ' + (r.name || '未命名'), r.need == null ? '不可行' : num(r.need, 2)]);
      });
    }
    download(rows, 'levels-sum-result.csv');
  }

  function download(rows, filename) {
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(txt, id) {
    if (!txt) { flash(id, '暂无可复制结果'); return; }
    window.Util.copyText(txt, function () { flash(id, '已复制'); }, function () { alert('复制失败，请手动选择文本。'); });
  }
  
  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  // ------------------------------ 面板切换 ------------------------------
  function setPanel(name) {
    state.panel = name;
    Array.prototype.forEach.call(document.querySelectorAll('.lv-panel'), function (p) {
      p.hidden = p.getAttribute('data-panel') !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn[data-panel]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-panel') === name);
    });
    if (name === 'method') drawChart(E.pair(state.pair.l1, state.pair.l2));
    if (name === 'sum') renderSpectrum();
  }

  function init() {
    if (inited) return;
    inited = true;

    // 声源列表
    renderRows();
    $('lvAdd').addEventListener('click', addRow);
    $('lvClear').addEventListener('click', function () {
      state.rows = [{ name: '', level: null, count: 1 }];
      renderRows();
      recalcSum();
    });
    $('lvPreset').innerHTML = '<option value="">载入示例…</option>' + PRESETS.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    $('lvPreset').addEventListener('change', function () {
      var id = this.value;
      this.value = '';
      if (!id) return;
      PRESETS.forEach(function (p) {
        if (p.id !== id) return;
        state.rows = p.rows.map(function (r) { return { name: r.name, level: r.level, count: r.count }; });
      });
      renderRows();
      recalcSum();
    });

    // 等声级声源
    ['lvEqLevel', 'lvEqCount'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if (id === 'lvEqLevel') {
          var v = parseFloat(this.value);
          state.eq.level = isFinite(v) ? v : null;
        } else {
          var n = parseInt(this.value, 10);
          state.eq.count = isFinite(n) && n > 0 ? n : 1;
        }
        renderEqual();
      });
    });

    // 频带谱
    $('lvSpecA').value = SPECTRUM_A;
    $('lvSpecB').value = SPECTRUM_B;
    state.specA = parseSpec(SPECTRUM_A);
    state.specB = parseSpec(SPECTRUM_B);
    function readSpec() {
      state.specA = parseSpec($('lvSpecA').value);
      state.specB = parseSpec($('lvSpecB').value);
      renderSpectrum();
    }
    $('lvSpecA').addEventListener('input', readSpec);
    $('lvSpecB').addEventListener('input', readSpec);
    $('lvSpecCalc').addEventListener('click', readSpec);

    // 达标目标
    $('lvTarget').addEventListener('input', function () {
      var v = parseFloat(this.value);
      state.target = isFinite(v) ? v : null;
      if (state.target == null) {
        $('lvTargetResult').innerHTML =
          '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>请输入目标声级</span></div>';
        return;
      }
      renderSuggest();
    });

    // 两两叠加
    ['lvPairL1', 'lvPairL2'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        var v = parseFloat(this.value);
        if (id === 'lvPairL1') state.pair.l1 = isFinite(v) ? v : null;
        else state.pair.l2 = isFinite(v) ? v : null;
        renderPair();
      });
    });

    // 相干叠加
    function syncPhase(v) {
      state.coh.phase = v;
      $('lvCohPhase').value = v;
      $('lvCohRange').value = v;
      renderCoherent();
    }
    ['lvCohL1', 'lvCohL2'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        var v = parseFloat(this.value);
        if (id === 'lvCohL1') state.coh.l1 = isFinite(v) ? v : null;
        else state.coh.l2 = isFinite(v) ? v : null;
        renderCoherent();
      });
    });
    $('lvCohPhase').addEventListener('input', function () {
      var v = parseFloat(this.value);
      if (!isFinite(v)) return;
      state.coh.phase = v;
      $('lvCohRange').value = Math.max(0, Math.min(360, v));
      renderCoherent();
    });
    $('lvCohRange').addEventListener('input', function () { syncPhase(parseFloat(this.value)); });
    Array.prototype.forEach.call(document.querySelectorAll('.phase-presets .btn'), function (b) {
      b.addEventListener('click', function () { syncPhase(parseFloat(b.getAttribute('data-phase'))); });
    });

    // 背景修正
    [['lvBgTotal', 'total'], ['lvBgLevel', 'level']].forEach(function (p) {
      $(p[0]).addEventListener('input', function () {
        var v = parseFloat(this.value);
        state.bg[p[1]] = isFinite(v) ? v : null;
        renderBG();
      });
    });

    // 声压换算
    $('lvSplIn').addEventListener('input', renderSpl);
    $('lvPaIn').addEventListener('input', renderPa);

    // 距离衰减与声功率
    ['lvR1', 'lvR2'].forEach(function (id) { $(id).addEventListener('input', renderDist); });
    $('lvDistType').addEventListener('change', renderDist);
    ['lvLw', 'lvLp', 'lvR3'].forEach(function (id) { $(id).addEventListener('input', renderPw); });
    $('lvQ').addEventListener('change', renderPw);

    // 工具条
    $('lvCopy').addEventListener('click', function () { copyText(summaryText(), 'lvCopyMsg'); });
    $('lvCsv').addEventListener('click', exportCsv);

    // 面板切换
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn[data-panel]'), function (b) {
      b.addEventListener('click', function () { setPanel(b.getAttribute('data-panel')); });
    });

    renderIncTable();
    renderEqTable();
    setPanel('sum');
    recalcAll();

    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var v = $('view-levels');
        if (v && v.classList.contains('active') && state.panel === 'method') {
          drawChart(E.pair(state.pair.l1, state.pair.l2));
        }
      }, 160);
    });
  }

  function recalcAll() {
    recalcSum();
    renderEqual();
    renderPair();
    renderCoherent();
    renderSpectrum();
    renderBG();
    renderSpl();
    renderPa();
    renderDist();
    renderPw();
  }

  function onShow() {
    recalcAll();
    if (state.panel === 'method') drawChart(E.pair(state.pair.l1, state.pair.l2));
  }

  window.LevelsView = { init: init, onShow: onShow, setPanel: setPanel };
})();
