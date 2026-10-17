/*
 * ui-kit.test.js — 复杂 UI 组件与交互层守护测试 (node tests/ui-kit.test.js)
 *
 * 目的：给新增的 UI Kit 建立结构约束，避免后续重构把关键能力弄丢：
 *   1) 资源接入：ui-kit.css / ui-kit.js 在 index.html 中的加载顺序；
 *   2) 命令面板：⌘K、模糊评分、最近使用、跨页索引、ARIA 结构；
 *   3) 反馈与动效：Toast 队列、Tooltip、涟漪、3D 聚光、数字滚动、阅读进度；
 *   4) 实验室：9 个组件演示区、画布、表格、浮层的结构与脚本能力；
 *   5) 主题：View Transitions 圆形揭示与不支持时的降级；
 *   6) 无障碍与降级：reduced-motion、焦点管理、aria-sort / role 约定；
 *   7) 移动端：一级菜单撑满整行以启用「更多」收纳，避免横向溢出。
 *
 * 只做静态结构检查，不依赖浏览器；交互行为由 _verify / 手工验证覆盖。
 */
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(__dirname, '..', rel));
}
function countAll(s, needle) {
  var n = 0, i = 0;
  while ((i = s.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
  return n;
}

var html = read('public/index.html');
var css = read('public/css/ui-kit.css');
var kit = read('public/js/ui-kit.js');
var labHtml = read('public/ui-lab.html');
var labJs = read('public/js/ui-lab.js');
var theme = read('public/js/theme.js');
var sw = read('public/sw.js');
var app = read('public/js/app.js');

// ---- 1) 资源与接入 ----
console.log('\n[1] 资源与接入');
assert('存在 public/css/ui-kit.css', exists('public/css/ui-kit.css'));
assert('存在 public/js/ui-kit.js', exists('public/js/ui-kit.js'));
assert('存在 public/ui-lab.html', exists('public/ui-lab.html'));
assert('存在 public/js/ui-lab.js', exists('public/js/ui-lab.js'));
var iStyles = html.indexOf('css/styles.css');
var iKitCss = html.indexOf('css/ui-kit.css');
assert('ui-kit.css 在 styles.css 之后加载', iStyles > 0 && iKitCss > iStyles);
var iExport = html.indexOf('js/export.js');
var iKitJs = html.indexOf('js/ui-kit.js');
var iBodyEnd = html.indexOf('</body>');
assert('ui-kit.js 在 export.js 之后加载', iExport > 0 && iKitJs > iExport);
assert('ui-kit.js 在 </body> 之前', iKitJs > 0 && iKitJs < iBodyEnd);
assert('顶栏含命令面板入口 #cmdkBtn', html.indexOf('id="cmdkBtn"') >= 0);
assert('命令面板入口带 data-cmdk-open', /id="cmdkBtn"[\s\S]{0,160}data-cmdk-open/.test(html));
assert('命令面板入口有 aria-label', /id="cmdkBtn"[\s\S]{0,200}aria-label="打开命令面板"/.test(html));
assert('页脚提供实验室入口', html.indexOf('href="ui-lab.html"') >= 0);
assert('首页未引入外部 UI 框架', !/cdn\.|unpkg|jsdelivr/i.test(html));

// ---- 2) 命令面板 ----
console.log('\n[2] 命令面板');
assert('暴露 window.UIK', kit.indexOf('window.UIK = {') >= 0);
assert('提供 UIK.toast', kit.indexOf('toast: toast') >= 0);
assert('提供 UIK.palette', kit.indexOf('palette: {') >= 0);
assert('支持 Ctrl / Cmd + K', /metaKey \|\| e\.ctrlKey/.test(kit) && /'k'/.test(kit));
assert('含模糊评分函数 scoreItem', kit.indexOf('function scoreItem') >= 0);
assert('含标题/子标题高亮函数 highlight', kit.indexOf('function highlight') >= 0);
assert('最近使用写入 localStorage', kit.indexOf("'acoustic-cmdk-recent'") >= 0);
assert('独立页面从 index.html 解析模块索引', kit.indexOf("fetch('index.html')") >= 0);
assert('跨页跳转兼容无 AppRouter 场景', kit.indexOf("location.href = 'index.html#/'") >= 0);
assert('面板使用 role="dialog"', kit.indexOf('role="dialog"') >= 0);
assert('结果列表使用 role="listbox"', kit.indexOf('role="listbox"') >= 0);
assert('结果项使用 role="option"', kit.indexOf('role="option"') >= 0);
assert('输入框使用 aria-activedescendant', kit.indexOf('aria-activedescendant') >= 0);
assert('支持 Esc 关闭', kit.indexOf("e.key === 'Escape'") >= 0);
assert('含空结果状态', kit.indexOf('uik-cmd-empty') >= 0);

// ---- 3) 反馈与微交互 ----
console.log('\n[3] 反馈与微交互');
assert('Toast 容器使用 aria-live', /uik-toasts[\s\S]{0,200}aria-live/.test(kit));
assert('Toast 使用 role="status"', kit.indexOf("setAttribute('role', 'status')") >= 0);
assert('Toast 最多同时 4 条', kit.indexOf('all.length > 4') >= 0);
assert('Toast 悬停暂停', kit.indexOf("addEventListener('mouseenter', pause)") >= 0);
assert('Tooltip 读取 data-tip', kit.indexOf("getAttribute('data-tip')") >= 0);
assert('Tooltip 自动上下翻转', kit.indexOf("pos === 'top'") >= 0);
assert('按钮涟漪使用 pointerdown', /pointerdown[\s\S]{0,600}uik-ripple/.test(kit));
assert('卡片 3D 倾斜写入 --uik-rx', kit.indexOf("'--uik-rx'") >= 0);
assert('数字滚动使用 MutationObserver', kit.indexOf('new MutationObserver') >= 0);
assert('数字滚动覆盖结果类名', kit.indexOf('.hero-rate') >= 0 && kit.indexOf('.kv .v') >= 0);
assert('含滚动阅读进度条', kit.indexOf('uik-progress') >= 0);
assert('含滚动揭示 IntersectionObserver', kit.indexOf('IntersectionObserver') >= 0);
assert('桥接 AppShare.toast', kit.indexOf('AppShare.toast = function') >= 0);

// ---- 4) 实验室组件 ----
console.log('\n[4] 实验室组件');
var secIds = ['cmdk', 'segmented', 'slider', 'tabs', 'overlay', 'compare', 'spectrum', 'table', 'motion'];
secIds.forEach(function (id) {
  assert('含演示区 #' + id, labHtml.indexOf('id="' + id + '"') >= 0);
});
assert('含分段控件', labHtml.indexOf('class="uik-seg"') >= 0);
assert('含开关 role="switch"', labHtml.indexOf('role="switch"') >= 0);
assert('含原生 range 滑块', labHtml.indexOf('type="range"') >= 0);
assert('含标签页 role="tab"', labHtml.indexOf('role="tab"') >= 0);
assert('含手风琴 aria-expanded', labHtml.indexOf('aria-expanded="true"') >= 0);
assert('含模态框 role="dialog"', labHtml.indexOf('aria-modal="true"') >= 0);
assert('含侧边抽屉', labHtml.indexOf('class="uik-drawer"') >= 0);
assert('含对比滑块 role="slider"', labHtml.indexOf('role="slider"') >= 0);
assert('含频谱编辑器画布 #specCanvas', labHtml.indexOf('id="specCanvas"') >= 0);
assert('频谱画布可聚焦', /id="specCanvas"[\s\S]{0,200}tabindex="0"/.test(labHtml));
assert('含可排序表格 #labTable', labHtml.indexOf('id="labTable"') >= 0);
assert('表头含 aria-sort', labHtml.indexOf('aria-sort="none"') >= 0);
assert('含骨架屏', labHtml.indexOf('uik-skel') >= 0);
assert('含环形进度 SVG', labHtml.indexOf('stroke-dasharray') >= 0);
assert('含 Toast 触发按钮', labHtml.indexOf('data-toast="ok"') >= 0);
assert('实验室脚本实现焦点循环', labJs.indexOf('function focusables') >= 0 && labJs.indexOf("e.key !== 'Tab'") >= 0);
assert('实验室脚本实现 A 计权', labJs.indexOf('function aWeight') >= 0);
assert('频谱编辑器支持键盘方向键', labJs.indexOf("e.key === 'ArrowLeft'") >= 0);
assert('表格支持升降序切换', labJs.indexOf('sort.dir = -sort.dir') >= 0);
assert('画布按 devicePixelRatio 缩放', labJs.indexOf('devicePixelRatio') >= 0);
assert('画布随主题变化重绘', labJs.indexOf("'acousticthemechange'") >= 0);

// ---- 5) 主题揭示 ----
console.log('\n[5] 主题圆形揭示');
assert('theme.js 使用 startViewTransition', theme.indexOf('document.startViewTransition') >= 0);
assert('不支持时同步降级', theme.indexOf('apply(next)') >= 0);
assert('计算圆形半径', theme.indexOf('Math.hypot') >= 0);
assert('写入 --uik-theme-x / y / r', theme.indexOf("'--uik-theme-x'") >= 0);
assert('CSS 含 view-transition-new', css.indexOf('::view-transition-new(root)') >= 0);
assert('CSS 含 uik-theme-reveal 关键帧', css.indexOf('@keyframes uik-theme-reveal') >= 0);
assert('尊重 prefers-reduced-motion', theme.indexOf('prefers-reduced-motion') >= 0);
assert('切换后广播 acousticthemechange', theme.indexOf("'acousticthemechange'") >= 0);

// ---- 6) 样式与无障碍 ----
console.log('\n[6] 样式与无障碍');
['uik-cmdk', 'uik-toast', 'uik-tip', 'uik-progress', 'uik-reveal', 'uik-tilt', 'uik-ripple',
 'uik-seg', 'uik-switch', 'uik-range', 'uik-tabs', 'uik-acc', 'uik-modal', 'uik-drawer',
 'uik-compare', 'uik-table', 'uik-skel', 'uik-ring', 'uik-spec'].forEach(function (cls) {
  assert('CSS 含 .' + cls, css.indexOf('.' + cls) >= 0);
});
assert('CSS 含 reduced-motion 降级块', css.indexOf('@media (prefers-reduced-motion: reduce)') >= 0);
assert('reduced-motion 下关闭 Toast 动画', /prefers-reduced-motion[\s\S]{0,700}\.uik-toast/.test(css));
assert('CSS 含暗色遮罩变量', css.indexOf('--uik-overlay') >= 0);
assert('浮层锁定页面滚动', css.indexOf('body.uik-lock') >= 0);
assert('窄屏一级菜单撑满整行', /@media \(max-width: 900px\)[\s\S]{0,220}\.mainnav \{ width: 100%/.test(css));
assert('窄屏收起态下拉不参与布局', css.indexOf('.mainnav .nav-menu { display: none; }') >= 0);
assert('窄屏友链/导出收成图标按钮', css.indexOf('#exportMenu > .nav-parent > span') >= 0);
assert('窄屏轮播箭头移至右上角', /max-width: 640px[\s\S]{0,400}\.hero-banner \.hb-arrow[\s\S]{0,200}top: 10px/.test(css));
assert('app.js 复制失败改用 UIK 提示', app.indexOf('UIK.error') >= 0);

// ---- 7) PWA 缓存 ----
console.log('\n[7] PWA 缓存');
assert('sw.js 预缓存 ui-kit.css', sw.indexOf("'./css/ui-kit.css'") >= 0);
assert('sw.js 预缓存 ui-kit.js', sw.indexOf("'./js/ui-kit.js'") >= 0);
assert('sw.js 已升级缓存版本', sw.indexOf("acoustic-calc-v1.0.1") < 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
