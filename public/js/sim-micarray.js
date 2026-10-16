/*
 * sim-micarray.js — 麦克风阵列波束形成（接收端）内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimMicarray，Node 下 module.exports。
 *
 * 物理模型：均匀线性阵列（ULA）沿 x 轴排列，窄带延时-求和（delay-and-sum）波束形成，
 *   接收来自角度 θ（自阵列法线 / broadside 起算）的远场平面波并导向至 θ_steer。
 *   公式均为阵列信号处理中的公开经典结果，不含任何第三方商业实现。
 *
 * 单位约定：SI。长度 m，频率 Hz，声速 c 默认 343 m/s（20 ℃ 空气）。
 *   波数        k = 2π f / c
 *   阵因子      AF(θ) = | (1/N) Σ_{n=0}^{N-1} exp( j·k·d·n·(sinθ − sinθ_steer) ) |
 *   dB 归一化   AF_dB(θ) = 20·log10( AF(θ) + 1e-9 )        （峰值处 = 0 dB）
 *   栅瓣条件    d·sinθ_g = m·λ + d·sinθ_steer  (m≠0)  →  sinθ_g = sinθ_steer + m·λ/d
 *   当 d ≤ λ/2 时 |m·λ/d| ≥ 2 > 1，故在 [-90°,90°] 内无栅瓣。
 */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;

  // 基础数值解析（空 / 非数 → null）
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // 公共合法性校验，返回错误对象或 null
  function validate(opts) {
    var N = num(opts.N);
    var d = num(opts.d);
    var f = num(opts.f);
    var c = num(opts.c);
    var steer = num(opts.steer);
    if (N == null || !(N >= 2)) return { ok: false, error: '麦克风数 N 必须为整数且 ≥ 2' };
    if (d == null || !(d > 0)) return { ok: false, error: '阵元间距 d 必须为正数（m）' };
    if (f == null || !(f > 0)) return { ok: false, error: '频率 f 必须为正数（Hz）' };
    if (c == null || !(c > 0)) return { ok: false, error: '声速 c 必须为正数（m/s）' };
    if (steer == null || steer < -90 || steer > 90) return { ok: false, error: '导向角 steer 须落在 -90° … 90° 之间' };
    return {
      ok: true,
      N: Math.round(N),
      d: d,
      f: f,
      c: c,
      steer: steer
    };
  }

  /* ----------------------------- 主入口：方向图 ----------------------------- */
  function pattern(opts) {
    opts = opts || {};
    var v = validate(opts);
    if (!v.ok) return v;
    var N = v.N, d = v.d, f = v.f, c = v.c, steer = v.steer;

    var k = 2 * Math.PI * f / c;       // 波数
    var lambda = c / f;                // 波长 m
    var kd = k * d;
    var sinSteer = Math.sin(steer * DEG);

    var thetaDeg = [];
    var AFmagDb = [];
    var maxDb = -Infinity;
    var maxIdx = 0;

    // 采样网格 -90° … 90°，步长 1°
    for (var i = 0; i <= 180; i++) {
      var th = -90 + i;               // 角度（度）
      thetaDeg.push(th);
      var s = Math.sin(th * DEG) - sinSteer;
      // 阵因子求和：复指数相位 k·d·n·(sinθ − sinθ_steer)
      var re = 0, im = 0;
      for (var n = 0; n < N; n++) {
        var ph = kd * n * s;
        re += Math.cos(ph);
        im += Math.sin(ph);
      }
      var mag = Math.sqrt(re * re + im * im) / N;   // |AF| ∈ [0,1]
      var db = 20 * Math.log10(mag + 1e-9);          // 归一化后峰值≈0 dB
      AFmagDb.push(db);
      if (db > maxDb) { maxDb = db; maxIdx = i; }
    }

    // 主瓣宽度：-3 dB 点之间的角宽（围绕被导向的主瓣）
    var mainLobeWidth = mainLobeWidthAt(AFmagDb, maxIdx);

    var notes = [
      '阵元数 N 越大，主瓣越窄、角度分辨力越高（近似半功率波束宽 ≈ 0.886·λ/(N·d) 弧度）。',
      '当阵元间距 d > λ/2 时，方向图会出现与主瓣等高的栅瓣（grating lobes），造成空间角度混叠。',
      '导向角 θ_steer 通过延时-求和把主瓣指向目标方向；θ 自阵列法线（broadside）起算，左右各 ±90°。',
      '当前波长 λ = c/f = ' + lambda.toFixed(4) + ' m；d/λ = ' + (d / lambda).toFixed(4) + '。'
    ];

    return {
      ok: true,
      k: k,
      thetaDeg: thetaDeg,
      AFmagDb: AFmagDb,
      mainLobeWidth: mainLobeWidth,
      steer: steer,
      N: N,
      d: d,
      f: f,
      c: c,
      lambda: lambda,
      notes: notes
    };
  }

  // 在峰值 maxIdx 两侧寻找 -3 dB 穿越点并线性插值，返回角宽（度）
  function mainLobeWidthAt(db, maxIdx) {
    var left = maxIdx;
    while (left > 0 && db[left - 1] > -3) left--;
    var right = maxIdx;
    while (right < db.length - 1 && db[right + 1] > -3) right++;

    // 若边界未达 -3 dB，按最后两点夹紧
    var leftDeg, rightDeg;
    if (db[left] <= -3 && left < maxIdx) {
      // 穿越在 left-1 与 left 之间
      var aL = db[left - 1], bL = db[left];
      var tL = (aL - (-3)) / (aL - bL);   // 0..1
      leftDeg = (left - 1) + tL;          // 索引（每格 1°），即度数
    } else {
      leftDeg = left;
    }
    if (db[right] <= -3 && right > maxIdx) {
      var aR = db[right - 1], bR = db[right];
      var tR = (aR - (-3)) / (aR - bR);
      rightDeg = (right - 1) + tR;
    } else {
      rightDeg = right;
    }
    return rightDeg - leftDeg;   // 度数
  }

  /* ----------------------------- 栅瓣角度 ----------------------------- */
  function grating(opts) {
    opts = opts || {};
    var v = validate(opts);
    if (!v.ok) return v;
    var d = v.d, f = v.f, c = v.c, steer = v.steer;

    var lambda = c / f;
    var base = Math.sin(steer * DEG);
    var ratio = lambda / d;             // λ/d
    var angles = [];

    // m = 1,2,3 … ：sinθ_g 单调递增，超过 1 即停止
    for (var m = 1; m < 1000; m++) {
      var s = base + m * ratio;
      if (s > 1) break;
      angles.push(Math.asin(s) / DEG);
    }
    // m = -1,-2,-3 … ：sinθ_g 单调递减，低于 -1 即停止
    for (var m2 = -1; m2 > -1000; m2--) {
      var s2 = base + m2 * ratio;
      if (s2 < -1) break;
      angles.push(Math.asin(s2) / DEG);
    }

    angles.sort(function (a, b) { return a - b; });
    if (angles.length === 0) return { ok: true, angles: null };
    return { ok: true, angles: angles };
  }

  var API = {
    pattern: pattern,
    grating: grating
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimMicarray = API;
  }
})(typeof window !== 'undefined' ? window : this);
