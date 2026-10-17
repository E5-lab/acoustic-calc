/*
 * muffler.js — 消声器计算内核（纯函数，无依赖）
 * UMD 包装：浏览器挂到 window.Muffler，Node 下 module.exports。
 *
 * 说明：消声器目前没有统一的「设计计算」国家标准——现行标准（GB/T 25516 / ISO 7235、
 * GB/T 4760、GB/T 19512、GB/T 16405）规定的都是「测量」方法（插入损失、气流再生噪声、
 * 全压损失）；「设计算式」散见于设计规范与管道声学专著，本内核采用：
 *
 * 一、阻性消声器（GB/T 50087-2013《工业企业噪声控制设计规范》第 6.3.1 条）
 *      M = φ(α₀)·P·l / S_x
 *        P   消声器通道内吸声材料的饰面周长（m）
 *        l   消声器有效长度（m）
 *        S_x 通道截面积（m²）
 *        φ(α₀) 消声系数，按该规范表 6.3.1（本内核分段线性插值）
 *      另附别洛夫（Perov）理论式对照：φ = 4.34(1−√(1−α₀))/(1+√(1−α₀))
 *      高频失效上限截止频率（同规范式 6.3.2）：f = 1.85·c / D，D 为通道当量直径
 *
 * 二、抗性消声器（管道声学经典一维平面波解，非标准条文）
 *      扩张室（简单扩张，无插入管）：TL = 10 lg[1 + ¼(m − 1/m)² sin²(k l)]
 *        m = 扩张比 = 扩张室截面积 / 主管截面积；通过频率 f_n = n·c/(2l)（TL = 0）
 *      共振腔（旁支式，Helmholtz）：TL = 10 lg[1 + ( √(G·V) / (2·S_p·(f/f_r − f_r/f)) )²]
 *        f_r = (c/2π)·√(G/V)，G = S₀/(t + 0.85d)——颈口端修正后的声传导率
 *
 * 三、组合与校核：各频带消声量（近似相加）→ A 计权插入损失；压力损失 Δp = ξ·ρv²/2；
 *      流速与结构选型校核。气流再生噪声无法由几何量可靠预测，需按 GB/T 25516 实测。
 */
