/*
 * view-handbook.js — 公式与术语手册视图（#/handbook）
 * 依赖：window.Handbook（内核）、window.AppRouter（路由/标题，可选）
 *
 * DOM 由本视图自建（index.html 仅留空容器 <section id="view-handbook">）。
 * 深链： #/handbook?q=混响&cat=room
 *   - q    关键词（支持空格分隔多词 AND）
 *   - cat  分类 id（basic/abs/ins/room/quality/env/psycho/vib/audio/occ）
 * 视图内改动检索条件会用 history.replaceState 回写 URL，使「复制分享链接」带上当前条件。
 */
(function () {
  'use strict';

  var H = window.Handbook;
  var state = { q: '', cat: 'all' };
  var inited = false;

  function $(id) { return window.Util.$(id); }

  function esc(s) { return window.Util.esc(s); }

  function catName(id) {
    return H && H.catName ? H.catName(id) : id;
  }

  // 路由 → 中文短标题（用于「相关模块」链接）
  function routeLabel(r) {
    var t = window.AppRouter && window.AppRouter.titles ? window.AppRouter.titles[r] : '';
    if (!t) { return r; }
    return String(t).split(' · ')[0];
  }

  var STYLE = '' +
    '#view-handbook .hb-head { display:flex; flex-wrap:wrap; gap:10px; align-items:baseline; justify-content:space-between; }' +
    '#view-handbook .hb-cats { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }' +
    '#view-handbook .hb-chip { font:inherit; font-size:12.5px; padding:5px 12px; border-radius:999px; cursor:pointer; ' +
    'background:var(--card-soft,#f6f7f9); color:var(--muted,#666); border:1px solid var(--border,#e3e5e9); transition:.15s; }' +
    '#view-handbook .hb-chip:hover { border-color:var(--border-strong,#c9ccd2); color:var(--text,#111); }' +
    '#view-handbook .hb-chip.on { background:var(--primary,#2b6cb0); border-color:var(--primary,#2b6cb0); color:#fff; font-weight:600; }' +
    '#view-handbook .hb-count { margin:14px 0 0; }' +
    '#view-handbook .hb-item { padding:16px 18px; margin-top:12px; border-radius:12px; background:var(--card,#fff); ' +
    'border:1px solid var(--border,#e3e5e9); box-shadow:0 1px 2px rgba(0,0,0,.03); }' +
    '#view-handbook .hb-item h3 { margin:0 0 8px; font-size:15.5px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }' +
    '#view-handbook .hb-ab { font-size:12px; font-weight:600; padding:2px 8px; border-radius:6px; ' +
    'background:var(--primary-soft,#e8f1fb); color:var(--primary,#2b6cb0); }' +
    '#view-handbook .hb-cat { font-size:11.5px; padding:2px 8px; border-radius:6px; ' +
    'background:var(--card-soft,#f2f3f5); color:var(--muted,#666); font-weight:500; }' +
    '#view-handbook .hb-def { margin:0; font-size:13.5px; line-height:1.65; color:var(--text,#222); }' +
    '#view-handbook .hb-f { margin:10px 0 0; padding:9px 12px; border-radius:8px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; ' +
    'font-size:13px; line-height:1.6; overflow-x:auto; white-space:nowrap; background:var(--code-bg,#f6f8fa); color:var(--text,#111); border:1px solid var(--border,#e6e8eb); }' +
    '#view-handbook .hb-meta { margin-top:10px; display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--muted,#777); align-items:center; }' +
    '#view-handbook .hb-meta b { font-weight:600; color:var(--text,#333); }' +
    '#view-handbook .hb-go { margin-left:auto; font-size:12.5px; color:var(--primary,#2b6cb0); text-decoration:none; font-weight:600; }' +
    '#view-handbook .hb-go:hover { text-decoration:underline; }' +
    '#view-handbook .hb-empty { padding:40px 18px; text-align:center; color:var(--muted,#777); font-size:14px; }' +
    '#view-handbook .hb-hl { background:var(--warn-soft,#fff3cd); border-radius:3px; padding:0 2px; }';

  function buildSkeleton() {
    var root = document.getElementById('view-handbook');
    if (!root) { return; }
    root.innerHTML = '' +
      '<style>' + STYLE + '</style>' +
      '<section class="card">' +
        '<div class="hb-head">' +
          '<h2 style="margin:0">公式与术语手册 <span class="mc-tag live" id="hbTotal"></span></h2>' +
        '</div>' +
        '<p class="hint">汇总本站各模块用到的核心公式、符号与术语定义，按 10 个分类组织。可搜索、可按分类筛选，' +
        '并支持深链分享：<code>#/handbook?q=混响&amp;cat=room</code>。</p>' +
        '<div class="field-row compact" style="margin-top:14px">' +
          '<div class="field" style="grid-column:1/-1">' +
            '<label for="hbQ">关键词检索（空格分隔 = 多词同时命中）</label>' +
            '<input id="hbQ" type="search" autocomplete="off" spellcheck="false" placeholder="如：混响 / 质量定律 / NRR / 10·lg" />' +
          '</div>' +
        '</div>' +
        '<div class="hb-cats" id="hbCats"></div>' +
        '<p class="hint hb-count" id="hbCount"></p>' +
        '<div class="btn-row">' +
          '<button class="btn small ghost" id="hbClear" type="button">清空检索</button>' +
          '<button class="btn small ghost" id="hbShare" type="button">复制当前检索链接</button>' +
        '</div>' +
      '</section>' +
      '<div id="hbList"></div>';

    var total = H ? H.ENTRIES.length : 0;
    $('hbTotal').textContent = total + ' 条';

    // 分类 chips
    var wrap = $('hbCats');
    var chips = ['<button class="hb-chip on" type="button" data-cat="all">全部</button>'];
    (H ? H.CATS : []).forEach(function (c) {
      var n = H.byCat(c.id).length;
      chips.push('<button class="hb-chip" type="button" data-cat="' + c.id + '">' +
        esc(c.name) + ' <span style="opacity:.65">' + n + '</span></button>');
    });
    wrap.innerHTML = chips.join('');
    wrap.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.hb-chip') : null;
      if (!btn) { return; }
      state.cat = btn.getAttribute('data-cat');
      render();
      syncUrl();
    });

    $('hbQ').addEventListener('input', function () {
      state.q = $('hbQ').value;
      render();
      syncUrl();
    });
    $('hbClear').addEventListener('click', function () {
      state.q = '';
      $('hbQ').value = '';
      render();
      syncUrl();
      $('hbQ').focus();
    });
    $('hbShare').addEventListener('click', function () {
      if (!window.AppShare || !window.AppRouter) { return; }
      var l = window.AppShare.link('handbook', { q: state.q, cat: state.cat === 'all' ? '' : state.cat });
      window.AppShare.copy(l.url).then(function () {
        window.AppShare.toast('检索链接已复制：' + l.url, 'ok');
      }).catch(function () {
        window.AppShare.toast('复制失败，请手动复制地址栏', 'warn');
      });
    });
  }

  function syncChips() {
    var wrap = $('hbCats');
    if (!wrap) { return; }
    Array.prototype.forEach.call(wrap.querySelectorAll('.hb-chip'), function (btn) {
      btn.classList.toggle('on', btn.getAttribute('data-cat') === state.cat);
    });
  }

  function syncUrl() {
    if (!window.AppRouter || typeof window.AppRouter.hash !== 'function') { return; }
    if (window.AppRouter.parse().route !== 'handbook') { return; }
    var hash = window.AppRouter.hash('handbook', { q: state.q, cat: state.cat === 'all' ? '' : state.cat });
    try { history.replaceState(null, '', location.pathname + location.search + hash); } catch (e) { /* 忽略 */ }
  }

  function itemHtml(e) {
    var parts = [];
    parts.push('<article class="hb-item">');
    parts.push('<h3><span>' + esc(e.t) + '</span>');
    if (e.a) { parts.push('<span class="hb-ab">' + esc(e.a) + '</span>'); }
    parts.push('<span class="hb-cat">' + esc(catName(e.c)) + '</span></h3>');
    parts.push('<p class="hb-def">' + esc(e.d) + '</p>');
    if (e.f) { parts.push('<div class="hb-f">' + esc(e.f) + '</div>'); }
    var meta = [];
    if (e.u) { meta.push('<span>单位 <b>' + esc(e.u) + '</b></span>'); }
    if (e.s) { meta.push('<span>出处 <b>' + esc(e.s) + '</b></span>'); }
    if (meta.length) { parts.push('<div class="hb-meta">' + meta.join('') + '</div>'); }
    if (e.r) {
      parts.push('<div class="hb-meta"><a class="hb-go" href="#/' + esc(e.r) + '">打开模块：' +
        esc(routeLabel(e.r)) + ' →</a></div>');
    }
    parts.push('</article>');
    return parts.join('');
  }

  function render() {
    var list = $('hbList');
    if (!list) { return; }
    var hits = H.search(state.q, { cat: state.cat === 'all' ? null : state.cat });
    var countEl = $('hbCount');
    if (countEl) {
      var catText = state.cat === 'all' ? '全部分类' : catName(state.cat);
      countEl.textContent = (state.q ? '「' + state.q + '」' : '全部词条') + ' · ' + catText +
        ' · 命中 ' + hits.length + ' / ' + H.ENTRIES.length + ' 条';
    }
    if (!hits.length) {
      list.innerHTML = '<div class="card hb-empty">没有匹配的词条，换个关键词或点击「全部」试试。</div>';
      return;
    }
    var html = [];
    for (var i = 0; i < hits.length; i++) { html.push(itemHtml(hits[i])); }
    list.innerHTML = html.join('');
  }

  function applyParams(params) {
    params = params || {};
    if (typeof params.q === 'string') { state.q = params.q; }
    if (typeof params.cat === 'string') {
      var ok = params.cat === 'all' || (H && H.CATS.some(function (c) { return c.id === params.cat; }));
      if (ok) { state.cat = params.cat; }
    }
    var input = $('hbQ');
    if (input && input.value !== state.q) { input.value = state.q; }
    syncChips();
    render();
  }

  function init(mode, params) {
    if (inited) { return; }
    inited = true;
    buildSkeleton();
    applyParams(params);
  }

  function onShow(params) {
    if (!inited) { return; }
    applyParams(params);
  }

  window.HandbookView = { init: init, onShow: onShow, _state: state };
})();
