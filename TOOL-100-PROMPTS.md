# 声学工具凑百 · 协作 AI 提示命令（3 份，可直接发送）

> 背景：仓库 `acoustic-calc` 已搭好「声明式计算器引擎」，新增一个声学工具 = 在 `public/js/calc-bN.js` 里调用一次 `CalcRegistry.register(...)`，由引擎 `calc-view.js` 自动渲染 UI 与导航。**B7（示范块）与第1组 B1+B2 已由主 AI 完成**，你只需实现自己那一组。
>
> 通用必读（每个提示都适用）：本仓库根目录有 `TOOL-100-PLAN.md`（架构/契约/公式清单）与 `public/js/calc-b7.js`（示范块写法）和 `public/js/calc-b1.js`、`public/js/calc-b2.js`（已完成的真实样例）。**严格照契约与样例实现**，不要改引擎/路由/导航。

---

## 提示 A（给 AI-A）— 第2组：B3 心理与音乐声学 + B4 噪声与法规

```
请在仓库 acoustic-calc 中帮我实现两个声明式计算器块，对应「第2组」：

1) 打开 public/js/calc-b3.js（当前空壳，顶部注释已列清单），实现 5 个工具，nav.group 统一写 "心理与音乐声学"：
   - cents        音分↔频率：半音/音分数 → 频率比 2^(n/1200)；根音频率 → 目标频率
   - bark-erb     临界带 Bark/ERB：频率 f → 临界带号 z(Bark)、ERB(f)=24.7·(4.37f/1000+1) Hz
   - chord        和弦/音程频率：根音频率、音程（纯八度/纯五度/大三度/小三度/纯四度…）→ 各音频率（用频率比）
   - masking      临界带掩蔽阈值：掩蔽声频率/声压级 → 给出掩蔽阈值近似（可用简单临界带掩蔽模型，注明近似）
   - loudness-zwicker  Zwicker 响度：输入若干倍频带声压级（或总体） → 响度 sone 近似（可用简化 ISO 532B 思路，注明近似）

2) 打开 public/js/calc-b4.js（空壳），实现 6 个工具，nav.group 统一写 "噪声与法规"：
   - lwp          声功率 Lw→声压 Lp：Lw、Q、距离 r、空间类型 → Lp=Lw−10log10(...)
   - facade       建筑立面/窗外衰减：距外墙距离、楼层高度 → ΔL 近似
   - fan-noise    风机噪声频谱：流量 Q、全压 Δp、转速 n → 倍频带声功率级估算（经验式，注明来源/近似）
   - valve-noise   阀门噪声 IEC 60534：压差 Δp、孔径 d、下游密度 ρ → 声压级与修正（按 IEC 60534-8-4 简化）
   - jet-noise     喷流/排气噪声：喷口速度 U、直径 D → 总声功率级与指向性指数
   - railway       铁路噪声简化：列车速度 v、车型/轴重 → 等效连续声级 Leq 近似

硬性要求（必看 TOOL-100-PLAN.md 第2、3节契约）：
- compute(state) 必须是纯函数（不碰 DOM/window/随机），返回 { ok, values, formula, notes }；formula 可含 <span class="fx">高亮</span>。
- 除 calc-core.js 外，任何文件不得新建 esc 或 $（getElementById）副本；不得 require 本地模块。
- route-id 全局唯一（参考已有：mach/standing-open-closed/p-u-intensity/decibel-conv/mpp/coincidence/sabine-alpha/cavity-abs/wall-tl/floor-float/directivity/nearfar/roomgain/spl-vs-dist/damping-factor/delay-align，勿冲突）。
- 照 public/js/calc-b7.js 与 calc-b1.js / calc-b2.js 的写法（含 select 输入类型用法）。
- 每个块在 tests/ 下新建 calc-b3.test.js、calc-b4.test.js（纯函数断言，照 tests/calc-b1.test.js 风格）。
- 不要改 index.html 导航、router.js、calc-core.js、calc-view.js（引擎按 nav.group 自动注入导航与首页卡片）。
- 完成后运行：node tests/calc-b3.test.js、node tests/calc-b4.test.js、node tests/calc-registry.test.js、node tests/structure.test.js、node tests/run-all.js 全绿。
- 每新增一个 .test.js 文件，把 index.html 与 README.md 里「共 N 个测试文件全部通过」的数字 +1（你新增 2 个文件则 +2；若之前是 63 → 改 65），并把 tests/material-store.test.js 里「同步为 NN」的数字同步改一致。
- 完成后只报告：实现清单、测试结果（文件数/断言/0失败）、是否改动了计数文案。不要提交（git commit）也不要推送——由主 AI 汇总。
```

---

## 提示 B（给 AI-B）— 第3组：B5 测量与校准 + B6 超声/结构/声速

