/*
 * view-smallroom.js — 小房间与室内声场 视图（#/smallroom）
 * 依赖 window.SmallRoom（内核）。
 */
(function () {
  'use strict';
  var S = window.SmallRoom;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }

  var lastModes = null;

  function init() {
    if (init._d) return; init._d = true;

    /* 简正频率分布 */
    $('srModeBtn').addEventListener('click', function () {
      var r = S.modes({
        length: $('srL').value, width: $('srW').value, height: $('srH').value,
        fMax: $('srFmax').value, c: $('srC').value, tol: $('srTol').value
      });
      if (!r || !r.ok) { show($('srModeOut'), '请填写有效长、宽、高（> 0 m）与上限频率', 'warn'); return; }
      lastModes = r;
      var st = r.stat, L = r.list.slice(0, 12);
      var rows = L.map(function (m) {
        return '<tr><td>' + fmt(m.f, 1) + '</td><td>' + m.nx + ', ' + m.ny + ', ' + m.nz +
          '</td><td>' + m.typeName + '</td></tr>';
      }).join('');
      show($('srModeOut'),
        '简正频率总数 <b>' + r.count + '</b>　轴向 <b>' + st.axial + '</b> / 切向 <b>' + st.tangential +
        '</b> / 斜向 <b>' + st.oblique + '</b><br>体积 V = ' + fmt(r.volume, 1) + ' m³　表面积 S = ' + fmt(r.area, 1) +
        ' m²　最低简正频率 f₁ = ' + fmt(r.fFirst, 1) + ' Hz<br>简并组数（频率重合）: <b>' + r.degeneracy.groups + '</b>' +
        (L.length ? '<div class="table-wrap"><table class="detail-table wide"><thead><tr><th>频率 Hz</th><th>阶次 (nx, ny, nz)</th><th>类型</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' : ''), 'ok');
    });

    /* Bonello 准则 */
    $('srBonBtn').addEventListener('click', function () {
      if (!lastModes) { show($('srBonOut'), '请先「计算简正频率」', 'warn'); return; }
      var b = S.bonello(lastModes.list, $('srBonLo').value, $('srBonHi').value);
      if (!b || !b.ok) { show($('srBonOut'), 'Bonello 计算失败', 'warn'); return; }
      show($('srBonOut'), (b.pass ? '✓ ' : '✗ ') + b.hint + '　|　计数单调不减: ' + (b.monotone ? '是' : '否') +
        '　空带 ' + b.emptyBands + ' 个（连续最多 ' + b.maxEmptyRun + '）', b.pass ? 'ok' : 'warn');
    });

    /* Schroeder 频率 */
    $('srSchBtn').addEventListener('click', function () {
      var f = S.schroederFreq($('srRT').value, $('srV').value);
      if (f == null) { show($('srSchOut'), '请填写 RT60 与体积（> 0）', 'warn'); return; }
      show($('srSchOut'), 'Schroeder 频率 f_s ≈ <b>' + fmt(f, 1) + ' Hz</b>（高于此频率统计声学方法更可靠）', 'ok');
    });

    /* 房间常数 + 临界距离 */
    $('srRoomBtn').addEventListener('click', function () {
      var Rv = S.roomConstant($('srS').value, $('srA').value);
      if (Rv == null) { show($('srRoomOut'), '请填写总表面积 S 与平均吸声系数 α（0 ≤ α < 1）', 'warn'); return; }
      var rc = S.criticalDistance($('srQ').value, Rv);
      show($('srRoomOut'), '房间常数 R = <b>' + fmt(Rv, 1) + '</b> m²　临界距离 r_c = <b>' + fmt(rc, 2) +
        ' m</b>（Q = ' + fmt($('srQ').value, 2) + '）', 'ok');
    });

    /* 稳态声压级（直达 + 混响） */
    $('srLpBtn').addEventListener('click', function () {
      var r = S.steadyStateLp({ Lw: $('srLw').value, Q: $('srLpq').value, r: $('srR').value, R: $('srRc').value });
      if (!r) { show($('srLpOut'), '请填写 Lw、Q、r、R（均 > 0）', 'warn'); return; }
      show($('srLpOut'), '稳态声压级 Lp ≈ <b>' + fmt(r.lp) + ' dB</b>　直达 ' + fmt(r.direct) +
        ' / 混响 ' + fmt(r.reverb) + '　D/R = ' + fmt(r.dOverR, 1) + ' dB', 'ok');
    });

    /* 多声源能量叠加 */
    $('srMulBtn').addEventListener('click', function () {
      var Rv = $('srMulR').value;
      var lines = ($('srMulSrc').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var src = [];
      lines.forEach(function (s, i) {
        var p = s.split(/[\s,;]+/).map(parseFloat);
        if (p.length >= 3 && p.every(function (x) { return !isNaN(x); }))
          src.push({ Lw: p[0], Q: p[1], r: p[2], label: '声源' + (i + 1) });
      });
      var r = S.multiSourceLp(src, Rv);
      if (!r) { show($('srMulOut'), '每行填「Lw Q r」（空格/逗号分隔），至少 1 行有效', 'warn'); return; }
      show($('srMulOut'), '多声源叠加总声压级 ≈ <b>' + fmt(r.lp) + ' dB</b>（' + r.n + ' 个声源，R = ' + fmt(Rv, 1) + ' m²）', 'ok');
    });

    /* 空气吸收（ISO 9613-1） */
    $('srAirBtn').addEventListener('click', function () {
      var m = S.medium($('srTc').value, $('srHr').value, $('srPk').value);
      if (!m) { show($('srAirOut'), '请填写温度 / 相对湿度 / 大气压', 'warn'); return; }
      var rows = m.bands.map(function (b) {
        return '<tr><td>' + b.f + '</td><td>' + (b.alpha == null ? '—' : fmt(b.alpha, 4)) + '</td></tr>';
      }).join('');
      show($('srAirOut'), '参考声速 c = ' + fmt(m.c, 1) + ' m/s（20℃）　各倍频带空气吸收 α (dB/m)：' +
        '<div class="table-wrap"><table class="detail-table wide"><thead><tr><th>频率 Hz</th><th>α dB/m</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>', 'ok');
    });
  }

  function onShow() {}
  window.SmallRoomView = { init: init, onShow: onShow };
})();
