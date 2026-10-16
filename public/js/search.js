/*
 * search.js — 顶栏全局「功能检索」
 *
 * 索引从 #view-home 的 .module-card 动态建立，因此新增模块（四处登记后）
 * 无需改动本文件，检索项自动包含新模块。
 *
 * 交互：
 *   - 总览页：输入即时过滤模块卡片、自动隐藏 banner、命中卡片描边高亮；
 *     悬浮面板同步显示「匹配 N / 总数」与可跳转的模块列表；
 *   - 其他页面：悬浮面板列出命中模块（名称 + 所属分组），↑↓ 选择、Enter 打开；
 *   - 快捷键「/」聚焦（窄屏自动展开检索框），Esc 清空并关闭，× 一键清空；
 *   - 点击面板外或切换路由后自动复位，避免残留过滤状态。
 */
(function () {
  'use strict';

  var input = document.getElementById('tsInput');
  var wrap = document.getElementById('tsWrap');
  var panel = document.getElementById('tsPanel');
  var clearBtn = document.getElementById('tsClear');
  var trigger = document.getElementById('tsTrigger');
  var home = document.getElementById('view-home');
  if (!input || !wrap || !home) return;

  // ------------------------------ 建立索引 ------------------------------
  var groups = Array.prototype.slice.call(home.querySelectorAll('.module-group'));
  var index = [];
  groups.forEach(function (g) {
    var gl = g.querySelector('.group-label');
    var gname = gl ? gl.textContent.trim() : '';
    Array.prototype.forEach.call(g.querySelectorAll('.module-card'), function (card) {
      var t = card.querySelector('.mc-title');
      var d = card.querySelector('.mc-desc');
      var title = t ? t.textContent.replace(/(可用|开发中)\s*$/, '').trim() : '';
      index.push({
        el: card,
        group: g,
        route: (card.getAttribute('href') || '').replace('#/', ''),
        title: title,
        groupName: gname,
        // 匹配池：分组名 + 模块名 + 说明 + 路由地址
        hay: (gname + ' ' + (t ? t.textContent : '') + ' ' +
              (d ? d.textContent : '') + ' ' + card.getAttribute('href')).toLowerCase()
      });
    });
  });
  var total = index.length;
  input.placeholder = '检索功能模块（共 ' + total + ' 个）—— 试试「混响」「隔声」「微穿孔」';

  var cursor = -1; // 悬浮面板键盘光标

  function onHome() { return home.classList.contains('active'); }
  function query() { return input.value.trim().toLowerCase(); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------ 复位 ------------------------------
  function resetAll() {
    input.value = '';
    index.forEach(function (it) { it.el.classList.remove('hs-hidden', 'hs-hit'); });
    groups.forEach(function (g) { g.classList.remove('hs-hidden'); });
    home.classList.remove('is-searching');
    hidePanel();
    if (clearBtn) clearBtn.hidden = true;
    wrap.classList.remove('open');
    cursor = -1;
  }

  // ------------------------------ 悬浮结果面板 ------------------------------
  function hidePanel() {
    if (!panel) return;
    panel.hidden = true;
    panel.innerHTML = '';
    cursor = -1;
  }

  function renderPanel(hits) {
    if (!panel) return;
    var html = '';
    if (!hits.length) {
      html = '<div class="ts-panel-empty">未找到与「' + esc(input.value.trim()) +
        '」相关的模块，换个关键词试试</div>';
    } else {
      html = '<div class="ts-panel-head">匹配 <b>' + hits.length + '</b> / ' + total + ' 个模块</div>';
      var shown = hits.slice(0, 8);
      html += '<ul class="ts-list">' + shown.map(function (it) {
        return '<li class="ts-item" data-route="' + esc(it.route) + '">' +
          '<span class="ts-item-t">' + esc(it.title) + '</span>' +
          '<span class="ts-item-g">' + esc(it.groupName) + '</span></li>';
      }).join('') + '</ul>';
      if (hits.length > shown.length) {
        html += '<div class="ts-panel-more">还有 ' + (hits.length - shown.length) +
          ' 个匹配模块，继续输入以精确查找</div>';
      }
    }
    html += '<div class="ts-panel-foot">↑↓ 选择 · Enter 打开 · Esc 关闭</div>';
    panel.innerHTML = html;
    panel.hidden = false;
    cursor = -1;
    Array.prototype.forEach.call(panel.querySelectorAll('.ts-item'), function (li) {
      // mousedown 先于 blur 触发，保证点击命中
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        openRoute(li.getAttribute('data-route'));
      });
    });
  }

  function openRoute(route) {
    if (!route) return;
    resetAll();
    input.blur();
    location.hash = '#/' + route;
  }

  // ------------------------------ 过滤 ------------------------------
  function apply() {
    var q = query();
    if (clearBtn) clearBtn.hidden = !q;

    if (!q) { resetAll(); return; }

    var hits = index.filter(function (it) { return it.hay.indexOf(q) !== -1; });

    if (onHome()) {
      // 总览页：就地过滤卡片 + 隐藏 banner + 命中描边
      home.classList.add('is-searching');
      index.forEach(function (it) {
        var ok = it.hay.indexOf(q) !== -1;
        it.el.classList.toggle('hs-hidden', !ok);
        it.el.classList.toggle('hs-hit', ok);
      });
      // 分组内模块全被过滤掉时，整组隐藏
      groups.forEach(function (g) {
        g.classList.toggle('hs-hidden', !g.querySelector('.module-card:not(.hs-hidden)'));
      });
    }
    renderPanel(hits);
  }

  input.addEventListener('input', apply);
  input.addEventListener('focus', function () { if (query()) apply(); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!panel || panel.hidden) return;
      var items = panel.querySelectorAll('.ts-item');
      if (!items.length) return;
      e.preventDefault();
      cursor += (e.key === 'ArrowDown' ? 1 : -1);
      if (cursor < 0) cursor = items.length - 1;
      if (cursor >= items.length) cursor = 0;
      Array.prototype.forEach.call(items, function (li, i) {
        li.classList.toggle('active', i === cursor);
      });
    } else if (e.key === 'Enter') {
      if (!panel || panel.hidden) return;
      var list = panel.querySelectorAll('.ts-item');
      if (!list.length) return;
      e.preventDefault();
      openRoute(list[cursor >= 0 ? cursor : 0].getAttribute('data-route'));
    } else if (e.key === 'Escape' || e.keyCode === 27) {
      e.stopPropagation();
      resetAll();
      input.blur();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      apply();
      input.focus();
    });
  }

  // 「/」聚焦（任意页面可用；窄屏同时展开检索框）
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = e.target, tag = (el && el.tagName ? el.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) return;
    e.preventDefault();
    wrap.classList.add('open');
    input.focus();
    input.select();
  });

  // 窄屏：点击放大镜图标展开 / 收起检索框
  if (trigger) {
    trigger.addEventListener('click', function () {
      wrap.classList.toggle('open');
      if (wrap.classList.contains('open')) { input.focus(); } else { hidePanel(); }
    });
  }

  // 点击检索区域外：收起窄屏检索框与悬浮面板
  document.addEventListener('click', function (e) {
    if (wrap.contains(e.target)) return;
    wrap.classList.remove('open');
    hidePanel();
  });

  // 路由切换后复位，避免残留过滤状态
  window.addEventListener('hashchange', resetAll);
})();
