// ============================================
// db.js — Firebase Realtime Database 讀寫封裝（多家庭版）
// ============================================

import { db } from './firebase-config.js';
import { AppState } from './state.js';
import {
  ref, onValue, push, set, update, remove, get
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/* ============================================
   路徑工具
   ============================================ */

function familyPath(subpath) {
  const familyId = AppState.getFamilyId();
  if (!familyId) throw new Error('尚未選擇家庭');
  return `families/${familyId}/${subpath}`;
}

function familyRef(subpath) {
  return ref(db, familyPath(subpath));
}

function listen(subpath, callback, onError) {
  const familyId = AppState.getFamilyId();
  if (!familyId) {
    console.warn('⚠️ 尚未選擇家庭，略過 Firebase 讀取：', subpath);
    if (onError) onError(new Error('尚未選擇家庭'));
    return () => {};
  }
  const r = ref(db, `families/${familyId}/${subpath}`);
  return onValue(r, callback, (err) => {
    console.error(`❌ Firebase 讀取失敗 [${subpath}]：`, err);
    if (onError) onError(err);
  });
}

export { familyPath, familyRef };

/* ============================================
   成員
   ============================================ */

export function listenMembers(callback, onError) {
  return listen('members', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, m]) => ({ id, ...m }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function getMembersOnce() {
  const snap = await get(familyRef('members'));
  const val = snap.val() || {};
  return Object.entries(val).map(([id, m]) => ({ id, ...m }));
}

export async function addMember(member) {
  const r = familyRef('members');
  const newRef = push(r);
  await set(newRef, { name: member.name, role: member.role || 'other', order: member.order != null ? Number(member.order) : 0, createdAt: Date.now() });
  return newRef.key;
}

export async function updateMember(id, patch) {
  await update(familyRef(`members/${id}`), patch);
}

export async function removeMember(id) {
  await remove(familyRef(`members/${id}`));
}

export async function updateMemberOrders(orderMap) {
  const updates = {};
  Object.entries(orderMap).forEach(([id, order]) => { updates[familyPath(`members/${id}/order`)] = Number(order); });
  await update(ref(db), updates);
}

/* ============================================
   成員支出（代墊）
   ============================================ */

function expensePath(year, month, memberId) {
  return `expenses/${year}/${month}/member_expenses/${memberId}`;
}

export function listenExpenses(year, month, memberId, callback, onError) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  return listen(expensePath(year, month, memberId), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, e]) => ({ id, ...e }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addExpense(year, month, memberId, expense) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  const r = familyRef(expensePath(year, month, memberId));
  const newRef = push(r);
  await set(newRef, { name: expense.name, amount: Number(expense.amount) || 0, status: expense.status || '未處理', date: expense.date || '', categoryId: expense.categoryId || '', itemId: expense.itemId || '', isAutoLinked: expense.isAutoLinked || false, createdAt: Date.now() });
  return newRef.key;
}

export async function updateExpense(year, month, memberId, expId, patch) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  await update(familyRef(`${expensePath(year, month, memberId)}/${expId}`), patch);
}

export async function removeExpense(year, month, memberId, expId) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  await remove(familyRef(`${expensePath(year, month, memberId)}/${expId}`));
}

/* ============================================
   保險
   ============================================ */

