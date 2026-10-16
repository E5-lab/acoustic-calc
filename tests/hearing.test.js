/*
 * hearing.test.js — 听觉与听阈内核测试 (node tests/hearing.test.js)
 *
 * 锚点（可核对的公认数值）：
 *   ISO 226:2003 40 phon 曲线：1 kHz = 40.01、100 Hz = 64.37、125 Hz = 60.59、
 *     2 kHz = 39.23、4 kHz = 36.65、8 kHz = 51.80 dB SPL
 *   1 kHz 上 phon 恒等于 dB SPL；自由场听阈 T_f 与 ISO 389-7 一致（4 kHz = −5.4 dB）
 *   ISO 7029:2017 男性 65 岁中位数阈移：125 Hz 6.6、1 kHz 10.4、4 kHz 26.2、8 kHz 39.5 dB
 *   WHO 2021 分级：PTA4 <20 正常 / 20~<35 轻度 / … / ≥95 全聋
 *   RETSPL（TDH-39）：1 kHz = 7.0、4 kHz = 9.5 dB SPL @ 0 dB HL
 *   Zwicker 临界带：1 kHz 中心带 920~1080 Hz（Δf ≈ 162 Hz）、z(50 Hz) ≈ 0.5 Bark
 */
var H = require('../public/js/hearing.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= tol;
}

console.log('\n[1] ISO 226：响度级 → 声压级（40 phon 曲线锚点）');
ok('1 kHz 40 phon = 40.01 dB', near(H.phonToSpl(1000, 40).spl, 40.01, 0.05), H.phonToSpl(1000, 40).spl);
ok('100 Hz 40 phon = 64.37 dB', near(H.phonToSpl(100, 40).spl, 64.37, 0.05), H.phonToSpl(100, 40).spl);
ok('125 Hz 40 phon = 60.59 dB', near(H.phonToSpl(125, 40).spl, 60.59, 0.05), H.phonToSpl(125, 40).spl);
ok('200 Hz 40 phon = 53.41 dB', near(H.phonToSpl(200, 40).spl, 53.41, 0.05), H.phonToSpl(200, 40).spl);
ok('500 Hz 40 phon = 43.05 dB', near(H.phonToSpl(500, 40).spl, 43.05, 0.05), H.phonToSpl(500, 40).spl);
ok('2 kHz 40 phon = 39.23 dB', near(H.phonToSpl(2000, 40).spl, 39.23, 0.05), H.phonToSpl(2000, 40).spl);
ok('4 kHz 40 phon = 36.65 dB', near(H.phonToSpl(4000, 40).spl, 36.65, 0.05), H.phonToSpl(4000, 40).spl);
ok('8 kHz 40 phon = 51.80 dB', near(H.phonToSpl(8000, 40).spl, 51.80, 0.06), H.phonToSpl(8000, 40).spl);
ok('20 Hz 40 phon = 99.85 dB', near(H.phonToSpl(20, 40).spl, 99.85, 0.1), H.phonToSpl(20, 40).spl);
ok('20 Hz 60 phon = 109.5 dB', near(H.phonToSpl(20, 60).spl, 109.5, 0.3), H.phonToSpl(20, 60).spl);
ok('31.5 Hz 40 phon = 88.16 dB（ISO 226 表列 88.17）', near(H.phonToSpl(31.5, 40).spl, 88.16, 0.05), H.phonToSpl(31.5, 40).spl);

console.log('\n[2] ISO 226：声压级 → 响度级（往返一致）');
ok('1 kHz 40 dB → 40.0 phon', near(H.splToPhon(1000, 40).phon, 40.0, 0.1), H.splToPhon(1000, 40).phon);
ok('100 Hz 64.37 dB → 40 phon', near(H.splToPhon(100, 64.37).phon, 40.0, 0.1), H.splToPhon(100, 64.37).phon);
var rt1 = H.splToPhon(1000, H.phonToSpl(1000, 55).spl);
ok('往返：1 kHz 55 phon → dB → phon', near(rt1.phon, 55, 0.05), rt1.phon);
var rt2 = H.splToPhon(250, H.phonToSpl(250, 70).spl);
ok('往返：250 Hz 70 phon → dB → phon', near(rt2.phon, 70, 0.05), rt2.phon);
var rt3 = H.phonToSpl(100, H.splToPhon(100, 70).phon);
ok('往返：100 Hz 70 dB → phon → dB', near(rt3.spl, 70, 0.05), rt3.spl);
ok('1 kHz 上 phon 数值等于 dB 数值（±0.1）', near(H.splToPhon(1000, 63.2).phon, 63.2, 0.1), H.splToPhon(1000, 63.2).phon);
ok('等响曲线单调：同一 phon 下 4 kHz 所需声压级低于 1 kHz', H.phonToSpl(4000, 40).spl < H.phonToSpl(1000, 40).spl);
ok('同一 phon 下 100 Hz 所需声压级远高于 1 kHz', H.phonToSpl(100, 40).spl - H.phonToSpl(1000, 40).spl > 20);

