/*
 * view-speakerbox.js — 扬声器箱体设计 视图（#/speakerbox）
 * 依赖 window.SpeakerBox（内核）、window.MiniChart（曲线）。
 *
 * 五个子计算器：
 *   1) T/S 参数与 Vas（Vas 正算 / 附加质量法 / 阻抗峰法求 Q / 灵敏度）
 *   2) 封闭箱设计（按容积或按目标 Qtc → fc / Qtc / f3 / 隆起 + 响应曲线）
 *   3) 倒相箱设计（Small 四阶系统函数 → f3 / 纹波 / 对齐类型 + 响应与群延迟）
 *   4) 导风管设计（求管长 / 正算调谐频率 / 端口风速校核）
 *   5) 箱体尺寸与净容积
 */
(function () {
  'use strict';
  var S = window.SpeakerBox;
  var Chart = window.MiniChart;

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) {
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function cssVar(n, f) {
    var v = window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue(n) : '';
    v = (v || '').trim();
    return v || f;
  }
  function chartFreqs(lo, hi, n) {
    var a = [];
    for (var i = 0; i <= n; i++) a.push(lo * Math.pow(hi / lo, i / n));
    return a;
  }
  var FREQS = chartFreqs(20, 500, 96);

  function init() {
    if (init._d) return; init._d = true;

    /* ---------------- 1) T/S 参数与 Vas ---------------- */
    $('sbVasBtn').addEventListener('click', function () {
      var vas = S.vasFromTS({ Fs: pf($('sbVasFs').value), Mms: pf($('sbVasMms').value), Sd: pf($('sbVasSd').value) });
      if (vas == null) { show($('sbVasOut'), '请填写 Fs、Mms、Sd 三个正数', 'warn'); return; }
      show($('sbVasOut'), '等效容积 <b>Vas = ' + fmt(vas, 2) + ' L</b>' +
        '　（Vas = ρc²·Sd²/(Mms·ωs²)，Sd = ' + fmt(pf($('sbVasSd').value), 1) + ' cm²）', 'ok');
    });

    $('sbAddBtn').addEventListener('click', function () {
      var mms = S.mmsFromAddedMass({
        Fs: pf($('sbAddFs').value), Fm: pf($('sbAddFm').value), addedMass: pf($('sbAddM').value)
      });
      if (mms == null) { show($('sbAddOut'), '附加质量后谐振频率必须低于自由场 Fs', 'warn'); return; }
      var sd = pf($('sbAddSd').value);
      var vas = sd ? S.vasFromTS({ Fs: pf($('sbAddFs').value), Mms: mms, Sd: sd }) : null;
      show($('sbAddOut'), '振动系统质量 <b>Mms = ' + fmt(mms, 2) + ' g</b>' +
        (vas ? '　→　Vas = <b>' + fmt(vas, 2) + ' L</b>' : '　（填入 Sd 可继续求 Vas）') +
        '<br><span class="muted">Mms = ΔM /[(Fs/Fm)² − 1]，附加质量法</span>', 'ok');
    });

    $('sbZBtn').addEventListener('click', function () {
      var q = S.qFromImpedance({
        Re: pf($('sbZRe').value), Zmax: pf($('sbZZmax').value), Fs: pf($('sbZFs').value),
        F1: pf($('sbZF1').value), F2: pf($('sbZF2').value)
      });
      if (!q) { show($('sbZOut'), '需满足 Zmax &gt; Re、F2 &gt; F1，且各项为正数', 'warn'); return; }
      show($('sbZOut'),
        'Qms = <b>' + fmt(q.Qms, 3) + '</b>　Qes = <b>' + fmt(q.Qes, 3) + '</b>　Qts = <b>' + fmt(q.Qts, 3) + '</b>' +
        '<br><span class="muted">阻抗峰比 R₀ = Zmax/Re = ' + fmt(q.R0, 2) + '，半功率带宽 = ' + fmt(q.bw, 2) + ' Hz</span>', 'ok');
    });

    $('sbSensBtn').addEventListener('click', function () {
      var s = S.sensitivity({ Fs: pf($('sbSensFs').value), Vas: pf($('sbSensVas').value), Qes: pf($('sbSensQes').value) });
      if (!s) { show($('sbSensOut'), '请填写 Fs、Vas、Qes 三个正数', 'warn'); return; }
      show($('sbSensOut'),
        '参考效率 η₀ = <b>' + fmt(s.eta * 100, 3) + ' %</b>　' +
        '灵敏度 <b>' + fmt(s.halfSpace, 1) + ' dB</b>（1 W / 1 m，半空间）' +
        '　/ ' + fmt(s.fullSpace, 1) + ' dB（全空间）' +
        '<br><span class="muted">η₀ = 4π²/c³ · Fs³·Vas/Qes；1% 参考效率 ≈ 92 dB/W/m</span>', 'ok');
    });

    /* ---------------- 2) 封闭箱设计 ---------------- */
    function drawClosed(r) {
      if (!Chart) return;
      Chart.draw($('sbCbChart'), {
        x: FREQS, xLog: true, yMin: -30, yMax: 8, yDigits: 0,
        xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)); },
        hBands: [{ from: -3, to: 8, color: 'rgba(148,163,184,0.10)' }],
        series: [{
          values: FREQS.map(function (f) { return r.response(f); }),
          color: cssVar('--primary', '#2563eb'), width: 2, points: false
        }]
      });
    }
    $('sbCbBtn').addEventListener('click', function () {
      var mode = $('sbCbMode').value;
      var r = S.closedBox({
        Vas: pf($('sbCbVas').value), Fs: pf($('sbCbFs').value), Qts: pf($('sbCbQts').value),
        Vb: mode === 'vb' ? pf($('sbCbVb').value) : null,
        Qtc: mode === 'qtc' ? pf($('sbCbQtc').value) : null
      });
      if (!r.ok) { show($('sbCbOut'), '计算失败：' + r.error, 'warn'); return; }
      var peak = r.peakDb > 0.1
        ? '低频隆起 <b>' + fmt(r.peakDb, 2) + ' dB</b> @ ' + fmt(r.fp, 1) + ' Hz'
        : '通带无隆起';
      show($('sbCbOut'),
        '箱体容积 Vb = <b>' + fmt(r.Vb, 2) + ' L</b>' + (r.VbComputed ? '（由目标 Qtc 反算）' : '') +
        '　α = Vas/Vb = ' + fmt(r.alpha, 3) +
        '<br>系统谐振 fc = <b>' + fmt(r.fc, 1) + ' Hz</b>　Qtc = <b>' + fmt(r.Qtc, 3) + '</b>' +
        '　−3 dB 频率 f3 = <b>' + fmt(r.f3, 1) + ' Hz</b>' +
        '<br>' + peak + '　（−10 dB 点 ' + fmt(r.f10, 1) + ' Hz）' +
        '<br><span class="muted">' + (r.Qtc >= 0.5 && r.Qtc <= 0.72
          ? 'Qtc ≈ 0.7 为最平坦（巴特沃斯）；Qtc &lt; 0.5 偏过阻尼，瞬态好但低频薄'
          : r.Qtc > 0.72 ? 'Qtc &gt; 0.72 有低频隆起，听感宽松但瞬态变差' : 'Qtc &lt; 0.5 明显过阻尼') + '</span>', 'ok');
      drawClosed(r);
    });

    /* ---------------- 3) 倒相箱设计 ---------------- */
    function drawVented(r) {
      if (!Chart) return;
      Chart.draw($('sbVbChart'), {
        x: FREQS, xLog: true, yMin: -30, yMax: 8, yDigits: 0,
        xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)); },
        hBands: [{ from: -3, to: 8, color: 'rgba(148,163,184,0.10)' }],
        series: [{
          values: FREQS.map(function (f) { return r.spl(f); }),
          color: cssVar('--primary', '#2563eb'), width: 2, points: false
        }]
      });
      var gds = FREQS.map(function (f) { return r.groupDelay(f); });
      Chart.draw($('sbVbGdChart'), {
        x: FREQS, xLog: true, yMin: 0, yDigits: 1,
        xLabelFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v)); },
        series: [{ values: gds, color: '#f97316', width: 2, points: false }]
      });
    }
    $('sbVbBtn').addEventListener('click', function () {
      var Vas = pf($('sbVbVas').value), Fs = pf($('sbVbFs').value);
      var Qts = pf($('sbVbQts').value), Vb = pf($('sbVbVb').value);
      var Ql = pf($('sbVbQl').value);
      var auto = $('sbVbFbMode').value === 'auto';
      var Fb = auto ? null : pf($('sbVbFb').value);

      if (auto) {
        var bt = S.bestTuning({ Vas: Vas, Fs: Fs, Qts: Qts, Vb: Vb, Ql: Ql });
        if (!bt) { show($('sbVbOut'), '请填写 Vas、Fs、Qts、Vb', 'warn'); return; }
        Fb = bt.Fb;
        $('sbVbFb').value = bt.Fb.toFixed(2);
      }
      var r = S.ventedBox({ Vas: Vas, Fs: Fs, Qts: Qts, Vb: Vb, Fb: Fb, Ql: Ql });
      if (!r.ok) { show($('sbVbOut'), '计算失败：' + r.error, 'warn'); return; }

      var gdFb = r.groupDelay(Fb), gdMax = 0, gdMaxF = 0;
      FREQS.forEach(function (f) {
        var g = r.groupDelay(f);
        if (g > gdMax) { gdMax = g; gdMaxF = f; }
      });

      show($('sbVbOut'),
        '调谐频率 Fb = <b>' + fmt(Fb, 2) + ' Hz</b>' + (auto ? '（最平坦自动求解）' : '') +
        '　α = Vas/Vb = ' + fmt(r.alpha, 3) +
        '<br>−3 dB 频率 f3 = <b>' + fmt(r.f3, 1) + ' Hz</b>' +
        '　通带纹波 ' + fmt(r.ripple, 2) + ' dB' +
        '<br>对齐类型：<b>' + r.alignment.name + '</b>' +
        '<br>群延迟：@Fb ' + fmt(gdFb, 2) + ' ms，峰值 <b>' + fmt(gdMax, 2) + ' ms</b> @ ' + fmt(gdMaxF, 1) + ' Hz' +
        '<br><span class="muted">箱损 Ql = ' + fmt(r.Ql, 1) +
        '（未填默认 7）；有限 Ql 会使 f₀ 附近下陷、f3 上移，这是实测与理论不符的常见原因</span>', 'ok');
      drawVented(r);
      $('sbVbFb').value = Fb.toFixed(2);
    });

    /* ---------------- 4) 导风管设计 ---------------- */
    function portRecalc() {
      var mode = $('sbPortMode').value;
      ['sbPortFb', 'sbPortVb', 'sbPortD', 'sbPortL', 'sbPortSpl'].forEach(function (id) {
        var f = $(id);
        if (f) f.disabled = false;
      });
      if (mode === 'length') { $('sbPortVb').disabled = true; }
      if (mode === 'tuning') { $('sbPortFb').disabled = true; }
      if (mode === 'velocity') { $('sbPortVb').disabled = true; $('sbPortL').disabled = true; }
    }
    $('sbPortMode').addEventListener('change', portRecalc);
    portRecalc();

    $('sbPortBtn').addEventListener('click', function () {
      var mode = $('sbPortMode').value;
      var ends = $('sbPortEnds').value;
      if (mode === 'length') {
        var pl = S.portLength({ Fb: pf($('sbPortFb').value), Vb: pf($('sbPortVb').value), D: pf($('sbPortD').value), ends: ends });
        if (!pl) { show($('sbPortOut'), '请填写 Fb、Vb、管径 D', 'warn'); return; }
        if (pl.shortest) { show($('sbPortOut'), '端修正已超过所需有效长度，该管径对当前 Vb 过大，请减小管径或降低 Fb', 'warn'); return; }
        show($('sbPortOut'),
          '物理管长 <b>L = ' + fmt(pl.L, 2) + ' cm</b>' +
          '　（有效长度 Leff = ' + fmt(pl.Leff, 2) + ' cm − 端修正 ' + fmt(pl.delta, 2) + ' cm）' +
          '<br>管内截面 ' + fmt(pl.area, 2) + ' cm²；端修正系数 k = ' + pl.endsK + '（一端有障板 + 一端自由）' +
          '<br><span class="muted">Leff = c²S/((2πFb)²Vb)</span>', 'ok');
      } else if (mode === 'tuning') {
        var fb = S.portTuning({ L: pf($('sbPortL').value), Vb: pf($('sbPortVb').value), D: pf($('sbPortD').value), ends: ends });
        if (fb == null) { show($('sbPortOut'), '请填写管长 L、Vb、管径 D', 'warn'); return; }
        show($('sbPortOut'), '该管长对应的调谐频率 <b>Fb = ' + fmt(fb, 2) + ' Hz</b>', 'ok');
      } else {
        var pv = S.portVelocity({
          Fb: pf($('sbPortFb').value), D: pf($('sbPortD').value),
          spl: pf($('sbPortSpl').value) == null ? 100 : pf($('sbPortSpl').value), r: 1
        });
        if (!pv) { show($('sbPortOut'), '请填写 Fb 与管径 D', 'warn'); return; }
        show($('sbPortOut'),
          '端口峰值风速 <b>' + fmt(pv.vPeak, 2) + ' m/s</b>（' + fmt(pv.vRms, 2) + ' m/s rms，马赫数 ' + fmt(pv.mach, 3) + '）' +
          '<br>评价：<b>' + pv.level + '</b>' +
          '<br><span class="muted">按 1 m 处 100 dB 半空间输出反算；经验阈值：≤12 m/s 优秀，18 m/s 以内可接受，&gt;25 m/s 必须改设计</span>', 'ok');
      }
    });

    /* ---------------- 5) 箱体尺寸与净容积 ---------------- */
    $('sbBoxBtn').addEventListener('click', function () {
      var sel = $('sbBoxRatio');
      var ratio = sel.value.split(',').map(parseFloat);
      var bd = S.boxDims({ Vb: pf($('sbBoxVb').value), ratio: ratio });
      if (!bd) { show($('sbBoxOut'), '请填写正的内部净容积', 'warn'); return; }
      show($('sbBoxOut'),
        '内部净尺寸 <b>' + fmt(bd.cm[0], 1) + ' × ' + fmt(bd.cm[1], 1) + ' × ' + fmt(bd.cm[2], 1) + ' cm</b>' +
        '（宽 × 高 × 深，比例 ' + bd.ratioText + '）' +
        '<br><span class="muted">按三分频箱估算，建议再加 18~25 mm 板厚与内衬吸声棉；三边比互为无理数可抑制驻波重叠</span>', 'ok');
    });

    $('sbNetBtn').addEventListener('click', function () {
      var nv = S.netVolume({
        gross: pf($('sbNetGross').value), driver: pf($('sbNetDriver').value) || 0,
        port: pf($('sbNetPort').value) || 0, brace: pf($('sbNetBrace').value) || 0,
        fillPct: pf($('sbNetFill').value) || 0
      });
      if (!nv) { show($('sbNetOut'), '请填写毛容积', 'warn'); return; }
      show($('sbNetOut'),
        '内部净容积 <b>' + fmt(nv.net, 2) + ' L</b>' +
        '　（扣除单元/倒相管/加强筋共 ' + fmt(nv.displaced, 2) + ' L，填充等效增益 ' + fmt(nv.fillGain, 2) + ' L）' +
        '<br><span class="muted">吸声棉可使等效容积增加约 5%~15%（视填充密度与位置）</span>', 'ok');
    });
  }

  window.SpeakerBoxView = { init: init, onShow: function () {} };
})();
