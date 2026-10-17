/*
 * view-rt60.js — 室内混响时间 RT60 视图
 * 依赖：window.Room（内核）、window.MiniChart（绘图）
 */
(function () {
  'use strict';

  var E = window.Room, Chart = window.MiniChart;

  var AUTO = { floor: 'l*w', ceiling: 'l*w', walls: '2*h*(l+w)' };
  var state = {
    dims: { l: 9, w: 6, h: 3.5 },
    air: true,
    filler: 'plaster',
    use: 'classroom',
    rows: [
      { name: '地面', area: 54, materialId: 'woodfloor', auto: 'floor' },
      { name: '顶棚', area: 54, materialId: 'mineral-panel', auto: 'ceiling' }
    ]
  };
  var last = null;
  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  function autoArea(kind) {
    var d = state.dims;
    if (kind === 'floor' || kind === 'ceiling') return d.l * d.w;
    if (kind === 'walls') return 2 * d.h * (d.l + d.w);
    return null;
  }

  function refreshAutoAreas() {
    state.rows.forEach(function (r) {
      if (r.auto) r.area = autoArea(r.auto);
    });
  }

  function materialOptions(selected) {
    return E.MATERIALS.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
  }

  function renderRows() {
    var box = $('rtRows');
    box.innerHTML = '';
    state.rows.forEach(function (r, idx) {
      var row = document.createElement('div');
      row.className = 'mat-row';
      row.innerHTML =
        '<input type="text" value="' + esc(r.name) + '" aria-label="表面名称" />' +
        '<input type="number" step="0.1" min="0" value="' + (r.area == null ? '' : r.area) + '" aria-label="面积 m²" />' +
        '<select aria-label="材料">' + materialOptions(r.materialId) + '</select>' +
        '<button class="icon-btn" type="button" title="删除该表面">×</button>';
      var inputs = row.querySelectorAll('input');
      inputs[0].addEventListener('input', function () { r.name = this.value; recalc(); });
      inputs[1].addEventListener('input', function () {
        r.area = parseFloat(this.value);
        r.auto = null;
        recalc();
      });
      row.querySelector('select').addEventListener('change', function () {
        r.materialId = this.value;
        recalc();
      });
      row.querySelector('button').addEventListener('click', function () {
        state.rows.splice(idx, 1);
        renderRows();
        recalc();
      });
      box.appendChild(row);
    });
  }

  function recalc() {
    state.dims.l = parseFloat($('rtL').value);
    state.dims.w = parseFloat($('rtW').value);
    state.dims.h = parseFloat($('rtH').value);
    state.air = $('rtAir').value === '1';

    var msg = $('rtMsg');
    msg.innerHTML = '';

    if (!(state.dims.l > 0) || !(state.dims.w > 0) || !(state.dims.h > 0)) {
      last = null;
      $('rtGeom').textContent = '请输入有效的房间长、宽、高（均 > 0）。';
      $('rtMid').textContent = '—';
      $('rtStats').innerHTML = '';
      $('rtTable').innerHTML = '';
      Chart.draw($('rtChart'), { series: [] });
      return;
    }

    refreshAutoAreas();
    syncAreaInputs();

    var calc = E.compute({
      length: state.dims.l, width: state.dims.w, height: state.dims.h,
      surfaces: state.rows,
      fillerMaterialId: state.filler,
      airAbsorption: state.air
    });
    if (!calc.ok) {
      last = null;
      msg.innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(calc.error) + '</span></div>';
      return;
    }
    last = calc;

    $('rtGeom').innerHTML = '体积 V = ' + num(calc.volume, 1) + ' m³　·　总表面积 ' +
      (calc.geomArea ? num(calc.geomArea, 1) + ' m²' : '—') +
      '　·　已单独列出表面 ' + num(listedArea(), 1) + ' m²' +
      (calc.geomArea ? '，其余 ' + num(Math.max(0, calc.geomArea - listedArea()), 1) + ' m² 按所选材料计' : '');

    var mid = calc.rtMidSabine;
    $('rtMid').textContent = mid == null ? '—' : mid.toFixed(2);
    var ev = E.evaluate(state.use, mid);
    var cls = ev.status === 'pass' ? 'ok' : 'warn';
    $('rtVerdict').innerHTML = '<span class="' + cls + '">' + ev.text + '</span>' +
      '（推荐 ' + ev.target[0] + '–' + ev.target[1] + ' s' +
      (ev.margin ? '，超出 ' + num(ev.margin, 2) + ' s' : '') + '）';

    $('rtStats').innerHTML =
      stat('体积 V', num(calc.volume, 1), 'm³') +
      stat('总表面积 S', calc.geomArea ? num(calc.geomArea, 1) : num(calc.totalArea, 1), 'm²') +
      stat('平均吸声系数 ᾱ @500 Hz', num(calc.avgAlpha[E.BANDS.indexOf(500)], 3), '') +
      stat('Eyring 中频 RT', num(calc.rtMidEyring, 2), 's');

    // 判定区间条
    var hi = ev.target[1], lo = ev.target[0];
    var scale = Math.max(hi * 2.2, (mid || hi) * 1.15, 1);
    var toPct = function (v) { return Math.max(0, Math.min(100, v / scale * 100)); };
    $('rtRange').innerHTML =
      '<div class="range-bar">' +
      '<div class="band" style="left:' + toPct(lo) + '%;width:' + (toPct(hi) - toPct(lo)) + '%"></div>' +
      (mid == null ? '' : '<div class="mark" style="left:' + toPct(mid) + '%"></div>') +
      '</div><div class="range-legend"><span>0 s</span><span>推荐 ' + lo + '–' + hi +
      ' s（中频）</span><span>' + num(scale, 1) + ' s</span></div>';

    // 改进建议
    var sug = E.suggest(calc, state.use, 'mineral-panel');
    if (sug && sug.needed > 0) {
      $('rtSuggest').innerHTML = '<div class="callout warn"><span class="dot"></span><span>吸声量不足，建议至少增加 ' +
        num(sug.needed, 1) + ' m²·（吸声量）；若采用「' + esc(sug.material.name) + '」（500 Hz–1 kHz α ≈ ' +
        num(sug.alpha, 2) + '），约需 ' + num(sug.area, 1) + ' m² 该吸声面积。</span></div>';
    } else {
      $('rtSuggest').innerHTML = '<div class="callout ok"><span class="dot"></span><span>中频混响时间已达推荐上限要求，无需再增加吸声量。</span></div>';
    }

    // 明细表
    var rtRows = E.BANDS.map(function (f, i) {
      return '<tr><td>' + f + ' Hz</td><td>' + num(calc.absorption[i], 1) + '</td><td>' +
        num(calc.avgAlpha[i], 3) + '</td><td>' + num(calc.rtSabine[i], 2) + '</td><td>' +
        num(calc.rtEyring[i], 2) + '</td></tr>';
    }).join('');
    $('rtTable').innerHTML = '<table class="detail-table wide"><thead><tr>' +
      '<th>频带</th><th>ΣαᵢSᵢ</th><th>ᾱ</th><th>Sabine RT (s)</th><th>Eyring RT (s)</th></tr></thead><tbody>' +
      rtRows + '</tbody></table>';

    Chart.draw($('rtChart'), {
      x: E.BANDS,
      xLog: true,
      yMin: 0,
      yTicks: 5,
      hBands: [{ from: lo, to: hi, color: 'rgba(245, 158, 11, 0.14)' }],
      series: [
        { name: 'Eyring', color: '#10b981', values: calc.rtEyring, width: 1.8, radius: 2.6 },
        { name: 'Sabine', color: '#2563eb', values: calc.rtSabine, width: 2.2, radius: 3.4 }
      ]
    });
  }

  function listedArea() {
    var s = 0;
    state.rows.forEach(function (r) { if (r.area > 0) s += r.area; });
    return s;
  }

  function syncAreaInputs() {
    var rows = $('rtRows').children;
    for (var i = 0; i < state.rows.length && i < rows.length; i++) {
      var inputs = rows[i].querySelectorAll('input');
      if (inputs[1] && document.activeElement !== inputs[1]) {
        inputs[1].value = state.rows[i].area == null ? '' : state.rows[i].area;
      }
    }
  }

  function stat(label, value, unit) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div></div>';
  }

  function summaryText() {
    if (!last) return '';
    var ev = E.evaluate(state.use, last.rtMidSabine);
    var out = ['室内混响时间 RT60 · 结果摘要'];
    out.push('房间尺寸：' + num(state.dims.l, 2) + ' × ' + num(state.dims.w, 2) + ' × ' + num(state.dims.h, 2) +
      ' m（V = ' + num(last.volume, 1) + ' m³，S = ' + num(last.totalArea, 1) + ' m²）');
    out.push('表面构造：' + last.rows.map(function (r) {
      return r.name + ' ' + num(r.area, 1) + ' m²';
    }).join('；'));
    out.push('中频 RT（500 Hz–1 kHz）Sabine = ' + num(last.rtMidSabine, 2) + ' s，Eyring = ' + num(last.rtMidEyring, 2) + ' s');
    out.push('逐带 Sabine RT：' + E.BANDS.map(function (f, i) {
      return f + 'Hz=' + num(last.rtSabine[i], 2);
    }).join('，'));
    out.push('用途判定（' + ev.use.name + '）：' + ev.text + '，推荐 ' + ev.target[0] + '–' + ev.target[1] + ' s');
    out.push('空气吸收：' + (state.air ? '已计入（20 ℃ / 50 % RH）' : '未计入'));
    out.push('工具：声学计算工具箱 · 室内混响时间');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rows = [['室内混响时间 RT60', '', '']];
    rows.push(['长 (m)', String(state.dims.l), '']);
    rows.push(['宽 (m)', String(state.dims.w), '']);
    rows.push(['高 (m)', String(state.dims.h), '']);
    rows.push(['体积 (m³)', num(last.volume, 2), '']);
    rows.push(['总表面积 (m²)', num(last.totalArea, 2), '']);
    rows.push(['中频 RT Sabine (s)', num(last.rtMidSabine, 3), '']);
    rows.push(['中频 RT Eyring (s)', num(last.rtMidEyring, 3), '']);
    rows.push([]);
    rows.push(['表面', '面积 (m²)', '500 Hz 吸声系数']);
    last.rows.forEach(function (r) {
      rows.push([r.name, num(r.area, 2), num(r.alpha[E.BANDS.indexOf(500)], 3)]);
    });
    rows.push([]);
    rows.push(['频率 (Hz)', 'ΣαᵢSᵢ', '平均吸声系数', 'Sabine RT (s)', 'Eyring RT (s)']);
    E.BANDS.forEach(function (f, i) {
      rows.push([f, num(last.absorption[i], 2), num(last.avgAlpha[i], 3), num(last.rtSabine[i], 3), num(last.rtEyring[i], 3)]);
    });
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'rt60-result.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(txt, id) {
    if (!txt) { flash(id, '暂无可复制结果'); return; }
    var done = function () { flash(id, '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallback(txt, done); });
    } else fallback(txt, done);
  }
  function fallback(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动选择文本。'); }
    document.body.removeChild(ta);
  }
  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function init(_mode, params) {
    if (inited) return;
    inited = true;

    $('rtFiller').innerHTML = materialOptions(state.filler);
    $('rtUse').innerHTML = E.ROOM_USES.map(function (u) {
      return '<option value="' + u.id + '"' + (u.id === state.use ? ' selected' : '') + '>' +
        u.name + '（' + u.rt[0] + '–' + u.rt[1] + ' s）</option>';
    }).join('');

    renderRows();
    recalc();

    ['rtL', 'rtW', 'rtH'].forEach(function (id) { $(id).addEventListener('input', recalc); });
    $('rtAir').addEventListener('change', recalc);
    $('rtFiller').addEventListener('change', function () { state.filler = this.value; recalc(); });
    $('rtUse').addEventListener('change', function () { state.use = this.value; recalc(); });
    $('rtAdd').addEventListener('click', function () {
      state.rows.push({ name: '新增表面', area: 0, materialId: 'glass' });
      renderRows();
      recalc();
    });
    $('rtCopy').addEventListener('click', function () { copyText(summaryText(), 'rtCopyMsg'); });
    $('rtCsv').addEventListener('click', exportCsv);

    /* 深链分享：#/rt60?L=..&W=..&H=..&air=1&filler=..&use=..&rows=<URI编码的JSON>
       打开链接的人得到完全相同的房间尺寸、吸声材料表与用途设定 */
    function collect() {
      return {
        L: $('rtL').value, W: $('rtW').value, H: $('rtH').value,
        air: $('rtAir').value, filler: state.filler, use: state.use,
        rows: JSON.stringify(state.rows)
      };
    }
    function applyRows(rowsJson) {
      var arr;
      try { arr = JSON.parse(rowsJson); } catch (e) { return; }
      if (!arr || !arr.length) return;
      state.rows = arr.filter(function (r) {
        return r && typeof r === 'object' && isFinite(parseFloat(r.area));
      }).map(function (r) {
        var row = { name: String(r.name || '表面'), area: parseFloat(r.area) || 0, materialId: String(r.materialId || 'glass') };
        if (r.auto === 'floor' || r.auto === 'ceiling') row.auto = r.auto;
        return row;
      });
      renderRows();
    }
    function applyParams(p) {
      if (!p) return;
      if (p.L != null && p.L !== '' && isFinite(parseFloat(p.L))) $('rtL').value = p.L;
      if (p.W != null && p.W !== '' && isFinite(parseFloat(p.W))) $('rtW').value = p.W;
      if (p.H != null && p.H !== '' && isFinite(parseFloat(p.H))) $('rtH').value = p.H;
      if (p.air === '1' || p.air === '0') $('rtAir').value = p.air;
      if (p.filler) { state.filler = p.filler; $('rtFiller').value = p.filler; }
      if (p.use) { state.use = p.use; $('rtUse').value = p.use; }
      if (p.rows) applyRows(p.rows);
      recalc();
    }
    var shareBtn = $('rtShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (!(window.AppShare && window.AppRouter)) return;
        var l = AppRouter.link('rt60', collect());
        if (l.tooLong) { AppShare.toast('参数过多，链接超长，仍可复制使用', 'warn'); }
        AppShare.copy(l.url).then(function () { AppShare.toast('已复制分享链接', 'ok'); },
                                  function () { AppShare.toast('复制失败，请手动复制地址栏', 'warn'); });
      });
    }
    if (params) applyParams(params);
  }

  function onShow() { recalc(); }

  window.Rt60View = { init: init, onShow: onShow };
})();
