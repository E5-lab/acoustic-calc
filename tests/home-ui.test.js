/*
 * home-ui.test.js — 总览页 UI 结构守护测试 (node tests/home-ui.test.js)
 *
 * 目的：守护首页改版（v2.4.2）的几项结构约定，避免后续改动把它们弄丢：
 *   1) hero 宣传区块已移除（改由 banner + 顶栏检索承担）；
 *   2) 顶栏功能检索结构完整，位于一级菜单右侧，悬浮结果面板就位；
 *   3) banner 轮播结构与其 4 张图片引用完好；
 *   4) 检索脚本 / 轮播脚本按顺序在 nav.js 之前加载；
 *   5) 顶栏「友链」为下拉菜单，含博客 / 视频 / 音乐 / 导航 4 个站点；
 *   6) nav.js 已把顶栏下拉纳入统一管理；
 *   7) 检索关键词在模块文案中有实际命中（保证索引可用）；
 *   8) 页脚访客统计（Vercount）与建站运营天数就位；
 *   9) 顶栏一级菜单恒定单行（nowrap + 溢出收纳进「更多」），
 *      「友链」不竖排，三级子计算器覆盖全部模块。
 */
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

function read() { return fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8'); }
var html = read();
var navJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'nav.js'), 'utf8');
var searchJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'search.js'), 'utf8');

var homeStart = html.indexOf('id="view-home"');
var homeEnd = html.indexOf('<!-- ========================= 背景噪声评价', homeStart);
if (homeEnd < 0) homeEnd = html.length;
var home = html.slice(homeStart, homeEnd);
assert('定位到首页总览区块', homeStart >= 0 && home.length > 500);

// ---- 1) hero 已移除 ----
console.log('\n[1] hero 宣传区块已移除');
assert('无 class="hero" 区块', html.indexOf('class="hero"') < 0);
assert('无 hero-title', html.indexOf('hero-title') < 0);
assert('无 hero-actions', html.indexOf('hero-actions') < 0);
assert('无 badge-row 标准徽标行', html.indexOf('badge-row') < 0);

// ---- 2) 顶栏检索结构 ----
console.log('\n[2] 顶栏功能检索结构');
assert('含顶栏检索容器 .ts-wrap', html.indexOf('class="ts-wrap"') >= 0);
['tsInput', 'tsClear', 'tsPanel', 'tsTrigger'].forEach(function (id) {
  assert('含 #' + id, html.indexOf('id="' + id + '"') >= 0);
});
assert('检索框有 aria-label', /id="tsInput"[\s\S]{0,200}aria-label="检索功能模块"/.test(html));
var iActions = html.indexOf('class="topbar-actions"');
var iTs = html.indexOf('class="ts-wrap"');
var iHeaderEnd = html.indexOf('</header>');
assert('检索栏位于顶栏操作区（一级菜单右侧）', iActions >= 0 && iTs > iActions && iTs < iHeaderEnd);
assert('首页不再保留旧检索栏 .home-search', html.indexOf('class="home-search"') < 0);

// ---- 3) banner 轮播结构 ----
console.log('\n[3] banner 轮播结构');
assert('含 #heroBanner', html.indexOf('id="heroBanner"') >= 0);
assert('含 #hbTrack / #hbDots / #hbPrev / #hbNext',
  ['hbTrack', 'hbDots', 'hbPrev', 'hbNext'].every(function (id) { return html.indexOf('id="' + id + '"') >= 0; }));
var imgs = (html.match(/src="img\/banner-[\w-]+\.png"/g) || []);
assert('banner 引用 4 张图片 (实际 ' + imgs.length + ')', imgs.length === 4);
imgs.forEach(function (s) {
  var f = s.slice(5, -1);
  assert('图片文件存在 ' + f, fs.existsSync(path.join(__dirname, '..', 'public', f)));
});

