// ============================================
// fixed-expenses.js — 家庭固定支出邏輯
// ============================================

import {
  listenFixedExpenses, addFixedExpense, updateFixedExpense, removeFixedExpense,
  generateFixedExpensesFromTemplates,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let list = [];
let editingId = null;
let unsubscribe = null;

export function initFixedExpensesPage() {
  const tbody = document.getElementById('fixed-tbody');
  const modal = document.getElementById('fixed-modal');
  const modalTitle = document.getElementById('fixed-modal-title');
  const form = document.getElementById('fixed-form');

  const nameInput = document.getElementById('fixed-name');
  const amountInput = document.getElementById('fixed-amount');
  const cycleSelect = document.getElementById('fixed-cycle');
  const dueInput = document.getElementById('fixed-due');
  const noteInput = document.getElementById('fixed-note');

  const loadAll = () => {
    const { year, month } = AppState.getYearMonth();
    document.getElementById('fixed-month').textContent = `${year} 年 ${month} 月`;

    if (unsubscribe) unsubscribe();
    unsubscribe = listenFixedExpenses(year, month, (l) => {
      list = l;
      render();
    });
  };

  loadAll();
  AppState.on('ym-change', loadAll);

  // 新增
  document.getElementById('add-fixed-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增固定支出';
    form.reset();
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  // 從模板生成
  document.getElementById('generate-btn').addEventListener('click', async () => {
    const { year, month } = AppState.getYearMonth();
    if (!confirm('確定要從固定支出模板生成本月的項目嗎？\n（已存在的同名項目不會重複新增）')) return;
    try {
      const added = await generateFixedExpensesFromTemplates(year, month);
      alert(added > 0 ? `✅ 已生成 ${added} 筆固定支出` : 'ℹ️ 本月已無需新增的項目');
    } catch (err) {
      alert('生成失敗：' + err.message);
    }
  });

  document.getElementById('fixed-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { year, month } = AppState.getYearMonth();

    const payload = {
      name: nameInput.value.trim(),
      amount: Number(amountInput.value) || 0,
      cycle: cycleSelect.value,
      dueDate: dueInput.value.trim(),
      note: noteInput.value.trim(),
    };
    if (!payload.name) return;

    if (editingId) {
      await updateFixedExpense(year, month, editingId, payload);
    } else {
      await addFixedExpense(year, month, payload);
    }
    modal.classList.remove('active');
  });

  // 表格事件委派
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const x = list.find((i) => i.id === id);
    if (!x) return;

    if (action === 'edit') {
      editingId = id;
      modalTitle.textContent = '編輯固定支出';
      nameInput.value = x.name || '';
      amountInput.value = x.amount || '';
      cycleSelect.value = x.cycle || '每月';
      dueInput.value = x.dueDate || '';
      noteInput.value = x.note || '';
      modal.classList.add('active');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除「${x.name}」嗎？`)) {
        const { year, month } = AppState.getYearMonth();
        await removeFixedExpense(year, month, id);
      }
    }
  });

  // 勾選已付款
  tbody.addEventListener('change', async (e) => {
    const checkbox = e.target;
    if (checkbox.dataset.action !== 'toggle-paid') return;

    const { year, month } = AppState.getYearMonth();
    const id = checkbox.dataset.id;
    const isPaid = checkbox.checked;

    await updateFixedExpense(year, month, id, {
      status: isPaid ? '已付款' : '未付款',
      paidDate: isPaid ? new Date().toISOString().slice(0, 10) : '',
    });
  });

  function render() {
    const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pending = list.filter((x) => x.status !== '已付款').length;

    document.getElementById('fixed-total').textContent = formatHKD(total);
    document.getElementById('fixed-pending-count').textContent = `${pending} 筆`;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">本月尚無固定支出，請點擊「新增」或「從模板生成」。</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((x) => {
      const isPaid = x.status === '已付款';
      return `
        <tr>
          <td>${escapeHtml(x.name)}${x.note ? `<div class="glass-card-hint" style="margin-top:4px;">${escapeHtml(x.note)}</div>` : ''}</td>
          <td class="num">${formatHKD(x.amount)}</td>
          <td>${escapeHtml(x.cycle || '每月')}</td>
          <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(x.dueDate || '—')}</td>
          <td>${isPaid
            ? '<span class="badge badge-success">已付款</span>'
            : '<span class="badge badge-pending">未付款</span>'}
          </td>
          <td>
            <input type="checkbox" ${isPaid ? 'checked' : ''}
              data-action="toggle-paid" data-id="${x.id}"
              style="width:auto; cursor:pointer;">
          </td>
          <td>
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${x.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${x.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
