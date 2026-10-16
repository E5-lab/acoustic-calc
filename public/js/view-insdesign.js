/*
 * view-insdesign.js — 隔声与撞击声进阶 视图（#/insdesign）
 * 依赖 window.InsDesign（内核）与 window.Insulation（材料库，用于单层构件面密度估算）。
 */
(function () {
  'use strict';
  var I = window.InsDesign;
  var INS = window.Insulation;
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d == null ? 2 : d); }
  function show(el, html, cls) { if (!el) return; el.hidden = false; if (html != null) el.innerHTML = html; if (cls) el.className = 'result-line ' + cls; }
  function toNums(s) { return (s || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return !isNaN(v); }); }

  function findMat(id) {
    if (!INS || !INS.MATERIALS) return null;
    for (var i = 0; i < INS.MATERIALS.length; i++) if (INS.MATERIALS[i].id === id) return INS.MATERIALS[i];
    return null;
  }

  function init() {
    if (init._d) return; init._d = true;

    /* 1) 单层密实构件 */
    $('idInsSingleBtn').addEventListener('click', function () {
      var mat = findMat($('idInsMat').value);
      var t = parseFloat($('idInsThk').value);
      if (!mat || !t || t <= 0) { show($('idInsSingleOut'), '请选择材料并填写有效厚度', 'warn'); return; }
      var m = mat.density / 1000 * t;   // kg/m²
      var r = I.singleLeaf({ m: m, cL: mat.cL, thicknessMm: t });
      if (!r.ok) { show($('idInsSingleOut'), '计算失败：' + r.error, 'warn'); return; }
      var pts = r.spectrum.filter(function (p) { return [125, 250, 500, 1000, 2000, 4000].indexOf(p.f) >= 0; })
        .map(function (p) { return p.f + ': ' + fmt(p.R, 1); }).join('　');
      var fcTxt = r.fc != null
        ? '吻合频率 fc ≈ <b>' + fmt(r.fc, 0) + ' Hz</b>' + (r.fcInBand ? '（落在计算频段内，该频带隔声量偏低，应避开主要声频段）' : '（高于计算频段上限，常规频段内质量定律有效）')
        : '—';
      show($('idInsSingleOut'), '<b>' + mat.name + '</b> ' + t + ' mm　面密度 m ≈ <b>' + fmt(m, 2) + ' kg/m²</b><br>' +
        '隔声量 R：' + fmt(r.minR, 1) + ' ~ ' + fmt(r.maxR, 1) + ' dB　' + fcTxt +
        '<br><span class="muted">R @ ' + pts + '</span>', 'ok');
    });

    /* 2) 双层构造 */
    $('idInsDoubleBtn').addEventListener('click', function () {
      var r = I.doubleLeaf({
        m1: $('idInsM1').value, m2: $('idInsM2').value,
        d: $('idInsD').value, alphaC: $('idInsAlpha').value
      });
      if (!r.ok) { show($('idInsDoubleOut'), '计算失败：' + r.error, 'warn'); return; }
      var pts = r.spectrum.filter(function (p) { return [125, 250, 500, 1000, 2000, 4000].indexOf(p.f) >= 0; })
        .map(function (p) { return p.f + ': ' + fmt(p.R, 1); }).join('　');
      show($('idInsDoubleOut'), '质量-空气-质量共振频率 <b>f₀ ≈ ' + fmt(r.f0, 0) + ' Hz</b><br>' +
        '隔声低谷：R_min ≈ <b>' + fmt(r.minR, 1) + ' dB</b> @ ' + r.minRf + ' Hz　高频上限 ≈ ' + fmt(r.maxR, 1) + ' dB' +
        '<br><span class="muted">R @ ' + pts + '</span>', 'ok');
    });

    /* 3) 隔声罩 / 围护插入损失 */
    $('idInsEnclBtn').addEventListener('click', function () {
      var tlRaw = $('idInsTL').value, S = $('idInsS').value, A = $('idInsAin').value;
      var tlArr = toNums(tlRaw);
      var o = { S: S, Ainside: A };
      if (tlArr.length >= 17) o.TL = tlArr;
      else if (tlArr.length === 1) o.TL = tlArr[0];
      else if (tlArr.length > 1) { show($('idInsEnclOut'), 'TL 数组应为 1 个（单值）或 17 个（1/3 倍频带）', 'warn'); return; }
      else { show($('idInsEnclOut'), '请填写构件隔声量 TL', 'warn'); return; }
      var r = I.enclosureNR(o);
      if (!r.ok) { show($('idInsEnclOut'), '计算失败：' + r.error, 'warn'); return; }
      if (r.spectrum) {
        var pts = r.spectrum.filter(function (p) { return [125, 250, 500, 1000, 2000, 4000].indexOf(p.f) >= 0; })
          .map(function (p) { return p.f + ': ' + fmt(p.NR, 1); }).join('　');
        show($('idInsEnclOut'), '插入损失 NR = TL + 10lg(S/A)（项 = <b>' + fmt(r.term, 1) + ' dB</b>）<br><span class="muted">NR @ ' + pts + '</span>', 'ok');
      } else {
        show($('idInsEnclOut'), '隔声罩插入损失 <b>NR ≈ ' + fmt(r.NR, 1) + ' dB</b>（= TL ' + fmt(r.TL, 1) + ' + 10lg(S/A) ' + fmt(r.term, 1) + '）', 'ok');
      }
    });

    /* 4) 浮筑楼板 / 弹性垫层撞击声改进 */
    $('idInsFloatBtn').addEventListener('click', function () {
      var r = I.floatingFloor({ m: $('idInsFm').value, sPrime: $('idInsSp').value });
      if (!r.ok) { show($('idInsFloatOut'), '计算失败：' + r.error, 'warn'); return; }
      var dL500 = r.spectrum.filter(function (p) { return p.f === 500; })[0].dL;
      var dL1k = r.spectrum.filter(function (p) { return p.f === 1000; })[0].dL;
      show($('idInsFloatOut'), '共振频率 <b>f₀ ≈ ' + fmt(r.f0, 1) + ' Hz</b><br>' +
        '撞击声改进量 ΔL：500 Hz ≈ <b>' + fmt(dL500, 1) + ' dB</b>，1 kHz ≈ <b>' + fmt(dL1k, 1) + ' dB</b>' +
        '　加权改进量 ΔL_w（近似）≈ ' + fmt(r.dLwApprox, 1) + ' dB' +
        '<br><span class="muted">f₀ 应尽可能低（厚浮筑层 / 软弹性垫）；f₀ 高于主要频段时改进量有限。</span>', 'ok');
    });

    /* 5) 组合与侧向传声 */
    $('idInsCombBtn').addEventListener('click', function () {
      var arr = toNums($('idInsPaths').value);
      if (arr.length < 1) { show($('idInsCombOut'), '请至少输入一条传声路径的隔声量 R', 'warn'); return; }
      var paths = arr.map(function (v) { return { R: v }; });
      var r = I.combinedTransmission({ paths: paths });
      if (!r.ok) { show($('idInsCombOut'), '计算失败：' + r.error, 'warn'); return; }
      if (Array.isArray(r.spectrum)) {
        var pts = r.spectrum.map(function (v, i) { return I.GRID_HZ[i] + ': ' + fmt(v, 1); }).join('　');
        show($('idInsCombOut'), '各频带合成隔声量 R_total：<br><span class="muted">' + pts + '</span>', 'ok');
      } else {
        var weakest = Math.min.apply(null, arr);
        show($('idInsCombOut'), '合成隔声量 <b>R_total ≈ ' + fmt(r.R, 1) + ' dB</b>' +
          (r.R < weakest + 0.5 ? '（由最弱路径 ' + fmt(weakest, 1) + ' dB 主导）' : ''), 'ok');
      }
    });
  }

  function onShow() {}
  window.InsDesignView = { init: init, onShow: onShow };
})();
