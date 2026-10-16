/*
 * linearray.test.js — 线阵列覆盖与指向性内核测试 (node tests/linearray.test.js)
 *
 * 锚点（解析解可核对）：
 *   均匀线阵第一零点   sinθ = λ/(N·d)
 *   均匀线阵第一旁瓣   −13.26 dB（相对主瓣）
 *   栅瓣频率上限       f_max = c/(d·(1+sinθmax))；±90° 时 c/(2d)（即 d < λ/2）
 *   近场过渡           rCyl = L²/(2λ)、rSph = L²/λ
 *   声压衰减           柱面 −3 dB/倍程、球面 −6 dB/倍程
 *   阵列叠加增益       相干 +20lgN、非相干 +10lgN
 *   梳状陷波           f_m = (2m+1)·c/(2·d·sin|θ|)
 */
var LA = require('../public/js/linearray.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= tol;
}

var C = 343;

console.log('\n[1] 阵列因子：单箱与归一化');
var one = LA.arrayFactor({ N: 1, d: 0.3, f: 1000 });
ok('N=1 全向 0 dB', near(one.db(0), 0, 1e-9) && near(one.db(45), 0, 1e-9) && near(one.db(-80), 0, 1e-9));
var uni = LA.arrayFactor({ N: 8, d: 0.25, f: 500 });
ok('主瓣归一化到 0 dB', near(uni.db(0), 0, 1e-9), uni.db(0));
ok('波长 λ = c/f = 0.686 m', near(uni.wavelength, 0.686, 1e-6), uni.wavelength);
ok('N=8 归一化系数 = 8', near(uni.norm, 8, 1e-9));

console.log('\n[2] 均匀线阵：零点 / 波束宽 / 旁瓣（N=8, d=0.25 m, 500 Hz）');
var st = LA.lobeStats(uni);
var lam = C / 500;                                  // 0.686
var nullExact = Math.asin(lam / (8 * 0.25)) / LA.DEG;   // 20.055°
ok('第一零点 sinθ = λ/(N·d) → ±' + nullExact.toFixed(2) + '°',
  near(st.nullHigh, nullExact, 0.35) && near(st.nullLow, -nullExact, 0.35),
  st.nullLow.toFixed(3) + ' / ' + st.nullHigh.toFixed(3));
// 专业音箱标称覆盖角按 −6 dB（声压级）定义：|AF| = 0.5 → u = 1.8955 → 全宽 2·asin(1.8955λ/(Nπd))
var bw6 = 2 * Math.asin(1.8955 * lam / (8 * Math.PI * 0.25)) / LA.DEG;
ok('−6 dB 覆盖角 ≈ 解析值 ' + bw6.toFixed(1) + '°（N=8 非大阵近似）',
  near(st.beamwidth6, bw6, 0.6), st.beamwidth6.toFixed(2));
ok('−6 dB 波束宽约为第一零点宽度的 0.6 倍', near(st.beamwidth6 / (2 * nullExact), 0.6, 0.03), st.beamwidth6 / (2 * nullExact));
// −13.26 dB 是 N→∞ 的极限；有限阵（N=8）第一旁瓣略高，约 −12.8 dB
ok('第一旁瓣 ≈ −12.8 dB（有限阵略高于 −13.26 dB 极限）', near(st.sidelobe.rel, -12.8, 0.3), st.sidelobe.rel);
ok('主瓣指向 0°', near(st.peakDeg, 0, 0.1), st.peakDeg);

var stBig = LA.lobeStats({ N: 64, d: 0.1, f: 500 });
ok('大阵（N=64）第一旁瓣收敛到 −13.26 dB', near(stBig.sidelobe.rel, -13.26, 0.15), stBig.sidelobe.rel);

console.log('\n[3] 电子偏转（steer 向下 20°）');
var str = LA.arrayFactor({ N: 8, d: 0.25, f: 500, steer: -20 });
var sts = LA.lobeStats(str);
ok('主瓣落在 −20°', near(sts.peakDeg, -20, 0.2), sts.peakDeg);
ok('偏转后主瓣电平仍为 0 dB', near(sts.peakDb, 0, 1e-6), sts.peakDb);
ok('相邻单元延时 = d·sin20°/c = 0.2496 ms',
  near(LA.steerDelay({ d: 0.25, steer: 20 }), 0.25 * Math.sin(20 * LA.DEG) / C * 1000, 1e-9),
  LA.steerDelay({ d: 0.25, steer: 20 }));

