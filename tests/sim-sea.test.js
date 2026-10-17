/*
 * sim-sea.test.js - 统计能量分析 SEA（两耦合房间）内核 (node tests/sim-sea.test.js)
 *
 * 覆盖：内损耗因子 η=2.2/(f·T60)、τ↔R 与 Lw↔P 换算、Weyl 模态密度与频带模态数、
 * Craik 耦合损耗因子与互易性、稳态功率平衡 2×2 求解、声级差 D、能量守恒与极限/单调性。
 */
var S = require('../public/js/sim-sea.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (+-' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('[1] 内损耗因子 η = 2.2/(f·T60)');
approx('η(1000 Hz, 0.6 s) = 2.2/600', S.internalLoss(1000, 0.6), 2.2 / 600, 1e-9);
approx('η(500 Hz, 1.0 s) = 2.2/500 = 4.4e-3', S.internalLoss(500, 1.0), 4.4e-3, 1e-9);
approx('η ∝ 1/T60：T60 加倍则 η 减半', S.internalLoss(1000, 1.2), S.internalLoss(1000, 0.6) / 2, 1e-15);
approx('η ∝ 1/f：频率加倍则 η 减半', S.internalLoss(2000, 0.6), S.internalLoss(1000, 0.6) / 2, 1e-15);
approx('反函数 T60 = 2.2/(f·η) 往返', S.t60FromLoss(1000, S.internalLoss(1000, 0.6)), 0.6, 1e-12);
assert('f≤0 返回 null', S.internalLoss(0, 0.6) === null);
assert('T60≤0 返回 null', S.internalLoss(1000, 0) === null);

console.log('\n[2] 透射系数 τ ↔ 隔声量 R = 10log₁₀(1/τ)');
approx('R=35 dB → τ = 10^-3.5 = 3.1623e-4', S.tauFromR(35), 3.16227766e-4, 1e-11);
approx('R=0 dB → τ = 1', S.tauFromR(0), 1, 1e-12);
approx('τ=1e-4 → R = 40 dB', S.rFromTau(1e-4), 40, 1e-9);
approx('τ=0.01 → R = 20 dB', S.rFromTau(0.01), 20, 1e-9);
assert('τ>1（负隔声量）返回 null', S.rFromTau(1.5) === null);
assert('τ≤0 返回 null', S.rFromTau(0) === null);

console.log('\n[3] 声功率级 Lw（dB re 1 pW）↔ 功率 W');
approx('Lw=90 dB → 1e-3 W', S.powerFromLw(90), 1e-3, 1e-15);
approx('Lw=100 dB → 1e-2 W（每 10 dB ×10）', S.powerFromLw(100), 1e-2, 1e-15);
approx('反函数 Lw(1e-3 W) = 90 dB', S.lwFromPower(1e-3), 90, 1e-9);
assert('P≤0 返回 null', S.lwFromPower(0) === null);

console.log('\n[4] Weyl 模态密度 n(f) = 4πVf²/c³ + πStot·f/(2c²) + Ledge/(8c)');
// 房间 5×5×4：V=100，Stot=2(25+20+20)=130，Ledge=4(5+5+4)=56；c=343（c³=40353607）
var n1000 = S.modalDensity({ V: 100, Stot: 130, Ledge: 56, f: 1000, c: 343 });
approx('n(1000 Hz) 体积项 4π·100·10⁶/343³', (4 * Math.PI * 100 * 1e6) / (343 * 343 * 343), 31.140639, 1e-5);
approx('n(1000 Hz) 面积项 π·130·1000/(2·343²)', (Math.PI * 130 * 1000) / (2 * 343 * 343), 1.735701, 1e-6);
approx('n(1000 Hz) 棱长项 56/(8·343)', 56 / (8 * 343), 0.0204082, 1e-7);
approx('n(1000 Hz) 三项合计', n1000, 32.8967481, 1e-5);
approx('由长宽高 5×5×4 得同一结果', S.modalDensity({ L: 5, W: 5, H: 4, f: 1000, c: 343 }), n1000, 1e-12);
var n500 = S.modalDensity({ V: 100, Stot: 130, Ledge: 56, f: 500, c: 343 });
var n2000 = S.modalDensity({ V: 100, Stot: 130, Ledge: 56, f: 2000, c: 343 });
assert('模态密度随频率升高而增大 n(500)<n(1000)<n(2000)', n500 < n1000 && n1000 < n2000);
approx('体积项占优时 n ∝ f²：n(2000)/n(1000) ≈ 4', n2000 / n1000, 4, 0.35);
approx('V=8 立方体补全（a=2, Stot=24, Ledge=24）', S.modalDensity({ V: 8, f: 1000, c: 343 }), 2.8204346, 1e-6);
assert('V≤0 返回 null', S.modalDensity({ V: 0, f: 1000 }) === null);

console.log('\n[5] 频带带宽 B 与频带内模态数 N = n·B');
approx('倍频带 B = f/√2 = 707.11 Hz', S.bandWidth(1000), 1000 / Math.SQRT2, 1e-9);
approx('1/3 倍频带 B = f(2^(1/6)−2^(−1/6)) = 231.56 Hz', S.bandWidth(1000, 'third'), 231.563, 1e-3);
approx('N(1000 Hz, 倍频带) = n·B', S.modalCount({ V: 100, Stot: 130, Ledge: 56, f: 1000, c: 343 }), 23261.5, 1);
assert('N 随频率升高而增大', S.modalCount({ V: 100, Stot: 130, Ledge: 56, f: 2000, c: 343 }) >
  S.modalCount({ V: 100, Stot: 130, Ledge: 56, f: 500, c: 343 }));
assert('自定义数值带宽 B=100 Hz 生效', Math.abs(S.bandWidth(1000, 100) - 100) < 1e-12);

console.log('\n[6] Craik 耦合损耗因子 η12 = τcS/(4ωV1)');
var cl = S.couplingLoss({ V1: 100, V2: 100, S: 10, tau: 0.01, f: 1000, c: 343 });
approx('η12 = 0.01·343·10/(4·2π·1000·100) = 34.3/2513274', cl.eta12, 1.36475368e-5, 1e-9);
approx('由 R=20 dB（τ=0.01）输入得同一 η12',
  S.couplingLoss({ V1: 100, V2: 100, S: 10, R: 20, f: 1000, c: 343 }).eta12, cl.eta12, 1e-15);
approx('V1 加倍 → η12 减半', S.couplingLoss({ V1: 200, V2: 100, S: 10, tau: 0.01, f: 1000, c: 343 }).eta12,
  cl.eta12 / 2, 1e-18);
approx('S 加倍 → η12 加倍', S.couplingLoss({ V1: 100, V2: 100, S: 20, tau: 0.01, f: 1000, c: 343 }).eta12,
  cl.eta12 * 2, 1e-18);
assert('同体积同形状：η21 = η12', Math.abs(cl.eta21 - cl.eta12) < 1e-18);
assert('同体积同形状：N1 = N2', Math.abs(cl.N1 - cl.N2) < 1e-12);

console.log('\n[7] 互易性 η12·N1 = η21·N2');
var r1 = Math.abs(cl.eta12 * cl.N1 - cl.eta21 * cl.N2) / (cl.eta12 * cl.N1);
assert('对称房间互易残差 < 1e-12（实测 ' + r1.toExponential(2) + '）', r1 < 1e-12);
// 异形房间：1 号 5×5×4（V=100），2 号 4×4×3（V=48）
var cl2 = S.couplingLoss({ L1: 5, W1: 5, H1: 4, L2: 4, W2: 4, H2: 3, S: 10, tau: 0.01, f: 1000, c: 343 });
var r2 = Math.abs(cl2.eta12 * cl2.N1 - cl2.eta21 * cl2.N2) / (cl2.eta12 * cl2.N1);
assert('异形房间互易残差 < 1e-12（实测 ' + r2.toExponential(2) + '）', r2 < 1e-12);
approx('η12/η21 = N2/N1', cl2.ratio, cl2.N2 / cl2.N1, 1e-12);
approx('η12·V1 = η21·V2 = τcS/(4ω)（Craik 体积关系）', cl2.eta12 * cl2.V1, (0.01 * 343 * 10) / (4 * 2 * Math.PI * 1000), 1e-15);
assert('直接套用 Craik 于 V2 的值与互易值相差 < 5%（' +
  (100 * Math.abs(cl2.eta21Craik - cl2.eta21) / cl2.eta21).toFixed(2) + '%）',
  Math.abs(cl2.eta21Craik - cl2.eta21) / cl2.eta21 < 0.05);
assert('S≤0 返回 null', S.couplingLoss({ V1: 100, V2: 100, S: 0, tau: 0.01, f: 1000 }) === null);
assert('τ=0 返回 null', S.couplingLoss({ V1: 100, V2: 100, S: 10, tau: 0, f: 1000 }) === null);
assert('V2 缺失且非法返回 null', S.couplingLoss({ V1: 100, S: 10, tau: 0.01, f: 1000 }) === null);

console.log('\n[8] 稳态功率平衡求解（对称房间，仅激励 1 号房）');
var A = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 0.6, T60_2: 0.6, f: 1000, c: 343, P1: 1e-3, P2: 0 });
assert('solve ok', A.ok === true);
approx('η1 = η2 = 2.2/(1000·0.6)', A.eta1, 2.2 / 600, 1e-15);
approx('能量守恒相对残差 < 1e-9（实测 ' + A.resid.toExponential(2) + '）', A.resid, 0, 1e-9);
assert('D > 0（源室声级高于接收室）', A.D > 0);
approx('D = 10log₁₀(1 + 4ωη₂V₂/(τcS)) = 39.29 dB', A.D, 39.2928, 0.01);
approx('E1/E2 = (η2+η21)/η12', A.ratioE, (A.eta2 + A.eta21) / A.eta12, 1e-9);
approx('P12 = P1 − ωη1E1（第一式恒等式）', A.P12, A.P1 - A.omega * A.eta1 * A.E1, 1e-12);
approx('D = Lp1 − Lp2（⟨p²⟩ = ρc²E/V）', A.D, A.Lp1 - A.Lp2, 1e-9);
approx('D = 10log₁₀((E1/V1)/(E2/V2))', A.D, 10 * Math.log10((A.E1 / A.V1) / (A.E2 / A.V2)), 1e-12);
approx('P12 = ω(η12E1 − η21E2)', A.P12, A.omega * (A.eta12 * A.E1 - A.eta21 * A.E2), 1e-18);
assert('耗散功率 = 输入功率', Math.abs(A.Pdiss - (A.P1 + A.P2)) / (A.P1 + A.P2) < 1e-9);
approx('Lw 回算 = 90 dB', A.Lw, 90, 1e-9);

