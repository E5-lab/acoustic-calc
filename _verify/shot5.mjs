/*
 * shot5.mjs — 减振模块无头截图（人工视觉复查）
 * 运行：node _verify/shot5.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const BASE = 'http://127.0.0.1:8765';
const OUT = path.resolve('_verify/shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-shot-'));
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

async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  截图 → ' + name + '.png');
}
async function goto(hash) {
  await cdp.send('Page.navigate', { url: BASE + '/' + hash });
  await sleep(900);
}
async function scroll(y) { await evaluate(`window.scrollTo(0, ${y}); return 1;`); await sleep(350); }

await goto('#/');
await sleep(400);
await shot('00-home');

await goto('#/vibration');
await sleep(700);
await shot('01-select-top');
await scroll(760);
await shot('02-select-book');

await evaluate(`document.querySelector('.mode-btn[data-vb-panel="verify"]').click(); return 1;`);
await sleep(500);
await scroll(0);
await shot('03-verify');

await evaluate(`document.querySelector('.mode-btn[data-vb-panel="reverse"]').click(); return 1;`);
await sleep(500);
await shot('04-reverse');
await scroll(620);
await shot('05-reverse-table');

await evaluate(`document.querySelector('.mode-btn[data-vb-panel="select"]').click(); window.scrollTo(0,0); return 1;`);
await sleep(400);
await evaluate(`var p=document.getElementById('vbPreset'); p.value='weak'; p.dispatchEvent(new Event('change',{bubbles:true})); return 1;`);
await sleep(400);
await scroll(560);
await shot('06-weak-warn');

console.log('完成，输出目录：' + OUT);
ws.close();
proc.kill();
await sleep(200);
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
process.exit(0);