```
请在仓库 acoustic-calc 中帮我实现两个声明式计算器块，对应「第3组」：

1) 打开 public/js/calc-b5.js（空壳），实现 5 个工具，nav.group 统一写 "测量与校准"：
   - calib        校准器换算：标称 94/114 dB、参考频率 → 实际声压/声压级换算（或传声器灵敏度换算）
   - oct-band     倍频带/1/3 倍频带中心频率与带宽：选择 1/1 或 1/3 → 列出中心频率、带宽（标准序列）
   - uncertainty  不确定度合成：重复性标准差、系统误差限(B类) → 合成标准不确定度、扩展不确定度(k=2)
   - mic-response 传声器入射角修正：入射角 θ、频率 f → 自由场/压力响应修正 dB（用常见压力场传声器近似）
   - time-weight  F/S/I 时间计权差：脉冲/稳态信号长度 → 不同计权(F快/S慢/I脉冲)读数差估算（注明近似）

2) 打开 public/js/calc-b6.js（空壳），实现 5 个工具，nav.group 统一写 "超声·结构·声速"：
   - wavespeed-solid  固体纵/横波声速：E、G(或ν)、ρ → cL=√((E(1−ν))/ρ(1+ν)(1−2ν))、cS=√(G/ρ)
   - snell         斯涅尔/临界角：两介质声速 c1、c2、入射角 θ1 → θ2、临界角 θc（注意 c1<c2 才有临界角）
   - attenuation    材料衰减系数：频率 f、材料衰减常数(或衰减系数 α0) → 总衰减 dB/cm 或 dB/m
   - lamb          兰姆波/板波相速度：板厚 h、频率 f、cL、cS → 给出某一模式（如 A0/S0 或瑞利）相速度近似，注明近似
   - longi-trans    纵波透射/反射系数：两介质特性阻抗 Z1、Z2 → R=(Z2−Z1)/(Z2+Z1)、T=2Z2/(Z2+Z1)

硬性要求（必看 TOOL-100-PLAN.md 第2、3节契约）：
- compute(state) 必须是纯函数（不碰 DOM），返回 { ok, values, formula, notes }；formula 可用 <span class="fx">高亮</span>。
- 除 calc-core.js 外不得新建 esc/$ 副本；不得 require 本地模块。
- route-id 全局唯一（已有 route 列表见提示A；勿用 mpp/coincidence/sabine-alpha/cavity-abs/wall-tl/floor-float/directivity/nearfar/roomgain/spl-vs-dist/damping-factor/delay-align 等）。
- 照 public/js/calc-b7.js、calc-b1.js、calc-b2.js 的写法（含 select 用法）。
- 在 tests/ 下新建 calc-b5.test.js、calc-b6.test.js（纯函数断言，照 tests/calc-b1.test.js）。
- 不要改 index.html 导航、router.js、calc-core.js、calc-view.js。
- 完成后运行 node tests/calc-b5.test.js、calc-b6.test.js、calc-registry.test.js、structure.test.js、run-all.js 全绿。
- 每新增一个 .test.js，把 index.html / README.md 的「共 N 个测试文件全部通过」+1（你新增 2 个 → 若之前是 63 改 65），并同步 tests/material-store.test.js 的「同步为 NN」数字。
- 只报告实现清单、测试结果、是否改计数文案；不要 git commit/push（主 AI 汇总）。
```

---

## 提示 C（给 AI-C）— 第4组：B8 振动与结构（B7 已完成）

```
请在仓库 acoustic-calc 中帮我实现一个声明式计算器块，对应「第4组」中的 B8（B7 已示范完成，你只做 B8）：

打开 public/js/calc-b8.js（空壳），实现 4 个工具，nav.group 统一写 "振动与结构"：
   - transmissibility   单自由度隔振传递率：频率比 r=f/fn、阻尼比 ζ → T=√((1+(2ζr)²)/((1−r²)²+(2ζr)²))、隔振效率(%)
   - natural-freq       梁/板/弹簧固有频率：质量 m、刚度 k（或几何参数）→ fn=(1/2π)√(k/m)；另给简支梁/板一阶模态近似（注明近似）
   - wave-vib           结构弯曲波速：材料参数(弯曲刚度 D 或 E,ν,ρ,板厚 h)、频率 f → 弯曲波相速度 cf=√(2πf·D/(ρh))（D=Eh³/(12(1−ν²))）
   - isolator-pick      隔振器选型：设备重量 W、干扰频率 f、目标隔振量 → 所需静变形/刚度（反推 fn≤f/√2 类约束）

硬性要求（必看 TOOL-100-PLAN.md 第2、3节契约）：
- compute(state) 必须是纯函数（不碰 DOM），返回 { ok, values, formula, notes }；formula 可用 <span class="fx">高亮</span>。
- 除 calc-core.js 外不得新建 esc/$ 副本；不得 require 本地模块。
- route-id 全局唯一（已有 route 见提示A；勿冲突；B8 仅 transmissibility/natural-freq/wave-vib/isolator-pick）。
- 照 public/js/calc-b7.js、calc-b1.js、calc-b2.js 写法（含 select 用法）。
- 在 tests/ 下新建 calc-b8.test.js（纯函数断言，照 tests/calc-b1.test.js）。
- 不要改 index.html 导航、router.js、calc-core.js、calc-view.js。
- 完成后运行 node tests/calc-b8.test.js、calc-registry.test.js、structure.test.js、run-all.js 全绿。
- 每新增一个 .test.js，把 index.html / README.md 的「共 N 个测试文件全部通过」+1（你新增 1 个 → 若之前是 63 改 64），并同步 tests/material-store.test.js 的「同步为 NN」数字。
- 只报告实现清单、测试结果、是否改计数文案；不要 git commit/push（主 AI 汇总）。
```

---

## 汇总说明（给主 AI / 用户）
三份提示各自独立、文件互不重叠（B3/B4、B5/B6、B8），无合并冲突。每份都要求协作 AI：
1. 只改自己的 `calc-bN.js` + 新增 `tests/calc-bN.test.js`，不改引擎/路由/导航；
2. 同步测试文件计数文案（index.html / README.md / material-store.test.js）；
3. 跑绿 `node tests/run-all.js` 后只回报，不提交不推送。
收回后由主 AI 统一收口：跑全量 → 校验 `calc-registry.test.js` 显示 41 条已登记 → 更新首页/README 模块总数（静态 61 + 声明式 41 = 102）→ 提交并 SSH 推送。
