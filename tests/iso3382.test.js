/*
 * iso3382.test.js — 厅堂音质参数量测内核测试 (node tests/iso3382.test.js)
 *
 * 锚点：
 *   纯指数衰减（Schroeder 曲线 L(t) = −60t/T，T = 2.0 s）解析值：
 *     EDT = T30 = 2.00 s；C80 = 10lg((1−10^(−0.24))/10^(−0.24)) = −1.321 dB；
 *     C50 = 10lg((1−10^(−0.15))/10^(−0.15)) = −3.851 dB；
 *     D50 = 1 − 10^(−0.15) = 0.2921；Ts = T/(6·ln10) = 144.76 ms
 *   ISO 3382-1 Annex A：G = L_pE − L_pE,10；由声功率级换算 G = L_pE − L_W + 31 dB
 *     （10lg(4π·10²) = 30.99，ρc = 400 约定；G = 0 ↔ 10 m 自由场，G = 20 ↔ 1 m）
 *   LF = 10^((L_fig8 − L_omni)/10)；LJ = L_ll − L_W + 31 dB
 *   ITDG：直达与第一显著反射（默认 −20 dB 阈值）时间差；Beranek < 20 ms 亲切
 *   默认例题自校验：衰减曲线示例各指标落在 ISO 3382-1 Table A.1 区间
 */
var I = require('../public/js/iso3382.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= tol;
}

/* 纯指数 Schroeder 衰减曲线：L(t) = −60·t/T */
function exponential(T, stepMs, endMs) {
  var pts = [];
  for (var t = 0; t <= endMs; t += stepMs) pts.push({ t: t, level: -60 * t / (T * 1000) });
  return pts;
}

console.log('\n[1] 数据解析');
var d1 = I.parseDecay('# 注释\n0  0\n50  -1.5\n100\t-3.0\n150, -4.5\n200; -6\n\n坏行\n250 -7.5');
ok('解析 6 个点（跳过注释/空行/坏行）', d1.count === 6, d1.count);
ok('记录 1 条坏行', d1.bad.length === 1, d1.bad.length);
ok('按时间排序', d1.points[5].t === 250 && d1.points[0].t === 0);
ok('支持制表符/逗号/分号分隔', d1.points[1].level === -1.5 && d1.points[3].level === -4.5 && d1.points[5].level === -7.5);
var d2 = I.parseDecay('300 -9\n100 -3\n200 -6');
ok('乱序输入自动排序', d2.points[0].t === 100 && d2.points[2].t === 300);
var ir1 = I.parseIR('0 0 0\n2 1.0 0.95\n4 0.5 0.45');
ok('双耳 IR 三列解析', ir1.count === 3 && ir1.hasRight && ir1.points[1].r === 0.95);
var ir2 = I.parseIR('0 0\n2 1.0\n4 0.5');
ok('两列 IR 标记为无右耳', ir2.count === 3 && !ir2.hasRight);
var mo1 = I.parseMono('0 0\n2 1.0\n4 0.5');
ok('单耳 IR 两列解析', mo1.count === 3 && mo1.points[1].p === 1.0);

console.log('\n[2] 衰减曲线拟合（纯指数解析校验，T = 2.0 s）');
var ex = exponential(2, 5, 3000);
ok('T30 = 2.00 s', near(I.t30(ex).rt, 2.0, 0.01), I.t30(ex).rt);
ok('EDT = 2.00 s', near(I.edt(ex).rt, 2.0, 0.01), I.edt(ex).rt);
ok('T20 = 2.00 s', near(I.t20(ex).rt, 2.0, 0.01), I.t20(ex).rt);
ok('T30 斜率 = −30 dB/s', near(I.t30(ex).slope, -30, 0.1), I.t30(ex).slope);
ok('T30 拟合 R² ≈ 1', near(I.t30(ex).r2, 1, 0.001), I.t30(ex).r2);
ok('T30 拟合窗为 −5~−35 dB（t1≈170 ms, t2≈1165 ms，5 ms 采样落在窗内）',
  near(I.t30(ex).t1, 170, 3) && near(I.t30(ex).t2, 1165, 6), I.t30(ex).t1 + '~' + I.t30(ex).t2);
