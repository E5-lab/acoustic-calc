/*
 * barrier.test.js — 声屏障绕射衰减内核验证（node tests/barrier.test.js）
 */
var B = require('../public/js/barrier.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.01 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (±' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('A 计权（复用 IEC 61672 解析式）');
approx('A(1000) = 0', B.aWeight(1000), 0, 0.01);
approx('A(125) ≈ −16.1', B.aWeight(125), -16.1, 0.2);
approx('A(63) ≈ −26.2', B.aWeight(63), -26.2, 0.3);

console.log('几何：hs=1, hb=3, hr=1.5, d1=10, d2=20');
var g = B.geometry({ hs: 1, hb: 3, hr: 1.5, d1: 10, d2: 20 });
assert('几何计算成功', g.ok === true);
approx('直线距离 D ≈ 30.00417', g.D, 30.00417, 0.001);
approx('声源至屏障顶 A ≈ 10.19804', g.A, 10.19804, 0.001);
approx('屏障顶至接收点 B ≈ 20.05617', g.B, 20.05617, 0.001);
approx('程差 δ ≈ 0.25004 m', g.delta, 0.25004, 0.001);
approx('视线在屏障处高度 hLOS ≈ 1.16667 m', g.hLOS, 1.16667, 0.001);
approx('屏障顶超出视线 1.83333 m', g.hEffective, 1.83333, 0.001);
assert('视线被遮挡', g.blocked === true);
assert('缺参数 → 报错', B.geometry({ hs: 1, hb: 3 }).ok === false);
assert('距离为 0 → 报错', B.geometry({ hs: 1, hb: 3, hr: 1.5, d1: 0, d2: 20 }).ok === false);

console.log('菲涅尔数与衰减公式');
approx('N(500 Hz, δ=0.25) = 0.72886', B.fresnel(0.25004, 500), 2 * 500 * 0.25004 / 343, 1e-4);
var at = B.attenuation(0.72886);
approx('Kurze–Anderson ≈ 12.45 dB', at.kurzeAnderson, 12.45, 0.05);
approx('Maekawa ≈ 11.85 dB', at.maekawa, 11.85, 0.05);
assert('N ≤ 0 → 衰减为 0', B.attenuation(0).kurzeAnderson === 0 && B.attenuation(0).maekawa === 0 && B.attenuation(-0.5).none === true);
assert('衰减随 N 单调增大', B.attenuation(5).kurzeAnderson > B.attenuation(1).kurzeAnderson);

console.log('单频点与实用上限');
var p = B.point({ hs: 1, hb: 3, hr: 1.5, d1: 10, d2: 20 }, 500);
approx('默认（Kurze–Anderson）ΔL ≈ 12.45', p.deltaL, 12.45, 0.05);
var pMk = B.point({ hs: 1, hb: 3, hr: 1.5, d1: 10, d2: 20, formula: 'maekawa' }, 500);
approx('指定 Maekawa 公式结果不同', pMk.deltaL, 11.85, 0.05);
var pLimit = B.point({ hs: 1, hb: 30, hr: 1.5, d1: 10, d2: 20, maxLimit: 24 }, 4000);
assert('超限时受实用上限约束', pLimit.limited === true && pLimit.deltaL === 24);

console.log('倍频带插入损失与声源谱叠加（道路交通噪声）');
var spec = B.spectrum({ hs: 1, hb: 3, hr: 1.5, d1: 10, d2: 20, sourceId: 'road' });
assert('谱计算成功', spec.ok === true);
assert('7 个倍频带', spec.rows.length === 7);
assert('各带 ΔL 随频率增大', spec.rows[0].deltaL < spec.rows[6].deltaL);
approx('A 计权插入损失 ≈ 12.7 dB', spec.insertionLoss, 12.68, 0.3);
assert('插入损失 = 屏障前后差值', Math.abs((spec.overallBefore - spec.overallAfter) - spec.insertionLoss) < 1e-9);
assert('屏障后声级更低', spec.overallAfter < spec.overallBefore);
assert('采用 A 计权', spec.weighted === true);

console.log('视线未遮挡与自定义谱');
var noBlock = B.spectrum({ hs: 1, hb: 1.0, hr: 1.5, d1: 10, d2: 20, sourceId: 'road' });
assert('屏障顶低于视线 → 报错提示', noBlock.ok === false && noBlock.error.indexOf('视线') >= 0);
var flat = B.spectrum({ hs: 1, hb: 3, hr: 1.5, d1: 10, d2: 20, sourceId: 'flat' });
assert('平直谱模式不做 A 计权', flat.weighted === false);
assert('平直谱插入损失为各带能量平均结果', flat.insertionLoss > 0 && flat.insertionLoss < 24);
var custom = B.spectrum({ hs: 1, hb: 3, hr: 1.5, d1: 10, d2: 20, sourceLevel: 70 });
assert('自定义声级可用', custom.ok === true);

console.log('反向建议所需高度');
var need = B.requiredHeight({ hs: 1, hr: 1.5, d1: 10, d2: 20, sourceId: 'road', targetIL: 10 });
assert('给出建议高度', need.ok === true && need.height > 1.6 && need.height < 3);
assert('建议高度满足目标', need.achieved >= 10);
assert('目标过高 → 报错', B.requiredHeight({ hs: 1, hr: 1.5, d1: 10, d2: 20, sourceId: 'road', targetIL: 40 }).ok === false);
assert('缺几何参数 → 报错', B.requiredHeight({ targetIL: 10 }).ok === false);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
