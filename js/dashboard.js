// ============================================
// dashboard.js — 總覽儀表板邏輯
// ============================================

import { api } from './api.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

export async function initDashboardPage() {
  await loadDashboard();
  AppState.on('ym-change', () => loadDashboard());
}

async function loadDashboard() {
  const { year, month } = AppState.getYearMonth();
  const monthLabel = document.getElementById('dashboard-month');
  if (monthLabel) monthLabel.textContent = `${year} 年 ${month} 月`;

  try {
    const data = await api.summary(year, month);
    renderDashboard(data);
  } catch (err) {
    console.error('儀表板載入失敗：', err);
    showError('無法載入家庭財務資料，請稍後再試。');
  }
}

function renderDashboard(data) {
  setText('stat-income',    formatHKD(data.totalIncome));
  setText('stat-expense',   formatHKD(data.totalExpense));
  setText('stat-net',       formatHKD(data.netBalance));
  setText('stat-insurance', formatHKD(data.yearlyInsuranceTotal));
  setText('stat-assets',    formatHKD(data.totalAssets));
  setText('stat-monthly-insurance', formatHKD(data.monthlyInsuranceAverage));

  const netEl = document.getElementById('stat-net');
  if (netEl) {
    netEl.classList.remove('emerald', 'red');
    netEl.classList.add(data.netBalance >= 0 ? 'emerald' : 'red');
  }

  // 🆕 收入 hint（新結構）
  const breakdown = data.incomeBreakdown || {};
  const parts = [];
  const memberMap = {
    mem_husband: '老公', mem_wife: '老婆', mem_son: '梓舜', mem_daughter: '梓言',
  };
  Object.entries(breakdown).forEach(([key, val]) => {
    if (key === 'extra') {
      parts.push(`額外 ${formatHKD(val)}`);
    } else {
      const name = memberMap[key] || key;
      parts.push(`${name} ${formatHKD(val)}`);
    }
  });
  setText('hint-income', parts.length ? parts.join(' ＋ ') : '本月尚未設定收入');

  setText('hint-expense',
    `共 ${Object.values(data.perMember).reduce((s, m) => s + m.itemCount, 0)} 筆項目`
  );

  setText('hint-assets',
    `銀行 ${formatHKD(data.bankBalance)} ＋ 基金 ${formatHKD(data.fundValue)}`
  );

  setText('hint-insurance', `共 ${data.policyCount} 張保單`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showError(msg) {
  const banner = document.getElementById('dashboard-error');
  if (banner) {
    banner.textContent = '⚠ ' + msg;
    banner.style.display = 'block';
  }
}
