/*
 * crossover.test.js — 分频器设计内核测试 (node tests/crossover.test.js)
 *
 * 元件值锚点：8 Ω / 2 kHz 下与行业通用表格核对
 *   一阶       L = 0.637 mH, C = 9.95 µF
 *   二阶巴特沃斯 L = 0.900 mH, C = 7.03 µF
 *   LR2        L = 1.273 mH, C = 4.97 µF
 *   三阶巴特沃斯 L₁ = 0.955 mH, C₁ = 13.26 µF, L₂ = 0.318 mH
 *
 * 关键工程结论（同时作为回归锚点）：
 *   二阶需反接一路（否则分频点完全抵消），反接后合成 +3 dB 隆起；
 *   LR2 / LR4 按正确极性合成平直（分频点 0 dB）。
 */
var CO = require('../public/js/crossover.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) {
  if (typeof a !== 'number' || !isFinite(a)) return false;
  return Math.abs(a - b) <= tol;
}

var FC = 2000, Z = 8;

console.log('\n[1] 一阶（6 dB/oct）');
var d1 = CO.design({ order: 1, fc: FC, Z: Z });
ok('设计成功', d1.ok);
ok('L = Z/ω₀ = 0.637 mH', near(d1.L[0] * 1000, 0.6366, 0.0005), d1.L[0] * 1000);
ok('C = 1/(ω₀Z) = 9.95 µF', near(d1.C[0] * 1e6, 9.947, 0.01), d1.C[0] * 1e6);
var r1lo = CO.response(d1, FC), r1hi = CO.response(d1, FC * 10);
ok('低通在 fc 处 −3.01 dB', near(r1lo.lp, -3.0103, 1e-3), r1lo.lp);
ok('高通在 fc 处 −3.01 dB', near(r1lo.hp, -3.0103, 1e-3), r1lo.hp);
ok('低通在 10·fc 处以 6 dB/oct 滚降（≈ −20 dB）', near(r1hi.lp, -20.04, 0.2), r1hi.lp);
ok('一阶在 fc 处两路相差 90°，合成 0 dB（天然平直）', near(r1lo.sum, 0, 0.02), r1lo.sum);

console.log('\n[2] 二阶巴特沃斯');
var d2 = CO.design({ order: 2, type: 'butter', fc: FC, Z: Z });
ok('设计成功且标记为二阶', d2.ok && d2.order === 2);
ok('C = Q/(ω₀Z) = 7.03 µF', near(d2.C[0] * 1e6, 7.033, 0.01), d2.C[0] * 1e6);
ok('L = Z/(Qω₀) = 0.900 mH', near(d2.L[0] * 1000, 0.9003, 0.001), d2.L[0] * 1000);
ok('要求反接极性', d2.invert === true);
var r2 = CO.response(d2, FC);
ok('低通在 fc 处 −3.01 dB', near(r2.lp, -3.0103, 1e-3), r2.lp);
ok('高通在 fc 处 −3.01 dB', near(r2.hp, -3.0103, 1e-3), r2.hp);
ok('反接后合成 +3.01 dB（经典隆起）', near(r2.sum, 3.0103, 1e-2), r2.sum);
var r2no = CO.response(d2, FC, 1);   // +1 = 与设计极性相反（不反接）
ok('不反接时在分频点完全抵消（< −30 dB）', r2no.sum < -30, r2no.sum);
var r2far = CO.response(d2, 20 * FC);
ok('低通在 20·fc 处以 12 dB/oct 滚降（≈ −52 dB）', near(r2far.lp, -52.04, 0.5), r2far.lp);

console.log('\n[3] LR2（Q = 0.5）');
var dlr2 = CO.design({ order: 2, type: 'lr2', fc: FC, Z: Z });
ok('L = 1.273 mH', near(dlr2.L[0] * 1000, 1.2732, 0.001), dlr2.L[0] * 1000);
ok('C = 4.97 µF', near(dlr2.C[0] * 1e6, 4.973, 0.01), dlr2.C[0] * 1e6);
var rl2 = CO.response(dlr2, FC);
ok('分频点各 −6.02 dB', near(rl2.lp, -6.0206, 0.02) && near(rl2.hp, -6.0206, 0.02), rl2.lp + ' / ' + rl2.hp);
ok('正确极性合成 0 dB（平直）', near(rl2.sum, 0, 0.02), rl2.sum);
var rl2f = CO.response(dlr2, FC * 4);
ok('4·fc 处合成仍接近 0 dB', Math.abs(rl2f.sum) < 0.6, rl2f.sum);

console.log('\n[4] 三阶巴特沃斯');
var d3 = CO.design({ order: 3, fc: FC, Z: Z });
ok('L₁ = 0.955 mH', near(d3.L[0] * 1000, 0.9549, 0.001), d3.L[0] * 1000);
ok('C₁ = 13.26 µF', near(d3.C[0] * 1e6, 13.263, 0.02), d3.C[0] * 1e6);
ok('L₂ = 0.318 mH', near(d3.L[1] * 1000, 0.3183, 0.001), d3.L[1] * 1000);
var r3 = CO.response(d3, FC);
ok('低通在 fc 处 −3.01 dB（巴特沃斯）', near(r3.lp, -3.0103, 1e-2), r3.lp);
ok('高通在 fc 处 −3.01 dB', near(r3.hp, -3.0103, 1e-2), r3.hp);
var r3f = CO.response(d3, FC * 10);
ok('低通在 10·fc 处以 18 dB/oct 滚降（≈ −60 dB）', near(r3f.lp, -60.0, 0.5), r3f.lp);

