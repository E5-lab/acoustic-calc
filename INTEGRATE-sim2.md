# 集成补丁：声学模拟器章节（10 个动态模拟器）

> **本文件取代 `INTEGRATE-sim.md`。** 若你尚未应用 `INTEGRATE-sim.md`，请直接按本文件一次性注册全部 **10 个** 模拟器；若已按旧文件添加过前 4 个（helmholtz / impedance / octave / hvac），请删除那 4 项重复登记，统一以本文件为准。
>
> 新增文件（已推送到仓库，**均为新增，未改动任何共享文件**）：
> - 内核：`public/js/sim-helmholtz.js` `sim-impedance.js` `sim-octave.js` `sim-hvac.js` `sim-fxlms.js` `sim-drone.js` `sim-micarray.js` `sim-wedge.js` `sim-tube.js` `sim-echo.js`
> - 视图：`public/js/view-sim-helmholtz.js` `view-sim-impedance.js` `view-sim-octave.js` `view-sim-hvac.js` `view-sim-fxlms.js` `view-sim-drone.js` `view-sim-micarray.js` `view-sim-wedge.js` `view-sim-tube.js` `view-sim-echo.js`
>
> 每个模拟器均为「UMD 计算内核 + 自包含 Canvas 动画视图」，视图 `init()` 自行注入全部 DOM 到空容器 `#view-sim-*`，与既有模块零代码耦合。
>
> **以下 4 处共享文件改动需由集成者应用。** 路由名统一用 `sim-*` 前缀，与既有 `sim` / `simfx` / `aural` / `hearing` 不冲突。
>
> ⚠️ 锚点已对照 `origin/main @ 7d2b9c4`（含其他 AI 的 hearing 模块）校准。因共享文件仍在被并行编辑，应用前请以**当前文件实际内容**为准核对锚点字符串。

---

## 10 个模拟器一览

| 路由 | 名称 | 动态效果 |
|---|---|---|
| `sim-helmholtz` | 亥姆霍兹共鸣器 | 颈口气塞正弦振荡 + 空腔脉动，f₀ 实时（默认 ≈206 Hz） |
| `sim-impedance` | 声阻抗 反射/透射 | 入射(蓝)/反射(橙)/透射(绿) 三列行波，振幅 ∝ 系数 |
| `sim-octave` | 倍频程频谱 | 9 段频谱条 + A 计权叠加 + 扫掠高亮 |
| `sim-hvac` | HVAC 消声器（吸声衬里） | 声波沿衬里风管振幅衰减 + ΔL–频率 |
| `sim-fxlms` | 主动降噪 FXLMS | 残差 RMS 随迭代收敛（默认 32 dB）+ 反相抵消波 |
| `sim-drone` | 无人机噪声 | 旋翼 BPF 音调辐射 + 随距离衰减 |
| `sim-micarray` | 麦克风阵列波束 | 极坐标波束图转向 + 栅瓣判定 |
| `sim-wedge` | 消声室吸声楔 | 低频反射 / 高频被楔吸收 + 截止频率 |
| `sim-tube` | 声阻抗管（两传声器法） | 管内驻波 + 反射/吸声系数 |
| `sim-echo` | 回声测距 | 脉冲往返 + 时延 ↔ 距离 |

---

## ① `public/js/router.js`

### 1a) `VIEWS` 表 —— 在 `aural: 'view-aural'` 之后追加 10 行

```diff
     sim: 'view-sim',
     simfx: 'view-simfx',
-    aural: 'view-aural'
+    aural: 'view-aural',
+    'sim-helmholtz': 'view-sim-helmholtz',
+    'sim-impedance': 'view-sim-impedance',
+    'sim-octave': 'view-sim-octave',
+    'sim-hvac': 'view-sim-hvac',
+    'sim-fxlms': 'view-sim-fxlms',
+    'sim-drone': 'view-sim-drone',
+    'sim-micarray': 'view-sim-micarray',
+    'sim-wedge': 'view-sim-wedge',
+    'sim-tube': 'view-sim-tube',
+    'sim-echo': 'view-sim-echo'
   };
```

### 1b) `TITLES` 表 —— 在 `aural:` 行之后追加 10 行

