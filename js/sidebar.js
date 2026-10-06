// ============================================
// sidebar.js — 左側導覽選單（成員版面可折疊 + 支援自訂排序）
// ============================================

import { listenMembers } from './db.js';
import { escapeHtml, sortMembers } from './utils.js';
import { ALL_MENU_ITEMS, DEFAULT_ORDER, sortByOrder, watchSidebarOrder } from './sidebar-order.js';

const STATIC_TOP = [
  { icon: 'home', label: '總覽儀表板', href: 'index.html' },
];

const ROLE_ICON = { husband: 'user', wife: 'user', child: 'user', other: 'user' };

let isMembersGroupOpen = null;
let currentOrder = [...DEFAULT_ORDER];
let currentMembers = [];

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

  // 讀取成員版面展開狀態
  if (isMembersGroupOpen === null) {
    const saved = localStorage.getItem('members-group-open');
    isMembersGroupOpen = saved === 'true';
  }

  const isMemberPage = activeHref.includes('member-detail') || activeHref.includes('members.html');
  if (isMemberPage) isMembersGroupOpen = true;

  // 綁定成員版面折疊事件（僅一次）
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

  // 🆕 監聽側邊欄排序（Firebase 同步）
  watchSidebarOrder((order) => {
    currentOrder = order;
    renderNav(nav, activeHref);
  });

  // 監聽成員
  listenMembers((members) => {
    currentMembers = sortMembers(members);
    renderNav(nav, activeHref);
  });

  // 桌面版摺疊狀態
  const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (collapsed && window.innerWidth >= 640) root.classList.add('collapsed');
}

/* ============================================
   渲染導覽列
   ============================================ */
function renderNav(nav, activeHref) {
  const sortedBottom = sortByOrder(ALL_MENU_ITEMS, currentOrder);

  nav.innerHTML = `
    ${STATIC_TOP.map((item) => renderNavItem(item, activeHref)).join('')}

    <div class="nav-group-title collapsible" id="members-group-title">
      <span>成員版面</span>
      <i data-lucide="chevron-down" class="nav-group-arrow"></i>
    </div>
    <div class="nav-sub" id="members-group-sub">
      ${currentMembers.map((m) => renderNavItem({
        icon: ROLE_ICON[m.role] || 'user',
        label: m.name,
        href: `member-detail.html?id=${m.id}`,
      }, activeHref)).join('')}
      ${renderNavItem({ icon: 'plus', label: '管理成員', href: 'members.html' }, activeHref)}
    </div>

    ${sortedBottom.map((item) => renderNavItem(item, activeHref)).join('')}
  `;

  updateMembersGroupUI();
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
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
