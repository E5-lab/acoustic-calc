# 集成补丁：声学模拟器章节再增 4 个动态模拟器（v2.6.9）

> **背景**：前 14 个模拟器已全部分批接入（`9224e78` 前 10 个 + `caef6ff` 后 4 个）。本文件是**增量补丁**，只注册新增的 **4 个**模拟器；当前站点状态 `a40f16b`（v2.6.8，**49 模块 / 7 分组**）。
>
> 新增文件（已在本提交入库，**均为新增，未改动任何共享文件**）：
> - 内核：`public/js/sim-sonar.js` `sim-sea.js` `sim-fourier.js` `sim-ut.js`
> - 视图：`public/js/view-sim-sonar.js` `view-sim-sea.js` `view-sim-fourier.js` `view-sim-ut.js`
> - 测试：`tests/sim-sonar.test.js` `sim-sea.test.js` `sim-fourier.test.js` `sim-ut.test.js`
>   （109 + 103 + 148 + 141 = **501 项断言**，`node tests/*.test.js` 全部通过）
>
> 每个模拟器均为「UMD 计算内核 + 自包含 Canvas 动画视图」，视图 `init()` 自行注入全部 DOM 到空容器 `#view-sim-*`，与既有模块零代码耦合。
>
> **以下 5 处共享文件改动需由集成者应用。** 路由名沿用 `sim-*` 前缀。
>
> ⚠️ 锚点已对照 `HEAD @ a40f16b` 逐行校准（router 三表末项均为 `sim-radiation`、nav.js 末项 `sim-radiation`、index.html 计数 49）。应用前请以**当前文件实际内容**为准重新核对锚点字符串。

---

## 4 个新模拟器一览

| 路由 | 名称 | 动态效果 | 关键公式 |
|---|---|---|---|
| `sim-sonar` | 声呐方程与水声探测 | 海面/海底场景中球面波前推出→目标回波返回；信号级曲线与噪声底线求交 | α(f)=0.11f²/(1+f²)+44f²/(4100+f²)+2.75e-4f²+0.003 dB/km（Thorp）；TL=20lg r+αr/1000；主动 SL−2TL+TS−(NL−DI)≥DT、被动 SL−TL−(NL−DI)≥DT |
| `sim-sea` | 统计能量分析 SEA | 两房间能量密度粒子 + 隔墙净功率流箭头动画 + 能级柱状图 | ηᵢ=2.2/(f·T60ᵢ)；η₁₂=τcS/(4ωV₁)；互易 η₁₂N₁=η₂₁N₂；功率平衡解 E₁,E₂；D=10lg[(E₁/V₁)/(E₂/V₂)] |
| `sim-fourier` | 傅里叶合成与频谱泄漏 | 谐波逐次加入逼近方波/锯齿/三角（Gibbs 过冲标注）+ 加窗 dB 谱对比 | 方波 (4/π)Σsin/k、锯齿 (2/π)Σ(−1)^{k+1}sin/k、三角 (8/π²)Σ(−1)^{(k−1)/2}sin/k²；窗 rect/Hann/Hamming/Blackman；DFT 直接实现 |
| `sim-ut` | 超声脉冲回波测厚探伤 | A 扫描扫描线激发三回波（始波/缺陷波/底波）+ 工件剖面声束传播动画 | d=c·t/2；λ=c/f；近场 N=D²/(4λ)；θ=arcsin(1.22λ/D)；回波 dB=−2αd−20lg(2d/mm)；−6 dB 包络 exp(−4ln2(x/w)²) |

---

## ① `public/js/router.js` —— 三张表各在 `sim-radiation` 之后追加 4 行

### 1a) `VIEWS`（现末项在第 82 行）

```diff
-    'sim-radiation': 'view-sim-radiation'
+    'sim-radiation': 'view-sim-radiation',
+    'sim-sonar': 'view-sim-sonar',
+    'sim-sea': 'view-sim-sea',
+    'sim-fourier': 'view-sim-fourier',
+    'sim-ut': 'view-sim-ut'
   };
```

