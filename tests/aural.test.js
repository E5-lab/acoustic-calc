/*
 * aural.test.js - 声学可听化内核 (node tests/aural.test.js)
 *
 * 覆盖：FFT 正/逆变换自洽、倍频带频谱整形（整形后实测谱与目标谱一致）、
 * 隔声衰减逐带准确性、合成脉冲响应的混响时间回归、FFT 卷积、A 计权降噪量、
 * WAV 编码、以及干信号合成的可复现性。
 */
var A = require('../public/js/aural.js');
var S = require('../public/js/sim.js');

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

console.log('[1] 常量与预设');
assert('NB = 6', A.NB === 6);
assert('BANDS = 125..4000', A.BANDS.join(',') === '125,250,500,1000,2000,4000');
assert('A 计权表 6 项', A.A_WEIGHT.length === 6);
approx('A 计权 1 kHz = 0 dB', A.A_WEIGHT[3], 0, 1e-9);
assert('A 计权低频为负（125 Hz = -16.1）', A.A_WEIGHT[0] === -16.1);
assert('隔声预设 >= 4 种', A.INSULATION_PRESETS.length >= 4);
assert('噪声源 >= 4 种', A.NOISE_SOURCES.length >= 4);
assert('每个隔声预设含 6 带 R', A.INSULATION_PRESETS.every(function (p) { return p.id && p.name && p.R.length === 6; }));
assert('每个噪声源含 6 带声压级', A.NOISE_SOURCES.every(function (n) { return n.id && n.name && n.levels.length === 6; }));
assert('隔声预设 R 随频率总体递增（质量定律）', A.INSULATION_PRESETS.every(function (p) {
  return p.R[5] > p.R[0];
}));

console.log('[2] 2 的幂与 FFT');
approx('nextPow2(1000)', A.nextPow2(1000), 1024, 0);
approx('nextPow2(1024)', A.nextPow2(1024), 1024, 0);
(function () {
  var N = 64, re = new Float64Array(N), im = new Float64Array(N);
  for (var i = 0; i < N; i++) re[i] = Math.sin(2 * Math.PI * 3 * i / N);
  A.fft(re, im, false);
  var mag = [];
  for (i = 0; i < N; i++) mag.push(Math.sqrt(re[i] * re[i] + im[i] * im[i]));
  var peak = mag.indexOf(Math.max.apply(null, mag));
  assert('FFT 在第 3 根谱线出现峰值', peak === 3 || peak === N - 3);
  var orig = [];
  for (i = 0; i < N; i++) orig.push(Math.sin(2 * Math.PI * 3 * i / N));
  var re2 = re.slice(), im2 = im.slice();
  A.fft(re2, im2, true);           // 逆变换内部已除以 N
  var err = 0;
  for (i = 0; i < N; i++) err = Math.max(err, Math.abs(re2[i] - orig[i]));
  assert('正变换 + 逆变换还原原信号（误差 < 1e-12）', err < 1e-12);
  var errIm = 0;
  for (i = 0; i < N; i++) errIm = Math.max(errIm, Math.abs(im2[i]));
  assert('实信号逆变换后虚部 ≈ 0', errIm < 1e-12);
})();

console.log('[3] 倍频带插值与 PSD 换算');
(function () {
  var f = [125, 250, 500, 1000, 2000, 4000], v = [10, 20, 30, 40, 50, 60];
  approx('带中心处取该带值 (1 kHz)', A.logInterpDb(1000, f, v), 40, 0.5);
  approx('带内近似恒定 (800 Hz)', A.logInterpDb(800, f, v), 40, 0.5);
  approx('带内近似恒定 (1200 Hz)', A.logInterpDb(1200, f, v), 40, 0.5);
  /* 过渡带以倍频带边界（几何中点）为中心，故边界处恰为两带中值 */
  approx('带边界 1414 Hz 恰为 1k/2k 中值', A.logInterpDb(1414, f, v), 45, 0.5);
  approx('带边界 707 Hz 恰为 500/1k 中值', A.logInterpDb(707, f, v), 35, 0.5);
  approx('低于首带取首带值', A.logInterpDb(60, f, v), 10, 0.5);
  approx('高于末带取末带值', A.logInterpDb(8000, f, v), 60, 0.5);
  var psd = A.bandLevelsToPsd([0, 0, 0, 0, 0, 0]);
  assert('PSD 换算给出 6 个值', psd.length === 6);
  assert('高频带 PSD 更低（带宽更宽）', psd[5] < psd[0]);
  approx('1 kHz PSD = -10lg(707) ≈ -28.5 dB', psd[3], -10 * Math.log10(1000 * (Math.pow(2, 0.5) - Math.pow(2, -0.5))), 0.01);
})();

