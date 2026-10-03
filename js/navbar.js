// ============================================
// navbar.js — 頂部導覽列 + 漢堡按鈕（乾淨版）
// ============================================

export function renderNavbar(containerId = 'navbar-root', title = '') {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.classList.add('navbar');

  root.innerHTML = `
    <button class="hamburger" id="hamburger-btn" aria-label="切換選單">
      <i data-lucide="menu"></i>
    </button>
    <div class="navbar-title">${title}</div>
    <div class="navbar-user" id="navbar-user"></div>
  `;

  // 只綁定一次
  if (!window._navbarEventBound) {
    window._navbarEventBound = true;

    document.addEventListener('click', (e) => {
      // 1. 點擊漢堡按鈕 ➜ 切換側邊欄
      if (e.target.closest('#hamburger-btn')) {
        toggleSidebar();
        return;
      }

      // 2. 點擊背景遮罩 ➜ 關閉手機版側邊欄
      if (e.target.closest('.sidebar-backdrop')?.classList.contains('active')) {
        closeMobileSidebar();
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
