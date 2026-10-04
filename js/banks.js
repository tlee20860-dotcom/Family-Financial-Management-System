// ============================================
// banks.js — 銀行管理（全年 / 單月）
// ============================================

import {
  listenBanks, addBank, removeBank,
  listenBankBalances, saveBankBalance, getPrevMonthBankTotal,
  getBankBalancesOnce,
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

  const loadBalances = async () => {
    const { year, month } = AppState.getYearMonth();
    const isAnnual = month === 'all';

    document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
    document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';
    document.getElementById('banks-month').textContent = isAnnual
      ? `${year} 年 全年總覽`
      : `${year} 年 ${month} 月`;

    if (isAnnual) {
      if (unsubBalances) { unsubBalances(); unsubBalances = null; }
      await loadAnnual(year);
    } else {
      if (unsubBalances) unsubBalances();
      unsubBalances = listenBankBalances(year, month, (val) => {
        balances = val || {};
        render();
      });
      updateAvailableFunds();
    }
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
      if (confirm('確定要刪除此銀行嗎？')) {
        await removeBank(btn.dataset.id);
      }
    }
  });

  tbody.addEventListener('change', async (e) => {
    const input = e.target;
    if (input.dataset.action !== 'edit-balance') return;
    const { year, month } = AppState.getYearMonth();
    if (month === 'all') return;
    await saveBankBalance(year, month, input.dataset.id, input.value);
  });

  async function loadAnnual(year) {
    try {
      const promises = [];
      for (let m = 1; m <= 12; m++) {
        promises.push(getBankBalancesOnce(year, String(m).padStart(2, '0')));
      }
      const results = await Promise.all(promises);
      renderAnnual(year, results);
    } catch (err) {
      console.error('全年銀行資料載入失敗：', err);
    }
  }

  function renderAnnual(year, monthlyBalances) {
    const container = document.getElementById('annual-monthly-cards');
    let lastTotal = 0;

    const cards = monthlyBalances.map((bal, i) => {
      const monthNum = i + 1;
      const total = Object.values(bal).reduce((s, b) => s + (Number(b.amount) || 0), 0);
      if (total > 0) lastTotal = total;

      const rows = banks.length === 0
        ? '<div style="font-size:12px; color:var(--text-muted);">尚無銀行</div>'
        : banks.map((b) => {
          const amount = Number(bal[b.id]?.amount) || 0;
          return `
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;">
              <span>${escapeHtml(b.name)}</span>
              <span class="mono text-emerald">${formatHKD(amount)}</span>
            </div>
          `;
        }).join('');

      return `
        <div class="glass-card" style="margin-bottom:10px; padding:14px;">
          <div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;">
            <div style="font-weight:700; font-size:15px; color:var(--neon-cyan);">${monthNum} 月</div>
            <div class="mono text-emerald" style="font-weight:700;">${formatHKD(total)}</div>
          </div>
          <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
            ${rows}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('annual-bank-total').textContent = formatHKD(lastTotal);
    container.innerHTML = cards;

    container.querySelectorAll('.month-toggle').forEach((el) => {
      el.addEventListener('click', () => {
        const d = el.nextElementSibling;
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

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
    if (AppState.isAnnualMode()) return;

    const total = banks.reduce((s, b) => s + (Number(balances[b.id]?.amount) || 0), 0);
    document.getElementById('bank-total').textContent = formatHKD(total);

    if (!banks.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">尚未新增銀行，請點擊右上角「新增銀行」。</td></tr>`;
      return;
    }

    tbody.innerHTML = banks.map((b) => {
      const bal = balances[b.id] || {};
      const amount = Number(bal.amount) || 0;
      const updated = bal.updatedAt ? new Date(bal.updatedAt).toLocaleString('zh-HK') : '—';
      return `
        <tr>
          <td>${escapeHtml(b.name)}</td>
          <td class="num">
            <input type="number" class="input mono" data-action="edit-balance" data-id="${b.id}"
              value="${amount}" min="0" step="0.01"
              style="width:140px; text-align:right; padding:6px 10px; font-size:13px;">
          </td>
          <td class="mono" style="font-size:11px; color:var(--text-muted);">${updated}</td>
          <td><button class="btn btn-sm btn-danger" data-action="delete" data-id="${b.id}">刪除</button></td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }
}