console.log('\n[9] 极限：τ→0 与 τ=1');
var L0 = S.solve({ V1: 100, V2: 100, S: 10, tau: 1e-9, T60_1: 0.6, T60_2: 0.6, f: 1000, P1: 1e-3 });
approx('τ=1e-9：D = 10log₁₀(2.6867e9) ≈ 94.3 dB', L0.D, 94.2922, 0.01);
assert('τ=1e-9：D > 40 dB', L0.D > 40);
assert('τ=1e-9：P12 → 0（< 1e-11 W，实测 ' + L0.P12.toExponential(2) + '）', L0.P12 < 1e-11);
approx('τ=1e-9：E1 → P1/(ωη1)（孤立房间）', L0.E1, 1e-3 / (2 * Math.PI * 1000 * (2.2 / 600)), 1e-12);
var L1f = S.solve({ V1: 100, V2: 100, S: 10, tau: 1, T60_1: 0.6, T60_2: 0.6, f: 1000, P1: 1e-3 });
approx('τ=1（全透）对称房间：D = 10log₁₀(1+η2/η12) = 5.67 dB', L1f.D, 10 * Math.log10(1 + 2.686687), 0.01);
approx('τ=1：E1/E2 = (η2+η12)/η12', L1f.ratioE, (L1f.eta2 + L1f.eta12) / L1f.eta12, 1e-9);
assert('τ=1 时 D 为该配置下的最小声级差（仍 > 0）', L1f.D > 0 && L1f.D < L0.D);
assert('τ=1 触发非弱耦合标记（η12/η1 = ' + (L1f.eta12 / L1f.eta1).toFixed(3) + ' > 0.3）', L1f.weakCoupling === true);
// D = 10log₁₀(1 + η2/η12)：耦合远强于内损耗（η2 ≪ η12）时 D → 0
assert('τ=1, T60₂=0.6 → D 较大', L1f.D > 1);
var L1g = S.solve({ V1: 100, V2: 100, S: 10, tau: 1, T60_1: 0.6, T60_2: 30, f: 1000, P1: 1e-3 });
approx('τ=1, T60₂=30（η2/η12 = 0.0537）→ D = 10log₁₀(1.0537)', L1g.D, 10 * Math.log10(1 + 0.0537), 1e-3);
assert('η2 ≪ η12 时 D → 0（实测 ' + L1g.D.toFixed(4) + ' dB < 0.3）', L1g.D < 0.3);
assert('D 随 η2/η12 → 0 单调趋近 0', L1f.D > S.solve({ V1: 100, V2: 100, S: 10, tau: 1, T60_1: 0.6, T60_2: 3, f: 1000, P1: 1e-3 }).D &&
  S.solve({ V1: 100, V2: 100, S: 10, tau: 1, T60_1: 0.6, T60_2: 3, f: 1000, P1: 1e-3 }).D > L1g.D);

