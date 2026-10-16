# 扩散体设计模块 · 集成补丁（Diffuser Designer）

本补丁对应新增文件（已由本模块提供，**无需改动即可独立存在**）：

- `public/js/diffuser.js` —— 计算内核（纯函数，UMD：浏览器挂 `window.Diffuser`，Node 走 `module.exports`）
- `public/js/view-diffuser.js` —— 视图（挂载到 `#view-diffuser`，暴露 `window.DiffuserView = { init, onShow }`）

**设计原则：仅新增自包含文件，不触碰 `router.js` / `nav.js` / `index.html` / `README.md` 的既有内容，避免与其他并行开发者的改动冲突。** 下面的改动请在确认无他人正在编辑这些文件时合入（建议用 `git` 合入后统一提交）。

---

## 1. `public/index.html`

### 1.1 在「房间声学」分组的导航菜单中，于 `data-route="smallroom"` 的 `<a>` 之后追加：

```html
          <a href="#/diffuser" data-route="diffuser"><span class="nm-t">扩散体设计</span><small class="nm-d">QRD/PRD/MLS/2D · Skyline/Binary/Wave/Fractal</small></a>
```

### 1.2 在任意 `<section class="view" id="view-...">` 区块附近（例如 `#view-wave` 区块之后）追加占位容器：

```html
  <section class="view" id="view-diffuser" data-view="diffuser" hidden></section>
```

### 1.3 在脚本区（`view-wave.js` 之后）追加两个 `<script>` 标签：

```html
  <script src="js/diffuser.js"></script>
  <script src="js/view-diffuser.js"></script>
```

---

## 2. `public/js/router.js`

### 2.1 `VIEWS` 对象内追加一行（与其他 `route: 'view-xxx'` 同级）：

```js
    diffuser: 'view-diffuser',
```

### 2.2 `TITLES` 对象内追加一行：

```js
    diffuser: '扩散体设计 · 声学计算工具箱',
```

### 2.3 `MOUNTS` 数组内追加一项：

```js
    { route: 'diffuser', get: function () { return window.DiffuserView; } },
```

---

## 3. `public/js/nav.js`

### 3.1 `NAV_SUB` 对象内追加一行（菜单展开时显示的三级入口）：

```js
    diffuser: ['八类几何形态', '几何剖面', '裁切清单'],
```

---

## 4. `README.md`

在「模块」小节末尾追加一节（与其它 `### N 名称（#/route）` 同级）：

```markdown
### ⓿⓪ 声学扩散体设计（`#/diffuser`）

八类扩散体的参数化几何设计，基于公开经典声学公式（Schroeder 1975；Cox & D'Antonio）：

- **QRD 二次余数**：井深 dₙ = (n² mod N)·λ₀/(2N)，宽频均匀散射；
- **PRD 原根**：dₙ = gⁿ mod N · λ₀/(2N)，散射图样具方向性；
- **MLS 最大长度**：二元深度（0 / λ₀/2），功率谱平坦、制造最简单；
- **2D QRD**：X/Y 独立素数序列，半球散射；
- **Skyline / Binary / Wave / Fractal**：开口井天际线、反射/吸声交替光栅、光滑波纹曲面、自相似多尺度构造。

输出：设计频率、最大井深、周期宽度、有效频段（基于几何估算：f_low = c/(2·d_max)，f_high = c/(2·a)）、目标频段契合度、几何剖面（1D 阶梯 / 2D 深度网格）、按井深聚合的裁切清单（体积与估算重量）。**不含 BEM/FEM 物理仿真，最终性能以现场测量为准。**
```

---

## 验证（无需构建，纯静态）

```bash
# 仅校验内核逻辑（Node 下走 module.exports 分支）
node -e "const D=require('./public/js/diffuser.js'); console.log(D.generate({type:'qrd',f0:1000,wellWidth:50,N:7,targetLow:800,targetHigh:3430}));"
```

本地预览：在 `public/` 目录下起任意静态服务器（如 `python -m http.server`），打开 `index.html` 后访问 `#/diffuser`。
