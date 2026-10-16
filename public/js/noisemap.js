/*
 * noisemap.js — 环境噪声进阶 计算内核（UMD）
 * 浏览器挂到 window.NoiseMap，Node 下 module.exports。
 *
 * 依赖 env.js（ISO 9613-2 户外传播：球面发散 + 大气吸收 + 地面效应），
 *   浏览器中须先于本脚本加载 env.js。
 *
 * 内容：
 *   - 多点声源网格声压级（能量叠加）
 *   - 等值线提取（marching squares，线性插值）
 *   - GB 3096-2008 声环境功能区限值 / GB 55016-2021 室内噪声限值与达标判定
 * 交通噪声线声源模型复用 Env.roadTraffic（见视图层）。
 */
(function (global) {
  'use strict';

  var Env = (typeof module !== 'undefined' && module.exports) ? require('./env.js') : global.Env;

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // ---------------------------------------------------------------------------
  // 1) 网格声压级
  // ---------------------------------------------------------------------------
  // sources: [{x, y, hs, spectrum:{125:LW,...}}]（m / dB）；x0..y1：计算范围(m)
  function gridLevels(o) {
    var srcs = (o.sources || []).filter(function (s) {
      return num(s.x) != null && num(s.y) != null && s.spectrum;
    });
    if (!srcs.length) return { ok: false, error: '至少需要一个带声功率谱的点声源' };
    var cols = Math.max(2, o.cols || 48), rows = Math.max(2, o.rows || 32);
    var x0 = num(o.x0), x1 = num(o.x1), y0 = num(o.y0), y1 = num(o.y1);
    if ([x0, x1, y0, y1].some(function (v) { return v == null; })) {
      return { ok: false, error: '请给出完整的计算范围 (x0,x1,y0,y1)' };
    }
    var hr = num(o.hr) != null ? num(o.hr) : 1.5;
    var ground = o.ground || 'mixed';
    var grid = [], max = -Infinity, min = Infinity, sum = 0, n = 0;
    for (var j = 0; j < rows; j++) {
      var row = [];
      for (var i = 0; i < cols; i++) {
        var x = x0 + (x1 - x0) * i / (cols - 1);
        var y = y0 + (y1 - y0) * j / (rows - 1);
        var lin = 0;
        for (var k = 0; k < srcs.length; k++) {
          var s = srcs[k];
          var dx = x - num(s.x), dy = y - num(s.y);
          var r = Math.sqrt(dx * dx + dy * dy);
          if (r < 0.5) r = 0.5; // 近场保护
          var res = Env.iso9613(s.spectrum, r, s.hs, hr, ground, o.Tc, o.rh, o.p);
          if (res && res.LpA != null) lin += Math.pow(10, res.LpA / 10);
        }
        var lp = lin > 0 ? 10 * Math.log10(lin) : null;
        row.push(lp);
        if (lp != null) {
          if (lp > max) max = lp;
          if (lp < min) min = lp;
          sum += lp; n++;
        }
      }
      grid.push(row);
    }
    return {
      ok: true, grid: grid, cols: cols, rows: rows,
      x0: x0, x1: x1, y0: y0, y1: y1,
      max: max, min: min, mean: n ? sum / n : null
    };
  }

  // ---------------------------------------------------------------------------
  // 2) 等值线（marching squares）
  // ---------------------------------------------------------------------------
  // 返回 { level: [ {x1,y1,x2,y2}, ... ] }
  function contours(o) {
    var g = o.grid, cols = o.cols, rows = o.rows;
    var dx = (o.x1 - o.x0) / (cols - 1), dy = (o.y1 - o.y0) / (rows - 1);
    var levels = o.levels || [];
    var out = {};
    levels.forEach(function (lv) {
      var segs = [];
      for (var j = 0; j < rows - 1; j++) {
        for (var i = 0; i < cols - 1; i++) {
          var v = [g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]]; // 上 右 下 左
          if (v[0] == null || v[1] == null || v[2] == null || v[3] == null) continue;
          var pts = [];
          function t(a, b) { return (lv - a) / (b - a); }
          function cross(a, b) { return (a < lv && b >= lv) || (a >= lv && b < lv); }
          if (cross(v[0], v[1])) pts.push({ x: o.x0 + (i + t(v[0], v[1])) * dx, y: o.y0 + j * dy });
          if (cross(v[1], v[2])) pts.push({ x: o.x0 + (i + 1) * dx, y: o.y0 + (j + t(v[1], v[2])) * dy });
          if (cross(v[2], v[3])) pts.push({ x: o.x0 + (i + 1 - t(v[3], v[2])) * dx, y: o.y0 + (j + 1) * dy });
          if (cross(v[3], v[0])) pts.push({ x: o.x0 + i * dx, y: o.y0 + (j + 1 - t(v[0], v[3])) * dy });
          if (pts.length === 2) segs.push({ x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y });
          else if (pts.length === 4) {
            // 鞍点：按四角均值判定连通方式
            var avg = (v[0] + v[1] + v[2] + v[3]) / 4;
            if (avg >= lv) { segs.push({ x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y }); segs.push({ x1: pts[2].x, y1: pts[2].y, x2: pts[3].x, y2: pts[3].y }); }
            else { segs.push({ x1: pts[0].x, y1: pts[0].y, x2: pts[3].x, y2: pts[3].y }); segs.push({ x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y }); }
          }
        }
      }
      out[lv] = segs;
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // 3) 限值标准与达标判定
  // ---------------------------------------------------------------------------
  // GB 3096-2008 声环境功能区环境噪声限值（昼/夜 dB(A)）
  var GB3096 = [
    { key: '0', name: '0 类：康复疗养区等特别需要安静的区域', day: 50, night: 40 },
    { key: '1', name: '1 类：居住、医疗、文教、行政办公为主区域', day: 55, night: 45 },
    { key: '2', name: '2 类：居住、商业、工业混杂区', day: 60, night: 50 },
    { key: '3', name: '3 类：工业生产、仓储物流为主区域', day: 65, night: 55 },
    { key: '4a', name: '4a 类：高速公路、一级二级公路、城市快速路等两侧', day: 70, night: 55 },
    { key: '4b', name: '4b 类：铁路干线两侧', day: 70, night: 60 }
  ];
  // GB 55016-2021 表 2.1.3 外部噪声源传播至主要功能房间室内限值（昼/夜）
  var GB55016_OUT = [
    { key: 'sleep', name: '睡眠', day: 40, night: 30 },
    { key: 'daily', name: '日常生活', day: 40, night: 40 },
    { key: 'study', name: '阅读、自学、思考', day: 35, night: 35 },
    { key: 'work', name: '教学、医疗、办公、会议', day: 40, night: 40 }
  ];
  // GB 55016-2021 表 2.1.4 建筑物内部建筑设备传播至室内限值（不分昼夜）
  var GB55016_EQ = [
    { key: 'sleep', name: '睡眠', day: 33, night: 33 },
    { key: 'daily', name: '日常生活', day: 40, night: 40 },
    { key: 'study', name: '阅读、自学、思考', day: 40, night: 40 },
    { key: 'work', name: '教学、医疗、办公、会议', day: 45, night: 45 },
    { key: 'public', name: '人员密集的公共空间', day: 55, night: 55 }
  ];

  var TABLES = {
    'gb3096': { name: 'GB 3096-2008 声环境功能区（室外）', rows: GB3096, relaxNote: null },
    'gb55016-out': { name: 'GB 55016-2021 表 2.1.3 外部噪声源传入室内', rows: GB55016_OUT, relaxNote: '建筑位于 2/3/4 类声环境功能区时限值可放宽 5 dB' },
    'gb55016-eq': { name: 'GB 55016-2021 表 2.1.4 建筑内部设备传播至室内', rows: GB55016_EQ, relaxNote: null }
  };

  function findRow(table, key) {
    var rows = TABLES[table] ? TABLES[table].rows : [];
    for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i];
    return null;
  }

  // 达标判定：{table, key, period:'day'|'night', leq, relax5}
  function checkLimit(o) {
    var row = findRow(o.table, o.key);
    if (!row) return { ok: false, error: '未知的标准表或类别' };
    var leq = num(o.leq);
    if (leq == null) return { ok: false, error: '请输入噪声级 LAeq' };
    var period = o.period === 'night' ? 'night' : 'day';
    var limit = row[period];
    var relaxed = false;
    if (o.relax5 && TABLES[o.table].relaxNote) { limit += 5; relaxed = true; }
    return {
      ok: true, row: row, period: period, limit: limit, leq: leq,
      pass: leq <= limit, margin: limit - leq, relaxed: relaxed,
      standard: TABLES[o.table].name
    };
  }

  var API = {
    Env: Env,
    gridLevels: gridLevels, contours: contours,
    GB3096: GB3096, GB55016_OUT: GB55016_OUT, GB55016_EQ: GB55016_EQ,
    TABLES: TABLES, checkLimit: checkLimit
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NoiseMap = API;
})(typeof window !== 'undefined' ? window : this);
