/*
 * sim-drone.js — 无人机（多旋翼）旋翼噪声简化内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimDrone，Node 下 module.exports。
 *
 * 模型说明（均为公开经典声学理论，不含任何第三方商业实现）：
 *   - 叶桨通过频率 BPF = (rpm/60)·B —— 旋翼的主导纯音（tonal）频率
 *   - 平面自由场球面扩展：Lp = Lw − 20·log10(r) − 11
 *   - A 计权：在各谐波处查 IEC 61672 近似曲线后做功率叠加
 *   本内核只做参数化音调模型 + 半球/球面几何衰减估算，不含 CFD/BEM 物理仿真；
 *   最终声学性能应以现场测量为准。
 */
(function (global) {
  'use strict';

  var C_AIR = 343; // 声速 m/s（20 ℃ 空气，SI）

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).trim());
    return (isNaN(n) || !isFinite(n)) ? null : n;
  }

  function log10(x) { return Math.log(x) / Math.LN10; }

  // A 计权修正（IEC 61672 标准近似），单位 dB；f=1000 Hz 时 ≈ 0 dB。
  function Aweight(f) {
    if (!(f > 0)) return -Infinity;
    var f2 = f * f;
    var nume = 12194 * 12194 * f2 * f2;
    var den = (f2 + 20.6 * 20.6) *
              Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
              (f2 + 12194 * 12194);
    var R = nume / den;
    return 20 * log10(R) + 2.0;
  }

  /*
   * analyze(opts) → 无人机旋翼噪声的简化音色调性模型
   * 输入（SI）：rpm 转速、blades 桨叶数、Lw 声功率级、r 观测距离、c 声速
   * 输出：{ ok, BPF, harmonics, Lp, AWeighted, spectrum, notes }
   */
  function analyze(opts) {
    opts = opts || {};
    var rpm = num(opts.rpm);     if (rpm == null) rpm = 3000;
    var blades = num(opts.blades); if (blades == null) blades = 2;
    var Lw = num(opts.Lw);       if (Lw == null) Lw = 95;
    var r = num(opts.r);          if (r == null) r = 10;
    var c = num(opts.c);          if (c == null) c = 343;

    // 参数校验
    if (!(rpm > 0))      return { ok: false, error: '转速 rpm 必须为正数' };
    if (!(blades >= 1) || Math.floor(blades) !== blades)
                          return { ok: false, error: '桨叶数 blades 必须为 ≥1 的整数' };
    if (!isFinite(Lw))   return { ok: false, error: '声功率级 Lw 必须为有限数值' };
    if (!(r > 0))        return { ok: false, error: '观测距离 r 必须为正数' };
    if (!(c > 0))        return { ok: false, error: '声速 c 必须为正数' };

    // 叶桨通过频率（旋转基频）
    var BPF = (rpm / 60) * blades;

    // 音色调性序列：基频 + 谐波，相对级递减 [0, -6, -12, -18] dB
    var rel = [0, -6, -12, -18];
    var harmonics = rel.map(function (rv, i) {
      var n = i + 1;
      var f = BPF * n;
      var Lsrc = Lw + rv;                    // 该音调声源级（参考 Lw）
      var Lp_t = Lsrc - 20 * log10(r) - 11;  // 该音调在 r 处的声压级
      var A = Aweight(f);
      var LAp = Lp_t + A;                    // A 计权声压级
      return { n: n, f: f, rel: rv, Lsrc: Lsrc, Lp: Lp_t, A: A, LAp: LAp };
    });

    // 自由场球面扩展：整体声压级
    var Lp = Lw - 20 * log10(r) - 11;

    // A 计权：对各谐波 A 计权声压级做功率叠加
    var sumPow = 0;
    harmonics.forEach(function (h) { sumPow += Math.pow(10, h.LAp / 10); });
    var AWeighted = 10 * log10(sumPow);

    // 频谱（用于可视化）：音调线 + 宽带底噪
    var spectrum = harmonics.map(function (h) {
      return { f: h.f, L: h.Lsrc, kind: 'tone', n: h.n };
    });
    // 宽带底噪：湍流/来流噪声近似，置于基频与四倍频之间，级为 Lw - 30
    spectrum.push({ f: BPF * 2.5, L: Lw - 30, kind: 'broadband', n: 0 });

    var notes = [
      '叶桨通过频率 BPF = (rpm/60)×B 是旋翼的主导纯音（tonal）频率，其谐波构成主要音调结构。',
      '本模型为每个谐波施加固定的相对级 [0, −6, −12, −18] dB（假设高阶谐波按阶次约每阶衰减 6 dB），仅作简化示意。',
      '真实无人机噪声还包含显著的宽带分量（旋翼湍流、来流、电机/电调噪声），本工具用一个 Lw−30 的宽带底噪近似。',
      '声压级按自由场球面扩展 Lp = Lw − 20·log₁₀(r) − 11 估算；近距离或近地界面时应改用半球扩展（−8 dB）或更精细模型。',
      'A 计权在各谐波频率处查 IEC 61672 近似曲线后做功率叠加，得到的 A 计权声压级同样基于上述球面扩展。'
    ];

    return {
      ok: true,
      BPF: BPF,
      harmonics: harmonics,
      Lp: Lp,
      AWeighted: AWeighted,
      spectrum: spectrum,
      notes: notes
    };
  }

  var API = {
    C: C_AIR,
    Aweight: Aweight,
    analyze: analyze
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimDrone = API;
  }
})(typeof window !== 'undefined' ? window : this);
