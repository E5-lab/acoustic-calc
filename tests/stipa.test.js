/*
 * stipa.test.js - STIPA 语言传输指数实测内核（node tests/stipa.test.js）
 * 覆盖：调制分配表完整性、包络深度精确频率投影、Hilbert 包络
 *       （共轭对称回归）、分析带通、MTF→SNR→STI 映射、评级边界、
 *       全信号干净链路 STI≈1、衰场房间 STI 下降。
 * 注：全链路用例时长约 15 s（7 带 × 2 调制频率投影）。
 */
var ST = require('../public/js/stipa.js');
var SG = require('../public/js/siggen.js');
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
function maxabs(x) { var m = 0; for (var i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }
function bandEnergy(x, f1, f2) {
  var n = x.length, N = AU.nextPow2(n);
  var re = new Float64Array(N), im = new Float64Array(N);
  for (var i = 0; i < n; i++) re[i] = x[i];
  AU.fft(re, im, false);
  var s = 0;
  for (var k = 1; k <= N / 2; k++) { var f = k * sr / N; if (f >= f1 && f < f2) s += re[k] * re[k] + im[k] * im[k]; }
  return s;
}
/* 指数衰减白噪 IR */
function expIr(n, rt60, seed) {
  var ir = SG.white(n, seed), tau = rt60 / 6.9078;
  for (var i = 0; i < n; i++) ir[i] *= Math.exp(-i / (tau * sr));
  return ir;
}

console.log('tables (IEC 60268-16 Annex F 口径)');
assert('BANDS = 7 个倍频带 125–8k', ST.BANDS.length === 7 && ST.BANDS[0] === 125 && ST.BANDS[6] === 8000);
var flat = ST.MOD_MATRIX.reduce(function (a, b) { return a.concat(b); }, []);
assert('MOD_MATRIX 共 14 个调制频率', flat.length === 14 && ST.MOD_FREQS.length === 14);
var coverOk = ST.MOD_FREQS.every(function (f) {
  return flat.filter(function (v) { return v === f; }).length === 1;
});
assert('14 个调制频率各出现恰好一次', coverOk);
var wSum = ST.W_MALE.reduce(function (a, b) { return a + b; }, 0);
approx('W_MALE 合计 1.381', wSum, 1.381, 1e-9);
assert('MOD_DEPTH = 0.5', ST.MOD_DEPTH === 0.5);

console.log('\nenvelopeDepthAt 精确频率投影');
var nE = sr * 8;
var envSig = new Float64Array(nE);
for (var i = 0; i < nE; i++) envSig[i] = 1 + 0.4 * Math.cos(2 * Math.PI * 2.5 * i / sr);
approx('纯余弦深度 = 0.4', ST.envelopeDepthAt(envSig, sr, 2.5).depth, 0.4, 0.005);
assert('off-freq 深度 ~ 0', ST.envelopeDepthAt(envSig, sr, 5.7).depth < 0.01);
var g = ST.envelopeDepthAt(new Float64Array(8), sr, 2.5);
assert('envelopeDepthAt 短信号 guards', g.depth === 0 && g.snrLin === 0);

console.log('\nenvelope (Hilbert 共轭对称回归)');
var am = new Float64Array(sr);
for (i = 0; i < am.length; i++) {
  var t = i / sr;
  am[i] = (1 + 0.5 * Math.cos(2 * Math.PI * 2.5 * t)) * Math.cos(2 * Math.PI * 1000 * t);
}
var env = ST.envelope(am);
var envMean = 0; for (i = 0; i < env.length; i++) envMean += env[i];
approx('包络均值 ≈ 载波幅度 1.0（纯 Hilbert 实现时为 2/π≈0.632）', envMean / env.length, 1, 0.02);
approx('AM 深度 = 0.5', ST.envelopeDepthAt(env, sr, 2.5).depth, 0.5, 0.02);

console.log('\nbandpass 分析带通 (fc = 1 kHz)');
/* 测量口径：4800 样点矩形窗 FFT 滤波，阻带残余为窗泄漏物理下限。
 * 用总能量比（不用 ±1 Hz 窄带——8192 栅格间距 5.86 Hz，±1 Hz 可能
 * 一个 bin 都不含导致 0/0 = NaN）。 */
function totalEnergy(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i] * x[i]; return s; }
function passRatioDb(f) {
  var x = SG.sine(4800, sr, f, 0.7, 0);
  var bp = ST.bandpass(x, sr, 1000);
  return 10 * Math.log10(totalEnergy(bp) / totalEnergy(x));
}
assert('800 Hz（通带内）衰减 < 1 dB', passRatioDb(800) > -1);
assert('1400 Hz（通带内）衰减 < 1 dB', passRatioDb(1400) > -1);
assert('600 Hz（阻带）衰减 > 20 dB', passRatioDb(600) < -20);
assert('4000 Hz（阻带）衰减 > 20 dB', passRatioDb(4000) < -20);

