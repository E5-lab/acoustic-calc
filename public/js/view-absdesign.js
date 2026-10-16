/*
 * view-absdesign.js — 吸声结构设计 视图（#/absdesign）
 * 依赖 window.AbsDesign（内核：传递矩阵法 / 微穿孔板 / 共振结构 / 吸声降噪量）。
 */
(function () {
  'use strict';
  var A = window.AbsDesign;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 3 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }
  function toNums(s) { return (s || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); }); }

  function init() {
    if (init._d) return; init._d = true;

    /* 微穿孔板吸声（马大猷理论 + 刚性壁空腔） */
    $('abMppBtn').addEventListener('click', function () {
      var d = $('abMppD').value, t = $('abMppT').value, p = $('abMppP').value, D = $('abMppDc').value;
      if (d == null || t == null || p == null || D == null) { show($('abMppOut'), '请填写孔径 d、板厚 t、穿孔率 p(%)、空腔 D', 'warn'); return; }
      var layers = [{ type: 'perf', d: d, t: t, p: p }, { type: 'cavity', depth: D }];
      var sp = A.spectrum({ layers: layers });
      if (!sp || !sp.ok) { show($('abMppOut'), '计算失败，请检查输入', 'warn'); return; }
      var res = A.mppResonance({ d: d, t: t, p: p, D: D });
      var pts = sp.points.slice(0, 8).map(function (pt) { return pt.f + 'Hz: ' + fmt(pt.alpha, 2); }).join('　');
      show($('abMppOut'), 'NRC ≈ <b>' + fmt(sp.nrc, 2) + '</b>　峰值 α = ' + fmt(sp.peak ? sp.peak.alpha : 0, 2) +
        ' @ ' + (sp.peak ? sp.peak.f : '—') + ' Hz　共振 f₀ ≈ ' + (res ? fmt(res.f0, 0) + ' Hz' : '—') +
        '<br><span class="muted">' + pts + '</span>', 'ok');
    });

    /* 多孔材料层（Delany–Bazley / Miki）+ 空腔 */
    $('abPorBtn').addEventListener('click', function () {
      var pid = $('abPorMat').value, thick = $('abPorTh').value, cav = $('abPorCav').value, model = $('abPorModel').value;
      var preset = A.findPorous(pid);
      if (!preset || thick == null || cav == null) { show($('abPorOut'), '请选择材料并填写厚度与空腔深度', 'warn'); return; }
      var layers = [{ type: 'porous', thickness: thick, sigma: preset.sigma, model: model }, { type: 'cavity', depth: cav }];
      var sp = A.spectrum({ layers: layers });
      if (!sp || !sp.ok) { show($('abPorOut'), '计算失败，请检查输入', 'warn'); return; }
      var pts = sp.points.slice(0, 8).map(function (pt) { return pt.f + 'Hz: ' + fmt(pt.alpha, 2); }).join('　');
      show($('abPorOut'), '<b>' + preset.name + '</b> ' + thick + ' mm + 空腔 ' + cav + ' mm　NRC ≈ <b>' + fmt(sp.nrc, 2) +
        '</b>　峰值 α = ' + fmt(sp.peak ? sp.peak.alpha : 0, 2) + ' @ ' + (sp.peak ? sp.peak.f : '—') + ' Hz' +
        (sp.invalidCount ? '　<span class="warn">（' + sp.invalidCount + ' 带超出 Delany–Bazley 适用范围）</span>' : '') +
        '<br><span class="muted">' + pts + '</span>', 'ok');
    });

    /* 薄板 / 薄膜共振频率 */
    $('abPanelBtn').addEventListener('click', function () {
      var f0 = A.panelResonance($('abPanelM').value, $('abPanelD').value);
      if (f0 == null) { show($('abPanelOut'), '请填写面密度 m (kg/m²) 与空腔深度 d (m)', 'warn'); return; }
      show($('abPanelOut'), '共振频率 f₀ ≈ <b>' + fmt(f0, 1) + ' Hz</b>', 'ok');
    });

    /* 吸声降噪量 ΔL = 10lg(A₂/A₁) */
    $('abRedBtn').addEventListener('click', function () {
      var a1 = toNums($('abA1').value), a2 = toNums($('abA2').value);
      var bg = toNums($('abBg').value);
      if (a1.length !== a2.length || !a1.length) { show($('abRedOut'), '请填写处理前后吸声量数组（等长）', 'warn'); return; }
      var bands = a1.length === 6 ? [125, 250, 500, 1000, 2000, 4000] : undefined;
      var r = A.reduction({ A1: a1, A2: a2, bands: bands, bgLevels: bg.length === a1.length ? bg : null });
      if (!r || !r.ok) { show($('abRedOut'), '计算失败，请检查输入', 'warn'); return; }
      var txt = '平均降噪量 ΔL ≈ <b>' + fmt(r.meanDL, 1) + ' dB</b>　最大 <b>' + fmt(r.maxDL, 1) + ' dB</b>';
      if (r.beforeTotal != null) txt += '<br>背景 ' + fmt(r.beforeTotal, 1) + ' → 处理后 ' + fmt(r.afterTotal, 1) + ' dB(A)';
      show($('abRedOut'), txt, 'ok');
    });
  }

  function onShow() {}
  window.AbsDesignView = { init: init, onShow: onShow };
})();
