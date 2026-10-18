/*
 * router.js — 极简哈希路由：负责模块（视图）切换与首次挂载
 *
 * 单一数据源 ROUTES：每个路由只在一处登记 { view, title, mount? }，
 * 由它派生 VIEWS（route→view-id）、TITLES（route→标题）、MOUNTS（route→挂载器）。
 * 新增模块只需在 ROUTES 里加一条，无需再同步三张表。
 *
 * 路由表：
 *   #/              总览
 *   #/noise         背景噪声评价（1/1 倍频程）        #third 兼容 1/3 倍频程
 *   #/levels        声压级叠加计算
 *   #/perforation   穿孔率计算
 *   #/absorber      多孔吸声材料阻抗
 *   #/rt60          室内混响时间
 *   #/stc           墙体隔声量
 *   #/leakage       孔洞缝隙与门窗隔声
 *   #/barrier       声屏障衰减
 *   #/handbook      公式与术语手册（#/handbook?q=…&cat=…）
 *   #/vibration     弹簧减振器隔振效率
 *   #/muffler       消声器计算
 *   #/env           环境声学评价
 *   #/exposure      职业噪声暴露量
 *   #/psycho        心理声学/声品质
 *   #/vibeval       振动评价
 *   #/roomq         厅堂与扩声音质
 *   #/iso3382       厅堂音质参数量测（ISO 3382）
 *   #/sim           室内音质模拟（几何声学）
 *   #/sim-*         声学模拟器（14 个动态演示：共鸣器/行波/频谱/消声/FXLMS/干涉/气泡等）
 *
 * 深链参数：任何路由都可追加 query，如 #/leakage?wall=3&hole=1
 *   - 参数由 window.UrlState 解析（urlstate.js），以 params 对象交给 view.init(mode, params) 与 view.onShow(params)
 *   - 视图可调用 window.AppRouter.hash(route, params) / .link(route, params) / .go(route, params) 生成或跳转分享链接
 */
