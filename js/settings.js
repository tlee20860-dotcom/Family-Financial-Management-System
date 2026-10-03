// ============================================
// settings.js — 系統設定頁邏輯
// ============================================

import { listenAssets, saveAssets } from './db.js';

export function initSettingsPage() {
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
