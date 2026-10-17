/*
 * home-ui.test.js — 总览页 UI 结构守护测试 (node tests/home-ui.test.js)
 *
 * 目的：守护首页改版（v2.4.2）的几项结构约定，避免后续改动把它们弄丢：
 *   1) hero 宣传区块已移除（改由 banner + 命令面板承担）；
 *   2) 顶栏不再保留独立检索栏，全局检索统一由命令面板（⌘K）承担；
 *   3) banner 轮播结构与其 4 张图片引用完好；
 *   4) 检索 / 轮播 / 统计脚本按顺序在 nav.js 之前加载；
 *   5) 顶栏「友链」为下拉菜单，含博客 / 视频 / 音乐 / 导航 4 个站点；
 *   6) nav.js 已把顶栏下拉纳入统一管理；
 *   7) 检索关键词在模块文案中有实际命中（保证命令面板索引可用）；
 *   8) 页脚访客统计（Vercount）与建站运营天数就位；
 *   9) 顶栏一级菜单恒定单行（nowrap + 溢出收纳进「更多」），
 *      「友链」不竖排，三级子计算器覆盖全部模块；
 *  10) 顶栏操作区顺序：图标组在左，友链 / 导出贴页面最右侧。
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
var uiKitJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-kit.js'), 'utf8');

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

// ---- 2) 顶栏检索已并入命令面板 ----
console.log('\n[2] 顶栏检索并入命令面板');
assert('已移除独立检索容器 .ts-wrap', html.indexOf('class="ts-wrap"') < 0);
['tsInput', 'tsClear', 'tsPanel', 'tsTrigger'].forEach(function (id) {
  assert('已移除 #' + id, html.indexOf('id="' + id + '"') < 0);
});
assert('已移除 js/search.js 引入', html.indexOf('js/search.js') < 0);
assert('检索脚本文件已删除', !fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'search.js')));
var iActions = html.indexOf('class="topbar-actions"');
var iCmdk = html.indexOf('id="cmdkBtn"');
var iHeaderEnd = html.indexOf('</header>');
assert('命令面板按钮位于顶栏操作区', iActions >= 0 && iCmdk > iActions && iCmdk < iHeaderEnd);
assert('命令面板按钮带 data-cmdk-open', /id="cmdkBtn"[\s\S]{0,120}data-cmdk-open/.test(html));
assert('首页不再保留旧检索栏 .home-search', html.indexOf('class="home-search"') < 0);
assert('样式表已清理 .ts- 规则', fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8').indexOf('.ts-wrap') < 0);

// ---- 3) banner 轮播结构 ----
console.log('\n[3] banner 轮播结构');
assert('含 #heroBanner', html.indexOf('id="heroBanner"') >= 0);
assert('含 #hbTrack / #hbDots / #hbPrev / #hbNext',
  ['hbTrack', 'hbDots', 'hbPrev', 'hbNext'].every(function (id) { return html.indexOf('id="' + id + '"') >= 0; }));
var imgs = (html.match(/src="img\/banner-[\w-]+\.webp"/g) || []);
assert('banner 引用 4 张 WebP 图片 (实际 ' + imgs.length + ')', imgs.length === 4);
imgs.forEach(function (s) {
  var f = s.slice(5, -1);
  assert('图片文件存在 ' + f, fs.existsSync(path.join(__dirname, '..', 'public', f)));
});
assert('不再保留 PNG 版本 banner 图', fs.readdirSync(path.join(__dirname, '..', 'public', 'img'))
  .filter(function (f) { return /^banner-.*\.png$/.test(f); }).length === 0);
assert('banner 图总体积 < 1 MB', fs.readdirSync(path.join(__dirname, '..', 'public', 'img'))
  .reduce(function (sum, f) { return sum + fs.statSync(path.join(__dirname, '..', 'public', 'img', f)).size; }, 0) < 1024 * 1024);

// ---- 4) 脚本加载顺序 ----
console.log('\n[4] 脚本加载顺序');
var iBannerJs = html.indexOf('js/banner.js');
var iNavJs = html.indexOf('js/nav.js');
var iUiKitJs = html.indexOf('js/ui-kit.js');
var iExportJs = html.indexOf('js/export.js');
assert('banner.js 在 nav.js 之前', iBannerJs > 0 && iBannerJs < iNavJs);
assert('ui-kit.js（命令面板）在 export.js 之后', iUiKitJs > iExportJs && iExportJs > 0);
assert('命令面板索引 .module-card', uiKitJs.indexOf(".module-card") >= 0);
assert('命令面板支持 ⌘K / Ctrl+K', /metaKey/.test(uiKitJs) && /ctrlKey/.test(uiKitJs));

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
assert('总览卡片数 = 61 (实际 ' + cards.length + ')', cards.length === 61);
['混响', '隔声', '穿孔率', '声屏障', '消声器', '响度', 'Leq', '声压级', '减振', 'GIF', '尖锐度', '简正', '传递矩阵', '微穿孔', '撞击声', '浮筑', '风管', '声功率', 'STIPA', '等值线', 'Thiele-Small', 'Qtc', 'Zobel', '线阵列', '栅瓣', '多普勒', '拍频', '声阻抗', 'dBFS', '2.83 V', '阻尼系数', 'NR 曲线', 'NC 曲线', '倍频程', 'QRD', '扩散体', '等响', '听阈', 'WHO', '临界带', 'ISO 3382', '明晰度', '中心时间', 'IACC', 'ITDG', '亥姆霍兹', 'FXLMS', '无人机', '波束', '吸声楔', '驻波', '回声测距', 'BPF', '孔洞', '缝隙', '门窗', 'GB 55038', 'L_EX', 'NIOSH', 'OSHA', '护听器', 'NRR', '脉冲', '双源', 'Minnaert', '气泡', '折射', '声影区', '指向性', '四极子', '公式与术语', '术语定义', '深链分享', '声级计', '最大保持', '扫频', '五级评级'].forEach(function (kw) {
  var hit = cards.filter(function (c) { return c.text.indexOf(kw) >= 0; });
  assert('关键词「' + kw + '」命中 ' + hit.length + ' 个模块', hit.length >= 1);
});
assert('ui-kit.js 动态索引 .module-card', uiKitJs.indexOf("'.module-card'") >= 0);
assert('命令面板提供 Esc 关闭', /Escape/.test(uiKitJs));
assert('命令面板记录最近使用', uiKitJs.indexOf('localStorage') >= 0);
assert('命令面板渲染悬浮面板 .uik-cmdk', uiKitJs.indexOf('uik-cmdk') >= 0);

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
assert('存在顶栏操作区分隔线 .topbar-sep', css.indexOf('.topbar-sep') >= 0);

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

// ---- 10) 顶栏操作区顺序：图标组在左，友链 / 导出贴最右侧 ----
console.log('\n[10] 顶栏操作区顺序');
var actionsStart = html.indexOf('<div class="topbar-actions">');
var actionsHtml = html.slice(actionsStart, html.indexOf('</header>', actionsStart));
var iCmdkBtn = actionsHtml.indexOf('id="cmdkBtn"');
var iShareBtn = actionsHtml.indexOf('id="shareBtn"');
var iThemeBtn = actionsHtml.indexOf('id="themeToggle"');
var iFriends = actionsHtml.indexOf('nav-menu-friends');
var iExport = actionsHtml.indexOf('id="exportMenu"');
assert('图标组顺序 ⌘K → 分享 → 主题',
  iCmdkBtn > 0 && iCmdkBtn < iShareBtn && iShareBtn < iThemeBtn);
assert('友链位于图标组之后', iFriends > iThemeBtn);
assert('导出位于友链之后（页面最右侧）', iExport > iFriends);
assert('导出之后无其它控件', actionsHtml.slice(iExport).indexOf('class="theme-toggle"') < 0);
assert('操作区右对齐 justify-self:end', /\.topbar-actions\s*\{[\s\S]*?justify-self:\s*end/.test(css));

// ---- 11) P1 结构修缮：模拟器归属 / 徽标区分 / 文案同步 ----
console.log('\n[11] P1 结构修缮');
var simGroupStart = home.indexOf('<div class="group-label">声学模拟器</div>');
var simGroupEnd = home.indexOf('<div class="group-label">', simGroupStart + 10);
var simGroupHtml = home.slice(simGroupStart, simGroupEnd);
var liveGroupStart = home.indexOf('<div class="group-label">现场实测</div>');
var liveGroupHtml = home.slice(liveGroupStart, home.indexOf('</section>', liveGroupStart));
['sim-sonar', 'sim-sea', 'sim-fourier', 'sim-ut'].forEach(function (r) {
  assert('「声学模拟器」分组含 ' + r + ' 卡片', simGroupHtml.indexOf('href="#/' + r + '"') >= 0);
  assert('「现场实测」分组不含 ' + r + ' 卡片', liveGroupHtml.indexOf('href="#/' + r + '"') < 0);
});
assert('不再使用零信息量「可用」徽标', html.indexOf('>可用</span>') < 0);
var demoTags = (html.match(/class="mc-tag demo">演示/g) || []).length;
var liveTags = (html.match(/class="mc-tag live">实测/g) || []).length;
assert('演示徽标 21 个：模拟与可听化 3 + 声学模拟器 18 (实际 ' + demoTags + ')', demoTags === 21);
assert('实测徽标 5 个：现场实测五件套 (实际 ' + liveTags + ')', liveTags === 5);
assert('使用说明分组名与导航一致（电声与听觉）',
  html.indexOf('电声与听觉 / 模拟与可听化 / 声学模拟器 / 现场实测') >= 0);
assert('使用说明不含旧分组名「心理与声品质」', html.indexOf('心理与声品质') < 0);
assert('测试计数文案为「56 个测试文件」', html.indexOf('共 56 个测试文件全部通过') >= 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
