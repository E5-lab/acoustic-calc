/*
 * muffler.test.js — 消声器计算内核单元测试
 * 运行：node tests/muffler.test.js
 */
'use strict';

const M = require('../public/js/muffler.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function approx(name, actual, expected, tol) {
  const a = Number(actual), e = Number(expected);
  if (!isFinite(a) || Math.abs(a - e) > (tol == null ? 1e-6 : tol)) {
    failed++; console.log('  FAIL  ' + name + '（实际 ' + a + '，期望 ' + e + '）');
  } else {
    passed++; console.log('  PASS  ' + name);
  }
}

console.log('通用工具');
approx('A 计权 @1kHz ≈ 0 dB', M.aWeight(1000), 0, 0.7);
approx('A 计权 @63Hz ≈ -26.2 dB', M.aWeight(63), -26.2, 0.3);
approx('能量叠加：90+90=93.01 dB', M.sumDb([90, 90]), 10 * Math.log10(2) + 90, 1e-9);
approx('能量叠加忽略空值', M.sumDb([90, null, 90]), 10 * Math.log10(2) + 90, 1e-9);

console.log('消声系数 φ(α₀)');
approx('φGB(0)=0', M.phiGB(0), 0, 1e-9);
approx('φGB(0.3)=0.40（表 6.3.1）', M.phiGB(0.3), 0.40, 1e-9);
approx('φGB(0.5)=0.70（表 6.3.1）', M.phiGB(0.5), 0.70, 1e-9);
approx('φGB(0.9)=1.50（表 6.3.1）', M.phiGB(0.9), 1.50, 1e-9);
approx('φGB(0.35) 线性插值=0.475', M.phiGB(0.35), 0.475, 1e-9);
approx('φPerov(0.5)=4.34(1−√0.5)/(1+√0.5)', M.phiPerov(0.5), 4.34 * (1 - Math.SQRT1_2) / (1 + Math.SQRT1_2), 1e-9);
approx('φGB 越界截断到 [0,1]', M.phiGB(2), 1.5, 1e-9);

console.log('通道几何');
// 片式：3 片 → 4 通道，S = 4×0.15×1 = 0.6 m²，P = 2×1×4 = 8 m
var ch = M.channel({ form: 'splitter', blades: 3, gap: 0.15, height: 1, length: 1.5 });
ok('片式通道几何 ok', ch.ok);
approx('片式通道数 = 片数+1 = 4', ch.nCh, 4, 1e-9);
approx('片式 S = 0.6 m²', ch.S, 0.6, 1e-9);
approx('片式 P = 8 m', ch.P, 8, 1e-9);
approx('片式 P/S = 13.333', ch.PS, 8 / 0.6, 1e-9);
approx('片式当量直径 D = 4S/P = 0.3 m', ch.D, 0.3, 1e-9);
approx('上限截止频率 fc = 1.85c/D', ch.fc, 1.85 * 343 / 0.3, 1e-9);
// 圆管
var chr = M.channel({ form: 'round', d: 0.3, length: 1 });
approx('圆管 S = πd²/4', chr.S, Math.PI * 0.09 / 4, 1e-9);
approx('圆管 D = d', chr.D, 0.3, 1e-9);
ok('缺长度报错', M.channel({ form: 'round', d: 0.3 }).ok === false);
ok('缺内径报错', M.channel({ form: 'round', length: 1 }).ok === false);

