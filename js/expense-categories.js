// ============================================
// expense-categories.js — 基礎資料管理庫邏輯
// ============================================

import {
  listenCategories, addCategory, updateCategory, removeCategory,
  listenItems, addItem, updateItem, removeItem,
  listenPaymentMethods, addPaymentMethod, updatePaymentMethod, removePaymentMethod,
} from './db.js';
import { escapeHtml } from './utils.js';
import { createInputForm } from './input-form.js';
import { initCollapsibleCard } from './collapsible-card.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

let categories = [];
let items = [];
let payments = [];
let editingCategoryId = null;
let editingItemId = null;
let editingPaymentId = null;
let catForm = null;
let itemForm = null;
let payForm = null;

export function initExpenseCategoriesPage() {
  /* ========== 🆕 v99.5：表格區塊折疊（預設展開） ========== */
  initCollapsibleCard('cat-table-card', 'cat-table-open', true);
  initCollapsibleCard('item-table-card', 'item-table-open', true);
  initCollapsibleCard('payment-table-card', 'payment-table-open', true);

  /* ========== 類別 ========== */
  const catTbody = document.getElementById('category-tbody');
  const catModalTitle = document.getElementById('category-modal-title');
  const catEditForm = document.getElementById('category-form');
  const catName = document.getElementById('category-name');
  const catOrder = document.getElementById('category-order');

  catForm = createInputForm({
    containerId: 'category-input-root',
    storageKey: 'cat-input-open',
    title: '新增類別',
    icon: 'plus-circle',
    fields: [
      { type: 'text', id: 'inp-cat-name', label: '類別名稱', required: true, placeholder: '例如：醫療類', maxlength: 20 },
      { type: 'number', id: 'inp-cat-order', label: '排序（數字越小越前）', min: 0, placeholder: '例如：1' },
    ],
    submitText: '新增類別',
    onSubmit: async (data) => {
      const name = (data['inp-cat-name'] || '').trim();
      if (!name) return;
      await addCategory({ name, order: Number(data['inp-cat-order']) || 0 });
      showToast(`✅ 已新增類別「${name}」`, 'success');
      catForm.reset();
      catForm.close();
    },
  });

  listenCategories((list) => {
    categories = list;
    renderCategoryTable();
    renderCategorySelects();
  });

  document.getElementById('category-cancel-btn').addEventListener('click', () => closeModal('category-modal'));

  catEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { name: catName.value.trim(), order: Number(catOrder.value) || 0 };
    if (!payload.name) return;
    if (editingCategoryId) {
      await updateCategory(editingCategoryId, payload);
      showToast('✅ 已更新類別', 'success');
    }
    closeModal('category-modal');
  });

  catTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const c = categories.find((x) => x.id === id);
    if (!c) return;

    if (action === 'edit') {
      editingCategoryId = id;
      catModalTitle.textContent = '編輯類別';
      catName.value = c.name;
      catOrder.value = c.order || 0;
      openModal('category-modal');
      setTimeout(() => catName.focus(), 50);
    } else if (action === 'delete') {
      const used = items.filter((i) => i.categoryId === id);
      if (used.length > 0) {
        alert(`無法刪除：此類別下還有 ${used.length} 個項目，請先刪除或搬移。`);
        return;
      }
      if (confirm(`確定要刪除類別「${c.name}」嗎？`)) {
        await removeCategory(id);
        showToast('✅ 已刪除類別', 'success');
      }
    }
  });

  /* ========== 項目 ========== */
  const itemTbody = document.getElementById('item-tbody');
  const itemModalTitle = document.getElementById('item-modal-title');
  const itemEditForm = document.getElementById('item-form');
  const itemCategory = document.getElementById('item-category');
  const itemName = document.getElementById('item-name');
  const filterCategory = document.getElementById('filter-category');

  // 防止點擊 filter-category 時觸發折疊
  filterCategory.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  itemForm = createInputForm({
    containerId: 'item-input-root',
    storageKey: 'item-input-open',
    title: '新增項目',
    icon: 'plus-circle',
    fields: [
      { type: 'select', id: 'inp-item-cat', label: '所屬類別', required: true, includeEmpty: true, emptyText: '— 請選擇 —' },
      { type: 'text', id: 'inp-item-name', label: '項目名稱', required: true, placeholder: '例如：看病-濕疹', maxlength: 30 },
    ],
    submitText: '新增項目',
    onSubmit: async (data) => {
      const name = (data['inp-item-name'] || '').trim();
      const categoryId = data['inp-item-cat'];
      if (!name || !categoryId) return;
      await addItem({ name, categoryId });
      showToast(`✅ 已新增項目「${name}」`, 'success');
      itemForm.reset();
      itemForm.close();
    },
  });

  listenItems((list) => {
    items = list;
    renderItemTable();
  });

  filterCategory.addEventListener('change', renderItemTable);

  document.getElementById('item-cancel-btn').addEventListener('click', () => closeModal('item-modal'));

  itemEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { name: itemName.value.trim(), categoryId: itemCategory.value };
    if (!payload.name || !payload.categoryId) return;
    if (editingItemId) {
      await updateItem(editingItemId, payload);
      showToast('✅ 已更新項目', 'success');
    }
    closeModal('item-modal');
  });

  itemTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const it = items.find((x) => x.id === id);
    if (!it) return;

    if (action === 'edit') {
      editingItemId = id;
      itemModalTitle.textContent = '編輯項目';
      itemCategory.value = it.categoryId || '';
      itemName.value = it.name || '';
      openModal('item-modal');
      setTimeout(() => itemName.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除項目「${it.name}」嗎？`)) {
        await removeItem(id);
        showToast('✅ 已刪除項目', 'success');
      }
    }
  });

  /* ========== 支付方式 ========== */
  const payTbody = document.getElementById('payment-tbody');
  const payModalTitle = document.getElementById('payment-modal-title');
  const payEditForm = document.getElementById('payment-form');
  const payName = document.getElementById('payment-name');
  const payOrder = document.getElementById('payment-order');

  payForm = createInputForm({
    containerId: 'payment-input-root',
    storageKey: 'pay-input-open',
    title: '新增支付方式',
    icon: 'plus-circle',
    fields: [
      { type: 'text', id: 'inp-pay-name', label: '支付方式名稱', required: true, placeholder: '例如：現金', maxlength: 20 },
      { type: 'number', id: 'inp-pay-order', label: '排序（數字越小越前）', min: 0, placeholder: '例如：1' },
    ],
    submitText: '新增支付方式',
    onSubmit: async (data) => {
      const name = (data['inp-pay-name'] || '').trim();
      if (!name) return;
      await addPaymentMethod({ name, order: Number(data['inp-pay-order']) || 0 });
      showToast(`✅ 已新增支付方式「${name}」`, 'success');
      payForm.reset();
      payForm.close();
    },
  });

  listenPaymentMethods((list) => {
    payments = list;
    renderPaymentTable();
  });

  document.getElementById('payment-cancel-btn').addEventListener('click', () => closeModal('payment-modal'));

  payEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { name: payName.value.trim(), order: Number(payOrder.value) || 0 };
    if (!payload.name) return;
    if (editingPaymentId) {
      await updatePaymentMethod(editingPaymentId, payload);
      showToast('✅ 已更新支付方式', 'success');
    }
    closeModal('payment-modal');
  });

  payTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const p = payments.find((x) => x.id === id);
    if (!p) return;

    if (action === 'edit') {
      editingPaymentId = id;
      payModalTitle.textContent = '編輯支付方式';
      payName.value = p.name;
      payOrder.value = p.order || 0;
      openModal('payment-modal');
      setTimeout(() => payName.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除支付方式「${p.name}」嗎？\n\n已使用此支付方式的支出紀錄將不會被刪除，但會顯示為「（已刪除）」。`)) {
        await removePaymentMethod(id);
        showToast('✅ 已刪除支付方式', 'success');
      }
    }
  });

  /* ========== 渲染 ========== */

  function renderCategoryTable() {
    if (!categories.length) {
      catTbody.innerHTML = `<tr><td colspan="3" class="empty-state">尚無類別</td></tr>`;
      return;
    }
    catTbody.innerHTML = categories.map((c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td class="num">${c.order || 0}</td>
        <td>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${c.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${c.id}">刪除</button>
        </td>
      </tr>
    `).join('');
    refreshIcons();
  }

  function renderItemTable() {
    const filter = filterCategory.value;
    const list = filter ? items.filter((i) => i.categoryId === filter) : items;

    if (!list.length) {
      itemTbody.innerHTML = `<tr><td colspan="3" class="empty-state">尚無項目</td></tr>`;
      return;
    }
    itemTbody.innerHTML = list.map((it) => {
      const cat = categories.find((c) => c.id === it.categoryId);
      const catName = cat ? cat.name : '（未分類）';
      return `
        <tr>
          <td>${escapeHtml(it.name)}</td>
          <td><span class="badge badge-info">${escapeHtml(catName)}</span></td>
          <td>
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${it.id}">編輯</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${it.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('');
    refreshIcons();
  }

  function renderPaymentTable() {
    if (!payments.length) {
      payTbody.innerHTML = `<tr><td colspan="3" class="empty-state">尚無支付方式</td></tr>`;
      return;
    }
    payTbody.innerHTML = payments.map((p) => `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td class="num">${p.order || 0}</td>
        <td>
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}">編輯</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${p.id}">刪除</button>
        </td>
      </tr>
    `).join('');
    refreshIcons();
  }

  function renderCategorySelects() {
    const currentFilter = filterCategory.value;
    filterCategory.innerHTML = `<option value="">全部分類</option>` +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (currentFilter) filterCategory.value = currentFilter;

    const currentItemCat = itemCategory.value;
    itemCategory.innerHTML = `<option value="">— 請選擇 —</option>` +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (currentItemCat) itemCategory.value = currentItemCat;

    if (itemForm) {
      itemForm.updateOptions('inp-item-cat', categories.map((c) => ({ value: c.id, label: c.name })), {
        includeEmpty: true, emptyText: '— 請選擇 —',
      });
    }
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
