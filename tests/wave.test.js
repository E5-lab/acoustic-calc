/*
 * wave.test.js — 波动与乐音计算内核测试 (node tests/wave.test.js)
 *
 * 锚点（可核对的公认数值）：
 *   干空气声速 0 ℃ = 331.4 m/s、20 ℃ ≈ 343 m/s；湿度升高声速略增
 *   20 ℃ 空气密度 1.204 kg/m³、特性声阻抗 Z = ρc ≈ 413 Pa·s/m（Rayl）
 *   纯水声速 20 ℃ = 1482 m/s（UNESCO/Marczak）
 *   λ = c/f：1 kHz 空气中 0.343 m
 *   自由场 I = P/(4πr²)，Lw = 60 dB（1 µW）时 r = 1 m 处 Lp = 49 dB
 *   空气→水界面透射损失 ≈ 29.5 dB；空气→钢 ≈ 44.5 dB
 *   功率比 2 → 3.01 dB，场量比 2 → 6.02 dB
 *   A4 = 440 Hz，C4 = 261.63 Hz，纯五度 = 7 半音 = 702 音分
 *   开管 f₁ = c/2L、闭管 f₁ = c/4L（仅奇次谐波）
 *   多普勒：声源以 0.1 Ma 靠近 → f′ = f/(1−0.1) = 1.111 f
 */
var W = require('../public/js/wave.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= tol;
}

console.log('\n[1] 空气中声速');
var cd0 = W.soundSpeedAir({ temp: 0, rh: 0 });
ok('0 ℃ 干空气 = 331.4 m/s', near(cd0.c, 331.4, 0.5), cd0.c);
var cd20 = W.soundSpeedAir({ temp: 20, rh: 0 });
ok('20 ℃ 干空气 ≈ 343.3 m/s', near(cd20.c, 343.3, 0.6), cd20.c);
ok('简化式 331.4 + 0.6T = 343.4', near(cd20.simple, 343.4, 1e-9), cd20.simple);
ok('开方式 331.3·√(T_K/273.15) = 343.2', near(cd20.sqrt, 343.2, 0.1), cd20.sqrt);
ok('三式相差 < 0.3 m/s（工程一致）', Math.abs(cd20.c - cd20.simple) < 0.3 && Math.abs(cd20.c - cd20.sqrt) < 0.3);
var cw = W.soundSpeedAir({ temp: 20, rh: 100 });
ok('饱和湿空气声速高于干空气', cw.c > cd20.c, cw.c.toFixed(2) + ' vs ' + cd20.c.toFixed(2));
ok('20 ℃ 饱和湿空气 ≈ 344.6 m/s（+0.4 %）', near(cw.c, 344.6, 0.8), cw.c);
ok('干空气 γ = 1.400', near(cd20.gamma, 1.400, 0.001), cd20.gamma);
ok('20 ℃ 干空气密度 = 1.204 kg/m³', near(cd20.density, 1.204, 0.006), cd20.density);
ok('0 ℃ 干空气密度 = 1.293 kg/m³', near(cd0.density, 1.293, 0.006), cd0.density);
ok('饱和蒸气压 20 ℃ ≈ 2338 Pa', near(W.satVaporPressure(20), 2338, 20), W.satVaporPressure(20));

console.log('\n[2] 水中声速');
ok('纯水 0 ℃ = 1402.4 m/s', near(W.soundSpeedWater(0), 1402.39, 0.05), W.soundSpeedWater(0));
ok('纯水 20 ℃ = 1482.3 m/s', near(W.soundSpeedWater(20), 1482.3, 0.5), W.soundSpeedWater(20));
ok('纯水 40 ℃ > 20 ℃（先增后缓）', W.soundSpeedWater(40) > W.soundSpeedWater(20), W.soundSpeedWater(40));

console.log('\n[3] 波长 / 频率 / 周期 / 波数');
var wl = W.wavelength({ f: 1000, c: 343 });
ok('λ = c/f = 0.343 m', near(wl.lambda, 0.343, 1e-9), wl.lambda);
ok('周期 T = 1 ms', near(wl.period, 1e-3, 1e-12));
ok('波数 k = 2π/λ = 18.32 rad/m', near(wl.wavenumber, 2 * Math.PI / 0.343, 1e-9), wl.wavenumber);
ok('λ/2 = 0.1715 m、λ/4 = 0.0858 m', near(wl.half, 0.1715, 1e-9) && near(wl.quarter, 0.08575, 1e-9));
ok('由波长反算频率 1000 Hz', near(W.freqFromWavelength({ lambda: 0.343, c: 343 }).f, 1000, 0.01));
ok('波长越短频率越高', W.wavelength({ f: 4000, c: 343 }).lambda < wl.lambda);
ok('f=0 返回 null', W.wavelength({ f: 0, c: 343 }) === null);

