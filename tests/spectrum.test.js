/*
 * spectrum.test.js — 频谱分析与计权内核测试 (node tests/spectrum.test.js)
 *
 * 锚点（可核对的公认数值）：
 *   1/1 倍频程 f₂/f₁ = 2，1 kHz 带 707.1~1414.2 Hz，相对带宽 70.7 %
 *   1/3 倍频程 f₂/f₁ = 2^(1/3) = 1.2599，1 kHz 带 891.3~1122.5 Hz，相对带宽 23.2 %
 *   IEC 61672-1 A 计权：1 kHz 0.0、2 kHz +1.2、4 kHz +1.0、8 kHz −1.1、
 *     31.5 Hz −39.4、63 −26.2、125 −16.1、250 −8.6、500 −3.2 dB
 *   C 计权：1 kHz 0.0、31.5 Hz −3.0、8 kHz −3.0 dB
 *   能量求和：80 + 80 = 83.01 dB；一分为三各减 10 lg 3 = 4.77 dB
 *   NR 曲线 L = a + b·N：NR-30 在 1 kHz = 30.0、63 Hz = 59.2、8 kHz = 22.9 dB
 *   NC 表：NC-30 = 57/48/41/35/31/29/28/27（63~8k）
 *   分段 L_eq：80 dB 与 60 dB 各占一半 → 77.03 dB
 */
var S = require('../public/js/spectrum.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
}

console.log('\n[1] 频带几何');

var e1 = S.bandEdges(1000, 1);
ok('1/1：上下限比 = 2', near(e1.ratio, 2, 1e-12));
ok('1/1：1 kHz 带下限 707.1 Hz', near(e1.f1, 707.1068, 1e-3), e1.f1);
ok('1/1：1 kHz 带上限 1414.2 Hz', near(e1.f2, 1414.2136, 1e-3), e1.f2);
ok('1/1：中心频率为上下限几何平均', near(Math.sqrt(e1.f1 * e1.f2), 1000, 1e-9));
ok('1/1：绝对带宽 707.1 Hz', near(e1.bw, 707.1068, 1e-3), e1.bw);
var e3 = S.bandEdges(1000, 3);
ok('1/3：上下限比 = 2^(1/3) = 1.2599', near(e3.ratio, 1.259921, 1e-6), e3.ratio);
ok('1/3：1 kHz 带下限 891.3 Hz', near(e3.f1, 890.899, 0.01), e3.f1);
ok('1/3：1 kHz 带上限 1122.5 Hz', near(e3.f2, 1122.462, 0.01), e3.f2);
ok('1/1 相对带宽 70.71 %', near(S.relBw(1), 70.7107, 1e-3), S.relBw(1));
ok('1/3 相对带宽 23.16 %', near(S.relBw(3), 23.1558, 1e-3), S.relBw(3));
ok('三个 1/3 频带正好合成一个 1/1 频带（用精确中心 1000·2^(1/3)）',
  near(S.bandEdges(1000, 1).f2, S.bandEdges(1000 * Math.pow(2, 1 / 3), 3).f2, 1e-6));

console.log('\n[2] 标称频率映射');

ok('1 kHz 落在 1/3 标称 1000', S.nominal(1000, 3) === 1000);
ok('1050 Hz 归到 1/3 标称 1000', S.nominal(1050, 3) === 1000, S.nominal(1050, 3));
ok('1150 Hz 归到 1/3 标称 1250', S.nominal(1150, 3) === 1250, S.nominal(1150, 3));
ok('315 Hz 归到 1/3 标称 315', S.nominal(315, 3) === 315, S.nominal(315, 3));
ok('20 Hz 为表内最小', S.nominal(20, 3) === 20);
ok('19 Hz 归到最近的 20 Hz 带', S.nominal(19, 3) === 20, S.nominal(19, 3));
ok('12 Hz 超出 1/3 表范围 → null', S.nominal(12, 3) === null, S.nominal(12, 3));
ok('1 kHz 落在 1/1 标称 1000', S.nominal(1000, 1) === 1000);
ok('800 Hz 归到 1/1 标称 1000', S.nominal(800, 1) === 1000, S.nominal(800, 1));
ok('600 Hz 归到 1/1 标称 500', S.nominal(600, 1) === 500, S.nominal(600, 1));
ok('bandIndex(2000, 3) = 3', S.bandIndex(2000, 3) === 3, S.bandIndex(2000, 3));
ok('bandIndex(125, 1) = −3', S.bandIndex(125, 1) === -3, S.bandIndex(125, 1));
ok('bandIndex(0) → null', S.bandIndex(0, 3) === null);
ok('1/3 表共 31 个频带', S.N1_3.length === 31, S.N1_3.length);
ok('1/1 表共 11 个频带（16~16k）', S.N1_1.length === 11, S.N1_1.length);

