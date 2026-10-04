// ============================================
// sidebar.js — 左側導覽選單（成員版面可折疊）
// ============================================

import { listenMembers } from './db.js';
import { escapeHtml, sortMembers } from './utils.js';

const STATIC_TOP = [
  { icon: 'home', label: '總覽儀表板', href: 'index.html' },
];

const STATIC_BOTTOM = [
  { icon: 'dollar-sign',  label: '每月收入',   href: 'income.html' },
  { icon: 'landmark',     label: '銀行管理',   href: 'banks.html' },
  { icon: 'shield',       label: '保險付款',   href: 'insurance.html' },
  { icon: 'receipt',      label: '每月總開銷', href: 'expenses.html' },
  { icon: 'clipboard-check', label: '結算清單', href: 'settlements.html' },
  { icon: 'file-text',    label: '固定支出',   href: 'fixed-expenses.html' },
  { icon: 'tags',         label: '支出項目庫', href: 'expense-categories.html' },
  { icon: 'line-chart',   label: '基金投資',   href: 'portfolio.html' },
  { icon: 'bar-chart-3',  label: '年度報表',   href: 'annual-report.html' },
  { icon: 'settings',     label: '系統設定',   href: 'settings.html' },
];

const ROLE_ICON = { husband: 'user', wife: 'user', child: 'user', other: 'user' };

let isMembersGroupOpen = null;

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

  if (isMembersGroupOpen === null) {
    const saved = localStorage.getItem('members-group-open');
    isMembersGroupOpen = saved === 'true';
  }

  const isMemberPage = activeHref.includes('member-detail') || activeHref.includes('members.html');
  if (isMemberPage) isMembersGroupOpen = true;

  if (!window._sidebarEventBound) {
    window._sidebarEventBound = true;
    document.addEventListener('click', (e) => {
      const title = e.target.closest('#members-group-title');
      if (!title) return;
      isMembersGroupOpen = !isMembersGroupOpen;
      localStorage.setItem('members-group-open', String(isMembersGroupOpen));
      updateMembersGroupUI();
    });
  }

  listenMembers((members) => {
    const sorted = sortMembers(members);
    nav.innerHTML = renderNavContent(sorted, activeHref);
    updateMembersGroupUI();
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

    <div class="nav-group-title collapsible" id="members-group-title">
      <span>成員版面</span>
      <i data-lucide="chevron-down" class="nav-group-arrow"></i>
    </div>
    <div class="nav-sub" id="members-group-sub">
      ${members.map((m) => renderNavItem({
        icon: ROLE_ICON[m.role] || 'user',
        label: m.name,
        href: `member-detail.html?id=${m.id}`,
      }, activeHref)).join('')}
      ${renderNavItem({ icon: 'plus', label: '管理成員', href: 'members.html' }, activeHref)}
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

function updateMembersGroupUI() {
  const title = document.getElementById('members-group-title');
  const sub = document.getElementById('members-group-sub');
  if (!title || !sub) return;

  if (isMembersGroupOpen) {
    title.classList.add('open');
    sub.style.display = 'block';
  } else {
    title.classList.remove('open');
    sub.style.display = 'none';
  }
}
