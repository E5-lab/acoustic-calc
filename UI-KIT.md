# UI Kit · 复杂组件与交互效果

为「声学计算工具箱」新增的一层**零依赖** UI 能力，保持原有纯静态、无构建、明暗双主题的架构不变。所有样式使用既有设计令牌（`--card` / `--primary` / `--border` …），类名统一 `uik-` 前缀，避免与业务模块冲突。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `public/css/ui-kit.css` | 全部组件样式、响应式与 `prefers-reduced-motion` 降级 |
| `public/js/ui-kit.js` | 命令面板、Toast、Tooltip、涟漪、3D 卡片、数字滚动、进度条、滚动揭示 |
| `public/ui-lab.html` | 交互与组件实验室（独立页面，集中演示全部组件） |
| `public/js/ui-lab.js` | 实验室交互：画布、拖拽、表格、浮层、键盘操作 |
| `public/js/ui-kit.js`（`cmdk-aliases.js`） | 命令面板拼音/缩写别名索引（`window.UikAliases`，61 路由 → 拼音 + 缩写 + 英文，与 NAV_SUB 子功能一并并入匹配域） |
| `tests/ui-kit.test.js` | 结构守护测试（109 项断言，不依赖浏览器） |

首页接入：

```html
<link rel="stylesheet" href="css/styles.css" />
<link rel="stylesheet" href="css/ui-kit.css" />
...
<script src="js/export.js"></script>
<script src="js/ui-kit.js"></script>
```

## 全局能力（所有页面自动生效）

### 1. 命令面板 `⌘K` / `Ctrl K`

- 索引首页 61 个模块卡片（标题、分组、说明），支持中英文关键词与**子序列模糊匹配**；
- **拼音 / 缩写 / 子功能匹配**：`cmdk-aliases.js` 提供全量路由别名（搜「hunjiao」命中混响、「nc」命中背景噪声评价、「rt60」直达），NAV_SUB 三级子功能文本亦并入匹配域（搜「Bonello」命中小房间模块）；
- `↑ ↓` 选择、`↵` 打开、`Esc` 关闭、`Tab / Shift+Tab` 循环；
- 记录最近使用（`localStorage: acoustic-cmdk-recent`，最多 6 条，仅本机）；
- 内置操作：切换主题、复制分享链接、导出 CSV、打印 PDF、打开实验室、回到顶部；
- 实验室等无 `#view-home` 的页面会自动 `fetch('index.html')` + `DOMParser` 解析索引，选中模块时跳转 `index.html#/route`。
- **移动端悬浮入口**：≤640px 时右下角常驻 `.uik-fab`（54px 圆形按钮），手机上随时唤起面板；聚焦输入框时自动淡出（避免压住表单），面板打开时隐藏、关闭后恢复；桌面不显示（顶栏已有 `#cmdkBtn`）。

### 1b. 手机端导航抽屉（v2.13）

≤768px 时顶栏导航条收成左侧抽屉：`☰` 按钮 + 遮罩 + 手风琴二级菜单，`body.nav-open` 控制开合，`Esc` / 遮罩 / 点二级链接 / 切路由都会关闭。抽屉模式下 `.mainnav` 临时挂到 `body`（避开 `.topbar` 的 `backdrop-filter` 包含块），友链 / 导出搬进底部「更多」区，桌面断点自动还原。桌面端不显示 `☰`，样式全部锁在媒体查询内。

### 2. Toast 队列

替代零散 `alert`，支持 `ok / info / warn / error` 四种语义、标题 + 正文、进度条、悬停暂停、最多 4 条堆叠、手动关闭。`AppShare.toast` 已自动桥接到该队列。

### 3. 动效分级（v2.11）

**服务任务的动效**（Toast、Tooltip、主题圆形揭示、命令面板、数字滚动、滚动进度、分组入场揭示）在所有页面默认启用；**纯装饰动效**（按钮涟漪、卡片 3D 聚光倾斜）默认仅在交互实验室启用，产品页保持安静——可用 `<html data-uik-decor="on">` 显式开启、`"off"` 强制关闭。

### 4. 其他微交互