console.log('\n[3] IEC 61672-1 A / C / Z 计权');

// 数值由 IEC 61672-1 解析式在标称频率上求得，四舍五入到 0.1 dB 后应与标准表一致
ok('A：1 kHz = 0.00 dB', near(S.weighting(1000, 'a'), 0, 0.005), S.weighting(1000, 'a'));
ok('A：2 kHz = +1.20 dB', near(S.weighting(2000, 'a'), 1.20, 0.02), S.weighting(2000, 'a'));
ok('A：4 kHz = +0.96 dB（标准表记 +1.0）', near(S.weighting(4000, 'a'), 0.964, 0.02), S.weighting(4000, 'a'));
ok('A：8 kHz = −1.15 dB（标准表记 −1.1）', near(S.weighting(8000, 'a'), -1.147, 0.02), S.weighting(8000, 'a'));
ok('A：500 Hz = −3.25 dB（标准表记 −3.2）', near(S.weighting(500, 'a'), -3.248, 0.02), S.weighting(500, 'a'));
ok('A：250 Hz = −8.67 dB（标准表记 −8.7）', near(S.weighting(250, 'a'), -8.675, 0.02), S.weighting(250, 'a'));
ok('A：125 Hz = −16.19 dB（标准表记 −16.2）', near(S.weighting(125, 'a'), -16.190, 0.02), S.weighting(125, 'a'));
ok('A：63 Hz = −26.22 dB（标准表记 −26.2）', near(S.weighting(63, 'a'), -26.223, 0.02), S.weighting(63, 'a'));
ok('A：31.5 Hz = −39.53 dB（标准表记 −39.5）', near(S.weighting(31.5, 'a'), -39.529, 0.02), S.weighting(31.5, 'a'));
ok('C：1 kHz = 0.00 dB', near(S.weighting(1000, 'c'), 0, 0.01), S.weighting(1000, 'c'));
ok('C：31.5 Hz = −3.00 dB', near(S.weighting(31.5, 'c'), -3.00, 0.05), S.weighting(31.5, 'c'));
ok('C：8 kHz = −3.00 dB', near(S.weighting(8000, 'c'), -3.00, 0.05), S.weighting(8000, 'c'));
ok('Z：任意频率 0 dB', S.weighting(63, 'z') === 0 && S.weighting(8000, 'z') === 0);
ok('A 在 2 kHz 附近达到最大正值', S.weighting(2000, 'a') > S.weighting(1000, 'a') && S.weighting(2000, 'a') > S.weighting(4000, 'a'));
ok('低频 A 衰减远大于 C', S.weighting(31.5, 'a') < S.weighting(31.5, 'c') - 30);
ok('计权表对 1/1 频带给出 9 个值', S.weightTable(S.NR_BANDS, 'a').length === 9);
ok('applyWeighting 在 1 kHz 不改变数值', near(S.applyWeighting([{ f: 1000, L: 80 }], 'a')[0].Lw, 80, 0.005));
ok('applyWeighting 对 63 Hz 施加 −26.2 dB',
  near(S.applyWeighting([{ f: 63, L: 80 }], 'a')[0].Lw, 53.8, 0.1));

console.log('\n[4] 能量运算');

