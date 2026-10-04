// ============================================
// summary.js — GET /api/summary?year=YYYY&month=MM
// ============================================

import { dbGet, jsonResponse } from './_config.js';

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    let prevY = Number(year);
    let prevM = Number(month) - 1;
    if (prevM < 1) { prevY -= 1; prevM = 12; }
    const prevMonthStr = String(prevM).padStart(2, '0');

    const [members, policies, expenses, income, funds, fixed, categories, items, bankBalances, prevBankBalances, banks] = await Promise.all([
      dbGet('family_members'),
      dbGet('insurance_policies'),
      year && month ? dbGet(`family_expenses/${year}/${month}/member_expenses`) : null,
      year && month ? dbGet(`family_income/${year}/${month}`) : null,
      dbGet('investment_funds'),
      year && month ? dbGet(`fixed_expenses/${year}/${month}`) : null,
      dbGet('expense_categories'),
      dbGet('expense_items'),
      year && month ? dbGet(`bank_balances/${year}/${month}`) : null,
      dbGet(`bank_balances/${prevY}/${prevMonthStr}`),
      dbGet('family_banks'),
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
          id, name: e.name || '', amount: Number(e.amount) || 0,
          status: e.status || '未處理', date: e.date || '',
          categoryId: catId, categoryName: categoriesObj[catId]?.name || '',
          itemId, itemName: itemsObj[itemId]?.name || '',
          isAutoLinked: e.isAutoLinked || false,
        };
      });
      itemsArr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const sum = itemsArr.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      perMember[memberId] = {
        memberName: membersObj[memberId]?.name || '（未知成員）',
        itemCount: itemsArr.length, sum, items: itemsArr,
      };
      totalExpense += sum;
    });

    /* ---------- 固定支出匯總（過濾不適用） ---------- */
    const fixedList = Object.entries(fixedObj)
      .map(([id, x]) => ({
        id, name: x.name || '', amount: Number(x.amount) || 0,
        cycle: x.cycle || '每月',
        note: x.note || '',
        status: x.status || '未付款',
        paidDate: x.paidDate || '',
        isSkipped: !!x.isSkipped,
      }))
      .filter((x) => !x.isSkipped);

    const fixedTotal = fixedList.reduce((s, x) => s + x.amount, 0);
    const fixedPendingCount = fixedList.filter((x) => x.status !== '已付款').length;
    totalExpense += fixedTotal;

    /* ---------- 🆕 收入匯總（支援自訂成員 ID） ---------- */
    const incomeBreakdown = {};
    let totalIncome = 0;
    Object.entries(incomeObj).forEach(([key, val]) => {
      const num = Number(val) || 0;
      // 只要是成員清單中的 ID，或者是額外收入，就計入
      if (key === 'extra' || membersObj[key]) {
        incomeBreakdown[key] = num;
        totalIncome += num;
      }
    });

    /* ---------- 保險匯總 ---------- */
    const policyList = Object.values(policiesObj);
    let yearlyInsuranceTotal = 0;
    let monthlyInsuranceAverage = 0;
    policyList.forEach((p) => {
      if (p.monthlyAverage != null) monthlyInsuranceAverage += Number(p.monthlyAverage) || 0;
      else if (p.monthlyPremium != null) monthlyInsuranceAverage += Number(p.monthlyPremium) || 0;
      else if (p.annualPremium != null) monthlyInsuranceAverage += (Number(p.annualPremium) || 0) / 12;

      if (p.annualPremium != null) yearlyInsuranceTotal += Number(p.annualPremium) || 0;
      else if (p.monthlyPremium != null) yearlyInsuranceTotal += (Number(p.monthlyPremium) || 0) * 12;
      else if (p.totalPremium != null && p.totalPeriods) yearlyInsuranceTotal += (Number(p.totalPremium) || 0) / p.totalPeriods;
    });

    /* ---------- 資產匯總 ---------- */
    const bankBalanceTotal = Object.values(bankBalancesObj).reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const fundList = Object.values(fundsObj);
    const fundValue = fundList.reduce((s, f) => s + (Number(f.currentValue) || 0), 0);
    const totalAssets = bankBalanceTotal + fundValue;

    /* ---------- 當月可用金額 ---------- */
    const prevBankTotal = Object.values(prevBankBalancesObj).reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const availableFunds = prevBankTotal + totalIncome;

    const netBalance = totalIncome - totalExpense;

    return jsonResponse({
      ok: true, year, month,
      totalIncome, totalExpense, netBalance,
      yearlyInsuranceTotal, monthlyInsuranceAverage,
      totalAssets, bankBalance: bankBalanceTotal, fundValue,
      prevBankTotal, availableFunds,
      fixedTotal, fixedPendingCount, fixedList,
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
