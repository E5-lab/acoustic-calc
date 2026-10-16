# 集成补丁：声学模拟器章节再增 4 个动态模拟器（v2.6.6）

> **背景**：前 10 个模拟器已由集成者按 `INTEGRATE-sim2.md` 合入（commit `9224e78`，v2.6.4）；其后又有 `8ec876b`（leakage，v2.6.5，工具数现为 **43**）。本文件是**增量补丁**，只注册新增的 **4 个**模拟器，前 10 个与 leakage 的登记**不要重复添加**。
>
> 新增文件（已在本提交入库，**均为新增，未改动任何共享文件**）：
> - 内核：`public/js/sim-interference.js` `sim-bubble.js` `sim-refraction.js` `sim-radiation.js`
> - 视图：`public/js/view-sim-interference.js` `view-sim-bubble.js` `view-sim-refraction.js` `view-sim-radiation.js`
> - 测试：`tests/sim-interference.test.js` `sim-bubble.test.js` `sim-refraction.test.js` `sim-radiation.test.js`（共 **111 项断言**，`node tests/*.test.js` 全部通过）
>
> 每个模拟器均为「UMD 计算内核 + 自包含 Canvas 动画视图」，视图 `init()` 自行注入全部 DOM 到空容器 `#view-sim-*`，与既有模块零代码耦合。
>
> **以下 6 处共享文件改动需由集成者应用。** 路由名沿用 `sim-*` 前缀。
>
> ⚠️ 锚点已对照 `HEAD @ 7f3e9a8`（含集成提交 `9224e78` 与 leakage `8ec876b`）逐行校准。应用前请以**当前文件实际内容**为准重新核对锚点字符串。

---

## 4 个新模拟器一览

| 路由 | 名称 | 动态效果 | 关键公式 |
|---|---|---|---|
| `sim-interference` | 双源声波干涉 | 两源扩散圆波前叠加 + A(θ) 极坐标指向图 + 探测角读数 | A(θ)=\|cos(πd·sinθ/λ)\|；相长 Δr=mλ / 相消 Δr=(m+½)λ |
| `sim-bubble` | 水下气泡共鸣（Minnaert） | 气泡半径脉动 + 辐射圆环 + 对数扫频响应曲线 | f₀=(1/2πr)·√(3γP₀/ρ)，f₀∝1/r；H(f)=1/√(1+[2Q(f−f₀)/f₀]²) |
| `sim-refraction` | 温度梯度声折射 | 声线束弯曲/折返 + 沿声线运动的波前 + 声影区标注 | c(z)=c₀+g·z；cosθ/c=常数；z_tp=c₀(secθ₀−1)/g |
| `sim-radiation` | 声源辐射指向性 | 极坐标指向图 + 受指向性调制的径向扩散 + 探测点时域波形 | D=1/\|cosθ\|/\|cos2θ\|；DI=10·lg(4π/∮D²dΩ)=0/4.77/3.31 dB |

---

## ① `public/js/router.js` —— 三张表各在 `sim-echo` 之后追加 4 行

### 1a) `VIEWS`

```diff
     'sim-tube': 'view-sim-tube',
-    'sim-echo': 'view-sim-echo'
+    'sim-echo': 'view-sim-echo',
+    'sim-interference': 'view-sim-interference',
+    'sim-bubble': 'view-sim-bubble',
+    'sim-refraction': 'view-sim-refraction',
+    'sim-radiation': 'view-sim-radiation'
   };
```

### 1b) `TITLES`

```diff
     'sim-tube': '声阻抗管模拟器 · 声学计算工具箱',
-    'sim-echo': '回声测距模拟器 · 声学计算工具箱'
+    'sim-echo': '回声测距模拟器 · 声学计算工具箱',
+    'sim-interference': '双源声波干涉模拟器 · 声学计算工具箱',
+    'sim-bubble': '水下气泡共鸣模拟器 · 声学计算工具箱',
+    'sim-refraction': '温度梯度声折射模拟器 · 声学计算工具箱',
+    'sim-radiation': '声源辐射指向性模拟器 · 声学计算工具箱'
   };
```

### 1c) `MOUNTS`

```diff
     { route: 'sim-tube', get: function () { return window.SimTubeView; } },
-    { route: 'sim-echo', get: function () { return window.SimEchoView; } }
+    { route: 'sim-echo', get: function () { return window.SimEchoView; } },
+    { route: 'sim-interference', get: function () { return window.SimInterferenceView; } },
+    { route: 'sim-bubble', get: function () { return window.SimBubbleView; } },
+    { route: 'sim-refraction', get: function () { return window.SimRefractionView; } },
+    { route: 'sim-radiation', get: function () { return window.SimRadiationView; } }
   ];
```

