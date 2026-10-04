// ============================================
// annual-report.js — 年度報表邏輯
// ============================================

import { api } from './api.js';
import { formatHKD, formatNumber, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let currentYear = '';
let annualData = null;

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

  loadAnnual();
}

async function loadAnnual() {
  document.getElementById('annual-year').textContent = `${currentYear} 年`;
  document.getElementById('annual-tbody').innerHTML =
    '<tr><td colspan="14" class="empty-state">載入中…</td></tr>';

  try {
    // 並行載入 12 個月
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      promises.push(api.summary(currentYear, mm));
    }
    const results = await Promise.all(promises);

    annualData = buildAnnualData(currentYear, results);
    renderAnnual();
  } catch (err) {
    console.error('年度報表載入失敗：', err);
    document.getElementById('annual-tbody').innerHTML =
      '<tr><td colspan="14" class="empty-state text-red">載入失敗，請稍後再試。</td></tr>';
  }
}

function buildAnnualData(year, monthlyResults) {
  const memberMap = {};
  const fixedMap = {};
  const monthlyTotals = {
    income: Array(12).fill(0),
    expense: Array(12).fill(0),
  };

  monthlyResults.forEach((monthData, idx) => {
    // ---- 收入 ----
    const incomeBreakdown = monthData.incomeBreakdown || {};
    Object.entries(incomeBreakdown).forEach(([memberId, amount]) => {
      const num = Number(amount) || 0;
      if (num === 0) return;

      const displayName = memberId === 'extra'
        ? '額外收入'
        : (monthData.perMember?.[memberId]?.memberName
           || incomeBreakdown[`${memberId}_name`]
           || memberId);

      if (!memberMap[memberId]) {
        memberMap[memberId] = {
          id: memberId,
          name: displayName,
          order: memberId === 'extra' ? Number.MAX_SAFE_INTEGER : 0,
          income: Array(12).fill(0),
          expenses: {},
        };
      }
      memberMap[memberId].income[idx] = num;
    });

    // ---- 成員支出明細 ----
    const perMember = monthData.perMember || {};
    Object.entries(perMember).forEach(([memberId, mData]) => {
      if (!memberMap[memberId]) {
        memberMap[memberId] = {
          id: memberId,
          name: mData.memberName || memberId,
          order: mData.order != null ? mData.order : Number.MAX_SAFE_INTEGER,
          income: Array(12).fill(0),
          expenses: {},
        };
      }
      memberMap[memberId].order = mData.order != null
        ? mData.order
        : memberMap[memberId].order;

      (mData.items || []).forEach((item) => {
        const key = item.name || '（未命名）';
        if (!memberMap[memberId].expenses[key]) {
          memberMap[memberId].expenses[key] = Array(12).fill(0);
        }
        memberMap[memberId].expenses[key][idx] += Number(item.amount) || 0;
      });
    });

    // ---- 固定支出 ----
    (monthData.fixedList || []).forEach((f) => {
      const key = f.name || '（未命名）';
      if (!fixedMap[key]) fixedMap[key] = Array(12).fill(0);
      fixedMap[key][idx] += Number(f.amount) || 0;
    });

    // ---- 月度總計 ----
    monthlyTotals.income[idx] = monthData.totalIncome || 0;
    monthlyTotals.expense[idx] = monthData.totalExpense || 0;
  });

  // 從 membersObj 補齊名稱（若某成員只有收入沒有支出）
  // 這裡無法直接取得 members，所以依賴 summary 的 perMember 或收入細項
  // 若名稱顯示為 ID，屬於邊界情況

  const membersArr = Object.values(memberMap).sort((a, b) => {
    if (a.id === 'extra') return 1;
    if (b.id === 'extra') return -1;
    const oa = a.order != null ? a.order : Number.MAX_SAFE_INTEGER;
    const ob = b.order != null ? b.order : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return 0;
  });

  return {
    year,
    members: membersArr,
    fixedExpenses: fixedMap,
    monthly: monthlyTotals,
  };
}

