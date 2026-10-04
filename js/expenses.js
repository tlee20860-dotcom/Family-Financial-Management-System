// ============================================
// expenses.js — 每月總開銷表（全年 / 單月）
// ============================================

import { api } from './api.js';
import { formatHKD, escapeHtml, formatNumber } from './utils.js';
import { AppState } from './state.js';

let currentAnnual = null;
let currentMonthly = null;

export async function initExpensesPage() {
  document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);
  await loadExpenses();
  AppState.on('ym-change', () => loadExpenses());
}

async function loadExpenses() {
  const { year, month } = AppState.getYearMonth();
  const isAnnual = month === 'all';

  document.getElementById('annual-view').style.display = isAnnual ? 'block' : 'none';
  document.getElementById('monthly-view').style.display = isAnnual ? 'none' : 'block';
  document.getElementById('expenses-month').textContent = isAnnual
    ? `${year} 年 全年總覽`
    : `${year} 年 ${month} 月 明細`;

  try {
    if (isAnnual) {
      const data = await api.fetchAnnualSummary(year);
      currentAnnual = data;
      renderAnnual(data);
    } else {
      const data = await api.summary(year, month);
      currentMonthly = data;
      renderMonthly(data);
    }
  } catch (err) {
    console.error('載入失敗：', err);
  }
}

/* ============================================
   全年模式
   ============================================ */
