/*
 * material-store.test.js — 自定义材料库（localStorage 持久化 + JSON 导入导出）测试
 * 运行：node tests/material-store.test.js
 *
 * 存储通过 MaterialStore.use() 注入假实现，逐用例重置，不依赖真实 localStorage。
 */
var MS = require('../public/js/material-store.js');
var fs = require('fs');
var pathMod = require('path');

var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-9 : tol); }

function fakeStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    dump: function () { return mem; }
  };
}
function reset() { MS.use(fakeStorage()); }

var RT6 = [0.10, 0.25, 0.55, 0.85, 0.95, 0.95];
var MF7 = [0.05, 0.10, 0.25, 0.55, 0.80, 0.90, 0.95];

console.log('[1] 作用域定义');
ok('两个作用域：rt60（6 频带）/ muffler（7 频带）',
  MS.SCOPES.rt60.bands === 6 && MS.SCOPES.muffler.bands === 7);
ok('频带标签与内置库一致（125~4k / 63~4k）',
  MS.SCOPES.rt60.bandLabels.join() === '125,250,500,1k,2k,4k' &&
  MS.SCOPES.muffler.bandLabels.join() === '63,125,250,500,1k,2k,4k');
ok('未知作用域 add 报错', MS.add('nope', { name: 'x', alpha: [] }).ok === false);

console.log('\n[2] 新增 / 查询 / 删除');
reset();
ok('初始为空', MS.list('rt60').length === 0);
var r1 = MS.add('rt60', { name: '定制穿孔铝板', alpha: RT6 });
ok('新增成功', r1.ok === true, JSON.stringify(r1));
ok('自动生成 c_ 前缀 id', /^c_[a-z0-9]{6,}$/.test(r1.id), r1.id);
var got = MS.get('rt60', r1.id);
ok('按 id 取回，α 数值一致', got && got.name === '定制穿孔铝板' && got.alpha.every(function (v, i) { return close(v, RT6[i]); }));
ok('名称去除首尾空白', MS.add('rt60', { name: '  软包墙面  ', alpha: RT6 }).material.name === '软包墙面');
ok('作用域隔离：muffler 不受 rt60 影响', MS.list('muffler').length === 0);
var rm1 = MS.add('muffler', { name: '定制衬里', alpha: MF7 });
ok('muffler 作用域可独立新增（7 频带）', rm1.ok === true);
ok('删除', MS.remove('rt60', r1.id).ok === true && MS.get('rt60', r1.id) === null);
ok('删除不存在 id 报错', MS.remove('rt60', 'c_nope').ok === false);

console.log('\n[3] 校验规则');
reset();
ok('缺名称报错', MS.add('rt60', { name: '', alpha: RT6 }).ok === false);
ok('名称超 40 字报错', MS.add('rt60', { name: new Array(42).join('长'), alpha: RT6 }).ok === false);
ok('频带数不符报错（rt60 传 7 值）', MS.add('rt60', { name: 'x', alpha: MF7 }).ok === false);
ok('α 越界报错（-0.1 / 1.3）',
  MS.add('rt60', { name: 'x', alpha: [0.1, 0.2, 0.3, 0.4, 0.5, -0.1] }).ok === false &&
  MS.add('rt60', { name: 'x', alpha: [0.1, 0.2, 0.3, 0.4, 0.5, 1.3] }).ok === false);
ok('α 非数值报错', MS.add('rt60', { name: 'x', alpha: [0.1, 0.2, 'abc', 0.4, 0.5, 0.6] }).ok === false);
ok('α = 1.2 允许（实测可略超 1）', MS.add('rt60', { name: '高吸声实测', alpha: [0.1, 0.2, 0.3, 0.4, 1.0, 1.2] }).ok === true);
MS.add('rt60', { name: '同名测试', alpha: RT6 });
ok('作用域内重名报错', MS.add('rt60', { name: '同名测试', alpha: RT6 }).ok === false);
ok('跨作用域同名允许', MS.add('muffler', { name: '同名测试', alpha: MF7 }).ok === true);

console.log('\n[4] 持久化（localStorage 写入）');
var store = fakeStorage();
MS.use(store);
MS.add('rt60', { name: '持久化验证', alpha: RT6 });
var raw = store.dump()[MS.STORAGE_KEY];
ok('存储键为 acousticCalc.materialStore.v1', raw != null, Object.keys(store.dump()).join());
var parsed = JSON.parse(raw);
ok('存储为 JSON 对象且版本号正确', parsed.version === 1 && Array.isArray(parsed.rt60) && parsed.rt60.length === 1);
ok('重开（新存储同一内容）后 list 一致', (function () {
  var store2 = fakeStorage(); store2.setItem(MS.STORAGE_KEY, raw); MS.use(store2);
  var okk = MS.list('rt60')[0].name === '持久化验证';
  MS.use(fakeStorage());
  return okk;
})());
ok('损坏 JSON 静默回退空库', (function () {
  var bad = fakeStorage(); bad.setItem(MS.STORAGE_KEY, '{{{not json'); MS.use(bad);
  var okk = MS.list('rt60').length === 0;
  reset();
  return okk;
})());

