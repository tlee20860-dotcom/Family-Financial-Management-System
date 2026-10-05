// ============================================
// insurance.js — 保險付款（年度化重構 + 自動同步）
// ============================================

import {
  listenInsurancePolicies, addInsurancePolicyV2, updateInsurancePolicyV2, removeInsurancePolicy,
  listenMembers, listenInsurancePayment, addInsurancePeriod,
  getInsurancePaymentsOnce, saveInsurancePaymentBatch, removeInsurancePaymentBatch,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

const COMPANIES = ['富通', '保誠', 'FWD', 'AIA', '宏利', 'AXA'];
let policies = [];
let members = [];
let editingId = null;
let currentDetailPolicy = null;

export function initInsurancePage() {
  const monthSel = document.getElementById('policy-start-month');
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;

  bindPolicyModalEvents();
  bindAddPeriodModalEvents();
  bindDetailModalEvents();

  // 🆕 同步所有支出按鈕
  document.getElementById('sync-all-btn').addEventListener('click', async () => {
    if (!confirm('確定要重新同步所有保單的已扣款支出嗎？\n（這會覆蓋成員支出中保險平攤的金額）')) return;
    try {
      await syncAllPolicyExpenses();
      alert('✅ 已同步所有保單支出');
    } catch (err) {
      alert('同步失敗：' + err.message);
    }
  });

  listenInsurancePolicies((list) => { policies = list; renderGrid(); });
  listenMembers((list) => { members = list; renderMemberOptions(); });
  AppState.on('ym-change', () => renderGrid());
}

/* ============================================
   自動同步邏輯
   ============================================ */
async function autoSyncPolicyExpenses(policy) {
  const payments = await getInsurancePaymentsOnce(policy.id);
  const promises = [];

  for (const [year, months] of Object.entries(payments)) {
    for (const [month, data] of Object.entries(months)) {
      if (data.status === '已扣款') {
        // 找出該月所屬的年度，取得正確的 monthlyAverage
        const curY = Number(year);
        const curM = Number(month);
        const info = getPeriodInfo(policy, curY, curM);
        if (!info) continue;
        
        const periodData = (policy.periods || {})[String(info.periodIndex)];
        const amount = data.amount || (periodData ? periodData.monthlyAverage : policy.monthlyAverage);

        promises.push(api.insuranceSync({
          policyId: policy.id, memberId: policy.memberId, policyName: policy.name,
          monthlyAverage: amount, year, month
        }));
      }
    }
  }
  await Promise.all(promises);
}

async function syncAllPolicyExpenses() {
  const promises = policies.map((p) => autoSyncPolicyExpenses(p));
  await Promise.all(promises);
}

/* ============================================
   年度區間計算工具
   ============================================ */
function getPeriodRange(policy, periodIndex) {
  const firstY = Number(policy.firstStartYear);
  const firstM = Number(policy.firstStartMonth);
  const startDate = new Date(firstY, firstM - 1, 1);
  startDate.setMonth(startDate.getMonth() + (periodIndex - 1) * 12);

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 11);

  const sY = startDate.getFullYear();
  const sM = String(startDate.getMonth() + 1).padStart(2, '0');
  const eY = endDate.getFullYear();
  const eM = String(endDate.getMonth() + 1).padStart(2, '0');

  return { startY: sY, startM: sM, endY: eY, endM: eM, rangeText: `${sY}-${sM} ~ ${eY}-${eM}` };
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

  const range = getPeriodRange(policy, periodIndex);
  return { periodIndex, ...range };
}

/* ============================================
   彈窗內動態渲染明細
   ============================================ */
