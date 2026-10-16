/*
 * speakerbox.js — 扬声器箱体设计内核（Thiele-Small 理论）
 *
 * UMD 包装：浏览器挂到 window.SpeakerBox，Node 下 module.exports。
 *
 * 覆盖：
 *   1) T/S 参数与 Vas：由 Mms/Sd/Fs 求 Vas；附加质量法测 Mms；
 *      阻抗峰法求 Qms/Qes/Qts；参考效率 η₀ 与灵敏度换算；
 *   2) 封闭箱（二阶）：α、fc、Qtc、f3、峰值与峰频、响应曲线；
 *   3) 倒相箱（四阶）：Small 系统函数（含箱损 Ql）、f3、通带纹波、
 *      响应与群延迟曲线、给定 Vb 求最平坦调谐；
 *   4) 导风管：由 Fb/Vb/管径求长度（含端修正）、由长度正算 Fb、端口风速校核；
 *   5) 箱体尺寸：按比例求内部三边尺寸。
 *
 * 单位约定（与国内音箱设计习惯一致）：
 *   Vas / Vb  L      Fs / Fb / fc  Hz    Sd  cm²    Mms  g
 *   Xmax  mm        管径 D / 管长 L  cm    箱体尺寸 cm
 *
 * 依据：
 *   - R. H. Small, "Closed-Box Loudspeaker Systems" / "Vented-Box Loudspeaker
 *     Systems", JAES 1972-1973；
 *   - S. Herzog, "Low Frequency Group Delay Equalization of Vented Boxes",
 *     DAFx-14（倒相箱系统函数系数 a₁/a₂/a₃ 与 Ql、α、h 的关系）；
 *   - L. L. Beranek, "Acoustics"（辐射阻抗与端修正）。
 *
 * 自校验（见 tests/speakerbox.test.js）：
 *   Qts = 0.383、Vb = Vas/1.4142、Fb = Fs 时应退化为四阶 Butterworth（B4）：
 *   通带纹波 ≈ 0 dB、f3 = Fs。本内核满足该锚点。
 */
