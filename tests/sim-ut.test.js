/*
 * sim-ut.test.js - 超声脉冲回波法测厚与探伤（A 扫描）内核 (node tests/sim-ut.test.js)
 *
 * 覆盖：λ=c/f、d=c·t/2、轴向分辨率、近场 N=D²/4λ、半扩散角 arcsin(1.22λ/D)、
 * 回波幅度（材料衰减+球面扩展）、−6 dB 法当量尺寸、材料声速常量表、
 * A 扫描波形（到达时间/单调时间轴/噪声可复现）、simulate 主入口与输入校验、告警。
 */
var S = require('../public/js/sim-ut.js');

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
// 在 ±half µs 窗口内找 |y| 峰值所在采样点的时间
function peakTime(sc, tc, half) {
  var best = -1, bi = -1;
  for (var i = 0; i < sc.M; i++) {
    if (Math.abs(sc.tUs[i] - tc) <= half) {
      var a = Math.abs(sc.y[i]);
      if (a > best) { best = a; bi = i; }
    }
  }
  return bi < 0 ? null : sc.tUs[bi];
}

var C = 5920;      // 钢纵波声速 m/s
var F = 5e6;       // 5 MHz
var LAM = 1.184;   // λ = 5920/5e6 m = 1.184 mm（手工验算值）

console.log('[1] 波长 λ = c/f');
approx('λ(5 MHz, 钢) = 1.184e-3 m', S.wavelength(F, C), 1.184e-3, 1e-9);
approx('λ = 1.184 mm', S.wavelength(F, C) * 1000, 1.184, 1e-9);
approx('c 加倍 → λ 加倍', S.wavelength(F, 2 * C), 2 * 1.184e-3, 1e-12);
approx('f 加倍 → λ 减半', S.wavelength(2 * F, C), 1.184e-3 / 2, 1e-12);
approx('λ(10 MHz, 钢) = 0.592 mm', S.wavelength(1e7, C) * 1000, 0.592, 1e-9);
assert('f=0 返回 null', S.wavelength(0, C) === null);
assert('c=0 返回 null', S.wavelength(F, 0) === null);

console.log('\n[2] 测厚 d = c·t/2');
approx('d(t=10 µs, 钢) = 0.0296 m', S.thickness(10e-6, C), 0.0296, 1e-9);
approx('d = 29.6 mm', S.thickness(10e-6, C) * 1000, 29.6, 1e-9);
approx('往返自洽 2d/c = t', 2 * S.thickness(10e-6, C) / C, 10e-6, 1e-15);
approx('t 加倍 → d 加倍', S.thickness(20e-6, C), 0.0592, 1e-12);
approx('d(t=16.8919 µs) = 50 mm', S.thickness(16.89189189189189e-6, C) * 1000, 50, 1e-9);
assert('t=0 返回 null', S.thickness(0, C) === null);
assert('c=0 返回 null', S.thickness(10e-6, 0) === null);

console.log('\n[3] 轴向分辨率 d_min = c·τ/2');
approx('τ=2/f → d_min = λ = 1.184 mm', S.axialRes(F, C) * 1000, 1.184, 1e-9);
approx('τ=1 µs → d_min = 5920*1e-6/2 = 2.96 mm', S.axialRes(F, C, 1e-6) * 1000, 2.96, 1e-9);
approx('τ 加倍 → d_min 加倍', S.axialRes(F, C, 4e-7) * 1000, 1.184, 1e-9);
assert('f=0 返回 null', S.axialRes(0, C) === null);
assert('c=0 返回 null', S.axialRes(F, 0) === null);

