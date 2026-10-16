/*
 * tests/vibeval.test.js — 振动评价 内核单测
 */
var V = require('../public/js/vibeval.js');
var pass = 0, fail = 0;
function approx(name, got, exp, tol) {
  tol = (tol == null ? 1e-6 : tol);
  if (got == null || Math.abs(got - exp) <= tol) pass++;
  else { fail++; console.log('  ✗ ' + name + ' 期望 ' + exp + ' 实际 ' + got); }
}
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

/* 1) 振动级换算 */
approx('a=1e-6 → 0 dB', V.accelLevel(1e-6), 0, 1e-9);
approx('10 dB → a=3.162e-6', V.levelAccel(10), 3.1623e-6, 1e-9);
approx('v=1e-9 → 0 dB', V.velLevel(1e-9), 0, 1e-9);
approx('d=1e-12 → 0 dB', V.dispLevel(1e-12), 0, 1e-9);
ok('加速度级随 a 增大', V.accelLevel(1e-3) > V.accelLevel(1e-6) - 1e-9);

/* 2) a↔v↔d */
approx('v=1e-3 @50Hz → a=2π·50·1e-3', V.accelFromVel(1e-3, 50), 2 * Math.PI * 50 * 1e-3, 1e-9);
approx('a=1e-3 @50Hz → v=a/(2π·50)', V.velFromAccel(1e-3, 50), 1e-3 / (2 * Math.PI * 50), 1e-12);
ok('d = a/(2πf)²', Math.abs(V.dispFromVel(V.velFromAccel(1e-3, 50), 50) - 1e-3 / Math.pow(2 * Math.PI * 50, 2)) < 1e-15);

/* 3) 计权总振动级 */
approx('Wb 单带 4Hz 80dB → 80', V.weightedLevel({ 4: 80 }, 'Wb'), 80, 1e-9);
var wl = V.weightedLevel({ 4: 80, 8: 80 }, 'Wb');
ok('双带 Wb 总级高于单带', wl > 80 - 1e-9);
ok('Wb 加权后低频带(1Hz)贡献降低', V.weightedLevel({ 1: 100 }, 'Wb') < 100 - 1e-9);

/* 4) aw 反算 */
approx('awFromLevel(0)=1e-6', V.awFromLevel(0), 1e-6, 1e-12);

/* 5) VDV */
approx('VDV 稳态 a=1 Cf=1 T=1 → 1', V.vdv(1, 1, 1), 1, 1e-9);
ok('VDV 随 a 增大', V.vdv(2, 1, 1) > V.vdv(1, 1, 1) - 1e-9);
ok('VDV 随 T 增大(0.25次方)', V.vdv(1, 16, 1) > V.vdv(1, 1, 1) - 1e-9);

/* 6) 暴露评价 */
var ex = V.exposure(0.5, 8);
ok('0.5 m/s²×8h 恰为行动值', ex.k === ex.av);
ok('1.15 m/s²×8h 恰为暴露限值', (function () { var e = V.exposure(1.15, 8); return Math.abs(e.k - e.elv) < 1e-9; })());
ok('短时高幅可能超限', V.exposure(2.0, 8).verdict.indexOf('危险') >= 0);

/* 7) GB 10070 */
approx('居民文教区昼间限值 70', V.gb10070Limit('居民文教区', 'day'), 70, 1e-9);
approx('居民文教区夜间限值 67', V.gb10070Limit('居民文教区', 'night'), 67, 1e-9);
ok('实测 72 在居民区昼间超标', V.evaluateGb10070(72, '居民文教区', 'day').ok === false);
ok('实测 65 在居民区昼间达标', V.evaluateGb10070(65, '居民文教区', 'day').ok === true);
ok('铁路干线两侧限值 80', V.gb10070Limit('铁路干线两侧', 'night') === 80);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
