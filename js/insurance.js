// ============================================
// insurance.js — 保險付款（雙模式 + 卡片內折疊明細）
// ============================================

import {
  listenInsurancePolicies, addInsurancePolicyV2, updateInsurancePolicyV2,
  listenMembers, addInsurancePeriod,
  getInsurancePaymentsOnce, saveInsurancePaymentBatch, removeInsurancePaymentBatch,
  deleteInsurancePolicyAndData,
  listenInsuranceCompanies, addInsuranceCompany, updateInsuranceCompany, updatePolicyCompanyName,
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
let expandedKeys = new Set();

let globalListenersBound = false;

export function initInsurancePage() {
  const monthSel = document.getElementById('policy-start-month');
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;

  bindPolicyModalEvents();
  bindAddPeriodModalEvents();
  bindViewToggle();
  bindCompletedToggle();
  bindGlobalListeners();

  document.getElementById('sync-all-btn').addEventListener('click', async () => {
    if (!confirm('確定要重新同步所有保單的已扣款支出嗎？')) return;
    try { await syncAllPolicyExpenses(); alert('✅ 已同步所有保單支出'); } catch (err) { alert('同步失敗：' + err.message); }
  });

  listenInsuranceCompanies((list) => {
    companies = list;
    if (list.length === 0 && !window._seededCompanies) {
      window._seededCompanies = true;
      DEFAULT_COMPANIES.forEach(async (name) => { try { await addInsuranceCompany(name); } catch (err) {} });
    }
    renderCompanyOptions();
  });

  listenInsurancePolicies((list) => { policies = list; renderAll(); });
  listenMembers((list) => { members = list; renderMemberOptions(); });
  AppState.on('ym-change', () => renderAll());
}

function bindViewToggle() {
  const cardBtn = document.getElementById('view-card-btn');
  const tableBtn = document.getElementById('view-table-btn');
  const updateUI = () => {
    if (currentView === 'card') {
      cardBtn.classList.add('btn-primary'); cardBtn.classList.remove('btn-ghost');
      tableBtn.classList.add('btn-ghost'); tableBtn.classList.remove('btn-primary');
    } else {
      cardBtn.classList.add('btn-ghost'); cardBtn.classList.remove('btn-primary');
      tableBtn.classList.add('btn-primary'); tableBtn.classList.remove('btn-ghost');
    }
  };
  cardBtn.addEventListener('click', () => { currentView = 'card'; localStorage.setItem('insurance_view', 'card'); updateUI(); renderAll(); });
  tableBtn.addEventListener('click', () => { currentView = 'table'; localStorage.setItem('insurance_view', 'table'); updateUI(); renderAll(); });
  updateUI();
}

function bindCompletedToggle() {
  const header = document.getElementById('completed-header');
  const section = document.getElementById('completed-section');
  const body = document.getElementById('completed-body');
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
  sel.innerHTML = list.map((c) => `<option value="${c.name}">${escapeHtml(c.name)}</option>`).join('');
  if (current && !list.some((c) => c.name === current)) {
    const opt = document.createElement('option'); opt.value = current; opt.textContent = current; sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

/* ============================================
   金額計算（3 種 + 已供款總額）
   ============================================ */

/**
 * 【B】本期年繳：保單在指定年度的年繳保費
 */
function getPolicyAnnualPremium(policy, targetYear) {
  if (policy.type === 'fund_insurance') return 0;

  const year = Number(targetYear);
  const firstY = Number(policy.firstStartYear) || 0;
  if (!firstY || year < firstY) return 0;

  const periodIndex = year - firstY + 1;
  const totalYears = Number(policy.totalPolicyYears) || 0;
  if (totalYears > 0 && periodIndex > totalYears) return 0;

  const periods = policy.periods || {};
  const p = periods[String(periodIndex)];
  if (p && p.annualPremium) return Math.round(Number(p.annualPremium));

  const periodKeys = Object.keys(periods)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  if (periodKeys.length > 0) {
    const below = periodKeys.filter((k) => k <= periodIndex);
    const target = below.length > 0 ? below[below.length - 1] : periodKeys[0];
    const tp = periods[String(target)];
    if (tp && tp.annualPremium) return Math.round(Number(tp.annualPremium));
  }

  return Math.round(Number(policy.annualPremium) || 0);
}

/**
 * 【C】保單總供款：該保單所有供款年期的年繳加總
 */
function getPolicyTotalPremium(policy) {
  if (policy.type === 'fund_insurance') {
    return (Number(policy.monthlyPremium) || 0) * 12 * (Number(policy.totalPolicyYears) || 0);
  }

  const totalYears = Number(policy.totalPolicyYears) || 0;
  if (totalYears === 0) return Math.round(Number(policy.annualPremium) || 0);

  const periods = policy.periods || {};
  const periodKeys = Object.keys(periods)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  let fallback = Math.round(Number(policy.annualPremium) || 0);
  if (!fallback && periodKeys.length > 0) {
    const last = periods[String(periodKeys[periodKeys.length - 1])];
    if (last && last.annualPremium) fallback = Math.round(Number(last.annualPremium));
  }

  let total = 0;
  for (let i = 1; i <= totalYears; i++) {
    const p = periods[String(i)];
    if (p && p.annualPremium) {
      total += Math.round(Number(p.annualPremium));
    } else {
      total += fallback;
    }
  }
  return total;
}

/**
 * 【D】🆕 已供款總額：實際已扣款的月份金額加總
 * - 遍歷 payments 結構，累加所有 status === '已扣款' 的 amount
 * - 基金保險沒有扣款機制，回傳 0
 */
function getPolicyPaidTotal(payments) {
  let total = 0;
  Object.values(payments || {}).forEach((yearData) => {
    Object.values(yearData || {}).forEach((mData) => {
      if (mData && mData.status === '已扣款') {
        total += Math.round(Number(mData.amount) || 0);
      }
    });
  });
  return total;
}

async function autoSyncPolicyExpenses(policy) {
  const payments = await getInsurancePaymentsOnce(policy.id);
  const promises = [];
  for (const [year, months] of Object.entries(payments)) {
    for (const [month, data] of Object.entries(months)) {
      if (data.status === '已扣款') {
        const info = getPeriodInfo(policy, Number(year), Number(month));
        if (!info) continue;
        const periodData = (policy.periods || {})[String(info.periodIndex)];
        const amount = Math.round(data.amount || (periodData ? periodData.monthlyAverage : policy.monthlyAverage) || 0);
        promises.push(api.insuranceSync({ policyId: policy.id, memberId: policy.memberId, policyName: policy.name, monthlyAverage: amount, year, month }));
      }
    }
  }
  await Promise.all(promises);
}

async function syncAllPolicyExpenses() { await Promise.all(policies.map((p) => autoSyncPolicyExpenses(p))); }

function getPeriodRange(policy, periodIndex) {
  const firstY = Number(policy.firstStartYear);
  const firstM = Number(policy.firstStartMonth);
  const startDate = new Date(firstY, firstM - 1, 1);
  startDate.setMonth(startDate.getMonth() + (periodIndex - 1) * 12);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 11);
  return {
    startY: startDate.getFullYear(), startM: String(startDate.getMonth() + 1).padStart(2, '0'),
    endY: endDate.getFullYear(), endM: String(endDate.getMonth() + 1).padStart(2, '0'),
    rangeText: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')} ~ ${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`,
  };
}

function getPeriodInfo(policy, curYear, curMonth) {
  const firstY = Number(policy.firstStartYear);
  const firstM = Number(policy.firstStartMonth);
  if (!firstY || !firstM || firstY < 2000 || firstY > 2100 || firstM < 1 || firstM > 12) return null;
  const startDate = new Date(firstY, firstM - 1, 1);
  const currentDate = new Date(curYear, curMonth - 1, 1);
  const diffMonths = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + (currentDate.getMonth() - startDate.getMonth());
  if (diffMonths < 0) return null;
  const periodIndex = Math.floor(diffMonths / 12) + 1;
  if (policy.totalPolicyYears && periodIndex > policy.totalPolicyYears) return null;
  return { periodIndex, ...getPeriodRange(policy, periodIndex) };
}

function isPolicyCompleted(policy) {
  if (policy.isCompleted) return true;
  if (policy.type === 'fund_insurance') return false;

  const total = Number(policy.totalPolicyPeriods) || 0;
  if (total <= 0) return false;

  const done = Number(policy.completedPeriods) || 0;
  return done >= total;
}

/* ============================================
   renderAll
   ============================================ */
async function renderAll() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';
  const displayYear = Number(year);
  document.getElementById('insurance-month').textContent = isAnnual ? `${year} 年 全年總覽` : `${year} 年 ${month} 月`;

  // 即時計算每張保單的付款紀錄與金額
  const enrichedPolicies = await Promise.all(policies.map(async (p) => {
    let payments = {};
    let completed = 0;

    if (p.type !== 'fund_insurance') {
      payments = await getInsurancePaymentsOnce(p.id);
      Object.values(payments).forEach((yearData) => {
        Object.values(yearData || {}).forEach((mData) => {
          if (mData.status === '已扣款') completed++;
        });
      });
    }

    const currentAnnualPremium = getPolicyAnnualPremium(p, displayYear);
    const totalPremium = getPolicyTotalPremium(p);
    const paidTotal = getPolicyPaidTotal(payments);   // 🆕

    return {
      ...p,
      completedPeriods: completed,
      _payments: payments,
      _currentAnnualPremium: currentAnnualPremium,
      _totalPremium: totalPremium,
      _paidTotal: paidTotal,   // 🆕
    };
  }));

  const completed = enrichedPolicies.filter(isPolicyCompleted);
  const active = enrichedPolicies.filter((p) => !isPolicyCompleted(p));

  const yearTotal = enrichedPolicies.reduce((s, p) => s + (p._currentAnnualPremium || 0), 0);
  const grandTotalEl = document.getElementById('grand-total-premium');
  const grandTotalHintEl = document.getElementById('grand-total-hint');
  const activeCountEl = document.getElementById('active-policy-count');
  const statCompletedEl = document.getElementById('stat-completed-policies');

  if (grandTotalEl) grandTotalEl.textContent = formatHKD(yearTotal);
  if (grandTotalHintEl) grandTotalHintEl.textContent = `${year} 年度 · 共 ${enrichedPolicies.length} 張保單`;
  if (activeCountEl) activeCountEl.textContent = `${active.length} 張`;
  if (statCompletedEl) statCompletedEl.textContent = `${completed.length} 張`;

  const completedSection = document.getElementById('completed-section');
  const completedBody = document.getElementById('completed-body');
  const completedCountEl = document.getElementById('completed-count');
  const completedGridEl = document.getElementById('completed-grid');

  if (completed.length > 0) {
    if (completedSection) completedSection.style.display = 'block';
    if (completedCountEl) completedCountEl.textContent = completed.length;
    if (completedGridEl) completedGridEl.innerHTML = completed.map((p) => renderCard(p, true)).join('');
  } else {
    if (completedSection) {
      completedSection.style.display = 'none';
      completedSection.classList.remove('open');
    }
    if (completedBody) completedBody.style.display = 'none';
    if (completedCountEl) completedCountEl.textContent = '0';
    if (completedGridEl) completedGridEl.innerHTML = '';
  }

  const emptyState = document.getElementById('empty-state');
  const gridEl = document.getElementById('policy-grid');
  const tableEl = document.getElementById('policy-table-view');

  if (enrichedPolicies.length === 0) {
    if (gridEl) gridEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
  } else if (active.length === 0) {
    if (gridEl) gridEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (currentView === 'card') {
      if (gridEl) {
        gridEl.style.display = 'grid';
        gridEl.innerHTML = active.map((p) => renderCard(p, false)).join('');
      }
      if (tableEl) tableEl.style.display = 'none';
    } else {
      if (gridEl) gridEl.style.display = 'none';
      if (tableEl) tableEl.style.display = 'block';
      renderTable(active);
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderPolicyDetail(policy, payments) {
  const totalYears = policy.totalPolicyYears || 1;
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
      const payment = payments[y]?.[m] || {};
      const defaultAmount = Math.round((policy.periods?.[String(i)]?.monthlyAverage) || policy.monthlyAverage || 0);
      const amount = payment.amount ? Math.round(payment.amount) : defaultAmount;
      const isPaid = payment.status === '已扣款';
      if (isPaid) totalPaid += amount;

      months.push(`
        <div class="insurance-month-row" data-policy="${policy.id}" data-year="${y}" data-month="${m}" style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
          <div style="width:80px; font-family:var(--font-mono); font-size:12px;">${y}-${m}</div>
          <input type="number" class="input ins-amount" value="${amount}" min="0" step="1" style="flex:1; padding:4px 10px; font-size:12px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; white-space:nowrap;">
            <input type="checkbox" class="ins-paid" ${isPaid ? 'checked' : ''} style="width:auto;"> 已扣款
          </label>
        </div>
      `);
    }

    detailRows.push(`
      <div class="insurance-year-block" style="margin-bottom:8px; border:1px solid rgba(255,255,255,0.05); border-radius:var(--radius-sm); overflow:hidden;">
        <div class="insurance-year-header" data-toggle-key="${key}" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(0,240,255,0.04); cursor:pointer; user-select:none;">
          <span style="font-size:13px; font-weight:600; color:var(--neon-cyan);">第 ${i} 年度（${range.rangeText}）</span>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="mono" style="font-size:11px; color:var(--text-muted);">已扣款：${formatHKD(totalPaid)}</span>
            <i data-lucide="${isOpen ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;color:var(--text-muted);"></i>
          </div>
        </div>
        <div class="insurance-year-body" style="display:${isOpen ? 'block' : 'none'}; padding:8px 12px;">
          ${months.join('')}
        </div>
      </div>
    `);
  }

  return `<div class="insurance-detail-container">${detailRows.join('')}</div>`;
}

/* ============================================
   卡片渲染 — 顯示 B / C / D
   ============================================ */
function renderCard(p, isCompleted) {
  const member = members.find((m) => m.id === p.memberId);
  const memberName = member ? member.name : '（未指定）';
  const isFund = p.type === 'fund_insurance';
  const totalPeriods = p.totalPolicyPeriods || 0;
  const done = p.completedPeriods || 0;
  const pct = totalPeriods > 0 ? Math.min(100, Math.round((done / totalPeriods) * 100)) : 0;
  const payments = p._payments || {};
  const isExpanded = expandedKeys.has(`card-${p.id}`);
  const cardKey = `card-${p.id}`;
  const currentAnnual = p._currentAnnualPremium || 0;
  const totalPremium = p._totalPremium || 0;
  const paidTotal = p._paidTotal || 0;
  const displayYear = AppState.year;

  if (isFund) {
    return `
      <div class="glass-card policy-card">
        <div class="policy-header">
          <div>
            <div class="policy-name">${escapeHtml(p.name)}</div>
            <div class="policy-company">${escapeHtml(p.company)} · 基金保險</div>
          </div>
        </div>
        <div class="policy-info-grid">
          <div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">每月供款</span><span class="policy-info-value text-cyan">${formatHKD(p.monthlyPremium)}</span></div>
        </div>
        <div class="policy-info-grid" style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.08);">
          <div class="policy-info-item"><span class="policy-info-label">保單總供款</span><span class="policy-info-value text-magenta">${formatHKD(totalPremium)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">供款年期</span><span class="policy-info-value">${p.totalPolicyYears || '—'} 年</span></div>
        </div>
        <div class="policy-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </div>
      </div>`;
  }

  const startDateText = `${p.firstStartYear}-${p.firstStartMonth}`;
  const remaining = Math.max(0, totalPremium - paidTotal);
  return `
    <div class="glass-card policy-card">
      <div class="policy-header">
        <div>
          <div class="policy-name">${escapeHtml(p.name)}</div>
          <div class="policy-company">${escapeHtml(p.company)} · 普通保險</div>
        </div>
      </div>
      <div class="policy-info-grid">
        <div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div>
        <div class="policy-info-item"><span class="policy-info-label">開始日期</span><span class="policy-info-value">${startDateText}</span></div>
      </div>
      <div class="policy-info-grid" style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.08);">
        <div class="policy-info-item"><span class="policy-info-label">本期年繳（${displayYear}）</span><span class="policy-info-value text-cyan">${formatHKD(currentAnnual)}</span></div>
        <div class="policy-info-item"><span class="policy-info-label">保單總供款</span><span class="policy-info-value text-magenta">${formatHKD(totalPremium)}</span></div>
        <div class="policy-info-item"><span class="policy-info-label">已供款總額</span><span class="policy-info-value text-emerald">${formatHKD(paidTotal)}</span></div>
        <div class="policy-info-item"><span class="policy-info-label">剩餘供款</span><span class="policy-info-value text-orange">${formatHKD(remaining)}</span></div>
      </div>
      <div class="policy-progress" style="margin-top:12px;">
        <div class="policy-progress-text"><span>整體供款進度</span><span>${done} / ${totalPeriods} 期 (${pct}%)</span></div>
        <div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div>
      </div>
      <div style="margin-top:12px;">
        <button class="btn btn-sm btn-ghost insurance-expand-btn" data-toggle-key="${cardKey}" style="width:100%; justify-content:space-between;">
          <span>${isExpanded ? '收起明細' : '展開明細'}</span>
          <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;"></i>
        </button>
        <div class="insurance-expand-body" data-body-key="${cardKey}" style="display:${isExpanded ? 'block' : 'none'}; margin-top:10px;">
          ${renderPolicyDetail(p, payments)}
        </div>
      </div>
      <div class="policy-actions">
        <button class="btn btn-sm btn-ghost" data-action="save-card" data-id="${p.id}">儲存明細</button>
        ${isCompleted ? `<button class="btn btn-sm btn-ghost" data-action="restore" data-id="${p.id}">恢復供款</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
      </div>
    </div>`;
}

/* ============================================
   表格渲染 — 新增「已供款總額」欄位
   ============================================ */
function renderTable(list) {
  const tbody = document.getElementById('policy-table-body');
  const sorted = [...list].sort((a, b) => {
    const da = new Date(Number(a.firstStartYear), Number(a.firstStartMonth) - 1, 1);
    const db = new Date(Number(b.firstStartYear), Number(b.firstStartMonth) - 1, 1);
    return da - db;
  });

  tbody.innerHTML = sorted.map((p) => {
    const member = members.find((m) => m.id === p.memberId);
    const memberName = member ? member.name : '（未指定）';
    const isFund = p.type === 'fund_insurance';
    const totalPeriods = p.totalPolicyPeriods || 0;
    const done = p.completedPeriods || 0;
    const pct = totalPeriods > 0 ? Math.min(100, Math.round((done / totalPeriods) * 100)) : 0;
    const currentAnnual = p._currentAnnualPremium || 0;
    const totalPremium = p._totalPremium || 0;
    const paidTotal = p._paidTotal || 0;
    const startDateText = `${p.firstStartYear}-${p.firstStartMonth}`;
    const monthly = isFund ? p.monthlyPremium : (p.periods?.[String(p.currentPeriodIndex || 1)]?.monthlyAverage || p.monthlyAverage || 0);
    const payments = p._payments || {};
    const tableKey = `table-${p.id}`;
    const isExpanded = expandedKeys.has(tableKey);

    return `
      <tr>
        <td>
          <button class="btn btn-sm btn-ghost" data-toggle-key="${tableKey}" style="padding:2px 6px;">
            <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;"></i>
          </button>
        </td>
        <td class="mono hide-mobile" style="font-size:12px;">${startDateText}</td>
        <td class="hide-mobile">${escapeHtml(memberName)}</td>
        <td class="policy-name-cell">${escapeHtml(p.name)}</td>
        <td class="hide-mobile" style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.company || '—')}</td>
        <td class="num text-cyan">${formatHKD(currentAnnual)}</td>
        <td class="num text-magenta hide-mobile">${formatHKD(totalPremium)}</td>
        <td class="num text-emerald">${formatHKD(paidTotal)}</td>
        <td class="num text-magenta hide-mobile">${formatHKD(monthly)}</td>
        <td class="progress-cell">
          <div class="progress-text">${done} / ${totalPeriods} 期 (${pct}%)</div>
          <div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div>
        </td>
        <td>
          <button class="btn btn-sm btn-ghost" data-action="save-card" data-id="${p.id}">儲存</button>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </td>
      </tr>
      <tr class="insurance-table-detail-row" style="display:${isExpanded ? 'table-row' : 'none'};">
        <td colspan="11">
          <div class="detail-wrapper">
            ${renderPolicyDetail(p, payments)}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}