### 1b) `TITLES`（现末项在第 135 行）

```diff
-    'sim-radiation': '声源辐射指向性模拟器 · 声学计算工具箱'
+    'sim-radiation': '声源辐射指向性模拟器 · 声学计算工具箱',
+    'sim-sonar': '声呐方程模拟器 · 声学计算工具箱',
+    'sim-sea': '统计能量分析模拟器 · 声学计算工具箱',
+    'sim-fourier': '傅里叶合成与频谱泄漏模拟器 · 声学计算工具箱',
+    'sim-ut': '超声脉冲回波测厚模拟器 · 声学计算工具箱'
   };
```

### 1c) `MOUNTS`（现末项在第 188 行）

```diff
-    { route: 'sim-radiation', get: function () { return window.SimRadiationView; } }
+    { route: 'sim-radiation', get: function () { return window.SimRadiationView; } },
+    { route: 'sim-sonar', get: function () { return window.SimSonarView; } },
+    { route: 'sim-sea', get: function () { return window.SimSeaView; } },
+    { route: 'sim-fourier', get: function () { return window.SimFourierView; } },
+    { route: 'sim-ut', get: function () { return window.SimUtView; } }
   ];
```

> 连字符/下划线键可不加引号，但为与既有风格一致建议保持裸键。`parse()` 经 `hasOwnProperty` 精确匹配，无需其他改动。

---

## ② `public/js/nav.js` —— `NAV_SUB` 在 `'sim-radiation'` 行之后追加 4 行（现第 80 行）

```diff
-    'sim-radiation': ['极坐标指向图', '探测波形', '指向性指数']
+    'sim-radiation': ['极坐标指向图', '探测波形', '指向性指数'],
+    'sim-sonar': ['水声场景', '信号/噪声曲线', '作用距离'],
+    'sim-sea': ['能量密度场', '功率流', '声级差 D'],
+    'sim-fourier': ['谐波叠加', 'Gibbs 过冲', '加窗频谱'],
+    'sim-ut': ['A 扫描波形', '声束剖面', '缺陷定位']
   };
```

---

## ③ `public/index.html` —— 五处

### 3a) 顶栏导航 —— 「声学模拟器」分组内，`#/sim-radiation` 链接之后追加 4 个链接（现第 138 行）

```diff
           <a href="#/sim-radiation" data-route="sim-radiation"><span class="nm-t">声源辐射指向性</span><small class="nm-d">单极子/偶极子/四极子 · DI</small></a>
+          <a href="#/sim-sonar" data-route="sim-sonar"><span class="nm-t">声呐方程</span><small class="nm-d">传播损失 · 作用距离 · 余量</small></a>
+          <a href="#/sim-sea" data-route="sim-sea"><span class="nm-t">统计能量分析</span><small class="nm-d">耦合损耗 · 功率流 · 声级差</small></a>
+          <a href="#/sim-fourier" data-route="sim-fourier"><span class="nm-t">傅里叶与频谱泄漏</span><small class="nm-d">谐波合成 · Gibbs · 窗函数</small></a>
+          <a href="#/sim-ut" data-route="sim-ut"><span class="nm-t">超声脉冲回波</span><small class="nm-d">A 扫描 · 测厚 · 缺陷定位</small></a>
         </div>
```

### 3b) 视图容器 —— `#view-sim-radiation` 之后、`</main>` 之前追加 4 个空 section（现第 4629 行）

```diff
   <section class="view" id="view-sim-radiation" data-view="sim-radiation" hidden></section>
+  <section class="view" id="view-sim-sonar" data-view="sim-sonar" hidden></section>
+  <section class="view" id="view-sim-sea" data-view="sim-sea" hidden></section>
+  <section class="view" id="view-sim-fourier" data-view="sim-fourier" hidden></section>
+  <section class="view" id="view-sim-ut" data-view="sim-ut" hidden></section>
 </main>
```

### 3c) 脚本标签 —— `js/view-sim-radiation.js` 之后、`js/banner.js` 之前追加 8 个（4 内核 + 4 视图，交替）

