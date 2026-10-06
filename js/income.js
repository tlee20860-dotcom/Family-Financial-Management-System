// ============================================
// income.js — 每月收入（v99.5）
// ============================================

import {
  listenMembers, listenIncomeV2, saveIncomeV2, getIncomeOnce,
  listenAllIncome, updateIncomeEntry, removeIncomeEntry,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { renderPageFilter } from './page-filter.js';
import { showToast } from './toast.js';
import { initCollapsibleCard } from './collapsible-card.js';
import { fillMemberSelect } from './select-helpers.js';
import { fillYearSelect, fillMonthSelect } from './date-helpers.js';
import { openModal, closeModal } from './modal.js';
import { AppState } from './state.js';

let members = [];
let allIncome = [];
let currentIncome = {};
let filters = { year: '', month: '', member: '' };

export function initIncomePage() {
  // 🆕 v99.5：明細表格折疊（預設展開）
  initCollapsibleCard('income-table-card', 'income-table-open', true);

  const container = document.getElementById('member-inputs');
  const extraInput = document.getElementById('income-extra');
  const form = document.getElementById('income-form');
  const statusEl = document.getElementById('income-status');
  const formYearSel = document.getElementById('income-form-year');
  const formMonthSel = document.getElementById('income-form-month');
  const resetBtn = document.getElementById('income-reset-btn');

  /* ============================================
     初始化
     ============================================ */

  // 可摺疊輸入卡片
  const inputCard = initCollapsibleCard('income-input-card', 'income-input-open', false);

  // 表單年月下拉
  fillYearSelect(formYearSel, { defaultValue: AppState.year });
  fillMonthSelect(formMonthSel, {
    defaultValue: AppState.month === 'all' ? '01' : AppState.month,
  });

  // 頁面篩選欄
  renderFilterBar();

  /* ============================================
     資料監聽
     ============================================ */

  listenMembers((list) => {
    members = list;
    renderMemberInputs(container);
    applyIncomeToInputs();
    updateFilterOptions();
  });

  listenAllIncome((list) => {
    allIncome = list;
    renderIncomeTable();
  });

  /* ============================================
     表單：年月變更 → 重新載入該月收入
     ============================================ */

  formYearSel.addEventListener('change', () => loadFormIncome());
  formMonthSel.addEventListener('change', () => loadFormIncome());

  // 初始載入
  loadFormIncome();

  /* ============================================
     表單提交
     ============================================ */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (members.length === 0) return showToast('尚無成員', 'warning');

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
      inputCard?.close();

      statusEl.textContent = '✅ 收入已儲存';
      statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
      if (window.lucide) window.lucide.createIcons();

      showToast(`✅ 已儲存 ${targetYear} 年 ${targetMonth} 月收入`, 'success');
    } catch (err) {
      statusEl.textContent = '❌ 儲存失敗：' + err.message;
      statusEl.style.display = 'block';
      showToast('儲存失敗：' + err.message, 'error');
    }
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    fillYearSelect(formYearSel, { defaultValue: AppState.year });
    fillMonthSelect(formMonthSel, {
      defaultValue: AppState.month === 'all' ? '01' : AppState.month,
    });
    extraInput.value = '';
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input) input.value = '';
    });
  });

  /* ============================================
     年度明細彈窗
     ============================================ */

  document.getElementById('view-annual-income-btn').addEventListener('click', () => openDetailModal());
  document.getElementById('income-detail-cancel-btn').addEventListener('click', () => closeModal('income-detail-modal'));

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
      closeModal('income-detail-modal');
      showToast('✅ 已批次更新年度收入', 'success');
    } catch (err) {
      showToast('批次更新失敗：' + err.message, 'error');
    }
  });

  /* ============================================
     表格：編輯 / 刪除
     ============================================ */

  document.getElementById('income-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { year, month, member: memberId } = btn.dataset;

    if (btn.dataset.action === 'edit') {
      openEditModal(year, month, memberId);
    } else if (btn.dataset.action === 'delete') {
      const memberName = memberId === 'extra'
        ? '額外收入'
        : (members.find((m) => m.id === memberId)?.name || '（未知）');
      if (confirm(`確定要刪除 ${year} 年 ${month} 月的「${memberName}」收入嗎？`)) {
        try {
          await removeIncomeEntry(year, month, memberId);
          showToast('✅ 已刪除', 'success');
        } catch (err) {
          showToast('刪除失敗：' + err.message, 'error');
        }
      }
    }
  });

  /* ============================================
     編輯 Modal
     ============================================ */

  document.getElementById('income-edit-cancel-btn').addEventListener('click', () => closeModal('income-edit-modal'));

  document.getElementById('income-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldYear = document.getElementById('income-edit-old-year').value;
    const oldMonth = document.getElementById('income-edit-old-month').value;
    const oldMember = document.getElementById('income-edit-old-member').value;
    const newYear = document.getElementById('income-edit-year').value;
    const newMonth = document.getElementById('income-edit-month').value;
    const amount = Math.round(Number(document.getElementById('income-edit-amount').value) || 0);

    try {
      // 若年月有變 → 先刪除舊記錄，再寫入新記錄
      if (newYear !== oldYear || newMonth !== oldMonth) {
        await removeIncomeEntry(oldYear, oldMonth, oldMember);
      }
      await updateIncomeEntry(newYear, newMonth, oldMember, amount);

      closeModal('income-edit-modal');
      showToast('✅ 已更新收入', 'success');
    } catch (err) {
      showToast('更新失敗：' + err.message, 'error');
    }
  });

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
  }

  // 當成員清單變更時，更新篩選欄的成員下拉
  function updateFilterOptions() {
    const root = document.getElementById('page-filter-root');
    if (!root) return;
    const memberSel = root.querySelector('select[data-filter="member"]');
    if (memberSel) {
      const cur = memberSel.value;
      memberSel.innerHTML = `<option value="">全部</option>` +
        `<option value="extra">額外收入</option>` +
        members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
      if (cur && (cur === 'extra' || members.some((m) => m.id === cur))) memberSel.value = cur;
    }
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
    members.forEach((m) => {
      header += `<th style="padding:8px; text-align:right; border-bottom:1px solid var(--glass-border);">${escapeHtml(m.name)}</th>`;
    });
    header += '<th style="padding:8px; text-align:right; border-bottom:1px solid var(--glass-border);">額外</th></tr>';

    let rows = '';
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const data = await getIncomeOnce(year, monthStr);
      let row = `<tr class="income-detail-row" data-month="${monthStr}"><td style="padding:4px; font-family:var(--font-mono); font-size:12px;">${m}月</td>`;
      members.forEach((mem) => {
        row += `<td style="padding:4px;"><input type="number" class="input inc-${mem.id}" value="${data[mem.id] || 0}" min="0" step="1" style="width:100%; padding:4px 8px; font-size:12px;"></td>`;
      });
      row += `<td style="padding:4px;"><input type="number" class="input inc-extra" value="${data.extra || 0}" min="0" step="1" style="width:100%; padding:4px 8px; font-size:12px;"></td></tr>`;
      rows += row;
    }

    body.innerHTML = `<table style="width:100%; border-collapse:collapse; min-width:600px;"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
    openModal('income-detail-modal');
  }

  /* ============================================
     編輯 Modal
     ============================================ */

  function openEditModal(year, month, memberId) {
    const memberName = memberId === 'extra'
      ? '額外收入'
      : (members.find((m) => m.id === memberId)?.name || '（未知）');
    const entry = allIncome.find((x) =>
      x.year === year && x.month === month && x.memberId === memberId
    );

    document.getElementById('income-edit-old-year').value = year;
    document.getElementById('income-edit-old-month').value = month;
    document.getElementById('income-edit-old-member').value = memberId;
    document.getElementById('income-edit-member-name').value = memberName;

    fillYearSelect('income-edit-year', { defaultValue: year });
    fillMonthSelect('income-edit-month', { defaultValue: month });

    document.getElementById('income-edit-amount').value = entry ? entry.amount : 0;

    openModal('income-edit-modal');
  }
}
