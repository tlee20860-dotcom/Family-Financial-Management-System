// ============================================
// members.js — 成員管理頁邏輯（含自訂排序）
// ============================================

import {
  listenMembers, addMember, updateMember, removeMember, updateMemberOrders,
} from './db.js';
import { escapeHtml, sortMembers } from './utils.js';

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
    currentMembers = sortMembers(members);
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
      // 新成員的 order = 目前最大 order + 1
      const maxOrder = currentMembers.reduce(
        (max, m) => Math.max(max, m.order != null ? m.order : -1), -1
      );
      // 建立新成員時直接設定 order，確保排序穩定
      await addMember({ name, role, order: maxOrder + 1 });
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
      alert('調整順序失敗，請稍後再試。');
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