```diff
 <script src="js/view-sim-radiation.js"></script>
+<script src="js/sim-sonar.js"></script>
+<script src="js/view-sim-sonar.js"></script>
+<script src="js/sim-sea.js"></script>
+<script src="js/view-sim-sea.js"></script>
+<script src="js/sim-fourier.js"></script>
+<script src="js/view-sim-fourier.js"></script>
+<script src="js/sim-ut.js"></script>
+<script src="js/view-sim-ut.js"></script>
 <script src="js/banner.js"></script>
```

### 3d) 首页总览 —— 「声学模拟器」分组卡片区内，`#/sim-radiation` 卡片之后追加 4 张卡片（现第 887–899 行）

```diff
             <span class="mc-desc">单极子全指向、偶极子 8 字形、四极子四叶草的极坐标指向图与受指向性调制的径向扩散动画，附探测点时域波形与指向性指数 DI。</span>
           </span>
         </a>
+        <a class="module-card" href="#/sim-sonar">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <path d="M4 12h40" opacity="0.5" />
+              <path d="M24 12v6" stroke-linecap="round" />
+              <circle cx="24" cy="22" r="3" fill="currentColor" stroke="none" />
+              <path d="M17 32a9 9 0 0114 0M12 38a16 16 0 0124 0" opacity="0.55" />
+              <path d="M34 30c3 2 5 5 5 8" stroke-dasharray="2 3" opacity="0.6" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">声呐方程 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">主动 / 被动声呐方程求解最大作用距离：Thorp 海水吸收 α(f)、传播损失 TL = 20lg r + αr，信号级曲线与噪声底线交点即 r_max。</span>
+          </span>
+        </a>
+        <a class="module-card" href="#/sim-sea">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <rect x="4" y="12" width="18" height="24" rx="1" />
+              <rect x="26" y="12" width="18" height="24" rx="1" />
+              <path d="M22 12v24" opacity="0.7" />
+              <path d="M26 24h-8M18 20l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">统计能量分析 SEA <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">两个耦合房间的 SEA 功率流：内损耗因子 η=2.2/(f·T60)、耦合损耗因子 η₁₂=τcS/(4ωV₁)，解功率平衡方程得能级与声级差 D。</span>
+          </span>
+        </a>
+        <a class="module-card" href="#/sim-fourier">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <path d="M4 32h10v-16h10v16h10v-16h10" stroke-linejoin="round" />
+              <path d="M24 8v32" stroke-dasharray="2 3" opacity="0.4" />
+              <path d="M8 40v-8M16 40v-12M28 40v-14M36 40v-10" opacity="0.55" stroke-linecap="round" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">傅里叶与频谱泄漏 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">谐波逐次叠加逼近方波 / 锯齿 / 三角波的动画（含 Gibbs 过冲读值），对比矩形 / Hann / Hamming / Blackman 窗的泄漏与主瓣宽度。</span>
+          </span>
+        </a>
+        <a class="module-card" href="#/sim-ut">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <rect x="8" y="26" width="32" height="14" rx="1" />
+              <rect x="10" y="14" width="14" height="8" rx="1" opacity="0.8" />
+              <path d="M17 22v4" stroke-linecap="round" />
+              <path d="M14 34v-6M20 34v-10M26 34v-4M32 34v-8" stroke-linecap="round" />
+              <rect x="24" y="31" width="4" height="4" opacity="0.7" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">超声脉冲回波测厚 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">A 扫描动画演示始波 / 缺陷波 / 底波：d = c·t/2 测厚、近场长度 N = D²/(4λ)、半扩散角 arcsin(1.22λ/D)、材料衰减与 −6 dB 缺陷当量。</span>
+          </span>
+        </a>
       </div>
```

### 3e) 计数文案 + 使用说明地址清单

```diff
-      <p class="hint">共 7 个分组、49 个模块，与顶栏二级菜单一一对应</p>
+      <p class="hint">共 7 个分组、53 个模块，与顶栏二级菜单一一对应</p>
```