ok('T30 拟合点覆盖 30 dB 窗宽', near(I.t30(ex).coveredDb, 30, 0.2), I.t30(ex).coveredDb);
var partial = exponential(2, 5, 400); // 仅衰减 12 dB
ok('窗未全覆盖时给出覆盖度提示', I.decayReport(partial).warn.some(function (w) { return w.indexOf('T30 拟合窗仅覆盖') === 0; }),
  JSON.stringify(I.decayReport(partial).warn));
var tinyCurve = exponential(2, 5, 100); // 仅 3 dB，窗内无点
ok('跨度不足时 T30 报 window-too-few-points', I.t30(tinyCurve).error === 'window-too-few-points', I.t30(tinyCurve).error);
var rising = [{ t: 0, level: 0 }, { t: 50, level: -1 }, { t: 100, level: -2 }, { t: 150, level: -3 }, { t: 200, level: -4 }];
ok('拟合窗内点太少报错', I.fitDecay(rising, -20, -30).error === 'window-too-few-points', I.fitDecay(rising, -20, -30).error);
var tooFew = [{ t: 0, level: 0 }, { t: 50, level: -1 }];
ok('点数 < 3 报 too-few-points', I.fitDecay(tooFew, 0, -10).error === 'too-few-points', I.fitDecay(tooFew, 0, -10).error);

console.log('\n[3] C50 / C80 / D50 / Ts（解析校验）');
ok('C80 = −1.321 dB', near(I.clarity(ex, 80).c, -1.321, 0.02), I.clarity(ex, 80).c);
ok('C50 = −3.851 dB', near(I.clarity(ex, 50).c, -3.851, 0.02), I.clarity(ex, 50).c);
ok('C50 < C80（窗越早比值越小）', I.clarity(ex, 50).c < I.clarity(ex, 80).c);
ok('D50 = 0.292', near(I.d50(ex).d50, 0.292, 0.005), I.d50(ex).d50);
ok('Ts = 144.8 ms', near(I.centerTime(ex).tsMs, 144.8, 0.5), I.centerTime(ex).tsMs);
ok('D50 与 C50 自洽：C50 = 10lg(D50/(1−D50))',
  near(I.d50(ex).c50, 10 * Math.log(0.2921 / (1 - 0.2921)) / Math.LN10, 0.05), I.d50(ex).c50);
ok('指数衰减 Ts 与 C80 同号单调（Ts 大 → C80 小）',
  (function () { var e2 = exponential(3, 5, 4000); return I.centerTime(e2).tsMs > I.centerTime(ex).tsMs && I.clarity(e2, 80).c < I.clarity(ex, 80).c; })());

console.log('\n[4] 双折线（示例曲线）：EDT < T30');
var decPts = I.parseDecay(I.exampleDecay()).points;
ok('示例曲线 EDT ≈ 1.73 s < T30 ≈ 1.90 s', near(I.edt(decPts).rt, 1.73, 0.05) && near(I.t30(decPts).rt, 1.9, 0.05),
  'EDT=' + I.edt(decPts).rt + ' T30=' + I.t30(decPts).rt);
ok('EDT/T30 ≈ 0.91', near(I.decayReport(decPts).edtOverT30, 0.91, 0.02), I.decayReport(decPts).edtOverT30);

console.log('\n[5] 默认例题自校验（Table A.1 区间）');
var rep = I.decayReport(decPts);
ok('衰减跨度 ≥ 30 dB 且无警告', rep.spanDb <= -30 && rep.warn.length === 0, JSON.stringify(rep.warn));
ok('EDT 在 1~3 s', I.checkTarget('EDT', rep.edt.rt).inRange);
ok('C80 在 −5~+5 dB', I.checkTarget('C80', rep.c80.c).inRange, rep.c80.c);
ok('D50 在 30~70 %', I.checkTarget('D50', rep.d50.d50pct).inRange, rep.d50.d50pct);
ok('Ts 在 60~260 ms', I.checkTarget('Ts', rep.tsMs).inRange, rep.tsMs);
ok('示例曲线含 65 个点', I.parseDecay(I.exampleDecay()).count === 65, I.parseDecay(I.exampleDecay()).count);
var itdgEx = I.itdg(I.parseMono(I.exampleMono()).points, -20);
ok('单耳示例 ITDG = 16 ms（< 20 ms，Beranek 亲切）', itdgEx.itdg === 16 && itdgEx.beranek === 'beranek-intimate', JSON.stringify(itdgEx));
ok('单耳示例第一反射比直达低 6 dB', near(itdgEx.reflLevel, -6, 0.1), itdgEx.reflLevel);
var iaccEx = I.iacc(I.parseIR(I.exampleBinaural()).points);
ok('双耳示例 IACC ≈ 0.43（现实区间 0.25~0.55）', near(iaccEx.iacc, 0.43, 0.05), iaccEx.iacc);
ok('双耳示例峰值时延 ≈ 0 ms', near(iaccEx.tauMs, 0, 0.05), iaccEx.tauMs);

