// ============================================
// navbar.js — 頂部導覽列（移除年月選擇器）
// ============================================

import { AppState } from './state.js';

export function renderNavbar(containerId = 'navbar-root', title = '') {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.classList.add('navbar');
  const isSuper = AppState.isSuperAdmin;

  const adminBtn = isSuper
    ? `<a href="admin.html" class="btn btn-sm btn-ghost" title="平台管理" style="padding:6px 10px;">
         <i data-lucide="settings" style="width:16px;height:16px;"></i>
       </a>`
    : '';

  root.innerHTML = `
    <button class="hamburger" id="hamburger-btn" aria-label="切換選單">
      <i data-lucide="menu"></i>
    </button>
    <div class="navbar-title">${title}</div>
    ${adminBtn}
    <div class="navbar-user" id="navbar-user"></div>
  `;

  if (!window._navbarEventBound) {
    window._navbarEventBound = true;
    document.addEventListener('click', (e) => {
      if (e.target.closest('#hamburger-btn')) { toggleSidebar(); return; }
      const backdrop = e.target.closest('.sidebar-backdrop');
      if (backdrop && backdrop.classList.contains('active')) closeMobileSidebar();
    });

    AppState.on('user-change', (user) => {
      const userBox = document.getElementById('navbar-user');
      if (userBox && user) {
        const name = user.email ? user.email.replace('@familyfin.local', '') : '';
        const familyName = AppState.getFamilyName();
        const familyTag = familyName ? ` · ${familyName}` : '';
        userBox.innerHTML = `<span class="mono" style="font-size:12px; color:var(--text-muted); margin-right:10px;">👤 ${name}${familyTag}</span>`;
      }
    });
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (window.innerWidth < 640) {
    sidebar.classList.toggle('mobile-open');
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
  }
}

function closeMobileSidebar() {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.querySelector('.sidebar-backdrop')?.classList.remove('active');
}
