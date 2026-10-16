/*
 * crossover.js — 扬声器分频器设计内核
 *
 * UMD 包装：浏览器挂到 window.Crossover，Node 下 module.exports。
 *
 * 重要工程前提：
 *   功率放大器输出阻抗近似为 0，分频网络为「电压驱动 + 负载 Z」。
 *   因此不能直接套用双端接（源/负载均为 R₀）的 g 值原型表——那样在
 *   电压源下得到的并非巴特沃斯响应。本内核按电压源直接推导元件值。
 *
 * 覆盖：
 *   1) 一阶（6 dB/oct）、二阶（12 dB/oct，可选 Q：巴特沃斯 / 贝塞尔 /
 *      Linkwitz-Riley / 契比雪夫）、三阶巴特沃斯（18 dB/oct）、
 *      四阶（24 dB/oct：LR4 = 两级二阶巴特沃斯级联；四阶巴特沃斯数值求解）；
 *   2) 传递函数与逐频响应、低通/高通合成（含极性翻转对比）；
 *   3) 阻抗补偿（Zobel 网络）；
 *   4) L-pad 衰减器（保持输入阻抗不变）。
 *
 * 元件单位：L 用 mH、C 用 µF 输出（音箱行业习惯），内部 SI。
 */
(function (global) {
  'use strict';

  var TWO_PI = 2 * Math.PI;

  // 二阶 Q 预设
  var Q_PRESETS = [
    { id: 'butter', name: '巴特沃斯（最平坦，Q = 0.707）', q: Math.SQRT1_2 },
    { id: 'lr2', name: 'Linkwitz-Riley LR2（Q = 0.5，同相相加）', q: 0.5 },
    { id: 'bessel', name: '贝塞尔（Q = 0.577，群延迟最平）', q: 0.5774 },
    { id: 'cheb05', name: '契比雪夫 0.5 dB（Q = 0.864）', q: 0.8637 },
    { id: 'cheb1', name: '契比雪夫 1 dB（Q = 0.957）', q: 0.9565 }
  ];

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function pos(v) { var n = num(v); return n == null || n <= 0 ? null : n; }

  // 巴特沃斯分母多项式 D(p) 系数（p = s/ω₀，由低次到高次）
  var BUTTER = {
    1: [1, 1],
    2: [1, Math.SQRT2, 1],
    3: [1, 2, 2, 1],
    4: [1, 2.613125929752753, 3.414213562373095, 2.613125929752753, 1]
  };

  // ============================ 元件值计算 ============================

  // 一阶：低通 L = Z/ω₀，高通 C = 1/(ω₀Z)
  function order1(fc, Z) {
    var a = TWO_PI * fc;
    var L = Z / a;
    var C = 1 / (a * Z);
    return { L: [L], C: [C], D: BUTTER[1] };
  }

  // 二阶（电压源）：C = Q/(ω₀Z)，L = Z/(Qω₀)
  function order2(fc, Z, Q) {
    var a = TWO_PI * fc;
    var C = Q / (a * Z);
    var L = Z / (Q * a);
    return { L: [L], C: [C], D: [1, 1 / Q, 1] };
  }

  // 三阶巴特沃斯（电压源，串联 L1 – 并联 C1 – 串联 L2 拓扑）
  //   解 D = 1 + 2p + 2p² + p³ ⇒ L1 = 1.5Z/ω₀，C1 = 4/(3ω₀Z)，L2 = 0.5Z/ω₀
  function order3(fc, Z) {
    var a = TWO_PI * fc;
    return { L: [1.5 * Z / a, 0.5 * Z / a], C: [4 / (3 * a * Z)], D: BUTTER[3] };
  }

  // 四阶 Linkwitz-Riley：两级相同的二阶巴特沃斯级联
  //   D 为基础二阶巴特沃斯多项式，cascade = 2 表示复数结果再平方一次
  function lr4(fc, Z) {
    var a = TWO_PI * fc;
    var C = Math.SQRT1_2 / (a * Z);
    var L = Z / (Math.SQRT1_2 * a);
    return { L: [L, L], C: [C, C], D: BUTTER[2], cascade: 2 };
  }

  // 四阶巴特沃斯（电压源，L1 – C1 – L2 – C2 梯形）
  //   D = 1 + a₁p + a₂p² + a₃p³ + p⁴，a₁ = a₃ = 2.6131，a₂ = 3.4142
  //   由 C₂ = 1/(a₁ω₀Z) 固定，其余按约束方程数值求解 L₁
  function order4(fc, Z) {
    var a = TWO_PI * fc;
    var a1 = 2.613125929752753, a2 = 3.414213562373095;
    var C2 = 1 / (a1 * a * Z);
    var sumL = a1 * Z / a;
    function residual(x) {
      var L2 = sumL - x;
      if (L2 <= 0 || x <= 0) return NaN;
      var C1 = a1 * Z / (a * a * a * x * L2);
      return x * C1 + x * C2 + L2 * C2 - a2 / (a * a);
    }
    // 扫描找符号变化区间，再二分
    var best = null;
    var N = 400;
    var prevX = null, prevV = null;
    for (var i = 1; i < N; i++) {
      var x = sumL * i / N;
      var v = residual(x);
      if (!isFinite(v)) continue;
      if (prevV != null && isFinite(prevV) && prevV * v <= 0) {
        var lo = prevX, hi = x;
        for (var k = 0; k < 80; k++) {
          var mid = (lo + hi) / 2;
          var vm = residual(mid);
          if (!isFinite(vm)) break;
          if (vm * residual(lo) <= 0) hi = mid; else lo = mid;
        }
        var L1 = (lo + hi) / 2;
        var L2f = sumL - L1;
        var C1f = a1 * Z / (a * a * a * L1 * L2f);
        best = { L: [L1, L2f], C: [C1f, C2], D: BUTTER[4] };
        break;
      }
      prevX = x; prevV = v;
    }
    return best;
  }

  // 主设计入口
  function design(o) {
    o = o || {};
    var fc = pos(o.fc), Z = pos(o.Z);
    if (fc == null || Z == null) return { ok: false, error: '需要分频频率 fc 与负载阻抗 Z' };
    var order = Number(o.order) || 2;
    var type = o.type || (order === 2 ? 'butter' : 'butter');

    var r = null, q = null, label = '', note = '', invert = false;

    if (order === 1) {
      r = order1(fc, Z);
      label = '一阶（6 dB/oct）';
      note = '一阶高通与低通本身相差 90°，合成响应在分频点约 −3 dB 且相位无法对齐，只用于全频单元辅助或超低音。';
    } else if (order === 2) {
      var preset = null;
      for (var i = 0; i < Q_PRESETS.length; i++) if (Q_PRESETS[i].id === type) preset = Q_PRESETS[i];
      if (!preset && pos(o.q) != null) preset = { id: 'custom', name: '自定义 Q = ' + pos(o.q), q: pos(o.q) };
      if (!preset) preset = Q_PRESETS[0];
      q = preset.q;
      r = order2(fc, Z, q);
      label = '二阶（12 dB/oct）· ' + preset.name;
      invert = true;      // 二阶高低通在分频点恰好反相，不反接会出现深谷
      note = (preset.id === 'lr2'
        ? 'LR2 由两级一阶级联，反接一路后两路在分频点同相，合成平直——这是 LR2 相对二阶巴特沃斯的核心优势。'
        : '二阶（偶数阶）高低通在分频点相差 180°，必须反接一路，否则分频处出现完全抵消的深谷；'
          + '反接后二阶巴特沃斯在分频点会有约 +3 dB 隆起，要平直请改用 LR2。')
        + ' Q = ' + q.toFixed(3) + '。';
    } else if (order === 3) {
      r = order3(fc, Z);
      label = '三阶巴特沃斯（18 dB/oct）';
      invert = false;
      note = '奇数阶高低通相差 90°，反接与否都无法完全对齐；三阶常用于需要较强高音保护的场合，'
        + '实际设计需微调分频点或利用单元的固有滚降来对齐。';
    } else if (order === 4) {
      if (type === 'lr4') {
        r = lr4(fc, Z);
        label = '四阶 Linkwitz-Riley（24 dB/oct）';
        invert = false;
        note = 'LR4 = 两级相同的二阶巴特沃斯级联（分频点各 −6 dB），高低通在分频点同相（相差 0°，'
          + '无需反接），合成平直，是专业音箱与主流 Hi-Fi 最常用的方案。';
      } else {
        r = order4(fc, Z);
        label = '四阶巴特沃斯（24 dB/oct）';
        invert = false;
        note = '四阶巴特沃斯由电压源条件数值求解。四阶高低通在分频点已同相，但两路各 −3 dB 相加后'
          + '为 +3 dB 隆起，要绝对平直仍应选 LR4。';
      }
    } else {
      return { ok: false, error: '仅支持 1~4 阶' };
    }

    if (!r) return { ok: false, error: '元件值求解失败，请检查参数' };

    var comps = [];
    r.L.forEach(function (v, i) {
      comps.push({ role: 'L', index: i + 1, value: v * 1000, unit: 'mH', label: 'L' + (r.L.length > 1 ? i + 1 : '') + ' 串联电感' });
    });
    r.C.forEach(function (v, i) {
      comps.push({ role: 'C', index: i + 1, value: v * 1e6, unit: 'µF', label: 'C' + (r.C.length > 1 ? i + 1 : '') + ' 并联电容' });
    });

    var d = {
      ok: true, order: order, label: label, note: note, fc: fc, Z: Z, q: q,
      invert: invert, cascade: r.cascade || 1,
      L: r.L.slice(), C: r.C.slice(), components: comps,
      D: r.D
    };
    return d;
  }

  // ============================ 响应计算 ============================

  // D(p) 的多项式求值（复）
  function polyEval(coef, pr, pi) {
    // 由低次到高次 Horner
    var re = 0, im = 0;
    for (var i = coef.length - 1; i >= 0; i--) {
      var nr = re * pr - im * pi + coef[i];
      var ni = re * pi + im * pr;
      re = nr; im = ni;
    }
    return { re: re, im: im };
  }

  function hDb(re, im, numRe, numIm) {
    var nr = numRe, ni = numIm;
    var dr = re, di = im;
    var num = Math.hypot(nr, ni), den = Math.hypot(dr, di);
    if (den === 0) return -Infinity;
    return 20 * Math.log10(num / den);
  }

  // 单次响应：返回 { lp, hp, sum }（dB）
  function response(d, f, polarity) {
    if (!d || !d.ok) return null;
    var x = num(f);
    if (x == null || x <= 0) return null;
    var p = x / d.fc;                    // 归一化频率 p = ω/ω₀（虚部）
    // 级联型（LR4）以二阶为基础多项式，复数结果再平方一次
    var casc = d.cascade || 1;
    var n = casc > 1 ? 2 : d.order;
    var coef = casc > 1 ? BUTTER[2] : d.D;
    var sig = polarity == null ? (d.invert ? -1 : 1) : polarity;

    function magDb(high) {
      var D = polyEval(coef, 0, p);       // p = j·p
      // 分子：低通 1，高通 (jp)^n
      var numRe, numIm;
      if (!high) { numRe = 1; numIm = 0; }
      else {
        var angle = n * Math.PI / 2;
        var r = Math.pow(p, n);
        numRe = r * Math.cos(angle);
        numIm = r * Math.sin(angle);
      }
      var val = hDb(D.re, D.im, numRe, numIm);
      return val * casc;
    }

    var lpDb = magDb(false);
    var hpDb = magDb(true);
    // 合成：复数和（同一归一化下），低通相位 0、高通相位由 (jp)^n/D 决定
    function cplx(high) {
      var D = polyEval(coef, 0, p);
      var numRe, numIm;
      if (!high) { numRe = 1; numIm = 0; }
      else {
        var angle = n * Math.PI / 2;
        var r = Math.pow(p, n);
        numRe = r * Math.cos(angle);
        numIm = r * Math.sin(angle);
      }
      var den = D.re * D.re + D.im * D.im;
      if (den === 0) return { re: 0, im: 0 };
      var re = (numRe * D.re + numIm * D.im) / den;
      var im = (numIm * D.re - numRe * D.im) / den;
      for (var c = 1; c < casc; c++) {
        var re2 = re * re - im * im, im2 = 2 * re * im;
        re = re2; im = im2;
      }
      return { re: re, im: im };
    }
    var a = cplx(false), b = cplx(true);
    var sr = a.re + sig * b.re, si = a.im + sig * b.im;
    var sumDb = 20 * Math.log10(Math.hypot(sr, si));

    return { f: x, lp: lpDb, hp: hpDb, sum: sumDb };
  }

  // 生成一组采样曲线
  function sweep(d, opts) {
    opts = opts || {};
    var lo = pos(opts.fLow) || d.fc / 20;
    var hi = pos(opts.fHigh) || d.fc * 20;
    var n = opts.n || 160;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var f = lo * Math.pow(hi / lo, i / n);
      out.push(response(d, f));
    }
    return out;
  }

  // 反算：按一阶关系 L = Z/ω₀、C = 1/(ω₀Z) 由实测元件值估算分频频率
  function fcFromComponents(o) {
    o = o || {};
    var Z = pos(o.Z);
    var L = pos(o.L), C = pos(o.C);      // L in mH, C in µF
    if (Z == null) return null;
    var res = [];
    if (L != null) res.push({ from: '电感（一阶关系）', fc: Z / (TWO_PI * (L / 1000)) });
    if (C != null) res.push({ from: '电容（一阶关系）', fc: 1 / (TWO_PI * (C / 1e6) * Z) });
    if (!res.length) return null;
    return { items: res, Z: Z };
  }

  // ============================ 阻抗补偿 Zobel ============================

  // 与扬声器并联的 Rz + Cz 串联网络，抵消音圈电感引起的阻抗上升
  //   Rz ≈ k·Re（默认 1.25），Cz = Le/Rz²
  function zobel(o) {
    o = o || {};
    var Re = pos(o.Re), Le = pos(o.Le);     // Le in mH
    if (Re == null || Le == null) return null;
    var k = pos(o.k) == null ? 1.25 : pos(o.k);
    var Rz = Re * k;
    var Cz = (Le / 1000) / (Rz * Rz);       // F
    return {
      Rz: Rz, Cz: Cz * 1e6, k: k,
      note: 'Rz 取 ' + k + '×Re、Cz = Le/Rz²，把中高频阻抗拉回接近 Re，' +
        '避免分频点随频率漂移（对二阶以上分频影响显著）'
    };
  }

  // ============================ L-pad 衰减器 ============================

  // 保持输入阻抗 = Z 的前提下衰减 X dB（电压比 k = 10^(−X/20)）
  //   R_series = Z(1−k)，R_shunt = kZ/(1−k)
  function lpad(o) {
    o = o || {};
    var dB = num(o.dB), Z = pos(o.Z);
    if (dB == null || Z == null || dB < 0) return null;
    var k = Math.pow(10, -dB / 20);
    if (k >= 1) return { dB: 0, Rseries: 0, Rshunt: Infinity, k: 1 };
    var Rs = Z * (1 - k);
    var Rp = k * Z / (1 - k);
    var check = Rs + (Rp * Z) / (Rp + Z);
    return {
      dB: dB, k: k, Rseries: Rs, Rshunt: Rp, Zin: check,
      note: '串联 ' + Rs.toFixed(2) + ' Ω 后并 ' + Rp.toFixed(2) + ' Ω，输入阻抗仍为 ' + check.toFixed(2) + ' Ω'
    };
  }

  // ============================ 灵敏度差补偿 ============================

  // 由两单元灵敏度差建议衰减量（并考虑 BSC 等预留）
  function levelMatch(o) {
    o = o || {};
    var tw = num(o.tweeterSpl), wf = num(o.wooferSpl);
    if (tw == null || wf == null) return null;
    var diff = tw - wf;
    return {
      diff: diff,
      target: Math.abs(diff),
      louder: diff > 0 ? '高音更响，需衰减高音' : diff < 0 ? '低音更响，需衰减低音' : '两者灵敏度一致',
      note: diff > 0
        ? '高通后加 L-pad 衰减 ' + Math.abs(diff).toFixed(1) + ' dB（须计入分频网络自身插入损耗）'
        : '低通串电阻会改变 Q 与分频点，建议改用输出变压器或选择灵敏度匹配的单元'
    };
  }

  var API = {
    Q_PRESETS: Q_PRESETS,
    BUTTER: BUTTER,
    design: design,
    response: response,
    sweep: sweep,
    polyEval: polyEval,
    fcFromComponents: fcFromComponents,
    zobel: zobel,
    lpad: lpad,
    levelMatch: levelMatch
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.Crossover = API;
})(typeof window !== 'undefined' ? window : this);
