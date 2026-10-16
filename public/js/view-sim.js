/*
 * view-sim.js — 室内音质模拟 视图（#/sim）
 * 版式参考 Odeon / CATT 的分布图：左侧三维房间模型（轴测 + 声场彩图 + 粒子动画），
 * 右侧为指标色标标杆（色带 + 数值刻度 + 接收点模拟值标记）。
 * 依赖 window.RoomSim（内核）、window.MiniChart（曲线）、window.Room（材料库，可选）。
 */
(function () {
  'use strict';
  var S = window.RoomSim, MC = window.MiniChart;
  function $(id) { return document.getElementById(id); }
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
    L: { name: 'L 相对声压级', unit: 'dB', short: 'L', text: '相对声压级（dB，场内最高为 0 dB；越暖越强）', digits: 1, invert: false },
    C50: { name: 'C50 清晰度', unit: 'dB', short: 'C50', text: '清晰度 C50（dB，越高语音越清晰；越暖越高）', digits: 1, invert: false },
    D50: { name: 'D50 定义度', unit: '', short: 'D50', text: '定义度 D50（0–1，越高越清晰；越暖越高）', digits: 2, invert: false },
    Ts: { name: 'Ts 中心时间', unit: 'ms', short: 'Ts', text: '中心时间 Ts（ms，越小越清晰；越冷越清晰）', digits: 0, invert: true }
  };

  var EAR_Z = 0.9;          // 声线/接收点所在高度（人耳高度，m）
  var LEG = 138;            // 右侧色标区宽度（px）

  var cv, ctx, off, octx, W = 900, H = 420, dpr = 1;
  var viewEl;
  var st = {
    model: null, trace: null, gm: null, range: null, metric: 'L', yaw: 35,
    cam: null, t: 0, running: true, showPath: false, maxT: 1, last: 0,
    rcv: null, src: null, resp: null, iso: null, rcvVal: null
  };
  var inited = false;

  function fit() {
    if (!cv) return;
    var wrap = cv.parentNode;
    var w = Math.max(320, Math.round(wrap.clientWidth || 900));
    H = Number(cv.getAttribute('height')) || 420;
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
    return { x: 10, y: 10, w: Math.max(160, W - LEG - 20), h: Math.max(120, H - 20) };
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
    var innerWalls = [];
    if ($('simInner') && $('simInner').checked) {
      var ix = clamp($('simInnerX').value, 0, L);
      innerWalls.push({ x1: ix, y1: clamp($('simInnerY1').value, 0, Wd), x2: ix, y2: clamp($('simInnerY2').value, 0, Wd), alpha: a });
    }
    return { L: L, Wd: Wd, h: h, a: a, innerWalls: innerWalls };
  }

  function refreshRange() {
    st.range = st.gm ? S.metricRange(st.gm, st.metric, { minE: st.gm.maxE * 0.01 }) : null;
    st.rcvVal = (st.gm && st.rcv) ? S.metricAtCell(st.gm, st.model, st.rcv, st.metric) : null;
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

    // 地面底板
    poly([P3(0, 0, 0), P3(bw, 0, 0), P3(bw, bd, 0), P3(0, bd, 0)], css('--card', '#ffffff'), null);

    // 地面声场彩图（逐格四边形；u、v 对 x、y 线性，用增量避免逐点三角函数）
    if (st.gm && st.range) {
      var gm = st.gm, rng = st.range, thresh = gm.maxE * 0.01;
      var cw = gm.cw, ch = gm.ch;
      var root = P3(0, 0, 0);
      var ax = { u: P3(cw, 0, 0).u - root.u, v: P3(cw, 0, 0).v - root.v };
      var ay = { u: P3(0, ch, 0).u - root.u, v: P3(0, ch, 0).v - root.v };
      var invert = !!METRIC_INFO[st.metric].invert;
      octx.globalAlpha = 0.9;
      for (var iy = 0; iy < gm.gy; iy++) {
        for (var ix = 0; ix < gm.gx; ix++) {
          var m = gm.metrics[iy * gm.gx + ix];
          if (!m || m.E < thresh || m[st.metric] == null) continue;
          var val = m[st.metric];
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

    // 内隔墙：竖向平面 + 条纹（对应 Odeon 中的分段墙面观感）
    model.innerWalls.forEach(function (s) {
      var b0 = P3(s.x1, s.y1, 0), b1 = P3(s.x2, s.y2, 0);
      var t1 = P3(s.x2, s.y2, h), t0 = P3(s.x1, s.y1, h);
      poly([b0, b1, t1, t0], css('--text-soft', '#2b3a4d'), edge, 1.6, 0.22);
      var N = 16;
      for (var i = 1; i < N; i++) {
        var f = i / N;
        line3(
          { u: b0.u + (b1.u - b0.u) * f, v: b0.v + (b1.v - b0.v) * f },
          { u: t0.u + (t1.u - t0.u) * f, v: t0.v + (t1.v - t0.v) * f },
          edge, 1, 0.35
        );
      }
      line3(b0, t0, edge, 2.2, 0.9); line3(b1, t1, edge, 2.2, 0.9);
      line3(t0, t1, edge, 2.2, 0.9);
    });

    // 天花网格 + 竖向格栅（形成 Odeon 式的线框笼架）
    var divX = Math.max(4, Math.min(30, Math.round(bw * 1.4)));
    var divY = Math.max(4, Math.min(30, Math.round(bd * 1.4)));
    var gstepX = bw / divX, gstepY = bd / divY;
    for (var i = 0; i <= divX; i++) line3(P3(i * gstepX, 0, h), P3(i * gstepX, bd, h), edge, 1, 0.4);
    for (var j = 0; j <= divY; j++) line3(P3(0, j * gstepY, h), P3(bw, j * gstepY, h), edge, 1, 0.4);
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
      octx.globalAlpha = 0.2;
      octx.strokeStyle = muted; octx.lineWidth = 1;
      st.trace.rays.forEach(function (ray) {
        var pts = ray.pts;
        octx.beginPath();
        var s0 = P3(pts[0].x, pts[0].y, EAR_Z);
        octx.moveTo(s0.u, s0.v);
        for (var k = 1; k < pts.length; k++) {
          var s1 = P3(pts[k].x, pts[k].y, EAR_Z);
          octx.lineTo(s1.u, s1.v);
        }
        octx.stroke();
      });
      octx.globalAlpha = 1;
    }

    // 声源与接收点（带落地引线，指示水平位置）
    if (st.src) {
      var sp = P3(st.src.x, st.src.y, EAR_Z), spf = P3(st.src.x, st.src.y, 0);
      line3(sp, spf, css('--accent', '#c2410c'), 1.4, 0.55);
      octx.fillStyle = css('--accent', '#c2410c');
      octx.beginPath(); octx.arc(sp.u, sp.v, 5.5, 0, 6.2832); octx.fill();
      octx.strokeStyle = '#fff'; octx.lineWidth = 1.4; octx.stroke();
      octx.fillStyle = muted; octx.font = '12px system-ui, sans-serif'; octx.textAlign = 'left';
      octx.fillText('声源', sp.u + 9, sp.v + 4);
    }
    if (st.rcv) {
      var rp = P3(st.rcv.x, st.rcv.y, EAR_Z), rpf = P3(st.rcv.x, st.rcv.y, 0);
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
    var x0 = Math.max(24, W - LEG + 10), barW = 24;
    var top = 52, bot = Math.max(top + 60, H - 26), barH = bot - top;

    octx.textAlign = 'left';
    octx.fillStyle = css('--text', '#0f1a2a');
    octx.font = 'bold 13px system-ui, sans-serif';
    octx.fillText(info.name + (info.unit ? ' (' + info.unit + ')' : ''), x0 - 6, 24);
    octx.fillStyle = css('--muted', '#4d5b6e');
    octx.font = '10px system-ui, sans-serif';
    octx.fillText('模拟分布 · 平面切片', x0 - 6, 40);

    if (!st.range) {
      octx.fillStyle = css('--muted', '#4d5b6e');
      octx.font = '12px system-ui, sans-serif';
      octx.fillText('—', x0 + barW + 8, top + barH / 2);
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
      var y = top + (1 - t.frac) * barH;
      octx.strokeStyle = css('--border', '#d3dae6');
      octx.beginPath(); octx.moveTo(x0 + barW, y); octx.lineTo(x0 + barW + 5, y); octx.stroke();
      var txt = (t.edge === 'hi' ? '≥ ' : (t.edge === 'lo' ? '≤ ' : '')) +
        Number(t.value).toFixed(info.digits);
      octx.fillStyle = css('--text', '#0f1a2a');
      octx.fillText(txt, x0 + barW + 8, y + 4);
    });

    // 接收点模拟值在色标上的位置标记
    if (st.rcvVal != null && isFinite(st.rcvVal)) {
      var f = (st.rcvVal - lo) / (hi - lo);
      if (f >= -0.02 && f <= 1.02) {
        var my = top + (1 - Math.min(1, Math.max(0, f))) * barH;
        octx.fillStyle = css('--primary', '#1d4ed8');
        octx.beginPath();
        octx.moveTo(x0 - 3, my); octx.lineTo(x0 - 11, my - 5); octx.lineTo(x0 - 11, my + 5);
        octx.closePath(); octx.fill();
      }
    }

    octx.fillStyle = css('--muted', '#4d5b6e');
    octx.font = '10px system-ui, sans-serif';
    octx.fillText('几何声学估算', x0 - 6, bot + 15);
  }

  /* ---------- 动态层：粒子沿声线往复传播、逐次被吸收 ---------- */
  function posAt(ray, dist) {
    var p = ray && ray.pts;
    if (!p || p.length < 2) return null;
    if (dist < 0 || dist > ray.length) return null;
    var lo = 0, hi = p.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (p[mid].t <= dist) lo = mid; else hi = mid; }
    if (lo > p.length - 2) lo = p.length - 2;
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
      var p = P3(pos.x, pos.y, EAR_Z);
      var r = 1.4 + 2.2 * Math.min(1, pos.e), al = 0.28 + 0.72 * Math.min(1, pos.e * 1.4);
      ctx.globalAlpha = al;
      ctx.beginPath(); ctx.arc(p.u, p.v, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = stroke; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (st.src) {
      var sp = P3(st.src.x, st.src.y, EAR_Z);
      ctx.fillStyle = css('--accent', '#c2410c');
      ctx.beginPath(); ctx.arc(sp.u, sp.v, 5.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (st.rcv) {
      var rp = P3(st.rcv.x, st.rcv.y, EAR_Z);
      ctx.fillStyle = css('--primary', '#1d4ed8');
      ctx.fillRect(rp.u - 4.5, rp.v - 4.5, 9, 9);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.strokeRect(rp.u - 4.5, rp.v - 4.5, 9, 9);
    }
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
    var rng = r ? ('（色标区间 ' + Number(r[0]).toFixed(info.digits) + ' ~ ' + Number(r[1]).toFixed(info.digits) +
      (info.unit ? ' ' + info.unit : '') + '）') : '';
    $('simLegend').textContent = info.text + rng +
      '　·　左侧为轴测模型（可拖「视角方位」旋转），右侧色标给出该指标的模拟分布与接收点读数；几何声学估算，非验收级。';
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
      refreshRange();
      repaintStatic(); render(); updateLegend();
    });
    var yaw = $('simYaw');
    if (yaw) yaw.addEventListener('input', function () {
      var v = clamp(this.value, 0, 360);
      if ($('simYawVal')) $('simYawVal').textContent = Math.round(v);
      if (!st.model) return;
      st.yaw = v;
      setupView(); repaintStatic(); render();
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
