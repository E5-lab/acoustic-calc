# 声学计算工具箱 · 复刻指南

> 给朋友用：把你（Mavis）的声学工具网站重建到自己的域名 / 部署平台上。  
> 本文档同时交付两样东西：**① 每一版的界面变化与设计思路**（演进史）；**② 复制这套站点所需的架构、设计系统与工程骨架**（复刻蓝图）。

---

## 0. 这份文档怎么用

- **目标读者**：朋友的 AI agent（或任何想 fork 本项目的人）。
- **源码仓库**：`E5-lab/acoustic-calc`（公开，纯静态、零运行时依赖）。
- **线上实例**：`blog.124365.xyz` 同主站（Cloudflare Worker 部署）。
- **推荐复制路径**：
  1. 先读仓库根 `README.md`（功能清单）→ 再读本指南第 3、4 节（设计系统 + 架构骨架）。
  2. 把 `public/` 目录整体 clone 下来，它就是一套完整可运行的静态站。
  3. 想改公式/加模块，照第 4 节的「视图接口契约」与「计算内核约定」扩展即可。
- **关键约束**：本站点**没有任何构建步骤**——没有 npm install、没有打包、没有框架。直接 `<script>` 顺序加载原生 JS。复制时**务必保留 `index.html` 末尾的脚本加载顺序**（见 §4.6），否则 `window.XxxView` 还未注册就被 router 调用会报错。

---

## 1. 项目定位与设计原则（设计思路总纲）

| 原则                | 具体做法                                                                                          | 为什么这么定                                                    |
| ----------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **纯静态、零依赖、零构建**   | 1 个 HTML + 1 个 CSS + 25 个原生 JS（UMD IIFE），无 React/Vue、无打包器                                     | 作者是非专业前端、需长期自己维护；任何机器打开就能跑，CI 只需静态托管                      |
| **单文件大 CSS 设计系统** | 所有颜色/圆角/阴影都抽成 `:root` CSS 变量，明暗两套                                                             | 一处改全站变；支持「跟随系统 + 手动切换 + 持久化」                              |
| **哈希路由 + 视图按需挂载** | `router.js` 解析 `#/xxx`，首次进入才 `init()` 视图                                                      | 单页、深链可用、刷新不丢位置；不用前端框架也能做多模块                               |
| **计算内核与视图分离**     | `acoustics.js` / `vibration.js` / `muffler.js` 是纯函数，挂 `window.Acoustics` 等；`view-*.js` 只管 DOM | 内核可单测（`tests/*.test.js`，Node 原生断言，无框架）；公式改了能立刻跑 670 条断言回归 |
| **「复核」是核心卖点**     | 不止自己算，更把厂家给的值用标准公式重算并逐项比对                                                                     | 作者的真实工作流是"复核厂家计算书"，所以专门做了「厂家计算书复核」面板                      |

**一句话给 agent**：这是一个"标准声学公式的可视化复核工具箱"，技术选型刻意保守（vanilla JS），优先级是**可维护 > 技术新颖**。

---

## 2. 目录结构与模块边界

