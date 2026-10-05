// ============================================
// insurance.js — 保險付款（雙視圖 + 總供款 + 已供滿歸類）
// ============================================

import {
  listenInsurancePolicies, addInsurancePolicyV2, updateInsurancePolicyV2,
  listenMembers, listenInsurancePayment, addInsurancePeriod,
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
let currentDetailPolicy = null;
let currentView = localStorage.getItem('insurance_view') || 'card';

export function initInsurancePage() {
  const monthSel = document.getElementById('policy-start-month');
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  monthSel.innerHTML = monthOpts;

  bindPolicyModalEvents();
  bindAddPeriodModalEvents();
  bindDetailModalEvents();
  bindViewToggle();
  bindCompletedToggle();

  document.getElementById('sync-all-btn').addEventListener('click', async () => {
    if (!confirm('確定要重新同步所有保單的已扣款支出嗎？\n（這會覆蓋成員支出中保險平攤的金額）')) return;
    try {
      await syncAllPolicyExpenses();
      alert('✅ 已同步所有保單支出');
    } catch (err) {
      alert('同步失敗：' + err.message);
    }
  });

  listenInsuranceCompanies((list) => {
    companies = list;
    if (list.length === 0 && !window._seededCompanies) {
      window._seededCompanies = true;
      DEFAULT_COMPANIES.forEach(async (name) => {
        try { await addInsuranceCompany(name); } catch (err) { console.warn('寫入預設公司失敗：', err); }
      });
    }
    renderCompanyOptions();
  });

  listenInsurancePolicies((list) => { policies = list; renderAll(); });
  listenMembers((list) => { members = list; renderMemberOptions(); });
  AppState.on('ym-change', () => renderAll());
}

/* ============================================
   視圖切換
   ============================================ */
function bindViewToggle() {
  const cardBtn = document.getElementById('view-card-btn');
  const tableBtn = document.getElementById('view-table-btn');

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
  header.addEventListener('click', () => {
    section.classList.toggle('open');
    body.style.display = section.classList.contains('open') ? 'block' : 'none';
  });
}

/* ============================================
   保險公司下拉選單
   ============================================ */
function renderCompanyOptions() {
  const sel = document.getElementById('policy-company');
  if (!sel) return;
  const current = sel.value;
  const list = companies.length ? companies : DEFAULT_COMPANIES.map((name) => ({ name }));
  sel.innerHTML = list.map((c) => `<option value="${c.name}">${escapeHtml(c.name)}</option>`).join('');
  if (current && !list.some((c) => c.name === current)) {
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = current;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

/* ============================================
   自動同步
   ============================================ */
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
        promises.push(api.insuranceSync({
          policyId: policy.id, memberId: policy.memberId, policyName: policy.name,
          monthlyAverage: amount, year, month,
        }));
      }
    }
  }
  await Promise.all(promises);
}

async function syncAllPolicyExpenses() {
  await Promise.all(policies.map((p) => autoSyncPolicyExpenses(p)));
}

/* ============================================
   年度計算
   ============================================ */
