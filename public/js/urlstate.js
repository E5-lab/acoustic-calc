/*
 * urlstate.js — 哈希路由的 query 参数解析与分享链接构造（UMD，无 DOM 依赖，可 Node 直接 require）
 *
 * 约定：深链形如  #/route?k=v&k2=v2
 *   - 参数一律为字符串；数字/布尔由各视图自行解析（parseNum/parseBool 已提供）
 *   - 键与值均按 encodeURIComponent 编码；解析时 %20 与 + 均视作空格
 *   - 空值（v 为空串）在编码阶段被丢弃，避免  #/route?wall=
 *
 * 导出：encodeQuery / parseQuery / parseHash / buildHash / buildLink / merge /
 *       pick / parseNum / parseBool / toQueryEntries / MAX_LEN
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.UrlState = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 保守的 URL 长度上限（IE 友好的 2000 以内），超出时 buildLink 会标记 tooLong
  var MAX_LEN = 1800;

  function safeDecode(s) {
    try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); }
    catch (e) { return String(s); }
  }

  // 解析 "a=1&b=hello+world" → { a: '1', b: 'hello world' }
  // 无 "=" 的片段按「键存在、值为空串」处理；重复键后值覆盖前值
  function parseQuery(qs) {
    var out = {};
    var s = String(qs == null ? '' : qs).replace(/^\?/, '');
    if (!s) { return out; }
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i];
      if (!kv) { continue; }
      var eq = kv.indexOf('=');
      var k = eq < 0 ? kv : kv.slice(0, eq);
      var v = eq < 0 ? '' : kv.slice(eq + 1);
      k = safeDecode(k);
      v = safeDecode(v);
      if (k) { out[k] = v; }
    }
    return out;
  }

  // { a: '1', b: '', c: null, d: undefined } → "a=1"（丢弃空值/空串/null/undefined）
  function encodeQuery(params) {
    if (!params) { return ''; }
    var parts = [];
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = params[k];
      if (v == null || v === '') { continue; }
      if (typeof v === 'boolean') { v = v ? '1' : '0'; }
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    return parts.join('&');
  }

  // 拆分 "#/leakage?wall=3&hole=1" → { path: 'leakage', params: { wall: '3', hole: '1' } }
  // 兼容带或不带前导 "#" / "#/"；路径尾部的 "/" 被去除
  function parseHash(hash) {
    var raw = String(hash == null ? '' : hash).replace(/^#/, '').replace(/^\/+/, '');
    var qi = raw.indexOf('?');
    var path = raw, qs = '';
    if (qi >= 0) { path = raw.slice(0, qi); qs = raw.slice(qi + 1); }
    path = path.replace(/\/+$/, '');
    return { path: path, params: parseQuery(qs) };
  }

  // (route, params) → "#/route?k=v"
  function buildHash(route, params) {
    var q = encodeQuery(params);
    return '#/' + String(route == null ? '' : route) + (q ? '?' + q : '');
  }

  // (baseUrl, route, params) → 完整可分享链接
  // baseUrl 传 location.origin + location.pathname；若传入的 base 自带 "#..." 会被剥离
  function buildLink(baseUrl, route, params) {
    var base = String(baseUrl == null ? '' : baseUrl).split('#')[0].split('?')[0];
    var hash = buildHash(route, params);
    var url = base + hash;
    return { url: url, tooLong: url.length > MAX_LEN };
  }

  // 浅合并：merge({a:1}, {b:2}) → {a:1,b:2}；后者的空值不覆盖前者
  function merge(base, extra) {
    var out = {};
    var k;
    if (base) { for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) { out[k] = base[k]; } } }
    if (extra) {
      for (k in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, k)) { continue; }
        var v = extra[k];
        if (v == null || v === '') { continue; }
        out[k] = v;
      }
    }
    return out;
  }

  // 只保留给定键
  function pick(params, keys) {
    var out = {};
    if (!params || !keys) { return out; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Object.prototype.hasOwnProperty.call(params, k)) { out[k] = params[k]; }
    }
    return out;
  }

  function parseNum(v, dflt) {
    if (v == null || v === '') { return dflt; }
    var n = parseFloat(String(v).replace(/,/g, '.'));
    return isFinite(n) ? n : dflt;
  }

  function parseBool(v, dflt) {
    if (v == null || v === '') { return dflt; }
    var s = String(v).toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') { return true; }
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') { return false; }
    return dflt;
  }

  // 调试/展示用：[['wall','3'],['hole','1']]
  function toQueryEntries(params) {
    var out = [];
    var keys = Object.keys(params || {});
    for (var i = 0; i < keys.length; i++) { out.push([keys[i], params[keys[i]]]); }
    return out;
  }

  return {
    MAX_LEN: MAX_LEN,
    parseQuery: parseQuery,
    encodeQuery: encodeQuery,
    parseHash: parseHash,
    buildHash: buildHash,
    buildLink: buildLink,
    merge: merge,
    pick: pick,
    parseNum: parseNum,
    parseBool: parseBool,
    toQueryEntries: toQueryEntries
  };
});
