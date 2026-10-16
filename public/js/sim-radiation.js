/*
 * sim-radiation.js — 基本声源辐射指向性声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimRadiation，Node 下 module.exports。
 *
 * 物理模型（经典声辐射理论，公开教科书内容，不含任何第三方商业实现）：
 *   θ 为自极轴（声源主方向）起算的角度（deg，0–180），指向性 D(θ) 归一到最大 1：
 *     单极子 monopole：    D(θ) = 1（全指向；脉动小球、气泡）
 *     偶极子 dipole：      D(θ) = |cosθ|（"8"字形，两瓣反相；对置双源、小球摆动的力辐射）
 *     四极子 quadrupole：  D(θ) = |cos2θ|（四叶草；横向四极子，湍流射流噪声）
 *   远场声压：p(r,θ,t) = A·D(θ)·sin(2πft − kr)/r，k = 2π/λ，λ = c/f。
 *
 *   指向性指数 DI = 10·log10(4π / ∮D²dΩ)（D 归一到 max=1）：
 *     ∮D²dΩ = ∫₀^{2π}∫₀^π D²·sinθ dθ dφ = 2π·∫₀^π D²·sinθ dθ，
 *     故 DI = 10·log10(2 / ∫₀^π D²·sinθ dθ)，数值积分取 θ ∈ [0,180°] 每 0.5°（中点法）。
 *     解析校核（∫₀^π sinθ dθ = 2）：
 *       单极子 I = ∫₀^π sinθ dθ = 2        → DI = 0 dB
 *       偶极子 I = ∫₀^π cos²θ·sinθ dθ = 2/3 → DI = 10·lg 3 ≈ 4.77 dB
 *       四极子 I = ∫₀^π cos²2θ·sinθ dθ = 14/15 → DI = 10·lg(15/7) ≈ 3.31 dB
 *
 * 单位约定（SI）：角度 deg，距离 m，频率 Hz，声速 m/s，DI 为 dB。
 */
(function (global) {
  'use strict';

  var MODES = ['monopole', 'dipole', 'quadrupole'];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function err(msg) { return { ok: false, error: msg }; }

  function normMode(mode) {
    return typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  }

  function modeError(mode) {
    return err('未知辐射模式：' + mode + '（可选 monopole / dipole / quadrupole）');
  }

  // 带符号方向因子（θ 为弧度）：过零点符号变化即相邻瓣反相
  function factorRad(m, thetaRad) {
    if (m === 'monopole') return 1;
    if (m === 'dipole') return Math.cos(thetaRad);
    return Math.cos(2 * thetaRad); // quadrupole
  }

  // 幅值吸附：cos(π/2) 等理论零点受浮点误差影响约为 6e-17，统一归零
  function clean(v) {
    var a = Math.abs(v);
    return a < 1e-12 ? 0 : a;
  }

  /* ----------------------- 主入口 ----------------------- */
  // 指向性 D(θ) ∈ [0,1]（归一到最大 1）；非法 mode / θ 返回 { ok:false, error }
  function pattern(mode, thetaDeg) {
    var m = normMode(mode);
    if (MODES.indexOf(m) < 0) return modeError(mode);
    var th = num(thetaDeg);
    if (th == null) return err('角度 θ 必须为数值（deg）');
    return clean(factorRad(m, (th * Math.PI) / 180));
  }

  // 指向性指数 DI = 10·log10(4π/∮D²dΩ)（dB）；D 归一到 max=1
  function directivityIndex(mode) {
    var m = normMode(mode);
    if (MODES.indexOf(m) < 0) return modeError(mode);
    var N = 360;             // 0–180° 每 0.5° 一个区间（中点法）
    var h = Math.PI / N;     // 弧度步长 0.5°
    var sum = 0;
    for (var i = 0; i < N; i++) {
      var D = Math.abs(factorRad(m, (i + 0.5) * h));
      sum += D * D * Math.sin((i + 0.5) * h);
    }
    var I = sum * h;         // ∫₀^π D²·sinθ dθ
    if (!(I > 0)) return err('指向性积分异常（I ≤ 0）');
    var di = (10 * Math.log(2 / I)) / Math.LN10;
    // 单极子精确值为 0，数值积分残差 ~1e-5 dB，吸附掉避免显示 "-0.00"
    return Math.abs(di) < 1e-4 ? 0 : di;
  }

  // 探测点归一声压幅值比例 D(θ)/r；相位项 sin(2πft − kr) 由视图处理动画，此处只取幅值
  function probePressure(thetaDeg, r, f, c, t, mode) {
    var m = normMode(mode);
    if (MODES.indexOf(m) < 0) return modeError(mode);
    var th = num(thetaDeg);
    if (th == null) return err('角度 θ 必须为数值（deg）');
    var rr = num(r);
    if (!(rr > 0)) return err('探测距离 r 必须为正数（m）');
    var ff = num(f);
    if (!(ff > 0)) return err('频率 f 必须为正数（Hz）');
    var cc = num(c);
    if (!(cc > 0)) return err('声速 c 必须为正数（m/s）');
    if (num(t) == null) return err('时间 t 必须为数值（s）');
    return clean(factorRad(m, (th * Math.PI) / 180)) / rr;
  }

  var API = {
    MODES: MODES,
    pattern: pattern,
    directivityIndex: directivityIndex,
    probePressure: probePressure
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimRadiation = API;
  }
})(typeof window !== 'undefined' ? window : this);