```diff
     simfx: '声场粒子动画 · 声学计算工具箱',
-    aural: '声学可听化 · 声学计算工具箱'
+    aural: '声学可听化 · 声学计算工具箱',
+    'sim-helmholtz': '亥姆霍兹共鸣器模拟器 · 声学计算工具箱',
+    'sim-impedance': '声阻抗反射/透射模拟器 · 声学计算工具箱',
+    'sim-octave': '倍频程频谱模拟器 · 声学计算工具箱',
+    'sim-hvac': 'HVAC 消声器模拟器 · 声学计算工具箱',
+    'sim-fxlms': '主动降噪 FXLMS 模拟器 · 声学计算工具箱',
+    'sim-drone': '无人机噪声模拟器 · 声学计算工具箱',
+    'sim-micarray': '麦克风阵列波束模拟器 · 声学计算工具箱',
+    'sim-wedge': '消声室吸声楔模拟器 · 声学计算工具箱',
+    'sim-tube': '声阻抗管模拟器 · 声学计算工具箱',
+    'sim-echo': '回声测距模拟器 · 声学计算工具箱'
   };
```

### 1c) `MOUNTS` 表 —— 在 `aural` 挂载项之后追加 10 项

```diff
     { route: 'sim', get: function () { return window.SimView; } },
     { route: 'simfx', get: function () { return window.SimFxView; } },
-    { route: 'aural', get: function () { return window.AuralView; } }
+    { route: 'aural', get: function () { return window.AuralView; } },
+    { route: 'sim-helmholtz', get: function () { return window.SimHelmholtzView; } },
+    { route: 'sim-impedance', get: function () { return window.SimImpedanceView; } },
+    { route: 'sim-octave', get: function () { return window.SimOctaveView; } },
+    { route: 'sim-hvac', get: function () { return window.SimHvacView; } },
+    { route: 'sim-fxlms', get: function () { return window.SimFxlmsView; } },
+    { route: 'sim-drone', get: function () { return window.SimDroneView; } },
+    { route: 'sim-micarray', get: function () { return window.SimMicarrayView; } },
+    { route: 'sim-wedge', get: function () { return window.SimWedgeView; } },
+    { route: 'sim-tube', get: function () { return window.SimTubeView; } },
+    { route: 'sim-echo', get: function () { return window.SimEchoView; } }
   ];
```

> 说明：`VIEWS` / `TITLES` / `NAV_SUB` 中含连字符的键（`'sim-helmholtz'` 等）**必须加引号**，否则是非法标识符。`parse()` 用 `hasOwnProperty` 精确匹配，连字符路由可正常工作。

---

## ② `public/js/nav.js`

### 2a) `NAV_SUB` 表 —— 在 `wave: [...]` 行之后追加 10 行

```diff
     diffuser: ['八类几何形态', '几何剖面', '裁切清单'],
     wave: ['声速', '波长↔频率', '自由场声强', '声阻抗与界面', '比值↔分贝', '音名与拍频', '管/弦共振', '多普勒']
+    ,
+    'sim-helmholtz': ['共振频率 f₀', '气塞振荡', '空腔脉动'],
+    'sim-impedance': ['入射/反射/透射', '界面两侧介质', '透射损失 TL'],
+    'sim-octave': ['9 段频谱', 'A/C/Z 计权', '主频与总声级'],
+    'sim-hvac': ['衬里衰减', 'ΔL–频率', '风压损失'],
+    'sim-fxlms': ['残差收敛', '反相抵消', '步长稳定性'],
+    'sim-drone': ['BPF 音调', '随距离衰减', 'A 计权'],
+    'sim-micarray': ['波束图', '主瓣宽', '栅瓣判定'],
+    'sim-wedge': ['截止频率', '楔长估算', '数量/体积'],
+    'sim-tube': ['管内驻波', '反射系数 R', '吸声系数 α'],
+    'sim-echo': ['脉冲往返', '时延↔距离', '距离分辨率']
   };
```

---

## ③ `public/index.html`

### 3a) 导航 —— 在最后一个 `.nav-group`（电声与听觉）闭合、`</nav>`（约第 114 行）之前，新增「声学模拟器」分组

