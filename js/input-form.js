// ============================================
// input-form.js — 全站共用可摺疊輸入表單
// ============================================
// 用法：
//   const form = createInputForm({
//     containerId: 'xxx-input-root',
//     storageKey: 'xxx-input-open',
//     title: '新增 XXX',
//     icon: 'plus-circle',
//     fields: [
//       { type: 'select', id: 'xxx-year', label: '年份', options: [...] },
//       { type: 'number', id: 'xxx-amount', label: '金額', required: true },
//     ],
//     submitText: '儲存',
//     onSubmit: async (data) => { ... },
//   });
//   form.open(); form.close(); form.reset();
// ============================================

import { escapeHtml } from './utils.js';

const DEFAULT_ICON = 'plus-circle';

/**
 * 建立可摺疊輸入表單
 * @param {Object} options
 * @param {string} options.containerId - 容器 ID（HTML 只需放一個空 div）
 * @param {string} options.storageKey - localStorage key（記住展開狀態）
 * @param {string} options.title - 表單標題
 * @param {string} [options.icon] - Lucide icon 名稱
 * @param {Array} options.fields - 欄位定義陣列
 * @param {string} [options.submitText] - 送出按鈕文字
 * @param {string} [options.resetText] - 重置按鈕文字
 * @param {boolean} [options.defaultOpen] - 預設是否展開
 * @param {Function} options.onSubmit - 送出回呼 (data, form) => Promise
 * @param {Function} [options.onReset] - 重置回呼
 * @param {Function} [options.beforeSubmit] - 送出前驗證 (data) => bool | string
 */
