// ============================================
// annual-report.js — 年度報表（雙檢視模式）
// ============================================

import { api } from './api.js';
import { formatHKD, formatNumber, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let currentYear = '';
let annualData = null;
let currentView = 'summary'; // 'summary' | 'monthly'

export function initAnnualReportPage() {
  const { year } = AppState.getYearMonth();
  currentYear = year;

  document.getElementById('prev-year-btn').addEventListener('click', () => {
    currentYear = String(Number(currentYear) - 1);
    loadAnnual();
  });
  document.getElementById('next-year-btn').addEventListener('click', () => {
    currentYear = String(Number(currentYear) + 1);
    loadAnnual();
  });
  document.getElementById('export-excel-btn').addEventListener('click', exportToExcel);

  document.getElementById('view-summary-btn').addEventListener('click', () => {
    currentView = 'summary';
    document.getElementById('summary-view').style.display = 'block';
    document.getElementById('monthly-view').style.display = 'none';
    document.getElementById('view-summary-btn').classList.add('btn-primary');
    document.getElementById('view-summary-btn').classList.remove('btn-ghost');
    document.getElementById('view-monthly-btn').classList.add('btn-ghost');
    document.getElementById('view-monthly-btn').classList.remove('btn-primary');
    if (annualData) renderSummary();
  });

  document.getElementById('view-monthly-btn').addEventListener('click', () => {
    currentView = 'monthly';
    document.getElementById('summary-view').style.display = 'none';
    document.getElementById('monthly-view').style.display = 'block';
    document.getElementById('view-summary-btn').classList.add('btn-ghost');
    document.getElementById('view-summary-btn').classList.remove('btn-primary');
    document.getElementById('view-monthly-btn').classList.add('btn-primary');
    document.getElementById('view-monthly-btn').classList.remove('btn-ghost');
    if (annualData) renderMonthly();
  });

  loadAnnual();
}

async function loadAnnual() {
  document.getElementById('annual-year').textContent = `${currentYear} 年`;
  document.getElementById('summary-tbody').innerHTML = '<tr><td colspan="8" class="empty-state">載入中…</td></tr>';
  document.getElementById('monthly-tbody').innerHTML = '<tr><td colspan="14" class="empty-state">載入中…</td></tr>';

  try {
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      promises.push(api.summary(currentYear, mm));
    }
    const results = await Promise.all(promises);

    annualData = buildAnnualData(currentYear, results);
    renderStats();
    if (currentView === 'summary') renderSummary();
    else renderMonthly();
  } catch (err) {
    console.error('年度報表載入失敗：', err);
    document.getElementById('summary-tbody').innerHTML = '<tr><td colspan="8" class="empty-state text-red">載入失敗，請稍後再試。</td></tr>';
    document.getElementById('monthly-tbody').innerHTML = '<tr><td colspan="14" class="empty-state text-red">載入失敗，請稍後再試。</td></tr>';
  }
}

function buildAnnualData(year, monthlyResults) {
  const memberMap = {};
  const fixedMap = {};
  const monthlyTotals = { income: Array(12).fill(0), expense: Array(12).fill(0) };

  monthlyResults.forEach((monthData, idx) => {
    const incomeBreakdown = monthData.incomeBreakdown || {};
    Object.entries(incomeBreakdown).forEach(([memberId, amount]) => {
      const num = Number(amount) || 0;
      if (num === 0) return;
      const displayName = memberId === 'extra' ? '額外收入' : (monthData.perMember?.[memberId]?.memberName || memberId);
      if (!memberMap[memberId]) {
        memberMap[memberId] = { id: memberId, name: displayName, order: memberId === 'extra' ? Number.MAX_SAFE_INTEGER : 0, income: Array(12).fill(0), expenses: {} };
      }
      memberMap[memberId].income[idx] = num;
    });

    const perMember = monthData.perMember || {};
    Object.entries(perMember).forEach(([memberId, mData]) => {
      if (!memberMap[memberId]) {
        memberMap[memberId] = { id: memberId, name: mData.memberName || memberId, order: mData.order != null ? mData.order : Number.MAX_SAFE_INTEGER, income: Array(12).fill(0), expenses: {} };
      }
      memberMap[memberId].order = mData.order != null ? mData.order : memberMap[memberId].order;

      (mData.items || []).forEach((item) => {
        const key = item.name || '（未命名）';
        if (!memberMap[memberId].expenses[key]) memberMap[memberId].expenses[key] = Array(12).fill(0);
        memberMap[memberId].expenses[key][idx] += Number(item.amount) || 0;
      });
    });

    (monthData.fixedList || []).forEach((f) => {
      const key = f.name || '（未命名）';
      if (!fixedMap[key]) fixedMap[key] = Array(12).fill(0);
      fixedMap[key][idx] += Number(f.amount) || 0;
    });

    monthlyTotals.income[idx] = monthData.totalIncome || 0;
    monthlyTotals.expense[idx] = monthData.totalExpense || 0;
  });

  const membersArr = Object.values(memberMap).sort((a, b) => {
    if (a.id === 'extra') return 1;
    if (b.id === 'extra') return -1;
    const oa = a.order != null ? a.order : Number.MAX_SAFE_INTEGER;
    const ob = b.order != null ? b.order : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return 0;
  });

  return { year, members: membersArr, fixedExpenses: fixedMap, monthly: monthlyTotals };
}

