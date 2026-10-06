// ============================================
// annual-month-cards.js — 全站共用年度 12 個月折疊卡
// ============================================

import { formatHKD } from './utils.js';

/**
 * 渲染年度 12 個月折疊卡
 *
 * HTML 容器要求：
 *   <div id="annual-monthly-cards"></div>
 *
 * @param {string} containerId - 容器 ID
 * @param {Object} options
 * @param {Function} options.getMonthData - (monthNum) => { title, total, detailHtml }
 * @param {Function} options.totalFormatter - (num) => string（預設 formatHKD）
 * @param {string} options.emptyText - 無資料時的顯示文字
 */
export function renderAnnualMonthCards(containerId, options = {}) {
  const {
    getMonthData,
    totalFormatter = formatHKD,
    emptyText = '本年度尚無資料',
  } = options;

  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`⚠️ renderAnnualMonthCards: 找不到容器 #${containerId}`);
    return null;
  }

  const cards = [];
  for (let m = 1; m <= 12; m++) {
    const data = getMonthData(m);
    if (!data) continue;

    cards.push(`
      <div class="annual-month-card">
        <div class="annual-month-header">
          <div class="month-title">${data.title || `${m} 月`}</div>
          <div class="month-total">${totalFormatter(data.total || 0)}</div>
        </div>
        <div class="annual-month-detail" style="display:none;">
          ${data.detailHtml || ''}
        </div>
      </div>
    `);
  }

  if (cards.length === 0) {
    container.innerHTML = `
      <div class="glass-card">
        <div class="empty-state">${emptyText}</div>
      </div>
    `;
    return null;
  }

  container.innerHTML = cards.join('');

  // 綁定折疊事件
  container.querySelectorAll('.annual-month-header').forEach((el) => {
    el.addEventListener('click', () => {
      const detail = el.nextElementSibling;
      if (!detail) return;
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
  });

  if (window.lucide) window.lucide.createIcons();

  return {
    container,
    expandAll: () => {
      container.querySelectorAll('.annual-month-detail').forEach((el) => {
        el.style.display = 'block';
      });
    },
    collapseAll: () => {
      container.querySelectorAll('.annual-month-detail').forEach((el) => {
        el.style.display = 'none';
      });
    },
  };
}

/**
 * 產生單一月份明細 row 的 HTML（供 getMonthData 使用）
 *
 * @param {string} name - 項目名稱
 * @param {number} amount - 金額
 * @param {string} colorClass - 顏色 class（可選，預設 'text-emerald'）
 */
export function monthRowHtml(name, amount, colorClass = 'text-emerald') {
  return `
    <div class="annual-month-row">
      <span>${name}</span>
      <span class="mono ${colorClass}">${formatHKD(amount)}</span>
    </div>
  `;
}
