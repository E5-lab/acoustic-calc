/*
 * mobile.test.js — 移动端适配守护（node tests/mobile.test.js）
 *
 * 目的：手机上「像看电脑网页版、要不停放大缩小」的根因有三类，本文件把对应的
 * 修复固化成断言，避免后续改版又把它们弄丢：
 *   1) viewport 声明正确（width=device-width），否则整页按 980px 缩放；
 *   2) 表单控件在窄屏 ≥ 16px —— iOS Safari 对 font-size < 16px 的控件会在聚焦时
 *      强制放大整个页面，这是「用一会儿就要缩小一次」最主要的原因；
 *   3) 宽表格自己横向滚动，不把整页撑宽（否则整页左右晃）；
 *   4) 触控目标 ≥ 44px，轮播圆点命中区放大；
 *   5) 常驻悬浮入口（.uik-fab）让命令面板在手机上「随时调用」，
 *      并在填表时自动淡出、打开面板时隐藏。
 */
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }
var html = read('public/index.html');
var css = read('public/css/styles.css');
var uikCss = read('public/css/ui-kit.css');
var uikJs = read('public/js/ui-kit.js');

// 取出移动端适配区块，后续断言只在这段里找，避免误命中桌面规则
var mStart = css.indexOf('移动端适配（v2.12）');
var mobile = mStart >= 0 ? css.slice(mStart) : '';

console.log('\n[1] viewport 与缩放');
assert('viewport 为 width=device-width, initial-scale=1', /<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/.test(html));
assert('含 -webkit-text-size-adjust:100%（禁止字号被放大）', /-webkit-text-size-adjust:\s*100%/.test(css));

console.log('\n[2] 表单 16px：关掉 iOS 自动缩放');
assert('存在移动端适配区块', mStart >= 0);
assert('窄屏输入控件字号 16px', /input,\s*select,\s*textarea[\s\S]{0,400}font-size:\s*16px\s*!important/.test(mobile));
assert('覆盖分段输入框等自定义类', /\.text-input,\s*\.seg-in,\s*\.src-name/.test(mobile));
assert('输入控件最小高度 44px', /min-height:\s*44px/.test(mobile));

console.log('\n[3] 宽表格不撑破页面');
assert('表格 display:block + overflow-x:auto', /\.detail-table,[\s\S]{0,400}overflow-x:\s*auto/.test(mobile));
assert('表格 min-width 归零（覆盖 .detail-table.wide 的 420px）', /min-width:\s*0/.test(mobile));
assert('下拉框限宽 max-width:100%', /select,\s*select\.btn,\s*\.sample-wrap\s*\{\s*max-width:\s*100%/.test(mobile));

console.log('\n[4] 触控目标');
assert('按钮最小高度 44px', /\.btn,\s*button\.btn,\s*\.mode-btn,\s*\.seg-btn[\s\S]{0,200}min-height:\s*44px/.test(mobile));
assert('轮播圆点命中区用 ::after 扩大', /\.hero-banner \.hb-dot::after/.test(mobile));
assert('页脚为悬浮按钮留白', /\.site-footer\s*\{\s*padding-bottom:\s*calc\(88px/.test(mobile));

console.log('\n[5] 悬浮入口：随时调用命令面板');
assert('ui-kit.css 定义 .uik-fab', uikCss.indexOf('.uik-fab {') >= 0);
assert('悬浮按钮仅窄屏显示', /@media \(max-width: 640px\)\s*\{\s*\.uik-fab \{ display: grid; \}/.test(uikCss));
assert('[hidden] 时强制隐藏', uikCss.indexOf('.uik-fab[hidden] { display: none !important; }') >= 0);
assert('填表时淡出规则存在', uikCss.indexOf('body.uik-fab-dim .uik-fab') >= 0);
assert('ui-kit.js 创建 .uik-fab', uikJs.indexOf("btn.className = 'uik-fab'") >= 0);
assert('悬浮按钮带 data-cmdk-open', uikJs.indexOf("btn.setAttribute('data-cmdk-open', '')") >= 0);
assert('打开面板时隐藏悬浮按钮', uikJs.indexOf('palette.fab.hidden = true') >= 0);
assert('关闭面板时恢复悬浮按钮', uikJs.indexOf('palette.fab.hidden = false') >= 0);
assert('聚焦输入框时淡出（focusin / focusout）', uikJs.indexOf("addEventListener('focusin'") >= 0 && uikJs.indexOf("addEventListener('focusout'") >= 0);
assert('无障碍标签', uikJs.indexOf("btn.setAttribute('aria-label'") >= 0);

console.log('\n[6] 轮播箭头触控目标');
assert('窄屏箭头放大到 40px', /\.hero-banner \.hb-arrow \{[\s\S]{0,120}width: 40px/.test(uikCss));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
