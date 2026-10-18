# 声学工具凑够 100 个 · 分块实施计划

> 目标：现有 **61 个**功能工具（router.js 的 ROUTES，去掉 home/all），再新增 **41 个**声明式计算器 → 总计 **102 个**，超过 100 阈值。
> 方式：**声明式计算器引擎**（非打包/非按需加载，仍是全同步 ES5 脚本），新增工具 = 在 `calc-bN.js` 里调用一次 `CalcRegistry.register(...)`，由 `calc-view.js` 统一渲染 UI。
> 本计划用于把工作**拆成 8 个互相独立、零冲突的块**，交多个 AI 并行实现，最后由主 AI 汇总。

---

## 1. 架构与文件职责（已搭好地基，无需改动）

| 文件 | 职责 | 谁改 |
|------|------|------|
| `public/js/calc-core.js` | 注册表核心：`CalcRegistry.register/get/all/pending/groups/fmt`。浏览器里自动建 `<section>` 视图容器、把路由入队给 router；Node 里只登记配置（便于单测）。**全局名 `CalcRegistry`（浏览器=window，Node=global）** | 主 AI（已定稿） |
| `public/js/calc-view.js` | 通用引擎：根据 config 渲染表单→实时计算→公式代入→结果卡片→复制/CSV/重置；并在 DOM 就绪后把全部声明式工具按 `nav.group` 注入「速算计算器」导航分组与首页卡片。**零 DOM 依赖的 `compute` 在此被调用** | 主 AI（已定稿） |
| `public/js/router.js` | 已扩展：启动时合并 `CalcRegistry.pending()` 的声明式路由进 VIEWS/TITLES/MOUNTS | 主 AI（已定稿） |
| `public/index.html` | 已在 `router.js` 之前加载 `calc-core → calc-view → calc-b1..b8`；新增块**无需再改此处导航**（引擎自动注入） | 主 AI（已定稿） |
| `public/js/calc-b7.js` | **示范块（已完整实现 4 个工具）**：mach / standing-open-closed / p-u-intensity / decibel-conv。其余 AI 严格照此写法 | 主 AI（参考模板） |
| `public/js/calc-b1.js` … `calc-b6.js`, `calc-b8.js` | **待实现块（当前为空壳 + 本块工具清单注释）**。每个由一名 AI 填充 | 各协作 AI |
| `tests/calc-b7.test.js` | 示范测试（纯函数断言） | 主 AI |
| `tests/calc-registry.test.js` | 契约门禁：自动校验所有登记项的必填字段与 route 唯一性 | 主 AI |
| `tests/calc-bN.test.js`（N=1..6,8） | 各块单测（协作 AI 新增） | 各协作 AI |

---

## 2. 契约：一个工具 = 一次 register

```js
CalcRegistry.register('route-id', {
  title: '中文名 · 声学计算工具箱',                 // document.title（含后缀）
  nav: {
    group: '分类名',                               // 决定导航/首页归类（见第 4 节可选分类）
    label: '中文名',                               // 导航与卡片标题
    desc: '一句话说明',                            // 导航/卡片副标题
    sub: ['要点1', '要点2']                        // （可选）三级说明
  },
  intro: '一段纯文本说明（支持 textContent，无需 HTML）',
  inputs: [
    { key:'x', label:'名称', unit:'单位', def:1, step:0.1, min:0, max:100 },
    { key:'type', label:'类型', type:'select', def:'a',
      options:[ {value:'a',label:'A 型'}, {value:'b',label:'B 型'} ] }
  ],
  outputs: [
    { key:'y', label:'结果名', unit:'Hz', digits:2 }  // digits=显示小数位
  ],
  // ★ 纯函数：只依赖入参 state（各输入框数值对象；select 的值为字符串）；
  //   不得访问 DOM / window / 随机源；返回 { ok, values, formula, notes }
  compute: function (s) {
    var y = ... ;                                  // 用 s.x、s.type 计算
    return {
      ok: true,                                    // false 时只显示 error 文本
      values: { y: y },
      formula: '公式代入说明，可用 <span class="fx">高亮</span>（受信任，内部 HTML）',
      notes: [ { level:'info', text:'补充说明' } ]  // level: info|warn|error|ok
    };
  }
});
```

### 硬约束（结构守护测试会卡）
- `compute` 必须是纯函数（不碰 DOM），否则 Node 单测无法跑。
- 除 `calc-core.js`（唯一 `esc`/`$` 规范实现）外，任何文件**不得**新建残缺 `esc` 或 `getElementById` 版 `$`；如需 DOM 辅助，委托 `window.Util.*`。
- 不得 `require` 本地其它模块（内核零依赖契约）。
- 路由 `route-id` 全局唯一（门禁 `calc-registry.test.js` 会查重）。

---

