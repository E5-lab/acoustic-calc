/*
 * view-absorber.js — 多孔吸声材料阻抗视图
 * 依赖：window.Absorber（内核）、window.MiniChart（绘图）
 */
(function () {
  'use strict';

  var E = window.Absorber, Chart = window.MiniChart;
  var state = { sigma: 9000, thickness: 50, airGap: 0 };
  var last = null;
  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function grouped(n, d) { return Number(n).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function buildPresets() {
    var sel = $('absPreset');
    sel.innerHTML = '<option value="">自定义流阻率…</option>';
    E.PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name + '（σ ≈ ' + p.sigma + '）';
      sel.appendChild(o);
    });
    sel.value = 'glasswool-24';
    $('absSigma').value = 9000;
  }

  function readInputs() {
    state.sigma = parseFloat($('absSigma').value);
    state.thickness = parseFloat($('absThick').value);
    state.airGap = parseFloat($('absGap').value) || 0;
  }

  function recalc() {
    readInputs();
    var msg = $('absMsg');
    msg.innerHTML = '';

    if (!(state.sigma > 0) || !(state.thickness > 0)) {
      last = null;
      $('absNrc').textContent = '—';
      $('absVerdict').textContent = '';
      $('absStats').innerHTML = '';
      $('absTable').innerHTML = '';
      msg.innerHTML = '<div class="callout error"><span class="dot"></span><span>请输入有效的流阻率（&gt; 0）与材料厚度（&gt; 0）。</span></div>';
      Chart.draw($('absChart'), { series: [] });
      return;
    }

    var s = E.spectrum({ sigma: state.sigma, thickness: state.thickness, airGap: state.airGap });
    if (!s.ok) {
      last = null;
      msg.innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(s.error) + '</span></div>';
      return;
    }
    last = s;

    var grade = s.nrc >= 0.8 ? '强吸声' : (s.nrc >= 0.6 ? '较好吸声' : (s.nrc >= 0.4 ? '中等吸声' : (s.nrc >= 0.2 ? '弱吸声' : '几乎不吸声')));
    $('absNrc').innerHTML = (s.nrc == null ? '—' : s.nrc.toFixed(2)) +
      '<span class="unit"> NRC</span>';
    var grade = s.nrc >= 0.8 ? '强吸声' : (s.nrc >= 0.6 ? '较好吸声' : (s.nrc >= 0.4 ? '中等吸声' : (s.nrc >= 0.2 ? '弱吸声' : '几乎不吸声')));
    var grade = s.nrc >= 0.8 ? '强吸声' : (s.nrc >= 0.6 ? '较好吸声' : (s.nrc >= 0.4 ? '中等吸声' : (s.nrc >= 0.2 ? '弱吸声' : '几乎不吸声')));
    $('absVerdict').innerHTML = grade + '（NRC ' + (s.nrc == null ? '—' : s.nrc.toFixed(2)) +
      ' · 漫射 NRC ' + (s.nrcDiff == null ? '—' : s.nrcDiff.toFixed(2)) +
      '）　材料：σ = ' + grouped(state.sigma, 0) + ' Pa·s/m²，d = ' + num(state.thickness, 0) +
      ' mm' + (state.airGap > 0 ? '，空腔 ' + num(state.airGap, 0) + ' mm' : '，贴刚性壁');

    var p500 = s.points[E.BANDS.indexOf(500)];
    var p1k = s.points[E.BANDS.indexOf(1000)];
    $('absStats').innerHTML =
      stat('α @500 Hz（法向）', num(p500.alpha, 2), '') +
      stat('α @500 Hz（漫射）', num(p500.alphaDiff, 2), '') +
      stat('NRC（法向）', s.nrc == null ? '—' : s.nrc.toFixed(2), '') +
      stat('NRC（漫射）', s.nrcDiff == null ? '—' : s.nrcDiff.toFixed(2), '', 'RT60 / 混响室口径') +
      stat('特征阻抗 @500 Hz', num(p500.zcRatio, 2), '× ρ₀c₀', '|Zc|');

    // 适用性提示
    if (s.invalidCount > 0) {
      msg.innerHTML += '<div class="callout warn"><span class="dot"></span><span>有 ' + s.invalidCount +
        ' 个频带的 X = ρ₀f/σ 超出 Delany–Bazley 适用范围（0.01–1），这些频带结果仅供数量级参考。</span></div>';
    }
    if (s.nrc >= 0.8) {
      msg.innerHTML += '<div class="callout ok"><span class="dot"></span><span>该构造吸声性能良好，可用于控制中高频混响与噪声。</span></div>';
    } else if (s.nrc < 0.4 && state.airGap === 0 && E.BANDS.indexOf(500) >= 0) {
      msg.innerHTML += '<div class="callout info"><span class="dot"></span><span>贴刚性壁且较薄时中低频吸声偏弱，可尝试增加厚度或预留空腔（空腔等效于增加厚度）。</span></div>';
    }

    // 明细表
    var rows = s.bands.map(function (f, i) {
      var p = s.points[i];
      return '<tr><td>' + f + ' Hz</td><td>' + num(p.alpha, 3) + '</td><td>' + num(p.alphaDiff, 3) + '</td><td>' + num(p.X, 3) +
        '</td><td>' + num(p.zcRatio, 2) + '</td><td>' + num(p.zsAbs, 2) +
        '</td><td>' + num(p.attenuation, 1) + '</td><td class="' + (p.valid ? 'ok' : 'warn') + '">' +
        (p.valid ? '适用' : '超范围') + '</td></tr>';
    }).join('');
    $('absTable').innerHTML = '<table class="detail-table wide"><thead><tr>' +
      '<th>频带</th><th>α（法向）</th><th>α（漫射）</th><th>X = ρ₀f/σ</th><th>|Zc|/ρ₀c₀</th><th>|Zs|/ρ₀c₀</th><th>衰减 Np/m</th><th>模型适用性</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    Chart.draw($('absChart'), {
      x: s.bands,
      xLog: true,
      yMin: 0,
      yMax: 1,
      yTicks: 5,
      yDigits: 1,
      series: [
        { name: 'NRC', color: '#f97316', values: s.bands.map(function () { return s.nrc; }), dash: [6, 4], width: 1.4, points: false },
        { name: 'α', color: '#2563eb', values: s.alphas, width: 2.2, radius: 3.4 },
        { name: 'α（漫射）', color: '#16a34a', values: s.alphasDiff, width: 2.2, radius: 3.4 }
      ]
    });
  }

  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub">' + sub + '</div>' : '') + '</div>';
  }

  function recommend() {
    var f = parseFloat($('absTargetF').value);
    var r = E.recommendThickness(state.sigma, f, state.airGap);
    if (!r) {
      $('absRecResult').innerHTML = '<div class="callout error"><span class="dot"></span><span>请输入有效的目标频率。</span></div>';
      return;
    }
    $('absRecResult').innerHTML =
      kv('建议材料厚度', num(r.thickness, 0), 'mm', '目标 ' + num(f, 0) + ' Hz 附近形成吸声峰') +
      kv('该频率 X 值', num(r.X, 3), '', r.valid ? '在适用范围内' : '超出适用范围，仅供参考') +
      '<div class="callout info" style="grid-column:1/-1"><span class="dot"></span><span>估算按 1/4 波长共振条件给出：厚度越接近目标频率的 λ/4（含空腔等效深度），该频段吸声越强。实际以阻抗管或混响室实测为准。</span></div>';
  }

  function kv(k, v, unit, sub) {
    return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v +
      (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub mini">' + sub + '</div>' : '') + '</div>';
  }

  function summaryText() {
    if (!last) return '';
    var out = ['多孔吸声材料阻抗 · 结果摘要'];
    out.push('流阻率 σ = ' + grouped(state.sigma, 0) + ' Pa·s/m²；厚度 d = ' + num(state.thickness, 0) +
      ' mm；空腔 D = ' + num(state.airGap, 0) + ' mm');
    out.push('NRC = ' + (last.nrc == null ? '—' : last.nrc.toFixed(2)) + '（250/500/1k/2k 平均）；漫射 NRC = ' +
      (last.nrcDiff == null ? '—' : last.nrcDiff.toFixed(2)));
    out.push('倍频带法向吸声系数：' + last.bands.map(function (f, i) {
      return f + 'Hz=' + last.alphas[i].toFixed(2);
    }).join('，'));
    out.push('倍频带漫射吸声系数：' + last.bands.map(function (f, i) {
      return f + 'Hz=' + last.alphasDiff[i].toFixed(2);
    }).join('，'));
    var p = last.points[3];
    out.push('500 Hz：α = ' + p.alpha.toFixed(3) + '，|Zc|/ρ₀c₀ = ' + p.zcRatio.toFixed(2) +
      '，|Zs|/ρ₀c₀ = ' + p.zsAbs.toFixed(2));
    out.push('工具：声学计算工具箱 · 多孔吸声材料阻抗');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rows = [['多孔吸声材料阻抗计算结果', '', '']];
    rows.push(['流阻率 σ (Pa·s/m²)', String(state.sigma), '']);
    rows.push(['厚度 (mm)', String(state.thickness), '']);
    rows.push(['空腔 (mm)', String(state.airGap), '']);
    rows.push(['NRC', last.nrc == null ? '' : last.nrc.toFixed(2), '']);
    rows.push([]);
    rows.push(['频率 (Hz)', '吸声系数 α（法向）', '吸声系数 α（漫射）', 'X', '|Zc|/ρ0c0', '|Zs|/ρ0c0', '衰减 (Np/m)', '适用性']);
    last.bands.forEach(function (f, i) {
      var p = last.points[i];
      rows.push([f, p.alpha.toFixed(4), p.alphaDiff.toFixed(4), p.X.toFixed(4), p.zcRatio.toFixed(3), p.zsAbs.toFixed(3), p.attenuation.toFixed(2), p.valid ? '适用' : '超范围']);
    });
    download(rows, 'absorber-result.csv');
  }

  function download(rows, filename) {
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(txt, id) {
    if (!txt) { flash(id, '暂无可复制结果'); return; }
    window.Util.copyText(txt, function () { flash(id, '已复制'); }, function () { alert('复制失败，请手动选择文本。'); });
  }

  

  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function init() {
    if (inited) return;
    inited = true;
    buildPresets();
    recalc();
    $('absPreset').addEventListener('change', function () {
      var val = this.value, found = null;
      E.PRESETS.forEach(function (x) { if (x.id === val) found = x; });
      if (found) { $('absSigma').value = found.sigma; recalc(); }
    });
    ['absSigma', 'absThick', 'absGap'].forEach(function (id) {
      $(id).addEventListener('input', recalc);
    });
    $('absRecommend').addEventListener('click', recommend);
    $('absCopy').addEventListener('click', function () { copyText(summaryText(), 'absCopyMsg'); });
    $('absCsv').addEventListener('click', exportCsv);
  }

  function onShow() { recalc(); }

  window.AbsorberView = { init: init, onShow: onShow };
})();
