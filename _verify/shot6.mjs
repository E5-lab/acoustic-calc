/*
 * shot6.mjs — 二级菜单改版后的无头截图（人工视觉复查）
 * 运行：node _verify/shot6.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.VB_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.VB_PORT || 9338);
const BASE = process.env.VB_BASE || 'http://127.0.0.1:8765';
// 可覆盖环境变量：VB_EDGE=浏览器可执行文件路径  VB_PORT=CDP 调试端口  VB_BASE=被测站点地址
const OUT = path.resolve('_verify/shots6');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-shot-'));
const proc = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDataDir,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1300',
  'about:blank'
], { stdio: 'ignore' });

let ws, cdp;
async function httpJson(url) { return (await fetch(url)).json(); }
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
  const r = await cdp.send('Runtime.evaluate', { expression: '(function(){' + code + '})()', returnByValue: true, awaitPromise: true });
  return r.result && r.result.value;
};

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1300, deviceScaleFactor: 1, mobile: false });

async function shot(name, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = Object.assign({ scale: 1 }, clip);
  const r = await cdp.send('Page.captureScreenshot', params);
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  截图 → ' + name + '.png');
}
async function goto(hash) {
  await cdp.send('Page.navigate', { url: BASE + '/' + hash });
  await sleep(950);
}
async function scroll(y) { await evaluate(`window.scrollTo(0, ${y}); return 1;`); await sleep(320); }
const navClip = { x: 0, y: 0, width: 1440, height: 400 };

// ---------------- 桌面端 ----------------
await goto('#/');
await sleep(400);
await shot('01-home-groups');
await scroll(430);
await shot('02-home-cards');

await evaluate(`document.querySelectorAll('.nav-group')[1].querySelector('.nav-parent').click(); return 1;`);
await sleep(420);
await shot('03-menu-materials', navClip);

await evaluate(`document.querySelectorAll('.nav-group')[3].querySelector('.nav-parent').click(); return 1;`);
await sleep(420);
await shot('04-menu-env-right', navClip);

await evaluate(`document.querySelector('.nav-group .nav-menu a[data-route="noise"]').click(); return 1;`);
await sleep(900);
await shot('05-crumb-noise', { x: 0, y: 0, width: 1440, height: 330 });

await goto('#/vibration');
await sleep(700);
await shot('06-crumb-vibration', { x: 0, y: 0, width: 1440, height: 330 });

await goto('#/stc');
await sleep(700);
await shot('07-crumb-stc', { x: 0, y: 0, width: 1440, height: 330 });

// ---------------- 窄视口 ----------------
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await goto('#/');
await sleep(700);
await shot('08-mobile-home');
await evaluate(`document.querySelectorAll('.nav-group')[0].querySelector('.nav-parent').click(); return 1;`);
await sleep(420);
await shot('09-mobile-menu');

const mw = await evaluate(`return { vw: window.innerWidth, sw: document.documentElement.scrollWidth };`);
console.log('  窄视口 ' + mw.vw + 'px，文档宽度 ' + mw.sw + 'px');

console.log('完成，输出目录：' + OUT);
ws.close();
proc.kill();
await sleep(200);
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
process.exit(0);