## 3. 如何新增一个工具（最小步骤）
1. 打开对应 `calc-bN.js`，在 IIFE 内仿照 `calc-b7.js` 写 `CalcRegistry.register(...)`。
2. 设计 `inputs / outputs / compute`，**先用 Node 验证 `compute` 数值正确**。
3. 在 `tests/` 下新建 `calc-bN.test.js`，用纯函数断言（照 `calc-b7.test.js`）。
4. 运行 `node tests/calc-bN.test.js` 与 `node tests/calc-registry.test.js` 全绿。
5. **不要改 `index.html` 导航**——引擎会按 `nav.group` 自动注入导航与首页卡片。
6. 提交时把总数提示（`index.html` 与 `README.md` 的「共 N 个测试文件全部通过」）顺手 +1（每新增一个 `.test.js` 文件 +1）。

---

## 4. 分块清单（8 块 = 41 个工具，交 8 个 AI 并行）

> nav.group 建议分类（也可沿用现有 8 个一级分组之一，引擎会自动归类）：
> 材料与建筑声学 / 电声与系统 / 心理与音乐声学 / 噪声与法规 /
> 测量与校准 / 超声·结构·声速 / 经典与教学 / 振动与结构

### B1 · 材料与建筑声学（6）— `calc-b1.js`（空壳待填）
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `mpp` | 微穿孔板吸声设计器 | 孔径 d、板厚 t、空腔 D、穿孔率 σ → 质量因子 η=√(... )→ 法向声阻抗、α 峰值频率 f0、峰值 α |
| `coincidence` | 临界吻合频率 fc | 面密度 m′、板厚 h、杨氏模量 E、泊松比 ν → fc = c0²/(2πh)·√(ρ_b(1−ν²)/E)，ρ_b=m′/h |
| `sabine-alpha` | 由混响测吸声系数 | T60、体积 V、表面积 S → α = (0.161·V/(S·T60))（Sabine）/ Eyring 修正 |
| `cavity-abs` | 薄板/膜共振吸声峰 | 质量面密度 m′、空腔深度 D、阻尼 → f0=(1/2π)√(ρc²/(m′D))、半功率带宽 |
| `wall-tl` | 单层墙质量定律+吻合 | 面密度 m′、频率 f、入射角 θ → TL=20log10(m′f)−47.5+Δ(吻合谷) |
| `floor-float` | 浮筑楼板改善量 | 基层 TL、弹性层固有频率 fn → ΔR ≈ 隔振传递损失附加量 |

### B2 · 电声与系统（6）— `calc-b2.js`
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `directivity` | 指向性因数 Q/DI | 辐射半角或阵列口径 → Q、DI=10log10Q |
| `nearfar` | 近场远场分界 | 口径 D、频率 f → r≈D²/(4λ) |
| `roomgain` | 边界增益 / SBIR | 距墙/地面距离 d、频率 f → 镜像叠加增益 20log10(1+… ) |
| `spl-vs-dist` | 点声源距离衰减 | 声功率 Lw、指向性 Q、距离 r、空间类型（自由场/半球/全空间）→ Lp |
| `damping-factor` | 功放阻尼系数影响 | 阻尼系数 DF、负载阻抗 Z → 低频阻尼误差 % |
| `delay-align` | 扬声器延时/相位对齐 | 路径差 Δd → 延时 ms、相位差 ° |

### B3 · 心理与音乐声学（5）— `calc-b3.js`
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `cents` | 音分↔频率 | 半音/音分数 → 频率比 2^(n/1200)；根音频率 → 目标频率 |
| `bark-erb` | 临界带 Bark/ERB | 频率 f → 临界带号 z、ERB(f)=24.7·(4.37f/1000+1) Hz |
| `chord` | 和弦/音程频率 | 根音频率、音程（纯八度/五度/大三度…）→ 各音频率 |
| `masking` | 临界带掩蔽阈值 | 掩蔽声频率/声压级 → 掩蔽阈值曲线关键点 |
| `loudness-zwicker` | Zwicker 响度 | 倍频带声压级 → 响度 sone 近似 |

### B4 · 噪声与法规（6）— `calc-b4.js`
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `lwp` | 声功率 Lw→声压 Lp | Lw、指向性 Q、距离 r、空间类型 → Lp=Lw−10log10(…) |
| `facade` | 建筑立面/窗外衰减 | 距外墙距离、楼层高度 → ΔL 近似 |
| `fan-noise` | 风机噪声频谱 | 流量 Q、全压 Δp、转速 n → 倍频带声功率级估算（经验式） |
| `valve-noise` | 阀门噪声 IEC 60534 | 压差 Δp、孔径 d、下游密度 ρ → 声压级与修正 |
| `jet-noise` | 喷流/排气噪声 | 喷口速度 U、直径 D → 总声功率级与指向性指数 |
| `railway` | 铁路噪声简化 | 列车速度 v、车型/轴重 → 等效连续声级 Leq 近似 |

