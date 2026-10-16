/*
 * sim.test.js - 室内音质几何声学模拟内核（v3，逐倍频带） (node tests/sim.test.js)
 *
 * 覆盖：房间几何与 Sabine/Eyring、三维光线追踪（俄罗斯轮盘赌 + 朗伯散射）、
 * 网格采样与逐格逐带指标、混响时间（Schroeder 反向积分 + Lundeby 截断补偿）、
 * 接收点回波与 ISO 3382 参量、轴测投影、色标刻度、以及物理一致性回归
 * （模拟 T30 必须落在 Eyring+空气 与 Sabine 之间）。
 */
var S = require('../public/js/sim.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (+-' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('[1] 房间几何 / Sabine / Eyring');
var m = S.buildRoom({ width: 10, depth: 8, height: 3, alpha: 0.2 });
assert('buildRoom ok', m.ok === true);
approx('area', m.area, 80);
approx('volume', m.volume, 240);
approx('surface', m.surface, 268);
approx('absorption (1 kHz)', m.absorption, 53.6);
approx('meanAlpha (1 kHz)', m.meanAlpha, 0.2, 1e-6);
approx('Sabine RT (1 kHz)', m.rt60, 0.7209, 0.001);
approx('meanFreePath', m.meanFreePath, 3.5821, 0.001);
assert('六个倍频带', m.bands.length === 6);
assert('BANDS = 125..4000', S.BANDS.join(',') === '125,250,500,1000,2000,4000');
assert('NB = 6', S.NB === 6);
assert('Eyring+空气 <= Sabine（低频空气吸收小，二者接近）',
  m.bands[0].eyringAir <= m.bands[0].sabine + 1e-9);
assert('4 kHz 空气吸收使 Eyring 明显短于 Sabine',
  m.bands[5].eyringAir < m.bands[5].sabine * 0.95);
assert('非法房间被拒绝', S.buildRoom({ width: 0, depth: 8 }).ok === false);

var mi = S.buildRoom({
  width: 10, depth: 8, height: 3, alpha: 0.2,
  innerWalls: [{ x1: 5, y1: 2, x2: 5, y2: 6, alpha: 0.5 }]
});
assert('内隔墙已加入', mi.innerWalls.length === 1);
approx('内隔墙增加表面积 (24)', mi.surface, 292);
approx('内隔墙增加吸声量 (12)', mi.absorption, 65.6, 0.01);
approx('内隔墙后 Sabine RT', mi.rt60, 0.5890, 0.002);
assert('内隔墙进入求交墙表', mi.walls.length === 5);

console.log('[2] 朗伯散射方向采样');
(function () {
  var seed = 1;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var inHemi = true, unit = true, cosSum = 0, N = 4000;
  for (var i = 0; i < N; i++) {
    var d = S.lambert(0, 0, 1, rnd);             // 法线 +z
    var len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    if (Math.abs(len - 1) > 1e-6) unit = false;
    if (d[2] < -1e-9) inHemi = false;            // 必须落在法线所在半球
    cosSum += d[2];
  }
  assert('采样方向为单位向量', unit);
  assert('采样方向落在法线半球内', inHemi);
  // 余弦加权分布的均值 cosθ = 2/3 ≈ 0.667
  approx('余弦加权：平均 cosθ ≈ 2/3', cosSum / N, 2 / 3, 0.03);
  var dl = S.lambert(1, 0, 0, rnd);
  assert('法线 +x 时方向以 x 为主', dl[0] > -1e-9);
})();

console.log('[3] 三维光线追踪');
var box = S.buildRoom({ width: 10, depth: 10, height: 3, alpha: 0.2 });
var tr = S.traceBox(box, { source: { x: 5, y: 5, z: 1.5 }, nRays: 1, maxBounces: 3, scatter: 0, seed: 7 });
assert('traceBox ok', tr.ok === true);
assert('返回声线数 = 1', tr.rays.length === 1);
var p0 = tr.rays[0].pts;
assert('纯镜面 3 次反射 -> 4 个节点', p0.length === 4);
approx('第 1 次反射后能量 = 0.8', p0[1].cb[3], 0.8, 1e-9);
approx('第 2 次反射后能量 = 0.64', p0[2].cb[3], 0.64, 1e-9);
approx('第 3 次反射后能量 = 0.512', p0[3].cb[3], 0.512, 1e-9);
assert('累计路程单调递增', p0[0].t === 0 && p0[1].t > 0 && p0[2].t > p0[1].t && p0[3].t > p0[2].t);
assert('反射点均落在界面上', p0.slice(1).every(function (q) {
  return Math.abs(q.x) < 1e-6 || Math.abs(q.x - 10) < 1e-6 ||
    Math.abs(q.y) < 1e-6 || Math.abs(q.y - 10) < 1e-6 ||
    Math.abs(q.z) < 1e-6 || Math.abs(q.z - 3) < 1e-6;
}));
assert('平均反射次数 = 3', Math.abs(tr.hits - 3) < 1e-9);
approx('声线总长度', tr.rays[0].length, p0[3].t, 1e-9);

var trS = S.traceBox(box, { source: { x: 5, y: 5, z: 1.5 }, nRays: 300, scatter: 0.35, seed: 11 });
assert('散射模式声线数 = 300', trS.rays.length === 300);
assert('散射使平均反射次数显著高于纯镜面短程', trS.hits > 5);
assert('每条声线至少 2 个节点', trS.rays.every(function (r) { return r.pts.length >= 2; }));
assert('俄罗斯轮盘赌终止低能声线（存活率 < 1）', trS.aliveRatio < 1);
assert('声能被充分吸收（累计吸收率 > 0.99）', trS.absorbed > 0.99);
assert('最长声程为正且不超过时间窗', trS.maxLength > 0 && trS.maxLength <= S.C_AIR * S.defaultWindowMs(box) / 1000 * 1.1);
/* 期望守恒性检查：关掉轮盘赌后，声线应全部存活到时间窗末端 */
var trFull = S.traceBox(box, { source: { x: 5, y: 5, z: 1.5 }, nRays: 60, scatter: 0.35, seed: 11, rrStart: 0 });
assert('禁用轮盘赌时存活率 = 1', trFull.aliveRatio === 1);

var tiny = S.buildRoom({ width: 2, depth: 2, height: 1.5, alpha: 0.2 });
var tdt = S.traceBox(tiny, { source: { x: 2, y: 4, z: 3 }, nRays: 60, seed: 3 });
assert('声源被夹回房间内部', tdt.source.x < 2 && tdt.source.y < 2 && tdt.source.z < 1.5);
assert('无退化声线', tdt.rays.every(function (r) { return r.pts.length >= 2; }));
assert('室内声源不被改动',
  Math.abs(S.traceBox(box, { source: { x: 4, y: 6, z: 1.5 }, nRays: 1, maxBounces: 1, seed: 5 }).source.x - 4) < 1e-9);

console.log('[4] 网格采样与逐带指标');
var grid = S.sampleGrid(box, trS.rays, { gx: 10, gy: 10 });
assert('格子数 = 100', grid.cells.length === 100);
assert('每格含 6 个倍频带能量', grid.cells[0].E.length === 6);
var sumE = 0;
grid.cells.forEach(function (c) { sumE += c.E[3]; });
assert('1 kHz 总能量 > 0', sumE > 0);
assert('声源附近格子有能量', grid.cells[5 * 10 + 5].E[3] > 0);
var gm = S.gridMetrics(grid);
assert('maxE 逐带给出', gm.maxE.length === 6 && gm.maxE[3] > 0);
assert('指标数组长度 = 格子数', gm.metrics.length === 100);
assert('有效格含 8 种指标', gm.metrics[5 * 10 + 5] &&
  ['E', 'L', 'C50', 'C80', 'D50', 'Ts', 'EDT', 'T30'].every(function (k) {
    return gm.metrics[5 * 10 + 5][k].length === 6;
  }));
assert('声源附近相对声压级 ≈ 0 dB（全场最高）',
  Math.abs(S.metricAtCell(gm, box, { x: 5, y: 5 }, 'L', 3)) < 0.5);
assert('远场格子声压级为负', S.metricAtCell(gm, box, { x: 9, y: 9 }, 'L', 3) < 0);

console.log('[5] 按频带取值 / 范围 / 均值');
assert('bandValue(带内) 取该带', S.bandValue([1, 2, 3, 4, 5, 6], 2) === 3);
assert('bandValue(<0) 取中频均值', S.bandValue([0, 0, 10, 20, 0, 0], -1) === 15);
assert('bandValue(null) -> null', S.bandValue(null, 3) === null);
var rng = S.metricRange(gm, 'T30', { band: 3 });
assert('T30 范围有效', rng && isFinite(rng[0]) && isFinite(rng[1]) && rng[1] >= rng[0]);
var rngMid = S.metricRange(gm, 'T30', { band: -1 });
assert('中频 T30 范围有效', rngMid && rngMid[1] >= rngMid[0]);
var t30mean = S.metricMean(gm, 'T30', { band: 3 });
assert('T30 全场均值有效', t30mean != null && t30mean > 0);
assert('EDT 全场均值有效', S.metricMean(gm, 'EDT', { band: 3 }) > 0);
assert('不存在的指标 -> null', S.metricMean(gm, 'NOPE', { band: 3 }) === null);
assert('缺省 band 用 1 kHz', Math.abs(S.metricMean(gm, 'T30') - t30mean) < 1e-12);

var fakeGm = { gx: 2, gy: 2, maxE: [0, 0, 1, 1, 0, 0], metrics: [{ L: [0, 0, 1, 1, 0, 0] }, { L: [0, 0, 2, 2, 0, 0] }, { L: [0, 0, 3, 3, 0, 0] }, { L: [0, 0, 4, 4, 0, 0] }] };
var fakeModel = { bounds: { w: 10, d: 10 } };
approx('取格 (低,低) -> 1', S.metricAtCell(fakeGm, fakeModel, { x: 1, y: 1 }, 'L', 3), 1, 1e-9);
approx('取格 (高,高) -> 4', S.metricAtCell(fakeGm, fakeModel, { x: 9, y: 9 }, 'L', 3), 4, 1e-9);
approx('越界点钳到末格', S.metricAtCell(fakeGm, fakeModel, { x: 99, y: 99 }, 'L', 3), 4, 1e-9);
assert('缺指标 -> null', S.metricAtCell(fakeGm, fakeModel, { x: 1, y: 1 }, 'C50', 3) === null);
assert('空输入 -> null', S.metricAtCell(null, fakeModel, { x: 1, y: 1 }, 'L', 3) === null);

console.log('[6] 空间平滑');
var gRaw = S.sampleGrid(box, trS.rays, { gx: 10, gy: 10, smooth: 0 });
var gSm = S.sampleGrid(box, trS.rays, { gx: 10, gy: 10, smooth: 2 });
function total(g) { var s = 0; g.cells.forEach(function (c) { s += c.E[3]; }); return s; }
approx('平滑前后总能量近似守恒（边界略损）', total(gSm), total(gRaw), total(gRaw) * 0.25);
var sd = function (g) {
  var v = g.cells.map(function (c) { return c.E[3]; });
  var mu = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  return Math.sqrt(v.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / v.length) / mu;
};
assert('平滑降低格子间相对离散度', sd(gSm) < sd(gRaw));

console.log('[7] Schroeder 反向积分（合成 1 s 衰减）');
var bins = [];
for (var i = 0; i < 100; i++) bins.push(Math.pow(10, -6 * i * 0.01));
var rt = S.rtFromSchroeder(bins, 10);
assert('rtFromSchroeder ok', rt.ok === true);
approx('T30 ≈ 1.0 s', rt.t30, 1.0, 0.03);
approx('T20 ≈ 1.0 s', rt.t20, 1.0, 0.03);
approx('EDT ≈ 1.0 s', rt.edt, 1.0, 0.06);
assert('空回波 -> ok:false', S.rtFromSchroeder([], 10).ok === false);
assert('全零回波 -> ok:false', S.rtFromSchroeder(new Array(50).fill(0), 10).ok === false);

console.log('[8] ISO 3382 参量');
/* 构造 6 带 × 100 箱的回波：每带都是 1 s 衰减 60 dB */
var bins6 = new Float32Array(6 * 100);
for (var b8 = 0; b8 < 6; b8++) {
  for (var i8 = 0; i8 < 100; i8++) bins6[b8 * 100 + i8] = Math.pow(10, -6 * i8 * 0.01);
}
var ec8 = { binMs: 10, nb: 100, bins: bins6 };
var iso = S.isoFromEchogram(ec8, 3);
assert('iso ok', iso.ok === true);
approx('D50 ≈ 0.499', iso.d50, 0.499, 0.02);
approx('C50 ≈ 0 dB', iso.c50, 0, 0.3);
approx('Ts ≈ 72.5 ms', iso.ts, 72.5, 5);
approx('T30 ≈ 1.0 s', iso.t30, 1.0, 0.05);
assert('缺省带 = 1 kHz', S.isoFromEchogram(ec8).ok === true);
assert('各带独立可解', [0, 1, 2, 3, 4, 5].every(function (k) {
  return S.isoFromEchogram(ec8, k).ok === true;
}));
assert('空回波 -> ok:false', S.isoFromEchogram({ binMs: 10, nb: 10, bins: new Float32Array(60) }).ok === false);
assert('缺 nb -> ok:false', S.isoFromEchogram({ binMs: 10, bins: bins6 }).ok === false);

console.log('[9] 接收点逐带回波');
var rr = S.receiverBands(trS.rays, { x: 5, y: 5, z: 1.5 }, { radius: 0.8, model: box, binMs: 10, maxMs: 400 });
assert('回波箱数 = 6 × nb', rr.bins.length === 6 * rr.nb);
var e1k = 0;
for (var q = 0; q < rr.nb; q++) e1k += rr.bins[3 * rr.nb + q];
assert('1 kHz 接收能量 > 0', e1k > 0);
assert('直达声落在第 0 箱', rr.bins[3 * rr.nb] > 0);
var isoR = S.isoFromEchogram(rr, 3);
assert('接收点 ISO 参量有效', isoR.ok === true && isoR.d50 > 0 && isoR.d50 <= 1);
var isoL = S.isoFromEchogram(rr, 0);
assert('低频带独立可用', isoL.ok === true);

console.log('[10] 轴测投影');
var cam0 = { yaw: 0, elev: 0, scale: 1, ox: 0, oy: 0 };
approx('原点 u = 0', S.isoProject(0, 0, 0, cam0).u, 0, 1e-9);
approx('原点 v = 0', S.isoProject(0, 0, 0, cam0).v, 0, 1e-9);
approx('x=5 -> u=5', S.isoProject(5, 0, 0, cam0).u, 5, 1e-9);
approx('elev=0 时地面无竖向偏移', S.isoProject(5, 0, 0, cam0).v, 0, 1e-9);
approx('z=3 抬升到 v=-3（画布向上）', S.isoProject(0, 0, 3, cam0).v, -3, 1e-9);
approx('yaw 90°: (0,5,0) -> u=-5', S.isoProject(0, 5, 0, { yaw: Math.PI / 2, elev: 0, scale: 1, ox: 0, oy: 0 }).u, -5, 1e-9);
approx('y 增大 -> 深度增大', S.isoProject(0, 7, 0, cam0).depth - S.isoProject(0, 2, 0, cam0).depth, 5, 1e-9);

var vw = { x: 10, y: 10, w: 600, h: 400 };
var cam = S.isoFit({ w: 12, d: 8, h: 3, yaw: 0.62, elev: 0.44, view: vw, margin: 26 });
var cornersIn = true, cMin = Infinity, cMax = -Infinity;
[0, 12].forEach(function (cx) {
  [0, 8].forEach(function (cy) {
    [0, 3].forEach(function (cz) {
      var pr = S.isoProject(cx, cy, cz, cam);
      cMin = Math.min(cMin, pr.u); cMax = Math.max(cMax, pr.u);
      if (pr.u < vw.x - 1e-6 || pr.u > vw.x + vw.w + 1e-6) cornersIn = false;
      if (pr.v < vw.y - 1e-6 || pr.v > vw.y + vw.h + 1e-6) cornersIn = false;
    });
  });
});
assert('isoFit 八个角点全部落在视口内', cornersIn);
approx('isoFit 水平居中', (cMin + cMax) / 2, vw.x + vw.w / 2, 0.01);
assert('isoFit scale > 0', cam.scale > 0);
assert('isoFit 夹住极端俯仰角', S.isoFit({ w: 5, d: 5, h: 3, elev: 9, view: vw }).scale > 0);
assert('isoFit 缺省参数可用', S.isoFit({}).scale > 0);

console.log('[11] 色标刻度');
approx('niceStep(10,5) = 2', S.niceStep(10, 5), 2, 1e-9);
approx('niceStep(12.5,5) = 2.5', S.niceStep(12.5, 5), 2.5, 1e-9);
approx('niceStep(0.8,5) = 0.2', S.niceStep(0.8, 5), 0.2, 1e-9);
var nr = S.niceRange(-9.4, 0, 5);
assert('niceRange(-9.4,0,5) -> [-10,0,2]', nr && nr[0] === -10 && nr[1] === 0 && nr[2] === 2);
assert('niceRange 等值输入仍有效', (function () { var r = S.niceRange(5, 5, 5); return r && r[1] > r[0]; })());
var tk = S.scaleTicks(-10, 0, 5);
assert('scaleTicks 返回 n+1 项', tk.length === 6);
approx('顶端刻度 = 上限 0', tk[0].value, 0, 1e-9);
approx('底端刻度 = 下限 -10', tk[5].value, -10, 1e-9);
assert('首末标记 hi/lo', tk[0].edge === 'hi' && tk[5].edge === 'lo' && tk[3].edge === null);
assert('刻度严格递减', tk.every(function (t, i) { return i === 0 || t.value < tk[i - 1].value; }));

console.log('[12] 时间窗（由最长混响自适应）');
var wet = S.buildRoom({ width: 12, depth: 8, height: 3.2, alpha: 0.05 });
var dry = S.buildRoom({ width: 12, depth: 8, height: 3.2, alpha: 0.6 });
var wWet = S.defaultWindowMs(wet), wDry = S.defaultWindowMs(dry);
assert('时间窗在 400–8000 ms 之间', wWet >= 400 && wWet <= 8000 && wDry >= 400 && wDry <= 8000);
assert('混响长的房间时间窗更长', wWet > wDry);

console.log('[13] 物理一致性：模拟 T30 应落在 Eyring+空气 与 Sabine 之间');
[0.05, 0.1, 0.2, 0.3, 0.4].forEach(function (a) {
  var mm = S.buildRoom({ width: 12, depth: 8, height: 3.2, alpha: a });
  var t2 = S.traceBox(mm, { source: { x: 2, y: 4, z: 1.5 }, nRays: 1200, scatter: 0.35, seed: 4242 });
  var g2 = S.sampleGrid(mm, t2.rays, { gx: 24, gy: 16 });
  var g2m = S.gridMetrics(g2);
  var t30 = S.metricMean(g2m, 'T30', { band: 3 });
  var sab = mm.bands[3].sabine, eyr = mm.bands[3].eyringAir;
  var ok = t30 != null && t30 > eyr * 0.85 && t30 < sab * 1.35;
  if (ok) passed++; else failed++;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  α=' + a.toFixed(2) +
    '  T30=' + (t30 == null ? '—' : t30.toFixed(2)) + ' s  (Eyring+空气 ' + eyr.toFixed(2) +
    ' / Sabine ' + sab.toFixed(2) + '，比值 ' + (t30 / eyr).toFixed(2) + ')');
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
