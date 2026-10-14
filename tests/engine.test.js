/*
 * engine.test.js — 计算内核单元验证（Node 运行：node tests/engine.test.js）
 * 不依赖任何测试框架，纯断言 + 控制台输出。
 * 倍频带数据顺序：16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz（共 10 带）
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

console.log('频带定义');
assert('倍频带 10 带含 16 Hz', A.BANDS.length === 10 && A.BANDS[0] === 16 && A.BANDS[9] === 8000);
assert('1/3 倍频带 29 带 16–10000 Hz', A.THIRD_BANDS.length === 29 && A.THIRD_BANDS[0] === 16 && A.THIRD_BANDS[28] === 10000);

console.log('A 计权（IEC 61672 解析式）');
approx('A(1kHz) = 0', A.aWeightAt(1000), 0, 0.01);
approx('A(63Hz) ≈ -26.2', A.aWeightAt(63), -26.2, 0.3);
approx('A(31.5Hz) ≈ -39.4', A.aWeightAt(31.5), -39.4, 0.3);
approx('A(16Hz) ≈ -56.7', A.aWeightAt(16), -56.7, 0.4);
approx('LA (1kHz 100dB)', A.aWeighted([0,0,0,0,0,0,100,0,0,0]).LA, 100, 0.1);
near('LA(全带100)', A.aWeighted([100,100,100,100,100,100,100,100,100,100]).LA, 107, 1);
approx('SIL (40/30/20/10)', A.aWeighted([0,0,0,0,0,40,30,20,10,0]).sil, 25, 0.001);

console.log('1/3 倍频程 → 倍频程合成');
var flat60 = A.THIRD_BANDS.map(function () { return 60; });
var synth = A.thirdToOctave(flat60);
approx('3 带合成 (60dB → +4.77)', synth.octave[5], 64.77, 0.01);
approx('16 Hz 带 2 带合成 (→ +3.01)', synth.octave[0], 63.01, 0.01);
assert('无缺失带', synth.missingBands === 0);
var only1k = A.THIRD_BANDS.map(function (f) { return f === 1000 ? 80 : null; });
var s2 = A.thirdToOctave(only1k);
approx('仅 1kHz 一条 → 该倍频带 = 80', s2.octave[A.BANDS.indexOf(1000)], 80, 0.001);
assert('其余倍频带缺失计数 = 9', s2.missingBands === 9);

console.log('NC 评价（切线插值法 + 31.5 Hz）');
var nc25 = A.ncRating([0].concat([65,54,44,37,31,27,24,22,21]));
approx('NC (NC-25 曲线自身)', nc25.value, 25, 0.01);
assert('NC 控制带 = 31.5Hz', nc25.controllingBand === 31.5);
var ncHi = A.ncRating([0].concat([66,55,45,38,32,28,25,23,22]));
near('NC (+1dB 约 26.7)', ncHi.value, 26.7, 0.2);
assert('仅有 16Hz 数据 → NC 为 null', A.ncRating([100,null,null,null,null,null,null,null,null,null]).value === null);

console.log('NC 低频一致性检查（S12.2 频谱不平衡法）');
var lfOk = A.ncLowFrequencyCheck([0].concat([68,57,48,41,0,0,0,0,0]), 30, 30);
assert('低频与 NC-30 一致 → ok', lfOk.verdict === 'ok' && Math.abs(lfOk.worst) < 0.01);
var lfPoss = A.ncLowFrequencyCheck([0].concat([75,57,48,41,0,0,0,0,0]), 30, 30);
assert('31.5Hz 超出 7 dB → 可能投诉', lfPoss.verdict === 'possible');
approx('31.5Hz 超限量 = 7', lfPoss.worst, 7, 0.01);
var lfLikely = A.ncLowFrequencyCheck([0].concat([80,57,48,41,0,0,0,0,0]), 30, 30);
assert('31.5Hz 超出 12 dB → 很可能投诉', lfLikely.verdict === 'likely');
var b16 = A.ncBand16Check([85,0,0,0,0,0,0,0,0,0], 30, 30);
near('16Hz 85dB 相对 NC-30(81) 超出 4', b16.dev, 4, 0.01);

console.log('NR 评价');
var nrFlat = A.nrRating([0,50,50,50,50,50,50,50,50,50]);
near('NR (平谱 50dB)', nrFlat.value, 56, 3);
approx('NR (1kHz 40dB)', A.nrRating([0,0,0,0,0,0,40,0,0,0]).value, 40, 0.01);

console.log('RC 评价（Mark II + QAI + RV）');
var rcNeutral = A.rcRating([55,55,50,45,40,35,30,25,20,15]);
near('RC (中性谱)', rcNeutral.rc, 30, 0.001);
assert('RC 分类 = N', rcNeutral.classification === 'N');
assert('QAI 完整（含 16Hz）', rcNeutral.qaiComplete === true);
near('QAI ≈ 0（频谱均衡）', rcNeutral.qai, 0, 1.2);
assert('无振动风险', rcNeutral.rvLevel === 'none');
var rcRumble = A.rcRating([null,60,58,55,52,35,30,25,20,15]);
assert('RC 分类 = R', rcRumble.classification === 'R');
assert('低频超限频带记录', rcRumble.details.some(function (d) { return d.band === 250 && d.excess > 5; }));
var rcHiss = A.rcRating([null,57,52,45,40,35,35,20,15,10]);
assert('RC 分类 = H（1000Hz 超限 5dB）', rcHiss.classification === 'H');
assert('H 判定纳入 1000 Hz 带', rcHiss.details.some(function (d) { return d.band === 1000 && d.excess > 3; }));
var rcBoth = A.rcRating([55,55,50,54,40,35,35,20,20,15]);
assert('RC 分类 = RH', rcBoth.classification === 'RH');
var rcTilt = A.rcRating([70,60,50,45,40,35,30,25,20,15]);
assert('倾斜频谱 QAI 明显增大', rcTilt.qai > 5);
var rcRv = A.rcRating([null,78,50,45,40,35,30,25,20,15]);
assert('RV 级别 = clear', rcRv.rvLevel === 'clear');
assert('RV 频带含 31.5Hz', rcRv.rvBands.indexOf(31.5) >= 0);
var rcRvMod = A.rcRating([70,50,45,40,35,30,25,20,15,10]);
assert('RV 级别 = moderate', rcRvMod.rvLevel === 'moderate');
assert('缺 16Hz → QAI 不完整', A.rcRating([null,55,50,45,40,35,30,25,20,15]).qaiComplete === false);

console.log('多测点能量平均');
var avgSame = A.energyAverage([[40,40,40,40,40,40,40,40,40,40], [40,40,40,40,40,40,40,40,40,40]], 10);
approx('平均(同值 x2)', avgSame[4], 40, 0.001);
var avgTwo = A.energyAverage([[40,40,40,40,40,40,40,40,40,40], [50,50,50,50,50,50,50,50,50,50]], 10);
approx('平均(40 & 50 dB)', avgTwo[0], 47.4036, 0.01);
var avgNull = A.energyAverage([[40,null,40,40,40,40,40,40,40,40], [50,50,40,40,40,40,40,40,40,40]], 10);
approx('平均(缺测带取有效值)', avgNull[1], 50, 0.001);
assert('平均(空输入) 全为 null', A.energyAverage([], 10).every(function (v) { return v === null; }));
assert('平均支持 1/3 倍频程 29 带', A.energyAverage([A.THIRD_BANDS.map(function () { return 50; })], 29).length === 29);

console.log('房间目标值对照');
var studio = A.findTarget('studio');
assert('findTarget(studio) 命中', studio && studio.nc[1] === 20);
assert('未知 id 返回 null', A.findTarget('nope') === null);
var evFail = A.evaluateTarget(studio, { nc: 30, rc: 30 });
assert('录音棚 NC30 → 超标', evFail.nc.status === 'fail');
approx('超标量 = 10', evFail.nc.margin, 10, 0.001);
assert('总体结论 = fail', evFail.overall === 'fail');
var evPass = A.evaluateTarget(studio, { nc: 18, rc: 18 });
assert('录音棚 NC18 → 达标', evPass.nc.status === 'pass');
assert('NC 缺失 → 以 RC 判定', A.evaluateTarget(studio, { nc: null, rc: 18 }).basedOn === 'RC');
assert('目标表条目完整', A.ROOM_TARGETS.length >= 10 && A.ROOM_TARGETS.every(function (t) {
  return t.id && t.name && Array.isArray(t.nc) && t.nc.length === 2 && Array.isArray(t.rc) && t.rc.length === 2;
}));

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
