// ============================================
// personal-expenses.js — 個人支出獨立頁面（含篩選與批次）
// ============================================

import {
  listenMembers, listenCategories, listenItems,
  listenAllExpenses, addExpense, updateExpense, removeExpense,
  addFixedTemplate, batchUpdateExpenses,
} from './db.js';
import { formatHKD, todayISO, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let members = [];
let categories = [];
let items = [];
let allExpenses = [];
let filters = { year: '', month: '', member: '', category: '' };

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

  // 🆕 摺疊輸入卡片
  bindCollapsibleInputCard();

  const now = new Date();
  const currentYear = now.getFullYear();
  let yearOpts = '';
  for (let y = currentYear - 5; y <= currentYear + 5; y++) yearOpts += `<option value="${y}">${y} 年</option>`;
  yearSel.innerHTML = yearOpts;
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;
  dateInput.value = todayISO();

  initFilterOptions(currentYear);

  listenMembers((list) => {
    members = list;
    renderMemberOptions(memberSel, true);
    renderMemberOptions(document.getElementById('pe-edit-member'), false);
    renderMemberOptions(document.getElementById('pe-batch-member'), true);
    renderFilterMemberOptions();
  });

  listenCategories((list) => {
    categories = list;
    renderCategoryOptions(categorySel, true);
    renderCategoryOptions(document.getElementById('pe-edit-category'), false);
    renderCategoryOptions(document.getElementById('pe-batch-category'), true);
    renderFilterCategoryOptions();
  });

  listenItems((list) => {
    items = list;
    renderItemOptions(itemSel, categorySel.value);
    renderItemOptions(document.getElementById('pe-edit-item'), document.getElementById('pe-edit-category').value);
    renderItemOptions(document.getElementById('pe-batch-item'), document.getElementById('pe-batch-category').value);
  });

  categorySel.addEventListener('change', () => renderItemOptions(itemSel, categorySel.value));

  listenAllExpenses((list) => {
    allExpenses = list;
    renderExpenses();
  });

  const { year, month } = AppState.getYearMonth();
  yearSel.value = year;
  monthSel.value = month === 'all' ? String(now.getMonth() + 1).padStart(2, '0') : month;

  document.getElementById('filter-year').addEventListener('change', (e) => { filters.year = e.target.value; renderExpenses(); });
  document.getElementById('filter-month').addEventListener('change', (e) => { filters.month = e.target.value; renderExpenses(); });
  document.getElementById('filter-member').addEventListener('change', (e) => { filters.member = e.target.value; renderExpenses(); });
  document.getElementById('filter-category').addEventListener('change', (e) => { filters.category = e.target.value; renderExpenses(); });
  document.getElementById('filter-clear-btn').addEventListener('click', () => {
    filters = { year: '', month: '', member: '', category: '' };
    document.getElementById('filter-year').value = '';
    document.getElementById('filter-month').value = '';
    document.getElementById('filter-member').value = '';
    document.getElementById('filter-category').value = '';
    renderExpenses();
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
      amount: Math.round(Number(amountInput.value) || 0),
      status: statusSel.value,
      date: dateInput.value.trim() || todayISO(),
      categoryId: catId,
      itemId: itemId,
    };

    await addExpense(targetYear, targetMonth, targetMemberId, payload);

    if (fixedCheck.checked) {
      await addFixedTemplate({
        name: itemName, categoryId: catId, itemId: itemId,
        memberId: targetMemberId, amount: payload.amount,
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

  document.getElementById('pe-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.pe-row-checkbox:not(:disabled)').forEach((cb) => { cb.checked = e.target.checked; });
    updateSelectedCount();
  });

  document.getElementById('pe-tbody').addEventListener('change', (e) => {
    if (e.target.classList.contains('pe-row-checkbox')) updateSelectedCount();
  });

  document.getElementById('pe-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const expId = btn.dataset.id;
    const memberId = btn.dataset.member;
    const year = btn.dataset.year;
    const month = btn.dataset.month;
    const exp = allExpenses.find((x) => x.id === expId && x.memberId === memberId && x.year === year && x.month === month);
    if (!exp) return;

    if (btn.dataset.action === 'edit') {
      openEditModal(exp);
    } else if (btn.dataset.action === 'delete') {
      if (confirm(`確定要刪除「${exp.name}」嗎？`)) {
        await removeExpense(year, month, memberId, expId);
      }
    }
  });

  document.getElementById('pe-batch-edit-btn').addEventListener('click', () => openBatchEditModal());

  document.getElementById('pe-batch-delete-btn').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.pe-row-checkbox:checked')];
    if (checked.length === 0) return alert('請先選取要刪除的支出。');
    if (!confirm(`確定要刪除已選取的 ${checked.length} 筆支出嗎？`)) return;

    const promises = checked.map((cb) => removeExpense(cb.dataset.year, cb.dataset.month, cb.dataset.member, cb.dataset.id));
    await Promise.all(promises);
    alert(`✅ 已刪除 ${checked.length} 筆支出`);
    updateSelectedCount();
  });

  document.getElementById('pe-edit-cancel-btn').addEventListener('click', () => document.getElementById('pe-edit-modal').classList.remove('active'));
  document.getElementById('pe-edit-category').addEventListener('change', (e) => renderItemOptions(document.getElementById('pe-edit-item'), e.target.value));

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
      amount: Math.round(Number(document.getElementById('pe-edit-amount').value) || 0),
      status: document.getElementById('pe-edit-status').value,
      date: document.getElementById('pe-edit-date').value.trim(),
      categoryId: catId,
      itemId: itemId,
    };

    if (newYear === oldYear && newMonth === oldMonth && newMember === oldMember) {
      await updateExpense(newYear, newMonth, newMember, id, payload);
    } else {
      await batchUpdateExpenses([{
        oldYear, oldMonth, oldMemberId: oldMember, expenseId: id,
        data: { ...payload, year: newYear, month: newMonth, memberId: newMember },
      }]);
    }

    document.getElementById('pe-edit-modal').classList.remove('active');
    showToast('✅ 已更新支出');
  });

  document.getElementById('pe-batch-edit-cancel-btn').addEventListener('click', () => document.getElementById('pe-batch-edit-modal').classList.remove('active'));
  document.getElementById('pe-batch-category').addEventListener('change', (e) => renderItemOptions(document.getElementById('pe-batch-item'), e.target.value));

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

    const updates = checked.map((cb) => {
      const exp = allExpenses.find((x) => x.id === cb.dataset.id && x.memberId === cb.dataset.member && x.year === cb.dataset.year && x.month === cb.dataset.month);
      if (!exp) return null;
      const itemName = batchItem ? (items.find((i) => i.id === batchItem)?.name || exp.name) : exp.name;

      return {
        oldYear: cb.dataset.year,
        oldMonth: cb.dataset.month,
        oldMemberId: cb.dataset.member,
        expenseId: cb.dataset.id,
        data: {
          name: itemName,
          amount: batchAmount !== '' ? Math.round(Number(batchAmount)) : exp.amount,
          status: batchStatus || exp.status,
          date: batchDate || exp.date,
          categoryId: batchCat || exp.categoryId,
          itemId: batchItem || exp.itemId,
          year: batchYear || cb.dataset.year,
          month: batchMonth || cb.dataset.month,
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

  /* ============================================
     🆕 摺疊輸入卡片
     ============================================ */
  function bindCollapsibleInputCard() {
    const card = document.getElementById('input-card');
    const header = document.getElementById('input-card-header');
    const body = document.getElementById('input-card-body');
    if (!card || !header || !body) return;

    // 從 localStorage 讀取上次狀態（預設收起）
    const savedOpen = localStorage.getItem('pe-input-open') === 'true';
    if (savedOpen) {
      card.classList.add('open');
      body.style.display = 'block';
    }

    header.addEventListener('click', () => {
      const isOpen = card.classList.toggle('open');
      body.style.display = isOpen ? 'block' : 'none';
      localStorage.setItem('pe-input-open', String(isOpen));
      if (window.lucide) window.lucide.createIcons();
    });
  }

  function initFilterOptions(year) {
    const fy = document.getElementById('filter-year');
    let opts = '<option value="">全部</option>';
    for (let y = year - 5; y <= year + 5; y++) opts += `<option value="${y}">${y} 年</option>`;
    fy.innerHTML = opts;

    const fm = document.getElementById('filter-month');
    let mOpts = '<option value="">全部</option>';
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    fm.innerHTML = mOpts;
  }

  function renderFilterMemberOptions() {
    const sel = document.getElementById('filter-member');
    const cur = sel.value;
    sel.innerHTML = `<option value="">全部</option>` + members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (cur) sel.value = cur;
  }

  function renderFilterCategoryOptions() {
    const sel = document.getElementById('filter-category');
    const cur = sel.value;
    sel.innerHTML = `<option value="">全部</option>` + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (cur) sel.value = cur;
  }

  function updateSelectedCount() {
    const count = document.querySelectorAll('.pe-row-checkbox:checked').length;
    document.getElementById('pe-selected-count').textContent = `已選取 ${count} 筆`;
    document.getElementById('pe-batch-edit-btn').disabled = count === 0;
    document.getElementById('pe-batch-delete-btn').disabled = count === 0;
  }

  function renderMemberOptions(sel, includeEmpty) {
    if (!sel) return;
    const cur = sel.value;
    const empty = includeEmpty ? `<option value="">— 請選擇 —</option>` : '';
    sel.innerHTML = empty + members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (cur) sel.value = cur;
  }

  function renderCategoryOptions(sel, includeEmpty) {
    if (!sel) return;
    const cur = sel.value;
    const empty = includeEmpty ? `<option value="">— 請選擇類別 —</option>` : '';
    sel.innerHTML = empty + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (cur) sel.value = cur;
  }

  function renderItemOptions(sel, catId) {
    if (!sel) return;
    if (!catId) { sel.innerHTML = `<option value="">— 請先選擇類別 —</option>`; return; }
    const filtered = items.filter((i) => i.categoryId === catId);
    sel.innerHTML = `<option value="">— 請選擇項目 —</option>` + filtered.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  }

  function renderExpenses() {
    const tbody = document.getElementById('pe-tbody');
    const totalCountEl = document.getElementById('pe-total-count');

    const filtered = allExpenses.filter((x) => {
      if (filters.year && x.year !== filters.year) return false;
      if (filters.month && x.month !== filters.month) return false;
      if (filters.member && x.memberId !== filters.member) return false;
      if (filters.category && x.categoryId !== filters.category) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (a.year !== b.year) return b.year.localeCompare(a.year);
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    if (totalCountEl) totalCountEl.textContent = `（共 ${filtered.length} 筆）`;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">沒有符合條件的支出紀錄</td></tr>';
      updateSelectedCount();
      return;
    }

    tbody.innerHTML = filtered.map((x) => {
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
        : `<button class="btn btn-sm btn-ghost" data-action="edit" data-id="${x.id}" data-member="${x.memberId}" data-year="${x.year}" data-month="${x.month}">編輯</button>
           <button class="btn btn-sm btn-danger" data-action="delete" data-id="${x.id}" data-member="${x.memberId}" data-year="${x.year}" data-month="${x.month}">刪除</button>`;

      return `
        <tr>
          <td><input type="checkbox" class="pe-row-checkbox" data-id="${x.id}" data-member="${x.memberId}" data-year="${x.year}" data-month="${x.month}" style="width:auto; cursor:pointer;" ${x.isAutoLinked ? 'disabled' : ''}></td>
          <td class="mono" style="font-size:12px;">${x.year}</td>
          <td class="mono" style="font-size:12px;">${x.month}</td>
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

  function openEditModal(exp) {
    document.getElementById('pe-edit-id').value = exp.id;
    document.getElementById('pe-edit-old-year').value = exp.year;
    document.getElementById('pe-edit-old-month').value = exp.month;
    document.getElementById('pe-edit-old-member').value = exp.memberId;
    document.getElementById('pe-edit-year').value = exp.year;
    document.getElementById('pe-edit-month').value = exp.month;
    document.getElementById('pe-edit-member').value = exp.memberId;
    document.getElementById('pe-edit-date').value = exp.date || '';
    document.getElementById('pe-edit-category').value = exp.categoryId || '';
    renderItemOptions(document.getElementById('pe-edit-item'), exp.categoryId || '');
    setTimeout(() => { document.getElementById('pe-edit-item').value = exp.itemId || ''; }, 50);
    document.getElementById('pe-edit-amount').value = exp.amount || 0;
    document.getElementById('pe-edit-status').value = exp.status || '未處理';
    document.getElementById('pe-edit-modal').classList.add('active');
  }

  function openBatchEditModal() {
    const ySel = document.getElementById('pe-batch-year');
    const mSel = document.getElementById('pe-batch-month');
    let yOpts = '<option value="">— 不修改 —</option>';
    for (let y = currentYear - 5; y <= currentYear + 5; y++) yOpts += `<option value="${y}">${y} 年</option>`;
    ySel.innerHTML = yOpts;
    let mOpts = '<option value="">— 不修改 —</option>';
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    mSel.innerHTML = mOpts;

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
