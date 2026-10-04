// ============================================
// navbar.js — 頂部導覽列 + 漢堡按鈕 + 年/月選擇器
// ============================================

import { AppState } from './state.js';

export function renderNavbar(containerId = 'navbar-root', title = '') {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.classList.add('navbar');

  const { year, month } = AppState.getYearMonth();
  const isSuper = AppState.isSuperAdmin;

  const currentYear = Number(year);
  const yearOptions = [];
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    yearOptions.push(`<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y} 年</option>`);
  }

  const monthOptions = [`<option value="all" ${month === 'all' ? 'selected' : ''}>全年</option>`];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    monthOptions.push(`<option value="${mm}" ${mm === month ? 'selected' : ''}>${m} 月</option>`);
  }

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
    <div class="navbar-ym">
      <select class="select" id="ym-year" style="width:auto; padding:6px 10px; font-size:13px;">
        ${yearOptions.join('')}
      </select>
      <select class="select" id="ym-month" style="width:auto; padding:6px 10px; font-size:13px;">
        ${monthOptions.join('')}
      </select>
    </div>
    ${adminBtn}
    <div class="navbar-user" id="navbar-user"></div>
  `;

  if (!window._navbarEventBound) {
    window._navbarEventBound = true;

    document.addEventListener('click', (e) => {
      if (e.target.closest('#hamburger-btn')) {
        toggleSidebar();
        return;
      }
      const backdrop = e.target.closest('.sidebar-backdrop');
      if (backdrop && backdrop.classList.contains('active')) {
        closeMobileSidebar();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'ym-year' || e.target.id === 'ym-month') {
        const y = document.getElementById('ym-year').value;
        const m = document.getElementById('ym-month').value;
        AppState.setYearMonth(y, m);
      }
    });

    AppState.on('user-change', (user) => {
      const userBox = document.getElementById('navbar-user');
      if (userBox && user) {
        const name = user.email ? user.email.replace('@familyfin.local', '') : '';
        const familyName = AppState.getFamilyName();
        const familyTag = familyName ? ` · ${familyName}` : '';
        userBox.innerHTML = `
          <span class="mono" style="font-size:12px; color:var(--text-muted); margin-right:10px;">
            👤 ${name}${familyTag}
          </span>
        `;
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
