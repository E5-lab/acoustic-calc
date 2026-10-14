/*
 * app.js — 声学计算器前端交互
 * 支持 1/1 倍频程（16–8000 Hz）与 1/3 倍频程（16–10000 Hz）两种输入模式。
 */
(function () {
  'use strict';
  var A = window.Acoustics;

  // 示例倍频程频谱（16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000）
  var SAMPLES = [
    { name: '典型办公室实测', levels: [null, 58, 52, 45, 40, 36, 33, 30, 28, 26] },
    { name: '安静卧室', levels: [52, 55, 46, 38, 31, 27, 24, 22, 20, 18] },
    { name: '会议室', levels: [55, 57, 48, 41, 35, 31, 29, 28, 27, 25] },
    { name: '中性频谱（N 判定示例）', levels: [55, 55, 50, 45, 40, 35, 30, 25, 20, 15] },
    { name: '低频隆隆（R / RV 示例）', levels: [72, 70, 62, 55, 52, 36, 30, 25, 20, 15] },
    { name: '高频嘶声（H 示例）', levels: [55, 50, 45, 40, 35, 35, 35, 30, 28, 26] }
  ];
  var DEFAULT_SAMPLE = 0;
  var DEFAULT_ROOM = 'private';

  var mode = (typeof location !== 'undefined' && location.hash === '#third') ? 'third' : 'octave'; // 'octave' | 'third'

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d == null ? 1 : d);
  }
  function signed(n, d) {
    if (n == null || isNaN(n)) return '—';
    return (n >= 0 ? '+' : '') + Number(n).toFixed(d == null ? 1 : d);
  }
  function bands() { return mode === 'third' ? A.THIRD_BANDS : A.BANDS; }
  function bandCount() { return bands().length; }

  var lastResult = null;

  // 由倍频程频谱估算 1/3 倍频程频谱（能量均分，便于演示与自检）
  function octaveToThird(oct) {
    return A.THIRD_BANDS.map(function (f3) {
      var fo = null;
      for (var i = 0; i < A.BANDS.length; i++) {
        var f = A.BANDS[i];
        if (f3 >= f / Math.SQRT2 && f3 <= f * Math.SQRT2) { fo = f; break; }
      }
      if (fo == null) return null;
      var v = oct[A.BANDS.indexOf(fo)];
      if (v == null) return null;
      var cnt = A.THIRD_BANDS.filter(function (x) {
        return x >= fo / Math.SQRT2 && x <= fo * Math.SQRT2;
      }).length;
      return v - 10 * Math.log10(cnt);
    });
  }

  function buildGrid() {
    var grid = $('bandGrid');
    var bs = bands();
    grid.innerHTML = '';
    grid.className = 'band-grid' + (mode === 'third' ? ' third' : '');
    bs.forEach(function (f, i) {
      var cell = document.createElement('div');
      cell.className = 'band-cell' + (f === 16 ? ' low-band' : '');
      var label = document.createElement('label');
      label.textContent = f >= 1000 ? (f / 1000) + 'k' : String(f);
      label.title = f + ' Hz';
      label.setAttribute('for', 'band-' + i);
      var input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.id = 'band-' + i;
      input.placeholder = 'dB';
      cell.appendChild(label);
      cell.appendChild(input);
      grid.appendChild(cell);
    });
    $('bandHint').textContent = mode === 'third'
      ? '（dB，1/3 倍频程 16 Hz–10 kHz 共 29 带）'
      : '（dB，1/1 倍频程 16 Hz–8 kHz 共 10 带）';
  }

  function buildSampleOptions() {
    var sel = $('sampleSelect');
    sel.innerHTML = '<option value="">载入示例…</option>';
    SAMPLES.forEach(function (s, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  }

  function buildRoomOptions() {
    var sel = $('roomSelect');
    sel.innerHTML = '';
    A.ROOM_TARGETS.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name + '（目标 NC ' + t.nc[0] + '–' + t.nc[1] + '）';
      sel.appendChild(opt);
    });
    sel.value = DEFAULT_ROOM;
  }

  function readLevels() {
    return bands().map(function (f, i) {
      var v = parseFloat($('band-' + i).value);
      return isNaN(v) ? null : v;
    });
  }

  function writeLevels(levels) {
    bands().forEach(function (f, i) {
      var v = levels[i];
      $('band-' + i).value = (v == null || isNaN(v)) ? '' : (Math.round(v * 10) / 10);
    });
  }

  function clearAll() {
    bands().forEach(function (f, i) { $('band-' + i).value = ''; });
    $('results').style.display = 'none';
    $('exportRow').style.display = 'none';
    $('modeNote').textContent = '';
    lastResult = null;
    renderTarget();
  }

  function setMode(next) {
    mode = next;
    buildGrid();
    var s = SAMPLES[DEFAULT_SAMPLE];
    writeLevels(mode === 'third' ? octaveToThird(s.levels) : s.levels);
    var btns = document.querySelectorAll('.mode-btn');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    calculate();
  }

  function calculate() {
    var raw = readLevels();
    if (!raw.some(function (v) { return v != null; })) {
      $('results').style.display = 'none';
      $('exportRow').style.display = 'none';
      $('modeNote').textContent = '';
      lastResult = null;
      renderTarget();
      return;
    }

    var levels, missing = 0;
    if (mode === 'third') {
      var synth = A.thirdToOctave(raw);
      levels = synth.octave;
      missing = synth.missingBands;
      $('modeNote').textContent = missing
        ? '1/3 倍频程已合成倍频程；其中 ' + missing + ' 个倍频带因数据缺失未参与评价。'
        : '1/3 倍频程已按各带能量合成为倍频程，再按 S12.2 评价（该标准各评价量本身为倍频程量）。';
    } else {
      levels = raw;
      $('modeNote').textContent = '';
    }

    // LA 用实际输入频谱（1/3 模式用 1/3 谱更准确）；SIL 按定义用倍频带值
    var aRaw = A.aWeighted(raw, bands());
    var aOct = A.aWeighted(levels, A.BANDS);
    var a = { LA: aRaw.LA, Llin: aRaw.Llin, sil: aOct.sil, contributions: aRaw.contributions };
    var nc = A.ncRating(levels);
    var nr = A.nrRating(levels);
    var rc = A.rcRating(levels);
    var lowCheck = A.ncLowFrequencyCheck(levels, a.sil, nc.value);
    var b16 = A.ncBand16Check(levels, a.sil, nc.value);

    $('resA').innerHTML =
      '<div class="big">' + fmt(a.LA) + ' <span class="unit">dBA</span></div>' +
      '<div class="sub">线性(未计权) ' + fmt(a.Llin) + ' dB &nbsp;·&nbsp; SIL ' + fmt(a.sil) + ' dB</div>';

    $('resNC').innerHTML =
      '<div class="big">NC ' + fmt(nc.value) + '</div>' +
      '<div class="sub">标准标号 NC-' + (nc.designation != null ? nc.designation : '—') +
      ' &nbsp;·&nbsp; 控制带 ' + (nc.controllingBand != null ? nc.controllingBand + ' Hz' : '—') + '</div>' +
      ncLowFreqHtml(lowCheck, b16);

    $('resNR').innerHTML =
      '<div class="big">NR ' + fmt(nr.value) + '</div>' +
      '<div class="sub">标准标号 NR-' + (nr.designation != null ? nr.designation : '—') +
      ' &nbsp;·&nbsp; 控制带 ' + (nr.controllingBand != null ? nr.controllingBand + ' Hz' : '—') + '</div>';

    $('resRC').innerHTML =
      '<div class="big">RC ' + (rc.rc != null ? rc.rc : '—') + ' (' + rc.classification + ')</div>' +
      '<div class="sub">' + (A.RC_CLASS_LABEL[rc.classification] || '') +
      ' &nbsp;·&nbsp; LMF ' + fmt(rc.lmf) + ' dB</div>' +
      qaiHtml(rc) +
      rcDetailTable(rc);

    $('results').style.display = 'grid';
    $('exportRow').style.display = 'flex';
    lastResult = {
      raw: raw, levels: levels, a: a, nc: nc, nr: nr, rc: rc,
      lowCheck: lowCheck, b16: b16, missing: missing
    };
    renderTarget();
    drawChart();
  }

  // NC 低频一致性（S12.2 频谱不平衡法）
  function ncLowFreqHtml(lowCheck, b16) {
    if (!lowCheck || lowCheck.verdict === 'na') return '';
    var txt = {
      ok: '低频与 NC(SIL) 曲线一致',
      possible: '低频可能引起严重不满',
      likely: '低频很可能引起严重不满'
    };
    var worst = null;
    lowCheck.devs.forEach(function (d) { if (worst == null || d.dev > worst.dev) worst = d; });
    var cls = lowCheck.verdict === 'ok' ? 'ok' : 'warn';
    var extra = (lowCheck.verdict !== 'ok' && worst)
      ? '（' + worst.band + ' Hz 超出 ' + fmt(worst.dev) + ' dB）' : '';
    var s16 = b16
      ? '<div class="mini">16 Hz：实测 ' + fmt(b16.dev + b16.ref) + ' dB，曲线参考 ' +
        fmt(b16.ref) + ' dB，偏差 ' + signed(b16.dev) + ' dB</div>'
      : '';
    return '<div class="sub ' + cls + '">低频一致性：' + txt[lowCheck.verdict] + extra + '</div>' + s16;
  }

  // QAI 与 RV
  function qaiHtml(rc) {
    if (rc.qai == null) return '';
    var balance = rc.qai <= 5 ? '频谱均衡' : (rc.qai <= 10 ? '略有失衡' : '明显失衡');
    var rvTxt = {
      none: '未见振动/颤振风险',
      moderate: '存在中等振动/颤振风险',
      clear: '明确振动/颤振风险'
    };
    var rv = rc.rvLevel === 'none'
      ? '<div class="sub">RV：' + rvTxt.none + '</div>'
      : '<div class="sub warn">RV：' + rvTxt[rc.rvLevel] +
        (rc.rvBands.length ? '（' + rc.rvBands.join(' / ') + ' Hz）' : '') + '</div>';
    return '<div class="sub">QAI ' + fmt(rc.qai) + '（' + balance + '）' +
      (rc.qaiComplete ? '' : ' · 频带不完整') +
      '<div class="mini">SD 低 ' + fmt(rc.sdl) + ' / 中 ' + fmt(rc.sdm) + ' / 高 ' + fmt(rc.sdh) + ' dB</div></div>' +
      rv;
  }

  function rcDetailTable(rc) {
    var order = [500, 250, 125, 63, 31.5, 16, 1000, 2000, 4000];
    var rows = [];
    order.forEach(function (f) {
      var d = null;
      rc.details.forEach(function (x) { if (x.band === f) d = x; });
      if (!d) return;
      var over = d.excess > d.limit;
      rows.push('<tr><td>' + f + ' Hz</td><td' + (over ? ' class="over"' : '') + '>' +
        signed(d.excess) + '</td><td>' + d.limit + '</td></tr>');
    });
    if (!rows.length) return '';
    return '<table class="detail-table"><thead><tr><th>频带</th><th>超出参考</th><th>限值</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table>';
  }

  function renderTarget() {
    var box = $('targetResult');
    if (!lastResult) { box.innerHTML = ''; return; }
    var target = A.findTarget($('roomSelect').value) || A.ROOM_TARGETS[0];
    var ev = A.evaluateTarget(target, { nc: lastResult.nc.value, rc: lastResult.rc.rc });
    var verdictText = { pass: '✔ 达标', fail: '✘ 超标', na: '数据不足' };

    function item(label, r, digits) {
      var cls = r.status === 'pass' ? 'pass' : (r.status === 'fail' ? 'fail' : '');
      var sub = r.status === 'na' ? '未测得该指标'
        : (r.status === 'pass' ? '目标 ≤ ' + r.target[1]
           : '超出 ' + fmt(r.margin) + '（目标 ≤ ' + r.target[1] + '）');
      return '<div class="target-item ' + cls + '">' +
        '<div class="t-label">' + label + '（目标 ' + r.target[0] + '–' + r.target[1] + '）</div>' +
        '<div class="t-value">' + (r.value == null ? '—' : fmt(r.value, digits)) + '</div>' +
        '<div class="t-sub">' + sub + '</div></div>';
    }

    box.innerHTML =
      '<div class="verdict ' + ev.overall + '">' + (verdictText[ev.overall] || '') +
      '（以 ' + ev.basedOn + ' 判定）</div>' +
      item('NC 目标', ev.nc, 1) +
      item('RC 目标', ev.rc, 0) +
      '<div class="target-note">判定标准：实测值 ≤ 目标上限即达标。' +
      (target.note ? '该用途备注：' + target.note + '。' : '') +
      '目标值仅供工程参考，正式验收以合同/规范要求为准。</div>';
  }

  function summaryText() {
    if (!lastResult) return '';
    var r = lastResult;
    var out = [];
    out.push('声学计算器 · 结果摘要');
    out.push('输入模式：' + (mode === 'third' ? '1/3 倍频程' : '1/1 倍频程'));
    out.push('测量频谱 (dB)：' + bands().map(function (f, i) {
      return f + 'Hz=' + (r.raw[i] == null ? '—' : r.raw[i]);
    }).join(', '));
    if (mode === 'third') {
      out.push('合成倍频程 (dB)：' + A.BANDS.map(function (f, i) {
        return f + 'Hz=' + (r.levels[i] == null ? '—' : fmt(r.levels[i]));
      }).join(', '));
    }
    out.push('A 声级：' + fmt(r.a.LA) + ' dBA（线性 ' + fmt(r.a.Llin) + ' dB，SIL ' + fmt(r.a.sil) + ' dB）');
    out.push('NC：' + fmt(r.nc.value) + '（NC-' + r.nc.designation + '，控制带 ' +
      (r.nc.controllingBand != null ? r.nc.controllingBand + 'Hz' : '—') + '）');
    if (r.lowCheck && r.lowCheck.verdict !== 'na') {
      out.push('NC 低频一致性：' + r.lowCheck.verdict + '（最大超出 ' + fmt(r.lowCheck.worst) + ' dB）');
    }
    out.push('NR：' + fmt(r.nr.value) + '（NR-' + r.nr.designation + '，控制带 ' +
      (r.nr.controllingBand != null ? r.nr.controllingBand + 'Hz' : '—') + '）');
    out.push('RC：' + r.rc.rc + ' (' + r.rc.classification + ')，LMF ' + fmt(r.rc.lmf) + ' dB');
    out.push('QAI：' + fmt(r.rc.qai) + ' dB' + (r.rc.qaiComplete ? '' : '（频带不完整）') +
      '；SD 低/中/高 ' + fmt(r.rc.sdl) + '/' + fmt(r.rc.sdm) + '/' + fmt(r.rc.sdh) + ' dB');
    out.push('RV：' + r.rc.rvLevel + (r.rc.rvBands.length ? '（' + r.rc.rvBands.join('/') + 'Hz）' : ''));
    return out.join('\n');
  }

  function copySummary() {
    var txt = summaryText();
    if (!txt) return;
    var done = function () { flash('copyMsg', '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
    } else {
      fallbackCopy(txt, done);
    }
  }
  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动选择文本。'); }
    document.body.removeChild(ta);
  }
  function flash(id, msg) {
    var el = $(id);
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function exportCsv() {
    if (!lastResult) return;
    var r = lastResult;
    var rows = [];
    rows.push(['声学计算器结果', '', '']);
    rows.push(['输入模式', mode === 'third' ? '1/3 倍频程' : '1/1 倍频程', '']);
    rows.push(['项目', '值', '单位/备注']);
    rows.push(['A 声级', fmt(r.a.LA, 2), 'dBA']);
    rows.push(['线性声级', fmt(r.a.Llin, 2), 'dB']);
    rows.push(['SIL', fmt(r.a.sil, 2), 'dB']);
    rows.push(['NC', fmt(r.nc.value, 2), 'NC-' + r.nc.designation + '，控制带 ' + (r.nc.controllingBand || '') + ' Hz']);
    rows.push(['NC 低频一致性', (r.lowCheck && r.lowCheck.verdict) || '', '最大超出 ' + fmt(r.lowCheck && r.lowCheck.worst, 2) + ' dB']);
    rows.push(['NR', fmt(r.nr.value, 2), 'NR-' + r.nr.designation]);
    rows.push(['RC', r.rc.rc, 'RC ' + r.rc.classification + '，LMF ' + fmt(r.rc.lmf, 2)]);
    rows.push(['QAI', fmt(r.rc.qai, 2), 'SD 低/中/高 ' + fmt(r.rc.sdl, 2) + '/' + fmt(r.rc.sdm, 2) + '/' + fmt(r.rc.sdh, 2)]);
    rows.push(['RV', r.rc.rvLevel, (r.rc.rvBands || []).join('/') + ' Hz']);
    rows.push([]);
    if (mode === 'third') {
      rows.push(['1/3 倍频程输入 (Hz)', '实测 (dB)', '']);
      A.THIRD_BANDS.forEach(function (f, i) {
        rows.push([f, r.raw[i] == null ? '' : r.raw[i], '']);
      });
      rows.push([]);
    }
    rows.push(['倍频程频率 (Hz)', '实测 (dB)', 'RC 参考 (dB)', '超出 (dB)']);
    A.BANDS.forEach(function (f, i) {
      var v = r.levels[i];
      rows.push([f, v == null ? '' : v, fmt(r.rc.ref[i], 2), v == null ? '' : fmt(v - r.rc.ref[i], 2)]);
    });
    var csv = '\ufeff' + rows.map(function (row) {
      return row.map(function (c) {
        return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'acoustic-result.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function applyAverage() {
    var raw = $('avgInput').value || '';
    var rows = raw.split(/\r?\n/).map(function (line) {
      var nums = line.trim().split(/[\s,;\t]+/).filter(function (s) { return s !== ''; })
        .map(function (s) { return parseFloat(s); });
      return nums.filter(function (v) { return !isNaN(v); });
    }).filter(function (r) { return r.length > 0; });

    if (!rows.length) { flash('avgMsg', '请先粘贴频谱数据'); return; }
    var n = bandCount();
    var bad = rows.some(function (r) { return r.length !== n; });
    if (bad) {
      flash('avgMsg', '每行需 ' + n + ' 个数（当前为 ' + (mode === 'third' ? '1/3' : '1/1') + ' 倍频程模式）');
      return;
    }
    writeLevels(A.energyAverage(rows, n));
    flash('avgMsg', '已按 ' + rows.length + ' 个测点能量平均');
    calculate();
  }

  // ---- 绘图：对数频率轴 ----
  function drawChart() {
    var canvas = $('chart');
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var m = { l: 46, r: 14, t: 18, b: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var yMin = 0, yMax = 100;
    var fMin = 16, fMax = mode === 'third' ? 10000 : 8000;
    var lgMin = Math.log(fMin), lgSpan = Math.log(fMax) - lgMin;

    function X(f) { return m.l + (Math.log(f) - lgMin) / lgSpan * pw; }
    function Y(v) { return m.t + (1 - (v - yMin) / (yMax - yMin)) * ph; }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '11px system-ui, sans-serif';

    ctx.strokeStyle = '#e3e8ef';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    [0, 20, 40, 60, 80, 100].forEach(function (db) {
      var y = Y(db);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(W - m.r, y); ctx.stroke();
      ctx.fillText(db.toString(), 12, y + 3);
    });
    A.BANDS.forEach(function (f) {
      var x = X(f);
      ctx.strokeStyle = '#eef1f5';
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
      ctx.fillStyle = '#6b7280';
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x - 9, H - 12);
    });

    function plotPoints(pts, color, dash, width, radius) {
      var started = false;
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 2;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      pts.forEach(function (p) {
        if (p.v == null || isNaN(p.v)) { started = false; return; }
        var x = X(p.f), y = Y(Math.max(yMin, Math.min(yMax, p.v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      var rr = radius || 3;
      pts.forEach(function (p) {
        if (p.v == null || isNaN(p.v)) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(X(p.f), Y(Math.max(yMin, Math.min(yMax, p.v))), rr, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (!lastResult) return;
    var r = lastResult;

    plotPoints(A.BANDS.map(function (f, i) { return { f: f, v: r.rc.ref[i] }; }),
      '#8b5cf6', [6, 4], 2, 2);
    if (r.nc.value != null) {
      plotPoints(A.NC_BANDS.map(function (f) {
        return { f: f, v: A.curveValue(A.NC_TABLE, A.NC_BANDS.indexOf(f), r.nc.value) };
      }), '#f59e0b', [6, 4], 2, 2);
    }
    if (r.nr.value != null) {
      plotPoints(A.NR_BANDS.map(function (f) {
        return { f: f, v: A.curveValue(A.NR_TABLE, A.NR_BANDS.indexOf(f), r.nr.value) };
      }), '#10b981', [6, 4], 2, 2);
    }

    var measured = mode === 'third'
      ? A.THIRD_BANDS.map(function (f, i) { return { f: f, v: r.raw[i] }; })
      : A.BANDS.map(function (f, i) { return { f: f, v: r.levels[i] }; });
    plotPoints(measured, '#2563eb', [], 2.2, mode === 'third' ? 2 : 3);

    var lx = m.l + 8, ly = m.t + 8;
    var items = [
      ['#2563eb', mode === 'third' ? '实测 1/3 谱' : '实测频谱'],
      ['#f59e0b', 'NC 曲线'], ['#10b981', 'NR 曲线'], ['#8b5cf6', 'RC 曲线']
    ];
    items.forEach(function (it, idx) {
      var yy = ly + idx * 15;
      ctx.fillStyle = it[0]; ctx.fillRect(lx, yy - 8, 14, 3);
      ctx.fillStyle = '#374151'; ctx.fillText(it[1], lx + 20, yy - 3);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildSampleOptions();
    buildRoomOptions();
    buildGrid();
    $('btnCalc').addEventListener('click', calculate);
    $('sampleSelect').addEventListener('change', function () {
      var i = parseInt(this.value, 10);
      if (isNaN(i)) return;
      writeLevels(mode === 'third' ? octaveToThird(SAMPLES[i].levels) : SAMPLES[i].levels);
      this.value = '';
      calculate();
    });
    $('btnClear').addEventListener('click', clearAll);
    $('btnAvg').addEventListener('click', applyAverage);
    $('btnCopy').addEventListener('click', copySummary);
    $('btnCsv').addEventListener('click', exportCsv);
    $('roomSelect').addEventListener('change', renderTarget);
    var btns = document.querySelectorAll('.mode-btn');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    writeLevels(mode === 'third'
      ? octaveToThird(SAMPLES[DEFAULT_SAMPLE].levels)
      : SAMPLES[DEFAULT_SAMPLE].levels);
    calculate();
  });
})();
