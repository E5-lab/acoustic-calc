/*
 * calc-registry.test.js — 声明式计算器契约门禁（质量闸，所有 calc-bN 共用）
 *
 * 运行：node tests/calc-registry.test.js
 * 目的：保证每个登记的计算器都满足引擎要求的字段，且不出现重复 route。
 * 各协作 AI 实现 calc-bN 后，本测试会随 CalcRegistry 条目增加而自动覆盖。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-view.js');
require('../public/js/calc-b1.js');
require('../public/js/calc-b2.js');
require('../public/js/calc-b3.js');
require('../public/js/calc-b4.js');
require('../public/js/calc-b5.js');
require('../public/js/calc-b6.js');
require('../public/js/calc-b7.js');
require('../public/js/calc-b8.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}

var R = CalcRegistry;
var all = R.all();
var keys = Object.keys(all);

console.log('\n[registry] 已登记工具数 = ' + keys.length + '（B7=4 + B1=6 + B2=6 + B3=5 + B4=6 + B5=5 + B6=5 + B8=4，全部完成）');
assert('已登记全部 41 个声明式计算器', keys.length === 41, keys.length);

console.log('\n[registry] 契约字段校验');
var seen = {};
keys.forEach(function (rt) {
  var c = all[rt];
  assert(rt + ' 有 title', !!c.title);
  assert(rt + ' 有 nav.group', !!(c.nav && c.nav.group));
  assert(rt + ' 有 inputs 数组', Array.isArray(c.inputs) && c.inputs.length > 0);
  assert(rt + ' 有 outputs 数组', Array.isArray(c.outputs) && c.outputs.length > 0);
  assert(rt + ' 有 compute 函数', typeof c.compute === 'function');
  // 每个 input 必须有 key 与 label
  (c.inputs || []).forEach(function (f) {
    assert(rt + ' input.' + (f.key || '?') + ' 含 key/label', !!f.key && !!f.label);
    if (f.type === 'select') assert(rt + ' select.' + f.key + ' 含 options', Array.isArray(f.options) && f.options.length > 0);
  });
  // compute 为纯函数：不抛错且返回结构完整
  var res;
  try { res = c.compute(buildSampleState(c)); }
  catch (e) { assert(rt + ' compute 不抛错', false, e.message); return; }
  assert(rt + ' compute 返回 values 对象', res && typeof res.values === 'object');
  assert(rt + ' compute 返回 formula 文本', res && typeof res.formula === 'string');
});

console.log('\n[registry] route 唯一性');
assert('无重复 route（' + keys.length + ' 条 = ' + new Set(keys).size + ' 唯一）', keys.length === new Set(keys).size);

function buildSampleState(c) {
  var s = {};
  (c.inputs || []).forEach(function (f) { s[f.key] = (f.def != null ? f.def : (f.type === 'select' ? (f.options && f.options[0].value) : 1)); });
  return s;
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
