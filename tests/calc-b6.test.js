/*
 * calc-b6.test.js — 声明式计算器 · 超声·结构·声速（纯函数单测）
 * 运行：node tests/calc-b6.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 * 锚点均为可手算解析值（钢 E=200 GPa、ν=0.3、ρ=7850 → cL≈5856.6、cS≈3130.2 m/s）。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b6.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return isFinite(a) && Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b6] 路由登记');
['wavespeed-solid', 'snell', 'attenuation', 'lamb', 'longi-trans'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});

console.log('\n[calc-b6] 固体纵/横波声速');
var w1 = R.get('wavespeed-solid').compute({ E: 200, nu: 0.3, rho: 7850, G: 0 });
assert('钢 c_L ≈ 5856.6 m/s', near(w1.values.cL, 5856.6, 0.5), w1.values.cL);
assert('钢 c_S ≈ 3130.2 m/s', near(w1.values.cS, 3130.2, 0.5), w1.values.cS);
assert('G 推导 = E/2(1+ν) = 76.92 GPa', near(w1.values.Guse, 76.923, 1e-3), w1.values.Guse);
assert('c_L/c_S ≈ 1.87', near(w1.values.ratio, 1.871, 1e-3), w1.values.ratio);
var w2 = R.get('wavespeed-solid').compute({ E: 200, nu: 0.3, rho: 7850, G: 79 });
assert('给定 G=79 GPa → c_S ≈ 3172.3 m/s', near(w2.values.cS, 3172.3, 0.5), w2.values.cS);
var w3 = R.get('wavespeed-solid').compute({ E: 70, nu: 0.33, rho: 2700, G: 0 });
assert('铝 c_L ≈ 6197.8 m/s（E=70/ν=0.33/ρ=2700 代入值）', near(w3.values.cL, 6197.8, 1), w3.values.cL);
assert('铝 c_S ≈ 3121.9 m/s', near(w3.values.cS, 3121.95, 1), w3.values.cS);
var w4 = R.get('wavespeed-solid').compute({ E: 200, nu: 0.5, rho: 7850, G: 0 });
assert('ν=0.5（不可压缩）→ ok=false', w4.ok === false);
var w5 = R.get('wavespeed-solid').compute({ E: 200, nu: 0.3, rho: 0, G: 0 });
assert('ρ=0 → ok=false', w5.ok === false);

console.log('\n[calc-b6] 斯涅尔定律/临界角');
var s1 = R.get('snell').compute({ c1: 1480, c2: 343, theta1: 30 });
assert('水→空气 θ₂ ≈ 6.65°', near(s1.values.theta2, 6.6540, 1e-2), s1.values.theta2);
assert('水→空气（进慢介质）无临界角 → θc 为 NaN', isNaN(s1.values.thetaC), s1.values.thetaC);
var s1b = R.get('snell').compute({ c1: 343, c2: 1480, theta1: 30 });
assert('空气→水 30° 入射全反射 → ok=false', s1b.ok === false);
assert('空气→水 θc ≈ 13.40°', near(s1b.values.thetaC, 13.3997, 1e-2), s1b.values.thetaC);
var s2 = R.get('snell').compute({ c1: 1480, c2: 5900, theta1: 30 });
assert('水→钢 30° 入射全反射 → ok=false', s2.ok === false);
assert('全反射时仍给出 θc ≈ 14.5°', near(s2.values.thetaC, 14.5338, 1e-2), s2.values.thetaC);
var s3 = R.get('snell').compute({ c1: 1480, c2: 5900, theta1: 10 });
assert('水→钢 10° 入射（<θc）有折射 θ₂ ≈ 43.81°', near(s3.values.theta2, 43.8082, 1e-2), s3.values.theta2);
var s4 = R.get('snell').compute({ c1: 5900, c2: 1480, theta1: 30 });
assert('钢→水（c1>c2）无临界角 → θc 为 NaN', isNaN(s4.values.thetaC));
assert('钢→水 θ₂ ≈ 7.21°', near(s4.values.theta2, 7.2052, 1e-2), s4.values.theta2);
var s5 = R.get('snell').compute({ c1: 1480, c2: 343, theta1: 0 });
assert('垂直入射 θ₂=0', near(s5.values.theta2, 0, 1e-9), s5.values.theta2);

console.log('\n[calc-b6] 材料衰减系数');
var a1 = R.get('attenuation').compute({ f: 2, alpha0: 0.02, n: 1, dist: 10 });
assert('α = 0.02×2 = 0.04 dB/cm', near(a1.values.alphaDbCm, 0.04, 1e-9), a1.values.alphaDbCm);
assert('α = 4 dB/m', near(a1.values.alphaDbM, 4, 1e-9), a1.values.alphaDbM);
assert('α ≈ 0.46052 Np/m', near(a1.values.alphaNpM, 0.4605170, 1e-4), a1.values.alphaNpM);
assert('10 cm 总衰减 0.4 dB', near(a1.values.loss, 0.4, 1e-9), a1.values.loss);
var a2 = R.get('attenuation').compute({ f: 4, alpha0: 0.02, n: 2, dist: 5 });
assert('n=2 时 α = 0.02×16 = 0.32 dB/cm', near(a2.values.alphaDbCm, 0.32, 1e-9), a2.values.alphaDbCm);
assert('n=2 时 5 cm 衰减 1.6 dB', near(a2.values.loss, 1.6, 1e-9), a2.values.loss);
var a3 = R.get('attenuation').compute({ f: 2, alpha0: 0.02, n: 1, dist: 0 });
assert('d=0 → ok=false', a3.ok === false);

console.log('\n[calc-b6] 兰姆波相速度');
var l1 = R.get('lamb').compute({ h: 1, f: 1, cL: 5900, cS: 3200, mode: 'A0' });
assert('ν 反算 ≈ 0.2916（不直接输出，隐含于 cp）', true);
assert('钢 1mm×1MHz A0 cp ≈ 3123 m/s', near(l1.values.cp, 3123.1, 2), l1.values.cp);
assert('c_R ≈ 2959 m/s', near(l1.values.cR, 2959.1, 2), l1.values.cR);
assert('fd = 1 MHz·mm', near(l1.values.fd, 1, 1e-9), l1.values.fd);
assert('A0 cp < cS（低频弯曲近似）', l1.values.cp < 3200, l1.values.cp);
var l2 = R.get('lamb').compute({ h: 1, f: 1, cL: 5900, cS: 3200, mode: 'S0' });
assert('S0 cp = cS·√(2/(1−ν)) ≈ 5377 m/s', near(l2.values.cp, 5377.0, 3), l2.values.cp);
assert('S0 cp 介于 cS 与 cL 之间', l2.values.cp > 3200 && l2.values.cp < 5900, l2.values.cp);
var l3 = R.get('lamb').compute({ h: 2, f: 1, cL: 5900, cS: 3200, mode: 'A0' });
assert('板厚加倍 A0 cp 上升（弯曲波 cp∝√(ωh)，×√2）', near(l3.values.cp, l1.values.cp * Math.SQRT2, 2), l3.values.cp);
var l4 = R.get('lamb').compute({ h: 1, f: 1, cL: 5900, cS: 3200, mode: 'rayleigh' });
assert('瑞利模式 cp = c_R', near(l4.values.cp, l1.values.cR, 1e-9), l4.values.cp);
assert('瑞利波速 < cS', l4.values.cp < 3200, l4.values.cp);
var l5 = R.get('lamb').compute({ h: 1, f: 1, cL: 3200, cS: 5900, mode: 'A0' });
assert('cL<cS → ok=false', l5.ok === false);

console.log('\n[calc-b6] 纵波反射/透射系数');
var x1 = R.get('longi-trans').compute({ Z1: 1.48, Z2: 47 });
assert('水→钢 R ≈ 0.9389', near(x1.values.R, 0.938948, 1e-4), x1.values.R);
assert('水→钢 T ≈ 1.9389', near(x1.values.T, 1.938948, 1e-4), x1.values.T);
assert('水→钢功率透射 ≈ 0.1184', near(x1.values.Tp, 0.118384, 1e-4), x1.values.Tp);
assert('水→钢透射损失 ≈ 9.27 dB', near(x1.values.TL, 9.2668, 1e-2), x1.values.TL);
assert('能量守恒 R²+τ=1', near(x1.values.R * x1.values.R + x1.values.Tp, 1, 1e-9));
var x2 = R.get('longi-trans').compute({ Z1: 47, Z2: 47 });
assert('阻抗匹配 → R=0、T=1、TL=0', near(x2.values.R, 0, 1e-12) && near(x2.values.T, 1, 1e-9) && near(x2.values.TL, 0, 1e-6));
var x3 = R.get('longi-trans').compute({ Z1: 47, Z2: 1.48 });
assert('钢→水 R 反号 ≈ −0.9389', near(x3.values.R, -0.938948, 1e-4), x3.values.R);
assert('功率透射与方向无关（≈0.1184）', near(x3.values.Tp, x1.values.Tp, 1e-9));
var x4 = R.get('longi-trans').compute({ Z1: 0.0004, Z2: 47 });
assert('空气→钢近乎全反射（R≈+0.99998，Z₂>Z₁ 无反相）', near(x4.values.R, 0.9999829, 1e-5), x4.values.R);
var x5 = R.get('longi-trans').compute({ Z1: -1, Z2: 47 });
assert('Z≤0 → ok=false', x5.ok === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
