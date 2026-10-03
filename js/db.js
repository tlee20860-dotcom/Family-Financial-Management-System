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
