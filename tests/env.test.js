/*
 * tests/env.test.js — 环境声学评价内核单测
 * 运行：node tests/env.test.js
 */
var E = require('../public/js/env.js');
var pass = 0, fail = 0;
function approx(name, got, exp, tol) {
  tol = (tol == null ? 1e-6 : tol);
  if (got == null || Math.abs(got - exp) <= tol) { pass++; }
  else { fail++; console.log('  ✗ ' + name + ' 期望 ' + exp + ' 实际 ' + got); }
}
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

/* 1) Leq / 能量平均 */
approx('leq([80,80,80])=80', E.leq([80, 80, 80]), 80, 1e-6);
approx('leq([70,80])=77.404', E.leq([70, 80]), 77.404, 0.01);
approx('energyAverage==leq', E.energyAverage([60, 60, 60, 60]), 60, 1e-6);

/* 2) 统计声级百分位 */
var s = [70, 72, 75, 78, 80, 82, 85, 88, 90, 92];
ok('l50 中位数=81', Math.abs(E.l50(s) - 81) < 1e-6);
approx('l90 约=71.8（90%时间低于）', E.l90(s), 71.8, 0.3);
approx('l10 约=90.2（10%时间超过）', E.l10(s), 90.2, 0.3);
approx('l95 约=70.9', E.l95(s), 70.9, 0.3);
ok('l50 排序无关', Math.abs(E.l50([1, 3, 2]) - 2) < 1e-9);

/* 3) Ldn / Lden */
approx('ldn(70,50)=68.21', E.ldn(70, 50), 68.21, 0.05);
approx('ldn(60,50,15,9)默认', E.ldn(60, 50), E.ldn(60, 50, 15, 9), 1e-9);
approx('lden(70,65,50)=68.21', E.lden(70, 65, 50), 68.21, 0.05);
ok('Ldn 夜间更吵应更高', E.ldn(60, 55) > E.ldn(60, 50) - 1e-9);

/* 4) NPL / TNI */
approx('npl(60,65,55)=70', E.npl(60, 65, 55), 70, 1e-6);
approx('npl sigma=60+2.56*3', E.npl(60, null, null, 3), 67.68, 1e-6);
approx('tni(65,55)=65', E.tni(65, 55), 65, 1e-6);

/* 5) NR 曲线 */
var nr = E.nrFromSpectrum({ 31.5: 70, 63: 65, 125: 60, 250: 55, 500: 50, 1000: 45, 2000: 42, 4000: 38, 8000: 35 });
ok('nr 存在', nr && nr.nr != null);
approx('nrImplied(1000,45)=45', E.nrImplied(45, 1000), 45, 1e-6);
approx('nrImplied(31.5,70)=45.8', E.nrImplied(70, 31.5), 45.8, 0.1);
ok('nr 应≈51（250Hz带主导 55-3.6=51.4）', nr && nr.nr >= 50 && nr.nr <= 52 && nr.worstFreq === '250');

/* 6) ISO 9613-1 大气吸收（dB/km @20C 50%RH 1atm，对照标准表量级） */
var a1k = E.atmAbsorption(1000, 20, 50, 101.325);
var a2k = E.atmAbsorption(2000, 20, 50, 101.325);
var a4k = E.atmAbsorption(4000, 20, 50, 101.325);
var a8k = E.atmAbsorption(8000, 20, 50, 101.325);
ok('1000Hz 吸收在合理量级(1.5~4 dB/km)', a1k * 1000 > 1.5 && a1k * 1000 < 4);
ok('2000Hz 吸收在合理量级(3~10 dB/km)', a2k * 1000 > 3 && a2k * 1000 < 10);
ok('大气吸收随频率单调递增', a1k < a2k && a2k < a4k && a4k < a8k);
ok('湿度升高吸收增大(2000Hz)', E.atmAbsorption(2000, 20, 90, 101.325) > a2k);
ok('温度影响存在', E.atmAbsorption(2000, 10, 50, 101.325) !== a2k);

/* 7) ISO 9613-2 户外传播 */
var out = E.iso9613({ 1000: 100 }, 10, 1.5, 1.5, 'mixed');
ok('iso9613 返回 LpA', out && out.LpA != null);
approx('点源1000Hz LW=100 r=10 Lp=100-(20log10(10)+11)=69', out.bands[6].Lp, 100 - (20 * Math.log10(10) + 11), 0.6);
var out2 = E.iso9613({ 1000: 100, 2000: 100, 4000: 100 }, 10, 1.5, 1.5, 'mixed');
ok('多带 A 计权求和合理', out2.LpA != null && out2.LpA > out.LpA - 5);

/* 8) 公路交通噪声 */
var rt = E.roadTraffic(1000, 80, 20, {});
ok('roadTraffic 返回 LpA', rt && rt.LpA != null);
ok('车流量增大噪声升高', E.roadTraffic(2000, 80, 20, {}).LpA > rt.LpA - 1e-9);
ok('距离增大噪声降低', E.roadTraffic(1000, 80, 40, {}).LpA < rt.LpA - 1e-9);
ok('线声源发散≈10log10(2π·20)', Math.abs(rt.Adiv - 10 * Math.log10(2 * Math.PI * 20)) < 0.06);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
