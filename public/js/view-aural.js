/*
 * view-aural.js — 声学可听化 视图（#/aural）
 * 两件事：
 *   A. 混响可听化 A/B：同一干信号分别与"方案 A / 方案 B"的房间脉冲响应卷积，
 *      直接试听不同混响时间下的音质差异（房间可由模拟内核追踪，或直接给定各带 RT）。
 *   B. 隔声试听：噪声经不同隔声量 R 的构件阻隔前后的声音大小对比（倍频带频谱整形）。
 * 依赖 window.Aural（内核）、window.RoomSim（房间模拟）、window.MiniChart（曲线）。
 */
(function () {
  'use strict';
  var A = window.Aural, S = window.RoomSim, MC = window.MiniChart;
  function $(id) { return window.Util.$(id); }
  function css(n, fb) { return (MC && MC.cssVar) ? MC.cssVar(n, fb) : fb; }
  function clamp(v, a, b) { v = Number(v); return isNaN(v) ? a : (v < a ? a : (v > b ? b : v)); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }

  var ac = null, master = null;
  var st = {
    sr: 0, dry: null, dryName: '',
    irA: null, irB: null, wetA: null, wetB: null,
    infoA: null, infoB: null,
    insR: null, insBefore: null, insAfter: null, insName: '',
    playing: [], timers: []
  };
  var inited = false;

  function audio() {
    if (!ac) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      master = ac.createGain();
      master.gain.value = clamp($('auVol') ? $('auVol').value : 0.9, 0, 1);
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function sr() { var c = audio(); return c ? c.sampleRate : 44100; }

  function setStatus(t) { var e = $('auStatus'); if (e) e.textContent = t; }

  /* ---------- 播放 ---------- */
  function stopAll() {
    st.playing.forEach(function (n) { try { n.stop(); } catch (e) { } });
    st.playing = [];
    st.timers.forEach(clearTimeout);
    st.timers = [];
  }
  function play(x, when) {
    var c = audio(); if (!c || !x) return;
    var buf = c.createBuffer(1, x.length, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < x.length; i++) d[i] = x[i];
    var src = c.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(when || 0);
    st.playing.push(src);
    src.onended = function () {
      var k = st.playing.indexOf(src);
      if (k >= 0) st.playing.splice(k, 1);
    };
    return src;
  }
  /* A → B 顺序交替对比 */
  function playAB(xa, xb, eachSec, rounds) {
    if (!xa || !xb) return;
    stopAll();
    var c = audio(); if (!c) return;
    var t0 = c.currentTime + 0.12;
    for (var r = 0; r < rounds; r++) {
      play(xa, t0 + r * 2 * eachSec);
      play(xb, t0 + r * 2 * eachSec + eachSec);
    }
    setStatus('交替播放：A → B 各 ' + eachSec.toFixed(1) + ' s，共 ' + rounds + ' 轮（总 ' +
      (2 * rounds * eachSec).toFixed(1) + ' s）');
  }

  function downloadWav(x, name) {
    if (!x) return;
    var u8 = A.wavEncode(x, st.sr || sr());
    var blob = new Blob([u8], { type: 'audio/wav' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }

  /* ---------- 干信号 ---------- */
  function makeDry() {
    var s = sr(); st.sr = s;
    var kind = $('auDry').value;
    if (kind === 'file') {
      if (!st.dry) { setStatus('请先选择音频文件'); return null; }
      st.dryName = st.dryName || '上传音频';
      return st.dry;
    }
    if (kind === 'clap') { st.dryName = '拍手脉冲'; return A.clap(s, 0.3); }
    if (kind === 'syl') { st.dryName = '合成音节'; return A.syllables(s, 5); }
    if (kind === 'pink') {
      st.dryName = '粉噪猝发';
      var n = A.shapedNoise({ sr: s, durSec: 1.2, spectrumDb: A.bandLevelsToPsd([0, 0, 0, 0, 0, 0]), seed: 11 });
      var out = new Float32Array(n.length);
      for (var i = 0; i < n.length; i++) {
        var t = i / s;
        out[i] = n[i] * Math.min(1, t / 0.02) * Math.exp(-Math.max(0, t - 0.5) * 6);
      }
      A.normalizePeak(out, 0.95);
      return out;
    }
    return null;
  }

  /* ---------- A. 混响可听化 ---------- */
  function buildIR(which) {
    var s = sr(); st.sr = s;
    var mode = $('auMode').value;
    if (mode === 'rt') {
      /* 直接指定各倍频带混响时间 */
      var base = clamp($(which === 'A' ? 'auRtA' : 'auRtB').value, 0.1, 8);
      var tilt = clamp($('auRtTilt').value, -60, 60) / 100;    // 低频相对中频的倍率偏移
      var rt = [];
      for (var k = 0; k < A.NB; k++) {
        var f = k - 3;                                          // 相对 1 kHz 的倍频程数
        rt.push(Math.max(0.08, base * (1 + tilt * f)));
      }
      var ir = A.irFromRT(rt, { sr: s, durSec: Math.min(12, Math.max(0.3, Math.max.apply(null, rt) * 1.1 + 0.2)), directGain: 0.8 });
      return {
        ir: ir,
        info: {
          rt: rt, t30: null, edt: null, c50: null, d50: null,
          label: 'RT 设定 1 kHz = ' + base.toFixed(2) + ' s'
        }
      };
    }
    /* 按房间模拟：光线追踪 → 接收点回波 → 合成 IR */
    var L = clamp($('auLen').value, 0.5, 200), Wd = clamp($('auWid').value, 0.5, 200);
    var H = clamp($('auHgt').value, 1.5, 30);
    var a = clamp($(which === 'A' ? 'auAlphaA' : 'auAlphaB').value, 0.005, 0.98);
    var model = S.buildRoom({ width: L, depth: Wd, height: H, alpha: a });
    if (!model.ok) return null;
    var tr = S.traceBox(model, {
      source: { x: clamp($('auSrcX').value, 0, L), y: clamp($('auSrcY').value, 0, Wd), z: clamp($('auSrcZ').value, 0.1, H) },
      nRays: Math.round(clamp($('auRays').value, 200, 4000)),
      scatter: 0.35
    });
    var rcv = { x: clamp($('auRcvX').value, 0, L), y: clamp($('auRcvY').value, 0, Wd), z: clamp($('auRcvZ').value, 0.1, H) };
    var ec = S.receiverBands(tr.rays, rcv, { radius: 0.8, model: model });
    var ir = A.irFromEchogram(ec, { sr: s, seed: which === 'A' ? 101 : 202 });
    if (!ir) return null;
    var isoMid = { t30: null, edt: null, c50: null, d50: null, ts: null };
    var e3 = S.isoFromEchogram(ec, 3), e2 = S.isoFromEchogram(ec, 2);
    function av(k) { return (e3 && e2 && e3[k] != null && e2[k] != null) ? (e3[k] + e2[k]) / 2 : (e3 ? e3[k] : null); }
    isoMid.t30 = av('t30'); isoMid.edt = av('edt'); isoMid.c50 = av('c50'); isoMid.d50 = av('d50'); isoMid.ts = av('ts');
    var rt = [];
    for (var k2 = 0; k2 < A.NB; k2++) rt.push(S.isoFromEchogram(ec, k2).t30);
    return {
      ir: ir,
      info: {
        rt: rt, t30: isoMid.t30, edt: isoMid.edt, c50: isoMid.c50, d50: isoMid.d50, ts: isoMid.ts,
        label: 'α = ' + a.toFixed(2) + ' · Sabine(1k) = ' + fmt(model.bands[3].sabine) + ' s'
      }
    };
  }

  function renderReverb() {
    var dry = makeDry();
    if (!dry) return;
    st.dry = (($('auDry').value === 'file') ? st.dry : null);
    st.irA = null; st.irB = null; st.wetA = null; st.wetB = null;
    setStatus('正在生成脉冲响应…');
    setTimeout(function () {
      var ra = buildIR('A');
      if (!ra) { setStatus('方案 A 生成失败，请检查输入'); return; }
      var rb = buildIR('B');
      if (!rb) { setStatus('方案 B 生成失败，请检查输入'); return; }
      st.irA = ra.ir; st.irB = rb.ir; st.infoA = ra.info; st.infoB = rb.info;
      st.wetA = A.convolve(dry, ra.ir.data);
      st.wetB = A.convolve(dry, rb.ir.data);
      updateReverbOut();
      drawDecay();
      setStatus('已生成：干信号「' + st.dryName + '」，A / B 两条混响声可试听对比');
    }, 20);
  }

  function card(label, val) {
    return '<div style="background:var(--card-soft);border:1px solid var(--border);border-radius:8px;padding:10px 12px">' +
      '<div style="font-size:12px;color:var(--muted)">' + label + '</div>' +
      '<div style="font-size:18px;color:var(--text);margin-top:3px">' + val + '</div></div>';
  }

  function updateReverbOut() {
    var el = $('auRevOut'); if (!el || !st.infoA) return;
    function row(name, key, unit, d) {
      var a = st.infoA[key], b = st.infoB ? st.infoB[key] : null;
      return '<tr><td>' + name + '</td><td>' + fmt(a, d) + (unit || '') + '</td><td>' + fmt(b, d) + (unit || '') + '</td></tr>';
    }
    var rtRowA = st.infoA.rt || [], rtRowB = (st.infoB && st.infoB.rt) || [];
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">';
    html += card('方案 A · ' + st.infoA.label, fmt(st.infoA.t30) + ' s (T30)');
    html += card('方案 B · ' + st.infoB.label, fmt(st.infoB.t30) + ' s (T30)');
    html += card('干信号', st.dryName);
    html += card('采样率', (st.sr / 1000).toFixed(1) + ' kHz');
    html += '</div>';
    html += '<div class="table-wrap" style="margin-top:14px"><table class="detail-table wide"><thead><tr>' +
      '<th>参量</th><th>方案 A</th><th>方案 B</th></tr></thead><tbody>' +
      row('T30（中频，s）', 't30', '', 2) +
      row('EDT（中频，s）', 'edt', '', 2) +
      row('C50（dB）', 'c50', '', 1) +
      row('D50（%）', 'd50', '', null) +
      '</tbody></table></div>';
    html += '<div class="table-wrap" style="margin-top:10px"><table class="detail-table wide"><thead><tr>' +
      '<th>倍频带 (Hz)</th>' + A.BANDS.map(function (f) { return '<th>' + f + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      '<tr><td>A · T30 (s)</td>' + rtRowA.map(function (v) { return '<td>' + fmt(v, 2) + '</td>'; }).join('') + '</tr>' +
      '<tr><td>B · T30 (s)</td>' + rtRowB.map(function (v) { return '<td>' + fmt(v, 2) + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div>';
    el.innerHTML = html;
  }

  /* IR 衰减曲线（Schroeder） */
  function drawDecay() {
    var c = $('auDecay'); if (!c || !MC || !st.irA) return;
    function curve(ir) {
      var binMs = 20, nb = Math.max(4, Math.floor(ir.data.length / st.sr * 1000 / binMs));
      var bins = [];
      for (var i = 0; i < nb; i++) bins.push(0);
      for (var j = 0; j < ir.data.length; j++) {
        var b = Math.floor(j / st.sr * 1000 / binMs);
        if (b < nb) bins[b] += ir.data[j] * ir.data[j];
      }
      var mx = 0; bins.forEach(function (v) { if (v > mx) mx = v; });
      return bins.map(function (v) { return (v > 0 && mx > 0) ? 10 * Math.log10(v / mx) : -80; });
    }
    var a = curve(st.irA), b = st.irB ? curve(st.irB) : null;
    var n = Math.max(a.length, b ? b.length : 0);
    var xs = [];
    for (var i = 0; i < n; i++) xs.push(i * 20);
    var series = [{ values: a, color: css('--primary', '#1d4ed8'), points: false, width: 2 }];
    if (b) series.push({ values: b, color: css('--accent', '#c2410c'), points: false, width: 2 });
    MC.draw(c, { x: xs, yMin: -70, yDigits: 0, xLabelFmt: function (v) { return Math.round(v) + ''; }, series: series });
  }

  /* ---------- B. 隔声试听 ---------- */
  function readR() {
    var out = [];
    for (var i = 0; i < A.NB; i++) {
      var el = $('auR' + i);
      out.push(el ? clamp(el.value, 0, 90) : 0);
    }
    return out;
  }
  function applyPreset() {
    var id = $('auInsPreset').value;
    var p = A.INSULATION_PRESETS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    for (var i = 0; i < A.NB; i++) { var el = $('auR' + i); if (el) el.value = p.R[i]; }
    st.insName = p.name;
  }

  function renderInsulation() {
    var s = sr(); st.sr = s;
    var srcId = $('auNoise').value;
    var src = A.NOISE_SOURCES.filter(function (x) { return x.id === srcId; })[0] || A.NOISE_SOURCES[0];
    var dur = clamp($('auInsDur').value, 0.5, 8);
    var x = A.shapedNoise({ sr: s, durSec: dur, spectrumDb: A.bandLevelsToPsd(src.levels), seed: 21 });
    /* 首尾 20 ms 淡入淡出，避免爆音 */
    var fade = Math.round(s * 0.02);
    for (var i = 0; i < x.length; i++) {
      var g = 1;
      if (i < fade) g = i / fade;
      if (i > x.length - fade) g = Math.min(g, (x.length - i) / fade);
      x[i] *= g;
    }
    var R = readR();
    st.insR = R;
    st.insBefore = x;
    st.insAfter = A.applyOctaveGains(x, R.map(function (r) { return -r; }), s);
    updateInsOut(src.name, R);
    setStatus('已生成「' + src.name + '」阻隔前 / 后的声音，可试听对比');
  }

  function updateInsOut(srcName, R) {
    var el = $('auInsOut'); if (!el || !st.insBefore) return;
    var lb = A.bandLevels(st.insBefore, st.sr) || [];
    var dA = A.awReduction(lb, R), dL = A.linReduction(lb, R);
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">';
    html += card('噪声源', srcName);
    html += card('A 计权降低量', fmt(dA, 1) + ' dB(A)');
    html += card('线性（不计权）降低量', fmt(dL, 1) + ' dB');
    html += card('等效单值评价参考', 'R<sub>w</sub> ≈ ' + fmt(rwFromR(R), 0) + ' dB');
    html += '</div>';
    html += '<div class="table-wrap" style="margin-top:14px"><table class="detail-table wide"><thead><tr>' +
      '<th>倍频带 (Hz)</th>' + A.BANDS.map(function (f) { return '<th>' + f + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      '<tr><td>隔声量 R (dB)</td>' + R.map(function (v) { return '<td>' + fmt(v, 0) + '</td>'; }).join('') + '</tr>' +
      '<tr><td>阻隔前相对声级 (dB)</td>' + lb.map(function (v) { return '<td>' + fmt(v, 1) + '</td>'; }).join('') + '</tr>' +
      '<tr><td>阻隔后相对声级 (dB)</td>' + lb.map(function (v, i) {
        return '<td>' + fmt(v - R[i], 1) + '</td>';
      }).join('') + '</tr>' +
      '</tbody></table></div>';
    el.innerHTML = html;
    drawInsBars(lb, R);
  }

  /* 由 6 段 R 粗估计权隔声量 Rw（对照 GB/T 50121 参考曲线的简化拟合） */
  var RW_REF = [-16, -7, 0, 3, 4, 4];     // ISO 717 / GB/T 50121 参考曲线相对 500 Hz 的偏移（倍频带）
  function rwFromR(R) {
    var best = null;
    for (var shift = 0; shift <= 60; shift += 1) {
      var unfav = 0, ok = true;
      for (var i = 0; i < A.NB; i++) {
        var d = (shift + RW_REF[i]) - R[i];
        if (d > 0) unfav += d;
      }
      if (unfav > 32 + 1e-9) continue;    // 不利偏差总和 ≤ 32 dB
      best = shift;
    }
    return best;
  }

  function drawInsBars(lb, R) {
    var c = $('auInsBars'); if (!c || !MC) return;
    var bef = lb.map(function (v) { return v; });
    var aft = lb.map(function (v, i) { return v - R[i]; });
    var xs = A.BANDS.map(function (f, i) { return i; });
    MC.draw(c, {
      x: xs, yMin: -70, yDigits: 0,
      xLabelFmt: function (v) { return A.BANDS[Math.round(v)] + ''; },
      series: [
        { values: bef, color: css('--accent', '#c2410c'), points: true, width: 2 },
        { values: aft, color: css('--primary', '#1d4ed8'), points: true, width: 2 }
      ]
    });
  }

  /* ---------- 上传音频 ---------- */
  function onFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var c = audio(); if (!c) return;
    var fr = new FileReader();
    fr.onload = function () {
      c.decodeAudioData(fr.result, function (buf) {
        var d = buf.getChannelData(0);
        var n = Math.min(d.length, Math.round(buf.sampleRate * 8));   // 最多取 8 s
        var x = new Float32Array(n);
        for (var i = 0; i < n; i++) x[i] = d[i];
        A.normalizePeak(x, 0.95);
        st.dry = x; st.dryName = f.name + '（' + (n / buf.sampleRate).toFixed(1) + ' s）';
        st.sr = c.sampleRate;
        setStatus('已载入音频：' + st.dryName + '，可点击「生成混响 A/B」后试听');
      }, function () { setStatus('音频解码失败，请换一个文件'); });
    };
    fr.readAsArrayBuffer(f);
  }

  function syncMode() {
    var m = $('auMode'); if (!m) return;
    var isRt = m.value === 'rt';
    ['auRoomRow', 'auSrcRow', 'auRcvRow', 'auRaysRow'].forEach(function (id) {
      var e = $(id); if (e) e.style.display = isRt ? 'none' : '';
    });
    ['auRtRow', 'auTiltRow'].forEach(function (id) {
      var e = $(id); if (e) e.style.display = isRt ? '' : 'none';
    });
  }

  function fillSelects() {
    var p = $('auInsPreset');
    if (p) A.INSULATION_PRESETS.forEach(function (x) {
      var o = document.createElement('option'); o.value = x.id; o.textContent = x.name; p.appendChild(o);
    });
    var n = $('auNoise');
    if (n) A.NOISE_SOURCES.forEach(function (x) {
      var o = document.createElement('option'); o.value = x.id; o.textContent = x.name; n.appendChild(o);
    });
    if (p) { p.value = 'brick-240'; applyPreset(); }
    if (n) n.value = 'traffic';
  }

  function init() {
    if (inited) return; inited = true;
    fillSelects();
    syncMode();
    $('auMode').addEventListener('change', syncMode);
    $('auInsPreset').addEventListener('change', applyPreset);
    $('auDry').addEventListener('change', function () {
      var row = $('auFileRow'); if (row) row.style.display = (this.value === 'file') ? '' : 'none';
    });
    var f = $('auFile'); if (f) f.addEventListener('change', onFile);
    var vol = $('auVol');
    if (vol) vol.addEventListener('input', function () {
      var v = clamp(this.value, 0, 1);
      if (master) master.gain.value = v;
      var lab = $('auVolVal'); if (lab) lab.textContent = v.toFixed(2);
    });

    $('auGen').addEventListener('click', renderReverb);
    $('auPlayA').addEventListener('click', function () { stopAll(); play(st.wetA, 0); setStatus('正在播放：方案 A'); });
    $('auPlayB').addEventListener('click', function () { stopAll(); play(st.wetB, 0); setStatus('正在播放：方案 B'); });
    $('auPlayDry').addEventListener('click', function () {
      stopAll();
      var d = makeDry(); if (!d) return;
      play(d, 0); setStatus('正在播放：干信号（无混响）');
    });
    $('auPlayAB').addEventListener('click', function () { playAB(st.wetA, st.wetB, 2.5, 2); });
    $('auStop').addEventListener('click', function () { stopAll(); setStatus('已停止'); });
    $('auWavA').addEventListener('click', function () { downloadWav(st.wetA, 'reverb-A.wav'); });
    $('auWavB').addEventListener('click', function () { downloadWav(st.wetB, 'reverb-B.wav'); });

    $('auInsGen').addEventListener('click', renderInsulation);
    $('auInsBefore').addEventListener('click', function () { stopAll(); play(st.insBefore, 0); setStatus('正在播放：阻隔前'); });
    $('auInsAfter').addEventListener('click', function () { stopAll(); play(st.insAfter, 0); setStatus('正在播放：阻隔后'); });
    $('auInsAB').addEventListener('click', function () { playAB(st.insBefore, st.insAfter, 2.0, 3); });
    $('auInsStop').addEventListener('click', function () { stopAll(); setStatus('已停止'); });
    $('auWavIns0').addEventListener('click', function () { downloadWav(st.insBefore, 'insulation-before.wav'); });
    $('auWavIns1').addEventListener('click', function () { downloadWav(st.insAfter, 'insulation-after.wav'); });
  }

  function onShow() { }

  window.AuralView = { init: init, onShow: onShow };
})();
