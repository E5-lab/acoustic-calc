/*
 * vibration.test.js — 弹簧减振器隔振效率内核验证（node tests/vibration.test.js）
 */
var V = require('../public/js/vibration.js');

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

console.log('常量与单位换算');
approx('频率系数 K_FREQ = √g/2π ≈ 4.984', V.K_FREQ, 4.9840, 0.0005);
approx('δ(mm) 系数 = √10·K_FREQ ≈ 15.761', V.DEFLECT_COEF, 15.7609, 0.001);
approx('kg/mm 自换', V.toKgPerMm(3, 'kg/mm'), 3, 1e-9);
approx('30 kg/cm = 3 kg/mm', V.toKgPerMm(30, 'kg/cm'), 3, 1e-9);
approx('1 N/mm = 0.101972 kg/mm', V.toKgPerMm(1, 'N/mm'), 0.101972, 1e-6);
approx('1 kN/mm = 101.972 kg/mm', V.toKgPerMm(1, 'kN/mm'), 101.9716, 0.001);
approx('3 kg/mm = 29.42 N/mm', V.fromKgPerMm(3, 'N/mm'), 29.4199, 0.001);
assert('未知单位按 kg/mm 处理', V.toKgPerMm(5, 'xx') === 5);

console.log('扰动频率与静态压缩量');
approx('1450 r/min → 24.167 Hz', V.disturbFrequency(1450), 24.1667, 0.001);
assert('转速为 0 → null', V.disturbFrequency(0) === null && V.disturbFrequency(null) === null);
approx('δ = 76/3 = 25.333 mm', V.staticDeflection(76, 3), 25.3333, 0.001);
assert('δ 参数非法 → null', V.staticDeflection(0, 3) === null && V.staticDeflection(76, 0) === null);

console.log('固有频率（静变形法）');
approx('δ=25.35 mm、d=1 → f₀ 3.129 Hz', V.naturalFrequency(25.35, 1), 3.1292, 0.002);
approx('δ=10 mm、d=1 → f₀ 4.984 Hz（≈5/√1）', V.naturalFrequency(10, 1), 4.9840, 0.001);
approx('δ=10 mm、d=2（橡胶）→ f₀ 7.048 Hz', V.naturalFrequency(10, 2), 7.0485, 0.002);
approx('动刚度法核对 f₀ = 4.9823·√(30/76.05)', V.naturalFrequency(25.35, 1), V.K_FREQ * Math.sqrt(30 / 76.05), 1e-9);
approx('反算 δ(f₀=3.13, d=1) = 25.36', V.deflectionForFrequency(3.13, 1), 25.3555, 0.01);
approx('反算往返一致（d=2）', V.naturalFrequency(V.deflectionForFrequency(5, 2), 2), 5, 1e-9);
approx('动刚度 3 kg/mm、d=1 → 30 kg/cm', V.dynamicStiffness(3, 1), 30, 1e-9);
approx('动刚度 3 kg/mm、d=2 → 60 kg/cm', V.dynamicStiffness(3, 2), 60, 1e-9);
assert('δ ≤ 0 → null', V.naturalFrequency(0, 1) === null);
assert('f₀ 非法 → null', V.deflectionForFrequency(0, 1) === null);