console.log('\n[4] 近场长度 N = D²/(4λ) = D²f/(4c)');
approx('N(D=10 mm, 5 MHz, 钢) = 100/(4*1.184) mm', S.nearField(10, F, C), 21.12, 0.01);
approx('N 用 D²f/(4c) 形式一致', S.nearField(10, F, C), 100 * F / (4 * C * 1000), 1e-9);
approx('D 加倍 → N 变 4 倍（84.46 mm）', S.nearField(20, F, C), 4 * 21.114864864864867, 1e-9);
approx('f 加倍 → N 加倍（λ 减半）', S.nearField(10, 1e7, C), 2 * 21.114864864864867, 1e-9);
approx('N(D=6, 10 MHz, 钢) = 36/(4*0.592) = 15.20 mm', S.nearField(6, 1e7, C), 15.2, 0.01);
assert('D=0 返回 null', S.nearField(0, F, C) === null);
assert('f=0 返回 null', S.nearField(10, 0, C) === null);

console.log('\n[5] 半扩散角 θ = arcsin(1.22λ/D)');
approx('θ(D=10, 5 MHz, 钢) = arcsin(1.22*1.184/10) rad', S.beamSpread(10, F, C), Math.asin(1.22 * LAM / 10), 1e-12);
approx('θ ≈ 0.144955 rad', S.beamSpread(10, F, C), 0.144955, 1e-6);
approx('θ ≈ 8.3053°', S.beamSpread(10, F, C) * 180 / Math.PI, 8.3053, 1e-4);
approx('kHz? D 加倍 → θ 约为一半', S.beamSpread(20, F, C), Math.asin(1.22 * LAM / 20), 1e-12);
approx('θ(1.22λ/D 小)≈ 小角近似 1.22λ/D', S.beamSpread(20, F, C), 1.22 * LAM / 20, 1e-4);
assert('1.22λ/D > 1（D=1 mm, 1 MHz, 钢：λ=5.92 mm）返回 null', S.beamSpread(1, 1e6, C) === null);
assert('1.22λ/D = 1.22*1.184/1 > 1（D=1, 5 MHz）返回 null', S.beamSpread(1, F, C) === null);
assert('D=0 返回 null', S.beamSpread(0, F, C) === null);

console.log('\n[6] 回波幅度 A = −2αd − 20log10(2d/1mm)');
approx('A(50 mm, α=0.01) 扩散项 = −20log10(100) = −40 dB', S.echoDb(50, 0), -40, 1e-9);
approx('A(50 mm, α=0.01) 合计 = −1 − 40 = −41 dB', S.echoDb(50, 0.01), -41, 1e-9);
approx('衰减项单独 = −1.0 dB', S.echoDb(50, 0.01) - S.echoDb(50, 0), -1, 1e-9);
approx('d 加倍 → 扩散损失 = −6.0206 dB', S.echoDb(100, 0) - S.echoDb(50, 0), -6.0206, 1e-4);
approx('A(20 mm, α=0.05) = −2 − 20log10(40) = −34.04 dB', S.echoDb(20, 0.05), -34.0412, 1e-4);
assert('d 单调：A(100) < A(50) < A(10)', S.echoDb(100, 0.01) < S.echoDb(50, 0.01) && S.echoDb(50, 0.01) < S.echoDb(10, 0.01));
assert('α 单调：A(α=0.1) < A(α=0.01)', S.echoDb(50, 0.1) < S.echoDb(50, 0.01));
approx('α 缺省视为 0（仅扩散项 −40 dB）', S.echoDb(50), -40, 1e-9);
assert('d=0 返回 null', S.echoDb(0, 0.01) === null);
assert('d<0 返回 null', S.echoDb(-5, 0.01) === null);

console.log('\n[7] −6 dB 法缺陷当量尺寸 A(x)=exp(−4ln2(x/w)²)');
approx('A(0, 6) = 1（峰值）', S.defectEnvelope(0, 6), 1, 1e-12);
approx('A(+w/2, w) = 0.5（−6 dB 边界）', S.defectEnvelope(3, 6), 0.5, 1e-12);
approx('A(−w/2, w) = 0.5（对称）', S.defectEnvelope(-3, 6), 0.5, 1e-12);
approx('A(±w, w) = 0.0625', S.defectEnvelope(6, 6), 0.0625, 1e-12);
approx('A(−w, w) = 0.0625', S.defectEnvelope(-6, 6), 0.0625, 1e-12);
approx('20log10·A(w/2) = −6.0206 dB', 20 * Math.log(S.defectEnvelope(3, 6)) / Math.LN10, -6.0206, 1e-4);
approx('−6 dB 半宽 = w/2 = 3 mm', S.halfWidth6db(6), 3, 1e-12);
approx('两侧 −6 dB 点间距 = 当量尺寸 6 mm', S.equivalentSize(-3, 3), 6, 1e-12);
approx('当量尺寸反算 w = 6 mm', S.equivalentSize(S.halfWidth6db(6) * -1, S.halfWidth6db(6)), 6, 1e-12);
assert('w≤0 返回 null', S.defectEnvelope(0, 0) === null);
assert('halfWidth6db(w≤0) 返回 null', S.halfWidth6db(0) === null);

