/*
 * view-sim-fxlms.js — 主动降噪 FXLMS 模拟器视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimFxlms（计算内核）
 * 约定：init() 自建全部 DOM（含 .page-head）注入 id="view-sim-fxlms" 容器，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimFxlms;

  var DEFAULTS = {
    fs: 8000,     // 采样率 Hz
    N: 32,        // 自适应 FIR 阶数
    mu: 0.01,     // 步长（本简化模型 μ≈0.01 稳定，过大发散）
    secDelay: 4,  // 次级路径纯延迟（样点）
    iters: 2000,  // 迭代次数
    f1: 120, A1: 1.0,   // 主频 1
    f2: 240, A2: 0.6    // 主频 2
  };

  // 载入例题：双频音调，与默认一致但固定一组参数便于复现
  var PRESET = { fs: 8000, N: 32, mu: 0.01, secDelay: 4, iters: 2000, f1: 120, A1: 1.0, f2: 240, A2: 0.6 };

  var state = Object.assign({}, DEFAULTS);
  var last = null;
  var inited = false;
  var playing = true;
  var rafId = null;
  var t0 = 0;            // 动画累计时间（秒）
  var prog = 0;          // 播放进度 0..1（驱动收敛曲线与波形窗口）
  var maxAbsD = 1;       // 初级波形最大幅值（波形归一化基准）

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, d) { return v == null || !isFinite(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  function tones() {
    return [{ f: state.f1, A: state.A1 }, { f: state.f2, A: state.A2 }];
  }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="fx_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="fx_' + k + '" data-k="' + k + '" value="' + val + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.run({
      fs: state.fs, N: state.N, mu: state.mu, secDelay: state.secDelay,
      iters: state.iters, tones: tones()
    });
    last = r.ok ? r : null;
    if (r.ok && r.traces && r.traces.d && r.traces.d.length) {
      var m = 0;
      for (var i = 0; i < r.traces.d.length; i++) {
        var a = Math.abs(r.traces.d[i]);
        if (a > m) m = a;
      }
      maxAbsD = m > 1e-9 ? m : 1;
    }
    renderResult(r);
    if (!r.ok) stopAnim();
  }

  function renderResult(r) {
    var box = $('fxResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var diverged = r.reductionDb < 0 || !isFinite(r.reductionDb);
    var stats = [
      { l: '初始残差 RMS', v: num(r.initRMS, 4), u: '' },
      { l: '最终残差 RMS', v: num(r.finalRMS, 4), u: '' },
      { l: '降噪量 ΔL', v: (diverged ? '−' : '') + num(Math.abs(r.reductionDb), 2), u: 'dB' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';

    if (diverged) {
      html += '<div class="callout-row error" style="margin-top:10px">⚠ 检测到发散：步长 μ 过大或迭代过多。请减小 μ（本简化模型稳定约 μ ≤ 0.01）后重试。</div>';
    }

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">d(n) = Σ Aₖ·sin(2πfₖn/fs)</span>，' +
      '主频 f₁=' + num(state.f1, 1) + ' Hz / f₂=' + num(state.f2, 1) + ' Hz</div>' +
      '<div><span class="fx">y(n) = Σ w[i]·x(n−i)</span>，' +
      '<span class="fx">e(n) = d(n) − y(n−' + num(state.secDelay, 0) + ')</span></div>' +
      '<div><span class="fx">w[i] += μ·e(n)·x(n−i−' + num(state.secDelay, 0) + ')</span>' +
      '（滤波-X：以经次级路径延迟后的参考更新）</div>' +
      '</div>';

    html += '<ul class="inline-note" style="margin-top:10px">';
    r.notes.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul>';

    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setupCanvas() {
    var cv = $('fxCanvas');
    if (!cv) return null;
    var DPR = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var cssW = rect.width || 720;
    var cssH = 360;
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
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if (!last || !last.ok) {
      ctx.fillStyle = '#f87171';
      ctx.font = '14px sans-serif';
      ctx.fillText('参数无效，无法绘制。', 16, H / 2);
      return;
    }

    var r = last;
    var padL = 52, padR = 14, padT = 20;

    /* ---- 上半：收敛曲线 RMS/迭代（线性，clamp 到 2×init） ---- */
    var convH = H * 0.36;
    var plotW = W - padL - padR;
    var cap = 2.0; // 归一化上限（超过即发散，钳到顶部）
    var base = r.initRMS > 1e-9 ? r.initRMS : 1;
    var es = r.errSeries;
    var headX = padL + prog * plotW;

    // 参考网格
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (convH * g) / 4;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
    }
    // 曲线
    function esY(v) {
      var ratio = v / base;
      if (!isFinite(ratio) || ratio < 0) ratio = cap;
      if (ratio > cap) ratio = cap;
      return padT + convH - (ratio / cap) * convH;
    }
    if (es.length) {
      // 完整曲线（淡）
      ctx.beginPath();
      for (var i = 0; i < es.length; i++) {
        var xx = padL + (i / (es.length - 1 || 1)) * plotW;
        var yy = esY(es[i]);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = 'rgba(148,163,184,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 已播放部分（亮绿，随进度展开）
      var upto = Math.max(1, Math.round(prog * es.length));
      ctx.beginPath();
      for (var i2 = 0; i2 < upto; i2++) {
        var xx2 = padL + (i2 / (es.length - 1 || 1)) * plotW;
        var yy2 = esY(es[i2]);
        if (i2 === 0) ctx.moveTo(xx2, yy2); else ctx.lineTo(xx2, yy2);
      }
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 播放头竖线
    ctx.strokeStyle = 'rgba(251,191,36,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(headX, padT); ctx.lineTo(headX, padT + convH); ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('残差 RMS（随迭代收敛）', padL, padT - 6);
    ctx.fillText(num(r.initRMS, 3), 4, padT + 10);
    ctx.fillText('×2', 4, padT + convH);

    /* ---- 下半：三波形（初级 d / 反相 y / 残差 e） ---- */
    var tr = r.traces;
    var waveTop = padT + convH + 16;
    var waveH = H - waveTop - 10;
    var stripH = waveH / 3;
    var win = 220; // 波形窗口（样点数）

    if (tr && tr.d && tr.d.length) {
      var n = tr.d.length;
      var startIdx = Math.min(Math.max(0, Math.round(prog * n)), Math.max(0, n - win));
      function strip(arr, color, label, y0) {
        ctx.beginPath();
        var drawn = 0;
        for (var k = 0; k < win; k++) {
          var idx = startIdx + k;
          if (idx >= n) break;
          var v = arr[idx];
          if (!isFinite(v)) v = 0;
          var px = padL + (k / (win - 1)) * plotW;
          var py = y0 + stripH / 2 - (v / maxAbsD) * (stripH / 2 - 6);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          drawn++;
        }
        if (!drawn) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // 零线
        ctx.strokeStyle = 'rgba(148,163,184,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y0 + stripH / 2); ctx.lineTo(W - padR, y0 + stripH / 2); ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '11px sans-serif';
        ctx.fillText(label, 4, y0 + stripH / 2 + 4);
      }
      strip(tr.d, '#38bdf8', '初级 d', waveTop);
      strip(tr.y, '#fb923c', '反相 y', waveTop + stripH);
      strip(tr.e, '#34d399', '残差 e', waveTop + 2 * stripH);
    }
  }

  function loop() {
    if (playing && last && last.ok) {
      t0 += 1 / 60;
      prog += 1 / 60 / 4; // 约 4 秒一轮
      if (prog > 1) prog = 0;
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function stopAnim() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  function startAnim() { if (!rafId) rafId = requestAnimationFrame(loop); }

  function togglePlay() {
    playing = !playing;
    var btn = $('fxPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('fxInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        prog = 0;
        recalc();
      });
    });
  }

  function bind() {
    bindInputs();
    var play = $('fxPlay'); if (play) play.addEventListener('click', togglePlay);
    var load = $('fxLoad'); if (load) load.addEventListener('click', loadPreset);
    var reset = $('fxReset'); if (reset) reset.addEventListener('click', resetAll);
  }

  function flash(msg) {
    var el = $('fxMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs(); prog = 0; recalc();
    flash('已载入例题（双频 120/240 Hz，μ=0.01）');
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs(); prog = 0; recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    ['fs', 'N', 'mu', 'secDelay', 'iters', 'f1', 'A1', 'f2', 'A2'].forEach(function (k) {
      var el = $('fx_' + k);
      if (el) el.value = state[k];
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-fxlms');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>主动降噪 FXLMS 模拟器</h2>' +
      '<p class="hint">自适应滤波 FXLMS：用上游参考 x(n) 经 FIR 生成反相 anti-noise，与初级噪声叠加后残差 e(n) 被最小化。观察收敛曲线与残差波形随迭代下降。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="fxInputs">' +
      field('f1', '主频 1 f₁', DEFAULTS.f1, 'Hz') +
      field('A1', '幅值 A₁', DEFAULTS.A1, '') +
      field('f2', '主频 2 f₂', DEFAULTS.f2, 'Hz') +
      field('A2', '幅值 A₂', DEFAULTS.A2, '') +
      field('fs', '采样率 fs', DEFAULTS.fs, 'Hz') +
      field('N', '滤波器阶数 N', DEFAULTS.N, '') +
      field('mu', '步长 μ', DEFAULTS.mu, '') +
      field('secDelay', '次级路径延迟', DEFAULTS.secDelay, '样点') +
      field('iters', '迭代次数', DEFAULTS.iters, '') +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="fxLoad" class="btn">载入例题</button>' +
      '<button id="fxReset" class="btn ghost">重置参数</button>' +
      '<span id="fxMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 实时收敛动画</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="fxPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">蓝：初级 d；橙：反相 y；绿：残差 e（应逐渐变矮）。μ≈0.01 稳定，μ 过大会发散。</span></div>' +
      '<canvas class="canvas-wrap" id="fxCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="fxResult"></div></section>' +
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

  function onShow() {
    recalc();
    if (!rafId) startAnim();
  }

  window.SimFxlmsView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
