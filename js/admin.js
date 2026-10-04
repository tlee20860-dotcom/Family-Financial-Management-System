// ============================================
// admin.js — 平台管理邏輯
// ============================================

import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { logout } from './auth.js';
import { AppState } from './state.js';

export function initAdminPage() {
  if (!AppState.isSuperAdmin) {
    alert('您沒有權限存取此頁面');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('確定要登出嗎？')) logout();
  });

  const tbody = document.getElementById('family-tbody');
  const modal = document.getElementById('family-modal');
  const form = document.getElementById('family-form');

  document.getElementById('add-family-btn').addEventListener('click', () => {
    form.reset();
    modal.classList.add('active');
  });

  document.getElementById('family-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('family-uid').value.trim();
    const name = document.getElementById('family-name').value.trim();
    const email = document.getElementById('family-email').value.trim();

    if (!uid || !name) return;

    try {
      await api.adminAddFamily(uid, name, email);
      modal.classList.remove('active');
      await loadFamilies();
    } catch (err) {
      alert('新增失敗：' + err.message);
    }
  });

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const uid = btn.dataset.uid;

    if (btn.dataset.action === 'enter') {
      const family = familiesCache.find((f) => f.uid === uid);
      AppState.setFamily(uid, family ? family.name : '');
      window.location.href = 'index.html';
    } else if (btn.dataset.action === 'init') {
      if (!confirm('確定要為此家庭初始化預設資料嗎？（成員、類別、項目）')) return;
      try {
        const result = await api.adminInitFamily(uid);
        alert(result.skipped ? '此家庭已有資料，略過初始化' : '✅ 已初始化預設資料');
      } catch (err) {
        alert('初始化失敗：' + err.message);
      }
    } else if (btn.dataset.action === 'delete') {
      if (!confirm('確定要刪除此家庭嗎？（不會刪除 Firebase Auth 帳號）')) return;
      try {
        await api.adminRemoveFamily(uid);
        await loadFamilies();
      } catch (err) {
        alert('刪除失敗：' + err.message);
      }
    }
  });

  let familiesCache = [];

  async function loadFamilies() {
    try {
      const data = await api.adminListFamilies();
      familiesCache = data.families || [];
      render();
    } catch (err) {
      console.error('載入家庭失敗：', err);
      showError('無法載入家庭清單：' + err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state text-red">載入失敗：${err.message}</td></tr>`;
      }
    }
  }

  function render() {
    if (!familiesCache.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">尚無家庭，點擊「新增家庭」開始。</td></tr>`;
      return;
    }

    tbody.innerHTML = familiesCache.map((f) => `
      <tr>
        <td>${escapeHtml(f.name)}</td>
        <td class="mono" style="font-size:12px;">${escapeHtml(f.ownerEmail || '—')}</td>
        <td class="mono" style="font-size:11px; color:var(--text-muted);">${escapeHtml(f.uid)}</td>
        <td class="mono" style="font-size:11px; color:var(--text-muted);">${f.createdAt ? new Date(f.createdAt).toLocaleString('zh-HK') : '—'}</td>
        <td>
          <button class="btn btn-sm btn-primary" data-action="enter" data-uid="${f.uid}">進入</button>
          <button class="btn btn-sm btn-ghost" data-action="init" data-uid="${f.uid}">初始化</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-uid="${f.uid}">刪除</button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  function showError(msg) {
    const el = document.getElementById('admin-error');
    if (el) {
      el.textContent = '⚠ ' + msg;
      el.style.display = 'block';
    }
  }

  loadFamilies();
}
