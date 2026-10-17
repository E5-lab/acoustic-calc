/*
 * emission.test.js — 环境噪声排放限值对照内核测试 (node tests/emission.test.js)
 * 锚点：GB 12348 2 类 昼 60/夜 50；GB 12523 昼 70/夜 55
 */
var E = require('../public/js/emission.js');
var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.01 : tol); }

console.log('\n[1] 标准清单');
ok('4 个标准', E.STANDARDS.length === 4);
ok('标准含 GB12348/22337/12523/3096', ['GB12348','GB22337','GB12523','GB3096'].every(function (id) { return E.STANDARDS.some(function (s) { return s.id === id; }); }));

console.log('\n[2] GB 12348 厂界判定');
var r = E.check('GB12348', '2', 58, 48);
ok('2 类 昼58/夜48 均达标', r.ok === true && r.day.ok === true && r.night.ok === true, JSON.stringify(r.day));
var r2 = E.check('GB12348', '2', 62, 48);
ok('昼 62 超标 2 dB', r2.day.ok === false && close(r2.day.exceed, 2, 0.01));
var r3 = E.check('GB12348', '3', 65, 56);
ok('3 类 昼 65 达标、夜 56 超标 1', r3.day.ok === true && r3.night.ok === false && close(r3.night.exceed, 1, 0.01));
ok('未知标准报错', E.check('GB999', '1', 50).ok === false);
ok('未知类别报错', E.check('GB12348', '9', 50).ok === false);
ok('缺实测值报错', E.check('GB12348', 1).ok === false);

console.log('\n[3] GB 12523 施工场界');
var s = E.check('GB12523', null, 68, 58);
ok('昼 68 达标、夜 58 超标 3', s.day.ok === true && s.night.ok === false && close(s.night.exceed, 3, 0.01));
ok('夜间限值 55', s.night.limit === 55);
ok('昼间限值 70', s.day.limit === 70);

console.log('\n[4] GB 3096');
var g = E.check('GB3096', '4a', 72, 50);
ok('4a 昼 72 超标 2、夜 50 达标', g.day.ok === false && close(g.day.exceed, 2, 0.01) && g.night.ok === true);
ok('4b 夜间 60', E.check('GB3096', '4b', null, 62).night.limit === 60 && E.check('GB3096', '4b', null, 62).night.ok === false);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);