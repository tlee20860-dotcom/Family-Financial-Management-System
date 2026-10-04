// ============================================
// insurance-sync.js — POST /api/insurance-sync
// 處理保險扣款 / 取消扣款
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
      await dbDelete(expensePath);
      await dbDelete(paymentPath);
      return jsonResponse({ ok: true, deleted: true });
    }

    const expense = {
      name: `${policyName} (平攤)`,
      amount: Number(monthlyAverage) || 0,
      status: '已還款',
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

    return jsonResponse({ ok: true, path: expensePath });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
