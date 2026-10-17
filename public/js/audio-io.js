/*
 * audio-io.js — 「现场实测」分组共享的音频 I/O 助手（仅浏览器环境）
 * 挂载到 window.AudioIO；Node 下仅导出 wavDecode（纯函数，可单测）。
 *
 * 职责：
 *   1) ensureCtx() / playSignal() / stopPlayback()：AudioContext 懒加载与信号播放；
 *   2) Mic：getUserMedia 麦克风采集——ScriptProcessorNode 取原始样点，累积进
 *      samples 供离线分析（Farina 反卷积 / STIPA），同时逐帧回调供声级计与
 *      RTA 实时显示；
 *   3) wavDecode()：解析 WAV（16/24/32-bit PCM 与 32-bit float，多声道取首声道），
 *      供「上传录音文件」分析路径。
 *
 * 说明：
 *   - ScriptProcessorNode 在规范中已 deprecated，但各浏览器仍可用，且不需要
 *     独立的模块 URL（AudioWorklet 需要，与本站零构建约定冲突）。缓冲区 4096
 *     样点（~85 ms @48k），主线程开销可接受。
 *   - 采集关闭回声消除/噪声抑制/自动增益（getUserMedia 约束），保证测量原始性。
 *   - 播放与采集共用同一 AudioContext，样点率一致，内核分析直接透传 ctx.sampleRate。
 */
