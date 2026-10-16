/*
 * audiolevel.test.js — 音频电平与阻抗内核测试 (node tests/audiolevel.test.js)
 *
 * 锚点（可核对的公认数值）：
 *   0 dBV = 1 Vrms，0 dBu = √0.6 = 0.7746 Vrms，dBu = dBV + 2.2185
 *   0 dBm（600 Ω 负载）= 1 mW = 0.7746 V = 0 dBu
 *   +4 dBu = 1.2278 V（专业线路电平）；−10 dBV = 0.3162 V（消费级）
 *   满刻度 +24 dBu = 12.278 V → +4 dBu 恰好是 −20 dBFS
 *   100 W / 8 Ω → V = √800 = 28.284 V = 29.03 dBV = 31.25 dBu
 *   灵敏度：8 Ω 时 1 W/1 m 与 2.83 V/1 m 相等；4 Ω 时差 +3 dB，16 Ω 时 −3 dB
 *   恒压功放：并联 N 只 +10 lg N，串联 N 只 −10 lg N，2 串 2 并 0 dB
 *   SPL：90 dB@1W1m、100 W、10 m → 90 dB；每倍距离 −6 dB
 *   铜 2.5 mm²：6.896 mΩ/m（单程）；AWG 12 = 3.309 mm² → 5.21 mΩ/m
 *   阻尼系数 DF = Z_load / Z_source；线损 20 lg(Z/(Z+R_s))
 */
var A = require('../public/js/audiolevel.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
}

console.log('\n[1] 电平基准与换算');

ok('V0_DBV = 1 V', near(A.V0_DBV, 1, 1e-12));
ok('V0_DBU = √0.6 = 0.774597 V', near(A.V0_DBU, 0.774597, 1e-5), A.V0_DBU);
ok('1 V → 0 dBV', near(A.dbv(1), 0, 1e-12));
ok('1 V → +2.2185 dBu', near(A.dbu(1), 2.2185, 1e-3), A.dbu(1));
ok('dBu = dBV + 2.2185（任意电压）', near(A.dbu(3.7) - A.dbv(3.7), 2.2185, 1e-4), A.dbu(3.7) - A.dbv(3.7));
ok('+4 dBu = 1.2278 V', near(A.vFromDbu(4), 1.2278, 1e-3), A.vFromDbu(4));
ok('−10 dBV = 0.3162 V', near(A.vFromDbv(-10), 0.31623, 1e-4), A.vFromDbv(-10));
ok('−10 dBV 换算为 −7.7815 dBu', near(A.dbu(A.vFromDbv(-10)), -7.7815, 1e-3), A.dbu(A.vFromDbv(-10)));
ok('0 dBm（600 Ω）= 0 dBu', near(A.dbm(A.V0_DBU, 600), 0, 1e-9), A.dbm(A.V0_DBU, 600));
ok('0.7746 V / 600 Ω = 1 mW', near(A.watts(A.V0_DBU, 600), 0.001, 1e-9));
ok('100 W / 8 Ω → 28.284 V', near(A.vFromWatts(100, 8), 28.2843, 1e-3), A.vFromWatts(100, 8));
ok('28.284 V → 29.03 dBV', near(A.dbv(28.2843), 29.031, 1e-2), A.dbv(28.2843));
ok('28.284 V → 31.25 dBu', near(A.dbu(28.2843), 31.249, 1e-2), A.dbu(28.2843));
ok('100 W → 20 dBW', near(A.dbw(100), 20, 1e-12));
ok('正弦波峰因数 3.0103 dB → 1 Vrms 峰值 1.4142 V',
  near(A.crestConvert(1, 3.0103, true), Math.SQRT2, 1e-4), A.crestConvert(1, 3.0103, true));
ok('峰值 1.4142 V 反算回 1 Vrms',
  near(A.crestConvert(Math.SQRT2, 3.0103, false), 1, 1e-4), A.crestConvert(Math.SQRT2, 3.0103, false));

console.log('\n[2] 满刻度与 dBFS');

var VFS24 = A.fullScaleVolts(24);
ok('+24 dBu 满刻度 = 12.276 V', near(VFS24, 12.2765, 1e-3), VFS24);
ok('+4 dBu 在 +24 dBu 满刻度下 = −20 dBFS',
  near(A.dbfs(1.2278, VFS24), -20, 0.01), A.dbfs(1.2278, VFS24));
