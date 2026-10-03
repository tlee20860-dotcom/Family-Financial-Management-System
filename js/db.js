// ============================================
// db.js — Firebase Realtime Database 讀寫封裝
// ============================================

import { db } from './firebase-config.js';
import { AppState } from './state.js';
import {
  ref, onValue, push, set, update, remove, get
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/* ---------- 成員 ---------- */

export function listenMembers(callback) {
  const r = ref(db, 'family_members');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, m]) => ({ id, ...m }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function getMembersOnce() {
  const snap = await get(ref(db, 'family_members'));
  const val = snap.val() || {};
  return Object.entries(val).map(([id, m]) => ({ id, ...m }));
}

export async function addMember(member) {
  const r = ref(db, 'family_members');
  const newRef = push(r);
  await set(newRef, {
    name: member.name,
    role: member.role || 'other',
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateMember(id, patch) {
  await update(ref(db, `family_members/${id}`), patch);
}

export async function removeMember(id) {
  await remove(ref(db, `family_members/${id}`));
}

/* ---------- 支出 ---------- */

function expensePath(year, month, memberId) {
  return `family_expenses/${year}/${month}/member_expenses/${memberId}`;
}

export function listenExpenses(year, month, memberId, callback) {
  // 若未傳入年月，自動使用 AppState 的當前年月
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, expensePath(year, month, memberId));
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, e]) => ({ id, ...e }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addExpense(year, month, memberId, expense) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, expensePath(year, month, memberId));
  const newRef = push(r);
  await set(newRef, {
    name: expense.name,
    amount: Number(expense.amount) || 0,
    status: expense.status || '未處理',
    date: expense.date || '',
    isAutoLinked: expense.isAutoLinked || false,
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateExpense(year, month, memberId, expId, patch) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  await update(ref(db, `${expensePath(year, month, memberId)}/${expId}`), patch);
}

export async function removeExpense(year, month, memberId, expId) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  await remove(ref(db, `${expensePath(year, month, memberId)}/${expId}`));
}

/* ---------- 保險 ---------- */

export function listenInsurancePolicies(callback) {
  const r = ref(db, 'insurance_policies');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, p]) => ({ id, ...p }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addInsurancePolicy(policy) {
  const r = ref(db, 'insurance_policies');
  const newRef = push(r);
  await set(newRef, {
    memberId: policy.memberId || '',
    name: policy.name || '',
    company: policy.company || '',
    annualPremium: Number(policy.annualPremium) || 0,
    monthlyAverage: Number(policy.monthlyAverage) || 0,
    paymentDate: policy.paymentDate || '',
    account: policy.account || '',
    totalPeriods: Number(policy.totalPeriods) || 0,
    completedPeriods: Number(policy.completedPeriods) || 0,
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateInsurancePolicy(id, patch) {
  await update(ref(db, `insurance_policies/${id}`), patch);
}

export async function removeInsurancePolicy(id) {
  await remove(ref(db, `insurance_policies/${id}`));
}

/* ---------- 收入 ---------- */

export function listenIncome(year, month, callback) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `family_income/${year}/${month}`);
  return onValue(r, (snap) => {
    callback(snap.val() || {});
  });
}

export async function saveIncome(year, month, data) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  await set(ref(db, `family_income/${year}/${month}`), {
    husbandContribution: Number(data.husbandContribution) || 0,
    wifeContribution:    Number(data.wifeContribution)    || 0,
    extraIncome:         Number(data.extraIncome)         || 0,
  });
}

/* ---------- 資產 ---------- */

export function listenAssets(callback) {
  const r = ref(db, 'family_assets');
  return onValue(r, (snap) => {
    callback(snap.val() || {});
  });
}

export async function saveAssets(data) {
  await update(ref(db, 'family_assets'), {
    bankBalance: Number(data.bankBalance) || 0,
  });
}

/* ---------- 基金投資 ---------- */

export function listenFunds(callback) {
  const r = ref(db, 'investment_funds');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, f]) => ({ id, ...f }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addFund(fund) {
  const r = ref(db, 'investment_funds');
  const newRef = push(r);
  await set(newRef, {
    name: fund.name || '',
    cost: Number(fund.cost) || 0,
    currentValue: Number(fund.currentValue) || 0,
    units: Number(fund.units) || 0,
    note: fund.note || '',
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateFund(id, patch) {
  await update(ref(db, `investment_funds/${id}`), {
    name: patch.name || '',
    cost: Number(patch.cost) || 0,
    currentValue: Number(patch.currentValue) || 0,
    units: Number(patch.units) || 0,
    note: patch.note || '',
  });
}

export async function removeFund(id) {
  await remove(ref(db, `investment_funds/${id}`));
}
/* ---------- 支出類別 ---------- */

export function listenCategories(callback) {
  const r = ref(db, 'expense_categories');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, c]) => ({ id, ...c }));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(list);
  });
}