function renderStats() {
  const totalIncome = annualData.monthly.income.reduce((s, x) => s + x, 0);
  const totalExpense = annualData.monthly.expense.reduce((s, x) => s + x, 0);
  const balance = totalIncome - totalExpense;
  document.getElementById('annual-income').textContent = formatHKD(totalIncome);
  document.getElementById('annual-expense').textContent = formatHKD(totalExpense);
  const balanceEl = document.getElementById('annual-balance');
  balanceEl.textContent = formatHKD(balance);
  balanceEl.classList.remove('emerald', 'red');
  balanceEl.classList.add(balance >= 0 ? 'emerald' : 'red');
}

/* ============================================
   全年總合檢視
   ============================================ */
function renderSummary() {
  const thead = document.getElementById('summary-thead');
  const tbody = document.getElementById('summary-tbody');

  const categories = ['醫療類', '學校類', '保險類', '固定費用類', '其他'];
  let headHTML = `<tr>
    <th style="min-width:100px;">成員</th>
    <th class="num">總收入</th>
    <th class="num">總支出</th>
    ${categories.map((c) => `<th class="num">${c}</th>`).join('')}
    <th class="num">年度淨結餘</th>
  </tr>`;
  thead.innerHTML = headHTML;

  const rows = [];
  let grandTotalIncome = 0;
  let grandTotalExpense = 0;
  const grandCategoryTotals = Object.fromEntries(categories.map((c) => [c, 0]));

  annualData.members.forEach((m) => {
    if (m.id === 'extra') return; // 先跳過額外收入，最後單獨處理

    const totalIncome = m.income.reduce((s, x) => s + x, 0);
    const totalExpense = Object.values(m.expenses).reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0);

    const catTotals = {};
    categories.forEach((c) => { catTotals[c] = 0; });

    // 簡易分類對應（根據項目名稱粗略對應，或用類別名稱匹配）
    Object.entries(m.expenses).forEach(([itemName, arr]) => {
      const sum = arr.reduce((a, b) => a + b, 0);
      // 若 itemName 含有醫療字眼，歸類為醫療類，以此類推
      let matched = false;
      for (const c of categories) {
        if (itemName.includes(c.replace('類', '')) || itemName.includes('看病') || itemName.includes('牙醫') || itemName.includes('藥')) {
          catTotals[c] += sum;
          matched = true;
          break;
        }
      }
      if (!matched) catTotals['其他'] += sum;
    });

    grandTotalIncome += totalIncome;
    grandTotalExpense += totalExpense;
    categories.forEach((c) => { grandCategoryTotals[c] += catTotals[c]; });

    rows.push(`
      <tr>
        <td>${escapeHtml(m.name)}</td>
        <td class="num text-emerald">${formatHKD(totalIncome)}</td>
        <td class="num text-red">${formatHKD(totalExpense)}</td>
        ${categories.map((c) => `<td class="num">${formatHKD(catTotals[c])}</td>`).join('')}
        <td class="num" style="color:${(totalIncome - totalExpense) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatHKD(totalIncome - totalExpense)}</td>
      </tr>
    `);
  });

  // 家庭固定支出
  const fixedTotal = Object.values(annualData.fixedExpenses).reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0);
  grandTotalExpense += fixedTotal;

  // 加入額外收入
  const extraMember = annualData.members.find((m) => m.id === 'extra');
  const extraIncome = extraMember ? extraMember.income.reduce((s, x) => s + x, 0) : 0;
  grandTotalIncome += extraIncome;

  // 總計列
  rows.push(`
    <tr class="group-header">
      <td>【總計】</td>
      <td class="num">${formatHKD(grandTotalIncome)}</td>
      <td class="num">${formatHKD(grandTotalExpense)}</td>
      ${categories.map((c) => `<td class="num">${formatHKD(grandCategoryTotals[c])}</td>`).join('')}
      <td class="num" style="color:${(grandTotalIncome - grandTotalExpense) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatHKD(grandTotalIncome - grandTotalExpense)}</td>
    </tr>
  `);

  // 若沒資料
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">本年度尚無資料</td></tr>';
    return;
  }

  tbody.innerHTML = rows.join('');
  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   按月明細檢視
   ============================================ */
