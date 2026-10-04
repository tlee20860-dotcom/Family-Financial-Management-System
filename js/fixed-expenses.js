// ============================================
// fixed-expenses.js — 家庭固定支出（含類別與項目連動）
// ============================================

import {
  listenFixedExpensesV2, addFixedExpenseV2, updateFixedExpenseV2, removeFixedExpenseV2,
  copyFixedExpensesFromPrevMonth, getFixedExpensesOnce,
  listenCategories, listenItems, addItem,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let list = [];
let categories = [];
let items = [];
let editingId = null;
let unsubscribe = null;
let lastLoadedYM = '';

export function initFixedExpensesPage() {
  const tbody = document.getElementById('fixed-tbody');
  const modal = document.getElementById('fixed-modal');
  const modalTitle = document.getElementById('fixed-modal-title');
  const form = document.getElementById('fixed-form');

  const yearSel = document.getElementById('fixed-year');
  const monthSel = document.getElementById('fixed-form-month');
  const categorySel = document.getElementById('fixed-category');
  const itemSel = document.getElementById('fixed-item');
  const amountInput = document.getElementById('fixed-amount');
  const cycleSelect = document.getElementById('fixed-cycle');
  const noteInput = document.getElementById('fixed-note');
  const addItemBtn = document.getElementById('add-fixed-item-btn');

  // 初始化年份 / 月份下拉
  const now = new Date();
  const currentYear = now.getFullYear();
  let yearOpts = '';
  for (let y = currentYear - 5; y <= currentYear + 5; y++) yearOpts += `<option value="${y}">${y} 年</option>`;
  yearSel.innerHTML = yearOpts;
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;

  // 監聽類別與項目
  listenCategories((cats) => {
    categories = cats;
    renderCategoryOptions();
  });
  listenItems((list) => {
    items = list;
    renderItemOptions();
  });

  // 類別改變時更新項目
  categorySel.addEventListener('change', renderItemOptions);

  // 新增項目按鈕
  addItemBtn.addEventListener('click', async () => {
    const catId = categorySel.value;
    if (!catId) {
      alert('請先選擇一個類別，再新增項目。');
      return;
    }
    const name = prompt('請輸入新項目名稱（例如：水費）：');
    if (!name || !name.trim()) return;

    try {
      await addItem({ name: name.trim(), categoryId: catId });
      // 重新載入項目後自動選中
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

  const loadAll = async () => {
    const { year, month } = AppState.getYearMonth();
    const isAnnual = month === 'all';

    document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
    document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';
    document.getElementById('fixed-month').textContent = isAnnual
      ? `${year} 年 全年總覽`
      : `${year} 年 ${month} 月`;

    if (isAnnual) {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      await loadAnnual(year);
    } else {
      const ymKey = `${year}-${month}`;
      if (lastLoadedYM === ymKey && unsubscribe) return;
      lastLoadedYM = ymKey;

      try {
        const copied = await copyFixedExpensesFromPrevMonth(year, month);
        if (copied > 0) console.log(`✅ 已從上個月帶入 ${copied} 筆`);
      } catch (err) { console.warn('從上月複製失敗：', err); }

      if (unsubscribe) unsubscribe();
      unsubscribe = listenFixedExpensesV2(year, month, (l) => {
        list = l;
        renderMonthly();
      });
    }
  };

  loadAll();
  AppState.on('ym-change', () => {
    lastLoadedYM = '';
    loadAll();
  });

  document.getElementById('add-fixed-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增固定支出';
    form.reset();
    const { year, month } = AppState.getYearMonth();
    yearSel.value = year;
    monthSel.value = month === 'all'
      ? String(new Date().getMonth() + 1).padStart(2, '0')
      : month;
    categorySel.value = '';
    itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
    modal.classList.add('active');
  });

  document.getElementById('fixed-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetYear = yearSel.value;
    const targetMonth = monthSel.value;

    const catId = categorySel.value;
    const itemId = itemSel.value;
    const itemName = items.find((i) => i.id === itemId)?.name || '';

    const payload = {
      name: itemName || '未命名支出',
      amount: Number(amountInput.value) || 0,
      cycle: cycleSelect.value,
      note: noteInput.value.trim(),
      categoryId: catId,
      itemId: itemId,
    };
    if (!payload.name || !payload.amount) return;

    if (editingId) {
      await updateFixedExpenseV2(targetYear, targetMonth, editingId, payload);
    } else {
      await addFixedExpenseV2(targetYear, targetMonth, payload);
    }
    modal.classList.remove('active');
    showToast(`✅ 已錄入 ${targetYear} 年 ${targetMonth} 月`);
  });

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
      const { year, month } = AppState.getYearMonth();
      yearSel.value = year;
      monthSel.value = month;
      categorySel.value = x.categoryId || '';
      renderItemOptions();
      itemSel.value = x.itemId || '';
      amountInput.value = x.amount || '';
      cycleSelect.value = x.cycle || '每月';
      noteInput.value = x.note || '';
      modal.classList.add('active');
    } else if (action === 'delete') {
      if (confirm(`確定要刪除「${x.name}」嗎？（僅刪除本月）`)) {
        const { year, month } = AppState.getYearMonth();
        await removeFixedExpenseV2(year, month, id);
      }
    }
  });

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
      await updateFixedExpenseV2(year, month, id, { isSkipped: el.checked });
    }
  });

  function renderCategoryOptions() {
    const current = categorySel.value;
    categorySel.innerHTML = `<option value="">— 請選擇類別 —</option>` +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (current) categorySel.value = current;
  }

  function renderItemOptions() {
    const catId = categorySel.value;
    if (!catId) {
      itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
      return;
    }
    const filtered = items.filter((i) => i.categoryId === catId);
    itemSel.innerHTML = `<option value="">— 請選擇項目 —</option>` +
      filtered.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  }

  async function loadAnnual(year) {
    try {
      const promises = [];
      for (let m = 1; m <= 12; m++) {
        promises.push(getFixedExpensesOnce(year, String(m).padStart(2, '0')));
      }
      const results = await Promise.all(promises);
      renderAnnual(year, results);
    } catch (err) {
      console.error('全年固定支出載入失敗：', err);
    }
  }

  function renderAnnual(year, monthlyLists) {
    let totalAll = 0;
    let pendingAll = 0;

    const container = document.getElementById('annual-monthly-cards');
    const cards = monthlyLists.map((list, i) => {
      const monthNum = i + 1;
      const activeList = list.filter((x) => !x.isSkipped);
      const monthTotal = activeList.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const monthPending = activeList.filter((x) => x.status !== '已付款').length;
      totalAll += monthTotal;
      pendingAll += monthPending;

      const rows = list.length === 0
        ? '<div style="font-size:12px; color:var(--text-muted);">本月無固定支出</div>'
        : list.map((x) => {
          const isPaid = x.status === '已付款';
          const isSkipped = !!x.isSkipped;
          const lineStyle = isSkipped ? 'opacity:0.4; text-decoration:line-through;' : '';
          const badge = isSkipped
            ? '<span class="badge badge-info">不適用</span>'
            : (isPaid ? '<span class="badge badge-success">已付款</span>' : '<span class="badge badge-pending">未付款</span>');
          return `
            <div style="display:flex; justify-content:space-between; padding:6px 0; ${lineStyle}">
              <span>${escapeHtml(x.name)}</span>
              <span style="display:flex; gap:10px; align-items:center;">
                <span class="mono">${formatHKD(x.amount)}</span>
                ${badge}
              </span>
            </div>
          `;
        }).join('');

      return `
        <div class="glass-card" style="margin-bottom:10px; padding:14px;">
          <div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;">
            <div style="font-weight:700; font-size:15px; color:var(--neon-cyan);">${monthNum} 月</div>
            <div class="mono text-red" style="font-weight:700;">${formatHKD(monthTotal)}</div>
          </div>
          <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
            ${rows}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('annual-fixed-total').textContent = formatHKD(totalAll);
    document.getElementById('annual-fixed-pending').textContent = `${pendingAll} 筆`;
    container.innerHTML = cards;

    container.querySelectorAll('.month-toggle').forEach((el) => {
      el.addEventListener('click', () => {
        const d = el.nextElementSibling;
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderMonthly() {
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
        : (isPaid ? '<span class="badge badge-success">已付款</span>' : '<span class="badge badge-pending">未付款</span>');

      return `
        <tr style="${rowStyle}">
          <td>${escapeHtml(x.name)}${x.note ? `<div class="glass-card-hint" style="margin-top:4px;">${escapeHtml(x.note)}</div>` : ''}</td>
          <td class="num">${formatHKD(x.amount)}</td>
          <td>${escapeHtml(x.cycle || '每月')}</td>
          <td>${statusBadge}</td>
          <td><input type="checkbox" ${isPaid ? 'checked' : ''} ${isSkipped ? 'disabled' : ''} data-action="toggle-paid" data-id="${x.id}" style="width:auto; cursor:pointer;"></td>
          <td><input type="checkbox" ${isSkipped ? 'checked' : ''} data-action="toggle-skip" data-id="${x.id}" style="width:auto; cursor:pointer;"></td>
          <td>
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${x.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${x.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
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