console.log('\n[4] 自由场声强与平方反比');
var ff = W.freeField({ power: 1e-6, r: 1, Q: 1 });
ok('I = P/(4πr²) = 7.958e-8 W/m²', near(ff.intensity, 1e-6 / (4 * Math.PI), 1e-15), ff.intensity);
ok('声功率级 Lw = 60 dB（W₀ = 1 pW）', near(ff.powerLevel, 60, 1e-9), ff.powerLevel);
ok('r = 1 m 处 Lp = Lw − 10.99 = 49.01 dB', near(ff.spl, 49.01, 0.01), ff.spl);
ok('声强级 LI ≈ 49.0 dB（I₀ = 1 pW/m²）', near(ff.intensityLevel, 49.01, 0.02), ff.intensityLevel);
ok('声压 p = √(I·ρc) = 5.72 mPa', near(ff.pressure, Math.sqrt(ff.intensity * 410), 1e-9), ff.pressure);
var ff2 = W.freeField({ power: 1e-6, r: 2, Q: 1 });
ok('距离加倍声强降为 1/4', near(ff2.intensity, ff.intensity / 4, 1e-18));
ok('距离加倍声压级 −6.02 dB', near(ff.spl - ff2.spl, 6.0206, 1e-3), ff.spl - ff2.spl);
var ffh = W.freeField({ power: 1e-6, r: 1, Q: 2 });
ok('半球辐射 Q = 2 → +3.01 dB', near(ffh.spl - ff.spl, 3.0103, 1e-3), ffh.spl - ff.spl);
var dc = W.decayCurve({ power: 1e-6, rFrom: 1, rTo: 64, n: 24 });
ok('衰减曲线单调下降', dc.spl[0] > dc.spl[24]);
ok('1→64 m 衰减 36.12 dB（6 个倍程）', near(dc.spl[0] - dc.spl[24], 36.12, 0.05), dc.spl[0] - dc.spl[24]);
ok('参数为 0 返回 null', W.freeField({ power: 0, r: 1 }) === null);

console.log('\n[5] 特性声阻抗与界面');
var zAir = W.characteristicImpedance({ rho: 1.204, c: 343 });
ok('空气 Z = ρc = 413 Pa·s/m（Rayl）', near(zAir.Z, 412.97, 0.5), zAir.Z);
var zWater = W.characteristicImpedance({ rho: 998, c: 1482 });
ok('水 Z = 1.479e6 Rayl', near(zWater.Z / 1e6, 1.479, 0.005), zWater.Z / 1e6);
var iw = W.interface({ Z1: zAir.Z, Z2: zWater.Z });
ok('空气→水 声压反射系数 ≈ 0.9994', near(iw.Rp, 0.99944, 1e-4), iw.Rp);
ok('空气→水 声强反射系数 ≈ 0.9989', near(iw.reflection, 0.99888, 1e-4), iw.reflection);
ok('空气→水 透射损失 ≈ 29.5 dB', near(iw.transmissionLoss, 29.5, 0.15), iw.transmissionLoss);
ok('声强守恒：反射 + 透射 = 1', near(iw.reflection + iw.transmission, 1, 1e-12));
var isame = W.interface({ Z1: 400, Z2: 400 });
ok('阻抗相同 → 全透射（Rp = 0、TL = 0 dB）', near(isame.Rp, 0, 1e-12) && near(isame.transmissionLoss, 0, 1e-9));
var isteel = W.interface({ Z1: zAir.Z, Z2: 7850 * 5940 });
ok('空气→钢 透射损失 ≈ 44.5 dB', near(isteel.transmissionLoss, 44.5, 0.5), isteel.transmissionLoss);
var itot = W.interface({ Z1: zAir.Z, Z2: zWater.Z, c1: 343, c2: 1482, theta: 5 });
ok('斜入射 5° 给出折射角 θ₂ = asin((c₂/c₁)·sinθ₁) = 22.1°',
  near(itot.theta2, Math.asin((1482 / 343) * Math.sin(5 * Math.PI / 180)) * 180 / Math.PI, 1e-9), itot.theta2);
// 由慢介质（空气）射向快介质（水）时存在全反射临界角 θc = asin(c₁/c₂) = 13.37°，
// 这正是水面在掠射角下几乎全反射、远处水面上方反而更吵的原因
var icrit = W.interface({ Z1: zAir.Z, Z2: zWater.Z, c1: 343, c2: 1482, theta: 5 });
ok('空气→水 全反射临界角 = asin(343/1482) = 13.37°', near(icrit.critical, 13.37, 0.05), icrit.critical);
ok('由快介质射向慢介质时无临界角',
  W.interface({ Z1: zWater.Z, Z2: zAir.Z, c1: 1482, c2: 343, theta: 30 }).critical === null);
