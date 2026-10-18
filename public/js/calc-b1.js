/*
 * calc-b1.js — 声明式计算器 · 材料与建筑声学（6 个工具）
 *
 * 契约：见 calc-core.js 与示范块 calc-b7.js。每个工具 = 一次 CalcRegistry.register，
 * compute(state) 为纯函数（不碰 DOM），返回 { ok, values, formula, notes }。
 *
 * 已实现的 route（nav.group = "材料与建筑声学"）：
 *   mpp            微穿孔板吸声设计器（Maa 模型：孔径/板厚/空腔/穿孔率 → α(f)、共振 f₀）
 *   coincidence    临界吻合频率 fc（面密度/板厚/杨氏模量/泊松比 → fc）
 *   sabine-alpha   由混响测吸声系数（T60/体积/面积 → α，Sabine 与 Eyring 两式）
 *   cavity-abs     薄板/膜共振吸声峰（面密度/空腔深度/阻尼 → f₀、Q、带宽）
 *   wall-tl        单层墙质量定律+吻合（面密度/频率 → TL，含近似吻合谷修正）
 *   floor-float    浮筑楼板改善量（基层 TL/浮筑层/共振频率/评价频率 → ΔR）
 */
(function () {
  'use strict';

  var RHO = 1.21;    // 空气密度 kg/m³
  var C0 = 343;      // 声速 m/s
  var MU = 1.84e-5;  // 空气动力粘度 Pa·s

  // ============================ 1) 微穿孔板吸声设计器 ============================
  CalcRegistry.register('mpp', {
    title: '微穿孔板吸声设计器 · 声学计算工具箱',
    nav: {
      group: '材料与建筑声学',
      label: '微穿孔板吸声器',
      desc: '孔径/板厚/空腔/穿孔率 → 法向吸声系数',
      sub: ['Maa 模型', 'α(f)']
    },
    intro: '基于马大猷(Maa)微穿孔板理论，计算给定结构参数下的法向入射吸声系数与共振频率。',
    inputs: [
      { key: 'd', label: '孔径 d', unit: 'mm', def: 0.8, step: 0.05, min: 0.1, max: 5 },
      { key: 't', label: '板厚 t', unit: 'mm', def: 0.8, step: 0.05, min: 0.1, max: 5 },
      { key: 'sigma', label: '穿孔率 σ', unit: '%', def: 1, step: 0.1, min: 0.1, max: 20 },
      { key: 'D', label: '空腔深度 D', unit: 'mm', def: 50, step: 1, min: 5, max: 400 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 500, step: 10, min: 20, max: 8000 }
    ],
    outputs: [
      { key: 'alpha', label: '法向吸声系数 α', unit: '', digits: 3 },
      { key: 'f0', label: '共振频率 f₀', unit: 'Hz', digits: 1 },
      { key: 'alphaPeak', label: '峰值 α', unit: '', digits: 3 },
      { key: 'Zr', label: '归一化声阻 R', unit: '', digits: 3 },
      { key: 'Zx', label: '归一化声抗 X', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var d = s.d / 1000, t = s.t / 1000, D = s.D / 1000, sig = s.sigma / 100;
      // 单点阻抗
      function imp(ff) {
        var w = 2 * Math.PI * ff;
        var K = d * Math.sqrt(w * RHO / (4 * MU));
        var L = (32 * MU * t) / (RHO * C0 * sig * d * d);
        var r = L * Math.sqrt(1 + K * K / 32) + (Math.SQRT2 / 2) * (K * d / t) * L;
        var x = (w * t) / (RHO * C0 * sig) *
          (1 + (Math.SQRT2 / 2) * (K * d / t) / Math.sqrt(K * K / 2 + 9));
        var xCav = -1 / Math.tan(w * D / C0);
        return { r: r, x: x + xCav };
      }
      var z = imp(s.f);
      var alpha = 4 * z.r / ((1 + z.r) * (1 + z.r) + z.x * z.x);
      // 扫描共振频率（|X| 最小）
      var best = 1e9, f0 = s.f;
      for (var ff = 20; ff <= 8000; ff += 2) {
        var zz = imp(ff);
        if (Math.abs(zz.x) < best) { best = Math.abs(zz.x); f0 = ff; }
      }
      var z0 = imp(f0);
      var alphaPeak = 4 * z0.r / ((1 + z0.r) * (1 + z0.r) + z0.x * z0.x);
      return {
        ok: sig > 0 && d > 0 && t > 0 && D > 0,
        values: { alpha: alpha, f0: f0, alphaPeak: alphaPeak, Zr: z.r, Zx: z.x },
        formula: 'Maa 归一化声阻抗 z=r+jx(板) + x_cav=−cot(ωD/c)，α=4R/((1+R)²+X²)\n' +
          'R=' + z.r.toFixed(3) + '  X=' + z.x.toFixed(3) + ' → α(' + s.f + 'Hz)=<span class="fx">' + alpha.toFixed(3) + '</span>\n' +
          '共振 f₀≈<span class="fx">' + f0.toFixed(1) + ' Hz</span>，峰值 α≈<span class="fx">' + alphaPeak.toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: '模型按 Maa 微穿孔板理论（法向入射）。穿孔率 σ 为孔面积占比（非孔间距）。' },
          { level: 'warn', text: '忽略板后多孔材料、边框泄漏与非线性；工程估算与实测在 ±10% 量级偏差。' }
        ]
      };
    }
  });

  // ============================ 2) 临界吻合频率 fc ============================
  CalcRegistry.register('coincidence', {
    title: '临界吻合频率 fc · 声学计算工具箱',
    nav: {
      group: '材料与建筑声学',
      label: '临界吻合频率',
      desc: '板参数 → 吻合频率',
      sub: ['f_c', '吻合谷']
    },
    intro: '当入射声波在板上的投影波长等于弯曲波波长时发生吻合，隔声在该频率附近出现低谷。',
    inputs: [
      { key: 'ms', label: '面密度 m′', unit: 'kg/m²', def: 20, step: 1, min: 0.1 },
      { key: 'h', label: '板厚 h', unit: 'mm', def: 10, step: 0.5, min: 0.5 },
      { key: 'E', label: '杨氏模量 E', unit: 'GPa', def: 30, step: 1, min: 0.1 },
      { key: 'nu', label: '泊松比 ν', unit: '', def: 0.2, step: 0.01, min: 0, max: 0.49 }
    ],
    outputs: [
      { key: 'fc', label: '临界频率 f_c', unit: 'Hz', digits: 1 },
      { key: 'rhoV', label: '体积密度 ρ', unit: 'kg/m³', digits: 1 }
    ],
    compute: function (s) {
      var hm = s.h / 1000, Epa = s.E * 1e9;
      var rhoV = s.ms / hm;
      var fc = (C0 * C0 / (2 * Math.PI * hm)) * Math.sqrt(rhoV * (1 - s.nu * s.nu) / Epa);
      return {
        ok: hm > 0 && Epa > 0 && s.nu < 1,
        values: { fc: fc, rhoV: rhoV },
        formula: 'f_c = c²/(2πh)·√(ρ(1−ν²)/E)，ρ=m′/h=' + rhoV.toFixed(1) + ' kg/m³\n' +
          'f_c = ' + (C0 * C0).toFixed(0) + '/(2π·' + hm.toFixed(4) + ')·√(' + rhoV.toFixed(1) +
          '·(1−' + (s.nu * s.nu).toFixed(3) + ')/' + Epa.toExponential(2) + ')\n' +
          '= <span class="fx">' + fc.toFixed(1) + ' Hz</span>',
        notes: [
          { level: 'info', text: 'f_c 以下质量定律主导；f_c 附近隔声出现吻合谷，且随入射角增大谷向低频移动。' },
          { level: 'info', text: '示例：混凝土 200mm、m′≈500、E≈30GPa → f_c 约 26 Hz（远低于可听上限）。' }
        ]
      };
    }
  });

  // ============================ 3) 由混响测吸声系数 ============================
  CalcRegistry.register('sabine-alpha', {
    title: '由混响测吸声系数 · 声学计算工具箱',
    nav: {
      group: '材料与建筑声学',
      label: '混响测吸声系数',
      desc: 'T60/体积/面积 → α',
      sub: ['Sabine', 'Eyring']
    },
    intro: '由混响时间反推房间总吸声量 A，再除以表面积得到平均吸声系数（Sabine 与 Eyring 两式）。',
    inputs: [
      { key: 'V', label: '房间体积 V', unit: 'm³', def: 100, step: 5, min: 1 },
      { key: 'S', label: '内表面积 S', unit: 'm²', def: 120, step: 5, min: 1 },
      { key: 'T', label: '混响时间 T60', unit: 's', def: 0.8, step: 0.05, min: 0.05 }
    ],
    outputs: [
      { key: 'A', label: '总吸声量 A', unit: 'm²·Sab', digits: 2 },
      { key: 'aSab', label: 'α (Sabine)', unit: '', digits: 3 },
      { key: 'aEyr', label: 'α (Eyring)', unit: '', digits: 3 }
    ],
    compute: function (s) {
      var A = 0.161 * s.V / s.T;
      var aSab = A / s.S;
      var aEyr = 1 - Math.exp(-0.161 * s.V / (s.S * s.T));
      return {
        ok: s.T > 0 && s.S > 0 && s.V > 0,
        values: { A: A, aSab: aSab, aEyr: aEyr },
        formula: 'Sabine: A=0.161·V/T60=' + (0.161 * s.V).toFixed(2) + '/' + s.T.toFixed(2) +
          '=<span class="fx">' + A.toFixed(2) + '</span> m²·Sab\n' +
          'α_Sabine=A/S=<span class="fx">' + aSab.toFixed(3) + '</span>；' +
          'α_Eyring=1−e^(−A/S)=<span class="fx">' + aEyr.toFixed(3) + '</span>',
        notes: [
          { level: 'info', text: 'Sabine 在吸声较弱(α<0.2)时更准；强吸收用 Eyring 修正更接近实际。' },
          { level: 'warn', text: 'α 应 ≤1；若算得 >1 说明体积/面积/测时数据不自洽或房间非扩散。' }
        ]
      };
    }
  });

  // ============================ 4) 薄板/膜共振吸声峰 ============================
  CalcRegistry.register('cavity-abs', {
    title: '薄板/膜共振吸声峰 · 声学计算工具箱',
    nav: {
      group: '材料与建筑声学',
      label: '薄板共振吸声',
      desc: '质量-弹簧共振峰',
      sub: ['f₀', 'Q/带宽']
    },
    intro: '薄板或膜后设空气空腔构成质量-弹簧共振系统，在共振频率附近产生吸声峰。',
    inputs: [
      { key: 'ms', label: '面密度 m′', unit: 'kg/m²', def: 2, step: 0.1, min: 0.1 },
      { key: 'D', label: '空腔深度 D', unit: 'cm', def: 10, step: 0.5, min: 1 },
      { key: 'zeta', label: '阻尼比 ζ', unit: '', def: 0.1, step: 0.01, min: 0.005, max: 1 }
    ],
    outputs: [
      { key: 'f0', label: '共振频率 f₀', unit: 'Hz', digits: 1 },
      { key: 'Q', label: '品质因数 Q', unit: '', digits: 2 },
      { key: 'bw', label: '半功率带宽 Δf', unit: 'Hz', digits: 1 }
    ],
    compute: function (s) {
      var Dm = s.D / 100; // cm → m
      var f0 = (1 / (2 * Math.PI)) * Math.sqrt(RHO * C0 * C0 / (s.ms * Dm));
      var Q = 1 / (2 * s.zeta);
      var bw = f0 / Q;
      return {
        ok: s.ms > 0 && Dm > 0 && s.zeta > 0,
        values: { f0: f0, Q: Q, bw: bw },
        formula: 'f₀=(1/2π)·√(ρc²/(m′D))，D=' + Dm.toFixed(3) + ' m\n' +
          '= <span class="fx">' + f0.toFixed(1) + ' Hz</span>；' +
          'Q=1/(2ζ)=<span class="fx">' + Q.toFixed(2) + '</span>，' +
          'Δf=f₀/Q=<span class="fx">' + bw.toFixed(1) + ' Hz</span>',
        notes: [
          { level: 'info', text: '增大空腔深度 D 或减小面密度 m′ 均降低共振频率；阻尼比 ζ 控制峰宽与峰高。' },
          { level: 'info', text: '实际薄板吸声还需计入板后多孔材料与边框泄漏，会进一步展宽与抬升峰。' }
        ]
      };
    }
  });

  // ============================ 5) 单层墙质量定律 + 吻合 ============================
  CalcRegistry.register('wall-tl', {
    title: '单层墙质量定律+吻合 · 声学计算工具箱',
    nav: {
      group: '材料与建筑声学',
      label: '单层墙隔声',
      desc: '面密度/频率 → TL',
      sub: ['质量定律', '吻合谷']
    },
    intro: '按质量定律估算单层均质墙现场入射隔声量，并叠加吻合频率附近的近似低谷修正。',
    inputs: [
      { key: 'ms', label: '面密度 m′', unit: 'kg/m²', def: 200, step: 10, min: 1 },
      { key: 'f', label: '频率 f', unit: 'Hz', def: 500, step: 10, min: 20, max: 8000 },
      { key: 'E', label: '杨氏模量 E', unit: 'GPa', def: 30, step: 1, min: 0.1 },
      { key: 'nu', label: '泊松比 ν', unit: '', def: 0.2, step: 0.01, min: 0, max: 0.49 },
      { key: 'h', label: '板厚 h', unit: 'mm', def: 100, step: 2, min: 1 },
      { key: 'zeta', label: '有效阻尼比 ζ', unit: '', def: 0.1, step: 0.01, min: 0.01, max: 1 }
    ],
    outputs: [
      { key: 'TL', label: '隔声量 TL', unit: 'dB', digits: 1 },
      { key: 'fc', label: '临界频率 f_c', unit: 'Hz', digits: 1 },
      { key: 'dip', label: '吻合谷修正', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      var TLmass = 20 * Math.log10(s.ms * s.f) - 47.5;
      var hm = s.h / 1000, Epa = s.E * 1e9, rhoV = s.ms / hm;
      var fc = (C0 * C0 / (2 * Math.PI * hm)) * Math.sqrt(rhoV * (1 - s.nu * s.nu) / Epa);
      // 近似吻合谷：在 fc 附近叠加高斯型低谷（示意，非 Cremer 严格解）
      var dip = 0;
      if (s.f > 0) {
        var depth = Math.min(20, 10 * Math.log10(1 / (2 * s.zeta))); // 谷深上限 20 dB
        var w = fc * 0.5;
        dip = depth * Math.exp(-Math.pow((s.f - fc) / w, 2));
      }
      var TL = TLmass - dip;
      return {
        ok: s.ms > 0 && s.f > 0 && Epa > 0,
        values: { TL: TL, fc: fc, dip: dip },
        formula: '质量定律(现场): TL=20log₁₀(m′f)−47.5=' + TLmass.toFixed(1) + ' dB\n' +
          'f_c=' + fc.toFixed(1) + ' Hz；吻合谷修正≈<span class="fx">' + dip.toFixed(1) + ' dB</span>\n' +
          'TL≈<span class="fx">' + TL.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: '质量定律：隔声量随面密度与频率各约 +6 dB/倍频。现场入射已含平均入射角修正。' },
          { level: 'warn', text: '吻合谷为示意性高斯修正（深度≈10log₁₀(1/2ζ)），非 Cremer 严格解；精确设计请用专业软件。' }
        ]
      };
    }
  });

  // ============================ 6) 浮筑楼板改善量 ============================
  CalcRegistry.register('floor-float', {
    title: '浮筑楼板改善量 · 声学计算工具箱',
    nav: {
      group: '材料与建筑声学',
      label: '浮筑楼板改善',
      desc: '弹性层 → 撞击/空气声改善',
      sub: ['ΔR', 'fₙ']
    },
    intro: '在刚性基层上铺设弹性层与质量层构成"浮筑"结构，可在共振频率以上显著提升隔声/降低撞击声。',
    inputs: [
      { key: 'baseTL', label: '基层隔声 TL₀', unit: 'dB', def: 50, step: 1, min: 0 },
      { key: 'ms', label: '浮筑层 m′', unit: 'kg/m²', def: 40, step: 2, min: 1 },
      { key: 'fn', label: '共振频率 fₙ', unit: 'Hz', def: 15, step: 1, min: 1 },
      { key: 'f', label: '评价频率 f', unit: 'Hz', def: 100, step: 5, min: 20, max: 4000 }
    ],
    outputs: [
      { key: 'dR', label: '改善量 ΔR', unit: 'dB', digits: 1 },
      { key: 'effTL', label: '等效隔声 TL', unit: 'dB', digits: 1 }
    ],
    compute: function (s) {
      var dR = s.f > s.fn ? Math.max(0, 20 * Math.log10(s.f / s.fn) - 3) : 0;
      var effTL = s.baseTL + dR;
      return {
        ok: s.fn > 0 && s.f > 0,
        values: { dR: dR, effTL: effTL },
        formula: '共振以上: ΔR=20log₁₀(f/fₙ)−3 (f>fₙ)\n' +
          'fₙ=' + s.fn + ' Hz, f=' + s.f + ' Hz → ΔR=<span class="fx">' + dR.toFixed(1) + ' dB</span>\n' +
          '等效 TL=TL₀+ΔR=<span class="fx">' + effTL.toFixed(1) + ' dB</span>',
        notes: [
          { level: 'info', text: 'f<fₙ 时浮筑层与基层同相运动，改善≈0；f>√2·fₙ 后每倍频约 +6 dB。' },
          { level: 'warn', text: '弹性层静态刚度、侧向传声(声桥)会削弱实际改善，落地值通常低于本估算。' }
        ]
      };
    }
  });
})();