```
acoustic-calc/
├── wrangler.toml            # Cloudflare 部署配置（仅 name + [assets]，见 §7）
├── README.md                # 功能清单（agent 第一份读物）
├── REPLICATION-GUIDE.md     # 本文档
├── public/                  # ★ 唯一被部署的目录
│   ├── index.html           # 入口 + 顶栏 + 各视图容器（静态 HTML 骨架）
│   ├── favicon.{svg,png,ico} / apple-touch-icon.png
│   ├── css/
│   │   └── styles.css       # 设计系统（CSS 变量 + 全部组件样式，约 1200 行）
│   └── js/
│       ├── chart-util.js    # 轻量 Canvas 折线/柱状图工具（对数轴、多序列）
│       ├── acoustics.js     # 内核：A 计权 / NC / NR / RC / QAI / RV / 倍频程合成
│       ├── vibration.js     # 内核：弹簧减振（静变形法/频率比法/反算/厂家复核/环新复核）
│       ├── muffler.js       # 内核：消声器（阻性/抗性/组合）
│       ├── perforation.js / absorber.js / room.js / insulation.js / barrier.js / levels.js
│       ├── app.js           # 视图：背景噪声评价（#/noise，最完整的参考范例）
│       ├── view-*.js        # 视图：perforation / absorber / rt60 / stc / barrier / levels / vibration / muffler
│       ├── nav.js           # 顶栏二级菜单交互 + 面包屑
│       ├── theme.js         # 日/夜切换（localStorage 持久化 + 跟随系统）
│       └── router.js        # 哈希路由
└── tests/                   # Node 原生断言单测（无框架），`node tests/*.test.js`
```

> 注意：`public/` 是 `wrangler.toml` 里 `[assets] directory = "./public"` 指定的根。**不要把后端、构建产物塞进 `public/`**，它会原样上线。

---

## 3. 设计系统（必复制的视觉令牌）

### 3.1 浅色（默认）

```css
:root {
  --bg: #eef1f7;                       /* 页面底色，略降饱和让白卡片浮起 */
  --bg-grad: radial-gradient(1200px 520px at 50% -180px, #dde6fb 0%, rgba(221,230,251,0) 72%);
  --card: #ffffff;
  --card-soft: #f6f8fc;
  --border: #dde3ed;  --border-strong: #c3cddc;
  --text: #0f1a2a;    --text-soft: #2b3a4d;  --muted: #4d5b6e;  --faint: #5b6a80;
  --primary: #1d4ed8; --primary-d: #1a3fc0;  --primary-soft: #e8f0ff;
  --accent: #c2410c;
  --ok: #047857;      --ok-soft: #e7f7f0;
  --warn: #b45309;    --warn-soft: #fdf5e4;
  --danger: #c62828;  --danger-soft: #fdeeec;
  --field-bg: #ffffff;
  --track: #e6ebf4;
  --radius: 14px;     --radius-sm: 10px;
  --shadow: 0 1px 2px rgba(16,24,40,.05), 0 4px 14px -8px rgba(16,24,40,.16);
  --shadow-lift: 0 2px 4px rgba(16,24,40,.06), 0 14px 30px -14px rgba(16,24,40,.24);
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
```

### 3.2 暗色（两套并排选择器，见 §3.3）

暗色令牌与浅色一一对应，关键值：

```css
--bg: #0b1017;  --bg-grad: radial-gradient(1200px 520px at 50% -180px, #14223a 0%, rgba(20,34,58,0) 72%);
--card: #161d28;  --card-soft: #1c2431;
--border: #2b3646;  --border-strong: #3d4a5c;
--text: #eef3fa;  --text-soft: #d3dcea;  --muted: #aab7c8;  --faint: #8b98ab;
--primary: #6f9bff;  --primary-d: #8db0ff;  --primary-soft: #1e2c49;
--accent: #fb923c;  --ok: #34d399;  --warn: #fbbf24;  --danger: #f87171;
--field-bg: #1c2431;  --track: #2b3646;
/* 阴影整体加重、带黑色调 */
```

### 3.3 主题切换机制（重点，复制时最容易踩坑）

明暗不是靠 `@media` 自动套，而是用 `<html data-theme="dark|light">` 显式标记 + CSS 变量覆盖。**三个选择器并存**：

```css
/* ① 系统暗色：用户没手动选浅色时跟随系统 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* 暗色令牌 */ color-scheme: dark; }
}
/* ② 手动/系统暗色：data-theme="dark" 强制暗色 */
:root[data-theme="dark"] { /* 同一份暗色令牌 */ color-scheme: dark; }
/* ③ 手动浅色：data-theme="light" 强制浅色（覆盖①） */
:root[data-theme="light"] { color-scheme: light; }
```

`theme.js` 在初始化时**总是给 `<html>` 显式打 `data-theme`**（即使取系统值也写上去），避免图标与真实主题错位。具体逻辑见 §4.4。

> ⚠️ **验证主题色务必 `wait` 600ms 再取值/截图**：`.btn`/`.theme-toggle` 带 `transition: background .15s`，点击后立即 `getComputedStyle` 会拿到过渡中间态（曾误判"暗色下按钮白底"，实为过渡帧）。

### 3.4 关键组件约定

- **顶栏 `.topbar-inner`**：三列 grid `grid-template-columns: 1fr auto 1fr`——品牌左、`.mainnav` 居中、`.topbar-actions`（友链+主题按钮）右；窄屏（≤900px）退化为两行。
- **卡片 `.card`**：白底 `--radius`，配 `--shadow`；`.card-soft` 用于次级底。
- **按钮 `.btn`**：默认描边/浅底，`.btn.primary` 主蓝底。**暗色下主按钮文字改深色**（`color:#0a1424`，见 styles.css 第 111–115 行），否则白字蓝底对比不足。
- **倍频带输入 `.band-grid > .band-cell`**：每格一个 label + number input，由 JS 按 1/1（10 带）或 1/3（29 带）动态生成。
- **图表**：Canvas 手绘，横轴**对数频率**（16Hz–8k/10k），纵轴 0–100 dB；参考线 NC/NR/RC 用虚线，实测点用实线+圆点。

