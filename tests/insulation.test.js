/*
 * insulation.test.js — 隔声量质量定律与 STC 评级内核验证（node tests/insulation.test.js）
 */
var I = require('../public/js/insulation.js');

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

console.log('轮廓表与材料库');
assert('STC 轮廓 16 带 125–4000 Hz', I.CONTOUR_HZ.length === 16 && I.CONTOUR_HZ[0] === 125 && I.CONTOUR_HZ[15] === 4000);
assert('轮廓 500 Hz 处为 0 dB', I.CONTOUR_REL[I.CONTOUR_HZ.indexOf(500)] === 0);
assert('轮廓高频端 +9 dB（4000 Hz）', I.CONTOUR_REL[15] === 9);
assert('材料库完整', I.MATERIALS.length >= 8 && I.MATERIALS.every(function (m) {
  return m.id && m.name && m.density > 0 && m.cL > 0;
}));

console.log('面密度与质量定律');
approx('石膏板 12 mm 面密度 = 9.6 kg/m²', I.faceMass('gypsum', 12), 9.6, 1e-9);
approx('混凝土 200 mm 面密度 = 480 kg/m²', I.faceMass('concrete', 200), 480, 1e-9);
assert('未知材料 → null', I.faceMass('nope', 10) === null);
assert('厚度为负 → null', I.faceMass('gypsum', -5) === null);
approx('质量定律 m=10 kg/m², f=500 Hz → 25.98 dB', I.massLaw(10, 500), 20 * Math.log10(5000) - 48, 1e-9);
approx('质量定律 m=50 kg/m², f=1 kHz → 45.98 dB', I.massLaw(50, 1000), 20 * Math.log10(50000) - 48, 1e-9);
approx('频率加倍 → 增加 6 dB', I.massLaw(10, 1000) - I.massLaw(10, 500), 6.0206, 0.001);
approx('面密度加倍 → 增加 6 dB', I.massLaw(20, 500) - I.massLaw(10, 500), 6.0206, 0.001);

console.log('吻合频率');
approx('6 mm 玻璃 fc ≈ 2179 Hz', I.coincidence('glass', 6), 343 * 343 / (1.8 * 5000 * 0.006), 1);
assert('吻合频率随厚度反比下降', I.coincidence('glass', 12) < I.coincidence('glass', 6));
assert('未知材料 → null', I.coincidence('nope', 6) === null);

console.log('STC 评级（ASTM E413）');
var flat50 = [];
for (var i = 0; i < 16; i++) flat50.push(50);
var stc50 = I.stc(flat50);
assert('平直 50 dB → STC 48', stc50.ok === true && stc50.value === 48);
assert('标号格式 STC-48', stc50.designation === 'STC-48');
assert('缺量之和 ≤ 32', stc50.sumDeficiency <= 32);
assert('单带最大缺量 ≤ 8', stc50.maxDeficiency <= 8);
assert('缺量为非负数组（16 项）', stc50.deficiencies.length === 16 && stc50.deficiencies.every(function (d) { return d >= 0; }));
assert('缺 1 个频带 → 报错', I.stc(flat50.slice(0, 15)).ok === false);
assert('含空值 → 报错', I.stc(flat50.map(function (v, idx) { return idx === 3 ? null : v; })).ok === false);

var mass20 = I.fromMass({ mass: 20 });
assert('质量定律 m=20 → STC 36', mass20.ok === true && mass20.stcValue === 36);
assert('质量定律谱 16 带', mass20.levels.length === 16);
assert('低频隔声量最低', mass20.levels[0] < mass20.levels[15]);
assert('面密度加倍 → STC 提升约 6', I.fromMass({ mass: 40 }).stcValue >= mass20.stcValue + 6);
assert('面密度缺失 → 报错', I.fromMass({}).ok === false);

var fromLevels = I.fromLevels([20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50]);
assert('由实测值评级成功', fromLevels.ok === true && fromLevels.stcValue > 20);

console.log('双层构件估算与吻合频率联动');
var dbl = I.doubleLeaf({ mass1: 10, mass2: 10, cavity: 100 });
assert('双层构件评级成功', dbl.ok === true);
assert('双层构件优于同等总面密度单层', dbl.stcValue > I.fromMass({ mass: 20 }).stcValue);
assert('空腔越大越有利', I.doubleLeaf({ mass1: 10, mass2: 10, cavity: 200 }).stcValue >= dbl.stcValue);
assert('缺面密度 → 报错', I.doubleLeaf({ mass1: 10 }).ok === false);
var withCo = I.fromMass({ mass: I.faceMass('glass', 6), materialId: 'glass', thickness: 6 });
assert('面密度估算时可给出吻合频率', withCo.coincidence > 1000);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