console.log('阻性消声量');
// 阻性：ΔL = φ(α₀)·(P/S)·l
var res = M.resistive({
  form: 'splitter', blades: 3, gap: 0.15, height: 1, length: 1.5,
  alpha: [0.2, 0.45, 0.75, 0.9, 0.95, 0.95, 0.95], formula: 'gb', flow: 9000 / 3600
});
ok('阻性计算 ok', res.ok);
approx('ΔL@63 = φ(0.2)·13.333·1.5', res.rows[0].dLgb, M.phiGB(0.2) * (8 / 0.6) * 1.5, 1e-9);
approx('ΔL@1k = φ(0.95)·13.333·1.5', res.rows[4].dLgb, M.phiGB(0.95) * (8 / 0.6) * 1.5, 1e-9);
approx('通道流速 v = Q/S = 2.5/0.6', res.v, (9000 / 3600) / 0.6, 1e-9);
ok('α₀ 个数不符报错', M.resistive({ form: 'splitter', blades: 3, gap: 0.15, height: 1, length: 1.5, alpha: [0.5] }).ok === false);
// 高频失效：D=0.3 → fc≈2116Hz，4kHz 频带应折减
ok('4kHz 频带被高频失效折减', res.rows[6].limited === true && res.rows[6].factor < 1);
// 别洛夫对照
approx('别洛夫 ΔL@500 一致性', res.rows[3].dLperov, M.phiPerov(0.9) * res.PS * 1.5, 1e-9);

console.log('所需长度反算');
var rl = M.requiredLength({
  form: 'splitter', blades: 3, gap: 0.15, height: 1,
  alpha: [0.2, 0.45, 0.75, 0.9, 0.95, 0.95, 0.95], formula: 'gb',
  targetFreq: 250, targetLoss: 20
});
ok('指定频带反算 ok', rl.ok && rl.mode === 'band');
approx('l = ΔL/(φ·P/S)', rl.length, 20 / (M.phiGB(0.75) * (8 / 0.6)), 1e-9);
var rl2 = M.requiredLength({
  form: 'splitter', blades: 3, gap: 0.15, height: 1,
  alpha: [0.2, 0.45, 0.75, 0.9, 0.95, 0.95, 0.95],
  sourceLevels: [76, 80, 84, 85, 83, 79, 74], targetIL: 15
});
ok('A 计权目标反算 ok', rl2.ok && rl2.mode === 'aweighted' && rl2.length > 0 && rl2.length <= 20);

console.log('扩张室');
// m=4（d1=0.2, d2=0.4），l=0.5，c=343
var ex = M.expansion({ d1: 0.2, d2: 0.4, l: 0.5 });
ok('扩张室计算 ok', ex.ok);
approx('扩张比 m = (d2/d1)² = 4', ex.m, 4, 1e-9);
approx('峰值 TL = 10lg(1+¼(m−1/m)²)', ex.peakTL, 10 * Math.log10(1 + 0.25 * Math.pow(4 - 0.25, 2)), 1e-9);
approx('第一通过频率 = c/(2l) = 343 Hz', ex.passFreqs[0], 343, 1e-9);
// 单频验证：f 使 kl = π/2 → f = c(2n+1)/(4l) = 171.5 Hz 处 TL = 峰值
var fPeak = 343 * 1 / (4 * 0.5);
var rowPeak = ex.rows.filter(function (r) { return r.f === 250; })[0]; // 倍频带无 171.5，改用公式直接验证
var kl = 2 * Math.PI * 250 / 343 * 0.5;
approx('250Hz 处 TL = 10lg(1+coeff·sin²kl)', rowPeak.tl, 10 * Math.log10(1 + ex.coeff * Math.sin(kl) * Math.sin(kl)), 1e-9);
ok('m=1 报错（无扩张）', M.expansion({ m: 1, l: 0.5 }).ok === false);
ok('m<1 报错', M.expansion({ m: 0.5, l: 0.5 }).ok === false);
ok('缺长度报错', M.expansion({ m: 4 }).ok === false);
// 两节串联
var ex2 = M.expansion({ d1: 0.2, d2: 0.4, l: 0.5, stages: 2 });
approx('两节串联 TL 加倍', ex2.rows[3].tlTotal, ex.rows[3].tl * 2, 1e-9);

