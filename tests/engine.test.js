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

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
