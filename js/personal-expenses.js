// ============================================
// personal-expenses.js — 個人支出獨立頁面
// ============================================

import {
  listenMembers, listenCategories, listenItems,
  listenAllMemberExpenses, addExpense, updateExpense, removeExpense,
  addFixedTemplate, batchUpdateExpenses,
} from './db.js';
import { formatHKD, todayISO, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let members = [];
let categories = [];
let items = [];
let expenses = [];
let unsubscribeExpenses = null;

export function initPersonalExpensesPage() {
  const form = document.getElementById('personal-expense-form');
  const yearSel = document.getElementById('pe-year');
  const monthSel = document.getElementById('pe-month');
  const memberSel = document.getElementById('pe-member');
  const dateInput = document.getElementById('pe-date');
  const categorySel = document.getElementById('pe-category');
  const itemSel = document.getElementById('pe-item');
  const amountInput = document.getElementById('pe-amount');
  const statusSel = document.getElementById('pe-status');
  const fixedCheck = document.getElementById('pe-fixed');
  const resetBtn = document.getElementById('pe-reset-btn');

  const now = new Date();
  const currentYear = now.getFullYear();
  let yearOpts = '';
  for (let y = currentYear - 5; y <= currentYear + 5; y++) yearOpts += `<option value="${y}">${y} 年</option>`;
  yearSel.innerHTML = yearOpts;
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;
  dateInput.value = todayISO();

  listenMembers((list) => {
    members = list;
    renderMemberOptions(memberSel, true);
    renderMemberOptions(document.getElementById('pe-edit-member'), false);
    renderMemberOptions(document.getElementById('pe-batch-member'), true);
  });

  listenCategories((list) => {
    categories = list;
    renderCategoryOptions(categorySel, true);
    renderCategoryOptions(document.getElementById('pe-edit-category'), false);
    renderCategoryOptions(document.getElementById('pe-batch-category'), true);
  });

  listenItems((list) => {
    items = list;
    renderItemOptions(itemSel, categorySel.value);
    renderItemOptions(document.getElementById('pe-edit-item'), document.getElementById('pe-edit-category').value);
    renderItemOptions(document.getElementById('pe-batch-item'), document.getElementById('pe-batch-category').value);
  });

  categorySel.addEventListener('change', () => renderItemOptions(itemSel, categorySel.value));

  // 載入當前年月的支出
  const loadData = () => {
    const { year, month } = AppState.getYearMonth();
    const isAnnual = month === 'all';
    if (isAnnual) {
      document.getElementById('pe-tbody').innerHTML = '<tr><td colspan="8" class="empty-state">請切換到特定月份查看明細</td></tr>';
      return;
    }
    if (unsubscribeExpenses) unsubscribeExpenses();
    unsubscribeExpenses = listenAllMemberExpenses(year, month, (list) => {
      expenses = list;
      renderExpenses();
    });
  };

  // 預設表單的年月為當前全局年月
  const { year, month } = AppState.getYearMonth();
  yearSel.value = year;
  monthSel.value = month === 'all' ? String(now.getMonth() + 1).padStart(2, '0') : month;

  loadData();
  AppState.on('ym-change', () => {
    const { year, month } = AppState.getYearMonth();
    yearSel.value = year;
    monthSel.value = month === 'all' ? String(now.getMonth() + 1).padStart(2, '0') : month;
    loadData();
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    dateInput.value = todayISO();
    itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetYear = yearSel.value;
    const targetMonth = monthSel.value;
    const targetMemberId = memberSel.value;
    const catId = categorySel.value;
    const itemId = itemSel.value;
    const itemName = items.find((i) => i.id === itemId)?.name || '';

    if (!targetMemberId || !itemName || !amountInput.value) return;

    const payload = {
      name: itemName,
      amount: Number(amountInput.value) || 0,
      status: statusSel.value,
      date: dateInput.value.trim() || todayISO(),
      categoryId: catId,
      itemId: itemId,
    };

    await addExpense(targetYear, targetMonth, targetMemberId, payload);

    if (fixedCheck.checked) {
      await addFixedTemplate({
        name: itemName,
        categoryId: catId,
        itemId: itemId,
        memberId: targetMemberId,
        amount: payload.amount,
      });
    }

    showToast(`✅ 已新增 ${targetYear} 年 ${targetMonth} 月支出`);
    form.reset();
    dateInput.value = todayISO();
    itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
    memberSel.value = '';
    categorySel.value = '';
    fixedCheck.checked = false;
  });

  // 全選
  document.getElementById('pe-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.pe-row-checkbox').forEach((cb) => {
      cb.checked = e.target.checked;
    });
    updateSelectedCount();
  });

  // 表格事件委派
  document.getElementById('pe-tbody').addEventListener('change', (e) => {
    if (e.target.classList.contains('pe-row-checkbox')) {
      updateSelectedCount();
    }
  });

  document.getElementById('pe-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const expId = btn.dataset.id;
    const memberId = btn.dataset.member;
    const exp = expenses.find((x) => x.id === expId && x.memberId === memberId);
    if (!exp) return;

    const { year, month } = AppState.getYearMonth();

    if (btn.dataset.action === 'edit') {
      openEditModal(exp, year, month);
    } else if (btn.dataset.action === 'delete') {
      if (confirm(`確定要刪除「${exp.name}」嗎？`)) {
        await removeExpense(year, month, memberId, expId);
      }
    }
  });

  // 批次編輯
  document.getElementById('pe-batch-edit-btn').addEventListener('click', () => {
    openBatchEditModal();
  });

  // 批次刪除
  document.getElementById('pe-batch-delete-btn').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.pe-row-checkbox:checked')];
    if (checked.length === 0) return alert('請先選取要刪除的支出。');
    if (!confirm(`確定要刪除已選取的 ${checked.length} 筆支出嗎？`)) return;

    const { year, month } = AppState.getYearMonth();
    const promises = checked.map((cb) => {
      return removeExpense(year, month, cb.dataset.member, cb.dataset.id);
    });
    await Promise.all(promises);
    alert(`✅ 已刪除 ${checked.length} 筆支出`);
    updateSelectedCount();
  });

  // 單筆編輯 Modal
  document.getElementById('pe-edit-cancel-btn').addEventListener('click', () => {
    document.getElementById('pe-edit-modal').classList.remove('active');
  });

  document.getElementById('pe-edit-category').addEventListener('change', (e) => {
    renderItemOptions(document.getElementById('pe-edit-item'), e.target.value);
  });

  document.getElementById('pe-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pe-edit-id').value;
    const oldYear = document.getElementById('pe-edit-old-year').value;
    const oldMonth = document.getElementById('pe-edit-old-month').value;
    const oldMember = document.getElementById('pe-edit-old-member').value;

    const newYear = document.getElementById('pe-edit-year').value;
    const newMonth = document.getElementById('pe-edit-month').value;
    const newMember = document.getElementById('pe-edit-member').value;
    const catId = document.getElementById('pe-edit-category').value;
    const itemId = document.getElementById('pe-edit-item').value;
    const itemName = items.find((i) => i.id === itemId)?.name || '';

    if (!newMember || !itemName) return;

    const payload = {
      name: itemName,
      amount: Number(document.getElementById('pe-edit-amount').value) || 0,
      status: document.getElementById('pe-edit-status').value,
      date: document.getElementById('pe-edit-date').value.trim(),
      categoryId: catId,
      itemId: itemId,
    };

    if (newYear === oldYear && newMonth === oldMonth && newMember === oldMember) {
      // 路徑不變，直接更新
      await updateExpense(newYear, newMonth, newMember, id, payload);
    } else {
      // 路徑改變，使用批次更新
      await batchUpdateExpenses([{
        oldYear, oldMonth, oldMemberId: oldMember, expenseId: id,
        data: { ...payload, year: newYear, month: newMonth, memberId: newMember },
      }]);
    }

    document.getElementById('pe-edit-modal').classList.remove('active');
    showToast('✅ 已更新支出');
  });

  // 批次編輯 Modal
  document.getElementById('pe-batch-edit-cancel-btn').addEventListener('click', () => {
    document.getElementById('pe-batch-edit-modal').classList.remove('active');
  });

  document.getElementById('pe-batch-category').addEventListener('change', (e) => {
    renderItemOptions(document.getElementById('pe-batch-item'), e.target.value);
  });

  document.getElementById('pe-batch-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const checked = [...document.querySelectorAll('.pe-row-checkbox:checked')];
    if (checked.length === 0) return alert('請先選取要編輯的支出。');

    const batchYear = document.getElementById('pe-batch-year').value;
    const batchMonth = document.getElementById('pe-batch-month').value;
    const batchMember = document.getElementById('pe-batch-member').value;
    const batchDate = document.getElementById('pe-batch-date').value.trim();
    const batchCat = document.getElementById('pe-batch-category').value;
    const batchItem = document.getElementById('pe-batch-item').value;
    const batchAmount = document.getElementById('pe-batch-amount').value;
    const batchStatus = document.getElementById('pe-batch-status').value;

    const { year, month } = AppState.getYearMonth();
    const updates = checked.map((cb) => {
      const exp = expenses.find((x) => x.id === cb.dataset.id && x.memberId === cb.dataset.member);
      if (!exp) return null;

      const itemName = batchItem ? (items.find((i) => i.id === batchItem)?.name || exp.name) : exp.name;

      return {
        oldYear: year,
        oldMonth: month,
        oldMemberId: cb.dataset.member,
        expenseId: cb.dataset.id,
        data: {
          name: itemName,
          amount: batchAmount !== '' ? Number(batchAmount) : exp.amount,
          status: batchStatus || exp.status,
          date: batchDate || exp.date,
          categoryId: batchCat || exp.categoryId,
          itemId: batchItem || exp.itemId,
          year: batchYear || year,
          month: batchMonth || month,
          memberId: batchMember || cb.dataset.member,
        },
      };
    }).filter(Boolean);

    try {
      await batchUpdateExpenses(updates);
      document.getElementById('pe-batch-edit-modal').classList.remove('active');
      document.getElementById('pe-select-all').checked = false;
      updateSelectedCount();
      showToast(`✅ 已批次更新 ${updates.length} 筆支出`);
    } catch (err) {
      alert('批次更新失敗：' + err.message);
    }
  });

  function updateSelectedCount() {
    const count = document.querySelectorAll('.pe-row-checkbox:checked').length;
    document.getElementById('pe-selected-count').textContent = `已選取 ${count} 筆`;
    document.getElementById('pe-batch-edit-btn').disabled = count === 0;
    document.getElementById('pe-batch-delete-btn').disabled = count === 0;
  }

  function renderMemberOptions(sel, includeEmpty) {
    if (!sel) return;
    const current = sel.value;
    const emptyOpt = includeEmpty ? `<option value="">— 請選擇 —</option>` : '';
    sel.innerHTML = emptyOpt + members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (current) sel.value = current;
  }

  function renderCategoryOptions(sel, includeEmpty) {
    if (!sel) return;
    const current = sel.value;
    const emptyOpt = includeEmpty ? `<option value="">— 請選擇類別 —</option>` : '';
    sel.innerHTML = emptyOpt + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (current) sel.value = current;
  }

  function renderItemOptions(sel, catId) {
    if (!sel) return;
    if (!catId) {
      sel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
      return;
    }
    const filtered = items.filter((i) => i.categoryId === catId);
    sel.innerHTML = `<option value="">— 請選擇項目 —</option>` + filtered.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  }

  function renderExpenses() {
    const tbody = document.getElementById('pe-tbody');
    if (!tbody) return;

    if (!expenses.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">本月尚無支出紀錄</td></tr>';
      updateSelectedCount();
      return;
    }

    tbody.innerHTML = expenses.map((x) => {
      const member = members.find((m) => m.id === x.memberId);
      const memberName = member ? member.name : '（未知）';
      const cat = categories.find((c) => c.id === x.categoryId);

      let statusBadge = '';
      if (x.status === '已還款' || x.status === '已處理') {
        statusBadge = `<span class="badge badge-success">${escapeHtml(x.status)}</span>`;
      } else {
        statusBadge = `<span class="badge badge-pending">${escapeHtml(x.status || '未處理')}</span>`;
      }

      const actionCell = x.isAutoLinked
        ? `<span class="text-muted" style="font-size:12px;">由保險模組管理</span>`
        : `<button class="btn btn-sm btn-ghost" data-action="edit" data-id="${x.id}" data-member="${x.memberId}">編輯</button>
           <button class="btn btn-sm btn-danger" data-action="delete" data-id="${x.id}" data-member="${x.memberId}">刪除</button>`;

      return `
        <tr>
          <td><input type="checkbox" class="pe-row-checkbox" data-id="${x.id}" data-member="${x.memberId}" style="width:auto; cursor:pointer;" ${x.isAutoLinked ? 'disabled' : ''}></td>
          <td>${escapeHtml(memberName)}</td>
          <td>${escapeHtml(x.name)}${x.isAutoLinked ? '<span class="badge badge-info" style="margin-left:6px;">保險連動</span>' : ''}</td>
          <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(cat?.name || '—')}</td>
          <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(x.date || '—')}</td>
          <td class="num">${formatHKD(x.amount)}</td>
          <td>${statusBadge}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    updateSelectedCount();
  }

  function openEditModal(exp, year, month) {
    document.getElementById('pe-edit-id').value = exp.id;
    document.getElementById('pe-edit-old-year').value = year;
    document.getElementById('pe-edit-old-month').value = month;
    document.getElementById('pe-edit-old-member').value = exp.memberId;

    document.getElementById('pe-edit-year').value = year;
    document.getElementById('pe-edit-month').value = month;
    document.getElementById('pe-edit-member').value = exp.memberId;
    document.getElementById('pe-edit-date').value = exp.date || '';
    document.getElementById('pe-edit-category').value = exp.categoryId || '';
    renderItemOptions(document.getElementById('pe-edit-item'), exp.categoryId || '');
    setTimeout(() => {
      document.getElementById('pe-edit-item').value = exp.itemId || '';
    }, 50);
    document.getElementById('pe-edit-amount').value = exp.amount || 0;
    document.getElementById('pe-edit-status').value = exp.status || '未處理';

    document.getElementById('pe-edit-modal').classList.add('active');
  }

  function openBatchEditModal() {
    const yearSel = document.getElementById('pe-batch-year');
    const monthSel = document.getElementById('pe-batch-month');
    const now = new Date();
    yearSel.innerHTML = `<option value="">— 不修改 —</option>` + Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map((y) => `<option value="${y}">${y} 年</option>`).join('');
    monthSel.innerHTML = `<option value="">— 不修改 —</option>` + Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${String(m).padStart(2, '0')}">${m} 月</option>`).join('');

    document.getElementById('pe-batch-date').value = '';
    document.getElementById('pe-batch-amount').value = '';
    document.getElementById('pe-batch-status').value = '';
    document.getElementById('pe-batch-category').value = '';
    document.getElementById('pe-batch-item').innerHTML = `<option value="">— 不修改 —</option>`;
    document.getElementById('pe-batch-member').value = '';
    document.getElementById('pe-batch-year').value = '';
    document.getElementById('pe-batch-month').value = '';

    document.getElementById('pe-batch-edit-modal').classList.add('active');
  }
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