console.log('\n[3] ISO 226：适用范围与参数');
ok('20 phon 以下标记为超出适用范围', H.phonToSpl(1000, 10).valid === false);
ok('90 phon 以内（≤4 kHz）有效', H.phonToSpl(4000, 90).valid === true);
ok('5 kHz 以上上限 80 phon', H.phonToSpl(6000, 85).valid === false && H.phonToSpl(6000, 80).valid === true);
ok('频率低于 20 Hz 返回 null', H.phonToSpl(10, 40) === null);
ok('频率高于 12.5 kHz 返回 null', H.phonToSpl(16000, 40) === null);
ok('非表列频率按对数频率插值（isExact=false）', H.phonToSpl(140, 40).exact === false);
ok('插值点介于 125 与 160 Hz 之间', H.phonToSpl(140, 40).spl > H.phonToSpl(160, 40).spl && H.phonToSpl(140, 40).spl < H.phonToSpl(125, 40).spl);
ok('自由场听阈 1 kHz = 2.4 dB', near(H.freeThreshold(1000), 2.4, 1e-9));
ok('自由场听阈 50 Hz = 44.0 dB', near(H.freeThreshold(50), 44.0, 1e-9));
ok('自由场听阈 4 kHz = −5.4 dB（听觉最灵敏区）', near(H.freeThreshold(4000), -5.4, 1e-9));
ok('自由场听阈 8 kHz = 12.6 dB', near(H.freeThreshold(8000), 12.6, 1e-9));
var c40 = H.contour(40);
ok('等响曲线返回 29 个 ISO 226 表列频点', c40.length === 29 && c40[0].f === 20 && c40[28].f === 12500);
ok('曲线 1 kHz 点 = 40 dB', near(c40.filter(function (p) { return p.f === 1000; })[0].spl, 40.01, 0.05));

console.log('\n[4] ISO 7029：年龄相关听阈（中位数）');
var a65m = H.ageShift(65, 'male');
ok('65 岁男性 125 Hz 阈移 = 6.6 dB', near(a65m.rows[0].shift, 6.6, 0.05), a65m.rows[0].shift);
ok('65 岁男性 1 kHz 阈移 = 10.4 dB', near(H.ageShiftAt(65, 1000, 'male'), 10.4, 0.05), H.ageShiftAt(65, 1000, 'male'));
ok('65 岁男性 2 kHz 阈移 = 16.3 dB', near(H.ageShiftAt(65, 2000, 'male'), 16.3, 0.05), H.ageShiftAt(65, 2000, 'male'));
ok('65 岁男性 4 kHz 阈移 = 26.25 dB（文献取整 26.2）', near(H.ageShiftAt(65, 4000, 'male'), 26.25, 0.06), H.ageShiftAt(65, 4000, 'male'));
ok('65 岁男性 6 kHz 阈移 = 33.7 dB', near(H.ageShiftAt(65, 6000, 'male'), 33.7, 0.1), H.ageShiftAt(65, 6000, 'male'));
ok('65 岁男性 8 kHz 阈移 = 39.5 dB', near(H.ageShiftAt(65, 8000, 'male'), 39.5, 0.1), H.ageShiftAt(65, 8000, 'male'));
ok('65 岁女性 4 kHz 阈移 = 20.7 dB（低于男性）', near(H.ageShiftAt(65, 4000, 'female'), 20.7, 0.1) && H.ageShiftAt(65, 4000, 'female') < H.ageShiftAt(65, 4000, 'male'));
ok('18 岁阈移 = 0', near(H.ageShiftAt(18, 4000, 'male'), 0, 1e-9));
ok('80 岁 4 kHz 阈移 > 65 岁', H.ageShiftAt(80, 4000, 'male') > H.ageShiftAt(65, 4000, 'male'));
ok('阈移随年龄单调递增（4 kHz）', H.ageShiftAt(30, 4000, 'male') < H.ageShiftAt(50, 4000, 'male') && H.ageShiftAt(50, 4000, 'male') < H.ageShiftAt(70, 4000, 'male'));
ok('年龄低于 18 返回错误标记', H.ageShift(10, 'male').error === 'age-below-18');
ok('超过 80 岁标记 inRange=false', H.ageShift(85, 'male').inRange === false && H.ageShift(75, 'male').inRange === true);
ok('3 kHz 以上且 >70 岁标记 informative=false', H.ageShift(75, 'male').rows.filter(function (r) { return r.f === 4000; })[0].informative === false);
ok('3 kHz 以下不受 70 岁限制', H.ageShift(75, 'male').rows.filter(function (r) { return r.f === 2000; })[0].informative === true);
ok('高频退化快于低频（65 岁男性 8 kHz > 125 Hz）', H.ageShiftAt(65, 8000, 'male') > H.ageShiftAt(65, 125, 'male'));

