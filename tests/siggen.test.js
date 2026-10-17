/*
 * siggen.test.js - 测量信号生成内核（node tests/siggen.test.js）
 * 覆盖：白/粉噪统计与谱倾斜、正弦、对数扫频（解析信号瞬时频率校核）、
 *       倍频带限噪声（带内外能量比 + skirt 外硬置零回归）、峰值归一化。
 */
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
/* 频带能量（零填充到 2 的幂——aural.fft 对非幂长度输出垃圾） */
function bandEnergy(x, f1, f2) {
  var n = x.length, N = AU.nextPow2(n);
  var re = new Float64Array(N), im = new Float64Array(N);
  for (var i = 0; i < n; i++) re[i] = x[i];
  AU.fft(re, im, false);
  var s = 0;
  for (var k = 1; k <= N / 2; k++) { var f = k * sr / N; if (f >= f1 && f < f2) s += re[k] * re[k] + im[k] * im[k]; }
  return s;
}
/* 解析信号瞬时频率（Hilbert）：相邻样本解析相位差 × sr/2π。
 * 不用短窗过零计数——对数扫频在窗口内频率快速上升，短窗计数有系统性
 * 偏差（实测起点 32.2 Hz vs 真值 20 Hz）。 */
function instFreq(x, idx) {
  var n = x.length, N = AU.nextPow2(n);
  var re = new Float64Array(N), im = new Float64Array(N);
  for (var i = 0; i < n; i++) re[i] = x[i];
  AU.fft(re, im, false);
  for (var k = 1; k < N / 2; k++) { re[N - k] = 0; im[N - k] = 0; }
  AU.fft(re, im, true);
  var p0 = Math.atan2(im[idx], re[idx]);
  var p1 = Math.atan2(im[idx + 1], re[idx + 1]);
  var d = p1 - p0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d * sr / (2 * Math.PI);
}

console.log('white noise');
var w1 = SG.white(1 << 16, 7), w2 = SG.white(1 << 16, 7);
assert('white deterministic (same seed)', w1[12345] === w2[12345] && w1[0] === w2[0]);
assert('white seed varies output', SG.white(1 << 16, 8)[12345] !== w1[12345]);
assert('white Float64Array of length n', w1.length === 65536 && w1.BYTES_PER_ELEMENT === 8);
var wm = 0; for (var i = 0; i < w1.length; i++) wm += w1[i];
approx('white mean ~ 0', wm / w1.length, 0, 0.02);
assert('white |x| <= 1', maxabs(w1) <= 1);
var tiltW = 10 * Math.log10(bandEnergy(w1, 62.5, 125) / bandEnergy(w1, 4000, 8000));
approx('white tilt (low octave / high octave) ~ -18.06 dB', tiltW, -18.06, 1.5);

console.log('\npink noise');
var p1 = SG.pink(1 << 16, 7);
approx('pink peak = 0.89', maxabs(p1), 0.89, 0.001);
var tiltP = 10 * Math.log10(bandEnergy(p1, 62.5, 125) / bandEnergy(p1, 4000, 8000));
approx('pink tilt (equal energy per octave) ~ 0 dB', tiltP, 0, 1.0);
assert('pink vs white tilt differ > 10 dB', tiltP - tiltW > 10);

console.log('\nsine');
var s1 = SG.sine(4800, sr, 1000, 0.8, 0);
approx('sine peak = amp', maxabs(s1), 0.8, 1e-9);
/* 线性插值过零点测频（对数组边界截断稳健，无需整数周期） */
var zc = 0, tFirst = 0, tLast = 0;
for (i = 1; i < s1.length; i++) {
  if ((s1[i - 1] < 0) !== (s1[i] < 0)) {
    var tf = (i - 1) + s1[i - 1] / (s1[i - 1] - s1[i]);
    if (zc === 0) tFirst = tf; else tLast = tf;
    zc++;
  }
}
approx('sine zero-cross freq = 1000 Hz', (zc - 1) / 2 / ((tLast - tFirst) / sr), 1000, 1e-6);
var s2 = SG.sine(4800, sr, 1000, 0.8, Math.PI / 2);
approx('sine phase π/2 starts at +amp', s2[0], 0.8, 1e-9);
var s3 = SG.sine(100, sr, 1000);
approx('sine default amp = 0.8', maxabs(s3), 0.8, 1e-9);

console.log('\nlog sweep (ESS)');
var sw = SG.logSweep(96000, sr, 20, 20000);
assert('sweep length', sw.length === 96000);
approx('sweep peak = 0.89', maxabs(sw), 0.89, 0.001);
assert('sweep fade ends exactly 0', sw[0] === 0 && sw[95999] === 0);
assert('sweep guards (f2<=f1 / n<=0)', SG.logSweep(1000, sr, 100, 50) === null &&
  SG.logSweep(0, sr, 20, 20000) === null && SG.logSweep(-5, sr, 20, 20000) === null);
/* 瞬时频率 = f1·(f2/f1)^(t/T)，解析相位导数法（容差 2% 相对误差） */
[[0.25, 47.43], [0.5, 112.47], [1.0, 632.46], [1.5, 3556.56], [1.9, 14158.92]].forEach(function (p) {
  var t = p[0], want = p[1];
  approx('sweep instFreq @' + t + 's = ' + want.toFixed(1) + ' Hz', instFreq(sw, Math.round(t * sr)), want, want * 0.02);
});

console.log('\nband-limited noise');
var bn = SG.bandNoise(1 << 16, sr, 1000, -24, 5);
approx('bandNoise peak = 0.5', maxabs(bn), 0.5, 0.001);
var inE = bandEnergy(bn, 700, 1414), outE = bandEnergy(bn, 100, 400) + bandEnergy(bn, 3000, 9000);
assert('bandNoise in/out > 100 dB (skirt 外硬置零回归)', 10 * Math.log10(inE / outE) > 100);
assert('bandNoise deterministic', SG.bandNoise(4096, sr, 1000, -24, 5)[100] === SG.bandNoise(4096, sr, 1000, -24, 5)[100]);
/* STIPA 载波配置（shrink=1.06 + edgeRatio=1.01 + -40 dB）：
 * 4k 载波能量应留在本带分析通带内，不得泄入 8k 分析通带 */
var car4k = SG.bandNoise(1 << 16, sr, 4000, -40, 5, { shrink: 1.06, edgeRatio: 1.01 });
var own = bandEnergy(car4k, 4000 / Math.SQRT2, 4000 * Math.SQRT2);
var leak = bandEnergy(car4k, 8000 / Math.SQRT2, 8000 * Math.SQRT2);
assert('STIPA carrier 4k→8k leakage < -30 dB', 10 * Math.log10(leak / own) < -30);

console.log('\nnormalizePeak');
var t1 = new Float64Array([1, -2, 0.5]);
SG.normalizePeak(t1, 0.5);
approx('normalizePeak scales max to peak', maxabs(t1), 0.5, 1e-12);
var t2 = new Float64Array(10);
assert('normalizePeak zero-array untouched', SG.normalizePeak(t2, 0.5)[3] === 0);
var t3 = new Float64Array([1, -2]);
SG.normalizePeak(t3);
approx('normalizePeak default peak 0.89', maxabs(t3), 0.89, 1e-12);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
