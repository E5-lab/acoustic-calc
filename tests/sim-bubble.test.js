/*
 * sim-bubble.test.js - 水下气泡共鸣（Minnaert）内核 (node tests/sim-bubble.test.js)
 *
 * 覆盖：Minnaert 频率 f₀=(1/2πr)√(3γP₀/ρ) 与 f₀∝1/r 标度、反函数、
 * Lorentz 扫频响应与半功率带宽、simulate 主入口与输入校验。
 */
var S = require('../public/js/sim-bubble.js');

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

console.log('[1] Minnaert 共鸣频率');
var f0 = S.minnaertFreq(0.001, 1.4, 101325, 1000);
approx('f₀(r=1 mm) ≈ 3283.24 Hz', f0, 3283.2434, 0.5);
approx('f₀ ∝ 1/r：r=0.5 mm 频率加倍', S.minnaertFreq(0.0005, 1.4, 101325, 1000), 2 * f0, 1e-6);
approx('f₀(r=2 mm) 减半', S.minnaertFreq(0.002, 1.4, 101325, 1000), f0 / 2, 1e-6);
approx('γ=1.0（等温）频率降 √(1/1.4)',
  S.minnaertFreq(0.001, 1.0, 101325, 1000), f0 * Math.sqrt(1 / 1.4), 1e-6);
approx('水深 10 m（P₀≈2 atm）频率升 √2',
  S.minnaertFreq(0.001, 1.4, 2 * 101325, 1000), f0 * Math.SQRT2, 1e-6);
assert('r≤0 返回 null', S.minnaertFreq(0, 1.4, 101325, 1000) === null);
assert('ρ≤0 返回 null', S.minnaertFreq(0.001, 1.4, 101325, 0) === null);

console.log('\n[2] 频率 → 半径反函数');
approx('round-trip r = 1 mm', S.sizeForFreq(f0, 1.4, 101325, 1000), 0.001, 1e-15);
assert('f≤0 返回 null', S.sizeForFreq(0, 1.4, 101325, 1000) === null);

console.log('\n[3] Lorentz 扫频响应与半功率带宽');
approx('H(f₀) = 1', S.resonanceResponse(f0, f0, 10), 1, 1e-9);
approx('H(f₀·1.05) = 1/√2（半功率点）', S.resonanceResponse(f0 * 1.05, f0, 10), Math.SQRT1_2, 1e-6);
approx('H(f₀·0.95) = 1/√2', S.resonanceResponse(f0 * 0.95, f0, 10), Math.SQRT1_2, 1e-6);
approx('H(f₀·2) ≈ 0.0499（Q=10，去谐形式）', S.resonanceResponse(2 * f0, f0, 10), 1 / Math.sqrt(401), 1e-6);
assert('Q≤0 返回 null', S.resonanceResponse(f0, f0, 0) === null);
var band = S.halfPowerBand(f0, 10);
approx('f₁ = f₀(1−1/2Q)', band[0], f0 * 0.95, 1e-6);
approx('f₂ = f₀(1+1/2Q)', band[1], f0 * 1.05, 1e-6);
approx('Δf = f₀/Q', band[1] - band[0], f0 / 10, 1e-6);

console.log('\n[4] simulate 主入口');
var sim = S.simulate({ rMm: 1 });
assert('simulate ok', sim.ok === true);
approx('f₀', sim.f0, f0, 1e-6);
approx('直径 2 mm', sim.diameterMm, 2, 1e-9);
approx('水中波长 λ=c/f₀', sim.lambda, 1481 / f0, 1e-6);
approx('带宽 df = f₀/Q', sim.df, f0 / 10, 1e-6);
assert('扫频曲线 402 点（401 对数点 + 精确 f₀ 峰点）', sim.curve.length === 402);
var peak = sim.curve.reduce(function (a, b) { return b.H > a.H ? b : a; });
approx('曲线峰值在 f₀', peak.f, f0, 1e-6);
approx('峰值 H=1', peak.H, 1, 1e-9);
assert('曲线频率升序', sim.curve.every(function (p, i, a) { return i === 0 || a[i - 1].f <= p.f; }));
assert('notes 4 条', sim.notes.length === 4);
var dflt = S.simulate();
assert('空参走缺省值', dflt.ok === true && dflt.rMm === 1 && dflt.Q === 10);
assert('rMm=0.05（越界）被拒绝', S.simulate({ rMm: 0.05 }).ok === false);
assert('γ=2.0 被拒绝', S.simulate({ gamma: 2 }).ok === false);
assert('P₀=10 kPa（越界）被拒绝', S.simulate({ P0: 10000 }).ok === false);
assert('Q=100 被拒绝', S.simulate({ Q: 100 }).ok === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
