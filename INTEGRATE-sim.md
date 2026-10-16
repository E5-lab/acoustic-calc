# 集成补丁：声学模拟器章节（4 个动态模拟器）

> 新增 4 个「带动态效果的模拟器」模块，统一归入新的「声学模拟器」导航分组。
> 本文件只描述对**共享文件**的改动；4 个模块自身是**自包含新文件**（已在仓库根 `public/js/`）：
> `sim-helmholtz.js` / `view-sim-helmholtz.js`、`sim-impedance.js` / `view-sim-impedance.js`、
> `sim-octave.js` / `view-sim-octave.js`、`sim-hvac.js` / `view-sim-hvac.js`。
>
> ⚠️ 按协作约定，**共享文件（index.html / router.js / nav.js）不直接修改**，由集成者按本补丁合入，避免与其他 AI 的并行改动冲突。

---

## 1. `public/index.html` — 新增导航分组（在 `<nav class="mainnav">` 内，其闭合 `</nav>` 之前插入）

```html
<div class="nav-group">
  <button class="nav-parent" type="button" aria-expanded="false" aria-haspopup="true">
    声学模拟器
    <svg class="nav-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>
  <div class="nav-menu">
    <a href="#/sim-helmholtz" data-route="sim-helmholtz"><span class="nm-t">亥姆霍兹共鸣器</span><small class="nm-d">空腔+颈口共振 · 动态演示</small></a>
    <a href="#/sim-impedance" data-route="sim-impedance"><span class="nm-t">声阻抗 反射/透射</span><small class="nm-d">介质界面波演示</small></a>
    <a href="#/sim-octave" data-route="sim-octave"><span class="nm-t">倍频程频谱</span><small class="nm-d">A/C/Z 计权动画</small></a>
    <a href="#/sim-hvac" data-route="sim-hvac"><span class="nm-t">HVAC 消声器</span><small class="nm-d">衬里风管衰减演示</small></a>
  </div>
</div>
```

## 2. `public/index.html` — 新增视图容器（在现有 `<section class="view" …>` 区块附近插入）

```html
<section class="view" id="view-sim-helmholtz" data-view="sim-helmholtz" hidden></section>
<section class="view" id="view-sim-impedance" data-view="sim-impedance" hidden></section>
<section class="view" id="view-sim-octave" data-view="sim-octave" hidden></section>
<section class="view" id="view-sim-hvac" data-view="sim-hvac" hidden></section>
```

## 3. `public/index.html` — 新增脚本标签

内核脚本（放在现有内核脚本区，如 `js/wave.js` 之后、`js/app.js` 之前）：

```html
<script src="js/sim-helmholtz.js"></script>
<script src="js/sim-impedance.js"></script>
<script src="js/sim-octave.js"></script>
<script src="js/sim-hvac.js"></script>
```

视图脚本（放在现有视图脚本区，如 `view-absorber.js` 之后）：

```html
<script src="js/view-sim-helmholtz.js"></script>
<script src="js/view-sim-impedance.js"></script>
<script src="js/view-sim-octave.js"></script>
<script src="js/view-sim-hvac.js"></script>
```

## 4. `public/js/router.js` — `VIEWS` 增加 4 条

```js
'sim-helmholtz': 'view-sim-helmholtz',
'sim-impedance': 'view-sim-impedance',
'sim-octave': 'view-sim-octave',
'sim-hvac': 'view-sim-hvac',
```

`TITLES` 增加：

```js
'sim-helmholtz': '亥姆霍兹共鸣器模拟器 · 声学计算工具箱',
'sim-impedance': '声阻抗 反射/透射 模拟器 · 声学计算工具箱',
'sim-octave': '倍频程频谱模拟器 · 声学计算工具箱',
'sim-hvac': 'HVAC 消声器模拟器 · 声学计算工具箱',
```

`MOUNTS` 数组增加：

```js
{ route: 'sim-helmholtz', get: function () { return window.SimHelmholtzView; } },
{ route: 'sim-impedance', get: function () { return window.SimImpedanceView; } },
{ route: 'sim-octave', get: function () { return window.SimOctaveView; } },
{ route: 'sim-hvac', get: function () { return window.SimHvacView; } },
```

## 5. `public/js/nav.js` — `NAV_SUB` 增加 4 条（用于三级菜单提示）

```js
'sim-helmholtz': ['颈口气塞振荡', '空腔脉动', '参数实时联动'],
'sim-impedance': ['入射/反射/透射三波', '介质预设', 'Z / TL 读数'],
'sim-octave': ['9 段频谱条形', 'A/C/Z 计权', '扫掠高亮'],
'sim-hvac': ['衬里风管衰减', 'ΔL–频率', '风压损失'],
```

---

## 模块能力速查（Node 自测已通过）

| 模块 | 内核主函数 | 关键公式 | 自测结果 |
|------|-----------|----------|----------|
| 亥姆霍兹共鸣器 | `helmholtz({d,t,V,endCorr})` | `f0=(c/2π)√(A/(V·Leff))`, `A=π(d/2)²`, `Leff=t+0.85d` | d=0.02,t=0.005,V=0.001 → **f0≈206.3 Hz** |
| 声阻抗 反射/透射 | `interfaceZ({medium1,medium2})` | `Z=ρc`, `R=(Z2−Z1)/(Z2+Z1)`, `TL=−10log10(1−R²)` | air→steel → **TL≈44.5 dB** |
| 倍频程频谱 | `analyze(levels[9])` | A/C/Z 计权总声级 + 逐带加权 + 主频 | 9×60dB → 总 **69.54 dB**, A **66.99 dB** |
| HVAC 消声器 | `attenuation({w,h,L,alpha,K})` | Beranek 衬里：`rate=K·α/(2−α)·(P/S)`, `ΔL=rate·L` | 0.3×0.3×2m, α=0.7 → **ΔL≈14.4 dB** |

> 说明：声阻抗与 HVAC 内核为**公开经典公式**的简化/量级估算实现（已在各自文件注释中标注假设），不含任何第三方商业代码；动画为实时 Canvas 演示，非物理仿真。
