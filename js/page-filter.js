// ============================================
// page-filter.js — 全站共用的頁面篩選欄
// ============================================

import { AppState } from './state.js';
import { escapeHtml } from './utils.js';

/**
 * 渲染頁面篩選欄（自動注入到指定容器）
 *
 * @param {Object} options
 * @param {string} options.containerId - 容器 ID（預設 'page-filter-root'）
 * @param {string[]} options.fields - 要顯示哪些基本篩選：['year', 'month']
 * @param {Function} options.onChange - 篩選變更回呼 (filters) => {}
 * @param {Function} options.renderExtra - 額外欄位 HTML 產生器（可選）() => string
 * @param {boolean} options.includeAllMonth - 月份是否含「全年」（預設 true）
 * @param {number} options.yearRange - 年份範圍 ±N（預設 5）
 * @param {boolean} options.syncAppState - 是否同步 AppState（預設 true）
 */
export function renderPageFilter(options = {}) {
  const {
    containerId = 'page-filter-root',
    fields = ['year', 'month'],
    onChange,
    renderExtra,
    includeAllMonth = true,
    yearRange = 5,
    syncAppState = true,
  } = options;

  const root = document.getElementById(containerId);
  if (!root) {
    console.warn(`⚠️ renderPageFilter: 找不到容器 #${containerId}`);
    return null;
  }

  const now = new Date();
  const curY = now.getFullYear();
  const { year: stateYear, month: stateMonth } = AppState.getYearMonth();

  const parts = [];

  if (fields.includes('year')) {
    let opts = '';
    for (let y = curY - yearRange; y <= curY + yearRange; y++) {
      const sel = String(y) === String(stateYear) ? 'selected' : '';
      opts += `<option value="${y}" ${sel}>${y} 年</option>`;
    }
    parts.push(`
      <div class="filter-group">
        <label class="field-label">年份</label>
        <select class="select" data-filter="year">${opts}</select>
      </div>
    `);
  }

  if (fields.includes('month')) {
    let opts = includeAllMonth ? `<option value="all">全部</option>` : '';
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const sel = mm === String(stateMonth) ? 'selected' : '';
      opts += `<option value="${mm}" ${sel}>${m} 月</option>`;
    }
    parts.push(`
      <div class="filter-group">
        <label class="field-label">月份</label>
        <select class="select" data-filter="month">${opts}</select>
      </div>
    `);
  }

  if (typeof renderExtra === 'function') {
    const extra = renderExtra();
    if (extra) parts.push(extra);
  }

  root.innerHTML = `<div class="page-filter-bar">${parts.join('')}</div>`;

  // 綁定所有 select[data-filter] 的 change 事件
  root.querySelectorAll('select[data-filter]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const filters = collectFilters(root);
      if (syncAppState && filters.year && filters.month) {
        AppState.setYearMonth(filters.year, filters.month);
      }
      if (typeof onChange === 'function') onChange(filters);
    });
  });

  // 監聽 AppState 變更（表單儲存後同步）
  if (syncAppState) {
    AppState.on('ym-change', ({ year, month }) => {
      const ySel = root.querySelector('select[data-filter="year"]');
      const mSel = root.querySelector('select[data-filter="month"]');
      if (ySel && ySel.value !== String(year)) ySel.value = String(year);
      if (mSel && mSel.value !== String(month)) mSel.value = String(month);
    });
  }

  // 初次回呼
  if (typeof onChange === 'function') {
    onChange(collectFilters(root));
  }

  if (window.lucide) window.lucide.createIcons();

  return {
    root,
    getFilters: () => collectFilters(root),
    refresh: () => {
      const filters = collectFilters(root);
      if (typeof onChange === 'function') onChange(filters);
    },
  };
}

function collectFilters(root) {
  const filters = {};
  root.querySelectorAll('select[data-filter]').forEach((sel) => {
    filters[sel.dataset.filter] = sel.value;
  });
  return filters;
}

/**
 * 重新渲染篩選欄（用於選項動態更新時）
 */
export function refreshPageFilter(instance) {
  if (instance && typeof instance.refresh === 'function') instance.refresh();
}
