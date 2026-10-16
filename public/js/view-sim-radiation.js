/*
 * view-sim-radiation.js — 声源辐射指向性模拟器视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimRadiation（计算内核）
 * 约定：init() 时自建全部 DOM（含 .page-head）注入到 #view-sim-radiation，
 *       仅复用既有公共 CSS 类，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimRadiation;

  var DEFAULTS = {
    mode: 'monopole', // 辐射模式：monopole / dipole / quadrupole
    thetaP: 0,        // 探测方向角 θp（deg，0–180，自极轴起算）
    f: 1000,          // 频率 Hz（同时控制动画快慢）
    r: 2,             // 探测距离 m
    c: 343            // 声速 m/s
  };

  var MODE_LABELS = { monopole: '单极子', dipole: '偶极子', quadrupole: '四极子' };

  var state = Object.assign({}, DEFAULTS);
  var last = null;       // 最近一次计算结果
  var inited = false;
  var playing = true;    // 播放/暂停
  var rafId = null;
  var t0 = 0;            // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  // 带符号方向因子（画波形相位用：偶极子 θp>90°、四极子越过零点后反相）
  function signedD(mode, thetaDeg) {
    var rad = (Number(thetaDeg) || 0) * Math.PI / 180;
    if (mode === 'dipole') return Math.cos(rad);
    if (mode === 'quadrupole') return Math.cos(2 * rad);
    return 1;
  }

  /* ------------------------------ 字段 ------------------------------ */
  function sliderField(id, k, label, val, min, max, step, unit) {
    return '<div class="field"><label class="f-label" for="' + id + '">' + esc(label) +
      ' <span class="unit-tag">' + esc(unit) + '</span></label>' +
      '<input class="text-input" type="range" id="' + id + '" data-k="' + k +
      '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function compute() {
    var D = E.pattern(state.mode, state.thetaP);
    if (D && D.ok === false) return { ok: false, error: D.error };
    var DI = E.directivityIndex(state.mode);
    if (DI && DI.ok === false) return { ok: false, error: DI.error };
    var ratio = E.probePressure(state.thetaP, state.r, state.f, state.c, t0, state.mode);
    if (ratio && ratio.ok === false) return { ok: false, error: ratio.error };
    return {
      ok: true,
      mode: state.mode,
      D: D,
      DI: DI,
      ratio: ratio,
      lambda: state.c / state.f,
      k: (2 * Math.PI * state.f) / state.c
    };
  }

  function recalc() {
    var r = compute();
    last = r.ok ? r : null;
    renderResult(r);
    renderModes();
    updateVals();
    if (r.ok) { if (!rafId) startAnim(); }
    else stopAnim();
  }

  function renderResult(r) {
    var box = $('srResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var stats = [
      { l: '辐射模式', v: esc(MODE_LABELS[r.mode] || r.mode), u: '' },
      { l: 'D(θp)', v: num(r.D, 4), u: '' },
      { l: '指向性指数 DI', v: num(r.DI, 2), u: 'dB' },
      { l: '波长 λ = c/f', v: num(r.lambda, 3), u: 'm' },
      { l: '探测点相对幅值 D(θp)/r', v: num(r.ratio, 4), u: '1/m' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + s.l + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';

    html += '<div class="formula">' +
      '<div><span class="fx">D_mono = 1</span>；<span class="fx">D_dipole = |cosθ|</span>；<span class="fx">D_quad = |cos2θ|</span></div>' +
      '<div><span class="fx">p(r,θ,t) = A·D(θ)·sin(2πft − kr)/r</span>；<span class="fx">k = 2π/λ</span>，<span class="fx">λ = c/f</span></div>' +
      '<div><span class="fx">DI = 10·lg(4π/∮D²dΩ)</span>；当前 <span class="fx">λ = ' + num(r.lambda, 3) + ' m</span>，' +
      '<span class="fx">k = ' + num(r.k, 2) + ' m⁻¹</span>，<span class="fx">kr = ' + num(r.k * state.r, 2) + ' rad</span></div>' +
      '</div>';

    box.innerHTML = html;
  }

  function renderModes() {
    ['monopole', 'dipole', 'quadrupole'].forEach(function (m) {
      var btn = $('srMode' + m.charAt(0).toUpperCase() + m.slice(1));
      if (btn) btn.classList.toggle('primary', state.mode === m);
    });
  }

  function updateVals() {
    var el = $('srVals');
    if (!el) return;
    el.textContent = '当前：θp = ' + state.thetaP + '°，f = ' + state.f +
      ' Hz，r = ' + num(state.r, 1) + ' m，c = ' + state.c + ' m/s';
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setupCanvas(id, cssH) {
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

  function drawInvalid(ctx, W, H) {
    ctx.fillStyle = '#f87171';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('参数无效，无法绘制。', 16, H / 2);
  }

  // 极坐标指向图：D(θ) 曲线 + 受 D(θ) 调制的扩散波前 + 探测方向线
  function drawPolar() {
    var s = setupCanvas('srPolar', 400);
    if (!s) return;
    var ctx = s.ctx, W = s.w, H = s.h;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if (!last || !last.ok) { drawInvalid(ctx, W, H); return; }

    var cx = W / 2, cy = H / 2 + 4;
    var Rmax = Math.min(W / 2, H / 2) - 36;

    // 极坐标网格：同心圆 + 每 30° 辐射线（含角度标注）
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(function (fr) {
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, Rmax * fr, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var a = 0; a <= 180; a += 30) {
      var rad = (a * Math.PI) / 180;
      ctx.strokeStyle = a === 90 ? 'rgba(148,163,184,0.38)' : 'rgba(148,163,184,0.16)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Rmax * Math.cos(rad), cy - Rmax * Math.sin(rad));
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(a + '°', cx + (Rmax + 16) * Math.cos(rad), cy - (Rmax + 16) * Math.sin(rad));
    }

    // 受 D(θ) 调制的扩散波前：强方向伸得远、弱方向伸得近，随时间呼吸
    var speed = 0.3 + 0.9 * (Math.log(state.f / 50) / Math.log(100));
    var breath = 1 + 0.1 * Math.sin(2 * Math.PI * t0 * 1.2);
    for (var kk = 0; kk < 3; kk++) {
      var phi = (t0 * speed - kk / 3) % 1;
      if (phi < 0) phi += 1;
      if (phi <= 0.03 || phi >= 0.995) continue;
      var alpha = Math.sin(Math.PI * phi) * 0.5;
      var base = Rmax * (0.06 + 0.94 * phi);
      ctx.beginPath();
      for (var th = 0; th <= 360; th += 3) {
        var t2 = th <= 180 ? th : 360 - th;
        var Dv = Math.abs(signedD(state.mode, t2));
        var rr = base * (0.22 + 0.78 * Dv * breath);
        var px = cx + rr * Math.cos((th * Math.PI) / 180);
        var py = cy - rr * Math.sin((th * Math.PI) / 180);
        if (th === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(56,189,248,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // D(θ) 曲线（径向 = D；粉色为反相瓣，过零点即相位反转）
    var pos = [], neg = [];
    for (var th2 = 0; th2 <= 360; th2 += 2) {
      var tt = th2 <= 180 ? th2 : 360 - th2;
      var sg = signedD(state.mode, tt);
      var D2 = Math.abs(sg);
      var pxx = cx + Rmax * D2 * Math.cos((th2 * Math.PI) / 180);
      var pyy = cy - Rmax * D2 * Math.sin((th2 * Math.PI) / 180);
      (sg >= 0 ? pos : neg).push([pxx, pyy]);
    }
    function strokePts(pts, color) {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
    strokePts(pos, '#38bdf8');
    strokePts(neg, '#f472b6');

    // 探测方向线 + 端点标记（端点落在 R·D(θp) 处）
    var radp = (state.thetaP * Math.PI) / 180;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Rmax * Math.cos(radp), cy - Rmax * Math.sin(radp));
    ctx.stroke();
    ctx.setLineDash([]);
    var pr = Rmax * last.D;
    var dx = cx + pr * Math.cos(radp), dy = cy - pr * Math.sin(radp);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    var right = Math.cos(radp) >= 0;
    ctx.fillStyle = '#fde68a';
    ctx.font = '11px sans-serif';
    ctx.textAlign = right ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    var lx = Math.max(58, Math.min(W - 58, dx + (right ? 8 : -8)));
    ctx.fillText('θp = ' + state.thetaP + '°', lx, dy - 8);

    // 声源（原点）
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 图注
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('极坐标：径向 = D(θ)（0–1），角度 θ 自极轴（0°，主方向）起算', cx, H - 8);
  }

  // 探测点时域波形：p(t) = D(θp)·sin(2πft − kr)/r（3 个周期，振幅 ∝ D/r）
  function drawWave() {
    var s = setupCanvas('srWave', 220);
    if (!s) return;
    var ctx = s.ctx, W = s.w, H = s.h;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if (!last || !last.ok) { drawInvalid(ctx, W, H); return; }

    var padL = 46, padR = 16, padT = 18, padB = 36;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var midY = padT + plotH / 2;
    var halfH = plotH / 2 - 4;

    var f = state.f, k = last.k, r = state.r;
    var T = 1 / f;
    var sign = signedD(state.mode, state.thetaP) >= 0 ? 1 : -1;
    var amp = (last.ratio / Math.max(1, last.ratio)) * halfH * 0.9;
    var visRate = 0.4 + 2.2 * (Math.log(f / 50) / Math.log(100)); // f 控制动画快慢
    var phase = 2 * Math.PI * visRate * t0 - k * r;

    // 周期网格与标注（0 / T / 2T / 3T）
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var i = 0; i <= 3; i++) {
      var gx = padL + (plotW * i) / 3;
      ctx.strokeStyle = 'rgba(148,163,184,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, padT);
      ctx.lineTo(gx, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(i === 0 ? '0' : i + 'T', gx, padT + plotH + 5);
    }

    // 零线
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, midY);
    ctx.lineTo(W - padR, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 振幅包络 ±D/r
    if (amp > 1) {
      ctx.strokeStyle = 'rgba(251,191,36,0.30)';
      ctx.setLineDash([3, 5]);
      [midY - amp, midY + amp].forEach(function (yy) {
        ctx.beginPath();
        ctx.moveTo(padL, yy);
        ctx.lineTo(W - padR, yy);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // 波形 p(τ) = sign·(D/r)·sin(2πf·τ − kr + ω·t0)，τ ∈ [0, 3T]
    ctx.beginPath();
    var steps = 720;
    for (var j = 0; j <= steps; j++) {
      var tau = (3 * T * j) / steps;
      var yy2 = midY - amp * sign * Math.sin(2 * Math.PI * f * tau + phase);
      var xx = padL + (plotW * j) / steps;
      if (j === 0) ctx.moveTo(xx, yy2); else ctx.lineTo(xx, yy2);
    }
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 当前时刻点（τ = 0）
    var yNow = midY - amp * sign * Math.sin(phase);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(padL, yNow, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('当前', padL + 7, yNow - 9);

    // 轴说明与图注
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('p（相对）', padL - 5, padT + 2);
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('p(t) = D(θp)·sin(2πft − kr)/r，显示 3 个周期（T = 1/f = ' + (T * 1000).toFixed(2) +
      ' ms）；振幅 ∝ D(θp)/r = ' + num(last.ratio, 3) + ' 1/m', W / 2, H - 6);
  }

  function loop() {
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间
    }
    drawPolar();
    drawWave();
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
    var btn = $('srPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('#view-sim-radiation [data-mode]'), function (btn) {
      btn.addEventListener('click', function () {
        state.mode = btn.getAttribute('data-mode');
        recalc();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#view-sim-radiation [data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
    var play = $('srPlay'); if (play) play.addEventListener('click', togglePlay);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-radiation');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>声源辐射指向性模拟器</h2>' +
      '<p class="hint">单极子 / 偶极子 / 四极子的远场辐射指向性：极坐标 D(θ) 图样、受指向性调制的径向扩散动画与探测点时域波形。θ 为自极轴（声源主方向）起算的角度（0–180°），D(θ) 归一到最大 1。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 辐射模式</h3>' +
      '<div class="btn-row">' +
      '<button id="srModeMonopole" class="btn" data-mode="monopole">单极子</button>' +
      '<button id="srModeDipole" class="btn" data-mode="dipole">偶极子</button>' +
      '<button id="srModeQuadrupole" class="btn" data-mode="quadrupole">四极子</button>' +
      '</div>' +
      '<p class="inline-note">单极子全指向；偶极子 "8" 字形两瓣反相；四极子四叶草。高亮按钮为当前模式。</p></section>' +
      '<section class="card"><h3><span class="step">2</span> 参数</h3>' +
      '<div class="field-row">' +
      sliderField('srTheta', 'thetaP', '探测方向角 θp', state.thetaP, 0, 180, 1, '°') +
      sliderField('srF', 'f', '频率 f（控制动画快慢）', state.f, 50, 5000, 10, 'Hz') +
      sliderField('srR', 'r', '探测距离 r', state.r, 0.5, 10, 0.1, 'm') +
      sliderField('srC', 'c', '声速 c', state.c, 300, 400, 1, 'm/s') +
      '</div>' +
      '<p class="inline-note" id="srVals"></p></section>' +
      '<section class="card"><h3><span class="step">3</span> 播放控制</h3>' +
      '<div class="btn-row toolbar">' +
      '<button id="srPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">蓝色弧段：受 D(θ) 调制的扩散波前（强方向伸得远、弱方向伸得近，随时间呼吸）；黄色虚线：探测方向 θp。</span></div></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>极坐标指向图 D(θ)</h3>' +
      '<canvas class="canvas-wrap" id="srPolar"></canvas>' +
      '<p class="inline-note">径向 = D(θ)（0–1）；蓝色曲线为同相瓣、粉色为反相瓣（过零点即相位反转）；端点圆点为探测点（径向 = R·D(θp)）。</p></section>' +
      '<section class="card"><h3>探测点时域波形 p(t)</h3>' +
      '<canvas class="canvas-wrap" id="srWave"></canvas>' +
      '<p class="inline-note">p(t) = D(θp)·sin(2πft − kr)/r，显示 3 个周期；振幅 ∝ D(θp)/r（D(θp)=0 时波形退化为直线，该方向无辐射）；偶极子 θp>90° 时波形反相。</p></section>' +
      '<section class="card"><h3>计算结果</h3><div id="srResult"></div></section>' +
      '</div>' +
      '</div>' +
      '<section class="card notes"><h3>物理含义与说明</h3>' +
      '<ul class="inline-note">' +
      '<li><strong>单极子</strong>（脉动小球、气泡）：全指向 D(θ)=1，体积速度源辐射效率最高，DI = 0 dB。</li>' +
      '<li><strong>偶极子</strong>（对置双源、小球摆动的力辐射）："8" 字形两瓣反相、轴向辐射为零；相同源强度下辐射效率远低于单极子，DI ≈ 4.8 dB。</li>' +
      '<li><strong>四极子</strong>（湍流射流噪声）：四叶草图样、无净体积速度也无净力，辐射效率比偶极子更低，DI ≈ 3.3 dB。</li>' +
      '<li><strong>指向性指数 DI</strong>：DI 越大指向性越强；同样声功率下，轴向（最大响应方向）的声压越高。</li>' +
      '</ul></section>';
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    recalc();
    inited = true;
  }

  // 视图被切回时刷新（重算 + 继续动画）
  function onShow() {
    recalc();
    if (!rafId) startAnim();
  }

  window.SimRadiationView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
