// ============================================
// state.js — 全域狀態中心
// ============================================

export const AppState = {
  // ---------- 狀態資料 ----------
  year: '',
  month: '',
  user: null,

  // ---------- 事件總線 ----------
  _listeners: {},

  /**
   * 初始化：根據當前日期設定 year / month
   */
  init() {
    const d = new Date();
    this.year = String(d.getFullYear());
    this.month = String(d.getMonth() + 1).padStart(2, '0');
  },

  /**
   * 設定當前年月（未來給年月選擇器使用）
   */
  setYearMonth(year, month) {
    this.year = String(year);
    this.month = String(month).padStart(2, '0');
    this.emit('ym-change', { year: this.year, month: this.month });
  },

  /**
   * 設定當前登入者
   */
  setUser(user) {
    this.user = user;
    this.emit('user-change', user);
  },

  /**
   * 取得當前年月物件
   */
  getYearMonth() {
    return { year: this.year, month: this.month };
  },

  /**
   * 註冊事件監聽
   */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  },

  /**
   * 觸發事件
   */
  emit(event, data) {
    (this._listeners[event] || []).forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[AppState] 事件 ${event} 回呼失敗：`, err);
      }
    });
  },
};
