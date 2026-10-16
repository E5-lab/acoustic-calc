/*
 * search.js — 总览页「功能检索栏」
 *
 * 索引从 #view-home 的 .module-card 动态建立，因此新增模块（四处登记后）
 * 无需改动本文件，检索项自动包含新模块。
 *
 * 交互：
 *   - 输入关键词实时过滤模块卡片与分组（匹配模块名 / 说明 / 所属分组）
 *   - 显示「匹配 N / 总数」计数；无匹配时给出提示
 *   - 快捷键「/」聚焦检索框，Esc 清空并还原，右侧 × 一键清空
 */
(function () {
  'use strict';

  var input = document.getElementById('hsInput');
  if (!input) return;
  var clearBtn = document.getElementById('hsClear');
  var countEl = document.getElementById('hsCount');
  var home = document.getElementById('view-home');
  if (!home) return;

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
        title: title,
        // 匹配池：分组名 + 模块名 + 说明 + 路由地址
        hay: (gname + ' ' + (t ? t.textContent : '') + ' ' +
              (d ? d.textContent : '') + ' ' + card.getAttribute('href')).toLowerCase()
      });
    });
  });
  var total = index.length;
  input.placeholder = '检索功能模块（共 ' + total + ' 个）—— 试试「混响」「隔声」「A 计权」「GIF」';

  // ------------------------------ 过滤 ------------------------------
  function apply() {
    var q = input.value.trim().toLowerCase();
    clearBtn.hidden = !q;

    if (!q) {
      index.forEach(function (it) { it.el.classList.remove('hs-hidden'); });
      groups.forEach(function (g) { g.classList.remove('hs-hidden'); });
      countEl.hidden = true;
      countEl.classList.remove('hs-empty');
      return;
    }

    var hits = 0;
    index.forEach(function (it) {
      var ok = it.hay.indexOf(q) !== -1;
      it.el.classList.toggle('hs-hidden', !ok);
      if (ok) hits++;
    });
    // 分组内模块全被过滤掉时，整组隐藏
    groups.forEach(function (g) {
      g.classList.toggle('hs-hidden', !g.querySelector('.module-card:not(.hs-hidden)'));
    });

    countEl.hidden = false;
    countEl.classList.toggle('hs-empty', hits === 0);
    countEl.textContent = hits
      ? '匹配 ' + hits + ' / ' + total + ' 个模块'
      : '未找到与「' + input.value.trim() + '」相关的模块，换个关键词试试';
  }

  input.addEventListener('input', apply);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.stopPropagation();
      input.value = '';
      apply();
      input.blur();
    }
  });
  clearBtn.addEventListener('click', function () { input.value = ''; apply(); input.focus(); });

  // 「/」聚焦（仅在总览页、且未在输入控件内时）
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = e.target, tag = (el && el.tagName ? el.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) return;
    if (!home.classList.contains('active')) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
})();
