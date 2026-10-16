/*
 * view-sim-tube.js — 声阻抗管（两传声器法）视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimTube（计算内核）
 * 约定：init() 自建全部 DOM（含 .page-head）注入 id="view-sim-tube" 容器，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimTube;

  var DEFAULTS = {
    Zs: 412,   // 样品法向声阻抗 rayl（默认≈空气，近乎匹配）
    rho: 1.2,  // 空气密度 kg/m³
    c: 343,    // 声速 m/s
    d: 0.05,   // 管径 m
    f: 500,    // 频率 Hz
    x1: 0.05,  // 传声器 1 距样品面 m
    x2: 0.10   // 传声器 2 距样品面 m
  };

  // 载入例题：刚性背衬多孔样品（明显驻波 + 节点）
  var PRESET = { Zs: 150, rho: 1.2, c: 343, d: 0.05, f: 500, x1: 0.05, x2: 0.10 };

  var state = Object.assign({}, DEFAULTS);
  var last = null;       // 最近一次 measure 结果
  var inited = false;
  var playing = true;    // 播放/暂停
  var rafId = null;
  var t0 = 0;            // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="tu_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="tu_' + k + '" data-k="' + k + '" value="' + val + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.measure(state);
    last = r.ok ? r : null;
    renderResult(r);
    if (!r.ok) stopAnim();
  }

  function renderResult(r) {
    var box = $('tuResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var stats = [
      { l: '压力反射系数 R', v: num(r.R, 4), u: '' },
      { l: '法向吸声系数 α', v: num(r.alpha, 4), u: '' },
      { l: '驻波比 SWR', v: isFinite(r.SWR) ? num(r.SWR, 3) : '∞', u: '' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">Z₀ = ρ·c = ' + num(r.Z0, 1) + ' rayl</span>；' +
      '<span class="fx">k = 2πf/c = ' + num(r.k, 2) + ' m⁻¹</span></div>' +
      '<div><span class="fx">R = (Zs−Z₀)/(Zs+Z₀) = ' + num(r.R, 4) + '</span></div>' +
      '<div><span class="fx">α = 1−R² = ' + num(r.alpha, 4) + '</span>；' +
      '<span class="fx">SWR = (1+|R|)/(1−|R|) = ' + (isFinite(r.SWR) ? num(r.SWR, 3) : '∞') + '</span></div>' +
      '<div style="margin-top:6px">两传声器传递函数 H₁₂ = p(x₂)/p(x₁) = ' +
      num(r.H12.re, 4) + (r.H12.im >= 0 ? '+' : '−') + num(Math.abs(r.H12.im), 4) + 'j，' +
      '|H₁₂| = ' + num(r.H12.mag, 4) + '</div>' +
      '</div>';

    html += '<ul class="inline-note" style="margin-top:10px">';
    r.notes.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul>';

    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setupCanvas() {
    var cv = $('tuCanvas');
    if (!cv) return null;
    DPR = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var cssW = rect.width || 720;
    var cssH = 320;
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    var ctx = cv.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function draw() {
    var setup = setupCanvas();
    if (!setup) return;
    var ctx = setup.ctx, W = setup.w, H = setup.h;

    ctx.clearRect(0, 0, W, H);
    // 背景
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if (!last || !last.ok) {
      ctx.fillStyle = '#f87171';
      ctx.font = '14px sans-serif';
      ctx.fillText('参数无效，无法绘制。', 16, H / 2);
      return;
    }

    var r = last;
    var padL = 56, padR = 16, padT = 18, padB = 36;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var midY = padT + plotH / 2;
    var halfH = plotH / 2 - 6;
    var ampMax = 1 + r.absR; // 归一化：波腹达满高
    var k = r.k, R = r.R, xmax = r.xmax;

    // x 坐标映射（样品 x=0 在左，管内沿 +x）
    function X(x) { return padL + (x / xmax) * plotW; }

    // 管壁
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(W - padR, padT);
    ctx.moveTo(padL, padT + plotH); ctx.lineTo(W - padR, padT + plotH);
    ctx.stroke();

    // 样品（x=0 处阴影块，带斜线填充）
    var sx0 = padL - 14, sx1 = padL;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(sx0, padT, sx1 - sx0, plotH);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx0, padT, sx1 - sx0, plotH);
    ctx.beginPath();
    for (var h = -plotH; h < plotH; h += 8) {
      ctx.moveTo(sx0, padT + plotH / 2 + h);
      ctx.lineTo(sx1, padT + plotH / 2 + h - (sx1 - sx0));
    }
    ctx.strokeStyle = '#64748b';
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText('样品', sx0 - 2, padT - 4);

    // 包络 |p(x)|（上/下对称，淡色填充，凸显节点/波腹）
    ctx.beginPath();
    for (var i = 0; i < r.pProfile.length; i++) {
      var p = r.pProfile[i];
      var px = X(p.x);
      var py = midY - (p.mag / ampMax) * halfH;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    for (var j = r.pProfile.length - 1; j >= 0; j--) {
      var p2 = r.pProfile[j];
      var px2 = X(p2.x);
      var py2 = midY + (p2.mag / ampMax) * halfH;
      ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 瞬时声压 p(x,t) = Re[(e^{-jkx}+R e^{+jkx}) e^{jωt}]
    // = (1+R)cos(kx)cos(ωt) + (1−R)sin(kx)sin(ωt)
    var omega = 2 * Math.PI * 1.2; // 视觉角频率（约 1.2 Hz 呼吸）
    var wt = omega * t0;
    ctx.beginPath();
    var steps = 360;
    for (var s = 0; s <= steps; s++) {
      var xx = (xmax * s) / steps;
      var ph = k * xx;
      var inst = (1 + R) * Math.cos(ph) * Math.cos(wt) + (1 - R) * Math.sin(ph) * Math.sin(wt);
      var yy = midY - (inst / ampMax) * halfH;
      var pxv = X(xx);
      if (s === 0) ctx.moveTo(pxv, yy); else ctx.lineTo(pxv, yy);
    }
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 零压中线
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, midY); ctx.lineTo(W - padR, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 两个传声器位置标记
    function markMic(x, label) {
      var mx = X(x);
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, padT); ctx.lineTo(mx, padT + plotH);
      ctx.stroke();
      // 当前瞬时声压点
      var ph = k * x;
      var inst = (1 + R) * Math.cos(ph) * Math.cos(wt) + (1 - R) * Math.sin(ph) * Math.sin(wt);
      var py = midY - (inst / ampMax) * halfH;
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(mx, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbcfe8';
      ctx.font = '11px sans-serif';
      ctx.fillText(label + '  x=' + num(x, 3) + ' m', Math.min(mx + 4, W - 120), padT + 12);
    }
    markMic(r.x1, 'Mic1');
    markMic(r.x2, 'Mic2');

    // 轴标注
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('← 朝样品传播 (入射)', padL + 4, padT + plotH + 16);
    ctx.fillText('x = ' + num(xmax, 3) + ' m', W - padR - 60, padT + plotH + 16);
    ctx.fillText('|p| 包络', padL + 4, padT - 4);
  }

  function loop() {
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function stopAnim() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function startAnim() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function togglePlay() {
    playing = !playing;
    var btn = $('tuPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('tuInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
  }

  function bind() {
    bindInputs();
    var play = $('tuPlay'); if (play) play.addEventListener('click', togglePlay);
    var load = $('tuLoad'); if (load) load.addEventListener('click', loadPreset);
    var reset = $('tuReset'); if (reset) reset.addEventListener('click', resetAll);
  }

  function flash(msg) {
    var el = $('tuMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('已载入例题（刚性背衬多孔样品，约 Zs=' + PRESET.Zs + ' rayl）');
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    ['Zs', 'rho', 'c', 'd', 'f', 'x1', 'x2'].forEach(function (k) {
      var el = $('tu_' + k);
      if (el) el.value = state[k];
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-tube');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>声阻抗管（两传声器法）模拟器</h2>' +
      '<p class="hint">法向入射平面波在样品面反射，形成管内驻波；两传声器测点声压经传递函数重建反射系数 R 与吸声系数 α（默认 Zs≈空气，近乎匹配）。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="tuInputs">' +
      field('Zs', '样品声阻抗 Zs', DEFAULTS.Zs, 'rayl') +
      field('rho', '空气密度 ρ', DEFAULTS.rho, 'kg/m³') +
      field('c', '声速 c', DEFAULTS.c, 'm/s') +
      field('d', '管径 d', DEFAULTS.d, 'm') +
      field('f', '频率 f', DEFAULTS.f, 'Hz') +
      field('x1', '传声器 1 距样品 x₁', DEFAULTS.x1, 'm') +
      field('x2', '传声器 2 距样品 x₂', DEFAULTS.x2, 'm') +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="tuLoad" class="btn">载入例题</button>' +
      '<button id="tuReset" class="btn ghost">重置参数</button>' +
      '<span id="tuMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 实时驻波动画</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="tuPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">黄线：瞬时声压 p(x,t)；淡蓝区域：包络 |p(x)|（节点/波腹）。R≈0 全吸收（包络平坦），|R|→1 反射强（深节点）。</span></div>' +
      '<canvas class="canvas-wrap" id="tuCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="tuResult"></div></section>' +
      '</div>' +
      '</div>';
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    recalc();
    startAnim();
    inited = true;
  }

  // 视图被切回时刷新（重算 + 继续动画）
  function onShow() {
    recalc();
    if (!rafId) startAnim();
  }

  window.SimTubeView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
