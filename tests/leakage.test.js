/*
 * leakage.test.js — 孔洞缝隙漏声与门窗隔声估算内核测试 (node tests/leakage.test.js)
 *
 * 锚点全部用可手算的解析值：
 *   - 单孔 TL：τ = 4/(4+(kL)²)，L = t + (8/3π)d
 *   - 缝隙 ΔR：ΔR = 10lg[(1 + ε·10^(0.1R₀))/(1+ε)]
 *   - 组合：τ = ΣSτ/ΣS（10 m²@50 + 1 m²@30 → 恰好 40 dB）
 *   - 玻璃经验式 13.5lgm+13、中空 0.1·d、PVB 表、双层 f₀=60√[(m₁+m₂)/(m₁m₂d)]
 */
var L = require('../public/js/leakage.js');
var passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail != null ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.01 : tol); }

console.log('\n[1] 单孔/缝隙透射损失（声质量模型）');
// 1 mm 孔、5 mm 板、1 kHz：L=5.849mm, k=18.317, kL=0.10715 → TL=0.0125 dB
var tl1 = L.apertureTl(1, 5, 1000);
ok('1mm 孔 5mm 板 @1kHz ≈ 0.01 dB', close(tl1, 0.0125, 0.005), tl1);
ok('小孔在音频频段近乎全透射', tl1 < 0.1, tl1);
// 100 mm 孔、200 mm 板、4 kHz：L=284.88mm, k=73.27, kL=20.875 → TL=10lg(1+108.9)=20.41 dB
var tl2 = L.apertureTl(100, 200, 4000);
ok('100mm 孔 200mm 板 @4kHz ≈ 20.41 dB', close(tl2, 20.41, 0.05), tl2);
// 端修正占比：孔径越大附加长度越大
ok('同深度下大孔 TL 更高（端修正）', L.apertureTl(50, 10, 2000) > L.apertureTl(1, 10, 2000));
ok('TL 随频率单调上升', L.apertureTl(10, 20, 4000) > L.apertureTl(10, 20, 500));
ok('f→0 时 TL→0', L.apertureTl(10, 20, 0.001) < 0.01);
ok('非法输入返回 null', L.apertureTl(0, 5, 1000) === null && L.apertureTl(1, -1, 1000) === null);

console.log('\n[2] 孔口面积');
ok('圆孔：3 个 φ10mm = 2.356e-4 m²', close(L.apertureArea({ kind: 'circle', dMm: 10, n: 3 }), 2.3562e-4, 1e-6));
ok('方孔：4 个 20mm = 1.6e-3 m²', close(L.apertureArea({ kind: 'square', dMm: 20, n: 4 }), 1.6e-3, 1e-9));
ok('通长缝：1mm 宽 × 3m = 3e-3 m²', close(L.apertureArea({ kind: 'slit', wMm: 1, lengthM: 3 }), 3e-3, 1e-9));
ok('缝隙面积与孔洞面积可同尺度比较', L.apertureArea({ kind: 'slit', wMm: 1, lengthM: 3 }) > 0);

console.log('\n[3] 含孔洞构件组合隔声（逐频带）');
// 20 m² 墙、1% 孔洞（0.2 m²）、墙按 m=480 质量定律
var ac = L.apertureCombination({
  areaTotal: 20, holeArea: 0.2,
  wallR0: function (f) { return L.massLaw(480, f); },
  holeTl: function (f) { return L.apertureTl(2, 10, f); }
});
ok('组合计算成功', ac.ok === true);
ok('6 个倍频带', ac.bands.length === 6);
ok('孔洞面积比 1% → 隔声天花板 20 dB', close(ac.capR, 20, 0.01), ac.capR);
ok('500 Hz 组合隔声被孔洞压到 ~20 dB', close(ac.combR[2], 20.0, 0.3), ac.combR[2]);
ok('组合隔声远低于原墙隔声量', ac.combR[2] < ac.wallR[2] - 30);
ok('孔洞 TL 随频率上升（组合曲线抬升）', ac.combR[5] > ac.combR[2]);
ok('孔洞面积 0 时组合 = 原墙', close(L.apertureCombination({
  areaTotal: 20, holeArea: 0,
  wallR0: function (f) { return L.massLaw(480, f); },
  holeTl: function (f) { return L.apertureTl(2, 10, f); }
}).combR[2], L.massLaw(480, 500), 0.001));
ok('孔洞面积 ≥ 总面积报错', L.apertureCombination({ areaTotal: 1, holeArea: 1 }).ok === false);