console.log('[4] 频谱整形噪声：实测谱应回到目标谱');
(function () {
  var sr = 22050, target = A.NOISE_SOURCES[0].levels;
  var x = A.shapedNoise({ sr: sr, durSec: 2, spectrumDb: A.bandLevelsToPsd(target), seed: 21 });
  assert('样本数为 2 的幂且不短于时长', (x.length & (x.length - 1)) === 0 && x.length >= 2 * sr);
  var meas = A.bandLevels(x, sr);   // 返回以最强带为 0 dB 的相对谱
  assert('实测 6 带', meas && meas.length === 6);
  var worst = 0;
  for (var k = 0; k < 6; k++) {
    worst = Math.max(worst, Math.abs((meas[k] - meas[0]) - (target[k] - target[0])));
  }
  console.log('       目标(相对) ' + target.map(function (v) { return (v - target[0]).toFixed(1); }).join(' / ') +
    '   实测 ' + meas.map(function (v) { return (v - meas[0]).toFixed(1); }).join(' / '));
  assert('各带相对谱与目标相差 < 1.5 dB', worst < 1.5);
  assert('峰值归一化到 0.9', (function () {
    var mx = 0; x.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); return Math.abs(mx - 0.9) < 1e-3;
  })());
})();
(function () {
  var sr = 22050;
  var tone = new Float32Array(sr);
  for (var i = 0; i < sr; i++) tone[i] = Math.sin(2 * Math.PI * 1000 * i / sr);
  var lv = A.bandLevels(tone, sr);
  var k1k = lv.indexOf(Math.max.apply(null, lv));
  assert('1 kHz 纯音在 1 kHz 带最强', k1k === 3);
  assert('1 kHz 纯音在其他带明显更弱', lv[0] < lv[3] - 15 && lv[5] < lv[3] - 15);
})();

console.log('[5] 隔声衰减：逐带施加 -R 后，实测衰减应等于 R');
(function () {
  var sr = 22050, R = [20, 25, 30, 35, 40, 45];
  var x = A.shapedNoise({ sr: sr, durSec: 2, spectrumDb: A.bandLevelsToPsd([70, 70, 70, 70, 70, 70]), seed: 33 });
  var y = A.applyOctaveGains(x, R.map(function (r) { return -r; }), sr);
  var lb = A.bandLevels(x, sr), la = A.bandLevels(y, sr);
  /* bandLevels 是以最强带为 0 dB 的相对谱，故逐带比较须减去各自参考带 */
  var worst = 0;
  for (var k = 0; k < 6; k++) {
    worst = Math.max(worst, Math.abs((lb[k] - la[k]) - (R[k] - R[0])));
  }
  console.log('       设定 R ' + R.join(' / ') + '   实测(相对首带) ' +
    lb.map(function (v, k) { return (v - la[k]).toFixed(1); }).join(' / '));
  assert('逐带衰减与设定 R（相对首带）相差 < 0.6 dB', worst < 0.6);
  /* 平直谱下，总降噪量 = -10lg(mean(10^(-R/10)))；用实际能量验证（rmsDb 不受相对化影响） */
  var flat = Math.abs(lb[5] - lb[0]) < 1.0;
  assert('声源谱基本平直（便于解析核对）', flat);
  var wantDrop = -10 * Math.log10(R.reduce(function (a, r) { return a + Math.pow(10, -r / 10); }, 0) / 6);
  approx('实际能量降噪量 = 理论值', A.rmsDb(x) - A.rmsDb(y), wantDrop, 1.2);
  approx('linReduction 与理论值一致', A.linReduction(lb, R), wantDrop, 1.2);
  assert('R 全为 0 时降噪量 = 0 dB', Math.abs(A.linReduction(lb, [0, 0, 0, 0, 0, 0])) < 1e-9);
  assert('R 全相同 d 时线性降噪量 = d', Math.abs(A.linReduction(lb, [10, 10, 10, 10, 10, 10]) - 10) < 0.01);
  /* A 计权压低 125 Hz（−16.1 dB）：只隔低频时 A 计权降噪量应小于线性降噪量 */
  var rLo = [50, 0, 0, 0, 0, 0];
  console.log('       仅隔低频：线性 ' + A.linReduction(lb, rLo).toFixed(1) +
    ' dB / A 计权 ' + A.awReduction(lb, rLo).toFixed(1) + ' dB');
  assert('A 计权压低低频 -> 仅隔低频时 A 计权降噪量更小',
    A.awReduction(lb, rLo) < A.linReduction(lb, rLo));
  var rHi = [0, 0, 0, 0, 0, 50];
  console.log('       仅隔高频：线性 ' + A.linReduction(lb, rHi).toFixed(1) +
    ' dB / A 计权 ' + A.awReduction(lb, rHi).toFixed(1) + ' dB');
  assert('A 计权略抬 4 kHz -> 仅隔高频时 A 计权降噪量更大',
    A.awReduction(lb, rHi) > A.linReduction(lb, rHi));
})();

