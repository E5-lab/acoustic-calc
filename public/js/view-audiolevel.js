/*
 * view-audiolevel.js — 音频电平与阻抗 视图（#/audiolevel）
 * 依赖 window.AudioLevel（内核）、window.MiniChart（曲线）。
 *
 * 八个子计算器：
 *   1) 电平换算：V / dBV / dBu / dBm / dBW / dBFS 互转（含满刻度基准与常用锚点）
 *   2) 灵敏度：1 W/1 m ↔ 2.83 V/1 m ↔ 1 V/1 m
 *   3) 串并联：多只音箱总阻抗、每只功率与 SPL 增减
 *   4) 功放—音箱：功率 → 最大 SPL（声压-距离曲线）
 *   5) 功放选型：目标 SPL 反算所需功率、峰值与余量
 *   6) 线材与阻尼：线阻、回路损耗、阻尼系数（线损-线长曲线）
 *   7) 允许线长：按线损或阻尼约束反算
 *   8) IEC 60268-5：最小阻抗校核与功放选型区间
 */
(function () {
  'use strict';
  var A = window.AudioLevel;
  var Chart = window.MiniChart;

  function $(id) { return window.Util.$(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) {
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }
  function cssVar(n, f) { return window.Util.cssVar(n, f); }
  function esc(s) { return window.Util.esc(s); }

  /* ---------------- 图表：声压—距离 ---------------- */
  function drawSpl(o) {
    if (!Chart) return;
    var xs = [], ys = [];
    for (var r = 1; r <= 100.001; r *= 1.18) {
      xs.push(r);
      ys.push(A.ampSpl({
        spl1w1m: o.spl1w1m, power: o.power, distance: r,
        n: o.n, space: o.space, coherence: o.coherence
      }).spl);
      if (r > 99) break;
    }
    var lo = Math.floor(Math.min.apply(null, ys) - 2);
    var hi = Math.ceil(Math.max.apply(null, ys) + 2);
    Chart.draw($('alAmpChart'), {
      x: xs, xLog: true, yDigits: 0, yMin: lo, yMax: hi,
      xLabelFmt: function (v) { return (v >= 10 ? Math.round(v) : v.toFixed(1)) + 'm'; },
      series: [{ values: ys, color: cssVar('--primary', '#2563eb'), width: 2.2, points: false }]
    });
  }

  /* ---------------- 图表：线损—线长 ---------------- */
  function drawWire(z, za, area, material) {
    if (!Chart) return;
    var xs = [], loss = [];
    for (var L = 1; L <= 100.001; L += 1) {
      xs.push(L);
      var w = A.wire({ length: L, area: area, material: material });
      loss.push(A.damping({ zLoad: z, zAmp: za, rLoop: w.rLoop }).lossDb);
    }
    Chart.draw($('alWChart'), {
      x: xs, yDigits: 1, yMin: -6, yMax: 0,
      xLabelFmt: function (v) { return Math.round(v) + 'm'; },
      hBands: [{ from: -0.5, to: 0, color: 'rgba(34,197,94,0.12)' }],
      series: [{ values: loss, color: cssVar('--primary', '#2563eb'), width: 2.2, points: false }]
    });
  }

  /* ---------------- 表格辅助 ---------------- */
  function table(headers, rows) {
    return '<table><thead><tr>' + headers.map(function (h) {
      return '<th>' + h + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  function init() {
    if (init._d) return; init._d = true;

    /* ================= 1) 电平换算 ================= */
    (function () {
      var fsSel = $('alFs');
      if (fsSel) {
        fsSel.innerHTML = A.FULL_SCALE.map(function (f) {
          return '<option value="' + f.dbu + '"' + (f.dbu === 24 ? ' selected' : '') + '>' + esc(f.name) + '</option>';
        }).join('');
      }
    })();

    $('alBtn').addEventListener('click', function () {
      var vfs = A.fullScaleVolts(pf($('alFs').value));
      var L = A.fromUnit({
        value: pf($('alVal').value), unit: $('alUnit').value,
        impedance: pf($('alZ').value) || 8, vfs: vfs
      });
      var rows = A.LEVEL_PRESETS.map(function (p) {
        var rel = L.volts / p.v;
        return [esc(p.name), fmt(p.v, 4) + ' V', fmt(p.dbv, 2) + ' dBV', fmt(p.dbu, 2) + ' dBu',
          fmt(20 * Math.log10(rel), 2) + ' dB'];
      });
      show($('alOut'),
        '电压 <b>' + fmt(L.volts, 4) + ' V<sub>rms</sub></b>（峰值 ' + fmt(L.peak, 4) +
        ' V，峰峰值 ' + fmt(L.pp, 4) + ' V）　负载 ' + fmt(L.impedance, 2) + ' Ω → 功率 <b>' +
        fmt(L.watts, 4) + ' W</b>' +
        '<br><span class="mono">' + fmt(L.dBV, 2) + ' dBV　' + fmt(L.dBu, 2) + ' dBu　' +
        fmt(L.dBm600, 2) + ' dBm（600 Ω）　' + fmt(L.dBmZ, 2) + ' dBm（' + fmt(L.impedance, 0) +
        ' Ω）　' + fmt(L.dBW, 2) + ' dBW</span>' +
        '<br>满刻度基准 ' + fmt(L.vfs, 3) + ' V → <b>' + fmt(L.dBFS, 2) + ' dBFS</b>，' +
        '距削波还有 <b>' + fmt(L.headroomToFs, 2) + ' dB</b>' +
        '<br><span class="muted">dBV 以 1 V 为 0 dB，dBu 以 √0.6 = 0.7746 V 为 0 dB，两者相差 2.2185 dB；' +
        'dBm 是功率量（1 mW 基准），必须指定负载才有确定电压。</span>' +
        table(['常用电平锚点', '电压', 'dBV', 'dBu', '相对当前'], rows),
        'ok');
    });

    /* ================= 2) 灵敏度互换 ================= */
    $('alBtnSens').addEventListener('click', function () {
      var s = A.sensitivity({ mode: $('alSensMode').value, spl: pf($('alSensSpl').value), z: pf($('alSensZ').value) });
      var rows = [4, 6, 8, 16].map(function (z) {
        var t = A.sensitivity({ mode: '1w', spl: s.spl1w1m, z: z });
        return [z + ' Ω', fmt(t.v1w, 3) + ' V', fmt(t.spl1w1m, 2), fmt(t.spl283v1m, 2), fmt(t.spl1v1m, 2)];
      });
      show($('alOutSens'),
        '标称阻抗 ' + fmt(s.z, 2) + ' Ω：<b>' + fmt(s.spl1w1m, 2) + ' dB @ 1 W/1 m</b>' +
        '　⇔　<b>' + fmt(s.spl283v1m, 2) + ' dB @ 2.83 V/1 m</b>' +
        '　⇔　<b>' + fmt(s.spl1v1m, 2) + ' dB @ 1 V/1 m</b>' +
        '<br>1 W 对应 ' + fmt(s.v1w, 3) + ' V；2.83 V 实际注入 ' + fmt(s.p283, 3) + ' W' +
        '<br>换算量：2.83 V 与 1 W 相差 <b>' + fmt(s.delta283, 2) + ' dB</b>，1 V 与 1 W 相差 ' +
        fmt(s.delta1v, 2) + ' dB' +
        '<br><span class="muted">8 Ω 时两套标注数值相同；4 Ω 音箱用 2.83 V 标注会比 1 W 标注「好看」3 dB，' +
        '比较不同厂家的灵敏度时务必先看是哪种标注。</span>' +
        table(['标称阻抗', '1 W 电压', '1 W/1 m', '2.83 V/1 m', '1 V/1 m'], rows),
        'ok');
    });

    /* ================= 3) 串并联 ================= */
    function syncArr() {
      var row = $('alArrPerRow');
      if (row) row.hidden = $('alArrWiring').value !== 'sp';
    }
    $('alArrWiring').addEventListener('change', syncArr);
    syncArr();

    $('alBtnArr').addEventListener('click', function () {
      var z = pf($('alArrZ').value), n = pf($('alArrN').value);
      var g = A.arrayGain({
        z: z, n: n, wiring: $('alArrWiring').value,
        perGroup: pf($('alArrPer').value) || 2, ampVolts: pf($('alArrV').value)
      });
      var wname = { parallel: '并联', series: '串联', sp: '串并联' }[g.impedance.wiring];
      var rows = [1, 2, 3, 4, 6, 8].map(function (k) {
        var t = A.arrayGain({ z: z, n: k, wiring: g.impedance.wiring, perGroup: g.impedance.perGroup, ampVolts: g.ampVolts });
        return [k + ' 只', fmt(t.totalZ, 2) + ' Ω', fmt(t.perBoxWatts, 1) + ' W',
          fmt(t.totalWatts, 1) + ' W', (t.relDb >= 0 ? '+' : '') + fmt(t.relDb, 2) + ' dB'];
      });
      show($('alOutArr'),
        wname + ' ' + g.impedance.n + ' 只 ' + fmt(z, 2) + ' Ω：总阻抗 <b>' + fmt(g.totalZ, 2) + ' Ω</b>' +
        '　功放输出 ' + fmt(g.ampVolts, 2) + ' V 时电流 ' + fmt(g.ampCurrent, 2) + ' A' +
        '<br>每只分得 ' + fmt(g.perBoxVolts, 3) + ' V → ' + fmt(g.perBoxWatts, 2) +
        ' W；总功率 <b>' + fmt(g.totalWatts, 2) + ' W</b>' +
        '<br>相对「单只接同一功放」的声压级变化：<b>' + (g.relDb >= 0 ? '+' : '') + fmt(g.relDb, 2) + ' dB</b>' +
        '<br><span class="muted">恒压功放模型：并联每只都拿到满电压，总功率 ×N（+3 dB/倍）；' +
        '串联每只只拿到 U/N，总功率 ÷N（−3 dB/倍）。串并联可在总阻抗与 SPL 之间折中。</span>' +
        table(['只数', '总阻抗', '每只功率', '总功率', 'SPL 变化'], rows),
        'ok');
    });

    /* ================= 4) 功放功率 → 最大 SPL ================= */
    $('alBtnAmp').addEventListener('click', function () {
      var o = {
        spl1w1m: pf($('alAmpSpl').value), power: pf($('alAmpP').value),
        distance: pf($('alAmpR').value), n: pf($('alAmpN').value),
        space: $('alAmpSpace').value, coherence: $('alAmpCoh').value
      };
      var r = A.ampSpl(o);
      var vOut = A.vFromWatts(r.perBoxWatts * r.boxes, pf($('alAmpZ').value) || 8);
      show($('alOutAmp'),
        '灵敏度 ' + fmt(r.spl1w1m, 1) + ' dB@1W1m、功放 ' + fmt(r.power, 1) + ' W、' +
        fmt(r.boxes, 0) + ' 只：' +
        '<br>1 m 处 <b>' + fmt(r.spl1m, 1) + ' dB</b>　→　' + fmt(r.distance, 1) +
        ' m 处 <b>' + fmt(r.spl, 1) + ' dB</b>（距离衰减 ' + fmt(-r.distAtten, 2) + ' dB）' +
        '<br>阵列增益 +' + fmt(r.arrayGainDb, 2) + ' dB（' +
        (o.coherence === 'coh' ? '理想相干' : '非相干') + '）' +
        (r.spaceCorrDb ? '，全空间修正 ' + fmt(r.spaceCorrDb, 1) + ' dB' : '，半空间参考') +
        '<br>每只承担 ' + fmt(r.perBoxWatts, 1) + ' W；按 8 Ω 估算功放输出电压约 ' + fmt(vOut, 2) + ' V' +
        '<br><span class="muted">曲线为连续（RMS）声压级。峰值需再叠加节目信号的波峰因数，' +
        '取 10 dB 时峰值比本值高 10 dB。</span>',
        'ok');
      drawSpl(o);
    });

    /* ================= 5) 功放选型 ================= */
    $('alBtnSz').addEventListener('click', function () {
      var z = A.ampSizing({
        spl1w1m: pf($('alSzSpl').value), targetSpl: pf($('alSzTarget').value),
        distance: pf($('alSzR').value), n: pf($('alSzN').value),
        crestDb: pf($('alSzCrest').value), headroomDb: pf($('alSzHead').value),
        space: $('alSzSpace').value
      });
      var rows = A.CREST.map(function (c) {
        var t = A.ampSizing({
          spl1w1m: pf($('alSzSpl').value), targetSpl: pf($('alSzTarget').value),
          distance: pf($('alSzR').value), n: pf($('alSzN').value),
          crestDb: c.db, headroomDb: pf($('alSzHead').value), space: $('alSzSpace').value
        });
        return [esc(c.name), fmt(c.db, 1) + ' dB', fmt(t.rmsWattsPerBox, 1) + ' W',
          fmt(t.peakWattsPerBox, 0) + ' W', fmt(t.noClipWattsPerBox, 0) + ' W'];
      });
      show($('alOutSz'),
        '目标 <b>' + fmt(z.targetSpl, 1) + ' dB</b> @ ' + fmt(pf($('alSzR').value), 1) + ' m，' +
        fmt(pf($('alSzN').value), 0) + ' 只分担：' +
        '<br>需 1 m 处达到 ' + fmt(z.needSpl1m, 1) + ' dB → 每只连续功率 <b>' +
        fmt(z.rmsWattsPerBox, 1) + ' W</b>' +
        '<br>波峰因数 ' + fmt(z.crestDb, 1) + ' dB（峰值/有效值 ×' + fmt(z.crestFactorLinear, 1) +
        '）→ 峰值功率 <b>' + fmt(z.peakWattsPerBox, 0) + ' W</b>' +
        '<br>叠加 ' + fmt(z.headroomDb, 1) + ' dB 余量 → 建议功放 <b>' +
        fmt(z.recommendedWattsPerBox, 0) + ' W/只</b>；不削波取 <b>' +
        fmt(z.noClipWattsPerBox, 0) + ' W/只</b>' +
        '<br><span class="muted">功放长期功率不足会削波失真（比功率不足本身更伤高音单元），' +
        '余量不足则压缩动态。工程惯例：功放额定功率取音箱连续功率的 1.5~2 倍。</span>' +
        table(['节目类型', '波峰因数', '连续功率', '峰值功率', '建议功放'], rows),
        'ok');
    });

    /* ================= 6) 线材与阻尼 ================= */
    $('alBtnW').addEventListener('click', function () {
      var z = pf($('alWZ').value), za = pf($('alWZamp').value);
      var w = A.wire({
        length: pf($('alWLen').value), area: pf($('alWArea').value),
        material: $('alWMat').value, temp: pf($('alWTemp').value)
      });
      var d = A.damping({ zLoad: z, zAmp: za, rLoop: w.rLoop });
      show($('alOutW'),
        w.material + ' ' + fmt(w.area, 2) + ' mm² × ' + fmt(w.length, 1) + ' m（' + fmt(w.temp, 0) + ' ℃）：' +
        '单程 <b>' + fmt(w.rOneWay * 1000, 2) + ' mΩ</b>，回路 <b>' + fmt(w.rLoop, 4) + ' Ω</b>' +
        '（' + fmt(w.ohmPerKm, 2) + ' Ω/km 回路）' +
        '<br>声源总内阻 ' + fmt(d.zSource, 4) + ' Ω → 阻尼系数 <b>DF = ' + fmt(d.dampingFactor, 1) +
        '</b>（' + d.grade + '）' +
        '<br>线损 <b>' + fmt(d.lossDb, 3) + ' dB</b>；送达负载 ' + fmt(d.powerRatio * 100, 2) +
        '%，线材上耗散 ' + fmt(d.wireWaste * 100, 2) + '%' +
        '<br>' + (d.wireDominant
          ? '<span class="muted">损耗由线材主导（线阻 > 功放内阻），加粗线径即可显著改善。</span>'
          : '<span class="muted">损耗已接近功放内阻极限，再加粗线径收效有限。</span>') +
        '<br><span class="muted">阻尼系数是功放对扬声器音盆残余振动的控制能力：DF ≥ 50 优秀、' +
        '20~50 良好、10~20 可接受、&lt;10 时低频明显拖尾。长线远送时它往往比「线损那零点几 dB」影响更大。</span>',
        'ok');
      drawWire(z, za, w.area, $('alWMat').value);
    });

    /* ================= 7) 允许线长 ================= */
    $('alBtnML').addEventListener('click', function () {
      var area = pf($('alMLArea').value), z = pf($('alMLZ').value);
      var m = A.maxLength({
        zLoad: z, zAmp: pf($('alMLZamp').value), area: area,
        material: $('alMLMat').value, maxLossDb: pf($('alMLLoss').value),
        minDamping: pf($('alMLDf').value)
      });
      var rows = A.AREA_MM2.concat(A.AWG.map(function (g) { return g.a; })).map(function (a) {
        var t = A.maxLength({
          zLoad: z, zAmp: pf($('alMLZamp').value), area: a, material: $('alMLMat').value,
          maxLossDb: pf($('alMLLoss').value), minDamping: pf($('alMLDf').value)
        });
        var lbl = A.AWG.filter(function (g) { return g.a === a; })[0];
        return [lbl ? 'AWG ' + lbl.awg : a + ' mm²', fmt(a, 3), fmt(t.maxLen, 1) + ' m',
          t.limitBy === 'loss' ? '线损' : '阻尼'];
      });
      show($('alOutML'),
        m.material + ' ' + fmt(m.area, 2) + ' mm²、负载 ' + fmt(z, 2) + ' Ω：' +
        '允许回路电阻 <b>' + fmt(m.maxRSource, 4) + ' Ω</b> → 允许线长 <b>' + fmt(m.maxLen, 1) + ' m</b>' +
        '<br>约束来自 <b>' + (m.limitBy === 'loss' ? '线损 ≤ ' + fmt(m.maxLossDb, 2) + ' dB'
          : '阻尼系数 ≥ ' + fmt(m.minDamping, 0)) + '</b>（两者取严）' +
        '<br><span class="muted">每米回路电阻 ' + fmt(m.rLoopPerM * 1000, 2) + ' mΩ。' +
        '线长通常指单程距离；功放到音箱实际是往返两根导线，已按回路计算。</span>' +
        table(['规格', '截面积 mm²', '允许线长', '约束来源'], rows),
        'ok');
    });

    /* ================= 8) IEC 60268-5 阻抗校核 ================= */
    $('alBtnIc').addEventListener('click', function () {
      var zn = pf($('alIcZn').value);
      var c = A.impedanceCheck({ zNominal: zn, zMin: pf($('alIcZmin').value) || zn * 0.8 });
      var v = pf($('alIcV').value) || A.vFromWatts(pf($('alIcPcont').value) || 100, zn);
      var rng = c.ampRange(pf($('alIcPcont').value) || 100);
      show($('alOutIc'),
        '标称 ' + fmt(c.zNominal, 2) + ' Ω，最小阻抗 ' + fmt(c.zMin, 2) + ' Ω = 标称的 ' +
        fmt(c.ratio * 100, 1) + '%：' +
        '<b>' + (c.pass ? '符合 IEC 60268-5' : '低于 IEC 60268-5 下限 ' + fmt(c.limit, 2) + ' Ω') + '</b>' +
        '<br>功放输出 ' + fmt(v, 2) + ' V 时，按最小阻抗计峰值电流 <b>' +
        fmt(c.peakCurrent(v), 2) + ' A</b>' +
        '<br>音箱连续功率 ' + fmt(pf($('alIcPcont').value), 0) + ' W → 建议功放 ' +
        fmt(rng.low, 0) + ' ~ ' + fmt(rng.high, 0) + ' W（1.5~2 倍）' +
        '<br><span class="muted">IEC 60268-5 规定扬声器阻抗模的最小值不得低于标称值的 80 %；' +
        '低于此值的音箱按标称阻抗配功放会过载。实际阻抗随频率大幅起伏（谐振峰可达标称的 3~5 倍，' +
        '分频点附近也可能塌陷），应以实测曲线的最低点为准。</span>',
        c.pass ? 'ok' : 'warn');
    });
  }

  function onShow() {
    var a = $('alAmpChart');
    if (a && !a.hidden) {
      // 视图切换时重绘（画布宽度在隐藏时为 0）
      var o = {
        spl1w1m: pf($('alAmpSpl').value), power: pf($('alAmpP').value),
        distance: pf($('alAmpR').value), n: pf($('alAmpN').value),
        space: $('alAmpSpace').value, coherence: $('alAmpCoh').value
      };
      if (o.spl1w1m != null && o.power != null) drawSpl(o);
    }
  }

  window.AudioLevelView = { init: init, onShow: onShow };
})();
