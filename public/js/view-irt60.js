/*
 * view-irt60.js — 混响时间 RT60 实测 视图（#/irt60）
 * 依赖 window.SigGen / window.IrT60 / window.AudioIO / window.MiniChart。
 *
 * 测量链（ISO 3382 思路的工程级实现）：
 *   播放对数扫频 ESS → 麦克风同步录音 →
 *   互相关定位起始 → Farina 频域反卷积得 IR → FFT 带限（回扫频频带） →
 *   Schroeder 反向积分 → Lundeby 噪声补偿 → T20 / T30 / EDT 最小二乘拟合。
 *
 * 两条输入路径：
 *   ①「播放并录音」：本页播放扫频、麦克风同步采集（推荐，样点率自动一致）；
 *   ②「上传录音」：wavDecode 解析本地 WAV，用同参数扫频作参考反卷积
 *      （录音须由本页或 #/siggen 下载的同参数扫频播放录制，样点率一致）。
 * 局限：喇叭频响与失真直接进入 IR；结果供工程估算，验收以 ISO 3382 专业测量为准。
 */
(function () {
  'use strict';
  var SG = window.SigGen, IR = window.IrT60, IO = window.AudioIO, MC = window.MiniChart;

  function $(id) { return document.getElementById(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function setStatus(t) { var e = $('itStatus'); if (e) e.textContent = t; }
  function show(html, cls) {
    var el = $('itOut');
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }

  var mic = null, timer = null, timerReady = null;
  var st = { running: false, sr: 0, sweep: null, f1: 50, f2: 20000, dur: 5, tail: 1.5, an: null, ir: null, lag: 0 };

  /* ---------- IR 波形画布 ---------- */
  function fit(canvas, hFallback) {
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(300, Math.round(rect.width || 560));
    var H = Number(canvas.getAttribute('height')) || hFallback || 160;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  function drawIr() {
    var c = $('itIrChart');
    if (!c || !st.ir) return;
    var f = fit(c, 160), ctx = f.ctx, W = f.W, H = f.H;
    var m = { l: 8, r: 8, t: 10, b: 18 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var span = Math.min(st.ir.length, Math.round(1.2 * st.sr));   // 前 1.2 s
    var mx = 0;
    for (var i = 0; i < span; i++) mx = Math.max(mx, Math.abs(st.ir[i]));
    if (!(mx > 0)) return;
    /* 网格 */
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.beginPath(); ctx.moveTo(m.l, H - m.b); ctx.lineTo(W - m.r, H - m.b); ctx.stroke();
    /* IR */
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var started = false;
    for (i = 0; i < span; i++) {
      var x = m.l + i / span * pw;
      var y = m.t + ph / 2 - (st.ir[i] / mx) * (ph / 2 - 4);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    /* 直达声标记（irStartIndex） */
    if (st.an && st.an.startIdx < span) {
      var xs = m.l + st.an.startIdx / span * pw;
      ctx.strokeStyle = 'rgba(220,38,38,0.8)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(xs, m.t); ctx.lineTo(xs, H - m.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(220,38,38,0.9)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('直达声 ' + fmt(st.an.startIdx / st.sr * 1000, 1) + ' ms', Math.min(xs + 4, W - 110), m.t + 12);
    }
    ctx.fillStyle = 'rgba(107,114,128,0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('0', m.l, H - 5);
    var lbl = fmt(span / st.sr, 2) + ' s';
    ctx.fillText(lbl, W - m.r - ctx.measureText(lbl).width, H - 5);
  }

  function drawDecay() {
    var c = $('itDecayChart');
    if (!c || !st.an || !st.an.curveDb) return;
    var db = st.an.curveDb, sr = st.an.sampleRate;
    var xs = [], ys = [];
    var step = Math.max(1, Math.floor(db.length / 900));
    for (var i = 0; i < db.length; i += step) { xs.push(i / sr); ys.push(db[i]); }
    if (!xs.length) return;
    var floor = (st.an.noiseDb == null ? -60 : st.an.noiseDb) - 6;
    if (MC) {
      MC.draw(c, {
        x: xs, yDigits: 0, yMin: Math.floor(floor), yMax: 2,
        xLabelFmt: function (v) { return fmt(v, 2) + 's'; },
        series: [{ values: ys, color: MC.cssVar('--primary', '#2563eb'), width: 2, points: false }]
      });
    }
  }

  /* ---------- 分析 ---------- */
  function analyze(rec, sr, sweep) {
    if (!rec || !rec.length) { show('录音为空，请检查麦克风是否正常采集', 'warn'); return; }
    setStatus('分析中…（互相关定位 → Farina 反卷积 → 带限 → 衰减拟合）');
    /* 让状态先渲染一帧 */
    setTimeout(function () {
      var lag = IR.correlationLag(rec, sweep);
      var ir = IR.farinaDeconvolve(rec, sweep);
      if (!ir) { show('反卷积失败：录音与参考扫频长度不匹配', 'warn'); setStatus('分析失败'); return; }
      var lim = IR.limitBand(ir, sr, st.f1 * 1.02, st.f2 * 0.98);
      var an = IR.analyzeIr(lim, sr);
      if (!an) { show('IR 分析失败：信号能量过低', 'warn'); setStatus('分析失败'); return; }
      st.an = an; st.ir = lim; st.lag = lag;
      render(lag, sr);
      setStatus('分析完成');
    }, 30);
  }

  function render(lag, sr) {
    var an = st.an;
    var t20 = an.t20 ? fmt(an.t20.T, 3) + ' s' : '—';
    var t30 = an.t30 ? fmt(an.t30.T, 3) + ' s' : '—';
    var edt = an.edt ? fmt(an.edt.T, 3) + ' s' : '—';
    $('itT30').textContent = t30;
    $('itT20').textContent = t20;
    $('itEdt').textContent = edt;
    $('itNoise').textContent = an.noiseDb == null ? '—' : fmt(an.noiseDb, 1) + ' dB';
    $('itDyn').textContent = an.dynDb == null ? '—' : fmt(an.dynDb, 1) + ' dB';
    $('itLag').textContent = fmt(lag / sr * 1000, 1) + ' ms';
    /* 与典型用途对照 */
    var t30v = an.t30 ? an.t30.T : null;
    var use = '';
    if (t30v != null) {
      if (t30v < 0.4) use = '偏「干」：语言清晰优先的房间（录音室、教室）常见 < 0.5 s';
      else if (t30v < 0.8) use = '语言与音乐兼顾的多功能厅常见区间（0.5~0.8 s）';
      else if (t30v < 1.5) use = '音乐厅常见区间（1.2~2.0 s 为交响乐理想值）';
      else use = '混响偏长：教堂、体育馆等大空间特征';
    }
    show('T30 = <b>' + t30 + '</b>　T20 = ' + t20 + '　EDT = <b>' + edt + '</b>（0 ~ −10 dB 早期衰减）' +
      '<br>互相关定位播放延迟 <b>' + fmt(lag / sr * 1000, 1) + ' ms</b>；直达声起始 ' +
      fmt(an.startIdx / sr * 1000, 1) + ' ms；噪声底 ' + fmt(an.noiseDb, 1) + ' dB（动态 ' + fmt(an.dynDb, 1) + ' dB）' +
      '<br>判读：' + (use || '—') +
      '<br><span class="muted">EDT 与 T30 接近说明衰减近似指数（扩散声场）；EDT 明显短于 T30 提示' +
      '早期衰减快（强吸声近区或耦合空间）。扫频频带外的噪声已被 FFT 带限滤除。</span>',
      t30v != null && t30v < 0.35 ? 'warn' : 'ok');
    drawIr();
    drawDecay();
  }

  /* ---------- 播放并录音 ---------- */
  function measure() {
    if (st.running) return;
    if (!IO) { setStatus('浏览器不支持 Web Audio'); return; }
    var c = IO.ensureCtx();
    if (!c) { setStatus('浏览器不支持 Web Audio'); return; }
    st.sr = c.sampleRate;
    st.f1 = Math.max(5, pf($('itF1').value) || 50);
    st.f2 = Math.min(st.sr / 2 * 0.98, pf($('itF2').value) || 20000);
    st.dur = Math.max(1, Math.min(20, pf($('itDur').value) || 5));
    st.tail = Math.max(0.5, Math.min(5, pf($('itTail').value) || 1.5));
    var n = Math.round(st.dur * st.sr);
    st.sweep = SG.logSweep(n, st.sr, st.f1, st.f2, 0.005);
    if (!st.sweep) { show('参数无效：需 f2 > f1 且在样点率一半以内', 'warn'); return; }
    st.running = true;
    $('itBtnMeasure').disabled = true;
    setStatus('正在请求麦克风…');
    mic = new IO.Mic();
    mic.onStop = function (samples) {
      st.running = false;
      $('itBtnMeasure').disabled = false;
      analyze(samples, st.sr, st.sweep);
    };
    mic.start(null, function (msg) {
      st.running = false;
      $('itBtnMeasure').disabled = false;
      setStatus(msg);
    }, function () {
      /* 麦克风就绪 → 播放扫频，结束后再录一段尾部（房间衰减） */
      setStatus('播放扫频 ' + fmt(st.dur, 1) + ' s（' + fmt(st.f1, 0) + '–' + fmt(st.f2 / 1000, 1) + ' kHz）并同步录音…');
      var src = IO.playSignal(st.sweep);
      if (src) src.onended = function () { setStatus('扫频播放完毕，录制房间衰减 ' + fmt(st.tail, 1) + ' s…'); };
      timer = setTimeout(function () {
        if (mic) mic.stop();
      }, (st.dur + st.tail) * 1000);
    });
    /* 安全网：异常时解除按钮 */
    timerReady = setTimeout(function () {
      if (st.running && mic && !mic.recording) {
        st.running = false;
        $('itBtnMeasure').disabled = false;
      }
    }, 8000);
  }

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (timerReady) { clearTimeout(timerReady); timerReady = null; }
    IO.stopPlayback();
    if (mic) mic.stop();
    st.running = false;
    $('itBtnMeasure').disabled = false;
    setStatus('已取消');
  }

  /* ---------- 上传录音 ---------- */
  function upload(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var w = IO.wavDecode(reader.result);
      if (!w) { setStatus('WAV 解析失败：需要 16/24/32-bit PCM 或 32-bit float 的 WAV 文件'); return; }
      st.sr = w.sampleRate;
      st.f1 = Math.max(5, pf($('itF1').value) || 50);
      st.f2 = Math.min(st.sr / 2 * 0.98, pf($('itF2').value) || 20000);
      st.dur = Math.max(1, Math.min(20, pf($('itDur').value) || 5));
      st.sweep = SG.logSweep(Math.round(st.dur * st.sr), st.sr, st.f1, st.f2, 0.005);
      if (!st.sweep) { setStatus('参数无效：需 f2 > f1 且在样点率一半以内'); return; }
      setStatus('已载入录音：' + fmt(w.samples.length / w.sampleRate, 2) + ' s @ ' + w.sampleRate + ' Hz（' + w.bits + ' bit，' + w.channels + ' 声道）');
      analyze(w.samples, w.sampleRate, st.sweep);
    };
    reader.readAsArrayBuffer(file);
  }

  function init(_mode, params) {
    if (init._d) return;
    init._d = true;
    $('itBtnMeasure').addEventListener('click', measure);
    $('itBtnCancel').addEventListener('click', cancel);
    $('itFile').addEventListener('change', function () { upload(this.files && this.files[0]); this.value = ''; });
    /* 深链分享：#/irt60?f1=50&f2=20000&dur=5&tail=1.5 */
    function collect() {
      return { f1: $('itF1').value, f2: $('itF2').value, dur: $('itDur').value, tail: $('itTail').value };
    }
    function applyParams(p) {
      if (!p) return;
      if (p.f1 != null && p.f1 !== '' && isFinite(parseFloat(p.f1))) $('itF1').value = p.f1;
      if (p.f2 != null && p.f2 !== '' && isFinite(parseFloat(p.f2))) $('itF2').value = p.f2;
      if (p.dur != null && p.dur !== '' && isFinite(parseFloat(p.dur))) $('itDur').value = p.dur;
      if (p.tail != null && p.tail !== '' && isFinite(parseFloat(p.tail))) $('itTail').value = p.tail;
    }
    var shareBtn = $('itBtnShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (!(window.AppShare && window.AppRouter)) return;
        var l = AppRouter.link('irt60', collect());
        AppShare.copy(l.url).then(function () { AppShare.toast('已复制分享链接', 'ok'); },
                                  function () { AppShare.toast('复制失败，请手动复制地址栏', 'warn'); });
      });
    }
    applyParams(params);
  }

  function onShow() {
    drawIr();
    drawDecay();
  }

  window.IrT60View = { init: init, onShow: onShow };
})();
