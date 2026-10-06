// ============================================
// collapsible-card.js — 全站共用可摺疊卡片
// ============================================

/**
 * 初始化可摺疊卡片
 *
 * HTML 結構要求：
 *   <div class="glass-card collapsible-card" id="xxx-card">
 *     <div class="collapsible-header" id="xxx-header">
 *       <div class="collapsible-header-title">
 *         <i data-lucide="plus-circle"></i>
 *         <span>標題</span>
 *       </div>
 *       <i data-lucide="chevron-down" class="collapsible-arrow"></i>
 *     </div>
 *     <div class="collapsible-body" id="xxx-body" style="display:none;">
 *       ...表單內容...
 *     </div>
 *   </div>
 *
 * @param {string} cardId - 卡片 ID
 * @param {string} storageKey - localStorage 儲存 key（記住展開狀態）
 * @param {boolean} defaultOpen - 預設是否展開
 * @returns {Object|null} 控制物件 { open, close, toggle, isOpen }
 */
export function initCollapsibleCard(cardId, storageKey, defaultOpen = false) {
  const card = document.getElementById(cardId);
  if (!card) {
    console.warn(`⚠️ initCollapsibleCard: 找不到 #${cardId}`);
    return null;
  }

  const header = card.querySelector('.collapsible-header');
  const body = card.querySelector('.collapsible-body');
  if (!header || !body) {
    console.warn(`⚠️ initCollapsibleCard: #${cardId} 缺少 .collapsible-header 或 .collapsible-body`);
    return null;
  }

  // 讀取儲存狀態
  const savedOpen = localStorage.getItem(storageKey);
  const initialOpen = savedOpen !== null ? savedOpen === 'true' : defaultOpen;
  if (initialOpen) {
    card.classList.add('open');
    body.style.display = 'block';
  } else {
    card.classList.remove('open');
    body.style.display = 'none';
  }

  // 綁定點擊
  header.addEventListener('click', () => {
    const newState = !card.classList.contains('open');
    if (newState) {
      card.classList.add('open');
      body.style.display = 'block';
    } else {
      card.classList.remove('open');
      body.style.display = 'none';
    }
    localStorage.setItem(storageKey, String(newState));
    if (window.lucide) window.lucide.createIcons();
  });

  return {
    open: () => {
      card.classList.add('open');
      body.style.display = 'block';
      localStorage.setItem(storageKey, 'true');
      if (window.lucide) window.lucide.createIcons();
    },
    close: () => {
      card.classList.remove('open');
      body.style.display = 'none';
      localStorage.setItem(storageKey, 'false');
      if (window.lucide) window.lucide.createIcons();
    },
    toggle: () => {
      if (card.classList.contains('open')) {
        card.classList.remove('open');
        body.style.display = 'none';
        localStorage.setItem(storageKey, 'false');
      } else {
        card.classList.add('open');
        body.style.display = 'block';
        localStorage.setItem(storageKey, 'true');
      }
      if (window.lucide) window.lucide.createIcons();
    },
    isOpen: () => card.classList.contains('open'),
  };
}

/**
 * 為多個卡片批次初始化
 * @param {Array} configs - [{ cardId, storageKey, defaultOpen }, ...]
 */
export function initCollapsibleCards(configs = []) {
  return configs.map((cfg) => initCollapsibleCard(cfg.cardId, cfg.storageKey, cfg.defaultOpen || false));
}
