// ============================================
// insurance-sync.js — POST /api/insurance-sync
// ============================================

import { dbPut, dbDelete, jsonResponse } from './_config.js';

export async function onRequestPost({ request }) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const body = await request.json();
    const {
      action, familyId, policyId, memberId, policyName, monthlyAverage, year, month,
    } = body || {};

    if (!familyId || !policyId || !memberId || !year || !month) {
      return jsonResponse({ ok: false, error: '缺少必要欄位' }, 400);
    }

    const basePath = `families/${familyId}`;
    const linkedKey = `linked_${policyId}`;
    const expensePath = `${basePath}/expenses/${year}/${month}/member_expenses/${memberId}/${linkedKey}`;
    const paymentPath = `${basePath}/insurance_payments/${policyId}/${year}/${month}`;

    if (action === 'delete') {
      await dbDelete(expensePath, token);
      await dbDelete(paymentPath, token);
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
    await dbPut(expensePath, expense, token);
    await dbPut(paymentPath, {
      status: '已扣款',
      amount: Number(monthlyAverage) || 0,
      date: new Date().toISOString().slice(0, 10),
    }, token);

    return jsonResponse({ ok: true, path: expensePath });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
