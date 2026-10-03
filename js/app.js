// ============================================
// app.js — 每個頁面共用的初始化
// ============================================

import { renderSidebar } from './sidebar.js';
import { renderNavbar } from './navbar.js';

export function initApp({ activeHref = '', title = '' } = {}) {
  renderSidebar('sidebar-root', activeHref);
  renderNavbar('navbar-root', title);

  // 讓 Lucide 把 <i data-lucide> 轉成 SVG
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