function getPeriodRange(policy, periodIndex) {
  const firstY = Number(policy.firstStartYear);
  const firstM = Number(policy.firstStartMonth);
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

/* ============================================
   判斷是否已供滿
   ============================================ */
function isPolicyCompleted(policy) {
  if (policy.isCompleted) return true;
  const total = Number(policy.totalPolicyPeriods) || 0;
  const done = Number(policy.completedPeriods) || 0;
  return total > 0 && done >= total;
}

/* ============================================
   計算總供款金額
   ============================================ */
function getPolicyTotalPremium(policy) {
  if (policy.totalPremium) return Number(policy.totalPremium);
  if (policy.type === 'fund_insurance') {
    return (Number(policy.monthlyPremium) || 0) * 12 * (Number(policy.totalPolicyYears) || 0);
  }
  return (Number(policy.annualPremium) || 0) * (Number(policy.totalPolicyYears) || 0);
}

/* ============================================
   渲染主入口
   ============================================ */
function renderAll() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';
  document.getElementById('insurance-month').textContent = isAnnual ? `${year} 年 全年總覽` : `${year} 年 ${month} 月`;

  // 統計總供款金額
  const grandTotal = policies.reduce((s, p) => s + getPolicyTotalPremium(p), 0);
  document.getElementById('grand-total-premium').textContent = formatHKD(grandTotal);
  document.getElementById('grand-total-hint').textContent = `共 ${policies.length} 張保單`;

  // 分類：已供滿 vs 供款中
  const completed = policies.filter(isPolicyCompleted);
  const active = policies.filter((p) => !isPolicyCompleted(p));

  document.getElementById('active-policy-count').textContent = `${active.length} 張`;

  // 已供滿區塊
  const completedSection = document.getElementById('completed-section');
  if (completed.length > 0) {
    completedSection.style.display = 'block';
    document.getElementById('completed-count').textContent = completed.length;
    document.getElementById('completed-grid').innerHTML = completed.map((p) => renderCard(p, true)).join('');
  } else {
    completedSection.style.display = 'none';
  }

  // 供款中區塊
  const emptyState = document.getElementById('empty-state');
  const gridEl = document.getElementById('policy-grid');
  const tableEl = document.getElementById('policy-table-view');

  if (active.length === 0) {
    gridEl.style.display = 'none';
    tableEl.style.display = 'none';
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    if (currentView === 'card') {
      gridEl.style.display = 'grid';
      tableEl.style.display = 'none';
      gridEl.innerHTML = active.map((p) => renderCard(p, false)).join('');
    } else {
      gridEl.style.display = 'none';
      tableEl.style.display = 'block';
      renderTable(active);
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   卡片視圖
   ============================================ */
function renderCard(p, isCompleted) {
  const member = members.find((m) => m.id === p.memberId);
  const memberName = member ? member.name : '（未指定）';
  const isFund = p.type === 'fund_insurance';
  const totalPeriods = p.totalPolicyPeriods || 0;
  const done = p.completedPeriods || 0;
  const pct = totalPeriods > 0 ? Math.min(100, Math.round((done / totalPeriods) * 100)) : 0;

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
        <div class="policy-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </div>
      </div>`;
  }

  const startDateText = `${p.firstStartYear}-${p.firstStartMonth}`;
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
      <div class="policy-progress" style="margin-top:12px;">
        <div class="policy-progress-text"><span>整體供款進度</span><span>${done} / ${totalPeriods} 期 (${pct}%)</span></div>
        <div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div>
      </div>
      <div class="policy-actions">
        <button class="btn btn-sm btn-primary" data-action="detail" data-id="${p.id}">查看明細</button>
        ${isCompleted ? `<button class="btn btn-sm btn-ghost" data-action="restore" data-id="${p.id}">恢復供款</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
      </div>
    </div>`;
}

/* ============================================
   表格視圖（依開始供款日排序）
   ============================================ */
function renderTable(list) {
  const tbody = document.getElementById('policy-table-body');

  // 依開始供款日期升序排序
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
    const totalPremium = getPolicyTotalPremium(p);
    const startDateText = `${p.firstStartYear}-${p.firstStartMonth}`;
    const monthly = isFund ? p.monthlyPremium : (p.periods?.[String(p.currentPeriodIndex || 1)]?.monthlyAverage || p.monthlyAverage || 0);

    return `
      <tr>
        <td class="mono" style="font-size:12px;">${startDateText}</td>
        <td>${escapeHtml(memberName)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.company || '—')}</td>
        <td class="num text-cyan">${formatHKD(totalPremium)}</td>
        <td class="num text-magenta">${formatHKD(monthly)}</td>
        <td class="progress-cell">
          <div class="progress-text">${done} / ${totalPeriods} 期 (${pct}%)</div>
          <div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div>
        </td>
        <td>
          <button class="btn btn-sm btn-primary" data-action="detail" data-id="${p.id}">明細</button>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   年度明細彈窗
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
    const defaultAmount = Math.round((policy.periods?.[String(periodIndex)]?.monthlyAverage) || policy.monthlyAverage || 0);
    const amount = payment.amount ? Math.round(payment.amount) : defaultAmount;
    const isPaid = payment.status === '已扣款';
    if (isPaid) totalPaid += amount;

    rows += `
      <div class="insurance-detail-row" data-month="${monthKey}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="width:80px; font-family:var(--font-mono); font-size:12px;">${y}-${m}</div>
        <input type="number" class="input ins-amount" value="${amount}" min="0" step="1" style="flex:1; padding:6px 10px; font-size:13px;">
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
      <select class="select" id="detail-period-select" style="width:100%; padding:8px 12px; font-size:14px;">${periodOptions}</select>
    </div>
    <div style="max-height:50vh; overflow-y:auto;">${rows}</div>
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--glass-border); display:flex; justify-content:space-between;">
      <span style="font-size:12px; color:var(--text-muted);">本期已扣款：${formatHKD(totalPaid)}</span>
    </div>
  `;

  document.getElementById('detail-period-select').addEventListener('change', (e) => {
    renderDetailBody(policy, Number(e.target.value));
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
   原有 Modal 事件綁定
   ============================================ */
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
    try {
      await addInsuranceCompany(name.trim());
      setTimeout(() => { const sel = document.getElementById('policy-company'); if (sel) sel.value = name.trim(); }, 500);
    } catch (err) { alert('新增失敗：' + err.message); }
  });

  document.getElementById('edit-company-btn').addEventListener('click', async () => {
    const sel = document.getElementById('policy-company');
    const oldName = sel.value;
    if (!oldName) return alert('請先選擇一個要編輯的保險公司。');
    const targetCompany = companies.find((c) => c.name === oldName);
    if (!targetCompany) return alert('找不到該保險公司的資料，請確認是否為預設值。');
    const newName = prompt(`請輸入「${oldName}」的新名稱：`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmedNewName = newName.trim();
    if (companies.some((c) => c.name === trimmedNewName)) return alert('此名稱已存在，請使用其他名稱。');
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
    await addInsurancePeriod(policyId, periodIndex, {
      startYear: range.startY, startMonth: range.startM,
      annualPremium: annual, monthlyAverage: Math.round(annual / 12),
    });
    modal.classList.remove('active');
    alert(`✅ 已設定第 ${periodIndex} 年度保費`);
    const updatedPolicy = policies.find((x) => x.id === policyId);
    if (updatedPolicy) {
      if (!updatedPolicy.periods) updatedPolicy.periods = {};
      updatedPolicy.periods[String(periodIndex)] = {
        periodIndex, startYear: range.startY, startMonth: range.startM,
        annualPremium: annual, monthlyAverage: Math.round(annual / 12),
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
      const amount = Math.round(Number(row.querySelector('.ins-amount').value) || 0);
      const isPaid = row.querySelector('.ins-paid').checked;
      const [yearStr, monthStr] = month.split('-');
      if (isPaid) {
        promises.push(saveInsurancePaymentBatch(p.id, yearStr, monthStr, { status: '已扣款', amount }));
        promises.push(api.insuranceSync({
          policyId: p.id, memberId: p.memberId, policyName: p.name,
          monthlyAverage: amount, year: yearStr, month: monthStr,
        }));
      } else {
        promises.push(removeInsurancePaymentBatch(p.id, yearStr, monthStr));
        promises.push(api.insuranceUnsync({ policyId: p.id, memberId: p.memberId, year: yearStr, month: monthStr }));
      }
    });

    try {
      await Promise.all(promises);
      alert('✅ 已批次更新扣款狀態與連動支出');
      modal.classList.remove('active');
      renderAll();
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

/* ============================================
   全域事件
   ============================================ */
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
  } else if (action === 'detail') {
    openDetailModal(p);
  } else if (action === 'restore') {
    if (confirm('確定要恢復此保單的供款狀態嗎？')) {
      await updateInsurancePolicyV2(p.id, { ...p, isCompleted: false });
    }
  } else if (action === 'delete') {
    if (confirm(`⚠️ 確定要刪除保單「${p.name}」嗎？\n\n這將會一併刪除所有相關的扣款紀錄與成員支出，此操作無法復原。`)) {
      try {
        await deleteInsurancePolicyAndData(p.id, p.memberId);
        alert('✅ 保單與相關紀錄已徹底刪除');
      } catch (err) { alert('刪除失敗：' + err.message); }
    }
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
  renderAll();
});