function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;

  document.addEventListener('click', async (e) => {
    const yearHeader = e.target.closest('.insurance-year-header');
    if (yearHeader) {
      const key = yearHeader.dataset.toggleKey;
      if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key);
      renderAll();
      return;
    }

    const expandBtn = e.target.closest('.insurance-expand-btn');
    if (expandBtn) {
      const key = expandBtn.dataset.toggleKey;
      if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key);
      renderAll();
      return;
    }

    const toggleBtn = e.target.closest('button[data-toggle-key]');
    if (toggleBtn && !toggleBtn.classList.contains('insurance-expand-btn')) {
      const key = toggleBtn.dataset.toggleKey;
      if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key);
      renderAll();
      return;
    }

    const saveBtn = e.target.closest('button[data-action="save-card"]');
    if (saveBtn) {
      const policyId = saveBtn.dataset.id;
      const policy = policies.find((x) => x.id === policyId);
      if (!policy) return;
      await saveCardDetails(policy);
      return;
    }

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
      document.getElementById('policy-start-year').value = p.firstStartYear || '';
      document.getElementById('policy-start-month').value = p.firstStartMonth || '01';
      document.getElementById('policy-current-period').value = p.currentPeriodIndex || 1;
      document.getElementById('policy-total-years').value = p.totalPolicyYears || 1;
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
        try { await deleteInsurancePolicyAndData(p.id, p.memberId); alert('✅ 保單與相關紀錄已徹底刪除'); } catch (err) { alert('刪除失敗：' + err.message); }
      }
    }
  });
}

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
      promises.push(api.insuranceSync({ policyId: policy.id, memberId: policy.memberId, policyName: policy.name, monthlyAverage: amount, year, month }));
    } else {
      promises.push(removeInsurancePaymentBatch(policy.id, year, month));
      promises.push(api.insuranceUnsync({ policyId: policy.id, memberId: policy.memberId, year, month }));
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

function bindPolicyModalEvents() {
  const modal = document.getElementById('policy-modal');
  const form = document.getElementById('policy-form');
  const nameInput = document.getElementById('policy-name');
  const annualInput = document.getElementById('policy-annual');
  const monthlyInput = document.getElementById('policy-monthly');

  annualInput.addEventListener('input', () => {
    const annual = Math.round(Number(annualInput.value) || 0);
    monthlyInput.value = annual > 0 ? Math.round(annual / 12) : '';
  });

  document.getElementById('add-policy-btn').addEventListener('click', () => {
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

  document.getElementById('add-company-btn').addEventListener('click', async () => {
    const name = prompt('請輸入新的保險公司名稱：');
    if (!name || !name.trim()) return;
    try { await addInsuranceCompany(name.trim()); setTimeout(() => { const sel = document.getElementById('policy-company'); if (sel) sel.value = name.trim(); }, 500); } catch (err) { alert('新增失敗：' + err.message); }
  });

  document.getElementById('edit-company-btn').addEventListener('click', async () => {
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
      setTimeout(() => { const sel2 = document.getElementById('policy-company'); if (sel2) sel2.value = trimmedNewName; }, 500);
    } catch (err) { alert('編輯失敗：' + err.message); }
  });

  document.getElementById('policy-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const annual = Math.round(Number(annualInput.value) || 0);
    const firstY = Number(document.getElementById('policy-start-year').value);
    const firstM = Number(document.getElementById('policy-start-month').value);
    const currentPeriod = Number(document.getElementById('policy-current-period').value);
    const totalYears = Number(document.getElementById('policy-total-years').value);
    if (firstY < 2000 || firstY > 2100 || firstM < 1 || firstM > 12) return alert('請填寫正確的保單開始年份與月份。');
    if (currentPeriod < 1 || currentPeriod > 100) return alert('「目前是第幾年度」請填寫合理數字。');

    const payload = {
      type: 'normal', memberId: document.getElementById('policy-member').value,
      name: nameInput.value.trim(), company: document.getElementById('policy-company').value,
      paymentType: document.getElementById('policy-payment-type').value,
      firstStartYear: firstY, firstStartMonth: String(firstM).padStart(2, '0'),
      currentPeriodIndex: currentPeriod, totalPolicyYears: totalYears, totalPolicyPeriods: totalYears * 12,
      totalPremium: annual * totalYears,
      account: document.getElementById('policy-account').value.trim(), periods: {},
    };

    const range = getPeriodRange(payload, currentPeriod);
    payload.periods[String(currentPeriod)] = {
      periodIndex: currentPeriod, startYear: range.startY, startMonth: range.startM,
      annualPremium: annual, monthlyAverage: Math.round(annual / 12),
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

  annualInput.addEventListener('input', () => {
    const annual = Math.round(Number(annualInput.value) || 0);
    monthlyInput.value = annual > 0 ? Math.round(annual / 12) : '';
  });

  document.getElementById('add-period-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const policyId = document.getElementById('add-period-policy-id').value;
    const periodIndex = Number(document.getElementById('add-period-index').value);
    const annual = Math.round(Number(annualInput.value) || 0);
    const p = policies.find((x) => x.id === policyId);
    if (!p) return;
    const range = getPeriodRange(p, periodIndex);
    await addInsurancePeriod(policyId, periodIndex, { startYear: range.startY, startMonth: range.startM, annualPremium: annual, monthlyAverage: Math.round(annual / 12) });
    modal.classList.remove('active');
    alert(`✅ 已設定第 ${periodIndex} 年度保費`);
    const updatedPolicy = policies.find((x) => x.id === policyId);
    if (updatedPolicy) {
      if (!updatedPolicy.periods) updatedPolicy.periods = {};
      updatedPolicy.periods[String(periodIndex)] = { periodIndex, startYear: range.startY, startMonth: range.startM, annualPremium: annual, monthlyAverage: Math.round(annual / 12) };
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
