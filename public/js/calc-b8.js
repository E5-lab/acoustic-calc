/*
 * calc-b8.js — 声明式计算器 · 振动与结构（4 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 本块清单（route / 名称，nav.group 均为「振动与结构」）：
 *   transmissibility  单自由度隔振传递率（频率比 r=f/fn、阻尼比 ζ → 传递率 T、隔振效率）
 *   natural-freq      梁/板/弹簧固有频率（质量-弹簧严格式 + 简支梁/简支方板一阶模态近似）
 *   wave-vib          结构弯曲波速（弯曲刚度 D、面密度、频率 → 弯曲波相速度/群速度/波长/波数）
 *   isolator-pick     隔振器选型（设备质量、干扰频率、目标隔振量 → 反推频率比/固有频率/静变形/刚度）
 */
(function () {
  'use strict';

  var G0 = 9.80665;   // 标准重力加速度 m/s²

  // 传递率公共式：基础激励下位移/力传递率同式
  //   T(r,ζ) = √((1+(2ζr)²) / ((1−r²)²+(2ζr)²))
  function transRatio(r, z) {
    var a = 2 * z * r;
    var den = (1 - r * r) * (1 - r * r) + a * a;
    if (!(den > 0)) return Infinity;         // 仅 ζ=0 且 r=1（无阻尼共振）
    return Math.sqrt((1 + a * a) / den);
  }

  // ============================ 1) 单自由度隔振传递率 ============================
  CalcRegistry.register('transmissibility', {
    title: '单自由度隔振传递率 · 声学计算工具箱',
    nav: {
      group: '振动与结构',
      label: '隔振传递率',
      desc: '频率比+阻尼比 → 传递率/隔振效率',
      sub: ['T(r,ζ)', '隔振区 r>√2', '效率 (1−T)']
    },
    intro: '单自由度系统受基础激励时，传递率 T 描述振动跨隔振器的传递能力；r>√2 进入隔振区，T<1。',
    inputs: [
      { key: 'f', label: '干扰频率 f', unit: 'Hz', def: 50, step: 1, min: 0.01 },
      { key: 'fn', label: '系统固有频率 fₙ', unit: 'Hz', def: 15, step: 0.5, min: 0.01 },
      { key: 'zeta', label: '阻尼比 ζ', unit: '', def: 0.05, step: 0.01, min: 0, max: 2 }
    ],
    outputs: [
      { key: 'r', label: '频率比 r', unit: '', digits: 3 },
      { key: 'T', label: '传递率 T', unit: '', digits: 4 },
      { key: 'eff', label: '隔振效率 η', unit: '%', digits: 2 },
      { key: 'att', label: '振级衰减量', unit: 'dB', digits: 2, note: '−20·log₁₀T' }
    ],
    compute: function (s) {
      if (!isFinite(s.f) || !isFinite(s.fn) || !isFinite(s.zeta) ||
        s.f <= 0 || s.fn <= 0 || s.zeta < 0) {
        return { ok: false, error: '请输入有效的正频率，以及不小于 0 的阻尼比。', values: {}, formula: '', notes: [] };
      }
      var r = s.f / s.fn;
      var T = transRatio(r, s.zeta);
      if (!isFinite(T)) {
        return {
          ok: false,
          error: 'ζ=0 且 r=1（无阻尼共振）时传递率无界，请取 ζ>0。',
          values: { r: r },
          formula: 'r = f/fₙ = ' + s.f + '/' + s.fn + ' = <span class="fx">' + r.toFixed(3) + '</span>；' +
            'ζ=0 且 r=1 时分母为 0，T→∞',
          notes: [{ level: 'warn', text: '无阻尼系统在 r=1 处传递率无界；实际结构总有阻尼，峰值 T≈1/(2ζ)。' }]
        };
      }
      var eff = (1 - T) * 100;
      var att = T > 0 ? -20 * Math.log10(T) : Infinity;
      return {
        ok: true,
        values: { r: r, T: T, eff: eff, att: att },
        formula: 'r = f/fₙ = ' + s.f.toFixed(2) + '/' + s.fn.toFixed(2) + ' = <span class="fx">' + r.toFixed(3) + '</span>\n' +
          'T = √((1+(2ζr)²)/((1−r²)²+(2ζr)²))，2ζr = ' + (2 * s.zeta * r).toFixed(4) + '\n' +
          'T = <span class="fx">' + T.toFixed(4) + '</span>；' +
          'η = (1−T)×100% = <span class="fx">' + eff.toFixed(2) + '%</span>；' +
          '振级衰减 = −20·log₁₀T = <span class="fx">' + att.toFixed(2) + ' dB</span>',
        notes: [
          { level: r > Math.SQRT2 ? 'ok' : 'warn',
            text: r > Math.SQRT2
              ? 'r>√2，处于隔振区：T<1，干扰被衰减；r 越大（fₙ 越低）隔振越好。'
              : 'r<√2，处于放大区：T>1，隔振器反而放大振动，隔振设计无效。' },
          { level: 'info', text: 'ζ 增大可压低共振峰（r≈1 处 T≈1/(2ζ)），但高频隔振量随之变差。' },
          { level: 'info', text: '基础激励下位移传递率与力传递率同式；隔振效率 η=(1−T)×100%。' }
        ]
      };
    }
  });

  // ============================ 2) 梁/板/弹簧固有频率 ============================
  CalcRegistry.register('natural-freq', {
    title: '梁/板/弹簧固有频率 · 声学计算工具箱',
    nav: {
      group: '振动与结构',
      label: '结构固有频率',
      desc: '弹簧/简支梁/简支板一阶模态',
      sub: ['(1/2π)√(k/m)', '梁/板近似']
    },
    intro: '质量-弹簧系统用严格式 fₙ=(1/2π)√(k/m)；简支梁/简支方板给一阶弯曲模态近似（Euler-Bernoulli）。',
    inputs: [
      { key: 'type', label: '系统类型', type: 'select', def: 'spring',
        options: [
          { value: 'spring', label: '质量-弹簧系统（严格式）' },
          { value: 'beam', label: '简支梁一阶弯曲' },
          { value: 'plate', label: '简支方板一阶弯曲' }
        ] },
      { key: 'm', label: '质量 m', unit: 'kg', def: 10, step: 1, min: 0.001 },
      { key: 'k', label: '刚度 k', unit: 'N/m', def: 20000, step: 1000, min: 0.001 },
      { key: 'E', label: '杨氏模量 E', unit: 'GPa', def: 210, step: 5, min: 0.1 },
      { key: 'b', label: '宽度 b', unit: 'mm', def: 50, step: 5, min: 0.01 },
      { key: 'h', label: '高度/板厚 h', unit: 'mm', def: 10, step: 1, min: 0.01 },
      { key: 'L', label: '长度 L', unit: 'm', def: 2, step: 0.1, min: 0.01 },
      { key: 'rho', label: '密度 ρ', unit: 'kg/m³', def: 7850, step: 50, min: 1 },
      { key: 'nu', label: '泊松比 ν', unit: '', def: 0.3, step: 0.01, min: 0, max: 0.49 }
    ],
    outputs: [
      { key: 'fn', label: '一阶固有频率 f₁', unit: 'Hz', digits: 3 },
      { key: 'wn', label: '固有圆频率 ω₁', unit: 'rad/s', digits: 2 }
    ],
    compute: function (s) {
      var Epa = s.E * 1e9, bm = s.b / 1000, hm = s.h / 1000;
      var bad = !isFinite(s.m) || !isFinite(s.k) || !isFinite(s.E) || !isFinite(s.b) ||
        !isFinite(s.h) || !isFinite(s.L) || !isFinite(s.rho) || !isFinite(s.nu);
      if (bad || s.E <= 0 || s.b <= 0 || s.h <= 0 || s.L <= 0 || s.rho <= 0 || s.nu < 0 || s.nu >= 1) {
        return { ok: false, error: '请输入有效的材料与几何参数（E、b、h、L、ρ>0，0≤ν<1）。', values: {}, formula: '', notes: [] };
      }
      if (s.type === 'beam' || s.type === 'plate') {
        var wn, fn, auxLabel, auxVal, auxUnit, expr;
        if (s.type === 'beam') {
          var I = bm * hm * hm * hm / 12;              // 矩形截面惯性矩 m⁴
          var m1 = s.rho * bm * hm;                    // 线密度 kg/m
          var EI = Epa * I;                            // 弯曲刚度 N·m²
          wn = Math.PI * Math.PI * Math.sqrt(EI / (m1 * s.L * s.L * s.L * s.L));
          fn = wn / (2 * Math.PI);
          auxLabel = '截面惯性矩 I'; auxVal = I; auxUnit = 'm⁴';
          expr = '简支梁：ω₁ = π²·√(EI/(m′L⁴))，I = b·h³/12 = ' + I.toExponential(3) + ' m⁴，m′ = ρ·b·h = ' +
            m1.toFixed(3) + ' kg/m，EI = ' + EI.toExponential(3) + ' N·m²';
        } else {
          var D = Epa * hm * hm * hm / (12 * (1 - s.nu * s.nu));  // 板弯曲刚度 N·m
          var ms = s.rho * hm;                                     // 面密度 kg/m²
          // 简支方板 a=b=L：ω₁₁ = π²·√(D/ρh)·(1/a²+1/b²) = 2π²·√(D/ρh)/L²
          wn = Math.PI * Math.PI * Math.sqrt(D / ms) * (2 / (s.L * s.L));
          fn = wn / (2 * Math.PI);
          auxLabel = '板弯曲刚度 D'; auxVal = D; auxUnit = 'N·m';
          expr = '简支方板(a=b=L)：ω₁₁ = π²·√(D/ρh)·(1/a²+1/b²)，D = Eh³/(12(1−ν²)) = ' + D.toExponential(3) +
            ' N·m，ρh = ' + ms.toFixed(3) + ' kg/m²';
        }
        return {
          ok: true,
          values: { fn: fn, wn: wn },
          formula: expr + '\nf₁ = ω₁/(2π) = <span class="fx">' + fn.toFixed(3) + ' Hz</span>；' +
            auxLabel + ' = ' + auxVal.toExponential(3) + ' ' + auxUnit,
          notes: [
            { level: 'info', text: '梁/板公式按 Euler-Bernoulli 理论（忽略剪切变形与转动惯量），假设均质等截面、理想简支边界，属一阶近似。' },
            { level: 'warn', text: '实际边界条件（固支/弹性支承）、附加质量与刚度分布都会改变 f₁；方板按 a=b=L 计算，矩形板需按 (1/a²+1/b²) 折算。' }
          ]
        };
      }
      // 质量-弹簧系统（严格式）
      if (!(s.m > 0 && s.k > 0)) {
        return { ok: false, error: '质量-弹簧系统需要 m>0 且 k>0。', values: {}, formula: '', notes: [] };
      }
      var wnS = Math.sqrt(s.k / s.m);
      var fnS = wnS / (2 * Math.PI);
      var dSt = 1000 * s.m * G0 / s.k;   // 静变形 mm
      return {
        ok: true,
        values: { fn: fnS, wn: wnS },
        formula: 'fₙ = (1/2π)·√(k/m) = (1/2π)·√(' + s.k + '/' + s.m + ') = <span class="fx">' + fnS.toFixed(3) + ' Hz</span>\n' +
          'ωₙ = √(k/m) = <span class="fx">' + wnS.toFixed(2) + ' rad/s</span>；' +
          '重力静变形 δ = mg/k = ' + dSt.toFixed(2) + ' mm',
        notes: [
          { level: 'info', text: '严格式：增大刚度 k 或减小质量 m 均抬高固有频率；δ=mg/k 与 fₙ 满足 fₙ≈(1/2π)√(g/δ)（g 取 9.80665）。' },
          { level: 'info', text: '切换到「简支梁/简支方板」可估算结构件的一阶弯曲模态（理想边界近似）。' }
        ]
      };
    }
  });

  // ============================ 3) 结构弯曲波速 ============================
  CalcRegistry.register('wave-vib', {
    title: '结构弯曲波速 · 声学计算工具箱',
    nav: {
      group: '振动与结构',
      label: '结构弯曲波速',
      desc: '板材料+频率 → 弯曲波相速度',
      sub: ['c_f∝√f（频散）', 'c_g=2c_f', 'D=Eh³/12(1−ν²)']
    },
    intro: '板/梁中的弯曲波是频散波：相速度随 √f 增长。给定材料与板厚，求弯曲波相速度、群速度、波长与波数。',
    inputs: [
      { key: 'E', label: '杨氏模量 E', unit: 'GPa', def: 210, step: 5, min: 0.1 },
      { key: 'nu', label: '泊松比 ν', unit: '', def: 0.3, step: 0.01, min: 0, max: 0.49 },
      { key: 'rho', label: '密度 ρ', unit: 'kg/m³', def: 7850, step: 50, min: 1 },
      { key: 'h', label: '板厚 h', unit: 'mm', def: 2, step: 0.5, min: 0.01 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 1000, step: 100, min: 0.1 }
    ],
    outputs: [
      { key: 'cf', label: '弯曲波相速度 c_f', unit: 'm/s', digits: 2 },
      { key: 'cg', label: '弯曲波群速度 c_g', unit: 'm/s', digits: 2, note: '= 2·c_f' },
      { key: 'lam', label: '弯曲波长 λ_f', unit: 'm', digits: 4 },
      { key: 'kf', label: '弯曲波数 k_f', unit: 'rad/m', digits: 3 }
    ],
    compute: function (s) {
      if (!isFinite(s.E) || !isFinite(s.nu) || !isFinite(s.rho) || !isFinite(s.h) || !isFinite(s.f) ||
        s.E <= 0 || s.rho <= 0 || s.h <= 0 || s.f <= 0 || s.nu < 0 || s.nu >= 1) {
        return { ok: false, error: '请输入有效的材料参数（E、ρ、h>0，0≤ν<1）与正频率。', values: {}, formula: '', notes: [] };
      }
      var hm = s.h / 1000;
      var D = s.E * 1e9 * hm * hm * hm / (12 * (1 - s.nu * s.nu));  // 弯曲刚度 N·m
      var ms = s.rho * hm;                                          // 面密度 kg/m²
      var beta = Math.sqrt(D / ms);                                 // √(D/ρh)，m²/s
      var w = 2 * Math.PI * s.f;
      // 严格解：c_f = √(ω)·(D/ρh)^¼ = √(ω·√(D/ρh))（量纲 m/s；开平方内为 D 的平方根量）
      var cf = Math.sqrt(w * beta);
      var cg = 2 * cf;
      var lam = cf / s.f;
      var kf = w / cf;
      return {
        ok: true,
        values: { cf: cf, cg: cg, lam: lam, kf: kf },
        formula: 'D = E·h³/(12(1−ν²)) = ' + D.toExponential(3) + ' N·m；面密度 ρh = ' + ms.toFixed(3) + ' kg/m²\n' +
          'c_f = √(ω)·(D/ρh)^¼ = √(2πf·√(D/ρh)) = √(' + w.toFixed(1) + '×' + beta.toFixed(4) + ') = ' +
          '<span class="fx">' + cf.toFixed(2) + ' m/s</span>\n' +
          'c_g = 2·c_f = <span class="fx">' + cg.toFixed(2) + ' m/s</span>；' +
          'λ_f = c_f/f = <span class="fx">' + lam.toFixed(4) + ' m</span>',
        notes: [
          { level: 'info', text: '弯曲波为频散波：c_f ∝ √f（与纵/横波的常速不同）；f 越高波长越短，板的弯曲刚度效应越显著。' },
          { level: 'info', text: '严格解为 c_f = √(ω)·(D/ρh)^¼（等价 c_f² = ω·√(D/ρh)）；注意开平方内是 D 的平方根量，保证量纲为 m/s。' },
          { level: 'warn', text: '当弯曲波长与板厚同量级（c_f 接近材料纵波声速）时 Euler-Bernoulli 假设失效，需改用 Mindlin 厚板理论。' }
        ]
      };
    }
  });

  // ============================ 4) 隔振器选型 ============================
  CalcRegistry.register('isolator-pick', {
    title: '隔振器选型 · 声学计算工具箱',
    nav: {
      group: '振动与结构',
      label: '隔振器选型',
      desc: '设备+干扰频率+目标隔振量 → 静变形/刚度',
      sub: ['反推 fₙ', 'δ=g/(2πfₙ)²', 'k=m(2πfₙ)²']
    },
    intro: '由目标隔振量反推隔振器参数：解 T(r,ζ)=目标值得所需频率比，再得固有频率、静变形与支承刚度。',
    inputs: [
      { key: 'W', label: '设备质量 W', unit: 'kg', def: 1000, step: 50, min: 0.1 },
      { key: 'f', label: '干扰频率 f', unit: 'Hz', def: 50, step: 1, min: 0.1 },
      { key: 'il', label: '目标隔振量 IL', unit: 'dB', def: 25, step: 1, min: 0 },
      { key: 'zeta', label: '隔振器阻尼比 ζ', unit: '', def: 0.05, step: 0.01, min: 0, max: 2 },
      { key: 'n', label: '隔振器只数 n', unit: '只', def: 4, step: 1, min: 1 }
    ],
    outputs: [
      { key: 'r', label: '所需频率比 r', unit: '', digits: 3 },
      { key: 'fn', label: '所需固有频率 fₙ', unit: 'Hz', digits: 3 },
      { key: 'delta', label: '所需静变形 δ', unit: 'mm', digits: 3 },
      { key: 'ktot', label: '总刚度 k', unit: 'N/m', digits: 0 },
      { key: 'keach', label: '单只刚度 k/n', unit: 'N/m', digits: 0 },
      { key: 'eff', label: '隔振效率 η', unit: '%', digits: 2 }
    ],
    compute: function (s) {
      if (!isFinite(s.W) || !isFinite(s.f) || !isFinite(s.il) || !isFinite(s.zeta) || !isFinite(s.n) ||
        s.W <= 0 || s.f <= 0 || s.il < 0 || s.zeta < 0 || s.n < 1) {
        return { ok: false, error: '请输入有效的质量/频率/目标隔振量（IL≥0）、阻尼比与只数（n≥1）。', values: {}, formula: '', notes: [] };
      }
      var Tt = Math.pow(10, -s.il / 20);            // 目标传递率
      var Tmax = transRatio(1, s.zeta);              // r=1 处峰值（无阻尼时 ∞）
      if (!(Tt < Tmax)) {
        var maxDb = isFinite(Tmax) ? (20 * Math.log10(Tmax)) : Infinity;
        return {
          ok: false,
          error: '目标隔振量超出该阻尼比的理论能力：IL 需大于 ' +
            (isFinite(maxDb) ? maxDb.toFixed(2) : '∞') + ' dB（ζ=' + s.zeta + ' 时峰值传递率 ' +
            (isFinite(Tmax) ? Tmax.toFixed(3) : '∞') + '）。',
          values: {},
          formula: 'T(r=1,ζ) = √((1+4ζ²)/(4ζ²)) = ' + (isFinite(Tmax) ? Tmax.toFixed(3) : '∞') +
            ' → 理论最大隔振量 ' + (isFinite(maxDb) ? maxDb.toFixed(2) : '∞') + ' dB',
          notes: [{ level: 'warn', text: '阻尼比越大，共振峰越低、可获得的隔振量上限越小；金属弹簧 ζ≈0.01~0.05，橡胶约 0.05~0.15。' }]
        };
      }
      // 二分解 T(r,ζ)=Tt（r>1 区间 T 单调递减，T(√2)=1）
      var lo = 1, hi = 1e6, i, mid;
      if (transRatio(hi, s.zeta) > Tt) {
        return {
          ok: false,
          error: '所需频率比超过 10⁶（等效固有频率近乎为 0），工程上不可实现。',
          values: {}, formula: '', notes: []
        };
      }
      for (i = 0; i < 200; i++) {
        mid = (lo + hi) / 2;
        if (transRatio(mid, s.zeta) > Tt) lo = mid; else hi = mid;
      }
      var r = (lo + hi) / 2;
      var fn = s.f / r;
      var delta = 1000 * G0 / Math.pow(2 * Math.PI * fn, 2);   // 静变形 mm
      var ktot = s.W * Math.pow(2 * Math.PI * fn, 2);          // 总刚度 N/m
      var keach = ktot / s.n;
      var eff = (1 - Tt) * 100;
      var notes = [
        { level: 'info', text: '反推链：IL → T=10^(−IL/20) → 解 T(r,ζ)=T 得 r → fₙ=f/r → δ=g/(2πfₙ)² → k=m·(2πfₙ)²。' },
        { level: 'info', text: '隔振区要求 r>√2（即 fₙ<f/√2）；工程上常取 fₙ≤f/4~f/5，获得约 20~30 dB 隔振量。' },
        { level: 'info', text: '阻尼 ζ 会略微抬高所需 r；δ 为隔振器在设备重力下的静变形，选型时需核对空间与稳定性。' }
      ];
      if (r > 1e4) notes.push({ level: 'warn', text: '所需频率比极大（fₙ 极低），需要非常大的静变形，普通隔振器难以胜任。' });
      if (delta > 100) notes.push({ level: 'warn', text: '静变形超过 100 mm：需专用软弹簧或空气弹簧，并复核设备稳定性与行程。' });
      return {
        ok: true,
        values: { r: r, fn: fn, delta: delta, ktot: ktot, keach: keach, eff: eff },
        formula: '目标 T = 10^(−IL/20) = 10^(−' + s.il + '/20) = ' + Tt.toFixed(5) + '\n' +
          '解 T(r,ζ)=T（ζ=' + s.zeta + '）得 r = <span class="fx">' + r.toFixed(3) + '</span>\n' +
          'fₙ = f/r = ' + s.f + '/' + r.toFixed(3) + ' = <span class="fx">' + fn.toFixed(3) + ' Hz</span>\n' +
          'δ = g/(2πfₙ)² = <span class="fx">' + delta.toFixed(3) + ' mm</span>；' +
          'k = m·(2πfₙ)² = <span class="fx">' + ktot.toExponential(3) + ' N/m</span>（每只 ' +
          keach.toExponential(3) + '）\n' +
          '隔振效率 η = (1−T)×100% = <span class="fx">' + eff.toFixed(2) + '%</span>',
        notes: notes
      };
    }
  });
})();