ok('0 dBFS 反算 = 满刻度电压', near(A.vFromDbfs(0, VFS24), VFS24, 1e-9));
ok('−6 dBFS = 满刻度的 0.5012 倍',
  near(A.vFromDbfs(-6, VFS24) / VFS24, Math.pow(10, -6 / 20), 1e-9), A.vFromDbfs(-6, VFS24));
ok('−20 dBFS 反算 = 1.2278 V', near(A.vFromDbfs(-20, VFS24), 1.2278, 1e-3), A.vFromDbfs(-20, VFS24));
ok('五个满刻度基准单调递增',
  A.FULL_SCALE.every(function (f, i) { return i === 0 || f.dbu > A.FULL_SCALE[i - 1].dbu; }));

console.log('\n[3] levels() 全景与 fromUnit() 反解');

var L = A.levels({ volts: 1, impedance: 8, vfs: A.fullScaleVolts(24) });
ok('1 V / 8 Ω → 0.125 W', near(L.watts, 0.125, 1e-12));
ok('1 V 峰值 1.4142 V', near(L.peak, Math.SQRT2, 1e-12));
ok('1 V 峰峰值 2.8284 V', near(L.pp, 2 * Math.SQRT2, 1e-12));
ok('1 V → 0 dBV', near(L.dBV, 0, 1e-12));
ok('1 V → 2.2185 dBu', near(L.dBu, 2.2185, 1e-3), L.dBu);
ok('1 V 入 8 Ω = 125 mW → 20.969 dBm', near(L.dBmZ, 20.969, 1e-2), L.dBmZ);
ok('1 V 入 600 Ω = 1.667 mW → 2.2185 dBm', near(L.dBm600, 2.2185, 1e-3), L.dBm600);
ok('0.125 W → −9.031 dBW', near(L.dBW, -9.031, 1e-2), L.dBW);
ok('1 V 距 12.278 V 满刻度还有 21.78 dB', near(L.headroomToFs, 21.78, 0.02), L.headroomToFs);

var u1 = A.fromUnit({ value: 4, unit: 'dbu', impedance: 8, vfs: A.fullScaleVolts(24) });
ok('+4 dBu 反解 = 1.2278 V', near(u1.volts, 1.2278, 1e-3), u1.volts);
ok('+4 dBu → 1.782 dBV', near(u1.dBV, 1.7815, 1e-3), u1.dBV);
ok('+4 dBu → −20 dBFS', near(u1.dBFS, -20, 0.01), u1.dBFS);
var u2 = A.fromUnit({ value: 0, unit: 'dbm', impedance: 600 });
ok('0 dBm（600 Ω）反解 = 0.7746 V', near(u2.volts, 0.774597, 1e-5), u2.volts);
ok('0 dBm 反解后 dBu = 0', near(u2.dBu, 0, 1e-9));
var u3 = A.fromUnit({ value: 20, unit: 'dbw', impedance: 8 });
ok('20 dBW / 8 Ω 反解 = 28.284 V', near(u3.volts, 28.2843, 1e-3), u3.volts);
var u4 = A.fromUnit({ value: -20, unit: 'dbfs', impedance: 8, vfs: A.fullScaleVolts(24) });
ok('−20 dBFS 反解 = 1.2278 V', near(u4.volts, 1.2278, 1e-3), u4.volts);
var u5 = A.fromUnit({ value: 1, unit: 'v', impedance: 8 });
ok('单位 v 直通', near(u5.volts, 1, 1e-12));
ok('未知单位按电压直通', near(A.fromUnit({ value: 2, unit: 'xxx' }).volts, 2, 1e-12));

console.log('\n[4] 内置电平锚点自洽');

A.LEVEL_PRESETS.forEach(function (p) {
  ok('锚点「' + p.name + '」电压→dBV 自洽',
    near(A.dbv(p.v), p.dbv, 0.02), A.dbv(p.v) + ' vs ' + p.dbv);
  ok('锚点「' + p.name + '」电压→dBu 自洽',
    near(A.dbu(p.v), p.dbu, 0.02), A.dbu(p.v) + ' vs ' + p.dbu);
});