console.log('传递率（方法二：频率比法）');
approx('z=2 无阻尼 T = 1/3', V.transmissibilityUndamped(2), 0.33333, 1e-5);
approx('z=2 含阻尼 D=0.05 T = 0.3392', V.transmissibility(2, 0.05), 0.339182, 1e-5);
approx('z=3 无阻尼 T = 0.125', V.transmissibilityUndamped(3), 0.125, 1e-9);
approx('z=4 无阻尼 T = 0.0667（≈93% 效率）', V.transmissibilityUndamped(4), 0.06667, 1e-4);
approx('z=5 无阻尼 T = 0.0417（≈96% 效率）', V.transmissibilityUndamped(5), 0.041667, 1e-5);
approx('z=√2 无阻尼 T = 1（临界）', V.transmissibilityUndamped(Math.SQRT2), 1, 1e-9);
assert('z=1 无阻尼返回 Infinity（共振）', V.transmissibilityUndamped(1) === Infinity);
approx('z=1、D=0.05 峰值 T = √101 = 10.0499', V.transmissibility(1, 0.05), 10.0499, 0.001);
approx('峰值公式与直接计算一致', V.peakTransmissibility(0.05), V.transmissibility(1, 0.05), 1e-9);
assert('无阻尼峰值 = ∞', V.peakTransmissibility(0) === Infinity);
assert('峰值随阻尼增大而下降', V.peakTransmissibility(0.05) > V.peakTransmissibility(0.12));
approx('D=0 时有阻尼式退化为无阻尼式（z=3）', V.transmissibility(3, 0), 0.125, 1e-9);
approx('z<1 时传递率大于 1（放大）z=0.5 → 1.333', V.transmissibilityUndamped(0.5), 1.33333, 1e-5);
assert('文献核对：z=2.5 → T=0.1905', Math.abs(V.transmissibilityUndamped(2.5) - 0.190476) < 1e-5);
assert('文献核对：z=6 → T=0.0286（97.1%）', Math.abs(V.transmissibilityUndamped(6) - 0.0285714) < 1e-6);
assert('z 非法 → null', V.transmissibility(0, 0.05) === null && V.transmissibility(null, 0) === null);

console.log('隔振效率与降低量');
approx('T=0.01705 → η = 98.295%', V.efficiency(0.017052), 98.2948, 0.002);
approx('T=0.125 → η = 87.5%', V.efficiency(0.125), 87.5, 1e-9);
approx('T=1 → η = 0%', V.efficiency(1), 0, 1e-9);
approx('T=1.5（放大）→ η = −50%', V.efficiency(1.5), -50, 1e-9);
approx('T=0.01 → 降低量 40 dB', V.insertionLoss(0.01), 40, 1e-9);
approx('T=0.001 → 降低量 60 dB', V.insertionLoss(0.001), 60, 1e-9);
approx('T=0.1 → 降低量 20 dB', V.insertionLoss(0.1), 20, 1e-9);
approx('例题 T=0.017052 → 降低量 35.4 dB', V.insertionLoss(0.017052), 35.3642, 0.002);
assert('T ≤ 0 → 降低量 null', V.insertionLoss(0) === null && V.insertionLoss(-1) === null);
approx('效率与降低量互检：η=90% → T=0.1 → 20 dB', V.insertionLoss(1 - 0.9), 20, 1e-9);

console.log('判定准则');
assert('z=0.8 → 共振放大区', V.ratioGuide(0.8).level === 'danger' && /共振/.test(V.ratioGuide(0.8).title));
assert('z=1.2 → 仍有放大（禁用）', V.ratioGuide(1.2).level === 'danger');
assert('z=2.0 → 有效果但不推荐', V.ratioGuide(2.0).level === 'warn');
assert('z=3.0 → 宜用区间', V.ratioGuide(3.0).level === 'ok');
assert('z=2.5 为推荐区间下边界', V.ratioGuide(2.5).level === 'ok');
assert('z=4 仍在推荐区间（含上界）', V.ratioGuide(4).level === 'ok');
assert('z=4.1 → 效率很高', V.ratioGuide(4.1).level === 'good');
assert('z=12 → 效率很高', V.ratioGuide(12).level === 'good');
assert('效率等级 96% → 优', V.efficiencyGrade(96).label === '优');
assert('效率等级 92% → 良', V.efficiencyGrade(92).label === '良');
assert('效率等级 85% → 合格', V.efficiencyGrade(85).label === '合格');
assert('效率等级 70% → 不足', V.efficiencyGrade(70).label === '不足');
assert('效率等级 90% 为良的边界', V.efficiencyGrade(90).label === '良');
assert('判定表按范围升序排列', V.RATIO_GUIDE.every(function (g, i, a) { return i === 0 || g.from === a[i - 1].to; }));

