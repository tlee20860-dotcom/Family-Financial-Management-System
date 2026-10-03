// ============================================
// sw.js — Service Worker（HTML 不攔截版）
// ============================================

const CACHE_NAME = 'family-fin-v4'; // ⚠️ 版本號升級

// 只快取靜態資源（CSS / JS / 圖標）
// HTML 檔一律不走快取，永遠從網路載入
const STATIC_ASSETS = [
  './css/theme.css',
  './css/layout.css',
  './css/components.css',
  './js/app.js',
  './js/sidebar.js',
  './js/navbar.js',
  './js/utils.js',
  './js/auth.js',
  './js/auth-guard.js',
  './js/db.js',
  './js/api.js',
  './js/dashboard.js',
  './js/settings.js',
  './js/insurance.js',
  './js/portfolio.js',
  './js/members.js',
  './js/member-detail.js',
  './js/expenses.js',
  './js/pwa.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('⚠️ 快取失敗（略過）：', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // 1. 跳過跨域請求、API、CDN
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('unpkg') ||
    url.hostname.includes('jsdelivr') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // 2. ⚠️ 關鍵：HTML 檔（.html）不走快取，直接走網路
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    return; // 讓瀏覽器自然去抓網路，不攔截
  }

  // 3. 其他靜態資源：網路優先，失敗才用快取
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        }
        return res;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          return caches.match('./index.html'); // 離線時回首頁
        });
      })
  );
});
