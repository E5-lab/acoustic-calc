/*
 * tests/psycho.test.js — 心理声学 内核单测
 */
var P = require('../public/js/psycho.js');
var pass = 0, fail = 0;
function approx(name, got, exp, tol) {
  tol = (tol == null ? 1e-6 : tol);
  if (got == null || Math.abs(got - exp) <= tol) pass++;
  else { fail++; console.log('  ✗ ' + name + ' 期望 ' + exp + ' 实际 ' + got); }
}
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

/* 1) phon ↔ sone */
approx('40 phon = 1 sone', P.phonToSone(40), 1, 1e-9);
approx('60 phon = 4 sone', P.phonToSone(60), 4, 1e-9);
approx('80 phon = 16 sone', P.phonToSone(80), 16, 1e-9);
approx('1 sone = 40 phon', P.soneToPhon(1), 40, 1e-9);
approx('16 sone = 80 phon', P.soneToPhon(16), 80, 1e-9);

/* 2) bark 映射单调 */
ok('hzToBark 单调', P.hzToBark(100) < P.hzToBark(1000) && P.hzToBark(1000) < P.hzToBark(8000));
ok('hzToBark(1000)≈8.5', Math.abs(P.hzToBark(1000) - 8.5) < 0.6);

/* 3) 总响度估算 */
var bl = P.bandLoudnessEstimate({ 1000: 40 });
ok('单带 1kHz 40dB 估算≈1 sone', bl && Math.abs(bl.sones - 1) < 1e-9);
ok('总响度随声级升高', P.bandLoudnessEstimate({ 1000: 60 }).sones > P.bandLoudnessEstimate({ 1000: 40 }).sones - 1e-9);

/* 4) 尖锐度：高频占比越高越尖锐 */
var low = P.sharpness({ 250: 70, 500: 70, 1000: 70 });
var high = P.sharpness({ 2000: 70, 4000: 70, 8000: 70 });
ok('高频谱尖锐度 > 低频谱', high > low - 1e-9);

/* 5) 粗糙度 / 抖动度 趋势 */
var r70 = P.roughness(70, 1, 10), r4 = P.roughness(4, 1, 10);
ok('粗糙度在 70Hz 峰值附近最大', r70 > r4 - 1e-9);
ok('粗糙度随调制深度增大', P.roughness(70, 0.8, 10) < r70 - 1e-9);
ok('粗糙度随响度增大', P.roughness(70, 1, 20) > r70 - 1e-9);
var f4 = P.fluctuation(4, 1, 10), f70 = P.fluctuation(70, 1, 10);
ok('抖动度在 4Hz 峰值附近最大', f4 > f70 - 1e-9);

/* 6) PNL / Noy */
approx('单带 1kHz 80dB PNL=80', P.pnlt({ 1000: 80 }), 80, 1e-6);
var pnlMix = P.pnlt({ 1000: 80, 2000: 80 });
ok('含高频带 PNL 高于单带', pnlMix > 80 - 1e-9);
var pnlLow = P.pnlt({ 1000: 70, 31.5: 70 });
ok('含 31.5Hz 低带的 PNL 更高(低带更吵)', pnlLow > P.pnlt({ 1000: 70 }));

/* 7) STIPA / STI */
approx('MTF 全 1 → STI=1', P.stipa([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]).sti, 1, 1e-9);
approx('MTF 全 0 → STI=0', P.stipa([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).sti, 0, 1e-9);
ok('STI 介于 0~1', (function () { var r = P.stipa([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]); return r.sti > 0 && r.sti < 1; })());
var good = P.stipa([0.9, 0.9, 0.95, 0.95, 0.95, 0.95, 0.9, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4]);
ok('高 MTF → 优秀', good.grade === '优秀');
ok('SNR 越好 STI 越高', P.stipaFromSnr([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]).sti > P.stipaFromSnr([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).sti - 1e-9);

/* 8) 简化模型界面标注守护（明确标注边界：标准实现 vs 简化模型） */
var fs2 = require('fs'), path2 = require('path');
var html2 = fs2.readFileSync(path2.join(__dirname, '..', 'public', 'index.html'), 'utf8');
var idxP = html2.indexOf('id="view-psycho"');
ok('找到 psycho 视图段落', idxP > 0);
var segP = html2.slice(idxP, idxP + 16000);
ok('psycho 页头标注"简化模型"', segP.indexOf('简化模型') >= 0);
ok('psycho 总响度卡片标注临界带合成缺失', segP.indexOf('未做临界带掩蔽与响度合成') >= 0);
ok('psycho PNL 卡片标注完整方法为 1/3 倍频带', segP.indexOf('完整 PNL 用 1/3 倍频带') >= 0);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