```diff
           <a href="#/audiolevel" data-route="audiolevel"><span class="nm-t">音频电平与阻抗</span><small class="nm-d">dBV/dBu/dBFS · 灵敏度 · 串并联 · 阻尼系数</small></a>
         </div>
       </div>
+
+      <div class="nav-group">
+        <button class="nav-parent" type="button" aria-expanded="false" aria-haspopup="true">
+          声学模拟器
+          <svg class="nav-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
+        </button>
+        <div class="nav-menu">
+          <a href="#/sim-helmholtz" data-route="sim-helmholtz"><span class="nm-t">亥姆霍兹共鸣器</span><small class="nm-d">气塞振荡 · 空腔脉动 · f₀ 实时</small></a>
+          <a href="#/sim-impedance" data-route="sim-impedance"><span class="nm-t">声阻抗反射/透射</span><small class="nm-d">三列行波 · 界面两侧介质 · TL</small></a>
+          <a href="#/sim-octave" data-route="sim-octave"><span class="nm-t">倍频程频谱</span><small class="nm-d">9 段频谱 · A/C/Z 计权 · 扫掠</small></a>
+          <a href="#/sim-hvac" data-route="sim-hvac"><span class="nm-t">HVAC 消声器</span><small class="nm-d">衬里风管衰减 · ΔL–频率</small></a>
+          <a href="#/sim-fxlms" data-route="sim-fxlms"><span class="nm-t">主动降噪 FXLMS</span><small class="nm-d">残差收敛 · 反相抵消</small></a>
+          <a href="#/sim-drone" data-route="sim-drone"><span class="nm-t">无人机噪声</span><small class="nm-d">旋翼 BPF · 随距离衰减</small></a>
+          <a href="#/sim-micarray" data-route="sim-micarray"><span class="nm-t">麦克风阵列波束</span><small class="nm-d">极坐标波束 · 栅瓣 · DOA</small></a>
+          <a href="#/sim-wedge" data-route="sim-wedge"><span class="nm-t">消声室吸声楔</span><small class="nm-d">截止频率 · 楔长估算</small></a>
+          <a href="#/sim-tube" data-route="sim-tube"><span class="nm-t">声阻抗管</span><small class="nm-d">管内驻波 · 两传声器法</small></a>
+          <a href="#/sim-echo" data-route="sim-echo"><span class="nm-t">回声测距</span><small class="nm-d">脉冲往返 · 时延↔距离</small></a>
+        </div>
+      </div>
     </nav>
```

### 3b) 视图容器 —— 在 `</main>`（约第 4335 行）之前，追加 10 个空 `section`（视图自注入 DOM，容器留空即可）

```diff
     </section>
   </section>
 
+  <section class="view" id="view-sim-helmholtz" data-view="sim-helmholtz" hidden></section>
+  <section class="view" id="view-sim-impedance" data-view="sim-impedance" hidden></section>
+  <section class="view" id="view-sim-octave" data-view="sim-octave" hidden></section>
+  <section class="view" id="view-sim-hvac" data-view="sim-hvac" hidden></section>
+  <section class="view" id="view-sim-fxlms" data-view="sim-fxlms" hidden></section>
+  <section class="view" id="view-sim-drone" data-view="sim-drone" hidden></section>
+  <section class="view" id="view-sim-micarray" data-view="sim-micarray" hidden></section>
+  <section class="view" id="view-sim-wedge" data-view="sim-wedge" hidden></section>
+  <section class="view" id="view-sim-tube" data-view="sim-tube" hidden></section>
+  <section class="view" id="view-sim-echo" data-view="sim-echo" hidden></section>
 </main>
```

### 3c) 脚本标签 —— 在 `<script src="js/view-wave.js"></script>`（约第 4410 行）之后追加 20 个标签（10 内核 + 10 视图）

