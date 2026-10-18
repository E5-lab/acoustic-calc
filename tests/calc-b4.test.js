/*
 * calc-b4.test.js — 声明式计算器 · 噪声与法规（纯函数单测，参照 calc-b7.test.js 写法）
 *
 * 运行：node tests/calc-b4.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b4.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b4] 路由登记');
['lwp', 'facade', 'fan-noise', 'valve-noise', 'jet-noise', 'railway'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});
assert('nav.group = 噪声与法规', R.get('lwp').nav.group === '噪声与法规' && R.get('railway').nav.group === '噪声与法规');

// ---------------------------------------------------------------- lwp
console.log('\n[calc-b4] 声功率 ↔ 声压（ISO 3746）');
var w1 = R.get('lwp').compute({ mode: 'fromLp', Lp: 85, Lw: 100, Lbg: 75, Q: 1, r: 2, space: 'hemi', A: 10 });
// S = 2πr² = 25.133；K1 = 10lg(1+4S/A) = 10.435；K2 = −10lg(0.9) = 0.458
assert('S = 2πr² = 25.133 m² 隐含于结果', w1.ok === true);
assert('K₁ = 10lg(1+4S/A) ≈ 10.44 dB', near(w1.values.K1, 10.435, 0.01), w1.values.K1);
assert('K₂（ΔL=10）≈ 0.458 dB', near(w1.values.K2, 0.45814, 0.001), w1.values.K2);
assert('Lw = 85 + 10lg(S) − K₁ − K₂ ≈ 88.11 dB', near(w1.values.Lw, 88.11, 0.02), w1.values.Lw);
var w2 = R.get('lwp').compute({ mode: 'fromLw', Lp: 85, Lw: 100, Lbg: 75, Q: 1, r: 2, space: 'hemi', A: 10 });
assert('反向：Lp = 100 − 10lg(2π·4) ≈ 86.0 dB', near(w2.values.Lp, 85.9973, 0.01), w2.values.Lp);
assert('预测模式 K₁/K₂ 不适用（显示「—」）', isNaN(w2.values.K1) && isNaN(w2.values.K2));
var w3 = R.get('lwp').compute({ mode: 'fromLw', Lp: 85, Lw: 100, Lbg: 75, Q: 2, r: 2, space: 'sphere', A: 10 });
assert('全空间 + Q=2：Lp = 100 + 10lg(2/16π) ≈ 86.0 dB', near(w3.values.Lp, 100 + 10 * Math.log10(2 / (16 * Math.PI)), 1e-6), w3.values.Lp);
var w4 = R.get('lwp').compute({ mode: 'fromLp', Lp: 85, Lw: 100, Lbg: 0, Q: 1, r: 2, space: 'hemi', A: 1e6 });
assert('无环境/背景修正时往返一致（A→∞、L_bg→0）',
  near(R.get('lwp').compute({ mode: 'fromLw', Lw: w4.values.Lw, Lp: 85, Lbg: 0, Q: 1, r: 2, space: 'hemi', A: 1e6 }).values.Lp, 85, 0.01),
  w4.values.Lw);
var w4b = R.get('lwp').compute({ mode: 'fromLp', Lp: 85, Lw: 100, Lbg: 75, Q: 1, r: 2, space: 'hemi', A: 10 });
assert('有修正时往返差 = K₁+K₂（修正被扣除）',
  near(R.get('lwp').compute({ mode: 'fromLw', Lw: w4b.values.Lw, Lp: 85, Lbg: 75, Q: 1, r: 2, space: 'hemi', A: 10 }).values.Lp,
    85 - w4b.values.K1 - w4b.values.K2, 0.01));
var w5 = R.get('lwp').compute({ mode: 'fromLp', Lp: 80, Lw: 100, Lbg: 80, Q: 1, r: 2, space: 'hemi', A: 10 });
assert('背景不低于被测声压 → ok=false', w5.ok === false && typeof w5.error === 'string');
var w6 = R.get('lwp').compute({ mode: 'fromLp', Lp: 85, Lw: 100, Lbg: 80, Q: 1, r: 2, space: 'hemi', A: 10 });
assert('ΔL=5 → K₂ ≈ 2.22 dB', near(w6.values.K2, -10 * Math.log10(1 - Math.pow(10, -0.5)), 1e-6), w6.values.K2);

// ---------------------------------------------------------------- facade
console.log('\n[calc-b4] 建筑立面/窗外衰减');
var f1 = R.get('facade').compute({ d: 40, h: 20, srcH: 1, type: 'line', L0: 68, r0: 7.5, refl: '2m' });
assert('斜距 r = √(40²+19²) ≈ 44.28 m', near(f1.values.r, Math.sqrt(1961), 1e-6), f1.values.r);
assert('线声源 ΔL = −10lg(44.28/7.5) ≈ −7.71 dB', near(f1.values.dL, -10 * Math.log10(Math.sqrt(1961) / 7.5), 1e-6), f1.values.dL);
assert('距墙 2 m：L_f = 68 − 7.71 + 3 ≈ 63.29 dB', near(f1.values.Lf, 68 - 10 * Math.log10(Math.sqrt(1961) / 7.5) + 3, 1e-6), f1.values.Lf);
assert('自由场对照 ≈ 60.29 dB', near(f1.values.Lfree, 68 - 10 * Math.log10(Math.sqrt(1961) / 7.5), 1e-6));
var f2 = R.get('facade').compute({ d: 40, h: 20, srcH: 1, type: 'point', L0: 68, r0: 7.5, refl: 'none' });
assert('点声源 ΔL = −20lg(44.28/7.5) ≈ −15.42 dB', near(f2.values.dL, -20 * Math.log10(Math.sqrt(1961) / 7.5), 1e-6), f2.values.dL);
var f3 = R.get('facade').compute({ d: 40, h: 20, srcH: 1, type: 'line', L0: 68, r0: 7.5, refl: 'flush' });
assert('贴墙反射 +6 dB：L_f ≈ 66.29 dB', near(f3.values.Lf, 68 - 10 * Math.log10(Math.sqrt(1961) / 7.5) + 6, 1e-6), f3.values.Lf);
var f4 = R.get('facade').compute({ d: 40, h: 60, srcH: 1, type: 'line', L0: 68, r0: 7.5, refl: '2m' });
assert('楼层升高斜距增大 → 声级下降', f4.values.Lf < f1.values.Lf, f4.values.Lf);
var f5 = R.get('facade').compute({ d: 0, h: 20, srcH: 1, type: 'line', L0: 68, r0: 7.5, refl: '2m' });
assert('距离为 0 → ok=false', f5.ok === false);

// ---------------------------------------------------------------- fan-noise
console.log('\n[calc-b4] 风机噪声频谱（Graham）');
var g1 = R.get('fan-noise').compute({ Q: 2, dp: 1, rpm: 1450, blades: 8, type: 'bc' });
assert('BPF = 8×1450/60 = 193.33 Hz', near(g1.values.bpf, 193.3333, 0.01), g1.values.bpf);
assert('63 Hz：K90 + 10lg2 ≈ 93.01 dB', near(g1.values.L63, 90 + 10 * Math.log10(2), 1e-6), g1.values.L63);
assert('250 Hz 频带含叶频增量：88 + 10lg2 + 3 ≈ 94.01 dB', near(g1.values.L250, 88 + 10 * Math.log10(2) + 3, 1e-6), g1.values.L250);
assert('1 kHz：79 + 10lg2 ≈ 82.01 dB', near(g1.values.L1000, 79 + 10 * Math.log10(2), 1e-6), g1.values.L1000);
assert('总声功率级 ≈ 98.6 dB', near(g1.values.Ltot, 98.60, 0.05), g1.values.Ltot);
var g2 = R.get('fan-noise').compute({ Q: 1, dp: 1, rpm: 0, blades: 0, type: 'bc' });
assert('Q=Δp=1 时各频带 = K 表值', near(g2.values.L63, 90, 1e-9) && near(g2.values.L8000, 64, 1e-9));
assert('无叶片/转速时 BPF = 0 且无增量', near(g2.values.bpf, 0, 1e-9) && near(g2.values.L63, 90, 1e-9));
var g3 = R.get('fan-noise').compute({ Q: 4, dp: 1, rpm: 1450, blades: 8, type: 'bc' });
assert('流量翻倍 → 各频带 +3.01 dB', near(g3.values.L63 - g1.values.L63, 10 * Math.log10(2), 1e-6), g3.values.L63 - g1.values.L63);
var g4 = R.get('fan-noise').compute({ Q: 1, dp: 1, rpm: 0, blades: 0, type: 'radial' });
assert('径向直叶 63 Hz = 113 dB（最噪）', near(g4.values.L63, 113, 1e-9), g4.values.L63);
var g5 = R.get('fan-noise').compute({ Q: 0, dp: 1, rpm: 0, blades: 0, type: 'bc' });
assert('流量为 0 → ok=false', g5.ok === false);

// ---------------------------------------------------------------- valve-noise
console.log('\n[calc-b4] 阀门噪声 IEC 60534-8-4（简化）');
var v1 = R.get('valve-noise').compute({ dp: 5, d: 100, rho: 998, c: 1481, Q: 100, FL: 0.9, TL: 30, Lp: 3 });
assert('U_vc = √(2Δp/ρ)/F_L ≈ 35.17 m/s', near(v1.values.Uvc, Math.sqrt(1e6 / 998) / 0.9, 1e-6), v1.values.Uvc);
assert('W_m = Q·Δp = 13889 W', near(v1.values.Wm, (100 / 3600) * 5e5, 1e-6), v1.values.Wm);
assert('η_turb = 10⁻⁴·U_vc/c ≈ 2.376×10⁻⁶', near(v1.values.eta, 1e-4 * (Math.sqrt(1e6 / 998) / 0.9) / 1481, 1e-12), v1.values.eta);
var Wa = 1e-4 * (Math.sqrt(1e6 / 998) / 0.9) / 1481 * (100 / 3600) * 5e5;
var Lwi = 10 * Math.log10(Wa / 1e-12);
assert('L_Wi ≈ 105.2 dB', near(v1.values.Lwi, Lwi, 0.01), v1.values.Lwi);
var A = Math.PI * Math.pow(0.1, 2) / 4;   // d=100 mm 管截面
assert('L_pi = L_Wi + 10lg(ρc/A) − 26.02 ≈ 161.9 dB', near(v1.values.Lpi, Lwi + 10 * Math.log10(998 * 1481 / A) - 26.02, 0.01), v1.values.Lpi);
assert('管外 1 m ≈ 62.5 dB', near(v1.values.Lpe, Lwi - 10 * Math.log10(3) - 30 - 10 * Math.log10(2 * Math.PI), 0.01), v1.values.Lpe);
var v2 = R.get('valve-noise').compute({ dp: 20, d: 100, rho: 998, c: 1481, Q: 100, FL: 0.9, TL: 30, Lp: 3 });
assert('压差 ×4 → U_vc ×2、声功率级 +18.06 dB（W_m×4 且 η×2）',
  near(v2.values.Lwi - v1.values.Lwi, 10 * Math.log10(8), 0.01), v2.values.Lwi - v1.values.Lwi);
var v3 = R.get('valve-noise').compute({ dp: 0, d: 100, rho: 998, c: 1481, Q: 100, FL: 0.9, TL: 30, Lp: 3 });
assert('压差为 0 → ok=false', v3.ok === false);

// ---------------------------------------------------------------- jet-noise
console.log('\n[calc-b4] 喷流/排气噪声（Lighthill）');
var j1 = R.get('jet-noise').compute({ U: 100, D: 0.1, rho: 1.2, c: 343, K: 3e-5, r: 10 });
assert('M = 100/343 ≈ 0.2916', near(j1.values.M, 100 / 343, 1e-6), j1.values.M);
var W1 = 3e-5 * 1.2 * Math.pow(100, 8) * 0.01 / Math.pow(343, 5);
assert('W = KρU⁸D²/c⁵ ≈ 7.58×10⁻⁴ W', near(j1.values.W, W1, W1 * 1e-6), j1.values.W);
assert('Lw ≈ 88.8 dB', near(j1.values.Lw, 10 * Math.log10(W1 / 1e-12), 0.01), j1.values.Lw);
assert('DI ≈ 3 dB', near(j1.values.DI, 3, 1e-9));
assert('f_peak = 0.2U/D = 200 Hz', near(j1.values.fpeak, 200, 1e-9), j1.values.fpeak);
assert('r=10 m 声压级 ≈ 60.8 dB',
  near(j1.values.Lp, 10 * Math.log10(W1 / 1e-12) + 10 * Math.log10(Math.pow(10, 0.3) / (4 * Math.PI * 100)), 0.01), j1.values.Lp);
var j2 = R.get('jet-noise').compute({ U: 200, D: 0.1, rho: 1.2, c: 343, K: 3e-5, r: 10 });
assert('U⁸ 定律：速度翻倍 → 声功率级 +24.08 dB', near(j2.values.Lw - j1.values.Lw, 80 * Math.log10(2), 0.01), j2.values.Lw - j1.values.Lw);
var j3 = R.get('jet-noise').compute({ U: 343, D: 0.1, rho: 1.2, c: 343, K: 3e-5, r: 10 });
assert('M=1 仍可计算（含马赫波警示）', j3.ok === true && j3.values.M > 0.99);
var j4 = R.get('jet-noise').compute({ U: 0, D: 0.1, rho: 1.2, c: 343, K: 3e-5, r: 10 });
assert('速度为 0 → ok=false', j4.ok === false);

// ---------------------------------------------------------------- railway
console.log('\n[calc-b4] 铁路噪声简化（CRN 结构）');
var r1 = R.get('railway').compute({ v: 120, vtype: 'disc-coach', axle: 16.5, track: 'ballast', n: 8, r: 50, N: 24, T: 24 });
assert('SEL = 31.2 + 20lg120 + 6 + 10lg8 ≈ 87.81 dB(A)',
  near(r1.values.sel25, 31.2 + 20 * Math.log10(120) + 6 + 10 * Math.log10(8), 1e-6), r1.values.sel25);
assert('参考轴重 16.5 t → 轴重修正 0', near(r1.values.dAxle, 0, 1e-9));
assert('r=50 m：SEL − 10lg2 ≈ 84.80 dB(A)', near(r1.values.lr, 31.2 + 20 * Math.log10(120) + 6 + 10 * Math.log10(8) - 10 * Math.log10(2), 1e-6), r1.values.lr);
assert('LAeq,24h（24 列）≈ 49.24 dB(A)',
  near(r1.values.leq, 31.2 + 20 * Math.log10(120) + 6 + 10 * Math.log10(8) - 10 * Math.log10(2) + 10 * Math.log10(24 / 86400), 1e-6), r1.values.leq);
var r2 = R.get('railway').compute({ v: 240, vtype: 'disc-coach', axle: 16.5, track: 'ballast', n: 8, r: 50, N: 24, T: 24 });
assert('速度翻倍（20lg 律）→ SEL +6.02 dB', near(r2.values.sel25 - r1.values.sel25, 20 * Math.log10(2), 1e-6), r2.values.sel25 - r1.values.sel25);
var r3 = R.get('railway').compute({ v: 120, vtype: 'tread-freight', axle: 20, track: 'slab', n: 8, r: 50, N: 24, T: 24 });
assert('轴重 20 t → +0.84 dB', near(r3.values.dAxle, 10 * Math.log10(20 / 16.5), 1e-6), r3.values.dAxle);
assert('踏面货车+无砟：SEL = 基准 +(12−6) +2 +0.84', near(r3.values.sel25 - r1.values.sel25, (12 - 6) + 2 + 10 * Math.log10(20 / 16.5), 1e-6));
var r4 = R.get('railway').compute({ v: 120, vtype: 'disc-coach', axle: 16.5, track: 'ballast', n: 8, r: 50, N: 0, T: 24 });
assert('时段内 0 列车 → LAeq 无定义（NaN）', isNaN(r4.values.leq) && r4.ok === true);
var r5 = R.get('railway').compute({ v: 120, vtype: 'disc-coach', axle: 16.5, track: 'ballast', n: 8, r: 100, N: 24, T: 24 });
assert('距离翻倍 → 单列声级 −3.01 dB', near(r1.values.lr - r5.values.lr, 10 * Math.log10(2), 1e-6));
var r6 = R.get('railway').compute({ v: 0, vtype: 'disc-coach', axle: 16.5, track: 'ballast', n: 8, r: 50, N: 24, T: 24 });
assert('速度为 0 → ok=false', r6.ok === false);

// ---------------------------------------------------------------- 纯函数契约
console.log('\n[calc-b4] 纯函数契约');
['lwp', 'facade', 'fan-noise', 'valve-noise', 'jet-noise', 'railway'].forEach(function (rt) {
  var cfg = R.get(rt);
  var s = {};
  (cfg.inputs || []).forEach(function (f) {
    s[f.key] = (f.def != null ? f.def : (f.type === 'select' && f.options ? f.options[0].value : 1));
  });
  var a, b;
  try { a = JSON.stringify(cfg.compute(s)); b = JSON.stringify(cfg.compute(s)); } catch (e) { a = 'throw:' + e.message; }
  assert(rt + ' 默认输入两次调用结果一致（无随机/DOM）', a === b && a.indexOf('throw:') !== 0, a);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
