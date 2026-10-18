/*
 * calc-b2.test.js — 声明式计算器 · 电声与系统（纯函数单测）
 * 运行：node tests/calc-b2.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b2.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b2] 路由登记');
['directivity', 'nearfar', 'roomgain', 'spl-vs-dist', 'damping-factor', 'delay-align'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});

console.log('\n[calc-b2] 指向性因数 Q / DI');
var di1 = R.get('directivity').compute({ mode: 'boundary', n: 1, phi: 30 });
assert('边界 n=1 → Q=2', near(di1.values.Q, 2, 1e-9), di1.values.Q);
assert('DI = 10log10(2) = 3.0103 dB', near(di1.values.DI, 3.0103, 1e-3), di1.values.DI);
var di2 = R.get('directivity').compute({ mode: 'cone', phi: 90, n: 0 });
assert('锥半角 90° → Q=2/(1−cos90)=2', near(di2.values.Q, 2, 1e-9), di2.values.Q);

console.log('\n[calc-b2] 近场/远场分界');
var nf = R.get('nearfar').compute({ D: 0.3, f: 1000, c: 343 });
assert('λ = 343/1000 = 0.343 m', near(nf.values.lambda, 0.343, 1e-6), nf.values.lambda);
assert('r≈D²/λ = 0.09/0.343 = 0.2624 m', near(nf.values.rff1, 0.09 / 0.343, 1e-4), nf.values.rff1);
assert('r≈2D²/λ = 0.5248 m', near(nf.values.rff2, 0.18 / 0.343, 1e-4), nf.values.rff2);

console.log('\n[calc-b2] 边界增益 / SBIR');
var rg = R.get('roomgain').compute({ d: 0, f: 100, n: 1, c: 343 });
assert('d=0, n=1 → G=2 (+6.02 dB)', near(rg.values.lin, 2, 1e-9) && near(rg.values.gain, 6.0206, 1e-3), rg.values.gain);
var rg2 = R.get('roomgain').compute({ d: 0, f: 100, n: 3, c: 343 });
assert('d=0, n=3 → G=8 (+9.03 dB)', near(rg2.values.lin, 8, 1e-9), rg2.values.lin);

console.log('\n[calc-b2] 点声源距离衰减');
var sp = R.get('spl-vs-dist').compute({ Lw: 100, Q: 1, r: 2, space: 'free' });
// Lp = 100 + 10log10(1/(4π)) − 20log10(2) = 100 −10.992 −6.0206 = 82.987
assert('自由场 Lp(2m) ≈ 82.99 dB', near(sp.values.Lp, 100 + 10 * Math.log10(1 / (4 * Math.PI)) - 20 * Math.log10(2), 0.05), sp.values.Lp);
assert('相对 1m 衰减 = 20log10(2) = 6.02 dB', near(sp.values.drop, 20 * Math.log10(2), 0.05), sp.values.drop);
var sp2 = R.get('spl-vs-dist').compute({ Lw: 100, Q: 1, r: 2, space: 'half' });
// 半空间 denom=2π → 比自由场高 3 dB
assert('半空间比自由场高约 3 dB', near(sp2.values.Lp, sp.values.Lp + 3, 0.05), sp2.values.Lp);

console.log('\n[calc-b2] 功放阻尼系数影响');
var df = R.get('damping-factor').compute({ DF: 100, Z: 8, Qes: 0.4 });
assert('Z_amp = 8/100 = 0.08 Ω', near(df.values.Zamp, 0.08, 1e-9), df.values.Zamp);
assert('阻尼误差 = 100/101 = 0.9901%', near(df.values.err, 100 / 101, 1e-4), df.values.err);
assert('Qes′ = 0.4·(1+1/100) = 0.404', near(df.values.QesEff, 0.404, 1e-6), df.values.QesEff);

console.log('\n[calc-b2] 扬声器延时/相位对齐');
var da = R.get('delay-align').compute({ dd: 0.3, f: 1000, c: 343 });
assert('τ = 0.3/343·1000 = 0.8746 ms', near(da.values.tau, 0.3 / 343 * 1000, 1e-3), da.values.tau);
// φ = 360·1000·0.3/343 = 314.87 → 归一到 [-180,180] = -45.13°
assert('φ ≈ −45.1°', near(da.values.phi, -45.13, 0.1), da.values.phi);
assert('第一 null f = 343/0.6 = 571.67 Hz', near(da.values.fnull, 343 / 0.6, 0.1), da.values.fnull);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
