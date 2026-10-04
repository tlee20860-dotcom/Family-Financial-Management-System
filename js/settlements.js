// ============================================
// settlements.js — 每月結算清單（全年 / 單月）
// ============================================

import {
  listenMembers, listenFixedRepayments, addFixedRepayment, updateFixedRepayment, removeFixedRepayment,
  listenAllMemberExpenses, markMemberExpenseRepaid, updateExpense,
  getFixedRepaymentsOnce, getAllMemberExpensesOnce,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let members = [];
let fixedRepayments = [];
let memberExpenses = [];
let unsubFixed = null;
let unsubExpenses = null;

export function initSettlementsPage() {
  listenMembers((list) => {
    members = list;
    renderMemberOptions();
  });

  // 初始化年份 / 月份下拉
  const yearSel = document.getElementById('fixed-repayment-year');
  const monthSel = document.getElementById('fixed-repayment-month');
  const now = new Date();
  const currentYear = now.getFullYear();
  let yearOpts = '';
  for (let y = currentYear - 5; y <= currentYear + 5; y++) yearOpts += `<option value="${y}">${y} 年</option>`;
  yearSel.innerHTML = yearOpts;
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;

  bindModalEvents();
  bindEditModalEvents();

  loadAll();
  AppState.on('ym-change', () => loadAll());
}

function loadAll() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';

  document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
  document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';
  document.getElementById('settlement-month').textContent = isAnnual
    ? `${year} 年 全年總覽`
    : `${year} 年 ${month} 月`;

  if (isAnnual) {
    if (unsubFixed) { unsubFixed(); unsubFixed = null; }
    if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
    loadAnnual(year);
  } else {
    if (unsubFixed) unsubFixed();
    if (unsubExpenses) unsubExpenses();

    unsubFixed = listenFixedRepayments(year, month, (list) => {
      fixedRepayments = list;
      renderFixedTable();
    });

    unsubExpenses = listenAllMemberExpenses(year, month, (list) => {
      memberExpenses = list;
      renderExpenseTable();
    });
  }
}

async function loadAnnual(year) {
  try {
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      promises.push(Promise.all([
        getFixedRepaymentsOnce(year, mm),
        getAllMemberExpensesOnce(year, mm),
      ]));
    }
    const results = await Promise.all(promises);

    let totalAll = 0;
    const container = document.getElementById('annual-monthly-cards');

    const cards = results.map(([fixedList, expList], i) => {
      const monthNum = i + 1;
      let monthTotal = 0;

      // 未還款加總
      const fixedPending = fixedList.filter((r) => r.status !== '已還款');
      const expPending = expList.filter((e) => e.status !== '已還款' && !e.isAutoLinked);
      fixedPending.forEach((r) => monthTotal += Number(r.amount) || 0);
      expPending.forEach((e) => monthTotal += Number(e.amount) || 0);
      totalAll += monthTotal;

      const fixedRows = fixedList.length
        ? fixedList.map((r) => {
          const member = members.find((m) => m.id === r.memberId);
          const name = member ? member.name : '（未知）';
          const isPaid = r.status === '已還款';
          return `
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0;">
              <span>${escapeHtml(name)} - ${escapeHtml(r.name)}</span>
              <span style="display:flex; gap:8px; align-items:center;">
                <span class="mono">${formatHKD(r.amount)}</span>
                ${isPaid ? '<span class="badge badge-success">已還款</span>' : '<span class="badge badge-pending">未還款</span>'}
              </span>
            </div>
          `;
        }).join('')
        : '<div style="font-size:11px; color:var(--text-muted);">無固定還款項目</div>';

      const expRows = expList.filter((e) => !e.isAutoLinked).length
        ? expList.filter((e) => !e.isAutoLinked).map((e) => {
          const member = members.find((m) => m.id === e.memberId);
          const name = member ? member.name : '（未知）';
          const isPaid = e.status === '已還款';
          return `
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0;">
              <span>${escapeHtml(name)} - ${escapeHtml(e.name)}</span>
              <span style="display:flex; gap:8px; align-items:center;">
                <span class="mono">${formatHKD(e.amount)}</span>
                ${isPaid ? '<span class="badge badge-success">已還款</span>' : '<span class="badge badge-pending">未還款</span>'}
              </span>
            </div>
          `;
        }).join('')
        : '<div style="font-size:11px; color:var(--text-muted);">無成員代墊支出</div>';

      return `
        <div class="glass-card" style="margin-bottom:10px; padding:14px;">
          <div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;">
            <div style="font-weight:700; font-size:15px; color:var(--neon-cyan);">${monthNum} 月</div>
            <div class="mono text-magenta" style="font-weight:700;">${formatHKD(monthTotal)}</div>
          </div>
          <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">固定還款</div>
            ${fixedRows}
            <div style="font-size:12px; color:var(--text-muted); margin:10px 0 6px;">成員代墊</div>
            ${expRows}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('settlement-pending-total').textContent = formatHKD(totalAll);
    container.innerHTML = cards;

    container.querySelectorAll('.month-toggle').forEach((el) => {
      el.addEventListener('click', () => {
        const d = el.nextElementSibling;
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
      });
    });

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('全年結算清單載入失敗：', err);
  }
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
  const yearSel = document.getElementById('fixed-repayment-year');
  const monthSel = document.getElementById('fixed-repayment-month');

  document.getElementById('add-fixed-repayment-btn').addEventListener('click', () => {
    form.reset();
    const { year, month } = AppState.getYearMonth();
    yearSel.value = year;
    monthSel.value = month === 'all'
      ? String(new Date().getMonth() + 1).padStart(2, '0')
      : month;
    modal.classList.add('active');
    setTimeout(() => memberSel.focus(), 50);
  });

  document.getElementById('fixed-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetYear = yearSel.value;
    const targetMonth = monthSel.value;
    await addFixedRepayment(targetYear, targetMonth, {
      memberId: memberSel.value,
      name: nameInput.value.trim(),
      amount: Number(amountInput.value) || 0,
    });
    modal.classList.remove('active');
    showToast(`✅ 已錄入 ${targetYear} 年 ${targetMonth} 月`);
  });
}

function bindEditModalEvents() {
  const modal = document.getElementById('edit-expense-modal');
  const form = document.getElementById('edit-expense-form');
  const memberIdInput = document.getElementById('edit-member-id');
  const expIdInput = document.getElementById('edit-expense-id');
  const yearInput = document.getElementById('edit-expense-year');
  const monthInput = document.getElementById('edit-expense-month');
  const nameInput = document.getElementById('edit-expense-name');
  const amountInput = document.getElementById('edit-expense-amount');
  const dateInput = document.getElementById('edit-expense-date');
  const statusSelect = document.getElementById('edit-expense-status');

  document.getElementById('edit-expense-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateExpense(
      yearInput.value, monthInput.value,
      memberIdInput.value, expIdInput.value,
      {
        name: nameInput.value.trim(),
        amount: Number(amountInput.value) || 0,
        date: dateInput.value.trim(),
        status: statusSelect.value,
      }
    );
    modal.classList.remove('active');
    showToast('✅ 已更新');
  });

  window.openEditExpenseModal = (exp, year, month) => {
    memberIdInput.value = exp.memberId;
    expIdInput.value = exp.id;
    yearInput.value = year;
    monthInput.value = month;
    nameInput.value = exp.name || '';
    amountInput.value = exp.amount || 0;
    dateInput.value = exp.date || '';
    statusSelect.value = exp.status || '未處理';
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  };
}

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
        <td>${isRepaid ? '<span class="badge badge-success">已還款</span>' : '<span class="badge badge-pending">未還款</span>'}</td>
        <td><input type="checkbox" ${isRepaid ? 'checked' : ''} data-action="toggle-fixed" data-id="${r.id}" style="width:auto; cursor:pointer;"></td>
        <td><button class="btn btn-sm btn-danger" data-action="delete-fixed" data-id="${r.id}">刪除</button></td>
      </tr>
    `;
  }).join('');

  refreshIcons();
  updatePendingTotal();
}

