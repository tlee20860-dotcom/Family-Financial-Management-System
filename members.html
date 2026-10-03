// ============================================
// members.js — 成員管理頁邏輯
// ============================================

import { listenMembers, addMember, updateMember, removeMember } from './db.js';
import { escapeHtml } from './utils.js';

const ROLE_LABEL = {
  husband: '老公 / 丈夫',
  wife: '老婆 / 妻子',
  child: '子女',
  other: '其他',
};

let currentMembers = [];
let editingId = null;

export function initMembersPage() {
  const grid = document.getElementById('members-grid');
  const modal = document.getElementById('member-modal');
  const modalTitle = document.getElementById('member-modal-title');
  const form = document.getElementById('member-form');
  const nameInput = document.getElementById('member-name-input');
  const roleSelect = document.getElementById('member-role-input');

  listenMembers((members) => {
    currentMembers = members;
    renderGrid();
  });

  document.getElementById('add-member-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增成員';
    form.reset();
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  document.getElementById('member-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const role = roleSelect.value;
    if (!name) return;

    if (editingId) {
      await updateMember(editingId, { name, role });
    } else {
      await addMember({ name, role });
    }
    modal.classList.remove('active');
  });

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
      modal.classList.add('active');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除成員「${member.name}」嗎？\n（該成員的支出紀錄不會被刪除）`)) {
        await removeMember(id);
      }
    }
  });

  function renderGrid() {
    if (!currentMembers.length) {
      grid.innerHTML = `
        <div class="glass-card" style="grid-column:1/-1;">
          <div class="empty-state">尚無成員，點擊上方「新增成員」開始。</div>
        </div>`;
      return;
    }

    grid.innerHTML = currentMembers.map((m) => `
      <div class="glass-card">
        <div class="glass-card-title">${ROLE_LABEL[m.role] || '成員'}</div>
        <div class="glass-card-value">${escapeHtml(m.name)}</div>
        <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-sm" href="member-detail.html?id=${m.id}">進入版面</a>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${m.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${m.id}">刪除</button>
        </div>
      </div>
    `).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
