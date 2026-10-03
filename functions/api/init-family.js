// ============================================
// init-family.js — POST /api/init-family
// 初始化：成員、類別、項目（若已存在則跳過）
// ============================================

import { dbGet, dbPut, jsonResponse } from './_config.js';

export async function onRequestPost() {
  try {
    const results = { members: 0, categories: 0, items: 0 };

    /* ---------- 1. 成員 ---------- */
    const existingMembers = await dbGet('family_members');
    if (!existingMembers || Object.keys(existingMembers).length === 0) {
      const now = Date.now();
      await dbPut('family_members', {
        mem_husband:  { name: '老公',  role: 'husband', createdAt: now + 1 },
        mem_wife:     { name: '老婆',  role: 'wife',    createdAt: now + 2 },
        mem_son:      { name: '梓舜',  role: 'child',   createdAt: now + 3 },
        mem_daughter: { name: '梓言',  role: 'child',   createdAt: now + 4 },
      });
      results.members = 4;
    }

    /* ---------- 2. 類別 ---------- */
    const existingCats = await dbGet('expense_categories');
    if (!existingCats || Object.keys(existingCats).length === 0) {
      const now = Date.now();
      await dbPut('expense_categories', {
        cat_medical:   { name: '醫療類',     order: 1, createdAt: now + 1 },
        cat_school:    { name: '學校類',     order: 2, createdAt: now + 2 },
        cat_insurance: { name: '保險類',     order: 3, createdAt: now + 3 },
        cat_fixed:     { name: '固定費用類', order: 4, createdAt: now + 4 },
        cat_other:     { name: '其他',       order: 5, createdAt: now + 5 },
      });
      results.categories = 5;
    }

    /* ---------- 3. 項目 ---------- */
    const existingItems = await dbGet('expense_items');
    if (!existingItems || Object.keys(existingItems).length === 0) {
      const now = Date.now();
      await dbPut('expense_items', {
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
      });
      results.items = 18;
    }

    return jsonResponse({ ok: true, created: results });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
