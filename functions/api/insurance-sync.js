// ============================================
// insurance-sync.js — POST /api/insurance-sync
// 處理保險扣款 / 取消扣款，並自動重算期數
// ============================================

import { dbGet, dbPut, dbDelete, jsonResponse } from './_config.js';

export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const {
      action,        // 'upsert' | 'delete'
      policyId,
      memberId,
      policyName,
      monthlyAverage,
      year,
      month,
    } = body || {};

    if (!policyId || !memberId || !year || !month) {
      return jsonResponse({ ok: false, error: '缺少必要欄位' }, 400);
    }

    const linkedKey = `linked_${policyId}`;
    const expensePath = `family_expenses/${year}/${month}/member_expenses/${memberId}/${linkedKey}`;
    const paymentPath = `insurance_payments/${policyId}/${year}/${month}`;

    if (action === 'delete') {
      // 刪除連動支出
      await dbDelete(expensePath);
      // 刪除扣款紀錄
      await dbDelete(paymentPath);
      // 重算保單期數
      await recalcPolicy(policyId);
      return jsonResponse({ ok: true, deleted: true });
    }

    // upsert：新增或更新
    const expense = {
      name: `${policyName} (平攤)`,
      amount: Number(monthlyAverage) || 0,
      status: '已還款', // 扣款即視為已還款
      date: '',
      isAutoLinked: true,
      policyId,
      createdAt: Date.now(),
    };
    await dbPut(expensePath, expense);
    await dbPut(paymentPath, {
      status: '已扣款',
      amount: Number(monthlyAverage) || 0,
      date: new Date().toISOString().slice(0, 10),
    });

    await recalcPolicy(policyId);
    return jsonResponse({ ok: true, path: expensePath, expense });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

/**
 * 重算保單的期數、已供保費、剩餘期數與完成狀態
 */
async function recalcPolicy(policyId) {
  const policySnap = await dbGet(`insurance_policies/${policyId}`);
  if (!policySnap) return;

  const paymentsSnap = await dbGet(`insurance_payments/${policyId}`);
  const payments = paymentsSnap || {};

  let completedCount = 0;
  let totalPaid = 0;

  Object.values(payments).forEach((yearData) => {
    Object.values(yearData || {}).forEach((mData) => {
      if (mData.status === '已扣款') {
        completedCount++;
        totalPaid += Number(mData.amount) || 0;
      }
    });
  });

  const totalPeriods = Number(policySnap.totalPeriods) || 0;
  const remainingPeriods = Math.max(0, totalPeriods - completedCount);
  const isCompleted = remainingPeriods === 0 && totalPeriods > 0;

  const monthlyAvg = Number(policySnap.monthlyAverage) || 0;
  const paidPremium = completedCount * monthlyAvg;

  const updates = {
    completedPeriods: completedCount,
    remainingPeriods,
    paidPremium,
    isCompleted,
  };

  await dbPut(`insurance_policies/${policyId}`, { ...policySnap, ...updates });
}
