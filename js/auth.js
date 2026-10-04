// ============================================
// auth.js — 自訂帳號登入 / 登出 封裝（多家庭版）
// ============================================

import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const DOMAIN = '@familyfin.local';
const SUPERADMIN_EMAIL = `superadmin${DOMAIN}`;

function toEmail(account) {
  if (!account) return '';
  return account.includes('@') ? account : `${account}${DOMAIN}`;
}

function toAccount(email) {
  if (!email) return '';
  return email.replace(DOMAIN, '');
}

export async function loginWithCustomAccount(account, password) {
  const email = toEmail(account);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
  localStorage.removeItem('fin_family_id');
  localStorage.removeItem('fin_family_name');
  window.location.href = 'login.html';
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getDisplayName(user) {
  return user ? toAccount(user.email) : '';
}

export function isSuperAdmin(user) {
  return !!user && user.email === SUPERADMIN_EMAIL;
}

export { toAccount, toEmail, SUPERADMIN_EMAIL, DOMAIN };
