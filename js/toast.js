// ============================================
// toast.js — 全站共用 Toast 提示
// ============================================

const COLORS = {
  success: 'rgba(16, 185, 129, 0.95)',
  error:   'rgba(244, 63, 94, 0.95)',
  info:    'rgba(0, 240, 255, 0.95)',
  warning: 'rgba(251, 146, 60, 0.95)',
};

/**
 * 顯示 Toast 提示
 *
 * @param {string} msg - 訊息內容
 * @param {string} type - 類型：'success' | 'error' | 'info' | 'warning'
 * @param {number} duration - 顯示時間（毫秒）
 */
export function showToast(msg, type = 'success', duration = 2000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
  }

  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: ${COLORS[type] || COLORS.success};
    color: #fff;
    padding: 12px 22px;
    border-radius: 8px;
    font-size: 14px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    z-index: 99999;
    opacity: 0;
    transition: opacity 0.3s;
    max-width: 90%;
    text-align: center;
    pointer-events: none;
  `;

  toast.textContent = msg;

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
  }, duration);
}

/** 便捷方法 */
export const toastSuccess = (msg, duration) => showToast(msg, 'success', duration);
export const toastError   = (msg, duration) => showToast(msg, 'error', duration);
export const toastInfo    = (msg, duration) => showToast(msg, 'info', duration);
export const toastWarning = (msg, duration) => showToast(msg, 'warning', duration);
