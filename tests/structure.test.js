/*
 * structure.test.js — 平台结构与文档同步守护测试 (node tests/structure.test.js)
 *
 * 防复发目标（对应 MODULE-ADMISSION.md 准入清单）：
 *   1) 计数自动校验：使用说明的测试文件数 = tests/ 实际数（含本文件）；
 *      总览 hint 与 hero 的模块数 = 实际 module-card 数；
 *   2) 三处分组名一致：顶栏导航 = 使用说明 = README 描述段；
 *   3) 演示器归属：sim-* / simfx / aural 卡片必须在「模拟与可听化」或
 *      「声学模拟器」分组，不得混入「现场实测」（防 v2.8 分组错位回归）；
 *   4) 徽标语义：全站不得出现零信息量的「可用」徽标。
 *
 * 任何一条失败 = 有并行提交破坏了结构约定，先修再合。
 */
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

var html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
var readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

// ---- 1) 计数自动校验 ----
console.log('\n[1] 计数自动校验');
var testFiles = fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); });
var statedTests = html.match(/共 (\d+) 个测试文件全部通过/);
assert('使用说明测试计数 = tests/ 实际文件数 (文案 ' + (statedTests ? statedTests[1] : '缺失') +
  ' / 实际 ' + testFiles.length + ')', !!statedTests && parseInt(statedTests[1], 10) === testFiles.length);

var homeStart = html.indexOf('id="view-home"');
var homeEnd = html.indexOf('id="view-all"', homeStart) > 0 ? html.indexOf('id="view-all"', homeStart) : html.length;
var home = html.slice(homeStart, homeEnd);
var cards = (home.match(/class="module-card"/g) || []).length;
var hint = html.match(/共 (\d+) 个分组、(\d+) 个模块/);
assert('总览 hint 模块数 = 卡片数 (文案 ' + (hint ? hint[2] : '缺失') + ' / 实际 ' + cards + ')',
  !!hint && parseInt(hint[2], 10) === cards);
assert('总览 hint 分组数 = 8', !!hint && parseInt(hint[1], 10) === 8);
var slides = (home.match(/class="hb-slide"/g) || []).length;
assert('首页 banner 轮播张数 = 4 (实际 ' + slides + ')', slides === 4);

// ---- 2) 三处分组名一致 ----
console.log('\n[2] 分组名一致性');
var navStart = html.indexOf('<nav class="mainnav"');
var navEnd = html.indexOf('</nav>', navStart);
var navHtml = html.slice(navStart, navEnd);
// nav-parent 按钮结构：文本分组名 + <svg class="nav-caret">（顶栏友链/导出不在 mainnav 内）
var navGroups = [];
var gRe = /<button class="nav-parent[^>]*>\s*([^<]+?)\s*<svg/g, gm;
while ((gm = gRe.exec(navHtml)) !== null) navGroups.push(gm[1].trim());
navGroups = navGroups.filter(function (g) { return g !== '更多'; });
assert('顶栏导航含 8 个分组 (实际 ' + navGroups.length + ')', navGroups.length === 8);

var usage = html.match(/顶栏按 <strong>([^<]+)<\/strong> 八个分组/);
var usageGroups = usage ? usage[1].split('/').map(function (s) { return s.trim(); }) : [];
assert('使用说明列举 8 个分组 (实际 ' + usageGroups.length + ')', usageGroups.length === 8);
navGroups.forEach(function (g, i) {
  assert('使用说明分组[' + i + '] = 导航「' + g + '」', usageGroups[i] === g);
});
var readmeDesc = readme.slice(0, readme.indexOf('\n## '));
navGroups.forEach(function (g) {
  assert('README 描述段含分组「' + g + '」', readmeDesc.indexOf(g) >= 0);
});

// ---- 3) 演示器分组归属 ----
console.log('\n[3] 演示器分组归属');
var DEMO_GROUPS = ['模拟与可听化', '声学模拟器'];
var LIVE_GROUP = '现场实测';
// 按 group-label 分段（段边界 = 下一个 group-label 或总览结束），不受内部嵌套影响
var groupBlocks = [];
var labelRe = /<div class="group-label">([^<]+)<\/div>/g, lm;
var labelMarks = [];
while ((lm = labelRe.exec(home)) !== null) labelMarks.push({ label: lm[1].trim(), start: lm.index });
for (var li = 0; li < labelMarks.length; li++) {
  var segEnd = li + 1 < labelMarks.length ? labelMarks[li + 1].start : home.length;
  groupBlocks.push({ label: labelMarks[li].label, body: home.slice(labelMarks[li].start, segEnd) });
}
assert('总览解析出 8 个分组块 (实际 ' + groupBlocks.length + ')', groupBlocks.length === 8);

var demoRoutes = [];
groupBlocks.forEach(function (gb) {
  var rRe = /<a class="module-card" href="#\/([\w-]+)"/g, rm;
  while ((rm = rRe.exec(gb.body)) !== null) {
    var r = rm[1];
    var isDemo = r === 'sim' || r === 'simfx' || r === 'aural' || r.indexOf('sim-') === 0;
    if (isDemo) {
      demoRoutes.push(r);
      if (gb.label === LIVE_GROUP) {
        assert('演示器 ' + r + ' 不得位于「现场实测」分组', false);
      } else {
        assert('演示器 ' + r + ' 位于「' + gb.label + '」', DEMO_GROUPS.indexOf(gb.label) >= 0);
      }
    }
    if (gb.label === LIVE_GROUP && !(r === 'splmeter' || r === 'rta' || r === 'siggen' || r === 'irt60' || r === 'stipa')) {
      assert('「现场实测」仅含实测五件套（发现 ' + r + '）', false);
    }
  }
});
assert('演示器共 21 个 (实际 ' + demoRoutes.length + ')', demoRoutes.length === 21);

