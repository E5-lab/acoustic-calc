/*
 * app.js — 声学计算器前端交互
 */
(function () {
  'use strict';
  var A = window.Acoustics;
  var BANDS = A.BANDS;

  // 示例频谱（31.5–8000 Hz 共 9 带）
  var SAMPLES = [
    { name: '典型办公室实测', levels: [58, 52, 45, 40, 36, 33, 30, 28, 26] },
    { name: '安静卧室', levels: [55, 46, 38, 31, 27, 24, 22, 20, 18] },
    { name: '会议室', levels: [57, 48, 41, 35, 31, 29, 28, 27, 25] },
    { name: '中性频谱（N 判定示例）', levels: [55, 50, 45, 40, 35, 30, 25, 20, 15] },
    { name: '低频隆隆（R 判定示例）', levels: [62, 60, 56, 52, 35, 30, 25, 20, 15] },
    { name: '高频嘶声（H 判定示例）', levels: [55, 50, 45, 40, 35, 30, 25, 30, 25] }
  ];
  var DEFAULT_SAMPLE = 0;
  var DEFAULT_ROOM = 'private';

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d == null ? 1 : d);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var lastResult = null;

  function buildGrid() {
    var grid = $('bandGrid');
    grid.innerHTML = '';
    BANDS.forEach(function (f, i) {
      var cell = document.createElement('div');
      cell.className = 'band-cell';
      var label = document.createElement('label');
      label.textContent = f + ' Hz';
      label.setAttribute('for', 'band-' + i);
      var input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.id = 'band-' + i;
      input.placeholder = 'dB';
      cell.appendChild(label);
      cell.appendChild(input);
      grid.appendChild(cell);
    });
  }

  function buildSampleOptions() {
    var sel = $('sampleSelect');
    SAMPLES.forEach(function (s, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  }

  function buildRoomOptions() {
    var sel = $('roomSelect');
    A.ROOM_TARGETS.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name + '（目标 NC ' + t.nc[0] + '–' + t.nc[1] + '）';
      sel.appendChild(opt);
    });
  }

  function readLevels() {
    return BANDS.map(function (f, i) {
      var v = parseFloat($('band-' + i).value);
      return isNaN(v) ? null : v;
    });
  }

  function writeLevels(levels) {
    BANDS.forEach(function (f, i) {
      var v = levels[i];
      $('band-' + i).value = (v == null || isNaN(v)) ? '' : (Math.round(v * 10) / 10);
    });
  }

  function clearAll() {
    BANDS.forEach(function (f, i) { $('band-' + i).value = ''; });
    $('results').style.display = 'none';
    $('exportRow').style.display = 'none';
    lastResult = null;
    renderTarget();
  }

  function calculate() {
    var levels = readLevels();
    if (!levels.some(function (v) { return v != null; })) {
      alert('请至少输入一个倍频带的声压级。');
      return;
    }
    var a = A.aWeighted(levels);
    var nc = A.ncRating(levels);
    var nr = A.nrRating(levels);
    var rc = A.rcRating(levels);

    $('resA').innerHTML =
      '<div class="big">' + fmt(a.LA) + ' <span class="unit">dBA</span></div>' +
      '<div class="sub">线性(未计权) ' + fmt(a.Llin) + ' dB &nbsp;·&nbsp; SIL ' + fmt(a.sil) + ' dB</div>';
    $('resNC').innerHTML =
      '<div class="big">NC ' + fmt(nc.value) + '</div>' +
      '<div class="sub">标准标号 NC-' + (nc.designation != null ? nc.designation : '—') +
      ' &nbsp;·&nbsp; 控制带 ' + (nc.controllingBand != null ? nc.controllingBand + ' Hz' : '—') + '</div>';
    $('resNR').innerHTML =
      '<div class="big">NR ' + fmt(nr.value) + '</div>' +
      '<div class="sub">标准标号 NR-' + (nr.designation != null ? nr.designation : '—') +
      ' &nbsp;·&nbsp; 控制带 ' + (nr.controllingBand != null ? nr.controllingBand + ' Hz' : '—') + '</div>';

    var clsLabel = A.RC_CLASS_LABEL;
    $('resRC').innerHTML =
      '<div class="big">RC ' + (rc.rc != null ? rc.rc : '—') + ' (' + rc.classification + ')</div>' +
      '<div class="sub">' + (clsLabel[rc.classification] || '') +
      ' &nbsp;·&nbsp; LMF ' + fmt(rc.lmf) + ' dB' +
      (rc.rv ? ' &nbsp;·&nbsp; <span class="warn">⚠ 31.5 Hz &gt; 75 dB 疑似振动风险</span>' : '') +
      '</div>' + rcDetailTable(rc);

    $('results').style.display = 'grid';
    $('exportRow').style.display = 'flex';
    lastResult = { levels: levels, a: a, nc: nc, nr: nr, rc: rc };
    renderTarget();
    drawChart(levels, nc.value, nr.value, rc.ref);
  }

  // RC 各带超出参考曲线明细
  function rcDetailTable(rc) {
    var rows = [];
    [500, 250, 125, 63, 31.5, 2000, 4000, 8000].forEach(function (f) {
      var d = null;
      rc.details.forEach(function (x) { if (x.band === f) d = x; });
      if (!d) return;
      var limit = (f <= 500) ? 5 : 3;
      var over = d.excess > limit;
      rows.push('<tr><td>' + f + ' Hz</td><td' + (over ? ' class="over"' : '') + '>' +
        (d.excess >= 0 ? '+' : '') + d.excess.toFixed(1) + '</td><td>' + limit + '</td></tr>');
    });
    return '<table class="detail-table"><thead><tr><th>频带</th><th>超出参考</th><th>限值</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table>';
  }

  // 房间目标值对照
  function renderTarget() {
    var box = $('targetResult');
    if (!lastResult) { box.innerHTML = ''; return; }
    var sel = $('roomSelect').value;
    var target = A.findTarget(sel) || A.ROOM_TARGETS[0];
    var ev = A.evaluateTarget(target, { nc: lastResult.nc.value, rc: lastResult.rc.rc });

    var verdictText = { pass: '✔ 达标', fail: '✘ 超标', na: '数据不足' };
    function item(label, r, unit) {
      var cls = r.status === 'pass' ? 'pass' : (r.status === 'fail' ? 'fail' : '');
      var sub = r.status === 'na' ? '未测得该指标'
        : (r.status === 'pass' ? '目标 ≤ ' + r.target[1] + unit
           : '超出 ' + r.margin.toFixed(1) + unit + '（目标 ≤ ' + r.target[1] + unit + '）');
      return '<div class="target-item ' + cls + '">' +
        '<div class="t-label">' + label + '（目标 ' + r.target[0] + '–' + r.target[1] + '）</div>' +
        '<div class="t-value">' + (r.value == null ? '—' : fmt(r.value, label.indexOf('RC') === 0 ? 0 : 1)) +
        (r.value == null ? '' : ' <span class="unit">' + unit + '</span>') + '</div>' +
        '<div class="t-sub">' + sub + '</div></div>';
    }

    box.innerHTML =
      '<div class="verdict ' + ev.overall + '">' + (verdictText[ev.overall] || '') +
      '（以 ' + ev.basedOn + ' 判定）</div>' +
      item('NC 目标', ev.nc, '') +
      item('RC 目标', ev.rc, '') +
      '<div class="target-note">判定标准：实测值 ≤ 目标上限即达标。' +
      (target.note ? '该用途备注：' + esc(target.note) + '。' : '') +
      '目标值仅供工程参考，正式验收以合同/规范目标为准。</div>';
  }

  // 生成可复制的文本摘要
  function summaryText() {
    if (!lastResult) return '';
    var r = lastResult, L = r.levels;
    var lines = [];
    lines.push('声学计算器 · 结果摘要');
    lines.push('测量频谱 (dB)：' + BANDS.map(function (f, i) {
      return f + 'Hz=' + (L[i] == null ? '—' : L[i]);
    }).join(', '));
    lines.push('A 声级：' + fmt(r.a.LA) + ' dBA（线性 ' + fmt(r.a.Llin) + ' dB，SIL ' + fmt(r.a.sil) + ' dB）');
    lines.push('NC：' + fmt(r.nc.value) + '（NC-' + r.nc.designation + '，控制带 ' +
      (r.nc.controllingBand != null ? r.nc.controllingBand + 'Hz' : '—') + '）');
    lines.push('NR：' + fmt(r.nr.value) + '（NR-' + r.nr.designation + '，控制带 ' +
      (r.nr.controllingBand != null ? r.nr.controllingBand + 'Hz' : '—') + '）');
    lines.push('RC：' + r.rc.rc + ' (' + r.rc.classification + ')，LMF ' + fmt(r.rc.lmf) + ' dB' +
      (r.rc.rv ? '，31.5Hz 振动风险' : ''));
    return lines.join('\n');
  }

  function copySummary() {
    var txt = summaryText();
    if (!txt) return;
    var done = function () { flash('copyMsg', '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
    } else {
      fallbackCopy(txt, done);
    }
  }
  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动选择文本。'); }
    document.body.removeChild(ta);
  }
  function flash(id, msg) {
    var el = $(id);
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function exportCsv() {
    if (!lastResult) return;
    var r = lastResult;
    var rows = [];
    rows.push(['项目', '值', '单位/备注']);
    rows.push(['A 声级', fmt(r.a.LA, 2), 'dBA']);
    rows.push(['线性声级', fmt(r.a.Llin, 2), 'dB']);
    rows.push(['SIL', fmt(r.a.sil, 2), 'dB']);
    rows.push(['NC', fmt(r.nc.value, 2), 'NC-' + r.nc.designation]);
    rows.push(['NR', fmt(r.nr.value, 2), 'NR-' + r.nr.designation]);
    rows.push(['RC', r.rc.rc, 'RC ' + r.rc.classification]);
    rows.push([]);
    rows.push(['频率(Hz)', '实测(dB)', 'RC参考(dB)', '超出(dB)']);
    BANDS.forEach(function (f, i) {
      rows.push([f,
        r.levels[i] == null ? '' : r.levels[i],
        fmt(r.rc.ref[i], 2),
        (r.levels[i] == null ? '' : fmt(r.levels[i] - r.rc.ref[i], 2))]);
    });
    var csv = '\ufeff' + rows.map(function (row) {
      return row.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'acoustic-result.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // 多测点能量平均
  function applyAverage() {
    var raw = $('avgInput').value || '';
    var rows = raw.split(/\r?\n/).map(function (line) {
      var nums = line.trim().split(/[\s,;\t]+/).filter(function (s) { return s !== ''; })
        .map(function (s) { return parseFloat(s); });
      return nums.filter(function (v) { return !isNaN(v); });
    }).filter(function (r) { return r.length > 0; });

    if (!rows.length) { flash('avgMsg', '请先粘贴频谱数据'); return; }
    var bad = rows.some(function (r) { return r.length !== BANDS.length; });
    if (bad) {
      flash('avgMsg', '每行需 ' + BANDS.length + ' 个数（当前行数 ' + rows.length + '）');
      return;
    }
    var avg = A.energyAverage(rows);
    writeLevels(avg);
    flash('avgMsg', '已按 ' + rows.length + ' 个测点能量平均');
    calculate();
  }

  // 生成某 NC/NR 曲线在给定指数 n 处的值（BANDS 对齐）
  function curveAt(table, bands, n) {
    return BANDS.map(function (f) {
      var bi = bands.indexOf(f);
      if (bi < 0) return null;
      var pts = table.map(function (t) { return { n: t.n, v: t.vals[bi] }; })
                     .sort(function (a, b) { return a.n - b.n; });
      if (n <= pts[0].n) {
        var p1 = pts[0], p2 = pts[1];
        return p1.v + (n - p1.n) * (p2.v - p1.v) / (p2.n - p1.n);
      }
      var last = pts.length - 1;
      if (n >= pts[last].n) {
        var q1 = pts[last - 1], q2 = pts[last];
        return q1.v + (n - q1.n) * (q2.v - q1.v) / (q2.n - q1.n);
      }
      for (var j = 0; j < pts.length - 1; j++) {
        var a1 = pts[j], b1 = pts[j + 1];
        if (n >= Math.min(a1.n, b1.n) && n <= Math.max(a1.n, b1.n)) {
          return a1.v + (n - a1.n) * (b1.v - a1.v) / (b1.n - a1.n);
        }
      }
      return null;
    });
  }

  function drawChart(measured, ncVal, nrVal, rcRef) {
    var canvas = $('chart');
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var m = { l: 44, r: 12, t: 16, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var yMin = 0, yMax = 100;
    function X(i) { return m.l + (i / (BANDS.length - 1)) * pw; }
    function Y(v) { return m.t + (1 - (v - yMin) / (yMax - yMin)) * ph; }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#e3e8ef';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui, sans-serif';
    [0, 20, 40, 60, 80, 100].forEach(function (db) {
      var y = Y(db);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(W - m.r, y); ctx.stroke();
      ctx.fillText(db.toString(), 10, y + 3);
    });
    BANDS.forEach(function (f, i) {
      var x = X(i);
      ctx.strokeStyle = '#eef1f5';
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
      ctx.fillStyle = '#6b7280';
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : f, x - 9, H - 12);
    });

    function plot(arr, color, dash, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 2;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      var started = false;
      arr.forEach(function (v, i) {
        if (v == null || isNaN(v)) { started = false; return; }
        var x = X(i), y = Y(Math.max(yMin, Math.min(yMax, v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      arr.forEach(function (v, i) {
        if (v == null || isNaN(v)) return;
        var x = X(i), y = Y(Math.max(yMin, Math.min(yMax, v)));
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      });
    }

    if (rcRef) plot(rcRef, '#8b5cf6', [6, 4], 2);
    if (ncVal != null) plot(curveAt(A.NC_TABLE, A.NC_BANDS, ncVal), '#f59e0b', [6, 4], 2);
    if (nrVal != null) plot(curveAt(A.NR_TABLE, A.NR_BANDS, nrVal), '#10b981', [6, 4], 2);
    plot(measured, '#2563eb', [], 2.5);

    var lx = m.l + 8, ly = m.t + 8;
    ctx.font = '11px system-ui, sans-serif';
    var items = [['#2563eb', '实测频谱'], ['#f59e0b', 'NC 曲线'], ['#10b981', 'NR 曲线'], ['#8b5cf6', 'RC 曲线']];
    items.forEach(function (it, idx) {
      var yy = ly + idx * 15;
      ctx.fillStyle = it[0]; ctx.fillRect(lx, yy - 8, 14, 3);
      ctx.fillStyle = '#374151'; ctx.fillText(it[1], lx + 20, yy - 3);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildGrid();
    buildSampleOptions();
    buildRoomOptions();
    $('roomSelect').value = DEFAULT_ROOM;
    $('btnCalc').addEventListener('click', calculate);
    $('sampleSelect').addEventListener('change', function () {
      var i = parseInt(this.value, 10);
      if (isNaN(i)) return;
      writeLevels(SAMPLES[i].levels);
      this.value = '';
      calculate();
    });
    $('btnClear').addEventListener('click', clearAll);
    $('btnAvg').addEventListener('click', applyAverage);
    $('btnCopy').addEventListener('click', copySummary);
    $('btnCsv').addEventListener('click', exportCsv);
    $('roomSelect').addEventListener('change', renderTarget);
    writeLevels(SAMPLES[DEFAULT_SAMPLE].levels);
    calculate();
  });
})();
