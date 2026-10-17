/*
 * irt60.test.js - 脉冲响应测量与 RT60 分析内核（node tests/irt60.test.js）
 * 覆盖：互相关定位、Farina 反卷积往返（合成房间 RT60 恢复）、
 *       Schroeder 曲线、Lundeby 噪声补偿、T20/T30/EDT 拟合、FFT 带限。
 */
var SG = require('../public/js/siggen.js');
var IR = require('../public/js/irt60.js');
var AU = require('../public/js/aural.js');
var sr = 48000;

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

/* 指数衰减白噪 IR：RT60 时刻能量衰减 60 dB（τ = RT60/6.9078） */
function synthIr(n, rt60, seed) {
  var ir = SG.white(n, seed), tau = rt60 / 6.9078;
  for (var i = 0; i < n; i++) ir[i] *= Math.exp(-i / (tau * sr));
  return ir;
}
function bandEnergy(x, f1, f2) {
  var n = x.length, N = AU.nextPow2(n);
  var re = new Float64Array(N), im = new Float64Array(N);
  for (var i = 0; i < n; i++) re[i] = x[i];
  AU.fft(re, im, false);
  var s = 0;
  for (var k = 1; k <= N / 2; k++) { var f = k * sr / N; if (f >= f1 && f < f2) s += re[k] * re[k] + im[k] * im[k]; }
  return s;
}

console.log('correlation lag (rec 中扫频的起始位置)');
var sweep = SG.logSweep(48000, sr, 50, 12000);
var rec = new Float64Array(sweep.length + 9000 + 4800);
for (var i = 0; i < sweep.length; i++) rec[9000 + i] = sweep[i];
assert('correlationLag = 9000', IR.correlationLag(rec, sweep) === 9000);
assert('correlationLag guards', IR.correlationLag(null, sweep) === 0 && IR.correlationLag(new Float64Array(0), sweep) === 0);

console.log('\nFarina deconvolve roundtrip (合成房间 RT60 = 0.6 s)');
var irTrue = synthIr(48000, 0.6, 11);
var room = AU.convolve(sweep, irTrue);
var irHat = IR.farinaDeconvolve(room, sweep);
assert('farinaDeconvolve length = rec length', irHat.length === room.length);
var an = IR.analyzeIr(irHat, sr);
approx('roundtrip T30 = 0.6', an.t30.T, 0.6, 0.02);
approx('roundtrip EDT = 0.6', an.edt.T, 0.6, 0.02);
approx('roundtrip T20 = 0.6', an.t20.T, 0.6, 0.02);
assert('farinaDeconvolve guards', IR.farinaDeconvolve(null, sweep) === null && IR.farinaDeconvolve(room, null) === null);

console.log('\nexponential decay IR (RT60 = 0.8 s, 无噪底)');
var ir2 = synthIr(48000, 0.8, 23);
var an2 = IR.analyzeIr(ir2, sr);
approx('expdecay T30 = 0.8', an2.t30.T, 0.8, 0.01);
approx('expdecay EDT = 0.8 (EDT target 0 回归)', an2.edt.T, 0.8, 0.01);
approx('expdecay T20 = 0.8', an2.t20.T, 0.8, 0.01);
assert('expdecay noiseDb < -60 dB', an2.noiseDb < -60);

console.log('\nfitDecay 精确线性衰减 (-60 dB / 0.7 s)');
var dbLin = new Float64Array(48000);
for (i = 0; i < dbLin.length; i++) dbLin[i] = -60 * (i / 48000) / 0.7;
var fd = IR.fitDecay(dbLin, 48000, -5, -35, dbLin.length - 1);
approx('fitDecay T = 0.7', fd.T, 0.7, 1e-4);
approx('fitDecay slope = -85.714 dB/s', fd.slope, -60 / 0.7, 0.01);
approx('fitDecay range t1 (-5 dB)', fd.range[0], 0.7 * 5 / 60, 1e-4);
approx('fitDecay range t2 (-35 dB)', fd.range[1], 0.7 * 35 / 60, 1e-4);
assert('fitDecay 反向区间 → null', IR.fitDecay(dbLin, 48000, -35, -5, dbLin.length - 1) === null);
var dbRise = new Float64Array(48000);
for (i = 0; i < dbRise.length; i++) dbRise[i] = 60 * (i / 48000) / 0.7;
assert('fitDecay 非衰减曲线 → null', IR.fitDecay(dbRise, 48000, -5, -35, dbRise.length - 1) === null);
assert('fitDecay guards', IR.fitDecay(null, 48000, -5, -35, 0) === null && IR.fitDecay(new Float64Array(4), 48000, -5, -35, 3) === null);

console.log('\nLundeby 噪声补偿 (0.5 s 后跌入 -60 dB 噪底)');
var dbC = new Float64Array(48000);
for (i = 0; i < dbC.length; i++) { var t = i / 48000; dbC[i] = t < 0.5 ? -60 * t / 0.5 : -60; }
var lu = IR.lundeby(dbC);
approx('lundeby noise = -60', lu.noiseDb, -60, 1e-6);
approx('lundeby trunc = 0.475 s', lu.truncIdx / 48000, 0.475, 1e-4);
approx('lundeby dyn = 60', lu.dynDb, 60, 1e-6);
assert('lundeby guards', IR.lundeby(new Float64Array(8)) === null && IR.lundeby(null) === null);

console.log('\nirStartIndex / schroederDb');
var ir3 = new Float64Array(10000);
for (i = 2000; i < 10000; i++) ir3[i] = Math.exp(-(i - 2000) / 2000);
assert('irStartIndex = 2000', IR.irStartIndex(ir3) === 2000);
assert('irStartIndex guards', IR.irStartIndex(null) === 0 && IR.irStartIndex(new Float64Array(0)) === 0);
var db3 = IR.schroederDb(ir3, 2000);
assert('schroederDb db[0] = 0', db3[0] === 0);
var mono = true;
for (i = 1; i < db3.length; i++) if (db3[i] > db3[i - 1] + 1e-9) { mono = false; break; }
assert('schroederDb 单调不增', mono);
assert('schroederDb 零能量 → null', IR.schroederDb(new Float64Array(100), 0) === null);

console.log('\nlimitBand FFT 带限');
var lim = IR.limitBand(irTrue, sr, 100, 12000);
var lo = bandEnergy(lim, 0, 50), hi = bandEnergy(lim, 100, 12000);
assert('limitBand 带外抑制 > 20 dB', 10 * Math.log10(lo / hi) < -20);
var passIn = bandEnergy(irTrue, 200, 8000), passOut = bandEnergy(lim, 200, 8000);
approx('limitBand 通带透明（能量比 ~1）', passOut / passIn, 1, 0.1);
assert('limitBand guards', IR.limitBand(null, sr, 100, 12000) === null && IR.limitBand(irTrue, 0, 100, 12000) === null);

console.log('\nanalyzeIr guards / 返回结构');
assert('analyzeIr(null) → null', IR.analyzeIr(null, sr) === null);
assert('analyzeIr(全零) → null', IR.analyzeIr(new Float64Array(1000), sr) === null);
var shape = an2;
assert('analyzeIr 字段齐全', shape.startIdx != null && shape.curveDb && shape.sampleRate === sr &&
  shape.noiseDb != null && shape.dynDb != null && shape.truncIdx != null &&
  shape.edt && shape.t20 && shape.t30);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
