// ============================================
// expenses.js — 每月總開銷表邏輯
// ============================================

import { api } from './api.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

export async function initExpensesPage() {
  await loadExpenses();

  AppState.on('ym-change', () => {
    loadExpenses();
  });
}

async function loadExpenses() {
  const { year, month } = AppState.getYearMonth();
  const tbody = document.getElementById('expenses-tbody');
  const monthLabel = document.getElementById('expenses-month');

  if (monthLabel) monthLabel.textContent = `${year} 年 ${month} 月`;

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">載入中…</td></tr>`;
  }

  try {
    const data = await api.summary(year, month);
    renderTable(data);
  } catch (err) {
    console.error('每月總開銷載入失敗：', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state text-red">載入失敗，請稍後再試。</td></tr>`;
    }
  }
}

function renderTable(data) {
  const tbody = document.getElementById('expenses-tbody');
  const totalEl = document.getElementById('expenses-total');
  const perMember = data.perMember || {};
  const memberIds = Object.keys(perMember);

  if (totalEl) totalEl.textContent = formatHKD(data.totalExpense);

  if (memberIds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">本月尚無支出紀錄</td></tr>`;
    return;
  }

  tbody.innerHTML = memberIds.map((id) => {
    const m = perMember[id];
    return `
      <tr>
        <td>
          <a href="member-detail.html?id=${id}" class="text-cyan">
            ${escapeHtml(m.memberName)}
          </a>
        </td>
        <td class="num">${m.itemCount} 筆</td>
        <td class="num text-magenta">${formatHKD(m.sum)}</td>
      </tr>
    `;
  }).join('');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
