// ============================================
// income.js — 每月收入（可摺疊輸入 + 明細表格 + 篩選）
// ============================================

import {
  listenMembers, listenIncomeV2, saveIncomeV2, getIncomeOnce,
  listenAllIncome, updateIncomeEntry, removeIncomeEntry,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { renderPageFilter } from './page-filter.js';
import { AppState } from './state.js';

let members = [];
let allIncome = [];
let currentIncome = {};
let unsubscribeIncome = null;
let filters = { year: '', month: '', member: '' };

export function initIncomePage() {
  renderPageFilter({
    containerId: 'page-filter-root',
    fields: ['year', 'month'],
    renderExtra: () => `
      <div class="filter-group">
        <label class="field-label">成員</label>
        <select class="select" data-filter="member">
          <option value="">全部</option>
          <option value="extra">額外收入</option>
          ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>
    `,
    onChange: (f) => {
      filters = {
        year: f.year || '',
        month: f.month === 'all' ? '' : (f.month || ''),
        member: f.member || '',
      };
      renderIncomeTable();
    },
  });
  // ... 其餘不變（表單內年月保持獨立）
}

  const container = document.getElementById('member-inputs');
  const extraInput = document.getElementById('income-extra');
  const form = document.getElementById('income-form');
  const statusEl = document.getElementById('income-status');
  const formYearSel = document.getElementById('income-form-year');
  const formMonthSel = document.getElementById('income-form-month');
  const resetBtn = document.getElementById('income-reset-btn');

  bindCollapsibleInputCard();
  initFormYearMonthOptions();
  initFilterOptions();

  // 監聽成員
  listenMembers((list) => {
    members = list;
    renderMemberInputs(container);
    renderFilterMemberOptions();
    applyIncomeToInputs();
  });

  // 監聽所有收入（跨年跨月）
  listenAllIncome((list) => {
    allIncome = list;
    renderIncomeTable();
  });

  // 表單年月變更 → 重新載入該月收入
  formYearSel.addEventListener('change', () => loadFormIncome());
  formMonthSel.addEventListener('change', () => loadFormIncome());

  // 表單提交
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (members.length === 0) return;

    const targetYear = formYearSel.value;
    const targetMonth = formMonthSel.value;

    const payload = {};
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input) payload[m.id] = Number(input.value) || 0;
    });
    payload.extra = Number(extraInput.value) || 0;

    try {
      await saveIncomeV2(targetYear, targetMonth, payload);

      // 同步 AppState
      AppState.setYearMonth(targetYear, targetMonth);

      // 收起表單
      const card = document.getElementById('income-input-card');
      const body = document.getElementById('income-input-body');
      if (card && body) {
        card.classList.remove('open');
        body.style.display = 'none';
        localStorage.setItem('income-input-open', 'false');
      }

      statusEl.textContent = '✅ 收入已儲存';
      statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      statusEl.textContent = '❌ 儲存失敗：' + err.message;
      statusEl.style.display = 'block';
    }
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    const { year, month } = AppState.getYearMonth();
    formYearSel.value = year;
    formMonthSel.value = month === 'all' ? '01' : month;
    extraInput.value = '';
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input) input.value = '';
    });
  });

  // 年度明細彈窗
  document.getElementById('view-annual-income-btn').addEventListener('click', () => openDetailModal());
  document.getElementById('income-detail-cancel-btn').addEventListener('click', () => document.getElementById('income-detail-modal').classList.remove('active'));
  document.getElementById('income-detail-save-btn').addEventListener('click', async () => {
    const rows = document.querySelectorAll('.income-detail-row');
    const year = filters.year || AppState.year;
    const promises = [];
    rows.forEach((row) => {
      const month = row.dataset.month;
      const payload = {};
      members.forEach((m) => {
        const input = row.querySelector(`.inc-${m.id}`);
        if (input) payload[m.id] = Number(input.value) || 0;
      });
      payload.extra = Number(row.querySelector('.inc-extra').value) || 0;
      promises.push(saveIncomeV2(year, month, payload));
    });
    try {
      await Promise.all(promises);
      alert('✅ 已批次更新年度收入');
      document.getElementById('income-detail-modal').classList.remove('active');
    } catch (err) {
      alert('批次更新失敗：' + err.message);
    }
  });

  // 篩選
  document.getElementById('filter-year').addEventListener('change', (e) => { filters.year = e.target.value; renderIncomeTable(); });
  document.getElementById('filter-month').addEventListener('change', (e) => { filters.month = e.target.value; renderIncomeTable(); });
  document.getElementById('filter-member').addEventListener('change', (e) => { filters.member = e.target.value; renderIncomeTable(); });
  document.getElementById('filter-clear-btn').addEventListener('click', () => {
    filters = { year: '', month: '', member: '' };
    document.getElementById('filter-year').value = '';
    document.getElementById('filter-month').value = '';
    document.getElementById('filter-member').value = '';
    renderIncomeTable();
  });

    // 🆕 v93：監聽頁面年月切換，同步篩選欄
  AppState.on('ym-change', ({ year, month }) => {
    // 篩選欄年份跟隨
    const filterYearSel = document.getElementById('filter-year');
    if (filterYearSel && filterYearSel.value !== String(year)) {
      filterYearSel.value = String(year);
      filters.year = String(year);
    }
    // 篩選欄月份：若頁面切到「全年」，篩選欄設為「全部」；否則同步該月
    const filterMonthSel = document.getElementById('filter-month');
    if (filterMonthSel) {
      if (month === 'all') {
        filterMonthSel.value = '';
        filters.month = '';
      } else {
        filterMonthSel.value = String(month);
        filters.month = String(month);
      }
    }
    renderIncomeTable();
  });

  // 表格操作
  document.getElementById('income-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { year, month, member: memberId } = btn.dataset;

    if (btn.dataset.action === 'edit') {
      openEditModal(year, month, memberId);
    } else if (btn.dataset.action === 'delete') {
      const memberName = memberId === 'extra' ? '額外收入' : (members.find((m) => m.id === memberId)?.name || '（未知）');
      if (confirm(`確定要刪除 ${year} 年 ${month} 月的「${memberName}」收入嗎？`)) {
        await removeIncomeEntry(year, month, memberId);
      }
    }
  });

  // 編輯 Modal
  document.getElementById('income-edit-cancel-btn').addEventListener('click', () => document.getElementById('income-edit-modal').classList.remove('active'));

  document.getElementById('income-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldYear = document.getElementById('income-edit-old-year').value;
    const oldMonth = document.getElementById('income-edit-old-month').value;
    const oldMember = document.getElementById('income-edit-old-member').value;
    const newYear = document.getElementById('income-edit-year').value;
    const newMonth = document.getElementById('income-edit-month').value;
    const amount = Math.round(Number(document.getElementById('income-edit-amount').value) || 0);

    // 若年月有變 → 先刪除舊記錄，再寫入新記錄
    if (newYear !== oldYear || newMonth !== oldMonth) {
      await removeIncomeEntry(oldYear, oldMonth, oldMember);
    }
    await updateIncomeEntry(newYear, newMonth, oldMember, amount);

    document.getElementById('income-edit-modal').classList.remove('active');
    showToast('✅ 已更新收入');
  });

  /* ============================================
     初始化表單年月
     ============================================ */
  function initFormYearMonthOptions() {
    const now = new Date();
    const curY = now.getFullYear();
    const { year: stateYear, month: stateMonth } = AppState.getYearMonth();

    let yOpts = '';
    for (let y = curY - 5; y <= curY + 5; y++) yOpts += `<option value="${y}">${y} 年</option>`;
    formYearSel.innerHTML = yOpts;

    let mOpts = '';
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    formMonthSel.innerHTML = mOpts;

    formYearSel.value = stateYear || curY;
    formMonthSel.value = stateMonth === 'all' ? '01' : (stateMonth || '01');

    loadFormIncome();
  }

  function initFilterOptions() {
    const now = new Date();
    const curY = now.getFullYear();
    const { year: stateYear } = AppState.getYearMonth();

    const ySel = document.getElementById('filter-year');
    let yOpts = '<option value="">全部</option>';
    for (let y = curY - 5; y <= curY + 5; y++) yOpts += `<option value="${y}">${y} 年</option>`;
    ySel.innerHTML = yOpts;
    ySel.value = stateYear || curY;
    filters.year = ySel.value;

    const mSel = document.getElementById('filter-month');
    let mOpts = '<option value="">全部</option>';
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    mSel.innerHTML = mOpts;
  }

  function renderFilterMemberOptions() {
    const sel = document.getElementById('filter-member');
    const cur = sel.value;
    sel.innerHTML = `<option value="">全部</option>` +
      `<option value="extra">額外收入</option>` +
      members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (cur) sel.value = cur;
  }

  /* ============================================
     表單載入
     ============================================ */
  async function loadFormIncome() {
    const year = formYearSel.value;
    const month = formMonthSel.value;
    if (!year || !month) return;

    try {
      currentIncome = await getIncomeOnce(year, month) || {};
    } catch (err) {
      currentIncome = {};
    }

    extraInput.value = currentIncome.extra ?? '';
    applyIncomeToInputs();
  }

  function applyIncomeToInputs() {
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input && currentIncome[m.id] != null) input.value = currentIncome[m.id];
    });
  }

  function renderMemberInputs(container) {
    if (!members.length) {
      container.innerHTML = `<div class="empty-state" style="padding:20px;">尚無成員，請先至「管理成員」新增。</div>`;
      return;
    }
    container.innerHTML = members.map((m) => `
      <div class="member-input-row">
        <div class="member-label">${escapeHtml(m.name)}</div>
        <input class="member-input" id="income-${m.id}" type="number" min="0" step="0.01" placeholder="0">
      </div>
    `).join('');
  }

  /* ============================================
     收入明細表格
     ============================================ */
  function renderIncomeTable() {
    const tbody = document.getElementById('income-tbody');
    const countEl = document.getElementById('income-total-count');

    const filtered = allIncome.filter((x) => {
      if (filters.year && x.year !== filters.year) return false;
      if (filters.month && x.month !== filters.month) return false;
      if (filters.member && x.memberId !== filters.member) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (a.year !== b.year) return b.year.localeCompare(a.year);
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      if (a.memberId === 'extra') return 1;
      if (b.memberId === 'extra') return -1;
      return 0;
    });

    if (countEl) countEl.textContent = `（共 ${filtered.length} 筆）`;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">沒有符合條件的收入紀錄</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((x) => {
      const memberName = x.memberId === 'extra'
        ? '<span class="badge badge-info">額外收入</span>'
        : escapeHtml(members.find((m) => m.id === x.memberId)?.name || '（未知）');

      return `
        <tr>
          <td class="income-ym-cell">${x.year}</td>
          <td class="income-ym-cell">${x.month}</td>
          <td>${memberName}</td>
          <td class="num text-emerald">${formatHKD(x.amount)}</td>
          <td>
            <button class="btn btn-sm btn-ghost" data-action="edit" data-year="${x.year}" data-month="${x.month}" data-member="${x.memberId}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-year="${x.year}" data-month="${x.month}" data-member="${x.memberId}">刪除</button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  /* ============================================
     年度明細彈窗
     ============================================ */
  async function openDetailModal() {
    const year = filters.year || AppState.year;
    document.getElementById('income-detail-title').textContent = `${year} 年度收入明細`;
    const body = document.getElementById('income-detail-body');

    let header = '<tr><th style="padding:8px; border-bottom:1px solid var(--glass-border);">月份</th>';
    members.forEach((m) => { header += `<th style="padding:8px; text-align:right; border-bottom:1px solid var(--glass-border);">${escapeHtml(m.name)}</th>`; });
    header += '<th style="padding:8px; text-align:right; border-bottom:1px solid var(--glass-border);">額外</th></tr>';

    let rows = '';
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const data = await getIncomeOnce(year, monthStr);
      let row = `<tr class="income-detail-row" data-month="${monthStr}"><td style="padding:4px; font-family:var(--font-mono); font-size:12px;">${m}月</td>`;
      members.forEach((mem) => { row += `<td style="padding:4px;"><input type="number" class="input inc-${mem.id}" value="${data[mem.id] || 0}" min="0" step="1" style="width:100%; padding:4px 8px; font-size:12px;"></td>`; });
      row += `<td style="padding:4px;"><input type="number" class="input inc-extra" value="${data.extra || 0}" min="0" step="1" style="width:100%; padding:4px 8px; font-size:12px;"></td></tr>`;
      rows += row;
    }

    body.innerHTML = `<table style="width:100%; border-collapse:collapse; min-width:600px;"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
    document.getElementById('income-detail-modal').classList.add('active');
  }

  /* ============================================
     編輯 Modal
     ============================================ */
  function openEditModal(year, month, memberId) {
    const memberName = memberId === 'extra' ? '額外收入' : (members.find((m) => m.id === memberId)?.name || '（未知）');
    const entry = allIncome.find((x) => x.year === year && x.month === month && x.memberId === memberId);

    document.getElementById('income-edit-old-year').value = year;
    document.getElementById('income-edit-old-month').value = month;
    document.getElementById('income-edit-old-member').value = memberId;
    document.getElementById('income-edit-member-name').value = memberName;

    const ySel = document.getElementById('income-edit-year');
    const mSel = document.getElementById('income-edit-month');
    const now = new Date();
    const curY = now.getFullYear();
    let yOpts = '';
    for (let y = curY - 5; y <= curY + 5; y++) yOpts += `<option value="${y}">${y} 年</option>`;
    ySel.innerHTML = yOpts;
    let mOpts = '';
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    mSel.innerHTML = mOpts;

    ySel.value = year;
    mSel.value = month;
    document.getElementById('income-edit-amount').value = entry ? entry.amount : 0;

    document.getElementById('income-edit-modal').classList.add('active');
  }

  /* ============================================
     摺疊輸入卡片
     ============================================ */
  function bindCollapsibleInputCard() {
    const card = document.getElementById('income-input-card');
    const header = document.getElementById('income-input-header');
    const body = document.getElementById('income-input-body');
    if (!card || !header || !body) return;

    const savedOpen = localStorage.getItem('income-input-open') === 'true';
    if (savedOpen) {
      card.classList.add('open');
      body.style.display = 'block';
    }

    header.addEventListener('click', () => {
      const isOpen = card.classList.toggle('open');
      body.style.display = isOpen ? 'block' : 'none';
      localStorage.setItem('income-input-open', String(isOpen));
      if (window.lucide) window.lucide.createIcons();
    });
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