console.log('\n[5] 灵敏度 1 W/1 m ↔ 2.83 V/1 m');

var s8 = A.sensitivity({ mode: '1w', spl: 90, z: 8 });
ok('8 Ω：1 W/1 m 与 2.83 V/1 m 相等', near(s8.spl283v1m, 90, 1e-9), s8.spl283v1m);
ok('8 Ω：1 W 对应 2.828 V', near(s8.v1w, 2.8284, 1e-3), s8.v1w);
ok('8 Ω：2.83 V 注入 1.001 W', near(s8.p283, 1.0014, 1e-3), s8.p283);
ok('8 Ω：1 V/1 m = 80.97 dB', near(s8.spl1v1m, 80.969, 1e-2), s8.spl1v1m);
var s4 = A.sensitivity({ mode: '1w', spl: 90, z: 4 });
ok('4 Ω：2.83 V/1 m 比 1 W/1 m 高 3.01 dB', near(s4.spl283v1m - 90, 3.0103, 1e-3), s4.spl283v1m);
ok('4 Ω：1 W 对应 2 V', near(s4.v1w, 2, 1e-12));
var s16 = A.sensitivity({ mode: '1w', spl: 90, z: 16 });
ok('16 Ω：2.83 V/1 m 比 1 W/1 m 低 3.01 dB', near(s16.spl283v1m - 90, -3.0103, 1e-3), s16.spl283v1m);
ok('16 Ω：1 W 对应 4 V', near(s16.v1w, 4, 1e-12));
var sb = A.sensitivity({ mode: '2.83v', spl: 93, z: 4 });
ok('由 2.83 V 标注反推 1 W/1 m ≈ 90 dB（2.83 与 2√2 的 0.01 dB 差）',
  near(sb.spl1w1m, 90, 0.02), sb.spl1w1m);
var sc = A.sensitivity({ mode: '1v', spl: 80.969, z: 8 });
ok('由 1 V 标注反推 1 W/1 m = 90 dB', near(sc.spl1w1m, 90, 0.01), sc.spl1w1m);
ok('三套标注往返一致（8 Ω / 90 dB）',
  near(A.sensitivity({ mode: '1v', spl: s8.spl1v1m, z: 8 }).spl1w1m, 90, 1e-9));

console.log('\n[6] 串并联阻抗与 SPL 增减');

ok('2 只 8 Ω 并联 = 4 Ω', near(A.arrayImpedance({ z: 8, n: 2, wiring: 'parallel' }).z, 4, 1e-12));
ok('4 只 8 Ω 并联 = 2 Ω', near(A.arrayImpedance({ z: 8, n: 4, wiring: 'parallel' }).z, 2, 1e-12));
ok('4 只 8 Ω 串联 = 32 Ω', near(A.arrayImpedance({ z: 8, n: 4, wiring: 'series' }).z, 32, 1e-12));
ok('2 串 2 并（4 只 8 Ω）= 8 Ω',
  near(A.arrayImpedance({ z: 8, n: 4, wiring: 'sp', perGroup: 2 }).z, 8, 1e-12));
ok('串并联组数计算正确',
  A.arrayImpedance({ z: 8, n: 6, wiring: 'sp', perGroup: 3 }).groups === 2);

var g4p = A.arrayGain({ z: 8, n: 4, wiring: 'parallel', ampVolts: 28.2843 });
ok('并联 4 只：总阻抗 2 Ω', near(g4p.totalZ, 2, 1e-12));
ok('并联 4 只：每只 100 W', near(g4p.perBoxWatts, 100, 0.01), g4p.perBoxWatts);
ok('并联 4 只：总功率 400 W', near(g4p.totalWatts, 400, 0.05), g4p.totalWatts);
ok('并联 4 只：相对单只 +6.02 dB', near(g4p.relDb, 6.0206, 1e-3), g4p.relDb);
var g4s = A.arrayGain({ z: 8, n: 4, wiring: 'series', ampVolts: 28.2843 });
ok('串联 4 只：总阻抗 32 Ω', near(g4s.totalZ, 32, 1e-12));
ok('串联 4 只：总功率 25 W', near(g4s.totalWatts, 25, 0.01), g4s.totalWatts);
ok('串联 4 只：相对单只 −6.02 dB', near(g4s.relDb, -6.0206, 1e-3), g4s.relDb);
var gsp = A.arrayGain({ z: 8, n: 4, wiring: 'sp', perGroup: 2, ampVolts: 28.2843 });
ok('2 串 2 并：总阻抗回到 8 Ω', near(gsp.totalZ, 8, 1e-12));
ok('2 串 2 并：总功率与单只相同（0 dB）', near(gsp.relDb, 0, 1e-9), gsp.relDb);
var g1 = A.arrayGain({ z: 8, n: 1, wiring: 'parallel', ampVolts: 28.2843 });
ok('单只作为基准：0 dB', near(g1.relDb, 0, 1e-12));
ok('并联 2 只 +3.01 dB', near(A.arrayGain({ z: 8, n: 2, wiring: 'parallel' }).relDb, 3.0103, 1e-3));

