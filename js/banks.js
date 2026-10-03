// ============================================
// banks.js — 銀行管理邏輯
// ============================================

import {
  listenBanks, addBank, removeBank,
  listenBankBalances, saveBankBalance, getPrevMonthBankTotal,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

let banks = [];
let balances = {};
let unsubBalances = null;

export function initBanksPage() {
  const tbody = document.getElementById('bank-tbody');
  const modal = document.getElementById('bank-modal');
  const form = document.getElementById('bank-form');
  const nameInput = document.getElementById('bank-name');

  listenBanks((list) => {
    banks = list;
    render();
  });

  const loadBalances = () => {
    const { year, month } = AppState.getYearMonth();
    document.getElementById('banks-month').textContent = `${year} 年 ${month} 月`;
    if (unsubBalances) unsubBalances();
    unsubBalances = listenBankBalances(year, month, (val) => {
      balances = val || {};
      render();
    });
    updateAvailableFunds();
  };

  loadBalances();
  AppState.on('ym-change', loadBalances);

  document.getElementById('add-bank-btn').addEventListener('click', () => {
    form.reset();
    modal.classList.add('active');
    setTimeout(() => nameInput.focus(), 50);
  });

  document.getElementById('bank-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    await addBank(name);
    modal.classList.remove('active');
  });

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'delete') {
      if (confirm('確定要刪除此銀行嗎？（過去的結餘紀錄不會被刪除）')) {
        await removeBank(btn.dataset.id);
      }
    }
  });

  tbody.addEventListener('change', async (e) => {
    const input = e.target;
    if (input.dataset.action !== 'edit-balance') return;
    const { year, month } = AppState.getYearMonth();
    await saveBankBalance(year, month, input.dataset.id, input.value);
  });

  async function updateAvailableFunds() {
    const { year, month } = AppState.getYearMonth();
    try {
      const [prevTotal, summary] = await Promise.all([
        getPrevMonthBankTotal(year, month),
        api.summary(year, month),
      ]);
      const available = prevTotal + (summary.totalIncome || 0);
      document.getElementById('bank-available').textContent = formatHKD(available);
    } catch (err) {
      console.warn('無法計算當月可用金額：', err);
    }
  }

  function render() {
    const total = banks.reduce((s, b) => {
      return s + (Number(balances[b.id]?.amount) || 0);
    }, 0);
    document.getElementById('bank-total').textContent = formatHKD(total);

    if (!banks.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">尚未新增銀行，請點擊右上角「新增銀行」。</td></tr>`;
      return;
    }

    tbody.innerHTML = banks.map((b) => {
      const bal = balances[b.id] || {};
      const amount = Number(bal.amount) || 0;
      const updated = bal.updatedAt
        ? new Date(bal.updatedAt).toLocaleString('zh-HK')
        : '—';
      return `
        <tr>
          <td>${escapeHtml(b.name)}</td>
          <td class="num">
            <input type="number" class="input mono" data-action="edit-balance" data-id="${b.id}"
              value="${amount}" min="0" step="0.01"
              style="width:140px; text-align:right; padding:6px 10px; font-size:13px;">
          </td>
          <td class="mono" style="font-size:11px; color:var(--text-muted);">${updated}</td>
          <td>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${b.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