console.log('\n[6] 强度 G（ISO 3382-1 Annex A）');
ok('G_CONST = 31.0', I.G_CONST === 31.0, I.G_CONST);
ok('G = L_pE − L_pE,10', I.strengthFromRef(78, 73).g === 5, I.strengthFromRef(78, 73).g);
ok('G = L_pE − L_W + 31', I.strengthFromLW(78, 105).g === 4, I.strengthFromLW(78, 105).g);
ok('L_pE,10 = L_W − 31 时 G = 0（10 m 自由场参考自洽）',
  I.strengthFromLW(105 - 31, 105).g === 0, I.strengthFromLW(105 - 31, 105).g);
ok('G = 0 ↔ 10 m 自由场', near(I.freeFieldDistance(0).dEq, 10, 0.01));
ok('G = +20 ↔ 1 m 自由场', near(I.freeFieldDistance(20).dEq, 1, 0.01));
ok('G = −6 ↔ 20 m 自由场（10·10^0.3 = 19.95）', near(I.freeFieldDistance(-6).dEq, 19.95, 0.02), I.freeFieldDistance(-6).dEq);
ok('strengthFromLW 非法输入返回 null', I.strengthFromLW(null, 100) === null && I.strengthFromLW('x', 100) === null);

console.log('\n[7] 侧向参数 LF / LJ');
var lf = I.lateralFraction(72, 65);
ok('LF = 10^((65−72)/10) = 0.2', near(lf.lf, 0.2, 0.001) && lf.lfPct === 20, lf.lf);
ok('LF 上下界：全向 = 8 字时 LF = 1', near(I.lateralFraction(70, 70).lf, 1, 0.001));
ok('LJ = L_ll − L_W + 31', I.lateLateralLevel(60, 105).lj === -14, I.lateLateralLevel(60, 105).lj);

console.log('\n[8] IACC');
var mono = [];
for (var t = 0; t <= 200; t += 2) mono.push({ t: t, l: Math.sin(t / 7), r: Math.sin(t / 7) });
var icSame = I.iacc(mono);
ok('左右完全相同 → IACC = 1', near(icSame.iacc, 1, 0.001), icSame.iacc);
ok('完全相同时峰值时延 = 0 ms', near(icSame.tauMs, 0, 0.001), icSame.tauMs);
var anti = mono.map(function (q) { return { t: q.t, l: q.l, r: -q.r }; });
ok('左右反相 → |IACC| = 1', near(I.iacc(anti).iacc, 1, 0.001), I.iacc(anti).iacc);
ok('1 − IACC 同步给出', near(icSame.oneMinusIacc, 0, 0.001));
var uneven = [{ t: 0, l: 1, r: 1 }, { t: 2, l: 1, r: 1 }, { t: 5, l: 1, r: 1 }, { t: 7, l: 1, r: 1 }, { t: 9, l: 1, r: 1 }];
ok('非均匀采样报 non-uniform', I.iacc(uneven).error === 'non-uniform', I.iacc(uneven).error);
var noRight = [{ t: 0, l: 1 }, { t: 2, l: 1 }, { t: 4, l: 1 }, { t: 6, l: 1 }];
ok('缺右耳报 missing-channel', I.iacc(noRight).error === 'missing-channel', I.iacc(noRight).error);
ok('互相关曲线覆盖 ±1 ms', (function () {
  var c = icSame.curve;
  return c.length === 41 && near(c[0].tauMs, -1, 0.001) && near(c[c.length - 1].tauMs, 1, 0.001);
})(), icSame.curve.length);

