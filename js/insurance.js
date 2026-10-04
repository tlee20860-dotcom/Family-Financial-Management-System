// ============================================
// insurance.js — 保險付款版面邏輯
// ============================================

import {
  listenInsurancePolicies,
  addInsurancePolicyV2, updateInsurancePolicyV2, removeInsurancePolicy,
  listenMembers, listenInsurancePayment,
  saveInsurancePayment, removeInsurancePayment,
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
  const modal = document.getElementById('policy-modal');
  const modalTitle = document.getElementById('policy-modal-title');
  const form = document.getElementById('policy-form');

  const typeSelect = document.getElementById('policy-type');
  const memberSelect = document.getElementById('policy-member');
  const nameInput = document.getElementById('policy-name');
  const companySelect = document.getElementById('policy-company');
  const startInput = document.getElementById('policy-start');
  const paymentTypeSelect = document.getElementById('policy-payment-type');
  const annualInput = document.getElementById('policy-annual');
  const monthlyInput = document.getElementById('policy-monthly');
  const totalPeriodsInput = document.getElementById('policy-total-periods');
  const monthlyPremiumInput = document.getElementById('policy-monthly-premium');
  const currentValueInput = document.getElementById('policy-current-value');
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

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'fund_insurance') {
      normalFields.style.display = 'none';
      fundFields.style.display = 'block';
      paymentTypeSelect.value = '月繳';
    } else {
      normalFields.style.display = 'block';
      fundFields.style.display = 'none';
    }
  });

  paymentTypeSelect.addEventListener('change', () => {
    if (paymentTypeSelect.value === '年繳') {
      totalPeriodsInput.value = 12;
      totalPeriodsInput.disabled = true;
    } else {
      totalPeriodsInput.disabled = false;
    }
    autoCalcMonthly();
  });

  annualInput.addEventListener('input', autoCalcMonthly);
  monthlyPremiumInput.addEventListener('input', autoCalcMonthly);

  function autoCalcMonthly() {
    const type = typeSelect.value;
    if (type === 'fund_insurance') return;
    const annual = Number(annualInput.value) || 0;
    const periods = Number(totalPeriodsInput.value) || 0;
    const monthlyPrem = Number(monthlyPremiumInput.value) || 0;

    if (paymentTypeSelect.value === '年繳') {
      monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
    } else if (paymentTypeSelect.value === '一次付款') {
      monthlyInput.value = (annual > 0 && periods > 0) ? (annual / periods).toFixed(2) : '';
    } else if (paymentTypeSelect.value === '月繳') {
      monthlyInput.value = monthlyPrem > 0 ? monthlyPrem.toFixed(2) : '';
    }
  }

  document.getElementById('add-policy-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增保單';
    form.reset();
    typeSelect.value = 'normal';
    normalFields.style.display = 'block';
    fundFields.style.display = 'none';
    paymentTypeSelect.value = '年繳';
    totalPeriodsInput.value = 12;
    totalPeriodsInput.disabled = true;
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
    const annual = Number(annualInput.value) || 0;
    const monthlyPrem = Number(monthlyPremiumInput.value) || 0;

    let monthlyAvg = 0;
    if (isFund) { monthlyAvg = monthlyPrem; }
    else if (paymentTypeSelect.value === '年繳') { monthlyAvg = annual / 12; }
    else if (paymentTypeSelect.value === '一次付款') { monthlyAvg = totalP > 0 ? annual / totalP : 0; }
    else { monthlyAvg = monthlyPrem; }

    const payload = {
      type: typeSelect.value, memberId: memberSelect.value,
      name: nameInput.value.trim(), company: companySelect.value,
      startDate: startInput.value.trim(), paymentType: paymentTypeSelect.value,
      annualPremium: annual, monthlyPremium: monthlyPrem,
      monthlyAverage: Number(monthlyAvg.toFixed(2)),
      totalPeriods: totalP, remainingPeriods: totalP, isCompleted: false,
      account: accountInput.value.trim(),
      currentValue: isFund ? Number(currentValueInput.value) || 0 : 0,
      totalInvested: isFund ? annual : 0,
      monthlyHistory: {},
    };

    if (!payload.name || !payload.memberId) return;

    if (editingId) { await updateInsurancePolicyV2(editingId, payload); }
    else { await addInsurancePolicyV2(payload); }
    modal.classList.remove('active');
  });

  // 卡片上的點擊事件（編輯 / 刪除 / 勾選扣款）
  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    const checkbox = e.target.closest('input[type="checkbox"][data-action]');

    if (checkbox) {
      const { year, month } = AppState.getYearMonth();
      if (month === 'all') { alert('請切換到特定月份再操作扣款狀態。'); return; }
      const p = policies.find((x) => x.id === checkbox.dataset.id);
      if (!p) return;
      if (checkbox.checked) {
        try { await api.insuranceSync({ policyId: p.id, memberId: p.memberId, policyName: p.name, monthlyAverage: p.monthlyAverage, year, month }); }
        catch (err) { console.warn('同步失敗：', err); }
      } else {
        try { await api.insuranceUnsync({ policyId: p.id, memberId: p.memberId, year, month }); }
        catch (err) { console.warn('取消連動失敗：', err); }
      }
      return;
    }

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
      annualInput.value = p.annualPremium || '';
      monthlyInput.value = p.monthlyAverage || '';
      totalPeriodsInput.value = p.totalPeriods || 12;
      monthlyPremiumInput.value = p.monthlyPremium || '';
      currentValueInput.value = p.currentValue || '';
      accountInput.value = p.account || '';
      completedCheck.checked = p.isCompleted || false;
      modal.classList.add('active');
    } else if (action === 'delete') {
      if (confirm(`確定要刪除保單「${p.name}」嗎？`)) { await removeInsurancePolicy(id); }
    }
  });

  function renderMemberOptions() {
    const current = memberSelect.value;
    memberSelect.innerHTML = `<option value="">— 請選擇 —</option>` +
      members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (current) memberSelect.value = current;
  }

  function renderGrid() {
    const { year, month } = AppState.getYearMonth();
    const isAnnual = month === 'all';
    document.getElementById('insurance-month').textContent = isAnnual ? `${year} 年 全年總覽` : `${year} 年 ${month} 月`;

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
      const invested = Number(p.totalInvested) || 0;
      const current = Number(p.currentValue) || 0;
      const pnl = current - invested;
      const pnlPct = invested > 0 ? ((pnl / invested) * 100).toFixed(2) : '0.00';
      const pnlClass = pnl >= 0 ? 'emerald' : 'red';

      const fundBlock = isFund ? `
        <div class="policy-info-grid" style="grid-template-columns: 1fr 1fr; margin-top:10px;">
          <div class="policy-info-item"><span class="policy-info-label">已供款總額</span><span class="policy-info-value">${formatHKD(invested)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">目前基金總值</span><span class="policy-info-value text-cyan">${formatHKD(current)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">總體盈虧</span><span class="policy-info-value text-${pnlClass}">${pnl >= 0 ? '+' : ''}${formatHKD(pnl)}</span></div>
          <div class="policy-info-item"><span class="policy-info-label">報酬率</span><span class="policy-info-value text-${pnlClass}">${pnlPct}%</span></div>
        </div>` : '';

      return `
        <div class="glass-card policy-card">
          <div class="policy-header"><div><div class="policy-name">${escapeHtml(p.name)}</div><div class="policy-company">${escapeHtml(p.company || '—')} · ${isFund ? '基金保險' : '普通保險'}</div></div></div>
          <div class="policy-info-grid">
            <div class="policy-info-item"><span class="policy-info-label">受保成員</span><span class="policy-info-value">${escapeHtml(memberName)}</span></div>
            <div class="policy-info-item"><span class="policy-info-label">付款類型</span><span class="policy-info-value">${escapeHtml(p.paymentType || '—')}</span></div>
            <div class="policy-info-item"><span class="policy-info-label">開始日期</span><span class="policy-info-value">${escapeHtml(p.startDate || '—')}</span></div>
            <div class="policy-info-item"><span class="policy-info-label">每月分攤</span><span class="policy-info-value text-cyan">${formatHKD(p.monthlyAverage)}</span></div>
          </div>
          ${fundBlock}
          <div class="policy-progress"><div class="policy-progress-text"><span>供款進度</span><span>${done} / ${total} 期 (${pct}%)</span></div><div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div></div>
          <div class="policy-actions">
            ${isAnnual ? '' : `
              <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); cursor:pointer; margin-right:10px;">
                <input type="checkbox" class="policy-paid-checkbox" data-action="toggle-paid" data-id="${p.id}" style="width:auto; cursor:pointer;">
                本月已扣款
              </label>`}
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
          </div>
        </div>`;
    }).join('');

    // 綁定扣款狀態
    if (!isAnnual) {
      const { year, month } = AppState.getYearMonth();
      grid.querySelectorAll('.policy-paid-checkbox').forEach((cb) => {
        const policyId = cb.dataset.id;
        listenInsurancePayment(policyId, year, month, (data) => {
          cb.checked = data.status === '已扣款';
        });
      });
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') { window.lucide.createIcons(); }
  }
}
