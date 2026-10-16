/*
 * view-sim-refraction.js — 温度梯度声折射模拟器视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimRefraction（计算内核）
 * 约定：init() 自建全部 DOM（含 .page-head）注入 id="view-sim-refraction" 容器，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimRefraction;

  var DEFAULTS = {
    c0: 343,      // 地面声速 m/s
    g: 0.03,      // 声速梯度 (m/s)/m（默认逆温：声线折返，现象最典型）
    theta0: 30,   // 主射线仰角 deg
    fanMin: -10,  // 声线束张角下限 deg
    fanMax: 60,   // 声线束张角上限 deg
    fanCount: 9   // 声线条数 5–13
  };

  var TRACE_OPTS = { dx: 2, xMax: 24000, zMax: 7000 }; // 视图追踪选项（dx=2 兼顾精度与性能）
  var SHADOW_REF_H = 1;  // 声影区外沿参考高度 m（近似地面接收者高度）
  var WAVE_N = 4;        // 每条声线同时在途的波前数
  var WAVE_SPAN = 6;     // 波前跨完整声线的目标时长 s

  var state = Object.assign({}, DEFAULTS);
  var last = null;       // 最近一次追踪结果 { ok, rays, main, shadow, shadowEdge, bounds }
  var inited = false;
  var playing = true;    // 播放/暂停
  var rafId = null;
  var t0 = 0;            // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;
  var off = null;        // 离屏静态层（地面/射线/刻度/声影区，仅在重算或尺寸变化时重绘）
  var offDirty = true;
  var lastW = 0, lastH = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, max, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="rf_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="rf_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" max="' + max + '" step="' + step + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function validate() {
    if (!(state.c0 > 0)) return '地面声速 c₀ 必须为正数（m/s）';
    if (!(state.theta0 >= 0 && state.theta0 < 90)) return '主射线仰角 θ₀ 应在 0–90° 之间';
    if (!(state.fanMin >= -89 && state.fanMax <= 89)) return '声线束张角应在 −89–89° 之间';
    if (!(state.fanMin < state.fanMax)) return '声线束张角下限必须小于上限';
    if (!(state.fanCount >= 5 && state.fanCount <= 13)) return '声线条数应在 5–13 之间';
    return null;
  }

  function buildFan() {
    var n = Math.max(5, Math.min(13, Math.round(state.fanCount)));
    var a = state.fanMin, b = state.fanMax;
    var out = [];
    for (var i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
    return out;
  }

  // 声影区外沿：水平包络射线自地面升至参考高度处的水平距离
  function envelopeCross(res) {
    var pts = res.points;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].z >= SHADOW_REF_H) {
        var z0 = pts[i - 1].z, z1 = pts[i].z;
        var f = z1 > z0 ? (SHADOW_REF_H - z0) / (z1 - z0) : 0;
        return pts[i - 1].x + f * (pts[i].x - pts[i - 1].x);
      }
    }
    return null;
  }

  // 沿声线累计无因次"传播时间" τ = ∫ds/c(z)（秒），供波前按当地声速前进
  function prepRay(res) {
    var pts = res.points;
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z;
      var ds = Math.sqrt(dx * dx + dz * dz);
      var c = E.soundSpeed((pts[i].z + pts[i - 1].z) / 2, state.c0, state.g);
      cum.push(cum[i - 1] + (c > 0 ? ds / c : 0));
    }
    res.cum = cum;
    res.tauTotal = cum[cum.length - 1];
  }

  function recalc() {
    var err = validate();
    if (err) {
      last = null;
      renderResult({ ok: false, error: err });
      stopAnim();
      draw(); // 画布上显示错误提示
      return;
    }
    var fan = buildFan();
    var rays = [];
    for (var i = 0; i < fan.length; i++) {
      rays.push({ theta: fan[i], res: E.traceRay(fan[i], state.c0, state.g, TRACE_OPTS) });
    }
    var main = E.traceRay(state.theta0, state.c0, state.g, TRACE_OPTS); // 主射线（白线高亮）
    var shadow = state.g < 0 ? E.traceRay(0, state.c0, state.g, TRACE_OPTS) : null; // 水平包络（声影区边界）
    rays.forEach(function (r) { prepRay(r.res); });
    prepRay(main);
    if (shadow) prepRay(shadow);

    var xM = 0, zM = 0;
    function grow(pts) {
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].x > xM) xM = pts[i].x;
        if (pts[i].z > zM) zM = pts[i].z;
      }
    }
    rays.forEach(function (r) { grow(r.res.points); });
    grow(main.points);
    if (shadow) grow(shadow.points);

    last = {
      ok: true,
      rays: rays,
      main: main,
      shadow: shadow,
      shadowEdge: shadow ? envelopeCross(shadow) : null,
      bounds: { xMax: Math.max(xM, 200), zMax: Math.max(zM, 100) }
    };
    offDirty = true;
    renderResult(last);
    if (playing && !rafId) startAnim();
  }

  function renderResult(r) {
    var box = $('rfResult');
    if (!box) return;
    if (!r || !r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r && r.error ? r.error : '参数无效') + '</div>';
      return;
    }
    var zTp = E.turningHeight(state.theta0, state.c0, state.g);
    var turned = r.main && r.main.ok && r.main.turned;
    var edge = state.g < 0 && r.shadowEdge != null;
    var stats = [
      { l: '地面声速 c₀', v: num(state.c0, 0), u: 'm/s' },
      { l: '声速梯度 g', v: num(state.g, 3), u: '(m/s)/m' },
      { l: '主射线仰角 θ₀', v: num(state.theta0, 0), u: '°' },
      { l: '折返点高度 z_tp', v: zTp != null ? num(zTp, 1) : '—', u: zTp != null ? 'm' : '' },
      { l: '主射线是否折返', v: turned ? '是（弯回地面）' : '否', u: '' },
      { l: '声影区外沿距离', v: edge ? num(r.shadowEdge, 0) : '—', u: edge ? 'm' : '' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</div></div>';
    });
    html += '</div>';

    var regime;
    if (state.g > 0) regime = '当前为逆温（g>0）：声速随高度增大，声线弯向地面并在折返点返回，无地面声影区，声音传得远。';
    else if (state.g < 0) regime = '当前为正常温度递减（g<0）：声速随高度减小，声线上翘，水平包络以下为声影区；外沿距离按包络升至 ' + SHADOW_REF_H + ' m 参考高度估算（射线声学近似）。';
    else regime = '当前为等温（g=0）：声速恒定，声线直线传播，无折射。';
    html += '<p class="inline-note">' + esc(regime) + '</p>';
    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function ensureCanvas() {
    var cv = $('rfCanvas');
    if (!cv) return null;
    DPR = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var cssW = Math.max(320, Math.round(rect.width || 720));
    var cssH = 340;
    if (cssW !== lastW || cssH !== lastH || !off) {
      cv.style.height = cssH + 'px';
      cv.width = Math.round(cssW * DPR);
      cv.height = Math.round(cssH * DPR);
      off = document.createElement('canvas');
      off.width = cv.width;
      off.height = cv.height;
      lastW = cssW;
      lastH = cssH;
      offDirty = true;
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function makeMap(s) {
    var b = last.bounds;
    var padL = 64, padR = 64, padT = 20, padB = 38;
    var plotW = s.w - padL - padR, plotH = s.h - padT - padB;
    return {
      X: function (x) { return padL + (x / b.xMax) * plotW; },
      Y: function (z) { return padT + plotH - (z / b.zMax) * plotH; },
      padL: padL, padT: padT, plotW: plotW, plotH: plotH
    };
  }

  function fmtAxis(v) {
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' km';
    return String(Math.round(v));
  }

  function downsample(pts, maxPts) {
    var n = pts.length;
    if (n <= maxPts) return pts;
    var step = Math.ceil(n / maxPts);
    var out = [];
    for (var i = 0; i < n; i += step) out.push(pts[i]);
    if (out[out.length - 1] !== pts[n - 1]) out.push(pts[n - 1]);
    return out;
  }

  function strokePolyline(ctx, pts, m) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var px = m.X(pts[i].x), py = m.Y(Math.max(pts[i].z, 0));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function zAtX(pts, x) {
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].x >= x) {
        var x0 = pts[i - 1].x, x1 = pts[i].x;
        var f = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
        return pts[i - 1].z + f * (pts[i].z - pts[i - 1].z);
      }
    }
    return pts.length ? pts[pts.length - 1].z : null;
  }

  function speedColor(c, cMin, cMax) {
    var t = cMax > cMin ? (c - cMin) / (cMax - cMin) : 0.5;
    t = Math.min(1, Math.max(0, t));
    var r = Math.round(86 + (245 - 86) * t);
    var g = Math.round(180 + (185 - 180) * t);
    var b = Math.round(248 + (66 - 248) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 静态层：背景、刻度、地面、声影区、声线束、主射线、声源、c(z) 剖面
  function renderStatic(s) {
    if (!off || !last || !last.ok) return;
    var ctx = off.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    var m = makeMap(s);
    var b = last.bounds;
    var yGround = m.Y(0);
    if (m.plotW < 80 || m.plotH < 60) return;

    //  faint 网格与坐标刻度
    ctx.font = '10px sans-serif';
    [[0, '0'], [b.zMax / 2, fmtAxis(b.zMax / 2)], [b.zMax, fmtAxis(b.zMax)]].forEach(function (tk) {
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.padL, m.Y(tk[0]));
      ctx.lineTo(m.padL + m.plotW, m.Y(tk[0]));
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(tk[1], 6, m.Y(tk[0]) + 3);
    });
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('z (m)', 6, m.padT - 6);
    [[0, '0', 'start'], [b.xMax / 2, fmtAxis(b.xMax / 2), 'center'], [b.xMax, fmtAxis(b.xMax), 'end']].forEach(function (tk) {
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.X(tk[0]), m.padT);
      ctx.lineTo(m.X(tk[0]), m.padT + m.plotH);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = tk[2];
      ctx.fillText(tk[1], m.X(tk[0]), m.padT + m.plotH + 16);
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('x (m)', m.padL + m.plotW - 30, m.padT + m.plotH + 30);

    // 地面（线下深色填充 + 斜纹纹理）
    var depth = H - yGround;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(m.padL, yGround, m.plotW, depth);
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.padL, yGround, m.plotW, depth);
    ctx.clip();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var hx = m.padL - depth; hx < m.padL + m.plotW; hx += 10) {
      ctx.moveTo(hx, H);
      ctx.lineTo(hx + depth, yGround);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.padL, yGround);
    ctx.lineTo(m.padL + m.plotW, yGround);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('地面 z = 0', m.padL + 4, yGround - 5);

    // 声影区（g<0）：水平包络射线以下的半透明阴影
    if (last.shadow) {
      var spts = downsample(last.shadow.points, 400);
      var lastP = spts[spts.length - 1];
      var topExit = lastP.z > TRACE_OPTS.zMax;
      ctx.beginPath();
      ctx.moveTo(m.X(0), yGround);
      for (var i = 0; i < spts.length; i++) ctx.lineTo(m.X(spts[i].x), m.Y(Math.max(spts[i].z, 0)));
      if (topExit) {
        ctx.lineTo(m.X(lastP.x), m.padT);
        ctx.lineTo(m.padL + m.plotW, m.padT);
      } else {
        ctx.lineTo(m.padL + m.plotW, m.Y(Math.max(lastP.z, 0)));
      }
      ctx.lineTo(m.padL + m.plotW, yGround);
      ctx.closePath();
      ctx.fillStyle = 'rgba(248,113,113,0.10)';
      ctx.fill();
      // 包络虚线
      ctx.strokeStyle = 'rgba(252,165,165,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      strokePolyline(ctx, spts, m);
      ctx.setLineDash([]);
      // 区域标注
      var lx = b.xMax * 0.55;
      var ze = zAtX(last.shadow.points, lx);
      if (ze != null && m.Y(ze) < yGround - 30) {
        ctx.fillStyle = 'rgba(252,165,165,0.85)';
        ctx.font = '12px sans-serif';
        ctx.fillText('声影区（无直达声）', m.X(lx), yGround - 10);
      }
    }

    // 声线束（按仰角着色：低仰角青、高仰角琥珀）
    last.rays.forEach(function (ray) {
      var pts = ray.res.points;
      if (!pts || pts.length < 2) return;
      var t = (ray.theta - state.fanMin) / Math.max(1e-9, state.fanMax - state.fanMin);
      t = Math.min(1, Math.max(0, t));
      var hue = 200 - 165 * t;
      ctx.strokeStyle = 'hsl(' + hue.toFixed(1) + ',85%,66%)';
      ctx.lineWidth = 1.5;
      strokePolyline(ctx, downsample(pts, 500), m);
    });

    // 主射线 θ₀（白线高亮）+ 折返点标记
    if (last.main && last.main.ok && last.main.points.length >= 2) {
      ctx.strokeStyle = 'rgba(248,250,252,0.95)';
      ctx.lineWidth = 2.2;
      strokePolyline(ctx, downsample(last.main.points, 500), m);
      if (last.main.turned) {
        var pts = last.main.points, ai = 0;
        for (var i = 1; i < pts.length; i++) if (pts[i].z > pts[ai].z) ai = i;
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(m.X(pts[ai].x), m.Y(pts[ai].z), 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 声源（圆点 + 光晕）
    var sx = m.X(0);
    ctx.fillStyle = 'rgba(56,189,248,0.22)';
    ctx.beginPath();
    ctx.arc(sx, yGround, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(sx, yGround, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(sx, yGround, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '11px sans-serif';
    ctx.fillText('声源', sx + 12, yGround - 8);

    // 右缘 c(z) 剖面小图（竖条渐变：g>0 向上增、g<0 向上减）
    var cTop = E.soundSpeed(b.zMax, state.c0, state.g);
    var cMin = Math.min(state.c0, cTop), cMax = Math.max(state.c0, cTop);
    var barX = m.padL + m.plotW + 12, barW = 14, barY0 = m.padT + 4, barY1 = m.padT + m.plotH - 4;
    var grad = ctx.createLinearGradient(0, barY1, 0, barY0);
    grad.addColorStop(0, speedColor(state.c0, cMin, cMax));
    grad.addColorStop(1, speedColor(cTop, cMin, cMax));
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY0, barW, barY1 - barY0);
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY0, barW, barY1 - barY0);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText('c(z) m/s', barX - 2, m.padT - 6);
    ctx.fillText(num(cTop, 0), barX + barW + 4, barY0 + 8);
    ctx.fillText(num(state.c0, 0), barX + barW + 4, barY1 + 2);
    ctx.fillText(state.g > 0 ? '↑ 增' : state.g < 0 ? '↓ 减' : '恒定', barX + barW + 4, (barY0 + barY1) / 2 + 3);
  }

  // 波前标记：按 τ = ∫ds/c 定位，体现当地声速（上快下慢或反之）
  function pointAtTau(pts, cum, tau) {
    var n = pts.length;
    if (tau <= 0) return { x: pts[0].x, z: pts[0].z, lo: 0, hi: 1, f: 0 };
    if (tau >= cum[n - 1]) return { x: pts[n - 1].x, z: pts[n - 1].z, lo: n - 2, hi: n - 1, f: 1 };
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (cum[mid] <= tau) lo = mid; else hi = mid;
    }
    var span = cum[hi] - cum[lo];
    var f = span > 0 ? (tau - cum[lo]) / span : 0;
    return {
      x: pts[lo].x + f * (pts[hi].x - pts[lo].x),
      z: pts[lo].z + f * (pts[hi].z - pts[lo].z),
      lo: lo, hi: hi, f: f
    };
  }

  function drawWavefronts(ctx, s) {
    var m = makeMap(s);
    last.rays.concat([{ theta: state.theta0, res: last.main, cum: last.main && last.main.cum, tauTotal: last.main && last.main.tauTotal }]).forEach(function (ray) {
      var pts = ray.res && ray.res.points;
      if (!pts || pts.length < 2 || !ray.tauTotal || ray.tauTotal < 0.5) return;
      var dTau = ray.tauTotal / WAVE_N;
      var rate = ray.tauTotal / WAVE_SPAN;
      var phase = (t0 * rate) % dTau;
      for (var k = 0; k < WAVE_N; k++) {
        var tau = phase + k * dTau;
        if (tau > ray.tauTotal) continue;
        var p = pointAtTau(pts, ray.cum, tau);
        var ax = m.X(pts[p.lo].x), ay = m.Y(Math.max(pts[p.lo].z, 0));
        var bx = m.X(pts[p.hi].x), by = m.Y(Math.max(pts[p.hi].z, 0));
        var ux = bx - ax, uy = by - ay;
        var ul = Math.sqrt(ux * ux + uy * uy) || 1;
        var px = ax + ux * p.f, py = ay + uy * p.f;
        // 垂直短刻线（波前取向）
        ctx.strokeStyle = 'rgba(253,230,138,0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px - (uy / ul) * 5, py + (ux / ul) * 5);
        ctx.lineTo(px + (uy / ul) * 5, py - (ux / ul) * 5);
        ctx.stroke();
        // 波前圆点
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function draw() {
    var s = ensureCanvas();
    if (!s) return;
    var ctx = s.ctx, W = s.w, H = s.h;
    if (offDirty) { renderStatic(s); offDirty = false; }
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    if (!last || !last.ok) {
      ctx.fillStyle = '#f87171';
      ctx.font = '14px sans-serif';
      ctx.fillText('参数无效，无法绘制。', 16, H / 2);
      return;
    }
    if (off) ctx.drawImage(off, 0, 0, W, H);
    drawWavefronts(ctx, s);
  }

  function loop() {
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function stopAnim() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function startAnim() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function togglePlay() {
    playing = !playing;
    var btn = $('rfPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('rfInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
  }

  function applyG(gv, name) {
    state.g = gv;
    syncInputs();
    recalc();
    flash('已应用预设：' + name + '（g = ' + gv + ' (m/s)/m）');
  }

  function bind() {
    bindInputs();
    var play = $('rfPlay'); if (play) play.addEventListener('click', togglePlay);
    var lapse = $('rfPreLapse'); if (lapse) lapse.addEventListener('click', function () { applyG(-0.03, '温度递减（正常递减，有影区）'); });
    var inv = $('rfPreInv'); if (inv) inv.addEventListener('click', function () { applyG(0.03, '逆温（清晨/水面，声音传远）'); });
    var iso = $('rfPreIso'); if (iso) iso.addEventListener('click', function () { applyG(0, '等温（直线传播）'); });
  }

  function flash(msg) {
    var el = $('rfMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function syncInputs() {
    ['c0', 'g', 'theta0', 'fanMin', 'fanMax', 'fanCount'].forEach(function (k) {
      var el = $('rf_' + k);
      if (el) el.value = state[k];
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-refraction');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>温度梯度声折射模拟器</h2>' +
      '<p class="hint">声速随高度线性变化 c(z) = c₀ + g·z 时，声线按 Snell 定律弯曲：逆温（g&gt;0）折返地面、传得远，正常递减（g&lt;0）上翘形成声影区。射线声学 + 固定步长 Euler 积分，SI 单位。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="rfInputs">' +
      field('c0', '地面声速 c₀', DEFAULTS.c0, 'm/s', 300, 360, 1) +
      field('g', '声速梯度 g', DEFAULTS.g, '(m/s)/m', -0.1, 0.1, 0.005) +
      field('theta0', '主射线仰角 θ₀', DEFAULTS.theta0, '°', 0, 80, 1) +
      field('fanMin', '声线束张角下限', DEFAULTS.fanMin, '°', -80, 85, 1) +
      field('fanMax', '声线束张角上限', DEFAULTS.fanMax, '°', -80, 85, 1) +
      field('fanCount', '声线条数', DEFAULTS.fanCount, '条', 5, 13, 1) +
      '</div>' +
      '<div class="btn-row toolbar">' +
      '<button id="rfPreLapse" class="btn">温度递减（正常递减，有影区）</button>' +
      '<button id="rfPreInv" class="btn">逆温（清晨/水面，声音传远）</button>' +
      '<button id="rfPreIso" class="btn">等温（直线传播）</button>' +
      '<span id="rfMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 射线束与波前动画</h3>' +
      '<div class="btn-row toolbar">' +
      '<button id="rfPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">彩线：声线束（按仰角着色）；白线：主射线 θ₀（粉圈为折返点）；暖色点：波前（按当地声速前进，体现上快下慢或反之）；红虚线：水平包络与声影区（g&lt;0）；右条：c(z) 剖面。</span></div>' +
      '<canvas class="canvas-wrap" id="rfCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="rfResult"></div></section>' +
      '<section class="card"><h3>公式与物理解释</h3>' +
      '<div class="formula">' +
      '<div><span class="fx">c(z) = c₀ + g·z</span>（声速随高度线性变化，z 为离地高度）</div>' +
      '<div><span class="fx">cosθ / c = cosθ₀ / c₀ = 常数</span>（Snell 不变量，θ 为声线仰角）</div>' +
      '<div><span class="fx">dθ/dx = −g / c(z)</span>，<span class="fx">dz/dx = tanθ</span>（固定步长 Euler 数值积分）</div>' +
      '<div><span class="fx">z_tp = c₀·(secθ₀ − 1) / g</span>（折返点高度，仅 g&gt;0 且 θ₀&gt;0 时存在）</div>' +
      '</div>' +
      '<ul class="inline-note">' +
      '<li>声线总是弯向低声速区：g&gt;0（逆温）时弯回地面，g&lt;0（正常递减）时向上翘。</li>' +
      '<li>逆温层（清晨、水面常见）把声音"压"回地面，所以能传得很远。</li>' +
      '<li>正常温度递减时，地面附近形成直达声影区，远处主要靠绕射与散射补入。</li>' +
      '<li>实际大气还受风切变影响（顺风等效于把声线压回地面），本模型未计入。</li>' +
      '</ul></section>' +
      '</div>' +
      '</div>';
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    bind();
    recalc();
    startAnim();
    inited = true;
  }

  // 视图被切回时刷新（重算 + 继续动画）
  function onShow() {
    recalc();
    if (!rafId) startAnim();
  }

  window.SimRefractionView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
