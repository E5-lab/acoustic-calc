/*
 * view-sim-helmholtz.js — 亥姆霍兹共鸣器模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimHelmholtz（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-helmholtz" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimHelmholtz;

  var DEFAULTS = { d: 0.02, t: 0.005, V: 0.001, c: 343, endCorr: 0.85 };
  // 载入例题：一个典型「瓶口共鸣」参数（颈略长、腔稍大）
  var PRESET = { d: 0.025, t: 0.012, V: 0.002, c: 343, endCorr: 0.85 };

  var state = Object.assign({}, DEFAULTS);
  var last = null;             // 最近一次成功的计算结果
  var inited = false;

  // 动画相关状态
  var anim = { playing: true, elapsed: 0, fVis: 1.0, ampFrac: 0.22 };
  var rafId = null, lastTs = null;
  var canvas = null, ctx = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 参数输入区 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" data-k="' + k + '" value="' + (val == null ? '' : val) +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  /* ------------------------------ 读取与计算 ------------------------------ */
  function readInputs() {
    ['d', 't', 'V', 'c', 'endCorr'].forEach(function (k) {
      var el = $('simH_' + k);
      if (!el) return;
      var v = parseFloat(el.value);
      state[k] = isNaN(v) ? 0 : v;
    });
  }

  function syncInputs() {
    ['d', 't', 'V', 'c', 'endCorr'].forEach(function (k) {
      var el = $('simH_' + k);
      if (el) el.value = state[k];
    });
  }

  function recalc() {
    readInputs();
    var r = E.helmholtz(state);
    last = r.ok ? r : null;
    renderResult(r);
    computeAnimParams(r);
  }

  // 根据真实 f0 计算「可观察」动画频率 fVis（0.4–1.2 Hz）与振幅比例
  function computeAnimParams(r) {
    if (r && r.ok) {
      var f = r.f0;
      // 线性缩放并夹取，使真实频率在画面中可见
      var fv = f / 200;
      if (fv < 0.4) fv = 0.4;
      if (fv > 1.2) fv = 1.2;
      anim.fVis = fv;
    }
  }

  function renderResult(r) {
    var box = $('simHResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var stats = [
      { l: '共振频率 f₀', v: num(r.f0, 1), u: 'Hz' },
      { l: '颈口面积 A', v: num(r.neckArea, 6), u: 'm²' },
      { l: '有效颈长 Lₑ', v: num(r.Leff, 5), u: 'm' },
      { l: '共振波长 λ₀', v: num(r.lambda0, 3), u: 'm' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">f₀ = (c / 2π)·√( A / (V·Lₑ) )</span></div>' +
      '<div>A = π·(d/2)²，Lₑ = t + δ·d（δ = ' + num(r.endCorr, 2) + '）</div></div>';

    if (r.notes && r.notes.length) {
      html += '<ul class="inline-note" style="margin-top:10px">';
      r.notes.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
      html += '</ul>';
    }
    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function resizeCanvas() {
    if (!canvas) return;
    var cssW = canvas.clientWidth || 600;
    var cssH = 320;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    if (!ctx) return;
    var W = canvas.clientWidth || 600;
    var H = 320;
    ctx.clearRect(0, 0, W, H);

    // —— 几何布局（CSS 像素坐标）——
    var cavX0 = W * 0.46, cavX1 = W * 0.92;
    var cavY0 = H * 0.16, cavY1 = H * 0.84;
    var cavW = cavX1 - cavX0, cavH = cavY1 - cavY0;

    var neckX0 = W * 0.08, neckX1 = cavX0;          // 颈通道（左开口 → 接腔体）
    var neckMidY = H * 0.5;
    var neckH = H * 0.20;                            // 颈高度
    var neckTop = neckMidY - neckH / 2, neckBot = neckMidY + neckH / 2;
    var neckMidX = (neckX0 + neckX1) / 2;
    var neckLen = neckX1 - neckX0;

    var phase = 2 * Math.PI * anim.fVis * anim.elapsed;
    var s = Math.sin(phase);                        // 振荡 [-1, 1]
    var plugCenterX = neckMidX + (neckLen * anim.ampFrac) * s;

    // —— 腔体（空心矩形，壁厚描边）——
    ctx.fillStyle = '#eef4fb';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    roundRect(cavX0, cavY0, cavW, cavH, 12);
    ctx.fill(); ctx.stroke();

    // 腔内「压缩」指示：随相位脉动的压力叠层
    var press = (s + 1) / 2;                        // [0,1]，压缩强度
    ctx.save();
    roundRect(cavX0 + 3, cavY0 + 3, cavW - 6, cavH - 6, 10);
    ctx.clip();
    var nz = 7;
    for (var i = 0; i < nz; i++) {
      var px = cavX0 + cavW * (i + 0.5) / nz;
      var alpha = 0.06 + 0.22 * press * (1 - Math.abs(i - (nz - 1) / 2) / (nz / 2 + 0.5));
      if (alpha < 0) alpha = 0;
      var rad = (cavH * 0.5) * (0.4 + 0.45 * press);
      var g = ctx.createRadialGradient(px, neckMidY, 2, px, neckMidY, rad);
      g.addColorStop(0, 'rgba(56,132,255,' + alpha.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(56,132,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, neckMidY, rad, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();

    // —— 颈通道（连接腔体的窄管）——
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(neckX0, neckTop, neckLen, neckH);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(neckX0, neckTop, neckLen, neckH);

    // —— 空气塞（air plug）在颈中左右振荡 ——
    var plugW = Math.min(neckLen * 0.5, neckH * 0.95);
    var plugH = neckH * 0.82;
    var pX = plugCenterX - plugW / 2;
    pX = Math.max(neckX0 + 2, Math.min(neckX1 - plugW - 2, pX));
    ctx.fillStyle = 'rgba(56,132,255,0.85)';
    roundRect(pX, neckMidY - plugH / 2, plugW, plugH, 6);
    ctx.fill();
    // 移动方向箭头
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2;
    ctx.beginPath();
    var ay = neckMidY, ax = plugCenterX + (s >= 0 ? 1 : -1) * (plugW / 2 + 8);
    ctx.moveTo(plugCenterX + (s >= 0 ? 1 : -1) * (plugW / 2 + 2), ay);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax - (s >= 0 ? 6 : -6), ay - 5);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - (s >= 0 ? 6 : -6), ay + 5);
    ctx.stroke();

    // —— 标签 ——
    ctx.fillStyle = '#334155';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('颈 / Neck（空气塞振荡）', neckMidX, H * 0.92);
    ctx.fillText('腔体 / Cavity（压力脉动）', cavX0 + cavW / 2, H * 0.92);
    ctx.fillText('开口', neckX0, neckTop - 8);

    // —— 动画说明条 ——
    var fReal = (last && last.ok) ? num(last.f0, 1) : '—';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('演示频率 f_vis ≈ ' + anim.fVis.toFixed(2) + ' Hz（真实 f₀ = ' + fReal + ' Hz，已放慢）', 8, 16);

    // 播放/暂停角标
    ctx.textAlign = 'right';
    ctx.fillStyle = anim.playing ? '#16a34a' : '#94a3b8';
    ctx.fillText(anim.playing ? '● 播放中' : '⏸ 已暂停', W - 8, 16);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loop(ts) {
    if (lastTs == null) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (anim.playing) anim.elapsed += dt;
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function togglePlay() {
    anim.playing = !anim.playing;
    var btn = $('simHToggle');
    if (btn) btn.textContent = anim.playing ? '暂停' : '播放';
    flash('simHMsg', anim.playing ? '动画已播放' : '动画已暂停');
  }

  /* ------------------------------ 按钮行为 ------------------------------ */
  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('simHMsg', '已载入例题（瓶口共鸣参数）');
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('simHMsg', '已重置为默认参数');
  }

  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-helmholtz');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>亥姆霍兹共鸣器模拟器</h2>' +
      '<p class="hint">实时演示颈口「空气塞」在腔体内振荡产生共振；调整参数即可观察共振频率 f₀ 的连续变化' +
      '（基于公开经典声学公式，不含 CFD/BEM 物理仿真）</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row">' +
      field('d', '颈直径 d', state.d, 'm', 0.001, 0.001) +
      field('t', '颈长 t（板厚）', state.t, 'm', 0, 0.001) +
      field('V', '腔体体积 V', state.V, 'm³', 0.0001, 0.0001) +
      field('c', '声速 c', state.c, 'm/s', 1, 1) +
      field('endCorr', '端部修正 δ', state.endCorr, '', 0, 0.05) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="simHPreset" class="btn">载入例题</button>' +
      '<button id="simHReset" class="btn ghost">重置</button>' +
      '<span id="simHMsg" class="aux-msg"></span></div></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">2</span> 实时动画</h3>' +
      '<canvas class="canvas-wrap" id="simHCanvas"></canvas>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="simHToggle" class="btn">暂停</button>' +
      '<span class="aux-msg">动画按可观察频率放慢演示，真实 f₀ 见下方读数。</span></div>' +
      '<div id="simHResult" style="margin-top:12px"></div></section>' +
      '</div>' +
      '</div>' +
      '<section class="card notes"><h3>计算方法与说明</h3>' +
      '<ul>' +
      '<li><strong>颈口面积</strong>：A = π·(d/2)²（m²）。</li>' +
      '<li><strong>有效颈长</strong>：Lₑ = t + δ·d；δ 默认 0.85，对应单端法兰端部修正（≈0.85·d），短颈时影响显著。</li>' +
      '<li><strong>共振频率</strong>：f₀ = (c / 2π)·√( A / (V·Lₑ) )（Hz）；λ₀ = c / f₀。</li>' +
      '<li><strong>趋势</strong>：f₀ 随 V、A 减小或 t 变短而升高；端部修正 δ·d 对短颈不可忽略。</li>' +
      '<li><strong>公式来源</strong>：经典 Helmholtz 共鸣器理论（公开声学文献，非任何第三方商业实现）。</li>' +
      '</ul></section>';
  }

  function bind() {
    var pre = $('simHPreset'); if (pre) pre.addEventListener('click', loadPreset);
    var res = $('simHReset'); if (res) res.addEventListener('click', reset);
    var tog = $('simHToggle'); if (tog) tog.addEventListener('click', togglePlay);
    Array.prototype.forEach.call($('view-sim-helmholtz').querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', recalc);
    });
    window.addEventListener('resize', function () { resizeCanvas(); draw(); });
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    canvas = $('simHCanvas');
    ctx = canvas ? canvas.getContext('2d') : null;
    resizeCanvas();
    bind();
    recalc();
    lastTs = null;
    rafId = requestAnimationFrame(loop);
    inited = true;
  }

  function onShow() {
    if (!inited) { init(); return; }
    resizeCanvas();
    recalc();
    draw();
  }

  window.SimHelmholtzView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
