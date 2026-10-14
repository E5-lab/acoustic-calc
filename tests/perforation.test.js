/*
 * perforation.test.js — 穿孔率计算内核单元验证（node tests/perforation.test.js）
 * 纯断言，无依赖。长度单位 mm，穿孔率单位 %。
 */
var P = require('../public/js/perforation.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol || 0.01;
  var ok = (got != null) && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (±' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('阵列形制定义');
assert('形制 4 种', P.PATTERNS.length === 4);
assert('含参考实现的三种形制', ['square', 'diamond-square', 'diamond-rect'].every(function (id) {
  return P.findPattern(id) != null;
}));
assert('未知形制返回 null', P.findPattern('nope') === null);
assert('形制字段完整', P.PATTERNS.every(function (p) {
  return p.id && p.name && p.cell && Array.isArray(p.fields) && p.fields.indexOf('d') >= 0;
}));

console.log('单元面积');
approx('正方形 单元面积 (P=10)', P.unitCellArea('square', { P: 10 }), 100, 1e-9);
approx('45° 菱形 单元面积 (P=10)', P.unitCellArea('diamond-square', { P: 10 }), 50, 1e-9);
approx('矩形错排 单元面积 (P1=10,P2=12)', P.unitCellArea('diamond-rect', { P1: 10, P2: 12 }), 60, 1e-9);
approx('六方 单元面积 (P=10)', P.unitCellArea('hex', { P: 10 }), Math.sqrt(3) / 2 * 100, 1e-9);

console.log('穿孔率（参考实现公式一致性）');
var sq = P.perforationRate({ pattern: 'square', d: 5, P: 10 });
approx('正方形 d5/P10 → π·25/400', sq.rate, Math.PI * 25 / (4 * 100) * 100, 1e-9);
approx('正方形 d5/P10 ≈ 19.635%', sq.rate, 19.6349540849, 0.001);

var ds = P.perforationRate({ pattern: 'diamond-square', d: 5, P: 10 });
approx('45° 菱形 d5/P10 → π·25/200', ds.rate, Math.PI * 25 / (2 * 100) * 100, 1e-9);
approx('45° 菱形为正方形 2 倍', ds.rate, sq.rate * 2, 1e-9);

var dr = P.perforationRate({ pattern: 'diamond-rect', d: 5, P1: 10, P2: 12 });
approx('矩形错排 d5/P1=10/P2=12 ≈ 32.725%', dr.rate, 32.7249234749, 0.001);

var hx = P.perforationRate({ pattern: 'hex', d: 5, P: 10 });
approx('六方 d5/P10 ≈ 22.6725%', hx.rate, 22.6725373, 0.01);
assert('六方介于正方形与 45° 菱形之间', hx.rate > sq.rate && hx.rate < ds.rate);

console.log('派生量');
approx('单孔面积 (d=5) = πd²/4', sq.hole, Math.PI * 25 / 4, 1e-9);
approx('孔数/㎡ (正方形 d5/P10)', sq.holes, 1e6 / 100, 1e-6);
approx('剩余板面比例', sq.solidRatio, 1 - sq.rate / 100, 1e-9);
approx('d/P (正方形 d5/P10)', sq.dOverP, 0.5, 1e-9);
approx('矩形错排 d/P 取较小中心距', dr.dOverP, 0.5, 1e-9);

console.log('输入校验');
assert('d 缺失 → 报错', P.perforationRate({ pattern: 'square', P: 10 }).ok === false);
assert('d = 0 → 报错', P.perforationRate({ pattern: 'square', d: 0, P: 10 }).ok === false);
assert('P 缺失 → 报错', P.perforationRate({ pattern: 'square', d: 5 }).ok === false);
assert('d = P → 报错（孔相交）', P.perforationRate({ pattern: 'square', d: 10, P: 10 }).ok === false);
assert('d > P → 报错', P.perforationRate({ pattern: 'square', d: 12, P: 10 }).ok === false);
assert('矩形错排缺 P2 → 报错', P.perforationRate({ pattern: 'diamond-rect', d: 5, P1: 10 }).ok === false);
assert('矩形错排 d ≥ min(P1,P2) → 报错', P.perforationRate({ pattern: 'diamond-rect', d: 10, P1: 12, P2: 10 }).ok === false);
assert('未知形制 → 报错', P.perforationRate({ pattern: 'zzz', d: 5, P: 10 }).ok === false);

console.log('加工校核提示');
var tight = P.perforationRate({ pattern: 'square', d: 9.5, P: 10 });
assert('孔间壁 < 0.8 mm → 有加工警告', tight.warnings.some(function (w) { return w.level === 'warn'; }));
var dense = P.perforationRate({ pattern: 'square', d: 7, P: 10 });
assert('穿孔率 > 30% → 强度警告', dense.rate > 30 && dense.warnings.some(function (w) { return w.text.indexOf('强度') >= 0; }));
var rare = P.perforationRate({ pattern: 'square', d: 0.5, P: 10 });
assert('穿孔率 < 0.3% → 微穿孔板提示', rare.rate < 0.3 && rare.warnings.some(function (w) { return w.level === 'info'; }));
assert('常规参数无警告', P.perforationRate({ pattern: 'square', d: 3, P: 10 }).warnings.length === 0);

console.log('穿孔率区间分类');
assert('0.1% → 极低', P.classify(0.1).id === 'mpp-low');
assert('1% → 微穿孔板', P.classify(1).id === 'mpp');
assert('8% → 常规穿孔板', P.classify(8).id === 'normal');
assert('20% → 高穿孔率', P.classify(20).id === 'high');
assert('45% → 超高', P.classify(45).id === 'very-high');
assert('数值缺失 → na', P.classify(null).id === 'na');

console.log('反算中心距');
['square', 'diamond-square', 'hex'].forEach(function (id) {
  var s = P.solvePitch({ pattern: id, d: 4, targetRate: 5 });
  assert(id + ' 反算成功', s.ok === true && s.P > 4);
  var back = P.perforationRate({ pattern: id, d: 4, P: s.P });
  approx(id + ' 反算回代 = 5%', back.rate, 5, 0.001);
});
var sdr = P.solvePitch({ pattern: 'diamond-rect', d: 4, targetRate: 5, P2: 12 });
assert('矩形错排反算 P1', sdr.ok === true && sdr.P1 > 0);
approx('矩形错排反算回代 = 5%', P.perforationRate({ pattern: 'diamond-rect', d: 4, P1: sdr.P1, P2: 12 }).rate, 5, 0.001);
assert('反算缺 P2 → 报错', P.solvePitch({ pattern: 'diamond-rect', d: 4, targetRate: 5 }).ok === false);
assert('反算目标 100% → 报错', P.solvePitch({ pattern: 'square', d: 4, targetRate: 100 }).ok === false);
assert('反算目标过大（中心距 < 孔径）→ 报错', P.solvePitch({ pattern: 'square', d: 10, targetRate: 90 }).ok === false);
assert('反算 d 缺失 → 报错', P.solvePitch({ pattern: 'square', targetRate: 5 }).ok === false);

console.log('微穿孔板共振估算（Maa 端部修正）');
var mpp = P.mppResonance({ d: 1, t: 1, cavity: 50, rate: 1 });
assert('返回结果', mpp != null);
approx('有效板厚 t\' = t + 0.85d', mpp.tEff, 1.85, 1e-9);
approx('f0 ≈ 567.6 Hz', mpp.f0, 567.6, 2);
assert('MPP 适用范围判定 = true', mpp.valid === true);
var mppBig = P.mppResonance({ d: 8, t: 2, cavity: 100, rate: 12 });
assert('大孔大穿孔率 → 超出适用范围', mppBig.valid === false);
assert('参数缺失 → null', P.mppResonance({ d: 1, t: 1 }) === null);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
