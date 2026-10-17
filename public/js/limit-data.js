/*
 * limit-data.js — 标准限值库（内置 + 外部可配置）
 *
 * 设计：
 *   1) 内置一份完整限值数据（本文件底部 INBUILT），任何环境立即可用；
 *   2) 部署后可用同结构 JSON 覆盖（public/data/limits.json，直接编辑该文件
 *      并重新部署即生效，无需改代码）——load() 优先 fetch 外部文件，
 *      失败/缺失时回退内置数据；
 *   3) 外部文件支持「追加覆盖」：外部 JSON 里同 key 的条目整体替换内置，
 *      未涉及的 key 仍用内置值。
 *
 * 查询接口：
 *   LimitData.load().then(function (db) { db.get('GB12348', {cat:'1', period:'day'}) ... })
 *   或 LimitData.ready 同步数据（load 完成前为内置）。
 *
 * 标准覆盖：
 *   GB 12348-2008 工业企业厂界 / GB 22337-2008 社会生活噪声 / GB 12523-2011 建筑施工场界
 *   GB 3096-2008 声环境功能区 / GB 55016-2021 室内噪声 / GB 50118-2010 + GB 55038-2025 隔声限值
 */
(function (global) {
  'use strict';

  var EXTERNAL_URL = 'data/limits.json';

  /* ---------------- 内置限值数据 ---------------- */
  var INBUILT = {
    schema: 1,
    note: '内置默认限值库；部署后可用 data/limits.json 覆盖（外部同 key 整体替换）。',

    // GB 12348-2008 工业企业厂界环境噪声排放限值（dB(A)，等效声级）
    GB12348: {
      id: 'GB 12348-2008',
      name: '工业企业厂界环境噪声排放限值',
      type: '等效声级 Leq dB(A)',
      units: 'dB(A)',
      basis: '厂界外 1 m、高度 1.2 m 以上；按 GB 3096 声环境功能区类别。',
      table: {
        '0': { day: 50, night: 40, note: '0 类声环境功能区（疗养区等特别需要安静的区域）' },
        '1': { day: 55, night: 45, note: '1 类（居住、医疗卫生、文化教育等）' },
        '2': { day: 60, night: 50, note: '2 类（居住、商业、工业混杂区）' },
        '3': { day: 65, night: 55, note: '3 类（工业区）' },
        '4': { day: 70, night: 55, note: '4 类（交通干线两侧；夜间 4b 类为 60）' }
      }
    },

    // GB 22337-2008 社会生活环境噪声排放标准（营业性文化娱乐/商业经营场所边界）
    GB22337: {
      id: 'GB 22337-2008',
      name: '社会生活环境噪声排放标准',
      type: '等效声级 Leq dB(A)',
      units: 'dB(A)',
      basis: '经营场所边界外 1 m；0 类昼 50/夜 40 ~ 4 类昼 70/夜 55',
      table: {
        '0': { day: 50, night: 40, note: '0 类声区' },
        '1': { day: 55, night: 45, note: '1 类声区' },
        '2': { day: 60, night: 50, note: '2 类声区' },
        '3': { day: 65, night: 55, note: '3 类声区' },
        '4': { day: 70, night: 55, note: '4 类声区' }
      }
    },

    // GB 12523-2011 建筑施工场界环境噪声排放限值
    GB12523: {
      id: 'GB 12523-2011',
      name: '建筑施工场界环境噪声排放限值',
      type: '等效声级 Leq dB(A)',
      units: 'dB(A)',
      basis: '场界外 1 m 处测量；夜间噪声最大声级超过限值的幅度不得高于 15 dB（等效脉冲）',
      table: {
        day: { value: 70, note: '昼间 06:00-22:00（各地可调）' },
        night: { value: 55, note: '夜间 22:00-06:00（其余时段可调）' }
      }
    },

    // GB 3096-2008 声环境功能区环境噪声限值（室外，等效声级）
    GB3096: {
      id: 'GB 3096-2008',
      name: '声环境功能区环境噪声限值（室外）',
      units: 'dB(A)',
      basis: '声环境功能区分类限值',
      table: {
        '0': { day: 50, night: 40 },
        '1': { day: 55, night: 45 },
        '2': { day: 60, night: 50 },
        '3': { day: 65, night: 55 },
        '4a': { day: 70, night: 55 },
        '4b': { day: 70, night: 60 }
      }
    },

    // GB 50118-2010 民用建筑隔声设计规范 —— 楼板撞击声限值（计权标准化撞击声压级 LnT,w）
    GB50118_IMPACT: {
      id: 'GB 50118-2010',
      name: '民用建筑隔声设计规范 · 楼板撞击声限值 LnT,w dB',
      units: 'dB',
      table: [
        { type: '住宅分户楼板（卧室/起居室）', high: 65, low: 75 },
        { type: '学校普通教室楼板', high: 65, low: 75 },
        { type: '医院病房楼板', high: 65, low: 75 },
        { type: '旅馆客房楼板', high: 65, low: 75 },
        { type: '办公会议室楼板', high: 65, low: 75 }
      ],
      note: 'high=高要求标准值、low=低限标准值；现场测量采用标准化撞击声压级 LnT,w'
    },

    // GB 55038-2025 住宅项目规范（全文强制，2025-05-01 实施）—— 隔声底线
    GB55038: {
      id: 'GB 55038-2025',
      name: '住宅项目规范 · 隔声底线（强制性）',
      units: 'dB',
      table: {
        air: { value: 50, note: '卧室、起居室分户墙/楼板空气声计权隔声量 R_w + C ≥ 50 dB' },
        impact: { value: 65, note: '卧室、起居室楼板计权标准化撞击声压级 L_nT,w ≤ 65 dB' }
      }
    }
  };

  /* ---------- 查询 ---------- */
  function get(spec) {
    var s = spec || {};
    var id = String(s.id || s.standard || '').toUpperCase();
    var table = INBUILT[id];
    if (!table) return null;
    var out = { id: table.id, name: table.name, units: table.units, basis: table.basis };
    if (s.type === 'table') return out.table || null;
    return out;
  }

  // 按类型取限值：GB12348/GB22337 → 类别+昼/夜；GB12523 → 昼/夜
  function limit(id, zone, daynight) {
    var t = INBUILT[id];
    if (!t) return null;
    if (id === 'GB12523') {
      return t.table[daynight] || null;
    }
    var row = t.table[String(zone)];
    if (!row) return null;
    return row[daynight === 'night' ? 'night' : 'day'];
  }

  // 加载：优先外部文件（可配置），失败/无网络用内置
  var ready = null;
  function load() {
    if (ready) return ready;
    ready = new Promise(function (resolve) {
      if (typeof fetch !== 'function') { resolve(INBUILT); return; }
      fetch(EXTERNAL_URL, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function (ext) {
        if (ext && typeof ext === 'object' && ext.schema === 1) {
          var merged = {};
          Object.keys(INBUILT).forEach(function (k) { merged[k] = INBUILT[k]; });
          Object.keys(ext).forEach(function (k) { if (k !== 'schema' && k !== 'note') merged[k] = ext[k]; });
          INBUILT = merged;
        }
        resolve(INBUILT);
      }).catch(function () { resolve(INBUILT); });
    });
    return ready;
  }

  var API = {
    INBUILT: INBUILT,
    get: get,
    limit: limit,
    load: load,
    externalUrl: EXTERNAL_URL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.LimitData = API;
})(typeof window !== 'undefined' ? window : globalThis);