/*
 * view-stipa.js — 语言传输指数 STIPA 实测 视图（#/stipa）
 * 依赖 window.Stipa（内核）、window.AudioIO、window.MiniChart。
 *
 * 测量链（IEC 60268-16 Annex F 口径）：
 *   播放 STIPA 合成信号（7 个倍频带噪声载波 × 2 个低频调制，深度 0.5） →
 *   麦克风录音 → 每带带通 → Hilbert 包络 → 调制频率处深度（DTFT 精确投影） →
 *   MTF → 视在 SNR（限幅 ±15 dB）→ 男声计权 STI。
 *
 * 上传录音路径：MTF 只依赖收到的信号包络，不需要参考信号，直接分析即可
 *   （录音须由本页播放的 STIPA 信号，或同参数重放录制）。
 * 局限：浏览器麦克风/喇叭频响有限（尤其 8 kHz 带），结果与专业 STIPA 仪
 *   （经校准测量传声器）可能有偏差；正式验收以专业仪器为准。
 */
(function () {
  'use strict';
  var ST = window.Stipa, IO = window.AudioIO, MC = window.MiniChart;

  function $(id) { return document.getElementById(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function setStatus(t) { var e = $('spStatus'); if (e) e.textContent = t; }
  function show(html, cls) {
    var el = $('spOut');
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }

  var mic = null, timer = null, timerReady = null;
  var st = { running: false, sr: 0, dur: 8, sig: null };

  /* ---------- 各带 SNR 图 ---------- */
  function drawSnr(r) {
    var c = $('spSnrChart');
    if (!c || !r || !MC) return;
    var xs = [], ys = [];
    ST.BANDS.forEach(function (fc, i) {
      xs.push(fc);
      ys.push(r.bandSnr[i]);
    });
    MC.draw(c, {
      x: xs, xLog: true, yDigits: 0, yMin: -15, yMax: 15,
      xLabelFmt: function (v) { return (v >= 1000 ? v / 1000 + 'k' : v) + 'Hz'; },
      hBands: [
        { from: -15, to: 0, color: 'rgba(220,38,38,0.08)' },
        { from: 0, to: 15, color: 'rgba(34,197,94,0.08)' }
      ],
      series: [{ values: ys, color: MC.cssVar('--primary', '#2563eb'), width: 2.4, points: true }]
    });
  }

  function ratingCls(level) {
    return level === 'excellent' || level === 'good' ? 'ok' : (level === 'bad' || level === 'poor' ? 'warn' : '');
  }

  function render(r) {
    st.last = r;
    $('spSti').textContent = fmt(r.sti, 3);
    $('spRating').textContent = r.rating.label;
    $('spRating').className = 'kv-v ' + ratingCls(r.rating.level);
    /* MTF 表 */
    var rows = ST.BANDS.map(function (fc, i) {
      var m = r.mtf[i];
      var lbl = fc >= 1000 ? (fc / 1000) + ' kHz' : fc + ' Hz';
      var mods = ST.MOD_MATRIX[i];
      return '<tr><td>' + lbl + '</td>' +
        '<td class="mono">' + fmt(mods[0], 2) + ' Hz</td><td class="mono">' + fmt(m[0], 3) + '</td>' +
        '<td class="mono">' + fmt(mods[1], 2) + ' Hz</td><td class="mono">' + fmt(m[1], 3) + '</td>' +
        '<td class="mono">' + fmt(r.bandSnr[i], 1) + ' dB</td></tr>';
    }).join('');
    $('spTable').innerHTML = rows;
    var use = {
      bad: '语言可懂度差：正常交谈都难以听清，需优先处理（加大音量、缩短距离、加吸声）',
      poor: '语言可懂度不足：努力才能听清，不满足语言扩声要求',
      fair: '一般：安静环境下可正常交谈，噪声或混响稍大时有困难',
      good: '良好：多数语言场景可用（对应约 95% 左右的音节可懂度）',
      excellent: '优秀：接近理想传输，音乐与语言均无碍'
    }[r.rating.level];
    show('STI = <b>' + fmt(r.sti, 3) + '</b>（' + r.rating.label + '，' + r.rating.range + '）　男声计权' +
      '<br>' + use +
      '<br><span class="muted">判读参考：会议/教学 ≥ 0.60 为合格，音乐厅 ≥ 0.75；本结果为男声计权 STI' +
      '（IEC 60268-16:2011 Table 4）。各带 SNR 已限幅 ±15 dB；MTF 接近 1 表示该带调制传输完好。</span>',
      ratingCls(r.rating.level));
    drawSnr(r);
  }

  function analyze(rec, sr) {
    if (!rec || !rec.length) { show('录音为空，请检查麦克风是否正常采集', 'warn'); return; }
    setStatus('分析中…（7 带带通 → Hilbert 包络 → 调制深度投影）');
    setTimeout(function () {
      var r = ST.analyze(rec, sr);
      if (!r) { show('分析失败：信号时长不足或样点率异常', 'warn'); setStatus('分析失败'); return; }
      render(r);
      setStatus('分析完成：STI = ' + fmt(r.sti, 3) + '（' + r.rating.label + '）');
    }, 30);
  }

  /* ---------- 播放并录音 ---------- */
  function measure() {
    if (st.running) return;
    if (!IO) { setStatus('浏览器不支持 Web Audio'); return; }
    var c = IO.ensureCtx();
    if (!c) { setStatus('浏览器不支持 Web Audio'); return; }
    st.sr = c.sampleRate;
    st.dur = Math.max(6, Math.min(15, pf($('spDur').value) || 8));
    IO.setVolume(pf($('spVol').value) == null ? 0.9 : pf($('spVol').value));
    st.sig = ST.signal(Math.round(st.dur * st.sr), st.sr, 20261017);
    if (!st.sig) { show('参数无效', 'warn'); return; }
    st.running = true;
    $('spBtnMeasure').disabled = true;
    setStatus('正在请求麦克风…');
    mic = new IO.Mic();
    mic.onStop = function (samples) {
      st.running = false;
      $('spBtnMeasure').disabled = false;
      analyze(samples, st.sr);
    };
    mic.start(null, function (msg) {
      st.running = false;
      $('spBtnMeasure').disabled = false;
      setStatus(msg);
    }, function () {
      setStatus('播放 STIPA 信号 ' + fmt(st.dur, 0) + ' s 并同步录音…（请保持房间安静，喇叭音量适中）');
      var src = IO.playSignal(st.sig);
      if (src) src.onended = function () { setStatus('信号播放完毕，分析中…'); };
      timer = setTimeout(function () {
        if (mic) mic.stop();
      }, (st.dur + 0.5) * 1000);
    });
    timerReady = setTimeout(function () {
      if (st.running && mic && !mic.recording) {
        st.running = false;
        $('spBtnMeasure').disabled = false;
      }
    }, 8000);
  }

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (timerReady) { clearTimeout(timerReady); timerReady = null; }
    IO.stopPlayback();
    if (mic) mic.stop();
    st.running = false;
    $('spBtnMeasure').disabled = false;
    setStatus('已取消');
  }

  /* ---------- 上传录音 ---------- */
  function upload(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var w = IO.wavDecode(reader.result);
      if (!w) { setStatus('WAV 解析失败：需要 16/24/32-bit PCM 或 32-bit float 的 WAV 文件'); return; }
      setStatus('已载入录音：' + fmt(w.samples.length / w.sampleRate, 2) + ' s @ ' + w.sampleRate + ' Hz（' + w.bits + ' bit，' + w.channels + ' 声道）');
      analyze(w.samples, w.sampleRate);
    };
    reader.readAsArrayBuffer(file);
  }

  function init(_mode, params) {
    if (init._d) return;
    init._d = true;
    $('spBtnMeasure').addEventListener('click', measure);
    $('spBtnCancel').addEventListener('click', cancel);
    $('spFile').addEventListener('change', function () { upload(this.files && this.files[0]); this.value = ''; });
    $('spVol').addEventListener('change', function () { IO.setVolume(pf($('spVol').value) == null ? 0.9 : pf($('spVol').value)); });
    /* 深链分享：#/stipa?dur=8&vol=0.9 */
    function collect() {
      return { dur: $('spDur').value, vol: $('spVol').value };
    }
    function applyParams(p) {
      if (!p) return;
      if (p.dur != null && p.dur !== '' && isFinite(parseFloat(p.dur))) $('spDur').value = p.dur;
      if (p.vol != null && p.vol !== '' && isFinite(parseFloat(p.vol))) {
        $('spVol').value = p.vol;
        var lbl = $('spVolVal');
        if (lbl) lbl.textContent = p.vol;
      }
    }
    var shareBtn = $('spBtnShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (!(window.AppShare && window.AppRouter)) return;
        var l = AppRouter.link('stipa', collect());
        AppShare.copy(l.url).then(function () { AppShare.toast('已复制分享链接', 'ok'); },
                                  function () { AppShare.toast('复制失败，请手动复制地址栏', 'warn'); });
      });
    }
    applyParams(params);
  }

  function onShow() {
    if (st.last) drawSnr(st.last);
  }

  window.StipaView = { init: init, onShow: onShow };
})();
