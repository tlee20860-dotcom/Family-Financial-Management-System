// ============================================
// admin.js — 平台管理邏輯
// ============================================

import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { logout } from './auth.js';
import { AppState } from './state.js';
import { createInputForm } from './input-form.js';
import { showToast } from './toast.js';

export function initAdminPage() {
  if (!AppState.isSuperAdmin) {
    alert('您沒有權限存取此頁面');
    window.location.href = 'index.html';
    return;
  }

  let familiesCache = [];
  let inputForm = null;

  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('確定要登出嗎？')) logout();
  });

  const tbody = document.getElementById('family-tbody');

  // 🆕 v99：摺疊輸入表單（新增家庭）
  inputForm = createInputForm({
    containerId: 'family-input-root',
    storageKey: 'family-input-open',
    title: '新增家庭',
    icon: 'plus-circle',
    fields: [
      { type: 'text', id: 'inp-family-uid', label: 'Firebase UID', required: true, placeholder: '在 Firebase Auth 建立後複製 UID', maxlength: 60, hint: '請先在 Firebase 控制台建立家庭帳號，再將 UID 貼上。' },
      { type: 'text', id: 'inp-family-name', label: '家庭名稱', required: true, placeholder: '例如：陳家', maxlength: 30 },
      { type: 'text', id: 'inp-family-email', label: '擁有者 Email（可選）', placeholder: '例如：chen@familyfin.local', maxlength: 60 },
    ],
    submitText: '新增家庭',
    onSubmit: async (data) => {
      const uid = (data['inp-family-uid'] || '').trim();
      const name = (data['inp-family-name'] || '').trim();
      const email = (data['inp-family-email'] || '').trim();
      if (!uid || !name) return;

      await api.adminAddFamily(uid, name, email);
      showToast(`✅ 已新增家庭「${name}」`, 'success');
      inputForm.reset();
      inputForm.close();
      await loadFamilies();
    },
  });

  /* ============================================
     表格事件（進入 / 初始化 / 刪除）
     ============================================ */

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const uid = btn.dataset.uid;

    if (btn.dataset.action === 'enter') {
      const family = familiesCache.find((f) => f.uid === uid);
      AppState.setFamily(uid, family ? family.name : '');
      window.location.href = 'index.html';
    } else if (btn.dataset.action === 'init') {
      if (!confirm('確定要為此家庭初始化預設資料嗎？（成員、類別、項目、支付方式）')) return;
      try {
        const result = await api.adminInitFamily(uid);
        showToast(result.skipped ? '此家庭已有資料，略過初始化' : '✅ 已初始化預設資料', result.skipped ? 'warning' : 'success');
      } catch (err) {
        showToast('初始化失敗：' + err.message, 'error');
      }
    } else if (btn.dataset.action === 'delete') {
      if (!confirm('確定要刪除此家庭嗎？（不會刪除 Firebase Auth 帳號）')) return;
      try {
        await api.adminRemoveFamily(uid);
        await loadFamilies();
        showToast('✅ 已刪除家庭', 'success');
      } catch (err) {
        showToast('刪除失敗：' + err.message, 'error');
      }
    }
  });

  /* ============================================
     載入家庭清單
     ============================================ */

  async function loadFamilies() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">載入中…</td></tr>`;

    try {
      const data = await api.adminListFamilies();
      familiesCache = data.families || [];
      render();
    } catch (err) {
      console.error('載入家庭失敗：', err);
      showError('無法載入家庭清單：' + err.message);
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state text-red">載入失敗：${err.message}</td></tr>`;
    }
  }

  function render() {
    if (!tbody) return;
    if (!familiesCache.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">尚無家庭，點擊上方「新增家庭」開始。</td></tr>`;
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
