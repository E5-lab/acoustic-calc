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
  }

  function init() {
    var s = stored();
    apply((s === 'dark' || s === 'light') ? s : systemPref());

    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
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