function renderAnnual() {
  const data = annualData;
  if (!data) return;

  const totalIncome = data.monthly.income.reduce((s, x) => s + x, 0);
  const totalExpense = data.monthly.expense.reduce((s, x) => s + x, 0);
  const balance = totalIncome - totalExpense;

  document.getElementById('annual-income').textContent = formatHKD(totalIncome);
  document.getElementById('annual-expense').textContent = formatHKD(totalExpense);
  const balanceEl = document.getElementById('annual-balance');
  balanceEl.textContent = formatHKD(balance);
  balanceEl.classList.remove('emerald', 'red');
  balanceEl.classList.add(balance >= 0 ? 'emerald' : 'red');

  const tbody = document.getElementById('annual-tbody');
  const rows = [];

  // ========== 收入區塊 ==========
  rows.push(`<tr class="group-header"><td class="col-item">【收入】</td>${'<td></td>'.repeat(13)}</tr>`);
  data.members.filter((m) => m.income.some((v) => v > 0)).forEach((m) => {
    const subtotal = m.income.reduce((s, x) => s + x, 0);
    rows.push(`
      <tr>
        <td class="col-item item-sub">${escapeHtml(m.name)}</td>
        ${m.income.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
        <td class="num">${formatNumber(subtotal)}</td>
      </tr>
    `);
  });
  rows.push(`
    <tr class="subtotal-row">
      <td class="col-item">收入小計</td>
      ${data.monthly.income.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
      <td class="num">${formatNumber(totalIncome)}</td>
    </tr>
  `);

  // ========== 每位成員支出區塊 ==========
  data.members.forEach((m) => {
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

  // ========== 固定支出區塊 ==========
  const fixedNames = Object.keys(data.fixedExpenses);
  if (fixedNames.length > 0) {
    rows.push(`<tr class="group-header"><td class="col-item">【家庭固定支出】</td>${'<td></td>'.repeat(13)}</tr>`);
    const monthlyFixedTotal = Array(12).fill(0);
    fixedNames.forEach((name) => {
      const amounts = data.fixedExpenses[name];
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

  // ========== 月度總計 ==========
  rows.push(`<tr class="group-header"><td class="col-item">【月度總計】</td>${'<td></td>'.repeat(13)}</tr>`);
  rows.push(`
    <tr class="total-row">
      <td class="col-item">當月總支出</td>
      ${data.monthly.expense.map((v) => `<td class="num">${v ? formatNumber(v) : '—'}</td>`).join('')}
      <td class="num">${formatNumber(totalExpense)}</td>
    </tr>
  `);
  rows.push(`
    <tr class="net-row">
      <td class="col-item">當月淨結餘</td>
      ${data.monthly.income.map((v, i) => {
        const net = v - data.monthly.expense[i];
        const color = net >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)';
        return `<td class="num" style="color:${color};">${net !== 0 ? formatNumber(net) : '—'}</td>`;
      }).join('')}
      <td class="num" style="color:${balance >= 0 ? 'var(--neon-emerald)' : 'var(--neon-red)'};">${formatNumber(balance)}</td>
    </tr>
  `);

  tbody.innerHTML = rows.join('');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/* ============================================
   Excel 匯出（使用 SheetJS）
   ============================================ */
function exportToExcel() {
  if (!annualData) {
    alert('資料尚未載入完成');
    return;
  }

  const data = annualData;
  const rows = [];

  // 標題列
  rows.push(['項目', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '年度小計']);

  const totalIncome = data.monthly.income.reduce((s, x) => s + x, 0);
  const totalExpense = data.monthly.expense.reduce((s, x) => s + x, 0);
  const balance = totalIncome - totalExpense;

  // ---- 收入 ----
  rows.push(['【收入】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  data.members.filter((m) => m.income.some((v) => v > 0)).forEach((m) => {
    const subtotal = m.income.reduce((s, x) => s + x, 0);
    rows.push([`  ${m.name}`, ...m.income, subtotal]);
  });
  rows.push(['收入小計', ...data.monthly.income, totalIncome]);

  // ---- 每位成員支出 ----
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

  // ---- 固定支出 ----
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

  // ---- 月度總計 ----
  rows.push(['【月度總計】', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['當月總支出', ...data.monthly.expense, totalExpense]);

  const netMonthly = data.monthly.income.map((v, i) => v - data.monthly.expense[i]);
  rows.push(['當月淨結餘', ...netMonthly, balance]);

  // 建立工作表
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 設定欄寬
  ws['!cols'] = [
    { wch: 32 },  // 項目欄
    ...Array(12).fill({ wch: 12 }),  // 12 個月
    { wch: 14 },  // 小計
  ];

  // 建立工作簿
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${data.year}年度報表`);

  // 檔名：家庭報表(該年)-mmddhhss.xlsx
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const filename = `家庭報表(${data.year})-${mm}${dd}${hh}${ss}.xlsx`;

  XLSX.writeFile(wb, filename);
}
