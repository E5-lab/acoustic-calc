/*
 * make-icons.js — 生成 PWA 图标 icon-192.png / icon-512.png（零依赖，仅 Node 内置 zlib）
 *
 * 设计与 favicon.svg 一致：
 *   圆角矩形（rx = 7/32），蓝→紫对角渐变（#2563eb → #7c3aed），
 *   白色折线波形（stroke 2.6/32，圆头圆角）。
 *
 * 光栅化：2×2 超采样抗锯齿；波形按「点到线段距离」判定覆盖（含圆头端帽）。
 * PNG 编码：RGBA 8-bit、filter 0、zlib deflate、CRC32。
 *
 * 运行：node tools/make-icons.js  （在仓库根目录）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG 编码 ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // filter 0 / interlace 0 默认为 0
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------- 绘制 ---------------- */
const HEX = { blue: [0x25, 0x63, 0xeb], purple: [0x7c, 0x3a, 0xed], white: [255, 255, 255] };

// 波形折线（viewBox 32×32）：M4 16 h3 l3 -7 l4 14 l3 -9 l2 4 h9
const PTS32 = [[4, 16], [7, 16], [10, 9], [14, 23], [17, 14], [19, 18], [28, 18]];
const STROKE32 = 2.6;
const RX32 = 7;

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function insideRoundedRect(nx, ny, rx) {  // 归一化 0..1 坐标，rx 为圆角（同单位）
  const qx = Math.max(rx - nx, nx - (1 - rx), 0);
  const qy = Math.max(rx - ny, ny - (1 - rx), 0);
  return Math.hypot(qx, qy) <= rx;
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = 2;                      // 每像素 2×2 超采样
  const grad = [HEX.blue, HEX.purple];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0, r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          // 子采样中心 → 归一化坐标（viewBox 32 单位）
          const u = (x + (sx + 0.5) / S) / size * 32;
          const v = (y + (sy + 0.5) / S) / size * 32;
          const nu = u / 32, nv = v / 32;
          if (!insideRoundedRect(nu, nv, RX32 / 32)) continue;
          // 对角渐变：t = (u_n + v_n) / 2
          const t = (nu + nv) / 2;
          const c0 = grad[0], c1 = grad[1];
          let cr = c0[0] + (c1[0] - c0[0]) * t;
          let cg = c0[1] + (c1[1] - c0[1]) * t;
          let cb = c0[2] + (c1[2] - c0[2]) * t;
          // 波形覆盖判定（点到折线各线段的距离，圆头端帽自然形成）
          const half = STROKE32 / 2;
          let d = Infinity;
          for (let i = 0; i < PTS32.length - 1; i++) {
            const dd = distToSegment(u, v, PTS32[i][0], PTS32[i][1], PTS32[i + 1][0], PTS32[i + 1][1]);
            if (dd < d) d = dd;
          }
          if (d <= half) { cr = 255; cg = 255; cb = 255; }
          a++; r += cr; g += cg; b += cb;
        }
      }
      const o = (y * size + x) * 4;
      const n = S * S;
      rgba[o] = Math.round(r / n);
      rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n);
      rgba[o + 3] = Math.round(a / n * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = path.join(__dirname, '..', 'public');
[192, 512].forEach((size) => {
  const buf = makeIcon(size);
  const f = path.join(outDir, 'icon-' + size + '.png');
  fs.writeFileSync(f, buf);
  console.log('written', f, buf.length, 'bytes');
});
