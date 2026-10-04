// ============================================
// auth-guard.js — 路由守衛（多家庭版）
// ============================================

import { watchAuth, isSuperAdmin } from './auth.js';
import { AppState } from './state.js';

/**
 * 確認使用者已登入，並設定 AppState
 * @param {Object} options
 * @param {boolean} options.requireFamily - 是否必須選擇家庭（admin 頁面設 false）
 */
export function requireLogin({ requireFamily = true } = {}) {
  return new Promise((resolve) => {
    watchAuth((user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      AppState.setUser(user);
      const superAdmin = isSuperAdmin(user);
      AppState.setSuperAdmin(superAdmin);

      if (superAdmin) {
        // superadmin 若未選擇家庭，且當前頁面需要家庭，導向 admin.html
        if (requireFamily && !AppState.getFamilyId()) {
          window.location.href = 'admin.html';
          return;
        }
      } else {
        // 一般家庭帳號：自動設定 familyId = uid
        if (!AppState.getFamilyId() || AppState.getFamilyId() !== user.uid) {
          AppState.setFamily(user.uid, '我的家庭');
        }
      }

      resolve(user);
    });
  });
}
