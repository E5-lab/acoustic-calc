/*
 * chart-util.js — 轻量 Canvas 折线/柱状图工具（各视图共用）
 * 支持：线性/对数横轴、多序列、水平参考带、空值断线、自适应 DPI。
 */
(function (global) {
  'use strict';

  function cssVar(name, fallback) {
    if (typeof getComputedStyle !== 'function') return fallback;
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(canvas, o) {
    if (!canvas) return;
    o = o || {};
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(300, Math.round(rect.width || 560));
    var H = Number(canvas.getAttribute('height')) || 300;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var C = {
      text: cssVar('--text', '#16202f'),
      grid: cssVar('--border', '#e4e8f0'),
      faint: cssVar('--faint', '#94a3b8'),
      muted: cssVar('--muted', '#6b7280')
    };

    var m = { l: 46, r: 16, t: 20, b: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;

    var xs = (o.x || []).slice();
    if (!xs.length) {
      ctx.fillStyle = C.muted;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(o.emptyText || '暂无数据', m.l, m.t + 16);
      return;
    }

    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var logSpan = Math.log(maxX) - Math.log(minX);
    function X(v) {
      if (xs.length === 1) return m.l + pw / 2;
      if (o.xLog) {
        if (logSpan <= 0) return m.l + pw / 2;
        return m.l + (Math.log(v) - Math.log(minX)) / logSpan * pw;
      }
      return m.l + (v - minX) / (maxX - minX) * pw;
    }

    var yMin = o.yMin == null ? 0 : o.yMin, yMax = o.yMax;
    if (yMax == null) {
      var all = [];
      (o.series || []).forEach(function (s) {
        (s.values || []).forEach(function (v) {
          if (v != null && isFinite(v)) all.push(v);
        });
      });
      yMax = all.length ? Math.max.apply(null, all) : 1;
      yMax = Math.ceil(yMax * 1.08 * 2) / 2;
    }
    function Y(v) { return m.t + (1 - (v - yMin) / (yMax - yMin)) * ph; }

    ctx.font = '11px system-ui, sans-serif';

    // 水平参考带
    (o.hBands || []).forEach(function (b) {
      var y1 = Y(Math.min(yMax, b.to)), y2 = Y(Math.max(yMin, b.from));
      ctx.fillStyle = b.color || 'rgba(148,163,184,0.12)';
      ctx.fillRect(m.l, y1, pw, y2 - y1);
    });

    // 纵向网格 + 横轴标签
    var tickEvery = xs.length > 12 ? 2 : 1;
    xs.forEach(function (v, i) {
      var x = X(v);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
      if (i % tickEvery === 0) {
        ctx.fillStyle = C.faint;
        ctx.textAlign = 'center';
        var label = o.xLabelFmt ? o.xLabelFmt(v) : (v >= 1000 ? (v / 1000) + 'k' : String(v));
        ctx.fillText(label, x, H - 12);
      }
    });
    ctx.textAlign = 'left';

    // 横向网格与刻度
    var ticks = o.yTicks || 5;
    for (var t = 0; t <= ticks; t++) {
      var val = yMin + (yMax - yMin) * t / ticks;
      var y = Y(val);
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(W - m.r, y); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(formatTick(val, o.yDigits), 8, y + 3);
    }

    // 序列
    (o.series || []).forEach(function (s) {
      var vals = s.values || [];
      if (s.type === 'bar') {
        var bw = Math.max(6, pw / xs.length * 0.55);
        vals.forEach(function (v, i) {
          if (v == null) return;
          var x = X(xs[i]), y = Y(Math.max(yMin, Math.min(yMax, v)));
          ctx.fillStyle = s.color;
          ctx.beginPath();
          roundRect(ctx, x - bw / 2, y, bw, m.t + ph - y, 3);
          ctx.fill();
        });
        return;
      }
      var started = false;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      vals.forEach(function (v, i) {
        if (v == null || !isFinite(v)) { started = false; return; }
        var x = X(xs[i]), y = Y(Math.max(yMin, Math.min(yMax, v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.points !== false) {
        vals.forEach(function (v, i) {
          if (v == null || !isFinite(v)) return;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(X(xs[i]), Y(Math.max(yMin, Math.min(yMax, v))), s.radius || 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });
  }

  function formatTick(v, digits) {
    if (digits != null) return Number(v).toFixed(digits);
    if (Math.abs(v) >= 100) return String(Math.round(v));
    if (Math.abs(v) >= 10) return Number(v).toFixed(1).replace(/\.0$/, '');
    return Number(v).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  var API = { draw: draw, cssVar: cssVar, roundRect: roundRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.MiniChart = API;
})(typeof window !== 'undefined' ? window : this);
