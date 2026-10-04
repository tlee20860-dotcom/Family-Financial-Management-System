// ============================================
// state.js — 全域狀態中心（含持久化）
// ============================================

export const AppState = {
  year: '',
  month: '',
  user: null,
  _listeners: {},

  /**
   * 初始化：讀取 localStorage，若無則使用當前日期
   * 月份預設為 'all'（全年）
   */
  init() {
    const savedYear = localStorage.getItem('fin_year');
    const savedMonth = localStorage.getItem('fin_month');

    if (savedYear) {
      this.year = savedYear;
    } else {
      const d = new Date();
      this.year = String(d.getFullYear());
    }

    if (savedMonth) {
      this.month = savedMonth;
    } else {
      this.month = 'all'; // 預設全年
    }
  },

  /**
   * 設定當前年月（支援 'all'）
   */
  setYearMonth(year, month) {
    this.year = String(year);
    this.month = String(month); // 可以是 '01' ~ '12' 或 'all'
    localStorage.setItem('fin_year', this.year);
    localStorage.setItem('fin_month', this.month);
    this.emit('ym-change', { year: this.year, month: this.month });
  },

  setUser(user) {
    this.user = user;
    this.emit('user-change', user);
  },

  getYearMonth() {
    return { year: this.year, month: this.month };
  },

  isAnnualMode() {
    return this.month === 'all';
  },

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
