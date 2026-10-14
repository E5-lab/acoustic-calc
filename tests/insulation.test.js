/*
 * insulation.test.js — 隔声量质量定律与 STC 评级内核验证（node tests/insulation.test.js）
 */
var I = require('../public/js/insulation.js');

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

console.log('轮廓表与材料库');
assert('STC 轮廓 16 带 125–4000 Hz', I.CONTOUR_HZ.length === 16 && I.CONTOUR_HZ[0] === 125 && I.CONTOUR_HZ[15] === 4000);
assert('轮廓 500 Hz 处为 0 dB', I.CONTOUR_REL[I.CONTOUR_HZ.indexOf(500)] === 0);
assert('轮廓高频端 +9 dB（4000 Hz）', I.CONTOUR_REL[15] === 9);
assert('材料库完整', I.MATERIALS.length >= 8 && I.MATERIALS.every(function (m) {
  return m.id && m.name && m.density > 0 && m.cL > 0;
}));

console.log('面密度与质量定律');
approx('石膏板 12 mm 面密度 = 9.6 kg/m²', I.faceMass('gypsum', 12), 9.6, 1e-9);
approx('混凝土 200 mm 面密度 = 480 kg/m²', I.faceMass('concrete', 200), 480, 1e-9);
assert('未知材料 → null', I.faceMass('nope', 10) === null);
assert('厚度为负 → null', I.faceMass('gypsum', -5) === null);
approx('质量定律 m=10 kg/m², f=500 Hz → 25.98 dB', I.massLaw(10, 500), 20 * Math.log10(5000) - 48, 1e-9);
approx('质量定律 m=50 kg/m², f=1 kHz → 45.98 dB', I.massLaw(50, 1000), 20 * Math.log10(50000) - 48, 1e-9);
approx('频率加倍 → 增加 6 dB', I.massLaw(10, 1000) - I.massLaw(10, 500), 6.0206, 0.001);
approx('面密度加倍 → 增加 6 dB', I.massLaw(20, 500) - I.massLaw(10, 500), 6.0206, 0.001);

console.log('吻合频率');
approx('6 mm 玻璃 fc ≈ 2179 Hz', I.coincidence('glass', 6), 343 * 343 / (1.8 * 5000 * 0.006), 1);
assert('吻合频率随厚度反比下降', I.coincidence('glass', 12) < I.coincidence('glass', 6));
assert('未知材料 → null', I.coincidence('nope', 6) === null);

console.log('STC 评级（ASTM E413）');
var flat50 = [];
for (var i = 0; i < 16; i++) flat50.push(50);
var stc50 = I.stc(flat50);
assert('平直 50 dB → STC 48', stc50.ok === true && stc50.value === 48);
assert('标号格式 STC-48', stc50.designation === 'STC-48');
assert('缺量之和 ≤ 32', stc50.sumDeficiency <= 32);
assert('单带最大缺量 ≤ 8', stc50.maxDeficiency <= 8);
assert('缺量为非负数组（16 项）', stc50.deficiencies.length === 16 && stc50.deficiencies.every(function (d) { return d >= 0; }));
assert('缺 1 个频带 → 报错', I.stc(flat50.slice(0, 15)).ok === false);
assert('含空值 → 报错', I.stc(flat50.map(function (v, idx) { return idx === 3 ? null : v; })).ok === false);

var mass20 = I.fromMass({ mass: 20 });
assert('质量定律 m=20 → STC 36', mass20.ok === true && mass20.stcValue === 36);
assert('质量定律谱 17 带（100–4000 Hz）', mass20.levels.length === 17 && mass20.bands[0] === 100 && mass20.bands[16] === 4000);
assert('低频隔声量最低', mass20.levels[0] < mass20.levels[16]);
assert('面密度加倍 → STC 提升约 6', I.fromMass({ mass: 40 }).stcValue >= mass20.stcValue + 6);
assert('面密度缺失 → 报错', I.fromMass({}).ok === false);

var fromLevels = I.fromLevels([20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50]);
assert('由实测值评级成功（16 带 125–4000 → 仅 STC）', fromLevels.ok === true && fromLevels.stcValue > 20);
assert('16 带缺 100 Hz → 国标 Rw 不可算并给出提示', fromLevels.rw.ok === false && /100–3150/.test(fromLevels.rw.error));

console.log('双层构件估算与吻合频率联动');
var dbl = I.doubleLeaf({ mass1: 10, mass2: 10, cavity: 100 });
assert('双层构件评级成功', dbl.ok === true);
assert('双层构件优于同等总面密度单层', dbl.stcValue > I.fromMass({ mass: 20 }).stcValue);
assert('空腔越大越有利', I.doubleLeaf({ mass1: 10, mass2: 10, cavity: 200 }).stcValue >= dbl.stcValue);
assert('缺面密度 → 报错', I.doubleLeaf({ mass1: 10 }).ok === false);
var withCo = I.fromMass({ mass: I.faceMass('glass', 6), materialId: 'glass', thickness: 6 });
assert('面密度估算时可给出吻合频率', withCo.coincidence > 1000);

/* =======================================================================
 * GB/T 50121-2005 计权隔声量 Rw 与频谱修正量 C / Ctr
 * ======================================================================= */