(function (global) {
  'use strict';

  var C0 = 343;        // 声速 m/s
  var RHO = 1.21;      // 空气密度 kg/m³
  var P_REF = 20e-6;   // 参考声压 Pa

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function pos(v) {
    var n = num(v);
    return n == null || n <= 0 ? null : n;
  }

  // ============================ 1) T/S 参数与 Vas ============================

  // 参考效率 η₀（无量纲）：η₀ = 4π²/c³ · Fs³·Vas/Qes
  function refEfficiency(o) {
    o = o || {};
    var Fs = pos(o.Fs), Vas = pos(o.Vas), Qes = pos(o.Qes);
    if (Fs == null || Vas == null || Qes == null) return null;
    return 4 * Math.PI * Math.PI / Math.pow(C0, 3) * Math.pow(Fs, 3) * (Vas / 1000) / Qes;
  }

  // 灵敏度：半空间 112.1 + 10lg(η₀)；全空间 109.1 + 10lg(η₀)（dB / W / m）
  function sensitivity(o) {
    var eta = refEfficiency(o);
    if (eta == null || eta <= 0) return null;
    return {
      eta: eta,
      halfSpace: 112.1 + 10 * Math.log10(eta),
      fullSpace: 109.1 + 10 * Math.log10(eta),
      oneWatt: 112.1 + 10 * Math.log10(eta)
    };
  }

  // Sd（cm²）→ 由有效直径求面积
  function sdFromDiameter(dCm) {
    var d = pos(dCm);
    return d == null ? null : Math.PI * Math.pow(d / 2, 2);
  }

  // Vas = ρc²·Sd²/(Mms·ωs²)   [Sd cm², Mms g, Fs Hz → Vas L]
  function vasFromTS(o) {
    o = o || {};
    var Fs = pos(o.Fs), Mms = pos(o.Mms), Sd = pos(o.Sd);
    if (Fs == null || Mms == null || Sd == null) return null;
    var sd = Sd / 1e4;                 // m²
    var mms = Mms / 1000;              // kg
    var ws = 2 * Math.PI * Fs;
    return RHO * C0 * C0 * sd * sd / (mms * ws * ws) * 1000;   // L
  }

  // 附加质量法：加质量后谐振频率下降 → Mms = ΔM /((Fs/Fm)² − 1)
  function mmsFromAddedMass(o) {
    o = o || {};
    var Fs = pos(o.Fs), Fm = pos(o.Fm), dM = pos(o.addedMass);
    if (Fs == null || Fm == null || dM == null) return null;
    if (Fm >= Fs) return null;
    var r = Fs / Fm;
    return dM / (r * r - 1);
  }

  // 附加容积法：已知箱体容积 Vb 与装箱后谐振 Fc → Vas = Vb·((Fc/Fs)² − 1)
  function vasFromAddedVolume(o) {
    o = o || {};
    var Fs = pos(o.Fs), Fc = pos(o.Fc), Vb = pos(o.Vb);
    if (Fs == null || Fc == null || Vb == null) return null;
    if (Fc <= Fs) return null;
    return Vb * (Math.pow(Fc / Fs, 2) - 1);
  }

  // 阻抗峰法：由 Re、Zmax、Fs 与半功率频点 F1/F2 求 Qms/Qes/Qts
  function qFromImpedance(o) {
    o = o || {};
    var Re = pos(o.Re), Zmax = pos(o.Zmax), Fs = pos(o.Fs);
    var F1 = pos(o.F1), F2 = pos(o.F2);
    if (Re == null || Zmax == null || Fs == null || F1 == null || F2 == null) return null;
    if (Zmax <= Re || F2 <= F1) return null;
    var R0 = Zmax / Re;
    var Qms = Fs * Math.sqrt(R0) / (F2 - F1);
    var Qes = Qms / (R0 - 1);
    var Qts = Qms * Qes / (Qms + Qes);
    return { R0: R0, Qms: Qms, Qes: Qes, Qts: Qts, bw: F2 - F1 };
  }

  // 由阻抗曲线取半功率频点：|Z| = Re·√R0 处的上下两个穿越频率
  function halfPowerFreqs(curve, o) {
    o = o || {};
    var Re = pos(o.Re), Zmax = pos(o.Zmax);
    if (!curve || !curve.length || Re == null || Zmax == null) return null;
    var target = Re * Math.sqrt(Zmax / Re);
    var pts = curve.filter(function (p) {
      return p && isFinite(p.f) && isFinite(p.z);
    }).sort(function (a, b) { return a.f - b.f; });
    var up = null, down = null;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if ((a.z - target) * (b.z - target) <= 0 && b.f > a.f) {
        var t = (target - a.z) / (b.z - a.z);
        var f = a.f + t * (b.f - a.f);
        if (f < o.Fs && up == null) up = f;
        else if (f > o.Fs && down == null) down = f;
      }
    }
    if (up == null || down == null) return null;
    return { F1: up, F2: down, target: target };
  }

  // ============================ 2) 封闭箱（二阶） ============================

  // α = Vas/Vb；fc = Fs·√(1+α)；Qtc = Qts·√(1+α)；f3 = fc·√v
  function closedBox(o) {
    o = o || {};
    var Vas = pos(o.Vas), Fs = pos(o.Fs), Qts = pos(o.Qts), Vb = pos(o.Vb);
    if (Vas == null || Fs == null || Qts == null) return { ok: false, error: '需要 Vas / Fs / Qts' };

    var alpha, calcVb = false;
    if (Vb != null) {
      alpha = Vas / Vb;
    } else if (pos(o.Qtc) != null) {
      // 由目标 Qtc 反算容积：α = (Qtc/Qts)² − 1
      var q = pos(o.Qtc);
      alpha = Math.pow(q / Qts, 2) - 1;
      if (alpha <= 0) return { ok: false, error: '目标 Qtc 必须大于 Qts（否则箱体无穷大）' };
      Vb = Vas / alpha;
      calcVb = true;
    } else {
      return { ok: false, error: '需给出箱体容积 Vb 或目标 Qtc' };
    }

    var fc = Fs * Math.sqrt(1 + alpha);
    var Qtc = Qts * Math.sqrt(1 + alpha);

    // −3 dB 点：2v² = (1−v)² + v/Qtc² ⇒ v² + v(2 − 1/Qtc²) − 1 = 0
    var b = 2 - 1 / (Qtc * Qtc);
    var v = (-b + Math.sqrt(b * b + 4)) / 2;
    var f3 = fc * Math.sqrt(Math.max(v, 0));

    // Qtc > 0.7071 时出现峰：峰值 = 2Qtc²/√(4Qtc²−1)，峰频 = fc·√(2Qtc²/(2Qtc²−1))
    var peakDb = 0, fp = null;
    if (Qtc > Math.SQRT1_2) {
      peakDb = 20 * Math.log10(2 * Qtc * Qtc / Math.sqrt(4 * Qtc * Qtc - 1));
      fp = fc * Math.sqrt(2 * Qtc * Qtc / (2 * Qtc * Qtc - 1));
    }

    function response(f) {
      var x = pos(f);
      if (x == null) return null;
      var u = x / fc;
      var u2 = u * u;
      var den = Math.pow(1 - u2, 2) + Math.pow(u / Qtc, 2);
      return 20 * Math.log10(u2 / Math.sqrt(den));
    }

    return {
      ok: true, type: 'closed',
      alpha: alpha, Vb: Vb, VbComputed: calcVb,
      fc: fc, Qtc: Qtc, f3: f3,
      peakDb: peakDb, fp: fp,
      ripples: peakDb > 1,
      response: response,
      f10: (function () {          // −10 dB 点，用于看滚降
        var lo = fc * 0.01, hi = fc;
        for (var i = 0; i < 200; i++) {
          var mid = (lo + hi) / 2;
          if (response(mid) < -10) lo = mid; else hi = mid;
        }
        return hi;
      })()
    };
  }

  // 由目标 Qtc 直接给出所需容积（便于"我要 Qtc=0.707"）
  function closedVbForQtc(o) {
    o = o || {};
    var Vas = pos(o.Vas), Qts = pos(o.Qts), Qtc = pos(o.Qtc);
    if (Vas == null || Qts == null || Qtc == null) return null;
    if (Qtc <= Qts) return null;
    var alpha = Math.pow(Qtc / Qts, 2) - 1;
    return { alpha: alpha, Vb: Vas / alpha };
  }

  // ============================ 3) 倒相箱（四阶） ============================

  // 系统函数系数（DAFx-14 式 1-4）：
  //   h = Fb/Fs，α = Vas/Vb，f₀ = √(Fs·Fb)
  //   a₁ = 1/(Ql√h) + √h/Qts
  //   a₂ = (α+1)/h + h + 1/(Ql·Qts)
  //   a₃ = 1/(Qts√h) + √h/Ql
  //   G(s) = (s/ω₀)⁴ / [ (s/ω₀)⁴ + a₃(s/ω₀)³ + a₂(s/ω₀)² + a₁(s/ω₀) + 1 ]
  function ventedCoefs(o) {
    o = o || {};
    var Vas = pos(o.Vas), Fs = pos(o.Fs), Qts = pos(o.Qts);
    var Vb = pos(o.Vb), Fb = pos(o.Fb);
    var Ql = pos(o.Ql) == null ? 7 : pos(o.Ql);
    if (Vas == null || Fs == null || Qts == null || Vb == null || Fb == null) return null;
    var h = Fb / Fs;
    var alpha = Vas / Vb;
    var sh = Math.sqrt(h);
    return {
      h: h, alpha: alpha, Ql: Ql,
      f0: Math.sqrt(Fs * Fb),
      a1: 1 / (Ql * sh) + sh / Qts,
      a2: (alpha + 1) / h + h + 1 / (Ql * Qts),
      a3: 1 / (Qts * sh) + sh / Ql
    };
  }

  // 幅频响应（dB，高频归一化为 0 dB）与群延迟（ms）
  function ventedCurves(c) {
    var x4 = function (x) { return Math.pow(x, 4); };
    var D2 = function (x) {
      var x2 = x * x;
      var re = x4(x) - c.a2 * x2 + 1;
      var im = c.a1 * x - c.a3 * x * x2;
      return { re: re, im: im, mag2: re * re + im * im };
    };
    return {
      // |G| = x⁴/|D|
      spl: function (f) {
        var x = f / c.f0;
        if (x <= 0) return -Infinity;
        var d = D2(x);
        return 20 * Math.log10(x4(x) / Math.sqrt(d.mag2));
      },
      // 群延迟解析式：τ_x = Im(D'/D)，τ_ω = τ_x/ω₀
      groupDelay: function (f) {
        var x = f / c.f0, x2 = x * x, x3 = x2 * x;
        var d = D2(x);
        if (d.mag2 <= 0) return 0;
        var A = 4 * x3 - 2 * c.a2 * x;
        var B = c.a1 - 3 * c.a3 * x2;
        var im = B * d.re - A * d.im;      // Im(D'·conj(D))
        var tauX = im / d.mag2;
        return tauX / (2 * Math.PI * c.f0) * 1000;   // ms
      }
    };
  }

  function ventedBox(o) {
    o = o || {};
    var c = ventedCoefs(o);
    if (!c) return { ok: false, error: '需要 Vas / Fs / Qts / Vb / Fb' };
    var cur = ventedCurves(c);

    // 通带取 10·f₀ 作为高频参考，在 log 频率轴上扫首个 −3 dB 穿越点
    var fRef = c.f0 * 10;
    var spl = cur.spl;
    var f3 = null;
    (function () {
      var N = 400, lo = c.f0 * 0.02, hi = fRef;
      var prevF = lo, prevV = spl(lo);
      for (var i = 1; i <= N; i++) {
        var f = lo * Math.pow(hi / lo, i / N);
        var v = spl(f);
        if (prevV < -3 && v >= -3) {
          // 网格定位后做 log 轴二分细化到机器精度
          var a = prevF, b = f;
          for (var k = 0; k < 60; k++) {
            var m = Math.sqrt(a * b);
            if (spl(m) < -3) a = m; else b = m;
          }
          f3 = Math.sqrt(a * b);
          return;
        }
        prevF = f; prevV = v;
      }
    })();

    // 通带纹波：f3 以上至 10f₀ 区间内的最大正向偏离
    var ripple = 0, peakF = null;
    var fStart = f3 == null ? c.f0 * 0.5 : f3;
    for (var i = 0; i <= 300; i++) {
      var f = fStart * Math.pow(fRef / fStart, i / 300);
      var v = spl(f);
      if (v > ripple) { ripple = v; peakF = f; }
    }

    return {
      ok: true, type: 'vented',
      h: c.h, alpha: c.alpha, Ql: c.Ql, f0: c.f0, Fb: pos(o.Fb), Vb: pos(o.Vb),
      a1: c.a1, a2: c.a2, a3: c.a3,
      f3: f3, ripple: ripple, peakF: peakF,
      alignment: classifyAlignment(c, ripple, f3),
      spl: spl, groupDelay: cur.groupDelay
    };
  }

  // 依据系数判定对齐类型（A₁=A₂=A₃=0 即 B4）
  function classifyAlignment(c, ripple, f3) {
    var A1 = c.a1 * c.a1 - 2 * c.a2;
    var A2 = 2 + c.a2 * c.a2 - 2 * c.a1 * c.a3;
    var A3 = c.a3 * c.a3 - 2 * c.a2;
    var tol = 0.05;
    var flat = Math.abs(A1) < tol && Math.abs(A2) < tol && Math.abs(A3) < tol;
    var name = flat ? 'B4（四阶巴特沃斯 / 最平坦）'
      : ripple > 1 ? '欠阻尼（低频隆起 ' + ripple.toFixed(1) + ' dB）'
        : ripple < -3 ? '过阻尼（过早滚降）'
          : '准平坦（近似 B4）';
    return { A1: A1, A2: A2, A3: A3, flat: flat, name: name };
  }

  // 给定箱体容积，数值搜索最平坦的调谐频率 Fb
  function bestTuning(o) {
    o = o || {};
    var Vas = pos(o.Vas), Fs = pos(o.Fs), Qts = pos(o.Qts), Vb = pos(o.Vb);
    if (Vas == null || Fs == null || Qts == null || Vb == null) return null;
    var best = null;
    for (var i = 0; i <= 240; i++) {
      var Fb = Fs * (0.30 + i * (1.30 / 240));
      var r = ventedBox({ Vas: Vas, Fs: Fs, Qts: Qts, Vb: Vb, Fb: Fb, Ql: o.Ql });
      if (!r.ok || r.f3 == null) continue;
      var score = Math.abs(r.ripple);        // 纹波越小越好
      if (!best || score < best.score - 1e-4 ||
          (Math.abs(score - best.score) <= 1e-4 && r.f3 < best.f3)) {
        best = { Fb: Fb, f3: r.f3, ripple: r.ripple, score: score, alignment: r.alignment };
      }
    }
    return best;
  }

  // B4 精确对齐（仅 Qts = 0.383 成立）：Vb = Vas/√2，Fb = Fs，f3 = Fs
  function alignmentB4(o) {
    o = o || {};
    var Vas = pos(o.Vas), Fs = pos(o.Fs);
    if (Vas == null || Fs == null) return null;
    return {
      name: 'B4（四阶巴特沃斯）',
      requireQts: Math.sqrt(0.5 * (1 - Math.SQRT1_2)),   // 0.3827
      Vb: Vas / Math.SQRT2,
      Fb: Fs,
      f3: Fs,
      note: '仅当 Qts ≈ 0.383 时成立；其他 Qts 请用「最平坦调谐」反算 Fb'
    };
  }

  // ============================ 4) 导风管 ============================

  // 端修正系数 δ = k·D：一端有障板（法兰）+ 一端自由 k = 0.732；
  // 两端法兰 k = 0.85；两端自由 k = 0.61（Rayleigh 端修正 0.85r / 0.61r）
  var PORT_END_K = { baffled: 0.732, flanged: 0.85, free: 0.61 };

  // 由 Fb / Vb / 管径求管长：Leff = c²S/((2πFb)²Vb)，L = Leff − k·D
  function portLength(o) {
    o = o || {};
    var Fb = pos(o.Fb), Vb = pos(o.Vb), D = pos(o.D);
    if (Fb == null || Vb == null || D == null) return null;
    var ends = PORT_END_K[o.ends] == null ? PORT_END_K.baffled : PORT_END_K[o.ends];
    var Dm = D / 100, Vm3 = Vb / 1000;
    var S = Math.PI * Math.pow(Dm / 2, 2);
    var Leff = C0 * C0 * S / (Math.pow(2 * Math.PI * Fb, 2) * Vm3);
    var delta = ends * Dm;
    return {
      Leff: Leff * 100,           // cm
      delta: delta * 100,
      L: (Leff - delta) * 100,    // cm，物理管长
      endsK: ends,
      area: S * 1e4,              // cm²
      shortest: Leff - delta <= 0
    };
  }

  // 由管长正算调谐频率
  function portTuning(o) {
    o = o || {};
    var L = pos(o.L), Vb = pos(o.Vb), D = pos(o.D);
    if (L == null || Vb == null || D == null) return null;
    var ends = PORT_END_K[o.ends] == null ? PORT_END_K.baffled : PORT_END_K[o.ends];
    var Dm = D / 100, Vm3 = Vb / 1000;
    var S = Math.PI * Math.pow(Dm / 2, 2);
    var Leff = L / 100 + ends * Dm;
    return C0 / (2 * Math.PI) * Math.sqrt(S / (Vm3 * Leff));
  }

  // 端口风速校核：由目标声压级反算管内峰值流速
  //   p_rms = ρωU_rms/(2πr)（半空间单极子）⇒ U_rms = 2πr·p/(ρω)
  function portVelocity(o) {
    o = o || {};
    var Fb = pos(o.Fb), D = pos(o.D), Lp = pos(o.Lp) == null ? 1 : pos(o.Lp);
    var spl = num(o.spl) == null ? 100 : num(o.spl);
    var r = pos(o.r) == null ? 1 : pos(o.r);
    if (Fb == null || D == null) return null;
    var S = Math.PI * Math.pow(D / 100 / 2, 2) * Lp;
    var w = 2 * Math.PI * Fb;
    var p = P_REF * Math.pow(10, spl / 20);
    var U = 2 * Math.PI * r * p / (RHO * w);
    var vRms = U / S;
    var vPeak = vRms * Math.SQRT2;
    return {
      vRms: vRms, vPeak: vPeak,
      mach: vPeak / C0,
      level: vPeak <= 12 ? '优秀（几乎无风噪）'
        : vPeak <= 18 ? '可接受（大音量下轻微气流声）'
          : vPeak <= 25 ? '偏高（明显风噪，建议加大管径或改用多管）'
            : '过高（会产生强烈气流噪声，必须重新设计）'
    };
  }

  // 多管并联：N 根同径管的等效面积与单管长度
  function portCount(o) {
    o = o || {};
    var D = pos(o.D), N = pos(o.N);
    if (D == null || N == null) return null;
    return { D: D, N: N, area: Math.PI * Math.pow(D / 2, 2) * N, Deq: D * Math.sqrt(N) };
  }

  // ============================ 5) 箱体尺寸 ============================

  var BOX_RATIOS = [
    { id: 'golden', name: '黄金比例 1 : 1.618 : 2.618', r: [1, 1.618, 2.618] },
    { id: 'keele', name: 'Keele 1 : 1.26 : 1.59（抑制驻波）', r: [1, 1.26, 1.59] },
    { id: 'classic', name: '经典 1 : 1.3 : 1.6', r: [1, 1.3, 1.6] },
    { id: 'cube', name: '立方体 1 : 1 : 1（驻波最差，仅作对照）', r: [1, 1, 1] }
  ];

  // 由内部净容积 Vb(L) 与三边比例求内部三边尺寸（cm）
  function boxDims(o) {
    o = o || {};
    var Vb = pos(o.Vb);
    var r = o.ratio || [1, 1.618, 2.618];
    if (Vb == null || !r || r.length !== 3) return null;
    var prod = r[0] * r[1] * r[2];
    if (prod <= 0) return null;
    var k = Math.cbrt(Vb / prod);          // L = dm³
    return {
      Vb: Vb,
      ratio: r,
      dm: r.map(function (x) { return k * x; }),
      cm: r.map(function (x) { return k * x * 10; }),
      ratioText: r[0] + ' : ' + r[1] + ' : ' + r[2]
    };
  }

  // 扣除单元、倒相管与加强筋占用的净容积
  function netVolume(o) {
    o = o || {};
    var gross = pos(o.gross);
    if (gross == null) return null;
    var driver = pos(o.driver) || 0;
    var port = pos(o.port) || 0;
    var brace = pos(o.brace) || 0;
    var fill = num(o.fillPct) == null ? 0 : num(o.fillPct);
    // 填充吸声棉对容积的等效增益：约 +fillPct%（常用 5%~10%）
    var net = (gross - driver - port - brace) * (1 + fill / 100);
    return { net: net, displaced: driver + port + brace, fillGain: net - (gross - driver - port - brace) };
  }

  var API = {
    C0: C0, RHO: RHO,
    BOX_RATIOS: BOX_RATIOS, PORT_END_K: PORT_END_K,
    refEfficiency: refEfficiency,
    sensitivity: sensitivity,
    sdFromDiameter: sdFromDiameter,
    vasFromTS: vasFromTS,
    mmsFromAddedMass: mmsFromAddedMass,
    vasFromAddedVolume: vasFromAddedVolume,
    qFromImpedance: qFromImpedance,
    halfPowerFreqs: halfPowerFreqs,
    closedBox: closedBox,
    closedVbForQtc: closedVbForQtc,
    ventedCoefs: ventedCoefs,
    ventedCurves: ventedCurves,
    ventedBox: ventedBox,
    bestTuning: bestTuning,
    alignmentB4: alignmentB4,
    portLength: portLength,
    portTuning: portTuning,
    portVelocity: portVelocity,
    portCount: portCount,
    boxDims: boxDims,
    netVolume: netVolume
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.SpeakerBox = API;
})(typeof window !== 'undefined' ? window : this);
