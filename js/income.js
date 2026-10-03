// ============================================
// income.js — 每月收入獨立頁面邏輯
// ============================================

import { listenMembers, listenIncomeV2, saveIncomeV2 } from './db.js';
import { escapeHtml } from './utils.js';
import { AppState } from './state.js';

let members = [];
let currentIncome = {};
let unsubscribeIncome = null;

export function initIncomePage() {
  const container = document.getElementById('member-inputs');
  const extraInput = document.getElementById('income-extra');
  const form = document.getElementById('income-form');
  const statusEl = document.getElementById('income-status');

  // 1. 監聽成員（動態生成輸入框）
  listenMembers((list) => {
    members = list;
    renderMemberInputs(container);
    // 成員更新後，重新填入當前的收入值
    applyIncomeToInputs();
  });

  // 2. 監聽當前年月收入
  const reloadIncome = () => {
    const { year, month } = AppState.getYearMonth();
    document.getElementById('income-month').textContent = `${year} 年 ${month} 月`;
    if (unsubscribeIncome) unsubscribeIncome();
    unsubscribeIncome = listenIncomeV2(year, month, (data) => {
      currentIncome = data || {};
      extraInput.value = data.extra ?? '';
      applyIncomeToInputs();
    });
  };

  reloadIncome();
  AppState.on('ym-change', reloadIncome);

  // 3. 儲存
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { year, month } = AppState.getYearMonth();

    const payload = {};
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input) {
        const val = Number(input.value) || 0;
        if (val > 0) payload[m.id] = val;
      }
    });
    const extra = Number(extraInput.value) || 0;
    if (extra > 0) payload.extra = extra;

    try {
      await saveIncomeV2(year, month, payload);
      statusEl.textContent = '✅ 收入已儲存';
      statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
    } catch (err) {
      statusEl.textContent = '❌ 儲存失敗：' + err.message;
      statusEl.style.display = 'block';
    }
  });

  function renderMemberInputs(container) {
    if (!members.length) {
      container.innerHTML = `<div class="empty-state">尚無成員，請先至「管理成員」新增。</div>`;
      return;
    }
    container.innerHTML = members.map((m) => `
      <div class="field">
        <label class="field-label" for="income-${m.id}">
          ${escapeHtml(m.name)} 投入（HK$）
        </label>
        <input class="input mono" id="income-${m.id}" type="number" min="0" step="0.01" placeholder="0">
      </div>
    `).join('');
  }

  function applyIncomeToInputs() {
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input && currentIncome[m.id] != null) {
        input.value = currentIncome[m.id];
      }
    });
  }
}
