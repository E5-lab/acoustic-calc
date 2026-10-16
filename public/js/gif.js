/*
 * gif.js — 极简 GIF89a 编码器（零依赖，UMD）
 * 浏览器挂 window.GifEnc，Node 下 module.exports。
 *
 * 仅实现动图导出所需的最小集合：
 *   - 固定 8×8×4 = 256 色全局调色板（暖色分辨率更高，适合声场彩图）
 *   - 4×4 Bayer 有序抖动
 *   - GIF 变字长 LZW（min code size = 8）
 *   - NETSCAPE2.0 循环扩展块
 * 输入为逐帧 RGBA 像素（Uint8ClampedArray），输出可直接落盘的 GIF 字节。
 */
(function (global) {
  'use strict';

  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* 256 色调色板：R 8 级 × G 8 级 × B 4 级 */
  function palette() {
    var p = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      p[i * 3] = Math.round(((i >> 5) & 7) * 255 / 7);
      p[i * 3 + 1] = Math.round(((i >> 2) & 7) * 255 / 7);
      p[i * 3 + 2] = Math.round((i & 3) * 255 / 3);
    }
    return p;
  }

  function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  /* 把 RGBA 序列量化成调色板索引（带 Bayer 抖动） */
  function quantize(rgba, w, h) {
    var idx = new Uint8Array(w * h);
    var sR = 255 / 7, sG = 255 / 7, sB = 255 / 3;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        var d = (BAYER[((y & 3) << 2) | (x & 3)] / 16) - 0.5;
        var r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
        /* 先夹住 0–255 再抖动：否则纯白会被负抖动量推低一档，纯黑被推高一档 */
        /* +1e-9 抵消浮点误差：满量程 255 除以步长理论上恰为 7，实际可能得 6.4999… */
        var ri = Math.round(clamp255(r + d * sR) / sR + 1e-9),
          gi = Math.round(clamp255(g + d * sG) / sG + 1e-9),
          bi = Math.round(clamp255(b + d * sB) / sB + 1e-9);
        ri = ri < 0 ? 0 : (ri > 7 ? 7 : ri);
        gi = gi < 0 ? 0 : (gi > 7 ? 7 : gi);
        bi = bi < 0 ? 0 : (bi > 3 ? 3 : bi);
        idx[y * w + x] = (ri << 5) | (gi << 2) | bi;
      }
    }
    return idx;
  }

  /* GIF 变字长 LZW：返回码流字节（未分块） */
  function lzwCodes(idx, minCodeSize) {
    var bytes = [];
    var cur = 0, curBits = 0;
    var clear = 1 << minCodeSize, eoi = clear + 1;
    var codeSize = minCodeSize + 1, MAX = 4096;
    var next = eoi + 1;
    var dict = new Map();

    function emit(code) {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) { bytes.push(cur & 255); cur >>= 8; curBits -= 8; }
    }
    function reset() { emit(clear); dict.clear(); next = eoi + 1; codeSize = minCodeSize + 1; }

    if (!idx.length) { emit(clear); emit(eoi); }
    else {
      emit(clear);
      var prefix = idx[0];
      for (var i = 1; i < idx.length; i++) {
        var k = idx[i];
        var key = prefix * 256 + k;
        var got = dict.get(key);
        if (got !== undefined) { prefix = got; continue; }
        emit(prefix);
        if (next < MAX) {
          dict.set(key, next++);
          if (next === (1 << codeSize) && codeSize < 12) codeSize++;
        } else reset();
        prefix = k;
      }
      emit(prefix);
      emit(eoi);
    }
    if (curBits > 0) bytes.push(cur & 255);
    return bytes;
  }

  /* 把字节数组写成 ≤255 字节的 GIF 子块 */
  function subBlocks(out, bytes) {
    var i = 0, n = bytes.length;
    while (i < n) {
      var len = Math.min(255, n - i);
      out.push(len);
      for (var k = 0; k < len; k++) out.push(bytes[i + k]);
      i += len;
    }
    out.push(0);
  }

  function u16(out, v) { out.push(v & 255, (v >> 8) & 255); }

  /*
   * encode({ width, height, frames:[Uint8ClampedArray], delayMs, loop })
   *   frames 每项为 RGBA 像素，长度须为 width*height*4
   * 返回 Uint8Array（GIF 文件字节）
   */
  function encode(o) {
    o = o || {};
    var w = Math.max(1, Math.round(o.width || 1));
    var h = Math.max(1, Math.round(o.height || 1));
    var frames = o.frames || [];
    var delay = Math.max(2, Math.round((o.delayMs == null ? 100 : o.delayMs) / 10)); // 单位 1/100 s
    var loop = o.loop == null ? 0 : Math.round(o.loop);
    var pal = o.palette || palette();

    var out = [];
    'GIF89a'.split('').forEach(function (c) { out.push(c.charCodeAt(0)); });
    u16(out, w); u16(out, h);
    out.push(0xF7, 0, 0);                       // 全局色表 256 项 / 背景 0 / 像素比 0
    for (var p = 0; p < 768; p++) out.push(pal[p]);

    // NETSCAPE2.0 循环扩展
    out.push(0x21, 0xFF, 0x0B);
    'NETSCAPE2.0'.split('').forEach(function (c) { out.push(c.charCodeAt(0)); });
    out.push(0x03, 0x01); u16(out, loop); out.push(0x00);

    for (var f = 0; f < frames.length; f++) {
      out.push(0x21, 0xF9, 0x04, 0x04);         // 图形控制扩展：处置方式 = 保留
      u16(out, delay);
      out.push(0x00, 0x00);
      out.push(0x2C);                            // 图像描述符
      u16(out, 0); u16(out, 0); u16(out, w); u16(out, h);
      out.push(0x00);
      out.push(8);                               // LZW 最小码长
      subBlocks(out, lzwCodes(quantize(frames[f], w, h), 8));
    }
    out.push(0x3B);
    return new Uint8Array(out);
  }

  var API = { palette: palette, quantize: quantize, lzwCodes: lzwCodes, encode: encode };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.GifEnc = API;
})(typeof window !== 'undefined' ? window : this);