| 能力 | 说明 |
| --- | --- |
| Tooltip | `data-tip="提示文本"` 声明式使用，自动上下翻转、箭头对齐、滚动/点击隐藏 |
| 涟漪 | `.btn` / `.mode-btn` / `.icon-btn` / `.theme-toggle` / 分段与标签按钮 |
| 3D 聚光卡片 | 首页 `.module-card` 跟随指针倾斜（≤5.4°）并移动径向高光 |
| 数字滚动 | 监听结果容器，数值变化时从旧值缓动到新值（`NC 45.2`、`39.5 dBA` 等） |
| 阅读进度 | 顶部 3 px 渐变进度条，随滚动实时更新 |
| 滚动揭示 | 首页分组、实验室区块进入视口时淡入上移，支持错峰延迟 |
| 主题圆形揭示 | View Transitions API 从点击位置扩散新主题；不支持时同步切换 |

## JavaScript API

```js
// 通知
UIK.toast({ type: 'ok', title: '已保存', message: '结果已写入草稿', duration: 3000 });
UIK.ok('已复制');  UIK.info('提示');  UIK.warn('低频超标');  UIK.error('数据不足');

// 命令面板
UIK.palette.open();
UIK.palette.close();
UIK.palette.toggle();

// Tooltip（一般无需手动调用，data-tip 已自动处理）
UIK.tip.show(element);
UIK.tip.hide();
```

## 交互实验室 `ui-lab.html`

独立页面，不进入哈希路由与首页模块计数，因此不会影响 `overview.test.js` / `home-ui.test.js` 的统计。包含 9 个演示区：

1. **命令面板与 Toast** —— 四种通知语义、队列堆叠；
2. **分段控件与开关** —— 滑块式选中态、`role="switch"`；
3. **滑块与环形进度** —— 渐变轨道、跟随气泡、SVG `stroke-dashoffset` 联动；
4. **标签页与手风琴** —— 滑动下划线、`grid-template-rows: 0fr → 1fr` 高度过渡；
5. **模态框与抽屉** —— 焦点循环、`Esc` / 遮罩关闭、滚动锁定、焦点归还；
6. **拖拽前后对比** —— `clip-path` 裁切 + Pointer Events + 键盘方向键；
7. **频谱曲线编辑器** —— Canvas 对数频率轴、拖动节点、参考曲线、A 计权总级、双击复位、完整键盘操作；
8. **可排序数据表** —— 升降序、`aria-sort`、即时筛选、空状态、吸顶表头；
9. **动效与微交互** —— 3D 卡片、数字滚动、骨架屏、涟漪与焦点环。

画布均按 `devicePixelRatio` 缩放，并在窗口尺寸、主题变化时自动重绘。

## 无障碍与降级

- 所有浮层使用 `role="dialog"` / `aria-modal`，打开后焦点进入，`Tab` 在内部循环，关闭后归还触发元素；
- 命令面板采用 `combobox + listbox + option` 模式，`aria-activedescendant` 跟随光标；
- 表格排序写入 `aria-sort`；频谱画布 `role="application"` 并实时更新 `aria-label`；
- 分段控件 / 标签页支持 `← →`、`Home`、`End`；
- `prefers-reduced-motion: reduce` 下关闭 Toast、揭示、涟漪、倾斜、主题扩散等动效，保留功能；
- 窄屏：一级菜单撑满整行以启用「更多」收纳；友链 / 导出收为图标按钮；轮播箭头移至右上角，避免压住说明文字。

## 测试

```bash
node tests/ui-kit.test.js     # 109 项结构断言
node tests/overview.test.js   # 299 项（未受影响）
node tests/home-ui.test.js    # 138 项（未受影响）
```

新增模块时无需改动 UI Kit：命令面板在打开时重新解析首页卡片，自动收录新模块。

## 浏览器支持

命令面板、Toast、Canvas 等基于 ES5 + 标准 DOM API，覆盖现代浏览器；主题圆形揭示依赖 View Transitions（Chrome / Edge 111+），其余浏览器自动降级为即时切换。

## 已知取舍

- 实验室页的命令面板需要 `fetch('index.html')` 解析模块索引；`file://` 直接打开时会降级为仅操作项，通过 HTTP 访问则完整可用。
- 为避免旧缓存，`sw.js` 缓存版本已升级并预缓存 `ui-kit.css` / `ui-kit.js`。