---

## 4. 架构与关键代码模式（复制时照抄骨架）

### 4.1 哈希路由 `router.js`

三张表驱动，无需框架：

```js
var VIEWS = { home:'view-home', noise:'view-noise', levels:'view-levels', /* …9 项… */ muffler:'view-muffler' };
var TITLES = { home:'…', noise:'背景噪声评价 · …', /* … */ };
var MOUNTS = [ { route:'noise', get:function(){ return window.NoiseView; } }, /* … */ ];

function parse(){ /* #/noise-third → {route:'noise',mode:'third'}；未知 → home */ }
function show(route, first){ /* 切换 .active 类、同步导航高亮、改 document.title */ }
function activate(route, mode){ MOUNTS.forEach(m=>{ if(m.route===route){ var v=m.get(); v.init(mode); v.onShow(); } }); }
function boot(){ apply(true); window.addEventListener('hashchange', ()=>apply(false)); }
```

### 4.2 视图接口契约（最重要）

每个视图模块末尾挂到全局，且**必须实现 `init` 与 `onShow`**：

```js
window.NoiseView = { init: init, setMode: setMode, onShow: onShow };
```

- `init(mode)`：**首次进入**调用一次，建 DOM、绑事件、填默认值、算一次。用 `inited` 标志防重复初始化。
- `onShow()`：每次路由切回该视图调用，主要用来**重绘 Canvas 图表**（隐藏状态下 Canvas 不参与布局，尺寸为 0，必须在可见后重绘）。
- 可选 `setMode(mode)`：支持同视图内子模式切换（如 noise 的 1/1 ↔ 1/3 倍频程）。

**复制新模块的最短骨架**：

```html

<section id="view-xxx" class="view" hidden> … </section>
```

```js
// js/view-xxx.js
(function(){
  'use strict';
  var inited = false;
  function init(){ if(inited) return; inited = true; /* 建 DOM、绑事件、计算 */ }
  function onShow(){ /* 重绘图表（如有） */ }
  window.XxxView = { init: init, onShow: onShow };
})();
```

```js
// router.js：VIEWS 加 'xxx':'view-xxx'，MOUNTS 加一项
// index.html：在脚本区加 <script src="js/view-xxx.js"></script>（放在 router.js 之前）
```

> **⚠️ 最容易漏的一步：首页总览也要同步。**
> 新增模块需在三处同时登记，缺一就会出现「功能只能从二级菜单进、首页总览看不到」：
> 1. **顶栏导航** `index.html` 的 `.mainnav` 里加一条 `<a data-route="xxx">`；
> 2. **首页总览** `#view-home` 里加一张 `<a class="module-card" href="#/xxx">` 卡片（含图标 SVG、标题、描述），并将对应分组的 `.module-group` 补齐；
> 3. 顺带更新总览的「共 N 个分组、M 个模块」文案、hero 快捷按钮、使用说明里的地址清单与测试断言数。
>
> 为防再犯，仓库内置了守护测试 **`tests/overview.test.js`**：它解析 `index.html` 与 `router.js`，断言
> 「每个路由都有视图 section / 出现在顶栏导航 / 出现在首页总览卡片 / 出现在使用说明地址清单」，
> 且「顶栏分组数 == 首页分组数」「提示文案的计数 == 实际」。**加完模块跑一遍 `node tests/overview.test.js`，
> 漏掉首页会立刻报出是哪个路由**，即 §6 复制清单里的强制检查项。

### 4.3 计算内核约定

