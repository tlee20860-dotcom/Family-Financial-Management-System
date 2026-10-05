// ============================================
// sw.js — Service Worker（HTML 不攔截版）
// ============================================

const CACHE_NAME = 'family-fin-v56'; // ⚠️ 升級

const STATIC_ASSETS = [
  './css/theme.css', './css/layout.css', './css/components.css',
  './js/app.js', './js/sidebar.js', './js/navbar.js', './js/utils.js',
  './js/auth.js', './js/auth-guard.js', './js/db.js', './js/api.js',
  './js/state.js', './js/dashboard.js', './js/settings.js',
  './js/insurance.js', './js/portfolio.js', './js/members.js',
  './js/member-detail.js', './js/expenses.js', './js/expense-categories.js',
  './js/settlements.js', './js/fixed-expenses.js', './js/income.js',
  './js/banks.js', './js/annual-report.js', './js/pwa.js',
  './manifest.json', './icons/icon.svg',
  // ... 原本的內容 ...
  './js/admin.js',   // 🆕 新增
  // ...
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('⚠️ 快取失敗：', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('firebase') || url.hostname.includes('gstatic') ||
    url.hostname.includes('unpkg') || url.hostname.includes('jsdelivr') ||
    url.hostname.includes('cdnjs') ||
    url.pathname.startsWith('/api/')
  ) return;

  if (url.pathname.endsWith('.html') || url.pathname === '/') return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
  );
});