export function listenInsurancePolicies(callback, onError) {
  return listen('insurance_policies', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, p]) => ({ id, ...p }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addInsurancePolicyV2(policy) {
  const r = familyRef('insurance_policies');
  const newRef = push(r);
  await set(newRef, {
    type: policy.type || 'normal', memberId: policy.memberId || '', name: policy.name || '', company: policy.company || '',
    paymentType: policy.paymentType || '年繳', firstStartYear: Number(policy.firstStartYear) || 0, firstStartMonth: String(policy.firstStartMonth || '01').padStart(2, '0'),
    totalPolicyYears: Number(policy.totalPolicyYears) || 0, totalPolicyPeriods: Number(policy.totalPolicyPeriods) || 0,
    currentPeriodIndex: Number(policy.currentPeriodIndex) || 1, account: policy.account || '', periods: policy.periods || {}, createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateInsurancePolicyV2(id, patch) {
  await update(familyRef(`insurance_policies/${id}`), {
    type: patch.type || 'normal', memberId: patch.memberId || '', name: patch.name || '', company: patch.company || '',
    paymentType: patch.paymentType || '年繳', firstStartYear: Number(patch.firstStartYear) || 0, firstStartMonth: String(patch.firstStartMonth || '01').padStart(2, '0'),
    totalPolicyYears: Number(patch.totalPolicyYears) || 0, totalPolicyPeriods: Number(patch.totalPolicyPeriods) || 0,
    currentPeriodIndex: Number(patch.currentPeriodIndex) || 1, account: patch.account || '', periods: patch.periods || {},
  });
}

export async function removeInsurancePolicy(id) {
  await remove(familyRef(`insurance_policies/${id}`));
}

export async function addInsurancePeriod(policyId, periodIndex, periodData) {
  await set(familyRef(`insurance_policies/${policyId}/periods/${periodIndex}`), {
    periodIndex: Number(periodIndex), startYear: Number(periodData.startYear), startMonth: String(periodData.startMonth).padStart(2, '0'),
    annualPremium: Number(periodData.annualPremium) || 0, monthlyAverage: Number(periodData.monthlyAverage) || 0,
  });
}

export function listenInsurancePayment(policyId, year, month, callback, onError) {
  return listen(`insurance_payments/${policyId}/${year}/${month}`, (snap) => callback(snap.val() || {}), onError);
}

export async function getInsurancePaymentsOnce(policyId) {
  const snap = await get(familyRef(`insurance_payments/${policyId}`));
  return snap.val() || {};
}

export async function saveInsurancePaymentBatch(policyId, year, month, data) {
  await set(familyRef(`insurance_payments/${policyId}/${year}/${month}`), {
    status: data.status || '已扣款', amount: Number(data.amount) || 0, date: data.date || new Date().toISOString().slice(0, 10),
  });
}

export async function removeInsurancePaymentBatch(policyId, year, month) {
  await remove(familyRef(`insurance_payments/${policyId}/${year}/${month}`));
}

/* ============================================
   收入
   ============================================ */

export function listenIncomeV2(year, month, callback, onError) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  return listen(`income/${year}/${month}`, (snap) => callback(snap.val() || {}), onError);
}

export async function getIncomeOnce(year, month) {
  const snap = await get(familyRef(`income/${year}/${month}`));
  return snap.val() || {};
}

export async function saveIncomeV2(year, month, data) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  const clean = {};
  Object.entries(data).forEach(([key, val]) => { const num = Number(val) || 0; if (num > 0) clean[key] = num; });
  await set(familyRef(`income/${year}/${month}`), clean);
}

/* ============================================
   基金
   ============================================ */

export function listenFunds(callback, onError) {
  return listen('funds', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, f]) => ({ id, ...f }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addFund(fund) {
  const r = familyRef('funds');
  const newRef = push(r);
  await set(newRef, { name: fund.name || '', cost: Number(fund.cost) || 0, currentValue: Number(fund.currentValue) || 0, units: Number(fund.units) || 0, note: fund.note || '', createdAt: Date.now() });
  return newRef.key;
}

export async function updateFund(id, patch) {
  await update(familyRef(`funds/${id}`), { name: patch.name || '', cost: Number(patch.cost) || 0, currentValue: Number(patch.currentValue) || 0, units: Number(patch.units) || 0, note: patch.note || '' });
}

export async function removeFund(id) {
  await remove(familyRef(`funds/${id}`));
}

/* ============================================
   支出類別與項目
   ============================================ */

export function listenCategories(callback, onError) {
  return listen('expense_categories', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, c]) => ({ id, ...c }));
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(list);
  }, onError);
}

export async function addCategory(cat) {
  const r = familyRef('expense_categories');
  const newRef = push(r);
  await set(newRef, { name: cat.name || '', order: Number(cat.order) || 0, createdAt: Date.now() });
  return newRef.key;
}

export async function updateCategory(id, patch) {
  await update(familyRef(`expense_categories/${id}`), { name: patch.name || '', order: Number(patch.order) || 0 });
}

export async function removeCategory(id) {
  await remove(familyRef(`expense_categories/${id}`));
}