console.log('方法一：静变形法完整计算书（工程例题核对）');
var a = V.analyze({
  deviceWeight: 234, baseWeight: 0, safety: 1.3, count: 4,
  rpm: 1450, stiffness: 3, stiffnessUnit: 'kg/mm', dynamicFactor: 1, damping: 0.05
});
assert('计算成功', a.ok === true);
approx('运行重量 W = 234×1.3 = 304.2 kg', a.totalWeight, 304.2, 1e-9);
approx('每只承载 P = 304.2/4 = 76.05 kg', a.unitLoad, 76.05, 1e-9);
approx('静态压缩量 δ = 76.05/3 = 25.35 mm', a.deflection, 25.35, 0.001);
approx('固有频率 f₀ = 3.129 Hz（样本值 3.13）', a.f0, 3.1292, 0.002);
approx('扰动频率 f = 24.17 Hz', a.freq, 24.1667, 0.001);
approx('频率比 z = 7.723', a.z, 7.723, 0.005);
approx('无阻尼传递率 T₀ = 0.017065', a.TUndamped, 0.0170647, 1e-6);
approx('隔振效率（无阻尼式）= 98.29%', a.efficiencyUndamped, 98.2935, 0.005);
approx('含阻尼（D=0.05）传递率 T = 0.021556', a.T, 0.0215565, 1e-6);
approx('隔振效率（含阻尼）= 97.84%', a.efficiency, 97.8444, 0.005);
approx('振动级降低量（含阻尼）= 33.33 dB', a.lossDb, 33.3284, 0.005);
approx('振动级降低量（无阻尼）= 35.36 dB', V.insertionLoss(a.TUndamped), 35.3580, 0.005);
assert('例题效率约 98.3%，与样本一致', Math.round(a.efficiencyUndamped * 10) / 10 === 98.3);
assert('频率比判定为宜用区间以上', a.guide.level === 'good');
assert('效率等级为优', a.grade.label === '优');
assert('计算书共 12 步', a.steps.length === 12);
assert('第 1 步为题设运行重量', a.steps[0].value === 304.2 && a.steps[0].unit === 'kg');
assert('第 4 步为静态压缩量', a.steps[3].value === 25.35 && a.steps[3].unit === 'mm');
assert('第 6 步为固有频率', a.steps[5].value === 3.13 && a.steps[5].unit === 'Hz');
assert('第 8 步为频率比', a.steps[7].value === 7.72);
assert('第 10 步为隔振效率', a.steps[9].value === 97.84 && a.steps[9].unit === '%');
assert('每步均含公式与代入过程', a.steps.every(function (s) {
  return !!s.formula && !!s.subst && s.value != null && !!s.note;
}));
assert('步骤序号连续', a.steps.every(function (s, i) { return s.no === i + 1; }));
assert('无放大警告', !a.warnings.some(function (w) { return /放大作用/.test(w.text); }));

console.log('方法一：参数变化的方向性');
var soft = V.analyze({ deviceWeight: 1000, count: 4, rpm: 1450, stiffness: 10, damping: 0 });
var hard = V.analyze({ deviceWeight: 1000, count: 4, rpm: 1450, stiffness: 60, damping: 0 });
assert('刚度越小 → 静变形越大', soft.deflection > hard.deflection);
assert('刚度越小 → 固有频率越低', soft.f0 < hard.f0);
assert('刚度越小 → 频率比越大', soft.z > hard.z);
assert('刚度越小 → 效率越高', soft.efficiency > hard.efficiency);
var heavy = V.analyze({ deviceWeight: 2000, count: 4, rpm: 1450, stiffness: 10, damping: 0 });
assert('增加配重（荷载）→ 静变形增大、固有频率降低', heavy.deflection > soft.deflection && heavy.f0 < soft.f0);
var slow = V.analyze({ deviceWeight: 1000, count: 4, rpm: 600, stiffness: 10, damping: 0 });
assert('扰动频率降低 → 频率比与效率下降', slow.z < soft.z && slow.efficiency < soft.efficiency);
var many = V.analyze({ deviceWeight: 1000, count: 8, rpm: 1450, stiffness: 10, damping: 0 });
assert('支承点增多 → 每只荷载减半、静变形减半', Math.abs(many.deflection - soft.deflection / 2) < 1e-9);

