/*
 * absdesign.test.js — 吸声结构设计内核 单元测试 (node tests/absdesign.test.js)
 * 依据：传递矩阵法（TMM）、Delany–Bazley / Miki 多孔模型、微穿孔板（马大猷）、
 *      薄板/薄膜共振、吸声降噪量 ΔL = 10lg(A₂/A₁)。
 */
var A = require('../public/js/absdesign.js');
var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// 多孔材料特性
var pp = A.porousProps(1000, 11000, 'db');
ok('多孔特性阻抗为有限复数', pp && isFinite(pp.Zc.re) && isFinite(pp.Zc.im));
ok('多孔传播常数虚部 < 0（有衰减）', pp && pp.k.im < 0, pp && pp.k.im);

// 微穿孔板吸声（d=0.8,t=1,p=1%,D=50mm）：α 应落在合理区间
var aMpp = A.mppAlpha(1000, { d: 0.8, t: 1, p: 1, D: 50 });
ok('MPP α@1000Hz ∈ [0.05, 0.6]', aMpp != null && aMpp > 0.05 && aMpp < 0.6, aMpp);
// 穿孔率以百分数输入（与 perforation.js 约定一致）：p=1 表示 1%
var aMpp2 = A.mppAlpha(1000, { d: 0.8, t: 1, p: 1, D: 50 });
ok('穿孔率百分数约定（p=1 ⇒ 1%）', near(aMpp, aMpp2, 1e-9));

// 微穿孔板共振频率 f₀ = (c/2π)√(p/(D·t_eff))
var fr = A.mppResonance({ d: 0.8, t: 1, p: 1, D: 50 });
ok('MPP 共振频率 f₀ ∈ [300, 900] Hz', fr && fr.f0 > 300 && fr.f0 < 900, fr && fr.f0);

// 玻璃棉 40kg/m³ 50mm + 空腔 100mm：NRC 应较高（> 0.6）
var sp = A.spectrum({ layers: [
  { type: 'porous', thickness: 50, sigma: 11000, model: 'db' },
  { type: 'cavity', depth: 100 }
] });
ok('多孔+空腔 谱计算 ok', sp.ok === true);
ok('玻璃棉50mm+空腔100mm NRC > 0.6', sp.nrc != null && sp.nrc > 0.6, sp.nrc);
ok('吸声系数均在 [0,1]', sp.alphas.every(function (v) { return v >= 0 && v <= 1; }));
ok('峰值频率存在', sp.peak && sp.peak.f > 0);

// 薄板/薄膜共振 f₀ = (c/2π)√(ρ₀/(m·d))
var fp = A.panelResonance(2, 0.1);
ok('薄板共振(2kg/m²,0.1m) ≈ 134 Hz', near(fp, 134.3, 2), fp);

// 吸声降噪量 ΔL = 10lg(A₂/A₁)
var red = A.reduction({ A1: [10, 15, 20, 30, 40, 50], A2: [40, 60, 80, 90, 95, 98] });
ok('降噪量计算 ok 且行数=6', red.ok && red.rows.length === 6);
ok('平均 ΔL ≈ 4.9 dB', red.meanDL != null && near(red.meanDL, 4.92, 0.2), red.meanDL);
ok('最大 ΔL ≈ 6.0 dB', red.maxDL != null && near(red.maxDL, 6.02, 0.1), red.maxDL);

// 背景噪声谱 → 处理后总声级
var red2 = A.reduction({
  A1: [10, 15, 20, 30, 40, 50], A2: [40, 60, 80, 90, 95, 98],
  bgLevels: [55, 52, 50, 48, 45, 42]
});
ok('处理后总声级低于背景', red2.afterTotal != null && red2.afterTotal < red2.beforeTotal,
  red2.beforeTotal + ' → ' + red2.afterTotal);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
