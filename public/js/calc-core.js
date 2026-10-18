/*
 * calc-core.js — 声明式计算器注册表（新增工具的"契约"核心）
 *
 * 设计目标：用"数据登记表"替代 39 套手写视图，新增一个声学工具 = 在
 * calc-b*.js 里调用一次 CalcRegistry.register(route, config)。引擎 calc-view.js
 * 负责统一渲染（表单→计算→公式代入→结果→复制/CSV/重置），每个工具零重复 UI。
 *
 * 关键约定（其他 AI 实现各 calc-bN.js 时必须遵守）：
 *   1) config.compute(state) 必须是【纯函数】：只依赖入参 state（各输入框的
 *      数值对象），不得访问 DOM / window / 随机源；返回 { values, formula, notes, ok }。
 *      这样每个计算器都能在 Node 下单测（见 tests/calc-bN.test.js）。
 *   2) register 在浏览器里会：登记配置、自动创建 <section id="view-route"> 视图容器、
 *      把路由加入 router 的待注册队列；在 Node 里只登记配置（无 DOM 操作），便于测试。
 *   3) config.nav.group 决定该工具在"速算计算器"导航分组里的归类。
 *
 * 全局名：CalcRegistry（浏览器挂在 window，Node 挂在 global，二者皆可直接裸引用）。
 */
(function () {
  'use strict';

  // 浏览器→window，Node→global，保证两种环境都能裸名引用 CalcRegistry
  var G = (typeof window !== 'undefined') ? window
    : (typeof global !== 'undefined') ? global : {};

  var REG = {};        // route -> config
  var PENDING = [];    // 路由待注册队列（供 router.js 在构建 VIEWS 时合并）
  var GROUPS = {};     // nav.group -> [route]

  function register(route, cfg) {
    if (!route || !cfg) return;
    cfg.route = route;
    REG[route] = cfg;
    if (cfg.nav && cfg.nav.group) {
      (GROUPS[cfg.nav.group] = GROUPS[cfg.nav.group] || []).push(route);
    }
    // 浏览器：创建视图容器 + 入队路由
    if (typeof document !== 'undefined') {
      ensureSection(route, cfg);
      PENDING.push({
        route: route,
        view: 'view-' + route,
        title: cfg.title || (cfg.nav && cfg.nav.label) || route,
        mount: 'CalcView'
      });
    }
    return cfg;
  }

  // 创建视图区块（与现有 <section class="view" id="view-xxx"> 同构）
  function ensureSection(route, cfg) {
    var main = document.getElementById('main');
    if (!main) return;
    var id = 'view-' + route;
    if (document.getElementById(id)) return;
    var sec = document.createElement('section');
    sec.className = 'view';
    sec.id = id;
    sec.setAttribute('data-view', route);
    sec.innerHTML =
      '<div class="page-head">' +
        '<h1 class="ph-title">' + escHtml((cfg.nav && cfg.nav.label) || route) + '</h1>' +
      '</div>' +
      '<div class="calc-root"></div>';
    main.appendChild(sec);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // —— 通用数值格式化（引擎与块文件共用）——
  function fmt(v, d) {
    if (v == null || !isFinite(v)) return '—';
    var n = Number(v);
    if (d == null) d = 2;
    // 极大/极小用指数，避免溢出显示
    if (Math.abs(n) !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4)) return n.toExponential(Math.min(d, 3));
    var s = n.toFixed(d);
    return s.replace(/\.?0+$/, '') || '0';
  }

  function group(n) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString('en-US').replace(/,/g, ' ');
  }

  G.CalcRegistry = {
    register: register,
    get: function (r) { return REG[r]; },
    all: function () { return REG; },
    pending: function () { return PENDING; },
    groups: function () { return GROUPS; },
    fmt: fmt,
    group: group,
    count: function () { return Object.keys(REG).length; }
  };

  // 兼容裸引用（部分老脚本习惯 window.X）
  if (typeof window !== 'undefined') window.CalcRegistry = G.CalcRegistry;
})();
