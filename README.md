# 声学计算工具箱 · Acoustic Toolbox

纯静态、零依赖的建筑与材料声学计算工具集，按**模块化视图**组织（总览 / 背景噪声评价 / 穿孔率计算），哈希路由切换、深链可用。源码托管于 GitHub，可一键发布到 **Cloudflare Worker（Workers Builds）**。

## 模块

### ① 背景噪声评价（`#/noise`）

- **A 声级（A-weighted）**：IEC 61672 解析式 A 计权（支持任意 1/3 倍频带中心频率），能量叠加法计算 dBA，同时给出线性（未计权）声级与 SIL 语言干扰级（SIL 按定义取倍频带 500/1000/2000/4000 Hz 均值）。
- **NC（Noise Criterion）**：ANSI/ASA S12.2-2019 切线插值法（31.5–8000 Hz 共 9 带），输出连续 NC 值、标准标号与控制频带。
- **NC 低频一致性检查**：以 NC(SIL) 曲线为基准比较 31.5/63/125/250 Hz（S12.2 频谱不平衡法），超出 6–9 dB 提示可能引起严重不满、>9 dB 提示很可能引起。
- **NR（Noise Rating）**：ISO/R 1996 切线插值法，输出连续 NR 值、标准标号与控制频带。
- **RC Mark II（Room Criterion）**：ANSI/ASA S12.2-2019 Annex D，输出 RC 数值 + 频谱质量判定（N 中性 / R 隆隆 / H 嘶声 / RH），并列出各频带相对参考曲线的超出量。
- **QAI（品质评价指数）**：SD 低/中/高（16–63 / 125–500 / 1000–4000 Hz 三组偏差的能量平均），QAI = max − min，量化频谱失衡程度。
- **RV（振动/颤振风险）**：16/31.5/63 Hz 按 S12.2-2019 阈值判定中等（65/65/70 dB）与明确（75/75/80 dB）风险。
- **1/1 与 1/3 倍频程**：1/1 模式含 16 Hz 带（10 带）；1/3 模式 16 Hz–10 kHz 共 29 带，按各带能量合成倍频程后评价（S12.2 各评价量本身为倍频程量），图表用对数频率轴。
- **房间目标值对照**：内置 13 类常用房间的 NC 目标范围（引自 ASHRAE Handbook HVAC Applications 常用推荐值），自动判定达标并给出超出量。
- **多测点能量平均**：粘贴多条频谱逐带按功率平均（10·log₁₀(Σ10^(L/10)/n)），一键填入计算。
- **结果导出**：一键复制文本摘要、导出 CSV（含各频带实测 / RC 参考 / 超出量）。
- **频谱对比图**：Canvas 对数频率轴绘制实测频谱与 NC / NR / RC 参考曲线叠加。

### ② 穿孔率计算（`#/perforation`）

参考 E5-lab/AC_Calc 的实现并扩展，全部公式按「单元面积」统一推导：

- **四种阵列形制**：正方形对称阵列 σ = πd²/(4P²)、45° 菱形错排 σ = πd²/(2P²)、矩形非等边错排 σ = πd²/(2·P1·P2)、等边三角形错排（六方，几何精确解）σ = πd²/(2√3·P²)。
- **派生量**：单孔面积、单元面积、孔数密度（个/m²）、孔径/中心距比、剩余板面比例。
- **阵列示意图**：Canvas 按当前参数等比绘制孔阵，标注孔径、孔心距、行距与单元面积虚线框。
- **反算中心距**：给定目标穿孔率反求 P（矩形错排固定 P2 求 P1），含回代自检。
- **加工校核**：孔间剩余壁厚 < 0.8 mm 提示加工风险；σ > 30% 提示结构校核；σ < 0.3% 提示进入微穿孔板区间。
- **微穿孔板共振估算**：f₀ = c/(2π)·√(σ/(t′·D))，t′ = t + 0.85d（Maa 端部修正），附适用范围判定与 1/4 波长参考。
- **板材开孔估算**：按板面尺寸折算总孔数与总开孔面积。
- **导出**：复制文本摘要、导出 CSV。

### 计算内核与测试

- `public/js/acoustics.js` — 噪声评价内核（UMD，Node 可直接 require）
- `public/js/perforation.js` — 穿孔率内核（UMD）
- `node tests/engine.test.js` 与 `node tests/perforation.test.js` 共 109 项断言全部通过

## 目录结构

```
.
├─ public/                     # 站点根目录（Cloudflare Worker 静态资源目录）
│  ├─ index.html               # 应用外壳：顶栏导航 + 三个视图（home / noise / perforation）
│  ├─ css/styles.css           # 设计系统（亮/暗色自适应）
│  └─ js/
│     ├─ acoustics.js          # 噪声评价内核
│     ├─ perforation.js        # 穿孔率内核
│     ├─ app.js                # 噪声评价视图
│     ├─ perforation-view.js   # 穿孔率视图（含 Canvas 阵列示意图）
│     └─ router.js             # 哈希路由与视图挂载
├─ tests/                      # 内核单元测试（Node 运行）
├─ wrangler.toml               # Cloudflare Worker 配置
└─ README.md
```

## 本地预览

无需构建，直接用浏览器打开 `public/index.html` 即可；或起一个本地静态服务器：

```bash
npx serve public
```

运行内核单元测试（需 Node ≥ 18）：

```bash
node tests/engine.test.js
node tests/perforation.test.js
```

## 计算方法与公式

