/*
 * levels.test.js — 声压级叠加内核验证（node tests/levels.test.js）
 */
var L = require('../public/js/levels.js');

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

console.log('能量叠加');
approx('70 + 70 = 73.01', L.energySum([70, 70]).total, 73.0103, 0.005);
approx('80 + 70 = 80.41', L.energySum([80, 70]).total, 80.4139, 0.005);
approx('4 × 70 = 76.02', L.energySum([70, 70, 70, 70]).total, 76.0206, 0.005);
approx('10 × 70 = 80.00', L.energySum(new Array(10).fill(70)).total, 80.0, 0.01);
assert('叠加级逐个递增统计', L.energySum([70, 70]).count === 2);
assert('空输入 → 报错', L.energySum([]).ok === false && L.energySum(null).ok === false);
assert('忽略空值', L.energySum([70, null, '', 70]).count === 2);
approx('能量平均 (70,80) = 77.40', L.energyAverage([70, 80]).value, 77.4036, 0.005);
approx('能量平均 (70,70) = 70', L.energyAverage([70, 70]).value, 70, 1e-9);

console.log('增量法');
approx('差 0 dB → +3.01', L.increment(0), 3.0103, 0.005);
approx('差 3 dB → +1.76', L.increment(3), 1.7645, 0.005);
approx('差 10 dB → +0.41', L.increment(10), 0.4139, 0.005);
approx('差 20 dB → +0.04', L.increment(20), 0.0432, 0.005);
assert('增量取绝对值（差值为负也可用）', Math.abs(L.increment(-3) - L.increment(3)) < 1e-12);
approx('增量表首项 3.01', L.INCREMENT_TABLE[0].increment, 3.01, 1e-9);
assert('增量表单调递减', L.INCREMENT_TABLE.every(function (r, i, a) {
  return i === 0 || r.increment < a[i - 1].increment;
}));
var curve = L.incrementCurve(10, 2.5);
assert('增量曲线点数与端点', curve.length === 5 && curve[0].diff === 0 && curve[4].diff === 10);
approx('增量曲线末点与公式一致', curve[4].increment, L.increment(10), 1e-12);

var p = L.pair(80, 70);
assert('两两叠加成功', p.ok === true);
approx('两两叠加 80+70 = 80.41', p.total, 80.4139, 0.005);
approx('差值 10 dB', p.diff, 10, 1e-9);
approx('增量 0.41 dB', p.increment, 0.4139, 0.005);
assert('提示弱声源可忽略', /可忽略/.test(p.verdict));
approx('等强两源 70+70 = 73.01', L.pair(70, 70).total, 73.0103, 0.005);
assert('等强时提示约 3 dB', /3 dB/.test(L.pair(70, 70).verdict));
assert('缺参数 → 报错', L.pair(70, null).ok === false);
assert('记录直接相加的错误值供对比', L.pair(80, 70).naiveSum === 150);
assert('文献核对：差 5 dB → 1.19', Math.abs(L.increment(5) - 1.193) < 0.001);

console.log('相干叠加');
approx('同相等强 80+80 = 86.02（+6 dB）', L.coherent(80, 80, 0).value, 86.0206, 0.005);
approx('正交（90°）退化为能量叠加 83.01', L.coherent(80, 80, 90).value, 83.0103, 0.005);
approx('同相等强与能量叠加之差 ≈ 3.01', L.coherent(80, 80, 0).vsEnergy, 3.0103, 0.005);
assert('反相等强 → 完全抵消', L.coherent(80, 80, 180).canceled === true && L.coherent(80, 80, 180).value === null);
approx('反相不等强（83 与 80）= 72.31（低于两源）', L.coherent(83, 80, 180).value, 72.3094, 0.01);
assert('反相不等强仍低于能量叠加', L.coherent(83, 80, 180).value < L.coherent(83, 80, 180).energySum);
approx('相干叠加给出能量叠加值 84.76', L.coherent(83, 80, 180).energySum, 84.7643, 0.005);
approx('360° 与 0° 等价', L.coherent(80, 80, 360).value, L.coherent(80, 80, 0).value, 1e-9);
assert('缺参数 → 报错', L.coherent(null, 80, 0).ok === false);
assert('提示区分同相/反相', /6 dB/.test(L.coherent(80, 80, 0).note) && /抵消/.test(L.coherent(80, 80, 180).note));

