// ============================================
// member-detail.js — 成員個人版面邏輯
// ============================================

import {
  getMembersOnce, listenExpenses, addExpense, updateExpense, removeExpense
} from './db.js';
import { currentYearMonth, formatHKD, todayISO, escapeHtml } from './utils.js';

let memberId = null;
let expenses = [];
let editingId = null;
let year = '';
let month = '';

export async function initMemberDetailPage(id) {
  memberId = id;

  const nameEl = document.getElementById('member-name');
  const idLabel = document.getElementById('member-id-label');
  idLabel.textContent = `ID：${memberId}`;

  // 讀取成員名稱
  try {
    const members = await getMembersOnce();
    const me = members.find((m) => m.id === memberId);
    if (me) {
      nameEl.textContent = me.name;
      document.title = `${me.name} | 家庭財務`;
    } else {
      nameEl.textContent = '（成員已不存在）';
    }
  } catch (e) {
    console.warn('讀取成員失敗', e);
    nameEl.textContent = '（無法讀取成員）';
  }

  // 支出監聽
  const ym = currentYearMonth();
  year = ym.year;
  month = ym.month;
  document.getElementById('expense-month-label').textContent = `${year} 年 ${month} 月`;

  listenExpenses(year, month, memberId, (list) => {
    expenses = list;
    renderExpenses();
  });

  // Modal 相關
  const modal = document.getElementById('expense-modal');
  const modalTitle = document.getElementById('expense-modal-title');
  const form = document.getElementById('expense-form');
  const nameInput = document.getElementById('expense-name-input');
  const amountInput = document.getElementById('expense-amount-input');
  const statusSelect = document.getElementById('expense-status-input');
  const dateInput = document.getElementById('expense-date-input');

  document.getElementById('add-expense-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增支出';
    form.reset();
    dateInput.value = todayISO();
    statusSelect.value = '未處理';
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  document.getElementById('expense-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: nameInput.value.trim(),
      amount: Number(amountInput.value) || 0,
      status: statusSelect.value,
      date: dateInput.value || '',
    };
    if (!payload.name) return;

    if (editingId) {
      await updateExpense(year, month, memberId, editingId, payload);
    } else {
      await addExpense(year, month, memberId, payload);
    }
    modal.classList.remove('active');
  });

  // 表格事件委派
  document.getElementById('expense-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const exp = expenses.find((x) => x.id === id);
    if (!exp) return;

    if (action === 'edit') {
      editingId = id;
      modalTitle.textContent = '編輯支出';
      nameInput.value = exp.name;
      amountInput.value = exp.amount;
      statusSelect.value = exp.status || '未處理';
      dateInput.value = exp.date || '';
      modal.classList.add('active');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除「${exp.name}」嗎？`)) {
        await removeExpense(year, month, memberId, id);
      }
    }
  });

  function renderExpenses() {
    const tbody = document.getElementById('expense-tbody');
    const total = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    document.getElementById('expense-total').textContent = formatHKD(total);

    if (!expenses.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">尚無支出紀錄</td></tr>`;
      return;
    }

    tbody.innerHTML = expenses.map((x) => {
      const statusBadge = x.status === '已處理'
        ? '<span class="badge badge-success">已處理</span>'
        : '<span class="badge badge-pending">未處理</span>';

      const actionCell = x.isAutoLinked
        ? `<span class="text-muted" style="font-size:12px;">由保險模組管理</span>`
        : `<button class="btn btn-sm btn-ghost" data-action="edit" data-id="${x.id}">編輯</button>
           <button class="btn btn-sm btn-danger" data-action="delete" data-id="${x.id}">刪除</button>`;

      const autoBadge = x.isAutoLinked
        ? '<span class="badge badge-info" style="margin-left:6px;">保險連動</span>'
        : '';

      return `
        <tr>
          <td>${escapeHtml(x.name)}${autoBadge}</td>
          <td class="num">${formatHKD(x.amount)}</td>
          <td>${statusBadge}</td>
          <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(x.date || '—')}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
