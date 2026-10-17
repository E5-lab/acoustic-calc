/*
 * view-traffic.js — 交通/铁路/航空噪声预测视图（#/traffic）
 * 依赖 window.Traffic（内核）
 */
(function () {
  'use strict';
  var T = window.Traffic;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 1 : d); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  function pf(id) { var v = parseFloat($(id).value); return isNaN(v) ? null : v; }

  function calcRoad() {
    var r = T.roadLeq({ kind: $('tfKind').value, speed: pf('tfV') || 60, q: pf('tfQ'), r: pf('tfR') });
    if (!r.ok) { show($('trRoadOut'), esc(r.error), 'warn'); return; }
    var html = '<div class="kv kv-wide"><div class="k">小时等效声级 L_eq</div><div class="v"><b>' + fmt(r.leq, 1) + '</b> dB(A)</div></div>' +
      '<div class="kv"><div class="k">单车 A 声功率级</div><div class="v">' + fmt(r.lw, 1) + ' dB</div></div>' +
      '<div class="kv"><div class="k">输入</div><div class="v">' + fmt(r.q, 0) + ' 辆/h · ' + fmt(r.v, 0) + ' km/h · ' + fmt(r.r, 0) + ' m</div></div>';
    if (r.note) html += '<div class="hint">' + esc(r.note) + '</div>';
    show($('trRoadOut'), html, 'ok');
  }

  function calcRail() {
    var r = T.railLeq({ speed: pf('tlV') || 100, r: pf('tlR'), n: pf('tlN'), tPer: pf('tlT') || 15 });
    if (!r.ok) { show($('trRailOut'), r.error, 'warn'); return; }
    var html = '<div class="kv kv-wide"><div class="k">小时等效声级 L_eq</div><div class="v"><b>' + fmt(r.leq, 1) + '</b> dB(A)</div></div>';
    if (r.lmax != null) html += '<div class="kv"><div class="k">单列通过最大声级 L_max</div><div class="v">' + fmt(r.lmax, 1) + ' dB(A)</div></div>';
    html += '<div class="kv"><div class="k">输入</div><div class="v">' + fmt(r.v, 0) + ' km/h · ' + fmt(r.r, 0) + ' m · ' + fmt(r.n, 0) + ' 列/h</div></div>';
    if (r.note) html += '<div class="hint">' + esc(r.note) + '</div>';
    show($('trRailOut'), html, 'ok');
  }

  function calcAir() {
    var r = T.air({ sel: pf('taSEL'), nd: pf('taNd'), nn: pf('taNn') });
    if (!r.ok) { show($('trAirOut'), r.error, 'warn'); return; }
    var html = '<div class="kv kv-wide"><div class="k">昼夜等效声级 L_dn</div><div class="v"><b>' + fmt(r.ldn, 1) + '</b> dB</div></div>' +
      '<div class="kv"><div class="k">NEF 简化</div><div class="v">' + (r.nef == null ? '—' : fmt(r.nef, 1)) + '</div></div>' +
      '<div class="kv"><div class="k">架次</div><div class="v">昼 ' + fmt(r.nd, 0) + ' / 夜 ' + fmt(r.nn, 0) + '</div></div>';
    if (r.note) html += '<div class="hint">' + esc(r.note) + '</div>';
    show($('trAirOut'), html, 'ok');
  }

  function init() {
    if (init._d) return;
    init._d = true;
    $('trRoadBtn').addEventListener('click', calcRoad);
    $('trRailBtn').addEventListener('click', calcRail);
    $('trAirBtn').addEventListener('click', calcAir);
    calcRoad(); calcRail(); calcAir();
  }
  function onShow() {}
  window.TrafficView = { init: init, onShow: onShow };
})();