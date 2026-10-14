/*
 * app.js — 声学计算器前端交互
 */
(function () {
  'use strict';
  var A = window.Acoustics;
  var BANDS = A.BANDS;
  var SAMPLE = [58, 52, 45, 40, 36, 33, 30, 28, 26];

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d == null ? 1 : d);
  }

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

  function readLevels() {
    return BANDS.map(function (f, i) {
      var v = parseFloat($('band-' + i).value);
      return isNaN(v) ? null : v;
    });
  }

  function fillSample() {
    BANDS.forEach(function (f, i) { $('band-' + i).value = SAMPLE[i]; });
    calculate();
  }
  function clearAll() {
    BANDS.forEach(function (f, i) { $('band-' + i).value = ''; });
    $('results').style.display = 'none';
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
    var clsLabel = { N: '中性 Neutral', R: '低频隆隆 Rumble', H: '高频嘶声 Hiss', RH: '隆隆 + 嘶声' };
    $('resRC').innerHTML =
      '<div class="big">RC ' + (rc.rc != null ? rc.rc : '—') + ' (' + rc.classification + ')</div>' +
      '<div class="sub">' + (clsLabel[rc.classification] || '') +
      ' &nbsp;·&nbsp; LMF ' + fmt(rc.lmf) + ' dB' +
      (rc.rv ? ' &nbsp;·&nbsp; <span class="warn">⚠ 31.5 Hz &gt; 75 dB 疑似振动风险</span>' : '') + '</div>';

    $('results').style.display = 'grid';
    drawChart(levels, nc.value, nr.value, rc.ref);
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
    $('btnCalc').addEventListener('click', calculate);
    $('btnSample').addEventListener('click', fillSample);
    $('btnClear').addEventListener('click', clearAll);
    fillSample();
  });
})();
