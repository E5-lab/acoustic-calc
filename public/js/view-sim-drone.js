/*
 * view-sim-drone.js — 无人机噪声模拟器视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimDrone（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-drone" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimDrone;

  var DEFAULTS = { rpm: 3000, blades: 2, Lw: 95, r: 10, c: 343 };
  // 载入例题：小型四旋翼悬停工况
  var PRESET = { rpm: 4200, blades: 2, Lw: 90, r: 7, c: 343 };

  var root = null;
  var canvas = null, ctx = null;
  var W = 600, H = 360, dpr = 1;
  var state = Object.assign({}, DEFAULTS);
  var current = null;
  var playing = true;

  // 动画状态
  var angle = 0;          // 旋翼旋转角
  var waves = [];         // 声波波前 {r}
  var lastT = 0;
  var spawnAcc = 0;

  // 几何布局
  var droneX = 80, cy = 180, obsX = 300, scale = 5, maxRpx = 400;
  var RMAX_M = 50;        // 动画中 r 的可视化上限（米）

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* ------------------------------ 骨架 DOM ------------------------------ */
  function field(k, label, val, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" data-k="' + k + '" value="' + val + '" step="any"></div>';
  }

  function slider(k, label, val, min, max, step, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="range" data-k="' + k + '" value="' + val +
      '" min="' + min + '" max="' + max + '" step="' + step + '">' +
      '<span class="aux-msg" id="dr_' + k + '">' + Number(val).toFixed(1) + ' ' + esc(unit || '') + '</span></div>';
  }

  function buildSkeleton() {
    root = $('view-sim-drone');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>无人机噪声模拟器</h2>' +
      '<p class="hint">基于叶桨通过频率（BPF）的旋翼音调噪声简化模型：旋转基频 + 谐波 + 宽带底噪，含实时 Canvas 动画（无人机旋翼旋转、声波波前向外辐射、观测点随距离衰减）。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3>输入参数</h3>' +
      '<div class="field-row">' +
      field('rpm', '旋翼转速 rpm', state.rpm, 'r/min') +
      field('blades', '桨叶数 B', state.blades, '') +
      field('Lw', '声功率级 Lw', state.Lw, 'dB') +
      field('c', '声速 c', state.c, 'm/s') +
      '</div>' +
      '<div class="field-row" style="margin-top:8px">' +
      slider('r', '观测距离 r', state.r, 1, 50, 0.5, 'm') +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="drPreset" class="btn">载入例题</button>' +
      '<button id="drReset" class="btn ghost">重置参数</button>' +
      '<button id="drToggle" class="btn">暂停</button>' +
      '<span id="drMsg" class="aux-msg"></span></div>' +
      '</section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>声波传播动画</h3>' +
      '<canvas class="canvas-wrap" id="drCanvas"></canvas>' +
      '<p class="inline-note">无人机位于左侧，蓝色同心圆为向外辐射的声波波前；右侧红点为观测者，r 越大波前到达时的振幅越小（对应声压级下降）。</p>' +
      '</section>' +
      '<section class="card"><h3>计算结果</h3>' +
      '<div class="stat-grid" id="drStats"></div>' +
      '<div class="formula" id="drFormula"></div>' +
      '<p class="inline-note">真实无人机还叠加了宽带湍流噪声，本模型已用 Lw−30 的宽带底噪近似；球面扩展模型未计入地面反射与大气吸收。</p>' +
      '</section>' +
      '</div>' +
      '</div>';
  }

  /* ------------------------------ 计算与渲染 ------------------------------ */
  function recalc() {
    current = E.analyze(state);
    if (!current.ok) {
      var s = $('drStats');
      if (s) s.innerHTML = '<div class="callout-row error">' + esc(current.error) + '</div>';
      var f = $('drFormula');
      if (f) f.innerHTML = '';
      return;
    }
    renderStats(current);
    renderFormula(current);
  }

  function renderStats(r) {
    var box = $('drStats');
    if (!box) return;
    var stats = [
      { l: '叶桨通过频率 BPF', v: num(r.BPF, 1), u: 'Hz' },
      { l: '观测距离 r', v: num(state.r, 1), u: 'm' },
      { l: '声压级 Lp@r', v: num(r.Lp, 1), u: 'dB' },
      { l: 'A 计权声压级', v: num(r.AWeighted, 1), u: 'dB(A)' }
    ];
    var html = '';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    box.innerHTML = html;
  }

  function renderFormula(r) {
    var box = $('drFormula');
    if (!box) return;
    var BPF = r.BPF;
    var Lp = r.Lp;
    box.innerHTML =
      '<div class="fx">BPF = (rpm/60)·B = (' + num(state.rpm, 0) + '/60)·' + num(state.blades, 0) + ' = ' + num(BPF, 1) + ' Hz</div>' +
      '<div class="fx">Lp = Lw − 20·log₁₀(r) − 11 = ' + num(state.Lw, 0) + ' − 20·log₁₀(' + num(state.r, 1) + ') − 11 = ' + num(Lp, 2) + ' dB</div>' +
      '<div class="fx">谐波序列：' + r.harmonics.map(function (h) { return num(h.f, 0) + 'Hz(' + h.rel + 'dB)'; }).join('，') + '</div>' +
      '<div class="fx">A计权 = 10·log₁₀(Σ 10^((Lpᵢ+Aᵢ)/10)) = ' + num(r.AWeighted, 2) + ' dB(A)</div>';
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(320, Math.round(rect.width) || canvas.clientWidth || 600);
    H = 360;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    droneX = 80;
    cy = H / 2;
    var stripX = W - 110;          // 右侧频谱条起始 x
    maxRpx = stripX - droneX - 20; // 波前最大传播像素半径
    scale = maxRpx / RMAX_M;       // 像素/米
    var rClamped = clamp(state.r, 0.5, RMAX_M);
    obsX = droneX + 20 + rClamped * scale;
  }

  function frame(ts) {
    if (!lastT) lastT = ts;
    var dt = Math.min(0.05, (ts - lastT) / 1000);
    lastT = ts;

    if (playing) {
      // 旋翼转速 ∝ rpm（视觉速度，非线性放大以便观察）
      angle += (state.rpm / 600) * dt * Math.PI * 2;
      // 周期性生成新波前
      spawnAcc += dt;
      var spawnEvery = 0.5;
      if (spawnAcc >= spawnEvery) { spawnAcc -= spawnEvery; waves.push({ r: 0 }); }
      // 推进波前
      for (var i = waves.length - 1; i >= 0; i--) {
        waves[i].r += (50 + state.rpm / 120) * dt;
        if (waves[i].r > maxRpx) waves.splice(i, 1);
      }
    }
    draw(ts || 0);
    requestAnimationFrame(frame);
  }

  function draw(ts) {
    if (!ctx) return;
    layout();
    ctx.clearRect(0, 0, W, H);

    // 背景：开阔空气渐变
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#eaf2fb');
    g.addColorStop(1, '#d7e6f6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 传播路径（虚线）
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(51,65,85,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(droneX, cy);
    ctx.lineTo(obsX, cy);
    ctx.stroke();
    ctx.restore();

    // 当前声压级 → 振幅可视因子
    var Lp = (current && current.ok) ? current.Lp : 64;
    var amp = clamp((Lp - 35) / 60, 0.08, 1);

    // 声波波前（同心圆）
    waves.forEach(function (w) {
      var a = amp * (1 - w.r / maxRpx) * 0.7;
      if (a <= 0.02) return;
      ctx.beginPath();
      ctx.arc(droneX, cy, w.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(37,99,235,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    drawDrone();
    drawObserver(ts, amp);
    drawSpectrum();
  }

  function drawDrone() {
    // 机身
    ctx.fillStyle = '#334155';
    roundRect(droneX - 18, cy - 6, 36, 16, 5);
    ctx.fill();
    // 两支旋翼臂
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(droneX - 14, cy - 4); ctx.lineTo(droneX - 14, cy - 30);
    ctx.moveTo(droneX + 14, cy - 4); ctx.lineTo(droneX + 14, cy - 30);
    ctx.stroke();
    // 两个旋转旋翼盘（椭圆 + 旋转辐条）
    drawRotor(droneX - 14, cy - 32, angle);
    drawRotor(droneX + 14, cy - 32, angle + Math.PI / 3);
  }

  function drawRotor(x, y, ang) {
    // 旋翼盘（半透明椭圆）
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 旋转辐条
    ctx.strokeStyle = 'rgba(71,85,105,0.9)';
    ctx.lineWidth = 2;
    for (var k = 0; k < 2; k++) {
      var a = ang + k * Math.PI;
      ctx.beginPath();
      ctx.moveTo(-22 * Math.cos(a), -6 * Math.sin(a));
      ctx.lineTo(22 * Math.cos(a), 6 * Math.sin(a));
      ctx.stroke();
    }
    // 桨毂
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawObserver(ts, amp) {
    var pulse = 6 + 10 * amp + 3 * Math.sin((ts || 0) / 300);
    // 接收振幅环（随 Lp 大小脉动）
    ctx.beginPath();
    ctx.arc(obsX, cy, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(225,29,72,' + (0.25 + 0.5 * amp).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 观测者（红点 + 身体）
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(obsX, cy - 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(obsX, cy - 2); ctx.lineTo(obsX, cy + 10);
    ctx.moveTo(obsX - 5, cy + 4); ctx.lineTo(obsX + 5, cy + 4);
    ctx.stroke();

    // 标注
    var txt = 'r = ' + num(state.r, 1) + ' m';
    if (current && current.ok) txt += '  Lp = ' + num(current.Lp, 1) + ' dB';
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(txt, obsX, cy + 26);
  }

  function drawSpectrum() {
    if (!current || !current.ok) return;
    var stripX = W - 100;
    var baseY = H - 24;
    var maxBar = H - 80;
    // 标题
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('频谱（音调线）', stripX, 20);
    // 基线
    ctx.strokeStyle = 'rgba(51,65,85,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(stripX - 4, baseY);
    ctx.lineTo(stripX + 84, baseY);
    ctx.stroke();
    // 音调柱
    var tones = current.spectrum.filter(function (s) { return s.kind === 'tone'; });
    var bw = 16, gap = 4;
    tones.forEach(function (t, i) {
      var x = stripX + i * (bw + gap);
      var h = clamp((t.L - (state.Lw - 30)) / 30, 0.06, 1) * maxBar;
      var g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
      g.addColorStop(0, '#2563eb');
      g.addColorStop(1, '#93c5fd');
      ctx.fillStyle = g;
      ctx.fillRect(x, baseY - h, bw, h);
      ctx.fillStyle = '#334155';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.n + '×', x + bw / 2, baseY + 12);
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ------------------------------ 交互 ------------------------------ */
  function flash(msg) {
    var el = $('drMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function syncInputs() {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-k]'), function (el) {
      var k = el.getAttribute('data-k');
      if (state[k] != null) el.value = state[k];
    });
    var lbl = $('dr_r');
    if (lbl) lbl.textContent = Number(state.r).toFixed(1) + ' m';
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('已载入例题（小型四旋翼悬停工况）');
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function togglePlay() {
    playing = !playing;
    var t = $('drToggle');
    if (t) t.textContent = playing ? '暂停' : '播放';
  }

  function bind() {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        if (isNaN(v)) return;
        state[k] = v;
        if (k === 'r') { var lbl = $('dr_r'); if (lbl) lbl.textContent = v.toFixed(1) + ' m'; }
        recalc();
      });
    });
    var p = $('drPreset'); if (p) p.addEventListener('click', loadPreset);
    var r = $('drReset'); if (r) r.addEventListener('click', reset);
    var t = $('drToggle'); if (t) t.addEventListener('click', togglePlay);
    window.addEventListener('resize', resize);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function init() {
    buildSkeleton();
    canvas = $('drCanvas');
    if (canvas) { ctx = canvas.getContext('2d'); resize(); }
    bind();
    recalc();
    requestAnimationFrame(frame);
  }

  function onShow() {
    recalc();
  }

  window.SimDroneView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
