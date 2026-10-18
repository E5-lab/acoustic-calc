/*
 * calc-b7.test.js — 声明式计算器 · 经典与教学（纯函数单测，参照此写法为各 calc-bN 写测试）
 *
 * 运行：node tests/calc-b7.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b7.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b7] 路由登记');
['mach', 'standing-open-closed', 'p-u-intensity', 'decibel-conv'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});

console.log('\n[calc-b7] 声速与马赫数');
var m = R.get('mach').compute({ theta: 20, v: 340 });
assert('c = 331.3+0.606θ = 343.42', near(m.values.c, 343.42, 0.01), m.values.c);
assert('M = v/c ≈ 0.99', near(m.values.mach, 0.99004, 1e-3), m.values.mach);

console.log('\n[calc-b7] 开管/闭管共振');
var s1 = R.get('standing-open-closed').compute({ L: 0.5, c: 343, n: 1, type: 'closed' });
assert('闭管 n=1 f₁ = 171.5 Hz', near(s1.values.fn, 171.5, 0.1), s1.values.fn);
var s2 = R.get('standing-open-closed').compute({ L: 0.5, c: 343, n: 2, type: 'open' });
assert('开管 n=2 fₙ = 686 Hz', near(s2.values.fn, 686, 0.1), s2.values.fn);

console.log('\n[calc-b7] p-u 法声强');
var p = R.get('p-u-intensity').compute({ p: 1, rho: 1.2, c: 343 });
assert('u = p/(ρc) ≈ 0.002430 m/s', near(p.values.u, 0.0024297, 1e-5), p.values.u);
assert('I = p·u ≈ 0.002430 W/m²', near(p.values.I, 0.0024297, 1e-5), p.values.I);
assert('L_I ≈ 93.86 dB', near(p.values.LI, 93.856, 0.05), p.values.LI);

console.log('\n[calc-b7] 比值↔分贝换算');
var d1 = R.get('decibel-conv').compute({ lin: 2, db: 0, mode: 'field' });
assert('场量 20log10(2) = 6.0206 dB', near(d1.values.dbOut, 6.0206, 1e-3), d1.values.dbOut);
var d2 = R.get('decibel-conv').compute({ lin: 10, db: 0, mode: 'power' });
assert('功率量 10log10(10) = 10 dB', near(d2.values.dbOut, 10, 1e-6), d2.values.dbOut);
var d3 = R.get('decibel-conv').compute({ lin: 0, db: 6.02, mode: 'field' });
assert('field 逆运算 10^(6.02/20)=2.000', near(d3.values.linOut, 2.0, 1e-3), d3.values.linOut);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