- 内核文件（`acoustics.js` 等）是**纯函数**，不碰 DOM，挂在 `window.Acoustics` 等全局。
- 输入/输出用普通对象/数组，避免类继承，便于 Node 单测。
- 单测：仓库 `tests/*.test.js` 用 Node 原生 `assert`，直接 `node tests/vibration.test.js` 跑（无框架、无安装）。复制时可保留这套测试作为公式正确性的"真值"。

### 4.4 主题切换 `theme.js`（完整逻辑，可直接照抄）

```js
(function(){
  'use strict';
  var KEY = 'acoustic-theme';                 // localStorage 键名
  var root = document.documentElement;
  function systemPref(){ return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
  function stored(){ try { return localStorage.getItem(KEY); } catch(e){ return null; } }
  function current(){ var v = root.getAttribute('data-theme'); return (v==='dark'||v==='light') ? v : systemPref(); }
  function apply(theme){
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    var btn = document.getElementById('themeToggle');
    if (btn){ btn.setAttribute('aria-pressed', theme==='dark'?'true':'false');
              btn.title = theme==='dark' ? '切换到日间模式' : '切换到夜间模式'; }
  }
  function init(){
    var s = stored();
    apply((s==='dark'||s==='light') ? s : systemPref());   // 未选过时仍显式写下，避免错位
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', function(){
      var next = current()==='dark' ? 'light' : 'dark';
      apply(next); try { localStorage.setItem(KEY, next); } catch(e){}
    });
    if (window.matchMedia){
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var onChange = function(e){ var sv = stored(); if (sv!=='dark' && sv!=='light') apply(e.matches?'dark':'light'); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
```

按钮 HTML（`#themeToggle` 内含月亮/太阳两个 SVG，`[data-theme="dark"]` 时显隐其一）：

```html
<button id="themeToggle" class="theme-toggle" type="button" aria-label="切换日间/夜间模式" aria-pressed="false">
  ![svg](data:image/svg+xml;base64,PHN2ZyBjbGFzcz0iaWNvbi1tb29uIiDigKYgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiPjwvc3ZnPg==)
  ![svg](data:image/svg+xml;base64,PHN2ZyBjbGFzcz0iaWNvbi1zdW4iICDigKYgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiPjwvc3ZnPg==)
</button>
```

### 4.5 导航 `nav.js`

- 结构：`.mainnav > a[data-route="home"]` + 若干 `.nav-group > button.nav-parent + .nav-menu > a[data-route]`。
- 交互：桌面（hover 设备）悬停展开、移出收起；触屏点击展开/收起；Esc / 点外部 / 点链接后收起。
- `window.AppNav.syncActive(route)`：router 切换时调用，同步分组高亮与面包屑。
- 复制时注意：分组状态靠 `.open` 类切换，CSS 里 `.nav-group:hover .nav-menu, .nav-group.open .nav-menu { display:block }`。

### 4.6 脚本加载顺序（不可乱）

`index.html` 末尾顺序（**内核 → 视图 → 框架**）：

```
chart-util → acoustics → perforation → absorber → room → insulation
→ barrier → levels → vibration → muffler           （内核/工具）
→ app → perforation-view → view-absorber → view-rt60 → view-stc
→ view-barrier → view-levels → view-vibration → view-muffler   （视图）
→ nav → theme → router                              （框架，必须最后）
```

`router.js` 在 `DOMContentLoaded` 时 `boot()`，那时所有 `window.XxxView` 已就绪。

---

## 5. 版本演进史（每一版的界面变化 + 设计思路）★

> 以下按 `git log` 倒序整理为「演进故事」，方便朋友理解"为什么长成这样"。commit 号可 `git checkout` 对照。

### v1.0（cb20d11 初版上传）

- **界面**：单页，顶部几个平铺链接，主体是「背景噪声评价」一个表单（A 声级 / NC / NR / RC）。
- **思路**：先验证"标准公式能在浏览器跑通"这个最小闭环，没做路由、没做多模块。

### v1.1（583f568）

- **变化**：新增「房间目标值对照 + 达标判定」卡片（13 类房间 NC 目标，自动判超标）、「多测点能量平均」输入框、结果「复制 / 导出 CSV」按钮。
- **思路**：从"能算"走向"能交付"——工程师要的是"我这个房间达不达标"，所以加了目标库与判定；导出是为了把结果贴进报告。


