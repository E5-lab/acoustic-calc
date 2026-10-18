/*
 * view-perforation.js — 穿孔率计算视图（交互 + 阵列示意图）
 * 依赖：window.Perforation（计算内核）
 */
(function () {
  'use strict';

  var E = window.Perforation;

  // 每种阵列形制的示意与提示
  var ICONS = {
    square: '<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<path d="M10 10h20v20H10z" stroke-dasharray="3 3" opacity=".55"/>' +
      '<circle cx="10" cy="10" r="3.4"/><circle cx="30" cy="10" r="3.4"/>' +
      '<circle cx="10" cy="30" r="3.4"/><circle cx="30" cy="30" r="3.4"/></svg>',
    'diamond-square': '<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<path d="M20 7l13 13-13 13-13-13z" stroke-dasharray="3 3" opacity=".55"/>' +
      '<circle cx="20" cy="7" r="3.2"/><circle cx="33" cy="20" r="3.2"/>' +
      '<circle cx="7" cy="20" r="3.2"/><circle cx="20" cy="33" r="3.2"/></svg>',
    hex: '<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<path d="M20 8l12 20H8z" stroke-dasharray="3 3" opacity=".55"/>' +
      '<circle cx="20" cy="8" r="3.2"/><circle cx="8" cy="28" r="3.2"/>' +
      '<circle cx="32" cy="28" r="3.2"/><circle cx="20" cy="28" r="3.2"/></svg>',
    'diamond-rect': '<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<path d="M9 8h22v24H9z" stroke-dasharray="3 3" opacity=".55"/>' +
      '<circle cx="9" cy="8" r="3"/><circle cx="31" cy="8" r="3"/>' +
      '<circle cx="20" cy="20" r="3"/><circle cx="9" cy="32" r="3"/><circle cx="31" cy="32" r="3"/></svg>'
  };

  // 参数定义
  var FIELD_META = {
    d: { label: '微孔直径 d', min: 0.05, step: 0.1 },
    P: { label: '中心距 P', min: 0.2, step: 0.1 },
    P1: { label: '横向中心距 P1', min: 0.2, step: 0.1 },
    P2: { label: '纵向轴线距 P2', min: 0.2, step: 0.1 }
  };
  var PITCH_LABEL = {
    'diamond-square': '相邻孔心距 P',
    hex: '相邻孔心距 P'
  };

  var DEFAULTS = { pattern: 'square', d: 5, P: 10, P1: 10, P2: 12 };
  var state = { pattern: DEFAULTS.pattern, d: DEFAULTS.d, P: DEFAULTS.P, P1: DEFAULTS.P1, P2: DEFAULTS.P2 };

  var last = null;        // 最近一次成功计算的结果
  var mpp = null;         // 最近一次共振估算
  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function group(n, digits) { return Number(n).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  // ------------------------------ 阵列形制卡片 ------------------------------
  function renderPatterns() {
    var box = $('patternGrid');
    box.innerHTML = '';
    E.PATTERNS.forEach(function (p) {
      var label = document.createElement('label');
      label.className = 'pattern-card' + (state.pattern === p.id ? ' selected' : '');
      label.setAttribute('data-pattern', p.id);
      label.innerHTML =
        '<input type="radio" name="perfPattern" value="' + p.id + '"' + (state.pattern === p.id ? ' checked' : '') + '>' +
        '<span class="pc-icon">' + (ICONS[p.id] || '') + '</span>' +
        '<span class="pc-body">' +
        '<span class="pc-title">' + p.name + '</span>' +
        '<span class="pc-en">' + p.en + '</span>' +
        '<span class="pc-desc">' + p.desc + '</span>' +
        '<span class="pc-cell">单元面积 ' + p.cell + '</span>' +
        '</span>';
      label.addEventListener('click', function () {
        state.pattern = p.id;
        renderPatterns();
        renderFields();
        recalc();
      });
      box.appendChild(label);
    });
  }

  // ------------------------------ 参数输入 ------------------------------
  function renderFields() {
    var p = E.findPattern(state.pattern);
    var box = $('perfFields');
    box.innerHTML = '';
    $('mppResult').innerHTML = '';
    mpp = null;
    p.fields.forEach(function (key) {
      var meta = FIELD_META[key];
      var labelText = (key === 'P' && PITCH_LABEL[state.pattern]) ? PITCH_LABEL[state.pattern] : meta.label;
      var wrap = document.createElement('div');
      wrap.className = 'field';
      var id = 'perf-' + key;
      wrap.innerHTML = '<label for="' + id + '">' + labelText + ' <span class="unit-tag">mm</span></label>' +
        '<input id="' + id + '" type="number" step="' + meta.step + '" min="' + meta.min + '" value="' + state[key] + '">';
      box.appendChild(wrap);
      var input = wrap.querySelector('input');
      input.addEventListener('input', function () {
        state[key] = parseFloat(input.value);
        recalc();
      });
    });
    if (state.pattern === 'diamond-rect') {
      $('revP2').value = state.P2;
    }
  }

  function syncInputs() {
    ['d', 'P', 'P1', 'P2'].forEach(function (k) {
      var el = $('perf-' + k);
      if (el) el.value = state[k];
    });
  }

  // ------------------------------ 结果渲染 ------------------------------
  function recalc() {
    var res = E.perforationRate(state);
    var msgBox = $('perfMsg');
    msgBox.innerHTML = '';

    if (!res.ok) {
      last = null;
      $('perfRate').textContent = '—';
      $('perfClass').textContent = '';
      $('perfFormula').innerHTML = '';
      $('perfStats').innerHTML = '';
      $('perfWarn').innerHTML = '';
      $('perfDiagramNote').textContent = '';
      msgBox.innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(res.error) + '</span></div>';
      drawDiagram();
      return;
    }

    last = res;
    $('perfRate').textContent = res.rate.toFixed(2);
    $('perfClass').innerHTML = res.klass.label + ' · ' + res.klass.note;

    // 公式代入
    var p = E.findPattern(res.pattern);
    var d = state.d;
    var cellExpr = p.cell;
    var numeric = res.pattern === 'diamond-rect'
      ? 'π × ' + num(d) + '² / (2 × ' + num(state.P1) + ' × ' + num(state.P2) + ')'
      : (res.pattern === 'square' ? 'π × ' + num(d) + '² / (4 × ' + num(state.P) + '²)'
        : (res.pattern === 'diamond-square' ? 'π × ' + num(d) + '² / (2 × ' + num(state.P) + '²)'
          : 'π × ' + num(d) + '² / (2√3 × ' + num(state.P) + '²)'));
    var pitchText = res.pattern === 'diamond-rect'
      ? 'P1 = ' + num(state.P1) + ' mm，P2 = ' + num(state.P2) + ' mm'
      : 'P = ' + num(state.P) + ' mm';
    $('perfFormula').innerHTML =
      '<span class="fx">σ = πd² / (4 · 单元面积系数)</span>  以单元面积 ' + cellExpr + ' 展开：\n' +
      'σ = ' + numeric + ' × 100% = <span class="fx">' + res.rate.toFixed(4) + ' %</span>\n' +
      '单孔面积 = πd²/4 = ' + num(res.hole, 4) + ' mm²　单元面积 = ' + num(res.cell, 4) + ' mm²\n' +
      pitchText + '　孔径/中心距 = ' + num(res.dOverP, 3);

    // 派生量
    $('perfStats').innerHTML =
      stat('单孔面积', group(res.hole, 3), 'mm²', 'πd²/4') +
      stat('单元面积', group(res.cell, 2), 'mm²', '对应 1 个孔') +
      stat('孔数密度', group(res.holes, 0), '个/m²', '按单元面积折算') +
      stat('剩余板面', (res.solidRatio * 100).toFixed(2), '%', '实体部分占比');

    // 加工校核
    var wHtml = '';
    res.warnings.forEach(function (w) {
      wHtml += '<div class="callout ' + (w.level === 'warn' ? 'warn' : 'info') + '"><span class="dot"></span><span>' + esc(w.text) + '</span></div>';
    });
    if (!wHtml) {
      wHtml = '<div class="callout ok"><span class="dot"></span><span>孔间壁厚与穿孔率均在常用加工区间内，未见明显限制。</span></div>';
    }
    wHtml += '<div class="callout"><span class="dot"></span><span>孔间剩余壁厚 = 中心距 − 孔径 = ' +
      num(res.pitch - state.d) + ' mm（按较小中心距 ' + num(res.pitch) + ' mm 校核）。</span></div>';
    $('perfWarn').innerHTML = wHtml;

    diagramNote(res);
    drawDiagram();
  }

  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + '<small>' + unit + '</small></div>' +
      '<div class="s-sub">' + sub + '</div></div>';
  }

  function diagramNote(res) {
    var geom = buildGeometry();
    var rows = {
      square: '正方形阵列：孔心沿水平与垂直方向正交对齐，相邻孔心距均为 ' + num(state.P) + ' mm，每个孔对应一个 ' + num(state.P) + ' × ' + num(state.P) + ' mm 的单元方格。',
      'diamond-square': '45° 菱形错排：隔行水平错开半个孔距，纵向行距为 ' + num(state.P / 2) + ' mm，单元面积按 ' + p2(state.P) + ' 计。',
      hex: '等边三角形错排：隔行错开半个孔距，纵向行距为 (√3/2)P = ' + num(Math.sqrt(3) / 2 * state.P) + ' mm，单元面积 ' + p2(Math.sqrt(3) / 2 * state.P) + ' mm²，为同孔径同孔距下最紧凑的阵列。',
      'diamond-rect': '矩形错排：横向中心距 ' + num(state.P1) + ' mm，纵向行距 P2/2 = ' + num(state.P2 / 2) + ' mm，单元面积 ' + num(state.P1 * state.P2 / 2) + ' mm²。'
    };
    var extra = geom && geom.exaggerated ? '（示意图中孔径已放大绘制以便观察）' : '';
    $('perfDiagramNote').textContent = rows[state.pattern] + extra;
  }

  function p2(x) {
    return (x * x).toFixed(2) + ' mm²';
  }

  // ------------------------------ 阵列几何 ------------------------------
  function buildGeometry() {
    var d = parseFloat(state.d), P = parseFloat(state.P);
    var P1 = parseFloat(state.P1), P2 = parseFloat(state.P2);
    var g = { holes: [], pitch: 0, rowH: 0, spanX: 0, spanY: 0, cellW: 0, cellH: 0, pitchLabel: '', rowLabel: '' };

    if (state.pattern === 'square') {
      if (!(P > 0)) return null;
      g.pitch = P; g.rowH = P;
      for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) g.holes.push([i * P, j * P]);
      g.spanX = 2 * P; g.spanY = 2 * P; g.cellW = P; g.cellH = P;
      g.pitchLabel = 'P = ' + fmt(P) + ' mm'; g.rowLabel = 'P = ' + fmt(P) + ' mm';
    } else if (state.pattern === 'diamond-square') {
      if (!(P > 0)) return null;
      var rh = P / 2;
      g.pitch = P; g.rowH = rh;
      for (var j2 = 0; j2 < 4; j2++) for (var i2 = 0; i2 < 3; i2++) g.holes.push([i2 * P + (j2 % 2 ? P / 2 : 0), j2 * rh]);
      g.spanX = 2 * P + P / 2; g.spanY = 3 * rh; g.cellW = P; g.cellH = rh;
      g.pitchLabel = 'P = ' + fmt(P) + ' mm'; g.rowLabel = 'P/2 = ' + fmt(rh) + ' mm';
    } else if (state.pattern === 'hex') {
      if (!(P > 0)) return null;
      var rh2 = Math.sqrt(3) / 2 * P;
      g.pitch = P; g.rowH = rh2;
      for (var j3 = 0; j3 < 3; j3++) for (var i3 = 0; i3 < 3; i3++) g.holes.push([i3 * P + (j3 % 2 ? P / 2 : 0), j3 * rh2]);
      g.spanX = 2 * P + P / 2; g.spanY = 2 * rh2; g.cellW = P; g.cellH = rh2;
      g.pitchLabel = 'P = ' + fmt(P) + ' mm'; g.rowLabel = '(√3/2)P = ' + fmt(rh2) + ' mm';
    } else {
      if (!(P1 > 0) || !(P2 > 0)) return null;
      var rh3 = P2 / 2;
      g.pitch = Math.min(P1, P2); g.rowH = rh3;
      for (var j4 = 0; j4 < 4; j4++) for (var i4 = 0; i4 < 3; i4++) g.holes.push([i4 * P1 + (j4 % 2 ? P1 / 2 : 0), j4 * rh3]);
      g.spanX = 2 * P1 + P1 / 2; g.spanY = 3 * rh3; g.cellW = P1; g.cellH = rh3;
      g.pitchLabel = 'P1 = ' + fmt(P1) + ' mm'; g.rowLabel = 'P2/2 = ' + fmt(rh3) + ' mm';
    }
    g.d = d || 0;
    return g;
  }

  function fmt(x) { return Number(x).toFixed(2).replace(/\.?0+$/, '') || '0'; }

  // ------------------------------ 画布绘制 ------------------------------
  function cssVar(n, f) { return window.Util.cssVar(n, f); }

  function drawDiagram() {
    var canvas = $('perfCanvas');
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(320, Math.round(rect.width || 560));
    var H = 330;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var g = buildGeometry();
    if (!g) {
      ctx.fillStyle = cssVar('--muted', '#6b7280');
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('请输入有效参数后查看阵列示意', 16, 30);
      return;
    }

    var C = {
      hole: cssVar('--primary', '#2563eb'),
      holeFill: 'rgba(37, 99, 235, 0.10)',
      cell: cssVar('--faint', '#94a3b8'),
      line: cssVar('--muted', '#6b7280'),
      accent: cssVar('--accent', '#f97316'),
      text: cssVar('--text', '#16202f'),
      chipBg: cssVar('--card', '#ffffff'),
      chipBorder: cssVar('--border-strong', '#d3dae6')
    };

    var padL = 74, padR = 34, padT = 52, padB = 46;
    var availW = W - padL - padR, availH = H - padT - padB;
    var s = Math.min(availW / g.spanX, availH / g.spanY);
    var ox = padL + (availW - g.spanX * s) / 2;
    var oy = padT + (availH - g.spanY * s) / 2;
    var X = function (mm) { return ox + mm * s; };
    var Y = function (mm) { return oy + mm * s; };

    var rTrue = g.d / 2 * s;
    var r = Math.max(3.2, Math.min(rTrue, g.rowH * s * 0.46, g.pitch * s * 0.46));
    g.exaggerated = Math.abs(r - rTrue) > 0.6;

    // 单元面积框（以第 2 个孔为中心）
    var anchor = g.holes[1] || g.holes[0];
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.cell;
    ctx.lineWidth = 1.2;
    var cx = X(anchor[0] - g.cellW / 2), cy = Y(anchor[1] - g.cellH / 2);
    ctx.beginPath();
    roundRect(ctx, cx, cy, g.cellW * s, g.cellH * s, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
    ctx.fill();
    ctx.restore();
    chip(ctx, '单元面积 ' + (g.cellW * g.cellH).toFixed(2) + ' mm²', cx + g.cellW * s / 2, cy - 12, C.cell, C);

    // 孔
    g.holes.forEach(function (h) {
      ctx.beginPath();
      ctx.arc(X(h[0]), Y(h[1]), r, 0, Math.PI * 2);
      ctx.fillStyle = C.holeFill;
      ctx.fill();
      ctx.strokeStyle = C.hole;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });

    // 水平中心距标注（第 1 行前两个孔）
    var h1 = g.holes[0], h2 = g.holes[1];
    var yTop = Y(h1[1]) - r - 18;
    arrow(ctx, X(h1[0]), yTop, X(h2[0]), yTop, C.line);
    chip(ctx, g.pitchLabel, (X(h1[0]) + X(h2[0])) / 2, yTop - 12, C.line, C);

    // 纵向行距标注
    var h3 = g.holes[0];
    var h4 = null;
    for (var i = 0; i < g.holes.length; i++) {
      if (Math.abs(g.holes[i][0] - h3[0]) < 1e-6 && g.holes[i][1] > h3[1]) { h4 = g.holes[i]; break; }
    }
    if (h4) {
      var xLeft = X(h3[0]) - r - 20;
      arrow(ctx, xLeft, Y(h3[1]), xLeft, Y(h4[1]), C.line);
      chip(ctx, g.rowLabel, xLeft - 4, (Y(h3[1]) + Y(h4[1])) / 2, C.line, C, 'right');
    }

    // 孔径标注（高亮孔）
    var hd = g.holes[1];
    arrow(ctx, X(hd[0]) - r, Y(hd[1]), X(hd[0]) + r, Y(hd[1]), C.accent);
    chip(ctx, 'd = ' + fmt(g.d) + ' mm', X(hd[0]), Y(hd[1]) + r + 16, C.accent, C);

    // 图例
    ctx.font = '11.5px system-ui, sans-serif';
    ctx.fillStyle = C.line;
    ctx.fillText('虚线框＝一个孔的单元面积；箭头为孔心距与孔径', padL - 58, H - 12);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function arrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    [[x1, y1, x2, y2], [x2, y2, x1, y1]].forEach(function (p) {
      var ang = Math.atan2(p[3] - p[1], p[2] - p[0]);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] + 7 * Math.cos(ang + Math.PI / 7), p[1] + 7 * Math.sin(ang + Math.PI / 7));
      ctx.lineTo(p[0] + 7 * Math.cos(ang - Math.PI / 7), p[1] + 7 * Math.sin(ang - Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  function chip(ctx, text, x, y, color, C, align) {
    ctx.save();
    ctx.font = '600 11.5px system-ui, sans-serif';
    var w = ctx.measureText(text).width + 14;
    var h = 19;
    var left = align === 'right' ? x - w : x - w / 2;
    ctx.beginPath();
    roundRect(ctx, left, y - h / 2, w, h, 6);
    ctx.fillStyle = C.chipBg;
    ctx.fill();
    ctx.strokeStyle = C.chipBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + 7, y + 0.5);
    ctx.restore();
  }

  // ------------------------------ 工具：反算 / 共振 / 板材 ------------------------------
  function doReverse() {
    var targetRate = parseFloat($('revRate').value);
    var res = E.solvePitch({
      pattern: state.pattern,
      d: state.d,
      targetRate: targetRate,
      P2: state.pattern === 'diamond-rect' ? parseFloat($('revP2').value) : null
    });
    if (!res.ok) {
      $('revMsg').textContent = '';
      $('revResult').innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(res.error) + '</span></div>';
      return;
    }
    var html = '';
    if (res.P != null) {
      html += kv('所需 ' + res.label, num(res.P), 'mm', '按 ' + num(targetRate, 2) + '% 目标穿孔率');
    } else {
      html += kv('所需 ' + res.label, num(res.P1), 'mm', '固定 P2 = ' + num(res.P2));
    }
    html += kv('对应孔数密度', group(1e6 / (E.unitCellArea(state.pattern, {
      P: res.P != null ? res.P : null, P1: res.P1 != null ? res.P1 : null, P2: res.P2 != null ? res.P2 : null
    }) || 1), 0), '个/m²', '按单元面积折算');
    $('revMsg').textContent = '反算完成';
    $('revResult').innerHTML = html;
    setTimeout(function () { if ($('revMsg')) $('revMsg').textContent = ''; }, 2000);
  }

  function kv(k, v, unit, sub) {
    return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v +
      '<small>' + (unit || '') + '</small></div>' +
      (sub ? '<div class="s-sub mini">' + sub + '</div>' : '') + '</div>';
  }

  function doMpp() {
    if (!last) {
      $('mppResult').innerHTML = '<div class="callout error"><span class="dot"></span><span>请先输入有效的设计参数。</span></div>';
      return;
    }
    var t = parseFloat($('mppT').value);
    var D = parseFloat($('mppD').value);
    mpp = E.mppResonance({ d: state.d, t: t, cavity: D, rate: last.rate });
    if (!mpp) {
      $('mppResult').innerHTML = '<div class="callout error"><span class="dot"></span><span>板厚与空腔深度需为正数。</span></div>';
      return;
    }
    $('mppResult').innerHTML =
      kv('共振频率 f₀', num(mpp.f0, 0), 'Hz', '有效板厚 t′ = ' + num(mpp.tEff, 3) + ' mm') +
      kv('1/4 波长', num(mpp.quarterWave, 0), 'mm', '与空腔深度同量级时的对应关系') +
      '<div class="callout ' + (mpp.valid ? 'ok' : 'warn') + '" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(mpp.note) + '</span></div>';
    $('mppMsg').textContent = '估算完成';
    setTimeout(function () { if ($('mppMsg')) $('mppMsg').textContent = ''; }, 2000);
  }

  function doPlate() {
    if (!last) {
      $('plateResult').innerHTML = '<div class="callout error"><span class="dot"></span><span>请先输入有效的设计参数。</span></div>';
      return;
    }
    var w = parseFloat($('plateW').value), h = parseFloat($('plateH').value);
    if (!(w > 0) || !(h > 0)) {
      $('plateResult').innerHTML = '<div class="callout error"><span class="dot"></span><span>板宽与板长需为正数。</span></div>';
      return;
    }
    var areaM2 = w * h / 1e6;
    var holes = areaM2 * last.holes;
    var openCm2 = areaM2 * (last.rate / 100) * 1e4;
    $('plateResult').innerHTML =
      kv('板面积', num(areaM2, 3), 'm²', num(w, 0) + ' × ' + num(h, 0) + ' mm') +
      kv('预计孔数', group(holes, 0), '个', '按设计穿孔率折算') +
      kv('总开孔面积', num(openCm2, 1), 'cm²', '占板面 ' + num(last.rate, 2) + '%');
  }

  // ------------------------------ 导出 ------------------------------
  function summaryText() {
    if (!last) return '';
    var r = last;
    var p = E.findPattern(r.pattern);
    var out = [];
    out.push('穿孔率计算 · 结果摘要');
    out.push('阵列形制：' + p.name + '（' + p.en + '）');
    var params = '孔径 d = ' + num(state.d) + ' mm';
    if (r.pattern === 'diamond-rect') params += '，P1 = ' + num(state.P1) + ' mm，P2 = ' + num(state.P2) + ' mm';
    else params += '，中心距 P = ' + num(state.P) + ' mm';
    out.push('设计参数：' + params);
    out.push('穿孔率 σ = ' + r.rate.toFixed(4) + ' %（' + r.klass.label + '）');
    out.push('单元面积 = ' + num(r.cell, 4) + ' mm²；单孔面积 = ' + num(r.hole, 4) + ' mm²');
    out.push('孔数密度 = ' + group(r.holes, 0) + ' 个/m²；剩余板面 = ' + (r.solidRatio * 100).toFixed(2) + '%');
    out.push('孔径/中心距 = ' + num(r.dOverP, 3) + '；孔间剩余壁厚 = ' + num(r.pitch - state.d) + ' mm');
    r.warnings.forEach(function (w) { out.push('提示：' + w.text); });
    if (mpp) out.push('微穿孔板共振估算 f₀ = ' + num(mpp.f0, 0) + ' Hz（t′ = ' + num(mpp.tEff, 3) + ' mm）');
    out.push('工具：声学计算工具箱 · 穿孔率计算');
    return out.join('\n');
  }

  function copySummary() {
    var txt = summaryText();
    if (!txt) { flash('perfCopyMsg', '暂无可复制结果'); return; }
    var done = function () { flash('perfCopyMsg', '已复制'); };
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
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function exportCsv() {
    if (!last) { flash('perfCopyMsg', '暂无可导出结果'); return; }
    var r = last;
    var p = E.findPattern(r.pattern);
    var rows = [];
    rows.push(['穿孔率计算结果', '', '']);
    rows.push(['阵列形制', p.name + '（' + p.en + '）', '']);
    rows.push(['参数', '值', '单位']);
    rows.push(['微孔直径 d', num(state.d), 'mm']);
    if (r.pattern === 'diamond-rect') {
      rows.push(['横向中心距 P1', num(state.P1), 'mm']);
      rows.push(['纵向轴线距 P2', num(state.P2), 'mm']);
      rows.push(['纵向行距 P2/2', num(state.P2 / 2), 'mm']);
    } else {
      rows.push(['中心距 P', num(state.P), 'mm']);
      if (r.pattern === 'diamond-square') rows.push(['纵向行距 P/2', num(state.P / 2), 'mm']);
      if (r.pattern === 'hex') rows.push(['纵向行距 (√3/2)P', num(Math.sqrt(3) / 2 * state.P), 'mm']);
    }
    rows.push([]);
    rows.push(['结果', '值', '单位/备注']);
    rows.push(['穿孔率 σ', r.rate.toFixed(4), '%']);
    rows.push(['区间判定', r.klass.label, r.klass.note]);
    rows.push(['单元面积', num(r.cell, 4), 'mm²']);
    rows.push(['单孔面积', num(r.hole, 4), 'mm²']);
    rows.push(['孔数密度', group(r.holes, 0), '个/m²']);
    rows.push(['剩余板面比例', (r.solidRatio * 100).toFixed(2), '%']);
    rows.push(['孔径/中心距', num(r.dOverP, 3), '']);
    rows.push(['孔间剩余壁厚', num(r.pitch - state.d), 'mm']);
    rows.push([]);
    rows.push(['加工校核提示', '']);
    if (!r.warnings.length) rows.push(['未见明显加工限制', '']);
    r.warnings.forEach(function (w) { rows.push([w.text, w.level]); });
    if (mpp) {
      rows.push([]);
      rows.push(['微穿孔板共振估算', '']);
      rows.push(['有效板厚 t′', num(mpp.tEff, 3), 'mm']);
      rows.push(['共振频率 f₀', num(mpp.f0, 1), 'Hz']);
      rows.push(['1/4 波长', num(mpp.quarterWave, 1), 'mm']);
    }
    var csv = '\ufeff' + rows.map(function (row) {
      return row.map(function (c) {
        return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'perforation-result.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function reset() {
    state.pattern = DEFAULTS.pattern;
    state.d = DEFAULTS.d;
    state.P = DEFAULTS.P;
    state.P1 = DEFAULTS.P1;
    state.P2 = DEFAULTS.P2;
    $('revRate').value = 5;
    $('revP2').value = DEFAULTS.P2;
    $('revResult').innerHTML = '';
    $('mppT').value = 1;
    $('mppD').value = 50;
    $('plateW').value = 1000;
    $('plateH').value = 2000;
    $('plateResult').innerHTML = '';
    mpp = null;
    renderPatterns();
    renderFields();
    recalc();
  }

  // ------------------------------ 初始化 ------------------------------
  function init() {
    if (inited) return;
    inited = true;
    renderPatterns();
    renderFields();
    recalc();
    $('revSolve').addEventListener('click', doReverse);
    $('mppSolve').addEventListener('click', doMpp);
    $('plateCalc').addEventListener('click', doPlate);
    $('perfCopy').addEventListener('click', copySummary);
    $('perfCsv').addEventListener('click', exportCsv);
    $('perfReset').addEventListener('click', reset);
    ['revRate', 'revP2'].forEach(function (id) {
      $(id).addEventListener('input', function () { $('revResult').innerHTML = ''; });
    });
    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var v = $('view-perforation');
        if (v && v.classList.contains('active')) drawDiagram();
      }, 160);
    });
  }

  // 视图显示时重绘（隐藏状态下无法取得画布宽度）
  function onShow() {
    syncInputs();
    drawDiagram();
  }

  window.PerforationView = { init: init, onShow: onShow };
})();