### B5 · 测量与校准（5）— `calc-b5.js`
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `calib` | 校准器换算 | 标称 94/114 dB、参考频率 → 实际灵敏度修正 |
| `oct-band` | 倍频带中心频率与带宽 | 1/1 / 1/3 → 各中心频率、带宽 |
| `uncertainty` | 不确定度合成 | 重复性标准差、系统误差限 → 合成标准/扩展不确定度 (k=2) |
| `mic-response` | 传声器入射角修正 | 入射角 θ、频率 f → 自由场/压力响应修正 dB |
| `time-weight` | F/S/I 时间计权差 | 脉冲/稳态信号长度 → 不同计权读数差估算 |

### B6 · 超声/结构/声速（5）— `calc-b6.js`
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `wavespeed-solid` | 固体纵/横波声速 | E、G、ρ、ν → cL=√((E(1−ν))/ρ(1+ν)(1−2ν))、cS=√(G/ρ) |
| `snell` | 斯涅尔/临界角 | 两介质声速 c1、c2、入射角 θ1 → θ2、临界角 θc |
| `attenuation` | 材料衰减系数 | 频率 f、材料衰减常数 → α dB/(cm 或 m) |
| `lamb` | 兰姆波/板波相速度 | 板厚 h、频率 f、cL、cS → 模式相速度（瑞利/对称/反对称） |
| `longi-trans` | 纵波透射/反射系数 | 两介质特性阻抗 Z1、Z2 → R=(Z2−Z1)/(Z2+Z1)、T=2Z2/(Z2+Z1) |

### B7 · 经典与教学（4）— `calc-b7.js` ✅ 已完整实现（示范）
mach / standing-open-closed / p-u-intensity / decibel-conv（见文件与 `tests/calc-b7.test.js`）

### B8 · 振动与结构（4）— `calc-b8.js`
| route | 名称 | 关键公式要点 |
|-------|------|--------------|
| `transmissibility` | 单自由度隔振传递率 | 频率比 r=f/fn、阻尼比 ζ → T=√(1+(2ζr)²)/√((1−r²)²+(2ζr)²)、隔振效率 |
| `natural-freq` | 梁/板/弹簧固有频率 | 质量 m、刚度 k（或几何参数）→ fn=(1/2π)√(k/m) 及梁/板模态 |
| `wave-vib` | 结构弯曲波速 | 材料参数、频率、板厚 → 弯曲波相速度 cf=√(2πf/D/ρh)（D 弯曲刚度） |
| `isolator-pick` | 隔振器选型 | 设备重量 W、干扰频率 f、目标隔离 → 所需静变形/刚度 |

**合计：6+6+5+6+5+5+4+4(B7)=41 个；61 + 41 = 102 ≥ 100。**

---

## 5. 并行协作流程（给分派 AI 的说明）
1. 每个协作 AI 仅负责 **一个** `calc-bN.js` 与其 `tests/calc-bN.test.js`，互不依赖、文件独立 → **无合并冲突**。
2. 严格照 `calc-b7.js` 写法与第 2、3 节契约实现；`compute` 必须纯函数。
3. **不要改动** `index.html` 导航、`router.js`、`calc-core.js`、`calc-view.js`（引擎自动注入导航/首页卡片与路由）。
4. 完成后在本地跑：
   - `node tests/calc-bN.test.js`
   - `node tests/calc-registry.test.js`
   - `node tests/structure.test.js`
   全绿再交付。
5. 每新增一个 `.test.js`，把 `index.html`/`README.md` 的「共 N 个测试文件全部通过」+1（最终由汇总步骤统一收口）。

---

## 6. 汇总步骤（由主 AI 执行）
1. 收回 8 个块文件与对应测试，确认 `node tests/run-all.js` 全绿（目标：测试文件约 61→67，断言 0 失败）。
2. `calc-registry.test.js` 应显示已登记 **41** 个工具、route 唯一。
3. 更新 `index.html` 首页 hint「共 8 个分组、N 个模块」与 README/说明中的模块总数（静态卡片 61 + 声明式 41 = 102）。
4. `structure.test.js` 的「总览 hint 模块数 = 卡片数」仅校验静态卡片（运行时引擎会把真实总数写入 hint），无需硬性匹配 102。
5. （可选）扩展 `all-tools.js` 让「全部工具」页也读 `CalcRegistry` 列出声明式工具。
6. 提交并推送（SSH）。

---

## 7. 进度
- ✅ 地基：calc-core.js / calc-view.js / router 合并 / index.html 脚本接入
- ✅ 示范块 B7（4 个工具 + 测试）
- ✅ 契约门禁 calc-registry.test.js
- ⬜ B1 / B2 / B3 / B4 / B5 / B6 / B8（空壳待协作 AI 填充）
- ✅ 全量测试现状：61 文件 / 4179 断言 / 0 失败（新增地基后）
