// ============================================
// settings.js — 系統設定頁邏輯（含側邊欄排序）
// ============================================

import {
  ALL_MENU_ITEMS,
  DEFAULT_ORDER,
  watchSidebarOrder,
  persistSidebarOrder,
  resetSidebarOrder,
  moveOrderItem,
  sortByOrder,
} from './sidebar-order.js';
import { showToast } from './toast.js';
import { escapeHtml } from './utils.js';

let currentOrder = [...DEFAULT_ORDER];
let listEl = null;

export function initSettingsPage() {
  console.log('⚙️ 系統設定頁已載入');

  listEl = document.getElementById('sidebar-order-list');
  if (!listEl) return;

  // 監聽排序
  watchSidebarOrder((order) => {
    currentOrder = order;
    renderOrderList();
  });

  // 重置按鈕
  const resetBtn = document.getElementById('reset-sidebar-order-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('確定要重置為預設順序嗎？')) return;
      try {
        await resetSidebarOrder();
        showToast('✅ 已重置為預設順序', 'success');
      } catch (err) {
        showToast('重置失敗：' + err.message, 'error');
      }
    });
  }
}

/* ============================================
   渲染排序清單
   ============================================ */
function renderOrderList() {
  if (!listEl) return;

  const sorted = sortByOrder(ALL_MENU_ITEMS, currentOrder);

  listEl.innerHTML = `
    <div style="border:1px solid var(--glass-border); border-radius:var(--radius-md); overflow:hidden;">
      ${sorted.map((item, i) => {
        const isFirst = i === 0;
        const isLast = i === sorted.length - 1;
        return `
          <div class="sidebar-order-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:${isLast ? 'none' : '1px solid rgba(255,255,255,0.05)'};">
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="mono" style="font-size:11px; color:var(--text-muted); min-width:20px;">${i + 1}.</span>
              <i data-lucide="${item.icon}" style="width:16px;height:16px;color:var(--neon-cyan);"></i>
              <span style="font-size:14px;">${escapeHtml(item.label)}</span>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-sm btn-ghost" data-action="up" data-href="${item.href}"
                ${isFirst ? 'disabled' : ''} title="上移"
                style="padding:4px 8px; line-height:1;">
                <i data-lucide="chevron-up" style="width:14px;height:14px;"></i>
              </button>
              <button class="btn btn-sm btn-ghost" data-action="down" data-href="${item.href}"
                ${isLast ? 'disabled' : ''} title="下移"
                style="padding:4px 8px; line-height:1;">
                <i data-lucide="chevron-down" style="width:14px;height:14px;"></i>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // 綁定上下移動
  listEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const href = btn.dataset.href;
      const action = btn.dataset.action;
      await handleMove(href, action);
    });
  });
}

/* ============================================
   處理移動
   ============================================ */
async function handleMove(href, direction) {
  const newOrder = moveOrderItem(currentOrder, href, direction);
  // 若順序沒變則不儲存
  if (newOrder.join(',') === currentOrder.join(',')) return;

  try {
    await persistSidebarOrder(newOrder);
    currentOrder = newOrder;
    renderOrderList();
    showToast('✅ 已更新排序', 'success');
  } catch (err) {
    showToast('更新失敗：' + err.message, 'error');
    console.error('[settings] 排序儲存失敗：', err);
  }
}