> 连字符键必须加引号（`'sim-bubble'`），`parse()` 经 `hasOwnProperty` 精确匹配，无需其他改动。

---

## ② `public/js/nav.js` —— `NAV_SUB` 在 `'sim-echo'` 行之后追加 4 行

```diff
     'sim-tube': ['管内驻波', '反射系数 R', '吸声系数 α'],
-    'sim-echo': ['脉冲往返', '时延↔距离', '距离分辨率']
+    'sim-echo': ['脉冲往返', '时延↔距离', '距离分辨率'],
+    'sim-interference': ['波前叠加场', 'A(θ) 指向图', '相长/相消角'],
+    'sim-bubble': ['气泡脉动', '扫频响应', '半功率带宽'],
+    'sim-refraction': ['声线束', '折返点高度', '声影区'],
+    'sim-radiation': ['极坐标指向图', '探测波形', '指向性指数']
   };
```

---

## ③ `public/index.html` —— 五处

### 3a) 顶栏导航 —— 「声学模拟器」分组内，`#/sim-echo` 链接之后追加 4 个链接

```diff
           <a href="#/sim-echo" data-route="sim-echo"><span class="nm-t">回声测距</span><small class="nm-d">脉冲往返 · 时延↔距离</small></a>
+          <a href="#/sim-interference" data-route="sim-interference"><span class="nm-t">双源声波干涉</span><small class="nm-d">波程差 · 相长/相消 · 指向图样</small></a>
+          <a href="#/sim-bubble" data-route="sim-bubble"><span class="nm-t">水下气泡共鸣</span><small class="nm-d">Minnaert · 脉动辐射 · 扫频响应</small></a>
+          <a href="#/sim-refraction" data-route="sim-refraction"><span class="nm-t">温度梯度声折射</span><small class="nm-d">声线弯曲 · 折返点 · 声影区</small></a>
+          <a href="#/sim-radiation" data-route="sim-radiation"><span class="nm-t">声源辐射指向性</span><small class="nm-d">单极子/偶极子/四极子 · DI</small></a>
         </div>
       </div>
     </nav>
```

### 3b) 视图容器 —— `#view-sim-echo` 之后、`</main>` 之前追加 4 个空 section

```diff
   <section class="view" id="view-sim-echo" data-view="sim-echo" hidden></section>
+  <section class="view" id="view-sim-interference" data-view="sim-interference" hidden></section>
+  <section class="view" id="view-sim-bubble" data-view="sim-bubble" hidden></section>
+  <section class="view" id="view-sim-refraction" data-view="sim-refraction" hidden></section>
+  <section class="view" id="view-sim-radiation" data-view="sim-radiation" hidden></section>
 </main>
```

### 3c) 脚本标签 —— `js/view-sim-echo.js` 之后追加 8 个（4 内核 + 4 视图，交替）

```diff
 <script src="js/sim-echo.js"></script>
 <script src="js/view-sim-echo.js"></script>
+<script src="js/sim-interference.js"></script>
+<script src="js/view-sim-interference.js"></script>
+<script src="js/sim-bubble.js"></script>
+<script src="js/view-sim-bubble.js"></script>
+<script src="js/sim-refraction.js"></script>
+<script src="js/view-sim-refraction.js"></script>
+<script src="js/sim-radiation.js"></script>
+<script src="js/view-sim-radiation.js"></script>
 <script src="js/banner.js"></script>
```

### 3d) 首页总览 —— 「声学模拟器」分组卡片区内，`#/sim-echo` 卡片之后追加 4 张卡片