```diff
-<code>#/sim-radiation</code> 辐射指向性。</li>
+<code>#/sim-radiation</code> 辐射指向性、<code>#/sim-sonar</code> 声呐方程、<code>#/sim-sea</code> 统计能量分析、<code>#/sim-fourier</code> 傅里叶合成、<code>#/sim-ut</code> 超声测厚。</li>
```

> `tests/overview.test.js` 会校验：路由 ↔ 顶栏导航 ↔ 首页卡片 ↔ 地址清单四处一致，且计数文案与实际相符（53）。`tests/home-ui.test.js` 的「总览卡片数 = 49」断言需同步改为 **53**。漏任一处测试即失败。

---

## ④ `tests/home-ui.test.js` —— 一处（现第 107 行）

```diff
-assert('总览卡片数 = 49 (实际 ' + cards.length + ')', cards.length === 49);
+assert('总览卡片数 = 53 (实际 ' + cards.length + ')', cards.length === 53);
```

---

## ⑤ `README.md` —— 四处小改

```diff
-### ㉜ 声学模拟器（`#/sim-*` · 十四个动态演示）
+### ㉜ 声学模拟器（`#/sim-*` · 十八个动态演示）
```

在第 365 行「`#/sim-radiation` 声源辐射指向性」那条 bullet 之后追加 4 条：

