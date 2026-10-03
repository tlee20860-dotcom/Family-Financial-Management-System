// ============================================
// _config.js — 所有 Functions 共用的 Firebase REST 設定
// ============================================

// ⚠️ 請替換成你的 Realtime Database URL（結尾不要加斜線）
export const FIREBASE_DB_URL = "https://family-financial-management-system.pages.dev/";

// 快速封裝：讀取 RTDB 某個路徑
export async function dbGet(path) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
  if (!res.ok) return null;
  return res.json();
}

// 快速封裝：寫入（PUT）RTDB 某個路徑
export async function dbPut(path, data) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// 快速封裝：刪除 RTDB 某個路徑
export async function dbDelete(path) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
    method: 'DELETE',
  });
  return res.ok;
}

// 統一的 JSON 回應
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