console.log('\n[10] 单调性');
var dR35 = S.solve({ V1: 100, V2: 100, S: 10, R: 35, f: 1000, P1: 1e-3 }).D;
var dR55 = S.solve({ V1: 100, V2: 100, S: 10, R: 55, f: 1000, P1: 1e-3 }).D;
var dR70 = S.solve({ V1: 100, V2: 100, S: 10, R: 70, f: 1000, P1: 1e-3 }).D;
approx('R=35 dB → D', dR35, 39.2928, 0.01);
approx('R=55 dB → D', dR55, 59.2928, 0.01);
approx('R=70 dB → D', dR70, 74.2928, 0.01);
assert('R 增大（τ 减小）→ D 增大：35 < 55 < 70', dR35 < dR55 && dR55 < dR70);
approx('耦合主导区：R 每 +10 dB → D +10 dB（R 差 20 dB → D 差 20 dB）', dR55 - dR35, 20, 0.02);
approx('R 差 15 dB → D 差 15 dB', dR70 - dR55, 15, 0.02);
// 对称房间、P₂=0 的手工闭式：D = 10log₁₀(1 + 8π·2.2·V₂/(T60₂·τ·c·S))
var tau35 = S.tauFromR(35);
approx('闭式校验 D = 10log₁₀(1 + 8π·2.2·V₂/(T60₂τcS))', dR35,
  10 * Math.log10(1 + (8 * Math.PI * 2.2 * 100) / (0.6 * tau35 * 343 * 10)), 1e-6);
