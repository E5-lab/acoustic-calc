/*
 * ui-lab.js — 交互与组件实验室
 * --------------------------------------------------------------------------
 * 演示并实现：
 *   分段控件 / 开关 / 滑块 / 环形进度 / 标签页 / 手风琴 / 模态框 / 抽屉 /
 *   拖拽前后对比（Canvas）/ 可拖拽频谱编辑器（Canvas）/ 可排序筛选表格 /
 *   骨架屏 / 数字滚动 / 目录滚动高亮
 *
 * 说明：所有画布均按 devicePixelRatio 缩放；主题切换与尺寸变化时自动重绘。
 */
(function () {
  'use strict';

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* 忽略 */ }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function toast(type, message, title) {
    if (window.UIK && UIK.toast) UIK.toast({ type: type, message: message, title: title });
  }

  /* ==========================================================================
     1. Toast 演示
     ========================================================================== */
  var TOAST_SAMPLES = {
    ok: { title: '已保存', message: '计算结果已写入本地草稿，下次打开可继续编辑。' },
    warn: { title: '低频超出目标', message: '125 Hz 频带超出 NC-30 曲线 6.4 dB，建议增加低频吸声。' },
    error: { title: '数据不完整', message: '至少需要 5 个频带的有效数据才能给出评价结果。' },
    info: { title: '提示', message: '深链已包含当前参数，复制地址栏即可分享这一组工况。' }
  };
  $$('[data-toast]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = btn.getAttribute('data-toast');
      var s = TOAST_SAMPLES[t] || TOAST_SAMPLES.info;
      toast(t, s.message, s.title);
    });
  });

  /* ==========================================================================
     2. 分段控件
     ========================================================================== */
  (function initSegmented() {
    var seg = $('#labSeg');
    if (!seg) return;
    var thumb = $('.uik-seg-thumb', seg);
    var buttons = $$('button', seg);
    var out = $('#segOut');
    var TEXT = {
      oct: '当前：1/1 倍频程 · 16 Hz–8 kHz，共 10 个频带',
      third: '当前：1/3 倍频程 · 16 Hz–10 kHz，共 29 个频带',
      narrow: '当前：窄带 FFT · 分辨率 1.46 Hz，适合音调成分分析'
    };

    function moveThumb(btn) {
      if (!btn || !thumb) return;
      thumb.style.width = btn.offsetWidth + 'px';
      thumb.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    }
    function select(btn) {
      buttons.forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      moveThumb(btn);
      out.textContent = TEXT[btn.getAttribute('data-val')] || '';
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { select(b); });
    });
    seg.addEventListener('keydown', function (e) {
      var i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
        next.focus();
        select(next);
      }
    });
    requestAnimationFrame(function () { moveThumb($('button[aria-selected="true"]', seg)); });
    window.addEventListener('resize', function () {
      moveThumb($('button[aria-selected="true"]', seg));
    });
  })();

  /* ==========================================================================
     3. 开关（通用）
     ========================================================================== */
  $$('.uik-switch').forEach(function (sw) {
    // 原生 button 已处理 Enter / Space，无需再手动触发 click
    sw.addEventListener('click', function () {
      sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
  });

  /* ==========================================================================
     4. 滑块 + 环形进度
     ========================================================================== */
  var ring = (function initRing() {
    var range = $('#labRange');
    var wrap = $('#rangeWrap');
    var bubble = $('#rangeBubble');
    var out = $('#rangeOut');
    var val = $('#ringVal');
    var text = $('#ringText');
    if (!range || !val) return null;
    var C = 2 * Math.PI * 56;

    function update() {
      var rw = parseFloat(range.value);
      var pct = clamp(Math.round((rw - 30) / 45 * 100), 0, 100);
      var fill = ((rw - 30) / 45) * 100;
      wrap.style.setProperty('--uik-fill', fill + '%');
      bubble.textContent = rw + ' dB';
      val.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(2);
      val.style.stroke = pct >= 80 ? css('--ok') : (pct >= 50 ? css('--warn') : css('--danger'));
      var first = text.firstChild;
      if (first && first.nodeType === 3) first.nodeValue = String(pct);
      out.textContent = '目标 ' + rw + ' dB：' + (rw >= 55 ? '高于普通住宅分户墙常用下限' : '接近普通住宅分户墙常用下限') +
        '，预估达标率 ' + pct + '%。';
    }
    range.addEventListener('input', update);
    update();
    return { update: update };
  })();

  /* ==========================================================================
     5. 标签页
     ========================================================================== */
  (function initTabs() {
    var tabs = $('#labTabs');
    if (!tabs) return;
    var buttons = $$('button[role="tab"]', tabs);
    var ink = $('#tabsInk');

    function moveInk(btn) {
      if (!ink || !btn) return;
      ink.style.width = btn.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    }
    function select(btn) {
      buttons.forEach(function (b) {
        var on = b === btn;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        var panel = document.getElementById(b.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      moveInk(btn);
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { select(b); });
    });
    tabs.addEventListener('keydown', function (e) {
      var i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      var next = null;
      if (e.key === 'ArrowRight') next = buttons[(i + 1) % buttons.length];
      else if (e.key === 'ArrowLeft') next = buttons[(i - 1 + buttons.length) % buttons.length];
      else if (e.key === 'Home') next = buttons[0];
      else if (e.key === 'End') next = buttons[buttons.length - 1];
      if (next) { e.preventDefault(); next.focus(); select(next); }
    });
    requestAnimationFrame(function () { moveInk($('button[aria-selected="true"]', tabs)); });
    window.addEventListener('resize', function () { moveInk($('button[aria-selected="true"]', tabs)); });
  })();

  /* ==========================================================================
     6. 手风琴（单开）
     ========================================================================== */
  (function initAccordion() {
    var acc = $('#labAcc');
    if (!acc) return;
    var items = $$('.uik-acc-item', acc);
    items.forEach(function (item) {
      var btn = $('.uik-acc-btn', item);
      btn.addEventListener('click', function () {
        var willOpen = !item.classList.contains('open');
        items.forEach(function (it) {
          it.classList.toggle('open', it === item && willOpen);
          var b = $('.uik-acc-btn', it);
          if (b) b.setAttribute('aria-expanded', (it === item && willOpen) ? 'true' : 'false');
        });
      });
    });
  })();

  /* ==========================================================================
     7. 模态框 / 抽屉
     ========================================================================== */
  var overlay = (function initOverlay() {
    var state = { el: null, last: null };

    function focusables(el) {
      return $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', el)
        .filter(function (x) { return !x.disabled && x.offsetParent !== null; });
    }
    function open(el, trigger) {
      if (!el) return;
      if (state.el && state.el !== el) close(true);
      state.el = el;
      state.last = trigger || document.activeElement;
      el.hidden = false;
      document.body.classList.add('uik-lock');
      var f = focusables(el);
      var firstField = el.querySelector('input:not([type="hidden"]), select, textarea');
      var target = firstField || f[0] || el;
      setTimeout(function () { target.focus(); }, 40);
    }
    function close(silent) {
      var el = state.el;
      if (!el) return;
      el.hidden = true;
      if (!silent) {
        document.body.classList.remove('uik-lock');
        if (state.last && state.last.focus) {
          try { state.last.focus(); } catch (e) { /* 忽略 */ }
        }
      }
      state.el = null;
    }
    function isOpen() { return !!state.el; }

    var modal = $('#labModal');
    var drawer = $('#labDrawer');
    var openModalBtn = $('#openModal');
    var openDrawerBtn = $('#openDrawer');

    if (openModalBtn && modal) openModalBtn.addEventListener('click', function () { open(modal, openModalBtn); });
    if (openDrawerBtn && drawer) openDrawerBtn.addEventListener('click', function () { open(drawer, openDrawerBtn); });

    [modal, drawer].forEach(function (el) {
      if (!el) return;
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) close();
      });
    });

    var ok = $('#modalOk');
    if (ok) {
      ok.addEventListener('click', function () {
        close();
        setTimeout(function () {
          toast('ok', '已生成示例计算书（演示，不会真的下载文件）。', '导出成功');
        }, 120);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(state.el);
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    return { open: open, close: close };
  })();

  /* ==========================================================================
     8. 画布通用工具
     ========================================================================== */
  var FREQS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  function fitCanvas(cv) {
    if (!cv) return null;
    var rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function makeAxes(w, h, pad) {
    var fMin = 31.5;
    var fMax = 16000;
    var lgMin = Math.log(fMin);
    var lgSpan = Math.log(fMax) - lgMin;
    return {
      X: function (f) { return pad.l + (Math.log(f) - lgMin) / lgSpan * (w - pad.l - pad.r); },
      Y: function (v) { return pad.t + (1 - (v - 20) / 80) * (h - pad.t - pad.b); },
      dbAt: function (y) { return 20 + (1 - (y - pad.t) / (h - pad.t - pad.b)) * 80; }
    };
  }

  function drawGrid(ctx, w, h, pad, ax) {
    var border = css('--border');
    var faint = css('--faint');
    var muted = css('--muted');

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';

    for (var db = 20; db <= 100; db += 10) {
      var y = ax.Y(db);
      ctx.strokeStyle = border;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = faint;
      ctx.textAlign = 'right';
      ctx.fillText(String(db), pad.l - 8, y);
    }

    ctx.textAlign = 'center';
    FREQS.forEach(function (f) {
      var x = ax.X(f);
      ctx.strokeStyle = border;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, h - pad.b);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = muted;
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x, h - pad.b + 14);
    });
    ctx.restore();
  }

  function curvePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1];
      var p1 = pts[i];
      var mx = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(mx, p0.y, mx, p1.y, p1.x, p1.y);
    }
  }

  function drawCurve(ctx, levels, ax, color, fillColor, bottomY, width) {
    var pts = levels.map(function (v, i) { return { x: ax.X(FREQS[i]), y: ax.Y(clamp(v, 20, 100)) }; });
    if (!pts.length) return;

    if (fillColor) {
      curvePath(ctx, pts);
      ctx.lineTo(pts[pts.length - 1].x, bottomY);
      ctx.lineTo(pts[0].x, bottomY);
      ctx.closePath();
      var topY = Math.min.apply(null, pts.map(function (p) { return p.y; }));
      var g = ctx.createLinearGradient(0, topY, 0, bottomY);
      g.addColorStop(0, fillColor);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fill();
    }

    curvePath(ctx, pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    return pts;
  }

  /* ==========================================================================
     9. 拖拽前后对比
     ========================================================================== */
  var compare = (function initCompare() {
    var box = $('#compareBox');
    var beforeCv = $('#cmpBefore');
    var afterCv = $('#cmpAfter');
    var handle = $('#cmpHandle');
    if (!box || !beforeCv || !afterCv || !handle) return null;

    var BEFORE = [72, 68, 63, 58, 54, 51, 49, 47, 45, 43];
    var AFTER = [70, 64, 56, 48, 43, 39, 36, 34, 32, 30];
    var pos = 52;
    var pad = { l: 42, r: 14, t: 18, b: 26 };

    function draw() {
      var a = fitCanvas(afterCv);
      var b = fitCanvas(beforeCv);
      if (!a || !b) return;

      a.ctx.clearRect(0, 0, a.w, a.h);
      a.ctx.fillStyle = css('--card');
      a.ctx.fillRect(0, 0, a.w, a.h);
      var axA = makeAxes(a.w, a.h, pad);
      drawGrid(a.ctx, a.w, a.h, pad, axA);
      drawCurve(a.ctx, AFTER, axA, css('--ok'), css('--ok'), a.h - pad.b, 2.2);

      b.ctx.clearRect(0, 0, b.w, b.h);
      var axB = makeAxes(b.w, b.h, pad);
      drawCurve(b.ctx, BEFORE, axB, css('--accent'), css('--accent'), b.h - pad.b, 2.2);
    }

    function setPos(next) {
      pos = clamp(next, 0, 100);
      box.style.setProperty('--uik-pos', pos + '%');
      handle.style.left = pos + '%';
      handle.setAttribute('aria-valuenow', Math.round(pos));
    }

    function fromEvent(e) {
      var r = box.getBoundingClientRect();
      setPos(((e.clientX - r.left) / r.width) * 100);
    }

    var dragging = false;
    function onDown(e) {
      dragging = true;
      box.setPointerCapture && box.setPointerCapture(e.pointerId);
      fromEvent(e);
      e.preventDefault();
    }
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', function (e) {
      if (dragging) fromEvent(e);
    });
    function onUp(e) {
      dragging = false;
      if (box.releasePointerCapture && box.hasPointerCapture && box.hasPointerCapture(e.pointerId)) {
        box.releasePointerCapture(e.pointerId);
      }
    }
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);

    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(pos - step); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPos(pos + step); }
      else if (e.key === 'Home') { e.preventDefault(); setPos(0); }
      else if (e.key === 'End') { e.preventDefault(); setPos(100); }
    });

    setPos(pos);
    draw();
    return { draw: draw };
  })();

  /* ==========================================================================
     10. 频谱曲线编辑器
     ========================================================================== */
  var spectrum = (function initSpectrum() {
    var cv = $('#specCanvas');
    var box = $('#specBox');
    var readout = $('#specReadout');
    var msg = $('#specMsg');
    if (!cv) return null;
    if (msg) msg.setAttribute('aria-live', 'polite');

    var DEFAULT = [58, 55, 50, 45, 42, 40, 38, 35, 32, 30];
    var MACHINE = [78, 75, 71, 68, 65, 62, 60, 58, 56, 54];
    var REF = [55, 48, 42, 38, 35, 32, 30, 29, 28, 27];

    var levels = DEFAULT.slice();
    var selected = 5;
    var hover = -1;
    var dragging = false;
    var pts = [];
    var pad = { l: 44, r: 18, t: 26, b: 34 };
    var size = { w: 0, h: 0 };
    var ax = null;

    function aWeight(f) {
      var f2 = f * f;
      var num = 12194 * 12194 * f2 * f2;
      var den = (f2 + 20.6 * 20.6) *
        Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
        (f2 + 12194 * 12194);
      return 20 * Math.log10(num / den) + 2.0;
    }
    function laOf(list) {
      var s = 0;
      for (var i = 0; i < list.length; i++) s += Math.pow(10, (list[i] + aWeight(FREQS[i])) / 10);
      return s > 0 ? 10 * Math.log10(s) : 0;
    }
    function fmt(f) { return f >= 1000 ? (f / 1000) + ' kHz' : f + ' Hz'; }

    function draw() {
      var fit = fitCanvas(cv);
      if (!fit) return;
      var ctx = fit.ctx;
      var w = fit.w, h = fit.h;
      size = { w: w, h: h };
      ax = makeAxes(w, h, pad);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = css('--card');
      ctx.fillRect(0, 0, w, h);
      drawGrid(ctx, w, h, pad, ax);

      // 参考曲线（NC-30 近似）
      var refPts = REF.map(function (v, i) { return { x: ax.X(FREQS[i]), y: ax.Y(v) }; });
      curvePath(ctx, refPts);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = css('--faint');
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 频谱面积与曲线
      pts = drawCurve(ctx, levels, ax, css('--primary'), css('--primary'), h - pad.b, 2.4);

      // 节点
      pts.forEach(function (p, i) {
        var on = i === selected;
        var hot = i === hover || on;
        if (on) {
          ctx.beginPath();
          ctx.fillStyle = css('--primary');
          ctx.globalAlpha = 0.14;
          ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.fillStyle = css('--card');
        ctx.strokeStyle = css('--primary');
        ctx.lineWidth = on ? 2.6 : 2;
        ctx.arc(p.x, p.y, hot ? 6 : 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // 选中频带的竖向引导线与数值
      var sp = pts[selected];
      if (sp) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = css('--primary');
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(sp.x, pad.t);
        ctx.lineTo(sp.x, h - pad.b);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = css('--primary');
        ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(levels[selected].toFixed(1) + ' dB', sp.x, Math.max(pad.t - 8, sp.y - 14));
      }

      updateReadout();
      updateAria();
    }

    function updateReadout() {
      if (!readout) return;
      readout.innerHTML =
        '<span class="uik-spec-chip">选中 <b>' + fmt(FREQS[selected]) + '</b></span>' +
        '<span class="uik-spec-chip"><b>' + levels[selected].toFixed(1) + '</b> dB</span>' +
        '<span class="uik-spec-chip">LA <b>' + laOf(levels).toFixed(1) + '</b> dBA</span>';
    }
    function updateAria() {
      cv.setAttribute('aria-label',
        '频谱曲线编辑器：当前选中 ' + fmt(FREQS[selected]) + '，' + levels[selected].toFixed(1) +
        ' 分贝。左右方向键切换频带，上下方向键调整声压级。');
    }
    function announce(text) {
      if (!msg) return;
      msg.textContent = text;
      setTimeout(function () { if (msg.textContent === text) msg.textContent = ''; }, 2200);
    }

    function hitTest(x, y) {
      var best = -1;
      var bestD = 22;
      pts.forEach(function (p, i) {
        var d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    function nearestBand(x) {
      var best = 0;
      var bestD = Infinity;
      pts.forEach(function (p, i) {
        var d = Math.abs(p.x - x);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    function local(e) {
      var r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function setLevel(i, db, quiet) {
      levels[i] = clamp(Math.round(db * 2) / 2, 20, 100);
      draw();
      if (!quiet) announce(fmt(FREQS[i]) + ' 调整为 ' + levels[i].toFixed(1) + ' dB');
    }

    cv.addEventListener('pointerdown', function (e) {
      var p = local(e);
      if (p.x < pad.l || p.x > size.w - pad.r || p.y < pad.t || p.y > size.h - pad.b) return;
      var i = hitTest(p.x, p.y);
      if (i < 0) i = nearestBand(p.x);
      selected = i;
      dragging = true;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      setLevel(i, ax.dbAt(p.y), true);
      e.preventDefault();
    });

    cv.addEventListener('pointermove', function (e) {
      var p = local(e);
      if (dragging) {
        setLevel(selected, ax.dbAt(p.y), true);
        return;
      }
      var i = hitTest(p.x, p.y);
      if (i !== hover) {
        hover = i;
        cv.style.cursor = i >= 0 ? 'grab' : 'crosshair';
        draw();
      }
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      if (cv.releasePointerCapture && cv.hasPointerCapture && cv.hasPointerCapture(e.pointerId)) {
        cv.releasePointerCapture(e.pointerId);
      }
      announce(fmt(FREQS[selected]) + ' 调整为 ' + levels[selected].toFixed(1) + ' dB');
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerleave', function () {
      if (hover !== -1) { hover = -1; draw(); }
    });

    cv.addEventListener('dblclick', function (e) {
      var p = local(e);
      var i = hitTest(p.x, p.y);
      if (i < 0) i = nearestBand(p.x);
      selected = i;
      levels[i] = DEFAULT[i];
      draw();
      announce(fmt(FREQS[i]) + ' 已复位为 ' + DEFAULT[i].toFixed(1) + ' dB');
    });

    cv.addEventListener('keydown', function (e) {
      var handled = true;
      if (e.key === 'ArrowLeft') selected = (selected + FREQS.length - 1) % FREQS.length;
      else if (e.key === 'ArrowRight') selected = (selected + 1) % FREQS.length;
      else if (e.key === 'ArrowUp') setLevel(selected, levels[selected] + (e.shiftKey ? 2 : 0.5), true);
      else if (e.key === 'ArrowDown') setLevel(selected, levels[selected] - (e.shiftKey ? 2 : 0.5), true);
      else if (e.key === 'Home') selected = 0;
      else if (e.key === 'End') selected = FREQS.length - 1;
      else if (e.key === 'Enter' || e.key === ' ') {
        levels[selected] = DEFAULT[selected];
        draw();
        announce(fmt(FREQS[selected]) + ' 已复位');
      } else handled = false;

      if (handled) {
        e.preventDefault();
        draw();
        if (e.key.indexOf('Arrow') === 0) {
          announce(fmt(FREQS[selected]) + ' · ' + levels[selected].toFixed(1) + ' dB');
        }
      }
    });

    var randomBtn = $('#specRandom');
    if (randomBtn) {
      randomBtn.addEventListener('click', function () {
        levels = FREQS.map(function (f) {
          var base = 62 - 3 * Math.log2(f / 63);
          var v = base + (Math.random() * 12 - 6);
          return clamp(Math.round(v * 2) / 2, 26, 92);
        });
        draw();
        announce('已生成随机频谱');
        toast('info', '已生成一组随机频谱，可直接拖动节点微调。', '频谱已更新');
      });
    }
    var sampleBtn = $('#specWeight');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        levels = MACHINE.slice();
        draw();
        announce('已载入机房频谱');
        toast('info', '机房频谱以低频为主，可尝试用薄板共振结构处理 125–250 Hz。', '已载入机房谱');
      });
    }
    var resetBtn = $('#specReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        levels = DEFAULT.slice();
        selected = 5;
        draw();
        announce('已恢复默认频谱');
      });
    }

    draw();
    return { draw: draw, resize: draw };
  })();

  /* ==========================================================================
     11. 可排序 / 筛选表格
     ========================================================================== */
  (function initTable() {
    var table = $('#labTable');
    var tbody = $('#tableBody');
    var search = $('#tableSearch');
    var count = $('#tableCount');
    if (!table || !tbody) return;

    var DATA = [
      { name: '轻钢龙骨双层石膏板墙', material: '2×12.5 石膏板 + 75 龙骨 + 岩棉', rw: 52, stc: 52, thk: 125, grade: '良' },
      { name: '240 烧结砖墙（双面抹灰）', material: '240 砖 + 20 抹灰', rw: 53, stc: 52, thk: 280, grade: '良' },
      { name: '200 加气混凝土砌块', material: 'B06 砌块 + 抹灰', rw: 45, stc: 44, thk: 220, grade: '一般' },
      { name: '双层中空玻璃窗', material: '6 + 12A + 6', rw: 32, stc: 31, thk: 24, grade: '一般' },
      { name: '夹胶玻璃窗', material: '8 + 1.52PVB + 8', rw: 38, stc: 37, thk: 18, grade: '良' },
      { name: '钢制隔声门', material: '双层钢板 + 岩棉芯', rw: 42, stc: 41, thk: 60, grade: '良' },
      { name: '混凝土楼板（120）', material: '120 钢筋混凝土', rw: 55, stc: 54, thk: 120, grade: '优' },
      { name: '浮筑楼板', material: '50 细石混凝土 + 20 隔声垫', rw: 62, stc: 61, thk: 150, grade: '优' },
      { name: '轻质隔声屏障', material: '1.5 钢板 + 50 岩棉 + 穿孔板', rw: 34, stc: 33, thk: 100, grade: '一般' },
      { name: '石膏板吊顶', material: '双层 12 石膏板 + 50 空腔', rw: 40, stc: 39, thk: 90, grade: '良' }
    ];
    var sort = { key: 'rw', dir: -1 };

    function gradeClass(g) { return g === '优' ? 'ok' : (g === '良' ? 'ok' : 'warn'); }

    function render() {
      var q = (search.value || '').trim().toLowerCase();
      var rows = DATA.filter(function (r) {
        return !q || (r.name + ' ' + r.material).toLowerCase().indexOf(q) >= 0;
      });
      rows.sort(function (a, b) {
        var va = a[sort.key], vb = b[sort.key];
        if (typeof va === 'string') return va.localeCompare(vb, 'zh-CN') * sort.dir;
        return (va - vb) * sort.dir;
      });

      tbody.innerHTML = rows.length ? rows.map(function (r) {
        return '<tr>' +
          '<td>' + r.name + '</td>' +
          '<td>' + r.material + '</td>' +
          '<td class="is-num">' + r.rw + '</td>' +
          '<td class="is-num">' + r.stc + '</td>' +
          '<td class="is-num">' + r.thk + '</td>' +
          '<td><span class="uik-pill ' + gradeClass(r.grade) + '">' + r.grade + '</span></td>' +
          '</tr>';
      }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:26px 0">没有匹配的构件，试试其他关键词</td></tr>';

      count.textContent = rows.length + ' 个构件' + (q ? '（已筛选）' : '');

      $$('thead th', table).forEach(function (th) {
        var btn = $('button', th);
        if (!btn) return;
        th.setAttribute('aria-sort', btn.getAttribute('data-key') === sort.key
          ? (sort.dir === 1 ? 'ascending' : 'descending')
          : 'none');
      });
    }

    $$('thead th button', table).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-key');
        if (sort.key === key) sort.dir = -sort.dir;
        else sort.key = key, sort.dir = btn.getAttribute('data-type') === 'num' ? -1 : 1;
        render();
      });
    });
    search.addEventListener('input', render);
    render();
  })();

  /* ==========================================================================
     12. 骨架屏 / 数字滚动
     ========================================================================== */
  (function initSkeleton() {
    var sw = $('#skelSwitch');
    var skeleton = $('#skelSkeleton');
    var content = $('#skelContent');
    if (!sw || !skeleton || !content) return;
    function sync() {
      var on = sw.getAttribute('aria-checked') === 'true';
      skeleton.hidden = !on;
      content.hidden = on;
    }
    sw.addEventListener('click', sync);
    sync();
  })();

  (function initNumberDemo() {
    var num = $('#numDemo');
    var btn = $('#numBtn');
    if (!num || !btn) return;
    btn.addEventListener('click', function () {
      var v = 42 + Math.random() * 34;
      var node = num.firstChild;
      if (node && node.nodeType === 3) node.nodeValue = v.toFixed(1) + ' ';
      toast('info', '新数值 ' + v.toFixed(1) + ' dB，注意数字从旧值滚动到新值。', '数字滚动');
    });
  })();

  /* ==========================================================================
     13. 目录滚动高亮
     ========================================================================== */
  (function initToc() {
    var links = $$('.lab-toc a');
    if (!links.length) return;
    var sections = links.map(function (a) { return $(a.getAttribute('href')); });
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY + 120;
      var active = 0;
      sections.forEach(function (sec, i) {
        if (sec && sec.offsetTop <= y) active = i;
      });
      links.forEach(function (a, i) { a.classList.toggle('active', i === active); });

      // 窄屏目录是横向滚动条，让当前项自动滚到可视区中间
      var nav = links[0].parentElement;
      var link = links[active];
      if (nav && link && nav.scrollWidth > nav.clientWidth + 2) {
        var nr = nav.getBoundingClientRect();
        var lr = link.getBoundingClientRect();
        var delta = (lr.left - nr.left) - (nr.width - lr.width) / 2;
        if (Math.abs(delta) > 8) {
          if (nav.scrollBy) nav.scrollBy({ left: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
          else nav.scrollLeft += delta;
        }
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  })();

  /* ==========================================================================
     14. 主题 / 尺寸变化时重绘画布
     ========================================================================== */
  (function initRedraw() {
    var scheduled = false;
    function redraw() {
      scheduled = false;
      if (compare) compare.draw();
      if (spectrum) spectrum.draw();
    }
    function queue() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(redraw);
    }
    window.addEventListener('resize', queue);
    // 主题切换时同步重绘，保证 View Transition 的新快照已使用新配色
    document.addEventListener('acousticthemechange', redraw);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(queue);
      var box = $('#compareBox');
      var spec = $('#specBox');
      if (box) ro.observe(box);
      if (spec) ro.observe(spec);
    }
    if (window.MutationObserver) {
      new MutationObserver(queue).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
  })();

  // 防止未使用的变量被压缩器误删（保留调试入口）
  window.UILab = {
    reduceMotion: reduceMotion,
    redraw: function () {
      if (compare) compare.draw();
      if (spectrum) spectrum.draw();
      if (ring) ring.update();
    }
  };
})();
