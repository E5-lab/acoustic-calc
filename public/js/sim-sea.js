/*
 * sim-sea.js — 统计能量分析 SEA（两个耦合房间的功率流与声级差）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimSea，Node 下 module.exports。
 *
 * 物理模型：统计能量分析（Statistical Energy Analysis, SEA），把两个相邻房间视为
 *   两个子系统，中间隔墙（面积 S、透射系数 τ）提供唯一的耦合通道。
 *
 *   1) 内损耗因子（由混响时间反推，Eyring/Sabine 混响—损耗换算）：
 *        η_i = 2.2 / (f · T60_i)      ⇔   T60_i = 2.2 / (f · η_i)
 *
 *   2) 模态密度（Weyl 级数，房间体积项 + 表面积项 + 棱长项）：
 *        n(f) = 4πV f²/c³ + π·S_tot·f/(2c²) + L_edge/(8c)      [单位：个/Hz]
 *      频带内模态数 N = n(f) · B（默认倍频带 B = f/√2 ≈ 0.707 f）。
 *
 *   3) 耦合损耗因子（Craik，房间—隔墙—房间，空气声）：
 *        η12 = τ·c·S / (4·ω·V1)      （ω = 2πf）
 *      反向耦合损耗因子由 SEA 互易性（热力学平衡条件）导出：
 *        η12·N1 = η21·N2   ⇒   η21 = η12·N1/N2
 *      说明：若对 V2 直接套用 Craik 公式（τcS/(4ωV2)），则只有在 N_i ∝ V_i
 *      （即 Weyl 体积项占优，或两室几何相似）时才与互易性一致；本内核以互易性为
 *      准（它是平衡态下净功率流为零的必要条件），同时把直接套用值放在
 *      eta21Craik 字段中供对照，两者在典型房间下相差约 1%–3%。
 *
 *   4) 稳态功率平衡（线性方程组，克拉默法则求解）：
 *        P1_in = ω·η1·E1 + ω·η12·E1 − ω·η21·E2
 *        P2_in = ω·η2·E2 + ω·η21·E2 − ω·η12·E1
 *      记 a11 = ω(η1+η12)，a12 = −ω·η21，a21 = −ω·η12，a22 = ω(η2+η21)；
 *      行列式 det = ω²[η1η2 + η1η21 + η2η12] > 0，故解唯一：
 *        E1 = [P1(η2+η21) + P2·η21] / (ω·[η1η2 + η1η21 + η2η12])
 *        E2 = [P2(η1+η12) + P1·η12] / (ω·[η1η2 + η1η21 + η2η12])
 *      净传递功率 P12 = ω·η12·E1 − ω·η21·E2（由第一式可得恒等式 P12 = P1 − ω·η1·E1）。
 *
 *   5) 声级差（扩散场下 ⟨p²⟩ = ρc²·E/V，声级 ∝ 能量密度）：
 *        D = 10·log10( (E1/V1) / (E2/V2) ) = Lp1 − Lp2
 *      对称房间（V1=V2）且仅激励 1 号房（P2=0）时解析化简为：
 *        D = 10·log10( (η2+η21)/η12 ) = 10·log10( 1 + 4ωη2V2/(τ·c·S) )
 *      即：声级差只取决于「接收室吸声 + 隔墙透射」，与源室内损耗无关。
 *
 *   6) 能量守恒校验：稳态下 P1_in + P2_in = ω(η1E1 + η2E2)（输入功率全部被内损耗耗散）。
 *
 * 适用条件与已知局限（SEA 的基本假设）：
 *   - 模态数 N ≫ 1（高频、大房间）：N < 3 时结果不可用，内核置 warn = true；
 *   - 弱耦合：η12, η21 ≪ η1, η2（强耦合时 SEA 偏差显著，内核给出 weakCoupling 标记）；
 *   - 稳态、扩散场（各房间内能量密度均匀、模态能量均分）；
 *   - 本内核只含「房间—隔墙—房间」的空气声单通道，不含结构声侧向传声、
 *     孔洞/缝隙泄漏、以及非扩散场（近场、低频）修正。
 *
 * 单位约定（SI）：体积 m³，面积 m²，长度 m，频率 Hz，声速 m/s，时间 s，
 *   功率 W，能量 J；透射系数 τ ∈ (0, 1]，隔声量 R = 10log10(1/τ) dB。
 */
