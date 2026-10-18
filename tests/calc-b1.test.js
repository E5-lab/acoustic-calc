/*
 * calc-b1.test.js — 声明式计算器 · 材料与建筑声学（纯函数单测）
 * 运行：node tests/calc-b1.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b1.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b1] 路由登记');
['mpp', 'coincidence', 'sabine-alpha', 'cavity-abs', 'wall-tl', 'floor-float'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});

console.log('\n[calc-b1] 微穿孔板吸声设计器');
var m = R.get('mpp').compute({ d: 0.8, t: 0.8, sigma: 1, D: 50, f: 500 });
assert('α 落在 [0,1]', m.values.alpha >= 0 && m.values.alpha <= 1, m.values.alpha);
assert('f₀ 为正且在合理范围', m.values.f0 > 0 && m.values.f0 < 4000, m.values.f0);
assert('峰值 α ≤ 1 且 >0', m.values.alphaPeak > 0 && m.values.alphaPeak <= 1, m.values.alphaPeak);
assert('归一化声阻 R>0', m.values.Zr > 0, m.values.Zr);
assert('ok 为真', m.ok === true);

console.log('\n[calc-b1] 临界吻合频率');
var co = R.get('coincidence').compute({ ms: 20, h: 10, E: 30, nu: 0.2 });
assert('体积密度 ρ = m′/h = 2000', near(co.values.rhoV, 2000, 0.1), co.values.rhoV);
assert('f_c > 0', co.values.fc > 0 && isFinite(co.values.fc), co.values.fc);

console.log('\n[calc-b1] 由混响测吸声系数');
var sa = R.get('sabine-alpha').compute({ V: 100, S: 120, T: 0.8 });
assert('A = 0.161·V/T = 20.125', near(sa.values.A, 20.125, 1e-3), sa.values.A);
assert('α_Sabine = A/S = 0.1677', near(sa.values.aSab, 20.125 / 120, 1e-3), sa.values.aSab);
assert('α_Eyring = 1−e^(−A/S) = 0.15448', near(sa.values.aEyr, 1 - Math.exp(-20.125 / 120), 1e-4), sa.values.aEyr);

console.log('\n[calc-b1] 薄板/膜共振吸声峰');
var ca = R.get('cavity-abs').compute({ ms: 2, D: 10, zeta: 0.1 });
// f₀=(1/2π)√(ρc²/(m′D))，ρ=1.21,c=343,m′=2,D=0.1
var f0exp = (1 / (2 * Math.PI)) * Math.sqrt(1.21 * 343 * 343 / (2 * 0.1));
assert('f₀ ≈ 134.2 Hz', near(ca.values.f0, f0exp, 0.1), ca.values.f0);
assert('Q = 1/(2ζ) = 5', near(ca.values.Q, 5, 1e-6), ca.values.Q);
assert('Δf = f₀/Q ≈ 26.84', near(ca.values.bw, f0exp / 5, 0.1), ca.values.bw);

console.log('\n[calc-b1] 单层墙质量定律 + 吻合');
var wt = R.get('wall-tl').compute({ ms: 200, f: 500, E: 30, nu: 0.2, h: 100, zeta: 0.1 });
// 质量定律: 20log10(200·500)−47.5 = 100−47.5 = 52.5；f=500 远离 f_c≈47Hz，dip≈0
assert('TL ≈ 52.5 dB（吻合谷在远处≈0）', near(wt.values.TL, 52.5, 0.2), wt.values.TL);
assert('f_c ≈ 47.4 Hz', near(wt.values.fc, 47.4, 0.5), wt.values.fc);

console.log('\n[calc-b1] 浮筑楼板改善量');
var ff = R.get('floor-float').compute({ baseTL: 50, ms: 40, fn: 15, f: 100 });
// ΔR = 20log10(100/15)−3 = 20·0.8239−3 = 13.478
assert('ΔR ≈ 13.48 dB', near(ff.values.dR, 20 * Math.log10(100 / 15) - 3, 0.05), ff.values.dR);
assert('等效 TL ≈ 63.48 dB', near(ff.values.effTL, 50 + (20 * Math.log10(100 / 15) - 3), 0.05), ff.values.effTL);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
