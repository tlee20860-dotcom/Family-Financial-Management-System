// ============================================
// init-family.js — POST /api/init-family
// 用途：若資料庫中沒有成員，建立 4 位預設成員
// ============================================

import { dbGet, dbPut, jsonResponse } from './_config.js';

export async function onRequestPost() {
  try {
    const existing = await dbGet('family_members');

    if (existing && Object.keys(existing).length > 0) {
      return jsonResponse({
        ok: true,
        skipped: true,
        message: '成員已存在，略過初始化',
        memberCount: Object.keys(existing).length,
      });
    }

    const now = Date.now();
    const defaults = {
      mem_husband:  { name: '老公',  role: 'husband', createdAt: now + 1 },
      mem_wife:     { name: '老婆',  role: 'wife',    createdAt: now + 2 },
      mem_son:      { name: '梓舜',  role: 'child',   createdAt: now + 3 },
      mem_daughter: { name: '梓言',  role: 'child',   createdAt: now + 4 },
    };

    await dbPut('family_members', defaults);

    return jsonResponse({
      ok: true,
      created: true,
      memberCount: Object.keys(defaults).length,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