```diff
+- **`#/sim-sonar` 声呐方程**：主动 / 被动声呐方程求解最大作用距离；海水吸收用 Thorp 经验式 α(f)（f 单位 kHz、dB/km），传播损失 TL = 20lg r + αr/1000；主动 SL−2TL+TS−(NL−DI) ≥ DT、被动 SL−TL−(NL−DI) ≥ DT，二分法解 r_max 并给信号级/噪声级随距离曲线（未建模混响限制）。
+- **`#/sim-sea` 统计能量分析（SEA）**：两个房间经隔墙耦合的稳态功率流——内损耗因子 ηᵢ = 2.2/(f·T60ᵢ)、耦合损耗因子 η₁₂ = τcS/(4ωV₁)（Craik）、互易 η₁₂N₁ = η₂₁N₂，解功率平衡方程组得 E₁/E₂ 与声级差 D = 10lg[(E₁/V₁)/(E₂/V₂)]；模态数 N < 3 时给出「SEA 不适用」告警。
+- **`#/sim-fourier` 傅里叶合成与频谱泄漏**：方波/锯齿/三角波的谐波逐次叠加动画（方波过冲自 4/π 单调下降趋近 Gibbs 极限 1.17898）；矩形 / Hann / Hamming / Blackman 四种窗的 DFT 谱对比，给出主瓣宽度（2/4/4/6 bin）与最高旁瓣电平，含混叠频率与折叠提示。
+- **`#/sim-ut` 超声脉冲回波测厚与探伤**：A 扫描（始波 / 缺陷波 / 底波高斯包络脉冲）与工件剖面声束传播动画；d = c·t/2、λ = c/f、近场长度 N = D²/(4λ)、半扩散角 arcsin(1.22λ/D)、回波幅度 −2αd − 20lg(2d/mm)、−6 dB 法缺陷当量尺寸；8 种材料声速表。
```

内核清单行追加 4 个文件名（第 423 行附近）：

```diff
-…`sim-refraction.js` `sim-radiation.js` — 声学模拟器内核
+…`sim-refraction.js` `sim-radiation.js` `sim-sonar.js` `sim-sea.js` `sim-fourier.js` `sim-ut.js` — 声学模拟器内核
```

测试计数行（现为 42 / 2534）：

```diff
-- `node tests/*.test.js` 共 42 个测试文件、**2534 项断言全部通过**
+- `node tests/*.test.js` 共 46 个测试文件、**3345 项断言全部通过**
```

> ⚠️ 计数口径：3345 是「逐文件 `node tests/*.test.js` 后累加各自打印的通过数」得到的实测值（46 文件 = 既有 42 + 新增 4；3345 = 2844 + 501）。若集成者的统计脚本口径与此不同，请以实际统计值为准，README 与 index.html「使用说明」里的两处数字保持一致即可。

更新记录置顶新增一条（置于 v2.6.8 条目之上）：

```diff
 ## 更新记录
 
+- v2.6.9：**「声学模拟器」分组再增 4 个动态演示（工具 49 → 53 个）**——声呐方程（Thorp 吸收 + 主/被动方程解作用距离）、统计能量分析 SEA（η₁₂=τcS/(4ωV₁)、互易与功率平衡解声级差 D）、傅里叶合成与频谱泄漏（谐波叠加 Gibbs 过冲 + 四种窗函数泄漏对比）、超声脉冲回波测厚探伤（A 扫描三回波 + 近场/扩散角/−6 dB 当量）。各为 UMD 内核 + 自包含 Canvas 动画视图，配套 4 个测试文件 / 501 项断言（全套单测扩至 **46 个文件、3345 项断言全部通过**）。五处登记同步（router 三表、nav.js、index.html 五处、home-ui 卡片数 49 → 53、README），现校验 **53 模块 / 7 分组**。
 - v2.6.8：**新增「㉟ 公式与术语手册」+ 平台级深链分享（`#/handbook`，工具 48 → 49 个）**——……
```

---

## 集成后自检清单

1. `#/sim-sonar` 默认（典型舰壳声呐 f=5 kHz）应给出有限 r_max；切「低频远程 f=1 kHz」r_max 应显著变大，切「被动听测」应最远（>100 km）。把噪声级调高 10 dB，r_max 应明显变小。
2. `#/sim-sea` 默认（R=35 dB、两室 100 m³、T60=0.6 s、f=1 kHz）声级差 **D ≈ 39.3 dB**；隔声量改 55 dB，D 应增大；接收室 T60 加倍，D 应减小（源室 T60 加倍时 D 不变、只有 E₁ 升高——SEA 的经典结论）。
3. `#/sim-fourier` 谐波数从 1 递增时应看到波形逐步逼近方波、过冲从 4/π≈1.273 单调降到 ≈1.179；把分析单频设在两 bin 中间、窗函数切到 Hann，最高旁瓣应比矩形低 10 dB 以上。
4. `#/sim-ut` 默认（钢 5 MHz / D=10 mm / 50 mm）底波在 **16.89 µs**、幅度 **−41 dB**，近场 21.1 mm、轴向分辨率 1.184 mm；选中部缺陷 20 mm 后缺陷波应在 **6.76 µs** 出现且早于底波。
5. `node tests/overview.test.js` 与 `node tests/home-ui.test.js` 应通过（校验 53 模块四处一致；home-ui 卡片数断言需先从 49 改为 53）。
6. 窄屏下顶栏自动把「声学模拟器」收进「更多」——nav.js 既有行为，正常。

---

## 备注与假设

- **声呐**：噪声限制模型，未建模混响（体积/界面混响）限制；Thorp 经验式适用于 0.1–100 kHz 量级；自由场、单目标、各向同性假设。
- **SEA**：仅两子系统稳态模型，适用前提是模态数 N ≫ 1 与弱耦合（已给告警）；耦合损耗因子按互易性 η₁₂N₁ = η₂₁N₂ 构造（Craik 直接式 `eta21Craik` 一并返回供对照，几何相似时两者相等）；未含非共振传输与直接场。
- **傅里叶**：DFT 为直接 O(M²) 实现（非 FFT），幅度按相干增益校正；主瓣宽度按窗的 DTFT 第一零点在细网格上实测（对称窗零点不落在整数 bin 上）；Gibbs 过冲是「自 4/π 单调下降趋近 1.17898」，不是单调上升。
- **超声**：简化衰减模型（材料衰减 + 球面扩展），未含界面透射损失、波形转换、DAC/TCG 标定与仪器噪声门；−6 dB 法用高斯型横移包络近似。
- 所有模块仅供工程估算与教学演示，正式检测/设计请以标准方法与实测为准。
