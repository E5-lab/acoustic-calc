/*
 * sim-fourier.test.js - 傅里叶波形合成与频谱泄漏（含窗函数）内核 (node tests/sim-fourier.test.js)
 *
 * 覆盖：谐波叠加解析值、Gibbs 过冲、收敛性（RMS 误差）、窗函数端点与相干增益、
 * 直接 DFT（直流 / Parseval / 整 bin 单频 / 幅度校正）、频谱泄漏与主瓣零点、
 * 混叠判定、simulate 主入口与输入校验。
 */
var S = require('../public/js/sim-fourier.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(6)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (+-' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

var PI = Math.PI;
var f0 = 100;
function tAt(th) { return th / (2 * PI * f0); } // 使 2πf₀t = θ 的时刻（f₀ = 100 Hz）

console.log('[1] 谐波叠加解析值（θ = 2πf₀t）');
var sq1 = S.synth({ kind: 'square', N: 1, f0: f0, samples: 2048 });
approx('方波 N=1 峰值 = 4/π = 1.27324', sq1.overshoot, 4 / PI, 1e-4);
approx('三角波 N=1 峰值 = 8/π² = 0.81057', S.synth({ kind: 'triangle', N: 1, f0: f0, samples: 2048 }).overshoot, 8 / (PI * PI), 1e-4);
approx('方波 N=1 在 θ=π/2：(4/π)·sin(π/2)', S.waveform('square', 1, f0, tAt(PI / 2)), 4 / PI, 1e-9);
approx('方波 N=3 在 θ=π/4：(4/π)(sin π/4 + sin 3π/4 / 3)',
  S.waveform('square', 3, f0, tAt(PI / 4)), (4 / PI) * (Math.SQRT1_2 + Math.SQRT1_2 / 3), 1e-9);
approx('锯齿 N=1 在 θ=π/2：(2/π)·sin(π/2)', S.waveform('saw', 1, f0, tAt(PI / 2)), 2 / PI, 1e-9);
approx('三角 N=1 在 θ=π/2 = 8/π²', S.waveform('triangle', 1, f0, tAt(PI / 2)), 8 / (PI * PI), 1e-9);
approx('整流正弦 N=1 在 θ=π/2：2/π + (4/π)/3', S.waveform('rectified', 1, f0, tAt(PI / 2)), 2 / PI + (4 / PI) / 3, 1e-9);
approx('整流正弦 N=64 在 θ=π/2 → |sin| = 1', S.waveform('rectified', 64, f0, tAt(PI / 2)), 1, 0.01);
approx('整流正弦 N=64 在 θ=0 → |sin| = 0', S.waveform('rectified', 64, f0, tAt(0)), 0, 0.01);
approx('理想方波 θ=π/4 → +1', S.idealWaveform('square', f0, tAt(PI / 4)), 1, 1e-12);
approx('理想方波 θ=−π/4 → −1', S.idealWaveform('square', f0, tAt(-PI / 4)), -1, 1e-12);
approx('理想锯齿 θ=π/2 → θ/π = 0.5', S.idealWaveform('saw', f0, tAt(PI / 2)), 0.5, 1e-12);
approx('理想三角 θ=π/2 → 1', S.idealWaveform('triangle', f0, tAt(PI / 2)), 1, 1e-12);
approx('整流正弦理想值 θ=π/3 → |sin| = √3/2', S.idealWaveform('rectified', f0, tAt(PI / 3)), Math.sqrt(3) / 2, 1e-12);
approx('谐波幅度 square k=1 → 4/π', S.harmonicAmp('square', 1), 4 / PI, 1e-12);
approx('谐波幅度 square k=2（偶次）→ 0', S.harmonicAmp('square', 2), 0, 1e-15);
approx('谐波幅度 saw k=2 → −(2/π)/2', S.harmonicAmp('saw', 2), -(2 / PI) / 2, 1e-12);
approx('谐波幅度 triangle k=3 → −(8/π²)/9', S.harmonicAmp('triangle', 3), -(8 / (PI * PI)) / 9, 1e-12);
assert('非法波形类型返回 null', S.waveform('sine', 5, f0, 0) === null);

console.log('\n[2] Gibbs 过冲（方波，N = 1,3,5,…,51）');
// 说明：方波部分和的峰值自 4/π = 1.2732 起**单调不增**地趋近 Gibbs 极限 1.17898，
//       即恒 ≥1.17898、恒 ≤4/π（与「单调不减」相反，见内核注释）。
var GIBBS = (2 / PI) * 1.851937; // (2/π)·Si(π) ≈ 1.17898
var prevOv = Infinity, monoOK = true, N;
for (N = 1; N <= 51; N += 2) {
  var ov = S.synth({ kind: 'square', N: N, f0: f0, samples: 2048 }).overshoot;
  if (ov > prevOv + 1e-12) monoOK = false;
  assert('N=' + N + ' 过冲 ' + ov.toFixed(6) + ' 单调不增且 ∈ [1.1789, 4/π]',
    ov <= prevOv + 1e-12 && ov >= GIBBS - 1e-4 && ov <= 4 / PI + 1e-12);
  prevOv = ov;
}
assert('过冲序列整体单调不增', monoOK);
approx('N=51 过冲 → Gibbs 极限 1.17898', S.synth({ kind: 'square', N: 51, f0: f0, samples: 2048 }).overshoot, GIBBS, 0.002);
approx('N=51 过冲（相对跳变 2）≈ 8.95%', S.synth({ kind: 'square', N: 51, f0: f0, samples: 2048 }).overshootJumpPct, 8.95, 0.1);
approx('N=51 过冲（相对幅值 1）≈ 17.90%', S.synth({ kind: 'square', N: 51, f0: f0, samples: 2048 }).overshootPct, 17.90, 0.2);
var ov51 = S.synth({ kind: 'square', N: 51, f0: f0, samples: 2048 });
assert('网格峰值 ≤ 细化峰值，且网格低估 <3e-3（细化消除采样网格偏差）',
  ov51.overshootGrid <= ov51.overshoot + 1e-12 && ov51.overshoot - ov51.overshootGrid < 3e-3);
assert('三角波无 Gibbs 过冲（N=51 峰值 ≤1）', S.synth({ kind: 'triangle', N: 51, f0: f0, samples: 2048 }).overshoot <= 1 + 1e-6);

console.log('\n[3] 收敛性（部分和 → 理想波形）');
var sawErr = [], sawNs = [1, 11, 21, 31, 41];
sawNs.forEach(function (n) {
  var v = S.waveform('saw', n, f0, tAt(PI / 2));
  sawErr.push(Math.abs(v - 0.5));
  approx('锯齿 N=' + n + ' 在 θ=π/2 → 0.5（误差 ≤2/N）', v, 0.5, 2 / n);
});
assert('锯齿在 θ=π/2 的误差随 N 单调下降',
  sawErr.every(function (e, i) { return i === 0 || e <= sawErr[i - 1] + 1e-12; }));
var rmsSq = [1, 3, 5, 9, 21].map(function (n) { return S.synth({ kind: 'square', N: n, f0: f0, samples: 2048 }).rmsError; });
assert('方波 RMS 误差随 N 单调下降', rmsSq.every(function (e, i) { return i === 0 || e < rmsSq[i - 1]; }));
var rmsTr = [1, 3, 5, 9, 21].map(function (n) { return S.synth({ kind: 'triangle', N: n, f0: f0, samples: 2048 }).rmsError; });
assert('三角波 RMS 误差随 N 单调下降', rmsTr.every(function (e, i) { return i === 0 || e < rmsTr[i - 1]; }));
assert('三角波收敛快于方波（N=5 时误差更小）', rmsTr[2] < rmsSq[2]);
// 手工验算：N=1 方波 mean((4/π·sinθ − sign(sinθ))²) = (1/π)[(4/π)²·π/2 − 2·(4/π)·2 + π]
approx('方波 N=1 RMS 误差 = √{[(4/π)²·π/2 − 4·(4/π) + π]/π} = 0.43522', rmsSq[0],
  Math.sqrt((Math.pow(4 / PI, 2) * (PI / 2) - 4 * (4 / PI) + PI) / PI), 1e-3);
approx('方波 N=1 RMS = (4/π)/√2 = 0.90032', sq1.rms, (4 / PI) / Math.SQRT2, 1e-6);
var oddSum = 0;
for (N = 1; N <= 51; N += 2) oddSum += 1 / (N * N);
approx('方波 N=51 RMS = √{(8/π²)·Σ1/k²} = 0.99610', S.synth({ kind: 'square', N: 51, f0: f0, samples: 2048 }).rms,
  Math.sqrt((8 / (PI * PI)) * oddSum), 1e-9);

console.log('\n[4] 窗函数（M = 64，对称定义分母 M−1）');
var M64 = 64;
var wr = S.windowFn('rect', M64), wh = S.windowFn('hann', M64), wm = S.windowFn('hamming', M64), wb = S.windowFn('blackman', M64);
assert('windowFn 返回数组且长度 = M', Array.isArray(wr) && wr.length === M64);
assert('矩形窗全 1', wr.every(function (v) { return v === 1; }));
approx('Hann w[0] = 0.5−0.5cos0 = 0', wh[0], 0, 1e-12);
approx('Hann w[M−1] = 0.5−0.5cos2π = 0', wh[M64 - 1], 0, 1e-12);
approx('Hamming w[0] = 0.54−0.46 = 0.08', wm[0], 0.08, 1e-12);
approx('Blackman w[0] = 0.42−0.50+0.08 = 0', wb[0], 0, 1e-12);
approx('Blackman w[M−1] = 0', wb[M64 - 1], 0, 1e-12);
approx('Hann 中点 n=32：0.5−0.5cos(2π·32/63)', wh[32], 0.5 - 0.5 * Math.cos(2 * PI * 32 / 63), 1e-12);
approx('Blackman 中点 n=32：0.42−0.5cos(2π·32/63)+0.08cos(4π·32/63)', wb[32],
  0.42 - 0.5 * Math.cos(2 * PI * 32 / 63) + 0.08 * Math.cos(4 * PI * 32 / 63), 1e-12);
approx('矩形窗相干增益 = 1', S.windowInfo('rect', M64).cg, 1, 1e-12);
approx('Hann 相干增益 = 0.5(1−1/M)', S.windowInfo('hann', M64).cg, 0.5 * (1 - 1 / M64), 1e-12);
approx('Hamming 相干增益 = 0.54−0.46/M', S.windowInfo('hamming', M64).cg, 0.54 - 0.46 / M64, 1e-12);
approx('Blackman 相干增益 = 0.42−0.42/M', S.windowInfo('blackman', M64).cg, 0.42 - 0.42 / M64, 1e-12);
['rect', 'hann', 'hamming', 'blackman'].forEach(function (w) {
  var cg = S.windowInfo(w, M64).cg;
  assert('窗 ' + w + ' 的 mean(w) = ' + cg.toFixed(6) + ' ∈ (0,1]', cg > 0 && cg <= 1);
});
['rect', 'hann', 'hamming', 'blackman'].forEach(function (w) {
  assert('windowFn 数组上挂载 kind/M/cg（' + w + '）',
    S.windowFn(w, M64).kind === w && S.windowFn(w, M64).M === M64 && typeof S.windowFn(w, M64).cg === 'number');
});
approx('主瓣宽度 rect = 2 bin', S.windowMainlobe('rect'), 2, 0);
approx('主瓣宽度 hann = 4 bin', S.windowMainlobe('hann'), 4, 0);
approx('主瓣宽度 hamming = 4 bin', S.windowMainlobe('hamming'), 4, 0);
approx('主瓣宽度 blackman = 6 bin', S.windowMainlobe('blackman'), 6, 0);
approx('第一零点 rect = 1 bin', S.windowNullOffset('rect', 512), 1, 1e-9);
approx('第一零点 hann = 2 bin', S.windowNullOffset('hann', 512), 2, 0.03);
approx('第一零点 blackman = 3 bin', S.windowNullOffset('blackman', 512), 3, 0.03);
assert('非法窗类型返回 null', S.windowFn('kaiser', 64) === null);
assert('非法长度返回 null', S.windowFn('hann', 0) === null);

console.log('\n[5] 直接 DFT');
var dc = new Array(512), i;
for (i = 0; i < 512; i++) dc[i] = 1;
var D = S.dft(dc, null, 'rect');
assert('直流信号 DFT ok', D.ok === true);
approx('X[0] = Σ1 = M = 512', D.mag[0], 512, 1e-9);
var maxAbs = 0, maxRel = 0;
for (i = 1; i < 512; i++) { maxAbs = Math.max(maxAbs, D.mag[i]); maxRel = Math.max(maxRel, D.mag[i] / D.mag[0]); }
assert('直流：其余 bin 绝对幅度 <1e-12（实测 ' + maxAbs.toExponential(2) + '）', maxAbs < 1e-12);
assert('直流：其余 bin 相对幅度 <1e-12（实测 ' + maxRel.toExponential(2) + '）', maxRel < 1e-12);
approx('直流：峰值 bin = 0', D.peakBin, 0, 0);

var lgH = S.leakage({ fIn: 1000, fs: 16000, M: 512, win: 'hann' });
var e1 = 0, e2 = 0;
for (i = 0; i < 512; i++) {
  var vv = lgH.x[i] * lgH.w[i];
  e1 += vv * vv;
  e2 += lgH.mag[i] * lgH.mag[i];
}
approx('Parseval：Σ|x·w|²·M == Σ|X|²（相对残差）', Math.abs(e1 * 512 - e2) / (e1 * 512), 0, 1e-12);

var Lr = S.leakage({ fIn: 1000, fs: 16000, M: 512, win: 'rect' });
approx('整 bin：binIndex = 1000/(16000/512) = 32', Lr.binIndex, 32, 1e-12);
assert('整 bin：onBin = true', Lr.onBin === true);
var relOff = 0;
for (i = 0; i < 512; i++) {
  if (i === 32 || i === 480) continue;
  relOff = Math.max(relOff, Lr.mag[i] / Lr.mag[32]);
}
assert('整 bin 矩形窗：仅 bin32 与其镜像 bin480 非零（其余相对 ' + relOff.toExponential(2) + ' <1e-9）', relOff < 1e-9);
approx('整 bin：镜像 bin480 幅度 == 峰值', Lr.mag[480] / Lr.mag[32], 1, 1e-12);
approx('幅度校正 peakAmp = 2|X|/(M·CG) = 1', Lr.peakAmp, 1, 1e-9);
approx('频率轴 freq[32] = 32·fs/M = 1000 Hz', Lr.freq[32], 1000, 1e-9);
approx('bin 间隔 df = fs/M = 31.25 Hz', Lr.df, 31.25, 1e-12);
approx('峰值 bin 的 dB = 0', Lr.db[32], 0, 1e-12);
assert('dB 谱下限 −120 dB', Lr.db.every(function (v) { return v >= -120 - 1e-12; }));
assert('空序列返回 ok:false', S.dft([], null, 'rect').ok === false);
assert('长度超限返回 ok:false', S.dft(dc, null, 'rect').ok === true && S.dft(new Array(4096), null, 'rect').ok === false);

console.log('\n[6] 频谱泄漏与主瓣');
var halfBin = 1015.625; // 32.5 bin
var Lhr = S.leakage({ fIn: halfBin, fs: 16000, M: 512, win: 'rect' });
var Lhh = S.leakage({ fIn: halfBin, fs: 16000, M: 512, win: 'hann' });
var Lhm = S.leakage({ fIn: halfBin, fs: 16000, M: 512, win: 'hamming' });
var Lhb = S.leakage({ fIn: halfBin, fs: 16000, M: 512, win: 'blackman' });
approx('半 bin：binIndex = 32.5', Lhr.binIndex, 32.5, 1e-12);
assert('半 bin：onBin = false', Lhr.onBin === false);
approx('半 bin 偏移 |binOffset| = 0.5', Math.abs(Lhr.binOffset), 0.5, 1e-9);
approx('矩形窗最高旁瓣 ≈ 20log₁₀(1/3) = −9.54 dB', Lhr.sidelobeDb, 20 * Math.log10(1 / 3), 0.3);
approx('Hann 最高旁瓣 ≈ −30.9 dB', Lhh.sidelobeDb, -30.9, 1.0);
assert('Hann 最高旁瓣 (' + Lhh.sidelobeDb.toFixed(2) + ' dB) 比矩形 (' + Lhr.sidelobeDb.toFixed(2) + ' dB) 低 10 dB 以上',
  Lhh.sidelobeDb < Lhr.sidelobeDb - 10);
assert('Blackman 旁瓣 (' + Lhb.sidelobeDb.toFixed(2) + ' dB) 低于 Hamming (' + Lhm.sidelobeDb.toFixed(2) + ' dB)',
  Lhb.sidelobeDb < Lhm.sidelobeDb);
approx('矩形窗主瓣宽 2·fs/M = 62.5 Hz', Lhr.mainlobeWidthHz, 62.5, 1e-9);
approx('Hann 主瓣宽 4·fs/M = 125 Hz', Lhh.mainlobeWidthHz, 125, 1e-9);
approx('矩形窗第一零点距峰值 1 bin', Lhr.nullOffsetBins, 1, 1e-9);
approx('Hann 第一零点距峰值 2 bin', Lhh.nullOffsetBins, 2, 0.03);
approx('矩形窗实测主瓣宽 2 bin', Lhr.mainlobeMeasuredBins, 2, 1e-9);
approx('Hann 实测主瓣宽 4 bin', Lhh.mainlobeMeasuredBins, 4, 0.06);

console.log('\n[7] 混叠');
var a1 = S.aliasInfo(9000, 16000);
assert('f_in=9000 > fs/2=8000 触发混叠', a1.alias === true);
approx('折叠频率 |9000−16000| = 7000 Hz', a1.aliasFreq, 7000, 1e-9);
approx('f_in=20000 → |20000−16000| = 4000 Hz', S.aliasInfo(20000, 16000).aliasFreq, 4000, 1e-9);
approx('f_in=25000 → |25000−2×16000| = 7000 Hz', S.aliasInfo(25000, 16000).aliasFreq, 7000, 1e-9);
assert('f_in=7000 < fs/2 不混叠', S.aliasInfo(7000, 16000).alias === false);
assert('f_in=8000 = fs/2 边界不判混叠', S.aliasInfo(8000, 16000).alias === false);
approx('奈奎斯特频率 = fs/2 = 8000 Hz', S.aliasInfo(9000, 16000).nyquist, 8000, 1e-12);

console.log('\n[8] simulate 主入口');
var sim = S.simulate({ kind: 'square', N: 15, f0: 100, fs: 16000, M: 512, win: 'hann', fIn: 1015.625 });
assert('simulate ok', sim.ok === true);
assert('时域数组长度 = samples', sim.x.length === S.SAMPLES_DEFAULT && sim.t.length === S.SAMPLES_DEFAULT);
assert('频域数组长度 = M', sim.mag.length === 512 && sim.db.length === 512 && sim.freq.length === 512);
assert('notes 6 条', sim.notes.length === 6);
assert('混叠标记与 leakage 一致', sim.alias === false && sim.nyquist === 8000);
approx('simulate 过冲与 synth 一致', sim.overshoot, S.synth({ kind: 'square', N: 15, f0: 100, samples: 2048 }).overshoot, 1e-12);
approx('simulate 主瓣宽 = 4·fs/M', sim.mainlobeWidthHz, 125, 1e-9);
var simA = S.simulate({ fIn: 9000 });
assert('f_in=9000 时 simulate 给出混叠告警', simA.alias === true);
approx('混叠折叠频率 7000 Hz', simA.aliasFreq, 7000, 1e-9);
var dflt = S.simulate({});
assert('空参走缺省值（square / N=9 / fs=16000 / M=512 / rect）',
  dflt.ok === true && dflt.kind === 'square' && dflt.N === 9 && dflt.fs === 16000 && dflt.M === 512 && dflt.win === 'rect');
assert('N=0 被拒绝', S.simulate({ N: 0 }).ok === false);
assert('N=65 被拒绝', S.simulate({ N: 65 }).ok === false);
assert('f₀=0 被拒绝', S.simulate({ f0: 0 }).ok === false);
assert('fs=500（越界）被拒绝', S.simulate({ fs: 500 }).ok === false);
assert('M=4（越界）被拒绝', S.simulate({ M: 4 }).ok === false);
assert('f_in=−1 被拒绝', S.simulate({ fIn: -1 }).ok === false);
assert('非法窗被拒绝', S.simulate({ win: 'kaiser' }).ok === false);
assert('非法波形被拒绝', S.simulate({ kind: 'sine' }).ok === false);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);
