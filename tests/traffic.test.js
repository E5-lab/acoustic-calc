/*
 * traffic.test.js — 交通与航空噪声预测内核测试 (node tests/traffic.test.js)
 * 锚点全部用可手算解析值：
 *   公路 Lp = LwA + 10lgQ − 30 − 10lg v − 10lg(2πr)
 *   铁路 Lp = 65 + 30lg(v/100) − 10lg(r/25)（r≥25 m）
 *   航空 Ldn = 10lg[en/86400]
 */
var T = require('../public/js/traffic.js');
var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.05 : tol); }

console.log('\n[1] 单车声功率级');
ok('小型车 60 km/h → 70 dB', close(T.roadVehicleLw('small', 60), 70, 0.01), T.roadVehicleLw('small', 60));
ok('小型车 120 km/h → 70+3.01 = 73.0', close(T.roadVehicleLw('small', 120), 73.01, 0.05), T.roadVehicleLw('small', 120));
ok('大型车 > 中型车 > 小型', T.roadVehicleLw('heavy', 60) > T.roadVehicleLw('medium', 60) && T.roadVehicleLw('medium', 60) > T.roadVehicleLw('small', 60));

console.log('\n[2] 公路线声源');
// 小 60km/h、100 辆/h、10 m：Lp = 70 + 20 − 30 − 17.78 − 17.98 = 24.24
var r = T.roadLeq({ kind: 'small', speed: 60, q: 100, r: 10 });
ok('Lp(100 辆/h, 10 m) ≈ 24.2 dB', close(r.leq, 24.24, 0.1), r.leq);
ok('车流量翻倍 +3 dB', close(T.roadLeq({ kind: 'small', speed: 60, q: 200, r: 10 }).leq, r.leq + 3.01, 0.1));
ok('距离翻倍 −3 dB', close(T.roadLeq({ kind: 'small', speed: 60, q: 100, r: 20 }).leq, r.leq - 3.01, 0.1));
// 小型车速度项 +10·lg(v) 与分母 −10·lg(v) 抵消 → 速度翻倍 Leq 不变（对小型车）
ok('小型车速度翻倍 → Leq 不变（两项抵消）', close(T.roadLeq({ kind: 'small', speed: 120, q: 100, r: 10 }).leq, r.leq, 0.05));
ok('q=0 → Leq=0', T.roadLeq({ q: 0, r: 10 }).leq === 0);
ok('非法输入报错', T.roadLeq({ q: 100, r: 0 }).ok === false);

console.log('\n[3] 铁路');
// L0=65，v=200、r=50：Lp = 65 + 30lg(2) − 10lg(2) = 65+9.03−3.01 = 71.02
var tr = T.railLeq({ speed: 200, r: 50, n: 1, tPer: 15 });
ok('铁路 Lp(200km/h, 50m) ≈ 71.0', close(tr.lmax, 71.02, 0.1), tr.lmax);
ok('速度 100→200 → +9 dB', close(T.railLeq({ speed: 100, r: 50, n: 1 }).lmax, 62.0, 0.2), T.railLeq({ speed: 100, r: 50, n: 1 }).lmax);
ok('n=0 → Leq=0', T.railLeq({ speed: 100, r: 50, n: 0 }).leq === 0);
ok('单列等效：Lp=65 → Leq=65+10lg(15/3600)=41.2', close(T.railLeq({ speed: 100, r: 25, n: 1, tPer: 15 }).leq, 41.2, 0.2), T.railLeq({ speed: 100, r: 25, n: 1, tPer: 15 }).leq);
ok('非法距离报错', T.railLeq({ r: -1 }).ok === false);

console.log('\n[4] 航空');
// SEL=90、100 昼 10 夜：en = 100·10^9 + 10×10·10^9 = 2e11 → Ldn = 10lg(2e11/86400) = 63.6
var a = T.air({ sel: 90, nd: 100, nn: 10 });
ok('Ldn(SEL90, 昼100 夜10) ≈ 63.6', close(a.ldn, 63.6, 0.1), a.ldn);
ok('NEF = 90+10lg110−88 = 22.4', close(a.nef, 90 + 10 * Math.log10(110) - 88, 0.1), a.nef);
ok('夜间 10 倍加权生效', T.air({ sel: 90, nd: 0, nn: 10 }).ldn > T.air({ sel: 90, nd: 10, nn: 0 }).ldn);
ok('无架次 → 0', T.air({ sel: 90, nd: 0, nn: 0 }).ldn === 0);
ok('缺 SEL 报错', T.air({ nd: 1, nn: 0 }).ok === false);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);