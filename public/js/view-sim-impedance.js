/*
 * view-sim-impedance.js — 声阻抗 反射/透射 模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimImpedance（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-impedance" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimImpedance;

  // 当前选择状态：介质键 + 自定义值
  var state = {
    m1: 'air',
    m2: 'steel',
    rho1: 1.2, c1: 343,
    rho2: 7800, c2: 5900
  };

  var inited = false;
  var playing = true;
  var rafId = null;
  var ph = 0;          // 全局相位
  var lastT = 0;       // 上一帧时间戳
  var last = null;     // 最近一次有效结果

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || !isFinite(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 介质下拉选项 ------------------------------ */
  function mediumOptions(sel) {
    var keys = Object.keys(E.PRESETS);
    return keys.map(function (k) {
      var p = E.PRESETS[k];
      return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }

  function effectiveMedium(side) {
    if (side === 1) {
      if (state.m1 === 'custom') return { rho: state.rho1, c: state.c1 };
      return { rho: E.PRESETS[state.m1].rho, c: E.PRESETS[state.m1].c };
    } else {
      if (state.m2 === 'custom') return { rho: state.rho2, c: state.c2 };
      return { rho: E.PRESETS[state.m2].rho, c: E.PRESETS[state.m2].c };
    }
  }

  /* ------------------------------ 骨架 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-impedance');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>声阻抗 反射/透射 模拟器</h2>' +
      '<p class="hint">平面波法向入射到两种介质平面界面：观察入射波（蓝）、反射波（橙）与透射波（绿）的实时传播，并读取阻抗与反射/透射系数。选择不同介质体验阻抗失配效应。</p></div>' +
      '<div class="split">' +
      // 左列：控制卡片
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 选择介质</h3>' +
      '<div class="field-row">' +
      '<div class="field"><label class="f-label">介质 1（左）</label>' +
      '<select id="siM1" class="text-input">' + mediumOptions(state.m1) + '</select></div>' +
      '<div class="field"><label class="f-label">介质 2（右）</label>' +
      '<select id="siM2" class="text-input">' + mediumOptions(state.m2) + '</select></div>' +
      '</div>' +
      '<div id="siCustom1" class="field-row"></div>' +
      '<div id="siCustom2" class="field-row"></div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="siPlay" class="btn">⏸ 暂停</button>' +
      '<span id="siMsg" class="aux-msg"></span></div>' +
      '</section>' +
      '</div>' +
      // 右列：动画 + 结果
      '<div class="split-col">' +
      '<section class="card"><h3>传播动画</h3>' +
      '<div class="canvas-wrap"><canvas id="simICanvas" width="520" height="240"></canvas></div>' +
      '<div class="callout-row" style="margin-top:8px">' +
      '<span style="color:#2563eb">■ 入射</span>&nbsp;&nbsp;' +
      '<span style="color:#ea580c">■ 反射</span>&nbsp;&nbsp;' +
      '<span style="color:#16a34a">■ 透射</span>' +
      '<span class="aux-msg" style="margin-left:auto" id="siLegend"></span></div>' +
      '</section>' +
      '<section class="card"><h3>计算结果</h3>' +
      '<div id="siResult"></div>' +
      '<div id="siFormula" class="formula" style="margin-top:10px"></div>' +
      '</section>' +
      '</div>' +
      '</div>';
  }

  function customFieldsHtml(side) {
    var rho = side === 1 ? state.rho1 : state.rho2;
    var c = side === 1 ? state.c1 : state.c2;
    return '<div class="field"><label class="f-label">ρ₁ 密度 (kg/m³)</label>' +
      '<input id="siRho' + side + '" class="text-input" type="number" min="0" step="0.1" value="' + rho + '"></div>' +
      '<div class="field"><label class="f-label">c₁ 声速 (m/s)</label>' +
      '<input id="siC' + side + '" class="text-input" type="number" min="0" step="1" value="' + c + '"></div>';
  }

  function refreshCustom() {
    var c1 = $('siCustom1'), c2 = $('siCustom2');
    if (!c1 || !c2) return;
    c1.innerHTML = state.m1 === 'custom' ? customFieldsHtml(1) : '';
    c2.innerHTML = state.m2 === 'custom' ? customFieldsHtml(2) : '';
    if (state.m1 === 'custom') bindCustom(1);
    if (state.m2 === 'custom') bindCustom(2);
  }

  function bindCustom(side) {
    var rEl = $('siRho' + side), cEl = $('siC' + side);
    if (rEl) rEl.addEventListener('input', function () {
      var v = parseFloat(rEl.value); state['rho' + side] = isNaN(v) ? 0 : v; recalc();
    });
    if (cEl) cEl.addEventListener('input', function () {
      var v = parseFloat(cEl.value); state['c' + side] = isNaN(v) ? 0 : v; recalc();
    });
  }

  /* ------------------------------ 计算与渲染 ------------------------------ */
  function recalc() {
    var med1 = effectiveMedium(1);
    var med2 = effectiveMedium(2);
    var r = E.interfaceZ({ medium1: med1, medium2: med2 });
    if (!r.ok) {
      last = null;
      var box = $('siResult');
      if (box) box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      var fm = $('siFormula');
      if (fm) fm.innerHTML = '';
      var lg = $('siLegend');
      if (lg) lg.textContent = '';
      return;
    }
    last = r;
    renderResult(r, med1, med2);
  }

  function renderResult(r, med1, med2) {
    var box = $('siResult');
    if (!box) return;
    var stats = [
      { l: 'Z₁ 介质1阻抗', v: num(r.Z1, 1), u: 'rayl' },
      { l: 'Z₂ 介质2阻抗', v: num(r.Z2, 1), u: 'rayl' },
      { l: 'R 压力反射系数', v: num(r.R, 4), u: '' },
      { l: 'T 压力透射系数', v: num(r.T, 4), u: '' },
      { l: 'RI 强度反射', v: num(r.RI, 4), u: '' },
      { l: 'TI 强度透射', v: num(r.TI, 4), u: '' },
      { l: 'TL 传声损失', v: isFinite(r.TL) ? num(r.TL, 2) : '∞', u: 'dB' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';
    box.innerHTML = html;

    var fm = $('siFormula');
    if (fm) {
      fm.innerHTML =
        '<div><span class="fx">Z = ρ·c（rayl）；R = (Z₂−Z₁)/(Z₂+Z₁)；T = 2Z₂/(Z₂+Z₁)</span></div>' +
        '<div><span class="fx">RI = R²；TI = 1−RI；TL = −10·log₁₀(TI) dB</span></div>' +
        '<div class="inline-note" style="margin-top:6px">' + esc(r.notes) + '</div>';
    }
    var lg = $('siLegend');
    if (lg) lg.textContent = 'Z₁≈' + num(r.Z1, 0) + ' rayl，Z₂≈' + num(r.Z2, 0) + ' rayl';
  }

  /* ------------------------------ 实时 Canvas 动画 ------------------------------ */
  function draw() {
    var canvas = $('simICanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var mid = W / 2;                 // 边界线（界面）位置
    var base = H / 2;                // 波形中线
    var amp = H * 0.32;              // 最大视觉振幅

    ctx.clearRect(0, 0, W, H);

    // 背景：左侧介质1、右侧介质2
    ctx.fillStyle = 'rgba(37,99,235,0.06)';
    ctx.fillRect(0, 0, mid, H);
    ctx.fillStyle = 'rgba(22,163,74,0.06)';
    ctx.fillRect(mid, 0, W - mid, H);

    // 界面竖线
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid, 8);
    ctx.lineTo(mid, H - 8);
    ctx.stroke();

    if (!last) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText('请输入有效参数（ρ>0, c>0）', 20, base);
      return;
    }

    var R = last.R, T = last.T;
    var aInc = amp;
    var aRef = amp * Math.abs(R);
    var aTra = amp * Math.abs(T);

    // 各介质可视波长（按声速比例缩放，使波在快介质里更"密"）
    var c1 = effectiveMedium(1).c, c2 = effectiveMedium(2).c;
    var baseLen = 90;
    var k1 = (2 * Math.PI) / baseLen;
    var k2 = (2 * Math.PI) / (baseLen * Math.max(0.2, c2 / c1));

    // 入射波（介质1，向右）：y = A·sin(k1·x − ph)
    drawWave(ctx, 0, mid, base, aInc, 1, k1, -ph, '#2563eb');
    // 反射波（介质1，向左）：y = A·sin(k1·x + ph)
    drawWave(ctx, 0, mid, base, aRef, 1, k1, ph, '#ea580c');
    // 透射波（介质2，向右）：y = A·sin(k2·(x−mid) − ph)
    drawWave(ctx, mid, W, base, aTra, 2, k2, -ph, '#16a34a', mid);
  }

  function drawWave(ctx, x0, x1, base, a, dir, k, phase, color, xOffset) {
    xOffset = xOffset || 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    var step = 2;
    for (var x = x0; x <= x1; x += step) {
      var y = base - a * Math.sin(k * (x - xOffset) + phase);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function loop(ts) {
    if (!playing) { rafId = null; return; }
    if (!lastT) lastT = ts;
    var dt = (ts - lastT) / 1000;     // 秒
    lastT = ts;
    var w = 4;                        // 角频率（视觉速度）
    ph += w * dt;
    if (ph > 1e6) ph = ph % (2 * Math.PI); // 防止溢出
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId == null) { lastT = 0; rafId = requestAnimationFrame(loop); }
  }
  function stopLoop() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ------------------------------ 绑定 ------------------------------ */
  function bind() {
    var m1 = $('siM1'), m2 = $('siM2'), play = $('siPlay');
    if (m1) m1.addEventListener('change', function () {
      state.m1 = m1.value; refreshCustom(); recalc(); draw();
    });
    if (m2) m2.addEventListener('change', function () {
      state.m2 = m2.value; refreshCustom(); recalc(); draw();
    });
    if (play) play.addEventListener('click', function () {
      playing = !playing;
      play.textContent = playing ? '⏸ 暂停' : '▶ 播放';
      if (playing) startLoop(); else stopLoop();
    });
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    refreshCustom();
    bind();
    recalc();
    draw();
    startLoop();
    inited = true;
  }

  function onShow() {
    recalc();
    draw();
    if (playing) startLoop();
  }

  window.SimImpedanceView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