console.log('背景噪声修正（声级相减）');
var s1 = L.subtract(75, 70);
approx('75 与 70 → 被测源 73.35', s1.value, 73.3485, 0.005);
approx('修正量 1.65 dB', s1.correction, 1.6515, 0.005);
assert('差值 5 dB → 标准表修正 2 dB', s1.standardCorrection === 2 && s1.verdict === 'corrected');
approx('按标准修正后的声级 73', s1.rounded, 73, 1e-9);
var s2 = L.subtract(73, 70);
assert('差值 3 dB → 标准表修正 3 dB', s2.standardCorrection === 3);
approx('差值 3 dB 修正结果 69.98', s2.value, 69.9794, 0.005);
var s3 = L.subtract(90, 70);
assert('差值 20 dB → 免修正（修正 0）', s3.standardCorrection === 0 && s3.verdict === 'negligible');
approx('差值 20 dB 修正量 ≈ 0.04', s3.correction, 0.0432, 0.005);
var s4 = L.subtract(72, 70);
assert('差值 2 dB → 不宜修正（无标准修正值）', s4.standardCorrection === null && s4.verdict === 'unusable');
assert('差值 2 dB 仍给出公式结果', s4.ok === true && s4.value > 60);
assert('背景高于实测 → 报错', L.subtract(70, 72).ok === false && /背景声级高于/.test(L.subtract(70, 72).error));
assert('两者相同 → 报错', L.subtract(70, 70).ok === false);
assert('背景修正表单调不增', L.BACKGROUND_TABLE.every(function (r, i, a) {
  return i === 0 || r.correction <= a[i - 1].correction;
}));
approx('修正量的物理含义：L总 − L源 = 修正量', 75 - s1.value, s1.correction, 1e-9);

console.log('多声源叠加');
var ml = L.sources([{ level: 70 }, { level: 70 }, { level: 70 }]);
assert('三源叠加成功', ml.ok === true && ml.count === 3 && ml.totalCount === 3);
approx('3 × 70 → 74.77', ml.total, 74.7712, 0.005);
approx('比最强单源高 4.77 dB', ml.incrementOverMax, 4.7712, 0.005);
approx('撤除一源后总级下降 1.76 dB', ml.rows[0].removalDrop, 1.7609, 0.005);
approx('每源能量占比 1/3', ml.rows[0].share, 1 / 3, 1e-9);
approx('按数量计的平均级 = 70', ml.average, 70, 1e-9);

var mc = L.sources([{ name: '冲床', level: 70, count: 4 }, { name: '风机', level: 65 }]);
approx('4 × 70 + 65 → 76.35', mc.total, 76.3510, 0.005);
assert('数量参与统计', mc.totalCount === 5 && mc.rows[0].count === 4);
approx('含数量单源的分级 = 76.02', mc.rows[0].partial, 76.0206, 0.005);
assert('主贡献源为冲床（能量最大者）', mc.dominant.level === 70 && mc.dominant.count === 4);
assert('占比合计 ≈ 1', Math.abs(mc.rows.reduce(function (a, r) { return a + r.share; }, 0) - 1) < 1e-9);
assert('风机的撤除下降量很小（< 0.5 dB）', mc.rows[1].removalDrop < 0.5);
assert('单个声源时撤除下降量不可计算', L.sources([{ level: 80 }]).rows[0].removalDrop === null);
assert('空列表 → 报错', L.sources([]).ok === false);
assert('数量自动取整且不小于 1', L.sources([{ level: 70, count: 0 }]).rows[0].count === 1);
assert('忽略无声级的行', L.sources([{ level: 70 }, { name: '未填' }]).count === 1);

console.log('达标反算');
var rr = L.requiredReduction([{ level: 80 }, { level: 70 }], 75);
assert('未达标给出降噪需求', rr.ok === true && rr.already === false);
approx('总级 80.41，需降 5.41 dB', rr.needed, 5.4139, 0.005);
approx('80 dB 源需降低 6.65 dB', rr.rows[0].need, 6.6509, 0.005);
approx('降噪后该源声级 ≈ 73.35', rr.rows[0].resultLevel, 73.3491, 0.005);
assert('70 dB 源不可行（其余声源已超目标）', rr.rows[1].feasible === false && rr.rows[1].need === null);
approx('最小可行降噪量取可行项最小', rr.minimal, 6.6509, 0.005);
var rr2 = L.requiredReduction([{ level: 70 }], 80);
assert('已达标 → already', rr2.ok === true && rr2.already === true && rr2.needed === 0);
assert('目标缺失 → 报错', L.requiredReduction([{ level: 70 }], null).ok === false);
var rr3 = L.requiredReduction([{ level: 90 }, { level: 89 }], 80);
assert('目标受多源限制时标注不可行', rr3.feasible === false && !!rr3.rows[0].reason && rr3.minimal === null);

