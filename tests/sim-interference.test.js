/*
 * sim-interference.test.js - 双源声波干涉内核 (node tests/sim-interference.test.js)
 *
 * 覆盖：波长、远场归一化振幅 A(θ)=|cos(πd·sinθ/λ+φ/2)|、波程差、
 * 相长/相消角表（orders）、相位差影响、[0,1] 值域守卫与输入校验。
 */
var S = require('../public/js/sim-interference.js');

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

console.log('[1] 波长 λ = c/f');
var w = S.wavelength(500, 343);
assert('wavelength ok', w.ok === true);
approx('λ(500 Hz, 343 m/s)', w.lambda, 0.686, 1e-9);
approx('λ(1000 Hz, 343 m/s)', S.wavelength(1000, 343).lambda, 0.343, 1e-9);

console.log('\n[2] 振幅 A(θ) 与相消角（d=1 m, f=500 Hz）');
approx('A(0°)=1（中垂线相长）', S.amplitude(0, 1, 500, 343).amplitude, 1, 1e-9);
assert('A(20.06°)≈0（第一相消角 asin(λ/2d)）', S.amplitude(20.06, 1, 500, 343).amplitude < 1e-3);
approx('A(43.3°)≈1（第一主极大 asin(λ/d)）', S.amplitude(43.3, 1, 500, 343).amplitude, 1, 1e-3);
approx('A(90°)=|cos(π/0.686)|', S.amplitude(90, 1, 500, 343).amplitude,
  Math.abs(Math.cos(Math.PI * 1 / 0.686)), 1e-9);

console.log('\n[3] 极值角表 orders');
var o = S.orders(1, 500, 343);
assert('orders ok', o.ok === true);
assert('主极大 3 个（0°、±43.31°）', o.maxima.length === 3 &&
  Math.abs(o.maxima[0] + 43.31) < 0.01 && Math.abs(o.maxima[1]) < 1e-9 && Math.abs(o.maxima[2] - 43.31) < 0.01);
assert('极小 2 个（±20.06°）', o.minima.length === 2 &&
  Math.abs(o.minima[0] + 20.06) < 0.01 && Math.abs(o.minima[1] - 20.06) < 0.01);
assert('升序排列', o.maxima.every(function (v, i, a) { return i === 0 || a[i - 1] <= v; }));
var oWide = S.orders(5, 500, 343);
assert('d=5 m 时主极大 15 个', oWide.maxima.length === 15);
var oNarrow = S.orders(0.5, 500, 343);
assert('d<λ/2 时仅 0° 一个主极大', oNarrow.maxima.length === 1 && oNarrow.maxima[0] === 0);

console.log('\n[4] 波程差与相位差');
approx('Δr(1, 30°) = 0.5', S.pathDiff(1, 30).deltaR, 0.5, 1e-12);
approx('Δr(1, 90°) = 1', S.pathDiff(1, 90).deltaR, 1, 1e-12);
approx('Δr(2, 0°) = 0', S.pathDiff(2, 0).deltaR, 0, 1e-12);
var a180 = S.amplitude(0, 1, 500, 343, 180);
assert('反相（φ=180°）中垂线相消', a180.amplitude < 1e-9);
approx('φ=90° 中垂线 A=1/√2', S.amplitude(0, 1, 500, 343, 90).amplitude, Math.SQRT1_2, 1e-9);
approx('ΔΦ = 2πΔr/λ + φ', S.amplitude(30, 1, 500, 343, 60).phaseRad,
  2 * Math.PI * 0.5 / 0.686 + Math.PI / 3, 1e-9);

console.log('\n[5] 值域守卫与输入校验');
var inRange = true;
for (var t = -180; t <= 180; t += 0.37) {
  var a = S.amplitude(t, 1.7, 440, 343).amplitude;
  if (!(a >= 0 && a <= 1)) inRange = false;
}
assert('全角度扫描 A ∈ [0,1]', inRange);
assert('f≤0 被拒绝', S.amplitude(0, 1, 0, 343).ok === false);
assert('c≤0 被拒绝', S.amplitude(0, 1, 500, 0).ok === false);
assert('d≤0 被拒绝', S.amplitude(0, 0, 500, 343).ok === false);
assert('θ 非数值被拒绝', S.amplitude('x', 1, 500, 343).ok === false);
assert('orders 非法输入被拒绝', S.orders(1, -500, 343).ok === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
