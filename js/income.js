// ============================================
// income.js — 每月收入（年度明細 + 批次儲存）
// ============================================

import { listenMembers, listenIncomeV2, saveIncomeV2, getIncomeOnce } from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';
import { api } from './api.js';

let members = [];
let currentIncome = {};
let unsubscribeIncome = null;
let pendingAnnualData = null;

export function initIncomePage() {
  const container = document.getElementById('member-inputs');
  const extraInput = document.getElementById('income-extra');
  const form = document.getElementById('income-form');
  const statusEl = document.getElementById('income-status');

  listenMembers((list) => {
    members = list;
    renderMemberInputs(container);
    applyIncomeToInputs();
    if (pendingAnnualData && AppState.isAnnualMode()) renderAnnual(pendingAnnualData);
  });

  const reloadIncome = async () => {
    const { year, month } = AppState.getYearMonth();
    const isAnnual = month === 'all';
    document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
    document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';
    document.getElementById('income-month').textContent = isAnnual ? `${year} 年 全年總覽` : `${year} 年 ${month} 月`;

    if (isAnnual) {
      if (unsubscribeIncome) { unsubscribeIncome(); unsubscribeIncome = null; }
      await loadAnnual(year);
    } else {
      pendingAnnualData = null;
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
    if (month === 'all') return alert('請先切換到特定月份，再輸入收入。');
    const payload = {};
    members.forEach((m) => { const input = document.getElementById(`income-${m.id}`); if (input) payload[m.id] = Number(input.value) || 0; });
    payload.extra = Number(extraInput.value) || 0;

    try {
      await saveIncomeV2(year, month, payload);
      statusEl.textContent = '✅ 收入已儲存'; statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
    } catch (err) { statusEl.textContent = '❌ 儲存失敗：' + err.message; statusEl.style.display = 'block'; }
  });

  // 查看年度明細
  document.getElementById('view-annual-income-btn').addEventListener('click', () => openDetailModal());
  document.getElementById('income-detail-cancel-btn').addEventListener('click', () => document.getElementById('income-detail-modal').classList.remove('active'));
  document.getElementById('income-detail-save-btn').addEventListener('click', async () => {
    const rows = document.querySelectorAll('.income-detail-row');
    const promises = [];
    rows.forEach((row) => {
      const month = row.dataset.month;
      const payload = {};
      members.forEach((m) => { const input = row.querySelector(`.inc-${m.id}`); if (input) payload[m.id] = Number(input.value) || 0; });
      payload.extra = Number(row.querySelector('.inc-extra').value) || 0;
      promises.push(saveIncomeV2(AppState.year, month, payload));
    });
    try { await Promise.all(promises); alert('✅ 已批次更新年度收入'); document.getElementById('income-detail-modal').classList.remove('active'); reloadIncome(); } catch (err) { alert('批次更新失敗：' + err.message); }
  });

  async function loadAnnual(year) {
    try {
      const promises = [];
      for (let m = 1; m <= 12; m++) promises.push(getIncomeOnce(year, String(m).padStart(2, '0')));
      const results = await Promise.all(promises);
      pendingAnnualData = { year, results };
      renderAnnual(pendingAnnualData);
    } catch (err) { console.error('全年收入載入失敗：', err); }
  }

  function renderAnnual(data) {
    let totalAll = 0;
    const container = document.getElementById('annual-monthly-cards');
    const cards = data.results.map((breakdown, i) => {
      const monthNum = i + 1;
      let monthTotal = 0;
      Object.values(breakdown).forEach((v) => { monthTotal += Number(v) || 0; });
      totalAll += monthTotal;

      const lines = Object.entries(breakdown).map(([key, amount]) => {
        if (!amount) return '';
        const name = key === 'extra' ? '額外收入' : (members.find((x) => x.id === key)?.name || key);
        return `<div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;"><span>${escapeHtml(name)}</span><span class="mono text-emerald">${formatHKD(amount)}</span></div>`;
      }).join('');

      return `<div class="glass-card" style="margin-bottom:10px; padding:14px;"><div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;"><div style="font-weight:700; font-size:15px; color:var(--neon-cyan);">${monthNum} 月</div><div class="mono text-emerald" style="font-weight:700;">${formatHKD(monthTotal)}</div></div><div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">${lines || '<div style="font-size:12px; color:var(--text-muted);">本月無收入紀錄</div>'}</div></div>`;
    }).join('');

    document.getElementById('annual-income').textContent = formatHKD(totalAll);
    container.innerHTML = cards || '<div class="glass-card"><div class="empty-state">本年度尚無收入紀錄</div></div>';
    container.querySelectorAll('.month-toggle').forEach((el) => { el.addEventListener('click', () => { const d = el.nextElementSibling; d.style.display = d.style.display === 'none' ? 'block' : 'none'; }); });
    if (window.lucide) window.lucide.createIcons();
  }

  async function openDetailModal() {
    document.getElementById('income-detail-title').textContent = `${AppState.year} 年度收入明細`;
    const body = document.getElementById('income-detail-body');

    // 動態生成表格頭
    let header = '<tr><th style="padding:8px; border-bottom:1px solid var(--glass-border);">月份</th>';
    members.forEach((m) => { header += `<th style="padding:8px; text-align:right; border-bottom:1px solid var(--glass-border);">${escapeHtml(m.name)}</th>`; });
    header += '<th style="padding:8px; text-align:right; border-bottom:1px solid var(--glass-border);">額外</th></tr>';

    let rows = '';
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const data = await getIncomeOnce(AppState.year, monthStr);
      let row = `<tr class="income-detail-row" data-month="${monthStr}"><td style="padding:4px; font-family:var(--font-mono); font-size:12px;">${m}月</td>`;
      members.forEach((mem) => { row += `<td style="padding:4px;"><input type="number" class="input inc-${mem.id}" value="${data[mem.id] || 0}" min="0" step="0.01" style="width:100%; padding:4px 8px; font-size:12px;"></td>`; });
      row += `<td style="padding:4px;"><input type="number" class="input inc-extra" value="${data.extra || 0}" min="0" step="0.01" style="width:100%; padding:4px 8px; font-size:12px;"></td></tr>`;
      rows += row;
    }

    body.innerHTML = `<table style="width:100%; border-collapse:collapse; min-width:600px;"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
    document.getElementById('income-detail-modal').classList.add('active');
  }

  function renderMemberInputs(container) {
    if (!members.length) { container.innerHTML = `<div class="empty-state">尚無成員，請先至「管理成員」新增。</div>`; return; }
    container.innerHTML = members.map((m) => `<div class="field"><label class="field-label" for="income-${m.id}">${escapeHtml(m.name)} 投入（HK$）</label><input class="input mono" id="income-${m.id}" type="number" min="0" step="0.01" placeholder="0"></div>`).join('');
  }

  function applyIncomeToInputs() {
    members.forEach((m) => { const input = document.getElementById(`income-${m.id}`); if (input && currentIncome[m.id] != null) input.value = currentIncome[m.id]; });
  }
}
