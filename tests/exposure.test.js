/*
 * exposure.test.js — 职业噪声暴露量计算内核测试 (node tests/exposure.test.js)
 *
 * 锚点全部用可手算的解析值：
 *   - L_EX,8h = 10lg(Σ10^(L/10)t/8)：8h@85 = 85.00；4h@90+4h@80 = 87.40
 *   - NIOSH 3 dB：T(88)=4h、T(95)=0.7937h；OSHA 5 dB：T(95)=4h
 *   - TWA：NIOSH 85+10lg(D/100)；OSHA 90+16.61lg(D/100)（D=200% → 95.00）
 *   - 延长班次：NIOSH 9h → 84.49；OSHA AL 10h → 83.39
 *   - GBZ 2.2 表10 脉冲限值；GBZ/T 229.4 表1/表2 分级；NRR 折算（109−22=87）
 */
var E = require('../public/js/exposure.js');
var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.01 : tol); }

console.log('\n[1] L_EX,8h 等能量计算');
ok('8h@85 = 85.00', close(E.lex8h([{ L: 85, h: 8 }]), 85.0, 0.005), E.lex8h([{ L: 85, h: 8 }]));
ok('4h@90+4h@80 = 87.40', close(E.lex8h([{ L: 90, h: 4 }, { L: 80, h: 4 }]), 87.4036, 0.005));
ok('1h@100+7h@80 = 91.26', close(E.lex8h([{ L: 100, h: 1 }, { L: 80, h: 7 }]), 91.2628, 0.005), E.lex8h([{ L: 100, h: 1 }, { L: 80, h: 7 }]));
ok('能量与时长线性：2h@90 = 1h@93.01', close(E.lex8h([{ L: 90, h: 2 }]), E.lex8h([{ L: 93.0103, h: 1 }]), 0.01));
ok('空段返回 null', E.lex8h([]) === null);
ok('非法段被忽略', close(E.lex8h([{ L: 90, h: 4 }, { L: 0, h: 4 }]), 90 - 10 * Math.log10(2), 0.005));

console.log('\n[2] L_EX,40h 与总时长');
var ex = E.exampleSegments();
ok('例题总时长 = 8h', close(E.totalHours(ex), 8, 1e-9));
ok('例题 L_EX,8h = 90.59', close(E.lex8h(ex), 90.5916, 0.01), E.lex8h(ex));
ok('例题 L_EX,40h = 83.60', close(E.lex40h(ex), 83.6016, 0.01), E.lex40h(ex));

console.log('\n[3] 允许暴露时间（NIOSH 3 dB / OSHA 5 dB）');
[[85, 8], [88, 4], [91, 2], [94, 1], [97, 0.5], [100, 0.25]].forEach(function (r) {
  ok('NIOSH ' + r[0] + ' dB → ' + r[1] + ' h', close(E.allowedTime(r[0], 'niosh'), r[1], 1e-9));
});
[[90, 8], [95, 4], [100, 2], [105, 1], [110, 0.5], [115, 0.25]].forEach(function (r) {
  ok('OSHA ' + r[0] + ' dB → ' + r[1] + ' h', close(E.allowedTime(r[0], 'osha'), r[1], 1e-9));
});
ok('OSHA AL 88 dB → 5.28h', close(E.allowedTime(88, 'osha-al'), 5.2780, 0.005), E.allowedTime(88, 'osha-al'));
ok('非法输入返回 null', E.allowedTime(0, 'niosh') === null && E.allowedTime(-5, 'osha') === null);

console.log('\n[4] 剂量与 TWA');
// NIOSH: 4h@88(T=4) + 2h@95(T=0.79370) + 2h@82(T=16)
ok('例题 NIOSH 剂量 = 364.50%', close(E.dose(ex, 'niosh'), 364.50, 0.05), E.dose(ex, 'niosh'));
ok('例题 NIOSH TWA = 90.62', close(E.twaFromDose(E.dose(ex, 'niosh'), 'niosh'), 90.6176, 0.02));
// OSHA: T(88)=10.5561、T(95)=4、T(82)=24.2515
ok('例题 OSHA 剂量 = 96.14%', close(E.dose(ex, 'osha'), 96.14, 0.05), E.dose(ex, 'osha'));
ok('例题 OSHA TWA = 89.72', close(E.twaFromDose(E.dose(ex, 'osha'), 'osha'), 89.7158, 0.02));
ok('NIOSH 2h@91 剂量 = 100%', close(E.dose([{ L: 91, h: 2 }], 'niosh'), 100, 0.01));
ok('OSHA 4h@95 剂量 = 100%', close(E.dose([{ L: 95, h: 4 }], 'osha'), 100, 0.01));
ok('NIOSH TWA(200%) = 88.01', close(E.twaFromDose(200, 'niosh'), 88.0103, 0.005));
ok('OSHA TWA(200%) = 95.00', close(E.twaFromDose(200, 'osha'), 95.0002, 0.005));
ok('OSHA AL TWA(200%) = 90.00', close(E.twaFromDose(200, 'osha-al'), 90.0002, 0.005));
ok('零剂量返回 null', E.twaFromDose(0, 'niosh') === null);
// 3 dB 与 5 dB 分歧：92 dB 长时暴露，NIOSH 允许 1.59h；OSHA 允许 6.06h
ok('92 dB：NIOSH 允许 1.59h / OSHA 允许 6.06h', close(E.allowedTime(92, 'niosh'), 1.5874, 0.005) && close(E.allowedTime(92, 'osha'), 6.0629, 0.005));