var ifull = W.interface({ Z1: zAir.Z, Z2: zWater.Z, c1: 343, c2: 1482, theta: 30 });
ok('入射角超过临界角 → 全反射（τ = 0）', ifull.total === true && ifull.transmission === 0);
ok('介质库含 18 种常用介质', W.MEDIA.length === 18, W.MEDIA.length);
ok('介质库可按 id 查表', W.media('steel').rho === 7850 && W.media('air20').c === 343);

console.log('\n[6] 比值 ↔ 分贝');
ok('功率比 2 → 3.01 dB', near(W.ratioToDb({ ratio: 2, mode: 'power' }).db, 3.0103, 1e-4));
ok('场量比 2 → 6.02 dB', near(W.ratioToDb({ ratio: 2, mode: 'field' }).db, 6.0206, 1e-4));
ok('功率比 10 → 10 dB', near(W.ratioToDb({ ratio: 10, mode: 'power' }).db, 10, 1e-9));
ok('场量比 10 → 20 dB', near(W.ratioToDb({ ratio: 10, mode: 'field' }).db, 20, 1e-9));
ok('3 dB → 功率比 2', near(W.dbToRatio({ db: 3.0103, mode: 'power' }).ratio, 2, 1e-4));
ok('6 dB → 场量比 2', near(W.dbToRatio({ db: 6.0206, mode: 'field' }).ratio, 2, 1e-4));
ok('20 dB → 功率比 100', near(W.dbToRatio({ db: 20, mode: 'power' }).ratio, 100, 1e-9));
ok('比值换算可逆', near(W.dbToRatio(W.ratioToDb({ ratio: 7.5, mode: 'power' })).ratio, 7.5, 1e-9));
ok('ratio ≤ 0 返回 null', W.ratioToDb({ ratio: 0 }) === null);
var tbl = W.ratioTable('power');
ok('对照表 1 → 0 dB、10 → 10 dB', near(tbl[0].db, 0, 1e-12) && near(tbl[8].db, 10, 1e-9));

console.log('\n[7] 乐音：十二平均律');
ok('A4 = 440 Hz', near(W.freqToNote(440).midi, 69, 1e-9) && W.freqToNote(440).name === 'A4', W.freqToNote(440).name);
ok('261.63 Hz → C4（MIDI 60）', W.freqToNote(261.6256).name === 'C4' && near(W.freqToNote(261.6256).midi, 60, 1e-6), W.freqToNote(261.6256).name);
ok('466.16 Hz → A#4（MIDI 70）', W.freqToNote(466.1638).name === 'A#4', W.freqToNote(466.1638).name);
ok('445 Hz → A4 偏高 19.6 音分', near(W.freqToNote(445).cents, 19.56, 0.1), W.freqToNote(445).cents);
ok('音分偏差不超过 ±50', Math.abs(W.freqToNote(452).cents) <= 50);
ok('A4 由音名反算 = 440 Hz', near(W.noteToFreq('A4').freq, 440, 1e-9));
ok('C4 = 261.63 Hz', near(W.noteToFreq('C4').freq, 261.6256, 1e-4), W.noteToFreq('C4').freq);
ok('Bb3 与 A#3 同音 = 233.08 Hz', near(W.noteToFreq('Bb3').freq, 233.0819, 1e-4), W.noteToFreq('Bb3').freq);
ok('非法音名返回 null', W.noteToFreq('H4') === null && W.noteToFreq('') === null);
ok('八度 = 12 半音', near(W.noteToFreq('A5').freq / W.noteToFreq('A4').freq, 2, 1e-9));
var iv = W.interval(440, 660);
ok('440→660 为纯五度 7 半音（702 音分）', near(iv.semitones, 7.0196, 1e-3) && near(iv.cents, 701.96, 0.1), iv.cents);
ok('拍频 |f₂−f₁| = 220 Hz', near(iv.beat, 220, 1e-9));
var iv2 = W.interval(440, 442);
ok('440/442 拍频 2 Hz（调律常用）', near(iv2.beat, 2, 1e-9) && near(iv2.cents, 7.86, 0.05), iv2.cents);
ok('拍频 < 20 Hz 判为拍音区', W.interval(440, 445).note.indexOf('拍音区') >= 0);
ok('拍频 > 300 Hz 判为分离', W.interval(440, 880).note.indexOf('分离') >= 0);

console.log('\n[8] 管共振');
var po = W.pipeResonance({ c: 343, L: 1, diameter: 0, kind: 'open' });
ok('开管 f₁ = c/(2L) = 171.5 Hz', near(po.f1, 171.5, 1e-9), po.f1);
ok('开管含全部谐波：171.5 / 343 / 514.5',
  near(po.harmonics[0].freq, 171.5, 1e-9) && near(po.harmonics[1].freq, 343, 1e-9) && near(po.harmonics[2].freq, 514.5, 1e-9));
