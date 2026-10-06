// ============================================
// banks.js — 銀行管理（表單式輸入 + 篩選 + 月報/年報）
// ============================================

import {
  listenBanks, addBank, deleteBankAndBalances,
  listenBankBalances, saveBankBalance,
  getBankBalancesOnce,
} from './db.js';
import { formatHKD, escapeHtml, initPageYearMonthSelector } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

let banks = [];
let balances = {};
let prevBalances = {};
let unsubBalances = null;
let currentMode = 'annual';   // 'monthly' | 'annual'
let filters = { year: '', month: '', bank: '' };

export function initBanksPage() {
  // 🆕 v93：頁面年月選擇器
  initPageYearMonthSelector('page-year', 'page-month');

  const tbody = document.getElementById('bank-tbody');
  const form = document.getElementById('bank-form');
  const bankSelect = document.getElementById('bank-select');
  const amountInput = document.getElementById('bank-amount');
  const resetBtn = document.getElementById('bank-reset-btn');
  const addBankBtn = document.getElementById('add-bank-btn');
  const hintEl = document.getElementById('bank-form-hint');
  const formYearSel = document.getElementById('bank-form-year');
  const formMonthSel = document.getElementById('bank-form-month');

  bindCollapsibleInputCard();
  initFormYearMonthOptions();
  initFilterOptions();
  bindViewToggle();

  /* ============================================
     監聽銀行清單
     ============================================ */
  listenBanks((list) => {
    banks = list;
    renderBankSelect();
    renderFilterBankOptions();
    renderTable();
  });

  /* ============================================
     表單：年份 / 月份變更 → 重新查詢該月結餘
     ============================================ */
  formYearSel.addEventListener('change', refreshFormBalance);
  formMonthSel.addEventListener('change', refreshFormBalance);

  /* ============================================
     表單：選銀行 → 帶入現有值
     ============================================ */
  bankSelect.addEventListener('change', refreshFormBalance);

  async function refreshFormBalance() {
    const year = formYearSel.value;
    const month = formMonthSel.value;
    const bankId = bankSelect.value;

    if (!year || !month) return;

    // 讀取該年月結餘
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
     新增銀行
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
      setTimeout(() => {
        if (newId) {
          bankSelect.value = newId;
          refreshFormBalance();
          amountInput.focus();
        }
      }, 300);
    } catch (err) {
      alert('新增銀行失敗：' + err.message);
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

    if (!year || !month) return alert('請選擇所屬年份與月份。');
    if (!bankId) return alert('請選擇銀行。');
    if (amount === '') return alert('請輸入結餘金額。');

    try {
      await saveBankBalance(year, month, bankId, amount);

      // 🆕 同步 AppState
      AppState.setYearMonth(year, month);

      // 收起表單
      const card = document.getElementById('bank-input-card');
      const body = document.getElementById('bank-input-body');
      if (card && body) {
        card.classList.remove('open');
        body.style.display = 'none';
        localStorage.setItem('bank-input-open', 'false');
      }

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
    const { year, month } = AppState.getYearMonth();
    formYearSel.value = year;
    formMonthSel.value = month === 'all' ? '01' : month;
    bankSelect.value = '';
    amountInput.value = '';
    if (hintEl) hintEl.style.display = 'none';
  });

  /* ============================================
     檢視切換
     ============================================ */
  function bindViewToggle() {
    const monthBtn = document.getElementById('view-month-btn');
    const annualBtn = document.getElementById('view-annual-btn');

    const updateUI = () => {
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
    };

    monthBtn.addEventListener('click', () => {
      currentMode = 'monthly';
      updateUI();
      loadBalances();
    });

    annualBtn.addEventListener('click', () => {
      currentMode = 'annual';
      updateUI();
      loadBalances();
    });

    updateUI();
  }

  /* ============================================
     篩選
     ============================================ */
  document.getElementById('filter-year').addEventListener('change', (e) => {
    filters.year = e.target.value;
    loadBalances();
  });
  document.getElementById('filter-month').addEventListener('change', (e) => {
    filters.month = e.target.value;
    if (e.target.value === 'all') {
      currentMode = 'annual';
      document.getElementById('view-month-btn').classList.remove('btn-primary');
      document.getElementById('view-month-btn').classList.add('btn-ghost');
      document.getElementById('view-annual-btn').classList.add('btn-primary');
      document.getElementById('view-annual-btn').classList.remove('btn-ghost');
      document.getElementById('monthly-view').style.display = 'none';
      document.getElementById('annual-view').style.display = 'block';
    } else {
      currentMode = 'monthly';
      document.getElementById('view-month-btn').classList.add('btn-primary');
      document.getElementById('view-month-btn').classList.remove('btn-ghost');
      document.getElementById('view-annual-btn').classList.remove('btn-primary');
      document.getElementById('view-annual-btn').classList.add('btn-ghost');
      document.getElementById('monthly-view').style.display = 'block';
      document.getElementById('annual-view').style.display = 'none';
    }
    loadBalances();
  });
  document.getElementById('filter-bank').addEventListener('change', (e) => {
    filters.bank = e.target.value;
    if (currentMode === 'monthly') renderTable();
    else loadBalances();
  });
  document.getElementById('filter-clear-btn').addEventListener('click', () => {
    filters = { year: '', month: '', bank: '' };
    document.getElementById('filter-year').value = AppState.year;
    document.getElementById('filter-month').value = 'all';
    document.getElementById('filter-bank').value = '';
    currentMode = 'annual';
    document.getElementById('view-month-btn').classList.remove('btn-primary');
    document.getElementById('view-month-btn').classList.add('btn-ghost');
    document.getElementById('view-annual-btn').classList.add('btn-primary');
    document.getElementById('view-annual-btn').classList.remove('btn-ghost');
    document.getElementById('monthly-view').style.display = 'none';
    document.getElementById('annual-view').style.display = 'block';
    loadBalances();
  });

  /* ============================================
     載入結餘
     ============================================ */
  async function loadBalances() {
    const targetYear = filters.year || AppState.year;
    let targetMonth;
    if (currentMode === 'annual') {
      targetMonth = 'all';
    } else {
      targetMonth = filters.month && filters.month !== 'all' ? filters.month : (AppState.month === 'all' ? '01' : AppState.month);
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

  // 監聽 AppState 年月變更
  AppState.on('ym-change', () => {
    if (!filters.year) filters.year = AppState.year;
    if (!filters.month) {
      if (AppState.month === 'all') currentMode = 'annual';
      else currentMode = 'monthly';
    }
    updateToggleUI();
    loadBalances();
  });

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
     表格操作
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
     Render helpers
     ============================================ */
  function renderBankSelect() {
    if (!bankSelect) return;
    const cur = bankSelect.value;
    bankSelect.innerHTML = `<option value="">— 請選擇銀行 —</option>`
      + banks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    if (cur && banks.some((b) => b.id === cur)) bankSelect.value = cur;
  }

  function renderFilterBankOptions() {
    const sel = document.getElementById('filter-bank');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">全部</option>`
      + banks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    if (cur && banks.some((b) => b.id === cur)) sel.value = cur;
  }

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

  /* ============================================
     初始化
     ============================================ */
  function initFormYearMonthOptions() {
    const ySel = document.getElementById('bank-form-year');
    const mSel = document.getElementById('bank-form-month');
    const now = new Date();
    const curY = now.getFullYear();
    const { year: stateYear, month: stateMonth } = AppState.getYearMonth();

    let yOpts = '';
    for (let y = curY - 5; y <= curY + 5; y++) yOpts += `<option value="${y}">${y} 年</option>`;
    ySel.innerHTML = yOpts;

    let mOpts = '';
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    mSel.innerHTML = mOpts;

    ySel.value = stateYear || curY;
    mSel.value = stateMonth === 'all' ? '01' : (stateMonth || '01');
  }

  function initFilterOptions() {
    const ySel = document.getElementById('filter-year');
    const mSel = document.getElementById('filter-month');
    const now = new Date();
    const curY = now.getFullYear();
    const { year: stateYear } = AppState.getYearMonth();

    let yOpts = '';
    for (let y = curY - 5; y <= curY + 5; y++) yOpts += `<option value="${y}">${y} 年</option>`;
    ySel.innerHTML = yOpts;

    let mOpts = `<option value="all">全部</option>`;
    for (let m = 1; m <= 12; m++) mOpts += `<option value="${String(m).padStart(2,'0')}">${m} 月</option>`;
    mSel.innerHTML = mOpts;

    ySel.value = stateYear || curY;
    mSel.value = 'all';
    filters.year = ySel.value;
    filters.month = 'all';
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
