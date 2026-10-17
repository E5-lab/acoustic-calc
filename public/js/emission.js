/*
 * emission.js — 环境噪声排放限值对照内核（纯函数，无 DOM）
 *
 * 标准数据由 limit-data.js 提供（内置 + 外部 data/limits.json 可配置）：
 *   GB 12348-2008 工业企业厂界（0~4 类 × 昼/夜）
 *   GB 22337-2008 社会生活噪声（0~4 类 × 昼/夜）
 *   GB 12523-2011 建筑施工场界（昼/夜单值）
 *   GB 3096-2008  声环境功能区（0~4b × 昼/夜）
 *
 * 输出：达标/超标、超标量、限值表引用。
 */
(function (global) {
  'use strict';

  var LIM = (typeof require === 'function') ? require('./limit-data.js') : (global.LimitData || {});

  var STANDARDS = [
    { id: 'GB12348', code: 'GB 12348-2008', name: '工业企业厂界环境噪声排放限值', zones: ['0', '1', '2', '3', '4'] },
    { id: 'GB22337', code: 'GB 22337-2008', name: '社会生活环境噪声排放标准', zones: ['0', '1', '2', '3', '4'] },
    { id: 'GB12523', code: 'GB 12523-2011', name: '建筑施工场界环境噪声排放限值', zones: null },
    { id: 'GB3096', code: 'GB 3096-2008', name: '声环境功能区环境噪声限值（室外）', zones: ['0', '1', '2', '3', '4a', '4b'] }
  ];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function rowFor(data, key) {
    return (data && data.table) ? data.table[key] : null;
  }

  /**
   * 判定：给定标准 + 类别 + 实测值
   * @return {Object} { ok, standard, zone, day:{level,limit,ok,exceed}, night:{...}, error? }
   */
  function check(standardId, zone, dayLevel, nightLevel) {
    var std = null;
    for (var i = 0; i < STANDARDS.length; i++) if (STANDARDS[i].id === standardId) std = STANDARDS[i];
    if (!std) return { ok: false, error: '未知标准：' + standardId };

    var data = LIM.INBUILT ? LIM.INBUILT[standardId] : null;
    if (!data || !data.table) return { ok: false, error: '限值库未就绪：' + standardId };

    var d = num(dayLevel), n = num(nightLevel);
    if (d == null && n == null) return { ok: false, error: '请至少输入昼间或夜间实测值' };
    if (std.zones) {
      if (zone == null || String(zone) === '') return { ok: false, error: '请选择声环境功能区类别' };
      if (!data.table[String(zone)]) return { ok: false, error: '类别无效：' + zone };
    }

    function make(level, key, label) {
      if (level == null) return { label: label, level: null, limit: null, ok: null, exceed: null };
      var limit = null;
      if (std.zones) {
        var row = data.table[String(zone)];
        if (!row) return { label: label, level: level, limit: null, ok: null, exceed: null, error: '类别无效' };
        limit = row[key];
      } else {
        limit = data.table[key] ? data.table[key].value : null;
      }
      if (limit == null) return { label: label, level: level, limit: null, ok: null, exceed: null, error: '该档无限值' };
      return {
        label: label, level: level, limit: limit, ok: level <= limit,
        exceed: Math.round((level - limit) * 10) / 10
      };
    }

    var out = {
      ok: true,
      standard: { id: std.id, code: std.code, name: std.name, basis: data.basis, units: data.units },
      zones: std.zones,
      zone: std.zones ? String(zone) : null,
      day: make(d, 'day', '昼间'),
      night: make(n, 'night', '夜间')
    };
    return out;
  }

  // 简表：标准全部档位（用于界面展示）
  function table(standardId) {
    var data = LIM.INBUILT ? LIM.INBUILT[standardId] : null;
    if (!data) return null;
    return { id: data.id, name: data.name, basis: data.basis, table: data.table };
  }

  var API = {
    STANDARDS: STANDARDS,
    check: check,
    table: table,
    num: num
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Emission = API;
})(typeof window !== 'undefined' ? window : globalThis);