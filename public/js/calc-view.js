/*
 * calc-view.js — 声明式计算器通用引擎（所有 calc-bN.js 工具共用）
 *
 * 行为：根据 CalcRegistry 中的配置渲染"输入表单 → 实时计算 → 公式代入 →
 * 结果卡片 → 复制/CSV/重置"。每个计算器无需自带 UI，由本文件统一驱动。
 * 依赖：window.Util（esc/$/copyText/flash 等，上轮已统一）、window.CalcRegistry。
 *
 * 约定：config.compute(s) 为纯函数；本文件负责全部 DOM 与导出。
 */
(function () {
  'use strict';

  var builtRoute = null;   // 已构建表单的路由（避免重复构建丢焦点）
  var state = {};          // 当前输入值
  var last = null;         // 最近一次计算结果（供复制/CSV）

  function $(id) { return window.Util ? window.Util.$(id) : document.getElementById(id); }
  function esc(s) { return window.Util && window.Util.esc ? window.Util.esc(s) : String(s); }
  function flash(id, msg) {
    if (window.Util && window.Util.flash) { window.Util.flash(id, msg); return; }
    var el = document.getElementById(id); if (!el) return;
    el.textContent = msg; setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function currentRoute() {
    return window.AppRouter && window.AppRouter.current
      ? window.AppRouter.current().route : null;
  }

  function cfg() {
    var r = currentRoute();
    return r ? window.CalcRegistry.get(r) : null;
  }

  // ------------------------------ 构建表单（每个路由一次） ------------------------------
  function build(c) {
    var root = activeRoot();
    if (!root) return;
    root.innerHTML = '';

    var shell = document.createElement('div');
    shell.className = 'calc-shell';

    if (c.intro) {
      var intro = document.createElement('p');
      intro.className = 'calc-intro';
      intro.textContent = c.intro;
      shell.appendChild(intro);
    }

    var grid = document.createElement('div');
    grid.className = 'calc-grid';

    // 输入列
    var inBox = document.createElement('div');
    inBox.className = 'calc-inputs';
    (c.inputs || []).forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'field';
      var id = 'calc-' + f.key;
      var labelHtml = '<label for="' + id + '">' + esc(f.label) +
        (f.unit ? ' <span class="unit-tag">' + esc(f.unit) + '</span>' : '') + '</label>';
      if (f.type === 'select' && f.options) {
        var opts = f.options.map(function (o) {
          return '<option value="' + esc(o.value) + '"' +
            ((state[f.key] != null ? state[f.key] : f.def) === o.value ? ' selected' : '') +
            '>' + esc(o.label) + '</option>';
        }).join('');
        wrap.innerHTML = labelHtml + '<select id="' + id + '">' + opts + '</select>';
        inBox.appendChild(wrap);
        var sel = wrap.querySelector('select');
        sel.addEventListener('change', function () {
          state[f.key] = sel.value;
          recalc(c);
        });
      } else {
        wrap.innerHTML = labelHtml +
          '<input id="' + id + '" type="number" inputmode="decimal"' +
          (f.step != null ? ' step="' + f.step + '"' : '') +
          (f.min != null ? ' min="' + f.min + '"' : '') +
          (f.max != null ? ' max="' + f.max + '"' : '') +
          ' value="' + (state[f.key] != null ? state[f.key] : (f.def != null ? f.def : '')) + '">';
        inBox.appendChild(wrap);
        var input = wrap.querySelector('input');
        input.addEventListener('input', function () {
          var v = parseFloat(input.value);
          state[f.key] = isNaN(v) ? NaN : v;
          recalc(c);
        });
      }
    });
    grid.appendChild(inBox);

    // 输出列
    var outBox = document.createElement('div');
    outBox.className = 'calc-outputs';
    outBox.id = 'calcOutputs';
    grid.appendChild(outBox);
    shell.appendChild(grid);

    // 公式代入
    var fBox = document.createElement('div');
    fBox.className = 'calc-formula-box';
    fBox.innerHTML = '<h3>公式代入</h3><div class="calc-formula" id="calcFormula"></div>';
    shell.appendChild(fBox);

    // 说明/注意
    var notes = document.createElement('div');
    notes.className = 'calc-notes';
    notes.id = 'calcNotes';
    shell.appendChild(notes);

    // 操作
    var actions = document.createElement('div');
    actions.className = 'calc-actions';
    actions.innerHTML =
      '<button class="btn" id="calcCopy" type="button">复制结果</button>' +
      '<button class="btn" id="calcCsv" type="button">导出 CSV</button>' +
      '<button class="btn ghost" id="calcReset" type="button">重置</button>' +
      '<span class="calc-msg" id="calcMsg"></span>';
    shell.appendChild(actions);

    root.appendChild(shell);

    $('calcCopy').addEventListener('click', copySummary);
    $('calcCsv').addEventListener('click', exportCsv);
    $('calcReset').addEventListener('click', function () { reset(c); });
  }

  function activeRoot() {
    var r = currentRoute();
    if (!r) return null;
    var sec = document.getElementById('view-' + r);
    return sec ? sec.querySelector('.calc-root') : null;
  }

  // ------------------------------ 计算与渲染结果 ------------------------------
  function recalc(c) {
    if (!c || !c.compute) return;
    var outBox = $('calcOutputs');
    var fEl = $('calcFormula');
    var nEl = $('calcNotes');
    if (!outBox) return;

    var res;
    try {
      res = c.compute(state) || {};
    } catch (e) {
      outBox.innerHTML = '<div class="callout error"><span class="dot"></span><span>计算异常：' + esc(e.message) + '</span></div>';
      if (fEl) fEl.innerHTML = '';
      if (nEl) nEl.innerHTML = '';
      last = null;
      return;
    }
    last = res;

    if (res.ok === false) {
      outBox.innerHTML = '<div class="callout error"><span class="dot"></span><span>' + esc(res.error || '输入无效') + '</span></div>';
      if (fEl) fEl.innerHTML = '';
      if (nEl) nEl.innerHTML = '';
      return;
    }

    // 结果卡片
    var vals = res.values || {};
    var html = '';
    (c.outputs || []).forEach(function (o) {
      var v = vals[o.key];
      html += '<div class="stat"><div class="s-label">' + esc(o.label) + '</div>' +
        '<div class="s-value">' + esc(window.CalcRegistry.fmt(v, o.digits)) +
        (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</div>' +
        (o.note ? '<div class="s-sub">' + esc(o.note) + '</div>' : '') + '</div>';
    });
    outBox.innerHTML = html || '<div class="callout info"><span class="dot"></span><span>该计算暂无可展示的输出项。</span></div>';

    if (fEl) fEl.innerHTML = res.formula || '';
    if (nEl) {
      var nh = '';
      (res.notes || []).forEach(function (n) {
        var lvl = n.level || 'info';
        nh += '<div class="callout ' + lvl + '"><span class="dot"></span><span>' + esc(n.text) + '</span></div>';
      });
      nEl.innerHTML = nh;
    }
  }

  // ------------------------------ 重置 ------------------------------
  function reset(c) {
    state = {};
    (c.inputs || []).forEach(function (f) { state[f.key] = (f.def != null ? f.def : NaN); });
    builtRoute = null;
    build(c);
    recalc(c);
  }

  // ------------------------------ 复制 / 导出 ------------------------------
  function summaryText(c) {
    if (!last) return '';
    var out = [];
    out.push((c.title || (c.nav && c.nav.label) || '计算结果') + ' · 结果摘要');
    (c.inputs || []).forEach(function (f) {
      var v = state[f.key];
      if (v == null || isNaN(v)) return;
      out.push(f.label + ' = ' + window.CalcRegistry.fmt(v, f.digits) + (f.unit ? ' ' + f.unit : ''));
    });
    out.push('');
    var vals = last.values || {};
    (c.outputs || []).forEach(function (o) {
      out.push(o.label + ' = ' + window.CalcRegistry.fmt(vals[o.key], o.digits) + (o.unit ? ' ' + o.unit : ''));
    });
    (last.notes || []).forEach(function (n) { out.push('提示：' + n.text); });
    out.push('工具：声学计算工具箱');
    return out.join('\n');
  }

  function copySummary() {
    var c = cfg();
    var txt = c ? summaryText(c) : '';
    if (!txt) { flash('calcMsg', '暂无可复制结果'); return; }
    var done = function () { flash('calcMsg', '已复制'); };
    if (window.Util && window.Util.copyText) { window.Util.copyText(txt, done); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
    } else { fallbackCopy(txt, done); }
  }

  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败，请手动选择文本。'); }
    document.body.removeChild(ta);
  }

  function exportCsv() {
    var c = cfg();
    if (!c || !last) { flash('calcMsg', '暂无可导出结果'); return; }
    var rows = [];
    rows.push([(c.title || (c.nav && c.nav.label) || '计算结果'), '', '']);
    rows.push(['输入', '值', '单位']);
    (c.inputs || []).forEach(function (f) {
      var v = state[f.key];
      if (v == null || isNaN(v)) return;
      rows.push([f.label, window.CalcRegistry.fmt(v, f.digits), f.unit || '']);
    });
    rows.push([]);
    rows.push(['输出', '值', '单位']);
    var vals = last.values || {};
    (c.outputs || []).forEach(function (o) {
      rows.push([o.label, window.CalcRegistry.fmt(vals[o.key], o.digits), o.unit || '']);
    });
    if (last.notes && last.notes.length) {
      rows.push([]);
      rows.push(['说明', '']);
      last.notes.forEach(function (n) { rows.push([n.text, '']); });
    }
    var csv = '﻿' + rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (c.route || 'calc') + '-result.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ------------------------------ 初始化 ------------------------------
  function init() {
    var c = cfg();
    if (!c) return;
    // 深链参数预填
    var r = window.AppRouter.current();
    var params = r && r.params ? r.params : {};
    state = {};
    (c.inputs || []).forEach(function (f) {
      if (params[f.key] != null && params[f.key] !== '') {
        var pv = parseFloat(params[f.key]);
        state[f.key] = isNaN(pv) ? (f.def != null ? f.def : NaN) : pv;
      } else {
        state[f.key] = (f.def != null ? f.def : NaN);
      }
    });
    if (builtRoute !== c.route) {
      build(c);
      builtRoute = c.route;
    } else {
      // 同路由重入：同步输入框值
      (c.inputs || []).forEach(function (f) {
        var el = $('calc-' + f.key); if (el) el.value = state[f.key];
      });
    }
    recalc(c);
  }

  function onShow() {
    var c = cfg();
    if (!c) return;
    (c.inputs || []).forEach(function (f) {
      var el = $('calc-' + f.key); if (el) el.value = state[f.key];
    });
    recalc(c);
  }

  // ------------------------------ 导航 / 总览 注入（DOM 就绪后） ------------------------------
  // 把全部声明式计算器按 nav.group 归类，注入到一个"速算计算器"导航分组，
  // 并在首页功能模块区追加对应卡片。这样新增块文件【无需改动 index.html 导航】。
  function injectNavAndHome() {
    var REG = window.CalcRegistry.all();
    var routes = Object.keys(REG);
    if (!routes.length) return;

    // —— 导航分组 ——
    var nav = document.querySelector('.mainnav');
    if (nav) {
      var grp = document.createElement('div');
      grp.className = 'nav-group';
      grp.setAttribute('data-calc-group', '1');
      grp.innerHTML = '<button class="nav-parent" type="button" aria-expanded="false" aria-haspopup="true">速算计算器' +
        '<svg class="nav-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></button>' +
        '<div class="nav-menu"></div>';
      var menu = grp.querySelector('.nav-menu');
      var byGroup = window.CalcRegistry.groups();
      Object.keys(byGroup).forEach(function (gname) {
        menu.innerHTML += '<div class="nm-col"><p class="nm-col-h">' + esc(gname) + '</p>' +
          byGroup[gname].map(function (rt) {
            var c = REG[rt];
            var label = (c.nav && c.nav.label) || rt;
            var desc = (c.nav && c.nav.desc) || '';
            return '<a href="#/' + rt + '" data-route="' + rt + '"><span class="nm-t">' + esc(label) + '</span>' +
              (desc ? '<small class="nm-d">' + esc(desc) + '</small>' : '') + '</a>';
          }).join('') + '</div>';
      });
      // 插入到"现场实测"分组之前（保持主分组顺序稳定）
      var lastReal = nav.querySelector('.nav-group:not(.topbar-group):not([data-calc-group])');
      var insertBefore = null;
      // 最后一个非 topbar 分组（现场实测）
      var reals = nav.querySelectorAll('.nav-group:not(.topbar-group)');
      if (reals.length) insertBefore = reals[reals.length - 1];
      nav.insertBefore(grp, insertBefore);
    }

    // —— 首页功能模块卡片 ——
    var home = document.getElementById('view-home');
    if (home) {
      var wrap = document.createElement('div');
      wrap.className = 'module-group';
      wrap.setAttribute('data-calc-group', '1');
      wrap.innerHTML = '<div class="group-label">速算计算器</div><div class="module-grid"></div>';
      var grid = wrap.querySelector('.module-grid');
      routes.forEach(function (rt) {
        var c = REG[rt];
        var card = document.createElement('a');
        card.className = 'module-card';
        card.href = '#/' + rt;
        card.innerHTML = '<span class="mc-body"><span class="mc-title">' +
          esc((c.nav && c.nav.label) || rt) + '</span><span class="mc-desc">' +
          esc((c.nav && c.nav.desc) || '') + '</span></span>';
        grid.appendChild(card);
      });
      home.appendChild(wrap);
    }

    updateModuleCount();
  }

  function updateModuleCount() {
    // 结构测试会从 index.html 静态卡片 + calc-bN.js 注册数推导；此处仅更新首页展示文本。
    // 分组数动态统计（含声明式计算器注入的「速算计算器」组），模块数动态统计实际卡片。
    var total = 0, groups = 8;
    try {
      total = document.querySelectorAll('#view-home .module-card').length;
      var g = document.querySelectorAll('.mainnav .nav-group:not(.topbar-group)');
      if (g && g.length) groups = g.length;
    } catch (e) {}
    var hint = document.querySelector('.section-head .hint');
    if (hint && total) {
      hint.textContent = '共 ' + groups + ' 个分组、' + total + ' 个模块，与顶栏二级菜单一一对应';
    }
  }

  function boot() {
    // 仅在浏览器环境注入导航与首页卡片；Node（单测）下跳过
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectNavAndHome);
    } else {
      injectNavAndHome();
    }
  }
  boot();

  if (typeof window !== 'undefined') window.CalcView = { init: init, onShow: onShow };
})();
