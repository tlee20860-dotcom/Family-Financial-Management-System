// ============================================
// navbar.js — 頂部導覽列 + 漢堡按鈕
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

  const btn = document.getElementById('hamburger-btn');
  if (btn) btn.addEventListener('click', toggleSidebar);
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
