/*
 * export.test.js — 计算书导出工具（public/js/export.js）的纯函数部分
 * 覆盖 CSV 转义（逗号/引号/换行/空值）与文本对齐（含中日韩双宽字符）。
 * DOM 相关能力（采集参数/结果、下载、打印）在浏览器中验证，不在此覆盖。
 */
'use strict';
const E = require('../public/js/export.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('  FAIL ' + name); }
}

console.log('==== export 内核测试 ====');

// [1] csvCell
console.log('\n[1] csvCell');
ok('普通值不加引号', E.csvCell('abc') === 'abc');
ok('数字转字符串', E.csvCell(12.5) === '12.5');
ok('含逗号加引号', E.csvCell('a,b') === '"a,b"');
ok('含双引号转义并加引号', E.csvCell('a"b') === '"a""b"');
ok('含换行加引号', E.csvCell('a\nb') === '"a\nb"');
ok('含回车加引号', E.csvCell('a\rb') === '"a\rb"');
ok('null → 空串', E.csvCell(null) === '');
ok('undefined → 空串', E.csvCell(undefined) === '');
ok('空串 → 空串', E.csvCell('') === '');
ok('保留前后空格（加引号）', E.csvCell(' a ') === '" a "');
ok('仅双引号', E.csvCell('"') === '""""');

// [2] toCsv
console.log('\n[2] toCsv');
ok('单行', E.toCsv([['a', 'b']]) === 'a,b');
ok('多行用 CRLF', E.toCsv([['a'], ['b']]) === 'a\r\nb');
ok('二维矩阵', E.toCsv([['h1', 'h2'], ['1', '2']]) === 'h1,h2\r\n1,2');
ok('空数组 → 空串', E.toCsv([]) === '');
ok('null → 空串', E.toCsv(null) === '');
ok('空行保留', E.toCsv([['a'], [], ['b']]) === 'a\r\n\r\nb');
ok('含逗号与引号混合', E.toCsv([['x,y', 'p"q']]) === '"x,y","p""q"');
ok('数值与空值混排', E.toCsv([[1, null, 'z']]) === '1,,z');

// [3] pad（中文双宽）
console.log('\n[3] pad');
ok('ASCII 补齐到 6', E.pad('abc', 6) === 'abc   ');
ok('已达宽度不再补', E.pad('abcdef', 6) === 'abcdef');
ok('超宽不截断', E.pad('abcdefgh', 3) === 'abcdefgh');
ok('中文按双宽计算（宽 4 → 补 2 空格）', E.pad('中文', 6) === '中文  ');
ok('中英混排（宽 1+2+2=5 → 补 1）', E.pad('a中文', 6) === 'a中文 ');
ok('空串补齐', E.pad('', 4) === '    ');
ok('null 视为空串', E.pad(null, 3) === '   ');
ok('数字入参', E.pad(42, 5) === '42   ');

console.log('\n==== ' + passed + ' passed, ' + failed + ' failed ====');
if (failed) { process.exitCode = 1; }
