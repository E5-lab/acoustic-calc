/*
 * diffuser.test.js — 声学扩散体设计内核测试 (node tests/diffuser.test.js)
 *
 * 锚点（可核对的公认数值）：
 *   QRD（Schroeder 1975）：sₙ = n² mod N；N=7 → 0,1,4,2,2,4,1；N=11 → 0,1,4,9,5,3,3,5,9,4,1
 *   QRD 井深 dₙ = sₙ·λ₀/(2N)；N=7、f₀=1 kHz（λ₀=343 mm）→ 0/24.5/98/49/49/98/24.5 mm
 *   PRD（Cox & D'Antonio）：tₙ = gⁿ mod N，g 为原根；N=7 的原根为 3 → 1,3,2,6,4,5（N−1 个井）
 *   MLS：长度 2^m − 1 的二元序列，井深仅 0 与 λ₀/2
 *   Wave：d(x) = (λ₀/4)(1 − cos 2πx/Λ)，最大井深 λ₀/2
 *   有效频段（几何估算）：f_low = c/(2·d_max)，f_high = c/(2·a)
 *   周期宽度 = 井数 × 井宽
 */
var D = require('../public/js/diffuser.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
}

console.log('\n[1] 序列生成');

ok('QRD N=7 → 0,1,4,2,2,4,1', D.qrdSeq(7).join(',') === '0,1,4,2,2,4,1', D.qrdSeq(7).join(','));
ok('QRD N=11 → 0,1,4,9,5,3,3,5,9,4,1',
  D.qrdSeq(11).join(',') === '0,1,4,9,5,3,3,5,9,4,1', D.qrdSeq(11).join(','));
ok('QRD 序列长度 = N', D.qrdSeq(13).length === 13);
ok('QRD 序列关于中心对称（sₙ = s_{N−n}）',
  D.qrdSeq(11).every(function (v, i, a) { return v === a[(11 - i) % 11]; }));
ok('N=7 的原根序列为 1,3,2,6,4,5（g = 3）',
  D.prdSeq(7).join(',') === '1,3,2,6,4,5', D.prdSeq(7).join(','));
ok('PRD 井数为 N−1', D.prdSeq(7).length === 6 && D.prdSeq(11).length === 10);
ok('PRD 序列覆盖 1…N−1 且无重复',
  D.prdSeq(11).slice().sort(function (a, b) { return a - b; }).join(',') === '1,2,3,4,5,6,7,8,9,10',
  D.prdSeq(11).slice().sort(function (a, b) { return a - b; }).join(','));
ok('PRD 对非素数返回 null', D.prdSeq(9) === null && D.prdSeq(1) === null);
ok('PRD 最后一项 × g ≡ 1（原根阶为 N−1）', (D.prdSeq(7)[5] * 3) % 7 === 1);
var m5 = D.mlsSeq(5);
ok('MLS m=5 长度 = 2^5 − 1 = 31', m5.length === 31, m5.length);
ok('MLS 仅含 0 / 1', m5.every(function (v) { return v === 0 || v === 1; }));
ok('MLS 中 1 的个数为 2^(m−1) = 16', m5.filter(function (v) { return v === 1; }).length === 16,
  m5.filter(function (v) { return v === 1; }).length);
ok('MLS m 越界（1 或 11）返回 null', D.mlsSeq(1) === null && D.mlsSeq(11) === null);
ok('MLS m=2 长度 3', D.mlsSeq(2).length === 3);

console.log('\n[2] QRD 主流程');

var q = D.generate({ type: 'qrd', f0: 1000, wellWidth: 50, N: 7 });
ok('生成成功', q.ok === true);
ok('设计波长 λ₀ = c/f₀ = 343 mm', near(q.lambda0Mm, 343, 1e-9), q.lambda0Mm);
ok('井深 = 0/24.5/98/49/49/98/24.5 mm',
  q.depthsMm.map(function (d) { return Math.round(d * 10) / 10; }).join(',') === '0,24.5,98,49,49,98,24.5',
  q.depthsMm.join(','));
ok('最大井深 98 mm', near(q.dMaxMm, 98, 1e-9), q.dMaxMm);
ok('最小井深 0 mm（存在平井）', near(q.dMinMm, 0, 1e-9));
ok('周期宽度 = 7 × 50 = 350 mm', near(q.periodMm, 350, 1e-9), q.periodMm);
ok('有效下限 f_low = c/(2·d_max) = 1750 Hz', near(q.fLow, 1750, 1e-6), q.fLow);
ok('有效上限 f_high = c/(2·a) = 3430 Hz', near(q.fHigh, 3430, 1e-6), q.fHigh);
ok('井数 7', q.wellCount === 7);
ok('非 2D', q.is2D === false);
var q2 = D.generate({ type: 'qrd', f0: 500, wellWidth: 50, N: 23 });
ok('设计频率减半 → 波长加倍（f₀=500 → λ₀=686 mm）', near(q2.lambda0Mm, 686, 1e-9), q2.lambda0Mm);
ok('素数 N 越大最大井深越接近 λ₀/2',
  q2.dMaxMm / (q2.lambda0Mm / 2) > q.dMaxMm / (q.lambda0Mm / 2),
  (q2.dMaxMm / (q2.lambda0Mm / 2)).toFixed(3) + ' vs ' + (q.dMaxMm / (q.lambda0Mm / 2)).toFixed(3));