console.log('\n[4] 幅度锥化抑制旁瓣');
var tp = LA.taper(5, 'cosine', -12);
ok('升余弦锥化两端 = 10^(−12/20) = 0.2512', near(tp[0], 0.2512, 1e-4) && near(tp[4], 0.2512, 1e-4), tp[0]);
ok('升余弦锥化中点 = 1', near(tp[2], 1, 1e-9), tp[2]);
ok('均匀锥化全为 1', LA.taper(6, 'uniform').every(function (v) { return v === 1; }));
var tapered = LA.arrayFactor({ N: 8, d: 0.25, f: 500, taper: LA.taper(8, 'cosine', -12) });
var stp = LA.lobeStats(tapered);
ok('锥化后旁瓣低于均匀阵（' + stp.sidelobe.rel.toFixed(1) + ' dB < −12.8 dB）', stp.sidelobe.rel < -12.8, stp.sidelobe.rel);
ok('锥化后主瓣变宽', stp.beamwidth6 > st.beamwidth6, stp.beamwidth6.toFixed(2) + ' vs ' + st.beamwidth6.toFixed(2));

console.log('\n[5] 栅瓣与单元间距');
ok('d=0.25 m、±90° → f_max = c/(2d) = 686 Hz', near(LA.gratingLimit({ d: 0.25, thetaMax: 90 }), 686, 0.5), LA.gratingLimit({ d: 0.25, thetaMax: 90 }));
ok('d=0.10 m、±90° → 1715 Hz', near(LA.gratingLimit({ d: 0.1, thetaMax: 90 }), 1715, 1), LA.gratingLimit({ d: 0.1, thetaMax: 90 }));
ok('限缩覆盖角 ±45° 可提高上限（1+sin45 = 1.707）',
  near(LA.gratingLimit({ d: 0.25, thetaMax: 45 }), C / (0.25 * (1 + Math.SQRT1_2)), 0.5),
  LA.gratingLimit({ d: 0.25, thetaMax: 45 }));
ok('maxSpacing 与 gratingLimit 互为反解',
  near(LA.maxSpacing({ f: 1000, thetaMax: 90 }), C / 2000, 1e-9) &&
  near(LA.gratingLimit({ d: C / 2000, thetaMax: 90 }), 1000, 0.5));
ok('d=0 返回 null', LA.gratingLimit({ d: 0 }) === null);

console.log('\n[6] 近场 / 远场过渡');
var nf = LA.nearFar({ L: 4, f: 1000 });
ok('λ = 0.343 m', near(nf.wavelength, 0.343, 1e-6), nf.wavelength);
ok('rCyl = L²/(2λ) = 23.32 m', near(nf.rCyl, 16 / 0.686, 0.01), nf.rCyl);
ok('rSph = L²/λ = 46.65 m（= 2·rCyl）', near(nf.rSph, 16 / 0.343, 0.01) && near(nf.rSph, 2 * nf.rCyl, 1e-9), nf.rSph);
var nf2 = LA.nearFar({ L: 8, f: 1000 });
ok('阵列加长一倍，过渡距离变四倍', near(nf2.rCyl, 4 * nf.rCyl, 1e-6), nf2.rCyl);
ok('频率加倍，过渡距离加倍', near(LA.nearFar({ L: 4, f: 2000 }).rCyl, 2 * nf.rCyl, 1e-6));
ok('L=0 返回 null', LA.nearFar({ L: 0, f: 1000 }) === null);

console.log('\n[7] 声压随距离衰减');
ok('球面 1 m → 10 m 衰减 20 dB', near(LA.splAt({ splRef: 100, rRef: 1, r: 10, mode: 'sph' }), 80, 1e-9));
ok('柱面 1 m → 10 m 衰减 10 dB', near(LA.splAt({ splRef: 100, rRef: 1, r: 10, mode: 'cyl' }), 90, 1e-9));
ok('球面每倍距离 −6.02 dB',
  near(LA.splAt({ splRef: 100, rRef: 1, r: 20, mode: 'sph' }) - LA.splAt({ splRef: 100, rRef: 1, r: 10, mode: 'sph' }), -6.0206, 1e-3));
ok('柱面每倍距离 −3.01 dB',
  near(LA.splAt({ splRef: 100, rRef: 1, r: 20, mode: 'cyl' }) - LA.splAt({ splRef: 100, rRef: 1, r: 10, mode: 'cyl' }), -3.0103, 1e-3));
ok('空气吸收 0.01 dB/m、100 m → 再减 1 dB',
  near(LA.splAt({ splRef: 100, rRef: 1, r: 101, mode: 'sph', alpha: 0.01 }), 100 - 40.086 - 1, 0.01));
