// ============================================
// members.js — 成員管理頁邏輯
// ============================================

import {
  listenMembers, addMember, updateMember, updateMemberOrders,
  deleteMemberAndData,
} from './db.js';
import { escapeHtml, sortMembers } from './utils.js';
import { createInputForm } from './input-form.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

const ROLE_LABEL = {
  husband: '老公 / 丈夫',
  wife: '老婆 / 妻子',
  child: '子女',
  other: '其他',
};

const ROLE_OPTIONS = [
  { value: 'husband', label: '老公 / 丈夫' },
  { value: 'wife', label: '老婆 / 妻子' },
  { value: 'child', label: '子女' },
  { value: 'other', label: '其他' },
];

let currentMembers = [];
let editingId = null;
let inputForm = null;

export function initMembersPage() {
  const grid = document.getElementById('members-grid');
  const modal = document.getElementById('member-modal');
  const modalTitle = document.getElementById('member-modal-title');
  const form = document.getElementById('member-form');
  const nameInput = document.getElementById('member-name-input');
  const roleSelect = document.getElementById('member-role-input');

  // 🆕 v99：摺疊輸入表單（新增用）
  inputForm = createInputForm({
    containerId: 'member-input-root',
    storageKey: 'member-input-open',
    title: '新增成員',
    icon: 'plus-circle',
    fields: [
      { type: 'text', id: 'inp-member-name', label: '名稱', required: true, placeholder: '例如：老公、梓舜', maxlength: 20 },
      { type: 'select', id: 'inp-member-role', label: '角色', options: ROLE_OPTIONS, includeEmpty: false },
    ],
    submitText: '新增成員',
    onSubmit: async (data) => {
      const name = (data['inp-member-name'] || '').trim();
      const role = data['inp-member-role'];
      if (!name) return;

      const maxOrder = currentMembers.reduce(
        (max, m) => Math.max(max, m.order != null ? m.order : -1), -1
      );
      await addMember({ name, role, order: maxOrder + 1 });
      showToast(`✅ 已新增成員「${name}」`, 'success');
      inputForm.reset();
      inputForm.close();
    },
  });

  listenMembers((members) => {
    currentMembers = sortMembers(members);
    renderGrid();
  });

  /* ============================================
     編輯 Modal（保留）
     ============================================ */

  document.getElementById('member-cancel-btn').addEventListener('click', () => closeModal('member-modal'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const role = roleSelect.value;
    if (!name) return;

    if (editingId) {
      await updateMember(editingId, { name, role });
      showToast('✅ 已更新成員', 'success');
    }
    closeModal('member-modal');
  });

  /* ============================================
     卡片事件（編輯 / 刪除 / 上移 / 下移）
     ============================================ */

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const member = currentMembers.find((m) => m.id === id);
    if (!member) return;

    if (action === 'edit') {
      editingId = id;
      modalTitle.textContent = '編輯成員';
      nameInput.value = member.name;
      roleSelect.value = member.role || 'other';
      openModal('member-modal');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`⚠️ 確定要刪除成員「${member.name}」嗎？\n\n這將會一併刪除該成員在所有月份的所有支出紀錄（含保險平攤），此操作無法復原。`)) {
        try {
          await deleteMemberAndData(id);
          showToast('✅ 成員與相關紀錄已徹底刪除', 'success');
        } catch (err) {
          showToast('刪除失敗：' + err.message, 'error');
        }
      }
    } else if (action === 'move-up') {
      await moveMember(id, 'up');
    } else if (action === 'move-down') {
      await moveMember(id, 'down');
    }
  });

  async function moveMember(memberId, direction) {
    const sorted = [...currentMembers];
    const idx = sorted.findIndex((m) => m.id === memberId);
    if (idx < 0) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sorted.length) return;

    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];

    const orderMap = {};
    sorted.forEach((m, i) => { orderMap[m.id] = i; });

    try {
      await updateMemberOrders(orderMap);
    } catch (err) {
      console.error('更新成員順序失敗：', err);
      showToast('調整順序失敗，請稍後再試。', 'error');
    }
  }

  function renderGrid() {
    if (!currentMembers.length) {
      grid.innerHTML = `
        <div class="glass-card" style="grid-column:1/-1;">
          <div class="empty-state">尚無成員，點擊上方「新增成員」開始。</div>
        </div>`;
      return;
    }

    grid.innerHTML = currentMembers.map((m, i) => {
      const isFirst = i === 0;
      const isLast = i === currentMembers.length - 1;

      return `
        <div class="glass-card" style="position:relative;">
          <div style="position:absolute; top:10px; right:10px; display:flex; flex-direction:column; gap:4px;">
            <button class="btn btn-sm btn-ghost" data-action="move-up" data-id="${m.id}"
              ${isFirst ? 'disabled' : ''} title="上移"
              style="padding:2px 6px; line-height:1;">
              <i data-lucide="chevron-up" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn btn-sm btn-ghost" data-action="move-down" data-id="${m.id}"
              ${isLast ? 'disabled' : ''} title="下移"
              style="padding:2px 6px; line-height:1;">
              <i data-lucide="chevron-down" style="width:14px;height:14px;"></i>
            </button>
          </div>

          <div class="glass-card-title">${ROLE_LABEL[m.role] || '成員'}</div>
          <div class="glass-card-value">${escapeHtml(m.name)}</div>
          <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
            <a class="btn btn-sm" href="member-detail.html?id=${m.id}">進入版面</a>
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${m.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${m.id}">刪除</button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
