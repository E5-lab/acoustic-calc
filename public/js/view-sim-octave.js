/*
 * view-sim-octave.js — 倍频程频谱模拟视图（交互 + LIVE Canvas 动画）
 * 依赖：window.SimOctave（计算内核）
 * 约定：init() 自建全部 DOM（含 .page-head）注入 #view-sim-octave 容器，完全自包含，
 *       与既有的 noise 模块（静态 1/1 倍频程评估）互不冲突；本模块路由名 sim-octave。
 */
(function () {
  'use strict';

  var E = window.SimOctave;

  // 频带中心频率标签（显示用）
  var FREQ_LABELS = ['31.5', '63', '125', '250', '500', '1k', '2k', '4k', '8k'];
  // 默认示例谱（典型 HVAC / 工业噪声，单位 dB）
  var PRESET = [70, 68, 65, 62, 58, 55, 50, 45, 40];
  var DEFAULTS = [60, 60, 60, 60, 60, 60, 60, 60, 60];

  // dB 显示量程（地板 30，顶 90），用于把声压级映射到柱高
  var DB_FLOOR = 30;
  var DB_TOP = 90;

  var cur = null;       // 当前分析结果（供 Canvas 使用）
  var playing = true;   // 播放/暂停
  var rafId = null;
  var sweepX = 0;       // 扫描线位置（0..1 归一）
  var dispLevels = DEFAULTS.slice(); // 各柱当前显示高度（平滑过渡）
  var dispWeights = DEFAULTS.slice();

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || !isFinite(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 初始化骨架 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-octave');
    if (!root) return;

    var inputs = '';
    for (var i = 0; i < 9; i++) {
      inputs +=
        '<div class="field">' +
        '<label class="f-label">' + FREQ_LABELS[i] + ' Hz</label>' +
        '<input class="text-input" type="number" data-i="' + i + '" id="simI' + i +
        '" value="' + DEFAULTS[i] + '" min="0" max="140" step="1"></div>';
    }

    root.innerHTML =
      '<div class="page-head"><h2>倍频程频谱模拟器</h2>' +
      '<p class="hint">输入 9 个 1/1 倍频程声压级（dB），实时合成总声级并叠加 A/C/Z 计权。下方为 LIVE 动画频谱：蓝色柱为各频带声级，橙色细柱为 A 计权等效声级，扫描线自左向右循环。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 各频带声压级 Lᵢ (dB)</h3>' +
      '<div class="field-row">' + inputs + '</div>' +
      '<div class="btn-row toolbar" style="margin-top:12px">' +
      '<button id="simPreset" class="btn">载入例题</button>' +
      '<button id="simReset" class="btn ghost">重置</button>' +
      '<span id="simMsg" class="aux-msg"></span></div></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">2</span> 频谱动画</h3>' +
      '<canvas class="canvas-wrap" id="simOCanvas"></canvas>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="simPlay" class="btn">暂停</button></div>' +
      '<div class="formula">声级合成 L = 10·log₁₀( Σ 10^(Lᵢ/10) )；计权总声级 L_W = 10·log₁₀( Σ 10^((Lᵢ+Wᵢ)/10) )，W ∈ {A, C, Z}。</div>' +
      '</section>' +
      '<section class="card"><h3>合成结果</h3><div id="simStats"></div>' +
      '<div id="simNotes" class="inline-note"></div></section>' +
      '</div>' +
      '</div>';
  }

  /* ------------------------------ 绑定事件 ------------------------------ */
  function bind() {
    for (var i = 0; i < 9; i++) {
      var el = $('simI' + i);
      if (el) el.addEventListener('input', function () { recalc(); });
    }
    var p = $('simPreset'); if (p) p.addEventListener('click', loadPreset);
    var r = $('simReset'); if (r) r.addEventListener('click', reset);
    var pl = $('simPlay'); if (pl) pl.addEventListener('click', togglePlay);
  }

  function flash(msg) {
    var el = $('simMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function loadPreset() {
    for (var i = 0; i < 9; i++) {
      var el = $('simI' + i);
      if (el) el.value = PRESET[i];
    }
    recalc();
    flash('已载入 HVAC/工业典型谱例题');
  }

  function reset() {
    for (var i = 0; i < 9; i++) {
      var el = $('simI' + i);
      if (el) el.value = DEFAULTS[i];
    }
    recalc();
    flash('已重置');
  }

  function togglePlay() {
    playing = !playing;
    var btn = $('simPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var levels = [];
    var bad = false;
    for (var i = 0; i < 9; i++) {
      var el = $('simI' + i);
      var v = el ? parseFloat(el.value) : NaN;
      if (!isFinite(v)) { bad = true; v = 0; }
      levels.push(v);
    }
    var r = E.analyze(levels);
    if (!r.ok) {
      var box = $('simStats');
      if (box) box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      cur = null;
      return;
    }
    cur = r;
    renderStats(r);
  }

  function renderStats(r) {
    var box = $('simStats');
    if (!box) return;
    var stats = [
      { l: '总声级 (不加权)', v: num(r.total, 2), u: 'dB' },
      { l: 'A 计权总声级', v: num(r.totalA, 2), u: 'dB(A)' },
      { l: 'C 计权总声级', v: num(r.totalC, 2), u: 'dB(C)' },
      { l: 'Z 计权总声级', v: num(r.totalZ, 2), u: 'dB(Z)' },
      { l: '主频（峰值频带）', v: num(r.dominantFreq, 1), u: 'Hz' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';
    box.innerHTML = html;

    var n = $('simNotes');
    if (n && r.notes) {
      n.innerHTML = r.notes.map(function (x) { return '· ' + esc(x) + '<br>'; }).join('');
    }
  }

  /* ------------------------------ LIVE Canvas 动画 ------------------------------ */
  function dbToY(level, H) {
    var t = (level - DB_FLOOR) / (DB_TOP - DB_FLOOR);
    t = Math.max(0, Math.min(1, t));
    return H - t * H; // 距顶部的 y（0 在顶部）
  }

  function setupCanvas() {
    var cv = $('simOCanvas');
    if (!cv) return null;
    var dpr = window.devicePixelRatio || 1;
    var cssW = cv.clientWidth || 520;
    var cssH = 320;
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv: cv, ctx: ctx, w: cssW, h: cssH };
  }

  function draw() {
    var s = setupCanvas();
    if (!s) { rafId = requestAnimationFrame(draw); return; }
    var ctx = s.ctx, W = s.w, H = s.h;
    var padL = 34, padR = 10, padT = 16, padB = 34;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var baseY = padT + plotH;

    ctx.clearRect(0, 0, W, H);

    // 背景与网格（每 10 dB 一条横线）
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padL, padT, plotW, plotH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var g = DB_FLOOR; g <= DB_TOP; g += 10) {
      var gy = padT + dbToY(g, plotH);
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + plotW, gy);
      ctx.stroke();
      ctx.fillText(g + '', padL - 4, gy);
    }

    // 更新显示高度（平滑过渡至目标）
    if (cur && cur.ok) {
      for (var i = 0; i < 9; i++) {
        var target = cur.bands[i].level;
        var wt = cur.bands[i].level + cur.bands[i].aW; // A 计权等效
        dispLevels[i] += (target - dispLevels[i]) * 0.18;
        dispWeights[i] += (wt - dispWeights[i]) * 0.18;
      }
    }

    var n = 9;
    var slot = plotW / n;
    var bw = slot * 0.5;
    var sweepSlot = Math.floor(sweepX * n);

    for (var b = 0; b < n; b++) {
      var cx = padL + slot * (b + 0.5);
      var level = dispLevels[b];
      var wlevel = dispWeights[b];
      var h = plotH - dbToY(level, plotH);
      var hw = plotH - dbToY(wlevel, plotH);
      var x = cx - bw / 2;
      var y = baseY - h;

      // 主柱（声级）
      var lit = (b === sweepSlot) && playing;
      ctx.fillStyle = lit ? '#1d4ed8' : '#3b82f6';
      ctx.fillRect(x, y, bw, h);
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, bw, h);

      // A 计权等效（橙色细柱/帽）
      var xw = cx - bw * 0.28;
      var wbarW = bw * 0.56;
      ctx.fillStyle = 'rgba(249,115,22,0.85)';
      ctx.fillRect(xw, baseY - hw, wbarW, hw);
      ctx.strokeStyle = '#c2410c';
      ctx.strokeRect(xw, baseY - hw, wbarW, hw);

      // 频率标签
      ctx.fillStyle = '#475569';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(FREQ_LABELS[b], cx, baseY + 6);

      // 顶端 dB 数值
      ctx.fillStyle = lit ? '#1d4ed8' : '#64748b';
      ctx.textBaseline = 'bottom';
      ctx.fillText(num(level, 0), cx, y - 2);
    }

    // 扫描线
    if (playing) {
      var sx = padL + sweepX * plotW;
      ctx.strokeStyle = 'rgba(220,38,38,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, padT);
      ctx.lineTo(sx, baseY);
      ctx.stroke();
    }

    // 推进扫描（循环）
    if (playing) {
      sweepX += 0.006;
      if (sweepX > 1) sweepX = 0;
    }

    rafId = requestAnimationFrame(draw);
  }

  /* ------------------------------ 入口 ------------------------------ */
  function init() {
    buildSkeleton();
    bind();
    recalc();
    if (rafId == null) draw();
  }

  function onShow() {
    recalc();
  }

  window.SimOctaveView = { init: init, onShow: onShow };
})();
