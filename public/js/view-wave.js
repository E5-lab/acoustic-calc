/*
 * view-wave.js — 波动与乐音计算 视图（#/wave）
 * 依赖 window.Wave（内核）、window.MiniChart（曲线）。
 *
 * 八个子计算器：
 *   1) 声速：空气（含温湿度混合气体模型）/ 纯水 / 常用介质库
 *   2) 波长 ↔ 频率 ↔ 周期 ↔ 波数（含倍频带波长速查）
 *   3) 自由场声强 I = Q·P/(4πr²) 与平方反比衰减
 *   4) 特性声阻抗 Z = ρc 与平面界面反射 / 透射（垂直与斜入射、临界角）
 *   5) 比值 ↔ 分贝（功率比 10lg / 场量比 20lg，双向）
 *   6) 乐音：十二平均律频率 ↔ 音名 ↔ 音分、音程与拍频
 *   7) 管共振（开管 / 闭管）与弦共振
 *   8) 多普勒效应
 */
(function () {
  'use strict';
  var W = window.Wave;
  var Chart = window.MiniChart;

  function $(id) { return document.getElementById(id); }
  function pf(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmt(n, d) { if (n == null || !isFinite(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) {
    if (!el) return;
    el.hidden = false;
    if (html != null) el.innerHTML = html;
    el.className = 'result-line' + (cls ? ' ' + cls : '');
  }
  function cssVar(n, f) {
    var v = window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue(n) : '';
    return (v || '').trim() || f;
  }
  function sci(n, d) {
    if (n == null || !isFinite(n)) return '—';
    var e = Math.floor(Math.log10(Math.abs(n)));
    var m = n / Math.pow(10, e);
    return m.toFixed(d == null ? 2 : d) + '×10<sup>' + e + '</sup>';
  }
  function fillMedia(sel) {
    if (!sel) return;
    sel.innerHTML = '<option value="">自定义…</option>' + W.MEDIA.map(function (m) {
      return '<option value="' + m.id + '">' + m.name + '</option>';
    }).join('');
  }

  function init() {
    if (init._d) return; init._d = true;

    /* ---------------- 1) 声速 ---------------- */
    $('wvBtnSpd').addEventListener('click', function () {
      var air = W.soundSpeedAir({
        temp: pf($('wvTemp').value), rh: pf($('wvRh').value), pressure: pf($('wvPres').value)
      });
      var water = W.soundSpeedWater(pf($('wvTemp').value));
      show($('wvOutSpd'),
        '空气声速 <b>' + fmt(air.c, 2) + ' m/s</b>' +
        '　（简化式 331.4+0.6T = ' + fmt(air.simple, 2) +
        '　开方式 331.3·√(T<sub>K</sub>/273.15) = ' + fmt(air.sqrt, 2) + '）' +
        '<br>相对湿度 ' + fmt(air.rh, 0) + '% → 水蒸气摩尔分数 ' + fmt(air.moleFraction * 100, 3) +
        '%，混合气体 γ = ' + fmt(air.gamma, 4) + '、M = ' + fmt(air.molarMass * 1000, 3) + ' g/mol' +
        '<br>空气密度 <b>' + fmt(air.density, 4) + ' kg/m³</b>　特性声阻抗 ρc = <b>' +
        fmt(air.density * air.c, 1) + ' Pa·s/m</b>' +
        '<br>同温度下纯水声速 ' + fmt(water, 1) + ' m/s（约空气的 ' + fmt(water / air.c, 1) + ' 倍）' +
        '<br><span class="muted">湿度每升高，声速略增：20 ℃ 下 0 % → 100 % RH 约 +1.3 m/s，对波长与分频点的影响通常可忽略，但对精密测量需要修正。</span>',
        'ok');
    });

    /* ---------------- 2) 波长 ↔ 频率 ---------------- */
    $('wvBtnWl').addEventListener('click', function () {
      var c = pf($('wvC').value), f = pf($('wvF').value);
      var r = W.wavelength({ f: f, c: c });
      if (!r) { show($('wvOutWl'), '请填写声速与频率', 'warn'); return; }
      var bands = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000];
      var rows = bands.map(function (bf) {
        var w = W.wavelength({ f: bf, c: c });
        return '<tr><td>' + (bf >= 1000 ? (bf / 1000) + 'k' : bf) + '</td><td>' + fmt(w.lambda, 3) + '</td>' +
          '<td>' + fmt(w.half, 3) + '</td><td>' + fmt(w.quarter, 3) + '</td></tr>';
      }).join('');
      show($('wvOutWl'),
        f + ' Hz @ ' + fmt(c, 1) + ' m/s → 波长 <b>λ = ' + fmt(r.lambda, 4) + ' m</b>' +
        '（' + fmt(r.lambda * 1000, 1) + ' mm），周期 T = ' + sci(r.period, 2) + ' s' +
        '<br>波数 k = ' + fmt(r.wavenumber, 3) + ' rad/m　角频率 ω = ' + fmt(r.omega, 1) + ' rad/s' +
        '<br>λ/2 = ' + fmt(r.half, 3) + ' m（房间轴向模态、半波共振）　λ/4 = ' + fmt(r.quarter, 3) +
        ' m（穿孔板 / 吸声尖劈起效尺度）' +
        '<div class="table-wrap"><table class="detail-table wide"><caption>常用倍频带波长速查（c = ' + fmt(c, 1) + ' m/s）</caption>' +
        '<thead><tr><th>中心频率 Hz</th><th>λ m</th><th>λ/2 m</th><th>λ/4 m</th></tr></thead><tbody>' + rows +
        '</tbody></table></div>', 'ok');
    });
    $('wvBtnWl2').addEventListener('click', function () {
      var r = W.freqFromWavelength({ lambda: pf($('wvLambda').value), c: pf($('wvC').value) });
      if (!r) { show($('wvOutWl'), '请填写声速与波长', 'warn'); return; }
      var nt = W.freqToNote(r.f);
      show($('wvOutWl'),
        'λ = ' + fmt(r.lambda, 4) + ' m @ ' + fmt(r.c, 1) + ' m/s → 频率 <b>' + fmt(r.f, 2) + ' Hz</b>' +
        '（周期 ' + sci(r.period, 2) + ' s）' + (nt ? '，最接近音名 <b>' + nt.name + '</b>（' +
          (nt.cents >= 0 ? '+' : '') + fmt(nt.cents, 0) + ' 音分）' : ''), 'ok');
    });

    /* ---------------- 3) 自由场声强 ---------------- */
    $('wvBtnI').addEventListener('click', function () {
      var P = pf($('wvP').value), lw = pf($('wvLw').value);
      if (!(P > 0) && lw != null) P = W.W0 * Math.pow(10, lw / 10);
      if (!(P > 0)) { show($('wvOutI'), '请填写声功率 W 或声功率级 dB', 'warn'); return; }
      var r = pf($('wvR').value), Q = pf($('wvQ').value);
      var ff = W.freeField({ power: P, r: r, Q: Q });
      if (!ff) { show($('wvOutI'), '请填写有效距离与指向性因子', 'warn'); return; }
      var rows = [1, 2, 5, 10, 20, 50, 100].map(function (rr) {
        var x = W.freeField({ power: P, r: rr, Q: Q });
        return '<tr><td>' + rr + '</td><td>' + sci(x.intensity, 2) + '</td><td>' + fmt(x.intensityLevel, 1) +
          '</td><td>' + fmt(x.spl, 1) + '</td></tr>';
      }).join('');
      show($('wvOutI'),
        '声功率 ' + sci(P, 2) + ' W（L<sub>W</sub> = ' + fmt(ff.powerLevel, 1) + ' dB）' +
        '<br>r = ' + fmt(r, 2) + ' m 处：声强 <b>' + sci(ff.intensity, 3) + ' W/m²</b>' +
        '　声强级 <b>' + fmt(ff.intensityLevel, 1) + ' dB</b>' +
        '<br>对应声压级 <b>' + fmt(ff.spl, 1) + ' dB</b>　声压 ' + fmt(ff.pressure * 1000, 3) + ' mPa' +
        '<div class="table-wrap"><table class="detail-table wide"><caption>随距离的衰减（Q = ' + fmt(Q, 2) + '）</caption>' +
        '<thead><tr><th>距离 m</th><th>声强 W/m²</th><th>L<sub>I</sub> dB</th><th>L<sub>p</sub> dB</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<span class="muted">自由场点声源每倍距离衰减 6 dB（I ∝ 1/r²）。Q = 1 全空间、2 半空间（贴地/贴墙）、4 四分之一空间（墙角）。</span>',
        'ok');
      var cv = W.decayCurve({ power: P, rFrom: Math.max(0.5, r / 8), rTo: Math.max(20, r * 8), Q: Q, n: 50 });
      if (Chart) {
        Chart.draw($('wvIChart'), {
          x: cv.r, xLog: true, yDigits: 0,
          xLabelFmt: function (v) { return (v >= 10 ? Math.round(v) : Number(v).toFixed(1)) + 'm'; },
          series: [{ values: cv.spl, color: cssVar('--primary', '#2563eb'), width: 2.2, points: false }]
        });
      }
    });

    /* ---------------- 4) 特性声阻抗与界面 ---------------- */
    fillMedia($('wvM1')); fillMedia($('wvM2'));
    function syncMedia(which) {
      var sel = $(which === 1 ? 'wvM1' : 'wvM2');
      var m = W.media(sel.value);
      if (!m) return;
      $(which === 1 ? 'wvRho1' : 'wvRho2').value = m.rho;
      $(which === 1 ? 'wvC1' : 'wvC2').value = m.c;
    }
    $('wvM1').addEventListener('change', function () { syncMedia(1); });
    $('wvM2').addEventListener('change', function () { syncMedia(2); });
    $('wvM1').value = 'air20'; syncMedia(1);
    $('wvM2').value = 'water'; syncMedia(2);

    $('wvBtnZ').addEventListener('click', function () {
      var z1 = W.characteristicImpedance({ rho: pf($('wvRho1').value), c: pf($('wvC1').value) });
      var z2 = W.characteristicImpedance({ rho: pf($('wvRho2').value), c: pf($('wvC2').value) });
      if (!z1 || !z2) { show($('wvOutZ'), '请填写两侧介质的密度与声速', 'warn'); return; }
      var ang = pf($('wvAng').value) || 0;
      var it = W.interface({
        Z1: z1.Z, Z2: z2.Z, c1: pf($('wvC1').value), c2: pf($('wvC2').value), theta: ang
      });
      var s = '';
      if (it.total) {
        s = '<br><span class="muted">入射角超过临界角，发生<b>全反射</b>，无透射声进入第二介质。</span>';
      }
      show($('wvOutZ'),
        '介质 1：Z₁ = ρc = <b>' + fmt(z1.Z, 1) + ' Pa·s/m</b>' +
        '　介质 2：Z₂ = <b>' + fmt(z2.Z, 1) + ' Pa·s/m</b>' +
        '　阻抗比 Z₂/Z₁ = <b>' + fmt(it.mismatch, 2) + '</b>' +
        '<br>声压反射系数 R<sub>p</sub> = ' + fmt(it.Rp, 5) + '　声压透射系数 T<sub>p</sub> = ' + fmt(it.Tp, 5) +
        '<br>声强反射系数 <b>' + fmt(it.reflection, 5) + '</b>　声强透射系数 <b>' + fmt(it.transmission, 6) + '</b>' +
        '<br>透射损失 TL = <b>' + fmt(it.transmissionLoss, 2) + ' dB</b>' +
        (it.oblique
          ? '<br>斜入射 ' + fmt(ang, 1) + '°：折射角 θ₂ = ' + fmt(it.theta2, 2) + '°' +
            (it.critical ? '，全反射临界角 θ<sub>c</sub> = ' + fmt(it.critical, 2) + '°' : '') + s
          : '<br><span class="muted">垂直入射。填入入射角可计算斜入射折射、临界角与全反射。</span>') +
        '<br><span class="muted">纯质量定律只适用于单层柔性板；这里的 TL 是「无限厚两种介质交界面」的阻抗失配极限，也是任何单层构造隔声量的物理上限参考。</span>',
        'ok');
    });

    /* ---------------- 5) 比值 ↔ 分贝 ---------------- */
    $('wvBtnR2D').addEventListener('click', function () {
      var mode = $('wvMode').value;
      var r = W.ratioToDb({ ratio: pf($('wvRto').value), mode: mode });
      if (!r) { show($('wvOutR'), '请填写大于 0 的比值', 'warn'); return; }
      show($('wvOutR'),
        (mode === 'field' ? '场量（声压/电压）' : '功率（声功率/声强）') + '比 ' + fmt(r.ratio, 4) +
        ' → <b>' + fmt(r.db, 3) + ' dB</b>' +
        '<br><span class="muted">' + (mode === 'field' ? '20·lg ' : '10·lg ') + fmt(r.ratio, 4) + ' = ' +
        fmt(r.db, 3) + ' dB</span>', 'ok');
    });
    $('wvBtnD2R').addEventListener('click', function () {
      var mode = $('wvMode').value;
      var r = W.dbToRatio({ db: pf($('wvDbv').value), mode: mode });
      if (!r) { show($('wvOutR'), '请填写分贝值', 'warn'); return; }
      show($('wvOutR'),
        fmt(r.db, 3) + ' dB → ' + (mode === 'field' ? '场量' : '功率') + '比 <b>' + fmt(r.ratio, 5) + '</b>' +
        '（即 ' + fmt(r.ratio, 3) + ' 倍' + (mode === 'field' ? '' : '，场量则为 ' + fmt(Math.sqrt(r.ratio), 3) + ' 倍') + '）', 'ok');
    });

    /* ---------------- 6) 乐音 ---------------- */
    $('wvBtnF2N').addEventListener('click', function () {
      var n = W.freqToNote(pf($('wvNoteF').value));
      if (!n) { show($('wvOutN'), '请填写频率', 'warn'); return; }
      show($('wvOutN'),
        fmt(n.freq, 2) + ' Hz → 最接近 <b>' + n.name + '</b>（MIDI ' + n.midi + '）' +
        '<br>偏差 <b>' + (n.cents >= 0 ? '+' : '') + fmt(n.cents, 1) + ' 音分</b>' +
        '（±50 音分内为该音，' + (Math.abs(n.cents) < 5 ? '基本准' : (Math.abs(n.cents) < 20 ? '略偏高/低' : '明显偏高/低')) + '）' +
        '<br>标准音高 ' + n.name + ' = ' + fmt(n.exactFreq, 3) + ' Hz（A4 = ' + W.A4 + ' Hz，十二平均律）', 'ok');
    });
    $('wvBtnN2F').addEventListener('click', function () {
      var n = W.noteToFreq($('wvNoteName').value);
      if (!n) { show($('wvOutN'), '音名格式如 A4、C#4、Bb3', 'warn'); return; }
      show($('wvOutN'), n.name + '（MIDI ' + n.midi + '）→ <b>' + fmt(n.freq, 3) + ' Hz</b>' +
        '<br>上八度 ' + fmt(n.freq * 2, 2) + ' Hz　下八度 ' + fmt(n.freq / 2, 2) + ' Hz', 'ok');
    });
    $('wvBtnBeat').addEventListener('click', function () {
      var iv = W.interval(pf($('wvB1').value), pf($('wvB2').value));
      if (!iv) { show($('wvOutN'), '请填写两个频率', 'warn'); return; }
      show($('wvOutN'),
        fmt(iv.f1, 2) + ' Hz 与 ' + fmt(iv.f2, 2) + ' Hz：音程 <b>' + fmt(iv.semitones, 3) + ' 半音</b>' +
        '（' + fmt(iv.cents, 1) + ' 音分，最近整数 ' + iv.nearest + ' 半音）' +
        '<br>拍频 <b>' + fmt(iv.beat, 3) + ' Hz</b>　' + iv.note, 'ok');
    });

    /* ---------------- 7) 管与弦共振 ---------------- */
    $('wvBtnPipe').addEventListener('click', function () {
      var r = W.pipeResonance({
        c: pf($('wvPipeC').value), L: pf($('wvPipeL').value),
        diameter: pf($('wvPipeD').value), kind: $('wvPipeKind').value, n: pf($('wvPipeN').value)
      });
      if (!r) { show($('wvOutPipe'), '请填写声速与管长', 'warn'); return; }
      var rows = r.harmonics.map(function (h) {
        return '<tr><td>' + h.n + '</td><td>' + (r.onlyOdd ? (2 * h.n - 1) + '（奇次）' : String(h.n)) +
          '</td><td>' + fmt(h.freq, 2) + '</td></tr>';
      }).join('');
      show($('wvOutPipe'),
        r.kind + '：L = ' + fmt(r.L, 3) + ' m' + (r.diameter > 0 ? '、内径 ' + fmt(r.diameter * 1000, 0) +
          ' mm → 管口修正 +' + fmt(r.endCorrection * 1000, 1) + ' mm，L<sub>eff</sub> = ' + fmt(r.Leff, 4) + ' m' : '') +
        '<br>基频 <b>f₁ = ' + fmt(r.f1, 2) + ' Hz</b>' + (r.onlyOdd ? '　（仅奇次谐波，比同长开管低一个八度）' : '') +
        '<div class="table-wrap"><table class="detail-table wide"><caption>谐波列（c = ' + fmt(r.c, 1) + ' m/s）</caption>' +
        '<thead><tr><th>序号 n</th><th>谐波次数</th><th>频率 Hz</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<span class="muted">开管 fₙ = n·c/(2L<sub>eff</sub>)（全部谐波）；闭管 fₙ = (2n−1)·c/(4L<sub>eff</sub>)（仅奇次）。管口修正按每端 0.6r 计。</span>',
        'ok');
    });
    $('wvBtnStr').addEventListener('click', function () {
      var r = W.stringResonance({
        L: pf($('wvStrL').value), tension: pf($('wvStrT').value),
        mu: pf($('wvStrMu').value), rho: pf($('wvStrRho').value),
        diameter: pf($('wvStrD').value), n: pf($('wvStrN').value)
      });
      if (!r) { show($('wvOutStr'), '请填写长度、张力，并给出线密度或（密度 + 直径）', 'warn'); return; }
      var rows = r.harmonics.map(function (h) {
        return '<tr><td>' + h.n + '</td><td>' + fmt(h.freq, 2) + '</td></tr>';
      }).join('');
      show($('wvOutStr'),
        '弦长 ' + fmt(r.L, 3) + ' m、张力 ' + fmt(r.tension, 1) + ' N、线密度 μ = ' + sci(r.mu, 3) + ' kg/m' +
        '<br>横波波速 v = √(T/μ) = <b>' + fmt(r.waveSpeed, 1) + ' m/s</b>' +
        '<br>基频 <b>f₁ = v/(2L) = ' + fmt(r.f1, 2) + ' Hz</b>' +
        '<div class="table-wrap"><table class="detail-table wide"><caption>谐波列（弦为整数倍）</caption>' +
        '<thead><tr><th>序号 n</th><th>频率 Hz</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<span class="muted">张力加倍 → 频率 ×√2；长度加倍 → 频率 ÷2。直径与材料密度可换算线密度 μ = ρ·π(d/2)²。</span>',
        'ok');
    });

    /* ---------------- 8) 多普勒 ---------------- */
    $('wvBtnDop').addEventListener('click', function () {
      var d = W.doppler({
        f: pf($('wvDopF').value), c: pf($('wvDopC').value),
        vs: pf($('wvDopVs').value), vo: pf($('wvDopVo').value)
      });
      if (!d) { show($('wvOutDop'), '请填写声速与源频率', 'warn'); return; }
      if (d.shock) {
        show($('wvOutDop'), '声源速度 ' + fmt(d.vs, 1) + ' m/s ≥ 声速 ' + fmt(d.c, 1) +
          ' m/s（马赫数 Ma = ' + fmt(d.mach, 2) + '）：<b>形成激波 / 音爆</b>，多普勒公式不再适用。', 'warn');
        return;
      }
      var dir = d.observed > d.f ? '升高' : (d.observed < d.f ? '降低' : '不变');
      show($('wvOutDop'),
        '源频率 ' + fmt(d.f, 2) + ' Hz，声速 ' + fmt(d.c, 1) + ' m/s' +
        '<br>观测频率 <b>' + fmt(d.observed, 2) + ' Hz</b>（' + dir + ' ' + fmt(Math.abs(d.shift), 2) +
        ' Hz，' + (d.percent >= 0 ? '+' : '') + fmt(d.percent, 2) + ' %）' +
        '<br>声源前方波长 λ′ = ' + fmt(d.wavelengthFront, 4) + ' m，后方 ' + fmt(d.wavelengthBack, 4) +
        ' m（原波长 ' + fmt(d.c / d.f, 4) + ' m）' +
        '<br>马赫数 Ma = v<sub>s</sub>/c = ' + fmt(d.mach, 3) +
        (d.note ? '<br><span class="muted">' + d.note + '</span>' : '') +
        '<br><span class="muted">约定：v<sub>s</sub> 声源向观察者运动取正，v<sub>o</sub> 观察者向声源运动取正；f′ = f·(c + v<sub>o</sub>)/(c − v<sub>s</sub>)。</span>',
        'ok');
    });
  }

  window.WaveView = { init: init, onShow: function () {} };
})();
