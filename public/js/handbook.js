/*
 * handbook.js — 公式与术语手册内核（UMD，无 DOM 依赖，可 Node 直接 require）
 *
 * 汇总本站各模块用到的核心公式与术语，按 10 个分类组织，供 #/handbook 视图检索与展示。
 * 每条目字段：
 *   t 术语/名称        a 缩写或符号（可空）   c 分类索引   d 说明/定义
 *   f 公式（纯文本，可空）  u 单位（可空）   s 出处/标准（可空）   r 相关模块路由（可空）
 *
 * 导出：CATS / ENTRIES / all() / byCat(i) / search(q, opt) / stats() / suggest(q) / normalize(q)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.Handbook = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CATS = [
    { id: 'basic', name: '基础与单位', icon: 'dB' },
    { id: 'abs', name: '吸声与材料', icon: 'α' },
    { id: 'ins', name: '隔声与构件', icon: 'R' },
    { id: 'room', name: '房间声学', icon: 'RT' },
    { id: 'quality', name: '音质参量', icon: 'G' },
    { id: 'env', name: '环境与户外', icon: 'Ld' },
    { id: 'psycho', name: '心理与声品质', icon: 'S' },
    { id: 'vib', name: '振动', icon: 'VL' },
    { id: 'audio', name: '电声与音频', icon: 'SPL' },
    { id: 'occ', name: '职业健康', icon: 'LEX' }
  ];

  // c 为分类 id
  var ENTRIES = [
    /* ============================ 0 基础与单位 ============================ */
    { t: '声压级', a: 'SPL / Lp', c: 'basic', d: '声压与基准声压 p₀ = 20 μPa 之比的分贝值，空气声中一切声级的起点。', f: 'Lp = 20·lg(p / p₀)', u: 'dB', s: 'ISO 1683', r: 'levels' },
    { t: '声强级', a: 'LI', c: 'basic', d: '声强与基准声强 I₀ = 10⁻¹² W/m² 之比的分贝值。', f: 'LI = 10·lg(I / I₀)', u: 'dB', s: 'ISO 1683', r: 'wave' },
    { t: '声功率级', a: 'Lw', c: 'basic', d: '声源辐射总声功率与基准 P₀ = 10⁻¹² W 之比的分贝值，与测点距离无关。', f: 'Lw = 10·lg(W / W₀)', u: 'dB', s: 'ISO 3744', r: 'hvacnoise' },
    { t: '级差与倍数', a: '', c: 'basic', d: '声压翻倍 +6 dB；声功率（能量）翻倍 +3 dB；距离加倍点声源 −6 dB。', f: 'ΔL = 20·lg(p₂/p₁) = 10·lg(W₂/W₁)', u: 'dB', s: '', r: 'levels' },
    { t: '能量叠加', a: '', c: 'basic', d: '多声源合成须按能量相加，不能直接算术相加（n 个等值声源合成 +10·lg n）。', f: 'L = 10·lg(Σ 10^(0.1·Lᵢ))', u: 'dB', s: '', r: 'levels' },
    { t: '能量平均', a: 'Leq 型', c: 'basic', d: '一段时间/多点位的等效声级，按时长或点数加权能量平均。', f: 'Leq = 10·lg[(1/T)·Σ tᵢ·10^(0.1·Lᵢ)]', u: 'dB', s: 'IEC 61672', r: 'env' },
    { t: 'A 计权', a: 'dB(A)', c: 'basic', d: '模拟人耳对中低频不敏感的特性网络，环境与职业噪声评价的通用量。1 kHz 处为 0 dB。', f: '在 1/1 或 1/3 倍频带逐带加 A 修正后叠加', u: 'dB', s: 'IEC 61672-1', r: 'spectrum' },
    { t: 'C 计权', a: 'dB(C)', c: 'basic', d: '近似平坦的计权网络（3.15 kHz 附近略降），常用于峰值与护听器评价。', f: 'A 与 C 之差随频率变化，宽带噪声约 5~7 dB', u: 'dB', s: 'IEC 61672-1', r: 'spectrum' },
    { t: '倍频程与 1/3 倍频程', a: 'oct / 1/3 oct', c: 'basic', d: '相邻频带中心频率之比为 2（或 2^(1/3)），中心频率按 ISO 266 优选数列。', f: 'f 上/f 下 = 2（倍频程）、f 中 = √(f 下·f 上)', u: 'Hz', s: 'ISO 266', r: 'spectrum' },
    { t: '波长与波数', a: 'λ / k', c: 'basic', d: '波长 λ = c/f；波数 k = 2π/λ = ω/c，是干涉、折射与散射计算的基本量。', f: 'λ = c / f，k = 2πf / c', u: 'm / 1/m', s: '', r: 'wave' },
    { t: '声速', a: 'c', c: 'basic', d: '空气中 c ≈ 343 m/s（20 °C），随温度升高而增大约 +0.6 m/s 每 °C。', f: 'c = 331.4 + 0.6·t(°C)', u: 'm/s', s: '', r: 'wave' },
    { t: '声阻抗率', a: 'Z = ρc', c: 'basic', d: '平面波中声压与质点速度之比；空气 ρc ≈ 415 Pa·s/m（400 为常用约定）。', f: 'Z = ρ·c，空气 ≈ 415 Rayl', u: 'Pa·s/m', s: '', r: 'absorber' },
    { t: '自由场声压与距离', a: '', c: 'basic', d: '点声源自由场下声压级随距离平方衰减（每加倍 −6 dB）。', f: 'Lp(r) = Lw − 20·lg r − 11（半球面还需 −3）', u: 'dB', s: '', r: 'hvacnoise' },
    { t: '临界带', a: 'CB', c: 'basic', d: '听觉滤波器的带宽，1 kHz 以下近似恒定 100 Hz，以上约为中心频率的 23%。', f: 'ERB = 24.7·(4.37·f/1000 + 1)', u: 'Hz', s: 'Zwicker', r: 'hearing' },
    { t: '采样率与奈奎斯特', a: 'fs', c: 'basic', d: '数字信号可无混叠表示的最高频率为采样率的一半。', f: 'f_max = fs / 2', u: 'Hz', s: 'Nyquist', r: 'audiolevel' },

    /* ============================ 1 吸声与材料 ============================ */
    { t: '吸声系数', a: 'α', c: 'abs', d: '被吸收声能与入射声能之比，0（全反射）~1（全吸收）；常用混响室法或阻抗管法测。', f: 'α = 1 − |r|²', u: '—', s: 'ISO 354 / ISO 10534', r: 'absorber' },
    { t: '降噪系数', a: 'NRC', c: 'abs', d: '250/500/1000/2000 Hz 四个吸声系数的算术平均，取 0.05 的整数倍。', f: 'NRC = (α₂₅₀ + α₅₀₀ + α₁ₖ + α₂ₖ) / 4', u: '—', s: 'ASTM C423', r: 'absorber' },
    { t: '混响室吸声量', a: 'A', c: 'abs', d: '等效吸声面积 = 材料面积 × 吸声系数（含空气吸收贡献）。', f: 'A = Σ Sᵢ·αᵢ + 4·m·V', u: 'm²(赛宾)', s: 'ISO 354', r: 'rt60' },
    { t: '多孔材料流阻', a: 'Rs', c: 'abs', d: '气流通过多孔材料单位厚度的压降，决定其低频吸声与阻抗特性。', f: 'Rs = Δp / (u·d)', u: 'Pa·s/m²', s: 'ISO 9053', r: 'absdesign' },
    { t: 'Delany-Bazley 模型', a: '', c: 'abs', d: '以流阻率为唯一参数的经验模型，给出多孔材料的特性阻抗与传播常数。', f: 'Zc = ρc·[1 + 0.0571·X^(−0.754) − j·0.087·X^(−0.732)]', u: '—', s: 'Delany & Bazley 1970', r: 'absdesign' },
    { t: '微穿孔板', a: 'MPP', c: 'abs', d: '孔径 < 1 mm 的穿孔板，靠孔内粘滞摩擦提供声阻，无需多孔填料即可宽带吸声。', f: 'r = 32·η·t / (σ·ρc·d²)·(√(1+k²/32) + …)', u: '—', s: '马大猷', r: 'absdesign' },
    { t: '穿孔率', a: 'σ (p)', c: 'abs', d: '孔总面积占板面积之比，本站按百分数输入（如 12.5 表示 12.5%）。', f: 'σ = N·π·d²/4 / S', u: '%', s: '', r: 'perforation' },
    { t: '板共振吸声', a: 'f₀', c: 'abs', d: '薄板与后空腔构成的质量—弹簧系统，在 f₀ 附近吸声最大。', f: 'f₀ = (c/2π)·√(ρ / (m·d))', u: 'Hz', s: '', r: 'absdesign' },
    { t: '亥姆霍兹共鸣器', a: '', c: 'abs', d: '腔体 + 颈部构成的谐振吸声体，颈部集中声质量与腔体声顺共振。', f: 'f₀ = (c/2π)·√(S / (V·L_eff))', u: 'Hz', s: '', r: 'sim-helmholtz' },
    { t: '吸声结构空气层', a: 'd', c: 'abs', d: '材料后留空腔可显著提升低频吸声，最优空腔约等于监听频率的 1/4 波长。', f: 'd_opt ≈ λ / 4', u: 'm', s: '', r: 'absdesign' },
    { t: '阻抗管法（驻波比）', a: '', c: 'abs', d: '管内驻波比 s = p_max/p_min 求反射系数大小，再由两传声器法求复反射系数与 α。', f: '|r| = (s − 1) / (s + 1)，α = 1 − |r|²', u: '—', s: 'ISO 10534-2', r: 'sim-tube' },

    /* ============================ 2 隔声与构件 ============================ */
    { t: '隔声量', a: 'R (TL)', c: 'ins', d: '入射与透射声功率之比的对数值，是构件隔绝空气声的基本指标。', f: 'R = 10·lg(1/τ) = 10·lg(W₁/W₂)', u: 'dB', s: 'ISO 10140', r: 'stc' },
    { t: '质量定律', a: '', c: 'ins', d: '单层匀质密实构件的隔声随面密度与频率各按 6 dB/倍频程增长（现场实测常为 4~5 dB）。', f: 'R = 20·lg(m·f) − 48（本站约定）', u: 'dB', s: 'ISO 12354', r: 'stc' },
    { t: '吻合效应', a: 'fc', c: 'ins', d: '入射声波波长与板弯曲波吻合时隔声出现低谷，低谷深浅取决于板阻尼与厚度。', f: 'fc = c² / (1.8·c_L·d)', u: 'Hz', s: '', r: 'insdesign' },
    { t: '计权隔声量', a: 'Rw', c: 'ins', d: '在 100~3150 Hz（1/3 倍频带）按基准曲线拟合后置于不利偏差 ≤32 dB 的整数值。', f: '500/1k/2k 三带平均可作快速估算', u: 'dB', s: 'GB/T 50121 / ISO 717-1', r: 'stc' },
    { t: 'STC 与 Rw 差异', a: 'STC', c: 'ins', d: 'STC 是 ASTM E413 的美国口径，频段与频谱修正方式与 Rw 不同，数值常有 ±3 dB 出入。', f: '—', u: 'dB', s: 'ASTM E413', r: 'stc' },
    { t: '频谱修正量', a: 'C / Ctr', c: 'ins', d: 'Rw 之外的修正：C（中高频，语言/生活噪声）与 Ctr（低频，交通噪声，常为负）。', f: 'Rw + Ctr 用于临街构件评价', u: 'dB', s: 'ISO 717-1 / GB 50118', r: 'leakage' },
    { t: '双层构件共振频率', a: 'f₀', c: 'ins', d: '双层面板 + 空腔构成质量—弹簧—质量系统，f₀ 处隔声显著下降。', f: 'f₀ = 60·√[(m₁+m₂)/(m₁·m₂·d)]', u: 'Hz', s: '', r: 'leakage' },
    { t: '双层构件附加隔声', a: 'ΔR', c: 'ins', d: '空腔隔声量随腔深增大，纸面石膏板 100→300 mm 约 9→11.8 dB；腔内置棉再 +5 dB。', f: '满填吸声材料可再 +5 dB', u: 'dB', s: '', r: 'leakage' },
    { t: '中空玻璃隔声', a: '', c: 'ins', d: '空气层带来附加隔声，约每 mm 0.1 dB，超过 100 mm 后增速放缓。', f: 'ΔR ≈ 0.1·d(mm)', u: 'dB', s: '', r: 'leakage' },
    { t: 'PVB 夹层玻璃', a: '', c: 'ins', d: '中间柔性夹层抑制吻合效应，按夹层厚度提供附加量。', f: '0.38/0.76/1.14/1.52 mm → +4/5.5/6/7 dB', u: 'dB', s: '', r: 'leakage' },
    { t: '组合构件面积加权', a: '', c: 'ins', d: '墙、门、窗、孔洞按透射系数面积加权（不是隔声量加权）。', f: 'τ总 = Σ Sᵢ·τᵢ / Σ Sᵢ，R = −10·lg τ总', u: 'dB', s: '', r: 'leakage' },
    { t: '孔洞透射（声质量模型）', a: 'TL', c: 'ins', d: '小孔的透射由孔内空气质量控制，低频近乎全透射，孔洞决定组合构件隔声上限。', f: 'τ = 4/[4 + (k·L)²]，L = 板厚 + (8/3π)d', u: 'dB', s: '', r: 'leakage' },
    { t: '孔洞隔声天花板', a: 'R_cap', c: 'ins', d: '墙体面积 S_c 上开孔总面积 S_hole 时，组合隔声不可能超过此上限。', f: 'R_cap = 10·lg(S_c / S_hole)', u: 'dB', s: '', r: 'leakage' },
    { t: '缝隙影响量', a: 'ΔR', c: 'ins', d: '按缝隙全透射近似的隔声降低量，1% 缝隙即可使 50 dB 墙体降到约 30 dB。', f: 'ΔR = 10·lg[(1 + ε·10^(0.1R₀)) / (1 + ε)]', u: 'dB', s: 'GB 50118 报告书式 7.4.5', r: 'leakage' },
    { t: '撞击声压级', a: 'Ln', c: 'ins', d: '标准撞击器作用于楼板下室测得的声压级，衡量楼板隔绝撞击声能力（数值越低越好）。', f: '标准化：Ln,w、ΔLn（面层改善量）', u: 'dB', s: 'GB/T 50121', r: 'insdesign' },
    { t: '浮筑楼板', a: '', c: 'ins', d: '面层与结构板间加弹性垫层降低撞击声，改善量与垫层动态刚度相关。', f: 'ΔL ≈ 30·lg(f₀/f)（经验）', u: 'dB', s: '', r: 'insdesign' },

    /* ============================ 3 房间声学 ============================ */
    { t: '混响时间', a: 'RT60 / T60', c: 'room', d: '声能密度衰减 60 dB 所需时间，房间声学最核心的单值指标。', f: 'RT60 = 0.161·V / A', u: 's', s: 'Sabine / ISO 3382', r: 'rt60' },
    { t: '赛宾公式', a: 'Sabine', c: 'room', d: '适用于平均吸声系数较小的房间（ᾱ < 0.2）。', f: 'RT = 0.161·V / (Σ Sᵢαᵢ + 4mV)', u: 's', s: 'Sabine 1900', r: 'rt60' },
    { t: '艾润公式', a: 'Eyring', c: 'room', d: '用 −ln(1 − ᾱ) 替代平均吸声系数，适合强吸声房间。', f: 'RT = 0.161·V / [−S·ln(1 − ᾱ)]', u: 's', s: 'Eyring', r: 'rt60' },
    { t: '平均吸声系数', a: 'ᾱ', c: 'room', d: '按面积加权平均的吸声系数，是公式选择（Sabine/Eyring）与声场类型的判据。', f: 'ᾱ = Σ Sᵢαᵢ / Σ Sᵢ', u: '—', s: '', r: 'rt60' },
    { t: '房间常数', a: 'R', c: 'room', d: '房间吸声总量与（1−ᾱ）之比，决定混响场声级的贡献。', f: 'R = S·ᾱ / (1 − ᾱ)', u: 'm²', s: '', r: 'roomq' },
    { t: '临界距离', a: 'Dc / rc', c: 'room', d: '直达声与混响声能量相等的距离，扩声设计的关键参量。', f: 'rc = 0.141·√(Q·R)', u: 'm', s: '', r: 'roomq' },
    { t: '房间模态与简正频率', a: '', c: 'room', d: '刚性矩形房间的驻波频率由三向半波长条件决定。', f: 'f = (c/2)·√[(nx/Lx)² + (ny/Ly)² + (nz/Lz)²]', u: 'Hz', s: 'Rayleigh', r: 'smallroom' },
    { t: 'Schroeder 频率', a: 'fs', c: 'room', d: '以下为模态主导（须按模态处理），以上可视为统计声场。', f: 'fs = 2000·√(RT60 / V)', u: 'Hz', s: 'Schroeder 1962', r: 'smallroom' },
    { t: '声场衰减曲线拟合', a: 'EDT/T20/T30', c: 'room', d: 'EDT 取 0~−10 dB；T20 取 −5~−25 dB；T30 取 −5~−35 dB，后者最稳健、EDT 反映主观混响感。', f: '由最小二乘拟合斜率换算至 60 dB', u: 's', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '空气吸收', a: '4m', c: 'room', d: '大空间高频空气吸收不可忽略，与温湿度相关。', f: 'RT 公式中加 4mV 项', u: '—', s: 'ISO 9613-1', r: 'rt60' },
    { t: '声线法（几何声学）', a: '', c: 'room', d: '高频近似下声能沿声线传播，遇界面按吸声/散射分配，用于混响与可听化模拟。', f: '能量按 α 吸收、按散射系数分配', u: '—', s: 'ISO 3382 / Kuttruff', r: 'sim' },
    { t: '扩散度', a: 'd', c: 'room', d: '自相关扩散度或按 ISO 3382 的界面扩散评价，影响声场均匀性与听感。', f: 'd = 1 − Σ [...]', u: '—', s: 'ISO 17497', r: 'diffuser' },

    /* ============================ 4 音质参量 ============================ */
    { t: '早期衰变时间', a: 'EDT', c: 'quality', d: '衰减曲线 0~−10 dB 段的拟合值×6，与主观混响感关系最密切。', f: 'EDT = 6 × t(−10dB)', u: 's', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '明晰度', a: 'C50 / C80', c: 'quality', d: '早期（0~50 ms 或 0~80 ms）与后期声能比的对数值，语言用 C50、音乐用 C80。', f: 'C50 = 10·lg(∫₀^50ms p² dt / ∫_50ms^∞ p² dt)', u: 'dB', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '清晰度', a: 'D50', c: 'quality', d: '50 ms 内早期声能占总声能的比值（线性量，无分母为零的奇点）。', f: 'D50 = ∫₀^50ms p² dt / ∫₀^∞ p² dt', u: '—', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '中心时间', a: 'Ts', c: 'quality', d: '声能一阶矩的时间重心，越小越清晰。', f: 'Ts = ∫ t·p² dt / ∫ p² dt', u: 'ms', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '强度因子', a: 'G', c: 'quality', d: '测点声能级相对自由场 10 m 处同一声源声能级的差值，反映房间放大。', f: 'G = L_pE − L_W + 31（10 m 参考）', u: 'dB', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '侧向声能比', a: 'LF / LJ', c: 'quality', d: '侧向进入的能量与总能量之比（LF80 / LJ80），反映空间感。', f: 'LF = ∫₅..₈₀ (pL²) / ∫₀..₈₀ (p²)', u: '—', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '双耳互相关', a: 'IACC', c: 'quality', d: '双耳信号互相关最大值的绝对值，越低空间感越好（1 为完全相干）。', f: 'IACC = max|∫ pL·pR dτ / √(∫pL²·∫pR²)|', u: '—', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '初始时延差', a: 'ITDG', c: 'quality', d: '直达声与首个重要反射之间的时延，影响回声感与声像定位。', f: 'Δt = t(反射) − t(直达)', u: 'ms', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '低音比', a: 'BR', c: 'quality', d: '125~250 Hz 平均混响时间与 500~2000 Hz 平均混响时间之比，音乐厅暖感的客观量。', f: 'BR = T_mf(low) / T_mf(mid)', u: '—', s: 'ISO 3382-1', r: 'iso3382' },
    { t: '语言传输指数', a: 'STI / STIPA', c: 'quality', d: '由 7 个频带的调制传递函数求得的 0~1 语言清晰度指标，STIPA 为其快速版本。', f: 'MTF 按 IEC 60268-16 h²(t) 能量衰减', u: '—', s: 'IEC 60268-16', r: 'pasystem' },
    { t: '早期反射声', a: '', c: 'quality', d: '直达声后 50 ms 内的反射加强响度与清晰度，过强或过迟则形成回声。', f: '回声判据：Δt > 50 ms 且强度不足', u: 'ms', s: '', r: 'roomq' },
    { t: '扩散体设计', a: 'QRD/PRD', c: 'quality', d: '按数论序列设计表面凹槽深度，将反射能量按频率扩散、削弱镜面反射。', f: 'QRD 深度 dₙ ∝ sₙ² mod N', u: 'mm', s: 'Schroeder', r: 'diffuser' },

    /* ============================ 5 环境与户外 ============================ */
    { t: '等效连续声级', a: 'Leq', c: 'env', d: '规定时段内按能量平均的 A 计权声级，环境噪声评价的基本量。', f: 'Leq = 10·lg[(1/T)·∫10^(0.1·L) dt]', u: 'dB(A)', s: 'GB 3096 / ISO 1996', r: 'env' },
    { t: '统计声级', a: 'L10 / L50 / L90', c: 'env', d: '超过该声级的时间占 N% 的声级；L90 常作背景噪声，L10 反映峰值干扰。', f: 'Lₙ：P(L > Lₙ) = N%', u: 'dB(A)', s: 'ISO 1996', r: 'env' },
    { t: '昼夜等效声级', a: 'Ldn / Lden', c: 'env', d: '夜间（及傍晚）加 10 dB（傍晚加 5 dB）后的 24 h 等效声级。', f: 'Lden = 10·lg[(1/24)(Σ tᵢ·10^(0.1(Lᵢ+Δ))) ]', u: 'dB(A)', s: 'ISO 1996-1', r: 'env' },
    { t: '户外传播（点声源）', a: 'ISO 9613-2', c: 'env', d: '几何发散 + 大气吸收 + 地面效应 + 屏障 + 衰减项逐项相加。', f: 'Lp = Lw + Dc − Adiv − Aatm − Agr − Abar − Amisc', u: 'dB', s: 'ISO 9613-2', r: 'env' },
    { t: '几何发散衰减', a: 'Adiv', c: 'env', d: '点声源按 20·lg(r/r₀)；线声源（如车流）按 10·lg 衰减。', f: 'Adiv(点) = 20·lg(r/1m)；Adiv(线) = 10·lg(r/1m)', u: 'dB', s: '', r: 'env' },
    { t: '大气吸收衰减', a: 'Aatm', c: 'env', d: '与频率、温湿度相关，高温低湿时衰减更大。', f: 'Aatm = α·r / 1000', u: 'dB', s: 'ISO 9613-1', r: 'env' },
    { t: '声屏障插入损失', a: 'IL', c: 'env', d: '绕射声程差决定的衰减，常用 Maekawa 近似；薄屏障在声影区可达 10~20 dB。', f: 'IL ≈ 10·lg(3 + 20·N)（N 为 Fresnel 数）', u: 'dB', s: 'Maekawa', r: 'barrier' },
    { t: '菲涅尔数', a: 'N', c: 'env', d: '绕射声程差与半波长之比，决定屏障衰减量。', f: 'N = 2δ / λ', u: '—', s: '', r: 'barrier' },
    { t: '交通噪声预测', a: '', c: 'env', d: '按车流量、车速、车型比例估算线声源声级，再按距离与地面衰减外推。', f: 'Lm,E ≈ 10·lg(Q/V) + 与车型相关的常数', u: 'dB(A)', s: 'GB/T 相关 / CRTN 型', r: 'env' },
    { t: '声功率测量', a: 'ISO 3744/45/46', c: 'env', d: '声压法（工程/简易级）、声强法与混响室法分别适用于不同精度与现场条件。', f: 'Lw = L̄p + 10·lg(S/S₀) + K', u: 'dB', s: 'ISO 3744~3746', r: 'hvacnoise' },
    { t: '环境限值', a: 'GB 3096', c: 'env', d: '按 0~4 类声环境功能区规定昼夜限值（0 类昼 50/夜 40 起）。', f: '昼 50/55/60/65/70，夜 40/45/50/55/55', u: 'dB(A)', s: 'GB 3096-2008', r: 'noisemap' },
    { t: '建筑室内限值', a: 'GB 55016', c: 'env', d: '外部传入室内与内部设备噪声的强制性限值，按房间用途分档。', f: '睡眠 40/30，日常 40/40，阅读 35/35 dB', u: 'dB(A)', s: 'GB 55016-2021', r: 'noisemap' },

    /* ============================ 6 心理与声品质 ============================ */
    { t: '响度级', a: 'LN', c: 'psycho', d: '以 1 kHz 纯音为基准，等响条件下该纯音的声压级即为待测声的响度级。', f: '由 ISO 226 等响曲线族确定', u: 'phon', s: 'ISO 226', r: 'hearing' },
    { t: '响度', a: 'N', c: 'psycho', d: '人耳感知的强弱量，与响度级关系为每 +10 phon 响度约翻倍。', f: 'N ≈ 2^((LN − 40)/10)', u: 'sone', s: 'Zwicker', r: 'psycho' },
    { t: '尖锐度', a: 'S', c: 'psycho', d: '高频成分引起的音色尖锐感，以 1 kHz 窄带噪声为 1 acum 基准。', f: 'S ∝ (高频加权响度) / 总响度', u: 'acum', s: 'Zwicker / Aures', r: 'psycho' },
    { t: '粗糙度', a: 'R', c: 'psycho', d: '约 20~300 Hz 调制产生的粗糙感，与调制频率和深度相关。', f: 'R ∝ f_mod 与调制深度的函数', u: 'asper', s: 'Aures / Fastl', r: 'psycho' },
    { t: '起伏强度', a: 'F', c: 'psycho', d: '低频调制（< 20 Hz）引起的缓慢起伏感，又称波动强度。', f: 'F ∝ ΔL 的函数', u: 'vacil', s: 'Fastl & Zwicker', r: 'psycho' },
    { t: '等响曲线', a: 'ISO 226', c: 'psycho', d: '各频率下与 1 kHz 纯音等响的声压级曲线族，低频需更高声压才等响。', f: '由听阈至 90 phon 逐条定义', u: 'phon', s: 'ISO 226:2003', r: 'hearing' },
    { t: '年龄阈移', a: '', c: 'psycho', d: '随年龄增长听觉上限下降与听阈上升的统计规律，高频尤甚。', f: '由 ISO 7029 分性别、分频段给出分位值', u: 'dB', s: 'ISO 7029', r: 'hearing' },
    { t: '掩蔽', a: '', c: 'psycho', d: '掩蔽声使被掩蔽声听阈升高的现象，分同时、前掩蔽与后掩蔽。', f: '临界带内掩蔽量随掩蔽级增长', u: 'dB', s: 'Zwicker', r: 'hearing' },
    { t: '声品质主观评价', a: '', c: 'psycho', d: '通过成对比较、语义细分或参考评分法等主观实验定位产品声品质。', f: 'Zwicker 参数 + 主观打分回归', u: '—', s: '', r: 'psycho' },
    { t: 'NR / NC 曲线', a: 'NR / NC', c: 'psycho', d: '以 1/1 倍频带声压级评价室内背景噪声的数值体系，取最接近的上方曲线号。', f: '按各带实测值查图取号', u: '—', s: 'GB/T 相关 / ANSI', r: 'noise' },
    { t: 'A 计权与主观响度差异', a: '', c: 'psycho', d: 'A 计权为单值近似，低频强声的主观响度往往高于 A 计权结果，故厂界低频须另评。', f: '—', u: '—', s: '', r: 'psycho' },

    /* ============================ 7 振动 ============================ */
    { t: '振动加速度级', a: 'VAL', c: 'vib', d: '加速度与基准 a₀ = 10⁻⁶ m/s² 之比的分贝值。', f: 'VAL = 20·lg(a / a₀)', u: 'dB', s: 'ISO 1683', r: 'vibeval' },
    { t: '振动速度级', a: 'VL', c: 'vib', d: '速度与基准 v₀ = 10⁻⁹ m/s 之比的分贝值。', f: 'VL = 20·lg(v / v₀)', u: 'dB', s: 'ISO 1683', r: 'vibeval' },
    { t: 'ISO 2631 计权', a: 'Wk / Wd', c: 'vib', d: '按人体对不同频率振动的敏感度计权，竖向常用 Wk、水平用 Wd，再合成 aw。', f: 'aw = √(Σ (Wᵢ·aᵢ)²)', u: 'm/s²', s: 'ISO 2631-1', r: 'vibeval' },
    { t: '振动剂量值', a: 'VDV', c: 'vib', d: '四次方积分，对冲击与峰值更敏感，与 aw 互补。', f: 'VDV = (∫ a_w⁴(t) dt)^(1/4)', u: 'm/s^1.75', s: 'ISO 2631-1', r: 'vibeval' },
    { t: '振动评价限值', a: 'GB 10070', c: 'vib', d: '城市区域环境振动标准，按区域类别规定昼夜间 VLz 限值（如居民区昼 70 / 夜 67 dB）。', f: 'VLz（铅垂向 Z 计权）', u: 'dB', s: 'GB 10070-88', r: 'vibeval' },
    { t: '隔振传递率', a: 'T', c: 'vib', d: '传给基础与激励力之比；T < 1 才有效隔振，需频率比 > √2。', f: 'T = 1 / |1 − (f/f₀)²|（无阻尼）', u: '—', s: '', r: 'vibration' },
    { t: '隔振效率', a: 'η', c: 'vib', d: '由传递率换算的隔振效果百分数。', f: 'η = (1 − T) × 100%', u: '%', s: '', r: 'vibration' },
    { t: '静态压缩量', a: 'δ', c: 'vib', d: '隔振器在设备重量下的压缩量，决定系统固有频率。', f: 'f₀ = 5 / √δ(cm)（近似）或 f₀ = (1/2π)√(g/δ)', u: 'cm / Hz', s: '', r: 'vibration' },
    { t: '振动传递到结构', a: '', c: 'vib', d: '设备振动经基础、楼板以结构声形式传播，需同时考虑隔振与浮筑。', f: '—', u: '—', s: '', r: 'insdesign' },

    /* ============================ 8 电声与音频 ============================ */
    { t: '灵敏度', a: 'SPL/2.83V/1m', c: 'audio', d: '扬声器在 1 m 处、2.83 V（8 Ω 时 1 W）激励下的输出声压级，是功率估算的基础。', f: 'Lp = 灵敏(dB) + 10·lg(P)', u: 'dB', s: '', r: 'audiolevel' },
    { t: '电功率与声压级', a: '', c: 'audio', d: '功率翻倍 +3 dB；功放需求按目标声级与灵敏度、距离反推。', f: 'Lp = Sens + 10·lg(P) − 20·lg(r)', u: 'dB', s: '', r: 'audiolevel' },
    { t: '分贝与电压比', a: 'dBu / dBV', c: 'audio', d: '专业音频以 0.775 V（dBu）或 1 V（dBV）为基准；dBFS 以满量程为 0。', f: 'dBu = 20·lg(U/0.775)，dBFS = 20·lg(U/U_fs)', u: 'dB', s: '', r: 'audiolevel' },
    { t: '阻抗与桥接', a: '', c: 'audio', d: '功放额定负载阻抗下输出功率；多只并联阻抗下降、需功放可承受。', f: 'Z并 = 1 / Σ(1/Zᵢ)', u: 'Ω', s: '', r: 'audiolevel' },
    { t: '线材阻尼系数', a: 'DF', c: 'audio', d: '功放输出阻抗与线阻之比，影响低频控制力。', f: 'DF = Z_load / Z_out', u: '—', s: '', r: 'audiolevel' },
    { t: 'Thiele-Small 参数', a: 'T/S', c: 'audio', d: '描述扬声器单元低频特性的小信号参数集（Qts、Vas、Fs 等），是箱体设计的输入。', f: 'Qts = Qms·Qes / (Qms + Qes)', u: '—', s: '', r: 'speakerbox' },
    { t: '封闭箱', a: '', c: 'audio', d: '二阶系统，箱体容积决定低频下限与 Qtc（0.707 为最大平坦）。', f: 'fc = Fs·√(1 + Vas/Vb)', u: 'Hz', s: '', r: 'speakerbox' },
    { t: '倒相箱', a: '', c: 'audio', d: '四阶系统，导风管在 fb 附近反相辐射，低频下限更低但存在群延迟。', f: 'fb = (c/2π)·√(S / (Vb·L_eff))', u: 'Hz', s: '', r: 'speakerbox' },
    { t: '分频器', a: '', c: 'audio', d: '按阶数与分频点计算 LC 网络，兼有阻抗补偿（Zobel）与灵敏度匹配（L-pad）。', f: '1 阶：f = 1/(2π√(LC))', u: 'Hz', s: '', r: 'crossover' },
    { t: '线阵列波瓣与栅瓣', a: '', c: 'audio', d: '阵元间距大于半波长时出现栅瓣，指向性劣化；近远场过渡距离与阵列长度、频率相关。', f: '栅瓣条件：d > λ / (1 + |sinθ|)', u: '—', s: '', r: 'linearray' },
    { t: '声源指向性指数', a: 'DI / Q', c: 'audio', d: '某方向声强与全向平均之比的分贝值；Q 为指向性因数，Q = 10^(DI/10)。', f: 'DI = 10·lg(4π / ∮D²dΩ)；单极子 0、偶极子 4.77 dB', u: 'dB', s: '', r: 'sim-radiation' },
    { t: '麦克风阵列波束', a: '', c: 'audio', d: '延时求和波束形成，阵列增益与阵元数、间距和目标频率相关。', f: 'B(θ) = |Σ wᵢ·e^(−jk·dᵢ·sinθ)|', u: '—', s: '', r: 'sim-micarray' },

    /* ============================ 9 职业健康 ============================ */
    { t: '8 小时等效声级', a: 'L_EX,8h', c: 'occ', d: '把整班各时段噪声按能量归一到 8 h 的等效声级，是职业卫生判定与作业分级的量。', f: 'LEX,8h = 10·lg[(Σ tᵢ·10^(0.1Lᵢ)) / 8]', u: 'dB(A)', s: 'GBZ 2.2-2007', r: 'exposure' },
    { t: '噪声暴露剂量', a: 'D', c: 'occ', d: '各时段实测时长占该声级允许时长之比的和，乘 100 得百分比。', f: 'D = 100·Σ (tᵢ / Tᵢ)', u: '%', s: 'NIOSH / OSHA', r: 'exposure' },
    { t: '8 小时时权平均', a: 'TWA', c: 'occ', d: '以 8 h 为基准的时权平均声级，与剂量可互换。', f: 'TWA = 10·lg[(D/100)·10^(0.1·基准)]', u: 'dB(A)', s: 'OSHA 1910.95', r: 'exposure' },
    { t: '允许暴露时间', a: 'T', c: 'occ', d: '按交换率 q 与基准声级 L₀ 由声级反解的可暴露时长。', f: 'T = 8 / 2^((L − L₀)/q)', u: 'h', s: 'NIOSH 98-126', r: 'exposure' },
    { t: '交换率', a: 'q', c: 'occ', d: '声级每增加 q dB 允许时长减半；NIOSH 采用 3 dB、OSHA 采用 5 dB。', f: 'q = 3 dB (NIOSH) / 5 dB (OSHA)', u: 'dB', s: '', r: 'exposure' },
    { t: '职业接触限值', a: 'OEL', c: 'occ', d: '工作场所噪声职业接触限值：LEX,8h 为 85 dB(A)，超过须采取措施。', f: '限值 85 dB(A)，行动水平常取 80 dB(A)', u: 'dB(A)', s: 'GBZ 2.2-2007', r: 'exposure' },
    { t: '脉冲噪声峰值限值', a: '', c: 'occ', d: '按每日脉冲次数规定峰值声压级限值，次数越多允许峰值越低。', f: '140 dB（≤100 次）→ 113 dB（>10000 次）', u: 'dB', s: 'GBZ 2.2-2007', r: 'exposure' },
    { t: '噪声作业分级', a: '', c: 'occ', d: '按 LEX,8h 分 I~IV 级管理，用于危害告知与健康监护频次确定。', f: 'I 85 / II 90 / III 95 / IV 100 dB 分界', u: 'dB(A)', s: 'GBZ/T 229.4-2012', r: 'exposure' },
    { t: 'NRR 与降噪值', a: 'NRR / SNR', c: 'occ', d: '护听器标称降噪值；现场实际降噪低于标称，须折减（NIOSH 按型 25/50/70%）。', f: '实际降噪 ≈ NRR×折减；SNR 法 L_A = L_C − SNR', u: 'dB', s: 'NIOSH 98-126 / ISO 4869-2', r: 'exposure' },
    { t: '听力保护计划', a: 'HCP', c: 'occ', d: '含噪声监测、工程控制、护听器配备、听力测试与培训的完整制度。', f: '—', u: '—', s: 'GBZ 1 / ISO 1999', r: 'exposure' }
  ];

  function all() { return ENTRIES; }

  function byCat(id) {
    return ENTRIES.filter(function (e) { return e.c === id; });
  }

  function catName(id) {
    for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === id) { return CATS[i].name; } }
    return id;
  }

  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // 检索：多关键词（空格分隔）全部命中的条目；opt.cat 限定分类
  // 命中优先级：术语名 > 缩写 > 公式 > 说明
  function search(q, opt) {
    opt = opt || {};
    var nq = normalize(q);
    var pool = opt.cat ? byCat(opt.cat) : ENTRIES.slice();
    if (!nq) { return pool; }
    var words = nq.split(' ').filter(Boolean);
    var hits = [];
    pool.forEach(function (e) {
      var t = normalize(e.t), a = normalize(e.a), f = normalize(e.f), d = normalize(e.d);
      var score = 0, matchedAll = true;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], s = 0;
        if (t.indexOf(w) >= 0) { s += 8; }
        if (a && a.indexOf(w) >= 0) { s += 6; }
        if (f && f.indexOf(w) >= 0) { s += 4; }
        if (d.indexOf(w) >= 0) { s += 2; }
        if (!s) { matchedAll = false; break; }
        score += s;
      }
      if (matchedAll) {
        if (t === nq) { score += 20; }
        else if (t.indexOf(nq) === 0) { score += 10; }
        hits.push({ e: e, score: score });
      }
    });
    hits.sort(function (x, y) { return y.score - x.score; });
    return hits.map(function (h) { return h.e; });
  }

  function stats() {
    var per = {};
    CATS.forEach(function (c) { per[c.id] = 0; });
    ENTRIES.forEach(function (e) { per[e.c] = (per[e.c] || 0) + 1; });
    return { cats: CATS.length, entries: ENTRIES.length, perCat: per };
  }

  // 检索建议词（术语名缩写，按分类顺序，最多 n 个）
  function suggest(q) {
    var n = 8;
    return search(q).slice(0, n).map(function (e) { return e.t; });
  }

  return {
    CATS: CATS,
    ENTRIES: ENTRIES,
    all: all,
    byCat: byCat,
    catName: catName,
    normalize: normalize,
    search: search,
    stats: stats,
    suggest: suggest
  };
});
