/*
 * insdesign.test.js — 隔声与撞击声进阶内核逻辑测试 (node tests/insdesign.test.js)
 * 验证质量定律、吻合频率、双层共振、隔声罩插入损失、浮筑楼板改进、组合传声等。
 */
var I = require('../public/js/insdesign.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

console.log('\n[1] 单层密实构件：质量定律 + 吻合频率');
var sl = I.singleLeaf({ m: 6.4, cL: 2000, thicknessMm: 8 });
ok('单层计算成功', sl.ok);
ok('面密度 m = 6.4', near(sl.m, 6.4));
ok('R(500Hz) ≈ 22.1 dB', sl.spectrum.some(function (p) { return p.f === 500 && near(p.R, 22.1, 0.3); }),
   sl.spectrum.filter(function (p) { return p.f === 500; })[0].R);
var fc = I.coincidence(2000, 8);
ok('吻合频率 fc(8mm 石膏板) ≈ 4085 Hz', near(fc, 4085, 5), fc);
ok('频谱长度 = 17 带', sl.spectrum.length === 17);
ok('maxR > minR', sl.maxR > sl.minR);

console.log('\n[2] 双层构造（质量-空气-质量共振）');
var dl = I.doubleLeaf({ m1: 10, m2: 10, d: 100, alphaC: 0.2 });
ok('双层计算成功', dl.ok);
ok('共振频率 f0 ≈ 77 Hz', near(dl.f0, 77.2, 3), dl.f0);
ok('f0 处出现隔声低谷', Math.abs(dl.minRf - dl.f0) / dl.f0 < 1.5, dl.minRf);
ok('频谱隔声量均为有限值', dl.spectrum.every(function (p) { return isFinite(p.R); }));
ok('高频段隔声量高于单层整体质量定律', (function () {
  // 2000 Hz 处应因腔体增益高于 R(m1+m2)
  var p = dl.spectrum.filter(function (q) { return q.f === 2000; })[0];
  var base = I.massLaw(20, 2000);
  return p.R > base - 1; // 2000Hz 远离 f0，腔体增益应使 R 不低于整体单层
})());
var dl2 = I.doubleLeaf({ m1: 10, m2: 10, d: 100, alphaC: 0.9 });
ok('大腔体吸声时共振低谷更浅', dl2.minR > dl.minR, dl2.minR + ' vs ' + dl.minR);
ok('缺空气层厚度报错', !I.doubleLeaf({ m1: 10, m2: 10 }).ok);

console.log('\n[3] 隔声罩 / 围护结构插入损失');
var en = I.enclosureNR({ TL: 30, S: 10, Ainside: 5 });
ok('隔声罩插入损失成功', en.ok);
ok('NR = TL + 10lg(S/A) ≈ 33.0 dB', near(en.NR, 33.0, 0.2), en.NR);
var enS = I.enclosureNR({ TL: [20, 30, 40, 50], S: 12, Ainside: 3 });
ok('谱式插入损失返回 17 带', enS.ok && enS.spectrum.length === 17);
ok('谱式首带 NR = 20 + 10lg(4) ≈ 26.0', near(enS.spectrum[0].NR, 26.0, 0.2), enS.spectrum[0].NR);
ok('缺内表面吸声量报错', !I.enclosureNR({ TL: 30, S: 10 }).ok);

console.log('\n[4] 浮筑楼板 / 弹性垫层撞击声改进');
var ff = I.floatingFloor({ m: 100, sPrime: 10 });
ok('浮筑计算成功', ff.ok);
ok('共振频率 f0 ≈ 50.3 Hz', near(ff.f0, 50.3, 1), ff.f0);
ok('ΔL(500Hz) = 20lg(10) = 20 dB', near(ff.spectrum.filter(function (p) { return p.f === 500; })[0].dL, 20, 0.2));
ok('f < f0 时无改进', ff.spectrum.filter(function (p) { return p.f < ff.f0; }).every(function (p) { return p.dL === 0; }));
ok('ΔL_w 近似 > 0', ff.dLwApprox > 0, ff.dLwApprox);
ok('缺动态刚度报错', !I.floatingFloor({ m: 100 }).ok);

console.log('\n[5] 组合与侧向传声（能量叠加）');
var c1 = I.combinedTransmission([{ R: 50 }, { R: 50 }]);
ok('两路等隔声 R=50 → 合成 ≈ 47.0 dB', near(c1.R, 47.0, 0.2), c1.R);
var c2 = I.combinedTransmission([{ R: 40 }, { R: 30 }]);
ok('R=40 与 R=30 → 合成 ≈ 29.6 dB（侧向传声主导）', near(c2.R, 29.6, 0.3), c2.R);
ok('合成隔声量低于最弱路径', c2.R < 30);
var cS = I.combinedTransmission([{ R: [40, 50, 60] }, { R: [30, 40, 50] }]);
ok('谱式组合返回 3 带', cS.ok && cS.spectrum.length === 3);
ok('谱式组合首带 ≈ 29.6 dB', near(cS.spectrum[0], 29.6, 0.3), cS.spectrum[0]);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
