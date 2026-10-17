/*
 * view-sim-sea.js — 统计能量分析 SEA（两个耦合房间）模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimSea（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-sea" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimSea;

  var DEFAULTS = {
    V1: 100,      // 源室体积 m³
    V2: 100,      // 接收室体积 m³
    S: 10,        // 隔墙面积 m²
    R: 35,        // 隔墙隔声量 dB
    T60_1: 0.6,   // 源室混响时间 s
    T60_2: 0.6,   // 接收室混响时间 s
    f: 1000,      // 分析频率 Hz
    Lw: 90        // 源室声功率级 dB re 1 pW
  };

  // 预设：三档隔声量 + 一个低频小房间（演示「SEA 不适用」告警）
  var PRESETS = [
    { name: '轻质隔墙 R=35dB', v: { V1: 100, V2: 100, S: 10, R: 35, T60_1: 0.6, T60_2: 0.6, f: 1000, Lw: 90 } },
    { name: '重型墙 R=55dB', v: { V1: 100, V2: 100, S: 10, R: 55, T60_1: 0.6, T60_2: 0.6, f: 1000, Lw: 90 } },
    { name: '高隔声 R=70dB', v: { V1: 100, V2: 100, S: 10, R: 70, T60_1: 0.8, T60_2: 0.5, f: 1000, Lw: 90 } },
    { name: '低频小房间（告警）', v: { V1: 10, V2: 10, S: 4, R: 35, T60_1: 0.6, T60_2: 0.6, f: 50, Lw: 90 } }
  ];

  var KEYS = ['V1', 'V2', 'S', 'R', 'T60_1', 'T60_2', 'f', 'Lw'];

  var state = Object.assign({}, DEFAULTS);
  var last = null;    // 最近一次成功的 simulate 结果
  var inited = false;
  var playing = true; // 播放/暂停（动画仅在播放时推进）
  var rafId = null;
  var t0 = 0;         // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;
  var anim = { flow: 0, dir: 1, t1: 1, t2: 0 }; // 流动强度/方向、两室能级归一化
  var partsA = [], partsB = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 科学计数法短格式（能量、损耗因子等跨度极大的量）
  function sci(v, d) {
    if (v == null || isNaN(v)) return '—';
    d = d == null ? 2 : d;
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) return v.toFixed(d);
    var e = Math.floor(Math.log10(a));
    var m = v / Math.pow(10, e);
    return m.toFixed(d) + 'e' + (e >= 0 ? '+' : '') + e;
  }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="sea_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="sea_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.simulate({
      V1: state.V1,
      V2: state.V2,
      S: state.S,
      R: state.R,
      T60_1: state.T60_1,
      T60_2: state.T60_2,
      f: state.f,
      c: 343,
      Lw: state.Lw,
      P2: 0
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

  // 由能级差与净功率流决定动画：能级差越大 → 流动越快越亮；P12 符号决定方向
  function computeAnim(r) {
    if (!r || !r.ok) return;
    var L1 = 10 * Math.log10(Math.max(r.E1dens, 1e-30));
    var L2 = 10 * Math.log10(Math.max(r.E2dens, 1e-30));
    var Lmax = Math.max(L1, L2);
    anim.t1 = clamp(1 - (Lmax - L1) / 40, 0.10, 1);
    anim.t2 = clamp(1 - (Lmax - L2) / 40, 0.10, 1);
    anim.dir = r.P12 >= 0 ? 1 : -1;
    anim.flow = clamp(Math.abs(r.D) / 50, 0, 1); // 声级差 50 dB 对应满速
  }

  function renderResult(r) {
    var box = $('seaResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    var stats = [
      { l: '声级差 D', v: num(r.D, 2), u: 'dB' },
      { l: '源室能量 E₁', v: sci(r.E1, 3), u: 'J' },
      { l: '接收室能量 E₂', v: sci(r.E2, 3), u: 'J' },
      { l: '净传输功率 P₁₂', v: sci(r.P12, 3), u: 'W' },
      { l: '内损耗 η₁', v: sci(r.eta1, 3), u: '' },
      { l: '内损耗 η₂', v: sci(r.eta2, 3), u: '' },
      { l: '耦合损耗 η₁₂', v: sci(r.eta12, 3), u: '' },
      { l: '耦合损耗 η₂₁', v: sci(r.eta21, 3), u: '' },
      { l: '模态数 N₁', v: num(r.N1, 1), u: '' },
      { l: '模态数 N₂', v: num(r.N2, 1), u: '' },
      { l: '源室声级 Lp₁', v: num(r.Lp1, 1), u: 'dB' },
      { l: '接收室声级 Lp₂', v: num(r.Lp2, 1), u: 'dB' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">η_i = 2.2/(f·T60)</span>：η₁ = ' + sci(r.eta1, 4) + '，η₂ = ' + sci(r.eta2, 4) + '（f = ' + num(r.f, 0) + ' Hz）</div>' +
      '<div><span class="fx">η₁₂ = τcS/(4ωV₁) = ' + sci(r.eta12, 4) + '</span>；' +
      '<span class="fx">η₂₁ = η₁₂N₁/N₂ = ' + sci(r.eta21, 4) + '</span>（互易性 η₁₂N₁ = η₂₁N₂，残差 ' + sci(r.recipResidual, 1) + '）</div>' +
      '<div><span class="fx">D = 10log₁₀((E₁/V₁)/(E₂/V₂)) = ' + num(r.D, 2) + ' dB</span>；' +
      '能量比 E₁/E₂ = ' + sci(r.ratioE, 3) + '；耦合损耗因子之比 η₁₂/η₂₁ = ' + num(r.ratioEta, 4) + '</div>' +
      '<div><span class="fx">R = 10log₁₀(1/τ) = ' + num(r.R, 1) + ' dB</span>（τ = ' + sci(r.tau, 3) + '，S = ' + num(r.S, 2) + ' m²）；' +
      '频带 B = ' + num(r.B, 1) + ' Hz，模态密度 n₁ = ' + num(r.n1, 3) + ' 个/Hz</div>' +
      '</div>';

    html += '<div class="data-table" style="margin-top:12px"><table><thead><tr>' +
      '<th>校验项</th><th>关系</th><th>结果</th></tr></thead><tbody>' +
      '<tr><td>能量守恒</td><td>P₁+P₂ = ω(η₁E₁+η₂E₂)</td><td>残差 ' + sci(r.resid, 2) + '（相对）</td></tr>' +
      '<tr><td>互易性</td><td>η₁₂N₁ = η₂₁N₂</td><td>残差 ' + sci(r.recipResidual, 2) + '（相对）</td></tr>' +
      '<tr><td>声级差一致性</td><td>D = Lp₁ − Lp₂</td><td>' + num(r.Lp1 - r.Lp2, 4) + ' dB</td></tr>' +
      '<tr><td>功率流恒等式</td><td>P₁₂ = P₁ − ωη₁E₁</td><td>' + sci(r.P12, 4) + ' W</td></tr>' +
      '<tr><td>弱耦合判据</td><td>η₁₂/η₁ = ' + num(r.eta12 / r.eta1, 3) + '</td><td>' +
      (r.weakCoupling ? '非弱耦合（SEA 偏差大）' : '弱耦合成立') + '</td></tr>' +
      '</tbody></table></div>';

    if (r.warn) {
      html += '<div class="callout-row warn" style="margin-top:10px">⚠ ' + esc(r.warnMsg) +
        '（min(N₁,N₂) = ' + num(r.Nmin, 2) + '）</div>';
    }

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

  // 房间内的扩散场粒子（归一化坐标，越界回绕）
  function ensureParts(arr, n) {
    while (arr.length < n) {
      arr.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.10,
        vy: (Math.random() - 0.5) * 0.10
      });
    }
    if (arr.length > n) arr.length = n;
  }

  function stepParts(arr, dt, sp) {
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      p.x += p.vx * dt * sp;
      p.y += p.vy * dt * sp;
      if (p.x < 0) p.x += 1; else if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1; else if (p.y > 1) p.y -= 1;
    }
  }

  function drawParticles(ctx, arr, x, y, w, h, t) {
    var cnt = Math.round(20 + 90 * t);
    ensureParts(arr, cnt);
    ctx.fillStyle = 'rgba(56,189,248,' + (0.18 + 0.55 * t).toFixed(3) + ')';
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      ctx.beginPath();
      ctx.arc(x + p.x * w, y + p.y * h, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function arrowGlyph(ctx, x, y, dir, alpha) {
    var L = 9;
    ctx.strokeStyle = 'rgba(251,191,36,' + alpha.toFixed(3) + ')';
    ctx.fillStyle = 'rgba(251,191,36,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - dir * L, y);
    ctx.lineTo(x + dir * L, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + dir * (L + 4), y);
    ctx.lineTo(x + dir * L, y - 4);
    ctx.lineTo(x + dir * L, y + 4);
    ctx.closePath();
    ctx.fill();
  }

  // 主画布：两个相邻房间 + 隔墙 + 能量密度粒子 + 净功率流箭头动画 + τ/R/S 标注
  function drawRooms(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var pad = 20, wallW = 12, top = 40;
    var roomW = (W - 2 * pad - wallW) / 2;
    var roomH = H - pad - top - 24;
    var y0 = top;
    var x1 = pad, xw = pad + roomW, x2 = xw + wallW;

    // 房间底色：按归一化能级 t 着色（越亮 = 能量密度越高）
    var bgA = 'rgba(56,189,248,' + (0.05 + 0.28 * anim.t1).toFixed(3) + ')';
    var bgB = 'rgba(56,189,248,' + (0.05 + 0.28 * anim.t2).toFixed(3) + ')';
    ctx.fillStyle = bgA; ctx.fillRect(x1, y0, roomW, roomH);
    ctx.fillStyle = bgB; ctx.fillRect(x2, y0, roomW, roomH);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
    ctx.strokeRect(x1, y0, roomW, roomH);
    ctx.strokeRect(x2, y0, roomW, roomH);

    // 扩散场粒子（房间内运动速度随能级升高）
    drawParticles(ctx, partsA, x1 + 4, y0 + 4, roomW - 8, roomH - 8, anim.t1);
    drawParticles(ctx, partsB, x2 + 4, y0 + 4, roomW - 8, roomH - 8, anim.t2);

    // 隔墙
    ctx.fillStyle = '#475569';
    ctx.fillRect(xw, y0, wallW, roomH);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    ctx.strokeRect(xw, y0, wallW, roomH);

    // 净功率流箭头：沿隔墙纵向排布，随 P12 方向流动；能级差越大越快越亮
    var alpha = 0.30 + 0.70 * anim.flow;
    var spacing = 34;
    var speed = 24 + 150 * anim.flow;                       // px/s
    var off = ((t0 * speed) % spacing + spacing) % spacing;
    for (var yy = y0 + off; yy < y0 + roomH - 6; yy += spacing) {
      arrowGlyph(ctx, xw + wallW / 2, yy, anim.dir, alpha);
    }

    // 标注
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px sans-serif';
    ctx.fillText('房间 1（源室）  V₁ = ' + num(r.V1, 1) + ' m³，T60₁ = ' + num(r.T60_1, 2) + ' s', x1 + 6, 20);
    ctx.fillText('房间 2（接收室）  V₂ = ' + num(r.V2, 1) + ' m³，T60₂ = ' + num(r.T60_2, 2) + ' s', x2 + 6, 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('能量密度 E₁/V₁ = ' + sci(r.E1dens, 3) + ' J/m³', x1 + 6, y0 + roomH + 16);
    ctx.fillText('能量密度 E₂/V₂ = ' + sci(r.E2dens, 3) + ' J/m³', x2 + 6, y0 + roomH + 16);

    // 隔墙参数标注（墙中部右侧）
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '11px sans-serif';
    var cxw = xw + wallW / 2;
    ctx.fillText('S=' + num(r.S, 1) + 'm²', cxw, y0 - 8);
    ctx.fillText('R=' + num(r.R, 0) + 'dB', cxw, y0 + roomH + 16);
    ctx.fillText('τ=' + sci(r.tau, 1), cxw, y0 + roomH + 30);
    ctx.textAlign = 'left';

    // 顶部说明
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('箭头 = 净功率流 P₁₂ = ' + sci(r.P12, 2) + ' W（' +
      (r.P12 >= 0 ? '1 → 2' : '2 → 1') + '）；能级差越大流动越快越亮', pad, H - 6);
  }

  // 副图：两室能量柱状图（dB 刻度）+ 声级差 D 大号读数
  function drawBars(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var pad = 18, headH = 78, footH = 30;
    var pw = W - 2 * pad, ph = H - headH - footH;
    var top = headH;

    // 大号 D 读数
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText('声级差 D = Lp₁ − Lp₂', pad, 22);
    ctx.fillStyle = r.warn ? '#fbbf24' : '#38bdf8';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(num(r.D, 1) + ' dB', pad, 56);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText('Lp₁ = ' + num(r.Lp1, 1) + ' dB   Lp₂ = ' + num(r.Lp2, 1) + ' dB', pad + 150, 56);
    if (r.warn) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '11px sans-serif';
      ctx.fillText('⚠ SEA 不适用（N < 3）', pad + 150, 34);
    }

    // 能量柱状图（60 dB 窗口，按能量密度的相对 dB 高度）
    var L1 = 10 * Math.log10(Math.max(r.E1dens, 1e-30));
    var L2 = 10 * Math.log10(Math.max(r.E2dens, 1e-30));
    var Lmax = Math.max(L1, L2);
    function hOf(L) { return ph * clamp(1 - (Lmax - L) / 60, 0.03, 1); }
    var bw = pw * 0.30;
    var gap = pw * 0.13;
    var x0 = pad + gap;
    var bars = [
      { x: x0, L: L1, E: r.E1, c: '#38bdf8', lab: '房间 1（源室）' },
      { x: x0 + bw + gap, L: L2, E: r.E2, c: '#a78bfa', lab: '房间 2（接收室）' }
    ];

    // 基线
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, top + ph);
    ctx.lineTo(pad + pw, top + ph);
    ctx.stroke();

    bars.forEach(function (b) {
      var h = hOf(b.L);
      ctx.fillStyle = b.c;
      ctx.fillRect(b.x, top + ph - h, bw, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px sans-serif';
      ctx.fillText(b.lab, b.x + bw / 2, top + ph + 16);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText('E = ' + sci(b.E, 2) + ' J', b.x + bw / 2, top + ph - h - 8);
      ctx.fillText(num(b.L, 1) + ' dB（能量密度）', b.x + bw / 2, top + ph + 30);
    });
    ctx.textAlign = 'left';

    // 底部：净功率流与守恒残差
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('净传输功率 P₁₂ = ' + sci(r.P12, 3) + ' W   能量守恒残差 = ' + sci(r.resid, 1) +
      '   模态数 N₁ = ' + num(r.N1, 1) + '，N₂ = ' + num(r.N2, 1), pad, H - 8);
  }

  function draw() {
    var s1 = setup('seaCanvas', 340);
    if (s1) {
      if (last && last.ok) drawRooms(s1.ctx, s1.w, s1.h, last);
      else drawInvalid(s1.ctx, s1.w, s1.h);
    }
    var s2 = setup('seaBars', 300);
    if (s2) {
      if (last && last.ok) drawBars(s2.ctx, s2.w, s2.h, last);
      else drawInvalid(s2.ctx, s2.w, s2.h);
    }
  }

  function loop() {
    // 视图被隐藏（离开页面）时自动停掉动画，避免后台空转
    var root = $('view-sim-sea');
    if (!root || root.hidden) { stopAnim(); return; }
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间（仅播放时推进）
      stepParts(partsA, 1 / 60, 0.6 + anim.t1);
      stepParts(partsB, 1 / 60, 0.6 + anim.t2);
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
    var btn = $('seaPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
    if (playing && !rafId) startAnim();
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('seaInputs');
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
    var play = $('seaPlay'); if (play) play.addEventListener('click', togglePlay);
    var reset = $('seaReset'); if (reset) reset.addEventListener('click', resetAll);
    PRESETS.forEach(function (p, i) {
      var b = $('seaPreset' + i);
      if (b) b.addEventListener('click', function () { loadPreset(i); });
    });
  }

  function flash(msg) {
    var el = $('seaMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset(i) {
    state = Object.assign({}, PRESETS[i].v);
    syncInputs();
    recalc();
    flash('已载入：' + PRESETS[i].name);
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    KEYS.forEach(function (k) {
      var el = $('sea_' + k);
      if (el) el.value = state[k];
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-sea');
    if (!root) return;
    var presetBtns = '';
    PRESETS.forEach(function (p, i) {
      presetBtns += '<button id="seaPreset' + i + '" class="btn' + (i === 0 ? '' : ' ghost') + '">' + esc(p.name) + '</button>';
    });
    root.innerHTML =
      '<div class="page-head"><h2>统计能量分析 SEA（两耦合房间）模拟器</h2>' +
      '<p class="hint">两个房间经一块面积 S、透射系数 τ 的隔墙耦合：由混响时间反推内损耗 η=2.2/(f·T60)，由 Craik 公式得耦合损耗 η₁₂=τcS/(4ωV₁)，解稳态功率平衡方程组得两室能量与声级差 D=10log₁₀((E₁/V₁)/(E₂/V₂))。左侧为房间能量密度与净功率流动画，右侧为能量柱状图与 D 读数。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="seaInputs">' +
      field('V1', '源室体积 V₁', DEFAULTS.V1, 'm³', 1, 5) +
      field('V2', '接收室体积 V₂', DEFAULTS.V2, 'm³', 1, 5) +
      field('S', '隔墙面积 S', DEFAULTS.S, 'm²', 0.5, 0.5) +
      field('R', '隔声量 R', DEFAULTS.R, 'dB', 0, 1) +
      field('T60_1', '源室混响 T60₁', DEFAULTS.T60_1, 's', 0.05, 0.05) +
      field('T60_2', '接收室混响 T60₂', DEFAULTS.T60_2, 's', 0.05, 0.05) +
      field('f', '分析频率 f', DEFAULTS.f, 'Hz', 20, 10) +
      field('Lw', '源声功率级 Lw', DEFAULTS.Lw, 'dB', 30, 1) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      presetBtns +
      '<button id="seaReset" class="btn ghost">重置参数</button>' +
      '<span id="seaMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 功率流与能量密度动画</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="seaPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">房间底色与粒子密度表示能量密度 E/V 高低；隔墙上的箭头表示净功率流 P₁₂，方向由能级高低决定（高能级 → 低能级），能级差越大流动越快越亮。</span></div>' +
      '<canvas class="canvas-wrap" id="seaCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果与校验</h3><div id="seaResult"></div></section>' +
      '<section class="card"><h3>能量柱状图与声级差</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<span class="aux-msg">柱高按能量密度的相对分贝（60 dB 窗口）绘制，随参数实时变化；顶部为声级差 D 的大号读数。</span></div>' +
      '<canvas class="canvas-wrap" id="seaBars"></canvas></section>' +
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

  window.SimSeaView = { init: init, onShow: onShow, onHide: stopAnim };
})(typeof window !== 'undefined' ? window : this);
