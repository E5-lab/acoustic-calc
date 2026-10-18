/*
 * view-diffuser.js — 声学扩散体设计视图（交互 + 几何剖面 + 裁切清单）
 * 依赖：window.Diffuser（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-diffuser" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.Diffuser;

  var DEFAULTS = {
    type: 'qrd',
    f0: 1000,
    wellWidth: 50,
    unit: 'mm',
    N: 7,
    Nx: 7,
    Ny: 11,
    m: 5,
    density: 600,
    targetLow: 800,
    targetHigh: 3430
  };

  // 各类型的推荐例题（载入即用）
  var PRESETS = {
    qrd: { f0: 1000, wellWidth: 50, N: 7 },
    prd: { f0: 1000, wellWidth: 50, N: 7 },
    mls: { f0: 1000, wellWidth: 50, m: 5 },
    qrd2d: { f0: 1000, wellWidth: 50, Nx: 7, Ny: 11 },
    skyline: { f0: 1000, wellWidth: 50, N: 7 },
    binary: { f0: 1000, wellWidth: 50, N: 7 },
    wave: { f0: 1000, wellWidth: 50, N: 9 },
    fractal: { f0: 1000, wellWidth: 50, N: 7 }
  };

  var state = Object.assign({}, DEFAULTS);
  var last = null;
  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function group(n, digits) { return Number(n).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  /* ------------------------------ 类型卡片 ------------------------------ */
  function renderTypes() {
    var box = $('diffTypes');
    if (!box) return;
    box.innerHTML = '';
    E.TYPES.forEach(function (p) {
      var label = document.createElement('label');
      label.className = 'pattern-card' + (state.type === p.id ? ' selected' : '');
      label.setAttribute('data-type', p.id);
      label.innerHTML =
        '<span class="pc-body">' +
        '<span class="pc-title">' + esc(p.name) + '</span>' +
        '<span class="pc-en">' + esc(p.en) + '</span>' +
        '<span class="pc-desc">' + esc(p.desc) + '</span>' +
        '</span>';
      label.addEventListener('click', function () {
        state.type = p.id;
        renderTypes();
        renderParams();
        recalc();
      });
      box.appendChild(label);
    });
  }

  /* ------------------------------ 参数区 ------------------------------ */
  function renderParams() {
    var box = $('diffParams');
    if (!box) return;
    var meta = E.TYPES.filter(function (t) { return t.id === state.type; })[0] || {};
    var rows = [];
    rows.push(field('f0', '设计频率 f₀', state.f0, 'Hz', 50, 10));
    rows.push(
      field('wellWidth', '井宽 a', state.wellWidth, state.unit, 1, 1) +
      unitSelect()
    );
    if (meta.needsN) {
      rows.push(field('N', meta.anyN ? '周期数 N（任意 ≥2）' : '周期数 N（素数）', state.N, '', 2, 1));
    }
    if (meta.needsM) {
      rows.push(field('m', 'MLS 级数 m（2–10）', state.m, '', 2, 1));
    }
    if (meta.needs2D) {
      rows.push(field('Nx', 'X 轴素数 Nx', state.Nx, '', 2, 1));
      rows.push(field('Ny', 'Y 轴素数 Ny', state.Ny, '', 2, 1));
    }
    rows.push(field('density', '材料密度 ρ', state.density, 'kg/m³', 1, 10));
    rows.push(field('targetLow', '目标频段下限', state.targetLow, 'Hz', 1, 10));
    rows.push(field('targetHigh', '目标频段上限', state.targetHigh, 'Hz', 1, 10));
    box.innerHTML = rows.join('');

    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
    var us = $('diffUnit');
    if (us) us.addEventListener('change', function () { state.unit = us.value; recalc(); });
  }

  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" data-k="' + k + '" value="' + (val == null ? '' : val) +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  function unitSelect() {
    var opts = ['mm', 'cm', 'in'].map(function (u) {
      return '<option value="' + u + '"' + (state.unit === u ? ' selected' : '') + '>' + u + '</option>';
    }).join('');
    return '<div class="field"><label class="f-label">单位</label>' +
      '<select id="diffUnit" class="text-input">' + opts + '</select></div>';
  }

  /* ------------------------------ 计算与渲染 ------------------------------ */
  function recalc() {
    var r = E.generate(state);
    last = r.ok ? r : null;
    renderResult(r);
    renderProfile(r);
    renderCutList(r);
  }

  function renderResult(r) {
    var box = $('diffResult');
    if (!box) return;
    if (!r.ok) { box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>'; return; }
    var stats = [
      { l: '设计频率 f₀', v: num(r.f0, 0), u: 'Hz' },
      { l: '最大井深', v: num(r.dMaxMm, 1), u: 'mm' },
      { l: '周期宽度', v: Array.isArray(r.periodMm) ? r.periodMm.map(function (x) { return num(x, 0); }).join('×') : num(r.periodMm, 0), u: Array.isArray(r.periodMm) ? 'mm' : 'mm' },
      { l: '井数', v: group(r.wellCount, 0), u: '个' },
      { l: '有效频段', v: r.fLow ? num(r.fLow, 0) + '–' + num(r.fHigh, 0) : '—', u: 'Hz' },
      { l: '设计完整度', v: r.completeness != null ? r.completeness + '' : '—', u: '%' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    if (r.bandFit) {
      html += '<div class="formula" style="margin-top:12px">' +
        '<div><span class="fx">目标频段契合度 ' + r.bandFit.fit + '%</span></div>' +
        '<div>' + esc(r.bandFit.verdict) + '</div></div>';
    }
    if (r.notes && r.notes.length) {
      html += '<ul class="inline-note" style="margin-top:10px">';
      r.notes.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
      html += '</ul>';
    }
    box.innerHTML = html;
  }

  /* ------------------------------ 几何剖面 SVG ------------------------------ */
  function color2D(ratio) {
    var L = Math.max(20, 90 - ratio * 62);
    return 'hsl(210,68%,' + L.toFixed(0) + '%)';
  }

  function buildProfile(r) {
    if (!r.ok) return '';
    if (r.is2D) {
      var mat = r.depthsMm;
      var rows = mat.length, cols = mat[0].length;
      var cell = Math.min(30, Math.max(12, Math.floor(760 / cols)));
      var pad = 12;
      var W = pad * 2 + cols * cell;
      var H = pad * 2 + rows * cell;
      var maxD = r.dMaxMm || 1;
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMinYMin meet" style="max-width:760px">';
      for (var i = 0; i < rows; i++) {
        for (var j = 0; j < cols; j++) {
          var d = mat[i][j];
          var ratio = maxD > 0 ? d / maxD : 0;
          svg += '<rect x="' + (pad + j * cell) + '" y="' + (pad + i * cell) +
            '" width="' + (cell - 1) + '" height="' + (cell - 1) +
            '" fill="' + color2D(ratio) + '" stroke="#fff" stroke-width="0.6"/>';
        }
      }
      svg += '</svg>';
      return svg;
    }
    // 1D 阶梯剖面
    var depths = r.depthsMm;
    var n = depths.length;
    var barW = Math.min(40, Math.max(14, Math.floor(720 / n)));
    var gap = Math.max(4, barW * 0.18);
    var padL = 14, padT = 12, baseH = 230, padB = 30;
    var W2 = padL * 2 + n * (barW + gap);
    var H2 = padT + baseH + padB;
    var maxD2 = r.dMaxMm || 1;
    var svg2 = '<svg viewBox="0 0 ' + W2 + ' ' + H2 + '" width="100%" preserveAspectRatio="xMinYMin meet" style="max-width:760px">';
    svg2 += '<line x1="' + padL + '" y1="' + (padT + baseH) + '" x2="' + (W2 - padL) + '" y2="' + (padT + baseH) + '" stroke="#94a3b8" stroke-width="1"/>';
    var x = padL;
    depths.forEach(function (d, idx) {
      var h = (d / maxD2) * baseH;
      var y = padT + (baseH - h);
      var fill = d <= 0 ? '#e2e8f0' : color2D(d / maxD2);
      svg2 += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(0, h) +
        '" fill="' + fill + '" stroke="#475569" stroke-width="0.8"/>';
      if (idx % Math.ceil(n / 16) === 0 || n <= 16) {
        svg2 += '<text x="' + (x + barW / 2) + '" y="' + (padT + baseH + 16) + '" font-size="10" fill="#64748b" text-anchor="middle">' + idx + '</text>';
      }
      x += barW + gap;
    });
    svg2 += '</svg>';
    return svg2;
  }

  function renderProfile(r) {
    var box = $('diffProfile');
    if (!box) return;
    box.innerHTML = r.ok ? buildProfile(r) : '<p class="inline-note">请输入有效参数后查看几何剖面。</p>';
  }

  /* ------------------------------ 裁切清单 ------------------------------ */
  function renderCutList(r) {
    var box = $('diffCut');
    if (!box) return;
    if (!r.ok) { box.innerHTML = ''; return; }
    var html = '<table class="data-table"><thead><tr>' +
      '<th>井深 (mm)</th><th>数量</th><th>单件体积 (cm³)</th><th>小计重量 (kg)</th></tr></thead><tbody>';
    r.cutList.forEach(function (row) {
      html += '<tr><td>' + num(row.depthMm, 1) + '</td><td>' + group(row.count, 0) +
        '</td><td>' + num(row.volCm3, 1) + '</td><td>' + num(row.weightKg, 2) + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div class="inline-note">总体积 ' + group(r.totalVolCm3, 0) + ' cm³，总重（密度 ' +
      num(state.density, 0) + ' kg/m³）≈ ' + num(r.totalWeightKg, 2) + ' kg（按井截面 a×a、高=井深填充估算）。</div>';
    box.innerHTML = html;
  }

  /* ------------------------------ 导出 / 复制 ------------------------------ */
  function summaryText() {
    if (!last) return '';
    var r = last;
    var out = [];
    out.push('声学扩散体设计 · 结果摘要');
    out.push('类型：' + r.typeName + '（' + r.type + '）');
    out.push('设计频率 f₀ = ' + num(r.f0, 0) + ' Hz；井宽 a = ' + num(r.wellWidthMm, 1) + ' mm');
    if (r.N != null) out.push('周期数 N = ' + r.N);
    if (r.m != null) out.push('MLS 级数 m = ' + r.m);
    if (r.Nx != null) out.push('Nx = ' + r.Nx + '，Ny = ' + r.Ny);
    out.push('最大井深 = ' + num(r.dMaxMm, 1) + ' mm；周期宽度 = ' +
      (Array.isArray(r.periodMm) ? r.periodMm.map(function (x) { return num(x, 0); }).join('×') : num(r.periodMm, 0)) + ' mm');
    out.push('有效频段 ≈ ' + (r.fLow ? num(r.fLow, 0) : '—') + '–' + (r.fHigh ? num(r.fHigh, 0) : '—') + ' Hz');
    if (r.bandFit) out.push('目标频段契合度 = ' + r.bandFit.fit + '%');
    out.push('井数 = ' + group(r.wellCount, 0) + '；估算总重 ≈ ' + num(r.totalWeightKg, 2) + ' kg');
    if (r.seqInfo) out.push('序列前 16 项 = ' + r.seqInfo.sample.join(', ') + ' …（共 ' + r.seqInfo.len + ' 项）');
    out.push('工具：声学计算工具箱 · 扩散体设计');
    return out.join('\n');
  }

  function copySummary() {
    var txt = summaryText();
    if (!txt) { flash('diffMsg', '暂无可复制结果'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { flash('diffMsg', '已复制结果摘要'); }, function () { fallbackCopy(txt); });
    } else { fallbackCopy(txt); }
  }

  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); flash('diffMsg', '已复制结果摘要'); }
    catch (e) { alert('复制失败，请手动选择文本。'); }
    document.body.removeChild(ta);
  }

  function exportCsv() {
    if (!last) { flash('diffMsg', '暂无可导出结果'); return; }
    var r = last;
    var rows = [];
    rows.push(['声学扩散体设计结果', '', '']);
    rows.push(['类型', r.typeName + '（' + r.type + '）', '']);
    rows.push(['设计频率 f₀', num(r.f0, 0), 'Hz']);
    rows.push(['井宽 a', num(r.wellWidthMm, 1), 'mm']);
    if (r.N != null) rows.push(['周期数 N', r.N, '']);
    if (r.m != null) rows.push(['MLS 级数 m', r.m, '']);
    if (r.Nx != null) rows.push(['Nx / Ny', r.Nx + ' / ' + r.Ny, '']);
    rows.push(['最大井深', num(r.dMaxMm, 1), 'mm']);
    rows.push(['周期宽度', Array.isArray(r.periodMm) ? r.periodMm.map(function (x) { return num(x, 0); }).join('×') : num(r.periodMm, 0), 'mm']);
    rows.push(['有效频段', (r.fLow ? num(r.fLow, 0) : '—') + '–' + (r.fHigh ? num(r.fHigh, 0) : '—'), 'Hz']);
    if (r.bandFit) rows.push(['目标频段契合度', r.bandFit.fit, '%']);
    rows.push(['井数', group(r.wellCount, 0), '个']);
    rows.push([]);
    rows.push(['裁切清单', '', '']);
    rows.push(['井深(mm)', '数量', '单件体积(cm³)', '小计重量(kg)']);
    r.cutList.forEach(function (row) {
      rows.push([num(row.depthMm, 1), group(row.count, 0), num(row.volCm3, 1), num(row.weightKg, 2)]);
    });
    rows.push(['合计', '', '', num(r.totalWeightKg, 2)]);
    var csv = '\ufeff' + rows.map(function (row) {
      return row.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'diffuser-design.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    renderTypes();
    renderParams();
    recalc();
  }

  function loadPreset() {
    var p = PRESETS[state.type];
    if (!p) return;
    state.f0 = p.f0; state.wellWidth = p.wellWidth;
    if (p.N != null) state.N = p.N;
    if (p.Nx != null) state.Nx = p.Nx;
    if (p.Ny != null) state.Ny = p.Ny;
    if (p.m != null) state.m = p.m;
    renderParams();
    recalc();
    flash('diffMsg', '已载入 ' + (E.TYPES.filter(function (t) { return t.id === state.type; })[0].name) + ' 例题');
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-diffuser');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>声学扩散体设计</h2>' +
      '<p class="hint">QRD / PRD / MLS / 2D QRD / Skyline / Binary / Wave / Fractal 八类扩散体的参数化几何设计（基于公开经典声学公式，不含 BEM 仿真）</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 选择扩散体类型</h3>' +
      '<div class="pattern-grid" id="diffTypes"></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 输入设计参数</h3>' +
      '<div class="field-row" id="diffParams"></div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="diffPreset" class="btn">载入例题</button>' +
      '<button id="diffReset" class="btn ghost">重置参数</button>' +
      '<span id="diffMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">3</span> 几何剖面</h3>' +
      '<div class="canvas-wrap" id="diffProfile"></div>' +
      '<p class="inline-note">1D 类型显示阶梯/井深剖面；2D QRD 显示俯视深度网格（颜色越深越深）。</p></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="diffResult"></div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="diffCopy" class="btn">复制摘要</button>' +
      '<button id="diffCsv" class="btn">导出 CSV</button></div></section>' +
      '<section class="card"><h3>裁切清单</h3><div id="diffCut"></div></section>' +
      '</div>' +
      '</div>' +
      '<section class="card notes"><h3>计算方法与说明</h3>' +
      '<ul>' +
      '<li><strong>QRD</strong>：井深 d_n = (n² mod N)·λ₀/(2N)，n=0…N-1，最大井深≈λ₀/2；宽频均匀散射。</li>' +
      '<li><strong>PRD</strong>：井深 d_n = gⁿ mod N · λ₀/(2N)，g 为 N 的原根；散射图样与 QRD 不同，具方向性。</li>' +
      '<li><strong>MLS</strong>：最大长度序列二元深度（0 / λ₀/2），功率谱平坦、制造最简单。</li>' +
      '<li><strong>2D QRD</strong>：X/Y 独立素数序列，d_ij = (sX_i + sY_j)·(λ₀/2)/[(Nx-1)+(Ny-1)]，半球散射。</li>' +
      '<li><strong>Skyline / Binary / Wave / Fractal</strong>：分别为开口井天际线、反射/吸声交替光栅、光滑波纹曲面、自相似多尺度构造。</li>' +
      '<li><strong>有效频段（基于几何估算）</strong>：低频限 f_low = c/(2·d_max)，高频限 f_high = c/(2·a)；本工具不含 BEM/FEM 物理仿真，最终性能应以现场测量为准。</li>' +
      '<li><strong>公式来源</strong>：M. R. Schroeder (JASA 1975)；T. J. Cox & P. D’Antonio, <em>Acoustic Absorbers and Diffusers</em>（均为公开经典理论，非任何第三方商业实现）。</li>' +
      '</ul></section>';
  }

  function bind() {
    var p = $('diffPreset'); if (p) p.addEventListener('click', loadPreset);
    var r = $('diffReset'); if (r) r.addEventListener('click', reset);
    var c = $('diffCopy'); if (c) c.addEventListener('click', copySummary);
    var v = $('diffCsv'); if (v) v.addEventListener('click', exportCsv);
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    renderTypes();
    renderParams();
    bind();
    recalc();
    inited = true;
  }

  function onShow() {
    recalc();
  }

  window.DiffuserView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
