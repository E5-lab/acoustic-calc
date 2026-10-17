/*
 * sw.js — 声学计算工具箱 Service Worker（PWA 离线支持）
 *
 * 策略：
 *   - 安装时预缓存核心外壳（index.html / 样式 / manifest / 图标）；
 *   - 导航请求（地址栏 / 刷新）：网络优先，失败回退缓存 index.html（哈希路由单页）；
 *   - 其余同源静态资源（js / 图片 / 图标等）：SWR——先回缓存，同时后台更新；
 *   - 激活时清理旧版本缓存。
 *
 * 更新发布：改版本号 CACHE 即可让旧缓存全部失效。
 */
'use strict';

var CACHE = 'acoustic-calc-v1.0.0';

var CORE = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon.svg',
  './favicon.png',
  './favicon.ico',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 第三方（统计脚本等）直接走网络

  // 导航请求：网络优先，离线回退 index.html（哈希路由共用一个文档）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // 静态资源：SWR（cache-first + 后台更新）
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
