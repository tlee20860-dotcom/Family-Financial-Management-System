// ============================================
// utils.js — 通用工具函式
// ============================================

import { AppState } from './state.js';

export function formatHKD(amount) {
  if (amount == null || isNaN(amount)) return 'HK$ 0';
  const rounded = Math.round(Number(amount));
  return 'HK$ ' + rounded.toLocaleString('zh-HK');
}

export function formatNumber(amount) {
  if (amount == null || isNaN(amount)) return '0';
  const rounded = Math.round(Number(amount));
  return rounded.toLocaleString('zh-HK');
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function currentYearMonth() {
  const d = new Date();
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
  };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function qs(sel, parent = document) { return parent.querySelector(sel); }
export function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

/**
 * 成員排序（全站統一使用）
 */
export function sortMembers(members) {
  return [...members].sort((a, b) => {
    const oa = a.order != null ? a.order : Number.MAX_SAFE_INTEGER;
    const ob = b.order != null ? b.order : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

/* ============================================
   🆕 v93 頁面年月選擇器（共用）
   -------------------------------------------------
   用法：
     <div class="page-ym-selector">
       <select class="select" id="page-year"></select>
       <select class="select" id="page-month"></select>
     </div>
     initPageYearMonthSelector('page-year', 'page-month');
   
   特性：
   - 從 AppState 讀取當前年月並顯示
   - 變更時呼叫 AppState.setYearMonth()（跨頁面同步）
   - 監聽 ym-change，其他來源變更時 UI 也同步
   ============================================ */
export function initPageYearMonthSelector(yearElId, monthElId, options = {}) {
  const ySel = document.getElementById(yearElId);
  const mSel = document.getElementById(monthElId);
  if (!ySel || !mSel) return null;

  const includeAll = options.includeAll !== false;  // 預設含「全年」
  const now = new Date();
  const curY = now.getFullYear();
  const { year: stateYear, month: stateMonth } = AppState.getYearMonth();

  // 年份下拉
  let yOpts = '';
  for (let y = curY - 5; y <= curY + 5; y++) {
    yOpts += `<option value="${y}">${y} 年</option>`;
  }
  ySel.innerHTML = yOpts;

  // 月份下拉
  let mOpts = includeAll ? `<option value="all">全年</option>` : '';
  for (let m = 1; m <= 12; m++) {
    mOpts += `<option value="${String(m).padStart(2, '0')}">${m} 月</option>`;
  }
  mSel.innerHTML = mOpts;

  // 初始值
  ySel.value = stateYear || curY;
  mSel.value = stateMonth || (includeAll ? 'all' : '01');

  // 變更事件
  ySel.addEventListener('change', () => {
    AppState.setYearMonth(ySel.value, mSel.value);
  });
  mSel.addEventListener('change', () => {
    AppState.setYearMonth(ySel.value, mSel.value);
  });

  // 監聽 ym-change，同步 UI
  AppState.on('ym-change', ({ year, month }) => {
    const yStr = String(year);
    const mStr = String(month);
    if (ySel.value !== yStr) ySel.value = yStr;
    if (mSel.value !== mStr) mSel.value = mStr;
  });

  return { ySel, mSel };
}
