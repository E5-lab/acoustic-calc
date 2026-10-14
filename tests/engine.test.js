/*
 * engine.test.js — 计算内核单元验证（Node 运行：node tests/engine.test.js）
 * 不依赖任何测试框架，纯断言 + 控制台输出。
 */
var A = require('../public/js/acoustics.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol || 0.5;
  var ok = (got != null) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + got.toFixed(2)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (±' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function near(name, got, want, tol) {
  tol = tol || 1;
  if (Math.abs(got - want) <= tol) { passed++; console.log('  PASS  ' + name + ' = ' + got); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want); }
}

console.log('A 计权声级');
// 单频 1kHz 100dB → LA≈100
var r1 = A.aWeighted([0,0,0,0,0,100,0,0,0]);
approx('LA (1kHz 100dB)', r1.LA, 100, 0.1);
// 各带 100 dB 时，因 A 计权在中高频为正，LA 高于 100（约 107 dB）
var r2 = A.aWeighted([100,100,100,100,100,100,100,100,100]);
near('LA(全带100)', r2.LA, 107, 1);
// SIL
approx('SIL (500/1k/2k/4k = 40/30/20/10)', A.aWeighted([0,0,0,0,40,30,20,10,0]).sil, 25, 0.001);

console.log('NC 评价');
// cmuse 示例：NC-25 精确命中
var nc25 = A.ncRating([0,54,44,37,31,27,24,22,21]); // 31.5 用 0 占位，NC 不评估该带
approx('NC (cmuse NC-25)', nc25.value, 25, 0.01);
assert('NC 控制带 = 63Hz', nc25.controllingBand === 63);
// NC-25 各带 +1dB → 约 NC-26.7（63Hz 控制带）
var ncHi = A.ncRating([0,55,45,38,32,28,25,23,22]);
near('NC (+1dB 约 26.7)', ncHi.value, 26.7, 0.5);

console.log('NR 评价');
// 平谱 50 dB：高频带决定，NR 约 50–56
var nrFlat = A.nrRating([50,50,50,50,50,50,50,50,50]);
near('NR (平谱 50dB)', nrFlat.value, 53, 3);
// 1000Hz=40 → NR 至少 40
var nr40 = A.nrRating([0,0,0,0,0,40,0,0,0]);
approx('NR (1kHz 40dB)', nr40.value, 40, 0.01);

console.log('RC 评价');
// 中性谱：各带恰等于 RC 参考曲线，RC=30, N
var rcNeutral = A.rcRating([55,50,45,40,35,30,25,20,15]);
near('RC (中性谱)', rcNeutral.rc, 30, 0.001);
assert('RC 分类 = N', rcNeutral.classification === 'N');
// 低频隆起（rumble）：250Hz 抬高
var rcRumble = A.rcRating([60,58,55,52,35,30,25,20,15]);
near('RC (rumble 谱)', rcRumble.rc, 30, 0.001);
assert('RC 分类 = R', rcRumble.classification === 'R');
// 高频隆起（hiss）：4000Hz 抬高
var rcHiss = A.rcRating([55,50,45,40,35,30,25,30,25]);
assert('RC 分类 = H', rcHiss.classification === 'H');

console.log('多测点能量平均');
// 两个相同测点平均应等于原值
var avgSame = A.energyAverage([[40,40,40,40,40,40,40,40,40], [40,40,40,40,40,40,40,40,40]]);
approx('平均(同值 x2)', avgSame[4], 40, 0.001);
// 40 与 50 dB 的能量平均 = 10log10((10^4 + 10^5)/2) = 47.4036
var avgTwo = A.energyAverage([[40,40,40,40,40,40,40,40,40], [50,50,50,50,50,50,50,50,50]]);
approx('平均(40 & 50 dB)', avgTwo[0], 47.4036, 0.01);
// 单测点带缺测（null）时按该带有效数计算
var avgNull = A.energyAverage([[40,null,40,40,40,40,40,40,40], [50,50,40,40,40,40,40,40,40]]);
approx('平均(缺测带取有效值)', avgNull[1], 50, 0.001);
// 空输入 → 全 null
var avgEmpty = A.energyAverage([]);
assert('平均(空输入) 全为 null', avgEmpty.every(function (v) { return v === null; }));

console.log('房间目标值对照');
var studio = A.findTarget('studio');
assert('findTarget(studio) 命中', studio && studio.nc[1] === 20);
assert('未知 id 返回 null', A.findTarget('nope') === null);
// NC 30 对录音棚（目标 ≤20）应超标，超出 10
var evFail = A.evaluateTarget(studio, { nc: 30, rc: 30 });
assert('录音棚 NC30 → 超标', evFail.nc.status === 'fail');
approx('超标量 = 10', evFail.nc.margin, 10, 0.001);
assert('总体结论 = fail', evFail.overall === 'fail');
// NC 18 达标
var evPass = A.evaluateTarget(studio, { nc: 18, rc: 18 });
assert('录音棚 NC18 → 达标', evPass.nc.status === 'pass');
assert('总体结论 = pass', evPass.overall === 'pass');
// NC 缺失时退回 RC 判定
var evFallback = A.evaluateTarget(studio, { nc: null, rc: 18 });
assert('NC 缺失 → 以 RC 判定', evFallback.basedOn === 'RC' && evFallback.overall === 'pass');
// 目标表完整性：每项都有 id/name/nc/rc
assert('目标表条目完整', A.ROOM_TARGETS.length >= 10 && A.ROOM_TARGETS.every(function (t) {
  return t.id && t.name && Array.isArray(t.nc) && t.nc.length === 2 && Array.isArray(t.rc) && t.rc.length === 2;
}));

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