var cv = LA.splCurve({ splRef: 100, rRef: 1, rFrom: 5, rTo: 80, n: 40 });
ok('曲线 41 点且单调下降', cv.r.length === 41 && cv.sph[0] > cv.sph[40] && cv.cyl[0] > cv.cyl[40]);
ok('同一距离柱面始终高于球面', cv.cyl[20] > cv.sph[20], cv.cyl[20] + ' vs ' + cv.sph[20]);

console.log('\n[8] 阵列叠加增益');
var g8 = LA.arrayGain(8);
ok('8 箱相干 +18.06 dB（+20lg8）', near(g8.coherent, 18.0618, 1e-4), g8.coherent);
ok('8 箱非相干 +9.03 dB（+10lg8）', near(g8.incoherent, 9.0309, 1e-4), g8.incoherent);
ok('1 箱增益 0 dB', near(LA.arrayGain(1).coherent, 0, 1e-12));
ok('箱体翻倍相干 +6 dB', near(LA.arrayGain(16).coherent, g8.coherent + 6.0206, 1e-3));

console.log('\n[9] 覆盖几何（阵列底高 8 m、阵列长 4 m、5~40 m）');
var cg = LA.coverageGeometry({ hBottom: 8, arrayLen: 4, dNear: 5, dFar: 40, boxCoverage: 10, N: 8, splayMax: 5 });
ok('阵列中心高 = 10 m', near(cg.hCenter, 10, 1e-9), cg.hCenter);
ok('近端俯角 atan(10/5) = 63.43°', near(cg.phiNear, 63.435, 0.01), cg.phiNear);
ok('远端俯角 atan(10/40) = 14.04°', near(cg.phiFar, 14.036, 0.01), cg.phiFar);
ok('需要张开的总俯角 = 49.40°', near(cg.spread, 49.399, 0.01), cg.spread);
ok('整体垂直覆盖角 = 总张角 + 单箱覆盖 = 59.40°', near(cg.totalCoverage, 59.399, 0.01), cg.totalCoverage);
ok('8 箱每节张角 = 49.40/7 = 7.06°', near(cg.splayPerJoint, 49.399 / 7, 0.01), cg.splayPerJoint);
ok('单节张角上限 5° → 至少 11 箱', cg.boxesForMaxSplay === 11, cg.boxesForMaxSplay);
ok('近远比 8 → 柱面声压差 9.03 dB', near(cg.spreadDbCyl, 9.0309, 1e-3), cg.spreadDbCyl);
ok('近远比 8 → 球面声压差 18.06 dB', near(cg.spreadDbSph, 18.0618, 1e-3), cg.spreadDbSph);
ok('dNear/dFar 顺序颠倒自动归一', near(LA.coverageGeometry({ hBottom: 8, arrayLen: 4, dNear: 40, dFar: 5 }).spread, 49.399, 0.01));
ok('高度缺失返回 null', LA.coverageGeometry({ hBottom: 0, arrayLen: 4, dNear: 5, dFar: 40 }) === null);

console.log('\n[10] 逐箱张角分配（等角 q=1）');
var sp = LA.splayPlan({ N: 6, phiFar: 14.036, phiNear: 63.435, hBottom: 8, boxH: 0.35 });
ok('总张角 49.40°', near(sp.total, 49.399, 0.01), sp.total);
ok('等角时各节张角相等 = 8.23°', near(sp.splayMax, 49.399 / 6, 0.01) && near(sp.splayMin, 49.399 / 6, 0.01), sp.splayMax);
ok('顶箱瞄准 18.15°（远端内侧半格）', near(sp.boxes[0].aim, 14.036 + 49.399 / 12, 0.01), sp.boxes[0].aim);
ok('底箱瞄准 59.32°（近端内侧半格）', near(sp.boxes[5].aim, 63.435 - 49.399 / 12, 0.01), sp.boxes[5].aim);
ok('顶箱瞄准角最小、底箱最大', sp.boxes[0].aim < sp.boxes[5].aim);
var sumSplay = 0;
for (var i = 1; i < sp.boxes.length; i++) sumSplay += sp.boxes[i].splay;
// 各节张角之和 = 首箱轴到末箱轴的夹角；再加上下两端各半个扇区 = 总覆盖张角
ok('各节张角之和 = 首末箱瞄准角之差', near(sumSplay, sp.boxes[5].aim - sp.boxes[0].aim, 1e-6), sumSplay);
ok('轴间夹角 + 两端半扇区 = 总覆盖张角',
  near(sumSplay + (sp.boxes[0].sector + sp.boxes[5].sector) / 2, sp.total, 1e-6), sumSplay);