(function () {
  'use strict';

  // —— 单一数据源：每个路由一处登记。mount 为对应视图挂载器的全局名（home/all 无挂载器）——
  var ROUTES = {
    home: { view: 'view-home', title: '声学计算工具箱 · Acoustic Toolbox' },
    noise: { view: 'view-noise', title: '背景噪声评价 · 声学计算工具箱', mount: 'NoiseView' },
    levels: { view: 'view-levels', title: '声压级叠加计算 · 声学计算工具箱', mount: 'LevelsView' },
    perforation: { view: 'view-perforation', title: '穿孔率计算 · 声学计算工具箱', mount: 'PerforationView' },
    absorber: { view: 'view-absorber', title: '多孔吸声材料阻抗 · 声学计算工具箱', mount: 'AbsorberView' },
    rt60: { view: 'view-rt60', title: '室内混响时间 RT60 · 声学计算工具箱', mount: 'Rt60View' },
    stc: { view: 'view-stc', title: '墙体隔声量 STC · 声学计算工具箱', mount: 'StcView' },
    leakage: { view: 'view-leakage', title: '孔洞缝隙与门窗隔声 · 声学计算工具箱', mount: 'LeakageView' },
    impact: { view: 'view-impact', title: '撞击声隔声评价 · 声学计算工具箱', mount: 'ImpactView' },
    barrier: { view: 'view-barrier', title: '声屏障衰减计算 · 声学计算工具箱', mount: 'BarrierView' },
    vibration: { view: 'view-vibration', title: '弹簧减振（隔振效率计算书） · 声学计算工具箱', mount: 'VibrationView' },
    muffler: { view: 'view-muffler', title: '消声器计算 · 声学计算工具箱', mount: 'MufflerView' },
    db: { view: 'view-db', title: '单位与换算 · 声学计算工具箱', mount: 'DbCalcView' },
    handbook: { view: 'view-handbook', title: '公式与术语手册 · 声学计算工具箱', mount: 'HandbookView' },
    env: { view: 'view-env', title: '环境声学评价 · 声学计算工具箱', mount: 'EnvView' },
    exposure: { view: 'view-exposure', title: '职业噪声暴露量 · 声学计算工具箱', mount: 'ExposureView' },
    psycho: { view: 'view-psycho', title: '心理声学/声品质 · 声学计算工具箱', mount: 'PsyView' },
    vibeval: { view: 'view-vibeval', title: '振动评价 · 声学计算工具箱', mount: 'VibEvalView' },
    roomq: { view: 'view-roomq', title: '厅堂与扩声音质 · 声学计算工具箱', mount: 'RoomQView' },
    iso3382: { view: 'view-iso3382', title: '厅堂音质参数 · 声学计算工具箱', mount: 'Iso3382View' },
    smallroom: { view: 'view-smallroom', title: '小房间与室内声场 · 声学计算工具箱', mount: 'SmallRoomView' },
    absdesign: { view: 'view-absdesign', title: '吸声结构设计 · 声学计算工具箱', mount: 'AbsDesignView' },
    insdesign: { view: 'view-insdesign', title: '隔声与撞击声进阶 · 声学计算工具箱', mount: 'InsDesignView' },
    hvacnoise: { view: 'view-hvacnoise', title: '设备与管道声学 · 声学计算工具箱', mount: 'HvacNoiseView' },
    pasystem: { view: 'view-pasystem', title: '电声与语言清晰度 · 声学计算工具箱', mount: 'PaSystemView' },
    speakerbox: { view: 'view-speakerbox', title: '扬声器箱体设计 · 声学计算工具箱', mount: 'SpeakerBoxView' },
    crossover: { view: 'view-crossover', title: '分频器设计 · 声学计算工具箱', mount: 'CrossoverView' },
    linearray: { view: 'view-linearray', title: '线阵列覆盖设计 · 声学计算工具箱', mount: 'LineArrayView' },
    audiolevel: { view: 'view-audiolevel', title: '音频电平与阻抗 · 声学计算工具箱', mount: 'AudioLevelView' },
    spectrum: { view: 'view-spectrum', title: '频谱分析与计权 · 声学计算工具箱', mount: 'SpectrumView' },
    diffuser: { view: 'view-diffuser', title: '扩散体设计 · 声学计算工具箱', mount: 'DiffuserView' },
    hearing: { view: 'view-hearing', title: '听觉与听阈 · 声学计算工具箱', mount: 'HearingView' },
    wave: { view: 'view-wave', title: '波动与乐音计算 · 声学计算工具箱', mount: 'WaveView' },
    noisemap: { view: 'view-noisemap', title: '环境噪声进阶 · 声学计算工具箱', mount: 'NoiseMapView' },
    emission: { view: 'view-emission', title: '环境噪声排放限值对照 · 声学计算工具箱', mount: 'EmissionView' },
    traffic: { view: 'view-traffic', title: '交通与航空噪声预测 · 声学计算工具箱', mount: 'TrafficView' },
    sim: { view: 'view-sim', title: '室内音质模拟彩图 · 声学计算工具箱', mount: 'SimView' },
    simfx: { view: 'view-simfx', title: '声场粒子动画 · 声学计算工具箱', mount: 'SimFxView' },
    aural: { view: 'view-aural', title: '声学可听化 · 声学计算工具箱', mount: 'AuralView' },
    'sim-helmholtz': { view: 'view-sim-helmholtz', title: '亥姆霍兹共鸣器模拟器 · 声学计算工具箱', mount: 'SimHelmholtzView' },
    'sim-impedance': { view: 'view-sim-impedance', title: '声阻抗反射/透射模拟器 · 声学计算工具箱', mount: 'SimImpedanceView' },
    'sim-octave': { view: 'view-sim-octave', title: '倍频程频谱模拟器 · 声学计算工具箱', mount: 'SimOctaveView' },
    'sim-hvac': { view: 'view-sim-hvac', title: 'HVAC 消声器模拟器 · 声学计算工具箱', mount: 'SimHvacView' },
    'sim-fxlms': { view: 'view-sim-fxlms', title: '主动降噪 FXLMS 模拟器 · 声学计算工具箱', mount: 'SimFxlmsView' },
    'sim-drone': { view: 'view-sim-drone', title: '无人机噪声模拟器 · 声学计算工具箱', mount: 'SimDroneView' },
    'sim-micarray': { view: 'view-sim-micarray', title: '麦克风阵列波束模拟器 · 声学计算工具箱', mount: 'SimMicarrayView' },
    'sim-wedge': { view: 'view-sim-wedge', title: '消声室吸声楔模拟器 · 声学计算工具箱', mount: 'SimWedgeView' },
    'sim-tube': { view: 'view-sim-tube', title: '声阻抗管模拟器 · 声学计算工具箱', mount: 'SimTubeView' },
    'sim-echo': { view: 'view-sim-echo', title: '回声测距模拟器 · 声学计算工具箱', mount: 'SimEchoView' },
    'sim-interference': { view: 'view-sim-interference', title: '双源声波干涉模拟器 · 声学计算工具箱', mount: 'SimInterferenceView' },
    'sim-bubble': { view: 'view-sim-bubble', title: '水下气泡共鸣模拟器 · 声学计算工具箱', mount: 'SimBubbleView' },
    'sim-refraction': { view: 'view-sim-refraction', title: '温度梯度声折射模拟器 · 声学计算工具箱', mount: 'SimRefractionView' },
    'sim-radiation': { view: 'view-sim-radiation', title: '声源辐射指向性模拟器 · 声学计算工具箱', mount: 'SimRadiationView' },
    splmeter: { view: 'view-splmeter', title: '声级计实测 · 声学计算工具箱', mount: 'SplMeterView' },
    rta: { view: 'view-rta', title: '实时频谱分析 RTA · 声学计算工具箱', mount: 'RtaView' },
    siggen: { view: 'view-siggen', title: '测量信号发生器 · 声学计算工具箱', mount: 'SigGenView' },
    irt60: { view: 'view-irt60', title: '混响时间 RT60 实测 · 声学计算工具箱', mount: 'IrT60View' },
    stipa: { view: 'view-stipa', title: '语言传输指数 STIPA 实测 · 声学计算工具箱', mount: 'StipaView' },
    'sim-sonar': { view: 'view-sim-sonar', title: '声呐方程模拟器 · 声学计算工具箱', mount: 'SimSonarView' },
    'sim-sea': { view: 'view-sim-sea', title: '统计能量分析模拟器 · 声学计算工具箱', mount: 'SimSeaView' },
    'sim-fourier': { view: 'view-sim-fourier', title: '傅里叶合成与频谱泄漏模拟器 · 声学计算工具箱', mount: 'SimFourierView' },
    'sim-ut': { view: 'view-sim-ut', title: '超声脉冲回波测厚模拟器 · 声学计算工具箱', mount: 'SimUtView' },
    all: { view: 'view-all', title: '全部工具 · 声学计算工具箱' }
  };

  // —— 由单一数据源派生三张表（保持运行时行为与原三表完全一致）——
  var VIEWS = {}, TITLES = {}, MOUNTS = [];
  Object.keys(ROUTES).forEach(function (r) {
    VIEWS[r] = ROUTES[r].view;
    TITLES[r] = ROUTES[r].title;
    if (ROUTES[r].mount) {
      MOUNTS.push({ route: r, get: (function (name) { return function () { return window[name]; }; })(ROUTES[r].mount) });
    }
  });

  // 解析当前 hash → { route, mode?, params }
  // 深链形如 #/leakage?wall=3&hole=1，参数解析委托给 UrlState（未加载时降级为忽略参数）
  function parse() {
    var U = window.UrlState;
    var path, params = {};
    if (U && typeof U.parseHash === 'function') {
      var r = U.parseHash(location.hash);
      path = r.path;
      params = r.params || {};
    } else {
      var raw = (location.hash || '').replace(/^#\/?/, '');
      var qi = raw.indexOf('?');
      if (qi >= 0) { raw = raw.slice(0, qi); }
      path = raw.replace(/\/+$/, '');
    }
    if (path === 'third' || path === 'noise-third') { return { route: 'noise', mode: 'third', params: params }; }
    if (Object.prototype.hasOwnProperty.call(VIEWS, path)) { return { route: path, params: params }; }
    return { route: 'home', params: params };
  }

  function show(route, first) {
    Object.keys(VIEWS).forEach(function (key) {
      var el = document.getElementById(VIEWS[key]);
      if (!el) return;
      el.classList.toggle('active', key === route);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mainnav a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === route);
    });
    // 同步二级菜单的分组高亮与展开状态（见 nav.js）
    if (window.AppNav && window.AppNav.syncActive) window.AppNav.syncActive(route);
    document.title = TITLES[route] || TITLES.home;
    if (!first) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function activate(route, mode, params) {
    MOUNTS.forEach(function (m) {
      if (m.route !== route) return;
      var view = m.get();
      if (!view) return;
      view.init(mode, params);
      view.onShow(params);
    });
  }

  function apply(first) {
    var r = parse();
    show(r.route, first);
    activate(r.route, r.mode, r.params);
    // 同路由下模式变化（#/noise → #/noise-third）
    if (!first && r.route === 'noise' && r.mode === 'third' && window.NoiseView) {
      window.NoiseView.setMode('third');
    }
  }

  function boot() {
    apply(true);
    window.addEventListener('hashchange', function () { apply(false); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 构造深链：AppRouter.hash('leakage', { wall: 3 }) → '#/leakage?wall=3'
  function hash(route, params) {
    var U = window.UrlState;
    if (U && typeof U.buildHash === 'function') { return U.buildHash(route, params); }
    var q = [];
    if (params) { Object.keys(params).forEach(function (k) { if (params[k] != null && params[k] !== '') { q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); } }); }
    return '#/' + route + (q.length ? '?' + q.join('&') : '');
  }

  // 当前页完整可分享链接
  function link(route, params) {
    var base = location.origin + location.pathname + location.search;
    var U = window.UrlState;
    if (U && typeof U.buildLink === 'function') { return U.buildLink(base, route, params); }
    return { url: base + hash(route, params), tooLong: false };
  }

  // 跳到某路由并带上参数（会触发 hashchange → apply）
  function go(route, params) {
    location.hash = hash(route, params);
  }

  window.AppRouter = {
    apply: apply, parse: parse, routes: Object.keys(VIEWS), titles: TITLES,
    hash: hash, link: link, go: go, current: function () { return parse(); }
  };
})();
