// ============================================
// db.js — Firebase Realtime Database 讀寫封裝
// ============================================

import { db } from './firebase-config.js';
import {
  ref, onValue, push, set, update, remove, get
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/* ---------- 成員 ---------- */

export function listenMembers(callback) {
  const r = ref(db, 'family_members');
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, m]) => ({ id, ...m }));
    // 依 createdAt 排序，舊的在前
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
  const r = ref(db, expensePath(year, month, memberId));
  return onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, e]) => ({ id, ...e }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function addExpense(year, month, memberId, expense) {
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
  await update(ref(db, `${expensePath(year, month, memberId)}/${expId}`), patch);
}

export async function removeExpense(year, month, memberId, expId) {
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
  const r = ref(db, `family_income/${year}/${month}`);
  return onValue(r, (snap) => {
    callback(snap.val() || {});
  });
}

export async function saveIncome(year, month, data) {
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
