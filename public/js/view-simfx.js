/*
 * view-simfx.js — 声场粒子动画 视图（#/simfx）
 * 声学可视化：把光线追踪得到的声线当作声粒子，让它们从声源出发、在房间内往复反射
 * 并逐次被界面吸收（亮度/半径随剩余能量衰减），可切换 2D 平面 / 3D 轴测两种表现，
 * 并可导出为 GIF 或 MP4/WebM 视频。
 * 依赖 window.RoomSim（内核）、window.GifEnc（GIF 编码）、window.Room（材料库，可选）。
 */
(function () {
  'use strict';
  var S = window.RoomSim, MC = window.MiniChart;
  function $(id) { return document.getElementById(id); }
  function css(name, fb) { return (MC && MC.cssVar) ? MC.cssVar(name, fb) : fb; }
  function clamp(v, a, b) { v = Number(v); return isNaN(v) ? a : (v < a ? a : (v > b ? b : v)); }

  var cv, ctx, W = 900, H = 420, dpr = 1;
  var viewEl;
  var st = {
    model: null, trace: null, rays: null, mode: '3d', yaw: 35, cam: null, plan: null,
    t: 0, maxT: 1, running: false, speed: 90, trail: 6, last: 0,
    showPath: false, src: null, rcv: null, capturing: null
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
    W = w;
  }

  function setupView() {
    if (!st.model) return;
    var m = st.model;
    st.cam = S.isoFit({
      w: m.bounds.w, d: m.bounds.d, h: m.height,
      yaw: st.yaw * Math.PI / 180, elev: 0.44,
      view: { x: 10, y: 20, w: Math.max(160, W - 20), h: Math.max(120, H - 30) }, margin: 26
    });
    // 2D 平面视图：等比铺满，保留 1 m 网格可读
    var pad = 26;
    var sc = Math.min((W - 2 * pad) / m.bounds.w, (H - 2 * pad) / m.bounds.d);
    st.plan = { s: sc, ox: (W - m.bounds.w * sc) / 2, oy: (H - m.bounds.d * sc) / 2 };
  }
  function P3(x, y, z) { return S.isoProject(x, y, z, st.cam); }
  function P2(x, y) { return { u: st.plan.ox + x * st.plan.s, v: st.plan.oy + y * st.plan.s }; }

  function readForm() {
    var L = clamp($('sfxLen').value, 0.5, 200), Wd = clamp($('sfxWid').value, 0.5, 200);
    var h = clamp($('sfxHgt').value, 1.5, 30), a = clamp($('sfxAlpha').value, 0.005, 0.98);
    var sc = clamp($('sfxScatter').value, 0, 1);
    var innerWalls = [];
    if ($('sfxInner') && $('sfxInner').checked) {
      var ix = clamp($('sfxInnerX').value, 0, L);
      innerWalls.push({
        x1: ix, y1: clamp($('sfxInnerY1').value, 0, Wd),
        x2: ix, y2: clamp($('sfxInnerY2').value, 0, Wd), alpha: a
      });
    }
    return { L: L, Wd: Wd, h: h, a: a, sc: sc, innerWalls: innerWalls };
  }

  /* 沿声线取距声源 dist 处的粒子位置与剩余能量（中频 500 Hz + 1 kHz） */
  function posAt(ray, dist) {
    var p = ray && ray.pts;
    if (!p || p.length < 2 || dist < 0 || dist > ray.length) return null;
    var lo = 0, hi = p.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (p[mid].t <= dist) lo = mid; else hi = mid; }
    if (lo > p.length - 2) lo = p.length - 2;
    var A = p[lo], B = p[lo + 1], seg = (B.t - A.t) || 1, fr = (dist - A.t) / seg;
    return {
      x: A.x + (B.x - A.x) * fr, y: A.y + (B.y - A.y) * fr, z: A.z + (B.z - A.z) * fr,
      e: (A.cb[2] + A.cb[3]) / 2
    };
  }

  function run() {
    var f = readForm();
    var model = S.buildRoom({ width: f.L, depth: f.Wd, height: f.h, alpha: f.a, innerWalls: f.innerWalls });
    if (!model.ok) { setStatus(model.error); return; }
    st.model = model;
    st.src = { x: clamp($('sfxSrcX').value, 0, f.L), y: clamp($('sfxSrcY').value, 0, f.Wd), z: clamp($('sfxSrcZ').value, 0.1, f.h) };
    st.rcv = { x: clamp($('sfxRcvX').value, 0, f.L), y: clamp($('sfxRcvY').value, 0, f.Wd), z: clamp($('sfxRcvZ').value, 0.1, f.h) };
    var nRays = Math.round(clamp($('sfxRays').value, 24, 4000));
    var tv = S.traceBox(model, { source: st.src, nRays: nRays, scatter: f.sc });
    st.trace = tv;
    /* 供动画用的声线子集（粒子数 ≤ 声线数） */
    var nP = Math.round(clamp($('sfxParticles').value, 24, 1200));
    st.rays = tv.rays.filter(function (_, i) { return i % Math.max(1, Math.round(tv.rays.length / Math.min(nP, tv.rays.length))) === 0; }).slice(0, nP);
    st.maxT = Math.max(1, tv.maxLength * 0.98);
    st.t = 0; st.running = true;
    st.mode = $('sfxMode').value;
    st.trail = clamp($('sfxTrail').value, 0, 40);
    st.speed = clamp($('sfxSpeed').value, 5, 600);
    if ($('sfxYaw')) st.yaw = clamp($('sfxYaw').value, 0, 360);
    if ($('sfxPlay')) $('sfxPlay').textContent = '暂停';
    fit(); setupView();
    setStatus('声线 ' + tv.rays.length + ' 条 · 粒子 ' + st.rays.length + ' 个 · 平均反射 ' +
      tv.hits.toFixed(1) + ' 次 · 最长声程 ' + tv.maxLength.toFixed(0) + ' m');
  }

  function setStatus(txt) { var el = $('sfxStatus'); if (el) el.textContent = txt; }

  /* ---------- 场景绘制（静态骨架） ---------- */
  function drawFrame(t) {
    if (!ctx || !st.model) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = css('--card-soft', '#f6f8fc');
    ctx.fillRect(0, 0, W, H);
    var edge = css('--text-soft', '#2b3a4d');
    var thin = css('--border', '#d3dae6');
    var muted = css('--muted', '#4d5b6e');
    var m = st.model, bw = m.bounds.w, bd = m.bounds.d, h = m.height;

    function path3(pts, stroke, lw, alpha, close) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.beginPath();
      ctx.moveTo(pts[0].u, pts[0].v);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].u, pts[i].v);
      if (close) ctx.closePath();
      ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function seg3(a, b, stroke, lw, alpha) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.beginPath(); ctx.moveTo(a.u, a.v); ctx.lineTo(b.u, b.v);
      ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function seg2(a, b, stroke, lw, alpha) { seg3(a, b, stroke, lw, alpha); }

    if (st.mode === '2d') {
      // 房间平面
      var c00 = P2(0, 0), c10 = P2(bw, 0), c11 = P2(bw, bd), c01 = P2(0, bd);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(c00.u, c00.v); ctx.lineTo(c10.u, c10.v); ctx.lineTo(c11.u, c11.v); ctx.lineTo(c01.u, c01.v);
      ctx.closePath(); ctx.fillStyle = css('--card', '#ffffff'); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
      var sx = Math.max(0.5, bw / Math.round(bw)), sy = Math.max(0.5, bd / Math.round(bd));
      for (var gx = 0; gx <= bw + 1e-6; gx += sx) seg2(P2(gx, 0), P2(gx, bd), thin, 1, 0.45);
      for (var gy = 0; gy <= bd + 1e-6; gy += sy) seg2(P2(0, gy), P2(bw, gy), thin, 1, 0.45);
      m.innerWalls.forEach(function (s) {
        seg2(P2(s.x1, s.y1), P2(s.x2, s.y2), css('--text-soft', '#2b3a4d'), 3.4, 0.85);
      });
    } else {
      // 三维线框
      var p000 = P3(0, 0, 0), p100 = P3(bw, 0, 0), p110 = P3(bw, bd, 0), p010 = P3(0, bd, 0);
      var p001 = P3(0, 0, h), p101 = P3(bw, 0, h), p111 = P3(bw, bd, h), p011 = P3(0, bd, h);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(p000.u, p000.v); ctx.lineTo(p100.u, p100.v); ctx.lineTo(p110.u, p110.v); ctx.lineTo(p010.u, p010.v);
      ctx.closePath(); ctx.fillStyle = css('--card', '#ffffff'); ctx.fill();
      var divX = Math.max(4, Math.min(24, Math.round(bw * 1.2))), divY = Math.max(4, Math.min(24, Math.round(bd * 1.2)));
      for (var i1 = 0; i1 <= divX; i1++) seg3(P3(i1 * bw / divX, 0, 0), P3(i1 * bw / divX, bd, 0), thin, 1, 0.5);
      for (var j1 = 0; j1 <= divY; j1++) seg3(P3(0, j1 * bd / divY, 0), P3(bw, j1 * bd / divY, 0), thin, 1, 0.5);
      for (var i2 = 0; i2 <= divX; i2++) seg3(P3(i2 * bw / divX, 0, h), P3(i2 * bw / divX, bd, h), edge, 1, 0.35);
      for (var j2 = 0; j2 <= divY; j2++) seg3(P3(0, j2 * bd / divY, h), P3(bw, j2 * bd / divY, h), edge, 1, 0.35);
      for (var p2 = 0; p2 <= divY; p2++) {
        seg3(P3(0, p2 * bd / divY, 0), P3(0, p2 * bd / divY, h), muted, 1, 0.25);
        seg3(P3(bw, p2 * bd / divY, 0), P3(bw, p2 * bd / divY, h), muted, 1, 0.25);
      }
      for (var q2 = 0; q2 <= divX; q2++) {
        seg3(P3(q2 * bw / divX, 0, 0), P3(q2 * bw / divX, 0, h), muted, 1, 0.25);
        seg3(P3(q2 * bw / divX, bd, 0), P3(q2 * bw / divX, bd, h), muted, 1, 0.25);
      }
      m.innerWalls.forEach(function (s) {
        var b0 = P3(s.x1, s.y1, 0), b1 = P3(s.x2, s.y2, 0), t1 = P3(s.x2, s.y2, h), t0 = P3(s.x1, s.y1, h);
        path3([b0, b1, t1, t0], css('--text-soft', '#2b3a4d'), 1.6, 0.2, true);
        path3([b0, b1, t1, t0], edge, 1.6, 0.55, true);
        seg3(b0, t0, edge, 2.2, 0.9); seg3(b1, t1, edge, 2.2, 0.9); seg3(t0, t1, edge, 2.2, 0.9);
      });
      [[p001, p101], [p101, p111], [p111, p011], [p011, p001]].forEach(function (e) { seg3(e[0], e[1], edge, 2, 0.8); });
      [[p000, p100], [p100, p110], [p110, p010], [p010, p000]].forEach(function (e) { seg3(e[0], e[1], edge, 2.4, 0.95); });
      [p001, p101, p111, p011].forEach(function (a, i) { seg3(a, [p000, p100, p110, p010][i], edge, 2.2, 0.9); });
    }

    // 可选：完整光路
    if (st.showPath && st.trace) {
      ctx.globalAlpha = 0.12; ctx.strokeStyle = muted; ctx.lineWidth = 1;
      st.trace.rays.forEach(function (ray) {
        var pts = ray.pts;
        ctx.beginPath();
        var s0 = proj(pts[0]);
        ctx.moveTo(s0.u, s0.v);
        for (var k = 1; k < pts.length; k++) { var q = proj({ x: pts[k].x, y: pts[k].y, z: pts[k].z }); ctx.lineTo(q.u, q.v); }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // 粒子：亮度/半径 ∝ 剩余能量，拖尾为最近 trail 米声程
    var projFn = proj;
    if (st.rays) {
      var trail = st.trail;
      for (var i = 0; i < st.rays.length; i++) {
        var ray = st.rays[i], pos = posAt(ray, t);
        if (!pos) continue;
        var e = Math.min(1, Math.max(0, pos.e));
        var a = projFn(pos);
        // 拖尾
        if (trail > 0.2) {
          ctx.globalAlpha = 0.10 + 0.35 * e;
          ctx.strokeStyle = css('--primary', '#1d4ed8');
          ctx.lineWidth = 0.8 + 1.6 * e;
          ctx.beginPath();
          var started = false;
          for (var s = 1; s <= 8; s++) {
            var d = t - trail * s / 8;
            if (d < 0) break;
            var pp = posAt(ray, d);
            if (!pp) continue;
            var sp = projFn(pp);
            if (!started) { ctx.moveTo(sp.u, sp.v); started = true; } else ctx.lineTo(sp.u, sp.v);
          }
          if (started) ctx.stroke();
        }
        // 粒子本体
        var r = 1.1 + 2.6 * Math.pow(e, 0.45);
        ctx.globalAlpha = 0.20 + 0.80 * Math.pow(e, 0.35);
        ctx.beginPath(); ctx.arc(a.u, a.v, r, 0, 6.2832);
        ctx.fillStyle = css('--accent', '#c2410c'); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 声源 / 接收点
    if (st.src) {
      var sp2 = proj(st.src);
      ctx.fillStyle = css('--accent', '#c2410c');
      ctx.beginPath(); ctx.arc(sp2.u, sp2.v, 5.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = muted; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('声源', sp2.u + 9, sp2.v + 4);
    }
    if (st.rcv) {
      var rp = proj(st.rcv);
      ctx.fillStyle = css('--primary', '#1d4ed8');
      ctx.fillRect(rp.u - 4.5, rp.v - 4.5, 9, 9);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.strokeRect(rp.u - 4.5, rp.v - 4.5, 9, 9);
    }

    // 角标
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText((st.mode === '2d' ? '2D 平面' : '3D 轴测') + ' · t = ' + (t / 343 * 1000).toFixed(0) +
      ' ms · 声程 ' + t.toFixed(0) + ' m', 12, 15);
  }

  function proj(p) {
    if (st.mode === '2d') return P2(p.x, p.y);
    return P3(p.x, p.y, p.z == null ? 0 : p.z);
  }

  function loop(now) {
    if (!st.last) st.last = now;
    var dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
    var visible = viewEl && viewEl.classList.contains('active');
    if (visible && st.model && st.running && !st.capturing) {
      st.t += dt * st.speed;
      if (st.t > st.maxT) st.t = 0;
      drawFrame(st.t);
    }
    requestAnimationFrame(loop);
  }

  /* ---------- 导出：GIF ---------- */
  function grabFrame(maxW) {
    var sw = cv.width, sh = cv.height;
    var dw = Math.min(maxW || 720, sw), dh = Math.round(sh * dw / sw);
    var tmp = document.createElement('canvas');
    tmp.width = dw; tmp.height = dh;
    var tctx = tmp.getContext('2d');
    tctx.fillStyle = css('--card-soft', '#f6f8fc');
    tctx.fillRect(0, 0, dw, dh);
    tctx.drawImage(cv, 0, 0, dw, dh);
    return tctx.getImageData(0, 0, dw, dh);
  }

  function exportGif() {
    if (!st.model || !window.GifEnc) { setStatus('缺少模型或 GIF 编码器'); return; }
    var frames = clamp($('sfxGifFrames').value, 8, 120);
    var delay = Math.round(clamp($('sfxGifDelay').value, 20, 400));
    var out = [];
    st.capturing = true;
    setStatus('正在渲染 GIF 帧（0/' + frames + '）…');
    var i = 0;
    (function step() {
      if (i >= frames) {
        st.capturing = false;
        setStatus('正在编码 GIF…');
        setTimeout(function () {
          try {
            var blob = window.GifEnc.encode({
              width: out[0].width, height: out[0].height, frames: out, delayMs: delay, loop: 0
            });
            download(blob, 'room-particles-' + st.mode + '.gif');
            setStatus('GIF 已导出：' + frames + ' 帧 · ' + Math.round(blob.size / 1024) + ' KB');
          } catch (e) {
            setStatus('GIF 编码失败：' + e.message);
          }
        }, 20);
        return;
      }
      drawFrame(st.maxT * i / frames);
      out.push(grabFrame(720));
      i++;
      setStatus('正在渲染 GIF 帧（' + i + '/' + frames + '）…');
      setTimeout(step, 0);
    })();
  }

  /* ---------- 导出：MP4 / WebM（MediaRecorder） ---------- */
  function pickMime() {
    var cands = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    if (typeof MediaRecorder === 'undefined') return null;
    for (var i = 0; i < cands.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    }
    return null;
  }

  function exportVideo() {
    if (!st.model) { setStatus('请先生成声场'); return; }
    var mime = pickMime();
    if (!mime) { setStatus('当前浏览器不支持 MediaRecorder 录制，请改用导出 GIF'); return; }
    if (!cv.captureStream) { setStatus('当前浏览器不支持画布录制，请改用导出 GIF'); return; }
    var secs = clamp($('sfxVideoSecs').value, 1, 30);
    var fps = clamp($('sfxVideoFps').value, 6, 60);
    var stream = cv.captureStream(fps);
    var chunks = [];
    var rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 }); }
    catch (e) { try { rec = new MediaRecorder(stream); } catch (e2) { setStatus('录制初始化失败'); return; } }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var blob = new Blob(chunks, { type: rec.mimeType || mime });
      var ext = (blob.type.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
      download(blob, 'room-particles-' + st.mode + '.' + ext);
      st.capturing = false;
      setStatus('视频已导出：' + secs + ' s · ' + Math.round(blob.size / 1024) + ' KB' +
        (ext === 'mp4' ? '' : '（浏览器不支持 MP4，已输出 WebM）'));
    };
    st.capturing = true;
    st.t = 0;
    rec.start();
    setStatus('正在录制 ' + secs + ' 秒…');
    var t0 = Date.now();
    (function tick() {
      var el = (Date.now() - t0) / 1000;
      st.t = (el * st.speed) % st.maxT;
      drawFrame(st.t);
      if (el < secs && st.capturing) requestAnimationFrame(tick);
      else if (st.capturing) { st.capturing = false; try { rec.stop(); } catch (e) { setStatus('录制结束失败'); } }
    })();
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }

  function fillMaterials() {
    var sel = $('sfxMat'); if (!sel || !window.Room || !window.Room.MATERIALS) return;
    window.Room.MATERIALS.forEach(function (m) {
      var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      var m = window.Room.MATERIALS.filter(function (x) { return x.id === sel.value; })[0];
      if (m) $('sfxAlpha').value = Number((m.alpha[2] + m.alpha[3]) / 2).toFixed(3);
    });
  }

  function init() {
    if (inited) return; inited = true;
    cv = $('sfxCanvas'); viewEl = document.getElementById('view-simfx');
    fillMaterials();
    $('sfxRun').addEventListener('click', run);
    $('sfxPlay').addEventListener('click', function () {
      st.running = !st.running; this.textContent = st.running ? '暂停' : '播放';
    });
    $('sfxReset').addEventListener('click', function () { st.t = 0; drawFrame(0); });
    $('sfxPath').addEventListener('click', function () { st.showPath = !st.showPath; drawFrame(st.t); });
    $('sfxGif').addEventListener('click', exportGif);
    $('sfxVideo').addEventListener('click', exportVideo);
    $('sfxMode').addEventListener('change', function () {
      st.mode = this.value;
      var yawRow = $('sfxYawRow'); if (yawRow) yawRow.style.display = (st.mode === '3d') ? '' : 'none';
      fit(); setupView(); drawFrame(st.t);
    });
    $('sfxTrail').addEventListener('input', function () {
      st.trail = clamp(this.value, 0, 40);
      if ($('sfxTrailVal')) $('sfxTrailVal').textContent = Math.round(st.trail);
    });
    $('sfxSpeed').addEventListener('input', function () {
      st.speed = clamp(this.value, 5, 600);
      if ($('sfxSpeedVal')) $('sfxSpeedVal').textContent = Math.round(st.speed);
    });
    var yaw = $('sfxYaw');
    if (yaw) yaw.addEventListener('input', function () {
      var v = clamp(this.value, 0, 360);
      if ($('sfxYawVal')) $('sfxYawVal').textContent = Math.round(v);
      if (!st.model) return;
      st.yaw = v; setupView(); drawFrame(st.t);
    });
    window.addEventListener('resize', function () {
      if (!st.model) return; fit(); setupView(); drawFrame(st.t);
    });
    requestAnimationFrame(loop);
  }

  function onShow() {
    if (!st.model) return;
    fit(); setupView(); drawFrame(st.t);
  }

  window.SimFxView = { init: init, onShow: onShow };
})();