async function renderDetailBody(policy, periodIndex) {
  const range = getPeriodRange(policy, periodIndex);
  const payments = await getInsurancePaymentsOnce(policy.id);
  const body = document.getElementById('insurance-detail-body');

  let rows = '';
  let totalPaid = 0;
  const detailStartDate = new Date(range.startY, Number(range.startM) - 1, 1);

  for (let i = 0; i < 12; i++) {
    const current = new Date(detailStartDate);
    current.setMonth(current.getMonth() + i);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const monthKey = `${y}-${m}`;
    const payment = payments[y]?.[m] || {};
    const defaultAmount = (policy.periods?.[String(periodIndex)]?.monthlyAverage) || policy.monthlyAverage || 0;
    const amount = payment.amount || defaultAmount;
    const isPaid = payment.status === '已扣款';
    if (isPaid) totalPaid += amount;

    rows += `
      <div class="insurance-detail-row" data-month="${monthKey}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="width:80px; font-family:var(--font-mono); font-size:12px;">${y}-${m}</div>
        <input type="number" class="input ins-amount" value="${amount}" min="0" step="0.01" style="flex:1; padding:6px 10px; font-size:13px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; white-space:nowrap;">
          <input type="checkbox" class="ins-paid" ${isPaid ? 'checked' : ''} style="width:auto;"> 已扣款
        </label>
      </div>
    `;
  }

  const totalYears = policy.totalPolicyYears || 1;
  let periodOptions = '';
  for (let i = 1; i <= totalYears; i++) {
    const r = getPeriodRange(policy, i);
    periodOptions += `<option value="${i}" ${i === periodIndex ? 'selected' : ''}>第 ${i} 年度 (${r.rangeText})</option>`;
  }

  body.innerHTML = `
    <div style="margin-bottom:12px;">
      <label class="field-label" style="margin-bottom:6px;">選擇年度</label>
      <select class="select" id="detail-period-select" style="width:100%; padding:8px 12px; font-size:14px;">
        ${periodOptions}
      </select>
    </div>
    <div style="max-height:50vh; overflow-y:auto;">${rows}</div>
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--glass-border); display:flex; justify-content:space-between;">
      <span style="font-size:12px; color:var(--text-muted);">本期已扣款：${formatHKD(totalPaid)}</span>
    </div>
  `;

  document.getElementById('detail-period-select').addEventListener('change', (e) => {
    const newPeriodIndex = Number(e.target.value);
    renderDetailBody(policy, newPeriodIndex);
  });
}

async function openDetailModal(p) {
  let curY, curM;
  if (AppState.month === 'all') {
    const firstY = Number(p.firstStartYear);
    const firstM = Number(p.firstStartMonth);
    const cp = Number(p.currentPeriodIndex) || 1;
    const startDate = new Date(firstY, firstM - 1, 1);
    startDate.setMonth(startDate.getMonth() + (cp - 1) * 12);
    curY = startDate.getFullYear();
    curM = startDate.getMonth() + 1;
  } else {
    curY = Number(AppState.year);
    curM = Number(AppState.month);
  }

  const info = getPeriodInfo(p, curY, curM);
  if (!info) return alert('無法計算保單年度，請確認保單開始日期是否正確。');

  currentDetailPolicy = p;
  document.getElementById('insurance-detail-title').textContent = `${p.name} - 付款明細`;

  await renderDetailBody(p, info.periodIndex);
  document.getElementById('insurance-detail-modal').classList.add('active');
}

/* ============================================
   原有邏輯
   ============================================ */

function bindPolicyModalEvents() {
  const modal = document.getElementById('policy-modal');
  const form = document.getElementById('policy-form');
  const nameInput = document.getElementById('policy-name');
  const annualInput = document.getElementById('policy-annual');
  const monthlyInput = document.getElementById('policy-monthly');

  annualInput.addEventListener('input', () => {
    const annual = Number(annualInput.value) || 0;
    monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
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
    modal.classList.add('active');
  });

  document.getElementById('policy-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const annual = Number(annualInput.value) || 0;
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
      account: document.getElementById('policy-account').value.trim(), periods: {},
    };

    const range = getPeriodRange(payload, currentPeriod);
    payload.periods[String(currentPeriod)] = {
      periodIndex: currentPeriod,
      startYear: range.startY,
      startMonth: range.startM,
      annualPremium: annual,
      monthlyAverage: annual / 12
    };

    if (!payload.name || !payload.memberId) return;

    let savedPolicyId = editingId;
    if (editingId) {
      await updateInsurancePolicyV2(editingId, payload);
    } else {
      savedPolicyId = await addInsurancePolicyV2(payload);
      // 新增時，需要把剛建好的保單物件傳給同步函式（此時本機還沒刷新，需要手動組裝）
      const newPolicyObj = { ...payload, id: savedPolicyId };
      await autoSyncPolicyExpenses(newPolicyObj);
    }
    
    modal.classList.remove('active');
    
    // 🆕 編輯成功後，自動同步該保單的所有已扣款支出
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
    const annual = Number(annualInput.value) || 0;
    monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
  });

  document.getElementById('add-period-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const policyId = document.getElementById('add-period-policy-id').value;
    const periodIndex = Number(document.getElementById('add-period-index').value);
    const annual = Number(annualInput.value) || 0;
    const p = policies.find((x) => x.id === policyId);
    if (!p) return;

    const range = getPeriodRange(p, periodIndex);
    await addInsurancePeriod(policyId, periodIndex, {
      startYear: range.startY, startMonth: range.startM,
      annualPremium: annual, monthlyAverage: annual / 12
    });
    
    modal.classList.remove('active');
    alert(`✅ 已設定第 ${periodIndex} 年度保費`);
    
    // 🆕 新增年度後，自動同步該保單的所有已扣款支出
    const updatedPolicy = policies.find((x) => x.id === policyId);
    if (updatedPolicy) {
      // 手動更新本機的 periods 以便同步時能抓到正確金額
      if (!updatedPolicy.periods) updatedPolicy.periods = {};
      updatedPolicy.periods[String(periodIndex)] = {
        periodIndex, startYear: range.startY, startMonth: range.startM,
        annualPremium: annual, monthlyAverage: annual / 12
      };
      await autoSyncPolicyExpenses(updatedPolicy);
    }
  });
}