console.log('\n[4] 缝隙影响速算（式 7.4.5）');
// R0=50、ε=1%：ΔR = 10lg(1001/1.01) = 29.96 dB
var g = L.gapDeltaR(50, 0.2, 20);
ok('R₀=50、1% 缝隙 → ΔR ≈ 29.96 dB', close(g.deltaR, 29.96, 0.02), g.deltaR);
ok('实际隔声量 ≈ 20.04 dB', close(g.actualR, 20.04, 0.02), g.actualR);
ok('无缝隙 ΔR = 0', close(L.gapDeltaR(50, 0, 20).deltaR, 0, 1e-9));
// 与面积加权组合互校（差 <0.1 dB）：99%@50 + 1%@0 → ΔR = 30.004
var cc = L.combine([{ name: '墙', area: 19.8, R: 50 }, { name: '缝', area: 0.2, R: 0 }]);
ok('组合法 ΔR = 30.00 dB（与 7.4.5 差 <0.1）', close(50 - cc.R, 30.00, 0.01) && Math.abs((50 - cc.R) - g.deltaR) < 0.1, cc.R);
ok('缝隙面积比越大 ΔR 越大', L.gapDeltaR(50, 1, 20).deltaR > g.deltaR);
ok('非法输入报错', L.gapDeltaR(50, 20, 20).ok === false);

console.log('\n[5] 组合构件（面积加权）');
var cb = L.combine([
  { name: '墙', area: 10, R: 50 },
  { name: '门', area: 1, R: 30 }
]);
ok('10 m²@50 + 1 m²@30 = 40.00 dB', close(cb.R, 40, 0.001), cb.R);
ok('总面积 11 m²', close(cb.area, 11, 1e-9));
ok('门透射能占比 ≈ 90.9%', close(cb.parts[0].share * 100, 90.9, 0.1), cb.parts[0].share * 100);
ok('薄弱环节是门', cb.weakest.name === '门');
ok('等面积等隔声量 → 组合 = 单件', close(L.combine([
  { name: 'a', area: 5, R: 40 }, { name: 'b', area: 5, R: 40 }
]).R, 40, 1e-9));
ok('缺隔声量报错', L.combine([{ name: 'x', area: 5 }]).ok === false);

console.log('\n[6] 多行解析');
var pp = L.parseParts([
  '# 注释行',
  '砖墙 15 52',
  '户门 2, 25',
  '外窗\t3\t28'
].join('\n'));
ok('解析出 3 个构件', pp.length === 3, pp.length);
ok('名称/面积/隔声量正确', pp[0].name === '砖墙' && close(pp[0].area, 15) && close(pp[0].R, 52));
ok('坏行被忽略', L.parseParts('只有名称').length === 0);

console.log('\n[7] 质量定律与玻璃经验式');
ok('m=480 @1kHz = 65.62 dB', close(L.massLaw(480, 1000), 65.62, 0.01), L.massLaw(480, 1000));
ok('面密度翻倍 +6.02 dB（20lg2）', close(L.massLaw(960, 1000) - L.massLaw(480, 1000), 6.0206, 0.001));
ok('频率翻倍 +6.02 dB（20lg2）', close(L.massLaw(480, 2000) - L.massLaw(480, 1000), 6.0206, 0.001));
ok('6mm 玻璃（15 kg/m²）≈ 28.9 dB', close(L.glassSingle(15), 28.88, 0.01), L.glassSingle(15));
ok('10mm 玻璃（25 kg/m²）≈ 31.9 dB', close(L.glassSingle(25), 31.87, 0.01), L.glassSingle(25));
ok('非法面密度返回 null', L.glassSingle(0) === null && L.massLaw(-1, 500) === null);