ok('80 + 80 = 83.01 dB', near(S.totalLevel([80, 80]), 83.0103, 1e-4), S.totalLevel([80, 80]));
ok('80 + 74 = 80.973 dB', near(S.totalLevel([80, 74]), 80.9732, 1e-4), S.totalLevel([80, 74]));
ok('相同 10 个 70 dB 相加 = 80 dB', near(S.totalLevel(new Array(10).fill(70)), 80, 1e-9));
ok('空数组 → null', S.totalLevel([]) === null);
ok('一分为三各减 10 lg 3 = 4.77 dB', near(S.energyDivide(90, 3), 85.2288, 1e-4), S.energyDivide(90, 3));
ok('k = 1 时不衰减', near(S.energyDivide(90, 1), 90, 1e-12));
ok('两路等时长 80 与 60 dB 等效 77.03 dB',
  near(S.leqFromSegments([{ L: 80, t: 1 }, { L: 60, t: 1 }]), 77.0329, 1e-3),
  S.leqFromSegments([{ L: 80, t: 1 }, { L: 60, t: 1 }]));
ok('8 h 的 80 dB 与 2 h 的 90 dB 等效 84.47 dB',
  near(S.leqFromSegments([{ L: 80, t: 8 }, { L: 90, t: 2 }]), 84.472, 1e-3),
  S.leqFromSegments([{ L: 80, t: 8 }, { L: 90, t: 2 }]));
ok('省略时长按等权处理', near(S.leqFromSegments([{ L: 80 }, { L: 60 }]), 77.0329, 1e-3));

console.log('\n[5] 频带归并 1/1 ↔ 1/3');

var m1 = S.mergeBands([{ f: 900, L: 70 }, { f: 1000, L: 70 }, { f: 1100, L: 70 }], 1);
ok('同带内三点归并为一个 1/1 频带', m1.length === 1, m1.length);
ok('归并到标称 1000 Hz', m1[0].fc === 1000, m1[0].fc);
ok('三个 70 dB 能量相加 = 74.77 dB', near(m1[0].L, 74.7712, 1e-4), m1[0].L);
ok('记录归并点数 n = 3', m1[0].n === 3);
var m3 = S.mergeBands([{ f: 950, L: 70 }, { f: 1000, L: 70 }, { f: 1300, L: 70 }], 3);
ok('1/3 归并：950/1000 归 1000，1300 归 1250 → 两带', m3.length === 2, m3.length);
ok('1/3 第一带为标称 1000', m3[0].fc === 1000, m3[0].fc);
ok('1/3 第二带为标称 1250', m3[1].fc === 1250, m3[1].fc);
var oct = S.mergeToOctave([{ fc: 800, L: 80 }, { fc: 1000, L: 80 }, { fc: 1250, L: 80 }]);
ok('三个 1/3 合并为一个 1/1 频带', oct.length === 1, oct.length);
ok('合并后为标称 1000 Hz', oct[0].fc === 1000, oct[0].fc);
ok('合并后 84.77 dB', near(oct[0].L, 84.7712, 1e-4), oct[0].L);
var th = S.splitToThird([{ fc: 1000, L: 84.7712 }]);
ok('1/1 拆分为三个 1/3 频带', th.length === 3, th.length);
ok('拆分后标称为 800 / 1000 / 1250',
  th.map(function (r) { return r.fc; }).join(',') === '800,1000,1250', th.map(function (r) { return r.fc; }).join(','));
ok('拆分后各为 80.00 dB（往返闭合）',
  th.every(function (r) { return near(r.L, 80, 1e-3); }), th.map(function (r) { return r.L.toFixed(3); }).join(','));
ok('拆分-合并往返回到原值',
  near(S.mergeToOctave(th)[0].L, 84.7712, 1e-9), S.mergeToOctave(th)[0].L);

console.log('\n[6] NR 曲线与评级');

var c30 = S.nrCurve(30);
ok('NR-30 在 1 kHz = 30.0 dB', near(c30[5].L, 30.0, 1e-9), c30[5].L);
ok('NR-30 在 63 Hz = 59.2 dB', near(c30[1].L, 59.2, 0.05), c30[1].L);
ok('NR-30 在 125 Hz = 48.1 dB', near(c30[2].L, 48.1, 0.05), c30[2].L);
ok('NR-30 在 500 Hz = 34.0 dB', near(c30[4].L, 34.02, 0.05), c30[4].L);
ok('NR-30 在 2 kHz = 26.9 dB', near(c30[6].L, 26.95, 0.05), c30[6].L);
ok('NR-30 在 8 kHz = 22.9 dB', near(c30[8].L, 22.9, 0.05), c30[8].L);
ok('NR-30 在 31.5 Hz = 75.8 dB', near(c30[0].L, 75.83, 0.05), c30[0].L);
ok('NR 编号即 1 kHz 处声压级', near(S.nrCurve(45)[5].L, 45, 1e-9));
ok('NR 曲线随编号单调上升', S.nrCurve(40)[1].L > S.nrCurve(30)[1].L && S.nrCurve(30)[1].L > S.nrCurve(20)[1].L);
ok('NR 曲线低频高、高频低（递减形状）', c30[0].L > c30[4].L && c30[4].L > c30[8].L);

