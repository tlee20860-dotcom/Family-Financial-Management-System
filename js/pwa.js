// ============================================
// pwa.js — PWA 初始化（manifest / theme-color / Service Worker）
// ============================================

export function initPWA() {
  // 動態注入 manifest link
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = './manifest.json';
    document.head.appendChild(link);
  }

  // theme-color meta
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#080B11';
    document.head.appendChild(meta);
  }

  // apple-mobile-web-app-capable（iOS 加到主畫面體驗）
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-capable';
    meta.content = 'yes';
    document.head.appendChild(meta);

    const meta2 = document.createElement('meta');
    meta2.name = 'apple-mobile-web-app-status-bar-style';
    meta2.content = 'black-translucent';
    document.head.appendChild(meta2);

    const meta3 = document.createElement('meta');
    meta3.name = 'apple-mobile-web-app-title';
    meta3.content = 'FAMILY.FIN';
    document.head.appendChild(meta3);
  }

  // 註冊 Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => console.log('✅ Service Worker 已註冊：', reg.scope))
        .catch((err) => console.warn('⚠️ Service Worker 註冊失敗：', err));
    });
  }
}