console.log('共振腔');
// d=8mm, t=2mm, 50 孔, 腔 ⌀0.4×0.5 → V = π·0.04·0.5/4 = 0.06283 m³, Sp = π·0.01 = 0.00785 m²
var rz = M.resonator({ holeD: 0.008, plateT: 0.002, holes: 50, chamberD: 0.4, chamberL: 0.5, pipeD: 0.1 });
ok('共振腔计算 ok', rz.ok);
approx('颈口总面积 S₀ = 50·πd²/4', rz.S0, 50 * Math.PI * 0.000064 / 4, 1e-9);
approx('有效颈长 = t + 0.85d', rz.lEff, 0.002 + 0.85 * 0.008, 1e-9);
approx('声传导率 G = S₀/lEff', rz.G, rz.S0 / rz.lEff, 1e-9);
approx('共振频率 fr = (c/2π)√(G/V)', rz.fr, 343 / (2 * Math.PI) * Math.sqrt(rz.G / (Math.PI * 0.16 / 4 * 0.5)), 1e-6);
// 共振频率处 TL 应达到上限 cap
var frBand = rz.rows.reduce(function (a, b) { return Math.abs(a.f - rz.fr) < Math.abs(b.f - rz.fr) ? a : b; });
ok('最接近 fr 的频带 TL 受 cap 截断或最大', frBand.tl <= rz.cap + 1e-9 && frBand.tlRaw >= rz.rows[0].tlRaw);
ok('V 直接给定与腔体尺寸换算一致', M.resonator({ holeD: 0.008, plateT: 0.002, holes: 50, volume: Math.PI * 0.16 / 4 * 0.5, pipeD: 0.1 }).fr === rz.fr ||
  Math.abs(M.resonator({ holeD: 0.008, plateT: 0.002, holes: 50, volume: Math.PI * 0.16 / 4 * 0.5, pipeD: 0.1 }).fr - rz.fr) < 1e-9);
ok('缺穿孔直径报错', M.resonator({ plateT: 0.002, holes: 50, volume: 0.06, pipeD: 0.1 }).ok === false);

console.log('压力损失');
var pl = M.pressureLoss({ form: 'splitter', blades: 3, gap: 0.15, height: 1, length: 1.5, flow: 9000 / 3600 });
ok('压力损失 ok', pl.ok);
approx('Δp = ξ·ρv²/2（片式 ξ=0.8）', pl.dp, 0.8 * 1.2 * Math.pow((9000 / 3600) / 0.6, 2) / 2, 1e-9);
ok('无风量报错', M.pressureLoss({ form: 'splitter', blades: 3, gap: 0.15, height: 1, length: 1.5 }).ok === false);

console.log('组合验算');
var cb = M.combined({
  res: { form: 'splitter', blades: 3, gap: 0.15, height: 1, length: 1.5, alpha: [0.2, 0.45, 0.75, 0.9, 0.95, 0.95, 0.95] },
  exp: { d1: 0.2, d2: 0.4, l: 0.5 },
  sourceId: 'fan', weighted: true
});
ok('组合验算 ok', cb.ok);
approx('组合逐频带 = 阻性 + 扩张室', cb.rows[2].total, cb.rows[2].dRes + cb.rows[2].tlExpansion, 1e-9);
ok('装后声级低于装前', cb.after < cb.before);
approx('IL = 装前 − 装后', cb.insertionLoss, cb.before - cb.after, 1e-9);
ok('声源谱为离心风机预设', cb.sourceName.indexOf('离心风机') >= 0);
// 装后逐频带 = 装前 − 合计消声量（A 计权后）
approx('装后@250 = 声源+A计权−合计', cb.rows[2].afterA, cb.rows[2].sourceA - cb.rows[2].total, 1e-9);
ok('全空报错', M.combined({}).ok === false);

console.log('选型建议');
var adv = M.advice({ form: 'round', d: 0.5, length: 1 });
ok('大当量直径给出片式建议', adv.some(function (a) { return a.level === 'warn' && a.text.indexOf('片式') >= 0; }));
var adv2 = M.advice({ form: 'round', d: 0.2, length: 1 });
ok('小当量直径给出直管可行', adv2.some(function (a) { return a.level === 'ok'; }));

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