```diff
 <script src="js/view-wave.js"></script>
+<script src="js/sim-helmholtz.js"></script>
+<script src="js/view-sim-helmholtz.js"></script>
+<script src="js/sim-impedance.js"></script>
+<script src="js/view-sim-impedance.js"></script>
+<script src="js/sim-octave.js"></script>
+<script src="js/view-sim-octave.js"></script>
+<script src="js/sim-hvac.js"></script>
+<script src="js/view-sim-hvac.js"></script>
+<script src="js/sim-fxlms.js"></script>
+<script src="js/view-sim-fxlms.js"></script>
+<script src="js/sim-drone.js"></script>
+<script src="js/view-sim-drone.js"></script>
+<script src="js/sim-micarray.js"></script>
+<script src="js/view-sim-micarray.js"></script>
+<script src="js/sim-wedge.js"></script>
+<script src="js/view-sim-wedge.js"></script>
+<script src="js/sim-tube.js"></script>
+<script src="js/view-sim-tube.js"></script>
+<script src="js/sim-echo.js"></script>
+<script src="js/view-sim-echo.js"></script>
 <script src="js/banner.js"></script>
```

> 内核与视图脚本均置于 `router.js`（引导）之前加载；视图只在 `init()` 运行时访问 `window.SimXxx`，故内核/视图加载顺序不影响运行。

---

## ④ `README.md`（可选）—— 追加一节

```md
### ⓿❶ 声学模拟器（#/sim-* · 动态演示）
浏览器端纯前端 Canvas 动画模拟器，与上面的计算器互补：
- **#/sim-helmholtz** 亥姆霍兹共鸣器：颈口气塞振荡 + 空腔脉动，f₀=(c/2π)√(A/(V·L_eff)) 实时
- **#/sim-impedance** 声阻抗反射/透射：入射/反射/透射三列行波，振幅 ∝ R / T
- **#/sim-octave** 倍频程频谱：31.5 Hz–8 kHz 九段 + A/C/Z 计权总声级 + 扫掠
- **#/sim-hvac** HVAC 吸声衬里消声器：衬里直管衰减（Beranek 简化）+ ΔL–频率
- **#/sim-fxlms** 主动降噪 FXLMS：自适应滤波残差收敛演示（教学简化模型）
- **#/sim-drone** 无人机噪声：旋翼叶片通过频率 BPF 音调 + 球面扩散随距衰减
- **#/sim-micarray** 麦克风阵列波束：延时-求和波束图、主瓣宽、栅瓣判定
- **#/sim-wedge** 消声室吸声楔：截止频率 f≈c/(2L) 与楔长/数量估算
- **#/sim-tube** 声阻抗管（两传声器法）：管内驻波、反射系数 R、吸声系数 α
- **#/sim-echo** 回声测距：脉冲往返，d=c·t/2 与距离分辨率
```

---

## 集成后自检清单

1. `#/sim-fxlms` 进入后应见收敛曲线下降、残差（绿）变矮，默认降噪 ≈ 32 dB。
2. `#/sim-tube` 默认 Zs≈412 rayl 时 R≈0、α≈1、SWR≈1（近乎匹配）；载入例题（刚性样品 Zs=150）出现明显驻波节点。
3. `#/sim-micarray` 默认 d=0.25 m < λ/2，应显示「无栅瓣」；把 d 调到 >0.5 m（f=343）应出现栅瓣角。
4. `#/sim-wedge` 默认 L=1 m 应显示截止 f≈171.5 Hz。
5. 顶栏一级菜单在窄屏会自动把「声学模拟器」收进「更多」——这是 nav.js 既有行为，属正常。

---

## 备注与假设

- **FXLMS**：教学简化模型（次级路径=纯延迟、滤波-X 参考已补偿延迟）。稳定步长约 μ≤0.01；μ 过大会发散（视图会给出告警）。真实系统需离线/在线次级路径建模。
- **无人机噪声**：仅建模 BPF 音调（谐波按 −6 dB/阶衰减）+ 球面扩散，未含宽带湍流；真实无人机频谱需实测。
- **吸声楔**：截止频率用保守估计 f≈c/(2L)（λ≈2L），并给出四分之一波长参考 f≈c/(4L)。
- **声阻抗管**：法向入射、Zs 取实数；工程测量用复阻抗 + 传递函数相位（Chung–Blaser）。
- 所有模块仅供工程估算与教学演示，正式设计请以标准/实测为准。
