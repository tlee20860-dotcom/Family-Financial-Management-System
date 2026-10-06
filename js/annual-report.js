// ============================================
// annual-report.js — 年度報表（雙檢視模式）
// ============================================

import { api } from './api.js';
import { formatHKD, formatNumber, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let currentYear = '';
let currentView = 'summary';
let currentDisplayMonth = '01';   // 🆕 按月明細的顯示月份
let annualData = null;

const CATEGORY_ORDER = ['醫療類', '學校類', '保險類', '固定費用類', '其他'];

export function initAnnualReportPage() {
  const { year } = AppState.getYearMonth();
  currentYear = year;
  currentDisplayMonth = AppState.month === 'all' ? '01' : AppState.month;

  renderYearSwitcher();
  renderMonthSwitcher();

  document.getElementById('export-excel-btn').addEventListener('click', exportToExcel);

  document.getElementById('view-summary-btn').addEventListener('click', () => {
    currentView = 'summary';
    document.getElementById('summary-view').style.display = 'block';
    document.getElementById('monthly-view').style.display = 'none';
    document.getElementById('month-switcher').style.display = 'none';
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
    document.getElementById('month-switcher').style.display = 'flex';
    document.getElementById('view-summary-btn').classList.add('btn-ghost');
    document.getElementById('view-summary-btn').classList.remove('btn-primary');
    document.getElementById('view-monthly-btn').classList.add('btn-primary');
    document.getElementById('view-monthly-btn').classList.remove('btn-ghost');
    if (annualData) renderMonthly();
  });

  loadAnnual();
}

/* ============================================
   🆕 年份切換器
   ============================================ */
function renderYearSwitcher() {
  const el = document.getElementById('year-switcher');
  if (!el) return;
  const y = Number(currentYear);
  el.innerHTML = `
    <button class="year-btn year-arrow" data-year="${y - 1}">◀ ${y - 1}</button>
    <button class="year-btn active">${y}</button>
    <button class="year-btn year-arrow" data-year="${y + 1}">${y + 1} ▶</button>
  `;

  el.querySelectorAll('button[data-year]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentYear = btn.dataset.year;
      renderYearSwitcher();
      loadAnnual();
    });
  });
}

/* ============================================
   🆕 月份切換器
   ============================================ */
function renderMonthSwitcher() {
  const el = document.getElementById('month-switcher');
  if (!el) return;
  let html = '';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    html += `<button class="month-btn ${mm === currentDisplayMonth ? 'active' : ''}" data-month="${mm}">${m}月</button>`;
  }
  el.innerHTML = html;

  el.querySelectorAll('button[data-month]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDisplayMonth = btn.dataset.month;
      renderMonthSwitcher();
      if (annualData) renderMonthly();
    });
  });
}

/* ============================================
   載入年度資料
   ============================================ */
async function loadAnnual() {
  document.getElementById('report-year-title').textContent = `${currentYear} 年`;
  document.getElementById('summary-tbody').innerHTML = '<tr><td colspan="9" class="empty-state">載入中…</td></tr>';
  document.getElementById('monthly-tbody').innerHTML = '<tr><td colspan="3" class="empty-state">載入中…</td></tr>';

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
    document.getElementById('summary-tbody').innerHTML = '<tr><td colspan="9" class="empty-state text-red">載入失敗，請稍後再試。</td></tr>';
    document.getElementById('monthly-tbody').innerHTML = '<tr><td colspan="3" class="empty-state text-red">載入失敗，請稍後再試。</td></tr>';
  }
}

/* ============================================
   🆕 buildAnnualData — 收集 12 個月的資料
   fixedExpenses 加入 categoryName
   ============================================ */
