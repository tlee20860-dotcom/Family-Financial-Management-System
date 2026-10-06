// ============================================
// banks.js — 銀行管理（表單式輸入）
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
  const bankSelect = document.getElementById('bank-select');
  const amountInput = document.getElementById('bank-amount');
  const resetBtn = document.getElementById('bank-reset-btn');
  const addBankBtn = document.getElementById('add-bank-btn');
  const hintEl = document.getElementById('bank-form-hint');

  bindCollapsibleInputCard();

  /* ============================================
     監聽銀行清單
     ============================================ */
  listenBanks((list) => {
    banks = list;
    renderBankSelect();
    renderTable();
  });

  /* ============================================
     選銀行 → 自動帶入本月現有結餘
     ============================================ */
  bankSelect.addEventListener('change', () => {
    const bankId = bankSelect.value;
    if (!bankId) {
      amountInput.value = '';
      if (hintEl) hintEl.style.display = 'none';
      return;
    }

    const bal = balances[bankId] || {};
    if (bal.amount != null) {
      amountInput.value = bal.amount;
      if (hintEl) {
        hintEl.textContent = `ℹ️ 此銀行本月已有結餘 ${formatHKD(bal.amount)}，儲存將覆蓋原值。`;
        hintEl.className = 'banner';
        hintEl.style.display = 'block';
      }
    } else {
      amountInput.value = '';
      if (hintEl) hintEl.style.display = 'none';
    }
  });

  /* ============================================
     🆕 新增銀行：select 旁的 + 按鈕
     ============================================ */
  addBankBtn.addEventListener('click', async () => {
    const name = prompt('請輸入新銀行名稱：');
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    if (banks.some((b) => b.name === trimmed)) {
      alert('此銀行名稱已存在。');
      return;
    }

    try {
      const newId = await addBank(trimmed);
      // 等 banks 監聽回呼更新後，選中新銀行
      setTimeout(() => {
        if (newId) {
          bankSelect.value = newId;
          amountInput.value = '';
          amountInput.focus();
        }
      }, 300);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      alert('新增銀行失敗：' + err.message);
    }
  });

  /* ============================================
     表單提交：儲存結餘
     ============================================ */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bankId = bankSelect.value;
    const amount = amountInput.value;
    if (!bankId) return alert('請選擇銀行。');
    if (amount === '') return alert('請輸入結餘金額。');

    const { year, month } = AppState.getYearMonth();
    if (month === 'all') {
      return alert('請先切換到特定月份，再輸入結餘。');
    }

    try {
      await saveBankBalance(year, month, bankId, amount);

      // 儲存後收起表單
      const card = document.getElementById('bank-input-card');
      const body = document.getElementById('bank-input-body');
      if (card && body) {
        card.classList.remove('open');
        body.style.display = 'none';
        localStorage.setItem('bank-input-open', 'false');
      }

      // 重置表單
      bankSelect.value = '';
      amountInput.value = '';
      if (hintEl) hintEl.style.display = 'none';

      showToast(`✅ 已儲存 ${year} 年 ${month} 月結餘`);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      alert('儲存失敗：' + err.message);
    }
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    if (hintEl) hintEl.style.display = 'none';
  });

  /* ============================================
     載入結餘
     ============================================ */
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

      try {
        prevBalances = await getBankBalancesOnce(prevY, prevMonthStr);
      } catch (err) {
        console.warn('無法讀取上月結餘：', err);
        prevBalances = {};
      }

      unsubBalances = listenBankBalances(year, month, (val) => {
        balances = val || {};
        renderTable();
      });

      updateAvailableFunds();
    }
  };

  loadBalances();
  AppState.on('ym-change', loadBalances);

  /* ============================================
     表格操作（刪除銀行）
     ============================================ */
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

  /* ============================================
     全年模式
     ============================================ */
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

  /* ============================================
     當月可用金額
     ============================================ */
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

  /* ============================================
     Render
     ============================================ */
  function renderBankSelect() {
    if (!bankSelect) return;
    const cur = bankSelect.value;
    bankSelect.innerHTML = `<option value="">— 請選擇銀行 —</option>`
      + banks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    if (cur && banks.some((b) => b.id === cur)) bankSelect.value = cur;
  }

  function renderTable() {
    if (AppState.isAnnualMode()) return;
    if (!tbody) return;

    const countEl = document.getElementById('bank-count');
    if (countEl) countEl.textContent = `（共 ${banks.length} 間）`;

    const total = banks.reduce((s, b) => s + (Number(balances[b.id]?.amount) || 0), 0);
    document.getElementById('bank-total').textContent = formatHKD(total);

    if (!banks.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">尚未新增銀行，請點擊上方「+」新增。</td></tr>`;
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
          <td class="num text-emerald">${formatHKD(amount)}</td>
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

/* ============================================
   Toast
   ============================================ */
function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.4);z-index:99999;opacity:0;transition:opacity 0.3s;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
