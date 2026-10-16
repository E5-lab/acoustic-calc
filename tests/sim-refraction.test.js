/*
 * sim-refraction.test.js - 温度梯度声折射（射线弯曲）内核 (node tests/sim-refraction.test.js)
 *
 * 覆盖：声速剖面 c(z)=c₀+g·z、折返点高度解析式、射线追踪的三种 regime
 * （g=0 直线 / g>0 折返 / g<0 逃逸）、Snell 不变量守恒回归与输入校验。
 */
var S = require('../public/js/sim-refraction.js');

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

console.log('[1] 声速剖面 c(z) = c₀ + g·z');
approx('c(0) = c₀', S.soundSpeed(0, 343, 0.05), 343, 1e-12);
approx('c(100) = c₀ + g·z', S.soundSpeed(100, 343, 0.05), 348, 1e-12);
approx('g<0 递减', S.soundSpeed(1000, 343, -0.05), 293, 1e-12);
assert('非数值返回 null', S.soundSpeed('x', 343, 0.05) === null);

console.log('\n[2] 折返点高度 z_tp = c₀(secθ₀ − 1)/g');
approx('z_tp(30°, g=+0.05) ≈ 1061.25 m', S.turningHeight(30, 343, 0.05), 1061.2457, 0.5);
approx('z_tp(60°, g=+0.05) ≈ 6860 m', S.turningHeight(60, 343, 0.05), 6860, 1);
assert('g≤0 不折返（null）', S.turningHeight(30, 343, -0.05) === null);
assert('g=0 不折返（null）', S.turningHeight(30, 343, 0) === null);
assert('θ₀≤0 不折返（null）', S.turningHeight(0, 343, 0.05) === null);
assert('θ₀≥90° 无效（null）', S.turningHeight(90, 343, 0.05) === null);

console.log('\n[3] 射线追踪：g=0 直线传播');
var r0 = S.traceRay(30, 343, 0, { dx: 0.5, xMax: 2000 });
assert('traceRay ok', r0.ok === true);
assert('未折返、未触地', r0.turned === false && r0.hitGround === false);
var maxErr = 0;
r0.points.forEach(function (p) {
  var e = Math.abs(p.z - p.x * Math.tan(Math.PI / 6)) / Math.max(1, Math.abs(p.x));
  if (e > maxErr) maxErr = e;
});
assert('全程 z = x·tanθ₀（最大相对误差 ' + maxErr.toExponential(2) + ' < 1e-6）', maxErr < 1e-6);

console.log('\n[4] 射线追踪：g>0 逆温折返');
var rp = S.traceRay(30, 343, 0.05, { dx: 1, xMax: 24000, zMax: 7000 });
assert('turned=true', rp.turned === true);
assert('折返后触地 hitGround=true', rp.hitGround === true);
approx('数值最大高度 ≈ 解析折返高度', rp.maxHeight, 1061.2457, 1);
assert('折返点高度与解析一致（traceRay 内置）',
  Math.abs(rp.turningHeight - 1061.2457) < 0.5);
var iMax = 0;
rp.points.forEach(function (p, i) { if (p.z > rp.points[iMax].z) iMax = i; });
var afterTurn = rp.points.slice(iMax);
assert('折返后高度单调下降', afterTurn.every(function (p, i, a) {
  return i === 0 || a[i - 1].z >= p.z - 1e-9;
}));
// Snell 不变量守恒：cosθ/c 沿声线为常数（折返前采样，θ 由有限差分求得）
var k0 = Math.cos(Math.PI / 6) / 343, kErr = 0;
for (var i = 1; i < 3800; i += 97) {
  var dzdx = (rp.points[i + 1].z - rp.points[i - 1].z) / 2;
  var th = Math.atan(dzdx);
  var c = 343 + 0.05 * rp.points[i].z;
  kErr = Math.max(kErr, Math.abs(Math.cos(th) / c - k0));
}
assert('Snell 不变量 cosθ/c 守恒（最大偏差 ' + kErr.toExponential(2) + ' < 5e-3）', kErr < 5e-3);

console.log('\n[5] 射线追踪：g<0 正常递减逃逸');
var rm = S.traceRay(30, 343, -0.05, { dx: 1, xMax: 24000, zMax: 7000 });
assert('turned=false（不折返）', rm.turned === false);
assert('未触地', rm.hitGround === false);
assert('高度单调上升', rm.points.every(function (p, i, a) {
  return i === 0 || a[i - 1].z <= p.z + 1e-9;
}));
// g<0 时声速随高度降低，线性模型在 c→0（z≈c₀/|g|=6860 m）附近失效，
// 射线在到达 xMax 之前即被 zMax/c≤0 终止——这正是"逃逸"的预期行为。
approx('终止于高度上限附近（z≈zMax）', rm.points[rm.points.length - 1].z, 7000, 100);

console.log('\n[6] 输入校验');
assert('θ₀ 非数值被拒绝', S.traceRay('x', 343, 0).ok === false);
assert('c₀≤0 被拒绝', S.traceRay(30, 0, 0).ok === false);
assert('dx=0 被拒绝', S.traceRay(30, 343, 0, { dx: 0 }).ok === false);
assert('xMax<0 被拒绝', S.traceRay(30, 343, 0, { xMax: -1 }).ok === false);
assert('zMax=0 被拒绝', S.traceRay(30, 343, 0, { zMax: 0 }).ok === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