export async function addCategory(cat) {
  const r = ref(db, 'expense_categories');
  const newRef = push(r);
  await set(newRef, {
    name: cat.name || '',
    order: Number(cat.order) || 0,
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateCategory(id, patch) {
  await update(ref(db, `expense_categories/${id}`), {
    name: patch.name || '',
    order: Number(patch.order) || 0,
  });
}

export async function removeCategory(id) {
  await remove(ref(db, `expense_categories/${id}`));
}

/* ---------- 支出項目 ---------- */

export function listenItems(callback) {
  const r = ref(db, 'expense_items');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, i]) => ({ id, ...i }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addItem(item) {
  const r = ref(db, 'expense_items');
  const newRef = push(r);
  await set(newRef, {
    name: item.name || '',
    categoryId: item.categoryId || '',
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateItem(id, patch) {
  await update(ref(db, `expense_items/${id}`), {
    name: patch.name || '',
    categoryId: patch.categoryId || '',
  });
}

export async function removeItem(id) {
  await remove(ref(db, `expense_items/${id}`));
}

/* ---------- 固定支出模板 ---------- */

export function listenFixedTemplates(callback) {
  const r = ref(db, 'fixed_expense_templates');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, t]) => ({ id, ...t }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addFixedTemplate(tmpl) {
  const r = ref(db, 'fixed_expense_templates');
  const newRef = push(r);
  await set(newRef, {
    name: tmpl.name || '',
    categoryId: tmpl.categoryId || '',
    itemId: tmpl.itemId || '',
    memberId: tmpl.memberId || '',
    amount: Number(tmpl.amount) || 0,
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function removeFixedTemplate(id) {
  await remove(ref(db, `fixed_expense_templates/${id}`));
}
/* ---------- 結算清單：固定還款 ---------- */

export function listenFixedRepayments(year, month, callback) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `fixed_repayments/${year}/${month}`);
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, x]) => ({ id, ...x }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addFixedRepayment(year, month, data) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `fixed_repayments/${year}/${month}`);
  const newRef = push(r);
  await set(newRef, {
    memberId: data.memberId || '',
    name: data.name || '',
    amount: Number(data.amount) || 0,
    status: '未還款',
    repaidDate: '',
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateFixedRepayment(year, month, id, patch) {
  await update(ref(db, `fixed_repayments/${year}/${month}/${id}`), patch);
}

export async function removeFixedRepayment(year, month, id) {
  await remove(ref(db, `fixed_repayments/${year}/${month}/${id}`));
}

/* ---------- 結算清單：當月所有成員代墊支出 ---------- */

export function listenAllMemberExpenses(year, month, callback) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `family_expenses/${year}/${month}/member_expenses`);
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const flat = [];
    Object.entries(val).forEach(([memberId, items]) => {
      Object.entries(items || {}).forEach(([id, exp]) => {
        flat.push({ id, memberId, ...exp });
      });
    });
    flat.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(flat);
  });
}

/**
 * 標記成員代墊支出為已還款 / 未還款
 */
export async function markMemberExpenseRepaid(year, month, memberId, expId, isRepaid) {
  await update(
    ref(db, `family_expenses/${year}/${month}/member_expenses/${memberId}/${expId}`),
    {
      status: isRepaid ? '已還款' : '未還款',
      repaidDate: isRepaid ? new Date().toISOString().slice(0, 10) : '',
    }
  );
}
/* ---------- 家庭固定支出 ---------- */

export function listenFixedExpenses(year, month, callback) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `fixed_expenses/${year}/${month}`);
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, x]) => ({ id, ...x }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addFixedExpense(year, month, data) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `fixed_expenses/${year}/${month}`);
  const newRef = push(r);
  await set(newRef, {
    name: data.name || '',
    amount: Number(data.amount) || 0,
    cycle: data.cycle || '每月',
    dueDate: data.dueDate || '',
    status: data.status || '未付款',
    paidDate: '',
    note: data.note || '',
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateFixedExpense(year, month, id, patch) {
  await update(ref(db, `fixed_expenses/${year}/${month}/${id}`), patch);
}

export async function removeFixedExpense(year, month, id) {
  await remove(ref(db, `fixed_expenses/${year}/${month}/${id}`));
}

/**
 * 從固定支出模板批量生成本月固定支出
 * 回傳：新增的筆數
 */
export async function generateFixedExpensesFromTemplates(year, month) {
  const tmplSnap = await get(ref(db, 'fixed_expense_templates'));
  const templates = tmplSnap.val() || {};
  const currentSnap = await get(ref(db, `fixed_expenses/${year}/${month}`));
  const existing = currentSnap.val() || {};

  // 建立現有名稱集合，避免重複生成
  const existingNames = new Set(Object.values(existing).map((x) => x.name));

  let added = 0;
  for (const [id, t] of Object.entries(templates)) {
    if (existingNames.has(t.name)) continue;

    await set(ref(db, `fixed_expenses/${year}/${month}/${id}`), {
      name: t.name || '',
      amount: Number(t.amount) || 0,
      cycle: '每月',
      dueDate: '',
      status: '未付款',
      paidDate: '',
      note: '由模板自動生成',
      createdAt: Date.now(),
    });
    added++;
  }
  return added;
}
/* ---------- 保險（擴充版：支援基金保險與期數追蹤） ---------- */

export async function addInsurancePolicyV2(policy) {
  const r = ref(db, 'insurance_policies');
  const newRef = push(r);
  await set(newRef, {
    type: policy.type || 'normal',        // 'normal' | 'fund_insurance'
    memberId: policy.memberId || '',
    name: policy.name || '',
    company: policy.company || '',
    startDate: policy.startDate || '',
    paymentType: policy.paymentType || '年繳',
    annualPremium: Number(policy.annualPremium) || 0,
    monthlyPremium: Number(policy.monthlyPremium) || 0,
    monthlyAverage: Number(policy.monthlyAverage) || 0,
    totalPremium: Number(policy.totalPremium) || 0,
    paidPremium: Number(policy.paidPremium) || 0,
    totalPeriods: Number(policy.totalPeriods) || 0,
    completedPeriods: Number(policy.completedPeriods) || 0,
    remainingPeriods: Number(policy.remainingPeriods) || 0,
    isCompleted: policy.isCompleted || false,
    paymentDate: policy.paymentDate || '',
    account: policy.account || '',
    // 基金保險專屬
    totalInvested: Number(policy.totalInvested) || 0,
    currentValue: Number(policy.currentValue) || 0,
    monthlyHistory: policy.monthlyHistory || {},
    createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateInsurancePolicyV2(id, patch) {
  await update(ref(db, `insurance_policies/${id}`), patch);
}

/**
 * 標記保險本月已扣款（普通保險）
 * 自動：已供期數 +1、餘下期數 -1、已供保費 += 每期金額
 */
export async function markInsurancePaid(policyId, year, month, paymentAmount) {
  const snap = await get(ref(db, `insurance_policies/${policyId}`));
  const policy = snap.val();
  if (!policy) return;

  const newCompleted = (policy.completedPeriods || 0) + 1;
  const newRemaining = Math.max(0, (policy.remainingPeriods || 0) - 1);
  const newPaid = (policy.paidPremium || 0) + (Number(paymentAmount) || 0);
  const isCompleted = newRemaining === 0;

  await update(ref(db, `insurance_policies/${policyId}`), {
    completedPeriods: newCompleted,
    remainingPeriods: newRemaining,
    paidPremium: newPaid,
    isCompleted,
  });

  await set(ref(db, `insurance_payments/${policyId}/${year}/${month}`), {
    status: '已扣款',
    amount: Number(paymentAmount) || 0,
    date: new Date().toISOString().slice(0, 10),
  });
}

/**
 * 更新基金保險的現值與月繳紀錄
 */
export async function updateFundInsuranceValue(policyId, year, month, newValue) {
  const snap = await get(ref(db, `insurance_policies/${policyId}`));
  const policy = snap.val();
  if (!policy) return;

  const monthlyHistory = policy.monthlyHistory || {};
  monthlyHistory[`${year}-${month}`] = Number(newValue) || 0;

  const totalInvested = (policy.totalInvested || 0) + (Number(policy.monthlyPremium) || 0);
  const totalProfitLoss = (Number(newValue) || 0) - totalInvested;

  await update(ref(db, `insurance_policies/${policyId}`), {
    currentValue: Number(newValue) || 0,
    totalInvested,
    totalProfitLoss,
    monthlyHistory,
  });
}

export function listenInsurancePayments(policyId, year, month, callback) {
  const r = ref(db, `insurance_payments/${policyId}/${year}/${month}`);
  return onValue(r, (snap) => callback(snap.val() || {}));
}
/* ---------- 每月收入（新結構：按成員ID儲存） ---------- */

export function listenIncomeV2(year, month, callback) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  const r = ref(db, `family_income/${year}/${month}`);
  return onValue(r, (snap) => {
    callback(snap.val() || {});
  });
}

export async function saveIncomeV2(year, month, data) {
  if (!year || !month) {
    const ym = AppState.getYearMonth();
    year = ym.year;
    month = ym.month;
  }
  // data 格式：{ mem_husband: 20000, mem_wife: 20000, extra: 5000 }
  const clean = {};
  Object.entries(data).forEach(([key, val]) => {
    const num = Number(val) || 0;
    if (num > 0) clean[key] = num;
  });
  await set(ref(db, `family_income/${year}/${month}`), clean);
}