export function listenItems(callback, onError) {
  return listen('expense_items', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, i]) => ({ id, ...i }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addItem(item) {
  const r = familyRef('expense_items');
  const newRef = push(r);
  await set(newRef, { name: item.name || '', categoryId: item.categoryId || '', createdAt: Date.now() });
  return newRef.key;
}

export async function updateItem(id, patch) {
  await update(familyRef(`expense_items/${id}`), { name: patch.name || '', categoryId: patch.categoryId || '' });
}

export async function removeItem(id) {
  await remove(familyRef(`expense_items/${id}`));
}

/* ============================================
   固定支出
   ============================================ */

export function listenFixedExpensesV2(year, month, callback, onError) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  return listen(`fixed_expenses/${year}/${month}`, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, x]) => ({ id, ...x }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addFixedExpenseV2(year, month, data) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  const r = familyRef(`fixed_expenses/${year}/${month}`);
  const newRef = push(r);
  await set(newRef, {
    name: data.name || '', amount: Number(data.amount) || 0, cycle: data.cycle || '每月', note: data.note || '',
    categoryId: data.categoryId || '', itemId: data.itemId || '', status: data.status || '未付款', paidDate: data.paidDate || '',
    isSkipped: data.isSkipped || false, createdAt: Date.now(),
  });
  return newRef.key;
}

export async function updateFixedExpenseV2(year, month, id, patch) {
  await update(familyRef(`fixed_expenses/${year}/${month}/${id}`), patch);
}

export async function removeFixedExpenseV2(year, month, id) {
  await remove(familyRef(`fixed_expenses/${year}/${month}/${id}`));
}

export async function copyFixedExpensesFromPrevMonth(year, month) {
  const y = Number(year); const m = Number(month);
  let prevY = y; let prevM = m - 1;
  if (prevM < 1) { prevY = y - 1; prevM = 12; }
  const prevMonthStr = String(prevM).padStart(2, '0');
  const currentSnap = await get(familyRef(`fixed_expenses/${year}/${month}`));
  if (currentSnap.exists() && Object.keys(currentSnap.val() || {}).length > 0) return 0;
  const prevSnap = await get(familyRef(`fixed_expenses/${prevY}/${prevMonthStr}`));
  const prevVal = prevSnap.val() || {};
  const prevList = Object.entries(prevVal);
  if (prevList.length === 0) return 0;
  let count = 0;
  for (const [id, item] of prevList) {
    const newRef = push(familyRef(`fixed_expenses/${year}/${month}`));
    await set(newRef, {
      name: item.name || '', amount: Number(item.amount) || 0, cycle: item.cycle || '每月', note: item.note || '',
      categoryId: item.categoryId || '', itemId: item.itemId || '', status: '未付款', paidDate: '', isSkipped: false,
      createdAt: Date.now() + count, copiedFrom: `${prevY}-${prevMonthStr}`,
    });
    count++;
  }
  return count;
}

export async function getFixedExpensesOnce(year, month) {
  const snap = await get(familyRef(`fixed_expenses/${year}/${month}`));
  const val = snap.val() || {};
  const list = Object.entries(val).map(([id, x]) => ({ id, ...x }));
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return list;
}

/* ============================================
   銀行
   ============================================ */

export function listenBanks(callback, onError) {
  return listen('banks', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, b]) => ({ id, ...b }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addBank(name) {
  const r = familyRef('banks');
  const newRef = push(r);
  await set(newRef, { name: name || '', createdAt: Date.now() });
  return newRef.key;
}

export async function removeBank(id) {
  await remove(familyRef(`banks/${id}`));
}

export function listenBankBalances(year, month, callback, onError) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  return listen(`bank_balances/${year}/${month}`, (snap) => callback(snap.val() || {}), onError);
}

export async function saveBankBalance(year, month, bankId, amount) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  await update(familyRef(`bank_balances/${year}/${month}`), { [bankId]: { amount: Number(amount) || 0, updatedAt: Date.now() } });
}

export async function getPrevMonthBankTotal(year, month) {
  const y = Number(year); const m = Number(month);
  let prevY = y; let prevM = m - 1;
  if (prevM < 1) { prevY = y - 1; prevM = 12; }
  const prevMonthStr = String(prevM).padStart(2, '0');
  const snap = await get(familyRef(`bank_balances/${prevY}/${prevMonthStr}`));
  const val = snap.val() || {};
  return Object.values(val).reduce((s, b) => s + (Number(b.amount) || 0), 0);
}

export async function getBankBalancesOnce(year, month) {
  const snap = await get(familyRef(`bank_balances/${year}/${month}`));
  return snap.val() || {};
}

/* ============================================
   結算清單
   ============================================ */

export function listenFixedRepayments(year, month, callback, onError) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  return listen(`fixed_repayments/${year}/${month}`, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, x]) => ({ id, ...x }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addFixedRepayment(year, month, data) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  const r = familyRef(`fixed_repayments/${year}/${month}`);
  const newRef = push(r);
  await set(newRef, { memberId: data.memberId || '', name: data.name || '', amount: Number(data.amount) || 0, status: '未還款', repaidDate: '', createdAt: Date.now() });
  return newRef.key;
}

