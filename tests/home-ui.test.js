/*
 * home-ui.test.js — 总览页 UI 结构守护测试 (node tests/home-ui.test.js)
 *
 * 目的：守护首页改版（v2.4.2）的几项结构约定，避免后续改动把它们弄丢：
 *   1) hero 宣传区块已移除（改由 banner + 检索栏承担）；
 *   2) 功能检索栏结构完整，且位于「功能模块」标题之前；
 *   3) banner 轮播结构与其 4 张图片引用完好；
 *   4) 检索脚本 / 轮播脚本按顺序在 nav.js 之前加载；
 *   5) 顶栏「友链」为下拉菜单，含博客 / 视频 / 音乐 / 导航 4 个站点；
 *   6) nav.js 已把顶栏下拉纳入统一管理；
 *   7) 检索关键词在模块文案中有实际命中（保证索引可用）。
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

// ---- 2) 检索栏结构 ----
console.log('\n[2] 功能检索栏结构');
assert('含 .home-search 容器', html.indexOf('class="home-search"') >= 0);
['hsInput', 'hsClear', 'hsCount'].forEach(function (id) {
  assert('含 #' + id, html.indexOf('id="' + id + '"') >= 0);
});
assert('检索框有 aria-label', /id="hsInput"[\s\S]{0,200}aria-label="检索功能模块"/.test(html));
var iSearch = home.indexOf('class="home-search"');
var iHead = home.indexOf('<h2>功能模块</h2>');
var iBanner = home.indexOf('class="hero-banner"');
assert('检索栏位于「功能模块」标题之前', iSearch >= 0 && iHead > iSearch);
assert('检索栏位于 banner 之前', iSearch >= 0 && iBanner > iSearch);

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
assert('总览卡片数 = 19 (实际 ' + cards.length + ')', cards.length === 19);
['混响', '隔声', '穿孔率', '声屏障', '消声器', '响度', 'Leq', '声压级', '减振', 'GIF', '尖锐度', '简正', '传递矩阵', '微穿孔'].forEach(function (kw) {
  var hit = cards.filter(function (c) { return c.text.indexOf(kw) >= 0; });
  assert('关键词「' + kw + '」命中 ' + hit.length + ' 个模块', hit.length >= 1);
});
assert('search.js 动态索引 .module-card', searchJs.indexOf(".querySelectorAll('.module-card')") >= 0);
assert('search.js 提供 Esc 清空', /key === 'Escape'/.test(searchJs));
assert('search.js 提供「/」聚焦', /key !== '\/'/.test(searchJs));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
