// ============================================
// banks.js — 銀行管理（v94 重構）
// ============================================

import {
  listenBanks, addBank, deleteBankAndBalances,
  listenBankBalances, saveBankBalance,
  getBankBalancesOnce,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { renderPageFilter } from './page-filter.js';
import { showToast } from './toast.js';
import { initCollapsibleCard } from './collapsible-card.js';
import { fillBankSelect } from './select-helpers.js';
import { fillYearSelect, fillMonthSelect } from './date-helpers.js';
import { AppState } from './state.js';
import { api } from './api.js';
import { initCollapsibleCard } from './collapsible-card.js';

let banks = [];
let balances = {};
let prevBalances = {};
let unsubBalances = null;
let currentMode = 'annual';  // 'monthly' | 'annual'
let filters = { year: '', month: 'all', bank: '' };

export function initBanksPage() {
  // 🆕 v99.5：明細表格折疊（預設展開）
  initCollapsibleCard('bank-table-card', 'bank-table-open', true);

  const tbody = document.getElementById('bank-tbody');
  const form = document.getElementById('bank-form');
  const bankSelect = document.getElementById('bank-select');
  const amountInput = document.getElementById('bank-amount');
  const resetBtn = document.getElementById('bank-reset-btn');
  const addBankBtn = document.getElementById('add-bank-btn');
  const hintEl = document.getElementById('bank-form-hint');
  const formYearSel = document.getElementById('bank-form-year');
  const formMonthSel = document.getElementById('bank-form-month');

  /* ============================================
     初始化
     ============================================ */

  // 可摺疊輸入卡片
  const inputCard = initCollapsibleCard('bank-input-card', 'bank-input-open', false);

  // 表單年月下拉
  fillYearSelect(formYearSel, { defaultValue: AppState.year });
  fillMonthSelect(formMonthSel, {
    defaultValue: AppState.month === 'all' ? '01' : AppState.month,
  });

  // 頁面篩選欄
  renderFilterBar();

  // 檢視切換
  bindViewToggle();

  /* ============================================
     資料監聽
     ============================================ */

  listenBanks((list) => {
    banks = list;
    fillBankSelect(bankSelect, banks, { includeEmpty: true });
    updateFilterOptions();
    renderTable();
  });

  /* ============================================
     表單：年月 / 銀行變更 → 查詢該月現有值
     ============================================ */

  formYearSel.addEventListener('change', refreshFormBalance);
  formMonthSel.addEventListener('change', refreshFormBalance);
  bankSelect.addEventListener('change', refreshFormBalance);

  async function refreshFormBalance() {
    const year = formYearSel.value;
    const month = formMonthSel.value;
    const bankId = bankSelect.value;

    if (!year || !month) return;

    let targetBalances = {};
    try {
      targetBalances = await getBankBalancesOnce(year, month);
    } catch (err) {
      console.warn('讀取結餘失敗：', err);
    }

    if (!bankId) {
      amountInput.value = '';
      if (hintEl) hintEl.style.display = 'none';
      return;
    }

    const bal = targetBalances[bankId] || {};
    if (bal.amount != null) {
      amountInput.value = bal.amount;
      if (hintEl) {
        hintEl.textContent = `ℹ️ ${year} 年 ${month} 月已有結餘 ${formatHKD(bal.amount)}，儲存將覆蓋原值。`;
        hintEl.className = 'banner';
        hintEl.style.display = 'block';
      }
    } else {
      amountInput.value = '';
      if (hintEl) hintEl.style.display = 'none';
    }
  }

  /* ============================================
     新增銀行（select 旁 + 按鈕）
     ============================================ */

  addBankBtn.addEventListener('click', async () => {
    const name = prompt('請輸入新銀行名稱：');
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    if (banks.some((b) => b.name === trimmed)) {
      return showToast('此銀行名稱已存在', 'warning');
    }

    try {
      const newId = await addBank(trimmed);
      setTimeout(() => {
        if (newId) {
          bankSelect.value = newId;
          refreshFormBalance();
          amountInput.focus();
        }
      }, 300);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      showToast('新增銀行失敗：' + err.message, 'error');
    }
  });

  /* ============================================
     表單提交：儲存結餘（同步 AppState）
     ============================================ */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const year = formYearSel.value;
    const month = formMonthSel.value;
    const bankId = bankSelect.value;
    const amount = amountInput.value;

    if (!year || !month) return showToast('請選擇所屬年份與月份', 'warning');
    if (!bankId) return showToast('請選擇銀行', 'warning');
    if (amount === '') return showToast('請輸入結餘金額', 'warning');

    try {
      await saveBankBalance(year, month, bankId, amount);

      // 同步 AppState（Date Filter 已移除，但內部狀態仍會記錄）
      AppState.setYearMonth(year, month);

      // 收起表單
      inputCard?.close();

      // 重置表單
      fillBankSelect(bankSelect, banks, { includeEmpty: true });
      amountInput.value = '';
      if (hintEl) hintEl.style.display = 'none';

      showToast(`✅ 已儲存 ${year} 年 ${month} 月結餘`, 'success');
    } catch (err) {
      showToast('儲存失敗：' + err.message, 'error');
    }
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    fillYearSelect(formYearSel, { defaultValue: AppState.year });
    fillMonthSelect(formMonthSel, {
      defaultValue: AppState.month === 'all' ? '01' : AppState.month,
    });
    fillBankSelect(bankSelect, banks, { includeEmpty: true });
    amountInput.value = '';
    if (hintEl) hintEl.style.display = 'none';
  });

  /* ============================================
     表格操作：刪除銀行
     ============================================ */

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'delete') {
      const bankName = banks.find((b) => b.id === btn.dataset.id)?.name || '此銀行';
      if (confirm(`⚠️ 確定要刪除「${bankName}」嗎？\n\n這將會一併刪除該銀行在所有月份的結餘紀錄，此操作無法復原。`)) {
        try {
          await deleteBankAndBalances(btn.dataset.id);
          showToast('✅ 銀行與相關紀錄已徹底刪除', 'success');
        } catch (err) {
          showToast('刪除失敗：' + err.message, 'error');
        }
      }
    }
  });

  /* ============================================
     檢視切換（單月 / 全年）
     ============================================ */

  function bindViewToggle() {
    const monthBtn = document.getElementById('view-month-btn');
    const annualBtn = document.getElementById('view-annual-btn');

    monthBtn.addEventListener('click', () => {
      currentMode = 'monthly';
      updateToggleUI();
      loadBalances();
    });

    annualBtn.addEventListener('click', () => {
      currentMode = 'annual';
      updateToggleUI();
      loadBalances();
    });

    updateToggleUI();
  }

  function updateToggleUI() {
    const monthBtn = document.getElementById('view-month-btn');
    const annualBtn = document.getElementById('view-annual-btn');

    if (currentMode === 'monthly') {
      monthBtn.classList.add('btn-primary'); monthBtn.classList.remove('btn-ghost');
      annualBtn.classList.add('btn-ghost'); annualBtn.classList.remove('btn-primary');
      document.getElementById('monthly-view').style.display = 'block';
      document.getElementById('annual-view').style.display = 'none';
    } else {
      monthBtn.classList.add('btn-ghost'); monthBtn.classList.remove('btn-primary');
      annualBtn.classList.add('btn-primary'); annualBtn.classList.remove('btn-ghost');
      document.getElementById('monthly-view').style.display = 'none';
      document.getElementById('annual-view').style.display = 'block';
    }
  }

  /* ============================================
     頁面篩選欄
     ============================================ */

  function renderFilterBar() {
    renderPageFilter({
      containerId: 'page-filter-root',
      fields: ['year', 'month'],
      renderExtra: () => `
        <div class="filter-group">
          <label class="field-label">銀行</label>
          <select class="select" data-filter="bank">
            <option value="">全部</option>
            ${banks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
          </select>
        </div>
      `,
      onChange: (f) => {
        filters = {
          year: f.year || '',
          month: f.month || 'all',
          bank: f.bank || '',
        };
        // 依月份決定模式
        if (filters.month === 'all') {
          currentMode = 'annual';
        } else {
          currentMode = 'monthly';
        }
        updateToggleUI();
        loadBalances();
      },
    });
  }

  // 當銀行清單變更時，更新篩選欄的銀行下拉
  function updateFilterOptions() {
    const root = document.getElementById('page-filter-root');
    if (!root) return;
    const bankSel = root.querySelector('select[data-filter="bank"]');
    if (bankSel) {
      const cur = bankSel.value;
      bankSel.innerHTML = `<option value="">全部</option>` +
        banks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
      if (cur && banks.some((b) => b.id === cur)) bankSel.value = cur;
    }
  }

  /* ============================================
     載入結餘
     ============================================ */

  async function loadBalances() {
    const targetYear = filters.year || AppState.year;
    let targetMonth;
    if (currentMode === 'annual') {
      targetMonth = 'all';
    } else {
      targetMonth = (filters.month && filters.month !== 'all')
        ? filters.month
        : (AppState.month === 'all' ? '01' : AppState.month);
    }

    document.getElementById('banks-month').textContent = currentMode === 'annual'
      ? `${targetYear} 年 全年總覽`
      : `${targetYear} 年 ${targetMonth} 月`;

    if (currentMode === 'annual') {
      if (unsubBalances) { unsubBalances(); unsubBalances = null; }
      await loadAnnual(targetYear);
    } else {
      if (unsubBalances) unsubBalances();

      const y = Number(targetYear);
      const m = Number(targetMonth);
      let prevY = y;
      let prevM = m - 1;
      if (prevM < 1) { prevY = y - 1; prevM = 12; }
      const prevMonthStr = String(prevM).padStart(2, '0');

      try {
        prevBalances = await getBankBalancesOnce(prevY, prevMonthStr);
      } catch (err) {
        prevBalances = {};
      }

      unsubBalances = listenBankBalances(targetYear, targetMonth, (val) => {
        balances = val || {};
        renderTable();
      });

      updateAvailableFunds(targetYear, targetMonth);
    }
  }

  // 初始載入
  filters.year = AppState.year;
  loadBalances();

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

    const filteredBanks = filters.bank
      ? banks.filter((b) => b.id === filters.bank)
      : banks;

    const cards = monthlyBalances.map((bal, i) => {
      const monthNum = i + 1;
      const total = filteredBanks.reduce((s, b) => s + (Number(bal[b.id]?.amount) || 0), 0);
      if (total > 0) lastTotal = total;

      const rows = filteredBanks.length === 0
        ? '<div style="font-size:12px; color:var(--text-muted);">尚無銀行</div>'
        : filteredBanks.map((b) => {
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

  async function updateAvailableFunds(year, month) {
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
     表格渲染
     ============================================ */

  function renderTable() {
    if (!tbody) return;

    const filteredBanks = filters.bank
      ? banks.filter((b) => b.id === filters.bank)
      : banks;

    const countEl = document.getElementById('bank-count');
    if (countEl) countEl.textContent = `（共 ${filteredBanks.length} 間）`;

    const total = filteredBanks.reduce((s, b) => s + (Number(balances[b.id]?.amount) || 0), 0);
    document.getElementById('bank-total').textContent = formatHKD(total);

    if (!filteredBanks.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">尚未新增銀行，請點擊上方「+」新增。</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredBanks.map((b) => {
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
}
