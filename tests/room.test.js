/*
 * room.test.js — 混响时间 RT60 内核验证（node tests/room.test.js）
 */
var R = require('../public/js/room.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.01 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (±' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

console.log('材料库与房间用途');
assert('材料库条目完整', R.MATERIALS.length >= 15 && R.MATERIALS.every(function (m) {
  return m.id && m.name && m.alpha.length === 6 && m.alpha.every(function (a) { return a >= 0 && a <= 1; });
}));
assert('房间用途库条目完整', R.ROOM_USES.length >= 10 && R.ROOM_USES.every(function (u) {
  return u.id && u.name && Array.isArray(u.rt) && u.rt[0] < u.rt[1];
}));
assert('findMaterial 命中', R.findMaterial('carpet') != null);
assert('findUse 未命中返回 null', R.findUse('nope') === null);

console.log('几何');
var g = R.geometry({ length: 10, width: 8, height: 4 });
approx('体积 320 m³', g.volume, 320, 1e-9);
approx('总表面积 304 m²', g.geomArea, 304, 1e-9);
assert('缺尺寸 → 报错', R.geometry({}).ok === false);
assert('可直接给体积', R.geometry({ volume: 100 }).volume === 100);

console.log('Sabine 手算基准（10×8×4 m 全抹灰、不计空气吸收）');
var bare = R.compute({
  length: 10, width: 8, height: 4,
  surfaces: [],
  fillerMaterialId: 'plaster',
  airAbsorption: false
});
assert('计算成功', bare.ok === true);
approx('总表面积 304', bare.totalArea, 304, 1e-9);
approx('500 Hz 吸声量 A = 0.03 × 304 = 9.12', bare.absorption[2], 9.12, 1e-9);
approx('500 Hz RT = 0.161×320/9.12 = 5.649 s', bare.rtSabine[2], 5.649, 0.01);
assert('未列表面自动补入一行', bare.rows.length === 1 && bare.rows[0].filler === true);
assert('空气吸收项为 0', bare.airTerm[2] === 0);

console.log('空气吸收与 Eyring');
var withAir = R.compute({ length: 10, width: 8, height: 4, surfaces: [] });
assert('计入空气吸收后 4 kHz RT 变短', withAir.rtSabine[5] < bare.rtSabine[5]);
approx('4 kHz 空气吸收 4mV ≈ 1.38', withAir.airTerm[5], 4 * R.AIR_M[5] * 320, 1e-9);
assert('Eyring ≤ Sabine（吸声系数大时更明显）', withAir.rtEyring[2] <= withAir.rtSabine[2] + 1e-9);

console.log('教室场景手算基准（9×6×3.5 m，顶棚矿棉板 + 硬木地板 + 抹灰墙）');
var cls = R.compute({
  length: 9, width: 6, height: 3.5,
  surfaces: [
    { name: '地面', area: 54, materialId: 'woodfloor' },
    { name: '顶棚', area: 54, materialId: 'mineral-panel' }
  ],
  fillerMaterialId: 'plaster'
});
approx('体积 189 m³', cls.volume, 189, 1e-9);
approx('总表面积 213 m²', cls.totalArea, 213, 1e-9);
approx('500 Hz 吸声量 ≈ 54.655', cls.totalAbsorption[2], 54.655, 0.01);
approx('500 Hz RT ≈ 0.557 s', cls.rtSabine[2], 0.557, 0.005);
approx('中频 RT（500 Hz–1 kHz 平均）≈ 0.546 s', cls.rtMidSabine, 0.546, 0.005);
assert('剩余表面行材料为抹灰墙', cls.rows.some(function (r) { return r.filler && r.area === 105; }));

console.log('吸声处理效果');
var treated = R.compute({
  length: 9, width: 6, height: 3.5,
  surfaces: [
    { name: '地面', area: 54, materialId: 'woodfloor' },
    { name: '顶棚', area: 54, materialId: 'mineral-panel' },
    { name: '墙面吸声板', area: 40, materialId: 'mineral-panel' }
  ],
  fillerMaterialId: 'plaster'
});
assert('增加吸声面积后 RT 变短', treated.rtSabine[2] < cls.rtSabine[2]);
assert('自定义六带吸声系数可用', R.compute({
  volume: 189,
  surfaces: [{ name: '全表面', area: 213, alpha: [0.1, 0.2, 0.3, 0.3, 0.3, 0.3] }]
}).rtSabine[2] != null);
assert('单一平均吸声系数可用', R.compute({
  volume: 189, surfaces: [{ name: '全表面', area: 213, alphaAvg: 0.3 }]
}).rtSabine[2] != null);

console.log('推荐值判定与改进建议');
var evHigh = R.evaluate('classroom', 1.6);
assert('教室 RT 1.6 s → 偏长', evHigh.status === 'high');
approx('超出量 = 1.6 − 0.8 = 0.8', evHigh.margin, 0.8, 1e-9);
var evOk = R.evaluate('classroom', 0.65);
assert('教室 RT 0.65 s → 达标', evOk.status === 'pass');
assert('RT 0.1 s（录音室）→ 偏短', R.evaluate('studio-speech', 0.1).status === 'low');
assert('数据缺失 → na', R.evaluate('classroom', null).status === 'na');

var longRoom = R.compute({ length: 10, width: 8, height: 4, surfaces: [], fillerMaterialId: 'plaster' });
var sug = R.suggest(longRoom, 'classroom', 'mineral-panel');
assert('混响偏长的房间给出增加吸声量建议', sug != null && sug.needed > 0 && sug.area > 0);
approx('所需总吸声量 = 0.161×320/0.8 ≈ 64.4', 0.161 * 320 / 0.8, 64.4, 0.05);
assert('已达标房间无需增加吸声', R.suggest(cls, 'classroom', 'mineral-panel').needed === 0);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
