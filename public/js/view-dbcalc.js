/*
 * view-dbcalc.js — 单位与换算 视图（#/db）
 * 依赖 window.DbCalc（内核）。四个子工具：声级相加/背景修正、单位换算、距离衰减、计权网络速查。
 */
(function () {
  'use strict';
  var D = window.DbCalc;
  var RHO_C = 400; // 空气特性阻抗近似 Pa·s/m（20°C, 1atm 约 413，取 400 计算平面波声强）

  function $(id) { return window.Util.$(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function setText(el, html) { if (el) el.innerHTML = html; }

  var inited = false;
  function init() {
    if (inited) return;
    inited = true;

    /* ---------- 声级相加 / 相减 ---------- */
    $('dbSumBtn').addEventListener('click', function () {
      var raw = ($('dbLevels').value || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
      if (!raw.length) { $('dbSumMsg').textContent = '请先输入至少一个声压级'; return; }
      var total = D.energySum(raw);
      var mx = Math.max.apply(null, raw);
      setText($('dbSumOut'), '总声级 = <b>' + fmt(total) + ' dB</b>　·　共 ' + raw.length +
        ' 个声源　·　比最大单源高 ' + fmt(total - mx) + ' dB');
      $('dbSumOut').hidden = false;
      $('dbSumMsg').textContent = '';
    });

    $('dbSubBtn').addEventListener('click', function () {
      var tot = parseFloat($('dbTot').value), part = parseFloat($('dbPart').value);
      var out = $('dbSubOut');
      if (isNaN(tot) || isNaN(part)) { setText(out, '请填写总量与部分量'); out.hidden = false; out.className = 'result-line warn'; return; }
      var src = D.subtractLevels(tot, part);
      if (src == null) { setText(out, '部分量 ≥ 总量，无法扣除'); out.hidden = false; out.className = 'result-line warn'; return; }
      var d = tot - part;
      var note = d < 3 ? '　⚠ 差值 &lt; 3 dB，按标准不宜修正（结果不可靠）' : '';
      setText(out, '剩余声级 L<sub>源</sub> = <b>' + fmt(src) + ' dB</b>' + note);
      out.hidden = false;
      out.className = d < 3 ? 'result-line warn' : 'result-line ok';
    });

    /* ---------- 单位换算 ---------- */
    var convIds = { spl: 'dbSpl', pa: 'dbPa', i: 'dbI', li: 'dbLI', w: 'dbW', lw: 'dbLW' };
    var kinds = ['spl', 'pa', 'i', 'li', 'w', 'lw'];
    function fillConv(srcKind) {
      var v = parseFloat($(convIds[srcKind]).value);
      var s = {};
      if (srcKind === 'spl' && !isNaN(v)) { s.pa = D.splToPressure(v); s.i = s.pa * s.pa / RHO_C; s.li = D.intensityToLevel(s.i); }
      else if (srcKind === 'pa' && !isNaN(v)) { s.spl = D.pressureToSpl(v); s.i = v * v / RHO_C; s.li = D.intensityToLevel(s.i); }
      else if (srcKind === 'i' && !isNaN(v)) { s.li = D.intensityToLevel(v); s.pa = Math.sqrt(v * RHO_C); s.spl = D.pressureToSpl(s.pa); }
      else if (srcKind === 'li' && !isNaN(v)) { s.i = D.levelToIntensity(v); s.pa = Math.sqrt(s.i * RHO_C); s.spl = D.pressureToSpl(s.pa); }
      else if (srcKind === 'w' && !isNaN(v)) { s.lw = D.powerToLevel(v); }
      else if (srcKind === 'lw' && !isNaN(v)) { s.w = D.levelToPower(v); }
      kinds.forEach(function (k) {
        if (k === srcKind) return;
        var el = $(convIds[k]);
        if (!el) return;
        var val = s[k];
        el.value = (val == null || isNaN(val)) ? '' :
          (k === 'pa' || k === 'i' || k === 'w') ? Number(val).toExponential(3) : Number(val).toFixed(2);
      });
    }
    kinds.forEach(function (k) {
      var el = $(convIds[k]);
      if (el) el.addEventListener('input', function () { fillConv(k); });
    });

    /* ---------- 距离衰减 ---------- */
    function updateDep() {
      var t = $('dbSrcType').value;
      Array.prototype.forEach.call(document.querySelectorAll('#view-db .field[data-dep]'), function (f) {
        f.hidden = (f.getAttribute('data-dep') !== t);
      });
    }
    $('dbSrcType').addEventListener('change', updateDep);
    updateDep();

    $('dbDistBtn').addEventListener('click', function () {
      var out = $('dbDistOut');
      var t = $('dbSrcType').value;
      var L1 = parseFloat($('dbL1').value), r1 = parseFloat($('dbR1').value), r2 = parseFloat($('dbR2').value);
      var L2 = null, note = '';
      if (t === 'fromLw') {
        var lw = parseFloat($('dbLw').value), q = parseFloat($('dbQ').value);
        if (isNaN(lw) || isNaN(r2)) { setText(out, '请填写 L<sub>W</sub> 与目标距离 r₂'); out.hidden = false; out.className = 'result-line warn'; return; }
        L2 = D.pointSourceLp(lw, r2, q);
        note = '（L<sub>W</sub>=' + fmt(lw) + ' dB，Q=' + fmt(q, 1) + '，r₂=' + fmt(r2, 1) + ' m）';
      } else {
        if (isNaN(L1) || isNaN(r1) || isNaN(r2) || r1 <= 0 || r2 <= 0) { setText(out, '请填写 L₁、r₁、r₂'); out.hidden = false; out.className = 'result-line warn'; return; }
        if (t === 'point') L2 = D.distanceAttenPoint(L1, r1, r2);
        else if (t === 'line') L2 = D.distanceAttenLine(L1, r1, r2);
        else if (t === 'plane') {
          var side = parseFloat($('dbSide').value);
          if (isNaN(side) || side <= 0) { setText(out, '请填写面源边长 a'); out.hidden = false; out.className = 'result-line warn'; return; }
          var res = D.distanceAttenPlane(L1, r1, r2, side);
          L2 = res.L2;
          note = '（' + (res.regime === 'near' ? '近场近似不变' : '远场按点声源') + '，临界距离 a/π=' + fmt(res.critical, 1) + ' m）';
        }
      }
      if (L2 == null) { setText(out, '计算失败，请检查输入'); out.hidden = false; out.className = 'result-line warn'; return; }
      setText(out, 'r₂ 处声压级 L₂ = <b>' + fmt(L2) + ' dB</b>' + note);
      out.hidden = false;
      out.className = 'result-line ok';
    });

    /* ---------- 计权网络表 ---------- */
    var W = D.WEIGHT, body = $('dbWeightBody'), rows = '';
    for (var i = 0; i < W.freq.length; i++) {
      rows += '<tr><td>' + W.freq[i] + '</td><td>' + W.A[i].toFixed(1) + '</td><td>' +
        W.C[i].toFixed(1) + '</td><td>' + W.Z[i].toFixed(1) + '</td></tr>';
    }
    body.innerHTML = rows;
  }

  function onShow() {}
  window.DbCalcView = { init: init, onShow: onShow };
})();
