/*
 * audio-io.test.js - 音频 I/O 助手的 WAV 解码器（node tests/audio-io.test.js）
 * 覆盖：16/24/32-bit PCM 与 32-bit float、多声道取首声道、RIFF 对齐、容错。
 */
var AU = require('../public/js/aural.js');
var IO = require('../public/js/audio-io.js');

var passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 0.02 : tol;
  var ok = got != null && !isNaN(got) && Math.abs(got - want) <= tol;
  if (ok) { passed++; console.log('  PASS  ' + name + ' = ' + Number(got).toFixed(4)); }
  else { failed++; console.log('  FAIL  ' + name + ' got ' + got + ' want ~' + want + ' (+-' + tol + ')'); }
}
function assert(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

/* ---- 手工构造 WAV（便于覆盖 float / 24-bit / 多声道） ---- */
function buildWav(opts) {
  var n = opts.n, ch = opts.ch || 1, bits = opts.bits, format = opts.format;
  var bytes = bits / 8;
  var buf = new ArrayBuffer(44 + n * bytes * ch);
  var dv = new DataView(buf);
  function str(off, s) { for (var q = 0; q < s.length; q++) dv.setUint8(off + q, s.charCodeAt(q)); }
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * bytes * ch, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, format, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, opts.sr, true); dv.setUint32(28, opts.sr * bytes * ch, true);
  dv.setUint16(32, bytes * ch, true); dv.setUint16(34, bits, true);
  str(36, 'data'); dv.setUint32(40, n * bytes * ch, true);
  for (var i = 0; i < n; i++) {
    for (var c = 0; c < ch; c++) {
      var v = opts.gen(i, c);
      var off = 44 + (i * ch + c) * bytes;
      if (format === 3) dv.setFloat32(off, v, true);
      else if (bits === 16) dv.setInt16(off, Math.round(v * 32767), true);
      else if (bits === 24) {
        var q = Math.round(v * 8388607);
        dv.setUint8(off, q & 0xff);
        dv.setUint8(off + 1, (q >> 8) & 0xff);
        dv.setUint8(off + 2, (q >> 16) & 0xff);
      }
      else if (bits === 32) dv.setInt32(off, Math.round(v * 2147483647), true);
    }
  }
  return buf;
}

var sr = 48000, n = 480;
var sine = [];
for (var i = 0; i < n; i++) sine.push(0.5 * Math.sin(2 * Math.PI * 100 * i / sr));

console.log('16-bit PCM（aural.wavEncode 产出的格式）');
var u8 = AU.wavEncode(sine, sr);
var d16 = IO.wavDecode(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
assert('解码成功', !!d16);
assert('sampleRate = 48000', d16.sampleRate === 48000);
assert('channels = 1 / bits = 16', d16.channels === 1 && d16.bits === 16);
assert('length = 480', d16.samples.length === 480);
var maxErr16 = 0;
for (i = 0; i < n; i++) maxErr16 = Math.max(maxErr16, Math.abs(d16.samples[i] - sine[i]));
approx('16-bit 量化误差 < 1 LSB', maxErr16, 0, 1 / 32768);

console.log('\n32-bit IEEE float');
var dF = IO.wavDecode(buildWav({ n: n, bits: 32, format: 3, sr: sr, gen: function (i) { return sine[i]; } }));
assert('解码成功', !!dF);
assert('bits = 32 / format float', dF.bits === 32);
approx('float 首样本 = 0', dF.samples[0], 0, 1e-6);
approx('float 峰值 = 0.5', Math.max.apply(null, Array.prototype.slice.call(dF.samples)), 0.5, 1e-6);

console.log('\n24-bit PCM');
var d24 = IO.wavDecode(buildWav({ n: n, bits: 24, format: 1, sr: sr, gen: function (i) { return sine[i]; } }));
assert('解码成功', !!d24);
var maxErr24 = 0;
for (i = 0; i < n; i++) maxErr24 = Math.max(maxErr24, Math.abs(d24.samples[i] - sine[i]));
approx('24-bit 量化误差 < 1 LSB', maxErr24, 0, 1 / 8388608);

console.log('\n32-bit PCM');
var d32 = IO.wavDecode(buildWav({ n: n, bits: 32, format: 1, sr: sr, gen: function (i) { return sine[i]; } }));
assert('解码成功', !!d32);
approx('32-bit PCM 首样本 = 0', d32.samples[0], 0, 1e-9);

console.log('\n多声道取首声道');
var d2 = IO.wavDecode(buildWav({ n: n, ch: 2, bits: 16, format: 1, sr: sr, gen: function (i, c) { return c === 0 ? sine[i] : -sine[i]; } }));
assert('解码成功', !!d2);
assert('channels = 2', d2.channels === 2);
assert('length = 480（每声道）', d2.samples.length === 480);
approx('首声道 120 号样本 = 0.5·sin(2π·100·120/48000)', d2.samples[120], 0.5 * Math.sin(2 * Math.PI * 100 * 120 / sr), 1 / 32768);

console.log('\n容错');
assert('空 buffer → null', IO.wavDecode(new ArrayBuffer(0)) === null);
assert('非 RIFF → null', IO.wavDecode(new ArrayBuffer(64)) === null);
var junk = new Uint8Array(200); junk[0] = 0x52; junk[1] = 0x49; junk[2] = 0x46; junk[3] = 0x46;
junk[8] = 0x57; junk[9] = 0x41; junk[10] = 0x56; junk[11] = 0x45;
assert('缺 fmt/data → null', IO.wavDecode(junk.buffer) === null);
/* data chunk 声明长度超过实际：按可用字节解码 */
var cut = buildWav({ n: n, bits: 16, format: 1, sr: sr, gen: function (i) { return sine[i]; } }).slice(0, 44 + 240 * 2);
var dvCut = new DataView(cut);
dvCut.setUint32(40, 480 * 2, true);   // 声称 480 帧，实际只有 240
var dCut = IO.wavDecode(cut);
assert('data 超长时按可用字节解码', !!dCut && dCut.samples.length === 240);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