console.log('\n[5] WHO 2021 听力分级');
var p1 = H.pta4({ 500: 20, 1000: 25, 2000: 30, 4000: 35 });
ok('PTA4 = 四频算术平均 = 27.5', near(p1.pta, 27.5, 1e-9) && p1.complete === true);
ok('27.5 dB → 1 级 轻度', H.gradeOf(27.5).grade === 1 && H.gradeOf(27.5).name === '轻度');
ok('19.9 dB → 0 级 正常', H.gradeOf(19.9).grade === 0);
ok('20 dB → 1 级 轻度（边界含 20）', H.gradeOf(20).grade === 1);
ok('49.9 dB → 2 级 中度', H.gradeOf(49.9).grade === 2);
ok('64.9 dB → 3 级 中重度', H.gradeOf(64.9).grade === 3);
ok('79.9 dB → 4 级 重度', H.gradeOf(79.9).grade === 4);
ok('94.9 dB → 5 级 极重度', H.gradeOf(94.9).grade === 5);
ok('95 dB → 6 级 全聋（边界含 95）', H.gradeOf(95).grade === 6 && H.gradeOf(95).name === '全聋');
ok('缺失频率按有效项平均', near(H.pta4({ 500: 40, 1000: 40 }).pta, 40, 1e-9) && H.pta4({ 500: 40 }).complete === false);
ok('全部缺失返回 null', H.pta4({}) === null);
var gb = H.gradeBoth(
  { 500: 10, 1000: 10, 2000: 10, 4000: 10 },
  { 500: 40, 1000: 45, 2000: 50, 4000: 55 }
);
ok('双耳：左耳 PTA4 = 10 正常', near(gb.left.pta, 10, 1e-9) && gb.left.grade === 0);
ok('双耳：右耳 PTA4 = 47.5 中度', near(gb.right.pta, 47.5, 1e-9) && gb.right.grade === 2);
ok('双耳：较好耳 = 左', gb.better.ear === '左');
ok('双耳：判定为单侧听力损失', gb.unilateral === true);
var gb2 = H.gradeBoth({ 500: 30, 1000: 30, 2000: 30, 4000: 30 }, { 500: 30, 1000: 30, 2000: 30, 4000: 30 });
ok('双耳对称轻度不判单侧', gb2.unilateral === false);

console.log('\n[6] 听力零级 RETSPL（TDH-39）');
ok('1 kHz RETSPL = 7.0 dB SPL', near(H.retspl(1000).spl, 7.0, 1e-9));
ok('4 kHz RETSPL = 9.5 dB SPL', near(H.retspl(4000).spl, 9.5, 1e-9));
ok('125 Hz RETSPL = 45.0 dB SPL', near(H.retspl(125).spl, 45.0, 1e-9));
ok('8 kHz RETSPL = 13.0 dB SPL', near(H.retspl(8000).spl, 13.0, 1e-9));
ok('750 Hz 为表列点（exact）', H.retspl(750).exact === true && near(H.retspl(750).spl, 8.0, 1e-9));
ok('1000 Hz 40 dB HL → 47.0 dB SPL', near(H.hlToSpl(1000, 40).spl, 47.0, 1e-9), H.hlToSpl(1000, 40).spl);
ok('4 kHz 60 dB HL → 69.5 dB SPL', near(H.hlToSpl(4000, 60).spl, 69.5, 1e-9));
ok('非表列频率插值（700 Hz）', H.retspl(700).exact === false && H.retspl(700).spl > H.retspl(1000).spl && H.retspl(700).spl < H.retspl(500).spl);
ok('超出 125~8 kHz 返回 null', H.retspl(63) === null && H.retspl(10000) === null);

