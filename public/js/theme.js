/*
 * theme.js — 日间 / 夜间模式切换
 *
 * 主题策略（与 css/styles.css 中的令牌选择器配合）：
 *   - 默认跟随系统偏好（prefers-color-scheme: dark）；
 *   - 用户首次点击后，将选择写入 localStorage，此后以用户选择为准；
 *   - 若用户从未手动选择，系统主题变化时自动跟随。
 *
 * CSS 选择器约定：
 *   :root:not([data-theme="light"])  —— 系统暗色（未手动选浅色时生效）
 *   :root[data-theme="dark"]          —— 手动/系统暗色
 *   :root[data-theme="light"]         —— 手动浅色（强制覆盖）
 * 本脚本在初始化时总是给 <html> 显式打上 data-theme，避免图标与真实主题错位。
 */
(function () {
  'use strict';

  var KEY = 'acoustic-theme';
  var root = document.documentElement;

  function systemPref() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function current() {
    var v = root.getAttribute('data-theme');
    return (v === 'dark' || v === 'light') ? v : systemPref();
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    /* 同步浏览器地址栏 / PWA 标题栏颜色 */
    var mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', theme === 'dark' ? '#0b1017' : '#2563eb');
    var btn = document.getElementById('themeToggle');
    if (btn) {
      var dark = theme === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.title = dark ? '切换到日间模式' : '切换到夜间模式';
    }
    /* 通知画布类组件立即按新主题重绘（在 View Transition 快照前同步执行） */
    try {
      document.dispatchEvent(new CustomEvent('acousticthemechange', { detail: { theme: theme } }));
    } catch (e) { /* 老浏览器忽略 */ }
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  /*
   * 圆形揭示切换：以点击位置为圆心，用 View Transitions 的 clip-path 动画
   * 把新主题「扩散」到全屏。浏览器不支持 startViewTransition 时静默降级。
   */
  function applyWithReveal(next, evt) {
    if (!document.startViewTransition || prefersReducedMotion()) {
      apply(next);
      return;
    }
    var btn = document.getElementById('themeToggle');
    var rect = (btn || root).getBoundingClientRect();
    var keyboard = !evt || evt.detail === 0 || evt.clientX == null;
    var x = keyboard ? rect.left + rect.width / 2 : evt.clientX;
    var y = keyboard ? rect.top + rect.height / 2 : evt.clientY;
    var radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    root.style.setProperty('--uik-theme-x', x + 'px');
    root.style.setProperty('--uik-theme-y', y + 'px');
    root.style.setProperty('--uik-theme-r', Math.ceil(radius) + 'px');

    var transition;
    try {
      transition = document.startViewTransition(function () { apply(next); });
    } catch (e) {
      apply(next);
      return;
    }
    transition.finished.finally(function () {
      root.style.removeProperty('--uik-theme-x');
      root.style.removeProperty('--uik-theme-y');
      root.style.removeProperty('--uik-theme-r');
    });
  }

  function init() {
    var s = stored();
    apply((s === 'dark' || s === 'light') ? s : systemPref());

    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', function (e) {
        var next = current() === 'dark' ? 'light' : 'dark';
        applyWithReveal(next, e);
        try { localStorage.setItem(KEY, next); } catch (err) {}
      });
    }

    // 未手动选择时，跟随系统主题变化
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function (e) {
        var sv = stored();
        if (sv !== 'dark' && sv !== 'light') apply(e.matches ? 'dark' : 'light');
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
