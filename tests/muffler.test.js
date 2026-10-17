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

console.log('控制频带动态提示（binding）');
ok('binding 给出计算所得长度 1.36 m', rl.binding.indexOf('1.36') >= 0);
ok('binding 指出更严频带 63 Hz（需 7.5 m）', rl.binding.indexOf('63') >= 0 && rl.binding.indexOf('7.5') >= 0);
ok('binding 不再含写死的 2.2 m', rl.binding.indexOf('2.2') < 0);
var rl3 = M.requiredLength({
  form: 'splitter', blades: 3, gap: 0.15, height: 1,
  alpha: [0.2, 0.45, 0.75, 0.9, 0.95, 0.95, 0.95], formula: 'gb',
  targetFreq: 63, targetLoss: 20
});
ok('控制频带即最严时给出相应说明', rl3.ok && rl3.binding.indexOf('该频带即最严') >= 0);

console.log('φ(α₀) 反演 alphaFromPhi');
approx('GB 反演：φ=0.70 → α₀=0.50', M.alphaFromPhi(0.70, 'gb'), 0.50, 1e-9);
approx('GB 反演：φ=1.00 → α₀=0.70', M.alphaFromPhi(1.00, 'gb'), 0.70, 1e-9);
approx('GB 反演：φ=1.50 → α₀=0.90（平台段，含浮点容差）', M.alphaFromPhi(1.50, 'gb'), 0.90, 1e-9);
ok('GB 反演：φ=1.55 超表上限返回 null', M.alphaFromPhi(1.55, 'gb') == null);
ok('GB 反演：φ≤0 返回 null', M.alphaFromPhi(0, 'gb') == null && M.alphaFromPhi(-1, 'gb') == null);
approx('GB 反演回环：φ(0.85)=1.35 → α₀=0.85', M.alphaFromPhi(M.phiGB(0.85), 'gb'), 0.85, 1e-9);
approx('别洛夫反演回环：φ(0.5) → α₀=0.5', M.alphaFromPhi(M.phiPerov(0.5), 'perov'), 0.5, 1e-9);
(function () {
  var q = 1.5 / 4.34, r = (1 - q) / (1 + q);
  approx('别洛夫解析反演：α₀ = 1−[(1−φ/4.34)/(1+φ/4.34)]²', M.alphaFromPhi(1.5, 'perov'), 1 - r * r, 1e-12);
})();

console.log('反算选材 recommendMaterial');
// 圆管 d=0.3 → P/S = 4/d = 13.333，l=1，目标 500Hz/20dB → φ_req = 20/13.333 = 1.5（恰为 GB 表上限）
var rm = M.recommendMaterial({ form: 'round', d: 0.3, length: 1, targetFreq: 500, targetLoss: 20 });
ok('反算选材 ok', rm.ok);
approx('φ_req = 20/(13.333·1) = 1.5', rm.phiReq, 1.5, 1e-9);
approx('α₀_req = 0.90（GB 表上限）', rm.alphaReq, 0.9, 1e-9);
ok('仅 gw32-200（α₀@500=0.90）达标', rm.candidates.length === 1 && rm.candidates[0].id === 'gw32-200');
approx('候选可达消声量 dL = 1.5·13.333·1 = 20', rm.candidates[0].dL, 20, 1e-9);
ok('其余 8 种未达标', rm.insufficient.length === 8);
ok('未达标项按可达消声量降序', rm.insufficient[0].dL >= rm.insufficient[rm.insufficient.length - 1].dL);
ok('缺目标频带报错', M.recommendMaterial({ form: 'round', d: 0.3, length: 1, targetLoss: 10 }).ok === false);
ok('目标消声量 ≤ 0 报错', M.recommendMaterial({ form: 'round', d: 0.3, length: 1, targetFreq: 500, targetLoss: 0 }).ok === false);
ok('目标频带非法报错', M.recommendMaterial({ form: 'round', d: 0.3, length: 1, targetFreq: 300, targetLoss: 10 }).ok === false);
var rmP = M.recommendMaterial({ form: 'round', d: 0.3, length: 1, targetFreq: 500, targetLoss: 20, formula: 'perov' });
approx('别洛夫取法 α₀ 需求与解析反演一致', rmP.alphaReq, M.alphaFromPhi(1.5, 'perov'), 1e-9);
// 高频失效折减：d=0.6 → fc = 1.85·343/0.6 = 1057.6 < 4000 → factor = √(fc/f)
var rmHi = M.recommendMaterial({ form: 'round', d: 0.6, length: 1, targetFreq: 4000, targetLoss: 15 });
ok('高频失效折减已触发', rmHi.ok && rmHi.limited === true);
approx('折减系数 = max(0.3, √(fc/f))', rmHi.factor, Math.sqrt(rmHi.fc / 4000), 1e-9);
approx('φ_req = 15/(PS·1·factor)', rmHi.phiReq, 15 / ((4 / 0.6) * rmHi.factor), 1e-9);
ok('φ_req 超 GB 上限 → α₀ 不可得（null）', rmHi.alphaReq == null);
ok('目标过高时候选为空', rmHi.candidates.length === 0);
ok('全部材料落入未达标列表', rmHi.insufficient.length === M.MATERIALS.length);

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

console.log('反算选型界面守护');
(function () {
  var fs = require('fs');
  var pathMod = require('path');
  var html = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  var idxM = html.indexOf('id="view-muffler"');
  var segM = html.slice(idxM, html.indexOf('id="view-smallroom"'));
  var vjs = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'js', 'view-muffler.js'), 'utf8');
  ok('index.html 含反算选型面板按钮', segM.indexOf('data-mf-panel="solve"') >= 0);
  ok('index.html 含反算选型面板容器', segM.indexOf('data-panel="solve"') >= 0);
  ['mfSolveF', 'mfSolveL', 'mfSolveLenBtn', 'mfSolveSrc', 'mfSolveIL', 'mfSolveILBtn', 'mfMatF', 'mfMatL', 'mfMatBtn'].forEach(function (id) {
    ok('index.html 含 #' + id, segM.indexOf('id="' + id + '"') >= 0);
  });
  ok('视图绑定 solve 面板切换与三卡重算', vjs.indexOf('recalcSolve') >= 0 && vjs.indexOf('recalcSolveLen') >= 0 && vjs.indexOf('recalcSolveIL') >= 0 && vjs.indexOf('recalcSolveMat') >= 0);
  ok('页面提示含反算选型说明', segM.indexOf('反算选型') >= 0);
})();

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
