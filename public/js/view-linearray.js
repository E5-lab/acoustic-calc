/*
 * view-linearray.js — 线阵列覆盖与垂直指向性 视图（#/linearray）
 * 依赖 window.LineArray（内核）、window.MiniChart（曲线）。
 *
 * 五个子计算器：
 *   1) 覆盖几何与阵列规模（吊高 / 近远场距离 → 需要覆盖角、每节张角、箱体数）
 *   2) 逐箱张角与瞄准（等角 / J 形渐进曲率，输出逐箱瞄准角、落点距离）
 *   3) 垂直指向性与旁瓣（阵列因子 + 锥化 + 电子偏转，含栅瓣频率上限）
 *   4) 近场—远场过渡与声压衰减（柱面 −3 dB → 球面 −6 dB、阵列叠加增益）
 *   5) 梳状滤波与临界间距（相邻箱体干涉陷波、高频可用间距上限）
 */
(function () {
  'use strict';
  var A = window.LineArray;
  var Chart = window.MiniChart;

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function show(el, html, cls) {
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }
  function cssVar(n, f) {
    var v = window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue(n) : '';
    v = (v || '').trim();
    return v || f;
  }
  function hz(v) {
    if (v == null || !isFinite(v)) return '—';
    return v >= 10000 ? (v / 1000).toFixed(1) + ' kHz' : (v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : Math.round(v) + ' Hz');
  }

  /* ---------- 3) 垂直指向性图 ---------- */
  function drawDirectivity(af, st) {
    if (!Chart || !st) return;
    var xs = [], db = [];
    st.curve.forEach(function (p) { xs.push(-p.theta); db.push(p.db); });   // 横轴取俯角（向下为正）
    Chart.draw($('laDirChart'), {
      x: xs, yMin: -40, yMax: 3, yDigits: 0,
      xLabelFmt: function (v) {
        v = Math.round(v);
        return v === 0 ? '0°' : (v > 0 ? '↓' + v + '°' : '↑' + (-v) + '°');
      },
      hBands: [{ from: -6, to: 3, color: 'rgba(148,163,184,0.12)' }],
      series: [{ values: db, color: cssVar('--primary', '#2563eb'), width: 2.2, points: false }]
    });
  }

  /* ---------- 4) 声压—距离曲线 ---------- */
  function drawSpl(cv, marks) {
    if (!Chart) return;
    var series = [
      { values: cv.cyl, color: '#0d9488', width: 1.8, points: false, dash: [5, 4] },
      { values: cv.sph, color: '#f97316', width: 1.8, points: false, dash: [5, 4] }
    ];
    Chart.draw($('laNfChart'), {
      x: cv.r, xLog: true, yDigits: 0,
      xLabelFmt: function (v) { return (v >= 100 ? Math.round(v) : Number(v).toFixed(0)) + 'm'; },
      series: series
    });
  }

  function init() {
    if (init._d) return; init._d = true;

    /* ---------------- 1) 覆盖几何与阵列规模 ---------------- */
    $('laCovBtn').addEventListener('click', function () {
      var N = pf($('laCovN').value), bh = pf($('laCovBoxH').value);
      var L = (N > 0 && bh > 0) ? N * bh : 0;
      var r = A.coverageGeometry({
        hBottom: pf($('laCovH').value), arrayLen: L,
        dNear: pf($('laCovNear').value), dFar: pf($('laCovFar').value),
        boxCoverage: pf($('laCovBoxAng').value), N: N, splayMax: pf($('laCovMaxSplay').value)
      });
      if (!r) { show($('laCovOut'), '请填写阵列底高、近端与远端距离', 'warn'); return; }
      var perJointWarn = (r.splayPerJoint > 10) ? '　<span class="muted">单节张角偏大，HF 波导难以覆盖，建议增加箱数</span>' : '';
      show($('laCovOut'),
        '阵列长度 <b>' + fmt(r.arrayLen, 2) + ' m</b>，中心离耳高 <b>' + fmt(r.hCenter, 2) + ' m</b>' +
        '<br>近端俯角 <b>' + fmt(r.phiNear, 1) + '°</b>（' + fmt(r.dNear, 1) + ' m）　远端俯角 <b>' +
        fmt(r.phiFar, 1) + '°</b>（' + fmt(r.dFar, 1) + ' m）' +
        '<br>需要张开的覆盖角 <b>' + fmt(r.spread, 1) + '°</b>；含单箱 ' + fmt(r.boxCoverage, 0) +
        '° 覆盖后，阵列整体垂直覆盖 <b>' + fmt(r.totalCoverage, 1) + '°</b>' +
        '<br>按每节张角 ' + fmt(r.splayPerJoint, 2) + '° 分配（N−1 = ' + (N - 1) + ' 个接缝）' + perJointWarn +
        '<br>近远比 ' + fmt(r.distanceRatio, 1) + ' → 近远场声压差：近场（柱面）' + fmt(r.spreadDbCyl, 1) +
        ' dB / 远场（球面）' + fmt(r.spreadDbSph, 1) + ' dB' +
        (r.boxesForMaxSplay ? '<br>若每节张角不超过 ' + fmt(A.num($('laCovMaxSplay').value, 0), 1) +
          '°，至少需要 <b>' + r.boxesForMaxSplay + ' 只</b>箱体' : ''),
        'ok');
    });

    /* ---------------- 2) 逐箱张角与瞄准 ---------------- */
    $('laSpBtn').addEventListener('click', function () {
      var N = pf($('laSpN').value);
      if (!(N >= 1)) { show($('laSpOut'), '请填写箱体数', 'warn'); return; }
      var r = A.splayPlan({
        N: N, phiNear: pf($('laSpNear').value), phiFar: pf($('laSpFar').value),
        q: pf($('laSpQ').value), hBottom: pf($('laSpH').value), boxH: pf($('laSpBoxH').value)
      });
      var rows = r.boxes.map(function (b) {
        return '<tr><td>' + (b.index === 1 ? '顶箱' : (b.index === r.N ? '底箱' : '第 ' + b.index)) + '</td>' +
          '<td>' + fmt(b.aim, 2) + '</td>' +
          '<td>' + (b.splay == null ? '—' : fmt(b.splay, 2)) + '</td>' +
          '<td>' + fmt(b.height, 2) + '</td>' +
          '<td>' + fmt(b.distance, 1) + '</td></tr>';
      }).join('');
      show($('laSpOut'),
        '总张角 <b>' + fmt(r.total, 1) + '°</b>　曲率系数 q = ' + fmt(r.q, 2) +
        '　单节张角 ' + fmt(r.splayMin, 2) + '° ~ ' + fmt(r.splayMax, 2) + '°' +
        '<div class="table-wrap"><table class="detail-table wide"><caption>自上而下（第 1 只为顶箱，打最远）</caption>' +
        '<thead><tr><th>箱体</th><th>瞄准俯角 °</th><th>与上一箱张角 °</th><th>中心高 m</th><th>落点距离 m</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<span class="muted">q = 1 等角分配；q &gt; 1 为 J 形（顶部张角小、底部张角大，能量偏向远场）。落点距离按箱体中心高 / tan(瞄准角) 估算。</span>',
        'ok');
    });

    /* ---------------- 3) 垂直指向性与旁瓣 ---------------- */
    function syncTaper() {
      $('laDirFloorRow').style.display = $('laDirTaper').value === 'uniform' ? 'none' : '';
    }
    $('laDirTaper').addEventListener('change', syncTaper);
    syncTaper();

    $('laDirBtn').addEventListener('click', function () {
      var N = pf($('laDirN').value), d = pf($('laDirD').value), f = pf($('laDirF').value);
      if (!(N >= 1) || !(d > 0) || !(f > 0)) { show($('laDirOut'), '请填写箱数、箱间距与频率', 'warn'); return; }
      var kind = $('laDirTaper').value;
      var tp = kind === 'uniform' ? null : A.taper(N, kind, pf($('laDirFloor').value));
      var steerDown = A.num($('laDirSteer').value, 0);          // 俯角（向下为正）
      var af = A.arrayFactor({ N: N, d: d, f: f, steer: -steerDown, taper: tp });
      var st = A.lobeStats(af);
      if (!st) { show($('laDirOut'), '计算失败', 'warn'); return; }
      var gf = A.gratingLimit({ d: d, thetaMax: 90 });
      var dmax = A.maxSpacing({ f: f, thetaMax: 90 });
      var over = (f > gf) ? '　<span class="muted">当前频率已超过上限，覆盖区外会出现栅瓣</span>' : '';
      show($('laDirOut'),
        '波长 ' + fmt(af.wavelength, 3) + ' m，阵列孔径 ' + fmt(N * d, 2) + ' m' +
        '<br>主瓣指向 <b>' + fmt(-st.peakDeg, 1) + '° 俯角</b>　−6 dB 覆盖角 <b>' + fmt(st.beamwidth6, 1) + '°</b>' +
        '<br>第一零点 ' + fmt(-st.nullHigh, 1) + '° / ' + fmt(-st.nullLow, 1) + '°（俯角）' +
        '<br>第一旁瓣 ' + (st.sidelobe ? '<b>' + fmt(st.sidelobe.rel, 1) + ' dB</b>（位于俯角 ' +
          fmt(-st.sidelobe.theta, 1) + '°）' : '—（阵列过短）') +
        '<br>全空间无栅瓣频率上限 <b>' + hz(gf) + '</b>' + over +
        '<br>该频率下允许的最大箱间距 <b>' + fmt(dmax * 1000, 1) + ' mm</b>（当前 ' + fmt(d * 1000, 0) + ' mm）' +
        '<br>电子偏转 ' + fmt(steerDown, 1) + '° 需相邻单元延时 <b>' + fmt(A.steerDelay({ d: d, steer: steerDown }), 3) + ' ms</b>' +
        '<br><span class="muted">张角（机械）负责覆盖，延时（电子）负责微调指向；间距 &gt; λ/2 是高频栅瓣的根源。</span>',
        'ok');
      drawDirectivity(af, st);
    });

    /* ---------------- 4) 近场 / 远场与衰减 ---------------- */
    $('laNfBtn').addEventListener('click', function () {
      var L = pf($('laNfL').value), f = pf($('laNfF').value);
      if (!(L > 0) || !(f > 0)) { show($('laNfOut'), '请填写阵列长度与频率', 'warn'); return; }
      var nf = A.nearFar({ L: L, f: f });
      var rRef = A.num($('laNfRref').value, 1), splRef = A.num($('laNfSpl').value, 100);
      var r = A.num($('laNfR').value, 10);
      var N = A.num($('laNfN').value, 1);
      var zone = r < nf.rCyl ? '柱面波区（−3 dB/倍程）' : (r > nf.rSph ? '球面波区（−6 dB/倍程）' : '过渡区');
      var cyl = A.splAt({ splRef: splRef, rRef: rRef, r: r, mode: 'cyl' });
      var sph = A.splAt({ splRef: splRef, rRef: rRef, r: r, mode: 'sph' });
      var g = A.arrayGain(N);
      var rMax = Math.max(r * 1.6, nf.rSph * 1.2, 20);
      var cv = A.splCurve({ splRef: splRef, rRef: rRef, rFrom: Math.max(1, rRef), rTo: rMax, n: 60 });
      show($('laNfOut'),
        '过渡距离：<b>' + fmt(nf.rCyl, 1) + ' m</b>（路程差 λ/4，柱面区边界）　<b>' + fmt(nf.rSph, 1) +
        ' m</b>（路程差 λ/8，此后按球面波）' +
        '<br>目标距离 ' + fmt(r, 1) + ' m 位于 <b>' + zone + '</b>' +
        '<br>该处声压：柱面模型 <b>' + fmt(cyl, 1) + ' dB</b>　球面模型 <b>' + fmt(sph, 1) + ' dB</b>（差 ' +
        fmt(cyl - sph, 1) + ' dB）' +
        '<br>' + N + ' 只箱体叠加：低频相干 <b>+' + fmt(g.coherent, 1) + ' dB</b>，高频非相干 <b>+' +
        fmt(g.incoherent, 1) + ' dB</b>' +
        '<br><span class="muted">线阵列的价值就在把 −6 dB/倍程拉成 −3 dB/倍程；超过 rSph 后这一优势消失，需靠阵列弯曲与延时补。</span>',
        'ok');
      drawSpl(cv);
    });

    /* ---------------- 5) 梳状滤波与临界间距 ---------------- */
    $('laCbBtn').addEventListener('click', function () {
      var d = pf($('laCbD').value), th = pf($('laCbTheta').value), n = pf($('laCbN').value);
      var fMax = pf($('laCbFmax').value);
      if (!(d > 0)) { show($('laCbOut'), '请填写相邻声源间距', 'warn'); return; }
      var cb = A.comb({ d: d, theta: th, n: n || 3 });
      var lines = [];
      lines.push('间距 <b>' + fmt(d * 1000, 0) + ' mm</b>，偏角 ' + fmt(th, 0) + '° → 路程差 ' +
        (cb ? fmt(cb.pathDiff * 1000, 1) + ' mm' : '0（正对，无路程差）'));
      if (cb) {
        lines.push('梳状陷波：<b>' + cb.freqs.map(function (v) { return hz(v); }).join('　') + '</b>（间隔 ' + hz(cb.spacing) + '）');
      } else {
        lines.push('正对轴线（0°）路程差为 0，不产生梳状滤波；偏离轴线的听众多落在 20°~60°，务必按最不利偏角核算。');
      }
      if (fMax > 0) {
        var cs = A.combSpacing({ f: fMax, theta: th });
        var half = A.C0 / (2 * fMax);
        lines.push('若要求 ' + hz(fMax) + ' 以下无带内陷波：偏角 ' + fmt(th, 0) + '° 时最大间距 <b>' +
          fmt(cs.dMax * 1000, 1) + ' mm</b>（全空间 λ/2 = ' + fmt(half * 1000, 1) + ' mm）');
      }
      lines.push('<span class="muted">高频波长短、箱体尺寸却固定，因此线阵列在 2 kHz 以上必然进入「箱体各自为政」的干涉区，只能靠波导耦合或减小间距缓解。</span>');
      show($('laCbOut'), lines.join('<br>'), cb ? 'ok' : 'warn');
    });
  }

  window.LineArrayView = { init: init, onShow: function () {} };
})();