console.log('\n[3] 其余七类几何');

var p = D.generate({ type: 'prd', f0: 1000, wellWidth: 50, N: 7 });
ok('PRD 生成成功且 6 个井', p.ok === true && p.wellCount === 6, p.wellCount);
ok('PRD 周期宽度 = 6 × 50 = 300 mm', near(p.periodMm, 300, 1e-9), p.periodMm);
ok('PRD 井深 = sₙ·λ₀/(2N) = sₙ × 24.5',
  near(p.depthsMm[1], 3 * 343 / 14, 1e-9), p.depthsMm[1]);
var mls = D.generate({ type: 'mls', f0: 1000, wellWidth: 50, m: 5 });
ok('MLS 生成成功且 31 个井', mls.ok === true && mls.wellCount === 31, mls.wellCount);
ok('MLS 仅两种深度：0 与 λ₀/2 = 171.5 mm',
  mls.depthsMm.every(function (d) { return d === 0 || near(d, 171.5, 1e-9); }));
ok('MLS 最大井深 = λ₀/2', near(mls.dMaxMm, 171.5, 1e-9), mls.dMaxMm);
var q2d = D.generate({ type: 'qrd2d', f0: 1000, wellWidth: 50, Nx: 7, Ny: 5 });
ok('2D QRD 生成成功', q2d.ok === true);
ok('2D QRD 标记为 2D', q2d.is2D === true);
ok('2D QRD 井数 = Nx × Ny = 35', q2d.wellCount === 35, q2d.wellCount);
ok('2D QRD 周期为正交两值', Array.isArray(q2d.periodMm) && q2d.periodMm.length === 2);
var sky = D.generate({ type: 'skyline', f0: 1000, wellWidth: 50, N: 7 });
ok('Skyline 与 QRD 同井深序列', sky.depthsMm.join(',') === q.depthsMm.join(','));
var bin = D.generate({ type: 'binary', f0: 1000, wellWidth: 50, N: 7 });
ok('Binary 井深仅 0 与 λ₀/4 = 85.75 mm',
  bin.depthsMm.every(function (d) { return d === 0 || near(d, 85.75, 1e-9); }) && near(bin.dMaxMm, 85.75, 1e-9));
var wv = D.generate({ type: 'wave', f0: 1000, wellWidth: 50, N: 8 });
ok('Wave 最大井深 = λ₀/2 = 171.5 mm（k = N/2 处）',
  near(wv.dMaxMm, 171.5, 1e-6) && near(wv.depthsMm[4], 171.5, 1e-6), wv.dMaxMm);
ok('Wave 在 k = 0 处深度为 0（d = (λ₀/4)(1−cos 0)）', near(wv.depthsMm[0], 0, 1e-12));
ok('Wave 深度关于 k = N/2 对称',
  near(wv.depthsMm[1], wv.depthsMm[7], 1e-9) && near(wv.depthsMm[2], wv.depthsMm[6], 1e-9));
ok('Wave 允许任意 N（不限于素数）', D.generate({ type: 'wave', f0: 1000, wellWidth: 50, N: 9 }).ok === true);
var fr = D.generate({ type: 'fractal', f0: 1000, wellWidth: 50, N: 7 });
ok('Fractal 井数 = N² = 49', fr.wellCount === 49, fr.wellCount);
ok('Fractal 最大井深 = max(s)·λ₀/(2·(N−1)) = 4×343/12 = 114.3 mm',
  near(fr.dMaxMm, 114.3333, 1e-3), fr.dMaxMm);
ok('Fractal 井深不超过 λ₀/2', fr.dMaxMm <= 171.5 + 1e-9);
ok('八类几何均有类型定义', D.TYPES.length === 8 && D.TYPES.every(function (t) { return t.id && t.name; }));

console.log('\n[4] 频段分析与契合度');

