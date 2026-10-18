/*
 * view-sim-echo.js — 回声测距模拟器视图（交互 + Canvas 实时动画）
 * 依赖：window.SimEcho（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-echo" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimEcho;

  var C_AIR = 343;      // 空气声速 m/s
  var C_WATER = 1500;   // 水声速 m/s

  var state = {
    medium: 'air',      // air / water
    c: C_AIR,
    mode: 'dist',       // dist（已知距离）/ time（已知时延）
    d: 100,             // 距离 m
    t: 0.5,             // 往返时延 s
    dt: 1e-4,           // 时间分辨率 s
    playing: false
  };

  var last = null;

  // 动画相关
  var canvas, ctx, LW = 600, LH = 240;
  var clock = 0;            // 播放累计屏幕时间（秒）
  var lastTs = 0;
  var rafId = null;
  var inited = false;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function mediumC() { return state.medium === 'water' ? C_WATER : C_AIR; }

  /* ------------------------------ 骨架 DOM ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-echo');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>回声测距模拟器</h2>' +
      '<p class="hint">脉冲回波（回声）测距：声源发射短脉冲，遇目标反射后返回，按往返时延计算距离。' +
      '支持「已知距离求时延」与「已知时延求距离」两种模式，并给出球状扩散衰减与距离分辨率。' +
      'Canvas 实时展示脉冲往返传播（水中脉冲更快、回波更弱）。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3>参数设置</h3>' +
      '<div class="field-row">' +
      '<div class="field"><label class="f-label">介质（声速 c）</label>' +
      '<select id="ecMedium" class="text-input">' +
      '<option value="air">空气（c = 343 m/s）</option>' +
      '<option value="water">水（c = 1500 m/s）</option>' +
      '</select></div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:10px">' +
      '<div class="field"><label class="f-label">计算模式</label>' +
      '<div class="btn-row toolbar">' +
      '<button id="ecModeDist" class="btn" type="button">已知距离</button>' +
      '<button id="ecModeTime" class="btn ghost" type="button">已知时延</button>' +
      '</div></div></div>' +
      '<div id="ecFieldD" class="field-row" style="margin-top:10px">' +
      '<div class="field"><label class="f-label">距离 d</label>' +
      '<input id="ecD" class="text-input" type="number" data-k="d" value="100" min="0" step="1"></div>' +
      '</div>' +
      '<div id="ecFieldT" class="field-row" style="margin-top:10px" hidden>' +
      '<div class="field"><label class="f-label">往返时延 t</label>' +
      '<input id="ecT" class="text-input" type="number" data-k="t" value="0.5" min="0" step="0.01"></div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:10px">' +
      '<div class="field"><label class="f-label">时间分辨率 dt</label>' +
      '<input id="ecDt" class="text-input" type="number" data-k="dt" value="0.0001" min="0" step="0.0001"></div>' +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:12px">' +
      '<button id="ecPreset" class="btn" type="button">载入例题</button>' +
      '<button id="ecReset" class="btn ghost" type="button">重置</button>' +
      '<button id="ecPlay" class="btn ghost" type="button">播放</button>' +
      '</div>' +
      '<div id="ecMsg" class="aux-msg"></div>' +
      '</section></div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>传播动画</h3>' +
      '<canvas class="canvas-wrap" id="ecCanvas" width="600" height="240" style="width:100%;height:240px"></canvas>' +
      '</section>' +
      '<section class="card"><h3>计算结果</h3>' +
      '<div id="ecStats" class="stat-grid"></div>' +
      '<div id="ecFormula" class="formula" style="margin-top:12px"></div>' +
      '</section>' +
      '</div>' +
      '</div>';
  }

  /* ------------------------------ 模式切换 ------------------------------ */
  function applyMode() {
    var fd = $('ecFieldD'), ft = $('ecFieldT');
    var bd = $('ecModeDist'), bt = $('ecModeTime');
    if (state.mode === 'dist') {
      if (fd) fd.hidden = false;
      if (ft) ft.hidden = true;
      if (bd) bd.style.background = '#2563eb';
      if (bd) bd.style.color = '#fff';
      if (bt) bt.style.background = '';
      if (bt) bt.style.color = '';
    } else {
      if (fd) fd.hidden = true;
      if (ft) ft.hidden = false;
      if (bt) bt.style.background = '#2563eb';
      if (bt) bt.style.color = '#fff';
      if (bd) bd.style.background = '';
      if (bd) bd.style.color = '';
    }
  }

  /* ------------------------------ 计算与渲染 ------------------------------ */
  function recalc() {
    state.c = mediumC();
    var r = E.range({ mode: state.mode, c: state.c, d: state.d, t: state.t, dt: state.dt });
    last = r;
    if (!r.ok) {
      var msg = $('ecMsg');
      if (msg) msg.textContent = '错误：' + r.error;
      var st = $('ecStats');
      if (st) st.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      var fo = $('ecFormula');
      if (fo) fo.innerHTML = '';
      return;
    }
    var msg2 = $('ecMsg');
    if (msg2) msg2.textContent = '已计算：' + (state.mode === 'dist' ? '已知距离求时延' : '已知时延求距离') +
      '，介质 ' + (state.medium === 'water' ? '水' : '空气') + '（c = ' + num(r.c, 0) + ' m/s）。';
    renderStats(r);
    renderFormula(r);
  }

  function renderStats(r) {
    var box = $('ecStats');
    if (!box) return;
    var stats = [
      { l: '距离 d', v: num(r.d, 2), u: 'm' },
      { l: '往返时延 t', v: num(r.t, 4), u: 's' },
      { l: '衰减 levelDropDb', v: num(r.levelDropDb, 2), u: 'dB' },
      { l: '分辨率 resolution', v: num(r.resolution, 4), u: 'm' }
    ];
    var html = '';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    box.innerHTML = html;
  }

  function renderFormula(r) {
    var box = $('ecFormula');
    if (!box) return;
    var f = r.mode === 'dist'
      ? 't = 2d / c = 2·' + num(r.d, 2) + ' / ' + num(r.c, 0) + ' = ' + num(r.t, 4) + ' s'
      : 'd = c·t / 2 = ' + num(r.c, 0) + '·' + num(r.t, 4) + ' / 2 = ' + num(r.d, 2) + ' m';
    var html =
      '<div><span class="fx">' + esc(f) + '</span></div>' +
      '<div class="inline-note">球状扩散衰减：levelDropDb = 20·log₁₀(2d) = ' + num(r.levelDropDb, 2) + ' dB；' +
      '距离分辨率 = c·dt/2 = ' + num(r.c, 0) + '·' + num(r.dt, 4) + '/2 = ' + num(r.resolution, 4) + ' m。</div>';
    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function sizeCanvas() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = LW * dpr;
    canvas.height = LH * dpr;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 回波可见振幅（仅用于动画示意：物理振幅 = 10^(-drop/20)，过小不可见，故做压缩映射）
  function visAmp(dropDb) {
    var amp = Math.pow(10, -dropDb / 20);
    return clamp(Math.pow(amp, 0.25), 0.08, 1);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, LW, LH);

    var xSrc = 70, xTgt = LW - 70, yMid = LH * 0.52;

    // 背景基线
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xSrc, yMid);
    ctx.lineTo(xTgt, yMid);
    ctx.stroke();
    ctx.setLineDash([]);

    // 声源与目标
    function node(x, label, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, yMid, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, yMid - 18);
    }
    node(xSrc, '声源', '#2563eb');
    node(xTgt, '目标 / 反射体', '#dc2626');

    // 距离标注
    if (last && last.ok) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('d = ' + num(last.d, 2) + ' m', (xSrc + xTgt) / 2, yMid - 28);
    }

    // 脉冲
    var phase = 0, status = '待机';
    if (last && last.ok) {
      var screenDur = clamp(last.t * 3, 0.6, 5); // 屏幕单程往返时长，随 c、d 变化（水更快）
      phase = (clock / screenDur) % 1;
      var gap = xTgt - xSrc;
      var x, amp, going;
      if (phase < 0.5) {
        var f1 = phase / 0.5;
        x = xSrc + f1 * gap;
        amp = 1;            // 去程：满幅发射
        going = true;
        status = '去程（声源 → 目标）';
      } else {
        var f2 = (phase - 0.5) / 0.5;
        x = xTgt - f2 * gap;
        amp = visAmp(last.levelDropDb); // 回程：受球状扩散衰减
        going = false;
        status = '回程（目标 → 声源，回波衰减）';
      }

      // 拖尾
      for (var i = 1; i <= 5; i++) {
        var tx = going ? x - i * 6 : x + i * 6;
        ctx.globalAlpha = 0.16 * amp * (1 - i / 6);
        ctx.fillStyle = going ? '#3b82f6' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(tx, yMid, (going ? 7 : 7 * amp) * (1 - i / 8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 脉冲主体
      var r = (going ? 9 : 9 * amp);
      var grad = ctx.createRadialGradient(x, yMid, 0, x, yMid, r * 2.2);
      grad.addColorStop(0, going ? 'rgba(59,130,246,0.95)' : 'rgba(245,158,11,0.95)');
      grad.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, yMid, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = going ? '#1d4ed8' : '#b45309';
      ctx.beginPath();
      ctx.arc(x, yMid, r, 0, Math.PI * 2);
      ctx.fill();

      // 时钟
      ctx.fillStyle = '#0f172a';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      var nowT = phase * last.t;
      ctx.fillText('当前 t = ' + num(nowT, 3) + ' s  /  往返 ' + num(last.t, 3) + ' s', xSrc, LH - 18);
      ctx.fillStyle = '#64748b';
      ctx.fillText(status, xSrc, LH - 2);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('请输入有效参数以开始动画', xSrc, LH - 18);
    }
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    var dtr = (ts - lastTs) / 1000;
    lastTs = ts;
    if (state.playing && last && last.ok) {
      var screenDur = clamp(last.t * 3, 0.6, 5);
      clock += dtr;
      if (clock > screenDur) clock -= screenDur; // 循环往返
    }
    draw();
    rafId = requestAnimationFrame(frame);
  }

  /* ------------------------------ 交互 ------------------------------ */
  function flash(msg) {
    var el = $('ecMsg');
    if (el) el.textContent = msg;
  }

  function loadPreset() {
    state.medium = 'air'; state.c = C_AIR;
    state.mode = 'dist'; state.d = 100; state.t = 0.5; state.dt = 1e-4;
    var m = $('ecMedium'); if (m) m.value = 'air';
    var d = $('ecD'); if (d) d.value = '100';
    var t = $('ecT'); if (t) t.value = '0.5';
    var dt = $('ecDt'); if (dt) dt.value = '0.0001';
    applyMode();
    recalc();
    flash('已载入例题：空气 c=343，d=100 m（t≈' + num(last.ok ? last.t : 0, 4) + ' s）。');
  }

  function reset() {
    state.medium = 'air'; state.c = C_AIR;
    state.mode = 'dist'; state.d = 100; state.t = 0.5; state.dt = 1e-4; state.playing = false;
    var m = $('ecMedium'); if (m) m.value = 'air';
    var d = $('ecD'); if (d) d.value = '100';
    var t = $('ecT'); if (t) t.value = '0.5';
    var dt = $('ecDt'); if (dt) dt.value = '0.0001';
    var p = $('ecPlay'); if (p) p.textContent = '播放';
    applyMode();
    recalc();
    flash('已重置为默认参数。');
  }

  function togglePlay() {
    state.playing = !state.playing;
    var p = $('ecPlay');
    if (p) p.textContent = state.playing ? '暂停' : '播放';
    if (state.playing && last && last.ok) clock = 0; // 从头播放
  }

  function bind() {
    var med = $('ecMedium');
    if (med) med.addEventListener('change', function () { state.medium = med.value; recalc(); });

    var md = $('ecModeDist');
    if (md) md.addEventListener('click', function () { state.mode = 'dist'; applyMode(); recalc(); });
    var mt = $('ecModeTime');
    if (mt) mt.addEventListener('click', function () { state.mode = 'time'; applyMode(); recalc(); });

    ['ecD', 'ecT', 'ecDt'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        if (id === 'ecD') state.d = isNaN(v) ? 0 : v;
        else if (id === 'ecT') state.t = isNaN(v) ? 0 : v;
        else state.dt = isNaN(v) ? 1e-4 : v;
        recalc();
      });
    });

    var pre = $('ecPreset'); if (pre) pre.addEventListener('click', loadPreset);
    var rs = $('ecReset'); if (rs) rs.addEventListener('click', reset);
    var pl = $('ecPlay'); if (pl) pl.addEventListener('click', togglePlay);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function init() {
    if (inited) return;
    buildSkeleton();
    canvas = $('ecCanvas');
    if (canvas) ctx = canvas.getContext('2d');
    sizeCanvas();
    bind();
    applyMode();
    recalc();
    if (!rafId) rafId = requestAnimationFrame(frame);
    inited = true;
  }

  function onShow() {
    if (canvas) sizeCanvas();   // 容器可见后重新适配尺寸
    recalc();
  }

  window.SimEchoView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
