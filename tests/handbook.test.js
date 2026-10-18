/*
 * handbook.test.js — 公式术语手册内核（public/js/handbook.js）
 * 覆盖：数据结构完整性、分类覆盖、检索（单词/多词 AND/分类限定/缩写/优先级）、
 *       统计、建议词、以及「相关模块路由」与 router.js 路由表的一致性。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../public/js/handbook.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('  FAIL ' + name); }
}

const CAT_IDS = H.CATS.map(function (c) { return c.id; });

console.log('==== handbook 内核测试 ====');

// [1] 分类表
console.log('\n[1] 分类表');
ok('分类数 = 10', H.CATS.length === 10);
ok('分类 id 唯一', new Set(CAT_IDS).size === CAT_IDS.length);
ok('每类都有 name 与 icon', H.CATS.every(function (c) { return c.name && c.icon; }));
ok('catName 正确', H.catName('room') === '房间声学');
ok('catName 未知 id 原样返回', H.catName('zzz') === 'zzz');

// [2] 条目完整性
console.log('\n[2] 条目完整性');
ok('条目数 > 100', H.ENTRIES.length > 100);
ok('每条都有 t（术语名）', H.ENTRIES.every(function (e) { return typeof e.t === 'string' && e.t.length > 0; }));
ok('每条都有 d（说明）', H.ENTRIES.every(function (e) { return typeof e.d === 'string' && e.d.length >= 8; }));
ok('每条 c 都是合法分类 id', H.ENTRIES.every(function (e) { return CAT_IDS.indexOf(e.c) >= 0; }));
ok('术语名不重复', (function () {
  const seen = {}; let dup = false;
  H.ENTRIES.forEach(function (e) { if (seen[e.t]) dup = true; seen[e.t] = 1; });
  return !dup;
})());
ok('all() 返回同一集合', H.all().length === H.ENTRIES.length);

// [3] 分类覆盖
console.log('\n[3] 分类覆盖');
CAT_IDS.forEach(function (id) {
  ok('分类「' + id + '」至少 6 条', H.byCat(id).length >= 6);
});
ok('byCat 结果分类正确', H.byCat('occ').every(function (e) { return e.c === 'occ'; }));
ok('byCat 未知 id 返回空', H.byCat('nope').length === 0);

// [4] stats
console.log('\n[4] stats');
const st = H.stats();
ok('entries 与总数一致', st.entries === H.ENTRIES.length);
ok('cats = 10', st.cats === 10);
ok('perCat 求和 = 总数', CAT_IDS.reduce(function (a, id) { return a + st.perCat[id]; }, 0) === H.ENTRIES.length);

// [5] search
console.log('\n[5] search');
ok('空查询返回全部', H.search('').length === H.ENTRIES.length);
ok('null 查询返回全部', H.search(null).length === H.ENTRIES.length);
ok('中文关键词命中', H.search('混响').length >= 1);
ok('缩写命中（RT60）', H.search('RT60').length >= 1);
ok('大小写不敏感（rt60）', H.search('rt60').length === H.search('RT60').length);
ok('公式命中（10·lg）', H.search('10·lg').length >= 1);
ok('多词 AND：混响 + 赛宾', H.search('混响 赛宾').every(function (e) {
  const s = (e.t + e.a + e.d + (e.f || '')).toLowerCase();
  return s.indexOf('混响') >= 0 && s.indexOf('赛宾') >= 0;
}));
ok('多词 AND 结果数 ≤ 单词结果数', H.search('混响 赛宾').length <= H.search('混响').length);
ok('分类限定生效', H.search('', { cat: 'vib' }).every(function (e) { return e.c === 'vib'; }));
ok('分类限定 + 关键词', H.search('振动', { cat: 'vib' }).length >= 1);
ok('无命中返回空数组', H.search('zzzzz不存在的词').length === 0);
ok('术语名精确匹配排首位', (function () {
  const r = H.search('混响时间');
  return r.length > 0 && r[0].t === '混响时间';
})());
ok('前缀命中优先于说明命中', (function () {
  const r = H.search('隔声');
  return r.length > 0 && r[0].t.indexOf('隔声') === 0;
})());

// [6] suggest
console.log('\n[6] suggest');
ok('suggest 返回术语名数组', Array.isArray(H.suggest('混响')) && typeof H.suggest('混响')[0] === 'string');
ok('suggest 最多 8 条', H.suggest('声').length <= 8);
ok('无命中时 suggest 为空', H.suggest('zzzzz').length === 0);

// [7] 相关模块路由与 router.js 一致
console.log('\n[7] r 字段与 router 路由表一致');
const routerSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'router.js'), 'utf8');
const routeRe = /^\s*'?([\w-]+)'?\s*:\s*\{\s*view:\s*'view-[\w-]+'/gm;
const routes = new Set();
let m;
while ((m = routeRe.exec(routerSrc)) !== null) { routes.add(m[1]); }
const withRoute = H.ENTRIES.filter(function (e) { return e.r; });
ok('存在带 r 的条目', withRoute.length >= 30);
withRoute.forEach(function (e) {
  ok('条目「' + e.t + '」的 r=' + e.r + ' 是合法路由', routes.has(e.r));
});

console.log('\n==== ' + passed + ' passed, ' + failed + ' failed ====');
if (failed) { process.exitCode = 1; }