| 指标 | 方法 |
| --- | --- |
| A 声级 | L<sub>A</sub> = 10·log₁₀ Σ 10<sup>(Lᵢ + Aᵢ)/10</sup>，Aᵢ 取自 IEC 61672 |
| NC | 逐带对 NC 曲线表插值求指数，取各带最大值（ANSI/ASA S12.2 切线法） |
| NR | 逐带对 NR 曲线表插值求指数，取各带最大值（ISO/R 1996） |
| RC | RC = round(mean(L₅₀₀, L₁₀₀₀, L₂₀₀₀))；低频带(≤500 Hz)超参考曲线 >5 dB → R，高频带(≥2000 Hz) >3 dB → H，否则 N |

## 数据来源与精度说明

- **NC 曲线**：ANSI/ASA S12.2-2019（31.5 Hz 低频扩展列）+ 经典 Beranek/ASHRAE 曲线（63–8000 Hz，与 2019 版多数一致，个别如 NC-30@1kHz 差 1 dB）。NC 按切线法评估 31.5–8000 Hz 共 9 带；16 Hz 曲线列为推算值，仅用于低频一致性参考。
- **NC 低频一致性**：S12.2「频谱不平衡法」，以 NC(SIL) 曲线（SIL 取整到最近 5 dB 曲线）为基准。
- **NR 曲线**：ISO/R 1996 / BS EN 标准表（NR 0–130）。表中 62.5 Hz 列在本工具以 63 Hz 列近似（差值可忽略）。
- **A 计权**：IEC 61672 解析式（f₁=20.599、f₂=107.65、f₃=737.86、f₄=12194.2），与倍频带标准值差 <0.3 dB。
- **RC Mark II / QAI / RV**：ANSI/ASA S12.2-2019 Annex D；参考曲线为 1 kHz 锚点 −5 dB/倍频程直线，16/31.5 Hz 取 max(RC+25, 55)；QAI 与 RV 阈值按标准定义。
- **1/3 倍频程合成**：每倍频带取 f/√2 ~ f·√2 内的 1/3 带能量求和（16 Hz 带为 16/20 两条；12.5 Hz 未含于本工具频带表，对 16 Hz 带影响很小）。
- **QAI 解读**：标准未规定合格阈值；「≤5 dB 通常视为频谱均衡」为常用经验参考。

## 部署到 Cloudflare

### 方式一：Worker + 连接 GitHub（推荐，推送即部署）

1. 在 Cloudflare 控制台 **Workers & Pages → Create → Worker → 从 Git 仓库导入**。
2. 选择你的 GitHub 仓库，分支默认 `main`，**构建命令留空**，**部署命令**保持默认 `npx wrangler deploy`。
3. 确认仓库根目录含有 `wrangler.toml`，其中 `name` 必须与 Cloudflare 里的 Worker 项目名**完全一致**（默认即 `acoustic-calc`，若你改名需同步改第一行 `name`）。
4. 推送代码到 `main`：Cloudflare 会自动克隆 → 安装 → `wrangler deploy`，把 `public/` 作为静态资源发布。
5. 部署完成后获得 `acoustic-calc.<你的子域>.workers.dev`，可在 **Settings → Domains** 绑定自有域名。

> 关键点：`wrangler.toml` 里 `[assets] directory = "./public"` 告诉 Wrangler 把 `public/` 当作站点根目录。若缺这一项或 `name` 不匹配，构建会失败（这正是之前报错的原因）。

### 方式二：Cloudflare Pages 直接上传（无需 GitHub / CLI）

1. 控制台 **Workers & Pages → Create → Pages → Upload assets（上传资源）**。
2. 把本仓库的 `public/` 文件夹拖入上传框（确保里面含 `index.html`）。
3. 完成后立即获得 `*.pages.dev` 链接，无需任何配置。

### 方式三：Wrangler CLI 手动部署

```bash
npm i -g wrangler
wrangler login
wrangler deploy          # 读取 wrangler.toml，将 public/ 作为资源发布
```

## 已知限制 / 后续改进（待评审）

- [x] ~~NC 仅评估 63–8000 Hz；补充 31.5 Hz 扩展曲线。~~（v1.2：切线法纳入 31.5 Hz，另加 S12.2 低频一致性检查）
- [x] ~~RC 未含 16 Hz 带与完整 QAI（Quality Assessment Index）量化。~~（v1.2：16 Hz 带输入 + 标准 QAI 公式 + 两级 RV 阈值）
- [x] ~~拓展 1/3 倍频程输入。~~（v1.2：29 带 1/3 输入 + 能量合成倍频程 + 对数轴图表）
- [x] ~~增加典型房间目标值对照表（办公室/录音棚/病房等）与达标判定。~~（v1.1 已实现：13 类房间 NC/RC 目标自动判定）
- [x] ~~支持多测点能量平均、结果导出（CSV/摘要复制）。~~（v1.1 已实现）
- [x] ~~RC 各频带超出参考曲线明细。~~（v1.1 已实现：RC 结果卡内嵌明细表）
- [x] ~~把站点重构为模块化多视图（参考主流工具站审美），上线穿孔率计算模块。~~（v1.3：顶栏导航 + 总览/噪声评价/穿孔率三视图，哈希路由）
- [ ] RNC（Room Noise Criteria，S12.2-2019）：低频波动/喘振型 HVAC 噪声评价，可作为下一步。
- [ ] NC 16 Hz 曲线列为线性推算值，取得标准 Table 1 完整低频数据后可替换。
- [ ] 测量不确定度与多次测量统计（S12.2 Annex A/B 思路）。

> 本工具仅供工程估算与教学演示，正式验收请以现行标准与计量仪器为准。
