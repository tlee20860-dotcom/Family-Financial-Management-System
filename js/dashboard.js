// ============================================
// dashboard.js — 總覽儀表板邏輯
// ============================================

import { api } from './api.js';
import { formatHKD, currentYearMonth } from './utils.js';

export async function initDashboardPage() {
  const { year, month } = currentYearMonth();

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

  // 淨結餘顏色（正綠負紅）
  const netEl = document.getElementById('stat-net');
  if (netEl) {
    netEl.classList.remove('emerald', 'red');
    netEl.classList.add(data.netBalance >= 0 ? 'emerald' : 'red');
  }

  // 收入細項 hint
  setText('hint-income',
    `老公 ${formatHKD(data.incomeBreakdown.husbandContribution)} ＋ ` +
    `老婆 ${formatHKD(data.incomeBreakdown.wifeContribution)} ＋ ` +
    `額外 ${formatHKD(data.incomeBreakdown.extraIncome)}`
  );

  // 支出細項 hint
  setText('hint-expense',
    `共 ${Object.values(data.perMember).reduce((s, m) => s + m.itemCount, 0)} 筆項目`
  );

  // 總資產 hint
  setText('hint-assets',
    `銀行 ${formatHKD(data.bankBalance)} ＋ 基金 ${formatHKD(data.fundValue)}`
  );

  // 保單數量
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
