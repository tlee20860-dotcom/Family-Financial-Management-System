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
   PDF 匯出（修正手機空白版）
   ============================================ */
async function exportToPDF() {
  if (!currentData) {
    alert('資料尚未載入完成');
    return;
  }

  const { year, month } = AppState.getYearMonth();
  const renderEl = document.getElementById('pdf-render');

  // 1. 建立內容
  renderEl.innerHTML = buildPrintHTML(year, month, currentData);

  // 2. 強制顯示並重新計算佈局（關鍵：不能用 left: -99999px，手機瀏覽器會無法渲染）
  renderEl.style.display = 'block';
  renderEl.style.position = 'fixed';
  renderEl.style.top = '0';
  renderEl.style.left = '-2000px';
  renderEl.style.width = '800px';
  renderEl.style.zIndex = '9999';

  // 3. 等待瀏覽器完成排版與字體渲染（時間延長至 500ms）
  await new Promise((r) => setTimeout(r, 500));

  const opt = {
    margin: 10,
    filename: `家庭總開銷_${year}-${month}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      scrollY: 0,
      scrollX: 0
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  try {
    await html2pdf().set(opt).from(renderEl).save();
    renderEl.innerHTML = '';
  } catch (err) {
    console.error('PDF 匯出失敗：', err);
    alert('PDF 匯出失敗：' + err.message);
  }
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
        <td style="text-align:right;">${formatNumber(it.amount)}</td>
        <td>${escapeHtml(it.status || '—')}</td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom:18px;">
        <h3 style="font-size:14px; margin:0 0 6px 0; border-left:4px solid #0a84ff; padding-left:8px;">
          ${escapeHtml(m.memberName)}（共 ${m.itemCount} 筆）
          <span style="float:right; color:#c026d3;">HK$ ${formatNumber(m.sum)}</span>
        </h3>
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="text-align:left; padding:6px; border:1px solid #ddd;">項目名稱</th>
              <th style="text-align:left; padding:6px; border:1px solid #ddd;">類別</th>
              <th style="text-align:left; padding:6px; border:1px solid #ddd;">日期</th>
              <th style="text-align:right; padding:6px; border:1px solid #ddd;">金額</th>
              <th style="text-align:left; padding:6px; border:1px solid #ddd;">狀態</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  const fixedSection = fixedList.length ? `
    <div style="margin-top:18px;">
      <h3 style="font-size:14px; margin:0 0 6px 0; border-left:4px solid #f59e0b; padding-left:8px;">
        家庭固定支出
        <span style="float:right; color:#c026d3;">HK$ ${formatNumber(data.fixedTotal || 0)}</span>
      </h3>
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="text-align:left; padding:6px; border:1px solid #ddd;">項目名稱</th>
            <th style="text-align:left; padding:6px; border:1px solid #ddd;">週期</th>
            <th style="text-align:left; padding:6px; border:1px solid #ddd;">到期日</th>
            <th style="text-align:right; padding:6px; border:1px solid #ddd;">金額</th>
            <th style="text-align:left; padding:6px; border:1px solid #ddd;">狀態</th>
          </tr>
        </thead>
        <tbody>
          ${fixedList.map((x) => `
            <tr>
              <td style="padding:6px; border:1px solid #ddd;">${escapeHtml(x.name)}</td>
              <td style="padding:6px; border:1px solid #ddd;">${escapeHtml(x.cycle)}</td>
              <td style="padding:6px; border:1px solid #ddd;">${escapeHtml(x.dueDate || '—')}</td>
              <td style="text-align:right; padding:6px; border:1px solid #ddd;">${formatNumber(x.amount)}</td>
              <td style="padding:6px; border:1px solid #ddd;">${escapeHtml(x.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <div style="color:#000; background:#fff;">
      <div style="border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:16px;">
        <h1 style="font-size:20px; margin:0;">家庭每月總開銷表</h1>
        <div style="font-size:12px; margin-top:4px;">${year} 年 ${month} 月</div>
      </div>

      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <div style="flex:1; border:1px solid #ddd; padding:10px;">
          <div style="font-size:10px; color:#666;">成員代墊總額</div>
          <div style="font-size:16px; font-weight:700; color:#c026d3;">HK$ ${formatNumber(memberTotal)}</div>
        </div>
        <div style="flex:1; border:1px solid #ddd; padding:10px;">
          <div style="font-size:10px; color:#666;">家庭固定支出</div>
          <div style="font-size:16px; font-weight:700; color:#d97706;">HK$ ${formatNumber(data.fixedTotal || 0)}</div>
        </div>
        <div style="flex:1; border:1px solid #ddd; padding:10px;">
          <div style="font-size:10px; color:#666;">當月總支出</div>
          <div style="font-size:16px; font-weight:700; color:#000;">HK$ ${formatNumber(data.totalExpense || 0)}</div>
        </div>
      </div>

      <h2 style="font-size:14px; margin:0 0 10px 0;">成員支出明細</h2>
      ${memberSections || '<div style="font-size:11px;">本月尚無成員支出紀錄</div>'}

      ${fixedSection}

      <div style="margin-top:24px; padding-top:10px; border-top:1px solid #ccc; font-size:10px; color:#666; text-align:center;">
        由 FAMILY.FIN 家庭財務系統產出
      </div>
    </div>
  `;
}