console.log('\n[7] 功放—音箱：SPL 与选型');

var a1 = A.ampSpl({ spl1w1m: 90, power: 100, distance: 10, n: 1, space: 'half' });
ok('90 dB@1W1m、100 W、10 m → 90 dB', near(a1.spl, 90, 1e-9), a1.spl);
ok('1 m 处为 110 dB', near(a1.spl1m, 110, 1e-9), a1.spl1m);
ok('20 m 处比 10 m 低 6.02 dB',
  near(A.ampSpl({ spl1w1m: 90, power: 100, distance: 20 }).spl, 83.979, 1e-3));
ok('全空间比半空间低 3 dB',
  near(A.ampSpl({ spl1w1m: 90, power: 100, distance: 10, space: 'full' }).spl, 87, 1e-9));
ok('4 只非相干叠加 +6.02 dB',
  near(A.ampSpl({ spl1w1m: 90, power: 100, distance: 10, n: 4 }).spl, 96.021, 1e-3));
ok('4 只理想相干叠加 +12.04 dB',
  near(A.ampSpl({ spl1w1m: 90, power: 100, distance: 10, n: 4, coherence: 'coh' }).spl, 102.041, 1e-3));
ok('功率翻倍 +3.01 dB',
  near(A.ampSpl({ spl1w1m: 90, power: 200, distance: 10 }).spl, 93.010, 1e-3));
ok('4 只时每只承担 25 W',
  near(A.ampSpl({ spl1w1m: 90, power: 100, distance: 10, n: 4 }).perBoxWatts, 25, 1e-12));

var z1 = A.ampSizing({ spl1w1m: 90, targetSpl: 100, distance: 10, n: 1, crestDb: 10, headroomDb: 3 });
ok('目标 100 dB@10 m 需要 1 m 处 120 dB', near(z1.needSpl1m, 120, 1e-9), z1.needSpl1m);
ok('所需连续功率 1000 W', near(z1.rmsWattsPerBox, 1000, 0.5), z1.rmsWattsPerBox);
ok('10 dB 波峰因数 → 峰值 10000 W', near(z1.peakWattsPerBox, 10000, 5), z1.peakWattsPerBox);
ok('3 dB 余量 → 建议 1995 W', near(z1.recommendedWattsPerBox, 1995.3, 2), z1.recommendedWattsPerBox);
ok('不削波取建议值与峰值的大者', near(z1.noClipWattsPerBox, 10000, 5), z1.noClipWattsPerBox);
ok('波峰因数线性值 = 10^(crest/10)', near(z1.crestFactorLinear, 10, 1e-9));
var z2 = A.ampSizing({ spl1w1m: 90, targetSpl: 100, distance: 10, n: 4, crestDb: 10, headroomDb: 3 });
ok('4 只分担后每只需 250 W', near(z2.rmsWattsPerBox, 250, 0.5), z2.rmsWattsPerBox);
ok('选型与 ampSpl 互为逆运算',
  near(A.ampSpl({ spl1w1m: 90, power: z1.rmsWattsPerBox, distance: 10 }).spl, 100, 1e-6));

console.log('\n[8] 线材电阻与查表');

