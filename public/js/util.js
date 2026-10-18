/*
 * util.js — 共享前端工具函数（零依赖）
 * --------------------------------------------------------------------------
 * 集中提供各视图文件反复复制粘贴的辅助函数，消除重复、统一行为：
 *   Util.$(id)            按 id 取元素（document.getElementById）
 *   Util.esc(s)           完整 HTML 转义（& < > " ' 五类），属性与文本上下文均安全
 *   Util.num(v, d)        数值格式化，空值/NaN 显示 '—'，可指定位数
 *   Util.signed(v, d)     带正负号数值格式化
 *   Util.fmt(n, d)        数值格式化（同 num，别名）
 *   Util.cssVar(n, f)     读取 CSS 变量，带默认值回退
 *   Util.copyText(txt, cb, errCb)  剪贴板复制（clipboard API + execCommand 回退）
 *   Util.flash(el, msg, ms)        轻量提示（2s 后清空）
 *   Util.parseNum(el, fb) 解析输入框数值，空/NaN 回退默认值
 *
 * 对外接口：window.Util（UMD：Node 下 module.exports）
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(id) { return document.getElementById(id); }

  function num(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function signed(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(d == null ? 1 : d);
  }

  function fmt(n, d) { return num(n, d); }

  function cssVar(n, f) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n);
    return (v && v.trim()) || f;
  }

  function flash(el, msg, ms) {
    if (!el) return;
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, ms || 2000);
  }

  // 剪贴板复制：优先 navigator.clipboard，失败回退 execCommand
  function copyText(txt, done, fail) {
    done = done || function () {};
    fail = fail || function () {};
    if (!txt) { fail(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () {
        fallbackCopy(txt, done, fail);
      });
    } else {
      fallbackCopy(txt, done, fail);
    }
  }

  function fallbackCopy(txt, done, fail) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { fail(); }
    document.body.removeChild(ta);
  }

  function parseNum(el, fb) {
    var v = parseFloat(el && el.value);
    return (isNaN(v) || v == null) ? fb : v;
  }

  var Util = {
    esc: esc,
    $: $,
    num: num,
    signed: signed,
    fmt: fmt,
    cssVar: cssVar,
    flash: flash,
    copyText: copyText,
    parseNum: parseNum
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Util;
  } else {
    global.Util = Util;
  }
})(this);
