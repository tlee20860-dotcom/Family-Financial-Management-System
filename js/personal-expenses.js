// ============================================
// personal-expenses.js — 個人支出（v99.5 最終版）
// ============================================

import {
  listenMembers, listenCategories, listenItems, listenPaymentMethods,
  listenAllExpenses, addExpense, updateExpense, removeExpense,
  addFixedTemplate, batchUpdateExpenses,
} from './db.js';
import { formatHKD, todayISO, escapeHtml } from './utils.js';
import { renderPageFilter } from './page-filter.js';
import { showToast } from './toast.js';
import { initCollapsibleCard } from './collapsible-card.js';
import {
  fillMemberSelect, fillCategorySelect, fillItemSelect, fillPaymentSelect,
} from './select-helpers.js';
import { fillYearSelect, fillMonthSelect } from './date-helpers.js';
import { openModal, closeModal } from './modal.js';
import { AppState } from './state.js';

let members = [];
let categories = [];
let items = [];
let payments = [];
let allExpenses = [];
let filters = { year: '', month: '', member: '', category: '' };

const NAME_MAX_LEN = 6;

export function initPersonalExpensesPage() {
  console.log('🚀 initPersonalExpensesPage 開始');

  try {
    /* ============================================
       0. 摺疊卡片初始化
       ============================================ */
    initCollapsibleCard('input-card', 'pe-input-open', false);
    initCollapsibleCard('pe-table-card', 'pe-table-open', true);
    console.log('✅ 摺疊卡片初始化完成');

    /* ============================================
       1. 取得 DOM 元素
       ============================================ */
    const form = document.getElementById('personal-expense-form');
    const yearSel = document.getElementById('pe-year');
    const monthSel = document.getElementById('pe-month');
    const memberSel = document.getElementById('pe-member');
    const dateInput = document.getElementById('pe-date');
    const categorySel = document.getElementById('pe-category');
    const itemSel = document.getElementById('pe-item');
    const amountInput = document.getElementById('pe-amount');
    const paymentSel = document.getElementById('pe-payment');
    const statusSel = document.getElementById('pe-status');
    const fixedCheck = document.getElementById('pe-fixed');
    const resetBtn = document.getElementById('pe-reset-btn');

    if (!form) {
      console.error('❌ 找不到 #personal-expense-form');
      return;
    }
    if (!yearSel || !monthSel) {
      console.error('❌ 找不到 #pe-year 或 #pe-month');
      return;
    }
    console.log('✅ DOM 元素取得完成');

    /* ============================================
       2. 表單年月下拉
       ============================================ */
    fillYearSelect(yearSel, { defaultValue: AppState.year });
    fillMonthSelect(monthSel, {
      defaultValue: AppState.month === 'all' ? '01' : AppState.month,
    });
    dateInput.value = todayISO();
    console.log('✅ 表單年月下拉完成');

    /* ============================================
       3. 編輯 Modal 年月下拉
       ============================================ */
    fillYearSelect('pe-edit-year');
    fillMonthSelect('pe-edit-month');

    /* ============================================
       4. 頁面篩選欄
       ============================================ */
    renderFilterBar();
    console.log('✅ 篩選欄完成');

    /* ============================================
       5. 資料監聽
       ============================================ */
    listenMembers((list) => {
      members = list;
      fillMemberSelect(memberSel, members, { includeEmpty: true });
      fillMemberSelect('pe-edit-member', members, { includeEmpty: false });
      fillMemberSelect('pe-batch-member', members, { includeEmpty: true, emptyText: '— 不修改 —' });
      updateFilterOptions();
    });

    listenCategories((list) => {
      categories = list;
      fillCategorySelect(categorySel, categories, { includeEmpty: true });
      fillCategorySelect('pe-edit-category', categories, { includeEmpty: false });
      fillCategorySelect('pe-batch-category', categories, { includeEmpty: true, emptyText: '— 不修改 —' });
      updateFilterOptions();
    });

    listenItems((list) => {
      items = list;
      fillItemSelect(itemSel, items, categorySel.value, { includeEmpty: true });
      fillItemSelect('pe-edit-item', items, document.getElementById('pe-edit-category')?.value || '', { includeEmpty: false });
      fillItemSelect('pe-batch-item', items, document.getElementById('pe-batch-category')?.value || '', { includeEmpty: true, emptyText: '— 不修改 —' });
    });

    listenPaymentMethods((list) => {
      payments = list;
      fillPaymentSelect(paymentSel, payments, { includeEmpty: true });
      fillPaymentSelect('pe-edit-payment', payments, { includeEmpty: true });
      fillPaymentSelect('pe-batch-payment', payments, { includeEmpty: true, emptyText: '— 不修改 —' });
    });

    categorySel.addEventListener('change', () => {
      fillItemSelect(itemSel, items, categorySel.value, { includeEmpty: true });
    });

    listenAllExpenses((list) => {
      allExpenses = list;
      renderExpenses();
    });
    console.log('✅ 資料監聽完成');

    /* ============================================
       6. 表單操作
       ============================================ */

    resetBtn.addEventListener('click', () => {
      form.reset();
      dateInput.value = todayISO();
      fillItemSelect(itemSel, items, '', { includeEmpty: true });
      memberSel.value = '';
      categorySel.value = '';
      paymentSel.value = '';
      fixedCheck.checked = false;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetYear = yearSel.value;
      const targetMonth = monthSel.value;
      const targetMemberId = memberSel.value;
      const catId = categorySel.value;
      const itemId = itemSel.value;
      const itemName = items.find((i) => i.id === itemId)?.name || '';
      const paymentId = paymentSel.value;
      if (!targetMemberId || !itemName || !amountInput.value) return;

      const payload = {
        name: itemName,
        amount: Math.round(Number(amountInput.value) || 0),
        status: statusSel.value,
        date: dateInput.value.trim() || todayISO(),
        categoryId: catId,
        itemId: itemId,
        paymentMethodId: paymentId,
      };

      try {
        await addExpense(targetYear, targetMonth, targetMemberId, payload);

        if (fixedCheck.checked) {
          await addFixedTemplate({
            name: itemName, categoryId: catId, itemId: itemId,
            memberId: targetMemberId, amount: payload.amount,
            paymentMethodId: paymentId,
          });
        }

        showToast(`✅ 已新增 ${targetYear} 年 ${targetMonth} 月支出`, 'success');
        document.getElementById('input-card')?.classList.remove('open');
        document.getElementById('input-card-body')?.style.setProperty('display', 'none');
        localStorage.setItem('pe-input-open', 'false');

        form.reset();
        dateInput.value = todayISO();
        fillItemSelect(itemSel, items, '', { includeEmpty: true });
        memberSel.value = '';
        categorySel.value = '';
        paymentSel.value = '';
        fixedCheck.checked = false;
      } catch (err) {
        showToast('新增失敗：' + err.message, 'error');
      }
    });
    console.log('✅ 表單操作綁定完成');

    /* ============================================
       7. 表格全選 / 選取計數
       ============================================ */
    document.getElementById('pe-select-all')?.addEventListener('change', (e) => {
      document.querySelectorAll('.pe-row-checkbox:not(:disabled)').forEach((cb) => {
        cb.checked = e.target.checked;
      });
      updateSelectedCount();
    });

    document.getElementById('pe-tbody')?.addEventListener('change', (e) => {
      if (e.target.classList.contains('pe-row-checkbox')) updateSelectedCount();
    });

    /* ============================================
       8. 表格點擊（展開名稱 / 編輯 / 刪除）
       ============================================ */
    document.getElementById('pe-tbody')?.addEventListener('click', async (e) => {
      const nameSpan = e.target.closest('.pe-name-text');
      if (nameSpan) {
        const isShort = nameSpan.classList.contains('pe-name-short');
        if (isShort) {
          nameSpan.textContent = nameSpan.dataset.full;
          nameSpan.classList.remove('pe-name-short');
        } else {
          nameSpan.textContent = nameSpan.dataset.short;
          nameSpan.classList.add('pe-name-short');
        }
        return;
      }

      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const expId = btn.dataset.id;
      const memberId = btn.dataset.member;
      const year = btn.dataset.year;
      const month = btn.dataset.month;
      const exp = allExpenses.find((x) =>
        x.id === expId && x.memberId === memberId && x.year === year && x.month === month
      );
      if (!exp) return;

      if (btn.dataset.action === 'edit') {
        openEditModal(exp);
      } else if (btn.dataset.action === 'delete') {
        if (confirm(`確定要刪除「${exp.name}」嗎？`)) {
          try {
            await removeExpense(year, month, memberId, expId);
            showToast('✅ 已刪除', 'success');
          } catch (err) {
            showToast('刪除失敗：' + err.message, 'error');
          }
        }
      }
    });

    /* ============================================
       9. 批次操作
       ============================================ */
    document.getElementById('pe-batch-edit-btn')?.addEventListener('click', () => openBatchEditModal());

    document.getElementById('pe-batch-delete-btn')?.addEventListener('click', async () => {
      const checked = [...document.querySelectorAll('.pe-row-checkbox:checked')];
      if (checked.length === 0) return showToast('請先選取要刪除的支出', 'warning');
      if (!confirm(`確定要刪除已選取的 ${checked.length} 筆支出嗎？`)) return;

      try {
        const promises = checked.map((cb) =>
          removeExpense(cb.dataset.year, cb.dataset.month, cb.dataset.member, cb.dataset.id)
        );
        await Promise.all(promises);
        showToast(`✅ 已刪除 ${checked.length} 筆支出`, 'success');
        updateSelectedCount();
      } catch (err) {
        showToast('刪除失敗：' + err.message, 'error');
      }
    });

    /* ============================================
       10. 單筆編輯 Modal
       ============================================ */
    document.getElementById('pe-edit-cancel-btn')?.addEventListener('click', () => closeModal('pe-edit-modal'));

    document.getElementById('pe-edit-category')?.addEventListener('change', (e) => {
      fillItemSelect('pe-edit-item', items, e.target.value, { includeEmpty: false });
    });

    document.getElementById('pe-edit-form')?.addEventListener('submit', async (e) => {
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
      const paymentId = document.getElementById('pe-edit-payment').value;
      if (!newMember || !itemName) return;

      const payload = {
        name: itemName,
        amount: Math.round(Number(document.getElementById('pe-edit-amount').value) || 0),
        status: document.getElementById('pe-edit-status').value,
        date: document.getElementById('pe-edit-date').value.trim(),
        categoryId: catId,
        itemId: itemId,
        paymentMethodId: paymentId,
      };

      try {
        if (newYear === oldYear && newMonth === oldMonth && newMember === oldMember) {
          await updateExpense(newYear, newMonth, newMember, id, payload);
        } else {
          await batchUpdateExpenses([{
            oldYear, oldMonth, oldMemberId: oldMember, expenseId: id,
            data: { ...payload, year: newYear, month: newMonth, memberId: newMember },
          }]);
        }
        closeModal('pe-edit-modal');
        showToast('✅ 已更新支出', 'success');
      } catch (err) {
        showToast('更新失敗：' + err.message, 'error');
      }
    });

    /* ============================================
       11. 批次編輯 Modal
       ============================================ */
    document.getElementById('pe-batch-edit-cancel-btn')?.addEventListener('click', () => closeModal('pe-batch-edit-modal'));

    document.getElementById('pe-batch-category')?.addEventListener('change', (e) => {
      fillItemSelect('pe-batch-item', items, e.target.value, { includeEmpty: true, emptyText: '— 不修改 —' });
    });

    document.getElementById('pe-batch-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const checked = [...document.querySelectorAll('.pe-row-checkbox:checked')];
      if (checked.length === 0) return showToast('請先選取要編輯的支出', 'warning');

      const batchYear = document.getElementById('pe-batch-year').value;
      const batchMonth = document.getElementById('pe-batch-month').value;
      const batchMember = document.getElementById('pe-batch-member').value;
      const batchDate = document.getElementById('pe-batch-date').value.trim();
      const batchCat = document.getElementById('pe-batch-category').value;
      const batchItem = document.getElementById('pe-batch-item').value;
      const batchAmount = document.getElementById('pe-batch-amount').value;
      const batchPayment = document.getElementById('pe-batch-payment').value;
      const batchStatus = document.getElementById('pe-batch-status').value;

      const updates = checked.map((cb) => {
        const exp = allExpenses.find((x) =>
          x.id === cb.dataset.id && x.memberId === cb.dataset.member &&
          x.year === cb.dataset.year && x.month === cb.dataset.month
        );
        if (!exp) return null;
        const itemName = batchItem
          ? (items.find((i) => i.id === batchItem)?.name || exp.name)
          : exp.name;

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
            paymentMethodId: batchPayment || exp.paymentMethodId || '',
            year: batchYear || cb.dataset.year,
            month: batchMonth || cb.dataset.month,
            memberId: batchMember || cb.dataset.member,
          },
        };
      }).filter(Boolean);

      try {
        await batchUpdateExpenses(updates);
        closeModal('pe-batch-edit-modal');
        document.getElementById('pe-select-all').checked = false;
        updateSelectedCount();
        showToast(`✅ 已批次更新 ${updates.length} 筆支出`, 'success');
      } catch (err) {
        showToast('批次更新失敗：' + err.message, 'error');
      }
    });

    console.log('✅ initPersonalExpensesPage 全部完成');

  } catch (err) {
    console.error('❌ initPersonalExpensesPage 執行失敗：', err);
    alert('頁面初始化失敗，請重新整理。\n\n錯誤：' + err.message);
  }

  /* ============================================
     內部函式
     ============================================ */

  function renderFilterBar() {
    renderPageFilter({
      containerId: 'page-filter-root',
      fields: ['year', 'month'],
      renderExtra: () => `
        <div class="filter-group">
          <label class="field-label">成員</label>
          <select class="select" data-filter="member">
            <option value="">全部</option>
            ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label class="field-label">類別</label>
          <select class="select" data-filter="category">
            <option value="">全部</option>
            ${categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      `,
      onChange: (f) => {
        filters = {
          year: f.year || '',
          month: f.month === 'all' ? '' : (f.month || ''),
          member: f.member || '',
          category: f.category || '',
        };
        renderExpenses();
      },
    });
  }

  function updateFilterOptions() {
    const root = document.getElementById('page-filter-root');
    if (!root) return;

    const memberSel = root.querySelector('select[data-filter="member"]');
    if (memberSel) {
      const cur = memberSel.value;
      memberSel.innerHTML = `<option value="">全部</option>` +
        members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
      if (cur && members.some((m) => m.id === cur)) memberSel.value = cur;
    }

    const catSel = root.querySelector('select[data-filter="category"]');
    if (catSel) {
      const cur = catSel.value;
      catSel.innerHTML = `<option value="">全部</option>` +
        categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      if (cur && categories.some((c) => c.id === cur)) catSel.value = cur;
    }
  }

  function updateSelectedCount() {
    const count = document.querySelectorAll('.pe-row-checkbox:checked').length;
    const countEl = document.getElementById('pe-selected-count');
    if (countEl) countEl.textContent = `已選取 ${count} 筆`;
    const editBtn = document.getElementById('pe-batch-edit-btn');
    const delBtn = document.getElementById('pe-batch-delete-btn');
    if (editBtn) editBtn.disabled = count === 0;
    if (delBtn) delBtn.disabled = count === 0;
  }

  function renderExpenses() {
    const tbody = document.getElementById('pe-tbody');
    const totalCountEl = document.getElementById('pe-total-count');
    if (!tbody) return;

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
      const pm = payments.find((p) => p.id === x.paymentMethodId);
      const pmName = pm ? pm.name : (x.paymentMethodId ? '（已刪除）' : '—');

      let statusBadge = '';
      if (x.status === '已還款' || x.status === '已處理') {
        statusBadge = `<span class="badge badge-success">${escapeHtml(x.status)}</span>`;
      } else {
        statusBadge = `<span class="badge badge-pending">${escapeHtml(x.status || '未處理')}</span>`;
      }

      const actionCell = x.isAutoLinked
        ? `<span class="text-muted" style="font-size:11px;">由保險模組管理</span>`
        : `<button class="btn btn-sm btn-ghost" data-action="edit" data-id="${x.id}" data-member="${x.memberId}" data-year="${x.year}" data-month="${x.month}">編輯</button>
           <button class="btn btn-sm btn-danger" data-action="delete" data-id="${x.id}" data-member="${x.memberId}" data-year="${x.year}" data-month="${x.month}">刪除</button>`;

      const fullName = x.name || '';
      const isTruncatable = fullName.length > NAME_MAX_LEN;
      const shortName = isTruncatable ? fullName.slice(0, NAME_MAX_LEN) + '…' : fullName;

      const nameHtml = isTruncatable
        ? `<span class="pe-name-text pe-name-short" data-full="${escapeHtml(fullName)}" data-short="${escapeHtml(shortName)}">${escapeHtml(shortName)}</span>`
        : escapeHtml(fullName);

      return `
        <tr>
          <td><input type="checkbox" class="pe-row-checkbox" data-id="${x.id}" data-member="${x.memberId}" data-year="${x.year}" data-month="${x.month}" style="width:auto; cursor:pointer;" ${x.isAutoLinked ? 'disabled' : ''}></td>
          <td class="pe-ym-cell">${x.year}-${x.month}</td>
          <td class="pe-member-cell">${escapeHtml(memberName)}</td>
          <td class="pe-name-cell">${nameHtml}${x.isAutoLinked ? '<span class="badge badge-info" style="margin-left:4px;">保險</span>' : ''}</td>
          <td class="hide-mobile" style="font-size:11px; color:var(--text-muted);">${escapeHtml(cat?.name || '—')}</td>
          <td style="font-size:11px; color:var(--text-muted);">${escapeHtml(pmName)}</td>
          <td class="hide-mobile mono" style="font-size:11px; color:var(--text-muted);">${escapeHtml(x.date || '—')}</td>
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
    fillItemSelect('pe-edit-item', items, exp.categoryId || '', { includeEmpty: false });
    setTimeout(() => { document.getElementById('pe-edit-item').value = exp.itemId || ''; }, 50);
    document.getElementById('pe-edit-amount').value = exp.amount || 0;
    document.getElementById('pe-edit-payment').value = exp.paymentMethodId || '';
    document.getElementById('pe-edit-status').value = exp.status || '未處理';
    openModal('pe-edit-modal');
  }

  function openBatchEditModal() {
    const now = new Date();
    const curY = now.getFullYear();

    const ySel = document.getElementById('pe-batch-year');
    let yOpts = `<option value="">— 不修改 —</option>`;
    for (let y = curY - 5; y <= curY + 5; y++) {
      yOpts += `<option value="${y}">${y} 年</option>`;
    }
    ySel.innerHTML = yOpts;

    const mSel = document.getElementById('pe-batch-month');
    let mOpts = `<option value="">— 不修改 —</option>`;
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      mOpts += `<option value="${mm}">${m} 月</option>`;
    }
    mSel.innerHTML = mOpts;

    document.getElementById('pe-batch-date').value = '';
    document.getElementById('pe-batch-amount').value = '';
    document.getElementById('pe-batch-status').value = '';
    document.getElementById('pe-batch-category').value = '';
    document.getElementById('pe-batch-member').value = '';
    document.getElementById('pe-batch-year').value = '';
    document.getElementById('pe-batch-month').value = '';
    fillItemSelect('pe-batch-item', items, '', { includeEmpty: true, emptyText: '— 不修改 —' });
    fillPaymentSelect('pe-batch-payment', payments, { includeEmpty: true, emptyText: '— 不修改 —' });

    openModal('pe-batch-edit-modal');
  }
}