export async function updateFixedRepayment(year, month, id, patch) {
  await update(familyRef(`fixed_repayments/${year}/${month}/${id}`), patch);
}

export async function removeFixedRepayment(year, month, id) {
  await remove(familyRef(`fixed_repayments/${year}/${month}/${id}`));
}

export function listenAllMemberExpenses(year, month, callback, onError) {
  if (!year || !month) { const ym = AppState.getYearMonth(); year = ym.year; month = ym.month; }
  return listen(`expenses/${year}/${month}/member_expenses`, (snap) => {
    const val = snap.val() || {};
    const flat = [];
    Object.entries(val).forEach(([memberId, items]) => {
      Object.entries(items || {}).forEach(([id, exp]) => { flat.push({ id, memberId, ...exp }); });
    });
    flat.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(flat);
  }, onError);
}

export async function markMemberExpenseRepaid(year, month, memberId, expId, isRepaid) {
  await update(familyRef(`expenses/${year}/${month}/member_expenses/${memberId}/${expId}`), { status: isRepaid ? '已還款' : '未還款', repaidDate: isRepaid ? new Date().toISOString().slice(0, 10) : '' });
}

export async function getFixedRepaymentsOnce(year, month) {
  const snap = await get(familyRef(`fixed_repayments/${year}/${month}`));
  const val = snap.val() || {};
  const list = Object.entries(val).map(([id, x]) => ({ id, ...x }));
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return list;
}

export async function getAllMemberExpensesOnce(year, month) {
  const snap = await get(familyRef(`expenses/${year}/${month}/member_expenses`));
  const val = snap.val() || {};
  const flat = [];
  Object.entries(val).forEach(([memberId, items]) => {
    Object.entries(items || {}).forEach(([id, exp]) => { flat.push({ id, memberId, ...exp }); });
  });
  flat.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return flat;
}
/* ============================================
   固定支出模板（補齊 v47）
   ============================================ */

export function listenFixedTemplates(callback, onError) {
  return listen('fixed_expense_templates', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, t]) => ({ id, ...t }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addFixedTemplate(tmpl) {
  const r = familyRef('fixed_expense_templates');
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

export async function updateFixedTemplate(id, patch) {
  await update(familyRef(`fixed_expense_templates/${id}`), {
    name: patch.name || '',
    amount: Number(patch.amount) || 0,
    cycle: patch.cycle || '每月',
    note: patch.note || '',
  });
}

export async function removeFixedTemplate(id) {
  await remove(familyRef(`fixed_expense_templates/${id}`));
}

/* ============================================
   資產（補齊 v47）
   ============================================ */

export function listenAssets(callback, onError) {
  return listen('assets', (snap) => callback(snap.val() || {}), onError);
}

export async function saveAssets(data) {
  await update(familyRef('assets'), { bankBalance: Number(data.bankBalance) || 0 });
}
/* ============================================
   刪除保單（含關聯支出與扣款紀錄清理）
   ============================================ */

export async function deleteInsurancePolicyAndData(policyId, memberId) {
  const familyId = AppState.getFamilyId();
  if (!familyId) throw new Error('尚未選擇家庭');

  // 1. 取得該保單的所有扣款紀錄（用於找出所有相關的年月）
  const paymentsSnap = await get(ref(db, `families/${familyId}/insurance_payments/${policyId}`));
  const payments = paymentsSnap.val() || {};

  const updates = {};

  // 2. 準備刪除所有關聯的成員支出
  for (const [year, months] of Object.entries(payments)) {
    for (const [month, data] of Object.entries(months)) {
      const expensePath = `families/${familyId}/expenses/${year}/${month}/member_expenses/${memberId}/linked_${policyId}`;
      updates[expensePath] = null;
    }
  }

  // 3. 準備刪除保險扣款紀錄本身
  updates[`families/${familyId}/insurance_payments/${policyId}`] = null;

  // 4. 準備刪除保單本身
  updates[`families/${familyId}/insurance_policies/${policyId}`] = null;

  // 5. 執行批量刪除
  await update(ref(db), updates);
}
/* ============================================
   刪除成員（含關聯支出與扣款紀錄清理）
   ============================================ */

export async function deleteMemberAndData(memberId) {
  const familyId = AppState.getFamilyId();
  if (!familyId) throw new Error('尚未選擇家庭');

  // 1. 取得該家庭所有年月，找出該成員的所有支出
  const expensesSnap = await get(ref(db, `families/${familyId}/expenses`));
  const allExpenses = expensesSnap.val() || {};

  const updates = {};

  // 2. 遍歷所有年月，刪除該成員的支出
  Object.entries(allExpenses).forEach(([year, months]) => {
    Object.entries(months || {}).forEach(([month, monthData]) => {
      const memberExpenses = monthData.member_expenses || {};
      if (memberExpenses[memberId]) {
        updates[`families/${familyId}/expenses/${year}/${month}/member_expenses/${memberId}`] = null;
      }
    });
  });

  // 3. 準備刪除成員本身
  updates[`families/${familyId}/members/${memberId}`] = null;

  // 4. 執行批量刪除
  await update(ref(db), updates);
}
/* ============================================
   刪除銀行（含所有歷史結餘清理）
   ============================================ */

export async function deleteBankAndBalances(bankId) {
  const familyId = AppState.getFamilyId();
  if (!familyId) throw new Error('尚未選擇家庭');

  // 1. 取得該銀行在所有月份的結餘紀錄
  const snap = await get(ref(db, `families/${familyId}/bank_balances`));
  const allBalances = snap.val() || {};

  const updates = {};

  // 2. 準備刪除所有月份的結餘
  Object.entries(allBalances).forEach(([year, months]) => {
    Object.entries(months || {}).forEach(([month, banks]) => {
      if (banks && banks[bankId]) {
        updates[`families/${familyId}/bank_balances/${year}/${month}/${bankId}`] = null;
      }
    });
  });

  // 3. 準備刪除銀行本身
  updates[`families/${familyId}/banks/${bankId}`] = null;

  // 4. 執行批量刪除
  await update(ref(db), updates);
}
/* ============================================
   保險公司清單
   ============================================ */

export function listenInsuranceCompanies(callback, onError) {
  return listen('insurance_companies', (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, c]) => ({ id, ...c }));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  }, onError);
}

