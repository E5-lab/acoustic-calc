/*
 * calc-b3.test.js — 声明式计算器 · 心理与音乐声学（纯函数单测，参照 calc-b7.test.js 写法）
 *
 * 运行：node tests/calc-b3.test.js
 * 注意：compute 为纯函数，可在 Node 直接调用，无需 DOM。
 */
'use strict';

require('../public/js/calc-core.js');
require('../public/js/calc-b3.js');

var passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var R = CalcRegistry;

console.log('\n[calc-b3] 路由登记');
['cents', 'bark-erb', 'chord', 'masking', 'loudness-zwicker'].forEach(function (rt) {
  assert('已登记 ' + rt, !!R.get(rt));
});
assert('nav.group = 心理与音乐声学', R.get('cents').nav.group === '心理与音乐声学' && R.get('masking').nav.group === '心理与音乐声学');

// ---------------------------------------------------------------- cents
console.log('\n[calc-b3] 音分 ↔ 频率');
var c1 = R.get('cents').compute({ n: 1200, f0: 440 });
assert('八度 1200 音分 → 频率比 2', near(c1.values.ratio, 2, 1e-9), c1.values.ratio);
assert('440 Hz 升八度 = 880 Hz', near(c1.values.f, 880, 1e-9), c1.values.f);
assert('1200 音分 = 12 半音', near(c1.values.semi, 12, 1e-9));
var c2 = R.get('cents').compute({ n: 100, f0: 440 });
assert('半音 100 音分 → 2^(1/12) = 1.059463', near(c2.values.ratio, 1.0594631, 1e-6), c2.values.ratio);
var c3 = R.get('cents').compute({ n: 701.955, f0: 261.63 });
assert('纯五度 701.955 音分 → 3/2 = 1.5', near(c3.values.ratio, 1.5, 1e-4), c3.values.ratio);
var c4 = R.get('cents').compute({ n: 0, f0: 440 });
assert('0 音分 → 频率不变 440 Hz', near(c4.values.f, 440, 1e-9));
var c5 = R.get('cents').compute({ n: -1200, f0: 440 });
assert('降八度 → 220 Hz', near(c5.values.f, 220, 1e-9));

// ---------------------------------------------------------------- bark-erb
console.log('\n[calc-b3] 临界带 Bark / ERB');
var b1 = R.get('bark-erb').compute({ f: 1000 });
assert('1 kHz → z ≈ 8.505 Bark', near(b1.values.z, 8.505, 0.01), b1.values.z);
assert('1 kHz → 临界带带宽 ≈ 162.2 Hz', near(b1.values.cb, 162.2, 0.5), b1.values.cb);
assert('1 kHz → ERB ≈ 132.64 Hz', near(b1.values.erb, 132.64, 0.1), b1.values.erb);
assert('1 kHz → ERB 序号 ≈ 15.62', near(b1.values.erbn, 15.62, 0.02), b1.values.erbn);
var b2 = R.get('bark-erb').compute({ f: 100 });
assert('100 Hz → z ≈ 0.986 Bark', near(b2.values.z, 0.986, 0.01), b2.values.z);
var b3 = R.get('bark-erb').compute({ f: 15500 });
assert('15.5 kHz → z ≈ 24 Bark', near(b3.values.z, 24, 0.3), b3.values.z);
assert('ERB 随频率单调增', b3.values.erb > b2.values.erb && b2.values.erb > R.get('bark-erb').compute({ f: 50 }).values.erb);

// ---------------------------------------------------------------- chord
console.log('\n[calc-b3] 和弦 / 音程频率');
var h1 = R.get('chord').compute({ f0: 100, kind: 'P8' });
assert('纯八度 → 200 Hz', near(h1.values.f2, 200, 1e-9));
assert('纯八度 = 1200 音分', near(h1.values.cents, 1200, 1e-9));
var h2 = R.get('chord').compute({ f0: 100, kind: 'P5' });
assert('纯五度 → 150 Hz（3/2）', near(h2.values.f2, 150, 1e-9));
assert('纯五度 = 701.955 音分', near(h2.values.cents, 701.955, 1e-3), h2.values.cents);
var h3 = R.get('chord').compute({ f0: 100, kind: 'M3' });
assert('大三度 → 125 Hz（5/4）', near(h3.values.f2, 125, 1e-9));
assert('大三度 = 386.314 音分', near(h3.values.cents, 386.314, 1e-3), h3.values.cents);
var h4 = R.get('chord').compute({ f0: 100, kind: 'm3' });
assert('小三度 → 120 Hz（6/5）', near(h4.values.f2, 120, 1e-9));
assert('小三度 = 315.641 音分', near(h4.values.cents, 315.641, 1e-3), h4.values.cents);
var h5 = R.get('chord').compute({ f0: 100, kind: 'P4' });
assert('纯四度 → 133.333 Hz（4/3）', near(h5.values.f2, 400 / 3, 1e-9));
assert('纯四度 = 498.045 音分', near(h5.values.cents, 498.045, 1e-3), h5.values.cents);
var h6 = R.get('chord').compute({ f0: 100, kind: 'triad-M' });
assert('大三和弦 4:5:6 → 100/125/150 Hz',
  near(h6.values.f1, 100, 1e-9) && near(h6.values.f2, 125, 1e-9) && near(h6.values.f3, 150, 1e-9));
var h7 = R.get('chord').compute({ f0: 100, kind: 'triad-m' });
assert('小三和弦 10:12:15 → 100/120/150 Hz',
  near(h7.values.f1, 100, 1e-9) && near(h7.values.f2, 120, 1e-9) && near(h7.values.f3, 150, 1e-9));
