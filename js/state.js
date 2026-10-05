// ============================================
// state.js — 全域狀態中心（多家庭版）
// ============================================

export const AppState = {
  // ---------- 使用者 ----------
  currentUser: null,
  isSuperAdmin: false,

  // ---------- 家庭 ----------
  currentFamilyId: '',
  currentFamilyName: '',

  // ---------- 年月 ----------
  year: '',
  month: '',

  // ---------- 事件總線 ----------
  _listeners: {},
  _initialized: false,   // 🆕 防止重複初始化

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const savedYear = localStorage.getItem('fin_year');
    const savedMonth = localStorage.getItem('fin_month');
    const savedFamilyId = localStorage.getItem('fin_family_id');
    const savedFamilyName = localStorage.getItem('fin_family_name');

    if (savedYear) {
      this.year = savedYear;
    } else {
      const d = new Date();
      this.year = String(d.getFullYear());
    }

    if (savedMonth) {
      this.month = savedMonth;
    } else {
      this.month = 'all';
    }

    if (savedFamilyId) {
      this.currentFamilyId = savedFamilyId;
      this.currentFamilyName = savedFamilyName || '';
    }
  },

  /* ---------- 使用者 ---------- */
  setUser(user) {
    this.currentUser = user;
    this.emit('user-change', user);
  },

  setSuperAdmin(isSuper) {
    this.isSuperAdmin = !!isSuper;
    this.emit('superadmin-change', this.isSuperAdmin);
  },

  /* ---------- 家庭 ---------- */
  setFamily(familyId, familyName) {
    this.currentFamilyId = familyId || '';
    this.currentFamilyName = familyName || '';
    localStorage.setItem('fin_family_id', this.currentFamilyId);
    localStorage.setItem('fin_family_name', this.currentFamilyName);
    this.emit('family-change', { familyId: this.currentFamilyId, familyName: this.currentFamilyName });
  },

  getFamilyId() {
    return this.currentFamilyId;
  },

  getFamilyName() {
    return this.currentFamilyName;
  },

  clearFamily() {
    this.currentFamilyId = '';
    this.currentFamilyName = '';
    localStorage.removeItem('fin_family_id');
    localStorage.removeItem('fin_family_name');
  },

  /* ---------- 年月 ---------- */
  setYearMonth(year, month) {
    this.year = String(year);
    this.month = String(month);
    localStorage.setItem('fin_year', this.year);
    localStorage.setItem('fin_month', this.month);
    this.emit('ym-change', { year: this.year, month: this.month });
  },

  getYearMonth() {
    return { year: this.year, month: this.month };
  },

  isAnnualMode() {
    return this.month === 'all';
  },

  /* ---------- 事件總線 ---------- */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  },

  emit(event, data) {
    (this._listeners[event] || []).forEach((cb) => {
      try { cb(data); } catch (err) { console.error(`[AppState] 事件 ${event} 回呼失敗：`, err); }
    });
  },
};
