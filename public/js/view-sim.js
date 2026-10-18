/*
 * view-sim.js — 室内音质模拟彩图 视图（#/sim）
 * 版式参考 Odeon / Raynoise / CATT：左侧三维轴测房间模型（地面铺声场彩图），
 * 右侧为该指标的色标标杆（色带 + 整齐刻度 + 接收点模拟值标记）。
 * 指标支持六个倍频带（125 Hz ~ 4 kHz）与中频均值，含 EDT / T30 混响时间分布。
 * 可导出 PNG 图片。
 * 依赖 window.RoomSim（内核）、window.MiniChart（曲线）、window.Room（材料库，可选）。
 */
(function () {
  'use strict';
  var S = window.RoomSim, MC = window.MiniChart;
  function $(id) { return window.Util.$(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function css(name, fb) { return (MC && MC.cssVar) ? MC.cssVar(name, fb) : fb; }
  function clamp(v, a, b) { v = Number(v); return isNaN(v) ? a : (v < a ? a : (v > b ? b : v)); }

  /* 色标：冷（低）→ 暖（高），与 Odeon 蓝→青→绿→黄→红 观感一致 */
  var STOPS = [[24, 95, 165], [15, 110, 86], [186, 117, 23], [226, 75, 74], [163, 45, 45]];
  function ramp(v) {
    v = v < 0 ? 0 : (v > 1 ? 1 : v);
    var n = STOPS.length - 1, f = v * n, i = Math.floor(f), k = f - i;
    var A = STOPS[i], B = STOPS[Math.min(n, i + 1)];
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * k) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * k) + ')';
  }

  var METRIC_INFO = {
    L: { name: '相对声压级 L', unit: 'dB', short: 'L', text: '相对声压级（dB，场内最高为 0 dB；越暖越强）', digits: 1, invert: false },
    C50: { name: '清晰度 C50', unit: 'dB', short: 'C50', text: '语言清晰度 C50（dB，越高越清晰；越暖越高）', digits: 1, invert: false },
    C80: { name: '音乐明晰度 C80', unit: 'dB', short: 'C80', text: '音乐明晰度 C80（dB，越高越明晰；越暖越高）', digits: 1, invert: false },
    D50: { name: '定义度 D50', unit: '', short: 'D50', text: '定义度 D50（0–1，越高越清晰；越暖越高）', digits: 2, invert: false },
    Ts: { name: '中心时间 Ts', unit: 'ms', short: 'Ts', text: '中心时间 Ts（ms，越小越清晰；越冷越清晰）', digits: 0, invert: true },
    EDT: { name: '早期衰减时间 EDT', unit: 's', short: 'EDT', text: '早期衰减时间 EDT（s，由前 10 dB 衰减外推；越暖越长）', digits: 2, invert: false },
    T30: { name: '混响时间 T30', unit: 's', short: 'T30', text: '混响时间 T30（s，由 −5 ~ −35 dB 衰减外推；越暖越长）', digits: 2, invert: false }
  };

  /* 频段选择：0..5 为倍频带，6 为中频（500 Hz + 1 kHz）均值 */
  var BAND_LABELS = ['125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '中频均值'];
  function bandIdx(sel) { var i = parseInt(sel, 10); return (i >= 0 && i <= 5) ? i : -1; }

  var EAR_Z = 1.2;          // 声源 / 接收点默认高度（人耳高度，m）
  var LEG = 148;            // 右侧色标区宽度（px）

  var cv, ctx, off, octx, W = 900, H = 440, dpr = 1;
  var viewEl;
  var st = {
    model: null, trace: null, grid: null, gm: null, range: null,
    metric: 'T30', band: -1, yaw: 35,
    cam: null, showPath: false,
    rcv: null, src: null, resp: null, rcvVal: null
  };
  var inited = false;

  function fit() {
    if (!cv) return;
    var wrap = cv.parentNode;
    var w = Math.max(320, Math.round(wrap.clientWidth || 900));
    H = Number(cv.getAttribute('height')) || 440;
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!off) { off = document.createElement('canvas'); }
    off.width = cv.width; off.height = cv.height;
    octx = off.getContext('2d'); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w;
  }

  /* 左侧模型区视口（右侧留出色标栏） */
  function viewRect() {
    return { x: 10, y: 22, w: Math.max(160, W - LEG - 20), h: Math.max(120, H - 34) };
  }

  function setupView() {
    if (!st.model) return;
    st.cam = S.isoFit({
      w: st.model.bounds.w, d: st.model.bounds.d, h: st.model.height,
      yaw: st.yaw * Math.PI / 180, elev: 0.44, view: viewRect(), margin: 26
    });
  }
  function P3(x, y, z) { return S.isoProject(x, y, z, st.cam); }

  function readForm() {
    var L = clamp($('simLen').value, 0.5, 200), Wd = clamp($('simWid').value, 0.5, 200);
    var h = clamp($('simHgt').value, 1.5, 30), a = clamp($('simAlpha').value, 0.005, 0.98);
    var sc = clamp($('simScatter').value, 0, 1);
    var innerWalls = [];
    if ($('simInner') && $('simInner').checked) {
      var ix = clamp($('simInnerX').value, 0, L);
      innerWalls.push({
        x1: ix, y1: clamp($('simInnerY1').value, 0, Wd),
        x2: ix, y2: clamp($('simInnerY2').value, 0, Wd), alpha: a
      });
    }
    return { L: L, Wd: Wd, h: h, a: a, sc: sc, innerWalls: innerWalls };
  }

  function refreshRange() {
    st.range = st.gm ? S.metricRange(st.gm, st.metric, { band: st.band }) : null;
    st.rcvVal = (st.gm && st.rcv) ? S.metricAtCell(st.gm, st.model, st.rcv, st.metric, st.band) : null;
  }

  function run() {
    var f = readForm();
    var model = S.buildRoom({ width: f.L, depth: f.Wd, height: f.h, alpha: f.a, innerWalls: f.innerWalls });
    if (!model.ok) { if ($('simLegend')) $('simLegend').textContent = model.error; return; }
    st.model = model;
    var src = {
      x: clamp($('simSrcX').value, 0, f.L), y: clamp($('simSrcY').value, 0, f.Wd),
      z: clamp($('simSrcZ').value, 0.1, f.h)
    };
    var rcv = {
      x: clamp($('simRcvX').value, 0, f.L), y: clamp($('simRcvY').value, 0, f.Wd),
      z: clamp($('simRcvZ').value, 0.1, f.h)
    };
    st.rcv = rcv; st.src = src;

    var nRays = Math.round(clamp($('simRays').value, 48, 6000));
    var tv = S.traceBox(model, { source: src, nRays: nRays, scatter: f.sc });
    st.trace = tv;
    var gxs = Math.round(clamp($('simGrid').value, 12, 120));
    var gys = Math.max(6, Math.round(gxs * f.Wd / f.L));
    st.grid = S.sampleGrid(model, tv.rays, { gx: gxs, gy: gys });
    st.gm = S.gridMetrics(st.grid);
    st.resp = S.receiverBands(tv.rays, rcv, { radius: 0.8, model: model });

    st.metric = $('simMetric').value;
    var bsel = $('simBand');
    st.band = bsel ? bandIdx(bsel.value) : -1;
    if ($('simYaw')) st.yaw = clamp($('simYaw').value, 0, 360);
    refreshRange();
    fit(); setupView(); repaintStatic(); render(); updateMets(); drawEcho(); updateLegend();
  }

  /* ---------- 静态层：三维模型 + 声场彩图 + 右侧色标 ---------- */
  function poly(pts, fill, stroke, lw, alpha) {
    octx.beginPath();
    octx.moveTo(pts[0].u, pts[0].v);
    for (var i = 1; i < pts.length; i++) octx.lineTo(pts[i].u, pts[i].v);
    octx.closePath();
    if (fill) { octx.globalAlpha = alpha == null ? 1 : alpha; octx.fillStyle = fill; octx.fill(); }
    if (stroke) { octx.globalAlpha = 1; octx.strokeStyle = stroke; octx.lineWidth = lw || 1; octx.stroke(); }
    octx.globalAlpha = 1;
  }
  function line3(a, b, stroke, lw, alpha) {
    octx.globalAlpha = alpha == null ? 1 : alpha;
    octx.beginPath(); octx.moveTo(a.u, a.v); octx.lineTo(b.u, b.v);
    octx.strokeStyle = stroke; octx.lineWidth = lw || 1; octx.stroke();
    octx.globalAlpha = 1;
  }

  function repaintStatic() {
    if (!octx || !st.model || !st.cam) return;
    var model = st.model, bw = model.bounds.w, bd = model.bounds.d, h = model.height;
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = css('--card-soft', '#f6f8fc');
    octx.fillRect(0, 0, W, H);

    var edge = css('--text-soft', '#2b3a4d');
    var thin = css('--border', '#d3dae6');
    var muted = css('--muted', '#4d5b6e');

    // 图头（导出 PNG 时带出关键信息）
    octx.textAlign = 'left';
    octx.fillStyle = muted;
    octx.font = '11px system-ui, sans-serif';
    octx.fillText(bw.toFixed(1) + ' × ' + bd.toFixed(1) + ' × ' + h.toFixed(1) + ' m　α=' +
      model.meanAlpha.toFixed(2) + '　' + BAND_LABELS[st.band < 0 ? 6 : st.band] +
      '　' + (METRIC_INFO[st.metric] || METRIC_INFO.L).name, 12, 15);

    // 地面底板
    poly([P3(0, 0, 0), P3(bw, 0, 0), P3(bw, bd, 0), P3(0, bd, 0)], css('--card', '#ffffff'), null);

    // 地面声场彩图（逐格四边形；u、v 对 x、y 线性，用增量避免逐点三角函数）
    if (st.gm && st.range) {
      var gm = st.gm, rng = st.range;
      var thresh = (S.bandValue(gm.maxE, st.band) || 0) * 0.01;
      var cw = gm.cw, ch = gm.ch;
      var root = P3(0, 0, 0);
      var ax = { u: P3(cw, 0, 0).u - root.u, v: P3(cw, 0, 0).v - root.v };
      var ay = { u: P3(0, ch, 0).u - root.u, v: P3(0, ch, 0).v - root.v };
      var invert = !!(METRIC_INFO[st.metric] || METRIC_INFO.L).invert;
      octx.globalAlpha = 0.9;
      for (var iy = 0; iy < gm.gy; iy++) {
        for (var ix = 0; ix < gm.gx; ix++) {
          var m = gm.metrics[iy * gm.gx + ix];
          if (!m || !m[st.metric]) continue;
          var ev = S.bandValue(m.E, st.band);
          var val = S.bandValue(m[st.metric], st.band);
          if (!(ev >= thresh) || val == null || !isFinite(val)) continue;
          var frac = (rng[1] - rng[0]) > 0
            ? (invert ? (rng[1] - val) / (rng[1] - rng[0]) : (val - rng[0]) / (rng[1] - rng[0]))
            : 0.5;
          var u0 = root.u + ax.u * ix + ay.u * iy, v0 = root.v + ax.v * ix + ay.v * iy;
          octx.beginPath();
          octx.moveTo(u0, v0);
          octx.lineTo(u0 + ax.u, v0 + ax.v);
          octx.lineTo(u0 + ax.u + ay.u, v0 + ax.v + ay.v);
          octx.lineTo(u0 + ay.u, v0 + ay.v);
          octx.closePath();
          octx.fillStyle = ramp(frac);
          octx.fill();
        }
      }
      octx.globalAlpha = 1;

      // 地面网格线（叠在彩图之上，便于读尺寸）
      var sx = Math.max(0.5, bw / Math.round(bw));
      var sy = Math.max(0.5, bd / Math.round(bd));
      for (var gx = 0; gx <= bw + 1e-6; gx += sx) line3(P3(gx, 0, 0), P3(gx, bd, 0), thin, 1, 0.5);
      for (var gy = 0; gy <= bd + 1e-6; gy += sy) line3(P3(0, gy, 0), P3(bw, gy, 0), thin, 1, 0.5);
    }

    // 内隔墙：竖向平面 + 条纹
    model.innerWalls.forEach(function (s) {
      var b0 = P3(s.x1, s.y1, 0), b1 = P3(s.x2, s.y2, 0);
      var t1 = P3(s.x2, s.y2, h), t0 = P3(s.x1, s.y1, h);
      poly([b0, b1, t1, t0], css('--text-soft', '#2b3a4d'), edge, 1.6, 0.22);
      var N = 16;
      for (var i = 1; i < N; i++) {
        var fr = i / N;
        line3(
          { u: b0.u + (b1.u - b0.u) * fr, v: b0.v + (b1.v - b0.v) * fr },
          { u: t0.u + (t1.u - t0.u) * fr, v: t0.v + (t1.v - t0.v) * fr },
          edge, 1, 0.35
        );
      }
      line3(b0, t0, edge, 2.2, 0.9); line3(b1, t1, edge, 2.2, 0.9);
      line3(t0, t1, edge, 2.2, 0.9);
    });

    // 天花网格 + 竖向格栅（线框笼架）
    var divX = Math.max(4, Math.min(30, Math.round(bw * 1.4)));
    var divY = Math.max(4, Math.min(30, Math.round(bd * 1.4)));
    var gstepX = bw / divX, gstepY = bd / divY;
    for (var i2 = 0; i2 <= divX; i2++) line3(P3(i2 * gstepX, 0, h), P3(i2 * gstepX, bd, h), edge, 1, 0.4);
    for (var j2 = 0; j2 <= divY; j2++) line3(P3(0, j2 * gstepY, h), P3(bw, j2 * gstepY, h), edge, 1, 0.4);
    for (var p = 0; p <= divY; p++) {
      var yv = p * gstepY;
      line3(P3(0, yv, 0), P3(0, yv, h), muted, 1, 0.28);
      line3(P3(bw, yv, 0), P3(bw, yv, h), muted, 1, 0.28);
    }
    for (var q = 0; q <= divX; q++) {
      var xv = q * gstepX;
      line3(P3(xv, 0, 0), P3(xv, 0, h), muted, 1, 0.28);
      line3(P3(xv, bd, 0), P3(xv, bd, h), muted, 1, 0.28);
    }

    // 房间轮廓（12 条棱）
    var c000 = P3(0, 0, 0), c100 = P3(bw, 0, 0), c110 = P3(bw, bd, 0), c010 = P3(0, bd, 0);
    var c001 = P3(0, 0, h), c101 = P3(bw, 0, h), c111 = P3(bw, bd, h), c011 = P3(0, bd, h);
    [c001, c101, c111, c011].forEach(function (a, i) {
      line3(a, [c000, c100, c110, c010][i], edge, 2.4, 0.95);
    });
    [[c001, c101], [c101, c111], [c111, c011], [c011, c001]].forEach(function (e) {
      line3(e[0], e[1], edge, 2, 0.8);
    });
    [[c000, c100], [c100, c110], [c110, c010], [c010, c000]].forEach(function (e) {
      line3(e[0], e[1], edge, 2.4, 0.95);
    });

    // 光路（可选）
    if (st.showPath && st.trace) {
      octx.globalAlpha = 0.18;
      octx.strokeStyle = muted; octx.lineWidth = 1;
      st.trace.rays.forEach(function (ray) {
        var pts = ray.pts;
        octx.beginPath();
        var s0 = P3(pts[0].x, pts[0].y, pts[0].z);
        octx.moveTo(s0.u, s0.v);
        for (var k = 1; k < pts.length; k++) octx.lineTo(P3(pts[k].x, pts[k].y, pts[k].z).u, P3(pts[k].x, pts[k].y, pts[k].z).v);
        octx.stroke();
      });
      octx.globalAlpha = 1;
    }

    // 声源与接收点（带落地引线，指示水平位置）
    if (st.src) {
      var sp = P3(st.src.x, st.src.y, st.src.z), spf = P3(st.src.x, st.src.y, 0);
      line3(sp, spf, css('--accent', '#c2410c'), 1.4, 0.55);
      octx.fillStyle = css('--accent', '#c2410c');
      octx.beginPath(); octx.arc(sp.u, sp.v, 5.5, 0, 6.2832); octx.fill();
      octx.strokeStyle = '#fff'; octx.lineWidth = 1.4; octx.stroke();
      octx.fillStyle = muted; octx.font = '12px system-ui, sans-serif'; octx.textAlign = 'left';
      octx.fillText('声源', sp.u + 9, sp.v + 4);
    }
    if (st.rcv) {
      var rp = P3(st.rcv.x, st.rcv.y, st.rcv.z), rpf = P3(st.rcv.x, st.rcv.y, 0);
      line3(rp, rpf, css('--primary', '#1d4ed8'), 1.4, 0.55);
      octx.fillStyle = css('--primary', '#1d4ed8');
      octx.fillRect(rp.u - 4.5, rp.v - 4.5, 9, 9);
      octx.strokeStyle = '#fff'; octx.lineWidth = 1.4; octx.strokeRect(rp.u - 4.5, rp.v - 4.5, 9, 9);
      var info = METRIC_INFO[st.metric] || METRIC_INFO.L;
      var label = st.rcvVal != null
        ? '接收点 ' + info.short + ' = ' + Number(st.rcvVal).toFixed(info.digits) + (info.unit ? ' ' + info.unit : '')
        : '接收点';
      octx.fillStyle = css('--text', '#0f1a2a'); octx.font = '12px system-ui, sans-serif'; octx.textAlign = 'left';
      octx.fillText(label, rp.u + 10, rp.v - 7);
    }

    drawScaleBar();
  }

  /* 右侧：指标色标标杆（色带 + 整齐刻度 + 接收点模拟值标记） */
  function drawScaleBar() {
    if (!octx) return;
    var info = METRIC_INFO[st.metric] || METRIC_INFO.L;
    var x0 = Math.max(24, W - LEG + 16), barW = 24;
    var top = 60, bot = Math.max(top + 60, H - 30), barH = bot - top;

    octx.textAlign = 'left';
    octx.fillStyle = css('--text', '#0f1a2a');
    octx.font = 'bold 13px system-ui, sans-serif';
    octx.fillText(info.name + (info.unit ? ' (' + info.unit + ')' : ''), x0 - 8, 32);
    octx.fillStyle = css('--muted', '#4d5b6e');
    octx.font = '10px system-ui, sans-serif';
    octx.fillText('模拟分布 · ' + BAND_LABELS[st.band < 0 ? 6 : st.band] + ' · 地面切片', x0 - 8, 48);

    if (!st.range) {
      octx.fillStyle = css('--muted', '#4d5b6e');
      octx.font = '12px system-ui, sans-serif';
      octx.fillText('点击「开始模拟」', x0 + barW + 8, top + barH / 2);
      return;
    }

    var nr = S.niceRange(st.range[0], st.range[1], 5) || [st.range[0], st.range[1], 1];
    var lo = nr[0], hi = nr[1], step = nr[2];
    var n = Math.max(1, Math.min(10, Math.round((hi - lo) / step)));
    var ticks = S.scaleTicks(lo, hi, n);

    // 色带（顶 = 高值）
    for (var y = 0; y < barH; y++) {
      octx.fillStyle = ramp(1 - y / barH);
      octx.fillRect(x0, top + y, barW, 1);
    }
    octx.strokeStyle = css('--border', '#d3dae6'); octx.lineWidth = 1;
    octx.strokeRect(x0 + 0.5, top + 0.5, barW - 1, barH - 1);

    // 刻度与数值
    octx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ticks.forEach(function (t) {
      var yv = top + (1 - t.frac) * barH;
      octx.strokeStyle = css('--border', '#d3dae6');
      octx.beginPath(); octx.moveTo(x0 + barW, yv); octx.lineTo(x0 + barW + 5, yv); octx.stroke();
      var txt = (t.edge === 'hi' ? '≥ ' : (t.edge === 'lo' ? '≤ ' : '')) + Number(t.value).toFixed(info.digits);
      octx.fillStyle = css('--text', '#0f1a2a');
      octx.fillText(txt, x0 + barW + 8, yv + 4);
    });

    // 接收点模拟值在色标上的位置标记
    if (st.rcvVal != null && isFinite(st.rcvVal)) {
      var fr2 = (st.rcvVal - lo) / (hi - lo);
      if (fr2 >= -0.02 && fr2 <= 1.02) {
        var my = top + (1 - Math.min(1, Math.max(0, fr2))) * barH;
        octx.fillStyle = css('--primary', '#1d4ed8');
        octx.beginPath();
        octx.moveTo(x0 - 3, my); octx.lineTo(x0 - 11, my - 5); octx.lineTo(x0 - 11, my + 5);
        octx.closePath(); octx.fill();
      }
    }

    octx.fillStyle = css('--muted', '#4d5b6e');
    octx.font = '10px system-ui, sans-serif';
    octx.fillText('几何声学估算', x0 - 8, bot + 16);
  }

  function render() {
    if (!ctx || !cv) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (off) ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  function card(label, val) {
    return '<div style="background:var(--card-soft);border:1px solid var(--border);border-radius:8px;padding:10px 12px">' +
      '<div style="font-size:12px;color:var(--muted)">' + label + '</div>' +
      '<div style="font-size:18px;color:var(--text);margin-top:3px">' + val + '</div></div>';
  }

  function updateMets() {
    var el = $('simMets'); if (!el) return;
    var m = st.model, tr = st.trace, gm = st.gm;
    if (!m) { el.innerHTML = '<span class="hint">点击「开始模拟」查看结果</span>'; return; }
    var bi = st.band, bl = BAND_LABELS[bi < 0 ? 6 : bi];
    var sab = S.bandValue(m.bands.map(function (b) { return b.sabine; }), bi);
    var eyr = S.bandValue(m.bands.map(function (b) { return b.eyringAir; }), bi);
    var t30m = gm ? S.metricMean(gm, 'T30', { band: bi }) : null;
    var edtm = gm ? S.metricMean(gm, 'EDT', { band: bi }) : null;
    var iso = st.resp ? S.isoFromEchogram(st.resp, bi >= 0 ? bi : 3) : null;
    var iso2 = (bi < 0 && st.resp) ? S.isoFromEchogram(st.resp, 2) : null;
    function av(k) {
      if (!iso) return null;
      if (bi >= 0 || !iso2) return iso[k];
      if (iso[k] == null || iso2[k] == null) return null;
      return (iso[k] + iso2[k]) / 2;
    }
    var html = '';
    html += card('Sabine RT60（' + bl + '）', fmt(sab) + ' s');
    html += card('Eyring + 空气吸收', fmt(eyr) + ' s');
    html += card('模拟 T30 空间均值', fmt(t30m) + ' s');
    html += card('模拟 EDT 空间均值', fmt(edtm) + ' s');
    html += card('平均反射次数', fmt(tr && tr.hits, 1));
    html += card('平均自由程', fmt(m.meanFreePath) + ' m');
    if (iso) {
      html += card('接收点 EDT', fmt(av('edt')) + ' s');
      html += card('接收点 T30', fmt(av('t30')) + ' s');
      html += card('接收点 C50', fmt(av('c50'), 1) + ' dB');
      html += card('接收点 C80', fmt(av('c80'), 1) + ' dB');
      html += card('接收点 D50', fmt((av('d50') != null ? av('d50') * 100 : null), 0) + ' %');
      html += card('接收点 Ts', fmt(av('ts'), 0) + ' ms');
    }
    el.innerHTML = html;
    renderBandTable();
  }

  /* 分频带结果表：直接回答"混响时间随频率怎么变" */
  function renderBandTable() {
    var el = $('simBandTable'); if (!el || !st.model || !st.resp) { if (el) el.innerHTML = ''; return; }
    var m = st.model, gm = st.gm;
    var rows = '';
    for (var b = 0; b < S.NB; b++) {
      var iso = S.isoFromEchogram(st.resp, b);
      var t30 = gm ? S.metricMean(gm, 'T30', { band: b }) : null;
      var edt = gm ? S.metricMean(gm, 'EDT', { band: b }) : null;
      rows += '<tr' + (b === st.band ? ' style="background:var(--card-soft)"' : '') + '>' +
        '<td><strong>' + S.BANDS[b] + '</strong></td>' +
        '<td>' + fmt(m.bands[b].sabine) + '</td>' +
        '<td>' + fmt(m.bands[b].eyringAir) + '</td>' +
        '<td>' + fmt(t30) + '</td>' +
        '<td>' + fmt(edt) + '</td>' +
        '<td>' + fmt(iso.t30) + '</td>' +
        '<td>' + fmt(iso.edt) + '</td>' +
        '<td>' + fmt(iso.c50, 1) + '</td>' +
        '<td>' + fmt(iso.d50 != null ? iso.d50 * 100 : null, 0) + '</td>' +
        '<td>' + fmt(iso.ts, 0) + '</td>' +
        '</tr>';
    }
    el.innerHTML = '<div class="table-wrap"><table class="detail-table wide"><thead><tr>' +
      '<th>倍频带 (Hz)</th><th>Sabine (s)</th><th>Eyring+空气 (s)</th>' +
      '<th>模拟 T30 全场均值 (s)</th><th>模拟 EDT 全场均值 (s)</th>' +
      '<th>接收点 T30 (s)</th><th>接收点 EDT (s)</th>' +
      '<th>C50 (dB)</th><th>D50 (%)</th><th>Ts (ms)</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function drawEcho() {
    var ec = $('simEcho'); if (!ec || !st.resp || !MC) return;
    var band = st.band >= 0 ? st.band : 3;
    var bins = Array.prototype.slice.call(st.resp.bins.subarray(band * st.resp.nb, (band + 1) * st.resp.nb));
    var binMs = st.resp.binMs;
    var mx = 0;
    bins.forEach(function (v) { if (v > mx) mx = v; });
    var db = bins.map(function (v) { return (v > 0 && mx > 0) ? 10 * Math.log10(v / mx) : -80; });
    var xs = db.map(function (_, i) { return i * binMs; });
    MC.draw(ec, {
      x: xs, yMin: -70, yDigits: 0,
      xLabelFmt: function (v) { return Math.round(v) + ''; },
      series: [{ values: db, color: css('--primary', '#1d4ed8'), points: false, width: 2 }]
    });
  }

  function updateLegend() {
    var info = METRIC_INFO[st.metric] || METRIC_INFO.L;
    var r = st.range, rng = '';
    if (r) rng = '（色标区间 ' + Number(r[0]).toFixed(info.digits) + ' ~ ' + Number(r[1]).toFixed(info.digits) +
      (info.unit ? ' ' + info.unit : '') + '）';
    var el = $('simLegend'); if (!el) return;
    el.textContent = info.text + rng + '　·　频段 ' + BAND_LABELS[st.band < 0 ? 6 : st.band] +
      '　·　左侧为轴测模型（可拖「视角方位」旋转），右侧色标给出该指标的模拟分布与接收点读数；几何声学估算，非验收级。';
  }

  function exportPng() {
    if (!cv) return;
    var a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'room-map-' + st.metric + '-' + (st.band < 0 ? 'mid' : S.BANDS[st.band]) + '.png';
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
    $('simPng').addEventListener('click', exportPng);
    $('simPath').addEventListener('click', function () { st.showPath = !st.showPath; repaintStatic(); render(); });
    $('simMetric').addEventListener('change', function () {
      st.metric = this.value; refreshRange(); repaintStatic(); render(); updateMets(); updateLegend(); drawEcho();
    });
    var bs = $('simBand');
    if (bs) bs.addEventListener('change', function () {
      st.band = bandIdx(this.value); refreshRange(); repaintStatic(); render(); updateMets(); updateLegend(); drawEcho();
    });
    var yaw = $('simYaw');
    if (yaw) yaw.addEventListener('input', function () {
      var v = clamp(this.value, 0, 360);
      if ($('simYawVal')) $('simYawVal').textContent = Math.round(v);
      if (!st.model) return;
      st.yaw = v; setupView(); repaintStatic(); render();
    });
    window.addEventListener('resize', function () {
      if (!st.model) return; fit(); setupView(); repaintStatic(); render();
    });
  }

  function onShow() {
    if (!st.model) return;
    fit(); setupView(); repaintStatic(); render();
  }

  window.SimView = { init: init, onShow: onShow };
})();
