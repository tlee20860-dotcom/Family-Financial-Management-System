// ============================================
// api.js — 前端呼叫 Cloudflare Functions 的封裝
// ============================================

async function callApi(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} 失敗（${res.status}）：${text}`);
  }
  return res.json();
}

export const api = {
  // 初始化預設成員
  initFamily: () => callApi('/api/init-family', { method: 'POST' }),

  // 取得家庭匯總
  summary: (year, month) =>
    callApi(`/api/summary?year=${year}&month=${month}`),

  // 保險平攤同步（新增 / 更新）
  insuranceSync: (payload) =>
    callApi('/api/insurance-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action: 'upsert' }),
    }),

  // 保險平攤同步（刪除）
  insuranceUnsync: (payload) =>
    callApi('/api/insurance-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action: 'delete' }),
    }),
};