console.log('\n[7] 临界带（Zwicker）与 ERB');
var cb1k = H.criticalBand(1000);
ok('1 kHz 临界带率 z ≈ 8.51 Bark', near(cb1k.z, 8.51, 0.02), cb1k.z);
ok('1 kHz 临界带宽 ≈ 162 Hz', near(cb1k.bw, 162, 1), cb1k.bw);
ok('1 kHz 临界带 919~1081 Hz（表列 920~1080）', near(cb1k.f1, 919, 2) && near(cb1k.f2, 1081, 2), cb1k.f1 + '~' + cb1k.f2);
var cb50 = H.criticalBand(50);
ok('50 Hz 临界带宽 ≈ 100 Hz（低频恒定）', near(cb50.bw, 100, 1), cb50.bw);
ok('50 Hz z ≈ 0.49 Bark', near(cb50.z, 0.49, 0.02), cb50.z);
ok('4 kHz 临界带宽 > 500 Hz', H.criticalBand(4000).bw > 500, H.criticalBand(4000).bw);
ok('临界带随频率单调增宽', H.criticalBand(100).bw < H.criticalBand(1000).bw && H.criticalBand(1000).bw < H.criticalBand(8000).bw);
ok('z(f) 单调递增', H.bark(100) < H.bark(1000) && H.bark(1000) < H.bark(8000));
ok('Bark 上限 ≈ 24（15.5 kHz）', H.bark(15500) > 23 && H.bark(15500) < 25, H.bark(15500));
var e1k = H.erb(1000);
ok('1 kHz ERB ≈ 132.6 Hz', near(e1k.erb, 132.6, 0.1), e1k.erb);
ok('1 kHz ≈ 15.6 ERB', near(e1k.erbs, 15.62, 0.05), e1k.erbs);
ok('ERB < 同频 Bark 带宽（耳蜗滤波更窄）', H.erb(1000).erb < H.criticalBand(1000).bw);
ok('f≤0 返回 null', H.bark(0) === null && H.criticalBand(-5) === null && H.erb(0) === null);

console.log('\n[8] 掩蔽（简化扩散模型）');
var m0 = H.masking(1000, 80, 1000);
ok('同频：带内平顶，掩蔽阈 = 80 dB', m0.flat === true && near(m0.threshold, 80, 1e-9));
var m1 = H.masking(1000, 80, 900);
ok('低于掩蔽声 100 Hz（带外）：阈 ≈ 62 dB', near(m1.threshold, 62, 1), m1.threshold);
ok('下扩散按 −27 dB/Bark', near(m1.threshold, 80 - 27 * Math.abs(m1.dz), 0.2));
var m2 = H.masking(1000, 80, 1200);
ok('高于掩蔽声 200 Hz（带外）：阈 ≈ 56 dB', near(m2.threshold, 56, 1), m2.threshold);
ok('上扩散默认 −20 dB/Bark', near(m2.threshold, 80 - 20 * m2.dz, 0.2));
var m3 = H.masking(1000, 80, 4000);
ok('远离掩蔽声时阈值触底 0', m3.threshold === 0, m3.threshold);
ok('斜率可调：上扩散 −10 dB/Bark', near(H.masking(1000, 80, 1200, { upperSlope: -10 }).threshold, 68, 1));
ok('斜率可调：下扩散 −15 dB/Bark（|Δz| ≈ 0.65 → 70.2）', near(H.masking(1000, 80, 900, { lowerSlope: -15 }).threshold, 70.2, 0.5));
ok('低频掩蔽声对高频几乎无掩蔽（250 Hz 掩蔽 2 kHz）', H.masking(250, 80, 2000).threshold < 40, H.masking(250, 80, 2000).threshold);
ok('高频掩蔽声对低频有扩散掩蔽（2 kHz 掩蔽 1.5 kHz）', near(H.masking(2000, 80, 1500).threshold, 28, 1), H.masking(2000, 80, 1500).threshold);
var spread = H.maskingSpread(1000, 80, [500, 800, 1000, 1200, 1600]);
ok('扩散曲线：带内一点为平顶', spread.filter(function (p) { return p.flat; }).length === 1);
ok('扩散曲线阈值不超过掩蔽声级', spread.every(function (p) { return p.threshold <= 80; }));
ok('参数缺失返回 null', H.masking(1000, null, 500) === null && H.maskingSpread(0, 80, [100]) === null && H.maskingSpread(1000, 80, []) === null);

console.log('\n========== 结果: ' + passed + ' 通过, ' + failed + ' 失败 ==========');
process.exit(failed ? 1 : 0);
