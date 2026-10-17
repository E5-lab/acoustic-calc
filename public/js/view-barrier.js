/*
 * view-barrier.js — 声屏障衰减视图（含断面示意图）
 * 依赖：window.Barrier（内核）、window.MiniChart（绘图）
 */
(function () {
  'use strict';

  var E = window.Barrier;
  var state = { hs: 1, hr: 1.5, hb: 3, d1: 10, d2: 20, sourceId: 'road', formula: 'kurzeAnderson', limit: 24, length: undefined, ground: 'none' };
  var last = null;
  var inited = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); }
  function cssVar(n, f) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n);
    return (v && v.trim()) || f;
  }

  function read() {
    state.hs = parseFloat($('barHs').value);
    state.hr = parseFloat($('barHr').value);
    state.hb = parseFloat($('barHb').value);
    state.d1 = parseFloat($('barD1').value);
    state.d2 = parseFloat($('barD2').value);
    state.sourceId = $('barSource').value;
    state.formula = $('barFormula').value;
    state.limit = parseFloat($('barLimit').value) || 24;
    var len = parseFloat($('barLen').value);
    state.length = (isNaN(len) || len <= 0) ? undefined : len;
    state.ground = $('barGround').value;
  }

  function recalc() {
    read();
    var msg = $('barMsg');
    msg.innerHTML = '';

    var r = E.spectrum({
      hs: state.hs, hr: state.hr, hb: state.hb, d1: state.d1, d2: state.d2,
      sourceId: state.sourceId, formula: state.formula, maxLimit: state.limit,
      length: state.length, ground: state.ground
    });

    if (!r.ok) {
      last = null;
      $('barIL').textContent = '—';
      $('barVerdict').textContent = '';
      $('barStats').innerHTML = '';
      $('barTable').innerHTML = '';
      msg.innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(r.error) + '</span></div>';
      drawDiagram(null);
      $('barNote').textContent = '';
      return;
    }
    last = r;

    $('barIL').textContent = r.insertionLoss.toFixed(1);
    var il = r.insertionLoss;
    var verdict = il < 3 ? '几乎无效（屏障未起作用）'
      : (il < 6 ? '效果有限' : (il < 10 ? '有一定降噪效果' : (il < 15 ? '降噪效果良好' : '降噪效果显著（接近实用上限）')));
    $('barVerdict').innerHTML = verdict + '　声源：' + esc(r.sourceName) +
      '　公式：' + (state.formula === 'maekawa' ? 'Maekawa' : 'Kurze–Anderson') +
      '　（' + (r.weighted ? 'A 计权' : '未计权') + '）';

    var p500 = r.rows[E.BANDS.indexOf(500)] || r.rows[0];
    var g = r.geometric;
    var statsHtml =
      stat('程差 δ', num(g.delta, 3), 'm') +
      stat('菲涅尔数 N @500 Hz', num(p500.N, 2), '') +
      stat('屏障顶超出视线', num(g.hEffective, 2), 'm') +
      stat('屏障后总声级', num(r.overallAfter, 1), r.weighted ? 'dBA' : 'dB');
    if (r.finite && r.plan) {
      statsHtml += stat('左端绕射 δ', num(r.plan.deltaLeft, 2), 'm') + stat('右端绕射 δ', num(r.plan.deltaRight, 2), 'm');
    }
    if (r.groundRho > 0 && r.image) {
      statsHtml += stat('镜像程差 δ′', num(r.image.delta, 3), 'm') + stat('地面能量反射 ρ²', num(r.groundRho * r.groundRho, 2), '');
    }
    $('barStats').innerHTML = statsHtml;

    var limited = r.rows.some(function (x) { return x.limited; });
    if (limited) {
      msg.innerHTML += '<div class="callout warn"><span class="dot"></span><span>部分频带的理论绕射衰减已超过设定的实用上限 ' +
        num(state.limit, 0) + ' dB，结果已按上限截断（实际工程常受侧向绕射、透射漏声与地面效应限制）。</span></div>';
    }
    if (il < 6) {
      msg.innerHTML += '<div class="callout info"><span class="dot"></span><span>插入损失偏低：可尝试提高屏障高度、缩短屏障与声源/接收点的距离，或改用吸声型屏障帽（带吸声内衬可再提升 1–3 dB）。</span></div>';
    }

    var rows = r.rows.map(function (x) {
      function ilCell(v) {
        if (v == null) return '<td class="mut">—</td>';
        var capped = Math.min(v, state.limit);
        return '<td class="' + (v > state.limit ? 'warn' : 'ok') + '">' + num(capped, 1) + (v > state.limit ? '*' : '') + '</td>';
      }
      return '<tr><td>' + x.f + ' Hz</td><td>' + num(x.source, 0) + '</td><td>' + num(x.N, 2) +
        '</td><td>' + num(x.kurzeAnderson, 1) + '</td><td>' + num(x.maekawa, 1) +
        '</td>' + ilCell(x.ilLeft) + ilCell(x.ilRight) + ilCell(x.ilImage) +
        '<td class="' + (x.limited ? 'warn' : 'ok') + '">' + num(x.deltaL, 1) +
        (x.limited ? '（截断）' : '') + '</td></tr>';
    }).join('');
    $('barTable').innerHTML = '<table class="detail-table wide"><thead><tr><th>频带</th><th>声源级 (dB)</th>' +
      '<th>N(顶)</th><th>Kurze–Anderson</th><th>Maekawa</th><th>左端 ΔL</th><th>右端 ΔL</th><th>镜像 ΔL</th><th>合成 ΔL (dB)</th></tr></thead><tbody>' +
      rows + '</tbody></table>';

    drawDiagram(r);
    var noteTail = r.finite
      ? '；有限长屏障 L = ' + num(r.plan.length, 0) + ' m（轴线过中点），端部绕射 δ左 = ' + num(r.plan.deltaLeft, 2) + ' m、δ右 = ' + num(r.plan.deltaRight, 2) + ' m，三路径能量合成'
      : '；按无限长屏障计算，未计入两端绕射';
    if (r.groundRho > 0) noteTail += '；地面反射按镜像声源法修正（ρ = ' + num(r.groundRho, 1) + '）';
    $('barNote').textContent = '几何：声源高 ' + num(state.hs, 2) + ' m，屏障顶 ' + num(state.hb, 2) +
      ' m，接收点高 ' + num(state.hr, 2) + ' m；水平距离 d1 = ' + num(state.d1, 1) + ' m、d2 = ' +
      num(state.d2, 1) + ' m。视线在屏障处高度 ' + num(g.hLOS, 2) + ' m，程差 δ = ' + num(g.delta, 3) + ' m' + noteTail + '。';
  }

  function stat(label, value, unit) {
    return '<div class="stat"><div class="s-label">' + label + '</div>' +
      '<div class="s-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div></div>';
  }

  // ------------------------------ 断面示意图 ------------------------------
  function drawDiagram(r) {
    var canvas = $('barCanvas');
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(320, Math.round(rect.width || 560));
    var H = 330;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var C = {
      primary: cssVar('--primary', '#2563eb'),
      accent: cssVar('--accent', '#f97316'),
      muted: cssVar('--muted', '#6b7280'),
      faint: cssVar('--faint', '#94a3b8'),
      text: cssVar('--text', '#16202f'),
      chip: cssVar('--card', '#ffffff'),
      border: cssVar('--border-strong', '#d3dae6'),
      danger: cssVar('--danger', '#dc2626'),
      ok: cssVar('--ok', '#059669')
    };

    var hs = isFinite(state.hs) ? state.hs : 1;
    var hr = isFinite(state.hr) ? state.hr : 1.5;
    var hb = isFinite(state.hb) ? state.hb : 3;
    var d1 = isFinite(state.d1) && state.d1 > 0 ? state.d1 : 10;
    var d2 = isFinite(state.d2) && state.d2 > 0 ? state.d2 : 20;
    if (![hs, hr, hb].every(isFinite)) return;

    var m = { l: 56, r: 30, t: 46, b: 46 };
    var spanX = d1 + d2;
    var maxH = Math.max(hs, hr, hb, 1) * 1.3;
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    // 断面图为示意：横向与纵向采用独立比例，保证几何关系清晰
    var sx = pw / spanX, sy = ph / maxH;
    var ox = m.l;
    var yGround = m.t + ph;
    var X = function (d) { return ox + d * sx; };
    var Y = function (h) { return yGround - h * sy; };

    // 地面
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(m.l - 20, yGround); ctx.lineTo(W - m.r + 14, yGround); ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(m.l - 20, yGround + 6); ctx.lineTo(W - m.r + 14, yGround + 6); ctx.stroke();
    ctx.setLineDash([]);

    var xS = X(0), yS = Y(hs);
    var xB = X(d1), yB = Y(hb);
    var xR = X(spanX), yR = Y(hr);
    var hLOS = hs + (hr - hs) * d1 / spanX;
    var yLOSatB = Y(hLOS);

    // 视线（虚线）
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = hb > hLOS ? C.danger : C.ok;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(xS, yS); ctx.lineTo(xR, yR); ctx.stroke();
    ctx.setLineDash([]);

    if (r && r.ok) {
      chip(ctx, hb > hLOS ? '视线被遮挡' : '视线未遮挡', X(spanX / 2), Y((hs + hr) / 2) - 14,
        hb > hLOS ? C.danger : C.ok, C);
    }
    // 屏障
    ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
    ctx.strokeStyle = C.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(xB - 5, yB, 10, yGround - yB);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.primary;
    ctx.beginPath();
    ctx.arc(xB, yB, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // 绕射路径
    if (r && r.ok) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(xS, yS);
      ctx.lineTo(xB, yB);
      ctx.lineTo(xR, yR);
      ctx.stroke();
    }

    // 声源与接收点
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(xS, yS, 4.5, 0, Math.PI * 2); ctx.fill();
    chip(ctx, '声源 ' + num(hs, 2) + ' m', xS, yS - 16, C.text, C);
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(xR, yR, 4.5, 0, Math.PI * 2); ctx.fill();
    chip(ctx, '接收点 ' + num(hr, 2) + ' m', xR, yR - 16, C.text, C);

    // 高度标注
    ctx.strokeStyle = C.muted;
    ctx.fillStyle = C.muted;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X(d1) - 26, yGround);
    ctx.lineTo(X(d1) - 26, yB);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(X(d1) - 26, yGround, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X(d1) - 26, yB, 2.4, 0, Math.PI * 2); ctx.fill();
    chip(ctx, 'hb ' + num(hb, 2) + ' m', X(d1) - 26, (yGround + yB) / 2, C.muted, C);

    // 水平距离标注
    var yDim = yGround + 22;
    arrow(ctx, X(0), yDim, X(d1), yDim, C.muted);
    chip(ctx, 'd1 = ' + num(d1, 1) + ' m', (X(0) + X(d1)) / 2, yDim + 16, C.muted, C);
    arrow(ctx, X(d1), yDim, X(d2 + d1), yDim, C.muted);
    chip(ctx, 'd2 = ' + num(d2, 1) + ' m', (X(d1) + X(spanX)) / 2, yDim + 16, C.muted, C);

    // 屏障顶 / 视线标注
    if (r && r.ok) {
      chip(ctx, 'δ = ' + num(r.geometric.delta, 3) + ' m，N(500Hz) = ' + num(peekN(r, 500), 2),
        xB + 90, yB - 16, C.accent, C);
    }
    ctx.beginPath();
    ctx.strokeStyle = C.faint;
    ctx.setLineDash([3, 3]);
    ctx.moveTo(xB - 60, yLOSatB);
    ctx.lineTo(xB + 60, yLOSatB);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function peekN(r, f) {
    for (var i = 0; i < r.rows.length; i++) if (r.rows[i].f === f) return r.rows[i].N;
    return null;
  }

  function arrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    [[x1, y1, x2, y2], [x2, y2, x1, y1]].forEach(function (p) {
      var ang = Math.atan2(p[3] - p[1], p[2] - p[0]);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] + 6.5 * Math.cos(ang + Math.PI / 7), p[1] + 6.5 * Math.sin(ang + Math.PI / 7));
      ctx.lineTo(p[0] + 6.5 * Math.cos(ang - Math.PI / 7), p[1] + 6.5 * Math.sin(ang - Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  function chip(ctx, text, x, y, color, C) {
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    var w = ctx.measureText(text).width + 12;
    var h = 18;
    ctx.beginPath();
    var rx = x - w / 2, ry = y - h / 2, rr = 6;
    ctx.moveTo(rx + rr, ry);
    ctx.arcTo(rx + w, ry, rx + w, ry + h, rr);
    ctx.arcTo(rx + w, ry + h, rx, ry + h, rr);
    ctx.arcTo(rx, ry + h, rx, ry, rr);
    ctx.arcTo(rx, ry, rx + w, ry, rr);
    ctx.closePath();
    ctx.fillStyle = C.chip;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  // ------------------------------ 反算与导出 ------------------------------
  function solveHeight() {
    read();
    var target = parseFloat($('barTarget').value);
    var res = E.requiredHeight({
      hs: state.hs, hr: state.hr, d1: state.d1, d2: state.d2,
      sourceId: state.sourceId, targetIL: target, formula: state.formula, maxLimit: state.limit,
      length: state.length, ground: state.ground
    });
    if (!res.ok) {
      $('barSolveResult').innerHTML = '<div class="callout error" style="grid-column:1/-1"><span class="dot"></span><span>' + esc(res.error) + '</span></div>';
      return;
    }
    $('barSolveResult').innerHTML =
      '<div class="kv"><div class="k">建议屏障顶高度</div><div class="v">' + num(res.height, 2) +
      '<small>m</small></div><div class="s-sub mini">满足目标 ' + num(res.target, 0) + ' dB</div></div>' +
      '<div class="kv"><div class="k">该高度实际插入损失</div><div class="v">' + num(res.achieved, 1) +
      '<small>dB</small></div><div class="s-sub mini">' + esc(state.sourceId === 'road' ? '道路交通噪声谱' : '所选声源谱') + '</div></div>';
  }

  function summaryText() {
    if (!last) return '';
    var g = last.geometric;
    var out = ['声屏障衰减计算 · 结果摘要'];
    out.push('几何：声源高 ' + num(state.hs, 2) + ' m / 屏障顶 ' + num(state.hb, 2) + ' m / 接收点高 ' + num(state.hr, 2) +
      ' m；d1 = ' + num(state.d1, 1) + ' m，d2 = ' + num(state.d2, 1) + ' m');
    out.push('程差 δ = ' + num(g.delta, 3) + ' m；视线在屏障处高度 ' + num(g.hLOS, 2) + ' m；屏障顶超出视线 ' + num(g.hEffective, 2) + ' m');
    out.push('声源谱：' + last.sourceName + '；绕射公式：' + (state.formula === 'maekawa' ? 'Maekawa' : 'Kurze–Anderson') +
      '；实用上限 ' + num(state.limit, 0) + ' dB');
    out.push('A 计权插入损失 ΔL = ' + last.insertionLoss.toFixed(1) + ' dB（屏障前 ' + num(last.overallBefore, 1) +
      ' → 屏障后 ' + num(last.overallAfter, 1) + (last.weighted ? ' dBA' : ' dB') + '）');
    if (last.finite) out.push('有限长屏障：L = ' + num(last.plan.length, 0) + ' m，端部绕射 δ左 = ' + num(last.plan.deltaLeft, 2) +
      ' m、δ右 = ' + num(last.plan.deltaRight, 2) + ' m（三路径能量合成）');
    if (last.groundRho > 0) out.push('地面反射：镜像声源法，能量反射系数 ρ = ' + num(last.groundRho, 1));
    out.push('逐带合成 ΔL：' + last.rows.map(function (x) { return x.f + 'Hz=' + num(x.deltaL, 1); }).join('，'));
    out.push('工具：声学计算工具箱 · 声屏障衰减');
    return out.join('\n');
  }

  function exportCsv() {
    if (!last) return;
    var rows = [['声屏障衰减计算结果', '', '']];
    rows.push(['声源高度 (m)', num(state.hs, 2), '']);
    rows.push(['屏障顶高度 (m)', num(state.hb, 2), '']);
    rows.push(['接收点高度 (m)', num(state.hr, 2), '']);
    rows.push(['d1 (m)', num(state.d1, 2), '']);
    rows.push(['d2 (m)', num(state.d2, 2), '']);
    rows.push(['程差 δ (m)', num(last.geometric.delta, 4), '']);
    rows.push(['A 计权插入损失 (dB)', last.insertionLoss.toFixed(2), '']);
    if (last.finite) rows.push(['屏障长度 L (m)', num(last.plan.length, 0), '端部绕射 δ左 ' + num(last.plan.deltaLeft, 2) + ' m / δ右 ' + num(last.plan.deltaRight, 2) + ' m']);
    if (last.groundRho > 0) rows.push(['地面反射 ρ', num(last.groundRho, 1), '镜像声源法']);
    rows.push([]);
    rows.push(['倍频带 (Hz)', '声源级 (dB)', 'N', 'Kurze-Anderson (dB)', 'Maekawa (dB)', '左端 ΔL (dB)', '右端 ΔL (dB)', '镜像 ΔL (dB)', '合成 ΔL (dB)']);
    last.rows.forEach(function (x) {
      rows.push([x.f, num(x.source, 1), num(x.N, 4), num(x.kurzeAnderson, 2), num(x.maekawa, 2),
        x.ilLeft == null ? '' : num(x.ilLeft, 2), x.ilRight == null ? '' : num(x.ilRight, 2),
        x.ilImage == null ? '' : num(x.ilImage, 2), num(x.deltaL, 2)]);
    });
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'barrier-result.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(txt, id) {
    if (!txt) { flash(id, '暂无可复制结果'); return; }
    var done = function () { flash(id, '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallback(txt, done); });
    } else fallback(txt, done);
  }
  function fallback(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动选择文本。'); }
    document.body.removeChild(ta);
  }
  function flash(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function init() {
    if (inited) return;
    inited = true;

    $('barSource').innerHTML = E.SOURCES.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === state.sourceId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');

    recalc();

    ['barHs', 'barHr', 'barHb', 'barD1', 'barD2', 'barLimit', 'barLen'].forEach(function (id) {
      $(id).addEventListener('input', recalc);
    });
    $('barSource').addEventListener('change', recalc);
    $('barFormula').addEventListener('change', recalc);
    $('barGround').addEventListener('change', recalc);
    $('barSolve').addEventListener('click', solveHeight);
    $('barCopy').addEventListener('click', function () { copyText(summaryText(), 'barCopyMsg'); });
    $('barCsv').addEventListener('click', exportCsv);

    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var v = $('view-barrier');
        if (v && v.classList.contains('active')) drawDiagram(last);
      }, 160);
    });
  }

  function onShow() { recalc(); }

  window.BarrierView = { init: init, onShow: onShow };
})();
