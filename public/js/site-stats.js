/*
 * site-stats.js — 页脚「访客统计 + 建站运营天数」
 *
 * 访客统计：异步加载 Vercount（busuanzi 兼容契约，Cloudflare CDN，
 *   国内访问稳定），由其写入 #busuanzi_value_site_pv / #busuanzi_value_site_uv；
 *   若 7s 内未取到数据（脚本被拦截 / 接口不可达），回退为 localStorage
 *   本机访问计数，并以 title 注明，避免把本机次数误显示为全站访问量。
 *
 * 建站天数：以 SITE_START 为建站日，含当天计为第 1 天。
 */
(function () {
  'use strict';

  // 2026-07-13 建站（月份从 0 起，6 = 七月）
  var SITE_START = new Date(2026, 6, 13);

  var daysEl = document.getElementById('statDays');
  if (daysEl) {
    var days = Math.floor((Date.now() - SITE_START.getTime()) / 86400000) + 1;
    if (days < 1) days = 1;
    daysEl.textContent = days;
    daysEl.title = '本站建于 2026-07-13，今天是第 ' + days + ' 天';
  }

  // ------------------------------ 访客统计 ------------------------------
  var pvEl = document.getElementById('busuanzi_value_site_pv');
  var uvEl = document.getElementById('busuanzi_value_site_uv');
  if (!pvEl || !uvEl) return;

  function isNum(el) { return !!(el && /^\d+$/.test((el.textContent || '').trim())); }

  function localFallback() {
    if (isNum(pvEl)) return; // 在线计数已就位，不回退
    var n = 1;
    try {
      n = (parseInt(localStorage.getItem('ac_local_visits') || '0', 10) || 0) + 1;
      localStorage.setItem('ac_local_visits', String(n));
    } catch (e) { /* 隐私模式等场景静默降级为 1 */ }
    var wrapPv = document.getElementById('fsPv');
    var wrapUv = document.getElementById('fsUv');
    if (wrapPv) {
      wrapPv.innerHTML = '本机访问 <b>' + n + '</b> 次';
      wrapPv.title = '在线计数服务暂未响应，当前显示本机访问次数';
    }
    if (wrapUv) wrapUv.style.display = 'none';
  }

  setTimeout(localFallback, 7000);
})();
