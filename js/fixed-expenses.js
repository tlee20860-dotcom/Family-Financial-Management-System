// ============================================
// fixed-expenses.js — 家庭固定支出（年度化輸入 + 所屬成員）
// ============================================

import {
  listenFixedTemplates, addFixedTemplate,
  deleteFixedTemplateAndMonths,
  listenFixedExpensesV2, addFixedExpenseV2, updateFixedExpenseV2,
  getFixedExpensesOnce,
  listenCategories, listenItems, addItem,
  listenMembers,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { AppState } from './state.js';

let templates = [];
let monthlyData = {};
let categories = [];
let items = [];
let members = [];

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

  listenMembers((list) => {
    members = list;
    const current = memberSel.value;
    memberSel.innerHTML = `<option value="shared">家庭共用支出</option>` +
      members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (current) memberSel.value = current;
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
      setTimeout(() => { const newItem = items.find((i) => i.name === name.trim() && i.categoryId === catId); if (newItem) itemSel.value = newItem.id; }, 500);
    } catch (err) { alert('新增項目失敗：' + err.message); }
  });

  listenFixedTemplates(async (list) => {
    templates = list;
    await loadYearData();
    render();
  });

  document.getElementById('add-fixed-btn').addEventListener('click', () => {
    form.reset();
    memberSel.value = 'shared';
    categorySel.value = '';
    itemSel.innerHTML = `<option value="">— 請先選擇類別 —</option>`;
    modal.classList.add('active');
  });

  document.getElementById('fixed-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const memberId = memberSel.value;
    const catId = categorySel.value;
    const itemId = itemSel.value;
    const itemName = items.find((i) => i.id === itemId)?.name || '';
    const amount = Number(amountInput.value) || 0;
    const cycle = cycleSelect.value;
    const note = noteInput.value.trim();

    if (!itemName || !amount) return;

    // 1. 寫入模板（記錄所屬成員）
    await addFixedTemplate({
      name: itemName, categoryId: catId, itemId: itemId,
      amount: amount, cycle: cycle, note: note,
      memberId: memberId, // 'shared' 或成員 ID
    });

    // 2. 分配到 12 個月
    const targetMonths = getMonthsByCycle(cycle);
    const year = AppState.year;

    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const isTarget = targetMonths.includes(m);
      promises.push(addFixedExpenseV2(year, monthStr, {
        name: itemName, amount: isTarget ? amount : 0,
        cycle: cycle, note: note,
        categoryId: catId, itemId: itemId,
        memberId: memberId,
        isSkipped: !isTarget,
      }));
    }
    await Promise.all(promises);
    await loadYearData();
    render();

    modal.classList.remove('active');
    showToast(`✅ 已新增「${itemName}」並分配到 ${targetMonths.length} 個月份`);
  });

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const templateId = btn.dataset.id;
    const templateName = btn.dataset.name;

    if (btn.dataset.action === 'delete-template') {
      if (confirm(`⚠️ 確定要刪除「${templateName}」嗎？\n\n這將會刪除該支出在所有月份的紀錄，此操作無法復原。`)) {
        try {
          await deleteFixedTemplateAndMonths(templateId, templateName);
          alert('✅ 已徹底刪除');
        } catch (err) {
          alert('刪除失敗：' + err.message);
        }
      }
    }
  });

  container.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.action === 'update-amount') {
      await updateFixedExpenseV2(AppState.year, el.dataset.month, el.dataset.id, { amount: Number(el.value) || 0 });
    } else if (el.dataset.action === 'toggle-paid') {
      await updateFixedExpenseV2(AppState.year, el.dataset.month, el.dataset.id, {
        status: el.checked ? '已付款' : '未付款',
        paidDate: el.checked ? new Date().toISOString().slice(0, 10) : '',
      });
    } else if (el.dataset.action === 'toggle-skip') {
      await updateFixedExpenseV2(AppState.year, el.dataset.month, el.dataset.id, { isSkipped: el.checked });
    }
  });

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

  async function loadYearData() {
    monthlyData = {};
    const year = AppState.year;
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      promises.push(getFixedExpensesOnce(year, String(m).padStart(2, '0')));
    }
    const results = await Promise.all(promises);
    results.forEach((list, i) => { monthlyData[String(i + 1).padStart(2, '0')] = list; });
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

  function render() {
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

    const year = AppState.year;
    document.getElementById('fixed-month').textContent = `${year} 年度明細`;

    container.innerHTML = templates.map((t) => {
      const member = members.find((m) => m.id === t.memberId);
      const memberName = t.memberId === 'shared' ? '家庭共用支出' : (member ? member.name : '（未指定）');

      const rows = [];
      for (let m = 1; m <= 12; m++) {
        const monthStr = String(m).padStart(2, '0');
        const list = monthlyData[monthStr] || [];
        const item = list.find((x) => x.name === t.name);
        const isPaid = item?.status === '已付款';
        const isSkipped = item?.isSkipped || false;
        const amount = item?.amount || 0;

        rows.push(`
          <tr class="${isSkipped ? 'skip-row' : ''}">
            <td class="month-label">${m} 月</td>
            <td class="num"><input type="number" data-action="update-amount" data-month="${monthStr}" data-id="${item?.id || ''}" value="${amount}" min="0" step="0.01" ${!item ? 'disabled' : ''}></td>
            <td style="text-align:center;"><input type="checkbox" data-action="toggle-paid" data-month="${monthStr}" data-id="${item?.id || ''}" ${isPaid ? 'checked' : ''} ${!item ? 'disabled' : ''} style="width:auto;"></td>
            <td style="text-align:center;"><input type="checkbox" data-action="toggle-skip" data-month="${monthStr}" data-id="${item?.id || ''}" ${isSkipped ? 'checked' : ''} ${!item ? 'disabled' : ''} style="width:auto;"></td>
          </tr>
        `);
      }

      return `
        <div class="glass-card fixed-card">
          <div class="fixed-card-header">
            <div>
              <div class="fixed-card-title">${escapeHtml(t.name)}</div>
              <div class="fixed-card-sub">所屬成員：${escapeHtml(memberName)} · 週期：${escapeHtml(t.cycle || '每月')} ${t.note ? `· ${escapeHtml(t.note)}` : ''}</div>
            </div>
            <button class="btn btn-sm btn-danger" data-action="delete-template" data-id="${t.id}" data-name="${escapeHtml(t.name)}">刪除支出</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="fixed-table">
              <thead>
                <tr>
                  <th>月份</th>
                  <th style="text-align:right;">金額</th>
                  <th style="text-align:center;">已付款</th>
                  <th style="text-align:center;">不適用</th>
                </tr>
              </thead>
              <tbody>${rows.join('')}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
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
  toast.textContent = msg; toast.style.opacity = '1'; setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
