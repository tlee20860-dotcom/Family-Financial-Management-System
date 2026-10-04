// ============================================
// income.js — 每月收入（全年 / 單月）
// ============================================

import { listenMembers, listenIncomeV2, saveIncomeV2 } from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

let members = [];
let currentIncome = {};
let unsubscribeIncome = null;
let pendingAnnualData = null; // 🆕 暫存全年資料，等 members 載入後重繪

export function initIncomePage() {
  const container = document.getElementById('member-inputs');
  const extraInput = document.getElementById('income-extra');
  const form = document.getElementById('income-form');
  const statusEl = document.getElementById('income-status');

  listenMembers((list) => {
    members = list;
    renderMemberInputs(container);
    applyIncomeToInputs();

    // 🆕 若已有全年資料且當前為全年模式，重新渲染（解決成員名字顯示問題）
    if (pendingAnnualData && AppState.isAnnualMode()) {
      renderAnnual(pendingAnnualData);
    }
  });

  const reloadIncome = async () => {
    const { year, month } = AppState.getYearMonth();
    const isAnnual = month === 'all';

    document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
    document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';
    document.getElementById('income-month').textContent = isAnnual
      ? `${year} 年 全年總覽`
      : `${year} 年 ${month} 月`;

    if (isAnnual) {
      if (unsubscribeIncome) { unsubscribeIncome(); unsubscribeIncome = null; }
      await loadAnnual(year);
    } else {
      pendingAnnualData = null; // 切換到單月模式時清空
      if (unsubscribeIncome) unsubscribeIncome();
      unsubscribeIncome = listenIncomeV2(year, month, (data) => {
        currentIncome = data || {};
        extraInput.value = data.extra ?? '';
        applyIncomeToInputs();
      });
    }
  };

  reloadIncome();
  AppState.on('ym-change', reloadIncome);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (members.length === 0) return;

    const { year, month } = AppState.getYearMonth();
    if (month === 'all') {
      alert('請先切換到特定月份，再輸入收入。');
      return;
    }

    const payload = {};
    members.forEach((m) => {
      const input = document.getElementById(`income-${m.id}`);
      if (input) payload[m.id] = Number(input.value) || 0;
    });
    payload.extra = Number(extraInput.value) || 0;

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

  async function loadAnnual(year) {
    try {
      const data = await api.fetchAnnualSummary(year);
      pendingAnnualData = data;
      renderAnnual(data);
    } catch (err) {
      console.error('全年收入載入失敗：', err);
    }
  }

  function renderAnnual(data) {
    let totalAll = 0;
    const container = document.getElementById('annual-monthly-cards');

    // 建立成員 ID → 名稱 的對照表
    const memberNameMap = {};
    members.forEach((m) => { memberNameMap[m.id] = m.name; });

    const cards = data.monthly.map((m) => {
      const breakdown = m.incomeBreakdown || {};
      if (m.totalIncome === 0) return '';

      totalAll += m.totalIncome;

      const lines = Object.entries(breakdown).map(([key, amount]) => {
        if (!amount) return '';
        const name = key === 'extra'
          ? '額外收入'
          : (memberNameMap[key] || `（未知成員 ${key}）`);
        return `
          <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;">
            <span>${escapeHtml(name)}</span>
            <span class="mono text-emerald">${formatHKD(amount)}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="glass-card" style="margin-bottom:10px; padding:14px;">
          <div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;">
            <div style="font-weight:700; font-size:15px; color:var(--neon-cyan);">${m.monthNum} 月</div>
            <div class="mono text-emerald" style="font-weight:700;">${formatHKD(m.totalIncome)}</div>
          </div>
          <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
            ${lines || '<div style="font-size:12px; color:var(--text-muted);">本月無收入紀錄</div>'}
          </div>
        </div>
      `;
    }).filter(Boolean).join('');

    document.getElementById('annual-income').textContent = formatHKD(totalAll);
    container.innerHTML = cards || '<div class="glass-card"><div class="empty-state">本年度尚無收入紀錄</div></div>';

    container.querySelectorAll('.month-toggle').forEach((el) => {
      el.addEventListener('click', () => {
        const d = el.nextElementSibling;
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

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
