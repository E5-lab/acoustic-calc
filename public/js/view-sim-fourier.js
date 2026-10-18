/*
 * view-sim-fourier.js — 傅里叶波形合成与频谱泄漏（含窗函数）模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimFourier（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-fourier" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimFourier;

  var DEFAULTS = {
    kind: 'square',   // 波形类型
    N: 15,            // 谐波数
    f0: 100,          // 基频 Hz
    fs: 16000,        // 采样率 Hz
    M: 512,           // DFT 长度
    win: 'rect',      // 窗函数
    fIn: 1000,        // 被分析单频 Hz（1000 / 31.25 = 32，整 bin）
    cycles: 2,        // 时域显示周期数
    samples: 1024     // 时域采样点数
  };

  // 载入例题：方波 15 次谐波 + 矩形窗，单频正好落在 bin 32
  var PRESET = { kind: 'square', N: 15, f0: 100, fs: 16000, M: 512, win: 'rect', fIn: 1000, cycles: 2, samples: 1024 };

  var KEYS = ['N', 'f0', 'fs', 'fIn', 'cycles'];

  var KIND_OPTS = [
    { v: 'square', t: '方波（奇次谐波 1/k）' },
    { v: 'saw', t: '锯齿波（(−1)^(k+1)/k）' },
    { v: 'triangle', t: '三角波（奇次 1/k²）' },
    { v: 'rectified', t: '全波整流正弦（余弦级数）' }
  ];
  var WIN_OPTS = [
    { v: 'rect', t: '矩形窗（旁瓣 −13.3 dB）' },
    { v: 'hann', t: 'Hann 窗（旁瓣 −31.5 dB）' },
    { v: 'hamming', t: 'Hamming 窗（旁瓣 −43 dB）' },
    { v: 'blackman', t: 'Blackman 窗（旁瓣 −58 dB）' }
  ];
  var M_OPTS = [256, 512, 1024];

  var STEP = 0.18; // 每 0.18 s 加入一次谐波

  var state = Object.assign({}, DEFAULTS);
  var last = null;    // 最近一次成功的 simulate 结果
  var inited = false;
  var playing = true; // 播放/暂停（动画仅在播放时推进）
  var rafId = null;
  var t0 = 0;         // 动画累计时间（秒，仅播放时增长）
  var lastStep = 0;
  var nAnim = 1;      // 动画当前谐波数（1 → N 循环）
  var DPR = 1;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="sf_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="sf_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  function selectField(id, label, opts, cur) {
    var inner = '<div class="field"><label class="f-label" for="' + id + '">' + esc(label) + '</label>' +
      '<select class="text-input" id="' + id + '">';
    opts.forEach(function (o) {
      var v = typeof o === 'object' ? o.v : o;
      var t = typeof o === 'object' ? o.t : o;
      inner += '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(t) + '</option>';
    });
    return inner + '</select></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.simulate({
      kind: state.kind,
      N: state.N,
      f0: state.f0,
      fs: state.fs,
      M: state.M,
      win: state.win,
      fIn: state.fIn,
      cycles: state.cycles,
      samples: state.samples
    });
    last = r.ok ? r : null;
    if (nAnim > state.N) nAnim = state.N;
    if (nAnim < 1) nAnim = 1;
    renderResult(r);
    if (!r.ok) {
      stopAnim(); // 参数无效：显示错误并停掉动画
    } else if (playing && !rafId) {
      startAnim();
    }
  }

  function renderResult(r) {
    var box = $('sfResult');
    if (!box) return;
    if (!r || !r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r ? r.error : '参数无效') + '</div>';
      return;
    }
    var stats = [
      { l: 'Gibbs 过冲', v: num(r.overshoot, 4), u: '' },
      { l: '过冲（相对幅值 1）', v: num(r.overshootPct, 2), u: '%' },
      { l: '过冲（相对跳变 2）', v: num(r.overshootJumpPct, 2), u: '%' },
      { l: 'RMS 误差（对理想波）', v: num(r.rmsError, 4), u: '' },
      { l: '合成波 RMS', v: num(r.rms, 4), u: '' },
      { l: '主瓣宽度', v: num(r.mainlobeWidthHz, 2), u: 'Hz' },
      { l: '主瓣宽度', v: num(r.mainlobeWidthBins, 0), u: 'bin' },
      { l: '最高旁瓣电平', v: r.sidelobeDb == null ? '—' : num(r.sidelobeDb, 2), u: 'dB' },
      { l: '窗相干增益 CG', v: num(r.cg, 4), u: '' },
      { l: '峰值频率', v: num(r.peakFreq, 2), u: 'Hz' },
      { l: '幅度校正 A', v: r.peakAmp == null ? '—' : num(r.peakAmp, 4), u: '' },
      { l: 'bin 偏移', v: num(r.binOffset, 3), u: 'bin' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">x(t) = Σ 谐波（N = ' + r.N + '，f₀ = ' + num(r.f0, 1) + ' Hz）</span>；' +
      '过冲 ' + num(r.overshoot, 4) + '（Gibbs 极限 1.17898），RMS 误差 ' + num(r.rmsError, 4) + '</div>' +
      '<div><span class="fx">X[k] = Σ x[n]·w[n]·exp(−2πi·kn/M)</span>（' + esc(r.win) + ' 窗，M = ' + r.M +
      '，Δf = fs/M = ' + num(r.df, 3) + ' Hz）；f_in = ' + num(r.fIn, 3) + ' Hz → bin ' + num(r.binIndex, 3) +
      '（' + (r.onBin ? '整 bin，无泄漏' : '非整 bin，泄漏') + '）</div>' +
      '<div><span class="fx">主瓣 ' + num(r.mainlobeWidthBins, 0) + ' bin = ' + num(r.mainlobeWidthHz, 2) + ' Hz</span>' +
      '；<span class="fx">最高旁瓣 ' + (r.sidelobeDb == null ? '—' : num(r.sidelobeDb, 2)) + ' dB</span>' +
      '；相干增益 CG = ' + num(r.cg, 4) + '，幅度校正 A = 2|X|/(M·CG) = ' + (r.peakAmp == null ? '—' : num(r.peakAmp, 4)) + '</div>' +
      '</div>';

    if (r.alias) {
      html += '<div class="callout-row error" style="margin-top:10px">混叠告警：f_in = ' + num(r.fIn, 2) +
        ' Hz 超过奈奎斯特频率 ' + num(r.nyquist, 2) + ' Hz，折叠到 f_alias = ' + num(r.aliasFreq, 2) + ' Hz（采样前需抗混叠滤波）。</div>';
    } else {
      html += '<div class="callout-row" style="margin-top:10px">f_in = ' + num(r.fIn, 2) + ' Hz ≤ 奈奎斯特 ' +
        num(r.nyquist, 2) + ' Hz，无混叠。</div>';
    }

    box.innerHTML = html;

    var nb = $('sfNotes');
    if (nb) {
      var s = '';
      r.notes.forEach(function (n) { s += '<li>' + esc(n) + '</li>'; });
      nb.innerHTML = s;
    }
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

  function fmtFreq(f) {
    return f >= 1000 ? num(f / 1000, f >= 10000 ? 0 : 2) + ' kHz' : num(f, 0) + ' Hz';
  }

  // 主画布：理想波形（虚线）+ 当前谐波数合成波形（实线）+ Gibbs 过冲标注
  function drawWave(ctx, W, H, s) {
    drawBg(ctx, W, H);
    var padL = 46, padR = 14, padT = 28, padB = 30;
    var pw = W - padL - padR, ph = H - padT - padB;
    var yMax = 1.6;
    function X(i) { return padL + pw * (i / (s.samples - 1)); }
    function Y(v) { return padT + ph * (1 - (v + yMax) / (2 * yMax)); }

    ctx.font = '11px sans-serif';

    // ±1 参考线（理想稳态幅值）
    [1, -1].forEach(function (lv) {
      var y = Y(lv);
      ctx.strokeStyle = 'rgba(148,163,184,0.30)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + pw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(lv > 0 ? '+1' : '−1', padL - 6, y + 4);
      ctx.textAlign = 'left';
    });

    // 周期分界线
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.setLineDash([3, 5]);
    for (var c = 1; c < s.cycles; c++) {
      var xc = padL + pw * (c / s.cycles);
      ctx.beginPath();
      ctx.moveTo(xc, padT);
      ctx.lineTo(xc, padT + ph);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 零线
    var y0 = Y(0);
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + pw, y0);
    ctx.stroke();

    // 理想波形（虚线）
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (var i = 0; i < s.samples; i++) {
      var px = X(i), py = Y(s.ideal[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 合成波形（实线）
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < s.samples; i++) {
      px = X(i); py = Y(s.x[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Gibbs 过冲标注：|x| 最大点
    var mi = 0, mv = 0;
    for (i = 0; i < s.samples; i++) {
      var a = Math.abs(s.x[i]);
      if (a > mv) { mv = a; mi = i; }
    }
    var gx = X(mi), gy = Y(s.x[mi]);
    ctx.strokeStyle = 'rgba(248,113,113,0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, Y(1));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillText('过冲 ' + num(mv, 4) + '（' + num((mv - 1) * 100, 2) + '%）',
      Math.max(padL + 54, Math.min(gx, padL + pw - 54)), gy - 10);
    ctx.textAlign = 'left';

    // 说明文字
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('当前谐波数 N = ' + s.N + ' / ' + state.N + '（' + esc(KIND_LABEL(s.kind)) + '，f₀ = ' + num(s.f0, 1) + ' Hz）', padL, 18);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('实线 = ' + s.N + ' 次谐波叠加；虚线 = 理想稳态波形（±1）', padL, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText('时间 →（' + num(s.cycles, 0) + ' 个周期 = ' + num(s.span * 1000, 2) + ' ms）', padL + pw, H - 8);
    ctx.textAlign = 'left';
  }

  function KIND_LABEL(k) {
    for (var i = 0; i < KIND_OPTS.length; i++) if (KIND_OPTS[i].v === k) return KIND_OPTS[i].t.split('（')[0];
    return k;
  }

  // 副画布：加窗后的 dB 谱 + 主瓣宽度 + 最高旁瓣标注 + 混叠标记
  function drawSpec(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var padL = 48, padR = 14, padT = 26, padB = 36;
    var pw = W - padL - padR, ph = H - padT - padB;
    var half = r.M >> 1;
    var fMax = r.fs / 2;
    var lo = E.DB_FLOOR, hi = 0;
    function X(f) { return padL + pw * (f / fMax); }
    function Y(db) { return padT + ph * (1 - (db - lo) / (hi - lo)); }

    ctx.font = '11px sans-serif';

    // dB 网格
    ctx.textAlign = 'right';
    [0, -20, -40, -60, -80, -100, -120].forEach(function (db) {
      var y = Y(db);
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + pw, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(String(db), padL - 6, y + 4);
    });

    // 频率刻度
    ctx.textAlign = 'center';
    for (var q = 1; q <= 4; q++) {
      var f = fMax * q / 4;
      var x = X(f);
      ctx.strokeStyle = 'rgba(148,163,184,0.15)';
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ph);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(fmtFreq(f), Math.max(padL + 22, Math.min(x, padL + pw - 22)), padT + ph + 14);
    }
    ctx.textAlign = 'left';

    // 主瓣（第一零点宽度）阴影
    var ml = r.mainlobeWidthHz || 0;
    var x1 = X(Math.max(0, r.peakFreq - ml / 2)), x2 = X(Math.min(fMax, r.peakFreq + ml / 2));
    ctx.fillStyle = 'rgba(56,189,248,0.14)';
    ctx.fillRect(x1, padT, Math.max(1, x2 - x1), ph);

    // 频谱曲线（0 .. fs/2）
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var k = 0; k <= half; k++) {
      var px = X(r.freq[k]), py = Y(r.db[k]);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 峰值标记
    var pxp = X(r.peakFreq), pyp = Y(0);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(pxp, pyp, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillText('峰值 ' + num(r.peakFreq, 1) + ' Hz', Math.max(padL + 40, Math.min(pxp, padL + pw - 40)), padT - 8);
    if (x2 - x1 > 60) {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText('主瓣 ' + num(r.mainlobeWidthBins, 0) + ' bin', (x1 + x2) / 2, padT + ph - 6);
    }

    // 最高旁瓣标记
    if (r.sidelobeBin != null && r.sidelobeDb != null && r.sidelobeDb > lo) {
      var sx = X(r.sidelobeFreq), sy = Y(r.sidelobeDb);
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, sy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = sx > padL + pw / 2 ? 'right' : 'left';
      ctx.fillText('最高旁瓣 ' + num(r.sidelobeDb, 1) + ' dB', sx + (sx > padL + pw / 2 ? -6 : 6), sy - 6);
    }

    // 混叠标记
    if (r.alias && r.aliasFreq != null) {
      var ax = X(r.aliasFreq);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, padT);
      ctx.lineTo(ax, padT + ph);
      ctx.stroke();
      ctx.fillStyle = '#fda4af';
      ctx.textAlign = 'center';
      ctx.fillText('混叠 → ' + num(r.aliasFreq, 0) + ' Hz', Math.max(padL + 44, Math.min(ax, padL + pw - 44)), padT + 12);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('dB（峰值归一）', 8, padT - 8);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(esc(r.win) + ' 窗：M = ' + r.M + '，Δf = ' + num(r.df, 3) + ' Hz，f_in = ' + num(r.fIn, 3) +
      ' Hz（bin ' + num(r.binIndex, 3) + '）', padL, H - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('频率（Hz，0 – fs/2）', padL + pw, H - 8);
    ctx.textAlign = 'left';
  }

  function draw() {
    var root = $('view-sim-fourier');
    if (!root) return;
    // 主画布：动画（谐波逐次加入）
    var s1 = setup('sfCanvas', 300);
    if (s1) {
      var s = E.synth({
        kind: state.kind, N: nAnim, f0: state.f0,
        cycles: state.cycles, samples: state.samples
      });
      if (s && s.ok && last && last.ok) drawWave(s1.ctx, s1.w, s1.h, s);
      else drawInvalid(s1.ctx, s1.w, s1.h);
      var an = $('sfAnim');
      if (an) {
        an.textContent = s && s.ok
          ? 'N = ' + nAnim + '：过冲 ' + num(s.overshoot, 4) + '（' + num(s.overshootPct, 2) + '%），' +
            'RMS 误差 ' + num(s.rmsError, 4) + '，RMS ' + num(s.rms, 4)
          : '参数无效';
      }
    }
    // 副画布：加窗频谱（参数变化时刷新）
    var s2 = setup('sfSpec', 300);
    if (s2) {
      if (last && last.ok) drawSpec(s2.ctx, s2.w, s2.h, last);
      else drawInvalid(s2.ctx, s2.w, s2.h);
    }
  }

  function loop() {
    var root = $('view-sim-fourier');
    if (!root || !root.classList.contains('active')) { stopAnim(); return; } // 离开页面即停
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间（仅播放时推进）
      if (t0 - lastStep >= STEP) {
        lastStep = t0;
        nAnim++;
        if (nAnim > state.N) nAnim = 1;
      }
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
    var btn = $('sfPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
    if (playing && !rafId) startAnim();
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('sfInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
    var km = $('sfKind'); if (km) km.addEventListener('change', function () { state.kind = km.value; recalc(); });
    var wm = $('sfWin'); if (wm) wm.addEventListener('change', function () { state.win = wm.value; recalc(); });
    var mm = $('sfM'); if (mm) mm.addEventListener('change', function () { state.M = parseInt(mm.value, 10); recalc(); });
  }

  function bind() {
    bindInputs();
    var play = $('sfPlay'); if (play) play.addEventListener('click', togglePlay);
    var load = $('sfLoad'); if (load) load.addEventListener('click', loadPreset);
    var reset = $('sfReset'); if (reset) reset.addEventListener('click', resetAll);
    var p1 = $('sfP1'); if (p1) p1.addEventListener('click', function () { applyPreset('square'); });
    var p2 = $('sfP2'); if (p2) p2.addEventListener('click', function () { applyPreset('leak'); });
    var p3 = $('sfP3'); if (p3) p3.addEventListener('click', function () { applyPreset('alias'); });
  }

  function flash(msg) {
    var el = $('sfMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    nAnim = 1;
    syncInputs();
    recalc();
    flash('已载入例题（方波 15 次谐波 + 矩形窗，f_in 整 bin）');
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    nAnim = 1;
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  // 预设：square = 方波+矩形窗；leak = 单频非整 bin 泄漏；alias = f_in > fs/2 混叠
  function applyPreset(which) {
    var base = Object.assign({}, PRESET);
    if (which === 'square') {
      base.kind = 'square'; base.N = 15; base.win = 'rect'; base.fIn = 1000;
      flash('方波 + 矩形窗：f_in 正好落在 bin 32，谱线不泄漏');
    } else if (which === 'leak') {
      base.kind = 'square'; base.N = 15; base.win = 'rect'; base.fIn = 1015.625;
      flash('非整 bin（32.5 bin）：矩形窗严重泄漏，切到 Hann 可看到旁瓣下降约 20 dB');
    } else {
      base.kind = 'square'; base.N = 15; base.win = 'rect'; base.fIn = 9000;
      flash('混叠演示：f_in = 9000 Hz > fs/2 = 8000 Hz，折叠到 7000 Hz');
    }
    state = base;
    nAnim = 1;
    syncInputs();
    recalc();
  }

  function syncInputs() {
    KEYS.forEach(function (k) {
      var el = $('sf_' + k);
      if (el) el.value = state[k];
    });
    var km = $('sfKind'); if (km) km.value = state.kind;
    var wm = $('sfWin'); if (wm) wm.value = state.win;
    var mm = $('sfM'); if (mm) mm.value = String(state.M);
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-fourier');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>傅里叶波形合成与频谱泄漏模拟器</h2>' +
      '<p class="hint">用谐波叠加合成方波 / 锯齿波 / 三角波（并观察 Gibbs 过冲趋近 1.17898），' +
      '再对单频信号加窗做直接 DFT：整 bin 时谱线干净，非整 bin 时能量泄漏到全部 bin；' +
      '矩形窗旁瓣仅 −13.3 dB，Hann 降到 −31.5 dB 但主瓣宽一倍，f_in &gt; fs/2 时发生混叠。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="sfInputs">' +
      selectField('sfKind', '波形类型', KIND_OPTS, DEFAULTS.kind) +
      selectField('sfWin', '窗函数', WIN_OPTS, DEFAULTS.win) +
      field('N', '谐波数 N', DEFAULTS.N, '', 1, 1) +
      field('f0', '基频 f₀', DEFAULTS.f0, 'Hz', 10, 10) +
      field('fs', '采样率 fs', DEFAULTS.fs, 'Hz', 1000, 1000) +
      field('fIn', '被分析单频 f_in', DEFAULTS.fIn, 'Hz', 0, 0.125) +
      field('cycles', '显示周期数', DEFAULTS.cycles, '', 1, 1) +
      selectField('sfM', 'DFT 长度 M', M_OPTS, DEFAULTS.M) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="sfP1" class="btn">方波+矩形窗</button>' +
      '<button id="sfP2" class="btn ghost">非整 bin 泄漏演示</button>' +
      '<button id="sfP3" class="btn ghost">混叠演示 f_in&gt;fs/2</button></div>' +
      '<div class="btn-row toolbar" style="margin-top:8px">' +
      '<button id="sfLoad" class="btn">载入例题</button>' +
      '<button id="sfReset" class="btn ghost">重置参数</button>' +
      '<span id="sfMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 时域合成（谐波逐次加入）</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="sfPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">播放时谐波数从 1 递增到设定值并循环：先看到基波正弦，逐渐逼近理想波形；' +
      '跳变处的红点标注 Gibbs 过冲（方波极限 1.17898，即相对跳变幅度 2 的 8.95%）。</span></div>' +
      '<canvas class="canvas-wrap" id="sfCanvas"></canvas>' +
      '<div id="sfAnim" class="aux-msg" style="margin-top:6px"></div></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="sfResult"></div></section>' +
      '<section class="card"><h3>加窗频谱（dB，峰值归一 0 dB）</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<span class="aux-msg">直接 O(M²) DFT；阴影为主瓣（第一零点宽度），红线为最高旁瓣电平；' +
      '切换窗函数可实时对比泄漏与旁瓣；混叠时以竖线标出折叠频率。</span></div>' +
      '<canvas class="canvas-wrap" id="sfSpec"></canvas>' +
      '<ul class="inline-note" id="sfNotes" style="margin-top:10px"></ul></section>' +
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

  window.SimFourierView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