console.log('\n[5] 导出 / 导入');
reset();
MS.add('rt60', { name: '导出材料A', alpha: RT6 });
MS.add('muffler', { name: '导出材料B', alpha: MF7 });
var all = MS.exportJSON();
var obj = JSON.parse(all);
ok('全量导出含两个作用域', obj.version === 1 && obj.rt60.length === 1 && obj.muffler.length === 1);
var onlyRt = JSON.parse(MS.exportJSON('rt60'));
ok('单作用域导出仅含 rt60', onlyRt.rt60.length === 1 && onlyRt.muffler === undefined);
reset();
var imp = MS.importJSON(all);
ok('空库导入：新增 2', imp.ok === true && imp.added === 2 && imp.skipped === 0, JSON.stringify(imp));
ok('导入后可按 id 取用', MS.get('rt60', obj.rt60[0].id) != null);
var imp2 = MS.importJSON(all);
ok('重复导入默认按 id 跳过', imp2.added === 0 && imp2.skipped === 2);
var imp3 = MS.importJSON(all, { overwrite: true });
ok('overwrite 覆盖同名 id（计数为替换）', imp3.ok === true && imp3.added === 2 && imp3.skipped === 0);
reset();
MS.add('rt60', { name: '既有材料', alpha: RT6 });
var imp4 = MS.importJSON(all);
ok('与既有材料无 id 冲突时正常新增', imp4.added === 2 && imp4.errors.length === 0);
var imp5 = MS.importJSON(JSON.stringify({
  version: 1, rt60: [{ id: 'c_brandnew', name: obj.rt60[0].name, alpha: RT6 }]
}));
ok('新 id 但作用域内重名被拒并计入 errors', imp5.added === 0 && imp5.skipped === 1 && imp5.errors.length === 1, JSON.stringify(imp5));
ok('重名被拒不影响库内既有材料', MS.list('rt60').length === 2 && MS.list('muffler').length === 1);
ok('非法 JSON 报错', MS.importJSON('不是JSON').ok === false);
ok('数组顶层报错', MS.importJSON('[1,2]').ok === false);
ok('空文本报错', MS.importJSON('').ok === false);
ok('导入 alpha 越界材料被拒', MS.importJSON('{"version":1,"rt60":[{"id":"c_abc123","name":"坏","alpha":[9,0,0,0,0,0]}]}').errors.length === 1);
ok('导入自动补格式非法 id', (function () {
  reset();
  var r = MS.importJSON('{"version":1,"muffler":[{"id":"bad id","name":"重编id","alpha":[0.1,0.1,0.1,0.1,0.1,0.1,0.1]}]}');
  var okk = r.added === 1 && /^c_[a-z0-9]{6,}$/.test(MS.list('muffler')[0].id);
  reset();
  return okk;
})());

console.log('\n[6] add 指定 id（导入路径）');
reset();
ok('合法 c_ id 可指定', MS.add('rt60', { id: 'c_import01', name: '带id', alpha: RT6 }).id === 'c_import01');
ok('指定已存在 id 报错', MS.add('rt60', { id: 'c_import01', name: '重复id', alpha: RT6 }).ok === false);
ok('非法 id 格式报错', MS.add('rt60', { id: 'builtin', name: '冒充内置', alpha: RT6 }).ok === false);

console.log('\n[7] 界面接线守护');
(function () {
  var html = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  var vRt = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'js', 'view-rt60.js'), 'utf8');
  var vMf = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'js', 'view-muffler.js'), 'utf8');
  var msJs = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'js', 'material-store.js'), 'utf8');
  ok('index.html 引入 material-store.js（先于视图脚本）',
    html.indexOf('js/material-store.js') >= 0 && html.indexOf('material-store.js') < html.indexOf('js/view-rt60.js'));
  ok('index.html 含 rtMatStore / mfMatStore 容器',
    html.indexOf('id="rtMatStore"') >= 0 && html.indexOf('id="mfMatStore"') >= 0);
  ok('使用说明测试计数同步为 63（治理守护）',
    /共 63 个测试文件全部通过/.test(html));
  ok('rt60 视图：下拉并入自定义材料且以 alpha 参与计算',
    vRt.indexOf("MS.list('rt60')") >= 0 && vRt.indexOf("MS.get('rt60', r.materialId)") >= 0 &&
    vRt.indexOf('alpha: c.alpha.slice()') >= 0);
  ok('rt60 视图：填充材料下拉仅内置（内核按 id 解析）', vRt.indexOf('builtinOptions(state.filler)') >= 0);
  ok('rt60 视图：分享链接携带自定义材料 alpha', vRt.indexOf('alpha: c.alpha }') >= 0);
  ok('rt60 视图：渲染自定义材料管理器', vRt.indexOf("renderManager($('rtMatStore')") >= 0);
  ok('muffler 视图：readAlpha 识别自定义材料', vMf.indexOf("MS.get('muffler', v)") >= 0);
  ok('muffler 视图：材料下拉含自定义 optgroup', vMf.indexOf('自定义材料') >= 0 && vMf.indexOf('fillMaterialSelect') >= 0);
  ok('muffler 视图：渲染自定义材料管理器', vMf.indexOf("renderManager($('mfMatStore')") >= 0);
  ok('material-store.js：含导出/导入与内存兜底', msJs.indexOf('exportJSON') >= 0 && msJs.indexOf('importJSON') >= 0 && msJs.indexOf('renderManager') >= 0);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
