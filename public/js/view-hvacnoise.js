/*
 * view-hvacnoise.js — 设备与管道声学 视图（#/hvacnoise）
 * 依赖 window.HvacNoise（内核）。
 *
 * 四个子计算器：
 *   1) 设备声功率 → 房间声压级（17 频带）
 *   2) 风管路径衰减（直管/弯头/末端反射逐频带叠加 → 出口 Lw → 房间声压级）
 *   3) 风管元件传声损失（直管 / 弯头 / 末端反射）
 *   4) 声功率测定 ISO 3744 / 3746（6 倍频带 + 测量面 + 背景/环境修正）
 */
(function () {
  'use strict';
  var H = window.HvacNoise;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }
  function toNums(s) { return (s || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); }); }
  function pos(v) { var n = parseFloat(v); return (isNaN(n) || n <= 0) ? 0 : n; }

  var GRID = H.GRID_HZ;
  var SHOW = [125, 250, 500, 1000, 2000, 4000]; // 代表频带

  // 代表频带摘要（数组版）
  function bandsStr(freqs, vals) {
    var out = [];
    for (var i = 0; i < freqs.length; i++) {
      if (SHOW.indexOf(freqs[i]) >= 0 && vals[i] != null && isFinite(vals[i])) {
        out.push(freqs[i] + ': ' + fmt(vals[i], 1));
      }
    }
    return out.join('　');
  }

  function init() {
    if (init._d) return; init._d = true;

    /* 1) 设备噪声 → 房间声压级 */
    $('hnDevBtn').addEventListener('click', function () {
      var lw = toNums($('hnLw').value);
      if (lw.length !== GRID.length) {
        show($('hnDevOut'), '声功率谱需为 ' + GRID.length + ' 个频带值（当前 ' + lw.length + ' 个）', 'warn');
        return;
      }
      var r = H.equipmentSPL({ Lw: lw, bands: GRID, R: $('hnR').value, Q: $('hnQ').value, r: $('hnDist').value });
      if (!r.ok) { show($('hnDevOut'), '计算失败：' + r.error, 'warn'); return; }
      show($('hnDevOut'),
        '总 A 声级 <b>' + fmt(r.overallA, 1) + ' dB(A)</b>　（Q = ' + r.Q + '，r = ' + r.r + ' m，R = ' + fmt(r.R, 1) + ' m²）' +
        '<br><span class="muted">Lp @ ' + bandsStr(r.bands, r.spectrum.map(function (p) { return p.Lp; })) + ' Hz</span>', 'ok');
    });

    /* 2) 风管路径衰减 */
    $('hnPathBtn').addEventListener('click', function () {
      var lw = toNums($('hnPathLw').value);
      if (lw.length !== GRID.length) {
        show($('hnPathOut'), '入口声功率谱需为 ' + GRID.length + ' 个频带值（当前 ' + lw.length + ' 个）', 'warn');
        return;
      }
      var segs = [];
      var L = pos($('hnSegL').value), rate = parseFloat($('hnSegRate').value);
      if (L > 0 && !isNaN(rate) && rate >= 0) segs.push({ type: 'straight', L: L, ratePerM: rate });
      var w = pos($('hnElbowW').value);
      if (w > 0) segs.push({ type: 'elbow', width: w });
      var d = pos($('hnEndD').value);
      if (d > 0) segs.push({ type: 'end', diameter: d, flanged: $('hnEndFlanged').value === 'yes' });
      if (!segs.length) { show($('hnPathOut'), '请至少填写一段直管、一个弯头或一个风口出口', 'warn'); return; }

      var p = H.ductPath({
        Lw: lw, bands: GRID, segments: segs,
        R: $('hnPathR').value, Q: $('hnPathQ').value, r: $('hnPathDist').value
      });
      if (!p.ok) { show($('hnPathOut'), '计算失败：' + p.error, 'warn'); return; }

      var html = '管段 <b>' + segs.length + '</b> 节　逐频带 TL @ ' +
        bandsStr(p.bands, p.tlSpectrum) + ' dB' +
        '<br>出口 Lw @ ' + bandsStr(p.bands, p.outletLw) + ' dB';
      if (p.room) {
        var inA = H.overallA(lw);
        html += '<br>房间总 A 声级 <b>' + fmt(p.room.overallA, 1) + ' dB(A)</b>' +
          '（入口 ' + fmt(inA, 1) + ' dB(A)，管系总衰减 ' + fmt(inA - p.room.overallA, 1) + ' dB）';
      } else {
        html += '<br><span class="muted">未提供接收房间参数，仅给出出口声功率级</span>';
      }
      show($('hnPathOut'), html, 'ok');
    });

    /* 3) 风管元件传声损失 */
    $('hnTL1Btn').addEventListener('click', function () {
      var tl = H.straightDuctTL({ L: $('hnTL_L').value, ratePerM: $('hnTL_Rate').value });
      if (tl == null) { show($('hnTL1Out'), '请填写有效的直管长度与衰减率', 'warn'); return; }
      show($('hnTL1Out'), '直管 TL = <b>' + fmt(tl, 1) + ' dB</b>', 'ok');
    });

    $('hnTL2Btn').addEventListener('click', function () {
      var f = pos($('hnTL_F').value), w = pos($('hnTL_W').value);
      if (!f || !w) { show($('hnTL2Out'), '请填写频率与弯头管宽', 'warn'); return; }
      var tl = H.elbowTL({ freq: f, width: w });
      var fc = H.C0 / (2 * w);
      if (tl === 0) {
        show($('hnTL2Out'), '弯头 TL = <b>0 dB</b>（频率低于管宽对应截止频率 fc ≈ ' + fmt(fc, 0) + ' Hz，无声衰减）', 'warn');
      } else {
        show($('hnTL2Out'), '弯头 TL = <b>' + fmt(tl, 1) + ' dB</b>（截止频率 fc ≈ ' + fmt(fc, 0) + ' Hz，' + fmt(f, 0) + ' Hz 处）', 'ok');
      }
    });

    $('hnTL3Btn').addEventListener('click', function () {
      var f = pos($('hnTL_F2').value), d = pos($('hnTL_D').value);
      if (!f || !d) { show($('hnTL3Out'), '请填写频率与出口直径', 'warn'); return; }
      var tl = H.endReflectionTL({ freq: f, diameter: d, flanged: $('hnTL_Flanged').value === 'yes' });
      if (tl == null) { show($('hnTL3Out'), '参数无效', 'warn'); return; }
      show($('hnTL3Out'), '末端反射损失 TL = <b>' + fmt(tl, 1) + ' dB</b>' +
        '（' + ($('hnTL_Flanged').value === 'yes' ? '设法兰' : '无法兰') + '，' + fmt(f, 0) + ' Hz）', 'ok');
    });

    /* 4) 声功率测定 ISO 3744 / 3746 */
    $('hnSwBtn').addEventListener('click', function () {
      var lp = toNums($('hnSwLp').value);
      if (lp.length !== H.OCT_HZ.length) {
        show($('hnSwOut'), '请填入 ' + H.OCT_HZ.length + ' 个倍频带平均声压级（当前 ' + lp.length + ' 个）', 'warn');
        return;
      }
      var r = H.soundPowerISO({
        LpMean: lp, bands: H.OCT_HZ,
        S: $('hnSwS').value, K1: $('hnSwK1').value, K2: $('hnSwK2').value
      });
      if (!r.ok) { show($('hnSwOut'), '计算失败：' + r.error, 'warn'); return; }
      var pts = r.spectrum.map(function (p) { return p.f + ': ' + fmt(p.Lw, 1); }).join('　');
      show($('hnSwOut'), '总声功率级 <b>Lw = ' + fmt(r.overallLw, 1) + ' dB</b>　（' + r.method +
        '，S = ' + fmt(r.S, 2) + ' m²，K₁ + K₂ = ' + fmt(r.K1 + r.K2, 1) + ' dB）' +
        '<br><span class="muted">Lw @ ' + pts + ' Hz</span>', 'ok');
    });
  }

  window.HvacNoiseView = { init: init, onShow: function () {} };
})();