function buildAnnualData(year, monthlyResults) {
  const memberMap = {};
  const fixedMap = {};   // key: categoryName → { [itemName]: [12] }
  const monthlyTotals = { income: Array(12).fill(0), expense: Array(12).fill(0) };

  monthlyResults.forEach((monthData, idx) => {
    const incomeBreakdown = monthData.incomeBreakdown || {};
    Object.entries(incomeBreakdown).forEach(([memberId, amount]) => {
      const num = Math.round(Number(amount) || 0);
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
        memberMap[memberId].expenses[key][idx] += Math.round(Number(item.amount) || 0);
      });
    });

    // 🆕 家庭固定支出：按 categoryName 分類
    (monthData.fixedList || []).forEach((f) => {
      const catName = f.categoryName || '其他';
      const key = f.name || '（未命名）';
      if (!fixedMap[catName]) fixedMap[catName] = {};
      if (!fixedMap[catName][key]) fixedMap[catName][key] = Array(12).fill(0);
      fixedMap[catName][key][idx] += Math.round(Number(f.amount) || 0);
    });

    monthlyTotals.income[idx] = Math.round(monthData.totalIncome || 0);
    monthlyTotals.expense[idx] = Math.round(monthData.totalExpense || 0);
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

  const categories = CATEGORY_ORDER;

  thead.innerHTML = `<tr>
    <th style="min-width:100px;">成員</th>
    <th class="num">總收入</th>
    <th class="num">總支出</th>
    ${categories.map((c) => `<th class="num">${c}</th>`).join('')}
    <th class="num">年度淨結餘</th>
  </tr>`;

  const rows = [];
  let grandTotalIncome = 0;
  let grandTotalExpense = 0;
  const grandCategoryTotals = Object.fromEntries(categories.map((c) => [c, 0]));

  /* 成員行 */
  annualData.members.forEach((m) => {
    if (m.id === 'extra') return;

    const totalIncome = m.income.reduce((s, x) => s + x, 0);
    const totalExpense = Object.values(m.expenses).reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0);

    const catTotals = {};
    categories.forEach((c) => { catTotals[c] = 0; });

    Object.entries(m.expenses).forEach(([itemName, arr]) => {
      const sum = arr.reduce((a, b) => a + b, 0);
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

  /* 🆕 家庭共用支出（按類別彙總為一列） */
  const sharedCatTotals = {};
  categories.forEach((c) => { sharedCatTotals[c] = 0; });
  let sharedTotal = 0;

  Object.entries(annualData.fixedExpenses).forEach(([catName, itemsMap]) => {
    const catKey = categories.includes(catName) ? catName : '其他';
    let catSum = 0;
    Object.values(itemsMap).forEach((arr) => {
      catSum += arr.reduce((a, b) => a + b, 0);
    });
    sharedCatTotals[catKey] += catSum;
    sharedTotal += catSum;
  });

  grandTotalExpense += sharedTotal;
  categories.forEach((c) => { grandCategoryTotals[c] += sharedCatTotals[c]; });

  if (sharedTotal > 0) {
    rows.push(`
      <tr class="shared-row">
        <td>家庭共用支出</td>
        <td class="num">—</td>
        <td class="num">${formatHKD(sharedTotal)}</td>
        ${categories.map((c) => `<td class="num">${sharedCatTotals[c] > 0 ? formatHKD(sharedCatTotals[c]) : '—'}</td>`).join('')}
        <td class="num" style="color:var(--neon-magenta);">-${formatHKD(sharedTotal)}</td>
      </tr>
    `);
  }

  /* 額外收入 */
  const extraMember = annualData.members.find((m) => m.id === 'extra');
  const extraIncome = extraMember ? extraMember.income.reduce((s, x) => s + x, 0) : 0;
  grandTotalIncome += extraIncome;

  /* 總計行 */
  rows.push(`
    <tr class="group-header">
      <td>【總計】</td>
      <td class="num">${formatHKD(grandTotalIncome)}</td>
      <td class="num">${formatHKD(grandTotalExpense)}</td>
      ${categories.map((c) => `<td class="num">${formatHKD(grandCategoryTotals[c])}</td>`).join('')}
      <td class="num" style="color:${(grandTotalIncome - grandTotalExpense) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatHKD(grandTotalIncome - grandTotalExpense)}</td>
    </tr>
  `);

  tbody.innerHTML = rows.join('');
  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   🆕 按月明細檢視（單月）
   ============================================ */
function renderMonthly() {
  const tbody = document.getElementById('monthly-tbody');
  const monthIdx = Number(currentDisplayMonth) - 1;
  const rows = [];

  const sumArr = (arr) => arr.reduce((s, x) => s + x, 0);

  /* 收入 */
  const incomeRows = annualData.members.filter((m) => m.income.some((v) => v > 0));
  if (incomeRows.length > 0) {
    rows.push(`<tr class="group-header"><td>【收入】</td><td class="num"></td><td class="num"></td></tr>`);
    incomeRows.forEach((m) => {
      const current = m.income[monthIdx] || 0;
      const annual = sumArr(m.income);
      rows.push(`
        <tr>
          <td>${escapeHtml(m.name)}</td>
          <td class="num text-emerald">${current ? formatNumber(current) : '—'}</td>
          <td class="num text-emerald">${annual ? formatNumber(annual) : '—'}</td>
        </tr>
      `);
    });
    const totalCurrent = annualData.monthly.income[monthIdx] || 0;
    const totalAnnual = sumArr(annualData.monthly.income);
    rows.push(`
      <tr class="subtotal-row">
        <td>收入小計</td>
        <td class="num">${formatNumber(totalCurrent)}</td>
        <td class="num">${formatNumber(totalAnnual)}</td>
      </tr>
    `);
  }

  /* 每位成員 */
  annualData.members.forEach((m) => {
    if (m.id === 'extra') return;
    const itemNames = Object.keys(m.expenses);
    if (itemNames.length === 0) return;

    let currentMemberSum = 0;
    let annualMemberSum = 0;

    itemNames.forEach((itemName) => {
      const amounts = m.expenses[itemName];
      currentMemberSum += amounts[monthIdx] || 0;
      annualMemberSum += sumArr(amounts);
    });

    rows.push(`<tr class="group-header"><td>【${escapeHtml(m.name)}】</td><td class="num"></td><td class="num"></td></tr>`);
    itemNames.forEach((itemName) => {
      const amounts = m.expenses[itemName];
      const current = amounts[monthIdx] || 0;
      const annual = sumArr(amounts);
      rows.push(`
        <tr>
          <td>${escapeHtml(itemName)}</td>
          <td class="num">${current ? formatNumber(current) : '—'}</td>
          <td class="num">${annual ? formatNumber(annual) : '—'}</td>
        </tr>
      `);
    });
    rows.push(`
      <tr class="subtotal-row">
        <td>${escapeHtml(m.name)}小計</td>
        <td class="num">${formatNumber(currentMemberSum)}</td>
        <td class="num">${formatNumber(annualMemberSum)}</td>
      </tr>
    `);
  });

  /* 家庭共用支出（按類別） */
  const fixedCatNames = Object.keys(annualData.fixedExpenses);
  let sharedCurrentTotal = 0;
  let sharedAnnualTotal = 0;

  if (fixedCatNames.length > 0) {
    const catRows = [];

    CATEGORY_ORDER.concat(fixedCatNames.filter((c) => !CATEGORY_ORDER.includes(c))).forEach((catName) => {
      const itemsMap = annualData.fixedExpenses[catName];
      if (!itemsMap) return;

      let catCurrent = 0;
      let catAnnual = 0;
      Object.values(itemsMap).forEach((arr) => {
        catCurrent += arr[monthIdx] || 0;
        catAnnual += sumArr(arr);
      });

      sharedCurrentTotal += catCurrent;
      sharedAnnualTotal += catAnnual;

      if (catAnnual > 0) {
        catRows.push(`
          <tr>
            <td style="padding-left:32px;">${escapeHtml(catName)}</td>
            <td class="num">${catCurrent ? formatNumber(catCurrent) : '—'}</td>
            <td class="num">${catAnnual ? formatNumber(catAnnual) : '—'}</td>
          </tr>
        `);
      }
    });

    if (catRows.length > 0) {
      rows.push(`<tr class="group-header"><td>【家庭共用支出】</td><td class="num"></td><td class="num"></td></tr>`);
      rows.push(...catRows);
      rows.push(`
        <tr class="subtotal-row">
          <td>共用支出小計</td>
          <td class="num">${formatNumber(sharedCurrentTotal)}</td>
          <td class="num">${formatNumber(sharedAnnualTotal)}</td>
        </tr>
      `);
    }
  }

  /* 月度總計 */
  const expenseCurrent = annualData.monthly.expense[monthIdx] || 0;
  const expenseAnnual = sumArr(annualData.monthly.expense);
  const incomeCurrent = annualData.monthly.income[monthIdx] || 0;
  const incomeAnnual = sumArr(annualData.monthly.income);
  const netCurrent = incomeCurrent - expenseCurrent;
  const netAnnual = incomeAnnual - expenseAnnual;

  rows.push(`<tr class="group-header"><td>【月度總計】</td><td class="num"></td><td class="num"></td></tr>`);
  rows.push(`
    <tr class="total-row">
      <td>當月總支出</td>
      <td class="num">${formatNumber(expenseCurrent)}</td>
      <td class="num">${formatNumber(expenseAnnual)}</td>
    </tr>
  `);
  rows.push(`
    <tr class="net-row">
      <td>當月淨結餘</td>
      <td class="num" style="color:${netCurrent >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatNumber(netCurrent)}</td>
      <td class="num" style="color:${netAnnual >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatNumber(netAnnual)}</td>
    </tr>
  `);

  tbody.innerHTML = rows.join('');
  if (window.lucide) window.lucide.createIcons();
}

/* ============================================
   Excel 匯出（保持 12 欄格式）
   ============================================ */
function exportToExcel() {
  if (!annualData) return alert('資料尚未載入完成');
  const data = annualData;
  const rows = [];
  rows.push(['項目', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '年度小計']);

  const totalIncome = Math.round(data.monthly.income.reduce((s, x) => s + x, 0));
  const totalExpense = Math.round(data.monthly.expense.reduce((s, x) => s + x, 0));
  const balance = totalIncome - totalExpense;

  rows.push(['【收入】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  data.members.filter((m) => m.income.some((v) => v > 0)).forEach((m) => {
    const subtotal = Math.round(m.income.reduce((s, x) => s + x, 0));
    rows.push([`  ${m.name}`, ...m.income.map((v) => Math.round(v)), subtotal]);
  });
  rows.push(['收入小計', ...data.monthly.income.map((v) => Math.round(v)), totalIncome]);

  data.members.forEach((m) => {
    const itemNames = Object.keys(m.expenses);
    if (itemNames.length === 0) return;
    rows.push([`【${m.name}】`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const monthlyMemberTotal = Array(12).fill(0);
    itemNames.forEach((itemName) => {
      const amounts = m.expenses[itemName];
      amounts.forEach((v, i) => { monthlyMemberTotal[i] += v; });
      const subtotal = Math.round(amounts.reduce((s, x) => s + x, 0));
      rows.push([`  ${itemName}`, ...amounts.map((v) => Math.round(v)), subtotal]);
    });
    const memberSubtotal = Math.round(monthlyMemberTotal.reduce((s, x) => s + x, 0));
    rows.push([`${m.name}小計`, ...monthlyMemberTotal.map((v) => Math.round(v)), memberSubtotal]);
  });

  /* 家庭共用支出（按類別） */
  const fixedCatNames = Object.keys(data.fixedExpenses);
  if (fixedCatNames.length > 0) {
    const monthlyFixedTotal = Array(12).fill(0);
    CATEGORY_ORDER.concat(fixedCatNames.filter((c) => !CATEGORY_ORDER.includes(c))).forEach((catName) => {
      const itemsMap = data.fixedExpenses[catName];
      if (!itemsMap) return;
      rows.push([`【家庭共用支出 - ${catName}】`, '', '', '', '', '', '', '', '', '', '', '', '', '']);
      Object.entries(itemsMap).forEach(([name, amounts]) => {
        amounts.forEach((v, i) => { monthlyFixedTotal[i] += v; });
        const subtotal = Math.round(amounts.reduce((s, x) => s + x, 0));
        rows.push([`  ${name}`, ...amounts.map((v) => Math.round(v)), subtotal]);
      });
    });
    const fixedSubtotal = Math.round(monthlyFixedTotal.reduce((s, x) => s + x, 0));
    rows.push(['固定支出小計', ...monthlyFixedTotal.map((v) => Math.round(v)), fixedSubtotal]);
  }

  rows.push(['【月度總計】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['當月總支出', ...data.monthly.expense.map((v) => Math.round(v)), totalExpense]);
  const netMonthly = data.monthly.income.map((v, i) => v - data.monthly.expense[i]);
  rows.push(['當月淨結餘', ...netMonthly.map((v) => Math.round(v)), balance]);

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
