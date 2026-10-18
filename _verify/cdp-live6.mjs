/*
 * cdp-test6.mjs — 顶栏二级菜单（分组下拉）与面包屑的浏览器端交互验证
 * 运行：node _verify/cdp-test6.mjs                （本地 http://127.0.0.1:8765）
 *      VB_BASE=https://jsq.124365.xyz node _verify/cdp-test6.mjs   （线上冒烟）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.VB_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.VB_PORT || 9340);
const BASE = process.env.VB_BASE || 'https://jsq.124365.xyz';
// 可覆盖环境变量：VB_EDGE=浏览器可执行文件路径  VB_PORT=CDP 调试端口  VB_BASE=被测站点地址

let passed = 0, failed = 0;
const fails = [];
function ok(name) { passed++; console.log('  PASS  ' + name); }
function bad(name, extra) { failed++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
function assert(name, cond, extra) { cond ? ok(name) : bad(name, extra); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function waitFor(fn, timeout = 15000, step = 150) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('等待超时');
    await sleep(step);
  }
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-edge-'));
const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + userDataDir,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--disable-extensions', '--window-size=1440,1000',
  'about:blank'
], { stdio: 'ignore' });

let ws = null;
let cdp = null;
const consoleErrors = [];

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
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常');
  }
  return r.result.value;
}

async function goto(hash) {
  await cdp.send('Page.navigate', { url: BASE + '/' + hash });
  await waitFor(async () => (await evaluate('return document.readyState')) === 'complete');
  await sleep(340);
}

try {
  // ---------- 启动浏览器 ----------
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
      consoleErrors.push('exception: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  });

  // ---------- A. 菜单结构 ----------
  console.log('A. 顶栏二级菜单结构');
  await goto('#/');

  const struct = await evaluate(`
    var nav = document.querySelector('.mainnav');
    var groups = Array.prototype.map.call(nav.querySelectorAll('.nav-group'), function (g) {
      var btn = g.querySelector('.nav-parent');
      var items = Array.prototype.map.call(g.querySelectorAll('.nav-menu a'), function (a) {
        return { route: a.getAttribute('data-route'), name: (a.querySelector('.nm-t')||{}).textContent.trim(), desc: (a.querySelector('small')||{}).textContent.trim() };
      });
      return { label: btn.textContent.trim(), items: items,
               expanded: btn.getAttribute('aria-expanded'), hasMenu: !!g.querySelector('.nav-menu') };
    });
    return {
      groups: groups,
      topLevel: nav.children.length,
      homeLink: !!nav.querySelector('a[data-route="home"]'),
      caret: nav.querySelectorAll('.nav-parent .nav-caret').length,
      allLinks: Array.prototype.map.call(nav.querySelectorAll('a'), function (a) { return a.getAttribute('data-route'); }),
      cards: Array.prototype.map.call(document.querySelectorAll('.module-card'), function (c) { return c.getAttribute('href'); }),
      labels: Array.prototype.map.call(document.querySelectorAll('.group-label'), function (g) { return g.textContent.trim(); })
    };
  `);

  assert('顶栏一级项 5 个（总览 + 4 分组）', struct.topLevel === 5, 'topLevel=' + struct.topLevel);
  assert('总览仍为一级直接链接', struct.homeLink === true);
  assert('导航链接总数 9（总览 + 8 模块）', struct.allLinks.length === 9, struct.allLinks.join(','));
  assert('分组名依次为 基础计算 / 材料与构件 / 房间声学 / 环境与振动',
    struct.groups.map((g) => g.label).join(',') === '基础计算,材料与构件,房间声学,环境与振动',
    struct.groups.map((g) => g.label).join(','));
  assert('每个分组各含 2 个二级模块', struct.groups.every((g) => g.items.length === 2),
    struct.groups.map((g) => g.label + ':' + g.items.length).join(' '));
  assert('每个分组都有下拉容器', struct.groups.every((g) => g.hasMenu));
  assert('每个分组标题带展开箭头', struct.caret === 4, 'caret=' + struct.caret);
  assert('默认 aria-expanded 均为 false', struct.groups.every((g) => g.expanded === 'false'));
  assert('二级模块覆盖全部 8 个路由且不重复',
    new Set(struct.groups.flatMap((g) => g.items.map((i) => i.route))).size === 8);
  assert('二级菜单条目均含名称与说明',
    struct.groups.every((g) => g.items.every((i) => i.name && i.desc)),
    JSON.stringify(struct.groups[0].items));
  assert('首页模块卡 8 张', struct.cards.length === 8, struct.cards.join(','));
  assert('首页分组标签与导航一致',
    struct.labels.join(',') === '基础计算,材料与构件,房间声学,环境与振动', struct.labels.join(','));
  assert('首页卡片路由与二级菜单一致',
    struct.cards.slice().sort().join(',') === struct.groups.flatMap((g) => g.items.map((i) => '#/' + i.route)).sort().join(','));

  // ---------- B. 展开 / 收起交互 ----------
  console.log('B. 下拉展开与收起');
  const closed = await evaluate(`
    return Array.prototype.map.call(document.querySelectorAll('.nav-group .nav-menu'), function (m) {
      var s = getComputedStyle(m);
      return s.visibility + '/' + s.opacity;
    });
  `);
  assert('默认下拉菜单均隐藏', closed.every((v) => v === 'hidden/0'), closed.join(' '));

  const openBase = await evaluate(`
    var g = document.querySelector('.nav-group');
    g.querySelector('.nav-parent').click();
    return new Promise(function (res) { setTimeout(function () {
      var s = getComputedStyle(g.querySelector('.nav-menu'));
      res({ open: g.classList.contains('open'), expanded: g.querySelector('.nav-parent').getAttribute('aria-expanded'),
            vis: s.visibility, op: parseFloat(s.opacity),
            active: g.querySelector('.nav-parent').classList.contains('active') });
    }, 260); });
  `);
  assert('点击分组标题后展开', openBase.open === true && openBase.expanded === 'true');
  assert('展开后菜单可见（visibility/opacity）', openBase.vis === 'visible' && openBase.op > 0.9, openBase.vis + '/' + openBase.op);
  assert('仅展开菜单时不算路由高亮', openBase.active === false);

  const second = await evaluate(`
    var gs = document.querySelectorAll('.nav-group');
    gs[2].querySelector('.nav-parent').click();
    return { first: gs[0].classList.contains('open'), third: gs[2].classList.contains('open'),
             openCount: document.querySelectorAll('.nav-group.open').length };
  `);
  assert('打开另一分组时前一个自动收起', second.first === false && second.third === true);
  assert('同时最多展开一个分组', second.openCount === 1, 'openCount=' + second.openCount);

  const blank = await evaluate(`
    document.body.click();
    return document.querySelectorAll('.nav-group.open').length;
  `);
  assert('点击空白处收起全部菜单', blank === 0, 'open=' + blank);

  const esc = await evaluate(`
    var g = document.querySelectorAll('.nav-group')[1];
    g.querySelector('.nav-parent').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { open: g.classList.contains('open'), expanded: g.querySelector('.nav-parent').getAttribute('aria-expanded') };
  `);
  assert('Esc 收起菜单并复位 aria-expanded', esc.open === false && esc.expanded === 'false');

  const viaMenu = await evaluate(`
    var g = document.querySelectorAll('.nav-group')[0];
    g.querySelector('.nav-parent').click();
    g.querySelector('.nav-menu a[data-route="noise"]').click();
    return true;
  `);
  assert('点击二级菜单链接可跳转', viaMenu === true);
  await sleep(420);
  const afterJump = await evaluate(`
    var g = document.querySelector('.nav-group.has-active');
    return { hash: location.hash, open: document.querySelectorAll('.nav-group.open').length,
             group: g ? g.querySelector('.nav-parent').textContent.trim() : null,
             active: document.querySelector('.mainnav a.active') ? document.querySelector('.mainnav a.active').getAttribute('data-route') : null };
  `);
  assert('路由切换为 #/noise', afterJump.hash === '#/noise', afterJump.hash);
  assert('跳转后菜单自动收起', afterJump.open === 0, 'open=' + afterJump.open);
  assert('所属分组的标题高亮为「基础计算」', afterJump.group === '基础计算', afterJump.group);

  // ---------- C. 路由高亮与面包屑 ----------
  console.log('C. 分组高亮与面包屑');
  const routes = [
    ['levels', '基础计算', '声压级叠加'],
    ['noise', '基础计算', '背景噪声评价'],
    ['perforation', '材料与构件', '穿孔率计算'],
    ['absorber', '材料与构件', '吸声材料阻抗'],
    ['rt60', '房间声学', '混响时间 RT60'],
    ['stc', '房间声学', '墙体隔声量 Rw / STC'],
    ['barrier', '环境与振动', '声屏障衰减'],
    ['vibration', '环境与振动', '弹簧减振']
  ];

  for (const [route, group, name] of routes) {
    await goto('#/' + route);
    const r = await evaluate(`
      var crumb = document.querySelector('#view-${route} .crumb');
      var g = document.querySelector('.nav-group.has-active');
      var hr = document.querySelectorAll('.nav-group.has-active').length;
      return { crumb: crumb ? crumb.textContent.replace(/\\s+/g, ' ').trim() : null,
               crumbRoute: crumb ? crumb.getAttribute('data-route') : null,
               groups: hr,
               group: g ? g.querySelector('.nav-parent').textContent.trim() : null,
               parentActive: g ? g.querySelector('.nav-parent').classList.contains('active') : false,
               linkActive: document.querySelector('.mainnav a.active') ? document.querySelector('.mainnav a.active').getAttribute('data-route') : null,
               viewActive: !!document.querySelector('#view-${route}.active'),
               title: document.title };
    `);
    const expect = group + '/' + name;
    assert('#' + route + ' 面包屑为「' + expect + '」', r.crumb === expect, r.crumb);
    assert('#' + route + ' 仅一个分组高亮且为「' + group + '」', r.groups === 1 && r.group === group, r.group + ' x' + r.groups);
    assert('#' + route + ' 分组标题带 active 状态', r.parentActive === true);
    assert('#' + route + ' 二级链接高亮正确', r.linkActive === route, r.linkActive);
    assert('#' + route + ' 视图可见且标题就绪', r.viewActive === true && /声学计算工具箱/.test(r.title));
  }
  await goto('#/');
  const home = await evaluate(`
    return { crumb: document.querySelectorAll('.crumb').length,
             groups: document.querySelectorAll('.nav-group.has-active').length,
             open: document.querySelectorAll('.nav-group.open').length,
             homeActive: document.querySelector('.mainnav a.active') ? document.querySelector('.mainnav a.active').getAttribute('data-route') : null,
             count: document.querySelectorAll('#view-home .module-card').length };
  `);
  assert('总览：无分组高亮、无展开菜单', home.groups === 0 && home.open === 0);
  assert('总览：一级「总览」高亮', home.homeActive === 'home', home.homeActive);
  assert('总览：面包屑只随模块页出现（8 个）', home.crumb === 8, 'crumb=' + home.crumb);
  assert('总览：模块卡 8 张', home.count === 8);

  // ---------- D. 移动端（窄视口）布局 ----------
  console.log('D. 窄视口下的菜单');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await goto('#/perforation');
  const mobile = await evaluate(`
    var g = document.querySelector('.nav-group:nth-child(3)');
    g.querySelector('.nav-parent').click();
    return new Promise(function (res) { setTimeout(function () {
      var m = g.querySelector('.nav-menu');
      var r = m.getBoundingClientRect();
      var s = getComputedStyle(m);
      var sr = g.querySelector('.nav-parent').getBoundingClientRect();
      res({ left: r.left, right: r.right, width: r.width, vis: s.visibility,
            vw: window.innerWidth, top: r.top, btnBottom: sr.bottom,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1 });
    }, 260); });
  `);
  assert('窄视口菜单仍可展开', mobile.vis === 'visible');
  assert('菜单不左溢出视口', mobile.left >= -1, 'left=' + mobile.left);
  assert('菜单不右溢出视口', mobile.right <= mobile.vw + 1, mobile.right + ' vs ' + mobile.vw);
  assert('菜单出现在标题下方', mobile.top >= mobile.btnBottom - 1, mobile.top + ' vs ' + mobile.btnBottom);
  assert('页面无横向滚动', mobile.overflow === false);
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  // ---------- E. 回归 ----------
  console.log('E. 回归检查');
  await goto('#/levels');
  const reg = await evaluate(`
    return {
      navs: document.querySelectorAll('.mainnav a').length,
      groups: document.querySelectorAll('.nav-group').length,
      crumbs: document.querySelectorAll('.crumb').length,
      levels: !!document.querySelector('#lvSrcList') && !!document.querySelector('#lvAdd'),
      appNav: typeof window.AppNav,
      router: typeof window.AppRouter
    };
  `);
  assert('导航链接未重复初始化（9）', reg.navs === 9, 'navs=' + reg.navs);
  assert('分组未重复初始化（4）', reg.groups === 4, 'groups=' + reg.groups);
  assert('面包屑未重复插入', reg.crumbs === 8, 'crumbs=' + reg.crumbs);
  assert('原有模块 DOM 正常', reg.levels === true);
  assert('AppNav / AppRouter 均可用', reg.appNav === 'object' && reg.router === 'object');
  assert('无控制台异常', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  if (failed) console.log('失败用例: ' + fails.join(' ; '));
} catch (e) {
  console.error('运行异常: ' + (e && e.stack ? e.stack : e));
  failed++;
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { proc.kill(); } catch (e) { /* ignore */ }
  await sleep(200);
  process.exit(failed ? 1 : 0);
}
