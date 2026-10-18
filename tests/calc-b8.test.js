/*
 * calc-b8.test.js — 声明式计算器 · 振动与结构（纯函数单测）
 * 运行：node tests/calc-b8.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b8.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b8] 路由登记');
['transmissibility', 'natural-freq', 'wave-vib', 'isolator-pick'].forEach(function (rt) {
  var c = R.get(rt);
  assert('已登记 ' + rt, !!c);
  assert(rt + ' nav.group = 振动与结构', !!(c && c.nav && c.nav.group === '振动与结构'), c && c.nav && c.nav.group);
  assert(rt + ' 有 title', !!(c && c.title));
});

// ------------------------------------------------ 1) 隔振传递率 ------------------------------------------------
console.log('\n[calc-b8] 单自由度隔振传递率');
// r=50/15=3.3333，ζ=0.05：a=2ζr=0.33333，T=√((1+0.111111)/((1−11.1111)²+0.111111))
var t1 = R.get('transmissibility').compute({ f: 50, fn: 15, zeta: 0.05 });
assert('r = 50/15 = 3.3333', near(t1.values.r, 3.3333333, 1e-6), t1.values.r);
assert('T = 0.104187', near(t1.values.T, 0.1041873, 1e-5), t1.values.T);
assert('隔振效率 η = 89.58%', near(t1.values.eff, 89.58127, 1e-3), t1.values.eff);
assert('振级衰减 = −20log10T = 19.64 dB', near(t1.values.att, 19.6354, 1e-2), t1.values.att);
assert('ok 为真', t1.ok === true);

var t2 = R.get('transmissibility').compute({ f: 15, fn: 15, zeta: 0.05 });
assert('r=1, ζ=0.05 → T=√101=10.0499（≈1/2ζ）', near(t2.values.T, Math.sqrt(101), 1e-6), t2.values.T);
var t3 = R.get('transmissibility').compute({ f: 15, fn: 15, zeta: 0.5 });
assert('r=1, ζ=0.5 → T=√2=1.41421', near(t3.values.T, Math.SQRT2, 1e-6), t3.values.T);
var t4 = R.get('transmissibility').compute({ f: 30, fn: 15, zeta: 0 });
assert('ζ=0, r=2 → T=1/|1−r²|=0.33333', near(t4.values.T, 1 / 3, 1e-9), t4.values.T);
var t5 = R.get('transmissibility').compute({ f: 10, fn: 15, zeta: 0.1 });
assert('r=0.6667<√2 → T>1（放大区）', t5.values.T > 1 && near(t5.values.T, 1.7657868, 1e-6), t5.values.T);
var t6 = R.get('transmissibility').compute({ f: 15, fn: 15, zeta: 0 });
assert('ζ=0 且 r=1 → ok=false（无阻尼共振无界）', t6.ok === false);
var t7 = R.get('transmissibility').compute({ f: 50, fn: 0, zeta: 0.05 });
assert('fₙ=0 → ok=false', t7.ok === false);
var t8a = R.get('transmissibility').compute({ f: 30, fn: 15, zeta: 0.05 });
var t8b = R.get('transmissibility').compute({ f: 75, fn: 15, zeta: 0.05 });
assert('r 增大 → T 单调减小', t8b.values.T < t8a.values.T && t8a.values.T < 1, t8a.values.T + ' → ' + t8b.values.T);

// ------------------------------------------------ 2) 梁/板/弹簧固有频率 ------------------------------------------------
console.log('\n[calc-b8] 梁/板/弹簧固有频率');
var n1 = R.get('natural-freq').compute({ type: 'spring', m: 10, k: 20000, E: 210, b: 50, h: 10, L: 2, rho: 7850, nu: 0.3 });
assert('弹簧 fₙ=(1/2π)√(k/m)=(1/2π)√2000=7.1176 Hz', near(n1.values.fn, Math.sqrt(2000) / (2 * Math.PI), 1e-9) && near(n1.values.fn, 7.1176, 1e-3), n1.values.fn);
assert('弹簧 ωₙ=√(k/m)=44.7214 rad/s', near(n1.values.wn, Math.sqrt(2000), 1e-9), n1.values.wn);
assert('ok 为真', n1.ok === true);

// 简支梁：E=210GPa,b=50mm,h=10mm,L=2m,ρ=7850 → I=4.1667e-9, m′=3.925, EI=875
var n2 = R.get('natural-freq').compute({ type: 'beam', m: 10, k: 20000, E: 210, b: 50, h: 10, L: 2, rho: 7850, nu: 0.3 });
var Iexp = 0.05 * Math.pow(0.01, 3) / 12;
var fnBeam = (Math.PI / 2) * Math.sqrt(210e9 * Iexp / (7850 * 0.05 * 0.01 * Math.pow(2, 4)));
assert('简支梁 I = 4.1667e-9 m⁴（内嵌一致性）', near(Iexp, 4.1666667e-9, 1e-12), Iexp);
assert('简支梁 f₁=(π/2)√(EI/m′L⁴)=5.8629 Hz', near(n2.values.fn, fnBeam, 1e-9) && near(n2.values.fn, 5.8629, 1e-3), n2.values.fn);
assert('ω₁=2πf₁', near(n2.values.wn, 2 * Math.PI * n2.values.fn, 1e-9));

// 简支方板：E=210GPa,h=10mm,ρ=7850,ν=0.3,L=1m → D=19230.77（∝h³，1mm 板为 19.23）, f₁₁=π√(D/ρh)/L²
var n3 = R.get('natural-freq').compute({ type: 'plate', m: 10, k: 20000, E: 210, b: 50, h: 10, L: 1, rho: 7850, nu: 0.3 });
var Dexp = 210e9 * Math.pow(0.01, 3) / (12 * (1 - 0.09));
var fnPlate = Math.PI * Math.sqrt(Dexp / (7850 * 0.01)) / 1;
assert('板 D = 19230.8 N·m（内嵌一致性）', near(Dexp, 19230.77, 1e-2), Dexp);
assert('方板 f₁₁=π√(D/ρh)/L²=49.166 Hz', near(n3.values.fn, fnPlate, 1e-9) && near(n3.values.fn, 49.166, 1e-2), n3.values.fn);

var n4 = R.get('natural-freq').compute({ type: 'spring', m: 10, k: 80000, E: 210, b: 50, h: 10, L: 2, rho: 7850, nu: 0.3 });
assert('k×4 → fₙ×2（√关系）', near(n4.values.fn, 2 * n1.values.fn, 1e-9), n4.values.fn);
var n5 = R.get('natural-freq').compute({ type: 'beam', m: 10, k: 20000, E: 210, b: 50, h: 10, L: 4, rho: 7850, nu: 0.3 });
assert('梁长 L×2 → f₁÷4（1/L²）', near(n5.values.fn, n2.values.fn / 4, 1e-9), n5.values.fn);
var n6 = R.get('natural-freq').compute({ type: 'spring', m: 0, k: 20000, E: 210, b: 50, h: 10, L: 2, rho: 7850, nu: 0.3 });
assert('m=0 → ok=false', n6.ok === false);
var n7 = R.get('natural-freq').compute({ type: 'plate', m: 10, k: 20000, E: 210, b: 50, h: 10, L: 1, rho: 7850, nu: 1.2 });
assert('ν≥1 非法 → ok=false', n7.ok === false);

// ------------------------------------------------ 3) 结构弯曲波速 ------------------------------------------------
console.log('\n[calc-b8] 结构弯曲波速');
// 钢 h=2mm, f=1000Hz：D=153.846, ρh=15.7, β=√(D/ρh)=3.13045, c_f=√(ω·β)
var w1 = R.get('wave-vib').compute({ E: 210, nu: 0.3, rho: 7850, h: 2, f: 1000 });
var Dw = 210e9 * Math.pow(0.002, 3) / (12 * (1 - 0.09));
var betaw = Math.sqrt(Dw / (7850 * 0.002));
var cfw = Math.sqrt(2 * Math.PI * 1000 * betaw);
assert('D = 153.85 N·m（内嵌一致性）', near(Dw, 153.8462, 1e-3), Dw);
assert('c_f = √(ω·√(D/ρh)) = 140.25 m/s', near(w1.values.cf, cfw, 1e-9) && near(w1.values.cf, 140.25, 0.01), w1.values.cf);
assert('c_g = 2·c_f', near(w1.values.cg, 2 * w1.values.cf, 1e-9));
assert('λ_f = c_f/f = 0.14025 m', near(w1.values.lam, w1.values.cf / 1000, 1e-9) && near(w1.values.lam, 0.14025, 1e-4), w1.values.lam);
assert('k_f = 2π/λ_f = ω/c_f', near(w1.values.kf, 2 * Math.PI / w1.values.lam, 1e-6));
var w2 = R.get('wave-vib').compute({ E: 210, nu: 0.3, rho: 7850, h: 2, f: 4000 });
assert('c_f ∝ √f：f×4 → c_f×2', near(w2.values.cf, 2 * w1.values.cf, 1e-9), w2.values.cf);
var w3 = R.get('wave-vib').compute({ E: 210, nu: 0.3, rho: 7850, h: 4, f: 1000 });
// h×2 → D×8、ρh×2 → D/ρh×4 → c_f=√(ω·√(D/ρh)) ×√2
assert('板厚 h×2 → c_f×√2=1.4142', near(w3.values.cf, w1.values.cf * Math.SQRT2, 1e-9), w3.values.cf);
var w4 = R.get('wave-vib').compute({ E: 210, nu: 0.3, rho: 7850, h: 2, f: 0 });
assert('f=0 → ok=false', w4.ok === false);
var w5 = R.get('wave-vib').compute({ E: 210, nu: 0.3, rho: 7850, h: 2, f: 1000 });
assert('钢板 kHz 频段 c_f 量级 10² m/s（合理性）', w5.values.cf > 50 && w5.values.cf < 500, w5.values.cf);

// ------------------------------------------------ 4) 隔振器选型 ------------------------------------------------
console.log('\n[calc-b8] 隔振器选型');
var p1 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 25, zeta: 0.05, n: 4 });
// 反算校验：把求得的 r 代回 T(r,ζ) 应精确命中目标 T=10^(−25/20)
var Tt25 = Math.pow(10, -25 / 20);
function Tres(r, z) {
  var a = 2 * z * r;
  return Math.sqrt((1 + a * a) / ((1 - r * r) * (1 - r * r) + a * a));
}
assert('所得 r 满足 T(r,ζ)=目标值（残差<1e-9）', near(Tres(p1.values.r, 0.05), Tt25, 1e-9), Tres(p1.values.r, 0.05));
assert('r ≈ 4.5298', near(p1.values.r, 4.5298, 1e-3), p1.values.r);
assert('fₙ = f/r ≈ 11.039 Hz', near(p1.values.fn, 50 / p1.values.r, 1e-9) && near(p1.values.fn, 11.039, 1e-2), p1.values.fn);
assert('δ = g/(2πfₙ)² ≈ 2.038 mm', near(p1.values.delta, 1000 * 9.80665 / Math.pow(2 * Math.PI * p1.values.fn, 2), 1e-9) && near(p1.values.delta, 2.038, 1e-2), p1.values.delta);
assert('k = m(2πfₙ)²；每只 = k/4', near(p1.values.keach, p1.values.ktot / 4, 1e-6) && near(p1.values.ktot, 1000 * Math.pow(2 * Math.PI * p1.values.fn, 2), 1e-6), p1.values.ktot);
assert('隔振效率 = (1−T)×100% ≈ 94.38%', near(p1.values.eff, (1 - Tt25) * 100, 1e-9), p1.values.eff);
assert('ok 为真', p1.ok === true);

// 无阻尼闭式：ζ=0, IL=25dB → r=√(1+10^(IL/20))
var p2 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 25, zeta: 0, n: 4 });
var rClosed = Math.sqrt(1 + Math.pow(10, 25 / 20));
assert('ζ=0 时 r=√(1+10^(IL/20))=4.33403（闭式）', near(p2.values.r, rClosed, 1e-6), p2.values.r);
assert('ζ=0 时 fₙ ≈ 11.5367 Hz', near(p2.values.fn, 50 / rClosed, 1e-6), p2.values.fn);
assert('ζ=0 时 δ ≈ 1.8663 mm', near(p2.values.delta, 1.8663, 1e-3), p2.values.delta);
assert('ζ=0 时 k ≈ 5.254e6 N/m', near(p2.values.ktot, 5.254e6, 1e3), p2.values.ktot);

var p3 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 0, zeta: 0.05, n: 4 });
assert('IL=0 → r=√2（T=1 的边界）', near(p3.values.r, Math.SQRT2, 1e-6), p3.values.r);
var p4 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 15, zeta: 0.05, n: 4 });
assert('IL 减小（25→15）→ r 减小、fₙ 增大、δ 减小', p4.values.r < p1.values.r && p4.values.fn > p1.values.fn && p4.values.delta < p1.values.delta);
var p4b = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 35, zeta: 0.05, n: 4 });
assert('IL 增大（25→35）→ r 增大、fₙ 减小、δ 增大', p4b.values.r > p1.values.r && p4b.values.fn < p1.values.fn && p4b.values.delta > p1.values.delta);
var p5 = R.get('isolator-pick').compute({ W: 2000, f: 50, il: 25, zeta: 0.05, n: 4 });
assert('质量加倍 → 总刚度加倍', near(p5.values.ktot, 2 * p1.values.ktot, 1e-6), p5.values.ktot);
var p6 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 25, zeta: 0.05, n: 8 });
assert('只数加倍 → 单只刚度减半', near(p6.values.keach, p1.values.keach / 2, 1e-6));
var p7 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 60, zeta: 0.05, n: 4 });
// IL=60 → T=1e-3 → r≈100.5、fₙ≈0.50 Hz、δ≈1004 mm（>100 mm 触发大变形告警）
assert('IL=60 仍可解（ok=true）且 r 代回残差<1e-12', p7.ok === true && near(Tres(p7.values.r, 0.05), 1e-3, 1e-12), p7.values.r);
assert('IL=60 → r≈100.5、fₙ≈0.4975 Hz', near(p7.values.r, 100.5, 1) && near(p7.values.fn, 50 / p7.values.r, 1e-9), p7.values.fn);
assert('IL=60 → δ≈1004 mm', near(p7.values.delta, 1004, 5), p7.values.delta);
assert('δ>100 mm 时给出 warn 告警', (p7.notes || []).some(function (nn) { return nn.level === 'warn' && nn.text.indexOf('100 mm') >= 0; }));
var p8 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 25, zeta: 0.05, n: 0 });
assert('n=0 → ok=false', p8.ok === false);
var p9 = R.get('isolator-pick').compute({ W: 1000, f: 50, il: 25, zeta: 0.5, n: 4 });
// ζ=0.5 时峰值 T(1)=√2，但目标 T=0.056<√2 仍可解：r≈17.9、fₙ≈2.79 Hz、δ≈32 mm
assert('ζ=0.5 时 IL=25 仍可解且残差<1e-12', p9.ok === true && near(Tres(p9.values.r, 0.5), Tt25, 1e-12), p9.values.r);
assert('ζ=0.5 时 r 明显更大（15~20）', p9.values.r > 15 && p9.values.r < 20, p9.values.r);
assert('ζ=0.5 时 δ>10 mm（阻尼抬高需求）', p9.values.delta > 10, p9.values.delta);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
