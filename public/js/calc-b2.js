/*
 * calc-b2.js — 声明式计算器 · 电声与系统（6 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 已实现的 route（nav.group = "电声与系统"）：
 *   directivity     指向性因数 Q / DI（锥半角 或 边界反射面数 → Q、DI=10log10Q）
 *   nearfar         近场/远场分界（口径 D、频率 f → 过渡距离）
 *   roomgain        边界增益 / SBIR（距边界距离 d、频率 f → 镜像叠加增益 dB）
 *   spl-vs-dist     点声源距离衰减（声功率 Lw、指向性 Q、距离 r、空间类型 → Lp）
 *   damping-factor  功放阻尼系数影响（阻尼系数 DF、负载阻抗 Z、Qes → 低频阻尼误差）
 *   delay-align     扬声器延时/相位对齐（路径差 Δd → 延时 ms、相位差 °、梳状 null）
 */
(function () {
  'use strict';

  // ============================ 1) 指向性因数 Q / DI ============================
  CalcRegistry.register('directivity', {
    title: '指向性因数 Q/DI · 声学计算工具箱',
    nav: {
      group: '电声与系统',
      label: '指向性因数 Q',
      desc: 'Q 与指向性指数 DI',
      sub: ['Q', 'DI']
    },
    intro: '指向性因数 Q 描述声源把声功率集中到某方向的程度；指向性指数 DI=10log10(Q)。',
    inputs: [
      { key: 'mode', label: '模型', type: 'select', def: 'cone',
        options: [ { value: 'cone', label: '锥角辐射（半角 φ）' }, { value: 'boundary', label: '边界反射面数 n' } ] },
      { key: 'phi', label: '半功率半角 φ', unit: '°', def: 30, step: 1, min: 1, max: 179 },
      { key: 'n', label: '反射面数 n (0~3)', unit: '', def: 1, step: 1, min: 0, max: 3 }
    ],
    outputs: [
      { key: 'Q', label: '指向性因数 Q', unit: '', digits: 3 },
      { key: 'DI', label: '指向性指数 DI', unit: 'dB', digits: 2 }
    ],
    compute: function (s) {
      var Q;
      if (s.mode === 'boundary') {
        Q = Math.pow(2, s.n);
      } else {
        var phi = s.phi * Math.PI / 180;
        Q = 2 / (1 - Math.cos(phi));
      }
      var DI = 10 * Math.log10(Q);
      return {
        ok: Q > 0,
        values: { Q: Q, DI: DI },
        formula: s.mode === 'boundary'
          ? '边界反射面 n=' + s.n + ' → Q=2ⁿ=<span class="fx">' + Q.toFixed(3) + '</span>，' +
            'DI=10log₁₀Q=<span class="fx">' + DI.toFixed(2) + ' dB</span>'
          : '锥半角 φ=' + s.phi + '° → Ω=2π(1−cosφ)，Q=4π/Ω=2/(1−cosφ)=<span class="fx">' + Q.toFixed(3) + '</span>\n' +
            'DI=<span class="fx">' + DI.toFixed(2) + ' dB</span>',
        notes: [
          { level: 'info', text: '自由场点源 Q=1(DI=0)；靠一面墙 Q=2(+3dB)、墙角 Q=4(+6dB)、三面角 Q=8(+9dB)。' },
          { level: 'info', text: '锥角模型假设能量均匀集中于半角为 φ 的圆锥内。' }
        ]
      };
    }
  });

  // ============================ 2) 近场/远场分界 ============================
  CalcRegistry.register('nearfar', {
    title: '近场/远场分界 · 声学计算工具箱',
    nav: {
      group: '电声与系统',
      label: '近场远场分界',
      desc: '口径/频率 → 远场距离',
      sub: ['λ', 'r_ff']
    },
    intro: '声源最大尺寸 D 与波长 λ 决定远场起始距离；近场内声压随距离剧烈起伏，不可用反平方律。',
    inputs: [
      { key: 'D', label: '最大尺寸 D', unit: 'm', def: 0.3, step: 0.01, min: 0.01 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 1000, step: 50, min: 20, max: 20000 },
      { key: 'c', label: '声速 c', unit: 'm/s', def: 343, step: 1, min: 1 }
    ],
    outputs: [
      { key: 'lambda', label: '波长 λ', unit: 'm', digits: 4 },
      { key: 'rff1', label: '远场起点 r≈D²/λ', unit: 'm', digits: 3 },
      { key: 'rff2', label: '保守 r≈2D²/λ', unit: 'm', digits: 3 }
    ],
    compute: function (s) {
      var lam = s.c / s.f;
      var r1 = s.D * s.D / lam;
      var r2 = 2 * s.D * s.D / lam;
      return {
        ok: s.f > 0 && s.D > 0,
        values: { lambda: lam, rff1: r1, rff2: r2 },
        formula: 'λ=c/f=' + s.c + '/' + s.f + '=<span class="fx">' + lam.toFixed(4) + ' m</span>\n' +
          'r_ff≈D²/λ=<span class="fx">' + r1.toFixed(3) + ' m</span>' +
          '（保守 2D²/λ=<span class="fx">' + r2.toFixed(3) + ' m</span>）',
        notes: [
          { level: 'info', text: 'r<λ 区域为近场，声压相位复杂；测量传声器应置于 r_ff 之外。' },
          { level: 'info', text: '对阵列/大口径扬声器，常取 r≈2D²/λ 更稳妥。' }
        ]
      };
    }
  });

  // ============================ 3) 边界增益 / SBIR ============================
  CalcRegistry.register('roomgain', {
    title: '边界增益 / SBIR · 声学计算工具箱',
    nav: {
      group: '电声与系统',
      label: '边界增益 SBIR',
      desc: '镜像叠加增益',
      sub: ['dB', '线性']
    },
    intro: '声源/听者靠近刚性边界时，镜像声源与之叠加改变低频响应（边界增益与 SBIR 梳状滤波）。',
    inputs: [
      { key: 'd', label: '距边界距离 d', unit: 'm', def: 0.1, step: 0.01, min: 0 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 100, step: 5, min: 20, max: 2000 },
      { key: 'n', label: '正交边界数 n', unit: '', def: 1, step: 1, min: 0, max: 3 },
      { key: 'c', label: '声速 c', unit: 'm/s', def: 343, step: 1, min: 1 }
    ],
    outputs: [
      { key: 'gain', label: '叠加增益 G', unit: 'dB', digits: 2 },
      { key: 'lin', label: '线性倍数', unit: '×', digits: 3 }
    ],
    compute: function (s) {
      var lam = s.c / s.f;
      var phi = 4 * Math.PI * s.d / lam; // 路径差 2d 对应相位
      var per = 2 * Math.abs(Math.cos(phi / 2));
      var total = Math.pow(per, s.n);
      var gDb = 20 * Math.log10(total);
      return {
        ok: s.f > 0,
        values: { gain: gDb, lin: total },
        formula: '路径差 2d → 相位 φ=4πd/λ，单边界因子 |1+e^{-jφ}|=2|cos(φ/2)|\n' +
          'n 个正交边界: G=2ⁿ|cos(φ/2)|ⁿ；d=' + s.d + 'm, λ=' + lam.toFixed(3) +
          'm → G=<span class="fx">' + total.toFixed(3) + '×</span>（<span class="fx">' + gDb.toFixed(2) + ' dB</span>）',
        notes: [
          { level: 'info', text: 'd→0 时 G→2ⁿ（单边界+6dB、墙角+12dB、三面角+18dB）；d=λ/4 时出现第一 null（完全抵消）。' },
          { level: 'warn', text: '真实边界非完全刚性且存在吸收，实际增益低于本理想镜像模型。' }
        ]
      };
    }
  });

  // ============================ 4) 点声源距离衰减 ============================
  CalcRegistry.register('spl-vs-dist', {
    title: '点声源距离衰减 · 声学计算工具箱',
    nav: {
      group: '电声与系统',
      label: '点声源衰减',
      desc: 'Lw/Q/r/空间 → Lp',
      sub: ['Lp', '反平方']
    },
    intro: '点声源声压级随距离按反平方律衰减；空间几何（自由场/半空间等）与指向性 Q 修正衰减量。',
    inputs: [
      { key: 'Lw', label: '声功率级 Lw', unit: 'dB', def: 100, step: 1, min: 0 },
      { key: 'Q', label: '指向性 Q', unit: '', def: 1, step: 0.1, min: 0.1 },
      { key: 'r', label: '距离 r', unit: 'm', def: 2, step: 0.1, min: 0.1 },
      { key: 'space', label: '空间类型', type: 'select', def: 'free',
        options: [
          { value: 'free', label: '自由场(全空间) 4πr²' },
          { value: 'half', label: '半空间(地面反射) 2πr²' },
          { value: 'quarter', label: '1/4 空间(两反射面) πr²' },
          { value: 'eighth', label: '1/8 空间(三反射面) πr²/2' }
        ] }
    ],
    outputs: [
      { key: 'Lp', label: '声压级 Lp', unit: 'dB', digits: 1 },
      { key: 'drop', label: '相对 1m 衰减', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      var denom = { free: 4 * Math.PI, half: 2 * Math.PI, quarter: Math.PI, eighth: Math.PI / 2 }[s.space] || 4 * Math.PI;
      var kPi = denom / Math.PI; // 用于展示
      var Lp = s.Lw + 10 * Math.log10(s.Q / denom) - 20 * Math.log10(s.r);
      var Lp1 = s.Lw + 10 * Math.log10(s.Q / denom); // r=1m 基准
      var drop = Lp1 - Lp;
      return {
        ok: s.r > 0 && s.Q > 0,
        values: { Lp: Lp, drop: drop },
        formula: 'Lp=Lw+10log₁₀(Q/(k·r²))，k=' + kPi.toFixed(2) + 'π\n' +
          '= ' + s.Lw + '+10log₁₀(' + s.Q.toFixed(2) + '/(' + kPi.toFixed(2) + 'π·' + (s.r * s.r) + '))' +
          '=<span class="fx">' + Lp.toFixed(1) + ' dB</span>\n' +
          '相对 1m 衰减 <span class="fx">' + drop.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: '每加倍距离，自由场衰减 6 dB；半空间（地面反射）为 3 dB/倍距（含镜像相加）。' },
          { level: 'warn', text: '仅适用于自由场/简单镜像；房间内还受混响、反射与衍射影响。' }
        ]
      };
    }
  });

  // ============================ 5) 功放阻尼系数影响 ============================
  CalcRegistry.register('damping-factor', {
    title: '功放阻尼系数影响 · 声学计算工具箱',
    nav: {
      group: '电声与系统',
      label: '阻尼系数影响',
      desc: 'DF → 低频阻尼误差',
      sub: ['Z_amp', 'Qes′']
    },
    intro: '功放输出阻抗（由阻尼系数 DF 表征）与扬声器串联，影响单元谐振处的阻尼与低频响应平坦度。',
    inputs: [
      { key: 'DF', label: '阻尼系数 DF', unit: '', def: 100, step: 10, min: 1 },
      { key: 'Z', label: '负载阻抗 Z', unit: 'Ω', def: 8, step: 1, min: 1 },
      { key: 'Qes', label: '单元 Qes', unit: '', def: 0.4, step: 0.05, min: 0.05 }
    ],
    outputs: [
      { key: 'Zamp', label: '功放内阻 Z_amp', unit: 'Ω', digits: 3 },
      { key: 'err', label: '低频阻尼误差', unit: '%', digits: 2 },
      { key: 'QesEff', label: '有效 Qes′', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var Zamp = s.Z / s.DF;
      var err = 100 / (s.DF + 1);
      var QesEff = s.Qes * (1 + 1 / s.DF);
      return {
        ok: s.DF > 0 && s.Z > 0,
        values: { Zamp: Zamp, err: err, QesEff: QesEff },
        formula: 'Z_amp=Z/DF=' + s.Z + '/' + s.DF + '=<span class="fx">' + Zamp.toFixed(3) + ' Ω</span>\n' +
          '阻尼误差≈100/(DF+1)=<span class="fx">' + err.toFixed(2) + '%</span>；' +
          'Qes′=Qes(1+1/DF)=<span class="fx">' + QesEff.toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: 'DF→∞ 时功放内阻→0，单元由自身 Qes 决定阻尼；DF 越小，谐振峰越高（低频越不平坦）。' },
          { level: 'warn', text: '实际还含音箱接线阻抗与分频器电阻，有效 DF 低于标称值。' }
        ]
      };
    }
  });

  // ============================ 6) 扬声器延时/相位对齐 ============================
  CalcRegistry.register('delay-align', {
    title: '扬声器延时/相位对齐 · 声学计算工具箱',
    nav: {
      group: '电声与系统',
      label: '延时相位对齐',
      desc: '路径差 → 延时/相位',
      sub: ['τ', 'φ', '梳状null']
    },
    intro: '两路扬声器路径差造成到达时间差，引起相位差与梳状滤波器响应；据此设置延时对齐。',
    inputs: [
      { key: 'dd', label: '路径差 Δd', unit: 'm', def: 0.3, step: 0.01, min: 0 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 1000, step: 50, min: 20, max: 20000 },
      { key: 'c', label: '声速 c', unit: 'm/s', def: 343, step: 1, min: 1 }
    ],
    outputs: [
      { key: 'tau', label: '延时 τ', unit: 'ms', digits: 3 },
      { key: 'phi', label: '相位差 φ', unit: '°', digits: 1 },
      { key: 'fnull', label: '第一梳状 null', unit: 'Hz', digits: 1 }
    ],
    compute: function (s) {
      var tau = s.dd / s.c * 1000; // ms
      var phi = 360 * s.f * s.dd / s.c;
      phi = ((phi + 180) % 360 + 360) % 360 - 180; // 归一到 [-180,180]
      var fnull = s.dd > 0 ? s.c / (2 * s.dd) : NaN;
      return {
        ok: s.dd >= 0 && s.f > 0 && s.c > 0,
        values: { tau: tau, phi: phi, fnull: fnull },
        formula: 'τ=Δd/c=' + s.dd + '/' + s.c + '=<span class="fx">' + tau.toFixed(3) + ' ms</span>\n' +
          'φ=360·f·Δd/c=<span class="fx">' + phi.toFixed(1) + '°</span>（模 360）\n' +
          (s.dd > 0
            ? ('梳状第一 null: f=c/(2Δd)=<span class="fx">' + fnull.toFixed(1) + ' Hz</span>')
            : 'Δd=0 无相位差')
        ,
        notes: [
          { level: 'info', text: 'φ=180° 时两路反相抵消（梳状 null）；设置延时使关键频段 φ≈0 对齐。' },
          { level: 'warn', text: '仅考虑直达声路径差；房间反射会改变实际听感曲线。' }
        ]
      };
    }
  });
})();
