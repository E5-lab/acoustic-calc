/*
 * share.js — 平台级分享能力（#/xxx?k=v 深链）
 *
 * 依赖：window.UrlState（urlstate.js，可选）、window.AppRouter（router.js，可选）
 *
 * 提供：
 *   AppShare.copy(text)                 → Promise，写入剪贴板（含 execCommand 回退）
 *   AppShare.currentLink()              → { url, tooLong }  当前页完整 URL（含 hash 与参数）
 *   AppShare.link(route, params)        → { url, tooLong }  指定路由 + 参数的分享链接
 *   AppShare.toast(msg, kind)           → 轻量提示（kind: 'ok' | 'warn'）
 *   AppShare.bind(btn)                  → 绑定按钮点击 → 复制当前链接
 *
 * 顶栏 #shareBtn 自动绑定；无该按钮时静默跳过。
 */
(function () {
  'use strict';

  var TOAST_ID = 'appShareToast';

  function baseUrl() {
    return location.origin + location.pathname + location.search;
  }

  function copy(text) {
    text = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText && location.protocol !== 'file:') {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      var okFlag = false;
      try {
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        okFlag = document.execCommand('copy');
      } catch (e) { okFlag = false; }
      document.body.removeChild(ta);
      if (okFlag) { resolve(); } else { reject(new Error('copy failed')); }
    });
  }

  function currentLink() {
    var url = location.href;
    return { url: url, tooLong: url.length > (window.UrlState ? window.UrlState.MAX_LEN : 1800) };
  }

  function link(route, params) {
    if (window.AppRouter && typeof window.AppRouter.link === 'function') {
      return window.AppRouter.link(route, params);
    }
    if (window.UrlState && typeof window.UrlState.buildLink === 'function') {
      return window.UrlState.buildLink(baseUrl(), route, params);
    }
    return { url: baseUrl() + '#/' + route, tooLong: false };
  }

  function toast(msg, kind) {
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(8px);' +
        'z-index:9999;padding:9px 16px;border-radius:9px;font-size:13px;line-height:1.4;' +
        'background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--line,#ddd);' +
        'box-shadow:0 8px 26px rgba(0,0,0,.16);opacity:0;pointer-events:none;' +
        'transition:opacity .18s ease, transform .18s ease;max-width:80vw;text-align:center';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.borderColor = kind === 'warn' ? 'var(--warn,#c60)' : 'var(--line,#ddd)';
    el.style.color = kind === 'warn' ? 'var(--warn,#c60)' : 'var(--text,#111)';
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(8px)';
    }, 1900);
  }

  function bind(btn) {
    if (!btn || btn._shareBound) { return; }
    btn._shareBound = true;
    btn.addEventListener('click', function () {
      var l = currentLink();
      copy(l.url).then(function () {
        toast(l.tooLong ? '链接已复制（较长，部分平台可能截断）' : '分享链接已复制到剪贴板', l.tooLong ? 'warn' : 'ok');
      }).catch(function () {
        toast('复制失败，请手动复制地址栏链接', 'warn');
      });
    });
  }

  function boot() {
    bind(document.getElementById('shareBtn'));
  }

  window.AppShare = { copy: copy, currentLink: currentLink, link: link, toast: toast, bind: bind };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