var flat30 = {};
c30.forEach(function (r) { flat30[r.f] = r.L; });
var r30 = S.nrRating(flat30);
ok('恰好贴合 NR-30 曲线 → 评级 NR-30', r30.n === 30, r30.n);
ok('评级标签为 NR-30', r30.label === 'NR-30', r30.label);
var r35 = S.nrRating({ 31.5: 70, 63: 55, 125: 45, 250: 38, 500: 34, 1000: 35, 2000: 27, 4000: 25, 8000: 23 });
ok('1 kHz 抬到 35 dB → 评级 NR-35', r35.n === 35, r35.n);
ok('主导频带为 1 kHz', r35.governing === 1000, r35.governing);
var rHi = S.nrRating({ 31.5: 60, 63: 50, 125: 40, 250: 30, 500: 20, 1000: 15, 2000: 10, 4000: 8, 8000: 6 });
ok('安静频谱 → NR-21，由 125 Hz 主导', rHi.n === 21 && rHi.governing === 125, rHi.n + '/' + rHi.governing);
ok('NR 评级给出各频带余量', r35.perBand.every(function (p) { return p.margin >= -1e-9; }));

console.log('\n[7] NC 曲线与评级');

ok('NC-30 = 57/48/41/35/31/29/28/27',
  S.ncCurve(30).map(function (r) { return r.L; }).join(',') === '57,48,41,35,31,29,28,27',
  S.ncCurve(30).map(function (r) { return r.L; }).join(','));
ok('NC-25 = 54/44/37/31/27/24/22/21',
  S.ncCurve(25).map(function (r) { return r.L; }).join(',') === '54,44,37,31,27,24,22,21',
  S.ncCurve(25).map(function (r) { return r.L; }).join(','));
ok('NC-15 = 47/36/29/22/17/14/12/11',
  S.ncCurve(15).map(function (r) { return r.L; }).join(',') === '47,36,29,22,17,14,12,11');
ok('NC-65 = 80/75/71/68/66/64/63/62',
  S.ncCurve(65).map(function (r) { return r.L; }).join(',') === '80,75,71,68,66,64,63,62');
ok('NC-22 按 NC-20 与 NC-25 线性插值（63 Hz → 52.2）',
  near(S.ncCurve(22)[0].L, 52.2, 1e-9), S.ncCurve(22)[0].L);
ok('NC 表覆盖 63~8k 共 8 个频带', S.NC_BANDS.length === 8 && S.NC_TABLE[0].length === 8);
ok('NC 曲线随编号单调上升', S.ncCurve(40)[7].L > S.ncCurve(30)[7].L && S.ncCurve(30)[7].L > S.ncCurve(20)[7].L);

var ncFlat = { 63: 57, 125: 48, 250: 41, 500: 35, 1000: 31, 2000: 29, 4000: 28, 8000: 27 };
ok('恰好贴合 NC-30 → 评级 NC-30', S.ncRating(ncFlat).n === 30, S.ncRating(ncFlat).n);
ok('评级标签为 NC-30', S.ncRating(ncFlat).label === 'NC-30');
var nc35 = { 63: 60, 125: 48, 250: 41, 500: 35, 1000: 31, 2000: 29, 4000: 28, 8000: 27 };
ok('63 Hz 抬到 60 dB → 评级 NC-35', S.ncRating(nc35).n === 35, S.ncRating(nc35).n);
ok('主导频带为 63 Hz', S.ncRating(nc35).governing === 63, S.ncRating(nc35).governing);
var spiky = { 63: 70, 125: 20, 250: 20, 500: 20, 1000: 20, 2000: 20, 4000: 20, 8000: 20 };
ok('评级取「任一频带触碰的最高曲线」而非平均（63 Hz 单点 70 dB → NC-50）',
  S.ncRating(spiky).n === 50, S.ncRating(spiky).n);
