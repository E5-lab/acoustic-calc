/*
 * view-vibeval.js — 振动评价 视图（#/vibeval）
 * 依赖 window.VibEval（内核）。
 */
(function () {
  'use strict';
  var V = window.VibEval;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function fmtSci(n) { if (n == null || isNaN(n)) return '—'; if (Math.abs(n) >= 1e-3 && Math.abs(n) < 1e4) return n.toFixed(4); return n.toExponential(3); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  var BANDS = [1, 2, 4, 8, 16, 31.5, 63, 125, 250, 500, 1000];
  function readBands(prefix) {
    var s = {};
    BANDS.forEach(function (f) {
      var id = prefix + (f === 1000 ? '1k' : (f === 31.5 ? '31' : f));
      var v = parseFloat($(id).value); if (!isNaN(v)) s[f] = v;
    });
    return s;
  }

  var inited = false;
  function init() {
    if (inited) return; inited = true;

    /* 振动级换算 */
    $('vaBtn').addEventListener('click', function () {
      var a = parseFloat($('vaAccel').value), f = parseFloat($('vaFreq').value);
      if (isNaN(a) || isNaN(f) || f <= 0) { show($('vaOut'), '请填写加速度与频率(>0)', 'warn'); return; }
      var v = V.velFromAccel(a, f), d = V.dispFromVel(v, f);
      show($('vaOut'),
        '加速度级 VAL = <b>' + fmt(V.accelLevel(a)) + ' dB</b>　·　速度级 VLV = <b>' + fmt(V.velLevel(v)) +
        ' dB</b>　·　位移级 DL = <b>' + fmt(V.dispLevel(d)) + ' dB</b><br>速度 v = ' + fmtSci(v) +
        ' m/s　·　位移 d = ' + fmtSci(d) + ' m', 'ok');
    });

    /* 计权振动级 / aw */
    $('vbBtn').addEventListener('click', function () {
      var spec = readBands('vb'), type = $('vbType').value;
      if (!Object.keys(spec).length) { show($('vbOut'), '请至少输入一个倍频带加速度级', 'warn'); return; }
      var wl = V.weightedLevel(spec, type), aw = V.awFromLevel(wl);
      show($('vbOut'), '计权总振动级（' + type + '）≈ <b>' + fmt(wl) + ' dB</b>　·　计权 RMS 加速度 aw ≈ <b>' + fmtSci(aw) + ' m/s²</b>', 'ok');
    });

    /* 暴露评价 */
    $('exBtn').addEventListener('click', function () {
      var aw = parseFloat($('exAw').value), t = parseFloat($('exT').value);
      if (isNaN(aw)) { show($('exOut'), '请填写 aw', 'warn'); return; }
      var r = V.exposure(aw, t);
      var cls = r.verdict.indexOf('危险') >= 0 ? 'warn' : 'ok';
      show($('exOut'), 'aw·√t = <b>' + fmt(r.k) + '</b>（对照：行动值 ' + fmt(r.av) + ' / 暴露限值 ' + fmt(r.elv) + '）　·　判定：<b>' + r.verdict + '</b>', cls);
    });

    /* VDV */
    $('vdBtn').addEventListener('click', function () {
      var aw = parseFloat($('vdAw').value), t = parseFloat($('vdT').value), cf = parseFloat($('vdCf').value);
      if (isNaN(aw) || isNaN(t)) { show($('vdOut'), '请填写 aw 与时长 T', 'warn'); return; }
      var v = V.vdv(aw, t, cf);
      var note = v > 17 ? '　⚠ 超过 8h 暴露限值 17' : (v > 8.5 ? '　超过行动值 8.5' : '');
      show($('vdOut'), 'VDV ≈ <b>' + fmt(v, 2) + ' m/s^1.75</b>' + note, v > 17 ? 'warn' : 'ok');
    });

    /* GB 10070 */
    $('gbBtn').addEventListener('click', function () {
      var vl = parseFloat($('gbVL').value), zone = $('gbZone').value, dn = $('gbDN').value;
      if (isNaN(vl)) { show($('gbOut'), '请填写实测振动级', 'warn'); return; }
      var r = V.evaluateGb10070(vl, zone, dn);
      var cls = r.ok ? 'ok' : 'warn';
      var note = r.ok ? '达标（余量 ' + r.margin + ' dB）' : '超标 ' + Math.abs(r.margin) + ' dB';
      show($('gbOut'), zone + r.dayNight + '限值 <b>' + r.limit + ' dB</b>　·　实测 ' + fmt(vl) + ' dB　·　<b>' + note + '</b>', cls);
    });
  }

  function onShow() {}
  window.VibEvalView = { init: init, onShow: onShow };
})();
