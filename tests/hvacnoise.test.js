/*
 * hvacnoise.test.js — 设备与管道声学内核逻辑测试 (node tests/hvacnoise.test.js)
 * 验证设备声功率→房间声压级、风管元件 TL、ISO 3744/3746 声功率测定等。
 */
var H = require('../public/js/hvacnoise.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var band17 = H.GRID_HZ;
var flat = band17.map(function () { return 100; });

console.log('\n[1] A 计权与房间常数');
ok('A(1000Hz) ≈ 0 dB', near(H.aWeight(1000), 0, 0.05), H.aWeight(1000));
ok('A(100Hz) ≈ −19.1 dB', near(H.aWeight(100), -19.1, 0.2), H.aWeight(100));
ok('房间常数 R(94, 0.25) ≈ 31.33', near(H.roomConstant(94, 0.25), 31.33, 0.1), H.roomConstant(94, 0.25));
ok('α≥1 返回 null', H.roomConstant(94, 1) === null);

console.log('\n[2] 设备声功率 → 房间声压级');
var sp = H.equipmentSPL({ Lw: flat, bands: band17, R: 31.67, Q: 1, r: 3 });
ok('设备→房间计算成功', sp.ok);
var lp1k = sp.spectrum.filter(function (p) { return p.f === 1000; })[0];
// Lp = 100 + 10lg(1/(4π·9) + 4/31.67) = 100 - 8.69 = 91.31
ok('1000Hz 处 Lp ≈ 91.3 dB', near(lp1k.Lp, 91.3, 0.2), lp1k.Lp);
ok('总 A 声级有限', isFinite(sp.overallA));
ok('缺房间常数报错', !H.equipmentSPL({ Lw: flat, R: -1 }).ok);

console.log('\n[3] 风管元件传声损失');
ok('直管 TL = L·rate = 2.5 dB', near(H.straightDuctTL({ L: 5, ratePerM: 0.5 }), 2.5, 1e-9));
ok('弯头(2000Hz, 0.3m)：TL ≈ 5.4 dB', near(H.elbowTL({ freq: 2000, width: 0.3 }), 5.4, 0.3), H.elbowTL({ freq: 2000, width: 0.3 }));
ok('弯头(200Hz < fc)：TL = 0', near(H.elbowTL({ freq: 200, width: 0.3 }), 0, 1e-9));
ok('出口端反射(2000Hz,ø0.3,无法兰) ≈ 14.9 dB', near(H.endReflectionTL({ freq: 2000, diameter: 0.3, flanged: false }), 14.9, 0.3), H.endReflectionTL({ freq: 2000, diameter: 0.3 }));
ok('出口端反射(100Hz) ≈ 0.3 dB', near(H.endReflectionTL({ freq: 100, diameter: 0.3 }), 0.3, 0.1));

console.log('\n[4] 风管路径叠加');
var dp = H.ductPath({
  Lw: band17.map(function () { return 90; }), bands: band17,
  segments: [
    { type: 'straight', L: 5, ratePerM: 1 },
    { type: 'elbow', width: 0.3 },
    { type: 'end', diameter: 0.3, flanged: false }
  ],
  R: 31.67, Q: 1, r: 3
});
ok('路径叠加成功', dp.ok);
ok('逐带 TL 均为有限值', dp.tlSpectrum.every(function (v) { return isFinite(v); }));
ok('出口 Lw 低于入口（被衰减）', dp.outletLw.every(function (v) { return v < 90; }));
ok('给出房间声压级', dp.room && isFinite(dp.room.overallA));

console.log('\n[5] 声功率测定 ISO 3744/3746');
ok('半球面 S(2m) = 25.13 m²', near(H.hemisphereSurface(2), 25.13, 0.05), H.hemisphereSurface(2));
ok('矩形包络 S(1,1,1,0.5) = 16 m²', near(H.boxSurface(1, 1, 1, 0.5), 16, 1e-9), H.boxSurface(1, 1, 1, 0.5));
var oct = H.OCT_HZ;
var lp6 = [70, 75, 80, 78, 72, 65];
var sw = H.soundPowerISO({ LpMean: lp6, bands: oct, S: 1, K1: 0, K2: 0 });
ok('声功率计算成功', sw.ok);
ok('S=1 时 Lw = Lp', sw.spectrum.every(function (p) { return near(p.Lw, p.Lp, 1e-9); }));
ok('总声功率级有限 > 0', isFinite(sw.overallLw) && sw.overallLw > 0, sw.overallLw);
var sw2 = H.soundPowerISO({ LpMean: lp6, bands: oct, S: 25.13, K1: 3, K2: 0 });
ok('加大测量面 + 背景修正抬高 Lw', sw2.spectrum[0].Lw > sw.spectrum[0].Lw, sw2.spectrum[0].Lw + ' vs ' + sw.spectrum[0].Lw);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