```diff
         <a class="module-card" href="#/sim-echo">
           ...（既有回声测距卡片，保持不变）...
         </a>
+        <a class="module-card" href="#/sim-interference">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <circle cx="14" cy="30" r="2.5" fill="currentColor" stroke="none" />
+              <circle cx="34" cy="30" r="2.5" fill="currentColor" stroke="none" />
+              <path d="M9 30a5 5 0 0110 0M29 30a5 5 0 0110 0" opacity="0.55" />
+              <path d="M5 38c5-8 9 5 14-3s9 5 14-3 6 2 10-2" stroke-dasharray="3 3" opacity="0.5" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">双源声波干涉 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">两个同频点源的扩散波前实时叠加：波程差为波长整数倍的方向同相增强、半波长相消，极坐标图给出 A(θ) 指向图样与相长/相消角。</span>
+          </span>
+        </a>
+        <a class="module-card" href="#/sim-bubble">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <circle cx="24" cy="26" r="9" />
+              <path d="M24 11a15 15 0 0115 15M24 41a15 15 0 01-15-15" opacity="0.5" stroke-linecap="round" />
+              <path d="M20 22a5 5 0 013 3" opacity="0.6" stroke-linecap="round" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">水下气泡共鸣 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">Minnaert 共鸣频率 f₀ = (1/2πr)·√(3γP₀/ρ) 的气泡脉动与辐射动画，f₀ ∝ 1/r 实时重算，附对数扫频响应与半功率带宽。</span>
+          </span>
+        </a>
+        <a class="module-card" href="#/sim-refraction">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <path d="M4 40h40" stroke-linecap="round" />
+              <path d="M8 36c6-1 12-8 32-20" stroke-linecap="round" />
+              <path d="M8 36L40 10" stroke-dasharray="2 3" opacity="0.4" />
+              <path d="M38 8v9M34.5 12.5L38 9l3.5 3.5" opacity="0.6" stroke-linecap="round" stroke-linejoin="round" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">温度梯度声折射 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">声速随高度线性变化时声线束的弯曲动画：逆温层中声线折返、温度递减时地面形成声影区，折返点高度 z_tp = c₀(secθ₀−1)/g。</span>
+          </span>
+        </a>
+        <a class="module-card" href="#/sim-radiation">
+          <span class="mc-icon" aria-hidden="true">
+            <svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2">
+              <path d="M24 5v38" stroke-dasharray="2 3" opacity="0.4" />
+              <ellipse cx="24" cy="24" rx="8" ry="17" />
+              <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none" />
+            </svg>
+          </span>
+          <span class="mc-body">
+            <span class="mc-title">声源辐射指向性 <span class="mc-tag live">可用</span></span>
+            <span class="mc-desc">单极子全指向、偶极子 8 字形、四极子四叶草的极坐标指向图与受指向性调制的径向扩散动画，附探测点时域波形与指向性指数 DI。</span>
+          </span>
+        </a>
       </div>
     </div>
```

### 3e) 计数文案 + 使用说明地址清单

```diff
-      <p class="hint">共 7 个分组、43 个模块，与顶栏二级菜单一一对应</p>
+      <p class="hint">共 7 个分组、47 个模块，与顶栏二级菜单一一对应</p>
```

```diff
-<code>#/sim-echo</code> 回声测距。</li>
+<code>#/sim-echo</code> 回声测距、<code>#/sim-interference</code> 双源干涉、<code>#/sim-bubble</code> 水下气泡共鸣、<code>#/sim-refraction</code> 温度梯度折射、<code>#/sim-radiation</code> 辐射指向性。</li>
```

> `tests/overview.test.js` 会校验：路由 ↔ 顶栏导航 ↔ 首页卡片 ↔ 地址清单四处一致，且计数文案与实际相符（47）。`tests/home-ui.test.js` 的「总览卡片数 = 43」断言需同步改为 **47**。漏任一处测试即失败。

---

## ④ `README.md` —— 四处小改

```diff
-### ㉜ 声学模拟器（`#/sim-*` · 十个动态演示）
+### ㉜ 声学模拟器（`#/sim-*` · 十四个动态演示）
```

```diff
 - **`#/sim-echo` 回声测距**：脉冲发射—反射—返回的往返动画，时延 ↔ 距离按 d = c·t/2 换算，可调声速与界面距离。
+- **`#/sim-interference` 双源声波干涉**：两源扩散波前叠加动画，远场归一化振幅 A(θ) = |cos(πd·sinθ/λ)|，相长干涉 Δr = mλ、相消 Δr = (m+½)λ，可调源间距/频率/声速/相位差与探测角。
+- **`#/sim-bubble` 水下气泡共鸣（Minnaert）**：f₀ = (1/2πr)·√(3γP₀/ρ) 的气泡脉动与辐射动画，f₀ ∝ 1/r 实时重算；Lorentz 扫频响应 H(f) = 1/√(1+[2Q(f−f₀)/f₀]²)，半功率带宽 Δf = f₀/Q（忽略表面张力，适用 r ≳ 0.1 mm）。
+- **`#/sim-refraction` 温度梯度声折射**：c(z) = c₀ + g·z 分层介质中的射线追踪动画，Snell 不变量 cosθ/c = 常数；g>0（逆温）声线折返、折返点 z_tp = c₀(secθ₀−1)/g，g<0（正常递减）地面附近形成声影区。
+- **`#/sim-radiation` 声源辐射指向性**：单极子（全指向）/ 偶极子（|cosθ|，8 字形）/ 四极子（|cos2θ|，四叶草）的极坐标指向图与径向扩散动画，指向性指数 DI = 0 / 4.77 / 3.31 dB（与图样严格一致），探测点时域波形 p = D(θ)·sin(2πft−kr)/r。
```

内核清单行追加 4 个文件名：

```diff
-`public/js/sim-helmholtz.js` `sim-impedance.js` `sim-octave.js` `sim-hvac.js` `sim-fxlms.js` `sim-drone.js` `sim-micarray.js` `sim-wedge.js` `sim-tube.js` `sim-echo.js` — 声学模拟器内核（均为 UMD，配套自包含 Canvas 动画视图 `view-sim-*.js`）
+`public/js/sim-helmholtz.js` `sim-impedance.js` `sim-octave.js` `sim-hvac.js` `sim-fxlms.js` `sim-drone.js` `sim-micarray.js` `sim-wedge.js` `sim-tube.js` `sim-echo.js` `sim-interference.js` `sim-bubble.js` `sim-refraction.js` `sim-radiation.js` — 声学模拟器内核（均为 UMD，配套自包含 Canvas 动画视图 `view-sim-*.js`）
```

测试计数行（leakage 已将其更新为 35 / 2279，在此基础上再改）：

```diff
-`node tests/*.test.js` 共 35 个测试文件、**2279 项断言全部通过**
+`node tests/*.test.js` 共 39 个测试文件、**2481 项断言全部通过**
```

更新记录置顶新增一条（置于 v2.6.5 leakage 条目之上）：

```diff
 ## 更新记录
 