var pc = W.pipeResonance({ c: 343, L: 1, diameter: 0, kind: 'closed' });
ok('闭管 f₁ = c/(4L) = 85.75 Hz（比开管低八度）', near(pc.f1, 85.75, 1e-9), pc.f1);
ok('闭管仅奇次谐波：85.75 / 257.25 / 428.75',
  pc.onlyOdd && near(pc.harmonics[1].freq, 257.25, 1e-9) && near(pc.harmonics[2].freq, 428.75, 1e-9));
var poe = W.pipeResonance({ c: 343, L: 1, diameter: 0.1, kind: 'open' });
ok('两端开口管口修正 L_eff = L + 2·0.6r = 1.06 m', near(poe.Leff, 1.06, 1e-9), poe.Leff);
ok('管口修正后基频降至 161.79 Hz', near(poe.f1, 343 / 2.12, 1e-9), poe.f1);
ok('闭管单端修正 L_eff = L + 0.6r = 1.03 m',
  near(W.pipeResonance({ c: 343, L: 1, diameter: 0.1, kind: 'closed' }).Leff, 1.03, 1e-9));
ok('L=0 返回 null', W.pipeResonance({ c: 343, L: 0 }) === null);

console.log('\n[9] 弦共振');
var st = W.stringResonance({ L: 0.65, tension: 100, mu: 4e-4 });
ok('波速 √(T/μ) = 500 m/s', near(st.waveSpeed, 500, 1e-9), st.waveSpeed);
ok('f₁ = v/(2L) = 384.62 Hz', near(st.f1, 384.615, 1e-3), st.f1);
ok('谐波为整数倍：769.23 / 1153.85',
  near(st.harmonics[1].freq, 769.23, 1e-2) && near(st.harmonics[2].freq, 1153.85, 1e-2));
var st2 = W.stringResonance({ L: 0.65, tension: 100, rho: 7850, diameter: 5e-4 });
ok('由直径与密度求线密度 μ = ρπ(d/2)² = 1.541e-3 kg/m',
  near(st2.mu, 7850 * Math.PI * 6.25e-8, 1e-12), st2.mu);
ok('钢弦（d = 0.5 mm、100 N、0.65 m）f₁ = 195.9 Hz', near(st2.f1, 195.9, 0.2), st2.f1);
ok('张力加倍频率 × √2', near(W.stringResonance({ L: 0.65, tension: 200, mu: 4e-4 }).f1 / st.f1, Math.SQRT2, 1e-9));
ok('长度加倍频率减半', near(W.stringResonance({ L: 1.3, tension: 100, mu: 4e-4 }).f1 / st.f1, 0.5, 1e-9));
ok('缺线密度返回 null', W.stringResonance({ L: 0.65, tension: 100 }) === null);

console.log('\n[10] 多普勒效应');
ok('相对静止 → 频率不变', near(W.doppler({ f: 1000, c: 343 }).observed, 1000, 1e-9));
var d1 = W.doppler({ f: 1000, c: 343, vs: 34.3 });
ok('声源以 0.1 Ma 靠近 → f′ = f/(1−0.1) = 1111.1 Hz', near(d1.observed, 1111.111, 0.01), d1.observed);
ok('频移 +11.11 %', near(d1.percent, 11.111, 0.01), d1.percent);
var d2 = W.doppler({ f: 1000, c: 343, vo: 34.3 });
ok('观察者以 0.1 Ma 靠近 → f′ = f(1+0.1) = 1100 Hz', near(d2.observed, 1100, 0.01), d2.observed);
var d3 = W.doppler({ f: 1000, c: 343, vs: 34.3, vo: 34.3 });
ok('双方相向 → 1222.2 Hz', near(d3.observed, 1222.22, 0.02), d3.observed);
var d4 = W.doppler({ f: 1000, c: 343, vs: -34.3 });
ok('声源远离 → 909.09 Hz', near(d4.observed, 909.091, 0.01), d4.observed);
ok('前方波长被压缩 λ′ = (c−v_s)/f = 0.3087 m', near(d1.wavelengthFront, 0.3087, 1e-3), d1.wavelengthFront);
ok('后方波长被拉长 = 0.3773 m', near(d1.wavelengthBack, 0.3773, 1e-3), d1.wavelengthBack);
var d5 = W.doppler({ f: 1000, c: 343, vs: 343 });
ok('Ma = 1 → 激波，公式不适用', d5.shock === true && near(d5.mach, 1, 1e-12));
var d6 = W.doppler({ f: 1000, c: 343, vs: 300 });
ok('Ma = 0.875 给出高亚音速提示', d6.mach > 0.8 && d6.note.indexOf('声速') > 0, d6.mach);
ok('f=0 返回 null', W.doppler({ f: 0, c: 343 }) === null);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