// ---- 4) 脚本加载顺序 ----
console.log('\n[4] 脚本加载顺序');
var iBannerJs = html.indexOf('js/banner.js');
var iSearchJs = html.indexOf('js/search.js');
var iNavJs = html.indexOf('js/nav.js');
assert('banner.js 在 nav.js 之前', iBannerJs > 0 && iBannerJs < iNavJs);
assert('search.js 在 nav.js 之前', iSearchJs > 0 && iSearchJs < iNavJs);
assert('search.js 在 banner.js 之后', iSearchJs > iBannerJs);

// ---- 5) 顶栏友链下拉 ----
console.log('\n[5] 顶栏友链下拉');
assert('含顶栏分组 .topbar-group', html.indexOf('class="nav-group topbar-group"') >= 0);
assert('含友链下拉菜单 .nav-menu-friends', html.indexOf('nav-menu-friends') >= 0);
var sites = [
  ['博客站', 'https://blog.124365.xyz'],
  ['视频站', 'https://v.124365.xyz'],
  ['音乐站', 'https://lx.124365.xyz'],
  ['导航站', 'https://nav.124365.xyz']
];
var friendsStart = html.indexOf('nav-menu-friends');
var friends = html.slice(friendsStart, html.indexOf('</div>', html.indexOf('</a>', friendsStart)));
sites.forEach(function (s) {
  var re = new RegExp('<a href="' + s[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>[\\s\\S]{0,120}?' + s[0]);
  assert('友链含「' + s[0] + '」→ ' + s[1], re.test(friends));
});
var extLinks = (friends.match(/<a href="https:\/\/[^"]+"[^>]*target="_blank"/g) || []);
assert('友链 4 项均新窗口打开 (实际 ' + extLinks.length + ')', extLinks.length === 4);

// ---- 6) nav.js 统一管理顶栏下拉 ----
console.log('\n[6] nav.js 顶栏下拉绑定');
assert('nav.js 绑定 .topbar-actions', navJs.indexOf(".querySelector('.topbar-actions')") >= 0);

// ---- 7) 检索关键词实际命中 ----
console.log('\n[7] 检索关键词命中');
var cards = [];
var cre = /<a class="module-card" href="#\/([\w-]+)">([\s\S]*?)<\/a>/g, cm;
while ((cm = cre.exec(home)) !== null) {
  cards.push({ route: cm[1], text: cm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') });
}
assert('总览卡片数 = 48 (实际 ' + cards.length + ')', cards.length === 48);
['混响', '隔声', '穿孔率', '声屏障', '消声器', '响度', 'Leq', '声压级', '减振', 'GIF', '尖锐度', '简正', '传递矩阵', '微穿孔', '撞击声', '浮筑', '风管', '声功率', 'STIPA', '等值线', 'Thiele-Small', 'Qtc', 'Zobel', '线阵列', '栅瓣', '多普勒', '拍频', '声阻抗', 'dBFS', '2.83 V', '阻尼系数', 'NR 曲线', 'NC 曲线', '倍频程', 'QRD', '扩散体', '等响', '听阈', 'WHO', '临界带', 'ISO 3382', '明晰度', '中心时间', 'IACC', 'ITDG', '亥姆霍兹', 'FXLMS', '无人机', '波束', '吸声楔', '驻波', '回声测距', 'BPF', '孔洞', '缝隙', '门窗', 'GB 55038', 'L_EX', 'NIOSH', 'OSHA', '护听器', 'NRR', '脉冲', '双源', 'Minnaert', '气泡', '折射', '声影区', '指向性', '四极子'].forEach(function (kw) {
  var hit = cards.filter(function (c) { return c.text.indexOf(kw) >= 0; });
  assert('关键词「' + kw + '」命中 ' + hit.length + ' 个模块', hit.length >= 1);
});
assert('search.js 动态索引 .module-card', searchJs.indexOf(".querySelectorAll('.module-card')") >= 0);
assert('search.js 提供 Esc 清空', /key === 'Escape'/.test(searchJs));
assert('search.js 提供「/」聚焦', /key !== '\/'/.test(searchJs));
assert('search.js 渲染悬浮结果面板', searchJs.indexOf('tsPanel') >= 0);
assert('search.js 路由切换后复位', searchJs.indexOf('hashchange') >= 0);
assert('search.js 检索时隐藏 banner', searchJs.indexOf('is-searching') >= 0);

// ---- 8) 页脚访客统计与建站天数 ----
console.log('\n[8] 页脚访客统计与建站天数');
assert('含页脚统计行 .footer-stats', html.indexOf('class="footer-stats"') >= 0);
['busuanzi_value_site_pv', 'busuanzi_value_site_uv', 'statDays'].forEach(function (id) {
  assert('含 #' + id, html.indexOf('id="' + id + '"') >= 0);
});
var statsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'site-stats.js'), 'utf8');
assert('site-stats.js 记录建站日 2026-07-13', /new Date\(2026,\s*6,\s*13\)/.test(statsJs));
assert('site-stats.js 含本机计数回退', statsJs.indexOf('localStorage') >= 0);
var iStatsJs = html.indexOf('js/site-stats.js');
assert('site-stats.js 在 nav.js 之前加载', iStatsJs > 0 && iStatsJs < iNavJs);
assert('异步加载 Vercount 计数脚本', /events\.vercount\.one\/js/.test(html));

// ---- 9) 顶栏导航单行与三级菜单 ----
console.log('\n[9] 顶栏导航单行与三级菜单');
var css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8');
assert('.mainnav 禁止换行 flex-wrap:nowrap', /\.mainnav\s*\{[\s\S]*?flex-wrap:\s*nowrap/.test(css));
assert('.nav-blog 禁止文字竖排 white-space:nowrap', /\.nav-blog\s*\{[\s\S]*?white-space:\s*nowrap/.test(css));
assert('顶栏栅格中间列可压缩 auto minmax(0,1fr) auto',
  /\.topbar-inner\s*\{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/.test(css));
assert('友链按钮不被压缩 flex:none', /\.nav-blog\s*\{[\s\S]*?flex:\s*none/.test(css));
assert('存在分栏 Mega 面板样式 .nav-menu-mega', css.indexOf('.nav-menu-mega') >= 0);
assert('存在三级子计算器样式 .nav-sub', css.indexOf('.nav-sub') >= 0);
assert('窄屏检索折叠断点提高到 1400px', /@media \(max-width: 1400px\)/.test(css));

assert('nav.js 提供三级菜单数据表 NAV_SUB', /var NAV_SUB = \{/.test(navJs));
assert('nav.js 动态创建「更多」收纳分组', navJs.indexOf("'nav-group nav-more'") >= 0);
assert('nav.js 含按可用宽度重排逻辑', navJs.indexOf('function relayout') >= 0);
assert('nav.js 用 ResizeObserver 监听容器宽度', navJs.indexOf('ResizeObserver') >= 0);
assert('收纳仅作用于 .mainnav（不影响友链）', navJs.indexOf("'.mainnav > .nav-group'") >= 0);

// 三级菜单必须覆盖一级/二级菜单中的全部模块路由
var subKeys = [];
var sk = /^\s{4}'?([a-z0-9-]+)'?:\s*\[/gm, sm;
while ((sm = sk.exec(navJs)) !== null) subKeys.push(sm[1]);
var navHtml = html.slice(html.indexOf('<nav class="mainnav"'), html.indexOf('</nav>'));
var navRoutes = [];
var nr = /<a href="#\/([\w-]+)" data-route="/g, nm;
while ((nm = nr.exec(navHtml)) !== null) navRoutes.push(nm[1]);
assert('一级/二级菜单含 ' + navRoutes.length + ' 个模块路由', navRoutes.length >= 20);
var noSub = navRoutes.filter(function (r) { return subKeys.indexOf(r) < 0; });
assert('每个模块都有三级子计算器条目 (缺失: ' + (noSub.join(',') || '无') + ')', noSub.length === 0);
var extraSub = subKeys.filter(function (k) { return navRoutes.indexOf(k) < 0; });
assert('三级菜单无孤儿条目 (多余: ' + (extraSub.join(',') || '无') + ')', extraSub.length === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
