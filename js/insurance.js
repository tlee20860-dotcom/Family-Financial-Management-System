// ============================================
// insurance.js — 保險付款（年度化重構）v29
// ============================================

import {
  listenInsurancePolicies,
  addInsurancePolicyV2, updateInsurancePolicyV2, removeInsurancePolicy,
  listenMembers, listenInsurancePayment,
  addInsurancePeriod,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

const COMPANIES = ['富通', '保誠', 'FWD', 'AIA', '宏利', 'AXA'];

let policies = [];
let members = [];
let editingId = null;

export function initInsurancePage() {
  const grid = document.getElementById('policy-grid');

  // 初始化月份下拉
  const monthSel = document.getElementById('policy-start-month');
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) {
    monthOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
  }
  monthSel.innerHTML = monthOpts;

  bindPolicyModalEvents();
  bindAddPeriodModalEvents();

  listenInsurancePolicies((list) => {
    policies = list;
    renderGrid();
  });

  listenMembers((list) => {
    members = list;
    renderMemberOptions();
  });
}

function bindPolicyModalEvents() {
  const modal = document.getElementById('policy-modal');
  const form = document.getElementById('policy-form');
  const memberSelect = document.getElementById('policy-member');
  const nameInput = document.getElementById('policy-name');
  const companySelect = document.getElementById('policy-company');
  const startYearInput = document.getElementById('policy-start-year');
  const startMonthSel = document.getElementById('policy-start-month');
  const currentPeriodInput = document.getElementById('policy-current-period');
  const totalYearsInput = document.getElementById('policy-total-years');
  const paymentTypeSelect = document.getElementById('policy-payment-type');
  const annualInput = document.getElementById('policy-annual');
  const monthlyInput = document.getElementById('policy-monthly');
  const accountInput = document.getElementById('policy-account');

  annualInput.addEventListener('input', () => {
    const annual = Number(annualInput.value) || 0;
    monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
  });

  document.getElementById('add-policy-btn').addEventListener('click', () => {
    editingId = null;
    document.getElementById('policy-modal-title').textContent = '新增保單';
    form.reset();
    const now = new Date();
    startYearInput.value = now.getFullYear();
    startMonthSel.value = String(now.getMonth() + 1).padStart(2, '0');
    currentPeriodInput.value = 1; // 預設為第一年度
    totalYearsInput.value = 5;
    monthlyInput.value = '';
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  document.getElementById('policy-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const annual = Number(annualInput.value) || 0;
    const monthlyAvg = annual / 12;

    // 🆕 嚴格校驗開始年月
    const firstY = Number(startYearInput.value);
    const firstM = Number(startMonthSel.value);
    if (firstY < 2000 || firstY > 2100 || firstM < 1 || firstM > 12) {
      alert('請填寫正確的保單開始年份（2000~2100）與月份。');
      return;
    }

    // 🆕 嚴格校驗目前第幾年度
    const currentPeriod = Number(currentPeriodInput.value);
    if (currentPeriod < 1 || currentPeriod > 100) {
      alert('「目前是第幾年度」請填寫合理數字（例如：1、2、3...）。');
      return;
    }

    const payload = {
      type: 'normal',
      memberId: memberSelect.value,
      name: nameInput.value.trim(),
      company: companySelect.value,
      paymentType: paymentTypeSelect.value,
      firstStartYear: firstY,
      firstStartMonth: String(firstM).padStart(2, '0'),
      currentPeriodIndex: currentPeriod,
      totalPolicyYears: Number(totalYearsInput.value) || 0,
      totalPolicyPeriods: (Number(totalYearsInput.value) || 0) * 12,
      account: accountInput.value.trim(),
      periods: {},
    };

    // 寫入當前年度的保費
    const cp = payload.currentPeriodIndex;
    const startY = payload.firstStartYear + Math.floor((cp - 1) / 12);
    const startM = String(((Number(payload.firstStartMonth) - 1 + (cp - 1) % 12) % 12) + 1).padStart(2, '0');
    payload.periods[String(cp)] = {
      periodIndex: cp,
      startYear: startY,
      startMonth: startM,
      annualPremium: annual,
      monthlyAverage: Number(monthlyAvg.toFixed(2)),
    };

    if (!payload.name || !payload.memberId) return;

    if (editingId) {
      await updateInsurancePolicyV2(editingId, payload);
    } else {
      await addInsurancePolicyV2(payload);
    }
    modal.classList.remove('active');
  });
}

function bindAddPeriodModalEvents() {
  const modal = document.getElementById('add-period-modal');
  const form = document.getElementById('add-period-form');
  const policyIdInput = document.getElementById('add-period-policy-id');
  const periodIndexInput = document.getElementById('add-period-index');
  const rangeInput = document.getElementById('add-period-range');
  const annualInput = document.getElementById('add-period-annual');
  const monthlyInput = document.getElementById('add-period-monthly');

  annualInput.addEventListener('input', () => {
    const annual = Number(annualInput.value) || 0;
    monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
  });

  document.getElementById('add-period-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const policyId = policyIdInput.value;
    const periodIndex = Number(periodIndexInput.value);
    const annual = Number(annualInput.value) || 0;

    const p = policies.find((x) => x.id === policyId);
    if (!p) return;

    const startY = p.firstStartYear + Math.floor((periodIndex - 1) / 12);
    const startM = String(((Number(p.firstStartMonth) - 1 + (periodIndex - 1) % 12) % 12) + 1).padStart(2, '0');

    await addInsurancePeriod(policyId, periodIndex, {
      startYear: startY,
      startMonth: startM,
      annualPremium: annual,
      monthlyAverage: annual / 12,
    });

    modal.classList.remove('active');
    alert(`✅ 已設定第 ${periodIndex} 年度保費`);
  });
}

