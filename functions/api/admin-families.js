// ============================================
// admin-families.js — 平台管理 API
// ============================================

import { dbGet, dbPut, dbDelete, jsonResponse } from './_config.js';

export async function onRequestGet({ request }) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const list = await dbGet('platform/families', token);
    const families = Object.entries(list || {}).map(([uid, data]) => ({ uid, ...data }));
    families.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return jsonResponse({ ok: true, families });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

export async function onRequestPost({ request }) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const body = await request.json();
    const { action, uid, name, email } = body || {};

    if (action === 'add') {
      if (!uid || !name) return jsonResponse({ ok: false, error: '缺少 uid 或 name' }, 400);
      
      const success = await dbPut(`platform/families/${uid}`, {
        name,
        ownerEmail: email || '',
        createdAt: Date.now(),
      }, token);

      if (!success) {
        return jsonResponse({ ok: false, error: 'Firebase 寫入失敗，請檢查規則或 Token' }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (action === 'remove') {
      if (!uid) return jsonResponse({ ok: false, error: '缺少 uid' }, 400);
      const success = await dbDelete(`platform/families/${uid}`, token);
      if (!success) return jsonResponse({ ok: false, error: '刪除失敗' }, 500);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: '未知 action' }, 400);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}