console.log('\n[8] 材料声速常量表（纵波 m/s）');
assert('常量表 8 种材料', S.MATERIALS.length === 8);
approx('钢 = 5920 m/s', S.material('steel').c, 5920, 0);
approx('铝 = 6320 m/s', S.material('aluminum').c, 6320, 0);
approx('铜 = 4700 m/s', S.material('copper').c, 4700, 0);
approx('铸铁 = 4600 m/s', S.material('castiron').c, 4600, 0);
approx('有机玻璃 = 2730 m/s', S.material('pmma').c, 2730, 0);
approx('水 = 1480 m/s', S.material('water').c, 1480, 0);
approx('混凝土 = 4000 m/s', S.material('concrete').c, 4000, 0);
approx('钛 = 6070 m/s', S.material('titanium').c, 6070, 0);
approx('钢默认 α = 0.01 dB/mm', S.material('steel').alpha, 0.01, 0);
approx('钢横波提示 ≈ 0.55c = 3256 m/s', S.shearSpeed(5920), 3256, 1e-6);
assert('未知材料返回 null', S.material('unknown') === null);
assert('横波约为纵波 0.5~0.55 倍', S.SHEAR_RATIO >= 0.5 && S.SHEAR_RATIO <= 0.55);

var sc0 = S.ascan({ c: C, fMHz: 5, dMm: 50, defectMm: 25, alpha: 0.01, snr: 60, refl: 0.6 });
console.log('\n[9] A 扫描波形（50 mm 钢、缺陷 25 mm、SNR 60 dB）');
assert('ascan ok', sc0.ok === true);
assert('采样点 M = 1024', sc0.M === 1024);
assert('tUs 长度 = 1024', sc0.tUs.length === 1024);
assert('y 长度 = 1024', sc0.y.length === 1024);
assert('yNorm 长度 = 1024', sc0.yNorm.length === 1024);
assert('yDb 长度 = 1024', sc0.yDb.length === 1024);
assert('时间轴自 0 起', sc0.tUs[0] === 0);
assert('时间轴严格单调递增', sc0.tUs.every(function (v, i, a) { return i === 0 || a[i - 1] < v; }));
approx('时间轴末点 = TWinUs', sc0.tUs[1023], sc0.TWinUs, 1e-9);
approx('时间窗 = 1.2 × 底波时间 = 20.2703 µs', sc0.TWinUs, 1.2 * 16.89189189189189, 1e-9);
approx('采样间隔 dt = TWin/(M−1)', sc0.dtUs, sc0.TWinUs / 1023, 1e-12);
approx('脉冲 σ = 1/f = 0.2 µs', sc0.sigmaUs, 0.2, 1e-12);
approx('始波到达时间 = 0 µs', sc0.initial.tUs, 0, 1e-12);
approx('始波幅度 = 1（参考）', sc0.initial.amp, 1, 1e-12);
approx('始波 dB = 0', sc0.initial.db, 0, 1e-12);
approx('缺陷波到达时间 = 2*25/5920 = 8.4459 µs', sc0.defect.tUs, 8.445946, 1e-6);
approx('底波到达时间 = 2*50/5920 = 16.8919 µs', sc0.back.tUs, 16.891892, 1e-6);
approx('底波深度 = 50 mm', sc0.back.depthMm, 50, 1e-9);
approx('缺陷深度 = 25 mm', sc0.defect.depthMm, 25, 1e-9);
approx('底波 dB = −41 dB', sc0.back.db, -41, 1e-9);
approx('底波线性幅度 = 10^(−41/20)', sc0.back.amp, Math.pow(10, -41 / 20), 1e-12);
approx('缺陷波 dB = echoDb(25)+20log10(0.6)', sc0.defect.db, S.echoDb(25, 0.01) + 20 * Math.log(0.6) / Math.LN10, 1e-9);
approx('缺陷波幅度 = 0.6×10^(echoDb(25)/20)', sc0.defect.amp, 0.6 * Math.pow(10, S.echoDb(25, 0.01) / 20), 1e-12);
assert('幅度关系 |始波| > |缺陷波| > |底波|', sc0.initial.amp > sc0.defect.amp && sc0.defect.amp > sc0.back.amp);
approx('深度轴 = c·t/2（t=10 µs → 29.6 mm）', sc0.depthMm[Math.round(10 / sc0.dtUs)], 29.6, 0.02);

