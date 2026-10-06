// ============================================
// sidebar-order.js — 側邊欄排序管理（跨裝置同步）
// ============================================

import { listenSidebarOrder, saveSidebarOrder } from './db.js';

/**
 * 所有可排序的側邊欄選單（下方功能選單）
 * ⚠️ 新增選單時，需同步更新這裡與 sidebar.js 的 STATIC_BOTTOM
 */
export const ALL_MENU_ITEMS = [
  { icon: 'dollar-sign',     label: '每月收入',      href: 'income.html' },
  { icon: 'user',            label: '個人支出',      href: 'personal-expenses.html' },
  { icon: 'landmark',        label: '銀行管理',      href: 'banks.html' },
  { icon: 'shield',          label: '保險付款',      href: 'insurance.html' },
  { icon: 'clipboard-check', label: '結算清單',      href: 'settlements.html' },
  { icon: 'file-text',       label: '固定支出',      href: 'fixed-expenses.html' },
  { icon: 'tags',            label: '基礎資料管理庫', href: 'expense-categories.html' },
  { icon: 'line-chart',      label: '基金投資',      href: 'portfolio.html' },
  { icon: 'bar-chart-3',     label: '年度報表',      href: 'annual-report.html' },
  { icon: 'settings',        label: '系統設定',      href: 'settings.html' },
];

/** 預設順序（href 陣列） */
export const DEFAULT_ORDER = ALL_MENU_ITEMS.map((i) => i.href);

/**
 * 依自訂順序排序選單
 * @param {Array} items - 選單項目陣列
 * @param {string[]} order - href 順序陣列
 * @returns {Array} 排序後的選單
 */
export function sortByOrder(items, order) {
  if (!order || !Array.isArray(order)) return items;
  const map = new Map();
  order.forEach((href, i) => map.set(href, i));
  return [...items].sort((a, b) => {
    const ia = map.has(a.href) ? map.get(a.href) : 999;
    const ib = map.has(b.href) ? map.get(b.href) : 999;
    return ia - ib;
  });
}

/**
 * 監聽側邊欄排序（Firebase 同步）
 * 若從未設定過，回傳預設順序
 * @param {Function} callback - (order: string[]) => void
 */
export function watchSidebarOrder(callback) {
  return listenSidebarOrder((order) => {
    if (!order || !Array.isArray(order) || order.length === 0) {
      callback([...DEFAULT_ORDER]);
      return;
    }
    // 補齊未包含的項目（新選單加入時）
    const merged = [...order];
    DEFAULT_ORDER.forEach((href) => {
      if (!merged.includes(href)) merged.push(href);
    });
    callback(merged);
  });
}

/**
 * 儲存排序到 Firebase
 * @param {string[]} order
 */
export async function persistSidebarOrder(order) {
  await saveSidebarOrder(order);
}

/**
 * 重置為預設順序
 */
export async function resetSidebarOrder() {
  await saveSidebarOrder([...DEFAULT_ORDER]);
}

/**
 * 在陣列中移動項目
 * @param {string[]} order - 當前順序
 * @param {string} href - 要移動的項目
 * @param {string} direction - 'up' | 'down'
 * @returns {string[]} 新順序（若無法移動則回傳原陣列）
 */
export function moveOrderItem(order, href, direction) {
  const arr = [...order];
  const idx = arr.indexOf(href);
  if (idx < 0) return arr;

  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= arr.length) return arr;

  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  return arr;
}
