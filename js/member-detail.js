// ============================================
// member-detail.js — 成員個人版面（純顯示）
// ============================================

import { getMembersOnce, listenExpenses } from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { renderPageFilter } from './page-filter.js';
import { AppState } from './state.js';
import { api } from './api.js';

let memberId = null;
let memberName = '';
let expenses = [];
let unsubscribeExpenses = null;

export async function initMemberDetailPage(id) {
  renderPageFilter({
    containerId: 'page-filter-root',
    fields: ['year', 'month'],
    onChange: () => loadData(),
  });

  memberId = id;

  if (!AppState.getFamilyId()) {
    document.getElementById('member-name').textContent = '錯誤：未選擇家庭';
    document.getElementById('expense-tbody').innerHTML = '<tr><td colspan="4" class="empty-state text-red">無法取得家庭資訊，請重新登入。</td></tr>';
    return;
  }

  const nameEl = document.getElementById('member-name');
  const idLabel = document.getElementById('member-id-label');
  if (idLabel) idLabel.textContent = `ID：${memberId}`;

  try {
    const members = await getMembersOnce();
    const me = members.find((m) => m.id === memberId);
    if (me) {
      memberName = me.name;
      if (nameEl) nameEl.textContent = me.name;
      document.title = `${me.name} | 家庭財務`;
    } else {
      if (nameEl) nameEl.textContent = '（成員已不存在）';
    }
  } catch (e) {
    if (nameEl) nameEl.textContent = '（無法讀取成員）';
  }

  await loadData();
  AppState.on('ym-change', () => loadData());
}

async function loadData() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';

  const annualView = document.getElementById('annual-view');
  const monthlyView = document.getElementById('monthly-view');
  if (annualView) annualView.style.display = isAnnual ? 'block' : 'none';
  if (monthlyView) monthlyView.style.display = isAnnual ? 'none' : 'block';

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
    const container = document.getElementById('annual-monthly-cards');
    if (container) container.innerHTML = `<div class="glass-card"><div class="empty-state text-red">載入失敗：${escapeHtml(err.message)}</div></div>`;
  }
}

function renderAnnual(data) {
  let total = 0;
  const container = document.getElementById('annual-monthly-cards');
  if (!container) return;

  if (!data || !data.monthly || data.monthly.length === 0) {
    container.innerHTML = '<div class="glass-card"><div class="empty-state">本年度尚無支出紀錄</div></div>';
    return;
  }

  const cards = data.monthly.map((m) => {
    const md = m.perMember ? m.perMember[memberId] : null;
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

  const totalEl = document.getElementById('annual-total');
  if (totalEl) totalEl.textContent = formatHKD(total);
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
  const monthLabel = document.getElementById('expense-month-label');
  if (monthLabel) monthLabel.textContent = `${year} 年 ${month} 月`;

  if (unsubscribeExpenses) unsubscribeExpenses();
  unsubscribeExpenses = listenExpenses(year, month, memberId, (list) => {
    expenses = list;
    renderExpenses();
  });
}

function renderExpenses() {
  const tbody = document.getElementById('expense-tbody');
  if (!tbody) return;

  const total = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalEl = document.getElementById('expense-total');
  if (totalEl) totalEl.textContent = formatHKD(total);

  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">尚無支出紀錄</td></tr>`;
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

    const autoBadge = x.isAutoLinked ? '<span class="badge badge-info" style="margin-left:6px;">保險連動</span>' : '';

    return `
      <tr>
        <td>${escapeHtml(x.name)}${autoBadge}</td>
        <td class="num">${formatHKD(x.amount)}</td>
        <td>${statusBadge}</td>
        <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(x.date || '—')}</td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}