var scN = S.ascan({ c: C, fMHz: 5, dMm: 50, defectMm: 25, alpha: 0.01, refl: 0.6 });
approx('无噪声：始波峰值时刻 ≈ 0 µs（≤1 采样间隔）', peakTime(scN, 0, 0.5), 0, scN.dtUs);
approx('无噪声：缺陷波峰值时刻 ≈ 8.4459 µs', peakTime(scN, 8.445946, 0.5), 8.445946, scN.dtUs);
approx('无噪声：底波峰值时刻 ≈ 16.8919 µs', peakTime(scN, 16.891892, 0.5), 16.891892, scN.dtUs);
approx('波形 y[0] = 始波峰值 ≈ 1', scN.y[0], 1, 1e-9);

var scNo = S.ascan({ c: C, fMHz: 5, dMm: 50 });
assert('无缺陷：ascan.defect 标记为 null', scNo.defect === null);
assert('无缺陷：波形仍含始波与底波', scNo.initial.amp === 1 && scNo.back.amp > 0);
var sc512 = S.ascan({ c: C, fMHz: 5, dMm: 50, M: 512 });
assert('M=512 时数组长度 512', sc512.M === 512 && sc512.y.length === 512);
var n1 = S.ascan({ c: C, fMHz: 5, dMm: 50, snr: 40 });
var n2 = S.ascan({ c: C, fMHz: 5, dMm: 50, snr: 40 });
assert('噪声可复现（同参数两次结果一致）', n1.y.every(function (v, i) { return v === n2.y[i]; }));
assert('加噪声后波形与无噪声不同', n1.y[500] !== scNo.y[500]);

