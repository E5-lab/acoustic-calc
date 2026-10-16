/*
 * view-sim.js — 室内音质模拟 视图（#/sim）
 * 依赖 window.RoomSim（内核）、window.MiniChart（曲线）、window.Room（材料库，可选）。
 */
(function () {
  'use strict';
  var S = window.RoomSim, MC = window.MiniChart;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function css(name, fb) { return (MC && MC.cssVar) ? MC.cssVar(name, fb) : fb; }
  function clamp(v, a, b) { v = Number(v); return isNaN(v) ? a : (v < a ? a : (v > b ? b : v)); }

  var STOPS = [[24, 95, 165], [15, 110, 86], [186, 117, 23], [226, 75, 74], [163, 45, 45]];
  function ramp(v) {
    v = v < 0 ? 0 : (v > 1 ? 1 : v);
    var n = STOPS.length - 1, f = v * n, i = Math.floor(f), k = f - i;
    var A = STOPS[i], B = STOPS[Math.min(n, i + 1)];
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * k) + ',' + Math.round(A[2] + (B[2] - A[2]) * k) + ')';
  }

  var METRIC_INFO = {
    L: { name: '相对声压级', unit: 'dB', text: '相对声压级（dB，以场内最高为 0 dB；越暖越强）', digits: 1 },
    C50: { name: '清晰度 C50', unit: 'dB', text: '清晰度 C50（dB，越高语音越清晰；越暖越高）', digits: 1 },
    D50: { name: '定义度 D50', unit: '', text: '定义度 D50（0–1，越高越清晰；越暖越高）', digits: 2 },
    Ts: { name: '中心时间 Ts', unit: 'ms', text: '中心时间 Ts（ms，越小越清晰；越冷越清晰）', digits: 0 }
  };

  var cv, ctx, off, octx, W = 800, H = 380, dpr = 1;
  var viewEl;
  var st = { model: null, trace: null, gm: null, range: null, metric: 'L', scale: 1, ox: 0, oy: 0, t: 0, running: true, showPath: false, maxT: 1, last: 0, rcv: null, iso: null, resp: null };
  var inited = false;

  function fit() {
    if (!cv) return;
    var wrap = cv.parentNode;
    var w = Math.max(320, Math.round(wrap.clientWidth || 800));
    H = Number(cv.getAttribute('height')) || 380;
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!off) { off = document.createElement('canvas'); }
    off.width = cv.width; off.height = cv.height;
    octx = off.getContext('2d'); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w;
  }

  function setupView() {
    var m = 30;
    st.scale = Math.min((W - 2 * m) / st.model.bounds.w, (H - 2 * m) / st.model.bounds.d);
    st.ox = (W - st.model.bounds.w * st.scale) / 2;
    st.oy = (H - st.model.bounds.d * st.scale) / 2;
  }
  function PX(x) { return st.ox + x * st.scale; }
  function PY(y) { return st.oy + y * st.scale; }

  function readForm() {
    var L = clamp($('simLen').value, 0.5, 200), Wd = clamp($('simWid').value, 0.5, 200);
    var h = clamp($('simHgt').value, 1.5, 30), a = clamp($('simAlpha').value, 0.005, 0.98);
    var innerWalls = [];
    if ($('simInner').checked) {
      var ix = clamp($('simInnerX').value, 0, L);
      innerWalls.push({ x1: ix, y1: clamp($('simInnerY1').value, 0, Wd), x2: ix, y2: clamp($('simInnerY2').value, 0, Wd), alpha: a });
    }
    return { L: L, Wd: Wd, h: h, a: a, innerWalls: innerWalls };
  }

  function run() {
    var f = readForm();
    var model = S.buildRoom({ width: f.L, depth: f.Wd, height: f.h, alpha: f.a, innerWalls: f.innerWalls });
    if (!model.ok) { $('simLegend').textContent = model.error; return; }
    st.model = model;
    var src = { x: clamp($('simSrcX').value, 0, f.L), y: clamp($('simSrcY').value, 0, f.Wd) };
    var rcv = { x: clamp($('simRcvX').value, 0, f.L), y: clamp($('simRcvY').value, 0, f.Wd) };
    st.rcv = rcv; st.src = src;

    var nRays = Math.round(clamp($('simRays').value, 48, 2000));
    var mb = Math.round(clamp($('simBounces').value, 5, 200));
    var tv = S.traceRoom(model, { source: src, nRays: nRays, maxBounces: mb, minEnergy: 0.02, maxLength: 500 });
    st.trace = tv;
    var gxs = Math.round(clamp($('simGrid').value, 12, 120));
    var gys = Math.max(6, Math.round(gxs * f.Wd / f.L));
    st.grid = S.sampleGrid(model, tv.rays, { gx: gxs, gy: gys });
    st.gm = S.gridMetrics(st.grid);
    st.resp = S.receiverResponse(tv.rays, rcv, { radius: 0.7, binMs: 20, maxMs: 600 });
    st.iso = S.isoFromEchogram(st.resp);
    st.maxT = Math.max(1, tv.maxLength);
    st.t = 0; st.running = true;
    if ($('simPlay')) $('simPlay').textContent = '暂停';

    st.metric = $('simMetric').value;
    st.range = S.metricRange(st.gm, st.metric, { minE: st.gm.maxE * 0.01 });
    fit(); setupView(); repaintStatic(); render(); updateMets(); drawEcho(); updateLegend();
  }

  function repaintStatic() {
    if (!octx || !st.model) return;
    var model = st.model;
    octx.clearRect(0, 0, W, H);
    var bg = css('--card-soft', '#f6f8fc');
    var x0 = PX(0), y0 = PY(0), x1 = PX(model.bounds.w), y1 = PY(model.bounds.d);
    octx.fillStyle = bg; octx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // heatmap
    if (st.gm && st.range) {
      var gm = st.gm, rng = st.range, thresh = gm.maxE * 0.01;
      for (var iy = 0; iy < gm.gy; iy++) {
        for (var ix = 0; ix < gm.gx; ix++) {
          var m = gm.metrics[iy * gm.gx + ix];
          if (!m || m.E < thresh || m[st.metric] == null) continue;
          var val = m[st.metric];
          var frac = (st.metric === 'Ts') ? (rng[1] - val) / (rng[1] - rng[0]) : (val - rng[0]) / (rng[1] - rng[0]);
          octx.fillStyle = ramp(frac);
          octx.globalAlpha = 0.82;
          octx.fillRect(x0 + ix * gm.cw * st.scale, y0 + iy * gm.ch * st.scale, gm.cw * st.scale + 0.6, gm.ch * st.scale + 0.6);
        }
      }
      octx.globalAlpha = 1;
    }

    // paths
    if (st.showPath && st.trace) {
      octx.strokeStyle = css('--muted', '#4d5b6e');
      octx.globalAlpha = 0.22; octx.lineWidth = 1;
      st.trace.rays.forEach(function (ray) {
        var p = ray.pts; octx.beginPath(); octx.moveTo(PX(p[0].x), PY(p[0].y));
        for (var q = 1; q < p.length; q++) octx.lineTo(PX(p[q].x), PY(p[q].y));
        octx.stroke();
      });
      octx.globalAlpha = 1;
    }

    // walls
    octx.strokeStyle = css('--text-soft', '#2b3a4d'); octx.lineWidth = 2;
    octx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    model.innerWalls.forEach(function (s) {
      octx.strokeStyle = css('--text', '#0f1a2a'); octx.lineWidth = 3;
      octx.beginPath(); octx.moveTo(PX(s.x1), PY(s.y1)); octx.lineTo(PX(s.x2), PY(s.y2)); octx.stroke();
    });

    // source & receiver
    if (st.src) { octx.fillStyle = css('--accent', '#c2410c'); octx.beginPath(); octx.arc(PX(st.src.x), PY(st.src.y), 5, 0, 6.2832); octx.fill(); }
    if (st.rcv) { octx.fillStyle = css('--primary', '#1d4ed8'); octx.fillRect(PX(st.rcv.x) - 4, PY(st.rcv.y) - 4, 8, 8); }
    octx.fillStyle = css('--muted', '#4d5b6e'); octx.font = '12px system-ui, sans-serif';
    if (st.src) octx.fillText('声源', PX(st.src.x) - 12, PY(st.src.y) - 10);
    if (st.rcv) octx.fillText('接收点', PX(st.rcv.x) - 18, PY(st.rcv.y) + 20);
  }

  function posAt(ray, dist) {
    var p = ray.pts;
    if (dist < 0 || dist > ray.length) return null;
    var lo = 0, hi = p.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (p[mid].t <= dist) lo = mid; else hi = mid; }
    var A = p[lo], B = p[lo + 1], seg = (B.t - A.t) || 1, fr = (dist - A.t) / seg;
    return { x: A.x + (B.x - A.x) * fr, y: A.y + (B.y - A.y) * fr, e: A.e };
  }

  function render() {
    if (!ctx || !st.model) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(off, 0, 0); ctx.restore();
    if (!st.trace) return;
    var fill = css('--text', '#0f1a2a'), stroke = css('--card', '#ffffff');
    st.trace.rays.forEach(function (ray) {
      var pos = posAt(ray, st.t);
      if (!pos) return;
      var r = 1.4 + 2.2 * Math.min(1, pos.e), al = 0.3 + 0.7 * Math.min(1, pos.e * 1.4);
      ctx.globalAlpha = al;
      ctx.beginPath(); ctx.arc(PX(pos.x), PY(pos.y), r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = stroke; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (st.src) { ctx.fillStyle = css('--accent', '#c2410c'); ctx.beginPath(); ctx.arc(PX(st.src.x), PY(st.src.y), 5, 0, 6.2832); ctx.fill(); }
    if (st.rcv) { ctx.fillStyle = css('--primary', '#1d4ed8'); ctx.fillRect(PX(st.rcv.x) - 4, PY(st.rcv.y) - 4, 8, 8); }
  }

  function loop(now) {
    if (!st.last) st.last = now;
    var dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
    if (!viewEl || !viewEl.classList.contains('active') || !st.model) { requestAnimationFrame(loop); return; }
    if (st.running) { st.t += dt * 46; if (st.t > st.maxT + 3) st.t = 0; }
    render();
    requestAnimationFrame(loop);
  }

  function card(label, val) {
    return '<div style="background:var(--card-soft);border:1px solid var(--border);border-radius:8px;padding:10px 12px">' +
      '<div style="font-size:12px;color:var(--muted)">' + label + '</div>' +
      '<div style="font-size:18px;color:var(--text);margin-top:3px">' + val + '</div></div>';
  }
  function updateMets() {
    var el = $('simMets'); if (!el) return;
    var m = st.model, iso = st.iso, tr = st.trace;
    var html = '';
    if (m) {
      html += card('Sabine RT60 估算', fmt(m.rt60) + ' s');
      html += card('平均自由程', fmt(m.meanFreePath) + ' m');
      html += card('平均反射次数', fmt(tr && tr.hits, 1));
      html += card('能量吸收率', tr ? Math.round(tr.absorbed * 100) + '%' : '—');
    }
    if (iso && iso.ok) {
      html += card('接收点 EDT', fmt(iso.edt) + ' s');
      html += card('接收点 T30', fmt(iso.t30) + ' s');
      html += card('清晰度 C50', fmt(iso.c50) + ' dB');
      html += card('定义度 D50', fmt(iso.d50 ? iso.d50 * 100 : null, 0) + ' %');
    }
    el.innerHTML = html || '<span class="hint">点击「开始模拟」查看结果</span>';
  }

  function drawEcho() {
    var ec = $('simEcho'); if (!ec || !st.resp) return;
    var bins = Array.prototype.slice.call(st.resp.bins), binMs = st.resp.binMs;
    var xs = bins.map(function (_, i) { return i * binMs; });
    MC.draw(ec, {
      x: xs, yMin: 0, yDigits: 4,
      xLabelFmt: function (v) { return v + ''; },
      series: [{ values: bins, color: css('--primary', '#1d4ed8'), points: false, width: 2 }]
    });
  }

  function updateLegend() {
    var info = METRIC_INFO[st.metric] || METRIC_INFO.L;
    var r = st.range;
    var rng = r ? ('（区间 ' + Number(r[0]).toFixed(info.digits) + ' ~ ' + Number(r[1]).toFixed(info.digits) + ' ' + (info.unit || '') + '）') : '';
    $('simLegend').textContent = info.text + rng + '　·　几何声学估算，非验收级。';
  }

  function exportPng() {
    if (!cv) return;
    var a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'room-sim-' + st.metric + '.png';
    a.click();
  }

  function fillMaterials() {
    var sel = $('simMat'); if (!sel || !window.Room || !window.Room.MATERIALS) return;
    window.Room.MATERIALS.forEach(function (m) {
      var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      var m = window.Room.MATERIALS.filter(function (x) { return x.id === sel.value; })[0];
      if (m) $('simAlpha').value = Number((m.alpha[2] + m.alpha[3]) / 2).toFixed(3);
    });
  }

  function init() {
    if (inited) return; inited = true;
    cv = $('simCanvas'); viewEl = document.getElementById('view-sim');
    fillMaterials();
    $('simRun').addEventListener('click', run);
    $('simPlay').addEventListener('click', function () { st.running = !st.running; this.textContent = st.running ? '暂停' : '播放'; });
    $('simPath').addEventListener('click', function () { st.showPath = !st.showPath; repaintStatic(); render(); });
    $('simPng').addEventListener('click', exportPng);
    $('simMetric').addEventListener('change', function () {
      st.metric = this.value;
      st.range = st.gm ? S.metricRange(st.gm, st.metric, { minE: st.gm.maxE * 0.01 }) : null;
      repaintStatic(); render(); updateLegend();
    });
    window.addEventListener('resize', function () {
      if (!st.model) return; fit(); setupView(); repaintStatic(); render();
    });
    requestAnimationFrame(loop);
  }

  function onShow() {
    if (!st.model) return;
    fit(); setupView(); repaintStatic(); render();
  }

  window.SimView = { init: init, onShow: onShow };
})();
