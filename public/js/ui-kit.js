/*
 * ui-kit.js — 复杂 UI 组件与交互效果（零依赖）
 * --------------------------------------------------------------------------
 * 提供：
 *   1) ⌘K / Ctrl+K 命令面板：模糊检索全部模块 + 快捷操作、键盘导航、最近使用
 *   2) Toast 通知队列：成功 / 提示 / 警告 / 错误，进度条、悬停暂停、自动堆叠
 *   3) Tooltip：data-tip 属性声明式提示，自动翻转与箭头定位
 *   4) 按钮涟漪、模块卡片 3D 聚光倾斜
 *   5) 结果数字滚动计数（MutationObserver，自动适配全部模块）
 *   6) 顶部阅读进度、滚动揭示
 *   7) 与 AppShare.toast 桥接，统一全站反馈样式
 *
 * 对外接口：window.UIK
 *   UIK.toast(opts | string)        UIK.ok(msg) / warn / error / info
 *   UIK.palette.open() / close() / toggle()
 *   UIK.tip.show(el) / hide()
 */
(function () {
  'use strict';

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* 忽略 */ }

  var finePointer = false;
  try {
    finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch (e) { /* 忽略 */ }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  var ICON = {
    module: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1.5l3-3a5 5 0 0 0-7.1-7.1L11.6 4.8"/><path d="M14 11a5 5 0 0 0-7.1-.5l-3 3a5 5 0 0 0 7.1 7.1l1.4-1.4"/></svg>',
    lab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.2L4.8 18a2.4 2.4 0 0 0 2.1 3.5h10.2a2.4 2.4 0 0 0 2.1-3.5L14 9.2V3"/><path d="M7.2 15h9.6"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M5 20h14"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h10v5"/><rect x="3.5" y="8" width="17" height="9" rx="2"/><path d="M7 17h10v4H7z"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="M6 11l6-6 6 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L21 19H3z"/><path d="M12 9v4.5"/><circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>'
  };

  /* ==========================================================================
     Toast 通知
     ========================================================================== */
  var toastHost = null;

  function ensureToastHost() {
    if (toastHost && toastHost.isConnected) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'uik-toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    toastHost.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function toast(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    opts = opts || {};
    var type = opts.type || 'info';
    var duration = opts.duration == null ? 4200 : opts.duration;
    var host = ensureToastHost();
    var icons = { ok: ICON.check, info: ICON.info, warn: ICON.warn, error: ICON.error };

    var node = document.createElement('div');
    node.className = 'uik-toast';
    node.dataset.type = type;
    node.innerHTML =
      '<span class="uik-toast-ico" aria-hidden="true">' + (icons[type] || ICON.info) + '</span>' +
      '<div class="uik-toast-body">' +
      (opts.title ? '<strong class="uik-toast-title">' + esc(opts.title) + '</strong>' : '') +
      '<p class="uik-toast-msg">' + esc(opts.message || '') + '</p>' +
      '</div>' +
      '<button class="uik-toast-x" type="button" aria-label="关闭通知">&#215;</button>' +
      '<span class="uik-toast-bar" aria-hidden="true"></span>';

    var bar = node.querySelector('.uik-toast-bar');
    var timer = null;
    var remaining = duration;
    var startedAt = 0;
    var leaving = false;

    if (duration > 0) {
      bar.style.animationDuration = duration + 'ms';
      start();
    } else {
      bar.style.display = 'none';
    }

    function start() {
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    }
    function pause() {
      if (timer) { clearTimeout(timer); timer = null; }
      remaining -= Date.now() - startedAt;
      if (remaining < 600) remaining = 600;
    }
    function resume() {
      if (leaving || duration <= 0) return;
      start();
    }
    function dismiss() {
      if (leaving) return;
      leaving = true;
      if (timer) clearTimeout(timer);
      node.classList.add('is-leaving');
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, reduceMotion ? 0 : 240);
    }

    node.querySelector('.uik-toast-x').addEventListener('click', dismiss);
    node.addEventListener('mouseenter', pause);
    node.addEventListener('mouseleave', resume);

    host.appendChild(node);

    // 最多同时 4 条，超出时先移除最旧一条
    var all = $$('.uik-toast', host);
    if (all.length > 4) {
      var oldest = all[0];
      if (oldest && oldest !== node) {
        oldest.classList.add('is-leaving');
        setTimeout(function () {
          if (oldest.parentNode) oldest.parentNode.removeChild(oldest);
        }, 240);
      }
    }
    return { dismiss: dismiss, el: node };
  }

  /* ==========================================================================
     Tooltip
     ========================================================================== */
  var tipEl = null;
  var tipTimer = null;
  var tipTarget = null;

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'uik-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function positionTip(target) {
    var tip = ensureTip();
    var r = target.getBoundingClientRect();
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var gap = 9;
    var pos = r.top - th - gap >= 8 ? 'top' : 'bottom';
    var top = pos === 'top' ? r.top - th - gap : r.bottom + gap;
    var x = clamp(r.left + r.width / 2 - tw / 2, 8, vw - tw - 8);
    tip.dataset.pos = pos;
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(clamp(top, 8, vh - th - 8)) + 'px';
    tip.style.setProperty('--uik-arrow-x', Math.round(clamp(r.left + r.width / 2 - x, 10, tw - 10)) + 'px');
  }

  function showTip(target) {
    if (!target || !target.getAttribute) return;
    var text = target.getAttribute('data-tip');
    if (!text) return;
    tipTarget = target;
    var tip = ensureTip();
    tip.textContent = text;
    positionTip(target);
    requestAnimationFrame(function () { tip.classList.add('is-in'); });
  }

  function hideTip() {
    tipTarget = null;
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    if (tipEl) tipEl.classList.remove('is-in');
  }

  function initTooltips() {
    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t || t === tipTarget) return;
      hideTip();
      tipTimer = setTimeout(function () { showTip(t); }, 180);
    });
    document.addEventListener('pointerout', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t) return;
      if (e.relatedTarget && t.contains(e.relatedTarget)) return;
      hideTip();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t) showTip(t);
    });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('pointerdown', hideTip, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideTip();
    });
    window.addEventListener('scroll', hideTip, true);
    window.addEventListener('resize', hideTip);
  }

  /* ==========================================================================
     按钮涟漪
     ========================================================================== */
  function initRipple() {
    if (reduceMotion) return;
    var SEL = '.btn, .mode-btn, .icon-btn, .theme-toggle, .uik-seg button, .uik-tabs button, .lab-back';
    document.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var t = e.target.closest ? e.target.closest(SEL) : null;
      if (!t) return;
      var rect = t.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2.1;
      var span = document.createElement('span');
      span.className = 'uik-ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';
      t.appendChild(span);
      span.addEventListener('animationend', function () {
        if (span.parentNode) span.parentNode.removeChild(span);
      });
    }, { passive: true });
  }

  /* ==========================================================================
     卡片 3D 聚光倾斜
     ========================================================================== */
  function initTilt() {
    if (reduceMotion || !finePointer) return;
    var SEL = '.module-card, .lab-tilt-card';

    function bind(card) {
      if (card.__uikTilt) return;
      card.__uikTilt = true;
      var frame = 0;
      var mx = 50, my = 50;

      function apply() {
        frame = 0;
        var r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var px = (mx / 100) - 0.5;
        var py = (my / 100) - 0.5;
        card.style.setProperty('--uik-mx', mx.toFixed(1) + '%');
        card.style.setProperty('--uik-my', my.toFixed(1) + '%');
        card.style.setProperty('--uik-rx', (-py * 4.2).toFixed(2) + 'deg');
        card.style.setProperty('--uik-ry', (px * 5.4).toFixed(2) + 'deg');
      }

      card.addEventListener('pointerenter', function () {
        card.classList.add('is-tilting');
      });
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        mx = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
        my = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
        if (!frame) frame = requestAnimationFrame(apply);
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('is-tilting');
        card.style.removeProperty('--uik-rx');
        card.style.removeProperty('--uik-ry');
      });
    }

    function scan() { $$(SEL).forEach(bind); }
    scan();
    // 首页卡片为静态 DOM，视图切换不会重建；此处仅兜底监听新增节点
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { scan(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ==========================================================================
     数字滚动计数
     ========================================================================== */
  var COUNTER_SEL = '.big, .hero-rate, .kv .v, .stat .s-value, .target-item .t-value, .result-line, .uik-ring-val';
  var numState = Object.create(null);
  var numStateCount = 0;
  var pendingHosts = [];
  var flushScheduled = false;

  function stateKey(host) {
    var idEl = host.closest('[id]');
    var base = idEl ? idEl.id : '';
    var cls = String(host.className || host.tagName).split(/\s+/)[0];
    var idx = 0;
    if (idEl && cls) {
      var sibs = idEl.querySelectorAll('.' + cls);
      idx = Array.prototype.indexOf.call(sibs, host);
    }
    return base + '|' + cls + '|' + idx;
  }

  function textNodes(host) {
    var out = [];
    var w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }

  function animateTextNode(node, from, to) {
    var raw = node.nodeValue || '';
    var m = raw.match(/-?\d+(?:\.\d+)?/);
    if (!m) return;
    var token = m[0];
    var decimals = (token.split('.')[1] || '').length;
    var prefix = raw.slice(0, m.index);
    var suffix = raw.slice(m.index + token.length);
    var start = performance.now();
    var dur = 480;
    node.__uikAnim = true;

    function frame(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var v = from + (to - from) * e;
      if (node.isConnected) node.nodeValue = prefix + v.toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(frame);
      else {
        if (node.isConnected) node.nodeValue = prefix + to.toFixed(decimals) + suffix;
        node.__uikAnim = false;
      }
    }
    requestAnimationFrame(frame);
  }

  function scanHost(host) {
    if (!host || !host.isConnected) return;
    if (host.closest('[hidden]')) return;
    if (host.offsetParent === null) return; // 当前视图不可见
    var nodes = textNodes(host);
    if (!nodes.length) return;

    var vals = nodes.map(function (n) {
      var m = (n.nodeValue || '').match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    });

    var key = stateKey(host);
    var prev = numState[key];
    if (!numState[key]) numStateCount++;
    numState[key] = vals;
    if (numStateCount > 600) { numState = Object.create(null); numStateCount = 0; }

    if (!prev || prev.length !== vals.length || reduceMotion) return;

    nodes.forEach(function (node, i) {
      var from = prev[i], to = vals[i];
      if (from == null || to == null) return;
      if (Math.abs(to - from) < 0.0001) return;
      if (node.__uikAnim) return;
      animateTextNode(node, from, to);
    });

    if (!reduceMotion) {
      host.classList.remove('uik-num-pop');
      void host.offsetWidth;
      host.classList.add('uik-num-pop');
      setTimeout(function () { host.classList.remove('uik-num-pop'); }, 360);
    }
  }

  function flushCounters() {
    flushScheduled = false;
    var list = pendingHosts;
    pendingHosts = [];
    list.forEach(scanHost);
  }

  function queueHost(host) {
    if (!host) return;
    if (pendingHosts.indexOf(host) < 0) pendingHosts.push(host);
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flushCounters);
    }
  }

  function initCounters() {
    if (!window.MutationObserver) return;
    var main = document.getElementById('main') || document.body;
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') {
          if (m.target.__uikAnim) return;
          var p = m.target.parentElement;
          if (p) queueHost(p.closest(COUNTER_SEL));
          return;
        }
        if (m.type !== 'childList') return;
        Array.prototype.forEach.call(m.addedNodes || [], function (n) {
          if (n.nodeType !== 1) return;
          var self = n.closest ? n.closest(COUNTER_SEL) : null;
          if (self) queueHost(self);
          if (n.querySelectorAll) {
            Array.prototype.forEach.call(n.querySelectorAll(COUNTER_SEL), queueHost);
          }
          // 数字所在容器的文本被整体替换（innerHTML 重绘）时，也回溯其父级计数器
          var parent = n.parentElement;
          if (parent) {
            var ph = parent.closest ? parent.closest(COUNTER_SEL) : null;
            if (ph) queueHost(ph);
          }
        });
      });
    });
    mo.observe(main, { childList: true, subtree: true, characterData: true });

    // 建立初始基线（不触发动画）
    $$(COUNTER_SEL).forEach(function (h) {
      if (h.offsetParent === null) return;
      var key = stateKey(h);
      var nodes = textNodes(h);
      numState[key] = nodes.map(function (n) {
        var m = (n.nodeValue || '').match(/-?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
      });
      numStateCount++;
    });
  }

  /* ==========================================================================
     顶部阅读进度
     ========================================================================== */
  function initProgress() {
    var bar = document.createElement('div');
    bar.className = 'uik-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<span></span>';
    document.body.appendChild(bar);
    var fill = bar.firstChild;
    var ticking = false;

    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ==========================================================================
     滚动揭示
     ========================================================================== */
  function initReveal() {
    if (reduceMotion || !window.IntersectionObserver) return;
    var targets = $$('#view-home .module-group, .lab-sec');
    if (!targets.length) return;
    targets.forEach(function (el, i) {
      el.classList.add('uik-reveal');
      el.style.setProperty('--uik-delay', ((i % 4) * 55) + 'ms');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ==========================================================================
     命令面板
     ========================================================================== */
  var RECENT_KEY = 'acoustic-cmdk-recent';
  var palette = {
    el: null,
    input: null,
    list: null,
    count: null,
    items: [],
    flat: [],
    cursor: 0,
    open: false,
    remoteLoaded: false,
    remoteLoading: false,
    lastFocus: null
  };

  function readRecents() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 6) : [];
    } catch (e) { return []; }
  }
  function pushRecent(id) {
    if (!id) return;
    try {
      var arr = readRecents().filter(function (x) { return x !== id; });
      arr.unshift(id);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 6)));
    } catch (e) { /* 忽略 */ }
  }

  function collectModules(root) {
    var items = [];
    var scope = root || document;
    var home = scope.getElementById ? scope.getElementById('view-home') : scope.querySelector('#view-home');
    if (!home) return items;
    $$('.module-group', home).forEach(function (g) {
      var gl = $('.group-label', g);
      var gname = gl ? gl.textContent.trim() : '模块';
      $$('.module-card', g).forEach(function (card) {
        var t = $('.mc-title', card);
        var title = '';
        if (t) {
          var clone = t.cloneNode(true);
          $$('.mc-tag', clone).forEach(function (x) { x.remove(); });
          title = clone.textContent.replace(/\s+/g, ' ').trim();
        }
        var d = $('.mc-desc', card);
        var route = (card.getAttribute('href') || '').replace(/^#\//, '');
        // 拼音 / 缩写别名（cmdk-aliases.js）与三级子功能（nav.js NAV_SUB）并入匹配域，
        // 使「hunjiao / rt60 / nc / Bonello」等词都能命中对应模块
        var alias = (window.UikAliases && window.UikAliases[route]) || '';
        var navSub = (window.NavSub && window.NavSub[route]) || [];
        items.push({
          id: route,
          kind: 'module',
          title: title,
          group: gname,
          sub: gname + (d ? ' · ' + d.textContent.replace(/\s+/g, ' ').trim().slice(0, 44) + '…' : ''),
          desc: d ? d.textContent : '',
          keys: alias + (navSub.length ? ' ' + navSub.join(' ') : ''),
          route: route,
          icon: 'module'
        });
      });
    });
    return items;
  }

  function buildActions() {
    return [
      {
        id: 'action:theme', kind: 'action', icon: 'theme',
        title: '切换日间 / 夜间模式', sub: '外观 · 主题切换（圆形揭示动效）',
        keys: 'theme dark light 夜间 日间 主题 深色 浅色 appearance',
        run: function () {
          var btn = document.getElementById('themeToggle');
          if (btn) btn.click();
        }
      },
      {
        id: 'action:share', kind: 'action', icon: 'share',
        title: '复制本页分享链接', sub: '分享 · 含当前模块与参数深链',
        keys: 'share link 分享 链接 复制 url',
        run: copyCurrentLink
      },
      {
        id: 'action:csv', kind: 'action', icon: 'export',
        title: '导出当前模块 CSV', sub: '导出 · 参数与结果三列输出',
        keys: 'csv export 导出 表格 excel',
        run: function () {
          var b = document.querySelector('.ex-item[data-ex="csv"]');
          if (b) b.click();
        }
      },
      {
        id: 'action:print', kind: 'action', icon: 'print',
        title: '打印 / 存为 PDF', sub: '导出 · 仅打印当前模块',
        keys: 'print pdf 打印 导出',
        run: function () {
          if (window.AppExport && AppExport.print) AppExport.print();
          else window.print();
        }
      },
      {
        id: 'action:lab', kind: 'action', icon: 'lab',
        title: '打开交互与组件实验室', sub: 'UI Kit · 复杂组件与动效演示',
        keys: 'ui lab kit 组件 交互 实验室 演示 demo',
        run: function () { location.href = 'ui-lab.html'; }
      },
      {
        id: 'action:top', kind: 'action', icon: 'top',
        title: '回到页面顶部', sub: '滚动 · 快速返回',
        keys: 'top scroll 顶部 回到 滚动',
        run: function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }
      }
    ];
  }

  function buildPaletteIndex(root) {
    return collectModules(root).concat(buildActions());
  }

  /*
   * 实验室等独立页面没有 #view-home，模块索引需要从 index.html 解析。
   * 同源 fetch + DOMParser，一次即可，失败时保留「操作」项。
   */
  function loadRemoteIndex() {
    if (palette.remoteLoaded || palette.remoteLoading) return;
    if (document.getElementById('view-home')) return;
    palette.remoteLoading = true;
    fetch('index.html').then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var modules = collectModules(doc);
      if (modules.length) {
        palette.items = modules.concat(buildActions());
        palette.remoteLoaded = true;
        if (palette.open) renderPalette();
      }
    }).catch(function () {
      /* 离线或 file:// 场景下静默降级为仅操作项 */
    }).then(function () {
      palette.remoteLoading = false;
    });
  }

  function copyCurrentLink() {
    var link = '';
    if (window.AppShare && AppShare.currentLink) link = AppShare.currentLink().url;
    else link = location.href;
    var done = function () { toast({ type: 'ok', title: '链接已复制', message: '可直接粘贴分享，参数状态一并保留。', duration: 2600 }); };
    var fail = function () { toast({ type: 'error', title: '复制失败', message: '浏览器拒绝了剪贴板访问，请手动复制地址栏链接。', duration: 4200 }); };
    if (window.AppShare && AppShare.copy) {
      AppShare.copy(link).then(done, fail);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done, fail);
    } else {
      fail();
    }
  }

  function scoreItem(item, q) {
    if (!q) return 0;
    var title = item.title.toLowerCase();
    var hay = (item.title + ' ' + (item.sub || '') + ' ' + (item.desc || '') + ' ' + (item.keys || '') + ' ' + (item.group || '')).toLowerCase();
    var idx = title.indexOf(q);
    if (idx === 0) return 1400;
    if (idx > 0) return 1100 - idx;
    idx = hay.indexOf(q);
    if (idx >= 0) return 700 - Math.min(300, idx);

    var ti = 0, s = 0, streak = 0;
    for (var i = 0; i < title.length && ti < q.length; i++) {
      if (title[i] === q[ti]) { s += 12 + streak * 6; streak++; ti++; }
      else streak = 0;
    }
    if (ti === q.length) return 360 + s;

    ti = 0; s = 0; streak = 0;
    for (var j = 0; j < hay.length && ti < q.length; j++) {
      if (hay[j] === q[ti]) { s += 6 + streak * 3; streak++; ti++; }
      else streak = 0;
    }
    return ti === q.length ? 120 + s : -1;
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    var lower = text.toLowerCase();
    var ql = q.toLowerCase();
    var idx = lower.indexOf(ql);
    if (idx >= 0) {
      return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + ql.length)) + '</mark>' + esc(text.slice(idx + ql.length));
    }
    var out = '';
    var qi = 0;
    var open = false;
    for (var i = 0; i < text.length; i++) {
      if (qi < ql.length && text[i].toLowerCase() === ql[qi]) {
        if (!open) { out += '<mark>'; open = true; }
        out += esc(text[i]);
        qi++;
      } else {
        if (open) { out += '</mark>'; open = false; }
        out += esc(text[i]);
      }
    }
    if (open) out += '</mark>';
    return qi === ql.length ? out : esc(text);
  }

  function buildPalette() {
    var wrap = document.createElement('div');
    wrap.className = 'uik-cmdk';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="uik-cmdk-backdrop" data-cmdk-close></div>' +
      '<div class="uik-cmdk-panel" role="dialog" aria-modal="true" aria-label="命令面板">' +
      '  <div class="uik-cmdk-search">' +
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4-4"/></svg>' +
      '    <input class="uik-cmdk-input" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="uikCmdList" aria-autocomplete="list" placeholder="搜索模块、公式或执行操作…" />' +
      '    <kbd class="uik-cmdk-esc">ESC</kbd>' +
      '  </div>' +
      '  <div class="uik-cmdk-list" id="uikCmdList" role="listbox" aria-label="搜索结果"></div>' +
      '  <div class="uik-cmdk-foot">' +
      '    <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>' +
      '    <span><kbd>↵</kbd> 打开</span>' +
      '    <span><kbd>esc</kbd> 关闭</span>' +
      '    <span class="uik-cmd-count"></span>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap);

    palette.el = wrap;
    palette.input = $('.uik-cmdk-input', wrap);
    palette.list = $('.uik-cmdk-list', wrap);
    palette.count = $('.uik-cmd-count', wrap);
    palette.items = buildPaletteIndex();

    wrap.addEventListener('pointerdown', function (e) {
      if (e.target.hasAttribute('data-cmdk-close')) closePalette();
    });
    palette.input.addEventListener('input', function () {
      palette.cursor = 0;
      renderPalette();
    });
    palette.list.addEventListener('pointermove', function (e) {
      var btn = e.target.closest ? e.target.closest('.uik-cmd-item') : null;
      if (!btn) return;
      var i = parseInt(btn.dataset.idx, 10);
      if (!isNaN(i) && i !== palette.cursor) setCursor(i, false);
    });
    palette.list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.uik-cmd-item') : null;
      if (!btn) return;
      runItem(parseInt(btn.dataset.idx, 10));
    });
  }

  function itemById(id) {
    for (var i = 0; i < palette.items.length; i++) {
      if (palette.items[i].id === id) return palette.items[i];
    }
    return null;
  }

  function renderPalette() {
    var q = palette.input.value.trim().toLowerCase();
    var groups = [];
    var flat = [];

    if (!q) {
      var recents = readRecents().map(itemById).filter(Boolean);
      if (recents.length) {
        groups.push({ name: '最近使用', icon: 'clock', items: recents });
      }
      var byGroup = {};
      var order = [];
      palette.items.forEach(function (it) {
        if (it.kind !== 'module') return;
        if (!byGroup[it.group]) { byGroup[it.group] = []; order.push(it.group); }
        byGroup[it.group].push(it);
      });
      order.forEach(function (g) { groups.push({ name: g, items: byGroup[g] }); });
      groups.push({ name: '操作', items: palette.items.filter(function (it) { return it.kind === 'action'; }) });
    } else {
      var scored = palette.items.map(function (it) {
        return { it: it, s: scoreItem(it, q) };
      }).filter(function (x) { return x.s >= 0; });
      scored.sort(function (a, b) {
        if (b.s !== a.s) return b.s - a.s;
        return a.it.title.length - b.it.title.length;
      });
      var hits = scored.slice(0, 14).map(function (x) { return x.it; });
      if (hits.length) groups.push({ name: '搜索结果', items: hits });
    }

    palette.flat = flat;
    var html = '';
    var idx = 0;

    if (!groups.length) {
      html = '<div class="uik-cmd-empty">没有找到与 <b>“' + esc(palette.input.value.trim()) + '”</b> 匹配的模块<br>' +
        '<span style="font-size:12px">试试「混响」「隔声」「微穿孔」，或直接输入模块名</span></div>';
    } else {
      groups.forEach(function (g) {
        html += '<div class="uik-cmd-group">' + esc(g.name) + '</div>';
        g.items.forEach(function (it) {
          var i = idx++;
          flat.push(it);
          var iconKey = it.icon || (it.kind === 'module' ? 'module' : 'info');
          // 标题命中时只高亮标题；仅说明命中时高亮说明，避免重复高亮造成视觉噪声
          var titleHit = q && it.title.toLowerCase().indexOf(q) >= 0;
          var subHtml = (q && !titleHit) ? highlight(it.sub || '', q) : esc(it.sub || '');
          html += '<button class="uik-cmd-item" type="button" role="option" id="uikCmdOpt' + i + '" data-idx="' + i + '" aria-selected="false">' +
            '<span class="uik-cmd-ico" aria-hidden="true">' + (ICON[iconKey] || ICON.module) + '</span>' +
            '<span class="uik-cmd-txt">' +
            '<span class="uik-cmd-title">' + highlight(it.title, q) + '</span>' +
            '<span class="uik-cmd-sub">' + subHtml + '</span>' +
            '</span>' +
            '<span class="uik-cmd-go">↵</span>' +
            '</button>';
        });
      });
    }

    palette.list.innerHTML = html;
    if (palette.cursor >= flat.length) palette.cursor = Math.max(0, flat.length - 1);
    setCursor(palette.cursor, false);

    var modCount = palette.items.filter(function (i) { return i.kind === 'module'; }).length;
    palette.count.textContent = q
      ? flat.length + ' 条结果'
      : (modCount ? modCount + ' 个模块 · ' : '') + palette.items.filter(function (i) { return i.kind === 'action'; }).length + ' 个操作';
    palette.input.setAttribute('aria-expanded', 'true');
    if (flat.length) palette.input.setAttribute('aria-activedescendant', 'uikCmdOpt' + palette.cursor);
    else palette.input.removeAttribute('aria-activedescendant');
  }

  function setCursor(i, scroll) {
    if (!palette.flat.length) return;
    i = clamp(i, 0, palette.flat.length - 1);
    palette.cursor = i;
    $$('.uik-cmd-item', palette.list).forEach(function (b, k) {
      b.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
    palette.input.setAttribute('aria-activedescendant', 'uikCmdOpt' + i);
    if (scroll !== false) {
      var el = document.getElementById('uikCmdOpt' + i);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function runItem(i) {
    var it = palette.flat[i];
    if (!it) return;
    pushRecent(it.id);
    closePalette();
    // 等浮层收起再执行，避免焦点/滚动冲突
    setTimeout(function () {
      if (it.run) it.run();
      else if (it.route) {
        if (window.AppRouter) location.hash = '#/' + it.route;
        else location.href = 'index.html#/' + it.route;
      }
    }, 30);
  }

  function openPalette() {
    if (!palette.el) buildPalette();
    if (palette.open) return;
    palette.open = true;
    palette.lastFocus = document.activeElement;
    palette.el.hidden = false;
    palette.input.value = '';
    palette.cursor = 0;
    renderPalette();
    loadRemoteIndex();
    document.body.classList.add('uik-lock');
    if (palette.fab) palette.fab.hidden = true;
    setTimeout(function () { palette.input.focus(); }, 20);
  }

  function closePalette() {
    if (!palette.open) return;
    palette.open = false;
    palette.el.hidden = true;
    document.body.classList.remove('uik-lock');
    if (palette.fab) palette.fab.hidden = false;
    if (palette.lastFocus && palette.lastFocus.focus) {
      try { palette.lastFocus.focus(); } catch (e) { /* 忽略 */ }
    }
  }

  function initPalette() {
    document.addEventListener('keydown', function (e) {
      var mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (palette.open) closePalette(); else openPalette();
        return;
      }
      if (!palette.open) return;

      if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setCursor(palette.cursor + 1);
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setCursor(palette.cursor - 1);
        return;
      }
      if (e.key === 'Home') { e.preventDefault(); setCursor(0); return; }
      if (e.key === 'End') { e.preventDefault(); setCursor(palette.flat.length - 1); return; }
      if (e.key === 'Enter') { e.preventDefault(); runItem(palette.cursor); }
    });

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-cmdk-open]') : null;
      if (trigger) { e.preventDefault(); openPalette(); }
    });
  }

  /* ==========================================================================
     与既有模块桥接
     ========================================================================== */
  function bridge() {
    // 分享提示统一走 Toast 队列
    if (window.AppShare && typeof AppShare.toast === 'function') {
      AppShare.toast = function (msg, kind) {
        toast({
          type: kind === 'warn' ? 'warn' : 'ok',
          message: msg,
          duration: 2800
        });
      };
    }
  }

  /* ==========================================================================
     启动
     ========================================================================== */
  // 装饰性动效分级：涟漪 / 3D 倾斜默认仅在交互实验室（ui-lab）启用，
  // 产品页保持安静；任何页面可用 <html data-uik-decor="on"> 显式开启。
  // Toast / tooltip / 主题揭示 / 命令面板等服务任务的动效不受此开关影响。
  function decorativeFxEnabled() {
    var el = document.documentElement;
    if (el.hasAttribute('data-uik-decor')) return el.getAttribute('data-uik-decor') !== 'off';
    return !!document.querySelector('.lab-back') || /ui-lab\.html?$/i.test(location.pathname);
  }

  /* 移动端悬浮入口：手机上顶栏会随页面滚走、也没有 ⌘K 键盘，
     用一颗常驻的圆形按钮把命令面板「随时调用」出来。 */
  function initFab() {
    if (document.querySelector('.uik-fab')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'uik-fab';
    btn.setAttribute('data-cmdk-open', '');
    btn.setAttribute('aria-label', '搜索模块与操作（命令面板）');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4-4"/></svg>';
    document.body.appendChild(btn);
    palette.fab = btn;

    // 聚焦输入框时淡出，避免悬浮按钮压住表单
    var dim = function (on) { document.body.classList.toggle('uik-fab-dim', on); };
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) dim(true);
    });
    document.addEventListener('focusout', function () { dim(false); });
  }

  function boot() {
    buildPaletteIndexSoon();
    initTooltips();
    if (decorativeFxEnabled()) { initRipple(); initTilt(); }
    initCounters();
    initProgress();
    initReveal();
    initPalette();
    initFab();
    bridge();
  }

  function buildPaletteIndexSoon() {
    // 首页卡片由静态 HTML 渲染，脚本位于 </body> 前，此时 #view-home 已可解析；
    // 若脚本被提前加载（<head> 或 defer 顺序变化），再在 DOMContentLoaded 时补建一次。
    palette.items = buildPaletteIndex();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        palette.items = buildPaletteIndex();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.UIK = {
    version: '1.0.0',
    toast: toast,
    ok: function (msg, title) { return toast({ type: 'ok', message: msg, title: title }); },
    info: function (msg, title) { return toast({ type: 'info', message: msg, title: title }); },
    warn: function (msg, title) { return toast({ type: 'warn', message: msg, title: title }); },
    error: function (msg, title) { return toast({ type: 'error', message: msg, title: title }); },
    palette: {
      open: openPalette,
      close: closePalette,
      toggle: function () { if (palette.open) closePalette(); else openPalette(); }
    },
    tip: { show: showTip, hide: hideTip }
  };
})();
