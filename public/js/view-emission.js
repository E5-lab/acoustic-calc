/*
 * view-emission.js — 环境噪声排放限值对照视图（#/emission）
 * 依赖 window.Emission（内核）、window.LimitData（限值库，含外部配置）
 */
(function () {
  'use strict';
  var E = window.Emission;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 1 : d); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  function populateStandards() {
    var sel = $('emStd');
    sel.innerHTML = '';
    E.STANDARDS.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.id; o.textContent = s.code + ' · ' + s.name;
      if (s.id === 'GB12348') o.selected = true;
      sel.appendChild(o);
    });
  }

  function populateZones() {
    var stdId = $('emStd').value;
    var std = E.STANDARDS.filter(function (s) { return s.id === stdId; })[0];
    var zoneSel = $('emZone');
    var row = $('emZoneRow');
    if (std && std.zones) {
      row.hidden = false;
      zoneSel.innerHTML = '';
      std.zones.forEach(function (z) {
        var o = document.createElement('option');
        o.value = z;
        var label = z + ' 类';
        var t = (window.LimitData && window.LimitData.INBUILT && window.LimitData.INBUILT[stdId] &&
          window.LimitData.INBUILT[stdId].table && window.LimitData.INBUILT[stdId].table[z]) ?
          window.LimitData.INBUILT[stdId].table[z].note : '';
        o.textContent = label + (label ? '' : '') + (t ? '（' + t + '）' : '');
        zoneSel.appendChild(o);
      });
    } else {
      row.hidden = true;
    }
  }

  function evaluate() {
    var stdId = $('emStd').value;
    var zone = $('emZoneRow').hidden ? null : $('emZone').value;
    var day = parseFloat($('emDay').value);
    var night = parseFloat($('emNight').value);
    var res = E.check(stdId, zone, isNaN(day) ? null : day, isNaN(night) ? null : night);
    if (!res.ok) { show($('emResult'), esc(res.error), 'warn'); return; }

    function cell(x) {
      if (x == null || x.level == null) return '<td>—</td><td>—</td><td>—</td>';
      var cls = x.ok ? 'ok' : 'bad';
      var verdict = x.ok ? '达标' : ('超标 ' + fmt(x.exceed, 1) + ' dB');
      return '<td>' + x.label + '</td><td class="mono">' + fmt(x.level, 1) + '</td><td class="mono">' +
        fmt(x.limit, 1) + '</td><td class="' + cls + '">' + verdict + '</td>';
    }
    var table = '<table class="detail-table wide"><thead><tr><th>时段</th><th>实测值</th><th>限值</th><th>判定</th></tr></thead><tbody>' +
      '<tr>' + cell(res.day) + '</tr><tr>' + cell(res.night) + '</tr></tbody></table>';

    var callout = '';
    if (res.day && res.day.ok === false || res.night && res.night.ok === false) {
      callout = '<div class="callout warn"><span class="dot"></span><span>存在超标项，需采取措施后复测。</span></div>';
    } else {
      callout = '<div class="callout ok"><span class="dot"></span><span>达标。</span></div>';
    }
    show($('emResult'), table + callout + '<div class="hint">' + esc(res.standard.code + ' ' + res.standard.name + '；' + (res.standard.basis || '')) + '</div>', 'ok');
  }

  function renderTable() {
    var stdId = $('emStd').value;
    var data = (window.LimitData && window.LimitData.INBUILT) ? window.LimitData.INBUILT[stdId] : null;
    if (!data || !data.table) { $('emTable').innerHTML = ''; return; }
    var isZone = data.table['0'] && data.table['0'].day != null;
    var html = '<table class="detail-table"><thead><tr><th>类别/时段</th><th>昼间</th><th>夜间</th><th>备注</th></tr></thead><tbody>';
    if (isZone) {
      Object.keys(data.table).forEach(function (z) {
        var r = data.table[z];
        html += '<tr><td>' + esc(z) + ' 类</td><td class="mono">' + r.day + '</td><td class="mono">' + r.night + '</td><td>' + esc(r.note || '') + '</td></tr>';
      });
    } else {
      html += '<tr><td>施工场界</td><td class="mono">' + data.table.day.value + '</td><td class="mono">' + data.table.night.value + '</td><td>' + esc(data.table.day.note) + '</td></tr>';
    }
    html += '</tbody></table>';
    $('emTable').innerHTML = html;
  }

  function init() {
    if (init._d) return;
    init._d = true;
    populateStandards();
    $('emStd').addEventListener('change', function () { populateZones(); renderTable(); });
    $('emZone').addEventListener('change', function () {});
    $('emBtn').addEventListener('click', evaluate);
    populateZones();
    renderTable();
  }
  function onShow() {}
  window.EmissionView = { init: init, onShow: onShow };
})();