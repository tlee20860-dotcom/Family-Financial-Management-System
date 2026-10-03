// ============================================
// app.js — 每個頁面共用的初始化
// ============================================

import { renderSidebar } from './sidebar.js';
import { renderNavbar } from './navbar.js';
import { requireLogin } from './auth-guard.js';
import { getDisplayName } from './auth.js';
import { initPWA } from './pwa.js';
import { AppState } from './state.js';

export async function initApp({ activeHref = '', title = '', needAuth = true } = {}) {
  // 1. 初始化 PWA
  initPWA();

  // 2. 初始化全域狀態（設定當前年月）
  AppState.init();

  // 3. 登入檢查
  let user = null;
  if (needAuth) {
    user = await requireLogin();
    AppState.setUser(user);
  }

  // 4. 渲染 Sidebar / Navbar
  await renderSidebar('sidebar-root', activeHref);
  renderNavbar('navbar-root', title);

  // 5. 在 Navbar 顯示登入者名稱
  const userBox = document.getElementById('navbar-user');
  if (userBox && user) {
    const name = getDisplayName(user);
    userBox.innerHTML = `
      <span class="mono" style="font-size:12px; color:var(--text-muted); margin-right:10px;">
        👤 ${name}
      </span>
    `;
  }

  // 6. Lucide 圖標
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return user;
}
