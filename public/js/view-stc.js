/*
 * view-stc.js — 墙体隔声量 STC 视图
 * 依赖：window.Insulation（内核）、window.MiniChart（绘图）
 */
(function () {
  'use strict';

  var E = window.Insulation, Chart = window.MiniChart;
  var state = { mode: 'mass', mat: 'gypsum', thick: 12, m1: 'gypsum', t1: 12, m2: 'gypsum', t2: 12, cavity: 75 };
  var last = null;
  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  function materialOptions(sel) {
    return E.MATERIALS.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
  }

  function buildMeasuredGrid() {
    var grid = $('stcGrid');
    grid.innerHTML = '';
    E.CONTOUR_HZ.forEach(function (f, i) {
      var cell = document.createElement('div');
      cell.className = 'band-cell';
      cell.innerHTML = '<label for="stc-' + i + '">' + (f >= 1000 ? (f / 1000) + 'k' : f) + '</label>' +
        '<input id="stc-' + i + '" type="number" step="0.5" placeholder="dB" value="' +
        (i % 2 === 0 ? 30 + i : 31 + i) + '">';
      grid.appendChild(cell);
      cell.querySelector('input').addEventListener('input', recalc);
    });
  }

  function readLevels() {
    var out = [];
    for (var i = 0; i < E.CONTOUR_HZ.length; i++) {
      var v = parseFloat($('stc-' + i).value);
      out.push(isNaN(v) ? null : v);
    }
    return out;
  }

  function setMode(mode) {
    state.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('#view-stc .mode-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-stc-mode') === mode);
    });
    $('stcMass').hidden = mode !== 'mass';
    $('stcDouble').hidden = mode !== 'double';
    $('stcMeasured').hidden = mode !== 'measured';
    recalc();
  }

  function recalc() {
    var msg = $('stcMsg');
    msg.innerHTML = '';
    var res = null;

    if (state.mode === 'mass') {
      state.thick = parseFloat($('stcThick').value);
      var mass = parseFloat($('stcMassVal').value);
      res = E.fromMass({ mass: mass, materialId: state.mat, thickness: state.thick });
    } else if (state.mode === 'double') {
      state.t1 = parseFloat($('stcT1').value);
      state.t2 = parseFloat($('stcT2').value);
      state.cavity = parseFloat($('stcCav').value);
      res = E.doubleLeaf({
        mass1: E.faceMass(state.m1, state.t1),
        mass2: E.faceMass(state.m2, state.t2),
        cavity: state.cavity
      });
    } else {
      res = E.fromLevels(readLevels());
    }

    if (!res || !res.ok) {
      last = null;
      $('stcValue').textContent = '—';
      $('stcVerdict').textContent = '';
      $('stcStats').innerHTML = '';
      $('stcTable').innerHTML = '';
      msg.innerHTML = '<div class="callout error"><span class="dot"></span><span>' +
        esc(res && res.error ? res.error : '参数不完整，请检查输入。') + '</span></div>';
      Chart.draw($('stcChart'), { series: [] });
      return;
    }
    last = res;

    $('stcValue').textContent = 'STC-' + res.stcValue;
    $('stcVerdict').innerHTML = stcMeaning(res.stcValue);

    var fc = res.coincidence;
    $('stcStats').innerHTML =
      stat('面密度 m', num(res.mass, 1), 'kg/m²') +
      stat('吻合频率 f_c', fc == null ? '—' : num(fc, 0), fc == null ? '' : 'Hz') +
      stat('缺量之和', num(res.sumDeficiency, 1), 'dB', '限值 ≤ 32') +
      stat('最大单带缺量', num(res.maxDeficiency, 1), 'dB', '限值 ≤ 8');

    if (state.mode === 'mass') {
      msg.innerHTML += '<div class="callout info"><span class="dot"></span><span>质量定律为扩散场估算，精度约 ±3 dB；' +
        (fc != null && fc <= 4000
          ? '该构件吻合频率约 ' + num(fc, 0) + ' Hz 落在评价范围内，实际隔声量在此附近会明显下降，实测 STC 往往低于本估算值。'
          : '吻合频率高于评价范围，中高频可按质量定律估算。') +
        '</span></div>';
    }
    if (state.mode === 'double' && res.cavityBonus != null) {
      msg.innerHTML += '<div class="callout info"><span class="dot"></span><span>双层构件按经验式估算（总面密度质量定律 + 3 dB + 空腔增益 ' +
        num(res.cavityBonus, 1) + ' dB）。实际须保证两层之间无刚性声桥、板缝密封，否则隔声量会大幅低于估算。</span></div>';
    }
    if (res.sumDeficiency > 24) {
      msg.innerHTML += '<div class="callout warn"><span class="dot"></span><span>缺量之和已接近 STC 限值（32 dB），说明频谱起伏较大，造型或构造可能有薄弱频段。</span></div>';
    }

    var rows = res.bands.map(function (f, i) {
      var def = res.deficiencies[i];
      return '<tr><td>' + (f >= 1000 ? (f / 1000) + 'k' : f) + ' Hz</td><td>' + num(res.levels[i], 1) +
        '</td><td>' + num(res.contour[i], 0) + '</td><td class="' + (def > 8 ? 'bad' : (def > 0 ? 'warn' : 'ok')) + '">' +
        (def > 0 ? num(def, 1) : '—') + '</td></tr>';
    }).join('');
    $('stcTable').innerHTML = '<table class="detail-table wide"><thead><tr><th>1/3 倍频带</th><th>隔声量 R (dB)</th>' +
      '<th>STC-' + res.stcValue + ' 轮廓</th><th>缺量 (dB)</th></tr></thead><tbody>' + rows + '</tbody></table>';

    Chart.draw($('stcChart'), {
      x: res.bands,
      xLog: true,
      yMin: 0,
      yTicks: 5,
      yDigits: 0,
      series: [
        { name: 'STC 轮廓', color: '#f59e0b', values: res.contour, dash: [6, 4], width: 1.6, points: false },
        { name: '隔声量 R', color: '#2563eb', values: res.levels, width: 2.2, radius: 2.6 }
      ]
    });
  }

  function stcMeaning(v) {
    var text;
    if (v <= 25) text = '可听清隔壁正常说话声，仅适用于对私密性要求很低的隔断';
    else if (v < 35) text = '大声说话可听清，普通轻质隔墙水平';
    else if (v < 40) text = '一般说话可听见但内容不清晰，住宅分户墙下限';
    else if (v < 45) text = '大声说话勉强可闻，常用砌体分户墙水平';
    else if (v < 50) text = '大声说话难以听清内容，办公与住宅分室墙的常见要求';
    else if (v < 55) text = '大声说话基本听不到，录音室、会议室等高要求隔墙';
    else text = '隔声优良，接近双层重墙或专业隔声构造';
    return esc(text);
  }

  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub">' + sub + '</div>' : '') + '</div>';
  }

  function summaryText() {
    if (!last) return '';
    var out = ['墙体隔声量 STC · 结果摘要'];
    if (state.mode === 'mass') {
      out.push('单层板质量定律：' + E.findMaterial(state.mat).name + ' ' + num(state.thick, 0) + ' mm，面密度 ' + num(last.mass, 1) + ' kg/m²');
    } else if (state.mode === 'double') {
      out.push('双层构件：' + E.findMaterial(state.m1).name + ' ' + num(state.t1, 0) + ' mm + ' +
        E.findMaterial(state.m2).name + ' ' + num(state.t2, 0) + ' mm，空腔 ' + num(state.cavity, 0) + ' mm，总面密度 ' + num(last.mass, 1) + ' kg/m²');
    } else {
      out.push('输入方式：实测隔声量');
    }
    out.push('STC = ' + last.stcValue + '（缺量之和 ' + num(last.sumDeficiency, 1) + ' dB / 最大单带缺量 ' + num(last.maxDeficiency, 1) + ' dB）');
    out.push('逐带隔声量：' + last.bands.map(function (f, i) {
      return f + 'Hz=' + num(last.levels[i], 1);
    }).join('，'));
    if (last.coincidence) out.push('吻合频率 f_c ≈ ' + num(last.coincidence, 0) + ' Hz');
    out.push('工具：声学计算工具箱 · 墙体隔声量 STC');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rows = [['墙体隔声量 STC 计算结果', '', '']];
    rows.push(['STC', String(last.stcValue), '']);
    rows.push(['面密度 (kg/m²)', num(last.mass, 2), '']);
    rows.push(['吻合频率 (Hz)', last.coincidence ? num(last.coincidence, 0) : '', '']);
    rows.push(['缺量之和 (dB)', num(last.sumDeficiency, 2), '限值 ≤ 32']);
    rows.push(['最大单带缺量 (dB)', num(last.maxDeficiency, 2), '限值 ≤ 8']);
    rows.push([]);
    rows.push(['1/3 倍频带 (Hz)', '隔声量 R (dB)', 'STC 轮廓 (dB)', '缺量 (dB)']);
    last.bands.forEach(function (f, i) {
      rows.push([f, num(last.levels[i], 2), num(last.contour[i], 0), num(last.deficiencies[i], 2)]);
    });
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'stc-result.csv';
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

  function syncMass() {
    var m = E.faceMass(state.mat, state.thick);
    if (m != null) $('stcMassVal').value = Number(m.toFixed(2));
  }

  function init() {
    if (inited) return;
    inited = true;

    $('stcMat').innerHTML = materialOptions(state.mat);
    $('stcM1').innerHTML = materialOptions(state.m1);
    $('stcM2').innerHTML = materialOptions(state.m2);
    buildMeasuredGrid();
    syncMass();
    recalc();

    Array.prototype.forEach.call(document.querySelectorAll('#view-stc .mode-btn'), function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-stc-mode')); });
    });
    $('stcMat').addEventListener('change', function () { state.mat = this.value; syncMass(); recalc(); });
    $('stcThick').addEventListener('input', function () { state.thick = parseFloat(this.value); syncMass(); recalc(); });
    $('stcMassVal').addEventListener('input', recalc);
    $('stcM1').addEventListener('change', function () { state.m1 = this.value; recalc(); });
    $('stcM2').addEventListener('change', function () { state.m2 = this.value; recalc(); });
    ['stcT1', 'stcT2', 'stcCav'].forEach(function (id) { $(id).addEventListener('input', recalc); });
    $('stcCopy').addEventListener('click', function () { copyText(summaryText(), 'stcCopyMsg'); });
    $('stcCsv').addEventListener('click', exportCsv);
  }

  function onShow() { recalc(); }

  window.StcView = { init: init, onShow: onShow };
})();
