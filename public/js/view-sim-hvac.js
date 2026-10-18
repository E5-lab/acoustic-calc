/*
 * view-sim-hvac.js — HVAC 消声器（吸声衬里）模拟器视图（交互 + Canvas 实时动画）
 * 依赖：window.SimHvac（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-hvac" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimHvac;

  var DEFAULTS = {
    w: 0.3,      // 风管宽度 m
    h: 0.3,      // 风管高度 m
    L: 2.0,      // 消声器长度 m
    alpha: 0.7,  // 吸声系数（单一值，应用于全部频段）
    Q: 0.2,      // 体积流量 m³/s（可选）
    K: 1.0       // 标定常数
  };

  var state = Object.assign({}, DEFAULTS);
  var last = null;
  var inited = false;
  var playing = true;
  var rafId = null;
  var phase = 0;           // 动画相位（随时间推进）
  var canvas, ctx, cssW, cssH;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function fnum(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 输入控件 ------------------------------ */
  function field(k, label, val, unit) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" data-k="' + k + '" value="' + (val == null ? '' : val) +
      '" min="0" step="0.01"></div>';
  }

  /* ------------------------------ 计算与渲染 ------------------------------ */
  function recalc() {
    var r = E.attenuation({
      w: state.w, h: state.h, L: state.L,
      alpha: state.alpha, Q: state.Q, K: state.K
    });
    last = r.ok ? r : null;
    renderResult(r);
    renderTable(r);
    renderAux(r);
    // 动画会持续读取 last / state，无需手动重绘，但暂停态下也立即刷新一帧
    if (!playing) draw();
  }

  function renderAux(r) {
    var msg = $('simHvacMsg');
    if (!msg) return;
    if (!r.ok) { msg.textContent = ''; return; }
    msg.textContent = '截面 ' + fnum(r.S, 3) + ' m²，衬里面周长 ' + fnum(r.P, 2) + ' m。';
  }

  function renderResult(r) {
    var box = $('simHvacResult');
    if (!box) return;
    if (!r.ok) { box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>'; return; }
    var stats = [
      { l: '截面面积 S', v: fnum(r.S, 3), u: 'm²' },
      { l: '衬里面周长 P', v: fnum(r.P, 2), u: 'm' }
    ];
    if (r.dp != null) {
      stats.push({ l: '总压力损失 Δp', v: fnum(r.dp, 1), u: 'Pa' });
    }
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  function renderTable(r) {
    var box = $('simHvacTable');
    if (!box) return;
    if (!r.ok) { box.innerHTML = ''; return; }
    var html = '<table class="data-table"><thead><tr>' +
      '<th>频率 (Hz)</th><th>吸声系数 α</th><th>衰减率 (dB/m)</th><th>插入损失 (dB)</th></tr></thead><tbody>';
    r.bands.forEach(function (b) {
      html += '<tr><td>' + b.freq + '</td><td>' + fnum(b.alpha, 2) +
        '</td><td>' + fnum(b.rate, 2) + '</td><td>' + fnum(b.dL, 2) + '</td></tr>';
    });
    html += '</tbody></table>';
    if (r.notes && r.notes.length) {
      html += '<div class="formula" style="margin-top:10px">' +
        r.notes.map(function (n) { return '<div>· ' + esc(n) + '</div>'; }).join('') + '</div>';
    }
    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setupCanvas() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    cssW = Math.max(320, Math.floor(rect.width || canvas.parentNode.clientWidth || 600));
    cssH = 360;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);

    // 上区：衬里直管段 + 衰减声波；下区：插入损失柱状图
    var ductTop = 18, ductH = 150, ductLeft = 28, ductRight = cssW - 18;
    var ductW = ductRight - ductLeft;
    var lining = 18; // 衬里厚度

    // 管道外框
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(ductLeft, ductTop, ductW, ductH);

    // 上下吸声衬里（斜线填充表示）
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(ductLeft, ductTop, ductW, lining);
    ctx.fillRect(ductLeft, ductTop + ductH - lining, ductW, lining);
    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    for (var x = ductLeft - lining; x < ductRight; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, ductTop);
      ctx.lineTo(x + lining, ductTop + lining);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, ductTop + ductH);
      ctx.lineTo(x + lining, ductTop + ductH - lining);
      ctx.stroke();
    }
    ctx.restore();

    // 计算主导衰减率，用于包络（无结果时用默认值使画面合理）
    var rateDom = last && last.ok ? last.rateDom : 5;
    // 衰减包络：沿 x 指数衰减；按视觉缩放使 L 段内有可见变化
    var envScale = 1.0;          // 入口振幅（占半高比例）
    var kDecay = Math.min(6, rateDom * 0.18 + 0.4); // 视觉衰减系数
    var midY = ductTop + ductH / 2;
    var amp = (ductH / 2 - lining - 6) * envScale;

    // 入射声波（正弦，沿 x 衰减）
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var N = 240;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var px = ductLeft + t * ductW;
      var env = Math.exp(-kDecay * t) * amp;
      // 波长随视觉固定，相位随时间移动形成"行进"效果
      var py = midY + env * Math.sin(2 * Math.PI * (6 * t) - phase);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 衰减包络参考线（淡）
    ctx.strokeStyle = 'rgba(37,99,235,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ductLeft, midY - amp); ctx.lineTo(ductRight, midY - amp * Math.exp(-kDecay)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ductLeft, midY + amp); ctx.lineTo(ductRight, midY + amp * Math.exp(-kDecay)); ctx.stroke();

    // 标注
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('入口 → 出口（振幅指数衰减 ∝ e^(−rate·x)）', ductLeft, ductTop - 4);

    // 下区：插入损失柱状图（8 频段）
    var chartTop = ductTop + ductH + 28;
    var chartH = 110;
    var chartLeft = ductLeft, chartRight = ductRight;
    var chartW = chartRight - chartLeft;
    var bands = (last && last.ok) ? last.bands : null;
    var maxDL = 1;
    if (bands) bands.forEach(function (b) { if (b.dL > maxDL) maxDL = b.dL; });
    var bw = chartW / 8;
    ctx.fillStyle = '#64748b';
    ctx.fillText('各频段插入损失 dL (dB)', chartLeft, chartTop - 6);
    for (var j = 0; j < 8; j++) {
      var b = bands ? bands[j] : null;
      var val = b ? b.dL : 0;
      var bh = (val / maxDL) * chartH;
      var bx = chartLeft + j * bw + 4;
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(bx, chartTop + chartH - bh, bw - 8, bh);
      ctx.fillStyle = '#475569';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(b ? b.freq : ''), bx + (bw - 8) / 2, chartTop + chartH + 12);
      if (b) ctx.fillText(val.toFixed(1), bx + (bw - 8) / 2, chartTop + chartH - bh - 3);
      ctx.textAlign = 'left';
    }
    // 基线
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartLeft, chartTop + chartH); ctx.lineTo(chartRight, chartTop + chartH); ctx.stroke();
  }

  function tick() {
    if (!playing) return;
    phase += 0.12;                 // 相位推进 → 波行进
    if (phase > 1e6) phase = 0;
    draw();
    rafId = requestAnimationFrame(tick);
  }

  function setPlaying(on) {
    playing = on;
    var btn = $('simHvacPlay');
    if (btn) btn.textContent = on ? '⏸ 暂停' : '▶ 播放';
    if (on) {
      if (rafId == null) tick();
    } else {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    }
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-hvac');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>HVAC 消声器（吸声衬里）模拟器</h2>' +
      '<p class="hint">衬里直管段消声器的衰减率与插入损失估算（简化 Beranek 数量级模型），并实时动画展示声波沿程指数衰减。仅供数量级参考，真实设计须采用厂家实测曲线 / ISO 7235。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3>输入参数</h3>' +
      '<div class="field-row" id="simHvacInputs">' +
      field('w', '风管宽度 w', state.w, 'm') +
      field('h', '风管高度 h', state.h, 'm') +
      field('L', '消声器长度 L', state.L, 'm') +
      field('alpha', '吸声系数 α（0–1）', state.alpha, '') +
      field('Q', '体积流量 Q（可选）', state.Q, 'm³/s') +
      field('K', '标定常数 K', state.K, '') +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="simHvacPlay" class="btn">⏸ 暂停</button>' +
      '<span id="simHvacMsg" class="aux-msg"></span></div>' +
      '<p class="inline-note">当前为单一 α 应用于全部 8 个倍频程；后续版本可扩展为逐频段 α 数组编辑。</p>' +
      '</section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>实时动画</h3>' +
      '<div class="canvas-wrap"><canvas id="simHvacCanvas" class="canvas-wrap"></canvas></div>' +
      '<p class="inline-note">蓝线为入射声波，沿衬里直管段振幅指数衰减；下方柱状图为各倍频程插入损失。</p></section>' +
      '<section class="card"><h3>计算结果</h3><div id="simHvacResult"></div></section>' +
      '<section class="card"><h3>各频段明细</h3><div id="simHvacTable"></div></section>' +
      '</div>' +
      '</div>';
  }

  function bind() {
    var box = $('simHvacInputs');
    if (box) {
      Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
        el.addEventListener('input', function () {
          var k = el.getAttribute('data-k');
          var v = parseFloat(el.value);
          state[k] = isNaN(v) ? 0 : v;
          recalc();
        });
      });
    }
    var btn = $('simHvacPlay');
    if (btn) btn.addEventListener('click', function () { setPlaying(!playing); });
    window.addEventListener('resize', function () { setupCanvas(); if (!playing) draw(); });
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    canvas = $('simHvacCanvas');
    ctx = canvas ? canvas.getContext('2d') : null;
    setupCanvas();
    bind();
    recalc();
    setPlaying(true);
    inited = true;
  }

  function onShow() {
    setupCanvas();
    recalc();
    if (!playing) setPlaying(true);
  }

  window.SimHvacView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
