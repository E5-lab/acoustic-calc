/*
 * nav.js — 顶栏导航交互（一级/二级/三级菜单）+ 单行收纳 + 模块页面包屑
 *
 * 结构约定（见 index.html）：
 *   .mainnav
 *     a[data-route="home"]                     一级：总览
 *     .nav-group                               一级：分组
 *       button.nav-parent                      分组标题（点击/悬停展开）
 *       .nav-menu > a[data-route]              二级：模块
 *         span.nm-t                            模块名
 *         small.nm-d                           一句话说明
 *         span.nav-sub                         三级：子计算器清单（由本文件注入）
 *     .nav-group.nav-more                      溢出收纳分组（由本文件动态创建）
 *
 * 交互：
 *   - 桌面端（hover: hover）悬停展开，移出收起
 *   - 触屏端点击分组标题展开/收起
 *   - Esc 关闭；点击分组外区域关闭；点击菜单内链接后关闭
 *   - 路由变化时由 router.js 调用 syncActive(route)，同步分组高亮
 *   - 一级菜单恒定单行：宽度不足时，靠后的分组自动收进「更多」，
 *     并在其分栏面板中按分组列出全部模块（含三级子计算器）
 */
(function () {
  'use strict';

  var mqHover = window.matchMedia ? window.matchMedia('(hover: hover)') : null;

  // ------------------------------ 三级菜单数据 ------------------------------
  // 模块路由 → 子计算器清单，与 index.html 中各 view 区块的 <h3> 小节一一对应。
  // 新增模块：在四处登记之外，若希望菜单展示三级入口，在此补一行即可。
  var NAV_SUB = {
    levels: ['多声源能量叠加', '相干叠加', '背景噪声修正', '增量速查表'],
    noise: ['A 声级', 'NC 曲线', 'NR 曲线', 'RC Mark II', '频谱对比'],
    db: ['声级加减', '声压/声强/声功率', '距离衰减', 'A/C/Z 计权'],
    handbook: ['关键词检索', '十个分类', '相关模块跳转', '深链分享'],
    perforation: ['四种阵列形制', '中心距反算', '微穿孔板共振'],
    absorber: ['流阻率模型', '吸声系数曲线', 'NRC'],
    absdesign: ['微穿孔板', '多孔+空腔 TMM', '薄板共振', '吸声降噪量'],
    muffler: ['阻性消声器', '抗性消声器', '阻抗复合', '插入损失'],
    rt60: ['Sabine / Eyring', '材料吸声库', '用途推荐值'],
    stc: ['计权隔声量 Rw', 'STC', '隔声频率特性'],
    leakage: ['孔洞缝隙漏声', '组合构件隔声', '门窗构件估算', '标准限值速查'],
    impact: ['Ln,w 平移曲线评定', '归一化/标准化换算', '楼板构造参考', 'GB 50118 / 55038 判定'],
    roomq: ['RT60 / EDT', 'C50 / C80 / D50', 'Ts / G', '扩声预测'],
    iso3382: ['衰减曲线指标', '强度与侧向 G/LF/LJ', '双耳互相关 IACC', '初始时延差 ITDG'],
    smallroom: ['简正频率', 'Bonello 准则', 'Schroeder 频率', '房间常数/临界距离', '稳态声压级'],
    insdesign: ['质量定律+吻合', '双层共振', '隔声罩插入损失', '浮筑撞击声', '组合/侧向传声'],
    sim: ['三维房间模型', '声场彩图', '指标色标', '导出 PNG'],
    simfx: ['2D / 3D 粒子', '导出 GIF', '导出 MP4'],
    aural: ['混响 A/B 试听', '隔声前后试听'],
    barrier: ['菲涅尔数法', '插入损失', '所需高度反算'],
    vibration: ['静变形法', '频率比法', '隔振效率计算书'],
    env: ['Leq / L10 / L90', 'Ldn / Lden', 'NPL / TNI', '户外传播 ISO 9613-2', '公路交通噪声'],
    exposure: ['分段暴露 L_EX,8h', 'NIOSH / OSHA 剂量 TWA', '允许暴露时间', '脉冲噪声限值', '护听器选型'],
    vibeval: ['振动级换算', 'ISO 2631 计权 / aw', 'VDV', 'GB 10070'],
    hvacnoise: ['设备噪声→房间 Lp', '风管路径衰减', '风管元件 TL', '声功率 ISO 3744/3746'],
    noisemap: ['噪声等值线图', '道路交通噪声', 'GB 3096 / 55016 判定'],
    emission: ['GB 12348 厂界', 'GB 22337 社会生活', 'GB 12523 施工场界', 'GB 3096 功能区'],
    traffic: ['公路线声源', '铁路轮轨简化', '机场 Ldn / NEF'],
    psycho: ['响度 phon↔sone', '尖锐度', '粗糙度 / 抖动度', 'PNL', 'STIPA'],
    pasystem: ['临界距离 / D-R', '可用增益与声反馈', 'STIPA 预测', '扬声器电功率'],
    speakerbox: ['T/S 参数与 Vas', '封闭箱设计', '倒相箱设计', '导风管设计', '箱体尺寸'],
    crossover: ['1~4 阶元件值', 'LR2 / LR4', 'Zobel 补偿', 'L-pad 衰减', '灵敏度匹配'],
    linearray: ['覆盖几何与规模', '逐箱张角 (J 形)', '指向性与旁瓣', '近远场衰减', '梳状滤波'],
    audiolevel: ['电平 dBV/dBu/dBFS', '灵敏度 1W↔2.83V', '串并联与增益', '功放选型', '线材与阻尼'],
    spectrum: ['频带归并', 'A/C/Z 计权', 'NR 评级', 'NC 评级', '1/1↔1/3 转换', '分段 Leq'],
    diffuser: ['八类几何形态', '几何剖面', '裁切清单'],
    hearing: ['ISO 226 等响曲线', 'ISO 7029 年龄听阈', 'WHO 2021 分级', '临界带与掩蔽'],
    wave: ['声速', '波长↔频率', '自由场声强', '声阻抗与界面', '比值↔分贝', '音名与拍频', '管/弦共振', '多普勒'],
    'sim-helmholtz': ['共振频率 f₀', '气塞振荡', '空腔脉动'],
    'sim-impedance': ['入射/反射/透射', '界面两侧介质', '透射损失 TL'],
    'sim-octave': ['9 段频谱', 'A/C/Z 计权', '主频与总声级'],
    'sim-hvac': ['衬里衰减', 'ΔL–频率', '风压损失'],
    'sim-fxlms': ['残差收敛', '反相抵消', '步长稳定性'],
    'sim-drone': ['BPF 音调', '随距离衰减', 'A 计权'],
    'sim-micarray': ['波束图', '主瓣宽', '栅瓣判定'],
    'sim-wedge': ['截止频率', '楔长估算', '数量/体积'],
    'sim-tube': ['管内驻波', '反射系数 R', '吸声系数 α'],
    'sim-echo': ['脉冲往返', '时延↔距离', '距离分辨率'],
    'sim-interference': ['波前叠加场', 'A(θ) 指向图', '相长/相消角'],
    'sim-bubble': ['气泡脉动', '扫频响应', '半功率带宽'],
    'sim-refraction': ['声线束', '折返点高度', '声影区'],
    'sim-radiation': ['极坐标指向图', '探测波形', '指向性指数'],
    splmeter: ['F/S 时间计权', 'Leq 累积', '倍频带声级', '60 s 曲线', '校准偏移'],
    rta: ['1/1 与 1/3 倍频带', 'Z/A/C 计权', '指数平均', '最大保持', '宽带声级'],
    siggen: ['白噪声', '粉红噪声', '正弦', '对数扫频 ESS', '倍频带限噪', 'WAV 下载'],
    irt60: ['Farina 反卷积', 'Schroeder 积分', 'Lundeby 补偿', 'T20 / T30', 'EDT'],
    stipa: ['IEC 60268-16 信号', '7 带 MTF', '视在 SNR', '男声计权 STI', '五级评级'],
    'sim-sonar': ['水声场景', '信号/噪声曲线', '作用距离'],
    'sim-sea': ['能量密度场', '功率流', '声级差 D'],
    'sim-fourier': ['谐波叠加', 'Gibbs 过冲', '加窗频谱'],
    'sim-ut': ['A 扫描波形', '声束剖面', '缺陷定位']
  };

  function groups() {
    return Array.prototype.slice.call(document.querySelectorAll('.nav-group'));
  }

  function isMore(g) { return !!g && g.classList.contains('nav-more'); }

  // 仅一级菜单（.mainnav）内的分组参与收纳/面包屑/三级注入；
  // 顶栏右区的「友链」也是 .nav-group，但不能被收纳隐藏。
  function navGroups() {
    return Array.prototype.slice.call(document.querySelectorAll('.mainnav > .nav-group'));
  }
  function realGroups() {
    return navGroups().filter(function (g) { return !isMore(g); });
  }

  function setOpen(group, open) {
    if (!group) return;
    group.classList.toggle('open', !!open);
    var btn = group.querySelector('.nav-parent');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      groups().forEach(function (g) { if (g !== group) setOpen(g, false); });
    }
  }

  function closeAll() {
    groups().forEach(function (g) { setOpen(g, false); });
  }

  function isOpen(group) {
    return !!group && group.classList.contains('open');
  }

  // ------------------------------ 三级菜单注入 ------------------------------
  function injectSub() {
    navGroups().forEach(function (g) {
      if (isMore(g)) return;
      Array.prototype.forEach.call(g.querySelectorAll('.nav-menu a[data-route]'), function (a) {
        if (a.querySelector('.nav-sub')) return;
        var sub = NAV_SUB[a.getAttribute('data-route')];
        if (!sub || !sub.length) return;
        var span = document.createElement('span');
        span.className = 'nav-sub';
        span.textContent = sub.join(' · ');
        a.appendChild(span);
      });
    });
  }

  // ------------------------------ 一级菜单单行收纳 ------------------------------
  var nav = null;
  var more = null;
  var hiddenGroups = [];
  var queued = false;

  // 当前已显示的一级项（含「更多」）总宽度，与容器可用宽度比较
  function neededWidth() {
    var kids = Array.prototype.slice.call(nav.children).filter(function (k) { return !k.hidden; });
    var gap = parseFloat(window.getComputedStyle(nav).columnGap) || 0;
    var w = kids.reduce(function (s, k) { return s + k.getBoundingClientRect().width; }, 0);
    return w + gap * Math.max(0, kids.length - 1);
  }

  function createMore() {
    more = document.createElement('div');
    more.className = 'nav-group nav-more';
    more.hidden = true;
    more.innerHTML =
      '<button class="nav-parent" type="button" aria-expanded="false" aria-haspopup="true">更多' +
      '<svg class="nav-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">' +
      '<path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" /></svg></button>' +
      '<div class="nav-menu nav-menu-mega"></div>';
    nav.appendChild(more);
    if (mqHover && mqHover.matches) {
      more.addEventListener('mouseleave', function () { setOpen(more, false); });
    }
  }

  // 按分组分栏，重建「更多」面板内容（含三级子计算器）
  function buildMoreMenu(list) {
    hiddenGroups = list;
    var menu = more.querySelector('.nav-menu');
    menu.innerHTML = list.map(function (g) {
      var btn = g.querySelector('.nav-parent');
      var colName = btn ? btn.textContent.trim() : '';
      var links = Array.prototype.slice.call(g.querySelectorAll('.nav-menu a'));
      return '<div class="nm-col"><p class="nm-col-h">' + colName + '</p>' +
        links.map(function (a) {
          var t = a.querySelector('.nm-t');
          var d = a.querySelector('.nm-d');
          var s = a.querySelector('.nav-sub');
          return '<a href="' + a.getAttribute('href') + '" data-route="' +
            a.getAttribute('data-route') + '">' +
            (t ? '<span class="nm-t">' + t.textContent + '</span>' : '') +
            (d ? '<small class="nm-d">' + d.textContent + '</small>' : '') +
            (s ? '<span class="nav-sub">' + s.textContent + '</span>' : '') +
            '</a>';
        }).join('') + '</div>';
    }).join('');
    highlightMore();
  }

  // 同步「更多」面板与按钮的高亮（被收纳分组含当前路由时点亮）
  function highlightMore() {
    if (!more) return;
    var route = window.AppRouter ? window.AppRouter.parse().route : 'home';
    Array.prototype.forEach.call(more.querySelectorAll('a[data-route]'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === route);
    });
    var anyActive = hiddenGroups.some(function (g) {
      return !!g.querySelector('a[data-route="' + route + '"]');
    });
    more.classList.toggle('has-active', anyActive);
    var btn = more.querySelector('.nav-parent');
    if (btn) btn.classList.toggle('active', anyActive);
  }

  // 先全部展开，再从后往前把装不下的分组收进「更多」
  function relayout() {
    if (!nav) return;
    var real = realGroups();
    if (!real.length) return;

    real.forEach(function (g) { g.hidden = false; });
    if (more) more.hidden = true;

    if (neededWidth() <= nav.clientWidth + 1) {
      setOpen(more, false);
      hiddenGroups = [];
      highlightMore();
      return;
    }

    if (!more) createMore();
    more.hidden = false;

    var list = [];
    for (var i = real.length - 1; i >= 0; i--) {
      real[i].hidden = true;
      list.unshift(real[i]);
      if (neededWidth() <= nav.clientWidth + 1) break;
    }
    if (list.length) buildMoreMenu(list);
    else more.hidden = true;

    /* 「更多」面板为 fixed 视口居中定位（见 styles.css），
       top 按按钮底缘精确写入（sticky 顶栏 top 恒为 0，视口坐标即面板坐标） */
    var mBtn = more.querySelector('.nav-parent');
    var mMenu = more.querySelector('.nav-menu');
    if (mBtn && mMenu) {
      mMenu.style.top = Math.round(mBtn.getBoundingClientRect().bottom + 8) + 'px';
    }
  }

  function queueLayout() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () { queued = false; relayout(); });
  }

  function watchWidth() {
    nav = document.querySelector('.mainnav');
    if (!nav) return;
    window.addEventListener('resize', queueLayout);
    window.addEventListener('load', queueLayout);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(queueLayout);
    }
    if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(nav);
    queueLayout();
  }

  // ------------------------------ 事件绑定 ------------------------------
  function bind() {
    var navEl = document.querySelector('.mainnav');
    if (!navEl) return;

    // 分组标题：点击切换（触屏必需；桌面端与悬停配合）
    // 顶栏（友链等）同样使用 .nav-group 结构，一并绑定
    function onNavClick(e) {
      var parent = e.target.closest ? e.target.closest('.nav-parent') : null;
      if (parent) {
        var group = parent.closest('.nav-group');
        setOpen(group, !isOpen(group));
        e.preventDefault();
        return;
      }
      // 点击二级菜单内的链接后立即收起
      var link = e.target.closest ? e.target.closest('.nav-menu a') : null;
      if (link) closeAll();
    }
    navEl.addEventListener('click', onNavClick);
    var topbar = document.querySelector('.topbar-actions');
    if (topbar) topbar.addEventListener('click', onNavClick);

    // 点击空白处收起
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.nav-group')) return;
      closeAll();
    });

    // Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) closeAll();
    });

    // 仅指针悬停设备（桌面）支持移出收起，避免触屏误关
    if (mqHover && mqHover.matches) {
      groups().forEach(function (g) {
        g.addEventListener('mouseleave', function () { setOpen(g, false); });
      });
    }
  }

  // ------------------------------ 路由高亮 ------------------------------
  // router.js 已为 .mainnav a 打上 .active，这里据此同步分组状态与面包屑
  function syncActive(route) {
    var activeLink = document.querySelector('.mainnav a[data-route="' + route + '"]');
    groups().forEach(function (g) {
      if (isMore(g)) return;
      var hit = !!g.querySelector('a[data-route="' + route + '"]');
      g.classList.toggle('has-active', hit);
      var btn = g.querySelector('.nav-parent');
      if (btn) btn.classList.toggle('active', hit);
      if (hit) setOpen(g, false);
    });
    highlightMore();
    if (!activeLink) closeAll();
  }

  // ------------------------------ 面包屑 ------------------------------
  // 在每个模块视图的 .page-head 顶部插入「分组 / 模块名」，与二级菜单结构呼应
  function crumbs() {
    realGroups().forEach(function (g) {
      var btn = g.querySelector('.nav-parent');
      var groupName = btn ? btn.textContent.trim() : '';
      Array.prototype.forEach.call(g.querySelectorAll('.nav-menu a'), function (a) {
        var route = a.getAttribute('data-route');
        var view = document.getElementById('view-' + route);
        if (!view || !route) return;
        var head = view.querySelector('.page-head');
        if (!head || head.querySelector('.crumb')) return;
        var titleEl = a.querySelector('.nm-t');
        var name = titleEl ? titleEl.textContent.trim() : a.textContent.trim();
        var crumb = document.createElement('div');
        crumb.className = 'crumb';
        crumb.setAttribute('data-route', route);
        crumb.innerHTML = '<span class="crumb-g">' + groupName + '</span>' +
          '<span class="crumb-sep">/</span>' +
          '<span class="crumb-c">' + name + '</span>';
        head.insertBefore(crumb, head.firstChild);
      });
    });
  }

  function boot() {
    bind();
    injectSub();
    crumbs();
    syncActive(window.AppRouter ? window.AppRouter.parse().route : 'home');
    watchWidth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.AppNav = {
    syncActive: syncActive,
    closeAll: closeAll,
    groups: groups,
    relayout: function () { relayout(); }
  };
})();
