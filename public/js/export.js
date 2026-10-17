/*
 * export.js — 平台级「导出计算书」能力（当前模块 → CSV / 文本计算书 / 打印为 PDF）
 *
 * 设计要点（零耦合，自动适配全部模块）：
 *   - 不依赖任何模块的内部结构，只采集「当前激活视图」里通用可读元素：
 *       输入参数：可见的 input / select（排除按钮、隐藏项），取其标签文本
 *       结果块  ：table、.kv-result / .kv 键值对、.result-line 结果行
 *   - CSV 输出三列「类别, 项目, 数值」，可直接用 Excel/WPS 打开
 *   - 文本计算书可复制到文档；打印时通过注入的 @media print 只保留当前视图
 *
 * 导出：AppExport.{activeRoute, activeView, collectParams, collectResults,
 *                  toCsv, csv, book, download, copyBook, copyCsv, print, exportCsv}
 */
(function () {
  'use strict';

  function activeRoute() {
    if (window.AppRouter && typeof window.AppRouter.parse === 'function') {
      return window.AppRouter.parse().route;
    }
    var el = document.querySelector('.view.active');
    return el ? (el.getAttribute('data-view') || 'home') : 'home';
  }

  function activeView() {
    return document.getElementById('view-' + activeRoute());
  }

  function isVisible(el) {
    if (!el) { return false; }
    if (el.hidden) { return false; }
    if (el.type === 'hidden') { return false; }
    if (el.disabled) { return false; }
    var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (st && (st.display === 'none' || st.visibility === 'hidden')) { return false; }
    return true;
  }

  function labelOf(el) {
    if (!el) { return ''; }
    var txt = '';
    if (el.id) {
      var lab = document.querySelector('label[for="' + el.id + '"]');
      if (lab) { txt = lab.textContent; }
    }
    if (!txt && el.closest) {
      var wrap = el.closest('.field, .row, label, .kv');
      if (wrap) {
        var lab2 = wrap.querySelector('label');
        if (lab2) { txt = lab2.textContent; }
      }
    }
    if (!txt) { txt = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || ''; }
    return String(txt).replace(/\s+/g, ' ').trim();
  }

  function valueOf(el) {
    if (!el) { return ''; }
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'select') {
      var op = el.options ? el.options[el.selectedIndex] : null;
      return op ? String(op.textContent).trim() : String(el.value || '');
    }
    if (el.type === 'checkbox' || el.type === 'radio') { return el.checked ? '是' : '否'; }
    return String(el.value == null ? '' : el.value).trim();
  }

  // 采集输入参数 → [{ k, v }]
  function collectParams(view) {
    view = view || activeView();
    var out = [];
    if (!view) { return out; }
    var els = view.querySelectorAll('input, select');
    Array.prototype.forEach.call(els, function (el) {
      var t = (el.type || '').toLowerCase();
      if (t === 'button' || t === 'submit' || t === 'reset' || t === 'file') { return; }
      if (!isVisible(el)) { return; }
      var k = labelOf(el);
      var v = valueOf(el);
      if (!k && !v) { return; }
      out.push({ k: k || '(未命名输入)', v: v });
    });
    return out;
  }

  function rowText(tr) {
    var cells = tr.querySelectorAll('th, td');
    var arr = [];
    Array.prototype.forEach.call(cells, function (c) {
      arr.push(String(c.textContent || '').replace(/\s+/g, ' ').trim());
    });
    return arr;
  }

  // 采集结果 → { tables: [[...]], entries: [{ k, v }], lines: [...] }
  function collectResults(view) {
    view = view || activeView();
    var out = { tables: [], entries: [], lines: [] };
    if (!view) { return out; }

    // 1) 表格
    Array.prototype.forEach.call(view.querySelectorAll('table'), function (tb) {
      if (!isVisible(tb)) { return; }
      var rows = [];
      Array.prototype.forEach.call(tb.querySelectorAll('tr'), function (tr) {
        var r = rowText(tr);
        if (r.length && r.join('').length) { rows.push(r); }
      });
      if (rows.length) { out.tables.push(rows); }
    });

    // 2) 键值卡（.kv-result > .kv > .k/.v，或全局 .kv）
    var seen = [];
    Array.prototype.forEach.call(view.querySelectorAll('.kv'), function (kv) {
      if (!isVisible(kv)) { return; }
      var kEl = kv.querySelector('.k');
      var vEl = kv.querySelector('.v');
      if (!kEl || !vEl) { return; }
      var k = String(kEl.textContent || '').replace(/\s+/g, ' ').trim();
      var v = String(vEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!k || !v) { return; }
      var sig = k + '\u0001' + v;
      if (seen.indexOf(sig) >= 0) { return; }
      seen.push(sig);
      out.entries.push({ k: k, v: v });
    });

    // 3) 结果行
    Array.prototype.forEach.call(view.querySelectorAll('.result-line, .res-line, .out-line'), function (ln) {
      if (!isVisible(ln)) { return; }
      var t = String(ln.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) { out.lines.push(t); }
    });

    return out;
  }

  // ------------------------------ CSV ------------------------------
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    // 含分隔符/引号/换行须加引号；含前后空格也加引号，避免部分解析器自动 trim 丢失信息
    if (/[",\n\r]/.test(s) || s !== s.trim()) { return '"' + s.replace(/"/g, '""') + '"'; }
    return s;
  }

  function toCsv(rows) {
    return (rows || []).map(function (r) {
      return (r || []).map(csvCell).join(',');
    }).join('\r\n');
  }

  function rowsForExport() {
    var route = activeRoute();
    var view = activeView();
    var params = collectParams(view);
    var res = collectResults(view);
    var rows = [];
    rows.push(['声学计算工具箱计算书']);
    rows.push(['模块', route]);
    rows.push(['页面', (view && (view.getAttribute('data-view') || route)) || route]);
    rows.push(['导出时间', new Date().toLocaleString('zh-CN')]);
    rows.push(['来源', location.href]);
    rows.push([]);
    rows.push(['参数', '项目', '数值']);
    params.forEach(function (p) { rows.push(['参数', p.k, p.v]); });
    res.entries.forEach(function (p) { rows.push(['结果', p.k, p.v]); });
    res.lines.forEach(function (t) { rows.push(['结果', t, '']); });
    res.tables.forEach(function (tb, i) {
      rows.push([]);
      rows.push(['表格 ' + (i + 1), '', '']);
      tb.forEach(function (r) { rows.push(['表格 ' + (i + 1)].concat(r)); });
    });
    return rows;
  }

  function csv() {
    return '\ufeff' + toCsv(rowsForExport()); // BOM 便于 Excel 识别 UTF-8
  }

  // ------------------------------ 文本计算书 ------------------------------
  function pad(s, n) {
    s = String(s == null ? '' : s);
    var w = 0;
    for (var i = 0; i < s.length; i++) { w += s.charCodeAt(i) > 255 ? 2 : 1; }
    var out = s;
    while (w < n) { out += ' '; w += 1; }
    return out;
  }

  function book() {
    var route = activeRoute();
    var view = activeView();
    var params = collectParams(view);
    var res = collectResults(view);
    var L = [];
    var line = '────────────────────────────────────────';
    L.push('声学计算工具箱 · 计算书');
    L.push(line);
    L.push('模块  ：' + route);
    L.push('导出  ：' + new Date().toLocaleString('zh-CN'));
    L.push('来源  ：' + location.href);
    L.push('');
    if (params.length) {
      L.push('【输入参数】');
      params.forEach(function (p) { L.push('  ' + pad(p.k, 22) + ' : ' + p.v); });
      L.push('');
    }
    if (res.entries.length) {
      L.push('【计算结果】');
      res.entries.forEach(function (p) { L.push('  ' + pad(p.k, 22) + ' : ' + p.v); });
      L.push('');
    }
    if (res.lines.length) {
      L.push('【结果明细】');
      res.lines.forEach(function (t) { L.push('  · ' + t); });
      L.push('');
    }
    res.tables.forEach(function (tb, i) {
      L.push('【表格 ' + (i + 1) + '】');
      tb.forEach(function (r, j) {
        L.push('  ' + r.join(' | '));
        if (j === 0) { L.push('  ' + '-'.repeat(Math.min(60, r.join(' | ').length))); }
      });
      L.push('');
    });
    if (!params.length && !res.entries.length && !res.lines.length && !res.tables.length) {
      L.push('（当前页面暂无可导出的参数或结果，请先完成一次计算。）');
    }
    L.push(line);
    L.push('说明：本计算书由浏览器本地生成，供方案比选与存档参考；正式设计请以标准方法与实测为准。');
    return L.join('\n');
  }

  // ------------------------------ 下载 / 复制 ------------------------------
  function stamp() {
    var d = new Date();
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes());
  }

  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function copyText(text, okMsg) {
    if (window.AppShare && window.AppShare.copy) {
      return window.AppShare.copy(text).then(function () {
        if (window.AppShare.toast) { window.AppShare.toast(okMsg || '已复制到剪贴板', 'ok'); }
        return true;
      }).catch(function () {
        if (window.AppShare.toast) { window.AppShare.toast('复制失败，可改用「导出 CSV」下载', 'warn'); }
        return false;
      });
    }
    return Promise.resolve(false);
  }

  function exportCsv() {
    var name = 'acoustic-' + activeRoute() + '-' + stamp() + '.csv';
    var ok = download(name, csv(), 'text/csv');
    if (window.AppShare && window.AppShare.toast) {
      window.AppShare.toast(ok ? ('已导出 ' + name) : '导出失败，请改用复制计算书', ok ? 'ok' : 'warn');
    }
    return ok;
  }

  function copyBook() {
    return copyText(book(), '文本计算书已复制到剪贴板');
  }

  function copyCsv() {
    return copyText(csv().replace(/^\ufeff/, ''), 'CSV 已复制到剪贴板');
  }

  // ------------------------------ 打印（可另存为 PDF） ------------------------------
  var PRINT_STYLE_ID = 'appExportPrintStyle';

  function ensurePrintStyle() {
    if (document.getElementById(PRINT_STYLE_ID)) { return; }
    var st = document.createElement('style');
    st.id = PRINT_STYLE_ID;
    st.textContent = '@media print {' +
      'header,nav,footer,.mainnav,.topbar-actions,.hero-banner,.module-group,.friends,.ts-wrap{display:none !important}' +
      '.view{display:none !important}' +
      '.view.active{display:block !important}' +
      'body{background:#fff !important}' +
      'main{padding:0 !important}' +
      '#appShareToast{display:none !important}' +
      '}';
    document.head.appendChild(st);
  }

  function print() {
    ensurePrintStyle();
    var route = activeRoute();
    var old = document.title;
    document.title = '声学计算书 · ' + route;
    setTimeout(function () {
      try { window.print(); } finally { document.title = old; }
    }, 60);
  }

  // ------------------------------ 顶栏「导出」菜单绑定 ------------------------------
  var MENU_STYLE_ID = 'appExportMenuStyle';

  function ensureMenuStyle() {
    if (document.getElementById(MENU_STYLE_ID)) { return; }
    var st = document.createElement('style');
    st.id = MENU_STYLE_ID;
    st.textContent = '' +
      '#exportMenu .nav-menu{left:auto;right:0;min-width:242px}' +
      '#exportMenu .ex-item{display:block;width:100%;box-sizing:border-box;text-align:left;font:inherit;font-size:13px;' +
      'padding:9px 12px;border:0;border-radius:8px;background:none;color:var(--text,#222);cursor:pointer;line-height:1.35}' +
      '#exportMenu .ex-item:hover{background:var(--card-soft,#f2f3f5)}' +
      '#exportMenu .ex-item .nm-t{display:block;font-weight:500}' +
      '#exportMenu .ex-item small{display:block;color:var(--muted,#777);font-size:11.5px;font-weight:400;margin-top:2px}' +
      '#exportMenu .ex-sep{height:1px;margin:6px 8px;background:var(--border,#e6e8eb)}';
    document.head.appendChild(st);
  }

  function closeMenu(el) {
    var g = el && el.closest ? el.closest('.nav-group') : null;
    if (!g) { return; }
    g.classList.remove('open');
    var b = g.querySelector('.nav-parent');
    if (b) { b.setAttribute('aria-expanded', 'false'); }
  }

  function bind() {
    var box = document.getElementById('exportMenu');
    if (!box || box._exBound) { return; }
    box._exBound = true;
    ensureMenuStyle();
    box.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('[data-ex]') : null;
      if (!item) { return; }
      var act = item.getAttribute('data-ex');
      if (act === 'csv') { exportCsv(); }
      else if (act === 'book') { copyBook(); }
      else if (act === 'csvcopy') { copyCsv(); }
      else if (act === 'print') { print(); }
      closeMenu(item);
      e.preventDefault();
    });
  }

  if (typeof module === 'object' && module.exports) {
    // Node 环境：仅暴露无 DOM 依赖的纯函数，供单元测试
    module.exports = { csvCell: csvCell, toCsv: toCsv, pad: pad };
  } else if (typeof window !== 'undefined') {
    window.AppExport = {
      activeRoute: activeRoute,
      activeView: activeView,
      collectParams: collectParams,
      collectResults: collectResults,
      toCsv: toCsv,
      rowsForExport: rowsForExport,
      csv: csv,
      book: book,
      download: download,
      exportCsv: exportCsv,
      copyBook: copyBook,
      copyCsv: copyCsv,
      print: print,
      bind: bind
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  }
})();
