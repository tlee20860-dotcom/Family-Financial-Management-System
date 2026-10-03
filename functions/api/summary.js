// ============================================
// summary.js — GET /api/summary?year=YYYY&month=MM
// 用途：回傳家庭當月匯總（總支出、淨結餘、保費負擔…）
// ============================================

import { dbGet, jsonResponse } from './_config.js';

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    const [members, policies, expenses] = await Promise.all([
      dbGet('family_members'),
      dbGet('insurance_policies'),
      year && month
        ? dbGet(`family_expenses/${year}/${month}/member_expenses`)
        : Promise.resolve(null),
    ]);

    const membersObj = members || {};
    const policiesObj = policies || {};
    const expensesObj = expenses || {};

    // 逐成員統計
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

    // 保費統計
    const policyList = Object.values(policiesObj);
    const yearlyInsuranceTotal = policyList.reduce(
      (s, p) => s + (Number(p.annualPremium) || 0), 0
    );
    const monthlyInsuranceAverage = policyList.reduce(
      (s, p) => s + (Number(p.monthlyAverage) || 0), 0
    );

    // 淨結餘（收入模組待 P6/P7 實作，先以 0 計）
    const totalIncome = 0;
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
      memberCount: Object.keys(membersObj).length,
      policyCount: policyList.length,
      perMember,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
