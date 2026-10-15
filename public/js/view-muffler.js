/*
 * view-muffler.js — 消声器计算视图
 * 依赖：window.Muffler（内核）、window.MiniChart（绘图）
 *
 * 三个面板：
 *   res    阻性消声器：GB/T 50087-2013 式 6.3.1（φ(α₀)·P·l/S）+ 别洛夫式对照，
 *          含上限截止频率高频失效折减、流速校核、压力损失与选型建议
 *   react  抗性消声器：扩张室（一维平面波解）与共振腔（Helmholtz 旁支式）
 *   combo  组合验算：阻性 + 抗性逐频带相加 → A 计权插入损失（复用前两面板参数）
 */
(function () {
  'use strict';

  var M = window.Muffler;
  var BANDS = M.BANDS;

  var state = { panel: 'res' };
  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function num(v, d) {
    if (v == null || isNaN(v) || !isFinite(v)) return '—';
    return Number(v).toFixed(d == null ? 2 : d);
  }
  function pf(id) {
    var el = $(id);
    if (!el) return null;
    var v = parseFloat(el.value);
    return isFinite(v) ? v : null;
  }
  function cssVar(n, f) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n);
    return (v && v.trim()) || f;
  }
  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub">' + sub + '</div>' : '') + '</div>';
  }
  function callout(level, text) {
    return '<div class="callout ' + level + '"><span class="dot"></span><span>' + esc(text) + '</span></div>';
  }
  function table(head, rows, cls) {
    return '<table class="detail-table ' + (cls || 'wide') + '"><thead><tr>' +
      head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + r.map(function (c) {
          return '<td' + (c && c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c && c.html != null ? c.html : esc(c)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function cell(text, cls) { return { html: text, cls: cls }; }

  // ------------------------------ 公共读取 ------------------------------
  function readGeometry() {
    return {
      form: $('mfForm').value,
      d: pf('mfD'),
      a: pf('mfA'), b: pf('mfB'),
      blades: pf('mfBlades'), gap: pf('mfGap'), height: pf('mfHeight'),
      linedEnds: $('mfLinedEnds').checked,
      unfoldFactor: pf('mfUnfold'),
      length: pf('mfLength'),
      c: pf('mfC')
    };
  }

  function readAlpha() {
    if ($('mfMaterial').value !== 'custom') {
      var mat = null;
      M.MATERIALS.forEach(function (m) { if (m.id === $('mfMaterial').value) mat = m; });
      return mat ? mat.alpha.slice() : null;
    }
    var out = [];
    for (var i = 0; i < BANDS.length; i++) {
      var v = pf('mfAlpha' + i);
      out.push(v == null ? 0 : v);
    }
    return out;
  }

  // ------------------------------ 面板 1：阻性 ------------------------------
  function recalcRes() {
    var msg = $('mfResMsg');
    var o = readGeometry();
    o.alpha = readAlpha();
    o.formula = $('mfFormula').value;
    var flowH = pf('mfFlow');
    o.flow = (flowH != null && flowH > 0) ? flowH / 3600 : null;

    var r = M.resistive(o);
    if (!r.ok) {
      msg.innerHTML = callout('error', r.error);
      $('mfResStats').innerHTML = '';
      $('mfResTable').innerHTML = '';
      $('mfResExtra').innerHTML = '';
      return;
    }
    msg.innerHTML = '';

    $('mfResStats').innerHTML =
      stat('净流通面积 S', num(r.S, 3), 'm²', r.geom) +
      stat('饰面周长比 P/S', num(r.PS, 2), 'm⁻¹') +
      stat('当量直径 D', num(r.D * 1000, 0), 'mm') +
      stat('上限截止频率 f_c', num(r.fc, 0), 'Hz', 'f_c = 1.85c/D') +
      (r.v != null ? stat('通道流速 v', num(r.v, 1), 'm/s', '上限 ' + r.vmax + ' m/s') : '');

    var rows = r.rows.map(function (row) {
      return [
        cell('<span class="mono">' + row.f + '</span>'),
        cell('<span class="mono">' + num(row.alpha, 2) + '</span>'),
        cell('<span class="mono">' + num(row.phiGB, 2) + '</span>'),
        cell('<span class="mono">' + num(row.phiPerov, 2) + '</span>'),
        cell('<span class="mono">' + num(row.dLgb, 1) + '</span>'),
        cell('<span class="mono">' + num(row.dL, 1) + '</span>'),
        row.limited ? cell('高频失效折减 ×' + num(row.factor, 2), 'warn') : cell('—', 'muted')
      ];
    });
    $('mfResTable').innerHTML = table(
      ['倍频带 (Hz)', 'α₀', 'φ(α₀) GB 表', 'φ 别洛夫', 'ΔL_GB (dB)', '采用 ΔL (dB)', '备注'], rows, 'wide');

    var extra = '';
    if (r.v != null) {
      var pl = M.pressureLoss(Object.assign({}, o, { flow: o.flow }));
      if (pl.ok) {
        extra += stat('全压损失 Δp', num(pl.dp, 1), 'Pa', 'ξ = ' + num(pl.xi, 2) + '（' + r.formName + ' 经验值）');
      }
    }
    var warns = (r.warnings || []).map(function (w) {
      return callout(w.level === 'warn' ? 'warn' : 'info', w.text);
    }).join('');
    var advice = M.advice(Object.assign({}, o)).map(function (a) {
      return callout(a.level === 'ok' ? 'ok' : (a.level === 'warn' ? 'warn' : 'info'), a.text);
    }).join('');
    $('mfResExtra').innerHTML =
      (extra ? '<div class="stat-grid">' + extra + '</div>' : '') +
      '<h3 class="sub-head">校核与选型建议</h3>' + warns + advice;
  }

  // ------------------------------ 面板 2：抗性 ------------------------------
  function recalcReact() {
    // —— 扩张室 ——
    var msgE = $('mfExpMsg');
    var e = M.expansion({
      d1: pf('mfEd1'), d2: pf('mfEd2'), m: pf('mfEm'),
      l: pf('mfEl'), stages: pf('mfEStages'), c: pf('mfEc')
    });
    if (!e.ok) {
      msgE.innerHTML = callout('error', e.error);
      $('mfExpStats').innerHTML = '';
      $('mfExpTable').innerHTML = '';
    } else {
      msgE.innerHTML = '';
      $('mfExpStats').innerHTML =
        stat('扩张比 m', num(e.m, 2), '', e.d1 && e.d2 ? '由 d₁/d₂ = ' + num(e.d1, 3) + '/' + num(e.d2, 3) + ' 换算' : '') +
        stat('单节峰值 TL', num(e.peakTL, 1), 'dB', '10lg[1+¼(m−1/m)²]') +
        (e.stages > 1 ? stat(e.stages + ' 节串联峰值', num(e.peakTLTotal, 1), 'dB') : '') +
        stat('第一通过频率', num(e.passFreqs[0], 0), 'Hz', 'c/(2l)，该处 TL=0');
      $('mfExpTable').innerHTML = table(
        ['倍频带 (Hz)', 'k·l', 'sin²(k·l)', '单节 TL (dB)', e.stages > 1 ? e.stages + ' 节合计 (dB)' : ''],
        e.rows.map(function (row) {
          return [
            cell('<span class="mono">' + row.f + '</span>'),
            cell('<span class="mono">' + num(row.kl, 2) + '</span>'),
            cell('<span class="mono">' + num(row.sin2, 3) + '</span>'),
            cell('<span class="mono">' + num(row.tl, 1) + '</span>'),
            cell('<span class="mono">' + num(row.tlTotal, 1) + '</span>')
          ];
        }), 'wide');
    }

    // —— 共振腔 ——
    var msgR = $('mfResoMsg');
    var r = M.resonator({
      holeD: pf('mfRh'), plateT: pf('mfRt'), holes: pf('mfRn'),
      volume: pf('mfRvol'), chamberD: pf('mfRchD'), chamberL: pf('mfRchL'),
      pipeD: pf('mfRpipeD'), cap: pf('mfRcap'), c: pf('mfEc')
    });
    if (!r.ok) {
      msgR.innerHTML = callout('error', r.error);
      $('mfResoStats').innerHTML = '';
      $('mfResoTable').innerHTML = '';
      $('mfResoChart').style.display = 'none';
    } else {
      msgR.innerHTML = '';
      $('mfResoStats').innerHTML =
        stat('共振频率 f_r', num(r.fr, 1), 'Hz', '(c/2π)√(G/V)') +
        stat('声传导率 G', num(r.G, 3), 'm', 'S₀/(t+0.85d)') +
        stat('颈口总面积 S₀', num(r.S0 * 1e4, 1), 'cm²', r.holes + ' × ⌀' + num(r.holeD * 1000, 0) + ' mm') +
        stat('有效颈长', num(r.lEff * 1000, 1), 'mm');
      $('mfResoTable').innerHTML = table(
        ['倍频带 (Hz)', 'f/f_r − f_r/f', 'TL 原始 (dB)', '采用 TL (dB)', '备注'],
        r.rows.map(function (row) {
          return [
            cell('<span class="mono">' + row.f + '</span>'),
            cell('<span class="mono">' + num(row.x, 2) + '</span>'),
            cell('<span class="mono">' + num(row.tlRaw, 1) + '</span>'),
            cell('<span class="mono">' + num(row.tl, 1) + '</span>'),
            row.capped ? cell('受上限 ' + num(r.cap, 0) + ' dB 截断', 'warn') : cell('—', 'muted')
          ];
        }), 'wide');
      var cv = $('mfResoChart');
      cv.style.display = '';
      window.MiniChart.draw(cv, {
        x: r.curve.map(function (p) { return p.f; }),
        xLog: true,
        xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)); },
        yMin: 0, yDigits: 0,
        series: [{
          values: r.curve.map(function (p) { return p.tl; }),
          color: cssVar('--primary', '#2563eb'), width: 2, points: false
        }]
      });
    }
  }

  // ------------------------------ 面板 3：组合验算 ------------------------------
  function recalcCombo() {
    var msg = $('mfComboMsg');
    var o = readGeometry();
    o.alpha = readAlpha();
    o.formula = $('mfFormula').value;
    var flowH = pf('mfFlow');
    o.flow = (flowH != null && flowH > 0) ? flowH / 3600 : null;

    var e = M.expansion({
      d1: pf('mfEd1'), d2: pf('mfEd2'), m: pf('mfEm'),
      l: pf('mfEl'), stages: pf('mfEStages'), c: pf('mfEc')
    });
    var r = M.resonator({
      holeD: pf('mfRh'), plateT: pf('mfRt'), holes: pf('mfRn'),
      volume: pf('mfRvol'), chamberD: pf('mfRchD'), chamberL: pf('mfRchL'),
      pipeD: pf('mfRpipeD'), cap: pf('mfRcap'), c: pf('mfEc')
    });

    var input = {
      res: o,
      exp: e.ok ? { d1: pf('mfEd1'), d2: pf('mfEd2'), m: pf('mfEm'), l: pf('mfEl'), stages: pf('mfEStages'), c: pf('mfEc') } : null,
      reson: r.ok ? { holeD: pf('mfRh'), plateT: pf('mfRt'), holes: pf('mfRn'), volume: pf('mfRvol'), chamberD: pf('mfRchD'), chamberL: pf('mfRchL'), pipeD: pf('mfRpipeD'), cap: pf('mfRcap'), c: pf('mfEc') } : null,
      sourceId: $('mfSource').value,
      weighted: $('mfWeighted').checked
    };
    var c = M.combined(input);
    if (!c.ok) {
      msg.innerHTML = callout('error', c.error);
      $('mfComboStats').innerHTML = '';
      $('mfComboTable').innerHTML = '';
      $('mfComboChart').style.display = 'none';
      return;
    }
    msg.innerHTML = (c.warnings || []).map(function (w) {
      return callout(w.level === 'warn' ? 'warn' : 'info', w.text);
    }).join('');

    $('mfComboStats').innerHTML =
      stat('装前总声级', c.before == null ? '—' : num(c.before, 1), c.weighted ? 'dB(A)' : 'dB',
        c.sourceName + (c.weighted ? ' · A 计权' : '')) +
      stat('装后总声级', c.after == null ? '—' : num(c.after, 1), c.weighted ? 'dB(A)' : 'dB') +
      stat('插入损失 IL', c.insertionLoss == null ? '—' : num(c.insertionLoss, 1), 'dB', '各频带消声量按能量叠加') +
      stat('计权方式', c.weighted ? 'A 计权' : '线性', '');

    $('mfComboTable').innerHTML = table(
      ['倍频带 (Hz)', '声源 (dB)', 'A 计权 (dB)', '阻性 ΔL (dB)', '扩张室 TL (dB)', '共振腔 TL (dB)', '合计 ΔL (dB)', '装后 (dB)'],
      c.rows.map(function (row) {
        return [
          cell('<span class="mono">' + row.f + '</span>'),
          row.source == null ? '—' : cell('<span class="mono">' + num(row.source, 1) + '</span>'),
          row.sourceA == null ? '—' : cell('<span class="mono">' + num(row.sourceA, 1) + '</span>'),
          cell('<span class="mono">' + num(row.dRes, 1) + '</span>'),
          cell('<span class="mono">' + num(row.tlExpansion, 1) + '</span>'),
          cell('<span class="mono">' + num(row.tlResonator, 1) + '</span>'),
          cell('<span class="mono"><strong>' + num(row.total, 1) + '</strong></span>'),
          row.after == null ? '—' : cell('<span class="mono">' + num(row.after, 1) + '</span>')
        ];
      }), 'wide');

    var cv = $('mfComboChart');
    cv.style.display = '';
    window.MiniChart.draw(cv, {
      x: BANDS,
      xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(v); },
      yMin: 0, yDigits: 0,
      series: [
        { values: c.rows.map(function (row) { return c.weighted ? row.sourceA : row.source; }), color: cssVar('--muted', '#94a3b8'), width: 1.5, dash: [4, 3] },
        { values: c.rows.map(function (row) { return c.weighted ? row.afterA : row.after; }), color: cssVar('--primary', '#2563eb'), width: 2 },
        { values: c.rows.map(function (row) { return row.total; }), type: 'bar', color: cssVar('--accent', '#f97316') }
      ]
    });
  }

  // ------------------------------ 联动 ------------------------------
  function syncGeomRows() {
    var f = $('mfForm').value;
    $('mfGeomRound').hidden = f !== 'round';
    $('mfGeomRect').hidden = f !== 'rect';
    $('mfGeomSplitter').hidden = (f !== 'splitter' && f !== 'baffle');
    $('mfUnfoldRow').hidden = f !== 'baffle';
    $('mfLinedEndsRow').hidden = (f !== 'splitter' && f !== 'baffle');
  }

  function syncMaterial() {
    $('mfAlphaCustom').hidden = $('mfMaterial').value !== 'custom';
  }

  function setPanel(name) {
    state.panel = name;
    var view = $('view-muffler');
    if (view) {
      Array.prototype.forEach.call(view.querySelectorAll('.mf-panel'), function (p) {
        p.hidden = p.getAttribute('data-panel') !== name;
      });
      Array.prototype.forEach.call(view.querySelectorAll('.mode-btn[data-mf-panel]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-mf-panel') === name);
      });
    }
    if (name === 'res') recalcRes();
    if (name === 'react') recalcReact();
    if (name === 'combo') recalcCombo();
  }

  function init() {
    if (inited) return;
    inited = true;

    // 材料下拉
    $('mfMaterial').innerHTML = M.MATERIALS.map(function (m) {
      return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
    }).join('') + '<option value="custom">自定义（逐频带输入 α₀）</option>';

    // 声源下拉
    $('mfSource').innerHTML = M.SOURCES.map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
    }).join('');

    // 面板 1 事件
    ['mfForm', 'mfMaterial', 'mfFormula'].forEach(function (id) {
      $(id).addEventListener('change', function () { syncGeomRows(); syncMaterial(); recalcRes(); });
    });
    ['mfD', 'mfA', 'mfB', 'mfBlades', 'mfGap', 'mfHeight', 'mfUnfold', 'mfLength', 'mfC', 'mfFlow']
      .forEach(function (id) { $(id).addEventListener('input', recalcRes); });
    $('mfLinedEnds').addEventListener('change', recalcRes);
    for (var i = 0; i < BANDS.length; i++) {
      $('mfAlpha' + i).addEventListener('input', recalcRes);
    }

    // 面板 2 事件
    ['mfEd1', 'mfEd2', 'mfEm', 'mfEl', 'mfEStages', 'mfEc',
     'mfRh', 'mfRt', 'mfRn', 'mfRvol', 'mfRchD', 'mfRchL', 'mfRpipeD', 'mfRcap']
      .forEach(function (id) { $(id).addEventListener('input', recalcReact); });

    // 面板 3 事件
    $('mfSource').addEventListener('change', recalcCombo);
    $('mfWeighted').addEventListener('change', recalcCombo);
    $('mfComboRecalc').addEventListener('click', recalcCombo);

    var view = $('view-muffler');
    if (view) {
      Array.prototype.forEach.call(view.querySelectorAll('.mode-btn[data-mf-panel]'), function (b) {
        b.addEventListener('click', function () { setPanel(b.getAttribute('data-mf-panel')); });
      });
    }

    syncGeomRows();
    syncMaterial();
    setPanel('res');

    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var v = $('view-muffler');
        if (!v || !v.classList.contains('active')) return;
        if (state.panel === 'res') recalcRes();
        if (state.panel === 'react') recalcReact();
        if (state.panel === 'combo') recalcCombo();
      }, 160);
    });
  }

  function onShow() {
    if (state.panel === 'react') recalcReact();
    else if (state.panel === 'combo') recalcCombo();
    else recalcRes();
  }

  window.MufflerView = { init: init, onShow: onShow, setPanel: setPanel, state: state };
})();
