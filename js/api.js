// ============================================
// api.js — Cloudflare Functions 呼叫封裝（多家庭版）
// ============================================

import { AppState } from './state.js';
import { auth } from './firebase-config.js'; // 🆕 新增

async function callApi(path, options = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';

  const headers = {
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`,
  };

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} 失敗（${res.status}）：${text}`);
  }
  return res.json();
}

function getFamilyId() {
  const id = AppState.getFamilyId();
  if (!id) throw new Error('尚未選擇家庭');
  return id;
}

export const api = {
  summary: (year, month) =>
    callApi(`/api/summary?familyId=${getFamilyId()}&year=${year}&month=${month}`),

  fetchAnnualSummary: async (year) => {
    const familyId = getFamilyId();
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      promises.push(callApi(`/api/summary?familyId=${familyId}&year=${year}&month=${mm}`));
    }
    const results = await Promise.all(promises);

    const monthly = results.map((d, i) => ({
      monthNum: i + 1,
      month: String(i + 1).padStart(2, '0'),
      totalIncome: d.totalIncome || 0,
      totalExpense: d.totalExpense || 0,
      netBalance: d.netBalance || 0,
      perMember: d.perMember || {},
      fixedList: d.fixedList || [],
      incomeBreakdown: d.incomeBreakdown || {},
      monthlyInsuranceAverage: d.monthlyInsuranceAverage || 0,
      totalAssets: d.totalAssets || 0,
      bankBalance: d.bankBalance || 0,
      fundValue: d.fundValue || 0,
      yearlyInsuranceTotal: d.yearlyInsuranceTotal || 0,
    }));

    const totalIncome = monthly.reduce((s, m) => s + m.totalIncome, 0);
    const totalExpense = monthly.reduce((s, m) => s + m.totalExpense, 0);
    const netBalance = totalIncome - totalExpense;

    return {
      year, monthly,
      totalIncome, totalExpense, netBalance,
      yearlyInsuranceTotal: results[0]?.yearlyInsuranceTotal || 0,
      totalAssets: results[11]?.totalAssets || results[0]?.totalAssets || 0,
      bankBalance: results[11]?.bankBalance || 0,
      fundValue: results[11]?.fundValue || 0,
    };
  },

  insuranceSync: (payload) =>
    callApi('/api/insurance-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, familyId: getFamilyId(), action: 'upsert' }),
    }),

  insuranceUnsync: (payload) =>
    callApi('/api/insurance-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, familyId: getFamilyId(), action: 'delete' }),
    }),

  /* ---------- 平台管理 API ---------- */
  adminListFamilies: () => callApi('/api/admin-families?action=list'),

  adminAddFamily: (uid, name, email) =>
    callApi('/api/admin-families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', uid, name, email }),
    }),

  adminRemoveFamily: (uid) =>
    callApi('/api/admin-families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', uid }),
    }),

  adminInitFamily: (uid) =>
    callApi('/api/admin-init-family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    }),
};
