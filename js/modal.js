// ============================================
// modal.js — 全站共用 Modal 開關
// ============================================

/**
 * 開啟 Modal
 * @param {string|HTMLElement} target - Modal 元素 ID 或元素本身
 */
export function openModal(target) {
  const modal = resolveElement(target);
  if (!modal) return;
  modal.classList.add('active');
  // 防止背景滾動
  document.body.style.overflow = 'hidden';
}

/**
 * 關閉 Modal
 * @param {string|HTMLElement} target
 */
export function closeModal(target) {
  const modal = resolveElement(target);
  if (!modal) return;
  modal.classList.remove('active');
  // 若無其他 Modal 開啟，恢復滾動
  if (document.querySelectorAll('.modal-overlay.active').length === 0) {
    document.body.style.overflow = '';
  }
}

/**
 * 關閉所有開啟的 Modal
 */
export function closeAllModals() {
  document.querySelectorAll('.modal-overlay.active').forEach((m) => {
    m.classList.remove('active');
  });
  document.body.style.overflow = '';
}

/**
 * 綁定 Modal 內的「取消」按鈕
 * @param {string} modalId
 * @param {string} cancelBtnId
 */
export function bindModalCancel(modalId, cancelBtnId) {
  const btn = document.getElementById(cancelBtnId);
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(modalId);
  });
}

/**
 * 綁定點擊 overlay 背景關閉 Modal
 * @param {string} modalId
 */
export function bindModalBackdropClose(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modalId);
  });
}

/**
 * 綁定 ESC 鍵關閉最上層 Modal
 */
export function bindModalEscClose() {
  if (window._modalEscBound) return;
  window._modalEscBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const actives = document.querySelectorAll('.modal-overlay.active');
    if (actives.length === 0) return;
    const last = actives[actives.length - 1];
    last.classList.remove('active');
    if (document.querySelectorAll('.modal-overlay.active').length === 0) {
      document.body.style.overflow = '';
    }
  });
}

/* ============================================
   內部工具
   ============================================ */
function resolveElement(target) {
  if (typeof target === 'string') return document.getElementById(target);
  if (target instanceof HTMLElement) return target;
  return null;
}
