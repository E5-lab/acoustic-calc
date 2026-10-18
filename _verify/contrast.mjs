/*
 * contrast.mjs — 配色对比度审查 + 日间/夜间截图
 * 用 WCAG 相对亮度公式实测页面上真实渲染的文字对比度，列出低于 AA(4.5:1) 的项。
 * 运行：node _verify/contrast.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.VB_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.VB_PORT || 9350);
const BASE = process.env.VB_BASE || 'http://127.0.0.1:8765';
// 可覆盖环境变量：VB_EDGE=浏览器可执行文件路径  VB_PORT=CDP 调试端口  VB_BASE=被测站点地址
const OUT = path.resolve('_verify/shots-theme');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-edge-'));
const proc = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDataDir,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1200',
  'about:blank'
], { stdio: 'ignore' });

let ws, cdp;
const httpJson = async (u) => (await fetch(u)).json();
async function waitFor(fn, timeout = 25000, step = 300) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('超时');
    await sleep(step);
  }
}

await waitFor(() => httpJson(`http://127.0.0.1:${PORT}/json/version`).catch(() => null));
const list = await waitFor(async () => {
  const l = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
  return l.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl).length ? l : null;
});
await new Promise((res, rej) => {
  ws = new WebSocket(list.filter((t) => t.type === 'page')[0].webSocketDebuggerUrl);
  ws.addEventListener('open', res);
  ws.addEventListener('error', () => rej(new Error('ws 失败')));
});
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.res(m.result); }
});
cdp = {
  send(method, params = {}) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => pending.set(id, { res }));
  }
};
const evaluate = async (code) => {
  const r = await cdp.send('Runtime.evaluate', {
    expression: '(function(){' + code + '})()', returnByValue: true, awaitPromise: true
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval 异常');
  return r.result && r.result.value;
};

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

// 页面内执行的对比度审计（WCAG 2.1）
const AUDIT = `
  function lum(rgb) {
    var c = rgb.map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function parse(s) {
    var m = s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  }
  function bgOf(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.85) return c.rgb;
      n = n.parentElement;
    }
    return [255, 255, 255];
  }
  function ratio(fg, bg) {
    var a = lum(fg), b = lum(bg);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  var results = [];
  var nodes = document.querySelectorAll('#view-home *, .topbar *, .site-footer *');
  Array.prototype.forEach.call(nodes, function (el) {
    if (!el.childNodes.length) return;
    var hasText = Array.prototype.some.call(el.childNodes, function (n) {
      return n.nodeType === 3 && n.textContent.trim().length > 1;
    });
    if (!hasText) return;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    var fg = parse(cs.color);
    if (!fg) return;
    var size = parseFloat(cs.fontSize);
    var bold = parseInt(cs.fontWeight, 10) >= 600;
    var large = size >= 24 || (size >= 18.66 && bold);
    var cr = ratio(fg.rgb, bgOf(el));
    var need = large ? 3 : 4.5;
    results.push({
      sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
      text: el.textContent.trim().slice(0, 22),
      ratio: Math.round(cr * 100) / 100, need: need, size: size, pass: cr >= need,
      color: cs.color, bg: 'rgb(' + bgOf(el).join(',') + ')'
    });
  });
  return results;
`;

async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}

async function waitApp() {
  return waitFor(async () => {
    const n = await evaluate(`return document.querySelectorAll('.topbar .mainnav a').length;`);
    return n && n > 3 ? n : null;
  }, 15000, 200);
}

async function run(theme) {
  // 先导航到目标站点，localStorage 才可写入（about:blank 会被拒绝）
  await cdp.send('Page.navigate', { url: BASE + '/#/' });
  await waitApp();
  await sleep(600);
  await evaluate(`try { localStorage.setItem('acoustic-theme', ${JSON.stringify(theme)}); } catch (e) {} return 1;`);
  // 用 hash 变化不能重载页面，这里强制 reload 让 theme.js 重新读取 localStorage
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitApp();
  await sleep(900);
  const applied = await evaluate(`return document.documentElement.getAttribute('data-theme');`);
  const rows = await evaluate(AUDIT);
  const bad = rows.filter((r) => !r.pass).sort((a, b) => a.ratio - b.ratio);
  console.log('\n===== ' + theme + '（data-theme=' + applied + '，检测 ' + rows.length + ' 个文本节点）=====');
  console.log('  最低对比度 ' + Math.min.apply(null, rows.map((r) => r.ratio)) + ':1');
  if (!bad.length) console.log('  ✅ 全部达到 WCAG AA');
  else {
    console.log('  ⚠ 未达标 ' + bad.length + ' 项：');
    bad.slice(0, 12).forEach((b) => {
      console.log('    ' + b.ratio + ':1 (需 ' + b.need + ') ' + b.sel + '  ' + b.size + 'px  「' + b.text + '」 ' + b.color + ' on ' + b.bg);
    });
  }
  await shot('home-' + theme);

  await cdp.send('Page.navigate', { url: BASE + '/#/muffler' });
  await waitApp();
  await sleep(1000);
  const applied2 = await evaluate(`return document.documentElement.getAttribute('data-theme');`);
  await shot('muffler-' + theme);
  const rows2 = await evaluate(AUDIT.replace("#view-home *, .topbar *, .site-footer *", "#view-muffler *, .topbar *"));
  const bad2 = rows2.filter((r) => !r.pass).sort((a, b) => a.ratio - b.ratio);
  console.log('  #/muffler（data-theme=' + applied2 + '）：检测 ' + rows2.length + ' 节点，未达标 ' + bad2.length + ' 项，最低 ' +
    (rows2.length ? Math.min.apply(null, rows2.map((r) => r.ratio)) : '-') + ':1');
  bad2.slice(0, 8).forEach((b) => console.log('    ' + b.ratio + ':1 ' + b.sel + '  「' + b.text + '」'));
}

try {
  await run('light');
  await run('dark');
} catch (e) {
  console.error('异常: ' + (e && e.stack ? e.stack : e));
} finally {
  ws.close(); proc.kill();
  await sleep(200);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
}