var w1 = A.wire({ length: 10, area: 2.5, material: 'copper' });
ok('铜 2.5 mm² 单程 6.896 mΩ/m', near(w1.mohmPerM, 6.8964, 1e-2), w1.mohmPerM);
ok('10 m 单程 68.96 mΩ', near(w1.rOneWay, 0.068964, 1e-5), w1.rOneWay);
ok('回路电阻为单程的 2 倍', near(w1.rLoop, 2 * w1.rOneWay, 1e-12));
ok('每千米回路 13.79 Ω/km', near(w1.ohmPerKm, 13.7928, 1e-2), w1.ohmPerKm);
ok('铝电阻率高于铜，电阻更大',
  A.wire({ length: 10, area: 2.5, material: 'aluminium' }).rOneWay > w1.rOneWay);
ok('CCA 介于铜与铝之间',
  A.wire({ length: 10, area: 2.5, material: 'cca' }).rOneWay > w1.rOneWay &&
  A.wire({ length: 10, area: 2.5, material: 'cca' }).rOneWay < A.wire({ length: 10, area: 2.5, material: 'aluminium' }).rOneWay);
ok('60 ℃ 铜线电阻比 20 ℃ 高约 15.7%',
  near(A.wire({ length: 10, area: 2.5, temp: 60 }).rOneWay / w1.rOneWay, 1 + 0.00393 * 40, 1e-9));
ok('截面积加倍电阻减半',
  near(A.wire({ length: 10, area: 5 }).rOneWay, w1.rOneWay / 2, 1e-12));
var wt = A.wireTable();
ok('线规表含 12 个公制规格 + 14 个 AWG', wt.length === 12 + 14, wt.length);
ok('AWG 12 单程 5.21 mΩ/m',
  near(wt.filter(function (r) { return r.label === 'AWG 12'; })[0].mohmPerM, 5.21, 0.02));
ok('4 mm² 单程 4.31 mΩ/m',
  near(wt.filter(function (r) { return r.label === '4 mm²'; })[0].mohmPerM, 4.310, 0.01));

console.log('\n[9] 阻尼系数与线损');

var d0 = A.damping({ zLoad: 8, zAmp: 0.02, rLoop: 0 });
ok('无线材时 DF = 8 / 0.02 = 400', near(d0.dampingFactor, 400, 1e-9), d0.dampingFactor);
ok('仅功放内阻 0.02 Ω 时线损 −0.022 dB', near(d0.lossDb, -0.0217, 1e-3), d0.lossDb);
ok('功放内阻与线阻均为 0 时线损恰为 0 dB', near(A.damping({ zLoad: 8, zAmp: 0, rLoop: 0 }).lossDb, 0, 1e-12));
var d1 = A.damping({ zLoad: 8, zAmp: 0.02, rLoop: 0.13793 });
ok('10 m 铜 2.5 mm²：DF = 50.66', near(d1.dampingFactor, 50.66, 0.05), d1.dampingFactor);
ok('线损 −0.17 dB', near(d1.lossDb, -0.1706, 1e-3), d1.lossDb);
ok('送达功率比 96.1%', near(d1.powerRatio, 0.9614, 1e-3), d1.powerRatio);
ok('线材耗散 3.86%', near(d1.wireWaste, 0.0386, 1e-3), d1.wireWaste);
ok('DF 50.66 判为「优秀」', d1.grade === '优秀', d1.grade);
ok('线材主导（0.138 Ω > 0.02 Ω）', d1.wireDominant === true);
ok('DF 25 → 良好', A.damping({ zLoad: 8, zAmp: 0.02, rLoop: 0.3 }).grade === '良好');
ok('DF 12 → 可接受', A.damping({ zLoad: 8, zAmp: 0.02, rLoop: 0.6467 }).grade === '可接受');
ok('DF 5 → 偏低', A.damping({ zLoad: 8, zAmp: 0.02, rLoop: 1.58 }).grade.indexOf('偏低') === 0);
ok('回路电阻 1 Ω、8 Ω 负载 → 线损 −1.023 dB',
  near(A.damping({ zLoad: 8, zAmp: 0, rLoop: 1 }).lossDb, -1.0231, 1e-3),
  A.damping({ zLoad: 8, zAmp: 0, rLoop: 1 }).lossDb);
ok('4 Ω 负载比 8 Ω 对线损更敏感',
  A.damping({ zLoad: 4, zAmp: 0, rLoop: 0.5 }).lossDb < A.damping({ zLoad: 8, zAmp: 0, rLoop: 0.5 }).lossDb);

