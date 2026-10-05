```javascript
// ============================================
// js/insurance.js — 保險付款（雙模式 + 卡片內折疊明細 + 精確金額計算 + 健全防護）
// ============================================
import {
  listenInsurancePolicies,
  addInsurancePolicyV2,
  updateInsurancePolicyV2,
  listenMembers,
  addInsurancePeriod,
  getInsurancePaymentsOnce,
  saveInsurancePaymentBatch,
  removeInsurancePaymentBatch,
  deleteInsurancePolicyAndData,
  listenInsuranceCompanies,
  addInsuranceCompany,
  updateInsuranceCompany,
  updatePolicyCompanyName,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

const DEFAULT_COMPANIES = ['富通', '保誠', 'FWD', 'AIA', '宏利', 'AXA'];
let policies = [];
let members = [];
let companies = [];
let editingId = null;
let currentView = localStorage.getItem('insurance_view') || 'card';
let expandedKeys = new Set(); // 記錄展開的 key（保單 id + 年度）

export function initInsurancePage() {
  const monthSel = document.getElementById('policy-start-month');
  if (monthSel) {
    let monthOpts = '';
    for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2, '0')}">${m} 月</option>`;
    monthSel.innerHTML = monthOpts;
  }

  bindPolicyModalEvents();
  bindAddPeriodModalEvents();
  bindViewToggle();
  bindCompletedToggle();

  const syncBtn = document.getElementById('sync-all-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (!confirm('確定要重新同步所有保單的已扣款支出嗎？')) return;
      try {
        await syncAllPolicyExpenses();
        alert('✅ 已同步所有保單支出');
      } catch (err) {
        alert('同步失敗：' + err.message);
      }
    });
  }

  listenInsuranceCompanies((list) => {
    companies = list;
    if (list.length === 0 && !window._seededCompanies) {
      window._seededCompanies = true;
      DEFAULT_COMPANIES.forEach(async (name) => {
        try { await addInsuranceCompany(name); } catch (err) {}
      });
    }
    renderCompanyOptions();
  });

  listenInsurancePolicies((list) => {
    policies = list || [];
    renderAll();
  });

  listenMembers((list) => {
    members = list || [];
    renderMemberOptions();
  });

  AppState.on('ym-change', () => renderAll());
}

function bindViewToggle() {
  const cardBtn = document.getElementById('view-card-btn');
  const tableBtn = document.getElementById('view-table-btn');
  if (!cardBtn || !tableBtn) return;

  const updateUI = () => {
    if (currentView === 'card') {
      cardBtn.classList.add('btn-primary');
      cardBtn.classList.remove('btn-ghost');
      tableBtn.classList.add('btn-ghost');
      tableBtn.classList.remove('btn-primary');
    } else {
      cardBtn.classList.add('btn-ghost');
      cardBtn.classList.remove('btn-primary');
      tableBtn.classList.add('btn-primary');
      tableBtn.classList.remove('btn-ghost');
    }
  };

  cardBtn.addEventListener('click', () => {
    currentView = 'card';
    localStorage.setItem('insurance_view', 'card');
    updateUI();
    renderAll();
  });

  tableBtn.addEventListener('click', () => {
    currentView = 'table';
    localStorage.setItem('insurance_view', 'table');
    updateUI();
    renderAll();
  });

  updateUI();
}

function bindCompletedToggle() {
  const header = document.getElementById('completed-header');
  const section = document.getElementById('completed-section');
  const body = document.getElementById('completed-body');
  if (!header || !body || !section) return;

  header.addEventListener('click', () => {
    section.classList.toggle('open');
    body.style.display = section.classList.contains('open') ? 'block' : 'none';
  });
}