function renderAnnual(data) {
  document.getElementById('annual-income').textContent = formatHKD(data.totalIncome);
  document.getElementById('annual-expense').textContent = formatHKD(data.totalExpense);
  const netEl = document.getElementById('annual-net');
  netEl.textContent = formatHKD(data.netBalance);
  netEl.classList.remove('emerald', 'red');
  netEl.classList.add(data.netBalance >= 0 ? 'emerald' : 'red');

  const container = document.getElementById('annual-monthly-cards');
  container.innerHTML = data.monthly.map((m) => {
    const netColor = m.netBalance >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)';
    const memberIds = Object.keys(m.perMember || {});
    const fixedList = m.fixedList || [];

    const memberHTML = memberIds.length === 0
      ? '<div style="font-size:12px; color:var(--text-muted);">本月無成員支出</div>'
      : memberIds.map((mid) => {
          const md = m.perMember[mid];
          const rows = md.items.map((it) => `
            <tr>
              <td>${escapeHtml(it.name)}</td>
              <td style="font-size:11px; color:var(--text-muted);">${escapeHtml(it.categoryName || '—')}</td>
              <td class="mono" style="font-size:11px; color:var(--text-muted);">${escapeHtml(it.date || '—')}</td>
              <td class="num">${formatHKD(it.amount)}</td>
            </tr>
          `).join('');
          return `
            <div style="margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="font-weight:600;">${escapeHtml(md.memberName)}</span>
                <span class="mono text-magenta">${formatHKD(md.sum)}</span>
              </div>
              <table class="data-table" style="font-size:12px;">
                <tbody>${rows}</tbody>
              </table>
            </div>
          `;
        }).join('');

    const fixedHTML = fixedList.length === 0 ? '' : `
      <div style="margin-top:12px;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">家庭固定支出</div>
        ${fixedList.map((f) => `
          <div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;">
            <span>${escapeHtml(f.name)}</span>
            <span class="mono text-orange">${formatHKD(f.amount)}</span>
          </div>
        `).join('')}
      </div>
    `;

    return `
      <div class="glass-card" style="margin-bottom:12px; padding:14px;">
        <div class="month-toggle" style="display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; user-select:none;">
          <div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:700; font-size:16px; color:var(--neon-cyan); min-width:60px;">${m.monthNum} 月</div>
            <div style="font-size:12px; color:var(--text-muted);">
              收入 <span class="mono text-emerald">${formatHKD(m.totalIncome)}</span>
              ｜ 支出 <span class="mono text-red">${formatHKD(m.totalExpense)}</span>
            </div>
          </div>
          <div class="mono" style="color:${netColor}; font-weight:700; font-size:14px;">
            ${formatHKD(m.netBalance)}
          </div>
        </div>
        <div class="month-detail" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
          ${memberHTML}
          ${fixedHTML}
        </div>
      </div>
    `;
  }).join('');

  // 綁定折疊事件
  container.querySelectorAll('.month-toggle').forEach((el) => {
    el.addEventListener('click', () => {
      const detail = el.nextElementSibling;
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   單月模式（與原邏輯相同）
   ============================================ */
function renderMonthly(data) {
  const perMember = data.perMember || {};
  const memberIds = Object.keys(perMember);

  const totalIncome = data.totalIncome || 0;
  const totalExpense = data.totalExpense || 0;
  const balance = totalIncome - totalExpense;

  document.getElementById('expenses-income').textContent = formatHKD(totalIncome);
  document.getElementById('expenses-total').textContent = formatHKD(totalExpense);
  document.getElementById('expenses-fixed-total').textContent = formatHKD(data.fixedTotal || 0);

  const balanceEl = document.getElementById('expenses-balance');
  balanceEl.textContent = formatHKD(balance);
  balanceEl.classList.remove('emerald', 'red');
  balanceEl.classList.add(balance >= 0 ? 'emerald' : 'red');

  const container = document.getElementById('member-sections');

  if (memberIds.length === 0) {
    container.innerHTML = `<div class="glass-card"><div class="empty-state">本月尚無成員支出紀錄</div></div>`;
  } else {
    container.innerHTML = memberIds.map((id) => {
      const m = perMember[id];
      const rows = m.items.map((it) => {
        const tag = it.isAutoLinked ? '<span class="badge badge-info" style="margin-left:6px;">保險連動</span>' : '';
        return `
          <tr>
            <td>${escapeHtml(it.name)}${tag}</td>
            <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(it.categoryName || '—')}</td>
            <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(it.date || '—')}</td>
            <td class="num">${formatHKD(it.amount)}</td>
            <td>${renderStatusBadge(it.status)}</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="glass-card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:10px; flex-wrap:wrap;">
            <div>
              <div class="glass-card-title" style="margin:0;">
                <a href="member-detail.html?id=${id}" class="text-cyan">${escapeHtml(m.memberName)}</a>
              </div>
              <div class="glass-card-hint">共 ${m.itemCount} 筆</div>
            </div>
            <div style="text-align:right;">
              <div class="glass-card-title" style="margin:0;">小計</div>
              <div class="mono text-magenta" style="font-size:18px; font-weight:700;">${formatHKD(m.sum)}</div>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>項目名稱</th>
                  <th>類別</th>
                  <th>日期</th>
                  <th style="text-align:right;">金額</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }

  const fixedTbody = document.getElementById('fixed-tbody');
  const fixedList = data.fixedList || [];

  if (fixedList.length === 0) {
    fixedTbody.innerHTML = `<tr><td colspan="4" class="empty-state">本月尚無固定支出</td></tr>`;
  } else {
    fixedTbody.innerHTML = fixedList.map((x) => `
      <tr>
        <td>${escapeHtml(x.name)}</td>
        <td>${escapeHtml(x.cycle)}</td>
        <td class="num">${formatHKD(x.amount)}</td>
        <td>${renderStatusBadge(x.status)}</td>
      </tr>
    `).join('');
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderStatusBadge(status) {
  if (status === '已還款' || status === '已付款' || status === '已處理') {
    return `<span class="badge badge-success">${escapeHtml(status)}</span>`;
  }
  if (status === '未還款' || status === '未付款' || status === '未處理') {
    return `<span class="badge badge-pending">${escapeHtml(status)}</span>`;
  }
  return `<span class="badge badge-info">${escapeHtml(status || '—')}</span>`;
}

/* ============================================
   PDF 匯出（僅支援單月模式）
   ============================================ */
async function exportToPDF() {
  if (AppState.isAnnualMode()) {
    alert('PDF 匯出僅支援單月模式，請先切換到特定月份。');
    return;
  }
  if (!currentMonthly) {
    alert('資料尚未載入完成');
    return;
  }

  const { year, month } = AppState.getYearMonth();
  const html = buildPrintHTML(year, month, currentMonthly);

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('請允許彈出視窗，才能匯出 PDF。');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="zh-Hant"><head><meta charset="UTF-8"><title>家庭總開銷_${year}-${month}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin:0; padding:20px; background:#fff; color:#000; font-family:'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif; }
      h1 { font-size:22px; margin:0 0 6px 0; }
      h2 { font-size:15px; margin:20px 0 10px 0; }
      h3 { font-size:13px; margin:16px 0 6px 0; border-left:4px solid #0a84ff; padding-left:10px; }
      .summary { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
      .summary > div { flex:1; min-width:120px; border:1px solid #ddd; padding:10px; }
      .summary-label { font-size:10px; color:#666; margin-bottom:4px; }
      .summary-value { font-size:16px; font-weight:700; }
      table { width:100%; border-collapse:collapse; font-size:11px; margin-top:4px; }
      th, td { padding:6px 8px; border:1px solid #ddd; text-align:left; }
      th { background:#f3f4f6; }
      .num { text-align:right; }
      .header { border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:16px; }
      .footer { margin-top:24px; padding-top:10px; border-top:1px solid #ccc; font-size:10px; color:#666; text-align:center; }
      tr, .member-block { page-break-inside: avoid; }
      @page { size: A4; margin: 15mm; }
      @media print { body { padding:0; } .no-print { display:none !important; } }
    </style></head><body>
    ${html}
    <div class="footer no-print" style="margin-top:30px; text-align:center;">
      <button onclick="window.print()" style="padding:10px 20px; font-size:14px; cursor:pointer; background:#0a84ff; color:#fff; border:none; border-radius:6px;">📄 列印 / 儲存為 PDF</button>
    </div>
    <script>
      window.addEventListener('load', function() {
        var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        if (!isMobile) setTimeout(function() { window.print(); }, 400);
      });
    </script></body></html>
  `);
  printWindow.document.close();
}

function buildPrintHTML(year, month, data) {
  const perMember = data.perMember || {};
  const memberIds = Object.keys(perMember);
  const memberTotal = Object.values(perMember).reduce((s, m) => s + m.sum, 0);
  const fixedList = data.fixedList || [];
  const totalIncome = data.totalIncome || 0;
  const totalExpense = data.totalExpense || 0;
  const balance = totalIncome - totalExpense;

  const memberSections = memberIds.map((id) => {
    const m = perMember[id];
    const rows = m.items.map((it) => `
      <tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.categoryName || '—')}</td>
      <td>${escapeHtml(it.date || '—')}</td><td class="num">${formatNumber(it.amount)}</td>
      <td>${escapeHtml(it.status || '—')}</td></tr>`).join('');
    return `
      <div class="member-block" style="margin-bottom:18px;">
        <h3>${escapeHtml(m.memberName)}（共 ${m.itemCount} 筆）
          <span style="float:right; color:#c026d3;">HK$ ${formatNumber(m.sum)}</span></h3>
        <table><thead><tr><th>項目名稱</th><th>類別</th><th>日期</th><th class="num">金額</th><th>狀態</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }).join('');

  const fixedSection = fixedList.length ? `
    <div class="member-block" style="margin-top:18px;">
      <h3 style="border-left-color:#f59e0b;">家庭固定支出
        <span style="float:right; color:#c026d3;">HK$ ${formatNumber(data.fixedTotal || 0)}</span></h3>
      <table><thead><tr><th>項目名稱</th><th>週期</th><th class="num">金額</th><th>狀態</th></tr></thead>
      <tbody>${fixedList.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.cycle)}</td>
        <td class="num">${formatNumber(x.amount)}</td><td>${escapeHtml(x.status)}</td></tr>`).join('')}</tbody></table>
    </div>` : '';

  return `
    <div class="header"><h1>家庭每月總開銷表</h1>
      <div style="font-size:12px; color:#666;">${year} 年 ${month} 月</div></div>
    <div class="summary">
      <div><div class="summary-label">當月總收入</div><div class="summary-value" style="color:#10b981;">HK$ ${formatNumber(totalIncome)}</div></div>
      <div><div class="summary-label">當月總支出</div><div class="summary-value" style="color:#c026d3;">HK$ ${formatNumber(totalExpense)}</div></div>
      <div><div class="summary-label">當月餘額</div><div class="summary-value">HK$ ${formatNumber(balance)}</div></div>
    </div>
    <h2>成員支出明細</h2>
    ${memberSections || '<div style="font-size:11px;">本月尚無成員支出紀錄</div>'}
    ${fixedSection}
    <div class="footer">由 FAMILY.FIN 家庭財務系統產出</div>`;
}