console.log('[6] 合成脉冲响应的混响时间回归');
[0.6, 1.0, 1.8].forEach(function (rt) {
  var sr = 22050;
  var ir = A.irFromRT([rt, rt, rt, rt, rt, rt], { sr: sr, seed: 99, directGain: 0 });
  assert('IR 长度 > 0', ir && ir.data && ir.data.length > 0);
  var d = ir.data, nb = 100, binMs = 20, bins = new Float64Array(nb);
  for (var i = 0; i < d.length; i++) {
    var b = Math.floor(i / sr * 1000 / binMs);
    if (b >= 0 && b < nb) bins[b] += d[i] * d[i];
  }
  var r = S.rtFromSchroeder(bins, binMs);
  var ok = r.ok && r.t30 != null && Math.abs(r.t30 - rt) < 0.15;
  if (ok) passed++; else failed++;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  设定 RT = ' + rt.toFixed(2) + ' s，IR 实测 T30 = ' +
    (r.t30 == null ? '—' : r.t30.toFixed(3)) + ' s');
});
(function () {
  var ir = A.irFromRT([0.3, 0.4, 0.5, 0.6, 0.7, 0.8], { sr: 22050, seed: 5 });
  assert('逐带不同 RT 也能合成', ir && ir.data.length > 0);
  assert('峰值不超过 1', (function () {
    var mx = 0; ir.data.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); return mx <= 1.0001;
  })());
  assert('缺输入时用默认 RT', A.irFromRT(null, { sr: 22050 }).data.length > 0);
})();

console.log('[7] 由回波合成脉冲响应');
(function () {
  var m = S.buildRoom({ width: 12, depth: 8, height: 3.2, alpha: 0.2 });
  var tr = S.traceBox(m, { source: { x: 2, y: 4, z: 1.5 }, nRays: 800, scatter: 0.35, seed: 202 });
  var ec = S.receiverBands(tr.rays, { x: 10, y: 4, z: 1.2 }, { radius: 0.8, model: m });
  var ir = A.irFromEchogram(ec, { sr: 22050, seed: 7 });
  assert('回波 -> IR 合成成功', ir && ir.data && ir.data.length > 0);
  var mx = 0; ir.data.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
  assert('IR 峰值归一化到 <= 1', mx <= 1.0001 && mx > 0.1);
  assert('IR 长度为 2 的幂', (ir.data.length & (ir.data.length - 1)) === 0);
  assert('空回波 -> null', A.irFromEchogram(null, {}) === null);
  assert('全零回波 -> null', A.irFromEchogram({ binMs: 10, nb: 20, bins: new Float32Array(120) }, {}) === null);
})();

