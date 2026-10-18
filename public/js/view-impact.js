/*
 * view-impact.js — 撞击声隔声评价视图（#/impact）
 * 依赖 window.Impact（内核）、window.LimitData（限值库，可选）
 */
(function () {
  'use strict';
  var I = window.Impact;
  function $(id) { return window.Util.$(id); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 1 : d); }
  function esc(s) { return window.Util.esc(s); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  var mode = 'con'; // spec | con
  var state = { spectrum: null, source: null };

  function bandId(f) {
    return 'imB-' + (f >= 1000 ? (f / 1000) + 'k' : f);
  }

  function buildBands() {
    var box = $('imBands');
    if (!box) return;
    box.innerHTML = '';
    I.BANDS.forEach(function (f) {
      var w = document.createElement('div');
      w.className = 'field';
      var id = bandId(f);
      w.innerHTML = '<label for="' + id + '">' + (f >= 1000 ? (f / 1000) + 'k' : f) + ' Hz</label>' +
        '<input id="' + id + '" type="number" step="1" placeholder="—">';
      box.appendChild(w);
    });
  }

  function spectrumFromInputs() {
    var arr = I.BANDS.map(function (f) {
      var el = $(bandId(f));
      if (!el) return null;
      var v = parseFloat(el.value);
      return isNaN(v) ? null : v;
    });
    return arr;
  }

  function renderCon() {
    var sel = $('imConSel');
    sel.innerHTML = '';
    I.CONSTRUCTIONS.forEach(function (c, i) {
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.name + '（L500 ≈ ' + c.l500 + ' dB）';
      if (i === 0) o.selected = true;
      sel.appendChild(o);
    });
    $('imConPanel').hidden = false;
    $('imSpecPanel').hidden = true;
    mode = 'con';
    loadConstruction();
  }

  function loadConstruction() {
    var c = I.constructionSpectrum($('imConSel').value);
    if (!c) return;
    I.BANDS.forEach(function (f, i) {
      var el = $(bandId(f));
      if (el) el.value = c.spectrum[i];
    });
    state.spectrum = c.spectrum.slice();
    state.source = c.name;
  }

  function renderSpec() {
    $('imConPanel').hidden = true;
    $('imSpecPanel').hidden = false;
    mode = 'spec';
    state.source = '实测频谱';
  }

  function readSpec() { return spectrumFromInputs(); }

  /* ---------- 限值表 ---------- */
  function renderLimits() {
    var html = '<table class="detail-table wide"><thead><tr><th>建筑类型（GB 50118-2010）</th><th>高要求 LnT,w</th><th>低限 LnT,w</th></tr></thead><tbody>';
    var rows = [
      ['住宅分户楼板（卧室/起居室）', 65, 75],
      ['学校普通教室楼板', 65, 75],
      ['医院病房楼板', 65, 75],
      ['旅馆客房楼板', 65, 75],
      ['办公会议室楼板', 65, 75]
    ];
    rows.forEach(function (r) {
      html += '<tr><td>' + r[0] + '</td><td class="mono">' + r[1] + '</td><td class="mono">' + r[2] + '</td></tr>';
    });
    html += '</tbody></table>' +
      '<div class="callout warn"><span class="dot"></span><span>GB 55038-2025（全文强制）：住宅卧室、起居室楼板 <b>L_nT,w ≤ 65 dB</b>（空气声隔声 R_w + C ≥ 50 dB）。</span></div>';
    $('imLimits').innerHTML = html;
  }

  function evaluate() {
    var spec = spectrumFromInputs();
    if (!spec.some(function (v) { return v != null; })) {
      show($('imResult'), '请选择构造或输入实测频谱', 'warn');
      return;
    }
    var A = parseFloat($('imA').value);
    var T = parseFloat($('imT').value);

    var lines = [];
    var res = I.rating(spec);
    if (!res.ok) { show($('imResult'), esc(res.error), 'warn'); return; }
    lines.push('<div class="kv kv-wide"><div class="k">计权撞击声压级</div><div class="v"><b>' + fmt(res.lnw, 1) + '</b> dB</div></div>');
    lines.push('<div class="kv kv-wide"><div class="k">不利偏差和 / 最大单带偏差</div><div class="v">' + fmt(res.sumDev, 1) + ' / ' + fmt(res.maxDev, 1) + ' dB（限 32 / 8）</div></div>');
    if (!res.singleBandOk) lines.push('<div class="callout warn"><span class="dot"></span><span>存在单带不利偏差 &gt; 8 dB，按标准不宜报告单值。</span></div>');

    // 归一化 / 标准化换算
    if (isFinite(A) && A > 0) {
      var ln = spec.map(function (v) { return v == null ? null : I.normalize(v, A); });
      var rn = I.rating(ln);
      lines.push('<div class="kv"><div class="k">按吸声量 A=' + A + ' m² 归一化 Ln</div><div class="v">' + fmt(rn.lnw, 1) + ' dB</div></div>');
    }
    if (isFinite(T) && T > 0) {
      var lt = spec.map(function (v) { return v == null ? null : I.standardized(v, T); });
      var rt = I.rating(lt);
      lines.push('<div class="kv"><div class="k">按混响时间 T=' + T + ' s 标准化 LnT</div><div class="v">' + fmt(rt.lnw, 1) + ' dB</div></div>');
    }

    // 限值判定（住宅高要求 65 / 低限 75）
    var vH = I.verdict(res.lnw, 65);
    var vL = I.verdict(res.lnw, 75);
    var verdictHtml = vH.ok
      ? '<span class="ok">达标（≤ 65）</span>'
      : (vL.ok ? '<span class="warn">介于 65~75，不满足高要求、满足低限</span>' : '<span class="bad">超标（&gt; 75）</span>');
    lines.push('<div class="kv"><div class="k">住宅分户楼板判定（高 65 / 低 75）</div><div class="v">' + verdictHtml + '</div></div>');
    lines.push('<div class="kv"><div class="k">GB 55038 强制值</div><div class="v">' + (res.lnw <= 65 ? '<span class="ok">达标 ≤ 65</span>' : '<span class="bad">超标 ' + fmt(res.lnw - 65, 1) + ' dB</span>') + '</div></div>');

    /* 明细表 */
    var head = '<thead><tr><th>Hz</th><th>Ln</th><th>参考曲线</th><th>不利偏差</th></tr></thead>';
    var body = spec.map(function (v, i) {
      return '<tr><td>' + (I.BANDS[i] >= 1000 ? fmt(I.BANDS[i] / 1000, 1) + 'k' : I.BANDS[i]) + '</td><td class="mono">' + (v == null ? '—' : fmt(v, 1)) + '</td>' +
        '<td class="mono">' + res.curve[i] + '</td><td class="mono">' + (res.dev[i] == null ? '—' : fmt(res.dev[i], 1)) + '</td></tr>';
    }).join('');
    lines.push('<div class="table-wrap"><table class="detail-table wide">' + head + '<tbody>' + body + '</tbody></table></div>');
    if (state.source) lines.push('<div class="callout info"><span class="dot"></span><span>数据来源：' + esc(state.source) + '。构造参考为估算值，实验室以实测为准。</span></div>');
    show($('imResult'), lines.join(''), 'ok');
  }

  function init() {
    if (init._d) return;
    init._d = true;
    $('imModeCon').addEventListener('click', renderCon);
    $('imModeSpec').addEventListener('click', function () {
      $('imConPanel').hidden = true;
      $('imSpecPanel').hidden = false;
      mode = 'spec';
      state.source = '实测频谱';
    });
    $('imConSel').addEventListener('change', loadConstruction);
    $('imBtn').addEventListener('click', evaluate);
    buildBands();
    renderCon();
    renderLimits();
    evaluate();
  }

  function onShow() {}
  window.ImpactView = { init: init, onShow: onShow };
})();