var t03 = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 0.3, T60_2: 0.6, f: 1000, P1: 1e-3 });
var t12 = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 1.2, T60_2: 0.6, f: 1000, P1: 1e-3 });
assert('源室 T60₁ 增大（η1 减小）→ 源室能量 E1 升高', t12.E1 > t03.E1);
approx('η1 减半 → E1、E2 同比升高（D 不变）', t12.E1 / t03.E1, t12.E2 / t03.E2, 1e-9);
approx('P₂=0 时 D 与源室内损耗 η1 无关', t12.D, t03.D, 1e-9);
var p2a = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 0.3, T60_2: 0.6, f: 1000, P1: 1e-3, P2: 1e-4 });
var p2b = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 1.2, T60_2: 0.6, f: 1000, P1: 1e-3, P2: 1e-4 });
assert('P₂>0 时源室 T60₁ 增大 → D 增大', p2b.D > p2a.D);
// 声级差只取决于接收室：D = 10log₁₀(1 + 8π·2.2·V₂/(T60₂·τ·c·S))，随 T60₂ 增大而减小
var dT2a = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 0.6, T60_2: 0.3, f: 1000, P1: 1e-3 }).D;
var dT2b = S.solve({ V1: 100, V2: 100, S: 10, R: 35, T60_1: 0.6, T60_2: 1.2, f: 1000, P1: 1e-3 }).D;
assert('接收室 T60₂ 增大（吸声减少）→ 接收室声级升高 → D 减小', dT2b < dT2a);
approx('T60₂ 加倍 → η2/η12 减半（D 下降约 10log₁₀((1+x/2)/(1+x))）', dT2a - dT2b,
  10 * Math.log10((1 + (8 * Math.PI * 2.2 * 100) / (0.3 * tau35 * 343 * 10)) /
    (1 + (8 * Math.PI * 2.2 * 100) / (1.2 * tau35 * 343 * 10))), 1e-6);
