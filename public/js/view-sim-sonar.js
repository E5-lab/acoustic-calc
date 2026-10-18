/*
 * view-sim-sonar.js — 声呐方程与水声探测距离模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimSonar（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-sonar" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimSonar;

  var DEFAULTS = {
    mode: 'active', // 'active' 主动 | 'passive' 被动
    sl: 220,        // 声源级 SL dB re 1 μPa @ 1 m
    ts: 15,         // 目标强度 TS dB（仅主动）
    nl: 65,         // 环境噪声级 NL dB
    di: 20,         // 指向性指数 DI dB
    dt: 10,         // 检测阈 DT dB
    freq: 5,        // 工作频率 kHz
    c: 1500         // 海水声速 m/s
  };

  // 载入例题/预设：优先取内核 PRESETS（单一数据源），缺失时回落到本地副本
  var P0 = (E.PRESETS && E.PRESETS[0]) ? E.PRESETS[0].params
    : { mode: 'active', sl: 220, ts: 15, nl: 65, di: 20, dt: 10, freq: 5, c: 1500 };
  var P1 = (E.PRESETS && E.PRESETS[1]) ? E.PRESETS[1].params
    : { mode: 'active', sl: 225, ts: 10, nl: 60, di: 15, dt: 8, freq: 1, c: 1500 };
  var P2 = (E.PRESETS && E.PRESETS[2]) ? E.PRESETS[2].params
    : { mode: 'passive', sl: 150, ts: 0, nl: 55, di: 25, dt: 6, freq: 0.5, c: 1500 };

  var KEYS = ['sl', 'ts', 'nl', 'di', 'dt', 'freq', 'c'];

  var state = Object.assign({}, DEFAULTS);
  var last = null;    // 最近一次成功的 simulate 结果
  var inited = false;
  var playing = true; // 播放/暂停（动画仅在播放时推进）
  var rafId = null;
  var t0 = 0;         // 动画累计时间（秒，仅播放时增长）
  var DPR = 1;

  function $(id) { return window.Util.$(id); }
  function esc(s) { return window.Util.esc(s); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="sn_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="sn_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  function modeField(cur) {
    var opts = [{ v: 'active', t: '主动（回声定位，双程 2TL）' }, { v: 'passive', t: '被动（噪声听测，单程 TL）' }];
    var inner = '<div class="field"><label class="f-label" for="sn_Mode">声呐方程模式</label>' +
      '<select class="text-input" id="sn_Mode">';
    opts.forEach(function (o) {
      inner += '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    });
    return inner + '</select></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.simulate({
      mode: state.mode,
      sl: state.sl,
      ts: state.ts,
      nl: state.nl,
      di: state.di,
      dt: state.dt,
      freq: state.freq,
      c: state.c
    });
    last = r.ok ? r : null;
    renderResult(r);
    if (!r.ok) {
      stopAnim(); // 参数无效：显示错误并停掉动画
    } else if (playing && !rafId) {
      startAnim();
    }
  }

  function fmtDist(r) {
    if (r >= 1000) return num(r / 1000, r >= 10000 ? 0 : 1) + ' km';
    return num(r, r >= 100 ? 0 : 1) + ' m';
  }

  function renderResult(r) {
    var box = $('snResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }
    // 参考距离 1 km 处的检测余量（>0 说明该距离上仍能检测）
    var margin1k = E.detectionMargin(1000, {
      mode: state.mode, sl: state.sl, ts: state.ts, nl: state.nl,
      di: state.di, dt: state.dt, freq: state.freq, c: state.c
    });
    var isActive = r.mode === 'active';

    var stats = [
      { l: '吸收系数 α(f=' + num(r.freq, 2) + ' kHz)', v: num(r.alpha, 4), u: 'dB/km' },
      { l: '最大作用距离 r_max', v: fmtDist(r.rMax), u: '' },
      { l: isActive ? 'r_max 处传播损失 TL（单程）' : 'r_max 处传播损失 TL', v: num(r.tlAtRMax, 1), u: 'dB' },
      { l: '方程中的损失总量', v: num(r.twoWayTL, 1), u: 'dB' },
      { l: '噪声背景 NL−DI', v: num(r.noiseFloor, 1), u: 'dB' },
      { l: '检测阈 NL−DI+DT', v: num(r.threshold, 1), u: 'dB' },
      { l: '1 km 处检测余量', v: margin1k == null ? '—' : num(margin1k, 1), u: 'dB' },
      { l: isActive ? '往返时间 2r/c' : '传播时间 r/c', v: num(r.travelTime, 2), u: 's' },
      { l: '水中波长 λ=c/f', v: num(r.lambda, 3), u: 'm' },
      { l: '品质因数 FOM', v: num(r.figureOfMerit, 1), u: 'dB' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">';
    var tsPart = isActive ? ' + TS' : '';
    html += '<div>' + (isActive ? '主动（噪声限制）：' : '被动（噪声限制）：') +
      '<span class="fx">SL − ' + (isActive ? '2·TL(r)' : 'TL(r)') + tsPart + ' = NL − DI + DT</span>' +
      ' → ' + esc(num(r.sl, 0)) + ' − ' + (isActive ? '2×' : '') + esc(num(r.tlAtRMax, 1)) +
      (isActive ? ' + ' + esc(num(r.ts, 0)) : '') + ' = ' + esc(num(r.threshold, 1)) + ' dB</div>';
    html += '<div><span class="fx">TL(r) = 20log₁₀(r) + α·r/1000</span>' +
      ' = 20log₁₀(' + esc(fmtDist(r.rMax)) + ') + ' + esc(num(r.alpha, 4)) + '×' + esc(num(r.rMax / 1000, 3)) +
      ' = ' + esc(num(r.tlAtRMax, 2)) + ' dB（球面扩展 ' + esc(num(20 * Math.log10(r.rMax), 1)) +
      ' dB + 介质吸收 ' + esc(num(r.alpha * r.rMax / 1000, 1)) + ' dB）</div>';
    html += '<div>Thorp 经验式：<span class="fx">α(f) = 0.11f²/(1+f²) + 44f²/(4100+f²) + 2.75e-4·f² + 0.003</span>' +
      '（f 单位 kHz）→ α(' + esc(num(r.freq, 2)) + ' kHz) = ' + esc(num(r.alpha, 4)) + ' dB/km</div>';
    html += '</div>';

    // 采样读数表（对数距离轴上的几个代表点）
    var picks = [1000, 5000, r.rMax];
    html += '<table class="data-table"><thead><tr><th>距离 r</th><th>传播损失 TL</th>' +
      '<th>方程损失总量</th><th>接收信号级</th><th>检测余量</th></tr></thead><tbody>';
    picks.forEach(function (rr) {
      var tl = E.transmissionLoss(rr, r.freq, r.c);
      var loss = isActive ? 2 * tl : tl;
      var level = (isActive ? r.sl - 2 * tl + r.ts : r.sl - tl);
      html += '<tr><td>' + esc(fmtDist(rr)) + '</td><td>' + esc(num(tl, 1)) + ' dB</td><td>' +
        esc(num(loss, 1)) + ' dB</td><td>' + esc(num(level, 1)) + ' dB</td><td>' +
        esc(num(level - r.threshold, 1)) + ' dB</td></tr>';
    });
    html += '</tbody></table>';

    html += '<ul class="inline-note" style="margin-top:10px">';
    r.notes.forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
    html += '</ul>';

    box.innerHTML = html;
  }

  /* ------------------------------ Canvas 动画 ------------------------------ */
  function setup(id, cssH) {
    var cv = $(id);
    if (!cv) return null;
    DPR = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var cssW = rect.width || 640;
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    var ctx = cv.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function drawBg(ctx, W, H) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
  }

  function drawInvalid(ctx, W, H) {
    drawBg(ctx, W, H);
    ctx.fillStyle = '#f87171';
    ctx.font = '14px sans-serif';
    ctx.fillText('参数无效，无法绘制。', 16, H / 2);
  }

  // 主画布：侧视水声场景 —— 海面/海底 + 换能器指向性扇形波束 + 目标 +
  //         向外扩散的球面波前（主动：脉冲推出→遇目标返回回波；被动：目标噪声向外辐射）
  function drawScene(ctx, W, H, r) {
    drawBg(ctx, W, H);

    var ySurf = H * 0.17, yBed = H * 0.86;
    var xSrc = 48, ySrc = H * 0.44;
    var xEnd = W - 28;
    var isActive = r.mode === 'active';
    var rSpan = Math.max(20, Math.min(E.R_MAX, r.rMax * 2.5));
    var lgSpan = Math.log(rSpan);
    function X(rr) {
      var L = Math.log(Math.max(1, rr));
      return xSrc + (xEnd - xSrc) * (L / lgSpan);
    }
    var xTgt = X(r.rMax);

    // 水体
    ctx.fillStyle = 'rgba(14,116,144,0.20)';
    ctx.fillRect(0, ySurf, W, yBed - ySurf);

    // 超出作用距离区（余量 < 0）
    ctx.fillStyle = 'rgba(248,113,113,0.07)';
    ctx.fillRect(xTgt, ySurf, xEnd - xTgt, yBed - ySurf);

    // 海底
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, yBed, W, H - yBed);
    ctx.clip();
    ctx.fillStyle = '#1b2436';
    ctx.fillRect(0, yBed, W, H - yBed);
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    for (var hx = -20; hx < W + 20; hx += 16) {
      ctx.beginPath();
      ctx.moveTo(hx, yBed);
      ctx.lineTo(hx + 12, H);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, yBed);
    ctx.lineTo(W, yBed);
    ctx.stroke();

    // 指向性扇形波束（DI）
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ySurf, W, yBed - ySurf);
    ctx.clip();
    var beam = 22 * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(xSrc, ySrc);
    ctx.arc(xSrc, ySrc, xEnd - xSrc, -beam, beam);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,211,252,0.35)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    [-beam, beam].forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(xSrc, ySrc);
      ctx.lineTo(xSrc + (xEnd - xSrc) * Math.cos(a), ySrc + (xEnd - xSrc) * Math.sin(a));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 球面波前动画（3 个脉冲环，周期 6 s）
    var cycle = 6, i, ph, u;
    for (i = 0; i < 3; i++) {
      ph = (t0 / cycle + i / 3) % 1;
      if (isActive) {
        if (ph < 0.5) {           // 出射：自换能器向目标推进
          u = ph / 0.5;
          var radOut = u * (xTgt - xSrc);
          ctx.strokeStyle = 'rgba(56,189,248,' + (0.55 * (1 - u * 0.7)).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(xSrc, ySrc, radOut, -beam, beam);
          ctx.stroke();
        } else {                  // 回波：自目标返回换能器
          u = (ph - 0.5) / 0.5;
          var radBack = u * (xTgt - xSrc);
          ctx.strokeStyle = 'rgba(251,191,36,' + (0.55 * (1 - u * 0.7)).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(xTgt, ySrc, radBack, Math.PI - beam, Math.PI + beam);
          ctx.stroke();
        }
      } else {                    // 被动：目标辐射噪声向外扩散（抵达接收阵）
        u = ph;
        var radP = u * (xTgt - xSrc);
        ctx.strokeStyle = 'rgba(251,191,36,' + (0.5 * (1 - u * 0.7)).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(xTgt, ySrc, radP, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 海面
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var sx = 0; sx <= W; sx += 4) {
      var sy = ySurf + 2.2 * Math.sin(sx / 26 + t0 * 1.3);
      if (sx === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // 距离刻度（对数轴，十进制）
    var yAxis = H - 14;
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xSrc, yAxis);
    ctx.lineTo(xEnd, yAxis);
    ctx.stroke();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    [1, 10, 100, 1000, 10000, 100000, 1000000].forEach(function (d) {
      if (d > rSpan) return;
      var xd = X(d);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.beginPath();
      ctx.moveTo(xd, yAxis);
      ctx.lineTo(xd, yAxis - 5);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(fmtDist(d), xd, yAxis + 10);
    });
    ctx.textAlign = 'left';

    // 换能器 / 接收阵
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(xSrc - 5, ySrc - 14, 10, 28);
    ctx.beginPath();
    ctx.arc(xSrc - 5, ySrc, 14, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.fillText(isActive ? '换能器 Tx/Rx' : '接收阵 Rx', xSrc - 10, ySrc - 22);

    // 目标（潜艇/鱼群示意）
    ctx.fillStyle = isActive ? '#f8fafc' : '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(xTgt, ySrc, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xTgt - 3, ySrc - 6);
    ctx.lineTo(xTgt + 5, ySrc - 15);
    ctx.lineTo(xTgt + 9, ySrc - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.55)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xTgt, ySurf);
    ctx.lineTo(xTgt, yBed);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(isActive ? '目标 TS = ' + num(r.ts, 0) + ' dB' : '噪声源 SL = ' + num(r.sl, 0) + ' dB',
      Math.max(70, Math.min(xTgt, W - 70)), ySrc - 24);
    ctx.textAlign = 'left';

    // r_max 标注
    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('r_max = ' + fmtDist(r.rMax), Math.max(80, Math.min(xTgt, xEnd - 10)), yBed - 10);
    ctx.textAlign = 'left';

    // 顶部信息
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(isActive
      ? 'SL = ' + num(r.sl, 0) + ' dB；TS = ' + num(r.ts, 0) + ' dB；NL−DI = ' + num(r.noiseFloor, 0) +
        ' dB；DT = ' + num(r.dt, 0) + ' dB；f = ' + num(r.freq, 2) + ' kHz（λ = ' + num(r.lambda, 2) + ' m）'
      : 'SL = ' + num(r.sl, 0) + ' dB（目标辐射噪声）；NL−DI = ' + num(r.noiseFloor, 0) +
        ' dB；DT = ' + num(r.dt, 0) + ' dB；f = ' + num(r.freq, 2) + ' kHz', 14, 18);
    ctx.fillText('青色 = 出射脉冲，' + (isActive ? '琥珀色 = 目标回波' : '琥珀色 = 目标辐射噪声') +
      '；右侧红色区域为检测余量 < 0 的不可检测区', 14, 34);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('距离轴为对数压缩（' + fmtDist(1) + ' → ' + fmtDist(rSpan) + '）', 14, H - 22);
  }

  // 副图：接收信号级 vs 距离（对数距离轴）与噪声+检测阈水平线，交点即 r_max
  function drawChart(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var padL = 58, padR = 18, padT = 26, padB = 38;
    var pw = W - padL - padR, ph = H - padT - padB;

    var rLo = r.curve[0].r, rHi = r.curve[r.curve.length - 1].r;
    var lo = Math.log(rLo), hi = Math.log(rHi);
    function X(rr) { return padL + ((Math.log(rr) - lo) / (hi - lo)) * pw; }

    var vMax = Math.max(r.curve[0].level, r.threshold) + 8;
    var vMin = Math.min(r.curve[r.curve.length - 1].level, r.threshold) - 8;
    function Y(v) { return padT + ph * (1 - (v - vMin) / (vMax - vMin)); }

    ctx.font = '11px sans-serif';

    // 可检测区（左侧）阴影
    ctx.fillStyle = 'rgba(56,189,248,0.08)';
    ctx.fillRect(padL, padT, X(r.rMax) - padL, ph);

    // 距离网格（十进位）
    [1, 10, 100, 1000, 10000, 100000, 1000000].forEach(function (d) {
      if (d < rLo || d > rHi) return;
      var x = X(d);
      ctx.strokeStyle = 'rgba(148,163,184,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + ph);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(fmtDist(d), x, padT + ph + 15);
    });
    ctx.textAlign = 'left';

    // 纵轴刻度（线性 dB）
    ctx.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var v = vMin + (vMax - vMin) * (i / 4);
      var y = Y(v);
      ctx.strokeStyle = 'rgba(148,163,184,0.20)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + pw, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(num(v, 0), padL - 6, y + 4);
    }
    ctx.textAlign = 'left';

    // 接收信号级曲线
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j < r.curve.length; j++) {
      var p = r.curve[j];
      var px = X(p.r), py = Y(p.level);
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 噪声 + 检测阈 水平线
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, Y(r.threshold));
    ctx.lineTo(padL + pw, Y(r.threshold));
    ctx.stroke();
    ctx.setLineDash([]);

    // 交点（r_max）
    var mx = X(r.rMax), my = Y(r.threshold);
    ctx.strokeStyle = 'rgba(251,191,36,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, padT);
    ctx.lineTo(mx, padT + ph);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText('r_max = ' + fmtDist(r.rMax), Math.max(padL + 40, Math.min(mx, padL + pw - 40)), padT - 9);
    ctx.textAlign = 'left';

    // 读数
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('信号级 (dB re 1 μPa)', 8, padT - 9);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('交点左侧可检测（余量 > 0）；α = ' + num(r.alpha, 4) + ' dB/km，' +
      'TL(r_max) = ' + num(r.tlAtRMax, 1) + ' dB', padL, H - 8);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('距离 r（对数刻度）', padL + pw, H - 8);
    ctx.textAlign = 'left';

    // 播放时的扫描标记（沿曲线移动；暂停时冻结）
    if (playing) {
      var pos = (t0 / 6) % 1;
      var rr = rLo * Math.pow(rHi / rLo, pos);
      var lv = (r.mode === 'active' ? r.sl - 2 * E.transmissionLoss(rr, r.freq, r.c) + r.ts
        : r.sl - E.transmissionLoss(rr, r.freq, r.c));
      var sx = X(rr), sy = Y(lv);
      ctx.strokeStyle = 'rgba(226,232,240,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, padT);
      ctx.lineTo(sx, padT + ph);
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    var s1 = setup('snCanvas', 340);
    if (s1) {
      if (last && last.ok) drawScene(s1.ctx, s1.w, s1.h, last);
      else drawInvalid(s1.ctx, s1.w, s1.h);
    }
    var s2 = setup('snChart', 300);
    if (s2) {
      if (last && last.ok) drawChart(s2.ctx, s2.w, s2.h, last);
      else drawInvalid(s2.ctx, s2.w, s2.h);
    }
  }

  function loop() {
    if (playing && last && last.ok) {
      t0 += 1 / 60; // 以约 60fps 累计时间（仅播放时推进）
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
    var btn = $('snPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
    if (playing && !rafId) startAnim();
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('snInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? 0 : v;
        recalc();
      });
    });
    var mode = $('sn_Mode');
    if (mode) {
      mode.addEventListener('change', function () {
        state.mode = mode.value === 'passive' ? 'passive' : 'active';
        syncInputs();
        recalc();
      });
    }
  }

  function bind() {
    bindInputs();
    var play = $('snPlay'); if (play) play.addEventListener('click', togglePlay);
    var b1 = $('snP1'); if (b1) b1.addEventListener('click', function () { loadPreset(P0, '典型舰壳声呐（f=5 kHz）'); });
    var b2 = $('snP2'); if (b2) b2.addEventListener('click', function () { loadPreset(P1, '低频远程（f=1 kHz）'); });
    var b3 = $('snP3'); if (b3) b3.addEventListener('click', function () { loadPreset(P2, '被动听测（f=0.5 kHz）'); });
    var reset = $('snReset'); if (reset) reset.addEventListener('click', resetAll);
  }

  function flash(msg) {
    var el = $('snMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2000);
  }

  function loadPreset(p, label) {
    state = Object.assign({}, DEFAULTS, p);
    syncInputs();
    recalc();
    flash('已载入预设：' + label);
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    KEYS.forEach(function (k) {
      var el = $('sn_' + k);
      if (el) el.value = state[k];
    });
    var ts = $('sn_ts');
    if (ts) ts.disabled = (state.mode === 'passive'); // 被动方程不含 TS
    var mode = $('sn_Mode');
    if (mode) mode.value = state.mode;
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-sonar');
    if (!root) return;
    root.innerHTML =
      '<div class="page-head"><h2>声呐方程与水声探测距离模拟器</h2>' +
      '<p class="hint">以 Thorp 经验式给出的海水吸收 α(f) 与球面扩展 20log₁₀r 构成传播损失 TL，' +
      '对噪声限制的声呐方程求解等号得最大作用距离 r_max：主动为 SL−2TL+TS ≥ NL−DI+DT（双程），' +
      '被动为 SL−TL ≥ NL−DI+DT（单程）。左侧为侧视水声场景动画，右侧为信号级/噪声阈交点图。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row" id="snInputs">' +
      modeField(DEFAULTS.mode) +
      field('sl', '声源级 SL', DEFAULTS.sl, 'dB re 1μPa@1m', 100, 1) +
      field('ts', '目标强度 TS', DEFAULTS.ts, 'dB（仅主动）', -40, 1) +
      field('nl', '环境噪声级 NL', DEFAULTS.nl, 'dB', 20, 1) +
      field('di', '指向性指数 DI', DEFAULTS.di, 'dB', 0, 1) +
      field('dt', '检测阈 DT', DEFAULTS.dt, 'dB', -10, 1) +
      field('freq', '工作频率 f', DEFAULTS.freq, 'kHz', 0.05, 0.5) +
      field('c', '海水声速 c', DEFAULTS.c, 'm/s', 1400, 1) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="snP1" class="btn">典型舰壳声呐 f=5kHz</button>' +
      '<button id="snP2" class="btn">低频远程 f=1kHz</button>' +
      '<button id="snP3" class="btn">被动听测 f=0.5kHz</button>' +
      '<button id="snReset" class="btn ghost">重置参数</button>' +
      '<span id="snMsg" class="aux-msg"></span></div></section>' +
      '<section class="card"><h3><span class="step">2</span> 实时声呐场景动画</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="snPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">扇形为该孔径的指向性波束（DI）；主动模式下青色脉冲自换能器推出、遇目标后以琥珀色回波返回，' +
      '被动模式下目标辐射噪声一路扩散到接收阵；红色区域表示检测余量已小于 0。</span></div>' +
      '<canvas class="canvas-wrap" id="snCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="snResult"></div></section>' +
      '<section class="card"><h3>信号级 vs 距离（交点 = r_max）</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<span class="aux-msg">青线为接收信号级（随距离的传播损失衰减），琥珀虚线为判决门限 NL−DI+DT；' +
      '两线交点即作用距离 r_max，交点右侧余量为负。播放时白色标记沿距离轴扫描。</span></div>' +
      '<canvas class="canvas-wrap" id="snChart"></canvas></section>' +
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

  window.SimSonarView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