console.log('方法一：安全系数、动态系数与警告');
var k13 = V.analyze({ deviceWeight: 300, count: 4, rpm: 1450, stiffness: 3, safety: 1.3, damping: 0 });
var k10 = V.analyze({ deviceWeight: 300, count: 4, rpm: 1450, stiffness: 3, safety: 1, damping: 0 });
approx('安全系数 1.3 使运行重量为 390 kg', k13.totalWeight, 390, 1e-9);
approx('安全系数 1 使运行重量为 300 kg', k10.totalWeight, 300, 1e-9);
assert('安全系数放大静态压缩量与效率', k13.deflection > k10.deflection && k13.efficiency > k10.efficiency);
var rb = V.analyze({ deviceWeight: 300, count: 4, rpm: 1450, stiffness: 3, dynamicFactor: 2, damping: 0 });
var sp = V.analyze({ deviceWeight: 300, count: 4, rpm: 1450, stiffness: 3, dynamicFactor: 1, damping: 0 });
assert('橡胶（d=2）固有频率高于弹簧（d=1）', rb.f0 > sp.f0);
assert('橡胶（d=2）隔振效率低于弹簧（d=1）', rb.efficiency < sp.efficiency);
assert('橡胶动刚度为静刚度的 2 倍关系', Math.abs(rb.dynamicStiffness / sp.dynamicStiffness - 2) < 1e-9);

var bad = V.analyze({ deviceWeight: 500, count: 4, rpm: 1000, stiffness: 400, damping: 0 });
assert('警告条目均含文本与级别', bad.warnings.every(function (w) { return !!w.level && !!w.text; }));
assert('刚度过大导致共振/放大 → 触发危险警告', bad.warnings.some(function (w) { return w.level === 'danger'; }));
assert('放大时传递率大于 1', bad.T > 1);
assert('共振区效率为负', bad.efficiency < 0);
var tooSoft = V.analyze({ deviceWeight: 500, count: 4, rpm: 2800, stiffness: 0.8, damping: 0 });
assert('静变形过大 → 提示稳定性', tooSoft.deflection > 40 && tooSoft.warnings.some(function (w) { return /稳定性|偏大/.test(w.text); }));
var overload = V.analyze({ deviceWeight: 900, count: 4, rpm: 1450, stiffness: 3, ratedLoad: 100, damping: 0 });
assert('超载 → 危险警告', overload.warnings.some(function (w) { return w.level === 'danger' && /超载|超过/.test(w.text); }));
var under = V.analyze({ deviceWeight: 120, count: 4, rpm: 1450, stiffness: 3, ratedLoad: 400, damping: 0 });
assert('荷载利用率过低 → 选型偏大提示', under.warnings.some(function (w) { return /选型偏大/.test(w.text); }));
var fit = V.analyze({ deviceWeight: 320, count: 4, rpm: 1450, stiffness: 3, ratedLoad: 100, damping: 0 });
assert('荷载利用率合理 → 给出 ok 提示', fit.warnings.some(function (w) { return w.level === 'ok' && /荷载利用率/.test(w.text); }));
assert('未给阻尼比时提示取 0.05 ~ 0.12', V.analyze({
  deviceWeight: 300, count: 4, rpm: 1450, stiffness: 3
}).warnings.some(function (w) { return /0\.05 ~ 0\.12/.test(w.text); }));
assert('阻尼比非 0 时不再提示', !a.warnings.some(function (w) { return /按无阻尼计算/.test(w.text); }));

