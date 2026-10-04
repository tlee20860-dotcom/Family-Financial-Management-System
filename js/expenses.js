// ============================================
// fixed-expenses.js — 家庭固定支出（按月獨立 + 自動帶入上月）
// ============================================

import {
  listenFixedExpensesV2, addFixedExpenseV2, updateFixedExpenseV2, removeFixedExpenseV2,
  copyFixedExpensesFromPrevMonth,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let list = [];
let editingId = null;
let unsubscribe = null;
let lastLoadedYM = '';

export function initFixedExpensesPage() {
  const tbody = document.getElementById('fixed-tbody');
  const modal = document.getElementById('fixed-modal');
  const modalTitle = document.getElementById('fixed-modal-title');
  const form = document.getElementById('fixed-form');

  const nameInput = document.getElementById('fixed-name');
  const amountInput = document.getElementById('fixed-amount');
  const cycleSelect = document.getElementById('fixed-cycle');
  const noteInput = document.getElementById('fixed-note');

  const loadAll = async () => {
    const { year, month } = AppState.getYearMonth();
    document.getElementById('fixed-month').textContent = `${year} 年 ${month} 月`;

    // 避免重複載入同一月份
    const ymKey = `${year}-${month}`;
    if (lastLoadedYM === ymKey) return;
    lastLoadedYM = ymKey;

    // 若本月沒有資料，嘗試從上月複製
    try {
      const copied = await copyFixedExpensesFromPrevMonth(year, month);
      if (copied > 0) {
        console.log(`✅ 已從上個月帶入 ${copied} 筆固定支出`);
      }
    } catch (err) {
      console.warn('從上月複製失敗：', err);
    }

    if (unsubscribe) unsubscribe();
    unsubscribe = listenFixedExpensesV2(year, month, (l) => {
      list = l;
      render();
    });
  };

  loadAll();
  AppState.on('ym-change', () => {
    lastLoadedYM = ''; // 重置，讓新月份可以重新載入
    loadAll();
  });

  // 新增
  document.getElementById('add-fixed-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增固定支出';
    form.reset();
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
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
      note: noteInput.value.trim(),
    };
    if (!payload.name) return;

    if (editingId) {
      await updateFixedExpenseV2(year, month, editingId, payload);
    } else {
      await addFixedExpenseV2(year, month, payload);
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
      noteInput.value = x.note || '';
      modal.classList.add('active');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除「${x.name}」嗎？（僅刪除本月）`)) {
        const { year, month } = AppState.getYearMonth();
        await removeFixedExpenseV2(year, month, id);
      }
    }
  });

  // 勾選已付款 / 本月不適用
  tbody.addEventListener('change', async (e) => {
    const el = e.target;
    const { year, month } = AppState.getYearMonth();
    const id = el.dataset.id;
    if (!id) return;

    if (el.dataset.action === 'toggle-paid') {
      await updateFixedExpenseV2(year, month, id, {
        status: el.checked ? '已付款' : '未付款',
        paidDate: el.checked ? new Date().toISOString().slice(0, 10) : '',
      });
    } else if (el.dataset.action === 'toggle-skip') {
      await updateFixedExpenseV2(year, month, id, {
        isSkipped: el.checked,
      });
    }
  });

  function render() {
    // 計算本月總額（排除不適用）
    const activeList = list.filter((x) => !x.isSkipped);
    const total = activeList.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pending = activeList.filter((x) => x.status !== '已付款').length;

    document.getElementById('fixed-total').textContent = formatHKD(total);
    document.getElementById('fixed-pending-count').textContent = `${pending} 筆`;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">本月尚無固定支出，請點擊「新增固定支出」。</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((x) => {
      const isPaid = x.status === '已付款';
      const isSkipped = !!x.isSkipped;
      const rowStyle = isSkipped ? 'opacity:0.4; text-decoration:line-through;' : '';
      const statusBadge = isSkipped
        ? '<span class="badge badge-info">本月不適用</span>'
        : (isPaid
          ? '<span class="badge badge-success">已付款</span>'
          : '<span class="badge badge-pending">未付款</span>');

      return `
        <tr style="${rowStyle}">
          <td>${escapeHtml(x.name)}${x.note ? `<div class="glass-card-hint" style="margin-top:4px;">${escapeHtml(x.note)}</div>` : ''}</td>
          <td class="num">${formatHKD(x.amount)}</td>
          <td>${escapeHtml(x.cycle || '每月')}</td>
          <td>${statusBadge}</td>
          <td>
            <input type="checkbox" ${isPaid ? 'checked' : ''} ${isSkipped ? 'disabled' : ''}
              data-action="toggle-paid" data-id="${x.id}"
              style="width:auto; cursor:pointer;">
          </td>
          <td>
            <input type="checkbox" ${isSkipped ? 'checked' : ''}
              data-action="toggle-skip" data-id="${x.id}"
              title="勾選後，本月不計入總支出"
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
