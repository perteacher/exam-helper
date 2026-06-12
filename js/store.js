// store.js — localStorage 관리
const Store = {
  KEYS: {
    apiKey: "eh_api_key",
    model: "eh_model",
    selectedUnit: "eh_selected_unit",
    userGuidelines: "eh_user_guidelines", // M4에서 CRUD
    history: "eh_history" // M2에서 생성 이력 (최근 50개)
  },

  getApiKey() { return localStorage.getItem(this.KEYS.apiKey) || ""; },
  setApiKey(key) { localStorage.setItem(this.KEYS.apiKey, key); },

  getModel() { return localStorage.getItem(this.KEYS.model) || ""; },
  setModel(model) { localStorage.setItem(this.KEYS.model, model); },

  getSelectedUnit() { return localStorage.getItem(this.KEYS.selectedUnit) || ""; },
  setSelectedUnit(id) { localStorage.setItem(this.KEYS.selectedUnit, id); },

  getUserGuidelines() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.userGuidelines)) || [];
    } catch {
      return [];
    }
  },

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.history)) || [];
    } catch {
      return [];
    }
  },

  // 생성 이력 저장 (최근 50개 유지, 오래된 것부터 제거). 추가한 항목 반환.
  addHistory(entry) {
    const item = { id: Date.now(), ...entry };
    const list = this.getHistory();
    list.unshift(item);
    const trimmed = list.slice(0, 50);
    localStorage.setItem(this.KEYS.history, JSON.stringify(trimmed));
    return item;
  }
};