var h8 = R.get('chord').compute({ f0: 100, kind: 'm2' });
assert('小二度 → 106.667 Hz（16/15）', near(h8.values.f2, 1600 / 15, 1e-9));
assert('小二度 = 111.731 音分', near(h8.values.cents, 111.731, 1e-3), h8.values.cents);
var h9 = R.get('chord').compute({ f0: 100, kind: 'M6' });
assert('大六度 → 166.667 Hz（5/3）', near(h9.values.f2, 500 / 3, 1e-9));
assert('单音程模式第三音为空', isNaN(h1.values.f3) && isNaN(h2.values.f3));

// ---------------------------------------------------------------- masking
console.log('\n[calc-b3] 临界带掩蔽阈值');
var m1 = R.get('masking').compute({ fm: 1000, Lm: 70, fp: 1000, Lp: 50 });
assert('掩蔽声本频带：z_m ≈ 8.505 Bark', near(m1.values.zm, 8.505, 0.01), m1.values.zm);
assert('掩蔽声临界带带宽 ≈ 162.2 Hz', near(m1.values.cbm, 162.2, 0.5), m1.values.cbm);
assert('f_p = f_m 处阈值 = 掩蔽级 70 dB', near(m1.values.Tm, 70, 1e-6), m1.values.Tm);
assert('50 dB 探测声被掩蔽（余量 −20）', near(m1.values.margin, -20, 1e-6), m1.values.margin);
var m2 = R.get('masking').compute({ fm: 1000, Lm: 70, fp: 2000, Lp: 50 });
assert('2 kHz 处阈值 ≈ 29.64 dB（上扩散）', near(m2.values.Tm, 29.64, 0.05), m2.values.Tm);
assert('2 kHz/50 dB 可闻（余量 ≈ +20.4）', near(m2.values.margin, 20.36, 0.05), m2.values.margin);
var m3 = R.get('masking').compute({ fm: 1000, Lm: 70, fp: 500, Lp: 50 });
assert('500 Hz 处阈值 = 安静听阈 ≈ 6.28 dB（下扩散衰减殆尽）', near(m3.values.Tm, 6.28, 0.05), m3.values.Tm);
assert('500 Hz/50 dB 可闻（余量 ≈ +43.7）', near(m3.values.margin, 43.72, 0.05), m3.values.margin);
assert('有效掩蔽下限在 500~700 Hz 之间', m1.values.fLo > 500 && m1.values.fLo < 700, m1.values.fLo);
assert('有效掩蔽上限在 4~6 kHz 之间', m1.values.fHi > 4000 && m1.values.fHi < 6000, m1.values.fHi);
var m4 = R.get('masking').compute({ fm: 4000, Lm: 70, fp: 1000, Lp: 50 });
assert('高频掩蔽声对 1 kHz 几乎无掩蔽（阈值≈听阈 3.37）', near(m4.values.Tm, 3.37, 0.05), m4.values.Tm);
var m5 = R.get('masking').compute({ fm: 0, Lm: 70, fp: 1000, Lp: 50 });
assert('非法频率返回 ok=false', m5.ok === false && typeof m5.error === 'string');
var m6 = R.get('masking').compute({ fm: 1000, Lm: 40, fp: 1000, Lp: 50 });
assert('40 dB 掩蔽级下同频 50 dB 可闻', m6.values.margin > 0 && m6.ok === true);

// ---------------------------------------------------------------- loudness-zwicker
console.log('\n[calc-b3] Zwicker 响度（简化 ISO 532B）');
var LZ = R.get('loudness-zwicker');
var z1 = LZ.compute({ L125: 0, L250: 0, L500: 0, L1000: 70, L2000: 0, L4000: 0, L8000: 0 });
assert('1 kHz/70 dB 纯音：N 在 5~10 sone（ISO 532 全模型 8）', z1.values.N > 5 && z1.values.N < 10, z1.values.N);
assert('1 kHz/70 dB：响度级 60~73 phon', z1.values.LN > 60 && z1.values.LN < 73, z1.values.LN);
assert('N≥1 时 sone→phon 与 ISO 关系一致',
  near(Math.pow(2, (z1.values.LN - 40) / 10), z1.values.N, z1.values.N * 0.02), z1.values.LN);
assert('峰值位置在 1 kHz 附近（7.5~9.5 Bark）', z1.values.zpeak > 7.5 && z1.values.zpeak < 9.5, z1.values.zpeak);
var z2 = LZ.compute({ L125: 0, L250: 0, L500: 0, L1000: 0, L2000: 0, L4000: 0, L8000: 0 });
assert('全零输入：N≈0 且不报错', z2.values.N < 0.001 && z2.ok === true, z2.values.N);
assert('N<1 用低响度分支（phon < 40）', z2.values.LN < 40 && z2.values.LN > 0, z2.values.LN);
var z3 = LZ.compute({ L125: 62, L250: 66, L500: 68, L1000: 70, L2000: 69, L4000: 64, L8000: 58 });
assert('默认频谱（宽带约 70 dB）：N 为几十 sone 量级', z3.values.N > 10 && z3.values.N < 200, z3.values.N);
assert('响度级与 N 单调对应', z3.values.LN > z1.values.LN);
var z4 = LZ.compute({ L125: 72, L250: 76, L500: 78, L1000: 80, L2000: 79, L4000: 74, L8000: 68 });
assert('各频带 +10 dB → 响度约翻倍（Stevens 幂律）', z4.values.N > z3.values.N * 1.7 && z4.values.N < z3.values.N * 2.4,
  z4.values.N / z3.values.N);
assert('compute 为纯函数：两次调用结果一致',
  JSON.stringify(z1.values) === JSON.stringify(LZ.compute({ L125: 0, L250: 0, L500: 0, L1000: 70, L2000: 0, L4000: 0, L8000: 0 }).values));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
