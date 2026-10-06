// ============================================
// portfolio.js — 基金投資資產頁面邏輯
// ============================================

import {
  listenFunds, addFund, updateFund, removeFund,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { createInputForm } from './input-form.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

let funds = [];
let editingId = null;
let inputForm = null;

export function initPortfolioPage() {
  const grid = document.getElementById('fund-grid');
  const modal = document.getElementById('fund-modal');
  const modalTitle = document.getElementById('fund-modal-title');
  const form = document.getElementById('fund-form');

  const nameInput = document.getElementById('fund-name');
  const costInput = document.getElementById('fund-cost');
  const valueInput = document.getElementById('fund-value');
  const unitsInput = document.getElementById('fund-units');
  const noteInput = document.getElementById('fund-note');

  const statCost = document.getElementById('stat-fund-cost');
  const statValue = document.getElementById('stat-fund-value');
  const statPnL = document.getElementById('stat-fund-pnl');

  // 🆕 v99：摺疊輸入表單（新增用）
  inputForm = createInputForm({
    containerId: 'fund-input-root',
    storageKey: 'fund-input-open',
    title: '新增基金',
    icon: 'plus-circle',
    fields: [
      { type: 'text', id: 'inp-fund-name', label: '基金名稱', required: true, placeholder: '例如：富達環球股票基金', maxlength: 60 },
      { type: 'number', id: 'inp-fund-cost', label: '投入成本（HK$）', required: true, min: 0, step: 1, placeholder: '0' },
      { type: 'number', id: 'inp-fund-value', label: '現時價值（HK$）', required: true, min: 0, step: 1, placeholder: '0' },
      { type: 'number', id: 'inp-fund-units', label: '持有單位數（可選）', min: 0, step: 0.0001, placeholder: '例如：123.4567' },
      { type: 'text', id: 'inp-fund-note', label: '備註（可選）', placeholder: '例如：月供計劃', maxlength: 60 },
    ],
    submitText: '新增基金',
    onSubmit: async (data) => {
      const name = (data['inp-fund-name'] || '').trim();
      if (!name) return;
      await addFund({
        name,
        cost: Number(data['inp-fund-cost']) || 0,
        currentValue: Number(data['inp-fund-value']) || 0,
        units: Number(data['inp-fund-units']) || 0,
        note: (data['inp-fund-note'] || '').trim(),
      });
      showToast(`✅ 已新增「${name}」`, 'success');
      inputForm.reset();
      inputForm.close();
    },
  });

  listenFunds((list) => {
    funds = list;
    renderGrid();
    renderStats();
  });

  /* ============================================
     編輯 Modal（保留）
     ============================================ */

  document.getElementById('fund-cancel-btn').addEventListener('click', () => closeModal('fund-modal'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: nameInput.value.trim(),
      cost: Number(costInput.value) || 0,
      currentValue: Number(valueInput.value) || 0,
      units: Number(unitsInput.value) || 0,
      note: noteInput.value.trim(),
    };
    if (!payload.name) return;

    if (editingId) {
      await updateFund(editingId, payload);
      showToast('✅ 已更新基金', 'success');
    }
    closeModal('fund-modal');
  });

  /* ============================================
     卡片事件（編輯 / 刪除）
     ============================================ */

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const f = funds.find((x) => x.id === id);
    if (!f) return;

    if (action === 'edit') {
      editingId = id;
      modalTitle.textContent = '編輯基金';
      nameInput.value = f.name || '';
      costInput.value = f.cost || '';
      valueInput.value = f.currentValue || '';
      unitsInput.value = f.units || '';
      noteInput.value = f.note || '';
      openModal('fund-modal');
      setTimeout(() => nameInput.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除「${f.name}」嗎？`)) {
        await removeFund(id);
        showToast('✅ 已刪除', 'success');
      }
    }
  });

  /* ============================================
     渲染
     ============================================ */

  function renderStats() {
    const totalCost = funds.reduce((s, f) => s + (Number(f.cost) || 0), 0);
    const totalValue = funds.reduce((s, f) => s + (Number(f.currentValue) || 0), 0);
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? ((pnl / totalCost) * 100).toFixed(2) : '0.00';

    if (statCost) statCost.textContent = formatHKD(totalCost);
    if (statValue) statValue.textContent = formatHKD(totalValue);
    if (statPnL) {
      statPnL.textContent = `${pnl >= 0 ? '+' : ''}${formatHKD(pnl)} (${pnlPct}%)`;
      statPnL.classList.remove('emerald', 'red');
      statPnL.classList.add(pnl >= 0 ? 'emerald' : 'red');
    }
  }

  function renderGrid() {
    if (!funds.length) {
      grid.innerHTML = `
        <div class="glass-card" style="grid-column:1/-1;">
          <div class="empty-state">
            <i data-lucide="line-chart" style="width:48px;height:48px;opacity:0.4;"></i>
            <p style="margin-top:12px;">尚無基金持倉，點擊上方「新增基金」開始。</p>
          </div>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = funds.map((f) => {
      const cost = Number(f.cost) || 0;
      const value = Number(f.currentValue) || 0;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? ((pnl / cost) * 100).toFixed(2) : '0.00';
      const pnlClass = pnl >= 0 ? 'emerald' : 'red';

      return `
        <div class="glass-card policy-card">
          <div class="policy-header">
            <div>
              <div class="policy-name">${escapeHtml(f.name)}</div>
              <div class="policy-company">FUND</div>
            </div>
          </div>

          <div class="policy-info-grid">
            <div class="policy-info-item">
              <span class="policy-info-label">投入成本</span>
              <span class="policy-info-value">${formatHKD(cost)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">現時價值</span>
              <span class="policy-info-value text-cyan">${formatHKD(value)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">帳面盈虧</span>
              <span class="policy-info-value text-${pnlClass}">${pnl >= 0 ? '+' : ''}${formatHKD(pnl)}</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">報酬率</span>
              <span class="policy-info-value text-${pnlClass}">${pnlPct}%</span>
            </div>
            <div class="policy-info-item">
              <span class="policy-info-label">持有單位數</span>
              <span class="policy-info-value">${f.units || '—'}</span>
            </div>
          </div>

          ${f.note ? `<div class="glass-card-hint">📝 ${escapeHtml(f.note)}</div>` : ''}

          <div class="policy-actions">
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${f.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${f.id}">刪除</button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