+- v2.6.6：**「声学模拟器」分组再增 4 个动态演示（工具 43 → 47 个）**——双源声波干涉（A(θ)=|cos(πd·sinθ/λ)|，相长 Δr=mλ / 相消 Δr=(m+½)λ）、水下气泡共鸣（Minnaert f₀=(1/2πr)√(3γP₀/ρ)，f₀∝1/r + Lorentz 扫频）、温度梯度声折射（c(z)=c₀+g·z 射线弯曲，Snell 不变量 cosθ/c=常数，折返点 z_tp=c₀(secθ₀−1)/g，声影区）、声源辐射指向性（单极子/偶极子|cosθ|/四极子|cos2θ|，DI=0/4.77/3.31 dB）。各为 UMD 内核 + 自包含 Canvas 动画视图，配套 4 个测试文件 / 111 项断言（全套单测扩至 **39 个文件、2481 项断言全部通过**）。六处登记同步（router 三表、nav.js、index.html 五处、README），home-ui 卡片数校验 43 → 47。
 - v2.6.5：**新增「㉝ 孔洞缝隙与门窗隔声」（`#/leakage`，工具 42 → 43 个）**——……
```

---

## 集成后自检清单

1. `#/sim-interference` 默认 d=1 m、f=500 Hz：应见 3 个主极大（0°、±43.3°），第一相消角 ≈20.1°；把相位差调到 180°，中垂线应转相消。
2. `#/sim-bubble` 默认 r=1 mm：应显示 f₀≈3283 Hz；半径改 0.5 mm 频率应加倍（≈6.57 kHz）。
3. `#/sim-refraction` 默认/「逆温」预设（g>0）应见声线折返后返回地面；切「温度递减」（g<0）应见地面附近声影区（半透明阴影 + 红虚线）。
4. `#/sim-radiation`：偶极子 DI 应显示 4.77 dB、四极子 3.31 dB；偶极子模式下把探测角拖到 90°，波形应退化为直线（该方向无辐射）。
5. `node tests/overview.test.js` 与 `node tests/home-ui.test.js` 应通过（校验 47 模块四处一致；home-ui 卡片数断言需先从 43 改为 47）。
6. 窄屏下顶栏自动把「声学模拟器」收进「更多」——nav.js 既有行为，正常。

---

## 备注与假设

- **双源干涉**：远场（夫琅禾费）近似 A(θ)=|cos(πd·sinθ/λ+φ/2)|，极值角仅统计 |sinθ|≤1；近场复干涉图样未绘制。
- **气泡共鸣**：Minnaert 公式忽略表面张力与粘性（适用 r ≳ 0.1 mm）；扫频响应用去谐 Lorentz 形式，半功率点 f₀(1±1/(2Q))、带宽 Δf=f₀/Q 严格自洽；水中声速默认 1481 m/s。
- **声折射**：射线声学近似（不含绕射/散射），c(z) 线性模型在 c→0 附近失效（积分自动终止）；实际大气还受风切变影响。
- **四极子指向性指数**：本模块四极子为横向图样 D(θ)=|cos2θ|，DI = 10·lg(15/7) ≈ 3.31 dB，与极坐标图上画出的图样严格一致（解析积分 + 两种数值积分互证）。文献中 5.7–7.0 dB 的「四极子 DI」多对应纵向（P₂）等其它图样定义，不适用于本图样。
- 所有模块仅供工程估算与教学演示，正式设计请以标准/实测为准。
