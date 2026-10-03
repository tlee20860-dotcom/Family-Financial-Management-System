// ============================================
// insurance-sync.js — POST /api/insurance-sync
// 用途：當保單新增 / 修改 / 刪除時，
//       自動在對應成員的當月支出中建立 / 更新 / 刪除一筆「平攤」項目
// ============================================

import { dbPut, dbDelete, jsonResponse } from './_config.js';

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
      return jsonResponse({
        ok: false,
        error: '缺少必要欄位：policyId / memberId / year / month',
      }, 400);
    }

    // 連動項目使用固定 key，保證同一張保單只會有一筆
    const linkedKey = `linked_${policyId}`;
    const path = `family_expenses/${year}/${month}/member_expenses/${memberId}/${linkedKey}`;

    if (action === 'delete') {
      await dbDelete(path);
      return jsonResponse({ ok: true, deleted: true, path });
    }

    // upsert：建立或更新
    const expense = {
      name: `${policyName} (平攤)`,
      amount: Number(monthlyAverage) || 0,
      status: '已處理',
      date: '',
      isAutoLinked: true,
      policyId,
      createdAt: Date.now(),
    };

    await dbPut(path, expense);

    return jsonResponse({ ok: true, path, expense });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