// ---- 4) 徽标语义 ----
console.log('\n[4] 徽标语义');
assert('全站无零信息量「可用」徽标', html.indexOf('>可用</span>') < 0);
assert('准入清单文档存在', fs.existsSync(path.join(__dirname, '..', 'MODULE-ADMISSION.md')));
assert('README 链接准入清单', readme.indexOf('MODULE-ADMISSION.md') >= 0);

// ---- 4b) esc 转义统一（防三字符版 XSS 隐患回归） ----
// 所有视图/工具文件不得再自建仅转义 &<> 的残缺 esc；应委托 window.Util.esc 或使用完整五字符版。
console.log('\n[4b] esc 转义统一');
var jsDir = path.join(__dirname, '..', 'public', 'js');
var jsFiles = fs.readdirSync(jsDir).filter(function (f) { return /\.js$/.test(f) && f !== 'util.js'; });
var badEsc = [];
jsFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  // 残缺 esc：仅转义 &<>（缺 " 与 '），且未委托 Util
  if (/function\s+esc\s*\(\s*s\s*\)\s*\{\s*return\s+String\([^)]*\)\.replace\(\/&\/g,\s*'&amp;'\)\.replace\(\/<\//.test(src)) {
    badEsc.push(f);
  }
});
assert('无残缺 esc 定义（发现 ' + badEsc.length + ' 个：' + badEsc.join(',') + '）', badEsc.length === 0);
assert('共享 util.js 存在且导出完整 esc', fs.existsSync(path.join(jsDir, 'util.js')) &&
  /function\s+esc\s*\(s\)/.test(fs.readFileSync(path.join(jsDir, 'util.js'), 'utf8')) &&
  /'&quot;'/.test(fs.readFileSync(path.join(jsDir, 'util.js'), 'utf8')));

// ---- 4c) $ 选择器统一（防 getElementById 版重复定义回归） ----
// 除 util.js（唯一规范实现）外，任何文件不得再自建 `function $(id){return document.getElementById(id)}`；
// 视图应使用委托 `function $(id){return window.Util.$(id)}`。ui-kit/ui-lab 的 querySelector 版不在此限。
console.log('\n[4c] $ 选择器统一');
var badDollar = [];
jsFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  if (/function\s+\$\s*\(\s*id\s*\)\s*\{\s*return\s+document\.getElementById\s*\(\s*id\s*\)\s*;\s*\}/.test(src)) {
    badDollar.push(f);
  }
});
assert('无重复的 getElementById 版 $ 定义（发现 ' + badDollar.length + ' 个：' + badDollar.join(',') + '）', badDollar.length === 0);

// ---- 4d) cssVar 主题色板工具统一（防重复实现回归） ----
// 除 util.js（唯一规范实现）外，任何文件不得再自建 cssVar；应委托 window.Util.cssVar。
console.log('\n[4d] cssVar 主题色板工具统一');
var badCssVar = [];
jsFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  if (/function\s+cssVar\s*\(/.test(src) && src.indexOf('return window.Util.cssVar') < 0) {
    badCssVar.push(f);
  }
});
assert('无重复的 cssVar 实现（发现 ' + badCssVar.length + ' 个：' + badCssVar.join(',') + '）', badCssVar.length === 0);

// ---- 4e) 计算内核保持零依赖（UMD 独立可测，频带常量已在 acoustics.js 集中）----
// 内核模块不得 require 本地其它模块，保持其「纯函数、无依赖」的可移植契约。
console.log('\n[4e] 计算内核零依赖契约');
var coreFiles = fs.readdirSync(jsDir).filter(function (f) {
  return /^(acoustics|absorber|barrier|aural|audiolevel|insulation|room|perforation|rt60|stc|levels|dbcalc|env|leakage|hvacnoise|impact|speakerbox|muffler|iso3382|crossover|psycho|hearing|wave|smallroom|spectrum|vibeval)\.js$/.test(f);
});
var badReq = [];
coreFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  // 去除块注释与行注释，避免匹配到文档字符串中的 require 字样
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (/require\s*\(\s*['"]\.\//.test(code)) badReq.push(f);
});
assert('计算内核不 require 本地模块（发现 ' + badReq.length + ' 个：' + badReq.join(',') + '）', badReq.length === 0);

// ---- 5) #/all 目录页不嵌套在其他视图内 ----
console.log('\n[5] 目录页结构');
// view-all 开始标签之前 <section 与 </section> 必须平衡（否则被包进 view-home 等父视图，
// 父视图非激活 display:none 时目录页整棵子树不可见——P4 曾因此返工）
var head = html.slice(0, html.indexOf('<section class="view" id="view-all"'));
var secOpens = (head.match(/<section[\s>]/g) || []).length;
var secCloses = (head.match(/<\/section>/g) || []).length;
assert('view-all 不嵌套在其他视图内（section 平衡 ' + secOpens + '/' + secCloses + '）', secOpens === secCloses);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