console.log('\nsnrApparent / stiFromMtf / rating');
approx('snrApparent(0.5) = 0 dB', ST.snrApparent(0.5), 0, 0.01);
approx('snrApparent(0.9) = 9.54 dB', ST.snrApparent(0.9), 9.5424, 0.01);
assert('snrApparent 上限 +15 dB', ST.snrApparent(0.99999) === 15 && ST.snrApparent(1) === 15);
assert('snrApparent 下限 -15 dB', ST.snrApparent(0.00001) === -15 && ST.snrApparent(0) === -15);
var allHalf = ST.BANDS.map(function () { return [0.5, 0.5]; });
approx('stiFromMtf 全 0.5 → 0.5', ST.stiFromMtf(allHalf).sti, 0.5, 1e-9);
var allOne = ST.BANDS.map(function () { return [1, 1]; });
approx('stiFromMtf 全 1 → 1', ST.stiFromMtf(allOne).sti, 1, 1e-9);
var allZero = ST.BANDS.map(function () { return [0, 0]; });
approx('stiFromMtf 全 0 → 0', ST.stiFromMtf(allZero).sti, 0, 1e-9);
assert('stiFromMtf bandSnr 长度 7', ST.stiFromMtf(allHalf).bandSnr.length === 7);
assert('stiFromMtf 长度不符 → null', ST.stiFromMtf([[0.5, 0.5]]) === null);
[[0.29, 'bad', '不合格'], [0.30, 'poor', '差'], [0.44, 'poor', '差'], [0.45, 'fair', '一般'],
[0.59, 'fair', '一般'], [0.60, 'good', '良好'], [0.74, 'good', '良好'], [0.75, 'excellent', '优秀'],
[1.0, 'excellent', '优秀']].forEach(function (r) {
  var got = ST.rating(r[0]);
  assert('rating(' + r[0] + ') = ' + r[2], got.level === r[1] && got.label === r[2]);
});
assert('rating(null) → null', ST.rating(null) === null && ST.rating(NaN) === null);

console.log('\nSTIPA 信号生成');
assert('signal guards', ST.signal(0, sr) === null && ST.signal(-1, sr) === null);
var sig = ST.signal(sr * 8, sr, 5);
assert('signal 长度 = n', sig.length === sr * 8);
approx('signal 峰值 = 0.89', maxabs(sig), 0.89, 0.001);
var sig2 = ST.signal(sr * 8, sr, 5);
assert('signal 确定性（同种子）', sig[12345] === sig2[12345]);
var es = ST.BANDS.map(function (fc) { return bandEnergy(sig, fc / Math.SQRT2, fc * Math.SQRT2); });
var eMean = es.reduce(function (a, b) { return a + b; }, 0) / es.length;
var balOk = es.every(function (e) { return Math.abs(10 * Math.log10(e / eMean)) <= 5; });
assert('7 个载波带能量均衡（±5 dB 内）', balOk);

console.log('\n全链路：干净信号 → STI ≈ 1');
var rc = ST.analyze(sig, sr);
approx('干净 STI > 0.95', rc.sti, 1, 0.05);
assert('干净评级 = 优秀', rc.rating.label === '优秀');
var mtfMin = Math.min.apply(null, rc.mtf.map(function (m) { return Math.min(m[0], m[1]); }));
assert('各带 MTF ≥ 0.97（无载波泄漏稀释）', mtfMin >= 0.97);

console.log('\n全链路：RT60 = 0.5 s 衰场 → STI 下降');
var room = AU.convolve(sig, expIr(sr, 0.5, 31));
var rd = ST.analyze(room.subarray(0, sig.length), sr);
assert('衰场 STI ∈ [0.50, 0.68]（理论 ~0.57）', rd.sti >= 0.5 && rd.sti <= 0.68);
assert('衰场评级 ∈ {一般, 良好}', rd.rating.level === 'fair' || rd.rating.level === 'good');
assert('衰场 STI 明显低于干净场景', rd.sti < rc.sti - 0.2);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
