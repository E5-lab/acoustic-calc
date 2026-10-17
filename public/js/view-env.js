/*
 * view-env.js — 环境声学评价 视图（#/env）
 * 依赖 window.Env（内核）。
 */
(function () {
  'use strict';
  var E = window.Env;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function setText(el, html) { if (el) el.innerHTML = html; }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  var inited = false;
  function init() {
    if (inited) return; inited = true;

    /* Leq / 统计声级 */
    $('eqBtn').addEventListener('click', function () {
      var raw = ($('eqLevels').value || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
      if (raw.length < 2) { $('eqMsg').textContent = '请至少输入 2 个采样声级'; return; }
      $('eqMsg').textContent = '';
      var leq = E.leq(raw), L5 = E.l5(raw), L10 = E.l10(raw), L50 = E.l50(raw), L90 = E.l90(raw), L95 = E.l95(raw);
      var sigma = (function () { var m = leq; var s2 = 0; raw.forEach(function (v) { s2 += (v - m) * (v - m); }); return Math.sqrt(s2 / raw.length); })();
      show($('eqOut'), 'Leq = <b>' + fmt(leq) + ' dB</b>　·　L5 <b>' + fmt(L5) + '</b>　L10 <b>' + fmt(L10) +
        '</b>　L50 <b>' + fmt(L50) + '</b>　L90 <b>' + fmt(L90) + '</b>　L95 <b>' + fmt(L95) + '</b>　·　σ = ' + fmt(sigma), 'ok');
    });

    /* Ldn / Lden */
    $('dnBtn').addEventListener('click', function () {
      var day = parseFloat($('dnDay').value), night = parseFloat($('dnNight').value), eve = parseFloat($('dnEve').value);
      if (isNaN(day) || isNaN(night)) { show($('dnOut'), '请填写昼、夜 Leq', 'warn'); return; }
      var ldn = E.ldn(day, night), lden = (isNaN(eve)) ? null : E.lden(day, eve, night);
      var html = 'Ldn = <b>' + fmt(ldn) + ' dB</b>';
      if (lden != null) html += '　·　Lden = <b>' + fmt(lden) + ' dB</b>';
      show($('dnOut'), html, 'ok');
    });

    /* NPL / TNI */
    $('npBtn').addEventListener('click', function () {
      var Leq = parseFloat($('npLeq').value), L10 = parseFloat($('npL10').value), L90 = parseFloat($('npL90').value), sig = parseFloat($('npSigma').value);
      if (isNaN(Leq) || isNaN(L10) || isNaN(L90)) { show($('npOut'), '请填写 Leq、L10、L90', 'warn'); return; }
      var npl = E.npl(Leq, L10, L90, isNaN(sig) ? null : sig), tni = E.tni(L10, L90);
      show($('npOut'), 'NPL = <b>' + fmt(npl) + ' dB</b>　·　TNI = <b>' + fmt(tni) + ' dB</b>', 'ok');
    });

    /* NR */
    var nrMap = { nr31: 31.5, nr63: 63, nr125: 125, nr250: 250, nr500: 500, nr1k: 1000, nr2k: 2000, nr4k: 4000, nr8k: 8000 };
    $('nrBtn').addEventListener('click', function () {
      var spec = {};
      Object.keys(nrMap).forEach(function (id) { var v = parseFloat($(id).value); if (!isNaN(v)) spec[nrMap[id]] = v; });
      if (!Object.keys(spec).length) { show($('nrOut'), '请至少输入一个倍频带声压级', 'warn'); return; }
      var r = E.nrFromSpectrum(spec);
      if (!r) { show($('nrOut'), '无法计算 NR', 'warn'); return; }
      show($('nrOut'), 'NR ≈ <b>' + r.nr + '</b>　·　控制频带：<b>' + r.worstFreq + ' Hz</b>（' + fmt(r.worstLevel) + ' dB）', 'ok');
    });

    /* 户外声传播 */
    var oMap = { o31: 31.5, o63: 63, o125: 125, o250: 250, o500: 500, o1k: 1000, o2k: 2000, o4k: 4000, o8k: 8000 };
    $('oBtn').addEventListener('click', function () {
      var spec = {};
      Object.keys(oMap).forEach(function (id) { var v = parseFloat($(id).value); if (!isNaN(v)) spec[oMap[id]] = v; });
      if (!Object.keys(spec).length) { show($('oOut'), '请至少输入一个倍频带 L_W', 'warn'); return; }
      // 气象修正 C0：自定义输入优先，否则用评价时段下拉（顺风 0 / 长期平均 2~3 dB）
      var cmet = parseFloat($('oCmet').value);
      if (isNaN(cmet) || cmet < 0) cmet = parseFloat($('oMet').value) || 0;
      var r = E.iso9613(spec, parseFloat($('oR').value), parseFloat($('oHs').value), parseFloat($('oHr').value),
        $('oGround').value, parseFloat($('oT').value), parseFloat($('oRH').value), null, cmet);
      if (!r) { show($('oOut'), '请检查距离是否大于 0', 'warn'); return; }
      var html = '接收点 A 声级（顺风参考条件）L_pA ≈ <b>' + fmt(r.LpA) + ' dB(A)</b>（r = ' + fmt(r.r, 1) + ' m，地面：' + r.ground + '）';
      if (r.cmet > 0) html += '　·　长期平均 L_AT = L_pA − C₀ ≈ <b>' + fmt(r.LpA_LT) + ' dB(A)</b>（气象修正 C₀ = ' + fmt(r.cmet, 1) + ' dB）';
      show($('oOut'), html, 'ok');
      var rows = '';
      r.bands.forEach(function (b) {
        if (b.Lp == null) return;
        rows += '<tr><td>' + b.f + '</td><td>' + fmt(b.LW) + '</td><td>' + fmt(b.Adiv) + '</td><td>' + fmt(b.Aatm) +
          '</td><td>' + fmt(b.Agr) + '</td><td>' + fmt(b.Lp) + '</td><td>' + fmt(b.LpA) + '</td></tr>';
      });
      $('oBody').innerHTML = rows;
    });

    /* 公路交通噪声 */
    $('tBtn').addEventListener('click', function () {
      var r = E.roadTraffic(parseFloat($('tQ').value), parseFloat($('tV').value), parseFloat($('tR').value),
        { ground: $('tGround').value });
      if (!r) { show($('tOut'), '请检查车流量 / 车速 / 距离是否填写且 > 0', 'warn'); return; }
      show($('tOut'), 'L_pA ≈ <b>' + fmt(r.LpA) + ' dB(A)</b>　·　线声源功率级 L_WL = ' + fmt(r.LwLine) +
        ' dB　·　单车等效 L_W ≈ ' + fmt(r.LwVeh) + ' dB　·　A_div ' + fmt(r.Adiv) + ' / A_atm ' + fmt(r.Aatm) + ' / A_gr ' + fmt(r.Agr), 'ok');
    });
  }

  function onShow() {}
  window.EnvView = { init: init, onShow: onShow };
})();
