/*
 * sim-radiation.test.js - 基本声源辐射指向性内核 (node tests/sim-radiation.test.js)
 *
 * 覆盖：单极子/偶极子/四极子指向性 D(θ)、指向性指数 DI（数值积分与
 * 解析校核一致）、探测点幅值 1/r 衰减、过零点吸附与输入校验。
 */
var S = require('../public/js/sim-radiation.js');

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

console.log('[1] 指向性 D(θ)');
assert('MODES 三模式', S.MODES.join(',') === 'monopole,dipole,quadrupole');
assert('单极子全指向（任意角=1）',
  S.pattern('monopole', 0) === 1 && S.pattern('monopole', 77) === 1 && S.pattern('monopole', 180) === 1);
assert('偶极子 D(0)=1、D(90)=0', S.pattern('dipole', 0) === 1 && S.pattern('dipole', 90) === 0);
approx('偶极子 D(45°)=1/√2', S.pattern('dipole', 45), Math.SQRT1_2, 1e-9);
assert('四极子 D(0)=1、D(45)=0、D(90)=1',
  S.pattern('quadrupole', 0) === 1 && S.pattern('quadrupole', 45) === 0 && S.pattern('quadrupole', 90) === 1);
approx('四极子 D(22.5°)=1/√2', S.pattern('quadrupole', 22.5), Math.SQRT1_2, 1e-9);
assert('过零点精确吸附（cos(π/2) 浮点残差归零）', S.pattern('dipole', 90) === 0);
assert('模式大小写/空格宽容', S.pattern(' Dipole ', 0) === 1);

console.log('\n[2] 指向性指数 DI = 10·lg(4π/∮D²dΩ)');
approx('单极子 DI = 0 dB', S.directivityIndex('monopole'), 0, 0.01);
approx('偶极子 DI = 10·lg3 ≈ 4.77 dB', S.directivityIndex('dipole'), 4.7712, 0.01);
approx('四极子（|cos2θ|）DI = 10·lg(15/7) ≈ 3.31 dB',
  S.directivityIndex('quadrupole'), 10 * Math.log10(15 / 7), 0.01);
// 解析积分复核：I = ∫₀^π D²·sinθ dθ
function integral(mode) {
  var N = 200000, h = Math.PI / N, sum = 0;
  for (var i = 0; i < N; i++) {
    var th = (i + 0.5) * h;
    var D = mode === 'monopole' ? 1 : (mode === 'dipole' ? Math.abs(Math.cos(th)) : Math.abs(Math.cos(2 * th)));
    sum += D * D * Math.sin(th);
  }
  return sum * h;
}
approx('解析校核：单极子 I=2 → DI=0', 10 * Math.log(2 / integral('monopole')) / Math.LN10, 0, 0.01);
approx('解析校核：偶极子 I=2/3 → DI=4.77', 10 * Math.log(2 / integral('dipole')) / Math.LN10, 4.7712, 0.01);
approx('解析校核：四极子 I=14/15 → DI=3.31', 10 * Math.log(2 / integral('quadrupole')) / Math.LN10, 3.3099, 0.01);

console.log('\n[3] 探测点幅值 D(θ)/r');
approx('r=2 幅值 0.5', S.probePressure(0, 2, 1000, 343, 0, 'monopole'), 0.5, 1e-12);
approx('r=4 幅值 0.25（1/r 衰减）', S.probePressure(0, 4, 1000, 343, 0, 'monopole'), 0.25, 1e-12);
assert('偶极子 90° 无辐射（0）', S.probePressure(90, 2, 1000, 343, 0, 'dipole') === 0);
assert('四极子 45° 无辐射（0）', S.probePressure(45, 2, 1000, 343, 0, 'quadrupole') === 0);
approx('四极子 30°：D=0.5 → 0.25', S.probePressure(30, 2, 1000, 343, 0, 'quadrupole'), 0.25, 1e-12);

console.log('\n[4] 输入校验');
assert('未知模式被拒绝', S.pattern('xxx', 0).ok === false);
assert('DI 未知模式被拒绝', S.directivityIndex('xxx').ok === false);
assert('θ 非数值被拒绝', S.pattern('dipole', 'x').ok === false);
assert('r≤0 被拒绝', S.probePressure(0, 0, 1000, 343, 0, 'monopole').ok === false);
assert('f≤0 被拒绝', S.probePressure(0, 2, 0, 343, 0, 'monopole').ok === false);
assert('c≤0 被拒绝', S.probePressure(0, 2, 1000, 0, 0, 'monopole').ok === false);
assert('t 非数值被拒绝', S.probePressure(0, 2, 1000, 343, 'x', 'monopole').ok === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