console.log('方法一：错误处理与等价性');
assert('缺设备自重 → 报错', V.analyze({ count: 4, rpm: 1450, stiffness: 3 }).ok === false);
assert('缺刚度 → 报错', V.analyze({ deviceWeight: 300, count: 4, rpm: 1450 }).ok === false);
assert('缺转速与频率 → 报错', V.analyze({ deviceWeight: 300, count: 4, stiffness: 3 }).ok === false);
assert('设备自重 ≤ 0 → 报错', V.analyze({ deviceWeight: 0, count: 4, rpm: 1450, stiffness: 3 }).ok === false);
assert('可直接输入扰动频率替代转速', V.analyze({ deviceWeight: 300, count: 4, freq: 24.17, stiffness: 3 }).ok === true);
assert('数量缺失按 1 只计', V.analyze({ deviceWeight: 300, rpm: 1450, stiffness: 3 }).unitLoad === 300);
assert('数量取整', V.analyze({ deviceWeight: 300, count: 3.6, rpm: 1450, stiffness: 3 }).count === 4);
assert('静变形法与频率比法结果一致',
  Math.abs(V.byRatio({ freq: a.freq, f0: a.f0, damping: 0.05 }).T - a.T) < 1e-12);
assert('可仅由静变形换算固有频率', Math.abs(V.byRatio({ freq: 24.17, deflection: 25.35 }).f0 - 3.1292) < 0.002);

console.log('方法二：频率比法验算');
var br = V.byRatio({ freq: 25, f0: 5, damping: 0.05 });
assert('验算成功', br.ok === true);
approx('z = 5', br.z, 5, 1e-9);
approx('含阻尼 T = 0.046575', br.T, 0.0465746, 1e-6);
approx('无阻尼 T = 0.041667', br.TUndamped, 0.041667, 1e-6);
approx('效率（含阻尼）= 95.34%，低于无阻尼式（阻尼在高频段略不利）', br.efficiency, 95.3425, 0.005);
approx('效率（无阻尼）= 95.83%', br.efficiencyUndamped, 95.8333, 0.005);
approx('降低量（含阻尼）= 26.64 dB', br.lossDb, 26.6370, 0.005);
approx('共振峰值 T = 10.05', br.peakT, 10.0499, 0.001);
assert('判定为宜用区间以上', br.guide.level === 'good');
assert('缺 f → 报错', V.byRatio({ f0: 5 }).ok === false);
assert('缺 f₀ 与 δ → 报错', V.byRatio({ freq: 25 }).ok === false);
assert('阻尼缺失按 0 处理', V.byRatio({ freq: 25, f0: 5 }).damping === 0);
assert('由 δ 反推 f₀ 后与直接输入等价',
  Math.abs(V.byRatio({ freq: 25, deflection: 10 }).T - V.byRatio({ freq: 25, f0: V.K_FREQ }).T) < 1e-9);

console.log('目标效率反算');
var r90 = V.requiredRatio(90, 0);
approx('无阻尼、η=90% → z = √11 = 3.3166', r90.z, 3.31662, 1e-5);
approx('无阻尼、η=95% → z = √21 = 4.5826', V.requiredRatio(95, 0).z, 4.58258, 1e-5);
approx('无阻尼、η=98% → z = √51 = 7.1414', V.requiredRatio(98, 0).z, 7.14143, 1e-5);
approx('含阻尼 D=0.05、η=90% → z ≈ 3.40', V.requiredRatio(90, 0.05).z, 3.3997, 0.005);
assert('含阻尼所需频率比大于无阻尼（高频段阻尼反而不利）', V.requiredRatio(90, 0.05).z > r90.z);
assert('无阻尼解标记为解析解', r90.exact === true && V.requiredRatio(90, 0.05).exact === false);
assert('目标 100% → 报错', V.requiredRatio(100, 0).ok === false);
assert('目标 0% → 报错', V.requiredRatio(0, 0).ok === false);
assert('目标缺失 → 报错', V.requiredRatio(null, 0).ok === false);
var back = V.requiredRatio(92, 0.05);
assert('反算频率比回代后效率吻合', Math.abs(V.efficiency(V.transmissibility(back.z, 0.05)) - 92) < 0.01);

