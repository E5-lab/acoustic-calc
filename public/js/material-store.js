/*
 * material-store.js — 自定义吸声材料库（localStorage 持久化 + JSON 导入导出，UMD）
 *
 * 作用域（scope）：材料按用途隔离，互不串用
 *   rt60    — 室内混响时间表面材料（6 频带 125~4000 Hz，与 room.js MATERIALS 同构）
 *   muffler — 消声器吸声衬里（7 频带 63~4000 Hz，与 muffler.js MATERIALS 同构）
 *
 * 存储：localStorage['acousticCalc.materialStore.v1'] =
 *   { version: 1, rt60: [材料...], muffler: [材料...] }
 *   材料 = { id: 'c_xxx', name, alpha[]（逐频带吸声系数）, note? }
 *   id 前缀 c_ 与内置 id 不冲突；浏览器无 localStorage（Node / 隐私模式）时
 *   退化为进程内存，可用 MaterialStore.use(fakeStorage) 注入供单元测试。
 *
 * 校验约定：名称 1~40 字且作用域内不重名；alpha 与作用域频带数一致，
 *   取值 0 ~ 1.2（实测 α 可略超 1，边缘绕射所致）。
 *
 * API：
 *   SCOPES                  — 作用域定义表
 *   list(scope)             — 自定义材料数组（浅拷贝）
 *   get(scope, id)          — 按 id 查找
 *   add(scope, m)           — 新增（校验，id 缺省自动生成；可带合法 id 供导入）
 *   remove(scope, id)       — 删除
 *   exportJSON(scope?)      — 导出（缺省全部作用域）为 JSON 字符串
 *   importJSON(text, opts)  — 导入：默认按 id 跳过已存在，opts.overwrite 覆盖
 *   use(storage)            — 注入存储实现（getItem/setItem/removeItem）
 *   renderManager(el, opts) — 渲染共用管理界面（增删 + 导出/导入文本框）
 *
 * 数据仅保存在本机浏览器，不上传任何服务器。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MaterialStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'acousticCalc.materialStore.v1';

  var SCOPES = {
    rt60: {
      bands: 6,
      label: '室内混响时间 · 表面材料',
      bandLabels: ['125', '250', '500', '1k', '2k', '4k']
    },
    muffler: {
      bands: 7,
      label: '消声器 · 吸声衬里',
      bandLabels: ['63', '125', '250', '500', '1k', '2k', '4k']
    }
  };

  // ------------------------------ 存储 ------------------------------
  function detectStorage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        var k = '__ms_probe__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return localStorage;
      }
    } catch (e) { /* 隐私模式 / 受限环境 */ }
    return null;
  }

  var storage = (function () {
    var detected = detectStorage();
    if (detected) return detected;
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  })();

  function use(s) { if (s && typeof s.getItem === 'function') storage = s; }

  function getRaw() {
    try {
      var t = storage.getItem(STORAGE_KEY);
      var o = t ? JSON.parse(t) : null;
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }
  function setRaw(obj) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }
  function db() {
    var raw = getRaw();
    if (raw) {
      if (!raw.version) raw.version = 1;
      return raw;
    }
    return { version: 1, rt60: [], muffler: [] };
  }

  // ------------------------------ 校验 ------------------------------
  function validate(scope, m, others) {
    var def = SCOPES[scope];
    if (!def) return '未知作用域「' + scope + '」';
    if (!m || typeof m !== 'object') return '材料数据无效';
    var name = String(m.name == null ? '' : m.name).trim();
    if (!name) return '请填写材料名称';
    if (name.length > 40) return '材料名称过长（≤ 40 字）';
    if (!Array.isArray(m.alpha) || m.alpha.length !== def.bands) {
      return '吸声系数需为 ' + def.bands + ' 个频带值（' + def.bandLabels.join('/') + ' Hz）';
    }
    for (var i = 0; i < m.alpha.length; i++) {
      var v = Number(m.alpha[i]);
      if (!isFinite(v) || v < 0 || v > 1.2) {
        return '吸声系数应在 0 ~ 1.2 之间（' + def.bandLabels[i] + ' Hz 频带）';
      }
    }
    var exist = others || list(scope);
    for (var j = 0; j < exist.length; j++) {
      if (exist[j].name === name) return '已存在同名材料「' + name + '」';
    }
    return null;
  }

  function genId() {
    return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function isCustomId(id) { return typeof id === 'string' && /^c_[a-z0-9]{6,}$/.test(id); }

  // ------------------------------ CRUD ------------------------------
  function list(scope) {
    var d = db();
    return Array.isArray(d[scope]) ? d[scope].slice() : [];
  }

  function get(scope, id) {
    var arr = list(scope);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function add(scope, m) {
    var err = validate(scope, m);
    if (err) return { ok: false, error: err };
    var d = db();
    if (!Array.isArray(d[scope])) d[scope] = [];
    if (m.id) {
      if (!isCustomId(m.id)) return { ok: false, error: '材料 id 格式无效' };
      if (get(scope, m.id)) return { ok: false, error: '材料 id 已存在' };
    }
    var rec = {
      id: m.id || genId(),
      name: String(m.name).trim(),
      alpha: m.alpha.map(Number)
    };
    if (m.note) rec.note = String(m.note).slice(0, 80);
    d[scope].push(rec);
    if (!setRaw(d)) return { ok: false, error: '本地存储写入失败（浏览器可能处于隐私模式）' };
    return { ok: true, id: rec.id, material: rec };
  }

  function remove(scope, id) {
    var d = db();
    if (!Array.isArray(d[scope])) return { ok: false, error: '无该材料' };
    var before = d[scope].length;
    var kept = [];
    for (var i = 0; i < d[scope].length; i++) if (d[scope][i].id !== id) kept.push(d[scope][i]);
    if (kept.length === before) return { ok: false, error: '无该材料' };
    d[scope] = kept;
    setRaw(d);
    return { ok: true };
  }

  // ------------------------------ 导入导出 ------------------------------
  function exportJSON(scope) {
    var d = db();
    if (scope) {
      if (!SCOPES[scope]) return '{ "error": "未知作用域" }';
      var single = { version: 1 };
      single[scope] = Array.isArray(d[scope]) ? d[scope] : [];
      return JSON.stringify(single, null, 1);
    }
    return JSON.stringify(d, null, 1);
  }

  function importJSON(text, opts) {
    var o = opts || {};
    var data;
    try { data = JSON.parse(String(text == null ? '' : text)); }
    catch (e) { return { ok: false, error: 'JSON 解析失败，请检查文本框内容' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: '导入内容应为 JSON 对象（exportJSON 的导出格式）' };
    }
    var d = db();
    var added = 0, skipped = 0;
    var errors = [];
    Object.keys(SCOPES).forEach(function (sc) {
      if (!Object.prototype.hasOwnProperty.call(data, sc)) return;
      var arr = data[sc];
      if (!Array.isArray(arr)) return;
      if (!Array.isArray(d[sc])) d[sc] = [];
      arr.forEach(function (m) {
        if (!m || typeof m !== 'object') { skipped++; return; }
        var idx = -1;
        for (var i = 0; i < d[sc].length; i++) if (d[sc][i].id === m.id) { idx = i; break; }
        if (idx >= 0 && !o.overwrite) { skipped++; return; }
        var others = [];
        for (var j = 0; j < d[sc].length; j++) if (d[sc][j].id !== m.id) others.push(d[sc][j]);
        var err = validate(sc, m, others);
        if (err) { errors.push('「' + (m.name || '未命名') + '」：' + err); skipped++; return; }
        var rec = {
          id: isCustomId(m.id) ? m.id : genId(),
          name: String(m.name).trim(),
          alpha: m.alpha.map(Number)
        };
        if (m.note) rec.note = String(m.note).slice(0, 80);
        if (idx >= 0) d[sc][idx] = rec; else d[sc].push(rec);
        added++;
      });
    });
    if (added > 0 && !setRaw(d)) {
      return { ok: false, error: '本地存储写入失败', added: 0, skipped: skipped, errors: errors };
    }
    return { ok: true, added: added, skipped: skipped, errors: errors };
  }

  // ------------------------------ 共用管理界面 ------------------------------
  function esc(s) {
    if (typeof window !== 'undefined' && window.Util && window.Util.esc) return window.Util.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderManager(el, opts) {
    opts = opts || {};
    var scope = opts.scope, def = SCOPES[scope];
    if (!el || !def) return false;
    var p = 'ms-' + scope + '-';

    function msg(ok, text) {
      var box = document.getElementById(p + 'msg');
      if (box) box.innerHTML = '<div class="callout ' + (ok ? 'ok' : 'warn') +
        '"><span class="dot"></span><span>' + esc(text) + '</span></div>';
    }

    function refreshList() {
      var box = document.getElementById(p + 'list');
      if (!box) return;
      var arr = list(scope);
      if (!arr.length) { box.innerHTML = '<p class="hint">尚无自定义材料。保存后即出现在本模块的材料下拉菜单中。</p>'; return; }
      box.innerHTML =
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>材料</th><th>逐频带吸声系数（' +
        def.bandLabels.join(' / ') + ' Hz）</th><th></th></tr></thead><tbody>' +
        arr.map(function (m) {
          return '<tr><td>' + esc(m.name) + '</td><td class="mono">' +
            m.alpha.map(function (v) { return Number(v).toFixed(2); }).join(' / ') +
            '</td><td><button class="btn small" data-ms-del="' + esc(m.id) + '" type="button">删除</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      var btns = box.querySelectorAll('[data-ms-del]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          var id = this.getAttribute('data-ms-del');
          var r = remove(scope, id);
          if (r.ok) { refreshList(); msg(true, '已删除'); if (opts.onChange) opts.onChange(); }
          else msg(false, r.error);
        });
      }
    }

    el.innerHTML =
      (opts.title ? '<h4 class="sub-head">' + esc(opts.title) + '</h4>' : '') +
      '<div class="field-row compact">' +
      '<div class="field"><label for="' + p + 'name">材料名称</label>' +
      '<input id="' + p + 'name" type="text" maxlength="40" placeholder="如：定制穿孔铝板（贴棉 50 mm）" /></div>' +
      def.bandLabels.map(function (b, i) {
        return '<div class="field"><label for="' + p + 'a' + i + '">α @' + esc(b) + '</label>' +
          '<input id="' + p + 'a' + i + '" type="number" step="0.05" min="0" max="1.2" /></div>';
      }).join('') +
      '<div class="field field-auto"><label>&nbsp;</label>' +
      '<button id="' + p + 'add" class="btn small" type="button">保存材料</button></div>' +
      '</div>' +
      '<div id="' + p + 'msg" class="callout-row"></div>' +
      '<div id="' + p + 'list"></div>' +
      '<details><summary class="hint">导出 / 导入（JSON 备份，跨设备迁移）</summary>' +
      '<textarea id="' + p + 'io" rows="3" class="text-input" spellcheck="false" ' +
      'placeholder="点「导出」生成本机材料 JSON；或粘贴此前导出的 JSON 后点「导入」"></textarea>' +
      '<div class="btn-row">' +
      '<button id="' + p + 'exp" class="btn small" type="button">导出到文本框</button>' +
      '<button id="' + p + 'imp" class="btn small" type="button">从文本框导入</button>' +
      '</div></details>';

    document.getElementById(p + 'add').addEventListener('click', function () {
      var name = document.getElementById(p + 'name').value;
      var alpha = [];
      for (var i = 0; i < def.bands; i++) alpha.push(parseFloat(document.getElementById(p + 'a' + i).value));
      var r = add(scope, { name: name, alpha: alpha });
      if (!r.ok) { msg(false, r.error); return; }
      document.getElementById(p + 'name').value = '';
      for (var j = 0; j < def.bands; j++) document.getElementById(p + 'a' + j).value = '';
      refreshList();
      msg(true, '已保存「' + r.material.name + '」，可在材料下拉菜单中选择');
      if (opts.onChange) opts.onChange();
    });

    document.getElementById(p + 'exp').addEventListener('click', function () {
      var ta = document.getElementById(p + 'io');
      ta.value = exportJSON(scope);
      var n = list(scope).length;
      msg(true, n ? '已导出 ' + n + ' 条材料到文本框，全选复制即可备份' : '本作用域暂无自定义材料，导出为空表');
    });

    document.getElementById(p + 'imp').addEventListener('click', function () {
      var r = importJSON(document.getElementById(p + 'io').value);
      if (!r.ok) { msg(false, r.error); return; }
      refreshList();
      var text = '导入完成：新增 ' + r.added + ' 条、跳过 ' + r.skipped + ' 条';
      if (r.errors && r.errors.length) text += '；问题：' + r.errors.join('；');
      msg(r.errors && r.errors.length ? false : true, text);
      if (r.added > 0 && opts.onChange) opts.onChange();
    });

    refreshList();
    return true;
  }

  return {
    STORAGE_KEY: STORAGE_KEY, SCOPES: SCOPES,
    list: list, get: get, add: add, remove: remove,
    exportJSON: exportJSON, importJSON: importJSON,
    use: use, renderManager: renderManager
  };
});