console.log('\n[8] 中空 / 夹层玻璃');
var igu = L.glassIgu(15, 15, 12);
ok('6+12A+6 ≈ 34.1 dB', close(igu.R, 34.14, 0.02), igu.R);
ok('空气层 100mm 附加 +10 dB', close(L.glassIgu(15, 15, 100).bonus, 10, 1e-9));
ok('空气层 50mm 附加 +5 dB', close(L.glassIgu(15, 15, 50).bonus, 5, 1e-9));
ok('大空腔附加放缓（>100mm 不按 0.1 线性）', L.glassIgu(15, 15, 200).bonus < 20);
var lam = L.glassLaminated(15, 0.38);
ok('0.38mm PVB 附加 +4 dB', close(lam.bonus, 4, 1e-9));
ok('3+0.38+3 ≈ 32.9 dB', close(lam.R, 32.88, 0.02), lam.R);
ok('1.52mm PVB 附加 +7 dB', close(L.glassLaminated(15, 1.52).bonus, 7, 1e-9));
ok('膜厚线性插值（0.57mm ≈ 4.75）', close(L.glassLaminated(15, 0.57).bonus, 4.75, 0.01), L.glassLaminated(15, 0.57).bonus);
ok('无膜无附加', close(L.glassLaminated(15, 0).bonus, 0, 1e-9));

console.log('\n[9] 双层板（f₀ 与附加隔声量）');
// 12mm 石膏板 ×2（9.8 kg/m²）+ 75mm 空腔：f₀ = 60√(19.6/(9.8·9.8·0.075)) = 98.96 Hz
var dl = L.doubleLeaf({ m1: 9.8, m2: 9.8, dMm: 75 });
ok('双层计算成功', dl.ok === true);
ok('f₀ ≈ 98.96 Hz', close(dl.f0, 98.96, 0.05), dl.f0);
ok('75mm 空腔附加 ≈ 6.75 dB（表值 9@100 按比例）', close(dl.airBonus, 6.75, 0.01), dl.airBonus);
ok('填棉 +5 dB', close(dl.fillBonus, 0) && close(L.doubleLeaf({ m1: 9.8, m2: 9.8, dMm: 75, fill: true }).fillBonus, 5, 1e-9));
ok('总估算 = 基值 + 附加 + 填棉', close(L.doubleLeaf({ m1: 9.8, m2: 9.8, dMm: 75, fill: true }).R, dl.baseR + 6.75 + 5, 0.01));
// 重墙双层（>200 kg/m²）用 16lg(m)+8
var dl2 = L.doubleLeaf({ m1: 240, m2: 240, dMm: 100 });
ok('重墙基值用 16lg(m)+8 = 45.46', close(dl2.baseR, 16 * Math.log10(480) + 8, 0.01), dl2.baseR);
ok('100mm 加气混凝土附加 = 10 dB', close(L.doubleLeaf({ m1: 240, m2: 240, dMm: 100, kind: 'concrete' }).airBonus, 10, 1e-9));
ok('f₀ 重墙极低（240 kg/m²×2 + 100mm → 17.3 Hz）', close(dl2.f0, 17.32, 0.05) && dl2.f0 < 20, dl2.f0);
ok('轻质大空腔 f₀ 落入可闻段时告警（1.5+1.5+50mm → 310 Hz）', L.doubleLeaf({ m1: 1.5, m2: 1.5, dMm: 50 }).note.length > 0);
ok('缺参数报错', L.doubleLeaf({ m1: 10 }).ok === false);

