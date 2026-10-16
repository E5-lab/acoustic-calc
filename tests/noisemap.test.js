/*
 * noisemap.test.js — 环境噪声进阶内核逻辑测试 (node tests/noisemap.test.js)
 */
var N = require('../public/js/noisemap.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var flat = { 125: 90, 250: 90, 500: 90, 1000: 90, 2000: 90, 4000: 90 };

console.log('\n[1] 网格声压级');
var g = N.gridLevels({
  sources: [{ x: 0, y: 0, hs: 1.5, spectrum: flat }],
  x0: -30, x1: 30, y0: -20, y1: 20, cols: 25, rows: 17
});
ok('网格计算成功', g.ok);
ok('输出尺寸正确', g.grid.length === 17 && g.grid[0].length === 25);
ok('最大值在声源附近', Math.abs(g.max - g.grid[8][12]) < 1e-6, g.max + ' vs ' + g.grid[8][12]);
ok('对称点声压级相等', near(g.grid[8][6], g.grid[8][18], 1e-6), g.grid[8][6] + ' vs ' + g.grid[8][18]);
// r=10 处：Lw_flat 的 A 计权总值 ≈ 90 − 1.53；Adiv = 31；地面/大气很小
var at10 = g.grid[8][17]; // x=10 处（cols=25, dx=2.5: i=17 → x=-30+17*2.5=12.5）——直接用插值不便，改为检查衰减趋势
ok('距离越远声压级越低', g.grid[8][12] > g.grid[8][17] && g.grid[8][17] > g.grid[8][22]);
ok('双源能量叠加高于单源', (function () {
  var g2 = N.gridLevels({
    sources: [{ x: -5, y: 0, hs: 1.5, spectrum: flat }, { x: 5, y: 0, hs: 1.5, spectrum: flat }],
    x0: -30, x1: 30, y0: -20, y1: 20, cols: 25, rows: 17
  });
  // 取远端角落 (30,20)：单源距 36m，双源分别距 40/32m，叠加必高于单源
  return g2.grid[16][24] > g.grid[16][24] + 0.5;
})(), g.grid[16][24]);
ok('缺声源报错', !N.gridLevels({ sources: [], x0: 0, x1: 1, y0: 0, y1: 1 }).ok);

console.log('\n[2] 等值线提取');
var c = N.contours({ grid: g.grid, cols: 25, rows: 17, x0: -30, y1: 20, y0: -20, x1: 30, levels: [55, 60, 65, 70] });
ok('返回 4 个等值层级', Object.keys(c).length === 4);
ok('范围内的层级有线段', c[55].length > 0 && c[65].length > 0);
ok('高声压级层级线段更少（范围更小）', c[70].length < c[55].length);
var cHigh = N.contours({ grid: g.grid, cols: 25, rows: 17, x0: -30, x1: 30, y0: -20, y1: 20, levels: [200] });
ok('高于最大值的层级无线段', cHigh[200].length === 0);

console.log('\n[3] 限值达标判定');
var r1 = N.checkLimit({ table: 'gb3096', key: '1', period: 'day', leq: 54 });
ok('GB 3096 1类昼间 54 ≤ 55 达标', r1.ok && r1.pass && near(r1.margin, 1));
var r2 = N.checkLimit({ table: 'gb3096', key: '1', period: 'day', leq: 56 });
ok('GB 3096 1类昼间 56 > 55 不达标', r2.ok && !r2.pass && near(r2.margin, -1));
var r3 = N.checkLimit({ table: 'gb3096', key: '4a', period: 'night', leq: 58 });
ok('GB 3096 4a类夜间 58 > 55 不达标', r3.ok && !r3.pass);
var r4 = N.checkLimit({ table: 'gb55016-out', key: 'sleep', period: 'night', leq: 32 });
ok('GB 55016 睡眠夜间 32 > 30 不达标', r4.ok && !r4.pass);
var r5 = N.checkLimit({ table: 'gb55016-out', key: 'sleep', period: 'night', leq: 32, relax5: true });
ok('2/3/4类区放宽 5dB 后达标', r5.ok && r5.pass && near(r5.limit, 35));
var r6 = N.checkLimit({ table: 'gb55016-eq', key: 'sleep', leq: 32 });
ok('GB 55016 内部设备 睡眠 ≤33 达标', r6.ok && r6.pass && near(r6.limit, 33));
var r7 = N.checkLimit({ table: 'gb55016-out', key: 'study', period: 'day', leq: 34 });
ok('阅读自学昼间 34 ≤ 35 达标', r7.ok && r7.pass);
ok('未知类别报错', !N.checkLimit({ table: 'gb3096', key: '9', leq: 50 }).ok);
ok('缺 leq 报错', !N.checkLimit({ table: 'gb3096', key: '1' }).ok);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
