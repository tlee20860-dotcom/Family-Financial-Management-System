// ============================================
// expense-categories.js — 支出類別與項目管理邏輯
// ============================================

import {
  listenCategories, addCategory, updateCategory, removeCategory,
  listenItems, addItem, updateItem, removeItem,
} from './db.js';
import { escapeHtml } from './utils.js';

let categories = [];
let items = [];
let editingCategoryId = null;
let editingItemId = null;

export function initExpenseCategoriesPage() {
  /* ---------- 類別 ---------- */
  const catTbody = document.getElementById('category-tbody');
  const catModal = document.getElementById('category-modal');
  const catModalTitle = document.getElementById('category-modal-title');
  const catForm = document.getElementById('category-form');
  const catName = document.getElementById('category-name');
  const catOrder = document.getElementById('category-order');

  listenCategories((list) => {
    categories = list;
    renderCategoryTable();
    renderCategorySelects();
  });

  document.getElementById('add-category-btn').addEventListener('click', () => {
    editingCategoryId = null;
    catModalTitle.textContent = '新增類別';
    catForm.reset();
    catModal.classList.add('active');
    setTimeout(() => catName.focus(), 50);
  });

  document.getElementById('category-cancel-btn').addEventListener('click', () => {
    catModal.classList.remove('active');
  });

  catForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: catName.value.trim(),
      order: Number(catOrder.value) || 0,
    };
    if (!payload.name) return;

    if (editingCategoryId) {
      await updateCategory(editingCategoryId, payload);
    } else {
      await addCategory(payload);
    }
    catModal.classList.remove('active');
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
      catModal.classList.add('active');
      setTimeout(() => catName.focus(), 50);
    } else if (action === 'delete') {
      // 檢查是否還有項目使用此類別
      const used = items.filter((i) => i.categoryId === id);
      if (used.length > 0) {
        alert(`無法刪除：此類別下還有 ${used.length} 個項目，請先刪除或搬移。`);
        return;
      }
      if (confirm(`確定要刪除類別「${c.name}」嗎？`)) {
        await removeCategory(id);
      }
    }
  });

  /* ---------- 項目 ---------- */
  const itemTbody = document.getElementById('item-tbody');
  const itemModal = document.getElementById('item-modal');
  const itemModalTitle = document.getElementById('item-modal-title');
  const itemForm = document.getElementById('item-form');
  const itemCategory = document.getElementById('item-category');
  const itemName = document.getElementById('item-name');
  const filterCategory = document.getElementById('filter-category');

  listenItems((list) => {
    items = list;
    renderItemTable();
  });

  filterCategory.addEventListener('change', renderItemTable);

  document.getElementById('add-item-btn').addEventListener('click', () => {
    editingItemId = null;
    itemModalTitle.textContent = '新增項目';
    itemForm.reset();
    // 若目前有篩選類別，預設選中
    if (filterCategory.value) itemCategory.value = filterCategory.value;
    itemModal.classList.add('active');
    setTimeout(() => itemName.focus(), 50);
  });

  document.getElementById('item-cancel-btn').addEventListener('click', () => {
    itemModal.classList.remove('active');
  });

  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: itemName.value.trim(),
      categoryId: itemCategory.value,
    };
    if (!payload.name || !payload.categoryId) return;

    if (editingItemId) {
      await updateItem(editingItemId, payload);
    } else {
      await addItem(payload);
    }
    itemModal.classList.remove('active');
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
      itemModal.classList.add('active');
      setTimeout(() => itemName.focus(), 50);
    } else if (action === 'delete') {
      if (confirm(`確定要刪除項目「${it.name}」嗎？`)) {
        await removeItem(id);
      }
    }
  });

  /* ---------- 渲染函式 ---------- */
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

  function renderCategorySelects() {
    // 篩選下拉
    const currentFilter = filterCategory.value;
    filterCategory.innerHTML = `<option value="">全部分類</option>` +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (currentFilter) filterCategory.value = currentFilter;

    // 項目 Modal 下拉
    const currentItemCat = itemCategory.value;
    itemCategory.innerHTML = `<option value="">— 請選擇 —</option>` +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (currentItemCat) itemCategory.value = currentItemCat;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
}
