/*
 * view-pasystem.js — 电声与语言清晰度 视图（#/pasystem）
 * 依赖 window.PaSystem（内核）。
 *
 * 四个子计算器：
 *   1) 覆盖与声压级：临界距离 / D/R / 指定距离声压级 / 目标差
 *   2) 增益与反馈：可用增益 vs 所需增益（声反馈稳定性）
 *   3) STIPA 预测：7 倍频带 × 2 调制频率，信噪比 + 混响联合
 *   4) 扬声器电功率：灵敏度法反算
 */
(function () {
  'use strict';
  var P = window.PaSystem;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }
  function toNums(s) { return (s || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); }); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  function init() {
    if (init._d) return; init._d = true;

    /* 1) 覆盖与声压级 */
    $('paCovBtn').addEventListener('click', function () {
      var lw = toNums($('paLw').value);
      if (lw.length < 6) { show($('paCovOut'), '声功率谱需为 6 个倍频带值（125–4000 Hz，当前 ' + lw.length + ' 个）', 'warn'); return; }
      var r = P.splAt({ Lw: lw[3], Q: $('paQ').value, R: $('paR').value, r: $('paDist').value });
      if (!r.ok) { show($('paCovOut'), '计算失败：' + r.error, 'warn'); return; }
      var target = pf($('paTarget').value);
      var verdict = r.r < r.rc
        ? '测点位于临界距离以内（r < rc），<b>直达声占优</b>，覆盖清晰、受房间影响小'
        : '测点位于临界距离以外（r > rc），<b>混响声占优</b>，清晰度下降，宜增加指向性 Q 或缩短距离';
      var html = '1 kHz 声压级 <b>' + fmt(r.lp, 1) + ' dB</b>（直达 ' + fmt(r.direct, 1) + ' / 混响 ' + fmt(r.reverb, 1) + '）' +
        '<br>临界距离 rc ≈ <b>' + fmt(r.rc, 1) + ' m</b>　D/R = ' + fmt(r.dr, 2) + '<br>' + verdict;
      if (target != null) {
        var d = r.lp - target;
        html += '<br>与目标 ' + fmt(target, 1) + ' dB 相差 <b>' + (d >= 0 ? '+' : '') + fmt(d, 1) + ' dB</b>' +
          (d >= -3 ? '（满足覆盖需求）' : '（不足，需提高声功率或调整布局）');
      }
      show($('paCovOut'), html, 'ok');
    });

    /* 2) 增益与反馈 */
    $('paGainBtn').addEventListener('click', function () {
      var rc = P.criticalDistance($('paQ2').value, $('paR2').value);
      if (rc == null) { show($('paGainOut'), '请填写有效的指向性因数 Q 与房间常数 R', 'warn'); return; }
      var ug = P.usableGain({ rc: rc, rMic: $('paMic').value, nom: $('paNom').value, margin: $('paMargin').value });
      if (!ug) { show($('paGainOut'), '请填写话筒至扬声器距离', 'warn'); return; }
      var need = P.neededGain({ LpListenerReq: $('paNeed').value, LpTalker: $('paTalker').value });
      if (need == null) { show($('paGainOut'), '请填写听众所需声压级与讲话人声压级', 'warn'); return; }
      var margin = ug.gain - need;
      show($('paGainOut'),
        '临界距离 rc ≈ <b>' + fmt(rc, 1) + ' m</b>（Q = ' + fmt(pf($('paQ2').value), 1) + '，R = ' + fmt(pf($('paR2').value), 1) + ' m²）' +
        '<br>系统可用增益 ≈ <b>' + fmt(ug.gain, 1) + ' dB</b>（话筒距 ' + fmt(ug.rMic, 1) + ' m，开放话筒 ' + ug.nom + ' 支，稳定裕量 ' + ug.margin + ' dB）' +
        '<br>所需电声增益 ≈ <b>' + fmt(need, 1) + ' dB</b>（听众 ' + fmt(pf($('paNeed').value), 1) + ' dB − 讲话人 ' + fmt(pf($('paTalker').value), 1) + ' dB）' +
        '<br>增益裕量 <b>' + (margin >= 0 ? '+' : '') + fmt(margin, 1) + ' dB</b>　' +
        (margin >= 6 ? '余量充足，系统不易啸叫' : margin >= 0 ? '余量偏小，建议压缩开放话筒数或缩短话筒-扬声器距离' : '<b>所需增益超过可用增益，必然啸叫</b>，需重新选型'),
        margin >= 0 ? 'ok' : 'warn');
    });

    /* 3) STIPA 预测 */
    $('paStiBtn').addEventListener('click', function () {
      var lw = toNums($('paStLw').value), nz = toNums($('paStNoise').value);
      if (lw.length < 6) { show($('paStiOut'), '声功率谱需为 6 个倍频带值（当前 ' + lw.length + ' 个）', 'warn'); return; }
      if (nz.length && nz.length < 6) { show($('paStiOut'), '背景噪声谱需为 6 个倍频带值（当前 ' + nz.length + ' 个）', 'warn'); return; }
      var r = P.stipaPredict({
        Lw: lw, noise: nz.length ? nz : null,
        Q: $('paStQ').value, R: $('paStR').value, r: $('paStDist').value, RT: $('paStRT').value
      });
      if (!r.ok) { show($('paStiOut'), '计算失败：' + r.error, 'warn'); return; }
      // 按倍频带汇总 SNR 与平均 MTF
      var byBand = {};
      r.rows.forEach(function (x) {
        if (!byBand[x.band]) byBand[x.band] = { snr: x.snr, mtf: [] };
        byBand[x.band].mtf.push(x.mtf);
      });
      var rows = Object.keys(byBand).map(function (b) {
        var o = byBand[b];
        var m = o.mtf.reduce(function (a, c) { return a + c; }, 0) / o.mtf.length;
        return '<tr><td>' + b + ' Hz</td><td>' + fmt(o.snr, 1) + '</td><td>' + fmt(m, 2) + '</td></tr>';
      }).join('');
      show($('paStiOut'),
        'STIPA ≈ <b>' + fmt(r.sti, 2) + '</b>（' + r.grade + '）　RT = ' + fmt(r.RT, 2) + ' s' +
        '<table class="weight-table" style="margin-top:8px"><thead><tr><th>倍频带</th><th>信噪比 dB</th><th>平均 MTF</th></tr></thead><tbody>' +
        rows + '</tbody></table>' +
        '<span class="muted">MTF = MTF_SNR × MTF_rev（IEC 60268-16 简化口径，与心理声学模块一致）</span>',
        'ok');
    });

    /* 4) 扬声器电功率 */
    $('paPowBtn').addEventListener('click', function () {
      var sens = pf($('paSens').value), lwReq = pf($('paLwReq').value);
      if (sens == null || lwReq == null) { show($('paPowOut'), '请填写扬声器灵敏度与所需声功率级', 'warn'); return; }
      var p = P.ampPower({ sensitivity: sens, LwReq: lwReq });
      var head = p.watts * 2;
      show($('paPowOut'),
        '所需电功率 ≈ <b>' + fmt(p.watts, 1) + ' W</b>（' + fmt(p.dbw, 1) + ' dBW）' +
        '<br>建议功放额定功率 ≥ <b>' + fmt(head, 0) + ' W</b>（保留约 3 dB 功率余量，防削波）' +
        '<br><span class="muted">灵敏度按 1 m / 1 W 声压级计，Q = 1 时 Lw = Ls + 11 + 10lg(P)</span>',
        'ok');
    });
  }

  window.PaSystemView = { init: init, onShow: function () {} };
})();
