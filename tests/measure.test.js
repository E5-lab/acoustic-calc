/*
 * measure.test.js - 声学测量共享内核（node tests/measure.test.js）
 * 覆盖：A/C 计权解析式与经典表一致性、FFT 分带功率、Leq 累积、校准偏移。
 */
var M = require('../public/js/measure.js');
var D = require('../public/js/dbcalc.js');
var SG = require('../public/js/siggen.js');
var Aural = require('../public/js/aural.js');

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

console.log('A/C weighting analytic formula vs classic octave table');
approx('weightA(1000) = 0', M.weightA(1000), 0, 0.01);
approx('weightA(100) ~ -19.1', M.weightA(100), -19.1, 0.1);
approx('weightA(125) ~ -16.1', M.weightA(125), -16.1, 0.1);
approx('weightA(8000) ~ -1.1', M.weightA(8000), -1.1, 0.1);
D.OCT.forEach(function (fc, i) {
  if (fc < 31.5 || fc > 16000) return;
  var idx = D.WEIGHT.freq.indexOf(fc);
  approx('weightA(' + fc + ') vs table ' + D.WEIGHT.A[idx], M.weightA(fc), D.WEIGHT.A[idx], 0.15);
});
approx('weightC(1000) ~ 0', M.weightC(1000), 0, 0.15);
approx('weightC(63) ~ -0.8', M.weightC(63), -0.8, 0.2);
assert('weightAt Z = 0', M.weightAt(1000, 'Z') === 0);
assert('thirdWeights length 31', M.thirdWeights('A').length === 31);
approx('thirdWeights A at 100 Hz', M.thirdWeights('A')[7], -19.1, 0.1);
assert('octaveWeights length 10', M.octaveWeights('A').length === 10);
approx('octaveWeights A at 1 kHz', M.octaveWeights('A')[5], 0, 0.01);
assert('bandEdges(1000)', Math.abs(M.bandEdges(1000)[0] - 707.1) < 0.5 && Math.abs(M.bandEdges(1000)[1] - 1414.2) < 0.5);

console.log('\nFFT spectrum -> band powers (1 kHz sine, on-bin, rectangular)');
var sr = 48000, N = 4096;
var bin1k = Math.round(1000 * N / sr);          // 85
var fExact = bin1k * sr / N;                    // 996.09 Hz，落在 1k 倍频带内
var sine = SG.sine(N, sr, fExact, 0.5, 0);
var re = new Float64Array(N), im = new Float64Array(N);
for (var i = 0; i < N; i++) re[i] = sine[i];
Aural.fft(re, im, false);
var mag = new Float64Array(N / 2 + 1);
for (i = 0; i <= N / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
var pw = M.spectrumBandPowers(mag, sr, N, M.OCTAVE);
assert('octave band powers length 10', pw.length === 10);
approx('1k band power ~ (0.5/sqrt2)^2 = 0.125', pw[5], 0.125, 0.005);
assert('neighbour bands ~ 0', pw[4] < 1e-6 && pw[6] < 1e-6 && pw[3] < 1e-6);
var pw3 = M.spectrumBandPowers(mag, sr, N, M.THIRD, 1 / 3);
assert('third band powers length 31', pw3.length === 31);
approx('1k third band power ~ 0.125', pw3[17], 0.125, 0.005);
assert('third neighbour bands ~ 0', pw3[16] < 1e-6 && pw3[18] < 1e-6 && pw3[15] < 1e-6);
assert('bandEdges third(1000)', Math.abs(M.bandEdges(1000, 1 / 3)[0] - 891.3) < 0.5 && Math.abs(M.bandEdges(1000, 1 / 3)[1] - 1122.5) < 0.5);

console.log('\nWeighted band level & rmsToSpl');
approx('weightedBandLevel single 1k band = -9.03 dB', M.weightedBandLevel(pw, M.octaveWeights('Z'), 0), 10 * Math.log10(0.125), 0.01);
approx('A-weighted = same (A weight 0 at 1k)', M.weightedBandLevel(pw, M.octaveWeights('A'), 0), 10 * Math.log10(0.125), 0.01);
approx('rmsToSpl(1.0024 Pa) = 94 dB', M.rmsToSpl(1.0024, 0), 94, 0.05);
approx('rmsToSpl with calib -2.5', M.rmsToSpl(1.0024, -2.5), 91.5, 0.05);
assert('rmsToSpl(0) = null', M.rmsToSpl(0, 0) === null);
approx('framePower of 0.5 sine ~ 0.125', M.framePower(sine), 0.125, 0.002);

console.log('\nLeq accumulator');
var st = M.createLeq();
var framePw = M.OCTAVE.map(function (_, i) { return i === 5 ? 0.125 : 0; });
for (var f = 0; f < 100; f++) M.pushLeq(st, framePw, 0.01);
var bands = M.leqBands(st, 0);
approx('Leq(1k band) = -9.03 dB', bands[5], 10 * Math.log10(0.125), 0.01);
var sum = M.leqSummary(st, { Z: M.octaveWeights('Z'), A: M.octaveWeights('A'), C: M.octaveWeights('C') }, 0);
approx('summary LA = -9.03', sum.LA, 10 * Math.log10(0.125), 0.01);
approx('summary seconds = 1', sum.seconds, 1, 1e-9);
M.pushPeak(st, Math.sqrt(0.25), 0);
var sum2 = M.leqSummary(st, { Z: M.octaveWeights('Z'), A: M.octaveWeights('A'), C: M.octaveWeights('C') }, 0);
approx('Lmax ~ 94 dB (rms 0.5)', sum2.Lmax, 20 * Math.log10(0.5 / 20e-6), 0.01);
var empty = M.createLeq();
assert('leqSummary(empty) = null', M.leqSummary(empty, null, 0) === null);
assert('pushLeq guards', M.pushLeq(null, framePw, 0.01) === undefined);

console.log('\nWeighted level with mixed bands');
var pw2 = M.OCTAVE.map(function (_, i) { return i === 3 ? 0.01 : (i === 5 ? 0.01 : 0); }); // 250 + 1k 各 -20 dB
var LZ = M.weightedBandLevel(pw2, M.octaveWeights('Z'), 0);
approx('250+1k equal power -> -17.0 dB', LZ, 10 * Math.log10(0.02), 0.01);
var LA = M.weightedBandLevel(pw2, M.octaveWeights('A'), 0);
approx('A-weighted (250 带 -8.6) -> -17.27 dB', LA, 10 * Math.log10(0.01 * Math.pow(10, -8.6 / 10) + 0.01), 0.01);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
