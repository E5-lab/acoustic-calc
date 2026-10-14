/*
 * cdp-test5.mjs — 弹簧减振计算书模块的浏览器端交互验证（自建 CDP，系统 Edge 无头模式）
 * 运行：node _verify/cdp-test5.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = 'http://127.0.0.1:8765';

let passed = 0, failed = 0;
const fails = [];
function ok(name) { passed++; console.log('  PASS  ' + name); }
function bad(name, extra) { failed++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
function assert(name, cond, extra) { cond ? ok(name) : bad(name, extra); }
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  const good = typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= tol;
  good ? ok(name + ' = ' + Number(got).toFixed(3)) : bad(name, 'got ' + got + ' want ~' + want);
}

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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-edge-'));
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
    ws.addEventListener('error', (e) => reject(new Error('WebSocket 连接失败')));
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
  await sleep(320);
}

async function type(sel, value) {
  return evaluate(`
    var el = document.querySelector(${JSON.stringify(sel)});
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  `);
}

async function click(sel) {
  return evaluate(`
    var el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    el.click();
    return true;
  `);
}

async function text(sel) {
  return evaluate(`var el = document.querySelector(${JSON.stringify(sel)}); return el ? el.textContent.trim() : null;`);
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

  // ---------- A. 站点结构与路由 ----------
  console.log('A. 站点结构与路由');
  await goto('#/');
  const nav = await evaluate(`
    var as = document.querySelectorAll('.mainnav a');
    return { count: as.length, routes: Array.prototype.map.call(as, function(a){ return a.getAttribute('data-route'); }),
             active: document.querySelector('.mainnav a.active') ? document.querySelector('.mainnav a.active').getAttribute('data-route') : null };
  `);
  assert('导航共 9 项', nav.count === 9, 'count=' + nav.count);
  assert('导航含 vibration 路由', nav.routes.indexOf('vibration') >= 0, nav.routes.join(','));
  assert('导航含 levels / barrier 路由', nav.routes.indexOf('levels') >= 0 && nav.routes.indexOf('barrier') >= 0);

  const cards = await evaluate(`
    var cs = document.querySelectorAll('.module-card');
    var live = Array.prototype.filter.call(cs, function(c){ return c.querySelector('.mc-tag.live'); });
    return { count: cs.length, live: live.length,
             hasVb: !!document.querySelector('.module-card[href="#/vibration"]'),
             groups: Array.prototype.map.call(document.querySelectorAll('.group-label'), function(g){ return g.textContent.trim(); }) };
  `);
  assert('首页模块卡共 8 张且全部为「可用」', cards.count === 8 && cards.live === 8, JSON.stringify(cards));
  assert('首页含减振模块入口', cards.hasVb === true);
  assert('首页按 4 个分组归类，减振模块归入「环境与振动」',
    cards.groups.join(',') === '基础计算,材料与构件,房间声学,环境与振动', cards.groups.join(','));

  await goto('#/vibration');
  const route = await evaluate(`
    return { active: document.getElementById('view-vibration').classList.contains('active'),
             hash: location.hash, title: document.title,
             navActive: document.querySelector('.mainnav a.active') ? document.querySelector('.mainnav a.active').getAttribute('data-route') : null };
  `);
  assert('路由 #/vibration 激活对应视图', route.active === true && route.hash === '#/vibration');
  assert('页面标题随路由更新', /减振/.test(route.title), route.title);
  assert('导航高亮同步', route.navActive === 'vibration');

  // ---------- B. 面板 1：默认例题计算书 ----------
  console.log('B. 面板 1（静变形法 · 计算书）');
  const eta = await text('#vbEta');
  assert('隔振效率显示 97.8 %', eta === '97.8' || eta === '97.9', 'eta=' + eta);
  const statsText = await text('#vbStats');
  assert('统计含静态压缩量 25.3 mm', /25\.3/.test(statsText), statsText);
  assert('统计含固有频率 3.13 Hz', /3\.13/.test(statsText));
  assert('统计含扰动频率 24.17 Hz', /24\.17/.test(statsText));
  assert('统计含频率比 7.72', /7\.72/.test(statsText));
  assert('统计含振动级降低量', /dB/.test(statsText));
  const verdict = await text('#vbVerdict');
  assert('结论区给出传递率与评级', /传递率/.test(verdict) && /优/.test(verdict), verdict);

  const book = await evaluate(`
    var rows = document.querySelectorAll('#vbBook tbody tr');
    var first = rows[0] ? rows[0].textContent : '';
    var sixth = rows[5] ? rows[5].textContent : '';
    var tenth = rows[9] ? rows[9].textContent : '';
    var all = Array.prototype.map.call(rows, function(r){ return r.textContent; });
    return { count: rows.length, first: first, sixth: sixth, tenth: tenth,
             hasFormulaCol: all.every(function(t){ return /[=√]/.test(t); }),
             last: all[all.length-1] || '' };
  `);
  assert('计算书共 12 步', book.count === 12, 'count=' + book.count);
  assert('第 1 步含运行重量 304.2 kg', /304\.2/.test(book.first), book.first.slice(0, 90));
  assert('第 1 步含公式 W = (G₁ + G₂) × K', /G₁/.test(book.first) && /1\.3/.test(book.first));
  assert('第 6 步含固有频率 3.13 Hz', /3\.13/.test(book.sixth), book.sixth.slice(0, 90));
  assert('第 10 步含隔振效率 97.84', /97\.84/.test(book.tenth), book.tenth.slice(0, 90));
  assert('每步均含公式或代入过程', book.hasFormulaCol === true);
  assert('末步为校核与结论', /校核与结论/.test(book.last), book.last.slice(0, 60));

  const warnBox = await text('#vbWarn');
  assert('荷载利用率校核通过提示', /荷载利用率/.test(warnBox), warnBox.slice(0, 80));
  assert('无模板表达式泄漏（无 undefined/NaN）', !/undefined|NaN/.test(await text('#vbBook') + warnBox + statsText + verdict));

  const canvas = await evaluate(`
    var c = document.getElementById('vbChart');
    return { w: c.width, h: c.height, painted: c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(function(v,i){ return i%4===3 && v>0; }) };
  `);
  assert('传递率曲线画布已渲染', canvas.w > 0 && canvas.painted === true, JSON.stringify(canvas));

  // ---------- C. 输入联动 ----------
  console.log('C. 输入联动与单位换算');
  await type('#vbStiffness', 6);
  const half = await evaluate(`
    return { eta: parseFloat(document.getElementById('vbEta').textContent),
             stats: document.getElementById('vbStats').textContent };
  `);
  assert('刚度加倍 → 静变形减半（约 12.7 mm）', /12\.7/.test(half.stats), half.stats);
  assert('刚度加倍 → 隔振效率下降', half.eta < 97.8, 'eta=' + half.eta);

  await type('#vbStiffness', 30);
  await evaluate(`document.getElementById('vbUnit').value='kg/cm'; document.getElementById('vbUnit').dispatchEvent(new Event('change',{bubbles:true})); return true;`);
  const cm = await evaluate(`return { eta: parseFloat(document.getElementById('vbEta').textContent), stats: document.getElementById('vbStats').textContent };`);
  assert('30 kg/cm 等价于 3 kg/mm（效率一致）', Math.abs(cm.eta - 97.8) < 0.06, 'eta=' + cm.eta);
  assert('kg/cm 换算后静变形回到 25.3 mm', /25\.3/.test(cm.stats), cm.stats);

  await evaluate(`
    document.getElementById('vbUnit').value='kg/mm'; document.getElementById('vbUnit').dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('vbStiffness').value='3'; document.getElementById('vbStiffness').dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  `);
  await evaluate(`document.getElementById('vbDynamic').value='2'; document.getElementById('vbDynamic').dispatchEvent(new Event('change',{bubbles:true})); return true;`);
  const rubber = await evaluate(`return { eta: parseFloat(document.getElementById('vbEta').textContent), stats: document.getElementById('vbStats').textContent };`);
  assert('橡胶减振器（d=2）固有频率升至 4.43 Hz', /4\.43/.test(rubber.stats), rubber.stats);
  assert('橡胶减振器效率低于钢弹簧', rubber.eta < 97.8, 'eta=' + rubber.eta);
  await evaluate(`document.getElementById('vbDynamic').value='1'; document.getElementById('vbDynamic').dispatchEvent(new Event('change',{bubbles:true})); return true;`);

  await type('#vbDamping', 0);
  const noDamp = await evaluate(`
    return { eta: parseFloat(document.getElementById('vbEta').textContent),
             verdict: document.getElementById('vbVerdict').textContent,
             warn: document.getElementById('vbWarn').textContent };
  `);
  assert('D = 0 时隔振效率等于无阻尼简化式 98.3%', Math.abs(noDamp.eta - 98.3) < 0.06, 'eta=' + noDamp.eta);
  assert('D = 0 时提示宜取 0.05 ~ 0.12', /0\.05 ~ 0\.12/.test(noDamp.warn), noDamp.warn.slice(0, 80));

  await type('#vbDamping', 0.05);
  await type('#vbCount', 8);
  const count8 = await text('#vbStats');
  assert('数量改为 8 只 → 每只承载约 38 kg', /38\.0/.test(count8), count8);
  await type('#vbCount', 4);

  await type('#vbRpm', 2900);
  const fast = await evaluate(`return { stats: document.getElementById('vbStats').textContent, eta: parseFloat(document.getElementById('vbEta').textContent) };`);
  assert('转速提高到 2900 → 扰动频率 48.33 Hz', /48\.33/.test(fast.stats), fast.stats);
  assert('转速提高 → 频率比与效率上升', fast.eta > 97.8, 'eta=' + fast.eta);
  await type('#vbRpm', 1450);

  await type('#vbDevice', 4000);
  const heavy = await text('#vbStats');
  assert('设备重量增大 → 静变形增大、效率上升', /433\.3/.test(heavy), heavy);
  await type('#vbDevice', 234);
  await type('#vbBase', 0);

  // ---------- D. 示例切换 ----------
  console.log('D. 示例切换');
  await evaluate(`
    var s = document.getElementById('vbPreset');
    s.value = 'weak'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  `);
  const weak = await evaluate(`
    return { eta: parseFloat(document.getElementById('vbEta').textContent),
             warn: document.getElementById('vbWarn').textContent,
             verdict: document.getElementById('vbVerdict').textContent,
             classes: Array.prototype.map.call(document.querySelectorAll('#vbWarn .callout'), function(c){ return c.className; }) };
  `);
  assert('「效率不足」示例触发警告提示', /频率比|偏大|稳定性/.test(weak.warn), weak.warn.slice(0, 100));
  assert('警告区使用 warn/danger 样式', weak.classes.some((c) => /warn|error/.test(c)), weak.classes.join('|'));
  assert('效率不足示例的效率低于 90%', weak.eta < 90, 'eta=' + weak.eta);

  await evaluate(`
    var s = document.getElementById('vbPreset');
    s.value = 'chiller'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  `);
  const chiller = await evaluate(`return { eta: parseFloat(document.getElementById('vbEta').textContent), warn: document.getElementById('vbWarn').textContent };`);
  assert('离心机示例效率高于 99%', chiller.eta > 99, 'eta=' + chiller.eta);
  assert('离心机示例荷载利用率合理', /荷载利用率/.test(chiller.warn) || chiller.warn.length > 0);

  await evaluate(`
    var s = document.getElementById('vbPreset');
    s.value = 'fan'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  `);
  const back1 = await evaluate(`return { eta: parseFloat(document.getElementById('vbEta').textContent), dev: document.getElementById('vbDevice').value };`);
  assert('切回风机例题：设备 234 kg、效率 97.8%', back1.dev === '234' && Math.abs(back1.eta - 97.8) < 0.06, JSON.stringify(back1));

  // ---------- E. 复制计算书 ----------
  console.log('E. 复制计算书');
  const copied = await evaluate(`
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: function (t) { window.__copied = t; return Promise.resolve(); } }
    });
    document.getElementById('vbCopy').click();
    return true;
  `);
  assert('复制按钮可点击', copied === true);
  await sleep(120);
  const clip = await evaluate(`return window.__copied || '';`);
  assert('剪贴板内容为计算书标题', /弹簧减振器隔振效率计算书/.test(clip), clip.slice(0, 60));
  assert('计算书含 12 步过程', /12\. 校核与结论/.test(clip));
  assert('计算书含公式与代入', /公式：/.test(clip) && /代入：/.test(clip));
  assert('计算书含效率结论', /97\.84%|97\.8[0-9]%/.test(clip), clip.slice(-260));
  const copyMsg = await text('#vbCopyMsg');
  assert('复制后给出反馈', /已复制/.test(copyMsg || ''), 'msg=' + copyMsg);

  // ---------- F. 面板 2：频率比法验算 ----------
  console.log('F. 面板 2（频率比法验算）');
  await click('.mode-btn[data-vb-panel="verify"]');
  await sleep(200);
  const panel2 = await evaluate(`
    return { sel: document.querySelector('.vb-panel[data-panel="select"]').hidden,
             ver: document.querySelector('.vb-panel[data-panel="verify"]').hidden,
             active: document.querySelector('.mode-btn[data-vb-panel="verify"]').classList.contains('active') };
  `);
  assert('切换到验算面板（互斥显示）', panel2.sel === true && panel2.ver === false && panel2.active === true, JSON.stringify(panel2));

  const vEta = await text('#vbVEta');
  assert('验算面板效率 ≈ 97.8%（f = 24.2 / f₀ = 3.13 / D = 0.05）', Math.abs(parseFloat(vEta) - 97.84) < 0.1, vEta);
  const vStats = await text('#vbVStats');
  assert('验算面板给出频率比 7.73', /7\.7[23]/.test(vStats), vStats);
  assert('验算面板给出共振峰值 10 倍', /10\.0/.test(vStats), vStats);

  const cmp = await evaluate(`
    var rows = document.querySelectorAll('#vbVTable tbody tr');
    var head = document.querySelector('#vbVTable thead');
    return { count: rows.length, head: head ? head.textContent : '',
             all: Array.prototype.map.call(rows, function(r){ return r.textContent; }).join(' || ') };
  `);
  assert('对比表 5 行', cmp.count === 5, 'count=' + cmp.count);
  assert('表头列出无阻尼简化式与含阻尼式', /无阻尼/.test(cmp.head) && /含阻尼/.test(cmp.head), cmp.head.slice(0, 80));
  assert('对比表给出两式效率差值', /偏乐观/.test(cmp.all));

  await type('#vbVF0', '');
  await sleep(120);
  const fromDefl = await text('#vbVStats');
  assert('清空 f₀ 后由 δ = 25.4 mm 反推固有频率 ≈ 3.13', /3\.1[23]/.test(fromDefl), fromDefl);
  await type('#vbVF0', 3.13);

  await type('#vbVDamping', 0);
  const vZero = await text('#vbVEta');
  assert('D = 0 时含阻尼效率退化为无阻尼 98.3%', Math.abs(parseFloat(vZero) - 98.3) < 0.06, vZero);
  await type('#vbVDamping', 0.05);

  await type('#vbVFreq', 3);
  const lowZ = await evaluate(`return { eta: parseFloat(document.getElementById('vbVEta').textContent), msg: document.getElementById('vbVMsg').textContent, verdict: document.getElementById('vbVVerdict').textContent };`);
  assert('扰动频率低于固有频率 → 判定为共振放大区', /共振|放大/.test(lowZ.verdict), lowZ.verdict);
  assert('放大时效率为负', lowZ.eta < 0, 'eta=' + lowZ.eta);
  await type('#vbVFreq', 24.2);

  const vCanvas = await evaluate(`
    var c = document.getElementById('vbVChart');
    return { painted: c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(function(v,i){ return i%4===3 && v>0; }) };
  `);
  assert('验算面板曲线已渲染', vCanvas.painted === true);

  // ---------- G. 面板 3：反算与对照 ----------
  console.log('G. 面板 3（反算与对照）');
  await click('.mode-btn[data-vb-panel="reverse"]');
  await sleep(200);
  const panel3 = await evaluate(`
    return { sel: document.querySelector('.vb-panel[data-panel="select"]').hidden,
             rev: document.querySelector('.vb-panel[data-panel="reverse"]').hidden };
  `);
  assert('切换到反算面板', panel3.sel === true && panel3.rev === false);

  const rev = await text('#vbTResult');
  assert('反算给出所需频率比 3.32', /3\.32/.test(rev), rev.slice(0, 120));
  assert('反算给出所需固有频率 7.30 Hz', /7\.3[0-9]/.test(rev), rev.slice(0, 160));
  assert('反算给出所需静态压缩量 4.67 mm', /4\.67/.test(rev), rev.slice(0, 200));
  assert('反算给出单只最大允许刚度', /单只最大允许刚度/.test(rev));

  const table3 = await evaluate(`
    var rows = document.querySelectorAll('#vbTableBox tbody tr');
    return { count: rows.length, first: rows[0] ? rows[0].textContent : '', last: rows[rows.length-1] ? rows[rows.length-1].textContent : '' };
  `);
  assert('对照表 7 行（80 ~ 99%）', table3.count === 7, 'count=' + table3.count);
  assert('对照表首行为 80%', /80 %/.test(table3.first), table3.first);
  assert('对照表末行为 99% 且静变形最大', /99 %/.test(table3.last) && /1[0-9][0-9]\./.test(table3.last), table3.last);

  await type('#vbTEta', 95);
  const rev95 = await text('#vbTResult');
  assert('目标 95% → 所需频率比 4.58', /4\.58/.test(rev95), rev95.slice(0, 120));
  await type('#vbTEta', 100);
  const revBad = await evaluate(`return { msg: document.getElementById('vbTMsg').textContent, result: document.getElementById('vbTResult').textContent };`);
  assert('目标 100% → 报错提示', /小于 100%/.test(revBad.msg), revBad.msg);
  await type('#vbTEta', 90);

  await type('#vbTFreq', 15);
  const revLow = await text('#vbTResult');
  assert('降低扰动频率 → 所需静变形增大', /1[0-9]\.[0-9]/.test(revLow), revLow.slice(0, 200));
  await type('#vbTFreq', 24.2);

  await type('#vbTDamping', 0.05);
  const revD = await text('#vbTResult');
  assert('考虑阻尼后所需频率比增大（> 3.32）', /3\.[4-9]/.test(revD), revD.slice(0, 120));
  await type('#vbTDamping', 0);

  const guide = await evaluate(`
    var g = document.querySelectorAll('#vbGuideBox tbody tr');
    var e = document.querySelectorAll('#vbGradeBox tbody tr');
    return { guide: g.length, grade: e.length,
             danger: Array.prototype.some.call(g, function(r){ return /禁止|共振|放大/.test(r.textContent); }),
             rec: Array.prototype.some.call(g, function(r){ return /2\.5/.test(r.textContent); }) };
  `);
  assert('频率比判定准则表 5 行', guide.guide === 5, 'rows=' + guide.guide);
  assert('准则表含禁止/放大说明', guide.danger === true);
  assert('准则表含推荐区间 2.5 ~ 4', guide.rec === true);
  assert('效率等级表 4 行', guide.grade === 4, 'rows=' + guide.grade);

  // ---------- H. 其它视图回归 ----------
  console.log('H. 既有模块回归');
  await goto('#/levels');
  const lv = await evaluate(`
    return { active: document.getElementById('view-levels').classList.contains('active'),
             total: document.getElementById('lvTotal').textContent.trim() };
  `);
  assert('#/levels 正常渲染且总声级 92.2 dB', lv.active === true && lv.total === '92.2', JSON.stringify(lv));

  await goto('#/barrier');
  const bar = await evaluate(`
    return { active: document.getElementById('view-barrier').classList.contains('active'),
             il: document.getElementById('barIL').textContent.trim() };
  `);
  assert('#/barrier 正常渲染', bar.active === true && parseFloat(bar.il) > 0, JSON.stringify(bar));

  await goto('#/stc');
  const stc = await evaluate(`return document.getElementById('view-stc').classList.contains('active');`);
  assert('#/stc 正常渲染', stc === true);

  await goto('#/vibration');
  const again = await evaluate(`
    return { active: document.getElementById('view-vibration').classList.contains('active'),
             navs: document.querySelectorAll('.mainnav a').length,
             eta: document.getElementById('vbEta').textContent.trim(),
             dup: document.querySelectorAll('#vbBook table').length };
  `);
  assert('返回减振视图后仍正常（无重复渲染）', again.active === true && again.dup === 1 && parseFloat(again.eta) > 90, JSON.stringify(again));
  assert('导航项未被重复初始化', again.navs === 9, 'navs=' + again.navs);

  const noData = await evaluate(`
    var html = document.getElementById('view-vibration').innerHTML;
    return { undef: /undefined/.test(html), nan: /NaN/.test(html), htmlError: /\\[object Object\\]/.test(html) };
  `);
  assert('页面无 undefined / NaN / [object Object] 泄漏', !noData.undef && !noData.nan && !noData.htmlError, JSON.stringify(noData));

  console.log('I. 控制台异常');
  assert('无 JS 运行时错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

} catch (e) {
  failed++;
  fails.push('执行异常: ' + e.message);
  console.log('  ERROR  ' + e.message);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  proc.kill();
  await sleep(200);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed) console.log('失败项: ' + fails.join(' ; '));
process.exit(failed === 0 ? 0 : 1);
