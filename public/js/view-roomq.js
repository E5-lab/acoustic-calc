/*
 * view-roomq.js — 厅堂与扩声音质 视图（#/roomq）
 * 依赖 window.RoomQ（内核）。
 */
(function () {
  'use strict';
  var R = window.RoomQ;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  var inited = false;
  function init() {
    if (inited) return; inited = true;

    /* RT60 / EDT */
    $('rqRtBtn').addEventListener('click', function () {
      var r = R.rtFromDecay($('rqT10').value, $('rqT20').value, $('rqT30').value);
      if (!r) { show($('rqRtOut'), '请至少填写一个衰减时间(>0)', 'warn'); return; }
      show($('rqRtOut'), 'RT60 ≈ <b>' + fmt(r.rt60) + ' s</b>（EDT ≈ <b>' + fmt(r.edt) + ' s</b>）', 'ok');
    });

    /* 清晰度 / 定义度 */
    $('rqClarityBtn').addEventListener('click', function () {
      var r = R.roomMetrics($('rqE50').value, $('rqE80').value, $('rqEtot').value);
      if (!r) { show($('rqClarityOut'), '请填写 E50、E80、Etot（Etot 须 ≥ E80 ≥ E50 > 0）', 'warn'); return; }
      show($('rqClarityOut'), 'C50 = <b>' + fmt(r.c50) + ' dB</b>　·　C80 = <b>' + fmt(r.c80) +
        ' dB</b>　·　D50 = <b>' + fmt(r.d50, 1) + ' %</b>', 'ok');
    });

    /* 中心时间 */
    $('rqTsBtn').addEventListener('click', function () {
      var ts = ($('rqTsT').value || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
      var ls = ($('rqTsL').value || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
      if (ts.length !== ls.length || !ts.length) { show($('rqTsOut'), '请填写相同数量的 时间 与 能量（成对）', 'warn'); return; }
      var tsec = ts.map(function (x) { return x / 1000; }); // ms→s
      var Ts = R.centerTime(tsec, ls);
      if (Ts == null) { show($('rqTsOut'), '计算失败，请检查输入', 'warn'); return; }
      show($('rqTsOut'), '中心时间 Ts ≈ <b>' + fmt(Ts * 1000, 1) + ' ms</b>', 'ok');
    });

    /* 强度因子 */
    $('rqGBtn').addEventListener('click', function () {
      var g = R.strengthFactor($('rqGLp').value, $('rqGLw').value, $('rqGr').value);
      if (g == null) { show($('rqGOut'), '请填写 Lp、Lw、r(>0)', 'warn'); return; }
      show($('rqGOut'), '强度因子 G ≈ <b>' + fmt(g) + ' dB</b>', 'ok');
    });

    /* 扩声预测 */
    $('rqReinBtn').addEventListener('click', function () {
      var Rr = R.roomConstant($('rqS').value, $('rqA').value);
      if (Rr == null) { show($('rqReinOut'), '请填写 S 与 α(0≤α<1)', 'warn'); return; }
      var rc = R.criticalDistance($('rqQ').value, Rr);
      var lp = R.reinforcementLp($('rqLw').value, $('rqQ').value, $('rqRr').value, Rr);
      if (rc == null || lp == null) { show($('rqReinOut'), '请检查 Lw / Q / r / S / α', 'warn'); return; }
      show($('rqReinOut'), '房间常数 R = <b>' + fmt(Rr) + '</b>　·　临界距离 r_c = <b>' + fmt(rc, 1) +
        ' m</b>　·　r 处声压级 Lp ≈ <b>' + fmt(lp) + ' dB</b>', 'ok');
    });
  }

  function onShow() {}
  window.RoomQView = { init: init, onShow: onShow };
})();