console.log('[8] FFT 快速卷积');
(function () {
  var sr = 22050;
  var x = A.clap(sr, 0.2, 3);
  var ir = A.irFromRT([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { sr: sr, seed: 8, directGain: 0 });
  var y = A.convolve(x, ir.data);
  assert('卷积结果长度 = len(x) + len(ir) - 1', y.length === x.length + ir.data.length - 1);
  var mx = 0; y.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
  approx('卷积结果峰值归一化到 0.95', mx, 0.95, 0.01);
  /* 与单位脉冲卷积应还原原信号（x 已归一到 0.95，卷积亦归一到 0.95，故应逐点相等） */
  var delta = new Float32Array(64); delta[0] = 1;
  var z = A.convolve(delta, x);
  var err = 0;
  for (var i = 0; i < x.length; i++) err = Math.max(err, Math.abs(z[i] - x[i]));
  assert('与 δ 卷积等价于原信号（误差 < 1e-6）', err < 1e-6);
  assert('空输入 -> null', A.convolve(new Float32Array(0), ir.data) === null);
  assert('缺参数 -> null', A.convolve(null, ir.data) === null);
})();

console.log('[9] 干信号合成');
(function () {
  var sr = 22050;
  var c = A.clap(sr, 0.3, 11), c2 = A.clap(sr, 0.3, 11);
  assert('拍手信号长度 = 0.3 s × sr', Math.abs(c.length - Math.round(0.3 * sr)) <= 1);
  var same = true;
  for (var i = 0; i < c.length; i++) if (Math.abs(c[i] - c2[i]) > 1e-12) { same = false; break; }
  assert('同种子可复现（不再依赖 Math.random）', same);
  var mx = 0; c.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); });
  approx('拍手信号峰值归一化到 0.95', mx, 0.95, 0.01);
  var s1 = A.syllables(sr, 5), s2 = A.syllables(sr, 5);
  assert('音节信号长度 > 1 s', s1.length > sr);
  var same2 = true;
  for (i = 0; i < s1.length; i++) if (Math.abs(s1[i] - s2[i]) > 1e-12) { same2 = false; break; }
  assert('音节信号同种子可复现', same2);
  assert('rmsDb 全零 -> 极小值', A.rmsDb(new Float32Array(100)) < -100);
  assert('rmsDb 空输入 -> -Infinity', A.rmsDb(null) === -Infinity);
  var tone = new Float32Array(4096);
  for (i = 0; i < 4096; i++) tone[i] = Math.sin(2 * Math.PI * 440 * i / sr);
  approx('rmsDb(满幅正弦) ≈ -3.01 dB', A.rmsDb(tone), -3.01, 0.15);
  var np = new Float32Array([0, 2, -4]);
  A.normalizePeak(np, 0.8);
  approx('normalizePeak 峰值 = 0.8', Math.max.apply(null, Array.prototype.map.call(np, Math.abs)), 0.8, 1e-6);
})();

console.log('[10] WAV 编码');
(function () {
  var sr = 22050;
  var x = A.clap(sr, 0.2, 3);
  var w = A.wavEncode(x, sr);
  assert('字节数 = 44 + 2N', w.length === 44 + x.length * 2);
  function tag(off) { return String.fromCharCode(w[off], w[off + 1], w[off + 2], w[off + 3]); }
  assert('RIFF 头', tag(0) === 'RIFF');
  assert('WAVE 标识', tag(8) === 'WAVE');
  assert('fmt  块', tag(12) === 'fmt ');
  assert('data 块', tag(36) === 'data');
  var dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
  assert('PCM 格式 = 1', dv.getUint16(20, true) === 1);
  assert('单声道', dv.getUint16(22, true) === 1);
  assert('采样率写入正确', dv.getUint32(24, true) === sr);
  assert('位深 = 16', dv.getUint16(34, true) === 16);
  assert('data 长度 = 2N', dv.getUint32(40, true) === x.length * 2);
  var v0 = dv.getInt16(44, true);
  approx('首样本回读一致', v0 / 32767, x[0], 0.001);
  var big = new Float32Array([5, -5]);
  var wb = A.wavEncode(big, sr);
  var dvb = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  assert('过载样本被限幅到 ±32767', Math.abs(dvb.getInt16(44, true)) === 32767);
})();

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
