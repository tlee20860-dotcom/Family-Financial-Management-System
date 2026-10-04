// ============================================
// app.js — 每個頁面共用的初始化（自動注入 Date Filter）
// ============================================

import { renderSidebar } from './sidebar.js';
import { renderNavbar } from './navbar.js';
import { renderDateFilter } from './date-filter.js';
import { requireLogin } from './auth-guard.js';
import { getDisplayName } from './auth.js';
import { initPWA } from './pwa.js';
import { AppState } from './state.js';

export async function initApp({ activeHref = '', title = '', needAuth = true, requireFamily = true } = {}) {
  initPWA();
  AppState.init();

  let user = null;
  if (needAuth) {
    user = await requireLogin({ requireFamily });
    if (!user) return null;
  }

  // 1. 渲染 Sidebar
  const sidebarRoot = document.getElementById('sidebar-root');
  if (sidebarRoot) {
    await renderSidebar('sidebar-root', activeHref);
  }

  // 2. 渲染 Navbar
  renderNavbar('navbar-root', title);

  // 3. 🆕 自動注入 Date Filter（排除 admin.html）
  if (activeHref !== 'admin.html') {
    let dateFilterRoot = document.getElementById('date-filter-root');

    // 如果 HTML 中沒有這個元素，動態建立並插入到 Navbar 下方
    if (!dateFilterRoot) {
      dateFilterRoot = document.createElement('div');
      dateFilterRoot.id = 'date-filter-root';

      const navbar = document.getElementById('navbar-root');
      if (navbar && navbar.parentNode) {
        navbar.parentNode.insertBefore(dateFilterRoot, navbar.nextSibling);
      }
    }

    // 呼叫 date-filter.js 來渲染內容
    renderDateFilter('date-filter-root');
  }

  // 4. 更新 Navbar 使用者資訊
  const userBox = document.getElementById('navbar-user');
  if (userBox && user) {
    const name = getDisplayName(user);
    const familyName = AppState.getFamilyName();
    const familyTag = familyName ? ` · ${familyName}` : '';
    userBox.innerHTML = `<span class="mono" style="font-size:12px; color:var(--text-muted); margin-right:10px;">👤 ${name}${familyTag}</span>`;
  }

  // 5. 初始化 Lucide 圖標
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return user;
}
