/*
 * gif.test.js - 零依赖 GIF89a 编码器 (node tests/gif.test.js)
 *
 * 覆盖：调色板构造、Bayer 抖动量化、LZW 码流自洽（解码回原索引序列）、
 * 以及 GIF 文件结构（头 / 逻辑屏幕 / 全局色表 / NETSCAPE 循环块 / 每帧图像块 / 尾部）。
 */
var G = require('../public/js/gif.js');

var passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function approx(name, got, want, tol) {
  var ok = Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + got); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want); }
}

console.log('[1] 全局调色板');
var pal = G.palette();
assert('调色板长度 = 256 × 3', pal.length === 768);
assert('首项 = 黑 (0,0,0)', pal[0] === 0 && pal[1] === 0 && pal[2] === 0);
assert('含满红通道项', (function () {
  for (var i = 0; i < 256; i++) if (pal[i * 3] === 255) return true;
  return false;
})());
assert('通道取值在 0–255', (function () {
  for (var i = 0; i < 768; i++) if (pal[i] < 0 || pal[i] > 255) return false;
  return true;
})());

console.log('[2] 量化（Bayer 抖动）');
(function () {
  var w = 8, h = 4, px = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) { px[i * 4] = 200; px[i * 4 + 1] = 100; px[i * 4 + 2] = 50; px[i * 4 + 3] = 255; }
  var idx = G.quantize(px, w, h);
  assert('索引数 = 像素数', idx.length === w * h);
  assert('索引落在 0–255', (function () {
    for (var j = 0; j < idx.length; j++) if (idx[j] < 0 || idx[j] > 255) return false;
    return true;
  })());
  /* 抖动应让常量输入产生多于 1 种索引（而非整块死板同色） */
  var uniq = {};
  idx.forEach(function (v) { uniq[v] = 1; });
  assert('抖动产生多种索引（避免色带）', Object.keys(uniq).length > 1);
  var pure = new Uint8ClampedArray(w * h * 4);
  for (i = 0; i < w * h; i++) { pure[i * 4] = 255; pure[i * 4 + 1] = 255; pure[i * 4 + 2] = 255; pure[i * 4 + 3] = 255; }
  var ip = G.quantize(pure, w, h);
  assert('纯白 -> 索引 255', (function () {
    for (var j = 0; j < ip.length; j++) if (ip[j] !== 255) return false;
    return true;
  })());
  var black = new Uint8ClampedArray(w * h * 4);
  var ib = G.quantize(black, w, h);
  assert('纯黑 -> 索引 0', (function () {
    for (var j = 0; j < ib.length; j++) if (ib[j] !== 0) return false;
    return true;
  })());
})();