var rev = V.reverse({ targetEfficiency: 90, freq: 25, damping: 0, loadKg: 76, dynamicFactor: 1 });
assert('反算成功', rev.ok === true);
approx('所需固有频率 f₀ = 25/3.3166 = 7.538 Hz', rev.f0, 7.5377, 0.005);
approx('所需静态压缩量 δ = 4.37 mm', rev.deflection, 4.3689, 0.005);
approx('单只最大允许刚度 = 76/4.3719 = 17.38 kg/mm', rev.maxStiffnessKgPerMm, 17.3836, 0.01);
approx('按 kg/mm 单位回显一致', rev.maxStiffness, 17.3836, 0.01);
assert('工程可行', rev.feasible === true);
assert('给出所需频率比的说明文本', /所需频率比/.test(rev.note));
var revN = V.reverse({ targetEfficiency: 90, freq: 25, damping: 0, loadKg: 500, dynamicFactor: 1 });
approx('承载 500 kg 时单只刚度上限提高到 114.4 kg/mm', revN.maxStiffnessKgPerMm, 500 / rev.deflection, 0.01);
var revH = V.reverse({ targetEfficiency: 99.5, freq: 10, damping: 0 });
assert('极高目标效率 → 判定不可行', revH.feasible === false && /难以实现/.test(revH.note));
assert('缺扰动频率 → 报错', V.reverse({ targetEfficiency: 90 }).ok === false);
assert('反算可换算刚度单位', Math.abs(V.reverse({
  targetEfficiency: 90, freq: 25, damping: 0, loadKg: 76, stiffnessUnit: 'N/mm'
}).maxStiffness - 17.3836 * 9.80665) < 0.1);

console.log('效率–频率比–静变形对照表');
var tb = V.efficiencyTable({ freq: 24.17, damping: 0, loadKg: 76, dynamicFactor: 1, targets: [80, 90, 95, 98] });
assert('对照表返回 4 行', tb.length === 4);
assert('效率目标递增', tb[0].target < tb[1].target && tb[1].target < tb[2].target);
assert('效率越高 → 所需频率比越大', tb.every(function (r, i, arr) { return i === 0 || r.z > arr[i - 1].z; }));
assert('效率越高 → 所需固有频率越低', tb.every(function (r, i, arr) { return i === 0 || r.f0 < arr[i - 1].f0; }));
assert('效率越高 → 所需静态压缩量越大', tb.every(function (r, i, arr) { return i === 0 || r.deflection > arr[i - 1].deflection; }));
assert('效率越高 → 单只最大允许刚度越小', tb.every(function (r, i, arr) { return i === 0 || r.maxStiffnessKgPerMm < arr[i - 1].maxStiffnessKgPerMm; }));
assert('η=80% 对应的频率比约 2.24', Math.abs(tb[0].z - Math.sqrt(1 + 1 / 0.2)) < 1e-6);
assert('缺频率时返回空表', V.efficiencyTable({ damping: 0 }).length === 0);

console.log('传递率曲线');
var c = V.curve(8, 0.05, 100);
assert('曲线为 101 点', c.length === 101);
assert('起点 z ≈ 0.05', Math.abs(c[0].z - 0.05) < 1e-9);
assert('终点 z = 8', Math.abs(c[c.length - 1].z - 8) < 1e-9);
assert('z 单调递增', c.every(function (p, i) { return i === 0 || p.z > c[i - 1].z; }));
assert('无阻尼曲线在 z→1 附近出现极大值（>100）', c.some(function (p) { return p.TUndamped > 100; }));
assert('含阻尼曲线处处有限', c.every(function (p) { return isFinite(p.T); }));
assert('含阻尼曲线在 z<1 段存在放大（T>1）', c.some(function (p) { return p.z < 1 && p.T > 1; }));
assert('z>√2 段无阻尼传递率单调下降', (function () {
  var seg = c.filter(function (p) { return p.z > Math.SQRT2 + 0.05; });
  return seg.every(function (p, i) { return i === 0 || p.TUndamped < seg[i - 1].TUndamped; });
})());
assert('效率曲线在 z<1 段为负（放大），末点接近 100%', c[c.length - 1].efficiency > 97 && c[0].efficiency < 0);
assert('曲线点数参数有效', V.curve(4, 0, 20).length === 21);

