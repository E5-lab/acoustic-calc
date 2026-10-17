/*
 * view-leakage.js — 孔洞缝隙漏声与门窗隔声估算视图（#/leakage）
 * 依赖：window.Leakage（内核）、window.MiniChart（绘图）
 *
 * 五张卡片（DOM 由本视图自建，index.html 仅留空容器）：
 *   1) 孔洞缝隙漏声：小孔声质量模型 + 面积加权组合隔声曲线 + 缝隙 ΔR 速算
 *   2) 组合构件：墙+门+窗+孔洞面积加权、透射能占比与薄弱环节分析
 *   3) 门窗构件估算：单层/中空/夹层玻璃、轻质单板、双层板（含 f₀）
 *   4) 常用门窗传声损失曲线数据表：单玻/中空/夹层/中空夹胶/整窗合成曲线，
 *      Rw 锚点取自公开实测统计，可一键加入组合构件计算
 *   5) 标准限值速查：GB 50118-2010 + GB 55038-2025
 */
(function () {
  'use strict';

  var E = window.Leakage, Chart = window.MiniChart;
  var state = {
    holeKind: 'circle', wallMode: 'mass', winType: 'single-glass',
    req1: 'dwell-entry-door', req2: 'dwell-entry-door', req3: 'dwell-entry-door',
    lastHole: null, lastGlz: null
  };
  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fLabel(f) { return f >= 1000 ? (f / 1000) + 'k' : String(f); }
  function tag(pass, margin) {
    return pass
      ? '<span class="mc-tag live">达标 +' + num(margin, 1) + ' dB</span>'
      : '<span class="mc-tag" style="color:var(--warn);background:var(--warn-soft);border-color:color-mix(in srgb, var(--warn) 35%, transparent)">未达标 ' + num(margin, 1) + ' dB</span>';
  }
  function line(html, cls) {
    return '<div class="result-line' + (cls ? ' ' + cls : '') + '">' + html + '</div>';
  }

  var DEFAULT_PARTS = [
    '# 每行「名称 面积(m²) 隔声量(dB)」，空格/逗号/制表符分隔',
    '砖墙 15 52',
    '户门 2 25',
    '外窗 3 28',
    '穿墙孔洞 0.2 0'
  ].join('\n');

  // ---------------------------------------------------------------- 卡片 1

  function wallR0Fn() {
    if (state.wallMode === 'mass') {
      var m = pf($('lkMass').value);
      if (m == null || m <= 0) return null;
      return function (f) { return E.massLaw(m, f); };
    }
    var r = pf($('lkFlat').value);
    if (r == null) return null;
    return function () { return r; };
  }

  function holeInput() {
    var kind = $('lkHoleKind').value;
    var depth = pf($('lkDepth').value);
    if (depth == null || depth < 0) return null;
    if (kind === 'slit') {
      var w = pf($('lkSlitW').value), len = pf($('lkSlitL').value);
      if (w == null || w <= 0 || len == null || len <= 0) return null;
      return { kind: 'slit', wMm: w, lengthM: len, tl: function (f) { return E.apertureTl(w, depth, f); } };
    }
    var d = pf($('lkDia').value), n = pf($('lkN').value);
    if (d == null || d <= 0 || n == null || n <= 0) return null;
    return { kind: kind, dMm: d, n: n, tl: function (f) { return E.apertureTl(d, depth, f); } };
  }

  function calcHole() {
    var Sc = pf($('lkArea').value);
    var wallR0 = wallR0Fn();
    var hole = holeInput();
    if (Sc == null || Sc <= 0) return alert('请填写构件总面积（m²）');
    if (!wallR0) return alert(state.wallMode === 'mass' ? '请填写有效的面密度（kg/m²）' : '请填写中频隔声量（dB）');
    if (!hole) return alert('请填写完整的孔口尺寸（孔径/缝宽、板厚、孔数/缝长）');

    var area = E.apertureArea(hole);
    if (area == null || area <= 0) return alert('孔口面积计算结果异常，请检查输入');
    var res = E.apertureCombination({ areaTotal: Sc, holeArea: area, wallR0: wallR0, holeTl: hole.tl });
    if (!res.ok) return alert(res.error);
    state.lastHole = res;

    var ratio = area / Sc * 100;
    var rw = E.rwEstimate(res.combR, res.bands);
    var rows = res.bands.map(function (f, i) {
      return '<tr><td>' + fLabel(f) + '</td><td>' + num(res.wallR[i], 1) + '</td><td>' +
        num(res.holeTl[i], 2) + '</td><td><strong>' + num(res.combR[i], 1) + '</strong></td></tr>';
    }).join('');
    $('lkHoleTable').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>频带</th><th>原墙 R₀ (dB)</th>' +
      '<th>孔口 TL (dB)</th><th>组合隔声 R (dB)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    var gap = E.gapDeltaR(pf($('lkGapR0').value), pf($('lkGapS0').value), Sc);
    var gapHtml = '';
    if (gap.ok) {
      var seal = gap.deltaR < 3 ? '密封良好' : (gap.deltaR < 6 ? '密封一般，建议加装密封条' : '密封差，漏声严重，必须处理');
      gapHtml = line('缝隙速算（式 7.4.5）：面积比 ' + num(gap.ratio * 100, 3) + '% → 隔声量损失 ΔR = <strong>' +
        num(gap.deltaR, 1) + ' dB</strong>，实际隔声量 ≈ ' + num(gap.actualR, 1) + ' dB（' + esc(seal) + '）',
        gap.deltaR < 3 ? 'ok' : 'warn');
    }
    $('lkGapOut').innerHTML = gapHtml;

    var ck = E.checkLimit(state.req1, rw, pf($('lkCorr1').value) || 0);
    $('lkHoleSummary').innerHTML =
      line('孔口总面积 <strong>' + num(area * 1e6, 1) + ' mm²</strong>（占构件 ' + num(ratio, 3) +
        '%），隔声天花板 R_cap = 10lg(S_c/S_hole) = <strong>' + num(res.capR, 1) + ' dB</strong>——孔洞不封堵，组合隔声量再高也超不过此值') +
      (ck.ok
        ? line('Rw 估算（500/1k/2k 平均）= <strong>' + num(rw, 1) + ' dB</strong>，' + ck.corrLabel + ' 修正后 ' +
          num(ck.value, 1) + ' dB vs 「' + esc(ck.limit.name) + '」限值 ' + ck.target + ' dB → ' + tag(ck.pass, ck.margin),
          ck.pass ? 'ok' : 'warn')
        : '');

    drawHole(res);
    syncHoleFields();
  }

  function drawHole(res) {
    Chart.draw($('lkHoleChart'), {
      x: res.bands, xLog: true, yMin: 0, yTicks: 6, yDigits: 0,
      hBands: [{ from: res.capR, to: res.capR, color: 'rgba(239,68,68,0.12)' }],
      series: [
        { values: res.wallR, color: '#94a3b8', width: 1.5, dash: [4, 3], points: false },
        { values: res.combR, color: '#2563eb', width: 2, points: true, radius: 3 }
      ]
    });
  }

  function syncHoleFields() {
    var kind = $('lkHoleKind').value;
    $('lkRowCircle').style.display = kind === 'slit' ? 'none' : '';
    $('lkRowSlit').style.display = kind === 'slit' ? '' : 'none';
    $('lkRowMass').style.display = state.wallMode === 'mass' ? '' : 'none';
    $('lkRowFlat').style.display = state.wallMode === 'mass' ? 'none' : '';
  }

  // ---------------------------------------------------------------- 卡片 2

  function calcParts() {
    var parts = E.parseParts($('lkParts').value);
    if (!parts.length) return alert('未解析到有效数据行（格式：名称 面积 隔声量）');
    var res = E.combine(parts);
    if (!res.ok) return alert(res.error);

    var rows = res.parts.map(function (p) {
      var pct = p.share * 100;
      var w = Math.max(1.5, Math.min(100, pct));
      return '<tr><td>' + esc(p.name) + '</td><td>' + num(p.area, 2) + '</td><td>' + num(p.R, 1) + '</td>' +
        '<td>' + num(pct, 2) + '%</td><td><span class="share-bar" style="width:' + w + '%"></span></td></tr>';
    }).join('');
    $('lkPartsTable').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>构件</th><th>面积 (m²)</th>' +
      '<th>隔声量 (dB)</th><th>透射能占比</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    var ck = E.checkLimit(state.req2, res.R, pf($('lkCorr2').value) || 0);
    $('lkPartsSummary').innerHTML =
      line('组合总面积 <strong>' + num(res.area, 2) + ' m²</strong>，组合隔声量 <strong>' + num(res.R, 1) +
        ' dB</strong>；最薄弱环节为「' + esc(res.weakest.name) + '」（透射能占 ' + num(res.weakest.share * 100, 1) + '%）') +
      (ck.ok
        ? line(ck.corrLabel + ' 修正后 ' + num(ck.value, 1) + ' dB vs 「' + esc(ck.limit.name) + '」限值 ' + ck.target +
          ' dB → ' + tag(ck.pass, ck.margin) + '（提升最薄弱环节收益最大）', ck.pass ? 'ok' : 'warn')
        : '');
  }

  // ---------------------------------------------------------------- 卡片 3

  function syncWinFields() {
    var t = $('lkWinType').value;
    ['lkRowW1', 'lkRowW2', 'lkRowW3', 'lkRowW4', 'lkRowW5'].forEach(function (id) { $(id).style.display = 'none'; });
    if (t === 'single-glass') $('lkRowW1').style.display = '';
    else if (t === 'igu') $('lkRowW2').style.display = '';
    else if (t === 'laminated') $('lkRowW3').style.display = '';
    else if (t === 'single-panel') $('lkRowW4').style.display = '';
    else $('lkRowW5').style.display = '';
  }

  function calcWin() {
    var t = $('lkWinType').value, out = '', extra = '', rVal = null;
    if (t === 'single-glass' || t === 'single-panel') {
      var m = pf($(t === 'single-glass' ? 'lkWM' : 'lkWM4').value);
      if (m == null || m <= 0) return alert('请填写面密度（kg/m²；玻璃 ≈ 2.5 × 厚度 mm）');
      rVal = E.glassSingle(m);
      out = '单层构件估算 R = 13.5·lg m + 13 = <strong>' + num(rVal, 1) + ' dB</strong>';
      if (t === 'single-panel') extra = '轻质单板经验式；重质墙体（m > 200 kg/m²）请改用质量定律 20lg(m·f) − 48。';
    } else if (t === 'igu') {
      var m1 = pf($('lkWM1').value), m2 = pf($('lkWM2').value), d = pf($('lkWCav').value) || 0;
      if (m1 == null || m2 == null || m1 <= 0 || m2 <= 0) return alert('请填写两层玻璃面密度');
      var igu = E.glassIgu(m1, m2, d);
      rVal = igu.R;
      out = '中空构件估算 R = 13.5·lg(m₁+m₂) + 13 + ΔR_air = <strong>' + num(igu.R, 1) + ' dB</strong>（空气层附加 ' + num(igu.bonus, 1) + ' dB）';
      if (d > 100) extra = '空腔 > 100 mm 时附加量经验放缓，估算偏保守；实际以检测报告为准。';
    } else if (t === 'laminated') {
      var m3 = pf($('lkWM3').value), pvb = pf($('lkWPvb').value) || 0;
      if (m3 == null || m3 <= 0) return alert('请填写夹层玻璃总面密度');
      var lam = E.glassLaminated(m3, pvb);
      rVal = lam.R;
      out = '夹层构件估算 R = 13.5·lg m + 13 + ΔR_pvb = <strong>' + num(lam.R, 1) + ' dB</strong>（PVB 膜附加 ' + num(lam.bonus, 1) + ' dB）';
    } else {
      var a = pf($('lkDM1').value), b = pf($('lkDM2').value), dd = pf($('lkDCav').value);
      var kind = $('lkDKind').value, fill = $('lkDFill').checked;
      if (a == null || b == null || a <= 0 || b <= 0 || dd == null || dd <= 0) return alert('请填写两层板面密度与空腔厚度');
      var dl = E.doubleLeaf({ m1: a, m2: b, dMm: dd, kind: kind, fill: fill });
      if (!dl.ok) return alert(dl.error);
      rVal = dl.R;
      out = '双层构件估算 R = <strong>' + num(dl.R, 1) + ' dB</strong>（轻质基值 ' + num(dl.baseR, 1) +
        ' + 空腔附加 ' + num(dl.airBonus, 1) + (fill ? ' + 填棉 ' + num(dl.fillBonus, 1) : '') + '）';
      extra = '质量-空气-质量共振频率 f₀ = <strong>' + num(dl.f0, 1) + ' Hz</strong>。低于 f₀ 两层耦合、隔声量只相当于总面密度的单层；高于 f₀ 空腔才起作用。' +
        (dl.note ? ' ⚠ ' + esc(dl.note) : '');
    }
    var ck = E.checkLimit(state.req3, rVal, 0);
    $('lkWinSummary').innerHTML = line(out) + (extra ? line(extra) : '') +
      (ck.ok
        ? line('对照「' + esc(ck.limit.name) + '」限值 ' + ck.target + ' dB（' + ck.corrLabel + '）→ ' + tag(ck.pass, ck.margin) +
          '；精确 Rw 与频谱修正量请在「墙体隔声量」模块按频谱拟合', ck.pass ? 'ok' : 'warn')
        : '');
  }

  // ---------------------------------------------------------------- 卡片 4：常用门窗 TL 曲线数据表

  function calcGlz() {
    var e = E.glazingById($('lkGlzSel').value);
    if (!e) return;
    var c = E.glazingCurve(e);
    if (!c.ok) { $('lkGlzSummary').innerHTML = line('计算失败：' + esc(c.error), 'warn'); return; }
    state.lastGlz = c;
    var dev = c.rw - e.rwRef;
    $('lkGlzSummary').innerHTML =
      line('<strong>' + esc(e.name) + '</strong>（' + esc(e.group) + '）：Rw 估算 <strong>' + num(c.rw, 1) +
        ' dB</strong> vs 实测统计锚点 ' + num(e.rwRef, 0) + ' dB（偏差 ' + (dev >= 0 ? '+' : '') + num(dev, 1) +
        '；统计离散 ±2~3 dB）' + (c.fr ? '；质量-空气-质量共振 f_r ≈ ' + num(c.fr, 0) + ' Hz' : '') +
        '；吻合频率 f_c ≈ ' + c.fcs.map(function (fc) { return num(fc, 0); }).join(' / ') + ' Hz') +
      line(esc(e.note || ''));
    var rows = c.bands.map(function (f, i) {
      return '<tr><td>' + fLabel(f) + '</td><td>' + num(c.R[i], 1) + '</td><td>' +
        (c.penalty[i] > 0 ? '−' + c.penalty[i] : '—') + '</td></tr>';
    }).join('');
    $('lkGlzTable').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>频带 (Hz)</th>' +
      '<th>传声损失 R (dB)</th><th>整窗扣减 (dB)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    drawGlz(c);
  }

  function drawGlz(c) {
    Chart.draw($('lkGlzChart'), {
      x: c.bands, xLog: true, yMin: 0, yTicks: 6, yDigits: 0,
      series: [
        { values: c.R, color: '#2563eb', width: 2, points: true, radius: 3 },
        { values: c.bands.map(function () { return c.rw; }), color: '#94a3b8', width: 1.5, dash: [4, 3], points: false }
      ]
    });
  }

  function addGlzToParts() {
    var e = E.glazingById($('lkGlzSel').value);
    if (!e) return;
    var c = E.glazingCurve(e);
    if (!c.ok) return;
    var ta = $('lkParts');
    var name = e.name.replace(/[\s,;]+/g, '');     // 组合构件解析以空白分隔，名称去空格
    ta.value = String(ta.value || '').replace(/\s+$/, '') + '\n' + name + ' 3.0 ' + num(c.rw, 1);
    calcParts();
  }

  // ---------------------------------------------------------------- 卡片 5

  function fillLimits() {
    var groups = [], html = '';
    E.LIMITS.forEach(function (r) { if (groups.indexOf(r.group) < 0) groups.push(r.group); });
    groups.forEach(function (g) {
      html += '<tr class="group-row"><td colspan="4">' + esc(g) + '</td></tr>';
      E.LIMITS.filter(function (r) { return r.group === g; }).forEach(function (r) {
        html += '<tr><td>' + esc(r.name) + '</td><td>' + r.corr + '</td><td>≥ ' + r.limit + '</td><td>' +
          (r.high != null ? '≥ ' + r.high : '—') + '</td></tr>';
      });
    });
    $('lkLimitsTable').innerHTML =
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>构件</th><th>频谱修正</th>' +
      '<th>低限 (dB)</th><th>高要求 (dB)</th></tr></thead><tbody>' + html + '</tbody></table></div>';
  }

  function reqOptions(sel) {
    var groups = [], html = '';
    E.LIMITS.forEach(function (r) { if (groups.indexOf(r.group) < 0) groups.push(r.group); });
    groups.forEach(function (g) {
      html += '<optgroup label="' + esc(g) + '">';
      E.LIMITS.filter(function (r) { return r.group === g; }).forEach(function (r) {
        html += '<option value="' + r.id + '"' + (r.id === sel ? ' selected' : '') + '>' + esc(r.name) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  // ---------------------------------------------------------------- 骨架

  function buildSkeleton() {
    var root = $('view-leakage');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>孔洞缝隙与门窗隔声</h2>' +
      '<p class="hint">隔声是「最短板」决定的事：一面 50 dB 的墙，1% 面积的孔洞就能把组合隔声量压到 20 dB 量级。本模块量化孔洞/缝隙漏声、组合构件面积加权、门窗构件估算，并对照 GB 50118-2010 与 GB 55038-2025 限值。</p></div>' +

      '<section class="card"><h3>孔洞 / 缝隙漏声</h3>' +
      '<p class="hint">孔口按「声质量模型」计算逐频带透射损失 TL = 10lg[1 + (k·L)²/4]，L = 板厚 + 0.849×孔径（两端端修正）；再与原墙按面积加权求组合隔声量。低频孔洞近乎全透射，组合隔声量存在与频率几乎无关的「天花板」10lg(S_c/S_hole)。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="lkArea">构件总面积 S_c (m²)</label><input id="lkArea" class="text-input" type="number" value="20" step="0.1" min="0"></div>' +
      '<div class="field"><label for="lkWallMode">墙体隔声量来源</label><select id="lkWallMode" class="text-input"></select></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowMass">' +
      '<div class="field"><label for="lkMass">墙面密度 m (kg/m²)</label><input id="lkMass" class="text-input" type="number" value="480" step="1" min="0"></div>' +
      '<div class="field"><label>&nbsp;</label><span class="hint">质量定律 R₀ = 20lg(m·f) − 48，逐频带计算</span></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowFlat">' +
      '<div class="field"><label for="lkFlat">中频隔声量 R₀ (dB，各频带取同值)</label><input id="lkFlat" class="text-input" type="number" value="45" step="1"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="lkHoleKind">孔口类型</label><select id="lkHoleKind" class="text-input"></select></div>' +
      '<div class="field"><label for="lkDepth">板厚 / 缝深 (mm)</label><input id="lkDepth" class="text-input" type="number" value="10" step="1" min="0"></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowCircle">' +
      '<div class="field"><label for="lkDia">孔径 / 边长 (mm)</label><input id="lkDia" class="text-input" type="number" value="10" step="0.5" min="0"></div>' +
      '<div class="field"><label for="lkN">孔数 (个)</label><input id="lkN" class="text-input" type="number" value="200" step="1" min="0"></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowSlit">' +
      '<div class="field"><label for="lkSlitW">缝宽 (mm)</label><input id="lkSlitW" class="text-input" type="number" value="1" step="0.1" min="0"></div>' +
      '<div class="field"><label for="lkSlitL">缝总长 (m)</label><input id="lkSlitL" class="text-input" type="number" value="6" step="0.5" min="0"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="lkBtnHole" class="btn primary" type="button">计算漏声</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="lkBtnHoleEx" class="btn" type="button">载入例题</button></div>' +
      '</div>' +
      '<div id="lkHoleSummary"></div>' +
      '<div id="lkHoleTable"></div>' +
      '<canvas id="lkHoleChart" height="260"></canvas>' +
      '<p class="hint">灰虚线为原墙隔声量，蓝线为含孔洞的组合隔声量，红带为隔声天花板 R_cap。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="lkGapR0">缝隙速算 · 原构件隔声量 R₀ (dB)</label><input id="lkGapR0" class="text-input" type="number" value="52" step="1"></div>' +
      '<div class="field"><label for="lkGapS0">缝隙面积 S₀ (m²)</label><input id="lkGapS0" class="text-input" type="number" value="0.2" step="0.01" min="0"></div>' +
      '<div class="field"><label for="lkCorr1">频谱修正 C / Ctr (dB)</label><input id="lkCorr1" class="text-input" type="number" value="-1" step="0.5"></div>' +
      '<div class="field"><label for="lkReq1">对照限值</label><select id="lkReq1" class="text-input"></select></div>' +
      '</div>' +
      '<div id="lkGapOut"></div>' +
      '</section>' +

      '<section class="card"><h3>组合构件隔声（墙 + 门 + 窗 + 孔洞）</h3>' +
      '<p class="hint">按透射面积加权能量平均：τ_total = Σ(S_i·τ_i)/ΣS_i，R = 10lg(1/τ_total)。透射能占比直接指出该修哪里——通常门、窗与孔洞就是那 90% 的透声来源。</p>' +
      '<textarea id="lkParts" class="text-input" rows="6" spellcheck="false"></textarea>' +
      '<div class="field-row">' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="lkBtnParts" class="btn primary" type="button">计算组合隔声</button></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="lkBtnPartsEx" class="btn" type="button">载入例题</button></div>' +
      '<div class="field"><label for="lkReq2">对照限值</label><select id="lkReq2" class="text-input"></select></div>' +
      '<div class="field"><label for="lkCorr2">频谱修正 C / Ctr (dB)</label><input id="lkCorr2" class="text-input" type="number" value="-1" step="0.5"></div>' +
      '</div>' +
      '<div id="lkPartsSummary"></div>' +
      '<div id="lkPartsTable"></div>' +
      '</section>' +

      '<section class="card"><h3>门窗构件估算</h3>' +
      '<p class="hint">单层玻璃与轻质板用经验式 R = 13.5·lg m + 13；中空构件加空气层附加 ΔR_air ≈ 0.1·d(mm)（d ≤ 100 mm）；夹层加 PVB 膜附加（0.38/0.76/1.14/1.52 mm → +4/5.5/6/7 dB）；双层板先算质量-空气-质量共振频率 f₀ = 60·√[(m₁+m₂)/(m₁m₂d)]，低于 f₀ 两层耦合不构成双层隔声。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="lkWinType">构件类型</label><select id="lkWinType" class="text-input"></select></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowW1">' +
      '<div class="field"><label for="lkWM">玻璃面密度 m (kg/m²，≈2.5×厚度 mm)</label><input id="lkWM" class="text-input" type="number" value="15" step="0.5" min="0"></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowW2">' +
      '<div class="field"><label for="lkWM1">外侧玻璃 m₁ (kg/m²)</label><input id="lkWM1" class="text-input" type="number" value="15" step="0.5" min="0"></div>' +
      '<div class="field"><label for="lkWM2">内侧玻璃 m₂ (kg/m²)</label><input id="lkWM2" class="text-input" type="number" value="15" step="0.5" min="0"></div>' +
      '<div class="field"><label for="lkWCav">空气层厚度 (mm)</label><input id="lkWCav" class="text-input" type="number" value="12" step="1" min="0"></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowW3">' +
      '<div class="field"><label for="lkWM3">夹层玻璃总面密度 (kg/m²)</label><input id="lkWM3" class="text-input" type="number" value="15.2" step="0.5" min="0"></div>' +
      '<div class="field"><label for="lkWPvb">PVB 膜厚 (mm)</label><input id="lkWPvb" class="text-input" type="number" value="0.76" step="0.38" min="0"></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowW4">' +
      '<div class="field"><label for="lkWM4">门芯板面密度 (kg/m²)</label><input id="lkWM4" class="text-input" type="number" value="25" step="1" min="0"></div>' +
      '</div>' +
      '<div class="field-row" id="lkRowW5">' +
      '<div class="field"><label for="lkDM1">板 1 面密度 (kg/m²)</label><input id="lkDM1" class="text-input" type="number" value="9.8" step="0.5" min="0"></div>' +
      '<div class="field"><label for="lkDM2">板 2 面密度 (kg/m²)</label><input id="lkDM2" class="text-input" type="number" value="9.8" step="0.5" min="0"></div>' +
      '<div class="field"><label for="lkDCav">空腔厚度 (mm)</label><input id="lkDCav" class="text-input" type="number" value="75" step="5" min="0"></div>' +
      '<div class="field"><label for="lkDKind">板材类型</label><select id="lkDKind" class="text-input"></select></div>' +
      '<div class="field"><label for="lkDFill">空腔填吸声棉</label><input id="lkDFill" class="text-input" type="checkbox" style="width:auto"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="lkBtnWin" class="btn primary" type="button">估算隔声量</button></div>' +
      '<div class="field"><label for="lkReq3">对照限值</label><select id="lkReq3" class="text-input"></select></div>' +
      '</div>' +
      '<div id="lkWinSummary"></div>' +
      '</section>' +

      '<section class="card"><h3>常用门窗传声损失曲线（数据表）</h3>' +
      '<p class="hint">合成模型估算曲线：场入射质量定律 R = 20lg(m·f) − 50 叠加玻璃吻合谷（f_c ≈ 12800/t mm）；中空加质量-空气-质量共振谷（f_r = 60√[(m₁+m₂)/(m₁m₂d)]）与空气层附加 0.1·d(mm)；夹层 PVB 阻尼使吻合谷减半；整窗按开启方式扣减框/密封/安装损失（推拉 > 平开 > 固定，高频偏重）。Rw 锚点取自公开实测统计（离散 ±2~3 dB），供选型比选；正式设计以实验室检测报告为准。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label for="lkGlzSel">常用配置</label><select id="lkGlzSel" class="text-input"></select></div>' +
      '<div class="field field-auto"><label>&nbsp;</label><button id="lkBtnGlzAdd" class="btn" type="button">加入组合构件计算</button></div>' +
      '</div>' +
      '<div id="lkGlzSummary"></div>' +
      '<div id="lkGlzTable"></div>' +
      '<canvas id="lkGlzChart" height="260"></canvas>' +
      '</section>' +

      '<section class="card notes"><h3>标准限值速查</h3>' +
      '<div id="lkLimitsTable"></div>' +
      '<p class="hint">GB 50118-2010《民用建筑隔声设计规范》表 4.2.5/4.2.6 等；GB 55038-2025《住宅项目规范》将卧室之间空气声隔声提高到 50 dB、其他分户构件 48 dB。C 为粉红噪声频谱修正量、Ctr 为交通噪声频谱修正量；本表为低限与高要求两档，评价量与修正量之和达标方可。</p>' +
      '</section>' +

      '<section class="card notes"><h3>公式依据与边界</h3><ul>' +
      '<li><strong>孔口透射</strong>：τ = 4/[4 + (k·L)²]，L = 板厚 + (8/3π)·d（两端活塞端修正，穿孔板声学理论）。音频频段内小孔 TL 仅数 dB，与面积比共同决定组合隔声量；极窄缝（< 0.2 mm）另有粘性阻尼，本模型未计。</li>' +
      '<li><strong>缝隙速算</strong>：ΔR = 10lg[(1 + (S₀/S_c)·10^(0.1·R₀)) / (1 + S₀/S_c)]（GB 50118 配套报告书式 7.4.5，缝隙按全透射近似）；与面积加权组合法相差 < 0.1 dB（1% 量级缝隙）。</li>' +
      '<li><strong>组合构件</strong>：τ_total = Σ(S_i·τ_i)/ΣS_i；各构件隔声量应为同频带量值，本工具按单值评价量处理。</li>' +
      '<li><strong>构件估算</strong>：质量定律 R = 20lg(m·f) − 48（本站隔声模块同一约定）；玻璃/轻质单板 R = 13.5·lg m + 13；中空 ΔR_air ≈ 0.1·d(mm)；PVB 夹层 +4~7 dB；双层 f₀ = 60·√[(m₁+m₂)/(m₁m₂d)]，附加隔声量按纸面石膏板/加气混凝土经验表插值，填棉约 +5 dB。均为中频平均估算值，不含吻合谷与安装侧向传声。</li>' +
      '<li><strong>密封是前提</strong>：装配式门窗口缝常为 0.5~1 cm；密封条、背胶密封胶带与注浆封堵的成本远低于换窗，收益却常常最大。所有估算值供方案比选，正式验收以 GB/T 19889 现场检测为准。</li>' +
      '</ul></section>';

    $('lkWallMode').innerHTML =
      '<option value="mass">按面密度估算（质量定律）</option>' +
      '<option value="flat">直接填中频隔声量</option>';
    $('lkHoleKind').innerHTML =
      '<option value="circle">圆孔（螺栓孔 / 穿管孔）</option>' +
      '<option value="square">方孔（插座盒 / 线盒）</option>' +
      '<option value="slit">通长缝（门缝 / 窗缝 / 板缝）</option>';
    $('lkWinType').innerHTML =
      '<option value="single-glass">单层玻璃</option>' +
      '<option value="igu">中空玻璃</option>' +
      '<option value="laminated">夹层玻璃（PVB）</option>' +
      '<option value="single-panel">轻质单板（门芯板等）</option>' +
      '<option value="double-leaf">双层板（双层墙 / 双层门）</option>';
    $('lkDKind').innerHTML =
      '<option value="gypsum">纸面石膏板类</option>' +
      '<option value="concrete">加气混凝土类</option>' +
      '<option value="glass">玻璃类（0.1·d）</option>';
    ['lkReq1', 'lkReq2', 'lkReq3'].forEach(function (id) { $(id).innerHTML = reqOptions(state.req1); });

    $('lkBtnHole').addEventListener('click', calcHole);
    $('lkBtnHoleEx').addEventListener('click', function () {
      $('lkArea').value = 20; $('lkWallMode').value = 'mass'; $('lkMass').value = 480;
      $('lkHoleKind').value = 'circle'; $('lkDia').value = 10; $('lkN').value = 200; $('lkDepth').value = 10;
      $('lkGapR0').value = 52; $('lkGapS0').value = 0.2;
      state.wallMode = 'mass';
      syncHoleFields(); calcHole();
    });
    $('lkWallMode').addEventListener('change', function () { state.wallMode = $('lkWallMode').value; syncHoleFields(); });
    $('lkHoleKind').addEventListener('change', function () { state.holeKind = $('lkHoleKind').value; syncHoleFields(); });

    $('lkParts').value = DEFAULT_PARTS;
    $('lkBtnParts').addEventListener('click', calcParts);
    $('lkBtnPartsEx').addEventListener('click', function () { $('lkParts').value = DEFAULT_PARTS; calcParts(); });
    $('lkReq2').addEventListener('change', function () { state.req2 = $('lkReq2').value; calcParts(); });
    $('lkReq1').addEventListener('change', function () { state.req1 = $('lkReq1').value; if (state.lastHole) calcHole(); });

    $('lkBtnWin').addEventListener('click', calcWin);
    $('lkWinType').addEventListener('change', function () { state.winType = $('lkWinType').value; syncWinFields(); });
    $('lkReq3').addEventListener('change', function () { state.req3 = $('lkReq3').value; });

    var glzGroups = [];
    E.GLAZING.forEach(function (e) { if (glzGroups.indexOf(e.group) < 0) glzGroups.push(e.group); });
    var glzHtml = '';
    glzGroups.forEach(function (g) {
      glzHtml += '<optgroup label="' + esc(g) + '">';
      E.GLAZING.filter(function (e) { return e.group === g; }).forEach(function (e) {
        glzHtml += '<option value="' + e.id + '">' + esc(e.name) + '（Rw ≈ ' + e.rwRef + '）</option>';
      });
      glzHtml += '</optgroup>';
    });
    $('lkGlzSel').innerHTML = glzHtml;
    $('lkGlzSel').addEventListener('change', calcGlz);
    $('lkBtnGlzAdd').addEventListener('click', addGlzToParts);

    fillLimits();
    syncHoleFields();
    syncWinFields();
  }

  function init() {
    if (inited) return;
    inited = true;
    buildSkeleton();
  }

  function onShow() {
    if (state.lastHole) drawHole(state.lastHole);
    if (state.lastGlz) drawGlz(state.lastGlz);
    else calcGlz();
  }

  window.LeakageView = { init: init, onShow: onShow };
})();
