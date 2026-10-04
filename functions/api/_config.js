// ============================================
// _config.js — 所有 Functions 共用的 Firebase REST 設定
// ============================================

export const FIREBASE_DB_URL = "https://family-fin-a6dd1-default-rtdb.asia-southeast1.firebasedatabase.app";
export const SUPERADMIN_EMAIL = "superadmin@familyfin.local";

export async function dbGet(path) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
  if (!res.ok) return null;
  return res.json();
}

export async function dbPut(path, data) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function dbDelete(path) {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, { method: 'DELETE' });
  return res.ok;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * 驗證是否為 superadmin（透過 Firebase Auth token）
 */
export async function verifySuperAdmin(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace('Bearer ', '');
  if (!idToken) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${getFirebaseApiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    const data = await res.json();
    if (!data.users || !data.users[0]) return false;
    return data.users[0].email === SUPERADMIN_EMAIL;
  } catch (err) {
    return false;
  }
}

function getFirebaseApiKey() {
  // 從前端 firebase-config.js 中取得的 API Key
  // 這個值是公開的，可以放心寫在這裡
  return "AIzaSyCQlrNdorkJI9xsqr4m4ME0461rubo9Y7I";
}
