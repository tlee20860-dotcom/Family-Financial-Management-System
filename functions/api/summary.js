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
      year && month
        ? dbGet(`family_expenses/${year}/${month}/member_expenses`)
        : Promise.resolve(null),
      year && month
        ? dbGet(`family_income/${year}/${month}`)
        : Promise.resolve(null),
      dbGet('family_assets'),
      dbGet('investment_funds'),
      year && month
        ? dbGet(`fixed_expenses/${year}/${month}`)
        : Promise.resolve(null),
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

    /* ---------- 🆕 固定支出匯總 ---------- */
    const fixedList = Object.entries(fixedObj).map(([id, x]) => ({ id, ...x }));
    const fixedTotal = fixedList.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const fixedPendingCount = fixedList.filter((x) => x.status !== '已付款').length;
    totalExpense += fixedTotal; // 固定支出計入家庭總支出

    /* ---------- 收入匯總 ---------- */
    const husbandContribution = Number(incomeObj.husbandContribution) || 0;
    const wifeContribution    = Number(incomeObj.wifeContribution)    || 0;
    const extraIncome         = Number(incomeObj.extraIncome)         || 0;
    const totalIncome = husbandContribution + wifeContribution + extraIncome;

    /* ---------- 保險匯總 ---------- */
    const policyList = Object.values(policiesObj);
    const yearlyInsuranceTotal = policyList.reduce(
      (s, p) => s + (Number(p.annualPremium) || 0), 0
    );
    const monthlyInsuranceAverage = policyList.reduce(
      (s, p) => s + (Number(p.monthlyAverage) || 0), 0
    );

    /* ---------- 資產匯總 ---------- */
    const bankBalance = Number(assetsObj.bankBalance) || 0;
    const fundList = Object.values(fundsObj);
    const fundValue = fundList.reduce(
      (s, f) => s + (Number(f.currentValue) || 0), 0
    );
    const totalAssets = bankBalance + fundValue;

    /* ---------- 淨結餘 ---------- */
    const netBalance = totalIncome - totalExpense;

    return jsonResponse({
      ok: true,
      year,
      month,
      totalIncome,
      totalExpense,
      netBalance,
      yearlyInsuranceTotal,
      monthlyInsuranceAverage,
      totalAssets,
      bankBalance,
      fundValue,
      fixedTotal,           // 🆕
      fixedPendingCount,    // 🆕
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
