// ============================================
// navbar.js — 頂部導覽列 + 漢堡按鈕（事件委派版）
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

  // 綁定一次即可（避免重複綁定）
  if (!window._navbarEventBound) {
    window._navbarEventBound = true;

    document.addEventListener('click', (e) => {
      // 1. 點擊漢堡按鈕 ➜ 切換側邊欄
      const hamburgerBtn = e.target.closest('#hamburger-btn');
      if (hamburgerBtn) {
        toggleSidebar();
        return;
      }

      // 2. 點擊背景遮罩 ➜ 關閉手機版側邊欄
      const backdrop = e.target.closest('.sidebar-backdrop');
      if (backdrop && backdrop.classList.contains('active')) {
        closeMobileSidebar();
      }
    });

    console.log('✅ navbar 事件已綁定');
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const isMobile = window.innerWidth < 640;

  if (isMobile) {
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
    localStorage.setItem(
      'sidebar-collapsed',
      sidebar.classList.contains('collapsed') ? 'true' : 'false'
    );
  }
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('active');
}
