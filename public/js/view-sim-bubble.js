/*
 * view-sim-bubble.js — 水下气泡共鸣（Minnaert）模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimBubble（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-bubble" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimBubble;

  var DEFAULTS = {
    rMm: 1,         // 气泡半径 mm
    gamma: 1.4,     // 多方指数 γ
    P0kPa: 101.325, // 环境压力 kPa（1 标准大气压）
    Q: 10,          // 品质因数
    c: 1481         // 水中声速 m/s
  };

  // 载入例题：0.5 mm 空气泡 + 常压水（f₀ ≈ 6.6 kHz）
  var PRESET = { rMm: 0.5, gamma: 1.4, P0kPa: 101.325, Q: 10, c: 1481 };

  var KEYS = ['rMm', 'gamma', 'P0kPa', 'Q', 'c'];

  var state = Object.assign({}, DEFAULTS);
  var last = null;    // 最近一次成功的 simulate 结果
  var inited = false;
  var playing = true; // 播放/暂停（动画仅在播放时推进）
  var rafId = null;
  var t0 = 0;         // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;
  var anim = { fVis: 1.2 }; // 视觉脉动频率 Hz（由真实 f₀ 对数映射，真实值无法直接观察）

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="bu_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="bu_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.simulate({
      rMm: state.rMm,
      gamma: state.gamma,
      P0: state.P0kPa * 1000, // kPa → Pa
      rho: 1000,
      c: state.c,
      Q: state.Q
    });
    last = r.ok ? r : null;
    computeAnim(r);
    renderResult(r);
    if (!r.ok) {
      stopAnim(); // 参数无效：显示错误并停掉动画
    } else if (playing && !rafId) {
      startAnim();
    }
  }

  // 真实 f₀（约 330 Hz–33 kHz）无法直接观察，按对数映射到 0.6–2.0 Hz 的视觉脉动频率
  function computeAnim(r) {
    if (!r || !r.ok) return;
    var t = (Math.log(r.f0) - Math.log(300)) / (Math.log(33000) - Math.log(300));
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    anim.fVis = 0.6 + 1.4 * t;
  }

  function renderResult(r) {
    var box = $('buResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var stats = [
      { l: '共鸣频率 f₀', v: num(r.f0, 0), u: 'Hz' },
      { l: '气泡直径 2r', v: num(r.diameterMm, 2), u: 'mm' },
      { l: '水中波长 λ=c/f₀', v: num(r.lambda, 3), u: 'm' },
      { l: '带宽 Δf=f₀/Q', v: num(r.df, 1), u: 'Hz' },
      { l: '半功率点 f₁', v: num(r.f1, 0), u: 'Hz' },
      { l: '半功率点 f₂', v: num(r.f2, 0), u: 'Hz' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">f₀ = (1/2πr)·√(3γP₀/ρ) = ' + num(r.f0, 1) + ' Hz</span>' +
      '（r = ' + num(r.rMm, 2) + ' mm，γ = ' + num(r.gamma, 2) + '，P₀ = ' + num(r.P0 / 1000, 2) + ' kPa，ρ = ' + num(r.rho, 0) + ' kg/m³）</div>' +
      '<div><span class="fx">λ = c/f₀ = ' + num(r.lambda, 3) + ' m</span>（c = ' + num(r.c, 0) + ' m/s）；' +
      '<span class="fx">Δf = f₀/Q = ' + num(r.df, 1) + ' Hz</span>（Q = ' + num(r.Q, 1) + '）</div>' +
      '<div>半功率点：<span class="fx">f₁ = f₀(1−1/2Q) = ' + num(r.f1, 0) + ' Hz</span>；' +
      '<span class="fx">f₂ = f₀(1+1/2Q) = ' + num(r.f2, 0) + ' Hz</span></div>' +
      '</div>';

    html += '<ul class="inline-note" style="margin-top:10px">';
    r.notes.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul>';

    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setup(id, cssH) {
    var cv = $(id);
    if (!cv) return null;
    DPR = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var cssW = rect.width || 640;
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    var ctx = cv.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function drawBg(ctx, W, H) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
  }

  function drawInvalid(ctx, W, H) {
    drawBg(ctx, W, H);
    ctx.fillStyle = '#f87171';
    ctx.font = '14px sans-serif';
    ctx.fillText('参数无效，无法绘制。', 16, H / 2);
  }

  // 主画布：中央气泡 + 视觉放大的半径脉动 + 单极子辐射圆环 + 底部实时波形
  function drawBubble(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var cx = W / 2, cy = H * 0.38;
    var R0 = Math.min(W, H) * 0.15;
    var pulse = Math.sin(2 * Math.PI * anim.fVis * t0);
    var Rb = R0 * (1 + 0.18 * pulse); // 视觉放大的脉动半径

    // 辐射圆环（气泡作为单极子声源向外辐射声波；环半径随时间扩散、透明度随距离衰减）
    var maxRing = Math.min(W, H) * 0.42;
    for (var i = 0; i < 6; i++) {
      var ph = (t0 * anim.fVis + i / 6) % 1;
      var rr = Rb + ph * maxRing;
      ctx.strokeStyle = 'rgba(56,189,248,' + (0.5 * (1 - ph)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 气泡本体
    ctx.fillStyle = 'rgba(56,189,248,0.20)';
    ctx.beginPath();
    ctx.arc(cx, cy, Rb, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Rb, 0, Math.PI * 2);
    ctx.stroke();

    // 标注
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px sans-serif';
    ctx.fillText('气泡共鸣（视觉放大）', cx, cy - Rb - 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('r = ' + num(r.rMm, 2) + ' mm；真实 f₀ = ' + num(r.f0, 0) + ' Hz（过快/过慢，画面按视觉频率放缩）', 14, 18);
    ctx.fillText('单极子辐射：圆环自气泡向外扩散并衰减', 14, 34);

    // 底部实时波形（视觉时间轴）
    var y0 = H - 28, A = 13, waveLen = 150;
    ctx.strokeStyle = 'rgba(148,163,184,0.30)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, y0);
    ctx.lineTo(W - 16, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var x = 16; x <= W - 16; x += 2) {
      var yy = y0 - A * Math.sin(2 * Math.PI * anim.fVis * t0 - (2 * Math.PI * (x - 16)) / waveLen);
      if (x === 16) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('实时波形（视觉时间轴，非真实 f₀）', 16, H - 8);
  }

  function fmtFreq(f) {
    return f >= 1000 ? num(f / 1000, f >= 10000 ? 0 : 1) + ' kHz' : num(f, 0) + ' Hz';
  }

  // 扫频曲线：log-f 横轴 20 Hz–100 kHz，H(f) 曲线 + f₀ 峰位 + 半功率带 + 播放扫描标记
  function drawSweep(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var padL = 54, padR = 16, padT = 24, padB = 36;
    var pw = W - padL - padR, ph = H - padT - padB;
    var lo = Math.log(E.F_MIN), hi = Math.log(E.F_MAX);
    function X(f) { return padL + ((Math.log(f) - lo) / (hi - lo)) * pw; }
    var hMax = 1.08;
    function Y(h) { return padT + ph * (1 - h / hMax); }

    ctx.font = '11px sans-serif';

    // 半功率带 f1–f2（阴影）
    ctx.fillStyle = 'rgba(251,191,36,0.10)';
    ctx.fillRect(X(r.f1), padT, X(r.f2) - X(r.f1), ph);

    // 对数频率网格（十进位刻度）
    [100, 1000, 10000].forEach(function (f) {
      var x = X(f);
      ctx.strokeStyle = 'rgba(148,163,184,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ph);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(fmtFreq(f), x, padT + ph + 14);
    });

    // H 刻度（0 / 0.5 / 1）
    ctx.textAlign = 'right';
    [0, 0.5, 1].forEach(function (h) {
      var y = Y(h);
      ctx.strokeStyle = 'rgba(148,163,184,0.20)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + pw, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(num(h, 1), padL - 6, y + 4);
    });
    ctx.textAlign = 'left';

    // 曲线 H(f)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < r.curve.length; i++) {
      var p = r.curve[i];
      var px = X(p.f), py = Y(p.H);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // f₀ 峰位与半功率点
    function vline(f, color, dash) {
      var x = X(f);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      return x;
    }
    var x1 = vline(r.f1, 'rgba(251,191,36,0.7)', [4, 4]);
    var x2 = vline(r.f2, 'rgba(251,191,36,0.7)', [4, 4]);
    var x0 = vline(r.f0, '#fbbf24', []);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(x0, Y(1), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillText('f₀', Math.max(padL + 10, Math.min(x0, padL + pw - 10)), padT - 8);
    if (x2 - x1 > 56) ctx.fillText('Δf=f₀/Q', (x1 + x2) / 2, padT - 8);
    ctx.textAlign = 'left';

    // 轴标题与读数
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('H(f)', 8, padT - 8);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('峰值 f₀ = ' + num(r.f0, 0) + ' Hz；Δf = ' + num(r.df, 1) + ' Hz', padL, H - 8);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('频率（Hz，对数刻度）', padL + pw, H - 8);
    ctx.textAlign = 'left';

    // 播放时的扫描标记（沿曲线移动；暂停时冻结）
    if (playing) {
      var pos = (t0 / 6) % 1;
      var f = E.F_MIN * Math.pow(E.F_MAX / E.F_MIN, pos);
      var hv = E.resonanceResponse(f, r.f0, r.Q);
      var mx = X(f), my = Y(hv);
      ctx.strokeStyle = 'rgba(226,232,240,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, padT);
      ctx.lineTo(mx, padT + ph);
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    var s1 = setup('buCanvas', 320);
    if (s1) {
      if (last && last.ok) drawBubble(s1.ctx, s1.w, s1.h, last);
      else drawInvalid(s1.ctx, s1.w, s1.h);
    }
    var s2 = setup('buSweep', 300);
    if (s2) {
      if (last && last.ok) drawSweep(s2.ctx, s2.w, s2.h, last);
      else drawInvalid(s2.ctx, s2.w, s2.h);
    }
  }

  function loop() {
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间（仅播放时推进）
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
    var btn = $('buPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
    if (playing && !rafId) startAnim();
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('buInputs');
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
    var play = $('buPlay'); if (play) play.addEventListener('click', togglePlay);
    var load = $('buLoad'); if (load) load.addEventListener('click', loadPreset);
    var reset = $('buReset'); if (reset) reset.addEventListener('click', resetAll);
  }

  function flash(msg) {
    var el = $('buMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('已载入例题（0.5 mm 空气泡，常压水）');
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    KEYS.forEach(function (k) {
      var el = $('bu_' + k);
      if (el) el.value = state[k];
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-bubble');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>水下气泡共鸣（Minnaert）模拟器</h2>' +
      '<p class="hint">水中自由气泡在声压激励下发生单极子共鸣：f₀ = (1/2πr)·√(3γP₀/ρ) ∝ 1/r，小气泡高频、大气泡低频；左侧实时显示气泡脉动（视觉放大）与单极子辐射，右侧为 Lorentz 扫频响应 H(f)。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="buInputs">' +
      field('rMm', '气泡半径 r', DEFAULTS.rMm, 'mm', 0.1, 0.1) +
      field('gamma', '多方指数 γ', DEFAULTS.gamma, '', 1, 0.01) +
      field('P0kPa', '环境压力 P₀', DEFAULTS.P0kPa, 'kPa', 50, 0.5) +
      field('Q', '品质因数 Q', DEFAULTS.Q, '', 2, 1) +
      field('c', '水中声速 c', DEFAULTS.c, 'm/s', 1400, 1) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="buLoad" class="btn">载入例题</button>' +
      '<button id="buReset" class="btn ghost">重置参数</button>' +
      '<span id="buMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 实时共鸣动画</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="buPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">半径脉动为视觉放大（真实 f₀ 约 330 Hz–33 kHz，无法直接观察）；圆环表示气泡作为单极子声源向外辐射声波，颜色/透明度随距离衰减；黄线为视觉时间轴上的实时波形。</span></div>' +
      '<canvas class="canvas-wrap" id="buCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="buResult"></div></section>' +
      '<section class="card"><h3>扫频响应曲线 H(f)</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<span class="aux-msg">对数频率轴 20 Hz–100 kHz；H(f) = 1/√(1 + [2Q(f−f₀)/f₀]²)，峰值 1 @ f₀，半功率带 f₁–f₂（Δf = f₀/Q）；播放时白色标记沿曲线扫描。</span></div>' +
      '<canvas class="canvas-wrap" id="buSweep"></canvas></section>' +
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

  window.SimBubbleView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