console.log('数值稳健性');
assert('字符串参数可解析', V.analyze({ deviceWeight: '234', count: '4', rpm: '1450', stiffness: '3' }).ok === true);
approx('字符串输入结果与数值输入一致', V.analyze({
  deviceWeight: '234', count: '4', rpm: '1450', stiffness: '3', safety: '1.3'
}).efficiencyUndamped, a.efficiencyUndamped, 1e-9);
assert('忽略空值（不误判为 0）', V.naturalFrequency(null) === null);
assert('round 保留指定小数', V.round(3.12924, 2) === 3.13 && V.round(null) === null);
assert('阻尼 > 0.12 仍可计算（仅提示）', V.byRatio({ freq: 25, f0: 5, damping: 0.3 }).ok === true);
assert('极大刚度不产生 NaN', isFinite(V.analyze({ deviceWeight: 10, count: 1, rpm: 3000, stiffness: 5000 }).f0));

console.log('厂家计算书复核 (verifySheet)');
var a = V.analyze({ deviceWeight: 234, baseWeight: 0, safety: 1.3, count: 4, rpm: 1450, stiffness: 3, stiffnessUnit: 'kg/mm', dynamicFactor: 1, damping: 0 });
var rv = V.verifySheet({ deviceWeight: 234, safety: 1.3, count: 4, rpm: 1450, stiffness: 3, stiffnessUnit: 'kg/mm' });
approx('复核：Wd = 234×1.3 = 304.2', rv.Wd, 304.2, 1e-9);
approx('复核：W = 304.2/4 = 76.05', rv.W, 76.05, 1e-9);
approx('复核：δ = 76.05/3 = 25.35 mm', rv.delta, 25.35, 0.001);
approx('复核：fn = 947√(1/δ) = ' + rv.fnCpm.toFixed(2) + ' cpm', rv.fnCpm, 947 * Math.sqrt(1 / 25.35), 1e-9);
approx('复核：z = 1450/fn ≈ ' + rv.z.toFixed(3), rv.z, 1450 / rv.fnCpm, 1e-9);
approx('复核：η ≈ ' + rv.efficiency.toFixed(2) + ' %', rv.efficiency, (1 - 1 / Math.abs(1 - rv.z * rv.z)) * 100, 1e-9);
assert('复核：未提供声称值时全部为待比对 (provided=false)', rv.rows.every(function (r) { return r.check.provided === false; }));
assert('复核：本工具精算的 δ 与标准公式重算完全一致（不涉及频率常数）', Math.abs(rv.internalDelta - rv.delta) < 1e-6);
assert('复核：本工具精算 η 与标准公式重算相差 < 0.05%（仅因 947 取整常数）', Math.abs(rv.internalEff - rv.efficiency) < 0.05);
// 厂家声称值与实际重算一致 → 应判 一致
var rv2 = V.verifySheet({ deviceWeight: 234, safety: 1.3, count: 4, rpm: 1450, stiffness: 3, claimedDeflection: 25.35, claimedFnCpm: rv.fnCpm, claimedEfficiency: rv.efficiency });
assert('复核：声称值与重算一致 → allConsistent=true', rv2.allConsistent === true && rv2.mismatchCount === 0);
// 厂家声称值明显错误 → 应判 偏差 (danger)
var rv3 = V.verifySheet({ deviceWeight: 234, safety: 1.3, count: 4, rpm: 1450, stiffness: 3, claimedEfficiency: 50 });
assert('复核：声称 η=50% 与重算不符 → mismatchCount=1、状态 danger', rv3.mismatchCount === 1 && rv3.rows[2].check.status === 'danger');
// 轻微偏差 → warn
var rv4 = V.verifySheet({ deviceWeight: 234, safety: 1.3, count: 4, rpm: 1450, stiffness: 3, claimedDeflection: 25.5 });
assert('复核：δ 偏差 0.15mm (<0.5) → 判一致 ok', rv4.rows[0].check.status === 'ok');
assert('复核：缺输入报错', V.verifySheet({}).ok === false);

