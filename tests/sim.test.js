/*
 * sim.test.js - 室内音质几何声学模拟内核 (node tests/sim.test.js)
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

console.log('Room geometry / Sabine');
var m = S.buildRoom({ width: 10, depth: 8, height: 3, alpha: 0.2 });
assert('buildRoom ok', m.ok === true);
approx('area', m.area, 80);
approx('perimeter', m.perimeter, 36);
approx('volume', m.volume, 240);
approx('surface', m.surface, 268);
approx('absorption', m.absorption, 53.6);
approx('meanAlpha', m.meanAlpha, 0.2, 1e-6);
approx('rt60 (Sabine)', m.rt60, 0.7209, 0.001);
approx('meanFreePath', m.meanFreePath, 3.5821, 0.001);
assert('invalid room rejected', S.buildRoom({ width: 0, depth: 8 }).ok === false);

var mi = S.buildRoom({ width: 10, depth: 8, height: 3, alpha: 0.2, innerWalls: [{ x1: 5, y1: 2, x2: 5, y2: 6, alpha: 0.5 }] });
assert('inner wall added', mi.innerWalls.length === 1);
approx('inner surface added (24)', mi.surface, 292);
approx('inner absorption 12 -> A=65.6', mi.absorption, 65.6, 0.01);
approx('rt60 with inner wall', mi.rt60, 0.5890, 0.002);

console.log('Ray tracing (straight ray in 10x10 box)');
var box = S.buildRoom({ width: 10, depth: 10, height: 3, alpha: 0.2 });
var tr = S.traceRoom(box, { source: { x: 5, y: 5 }, nRays: 1, maxBounces: 3, minEnergy: 0 });
var p = tr.rays[0].pts;
assert('pts length = 1 + 3 bounces', p.length === 4);
approx('first hit x = 0 (left wall)', p[1].x, 0, 1e-6);
approx('first hit y = 5', p[1].y, 5, 1e-6);
approx('energy after 1 bounce = 0.8', p[2].e, 0.8, 1e-9);
approx('energy after 2 bounces = 0.64', p[3].e, 0.64, 1e-9);
approx('path length after 3 bounces = 25 m', tr.rays[0].length, 25, 1e-6);
approx('avg hits = 3', tr.hits, 3, 1e-6);

console.log('Grid sampling');
var tr2 = S.traceRoom(box, { source: { x: 5, y: 5 }, nRays: 300, maxBounces: 30, minEnergy: 0.02 });
var grid = S.sampleGrid(box, tr2.rays, { gx: 10, gy: 10 });
assert('grid cell count = 100', grid.cells.length === 100);
var sumE = 0; grid.cells.forEach(function (c) { sumE += c.E; });
assert('total energy > 0', sumE > 0);
assert('source cell has energy', grid.cells[5 * 10 + 5].E > 0);
var gm = S.gridMetrics(grid);
assert('maxE > 0', gm.maxE > 0);
assert('metrics array length matches', gm.metrics.length === 100);
var rng = S.metricRange(gm, 'C50');
assert('C50 range valid', rng && isFinite(rng[0]) && isFinite(rng[1]) && rng[1] >= rng[0]);

console.log('Cell metrics');
var cm = S.cellMetrics({ E: 100, E50: 80, E80: 90, Et: 3 });
approx('C50 = 10log10(80/20)', cm.C50, 6.0206, 0.001);
approx('C80 = 10log10(90/10)', cm.C80, 9.5424, 0.001);
approx('D50 = 0.80', cm.D50, 0.8, 1e-9);
approx('Ts = 30 ms', cm.Ts, 30, 1e-9);
assert('empty cell -> null', S.cellMetrics({ E: 0, E50: 0, E80: 0, Et: 0 }) === null);

console.log('Schroeder backward integration (T=1 s synthetic decay)');
var bins = [];
for (var i = 0; i < 100; i++) bins.push(Math.pow(10, -6 * i * 0.01)); // -60 dB over 1 s
var rt = S.rtFromSchroeder(bins, 10);
assert('rtFromSchroeder ok', rt.ok === true);
approx('T30 ~ 1.0 s', rt.t30, 1.0, 0.03);
approx('EDT ~ 1.0 s', rt.edt, 1.0, 0.05);

console.log('ISO 3382 from echogram');
var iso = S.isoFromEchogram({ binMs: 10, bins: bins });
assert('iso ok', iso.ok === true);
approx('D50 ~ 0.499', iso.d50, 0.499, 0.02);
approx('C50 ~ 0 dB', iso.c50, 0, 0.3);
approx('Ts ~ 72.5 ms (=1/lambda)', iso.ts, 72.5, 5);

console.log('Receiver response (ray passes receiver)');
var rr = S.receiverResponse(tr.rays, { x: 2.5, y: 5 }, { radius: 0.5, binMs: 10, maxMs: 200 });
assert('direct arrival in bin 0', rr.bins[0] > 0);
assert('1st reflection arrival in bin 2 (~21.9 ms)', rr.bins[2] > 0);

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
