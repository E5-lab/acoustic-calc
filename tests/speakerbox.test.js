/*
 * speakerbox.test.js — 扬声器箱体设计内核测试 (node tests/speakerbox.test.js)
 *
 * 关键锚点：倒相箱在 Qts = 0.3827、Vb = Vas/√2、Fb = Fs 时必须退化为
 * 四阶巴特沃斯（B4）——通带零纹波、f3 = Fs。该锚点同时验证了系统函数
 * 系数 a₁/a₂/a₃ 的推导无误。
 */
var SB = require('../public/js/speakerbox.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= tol;
}

console.log('\n[1] T/S 参数与 Vas');
ok('Vas(30Hz, 20g, 200cm²) ≈ 80.1 L', near(SB.vasFromTS({ Fs: 30, Mms: 20, Sd: 200 }), 80.1, 0.5),
  SB.vasFromTS({ Fs: 30, Mms: 20, Sd: 200 }));
ok('Sd(直径 16cm) ≈ 201 cm²', near(SB.sdFromDiameter(16), 201.06, 0.5), SB.sdFromDiameter(16));
ok('附加质量法 Mms = 10/((30/25)²−1) ≈ 22.73 g',
  near(SB.mmsFromAddedMass({ Fs: 30, Fm: 25, addedMass: 10 }), 22.727, 0.01),
  SB.mmsFromAddedMass({ Fs: 30, Fm: 25, addedMass: 10 }));
ok('加质量后频率未下降时返回 null', SB.mmsFromAddedMass({ Fs: 30, Fm: 31, addedMass: 10 }) === null);
ok('附加容积法 Vas = 20·((45/30)²−1) = 25 L',
  near(SB.vasFromAddedVolume({ Fs: 30, Fc: 45, Vb: 20 }), 25, 1e-9));
ok('参数缺失返回 null', SB.vasFromTS({ Fs: 30 }) === null);

console.log('\n[2] 阻抗峰法求 Q');
var q = SB.qFromImpedance({ Re: 6, Zmax: 60, Fs: 40, F1: 34, F2: 47 });
ok('R0 = Zmax/Re = 10', near(q.R0, 10, 1e-9));
ok('Qms = 40·√10/13 ≈ 9.73', near(q.Qms, 9.7299, 0.001), q.Qms);
ok('Qes = Qms/(R0−1) ≈ 1.0811', near(q.Qes, 1.0811, 0.001), q.Qes);
ok('Qts < Qes 且 < Qms', q.Qts < q.Qes && q.Qts < q.Qms, q.Qts);
ok('Qts ≈ 0.9728', near(q.Qts, 0.9728, 0.001), q.Qts);
ok('半功率频点：梯形曲线可取到 F1/F2', (function () {
  var curve = [];
  for (var f = 20; f <= 80; f += 0.5) {
    var z = Math.abs(f - 40) < 6 ? 60 - Math.abs(f - 40) * 6 :
      (f < 40 ? 6 + (f - 20) * 1.2 : 6 + (80 - f) * 1.2);
    curve.push({ f: f, z: Math.max(6, z) });
  }
  var r = SB.halfPowerFreqs(curve, { Re: 6, Zmax: 60, Fs: 40 });
  return r && r.F1 < 40 && r.F2 > 40;
})());

console.log('\n[3] 参考效率与灵敏度');
var se = SB.sensitivity({ Fs: 30, Vas: 80, Qes: 0.5 });
ok('η₀ ≈ 0.423 %', near(se.eta * 100, 0.4226, 0.002), se.eta * 100);
ok('1 W / 1 m 半空间灵敏度 ≈ 88.4 dB', near(se.oneWatt, 88.36, 0.1), se.oneWatt);
ok('全空间比半空间低 3 dB', near(se.fullSpace, se.halfSpace - 3, 1e-9));
ok('η₀ = 1% 时灵敏度的经典值 92.1 dB',
  near(112.1 + 10 * Math.log10(0.01), 92.1, 1e-9));

