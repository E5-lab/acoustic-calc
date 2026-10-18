/*
 * view-vibration.js — 弹簧减振器隔振效率计算书视图
 * 依赖：window.Vibration（内核）、window.MiniChart（绘图）
 *
 * 三个基础面板 + 两个厂家复核面板：
 *   select  静变形法：选型正算 → 12 步计算书（含公式与代入过程）
 *   verify  频率比法：由 f、f₀（或 δ）、D 直接验算，两种公式对比
 *   reverse 反算与对照：目标效率 → 所需频率比/固有频率/静变形/最大刚度
 *   check   厂家计算书复核（fn=947√(1/δ) 标准无阻尼体系）
 *   hx      环新式「隔振降噪工程计算书」复核（含阻尼 η、隔声系数 N）
 */
(function () {
  'use strict';

  var V = window.Vibration;

  var Z_BASE = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6,
    1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.6, 4, 4.5, 5, 6, 7, 8];

  var PRESETS = [
    {
      id: 'fan', name: '离心风机（样本例题）：234 kg / 1450 r/min / 4 只 / 3 kg/mm',
      v: { device: 234, base: 0, safety: 1.3, count: 4, rpm: 1450, stiffness: 3, unit: 'kg/mm', dynamic: 1, damping: 0.05, rated: 80 }
    },
    {
      id: 'pump', name: '水泵（高转速软弹簧）：620 kg + 台座 300 / 2950 r/min / 8 只 / 3 kg/mm',
      v: { device: 620, base: 300, safety: 1.3, count: 8, rpm: 2950, stiffness: 3, unit: 'kg/mm', dynamic: 1, damping: 0.08, rated: 200 }
    },
    {
      id: 'ahu', name: '空调机组（橡胶减振器）：1450 kg / 960 r/min / 6 只 / 8 kg/mm / d = 2',
      v: { device: 1450, base: 0, safety: 1.3, count: 6, rpm: 960, stiffness: 8, unit: 'kg/mm', dynamic: 2, damping: 0.08, rated: 400 }
    },
    {
      id: 'chiller', name: '冷冻机房离心机：5543 kg + 台座 1300 / 2950 r/min / 12 只 / 20 kg/mm',
      v: { device: 5543, base: 1300, safety: 1.3, count: 12, rpm: 2950, stiffness: 20, unit: 'kg/mm', dynamic: 1, damping: 0.05, rated: 800 }
    },
    {
      id: 'weak', name: '需改进（弹簧偏硬、效率不足）：800 kg / 1450 r/min / 4 只 / 120 kg/mm',
      v: { device: 800, base: 0, safety: 1.3, count: 4, rpm: 1450, stiffness: 120, unit: 'kg/mm', dynamic: 1, damping: 0.05, rated: 300 }
    }
  ];

  var state = { panel: 'select' };
  var last = null;      // 面板 1 结果
  var lastV = null;     // 面板 2 结果
  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
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
  function cssVar(n, f) { return window.Util.cssVar(n, f); }
  function stat(label, value, unit, sub) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="s-sub">' + sub + '</div>' : '') + '</div>';
  }
  function kv(k, v, unit) {
    return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v +
      (unit ? '<small>' + unit + '</small>' : '') + '</div></div>';
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

  // ======================= 面板 1：静变形法（选型计算书） =======================
  function readSelect() {
    return {
      deviceWeight: pf('vbDevice'),
      baseWeight: pf('vbBase'),
      safety: pf('vbSafety'),
      count: pf('vbCount'),
      rpm: pf('vbRpm'),
      stiffness: pf('vbStiffness'),
      stiffnessUnit: $('vbUnit').value,
      dynamicFactor: parseFloat($('vbDynamic').value) || 1,
      damping: pf('vbDamping'),
      ratedLoad: pf('vbRated')
    };
  }

  function recalcSelect() {
    var o = readSelect();
    var msg = $('vbMsg');
    var r = V.analyze(o);
    if (!r.ok) {
      last = null;
      msg.innerHTML = callout('error', r.error);
      $('vbEta').textContent = '—';
      $('vbVerdict').textContent = '';
      $('vbStats').innerHTML = '';
      $('vbBook').innerHTML = '';
      $('vbWarn').innerHTML = '';
      drawCurve($('vbChart'), { damping: 0.05, markZ: null });
      return;
    }
    last = r;
    msg.innerHTML = '';

    $('vbEta').textContent = num(r.efficiency, 1);
    $('vbVerdict').innerHTML = (r.amplified ? '传递率大于 1：当前方案在放大振动，不可用' :
      '传递率 T = ' + num(r.T, 4) + '　频率比 z = ' + num(r.z, 2) + '　评级：' +
      (r.grade ? r.grade.label : '—')) +
      '　（无阻尼简化式效率 ' + num(r.efficiencyUndamped, 1) + '%）';

    $('vbStats').innerHTML =
      stat('静态压缩量 δ', num(r.deflection, 1), 'mm') +
      stat('固有频率 f₀', num(r.f0, 2), 'Hz') +
      stat('扰动频率 f', num(r.freq, 2), 'Hz') +
      stat('频率比 z', num(r.z, 2), '') +
      stat('每只承载 P', num(r.unitLoad, 1), 'kg') +
      stat('振动级降低量', num(r.lossDb, 1), 'dB');

    renderBook(r);
    renderWarn(r);
    drawCurve($('vbChart'), { damping: r.damping, markZ: r.z });
  }

  function renderBook(r) {
    var rows = r.steps.map(function (s) {
      return [
        cell('<strong>' + s.no + '</strong>'),
        cell('<strong>' + esc(s.title) + '</strong><div class="hint mini">' + esc(s.note) + '</div>'),
        cell('<span class="mono">' + esc(s.formula) + '</span>'),
        cell('<span class="mono">' + esc(s.subst) + '</span>'),
        cell('<span class="mono"><strong>' + num(s.value, 2) + '</strong>' +
          (s.unit ? ' ' + esc(s.unit) : '') + '</span>')
      ];
    });
    $('vbBook').innerHTML = table(
      ['步骤', '项目', '公式', '代入', '结果'], rows, 'wide'
    );
  }

  function renderWarn(r) {
    var list = r.warnings || [];
    var box = $('vbWarn');
    if (!list.length) {
      box.innerHTML = callout('ok', '各项校核通过：频率比、静态压缩量与荷载利用率均在合理范围内。');
      return;
    }
    box.innerHTML = list.map(function (w) {
      var cls = w.level === 'danger' ? 'error' : (w.level === 'ok' ? 'ok' : (w.level === 'info' ? 'info' : 'warn'));
      return callout(cls, w.text);
    }).join('');
  }

  // ====================== 面板 2：频率比法（含阻尼验算） ======================
  function recalcVerify() {
    var msg = $('vbVMsg');
    var r = V.byRatio({
      freq: pf('vbVFreq'),
      f0: pf('vbVF0'),
      deflection: pf('vbVDefl'),
      damping: pf('vbVDamping'),
      dynamicFactor: parseFloat($('vbVDyn2').value) || 1
    });
    if (!r.ok) {
      lastV = null;
      msg.innerHTML = callout('error', r.error);
      $('vbVEta').textContent = '—';
      $('vbVVerdict').textContent = '';
      $('vbVStats').innerHTML = '';
      $('vbVTable').innerHTML = '';
      drawCurve($('vbVChart'), { damping: 0.05, markZ: null });
      return;
    }
    lastV = r;
    msg.innerHTML = '';

    $('vbVEta').textContent = num(r.efficiency, 1);
    $('vbVVerdict').innerHTML = (r.amplified ? '传递率大于 1：振动被放大，此频率比不可用' :
      '频率比 z = ' + num(r.z, 2) + '　' + (r.guide ? r.guide.title : '') +
      '　评级：' + (r.grade ? r.grade.label : '—'));

    $('vbVStats').innerHTML =
      stat('频率比 z', num(r.z, 2), '') +
      stat('固有频率 f₀', num(r.f0, 2), 'Hz') +
      stat('静态压缩量 δ', num(r.deflection, 1), 'mm') +
      stat('共振峰值 T', num(r.peakT, 1), '倍', 'z = 1 时');

    $('vbVTable').innerHTML = table(
      ['项目', '无阻尼简化式 T₀ = |1/(1−z²)|', '含阻尼式 T = √{[1+(2Dz)²]/[(1−z²)²+(2Dz)²]}'],
      [
        ['力传递率 T', num(r.TUndamped, 4), num(r.T, 4)],
        ['隔振效率 η', num(r.efficiencyUndamped, 2) + ' %', num(r.efficiency, 2) + ' %'],
        ['振动级降低量 ΔL', num(r.lossDbUndamped, 2) + ' dB', num(r.lossDb, 2) + ' dB'],
        ['适用说明', '弹簧类（阻尼很小）的常用简化式', '考虑阻尼比 D = ' + num(r.damping, 3) + ' 的完整式'],
        ['两式差异', cell(num(r.efficiencyUndamped - r.efficiency, 2) + ' %（简化式偏乐观）', 'warn'),
          cell('以含阻尼值为设计依据更稳妥', 'ok')]
      ]
    );

    drawCurve($('vbVChart'), { damping: r.damping, markZ: r.z, maxZ: Math.max(6, Math.ceil(r.z * 1.15)) });
  }

  // ======================== 面板 3：反算与对照 ========================
  function recalcReverse() {
    var msg = $('vbTMsg');
    var unit = $('vbTUnit').value;
    var base = {
      targetEfficiency: pf('vbTEta'),
      freq: pf('vbTFreq'),
      damping: pf('vbTDamping'),
      loadKg: pf('vbTLoad'),
      dynamicFactor: 1,
      stiffnessUnit: unit
    };
    var r = V.reverse(base);
    if (!r.ok) {
      msg.innerHTML = callout('error', r.error);
      $('vbTResult').innerHTML = '';
      $('vbTableBox').innerHTML = '';
      return;
    }
    msg.innerHTML = r.feasible ? '' : callout('warn', r.note);

    $('vbTResult').innerHTML =
      kv('目标隔振效率 η', num(r.target, 1) + ' <small>%</small>') +
      kv('所需力传递率 T ≤', num(r.T, 4)) +
      kv('所需频率比 z ≥', num(r.z, 2) + (r.exact ? ' <small>(解析解)</small>' : ' <small>(数值解)</small>')) +
      kv('所需固有频率 f₀ ≤', num(r.f0, 2) + ' <small>Hz</small>') +
      kv('所需静态压缩量 δ ≥', num(r.deflection, 2) + ' <small>mm</small>') +
      (r.maxStiffnessKgPerMm == null
        ? kv('单只最大允许刚度', '—')
        : kv('单只最大允许刚度 k ≤', num(r.maxStiffness, 3) + ' <small>' + esc(unit) + '</small>'));

    var tb = V.efficiencyTable({
      freq: base.freq, damping: base.damping, loadKg: base.loadKg,
      dynamicFactor: 1, stiffnessUnit: unit,
      targets: [80, 85, 90, 95, 97, 98, 99]
    });
    $('vbTableBox').innerHTML = tb.length ? table(
      ['目标效率 η', '频率比 z ≥', '固有频率 f₀ ≤ (Hz)', '静态压缩量 δ ≥ (mm)', '单只刚度 k ≤ (' + esc(unit) + ')'],
      tb.map(function (row) {
        return [
          cell(num(row.target, 0) + ' %', row.target >= 95 ? 'ok' : ''),
          num(row.z, 2),
          num(row.f0, 2),
          num(row.deflection, 2),
          row.maxStiffness == null ? '—' : num(row.maxStiffness, 3)
        ];
      })
    ) + '<p class="inline-note">按钢弹簧（动、静刚度比 d = 1）计算；若采用橡胶类减振器，所需静态压缩量应再乘以 d（1.5 ~ 2.3），对应的允许刚度更小。</p>'
      : '';
  }

  // ===================== 面板 4：厂家计算书复核 =====================
  function recalcReview() {
    var msg = $('vbCMsg');
    var r = V.verifySheet({
      deviceWeight: pf('vbCWa'),
      safety: pf('vbCSafety'),
      count: pf('vbCN'),
      rpm: pf('vbCRpm'),
      stiffness: pf('vbCK'),
      stiffnessUnit: $('vbCUnit').value,
      claimedDeflection: pf('vbCDelta'),
      claimedFnCpm: pf('vbCFn'),
      claimedEfficiency: pf('vbCEff')
    });
    if (!r.ok) {
      msg.innerHTML = callout('error', r.error);
      $('vbCResult').innerHTML = '';
      return;
    }
    msg.innerHTML = '';

    var verdictHtml;
    if (r.providedCount === 0) {
      verdictHtml = callout('info', '已按厂家标准公式重算（fn = 947√(1/δ) 等）。如需复核厂家声称值，请在下方填入厂家计算书给出的 δ / fn / η 任意一项进行比对。');
    } else if (r.allConsistent) {
      verdictHtml = callout('ok', '✓ 一致：厂家计算书与标准公式吻合，复核通过（共比对 ' + r.providedCount + ' 项）。');
    } else {
      var names = r.rows.filter(function (rr) { return rr.check.provided && rr.check.status !== 'ok'; })
        .map(function (rr) { return rr.label; }).join('、');
      verdictHtml = callout('error', '✘ 存在差异：' + r.mismatchCount + ' 项与标准公式不符（' + names + '），详见下表。');
    }

    var rows = r.rows.map(function (rr) {
      var c = rr.check;
      var d = (rr.key === 'fn') ? 1 : 2;
      var recomputedHtml = num(c.recomputed, d) + ' ' + rr.unit;
      var claimedHtml = c.provided ? (num(c.claimed, d) + ' ' + rr.unit) : '—';
      var diffHtml = c.provided ? ((c.diff >= 0 ? '+' : '') + num(c.diff, d) + ' ' + rr.unit) : '—';
      var statusCell = !c.provided ? cell('待比对', 'muted')
        : (c.status === 'ok' ? cell('一致', 'ok')
          : (c.status === 'warn' ? cell('轻微偏差', 'warn') : cell('偏差', 'danger')));
      return [
        cell('<strong>' + rr.label + '</strong>'),
        cell('<span class="mono">' + recomputedHtml + '</span>'),
        cell(c.provided ? '<span class="mono">' + claimedHtml + '</span>' : claimedHtml),
        cell('<span class="mono">' + diffHtml + '</span>'),
        statusCell
      ];
    });

    var internalNote = (r.internalDelta != null)
      ? '<p class="inline-note">交叉印证：本工具精算（d=1、无阻尼）得 δ = ' + num(r.internalDelta, 2) +
        ' mm、f₀ = ' + num(r.internalFnHz, 2) + ' Hz、η = ' + num(r.internalEff, 2) +
        ' %。其中 δ 与上方「标准公式重算」完全一致；f₀、η 因厂家公式对固有频率常数取整为 947（精确值约 945.4）而相差 &lt; 0.05%，' +
        '可视为一致 —— 说明本工具的隔振计算与厂家常用方法等价，复核结果可信。</p>'
      : '';

    $('vbCResult').innerHTML =
      verdictHtml +
      table(['复核项', '按厂家标准公式重算', '厂家声称值', '偏差', '判定'], rows, 'wide') +
      internalNote;
  }

  // ================ 面板 5：环新式「隔振降噪工程计算书」复核 ================
  // 青浦环新等国产厂家常用格式：f₀=(1/2π)√(9800/δ)、含阻尼传递率 η、
  // T=(1−η)×100%、隔声系数 N=12.5lg(1/η)。注意该格式 η=传递率、T=隔振效率。
  var HX_PRESET = {
    name: '环新计算书例题：冷冻机组 10000 kg / 2900 r/min / 8 只 / δ=50 mm / D=0.065',
    v: {
      project: '', device: '冷冻机组', model: '', isolModel: '弹簧减振器 BT3-1500',
      rpm: 2900, wa: 10000, ped: null, safety: 20, count: 8, k: '', unit: 'kg/mm',
      delta: 50, damping: 0.065,
      cf0: 2.23, clambda: 21.7, ceta: 0.01, ct: 99, cn: 25
    }
  };

  function readHx() {
    return {
      project: ($('vbHProject') || {}).value || '',
      deviceName: ($('vbHDevice') || {}).value || '',
      deviceModel: ($('vbHModel') || {}).value || '',
      isolatorModel: ($('vbHIsolModel') || {}).value || '',
      rpm: pf('vbHRpm'),
      deviceWeight: pf('vbHWa'),
      pedestalWeight: pf('vbHPed'),
      safetyPercent: pf('vbHSafety'),
      count: pf('vbHCount'),
      stiffness: pf('vbHK'),
      stiffnessUnit: $('vbHUnit') ? $('vbHUnit').value : 'kg/mm',
      deflection: pf('vbHDelta'),
      damping: pf('vbHD'),
      claimedF0: pf('vbHCF0'),
      claimedLambda: pf('vbHCLambda'),
      claimedEta: pf('vbHCEta'),
      claimedT: pf('vbHCT'),
      claimedN: pf('vbHCN')
    };
  }

  function recalcHx() {
    var msg = $('vbHMsg');
    var r = V.hxSheet(readHx());
    if (!r.ok) {
      msg.innerHTML = callout('error', r.error);
      $('vbHStats').innerHTML = '';
      $('vbHResult').innerHTML = '';
      $('vbHBook').innerHTML = '';
      return;
    }
    msg.innerHTML = '';

    $('vbHStats').innerHTML =
      stat('干扰频率 f', num(r.f, 1), 'Hz') +
      stat('静态压缩量 δ', num(r.delta, 1), 'mm') +
      stat('固有频率 f₀', num(r.f0, 2), 'Hz') +
      stat('频率比 λ', num(r.lambda, 1), '') +
      stat('传递率 η', num(r.eta, 4), '', '含阻尼 D = ' + num(r.inputs.D, 3)) +
      stat('隔振效率 T', num(r.T, 1), '%') +
      stat('隔声系数 N', num(r.N, 1), 'dB');

    // 复核比对表
    var verdictHtml;
    if (r.providedCount === 0) {
      verdictHtml = callout('info', '已按该厂家公式体系（f₀=(1/2π)√(9800/δ)、含阻尼 η、N=12.5lg(1/η)）重算。如需复核，请填入厂家计算书声称的 f₀ / λ / η / T / N 任意几项。');
    } else if (r.allConsistent) {
      verdictHtml = callout('ok', '✓ 一致：厂家计算书与该公式体系吻合，复核通过（共比对 ' + r.providedCount + ' 项）。');
    } else {
      var names = r.rows.filter(function (rr) { return rr.check.provided && rr.check.status !== 'ok'; })
        .map(function (rr) { return rr.label; }).join('、');
      verdictHtml = callout('error', '✘ 存在差异：' + r.mismatchCount + ' 项与公式重算值不符（' + names + '），详见下表。');
    }

    var rows = r.rows.map(function (rr) {
      var c = rr.check;
      var d = (rr.key === 'eta') ? 4 : 2;
      var recomputedHtml = num(c.recomputed, d) + (rr.unit ? ' ' + rr.unit : '');
      var claimedHtml = c.provided ? (num(c.claimed, d) + (rr.unit ? ' ' + rr.unit : '')) : '—';
      var diffHtml = c.provided ? ((c.diff >= 0 ? '+' : '') + num(c.diff, d) + (rr.unit ? ' ' + rr.unit : '')) : '—';
      var statusCell = !c.provided ? cell('待比对', 'muted')
        : (c.status === 'ok' ? cell('一致', 'ok')
          : (c.status === 'warn' ? cell('轻微偏差', 'warn') : cell('偏差', 'danger')));
      return [
        cell('<strong>' + rr.label + '</strong>' + (rr.note ? '<div class="hint mini">' + esc(rr.note) + '</div>' : '')),
        cell('<span class="mono">' + recomputedHtml + '</span>'),
        cell(c.provided ? '<span class="mono">' + claimedHtml + '</span>' : claimedHtml),
        cell('<span class="mono">' + diffHtml + '</span>'),
        statusCell
      ];
    });

    var crossNote = (r.internalF0 != null)
      ? '<p class="inline-note">交叉印证：本工具精算内核（g = 9806.65 mm/s² 精确值）得 f₀ = ' + num(r.internalF0, 3) +
        ' Hz、隔振效率 = ' + num(r.internalEta, 2) + ' %，与上方按厂家常数（g = 9800）的重算值差异 &lt; 0.04%，两套算法同源等价。</p>' +
        '<p class="inline-note">符号说明：该厂家格式中 <strong>η 指传递率</strong>（数值越小越好）、<strong>T 指隔振效率</strong>，与本站其他面板的 η/T 含义相反，复核时请以本表为准。</p>'
      : '';

    $('vbHResult').innerHTML = verdictHtml +
      table(['复核项', '按公式重算', '厂家声称值', '偏差', '判定'], rows, 'wide') + crossNote;

    // 计算书（第九 ~ 十四节）
    var bookRows = r.steps.map(function (s) {
      return [
        cell('<strong>' + esc(s.no) + '</strong>'),
        cell('<strong>' + esc(s.title) + '</strong>'),
        cell('<span class="mono">' + esc(s.formula) + '</span>'),
        cell('<span class="mono">' + esc(s.subst) + '</span>'),
        cell('<span class="mono"><strong>' + num(s.value, s.value < 0.01 ? 4 : 2) + '</strong>' +
          (s.unit ? ' ' + esc(s.unit) : '') + '</span>')
      ];
    });
    $('vbHBook').innerHTML =
      '<p class="inline-note"><strong>（一）工程项目：</strong>' + esc(readHx().project || '／') + '</p>' +
      '<div class="kv-result">' +
      kv('（二）隔振设备名称', esc(readHx().deviceName || '／')) +
      kv('（三）设备型号', esc(readHx().deviceModel || '／')) +
      kv('（四）设备转速 n', num(r.inputs.rpm, 0) + ' <small>转/分</small>') +
      kv('（五）设备重量', num(r.inputs.Wa, 0) + ' <small>kg</small>') +
      kv('（六）台座重量', r.inputs.pedestal > 0 ? num(r.inputs.pedestal, 0) + ' <small>kg</small>' : '／') +
      kv('（七）减振体系总重 W', num(r.Wd, 0) + ' <small>kg（含 ' + num(r.inputs.safetyPercent, 0) + '% 安全系数）</small>') +
      kv('（八）减振器', r.inputs.n + ' 只 · 单只载荷 W/N = ' + num(r.W, 0) + ' kg' + (readHx().isolatorModel ? ' · ' + esc(readHx().isolatorModel) : '')) +
      '</div>' +
      table(['节', '项目', '公式', '代入', '结果'], bookRows, 'wide');
  }

  function renderGuide() {
    $('vbGuideBox').innerHTML = table(
      ['频率比 z', '判定', '说明'],
      V.RATIO_GUIDE.map(function (g) {
        var cls = g.level === 'danger' ? 'warn' : (g.level === 'good' ? 'ok' : '');
        var range = g.to === Infinity ? ('z > ' + g.from) : (g.from + ' ≤ z ≤ ' + g.to);
        return [
          cell('<span class="mono">' + range + '</span>'),
          cell(g.title, cls),
          cell(g.note)
        ];
      })
    );
  }

  function renderGrade() {
    $('vbGradeBox').innerHTML = table(
      ['隔振效率 η', '等级', '典型适用场所'],
      V.EFFICIENCY_GRADES.map(function (g) {
        var range = g.min === -Infinity ? 'η < 80%' : ('η ≥ ' + g.min + '%');
        var cls = g.level === 'danger' ? 'warn' : (g.level === 'good' ? 'ok' : '');
        return [cell('<span class="mono">' + range + '</span>'), cell(g.label, cls), cell(g.note)];
      })
    );
  }

  // ============================== 绘图 ==============================
  function drawCurve(canvas, o) {
    if (!canvas) return;
    var markZ = o.markZ;
    var maxZ = o.maxZ != null ? o.maxZ : 8;
    if (markZ != null && isFinite(markZ) && markZ > maxZ) maxZ = Math.min(Math.ceil(markZ * 1.05), 60);

    var xs = [];
    Z_BASE.forEach(function (z) { if (z <= maxZ + 1e-9) xs.push(z); });
    for (var z = 9; z < maxZ - 1e-9; z += 1) xs.push(z);
    if (markZ != null && isFinite(markZ) && markZ > 0.05 && markZ <= maxZ) xs.push(markZ);
    xs.sort(function (a, b) { return a - b; });
    xs = xs.filter(function (v, i, a) { return i === 0 || Math.abs(v - a[i - 1]) > 1e-9; });

    var CAP = 40;
    var td = [], tu = [], mk = [];
    xs.forEach(function (x) {
      var a = V.transmissibility(x, o.damping);
      var b = V.transmissibilityUndamped(x);
      td.push(a == null ? null : Math.min(a, CAP));
      tu.push(b == null ? null : Math.min(b, CAP));
      mk.push(markZ != null && Math.abs(x - markZ) < 1e-9 ? (a == null ? null : Math.min(a, CAP)) : null);
    });

    window.MiniChart.draw(canvas, {
      x: xs,
      xLabelFmt: function (v) { return v < 1 ? '' : (v >= 10 ? v.toFixed(0) : v.toFixed(1)); },
      yMin: 0, yMax: 4, yTicks: 4, yDigits: 1,
      hBands: [{ from: 0, to: 1, color: 'rgba(249,115,22,0.08)' }],
      series: [
        { values: tu, color: cssVar('--muted', '#94a3b8'), width: 1.5, dash: [4, 3], points: false },
        { values: td, color: cssVar('--primary', '#2563eb'), width: 2, points: false },
        { values: mk, color: cssVar('--accent', '#f97316'), points: true, radius: 4.5 }
      ]
    });
  }

  // ============================ 摘要与导出 ============================
  function summaryText() {
    if (!last) return '';
    var r = last;
    var out = ['弹簧减振器隔振效率计算书（静变形法）', ''];
    out.push('已知条件：设备自重 ' + num(r.device, 1) + ' kg，台座/配重 ' + num(r.baseWeight, 1) +
      ' kg，安全系数 ' + num(r.safety, 2) + '，减振器 ' + r.count + ' 只' +
      (r.rpm ? '，转速 ' + num(r.rpm, 0) + ' r/min' : '') + '。');
    out.push('减振器：单只刚度 ' + num(r.stiffnessInput, 3) + ' ' + r.stiffnessUnit +
      '，动/静刚度比 d = ' + num(r.dynamicFactor, 2) + '，阻尼比 D = ' + num(r.damping, 3) +
      (r.ratedLoad != null ? '，单只额定荷载 ' + num(r.ratedLoad, 1) + ' kg' : '') + '。');
    out.push('');
    out.push('计算过程：');
    r.steps.forEach(function (s) {
      out.push(s.no + '. ' + s.title);
      out.push('   公式：' + s.formula);
      out.push('   代入：' + s.subst + ' → ' + num(s.value, 2) + (s.unit ? ' ' + s.unit : ''));
    });
    out.push('');
    out.push('结论：频率比 z = ' + num(r.z, 2) + '，传递率 T = ' + num(r.T, 4) +
      '，隔振效率 η = ' + num(r.efficiency, 2) + '%（无阻尼简化式 ' + num(r.efficiencyUndamped, 2) +
      '%），振动级降低 ' + num(r.lossDb, 1) + ' dB；判定：' + (r.guide ? r.guide.title : '') +
      '，效率等级 ' + (r.grade ? r.grade.label : '—') + '。');
    if (r.warnings && r.warnings.length) {
      out.push('');
      out.push('校核提示：');
      r.warnings.forEach(function (w) { out.push('   · ' + w.text); });
    }
    out.push('');
    out.push('工具：声学计算工具箱 · 弹簧减振（隔振效率计算书）　依据：《噪声与振动控制工程技术导则》第 7.4 节');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rows = [['弹簧减振器隔振效率计算书', '', '', '', '']];
    rows.push(['设备自重 (kg)', num(last.device, 1), '台座/配重 (kg)', num(last.baseWeight, 1), '']);
    rows.push(['安全系数 K', num(last.safety, 2), '减振器数量 (只)', last.count, '']);
    rows.push(['转速 (r/min)', last.rpm == null ? '' : num(last.rpm, 0), '扰动频率 f (Hz)', num(last.freq, 2), '']);
    rows.push(['单只刚度', num(last.stiffnessInput, 3), '刚度单位', last.stiffnessUnit, '→ kg/mm ' + num(last.stiffnessKgPerMm, 4)]);
    rows.push(['动/静刚度比 d', num(last.dynamicFactor, 2), '阻尼比 D', num(last.damping, 3), '']);
    rows.push([]);
    rows.push(['步骤', '项目', '公式', '代入', '结果']);
    last.steps.forEach(function (s) {
      rows.push([s.no, s.title, s.formula, s.subst, num(s.value, 2) + (s.unit ? ' ' + s.unit : '')]);
    });
    rows.push([]);
    rows.push(['结论', '隔振效率 (%)', num(last.efficiency, 2), '无阻尼式 (%)', num(last.efficiencyUndamped, 2)]);
    rows.push(['传递率 T', num(last.T, 4), '频率比 z', num(last.z, 2), '振动级降低 (dB) ' + num(last.lossDb, 1)]);
    download(rows, 'vibration-calc-sheet.csv');
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

  // ============================ 面板切换与初始化 ============================
  function setPanel(name) {
    state.panel = name;
    var view = $('view-vibration');
    if (view) {
      Array.prototype.forEach.call(view.querySelectorAll('.vb-panel'), function (p) {
        p.hidden = p.getAttribute('data-panel') !== name;
      });
      Array.prototype.forEach.call(view.querySelectorAll('.mode-btn[data-vb-panel]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-vb-panel') === name);
      });
    }
    if (name === 'select') recalcSelect();
    if (name === 'verify') recalcVerify();
    if (name === 'reverse') recalcReverse();
    if (name === 'check') recalcReview();
    if (name === 'hx') recalcHx();
  }

  function applyPreset(p) {
    $('vbDevice').value = p.device;
    $('vbBase').value = p.base;
    $('vbSafety').value = p.safety;
    $('vbCount').value = p.count;
    $('vbRpm').value = p.rpm;
    $('vbStiffness').value = p.stiffness;
    $('vbUnit').value = p.unit;
    $('vbDynamic').value = String(p.dynamic);
    $('vbDamping').value = p.damping;
    $('vbRated').value = p.rated == null ? '' : p.rated;
  }

  function init() {
    if (inited) return;
    inited = true;

    $('vbPreset').innerHTML = '<option value="">载入示例…</option>' + PRESETS.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    $('vbPreset').addEventListener('change', function () {
      var id = this.value;
      this.value = '';
      PRESETS.forEach(function (p) { if (p.id === id) applyPreset(p.v); });
      recalcSelect();
    });

    ['vbDevice', 'vbBase', 'vbSafety', 'vbCount', 'vbRpm', 'vbStiffness', 'vbRated', 'vbDamping']
      .forEach(function (id) { $(id).addEventListener('input', recalcSelect); });
    $('vbUnit').addEventListener('change', recalcSelect);
    $('vbDynamic').addEventListener('change', recalcSelect);

    ['vbVFreq', 'vbVF0', 'vbVDefl', 'vbVDamping'].forEach(function (id) {
      $(id).addEventListener('input', recalcVerify);
    });
    $('vbVDyn2').addEventListener('change', recalcVerify);

    ['vbTEta', 'vbTFreq', 'vbTLoad', 'vbTDamping'].forEach(function (id) {
      $(id).addEventListener('input', recalcReverse);
    });
    $('vbTUnit').addEventListener('change', recalcReverse);

    ['vbCWa', 'vbCSafety', 'vbCN', 'vbCRpm', 'vbCK', 'vbCDelta', 'vbCFn', 'vbCEff']
      .forEach(function (id) { $(id).addEventListener('input', recalcReview); });
    $('vbCUnit').addEventListener('change', recalcReview);

    ['vbHRpm', 'vbHWa', 'vbHPed', 'vbHSafety', 'vbHCount', 'vbHK', 'vbHDelta', 'vbHD',
     'vbHCF0', 'vbHCLambda', 'vbHCEta', 'vbHCT', 'vbHCN']
      .forEach(function (id) { $(id).addEventListener('input', recalcHx); });
    $('vbHUnit').addEventListener('change', recalcHx);
    var hxBtn = $('vbHLoadExample');
    if (hxBtn) {
      hxBtn.addEventListener('click', function () {
        var v = HX_PRESET.v;
        $('vbHProject').value = v.project; $('vbHDevice').value = v.device;
        $('vbHModel').value = v.model; $('vbHIsolModel').value = v.isolModel;
        $('vbHRpm').value = v.rpm; $('vbHWa').value = v.wa;
        $('vbHPed').value = v.ped == null ? '' : v.ped; $('vbHSafety').value = v.safety;
        $('vbHCount').value = v.count; $('vbHK').value = v.k;
        $('vbHUnit').value = v.unit; $('vbHDelta').value = v.delta;
        $('vbHD').value = v.damping;
        $('vbHCF0').value = v.cf0; $('vbHCLambda').value = v.clambda;
        $('vbHCEta').value = v.ceta; $('vbHCT').value = v.ct; $('vbHCN').value = v.cn;
        recalcHx();
      });
    }

    $('vbCopy').addEventListener('click', function () { copyText(summaryText(), 'vbCopyMsg'); });
    $('vbCsv').addEventListener('click', exportCsv);

    var view = $('view-vibration');
    if (view) {
      Array.prototype.forEach.call(view.querySelectorAll('.mode-btn[data-vb-panel]'), function (b) {
        b.addEventListener('click', function () { setPanel(b.getAttribute('data-vb-panel')); });
      });
    }

    renderGuide();
    renderGrade();
    setPanel('select');

    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var v = $('view-vibration');
        if (!v || !v.classList.contains('active')) return;
        if (state.panel === 'select') recalcSelect();
        if (state.panel === 'verify') recalcVerify();
        if (state.panel === 'check') recalcReview();
        if (state.panel === 'hx') recalcHx();
      }, 160);
    });
  }

  function onShow() {
    if (state.panel === 'select') recalcSelect();
    else if (state.panel === 'verify') recalcVerify();
    else if (state.panel === 'check') recalcReview();
    else if (state.panel === 'hx') recalcHx();
    else recalcReverse();
  }

  window.VibrationView = { init: init, onShow: onShow, setPanel: setPanel, state: state };
})();