ok('顶箱高度 = 底高 + (N−0.5)·箱高 = 9.925 m', near(sp.boxes[0].height, 8 + 5.5 * 0.35, 1e-9), sp.boxes[0].height);
ok('底箱高度 = 底高 + 0.5·箱高 = 8.175 m', near(sp.boxes[5].height, 8 + 0.175, 1e-9), sp.boxes[5].height);
ok('顶箱落点距离 = h/tan(aim) ≈ 30.2 m', near(sp.boxes[0].distance, sp.boxes[0].height / Math.tan(sp.boxes[0].aim * LA.DEG), 1e-6), sp.boxes[0].distance);
ok('顶箱落点远于底箱', sp.boxes[0].distance > sp.boxes[5].distance, sp.boxes[0].distance + ' vs ' + sp.boxes[5].distance);

console.log('\n[11] J 形渐进曲率（q=2）');
var sj = LA.splayPlan({ N: 6, phiFar: 14.036, phiNear: 63.435, hBottom: 8, boxH: 0.35, q: 2 });
ok('底部张角大于顶部（J 形）', sj.boxes[5].splay > sj.boxes[1].splay, sj.boxes[5].splay + ' vs ' + sj.boxes[1].splay);
var sumJ = 0;
for (var j = 1; j < sj.boxes.length; j++) sumJ += sj.boxes[j].splay;
ok('渐进分配仍满足轴间夹角 = 各节张角之和', near(sumJ, sj.boxes[5].aim - sj.boxes[0].aim, 1e-6), sumJ);
ok('J 形顶部扇区更小 → 首箱瞄准更贴近远端（14.43° < 18.15°）',
  sj.boxes[0].aim < sp.boxes[0].aim && near(sj.boxes[0].aim, 14.428, 0.01), sj.boxes[0].aim);
ok('J 形首末箱轴间夹角小于等角方案（能量更集中于远端）', sumJ < sumSplay, sumJ + ' vs ' + sumSplay);
ok('q≤0 退化为等角', near(LA.splayPlan({ N: 6, phiFar: 14.036, phiNear: 63.435, q: 0 }).splayMax, 49.399 / 6, 0.01));

console.log('\n[12] 梳状滤波与临界间距');
var cb = LA.comb({ d: 0.5, theta: 90, n: 3 });
ok('路程差 = d·sin90° = 0.5 m', near(cb.pathDiff, 0.5, 1e-9), cb.pathDiff);
ok('首个陷波 f₀ = c/(2Δ) = 343 Hz', near(cb.freqs[0], 343, 0.5), cb.freqs[0]);
ok('陷波为奇数倍：343 / 1029 / 1715 Hz',
  near(cb.freqs[1], 1029, 1) && near(cb.freqs[2], 1715, 1), cb.freqs.join(' / '));
ok('陷波间隔 = c/Δ = 686 Hz', near(cb.spacing, 686, 0.5), cb.spacing);
var cb2 = LA.comb({ d: 0.5, theta: 30, n: 1 });
ok('偏角 30° 时路程差减半 → 首个陷波 686 Hz', near(cb2.freqs[0], 686, 1), cb2.freqs[0]);
ok('正对（0°）无梳状 → null', LA.comb({ d: 0.5, theta: 0 }) === null);
ok('d=0 返回 null', LA.comb({ d: 0, theta: 90 }) === null);
var cs = LA.combSpacing({ f: 10000, theta: 90 });
ok('10 kHz 全空间临界间距 = 17.15 mm（< λ/2）', near(cs.dMax, 0.01715, 1e-5), cs.dMax);
ok('临界间距与陷波公式互逆', near(LA.comb({ d: cs.dMax, theta: 90, n: 1 }).freqs[0], 10000, 1));

console.log('\n[13] 指向性扫描输出');
var dir = LA.directivity({ N: 8, d: 0.25, f: 500 }, { from: -90, to: 90, step: 1 });
ok('−90~90° 步长 1° 共 181 点', dir.length === 181, dir.length);
ok('每点含 theta 与 db 且 db ≤ 0', dir.every(function (p) { return typeof p.db === 'number' && p.db <= 1e-9; }));
ok('旁瓣起伏存在（出现低于 −13 dB 的谷）', dir.some(function (p) { return p.db < -20; }));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