console.log('\n[10] simulate 主入口（钢板 50 mm、缺陷 25 mm）');
var sim = S.simulate({ material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: 25, alpha: 0.01, snr: 60, refl: 0.6, wMm: 6 });
assert('simulate ok', sim.ok === true);
approx('材料声速 = 5920 m/s', sim.c, 5920, 0);
approx('λ = 1.184 mm', sim.lambdaMm, 1.184, 1e-9);
approx('λ（m）= 1.184e-3 m', sim.lambda, 1.184e-3, 1e-9);
approx('近场 N = 21.1149 mm', sim.nearFieldMm, 21.114865, 1e-6);
approx('半扩散角 θ = 0.144955 rad', sim.theta, 0.144955, 1e-6);
approx('半扩散角 θ = 8.3053°', sim.thetaDeg, 8.3053, 1e-4);
approx('轴向分辨率 = 1.184 mm', sim.axialResMm, 1.184, 1e-9);
approx('底波到达时间 = 16.8919 µs', sim.tBackUs, 16.891892, 1e-6);
approx('缺陷波到达时间 = 8.4459 µs', sim.tDefectUs, 8.445946, 1e-6);
approx('底波幅度 = −41 dB', sim.backDb, -41, 1e-9);
approx('缺陷波幅度 = −38.9164 dB', sim.defectDb, -38.91638, 1e-5);
approx('−6 dB 当量尺寸 = 6 mm', sim.size6dbMm, 6, 1e-12);
approx('−6 dB 半宽 = 3 mm', sim.halfWidth6dbMm, 3, 1e-12);
assert('ascan 子结果 M = 1024', sim.ascan.M === 1024);
assert('缺陷深度回传 = 25 mm', sim.defectMm === 25);
assert('50 mm 钢板无告警', sim.warnings.length === 0);
assert('notes ≥ 4 条', sim.notes.length >= 4);
var dflt = S.simulate();
assert('空参走缺省值（钢/5 MHz/10 mm/50 mm）', dflt.ok === true && dflt.c === 5920 && dflt.fMHz === 5 && dflt.DMm === 10 && dflt.dMm === 50);
assert('空参无缺陷', dflt.defectMm === null && dflt.ascan.defect === null && dflt.defectDb === null);
approx('空参 λ = 1.184 mm', dflt.lambdaMm, 1.184, 1e-9);
approx('频率入口也接受 Hz（5e6 → 5 MHz）', S.simulate({ material: 'steel', f: 5e6 }).lambdaMm, 1.184, 1e-9);
approx('直接给 c（不给材料）同样计算', S.simulate({ c: 5920, fMHz: 5, DMm: 10, dMm: 50 }).lambdaMm, 1.184, 1e-9);

console.log('\n[11] 告警与输入校验');
assert('厚度 10 mm < 近场 21.11 mm → 近场告警',
  S.simulate({ material: 'steel', fMHz: 5, DMm: 10, dMm: 10 }).warnings.join('').indexOf('近场') >= 0);
assert('厚度 1 mm < 轴向分辨率 1.184 mm → 无法分辨告警',
  S.simulate({ material: 'steel', fMHz: 5, DMm: 10, dMm: 1 }).warnings.join('').indexOf('无法分辨') >= 0);
assert('D=1 mm、1 MHz 时 θ 无解 → 扩散告警',
  S.simulate({ material: 'steel', fMHz: 1, DMm: 1, dMm: 100 }).theta === null &&
  S.simulate({ material: 'steel', fMHz: 1, DMm: 1, dMm: 100 }).warnings.join('').indexOf('扩散') >= 0);
assert('铸铁厚件 300 mm 高衰减 → 底波过弱告警',
  S.simulate({ material: 'concrete', fMHz: 5, DMm: 10, dMm: 300, alpha: 0.1 }).warnings.join('').indexOf('底波幅度仅') >= 0);
assert('缺陷深度 ≥ 厚度 → 按无缺陷处理 + 告警',
  S.simulate({ material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: 60 }).defectMm === null &&
  S.simulate({ material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: 60 }).warnings.join('').indexOf('缺陷深度') >= 0);
assert('缺陷深度 ≥ 厚度时 ascan 无缺陷标记',
  S.simulate({ material: 'steel', fMHz: 5, DMm: 10, dMm: 50, defectMm: 60 }).ascan.defect === null);
assert('f=0 MHz 被拒绝', S.simulate({ fMHz: 0 }).ok === false);
assert('D=0 mm 被拒绝', S.simulate({ DMm: 0 }).ok === false);
assert('d=0 mm 被拒绝', S.simulate({ dMm: 0 }).ok === false);
assert('α<0 被拒绝', S.simulate({ alpha: -1 }).ok === false);
assert('refl>1 被拒绝', S.simulate({ refl: 2 }).ok === false);
assert('未知材料被拒绝', S.simulate({ material: 'wood' }).ok === false);
assert('SNR=5 dB（越界）被拒绝', S.simulate({ snr: 5 }).ok === false);
assert('w=0（越界）被拒绝', S.simulate({ wMm: 0 }).ok === false);
assert('ascan 缺 c 返回 ok:false', S.ascan({ fMHz: 5, dMm: 50 }).ok === false);
assert('错误对象带 error 文案', typeof S.simulate({ dMm: 0 }).error === 'string');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);
