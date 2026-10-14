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
    vibration: 'view-vibration'
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
    vibration: '弹簧减振（隔振效率计算书） · 声学计算工具箱'
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
    { route: 'vibration', get: function () { return window.VibrationView; } }
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
