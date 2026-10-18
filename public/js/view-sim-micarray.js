/*
 * view-sim-micarray.js — 麦克风阵列波束模拟器视图（交互 + 实时 Canvas 极坐标动画）
 * 依赖：window.SimMicarray（计算内核）
 * 约定：在 init() 时自建全部 DOM（含 .page-head），index.html 仅需留一个空
 *       <section id="view-sim-micarray" class="view" hidden></section> 容器，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimMicarray;

  var DEFAULTS = { N: 8, d: 0.25, f: 343, steer: 0, c: 343 };
  var PRESET = { N: 16, d: 0.4, f: 1000, steer: 30, c: 343 }; // 例题：16 阵元、含明显主瓣

  var state = Object.assign({}, DEFAULTS);
  var last = null;        // 最近一次 pattern 结果
  var playing = false;
  var raf = null;
  var inited = false;
  var sweepDir = 1;       // 自动扫描方向
  var canvas, ctx, W = 360, H = 360;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 骨架 DOM ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-micarray');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>麦克风阵列波束模拟器</h2>' +
      '<p class="hint">均匀线性阵列（接收端）延时-求和波束形成：调节阵元数 N、间距 d、频率 f 与导向角 θ_steer，' +
      '实时观察极坐标方向图（0 dB 在主瓣峰值，向下至 -30 dB）的转动与栅瓣出现。与 linearray（扬声器发射）概念不同。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3>阵列参数</h3>' +
      '<div class="field-row">' +
      field('N', '阵元数 N', state.N, '', 2, 1) +
      field('d', '阵元间距 d', state.d, 'm', 0.01, 0.05) +
      field('f', '频率 f', state.f, 'Hz', 1, 1) +
      field('steer', '导向角 θ_steer', state.steer, '°', -90, 1) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="maPreset" class="btn">载入例题</button>' +
      '<button id="maReset" class="btn ghost">重置参数</button>' +
      '<button id="maPlay" class="btn">播放</button>' +
      '</div>' +
      '<div class="aux-msg" id="maMsg"></div>' +
      '<p class="inline-note">点击「播放」后导向角将自动缓慢扫描，模拟 DOA（波达方向）搜索；暂停后可手动输入固定导向角。</p>' +
      '</section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>波束方向图（极坐标 dB）</h3>' +
      '<canvas class="canvas-wrap" id="maCanvas"></canvas>' +
      '<div class="stat-grid" id="maStats"></div>' +
      '<div class="formula" style="margin-top:10px">' +
      '<div><span class="fx">AF(θ) = | (1/N) Σ exp( j k d n (sinθ − sinθ_steer) ) |</span></div>' +
      '<div><span class="fx">k = 2π f / c ， AF_dB = 20·log₁₀(AF + 1e-9) ， 栅瓣: d·sinθ_g = mλ + d·sinθ_steer</span></div>' +
      '</div>' +
      '</section>' +
      '</div>' +
      '</div>';

    canvas = $('maCanvas');
    if (canvas) setupCanvas();
  }

  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" data-k="' + k + '" value="' + (val == null ? '' : val) +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = '100%';
    canvas.style.maxWidth = W + 'px';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ------------------------------ 绑定事件 ------------------------------ */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('#view-sim-micarray [data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        if (!isNaN(v)) { state[k] = v; recalc(); }
      });
    });
    var p = $('maPreset'); if (p) p.addEventListener('click', loadPreset);
    var r = $('maReset'); if (r) r.addEventListener('click', reset);
    var pl = $('maPlay'); if (pl) pl.addEventListener('click', togglePlay);
  }

  function flash(msg) {
    var el = $('maMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2200);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('已载入例题：N=16, d=0.4 m, f=1000 Hz, steer=30°');
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    if (playing) togglePlay();
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    Array.prototype.forEach.call(document.querySelectorAll('#view-sim-micarray [data-k]'), function (el) {
      var k = el.getAttribute('data-k');
      if (state[k] != null) el.value = state[k];
    });
  }

  function togglePlay() {
    playing = !playing;
    var btn = $('maPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
    if (playing) flash('自动扫描中：导向角缓慢变化');
    else flash('已暂停');
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.pattern(state);
    last = r.ok ? r : null;
    renderStats(r);
  }

  function renderStats(r) {
    var box = $('maStats');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var g = E.grating(state);
    var gratingTxt = (g.ok && g.angles) ? g.angles.map(function (a) { return a.toFixed(1) + '°'; }).join('， ') : '无';
    var stats = [
      { l: '主瓣宽 (-3 dB)', v: num(r.mainLobeWidth, 1), u: '°' },
      { l: '栅瓣角度', v: gratingTxt, u: '' },
      { l: '波数 k', v: num(r.k, 3), u: 'rad/m' }
    ];
    var html = '';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    box.innerHTML = html;
  }

  /* ------------------------------ 极坐标绘制 ------------------------------ */
  // dB(≥-30) → 半径比例：0 dB 在中心（r=0），-30 dB 在外圈（r=R）
  function dbToRadius(db, Rmax) {
    var dbClamped = Math.max(-30, Math.min(0, db));
    return Rmax * (dbClamped + 30) / 30;
  }

  function draw(t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2;
    var Rmax = Math.min(W, H) / 2 - 18;

    // 背景圆盘
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(cx, cy, Rmax + 6, 0, 2 * Math.PI); ctx.fill();

    // dB 同心环（0,-10,-20,-30）
    var rings = [0, -10, -20, -30];
    ctx.font = '10px sans-serif';
    rings.forEach(function (db) {
      var rr = dbToRadius(db, Rmax);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.fillText(db + ' dB', cx + 3, cy - rr - 2);
    });
    // 坐标轴（θ=0 朝上，±90 朝左右）
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.beginPath();
    ctx.moveTo(cx - Rmax, cy); ctx.lineTo(cx + Rmax, cy);
    ctx.moveTo(cx, cy - Rmax); ctx.lineTo(cx, cy + Rmax);
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.fillText('0°(法线)', cx + 4, cy - Rmax + 4);
    ctx.fillText('+90°', cx + Rmax - 26, cy - 4);
    ctx.fillText('-90°', cx - Rmax + 2, cy + 12);

    if (!last || !last.ok) {
      ctx.fillStyle = '#f87171';
      ctx.fillText('参数无效', cx - 22, cy);
      return;
    }

    // 来波波前（从导向角方向抵达阵列的平面波，随时间推进 → 临场感）
    drawWavefronts(cx, cy, Rmax, last.steer, t);

    // 极坐标方向图曲线
    var theta = last.thetaDeg, db = last.AFmagDb;
    ctx.beginPath();
    for (var i = 0; i < theta.length; i++) {
      var th = theta[i] * Math.PI / 180;
      // θ=0 朝上：x = cx + r*sinθ, y = cy - r*cosθ
      var r = dbToRadius(db[i], Rmax);
      var x = cx + r * Math.sin(th);
      var y = cy - r * Math.cos(th);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.28)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineWidth = 1;

    // 主瓣指向标记（θ_steer 方向射线）
    var st = last.steer * Math.PI / 180;
    ctx.strokeStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Rmax * Math.sin(st), cy - Rmax * Math.cos(st));
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('θ_steer=' + last.steer.toFixed(0) + '°', cx + Rmax * Math.sin(st) * 0.55 - 14, cy - Rmax * Math.cos(st) * 0.55);

    // 阵列（中心一行小圆点，沿 x 轴排列）
    drawArray(cx, cy, last.N);
  }

  // 来波波前：垂直于来波方向的平行亮线，随时间向阵列推进
  function drawWavefronts(cx, cy, Rmax, steerDeg, t) {
    var th = steerDeg * Math.PI / 180;
    var s = { x: Math.sin(th), y: -Math.cos(th) };     // 源方向单位向量（自中心指向来波方向）
    var w = { x: Math.cos(th), y: Math.sin(th) };       // 波前线方向（垂直于 s）
    var spacing = 26;
    var speed = 18;                                      // px/s
    var phase = (t / 1000 * speed) % spacing;
    ctx.strokeStyle = 'rgba(34,197,94,0.55)';
    ctx.lineWidth = 1.4;
    for (var dpos = Rmax + spacing; dpos > -Rmax; dpos -= spacing) {
      var off = dpos - phase;
      if (off < -Rmax || off > Rmax) continue;
      var px = cx + s.x * off, py = cy + s.y * off;
      var L = Rmax;
      ctx.beginPath();
      ctx.moveTo(px - w.x * L, py - w.y * L);
      ctx.lineTo(px + w.x * L, py + w.y * L);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // 中心阵列：N 个圆点沿水平 x 轴分布
  function drawArray(cx, cy, N) {
    N = N || 8;
    var span = Math.min(120, 16 * (N - 1));
    var step = N > 1 ? span / (N - 1) : 0;
    var x0 = cx - span / 2;
    for (var n = 0; n < N; n++) {
      var x = x0 + n * step;
      ctx.beginPath();
      ctx.arc(x, cy, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }
  }

  /* ------------------------------ 动画循环 ------------------------------ */
  function frame(t) {
    if (playing) {
      // 自动缓慢扫描导向角
      var sp = 12; // 度/秒
      state.steer += sweepDir * sp * (1 / 60);
      if (state.steer >= 90) { state.steer = 90; sweepDir = -1; }
      if (state.steer <= -90) { state.steer = -90; sweepDir = 1; }
      var inp = document.querySelector('#view-sim-micarray [data-k="steer"]');
      if (inp) inp.value = Math.round(state.steer);
      recalc();
    }
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    recalc();
    if (!raf) raf = requestAnimationFrame(frame);
    inited = true;
  }

  function onShow() {
    recalc();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  window.SimMicarrayView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