function renderExpenseTable() {
  const tbody = document.getElementById('member-repayment-tbody');
  if (!memberExpenses.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">本月尚無成員代墊支出</td></tr>`;
    updatePendingTotal();
    return;
  }

  tbody.innerHTML = memberExpenses.map((e) => {
    const member = members.find((m) => m.id === e.memberId);
    const memberName = member ? member.name : '（未知）';
    const isRepaid = e.status === '已還款';
    const checkbox = e.isAutoLinked
      ? `<span class="text-muted" style="font-size:12px;">由保險管理</span>`
      : `<input type="checkbox" ${isRepaid ? 'checked' : ''} data-action="toggle-expense" data-member-id="${e.memberId}" data-expense-id="${e.id}" style="width:auto; cursor:pointer;">`;
    const actionBtn = e.isAutoLinked
      ? '—'
      : `<button class="btn btn-sm btn-ghost" data-action="edit-expense" data-expense-id="${e.id}" data-member-id="${e.memberId}">編輯</button>`;
    return `
      <tr>
        <td>${escapeHtml(memberName)}</td>
        <td>${escapeHtml(e.name)}</td>
        <td class="num">${formatHKD(e.amount)}</td>
        <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(e.date || '—')}</td>
        <td>${isRepaid ? '<span class="badge badge-success">已還款</span>' : '<span class="badge badge-pending">未還款</span>'}</td>
        <td>${checkbox}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');

  refreshIcons();
  updatePendingTotal();
}

function updatePendingTotal() {
  const fixedPending = fixedRepayments.filter((r) => r.status !== '已還款').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const expPending = memberExpenses.filter((e) => e.status !== '已還款' && !e.isAutoLinked).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  document.getElementById('settlement-pending-total').textContent = formatHKD(fixedPending + expPending);
}

document.addEventListener('change', async (e) => {
  const el = e.target;
  const { year, month } = AppState.getYearMonth();
  if (month === 'all') return;
  if (el.dataset.action === 'toggle-fixed') {
    await updateFixedRepayment(year, month, el.dataset.id, {
      status: el.checked ? '已還款' : '未還款',
      repaidDate: el.checked ? new Date().toISOString().slice(0, 10) : '',
    });
  } else if (el.dataset.action === 'toggle-expense') {
    await markMemberExpenseRepaid(year, month, el.dataset.memberId, el.dataset.expenseId, el.checked);
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { year, month } = AppState.getYearMonth();
  if (month === 'all') return;

  if (btn.dataset.action === 'delete-fixed') {
    if (confirm('確定要刪除此固定還款項目嗎？')) {
      await removeFixedRepayment(year, month, btn.dataset.id);
    }
  } else if (btn.dataset.action === 'edit-expense') {
    const expId = btn.dataset.expenseId;
    const memberId = btn.dataset.memberId;
    const exp = memberExpenses.find((x) => x.id === expId && x.memberId === memberId);
    if (exp && window.openEditExpenseModal) {
      window.openEditExpenseModal(exp, year, month);
    }
  }
});

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.4);z-index:99999;opacity:0;transition:opacity 0.3s;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
