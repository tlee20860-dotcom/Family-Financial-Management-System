// ============================================
// insurance.js — 保險付款版面邏輯（含基金保險）
// ============================================

import {
  listenInsurancePolicies,
  addInsurancePolicyV2, updateInsurancePolicyV2, removeInsurancePolicy,
  listenMembers, listenInsurancePayments, markInsurancePaid, updateFundInsuranceValue,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

const COMPANIES = ['富通', '保誠', 'FWD', 'AIA', '宏利', 'AXA'];

let policies = [];
let members = [];
let editingId = null;

export function initInsurancePage() {
  const grid = document.getElementById('policy-grid');
  const modal = document.getElementById('policy-modal');
  const modalTitle = document.getElementById('policy-modal-title');
  const form = document.getElementById('policy-form');

  const typeSelect = document.getElementById('policy-type');
  const memberSelect = document.getElementById('policy-member');
  const nameInput = document.getElementById('policy-name');
  const companySelect = document.getElementById('policy-company');
  const startInput = document.getElementById('policy-start');
  const paymentTypeSelect = document.getElementById('policy-payment-type');
  const totalPremiumInput = document.getElementById('policy-total-premium');
  const paidPremiumInput = document.getElementById('policy-paid-premium');
  const totalPeriodsInput = document.getElementById('policy-total-periods');
  const completedPeriodsInput = document.getElementById('policy-completed-periods');
  const remainingPeriodsInput = document.getElementById('policy-remaining-periods');
  const annualInput = document.getElementById('policy-annual');
  const monthlyInput = document.getElementById('policy-monthly');
  const monthlyPremiumInput = document.getElementById('policy-monthly-premium');
  const currentValueInput = document.getElementById('policy-current-value');
  const paymentDateInput = document.getElementById('policy-payment-date');
  const accountInput = document.getElementById('policy-account');
  const completedCheck = document.getElementById('policy-completed');

  const normalFields = document.getElementById('normal-fields');
  const fundFields = document.getElementById('fund-fields');

  listenInsurancePolicies((list) => {
    policies = list;
    renderGrid();
  });

  listenMembers((list) => {
    members = list;
    renderMemberOptions();
  });

  // 切換保單類型
  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'fund_insurance') {
      normalFields.style.display = 'none';
      fundFields.style.display = 'block';
      paymentTypeSelect.value = '月繳';
    } else {
      normalFields.style.display = 'grid';
      fundFields.style.display = 'none';
    }
  });

  // 自動計算月攤（普通保險）
  annualInput.addEventListener('input', () => {
    const annual = Number(annualInput.value) || 0;
    monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
  });

  // 自動計算餘下期數
  [totalPeriodsInput, completedPeriodsInput].forEach((el) => {
    el.addEventListener('input', () => {
      const t = Number(totalPeriodsInput.value) || 0;
      const c = Number(completedPeriodsInput.value) || 0;
      remainingPeriodsInput.value = Math.max(0, t - c);
    });
  });

  document.getElementById('add-policy-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增保單';
    form.reset();
    typeSelect.value = 'normal';
    normalFields.style.display = 'grid';
    fundFields.style.display = 'none';
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  document.getElementById('policy-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isFund = typeSelect.value === 'fund_insurance';

    const totalP = Number(totalPeriodsInput.value) || 0;
    const completedP = Number(completedPeriodsInput.value) || 0;

    const payload = {
      type: typeSelect.value,
      memberId: memberSelect.value,
      name: nameInput.value.trim(),
      company: companySelect.value,
      startDate: startInput.value.trim(),
      paymentType: paymentTypeSelect.value,
      totalPremium: Number(totalPremiumInput.value) || 0,
      paidPremium: Number(paidPremiumInput.value) || 0,
      totalPeriods: totalP,
      completedPeriods: completedP,
      remainingPeriods: Math.max(0, totalP - completedP),
      isCompleted: completedCheck.checked,
      paymentDate: paymentDateInput.value.trim(),
      account: accountInput.value.trim(),
      // 普通保險
      annualPremium: isFund ? 0 : Number(annualInput.value) || 0,
      monthlyAverage: isFund
        ? Number(monthlyPremiumInput.value) || 0
        : Number((Number(annualInput.value) / 12).toFixed(2)) || 0,
      // 基金保險
      monthlyPremium: isFund ? Number(monthlyPremiumInput.value) || 0 : 0,
      currentValue: isFund ? Number(currentValueInput.value) || 0 : 0,
      totalInvested: isFund ? (Number(paidPremiumInput.value) || 0) : 0,
      monthlyHistory: isFund ? { [`${AppState.year}-${AppState.month}`]: Number(currentValueInput.value) || 0 } : {},
    };

    if (!payload.name || !payload.memberId) return;

    if (editingId) {
      await updateInsurancePolicyV2(editingId, payload);
    } else {
      await addInsurancePolicyV2(payload);
    }
    modal.classList.remove('active');
  });

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const p = policies.find((x) => x.id === id);
    if (!p) return;

    if (action === 'edit') {
      editingId = id;
      modalTitle.textContent = '編輯保單';
      typeSelect.value = p.type || 'normal';
      typeSelect.dispatchEvent(new Event('change'));

      memberSelect.value = p.memberId || '';
      nameInput.value = p.name || '';
      companySelect.value = p.company || COMPANIES[0];
      startInput.value = p.startDate || '';
      paymentTypeSelect.value = p.paymentType || '年繳';
      totalPremiumInput.value = p.totalPremium || '';
      paidPremiumInput.value = p.paidPremium || '';
      totalPeriodsInput.value = p.totalPeriods || '';
      completedPeriodsInput.value = p.completedPeriods || '';
      remainingPeriodsInput.value = p.remainingPeriods || '';
      annualInput.value = p.annualPremium || '';
      monthlyInput.value = p.monthlyAverage || '';
      monthlyPremiumInput.value = p.monthlyPremium || '';
      currentValueInput.value = p.currentValue || '';
      paymentDateInput.value = p.paymentDate || '';
      accountInput.value = p.account || '';
      completedCheck.checked = p.isCompleted || false;
      modal.classList.add('active');
    } else if (action === 'delete') {
      if (confirm(`確定要刪除保單「${p.name}」嗎？`)) {
        await removeInsurancePolicy(id);
      }
    }
  });

  function renderMemberOptions() {
    const current = memberSelect.value;
    memberSelect.innerHTML = `<option value="">— 請選擇 —</option>` +
      members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (current) memberSelect.value = current;
  }

  function renderGrid() {
    if (!policies.length) {
      grid.innerHTML = `
        <div class="glass-card" style="grid-column:1/-1;">
          <div class="empty-state">
            <i data-lucide="shield" style="width:48px;height:48px;opacity:0.4;"></i>
            <p style="margin-top:12px;">尚無保單資料，點擊「新增保單」開始。</p>
          </div>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = policies.map((p) => {
      const member = members.find((m) => m.id === p.memberId);
      const memberName = member ? member.name : '（未指定）';
      const total = p.totalPeriods || 0;
      const done = p.completedPeriods || 0;
      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      const isFund = p.type === 'fund_insurance';

      // 基金保險：盈虧計算
      const invested = Number(p.totalInvested) || 0;
      const current = Number(p.currentValue) || 0;
      const pnl = current - invested;
      const pnlPct = invested > 0 ? ((pnl / invested) * 100).toFixed(2) : '0.00';
      const pnlClass = pnl >= 0 ? 'emerald' : 'red';

      // 基金保險專屬區塊
      const fundBlock = isFund ? `
        <div class="policy-info-grid" style="grid-template-columns: 1fr 1fr; margin-top:10px;">
          <div class="policy-info-item">
            <span class="policy-info-label">已供款總額</span>
            <span class="policy-info-value">${formatHKD(invested)}</span>
          </div>
          <div class="policy-info-item">
            <span class="policy-info-label">目前基金總值</span>
            <span class="policy-info-value text-cyan">${formatHKD(current)}</span>
          </div>
          <div class="policy-info-item">
            <span class="policy-info-label">總體盈虧</span>
            <span class="policy-info-value text-${pnlClass}">${pnl >= 0 ? '+' : ''}${formatHKD(pnl)}</span>
          </div>
          <div class="policy-info-item">
            <span class="policy-info-label">報酬率</span>
            <span class="policy-info-value text-${pnlClass}">${pnlPct}%</span>
          </div>
        </div>
      ` : '';

      return `
        <div class="glass-card policy-card">
          <div class="policy-header">
            <div>
              <div class="policy-name">${escapeHtml(p.name)}</div>
              <div class="policy-company">${escapeHtml(p.company || '—')} · ${isFund ? '基金保險' : '普通保險'}</div>
            </div>
          </div>

          <div class="policy-info-grid">
            <div class="policy-info-item">
              <span class="policy-info-label">受保成員</span>
              <span class="policy-info-value">${escapeHtml(memberName)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">付款類型</span>
              <span class="policy-info-value">${escapeHtml(p.paymentType || '—')}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">總保費</span>
              <span class="policy-info-value text-cyan">${formatHKD(p.totalPremium)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">已供保費</span>
              <span class="policy-info-value">${formatHKD(p.paidPremium)}</span>
            </div>
          </div>

          ${fundBlock}

          <div class="policy-progress">
            <div class="policy-progress-text">
              <span>供款進度</span>
              <span>${done} / ${total} 期 (${pct}%)</span>
            </div>
            <div class="progress">
              <div class="progress-bar" style="width:${pct}%;"></div>
            </div>
          </div>

          <div class="policy-actions">
            ${p.isCompleted ? '<span class="badge badge-success">已供款完畢</span>' : ''}
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