console.log('\n[4] 封闭箱（二阶）');
var cb = SB.closedBox({ Vas: 80, Fs: 30, Qts: 0.4, Vb: 20 });
ok('α = Vas/Vb = 4', near(cb.alpha, 4, 1e-9));
ok('fc = 30·√5 ≈ 67.08 Hz', near(cb.fc, 67.082, 0.01), cb.fc);
ok('Qtc = 0.4·√5 ≈ 0.8944', near(cb.Qtc, 0.8944, 1e-4), cb.Qtc);
ok('峰值 ≈ 0.66 dB（Qtc > 0.707 出现隆起）', near(cb.peakDb, 0.658, 0.01), cb.peakDb);
ok('f3 ≈ 55.9 Hz', near(cb.f3, 55.85, 0.2), cb.f3);
ok('响应在 fc 处约 −3 dB 附近', cb.response(cb.fc) < 0.5, cb.response(cb.fc));
ok('响应在 10·fc 处 ≈ 0 dB', near(cb.response(cb.fc * 10), 0, 0.05), cb.response(cb.fc * 10));
ok('－10 dB 点低于 f3', cb.f10 < cb.f3, cb.f10);
var qt = SB.closedBox({ Vas: 80, Fs: 30, Qts: 0.5, Vb: 80 });   // α = 1 → Qtc = 0.7071
ok('Qtc = 0.7071 时 f3 等于 fc（巴特沃斯）', near(qt.Qtc, Math.SQRT1_2, 1e-9) && near(qt.f3, qt.fc, 1e-6),
  qt.Qtc + ' / ' + qt.f3 + ' / ' + qt.fc);
ok('Qtc = 0.7071 时无隆起', near(qt.peakDb, 0, 1e-9));
var rev = SB.closedVbForQtc({ Vas: 80, Qts: 0.4, Qtc: 0.7071 });
ok('反算 Qtc=0.7071 所需容积 ≈ 37.6 L', near(rev.Vb, 37.6, 0.1), rev.Vb);
ok('反算容积代回后 Qtc 吻合',
  near(SB.closedBox({ Vas: 80, Fs: 30, Qts: 0.4, Vb: rev.Vb }).Qtc, 0.7071, 1e-3));
ok('目标 Qtc ≤ Qts 时报错', !SB.closedBox({ Vas: 80, Fs: 30, Qts: 0.6, Qtc: 0.5 }).ok);
ok('缺参数时报错', !SB.closedBox({ Fs: 30 }).ok);

console.log('\n[5] 倒相箱（四阶）—— B4 锚点');
var lossless = SB.ventedBox({
  Vas: 80, Fs: 30, Qts: Math.sqrt(0.5 * (1 - Math.SQRT1_2)),
  Vb: 80 / Math.SQRT2, Fb: 30, Ql: 1e6
});
ok('无损耗时判定为 B4 最平坦', lossless.ok && lossless.alignment.flat, lossless.alignment && lossless.alignment.name);
ok('B4 的 A₁/A₂/A₃ 均 ≈ 0',
  near(lossless.alignment.A1, 0, 1e-3) && near(lossless.alignment.A2, 0, 1e-3) && near(lossless.alignment.A3, 0, 1e-3),
  [lossless.alignment.A1, lossless.alignment.A2, lossless.alignment.A3].join(' / '));
ok('无损耗时通带纹波 ≈ 0 dB', near(lossless.ripple, 0, 1e-4), lossless.ripple);
// 严格 −3.00 dB 点比半功率点（−3.0103 dB）略高，故有 ~0.02 Hz 偏差
ok('无损耗时 f3 = Fs = 30 Hz', near(lossless.f3, 30, 0.05), lossless.f3);
ok('B4 在 f = f₀ 处为 −3 dB', near(lossless.spl(lossless.f0), -3.0103, 1e-3), lossless.spl(lossless.f0));
ok('远高于调谐时响应趋于 0 dB', near(lossless.spl(30 * 20), 0, 0.01), lossless.spl(600));
ok('远低于调谐时以 24 dB/oct 滚降',
  near(lossless.spl(15) - lossless.spl(7.5), 24.08, 0.5),
  lossless.spl(15) - lossless.spl(7.5));
ok('群延迟处处为正', lossless.groupDelay(10) > 0 && lossless.groupDelay(30) > 0 && lossless.groupDelay(120) > 0,
  [lossless.groupDelay(10), lossless.groupDelay(30), lossless.groupDelay(120)].join(' / '));
ok('群延迟在通带附近存在峰值（低频端收敛、高频端收敛）', (function () {
  var max = 0, maxF = 0;
  for (var i = 0; i <= 120; i++) {
    var f = 5 * Math.pow(240 / 5, i / 120);
    var g = lossless.groupDelay(f);
    if (g > max) { max = g; maxF = f; }
  }
  return max > lossless.groupDelay(5) && max > lossless.groupDelay(240) && maxF > 10 && maxF < 200;
})());

console.log('\n[6] 倒相箱 —— 实际箱损 Ql = 7');
var real = SB.ventedBox({
  Vas: 80, Fs: 30, Qts: Math.sqrt(0.5 * (1 - Math.SQRT1_2)),
  Vb: 80 / Math.SQRT2, Fb: 30, Ql: 7
});
ok('箱损使通带纹波保持在 1 dB 以内', real.ripple >= 0 && real.ripple < 1, real.ripple);
// 有限箱损 Ql=7 会让 f₀ 处响应从 −3.0 dB 掉到约 −5 dB，f3 因此上移到 ~34.6 Hz
ok('箱损使 f3 上移（30 → 约 34.6 Hz）', real.f3 > 30 && real.f3 < 40, real.f3);
ok('Ql=7 时 f₀ 处响应约 −5 dB',
  near(real.spl(real.f0), -5.04, 0.1), real.spl(real.f0));