console.log('\n[10] 计权估算与限值判定');
var bands = [125, 250, 500, 1000, 2000, 4000];
ok('Rw 估算 = 500/1k/2k 平均', close(L.rwEstimate([30, 35, 40, 42, 45, 50], bands), 42.333, 0.01), L.rwEstimate([30, 35, 40, 42, 45, 50], bands));
ok('空数据返回 null', L.rwEstimate([]) === null);
var ck = L.checkLimit('dwell-entry-door', 26, -1);
ok('户门 26−1=25 ≥ 25 达标', ck.ok && ck.pass && close(ck.margin, 0, 1e-9));
ok('户门 24−1=23 < 25 不达标', !L.checkLimit('dwell-entry-door', 24, -1).pass);
ok('限值条目含高要求档', L.findLimit('dwell-partition').high === 50);
ok('GB 55038 卧室之间 ≥ 50', L.findLimit('dwell-wall-55038').limit === 50);
ok('交通干线侧窗用 Ctr ≥ 30', L.findLimit('dwell-window-traffic').corr === 'Ctr' && L.findLimit('dwell-window-traffic').limit === 30);
ok('未知条目报错', L.checkLimit('nope', 40, 0).ok === false);

console.log('\n[11] 例题数据');
ok('例题含 4 个构件', L.exampleParts().length === 4);
var ex = L.exampleCombination();
ok('例题 6 频带', ex.length === 6);
// 500 Hz：墙 59.62 dB（τ=1.096e-6），门 25，窗 28，孔 0
// τS = 15·1.096e-6 + 2·3.162e-3 + 3·1.585e-3 + 0.2 = 0.21110 → R = 19.81
ok('例题 500 Hz 组合 ≈ 19.81 dB（孔洞主导）', close(ex[2].R, 19.81, 0.05), ex[2].R);
ok('例题组合隔声全程 < 30 dB', ex.every(function (r) { return r.R < 30; }));

console.log('\n[12] 限值表完整性');
ok('限值表覆盖 6 类建筑', ['住宅', '学校', '医院', '办公', '旅馆', '商业'].every(function (g) {
  return L.LIMITS.some(function (r) { return r.group.indexOf(g) === 0; });
}));
ok('每条限值均有正限值', L.LIMITS.every(function (r) { return r.limit > 0 && (r.corr === 'C' || r.corr === 'Ctr'); }));

console.log('\n[13] 门窗 TL 曲线合成模型');
function dip(f, fc, depth, sigma) {
  var z = Math.log(f / fc) / Math.LN2 / sigma;
  return depth * Math.exp(-z * z / 2);
}
function pml(t, f) { return 20 * Math.log10(2.5 * t * f) - 50; }   // 场入射质量定律
var g4c = L.glazingCurve(L.glazingById('g4'));
ok('4mm 125 Hz = 场入射质量定律（吻合谷未及低频）', close(g4c.R[0], pml(4, 125), 0.01), g4c.R[0]);
var g6c = L.glazingCurve(L.glazingById('g6'));
ok('6mm 吻合频率 f_c = 12800/t ≈ 2133 Hz', close(g6c.fcs[0], 12800 / 6, 0.01), g6c.fcs[0]);
ok('6mm 2 kHz 被吻合谷压低（较质量定律低 ≥ 5 dB）', g6c.R[4] < pml(6, 2000) - 5, g6c.R[4] + ' vs ' + pml(6, 2000).toFixed(2));
ok('6mm 4 kHz 谷后回升（≥ +3 dB）', g6c.R[5] > g6c.R[4] + 3);
var g10c = L.glazingCurve(L.glazingById('g10'));
var lamc = L.glazingCurve(L.glazingById('lam-5-076-5'));
ok('PVB 阻尼使同厚（10mm）吻合谷减半：夹层 2k 高于单玻 ≥ 2 dB', lamc.R[4] > g10c.R[4] + 2, lamc.R[4] + ' vs ' + g10c.R[4]);
var iguc = L.glazingCurve(L.glazingById('igu-6-12-6'));
ok('6+12A+6 质量-空气-质量共振 f_r = 200 Hz', close(iguc.fr, 200, 0.01), iguc.fr);
ok('125 Hz 低于 f_r：总面密度质量定律 − 共振谷', close(iguc.R[0], pml(12, 125) - dip(125, 200, 5, 0.5), 0.01), iguc.R[0]);
ok('500 Hz 高于 f_r：单片质量定律（含吻合谷）+ 空气层附加 1.2 dB', close(iguc.R[2], pml(6, 500) - dip(500, 12800 / 6, 9, 0.8) + 1.2, 0.01), iguc.R[2]);
ok('高频经验上限 44 dB（win-fixed 4k 触顶）', close(L.glazingCurve(L.glazingById('win-fixed')).R[5], L.R_HF_CAP, 1e-9));
var slide = L.glazingCurve(L.glazingById('win-slide'));
var alu = L.glazingCurve(L.glazingById('win-alu'));
ok('同配置 Rw：构件（实验室） > 平开整窗 > 推拉整窗', iguc.rw > alu.rw && alu.rw > slide.rw, iguc.rw + '/' + alu.rw + '/' + slide.rw);
ok('整窗扣减高频偏重（推拉 4k 扣 5 dB > 125 Hz 扣 2 dB）', slide.penalty[5] === 5 && slide.penalty[0] === 2);
ok('缺玻璃片报错', L.glazingCurve({}).ok === false);
ok('双片缺空腔报错', L.glazingCurve({ panes: [{ t: 6 }, { t: 6 }] }).ok === false);
ok('非法开启方式回退构件口径', L.glazingCurve({ panes: [{ t: 6 }], mount: 'nope' }).mount === 'glazing');

