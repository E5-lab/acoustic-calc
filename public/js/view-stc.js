/*
 * view-stc.js — 墙体隔声量 Rw / STC 视图（国标 GB/T 50121 与美标 ASTM E413 双标准）
 * 依赖：window.Insulation（内核）、window.MiniChart（绘图）
 */
(function () {
  'use strict';

  var E = window.Insulation, Chart = window.MiniChart;
  var state = {
    mode: 'mass', mat: 'gypsum', thick: 12,
    m1: 'gypsum', t1: 12, m2: 'gypsum', t2: 12, cavity: 75,
    req: 'dwell-partition', ref: 'gb', fieldMode: 'lab'
  };
  var last = null;
  var inited = false;

  var DEFAULT_MEASURED = [32, 34, 36, 38, 40, 42, 44, 46, 47, 48, 50, 52, 53, 54, 54, 53, 52];

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function signed(v, d) {
    if (v == null || isNaN(v)) return '—';
    var n = Number(v).toFixed(d == null ? 0 : d);
    return (v > 0 ? '+' : '') + n;
  }
  function fLabel(f) { return f >= 1000 ? (f / 1000) + 'k' : String(f); }

  function materialOptions(sel) {
    return E.MATERIALS.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
  }

  function requirementOptions() {
    var groups = [], html = '';
    E.GB_REQUIREMENTS.forEach(function (r) {
      if (groups.indexOf(r.group) < 0) groups.push(r.group);
    });
    groups.forEach(function (g) {
      html += '<optgroup label="' + esc(g) + '">';
      E.GB_REQUIREMENTS.filter(function (r) { return r.group === g; }).forEach(function (r) {
        html += '<option value="' + r.id + '"' + (r.id === state.req ? ' selected' : '') + '>' +
          esc(r.name) + '（' + esc(r.metric) + ' ≥ ' + r.limit + ' dB）</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function buildMeasuredGrid() {
    var grid = $('stcGrid');
    if (!grid) return;
    grid.innerHTML = '';
    E.GRID_HZ.forEach(function (f, i) {
      var cell = document.createElement('div');
      cell.className = 'band-cell' + (f <= 200 || f >= 2500 ? ' low-band' : '');
      cell.innerHTML = '<label for="stc-' + i + '">' + fLabel(f) + '</label>' +
        '<input id="stc-' + i + '" type="number" step="0.5" placeholder="dB" value="' + DEFAULT_MEASURED[i] + '">';
      grid.appendChild(cell);
      cell.querySelector('input').addEventListener('input', recalc);
    });
  }

  function readLevels() {
    var out = [];
    for (var i = 0; i < E.GRID_HZ.length; i++) {
      var el = $('stc-' + i);
      var v = el ? parseFloat(el.value) : NaN;
      out.push(isNaN(v) ? null : v);
    }
    return out;
  }

  function syncMass() {
    var m = E.faceMass(state.mat, state.thick);
    if (m != null) $('stcMassVal').value = Number(m.toFixed(2));
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

  // ---------------------------------------------------------------- 计算
  function recalc() {
    var msg = $('stcMsg');
    msg.innerHTML = '';
    var res = null;

    if (state.mode === 'mass') {
      state.thick = parseFloat($('stcThick').value);
      res = E.fromMass({
        mass: parseFloat($('stcMassVal').value),
        materialId: state.mat,
        thickness: state.thick
      });
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
      var raw = readLevels();
      if (state.fieldMode === 'field') {
        var conv = E.dntToR(raw, E.GRID_HZ, parseFloat($('stcArea').value), parseFloat($('stcVolume').value));
        if (conv.ok) {
          res = E.fromLevels(conv.levels, E.GRID_HZ);
          if (res.ok) { res.fieldShift = conv.shift; res.dnt = conv.dnt; res.fieldS = conv.area; res.fieldV = conv.volume; }
        } else {
          res = { ok: false, error: conv.error };
        }
      } else {
        res = E.fromLevels(raw);
      }
    }

    if (!res || !res.ok) {
      last = null;
      $('rwValue').textContent = '—';
      $('stcValue').textContent = '—';
      $('rwNotation').textContent = '';
      $('stcVerdict').textContent = '';
      $('stcStats').innerHTML = '';
      $('stcTable').innerHTML = '';
      $('stcReqResult').innerHTML = '';
      msg.innerHTML = callout('error', esc(res && res.error ? res.error : '参数不完整，请检查输入。'));
      Chart.draw($('stcChart'), { series: [] });
      return;
    }
    last = res;

    var rw = res.rw, st = res.stc;

    // ---- 头部两个单值评价量
    $('rwValue').textContent = rw && rw.ok ? String(rw.value) : '—';
    $('stcValue').textContent = st && st.ok ? String(st.value) : '—';
    $('rwNotation').innerHTML = rw && rw.ok
      ? esc(rw.notation) + '　·　R<sub>w</sub>+C = ' + rw.rwPlusC + ' dB　·　R<sub>w</sub>+C<sub>tr</sub> = ' + rw.rwPlusCtr + ' dB'
      : esc(rw && rw.error ? rw.error : '');

    var verdict = [];
    if (rw && rw.ok) verdict.push('国标 R<sub>w</sub> ' + rw.value + ' dB：' + rwMeaning(rw.value));
    if (st && st.ok) verdict.push('美标 STC-' + st.value + '：' + stcMeaning(st.value));
    if (rw && rw.ok && st && st.ok && rw.value !== st.value) {
      verdict.push('两标准相差 ' + signed(rw.value - st.value) + ' dB（评价频段与单带限值不同）。');
    } else if (rw && rw.ok && st && st.ok) {
      verdict.push('两标准结果一致。');
    }
    $('stcVerdict').innerHTML = verdict.join(' ');

    // ---- 派生量
    var stats = '';
    if (res.mass != null) stats += stat('面密度 m', num(res.mass, 1), 'kg/m²');
    if (res.coincidence != null) stats += stat('吻合频率 f_c', num(res.coincidence, 0), 'Hz', '质量定律失效区');
    if (rw && rw.ok) {
      stats += stat('C 粉红噪声', num(rw.C, 1), 'dB', '修约 ' + signed(rw.c) + ' dB');
      stats += stat('Ctr 交通噪声', num(rw.Ctr, 1), 'dB', '修约 ' + signed(rw.ctr) + ' dB');
      stats += stat('Rw + C', String(rw.rwPlusC), 'dB', '社会/生活噪声');
      stats += stat('Rw + Ctr', String(rw.rwPlusCtr), 'dB', '交通噪声');
      stats += stat('GB 不利偏差之和', num(rw.sumDeficiency, 1), 'dB', '限值 ≤ ' + rw.limit);
    }
    if (res.fieldShift != null) {
      stats += stat('现场换算 ΔR（R−DnT）', signed(res.fieldShift, 1), 'dB', 'S=' + num(res.fieldS, 1) + ' m²，V=' + num(res.fieldV, 1) + ' m³');
    }
    if (st && st.ok) stats += stat('STC 缺量之和 / 单带', num(st.sumDeficiency, 1) + ' / ' + num(st.maxDeficiency, 1), 'dB', '≤ 32 且单带 ≤ 8');
    $('stcStats').innerHTML = stats;

    // ---- 提示
    if (state.mode === 'mass') {
      var fc = res.coincidence;
      msg.innerHTML += callout('info', '质量定律为扩散场估算，精度约 ±3 dB；' +
        (fc != null && fc <= 4000
          ? '该构件吻合频率约 ' + num(fc, 0) + ' Hz 落在评价范围内，实际隔声量在此附近会明显下降，实测值往往低于本估算。'
          : '吻合频率高于评价范围，中高频可按质量定律估算。'));
    }
    if (state.mode === 'double' && res.cavityBonus != null) {
      msg.innerHTML += callout('info', '双层构件按经验式估算（总面密度质量定律 + 3 dB + 空腔增益 ' +
        num(res.cavityBonus, 1) + ' dB）。实际须保证两层之间无刚性声桥、板缝密封，否则隔声量会大幅低于估算。');
    }
    if (rw && rw.ok && rw.sumDeficiency > 24) {
      msg.innerHTML += callout('warn', '国标不利偏差之和已达 ' + num(rw.sumDeficiency, 1) +
        ' dB（限值 ' + rw.limit + ' dB），说明频谱起伏较大，构造可能存在薄弱频段。');
    }
    if (st && st.ok && st.maxDeficiency > 8) {
      msg.innerHTML += callout('warn', '存在单带缺量超过 8 dB 的频带，STC 评级受该频带限制。');
    }
    if (res.fieldShift != null) {
      msg.innerHTML += callout('info', '现场 DnT 口径：已按 R = DnT ' + signed(res.fieldShift, 1) +
        ' dB（S = ' + num(res.fieldS, 1) + ' m²，V = ' + num(res.fieldV, 1) +
        ' m³，T₀ = 0.5 s）逐带换算为 R 后评级。现场表观隔声含侧向传声，通常比实验室结果低 2~5 dB（工程经验值，无统一标准修正）。');
    }
    renderRequirement(res);
    renderTable(res);
    renderChart(res);
  }

  function renderRequirement(res) {
    var box = $('stcReqResult');
    var rw = res.rw;
    if (!rw || !rw.ok) {
      box.innerHTML = callout('warn', '缺少 100–3150 Hz 完整频带数据，无法按国标限值对照。');
      return;
    }
    var chk = E.checkRequirement(rw, state.req);
    if (!chk) { box.innerHTML = ''; return; }
    var txt = (chk.pass ? '满足' : '不满足') + '　' + chk.req.group + ' · ' + chk.req.name +
      '：要求 ' + chk.metric + ' ≥ ' + chk.limit + ' dB；本构件 ' + chk.metric + ' = ' + chk.value + ' dB，' +
      (chk.pass
        ? '余量 ' + chk.margin + ' dB。'
        : '尚差 ' + (-chk.margin) + ' dB（需 Rw ≥ ' + chk.needRw + ' dB 才能满足）。');
    box.innerHTML = callout(chk.pass ? 'ok' : 'error', esc(txt));
  }

  function renderTable(res) {
    var rw = res.rw, st = res.stc;
    var gbC = rw && rw.ok ? E.align(rw.contour, rw.bands, res.bands) : null;
    var gbD = rw && rw.ok ? E.align(rw.deficiencies, rw.bands, res.bands) : null;
    var stC = st && st.ok ? E.align(st.contour, st.bands, res.bands) : null;
    var stD = st && st.ok ? E.align(st.deficiencies, st.bands, res.bands) : null;

    var rows = res.bands.map(function (f, i) {
      function devCell(v, hard) {
        if (v == null) return '<td class="mut">—</td>';
        if (v <= 0) return '<td class="ok">—</td>';
        return '<td class="' + (hard != null && v > hard ? 'bad' : 'warn') + '">' + num(v, 1) + '</td>';
      }
      return '<tr><td>' + fLabel(f) + ' Hz</td>' +
        '<td>' + num(res.levels[i], 1) + '</td>' +
        '<td>' + (gbC ? num(gbC[i], 0) : '—') + '</td>' +
        devCell(gbD ? gbD[i] : null, null) +
        '<td>' + (stC ? num(stC[i], 0) : '—') + '</td>' +
        devCell(stD ? stD[i] : null, 8) +
        '</tr>';
    }).join('');

    var head = '<table class="detail-table wide"><caption>偏差判读：国标不利偏差之和须 ≤ ' +
      (rw && rw.ok ? rw.limit : 32) + ' dB；美标缺量之和 ≤ 32 dB 且单带 ≤ 8 dB</caption><thead><tr>' +
      '<th>1/3 倍频带</th><th>R (dB)</th>' +
      '<th>GB 基准 (Rw)</th><th>GB 不利偏差</th>' +
      '<th>ASTM 轮廓</th><th>STC 缺量</th></tr></thead><tbody>' + rows + '</tbody></table>';
    $('stcTable').innerHTML = head;
  }

  function renderChart(res) {
    var rw = res.rw, st = res.stc;
    var series = [{ name: '隔声量 R', color: '#2563eb', values: res.levels, width: 2.2, radius: 2.6 }];
    if (rw && rw.ok && (state.ref === 'gb' || state.ref === 'both')) {
      series.push({
        name: 'GB 基准', color: '#f59e0b', values: E.align(rw.contour, rw.bands, res.bands),
        dash: [6, 4], width: 1.6, points: false
      });
    }
    if (st && st.ok && (state.ref === 'stc' || state.ref === 'both')) {
      series.push({
        name: 'ASTM 轮廓', color: '#10b981', values: E.align(st.contour, st.bands, res.bands),
        dash: [4, 3], width: 1.6, points: false
      });
    }
    Chart.draw($('stcChart'), {
      x: res.bands,
      xLog: true,
      yMin: 0,
      yTicks: 5,
      yDigits: 0,
      series: series
    });
  }

  // ---------------------------------------------------------------- 文案
  function rwMeaning(v) {
    if (v <= 25) return '可听清隔壁正常说话声，仅适用于私密性要求很低的隔断';
    if (v < 35) return '大声说话可听清，普通轻质隔墙水平';
    if (v < 40) return '一般说话可听见但内容不清晰，低于住宅分户墙要求';
    if (v < 45) return '大声说话勉强可闻，接近住宅分户墙限值';
    if (v < 50) return '大声说话难以听清内容，砌体分户墙常见水平';
    if (v < 55) return '大声说话基本听不到，办公与高要求分户墙水平';
    return '隔声优良，接近重墙或专业隔声构造';
  }
  function stcMeaning(v) {
    if (v <= 25) return '可听清隔壁正常说话声';
    if (v < 35) return '大声说话可听清，轻质隔墙水平';
    if (v < 40) return '一般说话可听见但内容不清晰';
    if (v < 45) return '大声说话勉强可闻，常用砌体分户墙水平';
    if (v < 50) return '大声说话难以听清内容';
    if (v < 55) return '大声说话基本听不到，高要求隔墙';
    return '隔声优良，接近双层重墙或专业隔声构造';
  }

  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub">' + sub + '</div>' : '') + '</div>';
  }
  function callout(kind, html) {
    return '<div class="callout ' + kind + '"><span class="dot"></span><span>' + html + '</span></div>';
  }

  function sourceText() {
    if (state.mode === 'mass') {
      return '单层板质量定律：' + E.findMaterial(state.mat).name + ' ' + num(state.thick, 0) +
        ' mm，面密度 ' + num(last.mass, 1) + ' kg/m²';
    }
    if (state.mode === 'double') {
      return '双层构件：' + E.findMaterial(state.m1).name + ' ' + num(state.t1, 0) + ' mm + ' +
        E.findMaterial(state.m2).name + ' ' + num(state.t2, 0) + ' mm，空腔 ' + num(state.cavity, 0) +
        ' mm，总面密度 ' + num(last.mass, 1) + ' kg/m²';
    }
    return '输入方式：实测隔声量（100–4000 Hz，17 个 1/3 倍频带）';
  }

  function summaryText() {
    if (!last) return '';
    var rw = last.rw, st = last.stc, out = ['墙体隔声量 Rw / STC · 结果摘要'];
    out.push(sourceText());
    if (rw && rw.ok) {
      out.push('国标 GB/T 50121-2005：' + rw.notation + '；Rw+C = ' + rw.rwPlusC +
        ' dB，Rw+Ctr = ' + rw.rwPlusCtr + ' dB，不利偏差之和 ' + num(rw.sumDeficiency, 1) +
        ' dB（限值 ' + rw.limit + '）');
      var chk = E.checkRequirement(rw, state.req);
      if (chk) {
        out.push('限值对照：' + chk.req.group + ' · ' + chk.req.name + '（' + chk.metric + ' ≥ ' + chk.limit +
          ' dB）→ ' + (chk.pass ? '满足，余量 ' + chk.margin + ' dB' : '不满足，尚差 ' + (-chk.margin) + ' dB'));
      }
    } else {
      out.push('国标 Rw：' + (rw && rw.error ? rw.error : '无法计算'));
    }
    if (st && st.ok) {
      out.push('美标 ASTM E413：STC-' + st.value + '（缺量之和 ' + num(st.sumDeficiency, 1) +
        ' dB，单带最大 ' + num(st.maxDeficiency, 1) + ' dB）');
    }
    if (last.coincidence) out.push('吻合频率 f_c ≈ ' + num(last.coincidence, 0) + ' Hz');
    out.push('逐带隔声量：' + last.bands.map(function (f, i) {
      return f + 'Hz=' + num(last.levels[i], 1);
    }).join('，'));
    out.push('工具：声学计算工具箱 · 墙体隔声量 Rw / STC');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rw = last.rw, st = last.stc;
    var rows = [['墙体隔声量计算结果（GB/T 50121-2005 与 ASTM E413）', '', '', '', '', '']];
    rows.push(['Rw (dB)', rw && rw.ok ? String(rw.value) : '', '', '', '', '']);
    rows.push(['C (dB)', rw && rw.ok ? num(rw.C, 2) : '', '修约', rw && rw.ok ? rw.c : '', '', '']);
    rows.push(['Ctr (dB)', rw && rw.ok ? num(rw.Ctr, 2) : '', '修约', rw && rw.ok ? rw.ctr : '', '', '']);
    rows.push(['Rw + C (dB)', rw && rw.ok ? String(rw.rwPlusC) : '', '', '', '', '']);
    rows.push(['Rw + Ctr (dB)', rw && rw.ok ? String(rw.rwPlusCtr) : '', '', '', '', '']);
    rows.push(['STC', st && st.ok ? String(st.value) : '', '', '', '', '']);
    rows.push(['面密度 (kg/m²)', last.mass != null ? num(last.mass, 2) : '', '', '', '', '']);
    rows.push(['吻合频率 (Hz)', last.coincidence ? num(last.coincidence, 0) : '', '', '', '', '']);
    rows.push(['GB 不利偏差之和 (dB)', rw && rw.ok ? num(rw.sumDeficiency, 2) : '', '限值', rw && rw.ok ? rw.limit : '', '', '']);
    rows.push(['STC 缺量之和 (dB)', st && st.ok ? num(st.sumDeficiency, 2) : '', '限值 32，单带 8', '', '', '']);
    var chk = rw && rw.ok ? E.checkRequirement(rw, state.req) : null;
    if (chk) {
      rows.push(['限值对照', chk.req.group + ' ' + chk.req.name, chk.metric + ' ≥ ' + chk.limit,
        chk.value, chk.pass ? '满足' : '不满足', '余量 ' + chk.margin]);
    }
    rows.push([]);
    rows.push(['1/3 倍频带 (Hz)', 'R (dB)', 'GB 基准 (dB)', 'GB 不利偏差 (dB)', 'ASTM 轮廓 (dB)', 'STC 缺量 (dB)']);
    var gbC = rw && rw.ok ? E.align(rw.contour, rw.bands, last.bands) : [];
    var gbD = rw && rw.ok ? E.align(rw.deficiencies, rw.bands, last.bands) : [];
    var stC = st && st.ok ? E.align(st.contour, st.bands, last.bands) : [];
    var stD = st && st.ok ? E.align(st.deficiencies, st.bands, last.bands) : [];
    last.bands.forEach(function (f, i) {
      rows.push([
        f,
        num(last.levels[i], 2),
        gbC[i] == null ? '' : num(gbC[i], 0),
        gbD[i] == null ? '' : num(gbD[i], 2),
        stC[i] == null ? '' : num(stC[i], 0),
        stD[i] == null ? '' : num(stD[i], 2)
      ]);
    });
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'rw-stc-result.csv';
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

  // ---------------------------------------------------------------- 初始化
  function init() {
    if (inited) return;
    inited = true;

    $('stcMat').innerHTML = materialOptions(state.mat);
    $('stcM1').innerHTML = materialOptions(state.m1);
    $('stcM2').innerHTML = materialOptions(state.m2);
    $('stcReq').innerHTML = requirementOptions();
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
    $('stcReq').addEventListener('change', function () { state.req = this.value; if (last) { renderRequirement(last); } });
    $('stcRefLine').addEventListener('change', function () { state.ref = this.value; if (last) renderChart(last); });
    $('stcFieldMode').addEventListener('change', function () {
      state.fieldMode = this.value;
      var cap = $('stcGridCaption');
      if (cap) cap.textContent = state.fieldMode === 'field'
        ? '按 100–4000 Hz 共 17 个 1/3 倍频带填入现场实测标准化声压级差 DnT（dB）：评级前将按 R = DnT + 10lg(S·T₀/(0.16V))（T₀ = 0.5 s）逐带换算为 R。'
        : '按 100–4000 Hz 共 17 个 1/3 倍频带填入实测隔声量（dB）：国标 Rw 用 100–3150 Hz 共 16 带，美标 STC 用 125–4000 Hz 共 16 带，故一并提供 17 带。';
      recalc();
    });
    ['stcArea', 'stcVolume'].forEach(function (id) {
      $(id).addEventListener('input', function () { if (state.mode === 'measured' && state.fieldMode === 'field') recalc(); });
    });
    $('stcAvgBtn').addEventListener('click', function () {
      var txt = ($('stcRuns').value || '').trim();
      if (!txt) { flash('stcAvgMsg', '请先粘贴测量数据'); return; }
      var runs = [];
      txt.split(/\n+/).forEach(function (line) {
        var vals = line.split(/[\s,;，、]+/).map(parseFloat).filter(function (v) { return !isNaN(v); });
        if (vals.length >= 16) runs.push(vals.slice(0, E.GRID_HZ.length));
      });
      if (!runs.length) { flash('stcAvgMsg', '未解析到有效测量行（每行至少 16 个数值）'); return; }
      var avg = E.averageRuns(runs, E.GRID_HZ);
      if (!avg.ok) { flash('stcAvgMsg', avg.error); return; }
      avg.mean.forEach(function (v, i) {
        var el = $('stc-' + i);
        if (el && v != null) el.value = Number(v.toFixed(2));
      });
      var maxStd = 0;
      avg.std.forEach(function (s) { if (s != null && s > maxStd) maxStd = s; });
      flash('stcAvgMsg', '已按 ' + runs.length + ' 次测量算术平均填入（逐带最大样本标准差 ' + maxStd.toFixed(2) + ' dB）');
      recalc();
    });
    $('stcCopy').addEventListener('click', function () { copyText(summaryText(), 'stcCopyMsg'); });
    $('stcCsv').addEventListener('click', exportCsv);
  }

  function onShow() { recalc(); }

  window.StcView = { init: init, onShow: onShow };
})();
