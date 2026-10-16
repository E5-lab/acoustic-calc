/*
 * nav.js — 顶栏二级菜单（分组下拉）交互 + 模块页面包屑
 *
 * 结构约定（见 index.html）：
 *   .mainnav
 *     a[data-route="home"]                     一级：总览
 *     .nav-group                               一级：分组
 *       button.nav-parent                      分组标题（点击/悬停展开）
 *       .nav-menu > a[data-route]              二级：模块
 *         span.nm-t                            模块名
 *         small.nm-d                           一句话说明
 *
 * 交互：
 *   - 桌面端（hover: hover）悬停展开，移出收起
 *   - 触屏端点击分组标题展开/收起
 *   - Esc 关闭；点击分组外区域关闭；点击菜单内链接后关闭
 *   - 路由变化时由 router.js 调用 syncActive(route)，同步分组高亮
 */
(function () {
  'use strict';

  var mqHover = window.matchMedia ? window.matchMedia('(hover: hover)') : null;

  function groups() {
    return Array.prototype.slice.call(document.querySelectorAll('.nav-group'));
  }

  function setOpen(group, open) {
    if (!group) return;
    group.classList.toggle('open', !!open);
    var btn = group.querySelector('.nav-parent');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      groups().forEach(function (g) { if (g !== group) setOpen(g, false); });
    }
  }

  function closeAll() {
    groups().forEach(function (g) { setOpen(g, false); });
  }

  function isOpen(group) {
    return !!group && group.classList.contains('open');
  }

  // ------------------------------ 事件绑定 ------------------------------
  function bind() {
    var nav = document.querySelector('.mainnav');
    if (!nav) return;

    // 分组标题：点击切换（触屏必需；桌面端与悬停配合）
    // 顶栏（友链等）同样使用 .nav-group 结构，一并绑定
    function onNavClick(e) {
      var parent = e.target.closest ? e.target.closest('.nav-parent') : null;
      if (parent) {
        var group = parent.closest('.nav-group');
        setOpen(group, !isOpen(group));
        e.preventDefault();
        return;
      }
      // 点击二级菜单内的链接后立即收起
      var link = e.target.closest ? e.target.closest('.nav-menu a') : null;
      if (link) closeAll();
    }
    nav.addEventListener('click', onNavClick);
    var topbar = document.querySelector('.topbar-actions');
    if (topbar) topbar.addEventListener('click', onNavClick);

    // 点击空白处收起
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.nav-group')) return;
      closeAll();
    });

    // Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) closeAll();
    });

    // 仅指针悬停设备（桌面）支持移出收起，避免触屏误关
    if (mqHover && mqHover.matches) {
      groups().forEach(function (g) {
        g.addEventListener('mouseleave', function () { setOpen(g, false); });
      });
    }
  }

  // ------------------------------ 路由高亮 ------------------------------
  // router.js 已为 .mainnav a 打上 .active，这里据此同步分组状态与面包屑
  function syncActive(route) {
    var activeLink = document.querySelector('.mainnav a[data-route="' + route + '"]');
    groups().forEach(function (g) {
      var hit = !!g.querySelector('a[data-route="' + route + '"]');
      g.classList.toggle('has-active', hit);
      var btn = g.querySelector('.nav-parent');
      if (btn) btn.classList.toggle('active', hit);
      if (hit) setOpen(g, false);
    });
    if (!activeLink) closeAll();
  }

  // ------------------------------ 面包屑 ------------------------------
  // 在每个模块视图的 .page-head 顶部插入「分组 / 模块名」，与二级菜单结构呼应
  function crumbs() {
    groups().forEach(function (g) {
      var btn = g.querySelector('.nav-parent');
      var groupName = btn ? btn.textContent.trim() : '';
      Array.prototype.forEach.call(g.querySelectorAll('.nav-menu a'), function (a) {
        var route = a.getAttribute('data-route');
        var view = document.getElementById('view-' + route);
        if (!view || !route) return;
        var head = view.querySelector('.page-head');
        if (!head || head.querySelector('.crumb')) return;
        var titleEl = a.querySelector('.nm-t');
        var name = titleEl ? titleEl.textContent.trim() : a.textContent.trim();
        var crumb = document.createElement('div');
        crumb.className = 'crumb';
        crumb.setAttribute('data-route', route);
        crumb.innerHTML = '<span class="crumb-g">' + groupName + '</span>' +
          '<span class="crumb-sep">/</span>' +
          '<span class="crumb-c">' + name + '</span>';
        head.insertBefore(crumb, head.firstChild);
      });
    });
  }

  function boot() {
    bind();
    crumbs();
    syncActive(window.AppRouter ? window.AppRouter.parse().route : 'home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.AppNav = { syncActive: syncActive, closeAll: closeAll, groups: groups };
})();