export async function addInsuranceCompany(name) {
  const r = familyRef('insurance_companies');
  const newRef = push(r);
  await set(newRef, { name: name || '', createdAt: Date.now() });
  return newRef.key;
}
/* ============================================
   保險公司：編輯與同步
   ============================================ */

export async function updateInsuranceCompany(id, newName) {
  await update(familyRef(`insurance_companies/${id}`), { name: newName });
}

/**
 * 更新所有引用該公司名稱的保單
 */
export async function updatePolicyCompanyName(oldName, newName) {
  const familyId = AppState.getFamilyId();
  if (!familyId) throw new Error('尚未選擇家庭');

  const snap = await get(ref(db, `families/${familyId}/insurance_policies`));
  const policies = snap.val() || {};

  const updates = {};
  Object.entries(policies).forEach(([id, p]) => {
    if (p.company === oldName) {
      updates[`families/${familyId}/insurance_policies/${id}/company`] = newName;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
  return Object.keys(updates).length;
}
/* ============================================
   修正版：從上個月複製固定支出（含類別與項目）
   ============================================ */

export async function copyFixedExpensesFromPrevMonth(year, month) {
  const y = Number(year); const m = Number(month);
  let prevY = y; let prevM = m - 1;
  if (prevM < 1) { prevY = y - 1; prevM = 12; }
  const prevMonthStr = String(prevM).padStart(2, '0');

  const currentSnap = await get(familyRef(`fixed_expenses/${year}/${month}`));
  if (currentSnap.exists() && Object.keys(currentSnap.val() || {}).length > 0) return 0;

  const prevSnap = await get(familyRef(`fixed_expenses/${prevY}/${prevMonthStr}`));
  const prevVal = prevSnap.val() || {};
  const prevList = Object.entries(prevVal);
  if (prevList.length === 0) return 0;

  let count = 0;
  for (const [id, item] of prevList) {
    const newRef = push(familyRef(`fixed_expenses/${year}/${month}`));
    await set(newRef, {
      name: item.name || '',
      amount: Number(item.amount) || 0,
      cycle: item.cycle || '每月',
      note: item.note || '',
      // 🆕 關鍵修正：補上 categoryId 與 itemId
      categoryId: item.categoryId || '',
      itemId: item.itemId || '',
      status: '未付款',
      paidDate: '',
      isSkipped: false,
      createdAt: Date.now() + count,
      copiedFrom: `${prevY}-${prevMonthStr}`,
    });
    count++;
  }
  return count;
}
