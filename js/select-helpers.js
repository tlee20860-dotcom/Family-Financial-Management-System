// ============================================
// select-helpers.js — 全站共用下拉選項填充
// ============================================

import { escapeHtml, sortMembers } from './utils.js';

/**
 * 通用填充下拉選項
 *
 * @param {string|HTMLElement} target - 元素 ID 或元素本身
 * @param {Array} options - 選項陣列
 * @param {Object} config
 * @param {string} config.valueKey - 值欄位名（預設 'id'）
 * @param {string} config.labelKey - 顯示欄位名（預設 'name'）
 * @param {boolean} config.includeEmpty - 是否加入空選項
 * @param {string} config.emptyText - 空選項文字
 * @param {boolean} config.preserveValue - 是否保留原選中值
 */
export function fillSelect(target, options, config = {}) {
  const {
    valueKey = 'id',
    labelKey = 'name',
    includeEmpty = false,
    emptyText = '— 請選擇 —',
    preserveValue = true,
  } = config;

  const sel = resolveElement(target);
  if (!sel) {
    console.warn(`⚠️ fillSelect: 找不到元素`, target);
    return;
  }

  const cur = preserveValue ? sel.value : '';

  let html = includeEmpty ? `<option value="">${escapeHtml(emptyText)}</option>` : '';
  html += options.map((o) => {
    const val = o[valueKey];
    const label = o[labelKey];
    return `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`;
  }).join('');

  sel.innerHTML = html;

  if (preserveValue && cur && options.some((o) => String(o[valueKey]) === cur)) {
    sel.value = cur;
  }
}

/**
 * 填充成員下拉
 */
export function fillMemberSelect(target, members, config = {}) {
  const sorted = sortMembers(members);
  fillSelect(target, sorted, {
    valueKey: 'id',
    labelKey: 'name',
    includeEmpty: config.includeEmpty !== false,
    emptyText: config.emptyText || '— 請選擇 —',
    preserveValue: config.preserveValue !== false,
  });
}

/**
 * 填充類別下拉
 */
export function fillCategorySelect(target, categories, config = {}) {
  const sorted = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  fillSelect(target, sorted, {
    valueKey: 'id',
    labelKey: 'name',
    includeEmpty: config.includeEmpty !== false,
    emptyText: config.emptyText || '— 請選擇類別 —',
    preserveValue: config.preserveValue !== false,
  });
}

/**
 * 填充項目下拉（依類別過濾）
 */
export function fillItemSelect(target, items, categoryId, config = {}) {
  const filtered = categoryId
    ? items.filter((i) => i.categoryId === categoryId)
    : items;

  fillSelect(target, filtered, {
    valueKey: 'id',
    labelKey: 'name',
    includeEmpty: config.includeEmpty !== false,
    emptyText: config.emptyText || (categoryId ? '— 請選擇項目 —' : '— 請先選擇類別 —'),
    preserveValue: config.preserveValue !== false,
  });
}

/**
 * 填充支付方式下拉
 */
export function fillPaymentSelect(target, payments, config = {}) {
  const sorted = [...payments].sort((a, b) => (a.order || 0) - (b.order || 0));
  fillSelect(target, sorted, {
    valueKey: 'id',
    labelKey: 'name',
    includeEmpty: config.includeEmpty !== false,
    emptyText: config.emptyText || '— 請選擇 —',
    preserveValue: config.preserveValue !== false,
  });
}

/**
 * 填充保險公司下拉
 */
export function fillCompanySelect(target, companies, config = {}) {
  fillSelect(target, companies, {
    valueKey: 'id',
    labelKey: 'name',
    includeEmpty: config.includeEmpty !== false,
    emptyText: config.emptyText || '— 請選擇 —',
    preserveValue: config.preserveValue !== false,
  });
}

/**
 * 填充銀行下拉
 */
export function fillBankSelect(target, banks, config = {}) {
  fillSelect(target, banks, {
    valueKey: 'id',
    labelKey: 'name',
    includeEmpty: config.includeEmpty !== false,
    emptyText: config.emptyText || '— 請選擇銀行 —',
    preserveValue: config.preserveValue !== false,
  });
}

/* ============================================
   內部工具
   ============================================ */
function resolveElement(target) {
  if (typeof target === 'string') {
    return document.getElementById(target);
  }
  if (target instanceof HTMLElement) {
    return target;
  }
  return null;
}
