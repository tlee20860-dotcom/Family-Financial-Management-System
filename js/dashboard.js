// ============================================
// dashboard.js — 總覽儀表板邏輯（支援全年 / 單月）
// ============================================

import { api } from './api.js';
import { formatHKD, initPageYearMonthSelector } from './utils.js';
import { AppState } from './state.js';

export async function initDashboardPage() {
  initPageYearMonthSelector('page-year', 'page-month');
  await loadDashboard();
  AppState.on('ym-change', () => loadDashboard());
}

async function loadDashboard() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';

  document.getElementById('dashboard-month').textContent = isAnnual
    ? `${year} 年 全年總覽`
    : `${year} 年 ${month} 月`;

  document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
  document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';

  try {
    if (isAnnual) {
      const data = await api.fetchAnnualSummary(year);
      renderAnnual(data);
    } else {
      const data = await api.summary(year, month);
      renderMonthly(data);
    }
  } catch (err) {
    console.error('儀表板載入失敗：', err);
    showError('無法載入家庭財務資料，請稍後再試。');
  }
}

function renderAnnual(data) {
  setText('annual-income', formatHKD(data.totalIncome));
  setText('annual-expense', formatHKD(data.totalExpense));
  setText('annual-net', formatHKD(data.netBalance));
  setText('annual-assets', formatHKD(data.totalAssets));
  setText('annual-insurance', formatHKD(data.yearlyInsuranceTotal));

  const netEl = document.getElementById('annual-net');
  netEl.classList.remove('emerald', 'red');
  netEl.classList.add(data.netBalance >= 0 ? 'emerald' : 'red');

  const container = document.getElementById('monthly-cards');
  container.innerHTML = data.monthly.map((m, i) => {
    const monthNum = i + 1;
    const netColor = m.netBalance >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)';
    const totalItems = Object.values(m.perMember || {}).reduce((s, x) => s + (x.itemCount || 0), 0);

    return `
      <div class="glass-card" style="margin-bottom:10px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer;"
             onclick="this.parentElement.querySelector('.month-detail').style.display =
                      this.parentElement.querySelector('.month-detail').style.display === 'none' ? 'block' : 'none'">
          <div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:700; font-size:16px; color:var(--neon-cyan); min-width:60px;">${monthNum} 月</div>
            <div style="font-size:12px; color:var(--text-muted);">
              收入 <span class="mono text-emerald">${formatHKD(m.totalIncome)}</span>
              ｜ 支出 <span class="mono text-red">${formatHKD(m.totalExpense)}</span>
            </div>
          </div>
          <div class="mono" style="color:${netColor}; font-weight:700; font-size:14px;">
            ${formatHKD(m.netBalance)}
          </div>
        </div>
        <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">共 ${totalItems} 筆成員支出</div>
          ${Object.entries(m.perMember || {}).map(([mid, md]) => `
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;">
              <span>${md.memberName}</span>
              <span class="mono text-magenta">${formatHKD(md.sum)}</span>
            </div>
          `).join('') || '<div style="font-size:12px; color:var(--text-muted);">本月無成員支出</div>'}
          ${(m.fixedList || []).length ? `
            <div style="margin-top:10px; font-size:12px; color:var(--text-muted);">固定支出</div>
            ${(m.fixedList || []).map((f) => `
              <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;">
                <span>${f.name}</span>
                <span class="mono text-orange">${formatHKD(f.amount)}</span>
              </div>
            `).join('')}
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

function renderMonthly(data) {
  setText('stat-income',    formatHKD(data.totalIncome));
  setText('stat-expense',   formatHKD(data.totalExpense));
  setText('stat-net',       formatHKD(data.netBalance));
  setText('stat-insurance', formatHKD(data.yearlyInsuranceTotal));
  setText('stat-assets',    formatHKD(data.totalAssets));
  setText('stat-monthly-insurance', formatHKD(data.monthlyInsuranceAverage));

  const netEl = document.getElementById('stat-net');
  netEl.classList.remove('emerald', 'red');
  netEl.classList.add(data.netBalance >= 0 ? 'emerald' : 'red');

  const breakdown = data.incomeBreakdown || {};
  const perMember = data.perMember || {};
  const parts = [];
  Object.entries(breakdown).forEach(([key, val]) => {
    if (key === 'extra') {
      parts.push(`額外 ${formatHKD(val)}`);
    } else {
      const memberName = perMember[key]?.memberName || key;
      parts.push(`${memberName} ${formatHKD(val)}`);
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
