/*
 * calc-b6.js — 声明式计算器 · 超声·结构·声速（5 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 已实现的 route（nav.group = "超声·结构·声速"）：
 *   wavespeed-solid  固体纵/横波声速（E、G(或ν)、ρ → cL=√(E(1−ν)/ρ(1+ν)(1−2ν))、cS=√(G/ρ)）
 *   snell            斯涅尔定律/临界角（c1、c2、θ1 → θ2、θc；c1<c2 才有临界角）
 *   attenuation      材料衰减系数（α≈α0·f^n → dB/cm、dB/m、Np/m 与指定距离总衰减）
 *   lamb             兰姆波/板波相速度（A0 弯曲近似、S0 伸缩近似、瑞利波速近似）
 *   longi-trans      纵波垂直入射反射/透射（Z1、Z2 → R、T、功率透射与隔声量）
 */
(function () {
  'use strict';

  var LOG10 = Math.log10;
  var PI = Math.PI;

  // ============================ 1) 固体纵/横波声速 ============================
  CalcRegistry.register('wavespeed-solid', {
    title: '固体纵/横波声速 · 声学计算工具箱',
    nav: {
      group: '超声·结构·声速',
      label: '固体纵/横波声速',
      desc: 'E、G、ρ、ν → cL、cS',
      sub: ['cL=√(E(1−ν)/ρ(1+ν)(1−2ν))', 'cS=√(G/ρ)']
    },
    intro: '由弹性模量计算固体中的纵波（膨胀波）与横波（剪切波）声速；剪切模量 G 缺省时按 G = E/(2(1+ν)) 推导。钢（E=200 GPa、ν=0.3、ρ=7850）cL≈5.86 km/s、cS≈3.13 km/s。',
    inputs: [
      { key: 'E', label: '杨氏模量 E', unit: 'GPa', def: 200, step: 5, min: 0.01 },
      { key: 'nu', label: '泊松比 ν', unit: '', def: 0.3, step: 0.01, min: 0, max: 0.499 },
      { key: 'rho', label: '密度 ρ', unit: 'kg/m³', def: 7850, step: 50, min: 1 },
      { key: 'G', label: '剪切模量 G（0=由 E、ν 推导）', unit: 'GPa', def: 0, step: 1, min: 0 }
    ],
    outputs: [
      { key: 'cL', label: '纵波声速 c_L', unit: 'm/s', digits: 1 },
      { key: 'cS', label: '横波声速 c_S', unit: 'm/s', digits: 1 },
      { key: 'Guse', label: '采用剪切模量 G', unit: 'GPa', digits: 2 },
      { key: 'ratio', label: 'c_L/c_S', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var E = s.E * 1e9, nu = s.nu, rho = s.rho;
      var Gpa = s.G > 0 ? s.G * 1e9 : E / (2 * (1 + nu));
      if (!isFinite(E) || !isFinite(nu) || !isFinite(rho) || E <= 0 || rho <= 0 || nu >= 0.5) {
        return { ok: false, error: '请输入有效参数（E>0、ρ>0、ν<0.5；ν→0.5 时材料不可压缩，cL→∞）。' };
      }
      var cL = Math.sqrt(E * (1 - nu) / (rho * (1 + nu) * (1 - 2 * nu)));
      var cS = Math.sqrt(Gpa / rho);
      return {
        ok: true,
        values: { cL: cL, cS: cS, Guse: Gpa / 1e9, ratio: cL / cS },
        formula: 'c_L = √(E(1−ν)/[ρ(1+ν)(1−2ν)]) = √(' + (E / 1e9).toFixed(1) + '×' + (1 - nu).toFixed(3) +
          '/[' + rho.toFixed(0) + '×' + (1 + nu).toFixed(3) + '×' + (1 - 2 * nu).toFixed(3) + '])\n' +
          '= <span class="fx">' + cL.toFixed(1) + ' m/s</span>\n' +
          'c_S = √(G/ρ)，G=' + (Gpa / 1e9).toFixed(2) + ' GPa' + (s.G > 0 ? '（输入）' : '（=E/2(1+ν)）') +
          ' → c_S = <span class="fx">' + cS.toFixed(1) + ' m/s</span>；c_L/c_S = <span class="fx">' + (cL / cS).toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: 'cL/c_S = √(2(1−ν)/(1−2ν))：ν=0.3 时约 1.87（纵波快于横波），ν→0.5 时趋于无穷。' },
          { level: 'info', text: '典型值：钢 5900/3200、铝 6320/3130、铜 4700/2260、玻璃 5800/3400 m/s（均为量级参考）。' },
          { level: 'warn', text: '各向异性材料（复合材料、木材）需按主轴方向分别取模量；本工具按各向同性体估算。' }
        ]
      };
    }
  });

  // ============================ 2) 斯涅尔定律/临界角 ============================
  CalcRegistry.register('snell', {
    title: '斯涅尔定律与临界角 · 声学计算工具箱',
    nav: {
      group: '超声·结构·声速',
      label: '斯涅尔定律/临界角',
      desc: 'c1、c2、θ1 → θ2、θc',
      sub: ['sinθ1/c1 = sinθ2/c2', 'θc = asin(c1/c2)']
    },
    intro: '声波通过平界面折射服从斯涅尔定律 sinθ₁/c₁ = sinθ₂/c₂。仅当 c₁<c₂（波从慢介质进入快介质）时存在临界角；入射角超过临界角发生全反射。',
    inputs: [
      { key: 'c1', label: '介质 1 声速 c₁（入射侧）', unit: 'm/s', def: 1480, step: 10, min: 1 },
      { key: 'c2', label: '介质 2 声速 c₂（透射侧）', unit: 'm/s', def: 343, step: 10, min: 1 },
      { key: 'theta1', label: '入射角 θ₁', unit: '°', def: 30, step: 1, min: 0, max: 89.9 }
    ],
    outputs: [
      { key: 'theta2', label: '折射角 θ₂', unit: '°', digits: 2 },
      { key: 'thetaC', label: '临界角 θc（无则为 —）', unit: '°', digits: 2 }
    ],
    compute: function (s) {
      var c1 = s.c1, c2 = s.c2, t1 = s.theta1 * PI / 180;
      if (!isFinite(c1) || !isFinite(c2) || !isFinite(s.theta1) || c1 <= 0 || c2 <= 0) {
        return { ok: false, error: '请输入有效的声速与入射角。' };
      }
      var sin2 = (c2 / c1) * Math.sin(t1);
      var thetaC = c1 < c2 ? Math.asin(c1 / c2) * 180 / PI : NaN;   // 仅 c1<c2 存在
      if (Math.abs(sin2) > 1) {
        return {
          ok: false,
          error: '全反射：入射角 ' + s.theta1.toFixed(1) + '° 超过临界角 ' +
            (thetaC * 180 / PI).toFixed(2) + '°，介质 2 中无透射折射波。',
          values: { theta2: NaN, thetaC: thetaC }
        };
      }
      var theta2 = Math.asin(sin2) * 180 / PI;
      return {
        ok: true,
        values: { theta2: theta2, thetaC: thetaC },
        formula: '斯涅尔：sinθ₂ = (c₂/c₁)·sinθ₁ = (' + c2 + '/' + c1 + ')×sin ' + s.theta1.toFixed(1) + '° = ' +
          sin2.toFixed(4) + '\nθ₂ = asin(' + sin2.toFixed(4) + ') = <span class="fx">' + theta2.toFixed(2) + '°</span>' +
          (isFinite(thetaC) ? '\n临界角 θc = asin(c₁/c₂) = asin(' + (c1 / c2).toFixed(4) + ') = <span class="fx">' +
            thetaC.toFixed(2) + '°</span>（θ₁>θc 全反射）' : '\nc₁≥c₂：不存在临界角，任意入射角均有折射波'),
        notes: [
          { level: 'info', text: '进入快介质（c₂>c₁）折射角大于入射角（远离法线）；进入慢介质则折向法线。' },
          { level: 'info', text: '空气（343）→水（1480）临界角约 13.4°；水→钢（5900）约 14.5°——超声检测斜楔设计即利用此关系（波进入更快介质才有临界角）。' },
          { level: 'warn', text: '本工具仅算几何折射角；实际斜入射还涉及模式转换（纵波↔横波）与特征阻抗突变，需用反射/透射系数工具。' }
        ]
      };
    }
  });

  // ============================ 3) 材料衰减系数 ============================
  CalcRegistry.register('attenuation', {
    title: '材料超声衰减系数 · 声学计算工具箱',
    nav: {
      group: '超声·结构·声速',
      label: '材料衰减系数',
      desc: 'α≈α0·f^n → dB/cm 与总衰减',
      sub: ['α₀·fⁿ', 'Np↔dB']
    },
    intro: '材料衰减工程近似 α = α₀·fⁿ（α₀ 为参考频率 1 MHz 处的衰减常数，dB/(cm·MHz)）。由频率与传播距离求总衰减；Np 与 dB 换算 1 Np = 8.686 dB。',
    inputs: [
      { key: 'f', label: '频率 f', unit: 'MHz', def: 2, step: 0.5, min: 0.01, max: 100 },
      { key: 'alpha0', label: '衰减常数 α₀', unit: 'dB/(cm·MHz)', def: 0.02, step: 0.005, min: 0 },
      { key: 'n', label: '频率指数 n', unit: '', def: 1, step: 0.1, min: 0, max: 4 },
      { key: 'dist', label: '传播距离 d', unit: 'cm', def: 10, step: 1, min: 0.1 }
    ],
    outputs: [
      { key: 'alphaDbCm', label: '衰减系数 α', unit: 'dB/cm', digits: 4 },
      { key: 'alphaDbM', label: '衰减系数 α', unit: 'dB/m', digits: 2 },
      { key: 'alphaNpM', label: '衰减系数 α', unit: 'Np/m', digits: 4 },
      { key: 'loss', label: '总衰减（距离 d）', unit: 'dB', digits: 3 }
    ],
    compute: function (s) {
      var f = s.f, a0 = s.alpha0, n = s.n, d = s.dist;
      if (!isFinite(f) || !isFinite(a0) || !isFinite(n) || !isFinite(d) || f <= 0 || a0 < 0 || d <= 0) {
        return { ok: false, error: '请输入有效参数（f>0、α₀≥0、d>0）。' };
      }
      var aDbCm = a0 * Math.pow(f, n);
      var aDbM = aDbCm * 100;
      var aNpM = aDbM / 8.685889638;           // 1 Np = 8.6859 dB
      return {
        ok: true,
        values: { alphaDbCm: aDbCm, alphaDbM: aDbM, alphaNpM: aNpM, loss: aDbCm * d },
        formula: 'α = α₀·fⁿ = ' + a0 + '×' + f + '^' + n + ' = <span class="fx">' + aDbCm.toFixed(4) + ' dB/cm</span>\n' +
          '= <span class="fx">' + aDbM.toFixed(2) + ' dB/m</span> = <span class="fx">' + aNpM.toFixed(4) + ' Np/m</span>\n' +
          '总衰减 = α·d = ' + aDbCm.toFixed(4) + '×' + d + ' = <span class="fx">' + (aDbCm * d).toFixed(3) + ' dB</span>',
        notes: [
          { level: 'info', text: '细晶金属 n≈1（散射主导区），衰减很低（钢 ≈0.02 dB/(cm·MHz) 量级）；橡胶、复合材料高一个量级以上。' },
          { level: 'info', text: 'λ≫晶粒尺寸时呈瑞利散射（∝f⁴），λ≈晶粒尺寸时过渡到 ∝f²，粗晶材料近似取 n≈1~2。' },
          { level: 'warn', text: 'α₀ 必须与声波模式和试样状态匹配（纵波/横波、铸造/轧制差显著）；本工具给工程近似，实测以衰减试块为准。' }
        ]
      };
    }
  });

  // ============================ 4) 兰姆波/板波相速度 ============================
  CalcRegistry.register('lamb', {
    title: '兰姆波相速度（板波） · 声学计算工具箱',
    nav: {
      group: '超声·结构·声速',
      label: '兰姆波相速度',
      desc: '板厚×频率 → A0/S0/瑞利相速度',
      sub: ['A0 弯曲近似', 'S0 伸缩近似', 'c_R']
    },
    intro: '板中兰姆波相速度随频厚积 fd 色散。本工具给低频段近似解：A0 用弯曲波近似、S0 用伸缩板速度、瑞利波用 Viktorov 近似（ν 由 cL/cS 反算）。适用于 fd ≲ 1~2 MHz·mm。',
    inputs: [
      { key: 'h', label: '板厚 h', unit: 'mm', def: 1, step: 0.1, min: 0.01 },
      { key: 'f', label: '频率 f', unit: 'MHz', def: 1, step: 0.1, min: 0.001 },
      { key: 'cL', label: '纵波声速 c_L', unit: 'm/s', def: 5900, step: 50, min: 100 },
      { key: 'cS', label: '横波声速 c_S', unit: 'm/s', def: 3200, step: 50, min: 100 },
      { key: 'mode', label: '模式', type: 'select', def: 'A0',
        options: [
          { value: 'A0', label: 'A0 反对称（弯曲）' },
          { value: 'S0', label: 'S0 对称（伸缩）' },
          { value: 'rayleigh', label: '瑞利表面波 c_R' }
        ] }
    ],
    outputs: [
      { key: 'cp', label: '模式相速度 c_p', unit: 'm/s', digits: 1 },
      { key: 'cR', label: '瑞利波速 c_R（参考）', unit: 'm/s', digits: 1 },
      { key: 'fd', label: '频厚积 f·d', unit: 'MHz·mm', digits: 3 },
      { key: 'ratio', label: 'c_p/c_S', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var h = s.h / 1000, fM = s.f, cL = s.cL, cS = s.cS;
      if (!isFinite(h) || !isFinite(fM) || !isFinite(cL) || !isFinite(cS) || h <= 0 || fM <= 0 || cL <= cS) {
        return { ok: false, error: '请输入有效参数（h>0、f>0，且需 c_L > c_S）。' };
      }
      // 泊松比由 cL/cS 反算：ν = (cL²−2cS²)/(2(cL²−cS²))
      var nu = (cL * cL - 2 * cS * cS) / (2 * (cL * cL - cS * cS));
      var cR = cS * (0.862 + 1.14 * nu) / (1 + nu);                 // Viktorov 近似
      var omega = 2 * PI * fM * 1e6;
      var cp;
      if (s.mode === 'S0') {
        // 低频伸缩板速度：c_p = c_S·√(2/(1−ν))（= √(E/ρ(1−ν²))）
        cp = cS * Math.sqrt(2 / (1 - nu));
      } else if (s.mode === 'rayleigh') {
        cp = cR;
      } else {
        // A0 低频弯曲近似：c_p = (ω²·(E/ρ)·h²/(12(1−ν²)))^(1/4)，E/ρ = 2cS²(1+ν)
        var EoverRho = 2 * cS * cS * (1 + nu);
        cp = Math.pow(omega * omega * EoverRho * h * h / (12 * (1 - nu * nu)), 0.25);
      }
      return {
        ok: true,
        values: { cp: cp, cR: cR, fd: fM * s.h, ratio: cp / cS },
        formula: 'ν = (c_L²−2c_S²)/(2(c_L²−c_S²)) = <span class="fx">' + nu.toFixed(4) + '</span>；' +
          'c_R ≈ c_S·(0.862+1.14ν)/(1+ν) = <span class="fx">' + cR.toFixed(1) + ' m/s</span>\n' +
          (s.mode === 'S0'
            ? 'S0：c_p = c_S·√(2/(1−ν)) = <span class="fx">' + cp.toFixed(1) + ' m/s</span>'
            : s.mode === 'rayleigh'
              ? '瑞利：c_p = c_R = <span class="fx">' + cp.toFixed(1) + ' m/s</span>'
              : 'A0：c_p = [ω²·(E/ρ)·h²/(12(1−ν²))]^(1/4) = <span class="fx">' + cp.toFixed(1) + ' m/s</span>') +
          '\n频厚积 f·d = ' + (fM * s.h).toFixed(3) + ' MHz·mm；c_p/c_S = <span class="fx">' + (cp / cS).toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: 'A0 强色散：fd→0 时 c_p→0，随 fd 增大趋近 c_R；S0 弱色散，从低频伸缩速度缓降到 c_R。' },
          { level: 'warn', text: '近似说明：A0/S0 为低频段渐近解（fd≲1~2 MHz·mm）；高频或精确色散曲线需数值解 Rayleigh-Lamb 方程。' },
          { level: 'info', text: '钢 1 mm×1 MHz 参考值：A0≈3.1 km/s、S0≈5.4 km/s、c_R≈2.96 km/s（与色散曲线量级一致）。' }
        ]
      };
    }
  });

  // ============================ 5) 纵波垂直入射反射/透射 ============================
  CalcRegistry.register('longi-trans', {
    title: '纵波垂直入射反射/透射 · 声学计算工具箱',
    nav: {
      group: '超声·结构·声速',
      label: '纵波反射/透射',
      desc: 'Z1、Z2 → R、T 与功率透射',
      sub: ['R=(Z₂−Z₁)/(Z₂+Z₁)', 'T=2Z₂/(Z₂+Z₁)']
    },
    intro: '纵波垂直入射平界面：声压反射系数 R=(Z₂−Z₁)/(Z₂+Z₁)、透射系数 T=2Z₂/(Z₂+Z₁)；功率透射率 =4Z₁Z₂/(Z₁+Z₂)²。阻抗失配越大反射越强（水→钢约 −9.3 dB 透射损失）。',
    inputs: [
      { key: 'Z1', label: '介质 1 特性阻抗 Z₁', unit: 'MRayl', def: 1.48, step: 0.1, min: 0.001 },
      { key: 'Z2', label: '介质 2 特性阻抗 Z₂', unit: 'MRayl', def: 47, step: 1, min: 0.001 }
    ],
    outputs: [
      { key: 'R', label: '声压反射系数 R', unit: '', digits: 4 },
      { key: 'T', label: '声压透射系数 T', unit: '', digits: 4 },
      { key: 'Tp', label: '功率透射率', unit: '', digits: 4 },
      { key: 'TL', label: '透射损失（隔声量）', unit: 'dB', digits: 2 }
    ],
    compute: function (s) {
      var Z1 = s.Z1, Z2 = s.Z2;
      if (!isFinite(Z1) || !isFinite(Z2) || Z1 <= 0 || Z2 <= 0) {
        return { ok: false, error: '请输入有效的特性阻抗（Z>0）。' };
      }
      var R = (Z2 - Z1) / (Z2 + Z1);
      var T = 2 * Z2 / (Z2 + Z1);
      var Tp = 4 * Z1 * Z2 / ((Z1 + Z2) * (Z1 + Z2));
      var TL = 10 * LOG10(1 / Tp);
      return {
        ok: true,
        values: { R: R, T: T, Tp: Tp, TL: TL },
        formula: 'R = (Z₂−Z₁)/(Z₂+Z₁) = (' + Z2 + '−' + Z1 + ')/' + (Z1 + Z2).toFixed(2) + ' = <span class="fx">' +
          R.toFixed(4) + '</span>\n' +
          'T = 2Z₂/(Z₂+Z₁) = <span class="fx">' + T.toFixed(4) + '</span>\n' +
          '功率透射 = 4Z₁Z₂/(Z₁+Z₂)² = <span class="fx">' + Tp.toFixed(4) + '</span>；' +
          '透射损失 = 10·log₁₀(1/τ) = <span class="fx">' + TL.toFixed(2) + ' dB</span>',
        notes: [
          { level: 'info', text: '能量守恒校核：R² + 功率透射 = 1（R 为声压幅值反射系数）。' },
          { level: 'info', text: '典型阻抗：水 1.48、铝 17、钢 47 MRayl。水→钢功率透射约 0.118（−9.3 dB）；空气→钢几乎全反射。' },
          { level: 'warn', text: '仅适用于垂直入射与无限大平面界面；斜入射涉及模式转换（纵↔横），需按 Snell + 系数联合求解。' }
        ]
      };
    }
  });
})();