console.log('环新式隔振降噪计算书复核 (hxSheet)');
// 例题对齐厂家计算书：冷冻机组 10000 kg / 2900 r/min / 8 只 / δ=50mm / D=0.065
var hx = V.hxSheet({ deviceWeight: 10000, pedestalWeight: 0, safetyPercent: 20, count: 8, rpm: 2900, deflection: 50, damping: 0.065 });
approx('环新：Wd = 10000×1.2 = 12000 kg', hx.Wd, 12000, 1e-9);
approx('环新：W = 12000/8 = 1500 kg/只', hx.W, 1500, 1e-9);
approx('环新：f = 2900/60 = 48.33 Hz', hx.f, 2900 / 60, 1e-9);
approx('环新：f₀ = (1/2π)√(9800/50) ≈ 2.23 Hz', hx.f0, Math.sqrt(9800 / 50) / (2 * Math.PI), 1e-9);
approx('环新：λ = f/f₀ ≈ 21.7', hx.lambda, (2900 / 60) / (Math.sqrt(9800 / 50) / (2 * Math.PI)), 1e-9);
approx('环新：η（含阻尼 D=0.065）≈ ' + hx.eta.toFixed(4), hx.eta, V.transmissibility(hx.lambda, 0.065), 1e-12);
assert('环新：η 在 0.005 ~ 0.01 之间（厂家取整为 0.01 偏保守）', hx.eta > 0.005 && hx.eta < 0.01);
approx('环新：T = (1−η)×100% ≈ 99.4 %', hx.T, (1 - hx.eta) * 100, 1e-9);
approx('环新：N = 12.5lg(1/η) ≈ ' + hx.N.toFixed(1) + ' dB', hx.N, 12.5 * Math.log10(1 / hx.eta), 1e-9);
assert('环新：λ ≥ 2.5 → 结论达标', hx.steps[hx.steps.length - 1].value === 1);
assert('环新：精算 f₀ 与厂家常数差异 < 0.04%', Math.abs(hx.internalF0 - hx.f0) / hx.f0 < 0.0004);
// δ 由刚度反算的路径
var hx2 = V.hxSheet({ deviceWeight: 10000, count: 8, rpm: 2900, stiffness: 30, stiffnessUnit: 'kg/mm', damping: 0.065 });
approx('环新：δ = 1500/30 = 50 mm（由 K 反算）', hx2.delta, 50, 1e-9);
assert('环新：deltaFromK=true', hx2.deltaFromK === true);
// 声称值比对：厂家 η=0.01、N=25dB 与精确重算不符 → 应标偏差
var hx3 = V.hxSheet({ deviceWeight: 10000, count: 8, rpm: 2900, deflection: 50, damping: 0.065, claimedF0: 2.23, claimedLambda: 21.7, claimedEta: 0.01, claimedT: 99, claimedN: 25 });
assert('环新：声称 f₀=2.23 → 一致', hx3.rows[1].check.status === 'ok');
assert('环新：声称 η=0.01（精确值 ' + hx.eta.toFixed(4) + '）→ 偏差', hx3.rows[3].check.status !== 'ok');
assert('环新：声称 T=99%（精确 ' + hx.T.toFixed(2) + '%，差 < 0.5）→ 一致', hx3.rows[4].check.status === 'ok');
assert('环新：声称 N=25dB（精确 ' + hx.N.toFixed(1) + 'dB）→ 偏差', hx3.rows[5].check.status !== 'ok');
assert('环新：mismatchCount = 2', hx3.mismatchCount === 2 && hx3.allConsistent === false);
assert('环新：缺 δ 且缺 K 报错', V.hxSheet({ deviceWeight: 10000, count: 8, rpm: 2900 }).ok === false);
assert('环新：缺转速报错', V.hxSheet({ deviceWeight: 10000, count: 8 }).ok === false);
assert('环新：计算书步骤完整（8 步，对应第九 ~ 十四节）', hx.steps.length === 8);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
