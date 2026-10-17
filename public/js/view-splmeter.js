/*
 * view-splmeter.js — 声级计实测 视图（#/splmeter）
 * 依赖 window.Measure（内核）、window.Aural（fft）、window.AudioIO（麦克风）。
 *
 * 功能：实时声压级测量（宽带 LA/LC/LZ + 帧最大 Lmax）、F/S 时间计权显示、
 *       倍频带声级表（Leq 累积 + 当前帧）、声级—时间滚动曲线、校准偏移。
 * 口径：与内核一致——每 8192 样点（~170 ms @48k）做一次 FFT 分带，
 *       Leq 按能量累积；峰值/帧最大取帧宽带 rms 声级。
 * 局限：浏览器麦克风未校准（读数为相对声级，需用声校准器定标）；
 *       FFT 窗 8192 对 31.5 Hz 倍频带仅数个 bin，低频带读数波动偏大。
 */
(function () {
  'use strict';
  var M = window.Measure, AU = window.Aural, IO = window.AudioIO;

  function $(id) { return document.getElementById(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 1 : d); }
  function setStatus(t) { var e = $('smStatus'); if (e) e.textContent = t; }

  var mic = null;
  var st = { leq: null, calib: 0, disp: null, dispT: 0, tau: 1, hist: [], acc: null, accLen: 0, running: false };
  var WIN = 8192;   // FFT 窗（2 个 ScriptProcessor 缓冲，幂长度）
  var re = new Float64Array(WIN), im = new Float64Array(WIN);
  var mag = new Float64Array(WIN / 2 + 1);
  var HIST_SEC = 60;

  /* ---------- 画布工具 ---------- */
  function fit(canvas, hFallback) {
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(300, Math.round(rect.width || 560));
    var H = Number(canvas.getAttribute('height')) || hFallback || 200;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  /* ---------- 声级—时间曲线 ---------- */
  function drawHist() {
    var c = $('smChart');
    if (!c) return;
    var f = fit(c, 200), ctx = f.ctx, W = f.W, H = f.H;
    var m = { l: 44, r: 12, t: 12, b: 24 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var vals = [];
    st.hist.forEach(function (p) { vals.push(p.eq); if (p.disp != null) vals.push(p.disp); });
    if (!vals.length) {
      ctx.fillStyle = 'rgba(107,114,128,0.9)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('测量开始后显示最近 ' + HIST_SEC + ' s 的声级曲线', m.l + 6, m.t + 16);
      return;
    }
    var lo = Math.floor(Math.min.apply(null, vals) - 3), hi = Math.ceil(Math.max.apply(null, vals) + 3);
    if (hi - lo < 10) hi = lo + 10;
    function X(t) { return m.l + (1 - t / HIST_SEC) * pw; }              // t = 秒前
    function Y(v) { return m.t + (1 - (v - lo) / (hi - lo)) * ph; }
    /* 网格与坐标 */
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.fillStyle = 'rgba(107,114,128,0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (var v = lo; v <= hi; v += 5) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(W - m.r, Y(v)); ctx.stroke();
      ctx.fillText(String(v), 6, Y(v) + 3);
    }
    for (var t = 0; t <= HIST_SEC; t += 10) {
      ctx.beginPath(); ctx.moveTo(X(t), m.t); ctx.lineTo(X(t), H - m.b); ctx.stroke();
      ctx.fillText(t === 0 ? '现在' : '-' + t + 's', X(t) - 8, H - m.b + 14);
    }
    /* 瞬时（F/S）与 Leq 两条线 */
    function line(key, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      var started = false;
      st.hist.forEach(function (p) {
        var v = p[key];
        if (v == null) { started = false; return; }
        var x = X(p.ago), y = Y(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line('disp', 'rgba(37,99,235,0.85)', 1.2);
    line('eq', 'rgba(220,38,38,0.9)', 2);
    /* 图例 */
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(37,99,235,0.9)'; ctx.fillRect(m.l + 4, m.t + 2, 14, 3);
    ctx.fillText('时间计权 L', m.l + 22, m.t + 7);
    ctx.fillStyle = 'rgba(220,38,38,0.9)'; ctx.fillRect(m.l + 84, m.t + 2, 14, 3);
    ctx.fillText('Leq', m.l + 102, m.t + 7);
  }

  /* ---------- 读数刷新（~3 Hz） ---------- */
  var frameCount = 0;
  function refresh() {
    var sum = M.leqSummary(st.leq, { Z: M.octaveWeights('Z'), A: M.octaveWeights('A'), C: M.octaveWeights('C') }, st.calib);
    $('smLaf').textContent = st.disp == null ? '—' : fmt(st.disp, 1);
    $('smLeq').textContent = sum ? fmt(sum.LA, 1) : '—';
    $('smLceq').textContent = sum ? fmt(sum.LC, 1) : '—';
    $('smLzeq').textContent = sum ? fmt(sum.LZ, 1) : '—';
    $('smLmax').textContent = sum ? fmt(sum.Lmax, 1) : '—';
    $('smSec').textContent = sum ? fmt(sum.seconds, 1) + ' s' : '0.0 s';
    /* 倍频带表 */
    var bands = M.leqBands(st.leq, st.calib);
    var cur = st.cur;
    M.OCTAVE.forEach(function (fc, i) {
      var cell = $('smB' + i);
      if (!cell) return;
      var leq = bands ? bands[i] : null;
      var now = cur ? cur[i] : null;
      cell.innerHTML = '<td>' + (fc >= 1000 ? fmt(fc / 1000, 1) + ' k' : fmt(fc, fc < 100 ? 1 : 0)) + '</td>' +
        '<td class="mono">' + fmt(now, 1) + '</td><td class="mono">' + fmt(leq, 1) + '</td>';
    });
    drawHist();
  }

  /* ---------- 帧处理 ---------- */
  function processFrame(frame, sr) {
    var dt = frame.length / sr;
    /* 瞬时宽带声级 + F/S 时间计权 */
    var rms = Math.sqrt(M.framePower(frame));
    var L = M.rmsToSpl(rms, st.calib);
    if (L != null) {
      var alpha = Math.exp(-dt / st.tau);
      var lp = st.disp == null ? L : st.disp;
      st.disp = 10 * Math.log10(alpha * Math.pow(10, lp / 10) + (1 - alpha) * Math.pow(10, L / 10));
    }
    /* 累积到 FFT 窗 */
    var need = WIN - st.accLen;
    var take = Math.min(need, frame.length);
    st.acc.set(frame.subarray(0, take), st.accLen);
    st.accLen += take;
    if (st.accLen < WIN) return;
    st.accLen = 0;
    /* FFT → 倍频带功率 */
    for (var i = 0; i < WIN; i++) { re[i] = st.acc[i]; im[i] = 0; }
    AU.fft(re, im, false);
    for (i = 0; i <= WIN / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    var powers = M.spectrumBandPowers(mag, sr, WIN, M.OCTAVE);
    st.cur = powers.map(function (p) { return p > 0 ? 10 * Math.log10(p) + st.calib : null; });
    M.pushLeq(st.leq, powers, WIN / sr);
    M.pushPeak(st.leq, rms, st.calib);
    /* 历史（每窗一点） */
    st.hist.push({ ago: 0, disp: st.disp, eq: null });
    st.hist.forEach(function (p) { p.ago += WIN / sr; });
    while (st.hist.length && st.hist[0].ago > HIST_SEC) st.hist.shift();
    var sum = M.leqSummary(st.leq, { A: M.octaveWeights('A') }, st.calib);
    if (sum) st.hist[st.hist.length - 1].eq = sum.LA;
  }

  /* ---------- 控制 ---------- */
  function start() {
    if (st.running) return;
    if (!IO) { setStatus('浏览器不支持音频采集'); return; }
    st.calib = pf($('smCalib').value) || 0;
    st.tau = $('smTw').value === 'fast' ? 0.125 : 1;
    st.leq = M.createLeq();
    st.disp = null;
    st.hist = [];
    st.acc = new Float32Array(WIN);
    st.accLen = 0;
    st.cur = null;
    st.running = true;
    mic = new IO.Mic();
    mic.start(function (frame) {
      if (!st.running) return;
      processFrame(frame, mic.sr);
      if (++frameCount % 4 === 0) refresh();
    }, function (msg) {
      st.running = false;
      setStatus(msg);
    });
    setStatus('测量中…（' + ($('smTw').value === 'fast' ? 'F 快 125 ms' : 'S 慢 1 s') + '计权，校准偏移 ' + (st.calib >= 0 ? '+' : '') + fmt(st.calib, 1) + ' dB）');
    refresh();
  }

  function stop() {
    if (!st.running) return;
    st.running = false;
    if (mic) mic.stop();
    refresh();
    setStatus('已停止。累计 ' + fmt(st.leq.seconds, 1) + ' s，Leq(A) = ' +
      fmt(M.leqSummary(st.leq, { A: M.octaveWeights('A') }, st.calib).LA, 1) + ' dB');
  }

  function reset() {
    if (st.running) stop();
    st.leq = M.createLeq();
    st.disp = null;
    st.hist = [];
    st.cur = null;
    refresh();
    setStatus('已重置');
  }

  function init(_mode, params) {
    if (init._d) return;
    init._d = true;
    st.leq = M.createLeq();
    st.acc = new Float32Array(WIN);
    $('smBtnStart').addEventListener('click', start);
    $('smBtnStop').addEventListener('click', stop);
    $('smBtnReset').addEventListener('click', reset);
    $('smCalib').addEventListener('change', function () { st.calib = pf($('smCalib').value) || 0; });
    /* 深链分享：#/splmeter?calib=..&tw=..（init(mode, params) 由 router 下传） */
    function collect() {
      return { calib: $('smCalib').value, tw: $('smTw').value };
    }
    function applyParams(p) {
      if (!p) return;
      if (p.calib != null && p.calib !== '' && isFinite(parseFloat(p.calib))) $('smCalib').value = p.calib;
      if (p.tw === 'fast' || p.tw === 'slow') $('smTw').value = p.tw;
      st.calib = pf($('smCalib').value) || 0;
      st.tau = $('smTw').value === 'fast' ? 0.125 : 1;
    }
    var shareBtn = $('smShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (!(window.AppShare && window.AppRouter)) return;
        var l = AppRouter.link('splmeter', collect());
        AppShare.copy(l.url).then(function () { AppShare.toast('已复制分享链接', 'ok'); },
                                  function () { AppShare.toast('复制失败，请手动复制地址栏', 'warn'); });
      });
    }
    applyParams(params);
    refresh();
  }

  function onShow() {
    drawHist();
  }

  window.SplMeterView = { init: init, onShow: onShow };
})();
