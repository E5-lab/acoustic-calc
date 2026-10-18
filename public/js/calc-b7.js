/*
 * calc-b7.js — 声明式计算器 · 经典与教学（示范块，供其他 AI 参照实现 B1~B6/B8）
 *
 * 本文件演示"一个工具 = 一次 register"的写法。compute 为纯函数（不碰 DOM），
 * 因此可在 Node 下直接单测（见 tests/calc-b7.test.js）。
 *
 * 块内清单（route / 名称）：
 *   mach              声速与马赫数（温度→声速，速度→马赫）
 *   standing-open-closed  开管/闭管共振频率
 *   p-u-intensity     p-u 法声强（质点速度 / 声强 / 声强级）
 *   decibel-conv      比值↔分贝通用换算（场量 20log / 功率量 10log）
 */
(function () {
  'use strict';

  // ============================ 1) 声速与马赫数 ============================
  CalcRegistry.register('mach', {
    title: '声速与马赫数 · 声学计算工具箱',
    nav: {
      group: '经典与教学',
      label: '声速与马赫数',
      desc: '温度→空气声速；速度→马赫数',
      sub: ['c = 331.3+0.606θ', 'M = v/c']
    },
    intro: '理想气体中声速随温度变化；给定速度可换算为马赫数（相对声速的倍数）。',
    inputs: [
      { key: 'theta', label: '空气温度 θ', unit: '°C', def: 20, step: 1, min: -80, max: 60 },
      { key: 'v', label: '物体速度 v', unit: 'm/s', def: 340, step: 1, min: 0 }
    ],
    outputs: [
      { key: 'c', label: '声速 c', unit: 'm/s', digits: 1 },
      { key: 'mach', label: '马赫数 M', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var c = 331.3 + 0.606 * s.theta;
      var M = s.v / c;
      return {
        ok: c > 0,
        values: { c: c, mach: M },
        formula: 'c = 331.3 + 0.606·θ = 331.3 + 0.606×' + s.theta.toFixed(1) + ' = ' +
          '<span class="fx">' + c.toFixed(1) + ' m/s</span>\n' +
          'M = v / c = ' + s.v.toFixed(1) + ' / ' + c.toFixed(1) + ' = <span class="fx">' + M.toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: 'c 取干燥空气近似；湿度与气压影响在 ±0.5% 以内，工程计算可忽略。' },
          { level: 'info', text: 'M<1 亚声速，M=1 声速，M>1 超声速（产生激波）。' }
        ]
      };
    }
  });

  // ============================ 2) 开管/闭管共振 ============================
  CalcRegistry.register('standing-open-closed', {
    title: '开管/闭管共振频率 · 声学计算工具箱',
    nav: {
      group: '经典与教学',
      label: '开管/闭管共振',
      desc: '一端闭/两端开的管式共振',
      sub: ['闭管奇次谐波', '开管全谐波']
    },
    intro: '管道在端面边界条件下形成驻波；闭管仅含奇次谐波，开管含全部整数次谐波。',
    inputs: [
      { key: 'L', label: '管长 L', unit: 'm', def: 0.5, step: 0.01, min: 0.01 },
      { key: 'c', label: '声速 c', unit: 'm/s', def: 343, step: 1, min: 1 },
      { key: 'n', label: '谐波阶次 n', unit: '', def: 1, step: 1, min: 1, max: 10 },
      { key: 'type', label: '管型', type: 'select', def: 'closed',
        options: [ { value: 'closed', label: '一端闭（闭管）' }, { value: 'open', label: '两端开（开管）' } ] }
    ],
    outputs: [
      { key: 'fn', label: '第 n 阶共振 fₙ', unit: 'Hz', digits: 2 },
      { key: 'f1', label: '基频 f₁', unit: 'Hz', digits: 2 }
    ],
    compute: function (s) {
      var closed = s.type === 'closed';
      var f1 = closed ? s.c / (4 * s.L) : s.c / (2 * s.L);
      var fn = closed ? (2 * s.n - 1) * f1 : s.n * f1;
      return {
        ok: s.L > 0 && s.c > 0 && s.n >= 1,
        values: { fn: fn, f1: f1 },
        formula: closed
          ? '闭管：fₙ = (2n−1)·c / (4L) = (2×' + s.n + '−1)×' + s.c + ' / (4×' + s.L + ') = ' +
            '<span class="fx">' + fn.toFixed(2) + ' Hz</span>'
          : '开管：fₙ = n·c / (2L) = ' + s.n + '×' + s.c + ' / (2×' + s.L + ') = ' +
            '<span class="fx">' + fn.toFixed(2) + ' Hz</span>',
        notes: [
          { level: 'info', text: closed ? '闭管只激发奇次谐波（n=1,3,5…对应阶次 1,2,3…）。' : '开管激发全部整数次谐波。' },
          { level: 'info', text: '实际管口存在末端修正（约 0.6r），精密计算需补偿。' }
        ]
      };
    }
  });

  // ============================ 3) p-u 法声强 ============================
  CalcRegistry.register('p-u-intensity', {
    title: 'p-u 法声强 · 声学计算工具箱',
    nav: {
      group: '经典与教学',
      label: 'p-u 法声强',
      desc: '质点速度 / 声强 / 声强级',
      sub: ['u = p/(ρc)', 'I = p·u', 'L_I']
    },
    intro: '用声压 p 与质点速度 u 直接求声强，是强度探头（p-u 法）的物理基础。',
    inputs: [
      { key: 'p', label: '声压 p', unit: 'Pa', def: 1, step: 0.1, min: 0 },
      { key: 'rho', label: '介质密度 ρ', unit: 'kg/m³', def: 1.2, step: 0.01, min: 0.01 },
      { key: 'c', label: '声速 c', unit: 'm/s', def: 343, step: 1, min: 1 }
    ],
    outputs: [
      { key: 'u', label: '质点速度 u', unit: 'm/s', digits: 4 },
      { key: 'I', label: '声强 I', unit: 'W/m²', digits: 3 },
      { key: 'LI', label: '声强级 L_I', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      var z = s.rho * s.c;              // 特性阻抗
      var u = s.p / z;                  // 平面波质点速度
      var I = s.p * u;                  // 有功声强
      var LI = 10 * Math.log10(Math.max(I, 1e-30) / 1e-12);
      return {
        ok: z > 0 && I >= 0,
        values: { u: u, I: I, LI: LI },
        formula: 'u = p / (ρc) = ' + s.p + ' / (' + s.rho + '×' + s.c + ') = ' +
          '<span class="fx">' + u.toFixed(4) + ' m/s</span>\n' +
          'I = p·u = <span class="fx">' + I.toFixed(3) + ' W/m²</span>\n' +
          'L_I = 10·log10(I/10⁻¹²) = <span class="fx">' + LI.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: '此处取平面波近似 u = p/(ρc)；与声强探头测得的实部一致。' },
          { level: 'info', text: '参考声强 I₀ = 10⁻¹² W/m²。' }
        ]
      };
    }
  });

  // ============================ 4) 比值↔分贝通用换算 ============================
  CalcRegistry.register('decibel-conv', {
    title: '比值↔分贝通用换算 · 声学计算工具箱',
    nav: {
      group: '经典与教学',
      label: '比值↔分贝换算',
      desc: '场量 20log / 功率量 10log',
      sub: ['线性→dB', 'dB→线性']
    },
    intro: '声学中分贝分"场量"（声压、振速，20log）与"功率量"（声功率、强度，10log）两类换算。',
    inputs: [
      { key: 'lin', label: '线性比值 x', unit: '', def: 2, step: 0.1, min: 0 },
      { key: 'db', label: '分贝值 L', unit: 'dB', def: 6.02, step: 0.1 },
      { key: 'mode', label: '量类型', type: 'select', def: 'field',
        options: [ { value: 'field', label: '场量（20log₁₀）' }, { value: 'power', label: '功率量（10log₁₀）' } ] }
    ],
    outputs: [
      { key: 'dbOut', label: '换算 dB', unit: 'dB', digits: 3 },
      { key: 'linOut', label: '换算线性值', unit: '', digits: 4 }
    ],
    compute: function (s) {
      var k = s.mode === 'power' ? 10 : 20;
      var dbOut = s.lin > 0 ? k * Math.log10(s.lin) : NaN;
      var linOut = Math.pow(10, s.db / k);
      return {
        ok: true,
        values: { dbOut: dbOut, linOut: linOut },
        formula: (s.mode === 'power' ? '功率量：L = 10·log₁₀(x)' : '场量：L = 20·log₁₀(x)') +
          '；逆运算 x = 10^(L/' + k + ')\n' +
          'x=' + s.lin + ' → L=<span class="fx">' + (isNaN(dbOut) ? '—' : dbOut.toFixed(3)) + ' dB</span>；' +
          'L=' + s.db + ' dB → x=<span class="fx">' + linOut.toFixed(4) + '</span>',
        notes: [
          { level: 'info', text: '场量（声压、质点速度、电压）幅度比用 20log；功率/能量比用 10log。' },
          { level: 'warn', text: 'x≤0 时对数无定义，dB 输出记为"—"。' }
        ]
      };
    }
  });
})();
