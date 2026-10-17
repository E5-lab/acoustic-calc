/*
 * sim-sonar.test.js - 声呐方程与水声探测距离内核 (node tests/sim-sonar.test.js)
 *
 * 覆盖：Thorp 吸收系数 α(f)、传播损失 TL=20log₁₀r+αr/1000 的纯几何退化、
 * 主动（双程）/被动（单程）声呐方程的最大作用距离 r_max 二分解、
 * 方程残差、参数敏感性单调性、曲线采样与 simulate 主入口校验。
 */
var S = require('../public/js/sim-sonar.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(6)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (+-' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('[1] Thorp 海水吸收系数 α(f)  [dB/km]');
// 手算 α(1) = 0.11·1/2 + 44/4101 + 2.75e-4·1 + 0.003
//           = 0.055 + 0.01072909 + 0.000275 + 0.003 = 0.06900409
approx('α(1 kHz) ≈ 0.0690', S.absorption(1), 0.0690, 1e-3);
approx('α(1 kHz) 精确值', S.absorption(1), 0.11 / 2 + 44 / 4101 + 2.75e-4 + 0.003, 1e-12);
// 手算 α(10) = 0.11·100/101 + 44·100/4200 + 2.75e-4·100 + 0.003
//            = 0.10891089 + 1.04761905 + 0.0275 + 0.003 = 1.18702994
approx('α(10 kHz) ≈ 1.187', S.absorption(10), 1.187, 1e-3);
approx('α(10 kHz) 精确值', S.absorption(10), 11 / 101 + 4400 / 4200 + 0.0275 + 0.003, 1e-12);
// α(5) = 2.75/26 + 1100/4125 + 2.75e-4·25 + 0.003 = 0.10576923 + 0.26666667 + 0.006875 + 0.003
approx('α(5 kHz) ≈ 0.3823109', S.absorption(5), 2.75 / 26 + 1100 / 4125 + 0.006875 + 0.003, 1e-12);
approx('α(0) = 0.003（低频常数地板）', S.absorption(0), 0.003, 1e-15);
approx('α(0.5 kHz)', S.absorption(0.5), 0.11 * 0.25 / 1.25 + 44 * 0.25 / 4100.25 + 2.75e-4 * 0.25 + 0.003, 1e-12);
assert('α 随频率单调增：α(2) < α(20)', S.absorption(2) < S.absorption(20));
assert('α 随频率单调增：α(0.1) < α(1) < α(10)', S.absorption(0.1) < S.absorption(1) && S.absorption(1) < S.absorption(10));
assert('α(f=-1) 返回 null', S.absorption(-1) === null);
assert('α(非数值) 返回 null', S.absorption('x') === null);

console.log('\n[2] 传播损失 TL(r) = 20log₁₀r + αr/1000  [dB]');
// α 显式传 0 → 退化为纯球面扩展
approx('TL(1000 m, α=0) = 60 dB', S.transmissionLoss(1000, 1, 1500, 0), 60, 1e-12);
approx('TL(100 m, α=0) = 40 dB', S.transmissionLoss(100, 1, 1500, 0), 40, 1e-12);
approx('TL(1 m, α=0) = 0 dB（参考距离）', S.transmissionLoss(1, 1, 1500, 0), 0, 1e-12);
approx('TL(10000 m, α=0) = 80 dB', S.transmissionLoss(10000, 1, 1500, 0), 80, 1e-12);
approx('TL(500 m, α=0) = 20log₁₀500 = 53.9794', S.transmissionLoss(500, 1, 1500, 0), 20 * Math.log10(500), 1e-12);
// 含吸收：TL − 20log₁₀r 恰为 α·r/1000
var a10 = S.absorption(10);
approx('TL(5000, f=10) − 20log₁₀5000 = α·5', S.transmissionLoss(5000, 10, 1500) - 20 * Math.log10(5000), a10 * 5, 1e-12);
approx('TL(30000, f=10) = 20log₁₀30000 + α·30', S.transmissionLoss(30000, 10, 1500), 20 * Math.log10(30000) + a10 * 30, 1e-12);
assert('TL 随距离单调增', S.transmissionLoss(2000, 10, 1500) > S.transmissionLoss(1000, 10, 1500));
assert('TL 随频率单调增（α 变大）', S.transmissionLoss(10000, 20, 1500) > S.transmissionLoss(10000, 1, 1500));
assert('r=0 返回 null', S.transmissionLoss(0, 10, 1500) === null);
assert('r<0 返回 null', S.transmissionLoss(-5, 10, 1500) === null);
assert('c=0 返回 null', S.transmissionLoss(1000, 10, 0) === null);
assert('缺省 c 取 1500 m/s', S.transmissionLoss(1000, 1) === S.transmissionLoss(1000, 1, 1500));

console.log('\n[3] 主动声呐方程：SL − 2TL + TS ≥ NL − DI + DT');
var A = { mode: 'active', sl: 220, ts: 15, nl: 65, di: 20, dt: 10, freq: 5, c: 1500 };
var act = S.activeRange(A);
assert('activeRange ok', act.ok === true);
approx('α(5 kHz)', act.alpha, S.absorption(5), 1e-15);
approx('噪声背景 NL−DI = 45 dB', act.noiseFloor, 45, 1e-12);
approx('品质因数 SL+TS−(NL−DI)−DT = 180 dB', act.figureOfMerit, 220 + 15 - 45 - 10, 1e-12);
approx('允许的双程传播损失 = 180 dB', act.allowedTL, 180, 1e-12);
approx('折算单程允许 TL = 90 dB', act.allowedOneWayTL, 90, 1e-12);
approx('r_max 处 TL ≈ 90 dB', act.tlAtRMax, 90, 1e-4);
approx('r_max 处双程 TL = 2×单程', act.twoWayTL, 2 * act.tlAtRMax, 1e-12);
approx('r_max 处接收级 = 阈 NL−DI+DT = 55 dB', act.receivedLevel, 55, 1e-4);
approx('方程残差 |SL−2TL+TS−(NL−DI)−DT| < 1e-6',
  Math.abs(A.sl - 2 * act.tlAtRMax + A.ts - (A.nl - A.di) - A.dt), 0, 1e-6);
approx('residual 字段同样 ≈ 0', act.residual, 0, 1e-6);
approx('用 transmissionLoss 独立复算残差',
  A.sl - 2 * S.transmissionLoss(act.rMax, A.freq, A.c) + A.ts - (A.nl - A.di) - A.dt, 0, 1e-6);
// r_max ≈ 15.8 km 量级（90 dB 预算，含 α=0.376 dB/km 吸收）
assert('r_max 落在 10–25 km（中频舰壳声呐合理量级）', act.rMax > 10000 && act.rMax < 25000);
assert('未触发上界截断', act.clamped === false);

console.log('\n[4] 被动声呐方程：SL − TL ≥ NL − DI + DT（单程）');
var P = { mode: 'passive', sl: 220, ts: 0, nl: 65, di: 20, dt: 10, freq: 5, c: 1500 };
var pas = S.passiveRange(P);
assert('passiveRange ok', pas.ok === true);
approx('被动允许的单程 TL = 165 dB', pas.allowedTL, 220 - 45 - 10, 1e-12);
approx('r_max 处 TL ≈ 165 dB', pas.tlAtRMax, 165, 1e-3);
approx('方程残差 |SL−TL−(NL−DI)−DT| < 1e-6',
  Math.abs(P.sl - pas.tlAtRMax - (P.nl - P.di) - P.dt), 0, 1e-6);
// 被动只算单程 → 同参数（TS=0）下允许 TL 恰为主动的 2 倍 → 距离显著更远
var act0 = S.activeRange({ mode: 'active', sl: 220, ts: 0, nl: 65, di: 20, dt: 10, freq: 5, c: 1500 });
assert('被动 r_max 显著大于主动（同一组参数）', pas.rMax > act0.rMax * 2);
approx('TS=0 时 TL_passive(r_max) = 2·TL_active(r_max)', pas.tlAtRMax, 2 * act0.tlAtRMax, 1e-3);
approx('两者 r_max 处的接收级均为阈值 55 dB', pas.receivedLevel, act0.receivedLevel, 1e-3);
// 被动模式忽略 TS
var pasTS = S.passiveRange({ mode: 'passive', sl: 220, ts: 40, nl: 65, di: 20, dt: 10, freq: 5, c: 1500 });
approx('被动结果不随 TS 变化', pasTS.rMax, pas.rMax, 1e-9);
assert('被动返回 ts 字段为 null', pasTS.ts === null);

console.log('\n[5] 参数敏感性（单调性）');
function rmaxOf(o) { return S.simulate(o).rMax; }
var base = { mode: 'active', sl: 220, ts: 15, nl: 65, di: 20, dt: 10, freq: 5, c: 1500 };
function withBase(d) {
  var q = {};
  Object.keys(base).forEach(function (k) { q[k] = base[k]; });
  Object.keys(d).forEach(function (k) { q[k] = d[k]; });
  return q;
}
var rBase = rmaxOf(base);
assert('SL 增大 10 dB → r_max 增大', rmaxOf(withBase({ sl: 230 })) > rBase);
assert('SL 减小 10 dB → r_max 减小', rmaxOf(withBase({ sl: 210 })) < rBase);
assert('TS 增大 → 主动 r_max 增大', rmaxOf(withBase({ ts: 25 })) > rBase);
assert('NL 增大 10 dB → r_max 减小', rmaxOf(withBase({ nl: 75 })) < rBase);
assert('NL 减小 10 dB → r_max 增大', rmaxOf(withBase({ nl: 55 })) > rBase);
assert('DI 增大 10 dB → r_max 增大', rmaxOf(withBase({ di: 30 })) > rBase);
assert('DT 增大 10 dB → r_max 减小', rmaxOf(withBase({ dt: 20 })) < rBase);
assert('频率升高 → α 增大', S.absorption(20) > S.absorption(5));
assert('频率升高 → r_max 减小（吸收增大）', rmaxOf(withBase({ freq: 20 })) < rBase);
assert('频率降低 → r_max 增大', rmaxOf(withBase({ freq: 1 })) > rBase);
// SL 提高 20 dB 与 NL 降低 20 dB 等价（方程中只出现 SL−NL）
var gainSl = rmaxOf(withBase({ sl: 240 })) / rBase;
assert('吸收存在时 SL+20 dB 的距离增益远小于纯几何的 10 倍', gainSl > 1 && gainSl < 10);

console.log('\n[6] 检测余量 detectionMargin');
approx('余量(1 km) = SL−2TL(1 km)+TS−(NL−DI)−DT',
  S.detectionMargin(1000, base), 220 - 2 * S.transmissionLoss(1000, 5, 1500) + 15 - 45 - 10, 1e-9);
assert('r = 1 km 余量为正', S.detectionMargin(1000, base) > 0);
assert('r = 100 km 余量为负（超出作用距离）', S.detectionMargin(100000, base) < 0);
approx('r = r_max 处余量 ≈ 0', S.detectionMargin(rmaxOf(base), base), 0, 1e-6);
assert('非法距离返回 null', S.detectionMargin(0, base) === null);
// 余量手算：主动 = SL − 2TL(r) + TS − (NL−DI) − DT
var rHand = 5000, tlHand = S.transmissionLoss(rHand, 5, 1500);
approx('余量(5 km) 手算值', S.detectionMargin(rHand, base), 220 - 2 * tlHand + 15 - 45 - 10, 1e-9);

console.log('\n[7] simulate 主入口');
var sim = S.simulate(base);
assert('simulate ok', sim.ok === true);
assert('默认 mode 缺省为 active', S.simulate({}).mode === 'active');
assert('显式 passive 生效', S.simulate({ mode: 'passive', freq: 0.5 }).mode === 'passive');
approx('alpha 字段 = absorption(freq)', sim.alpha, S.absorption(5), 1e-15);
approx('rMax 与 activeRange 一致', sim.rMax, act.rMax, 1e-9);
approx('tlAtRMax 与 activeRange 一致', sim.tlAtRMax, act.tlAtRMax, 1e-9);
assert('曲线采样点 ≥ 120', sim.curve.length >= 120);
assert('曲线采样点 = CURVE_N = ' + S.CURVE_N, sim.curve.length === S.CURVE_N);
assert('曲线距离严格单调递增', sim.curve.every(function (p, i, a) { return i === 0 || a[i - 1].r < p.r; }));
assert('曲线首点 r = 1 m', sim.curve[0].r === 1);
assert('曲线末点 r ≥ 3·r_max（覆盖交点后）', sim.curve[sim.curve.length - 1].r >= Math.min(1e6, sim.rMax * 3) - 1);
assert('曲线余量递减（信号随距离衰减）',
  sim.curve.every(function (p, i, a) { return i === 0 || a[i - 1].excess > p.excess; }));
assert('近端余量为正、远端余量为负（r_max 落在采样区间内）',
  sim.curve[0].excess > 0 && sim.curve[sim.curve.length - 1].excess < 0);
approx('曲线 loss = 双程 TL（主动）', sim.curve[10].loss, 2 * sim.curve[10].tl, 1e-12);
approx('曲线 level + 2TL = SL + TS', sim.curve[10].level + 2 * sim.curve[10].tl, 220 + 15, 1e-12);
approx('波长 λ = c/f（5 kHz → 0.3 m）', sim.lambda, 1500 / 5000, 1e-12);
approx('往返时间 2r/c', sim.travelTime, 2 * sim.rMax / 1500, 1e-12);
var psim = S.simulate({ mode: 'passive', sl: 150, nl: 55, di: 25, dt: 6, freq: 0.5, c: 1500 });
approx('被动单程传播时间 r/c', psim.travelTime, psim.rMax / 1500, 1e-12);
approx('被动曲线 loss = 单程 TL', psim.curve[10].loss, psim.curve[10].tl, 1e-12);
assert('notes ≥ 5 条', sim.notes.length >= 5);
assert('notes 提到 Thorp', sim.notes.join('').indexOf('Thorp') >= 0);
assert('notes 提到未建模混响', sim.notes.join('').indexOf('混响') >= 0);
assert('notes 区分主动/被动', sim.notes.join('').indexOf('双程') >= 0);
approx('residual 字段 ≈ 0', sim.residual, 0, 1e-6);
approx('迭代次数少于上限 200', Math.min(sim.iterations, 200), sim.iterations, 0);
assert('迭代次数 0 < n < 200', sim.iterations > 0 && sim.iterations < 200);

console.log('\n[8] 缺省值与输入校验');
var dflt = S.simulate();
assert('空参走缺省值（SL 220 / TS 15 / NL 65 / DI 20 / DT 10 / f 5 kHz / c 1500）',
  dflt.ok === true && dflt.sl === 220 && dflt.ts === 15 && dflt.nl === 65 &&
  dflt.di === 20 && dflt.dt === 10 && dflt.freq === 5 && dflt.c === 1500);
approx('C_SEA 常量 = 1500', S.C_SEA, 1500, 0);
assert('mode=xxx 被拒绝', S.simulate({ mode: 'xxx' }).ok === false);
assert('SL=10 dB（越界）被拒绝', S.simulate({ sl: 10 }).ok === false);
assert('TS=−80 dB（越界）被拒绝', S.simulate({ ts: -80 }).ok === false);
assert('NL=200 dB（越界）被拒绝', S.simulate({ nl: 200 }).ok === false);
assert('DI=−5 dB（越界）被拒绝', S.simulate({ di: -5 }).ok === false);
assert('DT=100 dB（越界）被拒绝', S.simulate({ dt: 100 }).ok === false);
assert('freq=0（越界）被拒绝', S.simulate({ freq: 0 }).ok === false);
assert('freq=500 kHz（越出 Thorp 量级）被拒绝', S.simulate({ freq: 500 }).ok === false);
assert('c=100 m/s（越界）被拒绝', S.simulate({ c: 100 }).ok === false);
// 方程无解：1 m 处已低于检测阈
var no = S.simulate({ mode: 'active', sl: 100, ts: 0, nl: 120, di: 0, dt: 30, freq: 5 });
assert('恒不可检测时返回 ok:false', no.ok === false);
assert('无解时给出 error 文案', typeof no.error === 'string' && no.error.length > 0);

console.log('\n[9] 预设工况');
assert('PRESETS 至少 3 组', Array.isArray(S.PRESETS) && S.PRESETS.length >= 3);
S.PRESETS.forEach(function (p, i) {
  var r = S.simulate(p.params);
  assert('预设[' + i + ']「' + p.name + '」可计算', r.ok === true && r.rMax > 0);
});
assert('预设「低频远程」比「舰壳声呐」作用距离更远',
  S.simulate(S.PRESETS[1].params).rMax > S.simulate(S.PRESETS[0].params).rMax);
assert('预设「被动听测」作用距离最远（> 100 km）',
  S.simulate(S.PRESETS[2].params).rMax > 100000);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);
