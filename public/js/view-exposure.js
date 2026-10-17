/*
 * view-exposure.js — 职业噪声暴露量计算视图（#/exposure）
 * 依赖：window.Exposure（内核）、window.MiniChart（绘图）
 *
 * 四张卡片（DOM 由本视图自建，index.html 仅留空容器）：
 *   1) 分段暴露计算：L_EX,8h / L_EX,40h、NIOSH 3 dB 与 OSHA 5 dB 剂量/TWA、GBZ 判定与作业分级
 *   2) 允许暴露时间：逐级表 + 延长班次限值调整（NIOSH REL / OSHA AL）
 *   3) 脉冲噪声：GBZ 2.2 表10 峰值限值 + GBZ/T 229.4 表2 分级
 *   4) 护听器选型：配备三档、NRR 折算（OSHA/NIOSH）、ISO SNR 法、双防护
 */
(function () {
  'use strict';

  var E = window.Exposure, Chart = window.MiniChart;
  var state = { lastSegs: null, shiftHours: 8 };
  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function tag(pass, margin, unit) {
    return pass
      ? '<span class="mc-tag live">达标 +' + num(margin, 1) + ' ' + (unit || 'dB') + '</span>'
      : '<span class="mc-tag" style="color:var(--warn);background:var(--warn-soft);border-color:color-mix(in srgb, var(--warn) 35%, transparent)">超标 ' + num(margin, 1) + ' ' + (unit || 'dB') + '</span>';
  }
  function line(html, cls) {
    return '<div class="result-line' + (cls ? ' ' + cls : '') + '">' + html + '</div>';
  }

  // ---------------------------------------------------------------- 卡片 1：分段暴露

  function readSegs() {
    var segs = [];
    var rows = document.querySelectorAll('#exSegBody tr');
    for (var i = 0; i < rows.length; i++) {
      var inputs = rows[i].querySelectorAll('input');
      var L = pf(inputs[0].value), h = pf(inputs[1].value);
      if (L != null && h != null && L > 0 && h > 0) { segs.push({ L: L, h: h }); }
    }
    return segs;
  }

  function segRow(L, h) {
    return '<tr>' +
      '<td><input class="text-input seg-in" type="number" value="' + (L == null ? '' : L) + '" step="1" min="0" placeholder="如 90"></td>' +
      '<td><input class="text-input seg-in" type="number" value="' + (h == null ? '' : h) + '" step="0.5" min="0" placeholder="如 4"></td>' +
      '</tr>';
  }

  function fillSegTable(segs) {
    var html = '';
    for (var i = 0; i < 8; i++) {
      html += segRow(segs[i] ? segs[i].L : null, segs[i] ? segs[i].h : null);
    }
    $('exSegBody').innerHTML = html;
  }

  function calcSegs() {
    var segs = readSegs();
    if (!segs.length) { return alert('请至少填写一段有效暴露（声级 dBA + 接触小时）'); }
    state.lastSegs = segs;

    var lex8 = E.lex8h(segs), lex40 = E.lex40h(segs), total = E.totalHours(segs);
    var dN = E.dose(segs, 'niosh'), dP = E.dose(segs, 'osha'), dA = E.dose(segs, 'osha-al');
    var tN = E.twaFromDose(dN, 'niosh'), tP = E.twaFromDose(dP, 'osha'), tA = E.twaFromDose(dA, 'osha-al');
    var grade = E.noiseGrade(lex8);

    // 汇总
    var html =
      line('总接触时间 <strong>' + num(total, 2) + ' h/日</strong>；8 h 等效连续 A 声级 <strong>L_EX,8h = ' +
        num(lex8, 1) + ' dB(A)</strong>（周 40 h 等效 L_EX,40h = ' + num(lex40, 1) + ' dB(A)）') +
      line('GBZ 2.2-2007 限值 85 dB(A)：' + tag(lex8 <= 85, 85 - lex8) +
        '；GBZ/T 229.4-2012 作业分级：<strong>' + esc(grade.grade) + ' 级 · ' + esc(grade.label) + '</strong>') +
      (grade.watch
        ? line('管理要求：≥80 且 <85 dB 应进行健康监护（每两年跟踪听力测试）；作业方式或控制效果变化时重新分级。', 'ok')
        : (lex8 >= 85
          ? line('管理要求：应进行职业健康检查（上岗前/在岗/离岗），配备护听器并采取工程控制措施；I 级起按级别加严管理。', 'warn')
          : ''));
    $('exSegSummary').innerHTML = html;

    // 三套准则剂量表
    var rows = segs.map(function (s, i) {
      var tn = E.allowedTime(s.L, 'niosh'), tp = E.allowedTime(s.L, 'osha'), ta = E.allowedTime(s.L, 'osha-al');
      var cn = dN > 0 ? (s.h / tn) / (dN / 100) * 100 : 0;
      var w = Math.max(1.5, Math.min(100, cn));
      return '<tr><td>段 ' + (i + 1) + '</td><td>' + num(s.L, 1) + '</td><td>' + num(s.h, 2) + '</td>' +
        '<td>' + num(tn, 3) + '</td><td>' + num(tp, 3) + '</td><td>' + num(ta, 3) + '</td>' +
        '<td>' + num(cn, 1) + '%</td><td><span class="share-bar" style="width:' + w + '%"></span></td></tr>';
    }).join('');
    $('exSegTable').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>段</th><th>声级 L_i (dBA)</th>' +
      '<th>时长 t_i (h)</th><th>NIOSH 允许 (h)</th><th>OSHA PEL 允许 (h)</th><th>OSHA AL 允许 (h)</th>' +
      '<th>NIOSH 剂量贡献</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    // 三准则对照
    $('exSegCriteria').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>评价准则</th><th>限值 (8 h TWA)</th>' +
      '<th>日剂量 D</th><th>反算 TWA</th><th>判定</th></tr></thead><tbody>' +
      '<tr><td>NIOSH REL（3 dB 交换率）</td><td>85 dBA</td><td>' + num(dN, 1) + '%</td><td>' + num(tN, 2) + ' dBA</td><td>' +
        tag(tN <= 85, 85 - tN) + '</td></tr>' +
      '<tr><td>OSHA PEL（5 dB 交换率）</td><td>90 dBA</td><td>' + num(dP, 1) + '%</td><td>' + num(tP, 2) + ' dBA</td><td>' +
        tag(tP <= 90, 90 - tP) + '</td></tr>' +
      '<tr><td>OSHA 行动级 AL（5 dB）</td><td>85 dBA</td><td>' + num(dA, 1) + '%</td><td>' + num(tA, 2) + ' dBA</td><td>' +
        tag(tA <= 85, 85 - tA) + '</td></tr>' +
      '</tbody></table></div>' +
      '<p class="hint">NIOSH 的 3 dB 交换率即等能量假定，与 L_EX,8h 一致；OSHA 的 5 dB 交换率对高量级短时暴露给更宽的允许时间，相同现场常得出更低的 TWA（本例题 OSHA TWA ' +
      num(tP, 1) + ' vs L_EX,8h ' + num(lex8, 1) + ' dB）。国内评价以 GBZ 2.2 的 L_EX,8h = 85 dB(A) 为准。</p>';

    drawTwaChart(lex8, tN, tP, tA);
  }

  function drawTwaChart(lex8, tN, tP, tA) {
    Chart.draw($('exSegChart'), {
      x: ['L_EX,8h', 'NIOSH', 'OSHA PEL', 'OSHA AL'],
      yMin: 70, yMax: 100, yTicks: 6, yDigits: 0,
      hBands: [
        { from: 85, to: 85, color: 'rgba(239,68,68,0.35)' },
        { from: 90, to: 90, color: 'rgba(245,158,11,0.35)' }
      ],
      series: [
        { values: [lex8, tN, tP, tA], color: '#2563eb', width: 2, points: true, radius: 5 }
      ]
    });
  }

  // ---------------------------------------------------------------- 卡片 2：允许暴露时间

  function calcShift() {
    var h = pf($('exShift').value);
    if (h == null || h <= 0) { return alert('请填写班次时长（小时）'); }
    state.shiftHours = h;
    var rows = '';
    [8, 9, 10, 11, 12].forEach(function (t) {
      var mark = Math.abs(t - h) < 0.01 ? ' style="font-weight:700"' : '';
      rows += '<tr' + mark + '><td>' + t + ' h</td><td>' + num(E.extendedRel(t, 'niosh'), 2) + '</td>' +
        '<td>' + num(E.extendedRel(t, 'osha-al'), 2) + '</td><td>' + num(E.extendedRel(t, 'osha'), 2) + '</td></tr>';
    });
    $('exShiftTable').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>班次时长</th>' +
      '<th>NIOSH REL 调整值 (dBA)</th><th>OSHA AL 调整值 (dBA)</th><th>OSHA PEL (dBA)</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<p class="hint">延长班次按等能量折算：NIOSH = 85 − 10lg(T/8)（9/10/11/12 h → 84.5/84.0/83.6/83.2，与 NIOSH 98-126 公布值一致）；' +
      'OSHA AL = 85 − 16.61·lg(T/8)（→ 84.1/83.4/82.7/82.1）；OSHA PEL 不随班次调整，恒为 90 dBA。</p>';

    var L = pf($('exLevelQ').value);
    if (L != null && L > 0) {
      var tn = E.allowedTime(L, 'niosh'), tp = E.allowedTime(L, 'osha'), ta = E.allowedTime(L, 'osha-al');
      $('exAllowedOut').innerHTML =
        line('实测 ' + num(L, 1) + ' dBA 下：NIOSH 允许 <strong>' + num(tn * 60, 1) + ' min</strong>、' +
          'OSHA PEL 允许 <strong>' + num(tp * 60, 1) + ' min</strong>、OSHA AL 允许 <strong>' + num(ta * 60, 1) + ' min</strong>',
          tn * 60 < 30 ? 'warn' : 'ok');
    }
  }

  // ---------------------------------------------------------------- 卡片 3：脉冲噪声

  function calcPeak() {
    var peak = pf($('exPeak').value), n = pf($('exPeakN').value);
    if (peak == null || peak <= 0) { return alert('请填写脉冲噪声声压级峰值（dB）'); }
    if (n == null || n <= 0) { return alert('请填写工作日脉冲次数 n'); }

    var lim = E.peakLimit(n);
    var g = E.peakGrade(peak, n);
    var html = '';
    if (lim != null) {
      html += line('GBZ 2.2-2007 表10：日脉冲 n = ' + num(n, 0) + ' 次 → 峰值限值 <strong>' + lim + ' dB</strong>；实测 ' +
        num(peak, 1) + ' dB → ' + tag(peak <= lim, lim - peak));
    } else {
      html += line('日脉冲次数超过 10000 次，超出 GBZ 2.2 表10 范围，应按连续噪声评价。', 'warn');
    }
    html += line('NIOSH / OSHA 脉冲峰值上限 140 dB：' + tag(peak <= 140, 140 - peak) + '（任何情况下不得超过）');
    if (g) {
      html += line('GBZ/T 229.4-2012 表2 脉冲作业分级：<strong>' + esc(g.grade) + ' 级 · ' + esc(g.label) + '</strong>' +
        '（峰值 ' + num(peak, 1) + ' dB、n = ' + num(n, 0) + ' 次/日）', g.grade === 'IV' || g.grade === 'III' ? 'warn' : 'ok');
    } else {
      html += line('该峰值低于表2 对应次数档的 I 级下限（' + (n <= 100 ? 140 : (n <= 1000 ? 130 : 120)) + ' dB），不作脉冲作业分级。', 'ok');
    }
    $('exPeakOut').innerHTML = html;
  }

  // ---------------------------------------------------------------- 卡片 4：护听器选型

  function calcHpd() {
    var lex = pf($('exHpdLex').value);
    if (lex == null || lex <= 0) { return alert('请填写 L_EX,8h（dB(A)）'); }
    var adv = E.ppeAdvice(lex);
    var target = pf($('exHpdTarget').value), derate = pf($('exHpdDerate').value) || 0;
    if (target == null || target <= 0) { target = 80; }
    var snrReq = E.requiredSnr(lex, target, derate);

    var html =
      line('L_EX,8h = ' + num(lex, 1) + ' dB(A)：' + (adv.need
        ? '<strong>需要配备护听器</strong>——' + esc(adv.text)
        : esc(adv.text))) +
      line('若目标佩戴后有效声级 ≤ ' + num(target, 0) + ' dB(A)（现场折减 ' + num(derate, 0) + ' dB）：所需 SNR ≥ <strong>' +
        num(snrReq, 1) + ' dB</strong>' + (snrReq > 34 ? '（超过单件常规上限，应选耳塞+耳罩双防护）' : ''));
    $('exHpdAdvice').innerHTML = html;

    // NRR 折算
    var lvl = pf($('exNrrLevel').value), nrr = pf($('exNrrVal').value);
    if (lvl == null || nrr == null) { $('exNrrOut').innerHTML = ''; return; }
    var method = $('exNrrMethod').value, typeId = $('exNrrType').value, weighted = $('exNrrWeight').value;
    var eff = E.protectedNrr(lvl, nrr, typeId, method, weighted);
    if (eff == null) { $('exNrrOut').innerHTML = line('输入不完整，无法折算。', 'warn'); return; }
    var methodLabel = { osha: 'OSHA 1910.95 附录B', 'osha-otm': 'OSHA 技术手册 50% 折减', niosh: 'NIOSH 98-126 按类型折减' }[method];
    var typeLabel = (E.nrrType(typeId) || {}).label || '';
    $('exNrrOut').innerHTML =
      line('方法：' + esc(methodLabel) + (method === 'niosh' ? '（' + esc(typeLabel) + '）' : '') +
        '；输入 ' + num(lvl, 1) + ' ' + weighted + '、NRR = ' + num(nrr, 0) + ' dB') +
      line('佩戴后有效声级估计 <strong>' + num(eff, 1) + ' dB(A)</strong> → ' + tag(eff <= 85, 85 - eff) +
        (eff > 85 ? '（该护听器不足以把暴露压回 85 dB，需更高衰减或双防护）' : ''));
  }

  function calcDual() {
    var a = pf($('exDualA').value), b = pf($('exDualB').value);
    if (a == null && b == null) { return alert('请至少填写一件护听器的衰减值'); }
    var c = E.dualAttenuation(a, b);
    $('exDualOut').innerHTML =
      line('双防护组合衰减 = max(' + num(a, 0) + ', ' + num(b, 0) + ') + 5 = <strong>' + num(c, 1) + ' dB</strong>' +
        '（耳塞+耳罩同时佩戴；骨导限制使其并非两者相加）');
  }

  function calcSnr() {
    var lc = pf($('exSnrLevel').value), snr = pf($('exSnrVal').value);
    if (lc == null || snr == null) { return alert('请填写 C 计权声级与 SNR'); }
    var derate = pf($('exSnrDerate').value) || 0;
    var eff = E.protectedSnr(lc, snr, derate);
    $('exSnrOut').innerHTML =
      line('ISO 4869-2 SNR 法：L_C = ' + num(lc, 1) + ' dB、SNR = ' + num(snr, 0) + ' dB、现场折减 ' + num(derate, 0) +
        ' dB → 有效 A 声级 <strong>' + num(eff, 1) + ' dB(A)</strong> → ' + tag(eff <= 85, 85 - eff));
  }

  // ---------------------------------------------------------------- 骨架

  function buildSkeleton() {
    var root = $('view-exposure');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>职业噪声暴露量计算</h2>' +
      '<p class="hint">按分段暴露求 8 h 等效连续 A 声级 L_EX,8h，对照 GBZ 2.2-2007 限值 85 dB(A) 与 GBZ/T 229.4-2012 作业分级；' +
      '同时给出 NIOSH（3 dB）与 OSHA（5 dB）两套剂量/TWA 评价、脉冲噪声限值，以及护听器选型与 NRR/SNR 折算。</p></div>' +

      '<section class="card"><h3>① 分段暴露计算</h3>' +
      '<p class="hint">按「工种/时段」逐段填写声级与接触时长（无噪声时段不计）。L_EX,8h = 10lg[Σ(10^(L_i/10)·t_i)/8]，' +
      '与是否连续作业无关，只与总暴露能量有关。</p>' +
      '<div class="table-wrap"><table class="data-table" id="exSegTableHead"><thead><tr><th>声级 L_i (dBA)</th><th>接触时长 t_i (h)</th></tr></thead>' +
      '<tbody id="exSegBody"></tbody></table></div>' +
      '<div class="field-row">' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnCalc" class="btn primary" type="button">计算暴露量</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnEx" class="btn" type="button">载入例题</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnClear" class="btn" type="button">清空</button></div>' +
      '</div>' +
      '<div id="exSegSummary"></div>' +
      '<div id="exSegTable"></div>' +
      '<div id="exSegCriteria"></div>' +
      '<canvas id="exSegChart" height="240"></canvas>' +
      '<p class="hint">图中红线为 GBZ 85 dB、橙线为 OSHA PEL 90 dB；四个点分别为 L_EX,8h 与三种准则反算的 TWA。</p>' +
      '</section>' +

      '<section class="card"><h3>② 允许暴露时间与延长班次</h3>' +
      '<p class="hint">3 dB 交换率（NIOSH，等能量）：每升 3 dB 允许时间减半；5 dB 交换率（OSHA）：每升 5 dB 减半。' +
      '两套准则对同一现场的判定可差数分贝，国内以 GBZ 2.2 为准。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="exShift">班次时长 (h)</label><input id="exShift" class="text-input" type="number" value="8" step="0.5" min="4" max="16"></div>' +
      '<div class="field"><label for="exLevelQ">实测声级 (dBA，选填)</label><input id="exLevelQ" class="text-input" type="number" value="92" step="0.5" min="0"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnShift" class="btn primary" type="button">计算</button></div>' +
      '</div>' +
      '<div id="exAllowedOut"></div>' +
      '<div id="exShiftTable"></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>声级 (dBA)</th>' +
      '<th>NIOSH 允许时间</th><th>OSHA 允许时间</th></tr></thead><tbody>' +
      '<tr><td>85 / 90</td><td>8 h / —</td><td>— / 8 h</td></tr>' +
      '<tr><td>88 / 95</td><td>4 h / —</td><td>— / 4 h</td></tr>' +
      '<tr><td>91 / 100</td><td>2 h / —</td><td>— / 2 h</td></tr>' +
      '<tr><td>94 / 105</td><td>60 min / —</td><td>— / 60 min</td></tr>' +
      '<tr><td>97 / 110</td><td>30 min / —</td><td>— / 30 min</td></tr>' +
      '<tr><td>100 / 115</td><td>15 min / —</td><td>— / 15 min 或更短</td></tr>' +
      '</tbody></table></div>' +
      '</section>' +

      '<section class="card"><h3>③ 脉冲噪声</h3>' +
      '<p class="hint">GBZ 2.2-2007 对脉冲噪声单独规定峰值限值（与日脉冲次数相关），且 NIOSH/OSHA 均设 140 dB 峰值硬上限；' +
      'GBZ/T 229.4-2012 表2 按峰值与次数分四级。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="exPeak">声压级峰值 (dB)</label><input id="exPeak" class="text-input" type="number" value="135" step="0.5" min="0"></div>' +
      '<div class="field"><label for="exPeakN">工作日脉冲次数 n</label><input id="exPeakN" class="text-input" type="number" value="500" step="1" min="1"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnPeak" class="btn primary" type="button">判定</button></div>' +
      '</div>' +
      '<div id="exPeakOut"></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>日脉冲次数 n</th><th>峰值限值 (dB)</th></tr></thead><tbody>' +
      '<tr><td>n ≤ 100</td><td>140</td></tr>' +
      '<tr><td>100 &lt; n ≤ 1000</td><td>130</td></tr>' +
      '<tr><td>1000 &lt; n ≤ 10000</td><td>120</td></tr>' +
      '</tbody></table></div>' +
      '</section>' +

      '<section class="card"><h3>④ 护听器选型与折算</h3>' +
      '<p class="hint">《用人单位劳动防护用品管理规范》：80≤L_EX,8h&lt;85 dB 按需配备、≥85 dB 必须配备；85~95 dB 选 SNR 17~34 dB，' +
      '≥95 dB 选 SNR ≥34 dB 或双防护（组合衰减 = 较高值 +5 dB）。实验室标称衰减需折算后才能用于现场判定。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="exHpdLex">L_EX,8h (dB(A))</label><input id="exHpdLex" class="text-input" type="number" value="95" step="0.5" min="0"></div>' +
      '<div class="field"><label for="exHpdTarget">目标佩戴后声级 (dB(A))</label><input id="exHpdTarget" class="text-input" type="number" value="80" step="1" min="0"></div>' +
      '<div class="field"><label for="exHpdDerate">现场折减 (dB，HSE 惯例 4)</label><input id="exHpdDerate" class="text-input" type="number" value="4" step="1" min="0"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnHpd" class="btn primary" type="button">选型建议</button></div>' +
      '</div>' +
      '<div id="exHpdAdvice"></div>' +

      '<div class="field-row">' +
      '<div class="field"><label for="exNrrLevel">暴露级 (dBA 或 dBC)</label><input id="exNrrLevel" class="text-input" type="number" value="97" step="0.5" min="0"></div>' +
      '<div class="field"><label for="exNrrVal">护听器 NRR (dB)</label><input id="exNrrVal" class="text-input" type="number" value="29" step="1" min="0"></div>' +
      '<div class="field"><label for="exNrrType">护听器类型</label><select id="exNrrType" class="text-input"></select></div>' +
      '<div class="field"><label for="exNrrMethod">折算方法</label><select id="exNrrMethod" class="text-input"></select></div>' +
      '<div class="field"><label for="exNrrWeight">输入计权</label><select id="exNrrWeight" class="text-input"><option value="A">A 计权</option><option value="C">C 计权</option></select></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnNrr" class="btn primary" type="button">NRR 折算</button></div>' +
      '</div>' +
      '<div id="exNrrOut"></div>' +

      '<div class="field-row">' +
      '<div class="field"><label for="exSnrLevel">C 计权声级 L_C (dB)</label><input id="exSnrLevel" class="text-input" type="number" value="99" step="0.5" min="0"></div>' +
      '<div class="field"><label for="exSnrVal">护听器 SNR (dB)</label><input id="exSnrVal" class="text-input" type="number" value="28" step="1" min="0"></div>' +
      '<div class="field"><label for="exSnrDerate">现场折减 (dB)</label><input id="exSnrDerate" class="text-input" type="number" value="4" step="1" min="0"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnSnr" class="btn" type="button">SNR 法</button></div>' +
      '</div>' +
      '<div id="exSnrOut"></div>' +

      '<div class="field-row">' +
      '<div class="field"><label for="exDualA">双防护 · 耳塞衰减 (dB)</label><input id="exDualA" class="text-input" type="number" value="29" step="1" min="0"></div>' +
      '<div class="field"><label for="exDualB">双防护 · 耳罩衰减 (dB)</label><input id="exDualB" class="text-input" type="number" value="25" step="1" min="0"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="exBtnDual" class="btn" type="button">双防护估算</button></div>' +
      '</div>' +
      '<div id="exDualOut"></div>' +
      '</section>' +

      '<section class="card notes"><h3>公式依据与边界</h3><ul>' +
      '<li><strong>L_EX,8h</strong>：10lg[Σ(10^(L_i/10)·t_i)/8h]（GBZ/T 189.8-2007、ISO 9612 等能量定义）；每周不足 5 天时按 40 h 折算 L_EX,40h，限值同为 85 dB(A)（GBZ 2.2-2007）。</li>' +
      '<li><strong>剂量</strong>：D = 100·Σ(t_i/T_i)，T_i 为该级允许时间；NIOSH 3 dB 交换 T = 8·2^((85−L)/3) h，OSHA 5 dB 交换 T = 8·2^((90−L)/5) h（1910.95 Table G-16）。TWA 反算：NIOSH = 85 + 10lg(D/100)，OSHA = 90 + 16.61·lg(D/100)。</li>' +
      '<li><strong>延长班次</strong>：NIOSH REL 按 85 − 10lg(T/8) 调整（公布值 9/10/11/12 h → 84.5/84.0/83.6/83.2 dBA）；OSHA AL 按 85 − 16.61·lg(T/8) 调整（→ 84.1/83.4/82.7/82.1）；OSHA PEL 不调整。</li>' +
      '<li><strong>脉冲噪声</strong>：GBZ 2.2-2007 表10 峰值限值 140/130/120 dB（n ≤ 100 / ≤1000 / ≤10000）；GBZ/T 229.4-2012 表2 分级四档；NIOSH 98-126 与 OSHA 1910.95 均设 140 dB 峰值上限。本模块峰值按未计权峰值 dB 处理。</li>' +
      '<li><strong>NRR 折算</strong>：OSHA 附录B（A 计权：L − (NRR − 7)）；OSHA 技术手册（NRR 与 7 dB 一并折半）；NIOSH 98-126（耳罩 −25%、慢回弹泡沫耳塞 −50%、其他耳塞 −70%，7 dB C−A 补偿不折减）。C 计权输入直接用 NRR。</li>' +
      '<li><strong>SNR 法</strong>：ISO 4869-2:2018，L\'_A = L_C − SNR_x；现场折减参考 UK HSE 惯例 4 dB。国内选型按《用人单位劳动防护用品管理规范》三档与 SNR 17~34 / ≥34 dB 要求执行。</li>' +
      '<li><strong>边界</strong>：本模块供方案评估与快速判定；正式职业卫生评价按 GBZ/T 189.8 测量、GBZ 188 职业健康监护执行；护听器实际衰减受佩戴训练影响大，应以适合性检验（fit-test）为准。</li>' +
      '</ul></section>';

    $('exNrrType').innerHTML = E.NRR_TYPES.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.label) + '</option>';
    }).join('');
    $('exNrrMethod').innerHTML =
      '<option value="osha">OSHA 1910.95 附录B</option>' +
      '<option value="osha-otm">OSHA 技术手册（50% 折减）</option>' +
      '<option value="niosh">NIOSH 98-126（按类型折减）</option>';

    $('exBtnCalc').addEventListener('click', calcSegs);
    $('exBtnEx').addEventListener('click', function () { fillSegTable(E.exampleSegments()); calcSegs(); });
    $('exBtnClear').addEventListener('click', function () { fillSegTable([]); $('exSegSummary').innerHTML = ''; $('exSegTable').innerHTML = ''; $('exSegCriteria').innerHTML = ''; });
    $('exBtnShift').addEventListener('click', calcShift);
    $('exBtnPeak').addEventListener('click', calcPeak);
    $('exBtnHpd').addEventListener('click', calcHpd);
    $('exBtnNrr').addEventListener('click', calcHpd);
    $('exBtnSnr').addEventListener('click', calcSnr);
    $('exBtnDual').addEventListener('click', calcDual);

    fillSegTable(E.exampleSegments());
  }

  function init() {
    if (inited) return;
    inited = true;
    buildSkeleton();
  }

  function onShow() {
    if (state.lastSegs) { calcSegs(); }
  }

  window.ExposureView = { init: init, onShow: onShow };
})();
