// ============================================
// member-detail.js — 成員個人版面（全年 / 單月）
// ============================================

import {
  getMembersOnce, listenExpenses, addExpense, updateExpense, removeExpense,
  listenCategories, listenItems, addFixedTemplate,
} from './db.js';
import { formatHKD, todayISO, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

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

  listenCategories((list) => { categories = list; renderCategoryOptions(); });
  listenItems((list) => { items = list; renderItemOptions(); });

  bindEvents();
  initYearMonthSelects();
  await loadData();

  AppState.on('ym-change', () => loadData());
}

async function loadData() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';

  document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
  document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';

  if (isAnnual) {
    await loadAnnual(year);
  } else {
    await loadMonthly(year, month);
  }
}

async function loadAnnual(year) {
  try {
    const data = await api.fetchAnnualSummary(year);
    renderAnnual(data);
  } catch (err) {
    console.error('全年資料載入失敗：', err);
  }
}

function renderAnnual(data) {
  let total = 0;
  const container = document.getElementById('annual-monthly-cards');
  const cards = data.monthly.map((m) => {
    const md = m.perMember[memberId];
    if (!md || md.itemCount === 0) return '';

    total += md.sum;
    const rows = md.items.map((it) => `
      <tr>
        <td>${escapeHtml(it.name)}</td>
        <td style="font-size:11px; color:var(--text-muted);">${escapeHtml(it.categoryName || '—')}</td>
        <td class="mono" style="font-size:11px; color:var(--text-muted);">${escapeHtml(it.date || '—')}</td>
        <td class="num">${formatHKD(it.amount)}</td>
      </tr>
    `).join('');

    return `
      <div class="glass-card" style="margin-bottom:10px; padding:14px;">
        <div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;">
          <div style="font-weight:700; font-size:15px; color:var(--neon-cyan);">${m.monthNum} 月</div>
          <div class="mono text-magenta" style="font-weight:700;">${formatHKD(md.sum)}</div>
        </div>
        <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
          <table class="data-table" style="font-size:12px;">
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  document.getElementById('annual-total').textContent = formatHKD(total);
  container.innerHTML = cards || '<div class="glass-card"><div class="empty-state">本年度尚無支出紀錄</div></div>';

  container.querySelectorAll('.month-toggle').forEach((el) => {
    el.addEventListener('click', () => {
      const d = el.nextElementSibling;
      d.style.display = d.style.display === 'none' ? 'block' : 'none';
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

async function loadMonthly(year, month) {
  document.getElementById('expense-month-label').textContent = `${year} 年 ${month} 月`;
  if (unsubscribeExpenses) unsubscribeExpenses();
  unsubscribeExpenses = listenExpenses(year, month, memberId, (list) => {
    expenses = list;
    renderExpenses();
  });
}

function initYearMonthSelects() {
  const yearSel = document.getElementById('expense-year');
  const monthSel = document.getElementById('expense-month');
  const now = new Date();
  const currentYear = now.getFullYear();

  let yearOpts = '';
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    yearOpts += `<option value="${y}">${y} 年</option>`;
  }
  yearSel.innerHTML = yearOpts;

  let monthOpts = '';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    monthOpts += `<option value="${mm}">${m} 月</option>`;
  }
  monthSel.innerHTML = monthOpts;
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
    filtered.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
}

function bindEvents() {
  const modal = document.getElementById('expense-modal');
  const modalTitle = document.getElementById('expense-modal-title');
  const form = document.getElementById('expense-form');
  const categorySel = document.getElementById('expense-category-input');
  const itemSel = document.getElementById('expense-item-input');
  const amountInput = document.getElementById('expense-amount-input');
  const dateInput = document.getElementById('expense-date-input');
  const statusSel = document.getElementById('expense-status-input');
  const memberInput = document.getElementById('expense-member-input');
  const fixedCheck = document.getElementById('expense-fixed-input');
  const yearSel = document.getElementById('expense-year');
  const monthSel = document.getElementById('expense-month');

  document.getElementById('add-expense-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增支出';
    form.reset();
    const { year, month } = AppState.getYearMonth();
    yearSel.value = year;
    monthSel.value = month === 'all' ? String(new Date().getMonth() + 1).padStart(2, '0') : month;
    dateInput.value = todayISO();
    statusSel.value = '未處理';
    memberInput.value = memberName;
    fixedCheck.checked = false;
    fixedCheck.disabled = false;
    renderItemOptions();
    modal.classList.add('active');
    setTimeout(() => dateInput.focus(), 50);
  });

  document.getElementById('expense-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // 在 bindEvents 函式中，找到這一行：
  categorySel.addEventListener('change', renderItemOptions);

// 在它下方加入：
  // 🆕 新增項目按鈕
  document.getElementById('add-expense-item-btn').addEventListener('click', async () => {
    const catId = categorySel.value;
    if (!catId) {
      alert('請先選擇一個類別，再新增項目。');
      return;
    }
    const name = prompt('請輸入新項目名稱（例如：看病-濕疹）：');
    if (!name || !name.trim()) return;

    try {
      const { addItem } = await import('./db.js');
      await addItem({ name: name.trim(), categoryId: catId });
      // 等待 items 更新後自動選中
      setTimeout(() => {
        const newItem = items.find((i) => i.name === name.trim() && i.categoryId === catId);
        if (newItem) {
          itemSel.value = newItem.id;
        }
      }, 500);
    } catch (err) {
      alert('新增項目失敗：' + err.message);
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const targetYear = yearSel.value;
    const targetMonth = monthSel.value;

    const catId = categorySel.value;
    const itemId = itemSel.value;
    const catName = categories.find((c) => c.id === catId)?.name || '';
    const itemName = items.find((i) => i.id === itemId)?.name || '';
    const displayName = itemName || catName || '未命名支出';

    const payload = {
      name: displayName,
      amount: Number(amountInput.value) || 0,
      status: statusSel.value,
      date: dateInput.value.trim() || todayISO(),
      categoryId: catId,
      itemId: itemId,
    };

    if (!payload.name || !payload.amount) return;

    if (editingId) {
      await updateExpense(targetYear, targetMonth, memberId, editingId, payload);
    } else {
      await addExpense(targetYear, targetMonth, memberId, payload);

      if (fixedCheck.checked) {
        await addFixedTemplate({
          name: displayName,
          categoryId: catId,
          itemId: itemId,
          memberId: memberId,
          amount: payload.amount,
        });
      }
    }

    modal.classList.remove('active');
    // ✅ 僅彈出提示，不跳轉
    showToast(`✅ 已錄入 ${targetYear} 年 ${targetMonth} 月`);
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
      const { year, month } = AppState.getYearMonth();
      yearSel.value = year;
      monthSel.value = month === 'all' ? String(new Date().getMonth() + 1).padStart(2, '0') : month;
      categorySel.value = exp.categoryId || '';
      renderItemOptions();
      itemSel.value = exp.itemId || '';
      amountInput.value = exp.amount || '';
      dateInput.value = exp.date || '';
      statusSel.value = exp.status || '未處理';
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
    let statusBadge = '';
    if (x.status === '已還款' || x.status === '已處理') {
      statusBadge = `<span class="badge badge-success">${escapeHtml(x.status)}</span>`;
    } else if (x.status === '未還款' || x.status === '未處理') {
      statusBadge = `<span class="badge badge-pending">${escapeHtml(x.status)}</span>`;
    } else {
      statusBadge = `<span class="badge badge-pending">${escapeHtml(x.status || '未處理')}</span>`;
    }

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

  if (window.lucide) window.lucide.createIcons();
}

/* Toast 提示 */
function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: rgba(16, 185, 129, 0.95); color: #fff;
      padding: 12px 22px; border-radius: 8px; font-size: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4); z-index: 99999;
      opacity: 0; transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