console.log('\n[10] 允许线长反算');

var m1 = A.maxLength({ zLoad: 8, zAmp: 0.02, area: 2.5, maxLossDb: 0.5, minDamping: 20 });
ok('2.5 mm²：允许回路电阻 0.38 Ω', near(m1.maxRSource, 0.38, 1e-9), m1.maxRSource);
ok('受阻尼约束（而非线损约束）', m1.limitBy === 'damping', m1.limitBy);
ok('允许线长 27.6 m', near(m1.maxLen, 27.55, 0.1), m1.maxLen);
var m2 = A.maxLength({ zLoad: 8, zAmp: 0.02, area: 2.5, maxLossDb: 0.2, minDamping: 5 });
ok('收紧线损到 0.2 dB 后改由线损约束', m2.limitBy === 'loss', m2.limitBy);
ok('0.2 dB 约束下允许线长 12.06 m', near(m2.maxLen, 12.06, 0.1), m2.maxLen);
var m3 = A.maxLength({ zLoad: 8, zAmp: 0.02, area: 6, minDamping: 20, maxLossDb: 0.5 });
ok('6 mm² 允许线长约为 2.5 mm² 的 2.4 倍', near(m3.maxLen / m1.maxLen, 2.4, 0.02), m3.maxLen / m1.maxLen);
ok('4 Ω 负载允许线长约为 8 Ω 的一半',
  near(A.maxLength({ zLoad: 4, zAmp: 0.02, area: 2.5, minDamping: 20, maxLossDb: 5 }).maxLen / m1.maxLen, 0.5, 0.03));
ok('maxLength 与 damping 自洽（取允许长度时 DF = 20）',
  near(A.damping({ zLoad: 8, zAmp: 0.02, rLoop: m1.maxLen * m1.rLoopPerM }).dampingFactor, 20, 1e-6));

console.log('\n[11] IEC 60268-5 阻抗下限');

var i1 = A.impedanceCheck({ zNominal: 8, zMin: 6.4 });
ok('最小阻抗为标称 80% 判为合格', i1.pass === true && near(i1.ratio, 0.8, 1e-12));
ok('8 Ω 下限 = 6.4 Ω', near(i1.limit, 6.4, 1e-12));
var i2 = A.impedanceCheck({ zNominal: 8, zMin: 5 });
ok('最小阻抗 5 Ω 判为不合格', i2.pass === false);
ok('峰值电流计算：28.28 V / 6.4 Ω = 4.42 A', near(i1.peakCurrent(28.284), 4.4194, 1e-3), i1.peakCurrent(28.284));
ok('功放选型区间为连续功率的 1.5~2 倍',
  near(i1.ampRange(200).low, 300, 1e-12) && near(i1.ampRange(200).high, 400, 1e-12));
ok('默认最小阻抗取标称 80%', near(A.impedanceCheck({ zNominal: 4 }).zMin, 3.2, 1e-12));

console.log('\n[12] 边界与健壮性');

ok('0 V → −240 dBV（下限截断而非 −Infinity）', isFinite(A.dbv(0)) && A.dbv(0) < -200, A.dbv(0));
ok('负电压按绝对值取对数', near(A.dbv(-2), A.dbv(2), 1e-12));
ok('阻抗 0 时功率为 0', A.watts(10, 0) === 0);
ok('功率 0 → 0 V', near(A.vFromWatts(0, 8), 0, 1e-12));
ok('n = 1 串并联仍为单只阻抗',
  near(A.arrayImpedance({ z: 8, n: 1, wiring: 'series' }).z, 8, 1e-12));
ok('距离 1 m 时衰减 0 dB', near(A.ampSpl({ spl1w1m: 90, power: 1, distance: 1 }).spl, 90, 1e-9));
ok('1 W / 1 m 基准：spl1m = 灵敏度', near(A.ampSpl({ spl1w1m: 95, power: 1, distance: 1 }).spl1m, 95, 1e-9));
ok('波峰因数表首项为正弦 3.01 dB', near(A.CREST[0].db, 3.01, 0.01), A.CREST[0].db);
ok('导体库含铜/铝/银/CCA', ['copper', 'aluminium', 'silver', 'cca'].every(function (k) { return !!A.CONDUCTOR[k]; }));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