console.log('\n[5] 延长班次限值调整');
ok('NIOSH 9h → 84.49', close(E.extendedRel(9, 'niosh'), 84.4885, 0.005), E.extendedRel(9, 'niosh'));
ok('NIOSH 12h → 83.24', close(E.extendedRel(12, 'niosh'), 83.2391, 0.005));
ok('OSHA AL 9h → 84.15', close(E.extendedRel(9, 'osha-al'), 84.1500, 0.01), E.extendedRel(9, 'osha-al'));
ok('OSHA AL 10h → 83.39', close(E.extendedRel(10, 'osha-al'), 83.3908, 0.01));
ok('OSHA AL 12h → 82.08', close(E.extendedRel(12, 'osha-al'), 82.0748, 0.01));
ok('OSHA PEL 不随班次调整（12h 仍 90）', close(E.extendedRel(12, 'osha'), 90, 1e-9));
ok('≤8h 返回基准值', close(E.extendedRel(6, 'niosh'), 85, 1e-9) && close(E.extendedRel(8, 'osha-al'), 85, 1e-9));

console.log('\n[6] GBZ/T 229.4 连续噪声作业分级');
ok('79 dB → 非噪声作业', E.noiseGrade(79).grade === '—');
ok('82 dB → 健康监护', E.noiseGrade(82).grade === '监护' && E.noiseGrade(82).watch === true);
ok('84.9 dB → 监护', E.noiseGrade(84.9).grade === '监护');
ok('85 dB → I 级轻度危害', E.noiseGrade(85).grade === 'I' && E.noiseGrade(85).label === '轻度危害');
ok('89.9 dB → I 级', E.noiseGrade(89.9).grade === 'I');
ok('90 dB → II 级中度危害', E.noiseGrade(90).grade === 'II' && E.noiseGrade(90).label === '中度危害');
ok('95 dB → III 级重度危害', E.noiseGrade(95).grade === 'III');
ok('100 dB → IV 级极重危害', E.noiseGrade(100).grade === 'IV' && E.noiseGrade(100).label === '极重危害');
ok('110 dB → IV 级', E.noiseGrade(110).grade === 'IV');
ok('非法输入返回 null', E.noiseGrade(null) === null && E.noiseGrade('x') === null && E.noiseGrade(undefined) === null);

console.log('\n[7] GBZ 2.2 脉冲噪声峰值限值（表10）');
ok('n=50 → 140 dB', E.peakLimit(50) === 140);
ok('n=100 → 140 dB（含边界）', E.peakLimit(100) === 140);
ok('n=101 → 130 dB', E.peakLimit(101) === 130);
ok('n=1000 → 130 dB（含边界）', E.peakLimit(1000) === 130);
ok('n=1001 → 120 dB', E.peakLimit(1001) === 120);
ok('n=10000 → 120 dB（含边界）', E.peakLimit(10000) === 120);
ok('n=20000 → null（超表列范围）', E.peakLimit(20000) === null);
ok('非法输入返回 null', E.peakLimit(null) === null && E.peakLimit('x') === null && E.peakLimit(-1) === null);

console.log('\n[8] GBZ/T 229.4 脉冲噪声作业分级（表2）');
ok('140.5 dB / n=50 → I 级', E.peakGrade(140.5, 50).grade === 'I');
ok('143 dB / n=50 → II 级', E.peakGrade(143, 50).grade === 'II');
ok('146 dB / n=50 → III 级', E.peakGrade(146, 50).grade === 'III');
ok('148 dB / n=50 → IV 级', E.peakGrade(148, 50).grade === 'IV' && E.peakGrade(148, 50).label === '极重危害');
ok('131 dB / n=500 → I 级', E.peakGrade(131, 500).grade === 'I');
ok('134 dB / n=500 → II 级', E.peakGrade(134, 500).grade === 'II');
ok('136 dB / n=500 → III 级', E.peakGrade(136, 500).grade === 'III');
ok('138 dB / n=500 → IV 级', E.peakGrade(138, 500).grade === 'IV');
ok('121 dB / n=5000 → I 级', E.peakGrade(121, 5000).grade === 'I');
ok('123.5 dB / n=5000 → II 级', E.peakGrade(123.5, 5000).grade === 'II');
ok('126 dB / n=5000 → III 级', E.peakGrade(126, 5000).grade === 'III');
ok('130 dB / n=5000 → IV 级', E.peakGrade(130, 5000).grade === 'IV');
ok('低于 I 级下限返回 null', E.peakGrade(139, 50) === null);
ok('非法输入返回 null', E.peakGrade(null, 50) === null && E.peakGrade(140, 'x') === null);

