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
