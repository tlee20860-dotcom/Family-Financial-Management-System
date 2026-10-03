// ============================================
// member-detail.js — 成員個人版面邏輯
// ============================================

import {
  getMembersOnce, listenExpenses, addExpense, updateExpense, removeExpense,
  listenCategories, listenItems, addFixedTemplate,
} from './db.js';
import { formatHKD, todayISO, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let memberId = null;
let memberName = '';
let expenses = [];
let categories = [];
let items = [];
let editingId = null;
let unsubscribeExpenses = null;

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
      memberName = me.name;
      nameEl.textContent = me.name;
      document.title = `${me.name} | 家庭財務`;
    } else {
      nameEl.textContent = '（成員已不存在）';
    }
  } catch (e) {
    console.warn('讀取成員失敗', e);
    nameEl.textContent = '（無法讀取成員）';
  }

  // 載入類別與項目
  listenCategories((list) => {
    categories = list;
    renderCategoryOptions();
  });
  listenItems((list) => {
    items = list;
    renderItemOptions();
  });

  bindEvents();
  await loadExpenses();

  AppState.on('ym-change', () => {
    loadExpenses();
  });
}

async function loadExpenses() {
  const { year, month } = AppState.getYearMonth();
  document.getElementById('expense-month-label').textContent = `${year} 年 ${month} 月`;

  if (unsubscribeExpenses) unsubscribeExpenses();
  unsubscribeExpenses = listenExpenses(year, month, memberId, (list) => {
    expenses = list;
    renderExpenses();
  });
}

function renderCategoryOptions() {
  const sel = document.getElementById('expense-category-input');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— 請選擇類別 —</option>` +
    categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (current) sel.value = current;
}

function renderItemOptions() {
  const sel = document.getElementById('expense-item-input');
  if (!sel) return;
  const catId = document.getElementById('expense-category-input').value;

  if (!catId) {
    sel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
    return;
  }

  const filtered = items.filter((i) => i.categoryId === catId);
  sel.innerHTML = `<option value="">— 請選擇項目 —</option>` +
    filtered.map((i) => `<option value="${i.id}" data-name="${escapeHtml(i.name)}">${escapeHtml(i.name)}</option>`).join('');
}

function bindEvents() {
  const modal = document.getElementById('expense-modal');
  const modalTitle = document.getElementById('expense-modal-title');
  const form = document.getElementById('expense-form');
  const categorySel = document.getElementById('expense-category-input');
  const itemSel = document.getElementById('expense-item-input');
  const amountInput = document.getElementById('expense-amount-input');
  const dateInput = document.getElementById('expense-date-input');
  const memberInput = document.getElementById('expense-member-input');
  const fixedCheck = document.getElementById('expense-fixed-input');

  document.getElementById('add-expense-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增支出';
    form.reset();
    dateInput.value = todayISO();
    memberInput.value = memberName;
    fixedCheck.checked = false;
    renderItemOptions();
    modal.classList.add('active');
    setTimeout(() => dateInput.focus(), 50);
  });

  document.getElementById('expense-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // 類別改變 ➜ 更新項目下拉
  categorySel.addEventListener('change', renderItemOptions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { year, month } = AppState.getYearMonth();

    const catId = categorySel.value;
    const itemId = itemSel.value;
    const catName = categories.find((c) => c.id === catId)?.name || '';
    const itemName = items.find((i) => i.id === itemId)?.name || '';

    // 組合顯示名稱：類別 / 項目
    const displayName = itemName || catName || '未命名支出';

    const payload = {
      name: displayName,
      amount: Number(amountInput.value) || 0,
      status: '未處理',
      date: dateInput.value.trim() || todayISO(),
      categoryId: catId,
      itemId: itemId,
    };

    if (!payload.name || !payload.amount) return;

    if (editingId) {
      await updateExpense(year, month, memberId, editingId, payload);
    } else {
      await addExpense(year, month, memberId, payload);

      // 若勾選「設為固定支出」，寫入模板
      if (fixedCheck.checked) {
        await addFixedTemplate({
          name: displayName,
          categoryId: catId,
          itemId: itemId,
          memberId: memberId,
          amount: payload.amount,
        });
        console.log('✅ 已加入固定支出模板');
      }
    }
    modal.classList.remove('active');
  });

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
      categorySel.value = exp.categoryId || '';
      renderItemOptions();
      itemSel.value = exp.itemId || '';
      amountInput.value = exp.amount || '';
      dateInput.value = exp.date || '';
      memberInput.value = memberName;
      fixedCheck.checked = false;
      fixedCheck.disabled = true;
      modal.classList.add('active');
      setTimeout(() => dateInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除「${exp.name}」嗎？`)) {
        const { year, month } = AppState.getYearMonth();
        await removeExpense(year, month, memberId, id);
      }
    }
  });

  // 每次打開 Modal 時，恢復 fixedCheck 可用
  document.getElementById('add-expense-btn').addEventListener('click', () => {
    fixedCheck.disabled = false;
  });
}

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
