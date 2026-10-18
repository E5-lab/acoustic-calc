/*
 * all-tools.js — 「全部工具」目录页（#/all）
 *
 * 数据源：顶栏 .mainnav DOM（分组 / 模块 / 一句话说明）+ nav.js 的 NAV_SUB
 * （三级子功能，经 window.NavSub 暴露）。导航结构变化时本页自动同步，
 * 无需单独维护清单；提供客户端过滤（模块名 / 说明 / 子功能 / 路由名）。
 */
(function () {
  'use strict';

  var DATA = [];

  function collect() {
    var groups = [];
    Array.prototype.forEach.call(document.querySelectorAll('.mainnav > .nav-group'), function (g) {
      var btn = g.querySelector('.nav-parent');
      if (!btn) return;
      var label = btn.textContent.replace(/\s+/g, ' ').trim();
      var mods = [];
      Array.prototype.forEach.call(g.querySelectorAll('.nav-menu a[data-route]'), function (a) {
        var route = a.getAttribute('data-route');
        if (!route) return;
        var t = a.querySelector('.nm-t');
        var d = a.querySelector('.nm-d');
        mods.push({
          route: route,
          name: t ? t.textContent.trim() : route,
          desc: d ? d.textContent.trim() : '',
          subs: (window.NavSub && window.NavSub[route]) || []
        });
      });
      if (mods.length) groups.push({ label: label, mods: mods });
    });
    return groups;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function render(filter) {
    var host = document.getElementById('allTools');
    if (!host) return;
    var kw = (filter || '').trim().toLowerCase();
    var out = '';
    var shown = 0;
    DATA.forEach(function (g) {
      var mods = g.mods.filter(function (m) {
        if (!kw) return true;
        var hay = (m.name + ' ' + m.desc + ' ' + m.subs.join(' ') + ' ' + m.route).toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
      if (!mods.length) return;
      shown += mods.length;
      out += '<section class="card at-group">'
        + '<h3 class="at-label">' + esc(g.label) + '<small class="at-n">' + mods.length + ' 个模块</small></h3>'
        + '<div class="at-list">';
      mods.forEach(function (m) {
        out += '<a class="at-item" href="#/' + esc(m.route) + '">'
          + '<span class="at-name">' + esc(m.name) + '</span>'
          + '<span class="at-desc">' + esc(m.desc) + '</span>'
          + (m.subs.length ? '<span class="at-subs">' + m.subs.map(esc).join(' · ') + '</span>' : '')
          + '</a>';
      });
      out += '</div></section>';
    });
    host.innerHTML = out
      || '<section class="card"><p class="hint">没有匹配「' + esc(filter) + '」的模块，换个关键词试试（支持模块名、说明、子功能与路由名）。</p></section>';
    var count = document.getElementById('allCount');
    if (count) count.textContent = kw ? ('匹配 ' + shown + ' 个模块') : ('共 ' + shown + ' 个模块');
  }

  function init() {
    DATA = collect();
    render('');
    var input = document.getElementById('allFilter');
    if (input) input.addEventListener('input', function () { render(input.value); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
