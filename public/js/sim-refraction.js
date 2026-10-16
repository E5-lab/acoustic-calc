/*
 * sim-refraction.js — 温度梯度声折射（射线弯曲）声学内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.SimRefraction，Node 下 module.exports。
 *
 * 物理模型：射线声学 + 声速随高度线性变化 c(z) = c0 + g·z。
 *   z 为离地高度（m），c0 为地面声速（m/s），g 为声速梯度（(m/s)/m）。
 *   Snell 不变量：cosθ/c = cosθ0/c0 = 常数（θ 为声线仰角，自水平面起算）。
 *   微分形式：dθ/dx = −g/c(z)，dz/dx = tanθ。
 *   折返点（仅 g>0 且 θ0>0）：θ→0 时 c(z_tp) = c0/cosθ0 ⇒ z_tp = c0·(secθ0 − 1)/g。
 *   g<0（正常温度递减）：声线上翘，地面附近形成声影区；g=0：直线传播。
 *
 * 数值方法：固定步长 Euler 积分（dx 默认 1 m，直线情形精确）。
 *   触地（z<0）即停止（hitGround=true）；折返不做人工反射——θ 穿越 0 后自然变负、
 *   声线自行弯回地面（turned=true），与微分方程自洽。
 *
 * 单位约定（SI）：长度 m，声速 m/s，梯度 (m/s)/m；角度输入 deg，内部 rad。
 *   本内核为射线声学近似，不含绕射/散射；实际大气还受风切变影响。
 */
(function (global) {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /* ----------------------- 基础公式 ----------------------- */
  // 声速随高度线性变化：c(z) = c0 + g·z
  function soundSpeed(z, c0, g) {
    var zz = num(z), c0n = num(c0), gn = num(g);
    if (zz == null || c0n == null || gn == null) return null;
    return c0n + gn * zz;
  }

  // 折返点高度 z_tp = c0·(secθ0 − 1)/g；g≤0 或 θ0≤0 时不折返，返回 null
  function turningHeight(theta0Deg, c0, g) {
    var th = num(theta0Deg), c0n = num(c0), gn = num(g);
    if (th == null || c0n == null || gn == null) return null;
    if (!(gn > 0) || !(th > 0) || !(c0n > 0) || th >= 90) return null;
    var rad = (th * Math.PI) / 180;
    return (c0n * (1 / Math.cos(rad) - 1)) / gn;
  }

  /* ----------------------- 主入口：射线追踪 ----------------------- */
  // opts: { dx=1, xMax=24000, zMax=7000 }
  // 返回 { ok, points:[{x,z}], turned, turningHeight, hitGround, maxHeight }
  function traceRay(theta0Deg, c0, g, opts) {
    opts = opts || {};
    var th = num(theta0Deg), c0n = num(c0), gn = num(g);
    var dx = num(opts.dx), xMax = num(opts.xMax), zMax = num(opts.zMax);
    if (dx == null) dx = 1;
    if (xMax == null) xMax = 24000;
    if (zMax == null) zMax = 7000;

    if (th == null || c0n == null || gn == null) {
      return { ok: false, error: '仰角 θ₀、声速 c₀ 与梯度 g 必须为有效数值' };
    }
    if (!(c0n > 0)) return { ok: false, error: '地面声速 c₀ 必须为正数（m/s）' };
    if (!(dx > 0)) return { ok: false, error: '积分步长 dx 必须为正数（m）' };
    if (!(xMax > 0)) return { ok: false, error: '积分上限 xMax 必须为正数（m）' };
    if (!(zMax > 0)) return { ok: false, error: '积分上限 zMax 必须为正数（m）' };

    var theta = (th * Math.PI) / 180;
    var x = 0, z = 0;
    var points = [{ x: 0, z: 0 }];
    var turned = false, hitGround = false, maxHeight = 0;
    var steps = 0, maxSteps = 4000000; // 兜底防死循环

    while (x < xMax && steps++ < maxSteps) {
      var c = c0n + gn * z;
      if (!(c > 0)) break; // 声速非正：模型失效，停止积分
      var thetaNext = theta - (gn / c) * dx; // dθ/dx = −g/c
      var zNext = z + Math.tan(theta) * dx;  // dz/dx = tanθ
      if (!turned && theta > 0 && thetaNext <= 0) turned = true; // 折返：θ 由正穿越 0
      x += dx;
      z = zNext;
      theta = thetaNext;
      if (z > maxHeight) maxHeight = z;
      points.push({ x: x, z: z });
      if (z < 0) { hitGround = true; break; } // 触地即停
      if (z > zMax) break;                    // 超出高度上限
    }

    return {
      ok: true,
      points: points,
      turned: turned,
      turningHeight: turningHeight(th, c0n, gn),
      hitGround: hitGround,
      maxHeight: maxHeight
    };
  }

  var API = {
    soundSpeed: soundSpeed,
    turningHeight: turningHeight,
    traceRay: traceRay
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.SimRefraction = API;
  }
})(typeof window !== 'undefined' ? window : this);