console.log('\n[5] 四阶');
var d4lr = CO.design({ order: 4, type: 'lr4', fc: FC, Z: Z });
ok('LR4 = 两级相同二阶巴特沃斯级联', d4lr.ok && d4lr.cascade === 2 &&
  near(d4lr.L[0], d4lr.L[1], 1e-12) && near(d4lr.C[0], d4lr.C[1], 1e-12));
ok('每级元件与二阶巴特沃斯相同（L = 0.900 mH）', near(d4lr.L[0] * 1000, 0.9003, 0.001), d4lr.L[0] * 1000);
ok('LR4 无需反接', d4lr.invert === false);
var r4lr = CO.response(d4lr, FC);
ok('分频点各 −6.02 dB', near(r4lr.lp, -6.0206, 0.02) && near(r4lr.hp, -6.0206, 0.02), r4lr.lp + ' / ' + r4lr.hp);
ok('LR4 合成 0 dB（平直）', near(r4lr.sum, 0, 0.02), r4lr.sum);
ok('LR4 在 4·fc 处合成仍接近 0 dB', Math.abs(CO.response(d4lr, FC * 4).sum) < 0.6);

var d4b = CO.design({ order: 4, type: 'butter', fc: FC, Z: Z });
ok('四阶巴特沃斯求解成功', d4b.ok && d4b.L.length === 2 && d4b.C.length === 2);
ok('四阶巴特沃斯低通在 fc 处 −3.01 dB', near(CO.response(d4b, FC).lp, -3.0103, 0.05), CO.response(d4b, FC).lp);
ok('四阶巴特沃斯合成 +3 dB 隆起（需改 LR4 才平直）', near(CO.response(d4b, FC).sum, 3.0103, 0.1),
  CO.response(d4b, FC).sum);
ok('四阶巴特沃斯 20·fc 处滚降至 −104 dB 附近',
  near(CO.response(d4b, FC * 20).lp, -104.08, 1), CO.response(d4b, FC * 20).lp);
ok('元件值均为正且有限', d4b.L.concat(d4b.C).every(function (v) { return isFinite(v) && v > 0; }));

console.log('\n[6] 参数与错误处理');
ok('阶数 5 报错', !CO.design({ order: 5, fc: FC, Z: Z }).ok);
ok('缺 fc 报错', !CO.design({ order: 2, Z: Z }).ok);
ok('缺 Z 报错', !CO.design({ order: 2, fc: FC }).ok);
// 二阶低通在分频点的幅度恰为 Q，故 Q=1 时为 0 dB、Q=0.7071 时为 −3.01 dB
ok('自定义 Q 生效', (function () {
  var d = CO.design({ order: 2, type: 'custom', q: 1.0, fc: FC, Z: Z });
  return d.ok && near(d.q, 1.0, 1e-12) && near(CO.response(d, FC).lp, 0, 0.02);
})());
ok('swEEP 采样点数量正确', CO.sweep(d2, { n: 50 }).length === 51);
ok('响应曲线首尾单调（低通随频率下降）', (function () {
  var s = CO.sweep(d2, { n: 40 });
  return s[0].lp > s[20].lp && s[20].lp > s[40].lp;
})());

console.log('\n[7] Zobel 阻抗补偿');
var zb = CO.zobel({ Re: 6, Le: 0.5 });
ok('Rz = 1.25·Re = 7.5 Ω', near(zb.Rz, 7.5, 1e-9), zb.Rz);
ok('Cz = Le/Rz² = 8.889 µF', near(zb.Cz, 8.8889, 0.001), zb.Cz);
ok('自定义 k 生效', near(CO.zobel({ Re: 6, Le: 0.5, k: 1 }).Rz, 6, 1e-9));
ok('参数缺失返回 null', CO.zobel({ Re: 6 }) === null);

console.log('\n[8] L-pad 衰减器');
var lp6 = CO.lpad({ dB: 6, Z: 8 });
ok('R_series = Z(1−k) ≈ 3.99 Ω', near(lp6.Rseries, 3.990, 0.01), lp6.Rseries);
ok('R_shunt = kZ/(1−k) ≈ 8.04 Ω', near(lp6.Rshunt, 8.038, 0.01), lp6.Rshunt);
ok('输入阻抗仍为 8 Ω', near(lp6.Zin, 8, 0.01), lp6.Zin);
ok('0 dB 时串阻为 0、并阻为 ∞', CO.lpad({ dB: 0, Z: 8 }).Rseries === 0);
ok('衰减越大串阻越大', CO.lpad({ dB: 12, Z: 8 }).Rseries > lp6.Rseries);
ok('12 dB 时输入阻抗仍为 8 Ω', near(CO.lpad({ dB: 12, Z: 8 }).Zin, 8, 0.01));

console.log('\n[9] 灵敏度匹配与元件反算');
var lm = CO.levelMatch({ tweeterSpl: 92, wooferSpl: 88 });
ok('灵敏度差 4 dB', near(lm.diff, 4, 1e-9));
ok('提示衰减高音', lm.louder.indexOf('高音') >= 0);
var fcr = CO.fcFromComponents({ Z: 8, L: 0.6366, C: 9.947 });
ok('由 L 反算 fc ≈ 2000 Hz', near(fcr.items[0].fc, 2000, 1), fcr.items[0].fc);
ok('由 C 反算 fc ≈ 2000 Hz', near(fcr.items[1].fc, 2000, 1), fcr.items[1].fc);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