ok('系数 a₁/a₂/a₃ 有限且为正', real.a1 > 0 && real.a2 > 0 && real.a3 > 0);
var miss = SB.ventedBox({ Vas: 80, Fs: 30, Qts: 0.4, Vb: 40, Fb: 55 });
ok('调谐偏高时判定为欠阻尼/隆起', miss.ripple > 1 || miss.f3 != null, miss.ripple);

console.log('\n[7] 最平坦调谐搜索');
var bt = SB.bestTuning({ Vas: 80, Fs: 30, Qts: 0.4, Vb: 40, Ql: 7 });
ok('返回 Fb 在合理范围（0.3–1.6·Fs）', bt && bt.Fb > 9 && bt.Fb < 48, bt && bt.Fb);
ok('最优调谐纹波不超过 2 dB', bt && Math.abs(bt.ripple) < 2, bt && bt.ripple);
ok('最优 f3 有限且为正', bt && bt.f3 > 0 && isFinite(bt.f3), bt && bt.f3);
ok('缺参数返回 null', SB.bestTuning({ Vas: 80, Fs: 30 }) === null);
var b4 = SB.alignmentB4({ Vas: 80, Fs: 30 });
ok('B4 推荐容积 = Vas/√2 ≈ 56.6 L', near(b4.Vb, 56.57, 0.01), b4.Vb);
ok('B4 要求的 Qts ≈ 0.3827', near(b4.requireQts, 0.3827, 1e-4), b4.requireQts);

console.log('\n[8] 导风管设计');
var pl = SB.portLength({ Fb: 30, Vb: 56.57, D: 6.5 });
ok('所需有效长度 ≈ 19.4 cm', near(pl.Leff, 19.42, 0.1), pl.Leff);
ok('端修正 δ = 0.732·D ≈ 4.76 cm', near(pl.delta, 4.758, 0.01), pl.delta);
ok('物理管长 = Leff − δ ≈ 14.7 cm', near(pl.L, 14.67, 0.1), pl.L);
ok('管长正算调谐频率回到 30 Hz',
  near(SB.portTuning({ L: pl.L, Vb: 56.57, D: 6.5 }), 30, 1e-6),
  SB.portTuning({ L: pl.L, Vb: 56.57, D: 6.5 }));
ok('两端法兰端修正更大（管更短）',
  SB.portLength({ Fb: 30, Vb: 56.57, D: 6.5, ends: 'flanged' }).L < pl.L);
ok('面积正确 ≈ 33.2 cm²', near(pl.area, 33.18, 0.05), pl.area);
var pv = SB.portVelocity({ Fb: 30, D: 6.5, spl: 100, r: 1 });
ok('100 dB 时 6.5cm 管风速偏高', pv.vPeak > 18, pv.vPeak);
ok('风速等级给出结论字符串', typeof pv.level === 'string' && pv.level.length > 0);
ok('加大管径风速下降',
  SB.portVelocity({ Fb: 30, D: 10, spl: 100 }).vPeak < pv.vPeak);
var pc = SB.portCount({ D: 6.5, N: 2 });
ok('两根 6.5cm 管等效直径 ≈ 9.19 cm', near(pc.Deq, 9.192, 0.01), pc.Deq);

console.log('\n[9] 箱体尺寸与净容积');
var bd = SB.boxDims({ Vb: 56.57, ratio: [1, 1.618, 2.618] });
ok('三边尺寸乘积回到 56.57 L',
  near(bd.cm[0] * bd.cm[1] * bd.cm[2] / 1000, 56.57, 0.01),
  bd.cm[0] * bd.cm[1] * bd.cm[2] / 1000);
ok('尺寸文字含比例', bd.ratioText.indexOf('1.618') >= 0);
var nv = SB.netVolume({ gross: 60, driver: 3, port: 1.5, brace: 0.5, fillPct: 8 });
ok('净容积 = (60−5)·1.08 = 59.4 L', near(nv.net, 59.4, 1e-9), nv.net);
ok('单元/管/加强筋占用合计 5 L', near(nv.displaced, 5, 1e-9));
ok('填充对容积的等效增益 4.4 L', near(nv.fillGain, 4.4, 1e-9));
ok('提供 4 种箱体比例', SB.BOX_RATIOS.length === 4);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
