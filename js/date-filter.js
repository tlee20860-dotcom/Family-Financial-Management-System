// ============================================
// date-filter.js — 獨立的時間篩選欄
// ============================================

import { AppState } from './state.js';

export function renderDateFilter(containerId = 'date-filter-root') {
  const root = document.getElementById(containerId);
  if (!root) return;

  const { year, month } = AppState.getYearMonth();
  const currentYear = Number(year);

  let yearOpts = '';
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    yearOpts += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y} 年</option>`;
  }

  let monthOpts = `<option value="all" ${month === 'all' ? 'selected' : ''}>全年</option>`;
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    monthOpts += `<option value="${mm}" ${mm === month ? 'selected' : ''}>${m} 月</option>`;
  }

  root.innerHTML = `
    <div class="date-filter">
      <i data-lucide="calendar" style="width:16px;height:16px;color:var(--neon-cyan);"></i>
      <select class="select" id="df-year">${yearOpts}</select>
      <select class="select" id="df-month">${monthOpts}</select>
    </div>
  `;

  document.getElementById('df-year').addEventListener('change', (e) => {
    const m = document.getElementById('df-month').value;
    AppState.setYearMonth(e.target.value, m);
  });

  document.getElementById('df-month').addEventListener('change', (e) => {
    const y = document.getElementById('df-year').value;
    AppState.setYearMonth(y, e.target.value);
  });

  if (window.lucide) window.lucide.createIcons();
}
