// ============================================
// sw.js — Service Worker（離線快取）
// ============================================

const CACHE_NAME = 'family-fin-v2'; // ⚠️ 版本號從 v1 改為 v2

const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './members.html',
  './member-detail.html',
  './insurance.html',
  './expenses.html',
  './portfolio.html',
  './settings.html',
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
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
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

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;

          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