function renderMonthly() {
  const tbody = document.getElementById('monthly-tbody');
  const rows = [];

  // 收入區塊
  rows.push(`<tr class="group-header"><td class="col-item">【收入】</td>${'<td></td>'.repeat(13)}</tr>`);
  annualData.members.filter((m) => m.income.some((v) => v > 0)).forEach((m) => {
    const subtotal = m.income.reduce((s, x) => s + x, 0);
    rows.push(`
      <tr>
        <td class="col-item item-sub">${escapeHtml(m.name)}</td>
        ${m.income.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
        <td class="num">${formatNumber(subtotal)}</td>
      </tr>
    `);
  });
  const totalIncome = annualData.monthly.income.reduce((s, x) => s + x, 0);
  rows.push(`
    <tr class="subtotal-row">
      <td class="col-item">收入小計</td>
      ${annualData.monthly.income.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
      <td class="num">${formatNumber(totalIncome)}</td>
    </tr>
  `);

  // 成員支出區塊
  annualData.members.forEach((m) => {
    const itemNames = Object.keys(m.expenses);
    if (itemNames.length === 0) return;

    rows.push(`<tr class="group-header"><td class="col-item">【${escapeHtml(m.name)}】</td>${'<td></td>'.repeat(13)}</tr>`);
    const monthlyMemberTotal = Array(12).fill(0);

    itemNames.forEach((itemName) => {
      const amounts = m.expenses[itemName];
      amounts.forEach((v, i) => { monthlyMemberTotal[i] += v; });
      const subtotal = amounts.reduce((s, x) => s + x, 0);
      rows.push(`
        <tr>
          <td class="col-item item-sub">${escapeHtml(itemName)}</td>
          ${amounts.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
          <td class="num">${formatNumber(subtotal)}</td>
        </tr>
      `);
    });

    const memberSubtotal = monthlyMemberTotal.reduce((s, x) => s + x, 0);
    rows.push(`
      <tr class="subtotal-row">
        <td class="col-item">${escapeHtml(m.name)}小計</td>
        ${monthlyMemberTotal.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
        <td class="num">${formatNumber(memberSubtotal)}</td>
      </tr>
    `);
  });

  // 固定支出區塊
  const fixedNames = Object.keys(annualData.fixedExpenses);
  if (fixedNames.length > 0) {
    rows.push(`<tr class="group-header"><td class="col-item">【家庭固定支出】</td>${'<td></td>'.repeat(13)}</tr>`);
    const monthlyFixedTotal = Array(12).fill(0);
    fixedNames.forEach((name) => {
      const amounts = annualData.fixedExpenses[name];
      amounts.forEach((v, i) => { monthlyFixedTotal[i] += v; });
      const subtotal = amounts.reduce((s, x) => s + x, 0);
      rows.push(`
        <tr>
          <td class="col-item item-sub">${escapeHtml(name)}</td>
          ${amounts.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
          <td class="num">${formatNumber(subtotal)}</td>
        </tr>
      `);
    });
    const fixedSubtotal = monthlyFixedTotal.reduce((s, x) => s + x, 0);
    rows.push(`
      <tr class="subtotal-row">
        <td class="col-item">固定支出小計</td>
        ${monthlyFixedTotal.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
        <td class="num">${formatNumber(fixedSubtotal)}</td>
      </tr>
    `);
  }

  // 月度總計
  rows.push(`<tr class="group-header"><td class="col-item">【月度總計】</td>${'<td></td>'.repeat(13)}</tr>`);
  const totalExpense = annualData.monthly.expense.reduce((s, x) => s + x, 0);
  rows.push(`
    <tr class="total-row">
      <td class="col-item">當月總支出</td>
      ${annualData.monthly.expense.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
      <td class="num">${formatNumber(totalExpense)}</td>
    </tr>
  `);

  const balance = totalIncome - totalExpense;
  rows.push(`
    <tr class="net-row">
      <td class="col-item">當月淨結餘</td>
      ${annualData.monthly.income.map((v, i) => {
        const net = v - annualData.monthly.expense[i];
        const color = net >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)';
        return `<td class="num" style="color:${color};">${net !== 0 ? formatNumber(net) : '—'}</td>`;
      }).join('')}
      <td class="num" style="color:${balance >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatNumber(balance)}</td>
    </tr>
  `);

  tbody.innerHTML = rows.join('');
  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   Excel 匯出
   ============================================ */
function exportToExcel() {
  if (!annualData) return alert('資料尚未載入完成');
  const data = annualData;
  const rows = [];
  rows.push(['項目', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '年度小計']);

  const totalIncome = data.monthly.income.reduce((s, x) => s + x, 0);
  const totalExpense = data.monthly.expense.reduce((s, x) => s + x, 0);
  const balance = totalIncome - totalExpense;

  rows.push(['【收入】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  data.members.filter((m) => m.income.some((v) => v > 0)).forEach((m) => {
    const subtotal = m.income.reduce((s, x) => s + x, 0);
    rows.push([`  ${m.name}`, ...m.income, subtotal]);
  });
  rows.push(['收入小計', ...data.monthly.income, totalIncome]);

  data.members.forEach((m) => {
    const itemNames = Object.keys(m.expenses);
    if (itemNames.length === 0) return;
    rows.push([`【${m.name}】`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const monthlyMemberTotal = Array(12).fill(0);
    itemNames.forEach((itemName) => {
      const amounts = m.expenses[itemName];
      amounts.forEach((v, i) => { monthlyMemberTotal[i] += v; });
      const subtotal = amounts.reduce((s, x) => s + x, 0);
      rows.push([`  ${itemName}`, ...amounts, subtotal]);
    });
    const memberSubtotal = monthlyMemberTotal.reduce((s, x) => s + x, 0);
    rows.push([`${m.name}小計`, ...monthlyMemberTotal, memberSubtotal]);
  });

  const fixedNames = Object.keys(data.fixedExpenses);
  if (fixedNames.length > 0) {
    rows.push(['【家庭固定支出】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const monthlyFixedTotal = Array(12).fill(0);
    fixedNames.forEach((name) => {
      const amounts = data.fixedExpenses[name];
      amounts.forEach((v, i) => { monthlyFixedTotal[i] += v; });
      const subtotal = amounts.reduce((s, x) => s + x, 0);
      rows.push([`  ${name}`, ...amounts, subtotal]);
    });
    const fixedSubtotal = monthlyFixedTotal.reduce((s, x) => s + x, 0);
    rows.push(['固定支出小計', ...monthlyFixedTotal, fixedSubtotal]);
  }

  rows.push(['【月度總計】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['當月總支出', ...data.monthly.expense, totalExpense]);
  const netMonthly = data.monthly.income.map((v, i) => v - data.monthly.expense[i]);
  rows.push(['當月淨結餘', ...netMonthly, balance]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, ...Array(12).fill({ wch: 12 }), { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${data.year}年度報表`);

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const filename = `家庭報表(${data.year})-${mm}${dd}${hh}${ss}.xlsx`;

  XLSX.writeFile(wb, filename);
}
