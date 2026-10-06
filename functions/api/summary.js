// ============================================
// summary.js — GET /api/summary?familyId=...&year=YYYY&month=MM
// ============================================

import { dbGet, jsonResponse } from './_config.js';

export async function onRequestGet({ request }) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const url = new URL(request.url);
    const familyId = url.searchParams.get('familyId');
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    if (!familyId) return jsonResponse({ ok: false, error: '缺少 familyId' }, 400);

    const basePath = `families/${familyId}`;

    let prevY = Number(year);
    let prevM = Number(month) - 1;
    if (prevM < 1) { prevY -= 1; prevM = 12; }
    const prevMonthStr = String(prevM).padStart(2, '0');

    const [members, policies, expenses, income, funds, fixed, categories, items, bankBalances, prevBankBalances, banks] = await Promise.all([
      dbGet(`${basePath}/members`, token),
      dbGet(`${basePath}/insurance_policies`, token),
      year && month ? dbGet(`${basePath}/expenses/${year}/${month}/member_expenses`, token) : null,
      year && month ? dbGet(`${basePath}/income/${year}/${month}`, token) : null,
      dbGet(`${basePath}/funds`, token),
      year && month ? dbGet(`${basePath}/fixed_expenses/${year}/${month}`, token) : null,
      dbGet(`${basePath}/expense_categories`, token),
      dbGet(`${basePath}/expense_items`, token),
      year && month ? dbGet(`${basePath}/bank_balances/${year}/${month}`, token) : null,
      dbGet(`${basePath}/bank_balances/${prevY}/${prevMonthStr}`, token),
      dbGet(`${basePath}/banks`, token),
    ]);

    const membersObj = members || {};
    const policiesObj = policies || {};
    const expensesObj = expenses || {};
    const incomeObj = income || {};
    const fundsObj = funds || {};
    const fixedObj = fixed || {};
    const categoriesObj = categories || {};
    const itemsObj = items || {};
    const bankBalancesObj = bankBalances || {};
    const prevBankBalancesObj = prevBankBalances || {};
    const banksObj = banks || {};

    /* ---------- 支出匯總 ---------- */
    const perMember = {};
    let totalExpense = 0;

    Object.entries(expensesObj).forEach(([memberId, list]) => {
      const itemsArr = Object.entries(list || {}).map(([id, e]) => {
        const catId = e.categoryId || '';
        const itemId = e.itemId || '';
        return {
          id, name: e.name || '', amount: Math.round(Number(e.amount) || 0),
          status: e.status || '未處理', date: e.date || '',
          categoryId: catId, categoryName: categoriesObj[catId]?.name || '',
          itemId, itemName: itemsObj[itemId]?.name || '',
          isAutoLinked: e.isAutoLinked || false,
        };
      });
      itemsArr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const sum = itemsArr.reduce((s, e) => s + e.amount, 0);
      perMember[memberId] = {
        memberName: membersObj[memberId]?.name || '（未知成員）',
        itemCount: itemsArr.length, sum: Math.round(sum), items: itemsArr,
      };
      totalExpense += sum;
    });

    /* ---------- 固定支出匯總（🆕 加上 categoryId / categoryName） ---------- */
    const fixedList = Object.entries(fixedObj)
      .map(([id, x]) => {
        const catId = x.categoryId || '';
        return {
          id, name: x.name || '', amount: Math.round(Number(x.amount) || 0),
          cycle: x.cycle || '每月', note: x.note || '',
          status: x.status || '未付款', paidDate: x.paidDate || '',
          isSkipped: !!x.isSkipped,
          categoryId: catId,
          categoryName: categoriesObj[catId]?.name || '其他',
        };
      })
      .filter((x) => !x.isSkipped);

    const fixedTotal = fixedList.reduce((s, x) => s + x.amount, 0);
    const fixedPendingCount = fixedList.filter((x) => x.status !== '已付款').length;
    totalExpense += fixedTotal;

    /* ---------- 收入匯總 ---------- */
    const incomeBreakdown = {};
    let totalIncome = 0;
    Object.entries(incomeObj).forEach(([key, val]) => {
      const num = Math.round(Number(val) || 0);
      if (key === 'extra' || membersObj[key]) {
        incomeBreakdown[key] = num;
        totalIncome += num;
      }
    });

    /* ---------- 保險匯總 ---------- */
    const policyList = Object.values(policiesObj);
    let yearlyInsuranceTotal = 0;
    let monthlyInsuranceAverage = 0;
    const curY = Number(year);
    const curM = Number(month);

    policyList.forEach((p) => {
      if (p.type === 'fund_insurance') {
        const mp = Math.round(Number(p.monthlyPremium) || 0);
        monthlyInsuranceAverage += mp;
        yearlyInsuranceTotal += mp * 12;
        return;
      }

      const firstY = Number(p.firstStartYear) || 0;
      const firstM = Number(p.firstStartMonth) || 1;
      const totalMonths = (curY - firstY) * 12 + (curM - firstM);

      if (totalMonths < 0) return;
      const periodIndex = Math.floor(totalMonths / 12) + 1;
      if (p.totalPolicyYears && periodIndex > p.totalPolicyYears) return;

      const periodData = (p.periods || {})[String(periodIndex)];
      if (periodData) {
        monthlyInsuranceAverage += Math.round(Number(periodData.monthlyAverage) || 0);
        yearlyInsuranceTotal += Math.round(Number(periodData.annualPremium) || 0);
      }
    });

    /* ---------- 資產匯總 ---------- */
    const bankBalanceTotal = Object.values(bankBalancesObj).reduce((s, b) => s + Math.round(Number(b.amount) || 0), 0);
    const fundList = Object.values(fundsObj);
    const fundValue = fundList.reduce((s, f) => s + Math.round(Number(f.currentValue) || 0), 0);
    const totalAssets = bankBalanceTotal + fundValue;

    /* ---------- 當月可用金額 ---------- */
    const prevBankTotal = Object.values(prevBankBalancesObj).reduce((s, b) => s + Math.round(Number(b.amount) || 0), 0);
    const availableFunds = prevBankTotal + totalIncome;

    const netBalance = totalIncome - totalExpense;

    return jsonResponse({
      ok: true, year, month,
      totalIncome: Math.round(totalIncome),
      totalExpense: Math.round(totalExpense),
      netBalance: Math.round(netBalance),
      yearlyInsuranceTotal: Math.round(yearlyInsuranceTotal),
      monthlyInsuranceAverage: Math.round(monthlyInsuranceAverage),
      totalAssets: Math.round(totalAssets),
      bankBalance: Math.round(bankBalanceTotal),
      fundValue: Math.round(fundValue),
      prevBankTotal: Math.round(prevBankTotal),
      availableFunds: Math.round(availableFunds),
      fixedTotal: Math.round(fixedTotal),
      fixedPendingCount,
      fixedList,
      incomeBreakdown,
      memberCount: Object.keys(membersObj).length,
      policyCount: policyList.length,
      fundCount: fundList.length,
      bankCount: Object.keys(banksObj).length,
      perMember,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
