/*
 * absorber.test.js — Delany–Bazley 多孔吸声内核验证（node tests/absorber.test.js）
 */
var A = require('../public/js/absorber.js');

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

console.log('常量与预设');
approx('空气特性阻抗 ρ0c0 = 411.6', A.RC, 411.6, 0.1);
assert('倍频带 7 带 63–4000 Hz', A.BANDS.length === 7 && A.BANDS[0] === 63 && A.BANDS[6] === 4000);
assert('流阻率预设非空且字段完整', A.PRESETS.length >= 6 && A.PRESETS.every(function (p) {
  return p.id && p.name && p.sigma > 0;
}));

console.log('Delany–Bazley 参数（σ=10000, f=500 → X=0.06）');
var p = A.dbProps(10000, 500);
approx('X = ρ0 f / σ', p.X, 0.06, 1e-9);
approx('Zc 实部归一化 = 1.4766', p.zr, 1.4766, 0.002);
approx('Zc 虚部归一化 = −0.6824', p.zi, -0.6824, 0.002);
approx('k 实部归一化 = 1.7008', p.kr, 1.7008, 0.002);
approx('k 虚部归一化 = −1.0079', p.ki, -1.0079, 0.003);
assert('X=0.06 在适用范围内', p.valid === true);
assert('X 过小（σ=40000,f=63）→ 超范围', A.dbProps(40000, 63).valid === false);
assert('X 过大（σ=1000,f=4000）→ 超范围', A.dbProps(1000, 4000).valid === false);

console.log('单频点：刚性背衬厚层（200 mm，500 Hz）');
var thick = A.point({ sigma: 10000, f: 500, thickness: 200 });
assert('计算成功', thick.ok === true);
assert('厚层吸声系数 > 0.8', thick.alpha > 0.8);
assert('吸声系数在 0–1 之间', thick.alpha <= 1 && thick.alpha >= 0);
approx('衰减常数 = k0·|ki| ≈ 9.23 Np/m', thick.attenuation, 9.232, 0.05);
assert('表面阻抗实部为正', thick.zsRatio.re > 0);

console.log('单频点：薄层与空腔');
var thin = A.point({ sigma: 10000, f: 500, thickness: 25 });
assert('25 mm 薄层吸声系数 < 厚层', thin.alpha < thick.alpha);
assert('25 mm 薄层吸声系数在 0.05–0.4', thin.alpha > 0.05 && thin.alpha < 0.4);
var gap50 = A.point({ sigma: 10000, f: 250, thickness: 25, airGap: 50 });
var noGap = A.point({ sigma: 10000, f: 250, thickness: 25, airGap: 0 });
assert('加空腔提升低频吸声（250 Hz）', gap50.alpha > noGap.alpha + 0.02);
var gapBig = A.point({ sigma: 10000, f: 125, thickness: 25, airGap: 200 });
assert('大空腔显著提升低频（125 Hz）', gapBig.alpha > A.point({ sigma: 10000, f: 125, thickness: 25 }).alpha);

console.log('倍频带谱与 NRC');
var spec = A.spectrum({ sigma: 20000, thickness: 50 });
assert('谱计算成功（7 带）', spec.ok === true && spec.alphas.length === 7);
assert('吸声系数随频率上升（低频 < 高频）', spec.alphas[0] < spec.alphas[6]);
assert('全部在 0–1 之间', spec.alphas.every(function (a) { return a >= 0 && a <= 1; }));
assert('NRC 为 0.05 的整数倍', Math.abs(spec.nrc * 100) % 5 === 0);
assert('NRC 为两位小数', String(spec.nrc).length <= 4);
assert('NRC ≥ 0.6（50 mm 玻璃棉）', spec.nrc >= 0.6);
assert('alpha500 记录正确', Math.abs(spec.alpha500 - A.point({ sigma: 20000, f: 500, thickness: 50 }).alpha) < 1e-12);
var specGap = A.spectrum({ sigma: 9000, thickness: 25, airGap: 100 });
assert('带空腔后 500 Hz 吸声显著提升（> 0.4）', specGap.alphas[3] > 0.4);
assert('带空腔后 500 Hz 明显优于无空腔（+0.2 以上）',
  specGap.alphas[3] > A.point({ sigma: 9000, f: 500, thickness: 25 }).alpha + 0.2);
assert('250 Hz 空腔同样有增益', specGap.alphas[2] > A.point({ sigma: 9000, f: 250, thickness: 25 }).alpha);
assert('无效频带计数存在', typeof specGap.invalidCount === 'number');

console.log('厚度建议');
var rec = A.recommendThickness(9000, 500, 0);
assert('返回建议厚度', rec != null && rec.thickness >= 20);
assert('建议厚度为 5 mm 的整数倍', rec.thickness % 5 === 0);
assert('参数缺失 → null', A.recommendThickness(null, 500) === null);

console.log('输入校验');
assert('σ 缺失 → 报错', A.point({ f: 500, thickness: 50 }).ok === false);
assert('σ = 0 → 报错', A.point({ sigma: 0, f: 500, thickness: 50 }).ok === false);
assert('厚度 0 → 报错', A.point({ sigma: 9000, f: 500, thickness: 0 }).ok === false);
assert('空腔为负 → 报错', A.point({ sigma: 9000, f: 500, thickness: 50, airGap: -10 }).ok === false);
assert('谱计算参数错误时返回错误对象', A.spectrum({ sigma: null, thickness: 50 }).ok === false);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