function renderCompanyOptions() {
  const sel = document.getElementById('policy-company');
  if (!sel) return;
  const current = sel.value;
  const list = companies.length ? companies : DEFAULT_COMPANIES.map((name) => ({ name }));
  sel.innerHTML = list.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  if (current && !list.some((c) => c.name === current)) {
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = current;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

async function autoSyncPolicyExpenses(policy) {
  try {
    const payments = await getInsurancePaymentsOnce(policy.id);
    const promises = [];

    for (const [year, months] of Object.entries(payments || {})) {
      for (const [month, data] of Object.entries(months || {})) {
        if (data && data.status === '已扣款') {
          const info = getPeriodInfo(policy, Number(year), Number(month));
          if (!info) continue;
          const periodData = (policy.periods || {})[String(info.periodIndex)];
          const amount = Math.round(data.amount || (periodData ? periodData.monthlyAverage : policy.monthlyAverage) || 0);
          promises.push(api.insuranceSync({
            policyId: policy.id,
            memberId: policy.memberId,
            policyName: policy.name,
            monthlyAverage: amount,
            year,
            month
          }));
        }
      }
    }
    await Promise.all(promises);
  } catch (err) {
    console.warn('自動同步保單支出失敗:', policy.name, err);
  }
}

async function syncAllPolicyExpenses() {
  await Promise.all(policies.map((p) => autoSyncPolicyExpenses(p)));
}

function getPolicyStartYear(policy) {
  return Number(policy.firstStartYear || policy.startYear || new Date().getFullYear());
}

function getPolicyStartMonth(policy) {
  return Number(policy.firstStartMonth || policy.startMonth || 1);
}

function getPeriodRange(policy, periodIndex) {
  const firstY = getPolicyStartYear(policy);
  const firstM = getPolicyStartMonth(policy);
  const startDate = new Date(firstY, firstM - 1, 1);
  startDate.setMonth(startDate.getMonth() + (periodIndex - 1) * 12);

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 11);

  return {
    startY: startDate.getFullYear(),
    startM: String(startDate.getMonth() + 1).padStart(2, '0'),
    endY: endDate.getFullYear(),
    endM: String(endDate.getMonth() + 1).padStart(2, '0'),
    rangeText: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')} ~ ${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`,
  };
}

function getPeriodInfo(policy, curYear, curMonth) {
  const firstY = getPolicyStartYear(policy);
  const firstM = getPolicyStartMonth(policy);
  if (!firstY || !firstM || firstY < 1900 || firstY > 2100 || firstM < 1 || firstM > 12) return null;

  const startDate = new Date(firstY, firstM - 1, 1);
  const currentDate = new Date(curYear, curMonth - 1, 1);

  const diffMonths = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + (currentDate.getMonth() - startDate.getMonth());
  if (diffMonths < 0) return null;

  const periodIndex = Math.floor(diffMonths / 12) + 1;
  const totalYears = Number(policy.totalPolicyYears || policy.totalYears || 0);
  if (totalYears > 0 && periodIndex > totalYears) return null;

  return { periodIndex, ...getPeriodRange(policy, periodIndex) };
}

function isPolicyCompleted(policy) {
  if (policy.isCompleted) return true;
  const total = Number(policy.totalPolicyPeriods) || (Number(policy.totalPolicyYears || policy.totalYears || 0) * 12);
  const done = Number(policy.completedPeriods) || 0;
  return total > 0 && done >= total;
}

/**
 * 需求 C：計算該保單所有年度（全期）總供款金額
 */
function getPolicyLifetimeTotal(policy) {
  if (policy.type === 'fund_insurance') {
    return Math.round((Number(policy.monthlyPremium) || 0) * 12 * (Number(policy.totalPolicyYears || policy.totalYears) || 0));
  }
  const totalYears = Number(policy.totalPolicyYears || policy.totalYears) || 1;
  let sum = 0;
  let lastAnnual = 0;
  for (let i = 1; i <= totalYears; i++) {
    const period = (policy.periods || {})[String(i)];
    if (period && Number(period.annualPremium) > 0) {
      lastAnnual = Math.round(Number(period.annualPremium));
      sum += lastAnnual;
    } else {
      sum += lastAnnual;
    }
  }
  if (sum === 0 && policy.totalPremium) return Math.round(Number(policy.totalPremium));
  return sum;
}

/**
 * 需求 B：計算每份保單在特定日曆年份（例如 2026）的獨立年度總供款
 */
function getPolicyYearlyContribution(policy, targetYear) {
  if (policy.type === 'fund_insurance') {
    return Math.round((Number(policy.monthlyPremium) || 0) * 12);
  }
  const curY = Number(targetYear);
  let totalForYear = 0;

  for (let m = 1; m <= 12; m++) {
    const info = getPeriodInfo(policy, curY, m);
    if (info) {
      const pIdx = info.periodIndex;
      let periodData = (policy.periods || {})[String(pIdx)];
      if (!periodData) {
        for (let k = pIdx - 1; k >= 1; k--) {
          if ((policy.periods || {})[String(k)]) {
            periodData = (policy.periods || {})[String(k)];
            break;
          }
        }
      }
      if (periodData) {
        if (periodData.monthlyAverage) {
          totalForYear += Math.round(Number(periodData.monthlyAverage));
        } else if (periodData.annualPremium) {
          totalForYear += Math.round(Number(periodData.annualPremium) / 12);
        }
      } else if (policy.monthlyAverage) {
        totalForYear += Math.round(Number(policy.monthlyAverage));
      }
    }
  }
  return totalForYear;
}

async function renderAll() {
  try {
    const ym = AppState.getYearMonth() || {};
    const year = ym.year || String(new Date().getFullYear());
    const month = ym.month || 'all';
    const isAnnual = month === 'all';

    const monthEl = document.getElementById('insurance-month');
    if (monthEl) monthEl.textContent = isAnnual ? `${year} 年 全年總覽` : `${year} 年 ${month} 月`;

    // 即時計算進度與關聯扣款紀錄
    const enrichedPolicies = await Promise.all(policies.map(async (p) => {
      if (p.type === 'fund_insurance') return p;
      try {
        const payments = await getInsurancePaymentsOnce(p.id);
        let completed = 0;
        Object.values(payments || {}).forEach((yearData) => {
          Object.values(yearData || {}).forEach((mData) => {
            if (mData && mData.status === '已扣款') completed++;
          });
        });
        return { ...p, completedPeriods: completed, _payments: payments };
      } catch (err) {
        console.warn('讀取保單扣款紀錄失敗:', p.id, err);
        return { ...p, completedPeriods: 0, _payments: {} };
      }
    }));

    // 需求 A：當前選擇年度所有保單的總供款金額
    const activeEnriched = enrichedPolicies.filter((p) => !isPolicyCompleted(p));
    const yearlyTotalAll = activeEnriched.reduce((s, p) => s + getPolicyYearlyContribution(p, year), 0);
    const lifetimeTotalAll = activeEnriched.reduce((s, p) => s + getPolicyLifetimeTotal(p), 0);

    const grandTitleEl = document.getElementById('grand-total-title');
    if (grandTitleEl) grandTitleEl.textContent = `${year} 年度總供款金額`;

    const grandValEl = document.getElementById('grand-total-premium');
    if (grandValEl) grandValEl.textContent = formatHKD(yearlyTotalAll);

    const grandHintEl = document.getElementById('grand-total-hint');
    if (grandHintEl) grandHintEl.textContent = `全期總供款累計：${formatHKD(lifetimeTotalAll)}（共 ${activeEnriched.length} 張保單）`;

    const completed = enrichedPolicies.filter(isPolicyCompleted);
    const active = activeEnriched;

    const activeCountEl = document.getElementById('active-policy-count');
    if (activeCountEl) activeCountEl.textContent = `${active.length} 張`;

    const completedCountEl = document.getElementById('completed-count');
    if (completedCountEl) completedCountEl.textContent = String(completed.length);

    const completedSection = document.getElementById('completed-section');
    if (completedSection) {
      if (completed.length > 0) {
        completedSection.style.display = 'block';
        const badge = document.getElementById('completed-count-badge');
        if (badge) badge.textContent = String(completed.length);
        const completedGrid = document.getElementById('completed-grid');
        if (completedGrid) completedGrid.innerHTML = completed.map((p) => renderCard(p, true, year)).join('');
      } else {
        completedSection.style.display = 'none';
      }
    }

    const emptyState = document.getElementById('empty-state');
    const gridEl = document.getElementById('policy-grid');
    const tableEl = document.getElementById('policy-table-view');

    if (active.length === 0) {
      if (gridEl) gridEl.style.display = 'none';
      if (tableEl) tableEl.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (currentView === 'card') {
        if (gridEl) {
          gridEl.style.display = 'grid';
          gridEl.innerHTML = active.map((p) => renderCard(p, false, year)).join('');
        }
        if (tableEl) tableEl.style.display = 'none';
      } else {
        if (gridEl) gridEl.style.display = 'none';
        if (tableEl) {
          tableEl.style.display = 'block';
          renderTable(active, year);
        }
      }
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('保險頁面渲染失敗:', err);
  }
}

/* ============================================ 渲染卡片內部的年度折疊明細 ============================================ */
function renderPolicyDetail(policy, payments) {
  const totalYears = Number(policy.totalPolicyYears || policy.totalYears) || 1;
  const detailRows = [];

  for (let i = 1; i <= totalYears; i++) {
    const range = getPeriodRange(policy, i);
    const key = `${policy.id}-${i}`;
    const isOpen = expandedKeys.has(key);

    const months = [];
    const detailStart = new Date(range.startY, Number(range.startM) - 1, 1);
    let totalPaid = 0;

    for (let j = 0; j < 12; j++) {
      const cur = new Date(detailStart);
      cur.setMonth(cur.getMonth() + j);
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const payment = (payments[y] || {})[m] || {};
      const defaultAmount = Math.round((policy.periods?.[String(i)]?.monthlyAverage) || policy.monthlyAverage || 0);
      const amount = payment.amount ? Math.round(payment.amount) : defaultAmount;
      const isPaid = payment.status === '已扣款';
      if (isPaid) totalPaid += amount;

      months.push(`
        <div class="insurance-month-row flex items-center justify-between gap-2 py-1 px-2 border-b border-glass" data-policy="${policy.id}" data-year="${y}" data-month="${m}">
          <span class="text-xs text-muted font-mono">${y}-${m}</span>
          <div class="flex items-center gap-2">
            <input type="number" class="input input-sm ins-amount text-right" style="width: 90px;" value="${amount}">
            <label class="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" class="ins-paid" ${isPaid ? 'checked' : ''}>
              <span>已扣款</span>
            </label>
          </div>
        </div>
      `);
    }

    detailRows.push(`
      <div class="border border-glass rounded mb-2 overflow-hidden">
        <div class="insurance-year-header flex justify-between items-center p-2 bg-panel cursor-pointer" data-toggle-key="${key}">
          <span class="text-xs font-bold text-cyan">第 ${i} 年度（${range.rangeText}）</span>
          <span class="text-xs font-mono text-emerald">已扣款：${formatHKD(totalPaid)}</span>
        </div>
        <div class="insurance-expand-body p-2 bg-deep" style="display: ${isOpen ? 'block' : 'none'};">
          ${months.join('')}
        </div>
      </div>
    `);
  }

  return `<div class="mt-3">${detailRows.join('')}</div>`;
}

function renderCard(p, isCompleted, currentYear) {
  const member = members.find((m) => m.id === p.memberId);
  const memberName = member ? member.name : '（未指定）';
  const isFund = p.type === 'fund_insurance';

  const totalPeriods = Number(p.totalPolicyPeriods) || (Number(p.totalPolicyYears || p.totalYears || 0) * 12);
  const done = Number(p.completedPeriods) || 0;
  const pct = totalPeriods > 0 ? Math.min(100, Math.round((done / totalPeriods) * 100)) : 0;
  const payments = p._payments || {};

  const cardKey = `card-${p.id}`;
  const isExpanded = expandedKeys.has(cardKey);

  // 需求 B & C 金額計算
  const yearlyContrib = getPolicyYearlyContribution(p, currentYear);
  const lifetimeContrib = getPolicyLifetimeTotal(p);

  if (isFund) {
    return `
      <div class="glass-card policy-card">
        <div class="policy-header">
          <div>
            <div class="policy-name">${escapeHtml(p.name)}</div>
            <div class="policy-company">${escapeHtml(p.company || '—')} · 基金保險</div>
          </div>
          <span class="badge badge-info">月供</span>
        </div>
        <div class="policy-info-grid">
          <div class="policy-info-item">
            <span class="policy-info-label">受保成員</span>
            <span class="policy-info-value">${escapeHtml(memberName)}</span>
          </div>
          <div class="policy-info-item">
            <span class="policy-info-label">${currentYear} 年度供款</span>
            <span class="policy-info-value text-cyan">${formatHKD(yearlyContrib)}</span>
          </div>
          <div class="policy-info-item">
            <span class="policy-info-label">每月供款</span>
            <span class="policy-info-value">${formatHKD(p.monthlyPremium)}</span>
          </div>
          <div class="policy-info-item">
            <span class="policy-info-label">全期總供款</span>
            <span class="policy-info-value">${formatHKD(lifetimeContrib)}</span>
          </div>
        </div>
        <div class="policy-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </div>
      </div>
    `;
  }

  const startDateText = `${getPolicyStartYear(p)}-${String(getPolicyStartMonth(p)).padStart(2, '0')}`;

  return `
    <div class="glass-card policy-card ${isCompleted ? 'opacity-75' : ''}">
      <div class="policy-header">
        <div>
          <div class="policy-name">${escapeHtml(p.name)}</div>
          <div class="policy-company">${escapeHtml(p.company || '—')} · 普通保險</div>
        </div>
        <span class="badge ${isCompleted ? 'badge-success' : 'badge-info'}">${isCompleted ? '已供滿' : '供款中'}</span>
      </div>

      <div class="policy-info-grid">
        <div class="policy-info-item">
          <span class="policy-info-label">${currentYear} 年度供款</span>
          <span class="policy-info-value text-cyan font-bold">${formatHKD(yearlyContrib)}</span>
        </div>
        <div class="policy-info-item">
          <span class="policy-info-label">全期總供款</span>
          <span class="policy-info-value font-bold">${formatHKD(lifetimeContrib)}</span>
        </div>
        <div class="policy-info-item">
          <span class="policy-info-label">受保成員</span>
          <span class="policy-info-value">${escapeHtml(memberName)}</span>
        </div>
        <div class="policy-info-item">
          <span class="policy-info-label">開始日期</span>
          <span class="policy-info-value">${startDateText}</span>
        </div>
      </div>

      <div class="policy-progress">
        <div class="policy-progress-text">
          <span>整體供款進度</span>
          <span>${done} / ${totalPeriods} 期 (${pct}%)</span>
        </div>
        <div class="progress">
          <div class="progress-bar" style="width: ${pct}%;"></div>
        </div>
      </div>

      <div class="policy-actions justify-between items-center">
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost insurance-expand-btn" data-toggle-key="${cardKey}">
            <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}"></i>
            <span>${isExpanded ? '收起明細' : '展開明細'}</span>
          </button>
          ${isCompleted ? `<button class="btn btn-sm btn-ghost text-emerald" data-action="restore" data-id="${p.id}">恢復供款</button>` : ''}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </div>
      </div>

      <div style="display: ${isExpanded ? 'block' : 'none'};">
        ${renderPolicyDetail(p, payments)}
        <div class="flex justify-end mt-2">
          <button class="btn btn-sm btn-primary" data-action="save-card" data-id="${p.id}">儲存明細</button>
        </div>
      </div>
    </div>
  `;
}

function renderTable(list, currentYear) {
  const tbody = document.getElementById('policy-table-body');
  if (!tbody) return;

  const sorted = [...list].sort((a, b) => {
    const da = new Date(getPolicyStartYear(a), getPolicyStartMonth(a) - 1, 1);
    const db = new Date(getPolicyStartYear(b), getPolicyStartMonth(b) - 1, 1);
    return da - db;
  });

  tbody.innerHTML = sorted.map((p) => {
    const member = members.find((m) => m.id === p.memberId);
    const memberName = member ? member.name : '（未指定）';
    const isFund = p.type === 'fund_insurance';

    const totalPeriods = Number(p.totalPolicyPeriods) || (Number(p.totalPolicyYears || p.totalYears || 0) * 12);
    const done = Number(p.completedPeriods) || 0;
    const pct = totalPeriods > 0 ? Math.min(100, Math.round((done / totalPeriods) * 100)) : 0;

    const yearlyContrib = getPolicyYearlyContribution(p, currentYear);
    const lifetimeContrib = getPolicyLifetimeTotal(p);

    const startDateText = `${getPolicyStartYear(p)}-${String(getPolicyStartMonth(p)).padStart(2, '0')}`;
    const monthly = isFund ? p.monthlyPremium : (p.periods?.[String(p.currentPeriodIndex || 1)]?.monthlyAverage || p.monthlyAverage || 0);

    const payments = p._payments || {};
    const tableKey = `table-${p.id}`;
    const isExpanded = expandedKeys.has(tableKey);

    return `
      <tr>
        <td>${startDateText}</td>
        <td>${escapeHtml(memberName)}</td>
        <td class="font-bold text-cyan">${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.company || '—')}</td>
        <td class="num text-cyan font-bold">${formatHKD(yearlyContrib)}</td>
        <td class="num font-bold">${formatHKD(lifetimeContrib)}</td>
        <td class="num">${formatHKD(monthly)}</td>
        <td class="progress-cell">
          <div class="progress-text">${done} / ${totalPeriods} 期 (${pct}%)</div>
          <div class="progress"><div class="progress-bar" style="width: ${pct}%;"></div></div>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-sm btn-ghost" data-toggle-key="${tableKey}">${isExpanded ? '收起' : '明細'}</button>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </td>
      </tr>
      <tr style="display: ${isExpanded ? 'table-row' : 'none'};">
        <td colspan="9" class="bg-deep p-4">
          ${renderPolicyDetail(p, payments)}
          <div class="flex justify-end mt-2">
            <button class="btn btn-sm btn-primary" data-action="save-card" data-id="${p.id}">儲存明細</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/* ============================================ 折疊切換與按鈕事件 ============================================ */
document.addEventListener('click', async (e) => {
  // 處理年度折疊
  const yearHeader = e.target.closest('.insurance-year-header');
  if (yearHeader) {
    const key = yearHeader.dataset.toggleKey;
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    renderAll();
    return;
  }

  // 處理卡片/表格明細折疊
  const expandBtn = e.target.closest('.insurance-expand-btn');
  if (expandBtn) {
    const key = expandBtn.dataset.toggleKey;
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    renderAll();
    return;
  }

  // 處理表格內的展開按鈕
  const toggleBtn = e.target.closest('button[data-toggle-key]');
  if (toggleBtn && !toggleBtn.classList.contains('insurance-expand-btn')) {
    const key = toggleBtn.dataset.toggleKey;
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    renderAll();
    return;
  }

  // 處理「儲存明細」按鈕
  const saveBtn = e.target.closest('button[data-action="save-card"]');
  if (saveBtn) {
    const policyId = saveBtn.dataset.id;
    const policy = policies.find((x) => x.id === policyId);
    if (!policy) return;
    await saveCardDetails(policy);
    return;
  }

  // 其他操作按鈕
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const p = policies.find((x) => x.id === id);
  if (!p) return;

  if (action === 'add-period') {
    const periodIndex = Number(btn.dataset.index);
    const range = getPeriodRange(p, periodIndex);
    document.getElementById('add-period-policy-id').value = p.id;
    document.getElementById('add-period-index').value = periodIndex;
    document.getElementById('add-period-range').value = `第 ${periodIndex} 年度 (${range.rangeText})`;
    const prevData = (p.periods || {})[String(periodIndex - 1)];
    document.getElementById('add-period-annual').value = prevData ? prevData.annualPremium : '';
    document.getElementById('add-period-monthly').value = prevData ? prevData.monthlyAverage : '';
    document.getElementById('add-period-modal').classList.add('active');
  } else if (action === 'edit') {
    editingId = id;
    document.getElementById('policy-modal-title').textContent = '編輯保單';
    document.getElementById('policy-type').value = p.type || 'normal';
    document.getElementById('policy-member').value = p.memberId || '';
    document.getElementById('policy-name').value = p.name || '';
    renderCompanyOptions();
    document.getElementById('policy-company').value = p.company || DEFAULT_COMPANIES[0];
    document.getElementById('policy-start-year').value = getPolicyStartYear(p);
    document.getElementById('policy-start-month').value = String(getPolicyStartMonth(p)).padStart(2, '0');
    document.getElementById('policy-current-period').value = p.currentPeriodIndex || 1;
    document.getElementById('policy-total-years').value = p.totalPolicyYears || p.totalYears || 1;
    document.getElementById('policy-payment-type').value = p.paymentType || '年繳';
    document.getElementById('policy-account').value = p.account || '';

    const curPeriodData = (p.periods || {})[String(p.currentPeriodIndex || 1)];
    if (curPeriodData) {
      document.getElementById('policy-annual').value = curPeriodData.annualPremium || '';
      document.getElementById('policy-monthly').value = curPeriodData.monthlyAverage || '';
    }
    document.getElementById('policy-modal').classList.add('active');
  } else if (action === 'restore') {
    if (confirm('確定要恢復此保單的供款狀態嗎？')) {
      await updateInsurancePolicyV2(p.id, { ...p, isCompleted: false });
    }
  } else if (action === 'delete') {
    if (confirm(`⚠️ 確定要刪除保單「${p.name}」嗎？\n\n這將會一併刪除所有相關的扣款紀錄與成員支出，此操作無法復原。`)) {
      try {
        await deleteInsurancePolicyAndData(p.id, p.memberId);
        alert('✅ 保單與相關紀錄已徹底刪除');
      } catch (err) {
        alert('刪除失敗：' + err.message);
      }
    }
  }
});

/* ============================================ 儲存卡片內的明細 ============================================ */
async function saveCardDetails(policy) {
  const allRows = document.querySelectorAll(`.insurance-month-row[data-policy="${policy.id}"]`);
  if (allRows.length === 0) return alert('沒有可儲存的資料。');

  const promises = [];
  allRows.forEach((row) => {
    const year = row.dataset.year;
    const month = row.dataset.month;
    const amount = Math.round(Number(row.querySelector('.ins-amount').value) || 0);
    const isPaid = row.querySelector('.ins-paid').checked;

    if (isPaid) {
      promises.push(saveInsurancePaymentBatch(policy.id, year, month, { status: '已扣款', amount }));
      promises.push(api.insuranceSync({
        policyId: policy.id,
        memberId: policy.memberId,
        policyName: policy.name,
        monthlyAverage: amount,
        year,
        month
      }));
    } else {
      promises.push(removeInsurancePaymentBatch(policy.id, year, month));
      promises.push(api.insuranceUnsync({
        policyId: policy.id,
        memberId: policy.memberId,
        year,
        month
      }));
    }
  });

  try {
    await Promise.all(promises);
    alert('✅ 明細已儲存');
    renderAll();
  } catch (err) {
    alert('儲存失敗：' + err.message);
  }
}

/* ============================================ Modal 事件綁定 ============================================ */
function bindPolicyModalEvents() {
  const modal = document.getElementById('policy-modal');
  const form = document.getElementById('policy-form');
  const nameInput = document.getElementById('policy-name');
  const annualInput = document.getElementById('policy-annual');
  const monthlyInput = document.getElementById('policy-monthly');
  if (!modal || !form) return;

  annualInput.addEventListener('input', () => {
    const annual = Math.round(Number(annualInput.value) || 0);
    monthlyInput.value = annual > 0 ? Math.round(annual / 12) : '';
  });

  const addPolicyBtn = document.getElementById('add-policy-btn');
  if (addPolicyBtn) {
    addPolicyBtn.addEventListener('click', () => {
      editingId = null;
      document.getElementById('policy-modal-title').textContent = '新增保單';
      form.reset();
      const now = new Date();
      document.getElementById('policy-start-year').value = now.getFullYear();
      document.getElementById('policy-start-month').value = String(now.getMonth() + 1).padStart(2, '0');
      document.getElementById('policy-current-period').value = 1;
      document.getElementById('policy-total-years').value = 5;
      monthlyInput.value = '';
      renderCompanyOptions();
      modal.classList.add('active');
    });
  }

  const addCompBtn = document.getElementById('add-company-btn');
  if (addCompBtn) {
    addCompBtn.addEventListener('click', async () => {
      const name = prompt('請輸入新的保險公司名稱：');
      if (!name || !name.trim()) return;
      try {
        await addInsuranceCompany(name.trim());
        setTimeout(() => {
          const sel = document.getElementById('policy-company');
          if (sel) sel.value = name.trim();
        }, 500);
      } catch (err) {
        alert('新增失敗：' + err.message);
      }
    });
  }

  const editCompBtn = document.getElementById('edit-company-btn');
  if (editCompBtn) {
    editCompBtn.addEventListener('click', async () => {
      const sel = document.getElementById('policy-company');
      const oldName = sel.value;
      if (!oldName) return alert('請先選擇一個要編輯的保險公司。');

      const targetCompany = companies.find((c) => c.name === oldName);
      if (!targetCompany) return alert('找不到該保險公司的資料。');

      const newName = prompt(`請輸入「${oldName}」的新名稱：`, oldName);
      if (!newName || !newName.trim() || newName.trim() === oldName) return;

      const trimmedNewName = newName.trim();
      if (companies.some((c) => c.name === trimmedNewName)) return alert('此名稱已存在。');

      try {
        await updateInsuranceCompany(targetCompany.id, trimmedNewName);
        const updatedCount = await updatePolicyCompanyName(oldName, trimmedNewName);
        alert(`✅ 已將「${oldName}」更名為「${trimmedNewName}」\n同步更新了 ${updatedCount} 張保單。`);
        setTimeout(() => {
          const sel2 = document.getElementById('policy-company');
          if (sel2) sel2.value = trimmedNewName;
        }, 500);
      } catch (err) {
        alert('編輯失敗：' + err.message);
      }
    });
  }

  const cancelBtn = document.getElementById('policy-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const annual = Math.round(Number(annualInput.value) || 0);
    const firstY = Number(document.getElementById('policy-start-year').value);
    const firstM = Number(document.getElementById('policy-start-month').value);
    const currentPeriod = Number(document.getElementById('policy-current-period').value);
    const totalYears = Number(document.getElementById('policy-total-years').value);

    if (firstY < 1900 || firstY > 2100 || firstM < 1 || firstM > 12) return alert('請填寫正確的保單開始年份與月份。');
    if (currentPeriod < 1 || currentPeriod > 100) return alert('「目前是第幾年度」請填寫合理數字。');

    const payload = {
      type: 'normal',
      memberId: document.getElementById('policy-member').value,
      name: nameInput.value.trim(),
      company: document.getElementById('policy-company').value,
      paymentType: document.getElementById('policy-payment-type').value,
      firstStartYear: firstY,
      firstStartMonth: String(firstM).padStart(2, '0'),
      currentPeriodIndex: currentPeriod,
      totalPolicyYears: totalYears,
      totalPolicyPeriods: totalYears * 12,
      totalPremium: annual * totalYears,
      account: document.getElementById('policy-account').value.trim(),
      periods: {},
    };

    const range = getPeriodRange(payload, currentPeriod);
    payload.periods[String(currentPeriod)] = {
      periodIndex: currentPeriod,
      startYear: range.startY,
      startMonth: range.startM,
      annualPremium: annual,
      monthlyAverage: Math.round(annual / 12),
    };

    if (!payload.name || !payload.memberId) return;

    let savedPolicyId = editingId;
    if (editingId) {
      await updateInsurancePolicyV2(editingId, payload);
    } else {
      savedPolicyId = await addInsurancePolicyV2(payload);
      await autoSyncPolicyExpenses({ ...payload, id: savedPolicyId });
    }

    modal.classList.remove('active');
    if (editingId) {
      const updatedPolicy = policies.find((x) => x.id === editingId);
      if (updatedPolicy) await autoSyncPolicyExpenses(updatedPolicy);
      alert('✅ 保單已更新，相關支出已自動同步');
    }
  });
}

function bindAddPeriodModalEvents() {
  const modal = document.getElementById('add-period-modal');
  const form = document.getElementById('add-period-form');
  const annualInput = document.getElementById('add-period-annual');
  const monthlyInput = document.getElementById('add-period-monthly');
  if (!modal || !form) return;

  annualInput.addEventListener('input', () => {
    const annual = Math.round(Number(annualInput.value) || 0);
    monthlyInput.value = annual > 0 ? Math.round(annual / 12) : '';
  });

  const cancelBtn = document.getElementById('add-period-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const policyId = document.getElementById('add-period-policy-id').value;
    const periodIndex = Number(document.getElementById('add-period-index').value);
    const annual = Math.round(Number(annualInput.value) || 0);

    const p = policies.find((x) => x.id === policyId);
    if (!p) return;

    const range = getPeriodRange(p, periodIndex);
    await addInsurancePeriod(policyId, periodIndex, {
      startYear: range.startY,
      startMonth: range.startM,
      annualPremium: annual,
      monthlyAverage: Math.round(annual / 12)
    });

    modal.classList.remove('active');
    alert(`✅ 已設定第 ${periodIndex} 年度保費`);

    const updatedPolicy = policies.find((x) => x.id === policyId);
    if (updatedPolicy) {
      if (!updatedPolicy.periods) updatedPolicy.periods = {};
      updatedPolicy.periods[String(periodIndex)] = {
        periodIndex,
        startYear: range.startY,
        startMonth: range.startM,
        annualPremium: annual,
        monthlyAverage: Math.round(annual / 12)
      };
      await autoSyncPolicyExpenses(updatedPolicy);
    }
  });
}

function renderMemberOptions() {
  const sel = document.getElementById('policy-member');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— 請選擇 —</option>` + members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  if (current) sel.value = current;
}
```
