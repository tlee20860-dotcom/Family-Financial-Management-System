// ============================================
// insurance.js — 保險付款版面邏輯（含 API 自動連動）
// ============================================

import {
  listenInsurancePolicies,
  addInsurancePolicy,
  updateInsurancePolicy,
  removeInsurancePolicy,
  listenMembers,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { api } from './api.js';
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

  const memberSelect = document.getElementById('policy-member');
  const nameInput = document.getElementById('policy-name');
  const companySelect = document.getElementById('policy-company');
  const premiumInput = document.getElementById('policy-premium');
  const monthlyInput = document.getElementById('policy-monthly');
  const paymentInput = document.getElementById('policy-payment');
  const accountInput = document.getElementById('policy-account');
  const totalInput = document.getElementById('policy-total');
  const completedInput = document.getElementById('policy-completed');

  listenInsurancePolicies((list) => {
    policies = list;
    renderGrid();
  });

  listenMembers((list) => {
    members = list;
    renderMemberOptions();
  });

  premiumInput.addEventListener('input', () => {
    const annual = Number(premiumInput.value) || 0;
    monthlyInput.value = annual > 0 ? (annual / 12).toFixed(2) : '';
  });

  document.getElementById('add-policy-btn').addEventListener('click', () => {
    editingId = null;
    modalTitle.textContent = '新增保單';
    form.reset();
    monthlyInput.value = '';
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  document.getElementById('policy-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const annualPremium = Number(premiumInput.value) || 0;
    const payload = {
      memberId: memberSelect.value,
      name: nameInput.value.trim(),
      company: companySelect.value,
      annualPremium,
      monthlyAverage: Number((annualPremium / 12).toFixed(2)),
      paymentDate: paymentInput.value.trim(),
      account: accountInput.value.trim(),
      totalPeriods: Number(totalInput.value) || 0,
      completedPeriods: Number(completedInput.value) || 0,
    };

    if (!payload.name || !payload.memberId) return;

    let policyId = editingId;

    if (editingId) {
      await updateInsurancePolicy(editingId, payload);
    } else {
      policyId = await addInsurancePolicy(payload);
    }

    await syncInsuranceToExpense(policyId, payload);
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
      memberSelect.value = p.memberId || '';
      nameInput.value = p.name || '';
      companySelect.value = p.company || COMPANIES[0];
      premiumInput.value = p.annualPremium || '';
      monthlyInput.value = p.monthlyAverage || '';
      paymentInput.value = p.paymentDate || '';
      accountInput.value = p.account || '';
      totalInput.value = p.totalPeriods || '';
      completedInput.value = p.completedPeriods || '';
      modal.classList.add('active');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除保單「${p.name}」嗎？`)) {
        const { year, month } = AppState.getYearMonth();
        try {
          await api.insuranceUnsync({
            policyId: id,
            memberId: p.memberId,
            year,
            month,
          });
        } catch (err) {
          console.warn('刪除連動支出失敗：', err);
        }
        await removeInsurancePolicy(id);
      }
    }
  });

  function renderMemberOptions() {
    const current = memberSelect.value;
    memberSelect.innerHTML = `
      <option value="">— 請選擇成員 —</option>
      ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
    `;
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

      return `
        <div class="glass-card policy-card">
          <div class="policy-header">
            <div>
              <div class="policy-name">${escapeHtml(p.name)}</div>
              <div class="policy-company">${escapeHtml(p.company || '—')}</div>
            </div>
          </div>

          <div class="policy-info-grid">
            <div class="policy-info-item">
              <span class="policy-info-label">受保成員</span>
              <span class="policy-info-value">${escapeHtml(memberName)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">年度保費</span>
              <span class="policy-info-value text-cyan">${formatHKD(p.annualPremium)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">平均每月</span>
              <span class="policy-info-value text-magenta">${formatHKD(p.monthlyAverage)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">付款日期</span>
              <span class="policy-info-value">${escapeHtml(p.paymentDate || '—')}</span>
            </div>
            <div class="policy-info-item" style="grid-column:1/-1;">
              <span class="policy-info-label">扣款帳戶</span>
              <span class="policy-info-value">${escapeHtml(p.account || '—')}</span>
            </div>
          </div>

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

async function syncInsuranceToExpense(policyId, payload) {
  if (!policyId || !payload.memberId) return;
  const { year, month } = AppState.getYearMonth();

  try {
    await api.insuranceSync({
      policyId,
      memberId: payload.memberId,
      policyName: payload.name,
      monthlyAverage: payload.monthlyAverage,
      year,
      month,
    });
    console.log('✅ 保險平攤已同步至成員支出');
  } catch (err) {
    console.warn('⚠️ 保險同步失敗（可能尚未部署 Functions）：', err.message);
  }
}
