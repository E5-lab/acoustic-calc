/*
 * router.js — 极简哈希路由：负责模块（视图）切换与首次挂载
 * 路由表：
 *   #/              总览
 *   #/noise         背景噪声评价（默认 1/1 倍频程）
 *   #/noise-third   背景噪声评价（1/3 倍频程）  #third 为兼容旧链接
 *   #/perforation   穿孔率计算
 */
(function () {
  'use strict';

  var VIEWS = {
    home: 'view-home',
    noise: 'view-noise',
    perforation: 'view-perforation'
  };
  var TITLES = {
    home: '声学计算工具箱 · Acoustic Toolbox',
    noise: '背景噪声评价 · 声学计算工具箱',
    perforation: '穿孔率计算 · 声学计算工具箱'
  };

  var mounted = false;
  var current = null;

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
    document.title = TITLES[route] || TITLES.home;
    if (!first) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function apply(first) {
    var r = parse();
    show(r.route, first);

    if (r.route === 'noise' && window.NoiseView) {
      window.NoiseView.init(r.mode || 'octave');
      window.NoiseView.onShow();
    }
    if (r.route === 'perforation' && window.PerforationView) {
      window.PerforationView.init();
      window.PerforationView.onShow();
    }

    // 同路由但模式变化的场景（例如从 #/noise 切到 #/noise-third）
    if (!first && r.route === 'noise' && r.mode === 'third' && window.NoiseView) {
      window.NoiseView.setMode('third');
    }
    current = r.route;
  }

  function boot() {
    mounted = true;
    apply(true);
    window.addEventListener('hashchange', function () { apply(false); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.AppRouter = { apply: apply, current: function () { return current; }, mounted: function () { return mounted; } };
})();
