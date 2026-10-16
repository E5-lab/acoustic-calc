/*
 * overview.test.js - 首页总览一致性守护测试 (node tests/overview.test.js)
 *
 * 目的：防止「新增模块后，首页总览忘记同步」的回归。
 * 本测试直接解析 public/index.html，保证：
 *   1) 每个路由（router.js 的 VIEWS，除 home 外）都有对应的 <section data-view="X">；
 *   2) 顶栏导航（.mainnav .nav-menu a[data-route]）覆盖全部路由；
 *   3) 首页总览（#view-home）内每个模块都有一张 <a class="module-card" href="#/X">；
 *   4) 首页总览的「使用说明」地址清单列出全部路由；
 *   5) 总览分组数与顶栏导航分组数一致；
 *   6) 「共 N 个分组、M 个模块」的提示数字与实际相符。
 *
 * 只要新增模块时同步了顶栏导航与首页总览，本测试即通过；
 * 若只加导航却漏掉首页，测试会明确指出缺哪个路由。
 */
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

var htmlPath = path.join(__dirname, '..', 'public', 'index.html');
var routerPath = path.join(__dirname, '..', 'public', 'js', 'router.js');
var html = fs.readFileSync(htmlPath, 'utf8');
var router = fs.readFileSync(routerPath, 'utf8');

// ---- 从 router.js 提取路由清单（VIEWS 的键），排除 home ----
var viewsBlock = router.match(/var VIEWS\s*=\s*\{([\s\S]*?)\};/);
assert('router.js 中可解析出 VIEWS', !!viewsBlock);
var routes = [];
if (viewsBlock) {
  var body = viewsBlock[1];
  var re = /'?([\w-]+)'?\s*:\s*'view-[\w-]+'/g, m;
  while ((m = re.exec(body)) !== null) routes.push(m[1]);
}
assert('VIEWS 路由数量 >= 10', routes.length >= 10);
var moduleRoutes = routes.filter(function (r) { return r !== 'home'; });

// ---- 提取首页总览区块（#view-home 到下一个顶级 view 之间的内容） ----
var homeStart = html.indexOf('id="view-home"');
var homeEnd = html.indexOf('<!-- ========================= 背景噪声评价', homeStart);
if (homeEnd < 0) homeEnd = html.length;
var home = html.slice(homeStart, homeEnd);
assert('定位到首页总览区块', homeStart >= 0 && home.length > 500);

// ---- 1) 每个路由都有对应视图 section ----
console.log('\n[1] 路由 → 视图 section');
moduleRoutes.forEach(function (r) {
  assert('存在 <section data-view="' + r + '">', html.indexOf('data-view="' + r + '"') >= 0);
});

// ---- 2) 顶栏导航覆盖全部路由 ----
console.log('\n[2] 顶栏导航覆盖全部路由');
var navStart = html.indexOf('<nav class="mainnav"');
var navEnd = html.indexOf('</nav>', navStart);
var nav = html.slice(navStart, navEnd);
moduleRoutes.forEach(function (r) {
  assert('顶栏导航含 data-route="' + r + '"', nav.indexOf('data-route="' + r + '"') >= 0);
});

// ---- 3) 首页总览 module-card 覆盖全部路由 ----
console.log('\n[3] 首页总览模块卡片覆盖全部路由');
var cardRe = /<a class="module-card" href="#\/([\w-]+)"/g, cm;
var cardRoutes = {};
while ((cm = cardRe.exec(home)) !== null) cardRoutes[cm[1]] = true;
moduleRoutes.forEach(function (r) {
  assert('总览含模块卡片 #/' + r, !!cardRoutes[r]);
});
// 反向：总览不应出现未知模块
Object.keys(cardRoutes).forEach(function (r) {
  assert('总览卡片 #/' + r + ' 是合法路由', routes.indexOf(r) >= 0);
});

// ---- 4) 使用说明地址清单覆盖全部路由 ----
console.log('\n[4] 使用说明地址清单覆盖全部路由');
var notesStart = home.indexOf('<h2>使用说明</h2>');
var notes = home.slice(notesStart);
moduleRoutes.forEach(function (r) {
  assert('使用说明含 <code>#/' + r + '</code>', notes.indexOf('<code>#/' + r + '</code>') >= 0);
});

// ---- 5) 分组数一致（顶栏 nav-group 数 === 首页 module-group 数） ----
console.log('\n[5] 分组数量一致');
function countAll(s, needle) {
  var n = 0, i = 0;
  while ((i = s.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
  return n;
}
var navGroups = countAll(nav, 'class="nav-group"');
var homeGroups = countAll(home, 'class="module-group"');
assert('顶栏 nav-group = ' + navGroups + ' 个', navGroups >= 1);
assert('首页 module-group = ' + homeGroups + ' 个', homeGroups >= 1);
assert('顶栏与首页分组数一致 (' + navGroups + ' == ' + homeGroups + ')', navGroups === homeGroups);

// ---- 6) 提示文案「共 N 个分组、M 个模块」与实际相符 ----
console.log('\n[6] 分组/模块计数文案');
var hintM = home.match(/共\s*(\d+)\s*个分组、\s*(\d+)\s*个模块/);
assert('含「共 N 个分组、M 个模块」文案', !!hintM);
if (hintM) {
  var hGroups = parseInt(hintM[1], 10), hMods = parseInt(hintM[2], 10);
  assert('文案分组数 ' + hGroups + ' == 实际 ' + homeGroups, hGroups === homeGroups);
  assert('文案模块数 ' + hMods + ' == 实际 ' + moduleRoutes.length, hMods === moduleRoutes.length);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
