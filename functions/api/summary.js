// ============================================
// summary.js — GET /api/summary?year=YYYY&month=MM
// ============================================

import { dbGet, jsonResponse } from './_config.js';

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    const [members, policies, expenses, income, assets, funds, fixed] = await Promise.all([
      dbGet('family_members'),
      dbGet('insurance_policies'),
      year && month ? dbGet(`family_expenses/${year}/${month}/member_expenses`) : null,
      year && month ? dbGet(`family_income/${year}/${month}`) : null,
      dbGet('family_assets'),
      dbGet('investment_funds'),
      year && month ? dbGet(`fixed_expenses/${year}/${month}`) : null,
    ]);

    const membersObj = members || {};
    const policiesObj = policies || {};
    const expensesObj = expenses || {};
    const incomeObj = income || {};
    const assetsObj = assets || {};
    const fundsObj = funds || {};
    const fixedObj = fixed || {};

    /* ---------- 支出匯總（成員代墊） ---------- */
    const perMember = {};
    let totalExpense = 0;

    Object.entries(expensesObj).forEach(([memberId, list]) => {
      const items = Object.entries(list || {}).map(([id, e]) => ({ id, ...e }));
      const sum = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      perMember[memberId] = {
        memberName: membersObj[memberId]?.name || '（未知成員）',
        itemCount: items.length,
        sum,
      };
      totalExpense += sum;
    });

    /* ---------- 固定支出匯總 ---------- */
    const fixedList = Object.entries(fixedObj).map(([id, x]) => ({ id, ...x }));
    const fixedTotal = fixedList.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const fixedPendingCount = fixedList.filter((x) => x.status !== '已付款').length;
    totalExpense += fixedTotal;

    /* ---------- 收入匯總 ---------- */
    const husbandContribution = Number(incomeObj.husbandContribution) || 0;
    const wifeContribution    = Number(incomeObj.wifeContribution)    || 0;
    const extraIncome         = Number(incomeObj.extraIncome)         || 0;
    const totalIncome = husbandContribution + wifeContribution + extraIncome;

    /* ---------- 保險匯總（兼容新舊結構） ---------- */
    const policyList = Object.values(policiesObj);
    let yearlyInsuranceTotal = 0;
    let monthlyInsuranceAverage = 0;

    policyList.forEach((p) => {
      // 月攤金額
      if (p.monthlyAverage != null) {
        monthlyInsuranceAverage += Number(p.monthlyAverage) || 0;
      } else if (p.monthlyPremium != null) {
        monthlyInsuranceAverage += Number(p.monthlyPremium) || 0;
      } else if (p.annualPremium != null) {
        monthlyInsuranceAverage += (Number(p.annualPremium) || 0) / 12;
      }

      // 年繳總額
      if (p.annualPremium != null) {
        yearlyInsuranceTotal += Number(p.annualPremium) || 0;
      } else if (p.monthlyPremium != null) {
        yearlyInsuranceTotal += (Number(p.monthlyPremium) || 0) * 12;
      } else if (p.totalPremium != null && p.totalPeriods) {
        yearlyInsuranceTotal += (Number(p.totalPremium) || 0) / p.totalPeriods;
      }
    });

    /* ---------- 資產匯總 ---------- */
    const bankBalance = Number(assetsObj.bankBalance) || 0;
    const fundList = Object.values(fundsObj);
    const fundValue = fundList.reduce((s, f) => s + (Number(f.currentValue) || 0), 0);
    const totalAssets = bankBalance + fundValue;

    /* ---------- 淨結餘 ---------- */
    const netBalance = totalIncome - totalExpense;

    return jsonResponse({
      ok: true,
      year, month,
      totalIncome, totalExpense, netBalance,
      yearlyInsuranceTotal,
      monthlyInsuranceAverage,
      totalAssets, bankBalance, fundValue,
      fixedTotal, fixedPendingCount,
      incomeBreakdown: { husbandContribution, wifeContribution, extraIncome },
      memberCount: Object.keys(membersObj).length,
      policyCount: policyList.length,
      fundCount: fundList.length,
      perMember,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
