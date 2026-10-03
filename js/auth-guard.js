// ============================================
// auth-guard.js — 未登入者自動踢回登入頁
// ============================================

import { watchAuth } from './auth.js';

export function requireLogin() {
  return new Promise((resolve) => {
    watchAuth((user) => {
      if (!user) {
        window.location.href = 'login.html';
      } else {
        resolve(user);
      }
    });
  });
}
