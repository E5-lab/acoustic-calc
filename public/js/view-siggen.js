/*
 * view-siggen.js — 测量信号发生器 视图（#/siggen）
 * 依赖 window.SigGen（内核）、window.Aural（wavEncode）、window.AudioIO（播放）。
 *
 * 五种标准测量信号：
 *   1) 白噪声（频谱基准、设备本底查看）
 *   2) 粉红噪声（-3 dB/oct，倍频带等能量，房间声学测量基准）
 *   3) 正弦（任意频率，增益/失真校核）
 *   4) 对数扫频 ESS（测房间脉冲响应 → RT60，与 #/irt60 联动）
 *   5) 倍频带限噪（单倍频带能量，隔声/吸声现场测量）
 * 播放走 AudioContext（样点率 = 设备采样率），可下载 16-bit WAV。
 */
(function () {
  'use strict';
  var SG = window.SigGen, AU = window.Aural, IO = window.AudioIO;

  function $(id) { return window.Util.$(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function setStatus(t) { var e = $('sgStatus'); if (e) e.textContent = t; }
  function show(html, cls) {
    var el = $('sgInfo');
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }

  var st = { x: null, sr: 0, name: '' };

  /* ---------- 波形预览（min/max 包络） ---------- */
  function fit(canvas) {
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(300, Math.round(rect.width || 560));
    var H = Number(canvas.getAttribute('height')) || 120;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }
  function drawWave(x) {
    var c = $('sgWave');
    if (!c || !x) return;
    var f = fit(c), ctx = f.ctx, W = f.W, H = f.H;
    var cols = Math.min(W, 1200), per = Math.max(1, Math.floor(x.length / cols));
    /* 网格 */
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < cols; i++) {
      var s = i * per, e = Math.min(x.length, s + per), mn = 1, mx = -1;
      for (var j = s; j < e; j++) { if (x[j] < mn) mn = x[j]; if (x[j] > mx) mx = x[j]; }
      if (mn > mx) { mn = 0; mx = 0; }
      var x0 = i / cols * W, x1 = (i + 1) / cols * W;
      ctx.moveTo(x0, H / 2 - mn * (H / 2 - 6));
      ctx.lineTo(x1, H / 2 - mx * (H / 2 - 6));
    }
    ctx.stroke();
    /* 时间轴标注 */
    ctx.fillStyle = 'rgba(107,114,128,0.9)';
    ctx.font = '11px system-ui, sans-serif';
    var dur = x.length / st.sr;
    ctx.fillText('0', 2, H - 4);
    var label = fmt(dur, 2) + ' s';
    ctx.fillText(label, W - ctx.measureText(label).width - 4, H - 4);
  }

  /* ---------- 参数收集 ---------- */
  function params() {
    var type = $('sgType').value;
    var dur = Math.max(0.1, Math.min(30, pf($('sgDur').value) || 5));
    var p = { type: type, dur: dur, name: '' };
    if (type === 'sine') { p.f = pf($('sgF').value) || 1000; p.name = p.f + ' Hz 正弦'; }
    else if (type === 'sweep') {
      p.f1 = Math.max(1, pf($('sgF1').value) || 20);
      p.f2 = Math.min(22000, pf($('sgF2').value) || 20000);
      p.name = p.f1 + '–' + p.f2 + ' Hz 对数扫频';
    } else if (type === 'band') {
      p.fc = Math.max(10, pf($('sgFc').value) || 1000);
      p.edge = pf($('sgEdge').value);
      if (p.edge == null) p.edge = -24;
      p.name = p.fc + ' Hz 倍频带限噪（' + fmt(p.edge, 0) + ' dB 过渡）';
    } else if (type === 'pink') p.name = '粉红噪声';
    else p.name = '白噪声';
    return p;
  }

  function syncRows() {
    var t = $('sgType').value;
    $('sgRowSine').hidden = t !== 'sine';
    $('sgRowSweep').hidden = t !== 'sweep';
    $('sgRowBand').hidden = t !== 'band';
  }

  /* ---------- 生成 ---------- */
  function generate() {
    var c = IO.ensureCtx();
    if (!c) { setStatus('浏览器不支持 Web Audio，无法播放（仍可下载 WAV）'); }
    var s = c ? c.sampleRate : 48000;
    st.sr = s;
    var p = params();
    var n = Math.round(p.dur * s), x = null;
    if (p.type === 'white') x = SG.white(n, 20261017);
    else if (p.type === 'pink') x = SG.pink(n, 20261017);
    else if (p.type === 'sine') x = SG.sine(n, s, p.f, 0.89, 0);
    else if (p.type === 'sweep') x = SG.logSweep(n, s, p.f1, p.f2, 0.005);
    else if (p.type === 'band') x = SG.bandNoise(n, s, p.fc, p.edge, 20261017, {});
    if (!x) { setStatus('参数无效：扫频需 f2 > f1 且频率在 1 Hz ~ 22 kHz'); show(null, 'warn'); return; }
    var peak = pf($('sgPeak').value);
    if (peak != null && peak > 0 && peak < 1) SG.normalizePeak(x, peak);
    st.x = x; st.name = p.name;
    var rms = 0, pk = 0;
    for (var i = 0; i < x.length; i++) { var a = Math.abs(x[i]); rms += x[i] * x[i]; if (a > pk) pk = a; }
    rms = Math.sqrt(rms / x.length);
    drawWave(x);
    show('已生成 <b>' + p.name + '</b>：' + fmt(x.length, 0) + ' 样点 @ ' + s + ' Hz（' +
      fmt(p.dur, 2) + ' s）　峰值 <b>' + fmt(pk, 3) + '</b>　RMS ' + fmt(rms, 3) +
      '<br><span class="muted">扫频相位按解析积分生成（起止 5 ms 淡入淡出防爆音）；' +
      '倍频带限噪过渡带外已硬置零，带外能量 &lt; −100 dB。下载为 16-bit/44.1–48 k WAV。</span>');
    setStatus('就绪：' + p.name);
  }

  /* ---------- 播放 ---------- */
  function play() {
    if (!st.x) generate();
    if (!st.x) return;
    var src = IO.playSignal(st.x);
    if (!src) { setStatus('播放失败：浏览器不支持 Web Audio'); return; }
    setStatus('正在播放：' + st.name + '（' + fmt(st.x.length / st.sr, 1) + ' s）');
    src.onended = function () { setStatus('播放结束：' + st.name); };
  }

  function download() {
    if (!st.x) generate();
    if (!st.x) return;
    var u8 = AU.wavEncode(st.x, st.sr);
    var blob = new Blob([u8], { type: 'audio/wav' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'signal-' + st.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') + '.wav';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
    setStatus('已下载 WAV（' + fmt(st.x.length / st.sr, 1) + ' s @ ' + st.sr + ' Hz）');
  }

  function applyPreset(kind) {
    if (kind === 'sine1k') { $('sgType').value = 'sine'; $('sgF').value = 1000; }
    else if (kind === 'pink') { $('sgType').value = 'pink'; }
    else if (kind === 'sweep') { $('sgType').value = 'sweep'; $('sgF1').value = 20; $('sgF2').value = 20000; }
    else if (kind === 'band1k') { $('sgType').value = 'band'; $('sgFc').value = 1000; }
    syncRows();
    generate();
  }

  function init(_mode, params) {
    if (init._d) return;
    init._d = true;
    syncRows();
    $('sgType').addEventListener('change', function () { syncRows(); generate(); });
    ['sgDur', 'sgF', 'sgF1', 'sgF2', 'sgFc', 'sgEdge', 'sgPeak'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', generate);
    });
    $('sgBtnGen').addEventListener('click', generate);
    $('sgBtnPlay').addEventListener('click', play);
    $('sgBtnStop').addEventListener('click', function () {
      IO.stopPlayback();
      setStatus('已停止播放');
    });
    $('sgBtnWav').addEventListener('click', download);
    $('sgPre1k').addEventListener('click', function () { applyPreset('sine1k'); });
    $('sgPrePink').addEventListener('click', function () { applyPreset('pink'); });
    $('sgPreSweep').addEventListener('click', function () { applyPreset('sweep'); });
    $('sgPreBand').addEventListener('click', function () { applyPreset('band1k'); });
    /* 深链分享：#/siggen?type=sweep&f1=20&f2=20000&dur=5 —— 同事打开链接即得同参数信号 */
    function collect() {
      return {
        type: $('sgType').value, dur: $('sgDur').value, peak: $('sgPeak').value,
        f: $('sgF').value, f1: $('sgF1').value, f2: $('sgF2').value,
        fc: $('sgFc').value, edge: $('sgEdge').value
      };
    }
    function applyParams(p) {
      if (!p) return;
      var types = ['white', 'pink', 'sine', 'sweep', 'band'];
      if (types.indexOf(p.type) >= 0) $('sgType').value = p.type;
      ['sgDur', 'sgPeak', 'sgF', 'sgF1', 'sgF2', 'sgFc', 'sgEdge'].forEach(function (id) {
        var k = id.slice(2).toLowerCase();
        if (p[k] != null && p[k] !== '' && isFinite(parseFloat(p[k]))) $(id).value = p[k];
      });
      syncRows();
    }
    var shareBtn = $('sgBtnShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (!(window.AppShare && window.AppRouter)) return;
        var l = AppRouter.link('siggen', collect());
        AppShare.copy(l.url).then(function () { AppShare.toast('已复制分享链接', 'ok'); },
                                  function () { AppShare.toast('复制失败，请手动复制地址栏', 'warn'); });
      });
    }
    if (params && Object.keys(params).length) {
      applyParams(params);
      generate();   // 深链进入时直接生成信号
    }
  }

  function onShow() {
    if (st.x) drawWave(st.x);   // 画布在隐藏时宽度为 0，切回视图需重绘
  }

  window.SigGenView = { init: init, onShow: onShow };
})();
