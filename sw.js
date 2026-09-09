/* 화약류관리기사 학습앱 — 오프라인 앱 껍데기 */
var CACHE_NAME = 'hwayak-shell-v1';
var SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './css/style.css', './supabase-config.js',
  './js/cloud.js', './js/store.js', './js/md.js',
  './js/practical.js', './js/quiz.js', './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_NAME ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 최신 HTML을 먼저 확인하고, 인터넷이 끊기면 저장된 앱 껍데기를 사용한다.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
        return response;
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  // 캐시된 파일은 쿼리 버전(?v=...)과 관계없이 재사용한다.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      });
    })
  );
});