### v1.2（30b8645）

- **变化**：支持 **1/3 倍频程输入**（原仅 1/1 倍频程），顶栏出现「1/1 ↔ 1/3」模式切换按钮；RC 增加 16Hz 带、完整 QAI、RV 两级判定；NC 低频一致性检查；图表横轴改为**对数频率轴**。
- **思路**：噪声评价国标（S12.2）本就是倍频程量，1/3 更精细；对数轴是因为频率跨 16Hz–10kHz，线性轴会挤成一团。

### v1.3（05a7813）模块化重构 + 穿孔率模块

- **变化**：**从单页拆成多视图哈希路由**，顶栏出现，首个独立模块「穿孔率计算」上线（四种阵列形制 + 反算中心距 + 阵列示意图）。
- **思路**：单页塞不下 8 个模块，必须路由化；穿孔率是吸声构造里最常算的量，优先外置。

### v1.4（f7c83c3）

- **变化**：补齐 4 个「开发中」占位模块（吸声 / 混响 / 隔声 / 声屏障），带"开发中"虚线徽标，站点功能框图全亮。
- **思路**：先把导航骨架和占位立起来，让用户看到全貌、按优先级逐个填充，避免半成品感。

### v1.5（52d6415）隔声模块

- **变化**：「墙体隔声量 Rw / STC」正式上线，按 **GB/T 50121-2005** 计权隔声量 + ASTM E413 的 STC。
- **思路**：隔声是建筑声学刚需，且国标与美标两套曲线都要给。

### v1.6（2ae7d0f）声压级叠加

- **变化**：新增「声压级叠加」模块（多声源能量叠加、相干叠加、背景噪声修正、倍频带谱叠加、距离衰减换算）。
- **思路**：这是声学计算最高频的"加法"，且最容易算错（相干 vs 能量），值得独立模块 + 速查曲线。

### v1.7（aa4c8ca）弹簧减振「计算书」模块 ★

- **变化**：新增「弹簧减振器隔振效率计算书」——核心模块。输出 **12 步计算书**（公式+代入+结果），可复制 / 导出 CSV；含静变形法、频率比法（含阻尼）、目标效率反算、传递率曲线。
- **思路**：这是作者的**招牌模块**。减振选型要出"计算书"交审，所以不做成普通计算器，而是输出可归档的分步证明。

### v1.8（f7e74e6）顶栏改版为二级菜单

- **变化**：顶栏从平铺链接 → **二级菜单**（总览 + 4 个分组：基础计算 / 材料与构件 / 房间声学 / 环境与振动），新增 `nav.js` + 面包屑（分组/模块名）。
- **思路**：模块多到一排放不下，按声学分支分组更符合工程师心智；面包屑让"我在哪"一目了然。

### v1.9（825430d）厂家计算书复核面板

- **变化**：弹簧减振新增**面板 4「厂家计算书复核」**——左栏填厂家已知条件，右栏填厂家声称的 δ/fn/η，输出逐项比对结论（一致/轻微偏差/偏差）。
- **思路**：作者的真实工作流是"复核厂家给的数据"。不做新算法，而是用标准公式**独立重算并比对**，抓出厂家取整/笔误（如 fn 常数 947 取整导致 η 差 <0.05%，界面如实说明不伪称"完全一致"）。

### v2.0（b8ca622）环新式复核 + 消声器模块

- **变化**：① 弹簧减振再增**面板 5「环新式隔振降噪计算书复核」**（青浦环新等国产厂家格式：f=n/60、f₀=(1/2π)√(9800/δ)、含阻尼传递率 η、隔声系数 N=12.5lg(1/η)）；② **消声器模块上线**（阻性 GB/T 50087 + 扩张室 + 共振腔 + 组合 A 计权插入损失）。
- **思路**：继续围绕"复核不同厂家算法体系"深化；消声器是通风空调噪声控制刚需，且一直没上线，本版补齐。实测环新式例题抓出厂家 η 取整 0.01（精确 0.0064）→ N 少算 2.4dB，正演示复核价值。

### v2.0.1（0421189）站点图标

