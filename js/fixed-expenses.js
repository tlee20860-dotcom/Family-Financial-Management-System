// ============================================
// fixed-expenses.js — 家庭固定支出（含支付方式）
// ============================================

import {
  listenFixedTemplates, addFixedTemplate, deleteFixedTemplateAndMonths,
  listenFixedExpensesV2, addFixedExpenseV2, updateFixedExpenseV2,
  getFixedExpensesOnce,
  listenCategories, listenItems, addItem,
  listenMembers, listenPaymentMethods,
} from './db.js';
import { formatHKD, escapeHtml } from './utils.js';
import { renderPageFilter } from './page-filter.js';
import { showToast } from './toast.js';
import { AppState } from './state.js';

let templates = [];
let monthlyData = {};
let categories = [];
let items = [];
let members = [];
let payments = [];
let currentView = localStorage.getItem('fixed_view') || 'card';
let expandedKeys = new Set();

export function initFixedExpensesPage() {
  renderPageFilter({
    containerId: 'page-filter-root',
    fields: ['year'],
    onChange: async () => {
      await loadYearData();
      render();
    },
  });

  const container = document.getElementById('fixed-templates-container');
  const modal = document.getElementById('fixed-modal');
  const form = document.getElementById('fixed-form');
  const memberSel = document.getElementById('fixed-member');
  const categorySel = document.getElementById('fixed-category');
  const itemSel = document.getElementById('fixed-item');
  const cycleSelect = document.getElementById('fixed-cycle');
  const amountInput = document.getElementById('fixed-amount');
  const noteInput = document.getElementById('fixed-note');
  const paymentSel = document.getElementById('fixed-payment');
  const addItemBtn = document.getElementById('add-fixed-item-btn');

  bindViewToggle();

  listenMembers((list) => {
    members = list;
    const cur = memberSel.value;
    memberSel.innerHTML = `<option value="shared">家庭共用支出</option>` + members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (cur) memberSel.value = cur;
  });

  listenCategories((cats) => { categories = cats; renderCategoryOptions(); });
  listenItems((list) => { items = list; renderItemOptions(); });

  listenPaymentMethods((list) => {
    payments = list;
    if (paymentSel) {
      const cur = paymentSel.value;
      paymentSel.innerHTML = `<option value="">— 請選擇 —</option>` + payments.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
      if (cur) paymentSel.value = cur;
    }
  });

  categorySel.addEventListener('change', renderItemOptions);

  addItemBtn.addEventListener('click', async () => {
    const catId = categorySel.value;
    if (!catId) return alert('請先選擇一個類別，再新增項目。');
    const name = prompt('請輸入新項目名稱：');
    if (!name || !name.trim()) return;
    try {
      await addItem({ name: name.trim(), categoryId: catId });
      setTimeout(() => {
        const newItem = items.find((i) => i.name === name.trim() && i.categoryId === catId);
        if (newItem) itemSel.value = newItem.id;
      }, 500);
    } catch (err) {
      alert('新增項目失敗：' + err.message);
    }
  });

  listenFixedTemplates(async (list) => {
    templates = list;
    await loadYearData();
    render();
  });

  AppState.on('ym-change', async () => {
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
    const amount = Math.round(Number(amountInput.value) || 0);
    const cycle = cycleSelect.value;
    const note = noteInput.value.trim();
    const paymentMethodId = paymentSel ? paymentSel.value : '';
    if (!itemName || !amount) return;

    await addFixedTemplate({
      name: itemName, categoryId: catId, itemId: itemId,
      amount: amount, cycle: cycle, note: note, memberId: memberId,
      paymentMethodId: paymentMethodId,
    });

    const targetMonths = getMonthsByCycle(cycle);
    const year = AppState.year;
    const promises = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const isTarget = targetMonths.includes(m);
      promises.push(addFixedExpenseV2(year, monthStr, {
        name: itemName, amount: isTarget ? amount : 0, cycle: cycle, note: note,
        categoryId: catId, itemId: itemId, memberId: memberId, isSkipped: !isTarget,
        paymentMethodId: paymentMethodId,
      }));
    }
    await Promise.all(promises);
    await loadYearData();
    render();

    modal.classList.remove('active');
    showToast(`✅ 已新增「${itemName}」並分配到 ${targetMonths.length} 個月份`, 'success');
  });

  container.addEventListener('click', async (e) => {
    const yearHeader = e.target.closest('.fixed-year-header');
    if (yearHeader) {
      const key = yearHeader.dataset.toggleKey;
      if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key);
      render();
      return;
    }

    const expandBtn = e.target.closest('.fixed-expand-btn');
    if (expandBtn) {
      const key = expandBtn.dataset.toggleKey;
      if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key);
      render();
      return;
    }

    const delBtn = e.target.closest('button[data-action="delete-template"]');
    if (delBtn) {
      const id = delBtn.dataset.id;
      const name = delBtn.dataset.name;
      if (confirm(`⚠️ 確定要刪除「${name}」嗎？\n\n這將會刪除該支出在所有月份的紀錄，此操作無法復原。`)) {
        try { await deleteFixedTemplateAndMonths(id, name); alert('✅ 已徹底刪除'); } catch (err) { alert('刪除失敗：' + err.message); }
      }
      return;
    }

    const saveBtn = e.target.closest('button[data-action="save-template"]');
    if (saveBtn) {
      const name = saveBtn.dataset.name;
      await saveTemplateDetails(name);
      return;
    }
  });

  container.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.action === 'update-amount') {
      await updateFixedExpenseV2(el.dataset.year, el.dataset.month, el.dataset.id, { amount: Math.round(Number(el.value) || 0) });
    } else if (el.dataset.action === 'toggle-paid') {
      await updateFixedExpenseV2(el.dataset.year, el.dataset.month, el.dataset.id, {
        status: el.checked ? '已付款' : '未付款',
        paidDate: el.checked ? new Date().toISOString().slice(0, 10) : '',
      });
    } else if (el.dataset.action === 'toggle-skip') {
      await updateFixedExpenseV2(el.dataset.year, el.dataset.month, el.dataset.id, { isSkipped: el.checked });
    }
  });

  function renderCategoryOptions() {
    const cur = categorySel.value;
    categorySel.innerHTML = `<option value="">— 請選擇類別 —</option>` + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (cur) categorySel.value = cur;
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
    for (let m = 1; m <= 12; m++) promises.push(getFixedExpensesOnce(year, String(m).padStart(2, '0')));
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

  function renderTemplateDetail(t) {
    const year = AppState.year;
    const rows = [];
    let totalPaid = 0;

    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const list = monthlyData[monthStr] || [];
      const item = list.find((x) => x.name === t.name);
      if (!item) continue;
      const isPaid = item.status === '已付款';
      const isSkipped = item.isSkipped;
      const amount = item.amount || 0;
      if (isPaid && !isSkipped) totalPaid += amount;

      rows.push(`
        <div class="fixed-month-row">
          <div class="fix-month-label">${m}月</div>
          <input type="number" class="input fix-amount" data-action="update-amount" data-year="${year}" data-month="${monthStr}" data-id="${item.id}" value="${amount}" min="0" step="1">
          <label class="fix-checkbox-label">
            <input type="checkbox" data-action="toggle-paid" data-year="${year}" data-month="${monthStr}" data-id="${item.id}" ${isPaid ? 'checked' : ''}> 已付款
          </label>
          <label class="fix-checkbox-label">
            <input type="checkbox" data-action="toggle-skip" data-year="${year}" data-month="${monthStr}" data-id="${item.id}" ${isSkipped ? 'checked' : ''}> 不適用
          </label>
        </div>
      `);
    }

    if (rows.length === 0) return '<div class="empty-state" style="padding:12px;">本年度無資料</div>';

    const key = `fixed-${t.id}-${year}`;
    const isOpen = expandedKeys.has(key);

    return `
      <div class="fixed-year-block" style="margin-bottom:8px; border:1px solid rgba(255,255,255,0.05); border-radius:var(--radius-sm); overflow:hidden;">
        <div class="fixed-year-header" data-toggle-key="${key}" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(0,240,255,0.04); cursor:pointer; user-select:none;">
          <span style="font-size:13px; font-weight:600; color:var(--neon-cyan);">${year} 年度</span>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="mono" style="font-size:11px; color:var(--text-muted);">已付款：${formatHKD(totalPaid)}</span>
            <i data-lucide="${isOpen ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;color:var(--text-muted);"></i>
          </div>
        </div>
        <div style="display:${isOpen ? 'block' : 'none'}; padding:8px 12px;">
          ${rows.join('')}
        </div>
      </div>
    `;
  }

  function renderCard(t) {
    const member = members.find((m) => m.id === t.memberId);
    const memberName = t.memberId === 'shared' ? '家庭共用支出' : (member ? member.name : '（未指定）');
    const pm = payments.find((p) => p.id === t.paymentMethodId);
    const pmName = pm ? pm.name : '';
    const key = `card-${t.id}`;
    const isExpanded = expandedKeys.has(key);

    return `
      <div class="glass-card fixed-card" style="margin-bottom:16px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <div>
            <div style="font-size:15px; font-weight:700; color:var(--neon-cyan);">${escapeHtml(t.name)}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
              所屬成員：${escapeHtml(memberName)} · 週期：${escapeHtml(t.cycle || '每月')}
              ${pmName ? ` · 支付：${escapeHtml(pmName)}` : ''}
              ${t.note ? ` · ${escapeHtml(t.note)}` : ''}
            </div>
          </div>
          <button class="btn btn-sm btn-danger" data-action="delete-template" data-id="${t.id}" data-name="${escapeHtml(t.name)}">刪除支出</button>
        </div>
        <button class="btn btn-sm btn-ghost fixed-expand-btn" data-toggle-key="${key}" style="width:100%; justify-content:space-between;">
          <span>${isExpanded ? '收起明細' : '展開明細'}</span>
          <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;"></i>
        </button>
        <div style="display:${isExpanded ? 'block' : 'none'}; margin-top:10px;">
          ${renderTemplateDetail(t)}
          <div style="margin-top:10px; text-align:right;">
            <button class="btn btn-sm btn-primary" data-action="save-template" data-name="${escapeHtml(t.name)}">儲存明細</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTable(template) {
    const key = `table-${template.id}`;
    const isExpanded = expandedKeys.has(key);
    const member = members.find((m) => m.id === template.memberId);
    const memberName = template.memberId === 'shared' ? '家庭共用支出' : (member ? member.name : '（未指定）');
    const pm = payments.find((p) => p.id === template.paymentMethodId);
    const pmName = pm ? pm.name : '—';

    return `
      <tr>
        <td><button class="btn btn-sm btn-ghost fixed-expand-btn" data-toggle-key="${key}" style="padding:2px 6px;"><i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;"></i></button></td>
        <td>${escapeHtml(template.name)}</td>
        <td>${escapeHtml(memberName)}</td>
        <td>${escapeHtml(template.cycle || '每月')}</td>
        <td style="font-size:11px; color:var(--text-muted);">${escapeHtml(pmName)}</td>
        <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(template.note || '—')}</td>
        <td>
          <button class="btn btn-sm btn-ghost" data-action="save-template" data-name="${escapeHtml(template.name)}">儲存</button>
          <button class="btn btn-sm btn-danger" data-action="delete-template" data-id="${template.id}" data-name="${escapeHtml(template.name)}">刪除</button>
        </td>
      </tr>
      <tr style="display:${isExpanded ? 'table-row' : 'none'};">
        <td colspan="7" style="padding:12px;">${renderTemplateDetail(template)}</td>
      </tr>
    `;
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

    if (currentView === 'card') {
      container.innerHTML = templates.map((t) => renderCard(t)).join('');
    } else {
      container.innerHTML = `
        <div class="glass-card" style="padding:0; overflow:hidden;">
          <div style="overflow-x:auto;">
            <table class="policy-table">
              <thead>
                <tr>
                  <th style="width:40px;"></th>
                  <th>項目名稱</th>
                  <th>所屬成員</th>
                  <th>週期</th>
                  <th>支付方式</th>
                  <th>備註</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>${templates.map((t) => renderTable(t)).join('')}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async function saveTemplateDetails(templateName) {
    const allRows = document.querySelectorAll(`.fixed-month-row`);
    const updates = [];
    allRows.forEach((row) => {
      const input = row.querySelector('input[data-action="update-amount"]');
      const paidCb = row.querySelector('input[data-action="toggle-paid"]');
      const skipCb = row.querySelector('input[data-action="toggle-skip"]');
      if (!input) return;
      updates.push(updateFixedExpenseV2(input.dataset.year, input.dataset.month, input.dataset.id, {
        amount: Math.round(Number(input.value) || 0),
        status: paidCb?.checked ? '已付款' : '未付款',
        paidDate: paidCb?.checked ? new Date().toISOString().slice(0, 10) : '',
        isSkipped: skipCb?.checked || false,
      }));
    });
    await Promise.all(updates);
    alert('✅ 明細已儲存');
  }

  function bindViewToggle() {
    const cardBtn = document.getElementById('view-card-btn');
    const tableBtn = document.getElementById('view-table-btn');
    const updateUI = () => {
      if (currentView === 'card') {
        cardBtn.classList.add('btn-primary'); cardBtn.classList.remove('btn-ghost');
        tableBtn.classList.add('btn-ghost'); tableBtn.classList.remove('btn-primary');
      } else {
        cardBtn.classList.add('btn-ghost'); cardBtn.classList.remove('btn-primary');
        tableBtn.classList.add('btn-primary'); tableBtn.classList.remove('btn-ghost');
      }
    };
    cardBtn.addEventListener('click', () => { currentView = 'card'; localStorage.setItem('fixed_view', 'card'); updateUI(); render(); });
    tableBtn.addEventListener('click', () => { currentView = 'table'; localStorage.setItem('fixed_view', 'table'); updateUI(); render(); });
    updateUI();
  }
}