(function (global) {
  'use strict';

  var C_AIR = 343;        // 空气声速默认值 m/s（20 ℃ 约 343）
  var RHO_AIR = 1.2;      // 空气密度默认值 kg/m³
  var P_REF = 1e-12;      // 声功率基准 W（Lw = 10log10(P/1pW)）
  var P_REF_SPL = 2e-5;   // 声压基准 Pa（Lp = 10log10(⟨p²⟩/p0²)）
  var T60_CONST = 2.2;    // 混响—损耗换算常数：T60 = 2.2/(f·η)
  var N_SEA_MIN = 3;      // SEA 有效性下限：min(N1,N2) < 3 → 「SEA 不适用」
  var WEAK_COUPLE = 0.3;  // 弱耦合判据：耦合损耗因子 / 内损耗因子 超过此值即非弱耦合

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /* ----------------------- 基础换算 ----------------------- */

  // 内损耗因子 η = 2.2/(f·T60)；f 单位 Hz、T60 单位 s；无效输入返回 null
  function internalLoss(f, T60) {
    if (!(f > 0) || !(T60 > 0)) return null;
    return T60_CONST / (f * T60);
  }

  // 由内损耗因子反求混响时间 T60 = 2.2/(f·η)（internalLoss 的解析逆函数）
  function t60FromLoss(f, eta) {
    if (!(f > 0) || !(eta > 0)) return null;
    return T60_CONST / (f * eta);
  }

  // 隔声量 R（dB）→ 透射系数 τ = 10^(−R/10)
  function tauFromR(R) {
    var r = num(R);
    if (r == null) return null;
    return Math.pow(10, -r / 10);
  }

  // 透射系数 τ → 隔声量 R = 10·log10(1/τ)；τ 需落在 (0, 1]
  function rFromTau(tau) {
    if (!(tau > 0) || tau > 1) return null;
    return 10 * Math.log10(1 / tau);
  }

  // 声功率级 Lw（dB re 1 pW）→ 声功率 W：P = P0·10^(Lw/10)
  function powerFromLw(Lw, P0) {
    var l = num(Lw);
    if (l == null) return null;
    var p0 = num(P0);
    if (p0 == null || !(p0 > 0)) p0 = P_REF;
    return p0 * Math.pow(10, l / 10);
  }

  // 声功率 W → 声功率级 Lw（dB re 1 pW）：Lw = 10·log10(P/P0)
  function lwFromPower(P, P0) {
    if (!(P > 0)) return null;
    var p0 = num(P0);
    if (p0 == null || !(p0 > 0)) p0 = P_REF;
    return 10 * Math.log10(P / p0);
  }

  /* ----------------------- 几何 ----------------------- */
  // 解析房间几何：优先长宽高 (L/W/H)，其次 V + (Stot/Ledge)，
  // 缺失的 Stot/Ledge 按等效立方体补全（边长 a = V^(1/3)：Stot = 6a²，Ledge = 12a）。
  // suf 为编号后缀：''（modalDensity 单房间）或 '1' / '2'。
  function resolveGeom(o, suf) {
    var L = num(o['L' + suf]);
    var W = num(o['W' + suf]);
    var H = num(o['H' + suf]);
    var V = num(o['V' + suf]);
    var St = num(o['Stot' + suf]);
    var Le = num(o['Ledge' + suf]);
    if (L > 0 && W > 0 && H > 0) {
      V = L * W * H;
      St = 2 * (L * W + W * H + L * H);
      Le = 4 * (L + W + H);
    } else if (V > 0) {
      var a = Math.pow(V, 1 / 3);
      if (St == null || !(St > 0)) St = 6 * a * a;
      if (Le == null || !(Le > 0)) Le = 12 * a;
    } else {
      return null;
    }
    return { V: V, Stot: St, Ledge: Le };
  }

  /* ----------------------- 模态密度与频带 ----------------------- */

  // 频带带宽 B（Hz）：'octave'（默认）= f/√2 ≈ 0.707f；'third' = f·(2^(1/6) − 2^(−1/6))；
  // 也可直接给数值（Hz）
  function bandWidth(f, kind) {
    if (!(f > 0)) return null;
    if (kind == null || kind === '' || kind === 'octave') return f / Math.SQRT2;
    if (kind === 'third') return f * (Math.pow(2, 1 / 6) - Math.pow(2, -1 / 6));
    var b = num(kind);
    return (b != null && b > 0) ? b : f / Math.SQRT2;
  }

  // 房间模态密度（Weyl 级数，个/Hz）：
  //   n(f) = 4πV f²/c³ + π·Stot·f/(2c²) + Ledge/(8c)
  // opts: { V, Stot, Ledge, f, c } 或 { L, W, H, f, c }
  function modalDensity(o) {
    o = o || {};
    var g = resolveGeom(o, '');
    var f = num(o.f);
    var c = num(o.c);
    if (c == null) c = C_AIR;
    if (!g || !(f > 0) || !(c > 0)) return null;
    return (4 * Math.PI * g.V * f * f) / (c * c * c) +
      (Math.PI * g.Stot * f) / (2 * c * c) +
      g.Ledge / (8 * c);
  }

  // 频带内模态数 N = n(f)·B（个）；opts 同 modalDensity，另可给 band
  function modalCount(o) {
    var n = modalDensity(o);
    if (n == null) return null;
    var B = bandWidth(num(o && o.f), o && o.band);
    if (B == null) return null;
    return n * B;
  }

  /* ----------------------- 耦合损耗因子 ----------------------- */

  // opts: { V1, V2（或 L1/W1/H1、L2/W2/H2）, S, tau（或 R）, f, c, band, Stot1/Ledge1, Stot2/Ledge2 }
  // 返回 { eta12, eta21, N1, N2, ... }；输入无效返回 null
  function couplingLoss(o) {
    o = o || {};
    var g1 = resolveGeom(o, '1');
    var g2 = resolveGeom(o, '2');
    var f = num(o.f);
    if (f == null) f = 1000;
    var c = num(o.c);
    if (c == null) c = C_AIR;
    var S = num(o.S);
    var tau = num(o.tau);
    if (tau == null) {
      var R = num(o.R);
      tau = (R != null) ? tauFromR(R) : 1e-3;
    }
    if (!g1 || !g2 || !(f > 0) || !(c > 0) || !(S > 0) || !(tau > 0) || tau > 1) return null;

    var omega = 2 * Math.PI * f;
    var B = bandWidth(f, o.band);
    var n1 = modalDensity({ V: g1.V, Stot: g1.Stot, Ledge: g1.Ledge, f: f, c: c });
    var n2 = modalDensity({ V: g2.V, Stot: g2.Stot, Ledge: g2.Ledge, f: f, c: c });
    var N1 = n1 * B;
    var N2 = n2 * B;

    var eta12 = (tau * c * S) / (4 * omega * g1.V);   // Craik：房间—隔墙—房间
    var eta21 = (eta12 * N1) / N2;                    // 由互易性 η12·N1 = η21·N2 导出
    var eta21Craik = (tau * c * S) / (4 * omega * g2.V); // 直接套用同式（供对照）
    var ref = eta12 * N1;

    return {
      eta12: eta12,
      eta21: eta21,
      N1: N1,
      N2: N2,
      n1: n1,
      n2: n2,
      B: B,
      f: f,
      c: c,
      omega: omega,
      tau: tau,
      R: rFromTau(tau),
      S: S,
      V1: g1.V,
      V2: g2.V,
      Stot1: g1.Stot,
      Stot2: g2.Stot,
      Ledge1: g1.Ledge,
      Ledge2: g2.Ledge,
      ratio: eta12 / eta21,          // 耦合损耗因子之比 η12/η21（= N2/N1）
      eta21Craik: eta21Craik,        // 直接套用 Craik 公式于 V2 的值（供对照）
      recipResidual: ref > 0 ? Math.abs(eta12 * N1 - eta21 * N2) / ref : 0
    };
  }

  /* ----------------------- 主入口 ----------------------- */
  // opts: { V1, V2（或长宽高）, S, tau | R, T60_1, T60_2, f, c, P1 | Lw, P2, band }
  function solve(o) {
    o = o || {};

    // 区分「未给出」（走缺省 100 m³）与「给出但非法」（报错）
    function given(suf) {
      return num(o['V' + suf]) != null ||
        (num(o['L' + suf]) != null && num(o['W' + suf]) != null && num(o['H' + suf]) != null);
    }
    var g1 = resolveGeom(o, '1');
    var g2 = resolveGeom(o, '2');
    if (!g1 && given('1')) return { ok: false, error: '源室几何参数非法：体积需 > 0，或长宽高均 > 0（m）' };
    if (!g2 && given('2')) return { ok: false, error: '接收室几何参数非法：体积需 > 0，或长宽高均 > 0（m）' };

    var f = num(o.f);
    var c = num(o.c);
    var S = num(o.S);
    var tau = num(o.tau);
    var R = num(o.R);
    var T1 = num(o.T60_1); if (T1 == null) T1 = num(o.T1);
    var T2 = num(o.T60_2); if (T2 == null) T2 = num(o.T2);
    var P1 = num(o.P1);
    var P2 = num(o.P2);
    var Lw = num(o.Lw);

    // 缺省值
    if (g1 == null) g1 = resolveGeom({ V: 100 }, '');
    if (g2 == null) g2 = resolveGeom({ V: 100 }, '');
    if (f == null) f = 1000;
    if (c == null) c = C_AIR;
    if (S == null) S = 10;
    if (tau == null) tau = (R != null) ? tauFromR(R) : tauFromR(35);
    if (T1 == null) T1 = 0.6;
    if (T2 == null) T2 = 0.6;
    if (P1 == null) P1 = (Lw != null) ? powerFromLw(Lw) : 1e-3; // 缺省 Lw = 90 dB → 1 mW
    if (P2 == null) P2 = 0;

    // 输入校验
    if (!(g1.V > 0) || !(g2.V > 0)) return { ok: false, error: '房间体积必须为正数（m³），或给出长宽高' };
    if (!(S > 0)) return { ok: false, error: '隔墙面积 S 必须为正数（m²）' };
    if (!(f >= 20 && f <= 20000)) return { ok: false, error: '分析频率 f 需在 20–20000 Hz 之间' };
    if (!(c >= 300 && c <= 400)) return { ok: false, error: '声速 c 需在 300–400 m/s 之间' };
    if (!(tau > 0 && tau <= 1)) return { ok: false, error: '透射系数 τ 需落在 (0, 1]（等价于 R ≥ 0 dB）' };
    if (!(T1 >= 0.02 && T1 <= 100)) return { ok: false, error: '源室混响时间 T60₁ 需在 0.02–100 s 之间' };
    if (!(T2 >= 0.02 && T2 <= 100)) return { ok: false, error: '接收室混响时间 T60₂ 需在 0.02–100 s 之间' };
    if (!(P1 >= 0) || !(P2 >= 0)) return { ok: false, error: '输入功率不能为负（W）' };
    if (!(P1 + P2 > 0)) return { ok: false, error: '至少一侧房间需有输入功率（P1 或 P2 > 0）' };

    var eta1 = internalLoss(f, T1);
    var eta2 = internalLoss(f, T2);
    var cl = couplingLoss({
      V1: g1.V, Stot1: g1.Stot, Ledge1: g1.Ledge,
      V2: g2.V, Stot2: g2.Stot, Ledge2: g2.Ledge,
      S: S, tau: tau, f: f, c: c, band: o.band
    });
    if (!cl) return { ok: false, error: '几何参数无效，无法计算耦合损耗因子' };

    var omega = cl.omega;
    var m12 = cl.eta12;
    var m21 = cl.eta21;
    var det = eta1 * eta2 + eta1 * m21 + eta2 * m12; // = (a11·a22 − a12·a21)/ω²，恒 > 0
    if (!(Math.abs(det) > 0)) return { ok: false, error: '功率平衡方程组奇异（行列式为 0），无稳态解' };

    // 克拉默法则
    var E1 = (P1 * (eta2 + m21) + P2 * m21) / (omega * det);
    var E2 = (P2 * (eta1 + m12) + P1 * m12) / (omega * det);

    var d1 = E1 / g1.V;                 // 源室能量密度 J/m³
    var d2 = E2 / g2.V;                 // 接收室能量密度 J/m³
    var D = 10 * Math.log10(d1 / d2);   // 声级差 dB
    var P12 = omega * (m12 * E1 - m21 * E2);          // 净传递功率（1→2 为正）W
    var P12gross = omega * m12 * E1;                  // 单向 1→2 传递功率 W
    var diss = omega * (eta1 * E1 + eta2 * E2);       // 内损耗耗散总功率 W
    var resid = Math.abs(P1 + P2 - diss) / (P1 + P2); // 能量守恒相对残差

    // 扩散场声压级：⟨p²⟩ = ρc²·E/V，Lp = 10log10(⟨p²⟩/p0²)
    var p1sq = RHO_AIR * c * c * d1;
    var p2sq = RHO_AIR * c * c * d2;
    var Lp1 = 10 * Math.log10(p1sq / (P_REF_SPL * P_REF_SPL));
    var Lp2 = 10 * Math.log10(p2sq / (P_REF_SPL * P_REF_SPL));

    var Nmin = Math.min(cl.N1, cl.N2);
    var warn = Nmin < N_SEA_MIN;
    var weak = (m12 / eta1 > WEAK_COUPLE) || (m21 / eta2 > WEAK_COUPLE);

    var notes = [
      'SEA 适用条件：模态数 N ≫ 1、弱耦合（η12, η21 ≪ η1, η2）、稳态、各房间内扩散场（模态能量均分）。',
      '当前 min(N₁, N₂) = ' + Nmin.toFixed(2) + '：' +
        (warn ? 'N < 3，SEA 不适用——该频段/房间处于低频模态稀疏区，声场不扩散，结果仅作趋势参考。'
              : 'N ≥ 3，满足模态数要求；N 越接近或小于 10 时统计不确定性越大（典型判据 N ≳ 5–10）。'),
      '声级差只取决于接收室吸声与隔墙透射：对称房间、P₂ = 0 时 D = 10log₁₀(1 + 4ωη₂V₂/(τcS))，与源室内损耗 η₁ 无关（η₁ 只改变两侧绝对声级）。',
      'τ = 1（全透）并不等于「墙不存在」：耦合损耗因子 η12 = τcS/(4ωV₁) 仍为有限值，洞口面积有限即限制通过速率，因此 D 不为 0（本例对称房间 τ=1 时仍有约数 dB 的声级差）。',
      '本内核只含房间—隔墙—房间的空气声单通道，未计入结构声侧向传声、门窗缝隙泄漏、低频非扩散场修正。'
    ];

    return {
      ok: true,
      // 输入回显
      V1: g1.V, V2: g2.V, Stot1: g1.Stot, Stot2: g2.Stot, Ledge1: g1.Ledge, Ledge2: g2.Ledge,
      S: S, tau: tau, R: cl.R, f: f, c: c, omega: omega,
      T60_1: T1, T60_2: T2, P1: P1, P2: P2, Lw: lwFromPower(P1),
      // 损耗因子
      eta1: eta1, eta2: eta2, eta12: m12, eta21: m21,
      eta21Craik: cl.eta21Craik, ratioEta: cl.ratio,
      // 模态
      n1: cl.n1, n2: cl.n2, N1: cl.N1, N2: cl.N2, B: cl.B, Nmin: Nmin,
      // 能量与功率
      E1: E1, E2: E2, E1dens: d1, E2dens: d2, ratioE: E1 / E2,
      P12: P12, P12gross: P12gross, Pdiss: diss, resid: resid,
      // 声级
      D: D, Lp1: Lp1, Lp2: Lp2, p1sq: p1sq, p2sq: p2sq,
      // 适用性
      warn: warn, warnMsg: warn ? 'SEA 不适用：min(N₁,N₂) < 3（模态数过少）' : null,
      weakCoupling: weak,
      recipResidual: cl.recipResidual,
      notes: notes
    };
  }

  var API = {
    C_AIR: C_AIR,
    RHO_AIR: RHO_AIR,
    P_REF: P_REF,
    P_REF_SPL: P_REF_SPL,
    T60_CONST: T60_CONST,
    N_SEA_MIN: N_SEA_MIN,
    WEAK_COUPLE: WEAK_COUPLE,
    internalLoss: internalLoss,
    t60FromLoss: t60FromLoss,
    tauFromR: tauFromR,
    rFromTau: rFromTau,
    powerFromLw: powerFromLw,
    lwFromPower: lwFromPower,
    bandWidth: bandWidth,
    modalDensity: modalDensity,
    modalCount: modalCount,
    couplingLoss: couplingLoss,
    solve: solve,
    simulate: solve
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimSea = API;
  }
})(typeof window !== 'undefined' ? window : this);
