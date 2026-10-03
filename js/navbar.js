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
      const btn = e.target.closest('#hamburger-btn');
      if (btn) {
        console.log('✅ 漢堡按鈕被點擊了');
        toggleSidebar();
      }
    });

    console.log('✅ navbar 事件已綁定');
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) {
    console.warn('❌ 找不到 .sidebar 元素');
    return;
  }

  const isMobile = window.innerWidth < 640;
  console.log('📱 切換模式：', isMobile ? '手機' : '桌面');

  if (isMobile) {
    sidebar.classList.toggle('mobile-open');
    console.log('📱 sidebar classList：', sidebar.className);

    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('active');
      });
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
