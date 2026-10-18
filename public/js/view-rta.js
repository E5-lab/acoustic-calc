/*
 * view-rta.js — 实时频谱分析 RTA 视图（#/rta）
 * 依赖 window.Measure（内核）、window.Aural（fft）、window.AudioIO（麦克风）。
 *
 * 功能：1/1 或 1/3 倍频带实时声级（Z/A/C 计权可选）、指数平均 + 最大值保持、
 *       宽带 A 声级、对数频率轴条形图与数值表。
 * 口径：每 8192 样点 FFT → 倍频带线性功率 → 指数平均（时间常数可调）；
 *       计权对带功率按 10·lg Σ 10^((L+w)/10) 合成（与声级计视图一致）。
 */
(function () {
  'use strict';
  var M = window.Measure, AU = window.Aural, IO = window.AudioIO;

  function $(id) { return window.Util.$(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 1 : d); }
  function setStatus(t) { var e = $('rtStatus'); if (e) e.textContent = t; }

  var mic = null;
  var WIN = 8192;
  var re = new Float64Array(WIN), im = new Float64Array(WIN), mag = new Float64Array(WIN / 2 + 1);
  var st = {
    running: false, sr: 0, avg: null, max: null, leq: null, cur: null,
    tau: 1, bw: 1, weight: 'Z', acc: null, accLen: 0, calib: 0
  };

  function centers() { return st.bw === 1 / 3 ? M.THIRD : M.OCTAVE; }
  function weights() { return st.weight === 'A' ? (st.bw === 1 / 3 ? M.thirdWeights('A') : M.octaveWeights('A')) : (st.weight === 'C' ? (st.bw === 1 / 3 ? M.thirdWeights('C') : M.octaveWeights('C')) : null); }

  /* ---------- 画布 ---------- */
  function fit(canvas, hFallback) {
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(300, Math.round(rect.width || 560));
    var H = Number(canvas.getAttribute('height')) || hFallback || 240;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  function drawBars() {
    var c = $('rtChart');
    if (!c) return;
    var f = fit(c, 240), ctx = f.ctx, W = f.W, H = f.H;
    var m = { l: 44, r: 12, t: 14, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var cs = centers(), lv = st.cur;
    if (!lv || !lv.length) {
      ctx.fillStyle = 'rgba(107,114,128,0.9)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('开始测量后显示倍频带声级', m.l + 6, m.t + 16);
      return;
    }
    var vals = lv.filter(function (v) { return v != null; });
    if (!vals.length) return;
    var lo = Math.floor(Math.min.apply(null, vals) - 2), hi = Math.ceil(Math.max.apply(null, vals) + 2);
    if (hi - lo < 12) hi = lo + 12;
    var fMin = cs[0], fMax = cs[cs.length - 1];
    function X(fc) { return m.l + (Math.log(fc) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin)) * pw; }
    function Y(v) { return m.t + (1 - (v - lo) / (hi - lo)) * ph; }
    /* 网格 */
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.fillStyle = 'rgba(107,114,128,0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (var v = lo; v <= hi; v += 5) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(W - m.r, Y(v)); ctx.stroke();
      ctx.fillText(String(v), 6, Y(v) + 3);
    }
    [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].forEach(function (fc) {
      if (fc < fMin || fc > fMax) return;
      var x = X(fc);
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, H - m.b); ctx.stroke();
      ctx.fillText(fc >= 1000 ? (fc / 1000) + 'k' : String(fc), x - 8, H - m.b + 14);
    });
    /* 条形（相邻带不留隙；1/3 带用细条） */
    var bwHz = Math.pow(2, st.bw / 2);
    cs.forEach(function (fc, i) {
      var v = lv[i];
      if (v == null) return;
      var x0 = X(fc / bwHz), x1 = X(fc * bwHz);
      var y = Y(v);
      ctx.fillStyle = 'rgba(37,99,235,0.75)';
      ctx.fillRect(x0 + 0.5, y, Math.max(1, x1 - x0 - 1), H - m.b - y);
      /* 最大值保持（虚线帽） */
      var mx = st.max && st.max[i];
      if (mx != null) {
        ctx.strokeStyle = 'rgba(220,38,38,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0 + 0.5, Y(mx));
        ctx.lineTo(x1 - 0.5, Y(mx));
        ctx.stroke();
      }
    });
    /* 图例 */
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(37,99,235,0.85)'; ctx.fillRect(m.l + 4, m.t - 10, 14, 3);
    ctx.fillText('平均', m.l + 22, m.t - 6);
    ctx.fillStyle = 'rgba(220,38,38,0.9)'; ctx.fillRect(m.l + 58, m.t - 10, 14, 3);
    ctx.fillText('最大保持', m.l + 76, m.t - 6);
  }

  function refresh() {
    var cs = centers(), lv = st.cur;
    var w = weights();
    var overall = st.avg ? M.weightedBandLevel(st.avg, w, st.calib) : null;
    $('rtOverall').textContent = fmt(overall, 1);
    /* 数值表（ chips ） */
    var box = $('rtTable');
    if (box && lv) {
      box.innerHTML = cs.map(function (fc, i) {
        var lbl = fc >= 1000 ? (fc / 1000) + 'k' : String(fc);
        return '<span class="badge" style="font-variant-numeric:tabular-nums">' + lbl + ' Hz：<b>' + fmt(lv[i], 1) + '</b> dB</span>';
      }).join('');
    }
    drawBars();
  }

  function processFrame(frame, sr) {
    var dt = frame.length / sr;
    st.acc.set(frame.subarray(0, Math.min(WIN - st.accLen, frame.length)), st.accLen);
    st.accLen += Math.min(WIN - st.accLen, frame.length);
    if (st.accLen < WIN) return;
    st.accLen = 0;
    for (var i = 0; i < WIN; i++) { re[i] = st.acc[i]; im[i] = 0; }
    AU.fft(re, im, false);
    for (i = 0; i <= WIN / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    var powers = M.spectrumBandPowers(mag, sr, WIN, centers(), st.bw);
    var alpha = Math.exp(-(WIN / sr) / st.tau);
    if (!st.avg) { st.avg = powers.map(function () { return 0; }); st.max = powers.map(function () { return null; }); }
    for (i = 0; i < powers.length; i++) {
      st.avg[i] = alpha * st.avg[i] + (1 - alpha) * powers[i];
      var L = powers[i] > 0 ? 10 * Math.log10(powers[i]) + st.calib : null;
      if (L != null && (st.max[i] == null || L > st.max[i])) st.max[i] = L;
    }
    st.cur = st.avg.map(function (p) { return p > 0 ? 10 * Math.log10(p) + st.calib : null; });
  }

  function start() {
    if (st.running) return;
    if (!IO) { setStatus('浏览器不支持音频采集'); return; }
    st.calib = pf($('rtCalib').value) || 0;
    st.bw = $('rtBw').value === 'third' ? 1 / 3 : 1;
    st.weight = $('rtWeight').value;
    st.tau = $('rtAvg').value === 'slow' ? 2 : 0.5;
    st.avg = null; st.max = null; st.cur = null;
    st.acc = new Float32Array(WIN); st.accLen = 0;
    st.running = true;
    mic = new IO.Mic();
    mic.start(function (frame) {
      if (!st.running) return;
      processFrame(frame, mic.sr);
      refresh();
    }, function (msg) { st.running = false; setStatus(msg); });
    setStatus('测量中… ' + (st.bw === 1 / 3 ? '1/3' : '1/1') + ' 倍频带 · ' + st.weight + ' 计权 · 平均时间常数 ' + fmt(st.tau, 1) + ' s');
    refresh();
  }

  function stop() {
    if (!st.running) return;
    st.running = false;
    if (mic) mic.stop();
    setStatus('已停止（数值为停止前最后一帧）');
  }

  function resetMax() {
    st.max = st.cur ? st.cur.map(function () { return null; }) : null;
    setStatus('最大值保持已清除');
  }

  function init(_mode, params) {
    if (init._d) return;
    init._d = true;
    st.acc = new Float32Array(WIN);
    $('rtBtnStart').addEventListener('click', start);
    $('rtBtnStop').addEventListener('click', stop);
    $('rtBtnMax').addEventListener('click', resetMax);
    $('rtBw').addEventListener('change', function () { if (st.running) { st.avg = null; st.max = null; st.cur = null; } st.bw = $('rtBw').value === 'third' ? 1 / 3 : 1; refresh(); });
    $('rtWeight').addEventListener('change', function () { st.weight = $('rtWeight').value; refresh(); });
    /* 深链分享：#/rta?bw=third&weight=A&avg=slow&calib=.. */
    function collect() {
      return { bw: $('rtBw').value, weight: $('rtWeight').value, avg: $('rtAvg').value, calib: $('rtCalib').value };
    }
    function applyParams(p) {
      if (!p) return;
      if (p.bw === 'octave' || p.bw === 'third') $('rtBw').value = p.bw;
      if (p.weight === 'Z' || p.weight === 'A' || p.weight === 'C') $('rtWeight').value = p.weight;
      if (p.avg === 'fast' || p.avg === 'slow') $('rtAvg').value = p.avg;
      if (p.calib != null && p.calib !== '' && isFinite(parseFloat(p.calib))) $('rtCalib').value = p.calib;
    }
    var shareBtn = $('rtBtnShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (!(window.AppShare && window.AppRouter)) return;
        var l = AppRouter.link('rta', collect());
        AppShare.copy(l.url).then(function () { AppShare.toast('已复制分享链接', 'ok'); },
                                  function () { AppShare.toast('复制失败，请手动复制地址栏', 'warn'); });
      });
    }
    applyParams(params);
    refresh();
  }

  function onShow() { drawBars(); }

  window.RtaView = { init: init, onShow: onShow };
})();
