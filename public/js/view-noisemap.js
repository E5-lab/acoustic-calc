/*
 * view-noisemap.js — 环境噪声进阶 视图（#/noisemap）
 * 依赖 window.NoiseMap（内核）与 window.Env（ISO 9613 传播 / 交通噪声）。
 *
 * 三个子计算器：
 *   1) 噪声等值线图：多点声源网格声压级 + marching squares 等值线，可导出 PNG
 *   2) 道路交通噪声：线声源模型（Env.roadTraffic）
 *   3) 限值达标判定：GB 3096 功能区 / GB 55016 室内限值
 */
(function () {
  'use strict';
  var NM = window.NoiseMap;
  var Env = window.Env;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }
  function toNums(s) { return (s || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); }); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  // ------------------------------ 等值线图绘制 ------------------------------
  function levelColor(lp, lo, hi) {
    if (lp == null) return 'rgba(120,120,120,0.55)';
    var t = Math.max(0, Math.min(1, (lp - lo) / (hi - lo)));
    var stops = [
      [0.00, [40, 70, 180]], [0.25, [40, 175, 175]], [0.50, [70, 195, 85]],
      [0.72, [240, 205, 60]], [1.00, [225, 60, 50]]
    ];
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        var k = (t - a[0]) / (b[0] - a[0]);
        return 'rgb(' + Math.round(a[1][0] + (b[1][0] - a[1][0]) * k) + ',' +
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * k) + ',' +
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * k) + ')';
      }
    }
    return 'rgb(225,60,50)';
  }

  function drawMap(res, sources) {
    var cv = $('nmCanvas');
    var ctx = cv.getContext('2d');
    var spanX = res.x1 - res.x0, spanY = res.y1 - res.y0;
    var W = 760, H = Math.round(W * spanY / spanX);
    if (H < 200) H = 200;
    if (H > 520) H = 520;
    cv.width = W; cv.height = H;
    ctx.clearRect(0, 0, W, H);

    var lo = 30, hi = Math.max(60, Math.ceil(res.max / 5) * 5);
    var cw = W / res.cols, ch = H / res.rows;

    // 网格热力图
    for (var j = 0; j < res.rows; j++) {
      for (var i = 0; i < res.cols; i++) {
        var lp = res.grid[j][i];
        ctx.fillStyle = levelColor(lp, lo, hi);
        ctx.fillRect(i * cw, (res.rows - 1 - j) * ch, cw + 1, ch + 1);
      }
    }

    // 等值线（5 dB 间隔）
    var levels = [];
    for (var lv = Math.ceil(res.min / 5) * 5; lv <= Math.floor(res.max / 5) * 5; lv += 5) levels.push(lv);
    if (levels.length > 8) levels = levels.slice(levels.length - 8);
    var cs = NM.contours({
      grid: res.grid, cols: res.cols, rows: res.rows,
      x0: res.x0, x1: res.x1, y0: res.y0, y1: res.y1, levels: levels
    });
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    levels.forEach(function (lv) {
      (cs[lv] || []).forEach(function (s) {
        var x1 = (s.x1 - res.x0) / spanX * W, y1 = (res.y1 - s.y1) / spanY * H;
        var x2 = (s.x2 - res.x0) / spanX * W, y2 = (res.y1 - s.y2) / spanY * H;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      });
    });

    // 声源标记
    sources.forEach(function (s, idx) {
      var x = (s.x - res.x0) / spanX * W, y = (res.y1 - s.y) / spanY * H;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d93025';
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2.5;
      ctx.strokeText('S' + (idx + 1), x, y - 12);
      ctx.fillText('S' + (idx + 1), x, y - 12);
    });

    // 图例
    var lgW = 150, lgH = 10, lgX = W - lgW - 14, lgY = 12;
    for (var i = 0; i <= 60; i++) {
      ctx.fillStyle = levelColor(lo + (hi - lo) * i / 60, lo, hi);
      ctx.fillRect(lgX + lgW * i / 60, lgY, lgW / 60 + 1, lgH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeRect(lgX, lgY, lgW, lgH);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(hi + ' dB(A)', lgX + lgW, lgY + lgH + 3);
    ctx.textAlign = 'left';
    ctx.fillText(lo + ' dB(A)', lgX, lgY + lgH + 3);
  }

  function init() {
    if (init._d) return; init._d = true;

    /* 1) 噪声等值线图 */
    $('nmMapBtn').addEventListener('click', function () {
      var sources = [];
      for (var k = 1; k <= 3; k++) {
        var lw = toNums($('nmS' + k + 'Lw').value);
        if (lw.length >= 6 && pf($('nmS' + k + 'X').value) != null) {
          sources.push({
            x: pf($('nmS' + k + 'X').value), y: pf($('nmS' + k + 'Y').value),
            hs: pf($('nmS' + k + 'H').value) != null ? pf($('nmS' + k + 'H').value) : 1.5,
            spectrum: { 125: lw[0], 250: lw[1], 500: lw[2], 1000: lw[3], 2000: lw[4], 4000: lw[5] }
          });
        }
      }
      if (!sources.length) { show($('nmMapInfo'), '请至少填写 1 号声源的坐标与 6 频带声功率谱', 'warn'); return; }
      var res = NM.gridLevels({
        sources: sources,
        x0: $('nmX0').value, x1: $('nmX1').value, y0: $('nmY0').value, y1: $('nmY1').value,
        cols: pf($('nmCols').value) || 48, rows: pf($('nmRows').value) || 32,
        hr: 1.5, ground: $('nmGround').value, Tc: $('nmTc').value, rh: $('nmRh').value
      });
      if (!res.ok) { show($('nmMapInfo'), '计算失败：' + res.error, 'warn'); return; }
      drawMap(res, sources);
      var dx = (res.x1 - res.x0) / (res.cols - 1);
      show($('nmMapInfo'),
        '计算范围 ' + res.x0 + ' ~ ' + res.x1 + ' m × ' + res.y0 + ' ~ ' + res.y1 + ' m，网格 ' + res.cols + '×' + res.rows +
        '（≈ ' + fmt(dx, 1) + ' m/格）　最高 <b>' + fmt(res.max, 1) + '</b> dB(A)，最低 ' + fmt(res.min, 1) + ' dB(A)，均值 ' + fmt(res.mean, 1) + ' dB(A)',
        'ok');
      $('nmDlBtn').hidden = false;
    });

    /* 导出 PNG */
    $('nmDlBtn').addEventListener('click', function () {
      var cv = $('nmCanvas');
      if (cv.toBlob) {
        cv.toBlob(function (b) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = 'noise-map.png';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        }, 'image/png');
      }
    });

    /* 2) 道路交通噪声 */
    $('tnBtn').addEventListener('click', function () {
      var q = pf($('tnQ').value), v = pf($('tnV').value), r = pf($('tnR').value);
      if (!q || !v || !r) { show($('tnOut'), '请填写车流量、车速与受声点距离', 'warn'); return; }
      var c = pf($('tnCar').value), t = pf($('tnTruck').value), b = pf($('tnBus').value);
      var mix = { car: c == null ? 0.7 : c / 100, truck: t == null ? 0.2 : t / 100, bus: b == null ? 0.1 : b / 100 };
      var res = Env.roadTraffic(q, v, r, { mix: mix, ground: $('tnGround').value, Tc: $('tnTc').value, rh: $('tnRh').value });
      if (!res) { show($('tnOut'), '计算失败，请检查输入', 'warn'); return; }
      show($('tnOut'),
        '受声点 A 声级 <b>' + fmt(res.LpA, 1) + ' dB(A)</b>（' + fmt(q, 0) + ' 辆/h，' + fmt(v, 0) + ' km/h，距路中 ' + fmt(r, 1) + ' m）' +
        '<br><span class="muted">加权单车声功率 ' + fmt(res.LwVeh, 1) + ' dB · 线声源功率级 ' + fmt(res.LwLine, 1) + ' dB/m　' +
        '发散 ' + fmt(res.Adiv, 1) + ' + 大气 ' + fmt(res.Aatm, 1) + ' + 地面 ' + fmt(res.Agr, 1) + ' dB</span>',
        'ok');
    });

    /* 3) 限值达标判定 */
    function refreshKeys() {
      var t = $('nmTable').value;
      var sel = $('nmKey');
      sel.innerHTML = '';
      NM.TABLES[t].rows.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r.key; o.textContent = r.name;
        sel.appendChild(o);
      });
      $('nmRelaxRow').style.display = NM.TABLES[t].relaxNote ? '' : 'none';
    }
    $('nmTable').addEventListener('change', refreshKeys);
    refreshKeys();

    $('nmChkBtn').addEventListener('click', function () {
      var r = NM.checkLimit({
        table: $('nmTable').value, key: $('nmKey').value,
        period: $('nmPeriod').value, leq: $('nmLeq').value,
        relax5: $('nmRelax').checked
      });
      if (!r.ok) { show($('nmChkOut'), '计算失败：' + r.error, 'warn'); return; }
      show($('nmChkOut'),
        r.standard + '<br>' + r.row.name + '（' + (r.period === 'night' ? '夜间' : '昼间') + '）限值 <b>' + r.limit + ' dB(A)</b>' +
        (r.relaxed ? '（含 2/3/4 类区放宽 5 dB）' : '') +
        '<br>实测 / 预测 LAeq = ' + fmt(r.leq, 1) + ' dB(A)　' +
        (r.pass ? '<b>达标</b>，余量 ' + fmt(r.margin, 1) + ' dB' : '<b>超标 ' + fmt(-r.margin, 1) + ' dB</b>，需采取措施'),
        r.pass ? 'ok' : 'warn');
    });
  }

  window.NoiseMapView = { init: init, onShow: function () {} };
})();
