/*
 * view-psycho.js — 心理声学/声品质 视图（#/psycho）
 * 依赖 window.Psy（内核）。
 */
(function () {
  'use strict';
  var P = window.Psy;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  // 读取一组倍频带输入（前缀 + 频率），返回 {频率: 数值}
  var BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
  function readBands(prefix) {
    var s = {};
    BANDS.forEach(function (f) {
      var id = prefix + (f === 1000 ? '1k' : f === 2000 ? '2k' : f === 4000 ? '4k' : f === 8000 ? '8k' : f);
      var v = parseFloat($(id).value); if (!isNaN(v)) s[f] = v;
    });
    return s;
  }

  var inited = false;
  function init() {
    if (inited) return; inited = true;

    /* 响度换算 */
    $('psPhonBtn').addEventListener('click', function () {
      var phon = parseFloat($('psPhon').value);
      if (isNaN(phon)) { show($('psConvOut'), '请填写响度级', 'warn'); return; }
      show($('psConvOut'), fmt(phon) + ' phon ≈ <b>' + fmt(P.phonToSone(phon)) + ' sone</b>', 'ok');
    });
    $('psSoneBtn').addEventListener('click', function () {
      var sone = parseFloat($('psSone').value);
      if (isNaN(sone) || sone <= 0) { show($('psConvOut'), '请填写 >0 的响度', 'warn'); return; }
      show($('psConvOut'), fmt(sone) + ' sone ≈ <b>' + fmt(P.soneToPhon(sone)) + ' phon</b>', 'ok');
    });

    /* 总响度 / 尖锐度 */
    $('psLoudBtn').addEventListener('click', function () {
      var spec = readBands('lo');
      if (!Object.keys(spec).length) { show($('psLoudOut'), '请至少输入一个倍频带声压级', 'warn'); return; }
      var est = P.bandLoudnessEstimate(spec), S = P.sharpness(spec);
      show($('psLoudOut'), '总响度估算 ≈ <b>' + fmt(est.sones) + ' sone</b>（' + est.bands + ' 个频带）　·　尖锐度 S ≈ <b>' + fmt(S, 3) + ' acum</b>', 'ok');
    });

    /* 粗糙度 / 抖动度 */
    $('psRuffBtn').addEventListener('click', function () {
      var fm = parseFloat($('psFmod').value), m = parseFloat($('psDepth').value), n = parseFloat($('psN').value);
      if (isNaN(fm) || isNaN(m) || isNaN(n)) { show($('psRuffOut'), '请填写调制频率、深度与整体响度', 'warn'); return; }
      var R = P.roughness(fm, m, n), F = P.fluctuation(fm, m, n);
      show($('psRuffOut'), '粗糙度 R ≈ <b>' + fmt(R, 3) + ' asper</b>　·　抖动度 F ≈ <b>' + fmt(F, 3) + ' vacil</b>', 'ok');
    });

    /* PNL */
    $('psPnlBtn').addEventListener('click', function () {
      var spec = readBands('pn');
      if (!Object.keys(spec).length) { show($('psPnlOut'), '请至少输入一个倍频带声压级', 'warn'); return; }
      var pn = P.pnlt(spec);
      show($('psPnlOut'), '感觉噪声级 PNL ≈ <b>' + fmt(pn) + ' dB</b>', 'ok');
    });

    /* STIPA */
    $('psStiBtn').addEventListener('click', function () {
      var raw = ($('psMtf').value || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
      if (raw.length < 14) { show($('psStiOut'), '请填写 14 个 MTF 值（0~1）', 'warn'); return; }
      var r = P.stipa(raw);
      show($('psStiOut'), 'STI ≈ <b>' + fmt(r.sti, 3) + '</b>　·　语言清晰度评级：<b>' + r.grade + '</b>', 'ok');
    });
  }

  function onShow() {}
  window.PsyView = { init: init, onShow: onShow };
})();
