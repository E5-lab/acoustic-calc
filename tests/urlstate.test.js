/*
 * urlstate.test.js — 哈希路由 query 参数解析与分享链接构造（public/js/urlstate.js）
 * 锚点均为可手算结果；覆盖边界：空串、重复键、无 "="、编码字符、超长链接。
 */
'use strict';
const U = require('../public/js/urlstate.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('  FAIL ' + name); }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

console.log('==== urlstate 内核测试 ====');

// [1] parseQuery
console.log('\n[1] parseQuery');
ok('空串 → {}', Object.keys(U.parseQuery('')).length === 0);
ok('null → {}', Object.keys(U.parseQuery(null)).length === 0);
ok('去前导 ?', U.parseQuery('?a=1').a === '1');
ok('多参数', U.parseQuery('a=1&b=2').b === '2');
ok('+ 视作空格', U.parseQuery('q=hello+world').q === 'hello world');
ok('%20 视作空格', U.parseQuery('q=hello%20world').q === 'hello world');
ok('中文解码', U.parseQuery('name=%E5%99%AA%E5%A3%B0').name === '噪声');
ok('无 "=" 的片段值为空串', U.parseQuery('flag').flag === '');
ok('空片段被跳过', U.parseQuery('a=1&&b=2').b === '2');
ok('重复键后者覆盖', U.parseQuery('a=1&a=2').a === '2');
ok('非法百分号不抛异常', U.parseQuery('bad=%E4%B8').bad !== undefined);
ok('值中带 = 保留', U.parseQuery('f=a=b').f === 'a=b');

// [2] encodeQuery
console.log('\n[2] encodeQuery');
ok('空对象 → ""', U.encodeQuery({}) === '');
ok('null → ""', U.encodeQuery(null) === '');
ok('丢弃空串', U.encodeQuery({ a: '1', b: '' }) === 'a=1');
ok('丢弃 null/undefined', U.encodeQuery({ a: '1', b: null, c: undefined }) === 'a=1');
ok('布尔转 1/0', U.encodeQuery({ on: true, off: false }) === 'on=1&off=0');
ok('数字转字符串', U.encodeQuery({ n: 12.5 }) === 'n=12.5');
ok('中文编码', U.encodeQuery({ name: '噪声' }) === 'name=%E5%99%AA%E5%A3%B0');
ok('往返一致', U.parseQuery(U.encodeQuery({ a: '1', b: 'x y' })).b === 'x y');

// [3] parseHash
console.log('\n[3] parseHash');
const p1 = U.parseHash('#/leakage?wall=3&hole=1');
ok('path 提取', p1.path === 'leakage');
ok('params 提取', p1.params.wall === '3' && p1.params.hole === '1');
ok('无 # 前缀兼容', U.parseHash('/rt60').path === 'rt60');
ok('无前导斜杠兼容', U.parseHash('rt60').path === 'rt60');
ok('尾部斜杠去除', U.parseHash('#/rt60/').path === 'rt60');
ok('无参数时 params 为空对象', Object.keys(U.parseHash('#/rt60').params).length === 0);
ok('空 hash → 空 path', U.parseHash('').path === '');
ok('仅 ? 无参数', Object.keys(U.parseHash('#/rt60?').params).length === 0);

// [4] buildHash
console.log('\n[4] buildHash');
ok('无参数', U.buildHash('rt60', {}) === '#/rt60');
ok('带参数', U.buildHash('leakage', { wall: 3 }) === '#/leakage?wall=3');
ok('多参数保持插入序', U.buildHash('x', { a: '1', b: '2' }) === '#/x?a=1&b=2');
ok('空值被丢弃', U.buildHash('x', { a: '1', b: '' }) === '#/x?a=1');
ok('往返一致（含中文/空格）', (function () {
  const p = U.parseHash(U.buildHash('env', { name: '建筑 噪声', v: 2 }));
  return p.path === 'env' && p.params.name === '建筑 噪声' && p.params.v === '2';
})());

// [5] buildLink
console.log('\n[5] buildLink');
const l1 = U.buildLink('https://acoustic.example.com/', 'rt60', { v: 100 });
ok('拼接 base + hash', l1.url === 'https://acoustic.example.com/#/rt60?v=100');
ok('未超长标记为 false', l1.tooLong === false);
const l2 = U.buildLink('https://a.com/index.html#/old?x=1', 'rt60', {});
ok('剥离 base 中已有 hash', l2.url === 'https://a.com/index.html#/rt60');
const l3 = U.buildLink('https://a.com/index.html?keep=1', 'rt60', {});
ok('剥离 base 中已有 query', l3.url === 'https://a.com/index.html#/rt60');
const big = {}; for (let i = 0; i < 200; i++) { big['k' + i] = 'value' + i; }
ok('超长链接标记 tooLong', U.buildLink('https://a.com/', 'x', big).tooLong === true);

// [6] merge / pick
console.log('\n[6] merge / pick');
ok('merge 基础合并', U.merge({ a: '1' }, { b: '2' }).b === '2');
ok('merge 后者覆盖', U.merge({ a: '1' }, { a: '9' }).a === '9');
ok('merge 空值不覆盖', U.merge({ a: '1' }, { a: '' }).a === '1');
ok('merge null 安全', U.merge(null, { a: '1' }).a === '1');
ok('merge 不修改入参', (function () { const b = { a: '1' }; U.merge(b, { a: '2' }); return b.a === '1'; })());
ok('pick 只取指定键', Object.keys(U.pick({ a: '1', b: '2' }, ['a'])).length === 1);
ok('pick 缺失键忽略', U.pick({ a: '1' }, ['z']).z === undefined);

// [7] parseNum / parseBool
console.log('\n[7] parseNum / parseBool');
ok('parseNum 正常', U.parseNum('12.5') === 12.5);
ok('parseNum 逗号小数', U.parseNum('12,5') === 12.5);
ok('parseNum 空串取默认', U.parseNum('', 7) === 7);
ok('parseNum null 取默认', U.parseNum(null, 7) === 7);
ok('parseNum 非法取默认', U.parseNum('abc', 7) === 7);
ok('parseBool 1/true/on', U.parseBool('1') === true && U.parseBool('true') === true && U.parseBool('on') === true);
ok('parseBool 0/false/off', U.parseBool('0') === false && U.parseBool('off') === false);
ok('parseBool 未知取默认', U.parseBool('maybe', true) === true);
ok('parseBool 空串取默认', U.parseBool('', false) === false);

// [8] toQueryEntries
console.log('\n[8] toQueryEntries');
ok('返回键值对数组', U.toQueryEntries({ a: '1', b: '2' }).length === 2);
ok('null 安全', U.toQueryEntries(null).length === 0);

console.log('\n==== ' + passed + ' passed, ' + failed + ' failed ====');
if (failed) { process.exitCode = 1; }