(function (global) {
  'use strict';

  var ctx = null, master = null;
  var playing = [];

  function ensureCtx() {
    if (!ctx) {
      var C = global.AudioContext || global.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function currentSr() { var c = ensureCtx(); return c ? c.sampleRate : 44100; }

  /* 播放一段信号（Float32/Float64Array），返回 BufferSource 或 null */
  function playSignal(x, when) {
    var c = ensureCtx();
    if (!c || !x || !x.length) return null;
    var buf = c.createBuffer(1, x.length, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < x.length; i++) d[i] = x[i];
    var src = c.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(when || 0);
    playing.push(src);
    src.onended = function () {
      var k = playing.indexOf(src);
      if (k >= 0) playing.splice(k, 1);
    };
    return src;
  }

  function stopPlayback() {
    playing.forEach(function (s) { try { s.stop(); } catch (e) { } });
    playing = [];
  }

  /* 播放音量 0~1（实测时降低可避免麦克风过载） */
  function setVolume(v) {
    if (!master) return;
    master.gain.value = Math.max(0, Math.min(1, Number(v) || 0));
  }

  /* ---------------- 麦克风采集 ---------------- */
  function Mic() {
    this.samples = null;      // Float32Array，累积的全部录音
    this.recording = false;
    this.sr = 0;
    this.onFrame = null;      // (frame: Float32Array) => void，每 4096 样点
    this.onReady = null;      // () => void，麦克风真正开始采集时（getUserMedia 解析后）
    this.onStop = null;       // (samples: Float32Array) => void
    this._node = null; this._src = null; this._stream = null; this._sink = null;
  }

  Mic.prototype.start = function (onFrame, onError, onReady) {
    var self = this;
    var c = ensureCtx();
    if (!c) { if (onError) onError('浏览器不支持 Web Audio API'); return; }
    var nav = global.navigator || {};
    if (!nav.mediaDevices || !nav.mediaDevices.getUserMedia) {
      if (onError) onError('浏览器不支持 getUserMedia（需 HTTPS 或 localhost 环境）');
      return;
    }
    nav.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      self._stream = stream;
      self._src = c.createMediaStreamSource(stream);
      if (!c.createScriptProcessor) {
        self.stop();
        if (onError) onError('浏览器不支持 ScriptProcessorNode，无法采集原始样点');
        return;
      }
      self._node = c.createScriptProcessor(4096, 1, 1);
      self._sink = c.createGain();
      self._sink.gain.value = 0;   // 零增益旁路到 destination：防止啸叫，同时保住 onaudioprocess
      self.sr = c.sampleRate;
      self.samples = new Float32Array(0);
      self.recording = true;
      self.onFrame = onFrame || null;
      self._node.onaudioprocess = function (e) {
        if (!self.recording) return;
        var inp = e.inputBuffer.getChannelData(0);
        var merged = new Float32Array(self.samples.length + inp.length);
        merged.set(self.samples, 0);
        merged.set(inp, self.samples.length);
        self.samples = merged;
        if (self.onFrame) self.onFrame(inp);
      };
      self._src.connect(self._node);
      self._node.connect(self._sink);
      self._sink.connect(c.destination);
      if (onReady) onReady();
    }).catch(function (err) {
      var msg = '麦克风打开失败';
      if (err && err.name === 'NotAllowedError') msg = '麦克风权限被拒绝（请在地址栏左侧允许麦克风）';
      else if (err && err.name === 'NotFoundError') msg = '未检测到麦克风设备';
      else if (err && err.name) msg += '：' + err.name;
      if (onError) onError(msg);
    });
  };

  Mic.prototype.stop = function () {
    this.recording = false;
    if (this._node) { try { this._node.onaudioprocess = null; this._node.disconnect(); } catch (e) { } this._node = null; }
    if (this._sink) { try { this._sink.disconnect(); } catch (e) { } this._sink = null; }
    if (this._src) { try { this._src.disconnect(); } catch (e) { } this._src = null; }
    if (this._stream) {
      this._stream.getTracks().forEach(function (t) { t.stop(); });
      this._stream = null;
    }
    if (this.onStop) { var f = this.onStop; this.onStop = null; f(this.samples); }
  };

  /* ---------------- WAV 解码 ----------------
   * 支持 fmt 格式 1（PCM，16/24/32 bit）与 3（IEEE float，32 bit）；
   * 多声道取首声道。返回 { samples, sampleRate, channels, bits } 或 null。
   */
  function wavDecode(arrayBuffer) {
    try {
      var dv = new DataView(arrayBuffer);
      if (dv.byteLength < 44) return null;
      if (dv.getUint32(0, false) !== 0x52494646) return null;   // 'RIFF'
      if (dv.getUint32(8, false) !== 0x57415645) return null;   // 'WAVE'
      var pos = 12, fmt = null, dataOff = 0, dataLen = 0;
      while (pos + 8 <= dv.byteLength) {
        var id = dv.getUint32(pos, false);
        var sz = dv.getUint32(pos + 4, true);
        var body = pos + 8;
        if (id === 0x666d7420 && sz >= 16) {                    // 'fmt '
          fmt = {
            format: dv.getUint16(body, true),
            channels: dv.getUint16(body + 2, true) || 1,
            sr: dv.getUint32(body + 4, true),
            bits: dv.getUint16(body + 14, true)
          };
        } else if (id === 0x64617461) {                         // 'data'
          dataOff = body;
          dataLen = Math.min(sz, dv.byteLength - body);
        }
        pos = body + sz + (sz % 2);   // chunk 按 2 字节对齐
      }
      if (!fmt || !dataLen || !fmt.sr || !fmt.bits) return null;
      var bytes = fmt.bits / 8;
      var ch = fmt.channels;
      var n = Math.floor(dataLen / bytes / ch);
      if (n <= 0) return null;
      var out = new Float32Array(n), i, o, v;
      if (fmt.format === 3 && fmt.bits === 32) {
        for (i = 0; i < n; i++) out[i] = dv.getFloat32(dataOff + i * 4 * ch, true);
      } else if (fmt.bits === 16) {
        for (i = 0; i < n; i++) out[i] = dv.getInt16(dataOff + i * 2 * ch, true) / 32768;
      } else if (fmt.bits === 24) {
        for (i = 0; i < n; i++) {
          o = dataOff + i * 3 * ch;
          v = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16);
          out[i] = v / 8388608;
        }
      } else if (fmt.bits === 32) {
        for (i = 0; i < n; i++) out[i] = dv.getInt32(dataOff + i * 4 * ch, true) / 2147483648;
      } else return null;
      return { samples: out, sampleRate: fmt.sr, channels: ch, bits: fmt.bits };
    } catch (e) { return null; }
  }

  global.AudioIO = {
    ensureCtx: ensureCtx,
    currentSr: currentSr,
    playSignal: playSignal,
    stopPlayback: stopPlayback,
    setVolume: setVolume,
    Mic: Mic,
    wavDecode: wavDecode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { wavDecode: wavDecode };
})(typeof window !== 'undefined' ? window : this);