console.log('[3] LZW 编码自洽（解码回原索引）');
/* 独立实现一份 GIF LZW 解码器，用于验证编码码流 */
function lzwDecode(bytes, minCodeSize) {
  var bits = [], i, b;
  for (i = 0; i < bytes.length; i++) {
    b = bytes[i];
    for (var k = 0; k < 8; k++) bits.push((b >> k) & 1);   // GIF 为 LSB 优先
  }
  var clear = 1 << minCodeSize, eoi = clear + 1;
  var codeSize = minCodeSize + 1, pos = 0, out = [];
  var dict = [], next = eoi + 1;
  function reset() {
    dict = []; next = eoi + 1;
    for (var q = 0; q < clear; q++) dict[q] = [q];
    dict[clear] = null; dict[eoi] = null;
    codeSize = minCodeSize + 1;
  }
  function readCode() {
    if (pos + codeSize > bits.length) return -1;
    var v = 0;
    for (var q = 0; q < codeSize; q++) v |= bits[pos + q] << q;
    pos += codeSize;
    return v;
  }
  reset();
  var prev = null;
  while (true) {
    var code = readCode();
    if (code < 0) break;
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    var entry;
    if (code < next && dict[code]) entry = dict[code];
    else if (prev) entry = prev.concat([prev[0]]);
    else break;
    out = out.concat(entry);
    if (prev) {
      dict[next++] = prev.concat([entry[0]]);
      if (next === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}
(function () {
  var w = 16, h = 16, px = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    px[i * 4] = (i * 7) & 255; px[i * 4 + 1] = (i * 13) & 255; px[i * 4 + 2] = (i * 29) & 255; px[i * 4 + 3] = 255;
  }
  var idx = G.quantize(px, w, h);
  var codes = G.lzwCodes(idx, 8);
  assert('LZW 码流非空', codes && codes.length > 0);
  var got = lzwDecode(codes, 8);
  assert('解码长度 = 原索引长度', got.length === idx.length);
  var same = true;
  for (var j = 0; j < idx.length; j++) if (got[j] !== idx[j]) { same = false; break; }
  assert('解码结果与原索引逐点一致', same);

  /* 全同色（长游程）也应正确 */
  var flat = new Uint8Array(4096);
  for (j = 0; j < flat.length; j++) flat[j] = 7;
  var got2 = lzwDecode(G.lzwCodes(flat, 8), 8);
  assert('长游程解码正确', got2.length === flat.length && got2.every(function (v) { return v === 7; }));
})();

console.log('[4] GIF 文件结构');
(function () {
  var w = 12, h = 8, nf = 3;
  var frames = [];
  for (var f = 0; f < nf; f++) {
    var px = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      px[i * 4] = (i * 5 + f * 40) & 255; px[i * 4 + 1] = (i * 11) & 255; px[i * 4 + 2] = (i * 3) & 255; px[i * 4 + 3] = 255;
    }
    frames.push(px);
  }
  var g = G.encode({ width: w, height: h, frames: frames, delayMs: 80, loop: 0 });
  assert('输出为字节数组', g instanceof Uint8Array && g.length > 0);
  function tag(off) { return String.fromCharCode(g[off], g[off + 1], g[off + 2], g[off + 3], g[off + 4], g[off + 5]); }
  assert('GIF89a 头', tag(0) === 'GIF89a');
  assert('逻辑屏宽写入正确', g[6] | (g[7] << 8));
  approx('宽度', g[6] | (g[7] << 8), w, 0);
  approx('高度', g[8] | (g[9] << 8), h, 0);
  assert('全局色表标志 (0xF7) 且 256 项', g[10] === 0xF7);
  assert('色表 768 字节紧跟头部', g.length > 13 + 768);
  assert('NETSCAPE2.0 循环扩展存在', (function () {
    var s = '';
    for (var q = 0; q < g.length; q++) s += String.fromCharCode(g[q]);
    return s.indexOf('NETSCAPE2.0') > 0;
  })());
  /* 每个图形控制扩展后紧跟一个图像描述符 0x2C，按此定位统计帧数 */
  var nImg = 0;
  for (var q = 0; q < g.length - 8; q++) {
    if (g[q] === 0x21 && g[q + 1] === 0xF9 && g[q + 2] === 0x04 && g[q + 8] === 0x2C) nImg++;
  }
  approx('帧数（按图形控制扩展计数）', nImg, nf, 0);
  assert('文件尾 0x3B', g[g.length - 1] === 0x3B);
  /* 图形控制扩展里的延时（1/100 s） */
  assert('延时写入 80 ms -> 8', (function () {
    for (var q = 0; q < g.length - 2; q++) {
      if (g[q] === 0x21 && g[q + 1] === 0xF9 && g[q + 2] === 0x04) return (g[q + 4] | (g[q + 5] << 8)) === 8;
    }
    return false;
  })());
  var g2 = G.encode({ width: w, height: h, frames: frames, delayMs: 80, loop: 0, palette: pal });
  assert('可传入自定义调色板且结果一致', g2.length === g.length);
})();

console.log('[5] 退化输入');
(function () {
  var one = G.encode({ width: 1, height: 1, frames: [new Uint8ClampedArray(4)], delayMs: 10, loop: 0 });
  assert('1×1 单帧可编码', one.length > 0 && one[one.length - 1] === 0x3B);
  var noFrames = G.encode({ width: 8, height: 8, frames: [] });
  assert('空帧列表仍能产出合法文件（仅头 + 尾）',
    String.fromCharCode(noFrames[0], noFrames[1], noFrames[2]) === 'GIF' && noFrames[noFrames.length - 1] === 0x3B);
  var dflt = G.encode({});
  assert('无参数不抛异常', dflt && dflt.length > 0);
  assert('最小延时被夹到 >= 2/100 s', (function () {
    var g = G.encode({ width: 4, height: 4, frames: [new Uint8ClampedArray(64)], delayMs: 0 });
    for (var q = 0; q < g.length - 2; q++) {
      if (g[q] === 0x21 && g[q + 1] === 0xF9 && g[q + 2] === 0x04) return (g[q + 4] | (g[q + 5] << 8)) >= 2;
    }
    return false;
  })());
})();

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