console.log('\n[9] ITDG');
ok('默认阈值 −20 dB 找到 18 ms 反射', I.itdg(I.parseMono(I.exampleMono()).points).itdg === 16);
ok('阈值 −3 dB 时无显著反射 → itdg = null',
  I.itdg(I.parseMono(I.exampleMono()).points, -3).itdg === null, JSON.stringify(I.itdg(I.parseMono(I.exampleMono()).points, -3)));
ok('阈值 −10 dB 仍为 16 ms', I.itdg(I.parseMono(I.exampleMono()).points, -10).itdg === 16);
var noRefl = [{ t: 0, p: 0 }, { t: 2, p: 1 }, { t: 4, p: 0 }, { t: 6, p: 0.05 }, { t: 8, p: 0 }];
ok('反射低于阈值 → itdg = null 且带说明', I.itdg(noRefl, -20).itdg === null && !!I.itdg(noRefl, -20).note);
ok('Beranek 判据分档：16 ms 亲切 / 30 ms 中等 / 60 ms 空旷',
  (function () {
    var a = I.itdg([{ t: 0, p: 0 }, { t: 2, p: 1 }, { t: 4, p: 0 }, { t: 18, p: 0.5 }, { t: 20, p: 0 }]);
    var b = I.itdg([{ t: 0, p: 0 }, { t: 2, p: 1 }, { t: 4, p: 0 }, { t: 32, p: 0.5 }, { t: 34, p: 0 }]);
    var c = I.itdg([{ t: 0, p: 0 }, { t: 2, p: 1 }, { t: 4, p: 0 }, { t: 62, p: 0.5 }, { t: 64, p: 0 }]);
    return a.itdg === 16 && a.beranek === 'beranek-intimate' &&
      b.itdg === 30 && b.beranek === 'beranek-moderate' &&
      c.itdg === 60 && c.beranek === 'beranek-large';
  })());

console.log('\n[10] BR 低音比与目标值表');
ok('BR = (T125+T250)/(T500+T1000)', near(I.bassRatio(2.4, 2.0, 1.9, 1.8).br, 1.19, 0.01), I.bassRatio(2.4, 2.0, 1.9, 1.8).br);
ok('BR ≥ 1.1 → warm', I.bassRatio(2.4, 2.0, 1.9, 1.8).verdict === 'warm');
ok('BR ≈ 1 → balanced', I.bassRatio(1.95, 1.95, 1.95, 1.95).verdict === 'balanced');
ok('BR < 1 → lean', I.bassRatio(1.6, 1.5, 1.9, 1.8).verdict === 'lean');
ok('分母为 0 返回 null', I.bassRatio(2, 2, 0, 0) === null);
ok('Table A.1 含 7 项', I.TARGETS.length === 7, I.TARGETS.length);
ok('Table A.1 区间与标准一致（G −2~+10、EDT 1~3、C80 −5~+5、D50 30~70、Ts 60~260、LF 5~35、LJ −14~+1）',
  (function () {
    var m = {};
    I.TARGETS.forEach(function (t) { m[t.key] = [t.min, t.max]; });
    return JSON.stringify(m.G) === '[-2,10]' && JSON.stringify(m.EDT) === '[1,3]' &&
      JSON.stringify(m.C80) === '[-5,5]' && JSON.stringify(m.D50) === '[30,70]' &&
      JSON.stringify(m.Ts) === '[60,260]' && JSON.stringify(m.LF) === '[5,35]' &&
      JSON.stringify(m.LJ) === '[-14,1]';
  })());
ok('checkTarget 越界检出', I.checkTarget('C80', 7).inRange === false && I.checkTarget('C80', 0).inRange === true);
ok('文献厅种目标 3 类 × 9 项', I.VENUE_TARGETS.length === 3 && I.VENUE_TARGETS.every(function (v) { return v.rows.length === 9; }));
ok('T30 按用途 6 档', I.T30_BY_USE.length === 6);
ok('厅种目标区间单调合理（交响 EDT < 室内乐 G 下限 < 室内乐 G 上限）',
  I.VENUE_TARGETS[0].rows[1].min < I.VENUE_TARGETS[1].rows[6].min && I.VENUE_TARGETS[1].rows[6].min < I.VENUE_TARGETS[1].rows[6].max);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