console.log('\n[14] 数据表锚点校准（公开实测统计，离散 ±2~3 dB）');
var GL = L.GLAZING;
ok('数据表 16 条配置、2 个分组', GL.length === 16 && GL.filter(function (e) { return GL[0].group === e.group; }).length === 11);
ok('全部条目 |Rw 估算 − 锚点| ≤ 2.5 dB', GL.every(function (e) { return Math.abs(L.glazingCurve(e).rw - e.rwRef) <= 2.5; }),
  GL.map(function (e) { var d = L.glazingCurve(e).rw - e.rwRef; return e.id + ':' + (d >= 0 ? '+' : '') + d.toFixed(1); }).join(' '));
ok('每条含 id/名称/玻璃片/锚点/口径', GL.every(function (e) { return e.id && e.name && e.panes && e.panes.length >= 1 && e.rwRef > 0 && e.mount; }));
ok('glazingById 命中与未知返回 null', L.glazingById('igu-6-12-6').name === '中空 6+12A+6' && L.glazingById('nope') === null);
ok('不等厚中空优于等厚（吻合谷错开）', L.glazingCurve(L.glazingById('igu-5-12-8')).rw > L.glazingCurve(L.glazingById('igu-5-12-5')).rw);
ok('大空腔（20mm）优于小空腔（12mm）', L.glazingCurve(L.glazingById('igu-6-20-6')).rw > iguc.rw);
ok('同厚夹层比中空高 ≥ 4 dB（PVB 阻尼）', lamc.rw - L.glazingCurve(L.glazingById('igu-5-12-5')).rw >= 4);
ok('整窗不高于同配置构件口径', slide.rw < iguc.rw && alu.rw < iguc.rw);

console.log('\n[15] 数据表界面守护');
(function () {
  var fs = require('fs'), pathMod = require('path');
  var vjs = fs.readFileSync(pathMod.join(__dirname, '..', 'public', 'js', 'view-leakage.js'), 'utf8');
  ok('视图含曲线数据表卡片', vjs.indexOf('常用门窗传声损失曲线') >= 0);
  ['lkGlzSel', 'lkBtnGlzAdd', 'lkGlzChart', 'lkGlzSummary', 'lkGlzTable'].forEach(function (id) {
    ok('视图含 #' + id, vjs.indexOf('id="' + id + '"') >= 0);
  });
  ok('下拉切换与加入按钮已绑定', vjs.indexOf("addEventListener('change', calcGlz)") >= 0 && vjs.indexOf("addEventListener('click', addGlzToParts)") >= 0);
  ok('加入组合构件时名称去空格（解析格式兼容）', vjs.indexOf("replace(/[\\s,;]+/g, '')") >= 0);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
