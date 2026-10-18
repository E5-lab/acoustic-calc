/*
 * view-hearing.js — 听觉与听阈视图（#/hearing）
 * 依赖 window.Hearing（内核）、window.MiniChart（曲线）。
 *
 * 四个子计算器：
 *   1) ISO 226 等响曲线：phon ↔ dB SPL 双向换算 + 等响曲线族图
 *   2) ISO 7029 年龄听阈：中位数阈移表 + 年龄曲线图
 *   3) WHO 2021 听力图分级：双耳 PTA4 → 等级（附 RETSPL 零级换算）
 *   4) 临界带与掩蔽：Zwicker 临界带 + 扩散模型掩蔽阈 + 扩散曲线图
 */
(function () {
  'use strict';

  var H = window.Hearing;
  var Chart = window.MiniChart;

  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function cssVar(n, f) { return window.Util.cssVar(n, f); }

  function show(id, html, cls) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }

  function table(headers, rows, foot) {
    if (!rows.length) return '<p class="inline-note">' + (foot || '暂无数据') + '</p>';
    return '<table class="data-table"><thead><tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  /* ================= 1) ISO 226 等响曲线 ================= */

  var CONTOURS = [20, 40, 60, 80];

  function drawContour(markF, markSpl) {
    if (!Chart) return;
    var xs = H.ISO226_TABLE.map(function (r) { return r[0]; });
    var thr = H.ISO226_TABLE.map(function (r) { return r[3]; });
    var colors = ['#94a3b8', cssVar('--primary', '#2563eb'), '#f59e0b', '#ef4444'];
    var series = [{ values: thr, color: '#64748b', width: 1, dash: [5, 4] }];
    CONTOURS.forEach(function (ph, i) {
      series.push({ values: H.contour(ph).map(function (p) { return p.spl; }), color: colors[i], width: 2 });
    });
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values); });
    if (markF && markSpl != null) {
      series.push({
        values: xs.map(function (f) { return f === markF ? markSpl : null; }),
        color: '#16a34a', width: 1.5, points: true, radius: 4
      });
    }
    Chart.draw($('hrIsoChart'), {
      x: xs, xLog: true, yMin: -20, yMax: 115, yDigits: 0,
      xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(v); },
      series: series
    });
  }

  function runIso() {
    var f = pf($('hrF').value);
    var mode = $('hrMode').value;
    var v = pf($('hrVal').value);
    if (f == null || v == null) { show('hrIso', '请填写频率与数值。', 'warn'); return; }
    var r, markSpl = null;
    if (mode === 'p2s') {
      r = H.phonToSpl(f, v);
      markSpl = r ? r.spl : null;
    } else {
      r = H.splToPhon(f, v);
      markSpl = v;
    }
    if (!r) {
      show('hrIso', '频率须在 20 Hz ~ 12.5 kHz 范围内（ISO 226 表列 20~12500 Hz，非表列点按对数频率插值）。', 'warn');
      drawContour(null, null);
      return;
    }
    var rg = r.range;
    var html =
      '<b>' + (mode === 'p2s' ? esc(num(r.f, 1)) + ' Hz、' + num(r.phon, 1) + ' phon 需要 <b style="font-size:1.15em">' + num(r.spl, 2) + ' dB SPL</b>'
        : esc(num(r.f, 1)) + ' Hz、' + num(r.spl, 1) + ' dB SPL 的响度级 = <b style="font-size:1.15em">' + num(r.phon, 2) + ' phon</b>') + '</b>' +
      '<br><span class="muted">' + (r.valid ? '在 ISO 226 有效范围内。' :
        '超出有效范围（本频点 ' + rg.min + '~' + rg.max + ' phon；20 phon 以下该标准仅具参考性），数值仅供参考。') + '</span>' +
      (r.exact ? '' : '<br><span class="muted">非表列频率，参数按相邻两点对数频率插值。</span>') +
      '<br><span class="muted">同声压下低频需要更高声压级：' + num(f, 0) + ' Hz 与 1 kHz 等响时声压级相差约 ' +
      num(H.phonToSpl(f, 40).spl - H.phonToSpl(1000, 40).spl, 1) + ' dB（40 phon）。</span>';
    show('hrIso', html, r.valid ? 'ok' : 'warn');
    drawContour(f, markSpl);
  }

  /* ================= 2) ISO 7029 年龄听阈 ================= */

  var AGE_CURVES = [30, 50, 70];

  function drawAge(curAge) {
    if (!Chart) return;
    var xs = H.ISO7029_TABLE.map(function (r) { return r.f; });
    var colors = ['#94a3b8', '#f59e0b', '#ef4444'];
    var series = AGE_CURVES.map(function (a, i) {
      return {
        values: xs.map(function (f) { return H.ageShiftAt(a, f, 'male'); }),
        color: colors[i], width: 2
      };
    });
    if (curAge && curAge >= 18) {
      series.push({
        values: xs.map(function (f) { return H.ageShiftAt(curAge, f, 'male'); }),
        color: cssVar('--primary', '#2563eb'), width: 2, points: true, radius: 3
      });
    }
    Chart.draw($('hrAgeChart'), {
      x: xs, xLog: true, yMin: 0, yMax: 60, yDigits: 0,
      xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(v); },
      series: series
    });
  }

  function runAge() {
    var age = pf($('hrAge').value);
    var sex = $('hrSex').value;
    var t = H.ageShift(age, sex);
    if (!t) { show('hrAgeOut', '请填写年龄。', 'warn'); return; }
    if (t.error) {
      show('hrAgeOut', 'ISO 7029 的阈移以 18 岁为基准定义，年龄低于 18 岁不适用（儿童听阈参考听力筛查标准）。', 'warn');
      drawAge(null);
      return;
    }
    var rows = t.rows.map(function (r) {
      return [r.f >= 1000 ? (r.f / 1000) + 'k' : String(r.f),
      num(r.shift, 1), num(H.freeThreshold(r.f), 1),
      r.informative ? '' : '<span class="muted">仅参考</span>'];
    });
    var warn = t.inRange ? '' : '<br><span class="muted">注意：ISO 7029 公式适用范围为 18~80 岁，超出部分为外推。</span>';
    var hi = t.rows.filter(function (r) { return r.f === 4000; })[0];
    var lo = t.rows.filter(function (r) { return r.f === 125; })[0];
    show('hrAge',
      '<b>' + t.age + ' 岁' + (t.sex === 'female' ? '女性' : '男性') + '</b>（耳科正常人群，中位数）：' +
      '125 Hz 阈移 <b>' + num(lo.shift, 1) + ' dB</b>，4 kHz 阈移 <b>' + num(hi.shift, 1) + ' dB</b>。' +
      '<br><span class="muted">ΔH<sub>md,Y</sub> = α<sub>md</sub>·(Y−18)^β<sub>md</sub>，为相对 18 岁的中位数阈值偏移；' +
      '高频退化显著快于低频，属年龄相关听力变化（老年性聋）的统计趋势，个体差异很大。</span>' + warn +
      table(['频率 Hz', '中位数阈移 dB', '18 岁参考自由场听阈 dB SPL', '备注'], rows),
      'ok');
    drawAge(t.age);
  }

  /* ================= 3) WHO 2021 听力图分级 ================= */

  var PTA_FREQS = [500, 1000, 2000, 4000];

  function earValues(prefix) {
    var o = {};
    PTA_FREQS.forEach(function (f) { o[f] = pf($(prefix + f).value); });
    return o;
  }

  function runGrade() {
    var L = earValues('hrL'), R = earValues('hrR');
    var gb = H.gradeBoth(L, R);
    if (!gb) { show('hrGrade', '请至少填写一只耳朵的听阈（dB HL）。', 'warn'); return; }
    function earLine(ear, g, name) {
      if (!g) return '<b>' + name + '</b>：未填写。<br>';
      return '<b>' + name + '</b>：PTA4 = <b style="font-size:1.15em">' + num(g.pta, 1) + ' dB HL</b> → ' +
        '<b>' + g.grade + ' 级 · ' + g.name + '</b>（' + g.en + '）<br>' +
        '<span class="muted">安静环境：' + esc(g.quiet) + '；嘈杂环境：' + esc(g.noisy) + '。</span><br>';
    }
    var html = earLine('左', gb.left, '左耳') + earLine('右', gb.right, '右耳') +
      '<b>较好耳（' + gb.better.ear + '）分级：' + gb.better.g.grade + ' 级 · ' + gb.better.g.name + '</b>';
    if (gb.unilateral && gb.unilateralNote) html += '<br><span class="muted">' + esc(gb.unilateralNote) + '</span>';
    html += '<br><span class="muted">WHO 2021：较好耳 500 / 1k / 2k / 4k 四频算术平均（PTA4，dB HL）。' +
      '本工具为计算参考，不构成医学诊断；听力问题请到耳鼻喉科做正规纯音测听。</span>';
    show('hrGrade', html, 'ok');
  }

  function fillRetTable() {
    var rows = H.RETSPL_TDH39 ? Object.keys(H.RETSPL_TDH39).map(Number).sort(function (a, b) { return a - b; }).map(function (f) {
      return [f >= 1000 ? (f / 1000) + 'k' : String(f), num(H.RETSPL_TDH39[f], 1),
      num(H.hlToSpl(f, 0).spl, 1), num(H.hlToSpl(f, 40).spl, 1), num(H.hlToSpl(f, 70).spl, 1)];
    }) : [];
    var box = $('hrRetTable');
    if (box) box.innerHTML = table(
      ['频率 Hz', 'RETSPL dB SPL @0 dB HL', '0 dB HL 折算 dB SPL', '40 dB HL 折算', '70 dB HL 折算'], rows);
  }

  /* ================= 4) 临界带与掩蔽 ================= */

  var MASK_FREQS = [125, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];

  function drawMask(maskerF, maskerL, opts) {
    if (!Chart || maskerF == null || maskerL == null) return;
    var xs = [];
    for (var f = 60; f <= 12000; f = Math.round(f * 1.12)) xs.push(f);
    var vals = xs.map(function (f) {
      var m = H.masking(maskerF, maskerL, f, opts);
      return m ? m.threshold : null;
    });
    var cb = H.criticalBand(maskerF);
    var series = [
      { values: xs.map(function () { return maskerL; }), color: '#94a3b8', width: 1, dash: [5, 4] },
      { values: vals, color: cssVar('--primary', '#2563eb'), width: 2, points: true, radius: 2 }
    ];
    Chart.draw($('hrMaskChart'), {
      x: xs, xLog: true, yMin: 0, yMax: Math.ceil(maskerL / 10) * 10 + 5, yDigits: 0,
      xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)); },
      series: series
    });
    return cb;
  }

  function runMask() {
    var mf = pf($('hrMF').value), ml = pf($('hrML').value), tf = pf($('hrTF').value);
    var opts = { lowerSlope: pf($('hrLower').value), upperSlope: pf($('hrUpper').value) };
    if (opts.lowerSlope == null) opts.lowerSlope = -27;
    if (opts.upperSlope == null) opts.upperSlope = -20;
    if (mf == null || ml == null) { show('hrMask', '请填写掩蔽声频率与声级。', 'warn'); return; }
    var cb = drawMask(mf, ml, opts);
    var html =
      '掩蔽声 <b>' + num(mf, 0) + ' Hz @ ' + num(ml, 1) + ' dB</b>：临界带率 z = <b>' + num(cb.z, 2) + ' Bark</b>，' +
      '临界带宽 Δf ≈ <b>' + num(cb.bw, 1) + ' Hz</b>（' + num(cb.f1, 0) + ' ~ ' + num(cb.f2, 0) + ' Hz）';
    if (tf != null) {
      var m = H.masking(mf, ml, tf, opts);
      if (!m) {
        show('hrMask', html + '<br>测试频率无效。', 'warn');
        return;
      }
      html += '<br>测试音 ' + num(tf, 0) + ' Hz（z = ' + num(m.zTest, 2) + ' Bark，Δz = ' + num(m.dz, 2) + '）：' +
        (m.flat ? '位于掩蔽声临界带内，带内平顶。' : (m.dfHz < 0 ? '低于掩蔽声，按下扩散斜率扩散。' : '高于掩蔽声，按上扩散斜率扩散。')) +
        '<br>掩蔽阈 ≈ <b style="font-size:1.15em">' + num(m.threshold, 1) + ' dB</b>' +
        '<br><span class="muted">简化扩散模型：带内平顶、带外按 Bark 距离线性衰减（下 ' + opts.lowerSlope +
        ' / 上 ' + opts.upperSlope + ' dB/Bark，可调）。' +
        '低于掩蔽阈的测试音将被掩蔽；反之可闻。用于量级判断，不替代精细响度模型。</span>';
    } else {
      html += '<br><span class="muted">填入测试频率可估计掩蔽阈。</span>';
    }
    show('hrMask', html, 'ok');
  }

  /* ================= 骨架与初始化 ================= */

  function buildSkeleton() {
    var root = $('view-hearing');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>听觉与听阈</h2>' +
      '<p class="hint">听力计量侧的计算：等响曲线（ISO 226）、年龄相关听阈（ISO 7029）、听力图分级（WHO 2021）、临界带与掩蔽（Zwicker）。与「心理声学 / 声品质」模块互补——那边管响度与粗糙度，这边管听阈与听力评价。</p></div>' +

      '<section class="card"><h3>ISO 226 等响曲线</h3>' +
      '<p class="hint">人耳对 2~4 kHz 最敏感、对低频不敏感：同一 phon 数，低频需要高得多的声压级。反向换算给出「某频率纯音听起来与 1 kHz 参考一样响」所需的声压级。标准适用范围 20 Hz~12.5 kHz、20~90 phon（5 kHz 以上 20~80 phon）。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="hrF">频率 Hz</label><input id="hrF" class="text-input" type="number" value="100" min="20" max="12500" step="1"></div>' +
      '<div class="field"><label for="hrMode">换算方向</label><select id="hrMode" class="text-input">' +
      '<option value="p2s">响度级 phon → 声压级 dB SPL</option>' +
      '<option value="s2p">声压级 dB SPL → 响度级 phon</option></select></div>' +
      '<div class="field"><label for="hrVal">数值</label><input id="hrVal" class="text-input" type="number" value="60" step="0.1"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="hrBtnIso" class="btn primary" type="button">换算</button></div>' +
      '</div>' +
      '<div id="hrIso" class="result-line" hidden></div>' +
      '<canvas id="hrIsoChart" height="280"></canvas>' +
      '<p class="hint">灰色虚线为自由场听阈（ISO 389-7），彩线为 20 / 40 / 60 / 80 phon 等响曲线，绿点为当前输入。</p>' +
      '</section>' +

      '<section class="card"><h3>ISO 7029 年龄相关听阈</h3>' +
      '<p class="hint">耳科检查正常人群中，听阈随年龄的中位数退化（老年性聋趋势）：高频先退化、逐年加快。ΔH = α·(Y−18)^β，Y = 18~80 岁；3 kHz 以上且超过 70 岁的数值仅具参考性。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="hrAge">年龄 岁</label><input id="hrAge" class="text-input" type="number" value="60" min="1" max="100" step="1"></div>' +
      '<div class="field"><label for="hrSex">性别</label><select id="hrSex" class="text-input">' +
      '<option value="male">男性</option><option value="female">女性</option></select></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="hrBtnAge" class="btn primary" type="button">计算阈移</button></div>' +
      '</div>' +
      '<div id="hrAgeOut" class="result-line" hidden></div>' +
      '<canvas id="hrAgeChart" height="260"></canvas>' +
      '<p class="hint">灰 / 橙 / 红为 30 / 50 / 70 岁男性中位数阈移，蓝线为当前输入（男性口径）。</p>' +
      '</section>' +

      '<section class="card"><h3>WHO 2021 听力图分级</h3>' +
      '<p class="hint">按较好耳 500 / 1k / 2k / 4k 四频平均（PTA4）分级：&lt;20 正常｜20~&lt;35 轻度｜35~&lt;50 中度｜50~&lt;65 中重度｜65~&lt;80 重度｜80~&lt;95 极重度｜≥95 全聋。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="hrL500">左耳 500 Hz</label><input id="hrL500" class="text-input" type="number" value="15" step="5"></div>' +
      '<div class="field"><label for="hrL1000">左耳 1 kHz</label><input id="hrL1000" class="text-input" type="number" value="15" step="5"></div>' +
      '<div class="field"><label for="hrL2000">左耳 2 kHz</label><input id="hrL2000" class="text-input" type="number" value="20" step="5"></div>' +
      '<div class="field"><label for="hrL4000">左耳 4 kHz</label><input id="hrL4000" class="text-input" type="number" value="25" step="5"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="hrR500">右耳 500 Hz</label><input id="hrR500" class="text-input" type="number" value="50" step="5"></div>' +
      '<div class="field"><label for="hrR1000">右耳 1 kHz</label><input id="hrR1000" class="text-input" type="number" value="55" step="5"></div>' +
      '<div class="field"><label for="hrR2000">右耳 2 kHz</label><input id="hrR2000" class="text-input" type="number" value="60" step="5"></div>' +
      '<div class="field"><label for="hrR4000">右耳 4 kHz</label><input id="hrR4000" class="text-input" type="number" value="65" step="5"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="hrBtnGrade" class="btn primary" type="button">分级</button></div>' +
      '</div>' +
      '<div id="hrGradeOut" class="result-line" hidden></div>' +
      '<details><summary class="inline-note">听力零级换算（RETSPL，TDH-39 耳机，ISO 389 / GB/T 4854.1）</summary>' +
      '<div id="hrRetTable"></div></details>' +
      '</section>' +

      '<section class="card"><h3>临界带与掩蔽</h3>' +
      '<p class="hint">耳蜗按临界带分析声音：带内能量合并、带间才有频率分辨。掩蔽声对带内测试音平顶掩蔽，带外按 Bark 距离衰减（下扩散陡、上扩散缓）。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="hrMF">掩蔽声频率 Hz</label><input id="hrMF" class="text-input" type="number" value="1000" min="20" step="1"></div>' +
      '<div class="field"><label for="hrML">掩蔽声级 dB</label><input id="hrML" class="text-input" type="number" value="80" step="1"></div>' +
      '<div class="field"><label for="hrTF">测试音频率 Hz</label><input id="hrTF" class="text-input" type="number" value="300" step="1"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="hrLower">下扩散斜率 dB/Bark</label><input id="hrLower" class="text-input" type="number" value="-27" step="1"></div>' +
      '<div class="field"><label for="hrUpper">上扩散斜率 dB/Bark</label><input id="hrUpper" class="text-input" type="number" value="-20" step="1"></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="hrBtnMask" class="btn primary" type="button">计算掩蔽阈</button></div>' +
      '</div>' +
      '<div id="hrMaskOut" class="result-line" hidden></div>' +
      '<canvas id="hrMaskChart" height="260"></canvas>' +
      '<p class="hint">灰虚线为掩蔽声级，蓝线为掩蔽阈扩散曲线；曲线以下频率成分被掩蔽。</p>' +
      '</section>' +

      '<section class="card notes"><h3>标准依据与边界</h3><ul>' +
      '<li><strong>ISO 226:2003</strong>：自由场测听条件下的正常等响级曲线，解析式 L<sub>N</sub> = (100/3)·lg[…]，参数表见内核 <code>ISO226_TABLE</code>；T<sub>f</sub> 列即 ISO 389-7 自由场听阈。</li>' +
      '<li><strong>ISO 7029:2017</strong>：ΔH<sub>md,Y</sub> = α<sub>md</sub>·(Y−18)^β<sub>md</sub>（中位数，男女分列）；人群经耳科筛查，不含噪声暴露与耳毒性药物史，是「纯年龄」基线。</li>' +
      '<li><strong>WHO 2021</strong>（World Report on Hearing）：较好耳 PTA4 分级；单侧损失（较好耳 &lt;20 且较差耳 ≥35）单独标注。</li>' +
      '<li><strong>Zwicker 临界带</strong>：z = 13·atan(0.00076f) + 3.5·atan((f/7500)²)，Δf = 25 + 75·(1 + 1.4(f/1000)²)^0.69；ERB（Moore）作对照。</li>' +
      '<li><strong>掩蔽模型</strong>为教学用简化扩散模型（带内平顶 + 线性斜率，可调），不替代 GB/T 3769 等精细测量与建模。</li>' +
      '</ul></section>';
  }

  function bind() {
    var b1 = $('hrBtnIso'); if (b1) b1.addEventListener('click', runIso);
    var b2 = $('hrBtnAge'); if (b2) b2.addEventListener('click', runAge);
    var b3 = $('hrBtnGrade'); if (b3) b3.addEventListener('click', runGrade);
    var b4 = $('hrBtnMask'); if (b4) b4.addEventListener('click', runMask);
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    fillRetTable();
    runIso();
    runAge();
    runGrade();
    runMask();
    inited = true;
  }

  function onShow() {
    if (inited) { runIso(); runAge(); runGrade(); runMask(); }
  }

  window.HearingView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
