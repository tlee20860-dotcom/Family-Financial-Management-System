// ============================================
// settlements.js — 每月結算清單邏輯
// ============================================

import {
  listenMembers, listenFixedRepayments, addFixedRepayment, updateFixedRepayment, removeFixedRepayment,
  listenAllMemberExpenses, markMemberExpenseRepaid,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let members = [];
let fixedRepayments = [];
let memberExpenses = [];
let unsubFixed = null;
let unsubExpenses = null;

export function initSettlementsPage() {
  // 監聽成員（更新下拉選單）
  listenMembers((list) => {
    members = list;
    renderMemberOptions();
  });

  // 監聽 Modal 事件
  bindModalEvents();

  // 初次載入
  loadAll();

  // 年月切換時重新載入
  AppState.on('ym-change', () => {
    loadAll();
  });
}

function loadAll() {
  const { year, month } = AppState.getYearMonth();
  document.getElementById('settlement-month').textContent = `${year} 年 ${month} 月`;

  // 先清掉舊監聽
  if (unsubFixed) unsubFixed();
  if (unsubExpenses) unsubExpenses();

  // 監聽固定還款
  unsubFixed = listenFixedRepayments(year, month, (list) => {
    fixedRepayments = list;
    renderFixedTable();
  });

  // 監聽所有成員代墊支出
  unsubExpenses = listenAllMemberExpenses(year, month, (list) => {
    memberExpenses = list;
    renderExpenseTable();
  });
}

function renderMemberOptions() {
  const sel = document.getElementById('fixed-member');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— 請選擇 —</option>` +
    members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  if (current) sel.value = current;
}

function bindModalEvents() {
  const modal = document.getElementById('fixed-repayment-modal');
  const form = document.getElementById('fixed-repayment-form');
  const memberSel = document.getElementById('fixed-member');
  const nameInput = document.getElementById('fixed-name');
  const amountInput = document.getElementById('fixed-amount');

  document.getElementById('add-fixed-repayment-btn').addEventListener('click', () => {
    form.reset();
    modal.classList.add('active');
    setTimeout(() => memberSel.focus(), 50);
  });

  document.getElementById('fixed-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { year, month } = AppState.getYearMonth();
    await addFixedRepayment(year, month, {
      memberId: memberSel.value,
      name: nameInput.value.trim(),
      amount: Number(amountInput.value) || 0,
    });
    modal.classList.remove('active');
  });
}

/* ---------- 渲染固定還款表 ---------- */
function renderFixedTable() {
  const tbody = document.getElementById('fixed-repayment-tbody');
  if (!fixedRepayments.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">尚無固定還款項目</td></tr>`;
    updatePendingTotal();
    return;
  }

  tbody.innerHTML = fixedRepayments.map((r) => {
    const member = members.find((m) => m.id === r.memberId);
    const memberName = member ? member.name : '（未知）';
    const isRepaid = r.status === '已還款';

    return `
      <tr>
        <td>${escapeHtml(memberName)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td class="num">${formatHKD(r.amount)}</td>
        <td>${isRepaid
          ? '<span class="badge badge-success">已還款</span>'
          : '<span class="badge badge-pending">未還款</span>'}
        </td>
        <td>
          <input type="checkbox" ${isRepaid ? 'checked' : ''}
            data-action="toggle-fixed" data-id="${r.id}"
            style="width:auto; cursor:pointer;">
        </td>
        <td>
          <button class="btn btn-sm btn-danger" data-action="delete-fixed" data-id="${r.id}">刪除</button>
        </td>
      </tr>
    `;
  }).join('');

  refreshIcons();
  updatePendingTotal();
}

/* ---------- 渲染成員代墊支出表 ---------- */
function renderExpenseTable() {
  const tbody = document.getElementById('member-repayment-tbody');
  if (!memberExpenses.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">本月尚無成員代墊支出</td></tr>`;
    updatePendingTotal();
    return;
  }

  tbody.innerHTML = memberExpenses.map((e) => {
    const member = members.find((m) => m.id === e.memberId);
    const memberName = member ? member.name : '（未知）';
    const isRepaid = e.status === '已還款';

    // 保險連動的支出不允許手動勾選（由保險模組管理）
    const checkbox = e.isAutoLinked
      ? `<span class="text-muted" style="font-size:12px;">由保險管理</span>`
      : `<input type="checkbox" ${isRepaid ? 'checked' : ''}
          data-action="toggle-expense"
          data-member-id="${e.memberId}"
          data-expense-id="${e.id}"
          style="width:auto; cursor:pointer;">`;

    return `
      <tr>
        <td>${escapeHtml(memberName)}</td>
        <td>${escapeHtml(e.name)}</td>
        <td class="num">${formatHKD(e.amount)}</td>
        <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(e.date || '—')}</td>
        <td>${isRepaid
          ? '<span class="badge badge-success">已還款</span>'
          : '<span class="badge badge-pending">未還款</span>'}
        </td>
        <td>${checkbox}</td>
      </tr>
    `;
  }).join('');

  refreshIcons();
  updatePendingTotal();
}

/* ---------- 計算待還款總額 ---------- */
function updatePendingTotal() {
  const fixedPending = fixedRepayments
    .filter((r) => r.status !== '已還款')
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const expPending = memberExpenses
    .filter((e) => e.status !== '已還款' && !e.isAutoLinked)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const total = fixedPending + expPending;
  document.getElementById('settlement-pending-total').textContent = formatHKD(total);
}

/* ---------- 全域事件委派（勾選與刪除） ---------- */
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.action === 'toggle-fixed') {
    const { year, month } = AppState.getYearMonth();
    await updateFixedRepayment(year, month, el.dataset.id, {
      status: el.checked ? '已還款' : '未還款',
      repaidDate: el.checked ? new Date().toISOString().slice(0, 10) : '',
    });
  } else if (el.dataset.action === 'toggle-expense') {
    const { year, month } = AppState.getYearMonth();
    await markMemberExpenseRepaid(
      year, month, el.dataset.memberId, el.dataset.expenseId, el.checked
    );
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'delete-fixed') {
    if (confirm('確定要刪除此固定還款項目嗎？')) {
      const { year, month } = AppState.getYearMonth();
      await removeFixedRepayment(year, month, btn.dataset.id);
    }
  }
});

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
