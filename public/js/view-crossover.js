/*
 * view-crossover.js — 扬声器分频器设计 视图（#/crossover）
 * 依赖 window.Crossover（内核）、window.MiniChart（曲线）。
 *
 * 五个子计算器：
 *   1) 分频器元件值设计（1~4 阶 + 二阶 Q 预设）+ 逐频响应曲线
 *   2) 阻抗补偿 Zobel 网络
 *   3) L-pad 衰减器
 *   4) 单元灵敏度匹配
 *   5) 由实测元件值反算分频频率
 */
(function () {
  'use strict';
  var C = window.Crossover;
  var Chart = window.MiniChart;

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) {
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function cssVar(n, f) {
    var v = window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue(n) : '';
    v = (v || '').trim();
    return v || f;
  }

  var lastDesign = null;

  function typeOptions() {
    var sel = $('xoType');
    sel.innerHTML = C.Q_PRESETS.map(function (p) {
      return '<option value="' + p.id + '">' + p.name + '</option>';
    }).join('') + '<option value="custom">自定义 Q…</option>';
  }
  function syncTypeRow() {
    var order = Number($('xoOrder').value);
    $('xoTypeRow').style.display = order === 2 ? '' : 'none';
    $('xoQRow').style.display = (order === 2 && $('xoType').value === 'custom') ? '' : 'none';
    $('xoO4Row').style.display = order === 4 ? '' : 'none';
  }
  function syncOrder() { syncTypeRow(); }

  function drawCrossover(d) {
    if (!Chart) return;
    var lo = d.fc / 20, hi = d.fc * 20, n = 140;
    var xs = [], lp = [], hp = [], sum = [];
    for (var i = 0; i <= n; i++) {
      var f = lo * Math.pow(hi / lo, i / n);
      var r = C.response(d, f);
      xs.push(f); lp.push(r.lp); hp.push(r.hp); sum.push(r.sum);
    }
    Chart.draw($('xoChart'), {
      x: xs, xLog: true, yMin: -36, yMax: 6, yDigits: 0,
      xLabelFmt: function (v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)); },
      hBands: [{ from: -3, to: 6, color: 'rgba(148,163,184,0.10)' }],
      series: [
        { values: sum, color: cssVar('--primary', '#2563eb'), width: 2.4, points: false },
        { values: lp, color: '#f97316', width: 1.6, points: false, dash: [5, 4] },
        { values: hp, color: '#0d9488', width: 1.6, points: false, dash: [5, 4] }
      ]
    });
  }

  function init() {
    if (init._d) return; init._d = true;

    typeOptions();
    $('xoOrder').addEventListener('change', syncOrder);
    $('xoType').addEventListener('change', syncTypeRow);
    syncOrder();

    /* ---------------- 1) 元件值设计 ---------------- */
    $('xoBtn').addEventListener('click', function () {
      var order = Number($('xoOrder').value);
      var type = order === 4 ? $('xoO4Type').value : $('xoType').value;
      var d = C.design({
        order: order, type: type, fc: pf($('xoFc').value), Z: pf($('xoZ').value),
        q: pf($('xoQ').value)
      });
      if (!d.ok) { show($('xoOut'), '计算失败：' + d.error, 'warn'); return; }
      lastDesign = d;

      var rows = d.components.map(function (c) {
        return '<span class="xo-chip"><b>' + c.label + '</b> ' + fmt(c.value, 3) + ' ' + c.unit + '</span>';
      }).join('');
      var rs = C.sweep(d, { n: 140 });
      var mid = rs.filter(function (p) { return p && Math.abs(Math.log(p.f / d.fc)) < 0.01; })[0];
      var sumAtFc = mid ? mid.sum : C.response(d, d.fc).sum;

      show($('xoOut'),
        '<b>' + d.label + '</b>　分频点 ' + fmt(d.fc, 0) + ' Hz，负载 ' + fmt(d.Z, 1) + ' Ω' +
        '<br>' + rows +
        '<br>分频点合成响应：低通 ' + fmt(C.response(d, d.fc).lp, 2) + ' dB / 高通 ' +
        fmt(C.response(d, d.fc).hp, 2) + ' dB → 合成 <b>' + fmt(sumAtFc, 2) + ' dB</b>' +
        '<br>极性：<b>' + (d.order === 2 ? '必须反接一路' : d.order === 4 ? '无需反接' : '无需反接（但两路相差 90°）') + '</b>' +
        '<br><span class="muted">' + d.note + '</span>', 'ok');
      drawCrossover(d);
    });

    /* ---------------- 2) Zobel 阻抗补偿 ---------------- */
    $('xoZBtn').addEventListener('click', function () {
      var z = C.zobel({ Re: pf($('xoZRe').value), Le: pf($('xoZLe').value), k: pf($('xoZK').value) });
      if (!z) { show($('xoZOut'), '请填写 Re 与音圈电感 Le', 'warn'); return; }
      show($('xoZOut'),
        '补偿网络：<b>' + fmt(z.Rz, 2) + ' Ω 串联 ' + fmt(z.Cz, 2) + ' µF</b>，与单元并联' +
        '<br><span class="muted">' + z.note + '</span>', 'ok');
    });

    /* ---------------- 3) L-pad ---------------- */
    $('xoLpBtn').addEventListener('click', function () {
      var lp = C.lpad({ dB: pf($('xoLpDb').value), Z: pf($('xoLpZ').value) });
      if (!lp) { show($('xoLpOut'), '请填写衰减量与阻抗', 'warn'); return; }
      show($('xoLpOut'),
        '串联 <b>' + fmt(lp.Rseries, 2) + ' Ω</b> ＋ 并联 <b>' + fmt(lp.Rshunt, 2) + ' Ω</b>' +
        '（并接在单元两端）　输入阻抗校验 ' + fmt(lp.Zin, 2) + ' Ω' +
        '<br><span class="muted">' + lp.note + '</span>', 'ok');
    });

    /* ---------------- 4) 灵敏度匹配 ---------------- */
    $('xoMtBtn').addEventListener('click', function () {
      var m = C.levelMatch({ tweeterSpl: pf($('xoMtTw').value), wooferSpl: pf($('xoMtWf').value) });
      if (!m) { show($('xoMtOut'), '请填写两只单元的标称灵敏度', 'warn'); return; }
      show($('xoMtOut'),
        '灵敏度差 <b>' + fmt(Math.abs(m.diff), 1) + ' dB</b>：' + m.louder +
        '<br><span class="muted">' + m.note + '</span>', 'ok');
    });

    /* ---------------- 5) 元件反算分频点 ---------------- */
    $('xoFcBtn').addEventListener('click', function () {
      var r = C.fcFromComponents({ Z: pf($('xoFcZ').value), L: pf($('xoFcL').value), C: pf($('xoFcC').value) });
      if (!r) { show($('xoFcOut'), '请至少填写电感或电容，并给出负载阻抗', 'warn'); return; }
      show($('xoFcOut'), r.items.map(function (it) {
        return it.from + ' → 分频点 <b>' + fmt(it.fc, 0) + ' Hz</b>';
      }).join('　|　') + '<br><span class="muted">按一阶关系反算，用于核对手上现成元件</span>', 'ok');
    });
  }

  window.CrossoverView = { init: init, onShow: function () {} };
})();
