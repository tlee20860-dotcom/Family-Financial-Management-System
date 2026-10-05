// ============================================
// app.js — 每個頁面共用的初始化
// ============================================

import { renderSidebar } from './sidebar.js';
import { renderNavbar } from './navbar.js';
import { renderDateFilter } from './date-filter.js';
import { requireLogin } from './auth-guard.js';
import { getDisplayName } from './auth.js';
import { initPWA } from './pwa.js';
import { AppState } from './state.js';

export async function initApp({ activeHref = '', title = '', needAuth = true, requireFamily = true } = {}) {
  try { initPWA(); } catch (err) { console.warn('PWA 初始化失敗：', err); }
  AppState.init();

  let user = null;
  if (needAuth) {
    try {
      user = await requireLogin({ requireFamily });
    } catch (err) {
      console.error('❌ 登入驗證失敗：', err);
      return null;
    }
    if (!user) return null;
  }

  if (user && !AppState.getFamilyId()) {
    AppState.setFamily(user.uid, '我的家庭');
    console.log('✅ 已強制設定 familyId：', user.uid);
  }

  const sidebarRoot = document.getElementById('sidebar-root');
  if (sidebarRoot) {
    try {
      await renderSidebar('sidebar-root', activeHref);
    } catch (err) {
      console.error('❌ Sidebar 渲染失敗：', err);
    }
  }

  try {
    renderNavbar('navbar-root', title);
  } catch (err) {
    console.error('❌ Navbar 渲染失敗：', err);
  }

  if (activeHref !== 'admin.html') {
    try {
      let dateFilterRoot = document.getElementById('date-filter-root');
      if (!dateFilterRoot) {
        dateFilterRoot = document.createElement('div');
        dateFilterRoot.id = 'date-filter-root';
        const navbar = document.getElementById('navbar-root');
        if (navbar && navbar.parentNode) {
          navbar.parentNode.insertBefore(dateFilterRoot, navbar.nextSibling);
        } else {
          document.body.insertBefore(dateFilterRoot, document.body.firstChild);
        }
      }
      renderDateFilter('date-filter-root');
    } catch (err) {
      console.error('❌ Date Filter 注入失敗：', err);
    }
  }

  const userBox = document.getElementById('navbar-user');
  if (userBox && user) {
    const name = getDisplayName(user);
    const familyName = AppState.getFamilyName();
    const familyTag = familyName ? ` · ${familyName}` : '';
    userBox.innerHTML = `<span class="mono" style="font-size:12px; color:var(--text-muted); margin-right:10px;">👤 ${name}${familyTag}</span>`;
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return user;
}