- **变化**：补 `favicon.svg/png/ico` + `apple-touch-icon.png`，head 按 SVG→PNG→ICO→apple 优先级挂载；图标复刻 brand-logo（蓝紫渐变圆角块 + 白色声波折线）。
- **思路**：浏览器 tab 默认地球图标不专业；多格式覆盖 Chrome/Edge/iOS/老浏览器。

### v2.1（05d6e73）导航居中 + 友链 + 日/夜切换

- **变化**：① 一级菜单**居中**（`.topbar-inner` 改三列 grid，品牌左/导航中/操作区右，窄屏自动换行）；② 右侧新&#x589E;**「友链」按钮**链到 `https://blog.124365.xyz`（新标签打开）；③ 新增**日/夜切换按钮**（太阳/月亮图标随主题切换）。
- **思路**：导航居中更平衡；友链给个人博客引流；暗色模式是常态需求，且要把"跟随系统"升级为"可手动强制 + 持久化"（见 §3.3）。

### v2.1 收尾（175193b / 41c8a43 / c328a6e）

- **变化**：全站文字对比度统一拉到 **WCAG AA**（调 `--text/--muted` 等令牌）；新增线上对比度审计脚本；清理 `.gitignore`（忽略验证截图/产物）。
- **思路**：暗色上线后暴露对比度问题，做一次可读性体检，把"能看"提升到"看得舒服且合规"。

---

## 6. 复制清单（Checklist）

**最小可运行闭环（先跑通这个，再加模块）：**

- [ ] `public/index.html`（含顶栏 + 一个 `<section id="view-home">` + `<section id="view-noise" hidden>`）
- [ ] `public/css/styles.css`（§3 的明暗令牌 + 基础组件）
- [ ] `public/js/acoustics.js`（内核）、`app.js`（NoiseView 范例）
- [ ] `public/js/router.js`、`nav.js`、`theme.js`
- [ ] 本地起静态服务（`python -m http.server`）打开，确认路由切换、主题切换、图表绘制正常

**逐步加模块：** 每加一个，复制 §4.2 骨架 → 写内核纯函数 → 写 `view-xxx.js` → 在 `router.js` 注册 → **在 `index.html` 同步登记三处：顶栏 `.mainnav` 导航、首页总览 `#view-home` 的 module-card、使用说明地址清单** → 跑对应 `tests/*.test.js` 与 `tests/overview.test.js`（后者专门守护首页总览不漏项）。

**上线前核对：**

- [ ] `wrangler.toml` 的 `name` 与 Cloudflare 控制台 Worker 名**完全一致**（否则构建失败）
- [ ] `[assets] directory = "./public"` 指向正确
- [ ] favicon 四件套就位，head 引用正确
- [ ] 全站暗色对比度达 WCAG AA

---

## 7. 部署（Cloudflare Workers Builds）

`wrangler.toml` 全文：

```toml
name = "acoustic-calc"
compatibility_date = "2025-09-01"

# 静态资源目录：站点文件都放在 public/ 下
[assets]
directory = "./public"
```

- 推送 `main` 分支即触发 Cloudflare **Workers Builds** 自动构建上线（无需手动 `wrangler deploy`）。
- 若改用 Netlify / Vercel / GitHub Pages：把 `public/` 设为站点根目录即可，纯静态零服务端代码。
- 本地预览：`cd public && python3 -m http.server 8123`，浏览器开 `http://127.0.0.1:8123/`。

---

## 8. 给朋友 agent 的「一句话任务模板」

> 请基于 `E5-lab/acoustic-calc` 仓库复刻一个同架构的声学计算器：
>
> 1. 先读仓库 `README.md` 与本指南第 3、4 节，拿到设计系统与路由/视图骨架；
> 2. 把 `public/` 整体作为静态站起点，保留 `index.html` 末尾的脚本加载顺序；
> 3. 优先复刻「背景噪声评价（#/noise）」作为参考范例（最完整），再逐模块补齐；
> 4. 公式严格按对应国标/标准实现，并保留 `tests/` 作为正确性回归；
> 5. 部署到你的静态托管（Cloudflare Workers 用仓库根的 `wrangler.toml`）。  
>    技术约束：纯原生 HTML/CSS/JS，零构建、零框架、零运行时依赖。

---

*文档由 Mavis 的 AI 助手整理于项目中后期（v2.1 + WCAG AA 收尾阶段）。版本演进依据 `git log` 与开发日志。*
