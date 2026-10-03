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
  initFamily: () => callApi('/api/init-family', { method: 'POST' }),

  summary: (year, month) =>
    callApi(`/api/summary?year=${year}&month=${month}`),

  insuranceSync: (payload) =>
    callApi('/api/insurance-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action: 'upsert' }),
    }),

  insuranceUnsync: (payload) =>
    callApi('/api/insurance-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action: 'delete' }),
    }),
};
