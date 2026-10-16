/*
 * router.js — 极简哈希路由：负责模块（视图）切换与首次挂载
 * 路由表：
 *   #/              总览
 *   #/noise         背景噪声评价（1/1 倍频程）        #third 兼容 1/3 倍频程
 *   #/levels        声压级叠加计算
 *   #/perforation   穿孔率计算
 *   #/absorber      多孔吸声材料阻抗
 *   #/rt60          室内混响时间
 *   #/stc           墙体隔声量
 *   #/barrier       声屏障衰减
 *   #/vibration     弹簧减振器隔振效率
 *   #/muffler       消声器计算
 *   #/env           环境声学评价
 *   #/psycho        心理声学/声品质
 *   #/vibeval       振动评价
 *   #/roomq         厅堂与扩声音质
 *   #/iso3382       厅堂音质参数量测（ISO 3382）
 *   #/sim           室内音质模拟（几何声学）
 *   #/sim-*         声学模拟器（10 个动态演示：共鸣器/行波/频谱/消声/FXLMS 等）
 */
(function () {
  'use strict';

  var VIEWS = {
    home: 'view-home',
    noise: 'view-noise',
    levels: 'view-levels',
    perforation: 'view-perforation',
    absorber: 'view-absorber',
    rt60: 'view-rt60',
    stc: 'view-stc',
    barrier: 'view-barrier',
    vibration: 'view-vibration',
    muffler: 'view-muffler',
    db: 'view-db',
    env: 'view-env',
    psycho: 'view-psycho',
    vibeval: 'view-vibeval',
    roomq: 'view-roomq',
    iso3382: 'view-iso3382',
    smallroom: 'view-smallroom',
    absdesign: 'view-absdesign',
    insdesign: 'view-insdesign',
    hvacnoise: 'view-hvacnoise',
    pasystem: 'view-pasystem',
    speakerbox: 'view-speakerbox',
    crossover: 'view-crossover',
    linearray: 'view-linearray',
    audiolevel: 'view-audiolevel',
    spectrum: 'view-spectrum',
    diffuser: 'view-diffuser',
    hearing: 'view-hearing',
    wave: 'view-wave',
    noisemap: 'view-noisemap',
    sim: 'view-sim',
    simfx: 'view-simfx',
    aural: 'view-aural',
    'sim-helmholtz': 'view-sim-helmholtz',
    'sim-impedance': 'view-sim-impedance',
    'sim-octave': 'view-sim-octave',
    'sim-hvac': 'view-sim-hvac',
    'sim-fxlms': 'view-sim-fxlms',
    'sim-drone': 'view-sim-drone',
    'sim-micarray': 'view-sim-micarray',
    'sim-wedge': 'view-sim-wedge',
    'sim-tube': 'view-sim-tube',
    'sim-echo': 'view-sim-echo'
  };

  var TITLES = {
    home: '声学计算工具箱 · Acoustic Toolbox',
    noise: '背景噪声评价 · 声学计算工具箱',
    levels: '声压级叠加计算 · 声学计算工具箱',
    perforation: '穿孔率计算 · 声学计算工具箱',
    absorber: '多孔吸声材料阻抗 · 声学计算工具箱',
    rt60: '室内混响时间 RT60 · 声学计算工具箱',
    stc: '墙体隔声量 STC · 声学计算工具箱',
    barrier: '声屏障衰减计算 · 声学计算工具箱',
    vibration: '弹簧减振（隔振效率计算书） · 声学计算工具箱',
    muffler: '消声器计算 · 声学计算工具箱',
    db: '单位与换算 · 声学计算工具箱',
    env: '环境声学评价 · 声学计算工具箱',
    psycho: '心理声学/声品质 · 声学计算工具箱',
    vibeval: '振动评价 · 声学计算工具箱',
    roomq: '厅堂与扩声音质 · 声学计算工具箱',
    iso3382: '厅堂音质参数 · 声学计算工具箱',
    smallroom: '小房间与室内声场 · 声学计算工具箱',
    absdesign: '吸声结构设计 · 声学计算工具箱',
    insdesign: '隔声与撞击声进阶 · 声学计算工具箱',
    hvacnoise: '设备与管道声学 · 声学计算工具箱',
    pasystem: '电声与语言清晰度 · 声学计算工具箱',
    speakerbox: '扬声器箱体设计 · 声学计算工具箱',
    crossover: '分频器设计 · 声学计算工具箱',
    linearray: '线阵列覆盖设计 · 声学计算工具箱',
    audiolevel: '音频电平与阻抗 · 声学计算工具箱',
    spectrum: '频谱分析与计权 · 声学计算工具箱',
    diffuser: '扩散体设计 · 声学计算工具箱',
    hearing: '听觉与听阈 · 声学计算工具箱',
    wave: '波动与乐音计算 · 声学计算工具箱',
    noisemap: '环境噪声进阶 · 声学计算工具箱',
    sim: '室内音质模拟彩图 · 声学计算工具箱',
    simfx: '声场粒子动画 · 声学计算工具箱',
    aural: '声学可听化 · 声学计算工具箱',
    'sim-helmholtz': '亥姆霍兹共鸣器模拟器 · 声学计算工具箱',
    'sim-impedance': '声阻抗反射/透射模拟器 · 声学计算工具箱',
    'sim-octave': '倍频程频谱模拟器 · 声学计算工具箱',
    'sim-hvac': 'HVAC 消声器模拟器 · 声学计算工具箱',
    'sim-fxlms': '主动降噪 FXLMS 模拟器 · 声学计算工具箱',
    'sim-drone': '无人机噪声模拟器 · 声学计算工具箱',
    'sim-micarray': '麦克风阵列波束模拟器 · 声学计算工具箱',
    'sim-wedge': '消声室吸声楔模拟器 · 声学计算工具箱',
    'sim-tube': '声阻抗管模拟器 · 声学计算工具箱',
    'sim-echo': '回声测距模拟器 · 声学计算工具箱'
  };

  // 视图挂载器（首次进入时初始化，之后仅刷新）
  var MOUNTS = [
    { route: 'noise', get: function () { return window.NoiseView; } },
    { route: 'levels', get: function () { return window.LevelsView; } },
    { route: 'perforation', get: function () { return window.PerforationView; } },
    { route: 'absorber', get: function () { return window.AbsorberView; } },
    { route: 'rt60', get: function () { return window.Rt60View; } },
    { route: 'stc', get: function () { return window.StcView; } },
    { route: 'barrier', get: function () { return window.BarrierView; } },
    { route: 'vibration', get: function () { return window.VibrationView; } },
    { route: 'muffler', get: function () { return window.MufflerView; } },
    { route: 'db', get: function () { return window.DbCalcView; } },
    { route: 'env', get: function () { return window.EnvView; } },
    { route: 'psycho', get: function () { return window.PsyView; } },
    { route: 'vibeval', get: function () { return window.VibEvalView; } },
    { route: 'roomq', get: function () { return window.RoomQView; } },
    { route: 'iso3382', get: function () { return window.Iso3382View; } },
    { route: 'smallroom', get: function () { return window.SmallRoomView; } },
    { route: 'absdesign', get: function () { return window.AbsDesignView; } },
    { route: 'insdesign', get: function () { return window.InsDesignView; } },
    { route: 'hvacnoise', get: function () { return window.HvacNoiseView; } },
    { route: 'pasystem', get: function () { return window.PaSystemView; } },
    { route: 'speakerbox', get: function () { return window.SpeakerBoxView; } },
    { route: 'crossover', get: function () { return window.CrossoverView; } },
    { route: 'linearray', get: function () { return window.LineArrayView; } },
    { route: 'audiolevel', get: function () { return window.AudioLevelView; } },
    { route: 'spectrum', get: function () { return window.SpectrumView; } },
    { route: 'diffuser', get: function () { return window.DiffuserView; } },
    { route: 'hearing', get: function () { return window.HearingView; } },
    { route: 'wave', get: function () { return window.WaveView; } },
    { route: 'noisemap', get: function () { return window.NoiseMapView; } },
    { route: 'sim', get: function () { return window.SimView; } },
    { route: 'simfx', get: function () { return window.SimFxView; } },
    { route: 'aural', get: function () { return window.AuralView; } },
    { route: 'sim-helmholtz', get: function () { return window.SimHelmholtzView; } },
    { route: 'sim-impedance', get: function () { return window.SimImpedanceView; } },
    { route: 'sim-octave', get: function () { return window.SimOctaveView; } },
    { route: 'sim-hvac', get: function () { return window.SimHvacView; } },
    { route: 'sim-fxlms', get: function () { return window.SimFxlmsView; } },
    { route: 'sim-drone', get: function () { return window.SimDroneView; } },
    { route: 'sim-micarray', get: function () { return window.SimMicarrayView; } },
    { route: 'sim-wedge', get: function () { return window.SimWedgeView; } },
    { route: 'sim-tube', get: function () { return window.SimTubeView; } },
    { route: 'sim-echo', get: function () { return window.SimEchoView; } }
  ];

  function parse() {
    var raw = (location.hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (raw === 'third' || raw === 'noise-third') return { route: 'noise', mode: 'third' };
    if (Object.prototype.hasOwnProperty.call(VIEWS, raw)) return { route: raw };
    return { route: 'home' };
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

  function activate(route, mode) {
    MOUNTS.forEach(function (m) {
      if (m.route !== route) return;
      var view = m.get();
      if (!view) return;
      view.init(mode);
      view.onShow();
    });
  }

  function apply(first) {
    var r = parse();
    show(r.route, first);
    activate(r.route, r.mode);
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

  window.AppRouter = { apply: apply, parse: parse, routes: Object.keys(VIEWS) };
})();