var an = D.analyze([0, 24.5, 98, 49, 49, 98, 24.5], 50);
ok('d_max = 98 mm', near(an.dMax, 98, 1e-9));
ok('d_min = 0 mm', near(an.dMin, 0, 1e-9));
ok('f_low = 343000/(2×98) = 1750 Hz', near(an.fLow, 1750, 1e-6), an.fLow);
ok('f_high = 343000/(2×50) = 3430 Hz', near(an.fHigh, 3430, 1e-6), an.fHigh);
ok('井宽越小高频上限越高', D.analyze([98], 25).fHigh > D.analyze([98], 50).fHigh);
ok('井深越深低频下限越低', D.analyze([196], 50).fLow < D.analyze([98], 50).fLow);
ok('全部平井时 f_low 为 null', D.analyze([0, 0], 50).fLow === null);
var bfFull = D.bandFit(1750, 3430, 1750, 3430);
ok('目标频段完全落入有效区间 → 契合度 100 %', near(bfFull.fit, 100, 1e-9), bfFull.fit);
ok('完全覆盖的判语含「优秀」', bfFull.verdict.indexOf('优秀') >= 0);
var bfNone = D.bandFit(1750, 3430, 4000, 8000);
ok('完全错位 → 契合度 0 %', near(bfNone.fit, 0, 1e-9), bfNone.fit);
ok('错位判语含「严重错位」', bfNone.verdict.indexOf('严重错位') >= 0);
ok('部分覆盖（一半） → 契合度 50 %', near(D.bandFit(1000, 2000, 1500, 2500).fit, 50, 1e-9),
  D.bandFit(1000, 2000, 1500, 2500).fit);
ok('缺目标参数 → null', D.bandFit(1000, 2000, 0, 0) === null);
ok('generate 带目标频段时给出契合度',
  D.generate({ type: 'qrd', f0: 1000, wellWidth: 50, N: 7, targetLow: 800, targetHigh: 3430 }).bandFit != null);

console.log('\n[5] 裁切清单');

var cl = D.cutList([0, 24.5, 98, 49, 49, 98, 24.5], 50, 600);
ok('按井深聚合为 4 档（0 / 24.5 / 49 / 98）', cl.rows.length === 4, cl.rows.length);
ok('最深的排在首位', cl.rows[0].depthMm === 98, cl.rows[0].depthMm);
ok('98 mm 井 2 个', cl.rows[0].count === 2);
ok('单井体积 = 50×50×98 mm³ = 245 cm³', near(cl.rows[0].volCm3, 245, 1e-6), cl.rows[0].volCm3);
ok('单井重量 = 245 cm³ × 600 kg/m³ = 0.147 kg', near(cl.rows[0].weightKg, 0.147, 1e-9), cl.rows[0].weightKg);
var vSum = cl.rows.reduce(function (s, r) { return s + r.count * (r.depthMm / 10) * 5 * 5; }, 0);
ok('总体积与逐档求和一致（' + vSum.toFixed(1) + ' cm³）', near(cl.totalVolCm3, vSum, 1e-6), cl.totalVolCm3);
ok('总重量 = 总体积 × 密度', near(cl.totalWeightKg, cl.totalVolCm3 * 1e-6 * 600, 1e-9));
ok('密度加倍重量加倍', near(D.cutList([98], 50, 1200).totalWeightKg, D.cutList([98], 50, 600).totalWeightKg * 2, 1e-12));
ok('0 深度井体积为 0', D.cutList([0], 50, 600).rows[0].volCm3 === 0);

console.log('\n[6] 单位与参数校验');

var cm = D.generate({ type: 'qrd', f0: 1000, wellWidth: 5, unit: 'cm', N: 7 });
ok('cm 单位换算为 50 mm', near(cm.wellWidthMm, 50, 1e-9), cm.wellWidthMm);
ok('cm 输入与 mm 输入结果一致', cm.depthsMm.join(',') === q.depthsMm.join(','));
var inch = D.generate({ type: 'qrd', f0: 1000, wellWidth: 1, unit: 'in', N: 7 });
ok('in 单位换算为 25.4 mm', near(inch.wellWidthMm, 25.4, 1e-9), inch.wellWidthMm);
ok('未给类型 → 报错', D.generate({ f0: 1000, wellWidth: 50 }).ok === false);
ok('设计频率为 0 → 报错', D.generate({ type: 'qrd', f0: 0, wellWidth: 50, N: 7 }).ok === false);
ok('井宽为 0 → 报错', D.generate({ type: 'qrd', f0: 1000, wellWidth: 0, N: 7 }).ok === false);
ok('QRD 的 N 取合数 → 报错', D.generate({ type: 'qrd', f0: 1000, wellWidth: 50, N: 9 }).ok === false);
ok('2D QRD 的 Nx 取合数 → 报错', D.generate({ type: 'qrd2d', f0: 1000, wellWidth: 50, Nx: 9, Ny: 5 }).ok === false);
ok('MLS 级数越界 → 报错', D.generate({ type: 'mls', f0: 1000, wellWidth: 50, m: 12 }).ok === false);
ok('未知类型 → 报错', D.generate({ type: 'xxx', f0: 1000, wellWidth: 50 }).ok === false);
ok('默认密度 600 kg/m³', near(D.cutList([98], 50).totalWeightKg, D.cutList([98], 50, 600).totalWeightKg, 1e-12));
ok('声速常数 = 343000 mm/s', D.C === 343000);
ok('素数表共 9 个', D.PRIMES.length === 9);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
