/*
 * view-sim-interference.js — 双源声波干涉模拟器视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimInterference（计算内核）
 * 约定：init() 自建全部 DOM（含 .page-head）注入 id="view-sim-interference" 容器，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimInterference;

  var DEFAULTS = {
    d: 1,     // 源间距 m
    f: 500,   // 频率 Hz
    c: 343,   // 声速 m/s
    phase: 0, // 两源相位差 φ deg
    theta: 0  // 探测角 θ deg（自中垂线起算）
  };

  // 载入例题：d/λ ≈ 8.7 的密集多瓣图样（可见 17 个主极大）
  var PRESET = { d: 3, f: 1000, c: 343, phase: 0, theta: 45 };

  var state = Object.assign({}, DEFAULTS);
  var last = null;    // 最近一次计算结果 { ok, amp, ord }
  var inited = false;
  var playing = true; // 播放/暂停
  var rafId = null;
  var t0 = 0;         // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="if_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="if_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  function slider(k, label, val, min, max, step, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="if_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="range" id="if_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" max="' + max + '" step="' + step + '">' +
      '<span class="aux-msg" id="ifThetaVal">' + val + ' °</span></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var amp = E.amplitude(state.theta, state.d, state.f, state.c, state.phase);
    if (!amp.ok) { fail(amp.error); return; }
    var ord = E.orders(state.d, state.f, state.c);
    if (!ord.ok) { fail(ord.error); return; }
    last = { ok: true, amp: amp, ord: ord };
    renderResult(last);
    if (playing && !rafId) startAnim();
  }

  // 参数无效：显示错误并停掉动画（画布上留错误提示）
  function fail(msg) {
    last = null;
    var box = $('ifResult');
    if (box) box.innerHTML = '<div class="callout-row error">' + esc(msg) + '</div>';
    stopAnim();
    draw();
  }

  function renderResult(r) {
    var box = $('ifResult');
    if (!box) return;
    var amp = r.amp, ord = r.ord;
    var A = amp.amplitude;
    // 第一相消角 = 最小正极小角
    var firstMin = null;
    for (var i = 0; i < ord.minima.length; i++) {
      if (ord.minima[i] > 1e-9) { firstMin = ord.minima[i]; break; }
    }
    // 相长/相消判定（按归一化振幅；m 取总相位差最接近的整数倍 2π）
    var mOrder = Math.round(amp.phaseRad / (2 * Math.PI));
    var verdict;
    if (A >= 0.995) verdict = '相长干涉（主极大 m=' + mOrder + '）';
    else if (A <= 0.005) verdict = '相消干涉（极小）';
    else verdict = '过渡区（部分叠加）';
    var stats = [
      { l: '波长 λ = c/f', v: num(amp.lambda, 3), u: 'm' },
      { l: '第一相消角 θ₁', v: firstMin != null ? num(firstMin, 2) : '—', u: '°' },
      { l: '可见主极大数', v: String(ord.maxima.length), u: '个' },
      { l: '波程差 Δr = d·sinθ', v: num(amp.deltaR, 3), u: 'm' },
      { l: '波程相位差 2πΔr/λ', v: num((2 * Math.PI * amp.deltaR) / amp.lambda, 2), u: 'rad' },
      { l: '探测角振幅 A(θ)', v: num(A, 3), u: '' },
      { l: 'θ = ' + num(amp.thetaDeg, 1) + '° 处判定', v: verdict, u: '' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">λ = c/f = ' + num(amp.c, 0) + ' / ' + num(amp.f, 0) + ' = ' + num(amp.lambda, 3) + ' m</span></div>' +
      '<div><span class="fx">Δr(θ) = d·sinθ = ' + num(amp.d, 2) + ' × sin(' + num(amp.thetaDeg, 1) + '°) = ' + num(amp.deltaR, 3) + ' m</span></div>' +
      '<div><span class="fx">A(θ) = |cos(π·d·sinθ/λ + φ/2)| = ' + num(A, 3) + '</span>（当前 φ = ' + num(amp.phaseDeg, 0) + '°）</div>' +
      '<div><span class="fx">相长干涉：Δr = mλ</span>；<span class="fx">相消干涉：Δr = (m+½)λ</span></div>' +
      '</div>';

    html += '<ul class="inline-note" style="margin-top:10px">' +
      '<li>波程差决定相位差：两源到观测点的路程差 Δr = d·sinθ 引入相位差 2πΔr/λ；频率越高（λ 越短），同一几何下的相位差越大，干涉瓣越密。</li>' +
      '<li>相位差为 2π 的整数倍时同相叠加（相长干涉，Δr = mλ，A = 1）；为 π 的奇数倍时反相抵消（相消干涉，Δr = (m+½)λ，A = 0）。</li>' +
      '<li>两源相位差 φ 等效平移整个图样：相消条件变为 Δr = (m+½)λ − φ·λ/(2π)；φ = 180° 时中垂线方向由极大翻转为极小。</li>' +
      '<li>本图样为远场（夫琅禾费）近似，要求观测距离远大于 d 与 λ²/d；近场等振幅面更复杂，实际效果应以测量为准。</li>' +
      '</ul>';

    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setupCanvas(cv, cssH) {
    if (!cv) return null;
    DPR = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var cssW = rect.width || 720;
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    var ctx = cv.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function draw() {
    drawField();
    drawPolar();
  }

  // 场图（俯视）：两源 ±d/2 + 扩散圆波前 + 远场指向包络 + 探测角
  function drawField() {
    var setup = setupCanvas($('ifCanvas'), 320);
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

    var amp = last.amp;
    var d = amp.d, lambda = amp.lambda, phaseDeg = amp.phaseDeg;
    var padL = 10, padR = 10, padT = 24, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    // 视野宽度（m）：至少覆盖约 8 个波长，并保证两源在画面内
    var viewW = Math.max(8 * lambda, 2 * d + 2 * lambda);
    var s = plotW / viewW; // px/m
    var cx = padL + plotW / 2, cy = padT + plotH / 2;
    var sx1 = cx - (d / 2) * s, sx2 = cx + (d / 2) * s; // 两声源像素 x（±d/2）
    var lamPx = lambda * s;

    // 中垂线（θ = 0 方向）与源连线
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + plotH);
    ctx.moveTo(padL, cy); ctx.lineTo(padL + plotW, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('中垂线 θ=0°', cx, padT + plotH - 6);
    ctx.textAlign = 'left';

    // 扩散圆波前：半径 = λ·(u + k)，u = (1.2·t0) mod 1（视觉时间缩放，约 1.2 Hz）
    var u = (1.2 * t0) % 1;
    var maxR = Math.sqrt(plotW * plotW + plotH * plotH);
    var k, rad;
    ctx.lineWidth = 1;
    for (k = 0; k < 8; k++) { // 波谷（与波峰错开半个波长）
      rad = lamPx * (u + k + 0.5);
      if (rad > maxR) break;
      ctx.strokeStyle = 'rgba(129,140,248,0.22)';
      ctx.beginPath(); ctx.arc(sx1, cy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx2, cy, rad, 0, Math.PI * 2); ctx.stroke();
    }
    for (k = 0; k < 8; k++) { // 波峰
      rad = lamPx * (u + k);
      if (rad > maxR) break;
      ctx.strokeStyle = 'rgba(56,189,248,0.5)';
      ctx.beginPath(); ctx.arc(sx1, cy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx2, cy, rad, 0, Math.PI * 2); ctx.stroke();
    }

    // 远场指向包络 A(θ)（θ ∈ [-90°, 90°]，自中垂线起算）：相长瓣/相消瓣一目了然
    var Renv = Math.min(plotW, plotH) * 0.42;
    ctx.beginPath();
    for (var a = -90; a <= 90; a += 2) {
      var A = E.amplitude(a, d, amp.f, amp.c, phaseDeg).amplitude;
      var rr = Renv * A;
      var px = cx + rr * Math.sin((a * Math.PI) / 180);
      var py = cy - rr * Math.cos((a * Math.PI) / 180);
      if (a === -90) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 探测角方向（黄色虚线）
    var th = (amp.thetaDeg * Math.PI) / 180;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Renv * 1.15 * Math.sin(th), cy - Renv * 1.15 * Math.cos(th));
    ctx.stroke();
    ctx.setLineDash([]);

    // 两声源（±d/2 处粉色圆点）
    ctx.fillStyle = '#f472b6';
    ctx.beginPath(); ctx.arc(sx1, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx2, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbcfe8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('S₁', sx1, cy - 12);
    ctx.fillText('S₂', sx2, cy - 12);

    // 源间距与波长标注
    ctx.strokeStyle = 'rgba(148,163,184,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx1, cy + 14); ctx.lineTo(sx2, cy + 14);
    ctx.moveTo(sx1, cy + 10); ctx.lineTo(sx1, cy + 18);
    ctx.moveTo(sx2, cy + 10); ctx.lineTo(sx2, cy + 18);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText('d = ' + num(d, 2) + ' m，λ = ' + num(lambda, 3) + ' m', cx, cy + 32);

    // 探测角读数（左上角固定信息，避免与标注重叠）
    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('探测角 θ = ' + num(amp.thetaDeg, 1) + '°，Δr = ' + num(amp.deltaR, 3) + ' m，A(θ) = ' + num(amp.amplitude, 3), padL + 2, padT - 8);
  }

  // 极坐标指向图 A(θ)（0° = 中垂线方向），随动画轻微呼吸
  function drawPolar() {
    var setup = setupCanvas($('ifPolar'), 320);
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

    var amp = last.amp, ord = last.ord;
    var cx = W / 2, cy = H / 2 + 6;
    var R = Math.max(40, Math.min(W / 2, H / 2) - 36);
    var breath = 1 + 0.03 * Math.sin(2 * Math.PI * 1.2 * t0); // 呼吸动画

    // 极坐标网格：同心圆（0.25/0.5/0.75/1）+ 每 30° 辐条
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(function (fr) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * fr, 0, Math.PI * 2);
      ctx.stroke();
    });
    var a2, rad2;
    for (a2 = 0; a2 < 360; a2 += 30) {
      rad2 = (a2 * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(rad2), cy - R * Math.cos(rad2));
      ctx.stroke();
    }

    // 角度与振幅刻度
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('0°', cx - 6, cy - R - 10);
    ctx.fillText('270°', cx - R - 10, cy + 4);
    ctx.textAlign = 'left';
    ctx.fillText('90°', cx + R + 10, cy + 4);
    ctx.fillText('180°', cx + 6, cy + R + 18);
    ctx.fillText('A=1.0', cx + 14, cy - R - 10);
    ctx.fillText('0.5', cx + 5, cy - R * 0.5 - 3);

    // A(θ) 曲线（θ ∈ [-90°, 90°] 即覆盖全平面，关于竖直轴镜像对称）
    ctx.beginPath();
    for (var t = -90; t <= 90; t += 2) {
      var A = E.amplitude(t, amp.d, amp.f, amp.c, amp.phaseDeg).amplitude;
      var rr = R * A * breath;
      var px = cx + rr * Math.sin((t * Math.PI) / 180);
      var py = cy - rr * Math.cos((t * Math.PI) / 180);
      if (t === -90) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.14)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 各可见主极大方向（外圈黄点）
    ctx.fillStyle = 'rgba(251,191,36,0.85)';
    ord.maxima.forEach(function (m) {
      var mr = (m * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx + (R + 8) * Math.sin(mr), cy - (R + 8) * Math.cos(mr), 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // 探测角方向 + 端点（黄）
    var th = (amp.thetaDeg * Math.PI) / 180;
    var rth = R * amp.amplitude * breath;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rth * Math.sin(th), cy - rth * Math.cos(th));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx + rth * Math.sin(th), cy - rth * Math.cos(th), 4, 0, Math.PI * 2);
    ctx.fill();

    // 读数（左上角 / 左下角固定信息）
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('探测角 θ = ' + num(amp.thetaDeg, 1) + '°，A(θ) = ' + num(amp.amplitude, 3), 12, 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('f = ' + num(amp.f, 0) + ' Hz，d = ' + num(amp.d, 2) + ' m，λ = ' + num(amp.lambda, 3) + ' m，φ = ' + num(amp.phaseDeg, 0) + '°', 12, H - 14);
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
    var btn = $('ifPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('ifInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        if (k === 'theta') {
          var lab = $('ifThetaVal');
          if (lab) lab.textContent = (isNaN(v) ? 0 : v) + ' °';
        }
        recalc();
      });
    });
  }

  function bind() {
    bindInputs();
    var play = $('ifPlay'); if (play) play.addEventListener('click', togglePlay);
    var load = $('ifLoad'); if (load) load.addEventListener('click', loadPreset);
    var reset = $('ifReset'); if (reset) reset.addEventListener('click', resetAll);
  }

  function flash(msg) {
    var el = $('ifMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('已载入例题：d = 3 m、f = 1000 Hz（可见 17 个主极大）');
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    ['d', 'f', 'c', 'phase', 'theta'].forEach(function (k) {
      var el = $('if_' + k);
      if (el) el.value = state[k];
    });
    var lab = $('ifThetaVal');
    if (lab) lab.textContent = state.theta + ' °';
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-interference');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>双源声波干涉模拟器</h2>' +
      '<p class="hint">两个同频同幅相干点声源（间距 d、相位差 φ）的远场干涉：波程差 Δr = d·sinθ 决定相位差 2πΔr/λ，相长干涉（Δr = mλ）与相消干涉（Δr = (m+½)λ）交替形成指向性瓣；含实时 Canvas 场动画与极坐标指向图。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="ifInputs">' +
      field('d', '源间距 d', state.d, 'm', 0.1, 0.1) +
      field('f', '频率 f', state.f, 'Hz', 50, 10) +
      field('c', '声速 c', state.c, 'm/s', 300, 1) +
      field('phase', '两源相位差 φ', state.phase, '°', 0, 5) +
      '</div>' +
      '<div class="field-row" style="margin-top:8px">' +
      slider('theta', '探测角 θ（自中垂线起算）', state.theta, 0, 90, 1, '°') +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="ifLoad" class="btn">载入例题</button>' +
      '<button id="ifReset" class="btn ghost">重置参数</button>' +
      '<span id="ifMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 双源干涉场动画（俯视）</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="ifPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">青圈 = 波峰、紫圈 = 波谷（半径 = c·t mod λ，视觉时间缩放约 1.2 Hz）；粉点 = 点声源 S₁/S₂；浅蓝闭合曲线 = 远场指向包络 A(θ)。</span></div>' +
      '<canvas class="canvas-wrap" id="ifCanvas"></canvas>' +
      '<p class="inline-note">波前自两声源同心扩散并叠加：波程差为 λ 整数倍的方向同相（相长），为 λ/2 奇数倍的方向反相（相消）；沿中垂线方向的振幅剖面即包络的竖直脊柱。</p></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>极坐标指向图 A(θ)</h3>' +
      '<canvas class="canvas-wrap" id="ifPolar"></canvas>' +
      '<p class="inline-note">半径 = 归一化振幅 A(θ) ∈ [0,1]；0° 为中垂线方向，±90° 为源连线方向；黄虚线/黄点 = 探测角 θ，外圈小黄点 = 各可见主极大方向。</p></section>' +
      '<section class="card"><h3>计算结果</h3><div id="ifResult"></div></section>' +
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
    if (!rafId && playing && last && last.ok) startAnim();
  }

  window.SimInterferenceView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
