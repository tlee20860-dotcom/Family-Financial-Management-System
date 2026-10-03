// ============================================
// utils.js — 通用工具函式
// ============================================

export function formatHKD(amount) {
  if (amount == null || isNaN(amount)) return 'HK$ 0';
  return 'HK$ ' + Number(amount).toLocaleString('zh-HK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatNumber(amount) {
  if (amount == null || isNaN(amount)) return '0';
  return Number(amount).toLocaleString('zh-HK');
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

export function qs(sel, parent = document) { return parent.querySelector(sel); }
export function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
