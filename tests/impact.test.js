/*
 * impact.test.js — 撞击声隔声评价内核测试 (node tests/impact.test.js)
 *
 * 锚点：
 *   - 归一化：Ln = Li + 10lg(A/10)，A=100 → +10 dB
 *   - 标准化：LnT = Li − 10lg(T/0.5)，T=0.8 → −2.04 dB
 *   - 平移曲线法：恒定谱 C 时 ∑不利偏差 = n·(C − mean(ref) − X)
 *     ref 均值 = (0+0+1+..+14)/16 = 105/16 = 6.5625
 *     C=60 → 需 X 使 16·(60−6.5625−X) ≤ 32 → X ≥ 51.94 → 手算锚点 Lnw = 52.0
 *   - 参考曲线形状：100Hz=0、3150Hz=+14
 */
var I = require('../public/js/impact.js');
var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.01 : tol); }

console.log('\n[1] 归一化 / 标准化换算');
ok('Ln: 100 dB @ A=10m² → 100 dB', close(I.normalize(100, 10), 100, 0.001));
ok('Ln: 100 dB @ A=100m² → 110 dB', close(I.normalize(100, 100), 110, 0.001));
ok('Ln: 90 dB @ A=20m² → 93.01 dB', close(I.normalize(90, 20), 93.01, 0.01));
ok('LnT: 100 dB @ T=0.5s → 100 dB', close(I.standardized(100, 0.5), 100, 0.001));
ok('LnT: 100 dB @ T=0.8s → 97.96 dB', close(I.standardized(100, 0.8), 97.96, 0.01));
ok('非法输入返回 null', I.normalize('abc', 10) === null && I.normalize(100, 0) === null);

console.log('\n[2] 参考曲线');
ok('16 个评价频带', I.BANDS.length === 16);
ok('首带 100 Hz、末带 3150 Hz', I.BANDS[0] === 100 && I.BANDS[15] === 3150);
ok('参考曲线 100 Hz = 0 dB', I.REF[0] === 0);
ok('参考曲线 3150 Hz = +14 dB', I.REF[15] === 14);
ok('参考曲线逐带单调递增', I.REF.every(function (v, i) { return i === 0 || v >= I.REF[i - 1]; }));

console.log('\n[3] 平移曲线法单值评价');
// 恒定谱 40 dB → 手算锚点：X=33.4（8 带正偏差 6.6..0.6 之和 = 31.9 ≤ 32）
var r40 = I.rating(Array(16).fill(40));
ok('恒定谱 40 → Lnw = 33.4', close(r40.lnw, 33.4, 0.2), r40.lnw);
ok('恒定谱 40 不利偏差和 ≤ 32', r40.sumDev <= 32.0, r40.sumDev);
ok('恒定谱 40 单带偏差 ≤ 8', r40.maxDev <= 8.0, r40.maxDev);
// 恒定谱 60 → Lnw ≈ 53.4（同类推导：8 带正偏差 6.6..0.6 = 31.9 ≤ 32）
var r60 = I.rating(Array(16).fill(60));
ok('恒定谱 60 → Lnw ≈ 53.4', close(r60.lnw, 53.4, 0.3), r60.lnw);
// 恒定谱 30 → Lnw ≈ 23.0（X ≥ 23.44）
var r30 = I.rating(Array(16).fill(30));
ok('恒定谱 30 → Lnw ≈ 23.4', close(r30.lnw, 23.4, 0.3), r30.lnw);
// 缺失带允许（只给 500 Hz）
var sparse = I.rating([null, null, null, null, null, null, null, 50, null, null, null, null, null, null, null, null]);
ok('单带输入也可评定', sparse.ok === true && sparse.lnw > 0);
// 无效输入
ok('空输入返回错误', I.rating([]).ok === false);
ok('全空输入返回错误', I.rating([null, null]).ok === false);

console.log('\n[4] 楼板构造参考');
var c1 = I.constructionSpectrum('rc120');
ok('RC120 构造存在', c1 != null && c1.spectrum.length === 16);
ok('构造谱 500 Hz = 参考级', c1.spectrum[7] === c1.L500);
var c2 = I.constructionSpectrum('rc120-floating-pe');
ok('浮筑构造撞击声级显著低于裸板', c2.L500 < c1.L500 - 10, c2.L500);
ok('未知构造返回 null', I.constructionSpectrum('nope') === null);
ok('构造库 8 档', I.CONSTRUCTIONS.length === 8);

console.log('\n[5] 限值判定');
var v = I.verdict(62, 65);
ok('62 ≤ 65 → 达标', v.ok === true && close(v.exceed, -3, 0.01));
var v2 = I.verdict(68, 65);
ok('68 > 65 → 超标 3 dB', v2.ok === false && close(v2.exceed, 3, 0.01));
ok('无限值返回 null', I.verdict(60, null) === null);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);