(function (global) {
  'use strict';

  var C0 = 343;      // 常温常压声速 m/s
  var RHO = 1.2;     // 空气密度 kg/m³
  var BANDS = [63, 125, 250, 500, 1000, 2000, 4000];

  // ------------------------------ 通用工具 ------------------------------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function round(v, d) {
    if (v == null || !isFinite(v)) return null;
    var p = Math.pow(10, d == null ? 2 : d);
    return Math.round((v * p).toFixed(6)) / p;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // A 计权（IEC 61672 解析式）
  function aWeight(f) {
    var f1 = 20.598997, f2 = 107.65265, f3 = 737.86223, f4 = 12194.217;
    var x = (12194.217 * 12194.217 * Math.pow(f, 4)) /
      ((Math.pow(f, 2) + Math.pow(f1, 2)) *
        Math.sqrt((Math.pow(f, 2) + Math.pow(f2, 2)) * (Math.pow(f, 2) + Math.pow(f3, 2))) *
        (Math.pow(f, 2) + Math.pow(f4, 2)));
    return 20 * Math.log10(x) + 1.9997;
  }

  // 能量叠加（dB）
  function sumDb(levels) {
    var s = 0, n = 0;
    levels.forEach(function (L) {
      if (L == null || !isFinite(L)) return;
      s += Math.pow(10, L / 10); n++;
    });
    return n ? 10 * Math.log10(s) : null;
  }

  // ------------------------------ 消声系数 φ(α₀) ------------------------------
  // GB/T 50087-2013 表 6.3.1（α₀ ≥ 0.9 取 1.5）
  var GB_PHI = [
    [0.00, 0.00], [0.10, 0.10], [0.20, 0.20], [0.30, 0.40], [0.40, 0.55],
    [0.50, 0.70], [0.60, 0.90], [0.70, 1.00], [0.80, 1.20], [0.90, 1.50], [1.00, 1.50]
  ];

  // 表 6.3.1 分段线性插值
  function phiGB(a) {
    var x = num(a);
    if (x == null) return null;
    x = clamp(x, 0, 1);
    for (var i = 1; i < GB_PHI.length; i++) {
      if (x <= GB_PHI[i][0]) {
        var x0 = GB_PHI[i - 1][0], y0 = GB_PHI[i - 1][1];
        var x1 = GB_PHI[i][0], y1 = GB_PHI[i][1];
        if (x1 === x0) return y1;
        return y0 + (x - x0) / (x1 - x0) * (y1 - y0);
      }
    }
    return 1.50;
  }

  // 别洛夫（Perov）理论式
  function phiPerov(a) {
    var x = num(a);
    if (x == null) return null;
    x = clamp(x, 0, 1);
    var r = Math.sqrt(1 - x);
    return 4.34 * (1 - r) / (1 + r);
  }

  // ------------------------------ 材料预设 ------------------------------
  // 正入射吸声系数 α₀（工程常用参考值，无空腔贴实；正式设计应以实测/厂商数据为准）
  var MATERIALS = [
    { id: 'gw32-50', name: '超细玻璃棉 32 kg/m³ · 50 mm', alpha: [0.05, 0.10, 0.25, 0.55, 0.80, 0.90, 0.95] },
    { id: 'gw32-100', name: '超细玻璃棉 32 kg/m³ · 100 mm', alpha: [0.10, 0.20, 0.45, 0.75, 0.90, 0.95, 0.95] },
    { id: 'gw32-150', name: '超细玻璃棉 32 kg/m³ · 150 mm', alpha: [0.15, 0.30, 0.60, 0.85, 0.95, 0.95, 0.95] },
    { id: 'gw32-200', name: '超细玻璃棉 32 kg/m³ · 200 mm', alpha: [0.20, 0.40, 0.70, 0.90, 0.95, 0.95, 0.95] },
    { id: 'gw48-100', name: '离心玻璃棉板 48 kg/m³ · 100 mm', alpha: [0.12, 0.25, 0.55, 0.85, 0.92, 0.95, 0.95] },
    { id: 'rock100', name: '岩棉 100 kg/m³ · 100 mm', alpha: [0.10, 0.25, 0.55, 0.85, 0.95, 0.95, 0.95] },
    { id: 'poly50', name: '聚酯纤维吸声棉 · 50 mm', alpha: [0.05, 0.08, 0.20, 0.45, 0.75, 0.90, 0.95] },
    { id: 'gw32-gap', name: '玻璃棉 100 mm + 100 mm 空腔', alpha: [0.20, 0.35, 0.65, 0.85, 0.90, 0.90, 0.90] },
    { id: 'micro', name: '微穿孔板结构（附空腔）', alpha: [0.05, 0.15, 0.35, 0.60, 0.80, 0.85, 0.85] }
  ];

  // ------------------------------ 声源谱预设 ------------------------------
  // 各倍频带声压级 dB（63 ~ 4000 Hz）
  var SOURCES = [
    { id: 'fan', name: '离心风机 / 空调机组', levels: [76, 80, 84, 85, 83, 79, 74] },
    { id: 'cooling', name: '冷却塔（淋水 + 风机）', levels: [78, 82, 86, 88, 86, 82, 77] },
    { id: 'duct', name: '风管内气动噪声（中高频为主）', levels: [62, 68, 74, 80, 82, 80, 76] },
    { id: 'screw', name: '螺杆空压机（含低频脉动）', levels: [86, 88, 88, 85, 82, 78, 72] },
    { id: 'diesel', name: '柴油发电机排气（低频突出）', levels: [96, 98, 96, 92, 88, 84, 78] },
    { id: 'vacuum', name: '真空泵 / 罗茨风机', levels: [82, 86, 88, 90, 88, 84, 78] },
    { id: 'flat', name: '平直谱（不做计权修正）', levels: [85, 85, 85, 85, 85, 85, 85] }
  ];
  function sourceById(id) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
    return null;
  }

  // ------------------------------ 结构形式 ------------------------------
  // xi：全压损失系数（工程经验范围中值）；vmax：推荐气流速度上限 m/s
  var FORMS = [
    { id: 'round', name: '圆形直管式（内壁衬里）', xi: 0.50, vmax: 12, note: '当量直径 ≤ 300 mm 的管道首选' },
    { id: 'rect', name: '矩形风管内衬（四壁衬里）', xi: 0.70, vmax: 10, note: '土建风道或大型矩形风管常用' },
    { id: 'splitter', name: '片式消声器（片间通道）', xi: 0.80, vmax: 10, note: '当量直径 > 300 mm 时宜用片式，片间距 100~200 mm' },
    { id: 'baffle', name: '折板式消声器', xi: 1.60, vmax: 10, note: '折角不宜大于 20°，且应满足视线不能透过' }
  ];
  function formById(id) {
    for (var i = 0; i < FORMS.length; i++) if (FORMS[i].id === id) return FORMS[i];
    return FORMS[0];
  }

  // ------------------------------ 通道几何 ------------------------------
  /*
   * 输入：form；round→d；rect→a,b；splitter/baffle→blades,gap,height（可 linedEnds）
   *        length 有效长度 m
   * 输出：S 净流通面积、P 吸声饰面周长、PS = P/S、D 当量直径、nCh 通道数
   */
  function channel(o) {
    o = o || {};
    var form = formById(o.form);
    var l = num(o.length);
    if (l == null || l <= 0) return { ok: false, error: '请填写消声器有效长度 l（> 0）' };

    var S, P, nCh, D, geom = '';

    if (form.id === 'round') {
      var d = num(o.d);
      if (d == null || d <= 0) return { ok: false, error: '请填写圆形管道内径 d（> 0）' };
      S = Math.PI * d * d / 4;
      P = Math.PI * d;
      nCh = 1;
      D = d;
      geom = '圆管内径 d = ' + round(d, 3) + ' m';
    } else if (form.id === 'rect') {
      var a = num(o.a), b = num(o.b);
      if (a == null || a <= 0 || b == null || b <= 0) return { ok: false, error: '请填写矩形风管净尺寸 a、b（> 0）' };
      S = a * b;
      P = 2 * (a + b);
      nCh = 1;
      D = 2 * a * b / (a + b);
      geom = '矩形净尺寸 ' + round(a, 3) + ' m × ' + round(b, 3) + ' m';
    } else {
      var n = num(o.blades), gap = num(o.gap), h = num(o.height);
      if (n == null || n < 1) return { ok: false, error: '请填写消声片数量（≥ 1）' };
      if (gap == null || gap <= 0) return { ok: false, error: '请填写片间净通道宽度（> 0）' };
      if (h == null || h <= 0) return { ok: false, error: '请填写消声片高度（> 0）' };
      nCh = Math.round(n) + 1;                  // 片两侧各形成通道，片间通道数 = 片数 + 1
      S = nCh * gap * h;
      P = 2 * h * nCh;                          // 片的两个表面（上下端面另计，见 linedEnds）
      if (o.linedEnds) P += 2 * gap * nCh;      // 通道上下壁亦衬吸声材料时计入
      D = 4 * S / P;
      geom = Math.round(n) + ' 片 × ' + round(gap, 3) + ' m 净通道 × ' + round(h, 3) + ' m 高，共 ' + nCh + ' 个通道' +
        (o.linedEnds ? '（含上下端面衬里）' : '（仅消声片表面）');
    }

    if (form.id === 'baffle' && o.unfoldFactor) {
      // 折板式：声波沿弯折通道传播，有效长度按展开系数放大
      l = l * clamp(num(o.unfoldFactor) || 1, 1, 2);
    }

    var c = num(o.c) || C0;
    var fc = 1.85 * c / D;
    return {
      ok: true, form: form.id, formName: form.name, xi: form.xi, vmax: form.vmax,
      S: S, P: P, PS: P / S, D: D, length: l, nCh: nCh, c: c, fc: fc,
      geom: geom, linedEnds: !!o.linedEnds
    };
  }

  // ------------------------------ 一、阻性消声量 ------------------------------
  /*
   * 输入：channel 参数 + alpha（各频带正入射吸声系数，长度 7 对应 BANDS）
   *        formula: 'gb'（表 6.3.1，默认）| 'perov'
   *        flow: 风量 m³/s（可选，用于流速校核）
   * 输出：逐频带消声量、上限截止频率、流速与告警
   */
  function resistive(o) {
    o = o || {};
    var ch = channel(o);
    if (!ch.ok) return ch;

    var alpha = o.alpha;
    if (!alpha || !alpha.length) return { ok: false, error: '请填写吸声材料的各频带正入射吸声系数 α₀' };
    if (alpha.length !== BANDS.length) {
      return { ok: false, error: 'α₀ 需要 ' + BANDS.length + ' 个频带（' + BANDS.join('、') + ' Hz）' };
    }

    var formula = o.formula === 'perov' ? 'perov' : 'gb';
    var cappedDrop = o.gapDrop !== false;   // 是否计入高频失效折减
    var rows = [];
    var warnings = [];

    BANDS.forEach(function (f, i) {
      var a = num(alpha[i]);
      if (a == null) a = 0;
      var pg = phiGB(a), pp = phiPerov(a);
      var dLgb = pg * ch.PS * ch.length;
      var dLperov = pp * ch.PS * ch.length;
      var base = formula === 'perov' ? dLperov : dLgb;
      var factor = 1, limited = false;
      if (cappedDrop && f > ch.fc) {
        factor = Math.max(0.3, Math.sqrt(ch.fc / f));   // 超过上限截止频率后的经验折减
        limited = true;
      }
      rows.push({
        f: f, alpha: a, phiGB: pg, phiPerov: pp,
        dLgb: dLgb, dLperov: dLperov,
        factor: factor, limited: limited,
        dL: base * factor
      });
    });

    // 流速
    var v = null, flow = num(o.flow);
    if (flow != null && flow > 0) {
      v = flow / ch.S;
      if (v > ch.vmax) {
        warnings.push({
          level: 'warn',
          text: '通道内气流速度 ' + round(v, 1) + ' m/s 超过该结构的常用上限 ' + ch.vmax +
            ' m/s，气流再生噪声与压力损失将明显上升，建议加大流通面积或改用片式结构。'
        });
      } else if (v > ch.vmax * 0.8) {
        warnings.push({
          level: 'info', text: '通道内气流速度 ' + round(v, 1) + ' m/s 接近常用上限 ' + ch.vmax + ' m/s，建议留余量。'
        });
      }
    }

    // 结构选型（GB/T 50087-2013 第 6.3.3 条）
    if (ch.D > 0.3 && (ch.form === 'round' || ch.form === 'rect')) {
      warnings.push({
        level: 'warn',
        text: '通道当量直径 ' + round(ch.D * 1000, 0) + ' mm 大于 300 mm，直管式/内衬式存在高频失效风险，' +
          '宜改用片式或折板式结构（片间距 100~200 mm）。'
      });
    }
    var failBands = rows.filter(function (r) { return r.limited; });
    if (failBands.length) {
      warnings.push({
        level: 'info',
        text: '上限截止频率 f_c = ' + round(ch.fc, 0) + ' Hz（f_c = 1.85c/D），' +
          failBands.map(function (r) { return r.f + ' Hz'; }).join('、') +
          ' 频带已按高频失效经验折减；如高频要求高，应减小通道当量直径或采用片式结构。'
      });
    }
    if (ch.length > 3) {
      warnings.push({ level: 'info', text: '有效长度 ' + round(ch.length, 2) + ' m 较长，应校核安装空间与压损预算。' });
    }

    return {
      ok: true, channel: ch, formula: formula, rows: rows, warnings: warnings,
      P: ch.P, S: ch.S, PS: ch.PS, D: ch.D, fc: ch.fc, v: v,
      flow: flow, geom: ch.geom, formName: ch.formName, length: ch.length, xi: ch.xi, vmax: ch.vmax,
      // 简单几何下的常用简式，便于核对
      simplified: ch.form === 'round' ? 'ΔL = 4φ(α₀)·l/d' :
        (ch.form === 'splitter' || ch.form === 'baffle' ? 'ΔL = 2φ(α₀)·l/a（a 为净通道宽度）' : 'ΔL = φ(α₀)·P·l/S')
    };
  }

  // 各频带所需有效长度（给定逐频带目标消声量）
  // 注：P/S、D 等通道参数与长度无关，此处以单位长度占位通过几何校验，长度为反算输出
  function requiredLength(o) {
    o = o || {};
    var ch = channel(Object.assign({}, o, { length: 1 }));
    if (!ch.ok) return ch;
    var alpha = o.alpha;
    if (!alpha || alpha.length !== BANDS.length) return { ok: false, error: 'α₀ 需要 ' + BANDS.length + ' 个频带' };
    var formula = o.formula === 'perov' ? 'perov' : 'gb';

    // 情形一：指定目标频带与目标消声量
    var tBand = num(o.targetFreq), tLevel = num(o.targetLoss);
    if (tBand != null && tLevel != null) {
      var idx = BANDS.indexOf(tBand);
      if (idx < 0) return { ok: false, error: '目标频带需为 ' + BANDS.join('、') + ' Hz 之一' };
      var phi = formula === 'perov' ? phiPerov(alpha[idx]) : phiGB(alpha[idx]);
      if (!phi) return { ok: false, error: '该频带吸声系数过小，无法达到目标消声量' };
      var l = tLevel / (phi * ch.PS);
      var rows = BANDS.map(function (f, i) {
        var p = formula === 'perov' ? phiPerov(alpha[i]) : phiGB(alpha[i]);
        var li = p > 0 ? tLevel / (p * ch.PS) : null;
        return { f: f, alpha: alpha[i], phi: p, length: li, over: p > 0 && p < phi };
      });
      var strict = rows.reduce(function (a, b) {
        if (b.length == null) return a;
        return (a == null || b.length > a.length) ? b : a;
      }, null);
      return {
        ok: true, mode: 'band', targetFreq: tBand, targetLoss: tLevel,
        length: l, channel: ch, rows: rows, formula: formula,
        binding: strict && strict.f !== tBand
          ? '控制频带为 ' + tBand + ' Hz，需 ' + round(l, 2) + ' m；若要求各频带同时达到 ' + tLevel +
            ' dB，则应由最严频带 ' + strict.f + ' Hz 控制（需 ' + round(strict.length, 2) + ' m）'
          : '控制频带为 ' + tBand + ' Hz，需 ' + round(l, 2) + ' m（各频带等目标下该频带即最严）'
      };
    }

    // 情形二：给定声源谱与目标 A 计权插入损失，二分求长度
    var src = o.sourceLevels;
    var targetIL = num(o.targetIL);
    if (src && src.length === BANDS.length && targetIL != null && targetIL > 0) {
      function ilAt(lv) {
        var sum = 0, sumAfter = 0;
        BANDS.forEach(function (f, i) {
          var p = formula === 'perov' ? phiPerov(alpha[i]) : phiGB(alpha[i]);
          var dL = p * ch.PS * lv;
          if (f > ch.fc) dL *= Math.max(0.3, Math.sqrt(ch.fc / f));
          var la = num(src[i]) + aWeight(f);
          sum += Math.pow(10, la / 10);
          sumAfter += Math.pow(10, (la - dL) / 10);
        });
        return 10 * Math.log10(sum / sumAfter);
      }
      var lo = 0.05, hi = 20;
      if (ilAt(hi) < targetIL) {
        return { ok: false, error: '即使有效长度取 20 m 也达不到目标 A 计权消声量 ' + targetIL + ' dB，请改用吸声性能更好/更厚的材料或改选抗性结构。' };
      }
      for (var k = 0; k < 60; k++) {
        var mid = (lo + hi) / 2;
        if (ilAt(mid) < targetIL) lo = mid; else hi = mid;
      }
      return {
        ok: true, mode: 'aweighted', targetIL: targetIL, length: hi,
        achievableIL: ilAt(hi), channel: ch, formula: formula,
        note: '按逐频带消声量叠加、以 A 计权插入损失达标反算（二分法），计入了高频失效折减。'
      };
    }

    return { ok: false, error: '请填写目标频带与目标消声量，或选择声源谱并填写目标 A 计权消声量' };
  }

  // φ(α₀) 反演：给定消声系数，反求所需的最小正入射吸声系数 α₀
  //   GB 表：分段线性反演（α₀ ≥ 0.9 后 φ 恒为 1.5，超出表上限返回 null）
  //   别洛夫式：解析反演 α₀ = 1 − [(1−φ/4.34)/(1+φ/4.34)]²
  function alphaFromPhi(phi, formula) {
    var p = num(phi);
    if (p == null || p <= 0) return null;
    if (formula === 'perov') {
      var q = p / 4.34;
      if (q >= 1) return 1;
      var r = (1 - q) / (1 + q);
      return 1 - r * r;
    }
    if (p > 1.5 + 1e-9) return null;         // GB 表 6.3.1 上限（留浮点容差）
    for (var i = 1; i < GB_PHI.length; i++) {
      if (p <= GB_PHI[i][1] + 1e-12) {
        var x0 = GB_PHI[i - 1][0], y0 = GB_PHI[i - 1][1];
        var x1 = GB_PHI[i][0], y1 = GB_PHI[i][1];
        if (y1 === y0) return x0;             // 平台段：取平台起点
        return x0 + (p - y0) / (y1 - y0) * (x1 - x0);
      }
    }
    return 0.9;
  }

  // 反算选材：给定几何（含长度）与目标频带消声量，反求所需 φ / α₀，
  // 并从 MATERIALS 中筛出达标候选（按达标余量从小到大排序，最省料者在前）
  function recommendMaterial(o) {
    o = o || {};
    var ch = channel(o);
    if (!ch.ok) return ch;
    var tBand = num(o.targetFreq), tLevel = num(o.targetLoss);
    if (tBand == null) return { ok: false, error: '请选择目标频带' };
    if (tLevel == null || tLevel <= 0) return { ok: false, error: '请填写目标消声量（> 0 dB）' };
    var idx = BANDS.indexOf(tBand);
    if (idx < 0) return { ok: false, error: '目标频带需为 ' + BANDS.join('、') + ' Hz 之一' };
    var formula = o.formula === 'perov' ? 'perov' : 'gb';

    var factor = 1, limited = false;
    if (tBand > ch.fc) {
      factor = Math.max(0.3, Math.sqrt(ch.fc / tBand));
      limited = true;
    }
    var phiReq = tLevel / (ch.PS * ch.length * factor);
    var alphaReq = alphaFromPhi(phiReq, formula);

    var candidates = [], insufficient = [];
    MATERIALS.forEach(function (mat) {
      var a = num(mat.alpha[idx]);
      if (a == null) return;
      var phi = formula === 'perov' ? phiPerov(a) : phiGB(a);
      var dL = phi * ch.PS * ch.length * factor;
      var rec = { id: mat.id, name: mat.name, alpha: a, phi: phi, dL: dL, pass: dL >= tLevel - 1e-9 };
      (rec.pass ? candidates : insufficient).push(rec);
    });
    candidates.sort(function (x, y) { return x.dL - y.dL; });
    insufficient.sort(function (x, y) { return y.dL - x.dL; });

    return {
      ok: true, targetFreq: tBand, targetLoss: tLevel, formula: formula,
      phiReq: phiReq, alphaReq: alphaReq, factor: factor, limited: limited,
      fc: ch.fc, channel: ch, candidates: candidates, insufficient: insufficient,
      note: alphaReq == null
        ? '所需消声系数 φ = ' + round(phiReq, 2) + ' 超出' + (formula === 'gb' ? 'GB/T 50087 表 6.3.1 上限 1.5' : '别洛夫式可达范围（φ ≤ 4.34）') +
          '，需加长消声器、增大 P/S（如改片式结构）或改用抗性结构'
        : '达到 ' + tLevel + ' dB @ ' + tBand + ' Hz 需 φ ≥ ' + round(phiReq, 2) +
          '（对应 α₀ ≥ ' + round(alphaReq, 2) + '）；下表按达标余量从小到大排序'
    };
  }

  // ------------------------------ 二、抗性：扩张室 ------------------------------
  /*
   * 输入：m 扩张比（也可给 d1 主管内径、d2 扩张室内径自动换算）、l 扩张室长度、stages 级数
   * 输出：逐频带传声损失、通过频率、峰值频率
   */
  function expansion(o) {
    o = o || {};
    var c = num(o.c) || C0;
    var l = num(o.l);
    if (l == null || l <= 0) return { ok: false, error: '请填写扩张室长度 l（> 0）' };

    var m = num(o.m);
    var d1 = num(o.d1), d2 = num(o.d2);
    if ((m == null || m <= 0) && d1 && d2 && d1 > 0 && d2 > 0) m = Math.pow(d2 / d1, 2);
    if (m == null || m <= 0) return { ok: false, error: '请填写扩张比 m（或主管与扩张室内径）' };
    if (m === 1) return { ok: false, error: '扩张比 m = 1 时无消声作用（未扩张）' };
    if (m < 1) return { ok: false, error: '扩张比 m 应大于 1（扩张室截面积 / 主管截面积）' };

    var stages = Math.max(1, Math.round(num(o.stages) || 1));
    var coeff = 0.25 * Math.pow(m - 1 / m, 2);

    var rows = BANDS.map(function (f) {
      var k = 2 * Math.PI * f / c;
      var kl = k * l;
      var tl = 10 * Math.log10(1 + coeff * Math.pow(Math.sin(kl), 2));
      return { f: f, kl: kl, sin2: Math.pow(Math.sin(kl), 2), tl: tl, tlTotal: tl * stages };
    });

    // 峰值（sin²kl = 1，kl = π/2 + nπ）与通过频率（sin kl = 0，kl = nπ）
    var peakFreqs = [], passFreqs = [];
    for (var n = 0; n <= 20; n++) {
      var fp = c * (2 * n + 1) / (4 * l);
      if (fp <= 8000) peakFreqs.push(fp);
      var fz = c * (n + 1) / (2 * l);
      if (fz <= 8000) passFreqs.push(fz);
    }
    var peakTL = 10 * Math.log10(1 + coeff);

    var warnings = [];
    if (n = passFreqs.length) {
      warnings.push({
        level: 'warn',
        text: '存在通过频率（该频率处 TL = 0，几乎无消声）：' + passFreqs.slice(0, 4).map(function (f) { return round(f, 0) + ' Hz'; }).join('、') +
          (passFreqs.length > 4 ? ' 等' : '') + '。可采用插入管（主管插入扩张室 1/2 或 1/4 长度）或串联多节错开通过频率来改善。'
      });
    }
    if (l > 1) warnings.push({ level: 'info', text: '扩张室长度 ' + round(l, 2) + ' m，第一通过频率 ' + round(c / (2 * l), 0) + ' Hz 偏低，应校核低频段是否存在通过频率落入主要噪声频带。' });
    if (stages > 1) {
      warnings.push({
        level: 'info',
        text: '已按 ' + stages + ' 节串联估算，传声损失按各节相加（' + stages + ' × 单节值）；节间距离较近时实际值会低于该估算。'
      });
    }

    return {
      ok: true, m: m, l: l, stages: stages, c: c, coeff: coeff,
      rows: rows, peakFreqs: peakFreqs, passFreqs: passFreqs,
      peakTL: peakTL, peakTLTotal: peakTL * stages, warnings: warnings,
      formula: 'TL = 10 lg[1 + ¼(m − 1/m)² sin²(k l)]',
      d1: d1, d2: d2,
      S1: d1 ? Math.PI * d1 * d1 / 4 : null,
      S2: d2 ? Math.PI * d2 * d2 / 4 : null
    };
  }

  // ------------------------------ 二、抗性：共振腔 ------------------------------
  /*
   * 输入：holeD 颈口直径 d（m）、plateT 颈长/板厚 t（m）、holes 孔数 n
   *        volume 腔容积 V（m³）或（chamberD 腔径 + chamberL 腔长）
   *        pipeD 主管内径（或 pipeArea）
   * 输出：共振频率 f_r、逐频带 TL（受实际消声量上限 cap 限制）
   */
  function resonator(o) {
    o = o || {};
    var c = num(o.c) || C0;
    var d = num(o.holeD), t = num(o.plateT), holes = num(o.holes);
    if (d == null || d <= 0) return { ok: false, error: '请填写颈（穿孔）直径 d（> 0）' };
    if (t == null || t < 0) return { ok: false, error: '请填写颈长（板厚）t（≥ 0）' };
    if (holes == null || holes < 1) return { ok: false, error: '请填写穿孔数量（≥ 1）' };

    var V = num(o.volume);
    var cd = num(o.chamberD), cl = num(o.chamberL);
    if ((V == null || V <= 0) && cd && cl && cd > 0 && cl > 0) V = Math.PI * cd * cd / 4 * cl;
    if (V == null || V <= 0) return { ok: false, error: '请填写共振腔容积 V（或腔体内径与长度）' };

    var Sp = num(o.pipeArea);
    var pd = num(o.pipeD);
    if ((Sp == null || Sp <= 0) && pd && pd > 0) Sp = Math.PI * pd * pd / 4;
    if (Sp == null || Sp <= 0) return { ok: false, error: '请填写主管道截面积（或主管内径）' };

    var S0 = Math.round(holes) * Math.PI * d * d / 4;      // 颈口总面积
    var lEff = t + 0.85 * d;                               // 端修正后的有效颈长
    var G = S0 / lEff;                                     // 声传导率 m
    var fr = c / (2 * Math.PI) * Math.sqrt(G / V);         // 共振频率
    var cap = num(o.cap);
    if (cap == null) cap = 20;                             // 实际消声量上限（工程经验）

    var rows = BANDS.map(function (f) {
      var x = (f / fr) - (fr / f);
      var tl;
      if (Math.abs(x) < 1e-9) tl = cap;
      else {
        var q = Math.sqrt(G * V) / (2 * Sp * x);
        tl = 10 * Math.log10(1 + q * q);
      }
      return { f: f, x: x, tlRaw: tl, tl: Math.min(tl, cap), capped: tl > cap };
    });
    // 曲线数据（用于绘图，对数扫频）
    var curve = [];
    for (var f = 40; f <= 8000; f *= 1.05) {
      var x = (f / fr) - (fr / f);
      var q = Math.sqrt(G * V) / (2 * Sp * x);
      var tl = 10 * Math.log10(1 + q * q);
      curve.push({ f: f, tl: Math.min(tl, cap) });
    }

    var warnings = [];
    if (fr < 100) warnings.push({ level: 'info', text: '共振频率 ' + round(fr, 1) + ' Hz 很低，需很大腔容或较小颈口面积；安装尺寸应重点校核。' });
    if (fr > 2000) warnings.push({ level: 'info', text: '共振频率 ' + round(fr, 1) + ' Hz 偏高，常用做法是加大颈口面积（多穿孔）或减小腔容。' });
    warnings.push({
      level: 'info',
      text: '共振腔的传声损失在共振频率处理想情况下趋于无穷，实际受声阻限制，本计算按上限 ' + round(cap, 0) +
        ' dB 截断（可在结果中调整）。共振腔带宽窄、只对共振频率附近有效，工程上常与阻性结构组成阻抗复合式。'
    });

    return {
      ok: true, fr: fr, G: G, V: V, S0: S0, lEff: lEff, Sp: Sp, cap: cap,
      rows: rows, curve: curve, warnings: warnings, holes: Math.round(holes), holeD: d, plateT: t,
      formula: 'f_r = (c/2π)√(G/V)，G = S₀/(t + 0.85d)；TL = 10 lg[1 + (√(GV)/(2S_p(f/f_r − f_r/f)))²]'
    };
  }

  // ------------------------------ 三、压力损失与校核 ------------------------------
  function pressureLoss(o) {
    o = o || {};
    var ch = channel(o);
    if (!ch.ok) return ch;
    var flow = num(o.flow);
    var v = num(o.v);
    if (v == null && flow != null && flow > 0) v = flow / ch.S;
    if (v == null || v <= 0) return { ok: false, error: '请填写风量或气流速度以计算压力损失' };
    var rho = num(o.rho) || RHO;
    var xi = num(o.xi);
    if (xi == null) xi = ch.xi;
    var dp = xi * rho * v * v / 2;
    return {
      ok: true, xi: xi, v: v, rho: rho, dp: dp, S: ch.S, vmax: ch.vmax, formName: ch.formName,
      formula: 'Δp = ξ·ρ·v²/2（ξ 为全压损失系数，按结构形式取工程经验值）',
      note: 'ξ 取值范围随结构形式与消声片迎面情况变化较大（直管式约 0.4~0.6、片式 0.6~1.0、折板式 1.5~2.5、扩张室 1.5~3.0），' +
        '正式设计应以厂家实测全压损失系数或 GB/T 25516 试验数据为准。'
    };
  }

  // ------------------------------ 组合：阻性 + 抗性 ------------------------------
  /*
   * 输入：res（resistive 输入）、exp（expansion 输入）、res2（resonator 输入，可选）
   *        sourceId 或 sourceLevels、weighted（默认 true）
   * 输出：逐频带总消声量、A 计权插入损失、前后总声级
   */
  function combined(o) {
    o = o || {};
    var rres = o.res ? resistive(o.res) : null;
    if (rres && !rres.ok) return rres;
    var rexp = o.exp ? expansion(o.exp) : null;
    if (rexp && !rexp.ok) return rexp;
    var rreson = o.reson ? resonator(o.reson) : null;
    if (rreson && !rreson.ok) return rreson;

    if (!rres && !rexp && !rreson) return { ok: false, error: '请至少填写一种消声结构（阻性 / 扩张室 / 共振腔）' };

    var src = null, srcName = '';
    if (o.sourceLevels && o.sourceLevels.length === BANDS.length) {
      src = o.sourceLevels.map(num);
      srcName = o.sourceName || '自定义声源谱';
    } else {
      var s = sourceById(o.sourceId || 'fan');
      if (s) { src = s.levels; srcName = s.name; }
    }
    var weighted = o.weighted !== false;

    var rows = BANDS.map(function (f, i) {
      var dRes = rres ? rres.rows[i].dL : 0;
      var tlE = rexp ? rexp.rows[i].tlTotal : 0;
      var tlR = rreson ? rreson.rows[i].tl : 0;
      var total = dRes + tlE + tlR;
      var w = aWeight(f);
      var lp = src ? src[i] : null;
      var lpa = lp == null || lp == null ? null : lp + w;
      return {
        f: f, dRes: dRes, tlExpansion: tlE, tlResonator: tlR, total: total,
        source: lp, aWeight: w,
        sourceA: lp == null ? null : lp + w,
        after: lp == null ? null : lp - total,
        afterA: lp == null ? null : lp + w - total
      };
    });

    var before = null, after = null, il = null;
    if (src) {
      var b = rows.map(function (r) { return weighted ? r.sourceA : r.source; });
      var a2 = rows.map(function (r) { return weighted ? r.afterA : r.after; });
      before = sumDb(b);
      after = sumDb(a2);
      il = before - after;
    }

    var warnings = [];
    if (rres) warnings = warnings.concat(rres.warnings);
    if (rexp) warnings = warnings.concat(rexp.warnings);
    if (rreson) warnings = warnings.concat(rreson.warnings);
    if ((rres ? 1 : 0) + (rexp ? 1 : 0) + (rreson ? 1 : 0) > 1) {
      warnings.unshift({
        level: 'info',
        text: '阻性结构与抗性结构的各频带消声量按数值相加估算（阻抗复合式的常用简化），实际受结构耦合与气流影响，宜留 2~3 dB 余量。'
      });
    }

    return {
      ok: true, rows: rows, sourceName: srcName, weighted: weighted,
      before: before, after: after, insertionLoss: il,
      components: {
        resistive: rres ? { length: rres.length, formName: rres.formName, PS: rres.PS, D: rres.D, fc: rres.fc, v: rres.v } : null,
        expansion: rexp ? { m: rexp.m, l: rexp.l, stages: rexp.stages, peakTL: rexp.peakTL } : null,
        resonator: rreson ? { fr: rreson.fr, V: rreson.V } : null
      },
      warnings: warnings
    };
  }

  // ------------------------------ 选型建议 ------------------------------
  function advice(o) {
    o = o || {};
    var out = [];
    var ch = o.form || o.length != null ? channel(o) : null;
    if (ch && ch.ok) {
      if (ch.D <= 0.3) {
        out.push({ level: 'ok', text: '通道当量直径 ' + round(ch.D * 1000, 0) + ' mm ≤ 300 mm，可选用直管式消声器（GB/T 50087-2013 第 6.3.3-1 款）。' });
      } else {
        out.push({ level: 'warn', text: '通道当量直径 ' + round(ch.D * 1000, 0) + ' mm > 300 mm，宜选用片式或折板式消声器，片间距取 100~200 mm（GB/T 50087-2013 第 6.3.3-2 款）。' });
      }
      out.push({ level: 'info', text: '上限截止频率 f_c = ' + round(ch.fc, 0) + ' Hz（式 6.3.2：f = 1.85c/D）；' + (ch.D > 0.1 ? '当量直径越小，高频消声效果越好。' : '当量直径较小，高频性能良好。') });
    }
    out.push({ level: 'info', text: '噪声呈明显低中频脉动特性、或通道内不宜使用阻性吸声材料（高温、油雾、粉尘）时，宜选用扩张室式等抗性消声器（GB/T 50087-2013 第 6.3.4 款）。' });
    out.push({ level: 'info', text: '迷宫式消声器小室宜 3~5 个、室内流速宜小于 5 m/s；消声弯头内流速宜小于 8 m/s（GB/T 50087-2013 第 6.3.3-4、5 款）。' });
    out.push({ level: 'info', text: '消声器产生的气流再生噪声有影响时，应降低气流速度或简化消声器结构（GB/T 50087-2013 第 6.2.8 条）。' });
    return out;
  }

  var API = {
    C0: C0, RHO: RHO, BANDS: BANDS,
    MATERIALS: MATERIALS, SOURCES: SOURCES, FORMS: FORMS,
    aWeight: aWeight, sumDb: sumDb, phiGB: phiGB, phiPerov: phiPerov,
    GB_PHI: GB_PHI,
    channel: channel, resistive: resistive, requiredLength: requiredLength,
    alphaFromPhi: alphaFromPhi, recommendMaterial: recommendMaterial,
    expansion: expansion, resonator: resonator,
    pressureLoss: pressureLoss, combined: combined, advice: advice,
    sourceById: sourceById, formById: formById
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.Muffler = API;
  }
})(typeof window !== 'undefined' ? window : this);
