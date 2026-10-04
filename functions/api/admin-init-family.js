// ============================================
// admin-init-family.js — POST /api/admin-init-family
// ============================================

import { dbGet, dbPut, jsonResponse } from './_config.js';

export async function onRequestPost({ request }) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const body = await request.json();
    const { uid } = body || {};

    if (!uid) return jsonResponse({ ok: false, error: '缺少 uid' }, 400);

    const basePath = `families/${uid}`;

    const existing = await dbGet(`${basePath}/members`);
    if (existing && Object.keys(existing).length > 0) {
      return jsonResponse({ ok: true, skipped: true, message: '此家庭已有資料' });
    }

    const now = Date.now();

    const membersOk = await dbPut(`${basePath}/members`, {
      mem_husband:  { name: '老公',  role: 'husband', order: 0, createdAt: now + 1 },
      mem_wife:     { name: '老婆',  role: 'wife',    order: 1, createdAt: now + 2 },
      mem_son:      { name: '梓舜',  role: 'child',   order: 2, createdAt: now + 3 },
      mem_daughter: { name: '梓言',  role: 'child',   order: 3, createdAt: now + 4 },
    }, token);

    if (!membersOk) return jsonResponse({ ok: false, error: '寫入成員失敗，請檢查 Firebase 規則' }, 500);

    await dbPut(`${basePath}/expense_categories`, {
      cat_medical:   { name: '醫療類',     order: 1, createdAt: now + 1 },
      cat_school:    { name: '學校類',     order: 2, createdAt: now + 2 },
      cat_insurance: { name: '保險類',     order: 3, createdAt: now + 3 },
      cat_fixed:     { name: '固定費用類', order: 4, createdAt: now + 4 },
      cat_other:     { name: '其他',       order: 5, createdAt: now + 5 },
    }, token);

    await dbPut(`${basePath}/expense_items`, {
      item_med_01: { categoryId: 'cat_medical',   name: '看病-一般',   createdAt: now + 1 },
      item_med_02: { categoryId: 'cat_medical',   name: '看病-專科',   createdAt: now + 2 },
      item_med_03: { categoryId: 'cat_medical',   name: '牙醫',        createdAt: now + 3 },
      item_med_04: { categoryId: 'cat_medical',   name: '藥費',        createdAt: now + 4 },
      item_sch_01: { categoryId: 'cat_school',    name: '學費',        createdAt: now + 5 },
      item_sch_02: { categoryId: 'cat_school',    name: '功課輔導班',  createdAt: now + 6 },
      item_sch_03: { categoryId: 'cat_school',    name: '興趣班',      createdAt: now + 7 },
      item_sch_04: { categoryId: 'cat_school',    name: '書本費',      createdAt: now + 8 },
      item_sch_05: { categoryId: 'cat_school',    name: '校車費',      createdAt: now + 9 },
      item_ins_01: { categoryId: 'cat_insurance', name: '住院保險',    createdAt: now + 10 },
      item_ins_02: { categoryId: 'cat_insurance', name: '人壽保險',    createdAt: now + 11 },
      item_ins_03: { categoryId: 'cat_insurance', name: '意外保險',    createdAt: now + 12 },
      item_fix_01: { categoryId: 'cat_fixed',     name: '水費',        createdAt: now + 13 },
      item_fix_02: { categoryId: 'cat_fixed',     name: '電費',        createdAt: now + 14 },
      item_fix_03: { categoryId: 'cat_fixed',     name: '煤氣費',      createdAt: now + 15 },
      item_fix_04: { categoryId: 'cat_fixed',     name: '管理費',      createdAt: now + 16 },
      item_fix_05: { categoryId: 'cat_fixed',     name: '房租',        createdAt: now + 17 },
      item_oth_01: { categoryId: 'cat_other',     name: '其他',        createdAt: now + 18 },
    }, token);

    return jsonResponse({ ok: true, created: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
