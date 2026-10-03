// ============================================
// app.js — 每個頁面共用的初始化
// ============================================

import { renderSidebar } from './sidebar.js';
import { renderNavbar } from './navbar.js';
import { requireLogin } from './auth-guard.js';
import { getDisplayName } from './auth.js';

export async function initApp({ activeHref = '', title = '', needAuth = true } = {}) {
  let user = null;
  if (needAuth) {
    user = await requireLogin();
  }

  await renderSidebar('sidebar-root', activeHref);
  renderNavbar('navbar-root', title);

  const userBox = document.getElementById('navbar-user');
  if (userBox && user) {
    const name = getDisplayName(user);
    userBox.innerHTML = `
      <span class="mono" style="font-size:12px; color:var(--text-muted); margin-right:10px;">
        👤 ${name}
      </span>
    `;
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return user;
}