console.log('\n[9] 护听器配备建议（管理规范）');
ok('79 dB → 不要求配备', E.ppeAdvice(79).need === false);
ok('82 dB → 按需配备', E.ppeAdvice(82).need === true && E.ppeAdvice(82).text.indexOf('按劳动者需求') >= 0);
ok('90 dB → 必须配备 SNR 17~34', E.ppeAdvice(90).need === true && E.ppeAdvice(90).text.indexOf('17~34') >= 0);
ok('100 dB → SNR ≥34 或双防护', E.ppeAdvice(100).need === true && E.ppeAdvice(100).text.indexOf('双防护') >= 0);
ok('非法输入返回 null', E.ppeAdvice(null) === null && E.ppeAdvice('x') === null);
ok('双防护 = 较高值 +5 dB', close(E.dualAttenuation(29, 25), 34, 1e-9) && close(E.dualAttenuation(20, 25), 30, 1e-9));

console.log('\n[10] NRR / SNR 折算');
// OSHA 附录B：109 dBA、NRR 29 → 109 − (29−7) = 87
ok('OSHA 附录B：109−(29−7) = 87', close(E.protectedNrr(109, 29, 'muff', 'osha', 'A'), 87, 0.005));
ok('OSHA 技术手册 50%：109−11 = 98', close(E.protectedNrr(109, 29, 'muff', 'osha-otm', 'A'), 98, 0.005));
// NIOSH：耳罩折 25% → (0.75×29)−7 = 14.75 → 94.25
ok('NIOSH 耳罩：109−14.75 = 94.25', close(E.protectedNrr(109, 29, 'muff', 'niosh', 'A'), 94.25, 0.005));
// NIOSH：泡沫耳塞折 50% → 0.5×29−7 = 7.5 → 101.5
ok('NIOSH 泡沫耳塞：109−7.5 = 101.5', close(E.protectedNrr(109, 29, 'foam', 'niosh', 'A'), 101.5, 0.005));
// NIOSH：其他耳塞折 70% → 0.3×29−7 = 1.7 → 107.3
ok('NIOSH 其他耳塞：109−1.7 = 107.3', close(E.protectedNrr(109, 29, 'plug', 'niosh', 'A'), 107.3, 0.005));
// C 计权输入：OSHA 附录B 直接减 NRR
ok('C 计权 OSHA：109−29 = 80', close(E.protectedNrr(109, 29, 'muff', 'osha', 'C'), 80, 0.005));
// ISO 4869-2 SNR 法（HSE 折减 4 dB）：95 − (28−4) = 71
ok('SNR 法：95−(28−4) = 71', close(E.protectedSnr(95, 28, 4), 71, 0.005));
ok('SNR 法无折减：95−28 = 67', close(E.protectedSnr(95, 28, 0), 67, 0.005));
ok('达标 80 dB 所需 SNR = 95−80+4 = 19', close(E.requiredSnr(95, 80, 4), 19, 0.005));
ok('非法输入返回 null', E.protectedNrr(null, 29, 'muff', 'osha', 'A') === null && E.protectedSnr(95, null) === null);

console.log('\n[11] 文本解析');
var p1 = E.parseSegments('90,4; 95,2');
ok('分号+逗号解析 2 段', p1.segments.length === 2 && p1.segments[0].L === 90 && p1.segments[1].h === 2 && p1.bad.length === 0);
var p2 = E.parseSegments('88 4\n95 2');
ok('空格+换行解析 2 段', p2.segments.length === 2 && p2.segments[0].L === 88 && p2.bad.length === 0);
var p3 = E.parseSegments('90,4; abc; 95,2');
ok('非法行进入 bad', p3.segments.length === 2 && p3.bad.length === 1 && p3.bad[0] === 'abc');
var p4 = E.parseSegments('90,0');
ok('零时长进入 bad', p4.segments.length === 0 && p4.bad.length === 1);
ok('中文逗号兼容', E.parseSegments('90，4').segments.length === 1);
ok('空文本返回空', E.parseSegments('').segments.length === 0 && E.parseSegments(null).segments.length === 0);

console.log('\n[12] 例题自洽性');
// 例题 L_EX,8h(90.59) ≈ NIOSH TWA(90.62)：3 dB 交换率即等能量
ok('L_EX,8h ≈ NIOSH TWA（3 dB 等能量）', Math.abs(E.lex8h(ex) - E.twaFromDose(E.dose(ex, 'niosh'), 'niosh')) < 0.05);
// 5 dB 交换率低估高量级风险：OSHA TWA(89.72) < L_EX,8h(90.59)
ok('OSHA TWA < L_EX,8h（5 dB 低估高量级）', E.twaFromDose(E.dose(ex, 'osha'), 'osha') < E.lex8h(ex));
// 例题超 GBZ 限值
ok('例题超 GBZ 85 dB 限值', E.lex8h(ex) > 85);

console.log('\n==== exposure 测试汇总：' + passed + ' passed, ' + failed + ' failed ====');
if (failed > 0) { process.exit(1); }