console.log('国标频带表与基准曲线（表 3.1.2）');
assert('1/3 倍频程基准值 16 带 100–3150 Hz', I.GB_HZ.length === 16 && I.GB_HZ[0] === 100 && I.GB_HZ[15] === 3150);
assert('基准值表与 GB/T 50121 表 3.1.2 数值一致',
  I.GB_REF_REL.join(',') === '-19,-16,-13,-10,-7,-4,-1,0,1,2,3,4,4,4,4,4');
assert('500 Hz 处基准值为 0 dB', I.GB_REF_REL[I.GB_HZ.indexOf(500)] === 0);
assert('高频端基准值收敛于 +4 dB（与 STC 轮廓持续上升不同）',
  I.GB_REF_REL[11] === 4 && I.GB_REF_REL[15] === 4 && I.CONTOUR_REL[15] === 9);
assert('倍频程基准值 5 带 125–2000 Hz', I.GB_OCT_REF_REL.join(',') === '-16,-7,0,3,4');

console.log('频谱修正量用的 A 计权频谱（表 3.1.3）');
function energyDb(spec) {
  var s = 0;
  for (var i = 0; i < spec.length; i++) s += Math.pow(10, spec[i] / 10);
  return 10 * Math.log10(s);
}
approx('频谱 1（粉红噪声）总级归一化到 0 dB', energyDb(I.SPECTRUM_C_TERZ), 0, 0.1);
approx('频谱 2（交通噪声）总级归一化到 0 dB', energyDb(I.SPECTRUM_CTR_TERZ), 0, 0.1);

console.log('Rw 评级（GB/T 50121-2005）');
// 参考曲线形：R = 40 + Ki → 100–3150 全带不利偏差均为 2 dB，恰好用满 32 dB 限值
var refShaped = I.GB_REF_REL.map(function (k) { return 40 + k; });
var rr = I.gbRw(refShaped);
assert('参考曲线形 → Rw = 500 Hz 值 + 2 = 42', rr.ok === true && rr.value === 42);
approx('参考曲线形 C = -10lgΣ10^((Li-Ki)/10) ≈ -1.93', rr.C, -1.9288, 0.01);
approx('参考曲线形 Ctr ≈ -6.02', rr.Ctr, -6.0155, 0.01);
approx('不利偏差之和恰为限值 32 dB', rr.sumDeficiency, 32, 1e-9);
assert('国标不设 8 dB 单带限值（最大偏差仅 2 dB）', rr.maxDeviation === 2 && rr.limit === 32);

var flat = [];
for (var j = 0; j < 16; j++) flat.push(50);
var rf = I.gbRw(flat);
assert('平直 50 dB → Rw = 50', rf.ok === true && rf.value === 50);
approx('平直曲线 C ≈ 0（频谱已归一化）', rf.C, 0, 0.05);
approx('平直曲线 Ctr ≈ 0', rf.Ctr, 0, 0.05);
assert('平直曲线 C / Ctr 修约为 0', rf.c === 0 && rf.ctr === 0);

var m20rw = I.fromMass({ mass: 20 }).rw;
assert('质量定律 m=20 → Rw = 36', m20rw.ok === true && m20rw.value === 36);
assert('标准表述格式 Rw(C; Ctr)', m20rw.notation === 'Rw(C; Ctr) = 36(-1; -5) dB');
assert('Rw + C / Rw + Ctr 使用修约后整数', m20rw.rwPlusC === 36 + m20rw.c && m20rw.rwPlusCtr === 36 + m20rw.ctr);
assert('C 与 Ctr 均已修约为整数', Number.isInteger(m20rw.c) && Number.isInteger(m20rw.ctr));

var oct = I.gbRw([30, 40, 45, 48, 50], I.GB_OCT_HZ);
assert('倍频程 5 带可评级（限值 10 dB）', oct.ok === true && oct.limit === 10 && oct.value === 47);
assert('倍频程缺带 → 报错', I.gbRw([30, 40, 45], I.GB_OCT_HZ).ok === false);
assert('频带数不符 → 报错', I.gbRw([1, 2, 3, 4]).ok === false);
assert('含空值 → 报错', I.gbRw(flat.map(function (v, i) { return i === 5 ? null : v; })).ok === false);

console.log('国标限值对照（GB 50118-2010 / GB 55038-2025）');
var heavy = I.fromMass({ mass: I.faceMass('concrete', 200) }).rw;
var chkHeavy = I.checkRequirement(heavy, 'dwell-partition');
assert('200 mm 混凝土 → Rw 64', heavy.value === 64);
assert('混凝土分户墙满足 Rw+C ≥ 45 并给出余量', chkHeavy.pass === true && chkHeavy.value === heavy.rwPlusC && chkHeavy.margin === chkHeavy.value - 45);
var weak = I.checkRequirement(m20rw, 'dwell-partition');
assert('m=20 轻质墙不满足分户墙要求', weak.pass === false && weak.margin < 0);
assert('给出达限所需 Rw（限值 − C）', weak.needRw === 45 - m20rw.c);
var chkWin = I.checkRequirement(heavy, 'dwell-window-street');
assert('外门窗类限值使用 Rw + Ctr 判定', chkWin.metric === 'Rw + Ctr' && chkWin.value === heavy.value + heavy.ctr);
assert('未知限值条目 → null', I.checkRequirement(heavy, 'nope') === null);
assert('限值条目数量与字段完整', I.GB_REQUIREMENTS.length >= 12 && I.GB_REQUIREMENTS.every(function (r) {
  return r.id && r.name && r.group && (r.metric === 'C' || r.metric === 'Ctr') && r.limit > 0;
}));

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
