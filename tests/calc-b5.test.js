/*
 * calc-b5.test.js — 声明式计算器 · 测量与校准（纯函数单测）
 * 运行：node tests/calc-b5.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 * 锚点均为可手算解析值（容差按末位对齐设定）。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b5.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return isFinite(a) && Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b5] 路由登记');
['calib', 'oct-band', 'uncertainty', 'mic-response', 'time-weight'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});

console.log('\n[calc-b5] 声校准器换算');
var c1 = R.get('calib').compute({ nominal: '94', freq: 1000, measured: 93.2, mV: 0 });
assert('94 dB → p ≈ 1.00237 Pa', near(c1.values.p, 1.002374, 1e-5), c1.values.p);
assert('标称级回显 94', near(c1.values.Lref, 94, 1e-9), c1.values.Lref);
assert('修正量 = 93.2−94 = −0.8 dB', near(c1.values.offset, -0.8, 1e-9), c1.values.offset);
assert('mV=0 时灵敏度为空', c1.values.sens === null, c1.values.sens);
var c2 = R.get('calib').compute({ nominal: '94', freq: 1000, measured: 94, mV: 50 });
assert('50 mV @94 dB → 灵敏度 ≈ 49.88 mV/Pa', near(c2.values.sens, 49.8817, 1e-3), c2.values.sens);
var c3 = R.get('calib').compute({ nominal: '114', freq: 250, measured: 114, mV: 0 });
assert('114 dB → p ≈ 10.0237 Pa', near(c3.values.p, 10.0237, 1e-4), c3.values.p);
var c4 = R.get('calib').compute({ nominal: '94', freq: 1000, measured: NaN, mV: 0 });
assert('读数无效 → ok=false', c4.ok === false);

console.log('\n[calc-b5] 倍频带中心频率与带宽');
var o1 = R.get('oct-band').compute({ bw: '1', band: 6 });
assert('1/1 第 6 带 f_c = 1000 Hz', near(o1.values.fc, 1000, 1e-9), o1.values.fc);
assert('f₁ = 1000/√2 ≈ 707.11 Hz', near(o1.values.f1, 707.1068, 1e-3), o1.values.f1);
assert('f₂ = 1000·√2 ≈ 1414.21 Hz', near(o1.values.f2, 1414.2136, 1e-3), o1.values.f2);
assert('带宽 ≈ 707.11 Hz（相对 70.7%）', near(o1.values.bwHz, 707.1068, 1e-3), o1.values.bwHz);
var o2 = R.get('oct-band').compute({ bw: '1', band: 1 });
assert('1/1 第 1 带 = 31.5 Hz', near(o2.values.fc, 31.5, 1e-9), o2.values.fc);
var o3 = R.get('oct-band').compute({ bw: '1', band: 10 });
assert('1/1 第 10 带 = 16000 Hz', near(o3.values.fc, 16000, 1e-9), o3.values.fc);
var o4 = R.get('oct-band').compute({ bw: '3', band: 18 });
assert('1/3 第 18 带 f_c = 1000 Hz', near(o4.values.fc, 1000, 1e-9), o4.values.fc);
assert('1/3 f₁ ≈ 890.90 Hz', near(o4.values.f1, 890.8987, 1e-3), o4.values.f1);
assert('1/3 f₂ ≈ 1122.46 Hz', near(o4.values.f2, 1122.4625, 1e-3), o4.values.f2);
assert('1/3 带宽 ≈ 231.56 Hz（相对 23.2%）', near(o4.values.bwHz, 231.5638, 1e-3), o4.values.bwHz);
var o5 = R.get('oct-band').compute({ bw: '1', band: 11 });
assert('1/1 带号 11 超范围 → ok=false', o5.ok === false);
var o6 = R.get('oct-band').compute({ bw: '3', band: 0 });
assert('带号 0 → ok=false', o6.ok === false);

console.log('\n[calc-b5] 不确定度合成');
var u1 = R.get('uncertainty').compute({ n: 6, sd: 0.3, limit: 0.5, dist: 'rect', k: 2 });
assert('u_A = 0.3/√6 ≈ 0.1225', near(u1.values.uA, 0.1224745, 1e-4), u1.values.uA);
assert('u_B = 0.5/√3 ≈ 0.2887', near(u1.values.uB, 0.2886751, 1e-4), u1.values.uB);
assert('u_c = √(0.015+0.0833) ≈ 0.31358', near(u1.values.uc, 0.3135807, 1e-4), u1.values.uc);
assert('U = 2·u_c ≈ 0.62716', near(u1.values.U, 0.6271614, 1e-4), u1.values.U);
var u2 = R.get('uncertainty').compute({ n: 6, sd: 0.3, limit: 0.5, dist: 'normal', k: 2 });
assert('正态 u_B = 0.25', near(u2.values.uB, 0.25, 1e-9), u2.values.uB);
assert('正态 u_c ≈ 0.2784', near(u2.values.uc, 0.2783882, 1e-4), u2.values.uc);
var u3 = R.get('uncertainty').compute({ n: 6, sd: 0.3, limit: 0.5, dist: 'tri', k: 2 });
assert('三角 u_B = 0.5/√6 ≈ 0.2041', near(u3.values.uB, 0.2041241, 1e-4), u3.values.uB);
assert('三角 U ≈ 0.47609', near(u3.values.U, 0.4760936, 1e-4), u3.values.U);
var u4 = R.get('uncertainty').compute({ n: 6, sd: 0.3, limit: 0.5, dist: 'rect', k: 3 });
assert('k=3 时 U = 3·u_c', near(u4.values.U, 3 * u1.values.uc, 1e-9), u4.values.U);
var u5 = R.get('uncertainty').compute({ n: 0, sd: 0.3, limit: 0.5, dist: 'rect', k: 2 });
assert('n<1 → ok=false', u5.ok === false);
var u6 = R.get('uncertainty').compute({ n: 2, sd: 0.3, limit: 0, dist: 'rect', k: 2 });
assert('B=0 时 u_B=0、u_c=u_A', near(u6.values.uB, 0, 1e-12) && near(u6.values.uc, u6.values.uA, 1e-9));

console.log('\n[calc-b5] 传声器入射角修正');
var m1 = R.get('mic-response').compute({ theta: 0, f: 1000, dia: '6.35', c: 343 });
assert('θ=0° → X=0、修正 0 dB、比 1', m1.values.X === 0 && near(m1.values.corr, 0, 1e-9) && near(m1.values.ratio, 1, 1e-9), m1.values.corr);
var m2 = R.get('mic-response').compute({ theta: 90, f: 1000, dia: '6.35', c: 343 });
assert('1/2" @1 kHz 掠入射 X ≈ 0.1163', near(m2.values.X, 0.116325, 1e-4), m2.values.X);
assert('修正 ≈ −0.0147 dB', near(m2.values.corr, -0.0147, 1e-3), m2.values.corr);
assert('有效声压比 ≈ 0.9983', near(m2.values.ratio, 0.998310, 1e-4), m2.values.ratio);
var m3 = R.get('mic-response').compute({ theta: 90, f: 10000, dia: '6.35', c: 343 });
assert('1/2" @10 kHz 掠入射 X ≈ 1.1633', near(m3.values.X, 1.163250, 1e-4), m3.values.X);
assert('修正 ≈ −1.513 dB', near(m3.values.corr, -1.5131, 1e-3), m3.values.corr);
var m4 = R.get('mic-response').compute({ theta: 90, f: 10000, dia: '12.7', c: 343 });
assert('1" @10 kHz 掠入射修正 ≈ −6.75 dB', near(m4.values.corr, -6.7453, 1e-2), m4.values.corr);
assert('修正量恒 ≤ 0（有限膜平均只降不升）', m2.values.corr <= 0 && m3.values.corr <= 0 && m4.values.corr <= 0);
var m5 = R.get('mic-response').compute({ theta: 45, f: 5000, dia: '6.35', c: 343 });
assert('中间角修正介于 0 与掠入射之间', m5.values.corr < 0 && m5.values.corr > m3.values.corr, m5.values.corr);
var m6 = R.get('mic-response').compute({ theta: 90, f: 0, dia: '6.35', c: 343 });
assert('f=0 → ok=false', m6.ok === false);

console.log('\n[calc-b5] F/S/I 时间计权读数差');
var t1 = R.get('time-weight').compute({ mode: 'burst', T: 0.1, Lb: 90 });
assert('F ≈ 84.82 dB', near(t1.values.LF, 84.8158, 1e-2), t1.values.LF);
assert('S ≈ 69.57 dB（100 ms 突发欠读约 20 dB）', near(t1.values.LS, 69.5696, 1e-2), t1.values.LS);
assert('I ≈ 89.49 dB（接近峰值）', near(t1.values.LI, 89.4887, 1e-2), t1.values.LI);
assert('F−S ≈ +15.25 dB', near(t1.values.dFS, 15.2462, 1e-2), t1.values.dFS);
assert('F−I ≈ −4.67 dB', near(t1.values.dFI, -4.6729, 1e-2), t1.values.dFI);
var t2 = R.get('time-weight').compute({ mode: 'steady', T: 0.1, Lb: 90 });
assert('稳态三计权均为 90', near(t2.values.LF, 90, 1e-9) && near(t2.values.LS, 90, 1e-9) && near(t2.values.LI, 90, 1e-9));
assert('稳态差值为 0', near(t2.values.dFS, 0, 1e-9) && near(t2.values.dFI, 0, 1e-9));
var t3 = R.get('time-weight').compute({ mode: 'burst', T: 5, Lb: 90 });
assert('T=5 s 突发收敛到 90（0.06 dB 内）', near(t3.values.LS, 90, 0.1) && near(t3.values.LI, 90, 0.1), t3.values.LS);
var t4 = R.get('time-weight').compute({ mode: 'burst', T: 0.01, Lb: 90 });
assert('10 ms 突发三种计权均欠读，S 欠读最甚', t4.values.LS < t1.values.LS && t4.values.LI < t1.values.LI && t4.values.LF < t1.values.LF, t4.values.LS);
assert('10 ms 突发 I（35 ms 上升）仍欠读约 12 dB', near(t4.values.LI, 77.9077, 1e-2), t4.values.LI);
var t5 = R.get('time-weight').compute({ mode: 'burst', T: -1, Lb: 90 });
assert('T≤0 → ok=false', t5.ok === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
