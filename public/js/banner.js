/* 首页 hero banner 轮播：自动播放 + 左右箭头 + 圆点指示 + 悬停暂停 */
(function () {
  var track = document.getElementById('hbTrack');
  if (!track) return;
  var slides = track.children;
  var n = slides.length;
  if (n <= 1) return;

  var dots = document.getElementById('hbDots');
  var banner = document.getElementById('heroBanner');
  var idx = 0, timer = null;
  var DUR = 5500;

  for (var i = 0; i < n; i++) {
    var d = document.createElement('button');
    d.className = 'hb-dot';
    d.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
    dots.appendChild(d);
  }

  function go(i) {
    idx = (i + n) % n;
    track.style.transform = 'translateX(' + (-idx * 100) + '%)';
    var kids = dots.children;
    for (var k = 0; k < kids.length; k++) kids[k].classList.toggle('active', k === idx);
  }
  function start() { stop(); timer = setInterval(function () { go(idx + 1); }, DUR); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  document.getElementById('hbNext').addEventListener('click', function () { go(idx + 1); start(); });
  document.getElementById('hbPrev').addEventListener('click', function () { go(idx - 1); start(); });
  Array.prototype.forEach.call(dots.children, function (c, k) {
    c.addEventListener('click', function () { go(k); start(); });
  });
  banner.addEventListener('mouseenter', stop);
  banner.addEventListener('mouseleave', start);

  go(0);
  start();
})();
