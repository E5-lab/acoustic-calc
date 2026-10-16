/*
 * tests/roomq.test.js — 厅堂与扩声音质 内核单测
 */
var R = require('../public/js/roomq.js');
var pass = 0, fail = 0;
function approx(name, got, exp, tol) {
  tol = (tol == null ? 1e-6 : tol);
  if (got == null || Math.abs(got - exp) <= tol) pass++;
  else { fail++; console.log('  ✗ ' + name + ' 期望 ' + exp + ' 实际 ' + got); }
}
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } }

/* 1) RT60 / EDT */
var rt = R.rtFromDecay(0.5, 1.0, 1.5);
ok('EDT = 6×T10 = 3.0', Math.abs(rt.edt - 3.0) < 1e-9);
approx('RT60 由 T30 = 2×1.5 = 3.0', rt.rt60, 3.0, 1e-9);
ok('RT60 优选 T30', Math.abs(rt.rt60 - rt.rt60_from30) < 1e-9);

/* 2) 清晰度/定义度 */
// E50=0.5, E80=0.8, Etot=1.0 → C50=10log10(0.5/0.5)=0, C80=10log10(0.8/0.2)=6.02, D50=50%
var rm = R.roomMetrics(0.5, 0.8, 1.0);
approx('C50=0', rm.c50, 0, 1e-9);
approx('C80=6.02', rm.c80, 6.0206, 1e-3);
approx('D50=50', rm.d50, 50, 1e-9);
ok('C80 > C50（更多早期能量）', R.roomMetrics(0.3, 0.8, 1.0).c80 > R.roomMetrics(0.3, 0.5, 1.0).c80 - 1e-9);

/* 3) 中心时间 */
// 单点 t=0.1s L=0 → Ts=0.1
approx('Ts 单点', R.centerTime([0.1], [0]), 0.1, 1e-9);
ok('Ts 加权正确', Math.abs(R.centerTime([0.1, 0.3], [0, 0]) - 0.2) < 1e-9);

/* 4) 强度因子 */
// Lp=80, Lw=100, r=10 → G = 80-100+10log10(4π·100)= -20+10log10(1256.6)= -20+31.0=11.0
approx('G = Lp−Lw+10log10(4πr²)', R.strengthFactor(80, 100, 10), 80 - 100 + 10 * Math.log10(4 * Math.PI * 100), 1e-6);

/* 5) 房间常数 / 临界距离 / 扩声 */
approx('R = Sα/(1−α)', R.roomConstant(1000, 0.3), 1000 * 0.3 / 0.7, 1e-9);
ok('a≥1 返回 null', R.roomConstant(1000, 1) === null);
var rc = R.criticalDistance(1, 428.57);
ok('rc = 0.141√(Q·R)', Math.abs(rc - 0.141 * Math.sqrt(428.57)) < 1e-9);
// 扩声：Lw=100, Q=1, r=5, R=428.57 → direct=1/(4π·25)=0.00318, rev=4/428.57=0.00933; Lp=100+10log10(0.01251)=100−19.03=80.97
var lp = R.reinforcementLp(100, 1, 5, 428.57);
ok('扩声 Lp 合理', lp > 75 && lp < 85);
ok('距离增大 Lp 降低', R.reinforcementLp(100, 1, 10, 428.57) < lp - 1e-9);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