var dV2 = S.solve({ V1: 100, V2: 50, S: 10, R: 35, T60_1: 0.6, T60_2: 0.6, f: 1000, P1: 1e-3 }).D;
assert('接收室体积减半 → D 减小（吸声面积变小、接收室声级升高）', dV2 < dR35);

console.log('\n[11] SEA 适用性告警（N < 3）');
var small = S.solve({ L1: 2.5, W1: 2, H1: 2, L2: 2.5, W2: 2, H2: 2, S: 4, R: 35, f: 50, P1: 1e-3 });
assert('50 Hz / 10 m³ 小房间：V1 = 10 m³', Math.abs(small.V1 - 10) < 1e-9);
approx('N = n(50)·(50/√2) = 0.035952·35.355', small.N1, 1.2712, 1e-3);
assert('N < 3 → warn = true', small.warn === true);
assert('warnMsg 含「SEA 不适用」', /SEA 不适用/.test(small.warnMsg));
var big = S.solve({ V1: 100, V2: 100, S: 10, R: 35, f: 1000, P1: 1e-3 });
assert('1000 Hz / 100 m³ 大房间：warn = false', big.warn === false);
assert('Nmin = min(N1, N2)', Math.abs(big.Nmin - Math.min(big.N1, big.N2)) < 1e-9);
assert('notes 5 条', big.notes.length === 5);

console.log('\n[12] 主入口与输入校验');
assert('simulate 为 solve 别名', S.simulate === S.solve);
var dflt = S.solve();
assert('空参走缺省值（V=100, S=10, R=35, T60=0.6, f=1000, Lw=90 dB）',
  dflt.ok === true && dflt.V1 === 100 && dflt.S === 10 && Math.abs(dflt.R - 35) < 1e-9 && dflt.f === 1000);
approx('缺省 D', dflt.D, 39.2928, 0.01);
var byLw = S.solve({ V1: 100, V2: 100, S: 10, R: 35, f: 1000, Lw: 100 });
approx('Lw=100 dB 输入 → P1 = 1e-2 W', byLw.P1, 1e-2, 1e-15);
approx('功率 ×10 → E1 ×10（线性系统）', byLw.E1 / dflt.E1, 10, 1e-9);
approx('功率 ×10 → D 不变（线性系统）', byLw.D, dflt.D, 1e-12);
assert('V1=0 被拒绝', S.solve({ V1: 0, V2: 100, S: 10, f: 1000 }).ok === false);
assert('S=0 被拒绝', S.solve({ V1: 100, V2: 100, S: 0, f: 1000 }).ok === false);
assert('f=100000 Hz（越界）被拒绝', S.solve({ f: 100000 }).ok === false);
assert('τ=2（>1）被拒绝', S.solve({ tau: 2 }).ok === false);
assert('P1=P2=0 被拒绝（无稳态解）', S.solve({ P1: 0, P2: 0 }).ok === false);
assert('T60=0 被拒绝', S.solve({ T60_1: 0 }).ok === false);
assert('错误信息为字符串', typeof S.solve({ V1: 0 }).error === 'string');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);
