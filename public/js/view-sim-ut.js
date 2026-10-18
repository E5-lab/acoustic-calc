/*
 * view-sim-ut.js — 超声脉冲回波法测厚与探伤（A 扫描）模拟视图（交互 + 实时 Canvas 动画）
 * 依赖：window.SimUt（计算内核）
 * 约定：本视图在 init() 时自建全部 DOM（含 .page-head），index.html 只需留一个空
 *       <section id="view-sim-ut" class="view" hidden></section> 容器即可，便于无冲突集成。
 */
(function () {
  'use strict';

  var E = window.SimUt;

  var DEFAULTS = {
    material: 'steel',
    fMHz: 5,        // 频率 MHz
    DMm: 10,        // 晶片直径 mm
    dMm: 50,        // 工件厚度 mm
    defectMm: 25,   // 缺陷深度 mm（null = 无缺陷）
    alpha: 0.01,    // 材料衰减 dB/mm
    snr: 60,        // 信噪比 dB（null = 无噪声）
    refl: 0.6,      // 缺陷当量反射体系数 0~1
    wMm: 6,         // 缺陷 FWHM（当量尺寸）mm
    gateUs: null,   // 闸门起点 µs（null = 自动跟随底波）
    gateWUs: null   // 闸门宽度 µs
  };

  // 载入例题：钢板 50 mm 中部缺陷
  var PRESET = {
    material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: 25,
    alpha: 0.01, snr: 60, refl: 0.6, wMm: 6, gateUs: null, gateWUs: null
  };

  var PRESETS = [
    { label: '钢板 50mm 无缺陷', v: { material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: null, alpha: 0.01, snr: 60, refl: 1, wMm: 6 } },
    { label: '钢板 50mm 中部缺陷', v: { material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: 25, alpha: 0.01, snr: 60, refl: 0.6, wMm: 6 } },
    { label: '薄板 5mm 高分辨', v: { material: 'steel', fMHz: 10, DMm: 3, dMm: 5, defectMm: null, alpha: 0.01, snr: 60, refl: 1, wMm: 3 } },
    { label: '铸铁厚件 100mm', v: { material: 'castiron', fMHz: 2, DMm: 20, dMm: 100, defectMm: 60, alpha: 0.06, snr: 70, refl: 0.8, wMm: 8 } }
  ];

  var KEYS = ['fMHz', 'DMm', 'dMm', 'defectMm', 'alpha', 'snr', 'refl', 'wMm', 'gateUs', 'gateWUs'];

  // 三个回波的配色（A 扫描标记与剖面传播脉冲共用）
  var COL_INIT = '#94a3b8';    // 始波（发射脉冲）
  var COL_DEF = '#fbbf24';     // 缺陷波
  var COL_BACK = '#38bdf8';    // 底波
  var VIS_T = 2.6;             // 一个可视化脉冲往返周期（秒）

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
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ------------------------------ 字段 ------------------------------ */
  function field(k, label, val, unit, min, step) {
    var u = unit ? ' <span class="unit-tag">' + esc(unit) + '</span>' : '';
    return '<div class="field"><label class="f-label" for="ut_' + k + '">' + esc(label) + u + '</label>' +
      '<input class="text-input" type="number" id="ut_' + k + '" data-k="' + k + '" value="' + val +
      '" min="' + min + '" step="' + step + '"></div>';
  }

  /* ------------------------------ 计算 ------------------------------ */
  function recalc() {
    var r = E.simulate({
      material: state.material,
      fMHz: state.fMHz,
      DMm: state.DMm,
      dMm: state.dMm,
      defectMm: state.defectMm,
      alpha: state.alpha,
      snr: state.snr,
      refl: state.refl,
      wMm: state.wMm
    });
    last = r.ok ? r : null;
    renderResult(r);
    if (!r.ok) {
      stopAnim(); // 参数无效：显示错误并停掉动画
    } else if (playing && !rafId) {
      startAnim();
    }
  }

  // 闸门：未手工设定时自动跟随底波（覆盖底波前后各一段）
  function gateOf(r) {
    var g0 = state.gateUs, gw = state.gateWUs;
    if (g0 == null) g0 = Math.max(0, r.tBackUs * 0.75);
    if (gw == null) gw = Math.max(1, r.tBackUs * 0.5);
    return { g0: g0, gw: gw };
  }

  // 显示增益：把最弱回波抬到约 0.8 屏高（物理幅度极小，需增益才能看见）
  function gainOf(r) {
    var a = r.ascan;
    var m = a.back.amp;
    if (a.defect && a.defect.amp > m) m = a.defect.amp;
    if (!(m > 0)) m = 1;
    return clamp(0.8 / m, 1, 200);
  }

  function renderResult(r) {
    var box = $('utResult');
    if (!box) return;
    if (!r.ok) {
      box.innerHTML = '<div class="callout-row error">' + esc(r.error) + '</div>';
      return;
    }

    // 闸门输入未手工设定时，回填自动值供用户查看
    if (state.gateUs == null) { var gi = $('ut_gateUs'); if (gi) gi.value = Number((r.tBackUs * 0.75).toFixed(2)); }
    if (state.gateWUs == null) { var gw = $('ut_gateWUs'); if (gw) gw.value = Number((r.tBackUs * 0.5).toFixed(2)); }

    var stats = [
      { l: '波长 λ = c/f', v: num(r.lambdaMm, 3), u: 'mm' },
      { l: '近场长度 N', v: num(r.nearFieldMm, 2), u: 'mm' },
      { l: '半扩散角 θ', v: r.theta == null ? '无解' : num(r.thetaDeg, 2), u: r.theta == null ? '' : '°' },
      { l: '轴向分辨率', v: num(r.axialResMm, 3), u: 'mm' },
      { l: '底波幅度', v: num(r.backDb, 1), u: 'dB' },
      { l: '缺陷波幅度', v: num(r.defectDb, 1), u: 'dB' },
      { l: '缺陷深度', v: r.defectMm == null ? '无缺陷' : num(r.defectMm, 1), u: r.defectMm == null ? '' : 'mm' },
      { l: '−6 dB 当量尺寸', v: num(r.size6dbMm, 1), u: 'mm' }
    ];
    var html = '<div class="stat-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat"><div class="s-label">' + esc(s.l) + '</div>' +
        '<div class="s-value">' + s.v + '<small>' + esc(s.u) + '</small></div></div>';
    });
    html += '</div>';

    html += '<div class="formula" style="margin-top:12px">' +
      '<div><span class="fx">λ = c/f = ' + num(r.lambdaMm, 3) + ' mm</span>（' + esc(r.materialName) +
      '，c = ' + num(r.c, 0) + ' m/s，f = ' + num(r.fMHz, 2) + ' MHz）；' +
      '<span class="fx">d = c·t/2</span>，底波 t_b = <span class="fx">' + num(r.tBackUs, 2) + ' µs</span></div>' +
      '<div><span class="fx">N = D²/(4λ) = ' + num(r.nearFieldMm, 2) + ' mm</span>（D = ' + num(r.DMm, 1) + ' mm）；' +
      '<span class="fx">θ = arcsin(1.22λ/D) = ' + (r.theta == null ? '无解' : num(r.thetaDeg, 2) + '°') + '</span>；' +
      '<span class="fx">d_min = c·τ/2 = ' + num(r.axialResMm, 3) + ' mm</span></div>' +
      '<div><span class="fx">A_底 = −2αd − 20log10(2d) = ' + num(r.backDb, 1) + ' dB</span>（α = ' + num(r.alpha, 3) +
      ' dB/mm，d = ' + num(r.dMm, 1) + ' mm，往返声程 ' + num(2 * r.dMm, 0) + ' mm）</div>' +
      (r.defectMm == null
        ? '<div>缺陷波：<span class="fx">无缺陷</span>（A 扫描仅始波与底波）</div>'
        : '<div><span class="fx">A_缺 = −2αd_f − 20log10(2d_f) + 20log10(refl) = ' + num(r.defectDb, 1) + ' dB</span>' +
        '（d_f = ' + num(r.defectMm, 1) + ' mm，直达 t_f = <span class="fx">' + num(r.tDefectUs, 2) + ' µs</span>' +
        '，refl = ' + num(r.refl, 2) + '）；<span class="fx">−6 dB 当量尺寸 w = ' + num(r.size6dbMm, 1) + ' mm</span></div>') +
      '</div>';

    // 告警
    if (r.warnings.length) {
      html += '<div class="callout-row warn" style="margin-top:10px">';
      r.warnings.forEach(function (w) { html += '<div class="warn">⚠ ' + esc(w) + '</div>'; });
      html += '</div>';
    }

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

  // 当前动画相位对应的真实时间 τ（µs）：0 → 时间窗末尾
  function tauOf(r) {
    var T = r.ascan ? r.ascan.TWinUs : 20;
    return ((t0 % VIS_T) / VIS_T) * T;
  }

  // 高斯型闪光因子：τ 到达 t_e 时最亮
  function flashAt(tau, te, wUs) {
    var dx = (tau - te) / wUs;
    return Math.exp(-dx * dx);
  }

  /*
   * 主画布：A 扫描
   * 横轴为时间 µs（上沿同步给出深度 mm 刻度）；纵轴为 RF 幅度（双极性，0 在中线）；
   * 三个回波各画高斯包络与色标竖线；闸门为半透明色块；播放时扫描线沿时间轴推进。
   */
  function drawAscan(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var a = r.ascan;
    if (!a) { drawInvalid(ctx, W, H); return; }

    var padL = 48, padR = 16, padT = 30, padB = 36;
    var pw = W - padL - padR, ph = H - padT - padB;
    var T = a.TWinUs;
    var g = gainOf(r);
    var mid = padT + ph / 2;
    var sc = 0.44 * ph;
    var tau = tauOf(r);
    function X(tUs) { return padL + (tUs / T) * pw; }
    function Y(amp) { return mid - clamp(amp * g, -1.15, 1.15) * sc; }

    ctx.font = '11px sans-serif';

    // 闸门（半透明色块）
    var gt = gateOf(r);
    var gx0 = X(gt.g0), gx1 = X(gt.g0 + gt.gw);
    ctx.fillStyle = 'rgba(251,191,36,0.10)';
    ctx.fillRect(gx0, padT, gx1 - gx0, ph);
    ctx.strokeStyle = 'rgba(251,191,36,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(gx0, padT); ctx.lineTo(gx0, padT + ph);
    ctx.moveTo(gx1, padT); ctx.lineTo(gx1, padT + ph);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText('闸门 ' + num(gt.g0, 1) + '–' + num(gt.g0 + gt.gw, 1) + ' µs',
      clamp((gx0 + gx1) / 2, padL + 46, padL + pw - 46), padT + 14);
    ctx.textAlign = 'left';

    // 时间刻度（下沿）
    for (var i = 0; i <= 4; i++) {
      var tv = T * i / 4;
      var x = X(tv);
      ctx.strokeStyle = 'rgba(148,163,184,0.20)';
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(num(tv, 1), x, padT + ph + 14);
      ctx.fillStyle = '#64748b';
      ctx.fillText(num(tv * r.c / 2000, 1), x, padT - 6); // 上沿：深度 mm = c·t/2
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('时间 t / µs', padL + pw - 52, H - 8);
    ctx.fillText('深度 / mm', padL + pw - 52, padT - 18);
    ctx.fillText('幅度 A', 8, padT - 6);

    // 零线
    ctx.strokeStyle = 'rgba(148,163,184,0.30)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, mid); ctx.lineTo(padL + pw, mid); ctx.stroke();
    ctx.setLineDash([]);

    // 波形（裁剪在绘图区内，避免溢出到坐标轴）
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT, pw, ph); ctx.clip();

    // 整条波形（暗色，"已存储"轨迹）
    ctx.strokeStyle = 'rgba(125,211,252,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < a.M; i++) {
      var px = X(a.tUs[i]), py = Y(a.y[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 扫描线之前的部分（亮色，随时间"激发"）
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    var started = false;
    for (i = 0; i < a.M; i++) {
      if (a.tUs[i] > tau) break;
      var qx = X(a.tUs[i]), qy = Y(a.y[i]);
      if (!started) { ctx.moveTo(qx, qy); started = true; } else ctx.lineTo(qx, qy);
    }
    if (started) ctx.stroke();

    // 三个回波的高斯包络（虚线）
    var echos = [
      { t: a.initial.tUs, amp: a.initial.amp, col: COL_INIT },
      a.defect ? { t: a.defect.tUs, amp: a.defect.amp, col: COL_DEF } : null,
      { t: a.back.tUs, amp: a.back.amp, col: COL_BACK }
    ];
    var sg = a.sigmaUs;
    echos.forEach(function (e) {
      if (!e) return;
      ctx.strokeStyle = e.col;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      [1, -1].forEach(function (sgn) {
        ctx.beginPath();
        for (var k = -40; k <= 40; k++) {
          var tt = e.t + (k / 40) * 4 * sg;
          if (tt < 0 || tt > T) continue;
          var u = (tt - e.t) / sg;
          var env = sgn * e.amp * Math.exp(-u * u);
          var ex = X(tt), ey = Y(env);
          if (k === -40) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
    ctx.restore();

    // 三个回波标记（色标竖线 + 标注 + 抵达闪光）
    var marks = [
      { t: a.initial.tUs, col: COL_INIT, tag: '始波 0 µs' },
      a.defect ? { t: a.defect.tUs, col: COL_DEF, tag: '缺陷波 ' + num(a.defect.tUs, 2) + ' µs / ' + num(a.defect.depthMm, 1) + ' mm' } : null,
      { t: a.back.tUs, col: COL_BACK, tag: '底波 ' + num(a.back.tUs, 2) + ' µs / ' + num(a.back.depthMm, 1) + ' mm' }
    ];
    marks.forEach(function (m) {
      if (!m) return;
      var mx = X(m.t);
      ctx.strokeStyle = m.col;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, padT + ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = m.col;
      ctx.textAlign = 'center';
      ctx.fillText(m.tag, clamp(mx, padL + 40, padL + pw - 40), padT + ph - 6);
      ctx.textAlign = 'left';
    });

    // 扫描线经过时脉冲被"激发"：闪光
    var fl = [
      { t: a.initial.tUs, amp: a.initial.amp, col: COL_INIT, w: 0.6 },
      a.defect ? { t: a.defect.tUs, amp: a.defect.amp, col: COL_DEF, w: 0.7 } : null,
      { t: a.back.tUs, amp: a.back.amp, col: COL_BACK, w: 0.7 }
    ];
    fl.forEach(function (m) {
      if (!m) return;
      var f = flashAt(tau, m.t, m.w);
      if (f < 0.03) return;
      var mx = X(m.t);
      ctx.globalAlpha = f;
      ctx.strokeStyle = m.col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx, Y(m.amp)); ctx.lineTo(mx, Y(-m.amp)); ctx.stroke();
      ctx.fillStyle = m.col;
      ctx.beginPath(); ctx.arc(mx, Y(m.amp), 3 + 6 * (1 - f), 0, Math.PI * 2);
      ctx.globalAlpha = f * 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // 扫描线
    var sxp = X(tau);
    ctx.strokeStyle = 'rgba(248,250,252,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sxp, padT); ctx.lineTo(sxp, padT + ph); ctx.stroke();
    var si = Math.round(tau / a.dtUs);
    if (si >= 0 && si < a.M) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(sxp, Y(a.y[si]), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 标题信息
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('A 扫描（RF 射频波形，' + num(r.fMHz, 1) + ' MHz）', 8, padT - 18);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('显示增益 +' + num(20 * Math.log(gainOf(r)) / Math.LN10, 0) + ' dB（物理幅度极小，需增益放大）', padL + pw, padT - 18);
    ctx.textAlign = 'left';
  }

  /*
   * 副画布：工件剖面（探头 + 声束 + 缺陷 + 传播脉冲）+ 底部 −6 dB 横移扫描演示
   */
  function drawSection(ctx, W, H, r) {
    drawBg(ctx, W, H);
    var d = r.dMm, c = r.c, DMm = r.DMm, NMm = r.nearFieldMm, th = r.theta;
    var tau = tauOf(r);
    var tb = r.tBackUs, tf = r.tDefectUs;
    var w = r.wMm;

    var stripH = 52;
    var padL = 56, padR = 16, padT = 30, padB = stripH + 22;
    var pw = W - padL - padR;
    var yTop = padT, yBot = H - padB;
    var sy = (yBot - yTop) / d;
    var tanTh = th != null ? Math.tan(th) : 1.2;
    var xHalf = Math.max(18, DMm / 2 + tanTh * Math.max(0, d - NMm) + 4, (w || 6) / 2 + 4);
    xHalf = Math.min(xHalf, 90);
    var cx = padL + pw / 2;
    var sx = pw / (2 * xHalf);
    function X(xMm) { return cx + xMm * sx; }
    function Y(zMm) { return yTop + zMm * sy; }
    function halfAt(z) { return DMm / 2 + (z > NMm ? tanTh * (z - NMm) : 0); }

    ctx.font = '11px sans-serif';

    // 工件本体
    ctx.fillStyle = 'rgba(30,41,59,0.92)';
    ctx.fillRect(padL, Y(0), pw, Y(d) - Y(0));
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, Y(0), pw, Y(d) - Y(0));
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(padL + pw, Y(d)); ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('底面 d = ' + num(d, 1) + ' mm', padL + 6, Y(d) - 6);
    ctx.fillText('表面', padL + 6, Y(0) + 14);

    // 声束（−6 dB 边界：近场柱形段 + 远场扩散段）
    if (th != null) {
      ctx.beginPath();
      var nStep = 32;
      for (var i = 0; i <= nStep; i++) {
        var z = d * i / nStep;
        var px = X(-halfAt(z)), py = Y(z);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      for (i = nStep; i >= 0; i--) {
        var z2 = d * i / nStep;
        ctx.lineTo(X(halfAt(z2)), Y(z2));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(56,189,248,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56,189,248,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('θ = arcsin(1.22λ/D) 无解：声束全扩散', padL + 6, Y(0) + 28);
    }

    // 近场长度线
    if (NMm < d) {
      ctx.strokeStyle = 'rgba(251,191,36,0.65)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, Y(NMm)); ctx.lineTo(padL + pw, Y(NMm)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('近场 N = ' + num(NMm, 1) + ' mm', padL + 6, Y(NMm) - 4);
    }

    // 探头（晶片）
    var pW = clamp(DMm * sx, 12, pw * 0.9);
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - pW / 2, Y(0) - 13, pW, 13);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - pW / 2, Y(0) - 13, pW, 13);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText('探头 D=' + num(DMm, 1) + 'mm', cx, Y(0) - 18);
    ctx.textAlign = 'left';

    // 缺陷
    if (r.defectMm != null) {
      var dw = clamp((w || 6) * sx, 10, 80);
      ctx.fillStyle = 'rgba(251,191,36,0.85)';
      ctx.fillRect(X(0) - dw / 2, Y(r.defectMm) - 4, dw, 8);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.strokeRect(X(0) - dw / 2, Y(r.defectMm) - 4, dw, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('缺陷 d_f = ' + num(r.defectMm, 1) + ' mm', X(0) + dw / 2 + 6, Y(r.defectMm) + 4);
    }

    // 传播脉冲：下行 → 缺陷反射上行 → 底面反射上行（与 A 扫描回波时刻对应）
    function packet(z, col, glow) {
      if (z < 0 || z > d) return;
      var py = Y(z);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx, py, 8 * glow, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx, py, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, py, 7 + 6 * glow, 0, Math.PI * 2); ctx.stroke();
    }
    // 下行（τ ≤ d/c = t_b/2）
    if (tau <= tb / 2) packet(c * tau / 1000, COL_INIT, 1);
    else if (tau <= tb) packet(d - c * (tau - tb / 2) / 1000, COL_BACK, 1);
    if (r.defectMm != null && tau >= tf / 2 && tau <= tf) {
      packet(r.defectMm - c * (tau - tf / 2) / 1000, COL_DEF, 1);
    }

    // 回波抵达探头时的闪光（颜色与 A 扫描回波一一对应）
    function ring(tArrive, col) {
      var f = flashAt(tau, tArrive, 0.7);
      if (f < 0.03) return;
      ctx.globalAlpha = f;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, Y(0), 6 + 12 * (1 - f), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ring(0.3, COL_INIT);
    if (r.defectMm != null) ring(tf, COL_DEF);
    ring(tb, COL_BACK);

    // 深度刻度（左侧）
    ctx.fillStyle = '#64748b';
    for (i = 0; i <= 4; i++) {
      var zv = d * i / 4;
      ctx.fillText(num(zv, 1), padL - 34, Y(zv) + 4);
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('工件剖面（纵波直探头脉冲回波法）', 8, 18);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('深度 / mm', padL - 4, 18);
    ctx.textAlign = 'left';

    /* ---- 底部：−6 dB 法（探头横移测缺陷当量尺寸）演示 ---- */
    var sTop = H - stripH - 6, sBot = H - 14;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('−6 dB 法：探头沿缺陷横移，回波幅度降至峰值一半（−6 dB）的两点间距 = 当量尺寸', padL, sTop - 6);
    if (r.defectMm == null) {
      ctx.fillStyle = '#64748b';
      ctx.fillText('（无缺陷：−6 dB 法不适用）', padL, sTop + 22);
      return;
    }
    var xr = 1.7 * w;
    function Xs(x) { return padL + ((x + xr) / (2 * xr)) * pw; }
    function Ys(amp) { return sBot - amp * (sBot - sTop); }
    // 基线
    ctx.strokeStyle = 'rgba(148,163,184,0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, sBot); ctx.lineTo(padL + pw, sBot); ctx.stroke();
    // 幅度包络 A(x)
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (i = 0; i <= 120; i++) {
      var xv = -xr + (2 * xr) * i / 120;
      var av = E.defectEnvelope(xv, w);
      var ex2 = Xs(xv), ey2 = Ys(av);
      if (i === 0) ctx.moveTo(ex2, ey2); else ctx.lineTo(ex2, ey2);
    }
    ctx.stroke();
    // −6 dB 水平线（A = 0.5）
    ctx.strokeStyle = 'rgba(251,191,36,0.65)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, Ys(0.5)); ctx.lineTo(padL + pw, Ys(0.5)); ctx.stroke();
    ctx.setLineDash([]);
    // −6 dB 边界点 ±w/2
    [-w / 2, w / 2].forEach(function (xb) {
      ctx.strokeStyle = 'rgba(251,191,36,0.85)';
      ctx.beginPath(); ctx.moveTo(Xs(xb), sBot); ctx.lineTo(Xs(xb), Ys(0.5)); ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(Xs(xb), Ys(0.5), 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText('−6 dB', (Xs(-w / 2) + Xs(w / 2)) / 2, Ys(0.5) - 5);
    ctx.fillText('w = ' + num(w, 1) + ' mm', Xs(0), sBot + 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.fillText('探头横移 x / mm', padL + pw - 92, sTop - 6);
    // 横移中的探头位置（演示扫描）
    var ph2 = (tau / (r.ascan ? r.ascan.TWinUs : 20));
    var xs = -xr + 2 * xr * (ph2 % 1);
    ctx.strokeStyle = 'rgba(226,232,240,0.35)';
    ctx.beginPath(); ctx.moveTo(Xs(xs), sTop); ctx.lineTo(Xs(xs), sBot); ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(Xs(xs), Ys(E.defectEnvelope(xs, w)), 3, 0, Math.PI * 2); ctx.fill();
  }

  function draw() {
    var s1 = setup('utCanvas', 320);
    if (s1) {
      if (last && last.ok) drawAscan(s1.ctx, s1.w, s1.h, last);
      else drawInvalid(s1.ctx, s1.w, s1.h);
    }
    var s2 = setup('utSection', 330);
    if (s2) {
      if (last && last.ok) drawSection(s2.ctx, s2.w, s2.h, last);
      else drawInvalid(s2.ctx, s2.w, s2.h);
    }
  }

  function visible() {
    var root = $('view-sim-ut');
    return !!(root && !root.hidden && root.offsetParent !== null);
  }

  function loop() {
    if (!visible()) { rafId = null; return; } // 离开页面：停掉 RAF（onShow 会重启）
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
    var btn = $('utPlay');
    if (btn) btn.textContent = playing ? '暂停' : '播放';
    if (playing && !rafId) startAnim();
  }

  /* ------------------------------ 交互 ------------------------------ */
  function bindInputs() {
    var box = $('utInputs');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-k');
        var v = parseFloat(el.value);
        state[k] = isNaN(v) ? null : v;
        recalc();
      });
    });
  }

  function bind() {
    bindInputs();
    var mat = $('utMat');
    if (mat) {
      mat.addEventListener('change', function () {
        state.material = mat.value;
        var m = E.material(state.material);
        if (m) { state.alpha = m.alpha; var ai = $('ut_alpha'); if (ai) ai.value = m.alpha; }
        recalc();
        flash('已切换材料（' + esc(m ? m.name : '') + '，c = ' + (m ? m.c : '—') + ' m/s，α 取该材料默认值）');
      });
    }
    var play = $('utPlay'); if (play) play.addEventListener('click', togglePlay);
    var load = $('utLoad'); if (load) load.addEventListener('click', loadPreset);
    var reset = $('utReset'); if (reset) reset.addEventListener('click', resetAll);
    var i;
    for (i = 0; i < PRESETS.length; i++) {
      (function (idx) {
        var btn = $('utP' + idx);
        if (btn) btn.addEventListener('click', function () { loadIdx(idx); });
      })(i);
    }
  }

  function flash(msg) {
    var el = $('utMsg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { if (el.textContent === msg) el.textContent = ''; }, 2200);
  }

  function loadPreset() {
    state = Object.assign({}, PRESET);
    syncInputs();
    recalc();
    flash('已载入例题（钢板 50 mm，中部 25 mm 缺陷）');
  }

  function loadIdx(idx) {
    var p = PRESETS[idx];
    if (!p) return;
    state = Object.assign({}, DEFAULTS, p.v, { gateUs: null, gateWUs: null });
    syncInputs();
    recalc();
    flash('已载入预设：' + p.label);
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    syncInputs();
    recalc();
    flash('已重置为默认参数');
  }

  function syncInputs() {
    var ms = $('utMat'); if (ms) ms.value = state.material;
    KEYS.forEach(function (k) {
      var el = $('ut_' + k);
      if (el) el.value = state[k] == null ? '' : state[k];
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function buildSkeleton() {
    var root = $('view-sim-ut');
    if (!root) return;

    var pHtml = '';
    for (var i = 0; i < PRESETS.length; i++) {
      pHtml += '<button id="utP' + i + '" class="btn ghost">' + esc(PRESETS[i].label) + '</button>';
    }

    root.innerHTML =
      '<div class="page-head"><h2>超声脉冲回波法测厚与探伤（A 扫描）模拟器</h2>' +
      '<p class="hint">超声探头发射脉冲进入工件，遇缺陷与底面反射返回，由往返时间 t 反算厚度 d = c·t/2：左图为 A 扫描波形（始波 / 缺陷波 / 底波），右图为工件剖面上的声束传播与 −6 dB 法定量演示。模型只含材料衰减与球面扩展，未含 DAC/TCG 与界面损失，仅供教学演示。</p></div>' +
      '<div class="split">' +
      '<div class="split-col">' +
      '<section class="card"><h3><span class="step">1</span> 输入参数</h3>' +
      '<div class="field-row">' +
      '<div class="field"><label class="f-label" for="utMat">材料（纵波声速）</label>' +
      '<select id="utMat" class="text-input"></select></div>' +
      '</div>' +
      '<div class="field-row" id="utInputs">' +
      field('fMHz', '频率 f', DEFAULTS.fMHz, 'MHz', 0.2, 0.5) +
      field('DMm', '晶片直径 D', DEFAULTS.DMm, 'mm', 1, 1) +
      field('dMm', '工件厚度 d', DEFAULTS.dMm, 'mm', 0.5, 1) +
      field('defectMm', '缺陷深度 d_f（留空=无缺陷）', DEFAULTS.defectMm, 'mm', 0.5, 1) +
      field('wMm', '缺陷尺寸 w（FWHM）', DEFAULTS.wMm, 'mm', 0.2, 0.5) +
      field('alpha', '衰减系数 α', DEFAULTS.alpha, 'dB/mm', 0, 0.005) +
      field('snr', '信噪比 SNR（留空=无噪声）', DEFAULTS.snr, 'dB', 10, 5) +
      field('refl', '缺陷反射系数 refl', DEFAULTS.refl, '', 0.05, 0.05) +
      field('gateUs', '闸门起点', '', 'µs', 0, 0.5) +
      field('gateWUs', '闸门宽度', '', 'µs', 0.5, 0.5) +
      '</div>' +
      '<div class="btn-row toolbar" style="margin-top:10px">' +
      '<button id="utLoad" class="btn">载入例题</button>' +
      '<button id="utReset" class="btn ghost">重置参数</button>' +
      '<span id="utMsg" class="aux-msg"></span></div>' +
      '<div class="btn-row toolbar" style="margin-top:6px">' + pHtml + '</div></section>' +
      '<section class="card"><h3><span class="step">2</span> A 扫描（时间/深度双刻度）</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<button id="utPlay" class="btn">暂停</button>' +
      '<span class="aux-msg">横轴下沿为时间 µs、上沿为对应深度 mm；纵轴为 RF 射频幅度（0 在中线）。黄色半透明块为闸门；三个回波各有独立配色，扫描线扫到时该回波被"激发"闪光。物理幅度极小（如 −41 dB），画面已按显示增益放大。</span></div>' +
      '<canvas class="canvas-wrap" id="utCanvas"></canvas></section>' +
      '</div>' +
      '<div class="split-col">' +
      '<section class="card"><h3>计算结果</h3><div id="utResult"></div></section>' +
      '<section class="card"><h3>工件剖面与 −6 dB 法定量</h3>' +
      '<div class="btn-row toolbar" style="margin-bottom:8px">' +
      '<span class="aux-msg">白灰色脉冲为发射下行波，琥珀色为缺陷反射波，青色为底面反射波；三者抵达探头的时刻分别对应 A 扫描上的始波 / 缺陷波 / 底波。底部曲线为探头横移时的回波幅度包络 A(x)，两条竖线标出 −6 dB 边界 ±w/2。</span></div>' +
      '<canvas class="canvas-wrap" id="utSection"></canvas></section>' +
      '</div>' +
      '</div>';
  }

  // 填充材料下拉（带声速显示）
  function fillMaterials() {
    var sel = $('utMat');
    if (!sel) return;
    var html = '';
    E.MATERIALS.forEach(function (m) {
      html += '<option value="' + esc(m.id) + '"' + (m.id === state.material ? ' selected' : '') + '>' +
        esc(m.name) + '（c = ' + m.c + ' m/s，α ≈ ' + m.alpha + ' dB/mm）</option>';
    });
    sel.innerHTML = html;
  }

  function init() {
    if (inited) return;
    buildSkeleton();
    fillMaterials();
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

  window.SimUtView = { init: init, onShow: onShow };
})(typeof window !== 'undefined' ? window : this);
