/*
 * calc-b4.js — 声明式计算器 · 噪声与法规（6 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 已实现的 route（nav.group = "噪声与法规"）：
 *   lwp            声功率 Lw ↔ 声压 Lp（ISO 3746 包络面法 + K₁/K₂ 修正 / 自由场预测）
 *   facade         建筑立面/窗外衰减（距外墙距离、楼层高度 → ΔL 近似，含立面反射修正）
 *   fan-noise      风机噪声频谱（Graham 经验式：流量 Q、全压 Δp、转速 n → 倍频带声功率级）
 *   valve-noise    阀门噪声 IEC 60534-8-4（压差 Δp、孔径 d、下游密度 ρ → 声压级与修正，简化）
 *   jet-noise      喷流/排气噪声（喷口速度 U、直径 D → 总声功率级与指向性指数，Lighthill U⁸）
 *   railway        铁路噪声简化（列车速度 v、车型/轴重 → 等效连续声级 Leq 近似，CRN 结构）
 */
(function () {
  'use strict';

  // ============================ 1) 声功率 ↔ 声压（ISO 3746） ============================
  CalcRegistry.register('lwp', {
    title: '声功率↔声压换算 · 声学计算工具箱',
    nav: {
      group: '噪声与法规',
      label: '声功率↔声压',
      desc: 'Lw/Q/r/空间 + K₁K₂ 修正',
      sub: ['ISO 3746 包络面', 'K₁ 环境修正', 'K₂ 背景修正']
    },
    intro: '声功率级与声压级的互算：由测面平均声压反算声功率（ISO 3746 简易法，含环境修正 K₁ 与背景修正 K₂），或由声功率预测距离 r 处声压。',
    inputs: [
      { key: 'mode', label: '方向', type: 'select', def: 'fromLp',
        options: [
          { value: 'fromLp', label: '声压 → 声功率（测量反算）' },
          { value: 'fromLw', label: '声功率 → 声压（预测）' }
        ] },
      { key: 'Lp', label: '测量面平均声压级 L̄p', unit: 'dB', def: 85, step: 1, min: 0, max: 140 },
      { key: 'Lw', label: '声功率级 Lw', unit: 'dB', def: 100, step: 1, min: 0, max: 160 },
      { key: 'Lbg', label: '背景噪声级 L_bg', unit: 'dB', def: 75, step: 1, min: 0, max: 140 },
      { key: 'Q', label: '指向性因数 Q', unit: '', def: 1, step: 0.1, min: 0.1 },
      { key: 'r', label: '特征测量距离 r', unit: 'm', def: 2, step: 0.1, min: 0.1 },
      { key: 'space', label: '测量面 / 空间类型', type: 'select', def: 'hemi',
        options: [
          { value: 'hemi', label: '半球面（地面反射）S=2πr²' },
          { value: 'sphere', label: '全空间球面 S=4πr²' },
          { value: 'quarter', label: '1/4 空间（两反射面）S=πr²' },
          { value: 'eighth', label: '1/8 空间（三反射面）S=πr²/2' }
        ] },
      { key: 'A', label: '房间等效吸声量 A', unit: 'm²', def: 10, step: 1, min: 0.1 }
    ],
    outputs: [
      { key: 'Lw', label: '声功率级 Lw', unit: 'dB', digits: 1 },
      { key: 'Lp', label: '声压级 Lp', unit: 'dB', digits: 1 },
      { key: 'K1', label: '环境修正 K₁', unit: 'dB', digits: 2 },
      { key: 'K2', label: '背景修正 K₂', unit: 'dB', digits: 2 }
    ],
    compute: function (s) {
      if (!(s.r > 0) || !(s.A > 0) || !(s.Q > 0)) {
        return { ok: false, error: '距离、吸声量与指向性因数必须为正', values: {} };
      }
      var kPi = { hemi: 2, sphere: 4, quarter: 1, eighth: 0.5 }[s.space] || 2;
      var S = kPi * Math.PI * s.r * s.r;   // 测量面面积 m²
      var K1 = 10 * Math.log10(1 + 4 * S / s.A);
      if (s.mode === 'fromLw') {
        var LpOut = s.Lw + 10 * Math.log10(s.Q / S);
        return {
          ok: true,
          values: { Lw: s.Lw, Lp: LpOut, K1: NaN, K2: NaN },
          formula: 'Lp = Lw + 10lg(Q/S) = ' + s.Lw + ' + 10lg(' + s.Q.toFixed(2) + '/' + S.toFixed(2) + ') = ' +
            '<span class="fx">' + LpOut.toFixed(1) + ' dB</span>\n' +
            'S = ' + kPi + 'πr² = ' + S.toFixed(2) + ' m²；每加倍距离衰减 ' +
            (kPi >= 2 ? '3' : '6') + ' dB（' + (kPi >= 2 ? '半空间' : '全空间') + '）',
          notes: [
            { level: 'info', text: '预测模式为自由场/简单镜像近似：Lp = Lw + 10lg(Q/(kπr²))；房间内还受混响与反射影响，需另用房间声学模型。' },
            { level: 'info', text: 'Q=1 全向点源；靠刚性地面 Q=2(+3 dB)、墙角 Q=4(+6 dB)、三面角 Q=8(+9 dB)。' }
          ]
        };
      }
      // 声压 → 声功率（ISO 3746 简易法）
      var dL = s.Lp - s.Lbg;
      if (dL <= 0) {
        return { ok: false, error: '背景噪声不低于被测声压，无法分离声源（L̄p − L_bg ≤ 0）', values: {} };
      }
      var K2 = -10 * Math.log10(1 - Math.pow(10, -0.1 * dL));
      var LwOut = s.Lp + 10 * Math.log10(S) - K1 - K2;
      return {
        ok: true,
        values: { Lw: LwOut, Lp: s.Lp, K1: K1, K2: K2 },
        formula: 'Lw = L̄p + 10lg(S/S₀) − K₁ − K₂ = ' + s.Lp + ' + 10lg(' + S.toFixed(2) + ') − ' +
          K1.toFixed(2) + ' − ' + K2.toFixed(2) + ' = <span class="fx">' + LwOut.toFixed(1) + ' dB</span>\n' +
          'K₁ = 10lg(1+4S/A) = 10lg(1+' + (4 * S).toFixed(1) + '/' + s.A + ') = <span class="fx">' + K1.toFixed(2) + ' dB</span>\n' +
          'K₂ = −10lg(1−10^(−0.1ΔL))，ΔL = L̄p−L_bg = ' + dL.toFixed(1) + ' dB → <span class="fx">' + K2.toFixed(2) + ' dB</span>',
        notes: [
          { level: 'info', text: 'ISO 3746（简易法）：Lw = L̄p + 10lg(S/S₀) − K₁ − K₂，S₀ = 1 m²；K₁ = 10lg(1+4S/A) 为环境（反射）修正，A 为房间等效吸声量。' },
          { level: 'info', text: 'K₂ 为背景噪声修正：ΔL = 10 dB 时 K₂ ≈ 0.46 dB，ΔL = 6 dB 时 ≈ 1.26 dB，ΔL = 3 dB 时 ≈ 3.0 dB。' },
          { level: 'warn', text: dL < 6 ? 'ΔL < 6 dB：背景修正过大，结果不可靠，应改善测量条件。' : '指向性因数 Q 已隐含在测面平均声压中；测量面应包络声源（ISO 3746 关键尺寸 +1 m）。' }
        ]
      };
    }
  });

  // ============================ 2) 建筑立面 / 窗外衰减 ============================
  CalcRegistry.register('facade', {
    title: '建筑立面/窗外衰减 · 声学计算工具箱',
    nav: {
      group: '噪声与法规',
      label: '建筑立面衰减',
      desc: '距墙距离/楼层高度 → ΔL',
      sub: ['斜距发散', '线/点声源', '立面反射 +6/+3 dB']
    },
    intro: '预测交通噪声到达建筑立面（窗外）某点的声级：斜距几何发散 + 立面反射增量；楼层越高斜距越大，但地面效应减弱，本简化模型不计地面效应。',
    inputs: [
      { key: 'd', label: '线路中心线至外墙距离 d', unit: 'm', def: 40, step: 1, min: 1 },
      { key: 'h', label: '预测点（窗）高度 h', unit: 'm', def: 20, step: 1, min: 0 },
      { key: 'srcH', label: '声源（车辆）平均高度', unit: 'm', def: 1, step: 0.1, min: 0 },
      { key: 'type', label: '声源类型', type: 'select', def: 'line',
        options: [
          { value: 'line', label: '线声源（路段连续车流，−10lg）' },
          { value: 'point', label: '点声源（路口/间歇车流，−20lg）' }
        ] },
      { key: 'L0', label: '参考点声级 L₀', unit: 'dB', def: 68, step: 1, min: 0, max: 120 },
      { key: 'r0', label: '参考距离 r₀', unit: 'm', def: 7.5, step: 0.5, min: 0.5 },
      { key: 'refl', label: '测点与墙面相对位置', type: 'select', def: '2m',
        options: [
          { value: 'flush', label: '贴墙面（+6 dB，声压加倍）' },
          { value: '2m', label: '距墙约 2 m（+3 dB，能量加倍）' },
          { value: 'none', label: '自由场（+0 dB）' }
        ] }
    ],
    outputs: [
      { key: 'r', label: '斜距 r', unit: 'm', digits: 2 },
      { key: 'dL', label: '几何发散衰减 ΔL', unit: 'dB', digits: 2 },
      { key: 'Lf', label: '立面预测声级 L_f', unit: 'dB', digits: 1 },
      { key: 'Lfree', label: '同距离自由场声级', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      if (!(s.d > 0) || !(s.r0 > 0)) {
        return { ok: false, error: '距离参数必须为正', values: {} };
      }
      var dh = s.h - s.srcH;
      var r = Math.sqrt(s.d * s.d + dh * dh);
      var dL = s.type === 'line' ? -10 * Math.log10(r / s.r0) : -20 * Math.log10(r / s.r0);
      var refl = s.refl === 'flush' ? 6 : (s.refl === '2m' ? 3 : 0);
      var Lf = s.L0 + dL + refl;
      var Lfree = s.L0 + dL;
      return {
        ok: true,
        values: { r: r, dL: dL, Lf: Lf, Lfree: Lfree },
        formula: '斜距 r = √(d²+(h−h_src)²) = √(' + s.d + '²+' + dh.toFixed(1) + '²) = <span class="fx">' + r.toFixed(2) + ' m</span>\n' +
          (s.type === 'line' ? '线声源：ΔL = −10lg(r/r₀)' : '点声源：ΔL = −20lg(r/r₀)') +
          ' = <span class="fx">' + dL.toFixed(2) + ' dB</span>\n' +
          'L_f = L₀ + ΔL + 反射增量(' + refl + ' dB) = <span class="fx">' + Lf.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: '线声源（路段连续车流）按 −10lg(r/r₀) 发散，点声源（路口/间歇）按 −20lg(r/r₀)；r₀ 常取 7.5 m，L₀ 为参考点（车速等条件）声级。' },
          { level: 'info', text: '立面反射增量：贴墙 +6 dB（直达波与镜像同相、声压加倍）、距墙约 2 m +3 dB（能量加倍，ISO 1996-2 / ASTM 惯例，适用于道路交通等展源）、自由场 0（数据来源：ISO 1996-2、Chalmers 立面反射研究）。' },
          { level: 'warn', text: '未计地面效应、屏障/建筑群遮挡、空气吸收与多重反射；高层低层差异除斜距外还受地面效应影响（可差 ±2 dB）。' }
        ]
      };
    }
  });

  // ============================ 3) 风机噪声频谱（Graham） ============================
  CalcRegistry.register('fan-noise', {
    title: '风机噪声频谱 · 声学计算工具箱',
    nav: {
      group: '噪声与法规',
      label: '风机噪声频谱',
      desc: 'Q/Δp/转速 → 倍频带声功率级',
      sub: ['Graham 经验式', '叶频 BPF 增量', '总声功率级']
    },
    intro: '用 Graham 经验式由流量、全压与转速估算风机各倍频带（63 Hz~8 kHz）声功率级，并在叶频（BPF）所在频带加离散增量。',
    inputs: [
      { key: 'Q', label: '体积流量 Q', unit: 'm³/s', def: 2, step: 0.1, min: 0.01 },
      { key: 'dp', label: '风机全压 Δp', unit: 'kPa', def: 1, step: 0.1, min: 0.01 },
      { key: 'rpm', label: '转速 n', unit: 'r/min', def: 1450, step: 50, min: 1 },
      { key: 'blades', label: '叶片数 Z', unit: '', def: 8, step: 1, min: 0, max: 60 },
      { key: 'type', label: '风机类型', type: 'select', def: 'bc',
        options: [
          { value: 'bc', label: '后向弯叶离心（径向出口）' },
          { value: 'radial', label: '径向直叶离心' },
          { value: 'vaneaxial', label: '翼型轴流（轮毂比 0.6~0.8）' }
        ] }
    ],
    outputs: [
      { key: 'bpf', label: '叶频 BPF', unit: 'Hz', digits: 1 },
      { key: 'L63', label: '63 Hz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L125', label: '125 Hz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L250', label: '250 Hz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L500', label: '500 Hz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L1000', label: '1 kHz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L2000', label: '2 kHz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L4000', label: '4 kHz 声功率级', unit: 'dB', digits: 1 },
      { key: 'L8000', label: '8 kHz 声功率级', unit: 'dB', digits: 1 },
      { key: 'Ltot', label: '总声功率级 Lw', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      if (!(s.Q > 0) || !(s.dp > 0) || s.rpm < 0 || s.blades < 0) {
        return { ok: false, error: '流量与全压必须为正，转速/叶片数不能为负', values: {} };
      }
      var T = {
        bc: { C: 3, b: [90, 90, 88, 84, 79, 73, 69, 64] },
        radial: { C: 8, b: [113, 108, 96, 93, 91, 86, 82, 79] },
        vaneaxial: { C: 6, b: [98, 97, 96, 96, 94, 92, 88, 85] }
      }[s.type];
      var centers = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
      var bpf = s.blades * s.rpm / 60;
      var bi = -1, bd = Infinity, i;
      if (bpf > 0) {
        for (i = 0; i < centers.length; i++) {
          var dd = Math.abs(bpf - centers[i]);
          if (dd < bd) { bd = dd; bi = i; }
        }
      }
      var base = 10 * Math.log10(s.Q) + 20 * Math.log10(s.dp);
      var vals = { bpf: bpf };
      var sum = 0;
      for (i = 0; i < centers.length; i++) {
        var Lwi = T.b[i] + base + (i === bi ? T.C : 0);
        vals['L' + centers[i]] = Lwi;
        sum += Math.pow(10, Lwi / 10);
      }
      vals.Ltot = 10 * Math.log10(sum);
      return {
        ok: true,
        values: vals,
        formula: 'Lw(频带) = K + 10lg(Q) + 20lg(Δp) + C（BPF 频带）\n' +
          '10lg(Q)+20lg(Δp) = 10lg(' + s.Q + ')+20lg(' + s.dp + ') = <span class="fx">' + base.toFixed(2) + ' dB</span>；' +
          'BPF = Z·n/60 = ' + s.blades + '×' + s.rpm + '/60 = <span class="fx">' + bpf.toFixed(1) + ' Hz</span>' +
          (bi >= 0 ? '（落入 ' + centers[bi] + ' Hz 频带，+' + T.C + ' dB）' : '') + '\n' +
          '总声功率级 = <span class="fx">' + vals.Ltot.toFixed(1) + ' dB</span>（re 1 pW）',
        notes: [
          { level: 'info', text: 'Graham 1972 经验式（Harris《噪声与振动控制手册》表 41.1）：K 表值对应 Q = 1 m³/s、Δp = 1 kPa、轮径 <0.75 m 的基准比声功率级；C 为叶频增量（表中为最小值，实测可高出一倍）。' },
          { level: 'info', text: '类型对比：后向弯叶/机翼型最低频偏平、径向直叶最噪且中频峰值高、翼型轴流中高频抬升；前向弯叶介于两者之间（本表未列）。' },
          { level: 'warn', text: '经验式离散度大（±5 dB），受系统阻抗、进出口条件与安装影响；选型比较可用，最终以厂家 AMCA 301 实测值为准。' }
        ]
      };
    }
  });

  // ============================ 4) 阀门噪声 IEC 60534-8-4（简化） ============================
  CalcRegistry.register('valve-noise', {
    title: '阀门噪声 IEC 60534-8-4 · 声学计算工具箱',
    nav: {
      group: '噪声与法规',
      label: '阀门噪声 IEC 60534',
      desc: 'Δp/d/ρ → 阀内声压级',
      sub: ['U_vc 缩流速度', 'η_turb 声效率', '管外 1 m 估算']
    },
    intro: '按 IEC 60534-8-4（液体动力流噪声预测）简化：由压差、孔径与下游密度求缩流速度、机械流功率与紊流声效率，进而给出阀内声功率级/声压级与管外 1 m 估算。',
    inputs: [
      { key: 'dp', label: '阀前后压差 Δp', unit: 'bar', def: 5, step: 0.5, min: 0.01 },
      { key: 'd', label: '下游管内径 d', unit: 'mm', def: 100, step: 5, min: 5 },
      { key: 'rho', label: '下游介质密度 ρ', unit: 'kg/m³', def: 998, step: 10, min: 1 },
      { key: 'c', label: '介质声速 c', unit: 'm/s', def: 1481, step: 10, min: 50 },
      { key: 'Q', label: '体积流量 Q', unit: 'm³/h', def: 100, step: 5, min: 0.1 },
      { key: 'FL', label: '液体压力恢复系数 F_L', unit: '', def: 0.9, step: 0.05, min: 0.1, max: 1 },
      { key: 'TL', label: '管壁传播损失 TL', unit: 'dB', def: 30, step: 1, min: 0, max: 80 },
      { key: 'Lp', label: '下游管段长度 L', unit: 'm', def: 3, step: 0.5, min: 0.5 }
    ],
    outputs: [
      { key: 'Uvc', label: '缩流速度 U_vc', unit: 'm/s', digits: 2 },
      { key: 'Wm', label: '机械流功率 W_m', unit: 'W', digits: 0 },
      { key: 'eta', label: '紊流声效率 η', unit: '', digits: 4 },
      { key: 'Lwi', label: '阀内声功率级 L_Wi', unit: 'dB', digits: 1 },
      { key: 'Lpi', label: '管内（阀内）声压级 L_pi', unit: 'dB', digits: 1 },
      { key: 'Lpe', label: '管外 1 m 声压级', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      if (!(s.dp > 0) || !(s.d > 0) || !(s.rho > 0) || !(s.c > 0) || !(s.Q > 0) || !(s.FL > 0) || !(s.Lp > 0)) {
        return { ok: false, error: '压差、管径、密度、声速、流量、F_L 与管长必须为正', values: {} };
      }
      var dpPa = s.dp * 1e5;
      var Qv = s.Q / 3600;                              // m³/s
      var A = Math.PI * Math.pow(s.d / 1000, 2) / 4;    // 管截面 m²
      var Uvc = Math.sqrt(2 * dpPa / s.rho) / s.FL;     // 缩流速度
      var Wm = Qv * dpPa;                               // 机械流功率 W（= ṁ·Δp/ρ）
      var eta = 1e-4 * (Uvc / s.c);                     // 紊流声效率（IEC：U_vc=c_L 时 η=10⁻⁴）
      var Wa = eta * Wm;
      var Lwi = 10 * Math.log10(Wa / 1e-12);
      var Lpi = Lwi + 10 * Math.log10(s.rho * s.c / A) - 26.02;  // 平面波 p=√(W·ρc/A)，re 20 µPa
      var Lwext = Lwi - 10 * Math.log10(s.Lp) - s.TL;   // 外部声功率/管长
      var Lpe = Lwext - 10 * Math.log10(2 * Math.PI * 1);
      return {
        ok: true,
        values: { Uvc: Uvc, Wm: Wm, eta: eta, Lwi: Lwi, Lpi: Lpi, Lpe: Lpe },
        formula: 'U_vc = (1/F_L)·√(2Δp/ρ) = √(2×' + dpPa.toFixed(0) + '/' + s.rho + ')/' + s.FL +
          ' = <span class="fx">' + Uvc.toFixed(2) + ' m/s</span>\n' +
          'W_m = Q·Δp = ' + Qv.toFixed(4) + '×' + dpPa.toFixed(0) + ' = <span class="fx">' + Wm.toFixed(0) + ' W</span>；' +
          'η_turb = 10⁻⁴·(U_vc/c) = <span class="fx">' + eta.toExponential(2) + '</span>\n' +
          'L_Wi = 10lg(η·W_m/10⁻¹²) = <span class="fx">' + Lwi.toFixed(1) + ' dB</span>；' +
          'L_pi = L_Wi + 10lg(ρc/A) − 26.02 = <span class="fx">' + Lpi.toFixed(1) + ' dB</span>（re 20 µPa）\n' +
          '管外 1 m：L_p = L_Wi − 10lg(L) − TL − 10lg(2π) = <span class="fx">' + Lpe.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: '依据 IEC 60534-8-4:2015（液体动力流经控制阀噪声预测）紊流分支简化：W_m = Q·Δp，η_turb = 10⁻⁴·(U_vc/c_L)（标准取 U_vc = c_L 时 η = 10⁻⁴ 的单极子源近似），L_Wi = 10lg(η·W_m/W₀)。' },
          { level: 'info', text: '管内声压级按平面波关系 p = √(W·ρc/A) 折算（−26.02 dB 为 10⁻¹² W 与 20 µPa 两个参考量级差）；管外 1 m 按管壁传播损失 TL 与无限长线声源（2πr）展开近似，未计 A 计权与指向性。' },
          { level: 'warn', text: '仅适用紊流工况；当 Δp 超过缩流处压力恢复极限（约 F_L²·(p₁−p_v)）将出现空化/阻塞流，噪声激增，须按标准空化分支（η_cav）另算，本式严重低估。' },
          { level: 'info', text: '气体介质请用 IEC 60534-8-3（气体动力流），本式仅针对液体。' }
        ]
      };
    }
  });

  // ============================ 5) 喷流 / 排气噪声（Lighthill U⁸） ============================
  CalcRegistry.register('jet-noise', {
    title: '喷流/排气噪声 · 声学计算工具箱',
    nav: {
      group: '噪声与法规',
      label: '喷流排气噪声',
      desc: 'U/D → 总声功率级与指向性',
      sub: ['Lighthill U⁸ 定律', 'St≈0.2 峰值频率', 'DI≈3 dB']
    },
    intro: '亚声速冷喷流的湍流混合噪声按 Lighthill 八次方定律估算总声功率，频谱峰值在 Strouhal 数约 0.2，最大辐射方向约 30°~40°。',
    inputs: [
      { key: 'U', label: '喷口速度 U', unit: 'm/s', def: 100, step: 10, min: 1 },
      { key: 'D', label: '喷口直径 D', unit: 'm', def: 0.1, step: 0.01, min: 0.005 },
      { key: 'rho', label: '环境密度 ρ', unit: 'kg/m³', def: 1.2, step: 0.1, min: 0.01 },
      { key: 'c', label: '环境声速 c', unit: 'm/s', def: 343, step: 1, min: 50 },
      { key: 'K', label: 'Lighthill 常数 K', unit: '', def: 0.00003, step: 0.00001, min: 0.000001 },
      { key: 'r', label: '预测距离 r', unit: 'm', def: 10, step: 1, min: 0.5 }
    ],
    outputs: [
      { key: 'M', label: '喷流马赫数 M', unit: '', digits: 3 },
      { key: 'W', label: '总声功率 W', unit: 'W', digits: 3 },
      { key: 'Lw', label: '总声功率级 Lw', unit: 'dB', digits: 1 },
      { key: 'DI', label: '指向性指数 DI', unit: 'dB', digits: 1 },
      { key: 'fpeak', label: '频谱峰值频率', unit: 'Hz', digits: 1 },
      { key: 'Lp', label: 'r 处声压级（最大方向）', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      if (!(s.U > 0) || !(s.D > 0) || !(s.rho > 0) || !(s.c > 0) || !(s.K > 0) || !(s.r > 0)) {
        return { ok: false, error: '速度、直径、密度、声速、K 与距离必须为正', values: {} };
      }
      var Mach = s.U / s.c;
      var W = s.K * s.rho * Math.pow(s.U, 8) * s.D * s.D / Math.pow(s.c, 5);
      var Lw = 10 * Math.log10(W / 1e-12);
      var DI = 3;                                  // 亚声速冷喷流等效指向性指数（近似）
      var Q = Math.pow(10, DI / 10);
      var fpeak = 0.2 * s.U / s.D;
      var Lp = Lw + 10 * Math.log10(Q / (4 * Math.PI * s.r * s.r));
      return {
        ok: true,
        values: { M: Mach, W: W, Lw: Lw, DI: DI, fpeak: fpeak, Lp: Lp },
        formula: 'W = K·ρ·U⁸·D²/c⁵ = ' + s.K + '×' + s.rho + '×' + s.U + '⁸×' + s.D + '²/' + s.c +
          '⁵ = <span class="fx">' + W.toPrecision(4) + ' W</span>\n' +
          'Lw = 10lg(W/10⁻¹²) = <span class="fx">' + Lw.toFixed(1) + ' dB</span>；' +
          'f_peak = St·U/D（St≈0.2）= <span class="fx">' + fpeak.toFixed(1) + ' Hz</span>\n' +
          'Lp(r) = Lw + 10lg(Q/4πr²)（Q = 10^(DI/10) = ' + Q.toFixed(2) + '）= <span class="fx">' + Lp.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: 'Lighthill 八次方定律：W = K·ρ₀·U⁸·D²/c₀⁵，冷喷流典型 K ≈ 3×10⁻⁵（热喷流可高约一个量级，可自行修改 K）。速度翻倍 → 声功率 +24 dB（80·lg2）。' },
          { level: 'info', text: '指向性：亚声速冷喷流最大辐射方向约 30°~40°（比 90° 方向高 10 dB 以上），等效 DI ≈ 3 dB；频谱按 Strouhal 数 St = fD/U ≈ 0.2 标定，峰值以上约 −25 dB/dec 衰减。' },
          { level: 'warn', text: Mach >= 0.9 ? 'M ≥ 0.9：接近/进入超声速，马赫波散射噪声主导，总声功率可远高于本式，须用专门模型。' : '适用于冷亚声速自由喷流（M < 0.9）；高温排气、约束射流与反射面附近需另行修正。' }
        ]
      };
    }
  });

  // ============================ 6) 铁路噪声简化（CRN 结构） ============================
  CalcRegistry.register('railway', {
    title: '铁路噪声简化 · 声学计算工具箱',
    nav: {
      group: '噪声与法规',
      label: '铁路噪声简化',
      desc: '速度/车型/轴重 → Leq',
      sub: ['CRN 结构', 'SEL→LAeq', '线声源距离修正']
    },
    intro: '按英国 CRN 结构简化预测铁路噪声：单列通过暴露级 SEL（25 m 参考）经速度、车型、轨道与轴重修正后，按列车次数与时段折算为等效连续声级 LAeq。',
    inputs: [
      { key: 'v', label: '列车速度 v', unit: 'km/h', def: 120, step: 10, min: 5, max: 400 },
      { key: 'vtype', label: '车型', type: 'select', def: 'disc-coach',
        options: [
          { value: 'disc-coach', label: '盘形制动客车（+6.0）' },
          { value: 'tread-coach', label: '踏面制动客车（+14.8）' },
          { value: 'disc-freight', label: '盘形制动货车（+8.0）' },
          { value: 'tread-freight', label: '踏面制动货车（+12.0）' },
          { value: 'diesel', label: '内燃机车（+14.8）' },
          { value: 'hsr', label: '动车组/高铁（+0.0）' }
        ] },
      { key: 'axle', label: '轴重 m', unit: 't', def: 16.5, step: 0.5, min: 5, max: 30 },
      { key: 'track', label: '轨道类型', type: 'select', def: 'ballast',
        options: [
          { value: 'ballast', label: '有砟轨道（+0）' },
          { value: 'slab', label: '无砟板式轨道（+2）' },
          { value: 'bridge', label: '桥梁/高架（+4）' }
        ] },
      { key: 'n', label: '编组车辆数 n', unit: '', def: 8, step: 1, min: 1, max: 80 },
      { key: 'r', label: '预测点距轨道中心 r', unit: 'm', def: 50, step: 5, min: 5 },
      { key: 'N', label: '时段内列车数 N', unit: '列', def: 24, step: 1, min: 0, max: 500 },
      { key: 'T', label: '预测时段 T', unit: 'h', def: 24, step: 1, min: 0.1, max: 24 }
    ],
    outputs: [
      { key: 'sel25', label: '单列 SEL（25 m）', unit: 'dB(A)', digits: 1 },
      { key: 'lr', label: '单列通过暴露级（r 处）', unit: 'dB(A)', digits: 1 },
      { key: 'leq', label: '时段等效 LAeq', unit: 'dB(A)', digits: 1 },
      { key: 'dAxle', label: '轴重修正量', unit: 'dB', digits: 2 }
    ],
    compute: function (s) {
      if (!(s.v > 0) || s.n < 1 || !(s.r > 0) || s.N < 0 || !(s.T > 0) || !(s.axle > 0)) {
        return { ok: false, error: '速度>0、编组≥1、距离>0、时段>0、轴重>0、列车数≥0', values: {} };
      }
      var Cv = {
        'disc-coach': 6.0, 'tread-coach': 14.8, 'disc-freight': 8.0,
        'tread-freight': 12.0, 'diesel': 14.8, 'hsr': 0.0
      }[s.vtype];
      var Ct = { ballast: 0, slab: 2, bridge: 4 }[s.track];
      var dAxle = 10 * Math.log10(s.axle / 16.5);     // 轴重经验修正（参考轴重 16.5 t）
      var sel25 = 31.2 + 20 * Math.log10(s.v) + Cv + 10 * Math.log10(s.n) + Ct + dAxle;
      var lr = sel25 - 10 * Math.log10(Math.max(s.r, 5) / 25);   // 线声源距离修正
      var leq = s.N > 0 ? lr + 10 * Math.log10(s.N / (3600 * s.T)) : NaN;
      return {
        ok: true,
        values: { sel25: sel25, lr: lr, leq: leq, dAxle: dAxle },
        formula: 'SEL = 31.2 + 20lg(v) + C_车型 + 10lg(n) + C_轨道 + ΔL_轴重\n' +
          '= 31.2 + 20lg(' + s.v + ') + ' + Cv.toFixed(1) + ' + 10lg(' + s.n + ') + ' + Ct +
          ' + ' + dAxle.toFixed(2) + ' = <span class="fx">' + sel25.toFixed(1) + ' dB(A)</span>\n' +
          'L(r) = SEL − 10lg(r/25) = SEL − 10lg(' + s.r + '/25) = <span class="fx">' + lr.toFixed(1) + ' dB(A)</span>\n' +
          (s.N > 0
            ? 'LAeq = L(r) + 10lg(N/3600T) = ' + lr.toFixed(1) + ' + 10lg(' + s.N + '/' + (3600 * s.T).toFixed(0) + ') = <span class="fx">' + leq.toFixed(1) + ' dB(A)</span>'
            : '时段内无列车通过：LAeq 无定义（显示「—」）'),
        notes: [
          { level: 'info', text: '结构参照英国 CRN：单辆通过暴露级 SEL = 31.2 + 20lg(v) dB(A)（25 m 参考、连续焊接轨/有砟），LAeq,T = SEL + 10lg(N/T_s)（等价于 CRN 的 LAeq,18h = SEL − 48.1 + 10lgQ）。' },
          { level: 'info', text: '车型修正取自 CRN 车辆类别表；轨道修正：无砟板式 +2、桥梁 +4 dB(A)；编组辆数以 10lg(n) 计入（暴露叠加）。' },
          { level: 'warn', text: '轴重修正为经验近似：ΔL ≈ 10lg(m/16.5)（参考轴重 16.5 t，滚动噪声激励近似随轴重对数增长，实测离散可达 ±2 dB）。' },
          { level: 'info', text: '距离修正按线声源 −10lg(r/25)；纯滚动噪声速度指数约 30lg(v/v₀)，CRN 基准式取 20lg(v)（多声源混合）；v > 300 km/h 气动噪声主导（约 80lgv），本式对高铁将低估 5~10 dB。' },
          { level: 'info', text: '未计屏障衰减、地面效应、建筑群反射与线路曲率（小半径曲线啸叫可 +8 dB）。' }
        ]
      };
    }
  });
})();
