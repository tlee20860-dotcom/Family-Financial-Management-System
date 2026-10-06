// ============================================
// banks.js — 銀行管理（可摺疊輸入 + 合併明細）
// ============================================

import {
  listenBanks, addBank, deleteBankAndBalances,
  listenBankBalances, saveBankBalance,
  getBankBalancesOnce,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

let banks = [];
let balances = {};
let prevBalances = {};
let unsubBalances = null;

export function initBanksPage() {
  const tbody = document.getElementById('bank-tbody');
  const form = document.getElementById('bank-form');
  const nameInput = document.getElementById('bank-name');
  const resetBtn = document.getElementById('bank-reset-btn');

  // 可摺疊輸入卡片
  bindCollapsibleInputCard();

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

      // 計算上月
      const y = Number(year);
      const m = Number(month);
      let prevY = y;
      let prevM = m - 1;
      if (prevM < 1) { prevY = y - 1; prevM = 12; }
      const prevMonthStr = String(prevM).padStart(2, '0');

      // 讀取上月結餘（每間銀行）
      try {
        prevBalances = await getBankBalancesOnce(prevY, prevMonthStr);
      } catch (err) {
        console.warn('無法讀取上月結餘：', err);
        prevBalances = {};
      }

      // 監聽本月結餘
      unsubBalances = listenBankBalances(year, month, (val) => {
        balances = val || {};
        render();
      });

      updateAvailableFunds();
    }
  };

  loadBalances();
  AppState.on('ym-change', loadBalances);

  resetBtn.addEventListener('click', () => {
    form.reset();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    await addBank(name);
    form.reset();

    // 新增後自動收起輸入卡片
    const card = document.getElementById('bank-input-card');
    const body = document.getElementById('bank-input-body');
    if (card && card.classList.contains('open')) {
      card.classList.remove('open');
      if (body) body.style.display = 'none';
      localStorage.setItem('bank-input-open', 'false');
      if (window.lucide) window.lucide.createIcons();
    }
  });

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'delete') {
      const bankName = banks.find((b) => b.id === btn.dataset.id)?.name || '此銀行';
      if (confirm(`⚠️ 確定要刪除「${bankName}」嗎？\n\n這將會一併刪除該銀行在所有月份的結餘紀錄，此操作無法復原。`)) {
        try {
          await deleteBankAndBalances(btn.dataset.id);
          alert('✅ 銀行與相關紀錄已徹底刪除');
        } catch (err) {
          alert('刪除失敗：' + err.message);
        }
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
      const total = banks.reduce((s, b) => s + (Number(bal[b.id]?.amount) || 0), 0);
      if (total > 0) lastTotal = total;

      const rows = banks.length === 0
        ? '<div style="font-size:12px; color:var(--text-muted);">尚無銀行</div>'
        : banks.map((b) => {
          const amount = Number(bal[b.id]?.amount) || 0;
          return `
            <div class="annual-month-row">
              <span>${escapeHtml(b.name)}</span>
              <span class="mono text-emerald">${formatHKD(amount)}</span>
            </div>
          `;
        }).join('');

      return `
        <div class="annual-month-card">
          <div class="annual-month-header">
            <div class="month-title">${monthNum} 月</div>
            <div class="month-total">${formatHKD(total)}</div>
          </div>
          <div class="annual-month-detail" style="display:none;">
            ${rows}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('annual-bank-total').textContent = formatHKD(lastTotal);
    container.innerHTML = cards;

    container.querySelectorAll('.annual-month-header').forEach((el) => {
      el.addEventListener('click', () => {
        const d = el.nextElementSibling;
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  async function updateAvailableFunds() {
    const { year, month } = AppState.getYearMonth();
    if (month === 'all') return;

    try {
      const summary = await api.summary(year, month);
      const prevTotal = Object.values(prevBalances).reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const available = prevTotal + (summary.totalIncome || 0);
      document.getElementById('bank-available').textContent = formatHKD(available);
    } catch (err) {
      console.warn('無法計算當月可用金額：', err);
    }
  }

  function render() {
    if (AppState.isAnnualMode()) return;
    if (!tbody) return;

    // 更新銀行數量
    const countEl = document.getElementById('bank-count');
    if (countEl) countEl.textContent = `（共 ${banks.length} 間）`;

    // 本月總額
    const total = banks.reduce((s, b) => s + (Number(balances[b.id]?.amount) || 0), 0);
    document.getElementById('bank-total').textContent = formatHKD(total);

    if (!banks.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">尚未新增銀行，請點擊上方「新增銀行」。</td></tr>`;
      return;
    }

    tbody.innerHTML = banks.map((b) => {
      const bal = balances[b.id] || {};
      const prevBal = prevBalances[b.id] || {};
      const amount = Number(bal.amount) || 0;
      const prevAmount = Number(prevBal.amount) || 0;
      const updated = bal.updatedAt
        ? new Date(bal.updatedAt).toLocaleString('zh-HK', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })
        : '—';

      return `
        <tr>
          <td class="bank-name-cell">${escapeHtml(b.name)}</td>
          <td class="num prev-balance hide-mobile">${formatHKD(prevAmount)}</td>
          <td class="num">
            <input type="number" class="bank-balance-input" data-action="edit-balance" data-id="${b.id}"
              value="${amount}" min="0" step="1">
          </td>
          <td class="updated-at hide-mobile">${updated}</td>
          <td>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${b.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  function bindCollapsibleInputCard() {
    const card = document.getElementById('bank-input-card');
    const header = document.getElementById('bank-input-header');
    const body = document.getElementById('bank-input-body');
    if (!card || !header || !body) return;

    const savedOpen = localStorage.getItem('bank-input-open') === 'true';
    if (savedOpen) {
      card.classList.add('open');
      body.style.display = 'block';
    }

    header.addEventListener('click', () => {
      const isOpen = card.classList.toggle('open');
      body.style.display = isOpen ? 'block' : 'none';
      localStorage.setItem('bank-input-open', String(isOpen));
      if (window.lucide) window.lucide.createIcons();
    });
  }
}