function renderMemberOptions() {
  const sel = document.getElementById('policy-member');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— 請選擇 —</option>` +
    members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  if (current) sel.value = current;
}

/**
 * 根據當前年月計算所屬的保單年度
 * 🆕 加入防呆校驗，避免錯誤資料導致算出離譜數字
 */
function getPeriodInfo(policy, curYear, curMonth) {
  const firstY = Number(policy.firstStartYear);
  const firstM = Number(policy.firstStartMonth);

  // 🆕 防呆：若開始年月無效，直接回傳 null（不顯示）
  if (!firstY || !firstM || firstY < 2000 || firstY > 2100 || firstM < 1 || firstM > 12) {
    console.warn('保單開始年月無效：', policy.id, policy.firstStartYear, policy.firstStartMonth);
    return null;
  }

  const totalMonths = (curYear - firstY) * 12 + (curMonth - firstM);
  if (totalMonths < 0) return null; // 尚未開始

  const periodIndex = Math.floor(totalMonths / 12) + 1;
  if (policy.totalPolicyYears && periodIndex > policy.totalPolicyYears) return null; // 已供完

  const startY = firstY + Math.floor((periodIndex - 1) / 12);
  const startM = String(((firstM - 1 + (periodIndex - 1) % 12) % 12) + 1).padStart(2, '0');
  const endY = firstY + Math.floor(periodIndex / 12);
  const endM = String(((firstM - 1 + periodIndex % 12) % 12) + 1).padStart(2, '0');

  return {
    periodIndex,
    startYear: startY,
    startMonth: startM,
    endYear: endY,
    endMonth: endM,
    rangeText: `${startY}-${startM} ~ ${endY}-${endM}`,
  };
}

function renderGrid() {
  const grid = document.getElementById('policy-grid');
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';
  document.getElementById('insurance-month').textContent = isAnnual
    ? `${year} 年 全年總覽`
    : `${year} 年 ${month} 月`;

  if (isAnnual) {
    grid.innerHTML = `
      <div class="glass-card" style="grid-column:1/-1;">
        <div class="empty-state">請切換到單月模式查看保險扣款狀態。</div>
      </div>`;
    return;
  }

  const curY = Number(year);
  const curM = Number(month);

  // 過濾出當前應顯示的保單
  const visiblePolicies = policies.filter((p) => {
    if (p.type === 'fund_insurance') return true;
    const info = getPeriodInfo(p, curY, curM);
    return info !== null;
  });

  if (!visiblePolicies.length) {
    grid.innerHTML = `
      <div class="glass-card" style="grid-column:1/-1;">
        <div class="empty-state">
          <i data-lucide="shield" style="width:48px;height:48px;opacity:0.4;"></i>
          <p style="margin-top:12px;">本月尚無應扣款的保單。</p>
        </div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  grid.innerHTML = visiblePolicies.map((p) => {
    const member = members.find((m) => m.id === p.memberId);
    const memberName = member ? member.name : '（未指定）';
    const isFund = p.type === 'fund_insurance';

    if (isFund) {
      // 基金保險（略，與上版相同）
      return `
        <div class="glass-card policy-card">
          <div class="policy-header">
            <div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 基金保險</div></div>
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

    // 普通保險
    const info = getPeriodInfo(p, curY, curM);
    const periodData = (p.periods || {})[String(info.periodIndex)];

    if (!periodData) {
      return `
        <div class="glass-card policy-card">
          <div class="policy-header">
            <div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 普通保險</div></div>
          </div>
          <div class="policy-info-grid">
            <div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div>
            <div class="policy-info-item"><span class="policy-info-label">當前年度</span><span class="policy-info-value">第 ${info.periodIndex} 年度</span></div>
            <div class="policy-info-item" style="grid-column:1/-1;"><span class="policy-info-label">年度區間</span><span class="policy-info-value">${info.rangeText}</span></div>
          </div>
          <div class="banner banner-magenta" style="margin:10px 0;">⚠️ 尚未設定本年度保費</div>
          <div class="policy-actions">
            <button class="btn btn-sm btn-primary" data-action="add-period" data-id="${p.id}" data-index="${info.periodIndex}">➕ 新增第 ${info.periodIndex} 年度保費</button>
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
          </div>
        </div>`;
    }

    const totalPeriods = p.totalPolicyPeriods || 0;

    return `
      <div class="glass-card policy-card">
        <div class="policy-header">
          <div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company)} · 普通保險</div></div>
        </div>
        <div class="policy-info-grid">
          <div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">當前年度</span><span class="policy-info-value">第 ${info.periodIndex} 年度</span></div>
          <div class="policy-info-item" style="grid-column:1/-1;"><span class="policy-info-label">年度區間</span><span class="policy-info-value">${info.rangeText}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">年繳保費</span><span class="policy-info-value text-cyan">${formatHKD(periodData.annualPremium)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">每月分攤</span><span class="policy-info-value text-magenta">${formatHKD(periodData.monthlyAverage)}</span></div>
        </div>
        <div class="policy-progress" style="margin-top:12px;">
          <div class="policy-progress-text"><span>整體供款進度</span><span id="overall-${p.id}">- / ${totalPeriods} 期</span></div>
          <div class="progress"><div class="progress-bar" id="overall-bar-${p.id}" style="width:0%;"></div></div>
          <div class="policy-progress-text" style="margin-top:6px;"><span>本年度進度</span><span id="yearly-${p.id}">- / 12 期</span></div>
          <div class="progress"><div class="progress-bar" id="yearly-bar-${p.id}" style="width:0%;"></div></div>
        </div>
        <div class="policy-actions">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); cursor:pointer; margin-right:10px;">
            <input type="checkbox" class="policy-paid-checkbox" data-action="toggle-paid" data-id="${p.id}" style="width:auto; cursor:pointer;">
            本月已扣款
          </label>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </div>
      </div>`;
  }).join('');

  // 綁定扣款與進度計算
  visiblePolicies.forEach((p) => {
    if (p.type === 'fund_insurance') return;
    const info = getPeriodInfo(p, curY, curM);
    if (!info) return;
    const periodData = (p.periods || {})[String(info.periodIndex)];
    if (!periodData) return;

    const cb = grid.querySelector(`.policy-paid-checkbox[data-id="${p.id}"]`);
    if (cb) {
      listenInsurancePayment(p.id, year, month, (data) => {
        cb.checked = data.status === '已扣款';
      });
    }

    // 進度計算
    import('https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js').then(({ ref, get }) => {
      import('./firebase-config.js').then(({ db }) => {
        get(ref(db, `insurance_payments/${p.id}`)).then((snap) => {
          const all = snap.val() || {};
          let overallDone = 0;
          Object.values(all).forEach((yearData) => {
            Object.values(yearData || {}).forEach((mData) => {
              if (mData.status === '已扣款') overallDone++;
            });
          });

          let yearlyDone = 0;
          Object.entries(all).forEach(([y, months]) => {
            Object.entries(months || {}).forEach(([m, data]) => {
              if (data.status === '已扣款') {
                const tmpInfo = getPeriodInfo(p, Number(y), Number(m));
                if (tmpInfo && tmpInfo.periodIndex === info.periodIndex) yearlyDone++;
              }
            });
          });

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
      });
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// 事件委派（補上編輯按鈕邏輯）
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const p = policies.find((x) => x.id === id);

  if (action === 'add-period') {
    const periodIndex = Number(btn.dataset.index);
    const startY = p.firstStartYear + Math.floor((periodIndex - 1) / 12);
    const startM = String(((Number(p.firstStartMonth) - 1 + (periodIndex - 1) % 12) % 12) + 1).padStart(2, '0');
    const endY = p.firstStartYear + Math.floor(periodIndex / 12);
    const endM = String(((Number(p.firstStartMonth) - 1 + periodIndex % 12) % 12) + 1).padStart(2, '0');

    document.getElementById('add-period-policy-id').value = p.id;
    document.getElementById('add-period-index').value = periodIndex;
    document.getElementById('add-period-range').value = `第 ${periodIndex} 年度 (${startY}-${startM} ~ ${endY}-${endM})`;
    const prevData = (p.periods || {})[String(periodIndex - 1)];
    document.getElementById('add-period-annual').value = prevData ? prevData.annualPremium : '';
    document.getElementById('add-period-monthly').value = prevData ? prevData.monthlyAverage : '';
    document.getElementById('add-period-modal').classList.add('active');
  } else if (action === 'edit') {
    // 🆕 補上編輯邏輯
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
    if (curPeriodData) {
      document.getElementById('policy-annual').value = curPeriodData.annualPremium || '';
      document.getElementById('policy-monthly').value = curPeriodData.monthlyAverage || '';
    }
    document.getElementById('policy-modal').classList.add('active');
  } else if (action === 'delete') {
    if (confirm(`確定要刪除保單「${p.name}」嗎？`)) {
      await removeInsurancePolicy(id);
    }
  }
});

// 勾選扣款
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
    try {
      await api.insuranceSync({
        policyId: p.id, memberId: p.memberId,
        policyName: p.name, monthlyAverage: periodData.monthlyAverage,
        year, month,
      });
    } catch (err) { console.warn('同步失敗：', err); }
  } else {
    try {
      await api.insuranceUnsync({ policyId: p.id, memberId: p.memberId, year, month });
    } catch (err) { console.warn('取消連動失敗：', err); }
  }
  renderGrid();
});
