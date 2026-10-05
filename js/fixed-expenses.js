// ============================================
// fixed-expenses.js — 家庭固定支出
// 方案 A：模板 > 年份 > 月份 三層折疊
// 年份清單即時同步 Firebase（無 localStorage）
// ============================================

import {
  listenFixedTemplates, addFixedTemplate,
  deleteFixedTemplateAndMonths,
  addFixedExpenseV2, updateFixedExpenseV2,
  getFixedExpensesOnce,
  listenCategories, listenItems, addItem,
  listenMembers,
  listenFixedExpenseYears, addFixedExpenseYear,
  removeFixedExpenseYear, removeAllFixedExpenseYears,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let templates = [];
let categories = [];
let items = [];
let members = [];

// 已新增年份：{ [templateId]: [year, ...] }，由 Firebase 監聽即時更新
let yearStore = {};

// 資料快取：yearlyData[yearNumber][monthStr] = [expense, ...]
const yearlyData = {};
const loadedYears = new Set();      // Set<number>

// 展開狀態
const expandedTemplates = new Set();          // Set<templateId>
const expandedYears = new Set();              // Set<`${templateId}|${yearNumber}`>

/** 安全取得當前年份（強制數字） */
function getCurrentYear() {
  const y = Number(AppState.year);
  return Number.isFinite(y) && y > 2000 ? y : new Date().getFullYear();
}

/** 取得某模板已新增的年份（從記憶體快取，由 Firebase 監聽填充） */
function getAddedYears(templateId) {
  return yearStore[templateId] || [];
}

/* ============ 初始化 ============ */
export function initFixedExpensesPage() {
  const container = document.getElementById('fixed-templates-container');
  const modal = document.getElementById('fixed-modal');
  const form = document.getElementById('fixed-form');
  const memberSel = document.getElementById('fixed-member');
  const categorySel = document.getElementById('fixed-category');
  const itemSel = document.getElementById('fixed-item');
  const cycleSelect = document.getElementById('fixed-cycle');
  const amountInput = document.getElementById('fixed-amount');
  const noteInput = document.getElementById('fixed-note');
  const addItemBtn = document.getElementById('add-fixed-item-btn');
  const yearSel = document.getElementById('fixed-year');

  // 初始化年份下拉（前後 5 年）
  const nowY = new Date().getFullYear();
  let yearOpts = '';
  for (let y = nowY - 5; y <= nowY + 5; y++) {
    yearOpts += `<option value="${y}">${y} 年</option>`;
  }
  yearSel.innerHTML = yearOpts;
  yearSel.value = getCurrentYear();

  listenMembers((list) => {
    members = list;
    const current = memberSel.value;
    memberSel.innerHTML = `<option value="shared">家庭共用支出</option>` +
      members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (current) memberSel.value = current;
    render();
  });

  listenCategories((cats) => { categories = cats; renderCategoryOptions(); });
  listenItems((list) => { items = list; renderItemOptions(); });

  categorySel.addEventListener('change', renderItemOptions);

  addItemBtn.addEventListener('click', async () => {
    const catId = categorySel.value;
    if (!catId) return alert('請先選擇一個類別，再新增項目。');
    const name = prompt('請輸入新項目名稱（例如：水費）：');
    if (!name || !name.trim()) return;
    try {
      await addItem({ name: name.trim(), categoryId: catId });
      setTimeout(() => {
        const newItem = items.find((i) => i.name === name.trim() && i.categoryId === catId);
        if (newItem) itemSel.value = newItem.id;
      }, 500);
    } catch (err) { alert('新增項目失敗：' + err.message); }
  });

  // 模板清單監聽
  listenFixedTemplates(async (list) => {
    templates = list;
    await loadAllAddedYears();
    render();
  });

  // 年份清單監聽（即時同步 Firebase）
  listenFixedExpenseYears(async (store) => {
    yearStore = store || {};
    await loadAllAddedYears();
    render();
  });

  // 年份切換：只更新表單預設值
  AppState.on('ym-change', () => {
    yearSel.value = getCurrentYear();
    render();
  });

  document.getElementById('add-fixed-btn').addEventListener('click', () => {
    form.reset();
    memberSel.value = 'shared';
    categorySel.value = '';
    itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
    yearSel.value = getCurrentYear();
    modal.classList.add('active');
  });

  document.getElementById('fixed-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  /* ============ 新增固定支出 ============ */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const memberId = memberSel.value;
    const catId = categorySel.value;
    const itemId = itemSel.value;
    const itemName = items.find((i) => i.id === itemId)?.name || '';
    const amount = Number(amountInput.value) || 0;
    const cycle = cycleSelect.value;
    const note = noteInput.value.trim();
    const targetYear = Number(yearSel.value);

    if (!itemName || !amount || !Number.isFinite(targetYear)) return;

    // 1. 寫入模板（取得新 ID）
    const newTemplateId = await addFixedTemplate({
      name: itemName, categoryId: catId, itemId: itemId,
      amount: amount, cycle: cycle, note: note,
      memberId: memberId,
    });

    // 2. 分配到該年份的 12 個月
    const targetMonths = getMonthsByCycle(cycle);
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const isTarget = targetMonths.includes(m);
      promises.push(addFixedExpenseV2(targetYear, monthStr, {
        name: itemName, amount: isTarget ? amount : 0,
        cycle: cycle, note: note,
        categoryId: catId, itemId: itemId,
        memberId: memberId,
        isSkipped: !isTarget,
      }));
    }
    await Promise.all(promises);

    // 3. 登記年份（寫入 Firebase）
    await addFixedExpenseYear(newTemplateId, targetYear);

    // 4. 展開該模板的該年份
    expandedTemplates.add(newTemplateId);
    expandedYears.add(`${newTemplateId}|${targetYear}`);

    // 5. 重新載入並渲染
    invalidateYear(targetYear);
    await loadYear(targetYear);
    render();

    modal.classList.remove('active');
    showToast(`✅ 已新增「${itemName}」至 ${targetYear} 年，分配到 ${targetMonths.length} 個月份`);
  });

  /* ============ 點擊事件委派 ============ */
  container.addEventListener('click', async (e) => {
    // 1) 刪除模板
    const deleteBtn = e.target.closest('button[data-action="delete-template"]');
    if (deleteBtn) {
      e.stopPropagation();
      const templateId = deleteBtn.dataset.id;
      const templateName = deleteBtn.dataset.name;
      if (confirm(`⚠️ 確定要刪除「${templateName}」嗎？\n\n這將會刪除該支出在所有年份的紀錄，此操作無法復原。`)) {
        try {
          await deleteFixedTemplateAndMonths(templateId, templateName);
          await removeAllFixedExpenseYears(templateId);
          expandedTemplates.delete(templateId);
          for (const key of [...expandedYears]) {
            if (key.startsWith(`${templateId}|`)) expandedYears.delete(key);
          }
          delete yearStore[templateId];
          alert('✅ 已徹底刪除');
        } catch (err) {
          alert('刪除失敗：' + err.message);
        }
      }
      return;
    }

    // 2) 切換模板展開
    const toggleTemplate = e.target.closest('[data-action="toggle-template"]');
    if (toggleTemplate) {
      const id = toggleTemplate.dataset.id;
      if (expandedTemplates.has(id)) expandedTemplates.delete(id);
      else expandedTemplates.add(id);
      render();
      return;
    }

    // 3) 切換年份展開
    const toggleYear = e.target.closest('[data-action="toggle-year"]');
    if (toggleYear) {
      const tId = toggleYear.dataset.templateId;
      const year = Number(toggleYear.dataset.year);
      const key = `${tId}|${year}`;

      if (expandedYears.has(key)) {
        expandedYears.delete(key);
        render();
      } else {
        if (!loadedYears.has(year)) await loadYear(year);
        expandedYears.add(key);
        render();
      }
      return;
    }

    // 4) 新增年份（寫入 Firebase）
    const addYearBtn = e.target.closest('button[data-action="add-year"]');
    if (addYearBtn) {
      e.stopPropagation();
      const templateId = addYearBtn.dataset.id;
      const t = templates.find((x) => x.id === templateId);
      if (!t) return;

      const input = prompt('請輸入要新增的年份（YYYY）：', String(getCurrentYear()));
      if (!input) return;
      const year = Number(input);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        return alert('年份無效，請輸入 2000-2100 之間的數字。');
      }

      // 若已存在，直接展開
      if (getAddedYears(templateId).includes(year)) {
        expandedYears.add(`${templateId}|${year}`);
        if (!loadedYears.has(year)) await loadYear(year);
        render();
        return;
      }

      // 為該年份建立 12 個月資料
      const targetMonths = getMonthsByCycle(t.cycle || '每月');
      const promises = [];
      for (let m = 1; m <= 12; m++) {
        const monthStr = String(m).padStart(2, '0');
        const isTarget = targetMonths.includes(m);
        promises.push(addFixedExpenseV2(year, monthStr, {
          name: t.name,
          amount: isTarget ? (Number(t.amount) || 0) : 0,
          cycle: t.cycle, note: t.note,
          categoryId: t.categoryId, itemId: t.itemId,
          memberId: t.memberId,
          isSkipped: !isTarget,
        }));
      }
      await Promise.all(promises);

      // 登記年份（寫入 Firebase，監聽器會自動更新 yearStore）
      await addFixedExpenseYear(templateId, year);

      expandedYears.add(`${templateId}|${year}`);
      invalidateYear(year);
      await loadYear(year);
      render();
      showToast(`✅ 已為「${t.name}」新增 ${year} 年度`);
      return;
    }

    // 5) 從檢視移除年份（不刪除資料）
    const removeYearBtn = e.target.closest('button[data-action="remove-year"]');
    if (removeYearBtn) {
      e.stopPropagation();
      const tId = removeYearBtn.dataset.templateId;
      const year = Number(removeYearBtn.dataset.year);
      if (!confirm(`確定要從檢視中移除 ${year} 年嗎？\n（資料仍會保留在資料庫中，之後可再手動加入）`)) return;

      try {
        await removeFixedExpenseYear(tId, year);
        expandedYears.delete(`${tId}|${year}`);
        // 監聽器會自動更新 yearStore 並重新渲染
      } catch (err) {
        alert('移除失敗：' + err.message);
      }
      return;
    }
  });

  /* ============ 輸入變更事件 ============ */
  container.addEventListener('change', async (e) => {
    const el = e.target;
    if (!el.dataset.action) return;

    const year = Number(el.dataset.year);
    const month = el.dataset.month;
    const id = el.dataset.id;
    if (!id) return;

    if (el.dataset.action === 'update-amount') {
      const newAmount = Number(el.value) || 0;
      await updateFixedExpenseV2(year, month, id, { amount: newAmount });
      updateLocalCache(year, month, id, { amount: newAmount });
      updateYearAccordionHeader(el.closest('.year-accordion'));
    } else if (el.dataset.action === 'toggle-paid') {
      const paidDate = el.checked ? new Date().toISOString().slice(0, 10) : '';
      const status = el.checked ? '已付款' : '未付款';
      await updateFixedExpenseV2(year, month, id, { status, paidDate });
      updateLocalCache(year, month, id, { status, paidDate });
      updateYearAccordionHeader(el.closest('.year-accordion'));
    } else if (el.dataset.action === 'toggle-skip') {
      const isSkipped = el.checked;
      await updateFixedExpenseV2(year, month, id, { isSkipped });
      updateLocalCache(year, month, id, { isSkipped });
      const row = el.closest('tr');
      if (row) row.classList.toggle('skip-row', isSkipped);
      updateYearAccordionHeader(el.closest('.year-accordion'));
    }
  });

  /* ============ 內部函式 ============ */
  function renderCategoryOptions() {
    const current = categorySel.value;
    categorySel.innerHTML = `<option value="">— 請選擇類別 —</option>` + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (current) categorySel.value = current;
  }

  function renderItemOptions() {
    const catId = categorySel.value;
    if (!catId) { itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`; return; }
    const filtered = items.filter((i) => i.categoryId === catId);
    itemSel.innerHTML = `<option value="">— 請選擇項目 —</option>` + filtered.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  }

  function updateLocalCache(year, month, id, updates) {
    const y = Number(year);
    const m = String(month).padStart(2, '0');
    if (!yearlyData[y]?.[m]) return;
    const list = yearlyData[y][m];
    const item = list.find((x) => x.id === id);
    if (item) Object.assign(item, updates);
  }

  function updateYearAccordionHeader(accordion) {
    if (!accordion) return;
    const year = Number(accordion.dataset.year);
    const templateId = accordion.dataset.templateId;
    const t = templates.find((x) => x.id === templateId);
    if (!t || !loadedYears.has(year)) return;

    let yearTotal = 0;
    let paidCount = 0;
    let skipCount = 0;
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const list = yearlyData[year]?.[monthStr] || [];
      const item = list.find((x) => x.name === t.name);
      if (item) {
        if (item.isSkipped) skipCount++;
        else {
          yearTotal += Number(item.amount) || 0;
          if (item.status === '已付款') paidCount++;
        }
      }
    }

    const infoEl = accordion.querySelector('.year-info');
    const totalEl = accordion.querySelector('.year-total');
    if (infoEl) infoEl.textContent = `已付款 ${paidCount} 個月${skipCount > 0 ? `・不適用 ${skipCount} 個月` : ''}`;
    if (totalEl) totalEl.textContent = `總金額：${formatHKD(yearTotal)}`;
  }

  /* ============ 渲染 ============ */
  function render() {
    const currentYear = getCurrentYear();
    document.getElementById('fixed-month').textContent = `${currentYear} 年度明細`;

    if (!templates.length) {
      container.innerHTML = `
        <div class="glass-card">
          <div class="empty-state">
            <i data-lucide="file-text" style="width:48px;height:48px;opacity:0.4;"></i>
            <p style="margin-top:12px;">尚無固定支出，點擊「新增固定支出」開始。</p>
          </div>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = templates.map((t) => renderTemplateCard(t, currentYear)).join('');
    if (window.lucide) window.lucide.createIcons();
  }

  function renderTemplateCard(t, currentYear) {
    const member = members.find((m) => m.id === t.memberId);
    const memberName = t.memberId === 'shared' ? '家庭共用支出' : (member ? member.name : '（未指定）');
    const isExpanded = expandedTemplates.has(t.id);
    const addedYears = getAddedYears(t.id);

    let yearAccordions = '';
    if (addedYears.length === 0) {
      yearAccordions = `
        <div class="empty-state" style="padding:16px; font-size:13px;">
          尚未新增任何年份，點擊下方「新增年份」按鈕開始。
        </div>
      `;
    } else {
      for (const y of addedYears) {
        yearAccordions += renderYearAccordion(t, y, currentYear);
      }
    }

    return `
      <div class="glass-card fixed-card" data-template-id="${t.id}">
        <div class="fixed-card-header">
          <div class="fixed-card-toggle" data-action="toggle-template" data-id="${t.id}">
            <i data-lucide="chevron-right" class="accordion-arrow ${isExpanded ? 'rotated' : ''}" style="width:18px;height:18px;"></i>
            <div style="min-width:0;">
              <div class="fixed-card-title">${escapeHtml(t.name)}</div>
              <div class="fixed-card-sub">所屬成員：${escapeHtml(memberName)} · 週期：${escapeHtml(t.cycle || '每月')}${t.note ? ` · ${escapeHtml(t.note)}` : ''}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-danger" data-action="delete-template" data-id="${t.id}" data-name="${escapeHtml(t.name)}">刪除支出</button>
        </div>
        <div class="fixed-card-body" style="display:${isExpanded ? 'block' : 'none'};">
          ${yearAccordions}
          <button class="btn btn-sm btn-primary add-year-btn" data-action="add-year" data-id="${t.id}" style="margin-top:8px;">
            <i data-lucide="plus" style="width:14px;height:14px;"></i> 新增年份
          </button>
        </div>
      </div>
    `;
  }

  function renderYearAccordion(t, year, currentYear) {
    const yearNum = Number(year);
    const key = `${t.id}|${yearNum}`;
    const isYearExpanded = expandedYears.has(key);
    const isYearLoaded = loadedYears.has(yearNum);
    const isCurrentYear = yearNum === currentYear;

    let yearTotal = 0;
    let paidCount = 0;
    let skipCount = 0;
    if (isYearLoaded) {
      for (let m = 1; m <= 12; m++) {
        const monthStr = String(m).padStart(2, '0');
        const list = yearlyData[yearNum]?.[monthStr] || [];
        const item = list.find((x) => x.name === t.name);
        if (item) {
          if (item.isSkipped) skipCount++;
          else {
            yearTotal += Number(item.amount) || 0;
            if (item.status === '已付款') paidCount++;
          }
        }
      }
    }

    const yearLabel = isCurrentYear
      ? `<span style="font-weight:700;">${yearNum} 年</span> <span class="badge badge-info" style="font-size:10px; margin-left:4px;">當前</span>`
      : `<span style="font-weight:600;">${yearNum} 年</span>`;

    const infoText = isYearLoaded
      ? `<span class="year-info" style="font-size:12px; color:var(--text-muted);">已付款 ${paidCount} 個月${skipCount > 0 ? `・不適用 ${skipCount} 個月` : ''}</span>`
      : `<span class="year-info" style="font-size:12px; color:var(--text-muted);">載入中…</span>`;

    return `
      <div class="year-accordion" data-template-id="${t.id}" data-year="${yearNum}">
        <div class="year-accordion-header" data-action="toggle-year" data-template-id="${t.id}" data-year="${yearNum}">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <i data-lucide="chevron-right" class="accordion-arrow ${isYearExpanded ? 'rotated' : ''}" style="width:16px;height:16px;"></i>
            ${yearLabel}
            ${infoText}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="year-total" style="font-size:12px; color:var(--neon-emerald);">總金額：${formatHKD(yearTotal)}</span>
            <button class="btn btn-sm btn-ghost" data-action="remove-year" data-template-id="${t.id}" data-year="${yearNum}" title="從檢視中移除（不刪除資料）" style="padding:2px 6px;">
              <i data-lucide="x" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </div>
        <div class="year-accordion-body" style="display:${isYearExpanded ? 'block' : 'none'};">
          ${isYearExpanded ? (isYearLoaded ? renderYearMonths(t, yearNum) : '<div style="padding:12px; text-align:center; color:var(--text-muted);">載入中…</div>') : ''}
        </div>
      </div>
    `;
  }

  function renderYearMonths(t, year) {
    const yearNum = Number(year);
    let rows = '';
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const list = yearlyData[yearNum]?.[monthStr] || [];
      const item = list.find((x) => x.name === t.name);
      const isPaid = item?.status === '已付款';
      const isSkipped = item?.isSkipped || false;
      const amount = item?.amount || 0;

      rows += `
        <tr class="${isSkipped ? 'skip-row' : ''}">
          <td class="month-label">${m} 月</td>
          <td class="num"><input type="number" data-action="update-amount" data-year="${yearNum}" data-month="${monthStr}" data-id="${item?.id || ''}" value="${amount}" min="0" step="0.01" ${!item ? 'disabled' : ''}></td>
          <td style="text-align:center;"><input type="checkbox" data-action="toggle-paid" data-year="${yearNum}" data-month="${monthStr}" data-id="${item?.id || ''}" ${isPaid ? 'checked' : ''} ${!item ? 'disabled' : ''} style="width:auto;"></td>
          <td style="text-align:center;"><input type="checkbox" data-action="toggle-skip" data-year="${yearNum}" data-month="${monthStr}" data-id="${item?.id || ''}" ${isSkipped ? 'checked' : ''} ${!item ? 'disabled' : ''} style="width:auto;"></td>
        </tr>
      `;
    }

    return `
      <table class="fixed-table">
        <thead>
          <tr>
            <th>月份</th>
            <th style="text-align:right;">金額</th>
            <th style="text-align:center;">已付款</th>
            <th style="text-align:center;">不適用</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
}

/* ============ 年份資料載入 ============ */
async function loadYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return;
  if (loadedYears.has(y)) return;

  const promises = [];
  for (let m = 1; m <= 12; m++) {
    promises.push(getFixedExpensesOnce(y, String(m).padStart(2, '0')));
  }
  const results = await Promise.all(promises);
  yearlyData[y] = {};
  results.forEach((list, i) => {
    yearlyData[y][String(i + 1).padStart(2, '0')] = list || [];
  });
  loadedYears.add(y);
}

/* 載入所有已新增年份的資料（由 yearStore 決定） */
async function loadAllAddedYears() {
  const yearsToLoad = new Set();
  for (const tId of Object.keys(yearStore)) {
    for (const y of yearStore[tId] || []) {
      if (!loadedYears.has(y)) yearsToLoad.add(y);
    }
  }
  if (yearsToLoad.size > 0) {
    await Promise.all([...yearsToLoad].map((y) => loadYear(y)));
  }
}

function invalidateYear(year) {
  const y = Number(year);
  loadedYears.delete(y);
  delete yearlyData[y];
}

function getMonthsByCycle(cycle) {
  switch (cycle) {
    case '每月': return [1,2,3,4,5,6,7,8,9,10,11,12];
    case '每2個月': return [1,3,5,7,9,11];
    case '每季': return [1,4,7,10];
    case '每年': return [1];
    case '一次性': return [1];
    default: return [1,2,3,4,5,6,7,8,9,10,11,12];
  }
}

function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.4);z-index:99999;opacity:0;transition:opacity 0.3s;`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
