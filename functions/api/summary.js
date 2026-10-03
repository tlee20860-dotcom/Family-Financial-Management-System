// ============================================
// summary.js — GET /api/summary?year=YYYY&month=MM
// ============================================

import { dbGet, jsonResponse } from './_config.js';

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    const [members, policies, expenses, income, assets, funds, fixed, categories, items] = await Promise.all([
      dbGet('family_members'),
      dbGet('insurance_policies'),
      year && month ? dbGet(`family_expenses/${year}/${month}/member_expenses`) : null,
      year && month ? dbGet(`family_income/${year}/${month}`) : null,
      dbGet('family_assets'),
      dbGet('investment_funds'),
      year && month ? dbGet(`fixed_expenses/${year}/${month}`) : null,
      dbGet('expense_categories'),
      dbGet('expense_items'),
    ]);

    const membersObj = members || {};
    const policiesObj = policies || {};
    const expensesObj = expenses || {};
    const incomeObj = income || {};
    const assetsObj = assets || {};
    const fundsObj = funds || {};
    const fixedObj = fixed || {};
    const categoriesObj = categories || {};
    const itemsObj = items || {};

    /* ---------- 支出匯總（含明細） ---------- */
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

    /* ---------- 固定支出匯總 ---------- */
    const fixedList = Object.entries(fixedObj).map(([id, x]) => ({
      id, name: x.name || '', amount: Number(x.amount) || 0,
      status: x.status || '未付款', dueDate: x.dueDate || '', cycle: x.cycle || '每月',
    }));
    const fixedTotal = fixedList.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const fixedPendingCount = fixedList.filter((x) => x.status !== '已付款').length;
    totalExpense += fixedTotal;

    /* ---------- 🆕 收入匯總（新結構） ---------- */
    const incomeBreakdown = {};
    let totalIncome = 0;

    Object.entries(incomeObj).forEach(([key, val]) => {
      const num = Number(val) || 0;
      incomeBreakdown[key] = num;
      totalIncome += num;
    });

    // 兼容舊結構（若還在）
    if (incomeObj.husbandContribution) {
      incomeBreakdown.mem_husband = (incomeBreakdown.mem_husband || 0) + Number(incomeObj.husbandContribution);
      totalIncome += Number(incomeObj.husbandContribution);
    }
    if (incomeObj.wifeContribution) {
      incomeBreakdown.mem_wife = (incomeBreakdown.mem_wife || 0) + Number(incomeObj.wifeContribution);
      totalIncome += Number(incomeObj.wifeContribution);
    }
    if (incomeObj.extraIncome) {
      incomeBreakdown.extra = (incomeBreakdown.extra || 0) + Number(incomeObj.extraIncome);
      totalIncome += Number(incomeObj.extraIncome);
    }

    /* ---------- 保險匯總 ---------- */
    const policyList = Object.values(policiesObj);
    let yearlyInsuranceTotal = 0;
    let monthlyInsuranceAverage = 0;

    policyList.forEach((p) => {
      if (p.monthlyAverage != null) {
        monthlyInsuranceAverage += Number(p.monthlyAverage) || 0;
      } else if (p.monthlyPremium != null) {
        monthlyInsuranceAverage += Number(p.monthlyPremium) || 0;
      } else if (p.annualPremium != null) {
        monthlyInsuranceAverage += (Number(p.annualPremium) || 0) / 12;
      }

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

    const netBalance = totalIncome - totalExpense;

    return jsonResponse({
      ok: true, year, month,
      totalIncome, totalExpense, netBalance,
      yearlyInsuranceTotal, monthlyInsuranceAverage,
      totalAssets, bankBalance, fundValue,
      fixedTotal, fixedPendingCount, fixedList,
      incomeBreakdown,
      memberCount: Object.keys(membersObj).length,
      policyCount: policyList.length,
      fundCount: fundList.length,
      perMember,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
