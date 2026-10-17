/*
 * topbar-v29.mjs — v2.9 顶栏改版验证（去掉独立检索栏 / 命令面板接管 / 友链·导出贴右）
 * 运行：先起本地服务（public 目录 8765），再 node _verify/topbar-v29.mjs
 *      VB_BASE=https://jsq.124365.xyz node _verify/topbar-v29.mjs   （线上冒烟）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9355;
const BASE = process.env.VB_BASE || 'http://127.0.0.1:8765';

let passed = 0, failed = 0;
const fails = [];
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; fails.push(name); console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url) { return (await fetch(url)).json(); }
async function waitFor(fn, timeout = 15000, step = 150) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('等待超时');
    await sleep(step);
  }
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v29-edge-'));
const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + userDataDir,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--disable-extensions', '--window-size=1440,1000',
  'about:blank'
], { stdio: 'ignore' });

let ws = null, cdp = null;
const errors = [];

function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
  });
}
function makeCdp() {
  let seq = 0;
  const pending = new Map();
  const handlers = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      return;
    }
    handlers.forEach((h) => h(m));
  });
  return {
    send(method, params = {}) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    },
    on(fn) { handlers.push(fn); }
  };
}
async function evaluate(code) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: '(function(){' + code + '})()',
    returnByValue: true,
    awaitPromise: true
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常');
  return r.result.value;
}
async function goto(hash) {
  await cdp.send('Page.navigate', { url: BASE + '/' + hash });
  await waitFor(async () => (await evaluate('return document.readyState')) === 'complete');
  await sleep(420);
}
async function shot(file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

try {
  await waitFor(() => httpJson(`http://127.0.0.1:${PORT}/json/version`).catch(() => null), 25000, 300);
  const list = await waitFor(async () => {
    const l = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
    const pages = l.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    return pages.length ? pages : null;
  }, 20000, 300);
  await connect(list[0].webSocketDebuggerUrl);
  cdp = makeCdp();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push('exception: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  });

  // ---------- A. 检索栏已移除 ----------
  console.log('A. 独立检索栏已移除');
  await goto('#/');
  const gone = await evaluate(`
    return {
      tsInput: !!document.getElementById('tsInput'),
      tsWrap: !!document.querySelector('.ts-wrap'),
      tsPanel: !!document.getElementById('tsPanel'),
      searchJs: !!document.querySelector('script[src*="search.js"]'),
      isSearching: !!document.querySelector('#view-home.is-searching'),
      homeSearch: !!document.querySelector('.home-search')
    };
  `);
  assert('无 #tsInput', gone.tsInput === false);
  assert('无 .ts-wrap 容器', gone.tsWrap === false);
  assert('无 #tsPanel 悬浮面板', gone.tsPanel === false);
  assert('未加载 search.js', gone.searchJs === false);
  assert('无 .home-search 旧检索栏', gone.homeSearch === false);

  // ---------- B. 操作区顺序与右贴边 ----------
  console.log('\nB. 顶栏操作区顺序与右贴边');
  const bar = await evaluate(`
    var acts = document.querySelector('.topbar-actions');
    var kids = Array.prototype.filter.call(acts.children, function (n) { return n.nodeType === 1; });
    var last = kids[kids.length - 1];
    var inner = document.querySelector('.topbar-inner');
    var cs = getComputedStyle(inner);
    var innerRight = inner.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    var r = last.getBoundingClientRect();
    return {
      seq: kids.map(function (n) {
        if (n.classList.contains('topbar-sep')) return 'sep';
        if (n.id === 'cmdkBtn') return 'cmdk';
        if (n.id === 'shareBtn') return 'share';
        if (n.id === 'themeToggle') return 'theme';
        if (n.id === 'exportMenu') return 'export';
        if (n.querySelector && n.querySelector('.nav-blog')) return 'friends';
        return n.className;
      }),
      lastRight: Math.round(r.right),
      innerRight: Math.round(innerRight),
      gapPx: Math.round(innerRight - r.right),
      lastText: last.textContent.replace(/\\s+/g, ' ').trim()
    };
  `);
  assert('操作区顺序 = 命令面板/分享/主题/分隔线/友链/导出',
    bar.seq.join(',') === 'cmdk,share,theme,sep,friends,export', bar.seq.join(','));
  assert('最右控件是「导出」', bar.lastText.indexOf('导出') === 0, bar.lastText);
  assert('导出右边缘贴齐内容区右边界（误差 ≤ 2px）', Math.abs(bar.gapPx) <= 2, bar.gapPx);

  const friendsBox = await evaluate(`
    var g = document.querySelector('.topbar-actions .nav-blog').closest('.nav-group');
    var r = g.getBoundingClientRect();
    var b = document.querySelector('#exportMenu').getBoundingClientRect();
    return { friendsRight: Math.round(r.right), exportLeft: Math.round(b.left) };
  `);
  assert('友链紧邻导出左侧', friendsBox.friendsRight <= friendsBox.exportLeft + 1,
    friendsBox);

  // ---------- C. 命令面板接管检索 ----------
  console.log('\nC. 命令面板接管全局检索');
  await evaluate(`document.getElementById('cmdkBtn').click(); return 1;`);
  await sleep(320);
  const open1 = await evaluate(`
    var w = document.querySelector('.uik-cmdk');
    var opts = w ? w.querySelectorAll('[role="option"]') : [];
    return {
      visible: !!w && !w.hasAttribute('hidden'),
      opts: opts.length,
      focusIn: !!w && w.contains(document.activeElement),
      role: w ? w.querySelector('.uik-cmdk-input').getAttribute('role') : '',
      expanded: w ? w.querySelector('.uik-cmdk-input').getAttribute('aria-expanded') : ''
    };
  `);
  assert('点击 ⌘K 按钮打开面板', open1.visible === true);
  assert('面板列出全部模块（≥ 58 项）', open1.opts >= 58, open1.opts);
  assert('焦点进入面板输入框', open1.focusIn === true);
  assert('输入框 role=combobox 且 aria-expanded=true', open1.role === 'combobox' && open1.expanded === 'true');

  const search = await evaluate(`
    var input = document.querySelector('.uik-cmdk-input');
    input.value = '微穿孔';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise(function (res) {
      setTimeout(function () {
        var opts = document.querySelectorAll('.uik-cmdk [role="option"]');
        res({
          n: opts.length,
          first: opts.length ? opts[0].textContent.replace(/\\s+/g, ' ').trim().slice(0, 40) : '',
          marks: document.querySelectorAll('.uik-cmdk mark').length,
          active: !!document.querySelector('.uik-cmdk [aria-selected="true"]')
        });
      }, 220);
    });
  `);
  assert('搜索「微穿孔」有命中', search.n >= 1, search.n);
  assert('命中关键词高亮', search.marks >= 1, search.marks);
  assert('存在 aria-selected 活动项', search.active === true);

  // Enter 跳转
  const nav = await evaluate(`
    var input = document.querySelector('.uik-cmdk-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return new Promise(function (res) {
      setTimeout(function () { res({ hash: location.hash, closed: !document.querySelector('.uik-cmdk') || document.querySelector('.uik-cmdk').hasAttribute('hidden') }); }, 400);
    });
  `);
  assert('回车跳转到对应模块', nav.hash.indexOf('#/') === 0 && nav.hash.length > 2, nav.hash);
  assert('跳转后面板关闭', nav.closed === true);

  // Ctrl+K 开关
  const kb = await evaluate(`
    function k() { return document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); }
    k();
    return new Promise(function (res) {
      setTimeout(function () {
        var w = document.querySelector('.uik-cmdk');
        var a = !!w && !w.hasAttribute('hidden');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        setTimeout(function () {
          var w2 = document.querySelector('.uik-cmdk');
          res({ opened: a, closed: !!w2 && w2.hasAttribute('hidden') });
        }, 300);
      }, 320);
    });
  `);
  assert('Ctrl+K 打开面板', kb.opened === true);
  assert('Esc 关闭面板', kb.closed === true);

  // 搜索框不存在时旧快捷键 / 不应报错
  const slash = await evaluate(`
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    return { tsInput: !!document.getElementById('tsInput'), active: document.activeElement.tagName };
  `);
  assert('「/」不再聚焦已移除的检索框', slash.tsInput === false);

  // ---------- D. 桌面布局无溢出 ----------
  console.log('\nD. 布局与溢出');
  await goto('#/');
  const desk = await evaluate(`
    return {
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navOneLine: Math.round(document.querySelector('.mainnav').getBoundingClientRect().height) < 60,
      moreGroup: !!document.querySelector('.nav-more'),
      actionsVisible: Array.prototype.every.call(
        document.querySelectorAll('.topbar-actions > *'),
        function (n) { var r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    };
  `);
  assert('桌面无横向溢出', desk.docOverflow === 0, desk.docOverflow);
  assert('一级菜单仍单行', desk.navOneLine === true);
  assert('操作区控件均可见', desk.actionsVisible === true);
  await shot('_verify/shot-v29-desktop.png');

  // 打印样式不再引用已删除的选择器
  const printCss = await evaluate(`
    if (window.AppExport && AppExport.ensurePrintStyle) AppExport.ensurePrintStyle();
    var st = document.getElementById('appExportPrintStyle');
    return st ? st.textContent.indexOf('.ts-wrap') : -1;
  `);
  assert('打印样式已清理 .ts-wrap', printCss === -1, printCss);

  // ---------- E. 窄屏 ----------
  console.log('\nE. 窄屏 390px');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const mob = await evaluate(`
    var acts = document.querySelector('.topbar-actions');
    var kids = Array.prototype.filter.call(acts.children, function (n) { return n.nodeType === 1; });
    var centers = kids.map(function (n) {
      var r = n.getBoundingClientRect();
      return Math.round((r.top + r.bottom) / 2);
    });
    var last = kids[kids.length - 1].getBoundingClientRect();
    var first = kids[0].getBoundingClientRect();
    var inner = document.querySelector('.topbar-inner');
    var cs = getComputedStyle(inner);
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      centerSpread: Math.max.apply(null, centers) - Math.min.apply(null, centers),
      width: Math.round(last.right - first.left),
      avail: Math.round(inner.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      gap: Math.round(inner.getBoundingClientRect().right - parseFloat(cs.paddingRight) - last.right),
      btn: Math.round(last.width),
      labelsHidden: getComputedStyle(document.querySelector('#exportMenu > .nav-parent > span')).display === 'none'
    };
  `);
  assert('390px 无横向溢出', mob.overflow === 0, mob.overflow);
  assert('操作区所有控件垂直居中对齐（偏差 ≤ 4px）', mob.centerSpread <= 4, mob.centerSpread);
  assert('操作区总宽不超过内容区 (' + mob.width + ' ≤ ' + mob.avail + ')', mob.width <= mob.avail, mob);
  assert('导出仍贴右边界（误差 ≤ 2px）', Math.abs(mob.gap) <= 2, mob.gap);
  assert('窄屏导出收成 36px 图标按钮', mob.btn === 36, mob.btn);
  assert('窄屏隐藏「导出」文字', mob.labelsHidden === true);
  await shot('_verify/shot-v29-mobile.png');

  // 移动端面板可用
  await evaluate(`document.getElementById('cmdkBtn').click(); return 1;`);
  await sleep(320);
  const mopen = await evaluate(`
    var w = document.querySelector('.uik-cmdk');
    var p = w && w.querySelector('.uik-cmdk-panel');
    var r = p ? p.getBoundingClientRect() : null;
    return { visible: !!w && !w.hasAttribute('hidden'), w: r ? Math.round(r.width) : 0, left: r ? Math.round(r.left) : -1 };
  `);
  assert('移动端命令面板可打开', mopen.visible === true);
  assert('移动端面板不超出视口', mopen.left >= 0 && mopen.left + mopen.w <= 390, mopen);

  // ---------- F. 控制台 ----------
  console.log('\nF. 控制台');
  const real = errors.filter((e) => !/vercount|ERR_FAILED|favicon|sw\.js/i.test(e));
  assert('无脚本异常 / 控制台错误', real.length === 0, real);

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) console.log('失败项：\n - ' + fails.join('\n - '));
} catch (e) {
  console.log('\n运行异常: ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (_) {}
  try { proc.kill(); } catch (_) {}
}
