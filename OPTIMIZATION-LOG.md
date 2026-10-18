# 优化实施日志（P0 / P1 / P2 分批）

> 对象：https://github.com/E5-lab/acoustic-calc
> 范围：代码重复消除、架构收敛、文档拆分、可移植性、命名统一、常量提取
> 验证手段：Node 单测（`node tests/run-all.js`）+ 语法检查 + 结构守护测试
> 最终状态：**59 个测试文件全部通过，4121 项断言 0 失败**

---

## P0 — 高优先级（安全、低风险、消除隐患与最大重复）

### P0-1 统一 `esc()` 转义函数（消除 XSS 隐患）
- 新增 `public/js/util.js`：提供完整五字符 `esc()`（`& < > " '`）、`$`、`num`、`signed`、`fmt`、`cssVar`、`flash`、`copyText`、`parseNum`，作为全站共享工具层。
- `util.js` 在 `index.html` 中**第一个**加载（所有依赖它的视图此前已执行）。
- 将 **39 个文件**的本地 `esc` 统一委托为 `window.Util.esc`：包括 35 个三字符残缺版（仅转义 `& < >`，缺 `" '`，用于属性上下文即构成注入点）、`ui-kit.js` 与 `all-tools.js` 的多行版。
- 修复正则误伤：`ui-kit.js`、`all-tools.js` 残留的 `[c];` 已恢复为完整实现；`material-store.js` 的 `esc` 加 UMD 防御（`window.Util` 不存在时回退）。
- `sw.js` 预缓存清单加入 `util.js`，缓存版本升到 `v1.4.2`。
- `tests/structure.test.js` 新增 **4b** 守护：禁止再次出现残缺 `esc` 定义。

### P0-2 收敛 `copyText` / `fallback`
- 6 个视图（`absorber`/`barrier`/`levels`/`rt60`/`stc`/`vibration`）的 `copyText(txt, id)` + `fallback` 统一委托为 `window.Util.copyText`（回调式，自动 `flash` 提示、失败走 `alert` 兜底），删除 6 处重复且含 `execCommand` 的回退实现。

### P0-3 拆分 README 更新记录
- 将 README.md 中约 120 行的「更新记录」整节迁出为独立 **CHANGELOG.md**，README 仅保留一行入口链接。
- README 由 758 行降至 640 行，目录结构小节补充 `CHANGELOG.md` 条目。
- 回归验证：结构守护测试（README 引用计数）仍通过。

---

## P1 — 中优先级（架构收敛、工程化）

### P1-1 路由三表合一
- 重写 `router.js`：以单一数据源 `ROUTES`（每路由一处登记 `{ route, viewId, title, mount }`）派生 `VIEWS` / `TITLES` / `MOUNTS`，运行时 API 完全兼容（`AppRouter.routes` / `.titles` 不变）。
- 同步更新三个通过正则解析源码的守护测试（`overview.test.js`、`handbook.test.js`、`home-ui.test.js`），守护意图不变。
- 收益：新增模块路由登记点由 5 处（router 3 表 + nav + 总览 + README）收敛为 1 处。

### P1-2 引入测试运行器与 CI
- 新增 `package.json`（`scripts.test` = `node tests/run-all.js`，要求 Node ≥ 18）。
- 新增 `tests/run-all.js`：逐个运行全部 `*.test.js`，汇总「文件数 / 通过 / 失败 / 断言数」，任一失败以非零码退出。
- 新增 `.github/workflows/test.yml`：Node 18/20/22 矩阵 + `npm test`，每次 push/PR 自动跑。
- README「本地预览」小节改为 `npm test`，并说明 CI。

### P1-3 统一 `$` 选择器
- 将 **61 个文件**的 `function $(id){return document.getElementById(id)}` 统一委托为 `window.Util.$`。
- `ui-kit.js` / `ui-lab.js` 的 `querySelector` 版 `$` 语义不同，**保留未动**（未误伤）。
- 内核模块的同名 `num`（输入解析，返回 `null`）与视图层 `num`（输出格式化，返回 `'—'`）、以及 `fmt`（默认位数 1/2/3 不一致）**存在语义分化，刻意保留**，避免机械统一引入 bug。
- `tests/structure.test.js` 新增 **4c** 守护：禁止重复定义 getElementById 版 `$`。

