/*
 * smallroom.test.js — 小房间与室内声场内核 单元测试 (node tests/smallroom.test.js)
 * 依据：矩形房间简正频率、Bonello 准则、Schroeder 频率、房间常数/临界距离、
 *      稳态声压级（直达+混响）、多声源叠加、ISO 9613-1 空气吸收。
 */
var S = require('../public/js/smallroom.js');
var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// 声速
ok('声速 @20℃ ≈ 343 m/s', near(S.soundSpeed(20), 343, 0.5), S.soundSpeed(20));

// 简正频率：5×4×3 @200Hz → 76 个（轴向12/切向36/斜向28）
var m = S.modes({ length: 5, width: 4, height: 3, fMax: 200, c: 343 });
ok('简正频率总数 = 76', m.ok && m.count === 76, m.count);
ok('轴向 12 / 切向 36 / 斜向 28', m.stat.axial === 12 && m.stat.tangential === 36 && m.stat.oblique === 28,
  JSON.stringify(m.stat));
ok('最低简正频率 f1 ≈ 34.3 Hz', near(m.fFirst, 343 / (2 * 5), 0.5), m.fFirst);
ok('体积 = 60 m³，表面积 = 94 m²', near(m.volume, 60, 1e-6) && near(m.area, 94, 1e-6));

// Bonello：基于上述模态，应返回 ok 且单调/空带可判定
var bo = S.bonello(m.list, 20, 200);
ok('Bonello 返回 ok', bo && bo.ok === true);
ok('Bonello 含 bands 与 pass 标志', Array.isArray(bo.bands) && typeof bo.pass === 'boolean');

// Schroeder 频率
ok('Schroeder(0.6, 68) ≈ 187.9 Hz', near(S.schroederFreq(0.6, 68), 2000 * Math.sqrt(0.6 / 68), 0.5), S.schroederFreq(0.6, 68));

// 房间常数 R = Sᾱ/(1−ᾱ)
ok('房间常数(95, 0.25) ≈ 31.67', near(S.roomConstant(95, 0.25), 95 * 0.25 / 0.75, 1e-6), S.roomConstant(95, 0.25));

// 临界距离
ok('临界距离(1, 31.67) ≈ 0.794 m', near(S.criticalDistance(1, 31.6667), 0.141 * Math.sqrt(31.6667), 1e-3), S.criticalDistance(1, 31.6667));

// 稳态声压级 Lp = Lw + 10lg[Q/(4πr²)+4/R]
var lp = S.steadyStateLp({ Lw: 90, Q: 1, r: 3, R: 31.6667 });
ok('稳态 Lp(90,1,3,31.67) ≈ 81.3 dB', near(lp.lp, 81.3, 0.2), lp.lp);
ok('Lp 为直达与混响能量和（≥ 混响分量）', lp.direct < lp.lp && lp.lp >= lp.reverb - 1e-6,
  'Lp=' + lp.lp + ' dir=' + lp.direct + ' rev=' + lp.reverb);

// 多声源叠加（能量和 ≥ 单源最大；混响场中两相似源仅增约 3 dB）
var ms = S.multiSourceLp([{ Lw: 90, Q: 1, r: 3 }, { Lw: 88, Q: 1, r: 3 }], 31.6667);
ok('多声源叠加总声压级 > 单源最大', ms && ms.lp > 81.3 && ms.lp < 86, ms && ms.lp);

// 空气吸收：应返回有限正数（dB/m）
var air = S.airAbsorption(1000, 20, 50);
ok('空气吸收 @1k(20℃,50%) 为有限正数', air && air.alpha > 0 && isFinite(air.alpha), air && air.alpha);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
