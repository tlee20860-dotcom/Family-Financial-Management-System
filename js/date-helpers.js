// ============================================
// date-helpers.js — 全站共用年月下拉填充
// ============================================

/**
 * 填充年份下拉
 *
 * @param {string|HTMLElement} target - 元素 ID 或元素本身
 * @param {Object} config
 * @param {number} config.range - 範圍 ±N 年（預設 5）
 * @param {string} config.defaultValue - 預設選中值
 * @param {boolean} config.preserveValue - 是否保留原選中值（預設 true）
 * @param {boolean} config.includeAll - 是否加入「全部」選項（預設 false）
 */
export function fillYearSelect(target, config = {}) {
  const {
    range = 5,
    defaultValue,
    preserveValue = true,
    includeAll = false,
  } = config;

  const sel = resolveElement(target);
  if (!sel) {
    console.warn(`⚠️ fillYearSelect: 找不到元素`, target);
    return;
  }

  const cur = preserveValue ? sel.value : '';
  const now = new Date();
  const curY = now.getFullYear();

  let html = includeAll ? `<option value="">全部</option>` : '';
  for (let y = curY - range; y <= curY + range; y++) {
    html += `<option value="${y}">${y} 年</option>`;
  }

  sel.innerHTML = html;

  if (defaultValue != null) {
    sel.value = String(defaultValue);
  } else if (preserveValue && cur && sel.querySelector(`option[value="${cur}"]`)) {
    sel.value = cur;
  } else {
    sel.value = String(curY);
  }
}

/**
 * 填充月份下拉
 *
 * @param {string|HTMLElement} target
 * @param {Object} config
 * @param {boolean} config.includeAll - 是否加入「全部」選項
 * @param {string} config.allText - 「全部」選項文字（預設 '全部'）
 * @param {string} config.defaultValue - 預設選中值（'01' ~ '12' 或 'all'）
 * @param {boolean} config.preserveValue - 是否保留原選中值
 */
export function fillMonthSelect(target, config = {}) {
  const {
    includeAll = false,
    allText = '全部',
    defaultValue,
    preserveValue = true,
  } = config;

  const sel = resolveElement(target);
  if (!sel) {
    console.warn(`⚠️ fillMonthSelect: 找不到元素`, target);
    return;
  }

  const cur = preserveValue ? sel.value : '';

  let html = includeAll ? `<option value="all">${allText}</option>` : '';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    html += `<option value="${mm}">${m} 月</option>`;
  }

  sel.innerHTML = html;

  if (defaultValue != null) {
    sel.value = String(defaultValue);
  } else if (preserveValue && cur && sel.querySelector(`option[value="${cur}"]`)) {
    sel.value = cur;
  }
}

/**
 * 一次填充年份 + 月份
 *
 * @param {string} yearTarget
 * @param {string} monthTarget
 * @param {Object} config
 */
export function fillYearMonthSelects(yearTarget, monthTarget, config = {}) {
  fillYearSelect(yearTarget, config);
  fillMonthSelect(monthTarget, config);
}

/* ============================================
   內部工具
   ============================================ */
function resolveElement(target) {
  if (typeof target === 'string') return document.getElementById(target);
  if (target instanceof HTMLElement) return target;
  return null;
}
