// ============================================
// sidebar.js — 左側導覽選單（動態讀取成員）
// ============================================

import { listenMembers } from './db.js';
import { escapeHtml } from './utils.js';

const STATIC_TOP = [
  { icon: 'home', label: '總覽儀表板', href: 'index.html' },
];

const STATIC_BOTTOM = [
  { icon: 'shield',     label: '保險付款',   href: 'insurance.html' },
  { icon: 'receipt',    label: '每月總開銷', href: 'expenses.html' },
  { icon: 'tags',       label: '支出項目庫', href: 'expense-categories.html' },
  { icon: 'line-chart', label: '基金投資',   href: 'portfolio.html' },
  { icon: 'settings',   label: '系統設定',   href: 'settings.html' },
];

const ROLE_ICON = {
  husband: 'user',
  wife: 'user',
  child: 'user',
  other: 'user',
};

export async function renderSidebar(containerId = 'sidebar-root', activeHref = '') {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.classList.add('sidebar');
  root.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">◈ FAMILY.FIN</div>
    </div>
    <nav class="sidebar-nav" id="sidebar-nav-inner"></nav>
  `;

  const nav = root.querySelector('#sidebar-nav-inner');

  listenMembers((members) => {
    nav.innerHTML = renderNavContent(members, activeHref);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  });

  const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (collapsed && window.innerWidth >= 640) root.classList.add('collapsed');
}

function renderNavContent(members, activeHref) {
  return `
    ${STATIC_TOP.map((item) => renderNavItem(item, activeHref)).join('')}

    <div class="nav-group-title">成員版面</div>
    <div class="nav-sub">
      ${members.map((m) => renderNavItem({
        icon: ROLE_ICON[m.role] || 'user',
        label: m.name,
        href: `member-detail.html?id=${m.id}`,
      }, activeHref)).join('')}
      ${renderNavItem({
        icon: 'plus', label: '管理成員', href: 'members.html',
      }, activeHref)}
    </div>

    ${STATIC_BOTTOM.map((item) => renderNavItem(item, activeHref)).join('')}
  `;
}

function renderNavItem(item, activeHref) {
  const isActive = item.href === activeHref ? 'active' : '';
  return `
    <a class="nav-item ${isActive}" href="${item.href}">
      <i data-lucide="${item.icon}" class="nav-icon"></i>
      <span class="nav-label">${escapeHtml(item.label)}</span>
    </a>
  `;
}
