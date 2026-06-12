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
  }
};
