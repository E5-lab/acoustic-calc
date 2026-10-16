/*
 * sim-echo.js — 脉冲回波（回声）测距内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimEcho，Node 下 module.exports。
 *
 * 物理模型（经典声学往返测距，无第三方商业实现）：
 *   - 单程路径 = c·t/2，往返路径 = 2d，故：
 *       已知距离 d：t = 2d / c
 *       已知时延 t：d = c·t / 2
 *   - 球状扩散衰减（往返路径 2d，参考 1 m）：
 *       levelDropDb = 20·log10(2d)
 *   - 距离分辨率（由时间分辨率 dt 决定）：
 *       resolution = c·dt / 2
 *   单位：SI（米 m、秒 s、米/秒 m/s、分贝 dB）。默认空气声速 c = 343 m/s。
 */
(function (global) {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function range(opts) {
    opts = opts || {};
    var mode = opts.mode === 'time' ? 'time' : 'dist';

    var c = num(opts.c);
    if (!(c > 0)) {
      return { ok: false, error: '声速 c 必须为正数（m/s）' };
    }

    var dt = num(opts.dt);
    if (!(dt > 0)) dt = 1e-4; // 时间分辨率默认 1e-4 s

    var res = { ok: true, mode: mode, c: c, dt: dt };

    if (mode === 'dist') {
      // (a) 已知距离求往返时延
      var d = num(opts.d);
      if (!(d > 0)) return { ok: false, error: '距离 d 必须为正数（m）' };
      res.d = d;
      res.t = 2 * d / c;                              // 往返时延
      res.levelDropDb = 20 * Math.log10(2 * d);       // 球状扩散衰减（参考 1 m）
      res.resolution = c * dt / 2;                    // 距离分辨率
      res.notes = [
        '已知距离求时延：往返路径 = 2d，故 t = 2d / c。',
        '球状扩散衰减（往返路径 2d，参考 1 m）：levelDropDb = 20·log10(2d)。',
        '距离分辨率 = c·dt/2：时基分辨率 dt 越小，测距越精细。',
        '水下 c≈1500 m/s，相同时延下可测距离远大于空气。'
      ];
    } else {
      // (b) 已知往返时延求距离
      var t = num(opts.t);
      if (!(t >= 0)) return { ok: false, error: '往返时延 t 必须为非负数（s）' };
      res.t = t;
      res.d = c * t / 2;                              // 单程路径 = c·t/2
      res.levelDropDb = 20 * Math.log10(2 * res.d);   // 球状扩散衰减（参考 1 m）
      res.resolution = c * dt / 2;                    // 距离分辨率
      res.notes = [
        '已知时延求距离：单程路径 = c·t/2，故 d = c·t/2（仅取往返时间的一半）。',
        '球状扩散衰减：levelDropDb = 20·log10(2d)。',
        '距离分辨率 = c·dt/2。',
        '水下 c≈1500 m/s，相同时延下可测距离远大于空气。'
      ];
    }
    return res;
  }

  var API = { range: range };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimEcho = API;
  }
})(typeof window !== 'undefined' ? window : this);
