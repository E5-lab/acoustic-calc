/*
 * calc-b5.js — 声明式计算器 · 测量与校准（5 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 已实现的 route（nav.group = "测量与校准"）：
 *   calib          校准器换算（标称 94/114 dB → 实际声压；实测读数 → 修正量；输出电压 → 灵敏度）
 *   oct-band       倍频带/1/3 倍频带中心频率与带宽（ISO 266 标称序列，按带号查表）
 *   uncertainty    不确定度合成（A 类 s/√n 与 B 类 B/√3、B/√6、B/2 → uc → U=k·uc）
 *   mic-response   传声器入射角修正（有限振膜活塞平均近似 2J₁(X)/X，X=k·a·sinθ）
 *   time-weight    F/S/I 时间计权读数差（指数检波器近似：τ_F=125 ms、τ_S=1 s、τ_I↑=35 ms）
 */
(function () {
  'use strict';

  var P0 = 20e-6;        // 参考声压 Pa（空气中）
  var LOG10 = Math.log10;

  // ISO 266 标称中心频率序列
  var OCT1 = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];              // 1/1 倍频带（10 带）
  var OCT3 = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
              630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
              10000, 12500, 16000, 20000];                                            // 1/3 倍频带（31 带）

  // 第一类贝塞尔函数 J1(x)（幂级数，x 为实数；小角度/中频下收敛很快）
  function besselJ1(x) {
    if (x === 0) return 0;
    var ax = Math.abs(x), half = ax / 2, term = half, sum = half, h2 = half * half;
    for (var m = 1; m < 40; m++) {
      term *= -h2 / (m * (m + 1));
      sum += term;
      if (Math.abs(term) < 1e-17) break;
    }
    return x < 0 ? -sum : sum;
  }

  // ============================ 1) 校准器换算 ============================
  CalcRegistry.register('calib', {
    title: '声校准器换算 · 声学计算工具箱',
    nav: {
      group: '测量与校准',
      label: '声校准器换算',
      desc: '标称 94/114 dB → 实际声压与灵敏度',
      sub: ['p = p₀·10^(L/20)', '修正量 = 读数−标称']
    },
    intro: '声校准器在参考频率下产生标称声压级（常见 94 dB @ 1 kHz、114 dB @ 250 Hz）。由标称级换算实际声压；用被校仪器读数求修正量；已知传声器输出电压时可反算灵敏度。',
    inputs: [
      { key: 'nominal', label: '标称声压级', type: 'select', def: '94',
        options: [ { value: '94', label: '94 dB（参考 1 kHz）' }, { value: '114', label: '114 dB（参考 250 Hz）' } ] },
      { key: 'freq', label: '参考频率', unit: 'Hz', def: 1000, step: 10, min: 20, max: 20000 },
      { key: 'measured', label: '被校仪器读数', unit: 'dB', def: 93.2, step: 0.1 },
      { key: 'mV', label: '传声器输出电压（0=不算灵敏度）', unit: 'mV', def: 0, step: 1, min: 0 }
    ],
    outputs: [
      { key: 'p', label: '校准器实际声压 p', unit: 'Pa', digits: 4 },
      { key: 'Lref', label: '标称声压级 L', unit: 'dB', digits: 1 },
      { key: 'offset', label: '修正量（读数−标称）', unit: 'dB', digits: 2 },
      { key: 'sens', label: '传声器灵敏度', unit: 'mV/Pa', digits: 2 }
    ],
    compute: function (s) {
      var L = parseFloat(s.nominal);
      var f = s.freq, meas = s.measured, mv = s.mV;
      if (!isFinite(L) || !isFinite(f) || !isFinite(meas) || !isFinite(mv)) {
        return { ok: false, error: '请输入有效的数值。' };
      }
      var p = P0 * Math.pow(10, L / 20);          // 实际声压（rms）
      var offset = meas - L;                       // 被校仪器应叠加的修正量
      var sens = mv > 0 ? (mv / 1000) / p * 1000 : null;   // mV/Pa（输出电压÷声压）
      return {
        ok: L > 0 && p > 0,
        values: { p: p, Lref: L, offset: offset, sens: sens },
        formula: 'p = p₀·10^(L/20) = 20 µPa × 10^(' + L.toFixed(0) + '/20) = <span class="fx">' +
          p.toFixed(4) + ' Pa</span>（≈ ' + p.toFixed(2) + ' Pa @ ' + f.toFixed(0) + ' Hz）\n' +
          '修正量 = 读数 − 标称 = ' + meas.toFixed(1) + ' − ' + L.toFixed(0) + ' = <span class="fx">' +
          offset.toFixed(2) + ' dB</span>' +
          (sens != null ? '\n灵敏度 = U/p = ' + mv.toFixed(1) + ' mV / ' + p.toFixed(4) + ' Pa = <span class="fx">' +
            sens.toFixed(2) + ' mV/Pa</span>' : ''),
        notes: [
          { level: 'info', text: '94 dB ≈ 1.00 Pa、114 dB ≈ 10.02 Pa（p₀ = 20 µPa）；参考频率 94 dB 级通常为 1 kHz，114 dB 级通常为 250 Hz。' },
          { level: 'info', text: '修正量 = 读数−标称：读数为 93.2 dB 时应补 −0.8 dB 使最终显示 94 dB。' },
          { level: 'warn', text: '严格使用时还应计入校准器的静压/温湿度修正因子与传声器声入射方向；本工具给出口径换算，不含环境修正。' }
        ]
      };
    }
  });

  // ============================ 2) 倍频带中心频率与带宽 ============================
  CalcRegistry.register('oct-band', {
    title: '倍频带中心频率与带宽 · 声学计算工具箱',
    nav: {
      group: '测量与校准',
      label: '倍频带中心频率',
      desc: '1/1 与 1/3 标称序列查表',
      sub: ['ISO 266', '上下限与带宽']
    },
    intro: '按 ISO 266 标称序列查询指定倍频带的中心频率、上下限频率与带宽；1/1 倍频带 10 带（31.5 Hz–16 kHz），1/3 倍频带 31 带（20 Hz–20 kHz）。',
    inputs: [
      { key: 'bw', label: '带宽类型', type: 'select', def: '1',
        options: [ { value: '1', label: '1/1 倍频带（10 带）' }, { value: '3', label: '1/3 倍频带（31 带）' } ] },
      { key: 'band', label: '带号 N（从 1 开始）', unit: '', def: 6, step: 1, min: 1, max: 31 }
    ],
    outputs: [
      { key: 'fc', label: '中心频率 f_c', unit: 'Hz', digits: 2 },
      { key: 'f1', label: '下限频率 f₁', unit: 'Hz', digits: 1 },
      { key: 'f2', label: '上限频率 f₂', unit: 'Hz', digits: 1 },
      { key: 'bwHz', label: '带宽 Δf', unit: 'Hz', digits: 1 }
    ],
    compute: function (s) {
      var third = s.bw === '3';
      var arr = third ? OCT3 : OCT1;
      var n = third ? 3 : 1;
      var idx = Math.round(s.band) - 1;
      if (!isFinite(s.band) || idx < 0 || idx >= arr.length) {
        return { ok: false, error: '带号超出范围：1/1 为 1~' + OCT1.length + '，1/3 为 1~' + OCT3.length + '。' };
      }
      var fc = arr[idx];
      var r = Math.pow(2, 1 / (2 * n));       // 上下限倍频程因子 2^(1/(2n))
      var f1 = fc / r, f2 = fc * r;
      return {
        ok: fc > 0,
        values: { fc: fc, f1: f1, f2: f2, bwHz: f2 - f1 },
        formula: (third ? '1/3 倍频带' : '1/1 倍频带') + '第 ' + (idx + 1) + ' 带（共 ' + arr.length + ' 带）\n' +
          'f₁ = f_c/2^(1/2n) = ' + fc + '/2^(1/' + (2 * n) + ') = <span class="fx">' + f1.toFixed(1) + ' Hz</span>\n' +
          'f₂ = f_c·2^(1/2n) = <span class="fx">' + f2.toFixed(1) + ' Hz</span>；Δf = f₂−f₁ = <span class="fx">' +
          (f2 - f1).toFixed(1) + ' Hz</span>（相对带宽 ≈ ' + (100 * (2 * r - 2) / (2 * r + 2)).toFixed(1) + '%）',
        notes: [
          { level: 'info', text: '1/1 序列：31.5 / 63 / 125 / 250 / 500 / 1k / 2k / 4k / 8k / 16k Hz。' },
          { level: 'info', text: '1/3 序列：20 起每 1/3 倍频程一档至 20 kHz（20/25/31.5/40/50/63/80/100/125/160/200/250/315/400/500/630/800/1k/1.25k/1.6k/2k/2.5k/3.15k/4k/5k/6.3k/8k/10k/12.5k/16k/20k）。' },
          { level: 'info', text: '相邻中心频率之比为 2^(1/n)；带宽与中心频率成正比（1/1 约 70.7%，1/3 约 23.2%）。' }
        ]
      };
    }
  });

  // ============================ 3) 不确定度合成 ============================
  CalcRegistry.register('uncertainty', {
    title: '测量不确定度合成 · 声学计算工具箱',
    nav: {
      group: '测量与校准',
      label: '不确定度合成',
      desc: 'A 类 + B 类 → U(k=2)',
      sub: ['GUM 评定', 'k=2 扩展']
    },
    intro: '按 GUM 思路合成标准不确定度：A 类由重复测量列估计（s/√n），B 类由误差限按分布折算（矩形 √3、三角 √6、正态 2），合成后乘扩展因子 k 得扩展不确定度。',
    inputs: [
      { key: 'n', label: '重复测量次数 n', unit: '', def: 6, step: 1, min: 1, max: 1000 },
      { key: 'sd', label: '重复性标准差 s', unit: 'dB', def: 0.3, step: 0.05, min: 0 },
      { key: 'limit', label: 'B 类误差限 B（半宽）', unit: 'dB', def: 0.5, step: 0.05, min: 0 },
      { key: 'dist', label: 'B 类分布', type: 'select', def: 'rect',
        options: [
          { value: 'rect', label: '矩形（除数 √3）' },
          { value: 'tri', label: '三角（除数 √6）' },
          { value: 'normal', label: '正态（除数 2）' }
        ] },
      { key: 'k', label: '扩展因子 k', unit: '', def: 2, step: 0.5, min: 1, max: 3 }
    ],
    outputs: [
      { key: 'uA', label: 'A 类标准不确定度 u_A', unit: 'dB', digits: 3 },
      { key: 'uB', label: 'B 类标准不确定度 u_B', unit: 'dB', digits: 3 },
      { key: 'uc', label: '合成标准不确定度 u_c', unit: 'dB', digits: 3 },
      { key: 'U', label: '扩展不确定度 U = k·u_c', unit: 'dB', digits: 3 }
    ],
    compute: function (s) {
      var n = Math.round(s.n), sd = s.sd, B = s.limit, k = s.k;
      if (!isFinite(n) || !isFinite(sd) || !isFinite(B) || !isFinite(k) || n < 1 || sd < 0 || B < 0 || k <= 0) {
        return { ok: false, error: '请输入有效参数（n≥1，s、B≥0，k>0）。' };
      }
      var div = s.dist === 'tri' ? Math.sqrt(6) : (s.dist === 'normal' ? 2 : Math.sqrt(3));
      var divName = s.dist === 'tri' ? '√6' : (s.dist === 'normal' ? '2' : '√3');
      var uA = sd / Math.sqrt(n);
      var uB = B / div;
      var uc = Math.sqrt(uA * uA + uB * uB);
      return {
        ok: true,
        values: { uA: uA, uB: uB, uc: uc, U: k * uc },
        formula: 'u_A = s/√n = ' + sd.toFixed(2) + '/√' + n + ' = <span class="fx">' + uA.toFixed(3) + ' dB</span>\n' +
          'u_B = B/' + divName + ' = ' + B.toFixed(2) + '/' + div.toFixed(3) + ' = <span class="fx">' + uB.toFixed(3) + ' dB</span>\n' +
          'u_c = √(u_A²+u_B²) = <span class="fx">' + uc.toFixed(3) + ' dB</span>；' +
          'U = k·u_c = ' + k + '×' + uc.toFixed(3) + ' = <span class="fx">' + (k * uc).toFixed(3) + ' dB</span>',
        notes: [
          { level: 'info', text: 'k=2 对应约 95% 包含概率（近似正态）；报告结果写 L = 测定值 ± U，k=2。' },
          { level: 'warn', text: 'n<2 时 A 类评定不可靠；相关输入量需协方差项时本工具未计入（按不相关合成）。' },
          { level: 'info', text: '声学测量中 B 类常来自校准器允差、传声器方向性与环境修正，按矩形分布估偏保守。' }
        ]
      };
    }
  });

  // ============================ 4) 传声器入射角修正 ============================
  CalcRegistry.register('mic-response', {
    title: '传声器入射角修正 · 声学计算工具箱',
    nav: {
      group: '测量与校准',
      label: '传声器入射角修正',
      desc: '入射角 θ、频率 f → 自由场修正',
      sub: ['有限振膜近似', '压力→自由场']
    },
    intro: '压力场传声器振膜为有限面积，斜入射声波在膜面上平均后有效声压下降。按活塞平均近似，修正量 = 20·log₁₀|2J₁(X)/X|，X = k·a·sinθ（a 为膜有效半径）。',
    inputs: [
      { key: 'theta', label: '入射角 θ（0=法向）', unit: '°', def: 90, step: 5, min: 0, max: 90 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 1000, step: 100, min: 20, max: 40000 },
      { key: 'dia', label: '传声器尺寸（膜有效半径 a）', type: 'select', def: '6.35',
        options: [
          { value: '3.175', label: '1/4 英寸（a≈3.2 mm）' },
          { value: '6.35', label: '1/2 英寸（a≈6.35 mm）' },
          { value: '12.7', label: '1 英寸（a≈12.7 mm）' }
        ] },
      { key: 'c', label: '声速 c', unit: 'm/s', def: 343, step: 1, min: 100 }
    ],
    outputs: [
      { key: 'X', label: '膜面相位参数 X=k·a·sinθ', unit: '', digits: 4 },
      { key: 'corr', label: '入射角修正量', unit: 'dB', digits: 2 },
      { key: 'ratio', label: '有效声压比 |2J₁(X)/X|', unit: '', digits: 4 }
    ],
    compute: function (s) {
      var th = s.theta, f = s.f, c = s.c;
      var a = parseFloat(s.dia) / 1000;          // 选项值为半径 mm → m
      if (!isFinite(th) || !isFinite(f) || !isFinite(c) || !isFinite(a) || f <= 0 || c <= 0 || a <= 0) {
        return { ok: false, error: '请输入有效参数（θ、f、c>0）。' };
      }
      var k = 2 * Math.PI * f / c;
      var X = k * a * Math.sin(th * Math.PI / 180);
      var ratio = X === 0 ? 1 : Math.abs(2 * besselJ1(X) / X);
      var corr = 20 * LOG10(Math.max(ratio, 1e-12));
      return {
        ok: true,
        values: { X: X, corr: corr, ratio: ratio },
        formula: 'X = k·a·sinθ = (2π·' + f.toFixed(0) + '/' + c.toFixed(0) + ')×' + (a * 1000).toFixed(2) +
          ' mm·sin ' + th.toFixed(0) + '° = <span class="fx">' + X.toFixed(4) + '</span>\n' +
          '修正 = 20·log₁₀|2J₁(X)/X| = 20·log₁₀(' + ratio.toFixed(4) + ') = <span class="fx">' +
          corr.toFixed(2) + ' dB</span>',
        notes: [
          { level: 'info', text: 'θ=0°（法向入射）修正恒为 0；θ=90°（掠入射）时高频衰减最大——X 越大修正越负。' },
          { level: 'info', text: '本模型为有限振膜活塞平均一阶近似，不含膜片共振与栅帽衍射；精确自由场修正请查厂家校准曲线（IEC 61094）。' },
          { level: 'warn', text: '1/2 英寸 @10 kHz 掠入射约 −1.5 dB；1 英寸传声器高频斜入射修正明显更大，测量应保持 0° 入射或按方向性补偿。' }
        ]
      };
    }
  });

  // ============================ 5) F/S/I 时间计权读数差 ============================
  CalcRegistry.register('time-weight', {
    title: 'F/S/I 时间计权读数差 · 声学计算工具箱',
    nav: {
      group: '测量与校准',
      label: '时间计权读数差',
      desc: '突发/稳态 → F、S、I 读数估算',
      sub: ['τ_F=125 ms', 'τ_S=1 s', 'τ_I↑=35 ms']
    },
    intro: '按指数检波器近似估算不同时间计权对同一信号的读数：F 快（τ=125 ms）、S 慢（τ=1 s）、I 脉冲（上升 35 ms）。稳态信号三者相同；短突发信号 S 显著欠读、I 接近峰值。',
    inputs: [
      { key: 'mode', label: '信号类型', type: 'select', def: 'burst',
        options: [ { value: 'burst', label: '单个矩形突发（时长 T）' }, { value: 'steady', label: '稳态连续信号' } ] },
      { key: 'T', label: '信号时长 T', unit: 's', def: 0.1, step: 0.01, min: 0.001, max: 100 },
      { key: 'Lb', label: '信号声级（突发内 rms）', unit: 'dB', def: 90, step: 1, min: 0, max: 140 }
    ],
    outputs: [
      { key: 'LF', label: 'F 计权估算读数', unit: 'dB', digits: 2 },
      { key: 'LS', label: 'S 计权估算读数', unit: 'dB', digits: 2 },
      { key: 'LI', label: 'I 计权估算读数', unit: 'dB', digits: 2 },
      { key: 'dFS', label: 'F−S 差', unit: 'dB', digits: 2 },
      { key: 'dFI', label: 'F−I 差', unit: 'dB', digits: 2 }
    ],
    compute: function (s) {
      var T = s.T, Lb = s.Lb;
      if (!isFinite(T) || !isFinite(Lb) || T <= 0) {
        return { ok: false, error: '请输入有效的时长与声级。' };
      }
      var LF, LS, LI;
      if (s.mode === 'steady') {
        LF = LS = LI = Lb;                       // 稳态：三计权均收敛到同一值
      } else {
        // 指数检波器对矩形突发的峰值读数：L + 20log₁₀(1 − e^(−T/τ))
        LF = Lb + 20 * LOG10(1 - Math.exp(-T / 0.125));
        LS = Lb + 20 * LOG10(1 - Math.exp(-T / 1.0));
        LI = Lb + 20 * LOG10(1 - Math.exp(-T / 0.035));   // I 按上升沿 35 ms 近似
      }
      return {
        ok: true,
        values: { LF: LF, LS: LS, LI: LI, dFS: LF - LS, dFI: LF - LI },
        formula: s.mode === 'steady'
          ? '稳态信号：F/S/I 均收敛到信号 rms 声级 = <span class="fx">' + Lb.toFixed(2) + ' dB</span>（差值为 0）'
          : '突发（T=' + T.toFixed(3) + ' s，L=' + Lb.toFixed(1) + ' dB）：\n' +
            'F: 20log₁₀(1−e^(−T/0.125)) = ' + (LF - Lb).toFixed(2) + ' dB → <span class="fx">' + LF.toFixed(2) + ' dB</span>\n' +
            'S: 20log₁₀(1−e^(−T/1)) = ' + (LS - Lb).toFixed(2) + ' dB → <span class="fx">' + LS.toFixed(2) + ' dB</span>\n' +
            'I: 20log₁₀(1−e^(−T/0.035)) = ' + (LI - Lb).toFixed(2) + ' dB → <span class="fx">' + LI.toFixed(2) + ' dB</span>',
        notes: [
          { level: 'info', text: '物理图像：突发短于 τ 时检波器来不及充电，S（1 s）欠读最甚；I 上升快（35 ms）最接近突发峰值。' },
          { level: 'warn', text: '近似说明：按一阶指数检波器估算峰值读数；I 计权还含保持与 1.5 s 衰减沿特性（IEC 61672-1），真实读数以标准检波器与规定试验为准。' },
          { level: 'info', text: 'T≫3 s 时突发公式自动收敛到 Lb，与稳态一致；测量短促噪声（捶击、关门）应选 I 或峰值保持。' }
        ]
      };
    }
  });
})();
