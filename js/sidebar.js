// ============================================
// sidebar.js — 左側可摺疊導覽選單
// ============================================

const NAV_ITEMS = [
  { icon: 'home', label: '總覽儀表板', href: 'index.html' },

  { type: 'group', label: '成員版面', children: [
    { icon: 'user', label: '老公',    href: 'member-detail.html?id=mem_husband' },
    { icon: 'user', label: '老婆',    href: 'member-detail.html?id=mem_wife' },
    { icon: 'user', label: '梓舜',    href: 'member-detail.html?id=mem_son' },
    { icon: 'user', label: '梓言',    href: 'member-detail.html?id=mem_daughter' },
    { icon: 'plus', label: '管理成員', href: 'members.html' },
  ]},

  { icon: 'shield',     label: '保險付款',   href: 'insurance.html' },
  { icon: 'receipt',    label: '每月總開銷', href: 'expenses.html' },
  { icon: 'line-chart', label: '基金投資',   href: 'portfolio.html' },
  { icon: 'settings',   label: '系統設定',   href: 'settings.html' },
];

export function renderSidebar(containerId = 'sidebar-root', activeHref = '') {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.classList.add('sidebar');

  root.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">◈ FAMILY.FIN</div>
    </div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(item => renderNavItem(item, activeHref)).join('')}
    </nav>
  `;

  // 桌面：讀取上次摺疊狀態
  const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (collapsed && window.innerWidth >= 640) root.classList.add('collapsed');
}

function renderNavItem(item, activeHref) {
  if (item.type === 'group') {
    return `
      <div class="nav-group-title">${item.label}</div>
      <div class="nav-sub">
        ${item.children.map(c => renderNavItem(c, activeHref)).join('')}
      </div>
    `;
  }
  const isActive = item.href === activeHref ? 'active' : '';
  return `
    <a class="nav-item ${isActive}" href="${item.href}">
      <i data-lucide="${item.icon}" class="nav-icon"></i>
      <span class="nav-label">${item.label}</span>
    </a>
  `;
}
