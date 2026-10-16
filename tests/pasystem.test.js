/*
 * pasystem.test.js — 电声与语言清晰度内核逻辑测试 (node tests/pasystem.test.js)
 */
var P = require('../public/js/pasystem.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

console.log('\n[1] 临界距离与声压级');
ok('rc(1, 31.67) ≈ 0.794 m', near(P.criticalDistance(1, 31.67), 0.794, 0.005), P.criticalDistance(1, 31.67));
var sp = P.splAt({ Lw: 90, Q: 1, R: 31.67, r: 3 });
ok('Lp(90,1,31.67,3) ≈ 81.31 dB', near(sp.lp, 81.31, 0.05), sp.lp);
ok('直达 < 总声压级 < 直达+混响', sp.direct < sp.lp && sp.lp > sp.reverb);
ok('r < rc 时直达占优（D/R > 1）', P.splAt({ Lw: 90, Q: 1, R: 31.67, r: 0.5 }).dr > 1);
ok('r > rc 时混响占优（D/R < 1）', P.splAt({ Lw: 90, Q: 1, R: 31.67, r: 10 }).dr < 1);
ok('requiredLw 与 splAt 互为逆运算', near(P.requiredLw({ Lp: sp.lp, Q: 1, R: 31.67, r: 3 }), 90, 0.01));

console.log('\n[2] 电功率与增益');
var pw = P.ampPower({ sensitivity: 88, LwReq: 100 });
ok('P(100−88−11=1dBW) ≈ 1.26 W', near(pw.watts, Math.pow(10, 0.1), 1e-6), pw.watts);
var ug = P.usableGain({ rc: 10, rMic: 1, nom: 1, margin: 6 });
ok('可用增益(10,1,1,6) = 14 dB', near(ug.gain, 14, 1e-9), ug.gain);
ok('开放话筒数翻倍损耗 3 dB', near(P.usableGain({ rc: 10, rMic: 1, nom: 2, margin: 6 }).gain, 10.99, 0.01), P.usableGain({ rc: 10, rMic: 1, nom: 2, margin: 6 }).gain);
ok('neededGain(65−60) = 5 dB', near(P.neededGain({ LpListenerReq: 65, LpTalker: 60 }), 5, 1e-9));

console.log('\n[3] 混响 MTF');
ok('MTF(RT=1, 2Hz) ≈ 0.547', near(P.reverbMtf(1, 2), 0.547, 0.005), P.reverbMtf(1, 2));
ok('RT 越长 MTF 越低', P.reverbMtf(2, 2) < P.reverbMtf(1, 2));
ok('RT<=0 时无混响损伤', P.reverbMtf(0, 2) === 1);

console.log('\n[4] STIPA 预测');
var lw6 = [85, 88, 90, 92, 90, 86];
var st1 = P.stipaPredict({ Lw: lw6, noise: [50, 50, 50, 50, 50, 50], Q: 1, R: 31.67, r: 3, RT: 0.8 });
ok('低背景噪声 + RT0.8：STI > 0.45', st1.ok && st1.sti > 0.45, st1.sti);
ok('STI 有等级', typeof st1.grade === 'string' && st1.grade.length > 0);
var st2 = P.stipaPredict({ Lw: lw6, noise: [78, 78, 78, 78, 78, 78], Q: 1, R: 31.67, r: 3, RT: 0.8 });
ok('高背景噪声 STI 显著降低', st2.ok && st2.sti < st1.sti - 0.15, st2.sti + ' vs ' + st1.sti);
var st3 = P.stipaPredict({ Lw: lw6, noise: [50, 50, 50, 50, 50, 50], Q: 1, R: 31.67, r: 3, RT: 2.5 });
ok('长混响 STI 低于短混响', st3.sti < st1.sti);
ok('输出 14 个 (频带, 调制) 对', st1.rows.length === 14);
ok('缺噪声时按 SNR=25 处理（STI 仍较高）', P.stipaPredict({ Lw: lw6, Q: 1, R: 31.67, r: 3, RT: 0.8 }).sti > 0.45);
ok('参数缺失返回错误', !P.stipaPredict({ Lw: lw6, R: 0, r: 3 }).ok);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
