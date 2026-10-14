# 声学计算器 · Acoustic Calculator

纯静态、零依赖的室内背景噪声评价工具，支持 **A 声级 / NC / NR / RC** 四种常用倍频带指标计算。源码托管于 GitHub，可一键发布到 **Cloudflare Worker（Workers Builds）**。

## 功能

- **A 声级（A-weighted）**：基于 IEC 61672 倍频带 A 计权修正，能量叠加法计算 dBA，同时给出线性（未计权）声级与 SIL 语言干扰级。
- **NC（Noise Criterion）**：ANSI/ASA S12.2 切线插值法，输出连续 NC 值、标准标号与控制频带。
- **NR（Noise Rating）**：ISO/R 1996 切线插值法，输出连续 NR 值、标准标号与控制频带。
- **RC Mark II（Room Criterion）**：ANSI/ASA S12.2 Annex D，输出 RC 数值 + 频谱质量判定（N 中性 / R 隆隆 / H 嘶声 / RH），标注 31.5 Hz 振动风险，并列出各频带相对参考曲线的超出量明细。
- **房间目标值对照**：内置 13 类常用房间（录音棚 / 音乐厅 / 办公室 / 会议室 / 病房 / 影院等）的 NC 目标范围（引自 ASHRAE Handbook HVAC Applications 常用推荐值），自动判定实测结果是否达标并给出超出量。
- **多测点能量平均**：粘贴多条频谱逐带按功率平均（10·log₁₀(Σ10^(L/10)/n)），一键填入计算。
- **结果导出**：一键复制文本摘要、导出含各频带实测 / RC 参考 / 超出量的 CSV。
- **频谱对比图**：Canvas 绘制实测频谱与 NC / NR / RC 参考曲线叠加。

## 目录结构

```
.
├─ public/                 # 站点根目录（Cloudflare Worker 静态资源目录）
│  ├─ index.html
│  ├─ css/styles.css
│  └─ js/acoustics.js, app.js
├─ tests/engine.test.js    # 计算内核单元验证（Node 运行）
├─ wrangler.toml          # Cloudflare Worker 配置
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
```

## 计算方法与公式

| 指标 | 方法 |
| --- | --- |
| A 声级 | L<sub>A</sub> = 10·log₁₀ Σ 10<sup>(Lᵢ + Aᵢ)/10</sup>，Aᵢ 取自 IEC 61672 |
| NC | 逐带对 NC 曲线表插值求指数，取各带最大值（ANSI/ASA S12.2 切线法） |
| NR | 逐带对 NR 曲线表插值求指数，取各带最大值（ISO/R 1996） |
| RC | RC = round(mean(L₅₀₀, L₁₀₀₀, L₂₀₀₀))；低频带(≤500 Hz)超参考曲线 >5 dB → R，高频带(≥2000 Hz) >3 dB → H，否则 N |

## 数据来源与精度说明

- **NC 曲线**：Beranek / ASHRAE 经典曲线，NC 15–50 直接引用，55–70 由相邻曲线线性外推。NC 按标准仅评估 **63–8000 Hz 8 个倍频带**（31.5 Hz 输入供 A/NR/RC 使用，不参与 NC 评价）。
- **NR 曲线**：ISO/R 1996 / BS EN 标准表（NR 0–130）。表中 62.5 Hz 列在本工具以 63 Hz 列近似（差值可忽略）。
- **A 计权**：IEC 61672 在 31.5–8000 Hz 倍频带中心频率处的修正值。
- **RC**：RC Mark II 参考曲线以 1000 Hz 为锚点、−5 dB/倍频程斜率生成，16/31.5 Hz 设下限 max(RC+25, 55) dB。演示版未含 16 Hz 带与完整 QAI 量化，振动风险以 31.5 Hz > 75 dB 近似。

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

- [ ] NC 仅评估 63–8000 Hz；可考虑补充 31.5 Hz 扩展曲线。
- [ ] RC 未含 16 Hz 带与完整 QAI（Quality Assessment Index）量化，振动风险(RV)仅为 31.5 Hz 阈值近似。
- [ ] 当前为 1/1 倍频程；可拓展 1/3 倍频程输入与 RC 1/3 倍频程判定。
- [x] ~~增加典型房间目标值对照表（办公室/录音棚/病房等）与达标判定。~~（v1.1 已实现：13 类房间 NC/RC 目标自动判定）
- [x] ~~支持多测点能量平均、结果导出（CSV/摘要复制）。~~（v1.1 已实现）
- [x] ~~RC 各频带超出参考曲线明细。~~（v1.1 已实现：RC 结果卡内嵌明细表）

> 本工具仅供工程估算与教学演示，正式验收请以现行标准与计量仪器为准。
