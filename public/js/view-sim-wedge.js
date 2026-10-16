/*
 * view-sim-wedge.js — 消声室吸声楔模拟器视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimWedge（计算内核）
 * 约定：init() 时自建全部 DOM（含 .page-head）注入到 #view-sim-wedge，
 *       不依赖其他模块的 CSS，仅复用既有公共类。
 */
(function () {
  'use strict';

  var E = window.SimWedge;

  var DEFAULTS = {
    L: 1.0,        // 楔长 m
    fTarget: 100,  // 目标低频限 Hz
    roomW: '',     // 房间宽 m（可选）
    roomH: '',     // 房间高 m（可选）
    roomD: '',     // 房间深 m（可选）
    c: 343,        // 声速 m/s
    fWave: 200     // 动画模拟频率 Hz（用于观察截止）
  };

  // 载入例题：一个典型的全频段消声室设计
  var PRESET = { L: 1.2, fTarget: 80, roomW: 6, roomH: 4, roomD: 5, c: 343, fWave: 200 };

  var state = Object.assign({}, DEFAULTS);
  var last = null;
  var inited = false;
  var playing = true;
  var rafId = null;
  var t = 0;               // 动画相位时间
  var PX_PER_M = 70;       // 几何像素比例（用于画楔与波长）

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function group(n) { return Number(n).toLocaleString('en-US'); }

  /* ------------------------------ 骨架 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-wedge');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>消声室吸声楔模拟器</h2>' +
      '<p class="hint">基于吸声楔截止频率经验准则（fCut = c/(2·L)）的设计工具：给定楔长估算截止频率，或给定目标低频限反算所需楔长，并估算房间用楔数量与单楔体积。下方动画实时演示声波在楔面上是"被吸收（高频，绿）"还是"被反射（低频，红）"。</p></div>' +
      '<div class="split">' +
      // 左列：输入
      '<div class="split-col">' +
      '<section class="card"><h3>输入参数</h3>' +
      '<div class="field-row">' +
      field('L', '楔长 L（向室内凸出）', state.L, 'm') +
      field('fTarget', '目标低频限 fTarget', state.fTarget, 'Hz') +
      field('c', '声速 c', state.c, 'm/s') +
      field('roomW', '房间宽 W（可选）', state.roomW, 'm') +
      field('roomH', '房间高 H（可选）', state.roomH, 'm') +
      field('roomD', '房间深 D（可选）', state.roomD, 'm') +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="wgPreset" class="btn">载入例题</button>' +
      '<button id="wgReset" class="btn ghost">重置</button>' +
      '<span id="wgMsg" class="aux-msg"></span></div>' +
      '<div class="inline-note" style="margin-top:8px">提示：修改 L 会同时改变截止频率；下方动画频率滑块可跨越截止点观察吸收/反射切换。</div>' +
      '</section>' +
      // 动画控制卡片
      '<section class="card"><h3>实时声波动画</h3>' +
      '<div class="field-row">' +
      '<div class="field" style="flex:2 1 220px"><label class="f-label">模拟频率 f<span class="unit-tag">Hz</span></label>' +
      '<input id="wgF" class="text-input" type="range" min="20" max="2000" step="1" value="' + state.fWave + '"></div>' +
      '<div class="field" style="flex:1 1 120px"><label class="f-label">当前 f</label>' +
      '<input id="wgFval" class="text-input" type="text" value="' + state.fWave + '" readonly></div>' +
      '</div>' +
      '<div class="btn-row toolbar">' +
      '<button id="wgPlay" class="btn">暂停</button>' +
      '<span id="wgStatus" class="aux-msg"></span></div>' +
      '</section>' +
      '</div>' +
      // 右列：动画 + 结果
      '<div class="split-col">' +
      '<section class="card"><h3>声场示意（右→左入射）</h3>' +
      '<canvas class="canvas-wrap" id="wgCanvas"></canvas>' +
      '<p class="inline-note">绿：波长 λ &lt; 2L（高于截止，进入楔谷被吸收）；红：λ &gt; 2L（低于截止，被反射）。虚线标出截止频率 fCut 位置。</p>' +
      '</section>' +
      '<section class="card"><h3>计算结果</h3>' +
      '<div id="wgResult"></div>' +
      '<div class="formula" id="wgFormula" style="margin-top:12px"></div>' +
      '</section>' +
      '</div>' +
      '</div>' +
      '<section class="card notes"><h3>计算方法与说明</h3>' +
      '<ul>' +
      '<li><strong>截止频率（保守）</strong>：fCut = c/(2·L)，对应 λ ≈ 2L；楔有效吸收的下限频率（本工具采用）。</li>' +
      '<li><strong>四分之一波长准则（参考）</strong>：许多文献取 L ≈ λ/4，即 f ≈ c/(4·L)，给出更宽松的有效条件，结果中以 fCutQuarter 标注。</li>' +
      '<li><strong>所需楔长</strong>：Lneeded = c/(2·fTarget)，达到目标低频限所需的最小楔长。</li>' +
      '<li><strong>契合比</strong>：ratio = L/Lneeded，≥1 表示满足目标，&lt;1 需在 fTarget 以下加长楔。</li>' +
      '<li><strong>数量/体积</strong>：countForRoom = 房间总表面积 /(s·L)（s 假定 0.3 m 为简化占位估算）；单楔体积按三角棱柱 V = ½·(L/2)·L·s 估算。</li>' +
      '<li><strong>物理本质</strong>：楔使声阻抗沿长度渐变匹配，把反射转化为吸收；本工具为经验估算，最终性能以现场测量为准。</li>' +
      '</ul></section>';
  }

  function field(k, label, val, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" data-k="' + k + '" value="' + (val === '' ? '' : val) +
      '" min="0" step="any"></div>';
  }

  /* ------------------------------ 绑定 ------------------------------ */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('#view-sim-wedge [data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = el.value === '' ? '' : parseFloat(el.value);
        state[k] = v;
        recalc();
      });
    });
    var p = $('wgPreset'); if (p) p.addEventListener('click', loadPreset);
    var r = $('wgReset'); if (r) r.addEventListener('click', reset);
    var play = $('wgPlay'); if (play) play.addEventListener('click', togglePlay);
    var f = $('wgF'); if (f) f.addEventListener('input', function () {
      state.fWave = parseFloat(f.value);
      var fv = $('wgFval'); if (fv) fv.value = state.fWave;
      recalc();
    });
  }

  function togglePlay() {
    playing = !playing;
    var b = $('wgPlay');
    if (b) b.textContent = playing ? '暂停' : '播放';
    if (playing) loop();
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.design({
      L: state.L, fTarget: state.fTarget, c: state.c,
      roomW: state.roomW, roomH: state.roomH, roomD: state.roomD
    });
    last = r.ok ? r : null;
    renderResult(r);
    updateStatus(r);
  }

  function renderResult(r) {
    var box = $('wgResult');
    if (!box) return;
    if (!r.ok) { box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>'; $('wgFormula').innerHTML = ''; return; }
    var stats = [
      { l: '截止频率 fCut', v: num(r.fCut, 2), u: 'Hz' },
      { l: '所需长度 Lneeded', v: num(r.Lneeded, 3), u: 'm' },
      { l: '契合比 ratio', v: num(r.ratio, 3), u: '' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';

    // 可选信息：房间数量 / 单楔体积
    var extra = [];
    if (r.countForRoom != null) extra.push('房间用楔数量 ≈ ' + group(r.countForRoom) + ' 个（总表面积 ' + num(r.roomArea, 1) + ' m²）');
    extra.push('单个楔体积 ≈ ' + num(r.volEach * 1000, 2) + ' L（' + num(r.volEach, 4) + ' m³）');
    html += '<ul class="inline-note" style="margin-top:10px">' +
      extra.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    box.innerHTML = html;

    $('wgFormula').innerHTML =
      '<div><span class="fx">fCut = c / (2·L) = ' + num(r.c, 0) + ' / (2·' + num(r.L, 2) +
      ') = ' + num(r.fCut, 2) + ' Hz</span></div>' +
      '<div>四分之一波长准则参考：f ≈ c/(4·L) = ' + num(r.fCutQuarter, 2) + ' Hz</div>' +
      '<div>Lneeded = c/(2·fTarget) = ' + num(r.Lneeded, 3) + ' m；ratio = ' + num(r.ratio, 3) +
      (r.ratio >= 1 ? '（满足目标）' : '（需加长）') + '</div>';
  }

  function updateStatus(r) {
    var el = $('wgStatus');
    if (!el) return;
    if (!r.ok) { el.textContent = ''; return; }
    var above = state.fWave > r.fCut; // λ < 2L → 高于截止 → 吸收
    el.textContent = (above ? '当前 f 高于截止 → 被吸收（绿）' : '当前 f 低于截止 → 被反射（红）') +
      ' · fCut = ' + num(r.fCut, 1) + ' Hz';
    el.style.color = above ? '#16a34a' : '#dc2626';
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function getCtx() {
    var cv = $('wgCanvas');
    if (!cv) return null;
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || 600;
    var h = 300;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = h + 'px';
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function drawWave() {
    var g = getCtx();
    if (!g) return;
    var ctx = g.ctx, W = g.w, H = g.h;
    ctx.clearRect(0, 0, W, H);

    var r = last;
    var L = (r && r.ok) ? r.L : (parseFloat(state.L) || 1.0);
    var fCut = (r && r.ok) ? r.fCut : 343 / (2 * L);
    var c = (r && r.ok) ? r.c : 343;

    // 几何像素
    var wedgeLenPx = Math.max(24, Math.min(H * 0.6, L * PX_PER_M));
    var wallY = H - 8;                       // 墙面（底部）
    var apexY = wallY - wedgeLenPx;          // 楔尖
    var spacingPx = wedgeLenPx;              // 楔间距 = 楔长（底宽），形成连续锯齿楔阵
    var baseY = apexY;                       // 波在楔阵上方的水平基准

    // 绘制楔阵（三角：底在墙面，尖朝室内/上）
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    for (var x = 0; x <= W; x += spacingPx) {
      ctx.beginPath();
      ctx.moveTo(x, wallY);
      ctx.lineTo(x + spacingPx / 2, apexY);  // 尖
      ctx.lineTo(x + spacingPx, wallY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 墙面基线
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, wallY); ctx.lineTo(W, wallY); ctx.stroke();

    // 入射波参数
    var fWave = state.fWave || 200;
    var lambdaPx = (c / fWave) * PX_PER_M;   // 像素波长
    var above = fWave > fCut;                // λ<2L => 吸收
    var A = Math.min(26, wedgeLenPx * 0.5);  // 振幅
    var yc = apexY - A - 14;                 // 波中心线（在楔阵上方）

    var color = above ? '#16a34a' : '#dc2626';

    // 入射波（自右向左传播）
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var px = 0; px <= W; px++) {
      var phase = (px / lambdaPx) * 2 * Math.PI + t;
      var amp = A;
      if (above) {
        // 接近楔阵（左侧）逐渐衰减 → 进入楔谷被吸收
        var d = (W - px) / W;            // 0(右)..1(左)
        amp = A * Math.exp(-3.0 * d);
      }
      var yy = yc + amp * Math.sin(phase);
      if (px === 0) ctx.moveTo(px, yy); else ctx.lineTo(px, yy);
    }
    ctx.stroke();

    if (!above) {
      // 反射：在墙面附近叠加一列反向（向右）传播的波，呈现反射回室内
      ctx.strokeStyle = 'rgba(220,38,38,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var px2 = 0; px2 <= W; px2++) {
        var phase2 = -(px2 / lambdaPx) * 2 * Math.PI - t; // 反向
        var yy2 = yc + A * Math.sin(phase2);
        if (px2 === 0) ctx.moveTo(px2, yy2); else ctx.lineTo(px2, yy2);
      }
      ctx.stroke();
    }

    // 截止频率标记：以 fWave 比例把 fCut 标到频率轴上（用顶部标尺示意）
    drawFreqAxis(ctx, W, H, fWave, fCut);

    // 状态文字
    ctx.fillStyle = color;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(above ? 'λ < 2L → 高于截止 → 被吸收' : 'λ > 2L → 低于截止 → 被反射', 12, 18);
    ctx.fillStyle = '#334155';
    ctx.fillText('f = ' + Math.round(fWave) + ' Hz, λ = ' + (c / fWave).toFixed(2) + ' m, fCut = ' + fCut.toFixed(1) + ' Hz', 12, 36);
  }

  // 顶部频率标尺：标记当前 f 与 fCut 的相对位置（对数刻度示意）
  function drawFreqAxis(ctx, W, H, fWave, fCut) {
    var x0 = 12, x1 = W - 12, y = 52;
    var fmin = 20, fmax = 2000;
    function fx(f) {
      var t = (Math.log(f) - Math.log(fmin)) / (Math.log(fmax) - Math.log(fmin));
      return x0 + t * (x1 - x0);
    }
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    // 刻度
    [20, 50, 100, 200, 500, 1000, 2000].forEach(function (f) {
      var xx = fx(f);
      ctx.beginPath(); ctx.moveTo(xx, y - 3); ctx.lineTo(xx, y + 3); ctx.stroke();
      ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : f + '', xx, y + 14);
    });
    // fCut 标记（虚线）
    var xc = fx(Math.max(fmin, Math.min(fmax, fCut)));
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#0891b2';
    ctx.beginPath(); ctx.moveTo(xc, y - 6); ctx.lineTo(xc, H - 70); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#0891b2'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('fCut', xc, y - 9);
    // 当前 f 标记
    var xf = fx(Math.max(fmin, Math.min(fmax, fWave)));
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(xf, y, 3.5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillText('f', xf, y - 9);
  }

  function loop() {
    if (!playing) return;
    t += 0.15;
    drawWave();
    rafId = requestAnimationFrame(loop);
  }

  function startAnim() {
    if (rafId) cancelAnimationFrame(rafId);
    playing = true;
    var b = $('wgPlay'); if (b) b.textContent = '暂停';
    loop();
  }

  /* ------------------------------ 预设 / 重置 ------------------------------ */
  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    var f = $('wgF'); if (f) f.value = state.fWave;
    var fv = $('wgFval'); if (fv) fv.value = state.fWave;
    flash('wgMsg', '已载入消声室例题（L=1.2 m，房间 6×4×5 m）');
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    var f = $('wgF'); if (f) f.value = state.fWave;
    var fv = $('wgFval'); if (fv) fv.value = state.fWave;
    flash('wgMsg', '已重置为默认参数');
  }

  function syncInputs() {
    Array.prototype.forEach.call(document.querySelectorAll('#view-sim-wedge [data-k]'), function (el) {
      var k = el.getAttribute('data-k');
      el.value = (state[k] === '' ? '' : state[k]);
    });
  }

  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2200);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    recalc();
    startAnim();
    inited = true;
  }

  function onShow() {
    recalc();
    startAnim();
  }

  window.SimWedgeView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
