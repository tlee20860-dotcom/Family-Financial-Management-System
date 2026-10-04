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

  /**
   * 取得全年匯總（並行呼叫 12 個月）
   * 回傳：{ year, monthly: [...], totalIncome, totalExpense, netBalance, ... }
   */
  fetchAnnualSummary: async (year) => {
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      promises.push(api.summary(year, mm));
    }
    const results = await Promise.all(promises);

    const monthly = results.map((d) => ({
      totalIncome: d.totalIncome || 0,
      totalExpense: d.totalExpense || 0,
      netBalance: d.netBalance || 0,
      perMember: d.perMember || {},
      fixedList: d.fixedList || [],
      monthlyInsuranceAverage: d.monthlyInsuranceAverage || 0,
    }));

    const totalIncome = monthly.reduce((s, m) => s + m.totalIncome, 0);
    const totalExpense = monthly.reduce((s, m) => s + m.totalExpense, 0);
    const netBalance = totalIncome - totalExpense;
    const yearlyInsuranceTotal = results[0]?.yearlyInsuranceTotal || 0;
    const totalAssets = results[11]?.totalAssets || results[0]?.totalAssets || 0;
    const bankBalance = results[11]?.bankBalance || 0;
    const fundValue = results[11]?.fundValue || 0;

    return {
      year,
      monthly,
      totalIncome,
      totalExpense,
      netBalance,
      yearlyInsuranceTotal,
      totalAssets,
      bankBalance,
      fundValue,
    };
  },

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
