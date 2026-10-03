// ============================================
// settings.js — 系統設定頁邏輯
// ============================================

import {
  listenIncome, saveIncome,
  listenAssets, saveAssets,
} from './db.js';
import { currentYearMonth } from './utils.js';

export function initSettingsPage() {
  const { year, month } = currentYearMonth();

  /* ---------- 收入表單 ---------- */
  const incomeForm = document.getElementById('income-form');
  const husbandInput = document.getElementById('income-husband');
  const wifeInput    = document.getElementById('income-wife');
  const extraInput   = document.getElementById('income-extra');
  const incomeStatus = document.getElementById('income-status');

  listenIncome(year, month, (data) => {
    husbandInput.value = data.husbandContribution ?? '';
    wifeInput.value    = data.wifeContribution    ?? '';
    extraInput.value   = data.extraIncome         ?? '';
  });

  incomeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveIncome(year, month, {
      husbandContribution: husbandInput.value,
      wifeContribution:    wifeInput.value,
      extraIncome:         extraInput.value,
    });
    flashStatus(incomeStatus, '✅ 收入已儲存');
  });

  /* ---------- 資產表單 ---------- */
  const assetForm = document.getElementById('asset-form');
  const bankInput = document.getElementById('asset-bank');
  const assetStatus = document.getElementById('asset-status');

  listenAssets((data) => {
    bankInput.value = data.bankBalance ?? '';
  });

  assetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveAssets({ bankBalance: bankInput.value });
    flashStatus(assetStatus, '✅ 資產已儲存');
  });
}

function flashStatus(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2000);
}
