// ============================================
// expenses.js — 每月總開銷表（明細 + PDF 匯出）
// ============================================

import { api } from './api.js';
import { formatHKD, escapeHtml, formatNumber } from './utils.js';
import { AppState } from './state.js';

let currentData = null;

export async function initExpensesPage() {
  document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);
  await loadExpenses();
  AppState.on('ym-change', () => loadExpenses());
}

async function loadExpenses() {
  const { year, month } = AppState.getYearMonth();
  document.getElementById('expenses-month').textContent = `${year} 年 ${month} 月 明細`;

  try {
    const data = await api.summary(year, month);
    currentData = data;
    render(data);
  } catch (err) {
    console.error('每月總開銷載入失敗：', err);
    document.getElementById('member-sections').innerHTML =
      `<div class="glass-card"><div class="empty-state text-red">載入失敗，請稍後再試。</div></div>`;
  }
}

function render(data) {
  const perMember = data.perMember || {};
  const memberIds = Object.keys(perMember);

  const memberTotal = Object.values(perMember).reduce((s, m) => s + m.sum, 0);
  document.getElementById('expenses-member-total').textContent = formatHKD(memberTotal);
  document.getElementById('expenses-fixed-total').textContent = formatHKD(data.fixedTotal || 0);
  document.getElementById('expenses-total').textContent = formatHKD(data.totalExpense || 0);

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
    fixedTbody.innerHTML = `<tr><td colspan="5" class="empty-state">本月尚無固定支出</td></tr>`;
  } else {
    fixedTbody.innerHTML = fixedList.map((x) => `
      <tr>
        <td>${escapeHtml(x.name)}</td>
        <td>${escapeHtml(x.cycle)}</td>
        <td class="mono" style="font-size:12px; color:var(--text-muted);">${escapeHtml(x.dueDate || '—')}</td>
        <td class="num">${formatHKD(x.amount)}</td>
        <td>${renderStatusBadge(x.status)}</td>
      </tr>
    `).join('');
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
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
   PDF 匯出：開啟新視窗列印（最穩定方案）
   ============================================ */
async function exportToPDF() {
  if (!currentData) {
    alert('資料尚未載入完成');
    return;
  }

  const { year, month } = AppState.getYearMonth();
  const html = buildPrintHTML(year, month, currentData);

  // 開啟新視窗（乾淨的環境，無主 App CSS 干擾）
  const printWindow = window.open('', '_blank', 'width=900,height=700');

  if (!printWindow) {
    alert('請允許彈出視窗，才能匯出 PDF。\n（設定 ➜ 網站設定 ➜ 允許彈出視窗）');
    return;
  }

  // 將完整 HTML 寫入新視窗（包含內嵌樣式）
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>家庭總開銷_${year}-${month}</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #000000;
          font-family: 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', -apple-system, sans-serif;
        }
        body { padding: 20px; }
        h1 { font-size: 22px; margin: 0 0 6px 0; }
        h2 { font-size: 15px; margin: 20px 0 10px 0; }
        h3 { font-size: 13px; margin: 16px 0 6px 0; border-left: 4px solid #0a84ff; padding-left: 10px; }
        .summary { display: flex; gap: 12px; margin-bottom: 16px; }
        .summary > div { flex: 1; border: 1px solid #ddd; padding: 10px; }
        .summary-label { font-size: 10px; color: #666; margin-bottom: 4px; }
        .summary-value { font-size: 16px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
        th, td { padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
        th { background: #f3f4f6; font-weight: 600; }
        .num { text-align: right; }
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; }
        .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 10px; color: #666; text-align: center; }
        tr, .member-block { page-break-inside: avoid; }
        @page { size: A4; margin: 15mm; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      ${html}
      <div class="footer no-print" style="margin-top:30px; text-align:center;">
        <button onclick="window.print()" style="padding:10px 20px; font-size:14px; cursor:pointer; background:#0a84ff; color:#fff; border:none; border-radius:6px;">
          📄 列印 / 儲存為 PDF
        </button>
        <p style="font-size:11px; color:#999; margin-top:10px;">
          若按鈕無反應，請使用瀏覽器選單 ➜ 列印
        </p>
      </div>
      <script>
        // 頁面載入後自動呼叫列印（僅在桌面版自動，手機版顯示按鈕）
        window.addEventListener('load', function() {
          var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
          if (!isMobile) {
            setTimeout(function() { window.print(); }, 400);
          }
        });
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function buildPrintHTML(year, month, data) {
  const perMember = data.perMember || {};
  const memberIds = Object.keys(perMember);
  const memberTotal = Object.values(perMember).reduce((s, m) => s + m.sum, 0);
  const fixedList = data.fixedList || [];

  const memberSections = memberIds.map((id) => {
    const m = perMember[id];
    const rows = m.items.map((it) => `
      <tr>
        <td>${escapeHtml(it.name)}</td>
        <td>${escapeHtml(it.categoryName || '—')}</td>
        <td>${escapeHtml(it.date || '—')}</td>
        <td class="num">${formatNumber(it.amount)}</td>
        <td>${escapeHtml(it.status || '—')}</td>
      </tr>
    `).join('');

    return `
      <div class="member-block" style="margin-bottom:18px;">
        <h3>
          ${escapeHtml(m.memberName)}（共 ${m.itemCount} 筆）
          <span style="float:right; color:#c026d3;">HK$ ${formatNumber(m.sum)}</span>
        </h3>
        <table>
          <thead>
            <tr>
              <th>項目名稱</th>
              <th>類別</th>
              <th>日期</th>
              <th class="num">金額</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  const fixedSection = fixedList.length ? `
    <div class="member-block" style="margin-top:18px;">
      <h3 style="border-left-color:#f59e0b;">
        家庭固定支出
        <span style="float:right; color:#c026d3;">HK$ ${formatNumber(data.fixedTotal || 0)}</span>
      </h3>
      <table>
        <thead>
          <tr>
            <th>項目名稱</th>
            <th>週期</th>
            <th>到期日</th>
            <th class="num">金額</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody>
          ${fixedList.map((x) => `
            <tr>
              <td>${escapeHtml(x.name)}</td>
              <td>${escapeHtml(x.cycle)}</td>
              <td>${escapeHtml(x.dueDate || '—')}</td>
              <td class="num">${formatNumber(x.amount)}</td>
              <td>${escapeHtml(x.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <div class="header">
      <h1>家庭每月總開銷表</h1>
      <div style="font-size:12px; color:#666;">${year} 年 ${month} 月</div>
    </div>

    <div class="summary">
      <div>
        <div class="summary-label">成員代墊總額</div>
        <div class="summary-value" style="color:#c026d3;">HK$ ${formatNumber(memberTotal)}</div>
      </div>
      <div>
        <div class="summary-label">家庭固定支出</div>
        <div class="summary-value" style="color:#d97706;">HK$ ${formatNumber(data.fixedTotal || 0)}</div>
      </div>
      <div>
        <div class="summary-label">當月總支出</div>
        <div class="summary-value">HK$ ${formatNumber(data.totalExpense || 0)}</div>
      </div>
    </div>

    <h2>成員支出明細</h2>
    ${memberSections || '<div style="font-size:11px;">本月尚無成員支出紀錄</div>'}

    ${fixedSection}

    <div class="footer">
      由 FAMILY.FIN 家庭財務系統產出
    </div>
  `;
}