console.log('频带谱叠加');
var sp = L.sumSpectra([70, 70, 70, 70, 70, 70, 70, 70], [70, 70, 70, 70, 70, 70, 70, 70]);
assert('八带叠加成功', sp.ok === true && sp.rows.length === 8 && sp.bands[0] === 63);
approx('每带 70+70 = 73.01', sp.rows[0].sum, 73.0103, 0.005);
approx('A 谱总级 79.03', sp.totalA, 79.0309, 0.005);
approx('叠加后总级 82.04', sp.total, 82.0412, 0.005);
approx('总增量 ≈ 3.01 dB', sp.increment, 3.0103, 0.005);
var sp2 = L.sumSpectra([70, null], [null, 80]);
assert('缺一方数据时取另一方并标记', sp2.rows[0].sum === 70 && sp2.rows[0].missing === 'B' &&
  sp2.rows[1].sum === 80 && sp2.rows[1].missing === 'A');
approx('缺测带总和按可用数据计', sp2.total, 80.4139, 0.005);
assert('全空 → 报错', L.sumSpectra([null, null], [null, null]).ok === false);
assert('自定义频带可用', L.sumSpectra([60], [60], [125]).bands[0] === 125);
assert('自定义频带叠加值正确（60+60 = 63.01）', Math.abs(L.sumSpectra([60], [60], [125]).rows[0].sum - 63.0103) < 0.005);

console.log('声压换算');
approx('94 dB → 1.0024 Pa', L.levelToPressure(94).pa, 1.00237, 1e-4);
approx('0 dB → 20 µPa', L.levelToPressure(0).pa, 2e-5, 1e-18);
approx('94 dB → 1002.4 mPa', L.levelToPressure(94).mpa, 1002.37, 0.1);
approx('声压比 10^(94/20) = 50118.7', L.levelToPressure(94).ratio, 50118.72, 1);
approx('1 Pa → 93.98 dB', L.pressureToLevel(1).value, 93.9794, 0.005);
approx('换算往返一致', L.pressureToLevel(L.levelToPressure(85).pa).value, 85, 1e-9);
assert('声压 ≤ 0 → 报错', L.pressureToLevel(0).ok === false && L.pressureToLevel(-1).ok === false);
assert('声压级缺参数 → 报错', L.levelToPressure(null).ok === false);

console.log('距离衰减');
var dpt = L.distanceAttenuation({ r1: 1, r2: 10, type: 'point' });
approx('点声源 1 m → 10 m 衰减 20 dB', dpt.delta, 20, 1e-9);
approx('距离加倍衰减 6.02 dB', dpt.perDouble, 6.0206, 0.005);
var dln = L.distanceAttenuation({ r1: 1, r2: 10, type: 'line' });
approx('线声源 1 m → 10 m 衰减 10 dB', dln.delta, 10, 1e-9);
approx('线声源距离加倍衰减 3.01 dB', dln.perDouble, 3.0103, 0.005);
approx('距离减半为负衰减（+6 dB）', L.distanceAttenuation({ r1: 10, r2: 5 }).delta, -6.0206, 0.005);
assert('缺距离 → 报错', L.distanceAttenuation({ r1: 1 }).ok === false);
assert('距离为 0 → 报错', L.distanceAttenuation({ r1: 0, r2: 10 }).ok === false);
assert('默认按点声源', L.distanceAttenuation({ r1: 1, r2: 2 }).type === 'point');

console.log('声功率级 ↔ 声压级（点声源）');
approx('方向性因子 Q=1 → −10.99', L.directivityFactor(1), -10.9921, 0.005);
approx('方向性因子 Q=2 → −7.98', L.directivityFactor(2), -7.9818, 0.005);
approx('方向性因子 Q=4 → −4.97', L.directivityFactor(4), -4.9715, 0.005);
var p2s = L.powerToSpl({ lw: 100, r: 10, q: 2 });
approx('Lw100、半自由场、10 m → Lp 72.02', p2s.lp, 72.0182, 0.005);
approx('自由场（Q=1）同条件 69.01', L.powerToSpl({ lw: 100, r: 10, q: 1 }).lp, 69.0079, 0.005);
approx('经典公式核对 Lp = Lw − 20lg r − 8', 100 - 20 * Math.log10(10) - 7.9818, p2s.lp, 1e-3);
approx('反算回到 Lw = 100', L.splToPower({ lp: p2s.lp, r: 10, q: 2 }).lw, 100, 1e-9);
assert('缺参数 → 报错', L.powerToSpl({ lw: 100 }).ok === false && L.splToPower({ lp: 70 }).ok === false);
assert('提示给出 Q 的物理含义', /半自由场/.test(p2s.note));

console.log('边界与健壮性');
assert('字符串数字可解析', L.energySum(['70', '70']).total > 73 && L.energySum(['70', '70']).total < 73.02);
assert('NaN 输入被忽略', L.energySum([70, NaN]).count === 1);
assert('round1 保留一位小数', L.round1(73.349) === 73.3 && L.round1(null) === null);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
