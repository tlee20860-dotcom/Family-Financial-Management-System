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
  initPWA();
  AppState.init();

  let user = null;
  if (needAuth) {
    user = await requireLogin({ requireFamily });
    if (!user) return null;
  }

  await renderSidebar('sidebar-root', activeHref);
  renderNavbar('navbar-root', title);
  renderDateFilter('date-filter-root');

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