var meanSpiky = (70 + 20 * 7) / 8;
ok('同一频谱的算数平均仅 26.25 dB，远低于 NC-50 评级（说明不可取平均）',
  near(meanSpiky, 26.25, 1e-9) && S.ncRating(spiky).n > meanSpiky, meanSpiky);
ok('NC 与 NR 在 1 kHz 处相差约 1 dB（30 vs 31）',
  near(S.ncCurve(30)[4].L - S.nrCurve(30)[5].L, 1, 1e-9));

console.log('\n[8] 派生指标');

var flat = S.N1_1.slice(1, 10).map(function (f) { return { f: f, L: 80 }; }); // 31.5~8000
var d = S.lcMinusLa(flat);
ok('9 个 80 dB 频带的总级 = 89.54 dB', near(d.Lz, 89.5424, 1e-3), d.Lz);
ok('A 计权总级低于线性总级', d.LA < d.Lz, d.LA + ' vs ' + d.Lz);
ok('C 计权总级接近线性总级（差 < 1 dB）', Math.abs(d.LC - d.Lz) < 1, d.LC - d.Lz);
ok('L_C − L_A 为正', d.diff > 0, d.diff);
var lowHeavy = [{ f: 63, L: 90 }, { f: 1000, L: 50 }, { f: 4000, L: 40 }];
ok('低频为主的频谱 L_C − L_A 明显更大',
  S.lcMinusLa(lowHeavy).diff > S.lcMinusLa([{ f: 63, L: 50 }, { f: 1000, L: 90 }, { f: 4000, L: 40 }]).diff);
var s1 = S.sil({ 500: 50, 1000: 45, 2000: 40, 4000: 35 });
ok('PSIL = (50+45+40)/3 = 45 dB', near(s1.psil, 45, 1e-9), s1.psil);
ok('经典 SIL = (45+40+35)/3 = 40 dB', near(s1.sil, 40, 1e-9), s1.sil);
ok('缺少频带时该项为 null', S.sil({ 500: 50, 1000: 45 }).psil === null);
ok('PSIL 45 dB 给出「1~2 m 正常会话尚可」', s1.note.indexOf('1~2 m') >= 0, s1.note);
ok('PSIL 30 dB 给出「轻松」', S.sil({ 500: 33, 1000: 30, 2000: 27 }).note.indexOf('轻松') >= 0);
var ctd = S.centroid([{ f: 1000, L: 80 }, { f: 2000, L: 80 }]);
ok('两等能频带重心 = 1500 Hz', near(ctd.linear, 1500, 1e-9), ctd.linear);
ok('几何重心 = 1414.2 Hz', near(ctd.geometric, 1414.2136, 0.01), ctd.geometric);
ok('重心偏向能量更高的频带',
  S.centroid([{ f: 1000, L: 90 }, { f: 2000, L: 70 }]).linear < 1500);
ok('空输入 → null', S.centroid([]) === null);

console.log('\n[9] 边界与健壮性');

ok('0 Hz 计权 → null', S.weighting(0, 'a') === null);
ok('负频率计权 → null', S.weighting(-100, 'a') === null);
ok('bandEdges(0) → null', S.bandEdges(0, 1) === null);
ok('nrCurve(非数) → null', S.nrCurve('x') === null);
ok('ncCurve(非数) → null', S.ncCurve('x') === null);
ok('全空频谱 NR 评级 → null', S.nrRating({}) === null);
ok('全空频谱 NC 评级 → null', S.ncRating({}) === null);
ok('数组输入与对象输入评级一致',
  S.nrRating(c30.map(function (r) { return { f: r.f, L: r.L }; })).n ===
  S.nrRating(flat30).n);
ok('normalizeSpectrum 对缺失频带补 null',
  S.normalizeSpectrum({ 1000: 50 }, [500, 1000])[0].L === null);
ok('1/1 与 1/3 归并的总能量守恒',
  near(S.totalLevel(S.mergeToOctave(S.splitToThird([{ fc: 125, L: 70 }, { fc: 1000, L: 60 }])).map(function (r) { return r.L; })),
    S.totalLevel([70, 60]), 1e-9));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