export function createInputForm(options) {
  const {
    containerId,
    storageKey,
    title,
    icon = DEFAULT_ICON,
    fields = [],
    submitText = '儲存',
    resetText = '重置',
    defaultOpen = false,
    onSubmit,
    onReset,
    beforeSubmit,
  } = options;

  const root = document.getElementById(containerId);
  if (!root) {
    console.warn(`⚠️ createInputForm: 找不到容器 #${containerId}`);
    return null;
  }

  // 產生欄位 HTML
  const fieldsHtml = fields.map((f) => renderField(f)).join('');

  root.innerHTML = `
    <div class="glass-card collapsible-card" id="${containerId}-card">
      <div class="collapsible-header" id="${containerId}-header">
        <div class="collapsible-header-title">
          <i data-lucide="${icon}" style="width:16px;height:16px;"></i>
          <span>${escapeHtml(title)}</span>
        </div>
        <i data-lucide="chevron-down" class="collapsible-arrow"></i>
      </div>
      <div class="collapsible-body" id="${containerId}-body" style="display:none;">
        <form id="${containerId}-form">
          <div class="form-stack">
            ${fieldsHtml}
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-ghost" id="${containerId}-reset">${escapeHtml(resetText)}</button>
            <button type="submit" class="btn btn-primary" id="${containerId}-submit">
              <i data-lucide="check"></i> ${escapeHtml(submitText)}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const card = document.getElementById(`${containerId}-card`);
  const header = document.getElementById(`${containerId}-header`);
  const body = document.getElementById(`${containerId}-body`);
  const form = document.getElementById(`${containerId}-form`);
  const resetBtn = document.getElementById(`${containerId}-reset`);

  // 初始化展開狀態
  const savedOpen = localStorage.getItem(storageKey);
  const initialOpen = savedOpen !== null ? savedOpen === 'true' : defaultOpen;
  if (initialOpen) {
    card.classList.add('open');
    body.style.display = 'block';
  }

  // 綁定展開/收起
  header.addEventListener('click', () => {
    const isOpen = card.classList.toggle('open');
    body.style.display = isOpen ? 'block' : 'none';
    localStorage.setItem(storageKey, String(isOpen));
    if (window.lucide) window.lucide.createIcons();
  });

  // 送出
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 驗證必填
    const requiredFields = fields.filter((f) => f.required);
    for (const f of requiredFields) {
      const el = document.getElementById(f.id);
      if (!el) continue;
      const val = el.value;
      if (val === '' || val == null) {
        alert(`請填寫「${f.label}」`);
        el.focus();
        return;
      }
    }

    // 收集資料
    const data = collectData(fields);

    // 自訂驗證
    if (typeof beforeSubmit === 'function') {
      const result = beforeSubmit(data);
      if (result === false) return;
      if (typeof result === 'string') { alert(result); return; }
    }

    // 送出
    try {
      await onSubmit(data, api);
    } catch (err) {
      console.error('[input-form] 送出失敗：', err);
      if (window.showToast) {
        window.showToast('送出失敗：' + err.message, 'error');
      } else {
        alert('送出失敗：' + err.message);
      }
    }
  });

  // 重置
  resetBtn.addEventListener('click', () => {
    form.reset();
    if (typeof onReset === 'function') onReset();
  });

  if (window.lucide) window.lucide.createIcons();

  /* ============================================
     對外 API
     ============================================ */
  const api = {
    root,
    card,
    header,
    body,
    form,

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
      if (card.classList.contains('open')) api.close();
      else api.open();
    },

    isOpen: () => card.classList.contains('open'),

    reset: () => {
      form.reset();
      if (typeof onReset === 'function') onReset();
    },

    /** 取得目前欄位值（物件） */
    getData: () => collectData(fields),

    /** 設定欄位值（物件） */
    setData: (data) => {
      Object.entries(data).forEach(([key, val]) => {
        const el = document.getElementById(key);
        if (el) el.value = val ?? '';
      });
    },

    /** 動態更新某個 select 的選項 */
    updateOptions: (fieldId, options, config = {}) => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      const { includeEmpty = true, emptyText = '— 請選擇 —' } = config;
      const cur = el.value;
      let html = includeEmpty ? `<option value="">${escapeHtml(emptyText)}</option>` : '';
      html += options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
      el.innerHTML = html;
      if (cur && options.some((o) => String(o.value) === cur)) el.value = cur;
    },

    /** 綁定欄位變更（如類別改變時更新項目） */
    onFieldChange: (fieldId, callback) => {
      const el = document.getElementById(fieldId);
      if (el) el.addEventListener('change', callback);
    },

    /** 取得欄位元素 */
    getFieldEl: (fieldId) => document.getElementById(fieldId),
  };

  return api;
}

/* ============================================
   內部函式
   ============================================ */

function renderField(f) {
  const {
    type,
    id,
    label,
    required = false,
    placeholder = '',
    options = [],
    min,
    max,
    step,
    disabled = false,
    extraBtn,      // { icon, title, onClick }
    layout,        // 'full'（預設）| 'half'（與下個欄位合併為 2 欄）
    hint,
  } = f;

  let inputHtml = '';

  if (type === 'select') {
    let opts = '';
    if (f.includeEmpty !== false) {
      opts += `<option value="">${escapeHtml(f.emptyText || '— 請選擇 —')}</option>`;
    }
    opts += options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
    inputHtml = `<select class="select" id="${id}" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''}>${opts}</select>`;
  } else if (type === 'number') {
    const attrs = [
      min != null ? `min="${min}"` : '',
      max != null ? `max="${max}"` : '',
      step != null ? `step="${step}"` : 'step="1"',
    ].filter(Boolean).join(' ');
    inputHtml = `<input class="input mono" id="${id}" type="number" ${attrs} ${required ? 'required' : ''} ${disabled ? 'disabled' : ''} placeholder="${escapeHtml(placeholder)}">`;
  } else if (type === 'text') {
    inputHtml = `<input class="input" id="${id}" type="text" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''} placeholder="${escapeHtml(placeholder)}" maxlength="${f.maxlength || 60}">`;
  } else if (type === 'textarea') {
    inputHtml = `<textarea class="input" id="${id}" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''} placeholder="${escapeHtml(placeholder)}" maxlength="${f.maxlength || 200}" rows="${f.rows || 3}"></textarea>`;
  } else if (type === 'checkbox') {
    return `
      <div class="field" style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="${id}" style="width:auto; cursor:pointer;" ${disabled ? 'disabled' : ''}>
        <label for="${id}" style="font-size:13px; color:var(--text-secondary); cursor:pointer;">${escapeHtml(label)}</label>
      </div>
    `;
  } else if (type === 'custom') {
    // 自訂 HTML（f.html 由使用者提供）
    return `<div class="field">${f.html || ''}</div>`;
  }

  // 有 extraBtn → 用 flex 包裝
  const inputWrapper = extraBtn
    ? `<div style="display:flex; gap:8px;">
         <div style="flex:1;">${inputHtml}</div>
         <button type="button" class="btn btn-sm btn-ghost" id="${id}-extra-btn" style="padding:0 12px;" title="${escapeHtml(extraBtn.title || '')}">
           <i data-lucide="${extraBtn.icon || 'plus'}" style="width:16px;height:16px;"></i>
         </button>
       </div>`
    : inputHtml;

  const hintHtml = hint ? `<div class="glass-card-hint" style="margin-top:4px;">${escapeHtml(hint)}</div>` : '';

  return `
    <div class="field" data-layout="${layout || 'full'}">
      <label class="field-label" for="${id}">${escapeHtml(label)}${required ? ' *' : ''}</label>
      ${inputWrapper}
      ${hintHtml}
    </div>
  `;
}

function collectData(fields) {
  const data = {};
  fields.forEach((f) => {
    const el = document.getElementById(f.id);
    if (!el) return;

    if (f.type === 'checkbox') {
      data[f.id] = el.checked;
    } else if (f.type === 'number') {
      const num = Number(el.value);
      data[f.id] = isNaN(num) ? 0 : num;
    } else {
      data[f.id] = el.value;
    }
  });
  return data;
}

/* ============================================
   初始化額外按鈕（須在 createInputForm 呼叫後）
   ============================================ */
export function bindExtraButtons(formConfig) {
  formConfig.fields.forEach((f) => {
    if (!f.extraBtn) return;
    const btn = document.getElementById(`${f.id}-extra-btn`);
    if (btn && typeof f.extraBtn.onClick === 'function') {
      btn.addEventListener('click', f.extraBtn.onClick);
    }
  });
}