function bindDetailModalEvents() {
  const modal = document.getElementById('insurance-detail-modal');
  document.getElementById('insurance-detail-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  document.getElementById('insurance-detail-save-btn').addEventListener('click', async () => {
    if (!currentDetailPolicy) return;
    const p = currentDetailPolicy;
    const rows = document.querySelectorAll('.insurance-detail-row');
    const promises = [];

    rows.forEach((row) => {
      const month = row.dataset.month;
      const amount = Number(row.querySelector('.ins-amount').value) || 0;
      const isPaid = row.querySelector('.ins-paid').checked;
      const [yearStr, monthStr] = month.split('-');

      if (isPaid) {
        promises.push(saveInsurancePaymentBatch(p.id, yearStr, monthStr, { status: '已扣款', amount }));
        promises.push(api.insuranceSync({
          policyId: p.id, memberId: p.memberId, policyName: p.name,
          monthlyAverage: amount, year: yearStr, month: monthStr
        }));
      } else {
        promises.push(removeInsurancePaymentBatch(p.id, yearStr, monthStr));
        promises.push(api.insuranceUnsync({
          policyId: p.id, memberId: p.memberId, year: yearStr, month: monthStr
        }));
      }
    });

    try {
      await Promise.all(promises);
      alert('✅ 已批次更新扣款狀態與連動支出');
      modal.classList.remove('active');
      renderGrid();
    } catch (err) {
      console.error('批次同步失敗：', err);
      alert('批次更新失敗：' + err.message);
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

function renderGrid() {
  const grid = document.getElementById('policy-grid');
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';
  const curY = Number(year);
  const curM = Number(month);

  document.getElementById('insurance-month').textContent = isAnnual ? `${year} 年 全年總覽` : `${year} 年 ${month} 月`;

  if (isAnnual) {
    if (!policies.length) {
      grid.innerHTML = `<div class="glass-card" style="grid-column:1/-1;"><div class="empty-state"><i data-lucide="shield" style="width:48px;height:48px;opacity:0.4;"></i><p style="margin-top:12px;">尚無保單資料，點擊「新增保單」開始。</p></div></div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = policies.map((p) => {
      const member = members.find((m) => m.id === p.memberId);
      const memberName = member ? member.name : '（未指定）';
      const isFund = p.type === 'fund_insurance';
      const totalPeriods = p.totalPolicyPeriods || 0;
      let yearlyPremium = 0;
      Object.values(p.periods || {}).forEach((per) => { if (per.startYear === curY) yearlyPremium += Number(per.annualPremium) || 0; });

      if (isFund) {
        return `<div class="glass-card policy-card"><div class="policy-header"><div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 基金保險</div></div></div><div class="policy-info-grid"><div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div><div class="policy-info-item"><span class="policy-info-label">每月供款</span><span class="policy-info-value text-cyan">${formatHKD(p.monthlyPremium)}</span></div></div><div class="policy-actions"><button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button></div></div>`;
      }

      return `<div class="glass-card policy-card"><div class="policy-header"><div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 普通保險</div></div></div><div class="policy-info-grid"><div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div><div class="policy-info-item"><span class="policy-info-label">本年度保費</span><span class="policy-info-value text-cyan">${formatHKD(yearlyPremium)}</span></div></div><div class="policy-progress" style="margin-top:12px;"><div class="policy-progress-text"><span>整體供款進度</span><span id="overall-${p.id}">- / ${totalPeriods} 期</span></div><div class="progress"><div class="progress-bar" id="overall-bar-${p.id}" style="width:0%;"></div></div></div><div class="policy-actions" style="margin-top:10px;"><button class="btn btn-sm btn-primary" data-action="detail" data-id="${p.id}">查看明細</button><button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button></div></div>`;
    }).join('');

    policies.forEach(async (p) => {
      if (p.type === 'fund_insurance') return;
      const all = await getInsurancePaymentsOnce(p.id);
      let overallDone = 0;
      Object.values(all).forEach((yearData) => { Object.values(yearData || {}).forEach((mData) => { if (mData.status === '已扣款') overallDone++; }); });
      const totalP = p.totalPolicyPeriods || 0;
      const overallPct = totalP > 0 ? Math.round((overallDone / totalP) * 100) : 0;
      const overallEl = document.getElementById(`overall-${p.id}`);
      const overallBar = document.getElementById(`overall-bar-${p.id}`);
      if (overallEl) overallEl.textContent = `${overallDone} / ${totalP} 期 (${overallPct}%)`;
      if (overallBar) overallBar.style.width = `${overallPct}%`;
    });

    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const visiblePolicies = policies.filter((p) => { if (p.type === 'fund_insurance') return true; return getPeriodInfo(p, curY, curM) !== null; });

  if (!visiblePolicies.length) {
    grid.innerHTML = `<div class="glass-card" style="grid-column:1/-1;"><div class="empty-state"><i data-lucide="shield" style="width:48px;height:48px;opacity:0.4;"></i><p style="margin-top:12px;">本月尚無應扣款的保單。</p></div></div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  grid.innerHTML = visiblePolicies.map((p) => {
    const member = members.find((m) => m.id === p.memberId);
    const memberName = member ? member.name : '（未指定）';
    const isFund = p.type === 'fund_insurance';

    if (isFund) {
      return `<div class="glass-card policy-card"><div class="policy-header"><div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 基金保險</div></div></div><div class="policy-info-grid"><div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div><div class="policy-info-item"><span class="policy-info-label">每月供款</span><span class="policy-info-value text-cyan">${formatHKD(p.monthlyPremium)}</span></div></div><div class="policy-actions"><button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button></div></div>`;
    }

    const info = getPeriodInfo(p, curY, curM);
    const periodData = (p.periods || {})[String(info.periodIndex)];

    if (!periodData) {
      return `<div class="glass-card policy-card"><div class="policy-header"><div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 普通保險</div></div></div><div class="policy-info-grid"><div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div><div class="policy-info-item"><span class="policy-info-label">當前年度</span><span class="policy-info-value">第 ${info.periodIndex} 年度</span></div><div class="policy-info-item" style="grid-column:1/-1;"><span class="policy-info-label">年度區間</span><span class="policy-info-value">${info.rangeText}</span></div></div><div class="banner banner-magenta" style="margin:10px 0;">⚠️ 尚未設定本年度保費</div><div class="policy-actions"><button class="btn btn-sm btn-primary" data-action="add-period" data-id="${p.id}" data-index="${info.periodIndex}">➕ 新增第 ${info.periodIndex} 年度保費</button><button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button></div></div>`;
    }

    const totalPeriods = p.totalPolicyPeriods || 0;
    return `<div class="glass-card policy-card"><div class="policy-header"><div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 普通保險</div></div></div><div class="policy-info-grid"><div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div><div class="policy-info-item"><span class="policy-info-label">當前年度</span><span class="policy-info-value">第 ${info.periodIndex} 年度</span></div><div class="policy-info-item" style="grid-column:1/-1;"><span class="policy-info-label">年度區間</span><span class="policy-info-value">${info.rangeText}</span></div><div class="policy-info-item"><span class="policy-info-label">年繳保費</span><span class="policy-info-value text-cyan">${formatHKD(periodData.annualPremium)}</span></div><div class="policy-info-item"><span class="policy-info-label">每月分攤</span><span class="policy-info-value text-magenta">${formatHKD(periodData.monthlyAverage)}</span></div></div><div class="policy-progress" style="margin-top:12px;"><div class="policy-progress-text"><span>整體供款進度</span><span id="overall-${p.id}">- / ${totalPeriods} 期</span></div><div class="progress"><div class="progress-bar" id="overall-bar-${p.id}" style="width:0%;"></div></div><div class="policy-progress-text" style="margin-top:6px;"><span>本年度進度</span><span id="yearly-${p.id}">- / 12 期</span></div><div class="progress"><div class="progress-bar" id="yearly-bar-${p.id}" style="width:0%;"></div></div></div><div class="policy-actions"><button class="btn btn-sm btn-primary" data-action="detail" data-id="${p.id}">查看明細</button><label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); cursor:pointer; margin-right:10px;"><input type="checkbox" class="policy-paid-checkbox" data-action="toggle-paid" data-id="${p.id}" style="width:auto; cursor:pointer;">本月已扣款</label><button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button></div></div>`;
  }).join('');

  visiblePolicies.forEach(async (p) => {
    if (p.type === 'fund_insurance') return;
    const info = getPeriodInfo(p, curY, curM);
    if (!info) return;
    const periodData = (p.periods || {})[String(info.periodIndex)];
    if (!periodData) return;

    const cb = grid.querySelector(`.policy-paid-checkbox[data-id="${p.id}"]`);
    if (cb) { listenInsurancePayment(p.id, year, month, (data) => { cb.checked = data.status === '已扣款'; }); }

    const all = await getInsurancePaymentsOnce(p.id);
    let overallDone = 0;
    Object.values(all).forEach((yearData) => { Object.values(yearData || {}).forEach((mData) => { if (mData.status === '已扣款') overallDone++; }); });
    let yearlyDone = 0;
    Object.entries(all).forEach(([y, months]) => { Object.entries(months || {}).forEach(([m, data]) => { if (data.status === '已扣款') { const tmpInfo = getPeriodInfo(p, Number(y), Number(m)); if (tmpInfo && tmpInfo.periodIndex === info.periodIndex) yearlyDone++; } }); });

    const totalP = p.totalPolicyPeriods || 0;
    const overallPct = totalP > 0 ? Math.round((overallDone / totalP) * 100) : 0;
    const yearlyPct = Math.round((yearlyDone / 12) * 100);
    const overallEl = document.getElementById(`overall-${p.id}`);
    const overallBar = document.getElementById(`overall-bar-${p.id}`);
    const yearlyEl = document.getElementById(`yearly-${p.id}`);
    const yearlyBar = document.getElementById(`yearly-bar-${p.id}`);
    if (overallEl) overallEl.textContent = `${overallDone} / ${totalP} 期 (${overallPct}%)`;
    if (overallBar) overallBar.style.width = `${overallPct}%`;
    if (yearlyEl) yearlyEl.textContent = `${yearlyDone} / 12 期 (${yearlyPct}%)`;
    if (yearlyBar) yearlyBar.style.width = `${yearlyPct}%`;
  });

  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const p = policies.find((x) => x.id === id);

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
    document.getElementById('policy-company').value = p.company || COMPANIES[0];
    document.getElementById('policy-start-year').value = p.firstStartYear || '';
    document.getElementById('policy-start-month').value = p.firstStartMonth || '01';
    document.getElementById('policy-current-period').value = p.currentPeriodIndex || 1;
    document.getElementById('policy-total-years').value = p.totalPolicyYears || 1;
    document.getElementById('policy-payment-type').value = p.paymentType || '年繳';
    document.getElementById('policy-account').value = p.account || '';
    const curPeriodData = (p.periods || {})[String(p.currentPeriodIndex || 1)];
    if (curPeriodData) { document.getElementById('policy-annual').value = curPeriodData.annualPremium || ''; document.getElementById('policy-monthly').value = curPeriodData.monthlyAverage || ''; }
    document.getElementById('policy-modal').classList.add('active');
  } else if (action === 'detail') {
    openDetailModal(p);
  } else if (action === 'delete') {
    if (confirm(`確定要刪除保單「${p.name}」嗎？`)) await removeInsurancePolicy(id);
  }
});

document.addEventListener('change', async (e) => {
  const cb = e.target.closest('input[data-action="toggle-paid"]');
  if (!cb) return;
  const { year, month } = AppState.getYearMonth();
  if (month === 'all') return;
  const p = policies.find((x) => x.id === cb.dataset.id);
  if (!p) return;
  const info = getPeriodInfo(p, Number(year), Number(month));
  if (!info) return;
  const periodData = (p.periods || {})[String(info.periodIndex)];
  if (!periodData) return;

  if (cb.checked) {
    try { await api.insuranceSync({ policyId: p.id, memberId: p.memberId, policyName: p.name, monthlyAverage: periodData.monthlyAverage, year, month }); } catch (err) { console.warn('同步失敗：', err); }
  } else {
    try { await api.insuranceUnsync({ policyId: p.id, memberId: p.memberId, year, month }); } catch (err) { console.warn('取消連動失敗：', err); }
  }
  renderGrid();
});