### P1-4 `_verify` 脚本可移植化
- 9 个 `_verify/*.mjs` 的无头浏览器脚本，原硬编码 Windows Edge 路径与本地端口，现全部支持环境变量覆盖：
  - `VB_EDGE`：浏览器可执行文件路径（默认保留原 Windows 路径，修正了路径字面量的双反斜杠转义）
  - `VB_PORT`：CDP 调试端口（保留各文件原默认值）
  - `VB_BASE`：被测站点地址（默认保留各文件原 `127.0.0.1:8765` / 线上 URL）
- 每个文件顶部追加一行环境变量说明注释。
- 修正一处隐患：路径字面量原为单反斜杠（运行时 `\P` 等会被 JS 吞掉），已改回源码级双反斜杠。

---

## P2 — 低优先级（命名、主题、常量）

### P2-1 统一视图命名
- 重命名 `app.js` → `view-noise.js`、`perforation-view.js` → `view-perforation.js`（`git mv`，全局对象 `NoiseView` / `PerforationView` 不变，不破坏任何调用方）。
- 同步更新：`index.html` 脚本标签、`README.md`、`REPLICATION-GUIDE.md`、`tests/ui-kit.test.js`（读取路径与断言文案）。
- 两个文件头注释同步更名。

### P2-2 抽取共享主题色板工具 `cssVar`
- 将 **13 个文件**（含 `chart-util.js` 与 12 个绘图视图）的本地 `cssVar` 实现统一委托为 `window.Util.cssVar`（读写逻辑等价：取 `--var` → trim → 兜底）。
- `util.js` 的 `cssVar` 作为唯一规范实现。
- `tests/structure.test.js` 新增 **4d** 守护：禁止再自建 `cssVar`（除 `util.js` 规范实现外）。

### P2-3 魔法数字提常量 / 死代码清理
- `acoustics.js` 中 `NC_BANDS` 与 `NR_BANDS` 字节相同（31.5–8000 Hz 8 带），提取为命名常量 `STD_8BANDS`，二者各以 `.slice()` 独立派生，公共 API 不变。
- 全仓扫描：**无 `console.log/debug` 调试残留**；频带常量已在 `acoustics.js` 集中、视图统一通过 `E.BANDS` 引用，内核层各 UMD 模块自含常量属「零依赖、可独立 Node 测试」的有意取舍，**不强行抽取**（避免破坏 UMD 契约与 Node 测试）。
- `tests/structure.test.js` 新增 **4e** 守护：计算内核不得 `require` 本地模块（剥离注释后校验，避免误伤文档字符串），固化零依赖契约。

---

## 验证总览
| 阶段 | 命令 | 结果 |
|---|---|---|
| 全量单测 | `node tests/run-all.js` | 59 文件通过 / 0 失败 / 4121 断言 |
| 结构守护 | `node tests/structure.test.js` | 54 通过 / 0 失败 |
| 语法 | 全部改动 `.js/.mjs` | `node --check` 全绿 |

## 改动文件分布（git status）
- `public/`：69 个（主要是 `util.js` 新建 + 大量视图委托化）
- `tests/`：6 个（守护测试扩展 + `run-all.js` 新增）
- `_verify/`：9 个（可移植化）
- 根级：`.github/workflows/test.yml`、`package.json`、`README.md`、`CHANGELOG.md`、`REPLICATION-GUIDE.md`、`OPTIMIZATION-LOG.md`

## 未做（刻意保留，附理由）
- **模块化打包 / 按需加载（原报告 2.1）**：138 个同步 `<script>` 是最大性能瓶颈，但引入打包器属于高风险的架构级改动，需先与仓库维护者确认技术选型（纯静态零构建是该项目当前核心约束），故未在本批自动执行。
- **`exportCsv` / `summaryText` 各视图自实现**：每个模块 CSV 列布局不同，属定制逻辑而非纯重复；强行统一会丢失模块特定功能，应走声明式配置重构（较大改造），留待后续。
- **内核层 `BANDS` 抽取共享**：各内核 UMD 模块刻意零依赖以独立 Node 测试，`acoustics.js` 已集中并对外暴露 `E.BANDS`，视图层已统一复用，故内核间不强行共享。
